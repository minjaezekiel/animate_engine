/**
 * Layer compositing in JavaScript. Mirrors `rust/jirex-kernels/src/blend.rs`.
 *
 * The W3C formula for a source composited over a backdrop with blend
 * function `B`:
 *
 * ```text
 *   co = (1 - ab)·cs + (1 - as)·cb + as·ab·B(Cb, Cs)
 *   ao = as + ab·(1 - as)
 * ```
 *
 * Lowercase is premultiplied, uppercase is straight. That mismatch is the
 * trap: `B` is defined on straight colour, so a premultiplied buffer must
 * un-divide before calling it. Applying `B` to premultiplied values
 * weights each colour by its own coverage and drags every blend toward
 * black wherever either layer is partly transparent -- and it looks almost
 * right at full opacity, so it survives casual inspection.
 */

/** Separable blend modes, matching blend.rs. */
export const MODES = {
    normal: 0, multiply: 1, screen: 2, overlay: 3,
    darken: 4, lighten: 5, colorDodge: 6, colorBurn: 7,
    hardLight: 8, softLight: 9, difference: 10, exclusion: 11, add: 12,
    // Non-separable: each transplants one attribute of a colour -- its
    // hue, saturation or luminosity -- onto the other, which cannot be
    // done per channel.
    hue: 13, saturation: 14, color: 15, luminosity: 16,
};

/** The first non-separable mode, so callers can branch on the boundary. */
export const FIRST_NON_SEPARABLE = MODES.hue;

/**
 * Perceived luminosity, with the W3C coefficients.
 *
 * 0.3 / 0.59 / 0.11, not Rec. 709's 0.2126 / 0.7152 / 0.0722. They differ
 * visibly on saturated colours, and the point of these modes is to match
 * Photoshop, Figma and a browser's `mix-blend-mode` -- so the older NTSC
 * weights the specification names are the correct ones here.
 */
const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];

/**
 * Pull a colour back inside the unit cube **without changing its hue**.
 *
 * Clamping each channel independently shifts the hue, because the
 * channels are clamped by different amounts. Scaling toward the colour's
 * own luminosity moves it along the grey axis instead. This is the step
 * most often skipped, and the symptom is a `luminosity` layer whose
 * highlights drift toward whichever primary clipped first.
 */
function clipColor(c) {
    const l = lum(c);
    const n = Math.min(c[0], c[1], c[2]);
    const x = Math.max(c[0], c[1], c[2]);
    let out = c;
    if (n < 0) {
        const d = l - n;
        if (d > 1e-9) out = out.map((v) => l + ((v - l) * l) / d);
    }
    if (x > 1) {
        const d = x - l;
        if (d > 1e-9) out = out.map((v) => l + ((v - l) * (1 - l)) / d);
    }
    return out;
}

/** Move a colour to a target luminosity, keeping hue and saturation. */
function setLum(c, l) {
    const d = l - lum(c);
    return clipColor([c[0] + d, c[1] + d, c[2] + d]);
}

/** Saturation as the specification defines it: the channel range. */
const sat = (c) => Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);

/**
 * Rescale to a target saturation, keeping the channel *ordering* -- which
 * is what keeps the hue.
 *
 * Indices are tracked rather than the values sorted and written back in
 * order; doing that would rotate the hue instead of preserving it.
 */
function setSat(c, s) {
    let imin = 0, imax = 0;
    for (let i = 1; i < 3; i++) {
        if (c[i] < c[imin]) imin = i;
        if (c[i] > c[imax]) imax = i;
    }
    if (imin === imax) return [0, 0, 0];     // fully grey: no ordering to keep
    const imid = 3 - imin - imax;
    const out = [0, 0, 0];
    const span = c[imax] - c[imin];
    out[imid] = span > 1e-9 ? ((c[imid] - c[imin]) * s) / span : 0;
    out[imax] = s;
    out[imin] = 0;
    return out;
}

/** `B(Cb, Cs)` for the four non-separable modes, on straight colour. */
function blendNonSeparable(mode, cb, cs) {
    switch (mode) {
        case MODES.hue: return setLum(setSat(cs, sat(cb)), lum(cb));
        case MODES.saturation: return setLum(setSat(cb, sat(cs)), lum(cb));
        case MODES.color: return setLum(cs, lum(cb));
        case MODES.luminosity: return setLum(cb, lum(cs));
        default: return cs;
    }
}

/** Names, for a UI or an agent enumerating its options. */
export const MODE_NAMES = Object.keys(MODES);

/**
 * Resolve a blend mode name to its number.
 *
 * Throws on an unknown name rather than falling back to `normal`: a typo
 * that silently composites normally is invisible until someone compares
 * two renders.
 */
export function modeId(name) {
    if (typeof name === 'number') return name;
    const id = MODES[name];
    if (id === undefined) {
        throw new Error(`unknown blend mode "${name}"; available: ${MODE_NAMES.join(', ')}`);
    }
    return id;
}

/** `B(Cb, Cs)` for one channel, on straight colour in 0..1. */
function blend(mode, cb, cs) {
    switch (mode) {
        case MODES.multiply: return cb * cs;
        case MODES.screen: return cb + cs - cb * cs;
        // Overlay is hard-light with the operands swapped; defining it
        // that way keeps the two consistent by construction.
        case MODES.overlay: return blend(MODES.hardLight, cs, cb);
        case MODES.darken: return Math.min(cb, cs);
        case MODES.lighten: return Math.max(cb, cs);
        case MODES.colorDodge:
            if (cb <= 0) return 0;
            if (cs >= 1) return 1;
            return Math.min(1, cb / (1 - cs));
        case MODES.colorBurn:
            if (cb >= 1) return 1;
            if (cs <= 0) return 0;
            return 1 - Math.min(1, (1 - cb) / cs);
        case MODES.hardLight:
            if (cs <= 0.5) return cb * (2 * cs);
            { const d = 2 * cs - 1; return cb + d - cb * d; }
        case MODES.softLight: {
            if (cs <= 0.5) return cb - (1 - 2 * cs) * cb * (1 - cb);
            // Below 0.25 the specification uses the polynomial rather than
            // the square root, which is what keeps the curve continuous.
            const d = cb <= 0.25 ? ((16 * cb - 12) * cb + 4) * cb : Math.sqrt(cb);
            return cb + (2 * cs - 1) * (d - cb);
        }
        case MODES.difference: return Math.abs(cb - cs);
        case MODES.exclusion: return cb + cs - 2 * cb * cs;
        // `add` is a Porter-Duff composite operator rather than a W3C
        // blend mode, expressed here as unbounded addition. Glows want it.
        case MODES.add: return Math.min(1, cb + cs);
        default: return cs;
    }
}

/**
 * Composite `src` onto `dst` in place, both premultiplied f32 RGBA.
 *
 * `normal` is split out and takes the direct source-over path: it is
 * overwhelmingly the common mode and it avoids the un-divide entirely.
 */
export function blendLayers(dst, src, w, h, mode, opacity, mask, clip, clipMask, y0, y1) {
    const D = dst.array, S = src.array;
    const M = mask ? mask.array : null;
    const C = clip ? clip.array : null;
    const CM = clipMask ? clipMask.array : null;
    const lo = Math.min(y0, h) * w, hi = Math.min(y1, h) * w;
    const op = Math.min(1, Math.max(0, opacity));
    if (op <= 0) return;

    for (let i = lo; i < hi; i++) {
        const p = i * 4;

        // Both are premultiplied RGBA buffers read for their alpha, which
        // is what lets a mask simply *be* a PaintSurface painted with the
        // ordinary brush engine, and a clip be the base layer's own buffer
        // read in place with no snapshot. See blend.rs.
        // Three sources: the layer's own mask, the alpha of the layer it
        // is clipped to, and that base layer's own mask. Omitting the last
        // keeps a shading pass visible over a region its subject was
        // masked out of.
        let k = op;
        if (M) k *= Math.min(1, Math.max(0, M[p + 3]));
        if (C) k *= Math.min(1, Math.max(0, C[p + 3]));
        if (CM) k *= Math.min(1, Math.max(0, CM[p + 3]));
        if (k <= 0) continue;

        const sa = S[p + 3] * k;
        if (sa <= 0) continue;
        const s0 = S[p] * k, s1 = S[p + 1] * k, s2 = S[p + 2] * k;

        if (mode === MODES.normal) {
            const inv = 1 - sa;
            D[p] = s0 + D[p] * inv;
            D[p + 1] = s1 + D[p + 1] * inv;
            D[p + 2] = s2 + D[p + 2] * inv;
            D[p + 3] = sa + D[p + 3] * inv;
            continue;
        }

        const ba = D[p + 3];
        if (ba <= 0) {
            // Nothing to blend against: the blend term vanishes and the
            // formula collapses to plain source-over.
            D[p] = s0; D[p + 1] = s1; D[p + 2] = s2; D[p + 3] = sa;
            continue;
        }

        const invSa = 1 / sa, invBa = 1 / ba;
        const outA = sa + ba * (1 - sa);
        const s = [s0, s1, s2];
        const cs = [0, 1, 2].map((c) => Math.min(1, Math.max(0, s[c] * invSa)));
        const cb = [0, 1, 2].map((c) => Math.min(1, Math.max(0, D[p + c] * invBa)));

        // The non-separable modes need all three channels at once, so they
        // are evaluated once per pixel rather than once per channel.
        const bl = mode >= FIRST_NON_SEPARABLE
            ? blendNonSeparable(mode, cb, cs)
            : [blend(mode, cb[0], cs[0]), blend(mode, cb[1], cs[1]), blend(mode, cb[2], cs[2])];

        for (let c = 0; c < 3; c++) {
            D[p + c] = (1 - ba) * s[c] + (1 - sa) * D[p + c] + sa * ba * bl[c];
        }
        D[p + 3] = outA;
    }
}

/** Copy `n` floats. Used to snapshot a layer before a destructive edit. */
export function copyF32(src, dst, n) {
    dst.array.set(src.array.subarray(0, n));
}
