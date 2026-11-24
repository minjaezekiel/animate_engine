import { createVoice } from '../VoiceRegistry.js';

/**
 * OpenVoice V2, over HTTP, against a server the user runs.
 *
 * # Why this one is a server and Kokoro is not
 *
 * OpenVoice V2 is MIT-licensed and it is the only one of the two that clones:
 * you give it a reference recording and it speaks in that voice, with its own
 * control over rhythm, pause and intonation, across six languages. That is
 * exactly what [29-VOICE-STUDIO.md](../../../../docs/29-VOICE-STUDIO.md)
 * argues a series needs -- a named human voice rather than a preset.
 *
 * But it is PyTorch. There is no ONNX export of the tone-colour converter
 * that runs in a browser, and the base speaker model wants a GPU to be
 * pleasant. So this provider does not run the model; it talks to one. That
 * is not a workaround -- `TtsHttpProvider` has existed since the first voice
 * phase precisely as "the seam through which voice cloning arrives later
 * without the engine growing a vendor dependency", and this is that seam
 * being used for what it was built for.
 *
 * # Consent is not optional
 *
 * A cloner takes a reference clip. Clone your own voice, or one whose owner
 * agreed in a way you could show someone. The engine cannot check this and
 * does not pretend to; it is written here because it is the single most
 * consequential thing about the feature.
 *
 * # The protocol
 *
 * One POST. Deliberately small, so any wrapper satisfies it -- the official
 * `openvoice_server` community images, a FastAPI file somebody writes in an
 * afternoon, or a shared box on a LAN:
 *
 *   POST /tts   { text, voice, language, speed, reference }
 *     -> audio bytes (any container `decodeAudioData` reads), or
 *     -> { audio: <base64>, phonemes?: [...] }
 *
 *   GET  /voices -> [{ id, name, language }]  or  { voices: [...] }
 *
 * `/voices` failing is not fatal: the film's own `voices` block names what it
 * wants, and a provider that cannot enumerate still synthesizes. The registry
 * already handles that case -- see `resolve()`'s `named()` fallback.
 */
export class OpenVoiceProvider {
    constructor({
        baseUrl, decode, id = 'openvoice', label = 'OpenVoice V2',
        headers = {}, timeoutMs = 120_000,
        /** A default reference clip for voices that do not name their own. */
        reference = null,
        /** Server-side default; per-voice `speed` overrides it. */
        speed = 1,
    } = {}) {
        this.id = id;
        this.label = label;
        this.source = 'tts';
        this.baseUrl = baseUrl ? String(baseUrl).replace(/\/+$/, '') : null;
        this.decode = decode;
        this.headers = headers;
        this.timeoutMs = timeoutMs;
        this.reference = reference;
        this.speed = speed;
        this._voices = null;
        this.lastError = null;
    }

    /**
     * Is there a server there?
     *
     * A HEAD on the base URL, with a short timeout of its own. The registry
     * caches this for thirty seconds and single-flights it, which is what
     * stops a 25-line film making 75 probes at a host that is not running --
     * and more importantly stops it waiting out the timeout 75 times against
     * a host that DROPS rather than refuses.
     */
    async available() {
        if (!this.baseUrl || typeof fetch === 'undefined') return false;
        try {
            const res = await fetch(`${this.baseUrl}/voices`, {
                method: 'GET', headers: this.headers,
                signal: AbortSignal.timeout(2500),
            });
            return res.ok;
        } catch (e) {
            this.lastError = e;
            return false;
        }
    }

    async listVoices() {
        if (this._voices) return this._voices;
        try {
            const res = await fetch(`${this.baseUrl}/voices`, {
                headers: this.headers, signal: AbortSignal.timeout(5000) });
            if (!res.ok) return null;
            const body = await res.json();
            const list = Array.isArray(body) ? body : body.voices ?? [];
            this._voices = list.map((v) => createVoice({
                id: v.id ?? v.name,
                name: v.name ?? v.id,
                lang: v.language ?? v.lang ?? 'en',
                tags: v.tags ?? [],
                ref: v.reference ?? null,
                source: 'tts',
                provider: this.id,
            }));
            return this._voices;
        } catch (e) {
            this.lastError = e;
            return null;
        }
    }

    async synthesize({ text, voice, lang }) {
        if (!text || !this.baseUrl) return null;
        const res = await fetch(`${this.baseUrl}/tts`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...this.headers },
            body: JSON.stringify({
                text: String(text),
                voice: voice?.id ?? null,
                language: lang ?? voice?.lang ?? 'en',
                speed: voice?.speed ?? this.speed,
                reference: voice?.ref ?? this.reference,
            }),
            signal: AbortSignal.timeout(this.timeoutMs),
        });
        if (!res.ok) {
            // Thrown, not swallowed: `synthesizeDialogue` catches per line and
            // reports it, and the registry's ladder then substitutes. A
            // silent null here would look like "this voice has nothing to
            // say" rather than "the server said 500".
            throw new Error(`OpenVoiceProvider: ${res.status} ${res.statusText}`);
        }
        const type = res.headers.get('content-type') ?? '';
        if (type.includes('application/json')) {
            const body = await res.json();
            if (!body.audio) return null;
            const bytes = Uint8Array.from(atob(body.audio), (c) => c.charCodeAt(0));
            return {
                audioBuffer: await this.decode(bytes.buffer),
                // OpenVoice's base speaker is a VITS variant and can emit
                // alignments. A server that passes them through upgrades
                // lipsync from estimated to exact for free.
                phonemes: body.phonemes ?? body.alignments ?? null,
            };
        }
        return { audioBuffer: await this.decode(await res.arrayBuffer()), phonemes: null };
    }
}
