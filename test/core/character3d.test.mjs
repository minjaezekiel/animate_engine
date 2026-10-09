import test from 'node:test';
import assert from 'node:assert/strict';
import {
    HUMANOID_BONES, HUMANOID_SEGMENTS, bindPose, boneSegments, skinWeights,
    segmentSkin, humanoidSpec, distanceToSegment,
} from '../../src/core/art/humanoid3d.js';
import { buildTube, buildHead, sampleProfile, frameFor } from '../../src/core/art/mesh3d.js';
import { faceMorphs, VISEME_SHAPES, EXPRESSIONS, blinkCurve, blinkTimes, saccadeTimes } from '../../src/core/art/face3d.js';

const triangleNormalsPointOutward = (g, axis = [0, 0]) => {
    const P = g.positions, I = g.indices;
    const v = (k) => [P[k * 3], P[k * 3 + 1], P[k * 3 + 2]];
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    let bad = 0;
    for (let t = 0; t < I.length; t += 3) {
        const a = v(I[t]), b = v(I[t + 1]), c = v(I[t + 2]);
        const n = cross(sub(b, a), sub(c, a));
        const out = [a[0] - axis[0], 0, a[2] - axis[1]];
        if (n[0] * out[0] + n[2] * out[2] <= 0) bad++;
    }
    return bad;
};

test('a swept tube faces outward', () => {
    // Inverted winding is backface-culled: the body looked solid only because
    // what was visible was the inside of its far wall, and the clothing over
    // it disappeared completely.
    const g = buildTube([0, 0, 0], [0, 1, 0], { r0: 0.2, r1: 0.1, radial: 12, rings: 4,
                                                capStart: false, capEnd: false });
    assert.equal(triangleNormalsPointOutward(g), 0);
});

test('a generated head faces outward and is taller than it is wide', () => {
    const g = buildHead([0, 0, 0], 1, { radial: 16 });
    assert.equal(triangleNormalsPointOutward(g), 0);
    let minY = 1e9, maxY = -1e9, maxX = 0, maxZ = 0;
    for (let i = 0; i < g.positions.length; i += 3) {
        minY = Math.min(minY, g.positions[i + 1]); maxY = Math.max(maxY, g.positions[i + 1]);
        maxX = Math.max(maxX, Math.abs(g.positions[i]));
        maxZ = Math.max(maxZ, Math.abs(g.positions[i + 2]));
    }
    const h = maxY - minY, w = maxX * 2, d = maxZ * 2;
    assert.ok(h > w, 'a head is taller than it is wide');
    assert.ok(d > w, 'and deeper than it is wide');
    assert.ok(h > 0.19 && h < 0.26, `chin to crown should be about 230mm, got ${h.toFixed(3)}`);
});

test('a profile bulges where it is told to', () => {
    const calf = [[0, 0.94], [0.3, 1.08], [0.85, 0.62], [1, 0.58]];
    assert.equal(sampleProfile(calf, 0.3), 1.08);
    assert.ok(sampleProfile(calf, 0.15) > sampleProfile(calf, 0));
    assert.ok(sampleProfile(calf, 0.9) < sampleProfile(calf, 0.5));
    assert.equal(sampleProfile(null, 0.5), 1, 'no profile is a straight taper');
});

test('the frame never degenerates, including straight down', () => {
    for (const dir of [[0, -1, 0], [0, 1, 0], [1, 0, 0], [0.3, -0.9, 0.2]]) {
        const { f, r, u } = frameFor(dir);
        for (const v of [f, r, u]) assert.ok(Math.abs(Math.hypot(...v) - 1) < 1e-6);
        assert.ok(Math.abs(f[0] * r[0] + f[1] * r[1] + f[2] * r[2]) < 1e-6, 'orthogonal');
    }
});

test('the bind pose stands a 1.8m figure on the floor', () => {
    const pose = bindPose();
    assert.ok(Math.abs(pose.get('headTop')[1] - 1.665) < 0.02, 'crown near 1.67m');
    assert.ok(pose.get('footL')[1] < 0.1, 'feet near the ground');
    assert.equal(pose.get('handL')[0], -pose.get('handR')[0], 'mirrored');
});

test('per-segment skinning binds a limb only to its own two bones', () => {
    // The bug this replaced: searching every bone by distance bound a vertex
    // on the hip 99.8% to the FOREARM and one on the outer thigh 91% to the
    // FINGERS, because a hand genuinely hangs beside a thigh.
    const spec = humanoidSpec({});
    const segs = boneSegments(spec.bones);
    const names = spec.bones.map((b) => b.id);
    const pose = bindPose(spec.bones);
    const hip = new Float32Array([0.20, 0.97, 0]);
    const byDistance = skinWeights(hip, segs);
    assert.equal(names[byDistance.skinIndex[0]], 'foreL',
        'distance really does pick the forearm -- which is why it is the wrong tool');

    const a = pose.get('thighL'), b = pose.get('shinL');
    const own = segmentSkin(hip, a, b, names.indexOf('thighL'), names.indexOf('shinL'));
    assert.deepEqual([own.skinIndex[0], own.skinIndex[1]],
                     [names.indexOf('thighL'), names.indexOf('shinL')]);
    assert.ok(Math.abs(own.skinWeight[0] + own.skinWeight[1] - 1) < 1e-6, 'weights sum to 1');
});

test('a point on a segment weights to the bone it is nearest along', () => {
    const near = segmentSkin(new Float32Array([0, 0.9, 0]), [0, 1, 0], [0, 0, 0], 3, 7);
    assert.ok(near.skinWeight[0] > near.skinWeight[1], 'close to the start bone');
    const far = segmentSkin(new Float32Array([0, 0.1, 0]), [0, 1, 0], [0, 0, 0], 3, 7);
    assert.ok(far.skinWeight[1] > far.skinWeight[0], 'close to the end bone');
});

test('distanceToSegment clamps to the segment, not the infinite line', () => {
    const past = distanceToSegment([0, 5, 0], [0, 0, 0], [0, 1, 0]);
    assert.equal(past.t, 1);
    assert.ok(Math.abs(past.d2 - 16) < 1e-9);
});

// ----------------------------------------------------------------- the face

test('the generated face carries ARKit-named blendshapes', () => {
    const head = buildHead([0, 0, 0], 1);
    const shapes = faceMorphs(head.positions);
    for (const required of ['jawOpen', 'mouthSmileLeft', 'mouthSmileRight', 'browInnerUp',
                            'browDownLeft', 'eyeSquintRight', 'mouthPucker', 'cheekSquintLeft']) {
        assert.ok(shapes[required], `missing ${required}`);
        assert.equal(shapes[required].length, head.positions.length);
    }
});

test('a blendshape moves its own region and leaves the rest alone', () => {
    const head = buildHead([0, 0, 0], 1);
    const shapes = faceMorphs(head.positions);
    const moved = (name, pick) => {
        let n = 0;
        for (let i = 0; i < head.positions.length; i += 3) {
            const p = [head.positions[i], head.positions[i + 1], head.positions[i + 2]];
            const d = Math.hypot(shapes[name][i], shapes[name][i + 1], shapes[name][i + 2]);
            if (d > 1e-5 && pick(p)) n++;
        }
        return n;
    };
    // The brow raiser must not move the chin, or an eyebrow drags the jaw.
    assert.equal(moved('browInnerUp', (p) => p[1] < -0.04), 0);
    assert.ok(moved('browInnerUp', (p) => p[1] > 0.05) > 0);
    // The jaw must not move the forehead.
    assert.equal(moved('jawOpen', (p) => p[1] > 0.06), 0);
    assert.ok(moved('jawOpen', (p) => p[1] < -0.03) > 0);
});

test('a smile is asymmetric, because a symmetrical one reads as a mask', () => {
    assert.notEqual(EXPRESSIONS.warm.mouthSmileLeft, EXPRESSIONS.warm.mouthSmileRight);
    assert.ok(EXPRESSIONS.warm.cheekSquintLeft > 0, 'a real smile reaches the eyes');
});

test('every viseme opens the jaw by a different amount', () => {
    const jaws = Object.values(VISEME_SHAPES).map((v) => v.jawOpen ?? 0);
    assert.equal(new Set(jaws).size, jaws.length,
        'an identical jaw drop on every sound is the clearest tell of machine lipsync');
    for (const [name, shape] of Object.entries(VISEME_SHAPES)) {
        for (const w of Object.values(shape)) {
            assert.ok(w >= 0 && w <= 1, `${name} has a weight outside 0..1`);
        }
    }
});

test('a blink closes faster than it opens', () => {
    const c = blinkCurve(1);
    const closeTime = c[1][0] - c[0][0];
    const openTime = c[3][0] - c[2][0];
    assert.ok(openTime > closeTime * 1.5,
        'measured blinks close in ~80ms and open over ~150ms; equal times read as a shutter');
    assert.deepEqual(c.map((k) => k[1]), [0, 1, 1, 0]);
});

test('blinks and saccades are jittered, never periodic', () => {
    const times = blinkTimes(0, 30, { seed: 5 });
    assert.ok(times.length >= 5);
    const gaps = times.slice(1).map((t, i) => +(t - times[i]).toFixed(3));
    assert.ok(new Set(gaps).size > 1, 'a blink on a strict interval reads as a tic');
    assert.ok(Math.min(...gaps) > 1.0, 'and never a double-blink flutter');

    const darts = saccadeTimes(0, 20, { seed: 2 });
    assert.ok(darts.every((d) => Math.abs(d.y) <= 7.001 && Math.abs(d.x) <= 3.001),
        'saccade amplitudes stay inside the measured 7deg / 3deg thresholds');
});

test('every segment names bones that exist', () => {
    const ids = new Set(HUMANOID_BONES.map((b) => b.id));
    for (const s of HUMANOID_SEGMENTS) {
        assert.ok(ids.has(s.from), `unknown bone ${s.from}`);
        assert.ok(ids.has(s.to), `unknown bone ${s.to}`);
    }
    // Nothing circular, and every bone but the root has a parent that exists.
    for (const b of HUMANOID_BONES) {
        if (b.parent) assert.ok(ids.has(b.parent), `unknown parent ${b.parent}`);
    }
});
