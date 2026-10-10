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

/// Floats per stamp: `x, y, radius, flow, angle, aspect`.
///
/// Six rather than four because a round dab cannot make a chisel mark. See
/// [`stamp_mask`] for what `angle` and `aspect` do.
pub const STAMP_STRIDE: usize = 6;

/// Sample a tiled u8 grain texture, nearest-neighbour.
///
/// Nearest rather than bilinear on purpose: grain is high-frequency by
/// definition, and interpolating it low-passes away the very detail that
/// makes a dry medium read as dry. It is also four times cheaper in the
/// hottest loop in the engine.
#[inline]
unsafe fn grain(tex: *const u8, tw: usize, th: usize, u: f32, v: f32) -> f32 {
    // `rem_euclid` so negative canvas coordinates tile correctly rather
    // than mirroring at the origin -- a stroke drawn left of x=0 would
    // otherwise show a seam exactly at the axis.
    let x = (u.rem_euclid(tw as f32)) as usize % tw;
    let y = (v.rem_euclid(th as f32)) as usize % th;
    *tex.add(y * tw + x) as f32 * (1.0 / 255.0)
}

/// Accumulate stamps into a coverage mask.
///
/// `stamps` is `[x, y, radius, flow, angle, aspect]` per stamp
/// ([`STAMP_STRIDE`] floats), in pixels and radians. `hardness` is shared,
/// because an edge profile is a property of the brush rather than of each
/// dab along the stroke.
///
/// # Elliptical dabs
///
/// `aspect` is the nib's width across its length, and `angle` orients it.
/// At `aspect = 1` the dab is round and the maths reduces exactly to a
/// circle, so a round brush pays only two multiplies for the generality.
///
/// This is what a chisel marker, a calligraphic nib and a flat bristle
/// brush all need, and it cannot be faked by a round brush at any size:
/// the defining property is that the mark is *wide across one axis and
/// narrow across the other*, so a stroke changes width as it changes
/// direction. That direction-dependent swell is most of what makes
/// lettering read as lettering.
///
/// Coverage is measured on the ellipse-normalised distance
/// `hypot(along, across / aspect)`, compared against `radius`. The
/// bounding box still uses `radius`, which is conservative for any
/// `aspect <= 1` and avoids a trigonometric extent calculation per dab.
///
/// # Texture
///
/// `tex_mode` selects how the `tw` x `th` u8 grain texture is applied:
///
/// * `0` **none** — `tex` is not read and may be null.
/// * `1` **canvas-locked** — sampled at the *canvas* position, tiled,
///   divided by `tex_scale`.
/// * `2` **dab-locked** — sampled across the dab's own footprint, so the
///   texture rotates and scales with the nib.
///
/// The distinction matters more than it looks. **Paper tooth is a property
/// of the paper, not of the brush**, so it must be canvas-locked: dragging
/// a dry brush across the same patch twice has to hit the same high points
/// both times. A dab-locked grain instead smears a copy of the texture
/// along the stroke, which reads as a rubber stamp repeated at high
/// frequency and is the classic giveaway of a naive textured brush. Mode 2
/// exists for the different case where the texture *is* the tip shape —
/// a spatter or a bristle cluster.
///
/// # Safety
/// `mask` holds `w * h` floats, `stamps` holds `STAMP_STRIDE * count`, and
/// when `tex_mode != 0`, `tex` holds `tw * th` bytes.
#[no_mangle]
pub unsafe extern "C" fn stamp_mask(
    mask: *mut f32,
    w: usize,
    h: usize,
    stamps: *const f32,
    count: usize,
    hardness: f32,
    mode: i32,
    tex: *const u8,
    tw: usize,
    th: usize,
    tex_mode: i32,
    tex_scale: f32,
    y0: usize,
    y1: usize,
) {
    let band_lo = y0.min(h);
    let band_hi = y1.min(h);
    if band_lo >= band_hi {
        return;
    }
    let textured = tex_mode != 0 && !tex.is_null() && tw > 0 && th > 0;
    let scale = if tex_scale > 1e-6 { tex_scale } else { 1.0 };

    for s in 0..count {
        let base = stamps.add(s * STAMP_STRIDE);
        let cx = *base;
        let cy = *base.add(1);
        let r = *base.add(2);
        let flow = *base.add(3);
        let angle = *base.add(4);
        let aspect = (*base.add(5)).clamp(0.02, 1.0);
        if r <= 0.0 || flow <= 0.0 {
            continue;
        }

        // Antialiasing: the ramp is at least one pixel wide and centred on
        // the nominal radius.
        //
        // Two separate mistakes live here, and fixing the first exposed
        // the second:
        //
        //  1. Culling at `r` rejects every pixel beyond the nominal radius
        //     *before* the falloff is evaluated, so the entire feather
        //     band is discarded at high hardness and the edge is hard
        //     however carefully the falloff is written. The cull has to be
        //     at `core + feather`, where coverage genuinely reaches zero.
        //
        //  2. A half-pixel ramp is too narrow to antialias anything.
        //     Pixel centres fall on a half-integer lattice, so almost none
        //     land inside a 0.5px band -- measured, a radius-8 circle got
        //     8 partial pixels out of a ~50px circumference, which still
        //     reads as a jagged edge.
        let core = (hardness.clamp(0.0, 1.0) * r).min((r - 0.5).max(0.0));
        let feather = (r - core).max(1.0);
        let inv_feather = 1.0 / feather;
        let r_edge = core + feather;
        let r2 = r_edge * r_edge;

        let x0 = ((cx - r_edge).floor().max(0.0)) as usize;
        let x1 = (((cx + r_edge).ceil() + 1.0).min(w as f32).max(0.0)) as usize;
        let sy0 = ((cy - r_edge).floor().max(0.0) as usize).max(band_lo);
        let sy1 = ((((cy + r_edge).ceil() + 1.0).min(h as f32).max(0.0)) as usize).min(band_hi);

        let (sin_a, cos_a) = if aspect >= 0.999 { (0.0, 1.0) } else { angle.sin_cos() };
        let inv_aspect = 1.0 / aspect;

        for y in sy0..sy1 {
            let dy = y as f32 + 0.5 - cy;
            let row = mask.add(y * w);
            for x in x0..x1 {
                let dx = x as f32 + 0.5 - cx;

                // Rotate into the nib's frame, then stretch across it.
                let along = dx * cos_a + dy * sin_a;
                let across = (-dx * sin_a + dy * cos_a) * inv_aspect;
                let d2 = along * along + across * across;
                if d2 > r2 {
                    continue;
                }

                let t = ((d2.sqrt() - core) * inv_feather).clamp(0.0, 1.0);
                // 1 - smoothstep(t): flat at both ends, so a soft brush has
                // no visible crease where the falloff meets the core.
                let mut a = flow * (1.0 - t * t * (3.0 - 2.0 * t));

                if textured {
                    a *= if tex_mode == 1 {
                        grain(tex, tw, th, (x as f32) / scale, (y as f32) / scale)
                    } else {
                        // Dab-local, in 0..1 across the footprint.
                        let u = (along / r * 0.5 + 0.5) * tw as f32;
                        let v = (across * aspect / r * 0.5 + 0.5) * th as f32;
                        grain(tex, tw, th, u, v)
                    };
                }

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
/// `y0`/`y1` restrict the pass to rows `y0..y1`; pass `0, h` for the whole
/// buffer. Every pixel is independent here, so a band needs no halo.
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
    y0: usize,
    y1: usize,
) {
    let lo = y0.min(h) * w;
    let hi = y1.min(h) * w;
    for i in lo..hi {
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
/// `i0`/`i1` restrict the conversion to pixels `i0..i1`, so a worker pool
/// can split it; pass `0, n` for the whole buffer.
///
/// # Safety
/// `src` holds `4 * i1` floats and `dst` holds `4 * i1` bytes.
#[no_mangle]
pub unsafe extern "C" fn mask_to_rgba8(src: *const f32, dst: *mut u8, i0: usize, i1: usize) {
    for i in i0..i1 {
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

/// Wet media: a dab that picks up what is already on the canvas.
///
/// This is the one stroke kernel that cannot use the mask-then-composite
/// path, because every dab carries a *different* colour: the whole point
/// is that colour evolves along the stroke. So dabs are composited
/// individually, in order, and the kernel is inherently sequential — it
/// cannot be split across a worker pool, and the band arguments the other
/// raster kernels take are deliberately absent.
///
/// # The model
///
/// A reservoir holds the paint currently on the brush. Per dab:
///
/// 1. **Pick up** the canvas colour under the dab and mix it into the
///    reservoir at `smudge`.
/// 2. **Add fresh paint** at `color_rate`.
/// 3. **Deposit** the reservoir at `flow * opacity`.
///
/// `smudge` and `color_rate` are deliberately **independent**. Krita's
/// original colour-smudge engine coupled them — the colour rate was
/// scaled by the smudge rate and by opacity — and separating them was the
/// central fix of their rewrite, because a coupled pair makes it
/// impossible to ask for "drag the existing paint a long way while adding
/// almost no new colour", which is most of what blending a gradient is.
///
/// # Why the pickup samples a disc rather than a point
///
/// `sample_r` is a radius, not a flag. Sampling a single texel makes the
/// reservoir jump wherever the brush passes over a hard edge or, worse,
/// over a gap in a textured tip — the "pierced brush" case — and the
/// stroke comes out speckled. Averaging over a disc is what makes a smear
/// read as smooth, and it is the same conclusion Krita reached when they
/// fixed smudge radius.
///
/// The sample is taken **before** the dab is deposited, so a dab never
/// picks up its own paint; doing it the other way makes the reservoir
/// converge on the brush colour within a few dabs and the wetness
/// disappears.
///
/// # Safety
/// `dst` holds `4 * w * h` premultiplied floats and `stamps` holds
/// `STAMP_STRIDE * count`.
#[no_mangle]
#[allow(clippy::too_many_arguments)]
pub unsafe extern "C" fn smudge_stroke(
    dst: *mut f32,
    w: usize,
    h: usize,
    stamps: *const f32,
    count: usize,
    hardness: f32,
    smudge: f32,
    color_rate: f32,
    sample_r: f32,
    r: f32,
    g: f32,
    b: f32,
    opacity: f32,
) {
    if w == 0 || h == 0 {
        return;
    }
    let pickup = smudge.clamp(0.0, 1.0);
    let fresh = color_rate.clamp(0.0, 1.0);

    // The reservoir is *loaded from the canvas on first contact*, not from
    // the brush colour.
    //
    // Seeding it with the brush colour instead looks harmless and is not:
    // at `color_rate = 0` -- a pure smear, which is exactly what the
    // independent rates exist to express -- there is no fresh paint to
    // wash it out, so the first several dabs deposit the brush colour
    // anyway. Measured, a green-configured smear with `color_rate = 0`
    // laid down 0.09 of green before decaying.
    //
    // A real smudge tool picks up on contact and carries nothing before
    // it. If the canvas under the first dab is empty the reservoir starts
    // transparent and the smear correctly deposits nothing.
    let mut res = [r, g, b, 1.0f32];
    let mut loaded = pickup <= 0.0;

    for s in 0..count {
        let base = stamps.add(s * STAMP_STRIDE);
        let cx = *base;
        let cy = *base.add(1);
        let rad = *base.add(2);
        let flow = *base.add(3);
        let angle = *base.add(4);
        let aspect = (*base.add(5)).clamp(0.02, 1.0);
        if rad <= 0.0 || flow <= 0.0 {
            continue;
        }

        // --- 1. pick up, averaged over a disc -------------------------
        if pickup > 0.0 {
            let sr = if sample_r > 0.0 { sample_r } else { rad * 0.5 };
            let sx0 = ((cx - sr).floor().max(0.0)) as usize;
            let sy0 = ((cy - sr).floor().max(0.0)) as usize;
            let sx1 = (((cx + sr).ceil() + 1.0).min(w as f32).max(0.0)) as usize;
            let sy1 = (((cy + sr).ceil() + 1.0).min(h as f32).max(0.0)) as usize;
            let sr2 = sr * sr;

            let mut acc = [0.0f32; 4];
            let mut n = 0.0f32;
            for y in sy0..sy1 {
                let dy = y as f32 + 0.5 - cy;
                for x in sx0..sx1 {
                    let dx = x as f32 + 0.5 - cx;
                    if dx * dx + dy * dy > sr2 {
                        continue;
                    }
                    let p = dst.add((y * w + x) * 4);
                    for c in 0..4 {
                        acc[c] += *p.add(c);
                    }
                    n += 1.0;
                }
            }
            if n > 0.0 {
                // The canvas is premultiplied; un-divide so the mix is in
                // straight colour. Mixing premultiplied colours weights
                // each by its own coverage, which drags every smear toward
                // black wherever the canvas is transparent.
                let inv = 1.0 / n;
                let alpha = acc[3] * inv;
                let picked = if alpha > 1e-5 {
                    let k = inv / alpha;
                    [acc[0] * k, acc[1] * k, acc[2] * k, alpha]
                } else {
                    // Nothing underneath: pick up transparency, not black.
                    [res[0], res[1], res[2], 0.0]
                };
                if loaded {
                    for c in 0..4 {
                        res[c] += (picked[c] - res[c]) * pickup;
                    }
                } else {
                    res = picked;
                    loaded = true;
                }
            }
        }

        // --- 2. add fresh paint ---------------------------------------
        if fresh > 0.0 {
            res[0] += (r - res[0]) * fresh;
            res[1] += (g - res[1]) * fresh;
            res[2] += (b - res[2]) * fresh;
            res[3] += (1.0 - res[3]) * fresh;
        }

        // --- 3. deposit ------------------------------------------------
        let core = (hardness.clamp(0.0, 1.0) * rad).min((rad - 0.5).max(0.0));
        let feather = (rad - core).max(1.0);
        let inv_feather = 1.0 / feather;
        let r_edge = core + feather;
        let r2 = r_edge * r_edge;

        let x0 = ((cx - r_edge).floor().max(0.0)) as usize;
        let x1 = (((cx + r_edge).ceil() + 1.0).min(w as f32).max(0.0)) as usize;
        let y0 = ((cy - r_edge).floor().max(0.0)) as usize;
        let y1 = (((cy + r_edge).ceil() + 1.0).min(h as f32).max(0.0)) as usize;

        let (sin_a, cos_a) = if aspect >= 0.999 { (0.0, 1.0) } else { angle.sin_cos() };
        let inv_aspect = 1.0 / aspect;
        let strength = flow * opacity;

        for y in y0..y1 {
            let dy = y as f32 + 0.5 - cy;
            for x in x0..x1 {
                let dx = x as f32 + 0.5 - cx;
                let along = dx * cos_a + dy * sin_a;
                let across = (-dx * sin_a + dy * cos_a) * inv_aspect;
                let d2 = along * along + across * across;
                if d2 > r2 {
                    continue;
                }
                let t = ((d2.sqrt() - core) * inv_feather).clamp(0.0, 1.0);
                let a = strength * res[3] * (1.0 - t * t * (3.0 - 2.0 * t));
                if a <= 0.0 {
                    continue;
                }
                let p = dst.add((y * w + x) * 4);
                let inv = 1.0 - a;
                *p.add(0) = res[0] * a + *p.add(0) * inv;
                *p.add(1) = res[1] * a + *p.add(1) * inv;
                *p.add(2) = res[2] * a + *p.add(2) * inv;
                *p.add(3) = a + *p.add(3) * inv;
            }
        }
    }
}
