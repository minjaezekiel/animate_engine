import { createTrack, setKey } from '../anim/Track.js';
import { envelope, voicedSpans, normalize } from './envelope.js';
import { textToVisemeSequence, phonemeToViseme } from './visemes.js';

/**
 * Builds discrete viseme tracks. Three tiers, best first:
 *
 *   1. visemesFromPhonemes -- exact, when a TTS provider returns timings.
 *   2. visemesFromText     -- the dialogue text distributed across the
 *                             measured voiced spans. Primary for recorded and
 *                             uploaded voices.
 *   3. visemesFromEnvelope -- three shapes driven by amplitude. The floor.
 *
 * Deliberately NOT included: spectral/formant classification. Band energy
 * cannot recover place of articulation, so /m/ /b/ /p/ /f/ /v/ would be
 * guessed, and a wrong viseme flickering is more noticeable than a coarse one
 * that is right. Text already carries that information for free.
 */

const EMPTY = 'closed';

function makeTrack(nodeId) {
    return createTrack({ target: nodeId, path: 'props.viseme', type: 'discrete' });
}

/** Keys only where the viseme changes; a held shape costs nothing. */
function writeFrames(track, frames, fps, offsetSec) {
    let last = null;
    for (let f = 0; f < frames.length; f++) {
        const v = frames[f] ?? EMPTY;
        if (v !== last) {
            setKey(track, offsetSec + f / fps, v, 'step');
            last = v;
        }
    }
    return track;
}

export function visemesFromPhonemes(nodeId, phonemes, { fps = 24, offsetSec = 0, durationSec } = {}) {
    const track = makeTrack(nodeId);
    setKey(track, offsetSec, EMPTY, 'step');
    for (const ph of phonemes) {
        setKey(track, offsetSec + ph.start, phonemeToViseme(ph.p), 'step');
    }
    const end = durationSec
        ?? (phonemes.length ? phonemes[phonemes.length - 1].end : 0);
    setKey(track, offsetSec + end, EMPTY, 'step');
    return track;
}

/**
 * Distribute the text's viseme sequence across the voiced spans measured from
 * the audio, and force a closed mouth everywhere else. The envelope decides
 * WHEN the mouth moves; the text decides WHAT shape it makes.
 */
export function visemesFromText(nodeId, text, samples, { sampleRate, fps = 24, offsetSec = 0 } = {}) {
    const env = envelope(samples, sampleRate, fps);
    const spans = voicedSpans(env);
    const seq = textToVisemeSequence(text);
    const frames = new Array(env.length).fill(EMPTY);

    if (seq.length === 0 || spans.length === 0) {
        return writeFrames(makeTrack(nodeId), frames, fps, offsetSec);
    }

    // Spread the sequence proportionally to each span's share of total voiced
    // time, so a long clause gets proportionally more of the sequence.
    const totalVoiced = spans.reduce((n, s) => n + (s.endFrame - s.startFrame + 1), 0);
    let cursor = 0;
    spans.forEach((span, i) => {
        const spanFrames = span.endFrame - span.startFrame + 1;
        const share = i === spans.length - 1
            ? seq.length - cursor
            : Math.max(1, Math.round((spanFrames / totalVoiced) * seq.length));
        const slice = seq.slice(cursor, cursor + share);
        cursor += share;
        if (slice.length === 0) return;
        for (let f = 0; f < spanFrames; f++) {
            const idx = Math.min(slice.length - 1, Math.floor((f / spanFrames) * slice.length));
            frames[span.startFrame + f] = slice[idx];
        }
    });

    return writeFrames(makeTrack(nodeId), frames, fps, offsetSec);
}

/** Amplitude only: closed / mid / open. The fallback when there is no text. */
export function visemesFromEnvelope(nodeId, samples, { sampleRate, fps = 24, offsetSec = 0 } = {}) {
    const env = normalize(envelope(samples, sampleRate, fps));
    const frames = new Array(env.length);
    for (let f = 0; f < env.length; f++) {
        frames[f] = env[f] < 0.12 ? 'closed' : env[f] < 0.45 ? 'mid' : 'open';
    }
    return writeFrames(makeTrack(nodeId), frames, fps, offsetSec);
}

/** Pick the best available tier for one dialogue line. */
export function lipsyncLine(nodeId, { text, samples, sampleRate, phonemes, fps = 24, offsetSec = 0, durationSec }) {
    if (phonemes?.length) {
        return visemesFromPhonemes(nodeId, phonemes, { fps, offsetSec, durationSec });
    }
    if (text && samples) {
        return visemesFromText(nodeId, text, samples, { sampleRate, fps, offsetSec });
    }
    if (samples) {
        return visemesFromEnvelope(nodeId, samples, { sampleRate, fps, offsetSec });
    }
    const track = makeTrack(nodeId);
    setKey(track, offsetSec, EMPTY, 'step');
    return track;
}
