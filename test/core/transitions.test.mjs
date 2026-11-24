import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeTransitions, transitionOps, coverAt, blendAt, checkTransitions,
    TRANSITION_DURATION,
} from '../../src/core/art/transitions.js';
import { compileFilm3D } from '../../src/core/script/compile3d.js';
import { getTrack } from '../../src/core/anim/Timeline.js';
import { trackValueAt } from '../../src/core/anim/Track.js';

/** Shot spans in the shape `compileFilm3D` produces them. */
const spans = (...durations) => {
    const out = [];
    let t = 0;
    for (const [i, d] of durations.entries()) {
        out.push({ sceneId: 's1', shotId: `sh${i + 1}`, start: t, end: t + d,
                   duration: d, shot: {} });
        t += d;
    }
    return out;
};
const collect = () => { const w = []; return [w, (m, l) => w.push({ m, l })]; };

test('normalizeTransitions', async (t) => {
    await t.test('a shot declares the boundary where it begins', () => {
        const shots = spans(4, 4);
        shots[1].shot.transition = { kind: 'dip', duration: 1 };
        const [w, warn] = collect();
        const list = normalizeTransitions({ scenes: [{ shots: [{}, {}] }] }, shots, warn);
        assert.equal(list.length, 1);
        assert.equal(list[0].at, 4);
        assert.equal(list[0].from, 'sh1');
        assert.equal(list[0].to, 'sh2');
        assert.deepEqual(w, []);
    });

    await t.test('mode is inferred from where the boundary sits', () => {
        const shots = spans(3, 3, 3);
        shots[0].shot.transition = { kind: 'fade' };
        shots[1].shot.transition = { kind: 'fade' };
        const film = { scenes: [{ id: 's1', shots: [{}, {}, {}],
                                 transitionOut: { kind: 'fade' } }] };
        const list = normalizeTransitions(film, shots, () => {});
        assert.deepEqual(list.map((x) => [x.at, x.mode]), [[0, 'in'], [3, 'dip'], [9, 'out']]);
    });

    await t.test('the 2D vocabulary is accepted on a scene', () => {
        const shots = spans(3, 3);
        const film = { scenes: [{ id: 'a', shots: [{}, {}],
                                  transitionIn: { kind: 'fade', duration: 0.5 } }] };
        const list = normalizeTransitions(film, shots, () => {});
        assert.equal(list.length, 1);
        assert.equal(list[0].duration, 0.5);
        assert.equal(list[0].where, 'scenes.a.transitionIn');
    });

    await t.test('a shot beats its scene at the same instant, and says so', () => {
        const shots = spans(3, 3);
        shots[0].shot.transition = { kind: 'iris' };
        const film = { scenes: [{ id: 'a', shots: [{}, {}], transitionIn: { kind: 'fade' } }] };
        const [w, warn] = collect();
        const list = normalizeTransitions(film, shots, warn);
        assert.equal(list.length, 1);
        assert.equal(list[0].kind, 'iris');
        assert.equal(w.length, 1);
        assert.match(w[0].m, /declared twice/);
        assert.match(w[0].m, /scenes\.a\.transitionIn/);
    });

    await t.test('the default duration matches the 2D path', () => {
        const shots = spans(5, 5);
        shots[1].shot.transition = { kind: 'dip' };
        const list = normalizeTransitions({ scenes: [{ shots: [{}, {}] }] }, shots, () => {});
        assert.equal(list[0].duration, TRANSITION_DURATION);
    });

    await t.test('clamps a transition longer than the shots it joins', () => {
        /**
         * The Phase 33 shape, arriving on a new feature. `retimeToAudio`
         * grows a shot to fit its real take AFTER the author picks this
         * number, so a constant can end up longer than the shot it overlaps.
         * A dip that never finishes opening has no symptom anything else
         * reports.
         */
        const shots = spans(6, 1.5);
        shots[1].shot.transition = { kind: 'dip', duration: 4 };
        const [w, warn] = collect();
        const list = normalizeTransitions({ scenes: [{ shots: [{}, {}] }] }, shots, warn);
        assert.equal(list[0].duration, 1.5);
        assert.match(w[0].m, /clamped/);
    });

    await t.test('a sub-frame transition is a hard cut, not an invisible one', () => {
        const shots = spans(3, 3);
        shots[1].shot.transition = { kind: 'fade', duration: 0.005 };
        const [w, warn] = collect();
        const list = normalizeTransitions({ scenes: [{ shots: [{}, {}] }] }, shots, warn);
        assert.deepEqual(list, []);
        assert.match(w[0].m, /below half a frame/);
    });

    await t.test('kind "none" produces nothing at all', () => {
        const shots = spans(3, 3);
        shots[1].shot.transition = { kind: 'none' };
        assert.deepEqual(
            normalizeTransitions({ scenes: [{ shots: [{}, {}] }] }, shots, () => {}), []);
    });

    await t.test('an unknown kind is named, with the list of known ones', () => {
        const shots = spans(3, 3);
        shots[1].shot.transition = { kind: 'starwipe' };
        const [w, warn] = collect();
        const list = normalizeTransitions({ scenes: [{ shots: [{}, {}] }] }, shots, warn);
        assert.equal(list[0].kind, 'fade');
        assert.match(w[0].m, /unknown transition kind 'starwipe'/);
        assert.match(w[0].m, /wipe/);
    });

    await t.test('crossfade falls back LOUDLY rather than silently', () => {
        // Phase 33 shipped twelve films in the wrong voice because a fallback
        // reported nothing. A tier that is not built must say which one.
        const shots = spans(3, 3);
        shots[1].shot.transition = { kind: 'crossfade' };
        const [w, warn] = collect();
        const list = normalizeTransitions({ scenes: [{ shots: [{}, {}] }] }, shots, warn);
        assert.equal(list[0].kind, 'dip');
        assert.match(w[0].m, /not implemented on the 3D path yet/);
        assert.match(w[0].m, /two cameras/);
    });

    await t.test('continue is named as a camera move, not a draw', () => {
        const shots = spans(3, 3);
        shots[1].shot.transition = { kind: 'continue' };
        const list = normalizeTransitions({ scenes: [{ shots: [{}, {}] }] }, shots, () => {});
        assert.equal(list[0].mode, 'camera');
        assert.equal(coverAt(list[0], 3), 0);
    });
});

test('coverAt', async (t) => {
    const tr = (over) => ({ at: 4, kind: 'fade', mode: 'dip', duration: 1,
                            ease: 'linear', color: '#000', ...over });

    await t.test('a dip is out then in, peaking at the cut', () => {
        const x = tr();
        assert.equal(coverAt(x, 3.5), 0);
        assert.equal(coverAt(x, 3.75), 0.5);
        assert.equal(coverAt(x, 4), 1);
        assert.equal(coverAt(x, 4.25), 0.5);
        assert.equal(coverAt(x, 4.5), 0);
    });

    await t.test('an "in" starts covered and opens', () => {
        const x = tr({ at: 0, mode: 'in' });
        assert.equal(coverAt(x, 0), 1);
        assert.equal(coverAt(x, 0.5), 0.5);
        assert.equal(coverAt(x, 1), 0);
    });

    await t.test('an "out" closes onto the boundary', () => {
        const x = tr({ at: 8, mode: 'out' });
        assert.equal(coverAt(x, 7), 0);
        assert.equal(coverAt(x, 7.5), 0.5);
        assert.equal(coverAt(x, 8), 1);
    });

    await t.test('is zero outside its own window, so a transition is as long as it says', () => {
        const x = tr();
        assert.equal(coverAt(x, 0), 0);
        assert.equal(coverAt(x, 100), 0);
    });

    await t.test('honours the named ease', () => {
        const x = tr({ at: 0, mode: 'in', ease: 'smooth' });
        // smoothstep(0.5) is 0.5, but the curve either side is not linear.
        assert.equal(coverAt(x, 0.5), 0.5);
        assert.ok(coverAt(x, 0.25) > 0.75, 'smooth holds the colour longer at the start');
    });
});

test('transitionOps', async (t) => {
    const size = { width: 1920, height: 1080 };

    await t.test('a fade is one full-frame rect, and nothing when it is over', () => {
        const list = [{ at: 0, kind: 'fade', mode: 'in', duration: 1, ease: 'linear',
                        color: '#000000' }];
        const ops = transitionOps(list, 0.5, size);
        assert.deepEqual(ops, [{ op: 'rect', x: 0, y: 0, w: 1920, h: 1080,
                                 fill: '#000000', alpha: 0.5 }]);
        assert.deepEqual(transitionOps(list, 2, size), []);
    });

    await t.test('a wipe covers the frame COMPLETELY at full coverage', () => {
        /**
         * The soft edge travels to `cover * (span + soft)`, not
         * `cover * span`. Stopping at `span` leaves a translucent strip down
         * the far edge for every held frame -- visible in the file, and
         * invisible to any check that samples the middle of the frame.
         */
        const list = [{ at: 4, kind: 'wipe', mode: 'out', duration: 1, ease: 'linear',
                        color: '#101010', dir: 'left', soft: 0.06 }];
        const ops = transitionOps(list, 4, size);
        const solid = ops.find((o) => o.op === 'rect');
        assert.equal(solid.x, 0);
        assert.equal(solid.w, 1920, 'the solid part spans the whole frame');
        const grad = ops.find((o) => o.op === 'grad');
        assert.ok(grad, 'and the gradient edge has passed beyond it');
        assert.equal(grad.from.length, 9, 'stops carry their own alpha as #rrggbbaa');
        assert.ok(grad.to.endsWith('00'));
    });

    await t.test('a wipe at half coverage covers half the frame from its direction', () => {
        const list = [{ at: 4, kind: 'wipe', mode: 'out', duration: 1, ease: 'linear',
                        color: '#000', dir: 'right', soft: 0 }];
        const ops = transitionOps(list, 3.5, size);
        const solid = ops.find((o) => o.op === 'rect');
        // `right` enters from the right, so the covered band hugs that edge.
        assert.ok(Math.abs(solid.w - 960) < 2, `width ${solid.w}`);
        assert.ok(Math.abs(solid.x - 960) < 2, `x ${solid.x}`);
    });

    await t.test('an iris hole clears the CORNERS at zero coverage', () => {
        // Sized on the half-diagonal, not the half-width: a radius of
        // width/2 leaves the corners tinted for the whole shot.
        const list = [{ at: 4, kind: 'iris', mode: 'dip', duration: 1, ease: 'linear',
                        color: '#000', centre: [0.5, 0.5] }];
        const [op] = transitionOps(list, 3.5 + 1e-9, size);
        assert.equal(op.op, 'hole');
        assert.ok(op.r >= Math.hypot(960, 540) - 1, `r ${op.r} must reach the corner`);
        const [shut] = transitionOps(list, 4, size);
        assert.equal(shut.r, 0, 'and closes completely at the cut');
    });

    await t.test('continue draws nothing', () => {
        const list = [{ at: 4, kind: 'continue', mode: 'camera', duration: 1,
                        ease: 'linear', color: '#000' }];
        assert.deepEqual(transitionOps(list, 4, size), []);
    });
});

test('blendAt names what is covering the frame', () => {
    const list = [{ at: 4, kind: 'dip', mode: 'dip', duration: 1, ease: 'linear',
                    color: '#000', from: 'a', to: 'b' }];
    assert.equal(blendAt(list, 0), null);
    assert.deepEqual(blendAt(list, 4),
        { kind: 'dip', mode: 'dip', cover: 1, at: 4, from: 'a', to: 'b' });
});

test('checkTransitions', async (t) => {
    const shots = spans(4, 4);

    await t.test('an interior fade OUT with nothing fading back in', () => {
        /**
         * `coverAt` is zero outside its own window, so an unpaired 'out' in
         * the middle of a film leaves the frame at solid colour and then
         * SNAPS back to picture at the boundary. Nothing else in the engine
         * can see this, because every individual number is correct.
         */
        const found = checkTransitions(
            [{ at: 4, kind: 'fade', mode: 'out', duration: 1, where: 's.transitionOut',
               color: '#000' }], shots, { duration: 8 });
        assert.equal(found.length, 1);
        assert.match(found[0].message, /snap from solid colour to picture/);
    });

    await t.test('and not when it IS the end of the film', () => {
        assert.deepEqual(checkTransitions(
            [{ at: 8, kind: 'fade', mode: 'out', duration: 1, where: 'w', color: '#000' }],
            shots, { duration: 8 }), []);
    });

    await t.test('overlapping transitions multiply their coverage', () => {
        const found = checkTransitions([
            { at: 4, kind: 'dip', mode: 'dip', duration: 2, where: 'a' },
            { at: 4.5, kind: 'dip', mode: 'dip', duration: 2, where: 'b' },
        ], shots, { duration: 8 });
        assert.ok(found.some((f) => /starts before/.test(f.message)));
    });

    await t.test('back-to-back dissolves are a note, not a failure', () => {
        const found = checkTransitions([
            { at: 4, kind: 'dip', mode: 'dip', duration: 0.4, where: 'a' },
            { at: 5, kind: 'dip', mode: 'dip', duration: 0.4, where: 'b' },
        ], shots, { duration: 8 });
        const notes = found.filter((f) => f.severity === 'note');
        assert.equal(notes.length, 1);
        assert.match(notes[0].message, /read as a mistake/);
        assert.equal(found.filter((f) => f.severity === 'warning').length, 0);
    });

    await t.test('says nothing about a film that is fine', () => {
        assert.deepEqual(checkTransitions([
            { at: 0, kind: 'fade', mode: 'in', duration: 1, where: 'a' },
            { at: 4, kind: 'dip', mode: 'dip', duration: 0.6, where: 'b' },
            { at: 8, kind: 'fade', mode: 'out', duration: 1, where: 'c' },
        ], shots, { duration: 8 }), []);
    });
});

// --------------------------------------------------------- in the compiler

const film3d = (shots) => ({ meta: { title: 't' }, scenes: [{ id: 's1', shots }] });
const camX = (compiled, t) =>
    +trackValueAt(getTrack(compiled.timeline, '__camera', 'position.x'), t).toFixed(3);

test('compileFilm3D carries transitions', async (t) => {
    await t.test('a declared transition reaches meta, where nothing read one before', () => {
        const c = compileFilm3D(film3d([
            { id: 'a', duration: 3, transition: { kind: 'fade' } },
            { id: 'b', duration: 3, transition: { kind: 'dip', duration: 0.6 } },
        ]));
        assert.deepEqual(c.meta.transitions.map((x) => `${x.kind}@${x.at}`),
                         ['fade@0', 'dip@3']);
    });

    await t.test('a film with no transitions gets an empty list, not undefined', () => {
        const c = compileFilm3D(film3d([{ id: 'a', duration: 3 }]));
        assert.deepEqual(c.meta.transitions, []);
    });
});

test('`continue` eases the camera into the incoming framing', async (t) => {
    // Shot `a` moves for 2s of its 3s, so there is a second of stillness for
    // the glide to use; shot `b` sits at x = 4.
    const shots = (tr) => [
        { id: 'a', duration: 3, camera: { to: { at: [0, 1, 5], look: [0, 0, 0] }, for: 2 } },
        { id: 'b', duration: 3, camera: { from: { at: [4, 1, 4] },
                                          to: { at: [4, 1, 4], look: [0, 0, 0] }, for: 0 },
          ...(tr ? { transition: tr } : {}) },
    ];

    await t.test('a hard cut holds its framing and then jumps', () => {
        /**
         * This assertion is the one that found a defect in the camera itself.
         * A shot with `for: 2` and a duration of 3 wrote its arrival key at
         * t+2 and nothing after it, so the track interpolated from there
         * straight to the NEXT shot's `from`: the camera spent the shot's
         * last second drifting into the next shot's framing and the authored
         * hold did not exist. It now holds.
         */
        const c = compileFilm3D(film3d(shots(null)));
        assert.equal(camX(c, 2), 0);
        assert.equal(camX(c, 2.5), 0, 'holds, rather than drifting into the next shot');
        assert.equal(camX(c, 3), 0);
        assert.equal(camX(c, 3.001), 4, 'and cuts');
    });

    await t.test('continue arrives at the new framing exactly on the cut', () => {
        const c = compileFilm3D(film3d(shots({ kind: 'continue', duration: 0.6 })));
        assert.deepEqual(c.diagnostics, []);
        assert.equal(camX(c, 2.4), 0, 'still at the old framing when the glide begins');
        assert.equal(camX(c, 2.7), 2, 'halfway across at the halfway point');
        assert.equal(camX(c, 3), 4, 'and there when the cut arrives');
    });

    await t.test('it is shortened to the stillness available, and says so', () => {
        const c = compileFilm3D(film3d(shots({ kind: 'continue', duration: 2.5 })));
        assert.equal(camX(c, 2), 0, 'cannot overwrite the previous shot\'s own move');
        assert.match(c.diagnostics[0].message, /only 1\.00s of the previous shot is still/);
    });

    await t.test('with no stillness at all it is a hard cut, and says which', () => {
        const c = compileFilm3D(film3d([
            { id: 'a', duration: 3, camera: { to: { at: [0, 1, 5] } } },
            { id: 'b', duration: 3, camera: { from: { at: [4, 1, 4] }, for: 0 },
              transition: { kind: 'continue' } },
        ]));
        assert.match(c.diagnostics[0].message, /Rendered as a hard cut/);
        assert.equal(camX(c, 3.001), 4);
    });

    await t.test('continue on the first shot has nothing to continue from', () => {
        const c = compileFilm3D(film3d([
            { id: 'a', duration: 3, camera: { to: { at: [0, 1, 5] } },
              transition: { kind: 'continue' } },
        ]));
        assert.match(c.diagnostics[0].message, /first shot has no previous framing/);
    });

    await t.test('continue into a shot with no camera says there is nothing to ease to', () => {
        const c = compileFilm3D(film3d([
            { id: 'a', duration: 3, camera: { to: { at: [0, 1, 5] }, for: 2 } },
            { id: 'b', duration: 3, transition: { kind: 'continue' } },
        ]));
        assert.match(c.diagnostics[0].message, /nothing to ease towards/);
    });
});
