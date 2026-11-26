/**
 * SVG -> film parts, without rasterising.
 *
 * # The gap
 *
 * `UrlProvider` and `FileProvider` both end in `createImageBitmap`, so every
 * 2D import in this repository has been a RASTER import: somebody's vector
 * logo arrives as pixels, and the first time a shot pushes in on it the
 * edges go soft. Fifty of the fifty-one films here live on the 2D path, so
 * this is worth more than its size suggests. See
 * [40-ASSET-IMPORT.md](../../../docs/pending/40-ASSET-IMPORT.md) §2.
 *
 * # Why it is small
 *
 * The 2D renderer has spoken SVG path syntax since the beginning:
 * `backends/canvas2d/shapes.js` hands a part's `d` straight to `Path2D`,
 * and caches the parse. So there is no renderer to write and no new shape
 * kind. What was missing was the parser, and the parser's whole job is to
 * flatten a tree of transforms and inherited styles into a flat list of
 * parts whose `d` is already in the film's own coordinates.
 *
 * # No DOM
 *
 * This runs in the compiler, in Node, at build time -- the same place the
 * texture synthesiser and the CSG run -- so it cannot use `DOMParser`. It is
 * a tag scanner over the string: O(n), one pass, no entity expansion (so a
 * billion-laughs DOCTYPE is text, not a bomb), and no `eval` anywhere, for
 * the reason `driver.js` sets out at length -- a film is data, and the
 * moment it can name code every film in git is an executable.
 */
import { normalizePath, transformPath, parseTransform, multiply, IDENTITY,
         pathBounds, toPathData } from './svgPath.js';

/**
 * A ceiling, not a budget. An illustration with ten thousand nodes is one
 * part per node in the film, one `Path2D` per node per frame, and almost
 * certainly a file that wanted to be a texture. Warned, not refused: the
 * author knows what they imported and we do not.
 */
export const SVG_MAX_NODES = 2000;

/** The elements that become geometry. Anything else is reported by name. */
export const SVG_SHAPES = ['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon'];

const SELF_CLOSING = /\/\s*>$/;
const TAG = /<\s*(\/?)\s*([A-Za-z_][\w:.-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
const ATTR = /([A-Za-z_][\w:.-]*)\s*=\s*"([^"]*)"|([A-Za-z_][\w:.-]*)\s*=\s*'([^']*)'/g;

function attrsOf(raw) {
    const out = {};
    ATTR.lastIndex = 0;
    let m;
    while ((m = ATTR.exec(raw))) out[(m[1] ?? m[3]).toLowerCase()] = m[2] ?? m[4];
    return out;
}

/** `style="fill:#f00;stroke-width:2"` merged over the presentation attributes. */
function styleOf(a) {
    const out = { ...a };
    for (const pair of String(a.style ?? '').split(';')) {
        const i = pair.indexOf(':');
        if (i < 0) continue;
        out[pair.slice(0, i).trim().toLowerCase()] = pair.slice(i + 1).trim();
    }
    return out;
}

const INHERITED = ['fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
                   'opacity', 'fill-opacity', 'stroke-opacity'];

const num = (v, fallback = 0) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
};

/**
 * One element -> path data in its own coordinates.
 *
 * `rect` with corner radii is the only one that is not a one-liner, and it is
 * four arcs; everything else is a handful of points. A `circle` is two arcs
 * rather than four, because `normalizePath` turns each into two cubics and
 * four cubics is the accurate number for a full ellipse.
 */
export function shapeToPathData(tag, a) {
    switch (tag) {
        case 'path': return a.d ?? '';
        case 'line':
            return `M${num(a.x1)} ${num(a.y1)}L${num(a.x2)} ${num(a.y2)}`;
        case 'polyline':
        case 'polygon': {
            const pts = String(a.points ?? '').trim().split(/[\s,]+/).map(Number);
            if (pts.length < 4) return '';
            let d = `M${pts[0]} ${pts[1]}`;
            for (let i = 2; i + 1 < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`;
            return tag === 'polygon' ? `${d}Z` : d;
        }
        case 'circle': {
            const r = num(a.r);
            if (r <= 0) return '';
            const cx = num(a.cx), cy = num(a.cy);
            return `M${cx - r} ${cy}A${r} ${r} 0 1 0 ${cx + r} ${cy}`
                 + `A${r} ${r} 0 1 0 ${cx - r} ${cy}Z`;
        }
        case 'ellipse': {
            const rx = num(a.rx), ry = num(a.ry);
            if (rx <= 0 || ry <= 0) return '';
            const cx = num(a.cx), cy = num(a.cy);
            return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}`
                 + `A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
        }
        case 'rect': {
            const w = num(a.width), h = num(a.height);
            if (w <= 0 || h <= 0) return '';
            const x = num(a.x), y = num(a.y);
            let rx = a.rx != null ? num(a.rx) : (a.ry != null ? num(a.ry) : 0);
            let ry = a.ry != null ? num(a.ry) : rx;
            rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
            if (!rx || !ry) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
            return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}`
                 + `V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}`
                 + `H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}`
                 + `V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
        }
        default: return '';
    }
}

/** `viewBox` -> the matrix that maps it onto a width x height box. */
export function viewBoxMatrix(viewBox, width, height) {
    if (!viewBox) return IDENTITY;
    const v = String(viewBox).trim().split(/[\s,]+/).map(Number);
    if (v.length !== 4 || v.some((n) => !Number.isFinite(n)) || !v[2] || !v[3]) return IDENTITY;
    const [vx, vy, vw, vh] = v;
    if (!width || !height) return [1, 0, 0, 1, -vx, -vy];
    // `preserveAspectRatio` defaults to uniform scaling, centred -- so an
    // importer that scaled each axis independently would quietly stretch
    // every logo whose box is not the aspect it was asked for.
    const s = Math.min(width / vw, height / vh);
    return [s, 0, 0, s, (width - vw * s) / 2 - vx * s, (height - vh * s) / 2 - vy * s];
}

/**
 * Parse an SVG document into film parts.
 *
 *   id        prefix for every part id, so two imports cannot collide
 *   width     target width in film units; height follows the aspect
 *   center    put the drawing's own centre at the part origin (default true),
 *             because a film places things by their middle
 *   decimals  coordinate rounding in the emitted `d`
 *
 * Returns `{ parts, bounds, size, warnings }`. Never throws on bad input: a
 * malformed file produces no parts and a warning that says which element.
 */
export function parseSVG(text, { id = 'svg', width = null, center = true,
                                 decimals = 3 } = {}) {
    /**
     * Comments and the contents of `<style>`/`<script>` come out first.
     *
     * This is a tag SCANNER, not a parser with a grammar, so a `<rect>`
     * inside a comment would otherwise be drawn and a selector inside a
     * stylesheet would be read as markup. Stripping is three lines and
     * removes both; the elements themselves are still counted below, so the
     * author is told their CSS was not applied.
     */
    const src = String(text ?? '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '')
        .replace(/(<\s*(?:style|script)\b[^>]*>)[\s\S]*?(<\s*\/\s*(?:style|script)\s*>)/gi,
                 '$1$2');
    const warnings = [];
    const parts = [];
    const skipped = new Map();

    const rootMatch = /<\s*svg\b((?:"[^"]*"|'[^']*'|[^>"'])*)>/i.exec(src);
    if (!rootMatch) return { parts, bounds: null, size: [0, 0], warnings: ['no <svg> element'] };
    const root = styleOf(attrsOf(rootMatch[1]));
    const docW = num(root.width, 0) || null;
    const docH = num(root.height, 0) || null;

    // The intrinsic box, before any requested resize: the viewBox if there is
    // one, else the width/height attributes, else measured from the geometry.
    const vb = root.viewbox ? String(root.viewbox).trim().split(/[\s,]+/).map(Number) : null;
    const intrinsic = (vb && vb.length === 4 && vb.every(Number.isFinite))
        ? [vb[2], vb[3]] : [docW ?? 0, docH ?? 0];

    const base = root.viewbox
        ? viewBoxMatrix(root.viewbox, intrinsic[0], intrinsic[1])
        : IDENTITY;

    const stack = [{ matrix: base, style: {}, tag: 'svg' }];
    let n = 0;
    let capped = false;

    TAG.lastIndex = 0;
    let m;
    while ((m = TAG.exec(src))) {
        const closing = m[1] === '/';
        const tag = m[2].toLowerCase();
        const raw = m[3] ?? '';
        if (tag === 'svg') {
            if (closing) break;
            continue;
        }
        if (closing) {
            if (stack.length > 1 && stack[stack.length - 1].tag === tag) stack.pop();
            continue;
        }
        const selfClosing = SELF_CLOSING.test(m[0]);
        const a = styleOf(attrsOf(raw));
        const parent = stack[stack.length - 1];
        const matrix = a.transform
            ? multiply(parent.matrix, parseTransform(a.transform)) : parent.matrix;
        const style = { ...parent.style };
        for (const k of INHERITED) if (a[k] != null) style[k] = a[k];

        if (tag === 'g' || tag === 'a' || tag === 'switch') {
            if (!selfClosing) stack.push({ matrix, style, tag });
            continue;
        }
        const hidden = stack.some((f) => f.hidden);
        if (!SVG_SHAPES.includes(tag)) {
            // Inside `<defs>` or a clip path nothing is drawn, and a
            // `<linearGradient>` in there is not a thing the author forgot.
            if (hidden) {
                if (!selfClosing) stack.push({ matrix, style, tag, hidden: true });
                continue;
            }
            // `defs`, `style`, `text`, `image`, `use`, `clipPath`, `filter`...
            // Reported by name and counted, because "nothing appeared" is a
            // bad answer and "7 <text> elements were skipped" is a good one.
            if (!['defs', 'title', 'desc', 'metadata', 'style', 'script'].includes(tag)
                || tag === 'style' || tag === 'script') {
                skipped.set(tag, (skipped.get(tag) ?? 0) + 1);
            }
            if (!selfClosing && (tag === 'defs' || tag === 'clippath' || tag === 'mask')) {
                // Skip the whole subtree: a clip path's geometry is not drawn.
                stack.push({ matrix, style, tag, hidden: true });
            }
            continue;
        }
        if (hidden) continue;
        if (n >= SVG_MAX_NODES) { capped = true; continue; }

        const d = shapeToPathData(tag, a);
        if (!d) continue;
        const segs = transformPath(normalizePath(d), matrix);
        if (!segs.length) continue;
        n++;
        parts.push({
            _segs: segs,
            id: `${id}-${a.id ? a.id.replace(/[^\w-]/g, '') : n}`,
            tag,
            ...paintOf(style, warnings),
        });
    }

    if (capped) {
        warnings.push(`more than ${SVG_MAX_NODES} drawable elements; `
            + `kept the first ${SVG_MAX_NODES}. A file this dense probably wants `
            + 'to be a texture, not a thousand parts.');
    }
    for (const [tag, count] of skipped) {
        warnings.push(`${count} <${tag}> element(s) skipped: `
            + (tag === 'text' ? 'text is a `text` part with a font, not geometry'
             : tag === 'use' ? 'symbol reuse is not resolved; flatten it in the editor'
             : tag === 'image' ? 'a raster inside an SVG is still a raster; import it separately'
             : tag === 'style' ? 'CSS classes are not applied; export with presentation attributes'
             : 'not drawable geometry'));
    }

    // Measure once, over everything, then place. Two passes beats guessing.
    let bounds = null;
    for (const p of parts) {
        const b = pathBounds(p._segs);
        if (!b) continue;
        bounds = bounds ? {
            left: Math.min(bounds.left, b.left), top: Math.min(bounds.top, b.top),
            right: Math.max(bounds.right, b.right), bottom: Math.max(bounds.bottom, b.bottom),
        } : { left: b.left, top: b.top, right: b.right, bottom: b.bottom };
    }
    if (bounds) {
        bounds.width = bounds.right - bounds.left;
        bounds.height = bounds.bottom - bounds.top;
    }

    const srcW = bounds?.width || intrinsic[0] || 1;
    const scale = width ? width / srcW : 1;
    const ox = center && bounds ? -(bounds.left + bounds.width / 2) : 0;
    const oy = center && bounds ? -(bounds.top + bounds.height / 2) : 0;
    const place = [scale, 0, 0, scale, ox * scale, oy * scale];

    for (const p of parts) {
        p.shape = { kind: 'path', d: toPathData(transformPath(p._segs, place), decimals) };
        delete p._segs;
        delete p.tag;
        if (p.strokeWidth != null) p.strokeWidth = +(p.strokeWidth * scale).toFixed(3);
    }

    return {
        parts, warnings,
        bounds: bounds ? {
            left: (bounds.left + ox) * scale, top: (bounds.top + oy) * scale,
            right: (bounds.right + ox) * scale, bottom: (bounds.bottom + oy) * scale,
            width: bounds.width * scale, height: bounds.height * scale,
        } : null,
        size: bounds ? [bounds.width * scale, bounds.height * scale] : [0, 0],
    };
}

/**
 * SVG paint -> the film's own fill/stroke keys.
 *
 * `fill` defaults to black in SVG and to nothing here, so an element with no
 * `fill` attribute has to be given one explicitly or the import comes out
 * invisible -- which looks exactly like the parser having failed.
 */
function paintOf(style, warnings) {
    const out = {};
    const paint = (v) => {
        if (v == null || v === 'none' || v === 'transparent') return null;
        if (/^url\(/i.test(v)) {
            if (!warnings.includes(GRAD)) warnings.push(GRAD);
            return null;
        }
        if (v === 'currentColor') return '#000000';
        return v;
    };
    const fill = style.fill === undefined ? '#000000' : paint(style.fill);
    const stroke = paint(style.stroke);
    if (fill) out.fill = fill;
    if (stroke) {
        out.stroke = stroke;
        out.strokeWidth = style['stroke-width'] != null ? num(style['stroke-width'], 1) : 1;
        if (style['stroke-linecap']) out.lineCap = style['stroke-linecap'];
        if (style['stroke-linejoin']) out.lineJoin = style['stroke-linejoin'];
    }
    const alpha = style.opacity != null ? num(style.opacity, 1) : 1;
    if (alpha !== 1) out.alpha = alpha;
    return out;
}

const GRAD = 'gradient and pattern fills (url(#...)) are not imported; '
    + 'the film has its own `gradient` key, which is keyable';
