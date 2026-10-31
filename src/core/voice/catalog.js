/**
 * A casting catalogue: voices by ROLE, not by model id.
 *
 * `tts:en_GB-northern_english_male-medium` says nothing about who that is.
 * `elder-male-en` does, and it means a film can be cast before anyone has
 * decided which engine will speak it -- then recast in one line.
 *
 * Every id below is a real key in the Piper/VITS catalogue the engine already
 * ships (124 voices, 38 languages, verified against `mod.voices()` rather
 * than copied from a list). Swahili is `sw_CD-lanfrica-medium`, which works
 * today and was synthesised to check, not assumed.
 *
 * Levels are NOT baked in here. Voices differ by several dB -- the Swahili
 * voice measured 2.1x the British one on the same sentence -- and the fix is
 * `core/audio/loudness.js` measuring each take, which works for voices that
 * are not in this table. A `gain` here is an artistic trim, nothing else.
 */

/**
 * @typedef {object} VoicePreset
 * @property {string} spec   provider:voiceId
 * @property {string} lang   BCP-47-ish language tag
 * @property {'f'|'m'|'n'} voice
 * @property {string} role   what this voice is FOR
 * @property {number} [mb]   download size, because the first use pays it
 */

/** @type {Record<string, VoicePreset>} */
export const VOICE_PRESETS = {
    // --- English, British ------------------------------------------------
    'narrator-f-en': { spec: 'tts:en_GB-alba-medium', lang: 'en-GB', voice: 'f',
                       role: 'warm Scottish narrator; the default documentary voice', mb: 60 },
    'narrator-m-en': { spec: 'tts:en_GB-alan-medium', lang: 'en-GB', voice: 'm',
                       role: 'measured RP male; explainer and voice-over', mb: 60 },
    'elder-m-en':    { spec: 'tts:en_GB-northern_english_male-medium', lang: 'en-GB', voice: 'm',
                       role: 'older northern male; characterful, good for an old man', mb: 60 },
    'young-f-en':    { spec: 'tts:en_GB-jenny_dioco-medium', lang: 'en-GB', voice: 'f',
                       role: 'young female; a student or trainee asking questions', mb: 60 },
    'bright-f-en':   { spec: 'tts:en_GB-cori-high', lang: 'en-GB', voice: 'f',
                       role: 'bright, high quality; the most natural English here', mb: 109 },
    'soft-f-en':     { spec: 'tts:en_GB-southern_english_female-low', lang: 'en-GB', voice: 'f',
                       role: 'soft southern female; quieter, reflective lines', mb: 60 },

    // --- English, American -----------------------------------------------
    'narrator-f-us': { spec: 'tts:en_US-amy-medium', lang: 'en-US', voice: 'f',
                       role: 'neutral American female narrator', mb: 60 },
    'narrator-m-us': { spec: 'tts:en_US-joe-medium', lang: 'en-US', voice: 'm',
                       role: 'neutral American male narrator', mb: 60 },
    'warm-m-us':     { spec: 'tts:en_US-hfc_male-medium', lang: 'en-US', voice: 'm',
                       role: 'warm American male; conversational', mb: 60 },
    'warm-f-us':     { spec: 'tts:en_US-kristin-medium', lang: 'en-US', voice: 'f',
                       role: 'warm American female; conversational', mb: 61 },

    // --- Swahili ----------------------------------------------------------
    'narrator-sw':   { spec: 'tts:sw_CD-lanfrica-medium', lang: 'sw-CD', voice: 'n',
                       role: 'Swahili narration. The only Swahili voice in the Piper '
                           + 'catalogue, so a Swahili cast shares it and is separated by '
                           + 'pacing and pitch rather than by timbre', mb: 60 },
};

/** Preset ids for a language tag or prefix, e.g. 'en', 'en-GB', 'sw'. */
export function voicesFor(lang) {
    const want = String(lang ?? '').toLowerCase();
    return Object.entries(VOICE_PRESETS)
        .filter(([, v]) => v.lang.toLowerCase().startsWith(want))
        .map(([id]) => id);
}

/**
 * Expand a film's `voices` block, resolving any preset names to specs.
 *
 *   "voices": { "zawadi": "narrator-f-en", "juma": { "spec": "young-f-en" } }
 *
 * A spec that already contains a colon is passed through untouched, so this
 * is additive: every existing film keeps working.
 */
export function resolveVoices(voices = {}) {
    const out = {};
    const diagnostics = [];
    for (const [name, entry] of Object.entries(voices)) {
        const raw = typeof entry === 'string' ? { spec: entry } : { ...entry };
        const spec = raw.spec;
        if (typeof spec === 'string' && !spec.includes(':')) {
            const preset = VOICE_PRESETS[spec];
            if (preset) {
                out[name] = { ...raw, spec: preset.spec, lang: raw.lang ?? preset.lang };
                continue;
            }
            diagnostics.push({
                severity: 'warning', path: `voices.${name}.spec`,
                message: `Unknown voice preset "${spec}". `
                    + `Known: ${Object.keys(VOICE_PRESETS).join(', ')}. `
                    + 'A raw spec looks like "tts:en_GB-alba-medium".',
            });
        }
        out[name] = raw;
    }
    return { voices: out, diagnostics };
}

/**
 * Cast `n` distinguishable voices for an ensemble scene.
 *
 * Returns DISTINCT presets wherever the language has enough of them, because
 * two characters sharing a voice in a five-hander is the one casting mistake
 * an audience notices immediately. Where a language has fewer voices than
 * parts -- Swahili has exactly one -- the same voice comes back more than
 * once and the caller is told so, rather than being handed silent failures.
 */
export function castEnsemble(n, { lang = 'en' } = {}) {
    const pool = voicesFor(lang);
    if (!pool.length) return { cast: [], shortfall: n, pool: [] };
    const cast = Array.from({ length: n }, (_, i) => pool[i % pool.length]);
    return { cast, shortfall: Math.max(0, n - pool.length), pool };
}
