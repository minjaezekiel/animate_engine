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

/**
 * Cue windows that will not produce the sound they look like they will.
 *
 * Every one of these currently ships silently. `OfflineMixer` skips a cue
 * whose window resolves to zero samples with `continue` and no report, so an
 * `offset` past the end of a file is **silence with no diagnostic** -- the
 * author hears nothing, every check in the repo passes, and the cause is a
 * number that looks perfectly reasonable in the film.
 *
 * Pure, and separate from the mixer, so the same rules can run in a `check`
 * without rendering anything.
 */
export function checkCues(cues, assetDurations = {}) {
    const findings = [];
    const add = (severity, cue, message) => findings.push({
        severity, path: `audio:${cue.id ?? cue.assetId}`, message });

    for (const cue of cues ?? []) {
        const have = assetDurations[cue.assetId];
        if (have == null) {
            add('warning', cue, `cue references asset '${cue.assetId}', which is not loaded`);
            continue;
        }
        const offset = cue.offset ?? 0;
        if (offset >= have - 1e-6) {
            add('error', cue, `offset ${offset}s is past the end of a ${have.toFixed(2)}s asset, `
                + 'so this cue renders SILENT with no other sign of it');
            continue;
        }
        const w = cueSampleWindow(cue, 48000, have);
        if (w.lengthSamples <= 0) {
            add('error', cue, 'this cue resolves to zero length and renders silent');
            continue;
        }
        const length = w.lengthSamples / 48000;
        if (cue.duration != null && cue.duration > have - offset + 1e-3) {
            add('warning', cue, `asks for ${cue.duration}s from ${offset}s into a `
                + `${have.toFixed(2)}s asset; clamped to ${length.toFixed(2)}s`);
        }
        // A fade longer than the cue it is on never reaches its own target,
        // so the author's intended level is never heard.
        const fades = (cue.fadeIn ?? 0) + (cue.fadeOut ?? 0);
        if (fades > length + 1e-6) {
            add('warning', cue, `fades total ${fades.toFixed(2)}s on a ${length.toFixed(2)}s cue, `
                + 'so it never reaches its own level');
        }
    }

    // Two beds on one bus at once is almost always a mistake -- a scene's
    // music left running under the next scene's -- and it is inaudible as a
    // mistake because the result is simply denser.
    const music = (cues ?? []).filter((c) => (c.bus ?? 'sfx') === 'music')
        .map((c) => {
            const have = assetDurations[c.assetId] ?? 0;
            const w = cueSampleWindow(c, 48000, have);
            return { cue: c, start: c.at ?? 0, end: (c.at ?? 0) + w.lengthSamples / 48000 };
        })
        .sort((a, b) => a.start - b.start);
    for (let i = 1; i < music.length; i++) {
        const prev = music[i - 1];
        const cur = music[i];
        const overlap = prev.end - cur.start;
        if (overlap > 0.25) {
            findings.push({
                severity: 'info',
                path: `audio:${cur.cue.id ?? cur.cue.assetId}`,
                message: `overlaps the previous music cue by ${overlap.toFixed(2)}s. `
                    + 'Two beds at once is denser rather than obviously wrong, which is why '
                    + 'it is worth saying.',
            });
        }
    }
    return findings;
}
