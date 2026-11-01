/**
 * Probe a locally-running VoiceStudio, and say what a film can do with it.
 *
 *   node scripts/voice-studio.mjs                     # is it there, what has it got
 *   VS=http://127.0.0.1:3900 node scripts/voice-studio.mjs
 *   SAY="Habari, mimi ni Nuru." VOICE=<id> node scripts/voice-studio.mjs
 *
 * Written as a probe rather than a test because the interesting failure is
 * "it is running but the route moved", and that must not look the same as
 * "it is not running". See docs/29-VOICE-STUDIO.md.
 *
 * VoiceStudio is AGPL-3.0 and is NOT bundled here. This talks to a program
 * you installed and run yourself, over loopback HTTP.
 */
import { writeFile } from 'node:fs/promises';
import { VoiceStudioProvider } from '../src/core/voice/providers/VoiceStudioProvider.js';

const BASE = process.env.VS ?? 'http://127.0.0.1:3900';
const SAY = process.env.SAY ?? null;
const VOICE = process.env.VOICE ?? null;
const OUT = process.env.OUT ?? 'out/voicestudio-take.wav';

// Node has no AudioContext; for a probe the bytes are the point, so `decode`
// just hands them back and the file is written as the server sent it.
const provider = new VoiceStudioProvider({
    baseUrl: BASE,
    decode: async (bytes) => ({ __raw: bytes, duration: null }),
});

console.log(`probing ${BASE}`);
const report = await provider.probe();

if (!report.reachable) {
    console.log('\nNOT REACHABLE.');
    for (const n of report.notes) console.log(`  ${n}`);
    console.log(`
VoiceStudio is a separate application. Install it from
  https://github.com/debpalash/VoiceStudio
start it, and make sure its backend is listening on ${BASE}.

Nothing here depends on it: without it, films fall through to the bundled
Piper voices exactly as before.`);
    process.exit(1);
}

console.log(`\nreachable: ${report.voices} voices, ${report.cloned} of them cloned`);
console.log(`languages: ${report.languages.join(', ') || '(none reported)'}`);
if (report.capabilities) {
    console.log(`capabilities: ${JSON.stringify(report.capabilities).slice(0, 200)}`);
}

const voices = await provider.listVoices();
const cloned = voices.filter((v) => v.tags.includes('cloned'));
const show = (cloned.length ? cloned : voices).slice(0, 25);
console.log(`\n${cloned.length ? 'cloned voices' : 'voices'}:`);
for (const v of show) console.log(`  ${v.id.padEnd(34)} ${v.lang.padEnd(8)} ${v.name}`);
if (voices.length > show.length) console.log(`  ... and ${voices.length - show.length} more`);

const sw = voices.filter((v) => v.lang.toLowerCase().startsWith('sw'));
console.log(`\nSwahili voices here: ${sw.length}`
    + (sw.length ? ` (${sw.map((v) => v.id).join(', ')})` : '')
    + `  —  the bundled Piper catalogue has exactly 1.`);

console.log(`\nTo cast a film against these, put the ids in its voices block:

  "voices": {
    "nuru":   { "spec": "voicestudio:${show[0]?.id ?? '<voice-id>'}" },
    "bakari": { "spec": "voicestudio:<another-voice-id>" }
  }

and render with VOICE_STUDIO=${BASE} set. Delivery (rate, pitch) still
applies on top, but with real distinct voices you will usually not need it.`);

for (const n of report.notes) console.log(`\nnote: ${n}`);

if (SAY) {
    const voice = VOICE ? voices.find((v) => v.id === VOICE) : (show[0] ?? voices[0]);
    if (!voice) { console.error('no voice to speak with'); process.exit(1); }
    console.log(`\nsynthesising with "${voice.id}" ...`);
    const t0 = Date.now();
    const { audioBuffer } = await provider.synthesize({ text: SAY, voice });
    const bytes = new Uint8Array(audioBuffer.__raw);
    await writeFile(OUT, bytes);
    const words = SAY.trim().split(/\s+/).length;
    console.log(`wrote ${OUT}  ${(bytes.length / 1024).toFixed(0)} KB  `
        + `in ${((Date.now() - t0) / 1000).toFixed(1)}s for ${words} words`);
    console.log('Play it before casting a whole film against this voice.');
}
