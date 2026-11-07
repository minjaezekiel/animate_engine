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
import { SAFE, pathPart, poly, rectPart, smooth, textPart } from './diagram.mjs';

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';



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

// ---------------------------------------------------------------------------
// Lifted from `scripts/vito/common.mjs` when a THIRD series needed them.
// Generic: none of these knows anything about gemstones or structure.
// ---------------------------------------------------------------------------

/**
 * A closed band between a curve and the same curve `h` lower.
 *
 * Needed because `smooth()` returns a complete `M...C...` subpath, and the
 * obvious way to close two of them into a band -- string-surgery on the
 * second one's `M` -- produced spikes off the left edge of every folded layer
 * in part one. The fix is to replace the whole `M` prefix with an `L` to the
 * exact point it was already at, so the two curves join instead of starting a
 * new subpath that the fill then has to close across the frame.
 */
export function foldBand(ptsTop, h) {
    const bot = ptsTop.map(([x, y]) => [x, y + h]);
    const last = bot[bot.length - 1];
    const rev = smooth([...bot].reverse());
    return `${smooth(ptsTop)} `
        + `${rev.replace(/^M[^C]*/, `L${last[0].toFixed(1)},${last[1].toFixed(1)} `)} Z`;
}

/** Layer bands for a stratigraphic section: [[name, colour, thickness], ...]. */
export function strata(id, layers, { x = 90, w = 900, top = 560, z = 0 } = {}) {
    const parts = [];
    let y = top;
    layers.forEach(([name, fill, h], i) => {
        parts.push(rectPart(`${id}${i}`, w, h, { at: [x + w / 2, y + h / 2], fill,
                                                 alpha: 0, z: z + i }));
        if (name) {
            // Inside the band and left-aligned at the safe margin. Flush
            // right against the frame edge read as a legend beside a chart
            // rather than as a name ON the layer.
            parts.push(textPart(`${id}${i}_l`, name, {
                at: [96, y + h / 2], font: `700 27px ${FONT}`, fill: '#1a1611',
                align: 'left', alpha: 0, z: z + i + 1, maxWidth: w - 120 }));
        }
        y += h;
    });
    return { parts, bottom: y, ids: parts.map((p) => p.id) };
}

/**
 * A stack of panels: a heading, a line of body text, and a colour chip.
 *
 * The recurring shape of this series -- three factories, four tests, five
 * trap sites. Each row is its own group of ids so the narration can reveal
 * them one at a time, which is the whole reason a board exists.
 */
export function cardRows(id, rows, {
    top = 560, h = 150, gap = 18, x = 60, w = 960, z = 10,
} = {}) {
    const parts = [];
    const ids = [];
    rows.forEach(([title, body, chip], i) => {
        const y = top + i * (h + gap);
        const rid = `${id}${i}`;
        parts.push(
            rectPart(`${rid}_bg`, w, h, { at: [x + w / 2, y + h / 2], fill: '#131c2b',
                                          stroke: '#223148', strokeWidth: 2, alpha: 0, z }),
            rectPart(`${rid}_chip`, 10, h - 28, { at: [x + 24, y + h / 2], fill: chip,
                                                  alpha: 0, z: z + 1 }),
            textPart(`${rid}_t`, title, { at: [x + 54, y + 48], font: `800 34px ${FONT}`,
                                          fill: 'ink', align: 'left', alpha: 0, z: z + 2,
                                          maxWidth: w - 90 }),
            textPart(`${rid}_b`, body, { at: [x + 54, y + 100], font: `600 27px ${FONT}`,
                                         fill: 'dim', align: 'left', alpha: 0, z: z + 2,
                                         maxWidth: w - 90, lineHeight: 34 }),
        );
        ids.push([`${rid}_bg`, `${rid}_chip`, `${rid}_t`, `${rid}_b`]);
    });
    return { parts, ids, rowIds: (i) => ids[i], allIds: ids.flat(),
             bottom: top + rows.length * (h + gap) };
}

/** A big number with a caption under it, for a statistic that has to land. */
export const statParts = (id, value, caption, {
    at = [540, 900], fill = 'gold', size = 96, z = 50,
} = {}) => [
    textPart(`${id}_v`, value, { at, font: `800 ${size}px ${FONT}`, fill, alpha: 0, z }),
    textPart(`${id}_c`, caption, { at: [at[0], at[1] + size * 0.62],
                                   font: `700 30px ${FONT}`, fill: 'dim', alpha: 0, z,
                                   maxWidth: SAFE.x1 - SAFE.x0 }),
];
