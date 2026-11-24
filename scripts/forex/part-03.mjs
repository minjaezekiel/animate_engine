/**
 * Part 3 — "Pips, lots and leverage" / "Pip, lot na leverage".
 *
 * The arithmetic of position size. This is the part viewers skip and the part
 * that actually decides whether they have an account next month, so the film
 * says that out loud in its first line rather than hoping.
 *
 * ## The numbers, and that they are exact
 *
 * Everything here is definitional rather than opinion, and all of it is
 * checkable on any broker's contract specification:
 *
 * - A pip is the fourth decimal for most pairs (0.0001) and the SECOND for
 *   yen pairs (0.01). The yen exception is not trivia: it is a factor of 100,
 *   and a beginner who sizes a USD/JPY stop in "pips" using the EUR/USD rule
 *   is wrong by two orders of magnitude.
 * - Lot sizes are 100,000 / 10,000 / 1,000 units of the BASE currency.
 * - On a pair quoted in dollars, one pip is therefore $10 / $1 / $0.10.
 *   (100,000 x 0.0001 = 10.)
 * - A $100 account trading one standard lot is $10 a pip, so ten pips against
 *   it is the whole account. EUR/USD routinely moves several times that in a
 *   day, which is what makes the example fair rather than alarmist.
 *
 * ## The leverage point, and why it is framed as a cap
 *
 * Leverage does not add money. It lowers the margin the broker holds, which
 * lets a given deposit control a larger position -- so what it multiplies is
 * position size, and therefore risk. The film gives the regulated and
 * unregulated numbers side by side (ESMA/FCA cap majors at 30:1 for retail;
 * offshore brokers commonly advertise 500:1 or more) because the audience for
 * this series is overwhelmingly trading with the second kind, and the gap
 * between those two numbers is the clearest statement anyone has made about
 * what regulators think retail leverage does to retail accounts.
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

const P3 = {
    en: [
        /* 0 */ 'This is the part everybody skips. It decides whether you still have an '
            + 'account next month.',
        /* 1 */ 'A pip is the smallest standard move. For most pairs it is the fourth '
            + 'decimal place.',
        /* 2 */ 'Yen pairs are the exception. There it is the second. Get that wrong and '
            + 'you are out by a hundred times.',
        /* 3 */ 'What a pip is WORTH depends entirely on how big your position is. That is '
            + 'the lot.',
        /* 4 */ 'Standard lot: a hundred thousand units. Mini: ten thousand. Micro: one '
            + 'thousand.',
        /* 5 */ 'On a dollar-quoted pair that is ten dollars a pip, one dollar a pip, ten '
            + 'cents a pip.',
        /* 6 JUMA  */ 'So on a hundred dollar account?',
        /* 7 AMARA */ 'One standard lot. Ten pips against you. The account is gone.',
        /* 8 */ 'Ten pips is nothing. Euro-dollar moves several times that on a quiet day.',
        /* 9 */ 'Leverage does not give you money. It lowers the deposit the broker holds.',
        /*10 */ 'Same money, much bigger position. Five hundred to one lets you take five '
            + 'hundred times the risk.',
        /*11 */ 'Where regulators cap it: thirty to one. Where nobody does: five hundred. '
            + 'Ask yourself why.',
        /*12 */ 'Last cost — the spread. Buy at the ask, sell at the bid. Every trade '
            + 'starts behind.',
        /*13 */ 'One pip: ten cents on a micro lot. Ten dollars on a standard.',
        /*14 AMARA */ 'Leverage is not the opportunity. It is why most of those accounts '
            + 'closed.',
        /*15 LOOP */ 'Next — MT4 and MT5, and the one field you must never leave empty.',
    ],
    sw: [
        /* 0 */ 'Hii ndiyo sehemu kila mtu anaruka. Ndiyo inayoamua kama bado utakuwa na '
            + 'akaunti mwezi ujao.',
        /* 1 */ 'Pip ni msogeo mdogo zaidi wa kawaida. Kwa jozi nyingi ni nafasi ya nne '
            + 'baada ya nukta.',
        /* 2 */ 'Jozi za yen ni tofauti. Hapo ni ya pili. Ukikosea hapo umekosea mara mia.',
        /* 3 */ 'Thamani ya pip inategemea ukubwa wa nafasi yako. Huo ndio lot.',
        /* 4 */ 'Standard lot: vipimo laki moja. Mini: elfu kumi. Micro: elfu moja.',
        /* 5 */ 'Kwenye jozi ya dola ni dola kumi kwa pip, dola moja kwa pip, senti kumi '
            + 'kwa pip.',
        /* 6 JUMA  */ 'Kwa hiyo kwenye akaunti ya dola mia?',
        /* 7 AMARA */ 'Standard lot moja. Pip kumi dhidi yako. Akaunti imeisha.',
        /* 8 */ 'Pip kumi si kitu. Euro-dola inasogea mara kadhaa ya hapo hata siku ya '
            + 'utulivu.',
        /* 9 */ 'Leverage haikupi pesa. Inapunguza amana ambayo broker anashikilia.',
        /*10 */ 'Pesa zile zile, nafasi kubwa zaidi. Mia tano kwa moja inakuruhusu kubeba '
            + 'hatari mara mia tano.',
        /*11 */ 'Wadhibiti wanapoweka kikomo: thelathini kwa moja. Pasipo na anayeweka: '
            + 'mia tano. Jiulize kwa nini.',
        /*12 */ 'Gharama ya mwisho — spread. Nunua kwa ask, uza kwa bid. Kila biashara '
            + 'inaanza nyuma.',
        /*13 */ 'Pip moja: senti kumi kwenye micro. Dola kumi kwenye standard.',
        /*14 AMARA */ 'Leverage si fursa. Ndiyo sababu akaunti nyingi zilifungwa.',
        /*15 LOOP */ 'Sehemu ijayo — MT4 na MT5, na sehemu moja usiyopaswa kuiacha wazi.',
    ],
};

const T = {
    en: {
        kicker: 'READING THE MARKET  ·  PART 3',
        title: 'Pips, lots and leverage',
        sub: 'the arithmetic that decides if you survive',

        pipH: 'ONE PIP',
        pipPrice: '1.08',
        pipDigit: '5',
        pipTail: '0',
        pipNote: 'the fourth decimal — for most pairs',
        pipYen: 'USD/JPY  ·  157.4',
        pipYenD: '2',
        pipYenNote: 'yen pairs: the SECOND decimal',

        lotH: 'WHAT ONE PIP IS WORTH',
        lotRows: [
            ['STANDARD  ·  100,000', '$10.00 per pip', '#9e2b1f'],
            ['MINI  ·  10,000', '$1.00 per pip', '#9a6a0d'],
            ['MICRO  ·  1,000', '$0.10 per pip', '#15663f'],
        ],

        blowH: 'A $100 ACCOUNT, ONE STANDARD LOT',
        blowV: '10 pips',
        blowC: 'and the account is gone',

        levH: 'LEVERAGE DOES NOT ADD MONEY',
        levRows: [
            ['SAME DEPOSIT', '$200 of your money, either way', '#2b4f7a'],
            ['BIGGER POSITION', 'at 500:1 it controls $100,000', '#9e2b1f'],
            ['SO: BIGGER RISK', 'the loss scales with the position, not the deposit', '#9e2b1f'],
        ],
        capA: '30:1', capAc: 'where regulators cap it',
        capB: '500:1', capBc: 'where nobody does',

        spH: 'THE SPREAD — PAID THE INSTANT YOU CLICK',
        spBid: 'BID  1.08495', spBidL: 'you SELL here',
        spAsk: 'ASK  1.08505', spAskL: 'you BUY here',
        spGap: '1.0 pip  ·  you start behind',

        next: 'Next — Part 4:\nMT4, MT5, and the order ticket',
    },
    sw: {
        kicker: 'KUSOMA SOKO  ·  SEHEMU 3',
        title: 'Pip, lot na leverage',
        sub: 'hesabu inayoamua kama utanusurika',

        pipH: 'PIP MOJA',
        pipPrice: '1.08',
        pipDigit: '5',
        pipTail: '0',
        pipNote: 'nafasi ya nne — kwa jozi nyingi',
        pipYen: 'USD/JPY  ·  157.4',
        pipYenD: '2',
        pipYenNote: 'jozi za yen: nafasi ya PILI',

        lotH: 'THAMANI YA PIP MOJA',
        lotRows: [
            ['STANDARD  ·  100,000', '$10.00 kwa pip', '#9e2b1f'],
            ['MINI  ·  10,000', '$1.00 kwa pip', '#9a6a0d'],
            ['MICRO  ·  1,000', '$0.10 kwa pip', '#15663f'],
        ],

        blowH: 'AKAUNTI YA $100, STANDARD LOT MOJA',
        blowV: 'pip 10',
        blowC: 'na akaunti imeisha',

        levH: 'LEVERAGE HAIONGEZI PESA',
        levRows: [
            ['AMANA ILEILE', '$200 za pesa zako, vyovyote vile', '#2b4f7a'],
            ['NAFASI KUBWA ZAIDI', 'kwa 500:1 inashikilia $100,000', '#9e2b1f'],
            ['HIVYO: HATARI KUBWA', 'hasara inakua na nafasi, si na amana', '#9e2b1f'],
        ],
        capA: '30:1', capAc: 'pale wadhibiti wanapoweka kikomo',
        capB: '500:1', capBc: 'pasipo na anayeweka',

        spH: 'SPREAD — UNALIPA MARA UNAPOBONYEZA',
        spBid: 'BID  1.08495', spBidL: 'unauza hapa',
        spAsk: 'ASK  1.08505', spAskL: 'unanunua hapa',
        spGap: 'pip 1.0  ·  unaanza ukiwa nyuma',

        next: 'Sehemu ya 4:\nMT4, MT5, na tiketi ya oda',
    },
};

// ---------------------------------------------------------------------------
// The boards
// ---------------------------------------------------------------------------

/**
 * Which digit is the pip.
 *
 * The price is drawn as THREE text parts rather than one string, because the
 * whole teaching is that one specific character in the number is the one that
 * matters -- and a colour cannot be applied to part of a text node. Three
 * parts, laid out by hand, with only the middle one in gold.
 */
function boardPip(t) {
    return board('pip', [
        textPart('h', t.pipH, { at: [540, 566], font: `800 34px ${FONT}`, fill: 'dim',
                                alpha: 0, z: 60 }),
        textPart('pA', t.pipPrice, { at: [392, 700], font: `800 110px ${FONT}`,
                                     fill: 'ink', align: 'right', alpha: 0, z: 20 }),
        textPart('pB', t.pipDigit, { at: [460, 700], font: `800 110px ${FONT}`,
                                     fill: 'gold', alpha: 0, z: 20 }),
        textPart('pC', t.pipTail, { at: [528, 700], font: `800 110px ${FONT}`,
                                    fill: 'ink', align: 'left', alpha: 0, z: 20 }),
        pathPart('arrow', `${M(460, 782)} ${L(460, 830)} ${L(444, 810)} ${M(460, 830)} ${L(476, 810)}`,
                 { stroke: 'gold', strokeWidth: 6, alpha: 0, z: 30, lineCap: 'round' }),
        textPart('note', t.pipNote, { at: [540, 884], font: `800 31px ${FONT}`,
                                      fill: 'gold', alpha: 0, z: 30,
                                      maxWidth: SAFE.x1 - SAFE.x0 }),
        pathPart('rule', `${M(200, 962)} ${L(880, 962)}`,
                 { stroke: 'rule', strokeWidth: 3, alpha: 0, z: 20 }),
        textPart('yen', t.pipYen, { at: [540, 1030], font: `800 46px ${FONT}`,
                                    fill: 'ink', alpha: 0, z: 20 }),
        textPart('yenN', t.pipYenNote, { at: [540, 1098], font: `800 31px ${FONT}`,
                                         fill: 'warn', alpha: 0, z: 30,
                                         maxWidth: SAFE.x1 - SAFE.x0 }),
    ]);
}

function boardLot(t) {
    const rows = cardRows('lr', t.lotRows, { top: 620, h: 152, gap: 20 });
    return {
        ...board('lot', [
            textPart('h', t.lotH, { at: [540, 556], font: `800 36px ${FONT}`, fill: 'ink',
                                    alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0 }),
            ...rows.parts,
        ]),
        rows,
    };
}

function boardBlow(t) {
    return board('blow', [
        textPart('h', t.blowH, { at: [540, 620], font: `800 34px ${FONT}`, fill: 'dim',
                                 alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0 }),
        ...statParts('b', t.blowV, t.blowC, { at: [540, 810], fill: 'warn', size: 150 }),
        ...markParts('x', false, [540, 1086], { size: 64 }),
    ]);
}

function boardLev(t) {
    const rows = cardRows('vr', t.levRows, { top: 584, h: 148, gap: 18 });
    return {
        ...board('lev', [
            textPart('h', t.levH, { at: [540, 528], font: `800 36px ${FONT}`, fill: 'ink',
                                    alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0 }),
            ...rows.parts,
            // The two caps, side by side. The comparison IS the argument, so
            // they share a baseline and differ in exactly one thing.
            ...statParts('ca', t.capA, t.capAc, { at: [300, 1120], fill: 'good', size: 76 }),
            ...statParts('cb', t.capB, t.capBc, { at: [780, 1120], fill: 'warn', size: 76 }),
        ]),
        rows,
    };
}

function boardSpread(t) {
    return board('spread', [
        textPart('h', t.spH, { at: [540, 600], font: `800 33px ${FONT}`, fill: 'ink',
                               alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0 }),
        rectPart('askBg', 760, 104, { at: [540, 740], fill: 'paperLit', stroke: 'bull',
                                      strokeWidth: 5, alpha: 0, z: 10 }),
        textPart('ask', t.spAsk, { at: [330, 740], font: `800 40px ${FONT}`, fill: 'bull',
                                   align: 'left', alpha: 0, z: 12, maxWidth: 440 }),
        textPart('askL', t.spAskL, { at: [750, 740], font: `800 26px ${FONT}`, fill: 'dim',
                                     align: 'right', alpha: 0, z: 12, maxWidth: 300 }),
        rectPart('bidBg', 760, 104, { at: [540, 870], fill: 'paperLit', stroke: 'bear',
                                      strokeWidth: 5, alpha: 0, z: 10 }),
        textPart('bid', t.spBid, { at: [330, 870], font: `800 40px ${FONT}`, fill: 'bear',
                                   align: 'left', alpha: 0, z: 12, maxWidth: 440 }),
        textPart('bidL', t.spBidL, { at: [750, 870], font: `800 26px ${FONT}`, fill: 'dim',
                                     align: 'right', alpha: 0, z: 12, maxWidth: 300 }),
        textPart('gap', t.spGap, { at: [540, 988], font: `800 34px ${FONT}`, fill: 'warn',
                                   alpha: 0, z: 30, maxWidth: SAFE.x1 - SAFE.x0 }),
    ]);
}

// ---------------------------------------------------------------------------

export function partThree(lang) {
    const t = T[lang];
    const P = P3[lang];

    const pip = boardPip(t);
    const lot = boardLot(t);
    const blow = boardBlow(t);
    const lev = boardLev(t);
    const spread = boardSpread(t);
    const card = endCard(lang, 3, t.next);
    const ban = bannerParts(lang, 3);
    const grain = grainParts('gr', { seed: 53 });
    const titles = board('titles', hookTitle(t.kicker, t.title, t.sub));

    const boards = [pip, lot, blow, lev, spread, titles,
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
                      ...gesture('amara', 'sure', 0.15, { hold: 1.8 }),
                      ...build('titles', ['kicker', 'title', 'titlesub'],
                               titleAt(P[0], lang), { gap: 0.2, span: 0.45 }),
                      ...inkBlinks('amara', 5, 3),
                  ] },
            ],
        },

        {
            id: 'pip', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('pip', { alpha: 1 })]),
            shots: [
                { id: 'i0', dialogue: [vo(P[1], 0.15)],
                  actions: [
                      ...reveal('pip', 'h', 0.15, { span: 0.3 }),
                      ...build('pip', ['pA', 'pB', 'pC'], 0.5, { gap: 0.1, span: 0.3 }),
                      ...reveal('pip', 'arrow', 1.6, { span: 0.3 }),
                      ...reveal('pip', 'note', 2.0, { span: 0.35 }),
                  ] },
                { id: 'i1', dialogue: [vo(P[2], 0.15)],
                  actions: [
                      ...reveal('pip', 'rule', 0.2, { span: 0.25 }),
                      ...reveal('pip', 'yen', 0.5, { span: 0.35 }),
                      ...pop('pip', 'yenN', 1.8, { span: 0.4 }),
                  ] },
            ],
        },

        {
            id: 'lot', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('lot', { alpha: 1 })]),
            shots: [
                { id: 'l0', dialogue: [vo(P[3], 0.15)],
                  actions: reveal('lot', 'h', 0.2, { span: 0.35 }) },
                { id: 'l1', dialogue: [vo(P[4], 0.15)],
                  actions: [
                      ...build('lot', lot.rows.rowIds(0), 0.25, { gap: 0.08, span: 0.3 }),
                      ...build('lot', lot.rows.rowIds(1), 1.4, { gap: 0.08, span: 0.3 }),
                      ...build('lot', lot.rows.rowIds(2), 2.5, { gap: 0.08, span: 0.3 }),
                  ] },
                { id: 'l2', dialogue: [vo(P[5], 0.15)], actions: [] },
            ],
        },

        // --- the account that is already gone ---------------------------------
        {
            id: 'blow', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([
                offstage('juma'), offstage('amara'), castBoard('blow', { alpha: 1 }),
            ]),
            shots: [
                { id: 'b0', dialogue: [says('juma', P[6], 0.15)],
                  actions: reveal('blow', 'h', 0.2, { span: 0.35 }) },
                { id: 'b1', dialogue: [says('amara', P[7], 0.15)],
                  actions: [
                      ...pop('blow', 'b_v', 0.3, { span: 0.45 }),
                      ...reveal('blow', 'b_c', 1.4, { span: 0.35 }),
                      ...reveal('blow', 'x', 2.2, { span: 0.3 }),
                  ] },
                { id: 'b2', dialogue: [vo(P[8], 0.15)], actions: [] },
            ],
        },

        {
            id: 'lev', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('lev', { alpha: 1 })]),
            shots: [
                { id: 'v0', dialogue: [vo(P[9], 0.15)],
                  actions: reveal('lev', 'h', 0.2, { span: 0.35 }) },
                { id: 'v1', dialogue: [vo(P[10], 0.15)],
                  actions: [
                      ...build('lev', lev.rows.rowIds(0), 0.25, { gap: 0.08, span: 0.3 }),
                      ...build('lev', lev.rows.rowIds(1), 1.8, { gap: 0.08, span: 0.3 }),
                  ] },
                { id: 'v2', dialogue: [vo(P[11], 0.15)],
                  actions: [
                      ...build('lev', lev.rows.rowIds(2), 0.2, { gap: 0.08, span: 0.3 }),
                      // The two caps land on "thirty to one" and "five
                      // hundred" respectively, which is the only placement
                      // where the comparison does the talking.
                      ...build('lev', ['ca_v', 'ca_c'], 1.2, { gap: 0.14, span: 0.35, how: pop }),
                      ...build('lev', ['cb_v', 'cb_c'], 2.9, { gap: 0.14, span: 0.35, how: pop }),
                  ] },
            ],
        },

        {
            id: 'spread', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('spread', { alpha: 1 })]),
            shots: [
                { id: 's0', dialogue: [vo(P[12], 0.15)],
                  actions: [
                      ...reveal('spread', 'h', 0.15, { span: 0.3 }),
                      ...build('spread', ['askBg', 'ask', 'askL'], 0.6,
                               { gap: 0.08, span: 0.3 }),
                      ...build('spread', ['bidBg', 'bid', 'bidL'], 1.8,
                               { gap: 0.08, span: 0.3 }),
                  ] },
                { id: 's1', dialogue: [vo(P[13], 0.15)],
                  actions: pop('spread', 'gap', 0.4, { span: 0.4 }) },
            ],
        },

        {
            id: 'thesis', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.4 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([stand('amara', 540, H_AMARA * 1.06)]),
            shots: [
                { id: 't0', dialogue: [says('amara', P[14], 0.2)],
                  actions: [...gesture('amara', 'present', 0.2, { hold: 2.0 }),
                            ...inkBlinks('amara', 5, 67)] },
            ],
        },

        {
            id: 'card', palette: 'fx',
            background: { color: FX_PALETTE.paperLit },
            transitionIn: { kind: 'crossfade', duration: 0.4 },
            cast: [castBoard('grain', { alpha: 1 }), offstage('amara'),
                   castBoard('card', { alpha: 1 })],
            shots: [
                { id: 'e0', dialogue: [vo(P[15], 0.15)],
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
