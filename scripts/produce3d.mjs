/**
 * Render a 3D film script to a video file through headless Chrome.
 *
 * Same shape as produce.mjs: serve the repo, open the render page, call one
 * function, write the bytes. WebGL needs a real browser, so there is no
 * Node-only path for the pixels -- but the compiler that decides what those
 * pixels are is pure and tested separately.
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';

const CHROME = process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('..', import.meta.url).pathname;
const FILM = process.env.FILM ?? 'demo/ak47.json';
const OUT = process.env.OUT ?? 'demo/out/ak47.webm';
const WIDTH = Number(process.env.WIDTH ?? 1280);
const HEIGHT = Number(process.env.HEIGHT ?? 720);
const PROBE = process.env.PROBE === '1';
// GRAB=1,34.4,40 writes a PNG per time instead of a video. Looking at the
// thing is the only check that catches a model not looking like a rifle.
const GRAB = process.env.GRAB ? process.env.GRAB.split(',').map(Number) : null;
const DURATION = process.env.DURATION ? Number(process.env.DURATION) : null;

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
                '.json': 'application/json', '.png': 'image/png' };

const server = createServer(async (req, res) => {
    try {
        const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
        const f = join(ROOT, p === '/' ? 'film3d.html' : p);
        if (!f.startsWith(ROOT)) { res.writeHead(403).end(); return; }
        res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
        res.end(await readFile(f));
    } catch { if (!res.headersSent) res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true, protocolTimeout: 2_400_000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader',
           '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding',
           '--use-angle=metal'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('  [page error]', String(e).slice(0, 300)));
page.on('console', (m) => { if (m.type() === 'error') console.error('  [console]', m.text().slice(0, 300)); });
await page.exposeFunction('report', (m) => process.stdout.write(`\r  ${m}          `));

await page.goto(`${base}/film3d.html`, { waitUntil: 'load' });
await page.waitForFunction(() => window.ready3d === true, { timeout: 60_000 });

const film = JSON.parse(await readFile(join(ROOT, FILM), 'utf8'));
console.log(`rendering ${FILM} at ${WIDTH}x${HEIGHT}${PROBE ? ' (probe, no encode)' : ''}`);
const t0 = Date.now();
const out = await page.evaluate((f, o) => window.render3d(f, o), film,
    { width: WIDTH, height: HEIGHT, probe: PROBE, durationSec: DURATION, grab: GRAB });

if (out.frames) {
    await mkdir(join(ROOT, dirname(OUT)), { recursive: true });
    for (const fr of out.frames) {
        const f = join(ROOT, dirname(OUT), `grab-${String(fr.t).replace('.', '_')}.png`);
        await writeFile(f, Buffer.from(fr.png.split(',')[1], 'base64'));
        console.log(`  ${f.replace(ROOT, '')}`);
    }
    await browser.close(); server.close();
    process.exit(0);
}
console.log(`\n  mime=${out.mime} chunks=${out.chunks} supported=[${out.supported}]`);
console.log(`  ${out.duration}s · ${out.nodes} nodes · ${out.tracks} tracks `
            + `· ${out.particles} particles · ${((Date.now() - t0) / 1000).toFixed(1)}s wall`);
for (const d of out.diagnostics) console.log(`  [${d.severity}] ${d.message}`);

if (out.dataUrl) {
    // Split on ';base64,' rather than the first comma: the mime type is
    // 'video/webm;codecs=vp9,opus', which CONTAINS a comma, so split(',')[1]
    // returned the literal string 'opus;base64' -- seven bytes of garbage
    // written out as a video file.
    const bytes = Buffer.from(out.dataUrl.slice(out.dataUrl.indexOf(';base64,') + 8), 'base64');
    await mkdir(join(ROOT, dirname(OUT)), { recursive: true });
    await writeFile(join(ROOT, OUT), bytes);
    console.log(`  wrote ${OUT} (${(bytes.length / 1e6).toFixed(2)} MB)`);
}
await browser.close();
server.close();
