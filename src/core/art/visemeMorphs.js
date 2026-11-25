/**
 * Drive an imported model's morph targets from the viseme track.
 *
 * # The gap this closes
 *
 * The voice pipeline computes a viseme track for every line of every film,
 * in three tiers -- exact from TTS phoneme timings, estimated from the text
 * and gated by the audio envelope, and an amplitude floor beneath that. In
 * 2D a mouth node swaps its shape from that track and it has worked for
 * fifty-one films.
 *
 * In 3D it drove **nothing on an imported model**. Not because the runtime
 * could not: `PoseApplier` has handled `morph.<name>` and `morphIndex.<i>`
 * channels all along. What was missing was the BRIDGE -- something to turn
 * `props.viseme` into those channels -- so an imported head carrying a full
 * set of ARKit visemes could not be lipsynced, while the track telling it
 * what to say was already sitting in the timeline.
 *
 * # Why a name table rather than a standard
 *
 * There is no standard. The same mouth shape is `viseme_aa` to Oculus,
 * `jawOpen`/`mouthFunnel` to ARKit, `Mouth_Open` to Character Creator,
 * `AA` to some exporters and `mouthOpen` to a hand-modelled head. A model is
 * useless to this engine if the names do not match, and the names will never
 * all match, so the table is the feature.
 *
 * Matching is case- and separator-insensitive and tries each convention in
 * turn, and `matchVisemeMorphs` REPORTS what it matched and what it could
 * not. That report is the point: "this head has 52 morph targets and none of
 * them is a mouth shape I recognise" is a useful sentence, and silence is not.
 *
 * Pure. Names and numbers in, tracks out.
 */
import { createTrack, setKey } from '../anim/Track.js';
import { VISEMES } from '../audio/visemes.js';

/** Strip case, spaces, underscores and hyphens, so `Mouth_Open` == `mouthopen`. */
const norm = (s) => String(s ?? '').toLowerCase().replace(/[\s_\-.]/g, '');

/**
 * Candidate morph-target names per engine viseme, best first.
 *
 * Several conventions describe one of our six shapes with a COMBINATION
 * rather than a single target -- ARKit has no "round", it has `mouthFunnel`
 * plus `mouthPucker` -- so an entry may name more than one target and they
 * are driven together. Weights are part of the entry because a funnel at full
 * strength with a pucker at full strength is a fish, not an "oo".
 */
export const VISEME_MORPHS = {
    closed: [
        ['visemesil'], ['visemepp'], ['mouthclose'], ['mouthclosed'],
        ['aa01mouthclosed'], ['neutral'],
    ],
    mid: [
        ['visemedd'], ['visemenn'], ['mouthopen', 0.25], ['jawopen', 0.2],
        ['mouthsmall'],
    ],
    open: [
        ['visemeaa'], ['visemeah'], ['aa'], ['mouthopen'], ['jawopen', 0.75],
        ['mouthaa'],
    ],
    /**
     * Combinations come BEFORE the single-name fallbacks they contain.
     *
     * Order is preference, and the first version got this wrong in a way the
     * tests caught: `mouthPucker` alone was listed above `mouthFunnel +
     * mouthPucker`, so an ARKit head -- which has both -- resolved "round" to
     * a bare pucker. A pucker on its own is a KISS. A funnel opening behind
     * it is an "oo". Same for "wide": a smile pair reads as "ee" where a
     * stretch pair reads as a grimace, so the smile pair is tried first.
     *
     * The single names stay as fallbacks, because a simpler head that has
     * only `mouthPucker` is better served by a kiss than by nothing.
     */
    round: [
        ['visemeou'], ['visemeoh'], ['visemeuw'], ['oh'], ['mouthround'],
        ['mouthfunnel', 0.7, 'mouthpucker', 0.5],
        ['jawopen', 0.35, 'mouthpucker', 0.6],
        ['mouthfunnel'], ['mouthpucker'],
    ],
    wide: [
        ['visemei'], ['visemeih'], ['visemeee'], ['ee'], ['mouthwide'],
        ['jawopen', 0.25, 'mouthsmileleft', 0.5, 'mouthsmileright', 0.5],
        ['mouthsmileleft', 0.6, 'mouthsmileright', 0.6],
        ['mouthstretchleft', 0.6, 'mouthstretchright', 0.6],
        ['mouthsmile'],
    ],
    teeth: [
        ['visemeff'], ['visemefv'], ['ff'], ['mouthteeth'],
        ['mouthlowerdownleft', 0.5, 'mouthlowerdownright', 0.5],
        ['mouthfrown', 0.4, 'jawopen', 0.15],
    ],
};

/** A readable label for which convention a model appears to follow. */
function conventionOf(names) {
    const n = names.map(norm);
    if (n.some((x) => x.startsWith('viseme'))) return 'oculus/viseme_*';
    if (n.includes('jawopen') && n.includes('mouthpucker')) return 'arkit';
    if (n.some((x) => x.startsWith('mouth'))) return 'generic mouth*';
    return 'unrecognised';
}

/**
 * Map each viseme onto the morph targets this model actually has.
 *
 * Returns `{ map, matched, unmatched, convention, usable }`. `usable` is the
 * one a caller should branch on: three shapes is enough to read as speech --
 * which is the same judgement `VISEME_FALLBACK` already makes for 2D
 * characters -- and fewer is a head that should not pretend to lipsync.
 */
export function matchVisemeMorphs(targetNames, { extra = null } = {}) {
    const available = new Map();
    for (const [i, name] of (targetNames ?? []).entries()) {
        // First spelling wins: a model with both `jawOpen` and `JawOpen` is
        // malformed, and picking the earlier is at least deterministic.
        if (!available.has(norm(name))) available.set(norm(name), { name, index: i });
    }
    const map = {};
    const unmatched = [];
    for (const viseme of VISEMES) {
        // An author's own mapping beats the table outright: they can see the
        // model and this function cannot.
        const override = extra?.[viseme];
        if (override) {
            const found = (Array.isArray(override) ? override : [override])
                .map((name) => available.get(norm(name)))
                .filter(Boolean)
                .map((hit) => ({ ...hit, weight: 1 }));
            if (found.length) { map[viseme] = found; continue; }
        }
        let hit = null;
        for (const candidate of VISEME_MORPHS[viseme] ?? []) {
            // A candidate is [name, weight?, name, weight?...].
            const parts = [];
            for (let k = 0; k < candidate.length;) {
                const name = candidate[k];
                const weight = typeof candidate[k + 1] === 'number' ? candidate[k + 1] : 1;
                k += typeof candidate[k + 1] === 'number' ? 2 : 1;
                const found = available.get(norm(name));
                if (!found) { parts.length = 0; break; }
                parts.push({ ...found, weight });
            }
            // Partial matches are rejected: half of a two-target combination
            // is a different expression, not a weaker one.
            if (parts.length) { hit = parts; break; }
        }
        if (hit) map[viseme] = hit;
        else unmatched.push(viseme);
    }
    const matched = Object.keys(map);
    return {
        map, matched, unmatched,
        convention: conventionOf(targetNames ?? []),
        targets: (targetNames ?? []).length,
        // Three shapes read as speech; two do not.
        usable: matched.length >= 3,
        reason: matched.length >= 3
            ? `${matched.length} of ${VISEMES.length} visemes map onto `
                + `${conventionOf(targetNames ?? [])} morph targets`
            : `only ${matched.length} viseme(s) matched among ${(targetNames ?? []).length} `
                + 'morph targets, which is not enough to read as speech. Declare a '
                + '`visemes` map on the model naming its shapes.',
    };
}

/**
 * Turn a viseme track into one `morph.<name>` track per target it touches.
 *
 * `blend` is why this is not a step function. A morph weight snapping from 0
 * to 1 pops, and the 2D path gets away with a discrete swap because a cutout
 * mouth IS a swap -- there is no in-between drawing to miss. A mesh has one,
 * so each shape is given a short linear ramp in: the previous weight is held
 * until `blend` before the change and reaches the new weight on the key.
 * 40ms is about one frame at 24fps, which is enough to stop the pop and short
 * enough not to smear consecutive visemes into each other.
 *
 * Only tracks that actually move are returned, so a model with twelve mouth
 * shapes and a line using four does not get twelve channels of zeros.
 */
export function visemeMorphTracks(nodeId, visemeKeys, mapping, { blend = 0.04 } = {}) {
    if (!mapping?.map || !visemeKeys?.length) return [];
    const weightsAt = (viseme) => {
        const out = new Map();
        for (const part of mapping.map[viseme] ?? []) out.set(part.name, part.weight);
        return out;
    };
    // Every target any mapped viseme touches.
    const all = new Set();
    for (const parts of Object.values(mapping.map)) for (const p of parts) all.add(p.name);

    const series = new Map([...all].map((name) => [name, []]));
    let prev = null;
    for (const k of visemeKeys) {
        const w = weightsAt(k.viseme);
        for (const name of all) {
            const next = w.get(name) ?? 0;
            const last = prev ? (prev.get(name) ?? 0) : 0;
            if (prev && next === last) continue;         // unchanged: no key
            const keys = series.get(name);
            // Hold the old value right up to the ramp, so only `blend`
            // seconds of the shape is in transition rather than the whole
            // gap since the last change.
            if (prev && k.t - blend > (keys.at(-1)?.t ?? -Infinity)) {
                keys.push({ t: +(k.t - blend).toFixed(6), v: last });
            }
            keys.push({ t: k.t, v: next });
        }
        prev = w;
    }

    const tracks = [];
    for (const [name, keys] of series) {
        // A channel that is zero throughout is a channel nothing needs.
        if (!keys.some((k) => k.v !== 0)) continue;
        const track = createTrack({ target: nodeId, path: `morph.${name}`, type: 'number' });
        for (const k of keys) setKey(track, k.t, k.v, 'linear');
        tracks.push(track);
    }
    return tracks;
}

/**
 * Read a `props.viseme` track back into `{ t, viseme }` keys.
 *
 * The lipsync stage emits a discrete track, and this is the adapter between
 * the two representations rather than a second source of truth: the visemes
 * are decided once, in `lipsync.js`, for both paths.
 */
export function visemeKeysOf(track) {
    return (track?.keys ?? [])
        .map((k) => ({ t: k.t, viseme: k.v }))
        .filter((k) => typeof k.viseme === 'string');
}
