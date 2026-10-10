/**
 * A paint surface: premultiplied f32 RGBA, drawn by stamping strokes.
 *
 * ```js
 * const surface = new PaintSurface(kernels, 1280, 720);
 * surface.draw({ points, brush: 'ink', size: 20, color: '#111' });
 * surface.toRgba8(imageData.data);
 * ```
 *
 * # Why the buffer is f32 and premultiplied
 *
 * Neither choice is a preference.
 *
 * **Premultiplied**, because compositing in straight alpha needs a divide
 * per stroke per pixel and loses precision near alpha 0, where it shows as
 * dark fringes around every soft edge -- and a soft edge is most of what a
 * brush produces.
 *
 * **f32 rather than u8**, because a drawing is tens or hundreds of strokes
 * deep and 8-bit quantisation compounds. A 20-pass airbrush build-up in 8
 * bits visibly posterises, since each pass rounds its result before the
 * next reads it. The conversion to 8 bits happens exactly once, in
 * [`toRgba8`].
 *
 * The cost is memory: 1080p is 33 MB per layer. That is the right trade
 * for a drawing tool and it is also what makes the per-pixel kernels
 * bandwidth-bound; see `docs/15-PERFORMANCE.md`.
 *
 * # The stroke cache
 *
 * Resampling is pure and depends only on the stroke and its brush, so a
 * draw-on animation would otherwise redo identical work on every frame.
 * The cache is a `WeakMap` keyed on the stroke object, holding both the
 * resampled quads and the kernel buffer they were copied into -- so a
 * stroke revealed over 48 frames resamples once and each frame is a single
 * `stampMask` call with a different `count`.
 *
 * A `WeakMap` rather than a `Map` so that discarding a stroke releases its
 * cache. The kernel buffer it holds is *not* released by the GC, since the
 * allocator knows nothing about JS reachability -- [`dispose`] exists for
 * that, and a long editing session that creates and drops many strokes
 * should call [`forget`].
 */
import { resampleStroke, stampCountAt } from './stroke.js';
import { brush as resolveBrush } from './brushes.js';
import { pathToPoints } from './path.js';
import { makeGrainTexture, TEXTURE_MODES } from './texture.js';

/**
 * Parse `#rgb`, `#rrggbb` or `r,g,b` into three 0..1 components.
 *
 * Returns black for anything unparseable rather than throwing: a typo in a
 * colour should produce a visible mark that can be corrected, not abort a
 * render that may be hundreds of strokes in.
 */
export function parseColor(value) {
    if (Array.isArray(value)) return [value[0] ?? 0, value[1] ?? 0, value[2] ?? 0];
    const s = String(value ?? '#000').trim();
    const hex = s.startsWith('#') ? s.slice(1) : s;
    if (/^[0-9a-f]{3}$/i.test(hex)) {
        return [0, 1, 2].map((i) => parseInt(hex[i] + hex[i], 16) / 255);
    }
    if (/^[0-9a-f]{6}$/i.test(hex)) {
        return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    }
    return [0, 0, 0];
}

export class PaintSurface {
    /**
     * @param {import('../../kernels/index.js').Kernels} kernels
     * @param {number} width
     * @param {number} height
     * @param {object} [options]
     * @param {import('../../kernels/parallel.js').ParallelKernels} [options.pool]
     *   A worker pool. When given, [`drawAsync`] uses it; the synchronous
     *   [`draw`] always runs on the main thread, because a synchronous
     *   method cannot await workers.
     */
    constructor(kernels, width, height, { pool } = {}) {
        this.kernels = kernels;
        this.pool = pool ?? null;
        this.width = width;
        this.height = height;

        const pixels = width * height;
        /** Premultiplied f32 RGBA. The drawing. */
        this.buffer = kernels.f32(pixels * 4);
        /**
         * One shared coverage mask, reused by every stroke and cleared
         * between them. Allocating a 1080p mask per stroke would be 8 MB
         * of churn per stroke for no benefit -- only one stroke is ever
         * being accumulated at a time.
         */
        this.mask = kernels.f32(pixels);
        /** @type {WeakMap<object, {resampled: object, buf: object, brushKey: string}>} */
        this._cache = new WeakMap();
        /**
         * Grain tiles, keyed by seed and strength.
         *
         * Shared across every stroke using the same paper: a tile is a few
         * tens of kilobytes and generating one per stroke would dominate
         * the cost of drawing with a textured brush.
         *
         * @type {Map<string, {buf: object, width: number, height: number}>}
         */
        this._grain = new Map();
    }

    /**
     * The grain tile for a brush, generated once and reused.
     *
     * Strength is baked into the tile rather than passed to the kernel, so
     * `alpha *= texel` is already a strength-weighted blend and the hot
     * loop carries no extra parameter.
     */
    _texture(b) {
        if (!b.grain || b.grain <= 0) return null;
        const key = `${b.grainSeed}|${b.grain}`;
        let tile = this._grain.get(key);
        if (!tile) {
            const made = makeGrainTexture({ seed: b.grainSeed, strength: b.grain });
            const buf = this.kernels.u8(made.data.length);
            buf.array.set(made.data);
            tile = { buf, width: made.width, height: made.height };
            this._grain.set(key, tile);
        }
        return {
            buf: tile.buf,
            width: tile.width,
            height: tile.height,
            mode: TEXTURE_MODES[b.grainMode] ?? TEXTURE_MODES.canvas,
            scale: Math.max(0.05, b.grainScale),
        };
    }

    /** Erase the surface to transparent. */
    clear() {
        this.kernels.clearF32(this.buffer, this.width * this.height * 4);
    }

    /**
     * Resample a stroke, or return the cached result.
     *
     * The brush is part of the cache key because changing it changes the
     * dabs. The key is a cheap digest of the fields the resampler reads
     * rather than the whole record, so an unrelated edit -- a colour
     * change, say -- does not invalidate the geometry.
     */
    _prepare(stroke) {
        const b = resolveBrush(stroke.brush ?? 'pen', stroke.brushOverrides);
        const key = `${b.size}|${b.spacing}|${b.minSize}|${b.sizeCurve}|${b.minFlow}`
            + `|${b.flowCurve}|${b.taper}|${b.taperMin}|${b.flow}`
            + `|${b.jitterPos}|${b.jitterSize}|${b.jitterFlow}`
            + `|${b.aspect}|${b.angle}|${b.angleMode}`
            + `|${stroke.size ?? ''}|${stroke.seed ?? 0}`
            + `|${stroke.points?.length ?? 0}|${stroke.path ?? ''}`;

        const hit = this._cache.get(stroke);
        if (hit && hit.brushKey === key) return { ...hit, brushSpec: b };

        if (hit) hit.buf.free();
        // `path` is the form anybody should normally reach for: one line
        // of SVG data instead of two hundred coordinates. `points` wins if
        // both are present, since it is the more explicit statement.
        const points = stroke.points ?? (stroke.path
            ? pathToPoints(stroke.path, { pressure: stroke.pressure, tolerance: stroke.tolerance })
            : []);
        const resampled = resampleStroke({ ...stroke, points }, b);
        const buf = this.kernels.f32(Math.max(4, resampled.stamps.length));
        buf.array.set(resampled.stamps);
        const entry = { resampled, buf, brushKey: key };
        this._cache.set(stroke, entry);
        return { ...entry, brushSpec: b };
    }

    /**
     * Stamp a stroke onto the surface.
     *
     * `progress` in 0..1 reveals a prefix of the stroke, which is the
     * draw-on animation. It defaults to 1.
     *
     * Three steps, in this order and for the reasons in `raster.rs`: clear
     * the shared mask, accumulate every dab into it, then composite the
     * mask **once** at the brush's opacity. Compositing per dab is what
     * makes a stroke's darkness a record of input sampling rate.
     *
     * @returns {number} how many dabs were stamped
     */
    draw(stroke, { progress = 1 } = {}) {
        const { resampled, buf, brushSpec } = this._prepare(stroke);
        const count = stampCountAt(resampled, progress);
        if (count === 0) return 0;

        const { width: w, height: h, kernels: K } = this;
        const [r, g, b] = parseColor(stroke.color ?? '#000');
        const opacity = (stroke.opacity ?? 1) * brushSpec.opacity;

        if (brushSpec.wet) {
            // A wet brush cannot use the mask: every dab carries a
            // different colour, which is the entire point. It composites
            // dab by dab instead, and is therefore sequential and the
            // slowest path here.
            K.smudgeStroke(this.buffer, w, h, buf, count, brushSpec.hardness,
                brushSpec.smudge, brushSpec.colorRate, brushSpec.sampleRadius,
                r, g, b, opacity);
            return count;
        }

        K.clearF32(this.mask, w * h);
        K.stampMask(this.mask, w, h, buf, count, brushSpec.hardness, brushSpec.mode,
            0, h, this._texture(brushSpec));
        K.compositeMask(this.buffer, this.mask, w, h, r, g, b, opacity,
            brushSpec.erase ? 1 : 0);
        return count;
    }

    /**
     * As [`draw`], across the worker pool when one was supplied.
     *
     * The two kernel calls are each split by rows and are safe to split
     * because both are per-pixel; the clear, the stamp and the composite
     * are nonetheless awaited in sequence, since the composite reads the
     * mask the stamp wrote.
     */
    async drawAsync(stroke, { progress = 1 } = {}) {
        if (!this.pool) return this.draw(stroke, { progress });
        const { resampled, buf, brushSpec } = this._prepare(stroke);
        const count = stampCountAt(resampled, progress);
        if (count === 0) return 0;

        // A wet brush is sequential by nature, so there is nothing to
        // split; run it on the main thread rather than pretend otherwise.
        if (brushSpec.wet) return this.draw(stroke, { progress });

        const { width: w, height: h } = this;
        this.kernels.clearF32(this.mask, w * h);
        await this.pool.stampMask(this.mask, w, h, buf, count,
            brushSpec.hardness, brushSpec.mode, this._texture(brushSpec));

        const [r, g, b] = parseColor(stroke.color ?? '#000');
        const opacity = (stroke.opacity ?? 1) * brushSpec.opacity;
        await this.pool.compositeMask(this.buffer, this.mask, w, h, r, g, b, opacity,
            brushSpec.erase ? 1 : 0);
        return count;
    }

    /**
     * Draw a list of strokes in order.
     *
     * `at` is an optional overall progress across the whole list, which is
     * what animates a drawing appearing stroke by stroke: strokes before
     * the cursor are complete, the one under it is partial, and the rest
     * are absent. Weighted by dab count rather than by stroke count, so a
     * long stroke takes proportionally longer to appear than a short one
     * -- weighting by stroke count makes a single dot take as long as a
     * sweeping line, which reads as a stall.
     */
    drawAll(strokes, { at = 1 } = {}) {
        if (at >= 1) {
            for (const s of strokes) this.draw(s);
            return;
        }
        const counts = strokes.map((s) => this._prepare(s).resampled.count);
        const total = counts.reduce((a, b) => a + b, 0);
        let budget = Math.max(0, Math.min(1, at)) * total;
        for (let i = 0; i < strokes.length; i++) {
            if (budget <= 0) break;
            const n = counts[i];
            this.draw(strokes[i], { progress: n > 0 ? Math.min(1, budget / n) : 1 });
            budget -= n;
        }
    }

    /**
     * Convert to straight u8 RGBA, for `putImageData`.
     *
     * Writes into `target` when given -- pass `imageData.data` to avoid a
     * copy -- otherwise allocates.
     */
    toRgba8(target) {
        const n = this.width * this.height;
        if (!this._u8 || this._u8.length !== n * 4) {
            if (this._u8buf) this._u8buf.free();
            this._u8buf = this.kernels.u8(n * 4);
            this._u8 = this._u8buf.array;
        }
        this.kernels.maskToRgba8(this.buffer, this._u8buf, n);
        const out = this._u8buf.array;
        if (target) { target.set(out); return target; }
        return Uint8Array.from(out);
    }

    /** Drop a stroke's cached resampling and its kernel buffer. */
    forget(stroke) {
        const hit = this._cache.get(stroke);
        if (hit) { hit.buf.free(); this._cache.delete(stroke); }
    }

    /**
     * Release the surface's buffers.
     *
     * Cached per-stroke buffers are not reachable from here -- the
     * `WeakMap` deliberately does not enumerate -- so a caller that
     * creates and drops many strokes should [`forget`] them as it goes.
     * For a surface that is simply being torn down, the whole kernel
     * memory goes with it.
     */
    dispose() {
        this.buffer.free();
        this.mask.free();
        for (const tile of this._grain.values()) tile.buf.free();
        this._grain.clear();
        if (this._u8buf) this._u8buf.free();
        this._u8buf = null;
        this._u8 = null;
    }
}
