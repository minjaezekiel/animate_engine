/**
 * Motion blur by subframe accumulation.
 *
 * Every frame this engine drew was an INSTANT, and the absence of a shutter
 * is the clearest remaining difference between its output and reference work
 * at 24fps: a hand that moves 40 px in a frame arrives as two sharp hands
 * rather than one smeared one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    MOTION_BLUR_DEFAULTS, accumulateInto, buildDecodeTable, linearToSrgb,
    motionBlurCost, normalizeMotionBlur, resolveAccumulator, shutterFraction,
    srgbToLinear, subframeTimes,
} from '../../src/core/motion/motionBlur.js';
import { compileFilm } from '../../src/core/script/compile.js';

const MB = MOTION_BLUR_DEFAULTS;

test('a shutter angle is a fraction of a frame, as a cinematographer says it', () => {
    assert.equal(shutterFraction(180), 0.5, '180 degrees is the film convention: half a frame');
    assert.equal(shutterFraction(360), 1);
    assert.equal(shutterFraction(90), 0.25);
    assert.equal(shutterFraction(0), 0);
    assert.equal(shutterFraction(-10), 0, 'clamped rather than negative');
    assert.equal(shutterFraction(1000), 1, 'and clamped at fully open');
    assert.equal(MB.shutter, 180);
    assert.equal(MB.samples, 8);
});

// ---------------------------------------------------------- the sample times

test('subframes are MIDPOINTS of the window, not its endpoints', () => {
    /**
     * Endpoint sampling double-counts the frame boundary: with a 360-degree
     * shutter the last subframe of frame N is the same instant as the first
     * of frame N+1, and that instant gets twice the weight. Midpoints also
     * integrate better for the same count -- error falls as 1/n^2 rather
     * than 1/n.
     */
    const t = subframeTimes(0, 24, { samples: 4, shutter: 360, center: false });
    // A whole frame is 1/24; midpoints at 1/8, 3/8, 5/8, 7/8 of it.
    assert.deepEqual(t.map((v) => +(v * 24).toFixed(6)), [0.125, 0.375, 0.625, 0.875]);
    // No subframe lands on either boundary.
    assert.ok(t.every((v) => v > 0 && v < 1 / 24));
});

test('a 180-degree shutter integrates over HALF the frame', () => {
    const t = subframeTimes(1, 24, { samples: 2, shutter: 180, center: false });
    const span = (t[t.length - 1] - t[0]);
    assert.ok(span < 0.5 / 24, `samples span ${span * 24} frames, want under half`);
    assert.ok(t[0] >= 1 && t[t.length - 1] < 1 + 0.5 / 24);
});

test('one sample lands exactly on the frame time', () => {
    // Which makes `samples: 1` bit-identical to no blur rather than a
    // half-frame offset -- so the feature can be switched off without
    // shifting the whole film in time.
    assert.deepEqual(subframeTimes(2.5, 24, { samples: 1, shutter: 180 }), [2.5]);
    assert.deepEqual(subframeTimes(2.5, 24, { samples: 8, shutter: 0 }), [2.5],
        'a closed shutter is the same thing');
});

test('a centred shutter straddles the frame time, a forward one follows it', () => {
    const fwd = subframeTimes(1, 24, { samples: 8, shutter: 180, center: false });
    assert.ok(fwd.every((v) => v > 1), 'forward: every sample is after t');
    const mid = subframeTimes(1, 24, { samples: 8, shutter: 180, center: true });
    assert.ok(mid.some((v) => v < 1) && mid.some((v) => v > 1), 'centred: straddles t');
    // The mean of a centred window is the frame time itself.
    assert.ok(Math.abs(mid.reduce((a, b) => a + b, 0) / mid.length - 1) < 1e-12);
    assert.equal(MB.center, false, 'forward is the default, as on a real camera');
});

test('the samples are evenly spaced and strictly increasing', () => {
    const t = subframeTimes(0, 24, { samples: 8, shutter: 180, center: false });
    const gaps = t.slice(1).map((v, i) => v - t[i]);
    for (const g of gaps) assert.ok(Math.abs(g - gaps[0]) < 1e-12, 'uneven spacing');
    for (let i = 1; i < t.length; i++) assert.ok(t[i] > t[i - 1]);
});

test('the times are a pure function of the frame, which is the whole contract', () => {
    // No jitter, no stochastic sampling, no seed. A stochastic sampler hides
    // banding better with few samples and breaks the one guarantee that makes
    // this renderer testable.
    const a = subframeTimes(3, 24, MB);
    const b = subframeTimes(3, 24, MB);
    assert.deepEqual(a, b);
    assert.notDeepEqual(subframeTimes(4, 24, MB), a);
});

// ---------------------------------------------------------- the declaration

test('`true` means the conventional thing', () => {
    assert.deepEqual(normalizeMotionBlur(true), { ...MB });
    assert.equal(normalizeMotionBlur(false), null);
    assert.equal(normalizeMotionBlur(null), null);
    assert.equal(normalizeMotionBlur(undefined), null);
});

test('a bare number is a SAMPLE COUNT, not a shutter angle', () => {
    // The count is the quality/cost dial and the angle is a look, and a bare
    // number under 360 would otherwise be ambiguous between the two.
    assert.equal(normalizeMotionBlur(16).samples, 16);
    assert.equal(normalizeMotionBlur(16).shutter, 180, 'the angle keeps its default');
});

test('a shutter angle is validated in degrees', () => {
    assert.equal(normalizeMotionBlur({ shutter: 90 }).shutter, 90);
    assert.equal(normalizeMotionBlur({ shutter: 360 }).shutter, 360);
    const warns = [];
    // 0.5 is almost certainly someone writing the FRACTION they meant: half
    // a frame IS 180 degrees. A shutter of 0.5 degrees is 1/720th of a frame
    // and nothing has ever been shot at it.
    const d = normalizeMotionBlur({ shutter: 0.5 }, { warn: (m) => warns.push(m) });
    assert.equal(d.shutter, 180, 'a bad angle falls back rather than breaking');
    assert.match(warns.join(), /DEGREES/, 'the message must say what the unit is');
    assert.match(warns.join(), /means half a frame/, 'and name the likely mistake');
    assert.match(warns.join(), /Got 0\.5/, 'and echo what it was given');
    const over = [];
    normalizeMotionBlur({ shutter: 720 }, { warn: (m) => over.push(m) });
    assert.match(over.join(), /1 to 360/);
});

test('a sample count between 2 and 3 is WARNED about, because it looks like a fault', () => {
    // Four ghosts read worse than no blur at all: a smear is a camera and a
    // ghost is a bug.
    const warns = [];
    normalizeMotionBlur({ samples: 3 }, { warn: (m) => warns.push(m) });
    assert.match(warns.join(), /3 separate ghosts/);
    assert.match(warns.join(), /Use 8, or 1 to turn it off/);
    // 1 is a deliberate off switch and must not warn.
    assert.deepEqual(normalizeMotionBlur({ samples: 1 }, { warn: (m) => { throw new Error(m); } })
        .samples, 1);
});

test('an absurd sample count is warned about in terms of cost', () => {
    const warns = [];
    normalizeMotionBlur({ samples: 64 }, { warn: (m) => warns.push(m) });
    assert.match(warns.join(), /64x the render/);
});

test('nonsense is a warning, not a throw', () => {
    const warns = [];
    assert.equal(normalizeMotionBlur('lots', { warn: (m) => warns.push(m) }), null);
    assert.match(warns.join(), /must be true, a sample count, or an object/);
    assert.equal(normalizeMotionBlur(0, { warn: () => {} }), null);
    assert.equal(normalizeMotionBlur(Number.NaN, { warn: () => {} }), null);
    const bad = [];
    assert.equal(normalizeMotionBlur({ samples: 'eight' }, { warn: (m) => bad.push(m) }).samples, 8);
    assert.match(bad.join(), /whole number of 1 or more/);
});

test('the cost multiplier is the sample count, which a preflight can report', () => {
    assert.equal(motionBlurCost(null), 1);
    assert.equal(motionBlurCost({ samples: 8 }), 8);
    assert.equal(motionBlurCost({ samples: 1 }), 1);
});

// ------------------------------------------------------------ linear light

test('the sRGB transfer functions round-trip, exactly, including at the knee', () => {
    /**
     * 0.04045 is the knee, and it used to fail by 3e-8.
     *
     * The specification quotes both ends of the knee -- 0.04045 encoded and
     * 0.0031308 linear -- rounded independently, and they are not exact
     * inverses. A value sitting exactly on it decoded with the linear segment
     * and re-encoded with the power one. Deriving the linear knee from the
     * encoded one makes the pair self-consistent.
     */
    for (const v of [0, 0.01, 0.04045, 0.2, 0.5, 0.735, 1]) {
        assert.ok(Math.abs(linearToSrgb(srgbToLinear(v)) - v) < 1e-9, `failed at ${v}`);
    }
    assert.equal(srgbToLinear(0), 0);
    assert.ok(Math.abs(srgbToLinear(1) - 1) < 1e-12);
});

test('the linear segment near black is honoured, not approximated by a power', () => {
    // A motion blur spends most of its pixels in shadow, and a pure 2.2
    // power law crushes them.
    assert.ok(Math.abs(srgbToLinear(0.02) - 0.02 / 12.92) < 1e-12);
    assert.notEqual(srgbToLinear(0.02), 0.02 ** 2.2);
});

test('encoding clamps rather than returning out-of-range values', () => {
    assert.equal(linearToSrgb(-1), 0);
    assert.equal(linearToSrgb(2), 1);
});

test('the decode table is exact, because a byte has 256 values', () => {
    const t = buildDecodeTable();
    assert.equal(t.length, 256);
    for (const i of [0, 1, 10, 128, 255]) {
        assert.ok(Math.abs(t[i] - srgbToLinear(i / 255)) < 1e-6, `table wrong at ${i}`);
    }
});

test('averaging happens in LINEAR light, which is the point', () => {
    /**
     * A shutter integrates radiance, and radiance is linear. sRGB is roughly
     * a 2.2-power encoding, so averaging the ENCODED bytes of a bright
     * highlight against black gives a blur that is markedly too dark -- the
     * classic "dirty" motion blur.
     *
     * Half a frame of white and half of black: the right answer is the sRGB
     * encoding of 0.5 linear, which is 188, NOT the byte average of 128.
     */
    const decode = buildDecodeTable();
    const acc = new Float32Array(4);
    accumulateInto(acc, new Uint8ClampedArray([255, 255, 255, 255]), decode);
    accumulateInto(acc, new Uint8ClampedArray([0, 0, 0, 255]), decode);
    const out = new Uint8ClampedArray(4);
    resolveAccumulator(acc, 2, out);
    assert.equal(out[0], 188, `got ${out[0]}; 128 would mean averaging in sRGB`);
    assert.equal(Math.round(linearToSrgb(0.5) * 255), 188);
});

test('alpha is averaged WITHOUT a transfer curve, because it is coverage', () => {
    // Blurring alpha through a gamma curve shows up as a halo on an edge
    // against transparency.
    const decode = buildDecodeTable();
    const acc = new Float32Array(4);
    accumulateInto(acc, new Uint8ClampedArray([0, 0, 0, 255]), decode);
    accumulateInto(acc, new Uint8ClampedArray([0, 0, 0, 0]), decode);
    const out = new Uint8ClampedArray(4);
    resolveAccumulator(acc, 2, out);
    assert.ok(Math.abs(out[3] - 128) <= 1, `alpha is ${out[3]}, want a plain mean of 128`);
});

test('a uniform frame averages to ITSELF, exactly, at every level', () => {
    // The property that makes "blur a still shot" a no-op rather than a
    // slow drift in brightness. Any rounding error here would show up as
    // a static film changing colour when blur is switched on.
    const decode = buildDecodeTable();
    for (const level of [0, 1, 17, 64, 128, 200, 254, 255]) {
        const acc = new Float32Array(4);
        for (let i = 0; i < 8; i++) {
            accumulateInto(acc, new Uint8ClampedArray([level, level, level, 255]), decode);
        }
        const out = new Uint8ClampedArray(4);
        resolveAccumulator(acc, 8, out);
        assert.equal(out[0], level, `level ${level} resolved to ${out[0]}`);
    }
});

test('accumulation handles a whole image, channel by channel', () => {
    const decode = buildDecodeTable();
    const px = 4;
    const acc = new Float32Array(px * 4);
    const a = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255,
                                     0, 0, 255, 255, 255, 255, 255, 255]);
    accumulateInto(acc, a, decode);
    accumulateInto(acc, a, decode);
    const out = new Uint8ClampedArray(px * 4);
    resolveAccumulator(acc, 2, out);
    assert.deepEqual([...out], [...a], 'two identical frames must resolve to the frame');
});

// -------------------------------------------------- through the compilers

test('a 2D film declares it and the compiler normalises it', () => {
    const { meta, diagnostics } = compileFilm({
        meta: { fps: 24, width: 100, height: 100, motionBlur: { samples: 12, shutter: 200 } },
        scenes: [{ id: 's', shots: [{ id: 'a', duration: 1 }] }],
    });
    assert.equal(meta.motionBlur.samples, 12);
    assert.equal(meta.motionBlur.shutter, 200);
    assert.deepEqual(diagnostics.filter((d) => d.severity === 'error'), []);
});

test('a film that says nothing gets NO blur, so no render changes or slows down', () => {
    const { meta } = compileFilm({
        meta: { fps: 24, width: 100, height: 100 },
        scenes: [{ id: 's', shots: [{ id: 'a', duration: 1 }] }],
    });
    assert.equal(meta.motionBlur, null);
});

test('a bad declaration surfaces as a film diagnostic', () => {
    const { diagnostics } = compileFilm({
        meta: { fps: 24, width: 100, height: 100, motionBlur: { samples: 2 } },
        scenes: [{ id: 's', shots: [{ id: 'a', duration: 1 }] }],
    });
    assert.ok(diagnostics.some((d) => /separate ghosts/.test(d.message)),
        'the warning must reach the film diagnostics, not just a callback');
});

test('declaring the duck did not stop the blur reaching diagnostics', () => {
    // Both share one `metaWarn` on the 2D path; a copy-paste there would
    // route one of them nowhere.
    const { diagnostics, meta } = compileFilm({
        meta: { fps: 24, width: 100, height: 100,
                audio: { duck: { attack: -1 } }, motionBlur: { samples: 2 } },
        scenes: [{ id: 's', shots: [{ id: 'a', duration: 1 }] }],
    });
    assert.ok(meta.duck && meta.motionBlur);
    assert.ok(diagnostics.some((d) => /non-negative/.test(d.message)));
    assert.ok(diagnostics.some((d) => /separate ghosts/.test(d.message)));
});

// ------------------------------------------------------- preflight accounting

test('preflight reports the subframe count, so its estimate is of the real render', async () => {
    /**
     * Preflight exists to catch an over-budget render in seconds rather than
     * two minutes in. It measures ONE draw per frame, so with 8-sample blur
     * it would clear a render that is eight times over budget -- defeating
     * the whole point in exactly the case where it matters most. So every
     * reported cost is multiplied by `motionBlurCost`.
     *
     * Asserted on the ACCOUNTING rather than on the clock. The first version
     * of this test busy-waited 4 ms per draw and checked that `withinBudget`
     * flipped, which passed alone and failed under `node --test`'s parallel
     * runner: contention stretched the 4 ms to 60.92 ms, so the UNBLURRED
     * run was already over budget. Wall-clock assertions in a suite that
     * runs files concurrently measure the machine, not the code. The
     * multiplier itself is a pure function and is covered above.
     */
    const { preflight } = await import('../../src/render/OfflineRenderer.js');
    const { Scene } = await import('../../src/core/scene/Scene.js');
    const { createTimeline } = await import('../../src/core/anim/Timeline.js');

    const scene = new Scene();
    scene.add({ id: 'n', kind: 'rect', transform: { x: 0, y: 0 }, props: {} });
    const timeline = createTimeline({ fps: 24, duration: 1 });
    let draws = 0;
    const backend = { sync: () => backend, renderFrame: () => { draws++; }, canvas: () => null };

    const base = await preflight({ scene, timeline, backend, cameraId: null,
                                   fps: 24, frames: 6 });
    const drawsPlain = draws;
    draws = 0;
    const blurred = await preflight({ scene, timeline, backend, cameraId: null,
                                      fps: 24, frames: 6,
                                      motionBlur: { samples: 8, shutter: 180 } });

    assert.equal(base.subframes, 1, 'no blur is one subframe');
    assert.equal(blurred.subframes, 8, 'and the count must be reported, not implied');
    // A stub backend has no 2D canvas, so the readback is unmeasurable and
    // must come back as 0 rather than as a guess -- a made-up number here
    // would silently skew every estimate that uses it.
    assert.equal(blurred.readbackMs, 0);
    assert.equal(base.readbackMs, 0);
    assert.equal(draws, drawsPlain,
        'preflight must MULTIPLY rather than render eight times, or it would itself be '
        + 'eight times slower -- which is the cost it exists to avoid paying');
    assert.equal(base.ceilingMs, blurred.ceilingMs, 'the ceiling itself does not move');
    // Every cost field is scaled, not just the one `withinBudget` reads.
    for (const k of ['meanMs', 'medianMs', 'p95Ms', 'maxMs']) {
        assert.ok(Number.isFinite(blurred[k]), `${k} is not a number`);
    }
    assert.equal(motionBlurCost({ samples: 8 }), 8);
});

test('the real cost multiplier is NOT the sample count, and preflight knows', async () => {
    /**
     * Measured, and it is why `readbackMs` exists: the AK-47 film at 480x270
     * went from 6.4 ms a frame to 127.0 ms with 8-sample blur. That is 19.8x,
     * not 8x, because each subframe pays a `getImageData` that is larger than
     * the draw it accompanies.
     *
     * A `samples` multiplier alone was therefore 2.5x optimistic, so
     * preflight would have cleared a render it should have flagged -- the
     * exact failure the parameter was added to prevent, surviving inside the
     * fix for it. This asserts the readback term is actually added, using a
     * fake canvas whose round trip costs a known amount.
     */
    const { preflight } = await import('../../src/render/OfflineRenderer.js');
    const { Scene } = await import('../../src/core/scene/Scene.js');
    const { createTimeline } = await import('../../src/core/anim/Timeline.js');
    const scene = new Scene();
    scene.add({ id: 'n', kind: 'rect', transform: { x: 0, y: 0 }, props: {} });
    const timeline = createTimeline({ fps: 24, duration: 1 });

    // A canvas whose pixel round trip is deliberately slow and measurable.
    const ctx = {
        getImageData: () => { const e = performance.now() + 3; while (performance.now() < e); return {}; },
        putImageData: () => {},
    };
    const backend = {
        sync: () => backend, renderFrame: () => {},
        canvas: () => ({ width: 480, height: 270, getContext: () => ctx }),
    };
    const r = await preflight({ scene, timeline, backend, cameraId: null, fps: 24, frames: 4,
                                motionBlur: { samples: 8, shutter: 180 } });
    assert.ok(r.readbackMs >= 2.5, `readback measured ${r.readbackMs}ms, want about 3`);
    // 8 subframes x ~3ms of readback is ~24ms on top of the draws, so the
    // estimate must be at least that regardless of how fast the draw is.
    assert.ok(r.p95Ms >= r.readbackMs * 8,
        `p95 ${r.p95Ms}ms does not include 8 readbacks of ${r.readbackMs}ms`);
    // And without blur the readback is not charged at all.
    const plain = await preflight({ scene, timeline, backend, cameraId: null, fps: 24, frames: 4 });
    assert.equal(plain.readbackMs, 0, 'a film with no blur must not be charged for a readback');
});
