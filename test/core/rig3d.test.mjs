/**
 * 3D IK and bone constraints.
 *
 * The 2D cutout rig has had a solver since Phase 8 and a test file to go with
 * it; the 3D character pipeline had neither, which is what §6 of the
 * character doc meant by "the pose that looks like pointing was found by
 * typing degrees."
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { solveTwoBone3D, chainLengths } from '../../src/core/rig/IK3D.js';
import {
    clampAngle, limitRotation, drivenValue, normalizeConstraints,
    humanoidCorrectives, CONSTRAINT_TYPES,
} from '../../src/core/rig/constraints.js';
import { HUMANOID_BONES } from '../../src/core/art/humanoid3d.js';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const DEG = Math.PI / 180;

// -------------------------------------------------------------------- IK

test('a reachable target is hit exactly', () => {
    for (const target of [[0.3, -0.4, 0], [0, -0.5, 0.1], [-0.2, 0.1, 0.3], [0.1, 0.05, -0.2]]) {
        const { tip, mid, reached } = solveTwoBone3D({
            root: [0, 0, 0], target, l0: 0.29, l1: 0.26, pole: [0, 0, -1],
        });
        assert.ok(reached, `${target} should be in range`);
        assert.ok(dist(tip, target) < 1e-6, `tip missed by ${dist(tip, target)}`);
        // And the bones are the length they claim to be: a solve that reaches
        // by stretching a bone is not a solve.
        assert.ok(Math.abs(dist(mid, [0, 0, 0]) - 0.29) < 1e-9);
        assert.ok(Math.abs(dist(tip, mid) - 0.26) < 1e-9);
    }
});

test('out of range extends rather than returning NaN', () => {
    const far = solveTwoBone3D({ root: [0, 0, 0], target: [0, -2, 0], l0: 0.29, l1: 0.26 });
    assert.equal(far.reached, false);
    for (const v of [...far.mid, ...far.tip]) assert.ok(Number.isFinite(v));
    // Fully extended: the tip is as far out as the chain goes, on the line to
    // the target.
    assert.ok(Math.abs(dist(far.tip, [0, 0, 0]) - 0.55) < 1e-3);

    const inside = solveTwoBone3D({ root: [0, 0, 0], target: [0, -0.001, 0], l0: 0.29, l1: 0.26 });
    assert.equal(inside.reached, false);
    for (const v of [...inside.mid, ...inside.tip]) assert.ok(Number.isFinite(v));
});

test('the pole picks which side the joint bends to', () => {
    const back = solveTwoBone3D({ root: [0, 0, 0], target: [0, -0.45, 0],
                                  l0: 0.29, l1: 0.26, pole: [0, 0, -1] });
    const front = solveTwoBone3D({ root: [0, 0, 0], target: [0, -0.45, 0],
                                   l0: 0.29, l1: 0.26, pole: [0, 0, 1] });
    assert.ok(back.mid[2] < -0.01, 'an elbow hint sends the joint backwards');
    assert.ok(front.mid[2] > 0.01, 'a knee hint sends it forwards');
    // Mirror images: both reach the same tip.
    assert.ok(dist(back.tip, front.tip) < 1e-9);
});

test('a pole parallel to the chain still gives a plane', () => {
    // The degeneracy that makes a naive solver return NaN: the hint says
    // nothing about the bend plane because it IS the chain.
    const r = solveTwoBone3D({ root: [0, 0, 0], target: [0, -0.4, 0],
                               l0: 0.29, l1: 0.26, pole: [0, -1, 0] });
    for (const v of [...r.mid, ...r.tip]) assert.ok(Number.isFinite(v));
    assert.ok(Math.abs(dist(r.mid, [0, 0, 0]) - 0.29) < 1e-9);
});

test('a target on the root does not divide by zero', () => {
    const r = solveTwoBone3D({ root: [1, 1, 1], target: [1, 1, 1], l0: 0.3, l1: 0.3 });
    for (const v of [...r.mid, ...r.tip]) assert.ok(Number.isFinite(v));
});

test('chain lengths come off the humanoid bone table', () => {
    const arm = chainLengths(HUMANOID_BONES, 'armL');
    assert.equal(arm.midId, 'foreL');
    assert.equal(arm.endId, 'handL');
    assert.ok(Math.abs(arm.l0 - 0.29) < 1e-9, 'upper arm is 290mm');
    assert.ok(Math.abs(arm.l1 - 0.26) < 1e-9, 'forearm is 260mm');
    // Limbs are modelled pointing down, so the bind direction is -y.
    assert.deepEqual(arm.dir0.map((v) => +v.toFixed(6)), [0, -1, 0]);

    const leg = chainLengths(HUMANOID_BONES, 'thighL');
    assert.equal(leg.endId, 'footL');
    assert.equal(chainLengths(HUMANOID_BONES, 'handL'), null,
                 'a chain needs two bones below its root');
});

// ------------------------------------------------------------ constraints

test('angles clamp with either bound optional', () => {
    assert.equal(clampAngle(2, null, 1), 1);
    assert.equal(clampAngle(-2, -1, null), -1);
    assert.equal(clampAngle(0.5, -1, 1), 0.5);
    assert.deepEqual(limitRotation([2, -2, 0.1], { x: [-1, 1], y: [-1, 1] }), [1, -1, 0.1]);
    assert.deepEqual(limitRotation([2, -2, 0.1], {}), [2, -2, 0.1], 'no limit is no change');
});

test('a driver remaps and clamps, and smoothstep does not pop', () => {
    assert.equal(drivenValue(0, [0, -2], [1, 1.1], 'linear'), 1);
    assert.equal(drivenValue(-2, [0, -2], [1, 1.1], 'linear'), 1.1);
    assert.equal(drivenValue(-4, [0, -2], [1, 1.1], 'linear'), 1.1, 'clamped past the end');
    assert.equal(drivenValue(1, [0, -2], [1, 1.1], 'linear'), 1, 'clamped before the start');
    // Smooth leaves the ends flat, which is the whole point: a corrective
    // that steps on at the threshold reads as a pop.
    const nearStart = drivenValue(-0.02, [0, -2], [0, 1], 'smooth');
    assert.ok(nearStart < 0.001, `smoothstep should be flat at the start, got ${nearStart}`);
    assert.equal(drivenValue(-1, [0, -2], [0, 1], 'smooth'), 0.5, 'and linear in the middle');
    // A zero-width range is a switch, not a division by zero.
    assert.ok(Number.isFinite(drivenValue(1, [1, 1], [0, 1])));
});

test('constraints normalise to radians and drop what cannot work', () => {
    const warnings = [];
    const warn = (m) => warnings.push(m);
    const out = normalizeConstraints([
        { type: 'lookAt', source: 'a', target: 'b', limit: { y: [-30, 30] } },
        { type: 'limitRotation', source: 'a', limit: { x: [null, 90] } },
        { type: 'limitRotation', source: 'a' },                      // no limit
        { type: 'copyRotation', source: 'a', from: 'b', axes: 'xz', invert: true },
        { type: 'ik', chain: 'a', target: 'b' },
        { type: 'lookAt', source: 'a', weight: 0 },                  // switched off
        { type: 'lookAt', target: 'b' },                             // no source
        { type: 'driven', input: { target: 'a', channel: 'rotation.x' },
          from: [0, -90], outputs: [{ target: 'b', channel: 'scale.x', to: [1, 1.1] }] },
        { type: 'driven', input: { target: 'a', channel: 'rotation.x' }, outputs: [] },
        { type: 'wiggle' },
    ], { warn });

    assert.deepEqual(out.map((c) => c.type),
                     ['lookAt', 'limitRotation', 'copyRotation', 'ik', 'driven']);
    assert.ok(Math.abs(out[0].limit.y[1] - 30 * DEG) < 1e-12, 'degrees in, radians out');
    assert.equal(out[1].limit.x[0], null, 'a one-sided limit stays one-sided');
    assert.deepEqual(out[2].axes, [true, false, true]);
    assert.equal(out[2].invert, true);
    assert.deepEqual(out[3].pole, [0, 0, -1], 'an elbow bends backwards by default');
    assert.ok(Math.abs(out[4].from[1] + 90 * DEG) < 1e-12, 'a rotation driver is in radians');
    assert.deepEqual(out[4].outputs[0].to, [1, 1.1], 'a scale driver is not');
    // Four warnings, not five: `weight: 0` is a constraint deliberately
    // switched off, so it is dropped silently.
    assert.equal(warnings.length, 4, warnings.join(' | '));
    assert.ok(warnings.some((m) => m.includes('wiggle') && m.includes(CONSTRAINT_TYPES[0])),
              'an unknown type lists the known ones');
});

test('a constraint naming a node the film does not have is dropped, not thrown', () => {
    const warnings = [];
    const out = normalizeConstraints(
        [{ type: 'lookAt', source: 'presenter/eyeL', target: 'nowhere' }],
        { warn: (m) => warnings.push(m), exists: (id) => id === 'presenter/eyeL' });
    assert.equal(out.length, 0);
    assert.ok(warnings[0].includes('nowhere'));
});

test('the default correctives drive girth from the joint that closes', () => {
    const out = humanoidCorrectives('p');
    assert.equal(out.length, 4, 'two elbows and two knees');
    const elbow = out.find((c) => c.input.target === 'p/foreL');
    assert.equal(elbow.input.channel, 'rotation.x');
    // The output is on the bone ABOVE the joint, and only in x and z --
    // girth, never length, because the bone's own offset runs down y and
    // scaling that would change the arm's reach and break the IK lengths.
    assert.deepEqual(elbow.outputs.map((o) => o.channel), ['scale.x', 'scale.z']);
    assert.equal(elbow.outputs[0].target, 'p/armL');
    assert.ok(elbow.outputs[0].to[1] > 1, 'a closing elbow widens the upper arm');
    assert.ok(out.every((c) => c.outputs.every((o) => !o.channel.endsWith('.y'))));
});
