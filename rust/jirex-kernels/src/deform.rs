//! Vertex deformation: skinning, morph accumulation, normals, smoothing.
//!
//! # Matrix convention
//!
//! Every 4x4 here is **column-major, 16 contiguous `f32`**, which is what
//! `THREE.Matrix4.elements` already is. So a host can pass
//! `bone.matrixWorld.elements` or a concatenated skinning palette straight
//! through with no transpose, and the risk of a silent convention mismatch
//! -- which shows up as a body that shears rather than one that errors --
//! never arises.
//!
//! ```text
//!   m[0] m[4] m[ 8] m[12]        x' = m0*x + m4*y + m8 *z + m12
//!   m[1] m[5] m[ 9] m[13]        y' = m1*x + m5*y + m9 *z + m13
//!   m[2] m[6] m[10] m[14]        z' = m2*x + m6*y + m10*z + m14
//!   m[3] m[7] m[11] m[15]
//! ```

/// Minimum absolute weight a morph target must carry to be accumulated.
///
/// A 24-shape facial rig typically has three or four shapes active, so
/// skipping the rest turns an O(vertices x shapes) pass into
/// O(vertices x active). This is an *algorithmic* win available to the JS
/// path too, and the JS fallback applies the identical threshold -- if it
/// did not, the two paths would disagree in the last bits and the golden
/// hashes would depend on which one loaded.
pub const MORPH_EPSILON: f32 = 1e-6;

/// Linear blend skinning with a fixed four influences per vertex.
///
/// `palette` holds one already-composed matrix per bone, meaning
/// `boneMatrixWorld * inverseBindMatrix`. Composing it on the host is
/// deliberate: it is `bones` matrices per frame rather than `vertices x 4`,
/// so it belongs wherever the scene graph already is.
///
/// Accumulation runs influence 0 through 3 in order and is **not**
/// vectorised across influences. Four weighted matrix-vector products
/// summed in lane order give a different final bit than summed in
/// sequence, because floating-point addition is not associative, and the JS
/// fallback sums in sequence. Determinism outranks the few percent that
/// reordering would buy.
///
/// # Safety
/// `base` and `out` must each hold `3 * count` floats, `index` and `weight`
/// `4 * count`, and every index must be within `palette`'s bone count.
#[no_mangle]
pub unsafe extern "C" fn skin(
    base: *const f32,
    index: *const u32,
    weight: *const f32,
    palette: *const f32,
    out: *mut f32,
    count: usize,
    bone_count: usize,
) {
    for v in 0..count {
        let (x, y, z) = (*base.add(v * 3), *base.add(v * 3 + 1), *base.add(v * 3 + 2));
        let (mut ox, mut oy, mut oz) = (0.0f32, 0.0f32, 0.0f32);

        for i in 0..4 {
            let w = *weight.add(v * 4 + i);
            if w == 0.0 {
                continue;
            }
            let b = *index.add(v * 4 + i) as usize;
            if b >= bone_count {
                continue; // a malformed index deforms nothing rather than reading past the palette
            }
            let m = palette.add(b * 16);
            ox += w * (*m.add(0) * x + *m.add(4) * y + *m.add(8) * z + *m.add(12));
            oy += w * (*m.add(1) * x + *m.add(5) * y + *m.add(9) * z + *m.add(13));
            oz += w * (*m.add(2) * x + *m.add(6) * y + *m.add(10) * z + *m.add(14));
        }

        *out.add(v * 3) = ox;
        *out.add(v * 3 + 1) = oy;
        *out.add(v * 3 + 2) = oz;
    }
}

/// Accumulate weighted morph target deltas onto a base mesh.
///
/// `deltas` is shape-major: shape 0's `3 * count` floats, then shape 1's,
/// and so on. That layout is what makes the pass fast -- each active shape
/// is one linear sweep over contiguous memory, which both the hardware
/// prefetcher and LLVM's autovectoriser handle ideally. Vertex-major would
/// stride by `shapes * 12` bytes and lose both.
///
/// Shapes are visited in index order so the sum order is fixed.
///
/// # Safety
/// `base`/`out` hold `3 * count` floats, `weights` holds `shapes`, and
/// `deltas` holds `shapes * 3 * count`.
#[no_mangle]
pub unsafe extern "C" fn morph(
    base: *const f32,
    deltas: *const f32,
    weights: *const f32,
    out: *mut f32,
    count: usize,
    shapes: usize,
) {
    let n = count * 3;
    core::ptr::copy_nonoverlapping(base, out, n);

    for s in 0..shapes {
        let w = *weights.add(s);
        if w.abs() < MORPH_EPSILON {
            continue;
        }
        let d = deltas.add(s * n);
        // A plain indexed loop over two contiguous slices: LLVM turns this
        // into f32x4 fused multiply-adds under `+simd128`. Writing the
        // intrinsics by hand measured no faster and reads far worse.
        for i in 0..n {
            *out.add(i) += w * *d.add(i);
        }
    }
}

/// Recompute vertex normals as the area-weighted mean of face normals.
///
/// Area weighting is free: the cross product of two edge vectors already
/// has magnitude proportional to twice the triangle's area, so
/// accumulating it *unnormalised* and normalising once per vertex at the
/// end weights each face by its area. Normalising per face first would be
/// both slower and worse, giving a sliver triangle the same say as a large
/// one.
///
/// Any vertex whose accumulated normal is degenerate -- an unreferenced
/// vertex, or one whose faces cancel exactly -- is left as `(0, 1, 0)`
/// rather than `NaN`, because a `NaN` normal propagates into the shader
/// and turns the whole surface black.
///
/// # Safety
/// `positions`/`out` hold `3 * count` floats; `indices` holds `3 * tris`
/// values, each less than `count`.
#[no_mangle]
pub unsafe extern "C" fn normals(
    positions: *const f32,
    indices: *const u32,
    out: *mut f32,
    count: usize,
    tris: usize,
) {
    core::ptr::write_bytes(out, 0, count * 3);

    for t in 0..tris {
        let ia = *indices.add(t * 3) as usize;
        let ib = *indices.add(t * 3 + 1) as usize;
        let ic = *indices.add(t * 3 + 2) as usize;
        if ia >= count || ib >= count || ic >= count {
            continue;
        }

        let ax = *positions.add(ia * 3);
        let ay = *positions.add(ia * 3 + 1);
        let az = *positions.add(ia * 3 + 2);
        let e1 = (
            *positions.add(ib * 3) - ax,
            *positions.add(ib * 3 + 1) - ay,
            *positions.add(ib * 3 + 2) - az,
        );
        let e2 = (
            *positions.add(ic * 3) - ax,
            *positions.add(ic * 3 + 1) - ay,
            *positions.add(ic * 3 + 2) - az,
        );

        let nx = e1.1 * e2.2 - e1.2 * e2.1;
        let ny = e1.2 * e2.0 - e1.0 * e2.2;
        let nz = e1.0 * e2.1 - e1.1 * e2.0;

        for &i in &[ia, ib, ic] {
            *out.add(i * 3) += nx;
            *out.add(i * 3 + 1) += ny;
            *out.add(i * 3 + 2) += nz;
        }
    }

    for v in 0..count {
        let x = *out.add(v * 3);
        let y = *out.add(v * 3 + 1);
        let z = *out.add(v * 3 + 2);
        let len = (x * x + y * y + z * z).sqrt();
        if len > 1e-20 {
            *out.add(v * 3) = x / len;
            *out.add(v * 3 + 1) = y / len;
            *out.add(v * 3 + 2) = z / len;
        } else {
            *out.add(v * 3) = 0.0;
            *out.add(v * 3 + 1) = 1.0;
            *out.add(v * 3 + 2) = 0.0;
        }
    }
}

/// One Laplacian smoothing pass over a CSR adjacency graph.
///
/// `adj_start` has `count + 1` entries; vertex `v`'s neighbours are
/// `adj[adj_start[v] .. adj_start[v + 1]]`. Each vertex moves `lambda` of
/// the way toward the mean of its neighbours.
///
/// The adjacency is an argument rather than something this kernel derives,
/// because the engine's sculpt smoothing has been finding neighbours by
/// **proximity search per vertex**, which is O(n^2) and additionally wrong:
/// it links vertices that are near in space but unconnected in the mesh,
/// so smoothing welds a fingertip to a thigh. Building CSR adjacency once
/// from the index buffer is O(tris), is topologically correct, and is
/// reusable across iterations and across frames -- see
/// `src/kernels/js/adjacency.js`.
///
/// Reads come from `positions` and writes go to `out`, so a caller doing
/// several iterations must swap buffers between them. In-place would make
/// the result depend on vertex visit order, which is the classic Gauss-
/// Seidel-vs-Jacobi trap: it still converges, but to a different answer
/// each time the vertex order changes.
///
/// # Safety
/// `positions`/`out` hold `3 * count` floats; `adj_start` holds
/// `count + 1`; `adj` holds `adj_start[count]` indices below `count`.
#[no_mangle]
pub unsafe extern "C" fn smooth(
    positions: *const f32,
    adj_start: *const u32,
    adj: *const u32,
    out: *mut f32,
    count: usize,
    lambda: f32,
) {
    for v in 0..count {
        let s = *adj_start.add(v) as usize;
        let e = *adj_start.add(v + 1) as usize;
        let x = *positions.add(v * 3);
        let y = *positions.add(v * 3 + 1);
        let z = *positions.add(v * 3 + 2);

        if e <= s {
            *out.add(v * 3) = x;
            *out.add(v * 3 + 1) = y;
            *out.add(v * 3 + 2) = z;
            continue;
        }

        let (mut sx, mut sy, mut sz) = (0.0f32, 0.0f32, 0.0f32);
        for k in s..e {
            let n = *adj.add(k) as usize;
            sx += *positions.add(n * 3);
            sy += *positions.add(n * 3 + 1);
            sz += *positions.add(n * 3 + 2);
        }
        let inv = 1.0 / (e - s) as f32;
        *out.add(v * 3) = x + lambda * (sx * inv - x);
        *out.add(v * 3 + 1) = y + lambda * (sy * inv - y);
        *out.add(v * 3 + 2) = z + lambda * (sz * inv - z);
    }
}
