/**
 * Part 6 — "Spin".
 *
 * Angular velocity, moment of inertia, the contact point, and the term that
 * completes part four's impulse line. The part the series has been
 * deferring since part one, which said out loud that it was deferring it.
 *
 * ## The physics
 *
 * All of this is 2D rigid-body rotation about an axis out of the screen, so
 * ω, I and τ are scalars rather than vectors. That is a real simplification
 * and the film says so in the one place it matters (see "what 2D cannot
 * do", below) rather than letting a viewer assume otherwise.
 *
 * - **ω is radians per second**, one number, signed.
 * - **Moment of inertia is mass times distance-from-the-axis squared,**
 *   added up. It is why *where* the mass sits matters and mass alone does
 *   not. Solid disc about its centre: `I = ½ m r²`. Thin ring: `I = m r²`.
 *   Solid sphere: `I = ⅖ m r²`. All exact, all standard, all about the
 *   centre of mass.
 * - **The contact point does not move at the centre's velocity.**
 *   `v_contact = v + ω × r`, which in 2D is `v + ω · (−r_y, r_x)`. This is
 *   the whole of the episode: friction acts on *that* velocity, not on the
 *   centre's, and every other result here follows from it.
 * - **Rolling without slipping** is the case where the contact point is
 *   momentarily stationary, which gives `v = ω r`. A sliding ball is
 *   dragged toward that state by friction and then stays there.
 * - **Angular impulse**: `Δω = (r × J) / I`. The standard 2D form, and the
 *   reason part four's denominator was incomplete: with rotation it becomes
 *   `1/m₁ + 1/m₂ + (r₁×n)²/I₁ + (r₂×n)²/I₂`. The film shows the completed
 *   line, because leaving part four's version standing as "the" answer
 *   would be the series teaching something it knows to be partial.
 * - **What 2D cannot do.** A top-down 2D world has exactly one rotation
 *   axis, so it gives you side spin and nothing else. Top spin and back
 *   spin are rotations about a horizontal axis and need the third
 *   dimension. Most tutorials blur this; the film states it.
 */
import {
    BAND, BOLT, FONT, GAME_PALETTE, L, M, NOVA, SAFE, VECTOR, Z, angleParts,
    arcArrow, ballBlinks, bannerParts, board, build, castBoard, claimParts,
    codePanelParts, compareParts, conceal, countTo, derivationParts, diagramBall,
    diagramBallIds, ellipsePart, endCard, express, fitShots, flash, flashPart,
    formulaParts, gridScenery, headingPart, hookTitle, impactParts, liftSfx,
    noteParts, pathPart, pop, readoutParts, rectPart, rest, reveal, roll,
    roundRect, SFX_ASSETS, shiftBy, showBall, spinMark, squash, stepRows, textPart,
    titleAt, vectorArrow, wallParts,
} from './common.mjs';
import { META, voicesFor } from '../lib/physics.mjs';

const PART = 6;

// ---------------------------------------------------------------------------
// The narration
// ---------------------------------------------------------------------------

const P = [
    /* 0  BOLT   */ 'Straight at the wall. Watch me come back sideways.',
    /* 1  NOVA   */ 'Nothing pushed you sideways.',
    /* 2  VECTOR */ 'Nothing did. He was spinning, and the floor had something to '
        + 'grip.',
    /* 3  VECTOR */ 'Everything so far treated a ball as a point with a radius.',
    /* 4  VECTOR */ 'Real things turn. One more number: omega, how fast it turns.',
    /* 5  VECTOR */ 'Radians per second. Positive one way, negative the other.',
    /* 6  VECTOR */ 'And turning has its own kind of heaviness. Moment of inertia.',
    /* 7  VECTOR */ 'Mass resists being pushed. Inertia resists being turned.',
    /* 8  VECTOR */ 'And it is not just how much mass. It is how far out the mass '
        + 'sits.',
    /* 9  NOVA   */ 'So two things the same weight can turn differently?',
    /*10  VECTOR */ 'Completely. A solid disc is a half m r squared.',
    /*11  VECTOR */ 'A ring with all its weight at the rim is a whole m r squared.',
    /*12  VECTOR */ 'Twice as hard to spin up, and twice as hard to stop. Same mass.',
    /*13  VECTOR */ 'Now the idea that makes all of this click.',
    /*14  VECTOR */ 'The bottom of a rolling ball is not moving at the ball\'s speed.',
    /*15  VECTOR */ 'Add the spin at that point: velocity plus omega times the radius.',
    /*16  VECTOR */ 'On a rolling ball those two cancel. The contact point is standing '
        + 'still.',
    /*17  BOLT   */ 'That cannot be right. The ball is moving.',
    /*18  VECTOR */ 'The ball is. That one point, for that one instant, is not.',
    /*19  VECTOR */ 'And this matters because friction acts there. Not at the centre.',
    /*20  VECTOR */ 'Throw a ball with no spin and it skids. The contact is sliding.',
    /*21  VECTOR */ 'Friction fights that sliding, so it slows the ball and spins it '
        + 'up.',
    /*22  VECTOR */ 'It keeps going until the contact stops sliding. Then it just '
        + 'rolls.',
    /*23  VECTOR */ 'A force off the centre is a torque. Torque over inertia is spin.',
    /*24  VECTOR */ 'Which finally completes the line from part four.',
    /*25  VECTOR */ 'Same impulse, two more terms underneath, one for each body\'s '
        + 'inertia.',
    /*26  VECTOR */ 'One honest warning about two dimensions.',
    /*27  VECTOR */ 'A flat world has one axis to turn about, so you get side spin.',
    /*28  VECTOR */ 'Top spin and back spin need the third dimension. They are not '
        + 'free.',
    /*29  NOVA   */ 'So the seventh thing is finally on the list.',
    /*30  VECTOR */ 'It is. Position, velocity, detection, normal, response, bounce, '
        + 'spin.',
    /*31  VECTOR */ 'That is the whole of two-dimensional collision physics.',
    /*32  BOLT   */ 'Then there is nothing left to learn.',
    /*33  VECTOR */ 'Nothing left to learn. Everything left to build. Next time, we '
        + 'build it.',
    /*34  VECTOR */ "Follow, and I'll see you in part seven.",
];

const T = {
    kicker: `GAME PHYSICS  ·  PART ${PART}`,
    title: 'Spin',
    sub: 'angular velocity · inertia · the contact point',

    hookN: 'no force pushed him sideways. the spin did.',

    oH: 'ANGULAR VELOCITY',
    oF: 'ω   =   radians per second',
    oN: 'one more number on the ball, and it turns everything else on',
    oRead: 'ω',

    iH: 'INERTIA, BUT FOR TURNING',
    iL: ['MASS', 'how hard it is\nto get moving\nin a straight line.'],
    iR: ['MOMENT OF INERTIA', 'how hard it is\nto get turning.\nnot the same number.'],
    iN: 'and it depends on WHERE the mass is, not only how much there is',

    dH: 'SAME MASS, DIFFERENT SPIN',
    dDisc: 'SOLID DISC', dDiscF: 'I  =  ½ m r²',
    dRing: 'RING', dRingF: 'I  =  m r²',
    dN: 'all the weight at the rim is twice as hard to spin up — and to stop',
    dS: 'a solid sphere, for the record, is ⅖ m r²',

    cH: 'THE CONTACT POINT',
    cF: 'v contact   =   v   +   ω × r',
    cN: 'the bottom of a rolling ball is not moving at the ball\'s speed',
    cZero: 'ON A ROLLING BALL THESE CANCEL',
    cZero2: 'the contact point is, for that instant, standing still',
    cWhy: 'and friction acts THERE — which is the whole of this episode',

    sH: 'SKID, THEN ROLL',
    s1: 'thrown with no spin', s1n: 'the contact is sliding backwards',
    s2: 'friction fights it', s2n: 'slows the ball, spins it up',
    s3: 'until they match', s3n: 'v = ω r, and it just rolls',

    tH: 'TORQUE',
    tF: 'Δω   =   ( r × j )  /  I',
    tN: 'a push that misses the centre turns the thing as well as moving it',

    fH: 'AND PART FOUR WAS INCOMPLETE',
    fF: 'j  =  − ( 1 + e ) vn  /  ( 1/m₁ + 1/m₂ + (r₁×n)²/I₁ + (r₂×n)²/I₂ )',
    fN: 'the same line, with each body\'s resistance to turning added underneath',

    wH: 'WHAT A FLAT WORLD CANNOT DO',
    wL: ['2D  ·  ONE AXIS', 'out of the screen.\nyou get side spin,\nand that is all.'],
    wR: ['3D  ·  THREE AXES', 'top spin and back spin\nturn about a horizontal\naxis. not free in 2D.'],

    stH: 'ALL SEVEN',
    steps: [
        [1, 'POSITION', 'where is it', '#36e3ff'],
        [2, 'VELOCITY', 'how fast, and which way', '#36e3ff'],
        [3, 'DETECTION', 'did they touch', '#ffd23d'],
        [4, 'NORMAL', 'which way did the hit push', '#ff4d8d'],
        [5, 'RESPONSE', 'change both velocities', '#8e7bff'],
        [6, 'RESTITUTION  +  FRICTION', 'how it feels', '#3ddc84'],
        [7, 'ROTATION', 'and how it turns  —  this part', '#ff9f1c'],
    ],

    codeT: '# spin, on top of everything else',
    nextK: `NEXT  ·  PART ${PART + 1}`,
    next: 'Build the whole thing:\na game, from nothing',
};

const CODE = [
    [0, [['codeCmt', '# r: centre to contact, for each body']]],
    [0, [['codeFn', 'rn1'], ['ink', '  = r1x*ny - r1y*nx'], ['codeCmt', '      # the 2D cross']]],
    [0, [['codeFn', 'inv'], ['ink', '  = '], ['codeNum', '1'], ['ink', '/a.m + '],
         ['codeNum', '1'], ['ink', '/b.m + rn1*rn1/a.I + rn2*rn2/b.I']]],
    [0, [['codeFn', 'j'], ['ink', '    = -('], ['codeNum', '1'], ['ink', ' + e)*vn / inv']]],
    [0, [['ink', 'a.w += rn1 * j / a.I'], ['codeCmt', '        # and the spin changes too']]],
    [0, [['ink', 'b.w -= rn2 * j / b.I']]],
];

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

/** SCENE 1 — the hook: in straight, out sideways. */
function boardHook() {
    const w = wallParts('hw', [120, 1180], [960, 1180], { thickness: 20,
                                                          toward: [540, 900],
                                                          normal: false });
    const inA = vectorArrow('hi', [540, 760], [540, 1120], { width: 10, head: 26,
                                                             fill: 'velocity' });
    const outA = vectorArrow('ho', [540, 1120], [860, 840], { width: 10, head: 26,
                                                              fill: 'spin' });
    const spin = arcArrow('hs', [540, 900], 150, { from: -2.2, sweep: 0.62,
                                                   fill: 'spin', width: 8,
                                                   label: 'ω', labelR: 196 });
    return {
        ...board('hook', [
            ...w.parts, ...inA.parts, ...outA.parts, ...spin.parts,
            flashPart('fl'),
            ...noteParts('hn', T.hookN, { at: [540, 1280], fill: 'spin', size: 32 }),
            ...hookTitle(T.kicker, T.title, T.sub),
        ]),
        w, inA, outA, spin,
    };
}

/** SCENE 2 — omega. */
function boardOmega() {
    const spin = arcArrow('oa', [540, 900], 190, { from: -2.5, sweep: 0.8,
                                                   fill: 'spin', width: 10 });
    const read = readoutParts('or', T.oRead, { at: [540, 1200], initial: '0.0',
                                               fill: 'spin', chipW: 400,
                                               size: 50 });
    return {
        ...board('omega', [
            headingPart('h', T.oH, { y: BAND.heading, fill: 'spin', size: 50 }),
            ...formulaParts('of', T.oF, { at: [540, 650], fill: 'spin', size: 42 }),
            ...diagramBall('ob', [540, 900], 120),
            ...spin.parts, ...read.parts,
            ...noteParts('on', T.oN, { at: [540, BAND.caption2 + 40], fill: 'dim',
                                       size: 28 }),
        ]),
        spin, read,
    };
}

/** SCENE 3 — the two kinds of heaviness. */
function boardInertia() {
    const cmp = compareParts('ic', T.iL, T.iR, { y: 680, h: 330, accentL: 'velocity',
                                                 accentR: 'spin' });
    return {
        ...board('inertia', [
            headingPart('h', T.iH, { y: BAND.heading, fill: 'spin', size: 46 }),
            ...cmp.parts,
            ...noteParts('in2', T.iN, { at: [540, 1090], fill: 'ink', size: 30 }),
        ]),
        cmp,
    };
}

/**
 * SCENE 4 — a disc against a ring.
 *
 * Both drawn at the same radius and labelled the same mass, because the
 * whole claim is that mass and radius are not enough to tell you how hard
 * something is to turn. The ring is drawn as a thick annulus rather than an
 * outline, so it reads as an object with its weight at the rim rather than
 * as a circle with a line round it.
 */
function boardDisc() {
    const R = 128;
    const CY = 858;
    const disc = [
        ellipsePart('dd', R, R, { at: [300, CY], fill: 'velocity', z: 30, alpha: 0 }),
    ];
    const ring = [
        ellipsePart('dr', R, R, { at: [780, CY], fill: 'spin', z: 30, alpha: 0 }),
        // The hole. Filled with the scene's own background, which is what
        // makes an annulus out of two filled circles.
        ellipsePart('dr2', R - 34, R - 34, { at: [780, CY], fill: 'bg', z: 31,
                                             alpha: 0 }),
    ];
    return {
        ...board('disc', [
            headingPart('h', T.dH, { y: BAND.heading, fill: 'spin', size: 46 }),
            ...disc, ...ring,
            textPart('dl', T.dDisc, { at: [300, 1058], font: `800 30px ${FONT}`,
                                      fill: 'velocity', z: 60, alpha: 0 }),
            textPart('dlf', T.dDiscF, { at: [300, 1110], font: `800 38px ${FONT}`,
                                        fill: 'velocity', z: 60, alpha: 0 }),
            textPart('rl', T.dRing, { at: [780, 1058], font: `800 30px ${FONT}`,
                                      fill: 'spin', z: 60, alpha: 0 }),
            textPart('rlf', T.dRingF, { at: [780, 1110], font: `800 38px ${FONT}`,
                                        fill: 'spin', z: 60, alpha: 0 }),
            textPart('dm', 'same mass  ·  same radius', {
                at: [540, 1006], font: `700 27px ${FONT}`, fill: 'dim', z: 60,
                alpha: 0, maxWidth: 600 }),
            ...noteParts('dn', T.dN, { at: [540, 1240], fill: 'ink', size: 30 }),
            ...noteParts('ds', T.dS, { at: [540, 1310], fill: 'dim', size: 26 }),
        ]),
        discIds: ['dd'], ringIds: ['dr', 'dr2'],
    };
}

/**
 * SCENE 5 — the contact point, and the cancellation.
 *
 * The two arrows at the bottom of the ball are the same length and opposite,
 * which is what `v + ω × r = 0` LOOKS like. Drawn from the same point so
 * they visibly cancel rather than merely being asserted to.
 */
function boardContact() {
    const C = [540, 920];
    const R = 150;
    const w = wallParts('cw', [140, 1070], [940, 1070], { thickness: 16,
                                                          toward: C, normal: false });
    // The two labels used to land within twenty pixels of each other: the
    // arc's label sits at its own mid-angle and the arrow's at its
    // midpoint, and on a ball with a horizontal velocity those are the same
    // place. The arc's goes further out, the arrow's goes below.
    const spin = arcArrow('cs', C, 96, { from: -2.4, sweep: 0.7, fill: 'spin',
                                         width: 8, label: 'ω', labelR: 210 });
    const vel = vectorArrow('cv', C, [C[0] + 230, C[1]], { width: 10, head: 26,
                                                           fill: 'velocity',
                                                           label: 'v', labelOff: 46 });
    // At the contact: the centre's velocity forward, the spin's contribution
    // backward, equal and opposite.
    const fwd = vectorArrow('cf', [C[0], 1070], [C[0] + 180, 1070],
                            { width: 9, head: 22, fill: 'velocity' });
    const back = vectorArrow('cb2', [C[0], 1070], [C[0] - 180, 1070],
                             { width: 9, head: 22, fill: 'spin' });
    return {
        ...board('contact', [
            headingPart('h', T.cH, { y: BAND.heading, fill: 'spin', size: 50 }),
            ...formulaParts('cfm', T.cF, { at: [540, 650], fill: 'spin', size: 44,
                                           note: T.cN }),
            ...w.parts,
            ...diagramBall('cball', C, R),
            ...spin.parts, ...vel.parts, ...fwd.parts, ...back.parts,
            ellipsePart('cpt', 15, 15, { at: [C[0], 1070], fill: 'ink', z: 90,
                                         alpha: 0 }),
            ...noteParts('cz', T.cZero, { at: [540, 1180], fill: 'ink', size: 32 }),
            ...noteParts('cz2', T.cZero2, { at: [540, 1240], fill: 'dim', size: 27 }),
            ...noteParts('cw2', T.cWhy, { at: [540, 1320], fill: 'spin', size: 30 }),
        ]),
        w, spin, vel, fwd, back,
    };
}

/** SCENE 6 — skid, then roll: three states in a row. */
function boardSkid() {
    const y = 900;
    const floor = pathPart('sf', `${M(80, 1010)} ${L(1000, 1010)}`,
                           { stroke: 'robotDark', strokeWidth: 12, z: 10, alpha: 0,
                             lineCap: 'round' });
    const cols = [[220, T.s1, T.s1n, 'loss'], [540, T.s2, T.s2n, 'momentum'],
                  [860, T.s3, T.s3n, 'restitution']];
    const parts = [floor];
    const groups = [];
    cols.forEach(([x, title, note, col], i) => {
        const ids = [];
        parts.push(...diagramBall(`sk${i}`, [x, y], 86));
        ids.push(...diagramBallIds(`sk${i}`));
        // Each column gets the spin it actually has: none, some, matched.
        if (i > 0) {
            const a = arcArrow(`sa${i}`, [x, y], 62,
                               { from: -2.4, sweep: i === 1 ? 0.4 : 0.72,
                                 fill: 'spin', width: 6, head: 20 });
            parts.push(...a.parts);
            ids.push(...a.ids);
        }
        parts.push(
            textPart(`st${i}`, title, { at: [x, 1080], font: `800 27px ${FONT}`,
                                        fill: col, z: 60, alpha: 0, maxWidth: 300,
                                        lineHeight: 34 }),
            textPart(`sn${i}`, note, { at: [x, 1140], font: `600 24px ${FONT}`,
                                       fill: 'dim', z: 60, alpha: 0, maxWidth: 290,
                                       lineHeight: 30 }),
        );
        ids.push(`st${i}`, `sn${i}`);
        groups.push(ids);
    });
    return {
        ...board('skid', [
            headingPart('h', T.sH, { y: BAND.heading, fill: 'spin', size: 50 }),
            ...parts,
        ]),
        groups, floorId: 'sf',
    };
}

/** SCENE 7 — torque, and the completed impulse line. */
function boardTorque() {
    return {
        ...board('torque', [
            headingPart('h', T.tH, { y: BAND.heading, fill: 'spin', size: 50 }),
            ...formulaParts('tf', T.tF, { at: [540, 680], fill: 'spin', size: 50,
                                          note: T.tN }),
            headingPart('h2', T.fH, { y: 920, fill: 'tangent', size: 38 }),
            // The completed line is long, so it gets its own wide panel and a
            // smaller size rather than being wrapped into two.
            pathPart('fbg', roundRect(40, 990, 1000, 128, 20),
                     { fill: 'panel', stroke: 'tangent', strokeWidth: 2, z: 60,
                       alpha: 0 }),
            textPart('ff', T.fF, { at: [540, 1058], font: `800 30px ${FONT}`,
                                   fill: 'tangent', z: 61, alpha: 0, maxWidth: 960,
                                   lineHeight: 40 }),
            ...noteParts('fn', T.fN, { at: [540, 1200], fill: 'dim', size: 27 }),
        ]),
    };
}

/** SCENE 8 — the honest limit of two dimensions. */
function boardFlat() {
    const cmp = compareParts('wc', T.wL, T.wR, { y: 700, h: 340, accentL: 'spin',
                                                 accentR: 'dim' });
    return {
        ...board('flat', [
            headingPart('h', T.wH, { y: BAND.heading, fill: 'ink', size: 44 }),
            ...cmp.parts,
        ]),
        cmp,
    };
}

/** SCENE 9 — the code. */
function boardCode() {
    const code = codePanelParts('cd', CODE, { x: 44, y: 620, w: 992, lh: 48, size: 24,
                                              title: T.codeT });
    return { ...board('code', [...code.parts]), code };
}

/** SCENE 10 — all seven, finally. */
function boardSteps() {
    const rows = stepRows('sr', T.steps, { y: 556, h: 92, gap: 10 });
    return {
        ...board('steps', [
            headingPart('h', T.stH, { y: 500, fill: 'spin', size: 44 }),
            ...rows.parts,
            ...claimParts('sc', 'all of 2D collision physics', {
                at: [540, 1320], size: 40, fill: 'velocity' }),
        ]),
        rows,
    };
}

/** SCENE 11 — the cliffhanger: nothing left to learn. */
function boardNext() {
    return {
        ...board('next', [
            ...claimParts('nc', 'NOTHING LEFT\nTO LEARN', { at: [540, 820], size: 72,
                                                            fill: 'dim' }),
            ...claimParts('nb', 'EVERYTHING LEFT\nTO BUILD', { at: [540, 1080],
                                                               size: 72,
                                                               fill: 'velocity' }),
            textPart('nk', T.nextK, { at: [540, 1250], font: `700 32px ${FONT}`,
                                      fill: 'spin', z: 90, alpha: 0 }),
            textPart('nt', 'we build the game', { at: [540, 1330],
                                                  font: `800 50px ${FONT}`,
                                                  fill: 'ink', z: 90, alpha: 0,
                                                  maxWidth: SAFE.x1 - SAFE.x0 }),
        ]),
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

export function partSix() {
    const hook = boardHook();
    const omega = boardOmega();
    const inertia = boardInertia();
    const disc = boardDisc();
    const contact = boardContact();
    const skid = boardSkid();
    const torque = boardTorque();
    const flat = boardFlat();
    const code = boardCode();
    const steps = boardSteps();
    const nxt = boardNext();
    const card = endCard(T.next, PART);
    const ban = bannerParts(PART);

    const boards = [hook, omega, inertia, disc, contact, skid, torque, flat,
                    code, steps, nxt,
                    board('card', card.parts), board('ban', ban)];

    const characters = { bolt: BOLT, nova: NOVA, vector: VECTOR };
    for (const b of boards) {
        characters[b.name] = { role: 'effect', palette: 'game', parts: b.parts };
    }
    const withBan = (cast) => [...cast, castBoard('ban', { alpha: 1 })];
    const grid = gridScenery();
    const scenes = [];

    // --- SCENE 1 — the hook ---------------------------------------------------
    scenes.push({
        id: 'hook', palette: 'game',
        background: { color: '#04060f' },
        transitionIn: { kind: 'fade', from: '#000000', duration: 0.5 },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            castBoard('hook', { alpha: 1 }),
            { character: 'bolt', as: 'bolt', at: [540, 760], scale: 0.62 },
            { character: 'nova', as: 'nova', at: [170, 700], scale: 0.38 },
            { character: 'vector', as: 'vector', at: [900, 700], scale: 0.34,
              alpha: 0 },
        ]),
        shots: [
            { id: 'h0', sfx: [['whoosh', 0.4], ['impact', 1.0], ['riser', 2.2, 0.3]],
              dialogue: [says('bolt', P[0], 0.28)],
              actions: [
                  rest('bolt'), rest('nova'), rest('vector'),
                  ...reveal('hook', hook.w.wallId, 0.1, { span: 0.3 }),
                  ...express('bolt', 'sure', 0.3, { hold: 0.7 }),
                  // Down, and then away at an angle nothing in the first
                  // five parts can explain.
                  { target: 'bolt', do: 'move', to: [540, 1050], at: 0.42, for: 0.56,
                    ease: 'smooth' },
                  ...spinMark('bolt', 0.42, 0.56, 1.4),
                  ...squash('bolt', 0.96, { scale: 0.62, amount: 0.2, span: 0.07 }),
                  ...flash('hook', 'fl', 1.0, { peak: 0.28, span: 0.18 }),
                  { target: 'bolt', do: 'move', to: [880, 820], at: 1.06, for: 0.6,
                    ease: 'smooth' },
                  ...spinMark('bolt', 1.06, 0.6, 1.5, { from: 1.4 }),
              ] },
            { id: 'h1', sfx: [['pop', 0.9]], dialogue: [says('nova', P[1], 0.24)],
              actions: [
                  ...express('nova', 'shock', 0.3, { hold: 1.2 }),
                  ...hook.inA.ids.flatMap((id) => reveal('hook', id, 0.5,
                                                         { span: 0.3 })),
                  ...hook.outA.ids.flatMap((id) => reveal('hook', id, 0.9,
                                                          { span: 0.3 })),
                  ...ballBlinks('bolt', 4.0, 11),
              ] },
            { id: 'h2', sfx: [['pop', 0.1]], dialogue: [says('vector', P[2], 0.24)],
              actions: [
                  { target: 'vector', do: 'show', at: 0.1, for: 0.35 },
                  ...express('vector', 'keen', 0.4, { hold: 1.6 }),
                  ...build('hook', hook.spin.ids, 0.4, { gap: 0.1, span: 0.35 }),
                  ...reveal('hook', 'hn', 1.1, { span: 0.4 }),
                  ...build('hook', ['kicker', 'title', 'titlesub'], 2.0,
                           { gap: 0.2, span: 0.45 }),
                  ...ballBlinks('nova', 5.0, 97),
              ] },
        ],
    });

    // --- SCENE 2 — omega -------------------------------------------------------
    scenes.push({
        id: 'omega', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('omega', { alpha: 1 })]),
        shots: [
            { id: 'o0', sfx: [['whoosh', 0], ['pop', 0.6]], dialogue: [vo(P[3], 0.2)],
              actions: [
                  ...reveal('omega', 'h', 0.15, { span: 0.35 }),
                  ...showBall('omega', 'ob', 0.5),
              ] },
            { id: 'o1', sfx: [['pop', 0.4]], dialogue: [vo(P[4], 0.2)],
              actions: [
                  ...build('omega', omega.spin.ids, 0.4, { gap: 0.12, span: 0.4 }),
                  ...build('omega', omega.read.ids, 1.1, { gap: 0.1, span: 0.3 }),
                  ...countTo('omega', omega.read.value,
                             { from: 0, to: 12.6, at: 1.5, span: 0.9, decimals: 1 }),
              ] },
            { id: 'o2', sfx: [['pop', 0.3]], dialogue: [vo(P[5], 0.2)],
              actions: [
                  ...build('omega', ['of_bg', 'of_t'], 0.3, { gap: 0.14, span: 0.4 }),
                  ...reveal('omega', 'on', 1.2, { span: 0.4 }),
              ] },
        ],
    });

    // --- SCENE 3 — the two heavinesses --------------------------------------------
    scenes.push({
        id: 'inertia', palette: 'game',
        background: { color: '#0a1230' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('inertia', { alpha: 1 })]),
        shots: [
            { id: 'i0', sfx: [['whoosh', 0], ['pop', 0.4]], dialogue: [vo(P[6], 0.2)],
              actions: [
                  ...reveal('inertia', 'h', 0.15, { span: 0.35 }),
                  ...build('inertia', inertia.cmp.left, 0.4, { gap: 0.12, span: 0.32 }),
              ] },
            { id: 'i1', sfx: [['pop', 0.3]], dialogue: [vo(P[7], 0.2)],
              actions: [
                  ...build('inertia', inertia.cmp.right, 0.3,
                           { gap: 0.12, span: 0.32 }),
              ] },
            { id: 'i2', sfx: [['pop', 0.3]], dialogue: [vo(P[8], 0.2)],
              actions: [...pop('inertia', 'in2', 0.3, { span: 0.45 })] },
        ],
    });

    // --- SCENE 4 — disc against ring ------------------------------------------------
    scenes.push({
        id: 'disc', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            { character: 'nova', as: 'nova', at: [930, 660], scale: 0.32 },
            offstage('vector'), castBoard('disc', { alpha: 1 }),
        ]),
        shots: [
            { id: 'd0', sfx: [['whoosh', 0]], dialogue: [says('nova', P[9], 0.3)],
              actions: [
                  rest('nova'),
                  ...express('nova', 'think', 0.3, { hold: 1.0 }),
                  ...reveal('disc', 'h', 0.15, { span: 0.35 }),
                  ...ballBlinks('nova', 3.0, 31),
              ] },
            { id: 'd1', sfx: [['pop', 0.4], ['tick', 1.2]], dialogue: [vo(P[10], 0.2)],
              actions: [
                  ...build('disc', disc.discIds, 0.4, { gap: 0.06, span: 0.3 }),
                  ...reveal('disc', 'dl', 0.9, { span: 0.3 }),
                  ...pop('disc', 'dlf', 1.2, { span: 0.4 }),
              ] },
            { id: 'd2', sfx: [['pop', 0.4], ['tick', 1.2]], dialogue: [vo(P[11], 0.2)],
              actions: [
                  ...build('disc', disc.ringIds, 0.4, { gap: 0.06, span: 0.3 }),
                  ...reveal('disc', 'rl', 0.9, { span: 0.3 }),
                  ...pop('disc', 'rlf', 1.2, { span: 0.4 }),
                  ...reveal('disc', 'dm', 1.7, { span: 0.3 }),
              ] },
            { id: 'd3', sfx: [['pop', 0.3]], dialogue: [vo(P[12], 0.2)],
              actions: [
                  ...pop('disc', 'dn', 0.3, { span: 0.45 }),
                  ...reveal('disc', 'ds', 1.4, { span: 0.4, to: 0.8 }),
              ] },
        ],
    });

    // --- SCENE 5 — the contact point --------------------------------------------------
    scenes.push({
        id: 'contact', palette: 'game',
        background: { color: '#081029' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            { character: 'bolt', as: 'bolt', at: [150, 700], scale: 0.3, alpha: 0 },
            offstage('vector'), castBoard('contact', { alpha: 1 }),
        ]),
        shots: [
            { id: 'c0', sfx: [['whoosh', 0], ['pop', 0.6]], dialogue: [vo(P[13], 0.2)],
              actions: [
                  rest('bolt'),
                  ...reveal('contact', 'h', 0.15, { span: 0.35 }),
                  ...reveal('contact', contact.w.wallId, 0.4, { span: 0.3 }),
                  ...showBall('contact', 'cball', 0.6),
                  ...build('contact', contact.spin.ids, 1.1, { gap: 0.1, span: 0.35 }),
                  ...contact.vel.ids.flatMap((id) => reveal('contact', id, 1.5,
                                                            { span: 0.3 })),
              ] },
            { id: 'c1', sfx: [['pop', 0.4]], dialogue: [vo(P[14], 0.2)],
              actions: [
                  ...pop('contact', 'cpt', 0.4, { span: 0.35 }),
                  ...build('contact', ['cfm_bg', 'cfm_t', 'cfm_n'], 0.9,
                           { gap: 0.14, span: 0.4 }),
              ] },
            { id: 'c2', sfx: [['tick', 0.4], ['tick', 0.9]], dialogue: [vo(P[15], 0.2)],
              actions: [
                  ...contact.fwd.ids.flatMap((id) => reveal('contact', id, 0.4,
                                                            { span: 0.3 })),
                  ...contact.back.ids.flatMap((id) => reveal('contact', id, 0.9,
                                                             { span: 0.3 })),
              ] },
            { id: 'c3', sfx: [['pop', 0.3]], dialogue: [vo(P[16], 0.2)],
              actions: [
                  ...pop('contact', 'cz', 0.3, { span: 0.4 }),
                  ...reveal('contact', 'cz2', 1.0, { span: 0.4 }),
              ] },
            { id: 'c4', dialogue: [says('bolt', P[17], 0.3)],
              actions: [
                  { target: 'bolt', do: 'show', at: 0.1, for: 0.3 },
                  ...express('bolt', 'doubt', 0.3, { hold: 1.0 }),
                  ...ballBlinks('bolt', 2.8, 43),
              ] },
            { id: 'c5', sfx: [['pop', 1.3]], dialogue: [vo(P[18], 0.2)], actions: [] },
            { id: 'c6', sfx: [['riser', 0.1, 0.3]], dialogue: [vo(P[19], 0.2)],
              actions: [
                  ...pop('contact', 'cw2', 0.3, { span: 0.45 }),
                  { target: 'bolt', do: 'hide', at: 1.6, for: 0.3 },
              ] },
        ],
    });

    // --- SCENE 6 — skid then roll ------------------------------------------------------
    scenes.push({
        id: 'skid', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('skid', { alpha: 1 })]),
        shots: [
            { id: 'k0', sfx: [['whoosh', 0], ['pop', 0.6]], dialogue: [vo(P[20], 0.2)],
              actions: [
                  ...reveal('skid', 'h', 0.15, { span: 0.35 }),
                  ...reveal('skid', skid.floorId, 0.3, { span: 0.3 }),
                  ...build('skid', skid.groups[0], 0.6, { gap: 0.06, span: 0.3 }),
              ] },
            { id: 'k1', sfx: [['pop', 0.4]], dialogue: [vo(P[21], 0.2)],
              actions: [
                  ...build('skid', skid.groups[1], 0.4, { gap: 0.06, span: 0.3 }),
              ] },
            { id: 'k2', sfx: [['pop', 0.4]], dialogue: [vo(P[22], 0.2)],
              actions: [
                  ...build('skid', skid.groups[2], 0.4, { gap: 0.06, span: 0.3 }),
              ] },
        ],
    });

    // --- SCENE 7 — torque and the completed line ------------------------------------------
    scenes.push({
        id: 'torque', palette: 'game',
        background: { color: '#081029' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('torque', { alpha: 1 })]),
        shots: [
            { id: 't0', sfx: [['whoosh', 0], ['pop', 0.4]], dialogue: [vo(P[23], 0.2)],
              actions: [
                  ...reveal('torque', 'h', 0.15, { span: 0.35 }),
                  ...build('torque', ['tf_bg', 'tf_t', 'tf_n'], 0.4,
                           { gap: 0.14, span: 0.4 }),
              ] },
            { id: 't1', sfx: [['pop', 0.3]], dialogue: [vo(P[24], 0.2)],
              actions: [...reveal('torque', 'h2', 0.3, { span: 0.4 })] },
            { id: 't2', sfx: [['riser', 0.2, 0.34]], dialogue: [vo(P[25], 0.2)],
              actions: [
                  ...pop('torque', 'fbg', 0.3, { span: 0.4 }),
                  ...pop('torque', 'ff', 0.5, { span: 0.4 }),
                  ...reveal('torque', 'fn', 1.5, { span: 0.4 }),
              ] },
        ],
    });

    // --- SCENE 8 — what a flat world cannot do -------------------------------------------
    scenes.push({
        id: 'flat', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('flat', { alpha: 1 })]),
        shots: [
            { id: 'w0', sfx: [['whoosh', 0]], dialogue: [vo(P[26], 0.2)],
              actions: [...reveal('flat', 'h', 0.15, { span: 0.4 })] },
            { id: 'w1', sfx: [['pop', 0.3]], dialogue: [vo(P[27], 0.2)],
              actions: [...build('flat', flat.cmp.left, 0.3, { gap: 0.12, span: 0.32 })] },
            { id: 'w2', sfx: [['pop', 0.3]], dialogue: [vo(P[28], 0.2)],
              actions: [...build('flat', flat.cmp.right, 0.3, { gap: 0.12, span: 0.32 })] },
        ],
    });

    // --- SCENE 9 — all seven -------------------------------------------------------------
    scenes.push({
        id: 'steps', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            { character: 'nova', as: 'nova', at: [930, 1400], scale: 0.3 },
            offstage('vector'), castBoard('steps', { alpha: 1 }),
        ]),
        shots: [
            { id: 'p0', sfx: [['whoosh', 0], ['pop', 0.5]],
              dialogue: [says('nova', P[29], 0.3)],
              actions: [
                  rest('nova'),
                  ...express('nova', 'keen', 0.3, { hold: 1.0 }),
                  ...reveal('steps', 'h', 0.15, { span: 0.35 }),
                  ...ballBlinks('nova', 3.0, 31),
              ] },
            { id: 'p1', sfx: [0, 1, 2, 3, 4, 5].map((i) => ['tick', 0.3 + i * 0.22])
                  .concat([['pop', 1.7]]),
              dialogue: [vo(P[30], 0.2)],
              actions: [
                  ...[0, 1, 2, 3, 4, 5].flatMap((i) =>
                      build('steps', steps.rows.rowIds(i), 0.3 + i * 0.22,
                            { gap: 0.03, span: 0.26 })),
                  ...build('steps', steps.rows.rowIds(6), 1.7,
                           { gap: 0.05, span: 0.36, how: pop }),
              ] },
            { id: 'p2', sfx: [['riser', 0.1, 0.34]], dialogue: [vo(P[31], 0.2)],
              actions: [...pop('steps', 'sc_t', 0.3, { span: 0.45 })] },
        ],
    });

    // --- SCENE 10 — the cliffhanger ----------------------------------------------------------
    scenes.push({
        id: 'next', palette: 'game',
        background: { color: '#070c1e' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            { character: 'bolt', as: 'bolt', at: [160, 640], scale: 0.34 },
            { character: 'vector', as: 'vector', at: [920, 640], scale: 0.3 },
            castBoard('next', { alpha: 1 }),
        ]),
        shots: [
            { id: 'n0', sfx: [['whoosh', 0], ['pop', 0.6]],
              dialogue: [says('bolt', P[32], 0.3)],
              actions: [
                  rest('bolt'), rest('vector'),
                  ...express('bolt', 'sure', 0.3, { hold: 1.2 }),
                  ...pop('next', 'nc_t', 0.6, { span: 0.5 }),
                  ...ballBlinks('bolt', 3.4, 23),
              ] },
            { id: 'n1', sfx: [['riser', 0.4, 0.4]], dialogue: [vo(P[33], 0.2)],
              actions: [
                  ...express('vector', 'keen', 0.3, { hold: 1.8 }),
                  ...pop('next', 'nb_t', 0.4, { span: 0.5 }),
                  ...reveal('next', 'nk', 1.4, { span: 0.3 }),
                  ...pop('next', 'nt', 1.8, { span: 0.45 }),
              ] },
        ],
    });

    // --- SCENE 11 — the end card -------------------------------------------------------------
    scenes.push({
        id: 'card', palette: 'game',
        background: { color: '#04060f' },
        transitionIn: { kind: 'crossfade', duration: 0.4 },
        cast: [offstage('vector'), castBoard('card', { alpha: 1 })],
        shots: [
            { id: 'z0', sfx: [['riser', 0, 0.42]], dialogue: [vo(P[34], 0.3)],
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
