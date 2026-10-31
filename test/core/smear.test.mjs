import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compileFilm } from '../../src/core/script/compile.js';
import { samplePose } from '../../src/core/anim/Evaluator.js';

/**
 * Smears: the same drawing repeated along its own motion path.
 *
 * `cast.echo` has shipped as "done" since Phase 13 with no test of any kind.
 * These cover it, and the time-gated `do: 'smear'` built on the same pass --
 * a limb smears for three frames of a swing, which shot granularity cannot
 * express. See 21-DRAWN-ANIMATION.md.
 */

const film = (over = {}) => ({
    version: 'jirex.film/1',
    meta: { fps: 24, width: 1280, height: 720 },
    characters: { dog: { generate: { build: 'child' }, proportions: { height: 200 } } },
    scenes: [{
        id: 's1',
        cast: [{ character: 'dog', as: 'dog', at: [200, 0], ...(over.cast ?? {}) }],
        shots: over.shots ?? [
            { id: 'a', duration: 1, actions: over.actions ?? [] },
            { id: 'b', duration: 1 },
        ],
    }],
});

/** Ghost root ids present in the compiled scene. */
const ghostRoots = (r) => {
    const out = [];
    r.scene.walk?.((n) => { if (/^s1\/dog#echo\d+$/.test(n.id)) out.push(n.id); });
    return out.sort();
};

test('cast.echo clones the subtree once per ghost', () => {
    const r = compileFilm(film({ cast: { echo: { frames: 3 } } }));
    assert.deepEqual(ghostRoots(r), ['s1/dog#echo1', 's1/dog#echo2', 's1/dog#echo3']);
});

test('a ghost reads its tracks EARLIER in time, so it trails', () => {
    const r = compileFilm(film({
        cast: { echo: { frames: 1, spacing: 2 } },
        actions: [{ target: 'dog', do: 'move', to: [800], at: 0, for: 2 }],
    }));
    const x = (id, t) => samplePose(r.timeline, t).get(id)?.get('transform.x');
    // At t, the ghost shows where the live drawing was 2 frames ago.
    assert.equal(x('s1/dog#echo1', 10 / 24), x('s1/dog', 8 / 24),
        'the ghost is the live drawing, two frames stale');
});

test('ghosts sit behind the live drawing and fade back', () => {
    const r = compileFilm(film({ cast: { echo: { frames: 3, falloff: 0.5 } } }));
    const z = {}; const alpha = {};
    r.scene.walk((n) => {
        const m = /^s1\/dog(#echo(\d))?$/.exec(n.id);
        if (m) { z[m[2] ?? '0'] = n.z; alpha[m[2] ?? '0'] = n.props.alpha ?? 1; }
    });
    assert.ok(z['1'] < z['0'], 'a ghost in front reads as double exposure, not speed');
    assert.ok(z['2'] < z['1'] && z['3'] < z['2'], 'and they stack back in order');
    assert.ok(alpha['1'] > alpha['2'] && alpha['2'] > alpha['3'], 'each ghost is fainter');
});

test('echo is gated off outside the shots that ask for it', () => {
    const r = compileFilm(film({ cast: { echo: { frames: 2, shots: ['b'] } } }));
    const a = (t) => samplePose(r.timeline, t).get('s1/dog#echo1')?.get('props.alpha');
    assert.equal(a(0.5), 0, 'shot a did not ask for a trail');
    assert.ok(a(1.5) > 0, 'shot b did');
});

test('do: smear gates a trail to a span inside one shot', () => {
    const r = compileFilm(film({
        shots: [{
            id: 'a', duration: 2,
            actions: [{ target: 'dog', do: 'smear', samples: 2, at: 0.5, for: 0.25 }],
        }],
    }));
    assert.deepEqual(ghostRoots(r), ['s1/dog#echo1', 's1/dog#echo2']);
    const a = (t) => samplePose(r.timeline, t).get('s1/dog#echo1')?.get('props.alpha');
    assert.equal(a(0.2), 0, 'before the smear');
    assert.ok(a(0.6) > 0, 'during it');
    assert.equal(a(1.5), 0, 'after it -- a character is not smearing while it stands still');
});

test('spread is in seconds and converts to the frame spacing echo wants', () => {
    const r = compileFilm(film({
        shots: [{
            id: 'a', duration: 2,
            actions: [
                { target: 'dog', do: 'move', to: [800], at: 0, for: 2 },
                { target: 'dog', do: 'smear', samples: 1, spread: 1 / 8, at: 0, for: 2 },
            ],
        }],
    }));
    const x = (id, t) => samplePose(r.timeline, t).get(id)?.get('transform.x');
    // spread 1/8 s at 24 fps = 3 frames behind.
    assert.equal(x('s1/dog#echo1', 12 / 24), x('s1/dog', 9 / 24));
});

test('smearing an unknown target warns rather than silently doing nothing', () => {
    const r = compileFilm(film({
        shots: [{ id: 'a', duration: 1, actions: [{ target: 'ghost', do: 'smear' }] }],
    }));
    assert.ok(r.diagnostics.some((d) => /smear: no cast member "ghost"/.test(d.message)));
});

test('a smear is deterministic: compiling twice gives the same keys', () => {
    const make = () => compileFilm(film({
        shots: [{ id: 'a', duration: 1,
                  actions: [{ target: 'dog', do: 'smear', samples: 3, at: 0.2, for: 0.3 }] }],
    }));
    const keysOf = (r) => r.timeline.tracks
        .filter((t) => String(t.target).includes('#echo'))
        .map((t) => `${t.target}|${t.path}|${t.keys.map((k) => k.t.toFixed(6)).join(',')}`)
        .sort();
    assert.deepEqual(keysOf(make()), keysOf(make()));
});
