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
 *
 * ## The click is found RELATIVE to the window's own peak
 *
 * It used to be found against an absolute threshold -- 0.9 in the mix, 0.5
 * in the decoded file -- which quietly stopped working the day voice
 * loudness matching landed. `normalizeGain` brings every voice to the same
 * speech RMS, and for this synthetic provider that is a legitimate -10.3 dB:
 * the click arrives in the mix at 0.289, the test demanded 0.9, and the one
 * check that proves A/V alignment had been failing ever since. The pipeline
 * was right and the ruler was stale.
 *
 * So the probe measures the click against the loudest thing in the same
 * window instead. The click is deliberately ~2.7x the speech peak, and a
 * ratio survives any uniform gain the chain applies -- which is the property
 * the absolute threshold was missing. The measured separation is reported on
 * every run and asserted, so a future change that erodes it fails loudly
 * instead of making this test pass by luck.
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { acquireLock } from '../../scripts/lib/render-lock.mjs';

const CHROME = process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('../..', import.meta.url).pathname;
const DURATION = Number(process.env.AV_SECONDS ?? 8);
/**
 * Which encoder to prove. 'webm' is the zero-dependency paced path; 'mp4' is
 * WebCodecs with the built-in muxer. Both are shipping paths, so both have to
 * pass this probe -- an MP4 whose audio is a frame late is exactly the defect
 * this test exists to catch, and no other check would see it.
 */
const FORMAT = process.env.FORMAT ?? 'webm';

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

// Same lock the render scripts take. This test is what killed a
// three-minute render once, by being the second headless Chrome.
await acquireLock('rendering the A/V probe');
const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required',
           '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream'],
    protocolTimeout: 600_000,
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
// `load`, not `networkidle2`: the page registers a service worker, so network
// quiet is no longer a signal that the page is ready.
/**
 * This page reloads itself exactly once on a first visit, inside
 * `registerServiceWorker`, so the worker's cross-origin-isolation headers
 * apply -- which is correct and documented in film.html. It also destroys the
 * execution context out from under whatever `evaluate` is already running,
 * with an error that blames "a navigation" and names nothing. Puppeteer gets a
 * fresh profile every run, so this test hit it EVERY run and had been failing
 * on a clean checkout. Retry once: the second load is already isolated.
 */
async function onPage(fn) {
    for (let attempt = 0; ; attempt++) {
        await page.goto(`${base}/film.html`, { waitUntil: 'load' });
        try {
            return await fn();
        } catch (e) {
            if (attempt > 0 || !/context was destroyed|Execution context/i.test(String(e))) throw e;
        }
    }
}

const result = await onPage(() => page.evaluate(async (origin, durationSec, format) => {
    const out = { log: [] };
    const { FilmStudio } = await import(`${origin}/src/studio.js`);
    const studio = new FilmStudio({ onLog: (m) => out.log.push(m) });

    // A synthetic provider: a 1.5s tone burst per line, plus a 1kHz click at
    // the very start so the sync probe has something to find.
    const SR = 48000;

    /**
     * Find the sync click without caring how loud anything is.
     *
     * Returns the first sample at or above `ratio` of the window's own peak,
     * plus the numbers needed to judge whether the probe is still trustworthy:
     * the peak itself, and the loudest thing AFTER the click, which is the
     * speech. If those two ever converge the click is no longer distinguishable
     * and the test should say so rather than guess.
     */
    const CLICK_SECONDS = 0.02;
    function findClick(data, sampleRate, { window = 2, ratio = 0.5 } = {}) {
        const n = Math.min(data.length, Math.round(sampleRate * window));
        const after = Math.round(sampleRate * CLICK_SECONDS * 2);
        let peak = 0;
        let rest = 0;
        for (let i = 0; i < n; i++) {
            const a = Math.abs(data[i]);
            if (a > peak) peak = a;
            if (i >= after && a > rest) rest = a;
        }
        // A silent window has no click in it, and no peak to measure one against.
        if (peak < 1e-4) return { sample: -1, peak: 0, rest: 0, ratio: 0 };
        const floor = peak * ratio;
        let sample = -1;
        for (let i = 0; i < n; i++) {
            if (Math.abs(data[i]) >= floor) { sample = i; break; }
        }
        return {
            sample,
            peak: +peak.toFixed(4),
            rest: +rest.toFixed(4),
            // How far the click stands above everything else. The separation,
            // not the level, is what this probe depends on.
            ratio: rest > 0 ? +(peak / rest).toFixed(2) : Infinity,
        };
    }

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
    // MIX is known independently of the encoder. Relative to the window's
    // own peak: the chain legitimately scales dialogue, and an absolute
    // threshold here is a number that goes stale without telling anybody.
    const mix = findClick(prepared.audio.getChannelData(0), SR);
    out.mixClickSample = mix.sample;
    out.mixClick = mix;

    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 180;

    const t0 = performance.now();
    const res = await studio.render(prepared, {
        canvas, width: 320, height: 180, fps: 24,
        format,
        // 'webm' here means the zero-dependency paced path, deliberately.
        preferWebCodecs: format !== 'webm',
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
        const found = findClick(decoded.getChannelData(0), decoded.sampleRate);
        out.decodedAudio = {
            duration: +decoded.duration.toFixed(3),
            rate: decoded.sampleRate,
            clickSample: found.sample,
            clickSec: found.sample >= 0
                ? +(found.sample / decoded.sampleRate).toFixed(3) : null,
            peak: found.peak,
            separation: found.ratio,
        };
    } catch (e) {
        out.decodedAudio = { error: e.message };
    }
    URL.revokeObjectURL(url);

    // Hand the bytes back so the file can be written to disk and inspected.
    const buf = await res.blob.arrayBuffer();
    out.bytes = [...new Uint8Array(buf.slice(0, 0))];   // keep the payload small
    return out;
}, base, DURATION, FORMAT));

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
// The click is a 1kHz sine starting at a zero crossing, so it takes ~12
// samples at 48kHz to climb past half its own peak. Allow 1ms of ramp.
if (result.mixClickSample < 0 || result.mixClickSample > 48) {
    fail.push(`click should start the mix, found at sample ${result.mixClickSample}`);
}
/**
 * The probe depends on the click standing clear of the speech, not on
 * either being any particular level. 2.7x is the designed separation;
 * below 1.6x the finder could latch onto a loud syllable instead and this
 * test would start passing or failing for the wrong reason.
 */
const MIN_SEPARATION = 1.6;
for (const [where, got] of [['mix', result.mixClick?.ratio],
                            ['encoded audio', result.decodedAudio?.separation]]) {
    if (got != null && Number.isFinite(got) && got < MIN_SEPARATION) {
        fail.push(`sync click only ${got}x above the speech in the ${where} `
            + `(need ${MIN_SEPARATION}x) -- the probe can no longer tell them apart`);
    }
}
if (result.video?.error) fail.push(`output undecodable: ${result.video.error}`);
else if (Math.abs(result.video.duration - want) > 0.25) {
    fail.push(`output duration ${result.video.duration}s != ${want}s (+/-0.25)`);
}
if (result.decodedAudio?.error) fail.push(`audio did not survive muxing: ${result.decodedAudio.error}`);
else if (result.decodedAudio.clickSample < 0) fail.push('sync click not found in the encoded audio');
else if (result.decodedAudio.clickSec > 0.02) {
    // Was 0.15, which was loose enough to pass an MP4 whose audio arrived
    // 0.044s late from AAC encoder priming. Measured: 0.007s on the paced
    // WebM path, 0.000s on MP4 once the edit list declares the lead-in.
    // One frame at 24 fps is 0.042s, so the budget here is half a frame.
    fail.push(`sync click at ${result.decodedAudio.clickSec}s, expected <0.02s -- A/V drift`);
}

if (fail.length) {
    console.error('\nFAILED:\n - ' + fail.join('\n - '));
    process.exit(1);
}
console.log(`\nPASS: ${want}s film as ${result.blob.type} via ${result.sink}, audio muxed, `
    + `lipsync keyed, click at ${result.decodedAudio.clickSec}s, `
    + `duration ${result.video.duration}s.`);
console.log(`  sync click ${result.mixClick.ratio}x above the speech in the mix `
    + `(peak ${result.mixClick.peak}), ${result.decodedAudio.separation}x after muxing. `
    + `Levels are free to change; the separation is what this probe needs.`);
