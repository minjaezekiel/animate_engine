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
};

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
export function blendLayers(dst, src, w, h, mode, opacity, y0, y1) {
    const D = dst.array, S = src.array;
    const lo = Math.min(y0, h) * w, hi = Math.min(y1, h) * w;
    const op = Math.min(1, Math.max(0, opacity));
    if (op <= 0) return;

    for (let i = lo; i < hi; i++) {
        const p = i * 4;
        const sa = S[p + 3] * op;
        if (sa <= 0) continue;
        const s0 = S[p] * op, s1 = S[p + 1] * op, s2 = S[p + 2] * op;

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
        for (let c = 0; c < 3; c++) {
            const cs = Math.min(1, Math.max(0, s[c] * invSa));
            const cb = Math.min(1, Math.max(0, D[p + c] * invBa));
            D[p + c] = (1 - ba) * s[c] + (1 - sa) * D[p + c]
                + sa * ba * blend(mode, cb, cs);
        }
        D[p + 3] = outA;
    }
}

/** Copy `n` floats. Used to snapshot a layer before a destructive edit. */
export function copyF32(src, dst, n) {
    dst.array.set(src.array.subarray(0, n));
}
