/**
 * "Game Physics" -- the diagram vocabulary parts two to seven added.
 *
 * `common.mjs` holds the rigs, the acting and the figures part one needed.
 * This is everything the remaining six parts needed and it did not have, and
 * it is a separate module for one reason: part one is RENDERED and approved,
 * so the file it imports from should stop changing. Everything here is
 * re-exported through `common.mjs`, so every part still has one import.
 *
 * ## The series' two drawing rules, continued
 *
 * `normalParts` in `common.mjs` states the first: the normal is the line
 * through both centres, always, derived from the centres so it cannot be
 * authored wrong. These figures keep to the same discipline wherever the
 * geometry is the teaching:
 *
 *   - `wallParts` DERIVES the outward normal from the wall's own direction.
 *     A wall whose normal was a separate parameter could be drawn with the
 *     two disagreeing, which is the single most common mistake in a hand-made
 *     collision diagram and the one most likely to be copied.
 *   - `distanceParts` derives the contact test from the radii it is given,
 *     so the picture and the inequality on screen can never disagree.
 *   - `arcArrow` takes a SIGNED sweep, because the direction a thing spins is
 *     half of what part six is about.
 *
 * Anything that is only decoration -- a bar, a card, a loop diagram -- takes
 * plain parameters, because there is no physics in it to get wrong.
 */
import {
    FONT, L, M, Q, SAFE, Z, arrowPath, conceal, ellipsePart, pathPart, rectPart,
    reveal, textPart,
} from '../lib/diagram.mjs';
import { arcPath, roundRect } from './shapes.mjs';

const TAU = Math.PI * 2;

/**
 * The vertical bands every board in this series lays out against.
 *
 * Written down because the same mistake was made four times in one part:
 * a caption at 1440, a readout at 1430, a note at 1412 -- each of which
 * looked fine in the source and landed underneath the subtitles, which the
 * checker cannot see and a still frame shows immediately.
 *
 * `BAND.floor` is the hard one. The subtitle band is `meta.height` minus
 * the style's `bottomMargin` of 372, and a two-line subtitle rises about
 * 46px above that. So nothing a board draws may sit below 1430, and
 * anything with descenders should stop at `BAND.caption1`.
 */
/**
 * The anchor a multi-line text part needs so its FIRST line sits at `top`.
 *
 * `wrapText` lays a block out ENDING at the anchor: an N-line block occupies
 * `at.y - (N-1)*lineHeight` through `at.y`. So a two-line title centred on
 * 430 starts at 348, and a three-line body centred on 868 starts at 796 --
 * which is how part one's end card ran its title through its own kicker, and
 * how every comparison card in parts two and three printed its body over its
 * own heading.
 *
 * Anything with a known line count should be placed through this rather than
 * by eye. `lines` may be the text itself, in which case its explicit
 * newlines are counted; automatic wrapping is not predictable from here, so
 * a block that wraps on its own still has to be measured by looking at it.
 */
export const blockAt = (top, lines, lineHeight) => {
    const n = typeof lines === 'string' ? lines.split('\n').length : lines;
    return top + (Math.max(1, n) - 1) * lineHeight;
};

export const BAND = {
    heading: 520,       // one line, the board's name
    sub: 580,           // a subheading under it, if there is one
    stageTop: 630,
    stage: 900,         // the middle of the figure
    stageBottom: 1160,
    caption0: 1215,     // the working line about the figure
    caption1: 1280,
    caption2: 1345,
    floor: 1430,        // below this is the subtitle band. Nothing goes here.
};
const t3 = (v) => +Number(v).toFixed(3);

// ---------------------------------------------------------------------------
// Arcs
// ---------------------------------------------------------------------------

/**
 * A curved arrow around a centre: rotation, made visible.
 *
 * `sweep` is SIGNED and in turns, because the direction a thing spins is
 * half of what part six teaches and a magnitude alone cannot say it. The
 * head is built from the arc's own tangent at its end, so it always points
 * the way the arc is going -- including when the sweep is negative, which is
 * the case a hand-placed arrowhead gets wrong.
 */
export function arcArrow(id, [cx, cy], r, {
    from = -Math.PI / 2, sweep = 0.75, fill = 'spin', width = 9, head = 30,
    z = 70, label = null, labelR = null, labelFont = `800 32px ${FONT}`,
} = {}) {
    const a0 = from;
    const a1 = from + sweep * TAU;
    const dir = Math.sign(sweep) || 1;
    // The head eats the last of the arc, so the shaft does not run through it.
    const headAng = (head / r) * dir;
    const tipA = a1;
    const baseA = a1 - headAng;
    const tip = [cx + r * Math.cos(tipA), cy + r * Math.sin(tipA)];
    // The tangent at the tip, which is what the head must point along.
    const tx = -Math.sin(tipA) * dir;
    const ty = Math.cos(tipA) * dir;
    const nx = Math.cos(tipA);
    const ny = Math.sin(tipA);
    const bx = tip[0] - tx * head;
    const by = tip[1] - ty * head;
    const parts = [
        pathPart(`${id}_a`, arcPath(cx, cy, r, a0, baseA),
                 { stroke: fill, strokeWidth: width, z, alpha: 0, lineCap: 'round',
                   trim: { end: 1 } }),
        pathPart(`${id}_h`,
            `${M(tip[0], tip[1])} ${L(bx + nx * head * 0.5, by + ny * head * 0.5)} `
            + `${L(bx - nx * head * 0.5, by - ny * head * 0.5)} ${Z}`,
            { fill, z: z + 1, alpha: 0 }),
    ];
    if (label) {
        const mid = a0 + (a1 - a0) / 2;
        const lr = labelR ?? r + 46;
        parts.push(textPart(`${id}_l`, label, {
            at: [cx + lr * Math.cos(mid), cy + lr * Math.sin(mid)],
            font: labelFont, fill, z: z + 1, alpha: 0, maxWidth: 360 }));
    }
    return { parts, ids: parts.map((p) => p.id) };
}

/**
 * The angle between two rays from a vertex: an arc, two legs, and a label.
 *
 * Used wherever the series says "at an angle" and has to mean something by
 * it -- the incoming path against the normal in part three, the deflection
 * in part four.
 */
export function angleParts(id, vertex, a0, a1, {
    r = 110, legs = 240, fill = 'ink', label = null, z = 68, width = 5,
} = {}) {
    // `legs: 0` means "just the arc": a zero-length path with a round cap
    // draws a dot, which is not nothing.
    const leg = (a) => (legs <= 0 ? null : pathPart(`${id}_${a === a0 ? 'g0' : 'g1'}`,
        `${M(vertex[0], vertex[1])} `
        + `${L(vertex[0] + legs * Math.cos(a), vertex[1] + legs * Math.sin(a))}`,
        { stroke: fill, strokeWidth: width, z, alpha: 0, lineCap: 'round' }));
    const parts = [leg(a0), leg(a1),
        pathPart(`${id}_arc`, arcPath(vertex[0], vertex[1], r, a0, a1),
                 { stroke: fill, strokeWidth: width, z: z + 1, alpha: 0,
                   lineCap: 'round', trim: { end: 1 } })].filter(Boolean);
    if (label) {
        const mid = (a0 + a1) / 2;
        parts.push(textPart(`${id}_l`, label, {
            at: [vertex[0] + (r + 48) * Math.cos(mid),
                 vertex[1] + (r + 48) * Math.sin(mid)],
            font: `800 34px ${FONT}`, fill, z: z + 2, alpha: 0, maxWidth: 300 }));
    }
    return { parts, ids: parts.map((p) => p.id) };
}

// ---------------------------------------------------------------------------
// Readouts: the number that changes
// ---------------------------------------------------------------------------

/**
 * A labelled numeric readout, for the `count` verb to drive.
 *
 * The label and the number are separate parts so the label can arrive once
 * and stay while the number moves. Both are returned by name, because a
 * `count` has to address the value part specifically.
 *
 * The value is authored with the string it should show BEFORE the count
 * starts, which matters: `seedChannel` keys that authored text at t=0, so a
 * readout whose count begins eight seconds in shows this until then rather
 * than showing its final value from frame one.
 */
export function readoutParts(id, label, {
    at = [540, 1240], initial = '0', fill = 'velocity', size = 54,
    labelSize = 27, z = 90, align = 'center', chip = true, chipW = 360,
} = {}) {
    const parts = [];
    if (chip) {
        parts.push(pathPart(`${id}_bg`, roundRect(at[0] - chipW / 2, at[1] - 76, chipW, 136, 20),
            { fill: 'panel', stroke: 'panelLine', strokeWidth: 2, z: z - 1, alpha: 0 }));
    }
    parts.push(
        textPart(`${id}_k`, label, { at: [at[0], at[1] - 40], font: `700 ${labelSize}px ${FONT}`,
                                     fill: 'dim', z, alpha: 0, align, maxWidth: chipW - 40 }),
        textPart(`${id}_v`, initial, { at: [at[0], at[1] + 18], font: `800 ${size}px ${FONT}`,
                                       fill, z, alpha: 0, align, maxWidth: chipW - 40 }),
    );
    return { parts, ids: parts.map((p) => p.id), value: `${id}_v`, label: `${id}_k` };
}

/**
 * Drive a readout: the `count` verb, named for what it is used for.
 *
 * `ease: 'linear'` by default, unlike almost everything else in this series.
 * A measured quantity does not accelerate between its endpoints, and a
 * smoothed readout reads as a dial being adjusted rather than as a value
 * being observed.
 */
export const countTo = (target, part, {
    from = 0, to = 0, at = 0, span = 1, decimals = 0, prefix = '', suffix = '',
    ease = 'linear', step = null,
}) => [{
    target, part, do: 'count', at: t3(at), for: t3(span),
    from, to, decimals, prefix, suffix, ease,
    ...(step != null ? { step } : {}),
}];

// ---------------------------------------------------------------------------
// Detection: part two's figures
// ---------------------------------------------------------------------------

/**
 * The circle-circle overlap test, drawn.
 *
 * The centre-to-centre line, a radius marked off at each end, and the sum
 * those two radii make. The whole of circle collision detection is whether
 * the first is shorter than the second, so the figure is those two lengths
 * side by side and nothing else.
 *
 * Both lengths are DERIVED -- the distance from the centres, the sum from
 * the radii -- so the drawing and the inequality cannot disagree. A diagram
 * that showed `d` shorter than `rA + rB` while the circles sat apart would
 * be teaching the test backwards, and nothing would report it.
 */
export function distanceParts(id, a, b, {
    rA = 100, rB = 100, z = 66, bar = true, barY = null, barX = 150, barW = 780,
} = {}) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const d = Math.hypot(dx, dy);
    const ux = dx / (d || 1);
    const uy = dy / (d || 1);
    const rot = Math.atan2(dy, dx);
    /**
     * The measured span is drawn from the node's OWN origin along +x and
     * then rotated, rather than as a path between two absolute points.
     *
     * That is what makes it shrinkable. `transform.sx` scales about the
     * node's origin, so a line whose origin sits on centre A shortens
     * toward A -- which is what a closing distance does. Drawn as a path
     * between two absolute coordinates it would scale about the frame's
     * origin instead, and fly off the top-left corner.
     */
    const span = (sid, len, props) => pathPart(sid, `${M(0, 0)} ${L(len, 0)}`,
        { at: [a[0], a[1]], rot, ...props });
    const parts = [
        span(`${id}_d`, d, { stroke: 'momentum', strokeWidth: 6, z, alpha: 0,
                             lineCap: 'round' }),
        ellipsePart(`${id}_ca`, 10, 10, { at: a, fill: 'momentum', z: z + 2, alpha: 0 }),
        ellipsePart(`${id}_cb`, 10, 10, { at: b, fill: 'momentum', z: z + 2, alpha: 0 }),
        // Each radius, marked off along the same line, so the comparison is
        // between two lengths the viewer can see rather than two numbers.
        pathPart(`${id}_ra`, `${M(a[0], a[1])} ${L(a[0] + ux * rA, a[1] + uy * rA)}`,
                 { stroke: 'velocity', strokeWidth: 9, z: z + 1, alpha: 0,
                   lineCap: 'round' }),
        pathPart(`${id}_rb`, `${M(b[0], b[1])} ${L(b[0] - ux * rB, b[1] - uy * rB)}`,
                 { stroke: 'normal', strokeWidth: 9, z: z + 1, alpha: 0,
                   lineCap: 'round' }),
    ];
    // The scale the bars are drawn at: whichever of the two lengths is
    // longer fills `barW`, so neither can run off the frame.
    const px = barW / Math.max(d, rA + rB);
    const y = barY ?? Math.max(a[1], b[1]) + 190;
    if (bar) {
        // The two lengths laid out horizontally, which is the comparison the
        // inequality is making and the thing a diagonal line cannot show.
        parts.push(
            textPart(`${id}_dl`, 'distance between centres', {
                at: [barX, y - 34], font: `700 25px ${FONT}`, fill: 'momentum',
                align: 'left', z, alpha: 0, maxWidth: 700 }),
            // Same trick as the span above: drawn from its own origin, so it
            // shortens from the left rather than from the middle.
            pathPart(`${id}_db`, `${M(0, 0)} ${L(d * px, 0)}`,
                     { at: [barX, y], stroke: 'momentum', strokeWidth: 18, z,
                       alpha: 0 }),
            textPart(`${id}_sl`, 'the two radii added up', {
                at: [barX, y + 54], font: `700 25px ${FONT}`, fill: 'ink',
                align: 'left', z, alpha: 0, maxWidth: 700 }),
            pathPart(`${id}_sa`, `${M(barX, y + 88)} ${L(barX + rA * px, y + 88)}`,
                     { stroke: 'velocity', strokeWidth: 18, z, alpha: 0 }),
            pathPart(`${id}_sb`, `${M(barX + rA * px, y + 88)} `
                + `${L(barX + (rA + rB) * px, y + 88)}`,
                     { stroke: 'normal', strokeWidth: 18, z, alpha: 0 }),
        );
    }
    return {
        parts, ids: parts.map((p) => p.id),
        /** The figure's own verdict, so a caption cannot contradict the picture. */
        touching: d < rA + rB,
        d, sum: rA + rB, unit: [ux, uy],
        lineIds: [`${id}_d`, `${id}_ca`, `${id}_cb`],
        radiusIds: [`${id}_ra`, `${id}_rb`],
        barIds: [`${id}_dl`, `${id}_db`, `${id}_sl`, `${id}_sa`, `${id}_sb`],
        /**
         * Close the gap to a new distance: the span, the far dot and the bar
         * all move together.
         *
         * They have to move TOGETHER or the figure contradicts itself, which
         * is why this is one method rather than three calls. The caller still
         * has to `shift` the circle itself -- this is the measurement, not
         * the thing being measured.
         */
        closeTo: (target, nd, at, { span: sp = 1.2, ease = 'smooth' } = {}) => {
            const f = nd / (d || 1);
            const key = (part, channel, value, when) =>
                ({ target, part, do: 'set', channel, value: t3(value), at: t3(when),
                   ease });
            const out = [
                key(`${id}_d`, 'transform.sx', 1, at),
                key(`${id}_d`, 'transform.sx', f, at + sp),
                // The far dot and the far radius mark belong to the circle
                // that is moving, so they move with it. Leaving either
                // behind is how a figure ends up measuring a position
                // nothing is at any more.
                ...[`${id}_cb`, `${id}_rb`].map((part) => ({
                    target, part, do: 'shift',
                    by: [ux * (nd - d), uy * (nd - d)],
                    at: t3(at), for: t3(sp), ease })),
            ];
            if (bar) {
                out.push(key(`${id}_db`, 'transform.sx', 1, at),
                         key(`${id}_db`, 'transform.sx', f, at + sp));
            }
            return out;
        },
    };
}

/**
 * An axis-aligned box, with optional label: the other detection test.
 *
 * Returned with its edges so an overlap can be marked, because the AABB test
 * is four comparisons and showing which one fails is the teaching.
 */
export function boxParts(id, { x, y, w, h, fill = 'velocity', label = null,
                               z = 40, width = 5, dashed = false } = {}) {
    const parts = [
        pathPart(`${id}_r`, `${M(x, y)} ${L(x + w, y)} ${L(x + w, y + h)} `
            + `${L(x, y + h)} ${Z}`,
            { stroke: fill, strokeWidth: width, z, alpha: 0,
              ...(dashed ? { trim: { end: 1 } } : {}) }),
    ];
    if (label) {
        parts.push(textPart(`${id}_l`, label, {
            at: [x + w / 2, y - 24], font: `700 27px ${FONT}`, fill, z: z + 1,
            alpha: 0, maxWidth: Math.max(w + 120, 260) }));
    }
    return { parts, ids: parts.map((p) => p.id),
             x0: x, x1: x + w, y0: y, y1: y + h,
             cx: x + w / 2, cy: y + h / 2 };
}

/**
 * Ghosts of where a thing WAS, one per simulation step.
 *
 * The one picture that explains why fast objects pass through walls: a game
 * does not move anything continuously, it teleports it once a frame, and
 * what happens between two frames never happened at all. Returned as one
 * group of ids per step so the narration can lay them down in time.
 */
export function ghostTrail(id, positions, r, {
    base = 'cue', z = 18, alpha = 0.3, fade = true,
} = {}) {
    const parts = [];
    const steps = [];
    positions.forEach(([cx, cy], i) => {
        // Older ghosts are fainter, so the direction of travel is readable
        // from a still frame.
        const a = fade ? alpha * (0.4 + 0.6 * (i / Math.max(1, positions.length - 1)))
            : alpha;
        const pid = `${id}${i}`;
        parts.push(ellipsePart(pid, r, r, { at: [cx, cy], fill: base, z, alpha: 0 }));
        steps.push([pid, +a.toFixed(3)]);
    });
    return { parts, steps, ids: parts.map((p) => p.id) };
}

/**
 * Bring a diagram ball on, with its highlight at the right strength.
 *
 * `reveal` ramps to 1, and a specular is authored at 0.42 -- so revealing a
 * diagram ball with the generic helper puts a hard white blob on it. Same
 * trap as the spotlight in part one, which `revealTo` exists for; this is
 * the three-part version, so the caller cannot get one of the three wrong.
 */
export const showBall = (target, id, at, {
    gap = 0.05, span = 0.3, spec = 0.42,
} = {}) => [
    ...reveal(target, id, at, { span }),
    ...reveal(target, `${id}_lit`, at + gap, { span }),
    ...reveal(target, `${id}_s`, at + gap * 2, { span, to: spec }),
];

/** And take it off again, highlight included. */
export const hideBall = (target, id, at, { gap = 0.04, span = 0.25 } = {}) => [
    ...conceal(target, `${id}_s`, at, { span, from: 0.42 }),
    ...conceal(target, `${id}_lit`, at + gap, { span }),
    ...conceal(target, id, at + gap * 2, { span }),
];

/**
 * Move several board parts together, BY an offset.
 *
 * The `shift` verb takes one part; a diagram ball is three (the shade, the
 * lit crescent and the specular) and has to move as one object or it comes
 * apart in flight.
 */
export const shiftBy = (target, ids, [dx, dy], at, {
    span = 0.6, ease = 'smooth',
} = {}) => ids.map((part) => ({
    target, part, do: 'shift', by: [dx, dy], at: t3(at), for: t3(span), ease,
}));

// ---------------------------------------------------------------------------
// Walls: parts three, five and seven
// ---------------------------------------------------------------------------

/**
 * A wall, and the normal that belongs to it.
 *
 * The normal is DERIVED from the wall's direction and then flipped to point
 * at `toward`, so the two can never be drawn disagreeing. A wall diagram
 * whose normal is a separate parameter is the most commonly wrong figure in
 * any collision tutorial, and a viewer cannot tell a wrong one from a right
 * one -- which is exactly why it has to be impossible to author here rather
 * than merely documented.
 */
export function wallParts(id, from, to, {
    thickness = 22, toward = [540, 960], normalLen = 170, z = 30,
    fill = 'robotDark', normal = true, label = null,
} = {}) {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    // Perpendicular, then flipped to face the side the ball is on.
    let nx = -uy;
    let ny = ux;
    const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
    if ((toward[0] - mid[0]) * nx + (toward[1] - mid[1]) * ny < 0) {
        nx = -nx; ny = -ny;
    }
    const parts = [
        pathPart(`${id}_w`, `${M(from[0], from[1])} ${L(to[0], to[1])}`,
                 { stroke: fill, strokeWidth: thickness, z, alpha: 0,
                   lineCap: 'butt' }),
    ];
    if (normal) {
        parts.push(pathPart(`${id}_n`, arrowPath(
            mid, [mid[0] + nx * normalLen, mid[1] + ny * normalLen],
            { head: 28, width: 9 }), { fill: 'normal', z: z + 2, alpha: 0 }));
        // Beside the arrow, not beyond its tip. The normal points AT
        // something by definition -- that is what it is for -- so a label
        // past the arrowhead lands on whatever the arrow is pointing at.
        parts.push(textPart(`${id}_nl`, label ?? 'NORMAL', {
            at: [mid[0] + nx * normalLen * 0.55 - ny * 92,
                 mid[1] + ny * normalLen * 0.55 + nx * 92],
            font: `800 30px ${FONT}`, fill: 'normal', z: z + 3, alpha: 0,
            maxWidth: 340 }));
    }
    return { parts, ids: parts.map((p) => p.id), unit: [ux, uy], normal: [nx, ny],
             mid, wallId: `${id}_w`,
             normalIds: normal ? [`${id}_n`, `${id}_nl`] : [] };
}

// ---------------------------------------------------------------------------
// Meters and comparisons
// ---------------------------------------------------------------------------

/**
 * A horizontal meter: a track, a fill, a label and a number.
 *
 * Every coefficient in the back half of this series is a number between
 * nought and one -- restitution, friction, the fraction of energy that
 * survives. A bar says "of what it could be" in a way a figure alone does
 * not, and the fill is returned separately so it can grow under narration.
 */
export function barParts(id, {
    x = 120, y = 900, w = 840, h = 34, value = 0.5, fill = 'restitution',
    label = null, z = 50, showValue = true, decimals = 2,
} = {}) {
    // The fill is drawn at its FINAL width and scaled from nothing, rather
    // than drawn full-width and scaled down. A part's geometry cannot be
    // animated -- only its transform -- so a bar that is never animated has
    // to already be the right length, and `grow` is then the one optional
    // flourish instead of a requirement for correctness.
    const fw = Math.max(1, (w - 6) * Math.max(0, Math.min(1, value)));
    const fcx = x + 3 + fw / 2;
    const parts = [
        pathPart(`${id}_tr`, roundRect(x, y, w, h, h / 2),
                 { fill: 'panel', stroke: 'panelLine', strokeWidth: 2, z, alpha: 0 }),
        rectPart(`${id}_fl`, fw, h - 10, { at: [fcx, y + h / 2], fill, z: z + 1,
                                           alpha: 0 }),
    ];
    if (label) {
        parts.push(textPart(`${id}_l`, label, {
            at: [x, y - 30], font: `700 28px ${FONT}`, fill: 'dim', align: 'left',
            z: z + 2, alpha: 0, maxWidth: w - 240 }));
    }
    if (showValue) {
        parts.push(textPart(`${id}_v`, value.toFixed(decimals), {
            at: [x + w, y - 30], font: `800 32px ${FONT}`, fill, align: 'right',
            z: z + 2, alpha: 0, maxWidth: 240 }));
    }
    return {
        parts, ids: parts.map((p) => p.id),
        /**
         * Fill the bar from the left, over `span`.
         *
         * Three keys, not two. `set` writes ONE key and the ramp happens
         * between successive keys, so a single key at `at` would make the
         * bar ramp all the way from `seedChannel`'s authored value at t=0 --
         * growing slowly through every shot before the one it belongs to.
         * The `step` key at zero pins it until its moment arrives.
         *
         * Scaling about the node's own centre would grow the bar from the
         * middle outward, so `transform.x` moves it back by half of what the
         * scale took off. That pins the left edge, which is where a meter
         * grows from.
         */
        grow: (target, at, { span = 0.6, ease = 'smooth', from = 0 } = {}) => {
            const key = (channel, value2, when, ease2) =>
                ({ target, do: 'set', part: `${id}_fl`, channel,
                   value: t3(value2), at: t3(when), ease: ease2 });
            // ABSOLUTE, not a delta. The fill's authored `at` IS its
            // `transform.x`, so keying the offset alone teleports the bar to
            // within a few hundred pixels of the frame's left edge -- which
            // is exactly where the first version of the materials table put
            // all five of its bars.
            const cxAt = (f) => x + 3 + fw * f / 2;
            const f0 = Math.max(0.001, from);
            return [
                key('transform.sx', f0, 0, 'step'),
                key('transform.x', cxAt(f0), 0, 'step'),
                key('transform.sx', f0, at, ease),
                key('transform.x', cxAt(f0), at, ease),
                key('transform.sx', 1, at + span, ease),
                key('transform.x', fcx, at + span, ease),
            ];
        },
        valueId: `${id}_v`, fillId: `${id}_fl`, trackId: `${id}_tr`,
        /** The bar's own numbers, so a caption cannot disagree with it. */
        value, right: x + w,
    };
}

/**
 * Two labelled columns: before and after, or this and that.
 *
 * Returned as two card groups plus the heading, so a comparison can arrive
 * one side at a time -- which is the only way it reads, because the point of
 * a comparison is the second thing differing from the first.
 */
export function compareParts(id, left, right, {
    y = 620, h = 300, gap = 24, x = 70, w = 940, z = 20, accentL = 'velocity',
    accentR = 'normal',
} = {}) {
    const cw = (w - gap) / 2;
    const col = (cid, [title, body], cx, accent) => [
        pathPart(`${cid}_bg`, roundRect(cx, y, cw, h, 20),
                 { fill: 'panel', stroke: 'panelLine', strokeWidth: 2, z, alpha: 0 }),
        rectPart(`${cid}_chip`, cw - 40, 8, { at: [cx + cw / 2, y + 26], fill: accent,
                                              z: z + 1, alpha: 0 }),
        textPart(`${cid}_t`, title, { at: [cx + cw / 2, y + 86], font: `800 36px ${FONT}`,
                                      fill: accent, z: z + 2, alpha: 0,
                                      maxWidth: cw - 48, lineHeight: 44 }),
        // Placed from the TOP of the block it will occupy. See `blockAt`.
        textPart(`${cid}_b`, body, { at: [cx + cw / 2, blockAt(y + 136, body, 36)],
                                     font: `600 27px ${FONT}`,
                                     fill: 'ink', z: z + 2, alpha: 0,
                                     maxWidth: cw - 48, lineHeight: 36 }),
    ];
    const l = col(`${id}L`, left, x, accentL);
    const r = col(`${id}R`, right, x + cw + gap, accentR);
    return {
        parts: [...l, ...r],
        left: l.map((p) => p.id), right: r.map((p) => p.id),
        ids: [...l, ...r].map((p) => p.id),
        bottom: y + h,
        /** The middle of each column, for anything drawn inside it. */
        lcx: x + cw / 2, rcx: x + cw + gap + cw / 2, cw,
    };
}

// ---------------------------------------------------------------------------
// The loop: part seven
// ---------------------------------------------------------------------------

/**
 * The game loop, as a ring of labelled boxes joined by arrows.
 *
 * A list says what the steps are; a ring says the thing that actually
 * matters about them, which is that it happens again sixty times a second.
 * The arrows are derived from the box positions, so a step added or removed
 * cannot leave an arrow pointing at nothing.
 */
export function loopParts(id, steps, {
    cx = 540, cy = 960, r = 330, bw = 290, bh = 104, z = 30, accent = 'velocity',
} = {}) {
    const parts = [];
    const nodes = [];
    const n = steps.length;
    const pos = steps.map((_, i) => {
        const a = -Math.PI / 2 + (i / n) * TAU;
        return [cx + r * Math.cos(a) * 1.08, cy + r * Math.sin(a) * 0.88];
    });
    steps.forEach(([name, note, col], i) => {
        const [bx, by] = pos[i];
        const nid = `${id}${i}`;
        parts.push(
            pathPart(`${nid}_bg`, roundRect(bx - bw / 2, by - bh / 2, bw, bh, 18),
                     { fill: 'panel', stroke: col ?? accent, strokeWidth: 3, z,
                       alpha: 0 }),
            textPart(`${nid}_t`, name, { at: [bx, by - 12], font: `800 30px ${FONT}`,
                                         fill: col ?? accent, z: z + 1, alpha: 0,
                                         maxWidth: bw - 28 }),
            textPart(`${nid}_w`, note, { at: [bx, by + 28], font: `600 23px ${FONT}`,
                                         fill: 'dim', z: z + 1, alpha: 0,
                                         maxWidth: bw - 28, lineHeight: 28 }),
        );
        nodes.push([`${nid}_bg`, `${nid}_t`, `${nid}_w`]);
    });
    // One arrow per gap, each pulled back to the boxes' edges so it points at
    // a box rather than through it.
    const arrows = [];
    for (let i = 0; i < n; i++) {
        const a = pos[i];
        const b = pos[(i + 1) % n];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const len = Math.hypot(dx, dy) || 1;
        const ux = dx / len;
        const uy = dy / len;
        /**
         * Where the arrow should start and stop: the point the straight
         * line between the two centres leaves the box.
         *
         * A flat `bh * 0.72` is right for the diagonal gaps and wrong for
         * the horizontal one, where the boxes are nearly three hundred wide
         * and the arrowhead ended up INSIDE the box it was pointing at --
         * drawn, at a lower z, behind it. The arrow between DETECT and
         * RESOLVE simply had no head.
         */
        const tx = Math.abs(ux) > 1e-6 ? (bw / 2) / Math.abs(ux) : Infinity;
        const ty = Math.abs(uy) > 1e-6 ? (bh / 2) / Math.abs(uy) : Infinity;
        const inset = Math.min(Math.min(tx, ty) + 16, len / 2 - 10);
        const aid = `${id}a${i}`;
        parts.push(pathPart(aid, arrowPath(
            [a[0] + ux * inset, a[1] + uy * inset],
            [b[0] - ux * inset, b[1] - uy * inset], { head: 22, width: 6 }),
            { fill: 'dim', z: z - 1, alpha: 0 }));
        arrows.push(aid);
    }
    return { parts, nodes, arrows, ids: parts.map((p) => p.id), pos };
}

/**
 * A fake game screen: a bezel, a dark field, and whatever is put inside it.
 *
 * Part seven ends on a game rather than on a diagram, and a game needs a
 * frame around it or it reads as one more figure. `inner` is the rectangle
 * the caller draws into, so the contents and the bezel cannot drift apart.
 */
export function screenParts(id, {
    x = 90, y = 600, w = 900, h = 620, z = 10, title = null, fill = 'codeBg',
} = {}) {
    const pad = 14;
    const parts = [
        pathPart(`${id}_bz`, roundRect(x, y, w, h, 26),
                 { fill: 'panel', stroke: 'panelLine', strokeWidth: 3, z, alpha: 0 }),
        pathPart(`${id}_sc`, roundRect(x + pad, y + pad + (title ? 44 : 0),
                                       w - pad * 2, h - pad * 2 - (title ? 44 : 0), 14),
                 { fill, z: z + 1, alpha: 0 }),
    ];
    if (title) {
        parts.push(textPart(`${id}_t`, title, {
            at: [x + 28, y + 36], font: `700 26px ${FONT}`, fill: 'dim', align: 'left',
            z: z + 2, alpha: 0, maxWidth: w - 56 }));
    }
    const inner = { x: x + pad, y: y + pad + (title ? 44 : 0),
                    w: w - pad * 2, h: h - pad * 2 - (title ? 44 : 0) };
    return { parts, ids: parts.map((p) => p.id), inner,
             cx: inner.x + inner.w / 2, cy: inner.y + inner.h / 2 };
}

/**
 * A short centred caption under the stage, in the colour of what it is about.
 *
 * `claimParts` is for the big ones; this is the working line that names what
 * is on screen without competing with it.
 */
export const noteParts = (id, text, {
    at = [540, 1330], fill = 'dim', size = 29, z = 92,
} = {}) => [
    textPart(id, text, { at, font: `700 ${size}px ${FONT}`, fill, z, alpha: 0,
                         maxWidth: SAFE.x1 - SAFE.x0, lineHeight: size * 1.3 }),
];

/**
 * A stack of short lines that arrive one at a time -- a derivation.
 *
 * Parts four and six have one each, and a derivation has to appear line by
 * line or it is a wall of symbols. Each line is its own part so the
 * narration can key them, and the last one can be accented as the result.
 */
export function derivationParts(id, lines, {
    x = 540, y = 680, lh = 76, size = 42, z = 70, fill = 'ink', resultFill = 'momentum',
} = {}) {
    const parts = lines.map(([text, isResult], i) => textPart(`${id}${i}`, text, {
        at: [x, y + i * lh],
        font: `800 ${isResult ? size + 6 : size}px ${FONT}`,
        fill: isResult ? resultFill : fill, z, alpha: 0,
        maxWidth: SAFE.x1 - SAFE.x0, lineHeight: lh }));
    return { parts, ids: parts.map((p) => p.id),
             lineId: (i) => `${id}${i}`, bottom: y + lines.length * lh };
}

export { Q, arcPath, roundRect };
