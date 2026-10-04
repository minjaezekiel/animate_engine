/**
 * The voice system's single abstraction.
 *
 * A voice is a provider-backed source of speech for a named character. The
 * same film renders with any mix of sources -- the user's own recorded voice,
 * uploaded files from different voice actors, or synthesized speech -- because
 * every provider satisfies one interface:
 *
 *   id, label
 *   available() -> bool            capability probe; must never throw
 *   listVoices() -> Voice[]
 *   synthesize({text, voice, lang}) -> { audioBuffer, phonemes? }
 *
 * `phonemes` is optional and it is the payoff: a provider that returns
 * timings gets exact lipsync instead of estimated.
 */

export function createVoice({ id, name = id, source, provider, lang = 'en', tags = [], ref = null }) {
    return { id, name, source, provider, lang, tags, ref };
}

export class VoiceRegistry {
    constructor() {
        this.providers = new Map();
    }

    register(provider) {
        if (!provider?.id) throw new Error('VoiceRegistry: provider needs an id');
        this.providers.set(provider.id, provider);
        return this;
    }

    get(providerId) { return this.providers.get(providerId); }

    /** Providers that report themselves usable right now, in priority order. */
    async availableProviders() {
        const out = [];
        for (const p of this.providers.values()) {
            let ok = false;
            try { ok = await p.available(); } catch { ok = false; }
            if (ok) out.push(p);
        }
        return out;
    }

    async listVoices() {
        const out = [];
        for (const p of await this.availableProviders()) {
            try { out.push(...await p.listVoices()); } catch { /* skip a sulking provider */ }
        }
        return out;
    }

    /**
     * Resolve a voice spec of the form "<providerId>:<voiceId>", e.g.
     * "piper:en_US-amy-medium", "mic:myvoice", "upload:actor_jane".
     */
    async resolve(spec) {
        if (!spec) return null;
        const i = String(spec).indexOf(':');
        const providerId = i < 0 ? spec : spec.slice(0, i);
        const voiceId = i < 0 ? null : spec.slice(i + 1);
        const provider = this.providers.get(providerId);
        if (!provider) return null;
        if (!voiceId) {
            const list = await provider.listVoices();
            return list[0] ?? null;
        }
        const list = await provider.listVoices();
        return list.find((v) => v.id === voiceId)
            ?? createVoice({ id: voiceId, source: provider.source ?? 'tts', provider: providerId });
    }

    /**
     * Synthesize through whichever provider owns the voice. Falls back down
     * the provider list if the preferred one is unavailable, so a film
     * authored against TTS still renders on a machine without it.
     */
    async synthesize(spec, { text, lang } = {}) {
        const voice = await this.resolve(spec);
        if (voice) {
            const provider = this.providers.get(voice.provider);
            if (provider && await provider.available().catch(() => false)) {
                return provider.synthesize({ text, voice, lang: lang ?? voice.lang });
            }
        }
        for (const p of await this.availableProviders()) {
            const list = await p.listVoices().catch(() => []);
            if (list.length) return p.synthesize({ text, voice: list[0], lang });
        }
        return null;
    }
}
