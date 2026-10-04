/**
 * Amplitude analysis. Pure: Float32Array in, Float32Array / spans out, so it
 * is tested in Node against synthesized signals with no browser involved.
 */

/**
 * Per-frame RMS, smoothed with a short moving average.
 *
 * One value per video frame is exactly the resolution lipsync needs -- the
 * viseme track can only change once per frame anyway.
 */
export function envelope(samples, sampleRate, fps, { smoothFrames = 2 } = {}) {
    const perFrame = sampleRate / fps;
    const frames = Math.max(1, Math.ceil(samples.length / perFrame));
    const raw = new Float32Array(frames);

    for (let f = 0; f < frames; f++) {
        const start = Math.floor(f * perFrame);
        const end = Math.min(samples.length, Math.floor((f + 1) * perFrame));
        let sum = 0;
        for (let i = start; i < end; i++) sum += samples[i] * samples[i];
        raw[f] = end > start ? Math.sqrt(sum / (end - start)) : 0;
    }

    if (smoothFrames <= 0) return raw;
    const out = new Float32Array(frames);
    for (let f = 0; f < frames; f++) {
        let sum = 0, n = 0;
        for (let k = -smoothFrames; k <= smoothFrames; k++) {
            const j = f + k;
            if (j >= 0 && j < frames) { sum += raw[j]; n++; }
        }
        out[f] = sum / n;
    }
    return out;
}

/**
 * Contiguous runs of speech.
 *
 * The threshold is relative to the envelope's own peak rather than absolute,
 * so a quietly recorded voice actor and a loud TTS render both segment
 * correctly without per-asset tuning.
 */
export function voicedSpans(env, { relThreshold = 0.12, minFrames = 2, gapFrames = 3 } = {}) {
    let peak = 0;
    for (let i = 0; i < env.length; i++) if (env[i] > peak) peak = env[i];
    if (peak <= 0) return [];
    const cut = peak * relThreshold;

    const spans = [];
    let start = -1;
    for (let f = 0; f < env.length; f++) {
        const voiced = env[f] >= cut;
        if (voiced && start < 0) start = f;
        if (!voiced && start >= 0) { spans.push({ startFrame: start, endFrame: f - 1 }); start = -1; }
    }
    if (start >= 0) spans.push({ startFrame: start, endFrame: env.length - 1 });

    // Bridge brief dips so a stop consonant inside a word does not split it.
    const merged = [];
    for (const s of spans) {
        const prev = merged[merged.length - 1];
        if (prev && s.startFrame - prev.endFrame <= gapFrames) prev.endFrame = s.endFrame;
        else merged.push({ ...s });
    }
    return merged.filter((s) => s.endFrame - s.startFrame + 1 >= minFrames);
}

/** Peak-normalized envelope, for amplitude-driven mouth opening. */
export function normalize(env) {
    let peak = 0;
    for (let i = 0; i < env.length; i++) if (env[i] > peak) peak = env[i];
    const out = new Float32Array(env.length);
    if (peak <= 0) return out;
    for (let i = 0; i < env.length; i++) out[i] = env[i] / peak;
    return out;
}
