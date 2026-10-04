/**
 * Audio cue scheduling math. Pure, no Web Audio -- this is where off-by-one
 * sync bugs live, so it is kept separate from the browser mixer and tested
 * directly in Node.
 *
 * An AudioCue is { id, assetId, at, gain, fadeIn, fadeOut, offset, duration, bus }
 * with `at` in seconds on the film timeline.
 */

export function createCue({
    id, assetId, at = 0, gain = 1,
    fadeIn = 0, fadeOut = 0, offset = 0, duration = null, bus = 'sfx',
}) {
    return { id, assetId, at, gain, fadeIn, fadeOut, offset, duration, bus };
}

/**
 * Resolve a cue to integer sample offsets at a given rate.
 *
 * Rounding (not truncating) keeps a cue at 0.6s landing on the same sample
 * whichever direction the float error fell, which is what keeps narration
 * aligned with the viseme track derived from the same number.
 */
export function cueSampleWindow(cue, sampleRate, assetDurationSec) {
    const startSample = Math.round(cue.at * sampleRate);
    const srcOffset = Math.round((cue.offset ?? 0) * sampleRate);
    const available = Math.max(0, Math.round((assetDurationSec ?? 0) * sampleRate) - srcOffset);
    const wanted = cue.duration != null ? Math.round(cue.duration * sampleRate) : available;
    const lengthSamples = Math.max(0, Math.min(wanted, available));
    return {
        startSample,
        srcOffset,
        lengthSamples,
        endSample: startSample + lengthSamples,
        fadeInSamples: Math.min(Math.round((cue.fadeIn ?? 0) * sampleRate), lengthSamples),
        fadeOutSamples: Math.min(Math.round((cue.fadeOut ?? 0) * sampleRate), lengthSamples),
    };
}

/** Total length the mix must span, in seconds. */
export function mixDuration(cues, assetDurations, sampleRate = 48000) {
    let end = 0;
    for (const cue of cues) {
        const w = cueSampleWindow(cue, sampleRate, assetDurations[cue.assetId] ?? 0);
        end = Math.max(end, w.endSample);
    }
    return end / sampleRate;
}

/** Per-sample gain for a cue's linear fades. Exposed for test and for Node mixing. */
export function cueGainAt(cue, window, sampleIndexInCue) {
    let g = cue.gain ?? 1;
    const { fadeInSamples, fadeOutSamples, lengthSamples } = window;
    if (fadeInSamples > 0 && sampleIndexInCue < fadeInSamples) {
        g *= sampleIndexInCue / fadeInSamples;
    }
    if (fadeOutSamples > 0 && sampleIndexInCue > lengthSamples - fadeOutSamples) {
        g *= Math.max(0, (lengthSamples - sampleIndexInCue) / fadeOutSamples);
    }
    return g;
}
