/**
 * SVG path data: tokenise, normalise, transform, measure.
 *
 * # Why this is here at all
 *
 * The 2D renderer has spoken SVG path syntax since the beginning --
 * `shapes.js` hands a part's `d` straight to `Path2D`. So importing an SVG
 * is not a rendering problem and never was; it is a *parsing* problem, and
 * this is the half of it that deals with one `d` string.
 *
 * # One normal form
 *
 * Everything reduces to absolute `M` / `L` / `C` / `Z`. Arcs become cubics,
 * `H`/`V` become `L`, `S`/`T` get their reflected control points written out,
 * and relative commands become absolute. Four segment kinds instead of
 * twenty is what makes the rest of this file short enough to be obviously
 * right:
 *
 *   - an affine transform applies to a cubic by transforming its control
 *     points, EXACTLY. (It does not apply to an elliptical arc's flags at
 *     all, which is the real reason arcs are converted rather than carried.)
 *   - bounds are the endpoints plus the derivative roots, exactly, with no
 *     flattening and no tolerance to choose.
 *
 * Curves are never flattened to polylines. A flattened curve is a decision
 * about resolution baked in at import time, and the renderer's `Path2D` can
 * draw the real thing.
 *
 * Pure: no DOM, no `eval`, no fs. A film is data (see `driver.js` for the
 * same argument about expressions).
 */

/**
 * `d` -> [[cmd, ...numbers], ...], still in the author's own commands.
 *
 * SVG number syntax is its own small language: `1.5.5` is two numbers,
 * `1e-3` is one, a minus sign starts a number without a separator, and an
 * arc's two flags are single digits that may be written with no delimiter at
 * all (`a5 5 0 015 5`). A naive split on whitespace and commas gets every one
 * of those wrong, silently, by producing a path that is merely a different
 * shape.
 */
const CMD_ARGS = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
const NUM = /[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/y;

export function tokenizePath(d) {
    const out = [];
    const s = String(d ?? '');
    let i = 0;
    const ws = () => { while (i < s.length && (s[i] === ' ' || s[i] === ',' || s[i] === '\t'
                                               || s[i] === '\n' || s[i] === '\r')) i++; };
    const num = () => {
        ws();
        NUM.lastIndex = i;
        const m = NUM.exec(s);
        if (!m || m.index !== i) return null;
        i = NUM.lastIndex;
        return Number(m[0]);
    };
    // An arc flag is exactly one character, '0' or '1', and may be followed
    // immediately by the next number with no separator.
    const flag = () => { ws(); const c = s[i]; if (c !== '0' && c !== '1') return null; i++; return +c; };

    let cmd = null;
    while (i < s.length) {
        ws();
        if (i >= s.length) break;
        const c = s[i];
        if (/[a-zA-Z]/.test(c)) {
            if (CMD_ARGS[c.toUpperCase()] === undefined) return out;   // unknown command: stop
            cmd = c; i++;
        } else if (cmd === null) {
            return out;                                                 // numbers before any command
        } else if (cmd === 'M') {
            cmd = 'L';                                                  // implicit lineto after moveto
        } else if (cmd === 'm') {
            cmd = 'l';
        }
        const up = cmd.toUpperCase();
        const n = CMD_ARGS[up];
        if (n === 0) { out.push([cmd]); continue; }
        const args = [];
        for (let k = 0; k < n; k++) {
            // An arc's 4th and 5th arguments are flags, not numbers.
            const v = (up === 'A' && (k === 3 || k === 4)) ? flag() : num();
            if (v === null) return out;                                 // ran out mid-command
            args.push(v);
        }
        out.push([cmd, ...args]);
    }
    return out;
}

const rel = (c) => c === c.toLowerCase();

/**
 * Tokens -> absolute `M` / `L` / `C` / `Z` segments.
 *
 * `Z` keeps its own segment because a closed subpath strokes its join and an
 * open one does not, and because the pen returns to the subpath's start --
 * which the next relative command is measured from.
 */
export function normalizePath(d) {
    const toks = Array.isArray(d) ? d : tokenizePath(d);
    const segs = [];
    let x = 0, y = 0;          // current point
    let sx = 0, sy = 0;        // subpath start
    let px = null, py = null;  // previous cubic control, for S
    let qx = null, qy = null;  // previous quadratic control, for T

    const cubic = (x1, y1, x2, y2, ex, ey) => {
        segs.push(['C', x1, y1, x2, y2, ex, ey]);
        px = x2; py = y2; qx = null; qy = null;
        x = ex; y = ey;
    };
    const quadAsCubic = (cx, cy, ex, ey) => {
        // A quadratic is a cubic whose controls sit two thirds of the way
        // out. Exact, not an approximation.
        const x1 = x + (2 / 3) * (cx - x), y1 = y + (2 / 3) * (cy - y);
        const x2 = ex + (2 / 3) * (cx - ex), y2 = ey + (2 / 3) * (cy - ey);
        segs.push(['C', x1, y1, x2, y2, ex, ey]);
        qx = cx; qy = cy; px = null; py = null;
        x = ex; y = ey;
    };

    for (const [c, ...a] of toks) {
        const r = rel(c);
        const up = c.toUpperCase();
        const ox = r ? x : 0, oy = r ? y : 0;
        switch (up) {
            case 'M':
                x = a[0] + ox; y = a[1] + oy; sx = x; sy = y;
                segs.push(['M', x, y]); px = py = qx = qy = null;
                break;
            case 'L':
                x = a[0] + ox; y = a[1] + oy;
                segs.push(['L', x, y]); px = py = qx = qy = null;
                break;
            case 'H':
                x = a[0] + ox;
                segs.push(['L', x, y]); px = py = qx = qy = null;
                break;
            case 'V':
                y = a[0] + oy;
                segs.push(['L', x, y]); px = py = qx = qy = null;
                break;
            case 'C':
                cubic(a[0] + ox, a[1] + oy, a[2] + ox, a[3] + oy, a[4] + ox, a[5] + oy);
                break;
            case 'S': {
                // The reflected control point, or the current point when the
                // previous command was not a cubic. Getting this wrong puts
                // a kink in every smooth curve in the file.
                const rx = px == null ? x : 2 * x - px;
                const ry = py == null ? y : 2 * y - py;
                cubic(rx, ry, a[0] + ox, a[1] + oy, a[2] + ox, a[3] + oy);
                break;
            }
            case 'Q':
                quadAsCubic(a[0] + ox, a[1] + oy, a[2] + ox, a[3] + oy);
                break;
            case 'T': {
                const rx = qx == null ? x : 2 * x - qx;
                const ry = qy == null ? y : 2 * y - qy;
                quadAsCubic(rx, ry, a[0] + ox, a[1] + oy);
                break;
            }
            case 'A': {
                const ex = a[5] + ox, ey = a[6] + oy;
                for (const seg of arcToCubics(x, y, a[0], a[1], a[2], a[3], a[4], ex, ey)) {
                    segs.push(seg);
                }
                x = ex; y = ey; px = py = qx = qy = null;
                break;
            }
            case 'Z':
                segs.push(['Z']);
                x = sx; y = sy; px = py = qx = qy = null;
                break;
            default: break;
        }
    }
    return segs;
}

/**
 * An elliptical arc as up to four cubics, within about 1e-4 of the true arc.
 *
 * The endpoint parameterisation SVG uses has to be turned into a centre
 * parameterisation first; this is the conversion from the specification's
 * appendix, including the radius correction for an arc too small to reach
 * its own endpoint, which real files contain.
 */
export function arcToCubics(x1, y1, rx, ry, rotDeg, largeArc, sweep, x2, y2) {
    if (!rx || !ry) return [['L', x2, y2]];
    if (x1 === x2 && y1 === y2) return [];
    rx = Math.abs(rx); ry = Math.abs(ry);
    const phi = (rotDeg * Math.PI) / 180;
    const cos = Math.cos(phi), sin = Math.sin(phi);
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
    const x1p = cos * dx + sin * dy;
    const y1p = -sin * dx + cos * dy;

    // Out-of-range radii are scaled up until the arc fits, per the spec.
    const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lambda > 1) { const k = Math.sqrt(lambda); rx *= k; ry *= k; }

    const sq = Math.max(0, (rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p)
        / (rx * rx * y1p * y1p + ry * ry * x1p * x1p));
    const coef = (largeArc === sweep ? -1 : 1) * Math.sqrt(sq);
    const cxp = coef * ((rx * y1p) / ry);
    const cyp = coef * -((ry * x1p) / rx);
    const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
    const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;

    const ang = (ux, uy, vx, vy) => {
        const d = Math.hypot(ux, uy) * Math.hypot(vx, vy);
        let a = Math.acos(Math.min(1, Math.max(-1, (ux * vx + uy * vy) / (d || 1))));
        if (ux * vy - uy * vx < 0) a = -a;
        return a;
    };
    const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!sweep && dt > 0) dt -= 2 * Math.PI;
    if (sweep && dt < 0) dt += 2 * Math.PI;

    // A quarter turn per cubic: the classic magic-number approximation is
    // accurate to ~1e-4 of the radius over 90 degrees and degrades fast past it.
    const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2)));
    const step = dt / n;
    const k = (4 / 3) * Math.tan(step / 4);
    const out = [];
    let a0 = t1;
    for (let i = 0; i < n; i++) {
        const a1 = a0 + step;
        const [px0, py0] = onEllipse(cx, cy, rx, ry, cos, sin, a0);
        const [px1, py1] = onEllipse(cx, cy, rx, ry, cos, sin, a1);
        const [dx0, dy0] = ellipseTangent(rx, ry, cos, sin, a0);
        const [dx1, dy1] = ellipseTangent(rx, ry, cos, sin, a1);
        out.push(['C', px0 + k * dx0, py0 + k * dy0, px1 - k * dx1, py1 - k * dy1, px1, py1]);
        a0 = a1;
    }
    return out;
}

function onEllipse(cx, cy, rx, ry, cos, sin, t) {
    const c = Math.cos(t), s = Math.sin(t);
    return [cx + rx * c * cos - ry * s * sin, cy + rx * c * sin + ry * s * cos];
}
function ellipseTangent(rx, ry, cos, sin, t) {
    const c = Math.cos(t), s = Math.sin(t);
    return [-rx * s * cos - ry * c * sin, -rx * s * sin + ry * c * cos];
}

// ------------------------------------------------------------------ matrices

/** [a, b, c, d, e, f], the same six numbers SVG's `matrix()` takes. */
export const IDENTITY = [1, 0, 0, 1, 0, 0];

export function multiply(m, n) {
    return [
        m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
        m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
        m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
    ];
}

export const applyMatrix = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/**
 * An SVG `transform` attribute -> one matrix.
 *
 * Parsed, not evaluated, and the list composes LEFT TO RIGHT the way SVG
 * says: `translate(10,0) scale(2)` scales first and then translates, which
 * is the opposite of reading it as function application.
 */
export function parseTransform(str) {
    let m = IDENTITY;
    if (!str) return m;
    const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
    let hit;
    while ((hit = re.exec(str))) {
        const a = hit[2].split(/[\s,]+/).filter(Boolean).map(Number);
        if (a.some((n) => !Number.isFinite(n))) continue;
        let t = IDENTITY;
        switch (hit[1]) {
            case 'matrix': if (a.length === 6) t = a; break;
            case 'translate': t = [1, 0, 0, 1, a[0] ?? 0, a[1] ?? 0]; break;
            case 'scale': t = [a[0] ?? 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0]; break;
            case 'rotate': {
                const r = ((a[0] ?? 0) * Math.PI) / 180;
                const c = Math.cos(r), s = Math.sin(r);
                t = [c, s, -s, c, 0, 0];
                if (a.length >= 3) {
                    t = multiply(multiply([1, 0, 0, 1, a[1], a[2]], t), [1, 0, 0, 1, -a[1], -a[2]]);
                }
                break;
            }
            case 'skewX': t = [1, 0, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 1, 0, 0]; break;
            case 'skewY': t = [1, Math.tan(((a[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0]; break;
            default: break;
        }
        m = multiply(m, t);
    }
    return m;
}

/**
 * Transform normalised segments. Exact: an affine map takes a cubic's control
 * points to the transformed cubic's control points, with no resampling.
 */
export function transformPath(segs, m) {
    if (m === IDENTITY) return segs;
    return segs.map((s) => {
        if (s[0] === 'Z') return s;
        const out = [s[0]];
        for (let i = 1; i < s.length; i += 2) {
            const [x, y] = applyMatrix(m, s[i], s[i + 1]);
            out.push(x, y);
        }
        return out;
    });
}

// -------------------------------------------------------------------- bounds

/**
 * Exact bounds of normalised segments.
 *
 * The one this replaces read `d` as a flat list of number PAIRS, which is
 * right for `M`/`L` and wrong for everything else: an arc's seven arguments
 * are not coordinates, a relative command's numbers are deltas, and a
 * cubic's bulge lies off its control points entirely. So a path authored
 * with relative commands reported a box that was not around it, and that box
 * is what every framing check in the 2D path measures against.
 */
export function pathBounds(segs) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const hit = (x, y) => {
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
    };
    let cx = 0, cy = 0;
    for (const s of segs) {
        if (s[0] === 'Z') continue;
        if (s[0] === 'C') {
            hit(s[5], s[6]);
            for (const t of cubicExtrema(cx, s[1], s[3], s[5])) hit(...cubicAt(cx, cy, s, t));
            for (const t of cubicExtrema(cy, s[2], s[4], s[6])) hit(...cubicAt(cx, cy, s, t));
            cx = s[5]; cy = s[6];
        } else {
            hit(s[1], s[2]);
            cx = s[1]; cy = s[2];
        }
    }
    if (!Number.isFinite(x0)) return null;
    return { left: x0, top: y0, right: x1, bottom: y1,
             width: x1 - x0, height: y1 - y0 };
}

/** Where a cubic's derivative vanishes on one axis, inside (0, 1). */
function cubicExtrema(p0, p1, p2, p3) {
    const a = -p0 + 3 * p1 - 3 * p2 + p3;
    const b = 2 * (p0 - 2 * p1 + p2);
    const c = p1 - p0;
    const out = [];
    const push = (t) => { if (t > 0 && t < 1) out.push(t); };
    if (Math.abs(a) < 1e-12) { if (Math.abs(b) > 1e-12) push(-c / b); return out; }
    const disc = b * b - 4 * a * c;
    if (disc < 0) return out;
    const r = Math.sqrt(disc);
    push((-b + r) / (2 * a));
    push((-b - r) / (2 * a));
    return out;
}

function cubicAt(cx, cy, s, t) {
    const u = 1 - t;
    const w = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
    return [w[0] * cx + w[1] * s[1] + w[2] * s[3] + w[3] * s[5],
            w[0] * cy + w[1] * s[2] + w[2] * s[4] + w[3] * s[6]];
}

// --------------------------------------------------------------- serialising

/**
 * Segments -> a `d` string, rounded.
 *
 * Rounding is not cosmetic. A film is JSON that gets read, diffed and
 * committed, and an importer that writes 17 significant figures per
 * coordinate turns a 40 KB logo into 400 KB of noise. Three decimals is a
 * thousandth of a pixel.
 */
export function toPathData(segs, decimals = 3) {
    const f = (n) => {
        const v = +n.toFixed(decimals);
        return Object.is(v, -0) ? '0' : String(v);
    };
    const out = [];
    for (const s of segs) {
        if (s[0] === 'Z') { out.push('Z'); continue; }
        out.push(s[0] + s.slice(1).map(f).join(' '));
    }
    return out.join(' ');
}
