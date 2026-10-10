/**
 * SVG path data to stroke points.
 *
 * ```js
 * draw({ path: 'M 20 100 C 80 20, 200 20, 260 100', brush: 'ink' })
 * ```
 *
 * # Why this is the most important ergonomic decision in the paint layer
 *
 * Without it, drawing anything means emitting a list of coordinates — two
 * hundred of them for a curve. That is miserable to write by hand, and for
 * a language model it is worse than miserable: it is a long run of
 * unstructured numbers with no redundancy, exactly the shape of output
 * that drifts.
 *
 * SVG path data is the opposite. It is compact, it is the most widely
 * published vector notation there is, and any model that has seen the web
 * can write it fluently. One line produces a curve that would otherwise be
 * two hundred coordinates, and the intent stays legible in the source.
 *
 * So a stroke may give `points` *or* `path`, and `path` is the one anybody
 * — human or agent — should normally reach for.
 *
 * # Supported commands
 *
 * `M m L l H h V v C c S s Q q T t Z z`, absolute and relative.
 *
 * **Arcs (`A`/`a`) are not supported** and raise a diagnostic naming the
 * command. They need endpoint-to-centre parameterisation, which is a
 * disproportionate amount of code for a notation that is rare in
 * hand-authored path data, and the shapes people actually want them for
 * are covered by [`circlePath`] and [`rectPath`].
 */

/** Points per unit of estimated curve length. Smaller is smoother and slower. */
const DEFAULT_TOLERANCE = 3;

/**
 * Parse SVG path data into one or more point runs.
 *
 * Returns an array of runs, because a path may contain several subpaths —
 * `M ... M ...` — and each is a separate stroke. Joining them would draw a
 * line between the end of one and the start of the next, which is the
 * classic artefact of flattening a multi-subpath glyph naively.
 *
 * @param {string} d
 * @param {object} [options]
 * @param {number} [options.tolerance=3] approximate pixels per sample on curves
 * @param {number[]} [options.pressure]  `[start, end]`, ramped along each run
 * @param {Array} [options.diagnostics]  unsupported commands are pushed here
 * @returns {Array<Array<{x: number, y: number, p: number}>>}
 */
export function pathToRuns(d, { tolerance = DEFAULT_TOLERANCE, pressure, diagnostics } = {}) {
    const tokens = tokenize(String(d ?? ''));
    const runs = [];
    let run = [];

    let x = 0, y = 0;            // current point
    let startX = 0, startY = 0;  // subpath start, for Z
    let lastC = null;            // last cubic control, for S
    let lastQ = null;            // last quadratic control, for T

    const moveTo = (nx, ny) => {
        if (run.length > 1) runs.push(run);
        run = [{ x: nx, y: ny }];
        x = nx; y = ny; startX = nx; startY = ny;
    };
    const lineTo = (nx, ny) => { run.push({ x: nx, y: ny }); x = nx; y = ny; };

    /** Flatten a cubic by sampling; the sample count follows the control polygon. */
    const cubicTo = (x1, y1, x2, y2, nx, ny) => {
        const n = samples(
            Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(nx - x2, ny - y2),
            tolerance);
        for (let i = 1; i <= n; i++) {
            const t = i / n, u = 1 - t;
            run.push({
                x: u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * nx,
                y: u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ny,
            });
        }
        lastC = [x2, y2]; lastQ = null;
        x = nx; y = ny;
    };
    const quadTo = (x1, y1, nx, ny) => {
        const n = samples(Math.hypot(x1 - x, y1 - y) + Math.hypot(nx - x1, ny - y1), tolerance);
        for (let i = 1; i <= n; i++) {
            const t = i / n, u = 1 - t;
            run.push({
                x: u * u * x + 2 * u * t * x1 + t * t * nx,
                y: u * u * y + 2 * u * t * y1 + t * t * ny,
            });
        }
        lastQ = [x1, y1]; lastC = null;
        x = nx; y = ny;
    };

    let i = 0;
    let command = '';
    while (i < tokens.length) {
        if (typeof tokens[i] === 'string') { command = tokens[i]; i++; }
        const rel = command === command.toLowerCase();
        const up = command.toUpperCase();
        const num = () => tokens[i++];
        const ox = rel ? x : 0, oy = rel ? y : 0;

        switch (up) {
            case 'M': {
                moveTo(num() + ox, num() + oy);
                // Per the SVG grammar, extra coordinate pairs after an M
                // are implicit L commands -- and a relative m makes them
                // implicit l, not l-from-the-original-point.
                command = rel ? 'l' : 'L';
                break;
            }
            case 'L': lineTo(num() + ox, num() + oy); break;
            case 'H': lineTo(num() + ox, y); break;
            case 'V': lineTo(x, num() + oy); break;
            case 'C': {
                const x1 = num() + ox, y1 = num() + oy;
                const x2 = num() + ox, y2 = num() + oy;
                cubicTo(x1, y1, x2, y2, num() + ox, num() + oy);
                break;
            }
            case 'S': {
                // The first control is the reflection of the previous
                // cubic's second control. With no previous cubic it
                // coincides with the current point, per the spec.
                const rx = lastC ? 2 * x - lastC[0] : x;
                const ry = lastC ? 2 * y - lastC[1] : y;
                const x2 = num() + ox, y2 = num() + oy;
                cubicTo(rx, ry, x2, y2, num() + ox, num() + oy);
                break;
            }
            case 'Q': {
                const x1 = num() + ox, y1 = num() + oy;
                quadTo(x1, y1, num() + ox, num() + oy);
                break;
            }
            case 'T': {
                const rx = lastQ ? 2 * x - lastQ[0] : x;
                const ry = lastQ ? 2 * y - lastQ[1] : y;
                quadTo(rx, ry, num() + ox, num() + oy);
                break;
            }
            case 'Z':
                lineTo(startX, startY);
                if (run.length > 1) runs.push(run);
                run = [{ x: startX, y: startY }];
                lastC = null; lastQ = null;
                break;
            case 'A':
                diagnostics?.push({
                    severity: 'warning',
                    message: 'path command "A" (elliptical arc) is not supported; '
                        + 'use circlePath()/rectPath() or approximate with C',
                });
                // Consume the arc's seven parameters and continue, so one
                // unsupported command does not desynchronise the rest.
                for (let k = 0; k < 7; k++) num();
                x = tokens[i - 2] ?? x; y = tokens[i - 1] ?? y;
                break;
            default:
                diagnostics?.push({
                    severity: 'warning',
                    message: `unknown path command "${command}"`,
                });
                i++;
                break;
        }
        if (up !== 'C') lastC = up === 'S' ? lastC : null;
        if (up !== 'Q') lastQ = up === 'T' ? lastQ : null;
    }
    if (run.length > 1) runs.push(run);

    return runs.map((r) => withPressure(r, pressure));
}

/**
 * Parse a path into a single point run, joining subpaths.
 *
 * The convenience form, for the common case of one continuous shape. It
 * returns the *first* subpath rather than concatenating, because
 * concatenating would draw a connecting line that was never in the path.
 */
export function pathToPoints(d, options) {
    const runs = pathToRuns(d, options);
    return runs.length ? runs[0] : [];
}

/** Ramp pressure across a run, or set it flat at 1. */
function withPressure(run, pressure) {
    if (!pressure) return run.map((q) => ({ ...q, p: q.p ?? 1 }));
    const [from, to] = Array.isArray(pressure) ? pressure : [pressure, pressure];
    const last = Math.max(1, run.length - 1);
    return run.map((q, i) => ({ ...q, p: from + (to - from) * (i / last) }));
}

/** Sample count for a curve of approximately `length` pixels. */
function samples(length, tolerance) {
    return Math.max(2, Math.min(240, Math.ceil(length / Math.max(0.25, tolerance))));
}

/**
 * Split path data into numbers and command letters.
 *
 * Handles the compact forms real path data uses and that a naive
 * whitespace split breaks on: no separator before a minus sign
 * (`10-20`), exponents (`1e-3`), and a leading decimal point with no
 * zero (`.5.5`, which is two numbers).
 */
function tokenize(d) {
    const out = [];
    const re = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)/g;
    let m;
    while ((m = re.exec(d)) !== null) {
        if (m[1]) out.push(m[1]);
        else out.push(parseFloat(m[2]));
    }
    return out;
}

/**
 * Path data for a circle, as four cubic béziers.
 *
 * `0.5522847498` is the standard constant `4/3·(√2 − 1)`: the control-point
 * offset at which a cubic matches a quarter circle to within about one
 * part in two thousand, which is far below a pixel at any size a brush
 * will draw.
 */
export function circlePath(cx, cy, r) {
    const k = r * 0.5522847498307936;
    return `M ${cx} ${cy - r} `
        + `C ${cx + k} ${cy - r}, ${cx + r} ${cy - k}, ${cx + r} ${cy} `
        + `C ${cx + r} ${cy + k}, ${cx + k} ${cy + r}, ${cx} ${cy + r} `
        + `C ${cx - k} ${cy + r}, ${cx - r} ${cy + k}, ${cx - r} ${cy} `
        + `C ${cx - r} ${cy - k}, ${cx - k} ${cy - r}, ${cx} ${cy - r} Z`;
}

/** Path data for a rectangle. */
export function rectPath(x, y, w, h) {
    return `M ${x} ${y} L ${x + w} ${y} L ${x + w} ${y + h} L ${x} ${y + h} Z`;
}
