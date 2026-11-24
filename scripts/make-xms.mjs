/**
 * The XMS commercial -- 1080x1920, English and Swahili, under two minutes.
 *
 *   node scripts/make-xms.mjs              # both languages
 *   LANG=sw node scripts/make-xms.mjs      # one language
 *
 * Authored ONCE and built twice. The staging is shared; only the narration
 * table and the derived shot durations differ, because Swahili and English do
 * not take the same time to say the same thing.
 *
 * Then check before spending a render -- this film is narration-led, so the
 * pacing report is the point rather than a footnote:
 *
 *   FILM=films/xms/ad-en.json node scripts/check-film.mjs
 *   ROOT=. FILM=films/xms/ad-en.json AT=3,20,46,70,100 OUT=out/x \
 *     node scripts/grab2d.mjs
 *
 * Rendering. Piper is the default cast and needs no setup beyond the vendored
 * models. For a COMMERCIAL, prefer cloned voices if the studio is running --
 * a synthesised read is recognisably synthetic, and an advert is the one
 * place that costs you the sale:
 *
 *   FORMAT=mp4 FILM=films/xms/ad-en.json \
 *     OUT=out/xms/xms-en.mp4 WIDTH=1080 HEIGHT=1920 npm run produce
 *
 *   VOICE_BACKEND=voicestudio VOICE_STUDIO=http://127.0.0.1:3900 STRICT_VOICE=1 \
 *     FORMAT=mp4 FILM=films/xms/ad-sw.json \
 *     OUT=out/xms/xms-sw.mp4 WIDTH=1080 HEIGHT=1920 npm run produce
 */
import { mkdir, writeFile } from 'node:fs/promises';

import { DOWNLOAD, LANGS, VOICE_BACKEND } from './lib/xms.mjs';
import { ad } from './xms/ad.mjs';

const ROOT = new URL('../films/xms/', import.meta.url).pathname;
const wanted = process.env.LANG ? process.env.LANG.split(',') : LANGS;

await mkdir(ROOT, { recursive: true });

console.log(`voice backend: ${VOICE_BACKEND}`);
console.log(`download:      ${DOWNLOAD}\n`);

for (const lang of wanted) {
    if (!LANGS.includes(lang)) throw new Error(`no language "${lang}" (have ${LANGS.join(', ')})`);
    const film = ad(lang);
    const file = `${ROOT}ad-${lang}.json`;
    await writeFile(file, `${JSON.stringify(film, null, 2)}\n`);

    const shots = film.scenes.reduce((n, s) => n + s.shots.length, 0);
    const lines = film.scenes.reduce((n, s) =>
        n + s.shots.reduce((m, sh) => m + (sh.dialogue?.length ?? 0), 0), 0);
    const dur = film.scenes.reduce((n, s) =>
        n + s.shots.reduce((m, sh) => m + sh.duration, 0), 0);
    // Round the SECONDS, then carry -- rounding the remainder on its own
    // prints a 119.7 s film as "1:60".
    const whole = Math.round(dur);
    const mm = Math.floor(whole / 60);
    const ss = String(whole % 60).padStart(2, '0');
    // The brief caps this at 2:00. Flagged here rather than in a comment,
    // because a cut that drifts to 2:10 is only obvious next to the number.
    const over = dur > 120 ? `  <-- ${(dur - 120).toFixed(0)}s OVER the 2:00 cap` : '';
    console.log(`  ad-${lang}: ${film.scenes.length} scenes, ${shots} shots, `
        + `${lines} lines, ${mm}:${ss}${over}`);
}
