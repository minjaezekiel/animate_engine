/**
 * Part 5 — GIS and remote sensing.
 *
 * Why a sensor sees what an eye cannot, what the alteration halo is for, and
 * what a prospectivity map is and is not. The spectral curves are drawn from
 * the real absorption features: kaolinite at 2.2 micrometres, iron oxide in
 * the blue and near 0.9, and vegetation's red edge at 0.7. That is the point
 * of the slide, so the dips go where they actually are.
 */
import {
    GROUND_Y, L, M, Q, TYPE, Z, arrowPath, build, captionPart, conceal, effect,
    ellipsePart, labelParts, pathPart, poly, pop, ramp, rectPart, reveal, scale,
    smooth, textPart, titleParts,
} from '../lib/diagram.mjs';
import {
    CHARACTERS, GEO_PALETTE, META, SERIES, VOICES, endCard, offstage, says, vo,
} from '../lib/series.mjs';
import { blinks, board, castBoard, rng } from './common.mjs';

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const TALK_Y = Math.round(GROUND_Y - 274 * 1.5);

const P5 = [
    /* 0 */ 'One geologist maps a few square kilometres in a day. A satellite images a '
          + 'hundred thousand.',
    /* 1 */ 'Remote sensing works because minerals absorb light at particular '
          + 'wavelengths. Rock looks grey to us. To a sensor, it has a fingerprint.',
    /* 2 */ 'Landsat 8 and 9 give eleven bands at thirty metres, and cost nothing. '
          + 'Sentinel-2 gives thirteen bands at ten metres. And ASTER carries the '
          + 'short-wave infrared that actually identifies alteration minerals.',
    /* 3 */ 'Hydrothermal fluid does not only deposit gold. It rots the rock around it, '
          + 'for tens or hundreds of metres. That is the alteration halo — and the '
          + 'halo is a far bigger target than the vein.',
    /* 4 */ 'The halo has a mineralogy you can see from orbit. Clays, sericite, iron '
          + 'oxides, silica. You find them with band ratios: divide one band by '
          + 'another, so the ratio spikes exactly where that mineral absorbs.',
    /* 5 */ 'Then structure. A digital elevation model gives you topography, and '
          + 'topography remembers geology — because faults erode into valleys, and '
          + 'hard beds stand up as ridges.',
    /* 6 */ 'Shade the model from several directions, and the lineaments come out.',
    /* 7 */ 'And intersections matter. Where two structures cross, the rock is more '
          + 'broken, so fluid moved more easily, so gold is likelier. A great many '
          + 'deposits sit on intersections.',
    /* 8 */ 'Now GIS earns its name. Every dataset is a layer. Geology, alteration, '
          + 'lineaments, stream gold, soil gold, magnetics, old workings. Stack them '
          + 'in register.',
    /* 9 */ 'Score each layer for how much it predicts, weight it, add them up, and you '
          + 'have a prospectivity map. Not an answer. A ranking.',
    /*10 */ 'So the computer picks the target?',
    /*11 */ 'The computer ranks the ground. Then you go and stand on it.',
    /*12 */ 'Every anomaly is a hypothesis until somebody ground-truths it. Half of them '
          + 'turn out to be a dirt road, a dry lake bed, or a roof.',
];

// --- board: spectral fingerprints ------------------------------------------

const WX = scale(0.4, 2.5, 190, 960);      // wavelength, micrometres
const WY = scale(0, 1, 1140, 640);         // reflectance

/** Real absorption features, which is the only reason this slide is worth drawing. */
const CURVES = [
    ['kaolinite', 'quartz', [[0.4, 0.55], [0.7, 0.72], [1.1, 0.78], [1.6, 0.80],
                             [2.0, 0.76], [2.2, 0.30], [2.3, 0.62], [2.5, 0.58]]],
    ['iron oxide', 'fluid', [[0.4, 0.08], [0.55, 0.16], [0.7, 0.44], [0.86, 0.52],
                             [0.95, 0.38], [1.4, 0.56], [2.0, 0.60], [2.5, 0.58]]],
    ['vegetation', 'greenstone', [[0.4, 0.06], [0.55, 0.14], [0.68, 0.07], [0.76, 0.62],
                                  [1.1, 0.60], [1.45, 0.26], [1.9, 0.30], [2.5, 0.12]]],
];

function boardSpectra() {
    const parts = [
        textPart('sp_h', 'rock has a fingerprint', {
            at: [540, 500], font: TYPE.heading, fill: 'ink' }),
        pathPart('sp_ax', `${M(190, 1140)} ${L(960, 1140)}`,
            { stroke: 'dim', strokeWidth: 3, z: 10 }),
        pathPart('sp_ay', `${M(190, 1140)} ${L(190, 640)}`,
            { stroke: 'dim', strokeWidth: 3, z: 10 }),
        textPart('sp_xl', 'wavelength  μm', { at: [575, 1230],
            font: TYPE.small, fill: 'dim', z: 10 }),
        ...[0.5, 1.0, 1.5, 2.0, 2.5].map((v, i) => textPart(`sp_x${i}`, String(v), {
            at: [WX(v), 1186], font: TYPE.small, fill: 'dim', z: 10 })),
        textPart('sp_yl', 'reflectance', { at: [120, 890], font: TYPE.small,
            fill: 'dim', align: 'center', z: 10 }),
    ];
    CURVES.forEach(([name, color, pts], i) => {
        parts.push(pathPart(`sp_c${i}`, smooth(pts.map(([w, r]) => [WX(w), WY(r)])),
            { stroke: color, strokeWidth: 6, z: 12 }));
        parts.push(textPart(`sp_n${i}`, name, {
            at: [980, WY(pts[pts.length - 1][1])], font: TYPE.small, fill: color,
            align: 'right', maxWidth: 260, z: 12 }));
    });
    // The feature that matters: kaolinite's 2.2 um absorption.
    parts.push(
        pathPart('sp_mark', `${M(WX(2.2), WY(0.30) + 26)} ${L(WX(2.2), WY(0.80))}`,
            { stroke: 'gold', strokeWidth: 2, z: 13 }),
        ...labelParts('sp_ml', 'clay absorbs here — 2.2 μm',
            [1004, 596], [WX(2.2), WY(0.46)]),
        captionPart('sp_c', 'that dip is what a band ratio looks for'),
    );
    return board('spec', parts);
}

// --- board: the sensors ----------------------------------------------------

const SATS = [
    ['s1', 'Landsat 8 / 9', '11 bands  ·  30 m', 'free, 16-day repeat, since 1972'],
    ['s2', 'Sentinel-2', '13 bands  ·  10 m', 'free, 5-day repeat, sharpest of the three'],
    ['s3', 'ASTER', '14 bands  ·  15–90 m', 'the short-wave infrared that names clays'],
];

function boardSats() {
    const parts = [textPart('st_h', 'what you can get for nothing', {
        at: [540, 500], font: TYPE.heading, fill: 'ink', maxWidth: 940 })];
    SATS.forEach(([id, name, spec, note], i) => {
        const y = 650 + i * 212;
        parts.push(
            rectPart(id, 900, 186, { at: [540, y], fill: 'panel',
                stroke: '#2a3b52', strokeWidth: 2, z: 10 }),
            textPart(`${id}_n`, name, { at: [130, y - 42], font: `700 38px ${FONT}`,
                fill: 'ink', align: 'left', maxWidth: 520, z: 12 }),
            textPart(`${id}_s`, spec, { at: [950, y - 42], font: `700 34px ${FONT}`,
                fill: 'gold', align: 'right', maxWidth: 380, z: 12 }),
            textPart(`${id}_t`, note, { at: [130, y + 44], font: TYPE.small,
                fill: 'dim', align: 'left', maxWidth: 820, z: 12 }),
        );
    });
    return board('sats', parts);
}
const satIds = (id) => [id, `${id}_n`, `${id}_s`, `${id}_t`];

// --- board: the alteration halo --------------------------------------------

function boardHalo() {
    const cx = 540;
    return board('halo', [
        textPart('ha_h', 'the halo is the target', {
            at: [540, 500], font: TYPE.heading, fill: 'ink' }),
        rectPart('ha_rock', 900, 560, { at: [cx, 880], fill: 'greenstone',
            alpha: 1, z: 8 }),
        // The halo: wide, soft, and the thing a satellite can actually see.
        rectPart('ha_halo', 520, 560, { at: [cx, 880], fill: '#8a7a53', z: 9 }),
        rectPart('ha_halo2', 260, 560, { at: [cx, 880], fill: '#a8955f', z: 10 }),
        pathPart('ha_vein', `${M(cx, 601)} ${L(cx, 1159)}`,
            { stroke: 'quartz', strokeWidth: 26, lineCap: 'butt', z: 12 }),
        ...labelParts('ha_lv', 'the vein — 2 m wide', [1004, 560], [cx + 14, 700]),
        ...labelParts('ha_lh', 'the alteration halo — 200 m wide',
            [92, 1240], [cx - 200, 1060]),
        captionPart('ha_c', 'a hundred times the target, from orbit'),
    ]);
}

// --- board: band ratios ----------------------------------------------------

function boardRatio() {
    const r = rng(515);
    const parts = [
        textPart('ra_h', 'a band ratio', {
            at: [540, 500], font: TYPE.heading, fill: 'ink' }),
        rectPart('ra_a', 380, 380, { at: [300, 800], fill: '#4a4f52',
            stroke: '#2a3b52', strokeWidth: 3, z: 10 }),
        textPart('ra_al', 'one band  —  grey rock', { at: [300, 1020],
            font: TYPE.small, fill: 'dim', maxWidth: 380, z: 12 }),
        rectPart('ra_b', 380, 380, { at: [780, 800], fill: '#1d2a21',
            stroke: '#2a3b52', strokeWidth: 3, z: 10 }),
        textPart('ra_bl', 'band 6 ÷ band 7  —  clay', { at: [780, 1020],
            font: TYPE.small, fill: 'dim', maxWidth: 380, z: 12 }),
        pathPart('ra_ar', arrowPath([508, 800], [572, 800], { head: 22 }),
            { fill: 'gold', stroke: 'gold', strokeWidth: 5, z: 12 }),
        textPart('ra_f', 'SWIR 1  ÷  SWIR 2', { at: [540, 1140],
            font: `700 40px ${FONT}`, fill: 'gold', maxWidth: 900 }),
        captionPart('ra_c', 'the ratio spikes exactly where the mineral absorbs'),
    ];
    // Texture in the left panel: noise that means nothing.
    for (let i = 0; i < 26; i++) {
        parts.push(ellipsePart(`ra_n${i}`, 10 + r() * 22, 8 + r() * 18, {
            at: [120 + r() * 360, 620 + r() * 360], fill: '#565c5e', alpha: 1, z: 11 }));
    }
    // The anomaly in the right panel: three blobs, one bright.
    [[740, 740, 46], [820, 860, 32], [756, 900, 22]].forEach(([x, y, rad], i) => {
        parts.push(ellipsePart(`ra_h${i}`, rad, rad * 0.8, { at: [x, y],
            fill: i === 0 ? 'gold' : 'sulphide', z: 12,
            glow: { blur: 26, color: '#ffc64d' } }));
    });
    return board('ratio', parts);
}

// --- board: the DEM and its lineaments -------------------------------------

function boardDem() {
    const r = rng(606);
    const parts = [
        textPart('dm_h', 'topography remembers geology', {
            at: [540, 500], font: TYPE.heading, fill: 'ink', maxWidth: 940 }),
        rectPart('dm_bg', 900, 600, { at: [540, 880], fill: '#2a3340', alpha: 1, z: 8 }),
    ];
    // Ridges: parallel wavy bands, the hillshade.
    for (let i = 0; i < 9; i++) {
        const y = 620 + i * 66;
        parts.push(pathPart(`dm_r${i}`, `${M(96, y)} ${Q(320, y - 26 - r() * 20, 540, y)} `
            + `${Q(760, y + 24 + r() * 18, 984, y - 10)}`,
            { stroke: i % 2 ? '#3b4857' : '#47566a', strokeWidth: 16, alpha: 1, z: 9 }));
    }
    // Two lineament sets, crossing.
    const setA = [[130, 1140, 470, 600], [330, 1160, 670, 620], [540, 1160, 880, 620]];
    const setB = [[110, 760, 980, 1020], [130, 640, 960, 880]];
    setA.forEach(([x0, y0, x1, y1], i) => parts.push(
        pathPart(`dm_a${i}`, `${M(x0, y0)} ${L(x1, y1)}`,
            { stroke: 'structure', strokeWidth: 5, z: 12 })));
    setB.forEach(([x0, y0, x1, y1], i) => parts.push(
        pathPart(`dm_b${i}`, `${M(x0, y0)} ${L(x1, y1)}`,
            { stroke: '#f08aa0', strokeWidth: 4, z: 12 })));
    // Where they cross.
    [[430, 862], [628, 905]].forEach(([x, y], i) => parts.push(
        ellipsePart(`dm_x${i}`, 38, 38, { at: [x, y], fill: null, stroke: 'gold',
            strokeWidth: 5, z: 14 })));
    parts.push(
        ...labelParts('dm_l', 'two structures crossing', [1004, 1230], [648, 940]),
        captionPart('dm_c', 'broken rock lets fluid move'),
    );
    return board('dem', parts);
}

// --- board: the GIS stack --------------------------------------------------

const LAYERS = [
    ['geology', 'greenstone'], ['alteration', 'sulphide'], ['lineaments', 'structure'],
    ['soil gold', 'gold'], ['magnetics', 'water'],
];

function boardStack() {
    const parts = [
        textPart('sk_h', 'stack them in register', {
            at: [540, 496], font: TYPE.heading, fill: 'ink', maxWidth: 940 }),
    ];
    LAYERS.forEach(([name, color], i) => {
        const y = 660 + i * 110;
        // A parallelogram reads as a map sheet seen at an angle.
        const d = poly([[260, y], [820, y - 54], [880, y + 30], [320, y + 84]], true);
        parts.push(
            pathPart(`sl${i}`, d, { fill: color, alpha: 0, stroke: '#0d1420',
                strokeWidth: 3, z: 10 + i }),
            textPart(`sl${i}_n`, name, { at: [240, y + 36], font: TYPE.small,
                fill: 'ink', align: 'right', maxWidth: 200, z: 20 }),
        );
    });
    parts.push(captionPart('sk_c', 'weight each one for how much it predicts'));
    return board('stack', parts);
}

function boardProspect() {
    const parts = [
        textPart('pr_h', 'a prospectivity map', {
            at: [540, 500], font: TYPE.heading, fill: 'ink' }),
        rectPart('pr_bg', 880, 600, { at: [540, 880], fill: '#16241f',
            stroke: '#2a3b52', strokeWidth: 3, alpha: 1, z: 8 }),
    ];
    const r = rng(717);
    // Background warmth, then the three that matter.
    for (let i = 0; i < 22; i++) {
        parts.push(ellipsePart(`pr_n${i}`, 30 + r() * 50, 24 + r() * 40, {
            at: [160 + r() * 760, 640 + r() * 480], fill: '#2d4030', alpha: 1, z: 9 }));
    }
    [[330, 760], [690, 880], [470, 1070]].forEach(([x, y], i) => parts.push(
        ellipsePart(`pr_t${i}`, 52 - i * 8, 42 - i * 6, { at: [x, y],
            fill: i === 0 ? 'gold' : i === 1 ? '#e0a63f' : 'sulphide', z: 12,
            glow: { blur: 34, color: '#ffc64d' } }),
        textPart(`pr_t${i}_n`, String(i + 1), { at: [x, y], font: `800 34px ${FONT}`,
            fill: '#0d1420', z: 13 })));
    parts.push(
        textPart('pr_s', 'not an answer — a ranking', {
            at: [540, 1250], font: TYPE.caption, fill: 'gold', maxWidth: 940, z: 14 }),
    );
    return board('prospect', parts);
}

// --- the film --------------------------------------------------------------

export function partFive() {
    const card = endCard('Next: the gold that has already done the hard work.');
    const boards = [boardSpectra(), boardSats(), boardHalo(), boardRatio(), boardDem(),
                    boardStack(), boardProspect(), board('card', card.parts)];
    const characters = { ...CHARACTERS };
    for (const b of boards) characters[b.name] = effect(b.parts, { palette: 'geo' });
    characters.title_b = effect(titleParts(`${SERIES.toUpperCase()}  ·  PART 5`,
        'From orbit'), { palette: 'geo' });

    const scenes = [
        {
            id: 'open', palette: 'geo',
            background: { color: '#0d1420' },
            transitionIn: { kind: 'fade', from: '#000000', duration: 0.9 },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('title_b', { alpha: 1, z: 60 }),
                   castBoard('spec'), castBoard('sats')],
            shots: [
                { id: 'o0', duration: 7.5, dialogue: [vo(P5[0], 0.7)],
                  actions: build('title_b', ['kicker', 'title'], 0.4,
                                 { gap: 0.3, span: 0.5 }) },
                { id: 'o1', duration: 11.5, dialogue: [vo(P5[1], 0.4)],
                  actions: [
                      ...conceal('title_b', 'kicker', 0.2, { span: 0.4 }),
                      ...conceal('title_b', 'title', 0.3, { span: 0.4 }),
                      { target: 'spec', do: 'show', at: 0.8, for: 0.4 },
                      ...build('spec', ['sp_h', 'sp_ax', 'sp_ay', 'sp_xl', 'sp_x0',
                                        'sp_x1', 'sp_x2', 'sp_x3', 'sp_x4', 'sp_yl'],
                               1.0, { gap: 0.06, span: 0.3 }),
                      ...build('spec', ['sp_c0', 'sp_n0'], 3.0, { gap: 0.15, span: 0.5 }),
                      ...build('spec', ['sp_c1', 'sp_n1'], 4.2, { gap: 0.15, span: 0.5 }),
                      ...build('spec', ['sp_c2', 'sp_n2'], 5.4, { gap: 0.15, span: 0.5 }),
                      ...build('spec', ['sp_mark', 'sp_ml', 'sp_ml_lead'], 7.2,
                               { gap: 0.12, span: 0.35 }),
                      ...reveal('spec', 'sp_c', 9.2, { span: 0.5 }),
                  ] },
                { id: 'o2', duration: 16.5, dialogue: [vo(P5[2], 0.4)],
                  actions: [
                      { target: 'spec', do: 'hide', at: 0.2, for: 0.5 },
                      { target: 'sats', do: 'show', at: 0.7, for: 0.4 },
                      ...reveal('sats', 'st_h', 0.9, { span: 0.4 }),
                      ...build('sats', satIds('s1'), 1.8, { gap: 0.1, span: 0.35 }),
                      ...build('sats', satIds('s2'), 6.4, { gap: 0.1, span: 0.35 }),
                      ...build('sats', satIds('s3'), 10.4, { gap: 0.1, span: 0.35 }),
                  ] },
            ],
        },
        {
            id: 'halo', palette: 'geo',
            background: { color: '#0d1420' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('halo', { alpha: 1 }), castBoard('ratio')],
            shots: [
                { id: 'h0', duration: 15.5, dialogue: [vo(P5[3], 0.5)],
                  actions: [
                      ...reveal('halo', 'ha_h', 0.4, { span: 0.4 }),
                      ...reveal('halo', 'ha_vein', 1.2, { span: 0.5 }),
                      ...build('halo', ['ha_lv', 'ha_lv_lead'], 1.9, { gap: 0.1 }),
                      ...reveal('halo', 'ha_halo', 6.0, { span: 0.8, to: 0.75 }),
                      ...reveal('halo', 'ha_halo2', 6.6, { span: 0.8, to: 0.85 }),
                      ...build('halo', ['ha_lh', 'ha_lh_lead'], 8.0, { gap: 0.1 }),
                      ...reveal('halo', 'ha_c', 11.5, { span: 0.5 }),
                  ] },
                { id: 'h1', duration: 17.5, dialogue: [vo(P5[4], 0.4)],
                  actions: [
                      { target: 'halo', do: 'hide', at: 0.2, for: 0.5 },
                      { target: 'ratio', do: 'show', at: 0.7, for: 0.4 },
                      ...build('ratio', ['ra_h', 'ra_a', 'ra_al'], 0.9,
                               { gap: 0.2, span: 0.4 }),
                      ...reveal('ratio', 'ra_f', 5.0, { span: 0.4 }),
                      ...reveal('ratio', 'ra_ar', 6.2, { span: 0.4 }),
                      ...build('ratio', ['ra_b', 'ra_bl'], 7.0, { gap: 0.2, span: 0.4 }),
                      ...build('ratio', ['ra_h0', 'ra_h1', 'ra_h2'], 9.4,
                               { gap: 0.3, span: 0.4, how: pop }),
                      ...reveal('ratio', 'ra_c', 13.4, { span: 0.5 }),
                  ] },
            ],
        },
        {
            id: 'dem', palette: 'geo',
            background: { color: '#0d1420' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('dem', { alpha: 1 })],
            shots: [
                { id: 'd0', duration: 14.5, dialogue: [vo(P5[5], 0.5)],
                  actions: reveal('dem', 'dm_h', 0.4, { span: 0.4 }) },
                { id: 'd1', duration: 6.0, dialogue: [vo(P5[6], 0.4)],
                  actions: [
                      ...build('dem', ['dm_a0', 'dm_a1', 'dm_a2'], 0.5,
                               { gap: 0.25, span: 0.4 }),
                      ...build('dem', ['dm_b0', 'dm_b1'], 2.0, { gap: 0.25, span: 0.4 }),
                  ] },
                { id: 'd2', duration: 14.5, dialogue: [vo(P5[7], 0.4)],
                  actions: [
                      ...build('dem', ['dm_x0', 'dm_x1'], 3.0,
                               { gap: 0.4, span: 0.4, how: pop }),
                      ...build('dem', ['dm_l', 'dm_l_lead'], 4.4, { gap: 0.1 }),
                      ...reveal('dem', 'dm_c', 9.0, { span: 0.5 }),
                  ] },
            ],
        },
        {
            id: 'stack', palette: 'geo',
            background: { color: '#0d1420' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('stack', { alpha: 1 }), castBoard('prospect')],
            shots: [
                { id: 'k0', duration: 15.5, dialogue: [vo(P5[8], 0.5)],
                  actions: [
                      ...reveal('stack', 'sk_h', 0.4, { span: 0.4 }),
                      ...LAYERS.flatMap((_, i) => [
                          ...reveal('stack', `sl${i}`, 1.4 + i * 1.5,
                                    { span: 0.45, to: 0.88 }),
                          ...reveal('stack', `sl${i}_n`, 1.6 + i * 1.5, { span: 0.3 }),
                      ]),
                      ...reveal('stack', 'sk_c', 10.4, { span: 0.5 }),
                  ] },
                { id: 'k1', duration: 12.5, dialogue: [vo(P5[9], 0.4)],
                  actions: [
                      { target: 'stack', do: 'hide', at: 0.2, for: 0.6 },
                      { target: 'prospect', do: 'show', at: 0.8, for: 0.5 },
                      ...reveal('prospect', 'pr_h', 1.0, { span: 0.4 }),
                      ...build('prospect', ['pr_t0', 'pr_t0_n'], 3.0,
                               { gap: 0.1, span: 0.4, how: pop }),
                      ...build('prospect', ['pr_t1', 'pr_t1_n'], 4.0,
                               { gap: 0.1, span: 0.4, how: pop }),
                      ...build('prospect', ['pr_t2', 'pr_t2_n'], 5.0,
                               { gap: 0.1, span: 0.4, how: pop }),
                      ...reveal('prospect', 'pr_s', 7.4, { span: 0.5 }),
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
                { id: 't0', duration: 4.2, framing: 'wide', on: 'juma',
                  dialogue: [says('juma', P5[10], 0.5)],
                  actions: [
                      { target: 'zawadi', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'juma', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'juma', do: 'pose', pose: 'ask', at: 0.3, for: 0.5 },
                      { target: 'zawadi', do: 'play', action: 'breathe' },
                      { target: 'juma', do: 'play', action: 'breathe' },
                      ...blinks('zawadi', 4.2, 111), ...blinks('juma', 4.2, 113),
                  ] },
                { id: 't1', duration: 5.8, framing: 'wide', on: 'zawadi',
                  dialogue: [says('zawadi', P5[11], 0.4)],
                  actions: [
                      { target: 'juma', do: 'pose', pose: 'stand', at: 0.2, for: 0.5 },
                      { target: 'zawadi', do: 'pose', pose: 'present', at: 0.4, for: 0.6 },
                      { target: 'zawadi', do: 'play', action: 'breathe' },
                      { target: 'juma', do: 'play', action: 'breathe' },
                      ...blinks('zawadi', 5.8, 117), ...blinks('juma', 5.8, 119),
                  ] },
                { id: 't2', duration: 11.5, framing: 'wide', on: 'zawadi',
                  dialogue: [vo(P5[12], 0.4)],
                  actions: [
                      { target: 'zawadi', do: 'pose', pose: 'stand', at: 0.6, for: 0.6 },
                      { target: 'zawadi', do: 'play', action: 'breathe' },
                      { target: 'juma', do: 'play', action: 'breathe' },
                      ...blinks('zawadi', 11.5, 123), ...blinks('juma', 11.5, 127),
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
        meta: META('GIS and remote sensing'),
        voices: VOICES,
        palettes: { geo: GEO_PALETTE },
        characters,
        scenes,
    };
}
