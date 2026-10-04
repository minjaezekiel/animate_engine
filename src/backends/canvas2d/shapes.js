/**
 * Shape rendering. Each function draws one node's geometry in that node's
 * *local* space -- the backend has already applied the world transform, so
 * nothing here knows about hierarchy or camera.
 */

/** Path2D cache keyed by `d` string: parsing SVG path data per frame is waste. */
const pathCache = new Map();

function getPath(d, Path2DImpl) {
    let p = pathCache.get(d);
    if (!p) {
        p = new Path2DImpl(d);
        pathCache.set(d, p);
    }
    return p;
}

export function clearPathCache() { pathCache.clear(); }

export function drawShape(ctx, node, { Path2DImpl }) {
    const p = node.props;
    const alpha = p.alpha ?? 1;
    if (alpha <= 0) return;
    ctx.globalAlpha = alpha;

    switch (node.kind) {
        case 'rect': {
            const w = p.w ?? 0, h = p.h ?? 0;
            const x = p.cx ? -w / 2 : 0, y = p.cy ? -h / 2 : 0;
            if (p.fill) { ctx.fillStyle = p.fill; ctx.fillRect(x, y, w, h); }
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
            if (!img) break;
            const w = p.w ?? img.width ?? 0;
            const h = p.h ?? img.height ?? 0;
            ctx.drawImage(img, p.cx ? -w / 2 : 0, p.cy ? -h / 2 : 0, w, h);
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
