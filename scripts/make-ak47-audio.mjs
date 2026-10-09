/**
 * Synthesize the AK-47 ad's four audio assets.
 *
 * Synthesized rather than sourced so the repository carries no licensed
 * media, and seeded so two runs produce identical bytes -- the audio has to
 * be as reproducible as the frames or a golden comparison is meaningless.
 *
 * Nothing here is a sampler. A gunshot is a transient, a body and a tail; a
 * mechanical clack is a filtered noise burst with a resonant ring. That is
 * enough to read correctly under picture, which is the whole bar.
 */
import { writeFile, mkdir } from 'node:fs/promises';

const RATE = 48000;
const DIR = new URL('../demo/assets/', import.meta.url);

// Deterministic noise: the same mulberry32 the music generator uses, so a
// re-run is byte-identical.
let seed = 0x9e3779b9;
const rnd = () => {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const noise = () => rnd() * 2 - 1;
const clamp = (v) => Math.max(-1, Math.min(1, v));

/** One-pole low-pass. `a` near 1 passes everything, near 0 passes nothing. */
const lowpass = (buf, a) => {
    let y = 0;
    for (let i = 0; i < buf.length; i++) { y += (buf[i] - y) * a; buf[i] = y; }
    return buf;
};
const highpass = (buf, a) => {
    let y = 0;
    for (let i = 0; i < buf.length; i++) { y += (buf[i] - y) * a; buf[i] -= y; }
    return buf;
};
const decay = (i, n, k = 6) => Math.exp(-k * (i / n));

async function wav(name, samples) {
    const n = samples.length;
    const header = Buffer.alloc(44);
    header.write('RIFF', 0); header.writeUInt32LE(36 + n * 2, 4); header.write('WAVE', 8);
    header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22); header.writeUInt32LE(RATE, 24);
    header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
    header.write('data', 36); header.writeUInt32LE(n * 2, 40);
    const pcm = Buffer.alloc(n * 2);
    for (let i = 0; i < n; i++) pcm.writeInt16LE(Math.round(clamp(samples[i]) * 32767), i * 2);
    await writeFile(new URL(name, DIR), Buffer.concat([header, pcm]));
    const peak = samples.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
    console.log(`  ${name}  ${(n / RATE).toFixed(2)}s  peak ${peak.toFixed(3)}`);
}

await mkdir(DIR, { recursive: true });

// ---------------------------------------------------------------- the bed
// A slow industrial drone that tightens through the assembly and opens out
// under the burst. Two detuned saws an octave apart plus filtered noise.
{
    const SEC = 51, n = SEC * RATE, out = new Float32Array(n);
    const saw = (ph) => 2 * (ph - Math.floor(ph + 0.5));
    for (let i = 0; i < n; i++) {
        const t = i / RATE;
        const swell = 0.35 + 0.3 * Math.min(1, t / 34) + 0.35 * (t > 38.8 && t < 44 ? 1 : 0);
        const f = 49 * (1 + 0.0006 * Math.sin(t * 0.35));
        out[i] = (saw(t * f) * 0.5 + saw(t * f * 2.01) * 0.22 + saw(t * f * 1.498) * 0.12)
                 * swell * 0.33;
    }
    const air = new Float32Array(n);
    for (let i = 0; i < n; i++) air[i] = noise();
    lowpass(air, 0.004);
    for (let i = 0; i < n; i++) out[i] = Math.tanh((out[i] + air[i] * 2.4) * 1.1) * 0.5;
    // Ease the ends so a cue with no fade cannot click.
    for (let i = 0; i < RATE * 2; i++) {
        out[i] *= i / (RATE * 2);
        out[n - 1 - i] *= i / (RATE * 2);
    }
    await wav('ak-bed.wav', out);
}

// -------------------------------------------------------------- the clack
// Steel seating into steel: a short bright noise burst with a ring on top.
{
    const n = Math.round(0.22 * RATE), out = new Float32Array(n);
    const burst = new Float32Array(n);
    for (let i = 0; i < n; i++) burst[i] = noise() * decay(i, n, 42);
    highpass(burst, 0.22);
    for (let i = 0; i < n; i++) {
        const t = i / RATE;
        const ring = (Math.sin(t * 2 * Math.PI * 2180) * 0.4
                    + Math.sin(t * 2 * Math.PI * 3310) * 0.25) * decay(i, n, 26);
        const thud = Math.sin(t * 2 * Math.PI * 128) * decay(i, n, 34) * 0.5;
        out[i] = clamp((burst[i] * 0.85 + ring + thud) * 0.72);
    }
    await wav('ak-clack.wav', out);
}

// -------------------------------------------------------------- the charge
// Handle drawn back -- a scrape -- then released to slam forward.
{
    const n = Math.round(0.72 * RATE), out = new Float32Array(n);
    const scrape = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const t = i / RATE;
        scrape[i] = t < 0.34 ? noise() * (0.3 + 0.5 * Math.sin(t * 46)) * 0.45 : 0;
    }
    lowpass(scrape, 0.09);
    highpass(scrape, 0.02);
    for (let i = 0; i < n; i++) {
        const t = i / RATE;
        out[i] = scrape[i];
        // The slam, at 0.40s.
        const s = t - 0.40;
        if (s >= 0) {
            const k = Math.round(s * RATE), m = n - Math.round(0.40 * RATE);
            out[i] += (noise() * decay(k, m, 30) * 0.8
                     + Math.sin(s * 2 * Math.PI * 96) * decay(k, m, 22) * 0.7);
        }
        out[i] = clamp(out[i] * 0.8);
    }
    await wav('ak-charge.wav', out);
}

// ---------------------------------------------------------------- the shot
// Transient, body, tail. The crack is broadband and over in milliseconds;
// the thump is the low end; the tail is the room answering.
{
    const n = Math.round(0.62 * RATE), out = new Float32Array(n);
    const crack = new Float32Array(n);
    for (let i = 0; i < n; i++) crack[i] = noise() * decay(i, n, 150);
    highpass(crack, 0.42);
    const tail = new Float32Array(n);
    for (let i = 0; i < n; i++) tail[i] = noise() * decay(i, n, 9);
    lowpass(tail, 0.05);
    for (let i = 0; i < n; i++) {
        const t = i / RATE;
        // A downward sweep, 150 Hz to 48 Hz: the body of the report.
        const f = 150 * Math.exp(-t * 22) + 48;
        const body = Math.sin(2 * Math.PI * f * t) * decay(i, n, 26);
        out[i] = clamp((crack[i] * 1.15 + body * 0.95 + tail[i] * 0.55) * 0.92);
    }
    await wav('ak-shot.wav', out);
}

// -------------------------------------------------------------- the impact
// Concrete taking a round: a dry crack with grit, no low end to speak of.
{
    const n = Math.round(0.42 * RATE), out = new Float32Array(n);
    const grit = new Float32Array(n);
    for (let i = 0; i < n; i++) grit[i] = noise() * decay(i, n, 15);
    lowpass(grit, 0.3);
    highpass(grit, 0.05);
    for (let i = 0; i < n; i++) {
        const t = i / RATE;
        const crack = noise() * decay(i, n, 90) * 0.9;
        const ring = Math.sin(2 * Math.PI * 640 * t) * decay(i, n, 40) * 0.3;
        out[i] = clamp((crack + grit[i] * 0.7 + ring) * 0.75);
    }
    await wav('ak-impact.wav', out);
}
