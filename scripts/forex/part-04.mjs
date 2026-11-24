/**
 * Part 4 — "MT4, MT5, and the order ticket" / "MT4, MT5, na tiketi ya oda".
 *
 * The one genuinely practical part in the series: where the fields are, what
 * they mean, and which of them must never be left at zero.
 *
 * ## Why the mock-up is ink on paper
 *
 * `common.mjs` sets this out at length and it is worth repeating where the
 * ticket is actually drawn. MetaTrader is grey chrome with blue accents, and
 * a faithful repaint of that would be a drawing passed off as a screenshot
 * AND unreadable at phone size. What a viewer has to carry out of this film
 * is the SPATIAL arrangement -- that volume sits above stop loss, that Sell
 * is on the left and Buy on the right -- because that is what they will
 * navigate under pressure. The arrangement is exact. The skin is ours.
 *
 * ## The order of the two buttons
 *
 * Sell left, Buy right, and the film spends a line on it. This is the one
 * piece of pure muscle memory in the whole series: in both terminals the
 * sell button is the left one, and somebody who has rehearsed it backwards
 * will eventually click the wrong one in a hurry. It costs eight seconds to
 * say and it is the most concretely useful eight seconds here.
 *
 * ## What this part deliberately does not do
 *
 * No broker is named and none is recommended. A series whose first part is
 * about being sold things does not get to finish with an affiliate link, and
 * the honest advice -- use whichever terminal your regulated broker supports
 * -- costs nothing to give and is also correct.
 */
import {
    FONT, L, M, SAFE, build, effect, pathPart, pop, rectPart, reveal, textPart,
} from '../lib/diagram.mjs';
import {
    CHARACTERS, FX_PALETTE, H_AMARA, H_JUMA, META, offstage, says, stand, vo, voicesFor,
} from '../lib/forex.mjs';
import {
    bannerParts, board, cardRows, castBoard, endCard, fitShots, gesture,
    grainParts, hookTitle, inkBlinks, markParts, statParts, ticketParts, titleAt,
} from './common.mjs';

const P4 = {
    en: [
        /* 0 */ 'Two platforms. Almost all retail forex runs on one of them.',
        /* 1 */ 'MT4 is older, with more free add-ons. MT5 is faster, with more timeframes '
            + 'and a built-in calendar.',
        /* 2 */ 'For learning, either is fine. Use the one your broker supports and stop '
            + 'reading comparisons.',
        /* 3 */ 'Four windows. You need three of them.',
        /* 4 */ 'Market Watch is the price list. The chart is the chart. The terminal '
            + 'holds your open trades and your balance.',
        /* 5 */ 'Now the order ticket. F9, or New Order.',
        /* 6 */ 'Symbol: which pair. Volume: how big — and volume is in LOTS, not dollars.',
        /* 7 */ 'One point zero zero is one standard lot. Zero point zero one is a micro. '
            + 'Start there.',
        /* 8 */ 'Stop loss. Take profit. Fill both in BEFORE you click anything.',
        /* 9 JUMA  */ 'And if I leave them at zero?',
        /*10 AMARA */ 'Then your stop loss is your whole account.',
        /*11 */ 'Last thing, and learn it now. Sell is on the LEFT. Buy is on the right.',
        /*12 */ 'Rehearse it while it is boring, because one day you will be clicking in a '
            + 'hurry.',
        /*13 AMARA */ 'The platform is not the skill. But the wrong button is the fastest '
            + 'way to lose.',
        /*14 LOOP */ 'Next — price action: why price stops where it stops.',
    ],
    sw: [
        /* 0 */ 'Programu mbili. Karibu forex yote ya watu binafsi inatumia moja kati yao.',
        /* 1 */ 'MT4 ni ya zamani, ina viongezi vingi vya bure. MT5 ni ya kasi, ina muda '
            + 'mwingi zaidi na kalenda ndani yake.',
        /* 2 */ 'Kwa kujifunza, yoyote inafaa. Tumia ile broker wako anayoiunga mkono, na '
            + 'acha kusoma ulinganisho.',
        /* 3 */ 'Madirisha manne. Unahitaji matatu.',
        /* 4 */ 'Market Watch ni orodha ya bei. Chati ni chati. Terminal ina biashara zako '
            + 'wazi na salio lako.',
        /* 5 */ 'Sasa tiketi ya oda. F9, au New Order.',
        /* 6 */ 'Symbol: jozi ipi. Volume: ukubwa — na volume ni kwa LOT, si kwa dola.',
        /* 7 */ 'Moja nukta sifuri sifuri ni standard lot moja. Sifuri nukta sifuri moja ni '
            + 'micro. Anzia hapo.',
        /* 8 */ 'Stop loss. Take profit. Jaza vyote KABLA hujabonyeza chochote.',
        /* 9 JUMA  */ 'Na nikiviacha sifuri?',
        /*10 AMARA */ 'Basi stop loss yako ni akaunti yako yote.',
        /*11 */ 'Jambo la mwisho, lijue sasa. Sell iko KUSHOTO. Buy iko kulia.',
        /*12 */ 'Lizoee sasa likiwa la kuchosha, kwa sababu siku moja utabonyeza kwa haraka.',
        /*13 AMARA */ 'Programu si ujuzi. Lakini kitufe kibaya ndiyo njia ya haraka ya '
            + 'kupoteza.',
        /*14 LOOP */ 'Sehemu ijayo — price action: kwa nini bei inasimama inaposimama.',
    ],
};

const T = {
    en: {
        kicker: 'READING THE MARKET  ·  PART 4',
        title: 'MT4, MT5, the ticket',
        sub: 'where the fields are, and which one matters',

        vsH: 'WHICH ONE?',
        vsRows: [
            ['MT4', 'Older. Far more free indicators and robots written for it.', '#2b4f7a'],
            ['MT5', 'Faster. More timeframes, depth of market, calendar built in.', '#15663f'],
            ['HONESTLY', 'Use whichever your regulated broker supports. Move on.', '#9a6a0d'],
        ],

        winH: 'THREE WINDOWS YOU ACTUALLY USE',
        winRows: [
            ['MARKET WATCH', 'the price list — right-click to add pairs', '#2b4f7a'],
            ['THE CHART', 'right-click, or the toolbar, to change timeframe', '#15663f'],
            ['TERMINAL  /  TOOLBOX', 'open trades, balance, history — check it daily', '#9a6a0d'],
        ],

        tkTitle: 'ORDER  —  EURUSD',
        tkRows: [
            ['Symbol', 'EURUSD', null],
            ['Volume', '0.01', '#15663f'],
            ['Stop Loss', '1.08200', '#9e2b1f'],
            ['Take Profit', '1.09100', '#15663f'],
        ],
        tkSell: 'SELL', tkBuy: 'BUY',

        zeroV: '0.00',
        zeroC: 'a stop loss left at zero is\nthe whole account',

        sideH: 'LEARN THIS WHILE IT IS BORING',
        sideL: 'SELL  ·  left', sideR: 'BUY  ·  right',

        next: 'Next — Part 5:\nprice action, and why price stops',
    },
    sw: {
        kicker: 'KUSOMA SOKO  ·  SEHEMU 4',
        title: 'MT4, MT5, tiketi',
        sub: 'sehemu ziko wapi, na ipi ni muhimu',

        vsH: 'IPI?',
        vsRows: [
            ['MT4', 'Ya zamani. Ina viashiria na roboti nyingi za bure.', '#2b4f7a'],
            ['MT5', 'Ya kasi. Muda mwingi, kina cha soko, kalenda ndani.', '#15663f'],
            ['UKWELI', 'Tumia ile broker wako aliyesajiliwa anayoiunga mkono.', '#9a6a0d'],
        ],

        winH: 'MADIRISHA MATATU UNAYOTUMIA',
        winRows: [
            ['MARKET WATCH', 'orodha ya bei — bonyeza kulia kuongeza jozi', '#2b4f7a'],
            ['CHATI', 'bonyeza kulia, au toolbar, kubadilisha muda', '#15663f'],
            ['TERMINAL  /  TOOLBOX', 'biashara wazi, salio, historia — angalia kila siku', '#9a6a0d'],
        ],

        tkTitle: 'ODA  —  EURUSD',
        tkRows: [
            ['Symbol', 'EURUSD', null],
            ['Volume', '0.01', '#15663f'],
            ['Stop Loss', '1.08200', '#9e2b1f'],
            ['Take Profit', '1.09100', '#15663f'],
        ],
        tkSell: 'SELL', tkBuy: 'BUY',

        zeroV: '0.00',
        zeroC: 'stop loss iliyoachwa sifuri ni\nakaunti nzima',

        sideH: 'JIFUNZE HILI LIKIWA LA KUCHOSHA',
        sideL: 'SELL  ·  kushoto', sideR: 'BUY  ·  kulia',

        next: 'Sehemu ya 5:\nprice action, na kwa nini bei inasimama',
    },
};

// ---------------------------------------------------------------------------

function boardVs(t) {
    const rows = cardRows('vr', t.vsRows, { top: 614, h: 154, gap: 20 });
    return {
        ...board('vs', [
            textPart('h', t.vsH, { at: [540, 556], font: `800 36px ${FONT}`, fill: 'ink',
                                   alpha: 0, z: 60 }),
            ...rows.parts,
        ]),
        rows,
    };
}

function boardWin(t) {
    const rows = cardRows('wr', t.winRows, { top: 614, h: 154, gap: 20 });
    return {
        ...board('win', [
            textPart('h', t.winH, { at: [540, 556], font: `800 34px ${FONT}`, fill: 'ink',
                                    alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0 }),
            ...rows.parts,
        ]),
        rows,
    };
}

/** The ticket. Field order is faithful; the skin is not. See the header. */
function boardTicket(t) {
    const tk = ticketParts('tk', {
        title: t.tkTitle, rows: t.tkRows, sell: t.tkSell, buy: t.tkBuy,
        at: [540, 820], w: 780,
    });
    return { ...board('ticket', tk.parts), tk };
}

/** The one field that must never be left at zero. */
function boardZero(t) {
    return board('zero', [
        ...statParts('z', t.zeroV, t.zeroC, { at: [540, 780], fill: 'warn', size: 158 }),
        ...markParts('x', false, [540, 1074], { size: 66 }),
    ]);
}

/**
 * Sell left, buy right -- drawn at the size it has to be remembered at.
 *
 * Deliberately the simplest board in the series. It is muscle memory, not an
 * idea, and anything else on screen competes with the only thing the viewer
 * is supposed to take away.
 */
function boardSide(t) {
    return board('side', [
        textPart('h', t.sideH, { at: [540, 620], font: `800 33px ${FONT}`, fill: 'dim',
                                 alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0 }),
        rectPart('sl', 400, 180, { at: [300, 800], fill: 'bear', stroke: 'ink',
                                   strokeWidth: 6, alpha: 0, z: 10 }),
        textPart('slt', t.sideL, { at: [300, 800], font: `800 40px ${FONT}`, fill: 'white',
                                   alpha: 0, z: 12, maxWidth: 360 }),
        rectPart('sr', 400, 180, { at: [780, 800], fill: 'bull', stroke: 'ink',
                                   strokeWidth: 6, alpha: 0, z: 10 }),
        textPart('srt', t.sideR, { at: [780, 800], font: `800 40px ${FONT}`, fill: 'white',
                                   alpha: 0, z: 12, maxWidth: 360 }),
    ]);
}

// ---------------------------------------------------------------------------

export function partFour(lang) {
    const t = T[lang];
    const P = P4[lang];

    const vs = boardVs(t);
    const win = boardWin(t);
    const ticket = boardTicket(t);
    const zero = boardZero(t);
    const side = boardSide(t);
    const card = endCard(lang, 4, t.next);
    const ban = bannerParts(lang, 4);
    const grain = grainParts('gr', { seed: 97 });
    const titles = board('titles', hookTitle(t.kicker, t.title, t.sub));

    const boards = [vs, win, ticket, zero, side, titles,
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
                      ...gesture('amara', 'present', 0.15, { hold: 1.4 }),
                      ...build('titles', ['kicker', 'title', 'titlesub'],
                               titleAt(P[0], lang), { gap: 0.2, span: 0.45 }),
                      ...inkBlinks('amara', 4, 29),
                  ] },
            ],
        },

        {
            id: 'vs', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('vs', { alpha: 1 })]),
            shots: [
                { id: 'a0', dialogue: [vo(P[1], 0.15)],
                  actions: [
                      ...reveal('vs', 'h', 0.15, { span: 0.3 }),
                      ...build('vs', vs.rows.rowIds(0), 0.5, { gap: 0.08, span: 0.3 }),
                      ...build('vs', vs.rows.rowIds(1), 2.6, { gap: 0.08, span: 0.3 }),
                  ] },
                { id: 'a1', dialogue: [vo(P[2], 0.15)],
                  actions: build('vs', vs.rows.rowIds(2), 0.4, { gap: 0.08, span: 0.3 }) },
            ],
        },

        {
            id: 'win', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('win', { alpha: 1 })]),
            shots: [
                { id: 'w0', dialogue: [vo(P[3], 0.15)],
                  actions: reveal('win', 'h', 0.2, { span: 0.35 }) },
                { id: 'w1', dialogue: [vo(P[4], 0.15)],
                  actions: [
                      ...build('win', win.rows.rowIds(0), 0.25, { gap: 0.08, span: 0.3 }),
                      ...build('win', win.rows.rowIds(1), 1.6, { gap: 0.08, span: 0.3 }),
                      ...build('win', win.rows.rowIds(2), 2.9, { gap: 0.08, span: 0.3 }),
                  ] },
            ],
        },

        // --- the ticket, field by field ---------------------------------------
        {
            id: 'ticket', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('ticket', { alpha: 1 })]),
            shots: [
                { id: 'k0', dialogue: [vo(P[5], 0.15)],
                  actions: build('ticket', ticket.tk.chromeIds, 0.2,
                                 { gap: 0.12, span: 0.35 }) },
                { id: 'k1', dialogue: [vo(P[6], 0.15)],
                  actions: [
                      ...build('ticket', ticket.tk.rowIds(0), 0.25, { gap: 0.08, span: 0.3 }),
                      ...build('ticket', ticket.tk.rowIds(1), 1.8, { gap: 0.08, span: 0.3 }),
                  ] },
                { id: 'k2', dialogue: [vo(P[7], 0.15)], actions: [] },
                { id: 'k3', dialogue: [vo(P[8], 0.15)],
                  actions: [
                      ...build('ticket', ticket.tk.rowIds(2), 0.25, { gap: 0.08, span: 0.3 }),
                      ...build('ticket', ticket.tk.rowIds(3), 1.3, { gap: 0.08, span: 0.3 }),
                      ...build('ticket', ticket.tk.buttonIds, 2.6, { gap: 0.1, span: 0.3 }),
                  ] },
            ],
        },

        // --- what zero means ----------------------------------------------------
        {
            id: 'zero', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([
                offstage('juma'), offstage('amara'), castBoard('zero', { alpha: 1 }),
            ]),
            shots: [
                { id: 'z0', dialogue: [says('juma', P[9], 0.15)],
                  actions: pop('zero', 'z_v', 0.3, { span: 0.45 }) },
                { id: 'z1', dialogue: [says('amara', P[10], 0.15)],
                  actions: [
                      ...reveal('zero', 'z_c', 0.3, { span: 0.4 }),
                      ...reveal('zero', 'x', 1.4, { span: 0.3 }),
                  ] },
            ],
        },

        // --- the two buttons -----------------------------------------------------
        {
            id: 'side', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('side', { alpha: 1 })]),
            shots: [
                { id: 'd0', dialogue: [vo(P[11], 0.15)],
                  actions: [
                      ...reveal('side', 'h', 0.15, { span: 0.3 }),
                      ...build('side', ['sl', 'slt'], 0.8, { gap: 0.06, span: 0.3, how: pop }),
                      ...build('side', ['sr', 'srt'], 2.0, { gap: 0.06, span: 0.3, how: pop }),
                  ] },
                { id: 'd1', dialogue: [vo(P[12], 0.15)], actions: [] },
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
                            ...inkBlinks('amara', 5, 83)] },
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
