/**
 * Deformation kernels in JavaScript.
 *
 * These are the fallback for an engine without WebAssembly, and they are
 * also the reference: `test/core/kernels.test.mjs` runs both backends over
 * the same inputs and asserts they agree. Keeping them a line-by-line
 * mirror of `rust/jirex-kernels/src/deform.rs` is the point -- when a
 * kernel's behaviour is in question, the readable version is here and the
 * fast version is there, and a divergence is a test failure rather than a
 * mystery.
 *
 * Every function takes the same arguments in the same order as its Rust
 * twin, and reads buffers through `.array` so it works against either
 * kernel-memory or plain typed arrays.
 *
 * Note the precision difference, which is expected and not a bug: JS has
 * no f32 arithmetic, so intermediates here are f64 and these results are
 * marginally *more* accurate than the wasm ones. See the determinism notes
 * in `lib.rs`.
 */

/** Must match `MORPH_EPSILON` in deform.rs, or the two paths skip different shapes. */
export const MORPH_EPSILON = 1e-6;

/**
 * Linear blend skinning, four influences per vertex.
 *
 * `palette` holds `boneMatrixWorld * inverseBindMatrix` per bone, as
 * column-major 4x4 -- exactly `THREE.Matrix4.elements`, so no transpose.
 *
 * The four influences are summed in index order to match the Rust, which
 * deliberately does not vectorise across them.
 */
export function skin(base, index, weight, palette, out, count, boneCount) {
    const B = base.array, I = index.array, W = weight.array;
    const P = palette.array, O = out.array;

    for (let v = 0; v < count; v++) {
        const x = B[v * 3], y = B[v * 3 + 1], z = B[v * 3 + 2];
        let ox = 0, oy = 0, oz = 0;

        for (let i = 0; i < 4; i++) {
            const w = W[v * 4 + i];
            if (w === 0) continue;
            const b = I[v * 4 + i];
            if (b >= boneCount) continue;      // malformed index deforms nothing
            const m = b * 16;
            ox += w * (P[m] * x + P[m + 4] * y + P[m + 8] * z + P[m + 12]);
            oy += w * (P[m + 1] * x + P[m + 5] * y + P[m + 9] * z + P[m + 13]);
            oz += w * (P[m + 2] * x + P[m + 6] * y + P[m + 10] * z + P[m + 14]);
        }

        O[v * 3] = ox; O[v * 3 + 1] = oy; O[v * 3 + 2] = oz;
    }
}

/**
 * Accumulate weighted morph deltas onto a base mesh.
 *
 * `deltas` is shape-major: all of shape 0, then all of shape 1. Shapes
 * whose weight is below `MORPH_EPSILON` are skipped, which is where the
 * speed comes from -- a 24-shape face usually has three or four active.
 */
export function morph(base, deltas, weights, out, count, shapes) {
    const n = count * 3;
    const D = deltas.array, Wt = weights.array, O = out.array;
    O.set(base.array.subarray(0, n));

    for (let s = 0; s < shapes; s++) {
        const w = Wt[s];
        if (Math.abs(w) < MORPH_EPSILON) continue;
        const off = s * n;
        for (let i = 0; i < n; i++) O[i] += w * D[off + i];
    }
}

/**
 * Area-weighted vertex normals.
 *
 * Face normals are accumulated unnormalised, so each contributes in
 * proportion to twice its triangle's area, and normalisation happens once
 * per vertex at the end. Degenerate vertices become `(0, 1, 0)` rather
 * than NaN -- a NaN normal reaches the shader and blackens the surface.
 */
export function normals(positions, indices, out, count, tris) {
    const P = positions.array, I = indices.array, O = out.array;
    O.fill(0, 0, count * 3);

    for (let t = 0; t < tris; t++) {
        const ia = I[t * 3], ib = I[t * 3 + 1], ic = I[t * 3 + 2];
        if (ia >= count || ib >= count || ic >= count) continue;

        const ax = P[ia * 3], ay = P[ia * 3 + 1], az = P[ia * 3 + 2];
        const e1x = P[ib * 3] - ax, e1y = P[ib * 3 + 1] - ay, e1z = P[ib * 3 + 2] - az;
        const e2x = P[ic * 3] - ax, e2y = P[ic * 3 + 1] - ay, e2z = P[ic * 3 + 2] - az;

        const nx = e1y * e2z - e1z * e2y;
        const ny = e1z * e2x - e1x * e2z;
        const nz = e1x * e2y - e1y * e2x;

        O[ia * 3] += nx; O[ia * 3 + 1] += ny; O[ia * 3 + 2] += nz;
        O[ib * 3] += nx; O[ib * 3 + 1] += ny; O[ib * 3 + 2] += nz;
        O[ic * 3] += nx; O[ic * 3 + 1] += ny; O[ic * 3 + 2] += nz;
    }

    for (let v = 0; v < count; v++) {
        const x = O[v * 3], y = O[v * 3 + 1], z = O[v * 3 + 2];
        const len = Math.sqrt(x * x + y * y + z * z);
        if (len > 1e-20) {
            O[v * 3] = x / len; O[v * 3 + 1] = y / len; O[v * 3 + 2] = z / len;
        } else {
            O[v * 3] = 0; O[v * 3 + 1] = 1; O[v * 3 + 2] = 0;
        }
    }
}

/**
 * One Laplacian smoothing pass over CSR adjacency.
 *
 * Reads `positions`, writes `out`; a caller running several iterations
 * swaps the buffers between them. In place would make the result depend on
 * vertex visit order.
 *
 * The adjacency comes from `buildAdjacency` in `../adjacency.js` and is
 * built from the index buffer, not from proximity -- see that file for why
 * that distinction is the whole point of this kernel.
 */
export function smooth(positions, adjStart, adj, out, count, lambda) {
    const P = positions.array, S = adjStart.array, A = adj.array, O = out.array;

    for (let v = 0; v < count; v++) {
        const s = S[v], e = S[v + 1];
        const x = P[v * 3], y = P[v * 3 + 1], z = P[v * 3 + 2];

        if (e <= s) {
            O[v * 3] = x; O[v * 3 + 1] = y; O[v * 3 + 2] = z;
            continue;
        }

        let sx = 0, sy = 0, sz = 0;
        for (let k = s; k < e; k++) {
            const n = A[k];
            sx += P[n * 3]; sy += P[n * 3 + 1]; sz += P[n * 3 + 2];
        }
        const inv = 1 / (e - s);
        O[v * 3] = x + lambda * (sx * inv - x);
        O[v * 3 + 1] = y + lambda * (sy * inv - y);
        O[v * 3 + 2] = z + lambda * (sz * inv - z);
    }
}
