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
import { analysePacing } from '../src/core/script/pacing.js';
import { trackValueAt } from '../src/core/anim/Track.js';

const FILM = process.env.FILM ?? 'demo/film.json';
const film = JSON.parse(await readFile(new URL(`../${FILM}`, import.meta.url), 'utf8'));

const problems = [...validateFilm(film)];
const compiled = compileFilm(film, { assets: null });
problems.push(...compiled.diagnostics);
problems.push(...analyseStaging(compiled, film, { trackValueAt }));

// Narration pacing, estimated before anything is rendered. The geology series
// shipped ten parts leaving roughly a fifth of their runtime silent and
// nothing said so until a tool was run over the finished audio. What this
// reports is LINE COVERAGE, which is not the audio tool's speech ratio --
// see the header of pacing.js and docs/27-RETENTION.md.
const pacing = analysePacing(compiled);
if (pacing) problems.push(...pacing.diagnostics);

const by = { fatal: [], error: [], warning: [], info: [] };
for (const d of problems) (by[d.severity] ?? by.info).push(d);

const { meta } = compiled;
console.log(`${film.meta?.title ?? FILM}`);
console.log(`  ${meta.width}x${meta.height} @ ${meta.fps}  `
    + `${meta.duration.toFixed(2)}s = ${Math.round(meta.duration * meta.fps)} frames  `
    + `(${Math.floor(meta.duration / 60)}:${String(Math.round(meta.duration % 60)).padStart(2, '0')})`);
console.log(`  ${compiled.scene.byId.size} nodes, ${compiled.timeline.tracks.length} tracks, `
    + `${compiled.audioCues.length} audio cues, ${compiled.lipsyncJobs.length} lines`);
if (pacing) {
    console.log(`  pacing: ${Math.round(pacing.coverage * 100)}% line coverage, `
        + `${pacing.lines} lines in ${pacing.runs} runs, `
        + `${Math.round(pacing.density)} words/min of runtime | hook `
        + `${Math.round(pacing.hook.coverage * 100)}% from `
        + `${pacing.hook.firstWord.toFixed(1)}s | longest gap `
        + `${pacing.gap.seconds.toFixed(1)}s @${pacing.gap.at.toFixed(1)}s, `
        + `tail ${pacing.tail.toFixed(1)}s`);
}

for (const sev of ['fatal', 'error', 'warning', 'info']) {
    const list = by[sev];
    if (!list.length) continue;
    // Info is usually an IK reach falling short by a pixel; count it, don't
    // print forty of them.
    if (sev === 'info') {
        // Counted, not printed -- except the pacing notes, which are the
        // whole point of running this before a render.
        const pacingNotes = list.filter((d) => String(d.path ?? '').startsWith('pacing'));
        console.log(`\n  info: ${list.length} notes`);
        for (const d of pacingNotes) console.log(`  ${d.path}: ${d.message}`);
        continue;
    }
    console.log(`\n${sev} (${list.length}):`);
    for (const d of list) console.log(`  ${d.path ?? ''}: ${d.message}`);
}

const bad = by.fatal.length + by.error.length;
if (bad) { console.error(`\nFAILED: ${bad} must-fix`); process.exit(1); }
console.log(`\nOK${by.warning.length ? ` — ${by.warning.length} warnings to read` : ''}`);
