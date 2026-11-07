/**
 * Part 5 — "Bounce and grip".
 *
 * Restitution and friction: the two numbers that decide how a collision
 * FEELS, as opposed to the four parts of machinery that decide whether it
 * happens at all.
 *
 * ## The physics, and the two places it is usually got wrong
 *
 * - **e is a ratio of speeds, not of heights.** `e = separation speed /
 *   approach speed`, both measured along the normal. Newton's experimental
 *   law, and the definition every engine uses.
 * - **Energy goes as e², and so does height.** Kinetic energy is
 *   proportional to v², so a ball with e = 0.8 keeps 64% of its energy and
 *   returns to 64% of its height, not 80%. This is the single most common
 *   mistake made about restitution and the film makes a beat of it rather
 *   than skating past.
 * - **e is not a material constant.** It falls as impact speed rises, and
 *   it depends on temperature and on what the thing is hitting. Published
 *   figures are for particular test conditions. The narration says "roughly"
 *   and means it; the table is labelled as approximate.
 * - **Resting contact jitters.** Gravity gives a resting body a small
 *   downward velocity every frame, and with e > 0 that is bounced back
 *   every frame, forever. Every engine solves it the same way: below a
 *   speed threshold, treat e as zero.
 * - **Coulomb friction, clamped against the normal impulse.** The
 *   tangential impulse is `jt = −(v·t) / (1/m₁ + 1/m₂)`, clamped to
 *   `±μ|j|`. That clamp IS the Coulomb model: friction cannot do more than
 *   stop the sliding, and it cannot exceed μ times the normal push.
 * - **Static and kinetic μ differ in reality**, and games almost always use
 *   one number for both. The film says so rather than pretending.
 *
 * Part six takes the next step on purpose: friction at the contact point of
 * a round object does not only slow it down, it spins it.
 */
import {
    BAND, BOLT, FONT, GAME_PALETTE, L, M, NOVA, SAFE, VECTOR, Z, ballBlinks,
    bannerParts, barParts, board, bounceParts, build, castBoard, claimParts,
    codePanelParts, compareParts, conceal, countTo, derivationParts, diagramBall,
    diagramBallIds, ellipsePart, endCard, express, fitShots, flash, flashPart,
    formulaParts, gridScenery, headingPart, hookTitle, impactParts, liftSfx,
    noteParts, pathPart, pop, readoutParts, rectPart, rest, reveal, roundRect,
    SFX_ASSETS, shiftBy, showBall, squash, stepRows, textPart, titleAt,
    vectorArrow, wallParts,
} from './common.mjs';
import { META, voicesFor } from '../lib/physics.mjs';

const PART = 5;

// ---------------------------------------------------------------------------
// The narration
// ---------------------------------------------------------------------------

const P = [
    /* 0  BOLT   */ 'Same height, same code, same everything. Watch what happens.',
    /* 1  NOVA   */ 'So why did you keep bouncing and I just stopped?',
    /* 2  VECTOR */ 'One number was different. Everything else was identical.',
    /* 3  VECTOR */ 'Restitution. Written e. How much of the closing speed comes back '
        + 'out.',
    /* 4  VECTOR */ 'Measure how fast you came together. Measure how fast you left.',
    /* 5  VECTOR */ 'Divide the second by the first. That is e, and that is all it is.',
    /* 6  VECTOR */ 'e of one: you leave as fast as you arrived. Nothing lost.',
    /* 7  VECTOR */ 'e of zero: you leave at nothing. The bounce is gone.',
    /* 8  BOLT   */ 'So e of a half means half the height back?',
    /* 9  VECTOR */ 'No. And this is the thing almost everyone gets wrong.',
    /*10  VECTOR */ 'Energy goes as speed squared. So height goes as e squared.',
    /*11  VECTOR */ 'A ball with e of nought point eight comes back to sixty-four '
        + 'percent.',
    /*12  VECTOR */ 'Not eighty. Square it, every time.',
    /*13  VECTOR */ 'Real numbers, roughly: a superball is nine tenths. Clay is nothing.',
    /*14  VECTOR */ 'And e is not a fixed property. Hit the same thing harder and it '
        + 'drops.',
    /*15  NOVA   */ 'So I just pick a number and put it in?',
    /*16  VECTOR */ 'Almost. There is one bug waiting for you, and it is noisy.',
    /*17  VECTOR */ 'A ball resting on the floor still gains speed every frame.',
    /*18  VECTOR */ 'With any bounce at all, that gets thrown back. Every frame. '
        + 'Forever.',
    /*19  VECTOR */ 'It buzzes on the ground and never settles. Fix it with a threshold.',
    /*20  VECTOR */ 'Below a slow enough approach, treat e as zero. Every engine does '
        + 'this.',
    /*21  VECTOR */ 'Now the other half, and the one most people never add at all.',
    /*22  VECTOR */ 'Bounce handles the normal. Friction handles the sideways part.',
    /*23  VECTOR */ 'Same shape of calculation, along the tangent instead.',
    /*24  VECTOR */ 'But it is capped. Friction can never be more than mu times the '
        + 'normal push.',
    /*25  VECTOR */ 'Push harder into a surface and it grips harder. That cap is the model.',
    /*26  VECTOR */ 'And friction can only ever slow the sliding. It cannot reverse it.',
    /*27  BOLT   */ 'What happens if I leave it out?',
    /*28  VECTOR */ 'Everything slides forever. Nothing settles. Your game feels like '
        + 'ice.',
    /*29  VECTOR */ 'Two numbers, e and mu, and the same six steps you already have.',
    /*30  VECTOR */ 'That is the whole model. Position to bounce, end to end.',
    /*31  NOVA   */ 'Except a real ball on a real floor starts rolling.',
    /*32  VECTOR */ 'It does. Friction acts at the contact point, not the centre.',
    /*33  VECTOR */ 'Next time: spin, and why a ring is harder to turn than a disc.',
    /*34  VECTOR */ "Follow, and I'll see you in part six.",
];

const T = {
    kicker: `GAME PHYSICS  ·  PART ${PART}`,
    title: 'Bounce, and grip',
    sub: 'restitution · friction · two numbers',

    hookL: 'e = 0.9', hookR: 'e = 0.1',
    hookN: 'one number apart',

    dH: 'RESTITUTION',
    dF: 'e   =   speed out   /   speed in',
    dN: 'both measured along the normal. that is the whole definition.',
    dIn: 'SPEED IN', dOut: 'SPEED OUT',

    sH: 'THE TWO ENDS',
    s1: 'e = 1', s1n: 'leaves as fast as it arrived',
    s0: 'e = 0', s0n: 'leaves at nothing',

    qH: 'THE ONE EVERYONE GETS WRONG',
    qF: 'height back   =   e²   ·   height dropped',
    qN: 'energy goes as speed squared, so height goes as e squared',
    qEx: 'e = 0.8      →      64% of the height.      not 80%.',

    mH: 'ROUGHLY, IN THE REAL WORLD',
    mats: [
        ['superball', 0.90, '#3ddc84'],
        ['basketball', 0.78, '#3ddc84'],
        ['tennis ball', 0.75, '#ffd23d'],
        ['wooden block', 0.40, '#ff9f1c'],
        ['lump of clay', 0.05, '#ff5c5c'],
    ],
    mN: 'approximate. e falls as the impact gets harder, so these are not constants.',

    jH: 'THE BUZZING BALL',
    jL: ['WHAT HAPPENS', 'gravity adds a little\nspeed every frame.\ne throws it back.'],
    jR: ['THE FIX', 'below a slow enough\napproach, use e = 0.\nevery engine does this.'],
    jN: 'without it a resting ball buzzes on the floor and never settles',

    fH: 'FRICTION  —  THE OTHER HALF',
    fN: 'bounce works along the normal. friction works along the tangent.',
    fF: 'jt   =   − ( v · t )  /  ( 1/m₁ + 1/m₂ )',

    cH: 'AND IT IS CAPPED',
    cF: '| jt |   ≤   μ   ·   | j |',
    cN: 'push harder into the surface and it grips harder. that cap is the model.',
    cN2: 'friction can only slow the sliding. it can never reverse it.',
    cMu: 'games usually use one μ for sticking and sliding. reality uses two.',

    iH: 'LEAVE IT OUT AND EVERYTHING IS ICE',
    iL: ['NO FRICTION', 'slides forever.\nnothing ever settles.\nthe game feels floaty.'],
    iR: ['WITH FRICTION', 'slides, slows, stops.\nthings stay where\nyou put them.'],

    stH: 'ALL SIX',
    steps: [
        [1, 'POSITION', 'where is it', '#36e3ff'],
        [2, 'VELOCITY', 'how fast, and which way', '#36e3ff'],
        [3, 'DETECTION', 'did they touch', '#ffd23d'],
        [4, 'NORMAL', 'which way did the hit push', '#ff4d8d'],
        [5, 'RESPONSE', 'change both velocities', '#8e7bff'],
        [6, 'RESTITUTION  +  FRICTION', 'how it feels  —  this part', '#3ddc84'],
    ],

    codeT: '# bounce and grip, on top of the impulse',
    nextK: `NEXT  ·  PART ${PART + 1}`,
    next: 'Spin: angular velocity\nand moment of inertia',
};

/** Friction, on top of part four's impulse. */
const CODE = [
    [0, [['codeCmt', '# after the normal impulse j ...']]],
    [0, [['codeFn', 'tx, ty'], ['ink', ' = -ny, nx']]],
    [0, [['codeFn', 'vt'], ['ink', '     = (a.vx - b.vx)*tx + (a.vy - b.vy)*ty']]],
    [0, [['codeFn', 'jt'], ['ink', '     = -vt / ('], ['codeNum', '1'], ['ink', '/a.m + '],
         ['codeNum', '1'], ['ink', '/b.m)']]],
    [0, [['codeFn', 'jt'], ['ink', '     = max(-mu*abs(j), min(mu*abs(j), jt))']]],
    [0, [['ink', 'a.vx += jt/a.m * tx;  b.vx -= jt/b.m * tx']]],
];

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

/** SCENE 1 — the hook: two drops, one number apart. */
function boardHook() {
    const floor = pathPart('fl2', `${M(120, 1180)} ${L(960, 1180)}`,
                           { stroke: 'robotDark', strokeWidth: 14, z: 10, alpha: 0,
                             lineCap: 'round' });
    const tagL = textPart('tl', T.hookL, { at: [320, 1250], font: `800 40px ${FONT}`,
                                           fill: 'restitution', z: 90, alpha: 0 });
    const tagR = textPart('tr2', T.hookR, { at: [760, 1250], font: `800 40px ${FONT}`,
                                            fill: 'loss', z: 90, alpha: 0 });
    return {
        ...board('hook', [
            floor, tagL, tagR, flashPart('flash'),
            ...noteParts('hn', T.hookN, { at: [540, 1340], fill: 'ink', size: 34 }),
            ...hookTitle(T.kicker, T.title, T.sub),
        ]),
        floorId: 'fl2', tagIds: ['tl', 'tr2'],
    };
}

/** SCENE 2 — the definition, with both speeds measured. */
function boardDef() {
    const w = wallParts('dw', [120, 1120], [960, 1120], { thickness: 20,
                                                          toward: [540, 820],
                                                          normal: false });
    const vin = vectorArrow('din', [300, 760], [420, 1100], { width: 11, head: 28,
                                                              fill: 'velocity' });
    const vout = vectorArrow('dout', [660, 1100], [740, 880], { width: 11, head: 28,
                                                                fill: 'restitution' });
    const rIn = readoutParts('ri', T.dIn, { at: [250, 1270], initial: '0',
                                            fill: 'velocity', chipW: 380,
                                            labelSize: 24, size: 44 });
    const rOut = readoutParts('ro', T.dOut, { at: [830, 1270], initial: '0',
                                              fill: 'restitution', chipW: 380,
                                              labelSize: 24, size: 44 });
    return {
        ...board('def', [
            headingPart('h', T.dH, { y: BAND.heading, fill: 'restitution', size: 50 }),
            ...formulaParts('df', T.dF, { at: [540, 640], fill: 'restitution',
                                          size: 40, note: T.dN }),
            ...w.parts, ...vin.parts, ...vout.parts,
            ...diagramBall('dba', [360, 920], 64),
            ...rIn.parts, ...rOut.parts,
        ]),
        w, vin, vout, rIn, rOut,
    };
}

/** SCENE 3 — the two ends of the scale. */
function boardEnds() {
    // Height ratio is e SQUARED, which is the point of the next scene -- so
    // these two are drawn at e = 1 and e = 0, where the square changes
    // nothing and the figure cannot be read as endorsing the mistake.
    const a = bounceParts('ea', { x: 180, floor: 1160, h: 400, e: 1, width: 200,
                                  label: T.s1, colour: 'restitution' });
    const b = bounceParts('eb', { x: 640, floor: 1160, h: 400, e: 0.02, width: 200,
                                  label: T.s0, colour: 'loss' });
    return {
        ...board('ends', [
            headingPart('h', T.sH, { y: BAND.heading, fill: 'restitution', size: 48 }),
            ...a.parts, ...b.parts,
            textPart('n1', T.s1n, { at: [280, 1300], font: `600 26px ${FONT}`,
                                    fill: 'restitution', z: 60, alpha: 0,
                                    maxWidth: 380, lineHeight: 32 }),
            textPart('n0', T.s0n, { at: [740, 1300], font: `600 26px ${FONT}`,
                                    fill: 'loss', z: 60, alpha: 0,
                                    maxWidth: 380, lineHeight: 32 }),
        ]),
        a, b,
    };
}

/**
 * SCENE 4 — the squared one.
 *
 * Drawn at e = 0.8 with the return apex at 0.64 of the drop, which is the
 * claim being made. The two height ticks that `bounceParts` draws are what
 * makes it checkable rather than asserted.
 */
function boardSquare() {
    const b = bounceParts('qb', { x: 300, floor: 1180, h: 480, e: 0.64, width: 300,
                                  colour: 'momentum' });
    return {
        ...board('square', [
            headingPart('h', T.qH, { y: BAND.heading, fill: 'loss', size: 42 }),
            ...b.parts,
            textPart('q100', '100%', { at: [228, 700], font: `700 28px ${FONT}`,
                                       fill: 'dim', align: 'right', z: 60, alpha: 0 }),
            textPart('q64', '64%', { at: [684, 866], font: `800 36px ${FONT}`,
                                     fill: 'momentum', align: 'left', z: 60,
                                     alpha: 0 }),
            textPart('qno', 'not 80%', { at: [684, 918], font: `800 32px ${FONT}`,
                                         fill: 'loss', align: 'left', z: 60,
                                         alpha: 0 }),
            ...formulaParts('qf', T.qF, { at: [540, 1265], fill: 'momentum', size: 36,
                                          note: null }),
            ...noteParts('qn', T.qN, { at: [540, 1380], fill: 'dim', size: 26 }),
        ]),
        b,
    };
}

/** SCENE 5 — a table of real materials, with the caveat attached. */
function boardMats() {
    const parts = [];
    const bars = [];
    T.mats.forEach(([name, e, col], i) => {
        const y = 640 + i * 116;
        parts.push(textPart(`mn${i}`, name, {
            at: [90, y - 28], font: `700 28px ${FONT}`, fill: 'ink', align: 'left',
            z: 60, alpha: 0, maxWidth: 400 }));
        const bar = barParts(`mb${i}`, { x: 90, y, w: 900, h: 30, value: e,
                                         fill: col, showValue: false, z: 50 });
        parts.push(...bar.parts);
        parts.push(textPart(`mv${i}`, e.toFixed(2), {
            at: [990, y - 28], font: `800 30px ${FONT}`, fill: col, align: 'right',
            z: 62, alpha: 0, maxWidth: 200 }));
        bars.push({ bar, ids: [`mn${i}`, ...bar.ids, `mv${i}`] });
    });
    return {
        ...board('mats', [
            headingPart('h', T.mH, { y: BAND.heading, fill: 'restitution', size: 42 }),
            ...parts,
            ...noteParts('mn2', T.mN, { at: [540, BAND.caption2 + 30], fill: 'dim',
                                        size: 26 }),
        ]),
        bars,
    };
}

/** SCENE 6 — the buzzing ball. */
function boardJitter() {
    const cmp = compareParts('jc', T.jL, T.jR, { y: 700, h: 330, accentL: 'loss',
                                                 accentR: 'restitution' });
    return {
        ...board('jitter', [
            headingPart('h', T.jH, { y: BAND.heading, fill: 'loss', size: 48 }),
            ...cmp.parts,
            ...diagramBall('jb', [540, 1140], 56),
            pathPart('jf', `${M(300, 1200)} ${L(780, 1200)}`,
                     { stroke: 'robotDark', strokeWidth: 10, z: 10, alpha: 0,
                       lineCap: 'round' }),
            ...noteParts('jn', T.jN, { at: [540, BAND.caption2 + 30], fill: 'loss',
                                       size: 28 }),
        ]),
        cmp,
    };
}

/** SCENE 7 — friction, along the tangent. */
function boardFric() {
    const w = wallParts('fw', [120, 1060], [960, 1060], { thickness: 20,
                                                          toward: [540, 900],
                                                          normalLen: 150 });
    const slide = vectorArrow('fs', [540, 960], [800, 960], { width: 11, head: 28,
                                                              fill: 'velocity' });
    const grip = vectorArrow('fg', [540, 1012], [360, 1012], { width: 11, head: 28,
                                                               fill: 'tangent' });
    return {
        ...board('fric', [
            headingPart('h', T.fH, { y: BAND.heading, fill: 'tangent', size: 42 }),
            ...w.parts,
            ...diagramBall('fb', [540, 960], 86),
            ...slide.parts, ...grip.parts,
            textPart('fsl', 'sliding', { at: [860, 930], font: `700 27px ${FONT}`,
                                         fill: 'velocity', z: 92, alpha: 0,
                                         maxWidth: 220 }),
            textPart('fgl', 'friction', { at: [300, 1012], font: `700 27px ${FONT}`,
                                          fill: 'tangent', z: 92, alpha: 0,
                                          maxWidth: 220 }),
            ...formulaParts('ff', T.fF, { at: [540, 1210], fill: 'tangent', size: 38,
                                          note: T.fN }),
        ]),
        w, slide, grip,
    };
}

/** SCENE 8 — the clamp that IS the Coulomb model. */
function boardClamp() {
    return {
        ...board('clamp', [
            headingPart('h', T.cH, { y: BAND.heading, fill: 'tangent', size: 48 }),
            ...formulaParts('cf', T.cF, { at: [540, 700], fill: 'tangent', size: 54,
                                          note: T.cN }),
            ...noteParts('cn2', T.cN2, { at: [540, 940], fill: 'ink', size: 30 }),
            ...noteParts('cmu', T.cMu, { at: [540, 1030], fill: 'dim', size: 26 }),
            // Two pushes and two grips: the harder push grips harder, which
            // is the only thing the inequality says.
            ...diagramBall('cb1', [300, 1200], 56),
            ...diagramBall('cb2', [760, 1200], 56, { base: 'nova',
                                                     baseDark: 'novaDark' }),
            pathPart('cfl', `${M(140, 1270)} ${L(920, 1270)}`,
                     { stroke: 'robotDark', strokeWidth: 10, z: 10, alpha: 0,
                       lineCap: 'round' }),
            ...vectorArrow('cp1', [300, 1086], [300, 1142], { width: 8, head: 20,
                                                              fill: 'normal' }).parts,
            ...vectorArrow('cp2', [760, 1020], [760, 1142], { width: 8, head: 20,
                                                              fill: 'normal' }).parts,
            ...vectorArrow('cg1', [300, 1310], [360, 1310], { width: 8, head: 20,
                                                              fill: 'tangent' }).parts,
            ...vectorArrow('cg2', [760, 1310], [880, 1310], { width: 8, head: 20,
                                                              fill: 'tangent' }).parts,
        ]),
        pushIds: ['cp1', 'cp2'], gripIds: ['cg1', 'cg2'],
    };
}

/** SCENE 9 — what it is like without any. */
function boardIce() {
    const cmp = compareParts('ic', T.iL, T.iR, { y: 680, h: 340, accentL: 'loss',
                                                 accentR: 'restitution' });
    return {
        ...board('ice', [
            headingPart('h', T.iH, { y: BAND.heading, fill: 'loss', size: 40 }),
            ...cmp.parts,
        ]),
        cmp,
    };
}

/** SCENE 10 — the code. */
function boardCode() {
    const code = codePanelParts('cd', CODE, { x: 56, y: 620, w: 968, lh: 48, size: 25,
                                              title: T.codeT });
    return { ...board('code', [...code.parts]), code };
}

/** SCENE 11 — all six, lit. */
function boardSteps() {
    const rows = stepRows('sr', T.steps, { y: 580, h: 96, gap: 11 });
    return {
        ...board('steps', [
            headingPart('h', T.stH, { y: 512, fill: 'restitution', size: 44 }),
            ...rows.parts,
            ...claimParts('sc', 'the whole model', { at: [540, 1260], size: 48,
                                                     fill: 'velocity' }),
        ]),
        rows,
    };
}

/** SCENE 12 — the cliffhanger: the contact point, not the centre. */
function boardNext() {
    const w = wallParts('nw', [160, 1140], [920, 1140], { thickness: 18,
                                                          toward: [540, 960],
                                                          normal: false });
    const contact = ellipsePart('nc', 16, 16, { at: [540, 1140], fill: 'spin',
                                                z: 80, alpha: 0 });
    return {
        ...board('next', [
            ...w.parts,
            ...diagramBall('nb', [540, 1040], 96),
            contact,
            ...vectorArrow('nf', [540, 1140], [380, 1140], { width: 9, head: 24,
                                                             fill: 'spin' }).parts,
            ...noteParts('nn', 'friction acts HERE, not at the centre',
                         { at: [540, 1230], fill: 'spin', size: 30 }),
            textPart('nk', T.nextK, { at: [540, 1310], font: `700 32px ${FONT}`,
                                      fill: 'velocity', z: 90, alpha: 0 }),
            textPart('nt', 'so it spins', { at: [540, 1390], font: `800 52px ${FONT}`,
                                            fill: 'ink', z: 90, alpha: 0,
                                            maxWidth: SAFE.x1 - SAFE.x0 }),
        ]),
        w,
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

export function partFive() {
    const hook = boardHook();
    const def = boardDef();
    const ends = boardEnds();
    const square = boardSquare();
    const mats = boardMats();
    const jitter = boardJitter();
    const fric = boardFric();
    const clamp = boardClamp();
    const ice = boardIce();
    const code = boardCode();
    const steps = boardSteps();
    const nxt = boardNext();
    const card = endCard(T.next, PART);
    const ban = bannerParts(PART);

    const boards = [hook, def, ends, square, mats, jitter, fric, clamp, ice,
                    code, steps, nxt,
                    board('card', card.parts), board('ban', ban)];

    const characters = { bolt: BOLT, nova: NOVA, vector: VECTOR };
    for (const b of boards) {
        characters[b.name] = { role: 'effect', palette: 'game', parts: b.parts };
    }
    const withBan = (cast) => [...cast, castBoard('ban', { alpha: 1 })];
    const grid = gridScenery();
    const scenes = [];

    /** One drop and rebound, as a `move` pair. Height is e², not e. */
    const drop = (who, x, at, e, scale) => {
        const FLOOR = 1180 - 120 * scale;
        const TOP = 700;
        const back = FLOOR - (FLOOR - TOP) * e * e;
        return [
            { target: who, do: 'move', to: [x, FLOOR], at, for: 0.52, ease: 'smooth' },
            ...squash(who, at + 0.5, { scale, amount: 0.22, span: 0.07 }),
            { target: who, do: 'move', to: [x, back], at: at + 0.56, for: 0.46,
              ease: 'smooth' },
        ];
    };

    // --- SCENE 1 — the hook: two drops ---------------------------------------
    scenes.push({
        id: 'hook', palette: 'game',
        background: { color: '#04060f' },
        transitionIn: { kind: 'fade', from: '#000000', duration: 0.5 },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            castBoard('hook', { alpha: 1 }),
            { character: 'bolt', as: 'bolt', at: [320, 700], scale: 0.62 },
            { character: 'nova', as: 'nova', at: [760, 700], scale: 0.62 },
            { character: 'vector', as: 'vector', at: [880, 560], scale: 0.38,
              alpha: 0 },
        ]),
        shots: [
            { id: 'h0', sfx: [['impact', 0.78], ['impact', 0.78], ['impact', 1.62],
                              ['riser', 2.6, 0.3]],
              dialogue: [says('bolt', P[0], 0.28)],
              actions: [
                  rest('bolt'), rest('nova'), rest('vector'),
                  ...reveal('hook', 'fl2', 0.1, { span: 0.3 }),
                  // Both dropped from the same height at the same moment.
                  // He comes back most of the way, she barely leaves the
                  // floor -- the whole hook is that they started identical.
                  ...drop('bolt', 320, 0.28, 0.9, 0.62),
                  ...drop('nova', 760, 0.28, 0.3, 0.62),
                  ...drop('bolt', 320, 1.34, 0.9, 0.62),
                  ...express('nova', 'shock', 1.0, { hold: 1.2 }),
              ] },
            { id: 'h1', sfx: [['pop', 0.9]], dialogue: [says('nova', P[1], 0.24)],
              actions: [
                  ...express('nova', 'doubt', 0.3, { hold: 1.4 }),
                  ...build('hook', hook.tagIds, 0.9, { gap: 0.2, span: 0.35,
                                                       how: pop }),
                  ...reveal('hook', 'hn', 1.6, { span: 0.4 }),
                  ...ballBlinks('bolt', 4.2, 11),
              ] },
            { id: 'h2', sfx: [['pop', 0.1]], dialogue: [says('vector', P[2], 0.24)],
              actions: [
                  { target: 'vector', do: 'show', at: 0.1, for: 0.35 },
                  ...express('vector', 'keen', 0.4, { hold: 1.6 }),
                  ...conceal('hook', 'hn', 0.6, { span: 0.3 }),
                  ...build('hook', ['kicker', 'title', 'titlesub'], 1.0,
                           { gap: 0.2, span: 0.45 }),
                  ...ballBlinks('nova', 5.0, 97),
              ] },
        ],
    });

    // --- SCENE 2 — the definition ---------------------------------------------
    scenes.push({
        id: 'def', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('def', { alpha: 1 })]),
        shots: [
            { id: 'd0', sfx: [['whoosh', 0], ['pop', 0.6]], dialogue: [vo(P[3], 0.2)],
              actions: [
                  ...reveal('def', 'h', 0.15, { span: 0.35 }),
                  ...reveal('def', def.w.wallId, 0.4, { span: 0.3 }),
                  ...showBall('def', 'dba', 0.7),
              ] },
            { id: 'd1', sfx: [['tick', 0.4], ['impact', 1.4]], dialogue: [vo(P[4], 0.2)],
              actions: [
                  ...def.vin.ids.flatMap((id) => reveal('def', id, 0.4, { span: 0.3 })),
                  ...build('def', def.rIn.ids, 0.8, { gap: 0.1, span: 0.3 }),
                  ...countTo('def', def.rIn.value,
                             { from: 0, to: 800, at: 1.0, span: 0.7 }),
                  ...def.vout.ids.flatMap((id) => reveal('def', id, 1.6,
                                                         { span: 0.3 })),
                  ...build('def', def.rOut.ids, 2.0, { gap: 0.1, span: 0.3 }),
                  ...countTo('def', def.rOut.value,
                             { from: 0, to: 560, at: 2.2, span: 0.7 }),
              ] },
            { id: 'd2', sfx: [['pop', 0.3]], dialogue: [vo(P[5], 0.2)],
              actions: [
                  ...build('def', ['df_bg', 'df_t', 'df_n'], 0.3,
                           { gap: 0.14, span: 0.4 }),
              ] },
        ],
    });

    // --- SCENE 3 — the two ends -------------------------------------------------
    scenes.push({
        id: 'ends', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('ends', { alpha: 1 })]),
        shots: [
            { id: 'n0', sfx: [['whoosh', 0], ['pop', 0.5]], dialogue: [vo(P[6], 0.2)],
              actions: [
                  ...reveal('ends', 'h', 0.15, { span: 0.35 }),
                  ...build('ends', ends.a.ids, 0.5, { gap: 0.12, span: 0.4 }),
                  ...reveal('ends', 'n1', 1.6, { span: 0.35 }),
              ] },
            { id: 'n1', sfx: [['pop', 0.3]], dialogue: [vo(P[7], 0.2)],
              actions: [
                  ...build('ends', ends.b.ids, 0.3, { gap: 0.12, span: 0.4 }),
                  ...reveal('ends', 'n0', 1.3, { span: 0.35 }),
              ] },
        ],
    });

    // --- SCENE 4 — the squared one -----------------------------------------------
    scenes.push({
        id: 'square', palette: 'game',
        background: { color: '#120a1e' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            { character: 'bolt', as: 'bolt', at: [930, 740], scale: 0.34 },
            offstage('vector'), castBoard('square', { alpha: 1 }),
        ]),
        shots: [
            { id: 'q0', sfx: [['whoosh', 0]], dialogue: [says('bolt', P[8], 0.3)],
              actions: [
                  rest('bolt'),
                  ...express('bolt', 'think', 0.3, { hold: 1.0 }),
                  ...reveal('square', 'h', 0.15, { span: 0.35 }),
                  ...ballBlinks('bolt', 2.8, 13),
              ] },
            { id: 'q1', sfx: [['pop', 0.4]], dialogue: [vo(P[9], 0.2)],
              actions: [
                  ...build('square', square.b.ids, 0.4, { gap: 0.12, span: 0.4 }),
                  ...reveal('square', 'q100', 1.2, { span: 0.3 }),
              ] },
            { id: 'q2', sfx: [['tick', 0.4], ['pop', 1.2]], dialogue: [vo(P[10], 0.2)],
              actions: [
                  ...build('square', ['qf_bg', 'qf_t'], 0.4, { gap: 0.14, span: 0.4 }),
                  ...reveal('square', 'qn', 1.2, { span: 0.35 }),
              ] },
            { id: 'q3', sfx: [['pop', 0.4]], dialogue: [vo(P[11], 0.2)],
              actions: [
                  ...pop('square', 'q64', 0.4, { span: 0.4 }),
              ] },
            { id: 'q4', sfx: [['riser', 0.1, 0.3]], dialogue: [vo(P[12], 0.2)],
              actions: [...pop('square', 'qno', 0.3, { span: 0.45 })] },
        ],
    });

    // --- SCENE 5 — real materials --------------------------------------------------
    scenes.push({
        id: 'mats', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('mats', { alpha: 1 })]),
        shots: [
            { id: 'm0', sfx: [['whoosh', 0]].concat([0, 1, 2, 3, 4].map(
                  (i) => ['tick', 0.4 + i * 0.44])),
              dialogue: [vo(P[13], 0.2)],
              actions: [
                  ...reveal('mats', 'h', 0.15, { span: 0.35 }),
                  ...mats.bars.flatMap(({ bar, ids }, i) => [
                      ...build('mats', ids, 0.4 + i * 0.44, { gap: 0.04, span: 0.28 }),
                      ...bar.grow('mats', 0.5 + i * 0.44, { span: 0.5 }),
                  ]),
              ] },
            { id: 'm1', sfx: [['pop', 0.3]], dialogue: [vo(P[14], 0.2)],
              actions: [...pop('mats', 'mn2', 0.3, { span: 0.45 })] },
        ],
    });

    // --- SCENE 6 — the buzzing ball --------------------------------------------------
    scenes.push({
        id: 'jitter', palette: 'game',
        background: { color: '#120a1e' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            { character: 'nova', as: 'nova', at: [170, 1380], scale: 0.32 },
            offstage('vector'), castBoard('jitter', { alpha: 1 }),
        ]),
        shots: [
            { id: 'j0', sfx: [['whoosh', 0]], dialogue: [says('nova', P[15], 0.3)],
              actions: [
                  rest('nova'),
                  ...express('nova', 'think', 0.3, { hold: 1.0 }),
                  ...reveal('jitter', 'h', 0.15, { span: 0.35 }),
                  ...ballBlinks('nova', 2.8, 31),
              ] },
            { id: 'j1', sfx: [['pop', 0.3]], dialogue: [vo(P[16], 0.2)],
              actions: [
                  ...reveal('jitter', 'jf', 0.3, { span: 0.3 }),
                  ...showBall('jitter', 'jb', 0.5),
                  // The buzz itself: four small hops, which is what the bug
                  // looks like on screen and what no caption can convey.
                  ...[0, 1, 2, 3].flatMap((k) => [
                      { target: 'jitter', part: 'jb', do: 'shift', by: [0, -14],
                        at: 1.0 + k * 0.26, for: 0.12, ease: 'smooth' },
                      { target: 'jitter', part: 'jb', do: 'shift', by: [0, 14],
                        at: 1.12 + k * 0.26, for: 0.12, ease: 'smooth' },
                  ]),
              ] },
            { id: 'j2', sfx: [['pop', 0.3]], dialogue: [vo(P[17], 0.2)],
              actions: [
                  ...build('jitter', jitter.cmp.left, 0.3, { gap: 0.12, span: 0.32 }),
              ] },
            { id: 'j3', dialogue: [vo(P[18], 0.2)],
              actions: [...reveal('jitter', 'jn', 0.3, { span: 0.4 })] },
            { id: 'j4', sfx: [['pop', 0.3]], dialogue: [vo(P[19], 0.2)],
              actions: [
                  ...build('jitter', jitter.cmp.right, 0.3, { gap: 0.12, span: 0.32 }),
              ] },
            { id: 'j5', dialogue: [vo(P[20], 0.2)], actions: [] },
        ],
    });

    // --- SCENE 7 — friction -----------------------------------------------------------
    scenes.push({
        id: 'fric', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('fric', { alpha: 1 })]),
        shots: [
            { id: 'f0', sfx: [['whoosh', 0], ['pop', 0.6]], dialogue: [vo(P[21], 0.2)],
              actions: [
                  ...reveal('fric', 'h', 0.15, { span: 0.35 }),
                  ...reveal('fric', fric.w.wallId, 0.4, { span: 0.3 }),
                  ...showBall('fric', 'fb', 0.6),
                  ...build('fric', fric.w.normalIds, 1.0, { gap: 0.15, span: 0.35 }),
              ] },
            { id: 'f1', sfx: [['tick', 0.4]], dialogue: [vo(P[22], 0.2)],
              actions: [
                  ...fric.slide.ids.flatMap((id) => reveal('fric', id, 0.4,
                                                           { span: 0.3 })),
                  ...reveal('fric', 'fsl', 0.7, { span: 0.3 }),
                  ...fric.grip.ids.flatMap((id) => reveal('fric', id, 1.3,
                                                          { span: 0.3 })),
                  ...reveal('fric', 'fgl', 1.6, { span: 0.3 }),
              ] },
            { id: 'f2', sfx: [['pop', 0.3]], dialogue: [vo(P[23], 0.2)],
              actions: [
                  ...build('fric', ['ff_bg', 'ff_t', 'ff_n'], 0.3,
                           { gap: 0.14, span: 0.4 }),
              ] },
        ],
    });

    // --- SCENE 8 — the clamp -----------------------------------------------------------
    scenes.push({
        id: 'clamp', palette: 'game',
        background: { color: '#0a1230' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('clamp', { alpha: 1 })]),
        shots: [
            { id: 'c0', sfx: [['whoosh', 0], ['pop', 0.4]], dialogue: [vo(P[24], 0.2)],
              actions: [
                  ...reveal('clamp', 'h', 0.15, { span: 0.35 }),
                  ...build('clamp', ['cf_bg', 'cf_t', 'cf_n'], 0.4,
                           { gap: 0.14, span: 0.4 }),
              ] },
            { id: 'c1', sfx: [['tick', 0.4], ['tick', 1.1]], dialogue: [vo(P[25], 0.2)],
              actions: [
                  ...reveal('clamp', 'cfl', 0.3, { span: 0.3 }),
                  ...showBall('clamp', 'cb1', 0.4),
                  ...showBall('clamp', 'cb2', 0.55),
                  ...build('clamp', ['cp1', 'cg1'], 0.9, { gap: 0.1, span: 0.3 }),
                  ...build('clamp', ['cp2', 'cg2'], 1.4, { gap: 0.1, span: 0.3 }),
              ] },
            { id: 'c2', sfx: [['pop', 0.3]], dialogue: [vo(P[26], 0.2)],
              actions: [
                  ...pop('clamp', 'cn2', 0.3, { span: 0.4 }),
                  ...reveal('clamp', 'cmu', 1.1, { span: 0.4, to: 0.85 }),
              ] },
        ],
    });

    // --- SCENE 9 — ice -------------------------------------------------------------------
    scenes.push({
        id: 'ice', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            { character: 'bolt', as: 'bolt', at: [170, 1200], scale: 0.36 },
            offstage('vector'), castBoard('ice', { alpha: 1 }),
        ]),
        shots: [
            { id: 'i0', sfx: [['whoosh', 0]], dialogue: [says('bolt', P[27], 0.3)],
              actions: [
                  rest('bolt'),
                  ...express('bolt', 'doubt', 0.3, { hold: 1.0 }),
                  ...reveal('ice', 'h', 0.15, { span: 0.35 }),
                  ...ballBlinks('bolt', 2.6, 43),
              ] },
            { id: 'i1', sfx: [['pop', 0.3], ['pop', 1.5]], dialogue: [vo(P[28], 0.2)],
              actions: [
                  ...build('ice', ice.cmp.left, 0.3, { gap: 0.12, span: 0.32 }),
                  ...build('ice', ice.cmp.right, 1.5, { gap: 0.12, span: 0.32 }),
              ] },
        ],
    });

    // --- SCENE 10 — the code --------------------------------------------------------------
    scenes.push({
        id: 'code', palette: 'game',
        background: { color: '#070c1e' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('code', { alpha: 1 })]),
        shots: [
            { id: 'k0', sfx: [['whoosh', 0]].concat([0, 1, 2, 3, 4, 5].map(
                  (i) => ['tick', 0.5 + i * 0.42])),
              dialogue: [vo(P[29], 0.2)],
              actions: [
                  ...reveal('code', 'cd_bg', 0.15, { span: 0.4 }),
                  ...reveal('code', 'cd_t', 0.4, { span: 0.3 }),
                  ...[0, 1, 2, 3, 4, 5].flatMap((i) =>
                      build('code', code.code.lineIds(i), 0.5 + i * 0.42,
                            { gap: 0.03, span: 0.22 })),
              ] },
        ],
    });

    // --- SCENE 11 — all six -----------------------------------------------------------------
    scenes.push({
        id: 'steps', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('steps', { alpha: 1 })]),
        shots: [
            { id: 'p0', sfx: [['whoosh', 0]].concat([0, 1, 2, 3, 4].map(
                  (i) => ['tick', 0.35 + i * 0.22])).concat([['riser', 1.6, 0.34]]),
              dialogue: [vo(P[30], 0.2)],
              actions: [
                  ...reveal('steps', 'h', 0.15, { span: 0.35 }),
                  ...[0, 1, 2, 3, 4].flatMap((i) =>
                      build('steps', steps.rows.rowIds(i), 0.35 + i * 0.22,
                            { gap: 0.03, span: 0.28 })),
                  ...build('steps', steps.rows.rowIds(5), 1.6,
                           { gap: 0.05, span: 0.34, how: pop }),
                  ...pop('steps', 'sc_t', 2.3, { span: 0.45 }),
              ] },
        ],
    });

    // --- SCENE 12 — the cliffhanger -----------------------------------------------------------
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
            { id: 'x0', sfx: [['whoosh', 0], ['pop', 0.8]],
              dialogue: [says('nova', P[31], 0.3)],
              actions: [
                  rest('nova'), rest('vector'),
                  ...express('nova', 'sure', 0.3, { hold: 1.2 }),
                  ...reveal('next', nxt.w.wallId, 0.2, { span: 0.3 }),
                  ...showBall('next', 'nb', 0.4),
                  ...pop('next', 'nc', 0.9, { span: 0.4 }),
                  ...build('next', ['nf'], 1.3, { gap: 0, span: 0.3 }),
                  ...reveal('next', 'nn', 1.7, { span: 0.4 }),
                  ...ballBlinks('nova', 3.6, 23),
              ] },
            { id: 'x1', sfx: [['riser', 0.2, 0.36]], dialogue: [vo(P[32], 0.2)],
              actions: [
                  ...express('vector', 'keen', 0.3, { hold: 1.4 }),
                  ...ballBlinks('nova', 3.4, 47),
              ] },
            { id: 'x2', dialogue: [vo(P[33], 0.2)],
              actions: [
                  ...reveal('next', 'nk', 0.3, { span: 0.3 }),
                  ...pop('next', 'nt', 0.8, { span: 0.45 }),
              ] },
        ],
    });

    // --- SCENE 13 — the end card ----------------------------------------------------------------
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
