/**
 * Compile a 2D film and report everything that can be known without a render:
 * diagnostics, staging, and the frame budget.
 *
 * The 3D path has had `CHECK=1 npm run produce:3d` for this since Phase 15;
 * the 2D path had nothing, so the only way to see a diagnostic was to start a
 * render and read the log. A mistyped key is a *warning* here by design --
 * which means it silently does nothing and you find out by looking at a frame.
 * This makes that cheap.
 *
 *   FILM=films/geology/part-01.json node scripts/check-film.mjs
 */
import { readFile } from 'node:fs/promises';

import { compileFilm } from '../src/core/script/compile.js';
import { validateFilm } from '../src/core/script/validate.js';
import { analyseStaging } from '../src/core/script/staging.js';
import { trackValueAt } from '../src/core/anim/Track.js';

const FILM = process.env.FILM ?? 'demo/film.json';
const film = JSON.parse(await readFile(new URL(`../${FILM}`, import.meta.url), 'utf8'));

const problems = [...validateFilm(film)];
const compiled = compileFilm(film, { assets: null });
problems.push(...compiled.diagnostics);
problems.push(...analyseStaging(compiled, film, { trackValueAt }));

const by = { fatal: [], error: [], warning: [], info: [] };
for (const d of problems) (by[d.severity] ?? by.info).push(d);

const { meta } = compiled;
console.log(`${film.meta?.title ?? FILM}`);
console.log(`  ${meta.width}x${meta.height} @ ${meta.fps}  `
    + `${meta.duration.toFixed(2)}s = ${Math.round(meta.duration * meta.fps)} frames  `
    + `(${Math.floor(meta.duration / 60)}:${String(Math.round(meta.duration % 60)).padStart(2, '0')})`);
console.log(`  ${compiled.scene.byId.size} nodes, ${compiled.timeline.tracks.length} tracks, `
    + `${compiled.audioCues.length} audio cues, ${compiled.lipsyncJobs.length} lines`);

for (const sev of ['fatal', 'error', 'warning', 'info']) {
    const list = by[sev];
    if (!list.length) continue;
    // Info is usually an IK reach falling short by a pixel; count it, don't
    // print forty of them.
    if (sev === 'info') { console.log(`\n  info: ${list.length} notes`); continue; }
    console.log(`\n${sev} (${list.length}):`);
    for (const d of list) console.log(`  ${d.path ?? ''}: ${d.message}`);
}

const bad = by.fatal.length + by.error.length;
if (bad) { console.error(`\nFAILED: ${bad} must-fix`); process.exit(1); }
console.log(`\nOK${by.warning.length ? ` — ${by.warning.length} warnings to read` : ''}`);
