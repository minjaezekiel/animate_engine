/**
 * The stroke model: a polyline of pressure samples, resampled into stamps.
 *
 * # What a stroke is
 *
 * ```js
 * const stroke = {
 *     points: [{ x, y, p }],   // p = pressure, 0..1 (defaults to 1)
 *     brush: 'ink',            // a name in ./brushes.js
 *     size: 24,                // base diameter, px
 *     color: '#1a1a1a',
 *     opacity: 1,
 *     seed: 0,                 // for a brush with jitter
 * };
 * ```
 *
 * Input points, pressure, and the *authored* intent. Everything else --
 * where the dabs land, how big each is, how hard it presses -- is derived.
 *
 * # Why the stamp buffer is computed once and only `count` varies
 *
 * This is the design decision the whole file turns on.
 *
 * [`resampleStroke`] walks the polyline by arc length and emits one
 * `[x, y, radius, flow]` quad per dab, in order from the start. Because
 * the walk is from the start, **the first N stamps of a stroke are exactly
 * the first N stamps of that same stroke at any other length.** So a
 * partially drawn stroke is a *prefix*, not a different computation.
 *
 * That is what makes a draw-on animation free. Frame N renders by stamping
 * the first `stampCountAt(progress)` quads of a buffer computed once, so:
 *
 *   - frame N is a pure function of N, with no history buffer and no
 *     accumulation between frames, which is the engine's core contract;
 *   - scrubbing backwards costs the same as forwards;
 *   - the reveal is driven by an ordinary number channel, so every easing,
 *     clip, mask and additive layer the animation system already has
 *     applies to it with no new concept.
 *
 * Note that taper is computed against the **full** stroke length, not the
 * revealed length. A draw-on reveals a finished stroke progressively, so
 * its tail should narrow where the stroke truly ends -- not chase the
 * reveal, which would read as a stroke being pushed rather than uncovered.
 *
 * # Determinism
 *
 * No clock, no `Math.random`. Jitter comes from a hash of the stamp index
 * and the stroke's `seed`, so the same stroke always produces the same
 * dabs on every machine and every run.
 */

/**
 * Hash an integer to a well-distributed `u32`.
 *
 * The same construction as `core/anim/particles.js`, and for the same
 * reason: jitter must be reproducible from an index rather than drawn from
 * a stream, so that any stamp can be evaluated without having evaluated
 * the ones before it.
 */
function hash(n) {
    let x = n | 0;
    x = (x ^ 61) ^ (x >>> 16);
    x = (x + (x << 3)) | 0;
    x ^= x >>> 4;
    x = Math.imul(x, 0x27d4eb2d);
    x ^= x >>> 15;
    return x >>> 0;
}

/** A deterministic value in `[0, 1)` for stamp `i`, channel `k`. */
const rand = (seed, i, k) => hash(seed * 7919 + i * 131 + k * 2654435761) / 4294967296;

/**
 * Cumulative arc length along the point list.
 *
 * Returns `length[i]`, the distance from the first point to point `i`, so
 * `length[length.length - 1]` is the total. One pass, reused by the
 * resampler for both walking and taper.
 */
export function arcLengths(points) {
    const out = new Float64Array(points.length);
    for (let i = 1; i < points.length; i++) {
        const dx = points[i].x - points[i - 1].x;
        const dy = points[i].y - points[i - 1].y;
        out[i] = out[i - 1] + Math.hypot(dx, dy);
    }
    return out;
}

/** Total arc length of a stroke's points. */
export function strokeLength(points) {
    const l = arcLengths(points);
    return l.length ? l[l.length - 1] : 0;
}

/**
 * Smooth input points with a weighted moving average.
 *
 * Raw pointer input is jittery at a scale the brush will faithfully
 * reproduce as a wobble, so every drawing tool stabilises it. `amount` is
 * 0..1 and `passes` repeats the filter for stronger smoothing.
 *
 * Endpoints are held fixed. A stroke that starts or ends somewhere other
 * than where the hand did is worse than a slightly rough one, and for a
 * closed shape it leaves a visible gap at the join.
 *
 * # Why `amount` maps to a half-weight kernel
 *
 * The filter is `out = (1 - k)·cur + (k/2)·prev + (k/2)·next`. Applied to
 * an alternating signal -- which is exactly what per-sample input jitter
 * looks like -- its gain is `|1 - 2k|`. That is **not monotonic in `k`**:
 *
 * | k | gain at the jitter frequency |
 * |---|---|
 * | 0.25 | 0.50 |
 * | **0.50** | **0.00** |
 * | 0.75 | 0.50 |
 * | 1.00 | **1.00** |
 *
 * So passing the raw `amount` straight through as `k` would make
 * *maximum* smoothing attenuate nothing at all -- it would merely invert
 * the wobble's phase and leave its amplitude intact. A smoothing control
 * that does nothing at the top of its range is a genuinely confusing tool.
 *
 * `amount` therefore maps to `k = amount / 2`, so `amount = 1` is the
 * `[0.25, 0.5, 0.25]` kernel, which nulls that frequency exactly and is
 * the standard three-tap smoother. Stronger smoothing comes from
 * `passes`, which widens the kernel rather than pushing a single pass
 * into its non-monotonic region. On real broadband input that is
 * monotonic and effective -- measured, mean roughness falls 3.68 to 0.84
 * at one pass and 0.09 at eight.
 *
 * One caveat on `passes`, since it looks like a defect when first met: on
 * a signal whose jitter is *exactly* at the alternating frequency, one
 * pass at `amount = 1` nulls it completely, and further passes then make
 * the result slightly rougher rather than smoother. That is the fixed
 * endpoints at work -- they are the one place the filter cannot smooth, so
 * each extra pass diffuses their influence a little further inward. Real
 * input is broadband and does not show it.
 */
export function smoothPoints(points, amount = 0.5, passes = 1) {
    if (amount <= 0 || points.length < 3) return points;
    const k = Math.min(1, amount) / 2;
    let current = points;
    for (let pass = 0; pass < Math.max(1, passes); pass++) {
        const out = [current[0]];
        for (let i = 1; i < current.length - 1; i++) {
            const prev = current[i - 1], cur = current[i], next = current[i + 1];
            out.push({
                ...cur,
                x: (1 - k) * cur.x + (k / 2) * (prev.x + next.x),
                y: (1 - k) * cur.y + (k / 2) * (prev.y + next.y),
            });
        }
        out.push(current[current.length - 1]);
        current = out;
    }
    return current;
}

/**
 * Estimate pressure from how fast the stroke was drawn.
 *
 * A mouse has no pressure, and an agent writing a film has no hand. Both
 * still want strokes that thin out where the line moves quickly, which is
 * what a real pen does because there is less time to deposit ink.
 *
 * `points` must carry `t` in milliseconds. Speed is measured per segment
 * and mapped through `fast`, the speed in px/ms at which pressure reaches
 * its minimum. Output is written to `p` and the input is not mutated.
 *
 * Offered as a helper rather than built into the resampler because it is a
 * guess about intent, and an authored stroke that set `p` deliberately
 * must keep it.
 */
export function pressureFromVelocity(points, { fast = 2.5, min = 0.35 } = {}) {
    if (points.length < 2) return points.map((q) => ({ ...q, p: 1 }));
    const out = [];
    for (let i = 0; i < points.length; i++) {
        const a = points[Math.max(0, i - 1)];
        const b = points[Math.min(points.length - 1, i + 1)];
        const dt = Math.max(1e-3, (b.t ?? 0) - (a.t ?? 0));
        const speed = Math.hypot(b.x - a.x, b.y - a.y) / dt;
        const slow = 1 - Math.min(1, speed / fast);
        out.push({ ...points[i], p: min + (1 - min) * slow });
    }
    return out;
}

/**
 * Resample a stroke into `[x, y, radius, flow]` stamp quads.
 *
 * Returns `{ stamps, count, length }`, where `stamps` is a `Float32Array`
 * of `4 * count` values ready to hand straight to `Kernels.stampMask`.
 *
 * # Spacing
 *
 * Dabs are placed every `brush.spacing * diameter` along the arc, which is
 * how every stamp-based brush works and why the spacing is expressed as a
 * fraction of size rather than in pixels: a brush must not become dotted
 * when scaled up. Spacing is also floored at a fraction of a pixel, or a
 * very small brush would ask for an unbounded number of dabs.
 *
 * Because the step depends on the diameter and the diameter depends on
 * pressure, the walk advances using the diameter *at the current
 * position*. A stroke that thins out therefore places dabs closer together
 * as it narrows, which is correct: spacing is relative to the mark being
 * made.
 *
 * # A single point is a dab, not nothing
 *
 * A tap has zero arc length. Returning no stamps for it would make a
 * click deposit no ink, which every user reads as a broken tool, so a
 * degenerate stroke emits exactly one stamp at its own position.
 */
export function resampleStroke(stroke, brush) {
    const points = stroke.points ?? [];
    if (points.length === 0) return { stamps: new Float32Array(0), count: 0, length: 0 };

    const size = Math.max(0.1, stroke.size ?? brush.size ?? 16);
    const lengths = arcLengths(points);
    const total = lengths[lengths.length - 1];

    const quads = [];
    const push = (x, y, s, i) => {
        // Pressure drives diameter through a curve, so a brush can be made
        // to respond gently (exponent > 1) or sharply (< 1).
        const pressure = Math.min(1, Math.max(0, s));
        const sizeF = brush.minSize + (1 - brush.minSize) * pressure ** brush.sizeCurve;
        const flowF = brush.minFlow + (1 - brush.minFlow) * pressure ** brush.flowCurve;

        let diameter = size * sizeF * taperAt(i, total, size, brush);
        let flow = brush.flow * flowF;

        if (brush.jitterSize > 0) {
            diameter *= 1 - brush.jitterSize * rand(stroke.seed ?? 0, quads.length, 1);
        }
        let jx = 0, jy = 0;
        if (brush.jitterPos > 0) {
            const r = brush.jitterPos * size * 0.5;
            jx = (rand(stroke.seed ?? 0, quads.length, 2) * 2 - 1) * r;
            jy = (rand(stroke.seed ?? 0, quads.length, 3) * 2 - 1) * r;
        }
        if (brush.jitterFlow > 0) {
            flow *= 1 - brush.jitterFlow * rand(stroke.seed ?? 0, quads.length, 4);
        }

        const radius = Math.max(0.05, diameter * 0.5);
        if (flow > 0) quads.push(x + jx, y + jy, radius, Math.min(1, flow));
    };

    if (total <= 1e-9) {
        // A tap must leave a mark.
        push(points[0].x, points[0].y, points[0].p ?? 1, 0);
        return { stamps: Float32Array.from(quads), count: quads.length / 4, length: 0 };
    }

    let travelled = 0;
    let segment = 1;
    const limit = Math.ceil(total / Math.max(0.05, brush.spacing * size * brush.minSize)) + 8;

    while (travelled <= total && quads.length / 4 < limit) {
        while (segment < points.length - 1 && lengths[segment] < travelled) segment++;
        const a = points[segment - 1], b = points[segment];
        const span = lengths[segment] - lengths[segment - 1];
        const t = span > 1e-9 ? (travelled - lengths[segment - 1]) / span : 0;
        const tc = Math.min(1, Math.max(0, t));

        const x = a.x + (b.x - a.x) * tc;
        const y = a.y + (b.y - a.y) * tc;
        const p = (a.p ?? 1) + ((b.p ?? 1) - (a.p ?? 1)) * tc;
        push(x, y, p, travelled);

        // Step by the mark being made here, not by the nominal size.
        const localSize = Math.max(
            size * brush.minSize,
            size * (brush.minSize + (1 - brush.minSize) * Math.min(1, Math.max(0, p)) ** brush.sizeCurve),
        );
        travelled += Math.max(0.35, brush.spacing * localSize);
    }

    return { stamps: Float32Array.from(quads), count: quads.length / 4, length: total };
}

/**
 * Taper factor at arc position `at` along a stroke of length `total`.
 *
 * Both ends narrow over `brush.taper * size` pixels. A real pen leaves a
 * thin entry and exit because the nib is still landing and already
 * lifting; a brush without it produces strokes that start and stop with
 * blunt round caps, which is the single clearest giveaway of a synthetic
 * line.
 *
 * The taper length is clamped to a third of the stroke, so a short stroke
 * tapers proportionally instead of vanishing entirely.
 */
function taperAt(at, total, size, brush) {
    if (brush.taper <= 0 || total <= 0) return 1;
    const span = Math.min(brush.taper * size, total / 3);
    if (span <= 1e-9) return 1;
    const fromStart = Math.min(1, at / span);
    const fromEnd = Math.min(1, (total - at) / span);
    const t = Math.min(fromStart, fromEnd);
    // Eased rather than linear: a linear taper reads as a wedge.
    return brush.taperMin + (1 - brush.taperMin) * (t * t * (3 - 2 * t));
}

/**
 * How many stamps of a resampled stroke are visible at `progress` (0..1).
 *
 * This is the draw-on animation, and it is the entire mechanism: the stamp
 * buffer is computed once, and a frame renders a prefix of it. Driving
 * `progress` from a number track gives the reveal every easing and
 * layering feature the animation system already has.
 *
 * `progress` is clamped, so a track that overshoots past 1 -- which an
 * anticipation or overshoot ease will do deliberately -- reveals the whole
 * stroke rather than reading past the buffer.
 */
export function stampCountAt(resampled, progress) {
    const p = Math.min(1, Math.max(0, progress));
    if (p >= 1) return resampled.count;
    return Math.floor(resampled.count * p);
}
