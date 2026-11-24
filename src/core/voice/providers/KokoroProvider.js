import { createVoice } from '../VoiceRegistry.js';

/**
 * Kokoro 82M, in the browser, through ONNX Runtime.
 *
 * # Why this one
 *
 * Kokoro is 82 million parameters -- about a fifth of the smallest useful
 * alternative -- under Apache 2.0, and it runs through the same
 * `onnxruntime-web` this engine already loads for Piper. So it costs no new
 * class of dependency: it is a second ONNX graph behind the provider
 * interface the registry has had since the first voice phase.
 *
 * What it buys over Piper is prosody. Piper is a VITS model per voice and its
 * delivery is flat in a way that Phase 32's pacing analyser measured directly
 * -- our films sit at 54% speech against the references' 73%, and a large
 * part of that is compensating for a voice that does not phrase. Kokoro
 * phrases.
 *
 * # Why it is optional, and ordered below Piper by default
 *
 * The model is fetched from Hugging Face at ~86 MB for q8, and a fresh
 * headless Chrome profile has an empty cache every run. Phase 30 lost a
 * ten-part series to exactly this: voice models re-downloading per render,
 * 503s from the host, and a renderer killed mid-download. The vendored Piper
 * path exists because of it. So Kokoro is available, selectable, and not the
 * default until a checkout has vendored it -- `VOICE_BACKEND=kokoro` or a
 * `kokoro:` spec in the film's own `voices` block turns it on.
 *
 * # Loader injection
 *
 * `moduleUrl` is where `kokoro-js` is imported from, so a checkout that has
 * vendored it points at the local copy exactly as `TtsVitsProvider` does with
 * vits-web. `module` lets a test pass a stub and keeps this file's logic
 * assertable without a network or a GPU.
 */
const DEFAULT_MODULE_URL = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm';
const DEFAULT_MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';

/**
 * A fallback list, used only when the model is not loaded yet.
 *
 * `list_voices()` is the authoritative source and is preferred whenever the
 * model is up. This exists so an editor can show a cast list, and an agent
 * can pick a voice, WITHOUT paying 86 MB to find out what the options are --
 * which is the difference between "choose a voice" costing nothing and
 * costing a download.
 *
 * The prefix is the convention Kokoro ships: first letter is the locale
 * (a = American, b = British), second is the gender.
 */
const KNOWN_VOICES = [
    { id: 'af_heart', name: 'Heart (US female)', lang: 'en-US', tags: ['f', 'warm'] },
    { id: 'af_bella', name: 'Bella (US female)', lang: 'en-US', tags: ['f', 'bright'] },
    { id: 'af_nicole', name: 'Nicole (US female)', lang: 'en-US', tags: ['f', 'soft'] },
    { id: 'af_sarah', name: 'Sarah (US female)', lang: 'en-US', tags: ['f'] },
    { id: 'am_michael', name: 'Michael (US male)', lang: 'en-US', tags: ['m', 'warm'] },
    { id: 'am_adam', name: 'Adam (US male)', lang: 'en-US', tags: ['m'] },
    { id: 'am_fenrir', name: 'Fenrir (US male)', lang: 'en-US', tags: ['m', 'deep'] },
    { id: 'am_puck', name: 'Puck (US male)', lang: 'en-US', tags: ['m', 'bright'] },
    { id: 'bf_emma', name: 'Emma (UK female)', lang: 'en-GB', tags: ['f'] },
    { id: 'bf_isabella', name: 'Isabella (UK female)', lang: 'en-GB', tags: ['f'] },
    { id: 'bm_george', name: 'George (UK male)', lang: 'en-GB', tags: ['m', 'narrator'] },
    { id: 'bm_fable', name: 'Fable (UK male)', lang: 'en-GB', tags: ['m', 'narrator'] },
];

export class KokoroProvider {
    constructor({
        moduleUrl = DEFAULT_MODULE_URL, module = null, model = DEFAULT_MODEL,
        dtype = 'q8', device = null, decode, sampleRate = 48000,
        onProgress = null, id = 'kokoro', label = 'Kokoro 82M',
        /**
         * `eager: false` is the default and it is load-bearing.
         *
         * `available()` must never throw and must be cheap -- the registry
         * calls it to build the fallback ladder. If availability meant
         * "download 86 MB and see", then merely HAVING this provider
         * registered would cost every render the download whether or not any
         * line was cast on it. So availability is a capability question
         * (is there a WebAssembly runtime and a fetch?) and the model loads
         * on the first line that actually asks for it.
         */
        eager = false,
    } = {}) {
        this.id = id;
        this.label = label;
        this.source = 'tts';
        this.moduleUrl = moduleUrl;
        this.model = model;
        this.dtype = dtype;
        this.device = device;
        this.decode = decode;
        this.sampleRate = sampleRate;
        this.onProgress = onProgress;
        this._module = module;
        this._tts = null;
        this._loading = null;
        this._voices = null;
        this.eager = eager;
        this.lastError = null;
    }

    async available() {
        try {
            if (this._tts) return true;
            if (typeof fetch === 'undefined' || typeof WebAssembly === 'undefined') return false;
            if (!this.eager) return true;
            await this._load();
            return !!this._tts;
        } catch (e) {
            this.lastError = e;
            return false;
        }
    }

    /** Single-flight: several lines synthesizing at once share one load. */
    async _load() {
        if (this._tts) return this._tts;
        if (this._loading) return this._loading;
        this._loading = (async () => {
            const mod = this._module ?? await import(/* @vite-ignore */ this.moduleUrl);
            const KokoroTTS = mod.KokoroTTS ?? mod.default?.KokoroTTS ?? mod.default;
            if (!KokoroTTS?.from_pretrained) {
                throw new Error('KokoroProvider: the module exports no KokoroTTS.from_pretrained');
            }
            this._tts = await KokoroTTS.from_pretrained(this.model, {
                dtype: this.dtype,
                ...(this.device ? { device: this.device } : {}),
                ...(this.onProgress ? { progress_callback: this.onProgress } : {}),
            });
            return this._tts;
        })();
        try {
            return await this._loading;
        } finally {
            this._loading = null;
        }
    }

    async listVoices() {
        if (this._voices) return this._voices;
        let listed = null;
        try {
            // Only ask the model if it is ALREADY loaded. Listing must not
            // trigger a download: see `eager` above.
            if (this._tts?.list_voices) listed = this._tts.list_voices();
        } catch { listed = null; }
        const entries = listed && typeof listed === 'object'
            ? Object.entries(listed).map(([id, v]) => ({
                id,
                name: v?.name ?? id,
                lang: v?.language === 'en-gb' ? 'en-GB' : 'en-US',
                tags: [v?.gender === 'Male' ? 'm' : v?.gender === 'Female' ? 'f' : 'n'],
            }))
            : KNOWN_VOICES;
        this._voices = entries.map((v) => createVoice({
            ...v, source: 'tts', provider: this.id }));
        return this._voices;
    }

    async synthesize({ text, voice }) {
        if (!text) return null;
        const tts = await this._load();
        const out = await tts.generate(String(text), { voice: voice?.id ?? 'af_heart' });
        /**
         * Kokoro hands back a `RawAudio`: a Float32Array plus its rate.
         *
         * The engine's mixer works in AudioBuffers at one rate, so this has
         * to become one. Encoding to WAV and handing it to `decode` is the
         * cheap route and it reuses the one resampler the pipeline already
         * trusts -- writing a second resampler here would be a second place
         * for a half-sample offset to live, and lipsync is derived from these
         * samples.
         */
        const samples = out?.audio ?? out?.data ?? out;
        const rate = out?.sampling_rate ?? out?.sampleRate ?? 24000;
        if (!samples?.length) return null;
        return {
            audioBuffer: await this.decode(encodeWavMono(samples, rate), rate),
            // Kokoro's plain build returns no timings. The `-timestamped`
            // model variant does, and when one is configured the result
            // carries them, so lipsync upgrades from the estimated tier to
            // the exact one with no change anywhere else.
            phonemes: out?.phonemes ?? out?.timestamps ?? null,
        };
    }
}

/**
 * Float samples to a 16-bit PCM WAV, little-endian.
 *
 * Here rather than in `audio/wav.js` because that module writes a mix for
 * output and this is one take on its way in; they differ in that this one
 * clamps per sample against the float range the model emits, which can
 * exceed 1.0 on a plosive and wraps rather than clips if written straight.
 */
function encodeWavMono(samples, rate) {
    const n = samples.length;
    const buffer = new ArrayBuffer(44 + n * 2);
    const view = new DataView(buffer);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); view.setUint32(4, 36 + n * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    str(36, 'data'); view.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) {
        const v = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
    }
    return buffer;
}

export { KNOWN_VOICES as KOKORO_VOICES, DEFAULT_MODEL as KOKORO_MODEL };
