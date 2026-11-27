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
import { handleTake } from './lib/take-cache-server.mjs';
import { resolveSize, QUALITIES } from '../src/core/render/quality.js';
import { AOV_KINDS, depthRange, depthQuantum } from '../src/core/render/aov.js';

const CHROME = process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('..', import.meta.url).pathname;
const FILM = process.env.FILM ?? 'demo/ak47.json';
const OUT = process.env.OUT ?? 'demo/out/ak47.mp4';
/**
 * `QUALITY=720p` -- the resolution ladder, by name.
 *
 * 360p | 480p | 720p | 1024p | 1080p | 1440p | 2160p, resolved against the
 * film's own aspect so a vertical film gets 720 ACROSS. `WIDTH`/`HEIGHT`
 * still win if given, which is what keeps every existing npm script
 * rendering exactly the size it did before.
 */
const QUALITY = process.env.QUALITY ?? null;
const META = QUALITY
    ? await readFile(join(ROOT, FILM), 'utf8').then((t) => JSON.parse(t).meta ?? {},
                                                    () => ({}))
    : null;
const QSIZE = QUALITY ? resolveSize(QUALITY, META) : null;
if (QUALITY && !QSIZE) throw new Error(`QUALITY=${QUALITY} is not a size; `
    + `try ${Object.keys(QUALITIES).join(', ')}`);
const WIDTH = Number(process.env.WIDTH ?? QSIZE?.[0] ?? 1280);
const HEIGHT = Number(process.env.HEIGHT ?? QSIZE?.[1] ?? 720);
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
/**
 * Recast every voice in the film, at render time, without editing it.
 *
 *   VOICE_CAST=kokoro:bm_george npm run render:earth
 *
 * `VOICE_BACKEND` only reorders the fallback LADDER, which is a different
 * thing and was the thing missing: a film cast as `tts:en_US-hfc_male-medium`
 * resolves to Piper whatever is promoted ahead of it, so promoting Kokoro and
 * expecting to hear it is the one mistake this flag removes. Hearing a new
 * engine on a finished film should be one command, not an edit to the film.
 *
 * It rewrites `voices.<role>.spec` and leaves everything else -- `lang`,
 * `gain`, `rate`, `pitch` -- exactly as authored, because those describe the
 * PERFORMANCE and not the model.
 */
const VOICE_CAST = process.env.VOICE_CAST ?? null;
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
/**
 * AOV=depth,normal,object writes render passes beside the picture.
 *
 *   AOV=depth GRAB=12.5 FILM=demo/ak47.json node scripts/produce3d.mjs
 *
 * Times come from `GRAB` when it is set, because the frame you want a matte
 * for is the frame you were looking at. A whole sequence is the same loop
 * with every frame in it; see docs/13-3D-FILM.md for why that is not the
 * default.
 *
 * ponytail: single times, not a sequence. A 1,200-frame film is 1,200
 * base64 round trips through CDP; the upgrade is a per-frame write inside
 * `renderOffline`'s loop, and nothing composites here yet to need it.
 */
const AOV = process.env.AOV ? process.env.AOV.split(',').map((s) => s.trim()) : null;
/** What each pass holds, written into the sidecar so the file explains itself. */
const PASS_DOC = {
    depth: { encoding: 'three.js RGBADepthPacking, red most significant',
             depth: 'z = r/256 + g/65536 + b/16777216 + a/4294967296',
             distance: 'perspective: (near*far)/(far - (far-near)*z); '
                 + 'orthographic: near + z*(far-near)',
             note: 'opens white: red saturates beyond 2.56 m with a 0.01 m near plane' },
    normal: { encoding: 'three.js MeshNormalMaterial, n*0.5+0.5 per channel',
              normal: 'n = [r,g,b]/127.5 - 1, renormalised',
              space: 'view space, geometric -- no normal map is applied' },
    object: { encoding: 'flat matte colour per node, no antialiasing',
              lookup: '`colors` below maps #rrggbb to the node id',
              note: 'black is reserved for the background' },
};
if (AOV) {
    const bad = AOV.filter((k) => !AOV_KINDS.includes(k));
    if (bad.length) throw new Error(`AOV=${bad.join(',')} is not a pass; `
        + `try ${AOV_KINDS.join(', ')}`);
}
/**
 * ONION=2,1,0.25 draws ghosted frames around each GRAB time.
 *
 *   ONION=3,2,0.2 GRAB=12.5 FILM=demo/ak47.json node scripts/produce3d.mjs
 *
 * before, after, spacing-in-seconds. Spacing is seconds and not frames
 * because a ghost one frame away is nearly identical to the live one and
 * tells an animator nothing; see src/render/onionSkin.js.
 */
const ONION = process.env.ONION
    ? process.env.ONION.split(',').map(Number) : null;
if (ONION && (ONION.length !== 3 || ONION.some((n) => !Number.isFinite(n)))) {
    throw new Error('ONION takes three numbers: before,after,spacing (e.g. 2,1,0.25)');
}
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

/**
 * Where baked voice takes live. Gitignored, content-addressed, and the reason
 * a second render of a film synthesizes nothing -- see
 * `src/core/voice/takeCache.js`. `VOICE_CACHE=0` turns it off.
 */
const TAKE_DIR = join(ROOT, process.env.VOICE_CACHE_DIR ?? 'cache/voice');
const TAKE_CACHE = process.env.VOICE_CACHE !== '0';

const server = createServer(async (req, res) => {
    try {
        if (TAKE_CACHE && await handleTake(req, res, { dir: TAKE_DIR })) return;
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

/**
 * 120s, not puppeteer's default 30s.
 *
 * Every headless run launches a FRESH Chrome profile, so the browser cache is
 * empty and `film3d.html`'s ten `three` modules are fetched from a CDN from
 * scratch every single time. Measured at 7.8s for `three.module.js` alone on
 * an ordinary connection, which puts a cold load within reach of 30s and
 * occasionally past it -- an intermittent "Navigation timeout" that looks
 * like a broken page and is a slow network. The same reason the voice take
 * cache exists; see src/core/voice/takeCache.js.
 */
await page.goto(`${base}/film3d.html`, { waitUntil: 'load', timeout: 120_000 });
await page.waitForFunction(() => window.ready3d === true, { timeout: 60_000 });

const film = JSON.parse(await readFile(join(ROOT, FILM), 'utf8'));
if (VOICE_CAST) {
    const roles = Object.keys(film.voices ?? {});
    if (!roles.length) {
        console.log(`  [voice] VOICE_CAST=${VOICE_CAST} but this film casts no voices`);
    } else {
        for (const role of roles) {
            const was = film.voices[role];
            film.voices[role] = typeof was === 'string'
                ? VOICE_CAST
                : { ...was, spec: VOICE_CAST };
            console.log(`  [voice] recast ${role}: `
                + `${typeof was === 'string' ? was : was.spec} -> ${VOICE_CAST}`);
        }
    }
}

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
    const { samples, overlay = [], transitions = [] } = await page.evaluate(
        (f, o) => window.render3d(f, o), film,
        { width: 960, height: 540, check: times });
    const exposure = checkExposure(samples);
    console.log(`\n  compile: ${compiled.diagnostics.length} · framing: ${framing.length} `
                + `· exposure: ${exposure.length} · overlay: ${overlay.length} `
                + `· transitions: ${transitions.length} `
                + `(over ${samples.length} samples)`);
    for (const d of [...compiled.diagnostics, ...framing, ...exposure, ...overlay,
                     ...transitions]) {
        console.log(`  [${d.severity}] ${d.message}`);
    }
    const worst = samples.reduce((a, b) => (a.mean < b.mean ? a : b));
    const best = samples.reduce((a, b) => (a.mean > b.mean ? a : b));
    console.log(`  luma: darkest ${worst.mean.toFixed(3)} (${worst.shotId}), `
                + `brightest ${best.mean.toFixed(3)} (${best.shotId})`);
    await browser.close(); server.close();
    // A transition `note` is a judgement, not a defect, so it prints without
    // failing the check -- unlike a warning, which names something a finished
    // film would show.
    const findings = compiled.diagnostics.length + framing.length
        + exposure.length + overlay.length
        + transitions.filter((t) => t.severity !== 'note').length;
    process.exit(findings ? 1 : 0);
}

if (DIGEST) {
    const { compileFilm3D } = await import(new URL('../src/core/script/compile3d.js', import.meta.url));
    const { formatDigest, checkDigest } = await import(
        new URL('../src/core/script/digest.js', import.meta.url));
    const compiled = compileFilm3D(film);
    // One sample per shot by default, at 55% through it -- past the cut and
    // past any `set` that lands on the shot's first frame.
    //
    // Plus one AT each transition's peak. Mid-shot samples never land inside
    // a transition window, so a film could have had its dips silently stop
    // working and the digest would have reported nine perfectly good frames.
    // A feature with no sample is a feature with no check.
    const shotAt = (t) => compiled.shots.find((s) => t >= s.start && t < s.end)?.shotId ?? null;
    const times = DIGEST === '1'
        ? [...compiled.shots.map((s) => ({ t: +(s.start + s.duration * 0.55).toFixed(2),
                                           shotId: s.shotId })),
           ...(compiled.meta.transitions ?? [])
               .filter((tr) => tr.kind !== 'continue')
               // An 'in' peaks at its own start; the others peak at the
               // boundary, which for an 'out' is the film's last instant --
               // nudged inside it so there is a frame to sample.
               .map((tr) => +Math.min(tr.at, compiled.duration - 1 / compiled.meta.fps)
                   .toFixed(2))
               .map((t) => ({ t, shotId: shotAt(t) }))]
            .sort((a, b) => a.t - b.t)
        : DIGEST.split(',').map(Number).map((t) => ({ t, shotId: shotAt(t) }));
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

if (ONION) {
    const dir = join(ROOT, dirname(OUT));
    await mkdir(dir, { recursive: true });
    const [before, after, spacing] = ONION;
    const res = await page.evaluate((f, o) => window.render3d(f, o), film,
        { width: WIDTH, height: HEIGHT, silent: true,
          onion: { before, after, spacing, at: GRAB ?? [0] } });
    for (const fr of res.frames) {
        const f = join(dir, `onion-${String(fr.t).replace('.', '_')}.png`);
        await writeFile(f, Buffer.from(fr.png.split(',')[1], 'base64'));
        console.log(`  ${f.replace(ROOT, '')}`);
    }
    for (const c of res.onion) {
        // The shot is printed because it is the clamp: asking for 3 behind
        // one frame after a cut correctly yields fewer, and a bare count
        // would read as a fault rather than as the cut.
        const where = c.window ? `, clamped to shot ${c.shot} `
            + `[${c.window[0].toFixed(2)}, ${c.window[1].toFixed(2)}]` : '';
        console.log(`  ${c.t}s: ${c.ghosts} ghost(s) at ${spacing}s apart `
            + `(${before} behind, ${after} ahead)${where}`);
    }
    if (res.sims) {
        console.log(`  note: this scene has ${res.sims} simulation(s), so every ghost `
            + 'replays from t=0 -- onion skinning a long simulated shot is quadratic.');
    }
    await browser.close(); server.close(); releaseLock();
    process.exit(0);
}

if (AOV) {
    const dir = join(ROOT, dirname(OUT));
    await mkdir(dir, { recursive: true });
    const res = await page.evaluate((f, o) => window.render3d(f, o), film,
        { width: WIDTH, height: HEIGHT, silent: true,
          aov: { kinds: AOV, at: GRAB ?? [0], raw: AOV.includes('depth') } });
    for (const a of res.aovs) {
        const f = join(dir, `aov-${a.kind}-${String(a.t).replace('.', '_')}.png`);
        await writeFile(f, Buffer.from(a.png.split(',')[1], 'base64'));
        console.log(`  ${f.replace(ROOT, '')}`);
    }
    /**
     * One sidecar for every pass, not just the mattes.
     *
     * A render pass without the key to read it is a picture of data. The
     * depth pass in particular opens WHITE (see `depthRange`), so the file
     * that says what it contains is the half of the feature that makes it
     * usable -- and it is also the only place the decode is written down
     * where a compositor, rather than this repo's test suite, will find it.
     */
    const sidecar = {
        camera: res.camera, width: WIDTH, height: HEIGHT,
        passes: Object.fromEntries(AOV.map((k) => [k, PASS_DOC[k]])),
    };
    for (const r of res.raws ?? []) {
        if (r.kind !== 'depth') continue;
        const px = Buffer.from(r.base64, 'base64');
        const range = depthRange(px, res.camera);
        sidecar.depthRange = { ...range, at: r.t,
                               quantum: depthQuantum(range.far, res.camera) };
        console.log(`  depth at ${r.t}s: ${range.near.toFixed(3)} m to `
            + `${range.far.toFixed(3)} m over ${(range.covered * 100).toFixed(1)}% `
            + `of the frame (+/-${depthQuantum(range.far, res.camera).toExponential(1)} m `
            + 'at the back)');
    }
    if (AOV.includes('object')) Object.assign(sidecar, res.manifest);
    const mf = join(dir, 'aov-manifest.json');
    await writeFile(mf, `${JSON.stringify(sidecar, null, 2)}\n`);
    console.log(`  ${mf.replace(ROOT, '')}`
        + (res.manifest && AOV.includes('object')
            ? ` -- ${Object.keys(res.manifest.colors).length} mattes, `
              + `${res.manifest.collisions.length} collision(s)` : ''));
    console.log(`  camera: near ${res.camera.near} far ${res.camera.far}`
        + `${res.camera.ortho ? ' (orthographic: depth is LINEAR)' : ''}`);
    for (const d of res.diagnostics) console.log(`  [${d.severity}] ${d.message}`);
    await browser.close(); server.close(); releaseLock();
    process.exit(0);
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
