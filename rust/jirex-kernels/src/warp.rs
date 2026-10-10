//! Image resampling: a textured triangle rasteriser and a fast blur.
//!
//! # What this is for
//!
//! "Turn an uploaded picture into an animated video" reduces, in every
//! tool that does it well, to *deforming a textured mesh over time*:
//!
//! * **2.5D parallax** -- lay a grid over the photo, push each vertex by
//!   its depth times the camera's offset, and the foreground slides across
//!   the background. With a depth map this is the whole effect.
//! * **Puppet warp** -- pin some vertices, move others, and the picture
//!   bends.
//! * **Ken Burns** -- the degenerate case where the mesh stays a rectangle
//!   and only its corners move.
//!
//! One kernel covers all three, because all three are the same operation
//! with different vertex positions. The vertex positions themselves are
//! cheap polyline-and-grid arithmetic and stay in JS, where they are easy
//! to read and to animate as ordinary tracks; only the per-pixel sampling
//! comes here.
//!
//! # Why sampling premultiplies on read
//!
//! `ImageData` is **straight** (non-premultiplied) alpha. Bilinearly
//! filtering straight alpha is a standard and very visible bug: at the
//! edge of a cut-out, the fully transparent pixels just outside still
//! carry a colour -- usually black -- and interpolation mixes it in,
//! leaving a dark halo that survives every later composite. Premultiplying
//! the four taps *before* interpolating weights each one's colour by its
//! own coverage, which is the only way to get this right. Output is
//! therefore premultiplied f32 RGBA, matching the paint buffers in
//! `raster.rs` so the two compose without a conversion.

/// Sample a straight-alpha u8 RGBA image bilinearly, premultiplied.
///
/// Out-of-range coordinates clamp to the edge rather than wrap: a warp
/// that reaches past the picture should smear its border, not tile the
/// opposite side in, which reads as a glitch.
#[inline]
unsafe fn sample(src: *const u8, sw: usize, sh: usize, u: f32, v: f32) -> (f32, f32, f32, f32) {
    if sw == 0 || sh == 0 {
        return (0.0, 0.0, 0.0, 0.0);
    }
    // -0.5 puts the sample at the texel centre; without it every warp is
    // half a pixel off, which is invisible on one frame and reads as a
    // shimmer across a moving sequence.
    let fx = (u * sw as f32 - 0.5).clamp(0.0, (sw - 1) as f32);
    let fy = (v * sh as f32 - 0.5).clamp(0.0, (sh - 1) as f32);
    let x0 = fx.floor() as usize;
    let y0 = fy.floor() as usize;
    let x1 = (x0 + 1).min(sw - 1);
    let y1 = (y0 + 1).min(sh - 1);
    let tx = fx - x0 as f32;
    let ty = fy - y0 as f32;

    let tap = |x: usize, y: usize| -> (f32, f32, f32, f32) {
        let p = src.add((y * sw + x) * 4);
        let a = *p.add(3) as f32 * (1.0 / 255.0);
        let s = a * (1.0 / 255.0);
        (
            *p.add(0) as f32 * s,
            *p.add(1) as f32 * s,
            *p.add(2) as f32 * s,
            a,
        )
    };

    let c00 = tap(x0, y0);
    let c10 = tap(x1, y0);
    let c01 = tap(x0, y1);
    let c11 = tap(x1, y1);

    let w00 = (1.0 - tx) * (1.0 - ty);
    let w10 = tx * (1.0 - ty);
    let w01 = (1.0 - tx) * ty;
    let w11 = tx * ty;

    (
        c00.0 * w00 + c10.0 * w10 + c01.0 * w01 + c11.0 * w11,
        c00.1 * w00 + c10.1 * w10 + c01.1 * w01 + c11.1 * w11,
        c00.2 * w00 + c10.2 * w10 + c01.2 * w01 + c11.2 * w11,
        c00.3 * w00 + c10.3 * w10 + c01.3 * w01 + c11.3 * w11,
    )
}

/// Rasterise textured triangles from `src` into `dst`.
///
/// * `verts` -- `[x, y]` per vertex, in destination pixels.
/// * `uvs` -- `[u, v]` per vertex, 0..1 over the source.
/// * `indices` -- `3 * tris` vertex indices.
///
/// `dst` is premultiplied f32 RGBA and is **written, not blended**: a
/// vertex mesh covering the frame has every pixel decided exactly once, so
/// blending would only accumulate seams along shared edges. Callers
/// layering several warped images composite them afterwards.
///
/// # The fill rule, and why it is inclusive
///
/// Coverage is an inclusive `>= 0` test on all three winding-corrected
/// barycentrics. Two triangles sharing an edge therefore both claim the
/// pixels lying exactly on it.
///
/// For a *blending* rasteriser that would be a bug -- the shared edge
/// would composite twice and show as a bright seam. This one **writes**,
/// so a twice-covered pixel simply receives the same interpolated value
/// twice, and the duplicate costs a few wasted samples along each edge.
///
/// The alternative error is far worse and is the one worth engineering
/// against: an exclusive test on both sides leaves boundary pixels
/// *unwritten*, which is the single-pixel diagonal seam that runs across a
/// warped photo wherever its grid was subdivided. Inclusive-on-both
/// guarantees full coverage, and `test/core/kernels.test.mjs` asserts it
/// by rasterising a subdivided grid over a sentinel-filled buffer and
/// requiring that no pixel survives unwritten.
///
/// # The row range
///
/// `y0`/`y1` restrict rasterisation to rows `y0..y1`; pass `0, dh` for the
/// whole frame.
///
/// A band needs no halo, because each destination pixel is decided by the
/// one triangle covering it and depends on no neighbour. Workers each walk
/// the full triangle list and clip every bounding box to their own rows,
/// which costs one extra bbox test per triangle per worker -- negligible
/// against the per-pixel work, and far simpler than partitioning the mesh.
///
/// # Safety
/// `src` holds `4 * sw * sh` bytes, `dst` holds `4 * dw * dh` floats,
/// `verts`/`uvs` hold `2 * vcount`, `indices` holds `3 * tris`.
#[no_mangle]
pub unsafe extern "C" fn warp_mesh(
    src: *const u8,
    sw: usize,
    sh: usize,
    dst: *mut f32,
    dw: usize,
    dh: usize,
    verts: *const f32,
    uvs: *const f32,
    indices: *const u32,
    tris: usize,
    vcount: usize,
    y0: usize,
    y1: usize,
) {
    let band_lo = y0.min(dh);
    let band_hi = y1.min(dh);
    if band_lo >= band_hi {
        return;
    }
    for t in 0..tris {
        let i0 = *indices.add(t * 3) as usize;
        let i1 = *indices.add(t * 3 + 1) as usize;
        let i2 = *indices.add(t * 3 + 2) as usize;
        if i0 >= vcount || i1 >= vcount || i2 >= vcount {
            continue;
        }

        let (ax, ay) = (*verts.add(i0 * 2), *verts.add(i0 * 2 + 1));
        let (bx, by) = (*verts.add(i1 * 2), *verts.add(i1 * 2 + 1));
        let (cx, cy) = (*verts.add(i2 * 2), *verts.add(i2 * 2 + 1));

        let area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        if area.abs() < 1e-9 {
            continue; // degenerate: a collapsed grid cell contributes nothing
        }
        let inv_area = 1.0 / area;

        let x0 = ax.min(bx).min(cx).floor().max(0.0) as usize;
        let x1 = (ax.max(bx).max(cx).ceil() + 1.0).min(dw as f32).max(0.0) as usize;
        // The triangle's own row span, clipped to this worker's band.
        let ty0 = (ay.min(by).min(cy).floor().max(0.0) as usize).max(band_lo);
        let ty1 = (((ay.max(by).max(cy).ceil() + 1.0).min(dh as f32).max(0.0)) as usize).min(band_hi);
        if ty0 >= ty1 {
            continue;
        }

        let (au, av) = (*uvs.add(i0 * 2), *uvs.add(i0 * 2 + 1));
        let (bu, bv) = (*uvs.add(i1 * 2), *uvs.add(i1 * 2 + 1));
        let (cu, cv) = (*uvs.add(i2 * 2), *uvs.add(i2 * 2 + 1));

        for y in ty0..ty1 {
            let py = y as f32 + 0.5;
            for x in x0..x1 {
                let px = x as f32 + 0.5;

                // Barycentrics, normalised by the signed area so the test
                // is winding-independent -- an animated mesh can flip a
                // cell inside out mid-shot and must keep rasterising.
                let w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) * inv_area;
                let w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) * inv_area;
                let w2 = 1.0 - w0 - w1;
                if w0 < 0.0 || w1 < 0.0 || w2 < 0.0 {
                    continue;
                }

                let u = au * w0 + bu * w1 + cu * w2;
                let v = av * w0 + bv * w1 + cv * w2;
                let (r, g, b, a) = sample(src, sw, sh, u, v);

                let p = dst.add((y * dw + x) * 4);
                *p.add(0) = r;
                *p.add(1) = g;
                *p.add(2) = b;
                *p.add(3) = a;
            }
        }
    }
}

/// The largest blur radius accepted.
///
/// Bounded so the reciprocal table can live on the stack rather than the
/// heap. That matters for more than tidiness: under the multi-threaded
/// build several wasm instances share one linear memory and one allocator,
/// and a kernel that allocates while running on a worker is a kernel that
/// contends on the allocator lock on every call. Every kernel here is
/// therefore allocation-free, and `blur_pass` is the only one that ever
/// wanted otherwise.
///
/// 256 is far past useful: three box passes at radius 256 already reach
/// roughly 1,500 pixels of visible spread.
pub const MAX_BLUR_RADIUS: usize = 256;

/// Three box passes over premultiplied f32 RGBA, approximating a Gaussian.
///
/// `scratch` must be the same size as `buf`; the passes ping-pong between
/// them and the result always lands back in `buf`.
///
/// # Why box passes rather than a Gaussian kernel
///
/// A true Gaussian costs `2 * radius` multiply-adds per pixel per axis. A
/// box blur done with a running sum costs **two adds per pixel regardless
/// of radius**, and three box passes converge on a Gaussian closely enough
/// that the difference is not visible in motion -- this is the standard
/// result behind every real-time blur, and it is why a 200px glow costs
/// the same as a 4px one here.
///
/// Both uses in this engine need that property:
///
/// * depth maps from monocular estimation are noisy, and parallax tears
///   visibly along any depth discontinuity that is one pixel wide, so the
///   map must be smoothed before it displaces anything;
/// * glow and depth-of-field want a large radius cheaply.
///
/// This is the single-threaded convenience form, running all six passes.
/// A worker pool calls [`blur_pass`] instead, so it can place a barrier
/// between passes -- see that function for why a barrier is required.
///
/// # Safety
/// `buf` and `scratch` each hold `4 * w * h` floats.
#[no_mangle]
pub unsafe extern "C" fn blur_rgba(
    buf: *mut f32,
    scratch: *mut f32,
    w: usize,
    h: usize,
    radius: usize,
) {
    if radius == 0 || w == 0 || h == 0 {
        return;
    }
    let radius = radius.min(MAX_BLUR_RADIUS);
    let n = w * h * 4;
    let a = core::slice::from_raw_parts_mut(buf, n);
    let b = core::slice::from_raw_parts_mut(scratch, n);
    let recip = reciprocals(radius);
    for _ in 0..3 {
        blur_axis(a, b, w, h, radius, true, 0, h, &recip);
        blur_axis(b, a, w, h, radius, false, 0, w, &recip);
    }
}

/// One axis pass of the blur, over a range of lines.
///
/// `horizontal` chooses the axis. `begin`/`end` index the *perpendicular*
/// axis -- rows for a horizontal pass, columns for a vertical one -- so a
/// worker pool splits each pass along whichever axis the pass does not
/// read across.
///
/// That is what makes this parallel without any halo: a horizontal pass
/// reads and writes only within one row, so rows are independent; a
/// vertical pass likewise for columns. No worker ever needs a neighbour's
/// output *within* a pass.
///
/// **But it does between passes.** A vertical pass reads what the
/// horizontal pass wrote, across rows. So the caller must run every worker
/// to completion on pass *k* before any worker starts pass *k + 1*. Six
/// barriers for a full blur. Skipping them does not crash -- it produces a
/// subtly wrong, non-deterministic result that varies with worker timing,
/// which is the worst failure mode available.
///
/// Results alternate buffers: pass 0 reads `src` and writes `dst`, pass 1
/// swaps them, and so on, exactly as [`blur_rgba`] does.
///
/// # Safety
/// `src` and `dst` each hold `4 * w * h` floats and must not overlap.
#[no_mangle]
pub unsafe extern "C" fn blur_pass(
    src: *const f32,
    dst: *mut f32,
    w: usize,
    h: usize,
    radius: usize,
    horizontal: i32,
    begin: usize,
    end: usize,
) {
    if radius == 0 || w == 0 || h == 0 || begin >= end {
        return;
    }
    let radius = radius.min(MAX_BLUR_RADIUS);
    let n = w * h * 4;
    let a = core::slice::from_raw_parts(src, n);
    let b = core::slice::from_raw_parts_mut(dst, n);
    let recip = reciprocals(radius);
    blur_axis(a, b, w, h, radius, horizontal != 0, begin, end, &recip);
}

/// `1 / n` for every window size a sweep at this radius can see.
///
/// The window grows from `radius + 1` at the start of a line to
/// `2 * radius + 1` in the middle and back, so indices `0..=2*radius+1`
/// cover it; index 0 is never read because the window always holds at
/// least one sample. A fixed-size array keeps this off the heap -- see
/// [`MAX_BLUR_RADIUS`].
#[inline]
fn reciprocals(radius: usize) -> [f32; MAX_BLUR_RADIUS * 2 + 2] {
    let mut table = [0.0f32; MAX_BLUR_RADIUS * 2 + 2];
    for (i, r) in table.iter_mut().enumerate().skip(1).take(2 * radius + 1) {
        *r = 1.0 / i as f32;
    }
    table
}

/// One running-sum box pass along a single axis.
///
/// The window clamps at the edges and divides by the number of samples
/// actually inside it, which keeps edge pixels at their own brightness. The
/// usual alternative -- treating outside as zero -- darkens every border,
/// and on a full-frame glow that reads as a vignette nobody asked for.
///
/// # What this pass is actually limited by
///
/// Measured at 1080p with radius 16: **100 ms, which is 4.0 GB/s of
/// memory traffic.** Six passes over a 33 MB buffer, read and written, is
/// 398 MB; at that size the sweep is bandwidth-bound and not
/// compute-bound. Three separate attempts to make it faster confirmed it:
///
/// | variant | time |
/// |---|---|
/// | raw pointers | 98 ms |
/// | checked slice indexing | 143 ms |
/// | slices + `get_unchecked` + reciprocal table | 100 ms |
///
/// So neither aliasing information nor the removed per-pixel divide moved
/// the number, because neither was the constraint. **Nothing written
/// inside this function will make a full-resolution 1080p blur fit a
/// 41.67 ms frame.**
///
/// The fix is at the call site and it is the standard one: blur a
/// downsampled copy. A quarter-resolution blur touches one sixteenth the
/// pixels, lands near 6 ms, and for a glow or a depth-map smooth is
/// visually indistinguishable -- the whole point of the operation is to
/// destroy detail. `docs/15-PERFORMANCE.md` records this as the governing
/// rule for every per-pixel kernel here.
///
/// The form kept below is the slice-plus-`get_unchecked` one. It ties the
/// raw-pointer version rather than beating it, and is preferred for being
/// bounds-correct by construction at the one `unsafe` boundary, with the
/// reciprocal table kept because it is free and removes a divide from a
/// hot loop on principle.
#[inline]
fn blur_axis(
    src: &[f32],
    dst: &mut [f32],
    w: usize,
    h: usize,
    radius: usize,
    horizontal: bool,
    begin: usize,
    end: usize,
    recip: &[f32],
) {
    let (outer, inner, stride) = if horizontal { (h, w, 1usize) } else { (w, h, w) };
    let lo = begin.min(outer);
    let hi = end.min(outer);

    for o in lo..hi {
        let base = if horizontal { o * w } else { o };
        let mut sum = [0.0f32; 4];
        let mut n = 0usize;

        unsafe {
            for i in 0..=radius.min(inner - 1) {
                let p = (base + i * stride) * 4;
                for c in 0..4 {
                    sum[c] += *src.get_unchecked(p + c);
                }
                n += 1;
            }

            for i in 0..inner {
                let q = (base + i * stride) * 4;
                let inv = *recip.get_unchecked(n);
                for c in 0..4 {
                    *dst.get_unchecked_mut(q + c) = sum[c] * inv;
                }

                // Add entering, then drop leaving: adding first keeps `n`
                // from reaching zero on a one-pixel-wide image.
                let enter = i + radius + 1;
                if enter < inner {
                    let p = (base + enter * stride) * 4;
                    for c in 0..4 {
                        sum[c] += *src.get_unchecked(p + c);
                    }
                    n += 1;
                }
                if i >= radius {
                    let p = (base + (i - radius) * stride) * 4;
                    for c in 0..4 {
                        sum[c] -= *src.get_unchecked(p + c);
                    }
                    n -= 1;
                }
            }
        }
    }
}
