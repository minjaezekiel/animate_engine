/**
 * Turn pointer events into strokes.
 *
 * ```js
 * const rec = new StrokeRecorder(canvas, {
 *     onStart: (s) => doc.draw('ink', s),
 *     onUpdate: (s) => { surface.forget(s); doc.draw('ink', s); },
 *     onEnd:   (s) => history.push(s),
 * });
 * rec.attach();
 * ```
 *
 * Lives outside `core/` because it touches the DOM. Core sees only the
 * finished `{ points, brush, size, color }`, which is the same object an
 * agent writes into a `film.json` -- so a stroke drawn by hand and a
 * stroke written by a model are the same thing, and either can be
 * replayed, serialised or animated identically.
 *
 * # Four things every naive implementation gets wrong
 *
 * **Coalesced events.** A stylus samples at 120-240 Hz but the browser
 * delivers `pointermove` once per frame, batching the rest. Reading only
 * the event itself discards three quarters of the samples, and the stroke
 * comes out as visible straight segments between frame positions.
 * `getCoalescedEvents()` returns the full batch; it is the single largest
 * quality difference in this file.
 *
 * **Pointer capture.** Without `setPointerCapture`, a stroke that leaves
 * the canvas stops receiving events and never gets its `pointerup`, so
 * the next click continues the old stroke. Capture also routes the end
 * event back even if the pointer is released over another element.
 *
 * **Mouse pressure is a lie.** A mouse reports `pressure: 0.5` while held
 * and `0` otherwise -- a constant, not a measurement. Treating it as real
 * gives a dead, uniform line from every brush with pressure dynamics, so
 * for a non-pen pointer the pressure is derived from speed instead.
 *
 * **`touch-action`.** Without `touch-action: none` the browser claims the
 * gesture for scrolling partway through, and the stroke simply stops.
 * This sets it on attach rather than relying on a stylesheet, because the
 * symptom -- strokes that break only on touch devices -- is hard to
 * attribute.
 */
import { smoothPoints } from '../core/paint/stroke.js';

/** A mouse reports exactly this while held, so it carries no information. */
const MOUSE_PRESSURE = 0.5;

export class StrokeRecorder {
    /**
     * @param {HTMLCanvasElement|HTMLElement} element
     * @param {object} [options]
     * @param {(stroke: object) => void} [options.onStart]
     * @param {(stroke: object, added: object[]) => void} [options.onUpdate]
     * @param {(stroke: object) => void} [options.onEnd]
     * @param {() => object} [options.brush]   current brush settings
     * @param {number} [options.smoothing=0.5] 0..1, applied on commit
     * @param {boolean} [options.tiltToAngle=true]
     *   Drive a chisel nib's angle from stylus tilt. Only meaningful for a
     *   brush with `aspect < 1` and `angleMode: 'fixed'`.
     */
    constructor(element, {
        onStart, onUpdate, onEnd, brush,
        smoothing = 0.5, tiltToAngle = true,
    } = {}) {
        this.element = element;
        this.onStart = onStart;
        this.onUpdate = onUpdate;
        this.onEnd = onEnd;
        this.brush = brush ?? (() => ({}));
        this.smoothing = smoothing;
        this.tiltToAngle = tiltToAngle;

        /** @type {object|null} the stroke in progress */
        this.stroke = null;
        this._pointerId = null;
        this._prevTouchAction = null;

        this._down = this._down.bind(this);
        this._move = this._move.bind(this);
        this._up = this._up.bind(this);
    }

    attach() {
        const el = this.element;
        this._prevTouchAction = el.style.touchAction;
        // Or the browser takes the gesture for scrolling partway through
        // and the stroke stops dead, on touch devices only.
        el.style.touchAction = 'none';
        el.addEventListener('pointerdown', this._down);
        el.addEventListener('pointermove', this._move);
        el.addEventListener('pointerup', this._up);
        el.addEventListener('pointercancel', this._up);
        return this;
    }

    detach() {
        const el = this.element;
        el.style.touchAction = this._prevTouchAction ?? '';
        el.removeEventListener('pointerdown', this._down);
        el.removeEventListener('pointermove', this._move);
        el.removeEventListener('pointerup', this._up);
        el.removeEventListener('pointercancel', this._up);
        return this;
    }

    /**
     * Event coordinates in canvas pixels.
     *
     * The canvas backing store is usually a different size from its CSS
     * box -- that is how a high-DPI canvas works -- so the ratio has to be
     * applied. Using `offsetX`/`offsetY` directly gives CSS pixels, and
     * every stroke lands at a fraction of the intended size on a Retina
     * display, which reads as "the brush is too small" rather than as a
     * coordinate bug.
     */
    _point(event) {
        const el = this.element;
        const rect = el.getBoundingClientRect();
        const sx = (el.width ?? rect.width) / (rect.width || 1);
        const sy = (el.height ?? rect.height) / (rect.height || 1);
        return {
            x: (event.clientX - rect.left) * sx,
            y: (event.clientY - rect.top) * sy,
            p: this._pressure(event),
            t: event.timeStamp,
            tilt: this.tiltToAngle ? tiltAngle(event) : undefined,
        };
    }

    /**
     * Pressure, or an honest substitute.
     *
     * A pen's `pressure` is a real measurement. A mouse's is the constant
     * 0.5, and a touch's is often 0 or 1 with nothing between. Passing
     * those through unchanged makes every pressure-sensitive brush draw a
     * dead uniform line, so for anything that is not a pen the value is
     * replaced later, in [`_commitPressure`], by one derived from speed --
     * which is what a real pen approximates anyway, since a fast stroke
     * deposits less ink.
     */
    _pressure(event) {
        if (event.pointerType === 'pen' && event.pressure > 0) return event.pressure;
        return event.pressure === MOUSE_PRESSURE || !event.pressure ? null : event.pressure;
    }

    _down(event) {
        if (this.stroke) return;                      // ignore a second pointer mid-stroke
        this._pointerId = event.pointerId;
        // Keeps events coming when the pointer leaves the element, and
        // guarantees the matching `pointerup` arrives.
        this.element.setPointerCapture?.(event.pointerId);

        this.stroke = {
            ...this.brush(),
            points: [this._point(event)],
            pointerType: event.pointerType,
        };
        this.onStart?.(this.stroke);
        event.preventDefault();
    }

    _move(event) {
        if (!this.stroke || event.pointerId !== this._pointerId) return;

        // The whole batch, not just this event. A stylus samples far
        // faster than the display refreshes, and the intermediate samples
        // are where the curve lives.
        const batch = event.getCoalescedEvents?.() ?? [event];
        const added = [];
        for (const e of batch) {
            const point = this._point(e);
            const last = this.stroke.points[this.stroke.points.length - 1];
            // Drop exact duplicates: a stationary pointer emits them and
            // they contribute nothing but resampling work.
            if (last && point.x === last.x && point.y === last.y) continue;
            this.stroke.points.push(point);
            added.push(point);
        }
        if (added.length) this.onUpdate?.(this.stroke, added);
        event.preventDefault();
    }

    _up(event) {
        if (!this.stroke || event.pointerId !== this._pointerId) return;
        this.element.releasePointerCapture?.(event.pointerId);

        const stroke = this.stroke;
        this.stroke = null;
        this._pointerId = null;

        this._commitPressure(stroke);
        if (this.smoothing > 0) {
            // Smoothing is applied on commit rather than live, so the
            // stroke the user watched being drawn is the stroke that is
            // kept. Smoothing live would make the line visibly crawl
            // behind the cursor and then settle, which reads as lag.
            stroke.points = smoothPoints(stroke.points, this.smoothing);
        }
        this.onEnd?.(stroke);
        event.preventDefault();
    }

    /**
     * Fill in pressure for pointers that do not report it.
     *
     * Speed is measured over the committed points and mapped so a slow
     * stroke presses hard. The curve is deliberately gentle: a mouse has
     * no pressure at all, and an aggressive mapping produces a line that
     * lurches between thick and thin at every hesitation.
     */
    _commitPressure(stroke) {
        const needs = stroke.points.some((q) => q.p == null);
        if (!needs) return;
        const pts = stroke.points;
        for (let i = 0; i < pts.length; i++) {
            if (pts[i].p != null) continue;
            const a = pts[Math.max(0, i - 1)];
            const b = pts[Math.min(pts.length - 1, i + 1)];
            const dt = Math.max(1, (b.t ?? 0) - (a.t ?? 0));
            const speed = Math.hypot(b.x - a.x, b.y - a.y) / dt;   // px per ms
            pts[i].p = 0.45 + 0.55 * (1 - Math.min(1, speed / 3));
        }
    }
}

/**
 * Stylus tilt as a nib angle in radians, or undefined.
 *
 * Prefers `azimuthAngle`, which is already the direction the pen leans in
 * and is what the spec added precisely because deriving it from
 * `tiltX`/`tiltY` is awkward. The fallback does derive it, and is correct
 * only near the vertical -- good enough for a nib angle, and better than
 * refusing to support the many devices that still report only tilt.
 *
 * Returns undefined for a pointer with no tilt at all, so a brush keeps
 * its authored angle rather than snapping to zero.
 */
export function tiltAngle(event) {
    if (typeof event.azimuthAngle === 'number'
        && (event.tiltX || event.tiltY || event.altitudeAngle != null)) {
        return event.azimuthAngle;
    }
    const { tiltX = 0, tiltY = 0 } = event;
    if (!tiltX && !tiltY) return undefined;
    return Math.atan2(tiltY, tiltX);
}
