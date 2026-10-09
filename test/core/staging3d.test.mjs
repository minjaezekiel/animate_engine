import test from 'node:test';
import assert from 'node:assert/strict';
import { compileFilm3D } from '../../src/core/script/compile3d.js';
import {
    extentOf, castBounds, projectBounds, checkFraming3D, checkExposure, lumaStats,
} from '../../src/core/script/staging3d.js';

/** A one-metre cube at the origin, and a camera that can be moved per shot. */
const film = (shots, parts = [{ id: 'box', geometry: { kind: 'cube', width: 1, height: 1, depth: 1 } }]) => ({
    meta: { width: 1280, height: 720 },
    assemblies: { a: { parts } },
    cast: [{ assembly: 'a', as: 'subject' }],
    scenes: [{ id: 'm', shots }],
});
const shot = (camera, extra = {}) => ({ id: 's', duration: 2, camera, ...extra });

test('extents cover every geometry kind, including swept ones', () => {
    assert.deepEqual(extentOf({ kind: 'cube', width: 2, height: 4, depth: 6 }), [1, 2, 3]);
    assert.deepEqual(extentOf({ kind: 'sphere', radius: 3 }), [3, 3, 3]);
    // A path extrusion is as big as its path plus its section.
    const e = extentOf({ kind: 'extrude', shape: [[-1, -2], [1, 2]], path: [[0, 0, 0], [4, 0, 0]] });
    assert.equal(e[0], 3);                     // 2 of path span + 1 of section
});

test('bounds are the union of the parts, not the root', () => {
    const { scene } = compileFilm3D(film([shot(null)], [
        { id: 'a', geometry: { kind: 'cube', width: 1, height: 1, depth: 1 }, at: [-2, 0, 0] },
        { id: 'b', geometry: { kind: 'cube', width: 1, height: 1, depth: 1 }, at: [2, 0, 0] },
    ]));
    assert.deepEqual(castBounds(scene, 'subject'), { lo: [-2.5, -0.5, -0.5], hi: [2.5, 0.5, 0.5] });
});

test('projection measures frame coverage, and knows what is behind', () => {
    const b = { lo: [-0.5, -0.5, -0.5], hi: [0.5, 0.5, 0.5] };
    const far = projectBounds(b, { eye: [0, 0, 10], look: [0, 0, 0], fov: 40, aspect: 16 / 9 });
    const near = projectBounds(b, { eye: [0, 0, 1.2], look: [0, 0, 0], fov: 40, aspect: 16 / 9 });
    assert.ok(near.height > far.height, 'closer is bigger');
    assert.equal(far.behind, 0);
    // Camera past the subject, looking away.
    const past = projectBounds(b, { eye: [0, 0, -5], look: [0, 0, -9], fov: 40, aspect: 16 / 9 });
    assert.equal(past.behind, 8);
});

test('an undeclared shot may legitimately not contain a subject', () => {
    // Cutting away to something else is a cut, not a staging error.
    const d = checkFraming3D(
        ...withFilm(film([shot({ from: { at: [0, 0, -5], look: [0, 0, -9] } })])));
    assert.deepEqual(d, []);
});

test('but a shot declared `on` a subject must show it', () => {
    const d = checkFraming3D(
        ...withFilm(film([shot({ from: { at: [0, 0, -5], look: [0, 0, -9] } }, { on: 'subject' })])));
    assert.equal(d.length, 1);
    assert.match(d[0].message, /declared the subject but is entirely behind the camera/);
});

test('overflow is only flagged when it holds for the whole shot', () => {
    const tight = { from: { at: [0, 0, 0.3], look: [0, 0, 0], fov: 40 },
                    to: { at: [0, 0, 0.3], look: [0, 0, 0], fov: 40 } };
    assert.equal(checkFraming3D(...withFilm(film([shot(tight)]))).length, 1);

    // A push-in starts wide and ends tight. That is a push-in, not a fault.
    const pushIn = { from: { at: [0, 0, 6], look: [0, 0, 0], fov: 40 },
                     to: { at: [0, 0, 0.3], look: [0, 0, 0], fov: 40 } };
    assert.deepEqual(checkFraming3D(...withFilm(film([shot(pushIn)]))), []);
});

test('a declared band is satisfied if the move ever reaches it', () => {
    const pushIn = { from: { at: [0, 0, 9], look: [0, 0, 0], fov: 40 },
                     to: { at: [0, 0, 1.4], look: [0, 0, 0], fov: 40 } };
    assert.deepEqual(
        checkFraming3D(...withFilm(film([shot(pushIn, { framing: 'medium' })]))), []);
    // A shot that stays far away never reaches `close`, and the warning
    // carries the range it actually swept.
    const far = { from: { at: [0, 0, 9], look: [0, 0, 0], fov: 40 },
                  to: { at: [0, 0, 7], look: [0, 0, 0], fov: 40 } };
    const d = checkFraming3D(...withFilm(film([shot(far, { framing: 'close' })])));
    assert.equal(d.length, 1);
    assert.match(d[0].message, /never enters the 80-240% band/);
});

test('`on` may name a part, so a macro is measured against the part', () => {
    const parts = [
        { id: 'body', geometry: { kind: 'cube', width: 4, height: 1, depth: 1 } },
        { id: 'knob', geometry: { kind: 'cube', width: 0.1, height: 0.1, depth: 0.1 }, at: [2, 0, 0] },
    ];
    const cam = { from: { at: [2, 0, 0.4], look: [2, 0, 0], fov: 40 },
                  to: { at: [2, 0, 0.4], look: [2, 0, 0], fov: 40 } };
    // Against the whole body this reads as an overflowing frame...
    assert.equal(checkFraming3D(...withFilm(film([shot(cam)], parts))).length, 1);
    // ...but it is a correctly framed detail of the knob.
    assert.deepEqual(
        checkFraming3D(...withFilm(film([shot(cam, { on: 'subject/knob' })], parts))), []);
});

test('unknown framing names are reported, not ignored', () => {
    const d = checkFraming3D(...withFilm(film([shot(
        { from: { at: [0, 0, 4], look: [0, 0, 0] } }, { framing: 'extreme' })])));
    assert.match(d[0].message, /unknown framing "extreme"/);
});

// ------------------------------------------------------------------ exposure

test('luma statistics read a raw RGBA buffer', () => {
    const black = new Uint8ClampedArray(4 * 100).fill(0);
    for (let i = 3; i < black.length; i += 4) black[i] = 255;
    const s = lumaStats(black);
    assert.equal(s.mean, 0);
    assert.equal(s.clippedLow, 1);

    const white = new Uint8ClampedArray(4 * 100).fill(255);
    assert.ok(lumaStats(white).mean > 0.99);
    assert.equal(lumaStats(white).clippedHigh, 1);
});

test('exposure catches a black frame and a blown one', () => {
    const d = checkExposure([
        { t: 1, shotId: 'a', mean: 0.01, clippedLow: 0.95, clippedHigh: 0 },
        { t: 2, shotId: 'b', mean: 0.9, clippedLow: 0, clippedHigh: 0.4 },
        { t: 3, shotId: 'c', mean: 0.3, clippedLow: 0.2, clippedHigh: 0.01 },
    ]);
    assert.ok(d.some((x) => x.location === 'a' && /effectively black/.test(x.message)));
    assert.ok(d.some((x) => x.location === 'a' && /crushes 95%/.test(x.message)));
    assert.ok(d.some((x) => x.location === 'b' && /washed out/.test(x.message)));
    assert.ok(d.some((x) => x.location === 'b' && /blows 40%/.test(x.message)));
    assert.equal(d.filter((x) => x.location === 'c').length, 0, 'a normal frame is quiet');
});

/** compileFilm3D + the film, which is what both checkers take. */
function withFilm(f) { return [compileFilm3D(f), f]; }
