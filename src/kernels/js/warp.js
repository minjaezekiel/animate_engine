/**
 * Image resampling kernels in JavaScript.
 *
 * Mirrors `rust/jirex-kernels/src/warp.rs`. See that file for why
 * "animate an uploaded picture" is a textured-mesh deformation, and why
 * sampling premultiplies before it interpolates.
 */

/**
 * Bilinear sample of a straight-alpha u8 RGBA image, returned
 * premultiplied.
 *
 * The `- 0.5` places the sample at the texel centre. Omitting it offsets
 * every warp by half a pixel, which is invisible on a still frame and
 * reads as a shimmer once the sequence moves.
 *
 * Premultiplying the four taps before interpolating is what prevents the
 * dark halo around a cut-out's edge: transparent pixels carry a colour,
 * and straight-alpha interpolation mixes it in.
 */
function sample(S, sw, sh, u, v, out) {
    if (sw === 0 || sh === 0) { out[0] = out[1] = out[2] = out[3] = 0; return; }

    let fx = u * sw - 0.5, fy = v * sh - 0.5;
    fx = fx < 0 ? 0 : fx > sw - 1 ? sw - 1 : fx;
    fy = fy < 0 ? 0 : fy > sh - 1 ? sh - 1 : fy;

    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, sw - 1), y1 = Math.min(y0 + 1, sh - 1);
    const tx = fx - x0, ty = fy - y0;

    const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty);
    const w01 = (1 - tx) * ty, w11 = tx * ty;

    let r = 0, g = 0, b = 0, a = 0;
    const tap = (x, y, wt) => {
        const p = (y * sw + x) * 4;
        const al = S[p + 3] / 255;
        const s = (al / 255) * wt;
        r += S[p] * s; g += S[p + 1] * s; b += S[p + 2] * s; a += al * wt;
    };
    tap(x0, y0, w00); tap(x1, y0, w10); tap(x0, y1, w01); tap(x1, y1, w11);

    out[0] = r; out[1] = g; out[2] = b; out[3] = a;
}

/**
 * Rasterise textured triangles from `src` into premultiplied f32 `dst`.
 *
 * Pixels are written, not blended: a mesh covering the frame decides each
 * pixel once, and blending would only accumulate seams along shared edges.
 *
 * Barycentrics are normalised by the signed area, making the inside test
 * winding-independent so an animated cell may flip inside out mid-shot and
 * keep rasterising.
 *
 * The `>= 0` test is inclusive on all three, so two triangles sharing an
 * edge both claim the pixels on it. Because this rasteriser writes rather
 * than blends, that costs a few duplicate samples and nothing else -- and
 * it rules out the opposite error, an exclusive test that leaves boundary
 * pixels unwritten and shows as diagonal single-pixel seams across a
 * warped photo wherever its grid was subdivided.
 */
export function warpMesh(src, sw, sh, dst, dw, dh, verts, uvs, indices, tris, vcount, y0, y1) {
    const S = src.array, D = dst.array;
    const V = verts.array, U = uvs.array, I = indices.array;
    const px4 = [0, 0, 0, 0];
    // `y0..y1` is this worker's band. No halo is needed: a destination
    // pixel is decided by the single triangle covering it and reads no
    // neighbour, so each worker walks the whole triangle list and clips
    // every bounding box to its own rows.
    const bandLo = Math.min(y0, dh), bandHi = Math.min(y1, dh);
    if (bandLo >= bandHi) return;

    for (let t = 0; t < tris; t++) {
        const i0 = I[t * 3], i1 = I[t * 3 + 1], i2 = I[t * 3 + 2];
        if (i0 >= vcount || i1 >= vcount || i2 >= vcount) continue;

        const ax = V[i0 * 2], ay = V[i0 * 2 + 1];
        const bx = V[i1 * 2], by = V[i1 * 2 + 1];
        const cx = V[i2 * 2], cy = V[i2 * 2 + 1];

        const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
        if (Math.abs(area) < 1e-9) continue;     // a collapsed cell contributes nothing
        const invArea = 1 / area;

        const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
        const x1 = Math.max(0, Math.min(dw, Math.ceil(Math.max(ax, bx, cx)) + 1));
        const ty0 = Math.max(bandLo, Math.max(0, Math.floor(Math.min(ay, by, cy))));
        const ty1 = Math.min(bandHi, Math.max(0, Math.min(dh, Math.ceil(Math.max(ay, by, cy)) + 1)));
        if (ty0 >= ty1) continue;

        const au = U[i0 * 2], av = U[i0 * 2 + 1];
        const bu = U[i1 * 2], bv = U[i1 * 2 + 1];
        const cu = U[i2 * 2], cv = U[i2 * 2 + 1];

        for (let y = ty0; y < ty1; y++) {
            const py = y + 0.5;
            for (let x = x0; x < x1; x++) {
                const pxc = x + 0.5;

                const w0 = ((bx - pxc) * (cy - py) - (by - py) * (cx - pxc)) * invArea;
                const w1 = ((cx - pxc) * (ay - py) - (cy - py) * (ax - pxc)) * invArea;
                const w2 = 1 - w0 - w1;
                if (w0 < 0 || w1 < 0 || w2 < 0) continue;

                sample(S, sw, sh, au * w0 + bu * w1 + cu * w2,
                                  av * w0 + bv * w1 + cv * w2, px4);
                const p = (y * dw + x) * 4;
                D[p] = px4[0]; D[p + 1] = px4[1]; D[p + 2] = px4[2]; D[p + 3] = px4[3];
            }
        }
    }
}

/**
 * Three box passes over premultiplied f32 RGBA, approximating a Gaussian.
 *
 * `scratch` is the same size as `buf`; the passes ping-pong and the result
 * lands back in `buf`.
 *
 * Running sums make this two adds per pixel per axis **regardless of
 * radius**, so a 200px glow costs what a 4px one does. Both callers need
 * that: depth maps must be smoothed before they displace anything, because
 * parallax tears along any one-pixel depth discontinuity, and glow wants a
 * large radius cheaply.
 */
export function blurRgba(buf, scratch, w, h, radius) {
    if (radius <= 0 || w === 0 || h === 0) return;
    const r = Math.min(radius, MAX_BLUR_RADIUS);
    const A = buf.array, B = scratch.array;
    const recip = reciprocals(r);
    for (let pass = 0; pass < 3; pass++) {
        blurAxis(A, B, w, h, r, true, 0, h, recip);
        blurAxis(B, A, w, h, r, false, 0, w, recip);
    }
}

/** Must match `MAX_BLUR_RADIUS` in warp.rs. */
export const MAX_BLUR_RADIUS = 256;

/**
 * One axis pass over a range of lines, for a worker pool.
 *
 * `begin`/`end` index the axis the pass does *not* read across -- rows for
 * a horizontal pass, columns for a vertical one -- which is what makes a
 * band need no halo.
 *
 * The caller must barrier between passes: a vertical pass reads what the
 * horizontal pass wrote, across rows. Omitting the barrier does not crash,
 * it yields a subtly wrong result that varies with worker timing.
 */
export function blurPass(src, dst, w, h, radius, horizontal, begin, end) {
    if (radius <= 0 || w === 0 || h === 0 || begin >= end) return;
    const r = Math.min(radius, MAX_BLUR_RADIUS);
    blurAxis(src.array, dst.array, w, h, r, !!horizontal, begin, end, reciprocals(r));
}

/** `1 / n` for every window size this radius can produce. */
function reciprocals(radius) {
    const t = new Float32Array(2 * radius + 2);
    for (let i = 1; i < t.length; i++) t[i] = 1 / i;
    return t;
}

/**
 * One running-sum box pass along a single axis.
 *
 * The window clamps at the edges and divides by the count actually inside
 * it, so border pixels keep their own brightness. Treating outside as zero
 * -- the usual shortcut -- darkens every border, which on a full-frame
 * glow reads as a vignette nobody asked for.
 */
function blurAxis(src, dst, w, h, radius, horizontal, begin, end, recip) {
    const outer = horizontal ? h : w;
    const inner = horizontal ? w : h;
    const stride = horizontal ? 1 : w;
    const lo = Math.min(begin, outer), hi = Math.min(end, outer);

    for (let o = lo; o < hi; o++) {
        const base = horizontal ? o * w : o;
        let s0 = 0, s1 = 0, s2 = 0, s3 = 0, n = 0;

        const lead = Math.min(radius, inner - 1);
        for (let i = 0; i <= lead; i++) {
            const p = (base + i * stride) * 4;
            s0 += src[p]; s1 += src[p + 1]; s2 += src[p + 2]; s3 += src[p + 3];
            n++;
        }

        for (let i = 0; i < inner; i++) {
            const q = (base + i * stride) * 4;
            const inv = recip[n];
            dst[q] = s0 * inv; dst[q + 1] = s1 * inv;
            dst[q + 2] = s2 * inv; dst[q + 3] = s3 * inv;

            // Add entering, then drop leaving: adding first keeps n from
            // reaching zero on a one-pixel-wide image.
            const enter = i + radius + 1;
            if (enter < inner) {
                const p = (base + enter * stride) * 4;
                s0 += src[p]; s1 += src[p + 1]; s2 += src[p + 2]; s3 += src[p + 3];
                n++;
            }
            if (i >= radius) {
                const p = (base + (i - radius) * stride) * 4;
                s0 -= src[p]; s1 -= src[p + 1]; s2 -= src[p + 2]; s3 -= src[p + 3];
                n--;
            }
        }
    }
}
