/**
 * "Madini ya Vito" — a Swahili field guide to gemstones, as `jirex.film/1`
 * documents at 1080x1920 for phone feeds.
 *
 *   node scripts/make-vito.mjs            # every part
 *   PART=1 node scripts/make-vito.mjs     # just one
 *
 * Then check it before spending a render on it — the pacing report is the
 * point, because this series is narration-led:
 *   FILM=films/vito/part-01.json node scripts/check-film.mjs
 *   ROOT=. FILM=films/vito/part-01.json AT=4,30 OUT=out/v node scripts/grab2d.mjs
 *   FORMAT=mp4 FILM=films/vito/part-01.json \
 *     OUT=out/vito/madini-01.mp4 WIDTH=1080 HEIGHT=1920 npm run produce
 */
import { mkdir, writeFile } from 'node:fs/promises';

import { partOne } from './vito/part-01.mjs';
import { partTwo } from './vito/part-02.mjs';
import { partThree } from './vito/part-03.mjs';
import { partFour } from './vito/part-04.mjs';
import { partFive } from './vito/part-05.mjs';
import { partSix } from './vito/part-06.mjs';

const OUT_DIR = new URL('../films/vito/', import.meta.url).pathname;

const PARTS = { 1: partOne, 2: partTwo, 3: partThree, 4: partFour, 5: partFive, 6: partSix };

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
