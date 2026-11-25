/**
 * Motion blur by subframe accumulation: the shutter, as arithmetic.
 *
 * # Why this is the last big visual gap
 *
 * Every frame this engine draws is an INSTANT. A real camera's shutter is
 * open for a fraction of a frame and integrates whatever moves across it, and
 * the absence of that is the single clearest difference between this
 * renderer's output and reference work at 24fps: fast motion strobes, a whip
 * pan judders, and a hand that moves 40 px in a frame arrives as two sharp
 * hands rather than one smeared one.
 *
 * The fix is not a post-process. A velocity-buffer blur guesses at what was
 * behind the moving thing and gets it wrong at every silhouette edge.
 * Accumulating real subframes is the ground truth: render the frame several
 * times at several instants within the shutter's opening and average them.
 * Expensive, exact, and -- crucially -- it needs nothing from the renderer it
 * does not already have, because this engine can already draw frame N at any
 * t it is asked for.
 *
 * # Why it stays deterministic
 *
 * Subframe times are a pure function of the frame index, so frame N is still
 * a pure function of N -- the property the whole pipeline is built on. No
 * jitter, no stochastic sampling, no seed. A stochastic sampler would be
 * better at hiding banding with few samples and would break the one guarantee
 * that makes this renderer testable, so it is not on the table.
 *
 * # Why the average is in LINEAR light
 *
 * A shutter integrates radiance, and radiance is linear. sRGB is not: it is
 * roughly a 2.2-power encoding, so averaging the ENCODED bytes of a bright
 * moving highlight against a dark background gives a blur that is markedly
 * too dark -- the classic "dirty" motion blur. Decoding to linear, averaging,
 * and re-encoding costs two table lookups per channel and is the difference
 * between a smear that reads as light and one that reads as grime.
 *
 * Pure: numbers in, numbers out, no canvas. The canvas accumulator that uses
 * this lives in [../../render/motionBlur.js](../../render/motionBlur.js).
 */

export const MOTION_BLUR_DEFAULTS = {
    /**
     * Subframes per output frame.
     *
     * 8 is the smallest number that does not band visibly on fast motion. At
     * 4 a fast pan reads as four ghosts rather than a smear, which is worse
     * than no blur at all because it looks like a fault; by 8 the ghosts
     * merge. 16 is visibly better only on the fastest motion and costs twice
     * as much, which on an offline render is a reasonable trade to offer and
     * a poor one to default to.
     */
    samples: 8,
    /**
     * Shutter angle, in degrees, as a cinematographer says it.
     *
     * 180 is the convention -- open for half of each frame -- and is what
     * everything shot on film for a century looks like. 360 is a fully open
     * shutter and reads as smeared; 90 is a sharp, staccato look (the
     * *Saving Private Ryan* beach). Expressed in degrees rather than as a
     * fraction because every reference an author will consult uses degrees.
     */
    shutter: 180,
    /**
     * Whether the shutter is centred on the frame's own time.
     *
     * `false` -- the default -- opens the shutter AT t = n/fps and integrates
     * forward, which is what a real camera does and what makes frame N
     * describe the interval that begins at N/fps. `true` centres the window
     * on t, which removes the half-shutter of apparent lag and is what most
     * 3D packages default to. Both are defensible; being able to say which
     * one is in use matters more than the choice.
     */
    center: false,
};

/** 0 to 360 degrees as a fraction of one frame's duration. */
export const shutterFraction = (degrees) => Math.max(0, Math.min(360, degrees)) / 360;

/**
 * The instants to render for one output frame.
 *
 * Midpoint sampling: subframe j sits at `(j + 0.5) / samples` through the
 * window, not at `j / (samples - 1)`. Two reasons, and both show up as
 * artefacts otherwise. Endpoint sampling double-counts the frame boundary, so
 * with a 360-degree shutter the last subframe of frame N is the same instant
 * as the first of frame N+1 and that instant is weighted twice. And the
 * midpoint rule is simply the better quadrature for the same number of
 * samples -- the error falls as 1/n^2 rather than 1/n.
 *
 * A single sample lands exactly on `t`, which means `samples: 1` is
 * bit-identical to no motion blur at all rather than a half-frame offset.
 * That is worth having: it makes the feature switchable without shifting the
 * whole film in time.
 */
export function subframeTimes(t, fps, { samples, shutter, center } = MOTION_BLUR_DEFAULTS) {
    const n = Math.max(1, Math.round(samples));
    if (n === 1) return [t];
    const span = shutterFraction(shutter) / fps;
    if (!(span > 0)) return [t];
    const start = center ? t - span / 2 : t;
    const out = [];
    for (let j = 0; j < n; j++) out.push(start + ((j + 0.5) / n) * span);
    return out;
}

/**
 * Read a film's declaration.
 *
 * `true` means the conventional thing, which is what an author wants to write
 * nine times out of ten. A bare number is read as a sample COUNT rather than
 * as a shutter angle, because the count is the quality/cost dial and the
 * angle is a look -- and a number under 360 would otherwise be ambiguous
 * between the two.
 */
export function normalizeMotionBlur(spec, { warn = () => {},
                                            path = 'meta.motionBlur' } = {}) {
    if (spec == null || spec === false) return null;
    if (spec === true) spec = {};
    else if (typeof spec === 'number') {
        if (!Number.isFinite(spec) || spec < 1) {
            warn(`${path} must be a sample count of 1 or more`, path);
            return null;
        }
        spec = { samples: spec };
    }
    if (typeof spec !== 'object') {
        warn(`${path} must be true, a sample count, or an object`, path);
        return null;
    }
    const out = { ...MOTION_BLUR_DEFAULTS };
    if (spec.samples != null) {
        const n = Number(spec.samples);
        if (Number.isFinite(n) && n >= 1) out.samples = Math.round(n);
        else warn(`${path}.samples must be a whole number of 1 or more`, path);
    }
    if (spec.shutter != null) {
        const d = Number(spec.shutter);
        // Below one degree is rejected rather than honoured: a shutter of
        // 0.5 degrees is 1/720th of a frame, which nothing has ever been shot
        // at, and it is overwhelmingly likely to be someone writing the
        // FRACTION they meant (0.5 of a frame = 180 degrees).
        if (Number.isFinite(d) && d >= 1 && d <= 360) out.shutter = d;
        else warn(`${path}.shutter is an angle in DEGREES, from 1 to 360 (180 is the `
            + `film convention, and means half a frame). Got ${spec.shutter}.`, path);
    }
    if (spec.center != null) out.center = !!spec.center;

    if (out.samples > 1 && out.samples < 4) {
        warn(`${path}.samples of ${out.samples} will read as ${out.samples} separate ghosts `
            + 'rather than a smear, which looks like a fault. Use 8, or 1 to turn it off.', path);
    }
    if (out.samples > 32) {
        warn(`${path}.samples of ${out.samples} costs ${out.samples}x the render for a `
            + 'difference nobody can see past about 16', path);
    }
    return out;
}

/** The multiplier this setting applies to render time, for a preflight to report. */
export const motionBlurCost = (mb) => (mb ? Math.max(1, Math.round(mb.samples)) : 1);

/**
 * sRGB transfer functions, scalar, on 0..1.
 *
 * Written out rather than approximated as a 2.2 power: the linear segment
 * near black is the part that matters here, because a motion blur spends most
 * of its pixels in shadow and a pure power law crushes them.
 */
/**
 * The knee, defined ONCE and the inverse derived from it.
 *
 * The specification quotes both ends -- 0.04045 encoded and 0.0031308 linear
 * -- each rounded independently, and they are not exact inverses: 0.04045 /
 * 12.92 is 0.00313080495..., which is greater than the quoted 0.0031308. So a
 * value sitting exactly on the knee decodes with the linear segment and
 * re-encodes with the power segment, and the round trip is off by 3e-8. Small,
 * but it is the kind of inconsistency that makes an exact-round-trip test
 * impossible to write and therefore makes the next person loosen the test
 * instead of fixing the cause.
 */
const SRGB_KNEE = 0.04045;
const LINEAR_KNEE = SRGB_KNEE / 12.92;

export function srgbToLinear(c) {
    return c <= SRGB_KNEE ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}
export function linearToSrgb(c) {
    const v = c <= LINEAR_KNEE ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
    return v < 0 ? 0 : v > 1 ? 1 : v;
}

/**
 * A 256-entry byte-to-linear table.
 *
 * Decoding is from a byte, so it has exactly 256 possible inputs and a table
 * is exact rather than approximate. Encoding does not get a table of the same
 * kind: its input is a continuous average, and quantising that to 256 buckets
 * before rounding to a byte would throw away the precision the averaging just
 * bought.
 */
export function buildDecodeTable() {
    const t = new Float32Array(256);
    for (let i = 0; i < 256; i++) t[i] = srgbToLinear(i / 255);
    return t;
}

/**
 * Average an accumulator of linear samples back into 8-bit sRGB, in place.
 *
 * `acc` holds the SUM of `count` subframes, RGB in linear light and alpha
 * left linear in the 0..255 sense -- alpha is a coverage fraction, not a
 * colour, so it is not transfer-encoded. Blurring alpha in a gamma curve is a
 * mistake that shows up as a halo on an edge against transparency.
 */
export function resolveAccumulator(acc, count, out) {
    const n = Math.max(1, count);
    for (let i = 0; i < out.length; i += 4) {
        out[i] = Math.round(linearToSrgb(acc[i] / n) * 255);
        out[i + 1] = Math.round(linearToSrgb(acc[i + 1] / n) * 255);
        out[i + 2] = Math.round(linearToSrgb(acc[i + 2] / n) * 255);
        out[i + 3] = Math.round(acc[i + 3] / n);
    }
    return out;
}

/** Add one subframe's bytes into the linear accumulator. */
export function accumulateInto(acc, bytes, decode) {
    for (let i = 0; i < bytes.length; i += 4) {
        acc[i] += decode[bytes[i]];
        acc[i + 1] += decode[bytes[i + 1]];
        acc[i + 2] += decode[bytes[i + 2]];
        acc[i + 3] += bytes[i + 3];
    }
    return acc;
}
