/**
 * What is on screen in a 2D film, as NUMBERS.
 *
 *   FILM=demo/film.json npm run digest2d
 *   FILM=films/physics/part-01.json AT=3,12.5 npm run digest2d
 *
 * # Why
 *
 * The 3D path has had this since Phase 39 and the measurement behind it was
 * the central finding of that phase: ~85% of the tokens spent building a film
 * went on LOOKING at it, and a digest answers the same questions for about a
 * fiftieth of what one screenshot costs -- per-subject box, coverage, luma,
 * dominant hue, and every string of on-screen text.
 *
 * It existed only on the 3D path, and **fifty of the fifty-one finished films
 * in this repo are 2D**. This is the cheapest check in the engine arriving
 * where almost all of its output actually lives.
 *
 * It is not a replacement for `grab2d`. Structured numbers catch everything
 * geometric, temporal and typographic; a frame catches everything about
 * material and light. Run this first, every time, and grab a frame when it
 * says something that needs a picture.
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { acquireLock, releaseLock } from './lib/render-lock.mjs';
import { filmShots } from '../src/core/script/compile.js';
import { formatDigest, checkDigest } from '../src/core/script/digest.js';

const CHROME = process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = process.env.ROOT ?? new URL('..', import.meta.url).pathname;
const FILM = process.env.FILM ?? 'demo/film.json';
const AT = process.env.AT ?? null;
const WIDTH = Number(process.env.WIDTH ?? 960);
const HEIGHT = Number(process.env.HEIGHT ?? 540);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
                '.json': 'application/json', '.png': 'image/png', '.css': 'text/css',
                '.wasm': 'application/wasm', '.svg': 'image/svg+xml',
                '.webmanifest': 'application/manifest+json' };

const server = createServer(async (req, res) => {
    try {
        const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
        const f = join(ROOT, p === '/' ? 'film.html' : p);
        if (!f.startsWith(ROOT)) { res.writeHead(403).end(); return; }
        const body = await readFile(f);
        res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream',
                             'cross-origin-opener-policy': 'same-origin',
                             'cross-origin-embedder-policy': 'credentialless' });
        res.end(body);
    } catch { if (!res.headersSent) res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const film = JSON.parse(await readFile(join(ROOT, FILM), 'utf8'));
const shots = filmShots(film);
/**
 * One sample per shot, at 55% through it: past the cut, and past any reveal
 * that lands on the shot's first frame. The same choice the 3D digest makes,
 * for the same reason.
 */
const row = (t, s) => ({ t, shotId: s?.shotId ?? null, sceneId: s?.sceneId ?? null,
                         on: s?.shot?.on ?? null });
const times = AT
    ? AT.split(',').map(Number).map((t) => row(t, shots.find((s) => t >= s.start && t < s.end)))
    : shots.map((s) => row(+(s.start + s.duration * 0.55).toFixed(2), s));

await acquireLock('the 2D digest');
const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
    protocolTimeout: 600_000,
});
const page = await browser.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(String(e).slice(0, 240)));
await page.goto(`${base}/film.html`, { waitUntil: 'load' });
await page.waitForFunction(() => window.jirex?.prepare, { timeout: 30000 });

const res = await page.evaluate(async (f, want, size) => {
    window.jirex.setFilm(f);
    const prepared = await window.jirex.prepare({ skipVoices: true });

    const { Canvas2DBackend } = await import('/src/backends/canvas2d/Canvas2DBackend.js');
    const { samplePose, applyPose, createPoseBaseline, resetPose } =
        await import('/src/core/anim/Evaluator.js');
    const { applySwapSets } = await import('/src/core/scene/swapSets.js');
    const { trackValueAt } = await import('/src/core/anim/Track.js');
    const { subjectsAt, headFractionAt, framingOf } =
        await import('/src/core/script/digest2d.js');
    const { frameDigest, dominantHue } = await import('/src/core/script/digest.js');
    const { attachSubtitles } = await import('/src/studio.js');
    // Subtitles are attached at render time, not by the compiler, so a posed
    // scene has an EMPTY subtitle node. Most viewers watch muted, which makes
    // the caption part of the picture -- a digest that could not report it
    // would be blind to the one thing on screen that is already language.
    attachSubtitles(prepared, { cues: [], buffers: {} });

    const W = size.width, H = size.height;
    const canvas = document.getElementById('stage');
    const backend = new Canvas2DBackend({ width: W, height: H });
    backend.mount(canvas, { width: W, height: H });
    const baseline = createPoseBaseline(prepared.scene, prepared.timeline);

    // A small sampling canvas: this is a question about exposure and layout,
    // not detail. 192x108 is 1/25 the pixels of a 960x540 frame.
    const SW = 192, SH = 108;
    const small = document.createElement('canvas');
    small.width = SW; small.height = SH;
    const sctx = small.getContext('2d', { willReadFrequently: true });

    const out = [];
    const notes = [];
    for (const { t, shotId, sceneId, on } of want) {
        resetPose(prepared.scene, baseline);
        applyPose(prepared.scene, samplePose(prepared.timeline, t));
        applySwapSets(prepared.scene);
        backend.renderFrame(prepared.scene, prepared.cameraId);
        sctx.drawImage(backend.canvas(), 0, 0, SW, SH);
        const img = sctx.getImageData(0, 0, SW, SH).data;
        const lumaAt = (i) => (0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2]) / 255;

        const all = [];
        for (let i = 0; i < img.length; i += 4) all.push(lumaAt(i));

        const rows = subjectsAt(prepared, f, t, { trackValueAt, sceneId });
        const subjects = rows.map((r) => {
            const [bx0, by0, bx1, by1] = r.box;
            const x0 = Math.max(0, Math.floor(bx0 * SW));
            const x1 = Math.min(SW - 1, Math.ceil(bx1 * SW));
            const y0 = Math.max(0, Math.floor(by0 * SH));
            const y1 = Math.min(SH - 1, Math.ceil(by1 * SH));
            const luma = [];
            const px = [];
            for (let y = y0; y <= y1; y++) {
                for (let x = x0; x <= x1; x++) {
                    const i = (y * SW + x) * 4;
                    const L = lumaAt(i);
                    luma.push(L);
                    px.push([L, img[i], img[i + 1], img[i + 2]]);
                }
            }
            return { id: r.id, visible: r.visible, box: r.box, luma,
                     hue: dominantHue(px) };
        });

        /**
         * Every string on screen, from the scene itself.
         *
         * 3D's digest reads these off the overlay draw list. 2D has no
         * overlay -- its type is scene nodes -- so this walks for visible
         * text, which also catches a board caption or a title card that no
         * subtitle track knows about.
         */
        const text = [];
        for (const { node, alpha } of prepared.scene.drawOrder()) {
            if (alpha < 0.5) continue;
            const str = node.props?.text;
            if (typeof str === 'string' && str.trim()) text.push({ op: 'text', text: str });
        }

        const d = frameDigest({ t, shotId, frame: all, subjects, overlay: text });
        // The measurement a 2D film is actually composed by. `FRAMINGS` is
        // defined in heads, because a close-up crops the body and a
        // body-based ratio stops meaning anything exactly where it is needed
        // most.
        // The shot's declared subject, or the first character actually on
        // screen. Measuring whoever happens to be first in the graph would
        // report the framing of someone the shot is not about.
        const subject = rows.find((r) => r.id === on)
            ?? rows.find((r) => r.visible && r.character) ?? null;
        const head = subject
            ? headFractionAt(prepared, f, t, subject.character, { trackValueAt })
            : null;
        if (head != null) d.framing = { head, reads: framingOf(head), of: subject.id };
        out.push(d);
    }
    notes.push(`scene: ${prepared.scene.byId.size} nodes, camera ${prepared.cameraId ?? '(none)'}`);
    return { digests: out, notes };
}, film, times, { width: WIDTH, height: HEIGHT });

await browser.close();
server.close();
releaseLock();

for (const n of res.notes) console.log(`  ${n}`);
for (const p of [...new Set(problems)]) console.log(`  [page] ${p}`);

// The framing line is 2D-only, so it is printed beside the shared format
// rather than pushed into it: `formatDigest` is what both paths agree on.
const text = formatDigest(res.digests).split('\n');
const byT = new Map(res.digests.filter((d) => d.framing).map((d) => [`t=${d.t} `, d.framing]));
console.log('');
for (const line of text) {
    console.log(line);
    for (const [prefix, fr] of byT) {
        if (line.startsWith(prefix)) {
            console.log(`  framing: ${fr.of} head=${(fr.head * 100).toFixed(1)}% `
                + `of frame height, reads "${fr.reads}"`);
        }
    }
}

const findings = checkDigest(res.digests);
for (const f of findings) console.log(`  [${f.severity}] ${f.message}`);
process.exit(findings.length ? 1 : 0);
