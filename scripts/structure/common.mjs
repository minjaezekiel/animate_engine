/**
 * Shared machinery for "Reading the Rock" / "Kusoma Mwamba".
 *
 * The generic board helpers come from `../lib/boards.mjs`. What is here is
 * this series' own: the bilingual end card, the pinned banner, and the
 * STRUCTURAL primitives -- beds, joints, folds, faults, shear zones, veins
 * and a strike-and-dip symbol -- which are the entire visual vocabulary of
 * the six parts.
 *
 * One rule governs the drawings: a structure is drawn by what it DOES to the
 * layering, never as an icon of itself. A fault is beds that no longer line
 * up. A fold is beds that bend. A shear zone is foliation dragged into
 * parallel. Drawn as symbols instead, they teach nothing -- the viewer
 * learns the logo rather than the thing, and then cannot recognise it in a
 * real outcrop, which is the only place it matters.
 */
import {
    FONT, L, M, SAFE, pathPart, poly, rectPart, smooth, textPart,
} from '../lib/diagram.mjs';
import { BANNER, CTA, ENGINE_AD, REPO, SERIES, SHARE, STRUCT_PALETTE, TAGLINE, rateOf }
    from '../lib/structure.mjs';
import { estimateLine } from '../../src/core/script/pacing.js';

export {
    bez3, blinks, board, cardRows, castBoard, foldBand, rng, squarePath,
    statParts, strata,
} from '../lib/boards.mjs';

import { foldBand, rng } from '../lib/boards.mjs';

/**
 * The title plate, which does NOT open the film.
 *
 * Every retained opening in the reference narration front-loads speech, and a
 * card in the first two seconds spends the window the platform gives you. So
 * the hook line plays over the picture and this arrives UNDER it, a few
 * seconds in, by which time the viewer has already decided to stay.
 * docs/27-RETENTION.md.
 */
export const hookTitle = (kicker, title, sub = null) => [
    textPart('kicker', kicker, { at: [540, 318], font: `700 30px ${FONT}`, fill: 'joint',
                                 maxWidth: SAFE.x1 - SAFE.x0 }),
    textPart('title', title, { at: [540, 392], font: `800 70px ${FONT}`, fill: 'ink',
                               maxWidth: SAFE.x1 - SAFE.x0 }),
    ...(sub ? [textPart('titlesub', sub, { at: [540, 462], font: `600 31px ${FONT}`,
                                           fill: 'dim', maxWidth: SAFE.x1 - SAFE.x0 })] : []),
];

/**
 * The pinned banner: a caption chip at the top of frame, up from frame one
 * and never moving.
 *
 * Straight out of the references. `anime6` keeps "Marriage life be like"
 * pinned for all 39 seconds and never animates it -- it is there so a viewer
 * arriving three seconds in, which on these platforms is most of them, knows
 * what they are watching without waiting for a title. Cheap, and the one
 * thing both reference films do that our earlier series did not.
 *
 * Authored at alpha 1, which is the one deviation from `part()`'s rule that
 * every diagram part starts invisible. That rule is right for a build-up --
 * a reveal needs something to ramp from -- and wrong here: a board re-cast in
 * a new scene starts invisible again, so a banner that relied on a reveal
 * appeared in scene one and vanished for the rest of the film. Opaque from
 * the start means every scene that casts it simply has it, with no actions.
 */
export function bannerParts(lang, n) {
    const text = BANNER[lang](n);
    // Sized off the text rather than fixed: the Swahili and English strings
    // differ by enough that one width leaves one of them rattling in a box.
    const w = Math.min(SAFE.x1 - SAFE.x0, text.length * 15 + 56);
    return [
        rectPart('ban_bg', w, 58, { at: [540, 196], fill: '#11181f', stroke: '#27323d',
                                    strokeWidth: 2, alpha: 1, z: 300 }),
        textPart('ban_t', text, { at: [540, 196], font: `700 26px ${FONT}`, fill: 'ink',
                                  alpha: 1, z: 301, maxWidth: w - 32 }),
    ];
}

export const BANNER_IDS = ['ban_bg', 'ban_t'];

/**
 * The end card: what comes next, follow/share, and the engine.
 *
 * About six seconds, not twenty. Retention falls off a cliff once the point
 * lands, so this is deliberately short -- but it is the one place the series
 * asks for anything, so all three asks live here and nowhere else.
 */
export function endCard(lang, nextLine) {
    const parts = [
        rectPart('card_bg', 1080, 1920, { at: [540, 960], fill: '#04070a', alpha: 0, z: 400 }),
        textPart('card_next', nextLine, {
            at: [540, 680], font: `700 40px ${FONT}`, fill: 'joint',
            maxWidth: SAFE.x1 - SAFE.x0, lineHeight: 50, alpha: 0, z: 410 }),
        textPart('card_series', SERIES[lang].toUpperCase(), {
            at: [540, 858], font: `800 54px ${FONT}`, fill: 'ink', alpha: 0, z: 410 }),
        textPart('card_tag', TAGLINE[lang], {
            at: [540, 918], font: `600 29px ${FONT}`, fill: 'dim',
            maxWidth: SAFE.x1 - SAFE.x0, alpha: 0, z: 410 }),
        // The ask. Gold, because it is the only thing on the card the viewer
        // is being asked to DO.
        textPart('card_cta', CTA[lang], {
            at: [540, 1030], font: `700 32px ${FONT}`, fill: 'gold',
            maxWidth: SAFE.x1 - SAFE.x0, lineHeight: 42, alpha: 0, z: 410 }),
        textPart('card_share', SHARE[lang], {
            at: [540, 1118], font: `600 27px ${FONT}`, fill: 'dim',
            maxWidth: SAFE.x1 - SAFE.x0, alpha: 0, z: 410 }),
        // The engine, last and quietest: an advert that shouts over the
        // content is the reason people skip end cards.
        pathPart('card_rule', `${M(380, 1192)} ${L(700, 1192)}`,
                 { stroke: '#27323d', strokeWidth: 2, alpha: 0, z: 410 }),
        textPart('card_eng', ENGINE_AD[lang], {
            at: [540, 1242], font: `600 27px ${FONT}`, fill: 'dim',
            maxWidth: SAFE.x1 - SAFE.x0, lineHeight: 36, alpha: 0, z: 410 }),
        textPart('card_repo', REPO, {
            at: [540, 1300], font: `700 28px ${FONT}`, fill: 'ink', alpha: 0, z: 410 }),
    ];
    return { parts, ids: parts.map((p) => p.id) };
}

// ---------------------------------------------------------------------------
// Structural primitives
// ---------------------------------------------------------------------------


/**
 * A dashed straight line, as path data.
 *
 * `dash` is NOT a part property. `KNOWN.part` has no such key, and an unknown
 * key is carried through the compiler and silently ignored by the renderer --
 * so a `dash: [14, 10]` draws a perfectly solid line and reports nothing.
 * The engine's dashes come from `trim` + `flow`, which are for travelling
 * dashes along a flowing path; a static dashed line is cheaper drawn as the
 * segments it is.
 */
export function dashedPath([x0, y0], [x1, y1], { on = 14, off = 10 } = {}) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const ux = (x1 - x0) / (len || 1), uy = (y1 - y0) / (len || 1);
    let d = '';
    for (let t = 0; t < len; t += on + off) {
        const e = Math.min(t + on, len);
        d += `${M(x0 + ux * t, y0 + uy * t)} ${L(x0 + ux * e, y0 + uy * e)} `;
    }
    return d.trim();
}

/**
 * A stack of sedimentary beds as a cross-section, optionally tilted.
 *
 * The baseline every other structure in the series deforms. `tilt` rotates
 * the whole stack about its centre, because beds that are already dipping are
 * the normal case in the field and a flat-lying diagram quietly teaches that
 * horizontal is what rock looks like.
 */
export function bedsParts(id, {
    x = 60, w = 960, top = 620, bands = null, h = 62, tilt = 0, z = 0, alpha = 0,
} = {}) {
    const rows = bands ?? [
        ['bed', 62], ['bedAlt', 48], ['bed', 70], ['bedAlt', 54], ['bed', 58],
    ];
    const cx = x + w / 2;
    const total = rows.reduce((n, [, hh]) => n + (hh ?? h), 0);
    const cy = top + total / 2;
    const rot = (px, py) => {
        const dx = px - cx, dy = py - cy;
        return [cx + dx * Math.cos(tilt) - dy * Math.sin(tilt),
                cy + dx * Math.sin(tilt) + dy * Math.cos(tilt)];
    };
    const parts = [];
    const ids = [];
    let y = top;
    rows.forEach(([fill, hh], i) => {
        const bh = hh ?? h;
        // Drawn as a path rather than a rect so it can be tilted at all: a
        // part has no `rot` channel, so a dipping bed has to be drawn dipping.
        const pts = [[x, y], [x + w, y], [x + w, y + bh], [x, y + bh]].map(([px, py]) => rot(px, py));
        parts.push(pathPart(`${id}${i}`, poly(pts, true),
            { fill, stroke: '#2a241c', strokeWidth: 2, alpha, z: z + i }));
        ids.push(`${id}${i}`);
        y += bh;
    });
    return { parts, ids, top, bottom: y, cx, cy, rot };
}


/**
 * Clip a segment to a box (Liang-Barsky). Returns null if it misses entirely.
 *
 * Needed because a joint set is defined by an ANGLE, and a steep angle over a
 * tall block carries the far end of every line hundreds of units past the
 * rock it is supposed to be inside. The first version of part one drew six
 * blue lines straight out of the right-hand edge of the outcrop and into the
 * background, which no checker could see: a path has no bounds the staging
 * check knows about, so it validated clean and looked wrong.
 */
export function clipSegment([x0, y0], [x1, y1], { x0: bx0, y0: by0, x1: bx1, y1: by1 }) {
    const dx = x1 - x0, dy = y1 - y0;
    let t0 = 0, t1 = 1;
    for (const [p, q] of [[-dx, x0 - bx0], [dx, bx1 - x0], [-dy, y0 - by0], [dy, by1 - y0]]) {
        if (p === 0) { if (q < 0) return null; continue; }
        const r = q / p;
        if (p < 0) { if (r > t1) return null; if (r > t0) t0 = r; }
        else { if (r < t0) return null; if (r < t1) t1 = r; }
    }
    return [[x0 + t0 * dx, y0 + t0 * dy], [x0 + t1 * dx, y0 + t1 * dy]];
}

/**
 * A joint set: parallel fractures at one orientation, no displacement.
 *
 * `offset` is 0 and stays 0 -- that IS the definition, and part one spends a
 * shot on it. The same helper with a non-zero offset would be a fault, which
 * is why part three draws one by passing exactly that.
 */
export function jointSetParts(id, {
    x0 = 90, x1 = 990, y0 = 620, y1 = 1120, n = 6, angle = 0.32,
    stroke = 'joint', strokeWidth = 5, filled = false, fill = 'quartz',
    z = 40, alpha = 0,
    // The rock the joints are IN. Lines are clipped to it, so an angle can
    // never carry a fracture out of its own outcrop.
    box = null,
} = {}) {
    const parts = [];
    const ids = [];
    const span = x1 - x0;
    const dx = Math.tan(angle) * (y1 - y0);
    for (let i = 0; i < n; i++) {
        const t = n === 1 ? 0.5 : i / (n - 1);
        const bx = x0 + t * span;
        const seg = box ? clipSegment([bx, y0], [bx + dx, y1], box) : null;
        if (box && !seg) continue;
        const [[ax, ay], [cx2, cy2]] = seg ?? [[bx, y0], [bx + dx, y1]];
        if (filled) {
            // A FILLED joint is the whole point of the series: open space
            // that fluid found. Drawn as a thin band, not a line, because
            // what is in it is what you are looking for.
            const w = strokeWidth * 1.9;
            parts.push(pathPart(`${id}${i}`, poly([
                [ax - w / 2, ay], [ax + w / 2, ay],
                [cx2 + w / 2, cy2], [cx2 - w / 2, cy2]], true),
                { fill, stroke, strokeWidth: 2, alpha, z: z + 1 }));
        } else {
            parts.push(pathPart(`${id}${i}`, `${M(ax, ay)} ${L(cx2, cy2)}`,
                { stroke, strokeWidth, alpha, z, lineCap: 'round' }));
        }
        ids.push(`${id}${i}`);
    }
    return { parts, ids };
}

/**
 * A fold: beds bent into an anticline or syncline, with the hinge marked.
 *
 * `foldBand` is the generic band-between-two-curves helper; what this adds is
 * the geology -- a hinge trace, and an OUTER-ARC crack zone on the crest,
 * which is the reason a hinge is worth walking and therefore the reason the
 * part exists at all.
 */
export function foldParts(id, {
    x0 = 40, x1 = 1040, crest = 760, amp = 150, layers = 4, bandH = 54,
    fill = 'bed', fillAlt = 'bedAlt', down = false, z = 0, alpha = 0,
    hinge = true, cracks = 0,
} = {}) {
    const parts = [];
    const ids = [];
    const mid = (x0 + x1) / 2;
    const a = down ? -amp : amp;
    for (let i = 0; i < layers; i++) {
        const base = crest + i * (bandH + 6);
        // A cosine arch: flat limbs, curved hinge. Five control points is
        // enough for `smooth` and keeps the limbs from wobbling.
        const pts = [0, 0.25, 0.5, 0.75, 1].map((t) => {
            const px = x0 + t * (x1 - x0);
            const py = base - a * Math.cos((px - mid) / (x1 - x0) * Math.PI * 1.6);
            return [px, py];
        });
        parts.push(pathPart(`${id}${i}`, foldBand(pts, bandH),
            { fill: i % 2 ? fillAlt : fill, stroke: '#2a241c', strokeWidth: 2,
              alpha, z: z + i }));
        ids.push(`${id}${i}`);
    }
    const hingeIds = [];
    if (hinge) {
        const topY = crest - a;
        parts.push(pathPart(`${id}_hinge`,
            dashedPath([mid, topY - 90], [mid, crest + layers * 60]),
            { stroke: 'fold', strokeWidth: 4, alpha, z: z + 60, lineCap: 'butt' }));
        hingeIds.push(`${id}_hinge`);
    }
    // The outer arc of a fold is in EXTENSION: it has to stretch further than
    // the inner arc to get round the bend, so it cracks. That crack zone is
    // the dilation that a saddle reef fills.
    const crackIds = [];
    const r = rng(91);
    for (let i = 0; i < cracks; i++) {
        const t = 0.34 + (i / Math.max(1, cracks - 1)) * 0.32;
        const px = x0 + t * (x1 - x0);
        const py = crest - a * Math.cos((px - mid) / (x1 - x0) * Math.PI * 1.6);
        const lean = (r() - 0.5) * 0.5;
        parts.push(pathPart(`${id}_ck${i}`,
            `${M(px, py - 6)} ${L(px + Math.sin(lean) * 54, py + 54)}`,
            { stroke: 'joint', strokeWidth: 4, alpha, z: z + 50, lineCap: 'round' }));
        crackIds.push(`${id}_ck${i}`);
    }
    return { parts, ids, hingeIds, crackIds, mid, crestY: crest - a };
}

/**
 * A fault: the same beds on both sides, no longer lining up.
 *
 * `throw_` is the whole diagram. Drawn with the marker bed in a colour that
 * survives the offset, because "the same layer, at two heights" is the thing
 * the viewer has to see, and it does not read if every band looks alike.
 */
export function faultParts(id, {
    x = 60, w = 960, top = 640, bandH = 56, layers = 5, throw_ = 90,
    angle = 0.34, marker = 2, z = 0, alpha = 0, breccia = 0,
} = {}) {
    const parts = [];
    const leftIds = [];
    const rightIds = [];
    const cx = x + w / 2;
    const dx = Math.tan(angle) * (layers * bandH + 160);
    const fTop = [cx - dx / 2, top - 70];
    const fBot = [cx + dx / 2, top + layers * bandH + 90];
    // The fault plane, as a line from which both sides are clipped by hand:
    // the renderer has no clip path, so each side is drawn as its own polygon
    // that happens to stop at the plane.
    const xAt = (y) => fTop[0] + (y - fTop[1]) * (fBot[0] - fTop[0]) / (fBot[1] - fTop[1]);
    for (let i = 0; i < layers; i++) {
        const y0 = top + i * bandH;
        const y1 = y0 + bandH;
        const fill = i === marker ? 'carbonate' : (i % 2 ? 'bedAlt' : 'bed');
        parts.push(pathPart(`${id}_l${i}`, poly(
            [[x, y0], [xAt(y0), y0], [xAt(y1), y1], [x, y1]], true),
            { fill, stroke: '#2a241c', strokeWidth: 2, alpha, z: z + i }));
        leftIds.push(`${id}_l${i}`);
        // The hanging wall has dropped by `throw_` -- a normal fault, which
        // is the one an extensional setting gives and the easiest to read.
        const d = throw_;
        parts.push(pathPart(`${id}_r${i}`, poly(
            [[xAt(y0 + d), y0 + d], [x + w, y0 + d], [x + w, y1 + d], [xAt(y1 + d), y1 + d]], true),
            { fill, stroke: '#2a241c', strokeWidth: 2, alpha, z: z + i }));
        rightIds.push(`${id}_r${i}`);
    }
    parts.push(pathPart(`${id}_plane`, `${M(...fTop)} ${L(...fBot)}`,
        { stroke: 'fault', strokeWidth: 6, alpha, z: z + 70, lineCap: 'round' }));
    // Slip arrows: which way it actually moved. Without them a fault diagram
    // is ambiguous between normal and reverse, and those host different ore.
    parts.push(
        pathPart(`${id}_slipL`, `${M(cx - 150, top - 20)} ${L(cx - 150, top + 60)} `
            + `${L(cx - 168, top + 36)} ${M(cx - 150, top + 60)} ${L(cx - 132, top + 36)}`,
            { stroke: 'ink', strokeWidth: 5, alpha, z: z + 71, lineCap: 'round' }),
        pathPart(`${id}_slipR`, `${M(cx + 170, top + 90)} ${L(cx + 170, top + 10)} `
            + `${L(cx + 152, top + 34)} ${M(cx + 170, top + 10)} ${L(cx + 188, top + 34)}`,
            { stroke: 'ink', strokeWidth: 5, alpha, z: z + 71, lineCap: 'round' }),
    );
    const brecciaIds = [];
    const r = rng(37);
    for (let i = 0; i < breccia; i++) {
        const t = r();
        const y = fTop[1] + t * (fBot[1] - fTop[1]);
        const bx = xAt(y) + (r() - 0.5) * 46;
        const s = 10 + r() * 16;
        // Angular, not round. Breccia is rock SHATTERED in place and never
        // transported, so the fragments still fit each other -- round clasts
        // would be a conglomerate, which means a river and means nothing
        // about a fault.
        parts.push(pathPart(`${id}_bx${i}`, poly([
            [bx - s, y - s * 0.7], [bx + s * 0.8, y - s], [bx + s, y + s * 0.6],
            [bx - s * 0.5, y + s]], true),
            { fill: 'rockPale', stroke: '#2a241c', strokeWidth: 2, alpha, z: z + 72 }));
        brecciaIds.push(`${id}_bx${i}`);
    }
    return { parts, leftIds, rightIds, brecciaIds, ids: [...leftIds, ...rightIds],
             planeId: `${id}_plane`, slipIds: [`${id}_slipL`, `${id}_slipR`],
             xAt, fTop, fBot, cx };
}

/**
 * A shear zone: foliation dragged into parallelism across a band.
 *
 * The S-shaped drag is the diagnosis and the only thing worth drawing. Away
 * from the zone the fabric sits at its original angle; inside it, it rotates
 * toward the zone wall and the rock is smeared rather than broken. That
 * sigmoid is what tells you in the field that you are in one, and it is why
 * a shear zone looks like nothing at all to someone who has not seen it.
 */
export function shearParts(id, {
    x = 60, w = 960, top = 600, h = 560, bandFrac = 0.34, lines = 15,
    far = 1.0, stroke = 'schist', inner = 'mylonite', z = 0, alpha = 0,
    cols = 7, tick = 92,
} = {}) {
    const parts = [];
    const ids = [];
    const cy = top + h / 2;
    const half = (h * bandFrac) / 2;
    const zoneIds = [`${id}_zone`];
    parts.push(rectPart(`${id}_zone`, w, half * 2,
        { at: [x + w / 2, cy], fill: '#2a2233', alpha, z: z - 1 }));

    // A GRID of short foliation ticks, not full-width curves.
    //
    // The first version drew each line clear across the frame with its ends
    // swung up and down. Every line then crossed every other and the picture
    // read as a starburst -- the exact opposite of the thing being taught.
    // Foliation is a FABRIC: short marks, dense, whose ORIENTATION is the
    // only thing that varies. Drawn that way the drag appears on its own,
    // because each row is a little more rotated than the row outside it.
    //
    // Angle is measured FROM THE ZONE WALL: 0 is parallel to the zone, `far`
    // is steeply across it. So the fabric stands at a high angle out in the
    // wall rock and lies down into parallelism as you walk in -- which is the
    // actual thing. The first version had it exactly inverted, steep in the
    // middle and shallow outside, which is a picture of nothing: it is the
    // rotation INTO the zone that identifies one in the field.
    //
    // tanh gives the rotation its characteristic S, and the sign flips across
    // the centre so the two walls drag toward each other rather than both the
    // same way -- that asymmetry is the sense of shear.
    for (let r = 0; r < lines; r++) {
        const y = top + 14 + (r / (lines - 1)) * (h - 28);
        const d = (y - cy) / half;
        const ang = far * Math.tanh(Math.max(-2.2, Math.min(2.2, d)) * 1.25);
        const inZone = Math.abs(d) <= 1;
        for (let c = 0; c < cols; c++) {
            const cx2 = x + 40 + (c / (cols - 1)) * (w - 80);
            // Half-length along the tick's own direction. `cos` on x so that
            // ang = 0 lies ALONG the zone.
            const dx = Math.cos(ang) * tick * 0.5;
            const dy = Math.sin(ang) * tick * 0.5;
            const pid = `${id}${r}_${c}`;
            parts.push(pathPart(pid,
                `${M(cx2 - dx, y - dy)} ${L(cx2 + dx, y + dy)}`,
                { stroke: inZone ? inner : stroke, strokeWidth: inZone ? 7 : 5,
                  alpha, z: z + r, lineCap: 'round' }));
            ids.push(pid);
        }
    }
    // The sense of shear. Without it the drag is visible but its direction is
    // not, and the direction decides which bends open and which close.
    parts.push(
        pathPart(`${id}_senseT`, `${M(x + w - 130, cy - half - 28)} ${L(x + w - 26, cy - half - 28)} `
            + `${L(x + w - 52, cy - half - 46)}`,
            { stroke: 'shear', strokeWidth: 5, alpha, z: z + 90, lineCap: 'round' }),
        pathPart(`${id}_senseB`, `${M(x + 130, cy + half + 28)} ${L(x + 26, cy + half + 28)} `
            + `${L(x + 52, cy + half + 46)}`,
            { stroke: 'shear', strokeWidth: 5, alpha, z: z + 90, lineCap: 'round' }),
    );
    return { parts, ids, zoneIds, senseIds: [`${id}_senseT`, `${id}_senseB`],
             cy, half, top, bottom: top + h, rows: lines, cols };
}

/** A quartz vein: a pale band along a path, with optional ore specks in it. */
export function veinParts(id, pts, {
    width = 30, fill = 'quartz', ore = 0, oreFill = 'gold', oreR = 9,
    z = 80, alpha = 0, seed = 5,
} = {}) {
    const parts = [pathPart(id, smooth(pts), {
        stroke: fill, strokeWidth: width, alpha, z, lineCap: 'round' })];
    const ids = [id];
    const r = rng(seed);
    for (let i = 0; i < ore; i++) {
        // Along the vein, not scattered near it: ore in a vein is IN the
        // vein, and specks floating beside it would teach the opposite.
        const t = (i + 0.5) / ore;
        const k = Math.min(pts.length - 2, Math.floor(t * (pts.length - 1)));
        const f = t * (pts.length - 1) - k;
        const px = pts[k][0] + (pts[k + 1][0] - pts[k][0]) * f + (r() - 0.5) * 14;
        const py = pts[k][1] + (pts[k + 1][1] - pts[k][1]) * f + (r() - 0.5) * 14;
        const s = oreR * (0.7 + r() * 0.6);
        parts.push(pathPart(`${id}_ore${i}`, poly([
            [px - s, py], [px - s * 0.3, py - s], [px + s * 0.7, py - s * 0.8],
            [px + s, py + s * 0.2], [px, py + s]], true),
            { fill: oreFill, stroke: '#6b4a10', strokeWidth: 1.5, alpha, z: z + 2 }));
        ids.push(`${id}_ore${i}`);
    }
    return { parts, ids, oreIds: ids.slice(1) };
}

/**
 * A strike-and-dip symbol: the long strike line, the short dip tick, and the
 * angle. The one piece of notation the series teaches outright, in part five.
 */
export function strikeDipParts(id, [cx, cy], {
    strike = 0, dip = 40, len = 86, fill = 'ink', z = 120, alpha = 0, label = true,
} = {}) {
    const ux = Math.cos(strike), uy = Math.sin(strike);
    const nx = -uy, ny = ux;
    const parts = [
        pathPart(`${id}_s`, `${M(cx - ux * len / 2, cy - uy * len / 2)} `
            + `${L(cx + ux * len / 2, cy + uy * len / 2)}`,
            { stroke: fill, strokeWidth: 6, alpha, z, lineCap: 'butt' }),
        // The tick points DOWN-dip and is short. Its direction is the
        // information; its length is not, which is why it never varies.
        pathPart(`${id}_d`, `${M(cx, cy)} ${L(cx + nx * 26, cy + ny * 26)}`,
            { stroke: fill, strokeWidth: 6, alpha, z, lineCap: 'butt' }),
    ];
    const ids = [`${id}_s`, `${id}_d`];
    if (label) {
        parts.push(textPart(`${id}_n`, String(dip), {
            at: [cx + nx * 52, cy + ny * 52], font: `700 26px ${FONT}`, fill,
            alpha, z }));
        ids.push(`${id}_n`);
    }
    return { parts, ids };
}

/** A gossan cap: the iron-stained weathered lid over a sulphide body. */
export function gossanParts(id, {
    x = 180, w = 720, y = 640, h = 90, z = 60, alpha = 0,
} = {}) {
    const top = [0, 0.2, 0.45, 0.7, 1].map((t) => [x + t * w, y + Math.sin(t * 7) * 12]);
    return {
        parts: [pathPart(id, foldBand(top, h),
            { fill: 'gossan', stroke: '#5e2d16', strokeWidth: 2, alpha, z })],
        ids: [id],
    };
}



/**
 * When the title plate should arrive, derived from the hook line itself.
 *
 * The title comes UNDER the hook, not before it (27-RETENTION.md). A
 * hardcoded arrival works for whichever language it was tuned against and
 * fails for the other: the same hook is about a fifth shorter in Swahili, so
 * a 4.6 s title left the Swahili openings action-bound with a hole in the
 * hook window -- measured at 74% covered against an 80% floor, in a part
 * whose English version passed at 85%. Deriving it from the line keeps both
 * languages front-loaded from one authored number.
 *
 * Lands at about four fifths of the way through the hook, so the plate is up
 * while the sentence is still running and the shot ends on the line rather
 * than on the animation.
 */
export function titleAt(text, lang, { frac = 0.78, min = 2.6, max = 5.0 } = {}) {
    const span = estimateLine(text, { lang });
    return +Math.min(max, Math.max(min, span * frac)).toFixed(2);
}

/**
 * A gesture that ENDS.
 *
 * `{do:'pose', pose:'ask', at:0.3, for:0.6}` does not mean "gesture for 0.6
 * seconds". `for` is the transition SPAN -- the time taken to move into the
 * pose -- and the pose then holds until something else overwrites it. So a
 * character who asks a question in shot one still has their arm out three
 * shots later, which is exactly what the two-handers in the earlier series
 * do: both characters stand there with an arm extended across the frame.
 *
 * This poses in, holds, and poses back, which is what the authoring intent
 * always was.
 */
export const gesture = (target, pose, at, { hold = 1.1, span = 0.45, rest = 'stand' } = {}) => [
    { target, do: 'pose', pose, at: +at.toFixed(3), for: span },
    { target, do: 'pose', pose: rest, at: +(at + span + hold).toFixed(3), for: span },
];

/**
 * Derive every shot's duration from the narration it carries.
 *
 * docs/27-RETENTION.md argues the order matters: write the line, then let the
 * picture follow it. Authoring a duration by hand and writing into it is the
 * reverse, and it is the documented cause of the geology series leaving a
 * fifth of its runtime silent.
 *
 * A shot ends when BOTH are done -- the line, and the last thing that moves:
 *
 *   max(line.at + estimated span + pad,  last action + 0.4,  min)
 *
 * `lang` is not optional here and has no default, because this series is
 * built twice. An English film silently estimated with Swahili's syllable
 * rate, or the reverse, fits every shot to the wrong length and the error is
 * invisible until the render -- so the caller has to say which it is.
 */
// A floor low enough that it cannot MANUFACTURE a hole. At 3.5 s a
// deliberate two-word beat -- "Strike, and dip." -- was padded out to three
// seconds of silence and tripped the gap check in Swahili, where the line is
// shorter still. The floor exists so a shot is not subliminal, not so every
// short line is followed by a pause.
export function fitShots(film, lang, { pad = 0.85, min = 2.6, hookPad = 0.2 } = {}) {
    if (lang !== 'en' && lang !== 'sw') throw new Error(`fitShots: lang must be en|sw, got ${lang}`);
    let first = true;
    for (const scene of film.scenes ?? []) {
        for (const shot of scene.shots ?? []) {
            // The FIRST shot gets almost no tail pad. Everywhere else 0.85 s
            // of air after a line is breathing; in the opening it is the one
            // thing the retention sources agree is fatal -- "a pause in the
            // first eight seconds is an exit". Measured: the ordinary pad put
            // a hole between the hook and the line after it, and dragged the
            // Swahili part four hook window down to 74% against an 80% floor
            // while its English twin passed at 85%. Same staging, same
            // numbers, different language: exactly the kind of defect that
            // only appears once a film is built twice.
            const tail = first ? hookPad : pad;
            first = false;
            let needed = min;
            for (const line of shot.dialogue ?? []) {
                // The SPEAKER's rate, because a line's length depends on who
                // says it. On the VoiceStudio backend every rate is 1 -- real
                // people need no delivery multiplier. On Piper the Swahili
                // cast shares one model and is separated by rate, so Mzee
                // Rajabu at 0.86 takes 16% longer than the estimate assumes
                // and every one of his shots would be cut short.
                needed = Math.max(needed,
                    (line.at ?? 0)
                        + estimateLine(line.text, { lang, rate: rateOf(lang, line.speaker) })
                        + tail);
            }
            for (const a of shot.actions ?? []) {
                // A flow loop is deliberately LONGER than its shot: `flow` is
                // periodic, so an over-long linear ramp costs nothing and
                // saves re-keying per cycle.
                if (a.do === 'set' && a.channel === 'props.flow') continue;
                // Blinks are decoration spread across a shot, not a beat the
                // shot must wait for. They are generated against a guessed
                // duration, so sizing the shot to fit them makes the guess
                // self-fulfilling.
                if (a.do === 'play' && a.action === 'blink') continue;
                needed = Math.max(needed, (a.at ?? 0) + (a.for ?? 0) + 0.4);
            }
            shot.duration = +needed.toFixed(2);
        }
    }
    return film;
}

/** Everything a part needs to say about itself, assembled once. */
export const filmShell = (lang, title, { palettes, voices, characters, scenes }) => ({
    version: 'jirex.film/1',
    meta: { ...META_FOR(lang, title), estimatedTiming: true },
    palettes, voices, characters, scenes,
});

// Imported late to keep the structural helpers above readable.
import { META as META_FOR } from '../lib/structure.mjs';

export { STRUCT_PALETTE };
