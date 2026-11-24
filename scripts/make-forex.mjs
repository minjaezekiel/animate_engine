/**
 * "Reading the Market" / "Kusoma Soko" -- a ten-part bilingual series on
 * foreign exchange trading, for an audience that has mostly met forex through
 * somebody trying to sell them something.
 *
 * 1080x1920, English and Swahili, ~90 s a part. Twenty films from ten
 * builders: each part is authored ONCE and built twice. The staging is
 * shared; only the narration table and the derived shot durations differ,
 * because Swahili and English do not take the same time to say the same
 * thing.
 *
 *   node scripts/make-forex.mjs              # every part, both languages
 *   PART=1 node scripts/make-forex.mjs       # one part, both languages
 *   LANG=sw node scripts/make-forex.mjs      # one language, every part
 *   PART=2,3 LANG=en node scripts/make-forex.mjs
 *
 * Then check before spending a render -- this series is narration-led, so the
 * pacing report is the point rather than a footnote:
 *
 *   FILM=films/forex/en/part-01.json node scripts/check-film.mjs
 *   ROOT=. FILM=films/forex/en/part-01.json AT=3,20,46,80 OUT=out/fx \
 *     node scripts/grab2d.mjs
 *
 * Rendering. Piper is the default cast and needs no setup beyond the vendored
 * models; `VOICE_BACKEND=voicestudio` recasts all three roles onto cloned
 * voices in one variable, and `STRICT_VOICE=1` refuses to substitute, so a
 * studio that is not running gives a silent line and SAYS SO, instead of
 * twenty films in a stand-in voice:
 *
 *   VOICE_BACKEND=voicestudio VOICE_STUDIO=http://127.0.0.1:3900 STRICT_VOICE=1 \
 *   FORMAT=mp4 FILM=films/forex/en/part-01.json \
 *     OUT=out/forex/en/market-01.mp4 WIDTH=1080 HEIGHT=1920 npm run produce
 *
 * Not financial advice. Every part carries the disclaimer on its end card.
 */
import { mkdir, writeFile } from 'node:fs/promises';

import { LANGS, PARTS_IN_SERIES, VOICE_BACKEND, VOICE_IDS } from './lib/forex.mjs';
import { partOne } from './forex/part-01.mjs';
import { partTwo } from './forex/part-02.mjs';
import { partThree } from './forex/part-03.mjs';
import { partFour } from './forex/part-04.mjs';
import { partFive } from './forex/part-05.mjs';
import { partSix } from './forex/part-06.mjs';
import { partSeven } from './forex/part-07.mjs';
import { partEight } from './forex/part-08.mjs';
import { partNine } from './forex/part-09.mjs';
import { partTen } from './forex/part-10.mjs';

const ROOT = new URL('../films/forex/', import.meta.url).pathname;

const PARTS = {
    1: partOne, 2: partTwo, 3: partThree, 4: partFour, 5: partFive,
    6: partSix, 7: partSeven, 8: partEight, 9: partNine, 10: partTen,
};

const wantParts = process.env.PART ? process.env.PART.split(',') : Object.keys(PARTS);
const wantLangs = process.env.LANG ? process.env.LANG.split(',') : LANGS;

for (const lang of wantLangs) {
    if (!LANGS.includes(lang)) throw new Error(`no language "${lang}" (have ${LANGS.join(', ')})`);
    await mkdir(`${ROOT}${lang}/`, { recursive: true });
}

console.log(`voice backend: ${VOICE_BACKEND}`);

/**
 * The target is 1:30. Flagged against the number rather than in a comment,
 * because a part that has drifted to 2:10 is only obvious next to its target
 * -- and in a series built twice, a part can be on time in English and long
 * in Swahili, which is exactly the kind of thing a per-language report shows
 * and a single authored duration hides.
 */
const TARGET = 90;
const total = {};

for (const lang of wantLangs) {
    console.log(`\n--- ${lang} ---`);
    for (const k of wantParts) {
        const make = PARTS[k];
        if (!make) throw new Error(`no part ${k} (have 1..${PARTS_IN_SERIES})`);
        const film = make(lang);
        const file = `${ROOT}${lang}/part-${String(k).padStart(2, '0')}.json`;
        await writeFile(file, `${JSON.stringify(film, null, 2)}\n`);

        const shots = film.scenes.reduce((a, s) => a + s.shots.length, 0);
        const lines = film.scenes.reduce((a, s) =>
            a + s.shots.reduce((b, sh) => b + (sh.dialogue?.length ?? 0), 0), 0);
        const dur = film.scenes.reduce((a, s) =>
            a + s.shots.reduce((b, sh) => b + sh.duration, 0), 0);
        total[lang] = (total[lang] ?? 0) + dur;

        const mm = Math.floor(dur / 60);
        const ss = String(Math.round(dur % 60)).padStart(2, '0');
        const off = dur - TARGET;
        const flag = Math.abs(off) > 15
            ? `  <-- ${off > 0 ? '+' : ''}${off.toFixed(0)}s off 1:30` : '';
        console.log(`  part ${String(k).padStart(2)}: ${film.scenes.length} scenes, `
            + `${String(shots).padStart(2)} shots, ${String(lines).padStart(2)} lines, `
            + `${mm}:${ss}${flag}`);
    }
    const d = total[lang];
    console.log(`  = ${Math.floor(d / 60)}:${String(Math.round(d % 60)).padStart(2, '0')} `
        + `across ${wantParts.length} part(s)`);
}

console.log('\nvoices (VoiceStudio ids -- override with VS_AMARA_EN, VS_JUMA_SW, ...):');
for (const lang of wantLangs) {
    console.log(`  ${lang}: ${Object.entries(VOICE_IDS[lang])
        .map(([k, v]) => `${k}=${v}`).join('  ')}`);
}
