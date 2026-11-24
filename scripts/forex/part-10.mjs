/**
 * Part 10 — "The routine" / "Utaratibu".
 *
 * Top-down analysis and a seven-line checklist: the thing the brief actually
 * asked for, delivered as a process rather than as a promise.
 *
 * ## How this part answers the "95%" question
 *
 * The series was commissioned with a request for a strategy that works 95% of
 * the time. Part one showed why no such thing exists and part nine showed
 * what replaces it. This part closes the loop by giving the number back to
 * the viewer with its meaning repaired: of a hundred charts the routine looks
 * at, it says NO to about ninety-five. The 95 is real -- it is just the
 * rejection rate, not the win rate, and the edge lives in the trades not
 * taken.
 *
 * That reframing is the single most important thing in the series, so it is
 * the last board before the end card and it is stated twice: once as a
 * statistic, once in Amara's closing line.
 *
 * ## Top-down, and the one rule that does the work
 *
 * Three timeframes, never more: the high one gives DIRECTION, the middle one
 * gives the LEVEL, the low one gives the TRIGGER. Trading only in the
 * direction the high timeframe gave you removes most bad trades on its own,
 * which is why it is stated as a rule rather than as a preference.
 *
 * Three, not four or five, because every added timeframe adds a way for the
 * chart to disagree with itself, and a beginner resolving that disagreement
 * will resolve it toward whichever one agrees with the trade they already
 * wanted.
 *
 * ## The honesty at the end
 *
 * The closing expectation -- four in ten winning at 1:3 is a good year -- is
 * deliberately unglamorous and consistent with part nine's arithmetic
 * (+0.60R per trade). A series that spent nine parts attacking inflated
 * claims cannot finish on one.
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

const P10 = {
    en: [
        /* 0 */ 'Ten parts. Here is the routine that uses all of them.',
        /* 1 */ 'Top-down. Start high, finish low. Three timeframes — never more.',
        /* 2 */ 'The daily tells you one thing only: which way.',
        /* 3 */ 'The four-hour tells you where. The level you will actually trade.',
        /* 4 */ 'The fifteen-minute tells you when. The trigger, and nothing else.',
        /* 5 */ 'Then one rule: trade only in the direction the daily gave you.',
        /* 6 */ 'That rule alone removes most of the bad trades you were going to take.',
        /* 7 */ 'Now the checklist. Seven lines. The same seven, every single time.',
        /* 8 */ 'Direction. Level. Trigger. Stop. Size. Reward at least twice the risk. '
            + 'Write it down.',
        /* 9 */ 'If any line fails, there is no trade. Not a smaller one. None.',
        /*10 JUMA  */ 'How often do all seven line up?',
        /*11 AMARA */ 'Rarely. Of a hundred charts you open, this says no to about '
            + 'ninety-five.',
        /*12 */ 'There is your ninety-five percent. It was never the win rate.',
        /*13 */ 'The edge is not the five you take. It is the ninety-five you skip.',
        /*14 */ 'And be honest about the rest: four winners in ten, at three to one, is a '
            + 'good year.',
        /*15 AMARA */ 'Nobody can give you ninety-five percent. Anyone can give you a '
            + 'process. This one is yours.',
        /*16 LOOP */ 'Start again at Part 1 — and send it to someone who got burned.',
    ],
    sw: [
        /* 0 */ 'Sehemu kumi. Huu hapa utaratibu unaotumia zote.',
        /* 1 */ 'Kutoka juu kwenda chini. Anza juu, maliza chini. Muda mitatu — si zaidi.',
        /* 2 */ 'Chati ya siku inakuambia kitu kimoja tu: upande gani.',
        /* 3 */ 'Ya saa nne inakuambia wapi. Kiwango utakachofanyia biashara.',
        /* 4 */ 'Ya dakika kumi na tano inakuambia lini. Kichocheo, na si kingine.',
        /* 5 */ 'Kisha kanuni moja: fanya biashara upande ule tu chati ya siku ilioukupa.',
        /* 6 */ 'Kanuni hiyo peke yake inaondoa biashara nyingi mbaya ulizokusudia kufanya.',
        /* 7 */ 'Sasa orodha ya ukaguzi. Mistari saba. Saba ileile, kila mara.',
        /* 8 */ 'Upande. Kiwango. Kichocheo. Stop. Ukubwa. Faida angalau mara mbili ya '
            + 'hatari. Iandike.',
        /* 9 */ 'Mstari wowote ukishindwa, hakuna biashara. Si ndogo zaidi. Hakuna.',
        /*10 JUMA  */ 'Saba zote zinapatana mara ngapi?',
        /*11 AMARA */ 'Mara chache. Kati ya chati mia unazofungua, hii inakataa karibu '
            + 'tisini na tano.',
        /*12 */ 'Hapo ndipo asilimia tisini na tano yako. Haikuwa kiwango cha ushindi '
            + 'kamwe.',
        /*13 */ 'Faida si zile tano unazochukua. Ni tisini na tano unazoziacha.',
        /*14 */ 'Na kuwa mkweli kuhusu mengine: washindi wanne kati ya kumi, kwa tatu kwa '
            + 'moja, ni mwaka mzuri.',
        /*15 AMARA */ 'Hakuna anayeweza kukupa asilimia tisini na tano. Yeyote anaweza '
            + 'kukupa utaratibu. Huu ni wako.',
        /*16 LOOP */ 'Anza upya Sehemu ya 1 — na mtumie aliyewahi kuibiwa.',
    ],
};

const T = {
    en: {
        kicker: 'READING THE MARKET  ·  PART 10',
        title: 'The routine',
        sub: 'top-down, seven lines, every time',

        tfH: 'THREE TIMEFRAMES. NEVER MORE.',
        tfRows: [
            ['DAILY  →  WHICH WAY', 'direction only. Nothing else is decided here.', '#2b4f7a'],
            ['4 HOUR  →  WHERE', 'the level you will actually trade.', '#9a6a0d'],
            ['15 MIN  →  WHEN', 'the trigger, and nothing else.', '#15663f'],
        ],
        tfRule: 'trade ONLY in the direction the daily gave you',

        chkH: 'THE CHECKLIST',
        chk: [
            '1   Direction — agrees with the daily',
            '2   Level — one that has held before',
            '3   Trigger — a pin bar or engulfing, AT it',
            '4   Stop — placed where the idea is wrong',
            '5   Size — 1% of the account, from the stop',
            '6   Reward — at least 2× the risk',
            '7   Written down — before you click',
        ],
        chkFail: 'any line fails  →  NO TRADE. Not a smaller one.',

        rejH: 'THERE IS YOUR 95%',
        rejV: '95',
        rejC: 'of a hundred charts, the routine says NO\nThe edge is the ones you skip.',

        honH: 'AND HONESTLY',
        honV: '4 in 10',
        honC: 'winners, at 3:1 — that is a good year',

        next: 'Start again at Part 1:\n"Forex is a scam"',
    },
    sw: {
        kicker: 'KUSOMA SOKO  ·  SEHEMU 10',
        title: 'Utaratibu',
        sub: 'kutoka juu, mistari saba, kila mara',

        tfH: 'MUDA MITATU. SI ZAIDI.',
        tfRows: [
            ['SIKU  →  UPANDE GANI', 'upande tu. Hakuna kingine kinachoamuliwa hapa.', '#2b4f7a'],
            ['SAA 4  →  WAPI', 'kiwango utakachofanyia biashara.', '#9a6a0d'],
            ['DAKIKA 15  →  LINI', 'kichocheo, na si kingine.', '#15663f'],
        ],
        tfRule: 'fanya biashara UPANDE ULE TU chati ya siku ilioukupa',

        chkH: 'ORODHA YA UKAGUZI',
        chk: [
            '1   Upande — unakubaliana na chati ya siku',
            '2   Kiwango — kilichoshikilia awali',
            '3   Kichocheo — pin bar au engulfing, HAPO',
            '4   Stop — pale wazo linapokuwa baya',
            '5   Ukubwa — 1% ya akaunti, kutoka kwenye stop',
            '6   Faida — angalau mara 2 ya hatari',
            '7   Imeandikwa — kabla hujabonyeza',
        ],
        chkFail: 'mstari wowote ukishindwa  →  HAKUNA BIASHARA.',

        rejH: 'HAPO NDIPO 95% YAKO',
        rejV: '95',
        rejC: 'kati ya chati mia, utaratibu unasema HAPANA\nFaida ni zile unazoziacha.',

        honH: 'NA KWA UKWELI',
        honV: '4 kati ya 10',
        honC: 'washindi, kwa 3:1 — huo ni mwaka mzuri',

        next: 'Anza upya Sehemu ya 1:\n"Forex ni utapeli"',
    },
};

// ---------------------------------------------------------------------------

function boardTf(t) {
    const rows = cardRows('tr', t.tfRows, { top: 600, h: 152, gap: 20 });
    return {
        ...board('tf', [
            textPart('h', t.tfH, { at: [540, 540], font: `800 36px ${FONT}`, fill: 'ink',
                                   alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0 }),
            ...rows.parts,
            textPart('rule', t.tfRule, { at: [540, 1166], font: `800 31px ${FONT}`,
                                         fill: 'gold', alpha: 0, z: 60,
                                         maxWidth: SAFE.x1 - SAFE.x0, lineHeight: 40 }),
        ]),
        rows,
    };
}

/**
 * The checklist: seven lines, each its own part so they can tick in one by
 * one on the line that names them.
 *
 * Deliberately NOT `cardRows`. Seven cards at 150 tall is 1,200 units and
 * does not fit between the title and the subtitle band; seven plain lines at
 * 62 fits with room for the verdict underneath. This is the one board in the
 * series where the content is a list rather than a set of ideas, and a list
 * should look like one.
 */
function boardChk(t) {
    const top = 596;
    const step = 64;
    const parts = [
        textPart('h', t.chkH, { at: [540, 526], font: `800 40px ${FONT}`, fill: 'ink',
                                alpha: 0, z: 60 }),
        rectPart('bg', 940, t.chk.length * step + 36,
                 { at: [540, top + (t.chk.length * step) / 2 - 2], fill: 'paperLit',
                   stroke: 'ink', strokeWidth: 4, alpha: 0, z: 8 }),
    ];
    const ids = [];
    t.chk.forEach((line, i) => {
        parts.push(textPart(`c${i}`, line, {
            at: [116, top + i * step + 14], font: `700 30px ${FONT}`, fill: 'ink',
            align: 'left', alpha: 0, z: 20, maxWidth: 850 }));
        ids.push(`c${i}`);
    });
    parts.push(textPart('fail', t.chkFail, {
        at: [540, top + t.chk.length * step + 76], font: `800 30px ${FONT}`, fill: 'warn',
        alpha: 0, z: 30, maxWidth: SAFE.x1 - SAFE.x0, lineHeight: 40 }));
    return { ...board('chk', parts), ids };
}

/** The reframe. The last board before the card, and the point of the series. */
function boardRej(t) {
    return board('rej', [
        textPart('h', t.rejH, { at: [540, 620], font: `800 36px ${FONT}`, fill: 'dim',
                                alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0 }),
        ...statParts('r', t.rejV, t.rejC, { at: [540, 810], fill: 'gold', size: 180 }),
        ...markParts('t', true, [540, 1110], { size: 58 }),
    ]);
}

function boardHon(t) {
    return board('hon', [
        textPart('h', t.honH, { at: [540, 660], font: `800 34px ${FONT}`, fill: 'dim',
                                alpha: 0, z: 60 }),
        ...statParts('h2', t.honV, t.honC, { at: [540, 840], fill: 'ink', size: 112 }),
    ]);
}

// ---------------------------------------------------------------------------

export function partTen(lang) {
    const t = T[lang];
    const P = P10[lang];

    const tf = boardTf(t);
    const chk = boardChk(t);
    const rej = boardRej(t);
    const hon = boardHon(t);
    const card = endCard(lang, 10, t.next);
    const ban = bannerParts(lang, 10);
    const grain = grainParts('gr', { seed: 421 });
    const titles = board('titles', hookTitle(t.kicker, t.title, t.sub));

    const boards = [tf, chk, rej, hon, titles,
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
                      ...inkBlinks('amara', 4, 431),
                  ] },
            ],
        },

        {
            id: 'tf', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('tf', { alpha: 1 })]),
            shots: [
                { id: 'f0', dialogue: [vo(P[1], 0.15)],
                  actions: reveal('tf', 'h', 0.2, { span: 0.35 }) },
                { id: 'f1', dialogue: [vo(P[2], 0.15)],
                  actions: build('tf', tf.rows.rowIds(0), 0.25, { gap: 0.08, span: 0.3 }) },
                { id: 'f2', dialogue: [vo(P[3], 0.15)],
                  actions: build('tf', tf.rows.rowIds(1), 0.25, { gap: 0.08, span: 0.3 }) },
                { id: 'f3', dialogue: [vo(P[4], 0.15)],
                  actions: build('tf', tf.rows.rowIds(2), 0.25, { gap: 0.08, span: 0.3 }) },
                { id: 'f4', dialogue: [vo(P[5], 0.15)],
                  actions: pop('tf', 'rule', 0.4, { span: 0.45 }) },
                { id: 'f5', dialogue: [vo(P[6], 0.15)], actions: [] },
            ],
        },

        // --- the checklist --------------------------------------------------
        {
            id: 'chk', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('chk', { alpha: 1 })]),
            shots: [
                { id: 'k0', dialogue: [vo(P[7], 0.15)],
                  actions: [
                      ...reveal('chk', 'h', 0.15, { span: 0.3 }),
                      ...reveal('chk', 'bg', 0.5, { span: 0.35 }),
                  ] },
                // Seven lines on the line that names all seven, paced so the
                // last one lands with "write it down".
                { id: 'k1', dialogue: [vo(P[8], 0.15)],
                  actions: build('chk', chk.ids, 0.3, { gap: 0.62, span: 0.3 }) },
                { id: 'k2', dialogue: [vo(P[9], 0.15)],
                  actions: pop('chk', 'fail', 0.4, { span: 0.45 }) },
            ],
        },

        // --- the reframe ------------------------------------------------------
        {
            id: 'rej', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([
                offstage('juma'), offstage('amara'), castBoard('rej', { alpha: 1 }),
            ]),
            shots: [
                { id: 'r0', dialogue: [says('juma', P[10], 0.15)],
                  actions: reveal('rej', 'h', 0.2, { span: 0.35 }) },
                { id: 'r1', dialogue: [says('amara', P[11], 0.15)],
                  actions: pop('rej', 'r_v', 0.4, { span: 0.5 }) },
                { id: 'r2', dialogue: [vo(P[12], 0.15)],
                  actions: reveal('rej', 'r_c', 0.3, { span: 0.4 }) },
                { id: 'r3', dialogue: [vo(P[13], 0.15)],
                  actions: reveal('rej', 't', 0.6, { span: 0.35 }) },
            ],
        },

        {
            id: 'hon', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('hon', { alpha: 1 })]),
            shots: [
                { id: 'h0', dialogue: [vo(P[14], 0.15)],
                  actions: [
                      ...reveal('hon', 'h', 0.15, { span: 0.3 }),
                      ...pop('hon', 'h2_v', 0.6, { span: 0.45 }),
                      ...reveal('hon', 'h2_c', 1.8, { span: 0.4 }),
                  ] },
            ],
        },

        // --- the last word -------------------------------------------------------
        {
            id: 'thesis', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.4 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([stand('amara', 540, H_AMARA * 1.06)]),
            shots: [
                { id: 't0', dialogue: [says('amara', P[15], 0.2)],
                  actions: [...gesture('amara', 'present', 0.2, { hold: 2.2 }),
                            ...inkBlinks('amara', 7, 433)] },
            ],
        },

        {
            id: 'card', palette: 'fx',
            background: { color: FX_PALETTE.paperLit },
            transitionIn: { kind: 'crossfade', duration: 0.4 },
            cast: [castBoard('grain', { alpha: 1 }), offstage('amara'),
                   castBoard('card', { alpha: 1 })],
            shots: [
                { id: 'e0', dialogue: [vo(P[16], 0.15)],
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
