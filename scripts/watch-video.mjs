/**
 * Watch a video the only way available here: decode it in real Chrome, pull
 * frames through a canvas, and MEASURE it.
 *
 * There is no `ffmpeg` on this machine and no decoder in `node_modules`, so
 * this uses the same browser the renderer does.
 *
 *   node scripts/watch-video.mjs <file.mp4> <outdir>
 *   T0=8 T1=14 STRIDE=4 TILE=512 COLS=2 ROWS=3 node scripts/watch-video.mjs ...
 *
 * Writes `frames.json` (per-frame luma difference, timestamp and mean RGB)
 * and `sheet-NN.png` contact sheets. `scripts/probe-video.mjs` reads the
 * container for duration, resolution and exact frame timing without decoding.
 *
 * # Three things this cost to learn
 *
 * - **`seeked` does not mean the frame is drawable.** Seek, await `seeked`,
 *   then `drawImage`, and you get the frame that was on screen BEFORE the
 *   seek. The first version produced four identical stills from four
 *   different timestamps and they looked entirely plausible. The event that
 *   means "this is now the frame you would see" is
 *   `requestVideoFrameCallback`.
 * - **`requestVideoFrameCallback` does not fire while paused in headless**,
 *   so seek-per-frame deadlocks. This plays the file once in real time and
 *   captures from the callback, which is also ~20x faster.
 * - **A `setContent` page is a different origin from the video**, so the
 *   canvas taints and `getImageData` throws. The host page is served from
 *   the same server as the file.
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { basename, dirname, join, normalize, resolve } from 'node:path';

const file = resolve(process.argv[2]);
const outDir = resolve(process.argv[3] ?? './out');
const TILE = Number(process.env.TILE ?? 128);
const COLS = Number(process.env.COLS ?? 20);
const ROWS = Number(process.env.ROWS ?? 12);
const T0 = Number(process.env.T0 ?? 0);
const T1 = Number(process.env.T1 ?? 1e9);
const STRIDE = Number(process.env.STRIDE ?? 1);
const ROOT = dirname(file);

const server = createServer(async (req, res) => {
    try {
        const f = join(ROOT, normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)));
        if (req.url === '/index.html') {
            res.writeHead(200, { 'content-type': 'text/html' });
            res.end(`<body style="margin:0"><video id=v src="${SRC}" muted playsinline></video>`
                + `<canvas id=small></canvas><canvas id=sheet></canvas></body>`);
            return;
        }
        const body = await readFile(f);   // read first: writeHead then a throw = headers twice
        res.writeHead(200, { 'content-type': 'video/mp4', 'accept-ranges': 'bytes' });
        res.end(body);
    } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
});
let SRC = '';
await new Promise((r) => server.listen(0, r));
const origin = `http://127.0.0.1:${server.address().port}`;
SRC = `/${encodeURIComponent(basename(file))}`;

const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true, protocolTimeout: 600000,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('[page]', String(e).slice(0, 300)));
await page.goto(`${origin}/index.html`, { waitUntil: 'load' });

const result = await page.evaluate(async (TILE, COLS, ROWS, T0, T1, STRIDE) => {
    const v = document.getElementById('v');
    // readyState first: with waitUntil 'load' the metadata is often already
    // in, and then the event never fires again and the promise never settles.
    if (v.readyState < 1) await new Promise((res, rej) => {
        v.onloadedmetadata = res; v.onerror = () => rej(new Error('decode failed'));
    });
    const AR = v.videoHeight / v.videoWidth;
    const th = Math.round(TILE * AR);
    const small = document.getElementById('small');
    const W = 80, H = Math.max(2, Math.round(80 * AR));
    small.width = W; small.height = H;
    const sctx = small.getContext('2d', { willReadFrequently: true });

    // One sheet canvas grows as needed; we page it out when full.
    const sheet = document.getElementById('sheet');
    sheet.width = COLS * TILE; sheet.height = ROWS * (th + 16);
    const shctx = sheet.getContext('2d');
    const clearSheet = () => { shctx.fillStyle = '#101010'; shctx.fillRect(0, 0, sheet.width, sheet.height); };
    clearSheet();

    const frames = []; const sheets = [];
    let prev = null, slot = 0;

    await new Promise((done) => {
        const tick = (now, m) => {
            sctx.drawImage(v, 0, 0, W, H);
            const d = sctx.getImageData(0, 0, W, H).data;
            const luma = new Float32Array(W * H);
            let r = 0, g = 0, b = 0;
            for (let i = 0, p = 0; i < d.length; i += 4, p++) {
                luma[p] = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
                r += d[i]; g += d[i + 1]; b += d[i + 2];
            }
            const n = W * H;
            let diff = 0;
            if (prev) { for (let p = 0; p < n; p++) diff += Math.abs(luma[p] - prev[p]); diff /= n; }
            prev = luma;
            frames.push({ i: frames.length, t: +m.mediaTime.toFixed(4), d: +diff.toFixed(2),
                          rgb: [Math.round(r / n), Math.round(g / n), Math.round(b / n)] });

            const idx = frames.length - 1;
            const inWindow = m.mediaTime >= T0 && m.mediaTime <= T1 && (idx % STRIDE === 0);
            if (!inWindow) {
                if (v.ended) { if (slot) sheets.push(sheet.toDataURL('image/png')); done(); return; }
                v.requestVideoFrameCallback(tick); return;
            }
            const x = (slot % COLS) * TILE, y = Math.floor(slot / COLS) * (th + 16);
            shctx.drawImage(v, x, y, TILE, th);
            shctx.fillStyle = '#000'; shctx.fillRect(x, y + th, TILE, 16);
            shctx.fillStyle = diff > 20 ? '#ff4040' : '#60ff60';
            shctx.font = '11px monospace';
            shctx.fillText(`${frames.length - 1} ${m.mediaTime.toFixed(2)}`, x + 3, y + th + 12);
            slot++;
            if (slot === COLS * ROWS) { sheets.push(sheet.toDataURL('image/png')); clearSheet(); slot = 0; }

            if (v.ended) { if (slot) sheets.push(sheet.toDataURL('image/png')); done(); return; }
            v.requestVideoFrameCallback(tick);
        };
        v.requestVideoFrameCallback(tick);
        v.onended = () => { if (slot) sheets.push(sheet.toDataURL('image/png')); done(); };
        v.play();
    });
    return { frames, sheets };
}, TILE, COLS, ROWS, T0, T1, STRIDE);

await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'frames.json'), JSON.stringify(result.frames));
for (let i = 0; i < result.sheets.length; i++) {
    const f = join(outDir, `sheet-${String(i).padStart(2, '0')}.png`);
    await writeFile(f, Buffer.from(result.sheets[i].split(',')[1], 'base64'));
    console.log('wrote', f);
}
console.log(`captured ${result.frames.length} frames`);
await browser.close(); server.close();
