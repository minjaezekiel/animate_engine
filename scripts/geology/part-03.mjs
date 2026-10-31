/**
 * Part 3 — The exploration funnel.
 *
 * The stages, the attrition, and why the order of the tools is the whole
 * discipline. The cost comparison is deliberately RELATIVE -- multiples of a
 * desktop study rather than dollars per hectare -- because real figures vary
 * by an order of magnitude between countries and years, and a precise-looking
 * number that is wrong teaches worse than an honest ratio.
 */
import {
    L, M, TYPE, Z, arrowPath, build, captionPart, conceal, effect, ellipsePart,
    labelParts, logScale, pathPart, poly, pop, ramp, rectPart, reveal, textPart,
    titleParts,
} from '../lib/diagram.mjs';
import {
    CHARACTERS, GEO_PALETTE, META, SERIES, VOICES, endCard, offstage, says, vo,
} from '../lib/series.mjs';
import { GROUND_Y } from '../lib/diagram.mjs';
import { blinks, board, castBoard } from './common.mjs';

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const TALK_Y = Math.round(GROUND_Y - 274 * 1.5);

const P3 = [
    /* 0 */ 'Exploration is not searching. It is elimination, run cheapest first.',
    /* 1 */ 'One. Reconnaissance. Regional, cheap, across huge areas. Maps, satellite '
          + 'data, old reports, stream sediments. What comes out is a licence '
          + 'application and a shortlist of ground.',
    /* 2 */ 'Two. Target generation. Walk the ground. Map it, sample the soil and the '
          + 'rock, fly geophysics. What comes out is a ranked list of anomalies.',
    /* 3 */ 'Three. Target testing. Drill. This is the first genuinely expensive step, '
          + 'and most targets die here. What comes out is an intercept, or a reason to '
          + 'walk away.',
    /* 4 */ 'Four. Resource definition. Drill the thing that worked, on a grid, until '
          + 'the grade and the shape are known well enough to model.',
    /* 5 */ 'Five. Studies. Scoping, pre-feasibility, feasibility. Can it be mined, '
          + 'processed, permitted, financed and closed? What comes out is a reserve, '
          + 'and a decision.',
    /* 6 */ 'Six. Construction, and mining.',
    /* 7 */ 'Here is the part nobody tells students.',
    /* 8 */ 'Of a thousand serious prospects, about a hundred get drilled. Around ten '
          + 'return something interesting. And roughly one becomes a mine. From the '
          + 'first look to the first gold is commonly seven to fifteen years.',
    /* 9 */ 'That sounds like mostly failure.',
    /*10 */ 'It is mostly failure. The craft is in failing cheaply.',
    /*11 */ 'Every stage exists to spend a little money ruling out a lot of ground, so '
          + 'the expensive tools only ever get pointed at the few places that have '
          + 'earned them.',
    /*12 */ 'Spend drilling money on a target that satellite data and a soil grid could '
          + 'have killed for a thousandth of the cost, and you have not been unlucky. '
          + 'You have been disorganised.',
];

// --- board: the funnel -----------------------------------------------------

const STAGES = [
    ['f1', '1  ·  RECONNAISSANCE', 'maps, satellite, stream sediments  →  a licence'],
    ['f2', '2  ·  TARGET GENERATION', 'mapping, soils, geophysics  →  ranked anomalies'],
    ['f3', '3  ·  TARGET TESTING', 'first drilling  →  an intercept, or a reason to stop'],
    ['f4', '4  ·  RESOURCE DEFINITION', 'drill on a grid  →  a mineral resource'],
    ['f5', '5  ·  STUDIES', 'scoping, PFS, feasibility  →  a reserve, and a decision'],
    ['f6', '6  ·  BUILD AND MINE', 'the one in a thousand'],
];

function boardFunnel() {
    const parts = [
        ...titleParts(`${SERIES.toUpperCase()}  ·  PART 3`, 'The funnel'),
    ];
    STAGES.forEach(([id, name, out], i) => {
        const y = 566 + i * 118;
        const w = 900 - i * 118;
        parts.push(
            rectPart(`${id}`, w, 58, { at: [540, y], fill: i === 5 ? 'gold' : 'panel',
                stroke: i === 5 ? 'gold' : '#2a3b52', strokeWidth: 2, z: 10 }),
            textPart(`${id}_n`, name, { at: [540, y], font: `700 27px ${FONT}`,
                fill: i === 5 ? '#0d1420' : 'ink', maxWidth: w - 24, z: 12 }),
            textPart(`${id}_o`, out, { at: [540, y + 58], font: `600 25px ${FONT}`,
                fill: 'dim', maxWidth: 940, z: 12 }),
        );
    });
    return board('funnel', parts);
}
const stageIds = (id) => [id, `${id}_n`, `${id}_o`];

// --- board: attrition ------------------------------------------------------

const ATTRITION = [
    ['a1', '1,000', 'serious prospects', 'ink'],
    ['a2', '100', 'get drilled', 'ink'],
    ['a3', '10', 'return something', 'sulphide'],
    ['a4', '1', 'becomes a mine', 'gold'],
];

function boardAttrition() {
    const parts = [
        textPart('at_h', 'what the numbers do', {
            at: [540, 500], font: TYPE.heading, fill: 'ink' }),
    ];
    ATTRITION.forEach(([id, n, label, color], i) => {
        const y = 630 + i * 150;
        parts.push(
            textPart(`${id}`, n, { at: [430, y], font: `800 86px ${FONT}`,
                fill: color, align: 'right', z: 12 }),
            textPart(`${id}_l`, label, { at: [480, y], font: TYPE.caption,
                fill: 'dim', align: 'left', maxWidth: 520, z: 12 }),
        );
        if (i < 3) {
            parts.push(pathPart(`${id}_ar`, arrowPath([400, y + 44], [400, y + 104],
                { head: 16 }), { fill: 'dim', stroke: 'dim', strokeWidth: 3, z: 11 }));
        }
    });
    parts.push(textPart('at_t', '7 to 15 years, from the first look to the first gold', {
        at: [540, 1252], font: TYPE.label, fill: 'gold', maxWidth: 940, z: 12 }));
    return board('attrition', parts);
}

// --- board: the cost of being out of order ---------------------------------

const COSTS = [
    ['c1', 1, 'desktop study'],
    ['c2', 8, 'satellite and GIS'],
    ['c3', 60, 'stream sediments'],
    ['c4', 600, 'soil grid'],
    ['c5', 3000, 'ground geophysics'],
    ['c6', 100000, 'drilling'],
];

function boardCost() {
    const x0 = 330;
    const x1 = 990;
    const sx = logScale(1, 100000, x0, x1);
    const parts = [
        textPart('co_h', 'cost of looking, per hectare', {
            at: [540, 496], font: TYPE.heading, fill: 'ink', maxWidth: 940 }),
        textPart('co_s', 'relative to a desktop study  ·  log scale', {
            at: [540, 548], font: TYPE.small, fill: 'dim', maxWidth: 940 }),
        pathPart('co_axis', `${M(x0, 1128)} ${L(x1, 1128)}`,
            { stroke: 'dim', strokeWidth: 3, z: 10 }),
    ];
    [[1, '×1'], [100, '×100'], [10000, '×10k'], [100000, '×100k']]
        .forEach(([v, label], i) => parts.push(textPart(`co_x${i}`, label, {
            at: [sx(v), 1170], font: TYPE.small, fill: 'dim', z: 10 })));
    COSTS.forEach(([id, v, label], i) => {
        const y = 640 + i * 76;
        const w = Math.max(5, sx(v) - x0);
        parts.push(
            rectPart(`${id}`, w, 40, { at: [x0 + w / 2, y],
                fill: i === 5 ? 'structure' : 'water', z: 12 }),
            textPart(`${id}_l`, label, { at: [x0 - 18, y], font: TYPE.small,
                fill: 'ink', align: 'right', maxWidth: 260, z: 12 }),
        );
    });
    parts.push(captionPart('co_cap', 'cheapest first, always'));
    return board('cost', parts);
}

// --- the film --------------------------------------------------------------

export function partThree() {
    const card = endCard('Next: stage one done properly — a geologist and a hillside.');
    const boards = [boardFunnel(), boardAttrition(), boardCost(),
                    board('card', card.parts)];
    const characters = { ...CHARACTERS };
    for (const b of boards) characters[b.name] = effect(b.parts, { palette: 'geo' });

    const stage = (i, at = 0.3) => build('funnel', stageIds(STAGES[i][0]), at,
                                         { gap: 0.12, span: 0.36 });

    const scenes = [
        {
            id: 'funnel', palette: 'geo',
            background: { color: '#0d1420' },
            transitionIn: { kind: 'fade', from: '#000000', duration: 0.9 },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('funnel', { alpha: 1 })],
            shots: [
                { id: 'f0', duration: 6.5, dialogue: [vo(P3[0], 0.7)],
                  actions: build('funnel', ['kicker', 'title'], 0.4,
                                 { gap: 0.3, span: 0.5 }) },
                { id: 'f1', duration: 13.5, dialogue: [vo(P3[1], 0.4)], actions: stage(0) },
                { id: 'f2', duration: 11.0, dialogue: [vo(P3[2], 0.4)], actions: stage(1) },
                { id: 'f3', duration: 13.0, dialogue: [vo(P3[3], 0.4)], actions: stage(2) },
                { id: 'f4', duration: 10.5, dialogue: [vo(P3[4], 0.4)], actions: stage(3) },
                { id: 'f5', duration: 14.0, dialogue: [vo(P3[5], 0.4)], actions: stage(4) },
                { id: 'f6', duration: 5.0, dialogue: [vo(P3[6], 0.3)],
                  actions: build('funnel', stageIds('f6'), 0.2,
                                 { gap: 0.1, span: 0.3, how: pop }) },
            ],
        },
        {
            id: 'attrition', palette: 'geo',
            background: { color: '#0d1420' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('attrition', { alpha: 1 })],
            shots: [
                { id: 'a0', duration: 5.0, dialogue: [vo(P3[7], 0.5)],
                  actions: reveal('attrition', 'at_h', 0.4, { span: 0.4 }) },
                { id: 'a1', duration: 18.0, dialogue: [vo(P3[8], 0.4)],
                  actions: [
                      ...build('attrition', ['a1', 'a1_l'], 0.6, { gap: 0.15, span: 0.35 }),
                      ...reveal('attrition', 'a1_ar', 2.6, { span: 0.3 }),
                      ...build('attrition', ['a2', 'a2_l'], 3.2, { gap: 0.15, span: 0.35 }),
                      ...reveal('attrition', 'a2_ar', 5.4, { span: 0.3 }),
                      ...build('attrition', ['a3', 'a3_l'], 6.0, { gap: 0.15, span: 0.35 }),
                      ...reveal('attrition', 'a3_ar', 8.4, { span: 0.3 }),
                      ...build('attrition', ['a4', 'a4_l'], 9.0,
                               { gap: 0.15, span: 0.4, how: pop }),
                      ...reveal('attrition', 'at_t', 13.0, { span: 0.5 }),
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
                { id: 't0', duration: 4.8, framing: 'wide', on: 'juma',
                  dialogue: [says('juma', P3[9], 0.5)],
                  actions: [
                      { target: 'zawadi', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'juma', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'juma', do: 'pose', pose: 'ask', at: 0.3, for: 0.5 },
                      { target: 'zawadi', do: 'play', action: 'breathe' },
                      { target: 'juma', do: 'play', action: 'breathe' },
                      ...blinks('zawadi', 4.8, 61), ...blinks('juma', 4.8, 67),
                  ] },
                { id: 't1', duration: 6.0, framing: 'wide', on: 'zawadi',
                  dialogue: [says('zawadi', P3[10], 0.4)],
                  actions: [
                      { target: 'juma', do: 'pose', pose: 'stand', at: 0.2, for: 0.5 },
                      { target: 'zawadi', do: 'pose', pose: 'present', at: 0.5, for: 0.6 },
                      { target: 'zawadi', do: 'play', action: 'breathe' },
                      { target: 'juma', do: 'play', action: 'breathe' },
                      ...blinks('zawadi', 6.0, 71), ...blinks('juma', 6.0, 73),
                  ] },
            ],
        },
        {
            id: 'cost', palette: 'geo',
            background: { color: '#0d1420' },
            transitionIn: { kind: 'crossfade', duration: 0.6 },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('cost', { alpha: 1 })],
            shots: [
                { id: 'n0', duration: 13.0, dialogue: [vo(P3[11], 0.5)],
                  actions: [
                      ...build('cost', ['co_h', 'co_s'], 0.4, { gap: 0.2, span: 0.4 }),
                      ...build('cost', ['co_axis', 'co_x0', 'co_x1', 'co_x2', 'co_x3'],
                               1.2, { gap: 0.08, span: 0.3 }),
                      ...build('cost', ['c1', 'c1_l'], 2.4, { gap: 0.1, span: 0.3 }),
                      ...build('cost', ['c2', 'c2_l'], 3.6, { gap: 0.1, span: 0.3 }),
                      ...build('cost', ['c3', 'c3_l'], 4.8, { gap: 0.1, span: 0.3 }),
                      ...build('cost', ['c4', 'c4_l'], 6.0, { gap: 0.1, span: 0.3 }),
                      ...build('cost', ['c5', 'c5_l'], 7.2, { gap: 0.1, span: 0.3 }),
                  ] },
                { id: 'n1', duration: 14.5, dialogue: [vo(P3[12], 0.4)],
                  actions: [
                      ...build('cost', ['c6', 'c6_l'], 1.4,
                               { gap: 0.1, span: 0.45, how: pop }),
                      ...reveal('cost', 'co_cap', 9.5, { span: 0.5 }),
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
        meta: META('The exploration funnel'),
        voices: VOICES,
        palettes: { geo: GEO_PALETTE },
        characters,
        scenes,
    };
}
