/**
 * Onion skinning on the 3D path.
 *
 * [37-MISSING-TOOLS.md](../../docs/pending/37-MISSING-TOOLS.md) listed
 * `src/render/onionSkin.js` as "2D only". It never was. Its contract is
 * `draw(ctx, { render: (time) => something drawImage accepts })`, and its
 * own header says it never tells the backend that onion skinning exists --
 * so a WebGL canvas satisfies it exactly as a 2D one does. The gap was a
 * call nobody had made.
 *
 * `test/core/editor.test.mjs` already proves the pure half: which times are
 * chosen, in what order, with what falloff, clamped away from the ends. What
 * it cannot prove is that the ghosts reach a 3D frame AND stay readable --
 * which is the entire point of the view, and which two separate mistakes
 * would break while leaving every unit test green:
 *
 *   1. compositing the finished frame instead of the raw render, so four
 *      subtitles and a transition stack at four opacities;
 *   2. losing the warm/cool tint, after which a stack of grey ghosts hides
 *      the direction of travel -- the reason every animation desk tints
 *      past and future differently.
 *
 * So a white cube crosses a black frame and the ghosts are counted and
 * measured for colour.
 */
import puppeteer from 'puppeteer-core';
import { startGuard, closeBrowser } from './lib/guard.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { acquireLock } from '../../scripts/lib/render-lock.mjs';

const CHROME = process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('../..', import.meta.url).pathname;
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
            '.json': 'application/json', '.png': 'image/png' };

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

const W = 640, H = 120;
const film = {
    version: 'jirex.film3d/1',
    meta: { title: 'onion', fps: 24, width: W, height: H, background: '#000000' },
    materials: { pale: { color: '#ffffff', roughness: 1, metalness: 0,
                         emissive: '#ffffff', emissiveIntensity: 1 } },
    lights: [{ id: 'amb', type: 'ambient', color: '#ffffff', intensity: 1 }],
    assemblies: { block: { parts: [{ id: 'face',
                                     geometry: { kind: 'plane', width: 0.6, height: 0.6 },
                                     material: 'pale' }] } },
    cast: [{ assembly: 'block', as: 'box', at: [-5, 0, 0], set: true }],
    scenes: [{
        id: 's',
        shots: [{ id: 'a', duration: 2,
                  camera: { from: { at: [0, 0, 12], look: [0, 0, 0] }, for: 0 },
                  actions: [{ target: 'box', do: 'move', to: [5, 0, 0],
                              at: 0, for: 2, ease: 'linear' }] },
                // A second shot, so there is a CUT at 2.0s to not ghost
                // across. The box travels back, which puts shot a's drawings
                // somewhere a reader can see they do not belong.
                { id: 'b', duration: 2,
                  camera: { from: { at: [0, 0, 12], look: [0, 0, 0] }, for: 0 },
                  actions: [{ target: 'box', do: 'move', to: [-5, 0, 0],
                              at: 0, for: 2, ease: 'linear' }] }],
    }],
};

const SPACING = 0.3;
const AT = 1.0;
/** One frame after the cut: every ghost behind it is in the previous shot. */
const CUT = 2 + 1 / 24;

await acquireLock('the 3D onion probe');
const br = await puppeteer.launch({
    executablePath: CHROME, headless: true, protocolTimeout: 600_000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=metal'],
});
const guard = startGuard({ ms: 600_000, name: 'test:onion' });
guard.onCleanup(() => closeBrowser(br));
guard.onCleanup(() => srv.close());
const pg = await br.newPage();
const pageErrors = [];
pg.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));
await pg.goto(`${base}/film3d.html`, { waitUntil: 'load', timeout: 120_000 });
await pg.waitForFunction(() => typeof window.render3d === 'function', { timeout: 30_000 });

const run = (onion) => pg.evaluate((f, o, w, h) => window.render3d(f, {
    width: w, height: h, silent: true, onion: o,
}), film, onion, W, H);

const on = await run({ before: 2, after: 2, spacing: SPACING, at: [AT, CUT] });
const off = await run({ before: 0, after: 0, spacing: SPACING, at: [AT] });

/**
 * Clusters of lit pixels along the mid scanline, with each one's mean
 * colour. Five of them is four ghosts and the live frame; one is a view
 * that composited nothing.
 */
const clustersOf = async (dataUrl) => pg.evaluate(async (url, w, h) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const row = ctx.getImageData(0, Math.floor(h / 2), w, 1).data;
    const out = [];
    let run = null;
    for (let x = 0; x < w; x++) {
        const i = x * 4;
        const lit = (row[i] + row[i + 1] + row[i + 2]) / 3 > 12;
        if (lit) {
            run ??= { x0: x, r: 0, g: 0, b: 0, n: 0 };
            run.r += row[i]; run.g += row[i + 1]; run.b += row[i + 2]; run.n++;
        } else if (run) { run.x1 = x - 1; out.push(run); run = null; }
    }
    if (run) { run.x1 = w - 1; out.push(run); }
    return out.map((u) => ({
        at: Math.round((u.x0 + u.x1) / 2), width: u.x1 - u.x0 + 1,
        r: Math.round(u.r / u.n), g: Math.round(u.g / u.n), b: Math.round(u.b / u.n),
        luma: Math.round((u.r + u.g + u.b) / (3 * u.n)),
    }));
}, dataUrl, W, H);

const lit = await clustersOf(on.frames[0].png);
const across = await clustersOf(on.frames[1].png);
const plain = await clustersOf(off.frames[0].png);
await guard.done();

const fails = [];
const ok = (cond, line) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${line}`); if (!cond) fails.push(line); };
if (pageErrors.length) fails.push(`page errors: ${pageErrors.join(' | ')}`);

console.log(`\nghosts reported: ${on.onion[0].ghosts} at ${SPACING}s apart, t=${AT}s`);
console.log('\nclusters along the mid scanline:');
for (const c of lit) {
    console.log(`  x ${String(c.at).padStart(4)}  ${String(c.width).padStart(3)} px wide  `
        + `rgb(${c.r}, ${c.g}, ${c.b})  luma ${c.luma}  `
        + `${c.r - c.b > 6 ? 'warm' : c.b - c.r > 6 ? 'cool' : 'neutral'}`);
}
console.log(`  without onion: ${plain.length} cluster(s)`);

ok(on.onion[0].ghosts === 4, `four ghosts were drawn (got ${on.onion[0].ghosts})`);
ok(plain.length === 1, 'with onion off the frame has one subject, as it should');
ok(lit.length === 5, `and with it on, five: four ghosts and the live frame (got ${lit.length})`);
if (lit.length === 5) {
    const live = lit[2];
    ok(live.luma > lit[0].luma && live.luma > lit[4].luma,
       `the live frame is the brightest (${live.luma} against ${lit[0].luma}/${lit[4].luma})`);
    ok(lit[1].luma > lit[0].luma && lit[3].luma > lit[4].luma,
       'and each further ghost is fainter than the one nearer the playhead');
    // The desk convention: warm behind, cool ahead. Without it, a stack of
    // grey ghosts hides which way the limb is travelling.
    const behind = lit[0].r - lit[0].b, ahead = lit[4].b - lit[4].r;
    console.log(`\ntint: behind is ${behind} redder, ahead is ${ahead} bluer`);
    ok(behind > 6, `the past is tinted warm (R-B = ${behind})`);
    ok(ahead > 6, `the future is tinted cool (B-R = ${ahead})`);
    const gap = lit[1].at - lit[0].at;
    ok(Math.abs((lit[2].at - lit[1].at) - gap) <= 2,
       `the ghosts are evenly spaced, ${gap} px for ${SPACING}s of a linear move`);
}

/**
 * The cut. `frames()` clamped to `[0, duration]` -- the FILM -- so one frame
 * after a cut the two ghosts behind were 1.742 and 1.442, both of them
 * drawings from the previous shot: another camera on another set, which is
 * the one thing a reference view must not show. The 2D plan model was fixed
 * for this; this path is the sibling caller that was not.
 */
const cut = on.onion[1];
console.log(`\nat ${CUT.toFixed(4)}s, one frame after the cut at 2.00s:`);
console.log(`  shot ${cut.shot}, window [${cut.window[0].toFixed(2)}, ${cut.window[1].toFixed(2)}]`);
console.log(`  ${cut.ghosts} ghost(s) of the 4 asked for; `
    + `${across.length} cluster(s) on the scanline`);
for (const c of across) {
    console.log(`  x ${String(c.at).padStart(4)}  luma ${String(c.luma).padStart(3)}  `
        + `${c.r - c.b > 6 ? 'warm' : c.b - c.r > 6 ? 'cool' : 'neutral'}`);
}
ok(cut.shot === 'b' && cut.window[0] === 2, `the window is shot b's, not the film's`);
ok(cut.ghosts === 2, `only the two ghosts ahead survive the cut (got ${cut.ghosts})`);
ok(across.length === 3, `three clusters: the live frame and two ahead (got ${across.length})`);
ok(across.every((c) => c.r - c.b <= 6), 'and none of them is warm, which is to say in the past');

console.log('');
if (fails.length) { for (const f of fails) console.error(`FAIL: ${f}`); process.exit(1); }
console.log(`PASS: ${on.onion[0].ghosts} ghosts on a 3D frame, warm behind and cool ahead.`);
