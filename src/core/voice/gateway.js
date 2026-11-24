import { VoiceRegistry } from './VoiceRegistry.js';
import { TtsVitsProvider } from './providers/TtsVitsProvider.js';
import { VoiceStudioProvider } from './providers/VoiceStudioProvider.js';
import { KokoroProvider } from './providers/KokoroProvider.js';
import { OpenVoiceProvider } from './providers/OpenVoiceProvider.js';

/**
 * One place that decides which voice engines exist and in what order.
 *
 * # Why a gateway on top of the registry
 *
 * `VoiceRegistry` is already the abstraction: a spec is `<provider>:<voice>`,
 * every provider satisfies one four-method interface, and the fallback ladder
 * walks providers in registration order and says out loud when a line came
 * out in someone else's voice. None of that needed changing to add two more
 * engines.
 *
 * What was missing is that **registration order was written out by hand at
 * every call site**, and there were four of them: `studio.js` for the 2D
 * path, `film3d.html` for the 3D path, `voice-studio.mjs` for auditions, and
 * the MCP server for agents. They had drifted. The 2D path registered Piper
 * with a vendored module URL and a VoiceStudio if one was configured; the 3D
 * path registered Piper from the CDN and nothing else. So a film cast on a
 * cloned voice rendered in that voice in 2D and in a Piper preset in 3D --
 * and the only reason it was not silent is the ladder.
 *
 * Adding Kokoro and OpenVoice to four hand-written lists would have made that
 * worse. So the list lives here, and `createRegistry` is what the four
 * callers call.
 *
 * # The order, and why it is this order
 *
 * Registration order IS fallback order, so it is a statement about what
 * should speak when the cast voice cannot:
 *
 *   1. `voicestudio`  a named human voice the user cloned or recorded.
 *                     First because if a film is cast on a specific person,
 *                     nothing else is a substitute for them.
 *   2. `openvoice`    a cloner, over HTTP. Second for the same reason, one
 *                     rung down: it can *be* a named voice, given a
 *                     reference, but a film cast on it is usually cast on a
 *                     character rather than on a person.
 *   3. `kokoro`       the best-phrasing preset engine here. Ahead of Piper on
 *                     quality and behind it on cost: 86 MB from a CDN.
 *   4. `piper`        vendored, 63 MB already on disk in this checkout, ten
 *                     English presets and the only Swahili model. Last
 *                     because it is the one that is always there, which is
 *                     exactly what you want at the bottom of a ladder.
 *
 * `backend` promotes one provider to the front without removing the others,
 * which is what `VOICE_BACKEND=kokoro` means: prefer it, keep the safety net.
 * `only` removes the others, for a render that must not substitute.
 */

/** The engines this build knows about, in default fallback order. */
export const VOICE_PROVIDERS = ['voicestudio', 'openvoice', 'kokoro', 'piper'];

/**
 * Engine name -> the prefix a film's voice spec actually uses.
 *
 * Piper's provider has called itself `tts` since the first voice phase, and
 * every film in this repo is cast as `tts:en_US-amy-medium`. Renaming it to
 * `piper` would be a one-line change here and a silent re-cast of eight
 * series: `resolve()` looks the prefix up in `providers`, finds nothing for
 * `tts:`, returns null, and the ladder hands every line to whichever provider
 * happens to be first. That is the Phase 33 defect exactly -- the render
 * works and the voice is quietly someone else's.
 *
 * So the engine is called `piper` where a person reads it and `tts` where a
 * spec is parsed, and this map is the join.
 */
export const SPEC_PREFIX = {
    piper: 'tts', kokoro: 'kokoro', openvoice: 'openvoice', voicestudio: 'voicestudio',
};
const ENGINE_OF_PREFIX = Object.fromEntries(
    Object.entries(SPEC_PREFIX).map(([engine, prefix]) => [prefix, engine]));

/**
 * What each engine costs and needs, as data.
 *
 * Here so that "which voice engines can I use?" is answerable WITHOUT
 * probing a port or downloading a model -- which is the difference between
 * an agent spending ~200 tokens to choose a voice and spending a 86 MB
 * download to find out it could not. `scripts/voice-studio.mjs --list` and
 * the MCP `list_voices` tool both read this.
 */
export const VOICE_ENGINES = {
    piper: {
        id: 'piper',
        prefix: 'tts',
        label: 'Piper (VITS)',
        licence: 'MIT',
        runs: 'browser (onnxruntime-web)',
        clones: false,
        needs: 'nothing; `npm run vendor-voice` puts the models in vendor/',
        langs: ['en-US', 'en-GB', 'sw-CD'],
        note: 'Flat prosody, exact phoneme timings, always available.',
    },
    kokoro: {
        id: 'kokoro',
        prefix: 'kokoro',
        label: 'Kokoro 82M',
        licence: 'Apache-2.0',
        runs: 'browser (onnxruntime-web)',
        clones: false,
        needs: '~86 MB model fetch on first use (q8), or a vendored copy',
        langs: ['en-US', 'en-GB'],
        note: 'Best phrasing of the preset engines. 82M parameters.',
    },
    openvoice: {
        id: 'openvoice',
        prefix: 'openvoice',
        label: 'OpenVoice V2',
        licence: 'MIT',
        runs: 'an HTTP server you start (PyTorch, GPU preferred)',
        clones: true,
        needs: 'OPENVOICE_URL pointing at a server with /tts and /voices',
        langs: ['en', 'es', 'fr', 'zh', 'ja', 'ko'],
        note: 'Reference-based cloning, accent and emotion control. '
            + 'Clone your own voice or one whose owner agreed.',
    },
    voicestudio: {
        id: 'voicestudio',
        prefix: 'voicestudio',
        label: 'VoiceStudio',
        licence: 'the studio\'s own',
        runs: 'a local app you start',
        clones: true,
        needs: 'VOICE_STUDIO pointing at the running studio',
        langs: ['whatever the studio has'],
        note: 'Cloned and recorded human voices. See docs/29-VOICE-STUDIO.md.',
    },
};

/**
 * Build the registry every path in the engine should use.
 *
 * Everything is optional. A provider whose configuration is absent is simply
 * not registered, which is why this one function serves a checkout with a
 * cloning server and a GPU and a checkout with nothing but `vendor/`.
 */
export function createRegistry({
    decode, sampleRate = 48000,
    /** Promote one provider to the front of the ladder. */
    backend = null,
    /** Register ONLY the promoted provider, so nothing can substitute. */
    only = false,
    ttsModuleUrl = null,
    voiceStudioUrl = null,
    voiceStudioOptions = null,
    kokoroUrl = null,
    kokoroModel = null,
    kokoroDtype = 'q8',
    openVoiceUrl = null,
    openVoiceReference = null,
    onProgress = null,
    report = null,
    registry = null,
} = {}) {
    const reg = registry ?? new VoiceRegistry();
    const say = (m) => report?.(m);

    const make = {
        voicestudio: () => (voiceStudioUrl ? createProvider('voicestudio', {
            decode, sampleRate, url: voiceStudioUrl, options: voiceStudioOptions,
        }) : null),
        openvoice: () => (openVoiceUrl ? createProvider('openvoice', {
            decode, sampleRate, url: openVoiceUrl, reference: openVoiceReference,
        }) : null),
        /**
         * Kokoro registers whenever it is ASKED for, not whenever it could
         * work. It could always work -- it is a CDN fetch away -- and a
         * provider that is always available and always 86 MB does not belong
         * silently in a fallback ladder. `kokoroUrl` (a vendored copy) or
         * `backend: 'kokoro'` is the asking.
         */
        kokoro: () => ((kokoroUrl || backend === 'kokoro') ? createProvider('kokoro', {
            decode, sampleRate, onProgress, url: kokoroUrl,
            model: kokoroModel, dtype: kokoroDtype,
        }) : null),
        piper: () => createProvider('piper', {
            decode, sampleRate, onProgress, url: ttsModuleUrl }),
    };

    if (backend && !make[backend]) {
        say(`[voice] unknown backend '${backend}'. `
            + `Known: ${VOICE_PROVIDERS.join(', ')}. Using the default ladder.`);
        backend = null;
    }

    // The promoted provider first, then the rest in default order. A
    // promotion that cannot be built is reported rather than silently
    // ignored: `VOICE_BACKEND=openvoice` with no server is the exact shape of
    // the Phase 33 defect where twelve films came out in the wrong voice and
    // nothing said so.
    const order = backend
        ? [backend, ...(only ? [] : VOICE_PROVIDERS.filter((p) => p !== backend))]
        : VOICE_PROVIDERS;

    for (const id of order) {
        const provider = make[id]?.();
        if (!provider) {
            if (id === backend) {
                say(`[voice] VOICE_BACKEND=${id} but it is not configured `
                    + `(${VOICE_ENGINES[id]?.needs ?? 'see docs/03-VOICE.md'}). `
                    + 'Lines cast on it will fall through.');
            }
            continue;
        }
        reg.register(provider);
    }
    say(`[voice] providers: ${[...reg.providers.keys()].join(' > ') || 'none'}`);
    return reg;
}

/**
 * Build one provider by engine name.
 *
 * Split out of `createRegistry` so an engine can also be turned on LATER,
 * from a page, after the registry exists -- which is what a voice picker
 * offering "Kokoro 82M (86 MB on first use)" needs. Without this the only
 * way to add an engine was to rebuild the whole studio, so the browser UI
 * could reach exactly the engines an environment variable had chosen, which
 * in a browser is none of the optional ones.
 */
export function createProvider(name, {
    decode, sampleRate = 48000, url = null, options = null, reference = null,
    model = null, dtype = 'q8', onProgress = null,
} = {}) {
    switch (name) {
        case 'voicestudio':
            return url ? new VoiceStudioProvider({
                baseUrl: url, decode, sampleRate, ...(options ?? {}) }) : null;
        case 'openvoice':
            return url ? new OpenVoiceProvider({ baseUrl: url, decode, reference }) : null;
        case 'kokoro':
            return new KokoroProvider({
                decode, sampleRate, onProgress, dtype,
                ...(url ? { moduleUrl: url } : {}),
                ...(model ? { model } : {}),
            });
        case 'piper':
            return new TtsVitsProvider({
                decode, sampleRate, onProgress,
                ...(url ? { moduleUrl: url } : {}),
            });
        default:
            return null;
    }
}

/**
 * Everything a caller could cast against, as compact rows.
 *
 * Shaped for an agent, which is why it is a flat list of
 * `{ spec, engine, name, lang, clones }` and not a nested tree: a spec is
 * the only string a film needs, and a tree makes the reader reassemble it.
 * `probe: false` answers from `VOICE_ENGINES` alone and touches no network.
 */
export async function listVoices(registry, { probe = true } = {}) {
    const rows = [];
    for (const [prefix, provider] of registry.providers) {
        // `prefix` is what a spec is parsed with (`tts`); `name` is what a
        // person reads (`piper`). Rows carry both, because an agent writing a
        // film needs the first and an agent explaining itself needs the
        // second.
        const name = ENGINE_OF_PREFIX[prefix] ?? prefix;
        const engine = VOICE_ENGINES[name] ?? { id: name, label: provider.label ?? name };
        if (!probe) {
            rows.push({ spec: `${prefix}:`, engine: name, name: engine.label,
                        lang: (engine.langs ?? []).join(','), clones: !!engine.clones,
                        listed: false });
            continue;
        }
        const up = await registry.isAvailable(provider);
        if (!up) {
            rows.push({ spec: `${prefix}:`, engine: name, name: engine.label,
                        lang: '', clones: !!engine.clones, listed: false,
                        unavailable: engine.needs ?? 'not running' });
            continue;
        }
        const voices = (await registry.voicesOf(provider)) ?? [];
        for (const v of voices) {
            rows.push({ spec: `${prefix}:${v.id}`, engine: name, name: v.name ?? v.id,
                        lang: v.lang ?? '', clones: !!engine.clones, listed: true });
        }
    }
    return rows;
}
