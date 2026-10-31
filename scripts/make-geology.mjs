/**
 * "Finding Gold" — a ten-part field guide to mineral exploration, as
 * `jirex.film/1` documents at 1080x1920 for phone feeds.
 *
 * Each part is its own module under `geology/`. They are generated rather
 * than hand-written for the reason `make-orderblock.mjs` is: narration lives
 * in one indexed table per part and the shots quote it by number, so
 * rewriting a line does not mean editing the same sentence in three places.
 *
 *   node scripts/make-geology.mjs            # every part
 *   PART=4 node scripts/make-geology.mjs     # just one
 *
 * Then check it before spending a render on it:
 *   FILM=films/geology/part-04.json node scripts/check-film.mjs
 *   ROOT=. FILM=films/geology/part-04.json AT=10,30 OUT=out/g node scripts/grab2d.mjs
 *   FORMAT=mp4 FILM=films/geology/part-04.json \
 *     OUT=out/geology/finding-gold-04.mp4 WIDTH=1080 HEIGHT=1920 npm run produce
 */
import { mkdir, writeFile } from 'node:fs/promises';

import { partOne } from './geology/part-01.mjs';
import { partTwo } from './geology/part-02.mjs';
import { partThree } from './geology/part-03.mjs';
import { partFour } from './geology/part-04.mjs';
import { partFive } from './geology/part-05.mjs';
import { partSix } from './geology/part-06.mjs';
import { partSeven } from './geology/part-07.mjs';
import { partEight } from './geology/part-08.mjs';
import { partNine } from './geology/part-09.mjs';
import { partTen } from './geology/part-10.mjs';

const OUT_DIR = new URL('../films/geology/', import.meta.url).pathname;

const PARTS = {
    1: partOne,
    2: partTwo,
    3: partThree,
    4: partFour,
    5: partFive,
    6: partSix,
    7: partSeven,
    8: partEight,
    9: partNine,
    10: partTen,
};

const want = process.env.PART ? process.env.PART.split(',') : Object.keys(PARTS);
await mkdir(OUT_DIR, { recursive: true });
for (const k of want) {
    const make = PARTS[k];
    if (!make) throw new Error(`no part ${k}`);
    const film = make();
    const file = `${OUT_DIR}part-${String(k).padStart(2, '0')}.json`;
    await writeFile(file, JSON.stringify(film, null, 2) + '\n');
    const shots = film.scenes.reduce((n, s) => n + s.shots.length, 0);
    const lines = film.scenes.reduce((n, s) =>
        n + s.shots.reduce((m, sh) => m + (sh.dialogue?.length ?? 0), 0), 0);
    const declared = film.scenes.reduce((n, s) =>
        n + s.shots.reduce((m, sh) => m + sh.duration, 0), 0);
    const mm = Math.floor(declared / 60);
    const ss = String(Math.round(declared % 60)).padStart(2, '0');
    console.log(`part ${k}: ${film.scenes.length} scenes, ${shots} shots, ${lines} lines, `
        + `${mm}:${ss} declared -> ${file}`);
}
