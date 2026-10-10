/**
 * Brush raster kernels in JavaScript.
 *
 * Mirrors `rust/jirex-kernels/src/raster.rs`; read that file for why a
 * stroke is accumulated into a coverage mask first and composited once,
 * rather than each dab being blended straight onto the layer. The short
 * version: stamps overlap about tenfold, so direct blending makes a
 * stroke's darkness a record of input sampling rate instead of intent.
 */

/** Floats per stamp: `x, y, radius, flow, angle, aspect`. Matches raster.rs. */
export const STAMP_STRIDE = 6;

/**
 * Sample a tiled u8 grain texture, nearest-neighbour.
 *
 * Nearest rather than bilinear on purpose: grain is high-frequency by
 * definition, and interpolating it low-passes away the very detail that
 * makes a dry medium read as dry.
 *
 * `rem` is a Euclidean modulo so negative canvas coordinates tile instead
 * of mirroring at the origin, which would put a seam exactly on the axis.
 */
function grain(T, tw, th, u, v) {
    const x = ((u % tw) + tw) % tw | 0;
    const y = ((v % th) + th) % th | 0;
    return T[y * tw + x] / 255;
}

/**
 * Accumulate stamps into a single-channel coverage mask.
 *
 * `stamps` is `[x, y, radius, flow, angle, aspect]` per stamp. `mode` is 0
 * for peak (`max`, a pen or pencil -- dwelling does not darken) or 1 for
 * build-up (an airbrush -- it does).
 *
 * `aspect` is the nib's width across its length and `angle` orients it,
 * which is what a chisel marker or a calligraphic nib needs and a round
 * brush cannot fake at any size. At `aspect = 1` the maths reduces exactly
 * to a circle.
 *
 * `texMode`: 0 none, 1 canvas-locked grain, 2 dab-locked. Canvas-locked is
 * the one that matters for dry media -- paper tooth belongs to the paper,
 * so dragging a brush over the same patch twice must hit the same high
 * points. Dab-locked grain smears a copy of the texture along the stroke
 * and reads as a rubber stamp repeated at high frequency.
 */
export function stampMask(mask, w, h, stamps, count, hardness, mode, y0, y1,
                          tex, tw, th, texMode, texScale) {
    const M = mask.array, S = stamps.array;
    const hard = Math.min(1, Math.max(0, hardness));
    const bandLo = Math.min(y0, h), bandHi = Math.min(y1, h);
    if (bandLo >= bandHi) return;

    const textured = texMode !== 0 && tex && tw > 0 && th > 0;
    const T = textured ? tex.array : null;
    const scale = texScale > 1e-6 ? texScale : 1;

    for (let s = 0; s < count; s++) {
        const o = s * STAMP_STRIDE;
        const cx = S[o], cy = S[o + 1], r = S[o + 2], flow = S[o + 3];
        const angle = S[o + 4];
        const aspect = Math.min(1, Math.max(0.02, S[o + 5]));
        if (r <= 0 || flow <= 0) continue;

        // The ramp is at least one pixel wide and centred on the nominal
        // radius; see raster.rs for the two mistakes this encodes against.
        const core = Math.min(hard * r, Math.max(r - 0.5, 0));
        const feather = Math.max(r - core, 1);
        const invFeather = 1 / feather;
        const rEdge = core + feather;
        const r2 = rEdge * rEdge;

        const x0 = Math.max(0, Math.floor(cx - rEdge));
        const x1 = Math.max(0, Math.min(w, Math.ceil(cx + rEdge) + 1));
        const sy0 = Math.max(bandLo, Math.max(0, Math.floor(cy - rEdge)));
        const sy1 = Math.min(bandHi, Math.max(0, Math.min(h, Math.ceil(cy + rEdge) + 1)));

        const round = aspect >= 0.999;
        const sinA = round ? 0 : Math.sin(angle);
        const cosA = round ? 1 : Math.cos(angle);
        const invAspect = 1 / aspect;

        for (let y = sy0; y < sy1; y++) {
            const dy = y + 0.5 - cy;
            const row = y * w;
            for (let x = x0; x < x1; x++) {
                const dx = x + 0.5 - cx;
                const along = dx * cosA + dy * sinA;
                const across = (-dx * sinA + dy * cosA) * invAspect;
                const d2 = along * along + across * across;
                if (d2 > r2) continue;

                let t = (Math.sqrt(d2) - core) * invFeather;
                t = t < 0 ? 0 : t > 1 ? 1 : t;
                let a = flow * (1 - t * t * (3 - 2 * t));

                if (textured) {
                    a *= texMode === 1
                        ? grain(T, tw, th, x / scale, y / scale)
                        : grain(T, tw, th,
                            (along / r * 0.5 + 0.5) * tw,
                            (across * aspect / r * 0.5 + 0.5) * th);
                }

                if (a <= 0) continue;
                const i = row + x;
                const c = M[i];
                M[i] = mode === 0 ? (a > c ? a : c) : c + a * (1 - c);
            }
        }
    }
}

/**
 * Wet media: dabs that pick up what is already on the canvas.
 *
 * Sequential by nature -- each dab's colour depends on every dab before
 * it -- so unlike the other raster kernels this one cannot be split across
 * a worker pool and takes no band arguments.
 *
 * `smudge` (canvas pickup) and `colorRate` (fresh paint) are independent.
 * Coupling them, as Krita's original colour-smudge engine did, makes it
 * impossible to ask for "drag existing paint a long way while adding
 * almost no new colour", which is most of what blending a gradient is.
 *
 * Pickup averages over a disc rather than sampling one texel, because a
 * point sample jumps at every hard edge and speckles the stroke. The
 * sample is taken before the dab is deposited, or the reservoir converges
 * on the brush colour within a few dabs and the wetness disappears.
 */
export function smudgeStroke(dst, w, h, stamps, count, hardness,
                             smudge, colorRate, sampleR, r, g, b, opacity) {
    if (w === 0 || h === 0) return;
    const D = dst.array, S = stamps.array;
    const pickup = Math.min(1, Math.max(0, smudge));
    const fresh = Math.min(1, Math.max(0, colorRate));
    const hard = Math.min(1, Math.max(0, hardness));

    // The reservoir is loaded from the canvas on first contact, not from
    // the brush colour. Seeding it with the brush colour means that at
    // `colorRate = 0` -- a pure smear -- the first dabs deposit that
    // colour anyway, with no fresh paint to wash it out. See raster.rs.
    let res = [r, g, b, 1];
    let loaded = pickup <= 0;

    for (let s = 0; s < count; s++) {
        const o = s * STAMP_STRIDE;
        const cx = S[o], cy = S[o + 1], rad = S[o + 2], flow = S[o + 3];
        const angle = S[o + 4];
        const aspect = Math.min(1, Math.max(0.02, S[o + 5]));
        if (rad <= 0 || flow <= 0) continue;

        if (pickup > 0) {
            const sr = sampleR > 0 ? sampleR : rad * 0.5;
            const sx0 = Math.max(0, Math.floor(cx - sr));
            const sy0 = Math.max(0, Math.floor(cy - sr));
            const sx1 = Math.max(0, Math.min(w, Math.ceil(cx + sr) + 1));
            const sy1 = Math.max(0, Math.min(h, Math.ceil(cy + sr) + 1));
            const sr2 = sr * sr;

            let a0 = 0, a1 = 0, a2 = 0, a3 = 0, n = 0;
            for (let y = sy0; y < sy1; y++) {
                const dy = y + 0.5 - cy;
                for (let x = sx0; x < sx1; x++) {
                    const dx = x + 0.5 - cx;
                    if (dx * dx + dy * dy > sr2) continue;
                    const p = (y * w + x) * 4;
                    a0 += D[p]; a1 += D[p + 1]; a2 += D[p + 2]; a3 += D[p + 3];
                    n++;
                }
            }
            if (n > 0) {
                // The canvas is premultiplied; un-divide so the mix is in
                // straight colour. Mixing premultiplied values weights
                // each by its own coverage and drags every smear toward
                // black wherever the canvas is transparent.
                const inv = 1 / n;
                const alpha = a3 * inv;
                let picked;
                if (alpha > 1e-5) {
                    const k = inv / alpha;
                    picked = [a0 * k, a1 * k, a2 * k, alpha];
                } else {
                    picked = [res[0], res[1], res[2], 0];
                }
                if (loaded) {
                    for (let c = 0; c < 4; c++) res[c] += (picked[c] - res[c]) * pickup;
                } else {
                    res = picked;
                    loaded = true;
                }
            }
        }

        if (fresh > 0) {
            res[0] += (r - res[0]) * fresh;
            res[1] += (g - res[1]) * fresh;
            res[2] += (b - res[2]) * fresh;
            res[3] += (1 - res[3]) * fresh;
        }

        const core = Math.min(hard * rad, Math.max(rad - 0.5, 0));
        const feather = Math.max(rad - core, 1);
        const invFeather = 1 / feather;
        const rEdge = core + feather;
        const r2 = rEdge * rEdge;

        const x0 = Math.max(0, Math.floor(cx - rEdge));
        const x1 = Math.max(0, Math.min(w, Math.ceil(cx + rEdge) + 1));
        const y0 = Math.max(0, Math.floor(cy - rEdge));
        const y1 = Math.max(0, Math.min(h, Math.ceil(cy + rEdge) + 1));

        const round = aspect >= 0.999;
        const sinA = round ? 0 : Math.sin(angle);
        const cosA = round ? 1 : Math.cos(angle);
        const invAspect = 1 / aspect;
        const strength = flow * opacity;

        for (let y = y0; y < y1; y++) {
            const dy = y + 0.5 - cy;
            for (let x = x0; x < x1; x++) {
                const dx = x + 0.5 - cx;
                const along = dx * cosA + dy * sinA;
                const across = (-dx * sinA + dy * cosA) * invAspect;
                const d2 = along * along + across * across;
                if (d2 > r2) continue;
                let t = (Math.sqrt(d2) - core) * invFeather;
                t = t < 0 ? 0 : t > 1 ? 1 : t;
                const a = strength * res[3] * (1 - t * t * (3 - 2 * t));
                if (a <= 0) continue;
                const p = (y * w + x) * 4;
                const inv = 1 - a;
                D[p] = res[0] * a + D[p] * inv;
                D[p + 1] = res[1] * a + D[p + 1] * inv;
                D[p + 2] = res[2] * a + D[p + 2] * inv;
                D[p + 3] = a + D[p + 3] * inv;
            }
        }
    }
}

/**
 * Composite a coverage mask over a premultiplied f32 RGBA buffer.
 *
 * `r, g, b` are straight colour in 0..1 and are premultiplied here.
 * `erase` turns the operation into a destination-out, scaling all four
 * channels together so the buffer stays premultiplied-valid and an erased
 * edge picks up no colour fringe.
 */
export function compositeMask(dst, mask, w, h, r, g, b, opacity, erase, y0, y1) {
    const D = dst.array, M = mask.array;
    // Every pixel is independent, so a band is just a row range.
    const lo = Math.min(y0, h) * w, hi = Math.min(y1, h) * w;

    for (let i = lo; i < hi; i++) {
        const a = M[i] * opacity;
        if (a <= 0) continue;
        const p = i * 4, inv = 1 - a;
        if (erase) {
            D[p] *= inv; D[p + 1] *= inv; D[p + 2] *= inv; D[p + 3] *= inv;
        } else {
            D[p] = r * a + D[p] * inv;
            D[p + 1] = g * a + D[p + 1] * inv;
            D[p + 2] = b * a + D[p + 2] * inv;
            D[p + 3] = a + D[p + 3] * inv;
        }
    }
}

/**
 * Premultiplied f32 RGBA to the straight u8 RGBA that `ImageData` wants.
 *
 * Alpha-zero pixels are written transparent black rather than divided --
 * their colour carries no information and the divide would write NaN,
 * which `putImageData` renders as garbage.
 */
export function maskToRgba8(src, dst, i0, i1) {
    const S = src.array, D = dst.array;

    for (let i = i0; i < i1; i++) {
        const p = i * 4;
        const a = S[p + 3];
        if (a <= 0) { D[p] = D[p + 1] = D[p + 2] = D[p + 3] = 0; continue; }
        const inv = 1 / a;
        const to8 = (v) => {
            const c = v * 255 + 0.5;
            return c < 0 ? 0 : c > 255 ? 255 : c | 0;
        };
        D[p] = to8(S[p] * inv);
        D[p + 1] = to8(S[p + 1] * inv);
        D[p + 2] = to8(S[p + 2] * inv);
        D[p + 3] = to8(a);
    }
}

/** Zero a buffer. Exists so the hot path reuses one allocation per frame. */
export function clearF32(buf, n) {
    buf.array.fill(0, 0, n);
}
