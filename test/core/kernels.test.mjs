/**
 * Kernel tests: module integrity, backend conformance, and the maths.
 *
 *   npm run test:kernels      # just this file
 *   npm test                  # with everything else
 *
 * Three layers, in order of what they would catch:
 *
 *  1. **Integrity / regression** -- the wasm module is self-contained, its
 *     ABI matches, it was built with SIMD, growing the heap does not
 *     corrupt live buffers, and a corrupt module falls back rather than
 *     throwing. These are the traps that cost real time while building
 *     this layer, so each one has a test that fails if it returns.
 *
 *  2. **Conformance** -- every kernel is run on both backends over
 *     identical input and the results must agree. This is what makes the
 *     JS fallback trustworthy: it is not a stub, it is the same function.
 *     Agreement is to a tolerance, not bit-exact, because JS has no f32
 *     arithmetic; see the determinism notes in `rust/.../lib.rs`.
 *
 *  3. **Correctness** -- the maths, asserted against hand-computed
 *     answers on both backends. Conformance alone would pass happily if
 *     both implementations were wrong in the same way, which is exactly
 *     what happens when one is a port of the other.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernels, buildAdjacency, STAMP_STRIDE, BLEND_MODE_NAMES } from '../../src/kernels/index.js';
import { wasmBytes, WASM_SIZE } from '../../src/kernels/wasm/module.js';

const WASM = await loadKernels({ prefer: 'wasm' });
const JS = await loadKernels({ prefer: 'js' });
const BOTH = [WASM, JS];

/** Fill a fresh kernel buffer from a plain array. */
const mk = (K, values, Ctor = Float32Array) => K.from(Ctor.from(values), Ctor);

/** Largest absolute difference between two array-likes. */
function maxDiff(a, b) {
    assert.equal(a.length, b.length, 'length mismatch');
    let worst = 0;
    for (let i = 0; i < a.length; i++) {
        const d = Math.abs(a[i] - b[i]);
        if (d > worst) worst = d;
    }
    return worst;
}

/** Deterministic pseudo-random input, so a failure is reproducible. */
function seeded(n, seed = 1) {
    const out = new Float32Array(n);
    let s = seed >>> 0;
    for (let i = 0; i < n; i++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        out[i] = (s / 4294967296) * 2 - 1;
    }
    return out;
}

// =====================================================================
// 1. Module integrity and regression
// =====================================================================

test('wasm module is self-contained: no host imports', async () => {
    const mod = await WebAssembly.compile(wasmBytes());
    assert.deepEqual(WebAssembly.Module.imports(mod), [],
        'kernels must import nothing -- no WASI, no bindgen glue, no host functions');
});

test('wasm module exports the full ABI surface', async () => {
    const mod = await WebAssembly.compile(wasmBytes());
    const names = new Set(WebAssembly.Module.exports(mod).map((e) => e.name));
    for (const n of ['memory', 'alloc', 'dealloc', 'abi_version', 'has_simd',
        'skin', 'morph', 'normals', 'smooth',
        'stamp_mask', 'composite_mask', 'mask_to_rgba8', 'clear_f32',
        'warp_mesh', 'blur_rgba']) {
        assert.ok(names.has(n), `missing export ${n}`);
    }
});

test('wasm backend loaded, and was built with simd128', () => {
    assert.equal(WASM.backend, 'wasm');
    // Regression: `.cargo/config.toml` is discovered from the working
    // directory, not from --manifest-path, so building the crate from the
    // repo root silently dropped `+simd128` and produced a scalar module
    // that reported itself as fine.
    assert.equal(WASM.simd, true, 'built without simd128 -- check build-wasm.mjs cwd');
    assert.ok(WASM_SIZE > 0 && WASM_SIZE < 200_000, `implausible module size ${WASM_SIZE}`);
});

test('regression: growing the heap does not corrupt live buffers', () => {
    // `memory.grow` replaces the ArrayBuffer and detaches every view over
    // the old one. A loader that caches `new Float32Array(buffer, ptr, n)`
    // at allocation time works until the heap first expands and then
    // silently reads zeros. `Buf.array` re-derives instead; this asserts
    // it, because the failure is invisible without a test.
    const small = WASM.f32(64);
    for (let i = 0; i < 64; i++) small.array[i] = i + 1;

    const before = WASM.host.memory.buffer;
    const big = WASM.f32(16 * 1024 * 1024);          // 64 MB, forces growth
    assert.notEqual(WASM.host.memory.buffer, before, 'heap did not grow; test is not exercising the trap');

    for (let i = 0; i < 64; i++) {
        assert.equal(small.array[i], i + 1, `buffer corrupted at ${i} after heap growth`);
    }
    big.free();
    small.free();
});

test('regression: a corrupt module falls back to JS instead of throwing', async () => {
    const K = await loadKernels({ wasmBytes: new Uint8Array([0, 1, 2, 3]) });
    assert.equal(K.backend, 'js', 'bad bytes must degrade to the JS path, not fail the engine');
    // And the fallback must be usable, not a husk.
    const out = K.f32(3);
    K.normals(mk(K, [0, 0, 0, 1, 0, 0, 0, 1, 0]), mk(K, [0, 1, 2], Uint32Array), out, 3, 1);
    assert.ok(Number.isFinite(out.array[0]));
});

test('prefer:wasm throws rather than silently measuring the JS path', async () => {
    await assert.rejects(() => loadKernels({ prefer: 'wasm', wasmBytes: new Uint8Array([0]) }));
});

test('allocated buffers are zeroed', () => {
    // `normals` and `stamp_mask` accumulate into their output, so a dirty
    // allocation shows up as geometry or ink inherited from freed memory.
    const a = WASM.f32(256);
    a.array.fill(7);
    a.free();
    const b = WASM.f32(256);
    assert.equal(b.array.reduce((s, v) => s + v, 0), 0, 'allocation returned dirty memory');
});

// =====================================================================
// 2. Conformance: wasm must agree with JS
// =====================================================================

test('conformance: skin', () => {
    const count = 500, bones = 8;
    const base = seeded(count * 3, 11);
    const idx = Uint32Array.from({ length: count * 4 }, (_, i) => (i * 7) % bones);
    const wRaw = seeded(count * 4, 13).map(Math.abs);
    // Normalise so each vertex's influences sum to 1, as a real rig does.
    for (let v = 0; v < count; v++) {
        let s = 0;
        for (let i = 0; i < 4; i++) s += wRaw[v * 4 + i];
        for (let i = 0; i < 4; i++) wRaw[v * 4 + i] /= s || 1;
    }
    const pal = seeded(bones * 16, 17);
    for (let b = 0; b < bones; b++) pal[b * 16 + 15] = 1;   // keep w sane

    const run = (K) => {
        const out = K.f32(count * 3);
        K.skin(K.from(base), K.from(idx, Uint32Array), K.from(wRaw),
            K.from(pal), out, count, bones);
        return Float32Array.from(out.array);
    };
    assert.ok(maxDiff(run(WASM), run(JS)) < 1e-5);
});

test('conformance: morph', () => {
    const count = 800, shapes = 24;
    const base = seeded(count * 3, 23);
    const deltas = seeded(shapes * count * 3, 29);
    const weights = new Float32Array(shapes);
    weights[0] = 0.8; weights[5] = 0.35; weights[17] = -0.2;
    weights[9] = 1e-9;                 // below epsilon: both must skip it

    const run = (K) => {
        const out = K.f32(count * 3);
        K.morph(K.from(base), K.from(deltas), K.from(weights), out, count, shapes);
        return Float32Array.from(out.array);
    };
    assert.ok(maxDiff(run(WASM), run(JS)) < 1e-5);
});

test('conformance: normals', () => {
    const { positions, indices, count, tris } = grid(12, 12);
    const run = (K) => {
        const out = K.f32(count * 3);
        K.normals(K.from(positions), K.from(indices, Uint32Array), out, count, tris);
        return Float32Array.from(out.array);
    };
    assert.ok(maxDiff(run(WASM), run(JS)) < 1e-6);
});

test('conformance: smooth', () => {
    const { positions, indices, count } = grid(14, 14);
    const { start, adj } = buildAdjacency(indices, count);
    const run = (K) => {
        const out = K.f32(count * 3);
        K.smooth(K.from(positions), K.from(start, Uint32Array),
            K.from(adj, Uint32Array), out, count, 0.5);
        return Float32Array.from(out.array);
    };
    assert.ok(maxDiff(run(WASM), run(JS)) < 1e-6);
});

test('conformance: stampMask, both modes', () => {
    const w = 64, h = 64;
    // Six floats per dab: x, y, radius, flow, angle, aspect. Elliptical
    // dabs are included deliberately, since a round-only fixture would
    // leave the rotation maths unexercised on both backends at once.
    const stamps = new Float32Array(40 * STAMP_STRIDE);
    for (let i = 0; i < 40; i++) {
        const o = i * STAMP_STRIDE;
        stamps[o] = 8 + (i * 1.3) % 48;
        stamps[o + 1] = 8 + (i * 2.7) % 48;
        stamps[o + 2] = 4 + (i % 5);
        stamps[o + 3] = 0.3 + (i % 3) * 0.2;
        stamps[o + 4] = (i % 7) * 0.4;
        stamps[o + 5] = i % 3 === 0 ? 0.35 : 1;
    }
    for (const mode of [0, 1]) {
        const run = (K) => {
            const mask = K.f32(w * h);
            K.stampMask(mask, w, h, K.from(stamps), 40, 0.4, mode);
            return Float32Array.from(mask.array);
        };
        assert.ok(maxDiff(run(WASM), run(JS)) < 1e-6, `mode ${mode}`);
    }
});

test('conformance: compositeMask and maskToRgba8', () => {
    const w = 48, h = 32, n = w * h;
    const mask = seeded(n, 31).map(Math.abs);
    const runF = (K) => {
        const dst = K.f32(n * 4);
        K.compositeMask(dst, K.from(mask), w, h, 0.9, 0.3, 0.1, 0.7, 0);
        return Float32Array.from(dst.array);
    };
    assert.ok(maxDiff(runF(WASM), runF(JS)) < 1e-6);

    const runU = (K) => {
        const dst = K.f32(n * 4);
        K.compositeMask(dst, K.from(mask), w, h, 0.9, 0.3, 0.1, 0.7, 0);
        const u8 = K.u8(n * 4);
        K.maskToRgba8(dst, u8, n);
        return Uint8Array.from(u8.array);
    };
    // u8 output: allow one least-significant bit, since the f64 and f32
    // divides can land either side of a rounding boundary.
    assert.ok(maxDiff(runU(WASM), runU(JS)) <= 1);
});

test('conformance: stampMask with a grain texture, both lock modes', () => {
    // Without this, a mutation to the JS grain path survives: every paint
    // test that exercises texture goes through the wasm backend, so the
    // fallback is unverified unless conformance covers it.
    const w = 56, h = 44;
    const tex = new Uint8Array(32 * 32);
    for (let i = 0; i < tex.length; i++) tex[i] = (i * 37 + (i >> 5) * 11) & 255;
    const stamps = new Float32Array(20 * STAMP_STRIDE);
    for (let i = 0; i < 20; i++) {
        stamps.set([6 + (i * 2.3) % 44, 6 + (i * 3.1) % 32, 5 + (i % 3), 0.6,
            i * 0.3, i % 2 ? 0.4 : 1], i * STAMP_STRIDE);
    }
    for (const texMode of [1, 2]) {
        const run = (K) => {
            const mask = K.f32(w * h);
            K.stampMask(mask, w, h, K.from(stamps), 20, 0.5, 0, 0, h, {
                buf: K.from(tex, Uint8Array), width: 32, height: 32,
                mode: texMode, scale: 1.7,
            });
            return Float32Array.from(mask.array);
        };
        assert.ok(maxDiff(run(WASM), run(JS)) < 1e-6, `texMode ${texMode}`);
    }
});

test('conformance: smudgeStroke', () => {
    const w = 60, h = 40, n = w * h;
    const start = seeded(n * 4, 61).map(Math.abs);
    const stamps = new Float32Array(30 * STAMP_STRIDE);
    for (let i = 0; i < 30; i++) {
        stamps.set([8 + i * 1.5, 10 + Math.sin(i * 0.4) * 8, 6, 0.7, 0, 1], i * STAMP_STRIDE);
    }
    const run = (K) => {
        const dst = K.from(start);
        K.smudgeStroke(dst, w, h, K.from(stamps), 30, 0.5, 0.6, 0.2, 0, 0.9, 0.4, 0.1, 0.8);
        return Float32Array.from(dst.array);
    };
    assert.ok(maxDiff(run(WASM), run(JS)) < 1e-5);
});

test('conformance: blendLayers, every mode', () => {
    // All five blend mutations survived the first mutation audit because
    // every blend test reached the wasm backend and nothing exercised the
    // JS mirror at all.
    const w = 32, h = 24, n = w * h * 4;
    const backdrop = seeded(n, 67).map(Math.abs);
    const source = seeded(n, 71).map(Math.abs);
    // Premultiplied-valid inputs: no channel above its own alpha, or the
    // un-divide produces values outside 0..1 and the comparison is
    // meaningless.
    for (const buf of [backdrop, source]) {
        for (let i = 0; i < w * h; i++) {
            const a = buf[i * 4 + 3];
            for (let c = 0; c < 3; c++) buf[i * 4 + c] = Math.min(buf[i * 4 + c], a);
        }
    }
    for (const mode of BLEND_MODE_NAMES) {
        const run = (K) => {
            const dst = K.from(backdrop);
            K.blendLayers(dst, K.from(source), w, h, mode, 0.75);
            return Float32Array.from(dst.array);
        };
        assert.ok(maxDiff(run(WASM), run(JS)) < 1e-5, `mode ${mode}`);
    }
});

test('conformance: blendLayers with a mask, a clip and a clip mask', () => {
    // Without this the JS mirror's three coverage multipliers are never
    // executed: every masking and clipping test reaches the document,
    // which uses the wasm backend. Four mutations survived on exactly
    // that gap.
    const w = 24, h = 20, n = w * h * 4;
    const backdrop = seeded(n, 73).map(Math.abs);
    const source = seeded(n, 79).map(Math.abs);
    const mask = seeded(n, 83).map(Math.abs);
    const clip = seeded(n, 89).map(Math.abs);
    const clipMask = seeded(n, 97).map(Math.abs);
    for (const buf of [backdrop, source]) {
        for (let i = 0; i < w * h; i++) {
            const a = buf[i * 4 + 3];
            for (let c = 0; c < 3; c++) buf[i * 4 + c] = Math.min(buf[i * 4 + c], a);
        }
    }
    // Each combination separately, so a mirror that drops exactly one of
    // the three is still caught.
    const combos = [
        ['mask only', { mask: true }],
        ['clip only', { clip: true }],
        ['clip mask only', { clipMask: true }],
        ['all three', { mask: true, clip: true, clipMask: true }],
    ];
    for (const [label, want] of combos) {
        for (const mode of ['normal', 'multiply', 'luminosity']) {
            const run = (K) => {
                const dst = K.from(backdrop);
                K.blendLayers(dst, K.from(source), w, h, mode, 0.8, {
                    mask: want.mask ? K.from(mask) : null,
                    clip: want.clip ? K.from(clip) : null,
                    clipMask: want.clipMask ? K.from(clipMask) : null,
                });
                return Float32Array.from(dst.array);
            };
            assert.ok(maxDiff(run(WASM), run(JS)) < 1e-5, `${label}, ${mode}`);
        }
    }
});

test('a mask multiplies source alpha, read at the right stride', () => {
    // A mirror reading `M[i]` instead of `M[p + 3]` still produces
    // plausible numbers, so the values are pinned rather than just
    // compared between backends.
    for (const K of BOTH) {
        const n = 4;
        const dst = K.f32(n * 4), src = K.f32(n * 4), mask = K.f32(n * 4);
        for (let i = 0; i < n; i++) {
            src.array.set([1, 0, 0, 1], i * 4);
            // Alpha ramps 0, 1/3, 2/3, 1; the colour channels are
            // deliberately different, so a stride mistake reads one.
            mask.array.set([0.9, 0.8, 0.7, i / 3], i * 4);
        }
        K.blendLayers(dst, src, n, 1, 'normal', 1, { mask });
        for (let i = 0; i < n; i++) {
            assert.ok(Math.abs(dst.array[i * 4 + 3] - i / 3) < 1e-5,
                `${K.backend}: pixel ${i} alpha ${dst.array[i * 4 + 3]}, expected ${i / 3}`);
        }
    }
});

test('conformance: warpMesh', () => {
    const { src, sw, sh } = image(24, 24);
    const dw = 37, dh = 29;
    const m = mesh(dw, dh, 4);
    const run = (K) => {
        const dst = K.f32(dw * dh * 4);
        K.warpMesh(K.from(src, Uint8Array), sw, sh, dst, dw, dh,
            K.from(m.verts), K.from(m.uvs), K.from(m.indices, Uint32Array),
            m.tris, m.vcount);
        return Float32Array.from(dst.array);
    };
    assert.ok(maxDiff(run(WASM), run(JS)) < 1e-5);
});

test('conformance: blurRgba', () => {
    const w = 40, h = 36, n = w * h * 4;
    const field = seeded(n, 37).map(Math.abs);
    const run = (K) => {
        const buf = K.from(field);
        K.blurRgba(buf, K.f32(n), w, h, 4);
        return Float32Array.from(buf.array);
    };
    // Three box passes accumulate rounding, so the tolerance is looser
    // here than for a single-pass kernel. It is still far below anything
    // visible at 8 bits per channel (1/255 is 0.0039).
    assert.ok(maxDiff(run(WASM), run(JS)) < 1e-4);
});

// =====================================================================
// 3. Correctness of the maths, on both backends
// =====================================================================

for (const K of BOTH) {
    const tag = K.backend;

    test(`${tag}: skin with an identity palette leaves vertices alone`, () => {
        const count = 4;
        const base = [0, 0, 0, 1, 2, 3, -4, 5, 6, 7, -8, 9];
        const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
        const out = K.f32(count * 3);
        K.skin(mk(K, base), mk(K, new Array(count * 4).fill(0), Uint32Array),
            mk(K, Array.from({ length: count * 4 }, (_, i) => (i % 4 === 0 ? 1 : 0))),
            mk(K, identity), out, count, 1);
        assert.ok(maxDiff(out.array, Float32Array.from(base)) < 1e-6);
    });

    test(`${tag}: skin applies a bone translation`, () => {
        // Column-major: translation lives in elements 12, 13, 14.
        const m = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 20, 30, 1];
        const out = K.f32(3);
        K.skin(mk(K, [1, 2, 3]), mk(K, [0, 0, 0, 0], Uint32Array),
            mk(K, [1, 0, 0, 0]), mk(K, m), out, 1, 1);
        assert.deepEqual(Array.from(out.array), [11, 22, 33]);
    });

    test(`${tag}: skin ignores an out-of-range bone index`, () => {
        // A malformed rig must deform nothing, not read past the palette.
        const out = K.f32(3);
        K.skin(mk(K, [1, 2, 3]), mk(K, [99, 0, 0, 0], Uint32Array),
            mk(K, [1, 0, 0, 0]), mk(K, new Array(16).fill(0)), out, 1, 1);
        assert.deepEqual(Array.from(out.array), [0, 0, 0]);
    });

    test(`${tag}: morph at weight 0 is the base, at weight 1 is base plus delta`, () => {
        const base = [1, 1, 1], delta = [0.5, -2, 3];
        const zero = K.f32(3);
        K.morph(mk(K, base), mk(K, delta), mk(K, [0]), zero, 1, 1);
        assert.ok(maxDiff(zero.array, Float32Array.from(base)) < 1e-7);

        const one = K.f32(3);
        K.morph(mk(K, base), mk(K, delta), mk(K, [1]), one, 1, 1);
        assert.ok(maxDiff(one.array, Float32Array.from([1.5, -1, 4])) < 1e-6);
    });

    test(`${tag}: morph skips weights below epsilon`, () => {
        // Both backends must use the same threshold, or they disagree on
        // which shapes contribute and the golden hashes follow the loader.
        const out = K.f32(3);
        K.morph(mk(K, [0, 0, 0]), mk(K, [1000, 1000, 1000]), mk(K, [1e-9]), out, 1, 1);
        assert.deepEqual(Array.from(out.array), [0, 0, 0]);
    });

    test(`${tag}: normals of a CCW triangle in XY point along +Z`, () => {
        const out = K.f32(9);
        K.normals(mk(K, [0, 0, 0, 1, 0, 0, 0, 1, 0]), mk(K, [0, 1, 2], Uint32Array), out, 3, 1);
        for (let v = 0; v < 3; v++) {
            assert.ok(maxDiff(out.array.slice(v * 3, v * 3 + 3), Float32Array.from([0, 0, 1])) < 1e-6);
        }
    });

    test(`${tag}: normals weight by area, not by face count`, () => {
        // One large triangle in XY and one small triangle in XZ meet at
        // vertex 0. Area weighting must let the large one dominate.
        const positions = [0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 1, 1, 0, 0];
        const indices = [0, 1, 2, 0, 4, 3];
        const out = K.f32(5 * 3);
        K.normals(mk(K, positions), mk(K, indices, Uint32Array), out, 5, 2);
        const nz = out.array[2], ny = out.array[1];
        assert.ok(Math.abs(nz) > Math.abs(ny) * 5,
            `expected the 50-area face to dominate the 0.5-area one, got z=${nz} y=${ny}`);
    });

    test(`${tag}: an unreferenced vertex gets a usable normal, never NaN`, () => {
        // A NaN normal reaches the shader and blackens the whole surface.
        const out = K.f32(4 * 3);
        K.normals(mk(K, [0, 0, 0, 1, 0, 0, 0, 1, 0, 5, 5, 5]),
            mk(K, [0, 1, 2], Uint32Array), out, 4, 1);
        assert.deepEqual(Array.from(out.array.slice(9, 12)), [0, 1, 0]);
    });

    test(`${tag}: smooth is the identity at lambda 0 and flattens a spike`, () => {
        const { positions, indices, count } = grid(7, 7);
        const { start, adj } = buildAdjacency(indices, count);
        const S = mk(K, start, Uint32Array), A = mk(K, adj, Uint32Array);

        const same = K.f32(count * 3);
        K.smooth(mk(K, positions), S, A, same, count, 0);
        assert.ok(maxDiff(same.array, Float32Array.from(positions)) < 1e-7);

        const spiked = Float32Array.from(positions);
        const centre = (3 * 7 + 3);
        spiked[centre * 3 + 2] = 10;                 // push one vertex out in Z
        const out = K.f32(count * 3);
        K.smooth(mk(K, spiked), S, A, out, count, 1);
        assert.ok(Math.abs(out.array[centre * 3 + 2]) < 1,
            `spike survived smoothing: z=${out.array[centre * 3 + 2]}`);
    });

    test(`${tag}: stampMask peak mode never exceeds flow, build-up does accumulate`, () => {
        const w = 16, h = 16;
        // Eight stamps on the same spot: the classic over-darkening case.
        const stamps = new Float32Array(8 * STAMP_STRIDE);
        for (let i = 0; i < 8; i++) {
            stamps.set([8, 8, 5, 0.25, 0, 1], i * STAMP_STRIDE);
        }
        const peak = K.f32(w * h);
        K.stampMask(peak, w, h, mk(K, stamps), 8, 0.5, 0);
        assert.ok(Math.max(...peak.array) <= 0.25 + 1e-6,
            'peak mode compounded: a slowly drawn pen stroke would darken');

        const build = K.f32(w * h);
        K.stampMask(build, w, h, mk(K, stamps), 8, 0.5, 1);
        assert.ok(Math.max(...build.array) > 0.6, 'build-up mode failed to accumulate');
        assert.ok(Math.max(...build.array) <= 1 + 1e-6, 'build-up exceeded full coverage');
    });

    test(`${tag}: a hard brush is still antialiased at its edge`, () => {
        // At hardness 1 the ideal feather is zero. Without the half-pixel
        // floor every edge pixel would be 0 or NaN and the circle would
        // read as jagged.
        const w = 32, h = 32;
        const mask = K.f32(w * h);
        K.stampMask(mask, w, h, mk(K, [16, 16, 8, 1, 0, 1]), 1, 1.0, 0);
        const values = Array.from(mask.array);
        assert.ok(values.every(Number.isFinite), 'NaN in a hard-brush mask');
        // A radius-8 circle has a ~50px circumference, so a genuine rim is
        // tens of pixels. The first attempt at this fix produced exactly 8
        // -- enough to pass a lazy threshold, not enough to look smooth --
        // so the bar is set near the circumference deliberately.
        const partial = values.filter((v) => v > 0.01 && v < 0.99).length;
        assert.ok(partial > 30, `expected an antialiased rim, found ${partial} partial pixels`);
    });

    test(`${tag}: stamp coverage falls off monotonically from the centre`, () => {
        const w = 41, h = 41;
        const mask = K.f32(w * h);
        K.stampMask(mask, w, h, mk(K, [20.5, 20.5, 18, 1, 0, 1]), 1, 0.2, 0);
        let prev = Infinity;
        for (let x = 20; x < 39; x++) {
            const v = mask.array[20 * w + x];
            assert.ok(v <= prev + 1e-6, `coverage rose at x=${x}: ${prev} -> ${v}`);
            prev = v;
        }
        assert.equal(mask.array[20 * w + 40], 0, 'coverage outside the radius');
    });

    test(`${tag}: compositeMask keeps the buffer premultiplied-valid`, () => {
        const w = 24, h = 24, n = w * h;
        const dst = K.f32(n * 4);
        const mask = K.f32(n);
        K.stampMask(mask, w, h, mk(K, [12, 12, 9, 1, 0, 1]), 1, 0.3, 0);
        K.compositeMask(dst, mask, w, h, 1, 0.5, 0, 0.8, 0);
        for (let i = 0; i < n; i++) {
            const a = dst.array[i * 4 + 3];
            for (let c = 0; c < 3; c++) {
                // Premultiplied means no channel may exceed alpha. A
                // violation shows up later as a colour that brightens when
                // composited over anything.
                assert.ok(dst.array[i * 4 + c] <= a + 1e-6,
                    `channel ${c} exceeds alpha at pixel ${i}`);
            }
        }
    });

    test(`${tag}: erase removes alpha without leaving a colour fringe`, () => {
        const w = 8, h = 8, n = w * h;
        const dst = K.f32(n * 4);
        for (let i = 0; i < n; i++) dst.array.set([0.5, 0.25, 0.1, 0.5], i * 4);
        const mask = K.f32(n);
        mask.array.fill(1);
        K.compositeMask(dst, mask, w, h, 0, 0, 0, 1, 1);
        for (let i = 0; i < n; i++) {
            for (let c = 0; c < 4; c++) {
                assert.ok(Math.abs(dst.array[i * 4 + c]) < 1e-6, 'full erase left residue');
            }
        }
    });

    test(`${tag}: maskToRgba8 round-trips a known colour and zeroes empty pixels`, () => {
        const dst = K.f32(8);
        // Pixel 0: red at half alpha, premultiplied. Pixel 1: empty.
        dst.array.set([0.5, 0, 0, 0.5, 0, 0, 0, 0]);
        const u8 = K.u8(8);
        K.maskToRgba8(dst, u8, 2);
        assert.equal(u8.array[0], 255, 'unpremultiply lost the colour');
        assert.equal(u8.array[3], 128);
        assert.deepEqual(Array.from(u8.array.slice(4, 8)), [0, 0, 0, 0],
            'an alpha-0 pixel must be transparent black, not a divide by zero');
    });

    test(`${tag}: an identity mesh reproduces the source image`, () => {
        const { src, sw, sh } = image(16, 16);
        const dst = K.f32(16 * 16 * 4);
        const m = mesh(16, 16, 1);
        K.warpMesh(mk(K, src, Uint8Array), sw, sh, dst, 16, 16,
            mk(K, m.verts), mk(K, m.uvs), mk(K, m.indices, Uint32Array), m.tris, m.vcount);
        for (let i = 0; i < 16 * 16; i++) {
            // Source is opaque, so premultiplied equals source / 255.
            assert.ok(Math.abs(dst.array[i * 4] - src[i * 4] / 255) < 2e-3,
                `identity warp altered pixel ${i}`);
        }
    });

    test(`${tag}: regression -- a subdivided warp grid leaves no unwritten pixel`, () => {
        // Grid lines are placed on half-integers so that pixel centres
        // land exactly on shared triangle edges, which is the case an
        // exclusive fill rule drops. A dropped pixel is the single-pixel
        // diagonal seam across a warped photo.
        const { src, sw, sh } = image(16, 16);
        const dw = 32, dh = 32;
        const dst = K.f32(dw * dh * 4);
        const SENTINEL = -999;
        dst.array.fill(SENTINEL);

        const lines = [0, 8.5, 16.5, 24.5, 32];
        const verts = [], uvs = [];
        for (const y of lines) {
            for (const x of lines) {
                verts.push(x, y);
                uvs.push(x / dw, y / dh);
            }
        }
        const indices = [];
        const n = lines.length;
        for (let r = 0; r < n - 1; r++) {
            for (let c = 0; c < n - 1; c++) {
                const i = r * n + c;
                indices.push(i, i + 1, i + n + 1, i, i + n + 1, i + n);
            }
        }
        K.warpMesh(mk(K, src, Uint8Array), sw, sh, dst, dw, dh,
            mk(K, verts), mk(K, uvs), mk(K, indices, Uint32Array),
            indices.length / 3, verts.length / 2);

        const gaps = [];
        for (let i = 0; i < dw * dh; i++) {
            if (dst.array[i * 4 + 3] === SENTINEL) gaps.push([i % dw, (i / dw) | 0]);
        }
        assert.equal(gaps.length, 0, `${gaps.length} unwritten pixels, e.g. ${JSON.stringify(gaps.slice(0, 5))}`);
    });

    test(`${tag}: warp sampling premultiplies, so a transparent neighbour adds no halo`, () => {
        // Two pixels: opaque white, and transparent *black*. Sampling
        // halfway must give half-covered white, not grey. Straight-alpha
        // interpolation returns grey and that is the halo bug.
        const sw = 2, sh = 1;
        const src = new Uint8Array([255, 255, 255, 255, 0, 0, 0, 0]);
        const dst = K.f32(4);
        // One pixel wide destination sampling the midpoint u = 0.5.
        K.warpMesh(mk(K, src, Uint8Array), sw, sh, dst, 1, 1,
            mk(K, [0, 0, 1, 0, 1, 1, 0, 1]),
            mk(K, [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]),
            mk(K, [0, 1, 2, 0, 2, 3], Uint32Array), 2, 4);
        const [r, , , a] = Array.from(dst.array);
        assert.ok(Math.abs(a - 0.5) < 0.01, `expected half coverage, got ${a}`);
        // Premultiplied: red should equal alpha for a white source.
        assert.ok(Math.abs(r - a) < 0.01,
            `halo: colour ${r} does not match coverage ${a}; taps were interpolated straight`);
    });

    test(`${tag}: regression -- blur does not darken the borders`, () => {
        // A box pass that treats outside the image as zero darkens every
        // edge, which on a full-frame glow reads as a vignette. The window
        // must divide by the samples actually inside it.
        const w = 24, h = 24, n = w * h * 4;
        const buf = K.f32(n);
        buf.array.fill(1);
        K.blurRgba(buf, K.f32(n), w, h, 6);
        let lowest = Infinity;
        for (let i = 0; i < n; i++) lowest = Math.min(lowest, buf.array[i]);
        assert.ok(lowest > 0.999, `blur darkened a border pixel to ${lowest}`);
    });

    test(`${tag}: blur at radius 0 is a no-op, and spreads a spike at radius 3`, () => {
        const w = 16, h = 16, n = w * h * 4;
        const buf = K.f32(n);
        buf.array[(8 * w + 8) * 4] = 1;
        const before = Float32Array.from(buf.array);
        K.blurRgba(buf, K.f32(n), w, h, 0);
        assert.ok(maxDiff(buf.array, before) === 0, 'radius 0 changed the buffer');

        K.blurRgba(buf, K.f32(n), w, h, 3);
        assert.ok(buf.array[(8 * w + 8) * 4] < 1, 'spike was not spread');
        assert.ok(buf.array[(8 * w + 10) * 4] > 0, 'blur did not reach a neighbour');
    });
}

// =====================================================================
// adjacency, which is pure JS and shared by both backends
// =====================================================================

test('adjacency: a two-triangle quad has the expected neighbours', () => {
    // 3---2      triangles (0,1,2) and (0,2,3)
    // |  /|      so 0 and 2 are joined by the shared diagonal
    // 0---1
    const { start, adj } = buildAdjacency([0, 1, 2, 0, 2, 3], 4);
    const of = (v) => Array.from(adj.slice(start[v], start[v + 1]));
    assert.deepEqual(of(0), [1, 2, 3]);
    assert.deepEqual(of(1), [0, 2]);
    assert.deepEqual(of(2), [0, 1, 3]);
    assert.deepEqual(of(3), [0, 2]);
});

test('adjacency: no self-loops and no duplicates', () => {
    const { positions, indices, count } = grid(9, 9);
    void positions;
    const { start, adj } = buildAdjacency(indices, count);
    for (let v = 0; v < count; v++) {
        const list = Array.from(adj.slice(start[v], start[v + 1]));
        assert.ok(!list.includes(v), `vertex ${v} is its own neighbour`);
        assert.equal(new Set(list).size, list.length, `vertex ${v} has duplicates`);
    }
});

test('adjacency: an interior vertex of a triangulated grid has six neighbours', () => {
    const { indices, count } = grid(9, 9);
    const { start } = buildAdjacency(indices, count);
    const interior = 4 * 9 + 4;
    assert.equal(start[interior + 1] - start[interior], 6);
});

test('adjacency: a degenerate triangle does not create a self-loop', () => {
    // The `n !== v` guard is unreachable with well-formed input -- an edge
    // joins two distinct vertices -- so a mutation removing it survived
    // the first audit. A collapsed triangle, which a sculpt or a bad
    // import really does produce, is what exercises it. A self-loop would
    // make Laplacian smoothing average a vertex partly against itself and
    // quietly reduce the smoothing strength.
    const { start, adj } = buildAdjacency([0, 0, 1, 1, 2, 0], 3);
    for (let v = 0; v < 3; v++) {
        const list = Array.from(adj.slice(start[v], start[v + 1]));
        assert.ok(!list.includes(v), `vertex ${v} is its own neighbour: ${list}`);
    }
});

test('adjacency: out-of-range indices are dropped, not crashed on', () => {
    const { start, adj } = buildAdjacency([0, 1, 2, 0, 1, 99], 3);
    assert.ok(start[3] <= adj.length);
    for (const n of adj) assert.ok(n < 3, `leaked index ${n}`);
});

// ---------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------

/** A triangulated `w` x `h` vertex grid in the XY plane. */
function grid(w, h) {
    const positions = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) positions.push(x, y, 0);
    const indices = [];
    for (let y = 0; y < h - 1; y++) {
        for (let x = 0; x < w - 1; x++) {
            const i = y * w + x;
            indices.push(i, i + 1, i + w + 1, i, i + w + 1, i + w);
        }
    }
    return {
        positions: Float32Array.from(positions),
        indices: Uint32Array.from(indices),
        count: w * h,
        tris: indices.length / 3,
    };
}

/** An opaque u8 RGBA test image with a deterministic pattern. */
function image(sw, sh) {
    const src = new Uint8Array(sw * sh * 4);
    for (let i = 0; i < sw * sh; i++) {
        src[i * 4] = (i * 7) & 255;
        src[i * 4 + 1] = (i * 13) & 255;
        src[i * 4 + 2] = (i * 29) & 255;
        src[i * 4 + 3] = 255;
    }
    return { src, sw, sh };
}

/** A `div` x `div` quad mesh covering `dw` x `dh`, mapped to the full source. */
function mesh(dw, dh, div) {
    const verts = [], uvs = [], indices = [];
    const n = div + 1;
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            verts.push((c / div) * dw, (r / div) * dh);
            uvs.push(c / div, r / div);
        }
    }
    for (let r = 0; r < div; r++) {
        for (let c = 0; c < div; c++) {
            const i = r * n + c;
            indices.push(i, i + 1, i + n + 1, i, i + n + 1, i + n);
        }
    }
    return {
        verts: Float32Array.from(verts),
        uvs: Float32Array.from(uvs),
        indices: Uint32Array.from(indices),
        tris: indices.length / 3,
        vcount: verts.length / 2,
    };
}
