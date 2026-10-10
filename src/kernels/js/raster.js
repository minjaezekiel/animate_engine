/**
 * Brush raster kernels in JavaScript.
 *
 * Mirrors `rust/jirex-kernels/src/raster.rs`; read that file for why a
 * stroke is accumulated into a coverage mask first and composited once,
 * rather than each dab being blended straight onto the layer. The short
 * version: stamps overlap about tenfold, so direct blending makes a
 * stroke's darkness a record of input sampling rate instead of intent.
 */

/**
 * Accumulate stamps into a single-channel coverage mask.
 *
 * `stamps` is `[x, y, radius, flow]` per stamp in pixels. `mode` is 0 for
 * peak (`max`, a pen or pencil -- dwelling does not darken) or 1 for
 * build-up (an airbrush -- it does).
 */
export function stampMask(mask, w, h, stamps, count, hardness, mode, y0, y1) {
    const M = mask.array, S = stamps.array;
    const hard = Math.min(1, Math.max(0, hardness));
    // `y0..y1` is this worker's band. Both accumulation modes are
    // per-pixel, so a band needs no halo -- each stamp's bounding box is
    // simply clipped to the band, and a stamp straddling a boundary is
    // visited by both workers, each writing only its own rows.
    const bandLo = Math.min(y0, h), bandHi = Math.min(y1, h);
    if (bandLo >= bandHi) return;

    for (let s = 0; s < count; s++) {
        const cx = S[s * 4], cy = S[s * 4 + 1];
        const r = S[s * 4 + 2], flow = S[s * 4 + 3];
        if (r <= 0 || flow <= 0) continue;

        // Only the stamp's bounding box is visited, so cost tracks ink
        // laid down rather than canvas area.
        // The ramp is at least one pixel wide and centred on the nominal
        // radius; see raster.rs for the two mistakes this encodes against.
        // In short: cull at `core + feather` rather than at `r`, or the
        // feather band is discarded before it is evaluated -- and floor the
        // band at a full pixel, because pixel centres sit on a half-integer
        // lattice and a 0.5px band catches almost none of them.
        const core = Math.min(hard * r, Math.max(r - 0.5, 0));
        const feather = Math.max(r - core, 1);
        const invFeather = 1 / feather;
        const rEdge = core + feather;
        const r2 = rEdge * rEdge;

        const x0 = Math.max(0, Math.floor(cx - rEdge));
        const x1 = Math.max(0, Math.min(w, Math.ceil(cx + rEdge) + 1));
        const sy0 = Math.max(bandLo, Math.max(0, Math.floor(cy - rEdge)));
        const sy1 = Math.min(bandHi, Math.max(0, Math.min(h, Math.ceil(cy + rEdge) + 1)));

        for (let y = sy0; y < sy1; y++) {
            const dy = y + 0.5 - cy;
            const dy2 = dy * dy;
            if (dy2 > r2) continue;
            const row = y * w;
            for (let x = x0; x < x1; x++) {
                const dx = x + 0.5 - cx;
                const d2 = dx * dx + dy2;
                if (d2 > r2) continue;
                let t = (Math.sqrt(d2) - core) * invFeather;
                t = t < 0 ? 0 : t > 1 ? 1 : t;
                // 1 - smoothstep(t): flat at both ends, so a soft brush
                // has no visible crease where the falloff meets the core.
                const a = flow * (1 - t * t * (3 - 2 * t));
                if (a <= 0) continue;
                const i = row + x;
                const c = M[i];
                M[i] = mode === 0 ? (a > c ? a : c) : c + a * (1 - c);
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
