import { hashString } from '../util/id.js';
import { lipsyncLine } from '../audio/lipsync.js';
import { createCue } from '../audio/cues.js';
import { normalizeGain, speechRms, toDb } from '../audio/loudness.js';
import { resolveVoices } from './catalog.js';
import { clampDelivery, deliverBuffer, isPlainDelivery } from '../audio/delivery.js';
import { takeKeyOf } from './takeCache.js';

/**
 * Turns a compiled film's dialogue into audio cues plus viseme tracks.
 *
 * Runs after compilation and before rendering, because lipsync needs real
 * samples: the envelope decides when the mouth moves, and the text decides
 * what shape it makes.
 *
 * Synthesis is cached by (voice, text, delivery, language) at two levels: the
 * `buffers` map for this run, and an optional `takeCache` that survives
 * between runs. Both are keyed on `takeKeyOf`, so the identity of a take is
 * decided in one place.
 *
 * This docstring used to claim the caching outright and it was not true. The
 * asset id was computed AFTER synthesis and only ever used to label the
 * buffer, so two identical lines in one film were synthesized twice and
 * nothing at all was kept between runs. For Piper that cost seconds. For
 * Kokoro it is an 86 MB model load per render, in a fresh headless profile
 * with an empty cache, which is the whole reason neither of the two engines
 * added in Phase 39 had ever rendered a film. See `takeCache.js`.
 */
export async function synthesizeDialogue({
    lipsyncJobs, registry, buffers = {}, fps = 24,
    sampleRate = 48000, onProgress = null, existingAssets = {},
    // Level-match every voice to the same speech loudness. Two Piper voices
    // saying the same sentence differ by 6.6 dB, which in a scene with five
    // characters is one of them shouting for no authored reason.
    normalize = true, voiceLevel = 0.06,
    // false renders a line SILENT rather than in a stand-in voice. A series
    // cast against specific recorded people wants this: a silent line is a
    // bug you notice, a stand-in is one you ship. See VoiceRegistry.
    allowVoiceFallback = true,
    /**
     * An optional store that outlives the run: `{ get(key), put(key, entry) }`
     * where an entry is `{ audioBuffer, phonemes }`. Injected rather than
     * constructed, so this module stays pure and the transport -- HTTP to the
     * dev server, in this engine -- lives outside it.
     */
    takeCache = null,
}) {
    const cues = [];
    const tracks = [];
    const diagnostics = [];
    let done = 0;

    for (const job of lipsyncJobs) {
        const { nodeId, speaker, text, at, voiceSpec, audioAssetId, lipsync = true,
                durationSec, delivery = null } = job;
        let buffer = null;
        let phonemes = null;
        /**
         * The identity of this take, decided before anything is synthesized.
         *
         * It used to be computed afterwards, which is why the caching this
         * function advertised did not exist: you cannot look up a key you
         * have not made yet.
         */
        const takeKey = takeKeyOf({ voiceSpec, text, delivery, lang: job.lang ?? null });
        const takeId = audioAssetId ?? `vo_${hashString(takeKey)}`;

        /** Synthesize this line and, if there is a cache, keep it. */
        const speak = async () => {
            const result = await registry.synthesize(voiceSpec, {
                text, allowFallback: allowVoiceFallback });
            if (!result?.audioBuffer) return null;
            // Delivery BEFORE levelling. Resampling and the WSOLA crossfades
            // both move the measured RMS, so normalising first and reshaping
            // after would undo the levelling and reintroduce the 6.6 dB gap
            // -- this time between two characters sharing one model.
            const fresh = {
                audioBuffer: delivery && !isPlainDelivery(delivery)
                    ? deliverBuffer(result.audioBuffer, delivery)
                    : result.audioBuffer,
                phonemes: result.phonemes ?? null,
            };
            if (!takeCache) return fresh;
            /**
             * Store, then use what a later run would READ.
             *
             * The cache holds 16-bit PCM and a model emits float, so using
             * the float here and the decoded WAV next time would make a cold
             * render differ from a warm one at about -90 dBFS -- a difference
             * nobody would ever be able to attribute to anything.
             */
            return (await takeCache.put(takeKey, fresh)) ?? fresh;
        };

        try {
            if (audioAssetId && (buffers[audioAssetId] || existingAssets[audioAssetId])) {
                // An explicit pre-recorded clip always wins over synthesis.
                buffer = buffers[audioAssetId] ?? existingAssets[audioAssetId];
            } else if (buffers[takeId] || existingAssets[takeId]) {
                // Said already, in this run, by this voice, with this
                // delivery. Two characters sharing a model and a line is the
                // common case in a two-hander.
                buffer = buffers[takeId] ?? existingAssets[takeId];
            } else if (text && registry) {
                const entry = (takeCache ? await takeCache.get(takeKey) : null)
                    ?? await speak();
                if (entry?.audioBuffer) {
                    buffer = entry.audioBuffer;
                    phonemes = entry.phonemes ?? null;
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
            // `takeId` above: the delivery is part of the identity, because
            // two characters sharing one model and saying the same words are
            // two different takes.
            const assetId = takeId;
            buffers[assetId] = buffer;
            // Normalise, then the voice's own trim, then the line's. The line
            // is last so an author's deliberate whisper survives the levelling.
            const auto = normalize
                ? normalizeGain(buffer.getChannelData(0), buffer.sampleRate, { target: voiceLevel })
                : 1;
            cues.push(createCue({
                id: `${nodeId}@${at}`, assetId, at, bus: 'voice',
                gain: auto * (job.voiceGain ?? 1) * (job.gain ?? 1),
            }));
            if (normalize && (auto > 2 || auto < 0.5)) {
                diagnostics.push({
                    severity: 'info',
                    path: `dialogue:${speaker}@${at}`,
                    message: `Voice levelled by ${toDb(auto)} dB `
                        + `(measured ${speechRms(buffer.getChannelData(0), buffer.sampleRate)
                            .rms.toFixed(4)} against a ${voiceLevel} target).`,
                });
            }
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
    // Preset names resolve to specs first, so a film may cast by ROLE
    // ("elder-m-en") rather than by model id, and still say the id outright
    // where it wants to.
    const resolved = resolveVoices(film.voices ?? {});
    const voices = resolved.voices;
    const out = {};
    const gains = {};
    const deliveries = {};
    /**
     * The language each character speaks, where the film says so.
     *
     * `langOfSpec` can only read a Piper model id ("tts:sw_CD-lanfrica-..."),
     * so ANY other provider -- a cloned VoiceStudio voice, an uploaded take,
     * a recording -- carries no language at all and every pacing estimate
     * falls back to English. A Swahili film cast against real Swahili voices
     * was therefore measured at the English word rate, and reported gaps that
     * were not there. A voice may now simply declare `lang`.
     */
    const langs = {};
    const diagnostics = [...resolved.diagnostics];
    for (const [name, char] of Object.entries(film.characters ?? {})) {
        const ref = char.voice;
        if (!ref) continue;
        const entry = voices[ref];
        if (entry?.spec) {
            out[name] = entry.spec;
            // A per-VOICE trim, so casting a character quieter is one edit
            // rather than a `gain` on every line they speak.
            if (entry.gain != null) gains[name] = entry.gain;
            if (entry.lang) langs[name] = entry.lang;
            // Rate and pitch, likewise per voice. This is what lets five
            // characters share the one Swahili model and still be a cast;
            // see docs/26-DELIVERY.md.
            if (entry.rate != null || entry.pitch != null) {
                const d = clampDelivery({ rate: entry.rate, pitch: entry.pitch },
                                        `voices.${ref}`);
                diagnostics.push(...d.diagnostics);
                if (!isPlainDelivery(d)) deliveries[name] = { rate: d.rate, pitch: d.pitch };
            }
        } else if (String(ref).includes(':')) out[name] = ref;   // inline spec
        else {
            diagnostics.push({
                severity: 'warning',
                path: `characters.${name}.voice`,
                message: `Voice "${ref}" is not declared in the film's voices block.`,
            });
        }
    }
    return { castBySpeaker: out, voiceGains: gains, voiceDeliveries: deliveries,
             voiceLangs: langs, diagnostics };
}
