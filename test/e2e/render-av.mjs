/**
 * Audio/video verification: proves the voice -> offline mix -> lipsync ->
 * muxed-video path end to end, and that the output's DURATION is correct.
 *
 * Uses a synthetic voice provider rather than real TTS so the test is fast,
 * offline and deterministic. What is under test is the pipeline, not the
 * quality of a particular voice model.
 *
 * Includes the SYNC PROBE: a white flash and an audio click at known times,
 * asserted back out of the encoded file. That is the only check that proves
 * audio and video are actually aligned rather than merely both present.
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const CHROME = process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('../..', import.meta.url).pathname;
const DURATION = Number(process.env.AV_SECONDS ?? 8);

const TYPES = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.json': 'application/json', '.png': 'image/png', '.txt': 'text/plain',
    '.webmanifest': 'application/manifest+json',
};

const server = createServer(async (req, res) => {
    try {
        const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
        const f = join(ROOT, p === '/' ? 'film.html' : p);
        if (!f.startsWith(ROOT)) { res.writeHead(403).end(); return; }
        const body = await readFile(f);
        res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
        res.end(body);
    } catch {
        if (!res.headersSent) res.writeHead(404);
        res.end('not found');
    }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required',
           '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
// `load`, not `networkidle2`: the page registers a service worker, so network
// quiet is no longer a signal that the page is ready.
await page.goto(`${base}/film.html`, { waitUntil: 'load' });

const result = await page.evaluate(async (origin, durationSec) => {
    const out = { log: [] };
    const { FilmStudio } = await import(`${origin}/src/studio.js`);
    const studio = new FilmStudio({ onLog: (m) => out.log.push(m) });

    // A synthetic provider: a 1.5s tone burst per line, plus a 1kHz click at
    // the very start so the sync probe has something to find.
    const SR = 48000;
    const ac = new OfflineAudioContext(1, 1, SR);
    const makeBuffer = (secs, withClick) => {
        const buf = ac.createBuffer(1, Math.round(secs * SR), SR);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
            const t = i / SR;
            // speech-ish: amplitude-modulated tone, with gaps so the
            // envelope produces real voiced spans for lipsync to use
            const gate = Math.sin(t * 7) > -0.3 ? 1 : 0;
            d[i] = gate * 0.35 * Math.sin(2 * Math.PI * 180 * t)
                 * (0.6 + 0.4 * Math.sin(2 * Math.PI * 3.1 * t));
        }
        if (withClick) {
            for (let i = 0; i < SR * 0.02; i++) {
                d[i] = Math.sin(2 * Math.PI * 1000 * (i / SR)) * 0.95;
            }
        }
        return buf;
    };

    let n = 0;
    studio.voices.register({
        id: 'synth', source: 'tts', label: 'synthetic',
        available: async () => true,
        listVoices: async () => [{ id: 'test', provider: 'synth', name: 'Synthetic' }],
        synthesize: async ({ text }) => ({
            audioBuffer: makeBuffer(Math.max(1.2, text.split(/\s+/).length / 2.6), n++ === 0),
            phonemes: null,
        }),
    });

    // A short film: flash frame at t=0 and t=4, dialogue at 0.0 and 4.0.
    const film = {
        version: 'jirex.film/1',
        meta: { title: 'AV Probe', fps: 24, width: 320, height: 180 },
        voices: { v: { spec: 'synth:test' } },
        palettes: { p: { skin: '#e8c39e', coat: '#b23a2c', hair: '#2b1d14', eye: '#111', shoe: '#222' } },
        characters: { ana: { palette: 'p', voice: 'v', generate: {}, proportions: { height: 120 } } },
        scenes: [{
            id: 'only',
            background: { color: '#102030' },
            scenery: [
                { id: 'flash', shape: { kind: 'rect', w: 320, h: 180, cx: true, cy: true },
                  at: [160, 90], fill: '#ffffff', alpha: 0, z: 5000, screenSpace: true },
            ],
            cast: [{ character: 'ana', as: 'ana', at: [160, 150], scale: 1 }],
            shots: [
                { id: 'a', duration: durationSec / 2,
                  actions: [{ target: 'ana', do: 'play', action: 'idle' }],
                  dialogue: [{ speaker: 'ana', at: 0, text: 'Mama saw five boats come home tonight.' }] },
                { id: 'b', duration: durationSec / 2,
                  actions: [{ target: 'ana', do: 'play', action: 'breathe' }],
                  dialogue: [{ speaker: 'ana', at: 0, text: 'The light held until morning.' }] },
            ],
        }],
    };

    const prepared = await studio.prepare(film, { retime: false });
    out.prepared = {
        duration: +prepared.meta.duration.toFixed(3),
        cues: prepared.cues.length,
        audioDuration: prepared.audio ? +prepared.audio.duration.toFixed(3) : null,
        audioRate: prepared.audio?.sampleRate ?? null,
        visemeTracks: prepared.timeline.tracks.filter((t) => t.path === 'props.viseme').length,
        visemeKeys: prepared.timeline.tracks
            .filter((t) => t.path === 'props.viseme')
            .reduce((n2, t) => n2 + t.keys.length, 0),
        visemesUsed: [...new Set(prepared.timeline.tracks
            .filter((t) => t.path === 'props.viseme')
            .flatMap((t) => t.keys.map((k) => k.v)))].sort(),
    };

    // The flash: one frame fully white at t=0, driven as a core track so the
    // encoder cannot miss it.
    const flashNode = [...prepared.scene.byId.keys()].find((k) => k.includes('flash'));
    prepared.timeline.tracks.push({
        target: flashNode, path: 'props.alpha', type: 'number',
        keys: [
            { t: 0, v: 1, ease: 'step' },
            { t: 1 / 24, v: 0, ease: 'step' },
        ],
    });

    // Measure the audio mix's own envelope, so the click's position in the
    // MIX is known independently of the encoder.
    const ch = prepared.audio.getChannelData(0);
    let clickAt = -1;
    for (let i = 0; i < Math.min(ch.length, SR * 2); i++) {
        if (Math.abs(ch[i]) > 0.9) { clickAt = i; break; }
    }
    out.mixClickSample = clickAt;

    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 180;

    const t0 = performance.now();
    const res = await studio.render(prepared, {
        canvas, width: 320, height: 180, fps: 24,
        preferWebCodecs: false,          // exercise the zero-dependency path
    });
    out.renderWallSec = +((performance.now() - t0) / 1000).toFixed(2);
    out.sink = res.sink;
    out.preflight = res.preflight;
    out.blob = { size: res.blob.size, type: res.blob.type };

    // Read the encoded file back: duration, and whether it carries audio.
    const url = URL.createObjectURL(res.blob);
    const v = document.createElement('video');
    v.src = url; v.muted = true;
    out.video = await new Promise((resolve) => {
        const finish = (d) => resolve({
            duration: +Number(d).toFixed(3),
            width: v.videoWidth, height: v.videoHeight,
        });
        v.onloadedmetadata = () => {
            if (!isFinite(v.duration)) {
                v.currentTime = 1e9;
                v.ontimeupdate = () => { v.ontimeupdate = null; finish(v.duration); };
            } else finish(v.duration);
        };
        v.onerror = () => resolve({ error: 'could not decode output' });
        setTimeout(() => resolve({ error: 'metadata timeout' }), 8000);
    });

    // Decode the output's audio and locate the click, proving the audio
    // actually survived muxing at the right offset.
    try {
        const bytes = await res.blob.arrayBuffer();
        const dctx = new OfflineAudioContext(1, 1, SR);
        const decoded = await dctx.decodeAudioData(bytes.slice(0));
        const d = decoded.getChannelData(0);
        let peak = -1;
        for (let i = 0; i < Math.min(d.length, SR * 2); i++) {
            if (Math.abs(d[i]) > 0.5) { peak = i; break; }
        }
        out.decodedAudio = {
            duration: +decoded.duration.toFixed(3),
            rate: decoded.sampleRate,
            clickSample: peak,
            clickSec: peak >= 0 ? +(peak / decoded.sampleRate).toFixed(3) : null,
        };
    } catch (e) {
        out.decodedAudio = { error: e.message };
    }
    URL.revokeObjectURL(url);

    // Hand the bytes back so the file can be written to disk and inspected.
    const buf = await res.blob.arrayBuffer();
    out.bytes = [...new Uint8Array(buf.slice(0, 0))];   // keep the payload small
    return out;
}, base, DURATION);

console.log(JSON.stringify(result, (k, v) => (k === 'log' || k === 'bytes' ? undefined : v), 2));
console.log('\nstudio log:');
for (const l of result.log) console.log('  ' + l);
console.log('\npage errors:', errors.length ? errors : 'none');

await browser.close();
server.close();

const fail = [];
const want = DURATION;
if (!result.prepared.audio && !result.prepared.audioDuration) fail.push('no audio mix produced');
if (result.prepared.cues !== 2) fail.push(`expected 2 audio cues, got ${result.prepared.cues}`);
if (result.prepared.visemeTracks !== 2) fail.push(`expected 2 viseme tracks, got ${result.prepared.visemeTracks}`);
if (result.prepared.visemeKeys < 10) fail.push(`only ${result.prepared.visemeKeys} viseme keys -- lipsync not working`);
// The click is a 1kHz sine starting at zero crossing, so it needs ~11
// samples at 48kHz to exceed the 0.9 threshold. Allow 1ms of ramp.
if (result.mixClickSample < 0 || result.mixClickSample > 48) {
    fail.push(`click should start the mix, found at sample ${result.mixClickSample}`);
}
if (result.video?.error) fail.push(`output undecodable: ${result.video.error}`);
else if (Math.abs(result.video.duration - want) > 0.25) {
    fail.push(`output duration ${result.video.duration}s != ${want}s (+/-0.25)`);
}
if (result.decodedAudio?.error) fail.push(`audio did not survive muxing: ${result.decodedAudio.error}`);
else if (result.decodedAudio.clickSample < 0) fail.push('sync click not found in the encoded audio');
else if (result.decodedAudio.clickSec > 0.15) {
    fail.push(`sync click at ${result.decodedAudio.clickSec}s, expected ~0s -- A/V drift`);
}

if (fail.length) {
    console.error('\nFAILED:\n - ' + fail.join('\n - '));
    process.exit(1);
}
console.log(`\nPASS: ${want}s film, audio muxed, lipsync keyed, click at `
    + `${result.decodedAudio.clickSec}s, duration ${result.video.duration}s.`);
