/**
 * Turning a picture into something the rig can use: a matte, a mask, and an
 * outline.
 *
 * The engine could already DRAW an uploaded image -- `{ kind: 'image' }` with
 * a source rectangle has been the sprite-atlas path since Phase 8 -- and it
 * could not turn one into a character. This is the missing half, and it is
 * deliberately the cheap half: no segmentation model, no pose estimator, no
 * new dependency.
 *
 * ponytail: a corner flood fill and a boundary walk, not a neural matte.
 * Character art arrives on a flat or near-flat background far more often than
 * not, and when it does not the caller can pass a cut-out PNG and skip the
 * matte entirely. Reach for a model when someone brings a photograph of a
 * person against a hedge.
 *
 * Pure: plain typed arrays in, plain arrays out. No canvas, no DOM, so the
 * same functions serve the browser upload and the headless agent op.
 */

/**
 * Knock the background out by flooding inward from the edges.
 *
 * Flooding from the CORNERS rather than thresholding a colour is what makes
 * this safe on a character who is wearing the background colour: a white
 * shirt stays, because it is not connected to the edge. That one property is
 * the whole reason to do it this way.
 *
 * `tolerance` is a squared-distance budget in 0..255 RGB space. Returns how
 * many pixels were cleared and whether the flood reached the middle, which is
 * the signal that the background was not flat and the caller should stop
 * rather than ship a character with a hole in it.
 */
export function matteBackground(rgba, width, height, { tolerance = 28, seeds = null } = {}) {
    const n = width * height;
    const seen = new Uint8Array(n);
    const stack = [];
    const tol = tolerance * tolerance * 3;

    const push = (x, y) => {
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        const i = y * width + x;
        if (!seen[i]) { seen[i] = 1; stack.push(i); }
    };

    // Four corners by default; a caller that knows better can name its own.
    const corners = seeds ?? [[0, 0], [width - 1, 0], [0, height - 1], [width - 1, height - 1]];
    const key = [];
    for (const [x, y] of corners) {
        const q = (y * width + x) * 4;
        key.push([rgba[q], rgba[q + 1], rgba[q + 2]]);
        push(x, y);
    }
    const matches = (q) => key.some(([r, g, b]) => {
        const dr = rgba[q] - r, dg = rgba[q + 1] - g, db = rgba[q + 2] - b;
        return dr * dr + dg * dg + db * db <= tol;
    });

    let cleared = 0;
    while (stack.length) {
        const i = stack.pop();
        const q = i * 4;
        // An already-transparent pixel is background whatever its colour is;
        // a PNG that was cut out elsewhere must not be re-matted by hue.
        if (rgba[q + 3] !== 0 && !matches(q)) continue;
        rgba[q + 3] = 0;
        cleared++;
        const x = i % width, y = (i / width) | 0;
        push(x - 1, y); push(x + 1, y); push(x, y - 1); push(x, y + 1);
    }
    return { cleared, fraction: cleared / n, keys: key };
}

/**
 * Clear background that the corner flood could not reach.
 *
 * The gap between two legs is closed at the bottom by the shoes, the gap
 * under an arm is closed by the hand on the hip, and a flood from the edges
 * reaches neither. They stay opaque, the silhouette reads as one solid mass,
 * and the rig puts both legs in one box.
 *
 * Two conditions keep this safe on a figure that WEARS the background
 * colour: the region must match a sampled background colour, and it must be
 * small next to the figure. A white shirt is a large region; the gap between
 * two legs is not.
 */
export function clearHoles(rgba, width, height, keys, {
    tolerance = 28, maxFraction = 0.22, threshold = 24,
} = {}) {
    const tol = tolerance * tolerance * 3;
    const matches = (q) => keys.some(([r, g, b]) => {
        const dr = rgba[q] - r, dg = rgba[q + 1] - g, db = rgba[q + 2] - b;
        return dr * dr + dg * dg + db * db <= tol;
    });
    const candidate = new Uint8Array(width * height);
    let opaque = 0;
    for (let i = 0; i < candidate.length; i++) {
        const q = i * 4;
        if (rgba[q + 3] < threshold) continue;
        opaque++;
        if (matches(q)) candidate[i] = 1;
    }
    if (!opaque) return { cleared: 0, regions: 0 };

    const { label, parts } = components(candidate, width, height, { minArea: 1 });
    let cleared = 0, regions = 0;
    for (const part of parts) {
        if (part.area > opaque * maxFraction) continue;
        regions++;
        for (let i = 0; i < label.length; i++) {
            if (label[i] === part.id) { rgba[i * 4 + 3] = 0; cleared++; }
        }
    }
    return { cleared, regions };
}

/** A binary mask of what is opaque enough to be part of the figure. */
export function maskFromAlpha(rgba, width, height, { threshold = 24 } = {}) {
    const mask = new Uint8Array(width * height);
    for (let i = 0; i < mask.length; i++) mask[i] = rgba[i * 4 + 3] >= threshold ? 1 : 0;
    return mask;
}

/** The opaque bounding box, or null if nothing survived the matte. */
export function maskBounds(mask, width, height) {
    let x0 = width, y0 = height, x1 = -1, y1 = -1, count = 0;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            if (!mask[y * width + x]) continue;
            count++;
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
    }
    if (x1 < 0) return null;
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, count };
}

/**
 * Label connected components, largest first.
 *
 * A scan of an uploaded drawing finds the figure plus whatever else survived
 * the matte -- a signature, a stray mark, a speech bubble. Keeping only the
 * largest is usually right and is always the caller's decision, so this
 * reports them all with their areas.
 */
export function components(mask, width, height, { minArea = 32 } = {}) {
    const label = new Int32Array(mask.length).fill(-1);
    const found = [];
    const stack = [];
    for (let start = 0; start < mask.length; start++) {
        if (!mask[start] || label[start] >= 0) continue;
        const id = found.length;
        let area = 0, x0 = width, y0 = height, x1 = -1, y1 = -1;
        label[start] = id; stack.push(start);
        while (stack.length) {
            const i = stack.pop();
            area++;
            const x = i % width, y = (i / width) | 0;
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                const nx = x + dx, ny = y + dy;
                if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
                const j = ny * width + nx;
                if (mask[j] && label[j] < 0) { label[j] = id; stack.push(j); }
            }
        }
        found.push({ id, area, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
    }
    return { label, parts: found.filter((p) => p.area >= minArea).sort((a, b) => b.area - a.area) };
}

/** Keep only the given component, clearing every other opaque pixel. */
export function keepComponent(mask, label, id) {
    for (let i = 0; i < mask.length; i++) if (mask[i] && label[i] !== id) mask[i] = 0;
    return mask;
}

// ------------------------------------------------------------- the outline

const NEIGHBOURS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

/**
 * Walk the boundary of a component, Moore-neighbourhood style.
 *
 * ponytail: boundary following, not marching squares. It returns the ring
 * ALREADY ORDERED, which is what an SVG path needs; marching squares returns
 * a soup of edge segments that then have to be stitched, and the stitching is
 * longer than this function.
 *
 * The result is a closed ring of integer pixel corners, clockwise in a
 * y-down image.
 */
export function traceRing(mask, width, height, start) {
    const at = (x, y) => (x >= 0 && y >= 0 && x < width && y < height ? mask[y * width + x] : 0);
    const sx = start % width, sy = (start / width) | 0;
    if (!at(sx, sy)) return [];
    const ring = [[sx, sy]];
    let cx = sx, cy = sy;
    // The direction we came FROM, so the search starts just past it and the
    // walk cannot immediately turn back on itself.
    let back = 4;
    for (let guard = 0; guard < width * height * 8; guard++) {
        let moved = false;
        for (let k = 1; k <= 8; k++) {
            const dir = (back + k) % 8;
            const [dx, dy] = NEIGHBOURS[dir];
            if (!at(cx + dx, cy + dy)) continue;
            cx += dx; cy += dy;
            back = (dir + 5) % 8;
            moved = true;
            break;
        }
        if (!moved) break;                       // an isolated pixel
        if (cx === sx && cy === sy) break;       // closed
        ring.push([cx, cy]);
    }
    return ring;
}

/**
 * Douglas-Peucker. A traced ring has one point per boundary pixel, which for
 * a 1000px figure is several thousand points and an SVG path nobody can read
 * or edit; `tolerance` in pixels cuts that by one to two orders of magnitude
 * with no visible change.
 */
export function simplify(points, tolerance = 1.5) {
    if (points.length < 3) return points.slice();
    const keep = new Uint8Array(points.length);
    keep[0] = keep[points.length - 1] = 1;
    const tol2 = tolerance * tolerance;
    const stack = [[0, points.length - 1]];
    while (stack.length) {
        const [a, b] = stack.pop();
        if (b <= a + 1) continue;
        const [ax, ay] = points[a], [bx, by] = points[b];
        const dx = bx - ax, dy = by - ay;
        const len2 = dx * dx + dy * dy;
        let worst = -1, worstAt = -1;
        for (let i = a + 1; i < b; i++) {
            const [px, py] = points[i];
            let d2;
            if (len2 === 0) {
                d2 = (px - ax) ** 2 + (py - ay) ** 2;
            } else {
                const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
                d2 = (px - ax - dx * t) ** 2 + (py - ay - dy * t) ** 2;
            }
            if (d2 > worst) { worst = d2; worstAt = i; }
        }
        if (worst > tol2) {
            keep[worstAt] = 1;
            stack.push([a, worstAt], [worstAt, b]);
        }
    }
    return points.filter((_, i) => keep[i]);
}

/** Rings as SVG path data, one closed subpath each. */
export function pathFromRings(rings, { precision = 1 } = {}) {
    const r = (v) => +v.toFixed(precision);
    return rings.filter((ring) => ring.length >= 3)
        .map((ring) => `M${r(ring[0][0])},${r(ring[0][1])} `
            + ring.slice(1).map(([x, y]) => `L${r(x)},${r(y)}`).join(' ') + ' Z')
        .join(' ');
}

/**
 * The whole trace in one call: matte, mask, largest components, outlines.
 *
 * `rgba` is mutated in place by the matte, which is the point -- the caller
 * usually wants the cut-out image as well as the outline.
 */
export function traceImage(rgba, width, height, {
    matte = true, tolerance = 28, threshold = 24, simplifyTo = 1.5,
    keep = 1, minArea = 64, holes = true,
} = {}) {
    const matted = matte
        ? matteBackground(rgba, width, height, { tolerance })
        : { fraction: 0, keys: [] };
    const holed = matte && holes
        ? clearHoles(rgba, width, height, matted.keys, { tolerance, threshold })
        : { cleared: 0, regions: 0 };
    const mask = maskFromAlpha(rgba, width, height, { threshold });
    const { label, parts } = components(mask, width, height, { minArea });
    const taken = parts.slice(0, Math.max(1, keep));
    const rings = taken.map((p) => {
        // The first opaque pixel of this component, scanning its own box.
        for (let y = p.y; y < p.y + p.h; y++) {
            for (let x = p.x; x < p.x + p.w; x++) {
                const i = y * width + x;
                if (mask[i] && label[i] === p.id) return simplify(traceRing(mask, width, height, i), simplifyTo);
            }
        }
        return [];
    });
    for (const p of parts.slice(taken.length)) keepComponent(mask, label, taken[0]?.id ?? p.id);
    return {
        mask, label, components: parts, kept: taken,
        rings, path: pathFromRings(rings),
        bounds: maskBounds(mask, width, height),
        matted: matted.fraction, holes: holed.regions,
    };
}
