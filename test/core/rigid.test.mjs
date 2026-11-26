/**
 * Rigid bodies, Tier 1.
 *
 * These are the five proofs named in
 * [44-RIGID-BODIES.md §6](../../docs/pending/44-RIGID-BODIES.md), and they
 * are five rather than one because each fails for a different reason. A
 * solver that is subtly wrong produces plausible motion for twenty frames
 * and then a body sinks through a floor, so "it looks right" is worth less
 * here than anywhere else in the engine.
 *
 *   energy        the integrator
 *   the e^2 law   the impulse
 *   momentum      the rotational integrator, which drifts silently
 *   rest          Baumgarte and sleeping, together
 *   determinism   the contract: frame N is a function of N
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
    simulateBodies, makeBody, makeSurface, integrateQuat, angularMomentum,
    BODY_SHAPES, CONTACT,
} from '../../src/core/sim/rigid.js';
import { compileFilm3D } from '../../src/core/script/compile3d.js';

const FLOOR = [makeSurface({ normal: [0, 1, 0], offset: 0 })];

/** Every local apex of the height curve, as a height above the floor. */
function apexes(samples, radius) {
    const y = samples.map((s) => s.at[1]);
    const out = [];
    for (let i = 1; i < y.length - 1; i++) {
        if (y[i] >= y[i - 1] && y[i] > y[i + 1]) out.push(y[i] - radius);
    }
    return out;
}

const drop = (restitution, { height = 1.1, radius = 0.1, until = 6, fps = 240 } = {}) =>
    simulateBodies({
        bodies: [makeBody({ id: 'b', shape: 'sphere', radius, mass: 1,
                            at: [0, height, 0], restitution, friction: 0 })],
        surfaces: FLOOR, until, fps, step: 0.001,
    })[0].samples;

// ---------------------------------------------------------------------------
// 1. Energy — the integrator
// ---------------------------------------------------------------------------

test('a perfectly elastic ball keeps its height, and the error is the step', () => {
    /**
     * The first version of this solver folded the penetration correction into
     * the normal impulse -- textbook Baumgarte -- and this test is what
     * caught it: 1.000 m became 1.281, then 1.349, then 1.473, **climbing
     * forever**. Position correction is now a separate pass that never
     * touches velocity.
     *
     * What is left is discretisation, and the test says so by measuring it
     * rather than by picking a tolerance: semi-implicit Euler is first
     * order, so refining the step must refine the loss proportionally. A
     * leak would not care about the step.
     */
    const measured = apexes(drop(1), 0.1);
    assert.ok(measured.length >= 5, `only ${measured.length} bounces`);
    for (const [i, h] of measured.slice(0, 5).entries()) {
        assert.ok(Math.abs(h - 1) < 0.02, `bounce ${i + 1} reached ${h.toFixed(4)}, wanted 1.000`);
    }

    const lossPerBounce = (step) => {
        const a = apexes(simulateBodies({
            bodies: [makeBody({ id: 'b', shape: 'sphere', radius: 0.1, mass: 1,
                                at: [0, 1.1, 0], restitution: 1, friction: 0 })],
            surfaces: FLOOR, until: 6, fps: 480, step,
        })[0].samples, 0.1);
        return (1 - a[4] / a[0]) / 4;
    };
    const coarse = lossPerBounce(0.004);
    const fine = lossPerBounce(0.001);
    const finer = lossPerBounce(0.00025);
    assert.ok(coarse / fine > 1.6 && coarse / fine < 2.6,
              `a 4x finer step should lose about 4x less: ${coarse} vs ${fine}`);
    assert.ok(fine / finer > 2.5, `and again: ${fine} vs ${finer}`);
    assert.ok(finer < 0.002, `at a 0.25 ms step the loss is ${(finer * 100).toFixed(2)}% a bounce`);
});

// ---------------------------------------------------------------------------
// 2. The e^2 law — the impulse
// ---------------------------------------------------------------------------

test('bounce height falls as the square of the restitution', () => {
    // Phase 36 had to correct `bounceParts` for exactly this, in an
    // authoring helper that existed only because there was no solver to ask.
    const measured = apexes(drop(0.5), 0.1);
    for (const n of [1, 2]) {
        const want = 0.25 ** n;
        assert.ok(Math.abs(measured[n - 1] - want) / want < 0.05,
                  `bounce ${n}: ${measured[n - 1].toFixed(4)}, wanted ${want}`);
    }
    // And it keeps decaying rather than settling into a limit cycle.
    assert.ok(measured[3] < measured[2] && measured[2] < measured[1]);
});

// ---------------------------------------------------------------------------
// 3. Angular momentum — the rotational integrator
// ---------------------------------------------------------------------------

test('a free body holds its angular momentum, and its quaternion stays unit', () => {
    /**
     * This is the one that drifts silently. A quaternion whose length has
     * crept away from 1 is a rotation AND a scale, so a tumbling body slowly
     * shrinks -- the silent-black class of defect, in a form nobody would
     * look for.
     */
    const body = makeBody({ id: 't', shape: 'box', size: [0.04, 0.01, 0.01],
                            mass: 0.0105, spin: [0.3, 7, 0.2] });
    const before = Math.hypot(...angularMomentum(body));
    for (let i = 0; i < 10_000; i++) body.q = integrateQuat(body.q, body.w, 0.001);
    const after = Math.hypot(...angularMomentum(body));
    assert.ok(Math.abs(after - before) / before < 1e-9,
              `|L| went ${before} -> ${after}`);
    assert.ok(Math.abs(Math.hypot(...body.q) - 1) < 1e-12, 'and the quaternion is still unit');
});

// ---------------------------------------------------------------------------
// 4. Rest — Baumgarte and sleeping together
// ---------------------------------------------------------------------------

test('a box lands flat, settles within the slop, and goes to sleep', () => {
    // Three starting orientations, because the flat one passes by accident:
    // the failure this test exists for only appears when the box lands with
    // some rotation and micro-rocks on its corners.
    for (const [name, q] of [['flat', [0, 0, 0, 1]],
                             ['tumbled', [0.2, 0.1, 0.3, 0.927]],
                             ['on an edge', [0.38, 0, 0, 0.92]]]) {
        const samples = simulateBodies({
            bodies: [makeBody({ id: 'box', shape: 'box', size: [0.06, 0.06, 0.06], mass: 1,
                                at: [0, 0.25, 0], q, restitution: 0.1, friction: 0.6 })],
            surfaces: FLOOR, until: 4, fps: 24, step: 0.002,
        })[0].samples;
        const last = samples.at(-1);
        // Resting on a face, not balanced on a corner: the local +y axis is
        // still world +y.
        const upY = 1 - 2 * (last.q[0] ** 2 + last.q[2] ** 2);
        assert.ok(Math.abs(upY - 1) < 0.01, `${name}: up axis ${upY.toFixed(3)}`);
        // Half the box is 30 mm; penetration must stay inside the slop.
        assert.ok(Math.abs(last.at[1] - 0.03) < CONTACT.SLOP + 1e-4,
                  `${name}: settled at ${last.at[1]}`);
        assert.ok(samples.some((s) => s.sleeping), `${name}: never slept`);
        // And once asleep it does not move at all.
        const asleep = samples.slice(samples.findIndex((s) => s.sleeping));
        const ys = asleep.map((s) => s.at[1]);
        assert.equal(Math.max(...ys) - Math.min(...ys), 0, `${name}: moved after sleeping`);
    }
});

test('a body that never moves never wakes, and costs nothing', () => {
    const samples = simulateBodies({
        bodies: [makeBody({ id: 'box', shape: 'box', size: [0.1, 0.1, 0.1], mass: 1,
                            at: [0, 0.05, 0], restitution: 0, friction: 0.8 })],
        surfaces: FLOOR, until: 2, fps: 24, step: 0.004,
    })[0].samples;
    assert.ok(samples.at(-1).sleeping);
    assert.ok(Math.abs(samples.at(-1).at[1] - 0.05) < CONTACT.SLOP + 1e-4);
});

// ---------------------------------------------------------------------------
// 5. Determinism — the contract
// ---------------------------------------------------------------------------

test('two bakes of the same bodies are identical, to the last digit', () => {
    const run = () => simulateBodies({
        bodies: [makeBody({ id: 'a', shape: 'sphere', radius: 0.05, mass: 0.2,
                            at: [0, 0.6, 0], velocity: [0.7, 0, 0.3], spin: [2, 5, 1],
                            restitution: 0.5, friction: 0.4 }),
                 makeBody({ id: 'b', shape: 'sphere', radius: 0.05, mass: 0.2,
                            at: [0.4, 0.3, 0.1], velocity: [-0.5, 0, 0],
                            restitution: 0.5, friction: 0.4 })],
        surfaces: FLOOR, until: 2, fps: 24, step: 0.002,
    });
    assert.deepEqual(JSON.parse(JSON.stringify(run())), JSON.parse(JSON.stringify(run())));
});

// ---------------------------------------------------------------------------
// Collisions between bodies, which is the collision-maths series' own case
// ---------------------------------------------------------------------------

test('two spheres actually collide, and momentum goes the right way', () => {
    // In free space, head-on, equal masses, elastic: they swap velocities.
    const [a, b] = simulateBodies({
        bodies: [makeBody({ id: 'a', shape: 'sphere', radius: 0.1, mass: 1,
                            at: [-0.5, 0, 0], velocity: [1, 0, 0], restitution: 1, friction: 0 }),
                 makeBody({ id: 'b', shape: 'sphere', radius: 0.1, mass: 1,
                            at: [0.5, 0, 0], velocity: [-1, 0, 0], restitution: 1, friction: 0 })],
        surfaces: [], gravity: [0, 0, 0], until: 1, fps: 60, step: 0.001,
    });
    const ax = a.samples.map((s) => s.at[0]);
    const bx = b.samples.map((s) => s.at[0]);
    assert.ok(ax.at(-1) < ax[0], 'a came back');
    assert.ok(bx.at(-1) > bx[0], 'b came back');
    // They never interpenetrate by more than the slop.
    for (let i = 0; i < ax.length; i++) {
        assert.ok(bx[i] - ax[i] > 0.2 - CONTACT.SLOP - 1e-4,
                  `overlapped at sample ${i}: gap ${(bx[i] - ax[i]).toFixed(5)}`);
    }
});

test('a moving body wakes the one it hits', () => {
    // Or a case would bounce off a settled one as if off the air.
    const [, hit] = simulateBodies({
        bodies: [makeBody({ id: 'cue', shape: 'sphere', radius: 0.05, mass: 1,
                            at: [-0.6, 0.05, 0], velocity: [2, 0, 0],
                            restitution: 0.8, friction: 0.1 }),
                 makeBody({ id: 'target', shape: 'sphere', radius: 0.05, mass: 1,
                            at: [0.2, 0.05, 0], restitution: 0.8, friction: 0.1 })],
        surfaces: FLOOR, until: 1.5, fps: 60, step: 0.002,
    });
    const moved = Math.abs(hit.samples.at(-1).at[0] - hit.samples[0].at[0]);
    assert.ok(moved > 0.05, `the struck body moved ${moved.toFixed(4)} m`);
});

// ---------------------------------------------------------------------------
// The bake: what the compiler does with it
// ---------------------------------------------------------------------------

const film = (extra = {}) => ({
    meta: { title: 't', fps: 24 },
    materials: { grey: { color: '#888888' } },
    assemblies: { set: { parts: [
        { id: 'floor', geometry: { kind: 'cube', width: 4, height: 0.1, depth: 4 }, material: 'grey' },
        { id: 'ball', geometry: { kind: 'sphere', radius: 0.08 }, material: 'grey', at: [0, 1, 0] },
    ] } },
    cast: [{ assembly: 'set', as: 'set' }],
    physics: { until: 2, step: 0.002 },
    bodies: { ball: { of: 'set/ball', shape: 'sphere', radius: 0.08, mass: 0.2,
                      at: [0, 1, 0], restitution: 0.4, friction: 0.8 } },
    surfaces: [{ node: 'set/floor' }],
    scenes: [{ id: 's', shots: [{ id: 'one', duration: 3 }] }],
    ...extra,
});

const track = (c, path) => c.timeline.tracks.find((t) => t.target === 'set/ball' && t.path === path);
const messages = (c) => c.diagnostics.map((d) => d.message).join(' | ');

test('a bake is indistinguishable from hand-keyed animation', () => {
    const c = compileFilm3D(film());
    assert.equal(messages(c), '');
    const position = track(c, 'position');
    const quaternion = track(c, 'quaternion');
    assert.ok(position && quaternion, 'no tracks');
    // The same shape an imported Mixamo clip produces, which is the claim:
    // after the bake there is no physics in the engine.
    assert.equal(position.type, 'vec3');
    assert.equal(quaternion.type, 'quat');
    // It lands on the floor's top face plus its own radius, within the slop.
    assert.ok(Math.abs(position.keys.at(-1).v[1] - 0.13) < CONTACT.SLOP + 1e-3,
              `settled at ${position.keys.at(-1).v[1]}`);
});

test('keys that say nothing are dropped', () => {
    // 2 s at 24 fps is 49 samples per channel; a settled body repeats one
    // value and a falling one is a straight line in each axis.
    const c = compileFilm3D(film());
    assert.ok(track(c, 'position').keys.length < 49,
              `${track(c, 'position').keys.length} keys kept of 49`);
    assert.ok(track(c, 'position').keys.length > 4, 'but the arc survives');
});

test('every way of getting it wrong is a diagnostic', () => {
    const bad = (extra) => messages(compileFilm3D(film(extra)));
    assert.match(bad({ bodies: { x: { of: 'set/ghost' } } }), /is not a node/);
    assert.match(bad({ bodies: { x: { of: 'set/ball', shape: 'capsule' } } }),
                 /unknown body shape 'capsule'/);
    assert.match(bad({ surfaces: [{}] }), /needs a `node` or a `normal`/);
    assert.match(bad({ surfaces: [] }), /nothing will stop them falling/);
    // Tunnelling, caught before simulating rather than found as an object
    // that vanished.
    assert.match(bad({ physics: { until: 1, step: 0.05 },
                       bodies: { x: { of: 'set/ball', shape: 'sphere', radius: 0.005,
                                      velocity: [0, -40, 0] } } }),
                 /can pass through a surface without touching it/);
    assert.deepEqual(BODY_SHAPES, ['box', 'sphere']);
});

test('no bodies block is no tracks, and no diagnostics', () => {
    const plain = film();
    delete plain.bodies;
    delete plain.surfaces;
    delete plain.physics;
    const c = compileFilm3D(plain);
    assert.equal(messages(c), '');
    assert.equal(track(c, 'position'), undefined);
});
