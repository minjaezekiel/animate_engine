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
#[no_mangle]
pub unsafe extern "C" fn blend_layers(
    dst: *mut f32,
    src: *const f32,
    w: usize,
    h: usize,
    mode: i32,
    opacity: f32,
    y0: usize,
    y1: usize,
) {
    let lo = y0.min(h) * w;
    let hi = y1.min(h) * w;
    let op = opacity.clamp(0.0, 1.0);
    if op <= 0.0 {
        return;
    }

    for i in lo..hi {
        let sp = src.add(i * 4);
        let dp = dst.add(i * 4);

        let sa = *sp.add(3) * op;
        if sa <= 0.0 {
            continue;
        }
        let s = [*sp.add(0) * op, *sp.add(1) * op, *sp.add(2) * op];

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

        for c in 0..3 {
            let cs = (s[c] * inv_sa).clamp(0.0, 1.0);
            let cb = (*dp.add(c) * inv_ba).clamp(0.0, 1.0);
            *dp.add(c) = (1.0 - ba) * s[c]
                + (1.0 - sa) * *dp.add(c)
                + sa * ba * blend(mode, cb, cs);
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
