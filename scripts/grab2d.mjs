/**
 * Grab single PNG frames from a 2D film, at given times.
 *
 * The 3D path has had this since the AK-47 test -- `GRAB=` on produce3d --
 * and the reason is in every defect log in docs/: measurements pass while the
 * frame is wrong, and the only check that catches a model not looking like
 * the thing it is meant to be is looking at it. The 2D path had no equivalent,
 * so a character's hands could be wrong for a year and every test stay green.
 *
 *   ROOT=. FILM=demo/film.json AT=0.3,1.9 OUT=demo/out/2d npm run grab2d
 *
 * Deliberately NOT a renderer: it poses the scene at each time and draws one
 * frame, so it costs a browser launch and nothing else.
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { acquireLock } from './lib/render-lock.mjs';

const CHROME = process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = process.env.ROOT ?? new URL('..', import.meta.url).pathname;
const FILM = process.env.FILM ?? 'demo/film.json';
const OUT = process.env.OUT ?? 'demo/out/2d';
const AT = (process.env.AT ?? '0').split(',').map(Number);
/**
 * ONION=2,1,0.25 draws ghosted frames around each grabbed time.
 *
 *   ONION=2,1,0.25 AT=4.5 FILM=demo/film.json npm run grab2d
 *
 * before, after, spacing-in-seconds. The pose editor has had onion skinning
 * since it was written; the FILM path never did, so the one view that shows
 * an arc was available for a single pose and not for a shot. Spacing is
 * seconds rather than frames for the reason `src/render/onionSkin.js` gives:
 * a ghost one frame away is nearly identical to the live one.
 */
const ONION = process.env.ONION ? process.env.ONION.split(',').map(Number) : null;
if (ONION && (ONION.length !== 3 || ONION.some((n) => !Number.isFinite(n)))) {
    throw new Error('ONION takes three numbers: before,after,spacing (e.g. 2,1,0.25)');
}
/**
 * Which nodes are ghosted. Defaults to the CAST.
 *
 *   ONION_ONLY=s1/mara,s1/jonas      two characters
 *   ONION_ONLY=*                     the whole frame, scenery and all
 *
 * The default matters more than it looks. A 3D ghost is a subject against a
 * background; a 2D film's scenery IS the frame -- a sky gradient and a sea
 * are full-width rectangles -- so ghosting everything tints the whole page
 * and shows nothing. An animator ghosts the drawing that moves. Scenery
 * that genuinely moves (a parallax layer under a travelling camera) can be
 * named here, and `*` is the escape hatch.
 */
const ONION_ONLY = process.env.ONION_ONLY
    ? process.env.ONION_ONLY.split(',').map((x) => x.trim()).filter(Boolean) : null;
// Default to the authored size. Overriding it is how you check that a render
// at another resolution SCALES the film rather than cropping it -- the defect
// that shipped a 1280x720 film as a 640x360 window onto its own middle.
const WIDTH = process.env.WIDTH ? Number(process.env.WIDTH) : null;
const HEIGHT = process.env.HEIGHT ? Number(process.env.HEIGHT) : null;
const T = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
            '.json': 'application/json', '.png': 'image/png', '.css': 'text/css',
            // Audio assets, for a film that carries sound cues. Served as
            // octet-stream they still decode, but a still only needs the
            // picture -- `prepare` fetches them regardless.
            '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };

const server = createServer(async (q, r) => {
    try {
        const p = normalize(decodeURIComponent(new URL(q.url, 'http://x').pathname));
        const f = join(ROOT, p === '/' ? 'film.html' : p);
        r.writeHead(200, { 'content-type': T[extname(f)] ?? 'application/octet-stream' });
        r.end(await readFile(f));
    } catch { if (!r.headersSent) r.writeHead(404); r.end(); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

// Same lock every other headless script here takes: a second Chrome
// beside a full-size render is what gets one of them killed.
await acquireLock('grabbing frames');
const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true, protocolTimeout: 600_000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('[page]', String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text().slice(0, 300)); });

/**
 * Open the page and run `fn`, surviving the one reload the page does to
 * itself.
 *
 * `registerServiceWorker` reloads once on a first visit so the worker's
 * cross-origin-isolation headers apply -- which is correct, and documented in
 * film.html. It also destroys the execution context out from under whatever
 * `evaluate` is already running, with an error that blames "a navigation" and
 * names nothing. Puppeteer gets a fresh profile every run, so it is a first
 * visit every run. Retry once; the second load is already isolated and does
 * not reload again.
 */
async function onPage(page, url, fn) {
    for (let attempt = 0; ; attempt++) {
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForFunction(() => !!window.jirex, { timeout: 30_000 });
        try {
            return await fn();
        } catch (e) {
            if (attempt > 0 || !/context was destroyed|Execution context/i.test(String(e))) throw e;
        }
    }
}

const film = JSON.parse(await readFile(join(ROOT, FILM), 'utf8'));
const frames = await onPage(page, `${base}/film.html`, () => page.evaluate(async (f, times, size, onionSpec, only) => {
    window.jirex.setFilm(f);
    const prepared = await window.jirex.prepare({ skipVoices: true });
    // The studio's own log, which carries the asset and compile diagnostics.
    // A blank frame is almost always something it already said out loud.
    const notes = [...(document.getElementById('log')?.children ?? [])]
        .map((el) => el.textContent).filter(Boolean).slice(-10);
    /**
     * What the scene actually contains, for a caller that cannot see it.
     *
     * A blank frame has three usual causes and they are indistinguishable
     * from the PNG: nothing was built, nothing resolved its image, or
     * everything is off-camera. Count all three.
     */
    let nodes = 0, images = 0, unresolved = 0;
    prepared.scene.walk((n) => {
        nodes++;
        if (n.props?.kind !== 'image' && n.kind !== 'image') return;
        if (n.props?.image && typeof n.props.image !== 'string') images++;
        else unresolved++;
    });
    notes.push(`scene: ${nodes} nodes, ${images} images resolved, ${unresolved} not`);

    // Subtitles are attached at render time, not by the compiler, so a posed
    // scene has an EMPTY subtitle node. Most viewers watch muted, which makes
    // the subtitle part of the picture -- a still that cannot show it cannot
    // be used to check it is inside the frame. Line lengths here come from
    // the text estimate rather than from synthesis, which is right for a
    // still: what is being checked is where the words sit, not for how long.
    const { attachSubtitles } = await import('/src/studio.js');
    attachSubtitles(prepared, { cues: [], buffers: {} });

    const { Canvas2DBackend } = await import('/src/backends/canvas2d/Canvas2DBackend.js');
    const { samplePose, applyPose, createPoseBaseline, resetPose } =
        await import('/src/core/anim/Evaluator.js');
    const { applySwapSets } = await import('/src/core/scene/swapSets.js');
    const canvas = document.getElementById('stage');
    const w = size.width ?? prepared.meta.width;
    const h = size.height ?? prepared.meta.height;
    const backend = new Canvas2DBackend({ width: w, height: h });
    backend.mount(canvas, { width: w, height: h });
    const baseline = createPoseBaseline(prepared.scene, prepared.timeline);

    /** Pose the scene at `t` and draw one frame. */
    const poseAndDraw = (t) => {
        resetPose(prepared.scene, baseline);
        applyPose(prepared.scene, samplePose(prepared.timeline, t));
        applySwapSets(prepared.scene);
        return t;
    };

    /**
     * What a ghost is allowed to draw.
     *
     * This is the whole difference between onion skinning a 2D film and
     * onion skinning a pose. The editor's canvas is empty behind the rig, so
     * a ghost rendered over it is transparent where there is no ink and
     * composites correctly. A FILM is not: it has a background rectangle at
     * z -1000 and scenery that is often full-width, so every ghost arrives
     * as a solid page and the stack shows one flat wash.
     *
     * So everything outside the ghosted set is turned off for the ghost
     * renders, which gives back the transparency a 2D canvas is supposed to
     * have. The default set is the CAST -- the drawings that move, which is
     * what an animator is checking the arc of.
     *
     * The alternative the 3D path takes -- compositing additively, where
     * black contributes nothing -- is wrong here: half the films in this
     * repository are ink on light paper, and adding light to a pale
     * background does nothing at all.
     */
    const { OnionSkin, ghostMask, castRoots } =
        await import('/src/render/onionSkin.js');
    const ghosted = only ?? castRoots(f);
    const mask = ghostMask(prepared.scene, ghosted);
    const hidden = only?.includes('*') ? [] : mask.hidden;
    if (onionSpec) {
        notes.push(`onion: ghosting ${only?.includes('*') ? 'everything' : ghosted.join(', ')} `
            + `(${mask.total - hidden.length} of ${mask.total} nodes drawn in a ghost)`);
        if (!only && hidden.length === mask.total) {
            notes.push('onion: WARNING nothing matched the cast; every ghost will be blank. '
                + 'Name nodes with ONION_ONLY, or ONION_ONLY=* for the whole frame.');
        }
    }

    let onion = null;
    let ghostLayer = null;
    let onionScratch = null;
    if (onionSpec) {
        const [before, after, spacing] = onionSpec;
        onion = new OnionSkin({ before, after, spacing });
        ghostLayer = document.createElement('canvas');
        ghostLayer.width = w; ghostLayer.height = h;
        // Somewhere to recolour each ghost's ink before it is composited.
        // Without it a black subject's ghosts are black with a 15% wash and
        // past and future are indistinguishable; see `#drawTinted`.
        onionScratch = document.createElement('canvas');
        onionScratch.width = w; onionScratch.height = h;
    }

    const out = [];
    let ghostCount = 0;
    for (const t of times) {
        if (onion) {
            // The ghosts first, onto their own TRANSPARENT layer, so the
            // tint lands through each ghost's own coverage rather than over
            // the whole frame -- which is what `source-atop` needs and what
            // an opaque target would silently break.
            const gctx = ghostLayer.getContext('2d');
            gctx.clearRect(0, 0, w, h);
            ghostCount = onion.draw(gctx, {
                time: t, duration: prepared.meta.duration, width: w, height: h,
                scratch: onionScratch,
                render: (gt) => {
                    // Posed first, THEN hidden: `applyPose` rewrites keyed
                    // channels from the timeline, so an alpha set before it
                    // is overwritten on exactly the nodes that animate.
                    poseAndDraw(gt);
                    const was = hidden.map((n) => n.props.alpha ?? 1);
                    for (const n of hidden) n.props.alpha = 0;
                    backend.renderFrame(prepared.scene, prepared.cameraId);
                    hidden.forEach((n, i) => { n.props.alpha = was[i]; });
                    return backend.canvas();
                },
            });
        }
        poseAndDraw(t);
        backend.renderFrame(prepared.scene, prepared.cameraId);
        if (!onion) { out.push({ t, png: backend.canvas().toDataURL('image/png') }); continue; }
        // The live frame is opaque, so the ghosts go OVER it. Their own
        // opacity is already baked into the layer.
        const composite = document.createElement('canvas');
        composite.width = w; composite.height = h;
        const cctx = composite.getContext('2d');
        cctx.drawImage(backend.canvas(), 0, 0, w, h);
        cctx.drawImage(ghostLayer, 0, 0, w, h);
        out.push({ t, png: composite.toDataURL('image/png'), ghosts: ghostCount });
    }
    if (onion) notes.push(`onion: ${ghostCount} ghost(s) per frame, `
        + `${onionSpec[0]} behind and ${onionSpec[1]} ahead at ${onionSpec[2]}s apart`);
    notes.push(`camera: ${prepared.cameraId ?? '(none)'}, `
        + `rendered ${backend.width}x${backend.height}, `
        + `authored ${prepared.meta.width}x${prepared.meta.height}`);
    return { frames: out, notes };
}, film, AT, { width: WIDTH, height: HEIGHT }, ONION, ONION_ONLY));

for (const line of frames.notes ?? []) console.log(' ', line);
await mkdir(join(ROOT, OUT), { recursive: true });
for (const fr of frames.frames) {
    const f = join(ROOT, OUT,
                   `${ONION ? 'onion' : 't'}-${String(fr.t).replace('.', '_')}.png`);
    await writeFile(f, Buffer.from(fr.png.split(',')[1], 'base64'));
    console.log(' ', f.replace(ROOT, ''));
}
await browser.close(); server.close();
