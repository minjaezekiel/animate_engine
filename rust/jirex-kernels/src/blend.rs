//! Layer compositing: separable blend modes over premultiplied RGBA.
//!
//! # The formula, and the one trap in it
//!
//! From the W3C Compositing and Blending specification, a source composited
//! over a backdrop with blend function `B`:
//!
//! ```text
//!   co = (1 - ab)·cs + (1 - as)·cb + as·ab·B(Cb, Cs)
//!   ao = as + ab·(1 - as)
//! ```
//!
//! Lowercase `cs`/`cb`/`co` are **premultiplied**; uppercase `Cs`/`Cb` are
//! **straight**. That mismatch is the trap: `B` is defined on straight
//! colour, so a premultiplied buffer has to un-divide before calling it and
//! the result is folded back in premultiplied. Applying `B` directly to
//! premultiplied values silently weights each colour by its own coverage,
//! which drags every blend toward black wherever either layer is partly
//! transparent -- and it looks almost right at full opacity, so it survives
//! casual inspection.
//!
//! Sanity check with `B(Cb, Cs) = Cs` (normal):
//! `co = (1-ab)·cs + (1-as)·cb + ab·cs = cs + (1-as)·cb`, which is exactly
//! Porter-Duff source-over. So the general path reduces to the common one.

/// Blend modes, matching the W3C names and numbering used by the host.
///
/// Only *separable* modes are here -- those that operate on each channel
/// independently. The non-separable four (hue, saturation, colour,
/// luminosity) need the whole colour at once plus a luminance model, and
/// no caller has asked for them.
pub const NORMAL: i32 = 0;
pub const MULTIPLY: i32 = 1;
pub const SCREEN: i32 = 2;
pub const OVERLAY: i32 = 3;
pub const DARKEN: i32 = 4;
pub const LIGHTEN: i32 = 5;
pub const COLOR_DODGE: i32 = 6;
pub const COLOR_BURN: i32 = 7;
pub const HARD_LIGHT: i32 = 8;
pub const SOFT_LIGHT: i32 = 9;
pub const DIFFERENCE: i32 = 10;
pub const EXCLUSION: i32 = 11;
pub const ADD: i32 = 12;

// --- non-separable ---------------------------------------------------
//
// These four cannot be computed per channel: each one takes some
// attribute of one colour -- its hue, its saturation, its luminosity --
// and transplants it onto the other, which requires seeing all three
// components together. That is the whole reason they were missing until
// now, and why they need the helper block below rather than one more arm
// in `blend`.
pub const HUE: i32 = 13;
pub const SATURATION: i32 = 14;
pub const COLOR: i32 = 15;
pub const LUMINOSITY: i32 = 16;

/// The first non-separable mode, so callers can branch on the boundary.
pub const FIRST_NON_SEPARABLE: i32 = HUE;

/// Perceived luminosity, with the W3C coefficients.
///
/// 0.3 / 0.59 / 0.11 are the specification's, not Rec. 709's
/// (0.2126 / 0.7152 / 0.0722). They differ visibly on saturated colours,
/// and the point of these modes is to match what Photoshop, Figma and a
/// browser's `mix-blend-mode` produce -- so the specification's numbers
/// are the correct ones even though they are the older NTSC weights.
#[inline]
fn lum(c: [f32; 3]) -> f32 {
    0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]
}

/// Pull a colour back inside the unit cube **without changing its hue**.
///
/// Naively clamping each channel shifts the hue, because the channels are
/// clamped by different amounts. Instead the colour is scaled toward its
/// own luminosity, which moves it along the grey axis and leaves the hue
/// where it was. This is the step people most often skip, and the symptom
/// is a `luminosity` layer whose bright areas drift toward whichever
/// primary clipped first.
#[inline]
fn clip_color(mut c: [f32; 3]) -> [f32; 3] {
    let l = lum(c);
    let n = c[0].min(c[1]).min(c[2]);
    let x = c[0].max(c[1]).max(c[2]);
    if n < 0.0 {
        let d = l - n;
        if d > 1e-9 {
            for v in &mut c {
                *v = l + (*v - l) * l / d;
            }
        }
    }
    if x > 1.0 {
        let d = x - l;
        if d > 1e-9 {
            for v in &mut c {
                *v = l + (*v - l) * (1.0 - l) / d;
            }
        }
    }
    c
}

/// Move a colour to a target luminosity, keeping hue and saturation.
#[inline]
fn set_lum(c: [f32; 3], l: f32) -> [f32; 3] {
    let d = l - lum(c);
    clip_color([c[0] + d, c[1] + d, c[2] + d])
}

/// Saturation as the specification defines it: the channel range.
#[inline]
fn sat(c: [f32; 3]) -> f32 {
    c[0].max(c[1]).max(c[2]) - c[0].min(c[1]).min(c[2])
}

/// Rescale a colour to a target saturation, keeping the ordering of its
/// channels -- which is what keeps the hue.
///
/// The minimum channel goes to 0 and the maximum to `s`, with the middle
/// channel placed proportionally between them. Indices are tracked rather
/// than the values sorted, so the result is written back to the right
/// channels; sorting the values and writing them back in order would
/// rotate the hue instead of preserving it.
#[inline]
fn set_sat(c: [f32; 3], s: f32) -> [f32; 3] {
    let (mut imin, mut imax) = (0usize, 0usize);
    for i in 1..3 {
        if c[i] < c[imin] {
            imin = i;
        }
        if c[i] > c[imax] {
            imax = i;
        }
    }
    if imin == imax {
        return [0.0, 0.0, 0.0]; // fully grey: no ordering to preserve
    }
    let imid = 3 - imin - imax;
    let mut out = [0.0f32; 3];
    let span = c[imax] - c[imin];
    out[imid] = if span > 1e-9 { (c[imid] - c[imin]) * s / span } else { 0.0 };
    out[imax] = s;
    out[imin] = 0.0;
    out
}

/// `B(Cb, Cs)` for the four non-separable modes, on straight colour.
#[inline]
fn blend_non_separable(mode: i32, cb: [f32; 3], cs: [f32; 3]) -> [f32; 3] {
    match mode {
        HUE => set_lum(set_sat(cs, sat(cb)), lum(cb)),
        SATURATION => set_lum(set_sat(cb, sat(cs)), lum(cb)),
        COLOR => set_lum(cs, lum(cb)),
        LUMINOSITY => set_lum(cb, lum(cs)),
        _ => cs,
    }
}

/// `B(Cb, Cs)` for one channel, on straight colour in 0..1.
#[inline]
fn blend(mode: i32, cb: f32, cs: f32) -> f32 {
    match mode {
        MULTIPLY => cb * cs,
        SCREEN => cb + cs - cb * cs,
        // Overlay is hard-light with the operands swapped; writing it that
        // way rather than duplicating the branches keeps the two
        // definitionally consistent.
        OVERLAY => blend(HARD_LIGHT, cs, cb),
        DARKEN => cb.min(cs),
        LIGHTEN => cb.max(cs),
        COLOR_DODGE => {
            if cb <= 0.0 {
                0.0
            } else if cs >= 1.0 {
                1.0
            } else {
                (cb / (1.0 - cs)).min(1.0)
            }
        }
        COLOR_BURN => {
            if cb >= 1.0 {
                1.0
            } else if cs <= 0.0 {
                0.0
            } else {
                1.0 - ((1.0 - cb) / cs).min(1.0)
            }
        }
        HARD_LIGHT => {
            if cs <= 0.5 {
                cb * (2.0 * cs)
            } else {
                let d = 2.0 * cs - 1.0;
                cb + d - cb * d
            }
        }
        SOFT_LIGHT => {
            // The W3C piecewise definition. The `d(Cb)` term below 0.25
            // uses the polynomial rather than the square root, which is
            // what the specification states and what keeps the curve
            // continuous at the join.
            if cs <= 0.5 {
                cb - (1.0 - 2.0 * cs) * cb * (1.0 - cb)
            } else {
                let d = if cb <= 0.25 {
                    ((16.0 * cb - 12.0) * cb + 4.0) * cb
                } else {
                    cb.sqrt()
                };
                cb + (2.0 * cs - 1.0) * (d - cb)
            }
        }
        DIFFERENCE => (cb - cs).abs(),
        EXCLUSION => cb + cs - 2.0 * cb * cs,
        // `ADD` is not a W3C blend mode but a Porter-Duff *composite*
        // operator (plus-lighter). Expressed as a blend function it is
        // simply unbounded addition, clamped; it is here because glows and
        // light leaks want it and every other tool offers it.
        ADD => (cb + cs).min(1.0),
        _ => cs,
    }
}

/// Composite `src` onto `dst` in place, both premultiplied f32 RGBA.
///
/// `opacity` scales the source's contribution, which is the layer's own
/// opacity slider. `y0`/`y1` restrict the pass to rows for a worker pool;
/// every pixel is independent, so a band needs no halo.
///
/// The `NORMAL` case is split out and takes the direct source-over path.
/// It is overwhelmingly the common mode, and it avoids the un-divide
/// entirely -- which is both faster and avoids any question of precision
/// near alpha 0.
///
/// # Safety
/// `dst` and `src` each hold `4 * w * h` floats.
/// `mask` and `clip` are optional premultiplied RGBA buffers whose
/// **alpha channel** multiplies the source.
///
/// They are full RGBA rather than single-channel coverage on purpose, and
/// that one decision removes a surprising amount of machinery:
///
/// * a **mask** is then just another `PaintSurface`, so it is painted with
///   the ordinary brush engine -- a soft airbrush mask, a hard pen mask, a
///   textured mask -- with no second code path and no conversion;
/// * a **clip** is the base layer's own buffer, read in place, so a
///   clipping group needs no snapshot and no extra allocation at all.
///
/// The cost is reading one float in four instead of one in one, on a
/// buffer that is already being streamed. The alternative -- extracting
/// coverage into a packed single-channel buffer -- costs a full-frame
/// pass and another 8 MB per masked layer at 1080p, on an operation that
/// is already bandwidth-bound.
///
/// There are three because a layer's effective coverage genuinely has
/// three independent sources: its own `mask`, the alpha of the layer it is
/// `clip`ped to, and that base layer's own mask (`clip_mask`). The last
/// one is easy to omit and wrong to: masking a base layer must also hide
/// everything clipped to it, which is what every tool with clipping groups
/// does, and a clip that ignored it would keep showing a shading pass over
/// a region its subject had been masked out of.
///
/// Multiplying them here avoids a full-frame scratch pass to combine them
/// first, which at 1080p would be 8 MB of extra traffic per masked layer
/// on an operation that is already bandwidth-bound.
///
/// Pass a null pointer for any of them to skip it.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn blend_layers(
    dst: *mut f32,
    src: *const f32,
    w: usize,
    h: usize,
    mode: i32,
    opacity: f32,
    mask: *const f32,
    clip: *const f32,
    clip_mask: *const f32,
    y0: usize,
    y1: usize,
) {
    let lo = y0.min(h) * w;
    let hi = y1.min(h) * w;
    let op = opacity.clamp(0.0, 1.0);
    if op <= 0.0 {
        return;
    }
    let has_mask = !mask.is_null();
    let has_clip = !clip.is_null();
    let has_clip_mask = !clip_mask.is_null();

    for i in lo..hi {
        let sp = src.add(i * 4);
        let dp = dst.add(i * 4);

        let mut k = op;
        if has_mask {
            k *= (*mask.add(i * 4 + 3)).clamp(0.0, 1.0);
        }
        if has_clip {
            k *= (*clip.add(i * 4 + 3)).clamp(0.0, 1.0);
        }
        if has_clip_mask {
            k *= (*clip_mask.add(i * 4 + 3)).clamp(0.0, 1.0);
        }
        if k <= 0.0 {
            continue;
        }

        let sa = *sp.add(3) * k;
        if sa <= 0.0 {
            continue;
        }
        let s = [*sp.add(0) * k, *sp.add(1) * k, *sp.add(2) * k];

        if mode == NORMAL {
            let inv = 1.0 - sa;
            for c in 0..3 {
                *dp.add(c) = s[c] + *dp.add(c) * inv;
            }
            *dp.add(3) = sa + *dp.add(3) * inv;
            continue;
        }

        let ba = *dp.add(3);
        if ba <= 0.0 {
            // Nothing to blend against: the blend term vanishes and the
            // formula collapses to plain source-over.
            for c in 0..3 {
                *dp.add(c) = s[c];
            }
            *dp.add(3) = sa;
            continue;
        }

        // Un-divide to straight colour, because B is defined there.
        let inv_sa = 1.0 / sa;
        let inv_ba = 1.0 / ba;
        let out_a = sa + ba * (1.0 - sa);

        let cs = [
            (s[0] * inv_sa).clamp(0.0, 1.0),
            (s[1] * inv_sa).clamp(0.0, 1.0),
            (s[2] * inv_sa).clamp(0.0, 1.0),
        ];
        let cb = [
            (*dp.add(0) * inv_ba).clamp(0.0, 1.0),
            (*dp.add(1) * inv_ba).clamp(0.0, 1.0),
            (*dp.add(2) * inv_ba).clamp(0.0, 1.0),
        ];

        // The non-separable modes need all three channels at once, so
        // they are evaluated once per pixel rather than once per channel.
        let bl = if mode >= FIRST_NON_SEPARABLE {
            blend_non_separable(mode, cb, cs)
        } else {
            [
                blend(mode, cb[0], cs[0]),
                blend(mode, cb[1], cs[1]),
                blend(mode, cb[2], cs[2]),
            ]
        };

        for c in 0..3 {
            *dp.add(c) = (1.0 - ba) * s[c] + (1.0 - sa) * *dp.add(c) + sa * ba * bl[c];
        }
        *dp.add(3) = out_a;
    }
}

/// Copy `n` floats. Used to snapshot a layer before a destructive edit.
///
/// Exported rather than left to the host because the JS equivalent --
/// `dst.set(src)` across two views into wasm memory -- is a bounds-checked
/// copy through the JS heap, whereas this is a `memory.copy`.
///
/// # Safety
/// Both buffers hold at least `n` floats and must not overlap.
#[no_mangle]
pub unsafe extern "C" fn copy_f32(src: *const f32, dst: *mut f32, n: usize) {
    core::ptr::copy_nonoverlapping(src, dst, n);
}
