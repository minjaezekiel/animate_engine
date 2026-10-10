//! Filling a hole in an image: the push-pull pyramid.
//!
//! # What the hole is
//!
//! Parallax over a torn mesh (see `warp.rs` and `core/motion/PhotoMotion.js`)
//! slides a near object across its background and uncovers pixels that were
//! never photographed. Something has to go there. The options, in order of
//! cost:
//!
//! 1. **Mirror the background strip forward.** Nearly free, and what this
//!    engine did first. It leaves a seam where the mirrored patch meets the
//!    real one, and the patch is visibly a reflection of itself.
//! 2. **Diffuse inward** -- solve Laplace's equation over the hole. Seamless
//!    and perfectly smooth, which is exactly the problem: a textured
//!    background turns to a flat smear, and the smear is large because a
//!    disocclusion band runs the whole length of a silhouette.
//! 3. **Push-pull** (this file). Builds a weighted pyramid of what *is*
//!    known and pushes it back down, so a hole is filled with the colour of
//!    its surroundings at whatever scale the hole demands: fine detail near
//!    the edge, coarse structure in the middle. Linear time, no iteration
//!    count to tune, and it degrades gracefully as the hole grows.
//! 4. **Exemplar synthesis** (PatchMatch) or a generative model. Better
//!    again, and both an order of magnitude more code and time. Named as the
//!    upgrade path rather than attempted.
//!
//! Push-pull is the right rung here because of *where* the fill is seen. The
//! plate is built once, with the whole foreground removed, but only the first
//! few percent of the frame past the silhouette is ever revealed. That band
//! is surrounded by real background on one side, which is precisely where
//! push-pull is at its best; the blurry middle of the hole sits behind the
//! subject forever.
//!
//! # The algorithm
//!
//! Every pixel carries a colour and a **weight**: how much real,
//! photographed colour went into it. Known pixels start at weight 1 and
//! holes at 0.
//!
//! *Pull* (fine to coarse): a parent is the sum of its four children's
//! weighted colours and of their weights. A parent over a region that is
//! half hole therefore has half the weight and the average of the half that
//! was real -- no hole colour leaks in, because a hole contributes nothing
//! rather than contributing black.
//!
//! *Push* (coarse to fine): a pixel with full coverage keeps its own colour.
//! One with partial coverage mixes its own with its parent's in proportion to
//! that coverage. One with none takes its parent's outright. Writing the
//! result back at full weight means the next finer level sees a complete
//! image, so the fill cascades down and arrives at level 0 continuous with
//! the real pixels around it.
//!
//! # Why the weight has to be separate from alpha
//!
//! The obvious shortcut is to reuse the alpha channel as the weight. It
//! fails on anything with real transparency: a photograph cut out against
//! nothing has alpha 0 over genuinely empty regions, which the pyramid would
//! then try to fill, and a semi-transparent pixel would count as a partly
//! missing one. The mask is a separate input for the same reason a layer
//! mask in `blend.rs` is separate from the layer's own alpha.

/// Deepest pyramid level. 1x1 is reached long before this at any sane size;
/// the bound exists so the offset table can live on the stack.
const MAX_LEVELS: usize = 20;

/// Floats of scratch each pixel of each level needs: RGBA plus the weight.
pub const INPAINT_STRIDE: usize = 5;

/// Scratch floats needed to inpaint a `w` by `h` image.
///
/// Exported so the caller can size one buffer exactly rather than guessing
/// at the pyramid's 4/3 and being wrong by a row.
#[no_mangle]
pub extern "C" fn inpaint_scratch(w: usize, h: usize) -> usize {
    let mut total = 0;
    let (mut lw, mut lh) = (w.max(1), h.max(1));
    loop {
        total += lw * lh * INPAINT_STRIDE;
        if lw == 1 && lh == 1 {
            break;
        }
        lw = (lw / 2).max(1);
        lh = (lh / 2).max(1);
    }
    total
}

/// Fill the masked pixels of a premultiplied f32 RGBA image.
///
/// * `img`     premultiplied f32 RGBA, modified in place. Only masked
///             pixels are written; everything else is left bit-identical,
///             so this is safe to run over a plate that is mostly real.
/// * `mask`    one float per pixel: `> 0.5` means "this is a hole".
/// * `scratch` at least [`inpaint_scratch`] floats. Caller-owned, because
///             every kernel here is allocation-free: under the threaded
///             build several instances share one allocator, and a kernel
///             that allocates while running contends on its lock.
///
/// # Safety
///
/// Raw pointers from the host. `img` and `mask` must each cover `w * h`
/// pixels and `scratch` must be at least [`inpaint_scratch`] long.
#[no_mangle]
pub unsafe extern "C" fn inpaint_push_pull(
    img: *mut f32,
    mask: *const f32,
    w: usize,
    h: usize,
    scratch: *mut f32,
) {
    if w == 0 || h == 0 {
        return;
    }

    // Level geometry, computed once. The offsets are into `scratch`.
    let mut dims = [(0usize, 0usize); MAX_LEVELS];
    let mut offsets = [0usize; MAX_LEVELS];
    let mut levels = 0;
    let (mut lw, mut lh) = (w, h);
    let mut cursor = 0;
    while levels < MAX_LEVELS {
        dims[levels] = (lw, lh);
        offsets[levels] = cursor;
        cursor += lw * lh * INPAINT_STRIDE;
        levels += 1;
        if lw == 1 && lh == 1 {
            break;
        }
        lw = (lw / 2).max(1);
        lh = (lh / 2).max(1);
    }

    // --- level 0: known pixels enter at weight 1, holes at weight 0.
    //
    // The colour is stored already multiplied by the weight, so a sum is a
    // weighted sum with no second pass.
    let base = scratch.add(offsets[0]);
    for i in 0..w * h {
        let hole = *mask.add(i) > 0.5;
        let s = base.add(i * INPAINT_STRIDE);
        if hole {
            for c in 0..INPAINT_STRIDE {
                *s.add(c) = 0.0;
            }
        } else {
            let p = img.add(i * 4);
            *s.add(0) = *p.add(0);
            *s.add(1) = *p.add(1);
            *s.add(2) = *p.add(2);
            *s.add(3) = *p.add(3);
            *s.add(4) = 1.0;
        }
    }

    // --- pull: a parent is the sum of its children, weights included.
    for l in 1..levels {
        let (pw, ph) = dims[l];
        let (cw, ch) = dims[l - 1];
        let parent = scratch.add(offsets[l]);
        let child = scratch.add(offsets[l - 1]);
        for y in 0..ph {
            for x in 0..pw {
                let mut acc = [0.0f32; INPAINT_STRIDE];
                // 2x2, clamped: an odd dimension leaves a last row or column
                // with one child instead of two, and clamping counts it once
                // rather than counting a neighbour twice.
                for dy in 0..2 {
                    let sy = y * 2 + dy;
                    if sy >= ch {
                        continue;
                    }
                    for dx in 0..2 {
                        let sx = x * 2 + dx;
                        if sx >= cw {
                            continue;
                        }
                        let s = child.add((sy * cw + sx) * INPAINT_STRIDE);
                        for c in 0..INPAINT_STRIDE {
                            acc[c] += *s.add(c);
                        }
                    }
                }
                let p = parent.add((y * pw + x) * INPAINT_STRIDE);
                for c in 0..INPAINT_STRIDE {
                    *p.add(c) = acc[c];
                }
            }
        }
    }

    // --- push: coarse to fine, each level completed from the one above it.
    for l in (0..levels.saturating_sub(1)).rev() {
        let (cw, ch) = dims[l];
        let (pw, ph) = dims[l + 1];
        let fine = scratch.add(offsets[l]);
        let coarse = scratch.add(offsets[l + 1]);
        // Full coverage at this level: every level-0 pixel under it was real.
        let full = (1usize << l) as f32 * (1usize << l) as f32;
        for y in 0..ch {
            for x in 0..cw {
                let f = fine.add((y * cw + x) * INPAINT_STRIDE);
                let weight = *f.add(4);
                let coverage = (weight / full).min(1.0);
                if coverage >= 1.0 {
                    continue; // real, in full: nothing to take from above
                }

                let px = (x / 2).min(pw - 1);
                let py = (y / 2).min(ph - 1);
                let p = coarse.add((py * pw + px) * INPAINT_STRIDE);
                let pweight = *p.add(4);
                if pweight <= 0.0 {
                    continue; // nothing known anywhere above either
                }

                for c in 0..4 {
                    // `own` is the weighted sum divided by its own weight;
                    // `up` likewise. Mixing by coverage rather than
                    // replacing keeps a half-known pixel half its own,
                    // which is what stops a visible step at the hole's edge.
                    let own = if weight > 0.0 { *f.add(c) / weight } else { 0.0 };
                    let up = *p.add(c) / pweight;
                    let v = own * coverage + up * (1.0 - coverage);
                    // Written back at full weight: the next finer level must
                    // see a complete image or the fill stops cascading.
                    *f.add(c) = v * full;
                }
                *f.add(4) = full;
            }
        }
    }

    // --- write back, holes only.
    for i in 0..w * h {
        if *mask.add(i) <= 0.5 {
            continue;
        }
        let s = base.add(i * INPAINT_STRIDE);
        let weight = *s.add(4);
        let p = img.add(i * 4);
        if weight <= 0.0 {
            // The whole image was a hole. Transparent black is the only
            // honest answer, and it is what the caller started with.
            for c in 0..4 {
                *p.add(c) = 0.0;
            }
            continue;
        }
        for c in 0..4 {
            *p.add(c) = *s.add(c) / weight;
        }
    }
}
