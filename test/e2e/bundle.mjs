/**
 * The dist/ bundles must actually work the way a CDN consumer loads them:
 * a plain <script> tag giving a global, and an ESM import. Both render a
 * frame of the demo film, which is the only proof that counts.
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const CHROME = process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('../..', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
                '.cjs': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };

const server = createServer(async (req, res) => {
    try {
        const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
        // A bare same-origin page: dynamic import() from about:blank is
        // cross-origin and would be blocked, so the test needs a real document
        // served from this origin -- with nothing else on it.
        if (p === '/__blank') {
            res.writeHead(200, { 'content-type': 'text/html' });
            res.end('<!doctype html><meta charset="utf-8"><canvas id="c"></canvas>');
            return;
        }
        const body = await readFile(join(ROOT, p === '/' ? 'film.html' : p));
        res.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' });
        res.end(body);
    } catch { if (!res.headersSent) res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

// A bare page: no film.html, no import map, nothing but the bundle.
await page.goto(`${base}/__blank`, { waitUntil: 'domcontentloaded' });

const result = await page.evaluate(async (origin) => {
    const out = {};

    // 1. script-tag global
    await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = `${origin}/dist/jirex.min.js`;
        s.onload = res; s.onerror = () => rej(new Error('script tag failed'));
        document.head.appendChild(s);
    });
    out.globalKeys = Object.keys(window.jireX ?? {}).length;
    out.hasStudio = typeof window.jireX?.FilmStudio === 'function';

    // 2. ESM import
    const esm = await import(`${origin}/dist/jirex.esm.js`);
    out.esmKeys = Object.keys(esm).length;

    // 3. core-only bundle, which must not need a backend or an encoder
    const core = await import(`${origin}/dist/jirex-core.esm.js`);
    out.coreKeys = Object.keys(core).length;

    // 4. render a real frame of the demo film through the bundle
    const film = await (await fetch(`${origin}/demo/film.json`)).json();
    const c = esm.compileFilm(film);
    out.compiled = { duration: c.meta.duration, frames: c.meta.frames,
                     problems: c.diagnostics.filter((d) => d.severity !== 'info').length };

    const canvas = document.getElementById('c');
    canvas.width = 320; canvas.height = 180;
    const backend = new esm.Canvas2DBackend({ width: 320, height: 180 });
    backend.mount(canvas, { width: 320, height: 180 });
    await esm.renderOffline({
        scene: c.scene, timeline: c.timeline, backend, cameraId: c.cameraId,
        fps: 24, width: 320, height: 180, durationSec: 0.05, sink: new esm.MemorySink(),
    });
    const px = canvas.getContext('2d').getImageData(0, 0, 320, 180).data;
    let lit = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 0) lit++;
    out.litPixels = lit;
    return out;
}, base);

console.log(JSON.stringify(result, null, 2));
console.log('page errors:', errors.length ? errors.slice(0, 3) : 'none');
await browser.close();
server.close();

const fail = [];
if (!result.hasStudio) fail.push('script tag did not expose window.jireX.FilmStudio');
if (result.globalKeys < 5) fail.push(`global has only ${result.globalKeys} exports`);
if (result.esmKeys < 5) fail.push(`esm bundle has only ${result.esmKeys} exports`);
if (result.coreKeys < 40) fail.push(`core bundle has only ${result.coreKeys} exports`);
if (result.compiled.duration !== 120) fail.push(`bundle compiled ${result.compiled.duration}s, want 120`);
if (result.compiled.problems !== 0) fail.push('bundle compile produced diagnostics');
if (result.litPixels < 320 * 180 * 0.9) fail.push(`only ${result.litPixels} pixels drawn`);
if (errors.length) fail.push(`page errors: ${errors[0]}`);

if (fail.length) { console.error('\nFAILED:\n - ' + fail.join('\n - ')); process.exit(1); }
console.log('\nPASS: script tag + ESM + core bundles all load and render.');
