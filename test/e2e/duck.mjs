/**
 * Ducking, measured on a rendered mix.
 *
 * `test/core/ducking.test.mjs` proves the arithmetic: the spans, the bridge,
 * the automation points, the declaration. It cannot prove the curve reaches
 * the gain node, and that is the half that has failed before -- the bus nodes
 * existed for several phases with nothing automating them, and nothing
 * reported it, because a bed at a flat gain is a correct render of what was
 * asked for.
 *
 * So this renders the mix in a real `OfflineAudioContext` and measures the
 * music bed's RMS DURING the line against its RMS either side of it. The
 * claim is a number: a 9 dB duck must show up as a 9 dB drop, within the
 * tolerance of a linear ramp measured over a finite window.
 *
 * A pre-recorded take on the `voice` bus rather than synthesis, so the test
 * costs a second rather than a minute: the duck triggers off a CUE, and a cue
 * does not care where its samples came from.
 */
import puppeteer from 'puppeteer-core';
import { startGuard, closeBrowser } from './lib/guard.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const CHROME = process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('../..', import.meta.url).pathname;
const T = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

/** A mono WAV of a steady tone, built here so the test needs no asset. */
function tone({ seconds, hz = 220, rate = 48000, amp = 0.5 }) {
    const n = Math.round(seconds * rate);
    const buf = Buffer.alloc(44 + n * 2);
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
    buf.write('fmt ', 12); buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28);
    buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
    buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) {
        buf.writeInt16LE(Math.round(Math.sin((2 * Math.PI * hz * i) / rate) * amp * 32767),
                         44 + i * 2);
    }
    return buf;
}

const ASSETS = {
    '/__tone/bed.wav': tone({ seconds: 12, hz: 220, amp: 0.5 }),
    '/__tone/line.wav': tone({ seconds: 3, hz: 440, amp: 0.5 }),
};

const PAGE = `<!doctype html><meta charset="utf-8"><title>duck</title><script type="module">
import { compileFilm } from '/src/core/script/compile.js';
import { renderMix } from '/src/audio/OfflineMixer.js';

const FILM = {
  meta: { title: 'duck', fps: 24, width: 320, height: 180, audio: { duck: 9 } },
  assets: { bed: { src: '/__tone/bed.wav' }, line: { src: '/__tone/line.wav' } },
  characters: {}, cast: [],
  scenes: [{ id: 's1', audio: [
      { asset: 'bed', at: 0, gain: 0.5, bus: 'music' },
      // The "line": a pre-recorded take on the voice bus, from 4s to 7s.
      { asset: 'line', at: 4, gain: 0.5, bus: 'voice' },
    ], shots: [{ id: 'a', duration: 12 }] }],
};

async function decode(url, rate) {
  const bytes = await (await fetch(url)).arrayBuffer();
  const ctx = new OfflineAudioContext(1, 1, rate);
  return ctx.decodeAudioData(bytes);
}

/** RMS of the mix over a window, in dBFS. */
function rmsDb(buf, from, to) {
  const d = buf.getChannelData(0);
  const a = Math.round(from * buf.sampleRate), b = Math.round(to * buf.sampleRate);
  let s = 0;
  for (let i = a; i < b; i++) s += d[i] * d[i];
  const r = Math.sqrt(s / Math.max(1, b - a));
  return r > 0 ? 20 * Math.log10(r) : -Infinity;
}

window.run = async () => {
  const rate = 48000;
  const compiled = compileFilm(FILM);
  const buffers = { bed: await decode('/__tone/bed.wav', rate),
                    line: await decode('/__tone/line.wav', rate) };
  const reports = [];
  const mix = await renderMix({
    cues: compiled.audioCues, buffers, sampleRate: rate,
    durationSec: 12, duck: compiled.meta.duck,
    onReport: (m) => reports.push(m),
  });

  // The same film with the duck switched off, as the control: everything else
  // identical, so any difference is the duck and nothing else.
  const flat = await renderMix({
    cues: compiled.audioCues, buffers, sampleRate: rate,
    durationSec: 12, duck: null, onReport: () => {},
  });

  return {
    duck: compiled.meta.duck,
    reports,
    // Measured well inside each region, so the ramps are not in the window.
    ducked:   { mix: rmsDb(mix, 5.0, 6.5),  flat: rmsDb(flat, 5.0, 6.5) },
    before:   { mix: rmsDb(mix, 1.0, 3.0),  flat: rmsDb(flat, 1.0, 3.0) },
    after:    { mix: rmsDb(mix, 9.0, 11.0), flat: rmsDb(flat, 9.0, 11.0) },
  };
};
</script>`;

const srv = createServer(async (q, r) => {
    const path = normalize(new URL(q.url, 'http://x').pathname);
    if (path === '/__duck') {
        r.writeHead(200, { 'content-type': 'text/html' }); r.end(PAGE); return;
    }
    if (ASSETS[path]) {
        r.writeHead(200, { 'content-type': 'audio/wav' }); r.end(ASSETS[path]); return;
    }
    try {
        const f = join(ROOT, path);
        const b = await readFile(f);
        r.writeHead(200, { 'content-type': T[extname(f)] ?? 'application/octet-stream' });
        r.end(b);
    } catch { if (!r.headersSent) r.writeHead(404); r.end(); }
});
await new Promise((r) => srv.listen(0, r));
const base = `http://127.0.0.1:${srv.address().port}`;

const br = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
    protocolTimeout: 300_000,
});
const guard = startGuard({ ms: 300_000, name: 'test:duck:e2e' });
guard.onCleanup(() => closeBrowser(br));
guard.onCleanup(() => srv.close());
const pg = await br.newPage();
const errors = [];
pg.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
guard.stage('load');
await pg.goto(`${base}/__duck`, { waitUntil: 'load', timeout: 120_000 });
await pg.waitForFunction(() => typeof window.run === 'function', { timeout: 30_000 });
guard.stage('render two mixes');
const r = await pg.evaluate(() => window.run());
await guard.done();

const fails = [];
if (errors.length) fails.push(`page errors: ${errors.join(' | ')}`);
if (!r.duck) fails.push('the film declared a duck and the compiler produced none');

console.log('\n  window        ducked mix   flat mix    difference');
for (const [name, v] of Object.entries({ before: r.before, ducked: r.ducked, after: r.after })) {
    console.log(`  ${name.padEnd(13)} ${v.mix.toFixed(2).padStart(8)} dB `
        + `${v.flat.toFixed(2).padStart(10)} dB ${(v.mix - v.flat).toFixed(2).padStart(10)} dB`);
}
for (const line of r.reports) console.log(`  [audio] ${line}`);

const drop = r.ducked.mix - r.ducked.flat;
/**
 * The expected level, derived rather than eyeballed.
 *
 * Asserting only "it got quieter" would pass a duck of any depth, including a
 * 1 dB one, so the arithmetic is written out and the measurement has to match
 * it. Two incoherent tones each at amplitude 0.25 (a 0.5 asset at a 0.5 cue
 * gain) sum in RMS, not in amplitude:
 *
 *   flat    sqrt(0.177^2 + 0.177^2) = 0.250   -> -12.04 dBFS
 *   ducked  bed x 0.3548 = 0.0627, line 0.177
 *           sqrt(0.0627^2 + 0.177^2) = 0.1878 -> -14.53 dBFS
 *
 * The line itself is NOT ducked, which is why the mix drops 2.5 dB and not 9
 * -- and checking against the derived figure rather than against "9" is what
 * makes that distinction a test rather than a surprise.
 */
const rms = (amp) => amp / Math.SQRT2;
const sum = (...a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0));
const db = (v) => 20 * Math.log10(v);
const depth = 10 ** (-9 / 20);
const wantFlat = db(sum(rms(0.25), rms(0.25)));
const wantDucked = db(sum(rms(0.25 * depth), rms(0.25)));
if (Math.abs(r.ducked.flat - wantFlat) > 0.3) {
    fails.push(`the control mix reads ${r.ducked.flat.toFixed(2)} dB where the arithmetic says `
        + `${wantFlat.toFixed(2)} dB, so the test's model of the mix is wrong`);
}
if (Math.abs(r.ducked.mix - wantDucked) > 0.3) {
    fails.push(`the ducked mix reads ${r.ducked.mix.toFixed(2)} dB where a 9 dB duck predicts `
        + `${wantDucked.toFixed(2)} dB — the depth is wrong, not just the direction`);
}
if (!(drop < -1.5)) {
    fails.push(`the mix under the line dropped only ${drop.toFixed(2)} dB; the duck did not reach `
        + 'the gain node');
}
if (Math.abs(r.before.mix - r.before.flat) > 0.3) {
    fails.push(`the bed before the line moved by ${(r.before.mix - r.before.flat).toFixed(2)} dB; `
        + 'the duck is leaking outside its span');
}
if (Math.abs(r.after.mix - r.after.flat) > 0.3) {
    fails.push(`the bed after the line moved by ${(r.after.mix - r.after.flat).toFixed(2)} dB; `
        + 'the bed did not come back up');
}
if (!r.reports.some((m) => /duck: music under voice by -9 dB/.test(m))) {
    fails.push(`no duck report in: ${JSON.stringify(r.reports)}`);
}

if (fails.length) { console.error('\nFAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
console.log(`\nPASS: the bed is ducked by exactly 9 dB — the mix reads `
    + `${r.ducked.mix.toFixed(2)} dB against a predicted ${wantDucked.toFixed(2)} dB — `
    + `and returns to within ${Math.abs(r.after.mix - r.after.flat).toFixed(2)} dB either side`);
