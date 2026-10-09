/**
 * A battle cue, synthesized.
 *
 * Written rather than sourced: a film in this repo should be renderable by
 * anyone who clones it, and that rules out anybody else's recording. It is
 * also the only end-to-end test of the audio-asset path, which had never been
 * exercised -- `assets: { kind: "audio" }` has been in the schema since the
 * first phase and nothing ever fetched one.
 *
 *   node scripts/make-music.mjs [out.wav] [seconds]
 *
 * Pure math to 16-bit PCM. No dependencies.
 */
import { writeFile } from 'node:fs/promises';

const OUT = process.argv[2] ?? 'demo/assets/battle.wav';
const SECONDS = Number(process.argv[3] ?? 62);
const RATE = 48000;
const BPM = 152;
const BEAT = 60 / BPM;
const N = Math.round(SECONDS * RATE);

const clamp = (v) => Math.max(-1, Math.min(1, v));
// A fixed-seed noise, so the same cue comes out byte-identical every run --
// a golden-hash check is worth nothing against a random score.
let seed = 0x2f6e2b1;
const noise = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return ((seed >>> 0) / 0xffffffff) * 2 - 1;
};

// D minor: the mode every fight cue in this idiom lives in.
const ROOT = 73.42;                       // D2
const SCALE = [0, 3, 5, 7, 10];           // minor pentatonic
const semi = (n) => Math.pow(2, n / 12);

/** Sections: the shape of the fight, not just a loop. */
const sections = [
    { at: 0.0,  name: 'intro',  drums: 0.35, bass: 0.5, lead: 0.0, pad: 0.7 },
    { at: 8.0,  name: 'build',  drums: 0.75, bass: 0.9, lead: 0.0, pad: 0.6 },
    { at: 20.0, name: 'main',   drums: 1.0,  bass: 1.0, lead: 0.55, pad: 0.4 },
    { at: 38.0, name: 'push',   drums: 1.0,  bass: 1.0, lead: 0.8, pad: 0.35 },
    { at: 50.0, name: 'climax', drums: 1.0,  bass: 1.0, lead: 1.0, pad: 0.5 },
    { at: 57.5, name: 'out',    drums: 0.2,  bass: 0.3, lead: 0.25, pad: 0.8 },
];
const sectionAt = (t) => {
    let cur = sections[0];
    for (const s of sections) if (t >= s.at) cur = s;
    return cur;
};

const env = (x, attack, decay) =>
    x < 0 ? 0 : x < attack ? x / attack : Math.exp(-(x - attack) / decay);

const out = new Float32Array(N);
for (let i = 0; i < N; i++) {
    const t = i / RATE;
    const s = sectionAt(t);
    const beat = t / BEAT;
    const inBeat = (beat % 1) * BEAT;
    const bar = Math.floor(beat / 4);
    const beatInBar = Math.floor(beat) % 4;

    // --- taiko: on 1 and 3, with a pickup into the bar
    const kickHit = beatInBar === 0 || beatInBar === 2;
    const kick = kickHit
        ? Math.sin(2 * Math.PI * (52 + 70 * Math.exp(-inBeat * 26)) * inBeat)
            * env(inBeat, 0.002, 0.10) * 0.9
        : 0;

    // --- snare/clap on the backbeat, noise through a short envelope
    const snare = beatInBar === 1 || beatInBar === 3
        ? (noise() * 0.6 + Math.sin(2 * Math.PI * 190 * inBeat) * 0.4)
            * env(inBeat, 0.001, 0.055) * 0.55
        : 0;

    // --- driving eighth-note hats
    const eighth = (t / (BEAT / 2)) % 1 * (BEAT / 2);
    const hat = noise() * env(eighth, 0.001, 0.016) * 0.12;

    // --- bass ostinato: a pentatonic figure that turns over every two bars
    const figure = [0, 0, 3, 0, 4, 3, 1, 0];
    const step = Math.floor(beat * 2) % figure.length;
    const bf = ROOT * semi(SCALE[figure[step]]);
    const phase = 2 * Math.PI * bf * t;
    // saw + square, which is the sound of this idiom
    const bass = (((phase / Math.PI) % 2) - 1) * 0.5
        + (Math.sin(phase) > 0 ? 0.18 : -0.18);

    // --- pad: open fifths, slow
    const pad = (Math.sin(2 * Math.PI * ROOT * 2 * t) * 0.5
        + Math.sin(2 * Math.PI * ROOT * 3 * t) * 0.35
        + Math.sin(2 * Math.PI * ROOT * 4.005 * t) * 0.25) * 0.14;

    // --- lead: a held heroic line that only arrives once the fight does
    const leadNotes = [12, 15, 12, 19, 17, 15, 12, 10];
    const ln = leadNotes[Math.floor(beat / 2) % leadNotes.length];
    const lf = ROOT * 2 * semi(SCALE[ln % 5] + 12 * Math.floor(ln / 5));
    const vib = 1 + Math.sin(2 * Math.PI * 5.5 * t) * 0.004;
    const lead = (Math.sin(2 * Math.PI * lf * vib * t)
        + Math.sin(4 * Math.PI * lf * vib * t) * 0.3) * 0.22
        * env((beat % 2) * BEAT, 0.04, 0.9);

    const v = kick * s.drums + snare * s.drums + hat * s.drums
        + bass * 0.5 * s.bass + pad * s.pad + lead * s.lead;

    // fade in and out so the cue never clicks at either end
    const fade = Math.min(1, t / 1.2, (SECONDS - t) / 3.5);
    out[i] = clamp(v * 0.62 * Math.max(0, fade));
}

// soft clip, which keeps the peaks from squaring off under the voices
for (let i = 0; i < N; i++) out[i] = Math.tanh(out[i] * 1.25) * 0.85;

const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + N * 2, 4); header.write('WAVE', 8);
header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
header.writeUInt16LE(1, 22); header.writeUInt32LE(RATE, 24);
header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
header.write('data', 36); header.writeUInt32LE(N * 2, 40);
const pcm = Buffer.alloc(N * 2);
for (let i = 0; i < N; i++) pcm.writeInt16LE(Math.round(out[i] * 32767), i * 2);
await writeFile(OUT, Buffer.concat([header, pcm]));

const peak = out.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const rms = Math.sqrt(out.reduce((a, v) => a + v * v, 0) / N);
console.log(`${OUT}  ${SECONDS}s @ ${RATE}Hz  ${(44 + N * 2) / 1e6} MB  peak ${peak.toFixed(3)}  rms ${rms.toFixed(3)}`);
