/**
 * The twelve principles of animation, as engine affordances.
 *
 * Most of the twelve were already expressible -- easing is slow in and slow
 * out, concurrent clip instances are secondary action, the pose library is
 * pose-to-pose, `staging.js` checks staging, and Phase 10's views and tones
 * are solid drawing. Four were not expressible at all without an author
 * hand-writing extra keyframes every single time, and those four are what
 * lives here:
 *
 *   anticipation          a counter-move before the move
 *   follow-through        an overshoot that settles rather than a dead stop
 *   overlapping action    parts down a chain arriving late
 *   arcs                  a path that bows instead of ruling a straight line
 *
 * They are small on purpose. Each is one number on an action, because the
 * cost of a principle an author has to hand-key is that it never gets used.
 *
 * Pure: numbers in, numbers out, no timeline and no scene.
 */

/** How much of a move's span the anticipation occupies. */
export const ANTICIPATION_SHARE = 0.26;
/** Where the overshoot peaks, as a fraction of the span. */
export const OVERSHOOT_AT = 0.80;

/**
 * The counter-move. A hand reaching right first drifts left, which is what
 * tells the eye the reach is coming.
 */
export const anticipationValue = (from, to, amount = 0.12) => from - (to - from) * amount;

/**
 * Follow-through: pass the target, then settle back onto it. Stopping dead on
 * the target is the single most mechanical-looking thing a rig can do.
 */
export const overshootValue = (from, to, amount = 0.1) => to + (to - from) * amount;

/**
 * A midpoint pushed off the straight line between two points.
 *
 * `bow` is a fraction of the distance travelled, perpendicular to it, so the
 * same number arcs a short step and a long walk by the same proportion. A
 * positive bow lifts the path, because the overwhelmingly common case is a
 * limb or a body rising through the middle of its travel.
 */
export function arcMidpoint([x0, y0], [x1, y1], bow = 0.18) {
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return [x0, y0];
    // Perpendicular, normalised, then scaled by the distance so the bow is
    // proportional rather than absolute.
    return [x0 + dx / 2 + (dy / len) * len * bow * -1,
            y0 + dy / 2 + (dx / len) * len * bow * -1];
}

/**
 * Seconds of delay for each part in an overlap spec.
 *
 * Accepts either a map (`{ foreL: 0.06, handL: 0.1 }`) or a single number
 * plus an ordered chain, in which case the delay accumulates down the chain:
 * the upper arm leads, the forearm trails it, the hand trails that.
 */
export function overlapDelays(lag, chain = []) {
    if (lag == null) return {};
    if (typeof lag === 'object') return lag;
    const out = {};
    chain.forEach((id, i) => { out[id] = lag * i; });
    return out;
}

/**
 * Volume-preserving squash and stretch keys.
 *
 * `sx` is the reciprocal of `sy`, so the shape keeps its area. Scaling one
 * axis alone reads as the character inflating, which is the usual way this
 * principle gets applied wrongly.
 */
export function squashKeys(duration, amount = 0.14, { recover = 0.6 } = {}) {
    const sy = 1 - amount;
    const peak = duration * (1 - recover);
    return {
        sy: [[0, 1], [peak, sy], [duration, 1]],
        sx: [[0, 1], [peak, 1 / sy], [duration, 1]],
    };
}

/** Shift every key of the named tracks later, leaving the rest alone. */
export function applyOverlap(keysByChannel, delays) {
    if (!delays || !Object.keys(delays).length) return keysByChannel;
    const out = {};
    for (const [channel, keys] of Object.entries(keysByChannel)) {
        const part = channel.slice(0, channel.indexOf('.') < 0 ? channel.length : channel.indexOf('.'));
        const d = delays[part] ?? 0;
        out[channel] = d
            ? keys.map((k) => (Array.isArray(k) ? [k[0] + d, ...k.slice(1)] : { ...k, t: k.t + d }))
            : keys;
    }
    return out;
}
