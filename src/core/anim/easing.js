/**
 * Easing functions. Pure, and deliberately identical in behavior to the
 * engine's original `cubicBezierEase` so the existing unit tests keep their
 * meaning after the move.
 *
 * Evaluate a CSS-style cubic-bezier easing curve, returning eased y for
 * linear progress t in [0,1]. Control points (x1,y1)/(x2,y2); ends at 0..1.
 */
export function cubicBezierEase(x1, y1, x2, y2, t) {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const fx = (u) => ((ax * u + bx) * u + cx) * u;
    const dfx = (u) => (3 * ax * u + 2 * bx) * u + cx;
    let u = t;
    for (let i = 0; i < 8; i++) {
        const x = fx(u) - t;
        if (Math.abs(x) < 1e-6) break;
        const d = dfx(u);
        if (Math.abs(d) < 1e-6) break;
        u -= x / d;
    }
    u = Math.max(0, Math.min(1, u));
    return ((ay * u + by) * u + cy) * u;
}

/** Smoothstep — the 'smooth' ease, matching THREE's InterpolateSmooth closely enough. */
export const smoothstep = (t) => t * t * (3 - 2 * t);

export const DEFAULT_BEZIER_HANDLES = [0.42, 0, 0.58, 1];

/**
 * Map a normalized segment progress through the named ease.
 *
 * 'step' and 'hold' both return 0 for the whole segment, so the value stays
 * at the left key until the next key takes over. They are distinguished only
 * for authoring clarity.
 */
export function easeProgress(ease, u, handles) {
    switch (ease) {
        case 'step':
        case 'hold':
            return 0;
        case 'smooth':
            return smoothstep(u);
        case 'bezier': {
            const h = handles || DEFAULT_BEZIER_HANDLES;
            return cubicBezierEase(h[0], h[1], h[2], h[3], u);
        }
        case 'linear':
        default:
            return u;
    }
}
