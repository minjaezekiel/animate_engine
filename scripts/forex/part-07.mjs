/**
 * Part 7 — "Who is on the other side" / "Nani yuko upande wa pili".
 *
 * Sentiment analysis: what the rest of the market is already positioned for,
 * and the one correct use of that information.
 *
 * ## The framing, and why it is not "fade the crowd"
 *
 * The popular version of this topic is contrarian trading: 80% of retail is
 * long, therefore go short. That is a worse idea than it sounds -- crowded
 * trades can stay crowded for months, and "everyone is long" has never by
 * itself been an entry. It is also exactly the kind of one-rule system this
 * series spent part one arguing against.
 *
 * So sentiment is framed here as a property of a trade rather than a signal
 * for one: it tells you how much fuel is left. If everybody who intended to
 * buy has already bought, the next buyer has to come from somewhere, and
 * there is nobody left. That reasoning survives contact with reality, and it
 * slots underneath part ten's checklist as a filter rather than a trigger.
 *
 * ## Risk-on / risk-off, and the counter-intuitive bit
 *
 * The part spends its last third on the thing that confuses every beginner:
 * bad news in America frequently makes the dollar go UP. The explanation is
 * that a large share of global debt and trade is denominated in dollars, so a
 * scare produces demand for dollars to service it, regardless of where the
 * scare started. Juma says "that makes no sense" because it genuinely does
 * not, until somebody tells you that one fact -- and nobody ever does.
 */
import {
    FONT, L, M, SAFE, build, effect, pathPart, pop, rectPart, reveal, textPart,
} from '../lib/diagram.mjs';
import {
    CHARACTERS, FX_PALETTE, H_AMARA, H_JUMA, META, offstage, says, stand, vo, voicesFor,
} from '../lib/forex.mjs';
import {
    bannerParts, board, cardRows, castBoard, endCard, fitShots, gesture,
    grainParts, hookTitle, inkBlinks, markParts, statParts, titleAt,
} from './common.mjs';

const P7 = {
    en: [
        /* 0 */ 'Every trade needs somebody on the other side. Sentiment asks a simple '
            + 'question: who?',
        /* 1 */ 'Sentiment is what everyone else has already done. Not what they say. '
            + 'What they hold.',
        /* 2 */ 'Your broker publishes it. When eighty percent of their clients are long, '
            + 'ask who is selling to them.',
        /* 3 */ 'That is not a signal to go short. It is a warning that the trade is '
            + 'crowded.',
        /* 4 */ 'A crowded trade has no fuel left. Everyone who was going to buy already '
            + 'has.',
        /* 5 */ 'The big players report too. The COT report, every Friday, shows what the '
            + 'funds are holding.',
        /* 6 */ 'It arrives three days late, so treat it as a tide chart, not a clock.',
        /* 7 */ 'And the broadest version of all: risk-on, and risk-off.',
        /* 8 */ 'Risk-on, money walks toward higher-paying currencies. Risk-off, it runs '
            + 'home.',
        /* 9 */ 'Home is the dollar, the yen, the franc. Even when the frightening thing '
            + 'happened in America.',
        /*10 JUMA  */ 'That makes no sense.',
        /*11 AMARA */ 'It does once you know that most of the world’s debt is priced '
            + 'in dollars.',
        /*12 */ 'Scared people need dollars to pay it. Fear buys dollars. Every time.',
        /*13 AMARA */ 'Sentiment is not an entry. It tells you how crowded the room '
            + 'already is.',
        /*14 LOOP */ 'Next — indicators, and what they genuinely cannot do.',
    ],
    sw: [
        /* 0 */ 'Kila biashara inahitaji mtu upande wa pili. Sentiment inauliza swali '
            + 'rahisi: ni nani?',
        /* 1 */ 'Sentiment ni kile wengine walishakifanya. Si wanachosema. Ni '
            + 'wanachoshikilia.',
        /* 2 */ 'Broker wako anaitangaza. Wateja wake asilimia themanini wakiwa long, '
            + 'jiulize nani anawauzia.',
        /* 3 */ 'Hiyo si ishara ya kuuza. Ni onyo kwamba biashara imejaa watu.',
        /* 4 */ 'Biashara iliyojaa haina mafuta tena. Kila aliyekusudia kununua '
            + 'amesha nunua.',
        /* 5 */ 'Wakubwa nao wanatoa taarifa. Ripoti ya COT, kila Ijumaa, inaonyesha '
            + 'mifuko inashikilia nini.',
        /* 6 */ 'Inachelewa siku tatu, kwa hiyo ichukulie kama ramani ya maji, si saa.',
        /* 7 */ 'Na toleo pana kuliko yote: risk-on, na risk-off.',
        /* 8 */ 'Risk-on, pesa zinaelekea sarafu zinazolipa zaidi. Risk-off, zinakimbia '
            + 'nyumbani.',
        /* 9 */ 'Nyumbani ni dola, yen, faranga. Hata pale kitisho kilipotokea Marekani.',
        /*10 JUMA  */ 'Hilo halina mantiki.',
        /*11 AMARA */ 'Lina, ukijua kwamba deni kubwa la dunia limepangwa kwa dola.',
        /*12 */ 'Watu wenye hofu wanahitaji dola kulilipa. Hofu inanunua dola. Kila mara.',
        /*13 AMARA */ 'Sentiment si mahali pa kuingia. Inakuambia chumba kimejaa kiasi '
            + 'gani.',
        /*14 LOOP */ 'Sehemu ijayo — viashiria, na kile wasichoweza kufanya.',
    ],
};

const T = {
    en: {
        kicker: 'READING THE MARKET  ·  PART 7',
        title: 'Who is on the other side',
        sub: 'positioning, crowds, and running home',

        posH: 'YOUR BROKER PUBLISHES THIS',
        posLong: '80%', posLongL: 'of clients LONG',
        posShort: '20%', posShortL: 'SHORT',
        posAsk: 'so who is selling to them?',

        crowdH: 'A CROWDED TRADE HAS NO FUEL',
        crowdRows: [
            ['NOT A SELL SIGNAL', 'Crowded trades stay crowded for months.', '#9e2b1f'],
            ['A WARNING', 'Everyone who was going to buy already has.', '#9a6a0d'],
            ['USE IT AS A FILTER', 'Not as a trigger. Part 10 puts it in its place.', '#2b4f7a'],
        ],

        cotH: 'WHAT THE BIG PLAYERS HOLD',
        cotV: 'COT',
        cotC: 'published every Friday — and three days late.\nA tide chart, not a clock.',

        riskH: 'RISK-ON  ·  RISK-OFF',
        riskOn: 'RISK-ON\nmoney walks out\ntoward higher yields',
        riskOff: 'RISK-OFF\nmoney runs home\nUSD · JPY · CHF',
        riskWhy: 'most of the world’s debt is priced in dollars —\nso fear buys dollars, wherever the fear started',

        next: 'Next — Part 8:\nindicators, and what they cannot do',
    },
    sw: {
        kicker: 'KUSOMA SOKO  ·  SEHEMU 7',
        title: 'Nani yuko upande wa pili',
        sub: 'nafasi, umati, na kukimbia nyumbani',

        posH: 'BROKER WAKO ANATANGAZA HII',
        posLong: '80%', posLongL: 'ya wateja LONG',
        posShort: '20%', posShortL: 'SHORT',
        posAsk: 'sasa nani anawauzia?',

        crowdH: 'BIASHARA ILIYOJAA HAINA MAFUTA',
        crowdRows: [
            ['SI ISHARA YA KUUZA', 'Biashara zilizojaa hubaki hivyo kwa miezi.', '#9e2b1f'],
            ['NI ONYO', 'Kila aliyekusudia kununua amesha nunua.', '#9a6a0d'],
            ['ITUMIE KAMA CHUJIO', 'Si kama kichocheo. Sehemu ya 10 inaiweka mahali.', '#2b4f7a'],
        ],

        cotH: 'WAKUBWA WANASHIKILIA NINI',
        cotV: 'COT',
        cotC: 'inatolewa kila Ijumaa — na imechelewa siku tatu.\nRamani ya maji, si saa.',

        riskH: 'RISK-ON  ·  RISK-OFF',
        riskOn: 'RISK-ON\npesa zinatoka nje\nkuelekea riba kubwa',
        riskOff: 'RISK-OFF\npesa zinakimbia nyumbani\nUSD · JPY · CHF',
        riskWhy: 'deni kubwa la dunia limepangwa kwa dola —\nhivyo hofu inanunua dola, hofu ilipoanzia popote',

        next: 'Sehemu ya 8:\nviashiria, na wasichoweza kufanya',
    },
};

// ---------------------------------------------------------------------------

/**
 * Retail positioning as ONE bar split, not two bars side by side.
 *
 * Two separate bars would read as two independent quantities. The whole point
 * is that they are the two halves of a single population, and that the small
 * half is who the large half is trading against.
 */
function boardPos(t) {
    const x0 = 100;
    const w = 880;
    const lw = Math.round(w * 0.8);
    return board('pos', [
        textPart('h', t.posH, { at: [540, 596], font: `800 34px ${FONT}`, fill: 'ink',
                                alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0 }),
        rectPart('bl', lw, 130, { at: [x0 + lw / 2, 760], fill: 'bull', stroke: 'ink',
                                  strokeWidth: 4, alpha: 0, z: 10 }),
        rectPart('bs', w - lw, 130, { at: [x0 + lw + (w - lw) / 2, 760], fill: 'bear',
                                      stroke: 'ink', strokeWidth: 4, alpha: 0, z: 10 }),
        textPart('lv', t.posLong, { at: [x0 + lw / 2, 742], font: `800 54px ${FONT}`,
                                    fill: 'white', alpha: 0, z: 20 }),
        textPart('ll', t.posLongL, { at: [x0 + lw / 2, 788], font: `800 24px ${FONT}`,
                                     fill: 'white', alpha: 0, z: 20, maxWidth: lw - 20 }),
        textPart('sv', t.posShort, { at: [x0 + lw + (w - lw) / 2, 742],
                                     font: `800 40px ${FONT}`, fill: 'white', alpha: 0, z: 20 }),
        textPart('sl', t.posShortL, { at: [x0 + lw + (w - lw) / 2, 784],
                                      font: `800 22px ${FONT}`, fill: 'white', alpha: 0,
                                      z: 20, maxWidth: w - lw - 10 }),
        textPart('ask', t.posAsk, { at: [540, 912], font: `800 36px ${FONT}`, fill: 'gold',
                                    alpha: 0, z: 30, maxWidth: SAFE.x1 - SAFE.x0 }),
    ]);
}

function boardCrowd(t) {
    const rows = cardRows('cr', t.crowdRows, { top: 614, h: 152, gap: 20 });
    return {
        ...board('crowd', [
            textPart('h', t.crowdH, { at: [540, 556], font: `800 34px ${FONT}`, fill: 'ink',
                                      alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0 }),
            ...rows.parts,
        ]),
        rows,
    };
}

function boardCot(t) {
    return board('cot', [
        textPart('h', t.cotH, { at: [540, 640], font: `800 34px ${FONT}`, fill: 'dim',
                                alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0 }),
        ...statParts('c', t.cotV, t.cotC, { at: [540, 830], fill: 'level', size: 150 }),
    ]);
}

/** Risk-on and risk-off, and the sentence that makes risk-off make sense. */
function boardRisk(t) {
    return board('risk', [
        textPart('h', t.riskH, { at: [540, 566], font: `800 38px ${FONT}`, fill: 'ink',
                                 alpha: 0, z: 60 }),
        rectPart('on', 420, 260, { at: [300, 790], fill: 'paperLit', stroke: 'bull',
                                   strokeWidth: 6, alpha: 0, z: 10 }),
        textPart('ont', t.riskOn, { at: [300, 752], font: `800 30px ${FONT}`, fill: 'bull',
                                    alpha: 0, z: 20, maxWidth: 380, lineHeight: 40 }),
        rectPart('off', 420, 260, { at: [780, 790], fill: 'paperLit', stroke: 'level',
                                    strokeWidth: 6, alpha: 0, z: 10 }),
        textPart('offt', t.riskOff, { at: [780, 752], font: `800 30px ${FONT}`,
                                      fill: 'level', alpha: 0, z: 20, maxWidth: 380,
                                      lineHeight: 40 }),
        textPart('why', t.riskWhy, { at: [540, 1052], font: `800 30px ${FONT}`,
                                     fill: 'gold', alpha: 0, z: 30,
                                     maxWidth: SAFE.x1 - SAFE.x0, lineHeight: 40 }),
    ]);
}

// ---------------------------------------------------------------------------

export function partSeven(lang) {
    const t = T[lang];
    const P = P7[lang];

    const pos = boardPos(t);
    const crowd = boardCrowd(t);
    const cot = boardCot(t);
    const risk = boardRisk(t);
    const card = endCard(lang, 7, t.next);
    const ban = bannerParts(lang, 7);
    const grain = grainParts('gr', { seed: 239 });
    const titles = board('titles', hookTitle(t.kicker, t.title, t.sub));

    const boards = [pos, crowd, cot, risk, titles,
                    board('card', card.parts), board('ban', ban), board('grain', grain)];
    const characters = { ...CHARACTERS };
    for (const b of boards) characters[b.name] = effect(b.parts, { palette: 'fx' });

    const withBan = (cast) => [
        castBoard('grain', { alpha: 1 }), ...cast, castBoard('ban', { alpha: 1 })];
    const PAPER = { color: FX_PALETTE.paper };

    const scenes = [
        {
            id: 'open', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'fade', from: '#eef0e2', duration: 0.5 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([stand('amara', 540, H_AMARA * 1.06),
                           castBoard('titles', { alpha: 1 })]),
            shots: [
                { id: 'o0', dialogue: [says('amara', P[0], 0.15)],
                  actions: [
                      ...gesture('amara', 'ask', 0.15, { hold: 1.4 }),
                      ...build('titles', ['kicker', 'title', 'titlesub'],
                               titleAt(P[0], lang), { gap: 0.2, span: 0.45 }),
                      ...inkBlinks('amara', 4, 251),
                  ] },
            ],
        },

        {
            id: 'pos', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('pos', { alpha: 1 })]),
            shots: [
                { id: 'p0', dialogue: [vo(P[1], 0.15)],
                  actions: reveal('pos', 'h', 0.2, { span: 0.35 }) },
                { id: 'p1', dialogue: [vo(P[2], 0.15)],
                  actions: [
                      ...build('pos', ['bl', 'lv', 'll'], 0.3, { gap: 0.1, span: 0.3 }),
                      ...build('pos', ['bs', 'sv', 'sl'], 1.6, { gap: 0.1, span: 0.3 }),
                      ...pop('pos', 'ask', 3.0, { span: 0.4 }),
                  ] },
            ],
        },

        {
            id: 'crowd', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('crowd', { alpha: 1 })]),
            shots: [
                { id: 'c0', dialogue: [vo(P[3], 0.15)],
                  actions: [
                      ...reveal('crowd', 'h', 0.15, { span: 0.3 }),
                      ...build('crowd', crowd.rows.rowIds(0), 0.6, { gap: 0.08, span: 0.3 }),
                  ] },
                { id: 'c1', dialogue: [vo(P[4], 0.15)],
                  actions: [
                      ...build('crowd', crowd.rows.rowIds(1), 0.3, { gap: 0.08, span: 0.3 }),
                      ...build('crowd', crowd.rows.rowIds(2), 2.2, { gap: 0.08, span: 0.3 }),
                  ] },
            ],
        },

        {
            id: 'cot', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('cot', { alpha: 1 })]),
            shots: [
                { id: 'k0', dialogue: [vo(P[5], 0.15)],
                  actions: [
                      ...reveal('cot', 'h', 0.15, { span: 0.3 }),
                      ...pop('cot', 'c_v', 0.6, { span: 0.5 }),
                  ] },
                { id: 'k1', dialogue: [vo(P[6], 0.15)],
                  actions: reveal('cot', 'c_c', 0.3, { span: 0.4 }) },
            ],
        },

        // --- risk on, risk off ------------------------------------------------
        {
            id: 'risk', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([
                offstage('juma'), offstage('amara'), castBoard('risk', { alpha: 1 }),
            ]),
            shots: [
                { id: 'r0', dialogue: [vo(P[7], 0.15)],
                  actions: reveal('risk', 'h', 0.2, { span: 0.35 }) },
                { id: 'r1', dialogue: [vo(P[8], 0.15)],
                  actions: [
                      ...build('risk', ['on', 'ont'], 0.3, { gap: 0.1, span: 0.35 }),
                      ...build('risk', ['off', 'offt'], 2.0, { gap: 0.1, span: 0.35 }),
                  ] },
                { id: 'r2', dialogue: [vo(P[9], 0.15)], actions: [] },
                { id: 'r3', dialogue: [says('juma', P[10], 0.15)], actions: [] },
                { id: 'r4', dialogue: [says('amara', P[11], 0.15)],
                  actions: pop('risk', 'why', 0.4, { span: 0.45 }) },
                { id: 'r5', dialogue: [vo(P[12], 0.15)], actions: [] },
            ],
        },

        {
            id: 'thesis', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.4 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([stand('amara', 540, H_AMARA * 1.06)]),
            shots: [
                { id: 't0', dialogue: [says('amara', P[13], 0.2)],
                  actions: [...gesture('amara', 'sure', 0.2, { hold: 1.8 }),
                            ...inkBlinks('amara', 5, 263)] },
            ],
        },

        {
            id: 'card', palette: 'fx',
            background: { color: FX_PALETTE.paperLit },
            transitionIn: { kind: 'crossfade', duration: 0.4 },
            cast: [castBoard('grain', { alpha: 1 }), offstage('amara'),
                   castBoard('card', { alpha: 1 })],
            shots: [
                { id: 'e0', dialogue: [vo(P[14], 0.15)],
                  actions: build('card', card.ids, 0.15, { gap: 0.17, span: 0.4 }) },
            ],
        },
    ];

    return fitShots({
        version: 'jirex.film/1',
        meta: { ...META(lang, t.title), estimatedTiming: true },
        palettes: { fx: FX_PALETTE },
        voices: voicesFor(lang),
        characters,
        scenes,
    }, lang);
}
