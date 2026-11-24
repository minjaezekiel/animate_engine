/**
 * Decode a finished video and measure its frames.
 *
 *   node scripts/frame-luma.mjs out/earth/inside-the-earth.mp4 0,19,19.4,32.9
 *   npm run frames:earth
 *
 * # The gap this closes
 *
 * Every other check in this repo measures the engine. `check` reads the
 * compiled film, `digest` reads the scene through the renderer, and the
 * transition probe measures the composite canvas -- which is the canvas the
 * encoder is handed, and still not the file.
 *
 * That last step has failed here before, and it is the failure with the worst
 * shape: an overlay drawn into a DOM layer shows in a preview and is absent
 * from the file, and a `MediaRecorder` path can drop frames the renderer
 * believes it delivered. `verify-renders.mjs` reads the container without
 * decoding, which catches a silent audio track but says nothing about
 * pictures.
 *
 * So this decodes. A `<video>` element in headless Chrome, seeked to each
 * time, drawn to a canvas, and the pixels counted -- which needs no ffmpeg,
 * no dependency and no codec of our own, because the browser that encoded the
 * file can obviously decode it.
 *
 * Reported per time: mean luma, the fraction of pixels below 2% (`low`) and
 * above 98% (`high`), and the dominant quadrant brightness, which is what
 * distinguishes a wipe from a fade without looking.
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, basename } from 'node:path';
import { acquireLock, releaseLock } from './lib/render-lock.mjs';

const CHROME = process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('..', import.meta.url).pathname;
const FILE = process.argv[2] ?? process.env.VIDEO;
const TIMES = (process.argv[3] ?? process.env.AT ?? '0')
    .split(',').map(Number).filter((n) => Number.isFinite(n));
if (!FILE) {
    console.error('usage: frame-luma.mjs <file.mp4> <t,t,t>');
    process.exit(1);
}
await stat(join(ROOT, FILE));

const TYPES = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.html': 'text/html' };
const server = createServer(async (req, res) => {
    try {
        const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
        const f = join(ROOT, p);
        if (!f.startsWith(ROOT)) { res.writeHead(403).end(); return; }
        const body = await readFile(f);
        // Range support: Chrome asks for one when seeking, and without it the
        // element can stall on a 50 MB file forever.
        const range = req.headers.range;
        const type = TYPES[extname(f)] ?? 'application/octet-stream';
        if (range) {
            const m = /bytes=(\d*)-(\d*)/.exec(range);
            const start = m[1] ? Number(m[1]) : 0;
            const end = m[2] ? Number(m[2]) : body.length - 1;
            res.writeHead(206, {
                'content-type': type,
                'content-range': `bytes ${start}-${end}/${body.length}`,
                'accept-ranges': 'bytes',
                'content-length': end - start + 1,
            });
            res.end(body.subarray(start, end + 1));
            return;
        }
        res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes',
                             'content-length': body.length });
        res.end(body);
    } catch { if (!res.headersSent) res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

await acquireLock('the frame decoder');
const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
    protocolTimeout: 600_000,
});
const page = await browser.newPage();
await page.goto(`${base}/`, { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.setContent('<body style="margin:0;background:#000"></body>');

const rows = await page.evaluate(async (src, times) => {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'auto';
    v.crossOrigin = 'anonymous';
    v.src = src;
    document.body.append(v);
    await new Promise((res, rej) => {
        v.onloadedmetadata = res;
        v.onerror = () => rej(new Error(`cannot load ${src}`));
    });
    // A small canvas: this is a question about exposure and layout, not
    // detail, and 320x180 is 1/36 of the pixels.
    const W = 320, H = 180;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const out = [];
    for (const t of times) {
        await new Promise((res, rej) => {
            const done = () => { v.onseeked = null; res(); };
            v.onseeked = done;
            v.onerror = () => rej(new Error(`seek to ${t} failed`));
            // `fastSeek` lands on the nearest keyframe, which for a 46-frame
            // GOP is up to two seconds away -- useless for measuring an
            // instant. `currentTime` is the accurate one.
            v.currentTime = Math.min(t, Math.max(0, v.duration - 1 / 48));
        });
        ctx.drawImage(v, 0, 0, W, H);
        const d = ctx.getImageData(0, 0, W, H).data;
        let sum = 0, low = 0, high = 0;
        const quad = [0, 0, 0, 0];
        const qn = (W / 2) * (H / 2);
        for (let i = 0, p = 0; i < d.length; i += 4, p++) {
            const y = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
            sum += y;
            if (y < 0.02) low++;
            if (y > 0.98) high++;
            const x = p % W, row = (p - x) / W;
            quad[(row < H / 2 ? 0 : 2) + (x < W / 2 ? 0 : 1)] += y;
        }
        const n = W * H;
        out.push({ t: +v.currentTime.toFixed(3), asked: t,
                   mean: +(sum / n).toFixed(4),
                   low: +(low / n).toFixed(4), high: +(high / n).toFixed(4),
                   quads: quad.map((q) => +(q / qn).toFixed(3)) });
    }
    return out;
}, `${base}/${FILE}`, TIMES);

await browser.close();
server.close();
releaseLock();

console.log(`\n${basename(FILE)}  decoded ${rows.length} frame(s)\n`);
console.log('  asked    actual   mean    low     high    quads (TL TR BL BR)');
for (const r of rows) {
    console.log(`  ${String(r.asked).padEnd(8)} ${String(r.t).padEnd(8)} `
        + `${r.mean.toFixed(3)}   ${r.low.toFixed(3)}   ${r.high.toFixed(3)}   `
        + r.quads.map((q) => q.toFixed(3)).join(' '));
}
console.log('');
