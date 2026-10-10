/**
 * Procedural grain tiles, for dry media.
 *
 * # Why generated rather than loaded
 *
 * A textured brush normally ships with image assets. Generating the tile
 * instead keeps the engine's dependency count at zero, keeps a `film.json`
 * self-contained — a brush is described by four numbers rather than by a
 * reference to a file that has to travel with it — and makes the texture
 * *deterministic from a seed*, which the render contract needs anyway.
 *
 * The cost is that these are noise fields, not photographs of paper. For
 * the job they do — modulating dab alpha so a dry medium breaks up — that
 * is sufficient, and `Kernels.stampMask` accepts any u8 buffer, so a real
 * scanned tile can be supplied later with no change below this file.
 *
 * # Strength is baked into the tile
 *
 * Values are generated in `[1 - strength, 1]` rather than `[0, 1]`, so the
 * kernel's `alpha *= texel` *is* `lerp(1, noise, strength)` with no extra
 * parameter in the hot loop and no extra argument across the ABI.
 */

/** Hash an integer to a well-distributed u32. Same construction as `stroke.js`. */
function hash(n) {
    let x = n | 0;
    x = (x ^ 61) ^ (x >>> 16);
    x = (x + (x << 3)) | 0;
    x ^= x >>> 4;
    x = Math.imul(x, 0x27d4eb2d);
    x ^= x >>> 15;
    return x >>> 0;
}

/** A deterministic value in `[0, 1)` for lattice point `(x, y)` at `seed`. */
const lattice = (seed, x, y) => hash(Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ seed) / 4294967296;

/**
 * Smoothly interpolated value noise at one octave.
 *
 * Smoothstep on the fractional part rather than linear: a linear blend
 * leaves visible creases along every lattice line, which on a grain
 * texture reads as a regular grid and defeats the whole purpose.
 */
function valueNoise(seed, x, y, period) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    // Wrap the lattice to `period` so the tile is seamless: sampling at
    // `period` must give exactly what sampling at 0 gives, or every tile
    // boundary shows as a hard line across the canvas.
    const wrap = (v) => ((v % period) + period) % period;
    const x0 = wrap(xi), x1 = wrap(xi + 1);
    const y0 = wrap(yi), y1 = wrap(yi + 1);

    const sx = xf * xf * (3 - 2 * xf);
    const sy = yf * yf * (3 - 2 * yf);

    const n00 = lattice(seed, x0, y0), n10 = lattice(seed, x1, y0);
    const n01 = lattice(seed, x0, y1), n11 = lattice(seed, x1, y1);

    const a = n00 + (n10 - n00) * sx;
    const b = n01 + (n11 - n01) * sx;
    return a + (b - a) * sy;
}

/**
 * Generate a seamless grain tile as u8 values.
 *
 * @param {object} [options]
 * @param {number} [options.size=128]      tile edge, in texels
 * @param {number} [options.seed=1]
 * @param {number} [options.strength=0.5]  how far below 1 the tile may dip
 * @param {number} [options.octaves=3]     fractal detail
 * @param {number} [options.frequency=8]   lattice cells across the tile
 * @returns {{data: Uint8Array, width: number, height: number}}
 *
 * The tile is seamless by construction: every octave wraps its lattice to
 * the tile period, so canvas-locked grain tiles across an arbitrarily
 * large canvas with no visible repeat boundary. A repeat *pattern* is
 * still perceptible at low frequencies on a very large area, which is why
 * `size` defaults to 128 rather than 32.
 */
export function makeGrainTexture({
    size = 128, seed = 1, strength = 0.5, octaves = 3, frequency = 8,
} = {}) {
    const data = new Uint8Array(size * size);
    const s = Math.min(1, Math.max(0, strength));
    const raw = new Float32Array(size * size);
    let lo = Infinity, hi = -Infinity;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let value = 0;
            let amplitude = 1;
            let total = 0;
            let freq = frequency;

            for (let o = 0; o < octaves; o++) {
                value += valueNoise(seed + o * 7919, (x / size) * freq, (y / size) * freq, freq)
                    * amplitude;
                total += amplitude;
                amplitude *= 0.5;
                freq *= 2;
            }
            const n = value / total;
            raw[y * size + x] = n;
            if (n < lo) lo = n;
            if (n > hi) hi = n;
        }
    }

    // Stretch to the full 0..1 range before applying strength.
    //
    // Summed octaves of value noise are a mean of several independent
    // uniform samples, so they concentrate sharply around 0.5 -- measured,
    // three octaves spanned only 0.35 to 0.94 rather than 0 to 1. Without
    // this, `strength` is a lie: asking for 0.7 produced roughly 0.4 of
    // actual modulation, and no setting could reach full contrast.
    //
    // Normalising against the tile's own extremes also keeps every seed
    // equally contrasty, instead of leaving some seeds flat by chance.
    const span = hi - lo;
    const norm = span > 1e-6 ? 1 / span : 0;

    for (let i = 0; i < raw.length; i++) {
        const n = span > 1e-6 ? (raw[i] - lo) * norm : 1;
        // Map into [1 - strength, 1] so the kernel's multiply is already a
        // strength-weighted blend, with no extra parameter in the hot loop.
        data[i] = Math.round((1 - s + s * n) * 255);
    }
    return { data, width: size, height: size };
}

/** Texture application modes, matching `tex_mode` in `raster.rs`. */
export const TEXTURE_MODES = { none: 0, canvas: 1, dab: 2 };

/**
 * Build a grain tile from an image's pixels.
 *
 * This is the path for a real scanned paper or canvas texture, which a
 * generated noise field cannot imitate -- paper has structure (fibres,
 * a weave, a laid pattern) and noise has only statistics.
 *
 * @param {{data: Uint8ClampedArray|Uint8Array, width: number, height: number}} image
 *   An `ImageData`, or anything shaped like one.
 * @param {object} [options]
 * @param {number} [options.strength=1]  how far below 1 the tile may dip
 * @param {boolean} [options.normalize=true]
 * @param {boolean} [options.invert=false]
 *
 * # Luminance, and why it is not the blend weights
 *
 * Coverage comes from `(r + g + b) / 3`, a flat average, **not** from the
 * perceptual luminance used in `blend.js`. Those weights exist to model
 * how bright a colour *looks*; here the image is standing in for the
 * height of a physical surface, and a green fibre is not twice as tall as
 * a red one because the eye is more sensitive to it. Using luminance
 * weights makes a coloured scan grain unevenly by hue, which looks like a
 * printing fault.
 *
 * Alpha is ignored: a transparent texel means "no data", and treating it
 * as zero coverage would punch holes in the stroke.
 *
 * # Normalising
 *
 * On by default, for the same reason the generated tiles normalise: a
 * photograph of paper occupies a narrow band of mid-greys, so without a
 * stretch `strength: 1` would deliver a fraction of its range and no
 * setting could reach full contrast.
 */
export function textureFromImage(image, { strength = 1, normalize = true, invert = false } = {}) {
    const { data, width, height } = image;
    const n = width * height;
    const raw = new Float32Array(n);
    let lo = Infinity, hi = -Infinity;

    for (let i = 0; i < n; i++) {
        let v = (data[i * 4] + data[i * 4 + 1] + data[i * 4 + 2]) / 765;   // 3 * 255
        if (invert) v = 1 - v;
        raw[i] = v;
        if (v < lo) lo = v;
        if (v > hi) hi = v;
    }

    const span = hi - lo;
    const norm = normalize && span > 1e-6 ? 1 / span : 0;
    const s = Math.min(1, Math.max(0, strength));
    const out = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
        const v = norm ? (raw[i] - lo) * norm : raw[i];
        out[i] = Math.round((1 - s + s * v) * 255);
    }
    return { data: out, width, height };
}
