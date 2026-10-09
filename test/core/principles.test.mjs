/**
 * The four principles of animation that needed an engine affordance.
 *
 * The other eight were already expressible -- easing is slow in and slow out,
 * concurrent clip instances are secondary action, the pose library is
 * pose-to-pose, `staging.js` checks staging. These four could not be
 * expressed without an author hand-writing extra keyframes every time, so
 * each is now one number on an action, and each is asserted on the compiled
 * timeline rather than on the helper alone -- a helper nothing calls is not
 * an affordance.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    anticipationValue, overshootValue, arcMidpoint, overlapDelays, applyOverlap, squashKeys,
} from '../../src/core/anim/principles.js';
import { compileFilm } from '../../src/core/script/compile.js';
import { trackValueAt } from '../../src/core/anim/Track.js';

const film = (actions, extra = {}) => ({
    version: 'jirex.film/1',
    meta: { fps: 24, width: 1280, height: 720 },
    characters: { a: { generate: {}, proportions: { height: 160 }, ...extra } },
    scenes: [{ id: 's1', cast: [{ character: 'a', as: 'a', at: [100, 500] }],
               shots: [{ id: 'sh', duration: 4, actions }] }],
});
const track = (t, target, path) => t._index.get(`${target}\u0000${path}`);
const valueAt = (tr, t) => trackValueAt(tr, t);

// -------------------------------------------------------------- anticipation

test('anticipation moves AGAINST the target before moving toward it', () => {
    assert.equal(anticipationValue(0, 100, 0.12), -12);
    assert.equal(anticipationValue(100, 0, 0.12), 112, 'it is relative, not always negative');

    const { timeline } = compileFilm(film([
        { target: 'a', do: 'move', to: [600, 500], for: 2, anticipate: 0.15 },
    ]), {});
    const x = track(timeline, 's1/a', 'transform.x');
    assert.ok(valueAt(x, 0.52) < 100,
              `anticipation dips below the start, got ${valueAt(x, 0.52)}`);
    assert.ok(Math.abs(valueAt(x, 2) - 600) < 1e-6, 'and still lands exactly on the target');
});

// ------------------------------------------------------------ follow-through

test('follow-through passes the target and settles back onto it', () => {
    assert.equal(overshootValue(0, 100, 0.1), 110);

    const { timeline } = compileFilm(film([
        { target: 'a', do: 'move', to: [600, 500], for: 2, overshoot: 0.12 },
    ]), {});
    const x = track(timeline, 's1/a', 'transform.x');
    assert.ok(valueAt(x, 1.6) > 600, `overshoot peaks past the target, got ${valueAt(x, 1.6)}`);
    assert.ok(Math.abs(valueAt(x, 2) - 600) < 1e-6, 'and settles exactly on it');
});

test('a pose takes anticipation and follow-through through the same path', () => {
    const { timeline } = compileFilm(film(
        [{ target: 'a', do: 'pose', pose: 'point', at: 0, for: 1, overshoot: 0.2 }],
        { poses: { point: { armR: { rot: 1 } } } },
    ), {});
    const rot = track(timeline, 's1/a/armR', 'transform.rot');
    assert.ok(valueAt(rot, 0.8) > 1, 'the arm swings past the pose');
    assert.ok(Math.abs(valueAt(rot, 1) - 1) < 1e-6, 'then lands on it');
});

// --------------------------------------------------------------------- arcs

test('an arc bows the path instead of ruling a straight line', () => {
    const [mx, my] = arcMidpoint([0, 0], [100, 0], 0.2);
    assert.equal(mx, 50);
    assert.equal(my, -20, 'a positive bow lifts the path');
    assert.deepEqual(arcMidpoint([5, 5], [5, 5]), [5, 5], 'zero distance does not divide by zero');

    const { timeline } = compileFilm(film([
        { target: 'a', do: 'move', to: [600, 500], for: 2, arc: 0.2 },
    ]), {});
    const y = track(timeline, 's1/a', 'transform.y');
    assert.ok(valueAt(y, 1) < 500 - 50, `mid-path y rises, got ${valueAt(y, 1)}`);
    assert.ok(Math.abs(valueAt(y, 2) - 500) < 1e-6, 'and still ends where it was told to');

    // Without `arc` the same move is a ruled line, which is the behaviour the
    // option exists to opt out of.
    const flat = compileFilm(film([
        { target: 'a', do: 'move', to: [600, 500], for: 2 },
    ]), {}).timeline;
    assert.equal(valueAt(track(flat, 's1/a', 'transform.y'), 1), 500);
});

// ------------------------------------------------------- overlapping action

test('overlap delays parts down a chain, and leaves the rest alone', () => {
    assert.deepEqual(overlapDelays(0.05, ['arm', 'fore', 'hand']),
                     { arm: 0, fore: 0.05, hand: 0.1 });
    assert.deepEqual(overlapDelays({ fore: 0.2 }), { fore: 0.2 });
    assert.deepEqual(overlapDelays(null), {});

    const shifted = applyOverlap(
        { 'arm.rot': [[0, 1], [1, 2]], 'fore.rot': [[0, 1], [1, 2]] },
        { fore: 0.08 },
    );
    assert.deepEqual(shifted['arm.rot'], [[0, 1], [1, 2]], 'an undelayed part is untouched');
    assert.deepEqual(shifted['fore.rot'], [[0.08, 1], [1.08, 2]]);
});

test('an action declares overlap and the compiled clip carries it', () => {
    const { timeline } = compileFilm(film(
        [{ target: 'a', do: 'play', action: 'wave', at: 0 }],
        {
            actions: {
                wave: {
                    duration: 1, loop: 'repeat', lag: 0.06, chain: ['armR', 'foreR', 'handR'],
                    keys: { 'armR.rot': [[0, 0], [1, 1]], 'foreR.rot': [[0, 0], [1, 1]],
                            'handR.rot': [[0, 0], [1, 1]] },
                },
            },
        },
    ), {});
    const clip = [...timeline.clips.values()].find((c) => c.name === 'wave');
    const startOf = (id) => clip.tracks.find((t) => t.target === id).keys[0].t;
    assert.equal(startOf('armR'), 0, 'the leading part is not delayed');
    assert.ok(Math.abs(startOf('foreR') - 0.06) < 1e-9, 'the forearm trails the upper arm');
    assert.ok(Math.abs(startOf('handR') - 0.12) < 1e-9, 'and the hand trails the forearm');
});

// ------------------------------------------------------- squash and stretch

test('squash preserves volume at every key', () => {
    const k = squashKeys(0.4, 0.25);
    for (let i = 0; i < k.sy.length; i++) {
        assert.equal(k.sy[i][0], k.sx[i][0], 'the two axes are keyed together');
        assert.ok(Math.abs(k.sx[i][1] * k.sy[i][1] - 1) < 1e-9, 'area is held');
    }
    assert.ok(k.sy[1][1] < 1 && k.sx[1][1] > 1, 'it squashes down and spreads wide');
    // Recovery is faster than compression: the asymmetry is what reads as
    // an impact rather than as a breath.
    assert.ok(k.sy[1][0] < 0.4 / 2);
});
