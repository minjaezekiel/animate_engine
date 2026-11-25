/**
 * Duck the music under the dialogue.
 *
 * # Why this was overdue
 *
 * [`OfflineMixer.js`](../../audio/OfflineMixer.js) has carried the comment
 * *"One gain node per bus, so a music bed can be ducked as a group later"*
 * for several phases, and later did not happen. So a bed sat at whatever flat
 * `gain` the author guessed, and the guess had to be re-made per film --
 * which means the mix was **silently wrong the moment a line moved**. Either
 * the voice was buried or the music was inaudible, and nothing reported
 * either, because both are correct renders of what was asked for.
 *
 * # Why it is computed from the CUE LIST, not from the samples
 *
 * The tempting version analyses the voice bus's envelope and inverts it. That
 * is worse, for two reasons.
 *
 * Musically: an envelope follower ducks on every syllable and lifts in every
 * gap between words, which **pumps**. A duck should go down when someone
 * starts talking and come back up when they stop, and a line is a continuous
 * thing even though the waveform inside it is not.
 *
 * Practically: the cue list is a handful of numbers available before any
 * audio exists, so this module is pure, runs in Node, and is asserted
 * directly. An envelope follower would need real buffers and a browser to
 * test, for a worse result.
 *
 * # Shape of the automation
 *
 *   1.0 ────────╮                    ╭──────────  music, unducked
 *               ╲                   ╱
 *   0.35         ╰─────────────────╯             ducked, through the line
 *              ↑ attack          release ↑
 *          line starts        line ends
 *
 * Attack is faster than release, as it is on every compressor and for the
 * same reason: getting out of the way of a line must happen before the first
 * word, and coming back up slowly is what makes the return inaudible rather
 * than a swell.
 */

export const DUCK_DEFAULTS = {
    /**
     * -9 dB. Broadcast practice is 9 to 12 dB under speech; at less than
     * about 6 the words still fight the bed, and past about 15 the music
     * disappears entirely and the duck reads as a dropout rather than as a
     * mix.
     */
    depthDb: -9,
    /** Seconds to get out of the way. Ahead of the line, not on it. */
    attack: 0.18,
    /** Seconds to come back. Slower, so the return is not a swell. */
    release: 0.45,
    /**
     * Gaps shorter than this are bridged rather than lifted through.
     *
     * Two lines half a second apart are one piece of speech as far as a
     * listener is concerned, and lifting the bed between them is the pumping
     * this module exists to avoid. 1.2s is about the length of a breath.
     */
    bridge: 1.2,
    /** The bus that causes ducking, and the bus that gets ducked. */
    trigger: 'voice',
    target: 'music',
};

export const dbToGain = (db) => 10 ** (db / 20);

/**
 * Merge the trigger cues into the spans during which something is speaking.
 *
 * A cue's length is `duration` when it says so and the asset's length
 * otherwise, which is why `assetDurations` is a parameter: the cue list alone
 * does not know how long a take runs, and guessing would duck for the wrong
 * length on every line that does not declare one.
 */
export function speechSpans(cues, assetDurations = {}, opts = {}) {
    const { trigger, bridge } = { ...DUCK_DEFAULTS, ...opts };
    const spans = [];
    for (const cue of cues ?? []) {
        if ((cue.bus ?? 'sfx') !== trigger) continue;
        const len = cue.duration ?? assetDurations[cue.assetId] ?? 0;
        if (!(len > 0)) continue;
        spans.push([cue.at ?? 0, (cue.at ?? 0) + len]);
    }
    spans.sort((a, b) => a[0] - b[0]);
    const merged = [];
    for (const [start, end] of spans) {
        const last = merged[merged.length - 1];
        if (last && start - last[1] <= bridge) {
            // Bridge the gap. `max` rather than assignment, because a short
            // cue entirely inside a long one must not shorten it.
            last[1] = Math.max(last[1], end);
        } else merged.push([start, end]);
    }
    return merged;
}

/**
 * The gain automation for the ducked bus, as `{ t, gain }` points.
 *
 * Returns points to be played back with linear ramps, which is what both the
 * Web Audio mixer and a Node mix can consume. Empty when nothing speaks, so a
 * film with no dialogue pays nothing and its music bus is left alone
 * entirely.
 *
 * Clamped at zero: a line starting at t=0.1 with a 0.18s attack would
 * otherwise want a point at -0.08, and `setValueAtTime` on a negative time is
 * an error in some implementations and silently ignored in others. The duck
 * simply starts already down, which is also what the shot wants.
 */
export function duckAutomation(cues, assetDurations = {}, opts = {}) {
    const o = { ...DUCK_DEFAULTS, ...opts };
    const spans = speechSpans(cues, assetDurations, o);
    if (!spans.length) return [];
    const low = dbToGain(o.depthDb);
    const points = [];
    const push = (t, gain) => {
        const at = Math.max(0, +t.toFixed(6));
        const last = points[points.length - 1];
        // Two points at one instant is a step, and a step is what
        // `linearRampToValueAtTime` cannot express. The later value wins,
        // which is the one the ramp was heading for.
        if (last && Math.abs(last.t - at) < 1e-6) { last.gain = gain; return; }
        points.push({ t: at, gain });
    };
    for (const [start, end] of spans) {
        push(start - o.attack, 1);
        push(start, low);
        push(end, low);
        push(end + o.release, 1);
    }
    return points;
}

/**
 * Read a film's duck declaration.
 *
 * `true` means "do the usual thing", which is what an author wants to write
 * nine times out of ten. A number is read as a depth in dB -- and accepted
 * either signed or not, because "duck by 9 dB" and "duck to -9 dB" are the
 * same intent and insisting on the minus sign would be pedantry that costs a
 * silent mistake.
 */
export function normalizeDuck(spec, { warn = () => {}, path = 'meta.audio.duck' } = {}) {
    if (spec == null || spec === false) return null;
    /**
     * The shorthands are rewritten into the object form rather than returned
     * early, so EVERY form goes through the same validation below.
     *
     * The first version returned straight out of the numeric branch, which
     * meant `duck: 0.5` silently accepted an inaudible half-decibel while
     * `duck: { depth: 0.5 }` warned about it -- the same mistake, reported in
     * one spelling and not the other.
     */
    if (spec === true) spec = {};
    else if (typeof spec === 'number') {
        if (!Number.isFinite(spec)) { warn(`${path} is not a finite number`, path); return null; }
        spec = { depth: spec };
    }
    if (typeof spec !== 'object') {
        warn(`${path} must be true, a depth in dB, or an object`, path);
        return null;
    }
    const out = { ...DUCK_DEFAULTS };
    if (spec.depthDb != null || spec.depth != null) {
        const d = Number(spec.depthDb ?? spec.depth);
        if (Number.isFinite(d)) out.depthDb = -Math.abs(d);
        else warn(`${path}.depth is not a number`, path);
    }
    for (const k of ['attack', 'release', 'bridge']) {
        if (spec[k] == null) continue;
        const v = Number(spec[k]);
        if (Number.isFinite(v) && v >= 0) out[k] = v;
        else warn(`${path}.${k} must be a non-negative number of seconds`, path);
    }
    for (const k of ['trigger', 'target']) {
        if (typeof spec[k] === 'string' && spec[k]) out[k] = spec[k];
    }
    if (out.depthDb > -1) {
        warn(`${path} of ${out.depthDb} dB is inaudible; 9 to 12 dB is broadcast practice`, path);
    }
    if (out.depthDb < -30) {
        warn(`${path} of ${out.depthDb} dB will read as a dropout rather than a duck`, path);
    }
    return out;
}

/**
 * A description of what the duck will do, for the render log.
 *
 * The report exists because a duck is invisible in every other number the
 * engine prints: the master peak barely moves, the cue list is unchanged, and
 * the film's duration is identical. Without a line saying "ducked 9 lines" an
 * author cannot tell whether the feature ran at all.
 */
export function duckReport(points, opts = {}) {
    const o = { ...DUCK_DEFAULTS, ...opts };
    if (!points?.length) return 'duck: nothing on the trigger bus, so the bed is untouched';
    const spans = points.filter((p) => p.gain < 1).length / 2;
    const ducked = points.reduce((acc, p, i) => {
        if (p.gain >= 1 || i + 1 >= points.length) return acc;
        return acc + Math.max(0, points[i + 1].t - p.t);
    }, 0);
    return `duck: ${o.target} under ${o.trigger} by ${o.depthDb} dB over `
        + `${Math.round(spans)} span(s), ${ducked.toFixed(1)}s ducked `
        + `(attack ${o.attack}s, release ${o.release}s)`;
}
