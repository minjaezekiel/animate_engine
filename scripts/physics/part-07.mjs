/**
 * Part 7 — "Build the whole thing".
 *
 * The last part. Everything the series built, assembled into a loop that
 * runs: the fixed timestep, the body, the order the steps have to happen
 * in, walls as infinite mass, sleeping, and then the four games the same
 * code gives you. It closes the series rather than opening a door.
 *
 * ## Why this part is engineering rather than physics
 *
 * Parts two to six each had a claim that could be wrong. This one mostly
 * has claims that could be *badly built*, which is a different kind of
 * care:
 *
 * - **A fixed timestep is not an optimisation, it is correctness.** Step by
 *   whatever the frame took and the same inputs give different results on
 *   different machines, and a long frame can move a body far enough to miss
 *   everything (part two's tunnelling, from the other direction). The
 *   standard fix is an accumulator: add real elapsed time, run whole fixed
 *   steps while there is enough banked.
 * - **The order is load-bearing.** Integrate, detect, separate, then
 *   respond. Separating after the impulse leaves bodies overlapping for a
 *   frame; responding before separating computes the impulse at the wrong
 *   place. Part two said "separate first" and this is where that is paid
 *   off.
 * - **Walls are bodies with 1/m = 0**, which part four derived. Saying it
 *   again here is deliberate: it is the single decision that stops a
 *   physics engine from needing a special case for every static thing.
 * - **Sleeping is both an optimisation and a bug fix.** A body below a
 *   speed threshold for long enough stops being integrated, which saves
 *   time and also stops the last of the resting jitter part five was about.
 *
 * ## What it does not claim
 *
 * No rotated polygons, no broad-phase structure beyond naming one, no
 * constraints or joints, no continuous collision detection. All four are
 * named at the end as the real next steps, with the names of two engines
 * that have already done them, because the honest end of a seven-part
 * series on circles is "here is where circles stop being enough".
 */
import {
    BAND, BOLT, FONT, GAME_PALETTE, L, M, NOVA, SAFE, VECTOR, Z, ballBlinks,
    bannerParts, board, build, castBoard, claimParts, codePanelParts,
    compareParts, conceal, countTo, derivationParts, diagramBall, diagramBallIds,
    ellipsePart, endCard, express, fitShots, flash, flashPart, formulaParts,
    gameGridParts, gridScenery, headingPart, hookTitle, impactParts, liftSfx,
    loopParts, noteParts, pathPart, pop, readoutParts, rectPart, rest, reveal,
    roll, roundRect, screenParts, SFX_ASSETS, shiftBy, showBall, spinMark, squash,
    stepRows, textPart, titleAt, vectorArrow, wallParts,
} from './common.mjs';
import { META, PARTS_IN_SERIES, voicesFor } from '../lib/physics.mjs';

const PART = 7;

// ---------------------------------------------------------------------------
// The narration
// ---------------------------------------------------------------------------

const P = [
    /* 0  VECTOR */ 'This is a pool game. A few hundred lines, and nothing you have '
        + 'not seen.',
    /* 1  BOLT   */ 'All of it? The normal, the impulse, the bounce, the spin?',
    /* 2  VECTOR */ 'All of it. Today we put the pieces in order and press run.',
    /* 3  VECTOR */ 'A physics engine is one loop. Five things, over and over.',
    /* 4  VECTOR */ 'Read the input. Move everything. Find the hits. Fix them. Draw.',
    /* 5  VECTOR */ 'Sixty times a second, forever. That is the entire architecture.',
    /* 6  VECTOR */ 'First rule, and it is not an optimisation: step by a fixed '
        + 'amount.',
    /* 7  NOVA   */ 'Why not just use however long the frame took?',
    /* 8  VECTOR */ 'Because then a slow frame moves you four hundred pixels at once.',
    /* 9  VECTOR */ 'Same game, different computer, different answer. Bank the time '
        + 'instead.',
    /*10  VECTOR */ 'Add up the real seconds, and run whole fixed steps while you can '
        + 'afford them.',
    /*11  VECTOR */ 'Now the body. Seven numbers, and you have met every one.',
    /*12  VECTOR */ 'Where it is, how fast, how big, how heavy, and how it is turning.',
    /*13  VECTOR */ 'Moving it is one line. Position plus velocity times the step.',
    /*14  VECTOR */ 'Then the order, and the order is not negotiable.',
    /*15  VECTOR */ 'Move. Detect. Separate. Only then change the velocities.',
    /*16  BOLT   */ 'What breaks if I swap the last two?',
    /*17  VECTOR */ 'You compute the bounce from the wrong place, and they stay '
        + 'overlapped.',
    /*18  VECTOR */ 'The walls need no new code at all. Give them infinite mass.',
    /*19  VECTOR */ 'One over infinity is zero, and the same line handles them.',
    /*20  VECTOR */ 'Last trick: let things sleep. Below a crawl for long enough, stop '
        + 'simulating.',
    /*21  VECTOR */ 'Cheaper, and it kills the last of the twitching from part five.',
    /*22  VECTOR */ 'That is the whole engine. Now change four lines.',
    /*23  VECTOR */ 'Flat paddle, bricks above, one ball. That is brick breaker.',
    /*24  VECTOR */ 'High restitution bumpers and two flippers. That is pinball.',
    /*25  VECTOR */ 'Wrap the edges, split the circles on a hit. Asteroids.',
    /*26  NOVA   */ 'Same physics. Completely different games.',
    /*27  VECTOR */ 'And where it stops being enough: shapes that are not circles.',
    /*28  VECTOR */ 'Polygons, a grid so you are not testing every pair, joints, '
        + 'ropes.',
    /*29  VECTOR */ 'When you want those, read Box2D or pymunk. You can read them now.',
    /*30  VECTOR */ 'Seven parts. You started not knowing why a ball bounces.',
    /*31  BOLT   */ 'And I still stop dead when I hit her straight on.',
    /*32  VECTOR */ 'Equal mass. Head on. Nothing lost. And now you know why.',
    /*33  NOVA   */ 'Go and build something that moves.',
    /*34  VECTOR */ 'All seven parts are up. Thank you for watching.',
];

const T = {
    kicker: `GAME PHYSICS  ·  PART ${PART}`,
    title: 'Build the whole thing',
    sub: 'the loop · the order · four games',

    hookN: 'everything in the last six parts, running',

    lH: 'A PHYSICS ENGINE IS ONE LOOP',
    loop: [
        ['INPUT', 'what did they press', '#36e3ff'],
        ['INTEGRATE', 'move everything', '#36e3ff'],
        ['DETECT', 'what is overlapping', '#ffd23d'],
        ['RESOLVE', 'separate, then push', '#ff4d8d'],
        ['DRAW', 'show the new frame', '#3ddc84'],
    ],
    lN: 'sixty times a second, forever. that is the whole architecture.',

    dH: 'STEP BY A FIXED AMOUNT',
    dL: ['VARIABLE STEP', 'a slow frame moves you\n400 pixels at once.\ndifferent every machine.'],
    dR: ['FIXED STEP', 'bank the real seconds.\nrun whole steps while\nyou can afford them.'],
    dN: 'this is not an optimisation. it is the difference between a simulation and a guess.',

    bH: 'THE BODY  —  SEVEN NUMBERS',
    bN: 'and you have met every one of them',

    oH: 'THE ORDER IS NOT NEGOTIABLE',
    order: [
        [1, 'MOVE', 'position += velocity × dt', '#36e3ff'],
        [2, 'DETECT', 'who is overlapping whom', '#ffd23d'],
        [3, 'SEPARATE', 'push them apart first', '#ff4d8d'],
        [4, 'RESPOND', 'and only then, the impulse', '#8e7bff'],
    ],
    oN: 'swap the last two and you compute the bounce from the wrong place',

    wH: 'WALLS NEED NO NEW CODE',
    wF: 'm  =  ∞      →      1 / m  =  0',
    wN: 'the same impulse line handles them. no special case, anywhere.',

    sH: 'AND LET THINGS SLEEP',
    sN: 'below a crawl for long enough, stop simulating it until something touches it',
    sN2: 'cheaper — and it kills the last of the twitching from part five',

    gH: 'CHANGE FOUR LINES',
    games: [
        ['Pool', 'circles, friction, spin', '#36e3ff'],
        ['Brick Breaker', 'a paddle, bricks, one ball', '#ffd23d'],
        ['Pinball', 'bouncy bumpers, flippers', '#ff4d8d'],
        ['Asteroids', 'wrapping edges, splitting', '#3ddc84'],
    ],
    gN: 'same physics. completely different games.',

    eH: 'WHERE CIRCLES STOP BEING ENOUGH',
    beyond: [
        [1, 'POLYGONS', 'shapes that are not round', '#8e7bff'],
        [2, 'A BROAD PHASE', 'a grid, so you skip most pairs', '#ffd23d'],
        [3, 'JOINTS AND ROPES', 'things held to other things', '#36e3ff'],
        [4, 'READ AN ENGINE', 'Box2D  ·  pymunk  —  you can now', '#3ddc84'],
    ],

    fH: 'SEVEN PARTS',
    parts: 'velocity  ·  detection  ·  normals  ·  impulse  ·  bounce  ·  spin  ·  '
        + 'the build',
    fN: 'you started not knowing why a ball bounces',

    nextK: `THAT IS ALL ${PARTS_IN_SERIES} PARTS`,
    next: 'Go and build\nsomething that moves',
};

const CODE_LOOP = [
    [0, [['codeFn', 'acc'], ['ink', ' += clock.tick() / '], ['codeNum', '1000']]],
    [0, [['codeKey', 'while'], ['ink', ' acc >= DT:']]],
    [1, [['ink', 'integrate(bodies, DT)']]],
    [1, [['ink', 'pairs = detect(bodies)']]],
    [1, [['ink', 'separate(pairs);  respond(pairs)']]],
    [1, [['codeFn', 'acc'], ['ink', ' -= DT']]],
    [0, [['ink', 'draw(bodies)']]],
];

const CODE_BODY = [
    [0, [['codeKey', 'class'], ['codeFn', ' Body'], ['ink', ':']]],
    [1, [['codeFn', 'x, y'], ['ink', '      = '], ['codeNum', '0.0'], ['ink', ', '],
         ['codeNum', '0.0'], ['codeCmt', '      # where']]],
    [1, [['codeFn', 'vx, vy'], ['ink', '    = '], ['codeNum', '0.0'], ['ink', ', '],
         ['codeNum', '0.0'], ['codeCmt', '      # how fast']]],
    [1, [['codeFn', 'r'], ['ink', '         = '], ['codeNum', '12.0'],
         ['codeCmt', '           # how big']]],
    [1, [['codeFn', 'm'], ['ink', '         = '], ['codeNum', '1.0'],
         ['codeCmt', '            # how heavy']]],
    [1, [['codeFn', 'w'], ['ink', '         = '], ['codeNum', '0.0'],
         ['codeCmt', '            # how it turns']]],
];

// ---------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------

/** SCENE 1 — the hook: the game, running. */
function boardHook() {
    const sc = screenParts('gs', { x: 70, y: 700, w: 940, h: 620,
                                   title: 'pool.py  —  running' });
    const { inner } = sc;
    // A rack, a cue ball and a cue: a pool table seen from above, inside the
    // screen the series has been building toward.
    const felt = rectPart('gf', inner.w - 24, inner.h - 24,
                          { at: [sc.cx, sc.cy], fill: 'felt', z: 14, alpha: 0 });
    const rack = [];
    const rackIds = [];
    let k = 0;
    for (let row = 0; row < 3; row++) {
        for (let i = 0; i <= row; i++) {
            const bx = sc.cx + 130 + row * 46;
            const by = sc.cy - row * 24 + i * 48;
            rack.push(...diagramBall(`gb${k}`, [bx, by], 22,
                                     { base: row % 2 ? 'nova' : 'momentum',
                                       baseDark: row % 2 ? 'novaDark' : 'spin',
                                       z: 20 }));
            rackIds.push(`gb${k}`);
            k++;
        }
    }
    return {
        ...board('hook', [
            ...sc.parts, felt, ...rack,
            ...diagramBall('gcue', [sc.cx - 250, sc.cy], 24, { z: 22 }),
            pathPart('gcs', `${M(sc.cx - 430, sc.cy)} ${L(sc.cx - 286, sc.cy)}`,
                     { stroke: 'rail', strokeWidth: 12, z: 24, alpha: 0,
                       lineCap: 'round' }),
            ...noteParts('hn', T.hookN, { at: [540, 1392], fill: 'velocity',
                                          size: 30 }),
            ...hookTitle(T.kicker, T.title, T.sub),
        ]),
        sc, rackIds, cueId: 'gcue', stickId: 'gcs', feltId: 'gf',
        allBalls: rackIds.flatMap((id) => diagramBallIds(id)),
    };
}

/** SCENE 2 — the loop. */
function boardLoop() {
    const lp = loopParts('lp', T.loop, { cx: 540, cy: 960, r: 330, bw: 286,
                                         bh: 100 });
    return {
        ...board('loop', [
            headingPart('h', T.lH, { y: BAND.heading, fill: 'ink', size: 42 }),
            ...lp.parts,
            ...noteParts('ln', T.lN, { at: [540, 1392], fill: 'velocity', size: 29 }),
        ]),
        lp,
    };
}

/** SCENE 3 — the fixed step, and the code for it. */
function boardStep() {
    const cmp = compareParts('sc', T.dL, T.dR, { y: 620, h: 330, accentL: 'loss',
                                                 accentR: 'restitution' });
    const code = codePanelParts('st', CODE_LOOP, { x: 70, y: 976, w: 940, lh: 42,
                                                   size: 24, title: null });
    return {
        ...board('step', [
            headingPart('h', T.dH, { y: BAND.heading, fill: 'restitution', size: 48 }),
            ...cmp.parts, ...code.parts,
            ...noteParts('sn', T.dN, { at: [540, BAND.floor - 40], fill: 'dim',
                                       size: 25 }),
        ]),
        cmp, code,
    };
}

/** SCENE 4 — the body. */
function boardBody() {
    const code = codePanelParts('bd', CODE_BODY, { x: 56, y: 660, w: 968, lh: 50,
                                                   size: 26, title: null });
    return {
        ...board('body', [
            headingPart('h', T.bH, { y: BAND.heading, fill: 'velocity', size: 44 }),
            ...code.parts,
            ...formulaParts('bf', 'x  +=  vx  ·  dt', { at: [540, 1180],
                                                        fill: 'velocity', size: 46 }),
            ...noteParts('bn', T.bN, { at: [540, 1300], fill: 'dim', size: 28 }),
        ]),
        code,
    };
}

/** SCENE 5 — the order. */
function boardOrder() {
    const rows = stepRows('or', T.order, { y: 620, h: 120, gap: 16 });
    return {
        ...board('order', [
            headingPart('h', T.oH, { y: BAND.heading, fill: 'normal', size: 42 }),
            ...rows.parts,
            ...noteParts('on', T.oN, { at: [540, 1250], fill: 'loss', size: 29 }),
        ]),
        rows,
    };
}

/** SCENE 6 — walls, and sleeping. */
function boardWalls() {
    return {
        ...board('walls', [
            headingPart('h', T.wH, { y: BAND.heading, fill: 'restitution', size: 46 }),
            ...formulaParts('wf', T.wF, { at: [540, 700], fill: 'restitution',
                                          size: 48, note: T.wN }),
            headingPart('h2', T.sH, { y: 1000, fill: 'spin', size: 46 }),
            ...noteParts('sn1', T.sN, { at: [540, 1110], fill: 'ink', size: 29 }),
            ...noteParts('sn2', T.sN2, { at: [540, 1200], fill: 'dim', size: 27 }),
            // A sleeping ball, greyed, with the Zs a resting body earns.
            ...diagramBall('wb', [540, 1320], 56, { base: 'robot',
                                                    baseDark: 'robotDark' }),
            textPart('wz', 'z z z', { at: [660, 1270], font: `800 32px ${FONT}`,
                                      fill: 'dim', z: 90, alpha: 0 }),
        ]),
    };
}

/** SCENE 7 — four games out of the same code. */
function boardGames() {
    const grid = gameGridParts('gg', T.games, { y: 600, cardH: 200, gap: 20 });
    return {
        ...board('games', [
            headingPart('h', T.gH, { y: BAND.heading, fill: 'ink', size: 50 }),
            ...grid.parts,
            ...claimParts('gn', T.gN, { at: [540, 1160], size: 42,
                                        fill: 'velocity' }),
        ]),
        grid,
    };
}

/** SCENE 8 — where circles stop being enough. */
function boardBeyond() {
    const rows = stepRows('br', T.beyond, { y: 620, h: 116, gap: 14 });
    return {
        ...board('beyond', [
            headingPart('h', T.eH, { y: BAND.heading, fill: 'tangent', size: 42 }),
            ...rows.parts,
        ]),
        rows,
    };
}

/** SCENE 9 — the series, closed. */
function boardWrap() {
    return {
        ...board('wrap', [
            ...claimParts('fc', T.fH, { at: [540, 700], size: 88, fill: 'velocity' }),
            ...noteParts('fp', T.parts, { at: [540, 840], fill: 'ink', size: 30 }),
            ...noteParts('fn', T.fN, { at: [540, 940], fill: 'dim', size: 28 }),
            // The very first picture in the series, as the very last one: two
            // balls, equal mass, dead straight.
            ...diagramBall('wa', [360, 1120], 92),
            ...diagramBall('wb2', [720, 1120], 92, { base: 'nova',
                                                     baseDark: 'novaDark' }),
            ...vectorArrow('wv', [470, 1120], [600, 1120], { width: 10,
                                                             head: 26 }).parts,
            ...noteParts('we', 'equal mass  ·  head on  ·  nothing lost',
                         { at: [540, 1290], fill: 'momentum', size: 30 }),
            ...claimParts('wk', 'and now you know why', { at: [540, 1380], size: 40,
                                                          fill: 'ink' }),
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

export function partSeven() {
    const hook = boardHook();
    const loop = boardLoop();
    const step = boardStep();
    const body = boardBody();
    const order = boardOrder();
    const walls = boardWalls();
    const games = boardGames();
    const beyond = boardBeyond();
    const wrap = boardWrap();
    const card = endCard(T.next, PART);
    const ban = bannerParts(PART);

    const boards = [hook, loop, step, body, order, walls, games, beyond, wrap,
                    board('card', card.parts), board('ban', ban)];

    const characters = { bolt: BOLT, nova: NOVA, vector: VECTOR };
    for (const b of boards) {
        characters[b.name] = { role: 'effect', palette: 'game', parts: b.parts };
    }
    const withBan = (cast) => [...cast, castBoard('ban', { alpha: 1 })];
    const grid = gridScenery();
    const scenes = [];

    // --- SCENE 1 — the hook: the game ---------------------------------------
    scenes.push({
        id: 'hook', palette: 'game',
        background: { color: '#04060f' },
        transitionIn: { kind: 'fade', from: '#000000', duration: 0.5 },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            castBoard('hook', { alpha: 1 }),
            // Off to the side: at centre-540 he sat exactly on the title's
            // subtitle line, which arrives in this same scene.
            { character: 'vector', as: 'vector', at: [930, 636], scale: 0.34 },
            { character: 'bolt', as: 'bolt', at: [170, 1540], scale: 0.3, alpha: 0 },
        ]),
        shots: [
            { id: 'h0', sfx: [['whoosh', 0.1], ['click', 1.9], ['impact', 2.2],
                              ['riser', 3.0, 0.3]],
              dialogue: [says('vector', P[0], 0.28)],
              actions: [
                  rest('vector'), rest('bolt'),
                  ...express('vector', 'keen', 0.3, { hold: 1.4 }),
                  ...build('hook', hook.sc.ids, 0.15, { gap: 0.1, span: 0.35 }),
                  ...reveal('hook', hook.feltId, 0.5, { span: 0.3 }),
                  ...build('hook', hook.allBalls, 0.9, { gap: 0.03, span: 0.2 }),
                  ...showBall('hook', hook.cueId, 1.2),
                  ...reveal('hook', hook.stickId, 1.4, { span: 0.25 }),
                  // The break: the cue jabs, the cue ball runs, the rack
                  // scatters a little. Enough to say "this is running".
                  { target: 'hook', part: hook.stickId, do: 'shift', by: [90, 0],
                    at: 1.78, for: 0.12, ease: 'smooth' },
                  ...shiftBy('hook', diagramBallIds(hook.cueId), [250, 0], 1.9,
                             { span: 0.3 }),
                  ...conceal('hook', hook.stickId, 2.0, { span: 0.2 }),
                  ...hook.rackIds.flatMap((id, i) => shiftBy(
                      'hook', diagramBallIds(id),
                      [30 + (i % 3) * 16, (i % 2 ? 1 : -1) * (18 + i * 5)],
                      2.2, { span: 0.5 })),
              ] },
            { id: 'h1', sfx: [['pop', 0.2]], dialogue: [says('bolt', P[1], 0.26)],
              actions: [
                  { target: 'bolt', do: 'show', at: 0.1, for: 0.3 },
                  { target: 'bolt', do: 'move', to: [170, 1380], at: 0.1, for: 0.4,
                    ease: 'smooth' },
                  ...express('bolt', 'shock', 0.3, { hold: 1.2 }),
                  ...reveal('hook', 'hn', 0.8, { span: 0.4 }),
                  ...ballBlinks('bolt', 3.8, 11),
              ] },
            { id: 'h2', dialogue: [says('vector', P[2], 0.24)],
              actions: [
                  ...express('vector', 'sure', 0.3, { hold: 1.4 }),
                  ...conceal('hook', 'hn', 0.4, { span: 0.3 }),
                  ...build('hook', ['kicker', 'title', 'titlesub'], 0.9,
                           { gap: 0.2, span: 0.45 }),
                  ...ballBlinks('bolt', 4.4, 29),
              ] },
        ],
    });

    // --- SCENE 2 — the loop ---------------------------------------------------
    scenes.push({
        id: 'loop', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('loop', { alpha: 1 })]),
        shots: [
            { id: 'l0', sfx: [['whoosh', 0]], dialogue: [vo(P[3], 0.2)],
              actions: [...reveal('loop', 'h', 0.15, { span: 0.4 })] },
            { id: 'l1', sfx: [0, 1, 2, 3, 4].map((i) => ['tick', 0.3 + i * 0.5]),
              dialogue: [vo(P[4], 0.2)],
              actions: [
                  ...loop.lp.nodes.flatMap((ids, i) =>
                      build('loop', ids, 0.3 + i * 0.5, { gap: 0.04, span: 0.28 })),
              ] },
            { id: 'l2', sfx: [['pop', 0.3]], dialogue: [vo(P[5], 0.2)],
              actions: [
                  // The arrows last, so the ring closes on the line that
                  // says it never stops.
                  ...build('loop', loop.lp.arrows, 0.3, { gap: 0.14, span: 0.3 }),
                  ...pop('loop', 'ln', 1.4, { span: 0.45 }),
              ] },
        ],
    });

    // --- SCENE 3 — the fixed step ------------------------------------------------
    scenes.push({
        id: 'step', palette: 'game',
        background: { color: '#120a1e' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            { character: 'nova', as: 'nova', at: [930, 540], scale: 0.3 },
            offstage('vector'), castBoard('step', { alpha: 1 }),
        ]),
        shots: [
            { id: 's0', sfx: [['whoosh', 0]], dialogue: [vo(P[6], 0.2)],
              actions: [
                  rest('nova'),
                  ...reveal('step', 'h', 0.15, { span: 0.4 }),
                  ...ballBlinks('nova', 3.0, 31),
              ] },
            { id: 's1', sfx: [['pop', 0.3]], dialogue: [says('nova', P[7], 0.3)],
              actions: [
                  ...express('nova', 'think', 0.3, { hold: 1.0 }),
                  ...ballBlinks('nova', 3.0, 59),
              ] },
            { id: 's2', sfx: [['pop', 0.3]], dialogue: [vo(P[8], 0.2)],
              actions: [...build('step', step.cmp.left, 0.3, { gap: 0.12, span: 0.32 })] },
            { id: 's3', sfx: [['pop', 0.3]], dialogue: [vo(P[9], 0.2)],
              actions: [
                  ...build('step', step.cmp.right, 0.3, { gap: 0.12, span: 0.32 }),
                  ...reveal('step', 'sn', 1.4, { span: 0.4, to: 0.85 }),
              ] },
            { id: 's4', sfx: [0, 1, 2, 3, 4, 5, 6].map((i) => ['tick', 0.3 + i * 0.3]),
              dialogue: [vo(P[10], 0.2)],
              actions: [
                  ...reveal('step', 'st_bg', 0.15, { span: 0.35 }),
                  ...[0, 1, 2, 3, 4, 5, 6].flatMap((i) =>
                      build('step', step.code.lineIds(i), 0.3 + i * 0.3,
                            { gap: 0.03, span: 0.2 })),
              ] },
        ],
    });

    // --- SCENE 4 — the body ----------------------------------------------------------
    scenes.push({
        id: 'body', palette: 'game',
        background: { color: '#070c1e' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('body', { alpha: 1 })]),
        shots: [
            { id: 'b0', sfx: [['whoosh', 0]].concat([0, 1, 2, 3, 4, 5].map(
                  (i) => ['tick', 0.4 + i * 0.36])),
              dialogue: [vo(P[11], 0.2)],
              actions: [
                  ...reveal('body', 'h', 0.15, { span: 0.35 }),
                  ...reveal('body', 'bd_bg', 0.25, { span: 0.35 }),
                  ...[0, 1, 2, 3, 4, 5].flatMap((i) =>
                      build('body', body.code.lineIds(i), 0.4 + i * 0.36,
                            { gap: 0.03, span: 0.2 })),
              ] },
            { id: 'b1', dialogue: [vo(P[12], 0.2)],
              actions: [...reveal('body', 'bn', 0.3, { span: 0.4 })] },
            { id: 'b2', sfx: [['pop', 0.3]], dialogue: [vo(P[13], 0.2)],
              actions: [...build('body', ['bf_bg', 'bf_t'], 0.3,
                                 { gap: 0.14, span: 0.4 })] },
        ],
    });

    // --- SCENE 5 — the order -----------------------------------------------------------
    scenes.push({
        id: 'order', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            { character: 'bolt', as: 'bolt', at: [160, 1380], scale: 0.3, alpha: 0 },
            offstage('vector'), castBoard('order', { alpha: 1 }),
        ]),
        shots: [
            { id: 'o0', sfx: [['whoosh', 0]], dialogue: [vo(P[14], 0.2)],
              actions: [
                  rest('bolt'),
                  ...reveal('order', 'h', 0.15, { span: 0.4 }),
              ] },
            { id: 'o1', sfx: [0, 1, 2, 3].map((i) => ['tick', 0.3 + i * 0.55]),
              dialogue: [vo(P[15], 0.2)],
              actions: [
                  ...[0, 1, 2, 3].flatMap((i) =>
                      build('order', order.rows.rowIds(i), 0.3 + i * 0.55,
                            { gap: 0.04, span: 0.3 })),
              ] },
            { id: 'o2', sfx: [['pop', 0.3]], dialogue: [says('bolt', P[16], 0.3)],
              actions: [
                  { target: 'bolt', do: 'show', at: 0.1, for: 0.3 },
                  ...express('bolt', 'doubt', 0.3, { hold: 1.0 }),
                  ...ballBlinks('bolt', 2.8, 43),
              ] },
            { id: 'o3', sfx: [['pop', 0.3]], dialogue: [vo(P[17], 0.2)],
              actions: [
                  ...pop('order', 'on', 0.3, { span: 0.45 }),
                  { target: 'bolt', do: 'hide', at: 1.6, for: 0.3 },
              ] },
        ],
    });

    // --- SCENE 6 — walls and sleeping ---------------------------------------------------
    scenes.push({
        id: 'walls', palette: 'game',
        background: { color: '#081029' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('walls', { alpha: 1 })]),
        shots: [
            { id: 'w0', sfx: [['whoosh', 0], ['pop', 0.4]], dialogue: [vo(P[18], 0.2)],
              actions: [
                  ...reveal('walls', 'h', 0.15, { span: 0.35 }),
                  ...build('walls', ['wf_bg', 'wf_t'], 0.4, { gap: 0.14, span: 0.4 }),
              ] },
            { id: 'w1', sfx: [['pop', 0.3]], dialogue: [vo(P[19], 0.2)],
              actions: [...pop('walls', 'wf_n', 0.3, { span: 0.4 })] },
            { id: 'w2', sfx: [['pop', 0.4]], dialogue: [vo(P[20], 0.2)],
              actions: [
                  ...reveal('walls', 'h2', 0.3, { span: 0.35 }),
                  ...reveal('walls', 'sn1', 0.9, { span: 0.4 }),
                  ...showBall('walls', 'wb', 1.4),
                  ...pop('walls', 'wz', 1.8, { span: 0.4 }),
              ] },
            { id: 'w3', sfx: [['pop', 0.3]], dialogue: [vo(P[21], 0.2)],
              actions: [...reveal('walls', 'sn2', 0.3, { span: 0.4 })] },
        ],
    });

    // --- SCENE 7 — four games ---------------------------------------------------------------
    scenes.push({
        id: 'games', palette: 'game',
        background: { color: GAME_PALETTE.bg },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            { character: 'nova', as: 'nova', at: [170, 1340], scale: 0.32 },
            offstage('vector'), castBoard('games', { alpha: 1 }),
        ]),
        shots: [
            { id: 'g0', sfx: [['whoosh', 0], ['pop', 0.4], ['pop', 0.9]],
              dialogue: [vo(P[22], 0.2)],
              actions: [
                  rest('nova'),
                  ...reveal('games', 'h', 0.15, { span: 0.35 }),
                  ...build('games', games.grid.cards[0], 0.5, { gap: 0.05, span: 0.3 }),
              ] },
            { id: 'g1', sfx: [['tick', 0.3]], dialogue: [vo(P[23], 0.2)],
              actions: [...build('games', games.grid.cards[1], 0.3,
                                 { gap: 0.05, span: 0.3 })] },
            { id: 'g2', sfx: [['tick', 0.3]], dialogue: [vo(P[24], 0.2)],
              actions: [...build('games', games.grid.cards[2], 0.3,
                                 { gap: 0.05, span: 0.3 })] },
            { id: 'g3', sfx: [['tick', 0.3]], dialogue: [vo(P[25], 0.2)],
              actions: [...build('games', games.grid.cards[3], 0.3,
                                 { gap: 0.05, span: 0.3 })] },
            { id: 'g4', sfx: [['riser', 0.1, 0.34]], dialogue: [says('nova', P[26], 0.3)],
              actions: [
                  ...express('nova', 'keen', 0.3, { hold: 1.2 }),
                  ...pop('games', 'gn_t', 0.4, { span: 0.45 }),
                  ...ballBlinks('nova', 3.2, 31),
              ] },
        ],
    });

    // --- SCENE 8 — beyond circles --------------------------------------------------------------
    scenes.push({
        id: 'beyond', palette: 'game',
        background: { color: '#0a1230' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([offstage('vector'), castBoard('beyond', { alpha: 1 })]),
        shots: [
            { id: 'y0', sfx: [['whoosh', 0], ['tick', 0.4]], dialogue: [vo(P[27], 0.2)],
              actions: [
                  ...reveal('beyond', 'h', 0.15, { span: 0.35 }),
                  ...build('beyond', beyond.rows.rowIds(0), 0.4,
                           { gap: 0.04, span: 0.3 }),
              ] },
            { id: 'y1', sfx: [['tick', 0.3], ['tick', 1.2]], dialogue: [vo(P[28], 0.2)],
              actions: [
                  ...build('beyond', beyond.rows.rowIds(1), 0.3,
                           { gap: 0.04, span: 0.3 }),
                  ...build('beyond', beyond.rows.rowIds(2), 1.2,
                           { gap: 0.04, span: 0.3 }),
              ] },
            { id: 'y2', sfx: [['pop', 0.3]], dialogue: [vo(P[29], 0.2)],
              actions: [
                  ...build('beyond', beyond.rows.rowIds(3), 0.3,
                           { gap: 0.04, span: 0.34, how: pop }),
              ] },
        ],
    });

    // --- SCENE 9 — the series, closed -------------------------------------------------------------
    scenes.push({
        id: 'wrap', palette: 'game',
        background: { color: '#04060f' },
        transitionOut: { kind: 'crossfade', duration: 0.4 },
        scenery: grid,
        cast: withBan([
            { character: 'bolt', as: 'bolt', at: [150, 620], scale: 0.3 },
            { character: 'nova', as: 'nova', at: [930, 620], scale: 0.3 },
            // Vector narrates two lines here but is not on screen. An uncast
            // speaker renders SILENT with only a warning, so he is cast
            // invisible and behind everything.
            offstage('vector'),
            castBoard('wrap', { alpha: 1 }),
        ]),
        shots: [
            { id: 'f0', sfx: [['whoosh', 0], ['riser', 0.3, 0.38]],
              dialogue: [vo(P[30], 0.2)],
              actions: [
                  rest('bolt'), rest('nova'),
                  ...pop('wrap', 'fc_t', 0.3, { span: 0.5 }),
                  ...reveal('wrap', 'fp', 1.1, { span: 0.4 }),
                  ...reveal('wrap', 'fn', 1.7, { span: 0.4 }),
              ] },
            { id: 'f1', sfx: [['pop', 0.6]], dialogue: [says('bolt', P[31], 0.3)],
              actions: [
                  ...express('bolt', 'sure', 0.3, { hold: 1.2 }),
                  ...showBall('wrap', 'wa', 0.5),
                  ...showBall('wrap', 'wb2', 0.65),
                  ...build('wrap', ['wv'], 1.1, { gap: 0, span: 0.3 }),
                  ...ballBlinks('nova', 3.4, 23),
              ] },
            { id: 'f2', sfx: [['pop', 0.3]], dialogue: [vo(P[32], 0.2)],
              actions: [
                  ...reveal('wrap', 'we', 0.3, { span: 0.4 }),
                  ...pop('wrap', 'wk_t', 1.1, { span: 0.45 }),
              ] },
            { id: 'f3', dialogue: [says('nova', P[33], 0.3)],
              actions: [
                  ...express('nova', 'keen', 0.3, { hold: 1.4 }),
                  ...ballBlinks('bolt', 3.0, 47),
              ] },
        ],
    });

    // --- SCENE 10 — the end card ----------------------------------------------------------------
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
