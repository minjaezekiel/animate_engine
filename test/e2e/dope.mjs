/**
 * The curve editor, measured in pixels.
 *
 * `test/core/dope.test.mjs` proves the arithmetic: how a sheet is filtered
 * and ordered, that a clamped handle is clamped in x and free in y, that
 * `setActionEase` leaves no dead keys in the document. None of that is the
 * claim the panel makes.
 *
 * The claim is the one 37-MISSING-TOOLS.md asks for: *"an animator fixes
 * overshoot by dragging a handle, and there is nowhere to drag."* So this
 * drags one, through the panel's own code path, and measures where the
 * thing on screen ends up. Two failure modes it exists to catch, both of
 * which would leave every unit test green:
 *
 *   1. the drag writes editor-only state and never reaches the film;
 *   2. it reaches the film and nothing recompiles, so the picture is a
 *      frame of the old curve.
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
const T = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
            '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };

const srv = createServer(async (q, r) => {
    try {
        const p = normalize(decodeURIComponent(new URL(q.url, 'http://x').pathname));
        const f = join(ROOT, p === '/' ? 'film.html' : p);
        const b = await readFile(f);
        r.writeHead(200, { 'content-type': T[extname(f)] ?? 'application/octet-stream' });
        r.end(b);
    } catch { if (!r.headersSent) r.writeHead(404); r.end(); }
});
await new Promise((r) => srv.listen(0, r));
const base = `http://127.0.0.1:${srv.address().port}`;

/**
 * One black square crossing a white frame over two seconds. Flat and
 * unlit, so every number below is a statement about timing and nothing
 * else -- the same reason `test/e2e/transitions-3d.mjs` uses a grey card.
 */
const AT = 0.5;        // a quarter of the way through the move
const film = {
    version: 'jirex.film/1',
    meta: { title: 'dope', fps: 24, width: 400, height: 120 },
    characters: { box: { parts: [{ id: 'body', fill: '#000000',
                                   shape: { kind: 'rect', w: 20, h: 20, cx: true, cy: true } }] } },
    scenes: [{
        id: 's', background: { color: '#ffffff' },
        cast: [{ character: 'box', as: 'box', at: [40, 60] }],
        shots: [{ id: 'one', duration: 2, actions: [
            { target: 'box', do: 'move', to: [360, 60], at: 0, for: 2 }] }],
    }],
};

await acquireLock('the curve editor probe');
const br = await puppeteer.launch({
    executablePath: CHROME, headless: true, protocolTimeout: 600_000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
const guard = startGuard({ ms: 600_000, name: 'test:dope' });
guard.onCleanup(() => closeBrowser(br));
guard.onCleanup(() => srv.close());
const pg = await br.newPage();
const pageErrors = [];
pg.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));

/** film.html reloads itself once for its service worker; grab2d.mjs documents it. */
async function onPage(fn) {
    for (let attempt = 0; ; attempt++) {
        await pg.goto(`${base}/film.html`, { waitUntil: 'load', timeout: 120_000 });
        await pg.waitForFunction(() => !!window.jirex, { timeout: 30_000 });
        try { return await fn(); } catch (e) {
            if (attempt > 0 || !/context was destroyed|Execution context/i.test(String(e))) throw e;
        }
    }
}

const res = await onPage(() => pg.evaluate(async (f, at) => {
    const out = { steps: [] };
    await window.jirex.setFilm(f);
    const dope = window.jirex.dope;
    if (!dope) return { error: 'the panel did not build' };
    out.counts = dope.counts;

    const { compileFilm } = await import('/src/core/script/compile.js');
    const { Canvas2DBackend } = await import('/src/backends/canvas2d/Canvas2DBackend.js');
    const { samplePose, applyPose, createPoseBaseline, resetPose } =
        await import('/src/core/anim/Evaluator.js');

    /**
     * Where the ink is, horizontally, at time `at` -- the centroid of every
     * pixel darker than halfway. One number, and the only one that can tell
     * a curve that reached the renderer from one that did not.
     */
    const inkX = () => {
        const c = compileFilm(window.jirex.film);
        const w = c.meta.width, h = c.meta.height;
        const canvas = document.createElement('canvas');
        const backend = new Canvas2DBackend({ width: w, height: h });
        backend.mount(canvas, { width: w, height: h });
        resetPose(c.scene, createPoseBaseline(c.scene, c.timeline));
        applyPose(c.scene, samplePose(c.timeline, at));
        backend.renderFrame(c.scene, c.cameraId);
        const px = backend.canvas().getContext('2d').getImageData(0, 0, w, h).data;
        let sum = 0, n = 0;
        for (let i = 0; i < px.length; i += 4) {
            if (px[i] > 127) continue;
            sum += (i / 4) % w; n++;
        }
        return { x: n ? sum / n : null, pixels: n };
    };

    // The `move` is the only action; select it the way a click does.
    dope.select(0);
    out.selected = dope.selected && { verb: dope.selected.verb, ease: dope.selected.ease };

    out.before = inkX();
    out.filmBefore = structuredClone(window.jirex.film.scenes[0].shots[0].actions[0]);

    // A named ease has no handles. Pressing `bezier` is what gives it some,
    // and is the step an animator takes before there is anything to drag.
    dope.setEase('bezier');
    out.afterBezier = structuredClone(window.jirex.film.scenes[0].shots[0].actions[0]);
    out.neutral = inkX();

    // Drag the outgoing handle hard to the right: a late, snappy start.
    out.handles = dope.dragHandle(0, [0.95, 0]);
    out.filmAfter = structuredClone(window.jirex.film.scenes[0].shots[0].actions[0]);
    out.after = inkX();

    // And the other way: an early start, which must overtake the default.
    dope.dragHandle(0, [0.02, 0]);
    dope.dragHandle(1, [0.1, 1]);
    out.early = inkX();

    // Overshoot leaves the unit square -- the thing a named ease cannot say.
    dope.dragHandle(0, [0.3, 0]);
    dope.dragHandle(1, [0.3, 1.5]);
    out.overshootHandles = window.jirex.film.scenes[0].shots[0].actions[0].h;
    out.overshoot = (() => {
        const c = compileFilm(window.jirex.film);
        return c.timeline.tracks.find((t) => t.target === 's/box' && t.path === 'transform.x');
    })();

    out.countsAfter = dope.counts;
    return out;
}, film, AT));

await guard.done();

const fails = [];
const ok = (cond, line) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${line}`); if (!cond) fails.push(line); };
if (pageErrors.length) fails.push(`page errors: ${pageErrors.join(' | ')}`);
if (res.error) { console.error(res.error); process.exit(1); }

console.log(`\npanel: ${res.counts.actions} action(s), ${res.counts.channels} channel(s), `
    + `${res.counts.keys} key(s)`);
console.log(`selected: ${JSON.stringify(res.selected)}`);
console.log(`\nthe action in the film document:`);
console.log(`  before      ${JSON.stringify(res.filmBefore)}`);
console.log(`  press B     ${JSON.stringify(res.afterBezier)}`);
console.log(`  after drag  ${JSON.stringify(res.filmAfter)}`);
console.log(`\nwhere the ink is at ${AT}s, in pixels:`);
for (const k of ['before', 'neutral', 'after', 'early']) {
    console.log(`  ${k.padEnd(8)} ${res[k].x === null ? '(nothing drawn)' : res[k].x.toFixed(1)} px`
        + `  (${res[k].pixels} px of ink)`);
}

ok(res.counts.actions === 1, 'the panel found the film\'s one action');
ok(res.counts.channels > 0 && res.counts.keys > 0,
   `and the compiled channels beside it (${res.counts.channels} channels, ${res.counts.keys} keys)`);
ok(res.filmBefore.h === undefined && res.afterBezier.ease === 'bezier'
   && Array.isArray(res.afterBezier.h),
   'choosing bezier gives the action handles in the FILM, not in the editor');
ok(JSON.stringify(res.filmAfter.h) === JSON.stringify(res.handles),
   `the drag wrote those handles back: ${JSON.stringify(res.filmAfter.h)}`);
ok(res.before.pixels > 100 && res.after.pixels > 100, 'there is ink to measure in both');

const moved = res.after.x - res.neutral.x;
console.log(`\na late start moves the subject ${moved.toFixed(1)} px behind the default ease`);
ok(moved < -20, `dragging the handle moves the rendered frame (${moved.toFixed(1)} px)`);
ok(res.early.x > res.neutral.x + 20,
   `and dragging it the other way overtakes the default `
   + `(+${(res.early.x - res.neutral.x).toFixed(1)} px)`);

const vals = res.overshoot.keys.map((k) => k.v);
ok(res.overshootHandles[3] > 1,
   `overshoot is expressible at all: h = [${res.overshootHandles.join(', ')}]`);
ok(Math.max(...vals) <= 360, 'and it is in the curve, not in the keys -- the keys are unchanged');

console.log('');
if (fails.length) { for (const f of fails) console.error(`FAIL: ${f}`); process.exit(1); }
console.log(`PASS: a dragged handle reaches the film and moves the frame by ${Math.abs(moved).toFixed(1)} px.`);
