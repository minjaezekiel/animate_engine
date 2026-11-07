/**
 * Part 1 — "The secret behind every collision".
 *
 * What actually happens when two objects hit each other: velocity as a pair
 * of numbers, momentum transfer, the collision normal, and restitution.
 *
 * ## The physics, and where it is deliberately conditional
 *
 * Every claim below is true *under stated conditions*, and the conditions are
 * said out loud in the narration rather than only in a comment. That is the
 * difference between teaching and reciting, and collisions are a topic where
 * the unconditional version is simply wrong.
 *
 * - **Velocity** is speed plus direction, and in 2D it is the pair (vx, vy).
 *   Uncontroversial.
 * - **Momentum** is mass x velocity, a vector, conserved in every collision.
 * - **The cue ball stops dead.** Only for EQUAL masses, a head-on hit, and a
 *   perfectly elastic collision: then the two exchange their normal-direction
 *   velocities. The narration states all three conditions in the same breath
 *   ("equal mass, dead straight, no energy lost"), because this is the single
 *   most memorable result in the film and the one most often repeated without
 *   its conditions. Real billiards is e≈0.95 with spin and friction, so a
 *   real cue ball dribbles forward — which is why the film says "no energy
 *   lost" rather than "always".
 * - **The collision normal** for two circles is the line joining the centres
 *   at contact. This is exact, not an approximation.
 * - **The tangential component is unchanged** only for frictionless, smooth,
 *   non-rotating bodies. The narration says "for smooth balls", and friction
 *   and spin are Part 5 and Part 6.
 * - **Restitution** `e` is the ratio of relative normal speed after a
 *   collision to before it. `e = 1` loses no kinetic energy *through the
 *   collision*; `e = 0` leaves the pair with no relative normal velocity —
 *   which is NOT the same as "both stop", a distinction the on-screen text
 *   keeps by saying "no bounce at all" rather than "they stop".
 *
 * ## What was cut from the supplied script, and why
 *
 * The brief was 2–3 minutes; the supplied script runs 4:20. The cut is
 * **Scene 6, rotation and moment of inertia**, for two reasons that both
 * point the same way: the script's own director's notes say "for the simplest
 * billiard-ball collision model, you can initially ignore spin and treat the
 * balls as smooth circles", and the episode table already gives spin its own
 * dedicated Part 6. So it is not lost, it is placed. What survives here is a
 * two-line tease — Bolt asks "what if things spin?" — which keeps the
 * seven-item framing honest and plants the later part.
 *
 * Scene 7's seven-step list is therefore six steps and a dimmed seventh, and
 * Scene 8's six games are a grid rather than six narrated beats.
 */
import {
    BOLT, FONT, GAME_PALETTE, L, M, NOVA, Q, SAFE, VECTOR, Z, ballBlinks,
    bannerParts, board, bounceParts, build, castBoard, claimParts, codePanelParts,
    conceal, cueParts, diagramBall, diagramBallIds, ellipsePart, endCard, express,
    fitShots, flash, flashPart, formulaParts, gameGridParts, gridScenery,
    headingPart, hookTitle, impactParts, normalParts, pathPart, pop, rectPart,
    liftSfx, rest, reveal, revealTo, roll, roundRect, SFX_ASSETS, spinMark, squash,
    stepRows, tableParts,
    textPart, titleAt, vectorArrow,
} from './common.mjs';
import { META, voicesFor } from '../lib/physics.mjs';

// ---------------------------------------------------------------------------
// Staging constants
// ---------------------------------------------------------------------------

/** Ball centres in a two-hander, and the scale that makes a brow readable. */
const TALK_Y = 950;
const TALK_S = 0.82;
const LEFT = 300;
const RIGHT = 780;

/** A three-shot: the balls drop back and Vector floats between them. */
const TRIO_Y = 1010;
const TRIO_S = 0.72;
const VEC_AT = [540, 640];
const VEC_S = 0.52;

/** Where a heading sits, in every board, so the eye never has to hunt. */
const HEAD_Y = 536;

// ---------------------------------------------------------------------------
// The narration, indexed, so a rewrite is one edit and not three
// ---------------------------------------------------------------------------

const P = [
    /* 0  BOLT   */ 'In one second I hit Nova — and I will stop dead.',
    /* 1  NOVA   */ "That's not how it works. You hit me, I bounce away.",
    /* 2  VECTOR */ "He's right. And why is the most useful thing in game physics.",
    /* 3  VECTOR */ 'Pool, basketballs, bullets, spaceships — same few rules under all of it.',
    /* 4  VECTOR */ 'Start with velocity. Speed is how fast. Velocity is how fast and which way.',
    /* 5  VECTOR */ 'A 2D game splits that arrow into two numbers.',
    /* 6  VECTOR */ 'VX carries you across. VY carries you up and down.',
    /* 7  BOLT   */ 'So VX four and VY two, and I go diagonally.',
    /* 8  VECTOR */ 'Now watch the collision. Slowly.',
    /* 9  NOVA */ "Wait — I wasn't moving. Why am I moving, and why did he stop?",
    /*10  VECTOR */ 'Motion was handed over. Everything moving carries momentum: mass '
        + 'times velocity.',
    /*11  VECTOR */ 'Equal mass, dead straight, no energy lost — and they simply swap.',
    /*12  VECTOR */ 'More mass, same velocity, more momentum to hand over.',
    /*13  VECTOR */ 'But balls almost never meet dead straight. Here is the secret.',
    /*14  VECTOR */ 'When they touch, draw a line through both centres. That is the '
        + 'collision normal.',
    /*15  VECTOR */ 'That is the direction the hit pushes. Not the direction Bolt was '
        + 'travelling.',
    /*16  NOVA */ "So if he clips me at an angle, I don't go where he was going?",
    /*17  VECTOR */ 'You go along the normal. Every single time.',
    /*18  VECTOR */ 'Split the motion two ways: along the normal, and along the tangent.',
    /*19  VECTOR */ 'The collision changes the normal part. For smooth balls the sideways part '
        + 'passes through.',
    /*20  VECTOR */ 'That split is why two balls leave on completely different paths.',
    /*21  BOLT */ 'Then why do I bounce high off one thing and die on another?',
    /*22  VECTOR */ 'Restitution. One number, written e, for how bouncy a collision is.',
    /*23  VECTOR */ 'e of one: nothing lost, bounces forever. e of zero: no bounce at all.',
    /*24  VECTOR */ 'Everything real is in between — a basketball, a lump of clay, your game.',
    /*25  VECTOR */ 'To build this, your game needs six things, in this order.',
    /*26  VECTOR */ 'Where is it. How fast. Did they touch. Which way did it hit.',
    /*27  VECTOR */ 'How do the velocities change, and how much of the bounce survives.',
    /*28  BOLT */ 'What if things spin?',
    /*29  VECTOR */ 'That is a seventh — and big enough to be its own part.',
    /*30  VECTOR */ 'Get these six right and you have pool, brick breaker, pinball and asteroids.',
    /*31  VECTOR */ 'Same rules. Different game.',
    /*32  BOLT */ 'Okay — but how do we actually code it?',
    /*33  NOVA */ 'And stop ourselves getting stuck inside each other?',
    /*34  VECTOR */ 'Next time. We write the whole thing, in Python, from nothing.',
    /*35  VECTOR */ "Follow, and I'll see you in part two.",
];

// ---------------------------------------------------------------------------
// On-screen text. Separate from the narration because a muted viewer reads
// THIS, and it is not a transcript -- it is the shorter, blunter version.
// ---------------------------------------------------------------------------

const T = {
    kicker: 'GAME PHYSICS  ·  PART 1',
    title: 'The secret behind every collision',
    sub: 'velocity · momentum · normals · bounce',

    montH: 'SAME RULES, EVERY GAME',
    montSub: 'pool  ·  basketballs  ·  bullets  ·  spaceships',

    velH: 'VELOCITY',
    velF: 'VELOCITY  =  SPEED  +  DIRECTION',
    velN: 'speed alone cannot tell you where you end up',
    vx: 'VX', vy: 'VY',
    vxL: 'VX  —  across',
    vyL: 'VY  —  up and down',
    diagC: 'VX = 4   ·   VY = 2',

    momH: 'MOMENTUM',
    momF: 'MOMENTUM  =  MASS  ×  VELOCITY',
    momN: 'how much motion an object is carrying',
    swapC: 'equal mass  ·  head-on  ·  nothing lost',
    swapN: 'the two velocities swap',
    heavyL: 'light', heavyR: 'heavy',
    heavyN: 'same velocity, more mass  →  more momentum',

    nH: 'THE COLLISION NORMAL',
    nDef: 'THE LINE THROUGH BOTH CENTRES',
    nNot: 'NOT the direction the ball was travelling',
    nNorm: 'NORMAL',
    nTan: 'TANGENT',
    nTravel: 'travelling',
    nSplitH: 'SPLIT THE MOTION TWO WAYS',
    nNormN: 'the collision changes THIS part',
    nTanN: 'smooth balls: THIS part passes through untouched',
    nPay: 'which is why they leave on different paths',

    rH: 'RESTITUTION   ( e )',
    rSub: 'how much of the bounce survives',
    e1: 'e = 1', e1n: 'nothing lost',
    e0: 'e = 0', e0n: 'no bounce at all',
    eM: '0 < e < 1', eMn: 'everything real',

    bH: 'SIX THINGS YOUR GAME NEEDS',
    steps: [
        [1, 'POSITION', 'where is it', '#36e3ff'],
        [2, 'VELOCITY', 'how fast, and which way', '#36e3ff'],
        [3, 'DETECTION', 'did they touch', '#ffd23d'],
        [4, 'NORMAL', 'which way did the hit push', '#ff4d8d'],
        [5, 'RESPONSE', 'change both velocities', '#8e7bff'],
        [6, 'RESTITUTION', 'how much bounce survives', '#3ddc84'],
        [7, 'ROTATION', 'only if things spin  —  Part 6', '#ff9f1c'],
    ],

    gH: 'WHAT THIS BUILDS',
    gN: 'one physics step  ·  six games',
    games: [
        ['Pool', 'angled hits, momentum, spin', '#36e3ff'],
        ['Brick Breaker', 'walls, a paddle, reflection', '#ffd23d'],
        ['Air Hockey', 'circle on circle, impulses', '#ff4d8d'],
        ['Pinball', 'bumpers, flippers, restitution', '#8e7bff'],
        ['Asteroids', 'many hits at once, fragments', '#3ddc84'],
        ['+ platformers', 'racing, sports, puzzles…', '#ff9f1c'],
    ],

    codeTitle: '# one collision, in six lines  —  Part 2',
    nextK: 'NEXT  ·  PART 2',
    next: 'Building a 2D collision\nengine in Python',
};

/** The teaser code. Correct equal-or-unequal-mass impulse along the normal. */
const CODE = [
    [0, [['codeCmt', '# a, b: two circles.  e: restitution']]],
    [0, [['codeFn', 'dx, dy'], ['ink', ' = b.x - a.x, b.y - a.y']]],
    [0, [['codeFn', 'd'], ['ink', '      = math.hypot(dx, dy)']]],
    [0, [['codeFn', 'nx, ny'], ['ink', ' = dx / d, dy / d'], ['codeCmt', '   # the normal']]],
    [0, [['codeFn', 'vn'], ['ink', '     = (a.vx - b.vx)*nx + (a.vy - b.vy)*ny']]],
    [0, [['codeFn', 'j'], ['ink', '      = -(1 + '], ['codeNum', 'e'],
         ['ink', ')*vn / (1/a.m + 1/b.m)']]],
];

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

/** SCENE 1 — the table, the strike, and the freeze. */
function boardTable() {
    const table = tableParts('tb', { cx: 540, cy: 1000, w: 1000, h: 600 });
    const cue = cueParts('cue', { at: [206, 1000], len: 560 });
    const rays = impactParts('ray', [214, 1000], { n: 8, r0: 40, r1: 110 });
    // The glow rings that arrive with the freeze: the script's "futuristic
    // blue physics environment", done as two rings rather than a new backdrop
    // so the table stays readable underneath it.
    // Hugging each ball, and NOT touching each other. A ball is 120 * 0.62 =
    // 74px here and the centres are 180 apart, so 88 clears by 4px. At the
    // first version's 128 the two rings crossed, which read as the balls
    // already colliding -- in the one shot whose whole job is to freeze
    // things an instant BEFORE they do.
    const rings = [
        ellipsePart('ringA', 88, 88, { at: [600, 1000], stroke: 'velocity',
                                       strokeWidth: 5, z: 180 }),
        ellipsePart('ringB', 88, 88, { at: [780, 1000], stroke: 'normal',
                                       strokeWidth: 5, z: 180 }),
    ];
    return {
        ...board('table', [
            ...table.parts, ...cue, ...rays.parts, ...rings, flashPart('fl'),
            ...hookTitle(T.kicker, T.title, T.sub),
        ]),
        table, cueIds: cue.map((p) => p.id), rays,
    };
}

/**
 * SCENE 2 — the title card: one claim, four miniatures.
 *
 * Each miniature is the SAME collision seen four ways, which is the claim
 * the scene is making. Drawn from the series' own vocabulary -- a cyan
 * velocity arrow means the same thing in a 400px panel as in a full frame --
 * because a viewer who learns the colour here can read it for six more parts.
 */
function boardMontage() {
    const panel = (id, x, y, w, h) => pathPart(id, roundRect(x, y, w, h, 20),
        { fill: 'panel', stroke: 'panelLine', strokeWidth: 2, z: 10 });
    const parts = [
        ...claimParts('mc', T.montH, { at: [540, 620], size: 66, sub: T.montSub }),
        panel('p0', 70, 760, 455, 250), panel('p1', 555, 760, 455, 250),
        panel('p2', 70, 1030, 455, 250), panel('p3', 555, 1030, 455, 250),
    ];
    const ids = { p0: [], p1: [], p2: [], p3: [] };

    // 1 — pool: two balls, two diverging arrows.
    parts.push(
        ...diagramBall('m0a', [180, 900], 38),
        ...diagramBall('m0b', [300, 880], 38, { base: 'nova', baseDark: 'novaDark' }),
        ...vectorArrow('m0v1', [320, 866], [430, 820], { width: 7, head: 18 }).parts,
        ...vectorArrow('m0v2', [196, 926], [150, 985], { width: 7, head: 18 }).parts,
    );
    ids.p0 = ['m0a', 'm0a_lit', 'm0a_s', 'm0b', 'm0b_lit', 'm0b_s', 'm0v1', 'm0v2'];

    // 2 — a basketball bouncing: the arc, drawn.
    parts.push(
        pathPart('m1f', `${M(620, 980)} ${L(950, 980)}`,
                 { stroke: 'dim', strokeWidth: 4, z: 12 }),
        pathPart('m1arc', `${M(640, 810)} ${Q(700, 980, 760, 980)} `
                        + `${Q(820, 980, 850, 880)} ${Q(880, 980, 930, 980)}`,
                 { stroke: 'restitution', strokeWidth: 5, z: 13, lineCap: 'round' }),
        ...diagramBall('m1b', [640, 810], 32, { base: 'spin', baseDark: 'loss' }),
    );
    ids.p1 = ['m1f', 'm1arc', 'm1b', 'm1b_lit', 'm1b_s'];

    // 3 — a bullet off a wall: the reflection, and the normal that made it.
    parts.push(
        rectPart('m2w', 24, 190, { at: [460, 1150], fill: 'robotDark', z: 12 }),
        ...vectorArrow('m2in', [130, 1080], [440, 1150], { width: 7, head: 18 }).parts,
        ...vectorArrow('m2out', [440, 1150], [150, 1225], { width: 7, head: 18,
                                                            fill: 'normal' }).parts,
        pathPart('m2n', `${M(448, 1150)} ${L(360, 1150)}`,
                 { stroke: 'normal', strokeWidth: 3, z: 14 }),
    );
    ids.p2 = ['m2w', 'm2in', 'm2out', 'm2n'];

    // 4 — two ships: the impact itself.
    const ship = (id, cx, cy, flip) => pathPart(id,
        `${M(cx + 40 * flip, cy)} ${L(cx - 28 * flip, cy - 30)} `
        + `${L(cx - 14 * flip, cy)} ${L(cx - 28 * flip, cy + 30)} ${Z}`,
        { fill: id.endsWith('a') ? 'velocity' : 'spin', z: 13 });
    const shipRays = impactParts('m3r', [780, 1155], { n: 8, r0: 34, r1: 78, z: 14 });
    parts.push(ship('m3a', 660, 1155, 1), ship('m3b', 900, 1155, -1), ...shipRays.parts);
    ids.p3 = ['m3a', 'm3b', ...shipRays.ids];

    return { ...board('mont', parts), ids };
}

/** SCENE 3 — velocity: one arrow, then two numbers. */
function boardVel() {
    const O = [300, 940];                      // the origin everything measures from
    const vel = vectorArrow('va', [386, 940], [820, 940], { label: 'velocity' });
    const vxA = vectorArrow('vxa', O, [660, 940], { label: T.vxL, labelOff: 52 });
    const vyA = vectorArrow('vya', O, [300, 680], { label: T.vyL, labelOff: 64 });
    const diag = vectorArrow('vda', O, [660, 680], { fill: 'momentum', label: T.diagC,
                                                     labelOff: 54 });
    return {
        ...board('vel', [
            headingPart('h', T.velH, { y: HEAD_Y, fill: 'velocity', size: 56 }),
            ...diagramBall('vb', O, 86),
            ...vel.parts,
            ...formulaParts('vf', T.velF, { at: [540, 1180], fill: 'velocity', size: 44,
                                            note: T.velN }),
            ...vxA.parts, ...vyA.parts, ...diag.parts,
        ]),
        vel, vxA, vyA, diag, O,
    };
}

/**
 * SCENE 4 — the diagonal, small, above a two-hander.
 *
 * Its own board rather than a re-cast of `vel`: the velocity board is built
 * for a full frame and its ball sits exactly where Bolt stands here, so
 * re-casting it would stack the diagram on the characters. A compact inset
 * in the dead space above their heads is the shot this beat actually needs.
 */
function boardDiag() {
    const O = [430, 770];
    const vx = vectorArrow('dx', O, [620, 770], { width: 8, head: 22, label: T.vx,
                                                  labelOff: 38 });
    const vy = vectorArrow('dy', O, [430, 630], { width: 8, head: 22, label: T.vy,
                                                  labelOff: 40 });
    const dg = vectorArrow('dd', O, [620, 630], { width: 10, head: 26,
                                                  fill: 'momentum' });
    return {
        ...board('diagbd', [
            ...vx.parts, ...vy.parts, ...dg.parts,
            textPart('dc', T.diagC, { at: [540, 1266], font: `800 40px ${FONT}`,
                                      fill: 'momentum', z: 90,
                                      maxWidth: SAFE.x1 - SAFE.x0 }),
        ]),
        vx, vy, dg,
    };
}

/** SCENE 6 — momentum: the swap, then what mass does to it. */
function boardMom() {
    const swapL = vectorArrow('msl', [330, 860], [470, 860], { width: 9, head: 24 });
    const swapR = vectorArrow('msr', [690, 860], [830, 860], { width: 9, head: 24 });
    return {
        ...board('mom', [
            headingPart('h', T.momH, { y: HEAD_Y, fill: 'momentum', size: 56 }),
            ...formulaParts('mf', T.momF, { at: [540, 700], fill: 'momentum', size: 40,
                                            note: T.momN }),
            // The swap, as two balls and two arrows that trade places.
            ...diagramBall('ma', [330, 960], 76),
            ...diagramBall('mb', [690, 960], 76, { base: 'nova', baseDark: 'novaDark' }),
            ...swapL.parts, ...swapR.parts,
            textPart('sc', T.swapC, { at: [540, 1066], font: `700 29px ${FONT}`,
                                      fill: 'dim', z: 80, maxWidth: SAFE.x1 - SAFE.x0 }),
            textPart('sn', T.swapN, { at: [540, 1112], font: `800 36px ${FONT}`,
                                      fill: 'momentum', z: 80,
                                      maxWidth: SAFE.x1 - SAFE.x0 }),
            // Mass: the same velocity arrow on two very different balls.
            ...diagramBall('hl', [250, 1232], 38),
            ...diagramBall('hr', [720, 1232], 86, { base: 'nova', baseDark: 'novaDark' }),
            ...vectorArrow('hla', [296, 1232], [400, 1232], { width: 7, head: 18 }).parts,
            ...vectorArrow('hra', [814, 1232], [918, 1232], { width: 7, head: 18 }).parts,
            textPart('hn', T.heavyN, { at: [540, 1328], font: `700 28px ${FONT}`,
                                       fill: 'dim', z: 80, maxWidth: SAFE.x1 - SAFE.x0 }),
        ]),
        swapL, swapR,
    };
}

/**
 * SCENE 7 — the normal, head-on.
 *
 * `normalParts` derives both lines from the two centres, so this diagram
 * cannot be authored wrong: see the drawing rule in its own docstring.
 */
function boardNorm1() {
    const A = [340, 920];
    const B = [700, 920];
    const n = normalParts('n1', A, B, { r: 110, extend: 130, tangent: false });
    return {
        ...board('norm1', [
            headingPart('h', T.nH, { y: HEAD_Y, fill: 'normal', size: 50 }),
            ...diagramBall('n1a', A, 110),
            ...diagramBall('n1b', B, 110, { base: 'nova', baseDark: 'novaDark' }),
            ...n.parts,
            textPart('def', T.nDef, { at: [540, 1140], font: `800 38px ${FONT}`,
                                      fill: 'normal', z: 90,
                                      maxWidth: SAFE.x1 - SAFE.x0, lineHeight: 46 }),
            textPart('not', T.nNot, { at: [540, 1216], font: `700 30px ${FONT}`,
                                      fill: 'dim', z: 90,
                                      maxWidth: SAFE.x1 - SAFE.x0, lineHeight: 38 }),
        ]),
        n,
    };
}

/** SCENE 9 — the normal, angled, and the split that explains everything. */
function boardNorm2() {
    // Offset centres, so the normal is genuinely angled and the contrast with
    // the travel direction is the picture rather than a caption.
    //
    // Ball A is pushed right to 360 so the travel arrow and its label have
    // clear frame to the left of it: at 330 the word "travelling" sat on top
    // of the ball AND on the normal, which is the one diagram in the film
    // that has to be unambiguous.
    const A = [360, 820];
    const B = [690, 1030];
    const n = normalParts('n2', A, B, { r: 104, extend: 120, tangent: true });
    const travel = vectorArrow('n2v', [120, 820], [252, 820],
                               { width: 9, head: 24, fill: 'momentum' });
    return {
        ...board('norm2', [
            headingPart('h', T.nSplitH, { y: HEAD_Y, fill: 'ink', size: 42 }),
            ...diagramBall('n2a', A, 104),
            ...diagramBall('n2b', B, 104, { base: 'nova', baseDark: 'novaDark' }),
            ...travel.parts,
            textPart('tv', T.nTravel, { at: [186, 766], font: `700 27px ${FONT}`,
                                        fill: 'momentum', z: 92, maxWidth: 300 }),
            ...n.parts,
            // Both labels sit at the FREE end of the line they name. The
            // tangent runs upper-right to lower-left through the contact
            // point, so its label goes beyond the upper-right end; the
            // normal's goes past its arrowhead, below Nova.
            textPart('lt', T.nTan, { at: [660, 742], font: `800 34px ${FONT}`,
                                     fill: 'tangent', z: 92, maxWidth: 360 }),
            textPart('ln', T.nNorm, { at: [862, 1168], font: `800 34px ${FONT}`,
                                      fill: 'normal', align: 'right', z: 92,
                                      maxWidth: 400 }),
            textPart('nn', T.nNormN, { at: [540, 1232], font: `700 29px ${FONT}`,
                                       fill: 'normal', z: 92,
                                       maxWidth: SAFE.x1 - SAFE.x0 }),
            textPart('tn', T.nTanN, { at: [540, 1278], font: `700 29px ${FONT}`,
                                      fill: 'tangent', z: 92,
                                      maxWidth: SAFE.x1 - SAFE.x0 }),
            textPart('pay', T.nPay, { at: [540, 1344], font: `800 34px ${FONT}`,
                                      fill: 'ink', z: 92,
                                      maxWidth: SAFE.x1 - SAFE.x0 }),
        ]),
        n, travel,
    };
}

/** SCENE 11 — restitution: three bounces, one number apart. */
function boardRest() {
    const a = bounceParts('b1', { x: 130, floor: 1180, h: 400, e: 1, width: 190,
                                  label: T.e1, colour: 'restitution' });
    const b = bounceParts('b2', { x: 450, floor: 1180, h: 400, e: 0.02, width: 190,
                                  label: T.e0, colour: 'loss' });
    const c = bounceParts('b3', { x: 770, floor: 1180, h: 400, e: 0.55, width: 190,
                                  label: T.eM, colour: 'momentum' });
    const note = (id, text, x, fill) => textPart(id, text, {
        at: [x, 1296], font: `600 25px ${FONT}`, fill, z: 60, alpha: 0, maxWidth: 290 });
    return {
        ...board('rest', [
            headingPart('h', T.rH, { y: HEAD_Y, fill: 'restitution', size: 50 }),
            textPart('sub', T.rSub, { at: [540, 596], font: `700 30px ${FONT}`,
                                      fill: 'dim', z: 80, maxWidth: SAFE.x1 - SAFE.x0 }),
            ...a.parts, ...b.parts, ...c.parts,
            note('na', T.e1n, 225, 'restitution'),
            note('nb', T.e0n, 545, 'loss'),
            note('nc', T.eMn, 865, 'momentum'),
        ]),
        a, b, c,
    };
}

/** SCENE 12 — the six things, and the dimmed seventh. */
function boardBuild() {
    const rows = stepRows('st', T.steps, { y: 580, h: 90, gap: 10 });
    return {
        ...board('build', [
            headingPart('h', T.bH, { y: HEAD_Y, fill: 'ink', size: 40 }),
            ...rows.parts,
        ]),
        rows,
    };
}

/** SCENE 14 — what the six things add up to. */
function boardGames() {
    const grid = gameGridParts('gg', T.games, { y: 580, cardH: 184 });
    return {
        ...board('games', [
            headingPart('h', T.gH, { y: HEAD_Y, fill: 'ink', size: 44 }),
            ...grid.parts,
            // The closing beat of the scene lands on this rather than on
            // nothing: "Same rules. Different game." used to play over a
            // shot with no action in it at all.
            textPart('gn', T.gN, { at: [540, 1262], font: `800 40px ${FONT}`,
                                   fill: 'velocity', z: 80, alpha: 0,
                                   maxWidth: SAFE.x1 - SAFE.x0 }),
        ]),
        grid,
    };
}

/**
 * SCENE 15 — the cliffhanger: the code they are about to write.
 *
 * The panel carries no big title. The end card says what Part 2 is called
 * thirteen seconds later, and saying it twice in a row spends the one beat
 * where the CODE is the hook. What makes somebody come back is seeing six
 * lines of real Python that they cannot yet read.
 */
function boardNext() {
    const code = codePanelParts('cd', CODE, { x: 80, y: 620, w: 920, lh: 44, size: 26,
                                              title: T.codeTitle });
    return {
        ...board('next', [
            ...code.parts,
            textPart('nk', T.nextK, { at: [540, 556], font: `700 32px ${FONT}`,
                                      fill: 'velocity', z: 90 }),
        ]),
        code,
    };
}

/**
 * SCENE 5 — the impact furniture for the acted collision.
 *
 * A flash and a ray burst have to live on a cast member, because
 * `compile.js` resolves actions against cast roots only -- scenery cannot be
 * animated. This board holds nothing else: the collision itself is the two
 * characters.
 */
function boardHit() {
    const rays = impactParts('hr', [638 + 86, TRIO_Y], { n: 10, r0: 70, r1: 150 });
    return { ...board('hit', [...rays.parts, flashPart('hf')]), rays };
}

// ---------------------------------------------------------------------------
// Dialogue helpers
// ---------------------------------------------------------------------------

/** Narration in Vector's voice, subtitled, with no mouth to animate. */
const vo = (text, at = 0.2) =>
    ({ speaker: 'vector', text, at, lipsync: false, subtitle: true });

/** A spoken line, with the mouth. */
const says = (speaker, text, at = 0.25) =>
    ({ speaker, text, at, lipsync: true, subtitle: true });

/**
 * A speaker who has to exist but must not be seen.
 *
 * `buildDialogue` looks a speaker up in the scene's cast to find its voice,
 * and an uncast speaker renders SILENT with only a warning. So Vector is cast
 * into every scene he narrates -- invisible and behind everything in the ones
 * where the board owns the frame.
 */
const offstage = (as) => ({ character: as, as, at: [540, 960], scale: 1, alpha: 0, z: -900 });

// ---------------------------------------------------------------------------
// The part
// ---------------------------------------------------------------------------

export function partOne() {
    const tb = boardTable();
    const mont = boardMontage();
    const vel = boardVel();
    const mom = boardMom();
    const n1 = boardNorm1();
    const n2 = boardNorm2();
    const rst = boardRest();
    const bld = boardBuild();
    const gms = boardGames();
    const dg = boardDiag();
    const nxt = boardNext();
    const hit = boardHit();
    const card = endCard(T.next);
    const ban = bannerParts(1);

    const boards = [tb, mont, vel, dg, mom, n1, n2, rst, bld, gms, nxt, hit,
                    board('card', card.parts), board('ban', ban)];

    const characters = { bolt: BOLT, nova: NOVA, vector: VECTOR };
    for (const b of boards) {
        characters[b.name] = { role: 'effect', palette: 'game', parts: b.parts };
    }

    /** The pinned banner, in every scene but the end card. */
    const withBan = (cast) => [...cast, castBoard('ban', { alpha: 1 })];

    const grid = gridScenery();

    const scenes = [];

    // --- SCENE 1 — the hook ------------------------------------------------
    // No title for the first four seconds: the strike owns them.
    // `27-RETENTION.md` rule 1.
    scenes.push({
        id: 'table', palette: 'game',
        background: { color: '#04060f' },
        transitionIn: { kind: 'fade', from: '#000000', duration: 0.5 },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        cast: withBan([
            castBoard('table', { alpha: 1 }),
            { character: 'bolt', as: 'bolt', at: [330, 1000], scale: 0.62, alpha: 0 },
            { character: 'nova', as: 'nova', at: [780, 1000], scale: 0.62, alpha: 0 },
            { character: 'vector', as: 'vector', at: [540, 700], scale: 0.42, alpha: 0 },
        ]),
        shots: [
            { id: 'h0', sfx: [['click', 1.62], ['riser', 2.9, 0.4]], dialogue: [says('bolt', P[0], 0.45)],
              actions: [
                  rest('bolt'), rest('nova'), rest('vector'),
                  // The cloth, then the light coming up over it. The light
                  // reveals to its OWN alpha -- see `revealTo`.
                  ...build('table', tb.table.solidIds, 0.1,
                           { gap: 0.03, span: 0.35 }),
                  ...revealTo('table', tb.table.lights, 0.3, { gap: 0.08, span: 0.5 }),
                  { target: 'bolt', do: 'show', at: 0.42, for: 0.3 },
                  { target: 'nova', do: 'show', at: 0.52, for: 0.3 },
                  ...express('bolt', 'sure', 0.6, { hold: 0.8 }),
                  // The cue slides in, then jabs. `glide` would need the
                  // part's authored origin; these are path parts authored at
                  // [0,0], so the ramp is straight off zero.
                  ...tb.cueIds.flatMap((id) => [
                      ...reveal('table', id, 0.7, { span: 0.25 }),
                      { target: 'table', do: 'set', part: id, channel: 'transform.x',
                        value: -220, at: 0.7, ease: 'smooth' },
                      { target: 'table', do: 'set', part: id, channel: 'transform.x',
                        value: 0, at: 1.5, ease: 'smooth' },
                      { target: 'table', do: 'set', part: id, channel: 'transform.x',
                        value: 34, at: 1.62, ease: 'step' },
                  ]),
                  // CLICK.
                  ...flash('table', 'fl', 1.62, { peak: 0.42, span: 0.2 }),
                  ...build('table', tb.rays.ids, 1.62, { gap: 0.01, span: 0.1 }),
                  ...tb.rays.ids.flatMap((id) => conceal('table', id, 1.78, { span: 0.2 })),
                  ...squash('bolt', 1.6, { scale: 0.62, amount: 0.2, span: 0.08 }),
                  // He rolls, and stops short of her: the freeze is BEFORE
                  // contact, which is what makes the question worth asking.
                  // `squash: false` -- the cue's impact squash above owns
                  // `transform.sx` across this window.
                  ...roll('bolt', { from: [330, 1000], to: [600, 1000], at: 1.9,
                                    span: 0.85, scale: 0.62, squash: false }),
                  ...tb.cueIds.flatMap((id) => conceal('table', id, 2.1, { span: 0.3 })),
                  // The freeze, and the physics world arriving over it.
                  ...build('table', ['ringA', 'ringB'], 2.7, { gap: 0.12, span: 0.35,
                                                               how: pop }),
                  ...build('table', ['kicker', 'title', 'titlesub'], titleAt(P[0]),
                           { gap: 0.2, span: 0.45 }),
                  ...ballBlinks('nova', 5.6, 29),
              ] },
            { id: 'h1', dialogue: [says('nova', P[1], 0.3)],
              actions: [
                  ...express('nova', 'doubt', 0.3, { hold: 1.5 }),
                  ...ballBlinks('bolt', 4.6, 11), ...ballBlinks('nova', 4.6, 53),
              ] },
            { id: 'h2', sfx: [['pop', 0.1]], dialogue: [says('vector', P[2], 0.35)],
              actions: [
                  { target: 'vector', do: 'show', at: 0.1, for: 0.35 },
                  { target: 'vector', do: 'move', to: [540, 700], at: 0.1, for: 0.45,
                    ease: 'smooth' },
                  ...express('vector', 'keen', 0.4, { hold: 1.8 }),
                  ...ballBlinks('bolt', 5.4, 71), ...ballBlinks('nova', 5.4, 97),
              ] },
        ],
    });

    // --- SCENE 2 — the title card -----------------------------------------
    scenes.push({
        id: 'mont', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('mont', { alpha: 1 })]),
        shots: [
            { id: 'm0', sfx: [['whoosh', 0], ['pop', 0.15], ['tick', 0.9], ['tick', 1.08], ['tick', 1.26], ['tick', 1.44]], dialogue: [vo(P[3], 0.2)],
              actions: [
                  ...build('mont', ['mc_t', 'mc_s'], 0.15, { gap: 0.2, span: 0.4 }),
                  ...build('mont', ['p0', 'p1', 'p2', 'p3'], 0.9,
                           { gap: 0.18, span: 0.3 }),
                  ...build('mont', mont.ids.p0, 1.25, { gap: 0.04, span: 0.25 }),
                  ...build('mont', mont.ids.p1, 1.65, { gap: 0.05, span: 0.25 }),
                  ...build('mont', mont.ids.p2, 2.05, { gap: 0.05, span: 0.25 }),
                  ...build('mont', mont.ids.p3, 2.45, { gap: 0.03, span: 0.25 }),
              ] },
        ],
    });

    // --- SCENE 3 — velocity ------------------------------------------------
    scenes.push({
        id: 'vel', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('vel', { alpha: 1 })]),
        shots: [
            { id: 'v0', sfx: [['whoosh', 0], ['pop', 1.1], ['pop', 3.0]], dialogue: [vo(P[4], 0.2)],
              actions: [
                  ...reveal('vel', 'h', 0.15, { span: 0.35 }),
                  ...build('vel', diagramBallIds('vb'), 0.5, { gap: 0.06, span: 0.3 }),
                  // The arrow grows: short first, then long. A velocity arrow
                  // that arrives at full length says nothing about speed.
                  ...vel.vel.ids.flatMap((id) => reveal('vel', id, 1.1, { span: 0.3 })),
                  { target: 'vel', do: 'set', part: 'va', channel: 'transform.sx',
                    value: 0.42, at: 1.1, ease: 'smooth' },
                  { target: 'vel', do: 'set', part: 'va', channel: 'transform.sx',
                    value: 1, at: 2.4, ease: 'step' },
                  ...build('vel', ['vf_bg', 'vf_t', 'vf_n'], 3.0,
                           { gap: 0.16, span: 0.4 }),
              ] },
            { id: 'v1', dialogue: [vo(P[5], 0.2)],
              actions: [
                  // The single arrow goes, so the two that replace it read as
                  // a decomposition of it rather than as three arrows.
                  ...vel.vel.ids.flatMap((id) => conceal('vel', id, 0.2, { span: 0.25 })),
                  ...build('vel', vel.vxA.ids, 0.7, { gap: 0.18, span: 0.35 }),
              ] },
            { id: 'v2', dialogue: [vo(P[6], 0.2)],
              actions: [
                  ...build('vel', vel.vyA.ids, 0.3, { gap: 0.18, span: 0.35 }),
              ] },
        ],
    });

    // --- SCENE 4 — the diagonal, as banter ---------------------------------
    scenes.push({
        id: 'diag', palette: 'game',
        background: { color: '#0a1230' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            { character: 'bolt', as: 'bolt', at: [LEFT, TALK_Y], scale: TALK_S },
            { character: 'vector', as: 'vector', at: [RIGHT, TALK_Y], scale: 0.62 },
            castBoard('diagbd', { alpha: 1 }),
        ]),
        shots: [
            { id: 'd0', sfx: [['whoosh', 0], ['pop', 1.3]], dialogue: [says('bolt', P[7], 0.3)],
              actions: [
                  rest('bolt'), rest('vector'),
                  // The two components first, then the diagonal they add up
                  // to -- in that order, because the diagonal is the claim
                  // and the components are the evidence.
                  ...build('diagbd', [...dg.vx.ids, ...dg.vy.ids], 0.2,
                           { gap: 0.14, span: 0.28 }),
                  ...build('diagbd', dg.dg.ids, 1.3, { gap: 0.12, span: 0.4, how: pop }),
                  ...build('diagbd', ['dc'], 2.0, { gap: 0, span: 0.4, how: pop }),
                  ...express('bolt', 'keen', 0.3, { hold: 1.4 }),
                  // Vector listens rather than answering: his reply was cut
                  // for runtime, and a nod beats a restatement.
                  ...express('vector', 'sure', 1.9, { hold: 1.2 }),
                  ...spinMark('bolt', 0.3, 2.2, 1),
                  ...ballBlinks('bolt', 4.4, 13), ...ballBlinks('vector', 4.4, 37),
              ] },
        ],
    });

    // --- SCENE 5 — the collision, acted ------------------------------------
    scenes.push({
        id: 'hit', palette: 'game',
        background: { color: '#081029' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            { character: 'bolt', as: 'bolt', at: [270, TRIO_Y], scale: TRIO_S },
            { character: 'nova', as: 'nova', at: [810, TRIO_Y], scale: TRIO_S },
            { character: 'vector', as: 'vector', at: VEC_AT, scale: VEC_S },
            castBoard('hit', { alpha: 1 }),
        ]),
        shots: [
            { id: 'x0', sfx: [['whoosh', 0]], dialogue: [says('vector', P[8], 0.3)],
              actions: [
                  rest('bolt'), rest('nova'), rest('vector'),
                  ...express('vector', 'sure', 0.3, { hold: 0.9 }),
                  // He creeps: slow is the whole instruction.
                  ...roll('bolt', { from: [270, TRIO_Y], to: [430, TRIO_Y], at: 0.6,
                                    span: 1.6, scale: TRIO_S }),
                  ...ballBlinks('nova', 2.6, 17),
              ] },
            { id: 'x1', sfx: [['impact', 0.85]], dialogue: [says('nova', P[9], 1.35)],
              actions: [
                  // Contact: Bolt's surface reaches Nova's when the centres
                  // are two radii apart -- 810 - 2 * 120 * 0.72 = 637.
                  // `squash: false` because the impact squash below keys the
                  // same two channels, and two helpers ramping `transform.sx`
                  // over overlapping windows fight.
                  ...roll('bolt', { from: [430, TRIO_Y], to: [637, TRIO_Y], at: 0.1,
                                    span: 0.75, scale: TRIO_S, squash: false }),
                  ...flash('hit', 'hf', 0.85, { peak: 0.3, span: 0.18 }),
                  ...build('hit', hit.rays.ids, 0.85, { gap: 0.01, span: 0.1 }),
                  ...hit.rays.ids.flatMap((id) => conceal('hit', id, 1.0, { span: 0.22 })),
                  ...squash('bolt', 0.85, { scale: TRIO_S, amount: 0.2, span: 0.08 }),
                  ...squash('nova', 0.87, { scale: TRIO_S, amount: 0.2, span: 0.08 }),
                  // He stops dead. She takes all of it. This is the payoff of
                  // line 0, and the reason the hook was worth making.
                  ...roll('nova', { from: [810, TRIO_Y], to: [950, TRIO_Y], at: 1.15,
                                    span: 0.9, scale: TRIO_S, squash: false }),
                  ...express('nova', 'shock', 1.0, { hold: 1.6 }),
                  ...express('bolt', 'doubt', 1.3, { hold: 1.4 }),
              ] },
            { id: 'x2', dialogue: [says('vector', P[10], 0.3)],
              actions: [
                  ...express('vector', 'keen', 0.3, { hold: 2.2 }),
                  ...ballBlinks('bolt', 6.0, 59),
              ] },
        ],
    });

    // --- SCENE 6 — momentum ------------------------------------------------
    scenes.push({
        id: 'mom', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('mom', { alpha: 1 })]),
        shots: [
            { id: 'p0', sfx: [['whoosh', 0], ['pop', 0.45], ['pop', 3.3]], dialogue: [vo(P[11], 0.2)],
              actions: [
                  ...reveal('mom', 'h', 0.15, { span: 0.35 }),
                  ...build('mom', ['mf_bg', 'mf_t', 'mf_n'], 0.45,
                           { gap: 0.15, span: 0.35 }),
                  ...build('mom', [...diagramBallIds('ma'), ...diagramBallIds('mb')],
                           1.3, { gap: 0.05, span: 0.28 }),
                  ...build('mom', ['sc'], 1.9, { gap: 0, span: 0.35 }),
                  // The swap is ACTED, not captioned. Bolt's arrow appears,
                  // then it goes and Nova's arrives in its place — which is
                  // what "they simply swap" means. Revealing both arrows at
                  // once, as the first version did, drew two balls moving
                  // right at the same speed: a picture of the wrong physics,
                  // under narration stating the right physics.
                  ...build('mom', mom.swapL.ids, 2.3, { gap: 0.1, span: 0.3 }),
                  ...mom.swapL.ids.flatMap((id) => conceal('mom', id, 3.1, { span: 0.25 })),
                  ...build('mom', mom.swapR.ids, 3.3, { gap: 0.1, span: 0.3 }),
                  ...pop('mom', 'sn', 3.7, { span: 0.4 }),
              ] },
            { id: 'p1', dialogue: [vo(P[12], 0.2)],
              actions: [
                  ...build('mom', [...diagramBallIds('hl'), ...diagramBallIds('hr')],
                           0.3, { gap: 0.05, span: 0.28 }),
                  ...build('mom', ['hla', 'hra'], 1.1, { gap: 0.12, span: 0.3 }),
                  ...build('mom', ['hn'], 1.7, { gap: 0, span: 0.4 }),
              ] },
        ],
    });

    // --- SCENE 7 — the normal, head-on -------------------------------------
    scenes.push({
        id: 'norm1', palette: 'game',
        background: { color: '#0a0f28' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('norm1', { alpha: 1 })]),
        shots: [
            { id: 'n0', sfx: [['whoosh', 0]], dialogue: [vo(P[13], 0.2)],
              actions: [
                  ...reveal('norm1', 'h', 0.15, { span: 0.35 }),
                  ...build('norm1', [...diagramBallIds('n1a'), ...diagramBallIds('n1b')],
                           0.6, { gap: 0.06, span: 0.3 }),
              ] },
            { id: 'n1', sfx: [['pop', 0.6], ['pop', 1.1]], dialogue: [vo(P[14], 0.2)],
              actions: [
                  ...pop('norm1', 'n1_c', 0.6, { span: 0.3 }),
                  ...reveal('norm1', 'n1_n', 1.1, { span: 0.45 }),
                  ...build('norm1', ['def'], 2.3, { gap: 0, span: 0.4 }),
              ] },
            { id: 'n2', dialogue: [vo(P[15], 0.2)],
              actions: [
                  ...build('norm1', ['not'], 0.4, { gap: 0, span: 0.4 }),
                  // A pulse on the normal, so the words "this direction" have
                  // something to land on.
                  { target: 'norm1', do: 'set', part: 'n1_n', channel: 'transform.sy',
                    value: 1, at: 1.2, ease: 'smooth' },
                  { target: 'norm1', do: 'set', part: 'n1_n', channel: 'transform.sy',
                    value: 1.35, at: 1.45, ease: 'smooth' },
                  { target: 'norm1', do: 'set', part: 'n1_n', channel: 'transform.sy',
                    value: 1, at: 1.75, ease: 'step' },
              ] },
        ],
    });

    // --- SCENE 8 — Nova asks the question the viewer has -------------------
    scenes.push({
        id: 'askn', palette: 'game',
        background: { color: '#10112e' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            { character: 'nova', as: 'nova', at: [LEFT, TALK_Y], scale: TALK_S },
            { character: 'vector', as: 'vector', at: [RIGHT, TALK_Y], scale: 0.62 },
        ]),
        shots: [
            { id: 'q0', sfx: [['whoosh', 0]], dialogue: [says('nova', P[16], 0.3)],
              actions: [
                  rest('nova'), rest('vector'),
                  ...express('nova', 'think', 0.3, { hold: 1.8 }),
                  ...ballBlinks('nova', 4.8, 23),
              ] },
            { id: 'q1', dialogue: [says('vector', P[17], 0.3)],
              actions: [
                  ...express('vector', 'sure', 0.3, { hold: 1.2 }),
                  ...ballBlinks('nova', 3.4, 83),
              ] },
        ],
    });

    // --- SCENE 9 — the split -----------------------------------------------
    scenes.push({
        id: 'norm2', palette: 'game',
        background: { color: '#0a0f28' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('norm2', { alpha: 1 })]),
        shots: [
            { id: 's0', sfx: [['whoosh', 0], ['pop', 1.7], ['pop', 2.1], ['pop', 3.2]], dialogue: [vo(P[18], 0.2)],
              actions: [
                  ...reveal('norm2', 'h', 0.15, { span: 0.35 }),
                  ...build('norm2', [...diagramBallIds('n2a'), ...diagramBallIds('n2b')],
                           0.5, { gap: 0.05, span: 0.28 }),
                  ...build('norm2', [...n2.travel.ids, 'tv'], 1.1,
                           { gap: 0.12, span: 0.3 }),
                  ...pop('norm2', 'n2_c', 1.7, { span: 0.3 }),
                  ...reveal('norm2', 'n2_n', 2.1, { span: 0.45 }),
                  ...build('norm2', ['ln'], 2.7, { gap: 0, span: 0.35 }),
                  ...reveal('norm2', 'n2_t', 3.2, { span: 0.45 }),
                  ...build('norm2', ['lt'], 3.8, { gap: 0, span: 0.35 }),
              ] },
            { id: 's1', dialogue: [vo(P[19], 0.2)],
              actions: [
                  ...build('norm2', ['nn'], 0.3, { gap: 0, span: 0.35 }),
                  ...build('norm2', ['tn'], 2.2, { gap: 0, span: 0.35 }),
              ] },
            { id: 's2', sfx: [['pop', 1.0]], dialogue: [vo(P[20], 0.2)],
              actions: [...pop('norm2', 'pay', 1.0, { span: 0.45 })] },
        ],
    });

    // --- SCENE 10 — Bolt asks about bounce ---------------------------------
    scenes.push({
        id: 'askr', palette: 'game',
        background: { color: '#10112e' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            { character: 'bolt', as: 'bolt', at: [LEFT, TALK_Y], scale: TALK_S },
            { character: 'vector', as: 'vector', at: [RIGHT, TALK_Y], scale: 0.62 },
        ]),
        shots: [
            { id: 'r0', sfx: [['whoosh', 0]], dialogue: [says('bolt', P[21], 0.3)],
              actions: [
                  rest('bolt'), rest('vector'),
                  ...express('bolt', 'doubt', 0.3, { hold: 1.8 }),
                  ...ballBlinks('bolt', 4.8, 31),
              ] },
        ],
    });

    // --- SCENE 11 — restitution --------------------------------------------
    scenes.push({
        id: 'rest', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('rest', { alpha: 1 })]),
        shots: [
            // The three floors go down first, so the frame has its structure
            // while the word is being defined. Same fix as the `build`
            // scene: a heading alone over four seconds is a dead frame.
            { id: 'e0', sfx: [['whoosh', 0]], dialogue: [vo(P[22], 0.2)],
              actions: [
                  ...reveal('rest', 'h', 0.15, { span: 0.35 }),
                  ...build('rest', ['sub'], 0.6, { gap: 0, span: 0.35 }),
                  ...build('rest', ['b1_floor', 'b2_floor', 'b3_floor'], 1.1,
                           { gap: 0.14, span: 0.3 }),
              ] },
            // `.filter` drops the floor each already has. `reveal` ramps from
            // 0, so re-revealing a visible part blinks it off and back on.
            { id: 'e1', sfx: [['pop', 0.3], ['pop', 2.2]], dialogue: [vo(P[23], 0.2)],
              actions: [
                  ...build('rest', rst.a.ids.filter((i) => !i.endsWith('_floor')), 0.3,
                           { gap: 0.08, span: 0.3 }),
                  ...build('rest', ['na'], 1.0, { gap: 0, span: 0.3 }),
                  ...build('rest', rst.b.ids.filter((i) => !i.endsWith('_floor')), 2.2,
                           { gap: 0.08, span: 0.3 }),
                  ...build('rest', ['nb'], 2.9, { gap: 0, span: 0.3 }),
              ] },
            { id: 'e2', sfx: [['pop', 0.4]], dialogue: [vo(P[24], 0.2)],
              actions: [
                  ...build('rest', rst.c.ids.filter((i) => !i.endsWith('_floor')), 0.4,
                           { gap: 0.08, span: 0.3 }),
                  ...build('rest', ['nc'], 1.1, { gap: 0, span: 0.3 }),
              ] },
        ],
    });

    // --- SCENE 12 — the six things -----------------------------------------
    scenes.push({
        id: 'build', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('build', { alpha: 1 })]),
        shots: [
            // The empty frames go up first, then fill. The first version
            // revealed only the heading here, so a four-second line played
            // over a blank grid -- in a motion-graphics film that is the
            // worst frame in the cut, and no checker can see it.
            { id: 'b0', sfx: [['whoosh', 0]] .concat([0,1,2,3,4,5].map((i) => ['tick', 0.5 + i * 0.13])), dialogue: [vo(P[25], 0.2)],
              actions: [
                  ...reveal('build', 'h', 0.15, { span: 0.35 }),
                  ...build('build', bld.rows.rows.slice(0, 6).map((r) => r[0]), 0.5,
                           { gap: 0.13, span: 0.3 }),
              ] },
            // `.slice(1)` drops each row's background, which `b0` already
            // raised. `reveal` ramps from 0, so re-revealing a visible part
            // blinks it off and back on -- the cost of a helper that always
            // starts at zero, and the reason the skip is explicit.
            { id: 'b1', sfx: [['tick', 0.2], ['tick', 1.0], ['tick', 1.9], ['tick', 2.7]], dialogue: [vo(P[26], 0.2)],
              actions: [
                  ...build('build', bld.rows.rowIds(0).slice(1), 0.2, { gap: 0.06, span: 0.3 }),
                  ...build('build', bld.rows.rowIds(1).slice(1), 1.0, { gap: 0.06, span: 0.3 }),
                  ...build('build', bld.rows.rowIds(2).slice(1), 1.9, { gap: 0.06, span: 0.3 }),
                  ...build('build', bld.rows.rowIds(3).slice(1), 2.7, { gap: 0.06, span: 0.3 }),
              ] },
            { id: 'b2', sfx: [['tick', 0.2], ['tick', 1.5]], dialogue: [vo(P[27], 0.2)],
              actions: [
                  ...build('build', bld.rows.rowIds(4).slice(1), 0.2, { gap: 0.06, span: 0.3 }),
                  ...build('build', bld.rows.rowIds(5).slice(1), 1.5, { gap: 0.06, span: 0.3 }),
              ] },
        ],
    });

    // --- SCENE 13 — the seventh, as a tease --------------------------------
    scenes.push({
        id: 'spin', palette: 'game',
        background: { color: '#10112e' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            { character: 'bolt', as: 'bolt', at: [LEFT, TALK_Y], scale: TALK_S },
            { character: 'vector', as: 'vector', at: [RIGHT, TALK_Y], scale: 0.62 },
            castBoard('build', { alpha: 1 }),
        ]),
        shots: [
            { id: 'w0', sfx: [['whoosh', 0]], dialogue: [says('bolt', P[28], 0.3)],
              actions: [
                  rest('bolt'), rest('vector'),
                  ...express('bolt', 'think', 0.3, { hold: 0.8 }),
                  // He spins, which is the question made visible.
                  ...spinMark('bolt', 0.3, 2.0, 3),
                  ...ballBlinks('bolt', 2.6, 43),
              ] },
            { id: 'w1', sfx: [['tick', 1.2]], dialogue: [says('vector', P[29], 0.3)],
              actions: [
                  ...express('vector', 'keen', 0.3, { hold: 1.6 }),
                  ...spinMark('bolt', 0, 4.4, 4),
                  // Row 7 arrives dimmed: it is named, and deferred.
                  ...build('build', bld.rows.rowIds(6), 1.2,
                           { gap: 0.06, span: 0.4, how: (t2, id, at, o) =>
                               reveal(t2, id, at, { ...o, to: 0.55 }) }),
              ] },
        ],
    });

    // --- SCENE 14 — what it builds -----------------------------------------
    scenes.push({
        id: 'games', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('games', { alpha: 1 })]),
        shots: [
            { id: 'g0', sfx: [['whoosh', 0]] .concat([0,1,2,3,4,5].map((i) => ['tick', 0.6 + i * 0.52])), dialogue: [vo(P[30], 0.2)],
              actions: [
                  ...reveal('games', 'h', 0.15, { span: 0.35 }),
                  ...gms.grid.cards.flatMap((ids, i) =>
                      build('games', ids, 0.6 + i * 0.52, { gap: 0.05, span: 0.28 })),
              ] },
            { id: 'g1', sfx: [['pop', 0.25]], dialogue: [vo(P[31], 0.2)],
              actions: [...pop('games', 'gn', 0.25, { span: 0.45 })] },
        ],
    });

    // --- SCENE 15 — the cliffhanger ----------------------------------------
    scenes.push({
        id: 'next', palette: 'game',
        background: { color: '#070c1e' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            { character: 'bolt', as: 'bolt', at: [250, 1270], scale: 0.56 },
            { character: 'nova', as: 'nova', at: [830, 1270], scale: 0.56 },
            { character: 'vector', as: 'vector', at: [540, 1270], scale: 0.42 },
            castBoard('next', { alpha: 1 }),
        ]),
        shots: [
            // The code builds ACROSS all three shots. The first version
            // revealed every line in the last one, which left the panel
            // standing empty for the eight seconds before it -- a hole in
            // the frame exactly where the hook for Part 2 is supposed to be.
            { id: 'z0', sfx: [['whoosh', 0], ['tick', 1.5]], dialogue: [says('bolt', P[32], 0.3)],
              actions: [
                  rest('bolt'), rest('nova'), rest('vector'),
                  ...express('bolt', 'think', 0.3, { hold: 1.2 }),
                  ...reveal('next', 'nk', 0.1, { span: 0.3 }),
                  ...reveal('next', 'cd_bg', 0.3, { span: 0.4 }),
                  ...reveal('next', 'cd_t', 0.8, { span: 0.3 }),
                  ...build('next', nxt.code.lineIds(0), 1.5, { gap: 0.03, span: 0.22 }),
                  ...ballBlinks('nova', 3.4, 61),
              ] },
            { id: 'z1', sfx: [['tick', 0.4], ['tick', 1.6]], dialogue: [says('nova', P[33], 0.3)],
              actions: [
                  ...express('nova', 'doubt', 0.3, { hold: 1.4 }),
                  ...build('next', nxt.code.lineIds(1), 0.4, { gap: 0.03, span: 0.22 }),
                  ...build('next', nxt.code.lineIds(2), 1.6, { gap: 0.03, span: 0.22 }),
                  ...ballBlinks('bolt', 3.6, 79),
              ] },
            { id: 'z2', sfx: [['tick', 0.4], ['tick', 1.1], ['tick', 1.8]], dialogue: [says('vector', P[34], 0.3)],
              actions: [
                  ...express('vector', 'keen', 0.3, { hold: 2.0 }),
                  ...[3, 4, 5].flatMap((i, k) =>
                      build('next', nxt.code.lineIds(i), 0.4 + k * 0.7,
                            { gap: 0.03, span: 0.22 })),
                  ...ballBlinks('bolt', 4.6, 101),
              ] },
        ],
    });

    // --- SCENE 16 — the end card -------------------------------------------
    // Six seconds, and it carries all three asks. `27-RETENTION.md` rule 7.
    scenes.push({
        id: 'card', palette: 'game',
        background: { color: '#04060f' },
        transitionIn: { kind: 'crossfade', duration: 0.4 },
        cast: [offstage('vector'), castBoard('card', { alpha: 1 })],
        shots: [
            { id: 'c0', sfx: [['riser', 0, 0.42]], dialogue: [vo(P[35], 0.3)],
              actions: [
                  ...build('card', card.ids.slice(0, 2), 0.15, { gap: 0.25, span: 0.45 }),
                  ...build('card', card.ids.slice(2), 1.5, { gap: 0.22, span: 0.4 }),
              ] },
        ],
    });

    // `liftSfx` AFTER `fitShots`: it sums the shot durations that `fitShots`
    // derives from the narration, so running it first places every cue but
    // the first at the wrong moment.
    return liftSfx(fitShots({
        version: 'jirex.film/1',
        meta: { ...META(T.title), estimatedTiming: true },
        assets: SFX_ASSETS,
        palettes: { game: GAME_PALETTE },
        voices: voicesFor(),
        characters,
        scenes,
    }));
}
