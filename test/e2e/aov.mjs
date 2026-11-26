/**
 * Render passes, measured on real pixels.
 *
 * `test/core/aov.test.mjs` proves the arithmetic: that a packed depth byte
 * quartet decodes to the distance it was made from, that a matte colour is
 * deterministic, that a normal comes back unit-length. None of that proves
 * the two things that matter:
 *
 *   1. that the RENDERER writes what the decoder expects -- the packing
 *      convention, the channel order, the colour space, the sign of the
 *      normal, and the absence of tone mapping on data;
 *   2. that a matte colour survives the trip through a render target at all,
 *      rather than arriving as a near-miss that no manifest will match.
 *
 * Both are exactly the kind of thing this repo has shipped broken before:
 * `ssao` ran for five phases comparing metres against a normalised depth, and
 * `envMapIntensity` was written to an object that does not have it. A pass
 * that renders, costs its frames and means nothing looks identical to a pass
 * that works.
 *
 * So the film below puts a 2 m cube dead in front of the camera at a distance
 * nobody has to measure -- camera at z = 12, front face at z = 1, so the
 * centre pixel is 11.000 m away -- and every number here is checked against
 * that, to within the pass's own quantisation step.
 */
import puppeteer from 'puppeteer-core';
import { startGuard, closeBrowser } from './lib/guard.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { acquireLock } from '../../scripts/lib/render-lock.mjs';
import { unpackDepth, depthToDistance, depthQuantum, decodeNormal,
         objectColor, matteCoverage } from '../../src/core/render/aov.js';

const CHROME = process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('../..', import.meta.url).pathname;
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
            '.json': 'application/json', '.png': 'image/png', '.wav': 'audio/wav' };

const srv = createServer(async (q, r) => {
    try {
        const f = join(ROOT, normalize(new URL(q.url, 'http://x').pathname));
        const b = await readFile(f);
        r.writeHead(200, { 'content-type': T[extname(f)] ?? 'application/octet-stream' });
        r.end(b);
    } catch { if (!r.headersSent) r.writeHead(404); r.end(); }
});
await new Promise((r) => srv.listen(0, r));
const base = `http://127.0.0.1:${srv.address().port}`;

const W = 320, H = 180, FOV = 38, DIST = 11;

const film = {
    version: 'jirex.film3d/1',
    meta: { title: 'aov', fps: 24, width: W, height: H, background: '#102030' },
    materials: { pale: { color: '#c0c0c0', roughness: 0.5, metalness: 0 } },
    lights: [{ id: 'amb', type: 'ambient', color: '#ffffff', intensity: 1 }],
    assemblies: {
        block: { parts: [{ id: 'face',
                           geometry: { kind: 'cube', width: 2, height: 2, depth: 2 },
                           material: 'pale' }] },
    },
    cast: [{ assembly: 'block', as: 'box', at: [0, 0, 0], set: true }],
    scenes: [{
        id: 's1',
        shots: [{ id: 'a', duration: 2,
                  camera: { from: { at: [0, 0, 12], look: [0, 0, 0], fov: FOV },
                            for: 0 } }],
    }],
};

/** Dead centre, and a corner with nothing in it. */
const PROBE = [[W / 2, H / 2], [4, 4]];

await acquireLock('the AOV probe');
const br = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=metal'],
    protocolTimeout: 600_000,
});
const guard = startGuard({ ms: 600_000, name: 'test:aov' });
guard.onCleanup(() => closeBrowser(br));
guard.onCleanup(() => srv.close());
const pg = await br.newPage();
const pageErrors = [];
pg.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));
await pg.goto(`${base}/film3d.html`, { waitUntil: 'load', timeout: 120_000 });
await pg.waitForFunction(() => typeof window.render3d === 'function', { timeout: 30_000 });

const res = await pg.evaluate((f, probe) => window.render3d(f, {
    width: 320, height: 180, silent: true,
    aov: { kinds: ['depth', 'normal', 'object'], at: [1], probe, raw: true },
}), film, PROBE);


await guard.done();

const fails = [];
const ok = (cond, line) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${line}`); if (!cond) fails.push(line); };

if (pageErrors.length) fails.push(`page errors: ${pageErrors.join(' | ')}`);
if (!res?.probes?.length) {
    console.error('no probes came back');
    process.exit(1);
}

const cam = res.camera;
const at = (kind) => res.probes.find((p) => p.kind === kind).px;
console.log(`\ncamera: near ${cam.near} far ${cam.far}${cam.ortho ? ' ortho' : ''}`);

// ------------------------------------------------------------------- depth
{
    const [centre, corner] = at('depth');
    const d = depthToDistance(unpackDepth(centre), cam);
    const q = depthQuantum(DIST, cam);
    const err = Math.abs(d - DIST);
    console.log(`\ndepth: centre bytes [${centre}] -> ${d.toFixed(6)} m `
        + `(want ${DIST}, err ${err.toExponential(2)} m, quantum ${q.toExponential(2)} m)`);
    ok(err < q * 2, `the depth pass reconstructs 11 m to within two quantisation steps`);
    const far = depthToDistance(unpackDepth(corner), cam);
    console.log(`  corner bytes [${corner}] -> ${far.toFixed(1)} m (want the far plane, ${cam.far})`);
    ok(far > cam.far * 0.99, 'an empty pixel reads as the far plane, not as the lens');
}

// ------------------------------------------------------------------ normal
{
    const [centre, corner] = at('normal');
    const n = decodeNormal(centre);
    console.log(`\nnormal: centre bytes [${centre.slice(0, 3)}] -> `
        + `[${n.map((v) => v.toFixed(4)).join(', ')}]`);
    ok(n[2] > 0.999, 'a face square to the camera has a view-space normal of +z');
    ok(Math.hypot(...n) > 0.999 && Math.hypot(...n) < 1.001, 'and it is unit length');
    ok(corner[0] === 0 && corner[1] === 0 && corner[2] === 0,
       `an empty pixel in the normal pass is black, not a normal (got [${corner.slice(0, 3)}])`);
}

// ------------------------------------------------------------------ object
{
    const [centre, corner] = at('object');
    // `box/face`, not `box`: the registry addresses a PART, so the matte
    // does too. The walk in `render/aov.js` carries the nearest enclosing id
    // down the graph, which means the most specific matte wins -- and a
    // compositor that wants the whole assembly unions the ids under `box/`.
    const want = objectColor('box/face');
    const got = (centre[0] << 16) | (centre[1] << 8) | centre[2];
    console.log(`\nobject: centre #${got.toString(16).padStart(6, '0')} `
        + `want #${want.toString(16).padStart(6, '0')}`);
    ok(got === want, 'the matte colour arrives EXACTLY as the manifest names it');
    ok(corner[0] === 0 && corner[1] === 0 && corner[2] === 0, 'and the background is black');
    ok(res.manifest.collisions.length === 0,
       `no two nodes share a matte colour (${Object.keys(res.manifest.colors).length} nodes)`);

    const px = Buffer.from(res.raws.find((r) => r.kind === 'object').base64, 'base64');
    const cover = matteCoverage(px, 'box/face', 320);
    // The front face is 2 m across at 11 m through a 38-degree lens. Its
    // share of the frame is a closed form, so the matte has an analytic area
    // rather than a remembered one.
    const fracH = 2 / (2 * DIST * Math.tan((FOV * Math.PI) / 360));
    const analytic = fracH * (fracH / (W / H));
    console.log(`  coverage ${(cover * 100).toFixed(2)}% of the frame `
        + `(analytic ${(analytic * 100).toFixed(2)}%)`);
    ok(Math.abs(cover - analytic) / analytic < 0.03,
       'and covers the pixels the projection says it should, within 3%');
}

if (res.aovs?.length) {
    console.log(`\nwrote ${res.aovs.length} pass PNG(s): `
        + res.aovs.map((a) => `${a.kind} (${Math.round(a.png.length / 1024)} KB)`).join(', '));
    ok(res.aovs.every((a) => a.png.startsWith('data:image/png')),
       'each pass also encodes as a PNG beside the video');
}

console.log('');
if (fails.length) {
    for (const f of fails) console.error(`FAIL: ${f}`);
    process.exit(1);
}
console.log(`PASS: ${res.probes.length} passes, depth in metres, mattes exact.`);
