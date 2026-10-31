/**
 * Matching one voice's loudness to another's.
 *
 * Measured, not assumed: synthesising the same sentence through two Piper
 * voices gave `sw_CD-lanfrica-medium` an RMS of 0.095 and `en_GB-alba-medium`
 * 0.044. That is **2.1x**, or about 6.6 dB -- one character in a scene
 * shouting over another for no reason an author could see or fix, because
 * nothing in the film said anything about level.
 *
 * Normalising the whole buffer would be wrong: a line that is mostly silence
 * measures quiet and would be pushed up until its few words were shouted. So
 * the measurement runs over VOICED frames only.
 *
 * The result is applied as a cue gain rather than by scaling samples: the
 * buffer stays the one the cache holds, and the mix stays a pure function of
 * the numbers.
 */

/** Frame size for the voiced/silent decision, in seconds. */
const FRAME = 0.02;

/**
 * RMS over the frames that actually carry speech.
 *
 * A frame counts as voiced when it is within `floorDb` of the loudest frame,
 * which tracks the recording rather than assuming an absolute threshold --
 * the same signal at -20 dB and at -6 dB must measure the same shape.
 *
 * @returns {{rms: number, voiced: number, frames: number, peak: number}}
 */
export function speechRms(samples, sampleRate = 48000, { floorDb = -32 } = {}) {
    const n = samples?.length ?? 0;
    if (!n) return { rms: 0, voiced: 0, frames: 0, peak: 0 };
    const size = Math.max(1, Math.round(sampleRate * FRAME));
    const frames = [];
    let peak = 0;
    for (let i = 0; i < n; i += size) {
        let sum = 0;
        const end = Math.min(n, i + size);
        for (let j = i; j < end; j++) {
            const v = samples[j];
            sum += v * v;
            const a = v < 0 ? -v : v;
            if (a > peak) peak = a;
        }
        frames.push(Math.sqrt(sum / (end - i)));
    }
    const loudest = Math.max(...frames);
    if (loudest <= 0) return { rms: 0, voiced: 0, frames: frames.length, peak };
    const floor = loudest * Math.pow(10, floorDb / 20);
    let sum = 0, voiced = 0;
    for (const f of frames) {
        if (f < floor) continue;
        sum += f * f;
        voiced++;
    }
    return {
        rms: voiced ? Math.sqrt(sum / voiced) : 0,
        voiced, frames: frames.length, peak,
    };
}

/**
 * The gain that brings `samples` to `target` RMS, without clipping.
 *
 * Clamped both ways. `maxGain` stops a nearly-silent take being amplified
 * into noise, and the peak check stops a already-hot voice being pushed into
 * distortion -- a normaliser that clips is worse than no normaliser.
 *
 * Returns 1 when there is nothing to measure, so a failure is a no-op.
 */
export function normalizeGain(samples, sampleRate = 48000, {
    target = 0.06, maxGain = 4, minGain = 0.2, ceiling = 0.97,
} = {}) {
    const { rms, peak } = speechRms(samples, sampleRate);
    if (!rms || !Number.isFinite(rms)) return 1;
    let gain = target / rms;
    gain = Math.min(maxGain, Math.max(minGain, gain));
    if (peak > 0 && peak * gain > ceiling) gain = ceiling / peak;
    return +gain.toFixed(4);
}

/** Decibels, for diagnostics a person can reason about. */
export const toDb = (ratio) => (ratio > 0 ? +(20 * Math.log10(ratio)).toFixed(2) : -Infinity);
