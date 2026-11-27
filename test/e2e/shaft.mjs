/**
 * The light shaft, measured against its own closed form.
 *
 * `test/core/shaft.test.mjs` proves the arithmetic in JavaScript. This proves
 * that the GLSL in `render/shaft.js` computes the SAME arithmetic -- which is
 * the only thing a transcription can get wrong, and which three separate
 * mistakes would break while leaving every unit test green:
 *
 *   1. the mirror sheet of the double cone, which puts a second beam out of
 *      the back of the lamp;
 *   2. the cap, without which there is a circular hole exactly where the
 *      beam is brightest;
 *   3. the apex clamp, without which the integral diverges into one blinding
 *      pixel.
 *
 * A spot light points across an empty black frame, and the rendered scanline
 * through the beam is compared pixel by pixel against `inscatter`.
 *
 * The frame is black and empty on purpose: the shaft is the ONLY thing in it,
 * so a pixel's value is the integral and nothing else. Any geometry would put
 * its own shading in the way of the measurement.
 */
import puppeteer from 'puppeteer-core';
import { startGuard, closeBrowser } from './lib/guard.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { acquireLock } from '../../scripts/lib/render-lock.mjs';
import { inscatter, rayCone, normalizeShaft } from '../../src/core/render/shaft.js';

const CHROME = process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('../..', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.json': 'application/json', '.png': 'image/png' };

const srv = createServer(async (q, r) => {
    try {
        const f = join(ROOT, normalize(new URL(q.url, 'http://x').pathname));
        const b = await readFile(f);
        r.writeHead(200, { 'content-type': MIME[extname(f)] ?? 'application/octet-stream' });
        r.end(b);
    } catch { if (!r.headersSent) r.writeHead(404); r.end(); }
});
await new Promise((r) => srv.listen(0, r));
const base = `http://127.0.0.1:${srv.address().port}`;

const W = 480, H = 240, FOV = 38;
/**
 * `INTENSITY` is 6 so the measurable part of the beam sits high in the 8-bit
 * frame. It is not a fudge: the integral spans a factor of 280 from the apex
 * end of this beam to the cap end, and no 8-bit image holds that with
 * precision at both ends. At intensity 1 the dim half of the predicted beam
 * rounded to byte 0 and the bright half measured to 0.3%, which says the
 * shader is right and says nothing about the falloff. Scaled up, a factor of
 * ten of the falloff lands between byte 31 and byte 150, where one byte is a
 * few percent rather than a quarter.
 */
const ANGLE = 18, RANGE = 10, DENSITY = 0.6, INTENSITY = 6, G = 0.6, RADIUS = 0.2;
/** Below this the 8-bit step is a large fraction of the value it quantises. */
const FLOOR = 25;

/**
 * The lamp is at the origin pointing down -X, so the beam crosses the frame
 * left to right and the mid scanline cuts it lengthwise. The camera looks
 * down -Z from 14 units away, which puts it square to the beam: every view
 * ray on the mid scanline is perpendicular to the axis, so `cosTheta` is 0
 * for all of them and the phase function is a constant across the whole
 * measurement rather than another variable in it.
 */
const EYE = [0, 0, 14];
const APEX = [-1.2, 0, 0];
const AXIS = [-1, 0, 0];

const film = {
    version: 'jirex.film3d/1',
    meta: { title: 'shaft', fps: 24, width: W, height: H, fov: FOV, background: '#000000' },
    materials: {},
    lights: [{
        id: 'key', type: 'spot', color: '#ffffff', intensity: 0,
        at: APEX, target: [APEX[0] - 1, 0, 0],
        angle: ANGLE, penumbra: 0, distance: RANGE, castShadow: false,
        // `soft: 0` so the rim is a step and the comparison is the integral
        // alone. The softness has its own unit test.
        shaft: { density: DENSITY, intensity: INTENSITY, g: G, radius: RADIUS, soft: 0 },
    }],
    assemblies: {},
    cast: [],
    scenes: [{ id: 's', shots: [{ id: 'one', duration: 1,
        camera: { from: { at: EYE, look: [APEX[0] - RANGE / 2, 0, 0] }, for: 0 } }] }],
};

/** ACES and the sRGB encode, inverted -- see test/e2e/fog.mjs for the why. */
const aces = (v) => {
    const x = v / 0.6;
    const a = x * (x + 0.0245786) - 0.000090537;
    const b = x * (0.983729 * x + 0.432951) + 0.238081;
    return Math.min(1, Math.max(0, a / b));
};
const acesInverse = (y) => {
    let lo = 0, hi = 64;
    for (let i = 0; i < 90; i++) {
        const mid = (lo + hi) / 2;
        if (aces(mid) < y) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
};
const srgbToLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const sceneLight = (byte) => acesInverse(srgbToLinear(byte / 255));

await acquireLock('the shaft probe');
const br = await puppeteer.launch({
    executablePath: CHROME, headless: true, protocolTimeout: 600_000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=metal'],
});
const guard = startGuard({ ms: 600_000, name: 'test:shaft' });
guard.onCleanup(() => closeBrowser(br));
guard.onCleanup(() => srv.close());
const pg = await br.newPage();
const pageErrors = [];
pg.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));
await pg.goto(`${base}/film3d.html`, { waitUntil: 'load', timeout: 120_000 });
await pg.waitForFunction(() => typeof window.render3d === 'function', { timeout: 30_000 });

const shot = await pg.evaluate((f, w, h) => window.render3d(f, {
    width: w, height: h, silent: true, grab: [0.5],
}), film, W, H);

/** The red channel of the mid scanline, and of a row near the top. */
const rows = await pg.evaluate(async (url, w, h) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const take = (y) => {
        const d = ctx.getImageData(0, y, w, 1).data;
        return Array.from({ length: w }, (_, x) => d[x * 4]);
    };
    return { mid: take(Math.floor(h / 2)), top: take(Math.floor(h * 0.08)) };
}, shot.frames[0].png, W, H);
await guard.done();

const fails = [];
const ok = (cond, line) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${line}`); if (!cond) fails.push(line); };
if (pageErrors.length) fails.push(`page errors: ${pageErrors.join(' | ')}`);

/**
 * The camera's basis, rebuilt here from the same numbers the film declares,
 * so a view ray for pixel x can be written down without asking the renderer
 * for anything. The shot looks along -Z with no roll, which keeps this three
 * lines instead of a matrix.
 */
const look = [APEX[0] - RANGE / 2, 0, 0];
const fwd = (() => {
    const v = [look[0] - EYE[0], look[1] - EYE[1], look[2] - EYE[2]];
    const L = Math.hypot(...v);
    return v.map((x) => x / L);
})();
const up = [0, 1, 0];
const right = [
    fwd[1] * up[2] - fwd[2] * up[1],
    fwd[2] * up[0] - fwd[0] * up[2],
    fwd[0] * up[1] - fwd[1] * up[0],
];
{
    const L = Math.hypot(...right);
    for (let i = 0; i < 3; i++) right[i] /= L;
}
const tanHalf = Math.tan((FOV * Math.PI) / 360);
const rayFor = (px, py) => {
    // Pixel centres, in NDC, exactly as the rasteriser places them.
    const ndcX = ((px + 0.5) / W) * 2 - 1;
    const ndcY = 1 - ((py + 0.5) / H) * 2;
    const sx = ndcX * tanHalf * (W / H);
    const sy = ndcY * tanHalf;
    const v = [
        fwd[0] + right[0] * sx + up[0] * sy,
        fwd[1] + right[1] * sx + up[1] * sy,
        fwd[2] + right[2] * sx + up[2] * sy,
    ];
    const L = Math.hypot(...v);
    return v.map((x) => x / L);
};

const spec = normalizeShaft(
    { density: DENSITY, intensity: INTENSITY, g: G, radius: RADIUS, soft: 0 },
    { lightType: 'spot', angle: ANGLE, distance: RANGE, penumbra: 0 });
const shaft = { ...spec, apex: APEX, axis: AXIS };

const midY = Math.floor(H / 2);
const pairs = [];
for (let x = 0; x < W; x++) {
    const d = rayFor(x, midY);
    const want = inscatter(EYE, d, shaft);
    if (want <= 0) continue;
    pairs.push({ x, want, got: sceneLight(rows.mid[x]), byte: rows.mid[x] });
}

/**
 * Pixels whose NEIGHBOURS are also predicted lit, within a factor of ten of
 * the brightest. The neighbour test drops the cone's rim, where a
 * multisampled pixel is part beam and part background and is therefore not a
 * sample of the integral at its own centre.
 */
const maxWant = pairs.reduce((m, p) => Math.max(m, p.want), 0);
const lit = new Set(pairs.map((p) => p.x));
const usable = pairs.filter((p) => p.byte >= FLOOR && p.want >= maxWant / 10
    && lit.has(p.x - 1) && lit.has(p.x + 1));

const beamPx = rows.mid.filter((b) => b > 2).length;
console.log(`\nbeam on the mid scanline: ${beamPx} px lit, `
    + `${pairs.length} px where the closed form says there should be light`);
ok(beamPx > 40, `the shaft reaches the frame at all (${beamPx} px)`);
ok(pairs.length > 40, `and the closed form agrees it should (${pairs.length} px)`);
ok(usable.length > 20, `and enough of it clears the 8-bit floor to measure `
   + `(${usable.length} px)`);

if (usable.length > 20) {
    // Sampled across the beam rather than every pixel, because 300 lines of
    // table is not a measurement anyone reads.
    console.log('\n     x   byte   rendered   closed form      ratio');
    const step = Math.max(1, Math.floor(usable.length / 9));
    for (let i = 0; i < usable.length; i += step) {
        const p = usable[i];
        console.log(`  ${String(p.x).padStart(4)}${String(p.byte).padStart(7)}`
            + `${p.got.toFixed(5).padStart(11)}${p.want.toFixed(5).padStart(14)}`
            + `${(p.got / p.want).toFixed(4).padStart(11)}`);
    }

    /**
     * The RATIO, not the difference. The integral falls by more than a factor
     * of ten across the measured beam -- that is the 1/r^2, and it is the
     * point -- so an absolute tolerance would be met by the bright end alone
     * and would say nothing about the dim end.
     */
    const ratios = usable.map((p) => p.got / p.want);
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const worst = ratios.reduce((w, r) => (Math.abs(r - 1) > Math.abs(w - 1) ? r : w), 1);
    const drift = Math.max(...ratios) / Math.min(...ratios);
    console.log(`\n${usable.length} px at byte ${FLOOR} or over, within x10 of the `
        + `brightest: mean ratio ${mean.toFixed(4)}, worst ${worst.toFixed(4)}, `
        + `spread ${drift.toFixed(4)}`);
    ok(Math.abs(mean - 1) < 0.04, `the shader computes the closed form (mean ${mean.toFixed(4)})`);
    ok(drift < 1.12, `across the whole falloff, not just the bright end (spread ${drift.toFixed(4)})`);

    // The falloff itself is the claim: a beam of constant brightness would
    // pass a mean-ratio test and be the wrong picture entirely.
    const brightest = usable.reduce((a, b) => (a.want > b.want ? a : b));
    const dimmest = usable.reduce((a, b) => (a.want < b.want ? a : b));
    const span = brightest.want / dimmest.want;
    const whole = maxWant / pairs.reduce((m, p) => Math.min(m, p.want || m), maxWant);
    console.log(`falloff: x${span.toFixed(1)} across the measured pixels`
        + ` (${brightest.want.toFixed(4)} down to ${dimmest.want.toFixed(4)}), `
        + `x${whole.toFixed(0)} across the whole predicted beam`);
    ok(span > 4, `there is a real 1/r^2 falloff to have got right (x${span.toFixed(1)})`);
}

/**
 * Nothing behind the lamp. The mirror sheet of the double cone satisfies the
 * same quadratic, so a missing sign test lights the half of the frame the
 * lamp is NOT pointing at -- and on this scanline that is x past the apex.
 */
const apexPx = (() => {
    // Where the apex projects to, by the same basis.
    const v = [APEX[0] - EYE[0], APEX[1] - EYE[1], APEX[2] - EYE[2]];
    const z = v[0] * fwd[0] + v[1] * fwd[1] + v[2] * fwd[2];
    const sx = (v[0] * right[0] + v[1] * right[1] + v[2] * right[2]) / z;
    return Math.round(((sx / (tanHalf * (W / H)) + 1) / 2) * W);
})();
const behind = rows.mid.slice(apexPx + 6).filter((b) => b > 2).length;
console.log(`\napex projects to x ${apexPx}; `
    + `${behind} lit px on the far side of it (the mirror cone)`);
ok(behind === 0, `no second beam out of the back of the lamp (${behind} px)`);

// And nothing outside the cone: a row near the top of the frame is well
// clear of an 18-degree beam 10 units long.
const stray = rows.top.filter((b) => b > 2).length;
console.log(`${stray} lit px on a row outside the cone`);
ok(stray === 0, `the beam has edges (${stray} px outside it)`);

console.log('');
if (fails.length) { for (const f of fails) console.error(`FAIL: ${f}`); process.exit(1); }
console.log('PASS: the GLSL computes the closed form across the whole falloff.');
