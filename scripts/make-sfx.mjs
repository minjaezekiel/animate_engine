/**
 * The "Game Physics" sound effects, synthesized.
 *
 *   node scripts/make-sfx.mjs            # writes films/physics/sfx/*.wav
 *
 * Written rather than sourced, for the reason `make-music.mjs` gives: a film
 * in this repo should be renderable by anyone who clones it, and that rules
 * out anybody else's recording. Pure maths to 16-bit PCM, no dependencies.
 *
 * `films/physics/sfx/` is gitignored, exactly as `demo/assets/*.wav` is — the
 * WAVs are build output, and this script is the source. Run it once on a
 * fresh checkout; a film whose assets are missing renders silent and says so
 * rather than failing.
 *
 * ## Why these six
 *
 * The brief asked for "cinematic sound effects" and the hook is written
 * around a *CLICK*. On a muted-by-default feed sound is not what carries the
 * information — the subtitles do that — but it is most of what makes a video
 * feel produced rather than assembled. So the set is small and functional:
 * one sound per thing that actually happens in the picture.
 *
 *   click    the cue striking the ball. Hard, wooden, very short.
 *   impact   ball on ball. Lower, rounder, a little longer.
 *   whoosh   a scene change.
 *   pop      an element arriving on a board.
 *   tick     a row in a list. A quieter pop, so a six-item build does not
 *            sound like six separate events competing with the narration.
 *   riser    the title, and the last beat before the end card.
 *
 * ## The one rule that matters
 *
 * Everything here is mixed to sit UNDER narration. The voices are the film;
 * these are punctuation. Peak levels are deliberately low (0.18–0.5) and the
 * film's own cue gains take them lower still — `24-VOICE-AND-DELIVERY.md`
 * records a measured 6.6 dB spread between two voices, so there is no
 * headroom to spend on a whoosh.
 */
import { mkdir, writeFile } from 'node:fs/promises';

const RATE = 48000;
const OUT = new URL('../films/physics/sfx/', import.meta.url).pathname;

/** Fixed seed, so the same cue comes out byte-identical every run. */
let seed = 0x9e3779b9;
const noise = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return ((seed >>> 0) / 0xffffffff) * 2 - 1;
};

const clamp = (v) => Math.max(-1, Math.min(1, v));
const n = (sec) => Math.round(sec * RATE);

/** Exponential decay, the envelope every percussive sound actually has. */
const decay = (t, tau) => Math.exp(-t / tau);

/** A one-pole low-pass, for taking the fizz off noise. */
function lowpass(buf, cutoff) {
    const a = Math.exp(-2 * Math.PI * cutoff / RATE);
    let y = 0;
    for (let i = 0; i < buf.length; i++) { y = (1 - a) * buf[i] + a * y; buf[i] = y; }
    return buf;
}

/** A one-pole high-pass. */
function highpass(buf, cutoff) {
    const a = Math.exp(-2 * Math.PI * cutoff / RATE);
    let prevIn = 0, y = 0;
    for (let i = 0; i < buf.length; i++) {
        y = a * (y + buf[i] - prevIn); prevIn = buf[i]; buf[i] = y;
    }
    return buf;
}

/** Fade the last few ms to zero, so nothing ends on a click of its own. */
function tail(buf, ms = 8) {
    const k = Math.min(buf.length, n(ms / 1000));
    for (let i = 0; i < k; i++) buf[buf.length - 1 - i] *= i / k;
    return buf;
}

const peak = (buf, to) => {
    let m = 0;
    for (const v of buf) m = Math.max(m, Math.abs(v));
    if (m > 0) for (let i = 0; i < buf.length; i++) buf[i] *= to / m;
    return buf;
};

// ---------------------------------------------------------------------------
// The sounds
// ---------------------------------------------------------------------------

/**
 * CLICK — a cue tip on a phenolic ball.
 *
 * Two inharmonic partials well above 1kHz with a very fast decay, over a
 * noise transient of about 4ms. The inharmonicity is the point: harmonic
 * partials read as a musical note, and a cue strike is a knock.
 */
function click() {
    const buf = new Float32Array(n(0.12));
    const tr = new Float32Array(buf.length);
    for (let i = 0; i < buf.length; i++) {
        const t = i / RATE;
        tr[i] = noise() * decay(t, 0.0025);
        buf[i] = 0.55 * Math.sin(2 * Math.PI * 2300 * t) * decay(t, 0.012)
               + 0.35 * Math.sin(2 * Math.PI * 3570 * t) * decay(t, 0.008)
               + 0.20 * Math.sin(2 * Math.PI * 5100 * t) * decay(t, 0.005);
    }
    highpass(tr, 1200);
    for (let i = 0; i < buf.length; i++) buf[i] = clamp(buf[i] + tr[i] * 0.8);
    return tail(peak(buf, 0.5));
}

/**
 * IMPACT — ball on ball, and anything else that lands.
 *
 * The same shape an octave or so down, with a short body under it so it has
 * weight on a phone speaker, which reproduces almost nothing below 400Hz.
 */
function impact() {
    const buf = new Float32Array(n(0.3));
    const tr = new Float32Array(buf.length);
    for (let i = 0; i < buf.length; i++) {
        const t = i / RATE;
        tr[i] = noise() * decay(t, 0.006);
        buf[i] = 0.60 * Math.sin(2 * Math.PI * 760 * t) * decay(t, 0.055)
               + 0.40 * Math.sin(2 * Math.PI * 1180 * t) * decay(t, 0.032)
               + 0.30 * Math.sin(2 * Math.PI * 430 * t) * decay(t, 0.09);
    }
    highpass(tr, 700);
    for (let i = 0; i < buf.length; i++) buf[i] = clamp(buf[i] + tr[i] * 0.7);
    return tail(peak(buf, 0.46));
}

/** WHOOSH — filtered noise swept up then down, for a scene change. */
function whoosh() {
    const buf = new Float32Array(n(0.42));
    for (let i = 0; i < buf.length; i++) buf[i] = noise();
    // Two passes with the band moving: a static filter reads as hiss, and
    // what makes a whoosh is the MOVEMENT of the band, not the noise.
    const out = new Float32Array(buf.length);
    let lp = 0, hp = 0, prev = 0;
    for (let i = 0; i < buf.length; i++) {
        const u = i / buf.length;
        const bell = Math.sin(Math.PI * u);
        const cut = 420 + 3600 * bell;
        const a = Math.exp(-2 * Math.PI * cut / RATE);
        lp = (1 - a) * buf[i] + a * lp;
        const b = Math.exp(-2 * Math.PI * (cut * 0.45) / RATE);
        hp = b * (hp + lp - prev); prev = lp;
        out[i] = hp * bell * bell;
    }
    return tail(peak(out, 0.22), 20);
}

/** POP — a short upward blip. An element arriving. */
function pop() {
    const buf = new Float32Array(n(0.1));
    for (let i = 0; i < buf.length; i++) {
        const t = i / RATE;
        const f = 520 + 900 * (t / 0.1);          // a rising chirp
        buf[i] = Math.sin(2 * Math.PI * f * t) * decay(t, 0.018);
    }
    return tail(peak(buf, 0.26));
}

/** TICK — a quieter, duller pop, for one row of a list. */
function tick() {
    const buf = new Float32Array(n(0.07));
    for (let i = 0; i < buf.length; i++) {
        const t = i / RATE;
        buf[i] = Math.sin(2 * Math.PI * 1150 * t) * decay(t, 0.009)
               + 0.4 * Math.sin(2 * Math.PI * 1720 * t) * decay(t, 0.006);
    }
    lowpass(buf, 4000);
    return tail(peak(buf, 0.18));
}

/**
 * RISER — a short swell for the title.
 *
 * A fifth, because it is the interval that reads as "about to happen"
 * without implying a key the rest of the film does not have.
 */
function riser() {
    const buf = new Float32Array(n(1.1));
    for (let i = 0; i < buf.length; i++) {
        const t = i / RATE;
        const u = t / 1.1;
        const env = Math.pow(u, 1.8) * (1 - Math.pow(u, 8));
        const f = 220 * (1 + 0.5 * u);
        buf[i] = env * (Math.sin(2 * Math.PI * f * t)
                      + 0.5 * Math.sin(2 * Math.PI * f * 1.5 * t)
                      + 0.25 * noise() * u);
    }
    lowpass(buf, 5200);
    return tail(peak(buf, 0.2), 40);
}

// ---------------------------------------------------------------------------
// WAV
// ---------------------------------------------------------------------------

/** 16-bit mono PCM. Mono because none of this is meant to be located. */
function wav(samples) {
    const bytes = samples.length * 2;
    const b = Buffer.alloc(44 + bytes);
    b.write('RIFF', 0); b.writeUInt32LE(36 + bytes, 4); b.write('WAVE', 8);
    b.write('fmt ', 12); b.writeUInt32LE(16, 16);
    b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
    b.writeUInt32LE(RATE, 24); b.writeUInt32LE(RATE * 2, 28);
    b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
    b.write('data', 36); b.writeUInt32LE(bytes, 40);
    for (let i = 0; i < samples.length; i++) {
        b.writeInt16LE(Math.round(clamp(samples[i]) * 32767), 44 + i * 2);
    }
    return b;
}

const SOUNDS = { click, impact, whoosh, pop, tick, riser };

await mkdir(OUT, { recursive: true });
for (const [name, make] of Object.entries(SOUNDS)) {
    const data = wav(make());
    await writeFile(`${OUT}${name}.wav`, data);
    console.log(`  ${name}.wav  ${(data.length / 1024).toFixed(1)} KB`);
}
console.log(`\n${Object.keys(SOUNDS).length} cues in ${OUT}`);
console.log('films/physics/sfx/ is gitignored: this script is the source.');
