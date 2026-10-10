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

/** One layer: a surface, a mask, and how it composites. */
export class PaintLayer {
    constructor(surface, { name, blend = 'normal', opacity = 1, visible = true,
                           clip = false } = {}) {
        this.surface = surface;
        this.name = name;
        /** A name from `BLEND_MODE_NAMES`. Validated on assignment, not at flatten. */
        this.blend = blend;
        this.opacity = opacity;
        this.visible = visible;
        /**
         * Clip to the layer below.
         *
         * A clipping group means "show this layer only where the one
         * beneath it is opaque" -- how a shading or colour pass is
         * confined to a character without re-cutting its silhouette by
         * hand. The base is the nearest layer below that is not itself
         * clipped, so a run of clipped layers all share one base, which is
         * what every tool that has this feature does.
         */
        this.clip = clip;
        /** @type {PaintSurface|null} the layer's own mask, if any */
        this.mask = null;
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

    /**
     * Give this layer a mask, and return it for painting.
     *
     * The mask is an ordinary `PaintSurface`, so it is painted with the
     * ordinary brushes -- a soft airbrush mask, a hard pen mask, a
     * textured one -- and the blend kernel reads its alpha channel
     * directly. No conversion, no second code path, no extra buffer.
     *
     * It starts **opaque**, hiding nothing. Starting transparent would
     * make the layer vanish the instant a mask is added, which every user
     * reads as a bug rather than as a blank mask.
     *
     * @param {object} [options]
     * @param {number} [options.fill=1] starting coverage, 0..1
     */
    addMask({ fill = 1 } = {}) {
        if (!this.mask) {
            this.mask = new PaintSurface(
                this.surface.kernels, this.surface.width, this.surface.height,
                { pool: this.surface.pool });
        }
        this.mask.clear();
        if (fill > 0) this.mask.fill(0, 0, 0, Math.min(1, fill));
        return this.mask;
    }

    /**
     * Paint on the mask.
     *
     * Painting black with alpha *adds* coverage and erasing removes it,
     * so `{ brush: 'softEraser' }` hides part of the layer and a normal
     * brush reveals it again -- the same gesture as in any paint program.
     */
    paintMask(stroke, options) {
        if (!this.mask) this.addMask();
        return this.mask.draw(stroke, options);
    }

    /** Drop the mask and release its buffers. */
    removeMask() {
        if (this.mask) { this.mask.dispose(); this.mask = null; }
    }

    /**
     * A cheap key that changes whenever this layer's contribution would.
     *
     * Used by the document's incremental flatten. It covers the pixels
     * (via the surfaces' version counters) *and* the compositing
     * properties, because `layer.visible = false` is a plain assignment
     * with no setter to hook -- and a dirty-flag scheme that missed it
     * would leave a hidden layer on screen, which is exactly the kind of
     * staleness that makes people distrust incremental rendering.
     */
    signature() {
        return `${this.surface.version}|${this.blend}|${this.opacity}`
            + `|${this.visible ? 1 : 0}|${this.clip ? 1 : 0}`
            + `|${this.mask ? this.mask.version : -1}`;
    }
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

        // --- incremental flatten state ---
        // `_prefix` holds the composite of layers [0, _prefixUpTo). One
        // extra full buffer, allocated only when incremental flattening
        // actually kicks in.
        this._prefix = null;
        this._prefixUpTo = -1;
        /** @type {string[]|null} layer signatures as of the last flatten */
        this._seen = null;
    }

    /**
     * Add a layer on top of the stack, or at `at`.
     *
     * @returns {PaintLayer}
     */
    addLayer({ name, blend = 'normal', opacity = 1, visible = true, clip = false, at } = {}) {
        const layerName = name ?? `layer${this.layers.length + 1}`;
        if (this.layers.some((l) => l.name === layerName)) {
            throw new Error(`duplicate layer name "${layerName}"`);
        }
        const surface = new PaintSurface(this.kernels, this.width, this.height,
            { pool: this.pool });
        const layer = new PaintLayer(surface, { name: layerName, blend, opacity, visible, clip });
        this._invalidate();
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
        layer.removeMask();
        layer.surface.dispose();
        this._invalidate();
    }

    /** Move a layer to a new index in the stack. */
    reorder(ref, to) {
        const layer = this.layer(ref);
        const from = this.layers.indexOf(layer);
        this.layers.splice(from, 1);
        this.layers.splice(Math.max(0, Math.min(this.layers.length, to)), 0, layer);
        this._invalidate();
    }

    /**
     * Discard the incremental cache.
     *
     * Any change to the *stack* -- adding, removing or reordering -- is
     * handled by throwing the cache away rather than by trying to patch
     * it. Those are rare next to painting, and the bookkeeping to do it
     * precisely is the part of an incremental renderer most likely to be
     * subtly wrong.
     */
    _invalidate() {
        this._seen = null;
        this._prefixUpTo = -1;
    }

    /**
     * The layer a clipped layer at `index` clips to.
     *
     * The nearest layer below that is not itself clipped, so a run of
     * clipped layers shares one base -- the behaviour of every tool that
     * has clipping groups. Returns null when there is none, in which case
     * the clip is ignored rather than hiding the layer entirely: a
     * clipping group with nothing beneath it is an authoring mistake, and
     * silently blanking the layer makes it very hard to see which one.
     */
    _clipBase(index) {
        for (let i = index - 1; i >= 0; i--) {
            if (!this.layers[i].clip) return this.layers[i];
        }
        return null;
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
     * **Incremental.** Painting usually touches one layer, and in a deep
     * document re-compositing the eleven below it every stroke is most of
     * the cost of drawing. So the composite of the layers *below* the
     * lowest changed one is cached in `_prefix`, and a flatten resumes
     * from there.
     *
     * The scheme is deliberately the simple one: a single prefix buffer
     * and a linear scan for the lowest change. Caching a buffer per layer
     * would make an edit near the bottom cheap too, at the cost of a full
     * frame of memory per layer -- 33 MB each at 1080p -- for a case that
     * is rare. One buffer turns the common case from O(layers) into O(1)
     * and leaves the rare case where it was.
     *
     * Change is detected by comparing [`PaintLayer.signature`] values
     * rather than by dirty flags, because `layer.visible = false` is a
     * plain assignment with nothing to hook. A missed change leaves a
     * stale layer on screen, which is the failure that makes people stop
     * trusting incremental rendering, so the signature covers the
     * compositing properties as well as the pixels.
     */
    flatten() {
        const { width: w, height: h, kernels: K } = this;
        const target = this._target();
        const sigs = this.layers.map((l) => l.signature());

        // How much of the previous flatten still holds.
        let from = 0;
        if (this._seen && this._seen.length === sigs.length) {
            while (from < sigs.length && this._seen[from] === sigs[from]) from++;
            if (from === sigs.length) return target;      // nothing changed at all
        }

        if (from > 0 && this._prefixUpTo === from && this._prefix) {
            K.copyF32(this._prefix, target, w * h * 4);
        } else {
            K.clearF32(target, w * h * 4);
            for (let i = 0; i < from; i++) this._compose(target, i);
            if (from > 0) {
                if (!this._prefix) this._prefix = K.f32(w * h * 4);
                K.copyF32(target, this._prefix, w * h * 4);
                this._prefixUpTo = from;
            } else {
                // Nothing was saved, so whatever `_prefix` still holds is
                // stale. Leaving `_prefixUpTo` pointing at it is the bug
                // that matters here: painting low in the stack and then
                // high again would reuse a prefix captured *before* the
                // low edit, silently dropping it from the composite.
                this._prefixUpTo = -1;
            }
        }

        for (let i = from; i < this.layers.length; i++) this._compose(target, i);
        this._seen = sigs;
        return target;
    }

    /** Composite one layer onto `target`, honouring its mask and clip. */
    _compose(target, index) {
        const layer = this.layers[index];
        if (!layer.visible || layer.opacity <= 0) return;
        const base = layer.clip ? this._clipBase(index) : null;
        this.kernels.blendLayers(target, layer.surface.buffer, this.width, this.height,
            layer.blend, layer.opacity, {
                mask: layer.mask ? layer.mask.buffer : null,
                clip: base ? base.surface.buffer : null,
                // The base's own mask too: masking a base layer must hide
                // what is clipped to it.
                clipMask: base?.mask ? base.mask.buffer : null,
            });
    }

    /** Re-composite everything, ignoring the incremental cache. */
    flattenFull() {
        this._invalidate();
        return this.flatten();
    }

    /**
     * As [`flatten`], across the worker pool when one was supplied.
     *
     * The stack is sequential by necessity -- each layer composites onto
     * the result of the one below -- so the parallelism is *within* each
     * blend, across rows. The incremental prefix applies here too.
     */
    async flattenAsync() {
        if (!this.pool) return this.flatten();
        const { width: w, height: h, kernels: K } = this;
        const target = this._target();
        const sigs = this.layers.map((l) => l.signature());

        let from = 0;
        if (this._seen && this._seen.length === sigs.length) {
            while (from < sigs.length && this._seen[from] === sigs[from]) from++;
            if (from === sigs.length) return target;
        }

        if (from > 0 && this._prefixUpTo === from && this._prefix) {
            K.copyF32(this._prefix, target, w * h * 4);
        } else {
            K.clearF32(target, w * h * 4);
            for (let i = 0; i < from; i++) await this._composeAsync(target, i);
            if (from > 0) {
                if (!this._prefix) this._prefix = K.f32(w * h * 4);
                K.copyF32(target, this._prefix, w * h * 4);
                this._prefixUpTo = from;
            } else {
                this._prefixUpTo = -1;      // see `flatten`
            }
        }

        for (let i = from; i < this.layers.length; i++) await this._composeAsync(target, i);
        this._seen = sigs;
        return target;
    }

    async _composeAsync(target, index) {
        const layer = this.layers[index];
        if (!layer.visible || layer.opacity <= 0) return;
        const base = layer.clip ? this._clipBase(index) : null;
        await this.pool.blendLayers(target, layer.surface.buffer, this.width, this.height,
            layer.blend, layer.opacity, {
                mask: layer.mask ? layer.mask.buffer : null,
                clip: base ? base.surface.buffer : null,
                clipMask: base?.mask ? base.mask.buffer : null,
            });
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
        for (const layer of this.layers) { layer.removeMask(); layer.surface.dispose(); }
        this.layers = [];
        if (this.composite) { this.composite.free(); this.composite = null; }
        if (this._prefix) { this._prefix.free(); this._prefix = null; }
        if (this._u8buf) { this._u8buf.free(); this._u8buf = null; }
        this._invalidate();
    }
}
