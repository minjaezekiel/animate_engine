/**
 * 2D affine matrices as flat [a, b, c, d, e, f], matching the
 * CanvasRenderingContext2D.setTransform argument order:
 *
 *   | a c e |
 *   | b d f |
 *   | 0 0 1 |
 *
 * Pure functions only. Every operation that produces a matrix returns a new
 * array, so callers never alias each other's state.
 */

export const identity = () => [1, 0, 0, 1, 0, 0];

/** m1 then m2 applied to a point == multiply(m1, m2) applied to that point. */
export function multiply(m1, m2) {
    const [a1, b1, c1, d1, e1, f1] = m1;
    const [a2, b2, c2, d2, e2, f2] = m2;
    return [
        a1 * a2 + c1 * b2,
        b1 * a2 + d1 * b2,
        a1 * c2 + c1 * d2,
        b1 * c2 + d1 * d2,
        a1 * e2 + c1 * f2 + e1,
        b1 * e2 + d1 * f2 + f1,
    ];
}

export function applyToPoint(m, x, y) {
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

export function invert(m) {
    const [a, b, c, d, e, f] = m;
    const det = a * d - b * c;
    if (det === 0) return null;
    const id = 1 / det;
    return [
        d * id, -b * id,
        -c * id, a * id,
        (c * f - d * e) * id,
        (b * e - a * f) * id,
    ];
}

/**
 * Build the local matrix for a Transform2D.
 *
 * Order is translate -> rotate -> skewX -> scale, all about the origin
 * (ox, oy). The origin is the pivot: it is subtracted before the rotation and
 * scale so a limb rotates about its joint rather than about its centroid.
 * This ordering is what makes a cutout rig's parent/child chain behave.
 */
export function fromTransform(t) {
    const { x = 0, y = 0, rot = 0, sx = 1, sy = 1, skx = 0, ox = 0, oy = 0 } = t;
    const cos = Math.cos(rot), sin = Math.sin(rot);
    const tanK = skx ? Math.tan(skx) : 0;

    // rotate * skewX * scale
    const a = cos * sx;
    const b = sin * sx;
    const c = (cos * tanK - sin) * sy;
    const d = (sin * tanK + cos) * sy;

    // translate to (x, y) and pull the pivot back to the origin
    return [a, b, c, d, x - (a * ox + c * oy), y - (b * ox + d * oy)];
}
