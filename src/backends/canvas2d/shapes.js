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
    if (g.kind === 'radial') {
        const [cx, cy, r0, r1] = g.from ?? [0, 0, 0, Math.max(w, h) / 2];
        const grad = ctx.createRadialGradient(cx, cy, r0, cx, cy, r1);
        for (const [stop, color] of g.stops ?? []) grad.addColorStop(stop, color);
        return grad;
    }
    const [x0, y0, x1, y1] = g.from ?? [0, -h / 2, 0, h / 2];
    const grad = ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [stop, color] of g.stops ?? []) grad.addColorStop(stop, color);
    return grad;
}

/**
 * Compositing and glow.
 *
 * `blend` is the motion-graphics layer mode -- `add` is how every energy
 * effect in this idiom is made, and Canvas2D spells it `lighter`. `glow` maps
 * to the shadow machinery, which is the only blur Canvas2D offers without a
 * second surface, and is enough for an aura or a hot edge.
 *
 * Returns true if anything was set, so the caller knows to reset: these are
 * context-wide and leak into every later draw if left on.
 */
const BLEND = {
    add: 'lighter', lighter: 'lighter', screen: 'screen', multiply: 'multiply',
    overlay: 'overlay', darken: 'darken', lighten: 'lighten', normal: 'source-over',
};
export const BLEND_MODES = Object.keys(BLEND);

function applyCompositing(ctx, p) {
    let dirty = false;
    if (p.blend && BLEND[p.blend]) { ctx.globalCompositeOperation = BLEND[p.blend]; dirty = true; }
    if (p.glow) {
        const g = typeof p.glow === 'object' ? p.glow : { blur: p.glow };
        ctx.shadowColor = g.color ?? p.fill ?? p.stroke ?? '#ffffff';
        ctx.shadowBlur = g.blur ?? 12;
        ctx.shadowOffsetX = g.x ?? 0;
        ctx.shadowOffsetY = g.y ?? 0;
        dirty = true;
    }
    return dirty;
}

function clearCompositing(ctx) {
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowColor = 'rgba(0,0,0,0)';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
}

/**
 * Trim a stroked path to a fraction of its length.
 *
 * The motion-graphics staple: a line that draws itself on, an energy arc that
 * races along a path, a speed line that enters and leaves. Implemented with
 * the dash array rather than by splitting the path, because Canvas2D gives
 * exact path length nowhere -- a dash of `len` on, `len` off, offset by the
 * start, reproduces it for any `len` large enough to cover the shape.
 */
function applyTrim(ctx, p, trim) {
    const start = trim.start ?? 0;
    const end = trim.end ?? 1;
    const offset = trim.offset ?? 0;
    const span = Math.max(0, Math.min(1, end) - Math.max(0, start));
    if (span >= 1 && !offset) return false;
    if (span <= 0) return null;                       // nothing to draw
    // A length longer than any path this engine draws, so one dash covers it.
    const L = trim.length ?? 8000;
    ctx.setLineDash([span * L, L]);
    ctx.lineDashOffset = -(start + offset) * L;
    return true;
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
    const composited = applyCompositing(ctx, p);

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
            const rx = Math.abs(p.rx ?? 1), ry = Math.abs(p.ry ?? 1);
            ctx.beginPath();
            ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
            const fill = resolveFill(ctx, node, rx * 2, ry * 2);
            if (fill) { ctx.fillStyle = fill; ctx.fill(); }
            if (p.stroke) {
                const trimmed = p.trim ? applyTrim(ctx, p, p.trim) : false;
                if (trimmed !== null) {
                    ctx.strokeStyle = p.stroke;
                    ctx.lineWidth = p.strokeWidth ?? 1;
                    ctx.stroke();
                }
                if (trimmed) { ctx.setLineDash([]); ctx.lineDashOffset = 0; }
            }
            break;
        }
        case 'path': {
            if (!p.d) break;
            const path = getPath(p.d, Path2DImpl);
            const fill = resolveFill(ctx, node, p.w ?? 100, p.h ?? 100);
            if (fill) { ctx.fillStyle = fill; ctx.fill(path); }
            if (p.stroke) {
                const trimmed = p.trim ? applyTrim(ctx, p, p.trim) : false;
                if (trimmed !== null) {
                    ctx.strokeStyle = p.stroke;
                    ctx.lineWidth = p.strokeWidth ?? 1;
                    ctx.lineCap = p.lineCap ?? 'round';
                    ctx.lineJoin = p.lineJoin ?? 'round';
                    ctx.stroke(path);
                }
                if (trimmed) { ctx.setLineDash([]); ctx.lineDashOffset = 0; }
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
        case 'paint':
        case 'photo': {
            // One branch for both, because a `PaintPainter` and a
            // `PhotoPainter` expose the same thing -- `canvasAt(progress)`
            // -- and the node's channel is `props.progress` either way.
            //
            // A painter is attached by the backend at mount, the same way
            // an `image` node's asset id is resolved to a real image
            // before render. A bare spec here means nothing resolved it;
            // drawing would throw, so refuse quietly rather than take the
            // frame down.
            const painter = p.painter;
            if (!painter) break;
            // `canvasAt` is memoised on progress, so a held frame costs a
            // property read and only a changing reveal re-renders.
            const canvas = painter.canvasAt(p.progress ?? 1);
            if (canvas) drawImageNode(ctx, canvas, p);
            break;
        }
        case 'group':
        case 'bone':
        case 'camera':
        default:
            break;      // structural only: contributes a transform, draws nothing
    }
    ctx.globalAlpha = 1;
    if (composited) clearCompositing(ctx);
}
