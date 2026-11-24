/**
 * Part 8 — "What an indicator cannot do" / "Kiashiria hakiwezi nini".
 *
 * Indicators, and the single structural fact about all of them: their only
 * input is price that has already happened, so they cannot contain
 * information that price does not.
 *
 * ## The trap this part is built around
 *
 * Indicator soup. A beginner adds a moving average, RSI, MACD, stochastics
 * and Bollinger bands, sees them agree, and reads that agreement as
 * confirmation. It is not confirmation of anything -- every one of those is a
 * transformation of the SAME closing prices, so of course they agree. It is
 * one number wearing five hats, and the film uses exactly that image because
 * it is the fastest way to make the point land.
 *
 * This matters more than it sounds. Believing you have five independent
 * confirmations when you have one is how somebody talks themselves into
 * oversizing, which is part nine's subject and the actual mechanism of ruin.
 *
 * ## What the part is careful NOT to say
 *
 * Not "indicators are useless". They are a summary, and summaries are useful
 * -- a 200-period average tells you at a glance something it would take real
 * effort to eyeball. The honest claim is narrower and survives scrutiny: an
 * indicator cannot tell you anything price did not already say, and it tells
 * you later. A film that overstates this just trades one superstition for
 * another, which would make it the same kind of thing as the signal seller.
 */
import {
    FONT, L, M, SAFE, build, effect, pathPart, pop, rectPart, reveal, smooth, textPart,
} from '../lib/diagram.mjs';
import {
    CHARACTERS, FX_PALETTE, H_AMARA, H_JUMA, META, offstage, says, stand, vo, voicesFor,
} from '../lib/forex.mjs';
import {
    bannerParts, board, cardRows, castBoard, endCard, fitShots, gesture,
    grainParts, hookTitle, inkBlinks, markParts, statParts, titleAt,
} from './common.mjs';

const P8 = {
    en: [
        /* 0 */ 'Every indicator on your chart is arithmetic done on prices that already '
            + 'happened.',
        /* 1 */ 'That is not an insult. It is the definition. The input is the past.',
        /* 2 */ 'A moving average is the average of the last N closes. That is the whole '
            + 'formula.',
        /* 3 */ 'RSI measures how much of recent movement was upward. That is all it does.',
        /* 4 */ 'MACD is two moving averages, subtracted. Nothing is hidden in there.',
        /* 5 JUMA  */ 'So they are useless?',
        /* 6 AMARA */ 'No. They are a summary. A summary is useful. It is just not new '
            + 'information.',
        /* 7 */ 'Here is the trap, and nearly everybody falls into it.',
        /* 8 */ 'Five indicators agreeing is not five confirmations.',
        /* 9 */ 'They all read the same closing prices. It is one number wearing five '
            + 'hats.',
        /*10 */ 'And believing you have five is how people talk themselves into trading '
            + 'too big.',
        /*11 */ 'So: one for trend. One for timing. Then stop adding things.',
        /*12 */ 'They also lag, by construction. A fifty-period average needs fifty '
            + 'periods.',
        /*13 AMARA */ 'An indicator cannot tell you anything price did not already say.',
        /*14 LOOP */ 'Next — the only maths that decides whether you make money.',
    ],
    sw: [
        /* 0 */ 'Kila kiashiria kwenye chati yako ni hesabu iliyofanywa kwa bei '
            + 'zilizokwisha tokea.',
        /* 1 */ 'Hiyo si matusi. Ndiyo maana yake. Kinachoingia ni yaliyopita.',
        /* 2 */ 'Moving average ni wastani wa bei N za mwisho. Ndiyo fomula yote.',
        /* 3 */ 'RSI inapima kiasi gani cha msogeo wa hivi karibuni kilikuwa cha kupanda. '
            + 'Ndiyo yote.',
        /* 4 */ 'MACD ni moving average mbili, zimetolewa. Hakuna kilichofichwa humo.',
        /* 5 JUMA  */ 'Kwa hiyo havifai?',
        /* 6 AMARA */ 'Hapana. Ni muhtasari. Muhtasari unafaa. Ila si taarifa mpya.',
        /* 7 */ 'Hapa ndipo mtego, na karibu kila mtu anaangukia humo.',
        /* 8 */ 'Viashiria vitano vinavyokubaliana si uthibitisho mara tano.',
        /* 9 */ 'Vyote vinasoma bei zilezile za kufunga. Ni namba moja imevaa kofia tano.',
        /*10 */ 'Na kuamini una vitano ndiyo jinsi watu wanavyojishawishi kufanya biashara '
            + 'kubwa mno.',
        /*11 */ 'Kwa hiyo: kimoja kwa mwenendo. Kimoja kwa muda. Kisha acha kuongeza.',
        /*12 */ 'Pia vinachelewa, kwa muundo wake. Wastani wa vipindi hamsini unahitaji '
            + 'vipindi hamsini.',
        /*13 AMARA */ 'Kiashiria hakiwezi kukuambia chochote ambacho bei haikukisema '
            + 'tayari.',
        /*14 LOOP */ 'Sehemu ijayo — hesabu pekee inayoamua kama unapata faida.',
    ],
};

const T = {
    en: {
        kicker: 'READING THE MARKET  ·  PART 8',
        title: 'What an indicator cannot do',
        sub: 'arithmetic on the past, and the soup trap',

        defH: 'ALL OF THEM, HONESTLY',
        defRows: [
            ['MOVING AVERAGE', 'the average of the last N closing prices', '#2b4f7a'],
            ['RSI', 'how much of recent movement was upward', '#5f3f82'],
            ['MACD', 'two moving averages, subtracted', '#9a6a0d'],
        ],

        soupH: 'FIVE INDICATORS. ONE NUMBER.',
        soupHats: ['MA', 'RSI', 'MACD', 'STOCH', 'BB'],
        soupPrice: 'CLOSING PRICE',
        soupNote: 'one number wearing five hats —\nagreement here is not confirmation',

        useH: 'WHAT TO ACTUALLY KEEP',
        useRows: [
            ['ONE FOR TREND', 'a long moving average. Which way, at a glance.', '#15663f'],
            ['ONE FOR TIMING', 'whatever you have tested. One.', '#2b4f7a'],
            ['THEN STOP', 'The sixth indicator has never saved anybody.', '#9e2b1f'],
        ],

        lagH: 'AND THEY ARRIVE LATE',
        lagV: '50',
        lagC: 'a fifty-period average needs fifty periods\nbefore it can tell you anything',

        next: 'Next — Part 9:\nexpectancy — the only maths that matters',
    },
    sw: {
        kicker: 'KUSOMA SOKO  ·  SEHEMU 8',
        title: 'Kiashiria hakiwezi nini',
        sub: 'hesabu za yaliyopita, na mtego wa mchanganyiko',

        defH: 'VYOTE, KWA UKWELI',
        defRows: [
            ['MOVING AVERAGE', 'wastani wa bei N za mwisho za kufunga', '#2b4f7a'],
            ['RSI', 'kiasi gani cha msogeo wa karibuni kilikuwa cha kupanda', '#5f3f82'],
            ['MACD', 'moving average mbili, zimetolewa', '#9a6a0d'],
        ],

        soupH: 'VIASHIRIA VITANO. NAMBA MOJA.',
        soupHats: ['MA', 'RSI', 'MACD', 'STOCH', 'BB'],
        soupPrice: 'BEI YA KUFUNGA',
        soupNote: 'namba moja imevaa kofia tano —\nkukubaliana hapa si uthibitisho',

        useH: 'CHA KUBAKI NACHO HASA',
        useRows: [
            ['KIMOJA KWA MWENENDO', 'moving average ndefu. Upande gani, kwa jicho moja.', '#15663f'],
            ['KIMOJA KWA MUDA', 'chochote ulichokijaribu. Kimoja.', '#2b4f7a'],
            ['KISHA ACHA', 'Kiashiria cha sita hakijawahi kumwokoa mtu.', '#9e2b1f'],
        ],

        lagH: 'NA VINAFIKA KWA KUCHELEWA',
        lagV: '50',
        lagC: 'wastani wa vipindi hamsini unahitaji vipindi hamsini\nkabla hakijakuambia chochote',

        next: 'Sehemu ya 9:\nexpectancy — hesabu pekee ya maana',
    },
};

// ---------------------------------------------------------------------------

function boardDef(t) {
    const rows = cardRows('dr', t.defRows, { top: 620, h: 152, gap: 20 });
    return {
        ...board('def', [
            textPart('h', t.defH, { at: [540, 560], font: `800 36px ${FONT}`, fill: 'ink',
                                    alpha: 0, z: 60 }),
            ...rows.parts,
        ]),
        rows,
    };
}

/**
 * The soup, drawn as one source feeding five boxes.
 *
 * This is the only diagram in the series where the ARROWS are the content.
 * Five chips in a row with no lines would read as five separate things, which
 * is precisely the misconception; five lines converging on one box at the
 * bottom is the correction, drawn rather than asserted.
 */
function boardSoup(t) {
    const n = t.soupHats.length;
    const x = (i) => 150 + (i * 780) / (n - 1);
    const chipY = 660;
    const srcY = 1010;
    const parts = [
        textPart('h', t.soupH, { at: [540, 580], font: `800 36px ${FONT}`, fill: 'ink',
                                 alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0 }),
        rectPart('src', 520, 96, { at: [540, srcY], fill: 'gold', stroke: 'ink',
                                   strokeWidth: 5, alpha: 0, z: 20 }),
        textPart('srct', t.soupPrice, { at: [540, srcY], font: `800 32px ${FONT}`,
                                        fill: 'white', alpha: 0, z: 22, maxWidth: 480 }),
        textPart('note', t.soupNote, { at: [540, 1158], font: `800 30px ${FONT}`,
                                       fill: 'warn', alpha: 0, z: 30,
                                       maxWidth: SAFE.x1 - SAFE.x0, lineHeight: 40 }),
    ];
    const hatIds = [];
    const lineIds = [];
    t.soupHats.forEach((h, i) => {
        parts.push(
            rectPart(`c${i}`, 150, 84, { at: [x(i), chipY], fill: 'paperLit', stroke: 'ink',
                                         strokeWidth: 4, alpha: 0, z: 20 }),
            textPart(`t${i}`, h, { at: [x(i), chipY], font: `800 28px ${FONT}`, fill: 'ink',
                                   alpha: 0, z: 22, maxWidth: 134 }),
        );
        hatIds.push(`c${i}`, `t${i}`);
        // Every line starts at the SAME point and ends at a different chip.
        parts.push(pathPart(`l${i}`, `${M(540, srcY - 48)} ${L(x(i), chipY + 42)}`,
                            { stroke: 'gold', strokeWidth: 4, alpha: 0, z: 10 }));
        lineIds.push(`l${i}`);
    });
    return { ...board('soup', parts), hatIds, lineIds };
}

function boardUse(t) {
    const rows = cardRows('ur', t.useRows, { top: 620, h: 152, gap: 20 });
    return {
        ...board('use', [
            textPart('h', t.useH, { at: [540, 560], font: `800 36px ${FONT}`, fill: 'ink',
                                    alpha: 0, z: 60 }),
            ...rows.parts,
        ]),
        rows,
    };
}

function boardLag(t) {
    return board('lag', [
        textPart('h', t.lagH, { at: [540, 640], font: `800 34px ${FONT}`, fill: 'dim',
                                alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0 }),
        ...statParts('l', t.lagV, t.lagC, { at: [540, 830], fill: 'level', size: 150 }),
    ]);
}

// ---------------------------------------------------------------------------

export function partEight(lang) {
    const t = T[lang];
    const P = P8[lang];

    const def = boardDef(t);
    const soup = boardSoup(t);
    const use = boardUse(t);
    const lag = boardLag(t);
    const card = endCard(lang, 8, t.next);
    const ban = bannerParts(lang, 8);
    const grain = grainParts('gr', { seed: 307 });
    const titles = board('titles', hookTitle(t.kicker, t.title, t.sub));

    const boards = [def, soup, use, lag, titles,
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
                      ...inkBlinks('amara', 4, 311),
                  ] },
                { id: 'o1', dialogue: [says('amara', P[1], 0.2)],
                  actions: [...gesture('amara', 'sure', 0.2, { hold: 1.2 }),
                            ...inkBlinks('amara', 4, 313)] },
            ],
        },

        {
            id: 'def', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('def', { alpha: 1 })]),
            shots: [
                { id: 'd0', dialogue: [vo(P[2], 0.15)],
                  actions: [
                      ...reveal('def', 'h', 0.15, { span: 0.3 }),
                      ...build('def', def.rows.rowIds(0), 0.6, { gap: 0.08, span: 0.3 }),
                  ] },
                { id: 'd1', dialogue: [vo(P[3], 0.15)],
                  actions: build('def', def.rows.rowIds(1), 0.3, { gap: 0.08, span: 0.3 }) },
                { id: 'd2', dialogue: [vo(P[4], 0.15)],
                  actions: build('def', def.rows.rowIds(2), 0.3, { gap: 0.08, span: 0.3 }) },
            ],
        },

        // --- the summary defence -----------------------------------------------
        {
            id: 'sum', palette: 'fx',
            background: PAPER,
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([stand('amara', 700, H_AMARA), stand('juma', 360, H_JUMA)]),
            shots: [
                { id: 'm0', dialogue: [says('juma', P[5], 0.15)],
                  actions: [...gesture('juma', 'doubt', 0.15, { hold: 1.0 }),
                            ...inkBlinks('amara', 4, 317)] },
                { id: 'm1', dialogue: [says('amara', P[6], 0.2)],
                  actions: [...gesture('amara', 'talk', 0.2, { hold: 1.6 }),
                            ...inkBlinks('juma', 4, 331)] },
            ],
        },

        // --- the soup -------------------------------------------------------------
        {
            id: 'soup', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('soup', { alpha: 1 })]),
            shots: [
                { id: 's0', dialogue: [vo(P[7], 0.15)],
                  actions: [
                      ...reveal('soup', 'h', 0.15, { span: 0.3 }),
                      ...build('soup', soup.hatIds, 0.6, { gap: 0.09, span: 0.25 }),
                  ] },
                { id: 's1', dialogue: [vo(P[8], 0.15)],
                  actions: build('soup', ['src', 'srct'], 0.4, { gap: 0.1, span: 0.35 }) },
                // The five lines are the whole point, so they draw on the
                // line that states it, one after another, converging.
                { id: 's2', dialogue: [vo(P[9], 0.15)],
                  actions: [
                      ...build('soup', soup.lineIds, 0.3, { gap: 0.18, span: 0.3 }),
                      ...pop('soup', 'note', 2.2, { span: 0.4 }),
                  ] },
                { id: 's3', dialogue: [vo(P[10], 0.15)], actions: [] },
            ],
        },

        {
            id: 'use', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('use', { alpha: 1 })]),
            shots: [
                { id: 'u0', dialogue: [vo(P[11], 0.15)],
                  actions: [
                      ...reveal('use', 'h', 0.15, { span: 0.3 }),
                      ...build('use', use.rows.rowIds(0), 0.5, { gap: 0.08, span: 0.3 }),
                      ...build('use', use.rows.rowIds(1), 1.9, { gap: 0.08, span: 0.3 }),
                      ...build('use', use.rows.rowIds(2), 3.1, { gap: 0.08, span: 0.3 }),
                  ] },
            ],
        },

        {
            id: 'lag', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('lag', { alpha: 1 })]),
            shots: [
                { id: 'g0', dialogue: [vo(P[12], 0.15)],
                  actions: [
                      ...reveal('lag', 'h', 0.15, { span: 0.3 }),
                      ...pop('lag', 'l_v', 0.6, { span: 0.45 }),
                      ...reveal('lag', 'l_c', 1.6, { span: 0.4 }),
                  ] },
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
                            ...inkBlinks('amara', 5, 337)] },
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
