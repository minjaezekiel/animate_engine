/**
 * Sehemu 6 — "Usidanganywe".
 *
 * The last part, and the one with the most money in it. How to tell a treated
 * or synthetic stone from an untreated one, why a rough stone's value is
 * genuinely uncertain, what a licence is for, and the loop back to part one.
 *
 * Deliberately careful about two things. Treatment is NOT fraud: heating is
 * routine, legal and ancient, and the only requirement is disclosure -- the
 * narration says so rather than implying every treated stone is a cheat. And
 * the licensing line stays general ("get one, from the mining authority")
 * rather than quoting a procedure or a fee, because those change and a
 * confident wrong number in a video does more harm than none.
 *
 * This is educational material, not legal or valuation advice, and the
 * narration says that in as many words at the end.
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
    blinks, board, castBoard, cardRows, endCard, fitShots, gemParts, hookTitle,
} from './common.mjs';

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const TALK_Y = Math.round(GROUND_Y - 274 * 1.5);

const P6 = [
    /* 0 HOOK */ 'Watu wengi hawapotezi pesa kwa kukosa vito. Wanapoteza kwa kuuza '
        + 'vibaya, siku ile ile walipovipata.',
    /* 1 */ 'Jambo la kwanza unalotakiwa kujua: jiwe ghafi na jiwe lililokatwa ni vitu '
          + 'viwili tofauti kabisa kwenye bei.',
    /* 2 */ 'Jiwe ghafi lina maswali ndani yake. Litakatika vipi? Litabaki na uzito gani? '
          + 'Lina mpasuko wa ndani?',
    /* 3 */ 'Mkataji akikata, uzito mwingi unapotea. Mara nyingi zaidi ya nusu, na wakati '
          + 'mwingine theluthi mbili.',
    /* 4 */ 'Kwa hiyo mnunuzi hakupi bei ya kito. Anakupa bei ya hatari anayoibeba. Hiyo '
          + 'si lazima iwe udanganyifu.',
    /* 5 */ 'Lakini unaweza kupunguza hatari yako kwa kujua vitu vitatu kabla ya kuuza.',
    /* 6 */ 'Kimoja: pima uzito wako mwenyewe, kwa mizani, mbele ya macho yako. Usikubali '
          + 'kuambiwa uzito tu.',
    /* 7 */ 'Pili: uliza bei kwa watu zaidi ya mmoja, siku tofauti. Bei moja si bei. Bei '
          + 'tatu ni soko.',
    /* 8 */ 'Tatu: usiuze ukiwa na haraka. Haraka ndiyo kitu cha kwanza mnunuzi '
          + 'anachokiona usoni mwako.',
    /* 9 */ 'Sasa upande wa pili: jinsi ya kujua kama jiwe unalonunuliwa ni la kweli.',
    /*10 */ 'Vito vingi vya bluu vinavyouzwa barabarani ni kioo. Viputo vya mviringo '
          + 'ndani, na rangi inayofanana kupita kiasi.',
    /*11 */ 'Rangi kamili sana ni dalili ya hatari. Maumbile hayako sawasawa. Kito cha '
          + 'kweli kina maeneo mepesi na mazito.',
    /*12 */ 'Na bei ndogo kupita kiasi ni dalili kubwa kuliko zote. Hakuna anayeuza '
          + 'tanzanite ya kweli kwa bei ya kioo.',
    /*13 */ 'Lakini kuna jambo moja ambalo watu wanalichanganya kila siku, na ni muhimu '
          + 'kulielewa vizuri.',
    /*14 */ 'Kupasha moto si udanganyifu. Tanzanite nyingi inapashwa moto ili kutoa rangi '
          + 'ya bluu, na hiyo inakubalika duniani kote.',
    /*15 */ 'Sheria pekee ni ukweli: muuzaji lazima aseme kama jiwe limepashwa moto. '
          + 'Tatizo si kupasha moto. Tatizo ni kuficha.',
    /*16 BAKARI */ 'Na mimi nikichimba na kupata, naweza kuuza tu hivi hivi?',
    /*17 NURU */ 'Hapana. Unahitaji leseni, na unahitaji kuuza kwenye njia inayotambulika. '
          + 'Bila hivyo huna ulinzi wowote.',
    /*18 */ 'Leseni si adhabu. Ni ushahidi kwamba jiwe lako ni lako, na ndiyo inayokupa '
          + 'nguvu ya kudai haki yako ukipunjwa.',
    /*19 */ 'Na usalama: mashimo ya wachimbaji wadogo yanaweza kuporomoka. Usichimbe '
          + 'peke yako, na usichimbe shimo refu bila msaada.',
    /*20 */ 'Tulianza na jiwe linalopatikana sehemu moja duniani, hapa Tanzania.',
    /*21 */ 'Tumeona lilivyozaliwa, viwanda vitatu vinavyotengeneza vito vyote, na jinsi '
          + 'mto unavyokuonyesha njia.',
    /*22 */ 'Tumeona dalili za ardhini, na vipimo vinne vya kujua kama jiwe lako '
          + 'linastahili kupimwa zaidi.',
    /*23 */ 'Ardhi hii ni tajiri. Lakini utajiri wake unahitaji maarifa, si bahati.',
    /*24 */ 'Haya ni mafunzo ya jumla, si ushauri wa kisheria wala wa bei. Ukipata jiwe '
          + 'muhimu, tafuta mtaalamu.',
];

function boardSell() {
    const rows = cardRows('s', [
        ['PIMA MWENYEWE', 'Kwa mizani, mbele ya macho yako.\nUsikubali kuambiwa uzito tu.',
         '#ffc64d'],
        ['ULIZA BEI TATU', 'Kwa watu tofauti, siku tofauti.\nBei moja si bei. Bei tatu ni '
            + 'soko.', '#3fbf7f'],
        ['USIWE NA HARAKA', 'Haraka ndiyo kitu cha kwanza\nmnunuzi anachokiona usoni mwako.',
         '#e0344f'],
    ], { top: 640, h: 180, gap: 26 });
    return { ...board('sell', [
        ...hookTitle('MADINI YA VITO  ·  SEHEMU 6', 'Usidanganywe',
                     'jinsi ya kuuza bila kupunjwa'),
        ...rows.parts,
    ]), rows };
}

/** Rough in, cut out, and the weight that disappears. */
function boardYield() {
    const cut = gemParts('cg', 760, 980, 250);
    const parts = [
        textPart('yh', 'GHAFI NA KILICHOKATWA', { at: [540, 548],
            font: `800 40px ${FONT}`, fill: 'ink', alpha: 0, z: 50, maxWidth: 940 }),
        // the rough: lumpy, with an internal flaw
        pathPart('rough', poly([[200, 820], [340, 790], [420, 880], [400, 1010],
                                [280, 1090], [170, 1000], [150, 890]], true),
                 { fill: '#5d6fb8', stroke: '#9fb0e8', strokeWidth: 4, alpha: 0, z: 10 }),
        pathPart('flaw', smooth([[230, 860], [300, 920], [260, 1000]]),
                 { stroke: '#cfd8f8', strokeWidth: 4, alpha: 0, z: 12 }),
        textPart('roughL', 'ghafi', { at: [285, 1142], font: `800 30px ${FONT}`,
                                      fill: 'dim', alpha: 0, z: 50 }),
        ...cut.parts,
        textPart('cutL', 'kilichokatwa', { at: [760, 1182], font: `800 30px ${FONT}`,
                                           fill: 'gem', alpha: 0, z: 50 }),
        pathPart('arrow', `${M(450, 960)} ${L(580, 960)} ${L(548, 936)} `
                        + `${M(580, 960)} ${L(548, 984)}`,
                 { stroke: 'ink', strokeWidth: 6, alpha: 0, z: 50 }),
        textPart('lossT', 'UZITO UNAOPOTEA: ZAIDI YA NUSU', { at: [540, 1300],
            font: `800 34px ${FONT}`, fill: 'fault', alpha: 0, z: 60, maxWidth: 940 }),
    ];
    return { ...board('yield', parts), cutIds: cut.ids };
}

/** Real against fake, on the three tells. */
function boardFake() {
    const rows = cardRows('k', [
        ['VIPUTO VYA MVIRINGO', 'Maumbile hayatengenezi viputo kamili.\nHicho ni kioo.',
         '#e0344f'],
        ['RANGI KAMILI SANA', 'Kito cha kweli kina maeneo mepesi na mazito.\nUsawa kamili '
            + 'ni dalili ya hatari.', '#e0344f'],
        ['BEI NDOGO KUPITA KIASI', 'Hakuna anayeuza tanzanite ya kweli\nkwa bei ya kioo.',
         '#e0344f'],
    ], { top: 600, h: 180, gap: 26 });
    return { ...board('fake', [
        textPart('kh', 'DALILI TATU ZA KIOO', { at: [540, 520],
            font: `800 42px ${FONT}`, fill: 'ink', alpha: 0, z: 50, maxWidth: 940 }),
        ...rows.parts,
    ]), rows };
}

/** Heating: legal, routine, and the one rule that matters. */
function boardHeat() {
    const parts = [
        textPart('hh', 'KUPASHA MOTO SI UDANGANYIFU', { at: [540, 548],
            font: `800 38px ${FONT}`, fill: 'ink', alpha: 0, z: 50, maxWidth: 940 }),
        pathPart('before', poly([[300, 780], [410, 796], [438, 906], [352, 978],
                                 [262, 898]], true),
                 { fill: '#8a6a4a', stroke: '#c6a884', strokeWidth: 4, alpha: 0, z: 10 }),
        textPart('beforeL', 'kahawia — kama ilivyochimbwa', { at: [350, 1042],
            font: `600 26px ${FONT}`, fill: 'dim', alpha: 0, z: 50, maxWidth: 440 }),
        pathPart('after', poly([[670, 780], [780, 796], [808, 906], [722, 978],
                                [632, 898]], true),
                 { fill: 'tanzanite', stroke: 'gem', strokeWidth: 4, alpha: 0, z: 10 }),
        textPart('afterL', 'bluu — baada ya joto', { at: [720, 1042],
            font: `600 26px ${FONT}`, fill: 'gem', alpha: 0, z: 50, maxWidth: 440 }),
        pathPart('heatArrow', `${M(470, 880)} ${L(600, 880)} ${L(568, 856)} `
                            + `${M(600, 880)} ${L(568, 904)}`,
                 { stroke: 'heat', strokeWidth: 7, alpha: 0, z: 50 }),
        textPart('heatN', 'nyuzi 500', { at: [535, 820], font: `800 28px ${FONT}`,
                                         fill: 'heat', alpha: 0, z: 50 }),
        rectPart('ruleBg', 960, 160, { at: [540, 1230], fill: '#12241a',
                                       stroke: '#3fbf7f', strokeWidth: 3, alpha: 0, z: 60 }),
        textPart('ruleT', 'SHERIA PEKEE NI UKWELI', { at: [540, 1186],
            font: `800 32px ${FONT}`, fill: 'tsavorite', alpha: 0, z: 61 }),
        textPart('ruleB', 'Tatizo si kupasha moto. Tatizo ni kuficha.', {
            at: [540, 1256], font: `700 30px ${FONT}`, fill: 'ink', alpha: 0, z: 61,
            maxWidth: 900 }),
    ];
    return board('heat', parts);
}

/** The loop closed: the five parts as one chain. */
function boardChain() {
    const STEPS = [
        ['Kito cha sehemu moja', 'gem'],
        ['Viwanda vitatu', 'heat'],
        ['Mto unakuambia', 'water'],
        ['Dalili za ardhini', 'tsavorite'],
        ['Vipimo vinne', 'gold'],
    ];
    const parts = [
        textPart('xh', 'TULIYOYAONA', { at: [540, 520], font: `800 42px ${FONT}`,
                                        fill: 'ink', alpha: 0, z: 50 }),
    ];
    STEPS.forEach(([name, col], i) => {
        const y = 630 + i * 118;
        parts.push(
            ellipsePart(`cn${i}`, 24, 24, { at: [130, y], fill: col, alpha: 0, z: 20 }),
            textPart(`cn${i}_t`, name, { at: [186, y], font: `700 33px ${FONT}`,
                fill: 'ink', align: 'left', alpha: 0, z: 21, maxWidth: 820 }),
        );
        if (i < STEPS.length - 1) {
            parts.push(pathPart(`cn${i}_l`, `${M(130, y + 26)} ${L(130, y + 92)}`,
                { stroke: '#2b3a52', strokeWidth: 4, alpha: 0, z: 19 }));
        }
    });
    parts.push(
        textPart('xf', 'Ardhi hii ni tajiri.\nUtajiri wake unahitaji maarifa, si bahati.', {
            at: [540, 1300], font: `800 38px ${FONT}`, fill: 'gold', alpha: 0, z: 60,
            maxWidth: 940, lineHeight: 50 }),
        textPart('xd', 'Haya ni mafunzo ya jumla, si ushauri wa kisheria wala wa bei.', {
            at: [540, 1424], font: `600 25px ${FONT}`, fill: 'dim', alpha: 0, z: 60,
            maxWidth: 940 }),
    );
    return { ...board('chain', parts),
             step: (i) => [`cn${i}`, `cn${i}_t`, ...(i < 4 ? [`cn${i}_l`] : [])] };
}

export function partSix() {
    const sell = boardSell();
    const yieldB = boardYield();
    const fake = boardFake();
    const heat = boardHeat();
    const chain = boardChain();
    const card = endCard('Asante kwa kuangalia — sambaza kwa mwenye kuhitaji');
    const boards = [sell, yieldB, fake, heat, chain, { ...board('card', card.parts) }];
    const characters = { ...CHARACTERS };
    for (const b of boards) characters[b.name] = effect(b.parts, { palette: 'vito' });

    const scenes = [
        {
            id: 'ghafi', palette: 'vito',
            background: { color: '#0a0e15' },
            transitionIn: { kind: 'fade', from: '#000000', duration: 0.7 },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage('nuru'), castBoard('yield', { alpha: 1 })],
            shots: [
                { id: 'a0', duration: 9, dialogue: [vo(P6[0], 0.3)],
                  actions: [
                      ...reveal('yield', 'yh', 0.3, { span: 0.45 }),
                      ...reveal('yield', 'rough', 0.9, { span: 0.5 }),
                      ...reveal('yield', 'flaw', 1.4, { span: 0.4 }),
                      ...reveal('yield', 'roughL', 1.8, { span: 0.4 }),
                  ] },
                { id: 'a1', duration: 8, dialogue: [vo(P6[1], 0.2)],
                  actions: [
                      ...reveal('yield', 'arrow', 0.6, { span: 0.4 }),
                      ...build('yield', yieldB.cutIds, 1.2, { gap: 0.06, span: 0.3 }),
                      ...reveal('yield', 'cutL', 3.0, { span: 0.4 }),
                  ] },
                { id: 'a2', duration: 8, dialogue: [vo(P6[2], 0.2)], actions: [] },
                { id: 'a3', duration: 8, dialogue: [vo(P6[3], 0.2)],
                  actions: pop('yield', 'lossT', 2.6, { span: 0.5 }) },
                { id: 'a4', duration: 8, dialogue: [vo(P6[4], 0.2)], actions: [] },
            ],
        },
        {
            id: 'kuuza', palette: 'vito',
            background: { color: VITO_PALETTE.bg },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage('nuru'), castBoard('sell', { alpha: 1 })],
            shots: [
                { id: 'b0', duration: 7, dialogue: [vo(P6[5], 0.2)],
                  actions: build('sell', ['kicker', 'title', 'titlesub'], 0.4,
                                 { gap: 0.22, span: 0.45 }) },
                { id: 'b1', duration: 8, dialogue: [vo(P6[6], 0.2)],
                  actions: build('sell', sell.rows.rowIds(0), 0.4, { gap: 0.1, span: 0.4 }) },
                { id: 'b2', duration: 8, dialogue: [vo(P6[7], 0.2)],
                  actions: build('sell', sell.rows.rowIds(1), 0.4, { gap: 0.1, span: 0.4 }) },
                { id: 'b3', duration: 8, dialogue: [vo(P6[8], 0.2)],
                  actions: build('sell', sell.rows.rowIds(2), 0.4, { gap: 0.1, span: 0.4 }) },
            ],
        },
        {
            id: 'kioo', palette: 'vito',
            background: { color: '#120a0e' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage('nuru'), castBoard('fake', { alpha: 1 })],
            shots: [
                { id: 'c0', duration: 7, dialogue: [vo(P6[9], 0.2)],
                  actions: reveal('fake', 'kh', 0.3, { span: 0.45 }) },
                { id: 'c1', duration: 8, dialogue: [vo(P6[10], 0.2)],
                  actions: build('fake', fake.rows.rowIds(0), 0.4, { gap: 0.1, span: 0.4 }) },
                { id: 'c2', duration: 8, dialogue: [vo(P6[11], 0.2)],
                  actions: build('fake', fake.rows.rowIds(1), 0.4, { gap: 0.1, span: 0.4 }) },
                { id: 'c3', duration: 8, dialogue: [vo(P6[12], 0.2)],
                  actions: build('fake', fake.rows.rowIds(2), 0.4, { gap: 0.1, span: 0.4 }) },
            ],
        },
        {
            id: 'joto', palette: 'vito',
            background: { color: '#140e08' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage('nuru'), castBoard('heat', { alpha: 1 })],
            shots: [
                { id: 'd0', duration: 7, dialogue: [vo(P6[13], 0.2)],
                  actions: [
                      ...reveal('heat', 'hh', 0.3, { span: 0.45 }),
                      ...reveal('heat', 'before', 0.8, { span: 0.5 }),
                      ...reveal('heat', 'beforeL', 1.2, { span: 0.4 }),
                  ] },
                { id: 'd1', duration: 9, dialogue: [vo(P6[14], 0.2)],
                  actions: [
                      ...reveal('heat', 'heatArrow', 0.8, { span: 0.4 }),
                      ...reveal('heat', 'heatN', 1.1, { span: 0.4 }),
                      ...pop('heat', 'after', 2.2, { span: 0.5 }),
                      ...reveal('heat', 'afterL', 2.8, { span: 0.4 }),
                  ] },
                { id: 'd2', duration: 9, dialogue: [vo(P6[15], 0.2)],
                  actions: [
                      ...reveal('heat', 'ruleBg', 1.4, { span: 0.4 }),
                      ...reveal('heat', 'ruleT', 1.7, { span: 0.4 }),
                      ...reveal('heat', 'ruleB', 2.1, { span: 0.4 }),
                  ] },
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
                { id: 'q0', duration: 6, dialogue: [says('bakari', P6[16], 0.3)],
                  actions: [
                      { target: 'nuru', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'bakari', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'bakari', do: 'pose', pose: 'ask', at: 0.3, for: 0.6 },
                      ...blinks('nuru', 6, 29), ...blinks('bakari', 6, 47),
                  ] },
                { id: 'q1', duration: 8, dialogue: [says('nuru', P6[17], 0.3)],
                  actions: [
                      { target: 'nuru', do: 'pose', pose: 'present', at: 0.3, for: 0.7 },
                      ...blinks('nuru', 8, 73), ...blinks('bakari', 8, 89),
                  ] },
                { id: 'q2', duration: 9, dialogue: [says('nuru', P6[18], 0.3)],
                  actions: [
                      { target: 'nuru', do: 'pose', pose: 'count', at: 0.4, for: 0.7 },
                      ...blinks('nuru', 9, 97), ...blinks('bakari', 9, 101),
                  ] },
                { id: 'q3', duration: 9, dialogue: [says('nuru', P6[19], 0.3)],
                  actions: [...blinks('nuru', 9, 103), ...blinks('bakari', 9, 107)] },
            ],
        },
        {
            id: 'mnyororo', palette: 'vito',
            background: { color: VITO_PALETTE.bg },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage('nuru'), castBoard('chain', { alpha: 1 })],
            shots: [
                { id: 'e0', duration: 7, dialogue: [vo(P6[20], 0.2)],
                  actions: [
                      ...reveal('chain', 'xh', 0.3, { span: 0.45 }),
                      ...build('chain', chain.step(0), 0.9, { gap: 0.1, span: 0.4 }),
                  ] },
                { id: 'e1', duration: 9, dialogue: [vo(P6[21], 0.2)],
                  actions: [
                      ...build('chain', chain.step(1), 0.6, { gap: 0.1, span: 0.4 }),
                      ...build('chain', chain.step(2), 2.6, { gap: 0.1, span: 0.4 }),
                  ] },
                { id: 'e2', duration: 9, dialogue: [vo(P6[22], 0.2)],
                  actions: [
                      ...build('chain', chain.step(3), 0.6, { gap: 0.1, span: 0.4 }),
                      ...build('chain', chain.step(4), 2.8, { gap: 0.1, span: 0.4 }),
                  ] },
                { id: 'e3', duration: 8, dialogue: [vo(P6[23], 0.2)],
                  actions: pop('chain', 'xf', 1.4, { span: 0.55 }) },
                { id: 'e4', duration: 9, dialogue: [vo(P6[24], 0.2)],
                  actions: reveal('chain', 'xd', 1.0, { span: 0.45 }) },
            ],
        },
        {
            id: 'card', palette: 'vito',
            background: { color: '#05080d' },
            transitionIn: { kind: 'crossfade', duration: 0.5 },
            cast: [offstage('nuru'), castBoard('card', { alpha: 1 })],
            shots: [
                { id: 'z0', duration: 7,
                  actions: build('card', card.ids, 0.2, { gap: 0.22, span: 0.45 }) },
            ],
        },
    ];

    return fitShots({
        version: 'jirex.film/1',
        meta: { ...META('Usidanganywe'), estimatedTiming: true },
        palettes: { vito: VITO_PALETTE },
        voices: VOICES,
        characters,
        scenes,
    });
}
