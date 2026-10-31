/**
 * Sehemu 2 — "Viwanda vitatu vya vito".
 *
 * The three geological environments that make gemstones, and the three
 * conditions every one of them has to supply. The point of the part is
 * practical rather than academic: knowing which factory a stone comes from is
 * what tells you which rocks to walk over.
 *
 * Conventional geology: igneous/pegmatitic (slow cooling, large crystals),
 * metamorphic (recrystallisation under heat and pressure, no melting), and
 * hydrothermal (dissolved elements carried into open fractures). Tanzania's
 * gem belt is the Mozambique Belt, which is metamorphic -- which is why the
 * country's signature stones are tanzanite, tsavorite, ruby and sapphire
 * rather than, say, the pegmatite suite.
 */
import {
    L, M, build, conceal, effect, ellipsePart, pathPart, poly, pop, ramp,
    rectPart, reveal, smooth, textPart,
} from '../lib/diagram.mjs';
import { GROUND_Y } from '../lib/diagram.mjs';
import {
    CHARACTERS, META, VITO_PALETTE, VOICES, offstage, says, vo,
} from '../lib/vito.mjs';
import {
    blinks, board, castBoard, cardRows, endCard, gemParts, hookTitle, statParts,
} from './common.mjs';

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const TALK_Y = Math.round(GROUND_Y - 274 * 1.5);

const P2 = [
    /* 0 HOOK */ 'Vito vyote duniani vinatoka kwenye viwanda vitatu tu, na ukijua '
        + 'kiwanda, unajua miamba ya kutembea juu yake.',
    /* 1 */ 'Kiwanda cha kwanza ni moto: magma. Mwamba unaoyeyuka, kisha unapoa polepole '
          + 'sana chini ya ardhi.',
    /* 2 */ 'Ukipoa haraka, fuwele zinakuwa ndogo. Ukipoa polepole kwa maelfu ya miaka, '
          + 'zinakuwa kubwa za kutosha kuwa kito.',
    /* 3 */ 'Mabaki ya mwisho ya magma yanakusanya maji na vitu vya nadra, na kutengeneza '
          + 'mwamba unaoitwa pegmatite. Hapo ndipo tourmaline na aquamarine zinapatikana.',
    /* 4 */ 'Kiwanda cha pili ni shinikizo: mabadiliko ya mwamba, bila kuyeyuka.',
    /* 5 */ 'Mwamba unakandamizwa na kuchomwa, atomu zinapangika upya, na madini mapya '
          + 'yanazaliwa pale pale ulipokuwa mwamba wa zamani.',
    /* 6 */ 'Hapa ndipo tanzanite inatoka. Pia tsavorite, rubi na yakuti. Na ukanda wa '
          + 'Msumbiji unaopita Tanzania ni kiwanda cha aina hii.',
    /* 7 */ 'Kiwanda cha tatu ni maji ya moto yanayobeba madini yakiyeyuka ndani yake.',
    /* 8 */ 'Maji hayo yanapita kwenye nyufa za miamba. Yanapopoa, hayawezi tena kubeba '
          + 'madini, na madini yanakaa kwenye ufa.',
    /* 9 */ 'Ndiyo maana vito vingi vinapatikana kwenye mishipa myeupe ya quartz. Ule '
          + 'mshipa ulikuwa ufa, na maji yaliujaza.',
    /*10 BAKARI */ 'Lakini mimi nikiwa shambani, sijui mwamba huu ulitoka kiwanda gani. '
          + 'Nitajuaje?',
    /*11 NURU */ 'Kwa vitu vitatu ambavyo kila kiwanda lazima kiwe nacho. Nafasi, muda, na '
          + 'viambato. Kikose kimoja, hakuna kito.',
    /*12 */ 'Nafasi ni ufa, pango au nafasi kati ya chembe. Fuwele haiwezi kukua kwenye '
          + 'mwamba uliojaa.',
    /*13 */ 'Muda ni maelfu hadi mamilioni ya miaka. Fuwele kubwa daima ni fuwele ya zamani.',
    /*14 */ 'Viambato ni vile vya nadra: vanadiumu, kromiamu, berili, boroni. Ndiyo '
          + 'vinavyotoa rangi.',
    /*15 */ 'Kwa hiyo unapoona mwamba uliopasuka, wenye mishipa, na ulio wa zamani sana, '
          + 'umeona sehemu ambayo viwanda vyote vitatu vinaweza kuwa vilifanya kazi.',
    /*16 */ 'Sehemu inayofuata: mto. Kwa sababu vito havikai palipozaliwa.',
];

// --- board: the three factories -------------------------------------------

function boardFactories() {
    const rows = cardRows('f', [
        ['1  ·  MOTO — magma', 'Mwamba unayeyuka, kisha unapoa polepole chini ya ardhi.\n'
            + 'Pegmatite: tourmaline, aquamarine, garnet.', '#e2663c'],
        ['2  ·  SHINIKIZO — metamorphic', 'Joto na mgandamizo bila kuyeyuka. Atomu '
            + 'zinapangika upya.\nTanzanite, tsavorite, rubi, yakuti.', '#5b7cfa'],
        ['3  ·  MAJI YA MOTO — hydrothermal', 'Maji yanabeba madini, yanapoa, madini '
            + 'yanakaa kwenye ufa.\nQuartz, amethyst, zumaridi.', '#4aa3d8'],
    ], { top: 600, h: 190, gap: 26 });
    return { ...board('fact', [
        ...hookTitle('MADINI YA VITO  ·  SEHEMU 2', 'Viwanda vitatu',
                     'kila kito kinatoka kwenye kimojawapo'),
        ...rows.parts,
    ]), rows };
}

// --- board: magma cooling --------------------------------------------------

function boardMagma() {
    const parts = [
        rectPart('bg', 1160, 900, { at: [540, 900], fill: '#2a1a14', alpha: 0, z: -20 }),
        textPart('h', 'KASI YA KUPOA INAAMUA UKUBWA', { at: [540, 520],
            font: `700 32px ${FONT}`, fill: 'dim', alpha: 0, z: 40, maxWidth: 940 }),
        textPart('fastT', 'kupoa haraka', { at: [300, 600], font: `700 29px ${FONT}`,
                                            fill: 'hot', alpha: 0, z: 40 }),
        textPart('slowT', 'kupoa polepole', { at: [780, 600], font: `700 29px ${FONT}`,
                                              fill: 'gem', alpha: 0, z: 40 }),
    ];
    // left: many tiny crystals. right: a few big ones. The comparison IS the
    // teaching, so both are drawn to the same total area.
    let s = 7;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    for (let i = 0; i < 44; i++) {
        const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 190;
        parts.push(rectPart(`sm${i}`, 22, 22, {
            at: [300 + Math.cos(a) * r, 880 + Math.sin(a) * r * 0.9],
            fill: '#d9b48a', stroke: '#8a6a4a', strokeWidth: 1.5, alpha: 0, z: 10 }));
    }
    const BIG = [[760, 790, 96], [880, 900, 76], [726, 950, 84], [860, 1010, 60]];
    BIG.forEach(([x, y, w], i) => {
        parts.push(pathPart(`bg${i}`, poly([[x - w / 2, y], [x, y - w * 0.8],
                                            [x + w / 2, y], [x, y + w * 0.8]], true),
            { fill: '#9fb6ff', stroke: '#e6ecff', strokeWidth: 3, alpha: 0, z: 11 }));
    });
    parts.push(
        pathPart('div', `${M(540, 640)} ${L(540, 1140)}`,
                 { stroke: '#3a4a60', strokeWidth: 3, alpha: 0, z: 30 }),
        textPart('fastN', 'fuwele nyingi ndogo', { at: [300, 1182],
            font: `600 26px ${FONT}`, fill: 'dim', alpha: 0, z: 40, maxWidth: 430 }),
        textPart('slowN', 'fuwele chache kubwa = KITO', { at: [780, 1182],
            font: `800 27px ${FONT}`, fill: 'gem', alpha: 0, z: 40, maxWidth: 430 }),
    );
    return board('magma', parts);
}

// --- board: metamorphic ----------------------------------------------------

function boardMeta() {
    const parts = [
        rectPart('bg', 1160, 860, { at: [540, 900], fill: '#242a33', alpha: 0, z: -20 }),
        textPart('h', 'BILA KUYEYUKA', { at: [540, 528], font: `700 32px ${FONT}`,
                                         fill: 'dim', alpha: 0, z: 40 }),
    ];
    // a gneissic banding that bends: the look of the Mozambique Belt rocks
    for (let i = 0; i < 9; i++) {
        const y = 600 + i * 58;
        parts.push(pathPart(`band${i}`, smooth([[-40, y], [220, y - 26], [540, y + 18],
                                                [860, y - 22], [1120, y + 10]]),
            { stroke: i % 2 ? '#8d97a6' : '#4e5663', strokeWidth: 30, alpha: 0, z: i,
              lineCap: 'butt' }));
    }
    // the squeeze
    parts.push(
        pathPart('sqL', `${M(84, 900)} ${L(250, 900)} ${L(216, 876)} ${M(250, 900)} ${L(216, 924)}`,
                 { stroke: 'fault', strokeWidth: 8, alpha: 0, z: 40, lineCap: 'round' }),
        pathPart('sqR', `${M(996, 900)} ${L(830, 900)} ${L(864, 876)} ${M(830, 900)} ${L(864, 924)}`,
                 { stroke: 'fault', strokeWidth: 8, alpha: 0, z: 40, lineCap: 'round' }),
    );
    // new gems appearing inside the banding
    const G = [[380, 712], [640, 806], [466, 902], [724, 988], [540, 1064]];
    G.forEach(([x, y], i) => {
        parts.push(pathPart(`gm${i}`, poly([[x - 26, y], [x, y - 34], [x + 26, y],
                                            [x, y + 34]], true),
            { fill: 'tanzanite', stroke: 'gem', strokeWidth: 3, alpha: 0, z: 30 }));
    });
    parts.push(textPart('metaT', 'UKANDA WA MSUMBIJI — TANZANIA', {
        at: [540, 1172], font: `800 34px ${FONT}`, fill: 'gem', alpha: 0, z: 40,
        maxWidth: 940 }));
    return { ...board('meta', parts), gemIds: G.map((_, i) => `gm${i}`) };
}

// --- board: hydrothermal ---------------------------------------------------

function boardHydro() {
    const seam = [[80, 1180], [300, 1020], [520, 980], [760, 840], [1000, 700]];
    const parts = [
        rectPart('bg', 1160, 880, { at: [540, 900], fill: '#2d2a24', alpha: 0, z: -20 }),
        textPart('h', 'MAJI YANABEBA, YANAPOA, YANAACHA', { at: [540, 520],
            font: `700 32px ${FONT}`, fill: 'dim', alpha: 0, z: 40, maxWidth: 940 }),
        pathPart('seam', smooth(seam), { stroke: 'quartz', strokeWidth: 52, alpha: 0,
                                         z: -10, lineCap: 'round' }),
        pathPart('flow0', smooth(seam), {
            stroke: 'heat', strokeWidth: 22, alpha: 0, z: -8, lineCap: 'round',
            trim: { end: 0.3, length: 300 }, flow: 0 }),
        pathPart('flow1', smooth(seam.map(([x, y]) => [x, y - 13])), {
            stroke: 'hot', strokeWidth: 10, alpha: 0, z: -7, lineCap: 'round',
            trim: { end: 0.22, length: 390 }, flow: 0 }),
        textPart('ufa', 'UFA', { at: [240, 1098], font: `800 30px ${FONT}`, fill: 'ink',
                                 alpha: 0, z: 40 }),
    ];
    const C = [[360, 1004], [560, 952], [700, 880], [860, 790]];
    C.forEach(([x, y], i) => {
        parts.push(pathPart(`cr${i}`, poly([[x - 22, y + 30], [x - 22, y - 10],
                                            [x, y - 42], [x + 22, y - 10],
                                            [x + 22, y + 30]], true),
            { fill: '#b088e0', stroke: '#e3d2ff', strokeWidth: 3, alpha: 0, z: 30 }));
    });
    parts.push(textPart('hydroT', 'MISHIPA MYEUPE = MAJI YALIPITA HAPA', {
        at: [540, 1300], font: `800 34px ${FONT}`, fill: 'quartz', alpha: 0, z: 40,
        maxWidth: 940 }));
    return { ...board('hydro', parts), crystalIds: C.map((_, i) => `cr${i}`) };
}

// --- board: the three conditions ------------------------------------------

function boardNeeds() {
    const rows = cardRows('n', [
        ['NAFASI', 'Ufa, pango, au nafasi kati ya chembe.\nFuwele haiwezi kukua kwenye '
            + 'mwamba uliojaa.', '#3fbf7f'],
        ['MUDA', 'Maelfu hadi mamilioni ya miaka.\nFuwele kubwa daima ni ya zamani.', '#ffc64d'],
        ['VIAMBATO', 'Vanadiumu, kromiamu, berili, boroni.\nNdivyo vinavyotoa rangi.', '#e0344f'],
    ], { top: 600, h: 180, gap: 26 });
    return { ...board('needs', [
        textPart('nh', 'KILA KIWANDA KINAHITAJI VITATU', { at: [540, 520],
            font: `800 38px ${FONT}`, fill: 'ink', alpha: 0, z: 50, maxWidth: 940 }),
        ...rows.parts,
        textPart('nf', 'Kikose kimoja — hakuna kito.', { at: [540, 1232],
            font: `800 36px ${FONT}`, fill: 'gold', alpha: 0, z: 50, maxWidth: 940 }),
    ]), rows };
}

export function partTwo() {
    const fact = boardFactories();
    const magma = boardMagma();
    const meta = boardMeta();
    const hydro = boardHydro();
    const needs = boardNeeds();
    const card = endCard('Inayofuata: mto unakuambia kitu');
    const boards = [fact, magma, meta, hydro, needs, { ...board('card', card.parts) }];
    const characters = { ...CHARACTERS };
    for (const b of boards) characters[b.name] = effect(b.parts, { palette: 'vito' });

    const scenes = [
        {
            id: 'viwanda', palette: 'vito',
            background: { color: VITO_PALETTE.bg },
            transitionIn: { kind: 'fade', from: '#000000', duration: 0.7 },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage('nuru'), castBoard('fact', { alpha: 1 })],
            shots: [
                { id: 'a0', duration: 8.5, dialogue: [vo(P2[0], 0.3)],
                  actions: [
                      ...build('fact', fact.rows.rowIds(0), 0.3, { gap: 0.1, span: 0.4 }),
                      ...build('fact', fact.rows.rowIds(1), 0.9, { gap: 0.1, span: 0.4 }),
                      ...build('fact', fact.rows.rowIds(2), 1.5, { gap: 0.1, span: 0.4 }),
                      ...build('fact', ['kicker', 'title', 'titlesub'], 4.4,
                               { gap: 0.24, span: 0.5 }),
                  ] },
            ],
        },
        {
            id: 'moto', palette: 'vito',
            background: { color: '#140c08' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage('nuru'), castBoard('magma', { alpha: 1 })],
            shots: [
                { id: 'm0', duration: 7.5, dialogue: [vo(P2[1], 0.2)],
                  actions: [
                      ...reveal('magma', 'bg', 0.1, { span: 0.5 }),
                      ...reveal('magma', 'h', 0.6, { span: 0.4 }),
                  ] },
                { id: 'm1', duration: 8.5, dialogue: [vo(P2[2], 0.2)],
                  actions: [
                      ...reveal('magma', 'div', 0.2, { span: 0.4 }),
                      ...reveal('magma', 'fastT', 0.4, { span: 0.4 }),
                      ...build('magma', Array.from({ length: 44 }, (_, i) => `sm${i}`), 0.7,
                               { gap: 0.025, span: 0.2 }),
                      ...reveal('magma', 'fastN', 2.2, { span: 0.4 }),
                      ...reveal('magma', 'slowT', 3.0, { span: 0.4 }),
                      ...build('magma', [0, 1, 2, 3].map((i) => `bg${i}`), 3.4,
                               { gap: 0.22, span: 0.4, how: pop }),
                      ...reveal('magma', 'slowN', 4.8, { span: 0.4 }),
                  ] },
                { id: 'm2', duration: 9.0, dialogue: [vo(P2[3], 0.2)], actions: [] },
            ],
        },
        {
            id: 'shinikizo', palette: 'vito',
            background: { color: '#0d1118' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage('nuru'), castBoard('meta', { alpha: 1 })],
            shots: [
                { id: 'p0', duration: 6.5, dialogue: [vo(P2[4], 0.2)],
                  actions: [
                      ...reveal('meta', 'bg', 0.1, { span: 0.5 }),
                      ...reveal('meta', 'h', 0.5, { span: 0.4 }),
                      ...build('meta', Array.from({ length: 9 }, (_, i) => `band${i}`), 0.7,
                               { gap: 0.11, span: 0.35 }),
                  ] },
                { id: 'p1', duration: 9.0, dialogue: [vo(P2[5], 0.2)],
                  actions: [
                      ...reveal('meta', 'sqL', 0.4, { span: 0.35 }),
                      ...reveal('meta', 'sqR', 0.4, { span: 0.35 }),
                      ...build('meta', meta.gemIds, 2.6, { gap: 0.3, span: 0.4, how: pop }),
                  ] },
                { id: 'p2', duration: 9.5, dialogue: [vo(P2[6], 0.2)],
                  actions: pop('meta', 'metaT', 3.4, { span: 0.5 }) },
            ],
        },
        {
            id: 'maji', palette: 'vito',
            background: { color: '#12100c' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage('nuru'), castBoard('hydro', { alpha: 1 })],
            shots: [
                { id: 'w0', duration: 6.5, dialogue: [vo(P2[7], 0.2)],
                  actions: [
                      ...ramp('hydro', 'flow0', 'props.flow', 0, 30, 0, 13, { ease: 'linear' }),
                      ...ramp('hydro', 'flow1', 'props.flow', 0, 30, 0, 9.6, { ease: 'linear' }),
                      ...reveal('hydro', 'bg', 0.1, { span: 0.5 }),
                      ...reveal('hydro', 'h', 0.5, { span: 0.4 }),
                      ...reveal('hydro', 'seam', 0.8, { span: 0.6 }),
                      ...reveal('hydro', 'ufa', 1.4, { span: 0.4 }),
                  ] },
                { id: 'w1', duration: 8.5, dialogue: [vo(P2[8], 0.2)],
                  actions: [
                      ...build('hydro', ['flow0', 'flow1'], 0.3, { gap: 0.2, span: 0.5 }),
                      ...build('hydro', hydro.crystalIds, 3.2,
                               { gap: 0.3, span: 0.4, how: pop }),
                  ] },
                { id: 'w2', duration: 8.0, dialogue: [vo(P2[9], 0.2)],
                  actions: pop('hydro', 'hydroT', 2.8, { span: 0.5 }) },
            ],
        },
        {
            id: 'swali', palette: 'vito',
            background: { color: '#101a26' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [
                { character: 'nuru', as: 'nuru', at: [330, TALK_Y], scale: 1.5,
                  view: 'threeQuarter' },
                { character: 'bakari', as: 'bakari', at: [770, TALK_Y], scale: 1.5,
                  view: 'threeQuarter', facing: -1 },
            ],
            shots: [
                { id: 'q0', duration: 7.0, dialogue: [says('bakari', P2[10], 0.3)],
                  actions: [
                      { target: 'nuru', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'bakari', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'bakari', do: 'pose', pose: 'ask', at: 0.3, for: 0.6 },
                      ...blinks('nuru', 7.0, 13), ...blinks('bakari', 7.0, 31),
                  ] },
                { id: 'q1', duration: 8.0, dialogue: [says('nuru', P2[11], 0.3)],
                  actions: [
                      { target: 'nuru', do: 'pose', pose: 'present', at: 0.3, for: 0.7 },
                      { target: 'nuru', do: 'pose', pose: 'count', at: 3.2, for: 0.6 },
                      ...blinks('nuru', 8.0, 47), ...blinks('bakari', 8.0, 59),
                  ] },
            ],
        },
        {
            id: 'vitatu', palette: 'vito',
            background: { color: VITO_PALETTE.bg },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage('nuru'), castBoard('needs', { alpha: 1 })],
            shots: [
                { id: 'n0', duration: 7.5, dialogue: [vo(P2[12], 0.2)],
                  actions: [
                      ...reveal('needs', 'nh', 0.2, { span: 0.45 }),
                      ...build('needs', needs.rows.rowIds(0), 0.9, { gap: 0.1, span: 0.4 }),
                  ] },
                { id: 'n1', duration: 6.5, dialogue: [vo(P2[13], 0.2)],
                  actions: build('needs', needs.rows.rowIds(1), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 'n2', duration: 7.0, dialogue: [vo(P2[14], 0.2)],
                  actions: build('needs', needs.rows.rowIds(2), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 'n3', duration: 9.5, dialogue: [vo(P2[15], 0.2)],
                  actions: pop('needs', 'nf', 4.0, { span: 0.5 }) },
            ],
        },
        {
            id: 'card', palette: 'vito',
            background: { color: '#05080d' },
            transitionIn: { kind: 'crossfade', duration: 0.5 },
            cast: [offstage('nuru'), castBoard('card', { alpha: 1 })],
            shots: [
                { id: 'c0', duration: 7.5, dialogue: [vo(P2[16], 0.2)],
                  actions: build('card', card.ids, 0.2, { gap: 0.22, span: 0.45 }) },
            ],
        },
    ];

    return {
        version: 'jirex.film/1',
        meta: { ...META('Viwanda vitatu'), estimatedTiming: true },
        palettes: { vito: VITO_PALETTE },
        voices: VOICES,
        characters,
        scenes,
    };
}
