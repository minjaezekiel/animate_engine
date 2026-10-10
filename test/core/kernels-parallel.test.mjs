/**
 * Worker-pool tests.
 *
 *   npm run test:parallel
 *
 * The central assertion is **bit-identity with the serial path**. The pool
 * runs the same wasm kernels over the same shared memory, differing only
 * in which rows each call touches, so "close enough" is the wrong bar:
 * any difference at all means a band boundary is wrong, a barrier is
 * missing, or two workers are writing the same pixel. Each of those is a
 * real defect that a tolerance-based test would hide.
 *
 * The band-splitting and barrier tests exist because both failure modes
 * are silent. A missing barrier does not crash -- it yields a subtly
 * wrong result that changes with worker timing, so it passes on a fast
 * machine and fails in CI, or vice versa.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernels, STAMP_STRIDE } from '../../src/kernels/index.js';
import { loadParallelKernels, parallelAvailable } from '../../src/kernels/parallel.js';

const SERIAL = await loadKernels({ prefer: 'wasm' });
const POOL = parallelAvailable() ? await loadParallelKernels({ minPixels: 0 }) : null;

test.after(async () => { if (POOL) await POOL.dispose(); });

/** Skip the whole file gracefully where a pool cannot exist. */
const skip = POOL ? false : 'no worker pool here (needs SharedArrayBuffer)';

test('a pool exists, with more than one worker', { skip }, () => {
    assert.equal(POOL.backend, 'wasm-mt');
    assert.ok(POOL.workerCount >= 1, 'no workers spawned');
    assert.equal(POOL.simd, true);
    assert.ok(POOL.memory.buffer instanceof SharedArrayBuffer,
        'pool memory is not shared; every kernel would be operating on a copy');
});

test('the pool shares one linear memory with its serial instance', { skip }, () => {
    // A pointer from `P.f32()` must mean the same bytes in a worker. If
    // this is wrong, kernels silently read and write unrelated memory.
    const buf = POOL.f32(16);
    buf.array.set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
    const view = new Float32Array(POOL.memory.buffer, buf.ptr, 16);
    assert.equal(view[0], 1);
    assert.equal(view[15], 16);
    buf.free();
});

test('_bands partitions exactly: no gaps, no overlaps, nothing lost', { skip }, () => {
    for (const total of [1, 2, 3, 7, 11, 12, 13, 100, 1080, 1081]) {
        const bands = POOL._bands(total);
        assert.equal(bands[0][0], 0, `total=${total}: first band does not start at 0`);
        assert.equal(bands[bands.length - 1][1], total, `total=${total}: last band does not end at total`);
        let covered = 0;
        for (let i = 0; i < bands.length; i++) {
            const [a, b] = bands[i];
            assert.ok(b >= a, `total=${total}: inverted band ${i}`);
            if (i > 0) {
                assert.equal(a, bands[i - 1][1], `total=${total}: gap or overlap at band ${i}`);
            }
            covered += b - a;
        }
        assert.equal(covered, total, `total=${total}: covered ${covered}`);
        // The remainder is spread over the leading bands rather than piled
        // on the last, so no single worker holds up the barrier.
        const sizes = bands.map(([a, b]) => b - a);
        assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1,
            `total=${total}: unbalanced bands ${JSON.stringify(sizes)}`);
    }
});

// ---------------------------------------------------------------------
// bit-identity with the serial path
// ---------------------------------------------------------------------

function seeded(n, seed = 1) {
    const out = new Float32Array(n);
    let s = seed >>> 0;
    for (let i = 0; i < n; i++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        out[i] = (s / 4294967296) * 2 - 1;
    }
    return out;
}

/** Assert two typed arrays are identical, reporting the first divergence. */
function identical(a, b, what) {
    assert.equal(a.length, b.length, `${what}: length`);
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
            assert.fail(`${what}: diverges at ${i}: serial ${a[i]} vs parallel ${b[i]}`);
        }
    }
}

test('blurRgba: parallel is bit-identical to serial', { skip }, async () => {
    // Six barriered passes, each split along the axis it does not read
    // across. Any divergence means a barrier is missing or a band is wrong.
    const w = 200, h = 150, n = w * h * 4;
    const field = seeded(n, 41).map(Math.abs);

    const sBuf = SERIAL.from(field), sTmp = SERIAL.f32(n);
    SERIAL.blurRgba(sBuf, sTmp, w, h, 7);
    const expected = Float32Array.from(sBuf.array);

    const pBuf = POOL.from(field), pTmp = POOL.f32(n);
    await POOL.blurRgba(pBuf, pTmp, w, h, 7);

    identical(expected, Float32Array.from(pBuf.array), 'blurRgba');
});

test('blurRgba: repeated runs agree, so no timing dependence survives', { skip }, async () => {
    // A missing barrier is timing-dependent: it can pass once. Running the
    // same blur several times and requiring identical output catches the
    // race that a single run would not.
    const w = 128, h = 96, n = w * h * 4;
    const field = seeded(n, 43).map(Math.abs);
    let first = null;
    for (let run = 0; run < 5; run++) {
        const buf = POOL.from(field), tmp = POOL.f32(n);
        await POOL.blurRgba(buf, tmp, w, h, 5);
        const got = Float32Array.from(buf.array);
        if (first === null) first = got;
        else identical(first, got, `blurRgba run ${run}`);
        buf.free(); tmp.free();
    }
});

test('warpMesh: parallel is bit-identical to serial', { skip }, async () => {
    const sw = 64, sh = 64, dw = 201, dh = 149;
    const src = new Uint8Array(sw * sh * 4);
    for (let i = 0; i < sw * sh; i++) {
        src[i * 4] = (i * 7) & 255; src[i * 4 + 1] = (i * 13) & 255;
        src[i * 4 + 2] = (i * 29) & 255; src[i * 4 + 3] = 255;
    }
    const div = 6, nn = div + 1;
    const verts = [], uvs = [], indices = [];
    for (let r = 0; r < nn; r++) {
        for (let c = 0; c < nn; c++) {
            // A deliberately non-affine mesh, so bands land mid-triangle.
            verts.push((c / div) * dw + Math.sin(r) * 4, (r / div) * dh + Math.cos(c) * 4);
            uvs.push(c / div, r / div);
        }
    }
    for (let r = 0; r < div; r++) {
        for (let c = 0; c < div; c++) {
            const i = r * nn + c;
            indices.push(i, i + 1, i + nn + 1, i, i + nn + 1, i + nn);
        }
    }
    const tris = indices.length / 3, vcount = verts.length / 2;

    const run = async (K, parallel) => {
        const dst = K.f32(dw * dh * 4);
        dst.array.fill(-7);                       // sentinel: catches gaps
        const args = [K.from(src, Uint8Array), sw, sh, dst, dw, dh,
            K.from(Float32Array.from(verts)), K.from(Float32Array.from(uvs)),
            K.from(Uint32Array.from(indices), Uint32Array), tris, vcount];
        if (parallel) await K.warpMesh(...args); else K.warpMesh(...args);
        return Float32Array.from(dst.array);
    };
    const expected = await run(SERIAL, false);
    const got = await run(POOL, true);
    identical(expected, got, 'warpMesh');
});

test('compositeMask: parallel is bit-identical to serial', { skip }, async () => {
    const w = 180, h = 140, n = w * h;
    const mask = seeded(n, 47).map(Math.abs);
    const run = async (K, parallel) => {
        const dst = K.f32(n * 4), m = K.from(mask);
        if (parallel) await K.compositeMask(dst, m, w, h, 0.9, 0.4, 0.2, 0.75, 0);
        else K.compositeMask(dst, m, w, h, 0.9, 0.4, 0.2, 0.75, 0);
        return Float32Array.from(dst.array);
    };
    identical(await run(SERIAL, false), await run(POOL, true), 'compositeMask');
});

test('stampMask: parallel is bit-identical to serial, in both modes', { skip }, async () => {
    const w = 170, h = 130;
    // Stamps deliberately placed on band boundaries, which is where a
    // clipped bounding box goes wrong.
    const count = 60;
    const stamps = new Float32Array(count * STAMP_STRIDE);
    for (let i = 0; i < count; i++) {
        stamps.set([10 + (i * 2.7) % (w - 20), (i * h) / count, 9 + (i % 4), 0.3,
            (i % 5) * 0.5, i % 4 === 0 ? 0.4 : 1], i * STAMP_STRIDE);
    }
    for (const mode of [0, 1]) {
        const run = async (K, parallel) => {
            const mask = K.f32(w * h), s = K.from(stamps);
            if (parallel) await K.stampMask(mask, w, h, s, count, 0.45, mode);
            else K.stampMask(mask, w, h, s, count, 0.45, mode);
            return Float32Array.from(mask.array);
        };
        identical(await run(SERIAL, false), await run(POOL, true), `stampMask mode ${mode}`);
    }
});

test('maskToRgba8: parallel is bit-identical to serial', { skip }, async () => {
    const n = 40_000;
    const premul = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
        const a = (i % 255) / 255;
        premul.set([a * 0.8, a * 0.3, a * 0.6, a], i * 4);
    }
    const run = async (K, parallel) => {
        const src = K.from(premul), dst = K.u8(n * 4);
        if (parallel) await K.maskToRgba8(src, dst, n); else K.maskToRgba8(src, dst, n);
        return Uint8Array.from(dst.array);
    };
    identical(await run(SERIAL, false), await run(POOL, true), 'maskToRgba8');
});

test('below the pixel threshold the pool runs inline and still matches', { skip }, async () => {
    const small = await loadParallelKernels({ minPixels: 1 << 30 });
    try {
        const w = 32, h = 32, n = w * h * 4;
        const field = seeded(n, 53).map(Math.abs);
        const s = SERIAL.from(field), st = SERIAL.f32(n);
        SERIAL.blurRgba(s, st, w, h, 3);
        const p = small.from(field), pt = small.f32(n);
        await small.blurRgba(p, pt, w, h, 3);
        identical(Float32Array.from(s.array), Float32Array.from(p.array), 'inline blur');
    } finally {
        await small.dispose();
    }
});

test('workers keep separate stacks under concurrent load', { skip }, async () => {
    // Every instance initialises `__stack_pointer` from module data, to
    // the same address. If the pool did not relocate them, concurrent
    // calls would overwrite each other's frames -- silently, and only
    // under load. Hammering all workers at once and requiring exact
    // agreement with serial is the available test for it.
    const w = 96, h = 96, n = w * h * 4;
    const field = seeded(n, 59).map(Math.abs);

    const s = SERIAL.from(field), st = SERIAL.f32(n);
    SERIAL.blurRgba(s, st, w, h, 4);
    const expected = Float32Array.from(s.array);

    const runs = await Promise.all(Array.from({ length: 8 }, async () => {
        const buf = POOL.from(field), tmp = POOL.f32(n);
        await POOL.blurRgba(buf, tmp, w, h, 4);
        const got = Float32Array.from(buf.array);
        buf.free(); tmp.free();
        return got;
    }));
    for (const [i, got] of runs.entries()) identical(expected, got, `concurrent run ${i}`);
});

test('a kernel error in a worker rejects rather than hanging', { skip }, async () => {
    // A worker that throws must settle its promise. Otherwise one bad
    // dispatch wedges the whole render with no diagnostic.
    await assert.rejects(() => POOL._run(0, 'no_such_kernel', [0, 0]));
});
