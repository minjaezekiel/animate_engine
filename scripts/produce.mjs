/**
 * Produce the finished film: real TTS voices, full duration, saved to disk.
 *
 * Runs the same code path the app uses, driven through headless Chrome so the
 * browser APIs the pipeline depends on (OfflineAudioContext, MediaRecorder,
 * WebCodecs, the TTS worker) are the real ones.
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const CHROME = process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('..', import.meta.url).pathname;
const FILM = process.env.FILM ?? 'demo/film.json';
const OUT = process.env.OUT ?? 'demo/out/the-keeper.webm';
const WIDTH = Number(process.env.WIDTH ?? 1280);
const HEIGHT = Number(process.env.HEIGHT ?? 720);
const FPS = Number(process.env.FPS ?? 24);
const USE_TTS = process.env.NO_TTS !== '1';

const TYPES = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.json': 'application/json', '.png': 'image/png', '.txt': 'text/plain',
    '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm',
};

const server = createServer(async (req, res) => {
    try {
        const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
        const f = join(ROOT, p === '/' ? 'film.html' : p);
        if (!f.startsWith(ROOT)) { res.writeHead(403).end(); return; }
        const body = await readFile(f);
        res.writeHead(200, {
            'content-type': TYPES[extname(f)] ?? 'application/octet-stream',
            'cross-origin-opener-policy': 'same-origin',
            'cross-origin-embedder-policy': 'credentialless',
        });
        res.end(body);
    } catch {
        if (!res.headersSent) res.writeHead(404);
        res.end('not found');
    }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
console.log(`serving ${ROOT} at ${base}`);

const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    protocolTimeout: 1_800_000,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required',
           '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream',
           '--disable-backgrounding-occluded-windows',
           '--disable-renderer-backgrounding'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('  [page error]', String(e).slice(0, 200)));
page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !t.includes('404')) console.error('  [console]', t.slice(0, 200));
});
// `load`, not `networkidle2`: the page registers a service worker, so network
// quiet is no longer a signal that the page is ready.
await page.goto(`${base}/film.html`, { waitUntil: 'load' });

await page.exposeFunction('report', (msg) => console.log('  ' + msg));

const result = await page.evaluate(async (origin, cfg) => {
    const { FilmStudio } = await import(`${origin}/src/studio.js`);
    const studio = new FilmStudio({ onLog: (m) => window.report(m) });
    const film = await (await fetch(`${origin}/${cfg.film}`)).json();

    const notes = [];
    let ttsOk = false;
    if (cfg.useTts) {
        try {
            ttsOk = await studio.tts.available();
            window.report(`TTS available: ${ttsOk}`);
            if (ttsOk) {
                // Pre-fetch both voices so the render does not stall mid-way.
                for (const spec of Object.values(film.voices ?? {})) {
                    const id = String(spec.spec).split(':')[1];
                    if (!id) continue;
                    window.report(`fetching voice ${id} ...`);
                    await studio.tts.prefetch(id);
                    window.report(`  ${id} ready`);
                }
            }
        } catch (e) {
            notes.push(`TTS unavailable: ${e.message}`);
            window.report(`TTS failed: ${e.message}`);
            ttsOk = false;
        }
    }

    // Without TTS the film still renders: silent, with subtitles and
    // text-driven mouth movement. That is a rung on the fallback ladder, not
    // a failure.
    if (!ttsOk) {
        notes.push('rendered without synthesized speech (subtitles + text lipsync only)');
    }

    const prepared = await studio.prepare(film, { retime: ttsOk });
    const problems = prepared.diagnostics.filter((d) => d.severity !== 'info');
    for (const d of problems) window.report(`${d.severity} ${d.path}: ${d.message}`);

    const canvas = document.createElement('canvas');
    canvas.width = cfg.width; canvas.height = cfg.height;
    document.body.appendChild(canvas);

    const t0 = performance.now();
    let last = 0;
    const res = await studio.render(prepared, {
        canvas, width: cfg.width, height: cfg.height, fps: cfg.fps,
        onProgress: (p) => {
            if (p.stage !== 'render') return;
            const pct = Math.floor((p.frame / p.total) * 100);
            if (pct >= last + 10) {
                last = pct;
                window.report(`  ${pct}%  frame ${p.frame}/${p.total}  ${p.msPerFrame.toFixed(1)} ms/frame`);
            }
        },
    });

    const bytes = new Uint8Array(await res.blob.arrayBuffer());
    // Read the result back to confirm what was actually produced.
    const url = URL.createObjectURL(res.blob);
    const v = document.createElement('video');
    v.src = url; v.muted = true;
    const probe = await new Promise((resolve) => {
        v.onloadedmetadata = () => {
            const done = (d) => resolve({ duration: +Number(d).toFixed(3), w: v.videoWidth, h: v.videoHeight });
            if (!isFinite(v.duration)) {
                v.currentTime = 1e9;
                v.ontimeupdate = () => { v.ontimeupdate = null; done(v.duration); };
            } else done(v.duration);
        };
        v.onerror = () => resolve({ error: 'undecodable' });
        setTimeout(() => resolve({ error: 'timeout' }), 20000);
    });
    URL.revokeObjectURL(url);

    return {
        notes, ttsOk,
        meta: prepared.meta,
        cues: prepared.cues.length,
        audio: prepared.audio
            ? { duration: +prepared.audio.duration.toFixed(2), rate: prepared.audio.sampleRate }
            : null,
        visemeKeys: prepared.timeline.tracks
            .filter((t) => t.path === 'props.viseme')
            .reduce((n, t) => n + t.keys.length, 0),
        sink: res.sink,
        preflight: res.preflight,
        type: res.blob.type,
        size: bytes.length,
        probe,
        wallSec: +((performance.now() - t0) / 1000).toFixed(1),
        data: [...bytes],
    };
}, base, { film: FILM, width: WIDTH, height: HEIGHT, fps: FPS, useTts: USE_TTS });

await mkdir(join(ROOT, 'demo/out'), { recursive: true });
await writeFile(join(ROOT, OUT), Buffer.from(result.data));
const { data, ...summary } = result;
console.log('\n' + JSON.stringify(summary, null, 2));
console.log(`\nwrote ${OUT} (${(result.size / 1e6).toFixed(2)} MB)`);

await browser.close();
server.close();
