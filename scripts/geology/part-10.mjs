/**
 * Part 10 — Designing a mine from the structure.
 *
 * The question this series was asked to answer: how the shape of the orebody
 * and the strength of the rock around it decide the mine. The four stoping
 * methods are matched to the four body geometries that select them, and the
 * structural complications each get the design response they force.
 *
 * Concept level. Real pit slopes and stope spans come from a geotechnical
 * study, and the end card says so.
 */
import {
    GROUND_Y, L, M, Q, TYPE, Z, arrowPath, build, captionPart, conceal, effect,
    ellipsePart, glide, labelParts, pathPart, poly, pop, ramp, rectPart, reveal,
    scale, smooth, textPart, titleParts,
} from '../lib/diagram.mjs';
import {
    CHARACTERS, GEO_PALETTE, META, REPO, SERIES, VOICES, offstage, says, vo,
} from '../lib/series.mjs';
import { blinks, board, castBoard, rng } from './common.mjs';

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const TALK_Y = Math.round(GROUND_Y - 274 * 1.5);

const PX = [
    /* 0 */ 'A mine is not designed from the grade. It is designed from the shape of '
          + 'the orebody and the strength of the rock around it.',
    /* 1 */ 'First question: open pit, or underground?',
    /* 2 */ 'By the strip ratio: tonnes of waste per tonne of ore. Near surface a pit '
          + 'wins. Deeper, the pit must widen to reach the ore, so waste grows with the '
          + 'square of depth.',
    /* 3 */ 'Flat, wide and shallow: a pit. Steep, narrow and deep: underground. Many '
          + 'mines are both — a pit first, then a decline beneath it.',
    /* 4 */ 'Design the pit, and geotechnics sets every angle.',
    /* 5 */ 'Bench height matches the equipment. Berms catch rockfall. And benches and '
          + 'berms together average out to the overall slope angle — which is not '
          + 'chosen. It is derived.',
    /* 6 */ 'Competent granite might hold fifty-five degrees. A weathered shear zone '
          + 'might demand thirty.',
    /* 7 */ 'Underground, the structure chooses the method.',
    /* 8 */ 'A steep, narrow vein. Too thin to drive machines into. Longhole stoping, '
          + 'from levels above and below, keeping the opening the width of the vein — '
          + 'because every centimetre of wall is waste you pay to hoist and mill.',
    /* 9 */ 'A thick, steep body in strong rock. Sublevel open stoping: large voids, '
          + 'high productivity, low cost, with pillars or backfill holding the walls.',
    /*10 */ 'A flat, tabular body. Stoping needs gravity, and gravity does not help '
          + 'here. So room and pillar — and the gold in the pillars stays there.',
    /*11 */ 'Weak rock, or a wide shear that will not stand. Cut and fill: take a '
          + 'slice, backfill it, stand on that, take the next. Slow, expensive, and '
          + 'sometimes the only thing that works.',
    /*12 */ 'Then the structures that complicate it. A fault offsets the ore — find '
          + 'the continuation before you design around a hole. A fold closes two limbs '
          + 'together: thicker, richer, awkward to drill.',
    /*13 */ 'A dyke splits one stope into two. And a weak hangingwall flattens your '
          + 'slopes and raises your strip ratio — enough, on its own, to send the whole '
          + 'mine underground.',
    /*14 */ 'So where does the design actually start?',
    /*15 */ 'With the geology. It always did.',
    /*16 */ 'Every decision in this series traces back to one thing: hot fluid moved '
          + 'along a structure and dropped its metal. Get the geology right, and the '
          + 'mine designs itself.',
];

// --- board: pit or underground ---------------------------------------------

function boardChoice() {
    const parts = [
        textPart('ch_h', 'pit, or underground?', {
            at: [540, 500], font: TYPE.heading, fill: 'ink' }),
        rectPart('ch_rock', 900, 620, { at: [540, 950], fill: 'greenstone',
            alpha: 1, z: 8 }),
        pathPart('ch_surf', `${M(90, 640)} ${L(990, 640)}`,
            { stroke: 'ink', strokeWidth: 3, alpha: 1, z: 20 }),
        // The orebody, going down.
        pathPart('ch_ore', `${M(520, 660)} ${L(580, 1250)}`,
            { stroke: 'gold', strokeWidth: 44, lineCap: 'butt', alpha: 1, z: 9 }),
    ];
    // Three nested pits: the deeper it goes, the wider it has to be.
    [[200, 0.55], [420, 0.75], [640, 1.0]].forEach(([depth, f], i) => {
        const halfTop = 150 + depth * 0.95;
        parts.push(pathPart(`ch_p${i}`,
            poly([[540 - halfTop, 640], [540 + halfTop, 640],
                  [540 + 70, 640 + depth], [540 - 70, 640 + depth]], true),
            { stroke: i === 2 ? 'structure' : 'dim', strokeWidth: 4,
              fill: null, z: 12 + i }));
        parts.push(textPart(`ch_p${i}r`, ['2 : 1', '8 : 1', '20 : 1'][i], {
            at: [540 + halfTop + 10, 668 + depth * 0.5], font: TYPE.small,
            fill: i === 2 ? 'structure' : 'dim', align: 'left', maxWidth: 220, z: 16 }));
    });
    parts.push(
        ...labelParts('ch_sr', 'strip ratio — waste per tonne of ore',
            [92, 600], null),
        captionPart('ch_c', 'past the crossover, you go underground'),
    );
    return board('choice', parts);
}

// --- board: pit geometry ---------------------------------------------------

function boardPit() {
    const parts = [
        textPart('pt_h', 'every angle is derived', {
            at: [540, 500], font: TYPE.heading, fill: 'ink' }),
        rectPart('pt_rock', 900, 620, { at: [540, 950], fill: 'greenstone',
            alpha: 1, z: 8 }),
        pathPart('pt_surf', `${M(90, 640)} ${L(990, 640)}`,
            { stroke: 'ink', strokeWidth: 3, alpha: 1, z: 20 }),
    ];
    // A benched pit wall: batter, berm, batter, berm.
    let x = 180;
    let y = 640;
    const steps = [];
    for (let i = 0; i < 5; i++) {
        steps.push([x, y]);
        x += 42; y += 96;              // the batter
        steps.push([x, y]);
        x += 46;                        // the berm
        steps.push([x, y]);
    }
    parts.push(pathPart('pt_wall', poly(steps), { stroke: 'structure',
        strokeWidth: 6, z: 12 }));
    // The overall slope: the average of all of it.
    parts.push(
        pathPart('pt_overall', `${M(180, 640)} ${L(steps[steps.length - 1][0], steps[steps.length - 1][1])}`,
            { stroke: 'gold', strokeWidth: 4, z: 13 }),
        ...labelParts('pt_ol', 'overall slope angle — derived, not chosen',
            [92, 1300], [430, 1060]),
        ...labelParts('pt_bl', 'bench + berm', [1004, 700], [268, 740]),
        // The ramp, eating into the pit.
        pathPart('pt_ramp', `${M(880, 660)} ${L(560, 1180)}`,
            { stroke: 'water', strokeWidth: 22, lineCap: 'butt', z: 14 }),
        ...labelParts('pt_rl', 'ramp at about 1 in 10', [1004, 1130], [740, 920]),
    );
    return board('pit', parts);
}

function boardAngles() {
    const parts = [
        textPart('an_h', 'what the rock will hold', {
            at: [540, 500], font: TYPE.heading, fill: 'ink' }),
    ];
    [['a', 300, 55, 'competent granite', 'granite'],
     ['b', 780, 30, 'weathered shear zone', 'soil']].forEach(
        ([k, cx, deg, label, color]) => {
            const h = 320;
            const run = h / Math.tan(deg * Math.PI / 180);
            parts.push(
                pathPart(`an_${k}`, poly([[cx - run / 2, 700], [cx + run / 2, 700 + h],
                                          [cx - run / 2, 700 + h]], true),
                    { fill: color, stroke: '#2f3a2c', strokeWidth: 3, z: 10 }),
                textPart(`an_${k}d`, `${deg}°`, { at: [cx, 1090],
                    font: `800 54px ${FONT}`, fill: 'gold', maxWidth: 400, z: 12 }),
                textPart(`an_${k}l`, label, { at: [cx, 1150], font: TYPE.small,
                    fill: 'dim', maxWidth: 400, lineHeight: 32, z: 12 }),
            );
        });
    parts.push(captionPart('an_c', 'the same orebody, two different mines',
        { y: 1260 }));
    return board('angles', parts);
}

// --- board: the method the structure chooses -------------------------------

const METHODS = [
    ['m1', 'steep, narrow vein', 'LONGHOLE STOPING',
     'keep the opening the width of the vein'],
    ['m2', 'thick, steep, strong rock', 'SUBLEVEL OPEN STOPING',
     'big voids, pillars or backfill'],
    ['m3', 'flat, tabular body', 'ROOM AND PILLAR',
     'gravity will not help you here'],
    ['m4', 'weak rock, wide shear', 'CUT AND FILL',
     'slice, backfill, stand on it, repeat'],
];

/** A little section showing the geometry each method answers. */
function methodShape(id, kind, cx, cy) {
    if (kind === 0) {
        return [pathPart(id, `${M(cx - 14, cy + 50)} ${L(cx + 14, cy - 50)}`,
            { stroke: 'gold', strokeWidth: 12, lineCap: 'butt', z: 12 })];
    }
    if (kind === 1) {
        return [pathPart(id, `${M(cx - 24, cy + 44)} ${L(cx + 24, cy - 44)}`,
            { stroke: 'gold', strokeWidth: 40, lineCap: 'butt', z: 12 })];
    }
    if (kind === 2) {
        return [rectPart(id, 118, 30, { at: [cx, cy], fill: 'gold', z: 12 })];
    }
    return [pathPart(id, `${M(cx - 26, cy + 42)} ${Q(cx + 6, cy, cx + 26, cy - 42)}`,
        { stroke: 'gold', strokeWidth: 44, lineCap: 'butt', z: 12 })];
}

function boardMethods() {
    const parts = [
        textPart('me_h', 'the structure chooses the method', {
            at: [540, 496], font: TYPE.heading, fill: 'ink', maxWidth: 940 }),
    ];
    METHODS.forEach(([id, shape, name, note], i) => {
        const y = 650 + i * 168;
        parts.push(
            rectPart(`${id}_bg`, 900, 150, { at: [540, y], fill: 'panel',
                stroke: '#2a3b52', strokeWidth: 2, z: 9 }),
            rectPart(`${id}_sb`, 150, 150, { at: [172, y], fill: '#121a26', z: 10 }),
            ...methodShape(`${id}_s`, i, 172, y),
            textPart(`${id}_g`, shape, { at: [268, y - 44], font: TYPE.small,
                fill: 'dim', align: 'left', maxWidth: 700, z: 13 }),
            textPart(`${id}_n`, name, { at: [268, y + 10], font: `700 32px ${FONT}`,
                fill: 'gold', align: 'left', maxWidth: 700, z: 13 }),
            textPart(`${id}_t`, note, { at: [268, y + 58], font: TYPE.small,
                fill: 'ink', align: 'left', maxWidth: 700, z: 13 }),
        );
    });
    return board('methods', parts);
}
const methodIds = (id) => [`${id}_bg`, `${id}_sb`, `${id}_s`, `${id}_g`, `${id}_n`, `${id}_t`];

// --- board: the complications ----------------------------------------------

const TROUBLE = [
    ['x1', 'a fault offsets the ore', 'find the continuation first'],
    ['x2', 'a fold closes two limbs', 'thicker, richer, awkward to drill'],
    ['x3', 'a dyke cuts through', 'one stope becomes two'],
    ['x4', 'a weak hangingwall', 'flatter slopes — maybe no pit at all'],
];

function boardTrouble() {
    const parts = [
        textPart('tr_h', 'what the structure does to the plan', {
            at: [540, 496], font: TYPE.heading, fill: 'ink', maxWidth: 940 }),
    ];
    TROUBLE.forEach(([id, name, answer], i) => {
        const col = i % 2;
        const row = (i - col) / 2;
        const cx = 290 + col * 480;
        const cy = 700 + row * 310;
        parts.push(
            rectPart(`${id}_bg`, 440, 270, { at: [cx, cy], fill: 'panel',
                stroke: '#2a3b52', strokeWidth: 2, z: 9 }),
            textPart(`${id}_n`, name, { at: [cx, cy + 58], font: `700 28px ${FONT}`,
                fill: 'ink', maxWidth: 400, lineHeight: 34, z: 13 }),
            textPart(`${id}_t`, answer, { at: [cx, cy + 112], font: TYPE.small,
                fill: 'gold', maxWidth: 400, lineHeight: 32, z: 13 }),
        );
        // A small section of the structural problem itself.
        if (i === 0) {
            parts.push(
                pathPart(`${id}_a`, `${M(cx - 90, cy - 10)} ${L(cx - 20, cy - 110)}`,
                    { stroke: 'gold', strokeWidth: 16, lineCap: 'butt', z: 12 }),
                pathPart(`${id}_b`, `${M(cx + 30, cy + 10)} ${L(cx + 100, cy - 90)}`,
                    { stroke: 'gold', strokeWidth: 16, lineCap: 'butt', z: 12 }),
                pathPart(`${id}_f`, `${M(cx - 50, cy + 30)} ${L(cx + 60, cy - 130)}`,
                    { stroke: 'structure', strokeWidth: 4, z: 13 }));
        } else if (i === 1) {
            parts.push(pathPart(`${id}_a`,
                `${M(cx - 110, cy - 20)} ${Q(cx, cy - 170, cx + 110, cy - 20)}`,
                { stroke: 'gold', strokeWidth: 20, lineCap: 'butt', z: 12 }));
        } else if (i === 2) {
            parts.push(
                pathPart(`${id}_a`, `${M(cx - 110, cy - 60)} ${L(cx + 110, cy - 60)}`,
                    { stroke: 'gold', strokeWidth: 22, lineCap: 'butt', z: 12 }),
                pathPart(`${id}_f`, `${M(cx + 10, cy - 140)} ${L(cx - 20, cy + 20)}`,
                    { stroke: 'basalt', strokeWidth: 20, lineCap: 'butt', z: 13 }));
        } else {
            parts.push(
                pathPart(`${id}_a`, `${M(cx - 20, cy + 20)} ${L(cx + 60, cy - 130)}`,
                    { stroke: 'gold', strokeWidth: 18, lineCap: 'butt', z: 12 }),
                pathPart(`${id}_f`, `${M(cx - 120, cy - 130)} ${L(cx + 10, cy + 20)}`,
                    { stroke: 'soil', strokeWidth: 34, lineCap: 'butt', z: 11 }));
        }
    });
    return board('trouble', parts);
}
const troubleIds = (id) => [`${id}_bg`, `${id}_a`, `${id}_b`, `${id}_f`,
                            `${id}_n`, `${id}_t`];

// --- the closing card ------------------------------------------------------

function boardFinal() {
    return board('card', [
        textPart('fn_1', 'Get the geology right,', {
            at: [540, 560], font: `800 52px ${FONT}`, fill: 'ink', maxWidth: 940 }),
        textPart('fn_2', 'and the mine designs itself.', {
            at: [540, 626], font: `800 52px ${FONT}`, fill: 'gold', maxWidth: 940 }),
        textPart('fn_s', 'Finding Gold  ·  ten parts  ·  '
            + 'educational, not a design standard', {
            at: [540, 724], font: TYPE.small, fill: 'dim', maxWidth: 940,
            lineHeight: 34 }),
        textPart('made', 'Animated with', {
            at: [540, 900], font: TYPE.label, fill: 'dim', maxWidth: 940 }),
        textPart('name', 'JIREX', {
            at: [540, 1000], font: `800 124px ${FONT}`, fill: 'ink', maxWidth: 940 }),
        textPart('what', 'an open-source browser animation engine — '
            + 'every frame of this series was rendered by it', {
            at: [540, 1082], font: TYPE.small, fill: 'dim', maxWidth: 900,
            lineHeight: 34 }),
        textPart('repo', REPO, {
            at: [540, 1190], font: `700 40px ${FONT}`, fill: 'gold', maxWidth: 940 }),
        textPart('lic', 'MIT licensed  ·  free to use, fork and build on', {
            at: [540, 1244], font: TYPE.small, fill: 'dim', maxWidth: 940 }),
        textPart('call', 'Add a feature. Send a pull request.', {
            at: [540, 1320], font: TYPE.label, fill: 'ink', maxWidth: 940 }),
    ]);
}

// --- the film --------------------------------------------------------------

export function partTen() {
    const boards = [boardChoice(), boardPit(), boardAngles(), boardMethods(),
                    boardTrouble(), boardFinal()];
    const characters = { ...CHARACTERS };
    for (const b of boards) characters[b.name] = effect(b.parts, { palette: 'geo' });
    characters.title_b = effect(titleParts(`${SERIES.toUpperCase()}  ·  PART 10`,
        'Designing the mine'), { palette: 'geo' });

    const scenes = [
        {
            id: 'choice', palette: 'geo',
            background: { color: '#0d1420' },
            transitionIn: { kind: 'fade', from: '#000000', duration: 0.9 },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('title_b', { alpha: 1, z: 60 }),
                   castBoard('choice')],
            shots: [
                { id: 'd0', duration: 7.5, dialogue: [vo(PX[0], 0.7)],
                  actions: build('title_b', ['kicker', 'title'], 0.4,
                                 { gap: 0.3, span: 0.5 }) },
                { id: 'd1', duration: 4.0, dialogue: [vo(PX[1], 0.4)],
                  actions: [
                      ...conceal('title_b', 'kicker', 0.2, { span: 0.4 }),
                      ...conceal('title_b', 'title', 0.3, { span: 0.4 }),
                      { target: 'choice', do: 'show', at: 0.8, for: 0.4 },
                      ...reveal('choice', 'ch_h', 1.0, { span: 0.4 }),
                  ] },
                { id: 'd2', duration: 14.0, dialogue: [vo(PX[2], 0.4)],
                  actions: [
                      ...build('choice', ['ch_sr'], 0.6, { gap: 0.1, span: 0.4 }),
                      ...build('choice', ['ch_p0', 'ch_p0r'], 4.0,
                               { gap: 0.15, span: 0.4 }),
                      ...build('choice', ['ch_p1', 'ch_p1r'], 6.6,
                               { gap: 0.15, span: 0.4 }),
                      ...build('choice', ['ch_p2', 'ch_p2r'], 9.6,
                               { gap: 0.15, span: 0.4 }),
                      ...reveal('choice', 'ch_c', 11.6, { span: 0.5 }),
                  ] },
                { id: 'd3', duration: 10.5, dialogue: [vo(PX[3], 0.4)], actions: [] },
            ],
        },
        {
            id: 'pit', palette: 'geo',
            background: { color: '#0d1420' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('pit', { alpha: 1 }), castBoard('angles')],
            shots: [
                { id: 'd4', duration: 4.5, dialogue: [vo(PX[4], 0.4)],
                  actions: reveal('pit', 'pt_h', 0.3, { span: 0.4 }) },
                { id: 'd5', duration: 14.0, dialogue: [vo(PX[5], 0.4)],
                  actions: [
                      ...reveal('pit', 'pt_wall', 0.5, { span: 0.9 }),
                      ...build('pit', ['pt_bl', 'pt_bl_lead'], 1.8, { gap: 0.1 }),
                      ...reveal('pit', 'pt_overall', 7.0, { span: 0.7 }),
                      ...build('pit', ['pt_ol', 'pt_ol_lead'], 8.0, { gap: 0.1 }),
                  ] },
                { id: 'd6', duration: 10.0, dialogue: [vo(PX[6], 0.4)],
                  actions: [
                      { target: 'pit', do: 'hide', at: 0.2, for: 0.5 },
                      { target: 'angles', do: 'show', at: 0.7, for: 0.4 },
                      ...reveal('angles', 'an_h', 0.9, { span: 0.4 }),
                      ...build('angles', ['an_a', 'an_ad', 'an_al'], 1.6,
                               { gap: 0.15, span: 0.4 }),
                      ...build('angles', ['an_b', 'an_bd', 'an_bl'], 4.6,
                               { gap: 0.15, span: 0.4 }),
                      ...reveal('angles', 'an_c', 6.0, { span: 0.5 }),
                  ] },
            ],
        },
        {
            id: 'methods', palette: 'geo',
            background: { color: '#0d1420' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('methods', { alpha: 1 })],
            shots: [
                { id: 'd7', duration: 4.5, dialogue: [vo(PX[7], 0.4)],
                  actions: reveal('methods', 'me_h', 0.3, { span: 0.4 }) },
                { id: 'd8', duration: 15.0, dialogue: [vo(PX[8], 0.4)],
                  actions: build('methods', methodIds('m1'), 0.5,
                                 { gap: 0.1, span: 0.4 }) },
                { id: 'd9', duration: 10.5, dialogue: [vo(PX[9], 0.4)],
                  actions: build('methods', methodIds('m2'), 0.4,
                                 { gap: 0.1, span: 0.4 }) },
                { id: 'd10', duration: 10.5, dialogue: [vo(PX[10], 0.4)],
                  actions: build('methods', methodIds('m3'), 0.4,
                                 { gap: 0.1, span: 0.4 }) },
                { id: 'd11', duration: 12.0, dialogue: [vo(PX[11], 0.4)],
                  actions: build('methods', methodIds('m4'), 0.4,
                                 { gap: 0.1, span: 0.4 }) },
            ],
        },
        {
            id: 'trouble', palette: 'geo',
            background: { color: '#0d1420' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('trouble', { alpha: 1 })],
            shots: [
                { id: 'd12', duration: 14.0, dialogue: [vo(PX[12], 0.5)],
                  actions: [
                      ...reveal('trouble', 'tr_h', 0.3, { span: 0.4 }),
                      ...build('trouble', troubleIds('x1'), 1.4,
                               { gap: 0.1, span: 0.4 }),
                      ...build('trouble', troubleIds('x2'), 7.4,
                               { gap: 0.1, span: 0.4 }),
                  ] },
                { id: 'd13', duration: 11.5, dialogue: [vo(PX[13], 0.4)],
                  actions: [
                      ...build('trouble', troubleIds('x3'), 0.5,
                               { gap: 0.1, span: 0.4 }),
                      ...build('trouble', troubleIds('x4'), 5.2,
                               { gap: 0.1, span: 0.4 }),
                  ] },
            ],
        },
        {
            id: 'talk', palette: 'geo',
            background: { color: '#101a26' },
            transitionOut: { kind: 'crossfade', duration: 0.8 },
            cast: [
                { character: 'zawadi', as: 'zawadi', at: [330, TALK_Y], scale: 1.5,
                  view: 'threeQuarter' },
                { character: 'juma', as: 'juma', at: [770, TALK_Y], scale: 1.5,
                  view: 'threeQuarter', facing: -1 },
            ],
            shots: [
                { id: 'd14', duration: 4.2, framing: 'wide', on: 'juma',
                  dialogue: [says('juma', PX[14], 0.5)],
                  actions: [
                      { target: 'zawadi', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'juma', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'juma', do: 'pose', pose: 'ask', at: 0.3, for: 0.5 },
                      { target: 'zawadi', do: 'play', action: 'breathe' },
                      { target: 'juma', do: 'play', action: 'breathe' },
                      ...blinks('zawadi', 4.2, 211), ...blinks('juma', 4.2, 223),
                  ] },
                { id: 'd15', duration: 4.5, framing: 'wide', on: 'zawadi',
                  dialogue: [says('zawadi', PX[15], 0.4)],
                  actions: [
                      { target: 'juma', do: 'pose', pose: 'stand', at: 0.2, for: 0.5 },
                      { target: 'zawadi', do: 'pose', pose: 'present', at: 0.4, for: 0.6 },
                      { target: 'zawadi', do: 'play', action: 'breathe' },
                      { target: 'juma', do: 'play', action: 'breathe' },
                      ...blinks('zawadi', 4.5, 227), ...blinks('juma', 4.5, 229),
                  ] },
                { id: 'd16', duration: 13.0, framing: 'wide', on: 'zawadi',
                  dialogue: [vo(PX[16], 0.4)],
                  actions: [
                      { target: 'zawadi', do: 'pose', pose: 'stand', at: 0.6, for: 0.6 },
                      { target: 'zawadi', do: 'play', action: 'breathe' },
                      { target: 'juma', do: 'play', action: 'breathe' },
                      ...blinks('zawadi', 14.0, 233), ...blinks('juma', 14.0, 239),
                  ] },
            ],
        },
        {
            id: 'card', palette: 'geo',
            background: { color: '#06090f' },
            transitionIn: { kind: 'crossfade', duration: 0.8 },
            cast: [offstage(), castBoard('card', { alpha: 1 })],
            shots: [
                { id: 'c1', duration: 10.5,
                  actions: build('card',
                      ['fn_1', 'fn_2', 'fn_s', 'made', 'name', 'what', 'repo',
                       'lic', 'call'],
                      0.5, { gap: 0.3, span: 0.45 }) },
            ],
        },
    ];

    return {
        version: 'jirex.film/1',
        meta: META('Designing a mine'),
        voices: VOICES,
        palettes: { geo: GEO_PALETTE },
        characters,
        scenes,
    };
}
