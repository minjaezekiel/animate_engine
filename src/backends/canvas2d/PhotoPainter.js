/**
 * Rasterise a `kind: 'photo'` node: a still photograph animated by
 * `core/motion/PhotoMotion.js`.
 *
 * ```js
 * attachPhotoPainters(scene, kernels);      // once, after compile
 * // then every frame, shapes.js calls painter.canvasAt(props.progress)
 * ```
 *
 * The same split as [`PaintPainter`], for the same reason: the compiler
 * emits an unrasterised spec because it may not touch a canvas, and the
 * backend resolves it at mount. The painter interface is identical --
 * `canvasAt(progress)` -- which is why `shapes.js` draws both kinds
 * through one branch.
 *
 * # Progress, not seconds
 *
 * The node's channel is `props.progress`, 0 to 1, because that is what the
 * `draw` verb animates and reusing it meant no new verb in the compiler.
 * This maps it back onto the photo's own timeline: `t = progress *
 * duration`. Running a photo backwards or holding it mid-move therefore
 * costs nothing, since `PhotoMotion.renderAt` solves from `t` with no
 * history.
 *
 * # Built on first use
 *
 * A `PhotoMotion` allocates kernel buffers for the source, the depth map
 * and the output -- several megabytes for a large photograph. A film with
 * eight scenes should not hold all eight at once before the first frame,
 * so construction waits until something actually asks for a frame.
 *
 * # It is the most expensive thing in a frame, so it has two throttles
 *
 * A warp is three passes over every output pixel: rasterise the mesh,
 * convert premultiplied f32 to straight u8, and put it on a canvas.
 * Measured on a 1400x820 backdrop that is **71.7 ms a frame**, against a
 * paced-export ceiling of 41.67 ms at 24fps -- the same film without it
 * ran in 0.7 ms. Over the ceiling the export does not degrade, it emits an
 * undecodable file, so this is a correctness limit and not a nicety.
 *
 *   - **`resolution`** renders the mesh smaller and lets `drawImage` scale
 *     it back up on the way to the frame. Cost is linear in output pixels
 *     and a backdrop is the softest thing in the shot, so this is nearly
 *     free visually.
 *   - **`step`** re-renders only every N seconds. A backdrop drifting
 *     across a minute does not need a new warp every frame any more than a
 *     held cel does; it is the same "on twos" the film's own `meta.step`
 *     applies to the cast, in seconds rather than frames.
 */
import { PhotoMotion } from '../../core/motion/PhotoMotion.js';

/** Make an offscreen canvas, in a browser or a worker. */
function defaultCanvas(width, height) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
    if (typeof document !== 'undefined') {
        const c = document.createElement('canvas');
        c.width = width; c.height = height;
        return c;
    }
    return null;       // Node without a canvas: `imageDataAt` still works
}

/**
 * Get u8 RGBA pixels out of whatever the asset loader produced.
 *
 * Accepts a decoded `{data, width, height}` as-is, which is how the Node
 * tests and the MCP ops supply a picture, and otherwise draws the
 * drawable through a canvas. That second path is also the answer to "why
 * is there no JPEG decoder": the browser already decodes every format it
 * supports, and `drawImage` plus `getImageData` is the whole conversion.
 */
export function toPixels(image, createCanvas = defaultCanvas) {
    if (!image) return null;
    if (image.data && image.width) {
        return { data: image.data, width: image.width, height: image.height };
    }
    const width = image.naturalWidth ?? image.width;
    const height = image.naturalHeight ?? image.height;
    if (!width || !height) return null;
    const canvas = createCanvas(width, height);
    const ctx = canvas?.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, width, height);
    return { data, width, height };
}

export class PhotoPainter {
    /**
     * @param {object} spec        `props.photo` from a photo node
     * @param {object} kernels
     * @param {object} [options]
     * @param {Function} [options.createCanvas] `(w, h) => canvas`
     * @param {object} [options.pool]  a `ParallelKernels`, for `renderAsync`
     */
    constructor(spec, kernels, { createCanvas = defaultCanvas, pool = null } = {}) {
        this.spec = spec;
        this.kernels = kernels;
        this.pool = pool;
        this.createCanvas = createCanvas;
        // The size the mesh is *rendered* at. The node still draws at the
        // authored width and height, so lowering this trades sharpness in
        // the backdrop for frames everywhere else.
        const scale = Math.min(1, Math.max(0.05, spec.resolution ?? 1));
        this.width = Math.max(1, Math.round(spec.width * scale));
        this.height = Math.max(1, Math.round(spec.height * scale));
        this.resolution = scale;
        this.duration = spec.duration ?? 1;
        this.step = Math.max(0, spec.step ?? 0);
        this.motion = null;

        this._canvas = null;
        this._ctx = null;
        this._imageData = null;
        this._renderedKey = null;
    }

    /**
     * The `PhotoMotion`, built on first use.
     *
     * Returns null when the source asset never resolved, which `shapes.js`
     * treats as "nothing to draw" rather than an error -- the same policy
     * as an unresolved image.
     */
    _motion() {
        if (this.motion) return this.motion;
        const source = toPixels(this.spec.source, this.createCanvas);
        if (!source) return null;
        this.motion = new PhotoMotion(this.kernels, {
            width: this.width, height: this.height,
            source,
            depth: toPixels(this.spec.depth, this.createCanvas) ?? undefined,
            effects: this.spec.effects ?? [],
            duration: this.duration,
            grid: this.spec.grid,
            overscan: this.spec.overscan,
            depthBlur: this.spec.depthBlur,
            tear: this.spec.tear,
        }, { pool: this.pool });
        return this.motion;
    }

    /**
     * Seconds into the photo's own animation, from the node's channel.
     *
     * The `step` hold is applied **here**, not in [`canvasAt`], so every
     * entry point agrees: `renderAt` and `imageDataAt` would otherwise
     * ignore the hold and return a different picture from the one the film
     * draws for the same frame.
     */
    timeAt(progress) {
        return this._progressOf(this._key(progress)) * this.duration;
    }

    /** Premultiplied f32 RGBA at `progress`, or null without a source. */
    renderAt(progress) {
        const motion = this._motion();
        return motion ? motion.renderAt(this.timeAt(progress)) : null;
    }

    /** Straight u8 RGBA at `progress`. What the Node tests use. */
    imageDataAt(progress) {
        const motion = this._motion();
        return motion ? motion.imageDataAt(this.timeAt(progress)) : null;
    }

    /**
     * The progress a given progress is rounded to, honouring `step`.
     *
     * Without a step this is quantised to 1e-4, which is finer than any
     * frame of any plausible shot and exists only so a *held* photo costs
     * a comparison instead of a full warp. With one, neighbouring frames
     * collapse onto the same render and the warp runs `duration / step`
     * times across the whole shot instead of once a frame.
     */
    _key(progress) {
        const p = Math.min(1, Math.max(0, progress));
        if (this.step > 0 && this.duration > 0) {
            // Floor, not round: a step is a **hold**. Rounding snaps to the
            // nearest boundary, so a frame a third of the way into a step
            // shows the *next* step's picture -- the backdrop arrives early
            // and the hold straddles two of them.
            return Math.floor(p * (this.duration / this.step));
        }
        return Math.round(p * 1e4);
    }

    /** Make the output canvas on first use. False if this host has none. */
    _ensureCanvas() {
        if (!this._canvas) {
            this._canvas = this.createCanvas(this.width, this.height);
            this._ctx = this._canvas?.getContext('2d') ?? null;
            this._imageData = this._ctx?.createImageData(this.width, this.height) ?? null;
        }
        return !!this._ctx;
    }

    /** The progress a key maps back to: the start of the step it holds. */
    _progressOf(key) {
        if (this.step > 0 && this.duration > 0) {
            return Math.min(1, key / (this.duration / this.step));
        }
        return Math.min(1, key / 1e4);
    }

    /**
     * A canvas showing the photo at `progress`, memoised per [`_key`].
     */
    canvasAt(progress) {
        const motion = this._motion();
        if (!motion) return null;
        if (!this._ensureCanvas()) return null;

        const key = this._key(progress);
        if (key === this._renderedKey) return this._canvas;

        // Straight into the ImageData: `imageDataAt` already owns a u8
        // staging buffer and writes into a target, so a second one here
        // would be a megabyte of duplication per photo.
        //
        motion.imageDataAt(this.timeAt(progress), this._imageData.data);
        this._ctx.putImageData(this._imageData, 0, 0);
        this._renderedKey = key;
        return this._canvas;
    }

    /**
     * Warp this frame ahead of the synchronous draw, across the pool.
     *
     * `canvasAt` cannot do this itself: it is called from `renderFrame`,
     * which is synchronous by contract because that is what makes offline
     * rendering deterministic and Node-testable. So the parallel work has
     * to happen in the render loop's `beforeFrame` hook, and leave a
     * finished canvas behind for the sync path to find.
     *
     * Measured on a 1400x820 backdrop: 55.03 ms serial against 19.74 ms on
     * six workers, **bit-identical output**. Sub-linear because these
     * kernels are memory-bandwidth bound, which is the same reason SIMD
     * did not help the blur.
     *
     * Without a pool this is a no-op and the sync path does the work, so a
     * caller can always call it.
     */
    async prepare(progress) {
        if (!this.pool) return false;
        const motion = this._motion();
        if (!motion) return false;
        if (!this._ensureCanvas()) return false;

        const key = this._key(progress);
        if (key === this._renderedKey) return false;
        await motion.renderAtAsync(this.timeAt(progress));
        motion.imageDataAt(this.timeAt(progress), this._imageData.data);
        this._ctx.putImageData(this._imageData, 0, 0);
        this._renderedKey = key;
        return true;
    }

    dispose() {
        this.motion?.dispose();
        this.motion = null;
    }
}

/**
 * Warp every photo in a scene for the frame about to be drawn.
 *
 * Call from the render loop's `beforeFrame`. Reads each node's current
 * `props.progress`, which the evaluator has already written for this
 * frame, so the prepare and the draw cannot disagree about which frame
 * they are on.
 */
export async function preparePhotos(scene) {
    const pending = [];
    scene.walk((node) => {
        if (node.kind !== 'photo') return;
        const painter = node.props?.painter;
        if (painter?.prepare) pending.push(painter.prepare(node.props.progress ?? 0));
    });
    // Sequential rather than concurrent: they share one worker pool, and
    // two photos queued at once would interleave their bands and finish no
    // sooner. Films with one backdrop -- which is all of them so far --
    // take the same path either way.
    for (const job of pending) await job;
    return pending.length;
}

/**
 * Attach a painter to every photo node in a scene.
 *
 * Call once after compiling and before rendering. Nodes whose spec is
 * missing are skipped rather than throwing, matching how an unresolved
 * image asset is handled.
 *
 * @returns {PhotoPainter[]} so the caller can dispose them
 */
export function attachPhotoPainters(scene, kernels, options = {}) {
    const made = [];
    scene.walk((node) => {
        if (node.kind !== 'photo' || !node.props?.photo || node.props.painter) return;
        const painter = new PhotoPainter(node.props.photo, kernels, options);
        node.props.painter = painter;
        made.push(painter);
    });
    return made;
}
