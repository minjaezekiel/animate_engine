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
const frames = await onPage(page, `${base}/film.html`, () => page.evaluate(async (f, times, size) => {
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
    const out = [];
    for (const t of times) {
        resetPose(prepared.scene, baseline);
        applyPose(prepared.scene, samplePose(prepared.timeline, t));
        applySwapSets(prepared.scene);
        backend.renderFrame(prepared.scene, prepared.cameraId);
        out.push({ t, png: backend.canvas().toDataURL('image/png') });
    }
    notes.push(`camera: ${prepared.cameraId ?? '(none)'}, `
        + `rendered ${backend.width}x${backend.height}, `
        + `authored ${prepared.meta.width}x${prepared.meta.height}`);
    return { frames: out, notes };
}, film, AT, { width: WIDTH, height: HEIGHT }));

for (const line of frames.notes ?? []) console.log(' ', line);
await mkdir(join(ROOT, OUT), { recursive: true });
for (const fr of frames.frames) {
    const f = join(ROOT, OUT, `t-${String(fr.t).replace('.', '_')}.png`);
    await writeFile(f, Buffer.from(fr.png.split(',')[1], 'base64'));
    console.log(' ', f.replace(ROOT, ''));
}
await browser.close(); server.close();
