/**
 * Part 4 — Reconnaissance in the field.
 *
 * The walk-cycle beat of the series. Zawadi walks in across a hillside and
 * crosses to an outcrop, and both walks are staged with `walkTo`, which
 * travels a WHOLE number of cycles at the stride the cycle actually carries
 * -- so the planted foot does not slide. The arrival moves to meet the
 * stride, rather than the stride stretching to meet the arrival.
 */
import {
    C, GROUND_Y, L, M, Q, TYPE, Z, arrowPath, build, captionPart, conceal,
    effect, ellipsePart, labelParts, pathPart, poly, pop, ramp, rectPart,
    reveal, scale, textPart, titleParts, walkTo,
} from '../lib/diagram.mjs';
import {
    CHARACTERS, FIGURE_H, GEO_PALETTE, META, SERIES, VOICES, endCard, offstage,
    says, vo,
} from '../lib/series.mjs';
import { walkStride } from '../../src/core/script/generate.js';
import { blinks, board, castBoard, rng } from './common.mjs';

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const TALK_Y = Math.round(GROUND_Y - 274 * 1.5);

/** Field scale: smaller than the talk two-shot, so the landscape has room. */
const FIELD_SCALE = 0.85;
const FIELD_GROUND = 1180;
const FIELD_Y = Math.round(FIELD_GROUND - 274 * FIELD_SCALE);
const STRIDE = walkStride({ height: FIGURE_H * FIELD_SCALE }, { build: 'athletic' });

const P4 = [
    /* 0 */ 'Stage one costs almost nothing, and decides almost everything.',
    /* 1 */ 'It starts at a desk. Existing geological maps, government survey archives, '
          + 'old company reports, university theses, and the licence register — '
          + 'because ground somebody already holds is not ground you can explore.',
    /* 2 */ 'Then you go and look.',
    /* 3 */ 'An outcrop is rock in place, and it is the only honest data there is. '
          + 'Everything else is inference. You record what it is, and you record how '
          + 'it is oriented.',
    /* 4 */ 'Strike is the compass direction of a horizontal line on the surface. Dip '
          + 'is how steeply it leans, and which way.',
    /* 5 */ 'Three numbers. And they are the most valuable numbers a geologist writes '
          + 'all day, because they tell you where the rock goes when it disappears '
          + 'under the soil.',
    /* 6 */ 'Then sampling. And the order matters.',
    /* 7 */ 'Stream sediments first. One sample at the outlet of a catchment represents '
          + 'every rock upstream of it. A handful of silt screens ten square kilometres.',
    /* 8 */ 'Inside the catchment that came back hot, a soil grid. Lines laid across '
          + 'the strike of the rocks, sampled every twenty-five or fifty metres — '
          + 'because an anomaly running along your grid can hide between two lines.',
    /* 9 */ 'And on outcrop, and in trenches, rock chips and channel samples. A '
          + 'continuous cut across the vein, not a hand-picked lump, because picking '
          + 'the best rock is how you lie to yourself.',
    /*10 */ 'A handheld XRF reads some elements on the spot. Excellent for arsenic as a '
          + 'gold pathfinder, and nearly useless for gold itself. Gold goes to a '
          + 'laboratory. Always.',
    /*11 */ 'Why arsenic?',
    /*12 */ 'Because arsenopyrite travelled with the gold. You hunt the company it keeps.',
];

// --- the hillside ----------------------------------------------------------

/** Scenery, not a board: none of it animates. */
function hillside(seed) {
    const r = rng(seed);
    const far = `${M(0, 900)} ${Q(260, 700, 520, 860)} ${Q(760, 980, 1080, 820)} `
        + `${L(1080, 1920)} ${L(0, 1920)} ${Z}`;
    const mid = `${M(0, 1040)} ${Q(300, 930, 620, 1010)} ${Q(860, 1070, 1080, 1000)} `
        + `${L(1080, 1920)} ${L(0, 1920)} ${Z}`;
    const near = `${M(0, FIELD_GROUND - 40)} ${Q(300, FIELD_GROUND - 70, 620, FIELD_GROUND - 20)} `
        + `${Q(880, FIELD_GROUND + 10, 1080, FIELD_GROUND - 30)} ${L(1080, 1920)} ${L(0, 1920)} ${Z}`;
    const out = [
        { id: 'sky', shape: { kind: 'rect', w: 1080, h: 1920, cx: true, cy: true },
          at: [540, 960], fill: '#1b2a3d', z: -100,
          gradient: { from: [0, 300, 0, 1300], stops: [[0, '#24405e'], [1, '#6b5f44']] } },
        { id: 'sun', shape: { kind: 'ellipse', rx: 54, ry: 54 }, at: [250, 520],
          fill: '#f3e2b0', alpha: 0.9, z: -99 },
        { id: 'far', shape: { kind: 'path', d: far }, fill: '#3a4a5c', z: -90 },
        { id: 'mid', shape: { kind: 'path', d: mid }, fill: '#44523f', z: -80 },
        { id: 'near', shape: { kind: 'path', d: near }, fill: '#4e5c3c', z: -70 },
    ];
    // Scrub, scattered but deterministic.
    for (let i = 0; i < 16; i++) {
        const x = 20 + r() * 1040;
        const y = FIELD_GROUND + 20 + r() * 200;
        const s = 10 + r() * 16;
        out.push({ id: `bush${i}`, shape: { kind: 'ellipse', rx: s, ry: s * 0.6 },
                   at: [x, y], fill: '#3f5236', z: -60 });
    }
    return out;
}

/**
 * Staging derived from the stride, not guessed.
 *
 * `walkTo` travels a WHOLE number of cycles, so a target picked by eye gets
 * rounded to the nearest one -- which walked her straight onto the outcrop
 * the first time. Every position here is counted out in strides instead, and
 * the rock is placed relative to where she actually ends up.
 */
const WALK_IN_FROM = -620;
const WALK_IN_CYCLES = 3;
const WALK_OVER_CYCLES = 1;
const STOP_1 = Math.round(WALK_IN_FROM + WALK_IN_CYCLES * STRIDE);
const STOP_2 = Math.round(STOP_1 + WALK_OVER_CYCLES * STRIDE);
const OUTCROP_X = STOP_2 + 165;
function outcrop() {
    return [
        { id: 'rock1', shape: { kind: 'path',
            d: poly([[OUTCROP_X - 96, FIELD_GROUND + 6], [OUTCROP_X - 70, FIELD_GROUND - 86],
                     [OUTCROP_X - 6, FIELD_GROUND - 112], [OUTCROP_X + 62, FIELD_GROUND - 70],
                     [OUTCROP_X + 92, FIELD_GROUND + 6]], true) },
          fill: '#8f8878', stroke: '#3a382e', strokeWidth: 4, z: -50 },
        { id: 'rock2', shape: { kind: 'path',
            d: poly([[OUTCROP_X - 70, FIELD_GROUND - 86], [OUTCROP_X - 6, FIELD_GROUND - 112],
                     [OUTCROP_X + 8, FIELD_GROUND - 40], [OUTCROP_X - 52, FIELD_GROUND - 18]], true) },
          fill: '#a39a86', z: -49 },
        // Bedding in the outcrop: this is what gets measured.
        ...[0, 1, 2].map((i) => ({
            id: `bed${i}`,
            shape: { kind: 'path', d: `${M(OUTCROP_X - 78 + i * 10, FIELD_GROUND - 12 - i * 26)} `
                + `${L(OUTCROP_X + 40 + i * 4, FIELD_GROUND - 48 - i * 26)}` },
            stroke: '#4a443a', strokeWidth: 5, z: -48,
        })),
    ];
}

// --- board: the desk -------------------------------------------------------

function boardDesk() {
    const sheets = [];
    for (let i = 0; i < 4; i++) {
        const x = 420 + i * 34;
        const y = 760 + i * 30;
        sheets.push(rectPart(`sh${i}`, 520, 380, { at: [x, y],
            fill: ['#3d4f45', '#4a5a50', '#56634f', '#64705a'][i],
            stroke: '#22303a', strokeWidth: 3, z: 10 + i }));
    }
    return board('desk', [
        textPart('dk_h', 'before anyone walks anywhere', {
            at: [540, 520], font: TYPE.heading, fill: 'ink', maxWidth: 940 }),
        ...sheets,
        // The licence grid over the top: the constraint nobody expects.
        ...[0, 1, 2, 3].flatMap((i) => [
            pathPart(`lg_v${i}`, `${M(300 + i * 150, 620)} ${L(300 + i * 150, 1160)}`,
                { stroke: 'structure', strokeWidth: 2, z: 20 }),
            pathPart(`lg_h${i}`, `${M(286, 660 + i * 140)} ${L(886, 660 + i * 140)}`,
                { stroke: 'structure', strokeWidth: 2, z: 20 }),
        ]),
        rectPart('lg_held', 150, 140, { at: [525, 870], fill: 'structure',
            alpha: 0, z: 19 }),
        ...labelParts('dk_l', 'already held — not yours to explore',
            [1004, 1220], [600, 940]),
        captionPart('dk_c', 'maps, archives, theses, and the licence register'),
    ]);
}

// --- board: strike and dip -------------------------------------------------

function boardStrike() {
    // A block diagram: the top face carries the strike line, the front face
    // shows the dip.
    const top = poly([[300, 720], [820, 660], [930, 790], [410, 850]], true);
    const front = poly([[300, 720], [410, 850], [410, 1080], [300, 950]], true);
    const side = poly([[410, 850], [930, 790], [930, 1020], [410, 1080]], true);
    return board('strike', [
        textPart('sk_h', 'strike and dip', {
            at: [540, 520], font: TYPE.heading, fill: 'ink' }),
        pathPart('sk_side', side, { fill: '#55634a', stroke: '#2f3a2c',
            strokeWidth: 3, z: 10 }),
        pathPart('sk_front', front, { fill: '#46523d', stroke: '#2f3a2c',
            strokeWidth: 3, z: 10 }),
        pathPart('sk_top', top, { fill: '#6b7a5c', stroke: '#2f3a2c',
            strokeWidth: 3, z: 10 }),
        // The bed, cutting the block.
        pathPart('sk_bed', poly([[352, 786], [872, 726], [930, 796], [410, 856]], true),
            { fill: 'quartz', alpha: 0, z: 12 }),
        pathPart('sk_strike', `${M(352, 786)} ${L(872, 726)}`,
            { stroke: 'gold', strokeWidth: 7, lineCap: 'butt', z: 14 }),
        ...labelParts('sk_sl', 'STRIKE  058°  —  a horizontal line on the bed',
            [1004, 640], [700, 752]),
        pathPart('sk_dip', arrowPath([700, 800], [760, 960], { head: 20 }),
            { fill: 'water', stroke: 'water', strokeWidth: 5, z: 14 }),
        ...labelParts('sk_dl', 'DIP  72° SE  —  how steeply it leans',
            [1004, 1030], [756, 950]),
        textPart('sk_n', '058 / 72 SE', { at: [540, 1180],
            font: `800 62px ${FONT}`, fill: 'gold' }),
        captionPart('sk_c', 'three numbers that say where the rock goes'),
    ]);
}

// --- board: catchments -----------------------------------------------------

function boardCatchment() {
    const streams = [
        `${M(240, 560)} ${Q(300, 760, 420, 900)} ${Q(500, 1000, 540, 1140)}`,
        `${M(820, 580)} ${Q(760, 780, 640, 900)} ${Q(570, 970, 540, 1140)}`,
        `${M(420, 540)} ${Q(460, 720, 520, 860)}`,
    ];
    return board('catch', [
        textPart('ct_h', 'one sample, ten square kilometres', {
            at: [540, 500], font: TYPE.heading, fill: 'ink', maxWidth: 940 }),
        pathPart('ct_basin', `${M(140, 1180)} ${Q(180, 700, 460, 500)} `
            + `${Q(700, 420, 900, 620)} ${Q(1000, 830, 940, 1180)} ${Z}`,
            { fill: '#28372c', stroke: '#4a6b50', strokeWidth: 3, z: 10 }),
        ...streams.map((d, i) => pathPart(`ct_s${i}`, d,
            { stroke: 'water', strokeWidth: 9 - i * 2, z: 12 })),
        ellipsePart('ct_p1', 16, 16, { at: [540, 1140], fill: 'gold', z: 14,
            glow: { blur: 22, color: '#ffc64d' } }),
        ...labelParts('ct_l1', 'sample here', [820, 1210], [556, 1146]),
        ellipsePart('ct_p2', 12, 12, { at: [420, 900], fill: 'dim', z: 14 }),
        ellipsePart('ct_p3', 12, 12, { at: [640, 900], fill: 'dim', z: 14 }),
        ...labelParts('ct_l2', 'then split the catchment, and sample again',
            [92, 620], [410, 890]),
        captionPart('ct_c', 'cheapest first: it tells you which valley to care about'),
    ]);
}

// --- board: the soil grid --------------------------------------------------

function boardGrid() {
    const parts = [
        textPart('gd_h', 'lines across the strike, never along it', {
            at: [540, 496], font: TYPE.heading, fill: 'ink', maxWidth: 940 }),
        rectPart('gd_bg', 900, 600, { at: [540, 880], fill: '#243024', alpha: 1, z: 8 }),
    ];
    /**
     * The trend runs up to the right; the traverses run DOWN to the right, so
     * the two cross at close to a right angle. That is the whole lesson --
     * traverses nearly parallel to the trend are the mistake this slide is
     * about -- so the geometry has to show it rather than assert it.
     */
    const TREND = [[150, 1120], [930, 650]];
    const X0 = 118;
    const STEP = 108;
    const RUN = 170;
    const TOP = 606;
    const DROP = 548;
    parts.push(pathPart('gd_trend', `${M(...TREND[0])} ${L(...TREND[1])}`,
        { stroke: 'gold', strokeWidth: 46, lineCap: 'butt', alpha: 0, z: 9 }));
    for (let i = 0; i < 7; i++) {
        const x0 = X0 + i * STEP;
        parts.push(pathPart(`gd_t${i}`, `${M(x0, TOP)} ${L(x0 + RUN, TOP + DROP)}`,
            { stroke: '#8ea0b8', strokeWidth: 2, z: 11 }));
    }
    for (let i = 0; i < 7; i++) {
        for (let j = 0; j < 5; j++) {
            const t = 0.1 + j * 0.2;
            const x = X0 + i * STEP + RUN * t;
            const y = TOP + DROP * t;
            // Perpendicular distance from the trend decides the colour.
            const d = Math.abs((TREND[1][0] - TREND[0][0]) * (y - TREND[0][1])
                - (x - TREND[0][0]) * (TREND[1][1] - TREND[0][1]))
                / Math.hypot(TREND[1][0] - TREND[0][0], TREND[1][1] - TREND[0][1]);
            parts.push(ellipsePart(`gd_p${i}_${j}`, 9, 9, { at: [x, y],
                fill: d < 40 ? 'gold' : d < 95 ? 'sulphide' : 'dim',
                alpha: 0, z: 13 }));
        }
    }
    parts.push(
        ...labelParts('gd_l', 'the trend — hidden under soil', [1004, 582], [660, 800]),
        captionPart('gd_c', '25 to 50 m along the line, 100 m between lines'),
    );
    return board('grid', parts);
}
const gridDots = () => {
    const out = [];
    for (let i = 0; i < 7; i++) for (let j = 0; j < 5; j++) out.push(`gd_p${i}_${j}`);
    return out;
};

// --- board: channel versus grab --------------------------------------------

function boardChannel() {
    const veinD = `${M(360, 1120)} ${L(470, 620)}`;
    return board('chan', [
        textPart('ch_h', 'how you take the sample', {
            at: [540, 500], font: TYPE.heading, fill: 'ink' }),
        rectPart('ch_rock', 860, 560, { at: [540, 870], fill: 'greenstone',
            alpha: 1, z: 8 }),
        pathPart('ch_vein', veinD, { stroke: 'quartz', strokeWidth: 54,
            lineCap: 'butt', alpha: 1, z: 9 }),
        // A continuous cut ACROSS the vein, wall to wall.
        pathPart('ch_cut', `${M(336, 894)} ${L(534, 852)}`,
            { stroke: 'gold', strokeWidth: 16, lineCap: 'butt', z: 12 }),
        ...labelParts('ch_l1', 'channel sample \u2014 a continuous cut, wall to wall',
            [92, 556], [360, 880]),
        // The flattering lump.
        ellipsePart('ch_grab', 30, 24, { at: [800, 900], fill: 'quartz', z: 12 }),
        ellipsePart('ch_grabau', 6, 6, { at: [806, 896], fill: 'gold', z: 13 }),
        pathPart('ch_no', `${M(758, 858)} ${L(846, 942)} ${M(846, 858)} ${L(758, 942)}`,
            { stroke: 'structure', strokeWidth: 7, z: 14 }),
        ...labelParts('ch_l2', 'picking the best rock is how you lie to yourself',
            [1004, 1222], [806, 940]),
    ]);
}

// --- board: pathfinders ----------------------------------------------------

const PATHFINDERS = [
    ['As', 'arsenic'], ['Sb', 'antimony'], ['Bi', 'bismuth'],
    ['Te', 'tellurium'], ['W', 'tungsten'], ['Ag', 'silver'],
];

function boardPath() {
    const parts = [
        textPart('pf_h', 'the company gold keeps', {
            at: [540, 520], font: TYPE.heading, fill: 'ink' }),
        textPart('pf_s', 'pathfinder elements — easier to measure than gold itself', {
            at: [540, 578], font: TYPE.small, fill: 'dim', maxWidth: 940 }),
    ];
    PATHFINDERS.forEach(([sym, name], i) => {
        const col = i % 3;
        const row = (i - col) / 3;
        const x = 250 + col * 290;
        const y = 760 + row * 250;
        parts.push(
            rectPart(`pf${i}`, 230, 190, { at: [x, y], fill: 'panel',
                stroke: i === 0 ? 'gold' : '#2a3b52', strokeWidth: i === 0 ? 4 : 2, z: 10 }),
            textPart(`pf${i}_s`, sym, { at: [x, y - 22], font: `800 72px ${FONT}`,
                fill: i === 0 ? 'gold' : 'ink', z: 12 }),
            textPart(`pf${i}_n`, name, { at: [x, y + 54], font: TYPE.small,
                fill: 'dim', maxWidth: 210, z: 12 }),
        );
    });
    parts.push(captionPart('pf_c', 'gold itself goes to a laboratory. Always.'));
    return board('path', parts);
}
const pfIds = (i) => [`pf${i}`, `pf${i}_s`, `pf${i}_n`];

// --- the film --------------------------------------------------------------

export function partFour() {
    const card = endCard('Next: the same search, run from orbit.');
    const boards = [boardDesk(), boardStrike(), boardCatchment(), boardGrid(),
                    boardChannel(), boardPath(), board('card', card.parts)];
    const characters = { ...CHARACTERS };
    for (const b of boards) characters[b.name] = effect(b.parts, { palette: 'geo' });

    // Field poses: she leans in and swings the hammer rather than crouching.
    // A crouch that is slightly wrong reads worse than an honest stand.
    characters.zawadi = {
        ...CHARACTERS.zawadi,
        poses: {
            ...CHARACTERS.zawadi.poses,
            lean: { torso: { rot: 0.16 }, head: { rot: -0.1 },
                    armR: { rot: -0.95 }, foreR: { rot: -0.6 } },
            strike: { torso: { rot: 0.22 }, head: { rot: -0.06 },
                      armR: { rot: -0.2 }, foreR: { rot: -0.12 } },
            look: { head: { rot: -0.14 }, torso: { rot: -0.04 },
                    armR: { rot: -0.3 }, foreR: { rot: -0.2 } },
        },
    };

    const walkIn = walkTo('zawadi', {
        from: [WALK_IN_FROM, FIELD_Y], to: [STOP_1, FIELD_Y],
        stride: STRIDE, cadence: 1.25, at: 0.2 });
    const walkOver = walkTo('zawadi', {
        from: [STOP_1, FIELD_Y], to: [STOP_2, FIELD_Y],
        stride: STRIDE, cadence: 1.25, at: 0.4 });

    const field = (id) => ({
        id, palette: 'geo',
        background: { color: '#1b2a3d' },
        scenery: [...hillside(909), ...outcrop()],
        transitionOut: { kind: 'crossfade', duration: 0.6 },
    });

    const scenes = [
        {
            ...field('field'),
            transitionIn: { kind: 'fade', from: '#000000', duration: 0.9 },
            cast: [{ character: 'zawadi', as: 'zawadi', at: [WALK_IN_FROM, FIELD_Y],
                     scale: FIELD_SCALE, view: 'profile' },
                   castBoard('title_b', { alpha: 1, z: 60 })],
            shots: [
                { id: 'w0', duration: 10.0, dialogue: [vo(P4[0], 4.4)],
                  actions: [
                      ...walkIn.actions,
                      { target: 'zawadi', do: 'pose', pose: 'look',
                        at: +(walkIn.duration + 0.5).toFixed(2), for: 0.6 },
                      { target: 'zawadi', do: 'play', action: 'breathe',
                        at: +(walkIn.duration + 0.3).toFixed(2) },
                      ...build('title_b', ['kicker', 'title'], 0.4,
                               { gap: 0.3, span: 0.5 }),
                      ...conceal('title_b', 'kicker', 7.8, { span: 0.5 }),
                      ...conceal('title_b', 'title', 8.0, { span: 0.5 }),
                  ] },
            ],
        },
        {
            id: 'desk', palette: 'geo',
            background: { color: '#0d1420' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('desk', { alpha: 1 })],
            shots: [
                { id: 'w1', duration: 16.5, dialogue: [vo(P4[1], 0.5)],
                  actions: [
                      ...reveal('desk', 'dk_h', 0.4, { span: 0.4 }),
                      ...build('desk', ['sh0', 'sh1', 'sh2', 'sh3'], 1.2,
                               { gap: 0.3, span: 0.4 }),
                      ...reveal('desk', 'dk_c', 3.6, { span: 0.4 }),
                      ...build('desk', ['lg_v0', 'lg_v1', 'lg_v2', 'lg_v3',
                                        'lg_h0', 'lg_h1', 'lg_h2', 'lg_h3'], 9.0,
                               { gap: 0.07, span: 0.3 }),
                      ...reveal('desk', 'lg_held', 11.0, { span: 0.4, to: 0.45 }),
                      ...build('desk', ['dk_l', 'dk_l_lead'], 11.6, { gap: 0.1 }),
                  ] },
            ],
        },
        {
            ...field('field2'),
            cast: [{ character: 'zawadi', as: 'zawadi', at: [STOP_1, FIELD_Y],
                     scale: FIELD_SCALE, view: 'profile' }],
            shots: [
                { id: 'w2', duration: 7.0, dialogue: [vo(P4[2], 0.4)],
                  actions: [
                      ...walkOver.actions,
                      { target: 'zawadi', do: 'pose', pose: 'lean',
                        at: +(walkOver.duration + 0.5).toFixed(2), for: 0.5 },
                      // Two blows: down, back, down again.
                      { target: 'zawadi', do: 'pose', pose: 'strike',
                        at: +(walkOver.duration + 1.1).toFixed(2), for: 0.14 },
                      { target: 'zawadi', do: 'pose', pose: 'lean',
                        at: +(walkOver.duration + 1.5).toFixed(2), for: 0.3 },
                      { target: 'zawadi', do: 'pose', pose: 'strike',
                        at: +(walkOver.duration + 2.0).toFixed(2), for: 0.14 },
                      { target: 'zawadi', do: 'pose', pose: 'lean',
                        at: +(walkOver.duration + 2.4).toFixed(2), for: 0.4 },
                      ...blinks('zawadi', 7.0, 83),
                  ] },
            ],
        },
        {
            id: 'strike', palette: 'geo',
            background: { color: '#0d1420' },
            transitionIn: { kind: 'crossfade', duration: 0.6 },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('strike', { alpha: 1 })],
            shots: [
                { id: 'w3', duration: 12.5, dialogue: [vo(P4[3], 0.5)],
                  actions: [
                      ...reveal('strike', 'sk_h', 0.4, { span: 0.4 }),
                      ...build('strike', ['sk_side', 'sk_front', 'sk_top'], 1.0,
                               { gap: 0.18, span: 0.4 }),
                      ...reveal('strike', 'sk_bed', 6.0, { span: 0.6, to: 0.95 }),
                  ] },
                { id: 'w4', duration: 10.0, dialogue: [vo(P4[4], 0.4)],
                  actions: [
                      ...reveal('strike', 'sk_strike', 0.5, { span: 0.5 }),
                      ...build('strike', ['sk_sl', 'sk_sl_lead'], 1.2, { gap: 0.1 }),
                      ...reveal('strike', 'sk_dip', 5.0, { span: 0.4 }),
                      ...build('strike', ['sk_dl', 'sk_dl_lead'], 5.8, { gap: 0.1 }),
                  ] },
                { id: 'w5', duration: 13.0, dialogue: [vo(P4[5], 0.4)],
                  actions: [
                      ...pop('strike', 'sk_n', 0.8, { span: 0.5, overshoot: 0.12 }),
                      ...reveal('strike', 'sk_c', 3.0, { span: 0.5 }),
                  ] },
            ],
        },
        {
            id: 'sample', palette: 'geo',
            background: { color: '#0d1420' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('catch'), castBoard('grid'), castBoard('chan')],
            shots: [
                { id: 'w6', duration: 4.5, dialogue: [vo(P4[6], 0.4)],
                  actions: [{ target: 'catch', do: 'show', at: 0.1, for: 0.4 },
                            ...reveal('catch', 'ct_h', 0.5, { span: 0.4 })] },
                { id: 'w7', duration: 13.0, dialogue: [vo(P4[7], 0.4)],
                  actions: [
                      ...reveal('catch', 'ct_basin', 0.3, { span: 0.5 }),
                      ...build('catch', ['ct_s0', 'ct_s1', 'ct_s2'], 1.0,
                               { gap: 0.2, span: 0.4 }),
                      ...pop('catch', 'ct_p1', 3.4, { span: 0.4, overshoot: 0.12 }),
                      ...build('catch', ['ct_l1', 'ct_l1_lead'], 4.0, { gap: 0.1 }),
                      ...build('catch', ['ct_p2', 'ct_p3'], 7.6, { gap: 0.2, span: 0.3 }),
                      ...build('catch', ['ct_l2', 'ct_l2_lead'], 8.4, { gap: 0.1 }),
                      ...reveal('catch', 'ct_c', 10.4, { span: 0.5 }),
                  ] },
                { id: 'w8', duration: 16.5, dialogue: [vo(P4[8], 0.4)],
                  actions: [
                      { target: 'catch', do: 'hide', at: 0.2, for: 0.5 },
                      { target: 'grid', do: 'show', at: 0.7, for: 0.4 },
                      ...reveal('grid', 'gd_h', 0.9, { span: 0.4 }),
                      ...build('grid', ['gd_t0', 'gd_t1', 'gd_t2', 'gd_t3', 'gd_t4',
                                        'gd_t5', 'gd_t6'], 2.0, { gap: 0.12, span: 0.3 }),
                      ...build('grid', gridDots(), 4.2, { gap: 0.035, span: 0.22 }),
                      ...reveal('grid', 'gd_trend', 10.2, { span: 0.7, to: 0.3 }),
                      ...build('grid', ['gd_l', 'gd_l_lead'], 11.2, { gap: 0.1 }),
                      ...reveal('grid', 'gd_c', 13.4, { span: 0.5 }),
                  ] },
                { id: 'w9', duration: 14.5, dialogue: [vo(P4[9], 0.4)],
                  actions: [
                      { target: 'grid', do: 'hide', at: 0.2, for: 0.5 },
                      { target: 'chan', do: 'show', at: 0.7, for: 0.4 },
                      ...reveal('chan', 'ch_h', 0.9, { span: 0.4 }),
                      ...reveal('chan', 'ch_cut', 3.0, { span: 0.6 }),
                      ...build('chan', ['ch_l1', 'ch_l1_lead'], 3.8, { gap: 0.1 }),
                      ...build('chan', ['ch_grab', 'ch_grabau'], 8.0,
                               { gap: 0.15, span: 0.3 }),
                      ...pop('chan', 'ch_no', 9.4, { span: 0.3, overshoot: 0.15 }),
                      ...build('chan', ['ch_l2', 'ch_l2_lead'], 10.0, { gap: 0.1 }),
                  ] },
            ],
        },
        {
            id: 'talk', palette: 'geo',
            background: { color: '#101a26' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [
                { character: 'zawadi', as: 'zawadi', at: [330, TALK_Y], scale: 1.5,
                  view: 'threeQuarter' },
                { character: 'juma', as: 'juma', at: [770, TALK_Y], scale: 1.5,
                  view: 'threeQuarter', facing: -1 },
                castBoard('path', { alpha: 0, z: 40 }),
            ],
            shots: [
                { id: 'w10', duration: 15.0,
                  dialogue: [vo(P4[10], 0.4)],
                  actions: [
                      { target: 'zawadi', do: 'hide', at: 0, for: 0.01 },
                      { target: 'juma', do: 'hide', at: 0, for: 0.01 },
                      { target: 'path', do: 'show', at: 0.2, for: 0.4 },
                      ...build('path', ['pf_h', 'pf_s'], 0.5, { gap: 0.2, span: 0.4 }),
                      ...build('path', pfIds(0), 2.0, { gap: 0.1, span: 0.35, how: pop }),
                      ...reveal('path', 'pf_c', 10.4, { span: 0.5 }),
                  ] },
                { id: 'w11', duration: 3.8, framing: 'wide', on: 'juma',
                  dialogue: [says('juma', P4[11], 0.5)],
                  actions: [
                      { target: 'path', do: 'hide', at: 0, for: 0.3 },
                      { target: 'zawadi', do: 'show', at: 0.2, for: 0.3 },
                      { target: 'juma', do: 'show', at: 0.2, for: 0.3 },
                      { target: 'zawadi', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'juma', do: 'pose', pose: 'ask', at: 0.4, for: 0.4 },
                      { target: 'zawadi', do: 'play', action: 'breathe' },
                      { target: 'juma', do: 'play', action: 'breathe' },
                      ...blinks('zawadi', 3.8, 91), ...blinks('juma', 3.8, 97),
                  ] },
                { id: 'w12', duration: 7.5, framing: 'wide', on: 'zawadi',
                  dialogue: [says('zawadi', P4[12], 0.4)],
                  actions: [
                      { target: 'juma', do: 'pose', pose: 'stand', at: 0.2, for: 0.5 },
                      { target: 'zawadi', do: 'pose', pose: 'present', at: 0.4, for: 0.6 },
                      { target: 'zawadi', do: 'play', action: 'breathe' },
                      { target: 'juma', do: 'play', action: 'breathe' },
                      ...blinks('zawadi', 7.5, 101), ...blinks('juma', 7.5, 103),
                  ] },
            ],
        },
        {
            id: 'card', palette: 'geo',
            background: { color: '#06090f' },
            transitionIn: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('card', { alpha: 1 })],
            shots: [{ id: 'c1', duration: 9.0, actions: card.actions('card', 0.4) }],
        },
    ];

    // The title sits over the opening landscape rather than on a board of its
    // own, so the film can start on the thing it is about.
    characters.title_b = effect(titleParts(`${SERIES.toUpperCase()}  ·  PART 4`,
        'On the ground'), { palette: 'geo' });

    return {
        version: 'jirex.film/1',
        meta: META('Reconnaissance'),
        voices: VOICES,
        palettes: { geo: GEO_PALETTE },
        characters,
        scenes,
    };
}
