/**
 * A cutout rig from a picture of a character.
 *
 * The laziest route that actually animates, and it is the one Spine, Live2D
 * and every image-based cutout tool take: do NOT vectorise the drawing. Cut
 * it into parts and put a pivot at each joint. The engine has drawn
 * `{ kind: 'image' }` with a source rectangle since Phase 8, so a rig of
 * image crops needs no new rendering code at all -- every part is the same
 * uploaded image with a different `sx/sy/sw/sh`.
 *
 * The parts are named exactly what `generateCharacterParts` names its own, so
 * a traced character gets `idle`, `breathe`, `walk` and `blink` for free from
 * `generateActions`, and `reach`, `grip` and `pose` work on it unchanged.
 * That naming is the entire integration.
 *
 * ponytail: silhouette analysis, not pose estimation. Row widths, where the
 * figure narrows at the neck and the waist, and where it splits into two legs
 * -- all of which are arithmetic over a mask. A pose model would read a
 * crossed arm and a three-quarter turn; this reads a standing figure, which
 * is what a cutout film wants anyway. Every region is overridable, because
 * the caller (a person looking at it, or an agent that can see it) is a
 * better detector than this will ever be.
 */

/** Opaque spans per row, within the figure's bounding box. */
export function rowRuns(mask, width, bounds) {
    const rows = [];
    for (let y = bounds.y; y < bounds.y + bounds.h; y++) {
        const runs = [];
        let start = -1;
        for (let x = bounds.x; x <= bounds.x + bounds.w; x++) {
            const on = x < bounds.x + bounds.w && mask[y * width + x];
            if (on && start < 0) start = x;
            else if (!on && start >= 0) { runs.push([start, x - 1]); start = -1; }
        }
        const covered = runs.reduce((n, [a, b]) => n + (b - a + 1), 0);
        rows.push({ y, runs, covered, x0: runs.length ? runs[0][0] : 0,
                    x1: runs.length ? runs[runs.length - 1][1] : -1 });
    }
    return rows;
}

const span = (row) => (row.runs.length ? row.x1 - row.x0 + 1 : 0);

/**
 * Where an arm meets the torso, by COLOUR.
 *
 * A figure standing with its arms at its sides is one silhouette: there is
 * no gap to find, and silhouette analysis genuinely cannot separate the arm.
 * Colour can -- a bare arm against a shirt, a sleeve against a coat -- and
 * that is most character art. Walk in from each edge until the colour
 * changes, and take the median across the rows so one stray pixel cannot
 * move the seam.
 *
 * Returns null when no consistent seam is there, which is the honest answer
 * for a figure in a one-colour costume, and the caller falls back to carving
 * a sleeve and says so.
 */
export function armSeams(rgba, width, rows, y0, y1, core, { tolerance = 34 } = {}) {
    const tol = tolerance * tolerance * 3;
    const far = (core[1] - core[0] + 1) * 0.42;
    const left = [], right = [];
    const differs = (q, r, g, b) => {
        const dr = rgba[q] - r, dg = rgba[q + 1] - g, db = rgba[q + 2] - b;
        return dr * dr + dg * dg + db * db > tol;
    };
    for (const row of rows) {
        if (row.y < y0 || row.y > y1 || !row.runs.length) continue;
        const scan = (from, step) => {
            const q0 = (row.y * width + from) * 4;
            if (rgba[q0 + 3] === 0) return null;
            const r = rgba[q0], g = rgba[q0 + 1], b = rgba[q0 + 2];
            for (let k = 1; k < far; k++) {
                const x = from + step * k;
                const q = (row.y * width + x) * 4;
                if (rgba[q + 3] === 0) return null;
                if (differs(q, r, g, b)) return x;
            }
            return null;
        };
        const l = scan(row.x0 + 1, 1);
        const r = scan(row.x1 - 1, -1);
        if (l != null) left.push(l);
        if (r != null) right.push(r);
    }
    const median = (xs) => (xs.length ? xs.sort((a, b) => a - b)[xs.length >> 1] : null);
    const need = Math.max(4, (y1 - y0) * 0.35);
    if (left.length < need || right.length < need) return null;
    return { left: median(left), right: median(right) };
}

/**
 * Find the landmarks a cutout rig needs: the neck, the shoulders, the waist
 * and the crotch.
 *
 * Each is the answer to one question about the silhouette, and each is stated
 * as such rather than as a fraction of height, so a child, a heavy build and
 * a figure in a coat all land in the right place.
 */
export function landmarks(mask, width, bounds) {
    const rows = rowRuns(mask, width, bounds);
    const h = rows.length;
    const yOf = (i) => bounds.y + i;
    const w = rows.map(span);

    /**
     * The neck is a DIP, and the shoulders are the rise out of it.
     *
     * Not "where the head stops", and not a fraction of height. Two earlier
     * rules both failed on a real figure: the widest row in the top third
     * finds the torso on anything but a big-headed figure with its arms
     * down, and the first row that is 30% wider than the narrowest so far
     * fires on the second row of the scalp, where the head is two pixels
     * across.
     *
     * A width profile over a standing figure rises across the skull, dips at
     * the neck and rises again at the shoulders. Finding the dip is the one
     * rule that holds for a long neck, a short one, a hat and a hood.
     */
    const smooth = w.map((_, i) => {
        let n = 0, sum = 0;
        for (let k = -1; k <= 1; k++) if (w[i + k] != null) { sum += w[i + k]; n++; }
        return sum / n;
    });
    const widest = Math.max(...smooth);
    const band = Math.max(3, Math.floor(h * 0.55));
    let neck = -1, shoulder = -1;
    let peak = 0;
    for (let i = 1; i < band; i++) {
        peak = Math.max(peak, smooth[i]);
        // A dip worth calling a neck: well under the skull above it, with the
        // figure widening again below it.
        if (peak < widest * 0.15 || smooth[i] > peak * 0.62) continue;
        let low = i, j = i;
        while (j + 1 < band && smooth[j + 1] <= smooth[low]) { j++; low = j; }
        let rise = -1;
        for (let k = low + 1; k < band; k++) {
            if (smooth[k] >= Math.max(smooth[low] * 1.5, smooth[low] + 3)) { rise = k; break; }
        }
        if (rise > 0) { neck = low; shoulder = rise; break; }
    }

    if (shoulder < 0) {
        /**
         * No dip: a figure with no neck to speak of, or a mascot. Fall back
         * to the first row markedly wider than the narrowest so far -- but
         * only once that narrowest is a real width rather than the two-pixel
         * crown of a head, which is what the guard below is for.
         */
        let runMin = Infinity;
        for (let i = 0; i < band; i++) {
            if (runMin >= widest * 0.2 && smooth[i] >= runMin * 1.3) { shoulder = i; break; }
            runMin = Math.min(runMin, smooth[i] || runMin);
            shoulder = i;
        }
        neck = 0;
        for (let i = 0; i < shoulder; i++) if (w[i] <= w[neck]) neck = i;
    }

    /**
     * The crotch is where the figure stops being two legs. Walk UP from the
     * bottom through the rows that are two runs or more; the topmost of them
     * is it.
     */
    let crotch = h - 1;
    let sawLegs = false;
    for (let i = h - 1; i > shoulder; i--) {
        if (rows[i].runs.length >= 2) { sawLegs = true; crotch = i; continue; }
        if (sawLegs) break;
    }
    if (!sawLegs) crotch = Math.floor(shoulder + (h - 1 - shoulder) * 0.52);

    // The hips are the last solid row above the crotch -- arms have almost
    // always ended by then, so it is the cleanest read of torso width there
    // is without guessing.
    const hipRow = rows[Math.max(shoulder, crotch - Math.max(2, Math.round(h * 0.02)))];
    const core = hipRow.runs.length
        ? [hipRow.runs[0][0], hipRow.runs[hipRow.runs.length - 1][1]]
        : [bounds.x, bounds.x + bounds.w - 1];

    // The waist is the narrowest torso row between the shoulders and the
    // crotch, measured on the CORE only, so an arm held out does not hide it.
    let waist = crotch;
    let narrowest = Infinity;
    for (let i = shoulder; i < crotch; i++) {
        let n = 0;
        for (const [a, b] of rows[i].runs) {
            n += Math.max(0, Math.min(b, core[1]) - Math.max(a, core[0]) + 1);
        }
        if (n > 0 && n < narrowest) { narrowest = n; waist = i; }
    }

    return {
        rows, bounds, widths: w,
        headTop: bounds.y, neckY: yOf(neck), shoulderY: yOf(shoulder),
        waistY: yOf(waist), crotchY: yOf(crotch), footY: bounds.y + h - 1,
        core,
    };
}

/** The box enclosing every run in `y0..y1` that `keep` lets through. */
const boxOf = (rows, y0, y1, keep) => {
    let x0 = Infinity, x1 = -Infinity;
    for (const row of rows) {
        if (row.y < y0 || row.y > y1) continue;
        for (const [a, b] of row.runs) {
            const kept = keep(a, b);
            if (!kept || kept[0] > kept[1]) continue;
            x0 = Math.min(x0, kept[0]);
            x1 = Math.max(x1, kept[1]);
        }
    }
    if (!Number.isFinite(x0)) return null;
    return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
};

/**
 * Cut the figure into the parts a cutout rig has.
 *
 * Every box is returned with the JOINT it rotates about, because that is the
 * number a rig lives or dies on: a shoulder a few pixels off makes an arm
 * swing like a pendulum hung from the wrong nail.
 */
export function estimateRegions(mask, width, height, options = {}) {
    const bounds = options.bounds;
    const rgba = options.rgba ?? null;
    if (!bounds) throw new Error('estimateRegions needs the figure bounds');
    const L = landmarks(mask, width, bounds);
    const { rows, core } = L;
    const warn = [];

    const head = boxOf(rows, L.headTop, L.neckY, (a, b) => [a, b])
        ?? { x: core[0], y: L.headTop, w: core[1] - core[0] + 1, h: L.neckY - L.headTop + 1 };
    let torso = { x: core[0], y: L.neckY, w: core[1] - core[0] + 1, h: L.crotchY - L.neckY + 1 };

    // Arms are whatever lies OUTSIDE the torso core between the shoulders and
    // the crotch. If a figure stands with its arms against its sides there is
    // nothing outside, so fall back to carving the outer fifth of the
    // shoulders -- and say so, because that fallback is a guess and the
    // caller may have a better one.
    const armBand = [L.shoulderY, Math.min(L.crotchY, L.shoulderY + Math.round((L.crotchY - L.shoulderY) * 1.0))];
    const left = boxOf(rows, armBand[0], armBand[1], (a, b) => [a, Math.min(b, core[0] - 1)]);
    const right = boxOf(rows, armBand[0], armBand[1], (a, b) => [Math.max(a, core[1] + 1), b]);
    // Arms touching the torso leave no gap in the silhouette, so try colour
    // before giving up: a bare arm against a shirt has a seam even though
    // the outline does not.
    const seams = rgba && (!left || !right)
        ? armSeams(rgba, width, rows, armBand[0], armBand[1], core) : null;
    const sleeve = Math.max(2, Math.round((core[1] - core[0] + 1) * 0.22));
    const armFallback = (side) => {
        if (seams) {
            return side === 'L'
                ? { x: core[0], y: L.shoulderY, w: Math.max(2, seams.left - core[0]),
                    h: armBand[1] - L.shoulderY + 1 }
                : { x: seams.right, y: L.shoulderY, w: Math.max(2, core[1] - seams.right + 1),
                    h: armBand[1] - L.shoulderY + 1 };
        }
        warn.push(`${side} arm is not separable from the torso by outline or by colour; `
            + 'carved from the shoulder. Pass `regions` to place it exactly.');
        return side === 'L'
            ? { x: core[0], y: L.shoulderY, w: sleeve, h: armBand[1] - L.shoulderY + 1 }
            : { x: core[1] - sleeve + 1, y: L.shoulderY, w: sleeve, h: armBand[1] - L.shoulderY + 1 };
    };
    const armL = (left && left.w >= 2 ? left : armFallback('L'));
    const armR = (right && right.w >= 2 ? right : armFallback('R'));

    // With a seam, the torso is what lies between the two arms.
    if (seams) torso = { ...torso, x: seams.left, w: Math.max(2, seams.right - seams.left + 1) };

    /**
     * Legs: read the split from SEVERAL rows down the legs and take the
     * median of what they agree on.
     *
     * Two things go wrong with one row. The first split row below the crotch
     * is usually still beside the HANDS -- a figure with its arms down has
     * four runs there, and taking the outermost two makes the hands into
     * legs, which is what the first version did. And any single row can land
     * on a shadow, a prop, a tear in the matte or the gap between the feet.
     *
     * Three rows and a median is the standard answer to both: an artifact has
     * to appear in two of the three samples to move the result, and the rows
     * are spread far enough apart that nothing local can.
     */
    const legSpan = L.footY - L.crotchY;
    const splits = [];
    for (const share of [0.30, 0.45, 0.60]) {
        const y = Math.min(L.footY - 1, L.crotchY + Math.max(1, Math.round(legSpan * share)));
        const row = rows.find((r) => r.y === y);
        if (!row) continue;
        // Only runs that overlap the torso core. Whatever a leg is, it is
        // under the body; a mark out beside the figure is not one.
        const inCore = row.runs.filter(([a, b]) => Math.min(b, core[1]) >= Math.max(a, core[0]));
        if (inCore.length < 2) continue;
        const two = inCore.slice()
            .sort((a, b) => (b[1] - b[0]) - (a[1] - a[0])).slice(0, 2)
            .sort((a, b) => a[0] - b[0]);
        splits.push([two[0][0], two[0][1], two[1][0], two[1][1]]);
    }
    const median = (k) => {
        const xs = splits.map((sp) => sp[k]).sort((a, b) => a - b);
        return xs[xs.length >> 1];
    };
    const probe = rows.find((r) => r.y === Math.min(L.footY - 1,
        L.crotchY + Math.max(1, Math.round(legSpan * 0.45)))) ?? null;
    let legL, legR;
    if (splits.length) {
        legL = { x: median(0), y: L.crotchY, w: median(1) - median(0) + 1, h: legSpan + 1 };
        legR = { x: median(2), y: L.crotchY, w: median(3) - median(2) + 1, h: legSpan + 1 };
    } else {
        warn.push('legs are not separable; the lower half was split down the middle. '
            + 'Pass `regions` to place them exactly.');
        const base = probe && probe.runs.length ? [probe.x0, probe.x1] : core;
        const half = Math.max(1, Math.floor((base[1] - base[0] + 1) / 2));
        legL = { x: base[0], y: L.crotchY, w: half, h: legSpan + 1 };
        legR = { x: base[0] + half, y: L.crotchY, w: half, h: legSpan + 1 };
    }

    return { landmarks: L, warnings: warn, boxes: { head, torso, armL, armR, legL, legR } };
}

/**
 * Split a limb box into its segments, top-down.
 *
 * An arm is upper, fore and hand; a leg is thigh, shin and foot. The ratios
 * are the figure-drawing ones, which is as good as it gets without finding
 * the elbow -- and finding the elbow in a silhouette is not a thing that can
 * be done.
 */
const SEGMENTS = {
    arm: [['', 0.45], ['fore', 0.37], ['hand', 0.18]],
    leg: [['thigh', 0.48], ['shin', 0.37], ['foot', 0.15]],
};

/**
 * A `jirex.film/1` character built from the regions.
 *
 * `scale` maps image pixels to scene units; by default the figure comes out
 * `height` units tall, which is what `DEFAULT_PROPORTIONS` uses, so a traced
 * character stands the same size as a generated one and can share a shot
 * with it.
 */
export function characterFromImage({
    asset, boxes, landmarks: L, height = 180, view = 'front', palette = null,
} = {}) {
    const b = L.bounds;
    const k = height / b.h;
    const px = (v) => +(v * k).toFixed(2);
    const parts = [];

    /**
     * One image crop, anchored at the joint it turns about.
     *
     * `ax`/`ay` place the joint inside the crop. Without them an image shape
     * can only be anchored at its top-left or its centre, and a head that
     * nods about its own middle looks like a head coming off.
     */
    const cut = (id, parent, rect, joint, parentJoint, z) => {
        parts.push({
            id, parent, z,
            pivot: parentJoint
                ? [px(joint[0] - parentJoint[0]), px(joint[1] - parentJoint[1])]
                : [0, 0],
            shape: {
                kind: 'image', asset,
                sx: Math.round(rect.x), sy: Math.round(rect.y),
                sw: Math.round(rect.w), sh: Math.round(rect.h),
                w: px(rect.w), h: px(rect.h),
                ax: px(joint[0] - rect.x), ay: px(joint[1] - rect.y),
            },
        });
        return joint;
    };

    const midX = (r) => r.x + r.w / 2;
    const hip = [midX(boxes.torso), L.crotchY];
    const neck = [midX(boxes.torso), L.neckY];

    parts.push({ id: 'hips', parent: null, pivot: [0, 0], z: 5 });
    cut('torso', 'hips', boxes.torso, hip, null, 10);
    cut('head', 'torso', boxes.head, [midX(boxes.head), L.neckY], hip, 20);

    for (const side of ['L', 'R']) {
        const arm = boxes[`arm${side}`];
        const leg = boxes[`leg${side}`];
        // The shoulder is the top of the arm box on the side nearest the
        // torso; the hip joint the top-centre of the leg box.
        let joint = [side === 'L' ? arm.x + arm.w : arm.x, L.shoulderY];
        let parent = 'torso';
        let parentJoint = hip;
        let top = arm.y;
        for (const [name, share] of SEGMENTS.arm) {
            const h2 = Math.max(1, Math.round(arm.h * share));
            const rect = { x: arm.x, y: top, w: arm.w, h: h2 };
            const id = `${name || 'arm'}${side}`;
            const here = [midX(rect), top];
            cut(id, parent, rect, name ? here : joint, parentJoint, 16);
            parentJoint = name ? here : joint;
            parent = id;
            top += h2;
            joint = here;
        }
        parent = 'hips';
        parentJoint = hip;
        top = leg.y;
        for (const [name, share] of SEGMENTS.leg) {
            const h2 = Math.max(1, Math.round(leg.h * share));
            const rect = { x: leg.x, y: top, w: leg.w, h: h2 };
            const here = [midX(rect), top];
            cut(`${name}${side}`, parent, rect, here, parentJoint, 11);
            parentJoint = here;
            parent = `${name}${side}`;
            top += h2;
        }
    }

    // `hips` is the root and the character's origin, so everything is
    // expressed relative to it and `move` still means what it means.
    for (const p of parts) if (p.parent === null) delete p.parent;

    return {
        character: {
            view, parts,
            ...(palette ? { palette } : {}),
            // Traced parts carry no `generate`, so the free cycles have to be
            // reached explicitly -- `proportions` is what sizes them.
            proportions: { height, headRatio: boxes.head.h / b.h },
        },
        scale: k,
        // Where the figure's feet are, so a film can stand it on the ground.
        feet: px(L.footY - L.crotchY),
        anchorNeck: [px(neck[0] - hip[0]), px(neck[1] - hip[1])],
    };
}
