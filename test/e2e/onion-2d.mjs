/**
 * Onion skinning on the 2D FILM path.
 *
 * The pose editor (`studio.html`) has had onion skinning since it was
 * written, so the one view that shows an arc was available for a single
 * pose and never for a shot. Phase 66 took it to the 3D film path; this is
 * the 2D one, and it is not the same job.
 *
 * **The 3D answer is wrong here.** A 3D render is opaque, so Phase 66
 * composites ghosts ADDITIVELY -- black contributes nothing and lit pixels
 * brighten. Half the films in this repository are ink on light paper, and
 * adding light to a pale background does nothing at all. So the 2D path
 * suppresses each scene's background node for the ghost renders, which
 * gives back the transparency a 2D canvas is supposed to have, and
 * composites with ordinary alpha.
 *
 * This measures that on deliberately LIGHT paper, because that is the case
 * the additive route cannot serve: the ghosts must come out DARKER than the
 * page, and tinted.
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

const W = 640, H = 120;
const PAPER = '#eceadf';           // the sage-paper case, from the forex series
const SPACING = 0.3, AT = 1.0;

const film = {
    version: 'jirex.film/1',
    meta: { title: 'onion2d', fps: 24, width: W, height: H },
    characters: { box: { parts: [{ id: 'body', fill: '#101010',
                                   shape: { kind: 'rect', w: 24, h: 24, cx: true, cy: true } }] } },
    scenes: [{
        id: 's', background: { color: PAPER },
        cast: [{ character: 'box', as: 'box', at: [60, 60] }],
        shots: [
            // Shot one is on ones: the plain case.
            { id: 'one', duration: 2, actions: [
                { target: 'box', do: 'move', to: [580, 60], at: 0, for: 2, ease: 'linear' }] },
            // Shot two is exposed on THREES, which is where counting in
            // seconds and counting in drawings stop agreeing.
            // ...and travels back, or every ghost would land on the same
            // spot and prove nothing.
            { id: 'two', duration: 2, step: 3, actions: [
                { target: 'box', do: 'move', to: [60, 60], at: 0, for: 2, ease: 'linear' }] },
        ],
    }],
};

await acquireLock('the 2D onion probe');
const br = await puppeteer.launch({
    executablePath: CHROME, headless: true, protocolTimeout: 600_000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
const guard = startGuard({ ms: 600_000, name: 'test:onion2d' });
guard.onCleanup(() => closeBrowser(br));
guard.onCleanup(() => srv.close());
const pg = await br.newPage();
const pageErrors = [];
pg.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));

async function onPage(fn) {
    for (let attempt = 0; ; attempt++) {
        await pg.goto(`${base}/film.html`, { waitUntil: 'load', timeout: 120_000 });
        await pg.waitForFunction(() => !!window.jirex, { timeout: 30_000 });
        try { return await fn(); } catch (e) {
            if (attempt > 0 || !/context was destroyed|Execution context/i.test(String(e))) throw e;
        }
    }
}

const res = await onPage(() => pg.evaluate(async (f, at, spacing, w, h) => {
    const { compileFilm } = await import('/src/core/script/compile.js');
    const { Canvas2DBackend } = await import('/src/backends/canvas2d/Canvas2DBackend.js');
    const { samplePose, applyPose, createPoseBaseline, resetPose } =
        await import('/src/core/anim/Evaluator.js');
    const { applySwapSets } = await import('/src/core/scene/swapSets.js');
    const { OnionSkin, ghostMask, castRoots } = await import('/src/render/onionSkin.js');
    const { ghostPlan, shotWindow } = await import('/src/core/anim/onion.js');
    const { filmShots } = await import('/src/core/script/compile.js');
    const shots = filmShots(f);

    const c = compileFilm(f);
    const backend = new Canvas2DBackend({ width: w, height: h });
    backend.mount(document.createElement('canvas'), { width: w, height: h });
    const baseline = createPoseBaseline(c.scene, c.timeline);
    // The same mask `scripts/grab2d.mjs` uses, so the probe measures the
    // shipped rule and not a second copy of it.
    const hidden = ghostMask(c.scene, castRoots(f)).hidden;

    const pose = (t) => {
        resetPose(c.scene, baseline);
        applyPose(c.scene, samplePose(c.timeline, t));
        applySwapSets(c.scene);
    };

    const frameAt = (t, { onion = null, plan = null } = {}) => {
        const out = document.createElement('canvas');
        out.width = w; out.height = h;
        const octx = out.getContext('2d');
        let ghosts = 0;
        if (onion) {
            const layer = document.createElement('canvas');
            layer.width = w; layer.height = h;
            const scratch = document.createElement('canvas');
            scratch.width = w; scratch.height = h;
            ghosts = onion.draw(layer.getContext('2d'), {
                plan,
                time: t, duration: c.meta.duration, width: w, height: h, scratch,
                render: (gt) => {
                    // Posed first, THEN hidden: `applyPose` rewrites keyed
                    // channels, so an alpha set before it is overwritten on
                    // exactly the nodes that animate.
                    pose(gt);
                    const was = hidden.map((n) => n.props.alpha ?? 1);
                    for (const n of hidden) n.props.alpha = 0;
                    backend.renderFrame(c.scene, c.cameraId);
                    hidden.forEach((n, i) => { n.props.alpha = was[i]; });
                    return backend.canvas();
                },
            });
            pose(t);
            backend.renderFrame(c.scene, c.cameraId);
            octx.drawImage(backend.canvas(), 0, 0, w, h);
            octx.drawImage(layer, 0, 0, w, h);
        } else {
            pose(t);
            backend.renderFrame(c.scene, c.cameraId);
            octx.drawImage(backend.canvas(), 0, 0, w, h);
        }
        return { ghosts, data: octx.getImageData(0, Math.floor(h / 2), w, 1).data };
    };

    /**
     * Clusters that differ from the paper, with each one's mean colour.
     * Measured as a difference from the page rather than as brightness,
     * because on light paper a ghost is DARKER than its background and a
     * luma threshold tuned for a dark frame finds nothing.
     */
    const clusters = (row, paper) => {
        const out = [];
        let run = null;
        for (let x = 0; x < w; x++) {
            const i = x * 4;
            const diff = Math.abs(row[i] - paper[0]) + Math.abs(row[i + 1] - paper[1])
                + Math.abs(row[i + 2] - paper[2]);
            if (diff > 10) {
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
    };

    const plainRow = frameAt(at).data;
    const paper = [plainRow[0], plainRow[1], plainRow[2]];
    const onion = new OnionSkin({ before: 2, after: 2, spacing });
    const lit = frameAt(at, { onion, plan: ghostPlan(c.timeline, {
        target: 's/box', time: at, before: 2, after: 2, step: 'second', spacing,
        within: shotWindow(shots, at),
    }) });

    /**
     * Shot two is exposed on threes. At 24 fps a drawing lasts 0.125 s, so
     * two ghosts counted in SECONDS at 0.05 s apart both land inside the
     * same held drawing and render as one cluster; counted in DRAWINGS they
     * are two different drawings and render as two.
     */
    const ON_THREES = 3.0;
    const threesDrawings = frameAt(ON_THREES, { onion, plan: ghostPlan(c.timeline, {
        target: 's/box', time: ON_THREES, before: 2, after: 2, step: 'drawing',
        within: shotWindow(shots, ON_THREES),
    }) });
    const threesSeconds = frameAt(ON_THREES, { onion, plan: ghostPlan(c.timeline, {
        target: 's/box', time: ON_THREES, before: 2, after: 2, step: 'second', spacing: 0.05,
        within: shotWindow(shots, ON_THREES),
    }) });

    /**
     * Just after the cut. Counted against the FILM, the ghosts behind reach
     * back into shot one -- a drawing from another scene. Counted against
     * the SHOT they do not exist.
     */
    const AFTER_CUT = 2 + 1 / 24;
    const acrossCut = ghostPlan(c.timeline, {
        target: 's/box', time: AFTER_CUT, before: 3, after: 0,
        step: 'frame', duration: c.meta.duration,
    });
    const insideShot = ghostPlan(c.timeline, {
        target: 's/box', time: AFTER_CUT, before: 3, after: 0,
        step: 'frame', within: shotWindow(shots, AFTER_CUT),
    });

    return {
        paper, ghosts: lit.ghosts,
        plain: clusters(plainRow, paper),
        onion: clusters(lit.data, paper),
        threes: {
            drawings: clusters(threesDrawings.data, paper),
            seconds: clusters(threesSeconds.data, paper),
            planDrawings: ghostPlan(c.timeline, {
                target: 's/box', time: ON_THREES, before: 2, after: 2, step: 'drawing',
                within: shotWindow(shots, ON_THREES),
            }).map((g) => Math.round(g.time * 24)),
            planSeconds: ghostPlan(c.timeline, {
                target: 's/box', time: ON_THREES, before: 2, after: 2, step: 'second',
                spacing: 0.05, within: shotWindow(shots, ON_THREES),
            }).map((g) => Math.round(g.time * 24)),
        },
        cut: { across: acrossCut.map((g) => +g.time.toFixed(4)),
               inside: insideShot.map((g) => +g.time.toFixed(4)) },
    };
}, film, AT, SPACING, W, H));

await guard.done();

const fails = [];
const ok = (cond, line) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${line}`); if (!cond) fails.push(line); };
if (pageErrors.length) fails.push(`page errors: ${pageErrors.join(' | ')}`);

const paperLuma = Math.round(res.paper.reduce((a, b) => a + b, 0) / 3);
console.log(`\npaper rgb(${res.paper.join(', ')}), luma ${paperLuma} — the light case`);
console.log(`ghosts drawn: ${res.ghosts}\n`);
console.log('clusters along the mid scanline:');
for (const c of res.onion) {
    console.log(`  x ${String(c.at).padStart(4)}  ${String(c.width).padStart(3)} px  `
        + `rgb(${c.r}, ${c.g}, ${c.b})  luma ${c.luma}  `
        + `${c.r - c.b > 6 ? 'warm' : c.b - c.r > 6 ? 'cool' : 'neutral'}`);
}
console.log(`  without onion: ${res.plain.length} cluster(s)`);

ok(res.ghosts === 4, `four ghosts were drawn (got ${res.ghosts})`);
ok(res.plain.length === 1, 'with onion off the frame has one subject');
ok(res.onion.length === 5, `and with it on, five (got ${res.onion.length})`);
if (res.onion.length === 5) {
    const [far, near, live, nearAhead, farAhead] = res.onion;
    // The claim the additive route cannot make: on light paper a ghost is
    // DARKER than the page.
    ok(near.luma < paperLuma - 10,
       `a ghost is darker than the paper (${near.luma} against ${paperLuma})`);
    ok(live.luma < near.luma && live.luma < nearAhead.luma,
       `the live frame is the darkest (${live.luma})`);
    ok(far.luma > near.luma && farAhead.luma > nearAhead.luma,
       'and each further ghost is fainter than the one nearer the playhead');
    const behind = near.r - near.b, ahead = nearAhead.b - nearAhead.r;
    console.log(`\ntint: behind is ${behind} redder, ahead is ${ahead} bluer`);
    ok(behind > 6, `the past is tinted warm (R-B = ${behind})`);
    ok(ahead > 6, `the future is tinted cool (B-R = ${ahead})`);
    const gap = near.at - far.at;
    ok(Math.abs((live.at - near.at) - gap) <= 2,
       `evenly spaced, ${gap} px for ${SPACING}s of a linear move`);
}

// ------------------------------------------- drawings, not instants

console.log(`\nshot two is exposed on THREES; at 3.0s the drawing shows on frame `
    + `${Math.round(3 * 24 / 3) * 3}`);
console.log(`  counted in drawings  frames ${res.threes.planDrawings.join(', ')}`
    + `  -> ${res.threes.drawings.length} clusters`);
console.log(`  counted in seconds   frames ${res.threes.planSeconds.join(', ')}`
    + `  -> ${res.threes.seconds.length} clusters`);

ok(res.threes.drawings.length === 5,
   `counting in DRAWINGS gives four distinct ghosts and the live frame `
   + `(${res.threes.drawings.length})`);
ok(res.threes.seconds.length < res.threes.drawings.length,
   `counting in seconds collapses ghosts onto the same held drawing `
   + `(${res.threes.seconds.length} clusters)`);
ok(res.threes.planDrawings.every((f) => f % 3 === 0),
   `and every drawing-stepped ghost lands on a drawing (${res.threes.planDrawings.join(', ')})`);
ok(!res.threes.planSeconds.every((f) => f % 3 === 0),
   `where a second-stepped ghost asks for frames that are not drawings `
   + `(${res.threes.planSeconds.join(', ')})`);

// ------------------------------------------------------- the cut

console.log(`\njust after the cut at 2.0s:`);
console.log(`  clamped to the film  ${res.cut.across.join(', ')}`);
console.log(`  clamped to the shot  ${res.cut.inside.join(', ') || '(none behind)'}`);
ok(res.cut.across.some((t) => t < 2),
   'clamped to the film, ghosts reach back across the cut into another scene');
ok(res.cut.inside.every((t) => t >= 2),
   'clamped to the shot, none of them do');

console.log('');
if (fails.length) { for (const f of fails) console.error(`FAIL: ${f}`); process.exit(1); }
console.log(`PASS: ${res.ghosts} ghosts on light paper, on the author's own drawings, `
    + 'inside the shot.');
