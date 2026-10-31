/**
 * The drawing surface, driven the way a person drives it: pick a brush, drag
 * a stroke across the paper, and check that pixels changed AND that the
 * export says what was drawn.
 *
 * That round trip is the only thing worth asserting in a browser. The model
 * is covered by `test/core/draw.test.mjs`; what needs a real page is that
 * pointer events, the paint kernels and the canvas agree with each other.
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import assert from 'node:assert/strict';

const CHROME = process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('../..', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
                '.json': 'application/json', '.png': 'image/png', '.wasm': 'application/wasm',
                '.webmanifest': 'application/manifest+json' };

const server = createServer(async (req, res) => {
    try {
        const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
        const body = await readFile(join(ROOT, p === '/' ? 'draw.html' : p));
        res.writeHead(200, {
            'content-type': TYPES[extname(p)] ?? 'application/octet-stream',
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

const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true, protocolTimeout: 120_000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 950 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${base}/draw.html`, { waitUntil: 'load' });
await page.waitForFunction(() => document.getElementById('status')?.textContent.startsWith('ready ·'),
    { timeout: 30_000 });

const fail = (msg) => { console.error(`FAIL ${msg}`); process.exitCode = 1; };

// --- draw a stroke the way a hand does -----------------------------------
const box = await page.evaluate(() => {
    const r = document.getElementById('ink').getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
});
const before = await page.evaluate(() => {
    const c = document.getElementById('ink');
    return c.getContext('2d').getImageData(0, 0, c.width, c.height).data.reduce((n, v) => n + v, 0);
});

await page.mouse.move(box.x + box.w * 0.25, box.y + box.h * 0.4);
await page.mouse.down();
for (let i = 1; i <= 24; i++) {
    await page.mouse.move(box.x + box.w * (0.25 + 0.4 * i / 24),
                          box.y + box.h * (0.4 + 0.18 * Math.sin(i / 3)));
}
await page.mouse.up();
await new Promise((r) => setTimeout(r, 250));

const after = await page.evaluate(() => {
    const c = document.getElementById('ink');
    return c.getContext('2d').getImageData(0, 0, c.width, c.height).data.reduce((n, v) => n + v, 0);
});
if (after === before) fail('dragging across the paper changed no pixels');
else console.log('ok   a drag marks the paper');

// --- and the model agrees with the picture -------------------------------
const exported = await page.evaluate(() => {
    document.getElementById('expPart').click();
    return document.getElementById('out').value;
});
let part;
try { part = JSON.parse(exported); } catch { part = null; }
if (!part?.strokes?.length) fail(`export produced no strokes: ${exported.slice(0, 120)}`);
else {
    console.log(`ok   export carries ${part.strokes.length} stroke(s), `
        + `${part.strokes[0].points.length} points`);
    const pts = part.strokes[0].points;
    if (!pts.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))) {
        fail('exported points are not finite');
    }
    // The origin defaults to the middle of the paper, and the stroke was
    // drawn to the left of it, so the first point must be negative in x.
    if (!(pts[0].x < 0)) fail(`origin not applied: first x is ${pts[0].x}, expected < 0`);
    else console.log('ok   the export is relative to the joint, not to the canvas');
}

// --- frames carry their own holds, and come out as an X-sheet ------------
const sheet = await page.evaluate(() => {
    document.getElementById('newFrame').click();
    document.querySelectorAll('#frames .fr input')[1].value = '5';
    document.querySelectorAll('#frames .fr input')[1].dispatchEvent(new Event('change'));
    document.getElementById('expSheet').click();
    return JSON.parse(document.getElementById('out').value);
});
if (sheet.sheet !== '2 5') fail(`exposure sheet is "${sheet.sheet}", expected "2 5"`);
else console.log('ok   frame holds export as an exposure sheet');

// --- undo removes the stroke, not the frame ------------------------------
const undone = await page.evaluate(() => {
    document.querySelectorAll('#frames .fr')[0].click();
    document.getElementById('undo').click();
    document.getElementById('expPart').click();
    return JSON.parse(document.getElementById('out').value).strokes.length;
});
if (undone !== 0) fail(`undo left ${undone} strokes`);
else console.log('ok   undo removes the last stroke');

if (errors.length) {
    console.error('FAIL page errors:');
    for (const e of errors.slice(0, 6)) console.error('   ', e.slice(0, 200));
    process.exitCode = 1;
} else {
    console.log('ok   no page errors');
}

await browser.close();
server.close();
console.log(process.exitCode ? '\ndraw surface: FAILED' : '\ndraw surface: all checks passed');
