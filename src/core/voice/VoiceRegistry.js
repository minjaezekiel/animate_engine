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

/**
 * How long a provider's liveness and voice list stay trusted.
 *
 * The number is a balance between two real costs. Too short and a render
 * re-probes a dead host once per line of dialogue; too long and an editor
 * where someone starts a voice server mid-session never notices. Thirty
 * seconds turns a 25-line film's 75 probes into two or three, and
 * `invalidate()` exists for the editor case so it does not have to wait.
 */
const DEFAULT_STATUS_TTL_MS = 30_000;

export class VoiceRegistry {
    /**
     * @param {object} [options]
     * @param {number} [options.statusTtlMs] 0 disables caching, for tests.
     * @param {() => number} [options.now] injectable clock, for tests.
     */
    constructor({ statusTtlMs = DEFAULT_STATUS_TTL_MS, now = () => Date.now() } = {}) {
        this.providers = new Map();
        this.statusTtlMs = statusTtlMs;
        this._now = now;
        /**
         * Per-provider memos for `available()` and `listVoices()`.
         *
         * These cache FAILURE as well as success, which is the whole point.
         * Providers cache their own successful listings already; none of them
         * caches a refusal, so before this a provider that was down was asked
         * again for every line -- measured at 3 network attempts per line, 75
         * for one film. Against a closed port that is instant; against a host
         * that HANGS rather than refusing -- a dropping firewall, or an app
         * still starting -- each one waits out the provider's timeout, and
         * the render never finishes.
         */
        this._status = new Map();
        this._voices = new Map();
        this._notes = [];
    }

    register(provider) {
        if (!provider?.id) throw new Error('VoiceRegistry: provider needs an id');
        this.providers.set(provider.id, provider);
        this.invalidate(provider.id);
        return this;
    }

    get(providerId) { return this.providers.get(providerId); }

    /**
     * Forget what we know about a provider, so the next call asks again.
     * Call it when the user says they have just started a voice server.
     */
    invalidate(providerId = null) {
        if (providerId == null) {
            this._status.clear();
            this._voices.clear();
            this._notes.length = 0;
            return this;
        }
        this._status.delete(providerId);
        this._voices.delete(providerId);
        return this;
    }

    /**
     * Run `fn` at most once per TTL per key, and let concurrent callers share
     * the one in-flight attempt.
     *
     * The single-flight part matters as much as the caching: without it,
     * synthesising several lines in parallel stampedes a dead host with one
     * simultaneous connection each, which the TTL alone would not prevent
     * because none of them has settled yet.
     *
     * A rejection is recorded and reported as `null`. Callers distinguish
     * "nothing there" from "it threw" through `diagnostics()`, not through an
     * exception, because every caller of this is on a fallback path where
     * throwing is the wrong answer.
     */
    async _once(map, key, fn) {
        const hit = map.get(key);
        if (hit) {
            if (!hit.settled) return hit.promise;
            if (this.statusTtlMs > 0 && this._now() - hit.at < this.statusTtlMs) {
                return hit.value;
            }
        }
        const entry = { settled: false, at: this._now(), value: null, error: null };
        entry.promise = (async () => {
            try {
                entry.value = await fn();
            } catch (err) {
                entry.error = err;
                entry.value = null;
            }
            entry.settled = true;
            entry.at = this._now();
            return entry.value;
        })();
        map.set(key, entry);
        return entry.promise;
    }

    /** Is this provider usable? Memoized, single-flight, never throws. */
    async isAvailable(provider) {
        const ok = await this._once(this._status, provider.id, async () => {
            const v = await provider.available();
            return v === true;
        });
        if (ok !== true) this._note(provider, this._status.get(provider.id)?.error, 'unavailable');
        return ok === true;
    }

    /** This provider's voices, or null if it could not say. Memoized. */
    async voicesOf(provider) {
        const list = await this._once(this._voices, provider.id,
                                      () => provider.listVoices());
        if (!Array.isArray(list)) {
            this._note(provider, this._voices.get(provider.id)?.error, 'could not list its voices');
            return null;
        }
        return list;
    }

    /**
     * Record WHY a provider was skipped, once per provider per reason.
     *
     * Swallowing the error outright was the first version of the fallback
     * fix, and it is the defect class this codebase keeps finding: the render
     * worked, the voice was quietly someone else's, and nothing said so. A
     * fallback the author cannot see is a fallback they cannot fix.
     */
    _note(provider, error, what) {
        const key = `${provider.id}:${what}`;
        if (this._notes.some((n) => n.key === key)) return;
        this._notes.push({
            key,
            severity: 'info',
            path: `voices.${provider.id}`,
            message: `Voice provider "${provider.id}" ${what}`
                + (error ? `: ${error.message}` : '')
                + '. Falling back to the next provider.',
        });
    }

    /** Everything that was skipped, and why. Safe to call at any time. */
    diagnostics() {
        return this._notes.map(({ key, ...d }) => d);
    }

    /** Providers that report themselves usable right now, in priority order. */
    async availableProviders() {
        const out = [];
        for (const p of this.providers.values()) {
            if (await this.isAvailable(p)) out.push(p);
        }
        return out;
    }

    async listVoices() {
        const out = [];
        for (const p of await this.availableProviders()) {
            out.push(...(await this.voicesOf(p) ?? []));
        }
        return out;
    }

    /**
     * Resolve a voice spec of the form "<providerId>:<voiceId>", e.g.
     * "piper:en_US-amy-medium", "mic:myvoice", "voicestudio:nuru-clone".
     */
    async resolve(spec) {
        if (!spec) return null;
        const i = String(spec).indexOf(':');
        const providerId = i < 0 ? spec : spec.slice(0, i);
        const voiceId = i < 0 ? null : spec.slice(i + 1);
        const provider = this.providers.get(providerId);
        if (!provider) return null;
        const named = () => createVoice({
            id: voiceId, source: provider.source ?? 'tts', provider: providerId });
        // A provider that cannot list its voices must not take the whole
        // ladder down with it. The point of the ladder is that a film cast
        // against a voice source that is absent still renders from whatever
        // is present, and an unguarded `listVoices()` here defeated that.
        const list = await this.voicesOf(provider);
        if (!list) {
            // Still NAME the voice, so `synthesize` tries this provider and
            // falls through on its own terms, rather than silently handing
            // the line to someone else's voice here.
            return voiceId ? named() : null;
        }
        if (!voiceId) return list[0] ?? null;
        return list.find((v) => v.id === voiceId) ?? named();
    }

    /**
     * Record that a line was spoken by someone other than who was cast.
     *
     * Separate from `_note`, and a WARNING rather than info, because the two
     * say different things. `_note` says a provider was skipped, which for an
     * optional provider is expected. This says a specific line came out in
     * the wrong voice, which is never expected -- it is the exact failure
     * 29-VOICE-STUDIO.md names: "the render worked, the voice was quietly
     * someone else's, and nothing said so".
     *
     * Once per (requested -> actual) pair, so a 200-line film cast against a
     * studio that is not running emits one warning and not two hundred.
     */
    _noteSubstitution(requested, actual) {
        const key = `sub:${requested}->${actual ?? 'nothing'}`;
        if (this._notes.some((n) => n.key === key)) return;
        this._notes.push({
            key,
            severity: 'warning',
            path: `voices.${String(requested).split(':')[0]}`,
            message: actual
                ? `Cast as "${requested}" but spoken by "${actual}". The voice you `
                    + 'authored is not available, so the line is in a substitute voice. '
                    + 'Pass `allowFallback: false` to render silent instead of wrong.'
                : `Cast as "${requested}", which is unavailable, and fallback is off. `
                    + 'Rendering silent rather than in the wrong voice.',
        });
    }

    /**
     * Synthesize through whichever provider owns the voice. Falls back down
     * the provider list if the preferred one is unavailable, so a film
     * authored against TTS still renders on a machine without it.
     *
     * The fallback is now SAID OUT LOUD. It was silent, and a film cast
     * against a local VoiceStudio that happened not to be running rendered
     * end to end in a Piper voice with nothing anywhere reporting it -- which
     * for a twelve-film bilingual series is twelve films in the wrong voice,
     * discovered on watching them.
     *
     * @param {object} [opts]
     * @param {boolean} [opts.allowFallback] false renders the line SILENT
     *   rather than in a substitute voice. For a series cast against specific
     *   human voices, silence is a bug you fix; a stand-in is one you ship.
     */
    async synthesize(spec, { text, lang, allowFallback = true } = {}) {
        const voice = await this.resolve(spec);
        if (voice) {
            const provider = this.providers.get(voice.provider);
            if (provider && await this.isAvailable(provider)) {
                const out = await provider.synthesize({ text, voice, lang: lang ?? voice.lang });
                // Only a real result counts as "the cast voice spoke". A
                // provider returning null here still has to fall through.
                if (out?.audioBuffer) return { ...out, voice, substituted: null };
            }
        }
        // Everything past this point is a SUBSTITUTE for what was authored.
        if (!allowFallback) {
            if (spec) this._noteSubstitution(spec, null);
            return null;
        }
        for (const p of await this.availableProviders()) {
            const list = await this.voicesOf(p);
            if (!list?.length) continue;
            const stand = list[0];
            const out = await p.synthesize({ text, voice: stand, lang });
            if (!out) continue;
            const actual = `${p.id}:${stand.id}`;
            // A spec that resolved to this very provider and voice is not a
            // substitution -- it is the happy path arriving by the long road.
            if (spec && actual !== spec) this._noteSubstitution(spec, actual);
            return { ...out, voice: stand,
                     substituted: spec && actual !== spec ? { requested: spec, actual } : null };
        }
        return null;
    }
}
