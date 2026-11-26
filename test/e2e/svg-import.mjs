/**
 * An SVG imports as PATHS, measured on real pixels.
 *
 * `test/core/svg.test.mjs` proves the parsing: that an arc becomes the right
 * cubics, that a transform composes left to right, that bounds include a
 * curve's bulge. It cannot prove the thing the gap was actually about.
 *
 * The gap (40-ASSET-IMPORT.md §2): every 2D import in this repository ended
 * in `createImageBitmap`, so somebody's vector logo arrived as pixels and the
 * first shot that pushed in on it went soft. The claim being made here is
 * that it no longer does -- and "it is vector now" is not a claim, it is a
 * hope, unless an edge is measured.
 *
 * So the same imported mark renders twice through the real compiler and the
 * real `Canvas2DBackend`: once at 600 px, and once at 75 px and then scaled
 * up eight times, which is exactly what a raster import of the same artwork
 * would have looked like. The number is the **edge transition width**: how
 * many pixels a hard boundary takes to go from one colour to the other.
 * Vector art gives one or two (antialiasing); eight-times raster gives eight.
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
 * A mark with one of everything the parser has to get right: a full circle
 * (two arcs), a quadratic, an elliptical arc mid-path, a rounded rect, a
 * group transform, and a `<text>` element that must be reported rather than
 * silently dropped.
 */
const SVG = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
  <defs><linearGradient id="g"><stop offset="0"/></linearGradient></defs>
  <g transform="translate(60,60)">
    <circle r="50" fill="#1d3557"/>
    <path d="M-28 10 q28 -46 56 0 a4 4 0 0 1 -8 0 q-20 -30 -40 0 z" fill="#f1faee"/>
    <rect x="-6" y="-34" width="12" height="20" rx="6" fill="#e63946"/>
  </g>
  <text x="4" y="116">mark</text>
</svg>`;

await acquireLock('the SVG import probe');
const br = await puppeteer.launch({
    executablePath: CHROME, headless: true, protocolTimeout: 600_000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
const guard = startGuard({ ms: 600_000, name: 'test:svg' });
guard.onCleanup(() => closeBrowser(br));
guard.onCleanup(() => srv.close());
const pg = await br.newPage();
const pageErrors = [];
pg.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));
/**
 * `film.html` reloads itself once on a first visit so the service worker's
 * cross-origin-isolation headers apply, which destroys the execution context
 * out from under whatever `evaluate` is running and blames "a navigation".
 * Puppeteer gets a fresh profile every run, so it is a first visit every run.
 * `scripts/grab2d.mjs` documents the same retry.
 */
async function onPage(fn) {
    for (let attempt = 0; ; attempt++) {
        await pg.goto(`${base}/film.html`, { waitUntil: 'load', timeout: 120_000 });
        await pg.waitForFunction(() => !!window.jirex, { timeout: 30_000 });
        try { return await fn(); } catch (e) {
            if (attempt > 0 || !/context was destroyed|Execution context/i.test(String(e))) throw e;
        }
    }
}

const res = await onPage(() => pg.evaluate(async (svgText) => {
    const { parseSVG } = await import('/src/core/art/svg.js');
    const { compileFilm } = await import('/src/core/script/compile.js');
    const { Canvas2DBackend } = await import('/src/backends/canvas2d/Canvas2DBackend.js');

    const BIG = 600;
    const imported = parseSVG(svgText, { id: 'mark', width: BIG * 0.8 });

    const filmFor = (scale) => ({
        version: 'jirex.film/1',
        meta: { title: 'svg', fps: 24, width: BIG * scale, height: BIG * scale },
        scenes: [{
            id: 's', background: { color: '#ffffff' },
            scenery: imported.parts.map((p) => ({
                id: p.id, shape: p.shape, fill: p.fill, stroke: p.stroke,
                strokeWidth: p.strokeWidth, sx: scale, sy: scale,
                at: [(BIG * scale) / 2, (BIG * scale) / 2], z: 1,
            })),
            shots: [{ id: 'a', duration: 1 }],
        }],
    });

    /** One frame, as RGBA, at the film's own authored size. */
    const render = (film) => {
        const c = compileFilm(film);
        const w = c.meta.width, h = c.meta.height;
        const canvas = document.createElement('canvas');
        const backend = new Canvas2DBackend({ width: w, height: h });
        backend.mount(canvas, { width: w, height: h });
        backend.renderFrame(c.scene, c.cameraId);
        const ctx = backend.canvas().getContext('2d');
        return { canvas: backend.canvas(), ctx, w, h,
                 diagnostics: c.diagnostics.map((d) => d.message) };
    };

    const vector = render(filmFor(1));
    const small = render(filmFor(1 / 8));

    // The raster import, made the only honest way: the same artwork
    // delivered small, then shown big.
    const up = document.createElement('canvas');
    up.width = BIG; up.height = BIG;
    const uctx = up.getContext('2d');
    uctx.drawImage(small.canvas, 0, 0, BIG, BIG);

    /**
     * How many pixels a boundary takes to change, along the mid scanline.
     *
     * Counted as pixels that are neither of the two plateau colours: the
     * same measurement Phase 48 used for anti-aliasing, pointed the other
     * way. A hard vector edge has one or two; an eight-times upscale has
     * eight, because the interpolation invented them.
     */
    const edgeWidth = (ctx, w, h) => {
        const row = ctx.getImageData(0, Math.floor(h / 2), w, 1).data;
        const lum = (i) => (0.2126 * row[i] + 0.7152 * row[i + 1] + 0.0722 * row[i + 2]) / 255;
        let runs = [], run = 0;
        for (let x = 1; x < w; x++) {
            const a = lum((x - 1) * 4), b = lum(x * 4);
            // Inside a transition when this pixel differs from its neighbour
            // by more than a quantisation step but is not yet a plateau.
            if (Math.abs(a - b) > 0.01) run++;
            else if (run) { runs.push(run); run = 0; }
        }
        if (run) runs.push(run);
        return { runs, mean: runs.length ? runs.reduce((s, n) => s + n, 0) / runs.length : 0 };
    };

    return {
        parts: imported.parts.length,
        warnings: imported.warnings,
        size: imported.size,
        chars: imported.parts.reduce((a, p) => a + p.shape.d.length, 0),
        diagnostics: vector.diagnostics,
        vector: edgeWidth(vector.ctx, vector.w, vector.h),
        raster: edgeWidth(uctx, BIG, BIG),
    };
}, SVG));

await guard.done();

const fails = [];
const ok = (cond, line) => { console.log(`  ${cond ? 'ok  ' : 'FAIL'}  ${line}`); if (!cond) fails.push(line); };
if (pageErrors.length) fails.push(`page errors: ${pageErrors.join(' | ')}`);

console.log(`\nimported ${res.parts} part(s), ${res.size.map((n) => n.toFixed(0)).join(' x ')} units, `
    + `${res.chars} chars of path data`);
for (const w of res.warnings) console.log(`  [svg] ${w}`);
for (const d of res.diagnostics) console.log(`  [compile] ${d}`);

console.log(`\nedge transition width along the mid scanline:`);
console.log(`  vector  ${res.vector.mean.toFixed(2)} px  (runs: ${res.vector.runs.join(', ')})`);
console.log(`  raster  ${res.raster.mean.toFixed(2)} px  (runs: ${res.raster.runs.join(', ')})`);

ok(res.parts === 3, 'three drawable elements became three parts');
ok(res.warnings.some((w) => /<text>/.test(w)),
   'the <text> element is reported by name, not silently dropped');
ok(!res.warnings.some((w) => /linearGradient/.test(w)),
   'a gradient inside <defs> is not reported as a missing element');
ok(res.diagnostics.length === 0, 'the film compiles with no diagnostics');
ok(res.vector.mean < 2.5, `a vector edge resolves in under 2.5 px (${res.vector.mean.toFixed(2)})`);
ok(res.raster.mean > res.vector.mean * 2.5,
   `and the same artwork imported as a raster is at least 2.5x softer `
   + `(${(res.raster.mean / res.vector.mean).toFixed(1)}x)`);

console.log('');
if (fails.length) { for (const f of fails) console.error(`FAIL: ${f}`); process.exit(1); }
console.log(`PASS: SVG imports as paths; edge ${res.vector.mean.toFixed(2)} px vs raster ${res.raster.mean.toFixed(2)} px.`);
