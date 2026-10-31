/**
 * Per-character delivery: rate and pitch, independently.
 *
 * Why this exists: there is exactly ONE Swahili voice in the Piper catalogue
 * (`sw_CD-lanfrica-medium`, confirmed against the catalogue's own path map --
 * 1 of 119). A Swahili five-hander therefore shares one model, and without
 * this module it renders as five identical deliveries, which is not a cast.
 *
 * Why it is post-processing rather than a synthesiser setting: Piper does
 * expose `length_scale`, but `vits-web` reads all three inference scales from
 * the model's own JSON and gives the caller no override -- and VITS has no
 * pitch input at all. Reshaping the samples afterwards costs one vendored
 * patch less and works for every provider, including a recorded take.
 *
 * Two primitives, composed:
 *   - pitch by RESAMPLING, which multiplies every frequency by `p` and
 *     divides the duration by `p`; the two cannot be separated this way.
 *   - duration back by WSOLA time-stretch, which leaves pitch alone.
 *
 * See docs/26-DELIVERY.md.
 */

/**
 * Where the method stops being honest. Past roughly +/-40% the formants move
 * far enough that the result reads as a tape at the wrong speed rather than
 * as a person of a different build.
 */
export const DELIVERY_RANGE = { min: 0.6, max: 1.6 };

const clamp1 = (v) => Math.min(DELIVERY_RANGE.max, Math.max(DELIVERY_RANGE.min, v));

/** Is this delivery the identity? Then nothing should be touched at all. */
export const isPlainDelivery = ({ rate = 1, pitch = 1 } = {}) => rate === 1 && pitch === 1;

/**
 * Clamp a declared delivery into the usable band, saying so when it had to.
 * A silently obeyed `pitch: 3` is a bug report waiting to happen.
 */
export function clampDelivery({ rate = 1, pitch = 1 } = {}, path = 'voice') {
    const diagnostics = [];
    for (const [name, value] of [['rate', rate], ['pitch', pitch]]) {
        if (!Number.isFinite(value) || value <= 0) {
            diagnostics.push({
                severity: 'warning', path,
                message: `${name} must be a positive number; got ${value}. Using 1.`,
            });
            continue;
        }
        if (value !== clamp1(value)) {
            diagnostics.push({
                severity: 'warning', path,
                message: `${name} ${value} is outside the usable range `
                    + `${DELIVERY_RANGE.min}-${DELIVERY_RANGE.max} and was clamped to `
                    + `${clamp1(value)}. Beyond that the voice stops sounding like a `
                    + 'person and starts sounding like a tape at the wrong speed.',
            });
        }
    }
    const fix = (v) => (Number.isFinite(v) && v > 0 ? clamp1(v) : 1);
    return { rate: fix(rate), pitch: fix(pitch), diagnostics };
}

/**
 * Linear-interpolating resample. `ratio` is the read step, so ratio > 1 reads
 * faster: the output is shorter and every frequency is multiplied by `ratio`.
 */
export function resample(samples, ratio) {
    if (ratio === 1) return samples;
    const n = samples.length;
    const out = new Float32Array(Math.max(1, Math.floor(n / ratio)));
    for (let i = 0; i < out.length; i++) {
        const x = i * ratio;
        const i0 = Math.floor(x);
        const frac = x - i0;
        const a = samples[i0] ?? 0;
        const b = samples[i0 + 1] ?? a;
        out[i] = a + (b - a) * frac;
    }
    return out;
}

/** Hann window, cached per length. 50% overlap sums to exactly 1. */
const windows = new Map();
function hann(n) {
    let w = windows.get(n);
    if (!w) {
        w = new Float32Array(n);
        for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
        windows.set(n, w);
    }
    return w;
}

/**
 * Normalised cross-correlation of `a` at `ai` against `b` at `bi`, over `len`.
 *
 * Normalised rather than a bare dot product because a bare one is biased
 * toward whichever candidate window is loudest, which on speech means every
 * splice drifts toward the nearest vowel onset.
 */
function ncc(a, ai, b, bi, len) {
    let dot = 0, ea = 0, eb = 0;
    for (let i = 0; i < len; i++) {
        const x = a[ai + i] ?? 0;
        const y = b[bi + i] ?? 0;
        dot += x * y; ea += x * x; eb += y * y;
    }
    if (ea === 0 || eb === 0) return 0;
    return dot / Math.sqrt(ea * eb);
}

/**
 * WSOLA time-stretch. `ratio` > 1 makes the output longer; pitch is untouched.
 *
 * The search is the whole point. Plain overlap-add at a fixed hop splices two
 * windows at an arbitrary relative phase, so each splice partially cancels
 * the pitch period -- audible at once as the hollow warble of a naive
 * stretcher. WSOLA slides the source window within +/-`tolerance` and takes
 * the offset best correlated with the natural continuation of the segment
 * already written, so splices land in phase.
 *
 * Defaults, and why: a 46ms frame is longer than any pitch period in a human
 * voice, so every frame contains a full cycle to correlate against. Tolerance
 * is a quarter of the frame, which covers a period down to about 85Hz.
 */
export function timeStretch(samples, ratio, { sampleRate = 48000,
                                              frame = Math.round(sampleRate * 0.046) & ~1,
                                              tolerance = null } = {}) {
    if (ratio === 1) return samples;
    const n = samples.length;
    const hop = frame >> 1;                       // synthesis hop; Hann sums to 1
    const tol = tolerance ?? (frame >> 2);
    if (n < frame + 2 * tol) return resample(samples, 1 / ratio);   // too short to splice
    const analysisHop = hop / ratio;
    const w = hann(frame);
    const outLen = Math.max(frame, Math.round(n * ratio));
    const out = new Float32Array(outLen);

    let read = 0;                                 // where we are reading from
    for (let k = 0; ; k++) {
        const write = k * hop;
        if (write + frame > outLen) break;
        for (let i = 0; i < frame; i++) out[write + i] += samples[read + i] * w[i];

        // The natural continuation of the segment just used: what would have
        // followed it had we not jumped. The next read should look like this.
        const contAt = read + hop;
        const ideal = Math.round((k + 1) * analysisHop);
        if (ideal + frame + tol >= n) break;

        let best = ideal, bestScore = -Infinity;
        const lo = Math.max(0, ideal - tol);
        const hi = Math.min(n - frame - 1, ideal + tol);
        for (let cand = lo; cand <= hi; cand++) {
            const score = ncc(samples, cand, samples, contAt, hop);
            if (score > bestScore) { bestScore = score; best = cand; }
        }
        read = best;
    }
    return out;
}

/**
 * Apply a delivery to one channel of samples.
 *
 * Composition: resample by `pitch` (frequency * pitch, duration / pitch),
 * then stretch by `pitch / rate` so the final length is the original over
 * `rate`. Identity in, identity out -- the same array, not a copy, so an
 * unused feature costs nothing.
 */
export function applyDelivery(samples, sampleRate = 48000, { rate = 1, pitch = 1 } = {}) {
    if (isPlainDelivery({ rate, pitch })) return samples;
    const shifted = resample(samples, pitch);
    const stretched = timeStretch(shifted, pitch / rate, { sampleRate });
    // Overlap-add can sum two well-correlated windows above the original
    // peak. Scale back rather than let the encoder clip, and only when it
    // actually happened.
    let peak = 0;
    for (let i = 0; i < stretched.length; i++) {
        const v = Math.abs(stretched[i]);
        if (v > peak) peak = v;
    }
    if (peak > 0.995) {
        const g = 0.995 / peak;
        for (let i = 0; i < stretched.length; i++) stretched[i] *= g;
    }
    return stretched;
}

/**
 * Apply a delivery to a whole AudioBuffer, returning a new one.
 *
 * `AudioBuffer` is constructible without an AudioContext in every browser
 * this engine runs in, and `OfflineMixer` assigns the result straight to an
 * `AudioBufferSourceNode`, so it has to be a real one and not a shim.
 */
export function deliverBuffer(buffer, delivery = {}, { makeBuffer = null } = {}) {
    if (!buffer || isPlainDelivery(delivery)) return buffer;
    const channels = [];
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
        channels.push(applyDelivery(buffer.getChannelData(ch), buffer.sampleRate, delivery));
    }
    const length = channels[0].length;
    const make = makeBuffer
        ?? ((opts) => new AudioBuffer(opts));
    const out = make({ length, numberOfChannels: channels.length, sampleRate: buffer.sampleRate });
    for (let ch = 0; ch < channels.length; ch++) out.copyToChannel(channels[ch], ch);
    return out;
}
