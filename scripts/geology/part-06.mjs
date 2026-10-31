/**
 * Part 6 — Placer deposits.
 *
 * Why gold concentrates where water slows, where to expect it, and why a
 * placer is a signpost as well as a deposit. The density comparison is drawn
 * to the real ratio: gold at 19.3 against quartz at 2.65 is 7.3 times, so
 * seven grains of quartz balance one of gold.
 */
import {
    GROUND_Y, L, M, Q, TYPE, Z, arrowPath, build, captionPart, conceal,
    curveArrow, effect, ellipsePart, glide, labelParts, pathPart, poly, pop, ramp,
    rectPart, reveal, textPart, titleParts,
} from '../lib/diagram.mjs';
import {
    CHARACTERS, GEO_PALETTE, META, SERIES, VOICES, endCard, offstage, says, vo,
} from '../lib/series.mjs';
import { blinks, board, castBoard, rng } from './common.mjs';

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const TALK_Y = Math.round(GROUND_Y - 274 * 1.5);

const P6 = [
    /* 0 */ 'Everything so far has been gold locked inside rock. Now the easy kind.',
    /* 1 */ 'A lode at surface does not stay there. Rain, frost, roots and acid break '
          + 'the quartz apart, and set the gold free.',
    /* 2 */ 'Gold does not weather. It does not rust, it does not dissolve, it does not '
          + 'break down. It simply becomes a loose grain of metal. And that metal is '
          + 'nineteen point three times as dense as water, while the quartz it came out '
          + 'of is two point six five.',
    /* 3 */ 'That difference is the whole mechanism. Moving water carries both. The '
          + 'instant it slows, gold drops first.',
    /* 4 */ 'So gold gathers exactly where water loses energy. And those places are '
          + 'predictable.',
    /* 5 */ 'On the inside of bends, where the flow slackens. Behind boulders, in the '
          + 'eddy downstream. And in bedrock riffles — cracks and ledges across the '
          + 'stream bed that work like a sluice box built by geology.',
    /* 6 */ 'Where a tributary joins and the current drops. And where the gradient '
          + 'flattens, as the valley opens out.',
    /* 7 */ 'In section, almost all of it sits in the bottom half metre of gravel, '
          + 'resting on bedrock. That layer is the pay streak. It is why placer miners '
          + 'dig to bedrock, and clean the cracks by hand.',
    /* 8 */ 'The family. Eluvial, still on the hillside below its lode. Alluvial, in the '
          + 'stream. Beach placers, sorted by waves. And palaeo-placers — ancient '
          + 'river gravels, buried and cemented into rock.',
    /* 9 */ 'If placers are the easy gold, why does anyone chase the hard kind?',
    /*10 */ 'Two reasons.',
    /*11 */ 'Placers are small, shallow and quickly exhausted. But they need no blasting '
          + 'and very little capital — which is why they are where artisanal and '
          + 'small-scale mining lives, and why it matters to far more people than '
          + 'any big mine does.',
    /*12 */ 'And this. Gold in a stream came from somewhere upstream. Sample up the '
          + 'drainage, watch the grains get coarser and more angular, and they will '
          + 'walk you to the lode.',
    /*13 */ 'A placer is a deposit and a signpost at the same time.',
];

// --- board: the lode breaking up -------------------------------------------

function boardFree() {
    const r = rng(616);
    const parts = [
        textPart('fr_h', 'weathering sets it free', {
            at: [540, 500], font: TYPE.heading, fill: 'ink' }),
        // A hillside with the vein breaking out at the top.
        pathPart('fr_hill', `${M(60, 1180)} ${Q(360, 700, 700, 640)} ${L(1020, 700)} `
            + `${L(1020, 1180)} ${Z}`, { fill: 'greenstone', alpha: 1, z: 8 }),
        pathPart('fr_vein', `${M(560, 660)} ${L(470, 1180)}`,
            { stroke: 'quartz', strokeWidth: 30, lineCap: 'butt', alpha: 1, z: 9 }),
        ...labelParts('fr_lv', 'the lode at surface', [1004, 600], [566, 690]),
    ];
    // Fragments tumbling down the slope, with gold among them.
    for (let i = 0; i < 18; i++) {
        const t = r();
        const x = 520 - t * 300 + (r() - 0.5) * 90;
        const y = 700 + t * 420;
        const gold = i % 4 === 0;
        parts.push(ellipsePart(`fr_g${i}`, gold ? 8 : 12 + r() * 10,
            gold ? 8 : 9 + r() * 8, { at: [x, y],
            fill: gold ? 'gold' : 'quartz', z: gold ? 13 : 12,
            ...(gold ? { glow: { blur: 16, color: '#ffc64d' } } : {}) }));
    }
    parts.push(captionPart('fr_c', 'quartz breaks. Gold does not.'));
    return board('free', parts);
}
const freeGrains = () => Array.from({ length: 18 }, (_, i) => `fr_g${i}`);

// --- board: density --------------------------------------------------------

function boardDensity() {
    const parts = [
        textPart('de_h', 'why gold behaves differently', {
            at: [540, 496], font: TYPE.heading, fill: 'ink', maxWidth: 940 }),
        // One gold grain.
        ellipsePart('de_au', 46, 46, { at: [290, 800], fill: 'gold', z: 12,
            glow: { blur: 30, color: '#ffc64d' } }),
        textPart('de_aul', 'gold', { at: [290, 890], font: TYPE.label,
            fill: 'gold', z: 12 }),
        textPart('de_auv', '19.3', { at: [290, 952], font: `800 64px ${FONT}`,
            fill: 'gold', z: 12 }),
        textPart('de_auu', 'g / cm³', { at: [290, 1006], font: TYPE.small,
            fill: 'dim', z: 12 }),
        textPart('de_eq', '=', { at: [540, 800], font: `800 72px ${FONT}`,
            fill: 'ink', z: 12 }),
        textPart('de_ql', 'quartz', { at: [810, 890], font: TYPE.label,
            fill: 'quartz', z: 12 }),
        textPart('de_qv', '2.65', { at: [810, 952], font: `800 64px ${FONT}`,
            fill: 'quartz', z: 12 }),
        textPart('de_quu', 'g / cm³', { at: [810, 1006], font: TYPE.small,
            fill: 'dim', z: 12 }),
        textPart('de_r', 'seven times heavier, grain for grain', {
            at: [540, 1150], font: TYPE.caption, fill: 'gold', maxWidth: 940, z: 14 }),
    ];
    // Seven quartz grains to balance one of gold: 19.3 / 2.65 = 7.3.
    const ring = [[0, 0], [60, -34], [60, 34], [-60, -34], [-60, 34], [0, -68], [0, 68]];
    ring.forEach(([dx, dy], i) => parts.push(
        ellipsePart(`de_q${i}`, 26, 26, { at: [810 + dx, 800 + dy],
            fill: 'quartz', z: 12 })));
    return board('dens', parts);
}

// --- board: the flume ------------------------------------------------------

function boardFlume() {
    const parts = [
        textPart('fl_h', 'the instant water slows', {
            at: [540, 500], font: TYPE.heading, fill: 'ink' }),
        // A channel: fast on the left, slack on the right behind a step.
        pathPart('fl_bed', `${M(80, 880)} ${L(620, 880)} ${L(620, 1010)} `
            + `${L(1000, 1010)} ${L(1000, 1140)} ${L(80, 1140)} ${Z}`,
            { fill: '#4a4034', stroke: '#2f281f', strokeWidth: 3, alpha: 1, z: 8 }),
        rectPart('fl_water', 920, 180, { at: [540, 800], fill: 'water',
            alpha: 1, z: 9 }),
        ...labelParts('fl_f', 'fast', [150, 700], null),
        ...labelParts('fl_s', 'slack', [1004, 700], null),
        pathPart('fl_ar', arrowPath([300, 744], [760, 744], { head: 20 }),
            { fill: '#9fd0ea', stroke: '#9fd0ea', strokeWidth: 4, alpha: 1, z: 11 }),
        captionPart('fl_c', 'gold drops first, and stays'),
    ];
    // Quartz carries on; gold falls into the step.
    for (let i = 0; i < 7; i++) {
        parts.push(ellipsePart(`fl_q${i}`, 13, 10, {
            at: [160 + i * 60, 790 + (i % 3) * 18], fill: 'quartz', z: 12 }));
    }
    for (let i = 0; i < 5; i++) {
        parts.push(ellipsePart(`fl_g${i}`, 9, 9, {
            at: [200 + i * 54, 820 + (i % 2) * 16], fill: 'gold', z: 13,
            glow: { blur: 16, color: '#ffc64d' } }));
    }
    return board('flume', parts);
}

/** Quartz travels on and off the right; gold settles onto the step. */
function flumeRun(fx) {
    const out = [];
    for (let i = 0; i < 7; i++) {
        out.push(
            ...reveal(fx, `fl_q${i}`, 0.4 + i * 0.08, { span: 0.2 }),
            ...glide(fx, `fl_q${i}`, [160 + i * 60, 790 + (i % 3) * 18],
                     1.0 + i * 0.12, 3.4, [760, 0], { ease: 'linear' }),
            ...conceal(fx, `fl_q${i}`, 3.8 + i * 0.12, { span: 0.4 }));
    }
    for (let i = 0; i < 5; i++) {
        const at = 1.1 + i * 0.14;
        out.push(
            ...reveal(fx, `fl_g${i}`, 0.5 + i * 0.1, { span: 0.2 }),
            // Carried a little way, then dropped into the slack water.
            ...glide(fx, `fl_g${i}`, [200 + i * 54, 820 + (i % 2) * 16],
                     at, 1.9, [320 + i * 26, 0]),
            ...glide(fx, `fl_g${i}`, [520 + i * 80, 820 + (i % 2) * 16],
                     at + 0.9, 1.4, [0, 150 + (i % 2) * 14]));
    }
    return out;
}

// --- board: where to look, in plan -----------------------------------------

const TRAPS = [
    ['t1', 300, 700, 'inside of a bend'],
    ['t2', 690, 820, 'behind a boulder'],
    ['t3', 430, 960, 'bedrock riffles'],
    ['t4', 760, 1060, 'where a tributary joins'],
    ['t5', 330, 1180, 'where the gradient flattens'],
];

function boardPlan() {
    const river = `${M(180, 600)} ${Q(420, 700, 360, 830)} ${Q(300, 960, 540, 1020)} `
        + `${Q(800, 1080, 700, 1200)} ${Q(640, 1280, 820, 1330)}`;
    const parts = [
        textPart('pl_h', 'where water loses energy', {
            at: [540, 500], font: TYPE.heading, fill: 'ink', maxWidth: 940 }),
        pathPart('pl_valley', river, { stroke: '#2b3a2c', strokeWidth: 150,
            alpha: 1, z: 7 }),
        pathPart('pl_river', river, { stroke: 'water', strokeWidth: 54,
            alpha: 1, z: 8 }),
        pathPart('pl_trib', `${M(980, 880)} ${Q(850, 960, 742, 1052)}`,
            { stroke: 'water', strokeWidth: 26, alpha: 1, z: 8 }),
        ellipsePart('pl_rock', 34, 28, { at: [726, 792], fill: '#6d7a6a',
            stroke: '#3a382e', strokeWidth: 3, alpha: 1, z: 10 }),
    ];
    TRAPS.forEach(([id, x, y, label], i) => {
        parts.push(
            ellipsePart(`pl_${id}`, 26, 26, { at: [x, y], fill: 'gold', z: 12,
                glow: { blur: 28, color: '#ffc64d' } }),
            textPart(`pl_${id}_n`, String(i + 1), { at: [x, y],
                font: `800 28px ${FONT}`, fill: '#0d1420', z: 13 }),
            textPart(`pl_${id}_l`, `${i + 1}  ${label}`, {
                at: x > 540 ? [1004, y + 72] : [92, y + 72],
                align: x > 540 ? 'right' : 'left',
                font: TYPE.small, fill: 'ink', maxWidth: 420, z: 13 }),
        );
    });
    return board('plan', parts);
}
const trapIds = (i) => [`pl_${TRAPS[i][0]}`, `pl_${TRAPS[i][0]}_n`, `pl_${TRAPS[i][0]}_l`];

// --- board: the pay streak -------------------------------------------------

function boardPay() {
    const r = rng(626);
    const parts = [
        textPart('pa_h', 'the pay streak', {
            at: [540, 500], font: TYPE.heading, fill: 'ink' }),
        rectPart('pa_over', 900, 150, { at: [540, 650], fill: 'soil', alpha: 1, z: 8 }),
        rectPart('pa_grav', 900, 300, { at: [540, 875], fill: '#6e6552',
            alpha: 1, z: 8 }),
        rectPart('pa_pay', 900, 56, { at: [540, 1053], fill: '#a98a3c', z: 10 }),
        // Bedrock, with the cracks that catch the gold.
        pathPart('pa_bed', `${M(90, 1081)} ${L(990, 1081)} ${L(990, 1240)} `
            + `${L(90, 1240)} ${Z}`, { fill: '#4b5a4c', alpha: 1, z: 8 }),
        ...[200, 380, 560, 740, 880].map((x, i) => pathPart(`pa_cr${i}`,
            `${M(x, 1081)} ${L(x + 18, 1160)}`,
            { stroke: '#2f3a30', strokeWidth: 12, alpha: 1, z: 9 })),
        ...labelParts('pa_lo', 'overburden', [92, 650], null),
        ...labelParts('pa_lg', 'barren gravel', [92, 875], null),
        ...labelParts('pa_lp', 'pay streak — the bottom half metre',
            [1004, 1290], [700, 1062]),
        ...labelParts('pa_lb', 'bedrock', [92, 1200], null),
        captionPart('pa_c', 'dig to bedrock, and clean the cracks by hand', { y: 1250 }),
    ];
    for (let i = 0; i < 16; i++) {
        parts.push(ellipsePart(`pa_au${i}`, 5, 5, {
            at: [120 + r() * 840, 1036 + r() * 34], fill: 'gold', z: 12,
            glow: { blur: 12, color: '#ffc64d' } }));
    }
    return board('pay', parts);
}
const payGold = () => Array.from({ length: 16 }, (_, i) => `pa_au${i}`);

// --- board: the family -----------------------------------------------------

const FAMILY = [
    ['f1', 'Eluvial', 'still on the hillside, below its lode'],
    ['f2', 'Alluvial', 'in the stream, the classic placer'],
    ['f3', 'Beach', 'sorted by waves along a shoreline'],
    ['f4', 'Palaeo-placer', 'ancient gravels, buried and cemented into rock'],
];

function boardFamily() {
    const parts = [textPart('fa_h', 'four kinds of placer', {
        at: [540, 500], font: TYPE.heading, fill: 'ink' })];
    FAMILY.forEach(([id, name, note], i) => {
        const y = 640 + i * 160;
        parts.push(
            rectPart(id, 900, 136, { at: [540, y], fill: 'panel',
                stroke: i === 3 ? 'gold' : '#2a3b52', strokeWidth: i === 3 ? 3 : 2, z: 10 }),
            textPart(`${id}_n`, name, { at: [130, y - 26], font: `700 36px ${FONT}`,
                fill: i === 3 ? 'gold' : 'ink', align: 'left', maxWidth: 820, z: 12 }),
            textPart(`${id}_t`, note, { at: [130, y + 36], font: TYPE.small,
                fill: 'dim', align: 'left', maxWidth: 820, z: 12 }),
        );
    });
    parts.push(textPart('fa_w', 'the Witwatersrand is a palaeo-placer — and has '
        + 'produced more gold than anywhere on Earth', {
        at: [540, 1300], font: TYPE.small, fill: 'gold', maxWidth: 940,
        lineHeight: 34, z: 14 }));
    return board('fam', parts);
}
const famIds = (id) => [id, `${id}_n`, `${id}_t`];

// --- board: upstream -------------------------------------------------------

function boardUpstream() {
    const river = `${M(200, 1200)} ${Q(360, 1020, 420, 880)} ${Q(490, 720, 700, 640)}`;
    const parts = [
        textPart('up_h', 'a placer is a signpost', {
            at: [540, 500], font: TYPE.heading, fill: 'ink' }),
        pathPart('up_river', river, { stroke: 'water', strokeWidth: 40,
            alpha: 1, z: 8 }),
        ellipsePart('up_lode', 36, 26, { at: [730, 614], fill: 'quartz',
            stroke: 'gold', strokeWidth: 5, z: 12 }),
        ...labelParts('up_ll', 'the lode', [1004, 560], [742, 606]),
    ];
    // Grains: finer and rounder downstream, coarser and more angular upstream.
    const spots = [[232, 1160], [318, 1030], [398, 902], [470, 782], [600, 676]];
    spots.forEach(([x, y], i) => {
        const size = 5 + i * 3.4;
        parts.push(
            ellipsePart(`up_g${i}`, size, size * (i > 2 ? 0.7 : 0.95), {
                at: [x, y], fill: 'gold', z: 13,
                glow: { blur: 14 + i * 4, color: '#ffc64d' } }),
            textPart(`up_g${i}_l`, ['fine, rounded', '', '', '', 'coarse, angular'][i], {
                at: [x - 70, y + 50], font: TYPE.small, fill: 'dim',
                align: 'right', maxWidth: 300, z: 13 }),
        );
    });
    parts.push(
        pathPart('up_ar', arrowPath([250, 1260], [640, 760], { head: 24 }),
            { fill: 'gold', stroke: 'gold', strokeWidth: 5, z: 14 }),
        captionPart('up_c', 'sample up the drainage until the grains stop', { y: 1300 }),
    );
    return board('upstream', parts);
}

// --- the film --------------------------------------------------------------

export function partSix() {
    const card = endCard('Next: finding rock you cannot see.');
    const boards = [boardFree(), boardDensity(), boardFlume(), boardPlan(), boardPay(),
                    boardFamily(), boardUpstream(), board('card', card.parts)];
    const characters = { ...CHARACTERS };
    for (const b of boards) characters[b.name] = effect(b.parts, { palette: 'geo' });
    characters.title_b = effect(titleParts(`${SERIES.toUpperCase()}  ·  PART 6`,
        'Placer gold'), { palette: 'geo' });

    const scenes = [
        {
            id: 'free', palette: 'geo',
            background: { color: '#0d1420' },
            transitionIn: { kind: 'fade', from: '#000000', duration: 0.9 },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('title_b', { alpha: 1, z: 60 }),
                   castBoard('free'), castBoard('dens')],
            shots: [
                { id: 'r0', duration: 6.5, dialogue: [vo(P6[0], 0.7)],
                  actions: build('title_b', ['kicker', 'title'], 0.4,
                                 { gap: 0.3, span: 0.5 }) },
                { id: 'r1', duration: 10.5, dialogue: [vo(P6[1], 0.4)],
                  actions: [
                      ...conceal('title_b', 'kicker', 0.2, { span: 0.4 }),
                      ...conceal('title_b', 'title', 0.3, { span: 0.4 }),
                      { target: 'free', do: 'show', at: 0.8, for: 0.4 },
                      ...reveal('free', 'fr_h', 1.0, { span: 0.4 }),
                      ...build('free', ['fr_lv', 'fr_lv_lead'], 1.8, { gap: 0.1 }),
                      ...build('free', freeGrains(), 3.6, { gap: 0.14, span: 0.3 }),
                      ...reveal('free', 'fr_c', 8.0, { span: 0.5 }),
                  ] },
                { id: 'r2', duration: 21.5, dialogue: [vo(P6[2], 0.4)],
                  actions: [
                      { target: 'free', do: 'hide', at: 0.2, for: 0.5 },
                      { target: 'dens', do: 'show', at: 0.7, for: 0.4 },
                      ...reveal('dens', 'de_h', 0.9, { span: 0.4 }),
                      ...build('dens', ['de_au', 'de_aul', 'de_auv', 'de_auu'], 8.0,
                               { gap: 0.12, span: 0.35 }),
                      ...reveal('dens', 'de_eq', 12.0, { span: 0.3 }),
                      ...build('dens', ['de_q0', 'de_q1', 'de_q2', 'de_q3', 'de_q4',
                                        'de_q5', 'de_q6'], 12.6,
                               { gap: 0.14, span: 0.3 }),
                      ...build('dens', ['de_ql', 'de_qv', 'de_quu'], 14.2,
                               { gap: 0.12, span: 0.35 }),
                      ...reveal('dens', 'de_r', 17.6, { span: 0.5 }),
                  ] },
            ],
        },
        {
            id: 'trap', palette: 'geo',
            background: { color: '#0d1420' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('flume', { alpha: 1 }), castBoard('plan')],
            shots: [
                { id: 'r3', duration: 11.0, dialogue: [vo(P6[3], 0.5)],
                  actions: [
                      ...reveal('flume', 'fl_h', 0.3, { span: 0.4 }),
                      ...build('flume', ['fl_f', 'fl_s'], 0.8, { gap: 0.2, span: 0.3 }),
                      ...flumeRun('flume'),
                      ...reveal('flume', 'fl_c', 8.0, { span: 0.5 }),
                  ] },
                { id: 'r4', duration: 7.5, dialogue: [vo(P6[4], 0.4)],
                  actions: [
                      { target: 'flume', do: 'hide', at: 0.2, for: 0.5 },
                      { target: 'plan', do: 'show', at: 0.8, for: 0.5 },
                      ...reveal('plan', 'pl_h', 1.0, { span: 0.4 }),
                  ] },
                { id: 'r5', duration: 16.5, dialogue: [vo(P6[5], 0.4)],
                  actions: [
                      ...build('plan', trapIds(0), 0.6, { gap: 0.12, span: 0.35, how: pop }),
                      ...build('plan', trapIds(1), 5.0, { gap: 0.12, span: 0.35, how: pop }),
                      ...build('plan', trapIds(2), 9.4, { gap: 0.12, span: 0.35, how: pop }),
                  ] },
                { id: 'r6', duration: 10.0, dialogue: [vo(P6[6], 0.4)],
                  actions: [
                      ...build('plan', trapIds(3), 0.5, { gap: 0.12, span: 0.35, how: pop }),
                      ...build('plan', trapIds(4), 4.6, { gap: 0.12, span: 0.35, how: pop }),
                  ] },
            ],
        },
        {
            id: 'pay', palette: 'geo',
            background: { color: '#0d1420' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('pay', { alpha: 1 })],
            shots: [
                { id: 'r7', duration: 17.0, dialogue: [vo(P6[7], 0.5)],
                  actions: [
                      ...reveal('pay', 'pa_h', 0.3, { span: 0.4 }),
                      ...build('pay', ['pa_lo', 'pa_lg', 'pa_lb'], 1.0,
                               { gap: 0.25, span: 0.35 }),
                      ...reveal('pay', 'pa_pay', 4.6, { span: 0.6 }),
                      ...build('pay', payGold(), 5.4, { gap: 0.09, span: 0.25 }),
                      ...build('pay', ['pa_lp', 'pa_lp_lead'], 8.0, { gap: 0.1 }),
                      ...reveal('pay', 'pa_c', 12.6, { span: 0.5 }),
                  ] },
            ],
        },
        {
            id: 'family', palette: 'geo',
            background: { color: '#0d1420' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('fam', { alpha: 1 })],
            shots: [
                { id: 'r8', duration: 19.5, dialogue: [vo(P6[8], 0.5)],
                  actions: [
                      ...reveal('fam', 'fa_h', 0.3, { span: 0.4 }),
                      ...build('fam', famIds('f1'), 1.2, { gap: 0.12, span: 0.35 }),
                      ...build('fam', famIds('f2'), 4.6, { gap: 0.12, span: 0.35 }),
                      ...build('fam', famIds('f3'), 7.6, { gap: 0.12, span: 0.35 }),
                      ...build('fam', famIds('f4'), 11.0, { gap: 0.12, span: 0.35 }),
                      ...reveal('fam', 'fa_w', 15.0, { span: 0.6 }),
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
                castBoard('upstream', { alpha: 0, z: 40 }),
            ],
            shots: [
                { id: 'r9', duration: 5.5, framing: 'wide', on: 'juma',
                  dialogue: [says('juma', P6[9], 0.5)],
                  actions: [
                      { target: 'zawadi', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'juma', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'juma', do: 'pose', pose: 'ask', at: 0.3, for: 0.5 },
                      { target: 'zawadi', do: 'play', action: 'breathe' },
                      { target: 'juma', do: 'play', action: 'breathe' },
                      ...blinks('zawadi', 5.5, 131), ...blinks('juma', 5.5, 137),
                  ] },
                { id: 'r10', duration: 3.0, framing: 'wide', on: 'zawadi',
                  dialogue: [says('zawadi', P6[10], 0.35)],
                  actions: [
                      { target: 'juma', do: 'pose', pose: 'stand', at: 0.2, for: 0.4 },
                      { target: 'zawadi', do: 'pose', pose: 'count', at: 0.3, for: 0.4 },
                      { target: 'zawadi', do: 'play', action: 'breathe' },
                      { target: 'juma', do: 'play', action: 'breathe' },
                  ] },
                { id: 'r11', duration: 16.5, framing: 'wide', on: 'zawadi',
                  dialogue: [vo(P6[11], 0.4)],
                  actions: [
                      { target: 'zawadi', do: 'pose', pose: 'present', at: 0.4, for: 0.6 },
                      { target: 'zawadi', do: 'play', action: 'breathe' },
                      { target: 'juma', do: 'play', action: 'breathe' },
                      ...blinks('zawadi', 17.5, 139), ...blinks('juma', 17.5, 149),
                  ] },
                { id: 'r12', duration: 14.5, dialogue: [vo(P6[12], 0.4)],
                  actions: [
                      { target: 'zawadi', do: 'hide', at: 0.3, for: 0.4 },
                      { target: 'juma', do: 'hide', at: 0.3, for: 0.4 },
                      { target: 'upstream', do: 'show', at: 0.8, for: 0.5 },
                      ...reveal('upstream', 'up_h', 1.0, { span: 0.4 }),
                      ...build('upstream', ['up_g0', 'up_g0_l'], 2.4,
                               { gap: 0.15, span: 0.35 }),
                      ...build('upstream', ['up_g1', 'up_g2'], 4.0,
                               { gap: 0.5, span: 0.35 }),
                      ...build('upstream', ['up_g3', 'up_g4', 'up_g4_l'], 5.6,
                               { gap: 0.4, span: 0.35 }),
                      ...reveal('upstream', 'up_ar', 8.0, { span: 0.6 }),
                      ...build('upstream', ['up_lode', 'up_ll', 'up_ll_lead'], 9.4,
                               { gap: 0.2, span: 0.4 }),
                  ] },
                { id: 'r13', duration: 6.5, dialogue: [vo(P6[13], 0.4)],
                  actions: reveal('upstream', 'up_c', 0.6, { span: 0.5 }) },
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
        meta: META('Placer gold'),
        voices: VOICES,
        palettes: { geo: GEO_PALETTE },
        characters,
        scenes,
    };
}
