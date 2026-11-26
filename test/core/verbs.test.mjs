/**
 * The shared verb table.
 *
 * The structural finding in `37-MISSING-TOOLS.md §1` is that there are two
 * compilers sharing a vocabulary and not a table, so every verb added to one
 * is a silent divergence from the other. These tests are what makes the
 * table binding rather than decorative:
 *
 *   - every verb the table PROMISES on a path is compiled on that path, and
 *   - every verb a compiler IMPLEMENTS is read back out of its source and
 *     checked against the table.
 *
 * The second half is the one that matters. Without it the table is a
 * comment: a verb could be added to `compile3d.js` alone, exactly as every
 * verb before Phase 57 was, and nothing would say so.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { VERBS, verbsFor, supports, verbDiagnostic, divergence } from '../../src/core/script/verbs.js';
import { DO_VERBS } from '../../src/core/script/schema.js';
import { compileFilm } from '../../src/core/script/compile.js';
import { compileFilm3D } from '../../src/core/script/compile3d.js';
import { samplePose } from '../../src/core/anim/Evaluator.js';
import { applyChannel } from '../../src/backends/three3d/PoseApplier.js';

const SRC = (f) => new URL(`../../src/core/script/${f}`, import.meta.url);

/** A one-shot 2D film whose single action is `action`. */
const film2d = (action) => ({
    version: 'jirex.film/1',
    meta: { title: 't', fps: 24, width: 100, height: 100 },
    assets: { bang: { kind: 'audio', src: 'bang.mp3' } },
    characters: { c: { role: 'effect',
        parts: [{ id: 'body', pivot: [0, 0], at: [50, 50],
                  shape: { kind: 'ellipse', rx: 10, ry: 10 }, fill: '#fff' }] } },
    scenes: [{ id: 's', cast: [{ character: 'c', as: 'thing', at: [0, 0] }],
               shots: [{ id: 'sh', duration: 4, actions: [action] }] }],
});

/** The same, in 3D. */
const film3d = (action) => ({
    meta: { title: 't', fps: 24 },
    assemblies: { a: { parts: [{ id: 'p', geometry: { kind: 'cube', size: [1, 1, 1] } }] } },
    cast: [{ assembly: 'a', as: 'thing' }],
    scenes: [{ id: 's', shots: [{ id: 'one', duration: 4, actions: [action] }] }],
});

const messages = (c) => c.diagnostics.map((d) => d.message).join(' | ');

// ---------------------------------------------------------------------------
// The table is binding, in both directions
// ---------------------------------------------------------------------------

test('every verb the table promises on a path is implemented on that path', () => {
    for (const [path, build, compile] of [['2d', film2d, compileFilm],
                                          ['3d', film3d, compileFilm3D]]) {
        for (const verb of verbsFor(path)) {
            const c = compile(build({ target: 'thing', do: verb, asset: 'bang' }));
            const m = messages(c);
            assert.ok(!/divergence/.test(m),
                `${path}: ${verb} is in the table and the compiler has no handler -- ${m}`);
            assert.ok(!/unknown verb/.test(m), `${path}: ${verb} reported as unknown -- ${m}`);
        }
    }
});

/**
 * And the other way: read the verbs each compiler really implements out of
 * its own source. A `case` label in the action dispatch, or an early
 * `action.do === '...'` for the verbs that resolve before the cast lookup.
 */
const implemented = (file) => {
    const src = readFileSync(SRC(file), 'utf8');
    const from = src.indexOf('switch (action.do)');
    assert.ok(from > 0, `${file}: no action dispatch found`);
    // The dispatch runs to the end of its enclosing function: the next line
    // that is a lone closing brace in column one.
    const to = src.indexOf('\n}\n', from);
    const body = src.slice(from, to);
    const verbs = new Set();
    for (const m of body.matchAll(/case '([a-z]+)':/g)) verbs.add(m[1]);
    // `draw`, `boil`, `expose` and `sound` are resolved before the cast
    // lookup, because an asset or a drawing is not a cast member.
    for (const m of src.matchAll(/action\.do === '([a-z]+)'/g)) {
        if (!/\?|:/.test(src.slice(m.index - 40, m.index))) verbs.add(m[1]);
    }
    return verbs;
};

test('every verb a compiler implements is in the table, for that path', () => {
    for (const [path, file] of [['2d', 'compile.js'], ['3d', 'compile3d.js']]) {
        for (const verb of implemented(file)) {
            assert.ok(supports(path, verb),
                `${file} implements '${verb}' and the table does not list it for ${path}: `
                + 'a verb added to one compiler and nowhere else is the exact defect '
                + 'this table exists to prevent');
        }
    }
});

test('the 2D verb list is derived from the table, not kept beside it', () => {
    assert.deepEqual(DO_VERBS, verbsFor('2d'));
    assert.ok(!/'play', 'pose'/.test(readFileSync(SRC('schema.js'), 'utf8')),
        'the old literal list is gone');
});

// ---------------------------------------------------------------------------
// What an author is told
// ---------------------------------------------------------------------------

test('a verb on the other path is named as such, with what to say here', () => {
    // The whole point: `nudge` is not a typo and telling an author it is
    // unknown sends them hunting for a misspelling in a correct word.
    assert.match(verbDiagnostic('nudge', '2d'), /is a 3D verb.*use shift/);
    assert.match(verbDiagnostic('shift', '3d'), /is a 2D verb.*use nudge/);
    assert.match(verbDiagnostic('smear', '3d'), /meta\.shutter/);
    // No equivalent is an honest answer, and distinguishable from a typo.
    assert.match(verbDiagnostic('cut', '2d'), /no equivalent/);
    assert.match(verbDiagnostic('count', '3d'), /no equivalent/);
    // A word that is no verb gets the list for the path it was written on.
    assert.match(verbDiagnostic('teleport', '2d'), /unknown verb 'teleport'\. The 2D verbs are: /);
    assert.match(verbDiagnostic('teleport', '3d'), /The 3D verbs are: /);
    assert.equal(verbDiagnostic('move', '2d'), null, 'a verb that works says nothing');
    assert.equal(verbDiagnostic('move', '3d'), null);
    assert.match(divergence('spin', '3d'), /table\/compiler divergence/);
});

test('a film naming the other path\'s verb is told so when it compiles', () => {
    assert.match(messages(compileFilm(film2d({ target: 'thing', do: 'nudge', by: [1, 0, 0] }))),
                 /'nudge' is a 3D verb/);
    assert.match(messages(compileFilm3D(film3d({ target: 'thing', do: 'shift', by: [1, 0] }))),
                 /'shift' is a 2D verb/);
});

test('every row is well formed, because the table is now the contract', () => {
    for (const [name, row] of Object.entries(VERBS)) {
        assert.ok(row.paths?.length, `${name}: no paths`);
        assert.ok(row.paths.every((p) => p === '2d' || p === '3d'), `${name}: bad path`);
        assert.ok(row.does?.length > 8, `${name}: no description`);
        for (const p of Object.keys(row.instead ?? {})) {
            assert.ok(!row.paths.includes(p),
                `${name}: has an \`instead\` for ${p}, which it already supports`);
        }
    }
});

// ---------------------------------------------------------------------------
// The two gaps the table exposed, both of them a call nobody had made
// ---------------------------------------------------------------------------

test('2D `sound` fires an effect at a shot-relative moment', () => {
    // Before: audio could only be declared at SCENE level, so a cue two
    // seconds into the third shot was arithmetic the author did by hand and
    // redid whenever a shot above it changed length.
    const f = film2d({ do: 'sound', asset: 'bang', at: 2, gain: 0.5 });
    f.scenes[0].shots.unshift({ id: 'first', duration: 3, actions: [] });
    const c = compileFilm(f);
    const cue = c.audioCues.find((q) => q.assetId === 'bang');
    assert.ok(cue, `no cue: ${messages(c)}`);
    assert.equal(cue.at, 5, 'shot-relative: 3s of first shot plus 2s in');
    assert.equal(cue.gain, 0.5);
    assert.equal(cue.bus, 'sfx', 'an effect, not a music bed');
    // And a cue with no asset is a diagnostic, not a silent nothing.
    assert.match(messages(compileFilm(film2d({ do: 'sound', at: 1 }))), /needs an `asset`/);
});

test('3D `show` / `hide` reveals a prop mid-shot', () => {
    const c = compileFilm3D(film3d({ target: 'thing', do: 'hide', at: 2 }));
    const track = c.timeline.tracks.find((t) => t.path === 'visible');
    assert.ok(track, `no visible track: ${messages(c)}`);
    assert.equal(track.type, 'discrete', 'a boolean is not interpolated');
    // Seeded at frame zero, or one `hide` at t=2 would hide the prop from
    // frame one: a track reads as its first key at every earlier time.
    assert.equal(track.keys[0].t, 0);
    assert.equal(track.keys[0].v, true);
    assert.equal(track.keys.at(-1).t, 2);
    assert.equal(track.keys.at(-1).v, false);
    // `show` is the same key, the other way up.
    const up = compileFilm3D(film3d({ target: 'thing', do: 'show', at: 1 }));
    assert.equal(up.timeline.tracks.find((t) => t.path === 'visible').keys.at(-1).v, true);
    // It is a cut, and `for` says so rather than being silently dropped.
    assert.match(messages(compileFilm3D(film3d({ target: 'thing', do: 'hide', at: 1, for: 0.5 }))),
                 /is a cut on this path/);

    // And it reaches an object: the key is worthless if the applier drops it,
    // which is the half of this that had existed, untested, since Phase 14.
    const object = { visible: true };
    for (const [t, want] of [[0, true], [1.9, true], [2.1, false], [3.9, false]]) {
        const v = samplePose(c.timeline, t).get(track.target).get('visible');
        applyChannel(object, 'visible', v);
        assert.equal(object.visible, want, `at ${t}s`);
    }
});
