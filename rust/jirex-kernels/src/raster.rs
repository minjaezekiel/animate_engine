//! The brush engine: stamp a stroke into a coverage mask, then composite.
//!
//! # Why a stroke is two passes and not one
//!
//! The naive brush composites every stamp directly onto the layer. Because
//! stamps overlap heavily -- spacing is typically a tenth of the brush
//! diameter, so any pixel is covered by ten or more -- the alpha compounds
//! and the stroke comes out far darker than the chosen opacity, darker
//! still where the input happened to be sampled densely, which is to say
//! wherever the user moved slowly or a corner doubled back. The result is
//! a stroke whose darkness records input sampling rate instead of intent.
//!
//! Every serious paint program solves this the same way, and so does this
//! kernel:
//!
//! 1. [`stamp_mask`] accumulates the stroke's stamps into a **single
//!    channel f32 coverage mask**, with no colour involved.
//! 2. [`composite_mask`] applies that mask **once**, at the stroke's
//!    opacity, to the destination.
//!
//! Each pixel is therefore darkened exactly once per stroke no matter how
//! many stamps hit it. It also makes a stroke cheap to re-render at a new
//! opacity or colour, and -- the reason it matters to this engine
//! specifically -- it makes a partially drawn stroke exact: a draw-on
//! animation renders frame N by stamping the first N-worth of the stroke,
//! which is a pure function of N and so needs no history.
//!
//! # Buffer formats
//!
//! * mask: `f32`, one per pixel, 0..1.
//! * destination: `f32` RGBA **premultiplied**, four per pixel.
//!
//! Premultiplied is not a preference. Compositing hundreds of strokes in
//! straight (non-premultiplied) alpha requires a divide per stroke per
//! pixel and loses precision near alpha 0, where it shows up as dark
//! fringes around every soft edge. `f32` rather than `u8` because a
//! 20-layer build-up quantises visibly in 8 bits, and the conversion to 8
//! bits happens once, in [`mask_to_rgba8`], at the end.

/// Accumulate stamps into a coverage mask.
///
/// `stamps` is `[x, y, radius, flow]` per stamp, in pixels. `hardness` is
/// shared: a brush's edge profile is a property of the brush, not of each
/// dab along the stroke.
///
/// `mode` selects how overlapping stamps combine:
///
/// * `0` **peak** -- `c = max(c, a)`. The stroke reaches the brush's flow
///   and stops. This is a pen, a pencil, a marker: moving slowly does not
///   darken the line.
/// * `1` **build-up** -- `c += a * (1 - c)`. Overlap accumulates toward
///   opaque, so dwelling deposits more. This is an airbrush.
///
/// Those two cover every brush in the library; a third mode would need a
/// brush that wants one.
///
/// # The edge profile
///
/// Coverage falls from full at `hardness * radius` to zero at `radius`
/// along `1 - smoothstep(t)`, which is flat at both ends. A linear ramp
/// leaves a visible crease where it meets the solid core -- the eye finds
/// the slope discontinuity easily, and on a large soft brush it reads as a
/// ring.
///
/// The feather width is floored at half a pixel. At `hardness = 1` the
/// ideal width is zero, and dividing by it would give every edge pixel
/// either 0 or NaN; the floor is what antialiases a hard round brush
/// instead of leaving it jagged.
///
/// # Safety
/// `mask` holds `w * h` floats and `stamps` holds `4 * count`.
#[no_mangle]
pub unsafe extern "C" fn stamp_mask(
    mask: *mut f32,
    w: usize,
    h: usize,
    stamps: *const f32,
    count: usize,
    hardness: f32,
    mode: i32,
) {
    for s in 0..count {
        let cx = *stamps.add(s * 4);
        let cy = *stamps.add(s * 4 + 1);
        let r = *stamps.add(s * 4 + 2);
        let flow = *stamps.add(s * 4 + 3);
        if r <= 0.0 || flow <= 0.0 {
            continue;
        }

        // Only the stamp's bounding box is touched. This is what keeps the
        // cost proportional to ink laid down rather than to canvas size:
        // a 20px brush on a 4K canvas visits ~1,200 pixels, not 8 million.
        // Antialiasing a hard brush: the ramp is at least one pixel wide
        // and is centred on the nominal radius.
        //
        // Two separate mistakes live here, and the first fix exposed the
        // second:
        //
        //  1. Culling at `r` rejects every pixel beyond the nominal radius
        //     *before* the falloff is evaluated, so the entire feather band
        //     is discarded at high hardness and the edge is hard however
        //     carefully the falloff is written. The cull has to be at
        //     `core + feather`, where coverage genuinely reaches zero.
        //
        //  2. A half-pixel ramp is too narrow to antialias anything. Pixel
        //     centres fall on a half-integer lattice, so almost none of
        //     them land inside a 0.5px band -- measured, a radius-8 circle
        //     got 8 partial pixels out of a ~50px circumference, which
        //     still reads as a jagged edge.
        //
        // So the ramp is floored at a full pixel and `core` is pulled half
        // a pixel inside `r`, which puts the 50% coverage contour exactly
        // on the nominal radius. That is what analytic circle coverage
        // approximates to, and it costs one extra `min`.
        let core = (hardness.clamp(0.0, 1.0) * r).min((r - 0.5).max(0.0));
        let feather = (r - core).max(1.0);
        let inv_feather = 1.0 / feather;
        let r_edge = core + feather;
        let r2 = r_edge * r_edge;

        let x0 = ((cx - r_edge).floor().max(0.0)) as usize;
        let y0 = ((cy - r_edge).floor().max(0.0)) as usize;
        let x1 = (((cx + r_edge).ceil() + 1.0).min(w as f32).max(0.0)) as usize;
        let y1 = (((cy + r_edge).ceil() + 1.0).min(h as f32).max(0.0)) as usize;

        for y in y0..y1 {
            let dy = y as f32 + 0.5 - cy;
            let dy2 = dy * dy;
            if dy2 > r2 {
                continue;
            }
            let row = mask.add(y * w);
            for x in x0..x1 {
                let dx = x as f32 + 0.5 - cx;
                let d2 = dx * dx + dy2;
                if d2 > r2 {
                    continue;
                }
                let t = ((d2.sqrt() - core) * inv_feather).clamp(0.0, 1.0);
                // 1 - smoothstep(t), expanded.
                let a = flow * (1.0 - t * t * (3.0 - 2.0 * t));
                if a <= 0.0 {
                    continue;
                }
                let p = row.add(x);
                let c = *p;
                *p = if mode == 0 {
                    if a > c { a } else { c }
                } else {
                    c + a * (1.0 - c)
                };
            }
        }
    }
}

/// Composite a coverage mask over a premultiplied f32 RGBA buffer.
///
/// `(r, g, b)` is straight (non-premultiplied) colour in 0..1; the
/// premultiply happens here, per pixel, against the mask. `opacity` scales
/// the whole stroke, which is what makes the two-pass design pay: the
/// stroke's shape is already decided, so its strength is one multiply.
///
/// `erase` inverts the operation into a destination-out: coverage removes
/// premultiplied colour and alpha together. Scaling all four channels by
/// the same `1 - a` is what keeps the buffer premultiplied-valid, so an
/// erased edge stays neutral instead of picking up a colour fringe.
///
/// # Safety
/// `dst` holds `4 * w * h` floats and `mask` holds `w * h`.
#[no_mangle]
pub unsafe extern "C" fn composite_mask(
    dst: *mut f32,
    mask: *const f32,
    w: usize,
    h: usize,
    r: f32,
    g: f32,
    b: f32,
    opacity: f32,
    erase: i32,
) {
    let n = w * h;
    for i in 0..n {
        let a = *mask.add(i) * opacity;
        if a <= 0.0 {
            continue;
        }
        let p = dst.add(i * 4);
        let inv = 1.0 - a;
        if erase != 0 {
            *p.add(0) *= inv;
            *p.add(1) *= inv;
            *p.add(2) *= inv;
            *p.add(3) *= inv;
        } else {
            *p.add(0) = r * a + *p.add(0) * inv;
            *p.add(1) = g * a + *p.add(1) * inv;
            *p.add(2) = b * a + *p.add(2) * inv;
            *p.add(3) = a + *p.add(3) * inv;
        }
    }
}

/// Convert premultiplied f32 RGBA to the straight u8 RGBA `putImageData`
/// expects.
///
/// `ImageData` is unpremultiplied, so this un-divides. Pixels at alpha 0
/// are written as transparent black rather than divided, since their
/// colour carries no information and dividing by zero would write NaN,
/// which `putImageData` renders as garbage.
///
/// Rounding is `+ 0.5` then truncate, matching the JS fallback exactly --
/// `Math.round` differs from a C cast on negatives, and the two paths must
/// produce identical bytes for the golden-hash tests to mean anything.
///
/// # Safety
/// `src` holds `4 * n` floats and `dst` holds `4 * n` bytes.
#[no_mangle]
pub unsafe extern "C" fn mask_to_rgba8(src: *const f32, dst: *mut u8, n: usize) {
    for i in 0..n {
        let a = *src.add(i * 4 + 3);
        if a <= 0.0 {
            *dst.add(i * 4) = 0;
            *dst.add(i * 4 + 1) = 0;
            *dst.add(i * 4 + 2) = 0;
            *dst.add(i * 4 + 3) = 0;
            continue;
        }
        let inv = 1.0 / a;
        let to8 = |v: f32| -> u8 { ((v * 255.0 + 0.5).clamp(0.0, 255.0)) as u8 };
        *dst.add(i * 4) = to8(*src.add(i * 4) * inv);
        *dst.add(i * 4 + 1) = to8(*src.add(i * 4 + 1) * inv);
        *dst.add(i * 4 + 2) = to8(*src.add(i * 4 + 2) * inv);
        *dst.add(i * 4 + 3) = to8(a);
    }
}

/// Clear a premultiplied RGBA buffer, or a mask, to zero.
///
/// Exported rather than left to the host because `new Float32Array(n)` on
/// the JS side allocates and the GC then has to collect it every frame,
/// whereas reusing one buffer and zeroing it in wasm is a `memory.fill`.
///
/// # Safety
/// `buf` must hold at least `n` floats.
#[no_mangle]
pub unsafe extern "C" fn clear_f32(buf: *mut f32, n: usize) {
    core::ptr::write_bytes(buf, 0, n);
}
