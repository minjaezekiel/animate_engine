/**
 * Part 3 — "Which way did it hit?".
 *
 * The collision normal, properly: how to find it for a circle, for a wall
 * and for a corner; how to make it a unit vector and what happens when you
 * cannot; the dot product as the one tool that splits a velocity in two;
 * and the reflection formula that falls out of all of it.
 *
 * ## The one convention, stated once and never broken
 *
 * > **n points away from the surface, toward the object.**
 *
 * Every sign in this part depends on it. `v · n` is then negative when the
 * object is heading INTO the surface and positive when it is already
 * leaving, which is exactly the test the "sticky wall" bug is missing. Half
 * the collision code on the internet is wrong by a sign, and it is wrong
 * because the convention was never written down. So it is said out loud in
 * the narration, drawn the same way in every figure, and `wallParts`
 * derives it from the wall rather than taking it as a parameter.
 *
 * ## The physics, and its conditions
 *
 * - **For two circles the normal is the line through the centres.** Exact.
 * - **A unit vector is the vector over its own length.** Exact, and
 *   undefined at length zero — which is a real crash, not a curiosity: two
 *   circles spawned at the same point, or a ball exactly on a corner.
 * - **For a flat wall the normal is the wall's perpendicular.** Exact.
 * - **For a corner it is the line from the corner to the centre.** Exact in
 *   the vertex region of a circle-polygon test, which is the case being
 *   drawn.
 * - **t = (−n_y, n_x) is perpendicular to n.** Exact, and it is a rotation
 *   by a quarter turn rather than a formula to memorise.
 * - **v = (v·n) n + (v·t) t** for a unit, perpendicular pair. Exact.
 * - **v′ = v − 2 (v·n) n** reflects off a surface that does not move, loses
 *   no energy, and has no friction. All three conditions are said. With
 *   restitution it is v′ = v − (1+e)(v·n) n, which the film states as the
 *   bridge to part five rather than hiding.
 */
import {
    BAND, BOLT, FONT, GAME_PALETTE, L, M, NOVA, SAFE, VECTOR, Z, angleParts,
    ballBlinks, bannerParts, board, build, castBoard, claimParts, codePanelParts,
    compareParts, conceal, countTo, derivationParts, diagramBall, diagramBallIds,
    ellipsePart, endCard, express, fitShots, flash, flashPart, formulaParts,
    gridScenery, headingPart, hideBall, hookTitle, impactParts, liftSfx, noteParts,
    normalParts, pathPart, pop, readoutParts, rectPart, rest, reveal, roll,
    roundRect, SFX_ASSETS, shiftBy, showBall, spinMark, squash, stepRows, textPart,
    titleAt, vectorArrow, wallParts,
} from './common.mjs';
import { META, voicesFor } from '../lib/physics.mjs';

const PART = 3;

const TALK_Y = 950;
const TALK_S = 0.82;
const LEFT = 290;
const RIGHT = 790;

// ---------------------------------------------------------------------------
// The narration
// ---------------------------------------------------------------------------

const P = [
    /* 0  BOLT   */ 'I clipped the edge of her. Watch where she goes.',
    /* 1  NOVA   */ 'Sideways. You were going right, and I went up.',
    /* 2  VECTOR */ 'Because a collision never pushes the way you were travelling.',
    /* 3  VECTOR */ 'It pushes along one line. Finding that line is this whole part.',
    /* 4  VECTOR */ 'Two circles. Draw through both centres at the moment they touch.',
    /* 5  VECTOR */ 'Subtract the positions and you already have it: dee-ex, dee-why.',
    /* 6  VECTOR */ 'But that arrow is as long as the gap. You want direction, not distance.',
    /* 7  VECTOR */ 'So divide it by its own length. Now it is exactly one unit long.',
    /* 8  VECTOR */ 'A unit vector. Pure direction, nothing else.',
    /* 9  BOLT   */ 'And if the length is zero?',
    /*10  VECTOR */ 'Then you divide by zero and crash. Two circles on the same spot.',
    /*11  VECTOR */ 'Check for it, pick any direction at all, and carry on.',
    /*12  VECTOR */ 'Walls are easier. The normal is the wall, turned a quarter turn.',
    /*13  VECTOR */ 'Always away from the surface, toward the ball. Always that way round.',
    /*14  VECTOR */ 'Corners are the odd one: no flat face to turn.',
    /*15  VECTOR */ 'So use the corner itself. Corner to centre, over its length.',
    /*16  NOVA   */ 'And the sideways direction?',
    /*17  VECTOR */ 'Swap the two numbers and flip one sign. That is a quarter turn.',
    /*18  VECTOR */ 'Normal and tangent. Perpendicular, both one unit long.',
    /*19  VECTOR */ 'Now the one tool that uses them: the dot product.',
    /*20  VECTOR */ 'Multiply the exes, multiply the whys, add them. One number out.',
    /*21  VECTOR */ 'Against a unit vector that number means something exact.',
    /*22  VECTOR */ 'How much of the first one points along it.',
    /*23  VECTOR */ 'Vee dot en is your speed into the surface. Vee dot tee is across it.',
    /*24  VECTOR */ 'Two numbers, and you have taken the velocity apart.',
    /*25  VECTOR */ 'Flip the normal part, keep the sideways part, and you have a '
        + 'bounce.',
    /*26  VECTOR */ 'That is the whole reflection formula. Subtract twice the normal '
        + 'part.',
    /*27  BOLT   */ 'Twice? Why twice?',
    /*28  VECTOR */ 'Once to stop. Twice to send it back out the other side.',
    /*29  VECTOR */ 'One warning, and it is the bug you will actually ship.',
    /*30  VECTOR */ 'Only bounce when vee dot en is negative — when it is heading in.',
    /*31  VECTOR */ 'Miss it and a ball on its way out gets flipped back. It sticks and shakes.',
    /*32  VECTOR */ 'Seven lines of Python, and every collision goes through them.',
    /*33  VECTOR */ 'Four of six. You can find a hit, and the direction it pushed.',
    /*34  NOVA   */ 'But neither of us is a wall. We both move.',
    /*35  VECTOR */ 'Next time: impulses. One line that handles any two masses at once.',
    /*36  VECTOR */ "Follow, and I'll see you in part four.",
];

const T = {
    kicker: `GAME PHYSICS  ·  PART ${PART}`,
    title: 'Which way did it hit?',
    sub: 'normals · unit vectors · the dot product',

    hookN: 'she left along the NORMAL, not along his path',

    lH: 'TWO CIRCLES',
    lF: 'n  =  ( bx − ax ,  by − ay )',
    lN: 'subtract the positions. that is the direction, before you shorten it.',

    uH: 'MAKE IT ONE UNIT LONG',
    uF: 'n  =  ( dx / d ,  dy / d )',
    uN: 'divide a vector by its own length and you are left with pure direction',
    uLen: 'LENGTH',

    zH: 'THE ONE THAT CRASHES',
    zL: ['LENGTH IS ZERO', 'two circles on exactly\nthe same spot.\ndividing by it crashes.'],
    zR: ['SO CHECK FIRST', 'if d is zero, pick any\ndirection at all and\ncarry on. it is a tie.'],

    wH: 'A FLAT WALL',
    wN: 'the wall, turned a quarter turn — away from the surface, toward the ball',
    wRule: 'ALWAYS away from the surface. every sign later depends on it.',

    cH: 'A CORNER',
    cN: 'no flat face to turn. use the corner itself: corner to centre, over its length.',

    tH: 'NORMAL  AND  TANGENT',
    tF: 't  =  ( − ny ,  nx )',
    tN: 'swap the two numbers, flip one sign. perpendicular, and still one unit long.',

    dH: 'THE DOT PRODUCT',
    dF: 'a · b   =   ax bx  +  ay by',
    dN: 'two vectors in, one number out',
    dKey: 'against a UNIT vector it is how much of a points along b',
    dRead: 'v · n',

    sH: 'TAKE THE VELOCITY APART',
    sN: 'v · n  into the surface      ·      v · t  across it',
    sPay: 'two numbers, and the velocity is in pieces you can work with',

    rH: 'THE BOUNCE',
    rF: "v'  =  v  −  2 ( v · n ) n",
    rN: 'flip the normal part. leave the sideways part alone.',
    rWhy: 'once to stop it. twice to send it back.',
    rCond: 'a wall that does not move  ·  nothing lost  ·  no friction',
    rE: "with bounciness:   v'  =  v  −  ( 1 + e )( v · n ) n      ·      part 5",

    gH: 'THE BUG YOU WILL SHIP',
    gF: 'if  v · n  <  0 :   bounce',
    gN: 'heading in, so bounce it. already leaving, so leave it alone.',
    gBad: 'without the check a ball on its way out gets flipped back in — it sticks '
        + 'to the wall and shakes.',

    stH: 'FOUR OF SIX',
    steps: [
        [1, 'POSITION', 'where is it', '#36e3ff'],
        [2, 'VELOCITY', 'how fast, and which way', '#36e3ff'],
        [3, 'DETECTION', 'did they touch', '#ffd23d'],
        [4, 'NORMAL', 'which way did the hit push  —  this part', '#ff4d8d'],
        [5, 'RESPONSE', 'change both velocities', '#8e7bff'],
        [6, 'RESTITUTION', 'how much bounce survives', '#3ddc84'],
    ],

    codeT: '# the normal, for any two circles',
    nextK: `NEXT  ·  PART ${PART + 1}`,
    next: 'Impulses: the one line\nthat does every collision',
    nextN: 'neither of them is a wall',
};

/** The normal, in Python. Including the check that stops it crashing. */
const CODE = [
    [0, [['codeFn', 'dx, dy'], ['ink', ' = b.x - a.x, b.y - a.y']]],
    [0, [['codeFn', 'd'], ['ink', '      = math.hypot(dx, dy)']]],
    [0, [['codeKey', 'if'], ['ink', ' d == '], ['codeNum', '0'], ['ink', ':']]],
    [1, [['codeFn', 'nx, ny'], ['ink', ' = '], ['codeNum', '1.0'], ['ink', ', '],
         ['codeNum', '0.0'], ['codeCmt', '   # a tie. pick a side.']]],
    [0, [['codeKey', 'else'], ['ink', ':']]],
    [1, [['codeFn', 'nx, ny'], ['ink', ' = dx / d, dy / d']]],
    [0, [['codeFn', 'tx, ty'], ['ink', ' = -ny, nx'], ['codeCmt', '      # the tangent']]],
];

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

/** SCENE 1 — the hook: she leaves at an angle nobody expected. */
function boardHook() {
    const rays = impactParts('hr', [640, 930], { n: 10, r0: 60, r1: 140 });
    // Where she will go, drawn after she goes: the line she actually left
    // along, against the line he was travelling along.
    const her = vectorArrow('hv', [700, 840], [900, 560], { width: 11, head: 30,
                                                            fill: 'normal' });
    const his = vectorArrow('hw', [250, 1010], [470, 1010], { width: 9, head: 24,
                                                              fill: 'momentum' });
    return {
        ...board('hook', [
            ...his.parts, ...her.parts, ...rays.parts, flashPart('fl'),
            ...noteParts('hn', T.hookN, { at: [540, 1270], fill: 'normal', size: 32 }),
            ...hookTitle(T.kicker, T.title, T.sub),
        ]),
        rays, her, his,
    };
}

/** SCENE 2 — the line through both centres, and the subtraction that finds it. */
function boardLine() {
    const A = [360, 840];
    const B = [690, 960];
    const n = normalParts('ln', A, B, { r: 104, extend: 120, tangent: false });
    return {
        ...board('line', [
            headingPart('h', T.lH, { y: BAND.heading, fill: 'normal', size: 50 }),
            ...diagramBall('la', A, 104),
            ...diagramBall('lb', B, 104, { base: 'nova', baseDark: 'novaDark' }),
            ...n.parts,
            ...formulaParts('lf', T.lF, { at: [540, BAND.caption0 + 20], fill: 'normal',
                                          size: 42, note: T.lN }),
        ]),
        n,
    };
}

/**
 * SCENE 3 — normalising, with the length counted down to one.
 *
 * The readout is the teaching. "Divide by its own length" is a sentence; a
 * number falling from 352 to 1.00 while the arrow shrinks to a stub is the
 * thing the sentence is about.
 */
function boardUnit() {
    const O = [300, 880];
    /**
     * Two arrows, not one arrow scaled.
     *
     * `transform.sx` scales a node about its OWN origin, and a vector arrow
     * is a path drawn in absolute frame coordinates with its node left at
     * [0, 0] -- so scaling it shrinks it toward the top-left corner of the
     * frame instead of toward its own tail. The first version of this board
     * did exactly that and left a magenta stub up behind the banner.
     *
     * Two states and a crossfade says the same thing and cannot be wrong:
     * the long arrow goes, the unit arrow arrives from the same tail, and
     * the readout falling from 352 to 1 is what connects them.
     */
    const long = vectorArrow('ua', O, [820, 1070], { width: 11, head: 30,
                                                     fill: 'normal' });
    // Same direction, one notional unit long -- drawn at a readable size,
    // because "one unit" is a statement about the maths and not about pixels.
    const ux = (820 - O[0]) / Math.hypot(820 - O[0], 1070 - O[1]);
    const uy = (1070 - O[1]) / Math.hypot(820 - O[0], 1070 - O[1]);
    const unit = vectorArrow('ub', O, [O[0] + ux * 150, O[1] + uy * 150],
                             { width: 11, head: 28, fill: 'normal' });
    const read = readoutParts('ur', T.uLen, { at: [540, 1180], initial: '352',
                                              fill: 'normal', chipW: 400 });
    return {
        ...board('unit', [
            headingPart('h', T.uH, { y: BAND.heading, fill: 'normal', size: 46 }),
            ...formulaParts('uf', T.uF, { at: [540, 640], fill: 'normal', size: 44 }),
            ...long.parts, ...unit.parts, ...read.parts,
            ...noteParts('un', T.uN, { at: [540, BAND.caption2], fill: 'dim',
                                       size: 28 }),
        ]),
        long, unit, read, O,
    };
}

/** SCENE 4 — the divide by zero. */
function boardZero() {
    const cmp = compareParts('zc', T.zL, T.zR, { y: 700, h: 330, accentL: 'loss',
                                                 accentR: 'restitution' });
    return {
        ...board('zero', [
            headingPart('h', T.zH, { y: BAND.heading, fill: 'loss', size: 46 }),
            ...cmp.parts,
            // Two circles exactly on top of each other: the state that has no
            // direction to find, drawn rather than described.
            ...diagramBall('za', [490, 1180], 70),
            ...diagramBall('zb', [540, 1180], 70, { base: 'nova', baseDark: 'novaDark' }),
            ...noteParts('zn', 'there is no line through one point',
                         { at: [540, BAND.caption2 + 20], fill: 'dim', size: 28 }),
        ]),
        cmp,
    };
}

/** SCENE 5 — a flat wall, and the convention every later sign depends on. */
function boardWall() {
    const w = wallParts('wl', [180, 1140], [900, 1140], { thickness: 20,
                                                          toward: [540, 790],
                                                          normalLen: 190 });
    return {
        ...board('wall', [
            headingPart('h', T.wH, { y: BAND.heading, fill: 'normal', size: 50 }),
            ...w.parts,
            ...diagramBall('wb', [540, 790], 96),
            ...noteParts('wn', T.wN, { at: [540, BAND.caption0], fill: 'dim',
                                       size: 28 }),
            ...noteParts('wr', T.wRule, { at: [540, BAND.caption2], fill: 'normal',
                                          size: 30 }),
        ]),
        w,
    };
}

/** SCENE 6 — a corner: no face to turn, so use the point. */
function boardCorner() {
    const C = [640, 1060];
    const B = [400, 800];
    const box = pathPart('cx', `${M(640, 1060)} ${L(960, 1060)} ${L(960, 1300)} `
        + `${L(640, 1300)} ${Z}`,
        { fill: 'robotDark', z: 20, alpha: 0 });
    const dx = B[0] - C[0];
    const dy = B[1] - C[1];
    const len = Math.hypot(dx, dy);
    const arrow = vectorArrow('cn', C,
        [C[0] + (dx / len) * 300, C[1] + (dy / len) * 300],
        { width: 10, head: 28, fill: 'normal' });
    return {
        ...board('corner', [
            headingPart('h', T.cH, { y: BAND.heading, fill: 'normal', size: 50 }),
            box,
            ellipsePart('cp', 14, 14, { at: C, fill: 'ink', z: 40, alpha: 0 }),
            ...arrow.parts,
            ...diagramBall('cb', B, 96),
            ...noteParts('cn2', T.cN, { at: [540, BAND.caption1], fill: 'dim',
                                        size: 28 }),
        ]),
        arrow, boxId: 'cx',
    };
}

/** SCENE 7 — the tangent, as a quarter turn. */
function boardTan() {
    const O = [540, 880];
    const n = vectorArrow('tn', O, [790, 760], { width: 11, head: 30, fill: 'normal',
                                                 label: 'n', labelOff: 40 });
    // t = (-ny, nx): the same arrow turned a quarter turn, which is what the
    // sign swap IS. Derived from n's own components so the figure cannot
    // show a tangent that is not perpendicular.
    const d = [790 - O[0], 760 - O[1]];
    const t = vectorArrow('tt', O, [O[0] - d[1], O[1] + d[0]],
                          { width: 11, head: 30, fill: 'tangent', label: 't',
                            labelOff: 40 });
    const ang = angleParts('ta', O, Math.atan2(d[1], d[0]),
                           Math.atan2(d[0], -d[1]), { r: 120, legs: 0, fill: 'dim',
                                                      label: '90°', width: 4 });
    return {
        ...board('tan', [
            headingPart('h', T.tH, { y: BAND.heading, fill: 'ink', size: 46 }),
            ...n.parts, ...t.parts, ...ang.parts,
            ...formulaParts('tf', T.tF, { at: [540, BAND.caption0 + 10],
                                          fill: 'tangent', size: 46, note: T.tN }),
        ]),
        n, t, ang,
    };
}

/** SCENE 8 — the dot product, defined and then given its meaning. */
function boardDot() {
    /**
     * v and n have to point in CLEARLY different directions.
     *
     * The first version had them about fifteen degrees apart, which makes
     * the projection almost exactly as long as v and the perpendicular drop
     * about four pixels long -- a picture of two parallel arrows, teaching
     * the opposite of what the dot product is for. Thirty-two degrees is
     * enough that the shadow is visibly shorter than the thing casting it.
     */
    const O = [250, 1030];
    const TIP = [730, 730];
    const v = vectorArrow('dv', O, TIP, { width: 11, head: 30, fill: 'velocity',
                                          label: 'v', labelOff: 46 });
    const n = vectorArrow('dn', O, [490, 1030], { width: 11, head: 26,
                                                  fill: 'normal', label: 'n',
                                                  labelOff: -44 });
    // The shadow v casts on n's line, and the drop that casts it.
    const drop = pathPart('dd', `${M(TIP[0], TIP[1])} ${L(TIP[0], 1030)}`,
                          { stroke: 'dim', strokeWidth: 3, z: 54, alpha: 0 });
    const proj = pathPart('dp', `${M(O[0], 1098)} ${L(TIP[0], 1098)}`,
                          { stroke: 'momentum', strokeWidth: 16, z: 55, alpha: 0,
                            lineCap: 'round' });
    const tick = (x) => pathPart(`dt${x}`, `${M(x, 1070)} ${L(x, 1126)}`,
                                 { stroke: 'momentum', strokeWidth: 3, z: 55,
                                   alpha: 0 });
    const read = readoutParts('dr', T.dRead, { at: [540, 1235], initial: '0.00',
                                               fill: 'momentum', chipW: 360 });
    return {
        ...board('dot', [
            headingPart('h', T.dH, { y: BAND.heading, fill: 'momentum', size: 50 }),
            ...formulaParts('df', T.dF, { at: [540, 640], fill: 'momentum', size: 44,
                                          note: T.dN }),
            ...v.parts, ...n.parts, drop, proj, tick(O[0]), tick(TIP[0]),
            ...read.parts,
            ...noteParts('dk', T.dKey, { at: [540, BAND.caption2 + 20],
                                         fill: 'momentum', size: 29 }),
        ]),
        v, n, read, projIds: ['dd', 'dp', `dt${O[0]}`, `dt${TIP[0]}`],
    };
}

/** SCENE 9 — the split, and the bounce it makes possible. */
function boardSplit() {
    /**
     * The components are drawn from v's TAIL, as the two sides of the
     * rectangle whose diagonal is v.
     *
     * The first version drew them from the contact point with the normal
     * component pointing AWAY from the wall, under narration that calls it
     * "into the surface". That is the reflected component, not v's own, and
     * a figure that contradicts its own voice-over is worse than no figure.
     * From the tail the two legs add up to v, visibly, which is the whole
     * claim: v = (v·n) n + (v·t) t.
     */
    const TAIL = [200, 760];
    const HIT = [460, 1120];
    const w = wallParts('sw', [100, 1120], [980, 1120], { thickness: 20,
                                                          toward: [540, 820],
                                                          normal: false });
    const vin = vectorArrow('si', TAIL, HIT, { width: 11, head: 30,
                                               fill: 'velocity', label: 'v',
                                               labelOff: -54 });
    // Straight down from the tail: the part of v that is heading INTO the
    // wall. Same length as the drop, so the two legs really do add to v.
    const nComp = vectorArrow('sn', TAIL, [TAIL[0], HIT[1]], { width: 9, head: 24,
                                                               fill: 'normal' });
    const tComp = vectorArrow('st', TAIL, [HIT[0], TAIL[1]], { width: 9, head: 24,
                                                               fill: 'tangent' });
    const out = vectorArrow('so', HIT, [720, 760], { width: 11, head: 30,
                                                     fill: 'restitution' });
    return {
        ...board('split', [
            headingPart('h', T.sH, { y: BAND.heading, fill: 'ink', size: 46 }),
            ...w.parts, ...nComp.parts, ...tComp.parts, ...vin.parts, ...out.parts,
            textPart('snl', 'v · n', { at: [128, 950], font: `800 30px ${FONT}`,
                                       fill: 'normal', z: 92, alpha: 0,
                                       maxWidth: 200 }),
            textPart('stl', 'v · t', { at: [330, 716], font: `800 30px ${FONT}`,
                                       fill: 'tangent', z: 92, alpha: 0,
                                       maxWidth: 200 }),
            textPart('sol', 'the bounce', { at: [790, 820], font: `800 30px ${FONT}`,
                                            fill: 'restitution', z: 92, alpha: 0,
                                            maxWidth: 260 }),
            ...noteParts('sn2', T.sN, { at: [540, BAND.caption0], fill: 'dim',
                                        size: 28 }),
            ...noteParts('sp', T.sPay, { at: [540, BAND.caption2], fill: 'ink',
                                         size: 30 }),
        ]),
        w, vin, nComp, tComp, out,
    };
}

/** SCENE 10 — the formula, derived in three lines. */
function boardRefl() {
    const der = derivationParts('rd', [
        ['the part going in:      ( v · n ) n', false],
        ['cancel it:                 v  −  ( v · n ) n', false],
        ['cancel it twice:        v  −  2 ( v · n ) n', true],
    ], { y: 700, lh: 92, size: 38 });
    return {
        ...board('refl', [
            headingPart('h', T.rH, { y: BAND.heading, fill: 'restitution', size: 50 }),
            ...der.parts,
            ...formulaParts('rf', T.rF, { at: [540, 1060], fill: 'restitution',
                                          size: 50, note: T.rWhy }),
            ...noteParts('rc', T.rCond, { at: [540, BAND.caption1 + 10], fill: 'dim',
                                          size: 27 }),
            ...noteParts('re', T.rE, { at: [540, BAND.caption2 + 20],
                                       fill: 'momentum', size: 27 }),
        ]),
        der,
    };
}

/** SCENE 11 — the sign check, and the bug without it. */
function boardGuard() {
    const w = wallParts('gw', [120, 1060], [960, 1060], { thickness: 20,
                                                          toward: [540, 820],
                                                          normalLen: 150 });
    const inArrow = vectorArrow('gi', [350, 960], [440, 1090], { width: 10, head: 26,
                                                                 fill: 'loss' });
    const outArrow = vectorArrow('go', [770, 960], [880, 790], { width: 10, head: 26,
                                                                 fill: 'restitution' });
    return {
        ...board('guard', [
            headingPart('h', T.gH, { y: BAND.heading, fill: 'loss', size: 46 }),
            ...formulaParts('gf', T.gF, { at: [540, 640], fill: 'restitution',
                                          size: 46, note: T.gN }),
            ...w.parts, ...inArrow.parts, ...outArrow.parts,
            // The arrows need something to be the velocity OF. Two small
            // balls, one at each arrow's business end, so "heading in" and
            // "already leaving" are states of an object rather than of a line.
            ...diagramBall('gba', [350, 960], 62),
            ...diagramBall('gbb', [770, 960], 62, { base: 'nova',
                                                    baseDark: 'novaDark' }),
            textPart('gil', 'v · n  <  0', { at: [230, 870], font: `700 28px ${FONT}`,
                                             fill: 'loss', z: 92, alpha: 0,
                                             maxWidth: 280 }),
            textPart('gol', 'v · n  >  0', { at: [900, 1090], font: `700 28px ${FONT}`,
                                             fill: 'restitution', z: 92, alpha: 0,
                                             maxWidth: 280 }),
            ...noteParts('gb', T.gBad, { at: [540, BAND.caption1 + 20], fill: 'loss',
                                         size: 28 }),
        ]),
        w, inArrow, outArrow,
    };
}

/** SCENE 12 — the code, all seven lines of it. */
function boardCode() {
    const code = codePanelParts('cd', CODE, { x: 70, y: 620, w: 940, lh: 48, size: 27,
                                              title: T.codeT });
    return { ...board('code', [...code.parts]), code };
}

/** SCENE 13 — four of six. */
function boardSteps() {
    const rows = stepRows('sr', T.steps, { y: 580, h: 96, gap: 11 });
    return {
        ...board('steps', [
            headingPart('h', T.stH, { y: 512, fill: 'normal', size: 44 }),
            ...rows.parts,
        ]),
        rows,
    };
}

/** SCENE 14 — the cliffhanger: two movers, no wall. */
function boardNext() {
    const A = [360, 860];
    const B = [690, 980];
    const n = normalParts('nn', A, B, { r: 104, extend: 110, tangent: false });
    const a1 = vectorArrow('x1', [360, 860], [200, 700], { width: 9, head: 24,
                                                           fill: 'velocity' }).parts;
    const a2 = vectorArrow('x2', [690, 980], [860, 1140], { width: 9, head: 24,
                                                            fill: 'velocity' }).parts;
    return {
        ...board('next', [
            ...diagramBall('xa', A, 104),
            ...diagramBall('xb', B, 104, { base: 'nova', baseDark: 'novaDark' }),
            ...n.parts, ...a1, ...a2,
            ...noteParts('xn', T.nextN, { at: [540, 1210], fill: 'dim', size: 30 }),
            textPart('nk', T.nextK, { at: [540, 1290], font: `700 32px ${FONT}`,
                                      fill: 'velocity', z: 90, alpha: 0 }),
            textPart('nt', 'both of them move', { at: [540, 1370],
                                                  font: `800 50px ${FONT}`, fill: 'ink',
                                                  z: 90, alpha: 0,
                                                  maxWidth: SAFE.x1 - SAFE.x0 }),
        ]),
        n, aIds: [...a1, ...a2].map((p) => p.id),
    };
}

// ---------------------------------------------------------------------------
// Dialogue
// ---------------------------------------------------------------------------

const vo = (text, at = 0.2) =>
    ({ speaker: 'vector', text, at, lipsync: false, subtitle: true });
const says = (speaker, text, at = 0.25) =>
    ({ speaker, text, at, lipsync: true, subtitle: true });
const offstage = (as) => ({ character: as, as, at: [540, 960], scale: 1, alpha: 0,
                            z: -900 });

// ---------------------------------------------------------------------------
// The part
// ---------------------------------------------------------------------------

export function partThree() {
    const hook = boardHook();
    const line = boardLine();
    const unit = boardUnit();
    const zero = boardZero();
    const wall = boardWall();
    const corner = boardCorner();
    const tan = boardTan();
    const dot = boardDot();
    const split = boardSplit();
    const refl = boardRefl();
    const guard = boardGuard();
    const code = boardCode();
    const steps = boardSteps();
    const nxt = boardNext();
    const card = endCard(T.next, PART);
    const ban = bannerParts(PART);

    const boards = [hook, line, unit, zero, wall, corner, tan, dot, split, refl,
                    guard, code, steps, nxt,
                    board('card', card.parts), board('ban', ban)];

    const characters = { bolt: BOLT, nova: NOVA, vector: VECTOR };
    for (const b of boards) {
        characters[b.name] = { role: 'effect', palette: 'game', parts: b.parts };
    }
    const withBan = (cast) => [...cast, castBoard('ban', { alpha: 1 })];
    const grid = gridScenery();
    const scenes = [];

    // --- SCENE 1 — the hook ------------------------------------------------
    scenes.push({
        id: 'hook', palette: 'game',
        background: { color: '#04060f' },
        transitionIn: { kind: 'fade', from: '#000000', duration: 0.5 },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            castBoard('hook', { alpha: 1 }),
            { character: 'bolt', as: 'bolt', at: [200, 1010], scale: 0.8 },
            // High and right, so she has frame to be thrown into.
            { character: 'nova', as: 'nova', at: [700, 840], scale: 0.8 },
            { character: 'vector', as: 'vector', at: [880, 1260], scale: 0.38,
              alpha: 0 },
        ]),
        shots: [
            { id: 'h0', sfx: [['whoosh', 0.45], ['impact', 1.1], ['riser', 2.4, 0.32]],
              dialogue: [says('bolt', P[0], 0.28)],
              actions: [
                  rest('bolt'), rest('nova'), rest('vector'),
                  ...express('bolt', 'sure', 0.3, { hold: 0.8 }),
                  // He goes right and clips her underside.
                  ...roll('bolt', { from: [200, 1010], to: [560, 1010], at: 0.45,
                                    span: 0.65, scale: 0.8, squash: false }),
                  ...squash('bolt', 1.08, { scale: 0.8, amount: 0.18, span: 0.07 }),
                  ...flash('hook', 'fl', 1.1, { peak: 0.3, span: 0.18 }),
                  ...build('hook', hook.rays.ids, 1.1, { gap: 0.01, span: 0.1 }),
                  ...hook.rays.ids.flatMap((id) => conceal('hook', id, 1.26,
                                                           { span: 0.2 })),
                  // And she leaves UP AND RIGHT, which is nothing like the
                  // way he was going. That mismatch is the whole hook.
                  { target: 'nova', do: 'move', to: [900, 560], at: 1.14, for: 0.7,
                    ease: 'smooth' },
                  ...spinMark('nova', 1.14, 0.7, 0.8),
                  ...express('nova', 'shock', 1.2, { hold: 1.2 }),
              ] },
            { id: 'h1', sfx: [['pop', 0.9]], dialogue: [says('nova', P[1], 0.22)],
              actions: [
                  ...express('nova', 'doubt', 0.3, { hold: 1.4 }),
                  ...hook.his.ids.flatMap((id) => reveal('hook', id, 0.9,
                                                         { span: 0.3 })),
                  ...hook.her.ids.flatMap((id) => reveal('hook', id, 1.5,
                                                         { span: 0.3 })),
                  ...reveal('hook', 'hn', 2.1, { span: 0.4 }),
                  ...ballBlinks('bolt', 4.6, 11),
              ] },
            { id: 'h2', sfx: [['pop', 0.1]], dialogue: [says('vector', P[2], 0.24)],
              actions: [
                  { target: 'vector', do: 'show', at: 0.1, for: 0.35 },
                  ...express('vector', 'keen', 0.4, { hold: 1.6 }),
                  ...build('hook', ['kicker', 'title', 'titlesub'], titleAt(P[2]),
                           { gap: 0.2, span: 0.45 }),
                  ...ballBlinks('nova', 5.0, 97),
              ] },
        ],
    });

    // --- SCENE 2 — the line through both centres ---------------------------
    scenes.push({
        id: 'line', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('line', { alpha: 1 })]),
        shots: [
            { id: 'l0', sfx: [['whoosh', 0], ['pop', 0.9]], dialogue: [vo(P[3], 0.2)],
              actions: [
                  ...reveal('line', 'h', 0.15, { span: 0.35 }),
                  ...showBall('line', 'la', 0.5),
                  ...showBall('line', 'lb', 0.7),
              ] },
            { id: 'l1', sfx: [['tick', 0.3], ['pop', 1.4]], dialogue: [vo(P[4], 0.2)],
              actions: [
                  ...build('line', line.n.ids, 0.3, { gap: 0.2, span: 0.4 }),
              ] },
            { id: 'l2', sfx: [['pop', 0.3]], dialogue: [vo(P[5], 0.2)],
              actions: [
                  ...build('line', ['lf_bg', 'lf_t', 'lf_n'], 0.3,
                           { gap: 0.14, span: 0.4 }),
              ] },
        ],
    });

    // --- SCENE 3 — one unit long -------------------------------------------
    scenes.push({
        id: 'unit', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('unit', { alpha: 1 })]),
        shots: [
            { id: 'u0', sfx: [['whoosh', 0], ['pop', 0.5]], dialogue: [vo(P[6], 0.2)],
              actions: [
                  ...reveal('unit', 'h', 0.15, { span: 0.35 }),
                  ...unit.long.ids.flatMap((id) => reveal('unit', id, 0.5,
                                                          { span: 0.35 })),
                  ...build('unit', unit.read.ids, 1.1, { gap: 0.12, span: 0.3 }),
              ] },
            { id: 'u1', sfx: [['tick', 0.4], ['pop', 1.2]], dialogue: [vo(P[7], 0.2)],
              actions: [
                  // The long arrow goes and the short one arrives from the
                  // same tail, with the number falling between them.
                  ...unit.long.ids.flatMap((id) => conceal('unit', id, 0.9,
                                                           { span: 0.35 })),
                  ...unit.unit.ids.flatMap((id) => reveal('unit', id, 1.2,
                                                          { span: 0.35 })),
                  ...countTo('unit', unit.read.value,
                             { from: 352, to: 1, at: 0.4, span: 1.2, decimals: 0 }),
                  ...build('unit', ['uf_bg', 'uf_t'], 1.9, { gap: 0.14, span: 0.4 }),
              ] },
            { id: 'u2', sfx: [['pop', 0.3]], dialogue: [vo(P[8], 0.2)],
              actions: [...pop('unit', 'un', 0.3, { span: 0.45 })] },
        ],
    });

    // --- SCENE 4 — divide by zero ------------------------------------------
    scenes.push({
        id: 'zero', palette: 'game',
        background: { color: '#120a1e' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            { character: 'bolt', as: 'bolt', at: [160, 1300], scale: 0.4 },
            offstage('vector'), castBoard('zero', { alpha: 1 }),
        ]),
        shots: [
            { id: 'z0', sfx: [['whoosh', 0]], dialogue: [says('bolt', P[9], 0.3)],
              actions: [
                  rest('bolt'),
                  ...express('bolt', 'think', 0.3, { hold: 1.0 }),
                  ...reveal('zero', 'h', 0.15, { span: 0.35 }),
                  ...showBall('zero', 'za', 0.6),
                  ...showBall('zero', 'zb', 0.75),
                  ...ballBlinks('bolt', 2.8, 13),
              ] },
            { id: 'z1', sfx: [['pop', 0.3]], dialogue: [vo(P[10], 0.2)],
              actions: [
                  ...build('zero', zero.cmp.left, 0.3, { gap: 0.12, span: 0.32 }),
                  ...reveal('zero', 'zn', 1.3, { span: 0.4 }),
              ] },
            { id: 'z2', sfx: [['pop', 0.3]], dialogue: [vo(P[11], 0.2)],
              actions: [
                  ...build('zero', zero.cmp.right, 0.3, { gap: 0.12, span: 0.32 }),
              ] },
        ],
    });

    // --- SCENE 5 — a flat wall ---------------------------------------------
    scenes.push({
        id: 'wall', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('wall', { alpha: 1 })]),
        shots: [
            { id: 'w0', sfx: [['whoosh', 0], ['pop', 0.6], ['pop', 1.3]],
              dialogue: [vo(P[12], 0.2)],
              actions: [
                  ...reveal('wall', 'h', 0.15, { span: 0.35 }),
                  ...reveal('wall', wall.w.wallId, 0.5, { span: 0.35 }),
                  ...showBall('wall', 'wb', 0.8),
                  ...build('wall', wall.w.normalIds, 1.3, { gap: 0.2, span: 0.4 }),
                  ...reveal('wall', 'wn', 2.1, { span: 0.4 }),
              ] },
            { id: 'w1', sfx: [['pop', 0.3]], dialogue: [vo(P[13], 0.2)],
              actions: [...pop('wall', 'wr', 0.3, { span: 0.45 })] },
        ],
    });

    // --- SCENE 6 — a corner -------------------------------------------------
    scenes.push({
        id: 'corner', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('corner', { alpha: 1 })]),
        shots: [
            { id: 'o0', sfx: [['whoosh', 0], ['pop', 0.5]], dialogue: [vo(P[14], 0.2)],
              actions: [
                  ...reveal('corner', 'h', 0.15, { span: 0.35 }),
                  ...reveal('corner', corner.boxId, 0.5, { span: 0.35 }),
                  ...showBall('corner', 'cb', 0.9),
                  ...pop('corner', 'cp', 1.5, { span: 0.35 }),
              ] },
            { id: 'o1', sfx: [['pop', 0.3]], dialogue: [vo(P[15], 0.2)],
              actions: [
                  ...build('corner', corner.arrow.ids, 0.3, { gap: 0.15, span: 0.4 }),
                  ...reveal('corner', 'cn2', 1.2, { span: 0.4 }),
              ] },
        ],
    });

    // --- SCENE 7 — the tangent ----------------------------------------------
    scenes.push({
        id: 'tan', palette: 'game',
        background: { color: '#0a1230' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            { character: 'nova', as: 'nova', at: [160, 1300], scale: 0.4 },
            offstage('vector'), castBoard('tan', { alpha: 1 }),
        ]),
        shots: [
            { id: 'a0', sfx: [['whoosh', 0], ['pop', 0.6]], dialogue: [says('nova', P[16], 0.3)],
              actions: [
                  rest('nova'),
                  ...express('nova', 'think', 0.3, { hold: 1.0 }),
                  ...reveal('tan', 'h', 0.15, { span: 0.35 }),
                  ...tan.n.ids.flatMap((id) => reveal('tan', id, 0.6, { span: 0.3 })),
                  ...ballBlinks('nova', 2.8, 31),
              ] },
            { id: 'a1', sfx: [['pop', 0.4]], dialogue: [vo(P[17], 0.2)],
              actions: [
                  ...tan.t.ids.flatMap((id) => reveal('tan', id, 0.4, { span: 0.35 })),
                  ...build('tan', tan.ang.ids, 1.1, { gap: 0.1, span: 0.3 }),
              ] },
            { id: 'a2', sfx: [['pop', 0.3]], dialogue: [vo(P[18], 0.2)],
              actions: [
                  ...build('tan', ['tf_bg', 'tf_t', 'tf_n'], 0.3,
                           { gap: 0.14, span: 0.4 }),
              ] },
        ],
    });

    // --- SCENE 8 — the dot product ------------------------------------------
    scenes.push({
        id: 'dot', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('dot', { alpha: 1 })]),
        shots: [
            { id: 'd0', sfx: [['whoosh', 0], ['pop', 0.8]], dialogue: [vo(P[19], 0.2)],
              actions: [
                  ...reveal('dot', 'h', 0.15, { span: 0.35 }),
                  ...dot.v.ids.flatMap((id) => reveal('dot', id, 0.5, { span: 0.3 })),
                  ...dot.n.ids.flatMap((id) => reveal('dot', id, 0.8, { span: 0.3 })),
              ] },
            { id: 'd1', sfx: [['pop', 0.3]], dialogue: [vo(P[20], 0.2)],
              actions: [
                  ...build('dot', ['df_bg', 'df_t', 'df_n'], 0.3,
                           { gap: 0.14, span: 0.4 }),
              ] },
            { id: 'd2', sfx: [['tick', 0.4], ['pop', 1.2]], dialogue: [vo(P[21], 0.2)],
              actions: [
                  ...build('dot', dot.projIds, 0.4, { gap: 0.1, span: 0.35 }),
                  ...build('dot', dot.read.ids, 1.2, { gap: 0.12, span: 0.3 }),
                  ...countTo('dot', dot.read.value,
                             { from: 0, to: 4.8, at: 1.6, span: 0.9, decimals: 2 }),
              ] },
            { id: 'd3', sfx: [['pop', 0.3]], dialogue: [vo(P[22], 0.2)],
              actions: [...pop('dot', 'dk', 0.3, { span: 0.45 })] },
        ],
    });

    // --- SCENE 9 — taking the velocity apart --------------------------------
    scenes.push({
        id: 'split', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('split', { alpha: 1 })]),
        shots: [
            { id: 's0', sfx: [['whoosh', 0], ['pop', 0.7]], dialogue: [vo(P[23], 0.2)],
              actions: [
                  ...reveal('split', 'h', 0.15, { span: 0.35 }),
                  ...reveal('split', split.w.wallId, 0.4, { span: 0.3 }),
                  ...split.vin.ids.flatMap((id) => reveal('split', id, 0.7,
                                                          { span: 0.3 })),
                  ...build('split', [...split.nComp.ids, 'snl'], 1.4,
                           { gap: 0.14, span: 0.3 }),
                  ...build('split', [...split.tComp.ids, 'stl'], 2.0,
                           { gap: 0.14, span: 0.3 }),
              ] },
            { id: 's1', sfx: [['pop', 0.3]], dialogue: [vo(P[24], 0.2)],
              actions: [
                  ...reveal('split', 'sn2', 0.3, { span: 0.4 }),
              ] },
            { id: 's2', sfx: [['impact', 0.5]], dialogue: [vo(P[25], 0.2)],
              actions: [
                  // The outgoing arrow is the point of the scene, so it
                  // arrives on its own beat rather than with the components.
                  ...split.out.ids.flatMap((id) => reveal('split', id, 0.5,
                                                          { span: 0.35 })),
                  ...reveal('split', 'sol', 0.9, { span: 0.3 }),
                  ...pop('split', 'sp', 1.3, { span: 0.45 }),
              ] },
        ],
    });

    // --- SCENE 10 — the formula ---------------------------------------------
    scenes.push({
        id: 'refl', palette: 'game',
        background: { color: '#081029' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            { character: 'bolt', as: 'bolt', at: [160, 1300], scale: 0.38,
              alpha: 0 },
            offstage('vector'), castBoard('refl', { alpha: 1 }),
        ]),
        shots: [
            { id: 'r0', sfx: [['whoosh', 0], ['tick', 0.5], ['tick', 1.3],
                              ['pop', 2.1]],
              dialogue: [vo(P[26], 0.2)],
              actions: [
                  rest('bolt'),
                  ...reveal('refl', 'h', 0.15, { span: 0.35 }),
                  ...reveal('refl', 'rd0', 0.5, { span: 0.35 }),
                  ...reveal('refl', 'rd1', 1.3, { span: 0.35 }),
                  ...reveal('refl', 'rd2', 2.1, { span: 0.4 }),
              ] },
            { id: 'r1', sfx: [['pop', 0.5]], dialogue: [says('bolt', P[27], 0.3)],
              actions: [
                  { target: 'bolt', do: 'show', at: 0.1, for: 0.3 },
                  ...express('bolt', 'doubt', 0.3, { hold: 1.0 }),
                  ...build('refl', ['rf_bg', 'rf_t'], 0.5, { gap: 0.14, span: 0.4 }),
                  ...ballBlinks('bolt', 2.6, 43),
              ] },
            { id: 'r2', sfx: [['pop', 0.3], ['tick', 1.4]], dialogue: [vo(P[28], 0.2)],
              actions: [
                  ...pop('refl', 'rf_n', 0.3, { span: 0.4 }),
                  ...reveal('refl', 'rc', 1.2, { span: 0.4, to: 0.85 }),
                  ...reveal('refl', 're', 1.7, { span: 0.4 }),
                  { target: 'bolt', do: 'hide', at: 2.2, for: 0.3 },
              ] },
        ],
    });

    // --- SCENE 11 — the sign check ------------------------------------------
    scenes.push({
        id: 'guard', palette: 'game',
        background: { color: '#120a1e' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('guard', { alpha: 1 })]),
        shots: [
            { id: 'g0', sfx: [['whoosh', 0], ['pop', 0.6]], dialogue: [vo(P[29], 0.2)],
              actions: [
                  ...reveal('guard', 'h', 0.15, { span: 0.35 }),
                  ...reveal('guard', guard.w.wallId, 0.4, { span: 0.3 }),
                  ...build('guard', guard.w.normalIds, 0.8, { gap: 0.15, span: 0.35 }),
                  ...showBall('guard', 'gba', 1.2),
                  ...showBall('guard', 'gbb', 1.4),
              ] },
            { id: 'g1', sfx: [['tick', 0.4], ['tick', 1.2], ['pop', 2.0]],
              dialogue: [vo(P[30], 0.2)],
              actions: [
                  ...guard.inArrow.ids.flatMap((id) => reveal('guard', id, 0.4,
                                                              { span: 0.3 })),
                  ...reveal('guard', 'gil', 0.7, { span: 0.3 }),
                  ...guard.outArrow.ids.flatMap((id) => reveal('guard', id, 1.2,
                                                               { span: 0.3 })),
                  ...reveal('guard', 'gol', 1.5, { span: 0.3 }),
                  ...build('guard', ['gf_bg', 'gf_t', 'gf_n'], 2.0,
                           { gap: 0.14, span: 0.4 }),
              ] },
            { id: 'g2', sfx: [['pop', 0.3]], dialogue: [vo(P[31], 0.2)],
              actions: [...pop('guard', 'gb', 0.3, { span: 0.45 })] },
        ],
    });

    // --- SCENE 12 — the code -------------------------------------------------
    scenes.push({
        id: 'code', palette: 'game',
        background: { color: '#070c1e' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('code', { alpha: 1 })]),
        shots: [
            { id: 'c0', sfx: [['whoosh', 0]].concat([0, 1, 2, 3, 4, 5, 6].map(
                  (i) => ['tick', 0.5 + i * 0.36])),
              dialogue: [vo(P[32], 0.2)],
              actions: [
                  ...reveal('code', 'cd_bg', 0.15, { span: 0.4 }),
                  ...reveal('code', 'cd_t', 0.4, { span: 0.3 }),
                  ...[0, 1, 2, 3, 4, 5, 6].flatMap((i) =>
                      build('code', code.code.lineIds(i), 0.5 + i * 0.36,
                            { gap: 0.03, span: 0.22 })),
              ] },
        ],
    });

    // --- SCENE 13 — four of six ----------------------------------------------
    scenes.push({
        id: 'steps', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('steps', { alpha: 1 })]),
        shots: [
            { id: 'p0', sfx: [['whoosh', 0], ['tick', 0.4], ['tick', 0.7],
                              ['tick', 1.0], ['pop', 1.4]],
              dialogue: [vo(P[33], 0.2)],
              actions: [
                  ...reveal('steps', 'h', 0.15, { span: 0.35 }),
                  ...[0, 1, 2].flatMap((i) =>
                      build('steps', steps.rows.rowIds(i), 0.4 + i * 0.3,
                            { gap: 0.04, span: 0.3 })),
                  ...build('steps', steps.rows.rowIds(3), 1.4,
                           { gap: 0.05, span: 0.34, how: pop }),
                  ...[4, 5].flatMap((i) =>
                      build('steps', steps.rows.rowIds(i), 2.0 + (i - 4) * 0.2,
                            { gap: 0.04, span: 0.35,
                              how: (t2, id, at, o) => reveal(t2, id, at,
                                                             { ...o, to: 0.42 }) })),
              ] },
        ],
    });

    // --- SCENE 14 — the cliffhanger -------------------------------------------
    scenes.push({
        id: 'next', palette: 'game',
        background: { color: '#070c1e' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            { character: 'nova', as: 'nova', at: [170, 640], scale: 0.4 },
            { character: 'vector', as: 'vector', at: [910, 640], scale: 0.32 },
            castBoard('next', { alpha: 1 }),
        ]),
        shots: [
            { id: 'n0', sfx: [['whoosh', 0], ['pop', 1.1]],
              dialogue: [says('nova', P[34], 0.3)],
              actions: [
                  rest('nova'), rest('vector'),
                  ...express('nova', 'sure', 0.3, { hold: 1.2 }),
                  ...showBall('next', 'xa', 0.15),
                  ...showBall('next', 'xb', 0.35),
                  ...build('next', nxt.n.ids, 0.8, { gap: 0.12, span: 0.35 }),
                  ...build('next', nxt.aIds, 1.4, { gap: 0.12, span: 0.3 }),
                  ...reveal('next', 'xn', 2.0, { span: 0.4 }),
                  ...ballBlinks('nova', 3.6, 23),
              ] },
            { id: 'n1', sfx: [['riser', 0.2, 0.36]], dialogue: [vo(P[35], 0.2)],
              actions: [
                  ...express('vector', 'keen', 0.3, { hold: 1.8 }),
                  ...reveal('next', 'nk', 0.4, { span: 0.3 }),
                  ...pop('next', 'nt', 0.9, { span: 0.45 }),
                  ...ballBlinks('nova', 4.0, 47),
              ] },
        ],
    });

    // --- SCENE 15 — the end card ----------------------------------------------
    scenes.push({
        id: 'card', palette: 'game',
        background: { color: '#04060f' },
        transitionIn: { kind: 'crossfade', duration: 0.4 },
        cast: [offstage('vector'), castBoard('card', { alpha: 1 })],
        shots: [
            { id: 'e0', sfx: [['riser', 0, 0.42]], dialogue: [vo(P[36], 0.3)],
              actions: [
                  ...build('card', card.ids.slice(0, 2), 0.15, { gap: 0.25, span: 0.45 }),
                  ...build('card', card.ids.slice(2), 1.5, { gap: 0.22, span: 0.4 }),
              ] },
        ],
    });

    return liftSfx(fitShots({
        version: 'jirex.film/1',
        meta: { ...META(T.title), estimatedTiming: true },
        assets: SFX_ASSETS,
        palettes: { game: GAME_PALETTE },
        voices: voicesFor(),
        characters, scenes,
    }));
}
