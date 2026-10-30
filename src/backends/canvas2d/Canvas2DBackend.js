import { drawShape } from './shapes.js';
import { identity, multiply, fromTransform, invert } from '../../core/math/mat2d.js';
import { RecordingPath2D } from './RecordingContext.js';

/**
 * Canvas2D backend: draws a core Scene to a 2D context.
 *
 * Contract notes that matter for offline rendering:
 *   - renderFrame() is SYNCHRONOUS and never touches requestAnimationFrame.
 *     That is the whole reason a deterministic frame-stepped render is
 *     possible; a backend that scheduled its own frames could not be driven.
 *   - the backend owns no animation state. It reads whatever the Evaluator
 *     has already written into the Scene.
 *
 * `ctx` may be any CanvasRenderingContext2D-shaped object, which is how this
 * runs under RecordingContext in Node with no native canvas.
 */
export class Canvas2DBackend {
    constructor({ ctx, canvas, width, height, Path2DImpl } = {}) {
        this.ctx = ctx ?? null;
        this._canvas = canvas ?? null;
        this.width = width ?? 1280;
        this.height = height ?? 720;
        this.Path2DImpl = Path2DImpl
            ?? (typeof Path2D !== 'undefined' ? Path2D : RecordingPath2D);
        this.capabilities = { kind: '2d', postFX: false, skinning: false };
    }

    /**
     * `contextAttributes` reaches `getContext('2d', ...)`. It matters because
     * a canvas hands back the context it already has and ignores attributes
     * on every later call -- so a caller that wants `willReadFrequently` has
     * to say so HERE, before anything else touches the canvas, or the flag is
     * silently dropped and nothing reports it.
     */
    mount(host, { width, height, contextAttributes } = {}) {
        if (width) this.width = width;
        if (height) this.height = height;
        if (!this.ctx) {
            if (host && typeof host.getContext === 'function') {
                this._canvas = host;                       // given a canvas directly
            } else if (host && typeof document !== 'undefined') {
                this._canvas = document.createElement('canvas');
                host.appendChild(this._canvas);
            }
            if (!this._canvas) throw new Error('Canvas2DBackend: no canvas to mount');
            this._canvas.width = this.width;
            this._canvas.height = this.height;
            this.ctx = this._canvas.getContext('2d', contextAttributes);
        }
        return this;
    }

    unmount() { /* nothing retained outside the canvas */ }

    resize(w, h) {
        this.width = w; this.height = h;
        if (this._canvas) { this._canvas.width = w; this._canvas.height = h; }
    }

    canvas() { return this._canvas; }

    /** No backend-side objects to reconcile: core nodes are read directly. */
    sync() { return this; }

    /**
     * Fit the authored frame into the output, preserving aspect.
     *
     * **This is what makes a resolution a resolution.** The camera carries the
     * size the film was authored at; without scaling by the ratio, rendering a
     * 1280x720 film at 640x360 showed a 640x360 WINDOW onto the middle of it
     * -- a crop, at 1:1 pixels. Characters walked in and out of a frame that
     * was not the frame, and the only clue was that it looked wrong. The
     * resolution ladder in `docs/04-RENDER-EXPORT.md` and the `WIDTH=`/
     * `HEIGHT=` options on `scripts/produce.mjs` all assumed this scaling
     * existed.
     *
     * `min` of the two ratios, so a mismatched aspect letterboxes rather than
     * stretching anybody.
     */
    frameMatrix(scene, cameraId) {
        const cam = cameraId ? scene.get(cameraId) : null;
        const fw = cam?.props?.frameWidth;
        const fh = cam?.props?.frameHeight;
        // No declared frame (a hand-built scene, a test, the legacy path):
        // behave exactly as before.
        if (!fw || !fh) return { fit: 1, dx: 0, dy: 0 };
        const fit = Math.min(this.width / fw, this.height / fh);
        return { fit, dx: (this.width - fw * fit) / 2, dy: (this.height - fh * fit) / 2 };
    }

    /**
     * Camera as an inverse transform. A 2D camera is not a new concept: it is
     * the view matrix, built so that the camera's position sits at the centre
     * of the frame and `zoom` scales about that centre.
     */
    viewMatrix(scene, cameraId) {
        const cam = cameraId ? scene.get(cameraId) : null;
        if (!cam) return identity();
        const zoom = cam.props.zoom ?? 1;
        const world = fromTransform({
            x: cam.transform.x ?? 0,
            y: cam.transform.y ?? 0,
            rot: cam.transform.rot ?? 0,
            sx: 1 / zoom, sy: 1 / zoom,
        });
        const view = invert(world) ?? identity();
        const { fit, dx, dy } = this.frameMatrix(scene, cameraId);
        const fw = cam.props.frameWidth ?? this.width;
        const fh = cam.props.frameHeight ?? this.height;
        // Re-centre so the world point under the camera lands mid-frame, then
        // scale the authored frame to the output.
        return multiply(
            multiply(fromTransform({ x: dx, y: dy, sx: fit, sy: fit }),
                     fromTransform({ x: fw / 2, y: fh / 2 })),
            view);
    }

    renderFrame(scene, cameraId) {
        const ctx = this.ctx;
        if (!ctx) throw new Error('Canvas2DBackend: not mounted');

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, this.width, this.height);

        const view = this.viewMatrix(scene, cameraId);
        // Screen-space nodes skip the camera but are still authored in frame
        // coordinates, so they take the fit on its own. A subtitle placed at
        // `height - margin` would otherwise sit off the bottom of any render
        // that was not the authored size.
        const { fit, dx, dy } = this.frameMatrix(scene, cameraId);
        const screen = fit === 1 && !dx && !dy
            ? null
            : fromTransform({ x: dx, y: dy, sx: fit, sy: fit });

        for (const { node, alpha } of scene.drawOrder()) {
            if (node.kind === 'camera') continue;
            // A screen-space node (background wash, letterbox, subtitle,
            // transition overlay) ignores the camera so a pan cannot slide it.
            const world = scene.worldMatrix(node.id);
            const m = node.props.screenSpace
                ? (screen ? multiply(screen, world) : world)
                : multiply(view, world);
            // A repeater draws the same node several times with an
            // accumulating transform -- the motion-graphics primitive behind
            // speed lines, radiating bursts, ladders and rows. One node and
            // five numbers instead of twenty hand-placed copies, and because
            // it is a draw-time loop the copies cost no scene nodes and no
            // tracks.
            const rep = node.props.repeat;
            const copies = rep ? Math.max(1, Math.min(64, Math.round(rep.count ?? 1))) : 1;
            for (let i = 0; i < copies; i++) {
                const t = rep ? repeatStep(rep, i) : null;
                const mm = t ? multiply(m, t) : m;
                ctx.setTransform(mm[0], mm[1], mm[2], mm[3], mm[4], mm[5]);
                // `alpha` is the inherited product, so a group's opacity
                // reaches its children rather than being dropped at the group.
                const a = rep ? alpha * Math.pow(rep.alpha ?? 1, i) : alpha;
                drawShape(ctx, node, { Path2DImpl: this.Path2DImpl, alpha: a });
            }
        }

        ctx.setTransform(1, 0, 0, 1, 0, 0);
        return this;
    }
}

/**
 * The i-th copy's offset transform for a repeater.
 *
 * Offsets accumulate: copy 3 is three steps of rotation, translation and
 * scale from the original, which is what makes a burst radiate evenly and a
 * row space evenly with one number each.
 */
function repeatStep(rep, i) {
    if (i === 0 && !rep.from) return null;
    const k = i + (rep.from ?? 0);
    return fromTransform({
        x: (rep.x ?? 0) * k,
        y: (rep.y ?? 0) * k,
        rot: (rep.rot ?? 0) * k,
        sx: Math.pow(rep.sx ?? 1, k),
        sy: Math.pow(rep.sy ?? 1, k),
        ox: 0, oy: 0,
    });
}
