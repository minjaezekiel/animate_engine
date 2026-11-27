/**
 * The dope sheet, in a terminal.
 *
 *   FILM=demo/film.json node scripts/dope.mjs
 *   FILM=demo/film.json TARGET=s1/keeper/ FROM=4 TO=12 node scripts/dope.mjs
 *   FILM=demo/film.json ACTIONS=1 node scripts/dope.mjs
 *
 * Phase 39 measured that ~85% of the tokens spent building a film went on
 * LOOKING at it, and `digest.js` is this repository's answer for the frame:
 * numbers instead of pixels. This is the same answer pointed at time.
 *
 * It needs no browser and no renderer -- `compileFilm` is pure -- so it is
 * the cheapest check in the tree, and the one that answers "why does that
 * beat land late" without a screenshot or a scrub.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { compileFilm, filmShots } from '../src/core/script/compile.js';
import { dopeSheet, formatDope, actionRows } from '../src/core/anim/dope.js';

const ROOT = new URL('..', import.meta.url).pathname;
const FILM = process.env.FILM ?? 'demo/film.json';
const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : null);

const film = JSON.parse(await readFile(join(ROOT, FILM), 'utf8'));
const compiled = compileFilm(film);
if (!compiled.timeline) {
    for (const d of compiled.diagnostics) console.error(`  [${d.severity}] ${d.message}`);
    process.exit(1);
}

// `null`, not +/-Infinity: `formatDope` uses these as the ruler's own
// origin when they are given, and an infinite origin makes every column NaN
// -- which prints a sheet of dashes with no keys on it and no error.
const from = process.env.FROM ? Number(process.env.FROM) : null;
const to = process.env.TO ? Number(process.env.TO) : null;
const width = Number(process.env.WIDTH ?? 64);

console.log(`${film.meta?.title ?? FILM} — ${compiled.meta.duration.toFixed(2)}s `
    + `at ${compiled.meta.fps} fps\n`);

if (process.env.ACTIONS === '1') {
    // The authored half: what was WRITTEN, on the film's clock. This is the
    // half a curve editor can edit, and the half an author recognises.
    const rows = actionRows(film, filmShots(film))
        .filter((r) => r.end >= (from ?? -Infinity) && r.start <= (to ?? Infinity));
    const targets = list(process.env.TARGET);
    for (const r of rows) {
        if (targets && !targets.some((t) => r.target === t || r.target.startsWith(t))) continue;
        console.log(`  ${r.start.toFixed(2).padStart(7)}s `
            + `${(r.open ? '→shot end' : `+${(r.end - r.start).toFixed(2)}s`).padStart(10)}  `
            + `${r.verb.padEnd(9)} ${r.target.padEnd(16)} `
            + `${r.ease}${r.handles ? ` [${r.handles.join(', ')}]` : ''}`);
    }
    console.log(`\n${rows.length} action(s).`);
} else {
    const sheet = dopeSheet(compiled.timeline, {
        targets: list(process.env.TARGET), paths: list(process.env.PATHS),
        from: from ?? -Infinity, to: to ?? Infinity,
        limit: Number(process.env.LIMIT ?? 60),
    });
    console.log(formatDope(sheet, { fps: compiled.meta.fps, width, from, to }));
}
for (const d of compiled.diagnostics) {
    if (d.severity !== 'info') console.log(`  [${d.severity}] ${d.message}`);
}
