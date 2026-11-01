import { createVoice } from '../VoiceRegistry.js';

/**
 * Speech from a locally-running VoiceStudio, including CLONED voices.
 *
 * VoiceStudio (github.com/debpalash/VoiceStudio) is an open-source, fully
 * local voice studio: cloning, voice design, dubbing, 646 languages. It runs
 * as its own application and exposes an HTTP API on loopback, which is the
 * whole reason this file can exist.
 *
 * ## Why it matters here
 *
 * The Piper catalogue has exactly ONE Swahili voice -- 1 of 119, checked
 * against its own path map. `core/audio/delivery.js` exists because of that:
 * it separates characters by rate and pitch because it cannot separate them
 * by timbre. A cloning engine removes the constraint at the source. Record
 * yourself, or a few people who agreed to it, and a Swahili cast is a cast
 * of real human voices rather than one model wearing three hats.
 *
 * ## Licensing -- read this before changing anything here
 *
 * VoiceStudio is **AGPL-3.0**. This engine is MIT. Those are compatible ONLY
 * because of how this file is written:
 *
 *   - It is a CLIENT. It talks to a separate program, which the user installs
 *     and runs themselves, over HTTP. Separate programs communicating at
 *     arm's length over a protocol are not one combined work.
 *   - Nothing from VoiceStudio is vendored, bundled, copied or linked. That
 *     is deliberate and it is the opposite of what `scripts/vendor-voice.mjs`
 *     does with Piper, which is MIT-compatible and therefore safe to copy.
 *   - AGPL section 13 obliges whoever OPERATES a modified VoiceStudio over a
 *     network to offer its source. A user running it on their own machine for
 *     themselves distributes nothing and triggers nothing.
 *
 * If anyone ever wants to ship VoiceStudio inside this project, that is a
 * different decision with different consequences, and this comment is not
 * permission for it.
 *
 * Separately: the audio it produces is governed by the licence of whichever
 * MODEL made it, not by AGPL. VoiceStudio says so itself. Anyone publishing
 * or monetising the output needs to check the model, not just the app.
 *
 * ## Consent
 *
 * Cloning a voice that is not yours, without the person's agreement, is not
 * something this engine should help with. There is no technical lock here --
 * one would be trivially bypassed and would only inconvenience honest use --
 * but `probe()` says so, the docs say so, and that is deliberate.
 *
 * ## What is verified and what is assumed
 *
 * Verified from the project's own documentation:
 *   - the backend is on `http://localhost:3900`
 *   - loopback traffic is never authenticated ("no key, no PIN, no header")
 *   - `GET /v1/audio/voices` lists voices
 *   - the HTTP surface is described as OpenAI-compatible
 *
 * Assumed, because it follows from "OpenAI-compatible" and could not be
 * confirmed against a running instance: synthesis is `POST /v1/audio/speech`
 * taking `{model, input, voice, response_format}` and returning raw audio.
 * Every one of those names is an option below, so a mismatch is one line of
 * configuration rather than a rewrite -- and `probe()` reports exactly what
 * it found, so the mismatch is visible instead of silent.
 */
const DEFAULT_BASE = 'http://127.0.0.1:3900';

export class VoiceStudioProvider {
    constructor({
        baseUrl = DEFAULT_BASE,
        decode,
        sampleRate = 48000,
        model = 'voicestudio',
        format = 'wav',
        // Paths and field names, configurable because they are the part that
        // was inferred rather than read.
        voicesPath = '/v1/audio/voices',
        speechPath = '/v1/audio/speech',
        wellKnownPath = '/.well-known/voicestudio-speech',
        fields = { model: 'model', text: 'input', voice: 'voice', format: 'response_format' },
        fetchImpl = null,
        timeoutMs = 120_000,
        // A liveness check that can take two minutes is not a liveness check.
        // Synthesis of a long line legitimately takes a while; deciding
        // whether anything is listening must not, or a dead host stalls the
        // render instead of being skipped.
        probeTimeoutMs = 3_000,
        headers = {},
    } = {}) {
        this.id = 'voicestudio';
        this.label = 'VoiceStudio (local, supports cloned voices)';
        this.source = 'tts';
        this.baseUrl = String(baseUrl).replace(/\/+$/, '');
        this.decode = decode;
        this.sampleRate = sampleRate;
        this.model = model;
        this.format = format;
        this.voicesPath = voicesPath;
        this.speechPath = speechPath;
        this.wellKnownPath = wellKnownPath;
        this.fields = fields;
        this.headers = headers;
        this.timeoutMs = timeoutMs;
        this.probeTimeoutMs = probeTimeoutMs;
        this._fetch = fetchImpl ?? ((...a) => globalThis.fetch(...a));
        this._cache = new Map();          // `${voiceId}\0${text}` -> AudioBuffer
        this._catalog = null;
    }

    _url(path) { return `${this.baseUrl}${path}`; }

    async _json(path, init, timeoutMs = this.timeoutMs) {
        const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : null;
        try {
            const res = await this._fetch(this._url(path), {
                ...init,
                headers: { ...this.headers, ...(init?.headers ?? {}) },
                ...(ctl ? { signal: ctl.signal } : {}),
            });
            if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
            return res;
        } finally { if (timer) clearTimeout(timer); }
    }

    /**
     * Never throws, per the provider contract. A studio that is not running
     * is the normal case, not an error -- the ladder falls through to Piper.
     */
    async available() {
        if (typeof this._fetch !== 'function') return false;
        try {
            await this._json(this.voicesPath, { method: 'GET' }, this.probeTimeoutMs);
            return true;
        } catch { return false; }
    }

    /**
     * What is actually there, for a human to read. Separate from
     * `available()` because "it is not running" and "it is running but the
     * paths moved" are different problems and must not look the same.
     */
    async probe() {
        const out = { baseUrl: this.baseUrl, reachable: false, voices: 0,
                      cloned: 0, languages: [], notes: [] };
        try {
            const res = await this._json(this.wellKnownPath, { method: 'GET' },
                                         this.probeTimeoutMs);
            out.capabilities = await res.json().catch(() => null);
        } catch { out.notes.push(`no ${this.wellKnownPath} (not fatal)`); }
        try {
            const voices = await this.listVoices();
            out.reachable = true;
            out.voices = voices.length;
            out.cloned = voices.filter((v) => v.tags.includes('cloned')).length;
            out.languages = [...new Set(voices.map((v) => v.lang))].sort();
        } catch (err) {
            out.notes.push(`${this.voicesPath} failed: ${err.message}`);
            return out;
        }
        out.notes.push('Clone only your own voice, or one whose owner agreed to it.');
        out.notes.push('Output is licensed by the MODEL that made it, not by the app.');
        return out;
    }

    /**
     * Normalise whatever shape the listing comes back in.
     *
     * OpenAI-compatible servers disagree about this: some return a bare
     * array, some `{data: [...]}`, some `{voices: [...]}`. All three are
     * handled rather than one being guessed at.
     */
    async listVoices() {
        if (this._catalog) return this._catalog;
        const res = await this._json(this.voicesPath, { method: 'GET' });
        const body = await res.json();
        const raw = Array.isArray(body) ? body
            : Array.isArray(body?.data) ? body.data
            : Array.isArray(body?.voices) ? body.voices
            : [];
        this._catalog = raw.map((v) => {
            const id = v.id ?? v.voice_id ?? v.name ?? String(v);
            const lang = v.language ?? v.lang ?? v.locale ?? 'en';
            const cloned = Boolean(v.cloned ?? v.is_clone ?? v.type === 'cloned'
                ?? v.category === 'cloned');
            return createVoice({
                id,
                name: v.display_name ?? v.name ?? id,
                source: 'tts',
                provider: 'voicestudio',
                lang: String(lang).replace('_', '-'),
                tags: [...(cloned ? ['cloned'] : []), ...(v.tags ?? [])],
                ref: v,
            });
        });
        return this._catalog;
    }

    async synthesize({ text, voice }) {
        if (!text) return null;
        const voiceId = voice?.id ?? null;
        if (!voiceId) throw new Error('VoiceStudio: no voice selected');
        const key = `${voiceId}\u0000${text}`;
        if (this._cache.has(key)) return { audioBuffer: this._cache.get(key), phonemes: null };

        const f = this.fields;
        const res = await this._json(this.speechPath, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                [f.model]: this.model,
                [f.text]: text,
                [f.voice]: voiceId,
                [f.format]: this.format,
            }),
        });
        const bytes = await res.arrayBuffer();
        if (!bytes || bytes.byteLength < 64) {
            throw new Error(`VoiceStudio returned ${bytes?.byteLength ?? 0} bytes for `
                + `"${String(text).slice(0, 40)}" -- too short to be speech`);
        }
        const audioBuffer = await this.decode(bytes);
        this._cache.set(key, audioBuffer);
        // No phoneme timings, so lipsync uses the text tier -- which is the
        // primary tier anyway, exactly as with Piper.
        return { audioBuffer, phonemes: null };
    }
}
