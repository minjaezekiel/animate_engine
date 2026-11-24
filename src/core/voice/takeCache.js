/**
 * A take cache: synthesize a line once, ever.
 *
 * # The problem this is actually for
 *
 * Kokoro 82M and OpenVoice V2 have been registered, selectable and tested
 * since Phase 39 and **no film has ever been rendered through either**. Not
 * because the gateway is wrong -- it is the right abstraction -- but because
 * of where the models live. Kokoro fetches ~86 MB from a CDN, and a headless
 * render launches a FRESH Chrome profile, so the browser cache is empty every
 * single run: the download is paid per render rather than once. OpenVoice
 * needs a server you start, and a film that cannot render without one is a
 * film welded to a machine.
 *
 * The obvious reading of "load the model once and then render" is to
 * synthesize per frame. That cannot work here, and the reason is a property
 * worth protecting rather than a limitation:
 *
 *   The film RETIMES to the audio. `retimeToAudio` grows each shot to fit its
 *   real take, so every line must exist in full before frame 0 is drawn --
 *   otherwise the timeline depends on the render and frame N stops being a
 *   pure function of N.
 *
 * So the answer is stronger than the one asked for: **never synthesize during
 * a render at all.** Bake each take once, key it by its content, and let
 * every later render read bytes. That is also strictly faster than per-frame
 * synthesis, and it removes the model from the render process entirely --
 * which matters because a model loaded there competes with the renderer for
 * the same GPU and the same memory, the contention that already forced
 * `scripts/lib/render-lock.mjs` into existence.
 *
 * # Why it is content-addressed
 *
 * The key is everything that can change the samples: the voice spec, the
 * text, the delivery and the language. So editing one line of narration
 * re-synthesizes one line; re-rendering at a different resolution
 * re-synthesizes nothing; and a second render of the same film touches no
 * model and makes no network request.
 *
 * `synthesize.js` has claimed in its own docstring since the first voice
 * phase that "synthesis is cached by (voice, text)". It was not: `assetId`
 * was computed AFTER synthesis and only ever used to label the buffer, so two
 * identical lines in one film were synthesized twice and nothing was kept
 * between runs. This is that docstring becoming true.
 *
 * # Why a miss reads its own write back
 *
 * A cold render would otherwise differ from a warm one. The model emits
 * Float32; the cache stores 16-bit PCM. If a miss used the float samples and
 * a hit used the decoded WAV, run 1 and run 2 of the same film would produce
 * different audio -- quietly, at about -90 dBFS, which is exactly the kind of
 * difference that is impossible to attribute later. So a miss writes the WAV
 * and then DECODES IT BACK, and every run agrees.
 *
 * # Why an entry is not just samples
 *
 * Piper returns exact phoneme timings, and lipsync has three tiers: exact
 * from timings, estimated from the text gated by the audio envelope, and an
 * amplitude floor beneath that. A cache storing only the WAV would hand back
 * a take with no timings, so the FIRST render of a film would lipsync off
 * phonemes and every later one off the envelope -- a quality regression
 * triggered by nothing but running twice, and invisible in every number the
 * engine reports. So an entry is `{ audioBuffer, phonemes }`, and the timings
 * travel with the samples in a `.json` beside the `.wav`.
 */

/**
 * The identity of a take, as a canonical string.
 *
 * Pure, and deliberately not hashed here: core decides what makes two takes
 * the same, and the cache decides how to store that. A 32-bit `hashString`
 * is fine for labelling a buffer in memory and not fine for a directory that
 * grows across every film in a project.
 */
export function takeKeyOf({ voiceSpec, text, delivery = null, lang = null } = {}) {
    return [
        String(voiceSpec ?? ''),
        String(lang ?? ''),
        String(delivery?.rate ?? 1),
        String(delivery?.pitch ?? 1),
        // Last, and unescaped: text is the only field that can contain a
        // separator, so putting it at the end means no escaping is needed for
        // the join to be unambiguous.
        String(text ?? ''),
    ].join('\u0000');
}

/** A cache that forgets: the shape, for tests and for a page with no server. */
export function createMemoryTakeCache() {
    const store = new Map();
    let hits = 0;
    let misses = 0;
    return {
        name: 'memory',
        async get(key) {
            const v = store.get(key);
            if (v) { hits++; return v; }
            misses++;
            return null;
        },
        async put(key, entry) { store.set(key, entry); return entry; },
        stats: () => ({ hits, misses, stored: store.size, failed: 0 }),
    };
}

/**
 * A cache over HTTP, against the dev server every render already runs.
 *
 * The browser is where synthesis happens -- providers are browser-side -- and
 * the disk is Node's. Rather than move either, the page asks the server it is
 * already being served from:
 *
 *   GET  /__take/<digest>.wav   -> 200 with the bytes, or 404
 *   PUT  /__take/<digest>.wav   -> stores them
 *
 * Which means the cache works identically for the 2D and 3D paths, for a
 * person clicking render in a tab and for an agent driving the headless
 * script, with no second transport.
 *
 * Every dependency is injected: `fetchImpl`, `digest`, `decode` and
 * `encodeWav`. That is what makes this file assertable in Node with no
 * browser, no server and no audio context.
 */
export function createHttpTakeCache({
    baseUrl = '', fetchImpl = null, digest, decode, encodeWav,
    report = null, prefix = '__take',
} = {}) {
    const f = fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : null);
    if (!f) throw new Error('createHttpTakeCache: no fetch available');
    if (!digest) throw new Error('createHttpTakeCache: a digest function is required');
    let hits = 0;
    let misses = 0;
    let stored = 0;
    let failed = 0;
    const urls = async (key) => {
        const d = await digest(key);
        return { wav: `${baseUrl}/${prefix}/${d}.wav`,
                 meta: `${baseUrl}/${prefix}/${d}.json` };
    };

    return {
        name: 'http',
        async get(key) {
            try {
                const u = await urls(key);
                const res = await f(u.wav);
                if (!res.ok) { misses++; return null; }
                const bytes = await res.arrayBuffer();
                // A body too short to hold a WAV header is a half-written
                // entry, not a take. Treat it as a miss so the next render
                // repairs it rather than rendering a line silent forever.
                if (!bytes || bytes.byteLength < 45) { misses++; return null; }
                // Timings are optional: a provider that returns none stores
                // no sidecar, so a 404 here is the normal case.
                let phonemes = null;
                try {
                    const m = await f(u.meta);
                    if (m.ok) phonemes = (await m.json())?.phonemes ?? null;
                } catch { phonemes = null; }
                hits++;
                return { audioBuffer: await decode(bytes), phonemes };
            } catch (e) {
                misses++;
                report?.(`[take] read failed, synthesizing: ${e.message}`);
                return null;
            }
        },
        /**
         * Store, then return what a later run would READ -- see the header.
         * If the write or the read-back fails, the freshly synthesized entry
         * is returned unchanged: a cache that cannot write must not be able
         * to break a render.
         */
        async put(key, entry) {
            try {
                const u = await urls(key);
                const wav = encodeWav(entry.audioBuffer);
                const res = await f(u.wav, {
                    method: 'PUT',
                    headers: { 'content-type': 'audio/wav' },
                    body: wav,
                });
                if (!res.ok) throw new Error(`PUT ${res.status}`);
                if (entry.phonemes) {
                    await f(u.meta, {
                        method: 'PUT',
                        headers: { 'content-type': 'application/json' },
                        body: JSON.stringify({ phonemes: entry.phonemes }),
                    }).catch(() => {});
                }
                stored++;
                return { audioBuffer: await decode(wav.slice(0)),
                         phonemes: entry.phonemes ?? null };
            } catch (e) {
                failed++;
                report?.(`[take] write failed, not cached: ${e.message}`);
                return entry;
            }
        },
        stats: () => ({ hits, misses, stored, failed }),
    };
}

/**
 * SHA-256 over a string, as hex, using the platform's own crypto.
 *
 * `crypto.subtle` needs a secure context, and `http://127.0.0.1` is one by
 * specification -- which is the origin every render in this repo is served
 * from, so this works in the headless scripts and in a tab alike. Where it is
 * absent the caller passes its own; `node:crypto` is the obvious one.
 */
export function webDigest(subtle = globalThis.crypto?.subtle) {
    if (!subtle) return null;
    const enc = new TextEncoder();
    return async (s) => {
        const buf = await subtle.digest('SHA-256', enc.encode(s));
        return [...new Uint8Array(buf)]
            .map((b) => b.toString(16).padStart(2, '0')).join('');
    };
}
