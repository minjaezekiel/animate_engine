/**
 * Rasterise a `kind: 'paint'` node's spec onto a canvas.
 *
 * This lives in the backend, not in `core/paint`, because it owns a canvas
 * and core may not touch the DOM. The split is the same one the engine
 * already makes for images: the compiler emits an unrasterised spec, and
 * the backend resolves it to something drawable at mount.
 *
 * ```js
 * attachPainters(scene, kernels);          // once, after compile
 * // then every frame, shapes.js calls painter.canvasAt(props.progress)
 * ```
 *
 * # Memoised on progress
 *
 * A draw-on reveal changes `progress` every frame, but a held drawing does
 * not. [`canvasAt`] re-renders only when the quantised progress actually
 * moves, so a static drawing costs one property comparison per frame
 * rather than a full re-composite.
 *
 * Progress is quantised to the dab count before comparison. Two
 * neighbouring frames of a slow reveal frequently resolve to the same
 * number of dabs, and re-rendering an identical image is pure waste on
 * the most expensive operation in the frame.
 */
import { PaintDocument } from '../../core/paint/Document.js';
import { attachPhotoPainters } from './PhotoPainter.js';

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

export class PaintPainter {
    /**
     * @param {object} spec             `props.paint` from a paint node
     * @param {import('../../core/paint/Document.js').PaintDocument extends never ? never : any} kernels
     * @param {object} [options]
     * @param {Function} [options.createCanvas] `(w, h) => canvas`
     */
    constructor(spec, kernels, { createCanvas = defaultCanvas } = {}) {
        this.spec = spec;
        this.kernels = kernels;
        this.width = spec.width;
        this.height = spec.height;

        this.document = new PaintDocument(kernels, spec.width, spec.height);
        for (const layer of spec.layers ?? []) {
            this.document.addLayer({
                name: layer.name,
                blend: layer.blend,
                opacity: layer.opacity,
                visible: layer.visible,
            });
        }

        this._canvas = createCanvas(spec.width, spec.height);
        this._ctx = this._canvas?.getContext('2d') ?? null;
        this._imageData = this._ctx?.createImageData(spec.width, spec.height) ?? null;
        this._renderedKey = null;
        this._boil = 0;
        this._boilAmp = null;
    }

    /**
     * Boil: redraw the same strokes with a different jitter seed.
     *
     * In a pencil test a held drawing is REDRAWN rather than held, so the
     * contour shifts a little between exposures. That shimmer is the
     * strongest signal that a thing is hand-drawn; freeze it and the shot
     * reads as a cutout puppet. See 21-DRAWN-ANIMATION.md.
     *
     * The seed is written back onto the same stroke objects rather than onto
     * clones. `Surface._prepare` caches by stroke IDENTITY and frees the old
     * kernel buffer when the brush key changes, so cloning would leak one
     * buffer per stroke per exposure and defeat the cache besides.
     *
     * Deterministic: the offset comes from the boil channel, which the
     * compiler derives from the frame index. Frame N boils the same way on
     * every render.
     */
    _setBoil(boil, amplitude) {
        if (boil === this._boil && amplitude === this._boilAmp) return;
        this._boil = boil;
        this._boilAmp = amplitude;
        for (const layer of this.spec.layers ?? []) {
            for (const stroke of layer.strokes ?? []) {
                if (stroke.__seed0 === undefined) stroke.__seed0 = stroke.seed ?? 0;
                // An odd multiplier so successive exposures do not land on
                // neighbouring seeds, which hash to visibly similar jitter.
                stroke.seed = stroke.__seed0 + boil * 9973;
                // `amplitude` is how far the contour wanders, as a fraction of
                // the nib. Omitted, the brush's own jitter is left alone --
                // `pencil` already has one, and overriding it by default would
                // silently restyle every existing drawing.
                if (amplitude != null) {
                    stroke.brushOverrides = { ...stroke.brushOverrides, jitterPos: amplitude };
                }
            }
        }
    }

    /**
     * Total dabs across every layer, used to quantise progress.
     *
     * Counting dabs rather than strokes means a long stroke takes
     * proportionally longer to appear than a short one. Weighting by
     * stroke count instead makes a single dot take as long as a sweeping
     * line, which reads as a stall partway through the reveal.
     */
    get totalDabs() {
        if (this._total === undefined) {
            this._total = 0;
            for (const layer of this.spec.layers ?? []) {
                for (const stroke of layer.strokes ?? []) {
                    this._total += this.document.layers[0]
                        ? 0 : 0;      // counted lazily below instead
                }
            }
            // Counting needs the surfaces, which resample and cache; doing
            // it through the document keeps one code path for resampling.
            this._total = (this.spec.layers ?? []).reduce((sum, layer, li) => {
                const surface = this.document.layers[li]?.surface;
                if (!surface) return sum;
                return sum + (layer.strokes ?? []).reduce(
                    (n, stroke) => n + surface._prepare(stroke).resampled.count, 0);
            }, 0);
        }
        return this._total;
    }

    /**
     * Render at `progress` and return the flattened premultiplied buffer.
     *
     * Pure with respect to the canvas, so this is what the Node tests use.
     */
    renderAt(progress, boil = 0, amplitude = null) {
        this._setBoil(Math.round(boil) || 0, amplitude);
        const p = Math.min(1, Math.max(0, progress));
        for (const [li, layer] of (this.spec.layers ?? []).entries()) {
            const target = this.document.layers[li];
            if (!target) continue;
            target.clear();
            target.drawAll(layer.strokes ?? [], { at: p });
        }
        return this.document.flatten();
    }

    /** Straight u8 RGBA at `progress`. */
    imageDataAt(progress) {
        this.renderAt(progress);
        return this.document.toRgba8();
    }

    /**
     * A canvas showing the drawing at `progress`.
     *
     * Returns null where no canvas could be created, which `shapes.js`
     * treats as "nothing to draw" rather than an error -- the same policy
     * as an unresolved image.
     */
    canvasAt(progress, boil = 0, amplitude = null) {
        if (!this._ctx) return null;
        // Quantise to whole dabs: neighbouring frames of a slow reveal
        // often resolve to the same count, and re-rendering an identical
        // image is waste on the frame's most expensive operation.
        const total = this.totalDabs;
        const key = total > 0
            ? Math.floor(Math.min(1, Math.max(0, progress)) * total)
            : (progress >= 1 ? 1 : 0);
        // Boil joins the memo key: the same progress at a new exposure is a
        // different picture, and that is the entire point of boiling.
        const want = `${key}|${Math.round(boil) || 0}|${amplitude ?? ''}`;
        if (want === this._renderedKey) return this._canvas;

        this.renderAt(progress, boil, amplitude);
        this.document.toRgba8(this._imageData.data);
        this._ctx.putImageData(this._imageData, 0, 0);
        this._renderedKey = want;
        return this._canvas;
    }

    dispose() { this.document.dispose(); }
}

/**
 * Attach a painter to every paint node and every photo node in a scene.
 *
 * Call once after compiling and before rendering. Nodes whose spec is
 * missing are skipped rather than throwing, matching how an unresolved
 * image asset is handled.
 *
 * Photos are included here rather than left to a second call because the
 * caller has no way to know whether a film contains any, and forgetting
 * the second call would make its photographs silently blank.
 *
 * @returns {Array<PaintPainter|import('./PhotoPainter.js').PhotoPainter>}
 *   so the caller can dispose them
 */
export function attachPainters(scene, kernels, options = {}) {
    const made = [];
    scene.walk((node) => {
        if (node.kind !== 'paint' || !node.props?.paint || node.props.painter) return;
        const painter = new PaintPainter(node.props.paint, kernels, options);
        node.props.painter = painter;
        made.push(painter);
    });
    made.push(...attachPhotoPainters(scene, kernels, options));
    return made;
}
