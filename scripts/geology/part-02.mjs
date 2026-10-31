/**
 * Part 2 — Deposit types, and what a grade means.
 *
 * Six deposit styles as cards, then the number everyone gets wrong. The
 * tonne-of-rock block is drawn to SCALE against its one gram of gold: a
 * 0.72 m cube against a 2.3 mm bead, which is 1.4 pixels when the cube is
 * 440. Drawing the bead bigger would be the comfortable lie, so it is drawn
 * at its real size with a glow and a leader, and the narration says so.
 */
import {
    L, M, Q, TYPE, Z, arrowPath, build, captionPart, conceal, effect,
    ellipsePart, labelParts, pathPart, poly, pop, ramp, rectPart, reveal,
    scale, textPart, titleParts,
} from '../lib/diagram.mjs';
import {
    CHARACTERS, GEO_PALETTE, META, SERIES, VOICES, endCard, offstage, says, vo,
} from '../lib/series.mjs';
import { GROUND_Y } from '../lib/diagram.mjs';
import { blinks, board, castBoard } from './common.mjs';

const TALK_Y = Math.round(GROUND_Y - 274 * 1.5);

const P2 = [
    /* 0 */ 'Gold does not occur in one way. Where it sits decides how you look for '
          + 'it, and how you would mine it.',
    /* 1 */ 'Orogenic lode gold. Quartz and carbonate veins in deformed greenstone '
          + 'belts: steep, narrow, high grade and deep. Most of the gold in Africa '
          + 'and Australia.',
    /* 2 */ 'Epithermal. Shallow, close to volcanoes, formed where hot spring fluids '
          + 'boil. Veins and stockworks, often carrying silver as well.',
    /* 3 */ 'Porphyry copper-gold. Enormous and low grade, built around a cooling '
          + 'intrusion, with gold as a by-product of copper. Half a gram a tonne, but '
          + 'a billion tonnes of it.',
    /* 4 */ 'Volcanogenic massive sulphide. Metal dumped onto an ancient sea floor by '
          + 'black smokers, then folded into the crust.',
    /* 5 */ 'Laterite. Not a new deposit at all, but an old one weathered in place, '
          + 'with the gold left behind and enriched in the soil.',
    /* 6 */ 'And placer. Gold freed by weathering and sorted by moving water. Part six '
          + 'is entirely about those.',
    /* 7 */ 'Now, grade. Gold grade is grams per tonne, and the numbers are much '
          + 'smaller than people expect.',
    /* 8 */ 'This block is one tonne of rock. And this is one gram of gold, drawn at '
          + 'the same scale. Two point three millimetres across.',
    /* 9 */ 'Around one gram per tonne is the cut-off for a big open pit. Underground '
          + 'needs three to five. A rich narrow vein might run twenty. And a speck you '
          + 'can actually see in a hand specimen is already an unusually rich rock.',
    /*10 */ 'So how do you know whether a whole deposit is worth anything?',
    /*11 */ 'You multiply. Tonnes times grade.',
    /*12 */ 'Ten million tonnes at two grams a tonne is twenty million grams. About six '
          + 'hundred thousand ounces. That is a mine. One spectacular rock is a rock.',
];

// --- board: the six deposit styles ----------------------------------------

const COLS = [300, 780];
const ROWS = [632, 882, 1132];

/** One deposit card: panel, a small schematic, a name and two lines of fact. */
function typeCard(id, { col, row, name, note, grade, icon }) {
    const cx = COLS[col];
    const cy = ROWS[row];
    const left = cx - 218;
    return [
        rectPart(`${id}_bg`, 436, 214, { at: [cx, cy], fill: 'panel',
            stroke: '#243348', strokeWidth: 2, z: 10 }),
        // The schematic sits in a 96px box on the left of the card.
        ...icon(`${id}_i`, left + 66, cy),
        textPart(`${id}_n`, name, { at: [left + 126, cy - 62], font: `700 32px ${FONT}`,
            fill: 'ink', align: 'left', maxWidth: 306, z: 12 }),
        textPart(`${id}_t`, note, { at: [left + 126, cy + 14], font: TYPE.small,
            fill: 'dim', align: 'left', maxWidth: 306, lineHeight: 32, z: 12 }),
        textPart(`${id}_g`, grade, { at: [left + 126, cy + 76], font: TYPE.small,
            fill: 'gold', align: 'left', maxWidth: 306, z: 12 }),
    ];
}
const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

const ids = (id) => [`${id}_bg`, `${id}_i`, `${id}_n`, `${id}_t`, `${id}_g`];

/* Each icon is a 96px-square schematic: the shape of the deposit, not a logo. */
const iconOrogenic = (id, x, y) => [
    rectPart(`${id}`, 96, 96, { at: [x, y], fill: 'greenstone', z: 11 }),
    pathPart(`${id}b`, `${M(x + 26, y + 48)} ${Q(x + 4, y, x - 18, y - 48)}`,
        { stroke: 'quartz', strokeWidth: 9, lineCap: 'butt', z: 12, alpha: 1 }),
];
const iconEpithermal = (id, x, y) => [
    rectPart(`${id}`, 96, 96, { at: [x, y], fill: '#2b3b4d', z: 11 }),
    pathPart(`${id}v`, poly([[x - 40, y + 46], [x, y - 10], [x + 40, y + 46]], true),
        { fill: '#55433a', z: 12, alpha: 1 }),
    pathPart(`${id}f`, `${M(x, y + 44)} ${L(x, y - 6)}`,
        { stroke: 'fluid', strokeWidth: 6, z: 13, alpha: 1 }),
];
const iconPorphyry = (id, x, y) => [
    rectPart(`${id}`, 96, 96, { at: [x, y], fill: '#36414f', z: 11 }),
    ellipsePart(`${id}c`, 34, 34, { at: [x, y + 4], fill: 'granite', z: 12, alpha: 1 }),
    pathPart(`${id}s`, `${M(x - 30, y - 26)} ${L(x + 30, y + 26)} `
        + `${M(x + 30, y - 26)} ${L(x - 30, y + 26)}`,
        { stroke: 'sulphide', strokeWidth: 3, z: 13, alpha: 1 }),
];
const iconVms = (id, x, y) => [
    rectPart(`${id}`, 96, 96, { at: [x, y], fill: '#1d3344', z: 11 }),
    pathPart(`${id}m`, `${M(x - 40, y + 44)} ${Q(x, y + 2, x + 40, y + 44)} ${Z}`,
        { fill: 'sulphide', z: 12, alpha: 1 }),
    pathPart(`${id}c`, `${M(x, y + 16)} ${L(x, y - 36)}`,
        { stroke: '#3b2a24', strokeWidth: 8, z: 13, alpha: 1 }),
];
const iconLaterite = (id, x, y) => [
    rectPart(`${id}`, 96, 96, { at: [x, y], fill: '#6b4a2c', z: 11 }),
    rectPart(`${id}a`, 96, 26, { at: [x, y - 34], fill: '#9a6b3a', z: 12, alpha: 1 }),
    rectPart(`${id}b`, 96, 22, { at: [x, y - 8], fill: '#c08a44', z: 12, alpha: 1 }),
    rectPart(`${id}c`, 96, 30, { at: [x, y + 32], fill: 'greenstone', z: 12, alpha: 1 }),
];
const iconPlacer = (id, x, y) => [
    rectPart(`${id}`, 96, 96, { at: [x, y], fill: '#3a4a3c', z: 11 }),
    pathPart(`${id}r`, `${M(x - 46, y - 22)} ${Q(x, y + 6, x + 46, y - 18)}`,
        { stroke: 'water', strokeWidth: 16, z: 12, alpha: 1 }),
    ellipsePart(`${id}g`, 5, 5, { at: [x + 6, y + 26], fill: 'gold', z: 13, alpha: 1 }),
];

const TYPES = [
    ['t1', { col: 0, row: 0, name: 'Orogenic lode', icon: iconOrogenic,
             note: 'quartz veins in deformed belts', grade: '5 – 15 g/t  ·  deep' }],
    ['t2', { col: 1, row: 0, name: 'Epithermal', icon: iconEpithermal,
             note: 'shallow, volcanic hot springs', grade: '2 – 10 g/t  ·  + silver' }],
    ['t3', { col: 0, row: 1, name: 'Porphyry Cu-Au', icon: iconPorphyry,
             note: 'huge, around an intrusion', grade: '0.3 – 0.8 g/t  ·  Cu first' }],
    ['t4', { col: 1, row: 1, name: 'VMS', icon: iconVms,
             note: 'sea-floor massive sulphide', grade: '1 – 5 g/t  ·  + Cu, Zn' }],
    ['t5', { col: 0, row: 2, name: 'Laterite', icon: iconLaterite,
             note: 'an old deposit, weathered', grade: '0.5 – 2 g/t  ·  soft' }],
    ['t6', { col: 1, row: 2, name: 'Placer', icon: iconPlacer,
             note: 'freed and sorted by water', grade: 'variable  ·  part 6' }],
];

function boardTypes() {
    return board('types', [
        ...titleParts(`${SERIES.toUpperCase()}  ·  PART 2`, 'Where gold sits'),
        ...TYPES.flatMap(([id, spec]) => typeCard(id, spec)),
    ]);
}

// --- board: one tonne, one gram --------------------------------------------

/**
 * Drawn to scale. A tonne of rock at 2.7 t/m3 is 0.37 m3, a 0.72 m cube. One
 * gram of gold at 19.3 g/cm3 is 0.052 cm3, a 4.6 mm sphere -- 2.3 mm radius.
 * At 440 px to 0.72 m, that bead is 1.4 px across.
 */
const CUBE = 440;
const BEAD_PX = (0.0046 / 0.72) * CUBE;          // ~2.8 px diameter

function boardTonne() {
    const cx = 420;
    const cy = 840;
    return board('tonne', [
        textPart('tn_h', 'one gram per tonne', {
            at: [540, 520], font: TYPE.heading, fill: 'ink' }),
        rectPart('tn_cube', CUBE, CUBE, { at: [cx, cy], fill: 'greenstone',
            stroke: '#32503f', strokeWidth: 3, z: 10 }),
        textPart('tn_c1', '1 tonne of rock', {
            at: [cx, cy + CUBE / 2 + 48], font: TYPE.label, fill: 'ink', z: 11 }),
        textPart('tn_c2', '0.72 m on a side', {
            at: [cx, cy + CUBE / 2 + 88], font: TYPE.small, fill: 'dim', z: 11 }),
        // The bead at its true size, with a glow so it is findable at all.
        ellipsePart('tn_bead', BEAD_PX / 2, BEAD_PX / 2, {
            at: [840, cy], fill: 'gold', z: 14,
            glow: { blur: 26, color: '#ffc64d' } }),
        ...labelParts('tn_bl', '1 gram of gold  ·  2.3 mm across',
            [1004, cy - 120], [848, cy - 8]),
        captionPart('tn_cap', 'that is a mineable grade'),
    ]);
}

// --- board: the grade ladder ----------------------------------------------

function boardLadder() {
    const x0 = 300;
    const x1 = 980;
    const sx = scale(0, 22, x0, x1);
    const rows = [
        ['lb_a', 0.004, 'ordinary crustal rock', 'dim'],
        ['lb_b', 0.5, 'porphyry by-product', 'sulphide'],
        ['lb_c', 1.0, 'large open pit cut-off', 'gold'],
        ['lb_d', 4.0, 'underground cut-off', 'gold'],
        ['lb_e', 20, 'a rich narrow vein', 'gold'],
    ];
    const parts = [
        textPart('lb_h', 'what a grade has to be', {
            at: [540, 496], font: TYPE.heading, fill: 'ink' }),
        pathPart('lb_axis', `${M(x0, 1086)} ${L(x1, 1086)}`,
            { stroke: 'dim', strokeWidth: 3, z: 10 }),
        ...[0, 5, 10, 15, 20].map((v, i) => textPart(`lb_x${i}`, String(v), {
            at: [sx(v), 1128], font: TYPE.small, fill: 'dim', z: 10 })),
        textPart('lb_u', 'grams of gold per tonne of rock', {
            at: [(x0 + x1) / 2, 1182], font: TYPE.small, fill: 'dim', z: 10 }),
    ];
    rows.forEach(([id, v, label, color], i) => {
        const y = 656 + i * 88;
        const w = Math.max(4, sx(v) - x0);
        parts.push(
            rectPart(`${id}`, w, 44, { at: [x0 + w / 2, y], fill: color, z: 12 }),
            textPart(`${id}_l`, label, { at: [x0 - 18, y], font: TYPE.small,
                fill: 'ink', align: 'right', maxWidth: 230, z: 12 }),
            textPart(`${id}_v`, v < 0.01 ? '0.004' : String(v), {
                at: [x0 + w + 16, y], font: TYPE.small, fill: color,
                align: 'left', z: 12 }),
        );
    });
    return board('ladder', parts);
}

// --- board: tonnes x grade -------------------------------------------------

function boardMaths() {
    const y = 800;
    return board('maths', [
        textPart('mt_h', 'is it a mine?', {
            at: [540, 560], font: TYPE.heading, fill: 'ink' }),
        textPart('mt_a', '10,000,000 tonnes', {
            at: [540, y], font: `800 56px ${FONT}`, fill: 'ink' }),
        textPart('mt_b', '×  2 grams per tonne', {
            at: [540, y + 86], font: `800 56px ${FONT}`, fill: 'ink' }),
        pathPart('mt_rule', `${M(240, y + 136)} ${L(840, y + 136)}`,
            { stroke: 'dim', strokeWidth: 3, z: 10 }),
        textPart('mt_c', '20,000,000 grams', {
            at: [540, y + 186], font: `800 56px ${FONT}`, fill: 'gold' }),
        textPart('mt_d', '≈ 600,000 ounces', {
            at: [540, y + 262], font: `800 64px ${FONT}`, fill: 'gold' }),
        captionPart('mt_cap', 'one spectacular rock is a rock'),
    ]);
}

// --- the film --------------------------------------------------------------

export function partTwo() {
    const card = endCard('Next: the funnel every discovery has to fall through.');
    const boards = [boardTypes(), boardTonne(), boardLadder(), boardMaths(),
                    board('card', card.parts)];

    const characters = { ...CHARACTERS };
    for (const b of boards) characters[b.name] = effect(b.parts, { palette: 'geo' });

    const cardShot = (id, at) => build('types', ids(id), at, { gap: 0.1, span: 0.36 });

    const scenes = [
        {
            id: 'types', palette: 'geo',
            background: { color: '#0d1420' },
            transitionIn: { kind: 'fade', from: '#000000', duration: 0.9 },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('types', { alpha: 1 })],
            shots: [
                { id: 'y0', duration: 8.0,
                  dialogue: [vo(P2[0], 0.7)],
                  actions: build('types', ['kicker', 'title'], 0.4,
                                 { gap: 0.3, span: 0.5 }) },
                { id: 'y1', duration: 11.5, dialogue: [vo(P2[1], 0.4)],
                  actions: cardShot('t1', 0.3) },
                { id: 'y2', duration: 9.5, dialogue: [vo(P2[2], 0.4)],
                  actions: cardShot('t2', 0.3) },
                { id: 'y3', duration: 12.0, dialogue: [vo(P2[3], 0.4)],
                  actions: cardShot('t3', 0.3) },
                { id: 'y4', duration: 9.0, dialogue: [vo(P2[4], 0.4)],
                  actions: cardShot('t4', 0.3) },
                { id: 'y5', duration: 9.5, dialogue: [vo(P2[5], 0.4)],
                  actions: cardShot('t5', 0.3) },
                { id: 'y6', duration: 8.5, dialogue: [vo(P2[6], 0.4)],
                  actions: cardShot('t6', 0.3) },
            ],
        },
        {
            id: 'grade', palette: 'geo',
            background: { color: '#0d1420' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('tonne'), castBoard('ladder')],
            shots: [
                { id: 'g0', duration: 7.5, dialogue: [vo(P2[7], 0.5)],
                  actions: [{ target: 'tonne', do: 'show', at: 0.1 },
                            ...reveal('tonne', 'tn_h', 0.3, { span: 0.4 })] },
                { id: 'g1', duration: 10.5, dialogue: [vo(P2[8], 0.4)],
                  actions: [
                      ...pop('tonne', 'tn_cube', 0.4, { span: 0.5, overshoot: 0.06 }),
                      ...build('tonne', ['tn_c1', 'tn_c2'], 1.1, { gap: 0.15 }),
                      // The bead last and alone: it has to be looked for.
                      ...reveal('tonne', 'tn_bead', 4.2, { span: 0.4 }),
                      ...build('tonne', ['tn_bl', 'tn_bl_lead'], 5.0, { gap: 0.1 }),
                      ...reveal('tonne', 'tn_cap', 8.0, { span: 0.4 }),
                  ] },
                { id: 'g2', duration: 17.0, dialogue: [vo(P2[9], 0.4)],
                  actions: [
                      { target: 'tonne', do: 'hide', at: 0.2, for: 0.5 },
                      { target: 'ladder', do: 'show', at: 0.7, for: 0.4 },
                      ...build('ladder', ['lb_h', 'lb_axis', 'lb_x0', 'lb_x1', 'lb_x2',
                                          'lb_x3', 'lb_x4', 'lb_u'], 0.9,
                               { gap: 0.06, span: 0.3 }),
                      ...build('ladder', ['lb_a', 'lb_a_l', 'lb_a_v'], 2.6, { gap: 0.08 }),
                      ...build('ladder', ['lb_b', 'lb_b_l', 'lb_b_v'], 5.0, { gap: 0.08 }),
                      ...build('ladder', ['lb_c', 'lb_c_l', 'lb_c_v'], 7.4, { gap: 0.08 }),
                      ...build('ladder', ['lb_d', 'lb_d_l', 'lb_d_v'], 10.2, { gap: 0.08 }),
                      ...build('ladder', ['lb_e', 'lb_e_l', 'lb_e_v'], 12.8, { gap: 0.08 }),
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
                castBoard('maths', { alpha: 0, z: 40 }),
            ],
            shots: [
                { id: 'k0', duration: 5.0, framing: 'wide', on: 'juma',
                  dialogue: [says('juma', P2[10], 0.5)],
                  actions: [
                      { target: 'zawadi', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'juma', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'juma', do: 'pose', pose: 'ask', at: 0.3, for: 0.5 },
                      { target: 'zawadi', do: 'play', action: 'breathe' },
                      { target: 'juma', do: 'play', action: 'breathe' },
                      ...blinks('zawadi', 5.0, 41), ...blinks('juma', 5.0, 53),
                  ] },
                { id: 'k1', duration: 4.5, framing: 'wide', on: 'zawadi',
                  dialogue: [says('zawadi', P2[11], 0.35)],
                  actions: [
                      { target: 'juma', do: 'pose', pose: 'stand', at: 0.2, for: 0.5 },
                      { target: 'zawadi', do: 'pose', pose: 'count', at: 0.4, for: 0.5 },
                      { target: 'zawadi', do: 'play', action: 'breathe' },
                      { target: 'juma', do: 'play', action: 'breathe' },
                      ...blinks('zawadi', 4.5, 43), ...blinks('juma', 4.5, 59),
                  ] },
                { id: 'k2', duration: 14.0,
                  dialogue: [vo(P2[12], 0.4)],
                  actions: [
                      { target: 'zawadi', do: 'hide', at: 0.4, for: 0.35 },
                      { target: 'juma', do: 'hide', at: 0.4, for: 0.35 },
                      { target: 'maths', do: 'show', at: 0.7, for: 0.4 },
                      ...reveal('maths', 'mt_h', 0.9, { span: 0.4 }),
                      ...reveal('maths', 'mt_a', 1.8, { span: 0.4 }),
                      ...reveal('maths', 'mt_b', 3.4, { span: 0.4 }),
                      ...reveal('maths', 'mt_rule', 5.0, { span: 0.3 }),
                      ...reveal('maths', 'mt_c', 5.6, { span: 0.4 }),
                      ...pop('maths', 'mt_d', 8.0, { span: 0.5, overshoot: 0.1 }),
                      ...reveal('maths', 'mt_cap', 11.0, { span: 0.4 }),
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
        meta: META('Where gold sits, and what a grade means'),
        voices: VOICES,
        palettes: { geo: GEO_PALETTE },
        characters,
        scenes,
    };
}
