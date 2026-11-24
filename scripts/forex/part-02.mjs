/**
 * Part 2 — "What you actually bought" / "Ulichonunua hasa".
 *
 * Base and quote currency, and the single idea the rest of the series needs
 * installed before anything else: a forex trade is not a bet on a number
 * going up. It is an exchange of one country's money for another's, and the
 * "price" is just how much of the second it takes to buy one of the first.
 *
 * Almost every beginner mistake downstream of here is really this mistake.
 * Somebody who thinks EUR/USD is a ticker that wiggles cannot reason about
 * why a US interest-rate decision moves it (part six), why being long EUR/USD
 * and long USD/CHF is nearly the same trade twice (part seven), or why the
 * dollar leg is on one side of most of their positions at once. So this part
 * does one thing slowly rather than six things quickly.
 *
 * ## The figure on screen
 *
 * **The US dollar is on one side of about 89% of all trades.** BIS Triennial
 * Survey, April 2025. Currency shares sum to 200% because every trade has two
 * sides, which is itself worth saying out loud -- it is the same "two
 * currencies at once" point the whole part is built on, and it is why the
 * number can be 89 without the dollar being 89% of the market.
 */
import {
    FONT, L, M, SAFE, build, conceal, effect, pathPart, pop, rectPart, reveal, textPart,
} from '../lib/diagram.mjs';
import {
    CHARACTERS, FX_PALETTE, H_AMARA, H_JUMA, META, offstage, says, stand, vo, voicesFor,
} from '../lib/forex.mjs';
import {
    bannerParts, board, cardRows, castBoard, chartParts, endCard, fitShots, gesture,
    grainParts, hookTitle, inkBlinks, markParts, pairParts, statParts, titleAt,
} from './common.mjs';

const P2 = {
    en: [
        /* 0 JUMA  */ 'I pressed buy on EUR slash USD. What did I actually buy?',
        /* 1 AMARA */ 'Euros. And you paid for them in dollars. That is the whole thing.',
        /* 2 */ 'Every pair has two halves. First the BASE. Then the QUOTE.',
        /* 3 */ 'The base is what you are buying. The quote is what you pay with.',
        /* 4 */ 'The price is how many of the quote it takes to buy ONE of the base.',
        /* 5 */ 'One euro costs one dollar eight five. Not a ticker. A price.',
        /* 6 JUMA  */ 'So when the number goes up?',
        /* 7 AMARA */ 'The euro got stronger, or the dollar got weaker. Usually some of '
            + 'both.',
        /* 8 */ 'You are never just buying. Every trade sells one currency to buy another.',
        /* 9 */ 'The dollar is on one side of about eighty-nine percent of all trades.',
        /*10 */ 'Sell EUR slash USD? You are buying dollars with euros.',
        /*11 */ 'Same rule everywhere. USD slash TZS: base dollar, quote shilling.',
        /*12 */ 'If it rises, one dollar costs more shillings. The shilling got weaker.',
        /*13 AMARA */ 'You already knew this. It is what the bureau de change does, faster.',
        /*14 */ 'You are not betting on a number. You are holding one country’s money '
            + 'against another’s.',
        /*15 LOOP */ 'Next — pips, lots and leverage: the numbers that decide if you '
            + 'survive.',
    ],
    sw: [
        /* 0 JUMA  */ 'Nilibonyeza buy kwenye EUR kwa USD. Nilinunua nini hasa?',
        /* 1 AMARA */ 'Euro. Na ukazilipia kwa dola. Ndiyo yote hiyo.',
        /* 2 */ 'Kila jozi ina nusu mbili. Ya kwanza ni BASE. Ya pili ni QUOTE.',
        /* 3 */ 'Base ndiyo unayoinunua. Quote ndiyo unayolipia.',
        /* 4 */ 'Na bei? Ni kiasi gani cha quote kinahitajika kununua MOJA ya base.',
        /* 5 */ 'Euro moja inagharimu dola moja nukta nane tano. Si "EUR/USD iko 1.0850". '
            + 'Euro moja. Inagharimu. Kiasi hicho.',
        /* 6 JUMA  */ 'Kwa hiyo namba ikipanda?',
        /* 7 AMARA */ 'Euro imekuwa na nguvu, au dola imedhoofika. Mara nyingi vyote '
            + 'viwili.',
        /* 8 */ 'Hununui tu. Kila biashara inauza sarafu moja ili kununua nyingine.',
        /* 9 */ 'Ndiyo maana dola iko upande mmoja wa takribani asilimia themanini na tisa '
            + 'ya biashara zote.',
        /*10 */ 'Ukiuza EUR kwa USD hauuzi chati. Unanunua dola kwa euro.',
        /*11 */ 'Kanuni ileile kila mahali. USD kwa TZS: base ni dola, quote ni shilingi.',
        /*12 */ 'Ikipanda, inahitaji shilingi nyingi zaidi kununua dola moja. Shilingi '
            + 'imedhoofika.',
        /*13 AMARA */ 'Ulishajua hili. Ndicho anachofanya mbadilishaji wa fedha. Chati '
            + 'inafanya haraka zaidi.',
        /*14 */ 'Huwekezi kwenye namba. Unashikilia fedha ya nchi moja dhidi ya nyingine.',
        /*15 LOOP */ 'Sehemu ijayo — pip, lot na leverage: namba zinazoamua kama '
            + 'utanusurika.',
    ],
};

const T = {
    en: {
        kicker: 'READING THE MARKET  ·  PART 2',
        title: 'What you actually bought',
        sub: 'base, quote, and the price between them',

        pairBase: 'EUR', pairQuote: 'USD', pairRate: '1.0850',
        pairBaseL: 'BASE\nwhat you buy',
        pairQuoteL: 'QUOTE\nwhat you pay with',
        pairLine: 'one euro costs 1.0850 dollars',

        upH: 'WHEN THE NUMBER RISES',
        upRows: [
            ['THE BASE GOT STRONGER', 'more people want euros', '#15663f'],
            ['OR THE QUOTE GOT WEAKER', 'fewer people want dollars', '#9e2b1f'],
            ['USUALLY BOTH AT ONCE', 'which is why a pair is never one story', '#2b4f7a'],
        ],

        dollarV: '89%',
        dollarC: 'of all trades have the US dollar\non one side — BIS, April 2025',
        dollarH: 'TWO CURRENCIES, EVERY TIME',

        tzsH: 'THE SAME RULE, CLOSER TO HOME',
        tzsBase: 'USD', tzsQuote: 'TZS', tzsRate: '2,480',
        tzsBaseL: 'BASE\nthe dollar',
        tzsQuoteL: 'QUOTE\nthe shilling',
        tzsLine: 'one dollar costs 2,480 shillings',
        tzsUp: 'rises  →  it takes MORE shillings  →  the shilling got weaker',

        next: 'Next — Part 3:\npips, lots, leverage, spread',
    },
    sw: {
        kicker: 'KUSOMA SOKO  ·  SEHEMU 2',
        title: 'Ulichonunua hasa',
        sub: 'base, quote, na bei kati yao',

        pairBase: 'EUR', pairQuote: 'USD', pairRate: '1.0850',
        pairBaseL: 'BASE\nunayoinunua',
        pairQuoteL: 'QUOTE\nunayolipia',
        pairLine: 'euro moja inagharimu dola 1.0850',

        upH: 'NAMBA IKIPANDA',
        upRows: [
            ['BASE IMEPATA NGUVU', 'watu wengi zaidi wanataka euro', '#15663f'],
            ['AU QUOTE IMEDHOOFIKA', 'watu wachache wanataka dola', '#9e2b1f'],
            ['MARA NYINGI VYOTE VIWILI', 'ndiyo maana jozi si hadithi moja', '#2b4f7a'],
        ],

        dollarV: '89%',
        dollarC: 'ya biashara zote zina dola ya Marekani\nupande mmoja — BIS, Aprili 2025',
        dollarH: 'SARAFU MBILI, KILA MARA',

        tzsH: 'KANUNI ILEILE, KARIBU NASI',
        tzsBase: 'USD', tzsQuote: 'TZS', tzsRate: '2,480',
        tzsBaseL: 'BASE\ndola',
        tzsQuoteL: 'QUOTE\nshilingi',
        tzsLine: 'dola moja inagharimu shilingi 2,480',
        tzsUp: 'ikipanda  →  shilingi NYINGI zaidi  →  shilingi imedhoofika',

        next: 'Sehemu ya 3:\npip, lot, leverage, spread',
    },
};

// ---------------------------------------------------------------------------
// The boards
// ---------------------------------------------------------------------------

/** The one picture the whole part turns on. */
function boardPair(t) {
    const pair = pairParts('pr', {
        base: t.pairBase, quote: t.pairQuote, rate: t.pairRate,
        baseL: t.pairBaseL, quoteL: t.pairQuoteL, line: t.pairLine,
        at: [540, 700],
    });
    return { ...board('pair', pair.parts), pair };
}

function boardUp(t) {
    const rows = cardRows('ur', t.upRows, { top: 620, h: 156, gap: 20 });
    return {
        ...board('up', [
            textPart('h', t.upH, { at: [540, 556], font: `800 36px ${FONT}`, fill: 'ink',
                                   alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0 }),
            ...rows.parts,
        ]),
        rows,
    };
}

/**
 * Why the share can be 89% without the dollar being 89% of the market.
 *
 * Drawn as two halves of one bar rather than as a percentage, because the
 * point is the DOUBLE COUNT: every trade has two sides, so the currency
 * shares sum to 200. A pie chart here would teach the opposite.
 */
function boardDollar(t) {
    return board('dollar', [
        textPart('h', t.dollarH, { at: [540, 580], font: `800 36px ${FONT}`, fill: 'ink',
                                   alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0 }),
        rectPart('barA', 820, 92, { at: [540, 720], fill: 'bull', stroke: 'ink',
                                    strokeWidth: 4, alpha: 0, z: 10 }),
        textPart('barAt', 'BUY  this one', { at: [540, 720], font: `800 32px ${FONT}`,
                                             fill: 'white', alpha: 0, z: 12 }),
        rectPart('barB', 820, 92, { at: [540, 826], fill: 'bear', stroke: 'ink',
                                    strokeWidth: 4, alpha: 0, z: 10 }),
        textPart('barBt', 'SELL  that one', { at: [540, 826], font: `800 32px ${FONT}`,
                                              fill: 'white', alpha: 0, z: 12 }),
        ...statParts('usd', t.dollarV, t.dollarC, { at: [540, 1010], fill: 'gold', size: 128 }),
    ]);
}

/** The same rule in a currency the audience actually holds. */
function boardTzs(t) {
    const pair = pairParts('tz', {
        base: t.tzsBase, quote: t.tzsQuote, rate: t.tzsRate,
        baseL: t.tzsBaseL, quoteL: t.tzsQuoteL, line: t.tzsLine,
        at: [540, 720],
    });
    return {
        ...board('tzs', [
            textPart('h', t.tzsH, { at: [540, 566], font: `800 34px ${FONT}`, fill: 'dim',
                                    alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0 }),
            ...pair.parts,
            textPart('up', t.tzsUp, { at: [540, 1092], font: `800 29px ${FONT}`,
                                      fill: 'warn', alpha: 0, z: 60,
                                      maxWidth: SAFE.x1 - SAFE.x0, lineHeight: 40 }),
        ]),
        pair,
    };
}

// ---------------------------------------------------------------------------

export function partTwo(lang) {
    const t = T[lang];
    const P = P2[lang];

    const pair = boardPair(t);
    const up = boardUp(t);
    const dollar = boardDollar(t);
    const tzs = boardTzs(t);
    const card = endCard(lang, 2, t.next);
    const ban = bannerParts(lang, 2);
    const grain = grainParts('gr', { seed: 23 });
    const titles = board('titles', hookTitle(t.kicker, t.title, t.sub));

    const boards = [pair, up, dollar, tzs, titles,
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
            cast: withBan([
                stand('amara', 700, H_AMARA), stand('juma', 360, H_JUMA),
                castBoard('titles', { alpha: 1 }),
            ]),
            shots: [
                { id: 'o0', dialogue: [says('juma', P[0], 0.15)],
                  actions: [...gesture('juma', 'ask', 0.15, { hold: 1.4 }),
                            ...inkBlinks('amara', 4, 41)] },
                { id: 'o1', dialogue: [says('amara', P[1], 0.2)],
                  actions: [
                      ...gesture('amara', 'present', 0.2, { hold: 1.4 }),
                      ...build('titles', ['kicker', 'title', 'titlesub'],
                               titleAt(P[1], lang), { gap: 0.2, span: 0.45 }),
                      ...inkBlinks('juma', 4, 7),
                  ] },
            ],
        },

        // --- the one picture ------------------------------------------------
        {
            id: 'pair', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('pair', { alpha: 1 })]),
            shots: [
                { id: 'p0', dialogue: [vo(P[2], 0.15)],
                  actions: build('pair', pair.pair.pairIds, 0.2, { gap: 0.18, span: 0.4 }) },
                { id: 'p1', dialogue: [vo(P[3], 0.15)],
                  actions: build('pair', pair.pair.meanIds, 0.3, { gap: 0.9, span: 0.4 }) },
                { id: 'p2', dialogue: [vo(P[4], 0.15)],
                  actions: pop('pair', 'pr_rate', 0.5, { span: 0.45 }) },
                { id: 'p3', dialogue: [vo(P[5], 0.15)],
                  actions: reveal('pair', 'pr_line', 0.4, { span: 0.4 }) },
            ],
        },

        // --- which way is up --------------------------------------------------
        {
            id: 'up', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([
                offstage('juma'), offstage('amara'), castBoard('up', { alpha: 1 }),
            ]),
            shots: [
                { id: 'u0', dialogue: [says('juma', P[6], 0.15)],
                  actions: reveal('up', 'h', 0.2, { span: 0.35 }) },
                { id: 'u1', dialogue: [says('amara', P[7], 0.15)],
                  actions: [
                      ...build('up', up.rows.rowIds(0), 0.25, { gap: 0.08, span: 0.32 }),
                      ...build('up', up.rows.rowIds(1), 1.5, { gap: 0.08, span: 0.32 }),
                      ...build('up', up.rows.rowIds(2), 2.9, { gap: 0.08, span: 0.32 }),
                  ] },
            ],
        },

        // --- two currencies, every time ----------------------------------------
        {
            id: 'dollar', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('dollar', { alpha: 1 })]),
            shots: [
                { id: 'd0', dialogue: [vo(P[8], 0.15)],
                  actions: [
                      ...reveal('dollar', 'h', 0.15, { span: 0.35 }),
                      ...build('dollar', ['barA', 'barAt'], 0.6, { gap: 0.06, span: 0.3 }),
                      ...build('dollar', ['barB', 'barBt'], 1.5, { gap: 0.06, span: 0.3 }),
                  ] },
                { id: 'd1', dialogue: [vo(P[9], 0.15)],
                  actions: [
                      ...pop('dollar', 'usd_v', 0.3, { span: 0.5 }),
                      ...reveal('dollar', 'usd_c', 1.2, { span: 0.4 }),
                  ] },
                { id: 'd2', dialogue: [vo(P[10], 0.15)], actions: [] },
            ],
        },

        // --- closer to home -----------------------------------------------------
        {
            id: 'tzs', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('tzs', { alpha: 1 })]),
            shots: [
                { id: 'z0', dialogue: [vo(P[11], 0.15)],
                  actions: [
                      ...reveal('tzs', 'h', 0.15, { span: 0.35 }),
                      ...build('tzs', tzs.pair.pairIds, 0.5, { gap: 0.14, span: 0.35 }),
                      ...build('tzs', tzs.pair.meanIds, 1.6, { gap: 0.5, span: 0.35 }),
                      ...reveal('tzs', 'tz_rate', 2.8, { span: 0.4 }),
                  ] },
                { id: 'z1', dialogue: [vo(P[12], 0.15)],
                  actions: [
                      ...reveal('tzs', 'tz_line', 0.3, { span: 0.35 }),
                      ...reveal('tzs', 'up', 1.6, { span: 0.4 }),
                  ] },
            ],
        },

        // --- you already knew this ----------------------------------------------
        {
            id: 'knew', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.4 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([stand('amara', 540, H_AMARA * 1.06)]),
            shots: [
                { id: 'k0', dialogue: [says('amara', P[13], 0.2)],
                  actions: [...gesture('amara', 'talk', 0.2, { hold: 1.6 }),
                            ...inkBlinks('amara', 5, 61)] },
                { id: 'k1', dialogue: [says('amara', P[14], 0.2)],
                  actions: [...gesture('amara', 'sure', 0.2, { hold: 1.8 }),
                            ...inkBlinks('amara', 5, 19)] },
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
