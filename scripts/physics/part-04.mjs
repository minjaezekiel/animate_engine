/**
 * Part 4 — "One line does every collision".
 *
 * The impulse. Relative velocity, the separation guard, the two laws that
 * pin j down, and then the two payoffs: part one's "the cue ball stops
 * dead" and part three's reflection formula both fall straight out of the
 * same line. That is the shape of the episode and the reason it is placed
 * fourth rather than second.
 *
 * ## The convention changes here, and the film says so
 *
 * Part three pointed the normal **away from the surface, toward the ball**,
 * because for a wall that is the only thing it can mean. Two balls have no
 * wall, so here n points **from A to B** — and the sign of the approach
 * test flips with it: closing is now `vrel · n > 0`.
 *
 * Changing a convention between episodes and not saying so is how a viewer
 * ends up with code that is wrong by a sign and no idea why. So Vector
 * states the change out loud, and the film shows that the two cases agree
 * once B is infinitely heavy.
 *
 * ## The physics
 *
 * With n̂ from A to B, `vrel = vA − vB`, and `vn = vrel · n̂`:
 *
 *     j  =  −(1 + e) · vn  /  (1/mA + 1/mB)
 *     vA +=  j/mA · n̂          vB −=  j/mB · n̂
 *
 * - This is the standard impulse for a **frictionless, non-rotating**
 *   collision resolved along the normal. Friction is part five, spin is
 *   part six, and the narration says so rather than implying this is
 *   everything.
 * - It conserves momentum exactly, for any masses: the two velocity changes
 *   are `+j n̂/mA` and `−j n̂/mB`, so the momentum changes are `+j n̂` and
 *   `−j n̂`, which cancel. That is not an approximation and it is worth
 *   saying out loud.
 * - **Equal masses, head-on, e = 1** gives j = −m·u and the two exchange
 *   velocities. Part one's claim, derived rather than asserted.
 * - **mB → ∞** makes 1/mB = 0, so `vA += −(1+e)·vn·n̂`, which at e = 1 is
 *   `vA − 2(vA·n̂)n̂`. Part three's reflection, derived rather than asserted.
 *   This is also exactly why a static body is given infinite mass in a real
 *   engine instead of being special-cased.
 * - **Resolve only when vn > 0.** Without it an already-separating pair is
 *   pushed back together — the two-body version of part three's sticky wall.
 */
import {
    BAND, BOLT, FONT, GAME_PALETTE, L, M, NOVA, SAFE, VECTOR, Z, ballBlinks,
    bannerParts, board, build, castBoard, claimParts, codePanelParts,
    compareParts, conceal, countTo, derivationParts, diagramBall, diagramBallIds,
    ellipsePart, endCard, express, fitShots, flash, flashPart, formulaParts,
    gridScenery, headingPart, hideBall, hookTitle, impactParts, liftSfx, noteParts,
    normalParts, pathPart, pop, readoutParts, rectPart, rest, reveal, roll,
    roundRect, SFX_ASSETS, shiftBy, showBall, spinMark, squash, stepRows, textPart,
    titleAt, vectorArrow, wallParts,
} from './common.mjs';
import { META, voicesFor } from '../lib/physics.mjs';

const PART = 4;

const TALK_Y = 950;
const TALK_S = 0.82;
const LEFT = 290;
const RIGHT = 790;

// ---------------------------------------------------------------------------
// The narration
// ---------------------------------------------------------------------------

const P = [
    /* 0  VECTOR */ 'Every collision in your game is one line of code. This one.',
    /* 1  BOLT   */ 'That is it? For any two things, any weights, any speeds?',
    /* 2  VECTOR */ 'Any two. And by the end you will have built it yourself.',
    /* 3  VECTOR */ 'First: forget how fast each of you is going. It does not matter.',
    /* 4  VECTOR */ 'What matters is how fast you are closing on each other.',
    /* 5  VECTOR */ 'Subtract one velocity from the other. That is relative velocity.',
    /* 6  VECTOR */ 'Two balls going the same way at the same speed never collide.',
    /* 7  VECTOR */ 'Now dot it with the normal. One number: the closing speed.',
    /* 8  VECTOR */ 'A note. Last time the normal pointed away from the wall.',
    /* 9  VECTOR */ 'Two balls have no wall, so point it from A to B.',
    /*10  VECTOR */ 'Closing is now a positive number. That is the only thing that '
        + 'flipped.',
    /*11  NOVA   */ 'And if we are already moving apart?',
    /*12  VECTOR */ 'Then do nothing. Touching is not colliding.',
    /*13  VECTOR */ 'Skip that check and your balls grab each other and vibrate.',
    /*14  VECTOR */ 'Now, two rules decide everything that happens next.',
    /*15  VECTOR */ 'One: momentum is conserved. Whatever one of you gains, the other '
        + 'loses.',
    /*16  VECTOR */ 'Two: bounciness. How much of the closing speed comes back out.',
    /*17  VECTOR */ 'Two rules, two unknowns. There is exactly one answer.',
    /*18  VECTOR */ 'Minus one plus e, times the closing speed, over one over each mass.',
    /*19  VECTOR */ 'That is the impulse. Call it j.',
    /*20  VECTOR */ 'Apply it: add j over your mass along the normal. She subtracts.',
    /*21  VECTOR */ 'Equal and opposite, so the momentum adds up to exactly what it '
        + 'was.',
    /*22  BOLT   */ 'Put my numbers in. Equal mass, straight on, nothing lost.',
    /*23  VECTOR */ 'Then j is minus your mass times your speed. You stop. She leaves '
        + 'at yours.',
    /*24  BOLT   */ 'That is part one. You just did it with algebra.',
    /*25  VECTOR */ 'Now make her heavier. One over a big mass is nearly nothing.',
    /*26  VECTOR */ 'She barely moves. You take almost all of it.',
    /*27  VECTOR */ 'Push that all the way: a mass so big that one over it is zero.',
    /*28  VECTOR */ 'The line becomes minus one plus e, times vee dot en. A wall.',
    /*29  VECTOR */ 'That is part three, out of the same line. Walls are just heavy '
        + 'things.',
    /*30  VECTOR */ 'Which is exactly how real engines do it. No special case.',
    /*31  VECTOR */ 'Five of the six. Only the bounciness is still a letter.',
    /*32  NOVA   */ 'You keep writing e and never saying what it is.',
    /*33  VECTOR */ 'Next time. Bounce, grip, and why your game feels floaty without '
        + 'them.',
    /*34  VECTOR */ "Follow, and I'll see you in part five.",
];

const T = {
    kicker: `GAME PHYSICS  ·  PART ${PART}`,
    title: 'One line does every collision',
    sub: 'impulse · relative velocity · any two masses',

    big: 'j  =  − ( 1 + e )  ·  vn  /  ( 1/m₁ + 1/m₂ )',

    rH: 'RELATIVE VELOCITY',
    rF: 'v rel   =   v₁  −  v₂',
    rN: 'not how fast each one is going. how fast the gap is closing.',
    rSame: 'same direction, same speed  →  relative velocity is zero',

    vH: 'THE CLOSING SPEED',
    vF: 'vn   =   v rel  ·  n',
    vN: 'one number: how fast they are coming together, along the normal',
    vRead: 'vn',

    cH: 'THE NORMAL POINTS A TO B NOW',
    cL: ['PART 3  ·  A WALL', 'away from the surface,\ntoward the ball.\nclosing was negative.'],
    cR: ['PART 4  ·  TWO BALLS', 'there is no surface.\nfrom A to B instead.\nclosing is positive.'],
    cN: 'the maths is identical. only the sign of the test moved.',

    sH: 'TOUCHING IS NOT COLLIDING',
    sF: 'if  vn  ≤  0 :   do nothing',
    sN: 'already moving apart — leave them alone',
    sBad: 'resolve a separating pair and they grab each other and vibrate',

    tH: 'TWO RULES',
    tL: ['MOMENTUM IS KEPT', 'whatever one of them\ngains, the other loses.\nexactly, every time.'],
    tR: ['BOUNCINESS', 'how much of the closing\nspeed comes back out.\none number, called e.'],
    tN: 'two rules, two unknowns, one answer',

    dH: 'SOLVE FOR THE IMPULSE',
    dN: 'one number, in units of momentum: how big a kick the collision delivers',

    aH: 'APPLY IT',
    aF1: 'v₁   +=   j / m₁   ·   n',
    aF2: 'v₂   −=   j / m₂   ·   n',
    aN: 'equal and opposite, so the momentum is exactly what it was before',

    eH: 'EQUAL MASS, HEAD ON, NOTHING LOST',
    eN: 'j  =  − m u      →      he stops, she leaves at u',
    ePay: 'part one, derived instead of asserted',

    hH: 'MAKE HER HEAVIER',
    hN: '1 / big  is nearly nothing — so she barely changes and he takes it all',

    iH: 'AND A WALL IS JUST INFINITELY HEAVY',
    iF: "1 / m₂  =  0      →      v'  =  v  −  ( 1 + e )( v · n ) n",
    iN: 'part three, out of the same line. real engines do exactly this.',

    stH: 'FIVE OF SIX',
    steps: [
        [1, 'POSITION', 'where is it', '#36e3ff'],
        [2, 'VELOCITY', 'how fast, and which way', '#36e3ff'],
        [3, 'DETECTION', 'did they touch', '#ffd23d'],
        [4, 'NORMAL', 'which way did the hit push', '#ff4d8d'],
        [5, 'RESPONSE', 'change both velocities  —  this part', '#8e7bff'],
        [6, 'RESTITUTION', 'how much bounce survives', '#3ddc84'],
    ],

    codeT: '# the whole collision response',
    nextK: `NEXT  ·  PART ${PART + 1}`,
    next: 'Bounce and grip:\nrestitution and friction',
};

/** The response, in Python, exactly as the series has built it. */
const CODE = [
    [0, [['codeFn', 'nx, ny'], ['ink', ' = unit(b.x - a.x, b.y - a.y)']]],
    [0, [['codeFn', 'vn'], ['ink', '     = (a.vx - b.vx)*nx + (a.vy - b.vy)*ny']]],
    [0, [['codeKey', 'if'], ['ink', ' vn <= '], ['codeNum', '0'], ['ink', ':'],
         ['codeCmt', '    # already parting']]],
    [1, [['codeKey', 'return']]],
    [0, [['codeFn', 'j'], ['ink', '      = -('], ['codeNum', '1'], ['ink', ' + e)*vn / ('],
         ['codeNum', '1'], ['ink', '/a.m + '], ['codeNum', '1'], ['ink', '/b.m)']]],
    [0, [['ink', 'a.vx += j/a.m * nx;  a.vy += j/a.m * ny']]],
    [0, [['ink', 'b.vx -= j/b.m * nx;  b.vy -= j/b.m * ny']]],
];

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

/** SCENE 1 — the hook: the line itself, before anybody can read it. */
function boardHook() {
    return {
        ...board('hook', [
            // Big, centred, and deliberately unreadable at first. A formula
            // you cannot yet parse is a better hook than a promise that you
            // will be able to: it is the thing itself.
            pathPart('bgp', roundRect(70, 820, 940, 180, 24),
                     { fill: 'panel', stroke: 'tangent', strokeWidth: 3, z: 90,
                       alpha: 0 }),
            textPart('bt', T.big, { at: [540, 920], font: `800 46px ${FONT}`,
                                    fill: 'tangent', z: 91, alpha: 0,
                                    maxWidth: 880, lineHeight: 58 }),
            flashPart('fl'),
            ...hookTitle(T.kicker, T.title, T.sub),
        ]),
    };
}

/** SCENE 2 — relative velocity. */
function boardRel() {
    const A = [300, 840];
    const B = [740, 840];
    const va = vectorArrow('ra', [380, 840], [600, 840], { width: 10, head: 26 });
    const vb = vectorArrow('rb', [820, 840], [880, 840], { width: 10, head: 26 });
    // The same pair, both going the same way at the same speed: the case
    // that proves relative velocity is the thing that matters.
    const sa = vectorArrow('sa', [380, 1090], [560, 1090], { width: 9, head: 22,
                                                             fill: 'dim' });
    const sb = vectorArrow('sb', [820, 1090], [1000, 1090], { width: 9, head: 22,
                                                              fill: 'dim' });
    return {
        ...board('rel', [
            headingPart('h', T.rH, { y: BAND.heading, fill: 'velocity', size: 48 }),
            ...formulaParts('rf', T.rF, { at: [540, 640], fill: 'velocity', size: 46,
                                          note: T.rN }),
            ...diagramBall('rla', A, 76),
            ...diagramBall('rlb', B, 76, { base: 'nova', baseDark: 'novaDark' }),
            ...va.parts, ...vb.parts,
            ...diagramBall('rsa', [300, 1090], 60),
            ...diagramBall('rsb', [740, 1090], 60, { base: 'nova',
                                                     baseDark: 'novaDark' }),
            ...sa.parts, ...sb.parts,
            // The two rows differ only in their arrow lengths, which at a
            // glance is no difference at all. The labels are what make the
            // comparison readable in a single frame.
            textPart('rk1', 'CLOSING', { at: [540, 760], font: `800 28px ${FONT}`,
                                         fill: 'velocity', z: 90, alpha: 0 }),
            textPart('rk2', 'NEVER CLOSING', { at: [540, 1010],
                                               font: `800 28px ${FONT}`,
                                               fill: 'dim', z: 90, alpha: 0 }),
            ...noteParts('rn', T.rSame, { at: [540, BAND.caption1 + 10], fill: 'dim',
                                          size: 29 }),
        ]),
        va, vb, sa, sb,
    };
}

/** SCENE 3 — dot it with the normal. */
function boardVn() {
    const A = [340, 880];
    const B = [700, 1000];
    const n = normalParts('vn', A, B, { r: 96, extend: 110, tangent: false });
    const rel = vectorArrow('vr', [340, 880], [560, 960], { width: 10, head: 26,
                                                            fill: 'velocity',
                                                            label: 'v rel',
                                                            labelOff: -48 });
    const read = readoutParts('vd', T.vRead, { at: [540, 1240], initial: '0.0',
                                               fill: 'momentum', chipW: 340 });
    return {
        ...board('vnb', [
            headingPart('h', T.vH, { y: BAND.heading, fill: 'momentum', size: 48 }),
            ...formulaParts('vf', T.vF, { at: [540, 640], fill: 'momentum', size: 46,
                                          note: T.vN }),
            ...diagramBall('vba', A, 96),
            ...diagramBall('vbb', B, 96, { base: 'nova', baseDark: 'novaDark' }),
            ...n.parts, ...rel.parts, ...read.parts,
        ]),
        n, rel, read,
    };
}

/** SCENE 4 — the convention that moved, said out loud. */
function boardConv() {
    const cmp = compareParts('cv', T.cL, T.cR, { y: 660, h: 340, accentL: 'dim',
                                                 accentR: 'normal' });
    return {
        ...board('conv', [
            headingPart('h', T.cH, { y: BAND.heading, fill: 'normal', size: 40 }),
            ...cmp.parts,
            ...noteParts('cn', T.cN, { at: [540, 1090], fill: 'ink', size: 31 }),
        ]),
        cmp,
    };
}

/** SCENE 5 — the separation guard. */
function boardSep() {
    const A = [330, 900];
    const B = [690, 900];
    const aa = vectorArrow('pa', [250, 900], [130, 900], { width: 10, head: 26,
                                                           fill: 'restitution' });
    const bb = vectorArrow('pb', [770, 900], [890, 900], { width: 10, head: 26,
                                                           fill: 'restitution' });
    return {
        ...board('sep', [
            headingPart('h', T.sH, { y: BAND.heading, fill: 'restitution', size: 44 }),
            ...diagramBall('sa2', A, 80),
            ...diagramBall('sb2', B, 80, { base: 'nova', baseDark: 'novaDark' }),
            ...aa.parts, ...bb.parts,
            ...formulaParts('sf', T.sF, { at: [540, 1120], fill: 'restitution',
                                          size: 46, note: T.sN }),
            ...noteParts('sbd', T.sBad, { at: [540, BAND.caption2 + 10], fill: 'loss',
                                          size: 28 }),
        ]),
        aa, bb,
    };
}

/** SCENE 6 — the two rules that pin j down. */
function boardRules() {
    const cmp = compareParts('tr', T.tL, T.tR, { y: 660, h: 340, accentL: 'momentum',
                                                 accentR: 'restitution' });
    return {
        ...board('rules', [
            headingPart('h', T.tH, { y: BAND.heading, fill: 'ink', size: 50 }),
            ...cmp.parts,
            ...noteParts('tn', T.tN, { at: [540, 1090], fill: 'ink', size: 32 }),
        ]),
        cmp,
    };
}

/** SCENE 7 — the derivation, and the line it lands on. */
function boardDer() {
    const der = derivationParts('dv', [
        ['momentum kept:        m₁Δv₁  =  − m₂Δv₂', false],
        ['bounciness:               v out  =  − e · v in', false],
        ['solve the pair:', false],
    ], { y: 660, lh: 86, size: 36 });
    return {
        ...board('der', [
            headingPart('h', T.dH, { y: BAND.heading, fill: 'tangent', size: 46 }),
            ...der.parts,
            ...formulaParts('df', T.big, { at: [540, 1030], fill: 'tangent', size: 42,
                                           note: T.dN }),
        ]),
        der,
    };
}

/** SCENE 8 — applying it, equal and opposite. */
function boardApply() {
    const A = [330, 820];
    const B = [740, 820];
    const ja = vectorArrow('ja', [250, 820], [110, 820], { width: 12, head: 30,
                                                           fill: 'tangent' });
    const jb = vectorArrow('jb', [820, 820], [960, 820], { width: 12, head: 30,
                                                           fill: 'tangent' });
    return {
        ...board('apply', [
            headingPart('h', T.aH, { y: BAND.heading, fill: 'tangent', size: 50 }),
            ...diagramBall('apa', A, 80),
            ...diagramBall('apb', B, 80, { base: 'nova', baseDark: 'novaDark' }),
            ...ja.parts, ...jb.parts,
            ...formulaParts('af1', T.aF1, { at: [540, 1010], fill: 'tangent',
                                            size: 42 }),
            ...formulaParts('af2', T.aF2, { at: [540, 1160], fill: 'tangent',
                                            size: 42 }),
            ...noteParts('an', T.aN, { at: [540, BAND.caption2 + 20], fill: 'momentum',
                                       size: 29 }),
        ]),
        ja, jb,
    };
}

/** SCENE 9 — part one's claim, derived. */
function boardEqual() {
    const before = vectorArrow('eb', [370, 880], [560, 880], { width: 11, head: 28 });
    const after = vectorArrow('ea', [810, 880], [1000, 880], { width: 11, head: 28 });
    return {
        ...board('equal', [
            headingPart('h', T.eH, { y: BAND.heading, fill: 'momentum', size: 38 }),
            ...diagramBall('eqa', [290, 880], 84),
            ...diagramBall('eqb', [730, 880], 84, { base: 'nova',
                                                    baseDark: 'novaDark' }),
            ...before.parts, ...after.parts,
            ...formulaParts('ef', T.eN, { at: [540, 1120], fill: 'momentum',
                                          size: 38 }),
            ...claimParts('ep', T.ePay, { at: [540, BAND.caption2 + 20], size: 38,
                                          fill: 'velocity' }),
        ]),
        before, after,
    };
}

/** SCENE 10 — heavy against light, and then infinitely heavy. */
function boardHeavy() {
    const small = vectorArrow('ha', [250, 900], [110, 900], { width: 11, head: 28,
                                                              fill: 'tangent' });
    const tiny = vectorArrow('hb', [900, 900], [940, 900], { width: 11, head: 28,
                                                             fill: 'tangent' });
    return {
        ...board('heavy', [
            headingPart('h', T.hH, { y: BAND.heading, fill: 'tangent', size: 48 }),
            ...diagramBall('hva', [330, 900], 62),
            ...diagramBall('hvb', [740, 900], 150, { base: 'nova',
                                                     baseDark: 'novaDark' }),
            ...small.parts, ...tiny.parts,
            textPart('hl', 'light', { at: [330, 1010], font: `700 28px ${FONT}`,
                                      fill: 'dim', z: 90, alpha: 0 }),
            textPart('hr', 'heavy', { at: [740, 1090], font: `700 28px ${FONT}`,
                                      fill: 'dim', z: 90, alpha: 0 }),
            ...noteParts('hn', T.hN, { at: [540, BAND.caption0], fill: 'dim',
                                       size: 29 }),
        ]),
        small, tiny,
    };
}

/** SCENE 11 — the wall, as a mass. */
function boardInf() {
    const w = wallParts('iw', [120, 1120], [960, 1120], { thickness: 22,
                                                          toward: [540, 840],
                                                          normalLen: 0, normal: false });
    const vin = vectorArrow('ii', [250, 800], [470, 1110], { width: 11, head: 28,
                                                             fill: 'velocity' });
    const vout = vectorArrow('io', [470, 1110], [690, 800], { width: 11, head: 28,
                                                              fill: 'restitution' });
    return {
        ...board('inf', [
            headingPart('h', T.iH, { y: BAND.heading, fill: 'restitution', size: 38 }),
            ...formulaParts('if2', T.iF, { at: [540, 650], fill: 'restitution',
                                           size: 36 }),
            ...w.parts, ...vin.parts, ...vout.parts,
            textPart('im', 'm₂  =  ∞', { at: [540, 1190], font: `800 40px ${FONT}`,
                                         fill: 'dim', z: 90, alpha: 0 }),
            ...noteParts('in2', T.iN, { at: [540, BAND.caption2], fill: 'velocity',
                                        size: 29 }),
        ]),
        w, vin, vout,
    };
}

/** SCENE 12 — the code. */
function boardCode() {
    const code = codePanelParts('cd', CODE, { x: 56, y: 620, w: 968, lh: 48, size: 25,
                                              title: T.codeT });
    return { ...board('code', [...code.parts]), code };
}

/** SCENE 13 — five of six. */
function boardSteps() {
    const rows = stepRows('sr', T.steps, { y: 580, h: 96, gap: 11 });
    return {
        ...board('steps', [
            headingPart('h', T.stH, { y: 512, fill: 'tangent', size: 44 }),
            ...rows.parts,
        ]),
        rows,
    };
}

/** SCENE 14 — the cliffhanger: the letter nobody has explained. */
function boardNext() {
    return {
        ...board('next', [
            textPart('e', 'e', { at: [540, 880], font: `800 260px ${FONT}`,
                                 fill: 'restitution', z: 95, alpha: 0 }),
            ...noteParts('en', 'written in every line so far. never once explained.',
                         { at: [540, 1020], fill: 'dim', size: 30 }),
            textPart('nk', T.nextK, { at: [540, 1210], font: `700 32px ${FONT}`,
                                      fill: 'velocity', z: 90, alpha: 0 }),
            textPart('nt', 'bounce, and grip', { at: [540, 1300],
                                                 font: `800 54px ${FONT}`, fill: 'ink',
                                                 z: 90, alpha: 0,
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

export function partFour() {
    const hook = boardHook();
    const rel = boardRel();
    const vn = boardVn();
    const conv = boardConv();
    const sep = boardSep();
    const rules = boardRules();
    const der = boardDer();
    const apply = boardApply();
    const equal = boardEqual();
    const heavy = boardHeavy();
    const inf = boardInf();
    const code = boardCode();
    const steps = boardSteps();
    const nxt = boardNext();
    const card = endCard(T.next, PART);
    const ban = bannerParts(PART);

    const boards = [hook, rel, vn, conv, sep, rules, der, apply, equal, heavy,
                    inf, code, steps, nxt,
                    board('card', card.parts), board('ban', ban)];

    const characters = { bolt: BOLT, nova: NOVA, vector: VECTOR };
    for (const b of boards) {
        characters[b.name] = { role: 'effect', palette: 'game', parts: b.parts };
    }
    const withBan = (cast) => [...cast, castBoard('ban', { alpha: 1 })];
    const grid = gridScenery();
    const scenes = [];

    // --- SCENE 1 — the hook -------------------------------------------------
    scenes.push({
        id: 'hook', palette: 'game',
        background: { color: '#04060f' },
        transitionIn: { kind: 'fade', from: '#000000', duration: 0.5 },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            castBoard('hook', { alpha: 1 }),
            { character: 'vector', as: 'vector', at: [540, 1240], scale: 0.52 },
            { character: 'bolt', as: 'bolt', at: [200, 1260], scale: 0.42,
              alpha: 0 },
        ]),
        shots: [
            { id: 'h0', sfx: [['riser', 0.1, 0.4], ['impact', 1.05]],
              dialogue: [says('vector', P[0], 0.28)],
              actions: [
                  rest('vector'), rest('bolt'),
                  ...express('vector', 'sure', 0.3, { hold: 1.2 }),
                  ...flash('hook', 'fl', 1.05, { peak: 0.26, span: 0.2 }),
                  ...pop('hook', 'bgp', 1.05, { span: 0.4 }),
                  ...pop('hook', 'bt', 1.25, { span: 0.4 }),
              ] },
            { id: 'h1', sfx: [['pop', 0.2]], dialogue: [says('bolt', P[1], 0.28)],
              actions: [
                  { target: 'bolt', do: 'show', at: 0.15, for: 0.3 },
                  ...express('bolt', 'shock', 0.3, { hold: 1.2 }),
                  ...ballBlinks('bolt', 4.0, 13),
              ] },
            { id: 'h2', dialogue: [says('vector', P[2], 0.24)],
              actions: [
                  ...express('vector', 'keen', 0.3, { hold: 1.6 }),
                  ...build('hook', ['kicker', 'title', 'titlesub'], 0.6,
                           { gap: 0.2, span: 0.45 }),
                  ...ballBlinks('bolt', 4.4, 29),
              ] },
        ],
    });

    // --- SCENE 2 — relative velocity ----------------------------------------
    scenes.push({
        id: 'rel', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('rel', { alpha: 1 })]),
        shots: [
            { id: 'r0', sfx: [['whoosh', 0], ['pop', 0.6]], dialogue: [vo(P[3], 0.2)],
              actions: [
                  ...reveal('rel', 'h', 0.15, { span: 0.35 }),
                  ...showBall('rel', 'rla', 0.5),
                  ...showBall('rel', 'rlb', 0.65),
                  ...rel.va.ids.flatMap((id) => reveal('rel', id, 1.0, { span: 0.3 })),
                  ...rel.vb.ids.flatMap((id) => reveal('rel', id, 1.3, { span: 0.3 })),
                  ...reveal('rel', 'rk1', 1.6, { span: 0.3 }),
              ] },
            { id: 'r1', sfx: [['pop', 0.3]], dialogue: [vo(P[4], 0.2)],
              actions: [
                  ...build('rel', ['rf_bg', 'rf_t', 'rf_n'], 0.3,
                           { gap: 0.14, span: 0.4 }),
              ] },
            { id: 'r2', dialogue: [vo(P[5], 0.2)], actions: [] },
            { id: 'r3', sfx: [['tick', 0.4], ['pop', 1.6]], dialogue: [vo(P[6], 0.2)],
              actions: [
                  ...showBall('rel', 'rsa', 0.4),
                  ...showBall('rel', 'rsb', 0.55),
                  ...rel.sa.ids.flatMap((id) => reveal('rel', id, 0.9, { span: 0.3 })),
                  ...rel.sb.ids.flatMap((id) => reveal('rel', id, 1.1, { span: 0.3 })),
                  ...reveal('rel', 'rk2', 1.3, { span: 0.3 }),
                  ...pop('rel', 'rn', 1.7, { span: 0.4 }),
              ] },
        ],
    });

    // --- SCENE 3 — the closing speed ----------------------------------------
    scenes.push({
        id: 'vnb', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('vnb', { alpha: 1 })]),
        shots: [
            { id: 'v0', sfx: [['whoosh', 0], ['pop', 0.7], ['tick', 1.5]],
              dialogue: [vo(P[7], 0.2)],
              actions: [
                  ...reveal('vnb', 'h', 0.15, { span: 0.35 }),
                  ...showBall('vnb', 'vba', 0.5),
                  ...showBall('vnb', 'vbb', 0.65),
                  ...build('vnb', vn.n.ids, 1.0, { gap: 0.14, span: 0.35 }),
                  ...vn.rel.ids.flatMap((id) => reveal('vnb', id, 1.5, { span: 0.3 })),
                  ...build('vnb', vn.read.ids, 2.0, { gap: 0.12, span: 0.3 }),
                  ...countTo('vnb', vn.read.value,
                             { from: 0, to: 6.4, at: 2.4, span: 0.8, decimals: 1 }),
                  ...build('vnb', ['vf_bg', 'vf_t', 'vf_n'], 3.2,
                           { gap: 0.14, span: 0.4 }),
              ] },
        ],
    });

    // --- SCENE 4 — the convention that moved ---------------------------------
    scenes.push({
        id: 'conv', palette: 'game',
        background: { color: '#0a1230' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('conv', { alpha: 1 })]),
        shots: [
            { id: 'c0', sfx: [['whoosh', 0], ['pop', 0.4]], dialogue: [vo(P[8], 0.2)],
              actions: [
                  ...reveal('conv', 'h', 0.15, { span: 0.35 }),
                  ...build('conv', conv.cmp.left, 0.4, { gap: 0.12, span: 0.32 }),
              ] },
            { id: 'c1', sfx: [['pop', 0.3]], dialogue: [vo(P[9], 0.2)],
              actions: [
                  ...build('conv', conv.cmp.right, 0.3, { gap: 0.12, span: 0.32 }),
              ] },
            { id: 'c2', sfx: [['pop', 0.3]], dialogue: [vo(P[10], 0.2)],
              actions: [...pop('conv', 'cn', 0.3, { span: 0.45 })] },
        ],
    });

    // --- SCENE 5 — the guard --------------------------------------------------
    scenes.push({
        id: 'sep', palette: 'game',
        background: { color: '#120a1e' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            { character: 'nova', as: 'nova', at: [170, 1360], scale: 0.36 },
            offstage('vector'), castBoard('sep', { alpha: 1 }),
        ]),
        shots: [
            { id: 's0', sfx: [['whoosh', 0], ['pop', 0.6]],
              dialogue: [says('nova', P[11], 0.3)],
              actions: [
                  rest('nova'),
                  ...express('nova', 'think', 0.3, { hold: 1.0 }),
                  ...reveal('sep', 'h', 0.15, { span: 0.35 }),
                  ...showBall('sep', 'sa2', 0.5),
                  ...showBall('sep', 'sb2', 0.65),
                  ...sep.aa.ids.flatMap((id) => reveal('sep', id, 1.0, { span: 0.3 })),
                  ...sep.bb.ids.flatMap((id) => reveal('sep', id, 1.2, { span: 0.3 })),
                  ...ballBlinks('nova', 3.4, 31),
              ] },
            { id: 's1', sfx: [['pop', 0.3]], dialogue: [vo(P[12], 0.2)],
              actions: [
                  ...build('sep', ['sf_bg', 'sf_t', 'sf_n'], 0.3,
                           { gap: 0.14, span: 0.4 }),
              ] },
            { id: 's2', sfx: [['pop', 0.3]], dialogue: [vo(P[13], 0.2)],
              actions: [...pop('sep', 'sbd', 0.3, { span: 0.45 })] },
        ],
    });

    // --- SCENE 6 — the two rules ----------------------------------------------
    scenes.push({
        id: 'rules', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('rules', { alpha: 1 })]),
        shots: [
            { id: 'u0', sfx: [['whoosh', 0]], dialogue: [vo(P[14], 0.2)],
              actions: [...reveal('rules', 'h', 0.15, { span: 0.4 })] },
            { id: 'u1', sfx: [['pop', 0.3]], dialogue: [vo(P[15], 0.2)],
              actions: [
                  ...build('rules', rules.cmp.left, 0.3, { gap: 0.12, span: 0.32 }),
              ] },
            { id: 'u2', sfx: [['pop', 0.3]], dialogue: [vo(P[16], 0.2)],
              actions: [
                  ...build('rules', rules.cmp.right, 0.3, { gap: 0.12, span: 0.32 }),
              ] },
            { id: 'u3', sfx: [['pop', 0.3]], dialogue: [vo(P[17], 0.2)],
              actions: [...pop('rules', 'tn', 0.3, { span: 0.45 })] },
        ],
    });

    // --- SCENE 7 — the derivation ---------------------------------------------
    scenes.push({
        id: 'der', palette: 'game',
        background: { color: '#081029' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('der', { alpha: 1 })]),
        shots: [
            { id: 'd0', sfx: [['whoosh', 0], ['tick', 0.4], ['tick', 1.2],
                              ['riser', 2.0, 0.3]],
              dialogue: [vo(P[18], 0.2)],
              actions: [
                  ...reveal('der', 'h', 0.15, { span: 0.35 }),
                  ...reveal('der', 'dv0', 0.4, { span: 0.35 }),
                  ...reveal('der', 'dv1', 1.2, { span: 0.35 }),
                  ...reveal('der', 'dv2', 2.0, { span: 0.3 }),
                  ...build('der', ['df_bg', 'df_t'], 2.4, { gap: 0.16, span: 0.45 }),
              ] },
            { id: 'd1', sfx: [['pop', 0.3]], dialogue: [vo(P[19], 0.2)],
              actions: [...pop('der', 'df_n', 0.3, { span: 0.4 })] },
        ],
    });

    // --- SCENE 8 — applying it --------------------------------------------------
    scenes.push({
        id: 'apply', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('apply', { alpha: 1 })]),
        shots: [
            { id: 'a0', sfx: [['whoosh', 0], ['impact', 0.9]], dialogue: [vo(P[20], 0.2)],
              actions: [
                  ...reveal('apply', 'h', 0.15, { span: 0.35 }),
                  ...showBall('apply', 'apa', 0.4),
                  ...showBall('apply', 'apb', 0.55),
                  ...apply.ja.ids.flatMap((id) => reveal('apply', id, 0.9,
                                                         { span: 0.3 })),
                  ...apply.jb.ids.flatMap((id) => reveal('apply', id, 0.9,
                                                         { span: 0.3 })),
                  ...build('apply', ['af1_bg', 'af1_t'], 1.5, { gap: 0.14, span: 0.4 }),
                  ...build('apply', ['af2_bg', 'af2_t'], 2.1, { gap: 0.14, span: 0.4 }),
              ] },
            { id: 'a1', sfx: [['pop', 0.3]], dialogue: [vo(P[21], 0.2)],
              actions: [...pop('apply', 'an', 0.3, { span: 0.45 })] },
        ],
    });

    // --- SCENE 9 — part one, derived --------------------------------------------
    scenes.push({
        id: 'equal', palette: 'game',
        background: { color: '#10112e' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            { character: 'bolt', as: 'bolt', at: [160, 660], scale: 0.34 },
            offstage('vector'), castBoard('equal', { alpha: 1 }),
        ]),
        shots: [
            { id: 'e0', sfx: [['whoosh', 0]], dialogue: [says('bolt', P[22], 0.3)],
              actions: [
                  rest('bolt'),
                  ...express('bolt', 'keen', 0.3, { hold: 1.2 }),
                  ...reveal('equal', 'h', 0.15, { span: 0.35 }),
                  ...showBall('equal', 'eqa', 0.5),
                  ...showBall('equal', 'eqb', 0.65),
                  ...equal.before.ids.flatMap((id) => reveal('equal', id, 1.1,
                                                             { span: 0.3 })),
                  ...ballBlinks('bolt', 3.4, 43),
              ] },
            { id: 'e1', sfx: [['impact', 0.5], ['pop', 1.4]], dialogue: [vo(P[23], 0.2)],
              actions: [
                  // His arrow goes and hers arrives: the handover, animated,
                  // because two equal arrows side by side pictures the wrong
                  // physics under narration stating the right physics. Part
                  // one's momentum board made exactly that mistake.
                  ...equal.before.ids.flatMap((id) => conceal('equal', id, 0.5,
                                                              { span: 0.25 })),
                  ...equal.after.ids.flatMap((id) => reveal('equal', id, 0.8,
                                                            { span: 0.3 })),
                  ...build('equal', ['ef_bg', 'ef_t'], 1.4, { gap: 0.14, span: 0.4 }),
              ] },
            { id: 'e2', sfx: [['riser', 0.1, 0.34]], dialogue: [says('bolt', P[24], 0.3)],
              actions: [
                  ...express('bolt', 'shock', 0.3, { hold: 1.2 }),
                  ...pop('equal', 'ep_t', 0.5, { span: 0.45 }),
                  ...ballBlinks('bolt', 3.4, 59),
              ] },
        ],
    });

    // --- SCENE 10 — heavier ------------------------------------------------------
    scenes.push({
        id: 'heavy', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('heavy', { alpha: 1 })]),
        shots: [
            { id: 'y0', sfx: [['whoosh', 0], ['pop', 0.6]], dialogue: [vo(P[25], 0.2)],
              actions: [
                  ...reveal('heavy', 'h', 0.15, { span: 0.35 }),
                  ...showBall('heavy', 'hva', 0.5),
                  ...showBall('heavy', 'hvb', 0.7),
                  ...reveal('heavy', 'hl', 1.1, { span: 0.3 }),
                  ...reveal('heavy', 'hr', 1.3, { span: 0.3 }),
              ] },
            { id: 'y1', sfx: [['impact', 0.4]], dialogue: [vo(P[26], 0.2)],
              actions: [
                  ...heavy.small.ids.flatMap((id) => reveal('heavy', id, 0.4,
                                                            { span: 0.3 })),
                  ...heavy.tiny.ids.flatMap((id) => reveal('heavy', id, 0.7,
                                                           { span: 0.3 })),
                  ...reveal('heavy', 'hn', 1.4, { span: 0.4 }),
              ] },
        ],
    });

    // --- SCENE 11 — a wall is infinitely heavy ------------------------------------
    scenes.push({
        id: 'inf', palette: 'game',
        background: { color: '#081029' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('inf', { alpha: 1 })]),
        shots: [
            { id: 'i0', sfx: [['whoosh', 0], ['pop', 0.6]], dialogue: [vo(P[27], 0.2)],
              actions: [
                  ...reveal('inf', 'h', 0.15, { span: 0.35 }),
                  ...reveal('inf', inf.w.wallId, 0.5, { span: 0.3 }),
                  ...pop('inf', 'im', 0.9, { span: 0.4 }),
              ] },
            { id: 'i1', sfx: [['impact', 0.8]], dialogue: [vo(P[28], 0.2)],
              actions: [
                  ...inf.vin.ids.flatMap((id) => reveal('inf', id, 0.4, { span: 0.3 })),
                  ...inf.vout.ids.flatMap((id) => reveal('inf', id, 0.9,
                                                         { span: 0.3 })),
                  ...build('inf', ['if2_bg', 'if2_t'], 1.5, { gap: 0.14, span: 0.4 }),
              ] },
            { id: 'i2', sfx: [['riser', 0.1, 0.32]], dialogue: [vo(P[29], 0.2)],
              actions: [...pop('inf', 'in2', 0.3, { span: 0.45 })] },
        ],
    });

    // --- SCENE 12 — the code --------------------------------------------------------
    scenes.push({
        id: 'code', palette: 'game',
        background: { color: '#070c1e' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('code', { alpha: 1 })]),
        shots: [
            { id: 'k0', sfx: [['whoosh', 0]].concat([0, 1, 2, 3, 4, 5, 6].map(
                  (i) => ['tick', 0.5 + i * 0.4])),
              dialogue: [vo(P[30], 0.2)],
              actions: [
                  ...reveal('code', 'cd_bg', 0.15, { span: 0.4 }),
                  ...reveal('code', 'cd_t', 0.4, { span: 0.3 }),
                  ...[0, 1, 2, 3, 4, 5, 6].flatMap((i) =>
                      build('code', code.code.lineIds(i), 0.5 + i * 0.4,
                            { gap: 0.03, span: 0.22 })),
              ] },
        ],
    });

    // --- SCENE 13 — five of six -------------------------------------------------------
    scenes.push({
        id: 'steps', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('steps', { alpha: 1 })]),
        shots: [
            { id: 'p0', sfx: [['whoosh', 0], ['tick', 0.4], ['tick', 0.65],
                              ['tick', 0.9], ['tick', 1.15], ['pop', 1.5]],
              dialogue: [vo(P[31], 0.2)],
              actions: [
                  ...reveal('steps', 'h', 0.15, { span: 0.35 }),
                  ...[0, 1, 2, 3].flatMap((i) =>
                      build('steps', steps.rows.rowIds(i), 0.4 + i * 0.25,
                            { gap: 0.04, span: 0.3 })),
                  ...build('steps', steps.rows.rowIds(4), 1.5,
                           { gap: 0.05, span: 0.34, how: pop }),
                  ...build('steps', steps.rows.rowIds(5), 2.1,
                           { gap: 0.04, span: 0.35,
                             how: (t2, id, at, o) => reveal(t2, id, at,
                                                            { ...o, to: 0.42 }) }),
              ] },
        ],
    });

    // --- SCENE 14 — the cliffhanger ------------------------------------------------------
    scenes.push({
        id: 'next', palette: 'game',
        background: { color: '#070c1e' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            { character: 'nova', as: 'nova', at: [180, 660], scale: 0.4 },
            { character: 'vector', as: 'vector', at: [900, 660], scale: 0.32 },
            castBoard('next', { alpha: 1 }),
        ]),
        shots: [
            { id: 'n0', sfx: [['whoosh', 0], ['pop', 0.6]],
              dialogue: [says('nova', P[32], 0.3)],
              actions: [
                  rest('nova'), rest('vector'),
                  ...express('nova', 'doubt', 0.3, { hold: 1.2 }),
                  ...pop('next', 'e', 0.6, { span: 0.5 }),
                  ...reveal('next', 'en', 1.4, { span: 0.4 }),
                  ...ballBlinks('nova', 3.4, 23),
              ] },
            { id: 'n1', sfx: [['riser', 0.2, 0.36]], dialogue: [vo(P[33], 0.2)],
              actions: [
                  ...express('vector', 'keen', 0.3, { hold: 1.8 }),
                  ...reveal('next', 'nk', 0.4, { span: 0.3 }),
                  ...pop('next', 'nt', 0.9, { span: 0.45 }),
                  ...ballBlinks('nova', 4.0, 47),
              ] },
        ],
    });

    // --- SCENE 15 — the end card -------------------------------------------------------
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
