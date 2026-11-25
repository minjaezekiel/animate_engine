import { cueSampleWindow, mixDuration } from '../core/audio/cues.js';
import { duckAutomation, duckReport } from '../core/audio/ducking.js';

/**
 * Renders the whole audio mix non-realtime with OfflineAudioContext.
 *
 * Non-realtime matters twice over: the result is sample-exact regardless of
 * machine load, and it completes far faster than the film's duration, so the
 * mix is ready before the first video frame is drawn. The lipsync pass then
 * reads these finished samples.
 */
export async function renderMix({
    cues, buffers, sampleRate = 48000, durationSec = null,
    /**
     * The true-peak ceiling the finished mix is held under, linear.
     *
     * 0.891 is -1 dBFS. Encoders are not sample-exact -- a lossy codec can
     * overshoot its input by a fraction of a dB on a transient -- so a mix
     * that touches 0.0 dBFS comes back out of AAC above it and clips on
     * playback. One dB of headroom is the standard answer and costs nothing
     * audible.
     */
    ceiling = 0.891,
    /**
     * Duck the music bus under the voice bus. `null` leaves it alone.
     *
     * Normalised by `normalizeDuck` before it gets here, so this is a plain
     * options object and the mixer makes no decisions about depth or timing.
     */
    duck = null,
    /** Called with a line about what the master stage did, if anything. */
    onReport = null,
} = {}) {
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

    /**
     * One gain node per bus -- which is what makes ducking a group possible,
     * and is what the comment here promised for several phases before
     * `duckAutomation` turned up to use it.
     */
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
        if (w.lengthSamples <= 0) {
            // This used to be a bare `continue`. An `offset` past the end of
            // a file therefore rendered SILENT with no diagnostic anywhere:
            // the author heard nothing and every check in the repo passed it.
            onReport?.(`cue '${cue.id ?? cue.assetId}' resolves to zero length `
                + `(offset ${cue.offset ?? 0}s into a ${buf.duration.toFixed(2)}s asset) `
                + 'and renders silent');
            continue;
        }

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

    /**
     * The duck, applied to the target bus as one automation curve.
     *
     * After every cue, because the bus node for `music` only exists once
     * something has been routed to it -- and if nothing was, there is no bed
     * to duck and the automation is skipped rather than creating an empty
     * bus.
     */
    if (duck) {
        const points = duckAutomation(cues, assetDurations, duck);
        const bed = buses.get(duck.target);
        if (!points.length) {
            onReport?.(duckReport(points, duck));
        } else if (!bed) {
            onReport?.(`duck: nothing is routed to the '${duck.target}' bus, so there is `
                + 'no bed to duck');
        } else {
            // An anchor at zero, because the first ramp needs a value to ramp
            // FROM: `linearRampToValueAtTime` interpolates from the previous
            // scheduled event, and with none it jumps instead.
            bed.gain.setValueAtTime(points[0].t > 0 ? 1 : points[0].gain, 0);
            for (const pt of points) {
                if (pt.t <= 0) bed.gain.setValueAtTime(pt.gain, 0);
                else bed.gain.linearRampToValueAtTime(pt.gain, pt.t);
            }
            onReport?.(duckReport(points, duck));
        }
    }

    const rendered = await ctx.startRendering();

    /**
     * The master stage, which did not exist.
     *
     * `master.gain.value = 1` and nothing else: every cue summed straight
     * into the destination, and if they summed past 1.0 the samples were
     * written past full scale and the encoder clipped them. There was no
     * limiter, no ceiling, and -- worse -- no REPORT, so a film came out
     * distorted and every check in the repo passed it.
     *
     * "Inside the Earth" found it: a music bed at 0.3, dialogue levelled to
     * 0.14 RMS and a closing swell at 0.42 reached +0.3 dBFS, and the only
     * reason anyone knew is that `measure-audio.mjs` happened to be pointed
     * at the finished file afterwards.
     *
     * # Why a flat gain and not a compressor
     *
     * A `DynamicsCompressorNode` would be one line and is the obvious
     * answer. It is the wrong one here: it changes the shape of the
     * programme, it is tuned by four parameters nobody in this repo has a
     * reason to have an opinion about, and the whole contract of this
     * pipeline is that the output is a pure function of the input.
     *
     * Measuring the true peak and scaling the entire mix by one number
     * preserves every relative level exactly, is trivially reproducible, and
     * is what a mastering engineer does first anyway. It also makes the
     * problem VISIBLE -- the report says how much it had to pull back, which
     * is the cue to fix the gains rather than lean on the safety net.
     */
    let peak = 0;
    for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
        const data = rendered.getChannelData(ch);
        for (let i = 0; i < data.length; i++) {
            const v = data[i] < 0 ? -data[i] : data[i];
            if (v > peak) peak = v;
        }
    }
    const db = (v) => (v > 0 ? 20 * Math.log10(v) : -Infinity);
    if (peak > ceiling) {
        const g = ceiling / peak;
        for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
            const data = rendered.getChannelData(ch);
            for (let i = 0; i < data.length; i++) data[i] *= g;
        }
        onReport?.(`master: peak was ${db(peak).toFixed(2)} dBFS, pulled back `
            + `${db(g).toFixed(2)} dB to ${db(ceiling).toFixed(1)} dBFS. `
            + 'Lower the cue gains rather than relying on this.');
    } else {
        onReport?.(`master: peak ${db(peak).toFixed(2)} dBFS, `
            + `${(db(ceiling) - db(peak)).toFixed(2)} dB of headroom.`);
    }
    return rendered;
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
