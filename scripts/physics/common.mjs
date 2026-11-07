/**
 * "Game Physics" -- the rigs, the diagram vocabulary, and the shot fitting.
 *
 * Three things here are new to this repo and worth reading before authoring
 * against them.
 *
 * ## 1. A speaking character made of explicit `parts`
 *
 * Every earlier series casts `generate` humanoid rigs. Bolt and Nova are
 * BALLS and Vector is a floating robot, so all three declare `parts`, a
 * `mouth` and `poses` by hand. `compile.js` has always supported that --
 * `characterParts` returns `char.parts` when they exist -- but nothing had
 * used it for a character that TALKS, so these are the first.
 *
 * ## 2. `pose` cannot be trusted to know where a part already is
 *
 * `writeChannel` ramps from `lastValueBefore(...) ?? defaultChannel(channel)`,
 * and `defaultChannel` is 1 for `sx`/`sy` and **0 for everything else** --
 * it does not know the part's authored `at`. So the first pose in a scene
 * that ramps a brow's `y` would slide it up from y=0, which on these rigs is
 * the middle of the ball.
 *
 * Two rules follow, and both are load-bearing:
 *
 *   - Every scene keys a no-span `pose: 'rest'` at t=0 per character. With no
 *     `for`, `writeChannel` writes ONE key and ramps from nothing, which is
 *     what establishes the baseline every later pose reads back.
 *   - Every pose states the SAME channel set, in absolute coordinates.
 *     `browPose` below does that arithmetic from deltas, so a pose is
 *     authored as "14 up" and emitted as y=-94.
 *
 * `set` is not affected: it calls `seedChannel`, which keys the authored
 * value at t=0. That is why the squash helpers use `set` and the acting uses
 * `pose`.
 *
 * ## 3. Blinks are `set`, not a cycle
 *
 * `boards.mjs` `blinks()` emits `play`/`blink`, which needs a declared cycle
 * and depends on where the blink sits inside the clip's duration. These rigs
 * blink by swapping a shape, so a pair of `set` keys says exactly what
 * happens and when. `fitShots` then has to skip them, for the same reason it
 * skips `play`/`blink`: a blink is decoration scattered across a guessed
 * duration, so sizing the shot to fit one makes the guess self-fulfilling.
 */
import { estimateLine } from '../../src/core/script/pacing.js';
import {
    C, FONT, L, M, Q, SAFE, TYPE, Z, arrowPath, build, conceal, curveArrow,
    ellipsePart, pathPart, poly, pop, rectPart, reveal, smooth, textPart,
} from '../lib/diagram.mjs';
import { BALL_R, BANNER, CTA, ENGINE_AD, GAME_PALETTE, REPO, SHARE, rateOf } from '../lib/physics.mjs';
import { arcPath, circlePath, roundRect } from './shapes.mjs';

export {
    bez3, board, cardRows, castBoard, rng, squarePath, statParts,
} from '../lib/boards.mjs';
export { GAME_PALETTE };

/**
 * The figures parts two to seven needed and part one did not.
 *
 * Re-exported rather than imported directly by each part, so a part has one
 * import and `figures.mjs` can grow without seven files learning about it.
 * See its header for the drawing rules it keeps.
 */
export {
    BAND, blockAt, angleParts, arcArrow, barParts, boxParts, compareParts, countTo,
    derivationParts, distanceParts, ghostTrail, loopParts, noteParts,
    readoutParts, screenParts, shiftBy, showBall, hideBall, wallParts,
} from './figures.mjs';
export { arcPath, circlePath, roundRect };

const t3 = (v) => +Number(v).toFixed(3);
const TAU = Math.PI * 2;

/**
 * A CHARACTER part. Deliberately not `diagram.mjs`'s `part`, which defaults
 * `alpha: 0` -- the right default for a diagram element waiting to be
 * revealed, and exactly wrong for an eye.
 */
const cpart = (id, shape, { at = [0, 0], z = 0, parent = null, alpha = 1, ...rest } = {}) =>
    ({ id, parent, pivot: [0, 0], at, shape, z, alpha, ...rest });

// ---------------------------------------------------------------------------
// The ball rig
// ---------------------------------------------------------------------------

const R = BALL_R;
/** Where the brows sit at rest. `browPose` offsets from here. */
const BROW_Y = -82;
const BROW_X = 46;
const EYE_Y = -26;
const EYE_X = 44;

/**
 * Brow channels for a pose, from DELTAS.
 *
 * Authored as "rot, and how far up", emitted as the absolute `y` a pose has
 * to carry (see the header). Both brows are always stated, and always with
 * both channels, so no pose can leave a channel for a previous pose to hold.
 *
 * `rot` is mirrored: a positive `tilt` lowers the INNER end of both brows,
 * which is the one expression everybody reads the same way -- determination
 * on Bolt, scepticism on Nova.
 */
const browPose = (tilt, up) => ({
    browL: { rot: tilt, y: BROW_Y - up },
    browR: { rot: -tilt, y: BROW_Y - up },
});

/** The six visemes, as paths, because the mouth node is created `kind: 'path'`. */
const MOUTH_SHAPES = {
    closed: { kind: 'path', d: `${M(-24, 0)} ${Q(0, 9, 24, 0)}` },
    mid:    { kind: 'path', d: `${M(-21, -5)} ${Q(0, 11, 21, -5)} ${Q(0, 2, -21, -5)} ${Z}` },
    open:   { kind: 'path', d: `${M(-23, -7)} ${Q(0, 27, 23, -7)} ${Q(0, 1, -23, -7)} ${Z}` },
    round:  { kind: 'path', d: `${M(-14, 1)} ${Q(0, -17, 14, 1)} ${Q(0, 19, -14, 1)} ${Z}` },
    wide:   { kind: 'path', d: `${M(-31, -4)} ${Q(0, 17, 31, -4)} ${Q(0, 4, -31, -4)} ${Z}` },
    teeth:  { kind: 'path', d: `${M(-25, -6)} ${Q(0, 3, 25, -6)} ${Q(0, 13, -25, -6)} ${Z}` },
};

/**
 * An eye, as a shape SWAP rather than a squash.
 *
 * `generate.js` makes the same choice for the humanoid blink and says why:
 * squashing a node whose geometry carries its own position pulls it toward
 * the parent's origin instead of closing it. On a ball that origin is the
 * ball's centre, so a scaled eye slides into the middle of the face.
 *
 * The closed member declares its own `fill`, which `swapProps` resolves
 * through the palette like any other colour.
 */
const eyePart = (id, x, { z = 10 } = {}) => cpart(id,
    { kind: 'ellipse', rx: 30, ry: 34 },
    { at: [x, EYE_Y], z, fill: 'eyeLine',
      swap: { lid: { default: 'open', shapes: {
          open: { kind: 'ellipse', rx: 30, ry: 34 },
          closed: { kind: 'ellipse', rx: 30, ry: 5, fill: 'eyeLine' },
      } } } });

/**
 * A billiard-ball character.
 *
 * The form is four stacked ellipses rather than a gradient: `shapes.js` fills
 * flat, so the turn from light to shade is a smaller, offset ellipse of the
 * lit tone sitting on a larger one of the shade tone. The offset is what
 * leaves a crescent, and it has to stay inside the silhouette -- a lit
 * ellipse 14 smaller offset 8 reaches 114 against the ball's 120, so the
 * highlight side shows no seam.
 *
 * `mark` is the piece that SPINS. Its pivot is the ball's centre while its
 * geometry is drawn off-centre, so `transform.rot` on it orbits the mark
 * around the ball exactly the way a numbered ball's spin reads -- while the
 * face stays upright, which is the cartoon convention and the only way a
 * ball with eyes can spin without the eyes going with it.
 */
export function ballCharacter({
    voice, base, baseDark, markShape, markFill, brow = 'brow', number = null,
}) {
    const parts = [
        cpart('ball', { kind: 'ellipse', rx: R, ry: R }, { fill: baseDark, z: 0 }),
        cpart('lit', { kind: 'ellipse', rx: R - 14, ry: R - 14 },
              { at: [-8, -10], fill: base, z: 1 }),
        cpart('spec', { kind: 'ellipse', rx: 30, ry: 21 },
              { at: [-46, -58], fill: 'white', alpha: 0.5, z: 2 }),
        // Pivot at the ball centre, geometry off-centre: see the note above.
        cpart('mark', markShape, { at: [0, 0], fill: markFill, z: 4 }),
        eyePart('eyeL', -EYE_X),
        eyePart('eyeR', EYE_X),
        // The glint is a CHILD of the eye, so it travels with it. A blink has
        // to take it down too -- `ballBlink` does, because a white dot left
        // floating on a closed eye is the one thing that reads as a bug.
        cpart('glintL', { kind: 'ellipse', rx: 10, ry: 11 },
              { parent: 'eyeL', at: [-10, -13], fill: 'white', z: 11 }),
        cpart('glintR', { kind: 'ellipse', rx: 10, ry: 11 },
              { parent: 'eyeR', at: [-10, -13], fill: 'white', z: 11 }),
        cpart('browL', { kind: 'path', d: `${M(-26, 5)} ${L(26, -5)}` },
              { at: [-BROW_X, BROW_Y], stroke: brow, strokeWidth: 11, z: 12,
                lineCap: 'round' }),
        cpart('browR', { kind: 'path', d: `${M(-26, -5)} ${L(26, 5)}` },
              { at: [BROW_X, BROW_Y], stroke: brow, strokeWidth: 11, z: 12,
                lineCap: 'round' }),
    ];
    if (number != null) {
        parts.push(cpart('markN', { kind: 'text', text: String(number),
                                    font: `800 38px ${FONT}`, align: 'center',
                                    baseline: 'middle' },
                         { parent: 'mark', at: MARK_AT, fill: baseDark, z: 5 }));
    }
    return {
        palette: 'game',
        voice,
        parts,
        mouth: { pivot: [0, 46], shapes: MOUTH_SHAPES, fill: 'mouthDark',
                 stroke: 'mouthDark', strokeWidth: 3, z: 20 },
        poses: {
            // Every pose states both brows and both channels. See the header.
            rest:      browPose(0.00, 0),
            keen:      browPose(-0.22, 14),      // eager, brows up and out
            sure:      browPose(0.26, 2),        // inner ends down: determined
            shock:     browPose(-0.34, 24),      // both high: surprise
            doubt:     browPose(0.34, -4),       // inner down, low: sceptical
            think:     browPose(0.14, 8),
        },
    };
}

/**
 * Where both balls carry their marking, so the two read as the same object.
 *
 * Radius 93 of the ball's 120, which is as far out as a 26-wide badge can sit
 * and stay inside the silhouette. It matters because the mark ORBITS: at the
 * first version's radius 85 it swung straight across the eyes, and a white
 * disc crossing a face reads as damage rather than as rotation. Out here it
 * passes close to the rim, and the face — eyes at z 10, brows at z 12,
 * against the mark's z 4 — stays in front of it the whole way round, which is
 * how a cartoon ball with both a logo and a face has always worked.
 */
const MARK_AT = [-64, 68];

/** Bolt's lightning mark, drawn around the lower-left of the ball. */
const BOLT_MARK = `${M(-78, 40)} ${L(-48, 40)} ${L(-61, 68)} ${L(-37, 64)} `
    + `${L(-72, 104)} ${L(-63, 74)} ${L(-85, 76)} ${Z}`;

export const BOLT = ballCharacter({
    voice: 'bolt_v', base: 'cue', baseDark: 'cueDark',
    markShape: { kind: 'path', d: BOLT_MARK }, markFill: 'bolt', brow: 'brow',
});

/** Nova carries a white disc and a 5, the way an orange billiard ball does. */
export const NOVA = ballCharacter({
    voice: 'nova_v', base: 'nova', baseDark: 'novaDark',
    markShape: { kind: 'path', d: circlePath(MARK_AT[0], MARK_AT[1], 26) },
    markFill: 'white', brow: 'browNova', number: 5,
});

// ---------------------------------------------------------------------------
// Vector: the floating robot
// ---------------------------------------------------------------------------

/**
 * A small hovering robot with a screen for a face.
 *
 * He is the explainer, so his design job is to be legible at thumbnail size
 * and never compete with the diagram he is pointing at: one rounded shell,
 * one dark panel, two lit eyes, an antenna. No arms -- a guide who gestures
 * would need the arm rig this series deliberately does not have.
 */
export const VECTOR = {
    palette: 'game',
    voice: 'vector_v',
    parts: [
        // The hover ring: a flattened ellipse under him, so he reads as
        // floating rather than as pasted onto the frame.
        cpart('halo', { kind: 'ellipse', rx: 92, ry: 20 },
              { at: [0, 128], fill: 'glow', alpha: 0.16, z: -2 }),
        cpart('antenna', { kind: 'path', d: `${M(0, -96)} ${L(0, -138)}` },
              { stroke: 'robotDark', strokeWidth: 7, z: 0, lineCap: 'round' }),
        cpart('bulb', { kind: 'ellipse', rx: 14, ry: 14 },
              { at: [0, -148], fill: 'glow', z: 1 }),
        cpart('shell', { kind: 'path', d: roundRect(-104, -96, 208, 192, 54) },
              { fill: 'robot', z: 2 }),
        cpart('shellLit', { kind: 'path', d: roundRect(-92, -86, 184, 150, 44) },
              { fill: 'white', alpha: 0.12, z: 3 }),
        cpart('panel', { kind: 'path', d: roundRect(-82, -70, 164, 132, 36) },
              { fill: 'screen', z: 4 }),
        eyePart('eyeL', -38, { z: 10 }),
        eyePart('eyeR', 38, { z: 10 }),
        cpart('glintL', { kind: 'ellipse', rx: 9, ry: 10 },
              { parent: 'eyeL', at: [-9, -12], fill: 'glow', z: 11 }),
        cpart('glintR', { kind: 'ellipse', rx: 9, ry: 10 },
              { parent: 'eyeR', at: [-9, -12], fill: 'glow', z: 11 }),
        cpart('browL', { kind: 'path', d: `${M(-22, 3)} ${L(22, -3)}` },
              { at: [-38, -74], stroke: 'glow', strokeWidth: 8, z: 12,
                lineCap: 'round' }),
        cpart('browR', { kind: 'path', d: `${M(-22, -3)} ${L(22, 3)}` },
              { at: [38, -74], stroke: 'glow', strokeWidth: 8, z: 12,
                lineCap: 'round' }),
    ],
    // His eyes sit higher than a ball's, so the mouth does too.
    mouth: { pivot: [0, 30], shapes: MOUTH_SHAPES, fill: 'glow',
             stroke: 'glow', strokeWidth: 3, z: 20 },
    poses: {
        rest:  vectorBrow(0.00, 0),
        keen:  vectorBrow(-0.20, 10),
        sure:  vectorBrow(0.24, 2),
        shock: vectorBrow(-0.30, 18),
        doubt: vectorBrow(0.30, -4),
        think: vectorBrow(0.12, 6),
    },
};

/** Vector's brows rest higher than a ball's, so his poses need their own base. */
function vectorBrow(tilt, up) {
    return {
        browL: { rot: tilt, y: -74 - up },
        browR: { rot: -tilt, y: -74 - up },
    };
}

// ---------------------------------------------------------------------------
// Acting
// ---------------------------------------------------------------------------

/**
 * The baseline every scene opens with, per character.
 *
 * No `for`, so `writeChannel` writes a single key and nothing ramps from
 * `defaultChannel`. Without this a scene's first expression slides the brows
 * up from the middle of the ball. See the header.
 */
export const rest = (target, at = 0) => ({ target, do: 'pose', pose: 'rest', at: t3(at) });

/**
 * Hold an expression, then come back to rest.
 *
 * `for` on a pose is the TRANSITION span, not a hold -- the trap
 * `30-STRUCTURE-SERIES.md` records, where a character ends a scene still
 * holding a gesture. This poses in, holds, and poses back.
 */
export const express = (target, pose, at, { hold = 1.2, span = 0.3 } = {}) => [
    { target, do: 'pose', pose, at: t3(at), for: t3(span), ease: 'smooth' },
    { target, do: 'pose', pose: 'rest', at: t3(at + span + hold), for: t3(span),
      ease: 'smooth' },
];

/**
 * One blink: swap both eyes shut and take the glints with them.
 *
 * Four channels, because the glint is a child of the eye and a shape swap on
 * the parent leaves the child alone. `step` on the leading key of each pair
 * is correct here and nowhere else in this file: a lid is discrete, so there
 * is nothing to ease.
 */
export function ballBlink(target, at, { shut = 0.11 } = {}) {
    const out = [];
    for (const eye of ['eyeL', 'eyeR']) {
        out.push(
            { target, do: 'set', part: eye, channel: 'props.lid', value: 'closed',
              at: t3(at), ease: 'step' },
            { target, do: 'set', part: eye, channel: 'props.lid', value: 'open',
              at: t3(at + shut), ease: 'step' },
        );
    }
    for (const glint of ['glintL', 'glintR']) {
        out.push(
            { target, do: 'set', part: glint, channel: 'props.alpha', value: 0,
              at: t3(at), ease: 'step' },
            { target, do: 'set', part: glint, channel: 'props.alpha', value: 1,
              at: t3(at + shut), ease: 'step' },
        );
    }
    return out;
}

/** Blinks scattered across a shot, seeded so two characters never blink together. */
export function ballBlinks(target, duration, seed) {
    let a = seed >>> 0;
    const rnd = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let x = Math.imul(a ^ (a >>> 15), 1 | a);
        x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    const out = [];
    for (let t = 0.8 + rnd() * 1.6; t < duration - 0.4; t += 2.1 + rnd() * 2.6) {
        out.push(...ballBlink(target, t));
    }
    return out;
}

/**
 * Squash and stretch on the whole character.
 *
 * Keyed on the cast ROOT's `sx`/`sy`, which the cast entry authored as
 * `scale`. So the absolute values are `scale * (1 +/- amount)` and the
 * caller has to pass the scale it cast at -- `set` seeds from the authored
 * value, so the ramp starts correctly, but it cannot invent the number.
 *
 * Volume is roughly conserved: a ball that squashes 18% wide rises 18% flat.
 * That is the whole of squash and stretch and it is why an impact reads.
 */
export function squash(target, at, { scale = 1, amount = 0.18, span = 0.12,
                                     back = 0.22 } = {}) {
    const wide = scale * (1 + amount);
    const flat = scale * (1 - amount);
    const key = (channel, value, when, ease = 'smooth') =>
        ({ target, do: 'set', channel, value: t3(value), at: t3(when), ease });
    return [
        key('transform.sx', scale, at, 'smooth'),
        key('transform.sy', scale, at, 'smooth'),
        key('transform.sx', wide, at + span),
        key('transform.sy', flat, at + span),
        key('transform.sx', scale, at + span + back, 'step'),
        key('transform.sy', scale, at + span + back, 'step'),
    ];
}

/**
 * Stretch along travel, and come back.
 *
 * A ball moving fast is longer than it is tall, and a ball that has STOPPED
 * is not -- so this ramps out over the first fifth of the travel and back
 * over the last fifth. The first version keyed the stretched value with
 * `step` and never returned, which left every ball in the film permanently
 * oval after its first move.
 *
 * `ease` is the one place `step` would be wrong on the trailing key, because
 * there IS something after it: the return.
 */
export function stretch(target, at, {
    scale = 1, amount = 0.12, span = 0.8, ramp: rampSpan = 0.18,
} = {}) {
    const ramp = Math.min(rampSpan, span / 2);
    const wide = scale * (1 + amount);
    const flat = scale * (1 - amount * 0.7);
    const key = (channel, value, when, ease = 'smooth') =>
        ({ target, do: 'set', channel, value: t3(value), at: t3(when), ease });
    return [
        key('transform.sx', scale, at),
        key('transform.sx', wide, at + ramp),
        key('transform.sx', wide, at + span - ramp),
        key('transform.sx', scale, at + span, 'step'),
        key('transform.sy', scale, at),
        key('transform.sy', flat, at + ramp),
        key('transform.sy', flat, at + span - ramp),
        key('transform.sy', scale, at + span, 'step'),
    ];
}

/**
 * Spin the ball's mark.
 *
 * `turns` is whole revolutions, and `ease: 'linear'` is not negotiable: a
 * spinning ball does not accelerate between keys, and `smooth` puts a visible
 * hesitation at each end of the ramp that reads as a stutter rather than as
 * rotation. Same reasoning as `flowLoop` in `diagram.mjs`.
 */
export const spinMark = (target, at, span, turns = 1, { from = 0 } = {}) => [
    { target, do: 'set', part: 'mark', channel: 'transform.rot', value: t3(from * TAU),
      at: t3(at), ease: 'linear' },
    { target, do: 'set', part: 'mark', channel: 'transform.rot',
      value: t3((from + turns) * TAU), at: t3(at + span), ease: 'linear' },
];

/**
 * Roll a ball across the frame: travel, spin and stretch as one thing.
 *
 * `squash: false` turns the stretch off, for a move that is followed
 * immediately by an impact `squash` -- two helpers keying `transform.sx` over
 * overlapping windows fight, and the loser is whichever the interpolator
 * reaches last.
 */
export function roll(target, {
    from, to, at = 0, span = 1, turns = null, scale = 1, ease = 'linear',
    squash: wantStretch = true,
}) {
    const dist = Math.abs(to[0] - from[0]);
    // One revolution per circumference, so the spin matches the travel
    // instead of being a number somebody picked. The sign follows the
    // direction, because a ball rolling left spins left.
    const n = turns ?? (dist / (TAU * R * scale)) * (to[0] < from[0] ? -1 : 1);
    return [
        { target, do: 'move', to, at: t3(at), for: t3(span), ease },
        ...spinMark(target, at, span, n),
        ...(wantStretch
            ? stretch(target, at, { scale, amount: 0.1, span, ramp: Math.min(0.2, span / 3) })
            : []),
    ];
}

// ---------------------------------------------------------------------------
// Standing furniture
// ---------------------------------------------------------------------------

/**
 * The kicker + title block, revealed after the hook rather than over it.
 *
 * Spaced for a title that WRAPS. A 74px title at a 82px line height, centred
 * on `at.y`, puts a two-line block 82px above its anchor -- so at the first
 * version's 398 its first line landed on 316 and ran straight through the
 * kicker at 318. "The secret behind every collision" is 33 characters, which
 * at this size cannot fit 960px on one line, so two lines is the case to
 * design for rather than the exception.
 *
 * `lineHeight` is stated rather than left to the renderer's default, because
 * the gaps below are arithmetic on it.
 */
export const hookTitle = (kicker, title, sub = null) => [
    textPart('kicker', kicker, { at: [540, 286], font: TYPE.kicker, fill: 'velocity' }),
    textPart('title', title, { at: [540, 430], font: TYPE.title, fill: 'ink',
                               lineHeight: 82, maxWidth: SAFE.x1 - SAFE.x0 }),
    ...(sub ? [textPart('titlesub', sub, { at: [540, 552], font: TYPE.caption,
                                           fill: 'dim', maxWidth: SAFE.x1 - SAFE.x0 })] : []),
];

/**
 * When the title may arrive: late enough that the hook owns the opening.
 *
 * A fraction of the hook line's own estimated span, so a longer hook holds
 * the frame longer. `27-RETENTION.md` rule 1: a card in the first two
 * seconds spends the window the platform gives you on a logo.
 */
export function titleAt(text, { frac = 0.74, min = 2.4, max = 4.6 } = {}) {
    const span = estimateLine(text, { lang: 'en' });
    return +Math.min(max, Math.max(min, span * frac)).toFixed(2);
}

/**
 * The pinned banner.
 *
 * Authored at `alpha: 1`, NOT revealed by an action. A board re-cast in a new
 * scene starts with every part back at its authored alpha, so a reveal in
 * scene one does nothing for scene two -- the defect that gave the structure
 * series a banner which appeared once and vanished.
 */
export function bannerParts(n) {
    return [
        rectPart('ban_bg', 1080, 84, { at: [540, 196], fill: 'bgDeep', alpha: 0.82, z: 400 }),
        pathPart('ban_rule', `${M(60, 238)} ${L(1020, 238)}`,
                 { stroke: 'panelLine', strokeWidth: 2, alpha: 1, z: 401 }),
        textPart('ban_t', BANNER(n), { at: [540, 192], font: `700 32px ${FONT}`,
                                       fill: 'dim', alpha: 1, z: 402,
                                       maxWidth: SAFE.x1 - SAFE.x0 }),
    ];
}

/**
 * The end card: what is next, the two asks, and the engine.
 *
 * Short on purpose. `27-RETENTION.md` rule 7 -- retention falls off a cliff
 * once the point has landed, so an end card is about six seconds, not twenty.
 */
export function endCard(nextLine, part = 1) {
    const parts = [
        textPart('ec_next_k', 'NEXT', { at: [540, 536], font: `700 30px ${FONT}`,
                                        fill: 'velocity' }),
        // 56px over a 66px line height, centred on `at.y`: a TWO-line title
        // spans at.y +/- 66, so its first line starts 66 above this anchor.
        // At the first version's 630 that put it at 564, which ran straight
        // through the kicker at 548. A multi-line text part has to be placed
        // from the top of the block it will actually occupy, not its middle.
        textPart('ec_next', nextLine, { at: [540, 672], font: `800 56px ${FONT}`,
                                        fill: 'ink', maxWidth: SAFE.x1 - SAFE.x0,
                                        lineHeight: 66 }),
        textPart('ec_cta', CTA(part), { at: [540, 840], font: `700 34px ${FONT}`,
                                  fill: 'momentum', maxWidth: SAFE.x1 - SAFE.x0,
                                  lineHeight: 44 }),
        textPart('ec_tags', SHARE, { at: [540, 924], font: `600 27px ${FONT}`,
                                     fill: 'dim', maxWidth: SAFE.x1 - SAFE.x0 }),
        textPart('ec_made', ENGINE_AD, { at: [540, 1120], font: `600 29px ${FONT}`,
                                         fill: 'dim', maxWidth: SAFE.x1 - SAFE.x0,
                                         lineHeight: 38 }),
        textPart('ec_name', 'JIREX', { at: [540, 1222], font: `800 108px ${FONT}`,
                                       fill: 'velocity' }),
        textPart('ec_repo', REPO, { at: [540, 1300], font: TYPE.credit, fill: 'ink' }),
        textPart('ec_lic', 'MIT licensed  ·  free to use, fork and build on', {
            at: [540, 1352], font: TYPE.small, fill: 'dim',
            maxWidth: SAFE.x1 - SAFE.x0 }),
    ];
    return { parts, ids: parts.map((p) => p.id) };
}

// ---------------------------------------------------------------------------
// The diagram vocabulary
// ---------------------------------------------------------------------------

/**
 * The pool table, seen flat from above-ish, and the spotlight on it.
 *
 * The light is four concentric ellipses of white at falling alpha, not a
 * gradient: a part's `fill` is flat, so a soft pool of light has to be
 * stacked. Cheap, and it is how a painted background has always faked one.
 */
export function tableParts(id, {
    cx = 540, cy = 980, w = 1000, h = 620, light = true,
} = {}) {
    const x = cx - w / 2;
    const y = cy - h / 2;
    const rail = 38;
    const parts = [
        rectPart(`${id}_rail`, w, h, { at: [cx, cy], fill: 'rail', z: -60 }),
        rectPart(`${id}_railIn`, w - 14, h - 14, { at: [cx, cy], fill: 'railDark', z: -59 }),
        rectPart(`${id}_felt`, w - rail * 2, h - rail * 2,
                 { at: [cx, cy], fill: 'feltDark', z: -58 }),
        rectPart(`${id}_feltLit`, w - rail * 2 - 20, h - rail * 2 - 20,
                 { at: [cx, cy], fill: 'felt', z: -57 }),
    ];
    // Pockets: the four corners and the two middles, as a top-down table has.
    const px = [x + rail + 8, cx, x + w - rail - 8];
    const py = [y + rail + 8, y + h - rail - 8];
    let k = 0;
    for (const pyy of py) {
        for (const pxx of px) {
            parts.push(ellipsePart(`${id}_p${k++}`, 30, 30,
                                   { at: [pxx, pyy], fill: 'pocket', z: -56 }));
        }
    }
    // The spotlight: concentric ellipses at falling alpha, because a part's
    // `fill` is flat and a soft pool of light has to be stacked.
    //
    // Each one is returned WITH the alpha it is meant to reach, because
    // `reveal` ramps to 1 by default and a 0.05 light revealed to 1 is a
    // solid white disc over the table -- which is exactly what the first
    // version of this shot rendered. A faint part cannot be revealed by the
    // generic helper; it has to be revealed to its own value.
    const lights = [];
    if (light) {
        // Concentric, so the alphas ACCUMULATE toward the middle: 0.07 at the
        // rim and about 0.19 at the centre, which is a spotlight rather than
        // a disc.
        [[430, 290, 0.07], [320, 205, 0.06], [205, 130, 0.055]]
            .forEach(([rx, ry, a], i) => {
                const lid = `${id}_l${i}`;
                parts.push(ellipsePart(lid, rx, ry,
                    { at: [cx, cy - 30], fill: 'white', alpha: a, z: -50 }));
                lights.push([lid, a]);
            });
    }
    const lightIds = lights.map(([lid]) => lid);
    return {
        parts,
        ids: parts.map((p) => p.id),
        lights,
        /** Everything except the light pool, which reveals to its own alpha. */
        solidIds: parts.map((p) => p.id).filter((pid) => !lightIds.includes(pid)),
        cx, cy,
    };
}

/**
 * Reveal parts that are authored SEMI-transparent, to their own alpha.
 *
 * `reveal` ramps to 1, which is right for a diagram element and wrong for
 * anything whose authored alpha is the point -- a light pool, a ghost, a
 * dimmed row. Takes `[id, alpha]` pairs so the target value travels with the
 * part instead of being restated at the call site and drifting from it.
 */
export const revealTo = (target, pairs, at, { gap = 0.06, span = 0.4 } = {}) =>
    pairs.flatMap(([id, a], i) => reveal(target, id, at + i * gap, { span, to: a }));

/** A cue stick, pointing right along the table. */
export const cueParts = (id, { at = [120, 980], len = 520 } = {}) => [
    pathPart(`${id}_shaft`, `${M(at[0] - len, at[1])} ${L(at[0], at[1])}`,
             { stroke: 'rail', strokeWidth: 16, z: 120, lineCap: 'round' }),
    pathPart(`${id}_tip`, `${M(at[0] - 34, at[1])} ${L(at[0], at[1])}`,
             { stroke: 'ink', strokeWidth: 17, z: 121, lineCap: 'round' }),
];

/**
 * A plain ball, for a diagram where a FACE would be a distraction.
 *
 * The characters act; these are the ones being measured. Same two-ellipse
 * form so a diagram ball still reads as the same object as Bolt.
 */
export const diagramBall = (id, [cx, cy], r, {
    base = 'cue', baseDark = 'cueDark', z = 20, alpha = 0,
} = {}) => [
    ellipsePart(`${id}`, r, r, { at: [cx, cy], fill: baseDark, z, alpha }),
    ellipsePart(`${id}_lit`, r * 0.88, r * 0.88,
                { at: [cx - r * 0.07, cy - r * 0.08], fill: base, z: z + 1, alpha }),
    // The specular. Kept small and soft: at r*0.24 and alpha 0.5 it read as
    // a white blob stuck on the ball rather than as a highlight on it.
    ellipsePart(`${id}_s`, r * 0.19, r * 0.13,
                { at: [cx - r * 0.4, cy - r * 0.5], fill: 'white',
                  alpha: alpha ? 0.42 : 0, z: z + 2 }),
];

export const diagramBallIds = (id) => [id, `${id}_lit`, `${id}_s`];

/**
 * A velocity arrow. Cyan, always, in every part of the series.
 *
 * `labelAt` puts the name at the arrow's midpoint, offset along its own
 * normal, so a label never sits on the shaft it is naming.
 */
export function vectorArrow(id, from, to, {
    fill = 'velocity', width = 11, head = 30, z = 60, label = null,
    labelFont = `700 30px ${FONT}`, labelOff = 42,
} = {}) {
    const parts = [pathPart(id, arrowPath(from, to, { head, width }),
                            { fill, z, alpha: 0 })];
    if (label) {
        const mx = (from[0] + to[0]) / 2;
        const my = (from[1] + to[1]) / 2;
        const dx = to[0] - from[0];
        const dy = to[1] - from[1];
        const len = Math.hypot(dx, dy) || 1;
        parts.push(textPart(`${id}_l`, label, {
            at: [mx - (dy / len) * labelOff, my + (dx / len) * labelOff],
            font: labelFont, fill, z: z + 1, alpha: 0,
            maxWidth: SAFE.x1 - SAFE.x0 }));
    }
    return { parts, ids: parts.map((p) => p.id) };
}

/**
 * The faint coordinate grid, as SCENERY rather than as a board.
 *
 * It never animates -- it is the "inside the physics engine" backdrop and it
 * is simply there -- and `compile.js` resolves actions against cast roots
 * only, so anything static has no reason to be a cast member. As scenery it
 * costs one array per scene instead of a board that has to be re-revealed
 * every time it is re-cast.
 *
 * `vignette` darkens the top and bottom bands so the banner and the subtitle
 * stay legible over it, which a flat grid across the whole frame does not.
 */
export function gridScenery({
    x0 = 0, x1 = 1080, y0 = 240, y1 = 1560, step = 90, z = -800,
    stroke = 'grid', vignette = true,
} = {}) {
    const out = [];
    let k = 0;
    for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) {
        out.push({ id: `gx${k++}`, shape: { kind: 'path', d: `${M(x, y0)} ${L(x, y1)}` },
                   at: [0, 0], stroke, strokeWidth: 2, z });
    }
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) {
        out.push({ id: `gy${k++}`, shape: { kind: 'path', d: `${M(x0, y)} ${L(x1, y)}` },
                   at: [0, 0], stroke, strokeWidth: 2, z });
    }
    if (vignette) {
        out.push({ id: 'vigT', shape: { kind: 'rect', w: 1080, h: 300, cx: true, cy: true },
                   at: [540, 150], fill: 'bgDeep', alpha: 0.72, z: z + 1 });
        out.push({ id: 'vigB', shape: { kind: 'rect', w: 1080, h: 420, cx: true, cy: true },
                   at: [540, 1710], fill: 'bgDeep', alpha: 0.72, z: z + 1 });
    }
    return out;
}

/** A faint coordinate grid as board PARTS, where it has to build on cue. */
export function gridParts(id, {
    x0 = 60, x1 = 1020, y0 = 500, y1 = 1300, step = 80, z = -40,
} = {}) {
    const parts = [];
    let k = 0;
    for (let x = x0; x <= x1; x += step) {
        parts.push(pathPart(`${id}_v${k++}`, `${M(x, y0)} ${L(x, y1)}`,
                            { stroke: 'grid', strokeWidth: 2, z, alpha: 0 }));
    }
    for (let y = y0; y <= y1; y += step) {
        parts.push(pathPart(`${id}_h${k++}`, `${M(x0, y)} ${L(x1, y)}`,
                            { stroke: 'grid', strokeWidth: 2, z, alpha: 0 }));
    }
    return { parts, ids: parts.map((p) => p.id) };
}

/**
 * The collision normal, drawn the way the series insists it must be.
 *
 * ## The drawing rule for this series
 *
 * > The normal is drawn as the line THROUGH BOTH CENTRES, always, and the
 * > tangent as the line perpendicular to it at the contact point.
 *
 * Never as a free-floating arrow off the side of a ball. A viewer who learns
 * the arrow learns a logo; a viewer who learns "centre to centre" can find it
 * themselves in any collision they ever look at, which is the only place it
 * matters. The geometry below therefore DERIVES both lines from the two
 * centres rather than taking them as parameters -- it is not possible to
 * author this diagram wrong.
 */
export function normalParts(id, a, b, {
    r = 110, extend = 150, tangent = true, z = 70, dot = true,
} = {}) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    // Contact is where the two surfaces meet: along the centre line, one
    // radius out from A. For equal radii that is also the midpoint, but
    // deriving it means an unequal pair still draws correctly.
    const contact = [a[0] + ux * r, a[1] + uy * r];
    const parts = [
        pathPart(`${id}_n`, arrowPath(
            [a[0] - ux * extend * 0.4, a[1] - uy * extend * 0.4],
            [b[0] + ux * extend, b[1] + uy * extend], { head: 30, width: 9 }),
            { fill: 'normal', z, alpha: 0 }),
        ...(dot ? [ellipsePart(`${id}_c`, 13, 13,
                               { at: contact, fill: 'ink', z: z + 2, alpha: 0 })] : []),
    ];
    if (tangent) {
        // Perpendicular to the normal, through the contact point.
        const tl = extend * 1.15;
        parts.push(pathPart(`${id}_t`,
            `${M(contact[0] + uy * tl, contact[1] - ux * tl)} `
            + `${L(contact[0] - uy * tl, contact[1] + ux * tl)}`,
            { stroke: 'tangent', strokeWidth: 7, z: z + 1, alpha: 0,
              lineCap: 'round', trim: { end: 1 } }));
    }
    return { parts, ids: parts.map((p) => p.id), contact, unit: [ux, uy] };
}

/**
 * A bounce: a ball dropping and returning to a fraction of its height.
 *
 * `e` is RESTITUTION, and the return apex is therefore at `h · e²`.
 *
 * That square is the whole point and it used to be missing. Restitution is
 * a ratio of SPEEDS; kinetic energy goes as v², and so does the height a
 * given speed buys you. So a ball with e = 0.8 comes back to 64% of its
 * drop, not 80% -- which is the single most common mistake made about
 * restitution, and part five of the series spends a scene on it. A figure
 * in the same series that quietly drew `h · e` was teaching the mistake in
 * the margin while the narration corrected it in the middle.
 *
 * Part one's three arcs are labelled e = 1, e = 0 and 0 < e < 1, where the
 * square changes nothing, changes nothing, and lowers the middle arc to
 * where it should always have been. No caption in either part claims a
 * height, so this makes the drawing right without making any line wrong.
 *
 * A caller who genuinely wants to specify the HEIGHT ratio asks for
 * `e: Math.sqrt(ratio)` and says so at the call site. There is deliberately
 * no second parameter for it: two ways to say the height is how the two
 * drifted apart in the first place.
 */
export function bounceParts(id, {
    x = 300, floor = 1180, h = 420, e = 0.8, z = 40, colour = 'restitution',
    label = null, width = 160,
} = {}) {
    const top = floor - h;
    const heightRatio = e * e;
    const back = floor - h * heightRatio;
    const d = `${M(x, top)} ${Q(x + width * 0.3, floor - h * 0.1, x + width * 0.5, floor)} `
        + `${Q(x + width * 0.7, back + (floor - back) * 0.1, x + width, back)}`;
    const parts = [
        pathPart(`${id}_arc`, d, { stroke: colour, strokeWidth: 6, z, alpha: 0,
                                   lineCap: 'round', trim: { end: 1 } }),
        pathPart(`${id}_floor`, `${M(x - 50, floor)} ${L(x + width + 50, floor)}`,
                 { stroke: 'dim', strokeWidth: 5, z: z - 1, alpha: 0, lineCap: 'round' }),
        // The two heights, as ticks, so the ratio is readable rather than felt.
        pathPart(`${id}_h1`, `${M(x - 36, top)} ${L(x - 10, top)}`,
                 { stroke: 'dim', strokeWidth: 4, z, alpha: 0 }),
        pathPart(`${id}_h2`, `${M(x + width + 10, back)} ${L(x + width + 36, back)}`,
                 { stroke: colour, strokeWidth: 4, z, alpha: 0 }),
    ];
    if (label) {
        parts.push(textPart(`${id}_l`, label, {
            at: [x + width / 2, floor + 56], font: `800 38px ${FONT}`, fill: colour,
            z, alpha: 0, maxWidth: 360 }));
    }
    return {
        parts, ids: parts.map((p) => p.id),
        /** What the figure actually drew, so a label cannot contradict it. */
        e, heightRatio: +heightRatio.toFixed(4),
    };
}

/**
 * A code panel: a dark card with syntax-coloured lines.
 *
 * Lines are authored as `[indent, [[colourName, text], ...]]`, laid out on a
 * fixed advance width rather than measured, because `widthOf` is an estimate
 * and monospace at a known size is the one case where counting characters is
 * exact enough. Used by the cliffhanger here and by parts 2 onward for real.
 */
export function codePanelParts(id, lines, {
    x = 90, y = 600, w = 900, lh = 46, size = 30, z = 30, title = null,
} = {}) {
    const h = lines.length * lh + (title ? 74 : 40) + 28;
    const parts = [
        pathPart(`${id}_bg`, roundRect(x, y, w, h, 22),
                 { fill: 'codeBg', stroke: 'codeLine', strokeWidth: 2, z, alpha: 0 }),
    ];
    if (title) {
        parts.push(textPart(`${id}_t`, title, {
            at: [x + 28, y + 42], font: `700 28px ${FONT}`, fill: 'codeCmt',
            align: 'left', z: z + 1, alpha: 0, maxWidth: w - 56 }));
    }
    const top = y + (title ? 94 : 44);
    // A monospace advance at this size. 0.6 em is the standard figure for the
    // DejaVu/Menlo family the renderer falls back to.
    const adv = size * 0.6;
    lines.forEach(([indent, spans], i) => {
        let cx = x + 28 + indent * adv * 2;
        spans.forEach(([fill, text], j) => {
            parts.push(textPart(`${id}_${i}_${j}`, text, {
                at: [cx, top + i * lh], font: `600 ${size}px "Menlo", "DejaVu Sans Mono", monospace`,
                fill, align: 'left', baseline: 'middle', z: z + 1, alpha: 0 }));
            cx += text.length * adv;
        });
    });
    return {
        parts,
        ids: parts.map((p) => p.id),
        /** The ids of one source line, so the narration can build it line by line. */
        lineIds: (i) => parts.filter((p) => p.id.startsWith(`${id}_${i}_`)).map((p) => p.id),
        bottom: y + h,
    };
}

/**
 * A grid of game cards, for "here is what you can build with this".
 *
 * Each card is a panel, a title and a one-line what-it-teaches. Two columns,
 * because at 1080 wide three columns puts a game name below readable size.
 */
export function gameGridParts(id, games, {
    x = 70, y = 560, w = 940, cols = 2, cardH = 190, gap = 18, z = 20,
} = {}) {
    const cw = (w - gap * (cols - 1)) / cols;
    const parts = [];
    const cards = [];
    games.forEach(([name, what, accent], i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const cx = x + col * (cw + gap);
        const cy = y + row * (cardH + gap);
        const cid = `${id}${i}`;
        parts.push(
            pathPart(`${cid}_bg`, roundRect(cx, cy, cw, cardH, 20),
                     { fill: 'panel', stroke: 'panelLine', strokeWidth: 2, z, alpha: 0 }),
            rectPart(`${cid}_chip`, cw - 36, 8,
                     { at: [cx + cw / 2, cy + 26], fill: accent, z: z + 1, alpha: 0 }),
            textPart(`${cid}_t`, name, {
                at: [cx + 24, cy + 78], font: `800 34px ${FONT}`, fill: 'ink',
                align: 'left', z: z + 2, alpha: 0, maxWidth: cw - 48, lineHeight: 40 }),
            textPart(`${cid}_w`, what, {
                at: [cx + 24, cy + 140], font: `600 25px ${FONT}`, fill: 'dim',
                align: 'left', z: z + 2, alpha: 0, maxWidth: cw - 48, lineHeight: 32 }),
        );
        cards.push([`${cid}_bg`, `${cid}_chip`, `${cid}_t`, `${cid}_w`]);
    });
    return { parts, cards, allIds: cards.flat(),
             bottom: y + Math.ceil(games.length / cols) * (cardH + gap) };
}

/**
 * A numbered step in a list that builds: a chip, a number, a name.
 *
 * The six things a physics step has to do, in order, is the spine of scene
 * seven and of the whole series. One row per thing, revealed as it is said.
 */
export function stepRows(id, steps, {
    x = 80, y = 560, w = 920, h = 104, gap = 12, z = 20,
} = {}) {
    const parts = [];
    const rows = [];
    steps.forEach(([n, name, note, accent], i) => {
        const ry = y + i * (h + gap);
        const rid = `${id}${i}`;
        parts.push(
            pathPart(`${rid}_bg`, roundRect(x, ry, w, h, 18),
                     { fill: 'panel', stroke: 'panelLine', strokeWidth: 2, z, alpha: 0 }),
            ellipsePart(`${rid}_dot`, 26, 26,
                        { at: [x + 48, ry + h / 2], fill: accent, z: z + 1, alpha: 0 }),
            textPart(`${rid}_n`, String(n), {
                at: [x + 48, ry + h / 2], font: `800 28px ${FONT}`, fill: 'bgDeep',
                z: z + 2, alpha: 0 }),
            textPart(`${rid}_t`, name, {
                at: [x + 92, ry + 40], font: `800 33px ${FONT}`, fill: 'ink',
                align: 'left', z: z + 2, alpha: 0, maxWidth: w - 120 }),
            textPart(`${rid}_w`, note, {
                at: [x + 92, ry + 76], font: `600 25px ${FONT}`, fill: 'dim',
                align: 'left', z: z + 2, alpha: 0, maxWidth: w - 120 }),
        );
        rows.push([`${rid}_bg`, `${rid}_dot`, `${rid}_n`, `${rid}_t`, `${rid}_w`]);
    });
    return { parts, rows, rowIds: (i) => rows[i], allIds: rows.flat(),
             bottom: y + steps.length * (h + gap) };
}

/** A formula, centred, in the colour of the quantity it defines. */
export const formulaParts = (id, text, {
    at = [540, 700], fill = 'momentum', size = 58, z = 70, note = null,
} = {}) => [
    pathPart(`${id}_bg`, roundRect(at[0] - 440, at[1] - 56, 880, 112, 20),
             { fill: 'panel', stroke: 'panelLine', strokeWidth: 2, z: z - 1, alpha: 0 }),
    textPart(`${id}_t`, text, { at, font: `800 ${size}px ${FONT}`, fill, z, alpha: 0,
                                maxWidth: 840 }),
    ...(note ? [textPart(`${id}_n`, note, {
        at: [at[0], at[1] + 86], font: `600 27px ${FONT}`, fill: 'dim', z, alpha: 0,
        maxWidth: SAFE.x1 - SAFE.x0 })] : []),
];

/** A heading above the stage. One per board, same place every time. */
export const headingPart = (id, text, { y = 540, fill = 'ink', size = 38 } = {}) =>
    textPart(id, text, { at: [540, y], font: `800 ${size}px ${FONT}`, fill, z: 80,
                         alpha: 0, maxWidth: SAFE.x1 - SAFE.x0, lineHeight: 46 });

/** A big on-screen claim, the kind that carries a muted viewer. */
export const claimParts = (id, text, {
    at = [540, 860], fill = 'ink', size = 72, sub = null,
} = {}) => [
    textPart(`${id}_t`, text, { at, font: `800 ${size}px ${FONT}`, fill, z: 90, alpha: 0,
                                maxWidth: SAFE.x1 - SAFE.x0, lineHeight: size * 1.14 }),
    ...(sub ? [textPart(`${id}_s`, sub, {
        at: [at[0], at[1] + size * 1.3], font: `700 32px ${FONT}`, fill: 'dim', z: 90,
        alpha: 0, maxWidth: SAFE.x1 - SAFE.x0, lineHeight: 42 })] : []),
];

/** A flash: one frame of near-white over everything, for an impact. */
export const flashPart = (id) =>
    rectPart(id, 1080, 1920, { at: [540, 960], fill: 'white', alpha: 0, z: 500 });

export const flash = (target, part, at, { peak = 0.5, span = 0.22 } = {}) => [
    { target, do: 'set', part, channel: 'props.alpha', value: 0, at: t3(at), ease: 'smooth' },
    { target, do: 'set', part, channel: 'props.alpha', value: peak, at: t3(at + span * 0.3),
      ease: 'smooth' },
    { target, do: 'set', part, channel: 'props.alpha', value: 0, at: t3(at + span),
      ease: 'step' },
];

/** Impact rays: short spokes radiating from a point. */
export function impactParts(id, [cx, cy], {
    n = 10, r0 = 70, r1 = 150, fill = 'momentum', z = 300,
} = {}) {
    const parts = [];
    for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + 0.15;
        const long = i % 2 === 0 ? 1 : 0.62;
        parts.push(pathPart(`${id}_${i}`,
            `${M(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0)} `
            + `${L(cx + Math.cos(a) * (r0 + (r1 - r0) * long),
                   cy + Math.sin(a) * (r0 + (r1 - r0) * long))}`,
            { stroke: fill, strokeWidth: 8, z, alpha: 0, lineCap: 'round' }));
    }
    return { parts, ids: parts.map((p) => p.id) };
}

// ---------------------------------------------------------------------------
// Sound
// ---------------------------------------------------------------------------

/**
 * The sound effects, and their resting levels.
 *
 * Declared once so a cue is named rather than numbered at the call site, and
 * so "the whoosh is too loud" is one edit. Levels are deliberately low: the
 * voices are the film and these are punctuation. `24-VOICE-AND-DELIVERY.md`
 * measured a 6.6 dB spread between two Piper voices, so there is no headroom
 * to spend on a transition.
 */
export const SFX = {
    click:  { asset: 'sfxClick',  gain: 0.85 },
    impact: { asset: 'sfxImpact', gain: 0.95 },
    whoosh: { asset: 'sfxWhoosh', gain: 0.38 },
    pop:    { asset: 'sfxPop',    gain: 0.40 },
    tick:   { asset: 'sfxTick',   gain: 0.30 },
    riser:  { asset: 'sfxRiser',  gain: 0.45 },
};

/**
 * The film `assets` block for the cues `make-sfx.mjs` writes.
 *
 * `films/physics/sfx/` is gitignored build output, so a fresh checkout has
 * none of these. A missing audio asset renders the film silent on that cue
 * and reports it, rather than failing — which is the right trade for a
 * decoration, and the reason the film is still watchable without running
 * the script.
 */
export const SFX_ASSETS = Object.fromEntries(
    Object.values(SFX).map(({ asset }) => [asset, {
        kind: 'audio',
        src: `films/physics/sfx/${asset.replace(/^sfx/, '').toLowerCase()}.wav`,
    }]));

/**
 * Turn per-SHOT `sfx` into per-SCENE `audio` cues.
 *
 * A cue's `at` is measured from its SCENE's start, but a sound belongs to a
 * moment in a shot -- the frame the cue strikes, not "11.4 seconds in". So a
 * shot carries `sfx: [['click', 1.62]]` and this lifts it, adding up the
 * durations in front of it.
 *
 * It must run AFTER `fitShots`, because the durations it sums are the ones
 * `fitShots` derives from the narration. Running it first puts every cue
 * after the first at the wrong moment, and nothing would report it: audio
 * has no staging check, and a sound 400ms late still sounds like a sound.
 *
 * `sfx` is not a key `schema.js` knows, so it is deleted on the way out --
 * otherwise `validate` reports every shot that uses one.
 */
export function liftSfx(film) {
    for (const scene of film.scenes ?? []) {
        const cues = [];
        let t = 0;
        for (const shot of scene.shots ?? []) {
            for (const [name, at, gainOver] of shot.sfx ?? []) {
                const cue = SFX[name];
                if (!cue) throw new Error(`liftSfx: no sound effect "${name}"`);
                cues.push({ asset: cue.asset, at: +(t + at).toFixed(3),
                            gain: gainOver ?? cue.gain, bus: 'sfx' });
            }
            delete shot.sfx;
            t += shot.duration ?? 0;
        }
        if (cues.length) scene.audio = [...(scene.audio ?? []), ...cues];
    }
    return film;
}

// ---------------------------------------------------------------------------
// Shot fitting
// ---------------------------------------------------------------------------

/**
 * Derive every shot's length from the narration it carries.
 *
 * `27-RETENTION.md` rule 3: write the narration, then derive the shot length
 * from it. The reverse order is the documented cause of the geology series
 * running 54% speech against the references' 73%.
 *
 * Three numbers differ from the earlier series, and all three are this
 * series being motion graphics rather than a field guide:
 *
 *   - `pad` 0.5 s, against 0.85. The pad is breathing room after a line.
 *     Cut because the measured defect was slack, and because fast cutting is
 *     what this subject looks like when it is done well.
 *   - `min` 2.4 s, against 2.6. The floor exists so a shot is not
 *     subliminal, not so every short line is followed by a pause -- "Same
 *     rules. Different game." is a deliberate two-beat and must not be
 *     padded into three seconds of silence.
 *   - `hookPad` 0.2 s, unchanged and for the same reason: everywhere else a
 *     tail is breathing, in the opening it is an exit.
 */
export function fitShots(film, { pad = 0.46, min = 2.4, hookPad = 0.2 } = {}) {
    let first = true;
    for (const scene of film.scenes ?? []) {
        for (const shot of scene.shots ?? []) {
            const tail = first ? hookPad : pad;
            first = false;
            let needed = min;
            for (const line of shot.dialogue ?? []) {
                // The SPEAKER's rate: Bolt is cast at 1.06, so a flat
                // estimate OVER-sizes every shot he is in. Same mechanism as
                // the Rajabu defect in `30-STRUCTURE-SERIES.md`, opposite sign.
                needed = Math.max(needed,
                    (line.at ?? 0)
                        + estimateLine(line.text, { lang: 'en', rate: rateOf(line.speaker) })
                        + tail);
            }
            for (const a of shot.actions ?? []) {
                // A blink is decoration scattered across a GUESSED duration.
                // Sizing the shot to fit one makes the guess self-fulfilling,
                // which is why `fitShots` elsewhere skips `play`/`blink` --
                // these rigs blink with `set`, so the skip has to name that.
                if (a.do === 'set' && a.channel === 'props.lid') continue;
                if (a.do === 'set' && a.part?.startsWith('glint')) continue;
                if (a.do === 'play' && a.action === 'blink') continue;
                // A flow loop is deliberately longer than its shot.
                if (a.do === 'set' && a.channel === 'props.flow') continue;
                needed = Math.max(needed, (a.at ?? 0) + (a.for ?? 0) + 0.35);
            }
            shot.duration = +needed.toFixed(2);
        }
    }
    return film;
}

export {
    L, M, Q, C, Z, SAFE, TYPE, FONT, arrowPath, build, conceal, curveArrow,
    ellipsePart, pathPart, poly, pop, rectPart, reveal, smooth, textPart,
};
