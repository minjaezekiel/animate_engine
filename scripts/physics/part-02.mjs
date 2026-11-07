/**
 * Part 2 — "Did they even touch?".
 *
 * Collision DETECTION: the question a game asks sixty times a second, the
 * two tests that answer it for circles and for boxes, the reason fast things
 * pass through walls, and the push that stops two balls living inside each
 * other. Which is the question part one ended on.
 *
 * ## The physics, and where it is exact
 *
 * Almost everything here is exact rather than conditional, which makes this
 * the one part of the series where the honest thing is to say so.
 *
 * - **Two circles overlap when the distance between their centres is less
 *   than the sum of their radii.** Exact, with no conditions at all. It is
 *   the reason circles are the shape every physics tutorial starts with.
 * - **Comparing squares avoids the square root.** `d² < (rA+rB)²` is
 *   equivalent for non-negative lengths, which both of these always are.
 *   Not an approximation — the same test, cheaper.
 * - **Two axis-aligned boxes overlap when they overlap on both axes.**
 *   Exact, and four comparisons. The word *axis-aligned* is load-bearing and
 *   is said out loud: rotate either box and this test is simply wrong, which
 *   is why the narration promises nothing about rotated shapes.
 * - **Tunnelling is a property of discrete time, not a bug in the test.**
 *   A game does not move anything continuously; it teleports it once a
 *   frame. Between two frames the object was never anywhere. The narration
 *   says this plainly because "collision detection is unreliable" is the
 *   wrong lesson and "your simulation has no in-between" is the right one.
 * - **Separating overlapping circles along the normal, split by inverse
 *   mass,** is the standard positional correction. It is not a force and it
 *   does not conserve anything — it is a teleport that undoes a teleport,
 *   and the film says so rather than implying it is physics.
 *
 * ## What it does NOT claim
 *
 * No rotated shapes, no polygons, no spatial hashing beyond naming the idea,
 * and no continuous collision detection beyond naming it as the real fix.
 * Each of those is a part of its own or a pointer at the end of part seven.
 */
import {
    BOLT, FONT, GAME_PALETTE, L, M, NOVA, SAFE, VECTOR, Z, ballBlinks,
    bannerParts, board, boxParts, build, castBoard, claimParts, codePanelParts,
    compareParts, conceal, countTo, diagramBall, diagramBallIds, distanceParts,
    ellipsePart, endCard, express, fitShots, flash, flashPart, formulaParts,
    ghostTrail, gridScenery, headingPart, hideBall, hookTitle, impactParts, liftSfx,
    noteParts, pathPart, pop, readoutParts, rectPart, rest, reveal, revealTo,
    roll, roundRect, SFX_ASSETS, shiftBy, showBall, spinMark, squash, stepRows,
    textPart, titleAt,
    vectorArrow, wallParts,
} from './common.mjs';
import { META, voicesFor } from '../lib/physics.mjs';

const PART = 2;

// ---------------------------------------------------------------------------
// Staging constants — the same stage marks as part one, so the series cuts
// together rather than restaging itself every film.
// ---------------------------------------------------------------------------

const TALK_Y = 950;
const TALK_S = 0.82;
const LEFT = 300;
const RIGHT = 780;
const TRIO_Y = 1010;
const TRIO_S = 0.72;
const VEC_AT = [540, 640];
const VEC_S = 0.52;
const HEAD_Y = 536;

// ---------------------------------------------------------------------------
// The narration
// ---------------------------------------------------------------------------

const P = [
    /* 0  BOLT   */ 'Watch this. I am going to hit Nova at full speed.',
    /* 1  NOVA   */ 'You went straight through me. Nothing happened at all.',
    /* 2  VECTOR */ 'He did. And your game will do that too, until you tell it not to.',
    /* 3  VECTOR */ 'Because a game does not move anything. It teleports it, sixty times '
        + 'a second.',
    /* 4  VECTOR */ 'Every frame: pick up each object, drop it somewhere new, draw it.',
    /* 5  VECTOR */ 'Nothing happened in between. There is no in between.',
    /* 6  VECTOR */ 'So the only question you can ask is: in this frame, is anything '
        + 'overlapping?',
    /* 7  VECTOR */ 'For two circles that is one measurement.',
    /* 8  VECTOR */ 'The distance between the centres, against the two radii added up.',
    /* 9  VECTOR */ 'Shorter means they are inside each other. That is the whole test.',
    /*10  BOLT   */ 'That is it? No conditions, no special cases?',
    /*11  VECTOR */ 'None. Which is why every physics engine starts with circles.',
    /*12  VECTOR */ 'Four lines of Python. Subtract, measure, compare.',
    /*13  VECTOR */ 'And a free speed-up: never take that square root.',
    /*14  VECTOR */ 'Compare the squares instead. Same answer, and square roots are slow.',
    /*15  VECTOR */ 'Boxes are just as cheap. Do they overlap across, and do they overlap '
        + 'up and down?',
    /*16  VECTOR */ 'Both, and they are touching. Either one fails and they are not.',
    /*17  NOVA   */ 'So why would I ever use circles?',
    /*18  VECTOR */ 'Use both. Boxes to throw away the pairs that cannot possibly touch.',
    /*19  VECTOR */ 'Then the real test on the handful that are left.',
    /*20  VECTOR */ 'Now, the bug that will cost you an afternoon.',
    /*21  VECTOR */ 'Bolt moved four hundred pixels in one frame. The wall is ten thick.',
    /*22  VECTOR */ 'He was in front of it, then behind it. Never inside it.',
    /*23  BOLT   */ 'So the game was right. I never touched it.',
    /*24  VECTOR */ 'Exactly. Take smaller steps, or test the whole path, not the '
        + 'endpoints.',
    /*25  NOVA   */ 'And last time we got stuck inside each other. Fix that.',
    /*26  VECTOR */ 'Overlap is a measurement too. Radii added up, minus the distance.',
    /*27  VECTOR */ 'Push them apart along the line through both centres by exactly that '
        + 'much.',
    /*28  VECTOR */ 'Half each if they match. The heavier one moves less.',
    /*29  VECTOR */ 'And be honest: that is not physics. It is a teleport undoing a '
        + 'teleport.',
    /*30  VECTOR */ 'Do it first, every time, before you change a single velocity.',
    /*31  VECTOR */ 'Three of the six are yours now: position, velocity, detection.',
    /*32  BOLT   */ 'We know we touched. We still do not know which way to go.',
    /*33  VECTOR */ 'Next time: the normal, properly. The direction every collision '
        + 'actually pushes.',
    /*34  VECTOR */ "Follow, and I'll see you in part three.",
];

// ---------------------------------------------------------------------------
// On-screen text — shorter and blunter than the narration, because a muted
// viewer reads this instead of hearing that.
// ---------------------------------------------------------------------------

const T = {
    kicker: `GAME PHYSICS  ·  PART ${PART}`,
    title: 'Did they even touch?',
    sub: 'collision detection · in Python',

    missH: 'NO COLLISION DETECTED',
    missN: 'the game was not wrong. it was never asked.',

    frH: 'A GAME HAS NO IN-BETWEEN',
    frN: 'one frame  ·  one position  ·  nothing in the gaps',
    frStep: 'frame',
    frGap: 'in red: time your game never computed',

    cH: 'TWO CIRCLES',
    cTest: 'd   <   r₁ + r₂',
    cNote: 'distance between centres  <  the two radii added up',
    cRead: 'DISTANCE',
    cSum: 'r₁ + r₂  =  220',
    cVerdict: 'OVERLAPPING',
    cVerdictNo: 'NOT TOUCHING',

    sqH: 'SKIP THE SQUARE ROOT',
    sqF: 'dx² + dy²   <   ( r₁ + r₂ )²',
    sqN: 'same answer, and no square root at all',

    bH: 'TWO BOXES',
    bX: 'overlap across?',
    bY: 'up and down?',
    bN: 'both  →  touching.   either one fails  →  not touching.',
    bAxis: 'axis-aligned only. rotate a box and this test is simply wrong.',

    phH: 'CHEAP FIRST, EXACT SECOND',
    phL: ['BROAD PHASE', 'boxes around everything.\nthrow away the pairs that\ncannot possibly touch.'],
    phR: ['NARROW PHASE', 'the real test, on the\nfew pairs that are left.\nexact, and worth it.'],

    tH: 'WHY FAST THINGS GO THROUGH WALLS',
    tN: 'in front of it, then behind it  ·  never inside it',
    tFix: 'smaller steps, or test the whole path',
    tSpeed: 'STEP PER FRAME',

    pH: 'PUSH THEM APART FIRST',
    pF: 'overlap  =  r₁ + r₂  −  d',
    pN: 'move each one along the normal, by its share of the overlap',
    pHonest: 'not physics — a teleport undoing a teleport',
    pOrder: 'separate, THEN change the velocities. always that order.',

    stH: 'THREE OF SIX',
    steps: [
        [1, 'POSITION', 'where is it', '#36e3ff'],
        [2, 'VELOCITY', 'how fast, and which way', '#36e3ff'],
        [3, 'DETECTION', 'did they touch  —  this part', '#ffd23d'],
        [4, 'NORMAL', 'which way did the hit push', '#ff4d8d'],
        [5, 'RESPONSE', 'change both velocities', '#8e7bff'],
        [6, 'RESTITUTION', 'how much bounce survives', '#3ddc84'],
    ],

    codeT: '# circle on circle  —  the whole test',
    code2T: '# and the push that stops them sticking',
    nextK: `NEXT  ·  PART ${PART + 1}`,
    next: 'The collision normal,\nproperly',
};

/** The detection test, in Python that runs. */
const CODE = [
    [0, [['codeCmt', '# a, b: circles with .x .y .r']]],
    [0, [['codeFn', 'dx, dy'], ['ink', ' = b.x - a.x, b.y - a.y']]],
    [0, [['codeFn', 'd'], ['ink', '      = math.hypot(dx, dy)']]],
    [0, [['codeKey', 'if'], ['ink', ' d < a.r + b.r:'], ['codeCmt', '      # touching']]],
];

/** The same test with no square root, which is how it is actually written. */
const CODE_SQ = [
    [0, [['codeFn', 'r'], ['ink', '  = a.r + b.r']]],
    [0, [['codeKey', 'if'], ['ink', ' dx*dx + dy*dy < r*r:'], ['codeCmt', '   # touching']]],
];

/** The separation, split by inverse mass. */
const CODE_PUSH = [
    [0, [['codeFn', 'overlap'], ['ink', ' = (a.r + b.r) - d']]],
    [0, [['codeFn', 'nx, ny'], ['ink', '  = dx / d, dy / d']]],
    [0, [['codeFn', 'inv'], ['ink', '     = 1/a.m + 1/b.m']]],
    [0, [['ink', 'a.x -= nx * overlap * (1/a.m) / inv']]],
    [0, [['ink', 'b.x += nx * overlap * (1/b.m) / inv']]],
    [0, [['codeCmt', '# ... and the same two lines for y']]],
];

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

/**
 * SCENE 1 — the hook: he goes straight through her.
 *
 * The stamp is the joke and the thesis at once. A viewer who has written any
 * game at all has seen exactly this, which is the whole reason it opens the
 * part: it is the one collision bug everybody meets on their first day.
 */
function boardThru() {
    const stamp = [
        pathPart('st_bg', roundRect(140, 1150, 800, 136, 20),
                 { fill: 'bgDeep', stroke: 'loss', strokeWidth: 4, z: 300, alpha: 0 }),
        textPart('st_t', T.missH, { at: [540, 1220], font: `800 46px ${FONT}`,
                                    fill: 'loss', z: 301, alpha: 0,
                                    maxWidth: 740 }),
        textPart('st_n', T.missN, { at: [540, 1338], font: `700 28px ${FONT}`,
                                    fill: 'dim', z: 301, alpha: 0,
                                    maxWidth: SAFE.x1 - SAFE.x0 }),
    ];
    /**
     * Speed lines.
     *
     * The first version put a ghost trail under the characters here, where
     * it read as four holes in the floor rather than as four frames -- and
     * the idea it was reaching for belongs to scene two, which has a whole
     * frame to say it in. What this shot needs instead is the oldest
     * shorthand in cartooning: a few streaks that say "something went
     * through here, fast", legible in a single frame and in a thumbnail.
     */
    const streaks = [
        [820, 788, 5], [905, 840, 7], [860, 896, 6], [760, 950, 5],
    ].map(([len, y, w], i) => pathPart(`sk${i}`,
        `${M(960 - len, y)} ${L(960, y)}`,
        { stroke: 'cue', strokeWidth: w, z: 8, alpha: 0, lineCap: 'round' }));
    return {
        ...board('thru', [
            ...streaks, ...stamp, flashPart('fl'),
            ...hookTitle(T.kicker, T.title, T.sub),
        ]),
        stampIds: stamp.map((p) => p.id),
        streakIds: streaks.map((p) => p.id),
    };
}

/** SCENE 2 — the title card: a frame is a photograph, not a film. */
function boardFrames() {
    // Six positions, evenly spaced, which is what constant velocity looks
    // like when time is chopped up: the gaps are equal and they are REAL.
    //
    // Radius 42 against a 150 pitch, so consecutive frames are 66 apart. At
    // the first version's 56 they touched, and a row of touching circles
    // reads as a continuous smear -- the exact opposite of the claim the
    // board is making.
    const xs = [150, 300, 450, 600, 750, 900];
    const R = 42;
    const gh = ghostTrail('fg', xs.map((x) => [x, 900]), R,
                          { base: 'velocity', z: 20, alpha: 0.9, fade: false });
    const ticks = xs.map((x, i) => [
        pathPart(`ft${i}`, `${M(x, 968)} ${L(x, 1000)}`,
                 { stroke: 'dim', strokeWidth: 3, z: 22, alpha: 0 }),
        textPart(`fn${i}`, String(i + 1), { at: [x, 1040], font: `700 26px ${FONT}`,
                                            fill: 'dim', z: 22, alpha: 0 }),
    ]);
    // The gaps: the part of the picture that says "nothing happened here",
    // derived from the radius so they cannot creep under the circles.
    const gaps = xs.slice(0, -1).map((x, i) => pathPart(`fgp${i}`,
        `${M(x + R + 8, 900)} ${L(x + 150 - R - 8, 900)}`,
        { stroke: 'loss', strokeWidth: 5, z: 18, alpha: 0 }));
    return {
        ...board('frames', [
            ...claimParts('fc', T.frH, { at: [540, 640], size: 60, sub: T.frN }),
            ...gh.parts, ...ticks.flat(), ...gaps,
            ...noteParts('fnote', T.frGap, { at: [540, 1140], fill: 'loss', size: 30 }),
        ]),
        gh, tickIds: ticks.flat().map((p) => p.id), gapIds: gaps.map((p) => p.id),
    };
}

/**
 * SCENE 3 — the distance test, with the number on screen.
 *
 * The readout is the point of this board. A static label saying "distance"
 * teaches a word; a number falling to 196 while the circles close teaches
 * what the word measures, and the viewer never has to be told which number
 * the diagram is about. It is the first use of the `count` verb and the
 * reason that verb exists.
 */
function boardCircles() {
    // Laid out from the bottom up: the subtitle band owns everything below
    // about 1460, so the verdict sets the floor and the rest stacks above
    // it. Doing it the other way round is how part one's first pass put a
    // readout underneath the subtitles.
    const A = [336, 830];
    const B = [696, 830];
    const dist = distanceParts('dp', A, B, { rA: 104, rB: 104, bar: true,
                                             barY: 1180 });
    const read = readoutParts('rd', T.cRead, { at: [540, 1030], initial: '360 px',
                                               fill: 'momentum', chipW: 420 });
    return {
        ...board('circles', [
            headingPart('h', T.cH, { y: 500, fill: 'velocity', size: 50 }),
            ...formulaParts('cf', T.cTest, { at: [540, 600], fill: 'velocity', size: 46,
                                             note: T.cNote }),
            ...diagramBall('ca', A, 104),
            ...diagramBall('cb', B, 104, { base: 'nova', baseDark: 'novaDark' }),
            ...dist.parts,
            ...read.parts,
            // Two verdicts, one per state, so the words on screen are never
            // the wrong ones for the picture behind them. The first version
            // had a single caption that said OVERLAPPING while the bars
            // still showed the circles apart.
            textPart('cv0', T.cVerdictNo, { at: [540, 1360], font: `800 42px ${FONT}`,
                                            fill: 'dim', z: 94, alpha: 0,
                                            maxWidth: SAFE.x1 - SAFE.x0 }),
            textPart('cv1', T.cVerdict, { at: [540, 1360], font: `800 44px ${FONT}`,
                                          fill: 'loss', z: 95, alpha: 0,
                                          maxWidth: SAFE.x1 - SAFE.x0 }),
        ]),
        dist, read, A, B,
    };
}

/** SCENE 4 — the four lines, and then the two. */
function boardCode() {
    const code = codePanelParts('cd', CODE, { x: 80, y: 640, w: 920, lh: 48, size: 28,
                                              title: T.codeT });
    const sq = codePanelParts('sq', CODE_SQ, { x: 80, y: 1050, w: 920, lh: 48, size: 28,
                                               title: T.code2T === null ? null : '# the same test, cheaper' });
    return {
        ...board('code', [
            headingPart('h', T.sqH, { y: HEAD_Y, fill: 'momentum', size: 44 }),
            ...code.parts, ...sq.parts,
            ...noteParts('sn', T.sqN, { at: [540, 1300], fill: 'momentum', size: 30 }),
        ]),
        code, sq,
    };
}

/** SCENE 5 — boxes: four comparisons, and the word that limits them. */
function boardBoxes() {
    const a = boxParts('bxa', { x: 200, y: 760, w: 330, h: 250, fill: 'velocity',
                                label: 'A' });
    const b = boxParts('bxb', { x: 430, y: 880, w: 330, h: 250, fill: 'normal',
                                label: 'B' });
    // The two overlaps, drawn as the spans they are: this is the test, and it
    // is two one-dimensional questions rather than one two-dimensional one.
    const ox = [
        pathPart('ovx', `${M(430, 1190)} ${L(530, 1190)}`,
                 { stroke: 'momentum', strokeWidth: 12, z: 60, alpha: 0,
                   lineCap: 'round' }),
        textPart('ovxl', T.bX, { at: [480, 1240], font: `700 26px ${FONT}`,
                                 fill: 'momentum', z: 60, alpha: 0, maxWidth: 420 }),
    ];
    const oy = [
        pathPart('ovy', `${M(840, 880)} ${L(840, 1010)}`,
                 { stroke: 'momentum', strokeWidth: 12, z: 60, alpha: 0,
                   lineCap: 'round' }),
        // Centred UNDER its own bar rather than beside it: beside it, a
        // two-word wrap ran off the right edge of the safe area.
        textPart('ovyl', T.bY, { at: [860, 1070], font: `700 26px ${FONT}`,
                                 fill: 'momentum', z: 60, alpha: 0,
                                 maxWidth: 300, lineHeight: 32 }),
    ];
    return {
        ...board('boxes', [
            headingPart('h', T.bH, { y: HEAD_Y, fill: 'normal', size: 54 }),
            ...a.parts, ...b.parts, ...ox, ...oy,
            ...noteParts('bn', T.bN, { at: [540, 1312], fill: 'ink', size: 31 }),
            ...noteParts('ba', T.bAxis, { at: [540, 1378], fill: 'dim', size: 26 }),
        ]),
        a, b, oxIds: ox.map((p) => p.id), oyIds: oy.map((p) => p.id),
    };
}

/** SCENE 6 — broad phase, narrow phase. */
function boardPhase() {
    const cmp = compareParts('ph', T.phL, T.phR, { y: 700, h: 360, accentL: 'momentum',
                                                   accentR: 'velocity' });
    return {
        ...board('phase', [
            headingPart('h', T.phH, { y: HEAD_Y, fill: 'ink', size: 46 }),
            ...cmp.parts,
            ...noteParts('pn', 'a hundred objects is five thousand pairs. '
                + 'you cannot test them all properly.',
                         { at: [540, 1180], fill: 'dim', size: 28 }),
        ]),
        cmp,
    };
}

/**
 * SCENE 7 — tunnelling, and the step size that causes it.
 *
 * Two ghosts and a thin wall between them, with nothing drawn where the ball
 * would have been. That absence IS the lesson, so the figure is deliberately
 * mostly empty: the frame the collision happened in does not exist.
 */
function boardTunnel() {
    const wall = wallParts('tw', [640, 760], [640, 1140], { thickness: 12,
                                                            toward: [300, 960],
                                                            normal: false });
    const gh = ghostTrail('tg', [[300, 950], [980, 950]], 74,
                          { base: 'cue', z: 20, alpha: 0.9, fade: false });
    const miss = ellipsePart('tm', 74, 74, { at: [640, 950], stroke: 'loss',
                                             strokeWidth: 5, z: 22, alpha: 0 });
    const arrow = vectorArrow('ta', [374, 950], [906, 950], { width: 10, head: 28,
                                                              fill: 'velocity' });
    // 'STEP PER FRAME' on the label and bare pixels in the value: with the
    // units in the value it wrapped to two lines inside a fixed-height chip
    // and printed straight through its own label.
    const read = readoutParts('tr', T.tSpeed, { at: [540, 1285], initial: '0 px',
                                                fill: 'loss', chipW: 460,
                                                labelSize: 25 });
    return {
        ...board('tunnel', [
            headingPart('h', T.tH, { y: HEAD_Y, fill: 'loss', size: 44 }),
            ...wall.parts, ...gh.parts, miss, ...arrow.parts, ...read.parts,
            ...noteParts('tn', T.tN, { at: [540, 1175], fill: 'loss', size: 31 }),
            ...noteParts('tf', T.tFix, { at: [540, 1395], fill: 'restitution',
                                         size: 32 }),
        ]),
        wall, gh, arrow, read,
    };
}

/** SCENE 8 — the push, and the admission that it is not physics. */
function boardPush() {
    // Overlapping on purpose: this is the state the push exists to undo.
    const A = [430, 950];
    const B = [630, 950];
    const dist = distanceParts('pd', A, B, { rA: 120, rB: 120, bar: false });
    const out = [
        vectorArrow('pl', [430, 950], [300, 950], { width: 9, head: 24,
                                                    fill: 'normal' }).parts,
        vectorArrow('pr', [630, 950], [760, 950], { width: 9, head: 24,
                                                    fill: 'normal' }).parts,
    ].flat();
    return {
        ...board('push', [
            headingPart('h', T.pH, { y: HEAD_Y, fill: 'normal', size: 48 }),
            ...diagramBall('pa', A, 120),
            ...diagramBall('pb', B, 120, { base: 'nova', baseDark: 'novaDark' }),
            ...dist.parts, ...out,
            ...formulaParts('pf', T.pF, { at: [540, 1210], fill: 'normal', size: 44,
                                          note: T.pN }),
            ...noteParts('ph2', T.pHonest, { at: [540, 1356], fill: 'dim', size: 28 }),
            ...noteParts('po', T.pOrder, { at: [540, 1412], fill: 'momentum',
                                           size: 30 }),
        ]),
        dist, outIds: out.map((p) => p.id),
    };
}

/** SCENE 9 — the separation code. */
function boardCode2() {
    const code = codePanelParts('c2', CODE_PUSH, { x: 70, y: 620, w: 940, lh: 46,
                                                   size: 26, title: T.code2T });
    return {
        ...board('code2', [
            ...code.parts,
            ...noteParts('c2n', 'the heavier one moves less, because 1/m is smaller',
                         { at: [540, 1010], fill: 'dim', size: 27 }),
        ]),
        code,
    };
}

/** SCENE 10 — three of six, and the three still owed. */
function boardSteps() {
    const rows = stepRows('sr', T.steps, { y: 580, h: 96, gap: 11 });
    return {
        ...board('steps', [
            headingPart('h', T.stH, { y: HEAD_Y, fill: 'momentum', size: 44 }),
            ...rows.parts,
        ]),
        rows,
    };
}

/** SCENE 11 — the cliffhanger: they touched, and nobody knows which way. */
function boardNext() {
    const A = [360, 860];
    const B = [640, 980];
    // The candidate directions fan out from NOVA, because she is the one
    // the question is about. The first version radiated them from a point
    // between the two balls, where they read as a star drawn on the floor
    // and two of them ran straight through Bolt.
    const ways = [-1.25, -0.75, -0.25, 0.25, 0.75].map((a, i) => pathPart(`wy${i}`,
        `${M(B[0] + Math.cos(a) * 120, B[1] + Math.sin(a) * 120)} `
        + `${L(B[0] + Math.cos(a) * 300, B[1] + Math.sin(a) * 300)}`,
        { stroke: 'dim', strokeWidth: 5, z: 50, alpha: 0, lineCap: 'round' }));
    return {
        ...board('next', [
            ...diagramBall('na', A, 104),
            ...diagramBall('nb', B, 104, { base: 'nova', baseDark: 'novaDark' }),
            ...ways,
            textPart('qm', '?', { at: [760, 660], font: `800 150px ${FONT}`,
                                  fill: 'normal', z: 95, alpha: 0 }),
            textPart('nk', T.nextK, { at: [540, 1250], font: `700 32px ${FONT}`,
                                      fill: 'velocity', z: 90, alpha: 0 }),
            textPart('nt', 'which way?', { at: [540, 1340], font: `800 54px ${FONT}`,
                                           fill: 'ink', z: 90, alpha: 0,
                                           maxWidth: SAFE.x1 - SAFE.x0 }),
        ]),
        wayIds: ways.map((p) => p.id),
    };
}

/** SCENE 1's acted furniture: the pass-through, and the stamp's flash. */
function boardHit() {
    const rays = impactParts('hr', [540, TRIO_Y], { n: 10, r0: 70, r1: 150,
                                                    fill: 'loss' });
    return { ...board('hit', [...rays.parts, flashPart('hf')]), rays };
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

export function partTwo() {
    const thru = boardThru();
    const frames = boardFrames();
    const circles = boardCircles();
    const code = boardCode();
    const boxes = boardBoxes();
    const phase = boardPhase();
    const tunnel = boardTunnel();
    const push = boardPush();
    const code2 = boardCode2();
    const steps = boardSteps();
    const nxt = boardNext();
    const hit = boardHit();
    const card = endCard(T.next, PART);
    const ban = bannerParts(PART);

    const boards = [thru, frames, circles, code, boxes, phase, tunnel, push,
                    code2, steps, nxt, hit,
                    board('card', card.parts), board('ban', ban)];

    const characters = { bolt: BOLT, nova: NOVA, vector: VECTOR };
    for (const b of boards) {
        characters[b.name] = { role: 'effect', palette: 'game', parts: b.parts };
    }

    const withBan = (cast) => [...cast, castBoard('ban', { alpha: 1 })];
    const grid = gridScenery();
    const scenes = [];

    // --- SCENE 1 — the hook: straight through her -------------------------
    // No title card for the first four seconds. The bug owns them.
    scenes.push({
        id: 'thru', palette: 'game',
        background: { color: '#04060f' },
        transitionIn: { kind: 'fade', from: '#000000', duration: 0.5 },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            castBoard('thru', { alpha: 1 }),
            castBoard('hit', { alpha: 1 }),
            // Bigger and higher than part one's three-shot. Two balls in a
            // 1080x1920 frame have to carry the whole hook, and at part
            // one's 0.72 they sat in the bottom third with two-thirds of the
            // frame empty above them.
            { character: 'bolt', as: 'bolt', at: [160, 870], scale: 0.92 },
            { character: 'nova', as: 'nova', at: [620, 870], scale: 0.92 },
            { character: 'vector', as: 'vector', at: [880, 620], scale: 0.42,
              alpha: 0 },
        ]),
        shots: [
            { id: 'h0', sfx: [['whoosh', 0.5], ['riser', 2.2, 0.32]],
              dialogue: [says('bolt', P[0], 0.28)],
              actions: [
                  rest('bolt'), rest('nova'), rest('vector'),
                  ...express('bolt', 'sure', 0.35, { hold: 0.9 }),
                  // Straight through her and out the other side. No squash,
                  // no impact, no rays: the absence of all three IS the hook,
                  // and any one of them would soften it into a near miss.
                  ...roll('bolt', { from: [160, 870], to: [950, 870], at: 0.5,
                                    span: 0.6, scale: 0.92 }),
                  // They arrive as he ARRIVES, not as he leaves. A streak is
                  // what a fast object leaves behind it, so one drawn to his
                  // destination while he is still halfway there points at
                  // empty frame.
                  ...build('thru', thru.streakIds, 0.88,
                           { gap: 0.03, span: 0.1,
                             how: (t2, id, a, o) => reveal(t2, id, a, { ...o, to: 0.22 }) }),
                  ...thru.streakIds.flatMap((id) =>
                      conceal('thru', id, 1.5, { span: 0.45, from: 0.22 })),
                  ...express('nova', 'shock', 0.85, { hold: 1.4 }),
                  ...ballBlinks('nova', 4.4, 29),
              ] },
            { id: 'h1', sfx: [['pop', 1.1]], dialogue: [says('nova', P[1], 0.22)],
              actions: [
                  ...express('nova', 'doubt', 0.25, { hold: 1.4 }),
                  ...flash('thru', 'fl', 1.1, { peak: 0.18, span: 0.18 }),
                  ...build('thru', thru.stampIds, 1.1, { gap: 0.2, span: 0.35,
                                                         how: pop }),
                  // The title arrives at the top while the stamp holds the
                  // bottom: different thirds of the frame, so neither has to
                  // wait for the other.
                  ...build('thru', ['kicker', 'title', 'titlesub'], 2.3,
                           { gap: 0.2, span: 0.45 }),
                  ...ballBlinks('bolt', 4.6, 11),
              ] },
            { id: 'h2', sfx: [['pop', 0.1]], dialogue: [says('vector', P[2], 0.24)],
              actions: [
                  { target: 'vector', do: 'show', at: 0.1, for: 0.35 },
                  ...express('vector', 'keen', 0.4, { hold: 1.8 }),
                  ...thru.stampIds.flatMap((id) => conceal('thru', id, 1.4,
                                                           { span: 0.35 })),
                  ...ballBlinks('nova', 5.4, 97),
              ] },
        ],
    });

    // --- SCENE 2 — a game has no in-between -------------------------------
    scenes.push({
        id: 'frames', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('frames', { alpha: 1 })]),
        shots: [
            { id: 'f0', sfx: [['whoosh', 0], ['pop', 0.15]], dialogue: [vo(P[3], 0.2)],
              actions: [
                  ...build('frames', ['fc_t', 'fc_s'], 0.15, { gap: 0.22, span: 0.4 }),
              ] },
            { id: 'f1', sfx: [0, 1, 2, 3, 4, 5].map((i) => ['tick', 0.3 + i * 0.36]),
              dialogue: [vo(P[4], 0.2)],
              actions: [
                  // One ghost per frame, laid down in time. The rhythm is the
                  // teaching: six discrete events, evenly spaced.
                  ...frames.gh.ids.flatMap((id, i) =>
                      reveal('frames', id, 0.3 + i * 0.36, { span: 0.14 })),
                  ...frames.tickIds.flatMap((id, i) =>
                      reveal('frames', id, 0.34 + Math.floor(i / 2) * 0.36,
                             { span: 0.14 })),
              ] },
            { id: 'f2', sfx: [['pop', 0.4]], dialogue: [vo(P[5], 0.2)],
              actions: [
                  ...build('frames', frames.gapIds, 0.4, { gap: 0.08, span: 0.25 }),
                  ...reveal('frames', 'fnote', 1.1, { span: 0.4 }),
              ] },
        ],
    });

    // --- SCENE 3 — the distance test --------------------------------------
    scenes.push({
        id: 'circles', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('circles', { alpha: 1 })]),
        shots: [
            { id: 'c0', sfx: [['whoosh', 0], ['pop', 0.9]], dialogue: [vo(P[6], 0.2)],
              actions: [
                  ...reveal('circles', 'h', 0.15, { span: 0.35 }),
                  ...showBall('circles', 'ca', 0.5),
                  ...showBall('circles', 'cb', 0.7),
                  ...build('circles', ['cf_bg', 'cf_t', 'cf_n'], 1.3,
                           { gap: 0.14, span: 0.4 }),
              ] },
            { id: 'c1', sfx: [['tick', 0.3], ['pop', 1.5]], dialogue: [vo(P[7], 0.2)],
              actions: [
                  ...build('circles', circles.dist.lineIds, 0.3,
                           { gap: 0.08, span: 0.35 }),
                  ...build('circles', circles.read.ids, 1.0, { gap: 0.12, span: 0.3 }),
              ] },
            { id: 'c2', sfx: [['tick', 0.3], ['tick', 0.7], ['pop', 1.8]],
              dialogue: [vo(P[8], 0.2)],
              actions: [
                  ...build('circles', circles.dist.radiusIds, 0.3,
                           { gap: 0.35, span: 0.3 }),
                  ...build('circles', circles.dist.barIds, 1.1,
                           { gap: 0.16, span: 0.3 }),
                  // The bars say "apart", so the caption has to as well.
                  ...reveal('circles', 'cv0', 2.1, { span: 0.4, to: 0.8 }),
              ] },
            { id: 'c3', sfx: [['impact', 1.6]], dialogue: [vo(P[9], 0.2)],
              actions: [
                  // Everything that means "the distance" moves at once: the
                  // circle, the span, the far dot, the bar and the number.
                  // Any one of them left behind turns the figure into a
                  // picture that disagrees with itself.
                  ...shiftBy('circles', diagramBallIds('cb'), [-180, 0], 0.4,
                             { span: 1.2 }),
                  ...circles.dist.closeTo('circles', 180, 0.4, { span: 1.2 }),
                  ...countTo('circles', circles.read.value,
                             { from: 360, to: 180, at: 0.4, span: 1.2,
                               suffix: ' px' }),
                  ...conceal('circles', 'cv0', 1.5, { span: 0.2, from: 0.8 }),
                  ...pop('circles', 'cv1', 1.65, { span: 0.4 }),
              ] },
        ],
    });

    // --- SCENE 4 — four lines, then two -----------------------------------
    scenes.push({
        id: 'codeA', palette: 'game',
        background: { color: '#070c1e' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            { character: 'bolt', as: 'bolt', at: [LEFT, TALK_Y], scale: TALK_S,
              alpha: 0 },
            offstage('vector'), castBoard('code', { alpha: 1 }),
        ]),
        shots: [
            { id: 'k0', sfx: [['whoosh', 0], ['tick', 0.9]],
              dialogue: [says('bolt', P[10], 0.3)],
              actions: [
                  rest('bolt'),
                  { target: 'bolt', do: 'show', at: 0.1, for: 0.3 },
                  ...express('bolt', 'shock', 0.3, { hold: 1.2 }),
                  ...reveal('code', 'cd_bg', 0.2, { span: 0.4 }),
                  ...reveal('code', 'cd_t', 0.9, { span: 0.3 }),
                  ...ballBlinks('bolt', 3.4, 13),
              ] },
            { id: 'k1', sfx: [['tick', 0.4], ['tick', 1.0]], dialogue: [vo(P[11], 0.2)],
              actions: [
                  { target: 'bolt', do: 'hide', at: 0.2, for: 0.3 },
                  ...build('code', code.code.lineIds(0), 0.4,
                           { gap: 0.03, span: 0.22 }),
                  ...build('code', code.code.lineIds(1), 1.0,
                           { gap: 0.03, span: 0.22 }),
              ] },
            { id: 'k2', sfx: [['tick', 0.3], ['tick', 1.1]], dialogue: [vo(P[12], 0.2)],
              actions: [
                  ...build('code', code.code.lineIds(2), 0.3,
                           { gap: 0.03, span: 0.22 }),
                  ...build('code', code.code.lineIds(3), 1.1,
                           { gap: 0.03, span: 0.22 }),
              ] },
            { id: 'k3', sfx: [['pop', 0.2]], dialogue: [vo(P[13], 0.2)],
              actions: [
                  ...reveal('code', 'h', 0.2, { span: 0.35 }),
                  ...reveal('code', 'sq_bg', 0.6, { span: 0.4 }),
                  ...reveal('code', 'sq_t', 1.1, { span: 0.3 }),
              ] },
            { id: 'k4', sfx: [['tick', 0.3], ['tick', 1.0], ['pop', 1.8]],
              dialogue: [vo(P[14], 0.2)],
              actions: [
                  ...build('code', code.sq.lineIds(0), 0.3, { gap: 0.03, span: 0.22 }),
                  ...build('code', code.sq.lineIds(1), 1.0, { gap: 0.03, span: 0.22 }),
                  ...pop('code', 'sn', 1.8, { span: 0.4 }),
              ] },
        ],
    });

    // --- SCENE 5 — boxes ---------------------------------------------------
    scenes.push({
        id: 'boxes', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('boxes', { alpha: 1 })]),
        shots: [
            { id: 'b0', sfx: [['whoosh', 0], ['pop', 0.5], ['pop', 0.9],
                              ['tick', 1.6], ['tick', 2.3]],
              dialogue: [vo(P[15], 0.2)],
              actions: [
                  ...reveal('boxes', 'h', 0.15, { span: 0.35 }),
                  ...build('boxes', boxes.a.ids, 0.5, { gap: 0.14, span: 0.3 }),
                  ...build('boxes', boxes.b.ids, 0.9, { gap: 0.14, span: 0.3 }),
                  ...build('boxes', boxes.oxIds, 1.6, { gap: 0.16, span: 0.3 }),
                  ...build('boxes', boxes.oyIds, 2.3, { gap: 0.16, span: 0.3 }),
              ] },
            { id: 'b1', sfx: [['pop', 0.3]], dialogue: [vo(P[16], 0.2)],
              actions: [
                  ...pop('boxes', 'bn', 0.3, { span: 0.4 }),
                  // The limit, dimmed, and stated. A test whose conditions
                  // are left out is the thing this series exists not to do.
                  ...reveal('boxes', 'ba', 1.3, { span: 0.4, to: 0.8 }),
              ] },
        ],
    });

    // --- SCENE 6 — broad and narrow ----------------------------------------
    scenes.push({
        id: 'phase', palette: 'game',
        background: { color: '#0a1230' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            { character: 'nova', as: 'nova', at: [LEFT, 1330], scale: 0.52 },
            { character: 'vector', as: 'vector', at: [RIGHT, 1330], scale: 0.42 },
            castBoard('phase', { alpha: 1 }),
        ]),
        shots: [
            { id: 'p0', sfx: [['whoosh', 0]], dialogue: [says('nova', P[17], 0.3)],
              actions: [
                  rest('nova'), rest('vector'),
                  ...express('nova', 'doubt', 0.3, { hold: 1.2 }),
                  ...reveal('phase', 'h', 0.15, { span: 0.35 }),
                  ...ballBlinks('nova', 3.2, 31),
              ] },
            { id: 'p1', sfx: [['pop', 0.3]], dialogue: [vo(P[18], 0.2)],
              actions: [
                  ...express('vector', 'keen', 0.3, { hold: 1.4 }),
                  ...build('phase', phase.cmp.left, 0.3, { gap: 0.12, span: 0.32 }),
                  ...ballBlinks('nova', 4.2, 59),
              ] },
            { id: 'p2', sfx: [['pop', 0.3], ['tick', 1.5]], dialogue: [vo(P[19], 0.2)],
              actions: [
                  ...build('phase', phase.cmp.right, 0.3, { gap: 0.12, span: 0.32 }),
                  ...reveal('phase', 'pn', 1.5, { span: 0.4 }),
                  ...ballBlinks('vector', 3.6, 83),
              ] },
        ],
    });

    // --- SCENE 7 — tunnelling ----------------------------------------------
    scenes.push({
        id: 'tunnel', palette: 'game',
        background: { color: '#120a1e' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            { character: 'bolt', as: 'bolt', at: [250, 1540], scale: 0.42, alpha: 0 },
            offstage('vector'), castBoard('tunnel', { alpha: 1 }),
        ]),
        shots: [
            { id: 't0', sfx: [['whoosh', 0], ['pop', 0.6]], dialogue: [vo(P[20], 0.2)],
              actions: [
                  rest('bolt'),
                  ...reveal('tunnel', 'h', 0.15, { span: 0.35 }),
                  ...reveal('tunnel', tunnel.wall.wallId, 0.6, { span: 0.35 }),
                  ...build('tunnel', tunnel.read.ids, 1.1, { gap: 0.12, span: 0.3 }),
                  // The step size, counted up to the number that breaks it.
                  // Four hundred pixels against a ten-pixel wall is not a
                  // close call, and the readout is what makes that arithmetic
                  // visible rather than asserted.
                  ...countTo('tunnel', tunnel.read.value,
                             { from: 0, to: 400, at: 1.5, span: 1.0,
                               suffix: ' px' }),
              ] },
            { id: 't1', sfx: [['tick', 0.3], ['whoosh', 1.2], ['tick', 1.5]],
              dialogue: [vo(P[21], 0.2)],
              actions: [
                  ...reveal('tunnel', tunnel.gh.ids[0], 0.3, { span: 0.25 }),
                  ...tunnel.arrow.ids.flatMap((id) =>
                      reveal('tunnel', id, 1.2, { span: 0.3 })),
                  ...reveal('tunnel', tunnel.gh.ids[1], 1.5, { span: 0.25 }),
              ] },
            { id: 't2', sfx: [['pop', 0.4]], dialogue: [vo(P[22], 0.2)],
              actions: [
                  // The ring marks where he WOULD have been. Nothing is drawn
                  // inside it, because nothing was ever there.
                  ...pop('tunnel', 'tm', 0.4, { span: 0.4 }),
                  ...reveal('tunnel', 'tn', 1.1, { span: 0.4 }),
              ] },
            { id: 't3', dialogue: [says('bolt', P[23], 0.3)],
              actions: [
                  { target: 'bolt', do: 'show', at: 0.1, for: 0.3 },
                  ...express('bolt', 'think', 0.3, { hold: 1.0 }),
                  ...ballBlinks('bolt', 3.0, 17),
              ] },
            { id: 't4', sfx: [['pop', 0.3]], dialogue: [vo(P[24], 0.2)],
              actions: [
                  ...pop('tunnel', 'tf', 0.3, { span: 0.45 }),
                  { target: 'bolt', do: 'hide', at: 1.4, for: 0.3 },
              ] },
        ],
    });

    // --- SCENE 8 — the push ------------------------------------------------
    scenes.push({
        id: 'push', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            { character: 'nova', as: 'nova', at: [880, 690], scale: 0.4 },
            offstage('vector'), castBoard('push', { alpha: 1 }),
        ]),
        shots: [
            { id: 'u0', sfx: [['whoosh', 0]], dialogue: [says('nova', P[25], 0.3)],
              actions: [
                  rest('nova'),
                  ...express('nova', 'sure', 0.3, { hold: 1.0 }),
                  ...reveal('push', 'h', 0.15, { span: 0.35 }),
                  ...showBall('push', 'pa', 0.5),
                  ...showBall('push', 'pb', 0.7),
                  ...ballBlinks('nova', 3.0, 37),
              ] },
            { id: 'u1', sfx: [['tick', 0.3]], dialogue: [vo(P[26], 0.2)],
              actions: [
                  ...build('push', push.dist.lineIds, 0.3, { gap: 0.08, span: 0.3 }),
                  ...build('push', push.dist.radiusIds, 0.9, { gap: 0.3, span: 0.3 }),
              ] },
            { id: 'u2', sfx: [['pop', 0.3], ['impact', 1.4]],
              dialogue: [vo(P[27], 0.2)],
              actions: [
                  ...build('push', push.outIds, 0.3, { gap: 0.1, span: 0.3 }),
                  // The measurement goes before the move. It measured the
                  // overlap, and once the overlap is gone a span still
                  // drawn across it is pointing at nothing.
                  ...[...push.dist.lineIds, ...push.dist.radiusIds].flatMap(
                      (id) => conceal('push', id, 1.2, { span: 0.25 })),
                  // And then they actually separate, which is the one thing a
                  // static figure of this cannot say.
                  ...shiftBy('push', diagramBallIds('pa'), [-60, 0], 1.4,
                             { span: 0.6 }),
                  ...shiftBy('push', diagramBallIds('pb'), [60, 0], 1.4,
                             { span: 0.6 }),
                  ...build('push', ['pf_bg', 'pf_t', 'pf_n'], 2.1,
                           { gap: 0.14, span: 0.4 }),
              ] },
            { id: 'u3', sfx: [['tick', 1.0]], dialogue: [vo(P[28], 0.2)],
              actions: [...reveal('push', 'ph2', 1.0, { span: 0.4, to: 0.85 })] },
            { id: 'u4', sfx: [['pop', 0.3]], dialogue: [vo(P[29], 0.2)],
              actions: [...pop('push', 'po', 0.3, { span: 0.45 })] },
        ],
    });

    // --- SCENE 9 — the separation code --------------------------------------
    scenes.push({
        id: 'code2', palette: 'game',
        background: { color: '#070c1e' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('code2', { alpha: 1 })]),
        shots: [
            { id: 'q0', sfx: [['whoosh', 0]].concat([0, 1, 2, 3, 4, 5].map(
                  (i) => ['tick', 0.5 + i * 0.42])),
              dialogue: [vo(P[30], 0.2)],
              actions: [
                  ...reveal('code2', 'c2_bg', 0.15, { span: 0.4 }),
                  ...reveal('code2', 'c2_t', 0.4, { span: 0.3 }),
                  ...[0, 1, 2, 3, 4, 5].flatMap((i) =>
                      build('code2', code2.code.lineIds(i), 0.5 + i * 0.42,
                            { gap: 0.03, span: 0.22 })),
                  ...reveal('code2', 'c2n', 3.2, { span: 0.4 }),
              ] },
        ],
    });

    // --- SCENE 10 — three of six --------------------------------------------
    scenes.push({
        id: 'steps', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('steps', { alpha: 1 })]),
        shots: [
            { id: 's0', sfx: [['whoosh', 0], ['tick', 0.5], ['tick', 0.85],
                              ['pop', 1.25]],
              dialogue: [vo(P[31], 0.2)],
              actions: [
                  ...reveal('steps', 'h', 0.15, { span: 0.35 }),
                  // The three that are done arrive bright; the three still
                  // owed arrive dim. One picture of where the series is.
                  ...build('steps', steps.rows.rowIds(0), 0.5, { gap: 0.05, span: 0.3 }),
                  ...build('steps', steps.rows.rowIds(1), 0.85, { gap: 0.05, span: 0.3 }),
                  ...build('steps', steps.rows.rowIds(2), 1.25, { gap: 0.05, span: 0.34,
                                                                  how: pop }),
                  ...[3, 4, 5].flatMap((i) =>
                      build('steps', steps.rows.rowIds(i), 1.9 + (i - 3) * 0.2,
                            { gap: 0.04, span: 0.35,
                              how: (t2, id, at, o) => reveal(t2, id, at,
                                                             { ...o, to: 0.42 }) })),
              ] },
        ],
    });

    // --- SCENE 11 — the cliffhanger -----------------------------------------
    scenes.push({
        id: 'next', palette: 'game',
        background: { color: '#070c1e' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            // Up top, in the frame's dead space. At the bottom they sat
            // underneath the subtitles, which is where a character goes to
            // be half a face behind a word.
            { character: 'bolt', as: 'bolt', at: [170, 640], scale: 0.4 },
            { character: 'vector', as: 'vector', at: [200, 1190], scale: 0.32 },
            castBoard('next', { alpha: 1 }),
        ]),
        shots: [
            { id: 'z0', sfx: [['whoosh', 0], ['pop', 1.2]],
              dialogue: [says('bolt', P[32], 0.3)],
              actions: [
                  rest('bolt'), rest('vector'),
                  ...express('bolt', 'doubt', 0.3, { hold: 1.2 }),
                  ...showBall('next', 'na', 0.15),
                  ...showBall('next', 'nb', 0.35),
                  ...build('next', nxt.wayIds, 1.2, { gap: 0.08, span: 0.3 }),
                  ...pop('next', 'qm', 1.8, { span: 0.4 }),
                  ...ballBlinks('bolt', 3.6, 23),
              ] },
            { id: 'z1', sfx: [['riser', 0.2, 0.36]], dialogue: [vo(P[33], 0.2)],
              actions: [
                  ...express('vector', 'keen', 0.3, { hold: 1.8 }),
                  ...reveal('next', 'nk', 0.4, { span: 0.3 }),
                  ...pop('next', 'nt', 0.9, { span: 0.45 }),
                  ...ballBlinks('bolt', 4.0, 47),
              ] },
        ],
    });

    // --- SCENE 12 — the end card --------------------------------------------
    scenes.push({
        id: 'card', palette: 'game',
        background: { color: '#04060f' },
        transitionIn: { kind: 'crossfade', duration: 0.4 },
        cast: [offstage('vector'), castBoard('card', { alpha: 1 })],
        shots: [
            { id: 'e0', sfx: [['riser', 0, 0.42]], dialogue: [vo(P[34], 0.3)],
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
