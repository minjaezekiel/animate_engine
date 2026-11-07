/**
 * "Game Physics" -- the shape maths, in one place.
 *
 * Three functions that turn geometry into SVG path data. They live apart
 * from `common.mjs` for a dull but real reason: `figures.mjs` needs them and
 * `common.mjs` re-exports `figures.mjs`, so leaving them where they were
 * made the two modules import each other. A cycle of function declarations
 * happens to work in ES modules, and relying on that is how a module graph
 * becomes something nobody will touch.
 *
 * They write coordinates through `diagram.mjs`'s own `M`/`L`/`C`, not their
 * own formatter: that module rounds to one decimal and normalises negative
 * zero, and a second convention here would silently change every path string
 * in a film that is already rendered and approved.
 *
 * All three build curves out of cubic béziers rather than SVG's `A` arc
 * command. `Path2D` understands `A` perfectly well, but `applyTrim` measures
 * a path to dash it, and a measured length is only exact for the segment
 * kinds the measurer knows -- so an arc drawn as béziers can be drawn ON,
 * and one drawn as an arc cannot.
 */
import { C, L, M, Z } from '../lib/diagram.mjs';

/** The magic constant: the control-point distance for a quarter circle. */
const KAPPA = 0.5523;

/** A rounded rectangle as path data. */
export function roundRect(x, y, w, h, r) {
    const k = r * KAPPA;
    return `${M(x + r, y)} ${L(x + w - r, y)} `
        + `${C(x + w - r + k, y, x + w, y + r - k, x + w, y + r)} ${L(x + w, y + h - r)} `
        + `${C(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h)} ${L(x + r, y + h)} `
        + `${C(x + r - k, y + h, x, y + h - r + k, x, y + h - r)} ${L(x, y + r)} `
        + `${C(x, y + r - k, x + r - k, y, x + r, y)} ${Z}`;
}

/**
 * A circle as PATH data.
 *
 * An `ellipse` shape is always centred on its own node, and a ball's mark
 * has to keep its node at the ball's centre so that rotating it ORBITS
 * rather than turning in place. So the one shape that must sit off its own
 * pivot is drawn rather than declared.
 */
export function circlePath(cx, cy, r) {
    const k = r * KAPPA;
    return `${M(cx, cy - r)} ${C(cx + k, cy - r, cx + r, cy - k, cx + r, cy)} `
        + `${C(cx + r, cy + k, cx + k, cy + r, cx, cy + r)} `
        + `${C(cx - k, cy + r, cx - r, cy + k, cx - r, cy)} `
        + `${C(cx - r, cy - k, cx - k, cy - r, cx, cy - r)} ${Z}`;
}

/**
 * A circular arc, in radians, built from béziers of at most a quarter turn.
 *
 * At 90 degrees the standard 4/3·tan(θ/4) control distance is accurate to
 * about one part in ten thousand, which is well inside a pixel at any radius
 * a 1080-wide frame can hold.
 */
export function arcPath(cx, cy, r, a0, a1) {
    const sweep = a1 - a0;
    const segs = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 2)));
    const step = sweep / segs;
    const k = (4 / 3) * Math.tan(step / 4);
    let d = M(cx + r * Math.cos(a0), cy + r * Math.sin(a0));
    for (let i = 0; i < segs; i++) {
        const t0 = a0 + i * step;
        const t1 = t0 + step;
        const x0 = cx + r * Math.cos(t0);
        const y0 = cy + r * Math.sin(t0);
        const x1 = cx + r * Math.cos(t1);
        const y1 = cy + r * Math.sin(t1);
        d += ` ${C(x0 - k * r * Math.sin(t0), y0 + k * r * Math.cos(t0),
                   x1 + k * r * Math.sin(t1), y1 - k * r * Math.cos(t1), x1, y1)}`;
    }
    return d;
}
