/**
 * Reading pixels back off a render target, without the silent zeros.
 *
 * # Why this exists
 *
 * `renderer.readRenderTargetPixels(target, x, y, w, h, buffer)` hands the
 * buffer straight to `gl.readPixels` with the TEXTURE's own format and type.
 * Three does not check that the buffer matches, and WebGL will not write into
 * one that does not: it raises `INVALID_OPERATION` and leaves the array
 * exactly as it was. There are four ways to get nothing back, and all four
 * look identical from the call site:
 *
 *   1. the buffer's kind does not match the texture's type -- a
 *      `Float32Array` against a `HalfFloatType` target needs `Uint16Array`;
 *   2. the format is not readable (`textureFormatReadable` fails) -- a bare
 *      `console.error` and a `return`;
 *   3. the type is not readable (`textureTypeReadable` fails) -- likewise;
 *   4. the rectangle is out of bounds -- three silently skips the read with
 *      no message at all.
 *
 * And one loud one, which is in here because the error it raises names
 * nothing useful: a cube render target read with no `activeCubeFaceIndex`
 * leaves `framebuffer` as an ARRAY of six, and WebGL rejects it with
 * "parameter 2 is not of type 'WebGLFramebuffer'" -- a message with no
 * mention of cube maps or of the argument actually missing.
 *
 * In every case the function returns `undefined` and the buffer is still
 * zeros. **A failed read is indistinguishable from a black frame**, and a
 * black frame is a plausible answer: it is a probe in the dark, a depth pass
 * at the near plane, a matte of nothing. This repository has now been bitten
 * by that twice -- Phase 62 read depth bytes in the wrong order and got
 * 0.010027 m for a cube at 11 m, and Phase 72's bounce bake read a working
 * probe as pure black for an hour.
 *
 * So: the buffer is chosen FROM the target, which makes (1) unreachable, and
 * a read that wrote nothing is an exception rather than a plausible number.
 *
 * Takes THREE as an argument, like everything else in `src/render/`.
 */

/**
 * The TypedArray `gl.readPixels` requires for a texture type.
 *
 * Keyed by the THREE constant at call time rather than by name, because the
 * constants are numbers and the mapping has to be exact. A type that is not
 * in here is a type this has never been tested with, and saying so beats
 * guessing `Uint8Array` and returning plausible rubbish.
 */
export function pixelArrayFor(THREE, type) {
    switch (type) {
        case THREE.UnsignedByteType: return Uint8Array;
        case THREE.ByteType: return Int8Array;
        case THREE.ShortType: return Int16Array;
        case THREE.UnsignedShortType: return Uint16Array;
        case THREE.IntType: return Int32Array;
        case THREE.UnsignedIntType: return Uint32Array;
        // Half floats come back as raw 16-bit patterns; `halfToFloat` below
        // turns them into numbers.
        case THREE.HalfFloatType: return Uint16Array;
        case THREE.FloatType: return Float32Array;
        default: return null;
    }
}

/** IEEE 754 binary16 -> a JavaScript number. */
export function halfToFloat(h) {
    const sign = (h & 0x8000) ? -1 : 1;
    const exp = (h & 0x7c00) >> 10;
    const frac = h & 0x03ff;
    if (exp === 0) return sign * frac * 2 ** -24;            // subnormal
    if (exp === 0x1f) return frac ? Number.NaN : sign * Infinity;
    return sign * (frac + 1024) * 2 ** (exp - 25);
}

/**
 * Two sentinels, filled in before the read and checked after it.
 *
 * This is the part that makes a failed read loud, and it needs no knowledge
 * of three's internals or of `gl.getError`: nothing but `readPixels` writes
 * into the buffer, so if the buffer still holds the sentinel the read did not
 * happen.
 *
 * One sentinel would be ambiguous -- a genuinely uniform frame could be that
 * value. Two are not. A real image cannot be uniformly 1 AND uniformly 2, so
 * if both reads come back untouched at their own sentinel, nothing was
 * written; and if the second read differs from its sentinel, it holds the
 * real pixels and is the one returned.
 */
const SENTINELS = [1, 2];

const allEqual = (buf, v) => {
    for (let i = 0; i < buf.length; i++) if (buf[i] !== v) return false;
    return true;
};

/**
 * Read a rectangle off a render target into a correctly-typed buffer.
 *
 * @param {object} THREE
 * @param {object} renderer
 * @param {object} target     a WebGLRenderTarget or WebGLCubeRenderTarget
 * @param {object} [options]
 * @param {number} [options.face]  cube face index, for a cube target
 * @returns {{pixels: ArrayLike<number>, type: number, float: boolean}}
 *   `float` says whether the values need `halfToFloat`.
 * @throws if the type is unsupported, the rectangle is out of bounds, or the
 *   read wrote nothing.
 */
export function readTargetPixels(THREE, renderer, target, {
    x = 0, y = 0, width = null, height = null, face = undefined,
} = {}) {
    const w = width ?? target.width;
    const h = height ?? target.height;
    const type = target.texture?.type;
    /**
     * A cube target holds six framebuffers and three indexes into them only
     * when it is told which one. Without a face it hands the array itself to
     * `bindFramebuffer`, and the TypeError that comes back mentions neither
     * cube maps nor the missing argument.
     */
    if (target.isWebGLCubeRenderTarget && face === undefined) {
        throw new Error('readTargetPixels: a cube render target needs a `face` '
            + '(0-5); without one WebGL is handed all six framebuffers at once');
    }
    const Arr = pixelArrayFor(THREE, type);
    if (!Arr) {
        throw new Error(`readTargetPixels: texture type ${type} has no known pixel array; `
            + 'add it to `pixelArrayFor` rather than assuming bytes');
    }
    /**
     * Checked here rather than left to three, which skips an out-of-bounds
     * read with no message whatsoever -- the quietest of the four failures.
     */
    if (!(x >= 0 && y >= 0 && x <= target.width - w && y <= target.height - h)) {
        throw new Error(`readTargetPixels: ${w}x${h} at (${x}, ${y}) is outside `
            + `a ${target.width}x${target.height} target`);
    }

    let pixels = null;
    for (const sentinel of SENTINELS) {
        const buf = new Arr(w * h * 4);
        buf.fill(sentinel);
        renderer.readRenderTargetPixels(target, x, y, w, h, buf, face);
        if (!allEqual(buf, sentinel)) { pixels = buf; break; }
        pixels = null;
    }
    if (!pixels) {
        throw new Error('readTargetPixels: the read wrote nothing -- the buffer came back '
            + `untouched twice. Target ${target.width}x${target.height}, type ${type}`
            + `${face === undefined ? '' : `, face ${face}`}. Three reports an unreadable `
            + 'format or type on the console and returns silently; a black frame is a '
            + 'plausible answer, so this is an exception instead');
    }
    return { pixels, type, float: type === THREE.HalfFloatType };
}

/**
 * Mean linear radiance over a target, per channel.
 *
 * Used to answer one question about a baked probe -- does it carry any light
 * at all -- which is a question with a number for an answer and therefore the
 * only honest way to check that a bounce bake worked.
 */
export function meanRadiance(THREE, renderer, target, { face = undefined } = {}) {
    /**
     * Over all six faces of a cube target unless one is named. A probe's
     * energy is the whole sphere it sees -- averaging one face would call a
     * probe dark because the room happens to be dark in that direction,
     * which is the diagnostic firing on a working bake.
     */
    const faces = target.isWebGLCubeRenderTarget && face === undefined
        ? [0, 1, 2, 3, 4, 5] : [face];
    let r = 0, g = 0, b = 0, n = 0;
    for (const f of faces) {
        const { pixels, float } = readTargetPixels(THREE, renderer, target, { face: f });
        const to = float ? halfToFloat : (v) => v / 255;
        for (let i = 0; i < pixels.length; i += 4) {
            r += to(pixels[i]); g += to(pixels[i + 1]); b += to(pixels[i + 2]);
        }
        n += pixels.length / 4;
    }
    return { r: r / n, g: g / n, b: b / n };
}
