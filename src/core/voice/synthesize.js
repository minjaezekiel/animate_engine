import { hashString } from '../util/id.js';
import { lipsyncLine } from '../audio/lipsync.js';
import { createCue } from '../audio/cues.js';

/**
 * Turns a compiled film's dialogue into audio cues plus viseme tracks.
 *
 * Runs after compilation and before rendering, because lipsync needs real
 * samples: the envelope decides when the mouth moves, and the text decides
 * what shape it makes. Synthesis is cached by (voice, text) so re-rendering a
 * film does not re-synthesize unchanged lines.
 */
export async function synthesizeDialogue({
    lipsyncJobs, registry, buffers = {}, fps = 24,
    sampleRate = 48000, onProgress = null, existingAssets = {},
}) {
    const cues = [];
    const tracks = [];
    const diagnostics = [];
    let done = 0;

    for (const job of lipsyncJobs) {
        const { nodeId, speaker, text, at, voiceSpec, audioAssetId, lipsync = true, durationSec } = job;
        let buffer = null;
        let phonemes = null;

        try {
            if (audioAssetId && (buffers[audioAssetId] || existingAssets[audioAssetId])) {
                // An explicit pre-recorded clip always wins over synthesis.
                buffer = buffers[audioAssetId] ?? existingAssets[audioAssetId];
            } else if (text && registry) {
                const result = await registry.synthesize(voiceSpec, { text });
                if (result?.audioBuffer) {
                    buffer = result.audioBuffer;
                    phonemes = result.phonemes ?? null;
                } else {
                    diagnostics.push({
                        severity: 'warning',
                        path: `dialogue:${speaker}@${at}`,
                        message: `No voice produced audio for "${String(text).slice(0, 48)}". `
                            + 'Rendering silent with subtitle only.',
                    });
                }
            }
        } catch (err) {
            diagnostics.push({
                severity: 'warning',
                path: `dialogue:${speaker}@${at}`,
                message: `Voice synthesis failed: ${err.message}. Rendering silent.`,
            });
        }

        if (buffer) {
            const assetId = audioAssetId ?? `vo_${hashString(`${voiceSpec}|${text}`)}`;
            buffers[assetId] = buffer;
            cues.push(createCue({
                id: `${nodeId}@${at}`, assetId, at, gain: job.gain ?? 1, bus: 'voice',
            }));
        }

        if (lipsync && nodeId) {
            tracks.push(lipsyncLine(nodeId, {
                text,
                samples: buffer ? buffer.getChannelData(0) : null,
                sampleRate: buffer ? buffer.sampleRate : sampleRate,
                phonemes,
                fps,
                offsetSec: at,
                durationSec: durationSec ?? buffer?.duration,
            }));
        }

        done++;
        onProgress?.({ done, total: lipsyncJobs.length, speaker, text });
    }

    return { cues, tracks, buffers, diagnostics };
}

/**
 * Resolve each character's declared voice to a concrete spec.
 *
 * Characters name a voice from the film's `voices` block; that block maps to
 * a provider spec. Keeping the indirection means recasting a whole film is
 * one edit, and the same film renders with TTS on one machine and recorded
 * takes on another.
 */
export function castVoices(film) {
    const voices = film.voices ?? {};
    const out = {};
    const diagnostics = [];
    for (const [name, char] of Object.entries(film.characters ?? {})) {
        const ref = char.voice;
        if (!ref) continue;
        const entry = voices[ref];
        if (entry?.spec) out[name] = entry.spec;
        else if (String(ref).includes(':')) out[name] = ref;   // inline spec
        else {
            diagnostics.push({
                severity: 'warning',
                path: `characters.${name}.voice`,
                message: `Voice "${ref}" is not declared in the film's voices block.`,
            });
        }
    }
    return { castBySpeaker: out, diagnostics };
}
