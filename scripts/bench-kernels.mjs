/**
 * Measure the wasm kernels against the JS fallback.
 *
 *   npm run bench:kernels
 *
 * Every workload below is sized to something the engine actually does, so
 * the ratios mean something operationally rather than as a microbenchmark
 * score. Where a kernel turns out not to pay for itself, that is a finding
 * worth keeping, not a number to bury -- `docs/15-PERFORMANCE.md` records
 * both directions.
 *
 * Both backends run the same input through the same API. The JS path is
 * given a warm-up so it is measured JIT-compiled rather than interpreted,
 * which is the only fair comparison.
 */
import { loadKernels, buildAdjacency } from '../src/kernels/index.js';
import { loadParallelKernels, parallelAvailable } from '../src/kernels/parallel.js';

const WASM = await loadKernels({ prefer: 'wasm' });
const JS = await loadKernels({ prefer: 'js' });

/** Median of `runs` timed calls, after `warm` untimed ones. */
function timed(fn, runs = 9, warm = 3) {
    for (let i = 0; i < warm; i++) fn();
    const samples = [];
    for (let i = 0; i < runs; i++) {
        const t = process.hrtime.bigint();
        fn();
        samples.push(Number(process.hrtime.bigint() - t) / 1e6);
    }
    samples.sort((a, b) => a - b);
    return samples[samples.length >> 1];
}

function seeded(n, seed = 1) {
    const out = new Float32Array(n);
    let s = seed >>> 0;
    for (let i = 0; i < n; i++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        out[i] = (s / 4294967296) * 2 - 1;
    }
    return out;
}

function grid(w, h) {
    const positions = new Float32Array(w * h * 3);
    for (let y = 0, i = 0; y < h; y++) {
        for (let x = 0; x < w; x++, i++) {
            positions[i * 3] = x; positions[i * 3 + 1] = y;
        }
    }
    const indices = [];
    for (let y = 0; y < h - 1; y++) {
        for (let x = 0; x < w - 1; x++) {
            const i = y * w + x;
            indices.push(i, i + 1, i + w + 1, i, i + w + 1, i + w);
        }
    }
    return { positions, indices: Uint32Array.from(indices), count: w * h, tris: indices.length / 3 };
}

const cases = [];

// --- rigging: a character's body, every frame -------------------------
{
    const count = 20_000, bones = 64;
    const base = seeded(count * 3, 2);
    const idx = Uint32Array.from({ length: count * 4 }, (_, i) => (i * 7) % bones);
    const wgt = new Float32Array(count * 4).fill(0.25);
    const pal = new Float32Array(bones * 16);
    for (let b = 0; b < bones; b++) pal.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, b * 0.01, 0, 0, 1], b * 16);
    cases.push(['skin  20k verts / 64 bones', (K) => {
        const B = K.from(base), I = K.from(idx, Uint32Array), W = K.from(wgt);
        const P = K.from(pal), O = K.f32(count * 3);
        return () => K.skin(B, I, W, P, O, count, bones);
    }]);
}

// --- face: 24 blendshapes, three active, every frame ------------------
{
    const count = 6_000, shapes = 24;
    const base = seeded(count * 3, 3);
    const deltas = seeded(shapes * count * 3, 4);
    const weights = new Float32Array(shapes);
    weights[0] = 0.7; weights[4] = 0.3; weights[11] = 0.5;
    cases.push(['morph 6k verts / 24 shapes (3 active)', (K) => {
        const B = K.from(base), D = K.from(deltas), W = K.from(weights), O = K.f32(count * 3);
        return () => K.morph(B, D, W, O, count, shapes);
    }]);
    // The all-active case is the honest worst case, and shows what the
    // epsilon skip is actually buying.
    const allOn = new Float32Array(shapes).fill(0.2);
    cases.push(['morph 6k verts / 24 shapes (all active)', (K) => {
        const B = K.from(base), D = K.from(deltas), W = K.from(allOn), O = K.f32(count * 3);
        return () => K.morph(B, D, W, O, count, shapes);
    }]);
}

// --- normals and smoothing: after any deformation or sculpt stroke ----
{
    const g = grid(142, 142);                       // ~20k verts
    cases.push([`normals ${g.count} verts / ${g.tris} tris`, (K) => {
        const P = K.from(g.positions), I = K.from(g.indices, Uint32Array), O = K.f32(g.count * 3);
        return () => K.normals(P, I, O, g.count, g.tris);
    }]);
    const { start, adj } = buildAdjacency(g.indices, g.count);
    cases.push([`smooth ${g.count} verts, 1 iteration`, (K) => {
        const P = K.from(g.positions), S = K.from(start, Uint32Array);
        const A = K.from(adj, Uint32Array), O = K.f32(g.count * 3);
        return () => K.smooth(P, S, A, O, g.count, 0.5);
    }]);
}

// --- painting: one brush stroke at 1080p ------------------------------
{
    const w = 1920, h = 1080;
    const n = 600;
    const stamps = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
        stamps.set([200 + i * 2.4, 300 + Math.sin(i * 0.05) * 220, 24, 0.4], i * 4);
    }
    cases.push([`stampMask 600 stamps r24 @1080p`, (K) => {
        const M = K.f32(w * h), S = K.from(stamps);
        return () => { K.clearF32(M, w * h); K.stampMask(M, w, h, S, n, 0.5, 0); };
    }]);
    cases.push([`compositeMask @1080p`, (K) => {
        const D = K.f32(w * h * 4), M = K.f32(w * h);
        M.array.fill(0.5);
        return () => K.compositeMask(D, M, w, h, 0.8, 0.2, 0.1, 0.9, 0);
    }]);
}

// --- motion graphics: a photo warped to 1080p, and a glow -------------
{
    const sw = 1920, sh = 1080, dw = 1920, dh = 1080;
    const src = new Uint8Array(sw * sh * 4).fill(180);
    const div = 32, nn = div + 1;
    const verts = [], uvs = [], indices = [];
    for (let r = 0; r < nn; r++) {
        for (let c = 0; c < nn; c++) {
            verts.push((c / div) * dw, (r / div) * dh);
            uvs.push(c / div, r / div);
        }
    }
    for (let r = 0; r < div; r++) {
        for (let c = 0; c < div; c++) {
            const i = r * nn + c;
            indices.push(i, i + 1, i + nn + 1, i, i + nn + 1, i + nn);
        }
    }
    cases.push([`warpMesh 1080p, 32x32 grid`, (K) => {
        const S = K.from(src, Uint8Array), D = K.f32(dw * dh * 4);
        const V = K.from(Float32Array.from(verts)), U = K.from(Float32Array.from(uvs));
        const I = K.from(Uint32Array.from(indices), Uint32Array);
        return () => K.warpMesh(S, sw, sh, D, dw, dh, V, U, I, indices.length / 3, verts.length / 2);
    }]);
    cases.push([`blurRgba 1080p radius 16`, (K) => {
        const B = K.f32(dw * dh * 4), T = K.f32(dw * dh * 4);
        B.array.fill(0.5);
        return () => K.blurRgba(B, T, dw, dh, 16);
    }]);
    // The same operation at quarter resolution, which is how a glow or a
    // depth-map smooth should actually be run. Full resolution is
    // bandwidth-bound at ~4 GB/s and cannot fit a frame; this is included
    // to show that the kernel is fine and the call site was the problem.
    cases.push([`blurRgba 1080p/4 radius 4  (downsampled)`, (K) => {
        const qw = dw >> 2, qh = dh >> 2;
        const B = K.f32(qw * qh * 4), T = K.f32(qw * qh * 4);
        B.array.fill(0.5);
        return () => K.blurRgba(B, T, qw, qh, 4);
    }]);
}

console.log(`backend: wasm (simd128=${WASM.simd}) vs js\n`);
console.log('kernel'.padEnd(40), 'wasm ms'.padStart(9), 'js ms'.padStart(9), 'speedup'.padStart(8));
console.log('-'.repeat(69));

const results = [];
for (const [name, setup] of cases) {
    const w = timed(setup(WASM));
    const j = timed(setup(JS));
    results.push({ name, wasm: w, js: j, ratio: j / w });
    console.log(
        name.padEnd(40),
        w.toFixed(3).padStart(9),
        j.toFixed(3).padStart(9),
        `${(j / w).toFixed(2)}x`.padStart(8),
    );
}

console.log('-'.repeat(69));
const best = results.reduce((a, b) => (b.ratio > a.ratio ? b : a));
const worst = results.reduce((a, b) => (b.ratio < a.ratio ? b : a));
console.log(`best:  ${best.ratio.toFixed(2)}x  ${best.name.trim()}`);
console.log(`worst: ${worst.ratio.toFixed(2)}x  ${worst.name.trim()}`);
const frameBudget = 1000 / 24;
console.log(`\n24fps frame budget: ${frameBudget.toFixed(2)} ms`);
for (const r of results) {
    if (r.js > frameBudget && r.wasm <= frameBudget) {
        console.log(`  moved inside budget by wasm: ${r.name.trim()} (${r.js.toFixed(1)} -> ${r.wasm.toFixed(1)} ms)`);
    }
}

// =====================================================================
// The worker pool, on the kernels that do not fit a frame single-threaded
// =====================================================================

/** Median of `runs` timed async calls, after `warm` untimed ones. */
async function timedAsync(fn, runs = 7, warm = 2) {
    for (let i = 0; i < warm; i++) await fn();
    const samples = [];
    for (let i = 0; i < runs; i++) {
        const t = process.hrtime.bigint();
        await fn();
        samples.push(Number(process.hrtime.bigint() - t) / 1e6);
    }
    samples.sort((a, b) => a - b);
    return samples[samples.length >> 1];
}

if (!parallelAvailable()) {
    console.log('\nworker pool: unavailable (no SharedArrayBuffer).');
    console.log('In a browser this needs COOP/COEP -- run `npm run serve`.');
} else {
    const POOL = await loadParallelKernels({ minPixels: 0 });
    if (!POOL) {
        console.log('\nworker pool: could not be created.');
    } else {
        console.log(`\nworker pool: ${POOL.workerCount} workers, one shared memory, zero copies\n`);
        console.log('kernel'.padEnd(40), '1 thread'.padStart(10), 'pooled'.padStart(10), 'speedup'.padStart(8));
        console.log('-'.repeat(71));

        const dw = 1920, dh = 1080;
        const rows = [];

        // blur, full resolution -- the kernel that is 2.3x over budget.
        {
            const n = dw * dh * 4;
            const a = POOL.f32(n), t = POOL.f32(n);
            a.array.fill(0.5);
            const one = timed(() => POOL.serial.blurRgba(a, t, dw, dh, 16));
            const many = await timedAsync(() => POOL.blurRgba(a, t, dw, dh, 16));
            rows.push(['blurRgba 1080p radius 16', one, many]);
        }

        // warp, full resolution -- 2.1x over budget.
        {
            const src = POOL.u8(dw * dh * 4);
            src.array.fill(180);
            const dst = POOL.f32(dw * dh * 4);
            const div = 32, nn = div + 1;
            const verts = [], uvs = [], indices = [];
            for (let r = 0; r < nn; r++) {
                for (let c = 0; c < nn; c++) {
                    verts.push((c / div) * dw, (r / div) * dh);
                    uvs.push(c / div, r / div);
                }
            }
            for (let r = 0; r < div; r++) {
                for (let c = 0; c < div; c++) {
                    const i = r * nn + c;
                    indices.push(i, i + 1, i + nn + 1, i, i + nn + 1, i + nn);
                }
            }
            const V = POOL.from(Float32Array.from(verts));
            const U = POOL.from(Float32Array.from(uvs));
            const I = POOL.from(Uint32Array.from(indices), Uint32Array);
            const tris = indices.length / 3, vcount = verts.length / 2;
            const one = timed(() => POOL.serial.warpMesh(src, dw, dh, dst, dw, dh, V, U, I, tris, vcount));
            const many = await timedAsync(() => POOL.warpMesh(src, dw, dh, dst, dw, dh, V, U, I, tris, vcount));
            rows.push(['warpMesh 1080p, 32x32 grid', one, many]);
        }

        // composite and stamp, already inside budget -- included to show
        // where dispatch overhead stops being worth paying.
        {
            const n = dw * dh;
            const dst = POOL.f32(n * 4), mask = POOL.f32(n);
            mask.array.fill(0.5);
            const one = timed(() => POOL.serial.compositeMask(dst, mask, dw, dh, 0.8, 0.2, 0.1, 0.9, 0));
            const many = await timedAsync(() => POOL.compositeMask(dst, mask, dw, dh, 0.8, 0.2, 0.1, 0.9, 0));
            rows.push(['compositeMask 1080p', one, many]);
        }
        {
            const count = 600;
            const stamps = new Float32Array(count * 4);
            for (let i = 0; i < count; i++) {
                stamps.set([200 + i * 2.4, 300 + Math.sin(i * 0.05) * 220, 24, 0.4], i * 4);
            }
            const mask = POOL.f32(dw * dh), S = POOL.from(stamps);
            const one = timed(() => POOL.serial.stampMask(mask, dw, dh, S, count, 0.5, 0));
            const many = await timedAsync(() => POOL.stampMask(mask, dw, dh, S, count, 0.5, 0));
            rows.push(['stampMask 600 stamps r24 @1080p', one, many]);
        }

        for (const [name, one, many] of rows) {
            console.log(name.padEnd(40), one.toFixed(3).padStart(10),
                many.toFixed(3).padStart(10), `${(one / many).toFixed(2)}x`.padStart(8));
        }
        console.log('-'.repeat(71));
        console.log(`frame budget at 24fps: ${frameBudget.toFixed(2)} ms`);
        for (const [name, one, many] of rows) {
            const was = one > frameBudget ? 'OVER' : 'ok';
            const now = many > frameBudget ? 'OVER' : 'ok';
            if (was !== now) console.log(`  ${name}: ${was} -> ${now} (${one.toFixed(1)} -> ${many.toFixed(1)} ms)`);
        }
        await POOL.dispose();
    }
}
