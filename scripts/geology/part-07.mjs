/**
 * Part 7 — Magnetic surveys.
 *
 * What a magnetic map is actually a map OF, why an altered shear zone reads
 * as a low, and how line spacing decides what you are able to see at all.
 * The susceptibility figures are the conventional ranges in SI units; they
 * span three orders of magnitude, which is why that chart is logarithmic.
 */
import {
    GROUND_Y, L, M, Q, TYPE, Z, arrowPath, build, captionPart, conceal, effect,
    ellipsePart, glide, labelParts, logScale, pathPart, poly, pop, ramp,
    rectPart, reveal, smooth, textPart, titleParts,
} from '../lib/diagram.mjs';
import {
    CHARACTERS, GEO_PALETTE, META, SERIES, VOICES, endCard, offstage, says, vo,
} from '../lib/series.mjs';
import { blinks, board, castBoard, rng } from './common.mjs';

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const TALK_Y = Math.round(GROUND_Y - 274 * 1.5);

const P7 = [
    /* 0 */ 'Most exploration targets never reach the surface. Geophysics is how you map '
          + 'rock through the ground that covers it.',
    /* 1 */ 'Start with magnetics. It is the cheapest, the fastest and the most used '
          + 'tool in hard-rock exploration.',
    /* 2 */ 'The Earth has a magnetic field, and rocks containing magnetite distort it '
          + '— locally, and measurably. Measure the total field along closely '
          + 'spaced lines and you are mapping magnetite.',
    /* 3 */ 'Banded iron formation screams. Basalt and dolerite are strongly magnetic. '
          + 'Granite is moderate. Sedimentary rock is nearly blank. So a magnetic map '
          + 'is a geological map of ground you cannot see.',
    /* 4 */ 'Then the part that matters for gold.',
    /* 5 */ 'Hydrothermal fluid destroys magnetite, turning it into pyrite and '
          + 'carbonate. So an altered, mineralised shear zone often shows up as a '
          + 'narrow magnetic low, cutting across the magnetic rocks around it.',
    /* 6 */ 'You are not seeing the gold. You are seeing the plumbing. And it cuts both '
          + 'ways — some systems build magnetite instead, and read as highs. Which '
          + 'it is, you establish in each district, by drilling.',
    /* 7 */ 'How it is flown decides what you can see.',
    /* 8 */ 'Line spacing sets resolution. You cannot resolve a feature narrower than '
          + 'about half your line spacing. So regional work flies four hundred metres, '
          + 'and detail work flies fifty.',
    /* 9 */ 'Low flying is sharp and dangerous. High flying is smooth and blind. And '
          + 'lines go across the strike. Never along it.',
    /*10 */ 'Raw total field is then processed to be readable. Reduction to the pole '
          + 'moves each anomaly back over its source. The analytic signal puts the peak '
          + 'on the edge of the body.',
    /*11 */ 'And you read structure straight off that?',
    /*12 */ 'You read the fabric. Then you read what interrupts it.',
    /*13 */ 'Where the fabric bends, breaks or steps sideways, there is a fault. Mark '
          + 'every break and every offset, and you have the structural map the soil '
          + 'never gave you.',
];

// --- board: seeing through cover -------------------------------------------

function boardCover() {
    return board('cover', [
        textPart('cv_h', 'mapping what you cannot see', {
            at: [540, 500], font: TYPE.heading, fill: 'ink', maxWidth: 940 }),
        // Concealed geology, with the cover over it.
        rectPart('cv_rock', 900, 420, { at: [540, 980], fill: 'greenstone',
            alpha: 1, z: 8 }),
        pathPart('cv_bif', `${M(120, 1150)} ${Q(400, 980, 700, 940)} ${L(960, 880)}`,
            { stroke: 'structure', strokeWidth: 44, alpha: 1, z: 9 }),
        pathPart('cv_dyke', `${M(300, 1190)} ${L(660, 772)}`,
            { stroke: 'basalt', strokeWidth: 30, alpha: 1, z: 9 }),
        // The cover, which hides all of it.
        rectPart('cv_soil', 900, 420, { at: [540, 980], fill: 'soil', z: 14 }),
        textPart('cv_s', 'soil, laterite and sand', { at: [540, 980],
            font: TYPE.caption, fill: '#241a14', z: 15 }),
        captionPart('cv_c', 'geophysics measures through it'),
    ]);
}

// --- board: the field over a body ------------------------------------------

function boardField() {
    const parts = [
        textPart('fd_h', 'a body in the field', {
            at: [540, 500], font: TYPE.heading, fill: 'ink' }),
        // The profile a survey would record.
        pathPart('fd_prof', smooth([[120, 700], [330, 694], [430, 660], [540, 580],
                                    [650, 660], [750, 694], [960, 700]]),
            { stroke: 'gold', strokeWidth: 6, z: 14 }),
        ...labelParts('fd_pl', 'the anomaly, as measured', [1004, 596], [660, 666]),
        rectPart('fd_ground', 900, 360, { at: [540, 1060], fill: 'greenstone',
            alpha: 1, z: 8 }),
        ellipsePart('fd_body', 120, 72, { at: [540, 1110], fill: 'basalt',
            stroke: '#1b2a36', strokeWidth: 3, alpha: 1, z: 10 }),
        ...labelParts('fd_bl', 'magnetite-bearing rock', [92, 1260], [470, 1150]),
    ];
    // Field lines, bending over the body.
    for (let i = 0; i < 6; i++) {
        const y = 790 + i * 34;
        const lift = 54 - i * 7;
        parts.push(pathPart(`fd_f${i}`, `${M(120, y)} ${Q(330, y - lift * 0.3, 430, y - lift * 0.8)} `
            + `${Q(540, y - lift, 650, y - lift * 0.8)} ${Q(750, y - lift * 0.3, 960, y)}`,
            { stroke: '#6f88a8', strokeWidth: 3, z: 9 }));
    }
    return board('field', parts);
}

// --- board: how magnetic each rock is --------------------------------------

const SUSC = [
    ['su1', 120, 'banded iron formation', 'structure'],
    ['su2', 60, 'basalt, dolerite', 'basalt'],
    ['su3', 12, 'granite', 'granite'],
    ['su4', 0.5, 'sandstone, shale', 'dim'],
];

function boardSusc() {
    const x0 = 340;
    const x1 = 980;
    const sx = logScale(0.2, 200, x0, x1);
    const parts = [
        textPart('su_h', 'how magnetic a rock is', {
            at: [540, 496], font: TYPE.heading, fill: 'ink', maxWidth: 940 }),
        textPart('su_s', 'magnetic susceptibility  ·  ×10⁻³ SI  '
            + '·  log scale', {
            at: [540, 552], font: TYPE.small, fill: 'dim', maxWidth: 940 }),
        pathPart('su_ax', `${M(x0, 1060)} ${L(x1, 1060)}`,
            { stroke: 'dim', strokeWidth: 3, z: 10 }),
        ...[0.2, 2, 20, 200].map((v, i) => textPart(`su_x${i}`, String(v), {
            at: [sx(v), 1104], font: TYPE.small, fill: 'dim', z: 10 })),
    ];
    SUSC.forEach(([id, v, label, color], i) => {
        const y = 660 + i * 88;
        const w = Math.max(6, sx(v) - x0);
        parts.push(
            rectPart(id, w, 46, { at: [x0 + w / 2, y], fill: color, z: 12 }),
            textPart(`${id}_l`, label, { at: [x0 - 20, y], font: TYPE.small,
                fill: 'ink', align: 'right', maxWidth: 280, z: 12 }),
        );
    });
    parts.push(captionPart('su_c', 'a magnetic map is a geology map'));
    return board('susc', parts);
}

// --- board: the fabric, and the low that cuts it ---------------------------

/** The magnetic fabric: parallel bands, as an image would show them. */
function fabricParts(prefix, { z = 9 } = {}) {
    const out = [];
    for (let i = 0; i < 13; i++) {
        const y = 600 + i * 50;
        out.push(pathPart(`${prefix}${i}`,
            `${M(100, y)} ${Q(420, y - 34, 700, y - 10)} ${L(980, y - 26)}`,
            { stroke: i % 3 === 0 ? '#9a5a3c' : i % 3 === 1 ? '#6f4a53' : '#4a4466',
              strokeWidth: 36, alpha: 1, z }));
    }
    return out;
}
const fabricIds = (prefix) => Array.from({ length: 13 }, (_, i) => `${prefix}${i}`);

function boardLow() {
    return board('low', [
        textPart('lo_h', 'the shear reads as a LOW', {
            at: [540, 500], font: TYPE.heading, fill: 'ink', maxWidth: 940 }),
        rectPart('lo_bg', 900, 700, { at: [540, 920], fill: '#1a2230', alpha: 1, z: 8 }),
        ...fabricParts('lo_f'),
        // The altered zone: magnetite destroyed, so a dark narrow band.
        pathPart('lo_low', `${M(300, 1270)} ${Q(470, 940, 700, 600)}`,
            { stroke: '#0c1018', strokeWidth: 48, lineCap: 'butt', z: 12 }),
        ...labelParts('lo_ll', 'magnetite destroyed by alteration',
            [1004, 1310], [640, 1000]),
        captionPart('lo_c2', 'not the gold — the plumbing', { y: 1250 }),
    ]);
}

// --- board: line spacing ---------------------------------------------------

function boardSpacing() {
    const parts = [
        textPart('ls_h', 'you cannot resolve what you did not fly over', {
            at: [540, 496], font: TYPE.heading, fill: 'ink', maxWidth: 940 }),
    ];
    [['a', 230, '400 m lines', 3, false], ['b', 750, '50 m lines', 11, true]]
        .forEach(([k, cx, label, n, resolves]) => {
            parts.push(
                rectPart(`ls_${k}`, 400, 440, { at: [cx, 860], fill: '#1d2a21',
                    stroke: '#2a3b52', strokeWidth: 3, z: 9 }),
                // The body, the same in both panels.
                pathPart(`ls_${k}b`, `${M(cx - 130, 1040)} ${L(cx + 120, 700)}`,
                    { stroke: 'structure', strokeWidth: 26, alpha: 1, z: 10 }),
                textPart(`ls_${k}l`, label, { at: [cx, 1130], font: TYPE.label,
                    fill: 'ink', maxWidth: 400, z: 12 }),
                textPart(`ls_${k}v`, resolves ? 'resolved' : 'missed', {
                    at: [cx, 1186], font: `700 32px ${FONT}`,
                    fill: resolves ? 'gold' : 'structure', maxWidth: 400, z: 12 }),
            );
            for (let i = 0; i < n; i++) {
                const x = cx - 180 + (i + 0.5) * (360 / n);
                parts.push(pathPart(`ls_${k}f${i}`, `${M(x, 650)} ${L(x, 1070)}`,
                    { stroke: '#8ea0b8', strokeWidth: 2, alpha: 1, z: 11 }));
            }
        });
    parts.push(captionPart('ls_c', 'and flown across the strike, never along it'));
    return board('spacing', parts);
}

// --- board: three renderings of the same data ------------------------------

function boardProcess() {
    const r = rng(707);
    const parts = [
        textPart('pc_h', 'the same data, three ways', {
            at: [540, 500], font: TYPE.heading, fill: 'ink', maxWidth: 940 }),
    ];
    const PANELS = [
        ['tf', 180, 'total field', 'the anomaly sits BESIDE its source'],
        ['rtp', 540, 'reduced to pole', 'moved back over the source'],
        ['as', 900, 'analytic signal', 'peaks on the body edge'],
    ];
    PANELS.forEach(([k, cx, name, note], i) => {
        parts.push(
            rectPart(`pc_${k}`, 320, 320, { at: [cx, 800], fill: '#182230',
                stroke: '#2a3b52', strokeWidth: 3, z: 9 }),
            textPart(`pc_${k}n`, name, { at: [cx, 1000], font: TYPE.small,
                fill: 'ink', maxWidth: 330, z: 12 }),
            textPart(`pc_${k}t`, note, { at: [cx, 1080], font: TYPE.small,
                fill: 'dim', maxWidth: 330, lineHeight: 32, z: 12 }),
        );
        // The anomaly: offset in TF, centred in RTP, edge-peaked in AS.
        const blobs = i === 0 ? [[cx + 46, 760, 60], [cx - 36, 860, 34]]
            : i === 1 ? [[cx, 800, 66]]
            : [[cx - 54, 800, 30], [cx + 54, 800, 30]];
        blobs.forEach(([x, y, rad], j) => parts.push(
            ellipsePart(`pc_${k}b${j}`, rad, rad * 0.85, { at: [x, y],
                fill: j === 0 ? 'gold' : 'sulphide', z: 11,
                glow: { blur: 26, color: '#ffc64d' } })));
        // A dashed outline of where the body actually is.
        parts.push(pathPart(`pc_${k}o`,
            `${M(cx - 40, 740)} ${L(cx + 40, 740)} ${L(cx + 40, 860)} `
            + `${L(cx - 40, 860)} ${Z}`,
            { stroke: 'ink', strokeWidth: 2, alpha: 1, z: 13 }));
    });
    return board('process', parts);
}
const panelIds = (k) => [`pc_${k}`, `pc_${k}n`, `pc_${k}t`, `pc_${k}b0`, `pc_${k}b1`];

// --- board: reading the fabric ---------------------------------------------

function boardFabric() {
    const parts = [
        textPart('fb_h', 'read the fabric, then what breaks it', {
            at: [540, 496], font: TYPE.heading, fill: 'ink', maxWidth: 940 }),
        rectPart('fb_bg', 900, 700, { at: [540, 920], fill: '#1a2230', alpha: 1, z: 8 }),
        ...fabricParts('fb_f'),
        // A fault, offsetting the fabric.
        pathPart('fb_fault', `${M(250, 1270)} ${L(830, 590)}`,
            { stroke: 'gold', strokeWidth: 5, z: 14 }),
        ...labelParts('fb_fl', 'a fault — the fabric steps across it',
            [1004, 1310], [640, 960]),
        // Two targets, where structures cross.
        ellipsePart('fb_t1', 34, 34, { at: [474, 1000], fill: null, stroke: 'gold',
            strokeWidth: 5, z: 15 }),
        ellipsePart('fb_t2', 30, 30, { at: [690, 748], fill: null, stroke: 'gold',
            strokeWidth: 5, z: 15 }),
        captionPart('fb_c', 'the structural map the soil never gave you', { y: 1250 }),
    ];
    return board('fabric', parts);
}

// --- the film --------------------------------------------------------------

export function partSeven() {
    const card = endCard('Next: the survey that finds the sulphides themselves.');
    const boards = [boardCover(), boardField(), boardSusc(), boardLow(), boardSpacing(),
                    boardProcess(), boardFabric(), board('card', card.parts)];
    const characters = { ...CHARACTERS };
    for (const b of boards) characters[b.name] = effect(b.parts, { palette: 'geo' });
    characters.title_b = effect(titleParts(`${SERIES.toUpperCase()}  ·  PART 7`,
        'Magnetics'), { palette: 'geo' });

    const scenes = [
        {
            id: 'cover', palette: 'geo',
            background: { color: '#0d1420' },
            transitionIn: { kind: 'fade', from: '#000000', duration: 0.9 },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('title_b', { alpha: 1, z: 60 }),
                   castBoard('cover', { alpha: 1 })],
            shots: [
                { id: 'm0', duration: 9.5, dialogue: [vo(P7[0], 0.7)],
                  actions: [
                      ...build('title_b', ['kicker', 'title'], 0.4,
                               { gap: 0.3, span: 0.5 }),
                      ...reveal('cover', 'cv_soil', 2.6, { span: 0.5 }),
                      ...reveal('cover', 'cv_s', 3.0, { span: 0.4 }),
                      // The cover lifts away, and the geology is underneath.
                      ...conceal('cover', 'cv_soil', 6.2, { span: 1.1 }),
                      ...conceal('cover', 'cv_s', 6.2, { span: 0.6 }),
                  ] },
                { id: 'm1', duration: 8.5, dialogue: [vo(P7[1], 0.4)],
                  actions: [
                      ...conceal('title_b', 'kicker', 0.2, { span: 0.4 }),
                      ...conceal('title_b', 'title', 0.3, { span: 0.4 }),
                      ...reveal('cover', 'cv_h', 0.8, { span: 0.4 }),
                      ...reveal('cover', 'cv_c', 4.0, { span: 0.5 }),
                  ] },
            ],
        },
        {
            id: 'field', palette: 'geo',
            background: { color: '#0d1420' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('field', { alpha: 1 }), castBoard('susc')],
            shots: [
                { id: 'm2', duration: 19.0, dialogue: [vo(P7[2], 0.5)],
                  actions: [
                      ...reveal('field', 'fd_h', 0.3, { span: 0.4 }),
                      ...build('field', ['fd_f0', 'fd_f1', 'fd_f2', 'fd_f3', 'fd_f4',
                                         'fd_f5'], 1.0, { gap: 0.18, span: 0.35 }),
                      ...build('field', ['fd_bl', 'fd_bl_lead'], 6.0, { gap: 0.1 }),
                      ...reveal('field', 'fd_prof', 10.0, { span: 0.9 }),
                      ...build('field', ['fd_pl', 'fd_pl_lead'], 11.4, { gap: 0.1 }),
                  ] },
                { id: 'm3', duration: 16.5, dialogue: [vo(P7[3], 0.4)],
                  actions: [
                      { target: 'field', do: 'hide', at: 0.2, for: 0.5 },
                      { target: 'susc', do: 'show', at: 0.7, for: 0.4 },
                      ...build('susc', ['su_h', 'su_s', 'su_ax', 'su_x0', 'su_x1',
                                        'su_x2', 'su_x3'], 0.9, { gap: 0.07, span: 0.3 }),
                      ...build('susc', ['su1', 'su1_l'], 2.4, { gap: 0.1, span: 0.35 }),
                      ...build('susc', ['su2', 'su2_l'], 4.4, { gap: 0.1, span: 0.35 }),
                      ...build('susc', ['su3', 'su3_l'], 6.4, { gap: 0.1, span: 0.35 }),
                      ...build('susc', ['su4', 'su4_l'], 8.4, { gap: 0.1, span: 0.35 }),
                      ...reveal('susc', 'su_c', 12.0, { span: 0.5 }),
                  ] },
            ],
        },
        {
            id: 'low', palette: 'geo',
            background: { color: '#0d1420' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('low', { alpha: 1 })],
            shots: [
                { id: 'm4', duration: 4.0, dialogue: [vo(P7[4], 0.4)],
                  actions: build('low', fabricIds('lo_f'), 0.3,
                                 { gap: 0.1, span: 0.3 }) },
                { id: 'm5', duration: 20.0, dialogue: [vo(P7[5], 0.4)],
                  actions: [
                      ...reveal('low', 'lo_h', 0.4, { span: 0.4 }),
                      ...reveal('low', 'lo_low', 8.0, { span: 1.0 }),
                      ...build('low', ['lo_ll', 'lo_ll_lead'], 9.6, { gap: 0.1 }),
                  ] },
                { id: 'm6', duration: 11.0, dialogue: [vo(P7[6], 0.4)],
                  actions: reveal('low', 'lo_c2', 1.0, { span: 0.5 }) },
            ],
        },
        {
            id: 'survey', palette: 'geo',
            background: { color: '#0d1420' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('spacing', { alpha: 1 })],
            shots: [
                { id: 'm7', duration: 4.5, dialogue: [vo(P7[7], 0.4)],
                  actions: reveal('spacing', 'ls_h', 0.3, { span: 0.4 }) },
                { id: 'm8', duration: 17.0, dialogue: [vo(P7[8], 0.4)],
                  actions: [
                      ...build('spacing', ['ls_a', 'ls_al'], 0.6, { gap: 0.2, span: 0.4 }),
                      ...reveal('spacing', 'ls_av', 4.0, { span: 0.4 }),
                      ...build('spacing', ['ls_b', 'ls_bl'], 8.0, { gap: 0.2, span: 0.4 }),
                      ...reveal('spacing', 'ls_bv', 11.6, { span: 0.4 }),
                  ] },
                { id: 'm9', duration: 11.0, dialogue: [vo(P7[9], 0.4)],
                  actions: reveal('spacing', 'ls_c', 9.0, { span: 0.5 }) },
            ],
        },
        {
            id: 'process', palette: 'geo',
            background: { color: '#0d1420' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('process', { alpha: 1 })],
            shots: [
                { id: 'm10', duration: 17.0, dialogue: [vo(P7[10], 0.5)],
                  actions: [
                      ...reveal('process', 'pc_h', 0.3, { span: 0.4 }),
                      ...build('process', [...panelIds('tf'), 'pc_tfo'], 1.2,
                               { gap: 0.1, span: 0.35 }),
                      ...build('process', [...panelIds('rtp'), 'pc_rtpo'], 7.0,
                               { gap: 0.1, span: 0.35 }),
                      ...build('process', [...panelIds('as'), 'pc_aso'], 12.4,
                               { gap: 0.1, span: 0.35 }),
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
                castBoard('fabric', { alpha: 0, z: 40 }),
            ],
            shots: [
                { id: 'm11', duration: 4.2, framing: 'wide', on: 'juma',
                  dialogue: [says('juma', P7[11], 0.5)],
                  actions: [
                      { target: 'zawadi', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'juma', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'juma', do: 'pose', pose: 'ask', at: 0.3, for: 0.5 },
                      { target: 'zawadi', do: 'play', action: 'breathe' },
                      { target: 'juma', do: 'play', action: 'breathe' },
                      ...blinks('zawadi', 4.2, 151), ...blinks('juma', 4.2, 157),
                  ] },
                { id: 'm12', duration: 5.0, framing: 'wide', on: 'zawadi',
                  dialogue: [says('zawadi', P7[12], 0.4)],
                  actions: [
                      { target: 'juma', do: 'pose', pose: 'stand', at: 0.2, for: 0.5 },
                      { target: 'zawadi', do: 'pose', pose: 'present', at: 0.4, for: 0.6 },
                      { target: 'zawadi', do: 'play', action: 'breathe' },
                      { target: 'juma', do: 'play', action: 'breathe' },
                      ...blinks('zawadi', 5.0, 163), ...blinks('juma', 5.0, 167),
                  ] },
                { id: 'm13', duration: 18.0, dialogue: [vo(P7[13], 0.4)],
                  actions: [
                      { target: 'zawadi', do: 'hide', at: 0.3, for: 0.4 },
                      { target: 'juma', do: 'hide', at: 0.3, for: 0.4 },
                      { target: 'fabric', do: 'show', at: 0.8, for: 0.5 },
                      ...reveal('fabric', 'fb_h', 1.0, { span: 0.4 }),
                      ...reveal('fabric', 'fb_fault', 4.0, { span: 0.8 }),
                      ...build('fabric', ['fb_fl', 'fb_fl_lead'], 5.2, { gap: 0.1 }),
                      ...build('fabric', ['fb_t1', 'fb_t2'], 11.0,
                               { gap: 0.5, span: 0.4, how: pop }),
                      ...reveal('fabric', 'fb_c', 13.0, { span: 0.5 }),
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
        meta: META('Magnetic surveys'),
        voices: VOICES,
        palettes: { geo: GEO_PALETTE },
        characters,
        scenes,
    };
}
