/**
 * Bounce light, measured as the thing global illumination is for.
 *
 * `test/core/bounce.test.mjs` proves the placement and the assignment. What
 * it cannot prove is that light actually bounces, and that is one number: a
 * **white card beside a red wall must become red**. Nothing else in this
 * renderer can do that. An environment map can tint the whole frame, a light
 * can be coloured, ambient can be warmed -- none of those is the wall's
 * albedo reaching the card.
 *
 * So the probe renders the same geometry three times:
 *
 *   off      no bounce at all -- the card is neutral
 *   red      bounce on, with a red wall
 *   black    bounce on, with a black wall
 *
 * The third is what makes the second a measurement. A probe that simply
 * tinted everything, or that picked up the backdrop rather than the wall,
 * would redden the card in run two AND leave it reddened in run three. Only
 * a bounce carrying the wall's own albedo goes red, then neutral.
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

const W = 360, H = 240;

/**
 * ACES and the sRGB encode, inverted, as in `test/e2e/fog.mjs`.
 *
 * Measured in LINEAR light rather than in bytes, because that is where the
 * bounce is additive. The card sits high in the range where ACES compresses
 * hard, so a real few-percent lift in radiance arrives as one or two bytes --
 * a number that is true and says nothing. Undo the curve and it is a ratio.
 */
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

/**
 * A white card facing the camera, with a saturated wall beside it turned 45
 * degrees so that it faces the card. A wall parallel to the card would bounce
 * its light away from it, which is a real effect and a useless test.
 *
 * The backdrop is black, so the only coloured thing in the room is the wall.
 * One white directional light, at an intensity that leaves the card in the
 * middle of the range rather than near saturation, where added light
 * compresses into a byte or two and the measurement stops meaning anything.
 *
 * `rot` is in DEGREES. Found the hard way: at `[0, 0.9, 0]` -- 0.9 radians,
 * as intended -- the wall stayed effectively square-on, the probe sat behind
 * it, and a single-sided plane is invisible from behind, so the probe saw a
 * white card and a black void and came back perfectly grey.
 */
const film = (wall, bounce) => ({
    version: 'jirex.film3d/1',
    meta: {
        title: 'bounce', fps: 24, width: W, height: H, fov: 40,
        background: '#000000', ...(bounce ? { bounce } : {}),
    },
    materials: {
        card: { color: '#ffffff', roughness: 1, metalness: 0 },
        wall: { color: wall, roughness: 1, metalness: 0 },
    },
    assemblies: {
        card: { parts: [{ id: 'face', material: 'card',
                          geometry: { kind: 'plane', width: 1.6, height: 2.4 } }] },
        // Large and close, because that is what makes a bounce big enough
        // to be a measurement: one bounce off a small distant wall is a
        // couple of percent, which is physically right and hard to read.
        wall: { parts: [{ id: 'face', material: 'wall',
                          geometry: { kind: 'plane', width: 5, height: 5 } }] },
    },
    /**
     * The key rakes the WALL, from the far side of the card, so the card
     * itself catches only a glancing share of it. That is deliberate and it
     * is the case global illumination exists for: 42-RENDER-QUALITY states
     * the defect as "the reference's shadows are filled by light that bounced
     * off a wall; ours are filled by a constant ambient term, which flattens
     * everything it touches". A card lit square-on by a strong key measures
     * a true 3% bounce and demonstrates nothing, because the thing being
     * replaced is not the key -- it is the fill.
     */
    lights: [
        { id: 'key', type: 'directional', color: '#ffffff', intensity: 3.2,
          at: [6, 2, 1], target: [-1.8, 0, 0.3], castShadow: false },
    ],
    cast: [
        { assembly: 'card', as: 'card', at: [0.9, 0, 0], set: true },
        { assembly: 'wall', as: 'wall', at: [-1.8, 0, 0.3], rot: [0, 50, 0], set: true },
    ],
    scenes: [{ id: 's', shots: [{ id: 'one', duration: 1,
        camera: { from: { at: [1.2, 0, 5.2], look: [0.9, 0, 0] }, for: 0 } }] }],
});

await acquireLock('the bounce probe');
const br = await puppeteer.launch({
    executablePath: CHROME, headless: true, protocolTimeout: 600_000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=metal'],
});
const guard = startGuard({ ms: 600_000, name: 'test:bounce' });
guard.onCleanup(() => closeBrowser(br));
guard.onCleanup(() => srv.close());
const pg = await br.newPage();
const pageErrors = [];
pg.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));
if (process.env.VERBOSE) pg.on('console', (m) => console.log('  [page]', m.text().slice(0, 300)));
await pg.goto(`${base}/film3d.html`, { waitUntil: 'load', timeout: 120_000 });
await pg.waitForFunction(() => typeof window.render3d === 'function', { timeout: 30_000 });
if (process.env.VERBOSE) await pg.evaluate(() => { window.__verbose = true; });

const shoot = (f) => pg.evaluate((film, w, h) => window.render3d(film, {
    width: w, height: h, silent: !window.__verbose, grab: [0.5],
}), f, W, H);

/**
 * The card, as a mean colour.
 *
 * Read from a window on the RIGHT of the frame, where the card is and the
 * wall is not: a mean over the whole frame would be dominated by the wall's
 * own colour and would measure nothing at all.
 */
const cardColour = (dataUrl) => pg.evaluate(async (url, w, h) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const x0 = Math.floor(w * 0.56), x1 = Math.floor(w * 0.80);
    const y0 = Math.floor(h * 0.30), y1 = Math.floor(h * 0.70);
    const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) {
        // Only the card: the backdrop is black and must not pull the mean.
        if ((d[i] + d[i + 1] + d[i + 2]) / 3 < 24) continue;
        r += d[i]; g += d[i + 1]; b += d[i + 2]; n++;
    }
    return n ? { r: r / n, g: g / n, b: b / n, n, window: [x0, y0, x1, y1] }
        : { r: 0, g: 0, b: 0, n: 0, window: [x0, y0, x1, y1] };
}, dataUrl, W, H);

const BOUNCE = { size: 64, intensity: 1 };
const runs = {
    off: await shoot(film('#ff1010', null)),
    red: await shoot(film('#ff1010', BOUNCE)),
    black: await shoot(film('#000000', BOUNCE)),
    /**
     * The failure mode, on purpose. Both planes face +Z, so a probe behind
     * them at z = -3 sees their backs -- and a single-sided plane is
     * invisible from behind. The bake runs, the probe is placed, the
     * materials are assigned, every step reports success, and the film
     * renders exactly as it would with the feature switched off.
     *
     * That is what cost an hour of Phase 72, and it is now a diagnostic.
     */
    blind: await shoot(film('#ff1010', { size: 64, at: [[0, 0, -3]] })),
};
const card = {
    off: await cardColour(runs.off.frames[0].png),
    red: await cardColour(runs.red.frames[0].png),
    black: await cardColour(runs.black.frames[0].png),
};
await guard.done();

const fails = [];
const ok = (cond, line) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${line}`); if (!cond) fails.push(line); };
if (pageErrors.length) fails.push(`page errors: ${pageErrors.join(' | ')}`);

/** The card's radiance per channel, and the red lift as a ratio. */
const lin = (c) => ({ r: sceneLight(c.r), g: sceneLight(c.g), b: sceneLight(c.b) });
const ratio = (c) => { const L = lin(c); return L.r / L.b; };
const tint = (c) => c.r - c.b;
console.log(`\nthe card, read from a ${card.off.n} px window on the right of the frame:`);
console.log('  run          byte r  byte b   R-B    linear r   linear b    R/B');
for (const k of ['off', 'red', 'black']) {
    const c = card[k], L = lin(c);
    console.log(`  ${k.padEnd(8)}${c.r.toFixed(1).padStart(8)}${c.b.toFixed(1).padStart(8)}`
        + `${tint(c).toFixed(1).padStart(6)}${L.r.toFixed(5).padStart(12)}`
        + `${L.b.toFixed(5).padStart(11)}${ratio(c).toFixed(4).padStart(8)}`);
}

ok(card.off.n > 500 && card.red.n > 500 && card.black.n > 500,
   `the card is in frame in all three runs (${card.off.n}/${card.red.n}/${card.black.n} px)`);
ok(Math.abs(ratio(card.off) - 1) < 0.01,
   `with no bounce the card is neutral (R/B = ${ratio(card.off).toFixed(4)})`);
ok(ratio(card.red) > 1.04,
   `beside a red wall it goes red (R/B = ${ratio(card.red).toFixed(4)})`);
ok(Math.abs(ratio(card.black) - 1) < 0.01,
   `beside a black wall it does not (R/B = ${ratio(card.black).toFixed(4)})`);

/**
 * And the direction of the error matters as much as its size. A bounce ADDS
 * light, so the card must get brighter, not merely redder -- a probe applied
 * as a tint rather than as irradiance would redden it by taking blue away.
 */
const lift = (a, b) => b / a - 1;
const offL = lin(card.off), redL = lin(card.red), blackL = lin(card.black);
console.log(`\nradiance lift from the bounce, against no bounce at all:`);
console.log(`  red wall:    r ${(lift(offL.r, redL.r) * 100).toFixed(1)}%, `
    + `g ${(lift(offL.g, redL.g) * 100).toFixed(1)}%, b ${(lift(offL.b, redL.b) * 100).toFixed(1)}%`);
console.log(`  black wall:  r ${(lift(offL.r, blackL.r) * 100).toFixed(1)}%, `
    + `g ${(lift(offL.g, blackL.g) * 100).toFixed(1)}%, b ${(lift(offL.b, blackL.b) * 100).toFixed(1)}%`);
ok(lift(offL.r, redL.r) > 0.03,
   `the bounce ADDS radiance rather than tinting it away `
   + `(red up ${(lift(offL.r, redL.r) * 100).toFixed(1)}%)`);
ok(lift(offL.r, redL.r) > lift(offL.b, redL.b) + 0.03,
   `and it is the wall's own albedo arriving, not a wash `
   + `(red ${(lift(offL.r, redL.r) * 100).toFixed(1)}% against `
   + `blue ${(lift(offL.b, redL.b) * 100).toFixed(1)}%)`);

/**
 * The probe's own measured radiance, which is the only thing that tells a
 * working bake from one that caught an empty room.
 */
console.log('\nwhat each bake caught (mean linear radiance over all six faces):');
for (const k of ['red', 'black', 'blind']) {
    const v = runs[k].bounce?.verdicts ?? [];
    console.log(`  ${k.padEnd(8)}${v.map((p) => `${p.mean.toExponential(2)}`
        + `${p.dark ? ' DARK' : ''}`).join(', ') || '(none)'}`);
}
const lit = runs.red.bounce?.verdicts?.[0];
const blind = runs.blind.bounce?.verdicts?.[0];
ok(!!lit && !lit.dark, `a probe in the lit set reports carrying light `
   + `(mean ${lit?.mean?.toExponential(2)})`);
ok(!!blind && blind.dark, `a probe behind single-sided geometry reports DARK `
   + `(mean ${blind?.mean?.toExponential(2)})`);
ok((runs.blind.diagnostics ?? []).some((d) => /caught no light/.test(d.message)),
   'and it reaches the film diagnostics, so check:3d can fail on it');
// It must not fire on a bake that worked, or it is noise.
ok(!(runs.red.diagnostics ?? []).some((d) => /caught no light/.test(d.message)),
   'and does not fire on a bake that worked');

console.log('');
if (fails.length) { for (const f of fails) console.error(`FAIL: ${f}`); process.exit(1); }
console.log(`PASS: a red wall lifts a white card's red by `
    + `${(lift(offL.r, redL.r) * 100).toFixed(1)}% and its blue by `
    + `${(lift(offL.b, redL.b) * 100).toFixed(1)}%.`);
