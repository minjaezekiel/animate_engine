/**
 * Render a 3D film script to a video file through headless Chrome.
 *
 * Same shape as produce.mjs: serve the repo, open the render page, call one
 * function, write the bytes. WebGL needs a real browser, so there is no
 * Node-only path for the pixels -- but the compiler that decides what those
 * pixels are is pure and tested separately.
 *
 * # What the Earth test changed here
 *
 * This file was written in Phase 14 as a small sibling of `produce.mjs` and
 * then stopped tracking it. Five things the 2D harness grew afterwards were
 * missing, and all five were found by one sixty-second render:
 *
 *   * **The film came back as a data URL.** A multi-megabyte data URL crosses
 *     the CDP boundary truncated with no error. The 2D path learned this and
 *     reads back in 4 MB chunks with a length check; here a 50-second 720p
 *     WebM was small enough to survive and a 60-second 1080p MP4 is not. The
 *     failure is a short file that looks like a successful render.
 *   * **No render lock.** Phase 36 added a shared lock because two headless
 *     Chromes competing for memory get one of them OOM-killed with a message
 *     that says nothing. `produce`, `grab2d` and `narration-pacing` take it;
 *     this did not, so a 3D render was the one job that could still do it.
 *   * **No format control.** Hardcoded WebM; see `film3d.html`.
 *   * **No vendored voice.** A fresh headless profile has an empty OPFS, so
 *     every 3D render re-downloaded the voice model from a CDN -- the exact
 *     thing that cost Phase 30 a ten-part series.
 *   * **No `.wav` MIME type.** An audio asset was served as
 *     `application/octet-stream`, which decodes only because
 *     `decodeAudioData` sniffs the bytes rather than trusting the header.
 */
import { existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { acquireLock, releaseLock } from './lib/render-lock.mjs';

const CHROME = process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('..', import.meta.url).pathname;
const FILM = process.env.FILM ?? 'demo/ak47.json';
const OUT = process.env.OUT ?? 'demo/out/ak47.mp4';
const WIDTH = Number(process.env.WIDTH ?? 1280);
const HEIGHT = Number(process.env.HEIGHT ?? 720);
const PROBE = process.env.PROBE === '1';
const SILENT = process.env.SILENT === '1';
/** 'mp4' | 'webm' | 'auto'. 'auto' prefers MP4 and says which it got. */
const FORMAT = process.env.FORMAT ?? 'auto';
/** Which voice engine to prefer. See src/core/voice/gateway.js. */
const VOICE_BACKEND = process.env.VOICE_BACKEND ?? null;
const VOICE_STUDIO = process.env.VOICE_STUDIO ?? null;
const OPENVOICE_URL = process.env.OPENVOICE_URL ?? null;
const KOKORO_URL = process.env.KOKORO_URL ?? null;
const VOICE_LEVEL = Number(process.env.VOICE_LEVEL ?? 0.14);
const STRICT_VOICE = process.env.STRICT_VOICE === '1';
const NO_RETIME = process.env.NO_RETIME === '1';
/**
 * A locally served, repointed vits-web if this checkout has one. `vendor/` is
 * not in git -- `npm run vendor-voice` fetches it -- so the CDN remains the
 * default and nothing breaks without it.
 */
const TTS_MODULE_URL = process.env.TTS_MODULE_URL
    ?? (existsSync(new URL('../vendor/vits-web.js', import.meta.url))
        ? '/vendor/vits-web.js' : null);
// GRAB=1,34.4,40 writes a PNG per time instead of a video. Looking at the
// thing is the only check that catches a model not looking like a rifle.
const GRAB = process.env.GRAB ? process.env.GRAB.split(',').map(Number) : null;
/**
 * DIGEST=1 reports what is on screen as numbers instead of pixels.
 *
 *   DIGEST=1 npm run check:earth              # one sample per shot
 *   DIGEST=3,18,40 FILM=... node ...          # at these times
 *   SUBJECTS=earth/whole,host DIGEST=1 ...    # and these objects
 *
 * See `src/core/script/digest.js` for why this exists and what it measured.
 */
const DIGEST = process.env.DIGEST ?? null;
const SUBJECTS = process.env.SUBJECTS ? process.env.SUBJECTS.split(',') : null;
const DURATION = process.env.DURATION ? Number(process.env.DURATION) : null;

const TYPES = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.json': 'application/json', '.png': 'image/png', '.txt': 'text/plain',
    '.wasm': 'application/wasm', '.onnx': 'application/octet-stream',
    '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
    '.hdr': 'application/octet-stream', '.glb': 'model/gltf-binary',
};

const server = createServer(async (req, res) => {
    try {
        const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
        const f = join(ROOT, p === '/' ? 'film3d.html' : p);
        if (!f.startsWith(ROOT)) { res.writeHead(403).end(); return; }
        const body = await readFile(f);
        res.writeHead(200, {
            'content-type': TYPES[extname(f)] ?? 'application/octet-stream',
            'cross-origin-opener-policy': 'same-origin',
            'cross-origin-embedder-policy': 'credentialless',
        });
        res.end(body);
    } catch { if (!res.headersSent) res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const CHECKING = process.env.CHECK === '1';
// A check compiles and samples; it does not encode, so it does not need the
// lock and should not wait behind a render that holds it.
if (!CHECKING) await acquireLock('rendering 3d');
let wrotePath = null;

process.on('uncaughtException', (err) => {
    const closed = /Target closed|Protocol error|Session closed/i.test(String(err));
    console.error('');
    if (closed && wrotePath) {
        console.error(`the browser went away during teardown, AFTER ${wrotePath} was`);
        console.error('written and length-checked. The film is complete; nothing to redo.');
        if (!CHECKING) releaseLock();
        process.exit(0);
    }
    if (closed) {
        console.error('the browser was killed before the film was written.');
        console.error('Most often that is memory: a 3D render holds the scene, the');
        console.error('textures, the audio mix and the muxed output at once.');
    } else {
        console.error(String(err?.stack ?? err));
    }
    if (!CHECKING) releaseLock();
    process.exit(1);
});

const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true, protocolTimeout: 2_400_000,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader',
           // Without this the AudioContext stays suspended in headless, the
           // mix never reaches the recorder's audio track, and MediaRecorder
           // stalls waiting for it -- emitting a WebM header and no frames.
           '--autoplay-policy=no-user-gesture-required',
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

const voiceOpts = {
    voiceBackend: VOICE_BACKEND, ttsModuleUrl: TTS_MODULE_URL,
    voiceStudioUrl: VOICE_STUDIO, openVoiceUrl: OPENVOICE_URL,
    kokoroUrl: KOKORO_URL, voiceLevel: VOICE_LEVEL,
    strictVoice: STRICT_VOICE, retime: !NO_RETIME,
};

// CHECK=1 runs the staging pass: framing analytically in Node, exposure from
// real pixels sampled tiny, and the overlay over its own draw list. Nothing
// is encoded.
if (CHECKING) {
    const { compileFilm3D } = await import(new URL('../src/core/script/compile3d.js', import.meta.url));
    const { checkFraming3D, checkExposure } = await import(
        new URL('../src/core/script/staging3d.js', import.meta.url));
    const compiled = compileFilm3D(film);
    const framing = checkFraming3D(compiled, film);
    const times = compiled.shots.flatMap((s) => [0.25, 0.75].map(
        (u) => ({ t: +(s.start + s.duration * u).toFixed(2), shotId: s.shotId })));
    const { samples, overlay = [] } = await page.evaluate((f, o) => window.render3d(f, o), film,
        { width: 960, height: 540, check: times });
    const exposure = checkExposure(samples);
    console.log(`\n  compile: ${compiled.diagnostics.length} · framing: ${framing.length} `
                + `· exposure: ${exposure.length} · overlay: ${overlay.length} `
                + `(over ${samples.length} samples)`);
    for (const d of [...compiled.diagnostics, ...framing, ...exposure, ...overlay]) {
        console.log(`  [${d.severity}] ${d.message}`);
    }
    const worst = samples.reduce((a, b) => (a.mean < b.mean ? a : b));
    const best = samples.reduce((a, b) => (a.mean > b.mean ? a : b));
    console.log(`  luma: darkest ${worst.mean.toFixed(3)} (${worst.shotId}), `
                + `brightest ${best.mean.toFixed(3)} (${best.shotId})`);
    await browser.close(); server.close();
    const findings = compiled.diagnostics.length + framing.length
        + exposure.length + overlay.length;
    process.exit(findings ? 1 : 0);
}

if (DIGEST) {
    const { compileFilm3D } = await import(new URL('../src/core/script/compile3d.js', import.meta.url));
    const { formatDigest, checkDigest } = await import(
        new URL('../src/core/script/digest.js', import.meta.url));
    const compiled = compileFilm3D(film);
    // One sample per shot by default, at 55% through it -- past the cut and
    // past any `set` that lands on the shot's first frame.
    const times = DIGEST === '1'
        ? compiled.shots.map((s) => ({ t: +(s.start + s.duration * 0.55).toFixed(2),
                                       shotId: s.shotId }))
        : DIGEST.split(',').map(Number).map((t) => ({
            t, shotId: compiled.shots.find((s) => t >= s.start && t < s.end)?.shotId ?? null }));
    // Default subjects: every cast root, which is what a film names.
    const subjects = SUBJECTS ?? (film.cast ?? [])
        .filter((c) => !c.set)
        .map((c) => c.as ?? c.assembly ?? c.character ?? c.model)
        .filter(Boolean);
    const { digests } = await page.evaluate((f, o) => window.render3d(f, o), film,
        { width: 960, height: 540, digest: times.map((x) => ({ ...x, subjects })) });
    console.log(`\n${formatDigest(digests)}`);
    const findings = checkDigest(digests);
    for (const d of findings) console.log(`  [${d.severity}] ${d.message}`);
    await browser.close(); server.close(); releaseLock();
    process.exit(findings.length ? 1 : 0);
}

console.log(`rendering ${FILM} at ${WIDTH}x${HEIGHT} (${FORMAT})${PROBE ? ' probe, no encode' : ''}`);
const t0 = Date.now();
const out = await page.evaluate((f, o) => window.render3d(f, o), film,
    { width: WIDTH, height: HEIGHT, probe: PROBE, durationSec: DURATION, grab: GRAB,
      silent: SILENT, format: FORMAT, ...voiceOpts,
      where: process.env.WHERE ? process.env.WHERE.split(',') : null,
      at: Number(process.env.AT ?? 0) });

if (out.where) {
    for (const [k, v] of Object.entries(out.where)) console.log(`  ${k.padEnd(18)} ${JSON.stringify(v)}`);
    await browser.close(); server.close(); releaseLock(); process.exit(0);
}

if (out.frames) {
    await mkdir(join(ROOT, dirname(OUT)), { recursive: true });
    for (const fr of out.frames) {
        const f = join(ROOT, dirname(OUT), `grab-${String(fr.t).replace('.', '_')}.png`);
        await writeFile(f, Buffer.from(fr.png.split(',')[1], 'base64'));
        console.log(`  ${f.replace(ROOT, '')}`);
    }
    await browser.close(); server.close(); releaseLock();
    process.exit(0);
}

console.log(`\n  encoder=${out.encoder} mime=${out.mime}`);
console.log(`  audio: ${out.cues} cues, ${out.lines} lines, ${out.audioSec}s`);
console.log(`  overlay: ${out.overlayItems} items, ${out.subtitles} subtitle spans`);
console.log(`  ${out.duration}s · ${out.nodes} nodes · ${out.tracks} tracks `
            + `· ${out.textures} textures · ${out.clipPlanes} clip planes `
            + `· ${out.particles} particles · ${((Date.now() - t0) / 1000).toFixed(1)}s wall`);
for (const d of out.diagnostics) console.log(`  [${d.severity}] ${d.message}`);

if (!PROBE && out.size) {
    /**
     * Read the film back in 4 MB chunks, and CHECK THE LENGTH.
     *
     * The length check is the part that matters. A truncated transfer
     * produces a file that exists, has a plausible size and plays its first
     * few seconds, so without this the failure is discovered by a viewer.
     */
    const ext = String(out.type || out.mime || '').includes('mp4') ? '.mp4' : '.webm';
    const target = OUT.replace(/\.(mp4|webm)$/i, '') + ext;
    if (target !== OUT) console.log(`  note: encoded ${out.type}, writing ${target}`);
    const CHUNK = 4 * 1024 * 1024;
    const parts = [];
    for (let offset = 0; offset < out.size; offset += CHUNK) {
        const chunk = await page.evaluate((o, l) => window.readFilmChunk(o, l), offset, CHUNK);
        parts.push(Buffer.from(chunk.base64, 'base64'));
    }
    const file = Buffer.concat(parts);
    if (file.length !== out.size) {
        throw new Error(`readback is short: got ${file.length} of ${out.size} bytes`);
    }
    await mkdir(join(ROOT, dirname(target)), { recursive: true });
    await writeFile(join(ROOT, target), file);
    wrotePath = target;
    console.log(`  wrote ${target} (${(file.length / 1e6).toFixed(2)} MB)`);
}

try { await browser.close(); } catch { /* it was already gone */ }
server.close();
releaseLock();
