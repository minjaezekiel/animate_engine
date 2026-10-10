/**
 * The kernel layer: one API, two backends.
 *
 * ```js
 * import { loadKernels } from './src/kernels/index.js';
 *
 * const K = await loadKernels();          // 'wasm' where available, else 'js'
 * const pos = K.f32(count * 3);
 * pos.array.set(myPositions);
 * const out = K.f32(count * 3);
 * K.skin(pos, idx, wgt, palette, out, count, boneCount);
 * ```
 *
 * # What belongs here and what does not
 *
 * A kernel is a **batch transform over flat numeric arrays** with no
 * scene-graph knowledge, no allocation per call, and no state between
 * calls. That is a narrow definition and it is doing real work: it keeps
 * the Rust free of anything that needs to understand the engine, so the
 * crate stays dependency-free and the JS mirror stays readable.
 *
 * Decisions that look like they could be kernels but are not:
 *
 *   - **Resampling a stroke into stamps** is polyline arithmetic over a
 *     few hundred points. It is cheap, it is where brush *feel* lives, and
 *     it wants to be read and tuned. It stays in JS.
 *   - **Building a warp grid from a depth map** is likewise cheap and is
 *     the part an author animates. JS.
 *   - **Composing a skinning palette** is `bones` matrix multiplies per
 *     frame, not `vertices`, and it belongs where the scene graph is.
 *
 * The rule that falls out: if the cost scales with *vertices* or *pixels*,
 * it is a kernel; if it scales with *control points* or *bones*, it is not.
 *
 * # Choosing a backend
 *
 * `loadKernels()` prefers wasm and falls back to JS on any failure --
 * absent `WebAssembly`, a refused ABI version, a corrupted cache entry.
 * The fallback is a real implementation and not a stub, so the engine
 * works everywhere; it is simply slower. `K.backend` reports which one is
 * live, and `prefer: 'js'` forces the fallback, which is what the
 * conformance test uses to run both over identical input.
 *
 * The two agree to within f32 rounding but are **not bit-identical**:
 * JavaScript has no single-precision arithmetic, so the JS path carries
 * f64 intermediates and is marginally more accurate. Anything taking a
 * golden hash over kernel output must record `K.backend` alongside it.
 */
import { instantiate, Buf, JsBuf } from './wasm/loader.js';
import { buildAdjacency } from './adjacency.js';
import * as jsDeform from './js/deform.js';
import * as jsRaster from './js/raster.js';
import * as jsWarp from './js/warp.js';
import * as jsBlend from './js/blend.js';

export { buildAdjacency };
export { MODES as BLEND_MODES, MODE_NAMES as BLEND_MODE_NAMES, modeId } from './js/blend.js';
export { STAMP_STRIDE } from './js/raster.js';

/**
 * Load the kernels.
 *
 * @param {object} [options]
 * @param {'auto'|'wasm'|'js'} [options.prefer='auto']
 *   `'wasm'` throws if wasm is unavailable instead of falling back, which
 *   is what a benchmark wants -- silently measuring the JS path and
 *   reporting it as wasm is worse than an error.
 * @param {Uint8Array} [options.wasmBytes]
 *   Override the embedded module, for a host that would rather fetch it.
 * @param {WebAssembly.Memory} [options.memory]
 *   A shared memory. Selects the multi-threaded module and instantiates
 *   it against this memory. `loadParallelKernels` in `./parallel.js` uses
 *   this; callers wanting a worker pool should use that instead.
 * @returns {Promise<Kernels>}
 */
export async function loadKernels({ prefer = 'auto', wasmBytes, memory } = {}) {
    if (prefer === 'js') return new Kernels(null);

    try {
        if (typeof WebAssembly === 'undefined') throw new Error('no WebAssembly');
        const bytes = wasmBytes ?? (memory
            ? (await import('./wasm/module-mt.js')).wasmBytes()
            : (await import('./wasm/module.js')).wasmBytes());
        return new Kernels(await instantiate(bytes, memory));
    } catch (err) {
        if (prefer === 'wasm') throw err;
        // Deliberately a warning and not a throw: a slow engine beats a
        // broken one. The reason is surfaced because "why is this slow"
        // is otherwise unanswerable from the outside.
        console.warn('jirex kernels: falling back to JS —', err.message);
        return new Kernels(null);
    }
}

/**
 * The kernel façade. Construct it through {@link loadKernels}.
 *
 * Buffers come from `f32`/`u32`/`u8` and are passed to kernels as wrappers
 * rather than as raw typed arrays, so the wasm backend can reach a pointer
 * without copying. Allocate them once and reuse them; see `Buf` for why
 * `buf.array` must never be cached across a call.
 */
export class Kernels {
    /** @param {object|null} host an instantiated wasm host, or null for JS */
    constructor(host) {
        this.host = host;
        /** @type {'wasm'|'js'} */
        this.backend = host ? 'wasm' : 'js';
        /** Whether the loaded wasm was built with simd128. False on the JS path. */
        this.simd = host ? !!host.exports.has_simd?.() : false;
    }

    // --- buffers ---------------------------------------------------------

    /** Allocate `n` floats, zeroed. */
    f32(n) { return this.host ? this.host.allocate(n, Float32Array) : new JsBuf(n, Float32Array); }
    /** Allocate `n` uint32s, zeroed. */
    u32(n) { return this.host ? this.host.allocate(n, Uint32Array) : new JsBuf(n, Uint32Array); }
    /** Allocate `n` bytes, zeroed. */
    u8(n) { return this.host ? this.host.allocate(n, Uint8Array) : new JsBuf(n, Uint8Array); }

    /**
     * Copy a JS typed array into a fresh kernel buffer.
     *
     * The convenience form, for setup rather than for a hot loop. In a
     * per-frame path, allocate once with `f32` and write through
     * `buf.array` instead of reallocating here.
     */
    from(source, Ctor = Float32Array) {
        const buf = Ctor === Float32Array ? this.f32(source.length)
            : Ctor === Uint32Array ? this.u32(source.length)
                : this.u8(source.length);
        buf.array.set(source);
        return buf;
    }

    /**
     * Build CSR adjacency from an index buffer and place it in kernel
     * memory, ready for {@link smooth}.
     *
     * Returned buffers are the caller's to `free()`.
     */
    adjacency(indices, count) {
        const { start, adj } = buildAdjacency(indices, count);
        return { start: this.from(start, Uint32Array), adj: this.from(adj, Uint32Array) };
    }

    // --- deformation -----------------------------------------------------

    /**
     * Linear blend skinning, four influences per vertex.
     *
     * `palette` is one column-major 4x4 per bone, already composed as
     * `boneMatrixWorld * inverseBindMatrix`.
     */
    skin(base, index, weight, palette, out, count, boneCount) {
        if (this.host) this.host.exports.skin(base.ptr, index.ptr, weight.ptr,
            palette.ptr, out.ptr, count, boneCount);
        else jsDeform.skin(base, index, weight, palette, out, count, boneCount);
    }

    /** Accumulate weighted morph deltas (shape-major) onto `base`. */
    morph(base, deltas, weights, out, count, shapes) {
        if (this.host) this.host.exports.morph(base.ptr, deltas.ptr, weights.ptr,
            out.ptr, count, shapes);
        else jsDeform.morph(base, deltas, weights, out, count, shapes);
    }

    /** Area-weighted vertex normals. */
    normals(positions, indices, out, count, tris) {
        if (this.host) this.host.exports.normals(positions.ptr, indices.ptr, out.ptr, count, tris);
        else jsDeform.normals(positions, indices, out, count, tris);
    }

    /**
     * One Laplacian smoothing pass. Reads `positions`, writes `out`; swap
     * the buffers between iterations.
     */
    smooth(positions, adjStart, adj, out, count, lambda) {
        if (this.host) this.host.exports.smooth(positions.ptr, adjStart.ptr, adj.ptr,
            out.ptr, count, lambda);
        else jsDeform.smooth(positions, adjStart, adj, out, count, lambda);
    }

    // --- paint -----------------------------------------------------------

    /**
     * Accumulate stamps `[x, y, radius, flow]` into a coverage mask.
     * `mode` 0 = peak (pen, pencil), 1 = build-up (airbrush).
     */
    stampMask(mask, w, h, stamps, count, hardness, mode, y0 = 0, y1 = h, texture = null) {
        // `texture` is `{ buf, width, height, mode, scale }` or null.
        // Canvas-locked (mode 1) is the one that matters for dry media:
        // paper tooth belongs to the paper, so passing over the same patch
        // twice must hit the same high points.
        const t = texture;
        if (this.host) {
            this.host.exports.stamp_mask(mask.ptr, w, h, stamps.ptr, count, hardness, mode,
                t ? t.buf.ptr : 0, t ? t.width : 0, t ? t.height : 0,
                t ? t.mode : 0, t ? t.scale : 1, y0, y1);
        } else {
            jsRaster.stampMask(mask, w, h, stamps, count, hardness, mode, y0, y1,
                t ? t.buf : null, t ? t.width : 0, t ? t.height : 0,
                t ? t.mode : 0, t ? t.scale : 1);
        }
    }

    /**
     * Wet media: dabs that pick up what is already on the canvas.
     *
     * Sequential by nature, so it takes no band arguments and cannot be
     * split across the worker pool. `smudge` (canvas pickup) and
     * `colorRate` (fresh paint) are independent controls.
     */
    smudgeStroke(dst, w, h, stamps, count, hardness, smudge, colorRate, sampleR,
                 r, g, b, opacity) {
        if (this.host) this.host.exports.smudge_stroke(dst.ptr, w, h, stamps.ptr, count,
            hardness, smudge, colorRate, sampleR, r, g, b, opacity);
        else jsRaster.smudgeStroke(dst, w, h, stamps, count, hardness, smudge,
            colorRate, sampleR, r, g, b, opacity);
    }

    /**
     * Composite one premultiplied layer onto another with a blend mode.
     *
     * `mode` is a name from `BLEND_MODE_NAMES` or its number.
     */
    blendLayers(dst, src, w, h, mode, opacity,
                { mask = null, clip = null, clipMask = null } = {}, y0 = 0, y1 = h) {
        const id = jsBlend.modeId(mode);
        if (this.host) {
            this.host.exports.blend_layers(dst.ptr, src.ptr, w, h, id, opacity,
                mask ? mask.ptr : 0, clip ? clip.ptr : 0, clipMask ? clipMask.ptr : 0, y0, y1);
        } else {
            jsBlend.blendLayers(dst, src, w, h, id, opacity, mask, clip, clipMask, y0, y1);
        }
    }

    /** Copy `n` floats between kernel buffers. */
    copyF32(src, dst, n) {
        if (this.host) this.host.exports.copy_f32(src.ptr, dst.ptr, n);
        else jsBlend.copyF32(src, dst, n);
    }

    /** Composite a mask over premultiplied f32 RGBA at `opacity`. */
    compositeMask(dst, mask, w, h, r, g, b, opacity, erase = 0, y0 = 0, y1 = h) {
        if (this.host) this.host.exports.composite_mask(dst.ptr, mask.ptr, w, h,
            r, g, b, opacity, erase ? 1 : 0, y0, y1);
        else jsRaster.compositeMask(dst, mask, w, h, r, g, b, opacity, erase ? 1 : 0, y0, y1);
    }

    /** Premultiplied f32 RGBA to straight u8 RGBA for `putImageData`. */
    maskToRgba8(src, dst, n, i0 = 0, i1 = n) {
        if (this.host) this.host.exports.mask_to_rgba8(src.ptr, dst.ptr, i0, i1);
        else jsRaster.maskToRgba8(src, dst, i0, i1);
    }

    /** Zero `n` floats. */
    clearF32(buf, n) {
        if (this.host) this.host.exports.clear_f32(buf.ptr, n);
        else jsRaster.clearF32(buf, n);
    }

    // --- image -----------------------------------------------------------

    /** Rasterise textured triangles from u8 RGBA `src` into f32 `dst`. */
    warpMesh(src, sw, sh, dst, dw, dh, verts, uvs, indices, tris, vcount, y0 = 0, y1 = dh) {
        if (this.host) this.host.exports.warp_mesh(src.ptr, sw, sh, dst.ptr, dw, dh,
            verts.ptr, uvs.ptr, indices.ptr, tris, vcount, y0, y1);
        else jsWarp.warpMesh(src, sw, sh, dst, dw, dh, verts, uvs, indices, tris, vcount, y0, y1);
    }

    /** Three box passes approximating a Gaussian. Result lands in `buf`. */
    blurRgba(buf, scratch, w, h, radius) {
        if (this.host) this.host.exports.blur_rgba(buf.ptr, scratch.ptr, w, h, radius);
        else jsWarp.blurRgba(buf, scratch, w, h, radius);
    }

    /**
     * One axis pass of the blur over a range of lines, for a worker pool.
     *
     * `begin`/`end` index the axis the pass does not read across -- rows
     * for a horizontal pass, columns for a vertical one.
     *
     * **The caller must barrier between passes.** A vertical pass reads
     * what the horizontal pass wrote, across rows, so every worker must
     * finish pass k before any starts pass k+1. Omitting the barrier does
     * not crash; it produces a subtly wrong result that varies with worker
     * timing. `ParallelKernels.blurRgba` does the barriers for you.
     */
    blurPass(src, dst, w, h, radius, horizontal, begin, end) {
        if (this.host) this.host.exports.blur_pass(src.ptr, dst.ptr, w, h, radius,
            horizontal ? 1 : 0, begin, end);
        else jsWarp.blurPass(src, dst, w, h, radius, horizontal, begin, end);
    }
}
