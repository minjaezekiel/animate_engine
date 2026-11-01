/**
 * Sehemu 4 — "Dalili: ardhi inaonyesha njia".
 *
 * Host rocks, indicator minerals, and the Tanzanian gem districts. The point
 * is that a gem is never alone: it formed with a company of other minerals,
 * and those companions are commoner, bigger and easier to recognise than the
 * gem itself. You hunt the company it keeps.
 *
 * Conventional, and specific to Tanzania: tanzanite at Merelani occurs in
 * graphite-bearing gneisses with green grossular (tsavorite) nearby; Longido
 * is ruby in green zoisite; the Umba valley, Winza, Mahenge, Songea and
 * Tunduru are the other well-known districts. All of it sits in the
 * Mozambique Belt, which Part 2 established is a metamorphic factory.
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

const P4 = [
    /* 0 HOOK */ 'Ardhi inaongea kila siku, na inakuambia mahali vito vilipo. Tatizo ni '
        + 'kwamba watu wengi hawajui lugha yake.',
    /* 1 */ 'Kito hakizaliwi peke yake. Kinazaliwa pamoja na madini mengine, kwenye '
          + 'mwamba wa aina fulani, katika mazingira ya aina fulani.',
    /* 2 */ 'Madini hayo mengine ni mengi zaidi, makubwa zaidi, na ni rahisi kuyaona. '
          + 'Kwa hiyo hutafuti kito. Unatafuta wenzake.',
    /* 3 */ 'Dalili ya kwanza ni aina ya mwamba. Kila kito kina mwamba wake wa nyumbani.',
    /* 4 */ 'Gneiss na marumaru: tanzanite na tsavorite. Pegmatite: tourmaline na '
          + 'aquamarine. Mwamba wa volkeno: yakuti.',
    /* 5 */ 'Dalili ya pili ni madini yanayoandamana nayo. Merelani, tanzanite '
          + 'inapatikana pamoja na grafiti nyeusi inayong’aa.',
    /* 6 */ 'Mchimbaji anapoona grafiti kwenye gneiss, anajua yuko kwenye mwamba sahihi, '
          + 'hata kama bado hajaona kito.',
    /* 7 */ 'Pia garnet ya kijani, tsavorite, inapatikana karibu. Madini haya mawili ni '
          + 'majirani, yanazaliwa kwa joto lile lile.',
    /* 8 */ 'Longido ni mfano mwingine: rubi nyekundu ndani ya zoisite ya kijani. Rangi '
          + 'mbili pamoja, hazipotei machoni.',
    /* 9 */ 'Dalili ya tatu ni mishipa ya quartz. Mshipa mweupe ni ufa uliojazwa na maji '
          + 'ya moto, na maji hayo yalikuwa yanabeba kitu.',
    /*10 */ 'Dalili ya nne ni mica inayong’aa kwenye jua, na pegmatite yenye chembe '
          + 'kubwa isivyo kawaida. Chembe kubwa maana yake nafasi na muda.',
    /*11 BAKARI */ 'Je, kuna maeneo ambayo tayari yanajulikana? Sitaki kupoteza mwaka '
          + 'mzima kwenye mwamba usio na kitu.',
    /*12 NURU */ 'Yapo, na ni busara kuanza hapo. Ukanda wa Msumbiji unapita Tanzania '
          + 'nzima kutoka kaskazini hadi kusini.',
    /*13 */ 'Merelani kwa tanzanite na tsavorite. Longido kwa rubi. Bonde la Umba kwa '
          + 'garnet, zircon na yakuti.',
    /*14 */ 'Winza kwa rubi na yakuti. Mahenge kwa spinel na rubi. Songea na Tunduru kwa '
          + 'yakuti na vito vya rangi mbalimbali.',
    /*15 */ 'Maeneo haya yote yanafanana kijiolojia. Ndiyo maana yanaitwa ukanda mmoja, '
          + 'si sehemu tofauti zilizotawanyika.',
    /*16 */ 'Lakini kumbuka: kuwa karibu na eneo linalojulikana si kibali cha kuchimba. '
          + 'Ardhi nyingi tayari ina wenyewe au ina leseni.',
    /*17 */ 'Angalia kwanza nani ana haki ya eneo hilo. Kuchimba bila kibali kunaweza '
          + 'kukugharimu kila kitu ulichokipata.',
    /*18 */ 'Na dalili ya mwisho, ambayo ni rahisi kuliko zote: tazama watu. Mahali '
          + 'ambapo wachimbaji wadogo wamekusanyika, kuna sababu.',
    /*19 */ 'Wameshafanya utafiti kwa miguu yao kwa miaka mingi. Kuwaona ni dalili kubwa '
          + 'kuliko ramani yoyote.',
    /*20 */ 'Sehemu inayofuata: ukishapata jiwe, unajuaje kama ni kito? Vipimo vinne, '
          + 'bila maabara.',
];

function boardSigns() {
    const rows = cardRows('s', [
        ['1  ·  MWAMBA', 'Gneiss na marumaru: tanzanite, tsavorite.\nPegmatite: '
            + 'tourmaline. Volkeno: yakuti.', '#7d8794'],
        ['2  ·  MADINI WENZAKE', 'Grafiti na tanzanite. Garnet ya kijani karibu.\n'
            + 'Rubi ndani ya zoisite ya kijani.', '#3fbf7f'],
        ['3  ·  MISHIPA YA QUARTZ', 'Mweupe = ufa uliojazwa na maji ya moto.\n'
            + 'Maji hayo yalikuwa yanabeba kitu.', '#e8e4da'],
        ['4  ·  MICA NA CHEMBE KUBWA', 'Mica inang’aa juani. Chembe kubwa isivyo '
            + 'kawaida\nmaana yake nafasi na muda.', '#ffc64d'],
    ], { top: 572, h: 164, gap: 20 });
    return { ...board('signs', [
        ...hookTitle('MADINI YA VITO  ·  SEHEMU 4', 'Dalili za ardhini',
                     'usitafute kito — tafuta wenzake'),
        ...rows.parts,
    ]), rows };
}

/** Graphite in gneiss, with tanzanite and green garnet beside it. */
function boardCompany() {
    const parts = [
        rectPart('bg', 1160, 900, { at: [540, 900], fill: '#2b3139', alpha: 0, z: -20 }),
        textPart('h', 'MERELANI: WENZAKE WA TANZANITE', { at: [540, 516],
            font: `700 33px ${FONT}`, fill: 'dim', alpha: 0, z: 50, maxWidth: 940 }),
    ];
    for (let i = 0; i < 8; i++) {
        const y = 600 + i * 64;
        parts.push(pathPart(`gn${i}`, smooth([[-40, y], [260, y - 22], [540, y + 16],
                                              [820, y - 18], [1120, y + 8]]),
            { stroke: i % 2 ? '#8d97a6' : '#555d68', strokeWidth: 34, alpha: 0, z: i,
              lineCap: 'butt' }));
    }
    // graphite flakes: black, and they catch the light
    const FLK = [[300, 690], [420, 752], [250, 820], [380, 886], [300, 960], [446, 1020]];
    FLK.forEach(([x, y], i) => {
        parts.push(pathPart(`gf${i}`, poly([[x - 30, y - 7], [x + 24, y - 14],
                                            [x + 30, y + 7], [x - 24, y + 14]], true),
            { fill: '#15181c', stroke: '#9aa4b0', strokeWidth: 2.5, alpha: 0, z: 20 }));
    });
    parts.push(
        ...labelParts('gfL', 'grafiti nyeusi', [90, 1096], [330, 1004],
                      { font: `800 30px ${FONT}`, fill: 'ink', stroke: 'dim',
                        align: 'left', leadAt: [330, 1120] }),
        pathPart('tz', poly([[700, 740], [800, 752], [824, 846], [742, 902],
                             [668, 834]], true),
                 { fill: 'tanzanite', stroke: 'gem', strokeWidth: 3, alpha: 0, z: 22 }),
        pathPart('tsav', poly([[840, 900], [918, 912], [936, 982], [872, 1022],
                               [814, 968]], true),
                 { fill: 'tsavorite', stroke: '#9df0c4', strokeWidth: 3, alpha: 0, z: 22 }),
        ...labelParts('tzL', 'tanzanite', [1000, 700], [800, 772],
                      { font: `800 30px ${FONT}`, fill: 'gem', stroke: 'gem',
                        align: 'right', leadAt: [1000, 722] }),
        ...labelParts('tsL', 'tsavorite', [1000, 1086], [900, 1004],
                      { font: `800 30px ${FONT}`, fill: 'tsavorite', stroke: 'tsavorite',
                        align: 'right', leadAt: [1000, 1062] }),
        textRule('compT', 'UKIONA GRAFITI KWENYE GNEISS — UKO MAHALI SAHIHI'),
    );
    return { ...board('company', parts), flakeIds: FLK.map((_, i) => `gf${i}`),
             bandIds: Array.from({ length: 8 }, (_, i) => `gn${i}`) };
}

const textRule = (id, text) => textPart(id, text, {
    at: [540, 1330], font: `800 33px ${FONT}`, fill: 'gold', alpha: 0, z: 60,
    maxWidth: 940, lineHeight: 42 });

/** The gem belt down the country, with the districts on it. */
function boardBelt() {
    const TZ = [
        [300, 600], [392, 576], [470, 586], [540, 566], [612, 572], [690, 600],
        [742, 660], [766, 736], [778, 820], [760, 900], [720, 964], [660, 1006],
        [586, 1028], [512, 1020], [446, 992], [392, 946], [344, 886], [310, 812],
        [294, 726], [300, 600],
    ];
    // Roughly where they actually are, and spread far enough apart that seven
    // labels do not pile into one corner. The first version put Merelani,
    // Longido and Umba inside eighty pixels of each other and their labels
    // overlapped into an unreadable knot.
    const SITES = [
        ['lon', 498, 622, 'Longido', 'ruby', 'left'],
        ['mer', 566, 664, 'Merelani', 'gem', 'left'],
        ['umb', 676, 636, 'Umba', 'tsavorite', 'right'],
        ['win', 516, 788, 'Winza', 'ruby', 'left'],
        ['mah', 638, 862, 'Mahenge', 'garnet', 'right'],
        ['son', 540, 956, 'Songea', 'sapphire', 'left'],
        ['tun', 664, 940, 'Tunduru', 'violet', 'right'],
    ];
    const parts = [
        pathPart('tzMap', poly(TZ, true),
                 { fill: '#242c22', stroke: 'dim', strokeWidth: 3, alpha: 0, z: 0 }),
        // The belt, INSIDE the outline. At 150 wide from y 560 to 1010 it was
        // a green sausage hanging off both ends of the country.
        pathPart('belt', smooth([[540, 630], [600, 740], [556, 860], [612, 952]]),
                 { stroke: '#3f5d4a', strokeWidth: 104, alpha: 0, z: 1,
                   lineCap: 'round' }),
        textPart('beltL', 'UKANDA WA MSUMBIJI', { at: [540, 1092],
            font: `800 32px ${FONT}`, fill: '#6fd3a0', alpha: 0, z: 60, maxWidth: 940 }),
        textPart('beltH', 'MAENEO YANAYOJULIKANA', { at: [540, 496],
            font: `700 32px ${FONT}`, fill: 'dim', alpha: 0, z: 60 }),
    ];
    SITES.forEach(([id, x, y, name, col, side]) => {
        const left = side === 'left';
        parts.push(
            ellipsePart(id, 15, 15, { at: [x, y], fill: col, alpha: 0, z: 30 }),
            // A dot inside a dark belt needs a ring, or it disappears into it.
            ellipsePart(`${id}_r`, 22, 22, { at: [x, y], stroke: '#0b1016',
                                             strokeWidth: 4, alpha: 0, z: 29 }),
            textPart(`${id}_t`, name, {
                at: [left ? x - 34 : x + 34, y], font: `700 28px ${FONT}`,
                fill: 'ink', align: left ? 'right' : 'left', alpha: 0, z: 31 }),
        );
    });
    parts.push(textRule('beltT', 'MAENEO HAYA YOTE NI JIOLOJIA MOJA'));
    return { ...board('belt', parts),
             site: (i) => [`${SITES[i][0]}_r`, SITES[i][0], `${SITES[i][0]}_t`],
             siteCount: SITES.length };
}

function boardCare() {
    const rows = cardRows('c', [
        ['ANGALIA LESENI KWANZA', 'Ardhi nyingi tayari ina wenyewe.\nKuchimba bila '
            + 'kibali kunaweza kukugharimu kila kitu.', '#e0344f'],
        ['TAZAMA WATU', 'Mahali wachimbaji wadogo wamekusanyika, kuna sababu.\n'
            + 'Wameshafanya utafiti kwa miguu kwa miaka.', '#3fbf7f'],
    ], { top: 700, h: 196, gap: 28 });
    return { ...board('care', [
        textPart('ch', 'KABLA HUJACHIMBA', { at: [540, 600], font: `800 44px ${FONT}`,
                                             fill: 'ink', alpha: 0, z: 50 }),
        ...rows.parts,
    ]), rows };
}

export function partFour() {
    const signs = boardSigns();
    const company = boardCompany();
    const belt = boardBelt();
    const care = boardCare();
    const card = endCard('Inayofuata: vipimo vinne bila maabara');
    const boards = [signs, company, belt, care, { ...board('card', card.parts) }];
    const characters = { ...CHARACTERS };
    for (const b of boards) characters[b.name] = effect(b.parts, { palette: 'vito' });

    const scenes = [
        {
            id: 'dalili', palette: 'vito',
            background: { color: VITO_PALETTE.bg },
            transitionIn: { kind: 'fade', from: '#000000', duration: 0.7 },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage('nuru'), castBoard('signs', { alpha: 1 })],
            shots: [
                { id: 'a0', duration: 9, dialogue: [vo(P4[0], 0.3)],
                  actions: build('signs', ['kicker', 'title', 'titlesub'], 4.6,
                                 { gap: 0.24, span: 0.5 }) },
                { id: 'a1', duration: 9, dialogue: [vo(P4[1], 0.2)], actions: [] },
                { id: 'a2', duration: 8, dialogue: [vo(P4[2], 0.2)], actions: [] },
                { id: 'a3', duration: 6, dialogue: [vo(P4[3], 0.2)],
                  actions: build('signs', signs.rows.rowIds(0), 0.4,
                                 { gap: 0.1, span: 0.4 }) },
                { id: 'a4', duration: 9, dialogue: [vo(P4[4], 0.2)],
                  actions: [
                      ...build('signs', signs.rows.rowIds(1), 2.6, { gap: 0.1, span: 0.4 }),
                      ...build('signs', signs.rows.rowIds(2), 4.6, { gap: 0.1, span: 0.4 }),
                      ...build('signs', signs.rows.rowIds(3), 6.4, { gap: 0.1, span: 0.4 }),
                  ] },
            ],
        },
        {
            id: 'wenzake', palette: 'vito',
            background: { color: '#171b21' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage('nuru'), castBoard('company', { alpha: 1 })],
            shots: [
                { id: 'b0', duration: 9, dialogue: [vo(P4[5], 0.2)],
                  actions: [
                      ...reveal('company', 'bg', 0.1, { span: 0.5 }),
                      ...reveal('company', 'h', 0.4, { span: 0.4 }),
                      ...build('company', company.bandIds, 0.7, { gap: 0.1, span: 0.35 }),
                      ...build('company', company.flakeIds, 2.6,
                               { gap: 0.2, span: 0.35, how: pop }),
                      ...build('company', ['gfL', 'gfL_lead'], 4.4, { gap: 0.1, span: 0.4 }),
                  ] },
                { id: 'b1', duration: 8, dialogue: [vo(P4[6], 0.2)],
                  actions: pop('company', 'compT', 2.6, { span: 0.5 }) },
                { id: 'b2', duration: 8, dialogue: [vo(P4[7], 0.2)],
                  actions: [
                      ...pop('company', 'tz', 0.8, { span: 0.45 }),
                      ...build('company', ['tzL', 'tzL_lead'], 1.3, { gap: 0.1, span: 0.4 }),
                      ...pop('company', 'tsav', 2.8, { span: 0.45 }),
                      ...build('company', ['tsL', 'tsL_lead'], 3.3, { gap: 0.1, span: 0.4 }),
                  ] },
                { id: 'b3', duration: 8, dialogue: [vo(P4[8], 0.2)],
                  actions: [
                      ...ramp('company', 'tz', 'props.fill', 0.6, 1.0, '#4a63d8', '#e0344f'),
                      ...ramp('company', 'tsav', 'props.fill', 0.6, 1.0,
                              '#3fbf7f', '#3fbf7f'),
                  ] },
                { id: 'b4', duration: 8, dialogue: [vo(P4[9], 0.2)], actions: [] },
                { id: 'b5', duration: 9, dialogue: [vo(P4[10], 0.2)], actions: [] },
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
                { id: 'q0', duration: 8, dialogue: [says('bakari', P4[11], 0.3)],
                  actions: [
                      { target: 'nuru', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'bakari', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'bakari', do: 'pose', pose: 'ask', at: 0.3, for: 0.6 },
                      ...blinks('nuru', 8, 19), ...blinks('bakari', 8, 41),
                  ] },
                { id: 'q1', duration: 8, dialogue: [says('nuru', P4[12], 0.3)],
                  actions: [
                      { target: 'nuru', do: 'pose', pose: 'present', at: 0.3, for: 0.7 },
                      ...blinks('nuru', 8, 61), ...blinks('bakari', 8, 79),
                  ] },
            ],
        },
        {
            id: 'ukanda', palette: 'vito',
            background: { color: '#0b1016' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage('nuru'), castBoard('belt', { alpha: 1 })],
            shots: [
                { id: 'm0', duration: 8, dialogue: [vo(P4[13], 0.2)],
                  actions: [
                      ...reveal('belt', 'tzMap', 0.2, { span: 0.6 }),
                      ...reveal('belt', 'beltH', 0.5, { span: 0.4 }),
                      ...reveal('belt', 'belt', 0.9, { span: 0.7 }),
                      ...reveal('belt', 'beltL', 1.4, { span: 0.4 }),
                      ...build('belt', belt.site(0), 2.4, { gap: 0.1, span: 0.4, how: pop }),
                      ...build('belt', belt.site(1), 3.4, { gap: 0.1, span: 0.4, how: pop }),
                      ...build('belt', belt.site(2), 4.4, { gap: 0.1, span: 0.4, how: pop }),
                  ] },
                { id: 'm1', duration: 9, dialogue: [vo(P4[14], 0.2)],
                  actions: [
                      ...build('belt', belt.site(3), 0.8, { gap: 0.1, span: 0.4, how: pop }),
                      ...build('belt', belt.site(4), 2.2, { gap: 0.1, span: 0.4, how: pop }),
                      ...build('belt', belt.site(5), 3.6, { gap: 0.1, span: 0.4, how: pop }),
                      ...build('belt', belt.site(6), 4.6, { gap: 0.1, span: 0.4, how: pop }),
                  ] },
                { id: 'm2', duration: 8, dialogue: [vo(P4[15], 0.2)],
                  actions: pop('belt', 'beltT', 2.6, { span: 0.5 }) },
            ],
        },
        {
            id: 'tahadhari', palette: 'vito',
            background: { color: VITO_PALETTE.bg },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage('nuru'), castBoard('care', { alpha: 1 })],
            shots: [
                { id: 'd0', duration: 8, dialogue: [vo(P4[16], 0.2)],
                  actions: [
                      ...reveal('care', 'ch', 0.2, { span: 0.45 }),
                      ...build('care', care.rows.rowIds(0), 0.8, { gap: 0.1, span: 0.4 }),
                  ] },
                { id: 'd1', duration: 8, dialogue: [vo(P4[17], 0.2)], actions: [] },
                { id: 'd2', duration: 8, dialogue: [vo(P4[18], 0.2)],
                  actions: build('care', care.rows.rowIds(1), 0.6,
                                 { gap: 0.1, span: 0.4 }) },
                { id: 'd3', duration: 8, dialogue: [vo(P4[19], 0.2)], actions: [] },
            ],
        },
        {
            id: 'card', palette: 'vito',
            background: { color: '#05080d' },
            transitionIn: { kind: 'crossfade', duration: 0.5 },
            cast: [offstage('nuru'), castBoard('card', { alpha: 1 })],
            shots: [
                { id: 'c0', duration: 8, dialogue: [vo(P4[20], 0.2)],
                  actions: build('card', card.ids, 0.2, { gap: 0.22, span: 0.45 }) },
            ],
        },
    ];

    return fitShots({
        version: 'jirex.film/1',
        meta: { ...META('Dalili za ardhini'), estimatedTiming: true },
        palettes: { vito: VITO_PALETTE },
        voices: VOICES,
        characters,
        scenes,
    });
}
