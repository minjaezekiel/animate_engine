/**
 * Per-frame cost of a film, with and without a named element.
 *
 *   FILM=demo/fight.json node scripts/bench-film.mjs
 *
 * The paced MediaRecorder path has a hard ceiling of 1000/fps ms a frame.
 * Over it, the export does not degrade -- it produces an undecodable file.
 * So when preflight says "over budget", the next question is *what* is
 * costing the time, and the only honest way to answer is to take things out
 * and measure again.
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const FILM = process.env.FILM ?? 'demo/fight.json';
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.json': 'application/json', '.png': 'image/png', '.wasm': 'application/wasm',
    '.wav': 'audio/wav', '.txt': 'text/plain', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
    try {
        const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
        const f = join(ROOT, p === '/' ? 'film.html' : p);
        res.writeHead(200, {
            'content-type': TYPES[extname(f)] ?? 'application/octet-stream',
            // The pool only exists in a cross-origin-isolated document, and
            // the pool is 2.8x on the heaviest kernel here -- so a bench
            // without these headers measures a configuration nobody renders
            // in. Same two headers as `scripts/serve.mjs`.
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'credentialless',
            'Cross-Origin-Resource-Policy': 'same-origin',
        });
        res.end(await readFile(f));
    } catch { if (!res.headersSent) res.writeHead(404); res.end('x'); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH
        ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, protocolTimeout: 600_000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('[pageerror]', String(e).slice(0, 200)));
await page.goto(`${base}/film.html`, { waitUntil: 'load' });

const rows = await page.evaluate(async (origin, film) => {
    const { FilmStudio } = await import(`${origin}/src/studio.js`);
    const { Canvas2DBackend } = await import(`${origin}/src/backends/canvas2d/Canvas2DBackend.js`);
    const { preflight } = await import(`${origin}/src/render/OfflineRenderer.js`);
    const { preparePhotos } = await import(`${origin}/src/backends/canvas2d/PhotoPainter.js`);
    const { applySwapSets } = await import(`${origin}/src/core/scene/swapSets.js`);
    const { estimateFrameCost, worstSpan } = await import(`${origin}/src/core/script/budget.js`);
    const { trackValueAt } = await import(`${origin}/src/core/anim/Track.js`);
    const raw = await (await fetch(`${origin}/${film}`)).json();

    const variants = {
        'full': (f) => f,
        'no photo backdrop': (f) => { for (const s of f.scenes) delete s.photos; return f; },
        'no FX cast': (f) => {
            for (const s of f.scenes) {
                s.cast = s.cast.filter((c) => !['fx', 'bolt', 'lines'].includes(c.character));
            }
            return f;
        },
        'no echoes': (f) => { for (const s of f.scenes) for (const c of s.cast) delete c.echo; return f; },
    };
    const out = [];
    for (const [name, mutate] of Object.entries(variants)) {
        const f = mutate(JSON.parse(JSON.stringify(raw)));
        delete f.voices;
        for (const s of f.scenes) for (const sh of s.shots) delete sh.dialogue;
        const studio = new FilmStudio({ onLog: () => {} });
        const prepared = await studio.prepare(f, { retime: false });
        const canvas = document.createElement('canvas');
        canvas.width = prepared.meta.width; canvas.height = prepared.meta.height;
        const backend = new Canvas2DBackend({ width: prepared.meta.width, height: prepared.meta.height });
        backend.mount(canvas, { width: prepared.meta.width, height: prepared.meta.height });
        // Measure the shot the estimate calls heaviest, through the same
        // frame hook the renderer uses -- otherwise this times the opening
        // seconds of the film on the serial fallback, which is neither the
        // expensive shot nor the code path that will draw it.
        const estimate = estimateFrameCost(prepared, prepared.film, { trackValueAt });
        const span = worstSpan(estimate);
        const pf = await preflight({
            scene: prepared.scene, timeline: prepared.timeline, backend,
            cameraId: prepared.cameraId, fps: prepared.meta.fps,
            startSec: span?.startSec ?? 0, endSec: span?.endSec ?? null,
            beforeFrame: async () => {
                applySwapSets(prepared.scene);
                await preparePhotos(prepared.scene);
            },
        });
        out.push({ name, mean: pf.meanMs, median: pf.medianMs, p95: pf.p95Ms,
                   max: pf.maxMs, warmup: pf.warmupMs, ceiling: pf.ceilingMs,
                   predicted: span?.ms ?? 0, shot: span?.shotId ?? '-',
                   pool: !!studio._pool });
    }
    return out;
}, base, FILM);

console.log('variant                predicted   mean median   p95    max warmup  shot         pool');
for (const r of rows) {
    console.log(`${r.name.padEnd(22)} ${String(r.predicted.toFixed(1)).padStart(9)} `
        + `${String(r.mean.toFixed(1)).padStart(6)} ${String(r.median.toFixed(1)).padStart(6)} `
        + `${String(r.p95.toFixed(1)).padStart(5)} ${String(r.max.toFixed(1)).padStart(6)} `
        + `${String(r.warmup.toFixed(1)).padStart(6)}  ${String(r.shot).padEnd(12)} `
        + `${r.pool ? 'yes' : 'no'}`);
}
console.log('');
console.log('`predicted` is budget.js before anything renders; `mean` is measured over the');
console.log('same shot through the same frame hook, and is the one to compare against it --');
console.log('a `step` hold makes the per-frame cost bimodal, so the median is the cheap');
console.log('mode. Their ratio is what `calibrate` folds back into the model.');
console.log('`warmup` is the first frame, excluded from the rest: it pays for the mesh and');
console.log(`the inpainted plate, which no later frame pays again. Ceiling ${rows[0].ceiling.toFixed(1)}ms.`);
await browser.close();
server.close();
