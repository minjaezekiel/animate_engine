/**
 * A layered paint document.
 *
 * ```js
 * const doc = new PaintDocument(kernels, 1280, 720);
 * const sky = doc.addLayer({ name: 'sky' });
 * const ink = doc.addLayer({ name: 'ink', blend: 'multiply', opacity: 0.9 });
 *
 * doc.draw('ink', { path: 'M 20 100 L 300 140', brush: 'ink', color: '#111' });
 * doc.flatten();
 * doc.toRgba8(imageData.data);
 * ```
 *
 * # Why layers are separate buffers and not draw order
 *
 * Stroke order alone gets most of the way, and for a single flat drawing
 * it is enough. Layers earn their memory when something must be changed
 * *after* the strokes under it exist:
 *
 *   - a blend mode applies to a whole group at once — ink multiplied over
 *     colour is the standard comic pipeline, and it cannot be expressed by
 *     ordering strokes;
 *   - opacity on a group is not the same as opacity on each stroke in it,
 *     because overlapping strokes within the group would show through one
 *     another;
 *   - a layer can be hidden, reordered or redrawn without re-running every
 *     stroke beneath it, which is what makes an edit cheap rather than a
 *     full re-render.
 *
 * The cost is honest and should be stated: each layer is a full
 * premultiplied f32 buffer, so **33 MB per layer at 1080p**. A twelve-layer
 * document is 400 MB and a flatten is twelve full-frame passes — which is
 * exactly the bandwidth-bound shape the worker pool exists for, and why
 * [`flattenAsync`] is the one to use at that size.
 *
 * # Addressing
 *
 * Layers are addressed by name or index. Names, because a `film.json`
 * written by hand or by an agent should say `"layer": "ink"` rather than
 * `"layer": 3` — an index silently means something different the moment a
 * layer is inserted, and that is a particularly nasty failure in a
 * declarative document where nothing errors.
 */
import { PaintSurface } from './Surface.js';
import { MODE_NAMES, modeId } from '../../kernels/js/blend.js';

export { MODE_NAMES as BLEND_MODE_NAMES };

/** One layer: a surface plus how it composites. */
export class PaintLayer {
    constructor(surface, { name, blend = 'normal', opacity = 1, visible = true } = {}) {
        this.surface = surface;
        this.name = name;
        /** A name from `BLEND_MODE_NAMES`. Validated on assignment, not at flatten. */
        this.blend = blend;
        this.opacity = opacity;
        this.visible = visible;
        // Fail here rather than at flatten time, so a typo is reported
        // where it was written instead of several hundred strokes later.
        modeId(blend);
    }

    /** Draw onto this layer. See `PaintSurface.draw`. */
    draw(stroke, options) { return this.surface.draw(stroke, options); }
    /** Draw many strokes, with an optional overall reveal. */
    drawAll(strokes, options) { return this.surface.drawAll(strokes, options); }
    /** Erase this layer to transparent. */
    clear() { this.surface.clear(); }
}

export class PaintDocument {
    /**
     * @param {import('../../kernels/index.js').Kernels} kernels
     * @param {number} width
     * @param {number} height
     * @param {object} [options]
     * @param {import('../../kernels/parallel.js').ParallelKernels} [options.pool]
     */
    constructor(kernels, width, height, { pool } = {}) {
        this.kernels = kernels;
        this.pool = pool ?? null;
        this.width = width;
        this.height = height;
        /** @type {PaintLayer[]} bottom first, as every layer UI shows them */
        this.layers = [];
        /** The flattened result. Allocated on first flatten, not before. */
        this.composite = null;
        this._u8buf = null;
    }

    /**
     * Add a layer on top of the stack, or at `at`.
     *
     * @returns {PaintLayer}
     */
    addLayer({ name, blend = 'normal', opacity = 1, visible = true, at } = {}) {
        const layerName = name ?? `layer${this.layers.length + 1}`;
        if (this.layers.some((l) => l.name === layerName)) {
            throw new Error(`duplicate layer name "${layerName}"`);
        }
        const surface = new PaintSurface(this.kernels, this.width, this.height,
            { pool: this.pool });
        const layer = new PaintLayer(surface, { name: layerName, blend, opacity, visible });
        if (at === undefined || at >= this.layers.length) this.layers.push(layer);
        else this.layers.splice(Math.max(0, at), 0, layer);
        return layer;
    }

    /**
     * Find a layer by name or index.
     *
     * Throws on a miss rather than returning undefined: a stroke drawn to
     * a layer that does not exist would otherwise vanish silently, and in
     * a declarative document that is almost impossible to notice.
     */
    layer(ref) {
        if (ref instanceof PaintLayer) return ref;
        if (typeof ref === 'number') {
            const found = this.layers[ref];
            if (!found) throw new Error(`no layer at index ${ref}`);
            return found;
        }
        const found = this.layers.find((l) => l.name === ref);
        if (!found) {
            throw new Error(
                `no layer "${ref}"; have: ${this.layers.map((l) => l.name).join(', ') || '(none)'}`);
        }
        return found;
    }

    /** Draw a stroke onto a named layer. */
    draw(ref, stroke, options) { return this.layer(ref).draw(stroke, options); }

    /** Remove a layer and release its buffers. */
    removeLayer(ref) {
        const layer = this.layer(ref);
        this.layers.splice(this.layers.indexOf(layer), 1);
        layer.surface.dispose();
    }

    /** Move a layer to a new index in the stack. */
    reorder(ref, to) {
        const layer = this.layer(ref);
        const from = this.layers.indexOf(layer);
        this.layers.splice(from, 1);
        this.layers.splice(Math.max(0, Math.min(this.layers.length, to)), 0, layer);
    }

    /** The composite buffer, allocated on demand. */
    _target() {
        if (!this.composite) {
            this.composite = this.kernels.f32(this.width * this.height * 4);
        }
        return this.composite;
    }

    /**
     * Composite every visible layer, bottom to top, into `composite`.
     *
     * The target is cleared first. Flatten is not incremental: there is no
     * dirty tracking, so changing one layer re-composites all of them.
     * That is the right trade at this stage — a flatten is a handful of
     * linear passes and the bookkeeping to avoid them would be easy to get
     * subtly wrong, in a way that shows as a stale layer on screen.
     */
    flatten() {
        const target = this._target();
        const { width: w, height: h, kernels: K } = this;
        K.clearF32(target, w * h * 4);
        for (const layer of this.layers) {
            if (!layer.visible || layer.opacity <= 0) continue;
            K.blendLayers(target, layer.surface.buffer, w, h, layer.blend, layer.opacity);
        }
        return target;
    }

    /** As [`flatten`], across the worker pool when one was supplied. */
    async flattenAsync() {
        if (!this.pool) return this.flatten();
        const target = this._target();
        const { width: w, height: h } = this;
        this.kernels.clearF32(target, w * h * 4);
        for (const layer of this.layers) {
            if (!layer.visible || layer.opacity <= 0) continue;
            // Sequential by necessity: each layer composites onto the
            // result of the one below, so the stack cannot be split. The
            // parallelism is *within* each blend, across rows.
            await this.pool.blendLayers(target, layer.surface.buffer, w, h,
                layer.blend, layer.opacity);
        }
        return target;
    }

    /**
     * Convert the flattened composite to straight u8 RGBA.
     *
     * Flattens first if it has not been flattened yet, because forgetting
     * to is otherwise an empty frame with no error.
     */
    toRgba8(target) {
        if (!this.composite) this.flatten();
        const n = this.width * this.height;
        if (!this._u8buf || this._u8buf.length !== n * 4) {
            if (this._u8buf) this._u8buf.free();
            this._u8buf = this.kernels.u8(n * 4);
        }
        this.kernels.maskToRgba8(this.composite, this._u8buf, n);
        const out = this._u8buf.array;
        if (target) { target.set(out); return target; }
        return Uint8Array.from(out);
    }

    /** Release every layer and the composite. */
    dispose() {
        for (const layer of this.layers) layer.surface.dispose();
        this.layers = [];
        if (this.composite) { this.composite.free(); this.composite = null; }
        if (this._u8buf) { this._u8buf.free(); this._u8buf = null; }
    }
}
