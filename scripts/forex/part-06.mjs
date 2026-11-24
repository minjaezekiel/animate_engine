/**
 * Part 6 — "Why price moves at all" / "Kwa nini bei inasogea".
 *
 * Fundamental analysis, reduced to the one mechanism a beginner can actually
 * use: a currency is a claim on a country, and what it is worth depends on
 * what that country pays you to hold it. Everything else here is downstream
 * of that sentence.
 *
 * ## The correction this part exists to make
 *
 * The intuitive and wrong model is "good news for a country means buy its
 * currency". A viewer holding that model watches a strong jobs report, buys,
 * and loses -- then concludes the market is rigged, which is how somebody
 * ends up back in part one's audience.
 *
 * The real mechanism is the SURPRISE: the market has already priced what it
 * expected, so what moves price is the gap between forecast and actual. This
 * is why an economic calendar has a forecast column at all, and pointing at
 * that column is the cheapest way to make the idea concrete -- the viewer has
 * seen it a hundred times without asking why it is there.
 *
 * ## The local hook
 *
 * The part closes on the dollar's effect outside the majors, because the
 * audience holds shillings. Dollar strength is not an abstraction to somebody
 * in Dar es Salaam or Nairobi; it is the price of imported fuel. Tying the
 * series' biggest abstraction to the thing the viewer already feels is the
 * whole job of the last thirty seconds.
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

const P6 = {
    en: [
        /* 0 */ 'Price action tells you what happened. This tells you why anybody did it.',
        /* 1 */ 'A currency is a claim on a country. It is worth what that country pays '
            + 'you to hold it.',
        /* 2 */ 'That payment is the interest rate. Higher rate, more demand — all else '
            + 'equal.',
        /* 3 */ 'So the most important people here are not traders. They are central '
            + 'bankers.',
        /* 4 JUMA  */ 'Then I just buy whichever currency pays most?',
        /* 5 AMARA */ 'No. The market priced that in long before you heard about it.',
        /* 6 */ 'What moves price is the SURPRISE. The gap between what was expected and '
            + 'what arrived.',
        /* 7 */ 'That is why every calendar has a forecast column. The forecast is already '
            + 'in the price.',
        /* 8 */ 'Three releases actually matter: the rate decision, inflation, and the '
            + 'jobs numbers.',
        /* 9 */ 'And one habit — do not trade the number itself. The first move is often '
            + 'the wrong one.',
        /*10 */ 'This is closer to home than it looks. A stronger dollar presses on the '
            + 'shilling too.',
        /*11 */ 'Fuel, cement, a second-hand car from Japan. You have already felt this '
            + 'market.',
        /*12 AMARA */ 'Fundamentals tell you why, and which way. They almost never tell '
            + 'you when.',
        /*13 LOOP */ 'Next — what everybody else is already positioned for.',
    ],
    sw: [
        /* 0 */ 'Price action inakuambia kilichotokea. Hii inakuambia kwa nini mtu '
            + 'alifanya hivyo.',
        /* 1 */ 'Sarafu ni dai juu ya nchi. Thamani yake ni kile nchi inachokulipa '
            + 'kuishikilia.',
        /* 2 */ 'Malipo hayo ni riba. Riba kubwa, mahitaji makubwa — mambo mengine yakiwa '
            + 'sawa.',
        /* 3 */ 'Kwa hiyo watu muhimu zaidi hapa si wafanyabiashara. Ni wakuu wa benki '
            + 'kuu.',
        /* 4 JUMA  */ 'Basi ninunue tu sarafu inayolipa zaidi?',
        /* 5 AMARA */ 'Hapana. Soko lilishaiweka kwenye bei kabla hujasikia.',
        /* 6 */ 'Kinachosogeza bei ni MSHANGAO. Tofauti kati ya kilichotarajiwa na '
            + 'kilichotokea.',
        /* 7 */ 'Ndiyo maana kila kalenda ina safu ya utabiri. Utabiri tayari uko kwenye '
            + 'bei.',
        /* 8 */ 'Matangazo matatu ndiyo ya maana: uamuzi wa riba, mfumuko wa bei, na '
            + 'takwimu za ajira.',
        /* 9 */ 'Na tabia moja — usifanye biashara kwa namba yenyewe. Msogeo wa kwanza '
            + 'mara nyingi ni wa uongo.',
        /*10 */ 'Hili liko karibu nasi kuliko unavyodhani. Dola yenye nguvu inaibana '
            + 'shilingi pia.',
        /*11 */ 'Mafuta, saruji, gari la mtumba kutoka Japani. Umeshalihisi soko hili.',
        /*12 AMARA */ 'Fundamentals zinakuambia kwa nini, na upande gani. Hazikuambii '
            + 'lini.',
        /*13 LOOP */ 'Sehemu ijayo — kila mtu mwingine amejiandaa kwa nini.',
    ],
};

const T = {
    en: {
        kicker: 'READING THE MARKET  ·  PART 6',
        title: 'Why price moves',
        sub: 'rates, surprises, and what you already feel',

        rateH: 'A CURRENCY PAYS YOU TO HOLD IT',
        rateRows: [
            ['THE INTEREST RATE', 'what the central bank pays on that money', '#15663f'],
            ['HIGHER RATE', 'more demand to hold it — all else equal', '#2b4f7a'],
            ['WHO DECIDES', 'not traders. Central bankers, a few times a year.', '#9a6a0d'],
        ],

        surH: 'ONLY THE SURPRISE MOVES PRICE',
        surFore: 'FORECAST\n180,000',
        surAct: 'ACTUAL\n255,000',
        surGap: 'the gap is the trade',
        surNote: 'the forecast was already in the price',

        calH: 'THE THREE THAT MATTER',
        calRows: [
            ['RATE DECISION', 'the central bank sets the price of the money', '#9e2b1f'],
            ['INFLATION  ·  CPI', 'tells the bank what to do next', '#9a6a0d'],
            ['JOBS', 'the economy underneath the currency', '#2b4f7a'],
        ],
        calWarn: 'do not trade the number — the first move is often wrong',

        homeH: 'YOU HAVE ALREADY FELT THIS MARKET',
        homeV: 'USD ↑',
        homeC: 'fuel, cement, a used car from Japan —\na stronger dollar presses the shilling',

        next: 'Next — Part 7:\nwhat everyone else is positioned for',
    },
    sw: {
        kicker: 'KUSOMA SOKO  ·  SEHEMU 6',
        title: 'Kwa nini bei inasogea',
        sub: 'riba, mishangao, na unachokihisi tayari',

        rateH: 'SARAFU INAKULIPA KUISHIKILIA',
        rateRows: [
            ['RIBA', 'kile benki kuu inacholipa kwa pesa hiyo', '#15663f'],
            ['RIBA KUBWA ZAIDI', 'mahitaji makubwa ya kuishikilia — mambo mengine sawa', '#2b4f7a'],
            ['NANI ANAAMUA', 'si wafanyabiashara. Ni benki kuu, mara chache kwa mwaka.', '#9a6a0d'],
        ],

        surH: 'MSHANGAO PEKEE NDIO UNAOSOGEZA BEI',
        surFore: 'UTABIRI\n180,000',
        surAct: 'HALISI\n255,000',
        surGap: 'tofauti ndiyo biashara',
        surNote: 'utabiri ulishakuwa kwenye bei',

        calH: 'MATATU YA MAANA',
        calRows: [
            ['UAMUZI WA RIBA', 'benki kuu inapanga bei ya pesa', '#9e2b1f'],
            ['MFUMUKO WA BEI  ·  CPI', 'inaiambia benki ifanye nini baadaye', '#9a6a0d'],
            ['AJIRA', 'uchumi ulio chini ya sarafu', '#2b4f7a'],
        ],
        calWarn: 'usifanye biashara kwa namba — msogeo wa kwanza mara nyingi ni wa uongo',

        homeH: 'UMESHALIHISI SOKO HILI',
        homeV: 'USD ↑',
        homeC: 'mafuta, saruji, gari la mtumba kutoka Japani —\ndola yenye nguvu inaibana shilingi',

        next: 'Sehemu ya 7:\nkila mtu mwingine amejiandaa kwa nini',
    },
};

// ---------------------------------------------------------------------------

function boardRate(t) {
    const rows = cardRows('rr', t.rateRows, { top: 620, h: 152, gap: 20 });
    return {
        ...board('rate', [
            textPart('h', t.rateH, { at: [540, 560], font: `800 34px ${FONT}`, fill: 'ink',
                                     alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0 }),
            ...rows.parts,
        ]),
        rows,
    };
}

/**
 * Forecast against actual, as two bars whose HEIGHTS carry the surprise.
 *
 * The numbers are illustrative jobs figures, and the point is entirely the
 * gap between the two bars -- so they are drawn to scale from the values
 * rather than at two arbitrary heights. A forecast bar that is not visibly
 * shorter than the actual teaches nothing.
 */
function boardSurprise(t) {
    const unit = 0.0016;              // px per job, so 255k reads at ~408
    const fh = Math.round(180000 * unit);
    const ah = Math.round(255000 * unit);
    const base = 1140;
    return board('sur', [
        textPart('h', t.surH, { at: [540, 560], font: `800 34px ${FONT}`, fill: 'ink',
                                alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0 }),
        rectPart('fb', 240, fh, { at: [340, base - fh / 2], fill: 'dim', stroke: 'ink',
                                  strokeWidth: 4, alpha: 0, z: 10 }),
        textPart('ft', t.surFore, { at: [340, base + 58], font: `800 28px ${FONT}`,
                                    fill: 'dim', alpha: 0, z: 20, maxWidth: 300,
                                    lineHeight: 36 }),
        rectPart('ab', 240, ah, { at: [740, base - ah / 2], fill: 'bull', stroke: 'ink',
                                  strokeWidth: 4, alpha: 0, z: 10 }),
        textPart('at', t.surAct, { at: [740, base + 58], font: `800 28px ${FONT}`,
                                   fill: 'bull', alpha: 0, z: 20, maxWidth: 300,
                                   lineHeight: 36 }),
        // The gap itself, bracketed, because it is the subject.
        pathPart('gap', `${M(480, base - fh)} ${L(600, base - fh)} `
                      + `${M(540, base - fh)} ${L(540, base - ah)} `
                      + `${M(480, base - ah)} ${L(600, base - ah)}`,
                 { stroke: 'gold', strokeWidth: 5, alpha: 0, z: 30 }),
        textPart('gt', t.surGap, { at: [540, base - ah - 44], font: `800 30px ${FONT}`,
                                   fill: 'gold', alpha: 0, z: 30,
                                   maxWidth: SAFE.x1 - SAFE.x0 }),
        textPart('note', t.surNote, { at: [540, 1256], font: `800 28px ${FONT}`,
                                      fill: 'warn', alpha: 0, z: 30,
                                      maxWidth: SAFE.x1 - SAFE.x0 }),
    ]);
}

function boardCal(t) {
    const rows = cardRows('cr', t.calRows, { top: 600, h: 152, gap: 20 });
    return {
        ...board('cal', [
            textPart('h', t.calH, { at: [540, 540], font: `800 36px ${FONT}`, fill: 'ink',
                                    alpha: 0, z: 60 }),
            ...rows.parts,
            textPart('warn', t.calWarn, { at: [540, 1164], font: `800 29px ${FONT}`,
                                          fill: 'warn', alpha: 0, z: 60,
                                          maxWidth: SAFE.x1 - SAFE.x0, lineHeight: 38 }),
        ]),
        rows,
    };
}

function boardHome(t) {
    return board('home', [
        textPart('h', t.homeH, { at: [540, 620], font: `800 34px ${FONT}`, fill: 'dim',
                                 alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0 }),
        ...statParts('u', t.homeV, t.homeC, { at: [540, 810], fill: 'gold', size: 136 }),
    ]);
}

// ---------------------------------------------------------------------------

export function partSix(lang) {
    const t = T[lang];
    const P = P6[lang];

    const rate = boardRate(t);
    const sur = boardSurprise(t);
    const cal = boardCal(t);
    const home = boardHome(t);
    const card = endCard(lang, 6, t.next);
    const ban = bannerParts(lang, 6);
    const grain = grainParts('gr', { seed: 181 });
    const titles = board('titles', hookTitle(t.kicker, t.title, t.sub));

    const boards = [rate, sur, cal, home, titles,
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
                      ...inkBlinks('amara', 4, 211),
                  ] },
            ],
        },

        {
            id: 'rate', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('rate', { alpha: 1 })]),
            shots: [
                { id: 'r0', dialogue: [vo(P[1], 0.15)],
                  actions: [
                      ...reveal('rate', 'h', 0.15, { span: 0.3 }),
                      ...build('rate', rate.rows.rowIds(0), 0.8, { gap: 0.08, span: 0.3 }),
                  ] },
                { id: 'r1', dialogue: [vo(P[2], 0.15)],
                  actions: build('rate', rate.rows.rowIds(1), 0.3, { gap: 0.08, span: 0.3 }) },
                { id: 'r2', dialogue: [vo(P[3], 0.15)],
                  actions: build('rate', rate.rows.rowIds(2), 0.3, { gap: 0.08, span: 0.3 }) },
            ],
        },

        // --- the surprise ---------------------------------------------------
        {
            id: 'sur', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([
                offstage('juma'), offstage('amara'), castBoard('sur', { alpha: 1 }),
            ]),
            shots: [
                { id: 'u0', dialogue: [says('juma', P[4], 0.15)],
                  actions: reveal('sur', 'h', 0.2, { span: 0.35 }) },
                { id: 'u1', dialogue: [says('amara', P[5], 0.15)],
                  actions: build('sur', ['fb', 'ft'], 0.3, { gap: 0.12, span: 0.35 }) },
                { id: 'u2', dialogue: [vo(P[6], 0.15)],
                  actions: [
                      ...build('sur', ['ab', 'at'], 0.3, { gap: 0.12, span: 0.35 }),
                      ...reveal('sur', 'gap', 1.6, { span: 0.35 }),
                      ...pop('sur', 'gt', 2.0, { span: 0.4 }),
                  ] },
                { id: 'u3', dialogue: [vo(P[7], 0.15)],
                  actions: reveal('sur', 'note', 0.6, { span: 0.4 }) },
            ],
        },

        {
            id: 'cal', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('cal', { alpha: 1 })]),
            shots: [
                { id: 'c0', dialogue: [vo(P[8], 0.15)],
                  actions: [
                      ...reveal('cal', 'h', 0.15, { span: 0.3 }),
                      ...build('cal', cal.rows.rowIds(0), 0.5, { gap: 0.08, span: 0.3 }),
                      ...build('cal', cal.rows.rowIds(1), 2.0, { gap: 0.08, span: 0.3 }),
                      ...build('cal', cal.rows.rowIds(2), 3.4, { gap: 0.08, span: 0.3 }),
                  ] },
                { id: 'c1', dialogue: [vo(P[9], 0.15)],
                  actions: pop('cal', 'warn', 0.5, { span: 0.4 }) },
            ],
        },

        {
            id: 'home', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('home', { alpha: 1 })]),
            shots: [
                { id: 'm0', dialogue: [vo(P[10], 0.15)],
                  actions: [
                      ...reveal('home', 'h', 0.15, { span: 0.3 }),
                      ...pop('home', 'u_v', 0.6, { span: 0.5 }),
                  ] },
                { id: 'm1', dialogue: [vo(P[11], 0.15)],
                  actions: reveal('home', 'u_c', 0.3, { span: 0.4 }) },
            ],
        },

        {
            id: 'thesis', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.4 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([stand('amara', 540, H_AMARA * 1.06)]),
            shots: [
                { id: 't0', dialogue: [says('amara', P[12], 0.2)],
                  actions: [...gesture('amara', 'sure', 0.2, { hold: 1.8 }),
                            ...inkBlinks('amara', 5, 223)] },
            ],
        },

        {
            id: 'card', palette: 'fx',
            background: { color: FX_PALETTE.paperLit },
            transitionIn: { kind: 'crossfade', duration: 0.4 },
            cast: [castBoard('grain', { alpha: 1 }), offstage('amara'),
                   castBoard('card', { alpha: 1 })],
            shots: [
                { id: 'e0', dialogue: [vo(P[13], 0.15)],
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
