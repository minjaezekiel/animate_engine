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
import { readFile, stat } from 'node:fs/promises';

import { compileFilm } from '../src/core/script/compile.js';
import { validateFilm } from '../src/core/script/validate.js';
import { analyseStaging } from '../src/core/script/staging.js';
import { analysePacing } from '../src/core/script/pacing.js';
import { trackValueAt } from '../src/core/anim/Track.js';
import { VOICE_PRESETS } from '../src/core/voice/catalog.js';

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

/**
 * Is every cast voice's Piper model actually on disk?
 *
 * This check exists because of a two-minute advert that rendered with no
 * narration and reported success. It was cast on two presets whose `.onnx`
 * files are not in `vendor/piper-voices/`; a headless render launches a fresh
 * Chrome profile, so vits-web had nothing cached and nothing to fetch, and
 * every line by those two voices came out SILENT. The muxed file carried a
 * valid AAC track made entirely of 6-byte silent frames, `validateFilm`
 * passed, `analysePacing` reported 84% line coverage -- because coverage is
 * computed from the SCRIPT, not from the audio -- and the only way to find it
 * was to listen.
 *
 * A missing model is the one voice failure with no symptom, so it is the one
 * that has to be checked before the render rather than after. `error`, not
 * `warning`: a film with no narration is not a film.
 */
async function checkVoiceModels(film) {
    const out = [];
    const voices = film.voices ?? {};
    if (!Object.keys(voices).length) return out;
    const root = new URL('../vendor/piper-voices/', import.meta.url).pathname;
    // vits-web lays a voice out as <lang>/<locale>/<name>/<quality>/<id>.onnx,
    // and the id itself carries every part of that path.
    const pathOf = (id) => {
        const m = /^([a-z]{2})_([A-Z]{2})-(.+)-([a-z]+)$/.exec(id);
        if (!m) return null;
        const [, lang, region, name, quality] = m;
        return `${root}${lang}/${lang}_${region}/${name}/${quality}/${id}.onnx`;
    };
    const seen = new Map();
    for (const [role, entry] of Object.entries(voices)) {
        const spec = typeof entry === 'string' ? entry : entry?.spec;
        if (!spec) continue;
        // A preset name expands to a spec; a raw `tts:` spec is already one.
        const resolved = VOICE_PRESETS[spec]?.spec ?? spec;
        if (!String(resolved).startsWith('tts:')) continue;   // mic, upload, voicestudio
        const id = String(resolved).slice(4);
        const file = pathOf(id);
        if (!file) continue;
        if (!seen.has(file)) {
            seen.set(file, await stat(file).then(() => true).catch(() => false));
        }
        if (!seen.get(file)) {
            out.push({ severity: 'error', path: `voices.${role}`,
                message: `"${spec}" resolves to the Piper model "${id}", which is NOT in `
                    + 'vendor/piper-voices/. A headless render cannot fetch it and every line '
                    + `in this voice will be SILENT with no error. Vendor it first `
                    + `(VOICE=${id} npm run vendor-voice), or cast a vendored preset.` });
        }
    }
    return out;
}

problems.push(...await checkVoiceModels(film));

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
