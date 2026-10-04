import { createVoice } from '../VoiceRegistry.js';

/**
 * Open-source TTS running entirely in the browser: Piper/VITS voices via
 * onnxruntime-web, from the rhasspy/piper-voices collection on HuggingFace.
 *
 * This is the "AI voices from online open repositories" path, and it is the
 * one that makes a single prompt produce a fully voiced film. Properties that
 * matter here:
 *   - 117 voices across 36 languages, permissively licensed.
 *   - inference runs in a worker, so it does not block the render loop.
 *   - models are cached in OPFS after first fetch, so the PWA still works
 *     offline once a voice has been downloaded.
 *
 * The module is loaded lazily from a PINNED url and may also be injected, so
 * nothing here is a hard dependency: if it cannot load, `available()` returns
 * false and the voice falls back down the ladder to uploaded or recorded audio.
 *
 * Returns no phoneme timings, so lipsync uses the text tier -- which is the
 * primary tier regardless, since the dialogue text is always available.
 */
const DEFAULT_MODULE_URL = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web@1.0.3/dist/vits-web.js';

export class TtsVitsProvider {
    constructor({ moduleUrl = DEFAULT_MODULE_URL, module = null, decode, sampleRate = 48000,
                  defaultVoiceId = 'en_US-amy-medium', onProgress = null } = {}) {
        this.id = 'tts';
        this.label = 'Open-source TTS voices (Piper/VITS)';
        this.source = 'tts';
        this.moduleUrl = moduleUrl;
        this._module = module;
        this.decode = decode;
        this.sampleRate = sampleRate;
        this.defaultVoiceId = defaultVoiceId;
        this.onProgress = onProgress;
        this._cache = new Map();          // `${voiceId}\0${text}` -> AudioBuffer
        this._catalog = null;
    }

    async load() {
        if (this._module) return this._module;
        this._module = await import(/* @vite-ignore */ this.moduleUrl);
        return this._module;
    }

    async available() {
        if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') return false;
        try { await this.load(); return true; } catch { return false; }
    }

    /**
     * Voices already downloaded to OPFS are listed first: picking one of
     * those costs nothing, while a fresh voice costs a 20-60MB fetch.
     */
    async listVoices() {
        const mod = await this.load();
        if (!this._catalog) {
            const all = await mod.voices().catch(() => []);
            let stored = [];
            try { stored = await mod.stored(); } catch { /* opfs unavailable */ }
            const storedSet = new Set(stored);
            this._catalog = all
                .map((v) => createVoice({
                    id: v.key,
                    name: `${v.name} (${v.language?.name_english ?? v.language?.code ?? '??'}, ${v.quality})`,
                    source: 'tts',
                    provider: 'tts',
                    lang: v.language?.code ?? 'en_US',
                    tags: [v.quality, ...(storedSet.has(v.key) ? ['downloaded'] : [])],
                }))
                .sort((a, b) => Number(b.tags.includes('downloaded')) - Number(a.tags.includes('downloaded')));
        }
        return this._catalog;
    }

    /** Pre-fetch a voice so a later render does not stall on the download. */
    async prefetch(voiceId) {
        const mod = await this.load();
        return mod.download(voiceId, this.onProgress ?? undefined);
    }

    async synthesize({ text, voice }) {
        if (!text) return null;
        const voiceId = voice?.id ?? this.defaultVoiceId;
        const cacheKey = `${voiceId}\u0000${text}`;
        if (this._cache.has(cacheKey)) {
            return { audioBuffer: this._cache.get(cacheKey), phonemes: null };
        }
        const mod = await this.load();
        const wav = await mod.predict({ text, voiceId }, this.onProgress ?? undefined);
        const audioBuffer = await this.decode(wav);
        this._cache.set(cacheKey, audioBuffer);
        return { audioBuffer, phonemes: null };
    }
}
