/**
 * Board machinery, shared by every generated series.
 *
 * A board is one `role: 'effect'` cast member holding a diagram. Actions can
 * only address cast roots, so a board swap is ONE action rather than one per
 * element, and the elements inside are revealed individually as the narration
 * reaches them.
 *
 * Lifted out of `scripts/geology/common.mjs` when a second series needed the
 * same four helpers. That file now re-exports these, so every existing part
 * keeps its imports.
 */
import { poly } from './diagram.mjs';



/** Deterministic noise: a star field must be identical on every run. */
export function rng(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * A rotated square, as path data. A part has no `rot` key -- `KNOWN.part`
 * carries no transform at all -- so a tilted crystal has to be drawn tilted
 * rather than drawn square and turned.
 */
export function squarePath(cx, cy, size, rot = 0) {
    const h = size / 2;
    const pts = [[-h, -h], [h, -h], [h, h], [-h, h]].map(([x, y]) => [
        cx + x * Math.cos(rot) - y * Math.sin(rot),
        cy + x * Math.sin(rot) + y * Math.cos(rot),
    ]);
    return poly(pts, true);
}

/** A point on a cubic Bezier, for placing things along a curved structure. */
export function bez3(t, p0, p1, p2, p3) {
    const u = 1 - t;
    const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0],
            a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]];
}

/** Blinks across a shot, seeded so two characters never blink together. */
export function blinks(target, duration, seed) {
    const r = rng(seed);
    const out = [];
    for (let t = 0.7 + r() * 1.4; t < duration - 0.5; t += 2.3 + r() * 2.4) {
        out.push({ target, do: 'play', action: 'blink', at: +t.toFixed(3) });
    }
    return out;
}

/** A board: one cast member holding a diagram, hidden until it is wanted. */
export const board = (name, parts) => ({ name, parts });
export const castBoard = (name, { alpha = 0, z = 0 } = {}) =>
    ({ character: name, as: name, at: [0, 0], scale: 1, alpha, z, role: 'effect' });
