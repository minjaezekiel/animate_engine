/**
 * Say a line, or bake a whole film's dialogue, through any voice engine.
 *
 *   SAY="This is Kokoro." SPEC=kokoro:bm_george npm run say
 *   FILM=films/earth3d.json SPEC=kokoro:bm_george npm run say   # bake
 *   FILM=films/earth3d.json npm run say                         # bake as cast
 *
 * # Why this exists
 *
 * Two things, and they are the same thing from different ends.
 *
 * **Auditioning.** Kokoro runs through `onnxruntime-web`, so hearing it at
 * all needed a browser, and the only way to get one was to render a film.
 * "What does this voice sound like" should not cost three minutes and 50 MB
 * of video.
 *
 * **Baking.** A render reads from the take cache
 * (`src/core/voice/takeCache.js`) and only synthesizes what is missing. So
 * filling the cache out of band is what makes the two new engines practical:
 * Kokoro's ~86 MB model is loaded ONCE here instead of once per render, and
 * an OpenVoice server needs to be running only while this runs -- start it,
 * bake, stop it, and render offline for the rest of the week.
 *
 * It is the same browser, the same gateway and the same cache the render
 * uses, which is the point: a line baked here is byte-for-byte the line the
 * render would have made, because the cache hands back what it stored rather
 * than what it was given.
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { handleTake } from './lib/take-cache-server.mjs';
import { acquireLock, releaseLock } from './lib/render-lock.mjs';

const CHROME = process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('..', import.meta.url).pathname;
const SAY = process.env.SAY ?? null;
const FILM = process.env.FILM ?? null;
const SPEC = process.env.SPEC ?? null;
const OUT = process.env.OUT ?? 'out/voice/take.wav';
const VOICE_BACKEND = process.env.VOICE_BACKEND
    ?? (SPEC ? SPEC.split(':')[0].replace(/^tts$/, 'piper') : null);
const TAKE_DIR = join(ROOT, process.env.VOICE_CACHE_DIR ?? 'cache/voice');
const KOKORO_URL = process.env.KOKORO_URL ?? null;
const OPENVOICE_URL = process.env.OPENVOICE_URL ?? null;
const VOICE_STUDIO = process.env.VOICE_STUDIO ?? null;
const TTS_MODULE_URL = process.env.TTS_MODULE_URL
    ?? (existsSync(new URL('../vendor/vits-web.js', import.meta.url))
        ? '/vendor/vits-web.js' : null);

if (!SAY && !FILM) {
    console.error('usage: SAY="text" SPEC=<engine>:<voice> say.mjs');
    console.error('   or: FILM=films/x.json [SPEC=<engine>:<voice>] say.mjs');
    process.exit(1);
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
                '.json': 'application/json', '.wasm': 'application/wasm',
                '.onnx': 'application/octet-stream', '.wav': 'audio/wav' };

/**
 * A page of our own, rather than `film3d.html`.
 *
 * That page exposes `render3d` and nothing else, so auditioning through it
 * means rendering a film. This serves the same modules from the same origin
 * and exposes the registry directly -- 30 lines against a 3-minute render.
 */
const PAGE = `<!doctype html><meta charset="utf-8"><title>say</title>
<script type="importmap">
{ "imports": {
  "onnxruntime-web": "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/+esm",
  "kokoro-js": "https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm"
} }
</script>
<body><script type="module">
import { createRegistry } from '/src/core/voice/gateway.js';
import { createHttpTakeCache, webDigest } from '/src/core/voice/takeCache.js';
import { decodeAudio } from '/src/audio/OfflineMixer.js';
import { audioBufferToWav } from '/src/audio/wav.js';
import { synthesizeDialogue } from '/src/core/voice/synthesize.js';
window.__log = [];
const report = (m) => { window.__log.push(String(m)); };
window.say = async (cfg) => {
    const registry = createRegistry({
        decode: (b) => decodeAudio(b, 48000), sampleRate: 48000,
        backend: cfg.backend ?? null,
        ttsModuleUrl: cfg.ttsModuleUrl ?? null,
        kokoroUrl: cfg.kokoroUrl ?? null,
        openVoiceUrl: cfg.openVoiceUrl ?? null,
        voiceStudioUrl: cfg.voiceStudioUrl ?? null,
        onProgress: (p) => report('model: ' + (p.loaded ?? '') + '/' + (p.total ?? '')
            + ' ' + (p.url ?? '')),
        report,
    });
    const digest = webDigest();
    const takeCache = digest ? createHttpTakeCache({
        digest, decode: (b) => decodeAudio(b, 48000),
        encodeWav: audioBufferToWav, report }) : null;
    const out = await synthesizeDialogue({
        lipsyncJobs: cfg.jobs, registry, takeCache, fps: 24,
        voiceLevel: cfg.voiceLevel ?? 0.14,
        onProgress: (p) => report('line ' + p.done + '/' + p.total),
    });
    const rows = [];
    for (const job of cfg.jobs) {
        const cue = out.cues.find((c) => c.id === job.nodeId + '@' + job.at);
        const buf = cue ? out.buffers[cue.assetId] : null;
        rows.push({ text: job.text, spec: job.voiceSpec,
                    seconds: buf ? +buf.duration.toFixed(3) : 0,
                    gain: cue ? +cue.gain.toFixed(3) : 0 });
    }
    // Only the FIRST take comes back as bytes: this is a probe, and a whole
    // film of WAVs across the CDP boundary is the truncation defect Phase 39
    // spent an afternoon on.
    const first = out.cues.length ? out.buffers[out.cues[0].assetId] : null;
    // audioBufferToWav returns a BLOB, not an ArrayBuffer: it was written for
    // a download link. Reading .byteLength off a Blob gives undefined and
    // writes a zero-byte file, which is what the first run of this did.
    // (No backticks in here -- this whole page is a template literal.)
    const wav = first ? await audioBufferToWav(first).arrayBuffer() : null;
    return {
        rows, log: window.__log,
        probe: { frames: first?.length ?? 0, rate: first?.sampleRate ?? 0,
                 channels: first?.numberOfChannels ?? 0, wavBytes: wav?.byteLength ?? 0 },
        diagnostics: out.diagnostics.map((d) => d.message),
        substitutions: registry.diagnostics().map((d) => d.message),
        takes: takeCache ? takeCache.stats() : null,
        wav: wav ? [...new Uint8Array(wav)] : null,
    };
};
</script></body>`;

const server = createServer(async (req, res) => {
    try {
        if (await handleTake(req, res, { dir: TAKE_DIR })) return;
        const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
        if (p === '/' || p === '/index.html') {
            res.writeHead(200, { 'content-type': 'text/html',
                                 'cross-origin-opener-policy': 'same-origin',
                                 'cross-origin-embedder-policy': 'credentialless' });
            res.end(PAGE);
            return;
        }
        const f = join(ROOT, p);
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

/** Jobs: one line, or every line of a film in order. */
let jobs = [];
if (FILM) {
    const { compileFilm3D } = await import(new URL('../src/core/script/compile3d.js', import.meta.url));
    const film = JSON.parse(await readFile(join(ROOT, FILM), 'utf8'));
    if (SPEC) {
        for (const role of Object.keys(film.voices ?? {})) {
            const was = film.voices[role];
            film.voices[role] = typeof was === 'string' ? SPEC : { ...was, spec: SPEC };
        }
        console.log(`  recast every voice as ${SPEC}`);
    }
    jobs = compileFilm3D(film).lipsyncJobs.map((j) => ({
        nodeId: j.nodeId, speaker: j.speaker, text: j.text, at: j.at,
        voiceSpec: j.voiceSpec, lipsync: false,
    }));
    console.log(`baking ${jobs.length} line(s) of ${FILM}`);
} else {
    jobs = [{ nodeId: 'probe', speaker: 'probe', text: SAY, at: 0,
              voiceSpec: SPEC ?? 'tts:en_US-hfc_male-medium', lipsync: false }];
}

await acquireLock('voice synthesis');
const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
    protocolTimeout: 900_000,
});
const page = await browser.newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(String(e).slice(0, 300)));
await page.goto(base, { waitUntil: 'load' });
await page.waitForFunction(() => typeof window.say === 'function', { timeout: 30000 });

const t0 = Date.now();
const res = await page.evaluate((cfg) => window.say(cfg), {
    jobs, backend: VOICE_BACKEND, ttsModuleUrl: TTS_MODULE_URL,
    kokoroUrl: KOKORO_URL, openVoiceUrl: OPENVOICE_URL, voiceStudioUrl: VOICE_STUDIO,
});
const wall = ((Date.now() - t0) / 1000).toFixed(1);

await browser.close();
server.close();
releaseLock();

for (const l of res.log) if (/^\[/.test(l)) console.log(`  ${l}`);
for (const d of res.diagnostics) console.log(`  [warn] ${d}`);
for (const d of res.substitutions) console.log(`  [voice] ${d}`);
for (const p of problems) console.log(`  [page] ${p}`);

console.log('');
for (const r of res.rows) {
    console.log(`  ${String(r.seconds).padStart(7)}s  gain ${String(r.gain).padEnd(6)} `
        + `${r.spec.padEnd(28)} ${JSON.stringify(String(r.text).slice(0, 48))}`);
}
const spoken = res.rows.filter((r) => r.seconds > 0).length;
console.log(`\n  ${spoken}/${res.rows.length} spoken, `
    + `${res.rows.reduce((a, b) => a + b.seconds, 0).toFixed(1)}s of speech, ${wall}s wall`);
if (res.takes) {
    console.log(`  takes: ${res.takes.hits} cached, ${res.takes.misses} synthesized, `
        + `${res.takes.stored} written${res.takes.failed ? `, ${res.takes.failed} failed` : ''}`);
}

if (res.probe) {
    console.log(`  take: ${res.probe.frames} frames, ${res.probe.channels}ch @ `
        + `${res.probe.rate}Hz -> ${res.probe.wavBytes} wav bytes`);
}
if (res.wav?.length && !FILM) {
    await mkdir(join(ROOT, dirname(OUT)), { recursive: true });
    await writeFile(join(ROOT, OUT), Buffer.from(res.wav));
    console.log(`  wrote ${OUT} (${(res.wav.length / 1024).toFixed(0)} KB)`);
}
process.exit(spoken === res.rows.length ? 0 : 1);
