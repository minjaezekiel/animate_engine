/**
 * A contact sheet: key frames of a film, rendered to one PNG.
 *
 *   FILM=demo/fight.json OUT=demo/out/fight-sheet.png node scripts/contact-sheet.mjs
 *   TIMES=0,3,9.6 node scripts/contact-sheet.mjs        # pick your own
 *
 * Verify before you render. A sixty-second film is a few minutes of
 * encoding, and every look problem it has is already visible in a dozen
 * stills -- so the stills come first, and the render only runs on a sheet
 * that has been looked at.
 *
 * Defaults to the midpoint of every shot, which is where a shot is most
 * itself: past the transition in, before the transition out.
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';

const CHROME = process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('..', import.meta.url).pathname;
const FILM = process.env.FILM ?? 'demo/fight.json';
const OUT = process.env.OUT ?? 'demo/out/contact-sheet.png';
const COLS = Number(process.env.COLS ?? 4);
const CELL = Number(process.env.CELL ?? 440);

const TYPES = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.json': 'application/json', '.png': 'image/png', '.txt': 'text/plain',
    '.webmanifest': 'application/manifest+json', '.wasm': 'application/wasm',
    '.wav': 'audio/wav',
};
const server = createServer(async (req, res) => {
    try {
        const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
        const f = join(ROOT, p === '/' ? 'film.html' : p);
        if (!f.startsWith(ROOT)) { res.writeHead(403).end(); return; }
        const body = await readFile(f);
        res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
        res.end(body);
    } catch { if (!res.headersSent) res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true, protocolTimeout: 600_000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('  [page error]', String(e).slice(0, 300)));
page.on('console', (m) => {
    if (m.type() === 'error') console.error('  [console]', m.text().slice(0, 300));
});
await page.goto(`${base}/film.html`, { waitUntil: 'load' });
await page.exposeFunction('report', (m) => console.log('  ' + m));

const result = await page.evaluate(async (origin, cfg) => {
    const { FilmStudio } = await import(`${origin}/src/studio.js`);
    const { Canvas2DBackend } = await import(`${origin}/src/backends/canvas2d/Canvas2DBackend.js`);
    const { applySwapSets } = await import(`${origin}/src/core/scene/swapSets.js`);
    const { samplePose, applyPose, resetPose, createPoseBaseline } =
        await import(`${origin}/src/core/anim/Evaluator.js`);

    const studio = new FilmStudio({ onLog: (m) => window.report(m) });
    const film = await (await fetch(`${origin}/${cfg.film}`)).json();
    // A contact sheet is about the picture, and synthesising voices to look
    // at stills is a minute spent on nothing. `retime: false` is not enough
    // -- `prepare` still synthesises -- so with NO_TTS the dialogue comes
    // out of the film entirely. Subtitles go with it, which is the point:
    // they would otherwise cover the staging in a third of the cells.
    if (cfg.noTts) {
        delete film.voices;
        for (const scene of film.scenes ?? []) {
            for (const shot of scene.shots ?? []) delete shot.dialogue;
        }
    }
    const prepared = await studio.prepare(film, { retime: false });
    const problems = prepared.diagnostics.filter((d) => d.severity !== 'info');
    for (const d of problems) window.report(`${d.severity} ${d.path}: ${d.message}`);

    const { meta, scene, timeline, cameraId } = prepared;
    const times = cfg.times?.length ? cfg.times
        : (() => {
            const out = [];
            let t = 0;
            for (const s of film.scenes.flatMap((x) => x.shots ?? [])) {
                out.push(t + (s.duration ?? 4) / 2);
                t += s.duration ?? 4;
            }
            return out;
        })();

    const canvas = document.createElement('canvas');
    canvas.width = meta.width; canvas.height = meta.height;
    const backend = new Canvas2DBackend({ width: meta.width, height: meta.height });
    backend.mount(canvas, { width: meta.width, height: meta.height });
    const baseline = createPoseBaseline(scene, timeline);

    const cellW = cfg.cell;
    const cellH = Math.round(cellW * meta.height / meta.width);
    const cols = cfg.cols;
    const rows = Math.ceil(times.length / cols);
    const sheet = document.createElement('canvas');
    sheet.width = cols * cellW; sheet.height = rows * cellH;
    const ctx = sheet.getContext('2d');
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, sheet.width, sheet.height);

    const lit = [];
    for (const [i, t] of times.entries()) {
        resetPose(scene, baseline);
        applyPose(scene, samplePose(timeline, t));
        scene.invalidateAll();
        applySwapSets(scene);
        backend.renderFrame(scene, cameraId);
        ctx.drawImage(backend.canvas(), (i % cols) * cellW, Math.floor(i / cols) * cellH,
                      cellW, cellH);
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect((i % cols) * cellW, Math.floor(i / cols) * cellH, 74, 20);
        ctx.fillStyle = '#9fe';
        ctx.font = '13px monospace';
        ctx.fillText(`${t.toFixed(1)}s`, (i % cols) * cellW + 6, Math.floor(i / cols) * cellH + 15);

        // How much of the frame is not the background colour, as a cheap
        // "did anything render" probe per cell.
        const px = backend.canvas().getContext('2d')
            .getImageData(0, 0, meta.width, meta.height).data;
        let ink = 0;
        for (let p = 0; p < px.length; p += 4 * 97) if (px[p + 3] > 8) ink++;
        lit.push(Math.round((ink / (px.length / (4 * 97))) * 100));
    }
    return { dataUrl: sheet.toDataURL('image/png'), count: times.length,
             size: [sheet.width, sheet.height], lit,
             diagnostics: problems.map((d) => `${d.severity} ${d.path}: ${d.message}`) };
}, base, {
    film: FILM, cols: COLS, cell: CELL,
    times: (process.env.TIMES ?? '').split(',').filter(Boolean).map(Number),
    noTts: process.env.NO_TTS === '1',
});

await mkdir(dirname(OUT), { recursive: true });
await writeFile(OUT, Buffer.from(result.dataUrl.split(',')[1], 'base64'));
console.log(`\n${result.count} frames -> ${OUT}  (${result.size.join('x')})`);
console.log(`coverage per cell (%): ${result.lit.join(' ')}`);
if (result.diagnostics.length) {
    console.log('diagnostics:');
    for (const d of result.diagnostics) console.log('  ' + d);
}
await browser.close();
server.close();
