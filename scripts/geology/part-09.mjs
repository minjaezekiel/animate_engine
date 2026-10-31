/**
 * Part 9 — Drilling, assay and resource estimation.
 *
 * The densest part of the series, so every board carries one idea: what each
 * rig gives you, why QA/QC is not paperwork, why a downhole length is not a
 * width, and what a block model actually is. The true-width caution gets its
 * own beat because it is the most common way a good intercept is oversold.
 */
import {
    GROUND_Y, L, M, Q, TYPE, Z, arrowPath, build, captionPart, conceal, effect,
    ellipsePart, glide, labelParts, pathPart, poly, pop, ramp, rectPart, reveal,
    scale, smooth, textPart, titleParts,
} from '../lib/diagram.mjs';
import {
    CHARACTERS, GEO_PALETTE, META, SERIES, VOICES, endCard, offstage, says, vo,
} from '../lib/series.mjs';
import { blinks, board, castBoard, rng } from './common.mjs';

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const TALK_Y = Math.round(GROUND_Y - 274 * 1.5);

const P9 = [
    /* 0 */ 'Everything so far has been inference. Drilling is the first time you hold '
          + 'the target.',
    /* 1 */ 'Three tools, cheapest first. Aircore and RAB punch shallow holes fast. '
          + 'Reverse circulation goes deeper, returns clean chips, and is the '
          + 'production workhorse.',
    /* 2 */ 'Diamond core returns an intact cylinder of rock. Expensive, slower, and the '
          + 'only method that shows you structure — so you can measure the vein '
          + 'instead of guessing it.',
    /* 3 */ 'Core is logged: lithology, alteration, veining, sulphides, structure, and '
          + 'recovery — because a metre you did not recover is a metre you know '
          + 'nothing about.',
    /* 4 */ 'Then sampling. Mark intervals on geological boundaries, not round '
          + 'numbers. Gold goes to fire assay on fifty grams, because it is spread so '
          + 'unevenly that a small sample is a lottery ticket.',
    /* 5 */ 'And QA/QC, which is not paperwork. Blanks catch contamination. Standards '
          + 'catch a laboratory drifting. A resource built on unchecked assays is not a '
          + 'resource.',
    /* 6 */ 'Results come back as intercepts. Twelve metres at four point three grams a '
          + 'tonne, from eighty-five metres.',
    /* 7 */ 'One caution. That is downhole length. If the hole cuts the vein at a '
          + 'shallow angle the true width is much less — and quoting downhole as '
          + 'thickness is the oldest flattering mistake in the business.',
    /* 8 */ 'Now turn holes into a deposit. Composite to equal lengths, and top-cut '
          + 'the freak values \u2014 because one four-hundred-gram sample invents '
          + 'tonnes of gold that are not there.',
    /* 9 */ 'Interpret the mineralised zone on every section, join the sections into a '
          + 'wireframe, and fill that volume with blocks.',
    /*10 */ 'Each block takes its grade from nearby samples. Kriging weights them by '
          + 'how grade behaves here, measured as a variogram: nugget, range and sill.',
    /*11 */ 'And the search is stretched along the ore trend, because continuity runs '
          + 'along a vein, not across it.',
    /*12 */ 'Then classify honestly. Measured, Indicated, Inferred — confidence set '
          + 'by drill spacing, under a code such as JORC.',
    /*13 */ 'So that is the reserve?',
    /*14 */ 'That is the resource. A reserve is the part you have shown you can actually '
          + 'mine and sell, at a profit, with a plan. That comes next.',
];

// --- board: the three rigs -------------------------------------------------

const RIGS = [
    ['g1', 'Aircore / RAB', 'chips  ·  to ~50 m', 'cheap, fast, through soil', 120],
    ['g2', 'Reverse circulation', 'clean chips  ·  to ~300 m', 'the production workhorse', 300],
    ['g3', 'Diamond core', 'intact core  ·  1 km +', 'the only one that shows structure', 520],
];

function boardRigs() {
    const parts = [
        textPart('rg_h', 'three ways to make a hole', {
            at: [540, 500], font: TYPE.heading, fill: 'ink' }),
        pathPart('rg_surf', `${M(90, 640)} ${L(990, 640)}`,
            { stroke: 'ink', strokeWidth: 3, alpha: 1, z: 14 }),
        rectPart('rg_rock', 900, 620, { at: [540, 950], fill: 'greenstone',
            alpha: 1, z: 8 }),
    ];
    RIGS.forEach(([id, name, spec, note, depth], i) => {
        const x = 230 + i * 310;
        parts.push(
            pathPart(id, `${M(x, 640)} ${L(x, 640 + depth)}`,
                { stroke: i === 2 ? 'gold' : 'water', strokeWidth: 12,
                  lineCap: 'butt', z: 12 }),
            textPart(`${id}_n`, name, { at: [x, 560], font: `700 27px ${FONT}`,
                fill: 'ink', maxWidth: 300, lineHeight: 32, z: 13 }),
            textPart(`${id}_s`, spec, { at: [x, 690 + depth], font: TYPE.small,
                fill: i === 2 ? 'gold' : 'water', maxWidth: 300, lineHeight: 30, z: 13 }),
        );
    });
    parts.push(captionPart('rg_c', 'cheapest first, deepest last', { y: 1310 }));
    return board('rigs', parts);
}
const rigIds = (id) => [`${id}_n`, id, `${id}_s`];

// --- board: logging --------------------------------------------------------

function boardLog() {
    const r = rng(909);
    const parts = [
        textPart('lg_h', 'what gets written down', {
            at: [540, 500], font: TYPE.heading, fill: 'ink' }),
    ];
    // A core tray: five rows of core.
    for (let i = 0; i < 5; i++) {
        const y = 620 + i * 74;
        parts.push(rectPart(`lg_t${i}`, 620, 54, { at: [420, y], fill: '#6b6a5c',
            stroke: '#3b3a32', strokeWidth: 3, z: 10 }));
        // The mineralised run, in the middle rows.
        if (i === 2 || i === 3) {
            parts.push(rectPart(`lg_v${i}`, 180 + i * 40, 54,
                { at: [360 + i * 20, y], fill: 'quartz', z: 11 }));
        }
    }
    // The log columns beside it.
    const COLS = ['lithology', 'alteration', 'veining', 'sulphides', 'recovery'];
    COLS.forEach((name, i) => parts.push(
        textPart(`lg_c${i}`, name, { at: [1004, 624 + i * 74], font: TYPE.small,
            fill: 'dim', align: 'right', maxWidth: 300, z: 13 })));
    parts.push(
        ...labelParts('lg_rl', 'a metre you did not recover is a metre you do not know',
            [540, 1120], null),
        captionPart('lg_cap', 'core is the only data that shows structure', { y: 1240 }),
    );
    return board('log', parts);
}

// --- board: QA/QC ----------------------------------------------------------

function boardQaqc() {
    const x = scale(0, 20, 180, 960);
    const y = scale(0.8, 1.2, 1120, 660);
    const r = rng(919);
    const parts = [
        textPart('qc_h', 'the checks that are not paperwork', {
            at: [540, 496], font: TYPE.heading, fill: 'ink', maxWidth: 940 }),
        pathPart('qc_ax', `${M(180, y(1.0))} ${L(960, y(1.0))}`,
            { stroke: 'gold', strokeWidth: 3, alpha: 1, z: 10 }),
        textPart('qc_axl', 'certified value', { at: [92, y(1.0)], font: TYPE.small,
            fill: 'gold', align: 'left', maxWidth: 200, z: 11 }),
        // The control limits.
        ...[0.9, 1.1].map((v, i) => pathPart(`qc_lim${i}`,
            `${M(180, y(v))} ${L(960, y(v))}`,
            { stroke: 'dim', strokeWidth: 2, alpha: 1, z: 10 })),
    ];
    // Standards: in control, then drifting out of it.
    for (let i = 0; i < 20; i++) {
        const drift = i > 13 ? (i - 13) * 0.028 : 0;
        const v = 1 + (r() - 0.5) * 0.06 + drift;
        parts.push(ellipsePart(`qc_p${i}`, 9, 9, { at: [x(i), y(v)],
            fill: v > 1.1 ? 'structure' : 'ink', z: 12 }));
    }
    parts.push(
        ...labelParts('qc_dl', 'the laboratory drifting — caught', [1004, 616],
            [x(18), y(1.14)]),
        captionPart('qc_c', 'blanks, standards, duplicates — at a known rate'),
    );
    return board('qaqc', parts);
}
const qcDots = () => Array.from({ length: 20 }, (_, i) => `qc_p${i}`);

// --- board: the intercept, and its true width ------------------------------

function boardIntercept() {
    return board('icept', [
        textPart('ic_h', '12 m @ 4.3 g/t from 85 m', {
            at: [540, 500], font: TYPE.heading, fill: 'gold', maxWidth: 940 }),
        rectPart('ic_rock', 900, 560, { at: [540, 920], fill: 'greenstone',
            alpha: 1, z: 8 }),
        // The vein, steep; the hole, shallow across it.
        pathPart('ic_vein', `${M(430, 1200)} ${L(640, 640)}`,
            { stroke: 'quartz', strokeWidth: 70, lineCap: 'butt', alpha: 1, z: 9 }),
        pathPart('ic_hole', `${M(140, 760)} ${L(940, 1060)}`,
            { stroke: 'water', strokeWidth: 8, lineCap: 'butt', alpha: 1, z: 12 }),
        // What the hole measured, against what is actually there.
        pathPart('ic_down', `${M(455, 878)} ${L(640, 947)}`,
            { stroke: 'gold', strokeWidth: 16, lineCap: 'butt', z: 13 }),
        ...labelParts('ic_dl', 'downhole: 12 m', [1004, 820], [600, 920]),
        pathPart('ic_true', `${M(548, 1010)} ${L(614, 834)}`,
            { stroke: 'structure', strokeWidth: 14, lineCap: 'butt', z: 13 }),
        ...labelParts('ic_tl', 'true width: 4 m', [92, 1120], [560, 990]),
        captionPart('ic_c', 'the oldest flattering mistake in the business'),
    ]);
}

// --- board: sections to blocks ---------------------------------------------

function boardModel() {
    const parts = [
        textPart('md_h', 'sections, wireframe, blocks', {
            at: [540, 500], font: TYPE.heading, fill: 'ink', maxWidth: 940 }),
    ];
    // Three sections, each with a drill fan and an interpreted zone.
    for (let i = 0; i < 3; i++) {
        const x = 230 + i * 310;
        parts.push(
            rectPart(`md_s${i}`, 250, 300, { at: [x, 740], fill: '#1b2630',
                stroke: '#2a3b52', strokeWidth: 3, z: 10 }),
            pathPart(`md_z${i}`, `${M(x - 50, 860)} ${L(x + 30, 630)}`,
                { stroke: 'gold', strokeWidth: 26, lineCap: 'butt', z: 11 }),
            ...[0, 1, 2].map((j) => pathPart(`md_h${i}_${j}`,
                `${M(x - 110, 640 + j * 70)} ${L(x + 110, 700 + j * 70)}`,
                { stroke: 'water', strokeWidth: 3, z: 12 })),
        );
    }
    // The block model: a grid, graded.
    const r = rng(929);
    for (let c = 0; c < 10; c++) {
        for (let rw = 0; rw < 5; rw++) {
            const bx = 165 + c * 82;
            const by = 1010 + rw * 60;
            // A diagonal ore zone through the grid.
            const d = Math.abs((c - 4.5) * 0.8 + (rw - 2));
            parts.push(rectPart(`md_b${c}_${rw}`, 78, 56, { at: [bx, by],
                fill: d < 0.9 ? 'gold' : d < 1.9 ? '#b08a3a' : '#2f3a46', z: 14 }));
        }
    }
    parts.push(captionPart('md_c', 'volume × density × grade, block by block',
        { y: 1330 }));
    return board('model', parts);
}
const blockIds = () => {
    const out = [];
    for (let c = 0; c < 10; c++) for (let r = 0; r < 5; r++) out.push(`md_b${c}_${r}`);
    return out;
};

// --- board: the variogram and the search ellipse ---------------------------

function boardVario() {
    const vx = scale(0, 200, 220, 940);
    const vy = scale(0, 1.2, 1060, 640);
    return board('vario', [
        textPart('vg_h', 'how far one sample reaches', {
            at: [540, 496], font: TYPE.heading, fill: 'ink', maxWidth: 940 }),
        pathPart('vg_ax', `${M(220, 1060)} ${L(940, 1060)}`,
            { stroke: 'dim', strokeWidth: 3, alpha: 1, z: 10 }),
        pathPart('vg_ay', `${M(220, 1060)} ${L(220, 640)}`,
            { stroke: 'dim', strokeWidth: 3, alpha: 1, z: 10 }),
        textPart('vg_xl', 'distance between samples, m', { at: [580, 1118],
            font: TYPE.small, fill: 'dim', maxWidth: 800, z: 10 }),
        // The model: nugget at zero, rising to a sill at the range.
        pathPart('vg_curve', smooth([[vx(0), vy(0.22)], [vx(30), vy(0.52)],
                                     [vx(70), vy(0.82)], [vx(110), vy(0.97)],
                                     [vx(150), vy(1.0)], [vx(200), vy(1.0)]]),
            { stroke: 'gold', strokeWidth: 7, z: 12 }),
        pathPart('vg_sill', `${M(220, vy(1.0))} ${L(940, vy(1.0))}`,
            { stroke: 'dim', strokeWidth: 2, z: 11 }),
        ...labelParts('vg_n', 'nugget — what you never explain', [92, vy(0.22)],
            [vx(0) + 10, vy(0.22)]),
        ...labelParts('vg_s', 'sill', [1004, vy(1.0) - 40], null),
        pathPart('vg_rng', `${M(vx(115), vy(1.0))} ${L(vx(115), 1060)}`,
            { stroke: 'structure', strokeWidth: 3, z: 12 }),
        ...labelParts('vg_r', 'range — past this, a sample tells you nothing',
            [1004, 1130], [vx(115), 1050]),
    ]);
}

function boardEllipse() {
    return board('ellipse', [
        textPart('el_h', 'and point it along the ore', {
            at: [540, 500], font: TYPE.heading, fill: 'ink', maxWidth: 940 }),
        rectPart('el_bg', 880, 560, { at: [540, 920], fill: '#1b2630',
            stroke: '#2a3b52', strokeWidth: 3, alpha: 1, z: 8 }),
        pathPart('el_ore', `${M(220, 1140)} ${L(860, 700)}`,
            { stroke: 'gold', strokeWidth: 54, lineCap: 'butt', alpha: 1, z: 9 }),
        // Wrong: a search circle smears grade sideways into waste.
        ellipsePart('el_bad', 150, 150, { at: [430, 1000], fill: null,
            stroke: 'structure', strokeWidth: 6, z: 12 }),
        ...labelParts('el_bl', 'wrong — smears grade into waste', [92, 700],
            [400, 880]),
        captionPart('el_c', 'continuity runs ALONG a vein, not across it'),
    ]);
}

// --- board: classification -------------------------------------------------

function boardClass() {
    const parts = [
        textPart('cl_h', 'how confident, and who signs it', {
            at: [540, 496], font: TYPE.heading, fill: 'ink', maxWidth: 940 }),
    ];
    // Dense drilling in the middle, sparse at the edges.
    for (let c = 0; c < 11; c++) {
        for (let r = 0; r < 6; r++) {
            const d = Math.abs(c - 5) / 5;
            const cls = d < 0.3 ? 0 : d < 0.65 ? 1 : 2;
            parts.push(rectPart(`cl_b${c}_${r}`, 74, 58,
                { at: [160 + c * 76, 700 + r * 64],
                  fill: ['#ffc64d', '#b08a3a', '#5c5a46'][cls], z: 10 }));
        }
    }
    [['Measured', '#ffc64d'], ['Indicated', '#b08a3a'], ['Inferred', '#5c5a46']]
        .forEach(([name, color], i) => parts.push(
            rectPart(`cl_k${i}`, 30, 30, { at: [270 + i * 250, 1150],
                fill: color, z: 12 }),
            textPart(`cl_k${i}n`, name, { at: [300 + i * 250, 1150],
                font: TYPE.small, fill: 'ink', align: 'left', maxWidth: 220, z: 12 })));
    parts.push(captionPart('cl_c', 'JORC or NI 43-101, signed by a competent person',
        { y: 1250 }));
    return board('class', parts);
}
const classIds = () => {
    const out = [];
    for (let c = 0; c < 11; c++) for (let r = 0; r < 6; r++) out.push(`cl_b${c}_${r}`);
    return out;
};

// --- the film --------------------------------------------------------------

export function partNine() {
    const card = endCard('Next: designing the mine the structure will allow.');
    const boards = [boardRigs(), boardLog(), boardQaqc(), boardIntercept(),
                    boardModel(), boardVario(), boardEllipse(), boardClass(),
                    board('card', card.parts)];
    const characters = { ...CHARACTERS };
    for (const b of boards) characters[b.name] = effect(b.parts, { palette: 'geo' });
    characters.title_b = effect(titleParts(`${SERIES.toUpperCase()}  ·  PART 9`,
        'Drill, assay, estimate'), { palette: 'geo' });

    const scenes = [
        {
            id: 'drill', palette: 'geo',
            background: { color: '#0d1420' },
            transitionIn: { kind: 'fade', from: '#000000', duration: 0.9 },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('title_b', { alpha: 1, z: 60 }),
                   castBoard('rigs'), castBoard('log')],
            shots: [
                { id: 'n0', duration: 7.0, dialogue: [vo(P9[0], 0.7)],
                  actions: build('title_b', ['kicker', 'title'], 0.4,
                                 { gap: 0.3, span: 0.5 }) },
                { id: 'n1', duration: 11.5, dialogue: [vo(P9[1], 0.4)],
                  actions: [
                      ...conceal('title_b', 'kicker', 0.2, { span: 0.4 }),
                      ...conceal('title_b', 'title', 0.3, { span: 0.4 }),
                      { target: 'rigs', do: 'show', at: 0.8, for: 0.4 },
                      ...reveal('rigs', 'rg_h', 1.0, { span: 0.4 }),
                      ...build('rigs', rigIds('g1'), 2.0, { gap: 0.15, span: 0.4 }),
                      ...build('rigs', rigIds('g2'), 6.0, { gap: 0.15, span: 0.4 }),
                  ] },
                { id: 'n2', duration: 12.5, dialogue: [vo(P9[2], 0.4)],
                  actions: [
                      ...build('rigs', rigIds('g3'), 0.5, { gap: 0.15, span: 0.4 }),
                      ...reveal('rigs', 'rg_c', 9.0, { span: 0.5 }),
                  ] },
                { id: 'n3', duration: 12.5, dialogue: [vo(P9[3], 0.4)],
                  actions: [
                      { target: 'rigs', do: 'hide', at: 0.2, for: 0.5 },
                      { target: 'log', do: 'show', at: 0.7, for: 0.4 },
                      ...reveal('log', 'lg_h', 0.9, { span: 0.4 }),
                      ...build('log', ['lg_t0', 'lg_t1', 'lg_t2', 'lg_t3', 'lg_t4'],
                               1.6, { gap: 0.16, span: 0.3 }),
                      ...build('log', ['lg_v2', 'lg_v3'], 3.0, { gap: 0.2, span: 0.35 }),
                      ...build('log', ['lg_c0', 'lg_c1', 'lg_c2', 'lg_c3', 'lg_c4'],
                               4.6, { gap: 0.3, span: 0.3 }),
                      ...reveal('log', 'lg_rl', 8.6, { span: 0.5 }),
                      ...reveal('log', 'lg_cap', 11.0, { span: 0.5 }),
                  ] },
            ],
        },
        {
            id: 'assay', palette: 'geo',
            background: { color: '#0d1420' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('qaqc', { alpha: 1 })],
            shots: [
                { id: 'n4', duration: 13.5, dialogue: [vo(P9[4], 0.5)],
                  actions: reveal('qaqc', 'qc_h', 12.0, { span: 0.4 }) },
                { id: 'n5', duration: 13.5, dialogue: [vo(P9[5], 0.4)],
                  actions: [
                      ...build('qaqc', ['qc_axl'], 0.5, { gap: 0.1, span: 0.35 }),
                      ...build('qaqc', qcDots(), 1.6, { gap: 0.19, span: 0.25 }),
                      ...build('qaqc', ['qc_dl', 'qc_dl_lead'], 7.0, { gap: 0.1 }),
                      ...reveal('qaqc', 'qc_c', 10.0, { span: 0.5 }),
                  ] },
            ],
        },
        {
            id: 'icept', palette: 'geo',
            background: { color: '#0d1420' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('icept', { alpha: 1 })],
            shots: [
                { id: 'n6', duration: 8.0, dialogue: [vo(P9[6], 0.5)],
                  actions: [
                      ...reveal('icept', 'ic_h', 0.4, { span: 0.4 }),
                      ...reveal('icept', 'ic_down', 2.4, { span: 0.5 }),
                      ...build('icept', ['ic_dl', 'ic_dl_lead'], 3.2, { gap: 0.1 }),
                  ] },
                { id: 'n7', duration: 14.0, dialogue: [vo(P9[7], 0.4)],
                  actions: [
                      ...reveal('icept', 'ic_true', 4.0, { span: 0.5 }),
                      ...build('icept', ['ic_tl', 'ic_tl_lead'], 4.8, { gap: 0.1 }),
                      ...reveal('icept', 'ic_c', 9.0, { span: 0.5 }),
                  ] },
            ],
        },
        {
            id: 'model', palette: 'geo',
            background: { color: '#0d1420' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('model'), castBoard('vario'),
                   castBoard('ellipse')],
            shots: [
                { id: 'n8', duration: 13.5, dialogue: [vo(P9[8], 0.5)],
                  actions: [{ target: 'model', do: 'show', at: 0.2, for: 0.4 },
                            ...reveal('model', 'md_h', 0.5, { span: 0.4 })] },
                { id: 'n9', duration: 11.0, dialogue: [vo(P9[9], 0.4)],
                  actions: [
                      ...build('model', ['md_s0', 'md_h0_0', 'md_h0_1', 'md_h0_2',
                                         'md_z0'], 0.4, { gap: 0.1, span: 0.3 }),
                      ...build('model', ['md_s1', 'md_h1_0', 'md_h1_1', 'md_h1_2',
                                         'md_z1'], 1.6, { gap: 0.1, span: 0.3 }),
                      ...build('model', ['md_s2', 'md_h2_0', 'md_h2_1', 'md_h2_2',
                                         'md_z2'], 2.8, { gap: 0.1, span: 0.3 }),
                      ...build('model', blockIds(), 5.0, { gap: 0.028, span: 0.22 }),
                      ...reveal('model', 'md_c', 9.6, { span: 0.5 }),
                  ] },
                { id: 'n10', duration: 14.0, dialogue: [vo(P9[10], 0.4)],
                  actions: [
                      { target: 'model', do: 'hide', at: 0.2, for: 0.5 },
                      { target: 'vario', do: 'show', at: 0.7, for: 0.4 },
                      ...build('vario', ['vg_h', 'vg_xl'], 0.9, { gap: 0.2, span: 0.4 }),
                      ...reveal('vario', 'vg_curve', 4.0, { span: 1.2 }),
                      ...build('vario', ['vg_n', 'vg_n_lead'], 6.0, { gap: 0.1 }),
                      ...build('vario', ['vg_rng', 'vg_r', 'vg_r_lead'], 9.0,
                               { gap: 0.12, span: 0.35 }),
                      ...build('vario', ['vg_sill', 'vg_s'], 11.6,
                               { gap: 0.15, span: 0.35 }),
                  ] },
                { id: 'n11', duration: 11.0, dialogue: [vo(P9[11], 0.4)],
                  actions: [
                      { target: 'vario', do: 'hide', at: 0.2, for: 0.5 },
                      { target: 'ellipse', do: 'show', at: 0.7, for: 0.4 },
                      ...reveal('ellipse', 'el_h', 0.9, { span: 0.4 }),
                      ...pop('ellipse', 'el_bad', 4.0, { span: 0.5, overshoot: 0.1 }),
                      ...build('ellipse', ['el_bl', 'el_bl_lead'], 4.8, { gap: 0.1 }),
                      ...reveal('ellipse', 'el_c', 7.5, { span: 0.5 }),
                  ] },
            ],
        },
        {
            id: 'class', palette: 'geo',
            background: { color: '#0d1420' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('class', { alpha: 1 })],
            shots: [
                { id: 'n12', duration: 12.0, dialogue: [vo(P9[12], 0.5)],
                  actions: [
                      ...reveal('class', 'cl_h', 0.3, { span: 0.4 }),
                      ...build('class', classIds(), 1.2, { gap: 0.018, span: 0.22 }),
                      ...build('class', ['cl_k0', 'cl_k0n', 'cl_k1', 'cl_k1n',
                                         'cl_k2', 'cl_k2n'], 4.0,
                               { gap: 0.12, span: 0.3 }),
                      ...reveal('class', 'cl_c', 8.4, { span: 0.5 }),
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
            ],
            shots: [
                { id: 'n13', duration: 3.8, framing: 'wide', on: 'juma',
                  dialogue: [says('juma', P9[13], 0.5)],
                  actions: [
                      { target: 'zawadi', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'juma', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'juma', do: 'pose', pose: 'ask', at: 0.3, for: 0.5 },
                      { target: 'zawadi', do: 'play', action: 'breathe' },
                      { target: 'juma', do: 'play', action: 'breathe' },
                      ...blinks('zawadi', 3.8, 191), ...blinks('juma', 3.8, 193),
                  ] },
                { id: 'n14', duration: 10.0, framing: 'wide', on: 'zawadi',
                  dialogue: [says('zawadi', P9[14], 0.4)],
                  actions: [
                      { target: 'juma', do: 'pose', pose: 'stand', at: 0.2, for: 0.5 },
                      { target: 'zawadi', do: 'pose', pose: 'present', at: 0.4, for: 0.6 },
                      { target: 'zawadi', do: 'play', action: 'breathe' },
                      { target: 'juma', do: 'play', action: 'breathe' },
                      ...blinks('zawadi', 11.0, 197), ...blinks('juma', 11.0, 199),
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

    return {
        version: 'jirex.film/1',
        meta: META('Drilling and resource estimation'),
        voices: VOICES,
        palettes: { geo: GEO_PALETTE },
        characters,
        scenes,
    };
}
