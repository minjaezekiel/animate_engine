import { VISEME_FALLBACK } from '../audio/visemes.js';

/**
 * Swap a node's geometry by name, once per frame, per channel.
 *
 * This generalises what lipsync already did. A mouth node carried a dictionary
 * of shapes and a discrete `props.viseme` channel naming one of them, and a
 * pass before each frame rewrote the node's geometry to match. That is exactly
 * the mechanism limited animation runs on -- hold a drawing, swap it -- so it
 * becomes the mechanism for head turns, expressions, hand shapes and sprite
 * frames rather than a special case for mouths.
 *
 *   node.props.swapSets = {
 *       viseme: { closed: {...}, open: {...} },      // keyed by CHANNEL name
 *       view:   { front: {...}, profile: {...} },
 *   }
 *   node.props.viseme = 'open'                        // a discrete track writes this
 *   node.props.view   = 'profile'
 *
 * A set member is any shape the backend draws, including `{kind:'image'}`,
 * which is how a drawn character's views and mouth charts attach.
 */

/**
 * Per-channel preference orders. A character that declares only a front view
 * should fall back to front, not vanish, and a six-viseme mouth chart drawn
 * with three shapes should degrade rather than go blank.
 */
export const SWAP_FALLBACK = {
    viseme: VISEME_FALLBACK,
    view: {
        front: ['front', 'threeQuarter', 'profile'],
        threeQuarter: ['threeQuarter', 'front', 'profile'],
        profile: ['profile', 'threeQuarter', 'front'],
        back: ['back', 'threeQuarter', 'front'],
    },
    eyes: {
        open: ['open', 'neutral'],
        closed: ['closed', 'squint', 'open'],
        squint: ['squint', 'closed', 'open'],
    },
};

/** The best available name in a set, given a channel's preference order. */
export function resolveSwap(channel, wanted, shapes) {
    if (shapes[wanted]) return wanted;
    for (const candidate of SWAP_FALLBACK[channel]?.[wanted] ?? []) {
        if (shapes[candidate]) return candidate;
    }
    return Object.keys(shapes)[0] ?? null;
}

/**
 * Apply every swap set in the scene.
 *
 * Registered as the renderer's `beforeFrame`, so it is pure with respect to
 * time: the discrete channels are read from props the Evaluator just wrote.
 */
export function applySwapSets(scene) {
    for (const node of scene.byId.values()) {
        // `visemeShapes` is the original single-channel form and still the
        // shape the lipsync compiler emits, so it is read as the `viseme` set
        // rather than migrated.
        const sets = node.props.swapSets;
        const legacy = node.props.visemeShapes;
        if (!sets && !legacy) continue;

        const channels = sets
            ? (legacy ? { viseme: legacy, ...sets } : sets)
            : { viseme: legacy };

        // Which set member each channel resolved to last time. Kept off
        // `props` so a per-frame pose reset cannot leave the cache claiming
        // geometry the node no longer has.
        const applied = node._swapNames ??= {};
        let changed = false;
        const wanted = {};
        for (const [channel, shapes] of Object.entries(channels)) {
            const name = resolveSwap(channel, node.props[channel] ?? firstKey(shapes), shapes);
            wanted[channel] = name;
            if (applied[channel] !== name) changed = true;
        }
        if (!changed) continue;

        // Props the last swap wrote. Without clearing them, swapping a `path`
        // member for an `ellipse` one leaves a stale `d` behind -- harmless
        // only for as long as every member happens to be the same kind, which
        // stops being true the moment images join in.
        for (const key of node._swapProps ?? []) delete node.props[key];
        const owned = new Set();
        let kind = null;

        for (const [channel, shapes] of Object.entries(channels)) {
            const shape = shapes[wanted[channel]];
            if (!shape) continue;
            applied[channel] = wanted[channel];
            kind = shape.kind ?? kind;
            for (const [k, v] of Object.entries(shape)) {
                if (k === 'kind') continue;
                node.props[k] = v;
                owned.add(k);
            }
        }
        node._swapProps = owned;
        if (kind) node.kind = kind;
    }
}

const firstKey = (shapes) => Object.keys(shapes)[0];

/**
 * Kept because the renderer and the editor both register it by this name, and
 * because "apply the mouth shapes" is still what the call means at the
 * lipsync end of the pipeline.
 */
export const applyVisemeShapes = applySwapSets;
