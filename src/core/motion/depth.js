/**
 * Monocular depth estimation: turn one photograph into the depth map that
 * [`PhotoMotion`] needs for parallax and for mesh tearing.
 *
 * ```js
 * const est = new DepthEstimator({ modelUrl: DEPTH_MODELS.depthAnythingV2Small.url });
 * if (await est.available()) {
 *     const depth = await est.estimate({ data, width, height });   // u8 RGBA
 *     new PhotoMotion(kernels, { source, depth, tear: true, effects: [...] });
 * }
 * ```
 *
 * # Why a model, and why this one shape
 *
 * Parallax needs to know what is near. Nothing in a single photograph says
 * so, and no amount of image processing recovers it -- depth from one view
 * is a learned prior, not a measurement. So this is the one place in the
 * engine where a neural network earns its download.
 *
 * It follows the same rules as the TTS voices, which are the precedent:
 *
 *   - **`onnxruntime-web`, imported lazily by bare specifier.** The page
 *     supplies it through an import map (see `docs/CDN-AND-PWA.md`), so it
 *     is never a hard dependency and nothing that does not estimate depth
 *     pays for it.
 *   - **[`available`] never throws.** A missing runtime, a missing model
 *     or a browser without WebAssembly all come back `false`, and the
 *     caller falls back to supplying a map by hand or to effects that
 *     need no depth.
 *   - **The model is a url, not a bundled file.** Depth models are tens of
 *     megabytes; shipping one in the package would dwarf the engine.
 *
 * # Model-agnostic on purpose
 *
 * [`estimate`] reads the input and output names off the session and the
 * spatial dims off the output tensor, so any single-image depth model with
 * an `NCHW` float input and an `N(1)HW` float output works. That is most
 * of them -- MiDaS, Depth Anything, DPT -- and it means a better model is
 * a url change rather than a code change.
 *
 * The one thing a caller must get right is `near`: some models predict
 * **inverse** depth, where a larger number is closer (MiDaS, Depth
 * Anything), and some predict metric distance, where a larger number is
 * further. `PhotoMotion` reads white as near, so a metric model needs
 * `near: 'low'`.
 *
 * # Node as well as the browser
 *
 * `onnxruntime-node` and `onnxruntime-web` expose the same
 * `InferenceSession` and `Tensor`, so one adapter covers both and
 * [`DepthEstimator`] tries whichever belongs where it is running. That is
 * what makes `photo_estimate_depth` possible on the headless MCP surface:
 * an agent can take a photograph, derive its depth map and animate it
 * without a browser anywhere in the loop.
 *
 * The runtime stays **optional** in both places. The browser path is a
 * page's import map, the Node path is an install the user chooses, and
 * neither is a dependency of this package -- `available()` returns false
 * and the caller falls back to supplying a map by hand. Everything here
 * except [`load`] is pure, and [`estimate`] reaches the session through
 * the instance, so the Node tests drive the whole pipeline against a stub
 * -- the same way the voice providers are tested without a network.
 */

/**
 * Known single-image depth models, as candidates rather than defaults.
 *
 * There is deliberately **no default url**. A wrong one fails as a 404
 * halfway through a 50MB fetch, which is a bad way to learn that a
 * constant went stale; naming the choice at the call site keeps it the
 * caller's, and keeps this table honest about what it is -- a starting
 * point to verify, not a promise. `size` and the normalisation below are
 * each model's documented preprocessing.
 */
export const DEPTH_MODELS = {
    depthAnythingV2Small: {
        url: 'https://huggingface.co/onnx-community/depth-anything-v2-small/resolve/main/onnx/model.onnx',
        size: 518,
        near: 'high',
        note: 'Depth Anything V2 (small). Relative inverse depth; best quality per byte.',
    },
    midasV21Small: {
        url: 'https://huggingface.co/julienkay/sentis-MiDaS/resolve/main/midas_v21_small_256.onnx',
        size: 256,
        near: 'high',
        note: 'MiDaS v2.1 small. Older and coarser, but a quarter of the size.',
    },
};

/** ImageNet normalisation, which every model in the table above expects. */
export const IMAGENET = { mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] };

/**
 * Bilinear resample of a u8 RGBA image.
 *
 * Bilinear both ways: downsampling to the model's input and upsampling the
 * result back. Nearest would alias the input and terrace the output, and a
 * terraced depth map produces visible steps marching across the picture --
 * the same reason [`sampleDepth`] in `PhotoMotion.js` is bilinear.
 *
 * @param {{data: Uint8Array|Uint8ClampedArray, width: number, height: number}} image
 * @returns {{data: Uint8Array, width: number, height: number}}
 */
export function resizeRgba(image, width, height) {
    const { data: src, width: sw, height: sh } = image;
    const out = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y++) {
        // Pixel centres, so the sample grid is centred rather than biased
        // half a pixel toward the origin.
        const fy = Math.min(sh - 1, Math.max(0, (y + 0.5) * sh / height - 0.5));
        const y0 = Math.floor(fy), y1 = Math.min(y0 + 1, sh - 1), ty = fy - y0;
        for (let x = 0; x < width; x++) {
            const fx = Math.min(sw - 1, Math.max(0, (x + 0.5) * sw / width - 0.5));
            const x0 = Math.floor(fx), x1 = Math.min(x0 + 1, sw - 1), tx = fx - x0;
            const o = (y * width + x) * 4;
            for (let c = 0; c < 4; c++) {
                const a = src[(y0 * sw + x0) * 4 + c], b = src[(y0 * sw + x1) * 4 + c];
                const d = src[(y1 * sw + x0) * 4 + c], e = src[(y1 * sw + x1) * 4 + c];
                const top = a + (b - a) * tx, bot = d + (e - d) * tx;
                out[o + c] = Math.round(top + (bot - top) * ty);
            }
        }
    }
    return { data: out, width, height };
}

/**
 * Pack a u8 RGBA image into an `NCHW` float tensor, normalised.
 *
 * The image is resized to a square. Letterboxing would preserve aspect but
 * pads with a colour the model reads as *something* -- usually a flat
 * surface at an arbitrary distance, right at the frame edge where parallax
 * displaces most. Squashing distorts the prior slightly and nothing else,
 * and the prediction is resampled back to the real aspect afterwards, so
 * the depth still lands on the right pixels.
 *
 * @returns {Float32Array} length `3 * size * size`
 */
export function toNchw(image, size, { mean, std } = IMAGENET) {
    const { data } = resizeRgba(image, size, size);
    const out = new Float32Array(3 * size * size);
    const plane = size * size;
    for (let i = 0; i < plane; i++) {
        for (let c = 0; c < 3; c++) {
            out[c * plane + i] = (data[i * 4 + c] / 255 - mean[c]) / std[c];
        }
    }
    return out;
}

/**
 * Turn a raw depth prediction into the greyscale u8 RGBA image that
 * `PhotoMotion` takes, resampled to the source size.
 *
 * The values are normalised to the prediction's **own** extremes. Relative
 * depth models have no absolute scale -- the numbers mean nothing beyond
 * their order -- so the only sane mapping is the observed range, exactly
 * as `makeGrainTexture` normalises to its own tile.
 *
 * `min` and `max` come back on the result because a flat prediction is a
 * real failure mode worth seeing: a map with no range makes parallax a
 * uniform pan, which is precisely the degenerate case `PhotoMotion` goes
 * out of its way to refuse.
 *
 * @param {Float32Array|number[]} values raw prediction, row-major
 * @param {number} w  prediction width
 * @param {number} h  prediction height
 * @param {number} outW
 * @param {number} outH
 * @param {'high'|'low'} near which end of the range is closest to camera
 */
export function depthToImage(values, w, h, outW, outH, near = 'high') {
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < w * h; i++) {
        const v = values[i];
        if (!Number.isFinite(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
    }
    if (!Number.isFinite(min)) { min = 0; max = 0; }
    const span = max - min;
    // A flat field would divide by zero; mid-grey keeps it a valid image
    // and `max - min === 0` on the result says what happened.
    const scale = span > 1e-9 ? 255 / span : 0;
    const flat = span <= 1e-9 ? 128 : 0;

    const raw = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
        const v = Number.isFinite(values[i]) ? values[i] : min;
        let g = span > 1e-9 ? (v - min) * scale : flat;
        if (near === 'low') g = 255 - g;
        g = Math.max(0, Math.min(255, Math.round(g)));
        raw[i * 4] = raw[i * 4 + 1] = raw[i * 4 + 2] = g;
        raw[i * 4 + 3] = 255;
    }
    const image = (w === outW && h === outH)
        ? { data: raw, width: w, height: h }
        : resizeRgba({ data: raw, width: w, height: h }, outW, outH);
    return { ...image, min, max };
}

/** The trailing two dimensions of a tensor's `dims`, as `[height, width]`. */
function spatialDims(dims, fallback) {
    const d = (dims ?? []).filter((n) => n > 1);
    if (d.length >= 2) return [d[d.length - 2], d[d.length - 1]];
    return [fallback, fallback];
}

/**
 * A loaded depth model.
 *
 * Mirrors the voice providers: a pinned url, an injectable module, an
 * [`available`] probe that never throws, and a lazy [`load`]. Nothing in
 * the engine depends on it existing.
 */
export class DepthEstimator {
    /**
     * @param {object} options
     * @param {string} options.modelUrl   an `.onnx` file; see [`DEPTH_MODELS`]
     * @param {number} [options.size=518] the model's square input edge
     * @param {'high'|'low'} [options.near='high']
     *   Whether a larger predicted value means closer. Inverse-depth models
     *   (MiDaS, Depth Anything) are `high`; metric models are `low`.
     * @param {object} [options.normalise=IMAGENET]
     * @param {object} [options.ort]      an injected onnxruntime module
     * @param {string|string[]} [options.runtime]
     *   Module specifier(s) for the ONNX runtime, tried in order. The
     *   default depends on where this is running: `onnxruntime-node` first
     *   under Node, since it is the one that exists there, and
     *   `onnxruntime-web` in a browser, where the page's import map
     *   supplies it. Both expose the same `InferenceSession` and `Tensor`,
     *   which is why one adapter covers both.
     * @param {object} [options.sessionOptions] passed to `InferenceSession.create`
     */
    constructor({ modelUrl, size = 518, near = 'high', normalise = IMAGENET,
                  ort = null, runtime = null,
                  sessionOptions = { executionProviders: ['wasm'] } } = {}) {
        this.modelUrl = modelUrl ?? null;
        this.size = size;
        this.near = near;
        this.normalise = normalise;
        this.runtime = runtime == null
            ? (typeof process !== 'undefined' && process.versions?.node
                ? ['onnxruntime-node', 'onnxruntime-web']
                : ['onnxruntime-web'])
            : (Array.isArray(runtime) ? runtime : [runtime]);
        this.sessionOptions = sessionOptions;
        this.ort = ort;
        this.session = null;
    }

    /**
     * Fetch the runtime and the model. Idempotent.
     *
     * The session is kept, because creating it is the expensive half and a
     * film with eight photographs in it should pay once.
     */
    async load() {
        if (this.session) return this.session;
        if (!this.modelUrl) {
            throw new Error('DepthEstimator needs a modelUrl; see DEPTH_MODELS for candidates');
        }
        if (!this.ort) this.ort = await this._loadRuntime();
        this.session = await this.ort.InferenceSession.create(this.modelUrl, this.sessionOptions);
        return this.session;
    }

    /**
     * Import the first runtime that resolves.
     *
     * The failure message names every candidate it tried, because "cannot
     * find module" for a package the caller never heard of is the worst
     * possible way to learn that depth estimation needs a runtime.
     */
    async _loadRuntime() {
        const failures = [];
        for (const specifier of this.runtime) {
            try {
                return await import(/* @vite-ignore */ specifier);
            } catch (error) {
                failures.push(`${specifier}: ${error.message.split('\n')[0]}`);
            }
        }
        throw new Error('no ONNX runtime available. Tried '
            + `${this.runtime.join(', ')}. In Node install one with `
            + '`npm i onnxruntime-node`; in a browser add onnxruntime-web to the '
            + `import map. (${failures.join(' | ')})`);
    }

    /** True if a depth map can actually be produced here. Never throws. */
    async available() {
        if (typeof WebAssembly === 'undefined') return false;
        try { await this.load(); return true; } catch { return false; }
    }

    /**
     * Estimate depth for one image.
     *
     * @param {{data: Uint8Array|Uint8ClampedArray, width: number, height: number}} image
     *   u8 RGBA. In a browser, `createImageBitmap` plus a canvas
     *   `getImageData` produces this from any format the browser decodes,
     *   which is how JPEG gets in without a JPEG decoder here.
     * @returns {Promise<{data: Uint8Array, width: number, height: number,
     *                    min: number, max: number}>}
     *   Greyscale, white near, at the source image's size -- ready to hand
     *   straight to `PhotoMotion` as `depth`. `min === max` means the model
     *   returned a flat field and parallax would be a uniform pan.
     */
    async estimate(image) {
        const session = await this.load();
        const input = toNchw(image, this.size, this.normalise);
        const name = session.inputNames?.[0] ?? 'input';
        const tensor = new this.ort.Tensor('float32', input, [1, 3, this.size, this.size]);
        const result = await session.run({ [name]: tensor });
        const outName = session.outputNames?.[0] ?? Object.keys(result)[0];
        const out = result[outName] ?? result[Object.keys(result)[0]];
        const [h, w] = spatialDims(out.dims, this.size);
        return depthToImage(out.data, w, h, image.width, image.height, this.near);
    }
}

/**
 * Find the depth levels that separate the planes in a depth field.
 *
 * This is what `tear.at` defaults to.
 *
 * # Two wrong answers first, because both are tempting
 *
 * **The midpoint of the observed range** assumes the distribution is
 * symmetric, and it never is: a background occupies most of the frame
 * while a subject occupies a narrow band near the top of the range.
 *
 * **Otsu's method** is the textbook thresholder and is also wrong here,
 * which is worth stating because it is the obvious fix. Otsu maximises the
 * variance *between* the two classes, so it splits whichever class is most
 * spread out. Measured on a subject at 0.95 against a background spread
 * evenly over 0.0-0.8, Otsu returns **0.499** -- it cuts the background in
 * half and leaves the subject attached to the front of it, landing within
 * four thousandths of the midpoint it was supposed to improve on.
 *
 * # What a plane boundary actually is
 *
 * A gap. Two planes are two clusters of depth with **nothing between
 * them**, and the thing to look for is therefore a *valley* in the
 * histogram, not a balance point. So: smooth the histogram, find its local
 * minima, and rank them by prominence -- how far the valley sits below the
 * lower of the two peaks flanking it.
 *
 * That gives a property the other two cannot: on a depth field with no
 * planes at all -- a continuous ramp, a landscape receding to the horizon
 * -- there is no valley, and this returns **nothing**. Tearing a
 * continuous surface is meaningless, so declining to is the right answer,
 * and it means `tear: true` is safe to set on any photograph.
 *
 * # Read the depth map, not the mesh
 *
 * Pass the depth *image*. Running this over the mesh's sampled depths
 * instead looks equivalent and is not: the grid samples the map
 * bilinearly, so a hard silhouette arrives as a one-cell ramp, and the
 * ramp's mid value is a third cluster with a gap on either side of it.
 * The detector then reads a two-plane scene as three and cuts at the wrong
 * gap -- measured, that put the tear half a cell off the silhouette and
 * the near piece inherited the ramp's depth, so it barely moved. The map's
 * own pixels have no ramp.
 *
 * @param {ArrayLike<number>|{data: ArrayLike<number>, width: number, height: number}} values
 *   depths in any range, or a greyscale u8 RGBA depth image
 * @param {number} [count=1]   how many levels to return, most prominent first
 * @param {object} [options]
 * @param {number} [options.bins=64]
 *   Fewer bins is inherently smoother and invents fewer valleys. 64 is not
 *   arbitrary: a histogram needs several samples a bin to mean anything,
 *   and *more* bins than the field has distinct values combs it -- an
 *   8-bit ramp 96 pixels wide occupies 96 of 128 bins and leaves 32 empty
 *   ones interleaved, every one of which reads as a gap. Measured, 128
 *   bins put a spurious level at 0.028 on a perfectly linear ramp.
 * @param {number} [options.smooth=3] box-smoothing passes over the histogram
 * @param {number} [options.minShare=0.02]
 *   Each side of a valley must hold at least this share of the values, so
 *   one stray pixel cannot pass for a plane.
 * @param {number} [options.minDrop=0.2]
 *   A valley must sit at least this far below the lower of its two peaks,
 *   as a fraction of that peak. This is what makes a *flat* histogram
 *   return nothing: smoothing a uniform field against its clamped ends
 *   leaves shallow dips at the edges, and without a relative floor one of
 *   them passes for a plane boundary. Measured on a perfectly linear ramp,
 *   that produced a spurious level at 0.067.
 * @returns {number[]} levels in value space, ascending; `[]` if the field
 *   has no separable planes.
 */
export function depthPlanes(values, count = 1,
                            { bins = 64, smooth = 3, minShare = 0.02, minDrop = 0.2 } = {}) {
    // An image is walked rather than flattened into an array: a 4K depth
    // map is twelve million values, and materialising them to build a
    // 128-bin histogram would be 48MB of pure waste.
    const image = values?.data && values.width ? values : null;
    const count_ = image ? image.width * image.height : values.length;
    const each = image
        ? (fn) => {
            const d = image.data;
            for (let i = 0; i < count_; i++) fn((d[i * 4] + d[i * 4 + 1] + d[i * 4 + 2]) / 765);
        }
        : (fn) => { for (let i = 0; i < count_; i++) fn(values[i]); };

    let min = Infinity, max = -Infinity;
    each((v) => { if (v < min) min = v; if (v > max) max = v; });
    if (!(max > min) || count < 1) return [];

    let hist = new Float64Array(bins);
    const scale = (bins - 1) / (max - min);
    each((v) => { hist[Math.round((v - min) * scale)]++; });
    const total = count_;

    // Smoothing is what separates a valley from sampling noise. Without it
    // a histogram of a photograph is full of one-bin dips, every one of
    // which would read as a plane boundary.
    for (let pass = 0; pass < smooth; pass++) {
        const out = new Float64Array(bins);
        for (let i = 0; i < bins; i++) {
            const a = hist[Math.max(0, i - 1)], b = hist[i], c = hist[Math.min(bins - 1, i + 1)];
            out[i] = (a + 2 * b + c) / 4;
        }
        hist = out;
    }

    const prefix = new Float64Array(bins + 1);
    for (let i = 0; i < bins; i++) prefix[i + 1] = prefix[i] + hist[i];

    const found = [];
    let i = 1;
    while (i < bins - 1) {
        if (!(hist[i] <= hist[i - 1] && hist[i] <= hist[i + 1])) { i++; continue; }
        // A gap is a *plateau* of equal minima, not a single bin -- between
        // two well-separated planes the histogram is flat zero for a long
        // stretch. Taking its middle puts the cut in the centre of the gap,
        // where it is furthest from either plane.
        let j = i;
        while (j + 1 < bins - 1 && hist[j + 1] === hist[i]) j++;
        const centre = (i + j) >> 1;

        let left = 0;
        for (let k = 0; k < i; k++) left = Math.max(left, hist[k]);
        let right = 0;
        for (let k = j + 1; k < bins; k++) right = Math.max(right, hist[k]);
        const flank = Math.min(left, right);
        const prominence = flank - hist[centre];
        const leftMass = prefix[i] / total, rightMass = (prefix[bins] - prefix[j + 1]) / total;
        if (prominence > flank * minDrop && leftMass >= minShare && rightMass >= minShare) {
            found.push({ bin: centre, prominence });
        }
        i = j + 1;
    }

    return found
        .sort((a, b) => b.prominence - a.prominence)
        .slice(0, count)
        // The level sits between bin centres, so it maps back half a bin up.
        .map((v) => min + (v.bin + 0.5) / scale)
        .sort((a, b) => a - b);
}

/**
 * Grow a binary mask by `radius`, as two separable max passes.
 *
 * Used when building an inpainting plate: the subject must be removed
 * *including* the texels its silhouette shares with the background, or
 * bilinear filtering leaves a one-pixel rim of the subject's colour around
 * the hole and the fill propagates it inward. A depth threshold alone
 * cannot see that rim, because the rim is where the depth map is wrong.
 */
export function dilateMask(mask, w, h, radius) {
    if (radius <= 0) return mask;
    const tmp = new Float32Array(mask.length);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let m = 0;
            for (let d = -radius; d <= radius; d++) {
                const xx = x + d;
                if (xx < 0 || xx >= w) continue;
                if (mask[y * w + xx] > m) m = mask[y * w + xx];
            }
            tmp[y * w + x] = m;
        }
    }
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let m = 0;
            for (let d = -radius; d <= radius; d++) {
                const yy = y + d;
                if (yy < 0 || yy >= h) continue;
                if (tmp[yy * w + x] > m) m = tmp[yy * w + x];
            }
            mask[y * w + x] = m;
        }
    }
    return mask;
}
