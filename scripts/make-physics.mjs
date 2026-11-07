/**
 * "Game Physics" -- a seven-part series on the collision maths that makes a
 * game world feel alive. 1080x1920, English, for phone feeds.
 *
 *   node scripts/make-physics.mjs            # every authored part
 *   PART=1 node scripts/make-physics.mjs     # one part
 *
 * Then check before spending a render -- this series is narration-led, so the
 * pacing report is the point rather than a footnote:
 *
 *   FILM=films/physics/part-01.json node scripts/check-film.mjs
 *   ROOT=. FILM=films/physics/part-01.json AT=2,12,40,96 OUT=out/p \
 *     node scripts/grab2d.mjs
 *
 * Rendering. Piper is the default cast and needs no setup beyond the vendored
 * models; `VOICE_BACKEND=voicestudio` recasts all three roles onto cloned
 * voices in one variable, and `STRICT_VOICE=1` refuses to substitute so a
 * studio that is not running gives a silent line and says so, instead of a
 * film in a stand-in voice:
 *
 *   FORMAT=mp4 FILM=films/physics/part-01.json \
 *     OUT=out/physics/collisions-01.mp4 WIDTH=1080 HEIGHT=1920 npm run produce
 */
import { mkdir, writeFile } from 'node:fs/promises';

import { VOICE_BACKEND } from './lib/physics.mjs';
import { partOne } from './physics/part-01.mjs';
import { partTwo } from './physics/part-02.mjs';
import { partThree } from './physics/part-03.mjs';
import { partFour } from './physics/part-04.mjs';
import { partFive } from './physics/part-05.mjs';
import { partSix } from './physics/part-06.mjs';
import { partSeven } from './physics/part-07.mjs';

const ROOT = new URL('../films/physics/', import.meta.url).pathname;

/** Parts land here as they are authored. */
const PARTS = { 1: partOne, 2: partTwo, 3: partThree, 4: partFour, 5: partFive, 6: partSix, 7: partSeven };

const only = process.env.PART ? Number(process.env.PART) : null;
if (only != null && !PARTS[only]) {
    console.error(`PART=${only} is not authored yet. Have: ${Object.keys(PARTS).join(', ')}.`);
    process.exit(1);
}
const wanted = only != null ? [only] : Object.keys(PARTS).map(Number);

await mkdir(ROOT, { recursive: true });

console.log(`voice backend: ${VOICE_BACKEND}`);

for (const n of wanted) {
    const film = PARTS[n]();
    const name = `part-${String(n).padStart(2, '0')}.json`;
    await writeFile(`${ROOT}${name}`, `${JSON.stringify(film, null, 2)}\n`);

    const dur = film.scenes.reduce(
        (a, s) => a + s.shots.reduce((b, sh) => b + (sh.duration ?? 0), 0), 0);
    const lines = film.scenes.reduce(
        (a, s) => a + s.shots.reduce((b, sh) => b + (sh.dialogue?.length ?? 0), 0), 0);
    console.log(`  ${name}  ${film.scenes.length} scenes, `
        + `${film.scenes.reduce((a, s) => a + s.shots.length, 0)} shots, `
        + `${lines} lines, authored ${Math.floor(dur / 60)}:`
        + `${String(Math.round(dur % 60)).padStart(2, '0')}`);
}
