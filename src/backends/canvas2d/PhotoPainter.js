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
        this.width = spec.width;
        this.height = spec.height;
        this.duration = spec.duration ?? 1;
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

    /** Seconds into the photo's own animation, from the node's channel. */
    timeAt(progress) {
        return Math.min(1, Math.max(0, progress)) * this.duration;
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
     * A canvas showing the photo at `progress`.
     *
     * Memoised on progress quantised to 1e-4, which is finer than any
     * frame of any plausible shot and exists only so a *held* photo -- one
     * whose channel is not moving this frame -- costs a comparison instead
     * of a full warp.
     */
    canvasAt(progress) {
        const motion = this._motion();
        if (!motion) return null;
        if (!this._canvas) {
            this._canvas = this.createCanvas(this.width, this.height);
            this._ctx = this._canvas?.getContext('2d') ?? null;
            this._imageData = this._ctx?.createImageData(this.width, this.height) ?? null;
        }
        if (!this._ctx) return null;

        const key = Math.round(Math.min(1, Math.max(0, progress)) * 1e4);
        if (key === this._renderedKey) return this._canvas;

        // Straight into the ImageData: `imageDataAt` already owns a u8
        // staging buffer and writes into a target, so a second one here
        // would be a megabyte of duplication per photo.
        motion.imageDataAt(this.timeAt(progress), this._imageData.data);
        this._ctx.putImageData(this._imageData, 0, 0);
        this._renderedKey = key;
        return this._canvas;
    }

    dispose() {
        this.motion?.dispose();
        this.motion = null;
    }
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
