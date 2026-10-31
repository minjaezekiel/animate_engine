/**
 * Part 8 — Electrical and electromagnetic surveys.
 *
 * Resistivity, induced polarisation, and why gold is found by looking for
 * what it precipitated with. The depth rule of thumb (a fifth to a third of
 * the array length) and the warning about the bottom of an inversion are the
 * two things a first-year geophysicist gets wrong, so both get their own beat.
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

const P8 = [
    /* 0 */ 'Magnetics maps the architecture. Electrical methods go after the ore '
          + 'minerals themselves.',
    /* 1 */ 'Push a current into the ground between two electrodes, measure the voltage '
          + 'between two others, and you get resistivity — how hard the ground is '
          + 'to push current through.',
    /* 2 */ 'A fault zone full of clay and water is conductive. A silicified, '
          + 'quartz-flooded vein is resistive. In gold systems the resistive high is '
          + 'often the vein itself.',
    /* 3 */ 'Then the better trick. Cut the current, and watch the voltage.',
    /* 4 */ 'It does not drop to zero. It decays — because the ground stored '
          + 'charge. That is induced polarisation. And what stores charge best is '
          + 'disseminated metallic sulphides: pyrite, arsenopyrite, chalcopyrite.',
    /* 5 */ 'Gold itself is invisible to every geophysical method ever built. There is '
          + 'far too little of it. But the sulphides it precipitated with are not '
          + 'invisible, and chargeability maps those directly.',
    /* 6 */ 'Geometry decides what you can see. Electrodes are laid out in an array, '
          + 'and the rule is blunt: depth of investigation is roughly a fifth to a '
          + 'third of the array length.',
    /* 7 */ 'Want to see two hundred metres down? Lay out a kilometre.',
    /* 8 */ 'The raw result is a pseudo-section — measurements plotted at a '
          + 'made-up depth. It is not a picture of the ground, and reading it as one is '
          + 'the classic beginner mistake.',
    /* 9 */ 'Inversion fixes that. A computer builds a model of the subsurface, predicts '
          + 'what the survey would have read, compares it with what was actually read, '
          + 'and adjusts until the two agree.',
    /*10 */ 'Out comes a model you can draw a drillhole on. But many different models '
          + 'fit the same data, so you constrain it with geology — and never trust '
          + 'a feature at the very bottom edge.',
    /*11 */ 'So which survey do you believe?',
    /*12 */ 'The one that agrees with the others.',
    /*13 */ 'A magnetic low on an altered shear. A resistivity high where it is '
          + 'silicified. A chargeability high where the sulphides sit. Arsenic in the '
          + 'soil above it. One of those is a maybe. All four is a drill target.',
];

// --- board: the array and what it measures ---------------------------------

function boardArray() {
    const parts = [
        textPart('ar_h', 'current in, voltage out', {
            at: [540, 500], font: TYPE.heading, fill: 'ink' }),
        rectPart('ar_gnd', 900, 520, { at: [540, 940], fill: '#3b4332',
            alpha: 1, z: 8 }),
        pathPart('ar_sky', `${M(90, 680)} ${L(990, 680)}`,
            { stroke: 'ink', strokeWidth: 3, alpha: 1, z: 14 }),
    ];
    // Four electrodes: current pair outside, potential pair inside.
    const ELEC = [[210, 'C1', 'structure'], [420, 'P1', 'gold'],
                  [660, 'P2', 'gold'], [870, 'C2', 'structure']];
    ELEC.forEach(([x, label, color], i) => {
        parts.push(
            pathPart(`ar_e${i}`, `${M(x, 640)} ${L(x, 730)}`,
                { stroke: color, strokeWidth: 9, lineCap: 'butt', z: 15 }),
            textPart(`ar_e${i}l`, label, { at: [x, 606], font: TYPE.small,
                fill: color, z: 15 }),
        );
    });
    // Current flow: nested arcs between C1 and C2.
    for (let i = 0; i < 5; i++) {
        const depth = 120 + i * 78;
        parts.push(pathPart(`ar_c${i}`,
            `${M(210, 690)} ${Q(540, 690 + depth * 1.6, 870, 690)}`,
            { stroke: '#7fb4d8', strokeWidth: 3, z: 10 }));
    }
    parts.push(
        ...labelParts('ar_l', 'the deeper the current goes, the longer the array',
            [540, 1300], null),
        captionPart('ar_cap', 'resistivity: how hard the ground is to push through',
            { y: 1250 }),
    );
    return board('array', parts);
}

// --- board: what resistivity sees ------------------------------------------

function boardRes() {
    return board('res', [
        textPart('rs_h', 'conductive and resistive', {
            at: [540, 500], font: TYPE.heading, fill: 'ink' }),
        rectPart('rs_bg', 900, 580, { at: [540, 920], fill: 'greenstone',
            alpha: 1, z: 8 }),
        // A clay-filled fault: conductive.
        pathPart('rs_fault', `${M(250, 1200)} ${Q(300, 920, 240, 640)}`,
            { stroke: '#3f6f8a', strokeWidth: 60, lineCap: 'butt', z: 10 }),
        ...labelParts('rs_fl', 'clay and water — conductive', [92, 600], [250, 700]),
        // A silicified vein: resistive.
        pathPart('rs_vein', `${M(760, 1200)} ${Q(700, 920, 780, 640)}`,
            { stroke: 'quartz', strokeWidth: 44, lineCap: 'butt', z: 10 }),
        ...labelParts('rs_vl', 'quartz flooding — resistive', [1004, 600],
            [780, 700]),
        captionPart('rs_c', 'in gold systems, the high is often the vein'),
    ]);
}

// --- board: the IP decay ---------------------------------------------------

function boardIp() {
    const x0 = 180;
    const x1 = 960;
    const y0 = 1120;
    return board('ip', [
        textPart('ip_h', 'cut the current, and watch', {
            at: [540, 500], font: TYPE.heading, fill: 'ink', maxWidth: 940 }),
        pathPart('ip_ax', `${M(x0, y0)} ${L(x1, y0)}`,
            { stroke: 'dim', strokeWidth: 3, z: 10 }),
        pathPart('ip_ay', `${M(x0, y0)} ${L(x0, 620)}`,
            { stroke: 'dim', strokeWidth: 3, z: 10 }),
        // Current on, then off.
        pathPart('ip_on', `${M(x0, y0)} ${L(x0, 720)} ${L(480, 720)} ${L(480, y0)}`,
            { stroke: 'water', strokeWidth: 6, z: 12 }),
        textPart('ip_onl', 'current on', { at: [330, 676], font: TYPE.small,
            fill: 'water', maxWidth: 300, z: 12 }),
        // The decay, which is the whole point.
        pathPart('ip_dec', smooth([[480, 760], [560, 850], [660, 940], [780, 1010],
                                   [900, 1060], [955, 1080]]),
            { stroke: 'gold', strokeWidth: 7, z: 13 }),
        ...labelParts('ip_dl', 'the ground gives the charge back', [1004, 870],
            [700, 964]),
        textPart('ip_t', 'time', { at: [570, 1180], font: TYPE.small,
            fill: 'dim', z: 10 }),
        textPart('ip_v', 'voltage', { at: [120, 870], font: TYPE.small,
            fill: 'dim', z: 10 }),
        captionPart('ip_c', 'that decay is chargeability'),
    ]);
}

// --- board: chargeability over the sulphides -------------------------------

function boardCharge() {
    const r = rng(808);
    const parts = [
        textPart('cg_h', 'you find gold by its companions', {
            at: [540, 496], font: TYPE.heading, fill: 'ink', maxWidth: 940 }),
        rectPart('cg_bg', 900, 560, { at: [540, 930], fill: '#223027',
            stroke: '#2a3b52', strokeWidth: 3, alpha: 1, z: 8 }),
        // The chargeable body at depth.
        ellipsePart('cg_blob', 210, 130, { at: [560, 1000], fill: '#8a7a4a', z: 10,
            glow: { blur: 50, color: '#b8a86a' } }),
        ...labelParts('cg_bl', 'disseminated sulphides — chargeable',
            [1004, 1260], [700, 1060]),
    ];
    for (let i = 0; i < 14; i++) {
        parts.push(ellipsePart(`cg_s${i}`, 7, 7, {
            at: [400 + r() * 320, 920 + r() * 160], fill: 'sulphide', z: 12 }));
    }
    for (let i = 0; i < 5; i++) {
        parts.push(ellipsePart(`cg_a${i}`, 5, 5, {
            at: [460 + r() * 200, 950 + r() * 110], fill: 'gold', z: 13,
            glow: { blur: 14, color: '#ffc64d' } }));
    }
    parts.push(
        ...labelParts('cg_al', 'the gold, invisible to every instrument',
            [92, 660], [520, 980]),
        captionPart('cg_c', 'too little of it to measure — ever', { y: 1310 }),
    );
    return board('charge', parts);
}
const chargeDots = () => [...Array.from({ length: 14 }, (_, i) => `cg_s${i}`)];

// --- board: array length and depth -----------------------------------------

function boardDepth() {
    const parts = [
        textPart('dp_h', 'how deep you can see', {
            at: [540, 500], font: TYPE.heading, fill: 'ink' }),
    ];
    [['a', 760, 300, '300 m array', '60–100 m deep'],
     ['b', 1020, 900, '1 km array', '200–330 m deep']].forEach(
        ([k, y, len, label, depth], i) => {
            const w = (len / 1000) * 820;
            parts.push(
                pathPart(`dp_${k}`, `${M(540 - w / 2, y)} ${L(540 + w / 2, y)}`,
                    { stroke: 'gold', strokeWidth: 10, lineCap: 'butt', z: 12 }),
                textPart(`dp_${k}l`, label, { at: [540, y - 44], font: TYPE.label,
                    fill: 'ink', maxWidth: 900, z: 12 }),
                // The lens of ground it actually senses.
                pathPart(`dp_${k}v`, `${M(540 - w / 2, y)} ${Q(540, y + w * 0.62, 540 + w / 2, y)} ${Z}`,
                    { fill: '#2f4a5c', alpha: 0, z: 10 }),
                textPart(`dp_${k}d`, depth, { at: [540, y + w * 0.3],
                    font: TYPE.small, fill: 'water', maxWidth: 700, z: 13 }),
            );
        });
    parts.push(captionPart('dp_c', 'a fifth to a third of the array length',
        { y: 1300 }));
    return board('depth', parts);
}
const depthIds = (k) => [`dp_${k}l`, `dp_${k}`, `dp_${k}v`, `dp_${k}d`];

// --- board: pseudo-section versus a model ----------------------------------

function boardInvert() {
    const r = rng(818);
    const parts = [
        textPart('iv_h', 'a pseudo-section is not geology', {
            at: [540, 496], font: TYPE.heading, fill: 'ink', maxWidth: 940 }),
        rectPart('iv_pa', 880, 250, { at: [540, 700], fill: '#1b2630',
            stroke: '#2a3b52', strokeWidth: 3, alpha: 1, z: 8 }),
        textPart('iv_pal', 'pseudo-section  —  plotted at a made-up depth', {
            at: [540, 850], font: TYPE.small, fill: 'dim', maxWidth: 900, z: 12 }),
        rectPart('iv_mb', 880, 250, { at: [540, 1060], fill: '#1b2630',
            stroke: 'gold', strokeWidth: 3, z: 8 }),
        textPart('iv_mbl', 'inverted model  —  something you can drill', {
            at: [540, 1210], font: TYPE.small, fill: 'gold', maxWidth: 900, z: 12 }),
    ];
    // The pseudo-section's characteristic inverted-V smear.
    for (let i = 0; i < 18; i++) {
        const t = i / 17;
        parts.push(ellipsePart(`iv_p${i}`, 26, 16, {
            at: [180 + t * 720, 626 + Math.abs(t - 0.5) * -180 + 110],
            fill: t > 0.32 && t < 0.68 ? 'sulphide' : '#32414e', alpha: 1, z: 10 }));
    }
    // The model: a compact body where the smear implied one.
    parts.push(ellipsePart('iv_body', 120, 54, { at: [540, 1050], fill: 'sulphide',
        z: 10, glow: { blur: 30, color: '#b8a86a' } }));
    parts.push(
        pathPart('iv_ar', arrowPath([540, 880], [540, 918], { head: 20 }),
            { fill: 'gold', stroke: 'gold', strokeWidth: 4, z: 12 }),
        ...labelParts('iv_warn', 'never trust the very bottom of an inversion',
            [540, 1300], null),
    );
    return board('invert', parts);
}

// --- board: everything agreeing --------------------------------------------

const AGREE = [
    ['magnetic low', 'structure'], ['resistivity high', 'quartz'],
    ['chargeability high', 'sulphide'], ['arsenic in soil', 'gold'],
];

function boardAgree() {
    const parts = [
        textPart('ag_h', 'four layers, one place', {
            at: [540, 496], font: TYPE.heading, fill: 'ink' }),
    ];
    AGREE.forEach(([name, color], i) => {
        const y = 630 + i * 118;
        const d = poly([[250, y], [830, y - 48], [880, y + 28], [300, y + 76]], true);
        parts.push(
            pathPart(`ag${i}`, d, { fill: color, alpha: 0, stroke: '#0d1420',
                strokeWidth: 3, z: 10 + i }),
            textPart(`ag${i}_n`, name, { at: [232, y + 32], font: TYPE.small,
                fill: 'ink', align: 'right', maxWidth: 200, z: 20 }),
        );
    });
    parts.push(
        // The drillhole, straight through the point they share.
        pathPart('ag_hole', `${M(575, 580)} ${L(575, 1240)}`,
            { stroke: 'gold', strokeWidth: 7, lineCap: 'butt', z: 30 }),
        ellipsePart('ag_tip', 14, 14, { at: [575, 1240], fill: 'gold', z: 31,
            glow: { blur: 26, color: '#ffc64d' } }),
        captionPart('ag_c', 'one of those is a maybe. Four is a target.'),
    );
    return board('agree', parts);
}

// --- the film --------------------------------------------------------------

export function partEight() {
    const card = endCard('Next: drilling it, and turning holes into a number.');
    const boards = [boardArray(), boardRes(), boardIp(), boardCharge(), boardDepth(),
                    boardInvert(), boardAgree(), board('card', card.parts)];
    const characters = { ...CHARACTERS };
    for (const b of boards) characters[b.name] = effect(b.parts, { palette: 'geo' });
    characters.title_b = effect(titleParts(`${SERIES.toUpperCase()}  ·  PART 8`,
        'Electrical methods'), { palette: 'geo' });

    const scenes = [
        {
            id: 'res', palette: 'geo',
            background: { color: '#0d1420' },
            transitionIn: { kind: 'fade', from: '#000000', duration: 0.9 },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('title_b', { alpha: 1, z: 60 }),
                   castBoard('array'), castBoard('res')],
            shots: [
                { id: 'e0', duration: 7.0, dialogue: [vo(P8[0], 0.7)],
                  actions: build('title_b', ['kicker', 'title'], 0.4,
                                 { gap: 0.3, span: 0.5 }) },
                { id: 'e1', duration: 15.0, dialogue: [vo(P8[1], 0.4)],
                  actions: [
                      ...conceal('title_b', 'kicker', 0.2, { span: 0.4 }),
                      ...conceal('title_b', 'title', 0.3, { span: 0.4 }),
                      { target: 'array', do: 'show', at: 0.8, for: 0.4 },
                      ...reveal('array', 'ar_h', 1.0, { span: 0.4 }),
                      ...build('array', ['ar_e0', 'ar_e0l', 'ar_e3', 'ar_e3l'], 2.0,
                               { gap: 0.15, span: 0.35 }),
                      ...build('array', ['ar_e1', 'ar_e1l', 'ar_e2', 'ar_e2l'], 4.4,
                               { gap: 0.15, span: 0.35 }),
                      ...build('array', ['ar_c0', 'ar_c1', 'ar_c2', 'ar_c3', 'ar_c4'],
                               6.6, { gap: 0.2, span: 0.4 }),
                      ...reveal('array', 'ar_cap', 10.8, { span: 0.5 }),
                  ] },
                { id: 'e2', duration: 13.5, dialogue: [vo(P8[2], 0.4)],
                  actions: [
                      { target: 'array', do: 'hide', at: 0.2, for: 0.5 },
                      { target: 'res', do: 'show', at: 0.7, for: 0.4 },
                      ...reveal('res', 'rs_h', 0.9, { span: 0.4 }),
                      ...reveal('res', 'rs_fault', 1.8, { span: 0.6 }),
                      ...build('res', ['rs_fl', 'rs_fl_lead'], 2.6, { gap: 0.1 }),
                      ...reveal('res', 'rs_vein', 6.0, { span: 0.6 }),
                      ...build('res', ['rs_vl', 'rs_vl_lead'], 6.8, { gap: 0.1 }),
                      ...reveal('res', 'rs_c', 10.4, { span: 0.5 }),
                  ] },
            ],
        },
        {
            id: 'ip', palette: 'geo',
            background: { color: '#0d1420' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('ip', { alpha: 1 }), castBoard('charge')],
            shots: [
                { id: 'e3', duration: 5.5, dialogue: [vo(P8[3], 0.5)],
                  actions: [
                      ...reveal('ip', 'ip_h', 0.3, { span: 0.4 }),
                      ...build('ip', ['ip_ax', 'ip_ay', 'ip_t', 'ip_v'], 0.8,
                               { gap: 0.1, span: 0.3 }),
                      ...build('ip', ['ip_on', 'ip_onl'], 1.8, { gap: 0.2, span: 0.4 }),
                  ] },
                { id: 'e4', duration: 17.0, dialogue: [vo(P8[4], 0.4)],
                  actions: [
                      ...reveal('ip', 'ip_dec', 1.0, { span: 1.1 }),
                      ...build('ip', ['ip_dl', 'ip_dl_lead'], 2.6, { gap: 0.1 }),
                      ...reveal('ip', 'ip_c', 8.0, { span: 0.5 }),
                  ] },
                { id: 'e5', duration: 16.0, dialogue: [vo(P8[5], 0.4)],
                  actions: [
                      { target: 'ip', do: 'hide', at: 0.2, for: 0.5 },
                      { target: 'charge', do: 'show', at: 0.7, for: 0.4 },
                      ...reveal('charge', 'cg_h', 0.9, { span: 0.4 }),
                      ...reveal('charge', 'cg_blob', 1.6, { span: 0.8, to: 0.85 }),
                      ...build('charge', chargeDots(), 2.6, { gap: 0.09, span: 0.25 }),
                      ...build('charge', ['cg_bl', 'cg_bl_lead'], 4.4, { gap: 0.1 }),
                      ...build('charge', ['cg_a0', 'cg_a1', 'cg_a2', 'cg_a3', 'cg_a4'],
                               8.0, { gap: 0.14, span: 0.3 }),
                      ...build('charge', ['cg_al', 'cg_al_lead'], 9.2, { gap: 0.1 }),
                      ...reveal('charge', 'cg_c', 12.4, { span: 0.5 }),
                  ] },
            ],
        },
        {
            id: 'geom', palette: 'geo',
            background: { color: '#0d1420' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('depth', { alpha: 1 })],
            shots: [
                { id: 'e6', duration: 16.0, dialogue: [vo(P8[6], 0.5)],
                  actions: [
                      ...reveal('depth', 'dp_h', 0.3, { span: 0.4 }),
                      ...build('depth', depthIds('a'), 4.0, { gap: 0.2, span: 0.4 }),
                      ...reveal('depth', 'dp_av', 5.0, { span: 0.7, to: 0.8 }),
                  ] },
                { id: 'e7', duration: 7.5, dialogue: [vo(P8[7], 0.4)],
                  actions: [
                      ...build('depth', depthIds('b'), 0.5, { gap: 0.2, span: 0.4 }),
                      ...reveal('depth', 'dp_bv', 1.5, { span: 0.7, to: 0.8 }),
                      ...reveal('depth', 'dp_c', 4.2, { span: 0.5 }),
                  ] },
            ],
        },
        {
            id: 'invert', palette: 'geo',
            background: { color: '#0d1420' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('invert', { alpha: 1 })],
            shots: [
                { id: 'e8', duration: 14.5, dialogue: [vo(P8[8], 0.5)],
                  actions: [
                      ...reveal('invert', 'iv_h', 0.3, { span: 0.4 }),
                      ...reveal('invert', 'iv_pal', 1.0, { span: 0.4 }),
                  ] },
                { id: 'e9', duration: 15.0, dialogue: [vo(P8[9], 0.4)],
                  actions: [
                      ...reveal('invert', 'iv_ar', 2.0, { span: 0.4 }),
                      ...reveal('invert', 'iv_mb', 2.6, { span: 0.5 }),
                      ...reveal('invert', 'iv_body', 4.0, { span: 0.6 }),
                      ...reveal('invert', 'iv_mbl', 4.8, { span: 0.4 }),
                  ] },
                { id: 'e10', duration: 11.5, dialogue: [vo(P8[10], 0.4)],
                  actions: reveal('invert', 'iv_warn', 7.0, { span: 0.5 }) },
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
                castBoard('agree', { alpha: 0, z: 40 }),
            ],
            shots: [
                { id: 'e11', duration: 4.0, framing: 'wide', on: 'juma',
                  dialogue: [says('juma', P8[11], 0.5)],
                  actions: [
                      { target: 'zawadi', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'juma', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'juma', do: 'pose', pose: 'ask', at: 0.3, for: 0.5 },
                      { target: 'zawadi', do: 'play', action: 'breathe' },
                      { target: 'juma', do: 'play', action: 'breathe' },
                      ...blinks('zawadi', 4.0, 171), ...blinks('juma', 4.0, 173),
                  ] },
                { id: 'e12', duration: 4.5, framing: 'wide', on: 'zawadi',
                  dialogue: [says('zawadi', P8[12], 0.4)],
                  actions: [
                      { target: 'juma', do: 'pose', pose: 'stand', at: 0.2, for: 0.5 },
                      { target: 'zawadi', do: 'pose', pose: 'present', at: 0.4, for: 0.6 },
                      { target: 'zawadi', do: 'play', action: 'breathe' },
                      { target: 'juma', do: 'play', action: 'breathe' },
                      ...blinks('zawadi', 4.5, 179), ...blinks('juma', 4.5, 181),
                  ] },
                { id: 'e13', duration: 20.0, dialogue: [vo(P8[13], 0.4)],
                  actions: [
                      { target: 'zawadi', do: 'hide', at: 0.3, for: 0.4 },
                      { target: 'juma', do: 'hide', at: 0.3, for: 0.4 },
                      { target: 'agree', do: 'show', at: 0.8, for: 0.5 },
                      ...reveal('agree', 'ag_h', 1.0, { span: 0.4 }),
                      ...AGREE.flatMap((_, i) => [
                          ...reveal('agree', `ag${i}`, 2.0 + i * 3.4,
                                    { span: 0.5, to: 0.88 }),
                          ...reveal('agree', `ag${i}_n`, 2.2 + i * 3.4, { span: 0.3 }),
                      ]),
                      ...reveal('agree', 'ag_hole', 16.0, { span: 0.8 }),
                      ...pop('agree', 'ag_tip', 16.8, { span: 0.4, overshoot: 0.2 }),
                      ...reveal('agree', 'ag_c', 17.4, { span: 0.5 }),
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
        meta: META('Electrical and IP surveys'),
        voices: VOICES,
        palettes: { geo: GEO_PALETTE },
        characters,
        scenes,
    };
}
