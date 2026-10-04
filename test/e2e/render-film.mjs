/**
 * End-to-end render verification in headless Chrome.
 *
 * Strategy: render the FULL frame count at a tiny resolution. Same code path,
 * 1/72 the pixels, seconds instead of minutes -- so the things that actually
 * break (frame count, duration, a camera that stops moving) are caught
 * without waiting for a two-minute encode.
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const CHROME = process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('../..', import.meta.url).pathname;

const TYPES = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.json': 'application/json', '.webmanifest': 'application/manifest+json',
    '.png': 'image/png', '.css': 'text/css', '.txt': 'text/plain',
};

function serve() {
    const server = createServer(async (req, res) => {
        try {
            const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
            const file = join(ROOT, path === '/' ? 'film.html' : path);
            if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
            const body = await readFile(file);
            res.writeHead(200, {
                'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
                'cross-origin-opener-policy': 'same-origin',
                'cross-origin-embedder-policy': 'require-corp',
            });
            res.end(body);
        } catch { res.writeHead(404).end('not found'); }
    });
    return new Promise((r) => server.listen(0, () => r({ server, port: server.address().port })));
}

const { server, port } = await serve();
const base = `http://127.0.0.1:${port}`;

const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required',
           '--use-fake-ui-for-media-stream', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
});

await page.goto(`${base}/film.html`, { waitUntil: 'networkidle2' });

const result = await page.evaluate(async (origin) => {
    const out = { steps: [] };
    const { FilmStudio, Canvas2DBackend, renderOffline, MemorySink, compileFilm, trackValueAt } =
        await import(`${origin}/src/studio.js`);

    const film = await (await fetch(`${origin}/demo/film.json`)).json();

    // --- 1. compile: timing and structure
    const compiled = compileFilm(film);
    out.compile = {
        duration: compiled.meta.duration,
        frames: compiled.meta.frames,
        nodes: compiled.scene.byId.size,
        tracks: compiled.timeline.tracks.length,
        instances: compiled.timeline.instances.length,
        dialogue: compiled.lipsyncJobs.length,
        problems: compiled.diagnostics.filter((d) => d.severity !== 'info').length,
    };

    // --- 2. camera must keep moving across the whole film
    const camX = compiled.timeline._index.get('__camera\u0000transform.x');
    const samples = [];
    for (let t = 0; t <= compiled.meta.duration; t += 4) {
        samples.push(+trackValueAt(camX, t).toFixed(1));
    }
    out.cameraSamples = samples;
    out.cameraMoves = new Set(samples).size > samples.length * 0.5;

    // --- 3. full frame count at 160x90, with frame digests
    const W = 160, H = 90, FPS = 24;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const backend = new Canvas2DBackend({ width: W, height: H });
    backend.mount(canvas, { width: W, height: H });

    // willReadFrequently matters here: without it Chrome may move the canvas
    // between GPU and CPU rasterization during frequent getImageData calls,
    // which perturbs antialiasing and makes a pixel digest look
    // non-deterministic even when the scene state is identical.
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const digest = () => {
        const d = ctx.getImageData(0, 0, W, H).data;
        let h = 2166136261;
        for (let i = 0; i < d.length; i += 97) { h ^= d[i]; h = Math.imul(h, 16777619); }
        return (h >>> 0).toString(36);
    };

    const studio = new FilmStudio({ onLog: (m) => out.steps.push(m) });
    const prepared = await studio.prepare(film, { assets: {}, audioBuffers: {}, retime: false });
    out.prepareProblems = prepared.diagnostics.filter((d) => d.severity === 'error').length;
    out.audio = prepared.audio
        ? { duration: +prepared.audio.duration.toFixed(3), rate: prepared.audio.sampleRate,
            channels: prepared.audio.numberOfChannels }
        : null;
    out.cueCount = prepared.cues.length;
    out.lipsyncTracks = prepared.timeline.tracks
        .filter((t) => t.path === 'props.viseme').length;
    out.subtitleTrack = !!prepared.timeline.tracks.find((t) => t.target === '__subtitle');

    const sink = new MemorySink({ digest });
    const t0 = performance.now();
    const proxy = await renderOffline({
        scene: prepared.scene, timeline: prepared.timeline, backend,
        cameraId: prepared.cameraId, fps: FPS, width: W, height: H,
        durationSec: prepared.meta.duration, sink,
        beforeFrame: null,
    });
    out.proxy = {
        frames: proxy.count,
        ms: Math.round(performance.now() - t0),
        timestampsExact: proxy.frames.every((f) => f.tSec === f.frameIndex / FPS),
        firstT: proxy.frames[0].tSec,
        lastT: proxy.frames[proxy.frames.length - 1].tSec,
        uniqueDigests: new Set(proxy.frames.map((f) => f.digest)).size,
        goldenSample: [0, 240, 720, 1440, 2160, 2879]
            .map((n) => proxy.frames[n]?.digest ?? null),
    };

    // --- 4. determinism.
    //
    // Asserted on the DRAW CALL stream, not on pixels. Encoders and
    // rasterizers are not required to be bit-reproducible; the renderer is.
    // Comparing the call stream tests exactly that property and cannot be
    // perturbed by GPU/CPU raster switches.
    const { RecordingContext, RecordingPath2D } =
        await import(`${origin}/src/backends/canvas2d/RecordingContext.js`);
    const runCalls = () => {
        const rctx = new RecordingContext({ width: W, height: H });
        const rb = new Canvas2DBackend({
            ctx: rctx, width: W, height: H, Path2DImpl: RecordingPath2D,
        });
        return renderOffline({
            scene: prepared.scene, timeline: prepared.timeline, backend: rb,
            cameraId: prepared.cameraId, fps: FPS, width: W, height: H,
            durationSec: prepared.meta.duration,
            sink: new MemorySink({ digest: () => rctx.log().join('|') }),
            beforeFrame: () => { rctx.calls.length = 0; },
        });
    };
    const ca = await runCalls();
    const cb = await runCalls();
    out.deterministic = ca.frames.every((f, i) => f.digest === cb.frames[i].digest);
    if (!out.deterministic) {
        const i = ca.frames.findIndex((f, k) => f.digest !== cb.frames[k].digest);
        const A = ca.frames[i].digest.split('|');
        const B = cb.frames[i].digest.split('|');
        const j = A.findIndex((x, k) => x !== B[k]);
        out.firstDivergence = { frame: i, tSec: ca.frames[i].tSec, call: j, a: A[j], b: B[j] };
    }
    out.drawCallsPerFrame = Math.round(ca.frames[0].digest.split('|').length);

    // Pixel stability is reported but not asserted, for the raster reason above.
    const sink2 = new MemorySink({ digest });
    const proxy2 = await renderOffline({
        scene: prepared.scene, timeline: prepared.timeline, backend,
        cameraId: prepared.cameraId, fps: FPS, width: W, height: H,
        durationSec: prepared.meta.duration, sink: sink2,
    });
    out.pixelStable = proxy.frames.every((f, i) => f.digest === proxy2.frames[i].digest);

    // --- 5. encoder availability
    out.encoders = {
        mediaRecorder: typeof MediaRecorder !== 'undefined'
            && typeof HTMLCanvasElement.prototype.captureStream === 'function',
        webCodecs: typeof VideoEncoder !== 'undefined',
        offlineAudio: typeof OfflineAudioContext !== 'undefined',
    };
    return out;
}, base);

console.log(JSON.stringify(result, null, 2));
console.log('\npage errors:', errors.length ? errors.slice(0, 6) : 'none');

await browser.close();
server.close();

// --- assertions
const fail = [];
if (result.compile.duration !== 120) fail.push(`duration ${result.compile.duration} != 120`);
if (result.compile.frames !== 2880) fail.push(`frames ${result.compile.frames} != 2880`);
if (result.compile.problems !== 0) fail.push(`${result.compile.problems} compile problems`);
if (result.proxy.frames !== 2880) fail.push(`rendered ${result.proxy.frames} frames != 2880`);
if (!result.proxy.timestampsExact) fail.push('timestamps not exactly n/fps');
if (!result.deterministic) fail.push('render is not deterministic');
if (!result.cameraMoves) fail.push('camera barely moves across the film');
if (result.proxy.uniqueDigests < 500) fail.push(`only ${result.proxy.uniqueDigests} distinct frames`);
if (result.prepareProblems > 0) fail.push(`${result.prepareProblems} prepare errors`);

if (fail.length) {
    console.error('\nFAILED:\n - ' + fail.join('\n - '));
    process.exit(1);
}
console.log('\nPASS: 2880 frames, exact timestamps, deterministic, camera active.');
