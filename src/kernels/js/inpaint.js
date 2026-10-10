/**
 * Hole filling in JavaScript.
 *
 * Mirrors `rust/jirex-kernels/src/inpaint.rs` line for line. See that file
 * for why push-pull is the right rung of the ladder here, and why the
 * weight cannot be the alpha channel.
 */

/** Floats of scratch each pixel of each pyramid level needs. */
export const INPAINT_STRIDE = 5;

/** Scratch floats needed to inpaint a `w` by `h` image. */
export function inpaintScratch(w, h) {
    let total = 0;
    let lw = Math.max(1, w), lh = Math.max(1, h);
    for (;;) {
        total += lw * lh * INPAINT_STRIDE;
        if (lw === 1 && lh === 1) break;
        lw = Math.max(1, lw >> 1);
        lh = Math.max(1, lh >> 1);
    }
    return total;
}

/**
 * Fill the masked pixels of a premultiplied f32 RGBA image, in place.
 *
 * @param {{array: Float32Array}} img      premultiplied f32 RGBA
 * @param {{array: Float32Array}} mask     one float per pixel; > 0.5 is a hole
 * @param {number} w
 * @param {number} h
 * @param {{array: Float32Array}} scratch  at least `inpaintScratch(w, h)` long
 */
export function inpaintPushPull(img, mask, w, h, scratch) {
    if (w === 0 || h === 0) return;
    const I = img.array, M = mask.array, S = scratch.array;

    const dims = [];
    const offsets = [];
    let lw = w, lh = h, cursor = 0;
    for (;;) {
        dims.push([lw, lh]);
        offsets.push(cursor);
        cursor += lw * lh * INPAINT_STRIDE;
        if (lw === 1 && lh === 1) break;
        lw = Math.max(1, lw >> 1);
        lh = Math.max(1, lh >> 1);
    }
    const levels = dims.length;

    // Level 0: known pixels enter at weight 1, holes at weight 0. The
    // colour is stored already multiplied by the weight, so a sum is a
    // weighted sum with no second pass.
    const base = offsets[0];
    for (let i = 0; i < w * h; i++) {
        const s = base + i * INPAINT_STRIDE;
        if (M[i] > 0.5) {
            for (let c = 0; c < INPAINT_STRIDE; c++) S[s + c] = 0;
        } else {
            const p = i * 4;
            S[s] = I[p]; S[s + 1] = I[p + 1]; S[s + 2] = I[p + 2]; S[s + 3] = I[p + 3];
            S[s + 4] = 1;
        }
    }

    // Pull: a parent is the sum of its children, weights included.
    for (let l = 1; l < levels; l++) {
        const [pw, ph] = dims[l];
        const [cw, ch] = dims[l - 1];
        const parent = offsets[l], child = offsets[l - 1];
        for (let y = 0; y < ph; y++) {
            for (let x = 0; x < pw; x++) {
                const acc = [0, 0, 0, 0, 0];
                // Clamped 2x2: an odd dimension leaves a last row or column
                // with one child, and clamping counts it once rather than
                // counting a neighbour twice.
                for (let dy = 0; dy < 2; dy++) {
                    const sy = y * 2 + dy;
                    if (sy >= ch) continue;
                    for (let dx = 0; dx < 2; dx++) {
                        const sx = x * 2 + dx;
                        if (sx >= cw) continue;
                        const s = child + (sy * cw + sx) * INPAINT_STRIDE;
                        for (let c = 0; c < INPAINT_STRIDE; c++) acc[c] += S[s + c];
                    }
                }
                const p = parent + (y * pw + x) * INPAINT_STRIDE;
                for (let c = 0; c < INPAINT_STRIDE; c++) S[p + c] = acc[c];
            }
        }
    }

    // Push: coarse to fine, each level completed from the one above it.
    for (let l = levels - 2; l >= 0; l--) {
        const [cw, ch] = dims[l];
        const [pw, ph] = dims[l + 1];
        const fine = offsets[l], coarse = offsets[l + 1];
        const full = (1 << l) * (1 << l);
        for (let y = 0; y < ch; y++) {
            for (let x = 0; x < cw; x++) {
                const f = fine + (y * cw + x) * INPAINT_STRIDE;
                const weight = S[f + 4];
                const coverage = Math.min(1, weight / full);
                if (coverage >= 1) continue;

                const px = Math.min(x >> 1, pw - 1), py = Math.min(y >> 1, ph - 1);
                const p = coarse + (py * pw + px) * INPAINT_STRIDE;
                const pweight = S[p + 4];
                if (pweight <= 0) continue;

                for (let c = 0; c < 4; c++) {
                    const own = weight > 0 ? S[f + c] / weight : 0;
                    const up = S[p + c] / pweight;
                    // Mixing by coverage rather than replacing keeps a
                    // half-known pixel half its own, which is what stops a
                    // visible step at the hole's edge.
                    S[f + c] = (own * coverage + up * (1 - coverage)) * full;
                }
                S[f + 4] = full;
            }
        }
    }

    for (let i = 0; i < w * h; i++) {
        if (M[i] <= 0.5) continue;
        const s = base + i * INPAINT_STRIDE;
        const weight = S[s + 4];
        const p = i * 4;
        if (weight <= 0) {
            I[p] = I[p + 1] = I[p + 2] = I[p + 3] = 0;
            continue;
        }
        for (let c = 0; c < 4; c++) I[p + c] = S[s + c] / weight;
    }
}
