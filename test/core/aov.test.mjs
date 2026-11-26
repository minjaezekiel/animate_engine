import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    AOV_KINDS, isAOV, DEPTH_BITS, unpackDepth, packDepth, depthToDistance,
    distanceToDepth, depthQuantum, decodeNormal, objectColor, objectManifest,
    pixelAt, matteCoverage, depthRange,
} from '../../src/core/render/aov.js';

const CAM = { near: 0.01, far: 200 };
const ORTHO = { near: 0.01, far: 200, ortho: true };

test('the pass list is closed, so a typo is a diagnostic', () => {
    assert.deepEqual(AOV_KINDS, ['depth', 'normal', 'object']);
    assert.ok(isAOV('depth'));
    assert.ok(!isAOV('dpeth'));
});

test('a distance survives the round trip to packed bytes and back', () => {
    for (const d of [0.05, 0.5, 2, 11, 50, 150]) {
        const bytes = packDepth(distanceToDepth(d, CAM));
        const back = depthToDistance(unpackDepth(bytes), CAM);
        assert.ok(Math.abs(back - d) < depthQuantum(d, CAM),
                  `${d} m came back as ${back} m`);
    }
});

/**
 * The failure the e2e probe caught on its first run: summing the bytes the
 * other way round reads an object 11 m away as 0.010027 m -- the near plane.
 * It is a smooth, plausible depth map of nothing, so it is worth a test that
 * says which end is which rather than a comment.
 */
test('red is the most significant byte', () => {
    assert.ok(unpackDepth([255, 0, 0, 0]) > unpackDepth([0, 255, 255, 255]));
    assert.equal(unpackDepth([0, 0, 0, 0]), 0);
    assert.ok(unpackDepth([255, 255, 255, 255]) > 1 - 1e-9);
});

test('an empty pixel -- white -- is the far plane, not the lens', () => {
    assert.ok(depthToDistance(unpackDepth([255, 255, 255, 255]), CAM) > 199.99);
    assert.ok(depthToDistance(unpackDepth([0, 0, 0, 0]), CAM) < 0.0101);
});

test('depth precision is spent near the camera, and the quantum says so', () => {
    const near = depthQuantum(1, CAM);
    const far = depthQuantum(100, CAM);
    assert.ok(far > near * 9000, `${far} vs ${near}`);
    // 11 m through a 0.01/200 frustum: sub-millimetre, which is what makes
    // the e2e probe's "within one quantisation step" a real claim.
    assert.ok(depthQuantum(11, CAM) < 1e-3);
    assert.equal(DEPTH_BITS, 24);
});

test('an orthographic depth buffer is linear, and is read differently', () => {
    assert.equal(depthToDistance(0.5, ORTHO), 0.01 + 0.5 * 199.99);
    // The same bytes, two projections, two answers -- which is why `ortho`
    // is a parameter and not an assumption.
    assert.ok(Math.abs(depthToDistance(0.5, ORTHO) - depthToDistance(0.5, CAM)) > 99);
    assert.equal(depthQuantum(1, ORTHO), depthQuantum(150, ORTHO));
});

test('a normal decodes to a unit vector', () => {
    const n = decodeNormal([128, 128, 255]);
    assert.ok(n[2] > 0.999);
    assert.ok(Math.abs(Math.hypot(...n) - 1) < 1e-9);
    const back = decodeNormal([0, 128, 128]);
    assert.ok(back[0] < -0.99);
});

test('a matte colour is deterministic and never black', () => {
    assert.equal(objectColor('ak/receiver'), objectColor('ak/receiver'));
    assert.notEqual(objectColor('ak/receiver'), objectColor('ak/barrel'));
    for (const id of ['a', 'set/floor', '', 'x'.repeat(200)]) {
        const c = objectColor(id);
        assert.ok(c >= 1 && c <= 0xffffff, `${id} -> ${c}`);
    }
});

test('the manifest reports collisions rather than hoping about them', () => {
    const ids = Array.from({ length: 2000 }, (_, i) => `set/part${i}`);
    const m = objectManifest(ids);
    assert.equal(m.collisions.length, 0);
    assert.equal(Object.keys(m.colors).length, 2000);
    for (const [hex, id] of Object.entries(m.colors)) {
        assert.equal(hex, `#${objectColor(id).toString(16).padStart(6, '0')}`);
    }
});

test('a collision is named on both sides', () => {
    const m = objectManifest(['a', 'a']);
    assert.deepEqual(m.collisions, [['a', 'a']]);
});

test('matte coverage counts exact bytes only', () => {
    // 4x1: two pixels of `box`, one blended edge, one background.
    const c = objectColor('box');
    const px = new Uint8Array([
        (c >> 16) & 255, (c >> 8) & 255, c & 255, 255,
        (c >> 16) & 255, (c >> 8) & 255, c & 255, 255,
        ((c >> 16) & 255) - 1, (c >> 8) & 255, c & 255, 255,
        0, 0, 0, 255,
    ]);
    assert.equal(matteCoverage(px, 'box', 4), 0.5);
    assert.deepEqual(pixelAt(px, 3, 0, 4), [0, 0, 0, 255]);
});

test('depthRange reports what is in the pass and ignores the background', () => {
    const at = (d) => packDepth(distanceToDepth(d, CAM));
    const px = new Uint8Array([...at(2), ...at(7), ...[255, 255, 255, 255]]);
    const r = depthRange(px, CAM);
    assert.ok(Math.abs(r.near - 2) < depthQuantum(2, CAM));
    assert.ok(Math.abs(r.far - 7) < depthQuantum(7, CAM));
    assert.ok(Math.abs(r.covered - 2 / 3) < 1e-9);
    assert.deepEqual(depthRange(new Uint8Array([255, 255, 255, 255]), CAM),
                     { near: 0, far: 0, covered: 0 });
});
