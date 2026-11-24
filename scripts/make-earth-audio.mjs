/**
 * The score and effects for "Inside the Earth", synthesized.
 *
 *   node scripts/make-earth-audio.mjs
 *
 * Written rather than sourced, for the reason `make-music.mjs` gives: a film
 * in this repo has to be renderable by anyone who clones it, and that rules
 * out anybody else's recording.
 *
 * # Why a documentary bed is not a fight cue
 *
 * `make-music.mjs` writes a 152 bpm minor-pentatonic battle cue, and it is
 * the only music this engine has ever made. A science explainer wants the
 * opposite of all of it: no drums, no key change, no sections that resolve.
 * What it wants is a *drone with motion inside it* -- a held low fifth, a
 * slow pad that breathes, and a sparse bell figure that marks the beats of
 * the argument without ever becoming a tune you follow instead of the voice.
 *
 * So this is additive synthesis over a fixed pitch set, with every envelope a
 * function of time rather than of a sequencer. Fixed seed, so the file comes
 * out byte-identical every run -- a golden-hash check is worth nothing
 * against a random score.
 *
 * # The one number that matters
 *
 * A bed under narration has to sit about 18 dB below it. Louder and it
 * competes; quieter and it is a hiss. The cue is written at a peak of about
 * -12 dBFS here and the film mixes it at `gain: 0.3`, which lands it around
 * -22 dBFS against dialogue levelled to -17.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const RATE = 48000;

let seed = 0x51f3a7d;
const rnd = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return ((seed >>> 0) / 0xffffffff);
};
const noise = () => rnd() * 2 - 1;
const clamp = (v) => Math.max(-1, Math.min(1, v));
const TAU = Math.PI * 2;

/** 16-bit mono PCM WAV. */
function wav(samples) {
    const n = samples.length;
    const buf = Buffer.alloc(44 + n * 2);
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
    buf.write('fmt ', 12); buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(RATE, 24); buf.writeUInt32LE(RATE * 2, 28);
    buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
    buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) {
        buf.writeInt16LE(Math.round(clamp(samples[i]) * 32600), 44 + i * 2);
    }
    return buf;
}

const write = async (name, samples, peak = 0.25) => {
    let max = 0;
    for (const s of samples) max = Math.max(max, Math.abs(s));
    const g = max > 0 ? peak / max : 1;
    for (let i = 0; i < samples.length; i++) samples[i] *= g;
    const out = `films/assets/${name}.wav`;
    await mkdir(join(ROOT, dirname(out)), { recursive: true });
    await writeFile(join(ROOT, out), wav(samples));
    console.log(`  ${out}  ${(samples.length / RATE).toFixed(1)}s  `
        + `${(wav(samples).length / 1e6).toFixed(2)} MB  peak ${(20 * Math.log10(peak)).toFixed(1)} dBFS`);
};

/**
 * A one-pole low-pass, applied in place.
 *
 * Every additive voice here is a stack of sines, and a stack of sines with
 * hard onsets is a stack of clicks. One pole is enough: this is a bed, and
 * its job is to not be noticed.
 */
function lowpass(buf, hz) {
    const a = Math.exp(-TAU * hz / RATE);
    let y = 0;
    for (let i = 0; i < buf.length; i++) {
        y = (1 - a) * buf[i] + a * y;
        buf[i] = y;
    }
}

// ---------------------------------------------------------------- the bed
/**
 * D natural minor, held. The film's whole argument is "go deeper", so the
 * register descends: the pad opens on the fifth and drops to the root under
 * the core shots, which is as much narrative as a bed should carry.
 */
const BED_SECONDS = 68;
const D2 = 73.42;
const semi = (n) => D2 * Math.pow(2, n / 12);
const PAD = [0, 7, 12, 15, 19, 24];           // root, 5th, 8ve, m3, 5th, 8ve

{
    const n = Math.round(BED_SECONDS * RATE);
    const bed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const t = i / RATE;
        let v = 0;

        // The drone: root and fifth, with a slow beat between two detuned
        // copies. The beat is the only thing moving for the first eight
        // seconds and it is what stops the opening reading as a held organ
        // chord.
        v += 0.5 * Math.sin(TAU * D2 * t);
        v += 0.42 * Math.sin(TAU * (D2 * 1.0013) * t);
        v += 0.3 * Math.sin(TAU * semi(7) * t);

        // The pad. Each partial breathes on its own period, so the chord
        // never arrives anywhere -- which is the point of a bed.
        for (const [k, iv] of PAD.entries()) {
            const f = semi(iv);
            const breathe = 0.5 + 0.5 * Math.sin(TAU * (0.031 + k * 0.0094) * t + k);
            // A slow descent: the upper partials fade across the film as the
            // camera goes deeper.
            const descend = 1 - 0.55 * Math.min(1, Math.max(0, (t - 26) / 28)) * (iv / 24);
            v += (0.14 / (1 + k * 0.5)) * breathe * descend * Math.sin(TAU * f * t + k * 1.7);
        }

        // A sparse bell on a 6.4 s grid: eight strikes across the film, which
        // is roughly one per section, and each is a struck sine with a long
        // decay rather than a note with a pitch to follow.
        const period = 6.4;
        const phase = t % period;
        if (phase < 3.4) {
            const strike = Math.floor(t / period);
            const f = semi([19, 24, 22, 19, 26, 24, 19, 22][strike % 8]);
            const env = Math.exp(-phase * 1.45);
            v += 0.16 * env * Math.sin(TAU * f * t);
            v += 0.06 * env * env * Math.sin(TAU * f * 2.01 * t);
        }

        // Air: a breath of filtered noise, so the bed has a floor and does
        // not sound synthesised against the voice's own room tone.
        v += 0.035 * noise();

        // Overall shape: in over 2 s, out over the last 4.
        const fade = Math.min(1, t / 2.2) * Math.min(1, (BED_SECONDS - t) / 4);
        bed[i] = v * 0.17 * fade;
    }
    lowpass(bed, 2600);
    await write('earth-bed', bed, 0.25);
}

// ------------------------------------------------------------- the effects
/**
 * `open` -- the wedge leaving.
 *
 * A downward sweep plus a short low impact. It has to read as mass moving,
 * not as a whoosh: the sweep descends (something opening up and away) and
 * the impact is at 44 Hz with a 0.5 s tail, which is a body rather than a
 * click.
 */
{
    const n = Math.round(3.2 * RATE);
    const s = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const t = i / RATE;
        // Sweep: 520 Hz down to 90 over 1.6 s, exponential, so the pitch
        // falls the way a real falling body's Doppler does.
        const f = 520 * Math.exp(-t * 1.1);
        const env = Math.exp(-t * 1.3) * Math.min(1, t / 0.06);
        let v = 0.45 * env * Math.sin(TAU * f * t);
        v += 0.2 * env * Math.sin(TAU * f * 1.5 * t);
        // Grit: filtered noise under the sweep, so it has a surface.
        v += 0.3 * env * noise();
        // The seat, 1.2 s in, when the wedge clears the body.
        const dt = t - 1.15;
        if (dt > 0) {
            const impact = Math.exp(-dt * 4.2);
            v += 0.55 * impact * Math.sin(TAU * 44 * dt);
            v += 0.3 * impact * Math.sin(TAU * 66 * dt);
            v += 0.18 * Math.exp(-dt * 26) * noise();
        }
        s[i] = v * 0.5;
    }
    lowpass(s, 4200);
    await write('earth-open', s, 0.36);
}

/**
 * `core` -- the inner-core rumble.
 *
 * Almost subsonic, and deliberately featureless. Its job is to make the last
 * third of the film feel like it is somewhere else, and anything with a
 * recognisable pitch would become a note the narration has to fight.
 */
{
    const n = Math.round(10 * RATE);
    const s = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const t = i / RATE;
        const env = Math.min(1, t / 1.8) * Math.min(1, (10 - t) / 2.6);
        let v = 0.5 * Math.sin(TAU * 31 * t + 1.4 * Math.sin(TAU * 0.21 * t));
        v += 0.3 * Math.sin(TAU * 47.3 * t);
        v += 0.25 * noise();
        s[i] = v * env * 0.4;
    }
    lowpass(s, 190);
    await write('earth-core', s, 0.3);
}

/**
 * `swell` -- the close.
 *
 * A rising fifth under the last line. Six seconds, arriving on the downbeat
 * of nothing in particular, because the film ends on a sentence and not on a
 * cadence.
 */
{
    const n = Math.round(6.5 * RATE);
    const s = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const t = i / RATE;
        const env = Math.min(1, t / 3.0) * Math.min(1, (6.5 - t) / 2.2);
        let v = 0;
        for (const [k, iv] of [0, 7, 12, 19].entries()) {
            v += (0.3 / (1 + k * 0.4)) * Math.sin(TAU * semi(iv) * t + k);
        }
        v += 0.1 * Math.sin(TAU * semi(24) * t) * Math.min(1, Math.max(0, (t - 2.4) / 2.0));
        s[i] = v * env * 0.3;
    }
    lowpass(s, 3200);
    await write('earth-swell', s, 0.3);
}

console.log('done');
