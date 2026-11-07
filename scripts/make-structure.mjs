/**
 * "Reading the Rock" / "Kusoma Mwamba" -- joints, folds, faults and shear
 * zones, and what they mean for where minerals sit. 1080x1920, for phone
 * feeds, in English and Swahili.
 *
 *   node scripts/make-structure.mjs              # every part, both languages
 *   PART=1 node scripts/make-structure.mjs       # one part, both languages
 *   LANG=sw node scripts/make-structure.mjs      # one language, every part
 *   PART=2 LANG=en node scripts/make-structure.mjs
 *
 * Each part is authored ONCE and built twice. The staging is shared; only
 * the narration table and the derived shot durations differ, because Swahili
 * and English do not take the same time to say the same thing.
 *
 * Then check before spending a render -- the pacing report is the point,
 * since this series is narration-led:
 *   FILM=films/structure/en/part-01.json node scripts/check-film.mjs
 *   ROOT=. FILM=films/structure/en/part-01.json AT=4,40,90 OUT=out/s \
 *     node scripts/grab2d.mjs
 *
 * Rendering uses the VoiceStudio cast (docs/29-VOICE-STUDIO.md). STRICT_VOICE
 * refuses to substitute, so a studio that is not running gives a silent line
 * and says so, instead of twelve films in a stand-in voice:
 *   VOICE_STUDIO=http://127.0.0.1:3900 STRICT_VOICE=1 \
 *   FORMAT=mp4 FILM=films/structure/en/part-01.json \
 *     OUT=out/structure/en/rock-01.mp4 WIDTH=1080 HEIGHT=1920 npm run produce
 */
import { mkdir, writeFile } from 'node:fs/promises';

import { LANGS, VOICE_IDS } from './lib/structure.mjs';
import { partOne } from './structure/part-01.mjs';
import { partTwo } from './structure/part-02.mjs';
import { partThree } from './structure/part-03.mjs';
import { partFour } from './structure/part-04.mjs';
import { partFive } from './structure/part-05.mjs';
import { partSix } from './structure/part-06.mjs';

const ROOT = new URL('../films/structure/', import.meta.url).pathname;

const PARTS = { 1: partOne, 2: partTwo, 3: partThree, 4: partFour, 5: partFive, 6: partSix };

const wantParts = process.env.PART ? process.env.PART.split(',') : Object.keys(PARTS);
const wantLangs = process.env.LANG ? process.env.LANG.split(',') : LANGS;

for (const lang of wantLangs) {
    if (!LANGS.includes(lang)) throw new Error(`no language "${lang}" (have ${LANGS.join(', ')})`);
    await mkdir(`${ROOT}${lang}/`, { recursive: true });
}

const total = {};
for (const lang of wantLangs) {
    console.log(`\n--- ${lang} ---`);
    for (const k of wantParts) {
        const make = PARTS[k];
        if (!make) throw new Error(`no part ${k}`);
        const film = make(lang);
        const file = `${ROOT}${lang}/part-${String(k).padStart(2, '0')}.json`;
        await writeFile(file, JSON.stringify(film, null, 2) + '\n');
        const shots = film.scenes.reduce((n, s) => n + s.shots.length, 0);
        const lines = film.scenes.reduce((n, s) =>
            n + s.shots.reduce((m, sh) => m + (sh.dialogue?.length ?? 0), 0), 0);
        const dur = film.scenes.reduce((n, s) =>
            n + s.shots.reduce((m, sh) => m + sh.duration, 0), 0);
        total[lang] = (total[lang] ?? 0) + dur;
        const mm = Math.floor(dur / 60);
        const ss = String(Math.round(dur % 60)).padStart(2, '0');
        // The target is 3:00. Flagged here rather than in a comment, because
        // a part that drifts to 3:40 is only obvious next to the number.
        const off = dur - 180;
        const flag = Math.abs(off) > 20 ? `  <-- ${off > 0 ? '+' : ''}${off.toFixed(0)}s off 3:00` : '';
        console.log(`  part ${k}: ${film.scenes.length} scenes, ${shots} shots, `
            + `${lines} lines, ${mm}:${ss}${flag}`);
    }
}

console.log('\nvoices (VoiceStudio ids -- override with VS_ASHA_EN, VS_ASHA_SW, ...):');
for (const lang of wantLangs) {
    console.log(`  ${lang}: ${Object.entries(VOICE_IDS[lang])
        .map(([k, v]) => `${k}=${v}`).join('  ')}`);
}
