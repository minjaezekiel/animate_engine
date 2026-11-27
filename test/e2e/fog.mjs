/**
 * Fog, measured on real pixels.
 *
 * `test/core/fog.test.mjs` proves the arithmetic. What it cannot prove is
 * that the arithmetic is the SAME arithmetic the GPU runs -- and three ways
 * of being wrong about that leave every unit test green:
 *
 *   1. `FogExp2` squares both terms. Reading it as Beer-Lambert puts the
 *      half distance out by 20%, which is a plausible fog of the wrong
 *      thickness and is invisible without a number.
 *   2. The fog mix happens in the material's fragment shader, in LINEAR
 *      light, before tone mapping. Predicting a display-space mix is the
 *      usual way hand-rolled fog comes out looking like paint.
 *   3. `vFogDepth` is `-mvPosition.z` -- distance along the camera's forward
 *      axis, not distance from the camera. Two cards at the same axial depth
 *      and very different radial distances must fog IDENTICALLY, and most
 *      people's first guess is that they do not.
 *
 * So five mid-grey emissive cards sit at known axial depths, the frame is
 * rendered with the fog and without it, and the ratio of the two in linear
 * light is the transmittance -- recovered by inverting the sRGB encode and
 * the ACES curve, both of which cancel to a scalar on a neutral grey.
 */
import puppeteer from 'puppeteer-core';
import { startGuard, closeBrowser } from './lib/guard.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { acquireLock } from '../../scripts/lib/render-lock.mjs';
import { normalizeFog, transmittance, visibilityOf, halfDistance }
    from '../../src/core/render/fog.js';

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

const W = 480, H = 240, FOV = 38, VISIBILITY = 50;

/**
 * Each card: axial depth, and an x offset expressed as a FRACTION of that
 * depth, so its screen position is independent of how far away it is. Width
 * and height scale with depth for the same reason -- every card covers the
 * same pixels, so a luma difference between them is the fog and nothing else.
 *
 * `e` is the control: the same axial depth as `c`, far off to the side, so
 * its distance FROM the camera is 21.93 against c's 20.03.
 */
const CARDS = [
    { id: 'a', depth: 5, k: -0.45 },
    { id: 'b', depth: 10, k: -0.25 },
    { id: 'c', depth: 20, k: -0.05 },
    { id: 'd', depth: 30, k: 0.18 },
    { id: 'e', depth: 20, k: 0.45 },
];

const filmFor = (fog) => ({
    version: 'jirex.film3d/1',
    meta: { title: 'fog', fps: 24, width: W, height: H, fov: FOV,
            background: '#000000', ...(fog ? { fog } : {}) },
    // Emissive, with no albedo and effectively no lights: the fragment's own
    // colour is a known constant, so nothing about the lighting model enters
    // the measurement. sRGB 0x808080 is 0.2140 in linear light.
    materials: { card: { color: '#000000', roughness: 1, metalness: 0,
                         emissive: '#808080', emissiveIntensity: 1 } },
    lights: [{ id: 'amb', type: 'ambient', color: '#ffffff', intensity: 0 }],
    assemblies: Object.fromEntries(CARDS.map((c) => [`card_${c.id}`, {
        parts: [{ id: 'face', material: 'card',
                  geometry: { kind: 'plane', width: 0.07 * c.depth,
                              height: 0.3 * c.depth } }],
    }])),
    cast: CARDS.map((c) => ({ assembly: `card_${c.id}`, as: c.id,
                              at: [c.k * c.depth, 0, -c.depth], set: true })),
    scenes: [{ id: 's', shots: [{ id: 'one', duration: 1,
        camera: { from: { at: [0, 0, 0], look: [0, 0, -1] }, for: 0 } }] }],
});

/**
 * The display transform, inverted.
 *
 * ACES is a 3x3 matrix, a rational curve and another 3x3 matrix. Both
 * matrices have unit row sums, so on a NEUTRAL grey -- which is what a grey
 * card in black fog stays -- the whole thing collapses to the scalar curve
 * below. That is why the cards are grey and the fog is black.
 */
const aces = (v) => {
    const x = v / 0.6;                               // toneMappingExposure 1.0
    const a = x * (x + 0.0245786) - 0.000090537;
    const b = x * (0.983729 * x + 0.432951) + 0.238081;
    return Math.min(1, Math.max(0, a / b));
};
const acesInverse = (y) => {
    let lo = 0, hi = 64;
    for (let i = 0; i < 80; i++) {
        const mid = (lo + hi) / 2;
        if (aces(mid) < y) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
};
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** A measured byte, all the way back to the light that entered the shader. */
const sceneLight = (byte) => acesInverse(srgbToLinear(byte / 255));

await acquireLock('the fog probe');
const br = await puppeteer.launch({
    executablePath: CHROME, headless: true, protocolTimeout: 600_000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=metal'],
});
const guard = startGuard({ ms: 600_000, name: 'test:fog' });
guard.onCleanup(() => closeBrowser(br));
guard.onCleanup(() => srv.close());
const pg = await br.newPage();
const pageErrors = [];
pg.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));
await pg.goto(`${base}/film3d.html`, { waitUntil: 'load', timeout: 120_000 });
await pg.waitForFunction(() => typeof window.render3d === 'function', { timeout: 30_000 });

const shoot = (fog) => pg.evaluate((f, w, h) => window.render3d(f, {
    width: w, height: h, silent: true, grab: [0.5],
}), filmFor(fog), W, H);

/** Clusters of non-black pixels along the mid scanline, left to right. */
const clustersOf = (dataUrl) => pg.evaluate(async (url, w, h) => {
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
        const lit = row[i] > 2;
        if (lit) {
            run ??= { x0: x, bytes: [] };
            run.bytes.push(row[i]);
        } else if (run) { run.x1 = x - 1; out.push(run); run = null; }
    }
    if (run) { run.x1 = w - 1; out.push(run); }
    /**
     * The PLATEAU, as a median, not the mean over the bar. An edge pixel is
     * multisampled against a black background, so it reads darker than the
     * card -- and averaging those in and only then inverting a nonlinear
     * display curve mixes two different brightnesses before undoing the
     * curve, which is not the same as undoing the curve on either of them.
     * The first run of this probe did exactly that and read every card 10%
     * too foggy, with a density that drifted from 0.056 to 0.046 with depth:
     * a shape error in the measurement that looks like a shape error in the
     * model.
     */
    return out.map((u) => {
        const sorted = [...u.bytes].sort((p, q) => p - q);
        return { at: Math.round((u.x0 + u.x1) / 2), width: u.x1 - u.x0 + 1,
                 byte: sorted[Math.floor(sorted.length / 2)] };
    });
}, dataUrl, W, H);

const fog = { visibility: VISIBILITY };
const withFog = await shoot(fog);
const plain = await shoot(null);
const lit = await clustersOf(withFog.frames[0].png);
const bare = await clustersOf(plain.frames[0].png);
await guard.done();

const fails = [];
const ok = (cond, line) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${line}`); if (!cond) fails.push(line); };
if (pageErrors.length) fails.push(`page errors: ${pageErrors.join(' | ')}`);

const spec = normalizeFog(fog);
/**
 * The display transform, checked before anything is concluded from it.
 *
 * The cards emit a known constant: sRGB 0x808080 is 0.21404 in linear light.
 * If `sceneLight` of an unfogged card does not come back as that number, the
 * ACES inverse or the emissive assumption is wrong and every transmittance
 * below is measured through a broken ruler.
 */
const EMISSIVE = srgbToLinear(0x80 / 255);
const recovered = bare.length ? sceneLight(bare[0].byte) : NaN;
console.log(`\ndisplay transform: an unfogged card reads byte ${bare[0]?.byte}, `
    + `which inverts to ${recovered.toFixed(5)} against the emitted ${EMISSIVE.toFixed(5)}`);
console.log(`\ndeclared: visibility ${VISIBILITY} -> density ${spec.density.toFixed(6)}`);
console.log(`          half the light gone by ${halfDistance(spec).toFixed(2)}, `
    + `2% left at ${visibilityOf(spec).toFixed(2)}`);
console.log(`\nclusters: ${bare.length} without fog, ${lit.length} with it`);

ok(Math.abs(recovered - EMISSIVE) / EMISSIVE < 0.02,
   `the ruler is straight: ${recovered.toFixed(5)} against the emitted ${EMISSIVE.toFixed(5)}`);
ok(bare.length === CARDS.length, `all ${CARDS.length} cards render (got ${bare.length})`);
ok(lit.length === CARDS.length, `and all ${CARDS.length} survive the fog (got ${lit.length})`);

if (bare.length === CARDS.length && lit.length === CARDS.length) {
    // Both lists are left to right, and so is CARDS by `k`.
    const order = [...CARDS].sort((p, q) => p.k - q.k);
    console.log('\n  card  axial  radial    byte   bare   measured T   analytic T     err'
        + '   implied density');
    const rows = order.map((card, i) => {
        const radial = Math.hypot(card.k * card.depth, card.depth);
        const measured = sceneLight(lit[i].byte) / sceneLight(bare[i].byte);
        const analytic = transmittance(card.depth, spec);
        // Each card is an independent estimate of the one declared number.
        const density = Math.sqrt(Math.max(0, -Math.log(measured))) / card.depth;
        console.log(`  ${card.id.padEnd(5)}${String(card.depth).padStart(6)}`
            + `${radial.toFixed(2).padStart(9)}${lit[i].byte.toFixed(1).padStart(8)}`
            + `${bare[i].byte.toFixed(1).padStart(7)}`
            + `${measured.toFixed(4).padStart(13)}${analytic.toFixed(4).padStart(13)}`
            + `${(measured - analytic).toFixed(4).padStart(8)}`
            + `${density.toFixed(6).padStart(18)}`);
        return { card, measured, analytic, density, radial };
    });

    for (const r of rows) {
        ok(Math.abs(r.measured - r.analytic) < 0.02,
           `card ${r.card.id} at ${r.card.depth}: measured T ${r.measured.toFixed(4)} `
           + `against an analytic ${r.analytic.toFixed(4)}`);
    }

    /**
     * The axial-depth claim. `c` and `e` are 20 units along the lens axis and
     * 20.03 / 21.93 units from the camera. If the fog were radial -- the
     * intuitive reading -- `e` would be at T 0.4706 against `c`'s 0.5343, a
     * 12% difference that this scanline would show plainly.
     */
    const c = rows.find((r) => r.card.id === 'c');
    const e = rows.find((r) => r.card.id === 'e');
    const radialT = transmittance(e.radial, spec);
    console.log(`\naxial, not radial: c and e are both ${c.card.depth} units along the lens`
        + ` axis and ${c.radial.toFixed(2)} / ${e.radial.toFixed(2)} from the camera.`);
    console.log(`  measured ${c.measured.toFixed(4)} and ${e.measured.toFixed(4)}; `
        + `a radial fog would put e at ${radialT.toFixed(4)}`);
    ok(Math.abs(c.measured - e.measured) < 0.02,
       `the same axial depth fogs the same (${c.measured.toFixed(4)} vs ${e.measured.toFixed(4)})`);
    ok(Math.abs(e.measured - radialT) > 0.04,
       `and that is distinguishable from a radial fog (${radialT.toFixed(4)})`);

    // Five independent estimates of one declared density.
    const ds = rows.map((r) => r.density);
    const mean = ds.reduce((a, b) => a + b, 0) / ds.length;
    const spread = Math.max(...ds) - Math.min(...ds);
    console.log(`\ndensity recovered from the pixels: mean ${mean.toFixed(6)} `
        + `against the declared ${spec.density.toFixed(6)}, spread ${spread.toFixed(6)}`);
    ok(Math.abs(mean - spec.density) / spec.density < 0.03,
       `the medium measures as the one declared, within 3% (${mean.toFixed(6)})`);
    // Beer-Lambert instead of FogExp2 would read as a density that drifts
    // with depth, so a flat spread is the proof of WHICH model this is.
    ok(spread / mean < 0.08, `and it does not drift with depth (spread ${(spread / mean * 100).toFixed(1)}%)`);
}

console.log('');
if (fails.length) { for (const f of fails) console.error(`FAIL: ${f}`); process.exit(1); }
console.log(`PASS: fog measured on pixels, ${CARDS.length} cards, axial depth confirmed.`);
