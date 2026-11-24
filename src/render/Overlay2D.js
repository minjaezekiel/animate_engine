/**
 * Execute an overlay draw list on a 2D canvas, and composite it over the 3D
 * frame.
 *
 * # The seam
 *
 * `OfflineRenderer` hands `backend.canvas()` to the sink every frame and does
 * not care what that canvas is. So the overlay needs no change to the render
 * loop at all: the backend returns a *composite* canvas, and the composite
 * draws the WebGL canvas and then the overlay. One `drawImage` per frame of a
 * same-size canvas is a GPU blit, and it is the cost of every compositing
 * step in every video pipeline.
 *
 * The alternative -- a CSS-positioned DOM layer over the canvas -- is
 * invisible to `MediaRecorder` and to `VideoFrame`, so it would show in a
 * preview and be absent from the file. That is the worst failure shape there
 * is, and it is why this is a canvas and not an element.
 *
 * # Why not draw text into the 3D scene
 *
 * Because a subtitle is not in the world. A screen-space quad in front of the
 * camera goes through tone mapping, bloom, depth of field and film grain,
 * which is exactly what you do not want happening to type: ACES crushes pure
 * white to about 0.84, bloom smears a caption's edges, and DOF puts it out of
 * focus whenever the focal plane is not at the camera. Drawing after the post
 * chain is the only place type stays type.
 */

/**
 * A canvas that is the 3D frame with the overlay on top.
 *
 * `source` is the renderer's canvas. Sized once; the 3D canvas and this one
 * are always the same size, because the overlay works in pixels of the final
 * frame.
 */
export function createCompositeCanvas(source, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    // `alpha: false` -- the 3D frame is opaque and always covers the canvas,
    // so there is nothing to blend with and an opaque context skips a
    // per-frame clear. `desynchronized` is deliberately NOT set: it allows
    // the browser to present a frame before the draw completes, and a
    // captured frame that is half-composited is a torn subtitle.
    const ctx = canvas.getContext('2d', { alpha: false });
    return {
        canvas,
        ctx,
        draw(ops) {
            ctx.drawImage(source, 0, 0, width, height);
            drawOverlay(ctx, ops);
        },
    };
}

/**
 * Run the op list. Deliberately dumb: every decision was made in
 * `core/art/overlay.js`, so this file has no arithmetic worth testing and no
 * place for a layout bug to hide.
 */
export function drawOverlay(ctx, ops) {
    if (!ops?.length) return;
    ctx.save();
    ctx.textBaseline = 'alphabetic';
    for (const op of ops) {
        ctx.globalAlpha = op.alpha ?? 1;
        switch (op.op) {
            case 'rect':
                ctx.fillStyle = op.fill;
                if (op.radius > 0) {
                    roundRect(ctx, op.x, op.y, op.w, op.h, op.radius);
                    ctx.fill();
                } else {
                    ctx.fillRect(op.x, op.y, op.w, op.h);
                }
                break;
            case 'text':
                ctx.font = op.font;
                ctx.textAlign = op.align;
                ctx.fillStyle = op.fill;
                ctx.fillText(op.text, op.x, op.y);
                break;
            case 'line':
                ctx.strokeStyle = op.stroke;
                ctx.lineWidth = op.width;
                ctx.beginPath();
                ctx.moveTo(op.x1, op.y1);
                ctx.lineTo(op.x2, op.y2);
                ctx.stroke();
                break;
            case 'dot':
                ctx.fillStyle = op.fill;
                ctx.beginPath();
                ctx.arc(op.x, op.y, op.r, 0, Math.PI * 2);
                ctx.fill();
                break;
            default:
                break;
        }
    }
    ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
    const rad = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.lineTo(x + w - rad, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad);
    ctx.lineTo(x + w, y + h - rad);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    ctx.lineTo(x + rad, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad);
    ctx.lineTo(x, y + rad);
    ctx.quadraticCurveTo(x, y, x + rad, y);
    ctx.closePath();
}

/**
 * Project a node id or a world point to pixels, for world-anchored labels.
 *
 * `behind` is reported rather than clamped. `Vector3.project` divides by w,
 * and for a point behind the camera w is negative -- so the result comes back
 * mirrored through the frame centre, inside the frame, looking entirely
 * valid. A label on the far side of a globe appeared on the near side,
 * pointing at nothing, and no check could have caught it from the numbers
 * alone because the numbers were in range.
 */
export function createProjector(THREE, { camera, resolve, width, height }) {
    const v = new THREE.Vector3();
    return (ref) => {
        if (Array.isArray(ref)) v.set(ref[0], ref[1], ref[2]);
        else {
            const node = resolve(ref);
            if (!node) return null;
            node.getWorldPosition(v);
        }
        // Camera space z: negative is in front of the camera in THREE's
        // right-handed convention.
        const inCamera = v.clone().applyMatrix4(camera.matrixWorldInverse);
        const behind = inCamera.z > -1e-4;
        v.project(camera);
        return {
            x: (v.x * 0.5 + 0.5) * width,
            y: (-v.y * 0.5 + 0.5) * height,
            behind,
        };
    };
}

/** `ctx.measureText`, memoised per (text, font). */
export function createMeasurer(ctx) {
    const cache = new Map();
    return (text, font) => {
        const key = `${font}\u0000${text}`;
        let w = cache.get(key);
        if (w === undefined) {
            ctx.font = font;
            w = ctx.measureText(text).width;
            cache.set(key, w);
        }
        return w;
    };
}
