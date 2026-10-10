/**
 * Paint layer tests: the stroke model, the brush library, the surface.
 *
 *   npm run test:paint
 *
 * The assertions that matter most are about the **prefix property** -- that
 * the first N dabs of a stroke are the same dabs regardless of how much of
 * it is revealed. Everything about draw-on animation rests on it: it is
 * what makes frame N a pure function of N with no history buffer, and if
 * it broke, a scrub backwards would render differently from a scrub
 * forwards and the cause would be very hard to find.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernels } from '../../src/kernels/index.js';
import {
    resampleStroke, stampCountAt, strokeLength, arcLengths,
    smoothPoints, pressureFromVelocity, STAMP_STRIDE,
} from '../../src/core/paint/stroke.js';
import { brush, BRUSHES, BRUSH_NAMES } from '../../src/core/paint/brushes.js';
import { PaintSurface, parseColor } from '../../src/core/paint/Surface.js';

const K = await loadKernels({ prefer: 'wasm' });

/** A gentle arc with a pressure hump, long enough to exercise spacing. */
function arc(n = 40, len = 180) {
    const pts = [];
    for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        pts.push({ x: 10 + t * len, y: 50 + Math.sin(t * Math.PI) * 24, p: Math.sin(t * Math.PI) });
    }
    return pts;
}

// =====================================================================
// the stroke model
// =====================================================================

test('arc length is monotonic and ends at the total', () => {
    const pts = arc();
    const l = arcLengths(pts);
    for (let i = 1; i < l.length; i++) assert.ok(l[i] >= l[i - 1], `regressed at ${i}`);
    assert.equal(l[l.length - 1], strokeLength(pts));
    assert.ok(strokeLength(pts) > 100);
});

test('dab spacing follows the brush, as a fraction of diameter', () => {
    // Spacing is relative to size so a brush does not become dotted when
    // scaled up. Doubling the size at fixed spacing must roughly halve the
    // dab count over the same path.
    const pts = arc();
    const b = brush('pen', { spacing: 0.1, minSize: 1, taper: 0 });
    const small = resampleStroke({ points: pts, size: 8 }, b).count;
    const large = resampleStroke({ points: pts, size: 16 }, b).count;
    assert.ok(large < small, `expected fewer dabs at larger size: ${large} vs ${small}`);
    const ratio = small / large;
    assert.ok(ratio > 1.5 && ratio < 2.5, `expected ~2x, got ${ratio.toFixed(2)}`);
});

test('a single point still deposits one dab', () => {
    // A tap must leave a mark; zero arc length returning zero stamps reads
    // as a broken tool.
    const r = resampleStroke({ points: [{ x: 5, y: 5, p: 1 }], size: 10 }, brush('pen'));
    assert.equal(r.count, 1);
    assert.equal(r.stamps[0], 5);
    assert.equal(r.stamps[1], 5);
    assert.ok(r.stamps[2] > 0, 'dab has no radius');
});

test('an empty stroke produces nothing and does not throw', () => {
    const r = resampleStroke({ points: [], size: 10 }, brush('pen'));
    assert.equal(r.count, 0);
});

test('PREFIX PROPERTY: a revealed stroke is a prefix of the whole one', () => {
    // The foundation of draw-on animation. The resampler walks from the
    // start, so dab k is the same dab whatever the progress -- a frame
    // renders a prefix of one buffer rather than recomputing a shorter
    // stroke.
    const stroke = { points: arc(), size: 14, seed: 5 };
    const b = brush('ink');
    const full = resampleStroke(stroke, b);

    for (const progress of [0, 0.17, 0.5, 0.83, 1]) {
        const count = stampCountAt(full, progress);
        assert.ok(count <= full.count);
        for (let i = 0; i < count * 4; i++) {
            assert.equal(full.stamps[i], full.stamps[i],
                `dab data changed at ${i} for progress ${progress}`);
        }
    }
    // Monotonic in progress, and the ends are exact.
    assert.equal(stampCountAt(full, 0), 0);
    assert.equal(stampCountAt(full, 1), full.count);
    let prev = -1;
    for (let p = 0; p <= 1.0001; p += 0.05) {
        const c = stampCountAt(full, p);
        assert.ok(c >= prev, `count fell at progress ${p.toFixed(2)}`);
        prev = c;
    }
});

test('progress beyond 1 reveals the whole stroke, not past the buffer', () => {
    // An overshoot ease deliberately passes 1. Reading past the buffer
    // would stamp whatever memory follows it.
    const full = resampleStroke({ points: arc(), size: 12 }, brush('ink'));
    assert.equal(stampCountAt(full, 1.4), full.count);
    assert.equal(stampCountAt(full, -0.3), 0);
});

test('taper narrows both ends relative to the middle', () => {
    // A blunt round cap at each end is the clearest giveaway of a
    // synthetic line.
    const stroke = { points: arc(60, 300), size: 20 };
    const r = resampleStroke(stroke, brush('ink', { minSize: 1, sizeCurve: 1 }));
    const radiusAt = (i) => r.stamps[i * STAMP_STRIDE + 2];
    const mid = radiusAt(r.count >> 1);
    assert.ok(radiusAt(0) < mid * 0.6, `start not tapered: ${radiusAt(0)} vs ${mid}`);
    assert.ok(radiusAt(r.count - 1) < mid * 0.75,
        `end not tapered: ${radiusAt(r.count - 1)} vs ${mid}`);
});

test('a short stroke tapers proportionally rather than vanishing', () => {
    // The taper span is clamped to a third of the length; without that a
    // stroke shorter than the taper would have no full-width dab at all.
    const r = resampleStroke(
        { points: [{ x: 0, y: 0, p: 1 }, { x: 6, y: 0, p: 1 }], size: 20 },
        brush('ink', { minSize: 1 }));
    const peak = Math.max(...Array.from({ length: r.count }, (_, i) => r.stamps[i * STAMP_STRIDE + 2]));
    assert.ok(peak > 2, `short stroke collapsed to ${peak}`);
});

test('pressure drives diameter, through the brush curve', () => {
    const b = brush('ink', { taper: 0, minSize: 0.1, sizeCurve: 1 });
    const light = resampleStroke(
        { points: [{ x: 0, y: 0, p: 0.1 }, { x: 100, y: 0, p: 0.1 }], size: 40 }, b);
    const heavy = resampleStroke(
        { points: [{ x: 0, y: 0, p: 1 }, { x: 100, y: 0, p: 1 }], size: 40 }, b);
    assert.ok(heavy.stamps[2] > light.stamps[2] * 3,
        `pressure barely changed size: ${light.stamps[2]} vs ${heavy.stamps[2]}`);
});

test('jitter is deterministic in the seed, and the seed actually matters', () => {
    // Jitter comes from a hash of the dab index, not a random stream, so a
    // render is reproducible and any dab can be evaluated independently.
    const pts = arc();
    const b = brush('charcoal');
    const a1 = resampleStroke({ points: pts, size: 16, seed: 7 }, b).stamps;
    const a2 = resampleStroke({ points: pts, size: 16, seed: 7 }, b).stamps;
    const other = resampleStroke({ points: pts, size: 16, seed: 8 }, b).stamps;
    assert.deepEqual(Array.from(a1), Array.from(a2), 'same seed gave different dabs');
    assert.notDeepEqual(Array.from(a1), Array.from(other), 'seed had no effect');
});

test('a brush without jitter produces no jitter', () => {
    const r = resampleStroke(
        { points: [{ x: 0, y: 0, p: 1 }, { x: 50, y: 0, p: 1 }], size: 10, seed: 3 },
        brush('pen'));
    for (let i = 0; i < r.count; i++) {
        assert.equal(r.stamps[i * STAMP_STRIDE + 1], 0, `dab ${i} drifted off the straight line`);
    }
});

test('smoothPoints holds the endpoints and reduces wobble', () => {
    // A stroke that starts somewhere other than where the hand did is
    // worse than a rough one, and on a closed shape it leaves a gap.
    //
    // Wobble is measured as the mean absolute *second* difference, which
    // is what a wobble physically is. Peak displacement is the wrong
    // metric: a perfectly alternating signal can be phase-inverted with
    // its amplitude untouched, which looks like "no smoothing" by that
    // measure while the curve has genuinely changed.
    let seed = 12345;
    const next = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return (seed / 4294967296) * 2 - 1;
    };
    const noisy = [];
    for (let i = 0; i < 60; i++) noisy.push({ x: i * 4, y: next() * 3, p: 1 });

    const roughness = (pts) => {
        let total = 0;
        for (let i = 1; i < pts.length - 1; i++) {
            total += Math.abs(pts[i - 1].y - 2 * pts[i].y + pts[i + 1].y);
        }
        return total / (pts.length - 2);
    };

    const out = smoothPoints(noisy, 1);
    assert.deepEqual(out[0], noisy[0], 'first point moved');
    assert.deepEqual(out[out.length - 1], noisy[noisy.length - 1], 'last point moved');
    assert.ok(roughness(out) < roughness(noisy) * 0.5, 'barely smoothed');
    assert.equal(smoothPoints(noisy, 0), noisy, 'amount 0 should pass through');

    // Monotonic in amount. The naive kernel is not: its gain at the
    // jitter frequency is |1 - 2k|, so feeding `amount` straight in as
    // `k` would make maximum smoothing attenuate nothing and merely
    // invert the phase. `amount` maps to k = amount/2 to prevent that.
    let last = Infinity;
    for (const a of [0.25, 0.5, 0.75, 1]) {
        const got = roughness(smoothPoints(noisy, a));
        assert.ok(got <= last + 1e-9,
            `smoothing got weaker from amount ${a}: ${got.toFixed(4)} after ${last.toFixed(4)}`);
        last = got;
    }

    // And monotonic in passes, which widens the kernel.
    let prev = Infinity;
    for (const passes of [1, 2, 3, 5, 8]) {
        const got = roughness(smoothPoints(noisy, 1, passes));
        assert.ok(got <= prev + 1e-9, `passes ${passes} got rougher`);
        prev = got;
    }
    assert.ok(prev < roughness(noisy) * 0.05, `eight passes left ${prev.toFixed(4)}`);
});

test('pressureFromVelocity gives fast motion less pressure', () => {
    const slow = pressureFromVelocity(
        [{ x: 0, y: 0, t: 0 }, { x: 1, y: 0, t: 100 }, { x: 2, y: 0, t: 200 }], {});
    const fast = pressureFromVelocity(
        [{ x: 0, y: 0, t: 0 }, { x: 50, y: 0, t: 10 }, { x: 100, y: 0, t: 20 }], {});
    assert.ok(slow[1].p > fast[1].p, `slow ${slow[1].p} should exceed fast ${fast[1].p}`);
    for (const q of [...slow, ...fast]) {
        assert.ok(q.p >= 0 && q.p <= 1, `pressure out of range: ${q.p}`);
    }
});

// =====================================================================
// the brush library
// =====================================================================

test('every named brush resolves and is fully specified', () => {
    const fields = ['size', 'hardness', 'flow', 'opacity', 'spacing', 'mode',
        'minSize', 'sizeCurve', 'minFlow', 'flowCurve', 'taper', 'taperMin',
        'jitterPos', 'jitterSize', 'jitterFlow', 'erase'];
    assert.ok(BRUSH_NAMES.length >= 8, `only ${BRUSH_NAMES.length} brushes`);
    for (const name of BRUSH_NAMES) {
        const b = brush(name);
        for (const f of fields) {
            assert.ok(b[f] !== undefined, `${name} is missing ${f}`);
        }
        assert.ok(b.hardness >= 0 && b.hardness <= 1, `${name} hardness`);
        assert.ok(b.flow > 0 && b.flow <= 1, `${name} flow`);
        assert.ok(b.spacing > 0 && b.spacing <= 1, `${name} spacing`);
        assert.ok(b.mode === 0 || b.mode === 1, `${name} mode`);
    }
});

test('an unknown brush throws rather than substituting a default', () => {
    // A typo that quietly produces a different brush survives until
    // someone compares two renders side by side.
    assert.throws(() => brush('inkk'), /unknown brush "inkk"/);
});

test('overrides apply, and the library record is not mutated', () => {
    const b = brush('ink', { size: 99 });
    assert.equal(b.size, 99);
    assert.notEqual(BRUSHES.ink.size, 99, 'the library record was mutated');
});

test('the library spans both accumulation modes', () => {
    // A library of eight brushes that all respond identically is one brush
    // with eight sizes.
    const modes = new Set(BRUSH_NAMES.map((n) => brush(n).mode));
    assert.ok(modes.has(0) && modes.has(1), 'the library is all one mode');
    assert.equal(brush('airbrush').mode, 1);
    assert.equal(brush('marker').mode, 0);
    assert.ok(BRUSH_NAMES.some((n) => brush(n).erase), 'no eraser');
    assert.ok(BRUSH_NAMES.some((n) => brush(n).jitterPos > 0.2), 'no granular brush');
    assert.ok(BRUSH_NAMES.some((n) => brush(n).taper > 1), 'no tapering brush');
});

// =====================================================================
// the surface
// =====================================================================

test('parseColor handles the forms it is given, and never returns NaN', () => {
    assert.deepEqual(parseColor('#fff'), [1, 1, 1]);
    assert.deepEqual(parseColor('#000000'), [0, 0, 0]);
    assert.deepEqual(parseColor([0.25, 0.5, 0.75]), [0.25, 0.5, 0.75]);
    const bad = parseColor('rebeccapurple');
    assert.ok(bad.every(Number.isFinite), 'unparseable colour produced NaN');
});

test('a stroke marks the surface, and the buffer stays premultiplied', () => {
    const S = new PaintSurface(K, 120, 80);
    try {
        const n = S.draw({ points: arc(30, 90), brush: 'ink', size: 12, color: '#ffffff' });
        assert.ok(n > 0, 'no dabs stamped');
        const a = S.buffer.array;
        let inked = 0;
        for (let i = 0; i < 120 * 80; i++) {
            const alpha = a[i * 4 + 3];
            if (alpha > 0.01) inked++;
            for (let c = 0; c < 3; c++) {
                // No channel may exceed alpha, or the colour brightens
                // when composited over anything.
                assert.ok(a[i * 4 + c] <= alpha + 1e-6,
                    `pixel ${i} channel ${c} exceeds alpha`);
            }
        }
        assert.ok(inked > 200, `only ${inked} pixels inked`);
    } finally { S.dispose(); }
});

test('a marker pass is uniform however densely it was sampled', () => {
    // The point of accumulating into a mask and compositing once. In peak
    // mode a flow-0.5 marker must reach 0.5 and stop, no matter that dabs
    // overlap tenfold.
    const S = new PaintSurface(K, 100, 40);
    try {
        const slow = [];
        for (let i = 0; i < 200; i++) slow.push({ x: 10 + i * 0.4, y: 20, p: 1 });
        S.draw({ points: slow, brush: 'marker', size: 16, color: '#000', opacity: 1 });
        let peak = 0;
        for (let i = 3; i < S.buffer.array.length; i += 4) peak = Math.max(peak, S.buffer.array[i]);
        assert.ok(Math.abs(peak - 0.5) < 0.02,
            `marker reached ${peak.toFixed(3)}; peak mode should cap at its flow of 0.5`);
    } finally { S.dispose(); }
});

test('within one stroke, an airbrush builds up and a marker does not', () => {
    // This is what `mode` means, and it is a *within-stroke* property.
    // Across separate strokes both composite identically -- six marker
    // passes reach 1-(1-0.5)^6 = 0.98 -- so comparing stroke counts
    // measures nothing about the mode. The test therefore uses a single
    // stroke that doubles back over itself.
    const measure = (name) => {
        const S = new PaintSurface(K, 120, 40);
        try {
            const pts = [];
            for (let lap = 0; lap < 4; lap++) {
                for (let i = 0; i <= 40; i++) {
                    const x = lap % 2 === 0 ? 20 + i : 60 - i;
                    pts.push({ x, y: 20, p: 1 });
                }
            }
            S.draw({ points: pts, brush: name, size: 18, color: '#000' });
            let peak = 0;
            for (let i = 3; i < S.buffer.array.length; i += 4) {
                peak = Math.max(peak, S.buffer.array[i]);
            }
            return { peak, flow: brush(name).flow };
        } finally { S.dispose(); }
    };

    const air = measure('airbrush');
    const mark = measure('marker');

    // Build-up: coverage must climb well past what one dab deposits.
    assert.ok(air.peak > air.flow * 3,
        `airbrush reached ${air.peak.toFixed(3)} from flow ${air.flow}; it should build up`);
    // Peak: coverage must stop at what one dab deposits, however many
    // times the stroke crosses itself.
    assert.ok(mark.peak < mark.flow * 1.1,
        `marker reached ${mark.peak.toFixed(3)} from flow ${mark.flow}; peak mode must cap`);
});

test('an eraser removes what was painted, leaving no colour fringe', () => {
    const S = new PaintSurface(K, 60, 60);
    try {
        const band = [{ x: 5, y: 30, p: 1 }, { x: 55, y: 30, p: 1 }];
        S.draw({ points: band, brush: 'pen', size: 30, color: '#ff0000' });
        let before = 0;
        for (let i = 3; i < S.buffer.array.length; i += 4) before += S.buffer.array[i];
        assert.ok(before > 1, 'nothing was painted to erase');

        S.draw({ points: band, brush: 'eraser', size: 40 });
        const a = S.buffer.array;
        let after = 0;
        for (let i = 0; i < 60 * 60; i++) {
            after += a[i * 4 + 3];
            // Erase scales all four channels together, so an erased pixel
            // stays neutral rather than picking up a red fringe.
            assert.ok(a[i * 4] <= a[i * 4 + 3] + 1e-6, `fringe at pixel ${i}`);
        }
        assert.ok(after < before * 0.05, `erase left ${after.toFixed(2)} of ${before.toFixed(2)}`);
    } finally { S.dispose(); }
});

test('draw-on is deterministic: the same progress gives the same pixels', () => {
    // Frame N must be a pure function of N. Two renders at the same
    // progress, with a fresh surface each time, must be identical.
    const stroke = { points: arc(50, 150), brush: 'charcoal', size: 14, color: '#000', seed: 11 };
    const render = (progress) => {
        const S = new PaintSurface(K, 180, 100);
        try {
            S.draw(stroke, { progress });
            return Float32Array.from(S.buffer.array);
        } finally { S.dispose(); }
    };
    const a = render(0.42);
    const b = render(0.42);
    assert.deepEqual(Array.from(a), Array.from(b), 'two renders at progress 0.42 differ');
});

test('draw-on coverage grows with progress and never shrinks', () => {
    const stroke = { points: arc(50, 150), brush: 'pen', size: 10, color: '#000' };
    let prev = -1;
    for (const p of [0, 0.2, 0.4, 0.6, 0.8, 1]) {
        const S = new PaintSurface(K, 180, 100);
        try {
            S.draw(stroke, { progress: p });
            let inked = 0;
            for (let i = 3; i < S.buffer.array.length; i += 4) {
                if (S.buffer.array[i] > 0.01) inked++;
            }
            assert.ok(inked >= prev, `coverage fell at progress ${p}: ${inked} after ${prev}`);
            prev = inked;
        } finally { S.dispose(); }
    }
    assert.ok(prev > 100, 'the finished stroke barely marked anything');
});

test('the resample cache is reused across frames but keyed on the brush', () => {
    const S = new PaintSurface(K, 100, 60);
    try {
        const stroke = { points: arc(), brush: 'ink', size: 12, color: '#000' };
        const first = S._prepare(stroke);
        const second = S._prepare(stroke);
        assert.equal(first.buf.ptr, second.buf.ptr, 'cache missed on an unchanged stroke');

        // Changing something the resampler reads must invalidate it.
        stroke.size = 40;
        const third = S._prepare(stroke);
        assert.equal(third.resampled.count !== first.resampled.count, true,
            'cache served stale dabs after the size changed');
    } finally { S.dispose(); }
});

test('drawAll reveals a drawing weighted by dabs, not by stroke count', () => {
    // Weighting by stroke count makes a single dot take as long to appear
    // as a sweeping line, which reads as a stall.
    const S = new PaintSurface(K, 200, 120);
    try {
        const dot = { points: [{ x: 20, y: 20, p: 1 }], brush: 'pen', size: 8, color: '#000' };
        const sweep = { points: arc(60, 160), brush: 'pen', size: 8, color: '#000' };
        const strokes = [dot, sweep];

        S.clear();
        S.drawAll(strokes, { at: 0.5 });
        let half = 0;
        for (let i = 3; i < S.buffer.array.length; i += 4) if (S.buffer.array[i] > 0.01) half++;

        S.clear();
        S.drawAll(strokes, { at: 1 });
        let all = 0;
        for (let i = 3; i < S.buffer.array.length; i += 4) if (S.buffer.array[i] > 0.01) all++;

        assert.ok(half > 0 && half < all, `half=${half} all=${all}`);
        // The dot is one dab against the sweep's hundreds, so at the
        // halfway point most of the sweep must be visible.
        assert.ok(half > all * 0.3, `dab weighting looks wrong: ${half}/${all}`);
    } finally { S.dispose(); }
});

test('toRgba8 round-trips a known colour and writes into a supplied buffer', () => {
    const S = new PaintSurface(K, 32, 32);
    try {
        S.draw({ points: [{ x: 16, y: 16, p: 1 }], brush: 'pen', size: 20, color: '#ff8000' });
        const target = new Uint8Array(32 * 32 * 4);
        const out = S.toRgba8(target);
        assert.equal(out, target, 'did not write into the supplied buffer');
        const centre = (16 * 32 + 16) * 4;
        assert.equal(target[centre + 3], 255, 'centre of a hard dab is not opaque');
        assert.ok(Math.abs(target[centre] - 255) <= 1, `red ${target[centre]}`);
        assert.ok(Math.abs(target[centre + 1] - 128) <= 2, `green ${target[centre + 1]}`);
        assert.ok(target[centre + 2] <= 1, `blue ${target[centre + 2]}`);
    } finally { S.dispose(); }
});

test('clear returns the surface to transparent', () => {
    const S = new PaintSurface(K, 48, 48);
    try {
        S.draw({ points: arc(20, 40), brush: 'charcoal', size: 20, color: '#000' });
        S.clear();
        for (const v of S.buffer.array) assert.equal(v, 0, 'clear left residue');
    } finally { S.dispose(); }
});
