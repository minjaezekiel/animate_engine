import test from 'node:test';
import assert from 'node:assert/strict';

import {
    solveTwoBone, solveChain, forwardKinematics,
    chainFromParts, chainRootOffset, wrapAngle,
} from '../../src/core/rig/IK2D.js';
import { generateCharacterParts } from '../../src/core/script/generate.js';
import { compileFilm } from '../../src/core/script/compile.js';

const DOWN = Math.PI / 2;
const arm = () => [{ length: 40, rest: DOWN }, { length: 35, rest: DOWN }];
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} !~= ${b}`);

// ------------------------------------------------------------------ geometry

test('wrapAngle lands in (-PI, PI]', () => {
    near(wrapAngle(0), 0);
    near(wrapAngle(Math.PI * 3), Math.PI);
    near(wrapAngle(-Math.PI * 3), Math.PI);
    near(wrapAngle(Math.PI * 1.5), -Math.PI * 0.5);
});

test('forwardKinematics accumulates parent rotation down the chain', () => {
    const joints = forwardKinematics(arm(), [0, 0]);
    assert.deepEqual(joints[0], [0, 0]);
    near(joints[1][0], 0, 1e-9);
    near(joints[1][1], 40, 1e-9);
    near(joints[2][1], 75, 1e-9);

    // Rotating only the root must carry the second bone with it: that is the
    // property the whole cutout rig depends on.
    const bent = forwardKinematics(arm(), [-DOWN, 0]);
    near(bent[1][0], 40, 1e-9);
    near(bent[2][0], 75, 1e-9);
    near(bent[2][1], 0, 1e-9);
});

// ------------------------------------------------------------- two-bone IK

test('reachable targets are hit exactly', () => {
    for (const target of [[20, 60], [-30, -40], [50, 20], [0, 40], [-10, 70]]) {
        const r = solveTwoBone({ bones: arm(), target });
        assert.equal(r.clamped, false, `${target} should be reachable`);
        assert.ok(r.error < 1e-9, `${target} error ${r.error}`);
    }
});

test('both bend directions reach, and they differ', () => {
    const a = solveTwoBone({ bones: arm(), target: [20, 60], bend: 1 });
    const b = solveTwoBone({ bones: arm(), target: [20, 60], bend: -1 });
    assert.ok(a.error < 1e-9 && b.error < 1e-9);
    assert.ok(Math.abs(a.rots[0] - b.rots[0]) > 0.1, 'mirror solutions collapsed');
});

test('full extension is singular but solved, not NaN', () => {
    const r = solveTwoBone({ bones: arm(), target: [0, 75] });
    near(r.rots[0], 0, 1e-6);
    near(r.rots[1], 0, 1e-6);
    assert.ok(r.error < 1e-6);
});

test('out of reach extends toward the target and reports the shortfall', () => {
    const r = solveTwoBone({ bones: arm(), target: [200, 0] });
    assert.equal(r.clamped, true);
    near(r.error, 125, 1e-6);           // 200 - (40 + 35)
    near(r.rots[1], 0, 1e-6);           // elbow straight
    near(r.tip[0], 75, 1e-6);           // pointing at the target
    near(r.tip[1], 0, 1e-6);
});

test('inside the inner dead zone folds fully instead of returning NaN', () => {
    const r = solveTwoBone({ bones: arm(), target: [0, 1] });
    assert.equal(r.clamped, true);
    for (const v of [...r.rots, ...r.tip, r.error]) assert.ok(Number.isFinite(v));
    near(Math.abs(r.rots[1]), Math.PI, 1e-6);
});

test('a target on the root is degenerate but finite', () => {
    const r = solveTwoBone({ bones: arm(), target: [0, 0] });
    for (const v of [...r.rots, ...r.tip, r.error]) assert.ok(Number.isFinite(v));
});

test('non-vertical rest directions are honoured', () => {
    // The generated rig's limbs lean a few degrees off straight down, so a
    // solver that assumes PI/2 would be subtly wrong on every reach.
    const bones = [{ length: 30, rest: 1.4 }, { length: 25, rest: 1.7 }];
    const r = solveTwoBone({ bones, target: [12, 40] });
    assert.ok(r.error < 1e-9, `error ${r.error}`);
});

// ------------------------------------------------------------------ CCD

test('solveChain matches the closed form for two unconstrained bones', () => {
    const a = solveChain({ bones: arm(), target: [20, 60] });
    const b = solveTwoBone({ bones: arm(), target: [20, 60] });
    assert.deepEqual(a.rots, b.rots);
});

test('CCD converges on a four-bone chain', () => {
    const bones = [40, 35, 20, 15].map((length) => ({ length, rest: DOWN }));
    const r = solveChain({ bones, target: [70, 40] });
    assert.ok(r.error < 0.25, `error ${r.error}`);
    assert.equal(r.clamped, false);
});

test('rotation limits are respected and reported as unreachable', () => {
    // An elbow that cannot bend past 0 cannot fold to a near target.
    const bones = [{ length: 40, rest: DOWN }, { length: 35, rest: DOWN, min: 0, max: 0 }];
    const r = solveChain({ bones, target: [10, 20] });
    near(r.rots[1], 0, 1e-9);
    assert.equal(r.clamped, true);
    assert.ok(r.error > 1, 'a pinned elbow should not reach a folded target');
});

test('a one-bone chain just points', () => {
    const r = solveChain({ bones: [{ length: 10, rest: DOWN }], target: [10, 0] });
    near(r.rots[0], -DOWN, 1e-9);
});

test('solveChain terminates on an unreachable target', () => {
    const bones = [40, 35, 20].map((length) => ({ length, rest: DOWN }));
    const r = solveChain({ bones, target: [5000, 5000] });
    assert.equal(r.clamped, true);
    assert.ok(Number.isFinite(r.error));
});

// -------------------------------------------------------- rig extraction

test('chainFromParts reads bone lengths off the joint pivots', () => {
    const parts = generateCharacterParts({}, { height: 180 });
    const chain = chainFromParts(parts, 'handL', 2);
    assert.deepEqual(chain.bones.map((b) => b.id), ['armL', 'foreL']);
    assert.equal(chain.rootId, 'armL');
    assert.equal(chain.tipId, 'handL');
    // A bone's length is the distance to its child's pivot, which for the
    // generated rig is the upper-arm and forearm length.
    for (const bone of chain.bones) assert.ok(bone.length > 10 && bone.length < 60);
    for (const bone of chain.bones) assert.ok(Math.abs(bone.rest - DOWN) < 0.3);
});

test('chainFromParts handles legs and longer chains, and refuses impossible ones', () => {
    const parts = generateCharacterParts({}, {});
    assert.deepEqual(chainFromParts(parts, 'footR', 2).bones.map((b) => b.id), ['thighR', 'shinR']);
    assert.deepEqual(chainFromParts(parts, 'footR', 3).bones.map((b) => b.id),
                     ['hips', 'thighR', 'shinR']);
    assert.equal(chainFromParts(parts, 'hips', 2), null);        // nothing above the root
    assert.equal(chainFromParts(parts, 'nope', 2), null);        // unknown part
    // head pivots at its parent's origin, so there is no bone there
    assert.equal(chainFromParts(parts, 'head', 1), null);
});

test('chainRootOffset accumulates pivots up to the character origin', () => {
    const parts = generateCharacterParts({}, { height: 180 });
    const [x, y] = chainRootOffset(parts, 'armL');
    assert.ok(x < 0, 'the left shoulder sits left of the hips');
    assert.ok(y < 0, 'the shoulder sits above the hips');
    assert.deepEqual(chainRootOffset(parts, 'hips'), [0, 0]);
});

// --------------------------------------------------- the `reach` verb

const reachFilm = (actions) => ({
    version: 'jirex.film/1',
    meta: { title: 'ik', fps: 24, width: 1280, height: 720 },
    palettes: { p: { coat: '#c33', skin: '#eca' } },
    characters: { mara: { generate: {}, palette: 'p' } },
    scenes: [{
        id: 's1',
        cast: [{ character: 'mara', as: 'mara', at: [640, 600] }],
        shots: [{ id: 'a', duration: 3, actions }],
    }],
});

const rotTrack = (timeline, id) =>
    timeline.tracks.find((t) => t.target === id && t.path === 'transform.rot');

test('reach keys the solved rotations on the chain', () => {
    const { timeline, diagnostics } = compileFilm(
        reachFilm([{ target: 'mara', do: 'reach', part: 'handL', to: [-40, -70], at: 0.5 }]), {});
    assert.ok(!diagnostics.some((d) => d.severity === 'error'));
    const upper = rotTrack(timeline, 's1/mara/armL');
    const fore = rotTrack(timeline, 's1/mara/foreL');
    assert.ok(upper && fore, 'both bones keyed');
    assert.equal(upper.keys.length, 1);
    assert.equal(upper.keys[0].t, 0.5);
    assert.ok(Number.isFinite(upper.keys[0].v) && upper.keys[0].v !== 0);
});

test('reach with `for` ramps from the previous value', () => {
    const { timeline } = compileFilm(reachFilm([
        { target: 'mara', do: 'reach', part: 'handL', to: [-40, -70], at: 0, for: 0.5 },
        { target: 'mara', do: 'reach', part: 'handL', to: [40, -20], at: 1, for: 0.5 },
    ]), {});
    const keys = rotTrack(timeline, 's1/mara/armL').keys;
    assert.deepEqual(keys.map((k) => k.t), [0, 0.5, 1, 1.5]);
    // the second ramp starts where the first ended, so the arm never snaps
    assert.equal(keys[2].v, keys[1].v);
});

test('reach actually puts the hand on the target', () => {
    const parts = generateCharacterParts({}, {});
    const target = [-40, -70];
    const { timeline } = compileFilm(
        reachFilm([{ target: 'mara', do: 'reach', part: 'handL', to: target, at: 0 }]), {});
    const chain = chainFromParts(parts, 'handL', 2);
    const offset = chainRootOffset(parts, chain.rootId);
    const rots = chain.bones.map((b) => rotTrack(timeline, `s1/mara/${b.id}`).keys[0].v);
    const tip = forwardKinematics(chain.bones, rots)[2];
    near(offset[0] + tip[0], target[0], 1e-6);
    near(offset[1] + tip[1], target[1], 1e-6);
});

test('an unreachable reach is a diagnostic, never a throw or a NaN key', () => {
    const { timeline, diagnostics } = compileFilm(
        reachFilm([{ target: 'mara', do: 'reach', part: 'handR', to: [9000, 9000], at: 0 }]), {});
    assert.ok(diagnostics.some((d) => /out of range/.test(d.message)));
    assert.ok(!diagnostics.some((d) => d.severity === 'error'));
    for (const id of ['armR', 'foreR']) {
        for (const k of rotTrack(timeline, `s1/mara/${id}`).keys) assert.ok(Number.isFinite(k.v));
    }
});

test('reach on a part with no chain warns and keys nothing', () => {
    const { timeline, diagnostics } = compileFilm(
        reachFilm([{ target: 'mara', do: 'reach', part: 'hips', to: [0, 0], at: 0 }]), {});
    assert.ok(diagnostics.some((d) => /no 2-bone chain/.test(d.message)));
    assert.equal(rotTrack(timeline, 's1/mara/hips'), undefined);
});

test('malformed reach is ignored rather than fatal', () => {
    for (const action of [{ target: 'mara', do: 'reach', at: 0 },
                          { target: 'mara', do: 'reach', part: 'handL', at: 0 },
                          { target: 'mara', do: 'reach', part: 'handL', to: 'nope', at: 0 }]) {
        const r = compileFilm(reachFilm([action]), {});
        assert.ok(r.timeline, 'compile survived');
        assert.ok(!r.diagnostics.some((d) => d.severity === 'fatal'));
    }
});
