/**
 * Shape rendering. Each function draws one node's geometry in that node's
 * *local* space -- the backend has already applied the world transform, so
 * nothing here knows about hierarchy or camera.
 */

/**
 * Path cache: parsing SVG path data every frame is pure waste at 2880 frames.
 *
 * Keyed by implementation as well as by `d`, because a RecordingPath2D from a
 * test render must never be handed to a real canvas context (which rejects it
 * outright) and vice versa. A single `d`-keyed cache silently leaks objects
 * between backends.
 */
const pathCaches = new WeakMap();

function getPath(d, Path2DImpl) {
    let cache = pathCaches.get(Path2DImpl);
    if (!cache) pathCaches.set(Path2DImpl, (cache = new Map()));
    let p = cache.get(d);
    if (!p) {
        p = new Path2DImpl(d);
        cache.set(d, p);
    }
    return p;
}

export function clearPathCache(Path2DImpl) {
    if (Path2DImpl) pathCaches.delete(Path2DImpl);
}

/**
 * Resolve a fill that may be a gradient spec rather than a colour string.
 * Gradients are built per draw because the context owns them; the spec is
 * plain data so it still serializes and still diffs.
 */
function resolveFill(ctx, node, w, h) {
    const g = node.props.gradient;
    if (!g) return node.props.fill;
    const [x0, y0, x1, y1] = g.from ?? [0, -h / 2, 0, h / 2];
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [stop, color] of g.stops ?? []) grad.addColorStop(stop, color);
    return grad;
}

/**
 * Draw an image node, optionally cropping a sub-rectangle of a sprite atlas.
 *
 * `sx/sy/sw/sh` select the source frame; without them the whole image is
 * used. `fit` decides what happens when the destination box and the source
 * have different aspect ratios -- 'stretch' is the old behaviour and still
 * the default, but a background declared at frame size would otherwise
 * distort any art that is not exactly 16:9.
 */
function drawImageNode(ctx, img, p) {
    const srcW = p.sw ?? img.width ?? 0;
    const srcH = p.sh ?? img.height ?? 0;
    if (!srcW || !srcH) return;

    let w = p.w ?? srcW;
    let h = p.h ?? srcH;
    if (p.fit === 'contain' || p.fit === 'cover') {
        const scale = p.fit === 'contain'
            ? Math.min(w / srcW, h / srcH)
            : Math.max(w / srcW, h / srcH);
        w = srcW * scale;
        h = srcH * scale;
    }
    // `cx`/`cy` are booleans meaning "centre on this axis", not coordinates.
    const dx = p.cx ? -w / 2 : 0;
    const dy = p.cy ? -h / 2 : 0;

    if (p.sx != null || p.sy != null || p.sw != null || p.sh != null) {
        ctx.drawImage(img, p.sx ?? 0, p.sy ?? 0, srcW, srcH, dx, dy, w, h);
    } else {
        ctx.drawImage(img, dx, dy, w, h);
    }
}

export function drawShape(ctx, node, { Path2DImpl, alpha }) {
    const p = node.props;
    // The caller supplies the inherited alpha; fall back to the node's own
    // for direct callers that are not walking a hierarchy.
    const a = alpha ?? p.alpha ?? 1;
    if (a <= 0) return;
    ctx.globalAlpha = a;

    switch (node.kind) {
        case 'rect': {
            const w = p.w ?? 0, h = p.h ?? 0;
            const x = p.cx ? -w / 2 : 0, y = p.cy ? -h / 2 : 0;
            const fill = resolveFill(ctx, node, w, h);
            if (fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); }
            if (p.stroke) {
                ctx.strokeStyle = p.stroke;
                ctx.lineWidth = p.strokeWidth ?? 1;
                ctx.strokeRect(x, y, w, h);
            }
            break;
        }
        case 'ellipse': {
            ctx.beginPath();
            ctx.ellipse(0, 0, Math.abs(p.rx ?? 1), Math.abs(p.ry ?? 1), 0, 0, Math.PI * 2);
            if (p.fill) { ctx.fillStyle = p.fill; ctx.fill(); }
            if (p.stroke) {
                ctx.strokeStyle = p.stroke;
                ctx.lineWidth = p.strokeWidth ?? 1;
                ctx.stroke();
            }
            break;
        }
        case 'path': {
            if (!p.d) break;
            const path = getPath(p.d, Path2DImpl);
            if (p.fill) { ctx.fillStyle = p.fill; ctx.fill(path); }
            if (p.stroke) {
                ctx.strokeStyle = p.stroke;
                ctx.lineWidth = p.strokeWidth ?? 1;
                ctx.lineCap = p.lineCap ?? 'round';
                ctx.lineJoin = p.lineJoin ?? 'round';
                ctx.stroke(path);
            }
            break;
        }
        case 'image': {
            const img = p.image;
            // A string here means an asset id that nothing resolved. Drawing
            // it throws inside a real canvas, so refuse quietly rather than
            // take the frame down.
            if (!img || typeof img === 'string') break;
            drawImageNode(ctx, img, p);
            break;
        }
        case 'text': {
            if (p.text == null) break;
            ctx.font = p.font ?? '16px sans-serif';
            ctx.textAlign = p.align ?? 'center';
            ctx.textBaseline = p.baseline ?? 'alphabetic';
            if (p.stroke) {
                ctx.strokeStyle = p.stroke;
                ctx.lineWidth = p.strokeWidth ?? 3;
                ctx.strokeText(p.text, 0, 0);
            }
            if (p.fill) { ctx.fillStyle = p.fill; ctx.fillText(p.text, 0, 0); }
            break;
        }
        case 'group':
        case 'bone':
        case 'camera':
        default:
            break;      // structural only: contributes a transform, draws nothing
    }
    ctx.globalAlpha = 1;
}
