import { cueSampleWindow, mixDuration } from '../core/audio/cues.js';

/**
 * Renders the whole audio mix non-realtime with OfflineAudioContext.
 *
 * Non-realtime matters twice over: the result is sample-exact regardless of
 * machine load, and it completes far faster than the film's duration, so the
 * mix is ready before the first video frame is drawn. The lipsync pass then
 * reads these finished samples.
 */
export async function renderMix({ cues, buffers, sampleRate = 48000, durationSec = null }) {
    const assetDurations = {};
    for (const [id, buf] of Object.entries(buffers)) assetDurations[id] = buf?.duration ?? 0;

    const total = durationSec ?? mixDuration(cues, assetDurations, sampleRate);
    if (!(total > 0)) return null;

    const OfflineCtx = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
    if (!OfflineCtx) throw new Error('OfflineMixer: OfflineAudioContext unavailable');

    const ctx = new OfflineCtx(2, Math.ceil(total * sampleRate), sampleRate);
    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);

    // One gain node per bus, so a music bed can be ducked as a group later.
    const buses = new Map();
    const busFor = (name) => {
        let g = buses.get(name);
        if (!g) {
            g = ctx.createGain();
            g.gain.value = 1;
            g.connect(master);
            buses.set(name, g);
        }
        return g;
    };

    for (const cue of cues) {
        const buf = buffers[cue.assetId];
        if (!buf) continue;
        const w = cueSampleWindow(cue, sampleRate, buf.duration);
        if (w.lengthSamples <= 0) continue;

        const src = ctx.createBufferSource();
        src.buffer = buf;
        const gain = ctx.createGain();
        const at = w.startSample / sampleRate;
        const len = w.lengthSamples / sampleRate;
        const base = cue.gain ?? 1;

        gain.gain.setValueAtTime(w.fadeInSamples > 0 ? 0 : base, at);
        if (w.fadeInSamples > 0) {
            gain.gain.linearRampToValueAtTime(base, at + w.fadeInSamples / sampleRate);
        }
        if (w.fadeOutSamples > 0) {
            const fadeStart = at + len - w.fadeOutSamples / sampleRate;
            gain.gain.setValueAtTime(base, fadeStart);
            gain.gain.linearRampToValueAtTime(0, at + len);
        }

        src.connect(gain);
        gain.connect(busFor(cue.bus ?? 'sfx'));
        src.start(at, w.srcOffset / sampleRate, len);
    }

    return ctx.startRendering();
}

/**
 * Decode a file/ArrayBuffer at an explicit sample rate.
 *
 * The rate is forced on purpose: dropping a 44.1k buffer into a 48k render
 * plays it 8.8% fast, which reads as narration drifting out of sync and gets
 * misdiagnosed as a muxing fault.
 */
export async function decodeAudio(input, sampleRate = 48000) {
    const bytes = input instanceof ArrayBuffer ? input : await input.arrayBuffer();
    const OfflineCtx = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
    const ctx = new OfflineCtx(1, 1, sampleRate);
    return ctx.decodeAudioData(bytes.slice(0));
}
