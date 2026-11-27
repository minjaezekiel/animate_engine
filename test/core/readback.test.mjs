/**
 * The readback guard.
 *
 * `src/render/readback.js` takes THREE as an argument and imports no
 * renderer, so a stub renderer tests it in Node -- the same bargain
 * `onionSkin.js` makes with a fake canvas context.
 *
 * What is being tested is the FAILURE paths, because the success path is one
 * line of `gl.readPixels` and the failures are the whole reason the module
 * exists: three hands the buffer to WebGL and returns `undefined` whether the
 * read happened or not, so a failed read is indistinguishable from a black
 * frame -- and a black frame is a plausible answer.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pixelArrayFor, halfToFloat, readTargetPixels, meanRadiance }
    from '../../src/render/readback.js';

/** Just the constants and the one method the module touches. */
const THREE = {
    UnsignedByteType: 1009, ByteType: 1010, ShortType: 1011, UnsignedShortType: 1012,
    IntType: 1013, UnsignedIntType: 1014, FloatType: 1015, HalfFloatType: 1016,
};

const targetOf = (type, w = 2, h = 2, cube = false) => ({
    width: w, height: h, texture: { type },
    ...(cube ? { isWebGLCubeRenderTarget: true } : {}),
});

/** A renderer that writes a constant into whatever buffer it is given. */
const writer = (value) => ({
    reads: [],
    readRenderTargetPixels(target, x, y, w, h, buf, face) {
        this.reads.push({ x, y, w, h, face, kind: buf.constructor.name });
        buf.fill(value);
    },
});

/** A renderer that does what three does when the read is rejected: nothing. */
const silent = () => ({
    reads: 0,
    readRenderTargetPixels() { this.reads++; },
});

test('the buffer is chosen from the target, so it cannot drift from it', () => {
    assert.equal(pixelArrayFor(THREE, THREE.UnsignedByteType), Uint8Array);
    assert.equal(pixelArrayFor(THREE, THREE.HalfFloatType), Uint16Array,
                 'half floats come back as 16-bit patterns, not as floats');
    assert.equal(pixelArrayFor(THREE, THREE.FloatType), Float32Array);
    assert.equal(pixelArrayFor(THREE, THREE.UnsignedIntType), Uint32Array);
    assert.equal(pixelArrayFor(THREE, 4242), null, 'an unknown type must not guess bytes');

    for (const [type, kind] of [[THREE.UnsignedByteType, 'Uint8Array'],
                                [THREE.HalfFloatType, 'Uint16Array'],
                                [THREE.FloatType, 'Float32Array']]) {
        const r = writer(7);
        readTargetPixels(THREE, r, targetOf(type));
        assert.equal(r.reads[0].kind, kind, `wrong buffer for type ${type}`);
    }
});

test('a read that wrote nothing throws instead of returning a black frame', () => {
    // This is the bug. A Float32Array against a HalfFloatType target is
    // rejected by gl.readPixels with INVALID_OPERATION; three returns
    // undefined and the array is still zeros, which decodes as a black probe,
    // a matte of nothing, or a depth map pinned at the near plane.
    const r = silent();
    assert.throws(() => readTargetPixels(THREE, r, targetOf(THREE.HalfFloatType)),
                  /wrote nothing/);
    assert.equal(r.reads, 2, 'two sentinels, so a uniform frame is not a false alarm');
});

test('a genuinely uniform frame is not mistaken for a failed read', () => {
    // The sentinels are 1 and 2. A real frame of either value must survive.
    for (const value of [0, 1, 2, 255]) {
        const r = writer(value);
        const { pixels } = readTargetPixels(THREE, r, targetOf(THREE.UnsignedByteType));
        assert.ok(pixels.every((v) => v === value),
                  `a uniform frame of ${value} came back as ${pixels}`);
    }
});

test('an unknown texture type is named, not assumed', () => {
    assert.throws(() => readTargetPixels(THREE, writer(1), targetOf(4242)),
                  /texture type 4242 has no known pixel array/);
});

test('an out-of-bounds rectangle throws, where three skips it in silence', () => {
    // The quietest of the failures: no console message at all, and the buffer
    // simply stays as it was.
    const r = silent();
    assert.throws(() => readTargetPixels(THREE, r, targetOf(THREE.UnsignedByteType, 4, 4),
                                         { x: 3, y: 0, width: 4, height: 4 }),
                  /outside a 4x4 target/);
    assert.equal(r.reads, 0, 'it must not even attempt the read');
    assert.throws(() => readTargetPixels(THREE, r, targetOf(THREE.UnsignedByteType, 4, 4),
                                         { x: -1 }), /outside/);
});

test('a cube target without a face is refused by name', () => {
    // WebGL rejects it with "parameter 2 is not of type 'WebGLFramebuffer'",
    // which mentions neither cube maps nor the argument that is missing.
    assert.throws(() => readTargetPixels(THREE, writer(1),
                                         targetOf(THREE.UnsignedByteType, 2, 2, true)),
                  /needs a `face`/);
    // With one, it reads that face and says so.
    const r = writer(1);
    readTargetPixels(THREE, r, targetOf(THREE.UnsignedByteType, 2, 2, true), { face: 3 });
    assert.equal(r.reads[0].face, 3);
});

test('a probe is averaged over all six faces, not one', () => {
    // Averaging one face calls a probe dark because the room is dark in that
    // direction, which is the diagnostic firing on a bake that worked.
    const r = writer(128);
    const mean = meanRadiance(THREE, r, targetOf(THREE.UnsignedByteType, 2, 2, true));
    assert.equal(r.reads.length, 6);
    assert.deepEqual(r.reads.map((x) => x.face), [0, 1, 2, 3, 4, 5]);
    for (const c of ['r', 'g', 'b']) {
        assert.ok(Math.abs(mean[c] - 128 / 255) < 1e-12, `${c} = ${mean[c]}`);
    }
});

test('half-float patterns decode to the numbers they stand for', () => {
    // A 16-bit pattern read as a byte, or as a float, is a plausible number
    // and the wrong one.
    const cases = [[0x0000, 0], [0x3c00, 1], [0x4000, 2], [0xc000, -2],
                   [0x3555, 0.333251953125], [0x7bff, 65504], [0x0001, 2 ** -24]];
    for (const [bits, want] of cases) {
        assert.ok(Math.abs(halfToFloat(bits) - want) < 1e-12,
                  `0x${bits.toString(16)} -> ${halfToFloat(bits)}, want ${want}`);
    }
    assert.equal(halfToFloat(0x7c00), Infinity);
    assert.ok(Number.isNaN(halfToFloat(0x7e00)));

    // And a half-float target is averaged through that decode.
    const r = writer(0x3c00);             // 1.0
    const mean = meanRadiance(THREE, r, targetOf(THREE.HalfFloatType));
    assert.equal(mean.r, 1);
});
