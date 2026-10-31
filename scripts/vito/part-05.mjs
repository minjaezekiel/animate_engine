/**
 * Sehemu 5 — "Vipimo vinne bila maabara".
 *
 * Four field tests an ordinary person can actually do: hardness, density,
 * light, and streak -- plus panning, with its honest limitation stated out
 * loud rather than buried.
 *
 * The caveat matters more than the tests: panning concentrates DENSE
 * minerals, so it finds garnet, zircon, sapphire, spinel and topaz, and it
 * does NOT find emerald or the other beryls, which are no denser than the
 * quartz they travel with. Someone panning for emerald will conclude there is
 * nothing there.
 *
 * Hardness figures are the standard Mohs values and the standard household
 * comparators: a fingernail is about 2.5, a copper coin 3.5, a steel knife
 * 5.5, window glass about 5.5, quartz 7. Anything that scratches glass easily
 * is at least 6, which rules out most of the common fakes but not all.
 */
import {
    L, M, build, conceal, effect, ellipsePart, labelParts, pathPart, poly, pop,
    ramp, rectPart, reveal, smooth, textPart,
} from '../lib/diagram.mjs';
import { GROUND_Y } from '../lib/diagram.mjs';
import {
    CHARACTERS, META, VITO_PALETTE, VOICES, offstage, says, vo,
} from '../lib/vito.mjs';
import {
    blinks, board, castBoard, cardRows, endCard, fitShots, hookTitle,
} from './common.mjs';

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const TALK_Y = Math.round(GROUND_Y - 274 * 1.5);

const P5 = [
    /* 0 HOOK */ 'Huhitaji maabara kujua kama jiwe lako lina thamani. Unahitaji vipimo '
        + 'vinne tu, na vyote unaweza kuvifanya leo nyumbani.',
    /* 1 */ 'Kipimo cha kwanza: ugumu. Hiki ndicho kinachotenganisha vito na mawe ya '
          + 'kawaida haraka kuliko kipimo kingine chochote.',
    /* 2 */ 'Ukucha wako una ugumu wa kama mbili na nusu. Sarafu ya shaba, tatu na nusu. '
          + 'Kisu cha chuma na kioo cha dirisha, tano na nusu.',
    /* 3 */ 'Jaribu kukwaruza kioo na jiwe lako. Likikwaruza kioo kwa urahisi, lina ugumu '
          + 'wa angalau sita, na hapo unaanza kuwa na matumaini.',
    /* 4 */ 'Lakini kwaruza jiwe lako, si kioo tu. Ukikuta ukucha wako unaliacha alama, '
          + 'si kito. Ni laini mno.',
    /* 5 */ 'Kipimo cha pili: uzito. Shika jiwe lako na jiwe lingine la ukubwa sawa.',
    /* 6 */ 'Vito vingi ni vizito zaidi kuliko unavyotarajia. Zircon na garnet zinashangaza '
          + 'mkono wa kwanza unaozishika.',
    /* 7 */ 'Kipimo cha tatu: mwanga. Shikilia jiwe juani au kwenye tochi na uangalie '
          + 'ndani yake, si juu yake.',
    /* 8 */ 'Ukiona viputo vidogo vya mviringo ndani, ni kioo. Maumbile hayatengenezi '
          + 'viputo vya mviringo kamili.',
    /* 9 */ 'Kasoro za kweli za kito zina maumbo ya ajabu: nyuzi, mipasuko, chembe '
          + 'ndogo. Kasoro ni ushahidi wa asili, si tatizo.',
    /*10 */ 'Kipimo cha nne: mstari. Kwaruza jiwe kwenye kipande cha sahani isiyo na '
          + 'rangi, upande wa chini usio glossy.',
    /*11 */ 'Vito vingi vya thamani havina mstari, au vina mstari mweupe. Jiwe '
          + 'linaloacha mstari wa rangi nyingi mara nyingi ni madini ya kawaida.',
    /*12 BAKARI */ 'Na kwa mchanga wa mtoni? Pale sioni jiwe moja, naona changarawe yote.',
    /*13 NURU */ 'Hapo unatumia karai. Jaza changarawe, zamisha majini, tikisa kwa '
          + 'mzunguko, na ondoa chepesi juu taratibu.',
    /*14 */ 'Kizito kinabaki chini kabisa ya karai. Baada ya dakika chache utabaki na '
          + 'konzi ndogo ya madini mazito.',
    /*15 */ 'Ndani ya konzi hiyo ndipo garnet nyekundu, zircon, na yakuti hukaa. Ni '
          + 'vipande vidogo, lakini vinakuambia nini kipo juu ya mto.',
    /*16 */ 'Lakini kuna tahadhari muhimu, na watu wengi hawaijui.',
    /*17 */ 'Karai linakusanya vitu vizito tu. Zumaridi na beryl nyingine hazina uzito '
          + 'zaidi ya mchanga wa kawaida.',
    /*18 */ 'Kwa hiyo ukiosha kwa ajili ya zumaridi, hutaipata hata kama ipo. Utafikiri '
          + 'hakuna kitu, kumbe upo mahali sahihi.',
    /*19 */ 'Vipimo hivi havikuambii jina la kito. Vinakuambia kama jiwe lako linastahili '
          + 'kupelekwa kwa mtaalamu.',
    /*20 */ 'Na hilo ndilo lengo. Usitumie pesa kupima kila jiwe. Tumia vipimo hivi '
          + 'kuchagua mawe machache yanayostahili.',
    /*21 */ 'Sehemu ya mwisho: jinsi ya kutodanganywa, na jinsi ya kuuza bila kupunjwa.',
];

function boardTests() {
    const rows = cardRows('t', [
        ['1  ·  UGUMU', 'Likikwaruza kioo kwa urahisi — ugumu sita au zaidi.\n'
            + 'Ukucha ukiliacha alama — si kito.', '#5b7cfa'],
        ['2  ·  UZITO', 'Linganisha na jiwe la ukubwa sawa.\nVito vingi ni vizito '
            + 'kuliko unavyotarajia.', '#ffc64d'],
        ['3  ·  MWANGA', 'Angalia NDANI yake, si juu yake.\nViputo vya mviringo = kioo.',
         '#4aa3d8'],
        ['4  ·  MSTARI', 'Kwaruza sahani isiyo na rangi.\nMstari wa rangi nyingi — '
            + 'mara nyingi si kito.', '#3fbf7f'],
    ], { top: 572, h: 164, gap: 20 });
    return { ...board('tests', [
        ...hookTitle('MADINI YA VITO  ·  SEHEMU 5', 'Vipimo vinne',
                     'bila maabara, bila gharama'),
        ...rows.parts,
    ]), rows };
}

/** The hardness ladder, with household comparators on it. */
function boardMohs() {
    const SCALE = [
        ['ukucha', 2.5, 'dim'], ['sarafu', 3.5, 'dim'], ['kisu / kioo', 5.5, 'ink'],
        ['quartz', 7, 'quartz'], ['yakuti', 9, 'sapphire'], ['almasi', 10, 'ink'],
    ];
    const X0 = 120, X1 = 980, Y = 900;
    const at = (h) => X0 + (h / 10) * (X1 - X0);
    const parts = [
        textPart('mh', 'UGUMU: NANI ANAKWARUZA NANI', { at: [540, 560],
            font: `800 38px ${FONT}`, fill: 'ink', alpha: 0, z: 50, maxWidth: 940 }),
        rectPart('bar', X1 - X0, 22, { at: [(X0 + X1) / 2, Y], fill: '#223148',
                                       alpha: 0, z: 10 }),
        rectPart('barOk', 1, 22, { at: [at(6), Y], fill: 'gem', alpha: 0, z: 11 }),
        textPart('okT', 'eneo la matumaini: 6 na juu', { at: [540, 1162],
            font: `800 32px ${FONT}`, fill: 'gem', alpha: 0, z: 50, maxWidth: 940 }),
    ];
    SCALE.forEach(([name, h, col], i) => {
        const x = at(h);
        const up = i % 2 === 0;
        parts.push(
            pathPart(`tick${i}`, `${M(x, Y - 20)} ${L(x, Y + 20)}`,
                     { stroke: col, strokeWidth: 5, alpha: 0, z: 20 }),
            ellipsePart(`dot${i}`, 13, 13, { at: [x, Y], fill: col, alpha: 0, z: 21 }),
            textPart(`lab${i}`, name, { at: [x, up ? Y - 66 : Y + 74],
                font: `700 26px ${FONT}`, fill: col, alpha: 0, z: 22 }),
            textPart(`num${i}`, String(h), { at: [x, up ? Y - 30 : Y + 40],
                font: `800 24px ${FONT}`, fill: 'dim', alpha: 0, z: 22 }),
        );
    });
    return { ...board('mohs', parts),
             step: (i) => [`tick${i}`, `dot${i}`, `lab${i}`, `num${i}`],
             okX: at(6), okW: X1 - at(6) };
}

/** Glass bubbles against natural inclusions. */
function boardLight() {
    const parts = [
        textPart('lh', 'ANGALIA NDANI, SI JUU', { at: [540, 548],
            font: `800 40px ${FONT}`, fill: 'ink', alpha: 0, z: 50, maxWidth: 940 }),
        textPart('fakeT', 'KIOO', { at: [300, 640], font: `800 32px ${FONT}`,
                                    fill: 'fault', alpha: 0, z: 50 }),
        textPart('realT', 'KITO', { at: [780, 640], font: `800 32px ${FONT}`,
                                    fill: 'tsavorite', alpha: 0, z: 50 }),
        ellipsePart('fakeBody', 190, 210, { at: [300, 920], fill: '#2d4a63',
                                            stroke: '#7fb6d8', strokeWidth: 4,
                                            alpha: 0, z: 10 }),
        ellipsePart('realBody', 190, 210, { at: [780, 920], fill: '#2a4f3c',
                                            stroke: '#8fe0b4', strokeWidth: 4,
                                            alpha: 0, z: 10 }),
        textPart('fakeN', 'viputo vya mviringo kamili', { at: [300, 1176],
            font: `600 26px ${FONT}`, fill: 'fault', alpha: 0, z: 50, maxWidth: 430 }),
        textPart('realN', 'nyuzi na mipasuko ya ajabu', { at: [780, 1176],
            font: `600 26px ${FONT}`, fill: 'tsavorite', alpha: 0, z: 50, maxWidth: 430 }),
    ];
    // perfectly round bubbles on the left
    [[250, 850, 22], [340, 930, 16], [286, 996, 13], [360, 846, 11]]
        .forEach(([x, y, r], i) => {
            parts.push(ellipsePart(`bub${i}`, r, r, { at: [x, y], fill: '#0d1826',
                stroke: '#bfe4f7', strokeWidth: 3, alpha: 0, z: 20 }));
        });
    // irregular natural inclusions on the right
    parts.push(
        pathPart('inc0', smooth([[700, 846], [760, 886], [726, 940], [800, 986]]),
                 { stroke: '#d7f3e4', strokeWidth: 4, alpha: 0, z: 20 }),
        pathPart('inc1', smooth([[820, 862], [860, 918], [812, 962]]),
                 { stroke: '#a8dcc2', strokeWidth: 3, alpha: 0, z: 20 }),
        pathPart('inc2', poly([[742, 1012], [778, 1002], [790, 1036], [754, 1046]], true),
                 { fill: '#8fe0b4', alpha: 0, z: 20 }),
        textPart('lightT', 'KASORO NI USHAHIDI WA ASILI, SI TATIZO', {
            at: [540, 1300], font: `800 33px ${FONT}`, fill: 'gold', alpha: 0, z: 60,
            maxWidth: 940 }),
    );
    return { ...board('light', parts),
             bubIds: [0, 1, 2, 3].map((i) => `bub${i}`),
             incIds: ['inc0', 'inc1', 'inc2'] };
}

/** The pan, and what stays in it. */
function boardPan() {
    const parts = [
        textPart('ph', 'KARAI: KUKUSANYA VIZITO', { at: [540, 548],
            font: `800 40px ${FONT}`, fill: 'ink', alpha: 0, z: 50, maxWidth: 940 }),
        ellipsePart('pan', 310, 170, { at: [540, 920], fill: '#3a3b40',
                                       stroke: '#6d6f78', strokeWidth: 6, alpha: 0, z: 10 }),
        ellipsePart('panIn', 250, 130, { at: [540, 930], fill: '#23242a', alpha: 0, z: 11 }),
        // the light fraction washing over the lip
        pathPart('wash', smooth([[300, 880], [200, 940], [120, 1030]]), {
            stroke: 'water', strokeWidth: 12, alpha: 0, z: 14, lineCap: 'round',
            trim: { end: 0.3, length: 180 }, flow: 0 }),
        textPart('washL', 'chepesi kinamwagika', { at: [120, 1092],
            font: `600 26px ${FONT}`, fill: 'dim', align: 'left', alpha: 0, z: 50,
            maxWidth: 420 }),
    ];
    // the heavy concentrate in the bottom of the pan
    const HEAVY = [['#b3384f', 560, 960], ['#2f6fd0', 600, 946], ['#e0344f', 528, 972],
                   ['#8a6ad6', 578, 980], ['#b3384f', 620, 968]];
    HEAVY.forEach(([col, x, y], i) => {
        parts.push(ellipsePart(`hv${i}`, 13, 11, { at: [x, y], fill: col, alpha: 0, z: 20 }));
    });
    parts.push(
        ...labelParts('hvL', 'garnet, zircon, yakuti', [1000, 1040], [610, 980],
                      { font: `800 29px ${FONT}`, fill: 'gold', stroke: 'gold',
                        align: 'right', leadAt: [1000, 1064] }),
        // the warning, which is the most useful thing in the part
        rectPart('warnBg', 960, 190, { at: [540, 1270], fill: '#2a1218',
                                       stroke: '#e0344f', strokeWidth: 3, alpha: 0, z: 60 }),
        textPart('warnT', 'TAHADHARI', { at: [540, 1212], font: `800 32px ${FONT}`,
                                         fill: 'fault', alpha: 0, z: 61 }),
        textPart('warnB', 'Zumaridi haina uzito zaidi ya mchanga.\n'
            + 'Karai halitaikusanya — hata kama ipo.', {
            at: [540, 1292], font: `700 29px ${FONT}`, fill: 'ink', alpha: 0, z: 61,
            maxWidth: 900, lineHeight: 38 }),
    );
    return { ...board('pan', parts), heavyIds: HEAVY.map((_, i) => `hv${i}`) };
}

export function partFive() {
    const tests = boardTests();
    const mohs = boardMohs();
    const light = boardLight();
    const pan = boardPan();
    const card = endCard('Ya mwisho: usidanganywe, na usipunjwe');
    const boards = [tests, mohs, light, pan, { ...board('card', card.parts) }];
    const characters = { ...CHARACTERS };
    for (const b of boards) characters[b.name] = effect(b.parts, { palette: 'vito' });

    const scenes = [
        {
            id: 'vipimo', palette: 'vito',
            background: { color: VITO_PALETTE.bg },
            transitionIn: { kind: 'fade', from: '#000000', duration: 0.7 },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage('nuru'), castBoard('tests', { alpha: 1 })],
            shots: [
                { id: 'a0', duration: 9, dialogue: [vo(P5[0], 0.3)],
                  actions: [
                      ...build('tests', tests.rows.rowIds(0), 0.4, { gap: 0.08, span: 0.35 }),
                      ...build('tests', tests.rows.rowIds(1), 1.0, { gap: 0.08, span: 0.35 }),
                      ...build('tests', tests.rows.rowIds(2), 1.6, { gap: 0.08, span: 0.35 }),
                      ...build('tests', tests.rows.rowIds(3), 2.2, { gap: 0.08, span: 0.35 }),
                      ...build('tests', ['kicker', 'title', 'titlesub'], 4.6,
                               { gap: 0.24, span: 0.5 }),
                  ] },
            ],
        },
        {
            id: 'ugumu', palette: 'vito',
            background: { color: '#0b1016' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage('nuru'), castBoard('mohs', { alpha: 1 })],
            shots: [
                { id: 'b0', duration: 8, dialogue: [vo(P5[1], 0.2)],
                  actions: [
                      ...reveal('mohs', 'mh', 0.2, { span: 0.45 }),
                      ...reveal('mohs', 'bar', 0.7, { span: 0.5 }),
                  ] },
                { id: 'b1', duration: 9, dialogue: [vo(P5[2], 0.2)],
                  actions: [
                      ...build('mohs', mohs.step(0), 0.5, { gap: 0.07, span: 0.35 }),
                      ...build('mohs', mohs.step(1), 2.0, { gap: 0.07, span: 0.35 }),
                      ...build('mohs', mohs.step(2), 3.8, { gap: 0.07, span: 0.35 }),
                  ] },
                { id: 'b2', duration: 9, dialogue: [vo(P5[3], 0.2)],
                  actions: [
                      ...reveal('mohs', 'barOk', 0.8, { span: 0.3 }),
                      ...ramp('mohs', 'barOk', 'transform.sx', 0.8, 1.2, 1, mohs.okW),
                      ...ramp('mohs', 'barOk', 'transform.x', 0.8, 1.2,
                              mohs.okX, mohs.okX + mohs.okW / 2),
                      ...build('mohs', mohs.step(3), 2.4, { gap: 0.07, span: 0.35 }),
                      ...build('mohs', mohs.step(4), 3.4, { gap: 0.07, span: 0.35 }),
                      ...build('mohs', mohs.step(5), 4.2, { gap: 0.07, span: 0.35 }),
                      ...pop('mohs', 'okT', 5.2, { span: 0.5 }),
                  ] },
                { id: 'b3', duration: 8, dialogue: [vo(P5[4], 0.2)], actions: [] },
                { id: 'b4', duration: 7, dialogue: [vo(P5[5], 0.2)], actions: [] },
                { id: 'b5', duration: 8, dialogue: [vo(P5[6], 0.2)], actions: [] },
            ],
        },
        {
            id: 'mwanga', palette: 'vito',
            background: { color: '#090e14' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage('nuru'), castBoard('light', { alpha: 1 })],
            shots: [
                { id: 'c0', duration: 8, dialogue: [vo(P5[7], 0.2)],
                  actions: [
                      ...reveal('light', 'lh', 0.2, { span: 0.45 }),
                      ...build('light', ['fakeBody', 'realBody'], 0.8,
                               { gap: 0.2, span: 0.5 }),
                      ...build('light', ['fakeT', 'realT'], 1.4, { gap: 0.2, span: 0.4 }),
                  ] },
                { id: 'c1', duration: 9, dialogue: [vo(P5[8], 0.2)],
                  actions: [
                      ...build('light', light.bubIds, 0.6, { gap: 0.22, span: 0.4, how: pop }),
                      ...reveal('light', 'fakeN', 2.4, { span: 0.4 }),
                  ] },
                { id: 'c2', duration: 9, dialogue: [vo(P5[9], 0.2)],
                  actions: [
                      ...build('light', light.incIds, 0.6, { gap: 0.3, span: 0.45 }),
                      ...reveal('light', 'realN', 2.4, { span: 0.4 }),
                      ...pop('light', 'lightT', 4.2, { span: 0.5 }),
                  ] },
                { id: 'c3', duration: 9, dialogue: [vo(P5[10], 0.2)], actions: [] },
                { id: 'c4', duration: 9, dialogue: [vo(P5[11], 0.2)], actions: [] },
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
                { id: 'q0', duration: 7, dialogue: [says('bakari', P5[12], 0.3)],
                  actions: [
                      { target: 'nuru', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'bakari', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'bakari', do: 'pose', pose: 'ask', at: 0.3, for: 0.6 },
                      ...blinks('nuru', 7, 23), ...blinks('bakari', 7, 43),
                  ] },
                { id: 'q1', duration: 8, dialogue: [says('nuru', P5[13], 0.3)],
                  actions: [
                      { target: 'nuru', do: 'pose', pose: 'present', at: 0.3, for: 0.7 },
                      ...blinks('nuru', 8, 67), ...blinks('bakari', 8, 83),
                  ] },
            ],
        },
        {
            id: 'karai', palette: 'vito',
            background: { color: '#0d1117' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage('nuru'), castBoard('pan', { alpha: 1 })],
            shots: [
                { id: 'd0', duration: 8, dialogue: [vo(P5[14], 0.2)],
                  actions: [
                      ...ramp('pan', 'wash', 'props.flow', 0, 30, 0, 15, { ease: 'linear' }),
                      ...reveal('pan', 'ph', 0.2, { span: 0.45 }),
                      ...build('pan', ['pan', 'panIn'], 0.6, { gap: 0.15, span: 0.5 }),
                      ...reveal('pan', 'wash', 1.4, { span: 0.5 }),
                      ...reveal('pan', 'washL', 1.8, { span: 0.4 }),
                      ...build('pan', pan.heavyIds, 3.0, { gap: 0.18, span: 0.35, how: pop }),
                  ] },
                { id: 'd1', duration: 9, dialogue: [vo(P5[15], 0.2)],
                  actions: build('pan', ['hvL', 'hvL_lead'], 1.6, { gap: 0.1, span: 0.4 }) },
                { id: 'd2', duration: 6, dialogue: [vo(P5[16], 0.2)], actions: [] },
                { id: 'd3', duration: 9, dialogue: [vo(P5[17], 0.2)],
                  actions: [
                      ...reveal('pan', 'warnBg', 0.6, { span: 0.4 }),
                      ...reveal('pan', 'warnT', 0.9, { span: 0.4 }),
                      ...reveal('pan', 'warnB', 1.3, { span: 0.4 }),
                  ] },
                { id: 'd4', duration: 9, dialogue: [vo(P5[18], 0.2)], actions: [] },
            ],
        },
        {
            id: 'lengo', palette: 'vito',
            background: { color: VITO_PALETTE.bg },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage('nuru'), castBoard('tests', { alpha: 1 })],
            shots: [
                { id: 'e0', duration: 8, dialogue: [vo(P5[19], 0.2)],
                  actions: [
                      ...reveal('tests', 'kicker', 0.2, { span: 0.4 }),
                      ...reveal('tests', 'title', 0.4, { span: 0.4 }),
                      ...tests.rows.allIds.flatMap((id) =>
                          reveal('tests', id, 0.6, { span: 0.4 })),
                  ] },
                { id: 'e1', duration: 9, dialogue: [vo(P5[20], 0.2)], actions: [] },
            ],
        },
        {
            id: 'card', palette: 'vito',
            background: { color: '#05080d' },
            transitionIn: { kind: 'crossfade', duration: 0.5 },
            cast: [offstage('nuru'), castBoard('card', { alpha: 1 })],
            shots: [
                { id: 'c9', duration: 8, dialogue: [vo(P5[21], 0.2)],
                  actions: build('card', card.ids, 0.2, { gap: 0.22, span: 0.45 }) },
            ],
        },
    ];

    return fitShots({
        version: 'jirex.film/1',
        meta: { ...META('Vipimo vinne'), estimatedTiming: true },
        palettes: { vito: VITO_PALETTE },
        voices: VOICES,
        characters,
        scenes,
    });
}
