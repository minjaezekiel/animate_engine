/**
 * 3D transitions, measured on real pixels.
 *
 * The unit tests in `test/core/transitions.test.mjs` prove the arithmetic:
 * what coverage a transition has at t, and what ops that produces. They
 * cannot prove the two things that actually matter in a finished file --
 * that the ops reach the frame the encoder sees, and that "fully covered"
 * means every pixel.
 *
 * Both have burned this repo before. An overlay drawn into a DOM layer shows
 * in a preview and is absent from the file, which is why `Overlay2D` is a
 * canvas; and a wipe whose soft edge stops at the frame edge leaves a
 * translucent strip down one side for every held frame, which no check that
 * samples the middle of the frame can see.
 *
 * So this measures `clippedLow` -- the fraction of pixels below 2% luma --
 * at known instants of a film built for the purpose. A fully covered frame
 * is 1.0 and nothing else is.
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

/**
 * A deliberately boring film: a bright unlit backdrop, four 2-second shots,
 * one transition kind each. Unlit and flat so that every number below is a
 * statement about the transition and not about lighting.
 */
const film = {
    version: 'jirex.film3d/1',
    meta: { title: 'transitions', fps: 24, width: 320, height: 180,
            background: '#d8d8d8' },
    materials: { pale: { color: '#e8e8e8', roughness: 1, metalness: 0,
                         emissive: '#e8e8e8', emissiveIntensity: 1 } },
    lights: [{ id: 'amb', type: 'ambient', color: '#ffffff', intensity: 1 }],
    assemblies: {
        card: { parts: [{ id: 'face', geometry: { kind: 'plane', width: 60, height: 60 },
                          material: 'pale' }] },
    },
    cast: [{ assembly: 'card', as: 'card', at: [0, 0, 0], set: true }],
    scenes: [{
        id: 's1',
        transitionOut: { kind: 'iris', duration: 1 },
        shots: [
            { id: 'a', duration: 2, transition: { kind: 'fade', duration: 1 },
              camera: { from: { at: [0, 0, 12], look: [0, 0, 0] }, for: 0 } },
            { id: 'b', duration: 2, transition: { kind: 'dip', duration: 1 },
              camera: { from: { at: [0, 0, 12], look: [0, 0, 0] }, for: 0 } },
            { id: 'c', duration: 2, transition: { kind: 'wipe', duration: 1, dir: 'left' },
              camera: { from: { at: [0, 0, 12], look: [0, 0, 0] }, for: 0 } },
            { id: 'd', duration: 2,
              camera: { from: { at: [0, 0, 12], look: [0, 0, 0] }, for: 0 } },
        ],
    }],
};

// `clippedLow` is measured on a 160x90 downscale, so a half-covered frame
// lands near 0.5 rather than exactly on it.
const NEAR = 0.06;
const AT = [
    { t: 0.00, shotId: 'a', want: { low: 1 }, why: 'a fade IN begins fully covered' },
    { t: 0.50, shotId: 'a', want: { low: 0 }, why: 'and is half open by its midpoint' },
    { t: 1.50, shotId: 'a', want: { low: 0 }, why: 'with no transition, the frame is clear' },
    { t: 2.00, shotId: 'b', want: { low: 1 }, why: 'a dip is fully covered AT the cut' },
    { t: 2.50, shotId: 'b', want: { low: 0 }, why: 'and open again half a second later' },
    { t: 4.00, shotId: 'c', want: { low: 1 },
      why: 'a wipe covers EVERY pixel at full coverage -- no strip down the far edge' },
    { t: 3.75, shotId: 'c', want: { low: 0.5 }, why: 'and half of them halfway through' },
    { t: 8.00, shotId: 'd', want: { low: 1 }, why: 'an iris closes completely at the end' },
    { t: 7.75, shotId: 'd', want: { low: 0.5, atLeast: true },
      why: 'and covers the corners first, which is most of a 16:9 frame' },
];

await acquireLock('the 3D transition probe');
const br = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=metal'],
    protocolTimeout: 600_000,
});
/**
 * A ceiling on the outcome, not a performance budget. Before this existed an
 * e2e script had a third outcome besides pass and fail -- "never" -- and
 * `test:legacy` took it for 2h31m. See test/e2e/lib/guard.mjs.
 */
const guard = startGuard({ ms: 900_000, name: 'test:transitions:e2e' });
guard.onCleanup(() => closeBrowser(br));
guard.onCleanup(() => srv.close());
const pg = await br.newPage();
const pageErrors = [];
pg.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));
await pg.goto(`${base}/film3d.html`, { waitUntil: 'load', timeout: 120_000 });
await pg.waitForFunction(() => typeof window.render3d === 'function', { timeout: 30000 });

const res = await pg.evaluate((f, times) => window.render3d(f, {
    width: 320, height: 180, silent: true, check: times,
}), film, AT.map(({ t, shotId }) => ({ t, shotId })));

await guard.done();

const fails = [];
if (pageErrors.length) fails.push(`page errors: ${pageErrors.join(' | ')}`);
for (const d of res.diagnostics ?? []) {
    fails.push(`unexpected compile diagnostic: ${d.message}`);
}
for (const f of res.transitions ?? []) {
    if (f.severity !== 'note') fails.push(`unexpected transition finding: ${f.message}`);
}

console.log('\n  t      shot  clippedLow  mean   expected');
for (const [i, want] of AT.entries()) {
    const s = res.samples[i];
    const low = s.clippedLow;
    const target = want.want.low;
    const ok = want.want.atLeast ? low >= target - NEAR : Math.abs(low - target) <= NEAR;
    console.log(`  ${String(want.t).padEnd(6)} ${want.shotId.padEnd(5)} `
        + `${low.toFixed(3).padEnd(11)} ${s.mean.toFixed(3)}  ${ok ? 'ok' : 'FAIL'}  ${want.why}`);
    if (!ok) {
        fails.push(`t=${want.t} (${want.shotId}): clippedLow ${low.toFixed(3)}, `
            + `expected ${want.want.atLeast ? '>= ' : ''}${target} -- ${want.why}`);
    }
}

// A clear frame must actually be bright, or every "covered" number above
// would also pass on a film that rendered nothing at all.
const clear = res.samples[2];
if (clear.mean < 0.4) {
    fails.push(`the uncovered frame has mean luma ${clear.mean.toFixed(3)}; `
        + 'the probe is measuring a black render, not a transition');
}

if (fails.length) {
    console.log('\nFAIL');
    for (const f of fails) console.log(`  - ${f}`);
    process.exit(1);
}
console.log(`\nPASS  fade, dip, wipe and iris measured on real pixels over `
    + `${res.samples.length} samples of a ${res.duration}s film`);
