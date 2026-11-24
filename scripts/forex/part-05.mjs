/**
 * Part 5 — "What the candle is telling you" / "Mshumaa unakuambia nini".
 *
 * Price action: structure, levels, and the single correction that makes the
 * rest of it usable -- a candlestick pattern means nothing on its own, and
 * everything at a level that has already held.
 *
 * ## The teaching order, and why it is backwards from most courses
 *
 * Nearly every free course teaches the PATTERNS first: here is a pin bar,
 * here is an engulfing candle, here is a doji. That order produces somebody
 * who can name shapes and loses money, because the shapes occur constantly
 * and almost all of those occurrences are noise.
 *
 * So this part does location first. Structure, then levels, then -- only once
 * the viewer has somewhere to put it -- the candle. The pin bar arrives in
 * the last third, already attached to the level it needs. A viewer who
 * remembers exactly one sentence from this film should remember "a candle
 * means nothing until you know where it happened", which is the closing line
 * and the reason for the running order.
 *
 * ## The charts are written out, not generated
 *
 * Both series below are hand-specified. `make-orderblock.mjs` made the same
 * call and the reasoning still holds: the teaching point is a specific shape
 * -- a clean sequence of higher highs and higher lows, a level touched three
 * times with a long rejection wick on the third -- and a random walk will not
 * reliably produce it. A chart that nearly shows the thing being named is
 * worse than no chart.
 */
import {
    FONT, L, M, SAFE, build, effect, pathPart, pop, rectPart, reveal, textPart,
} from '../lib/diagram.mjs';
import {
    CHARACTERS, FX_PALETTE, H_AMARA, H_JUMA, META, offstage, says, stand, vo, voicesFor,
} from '../lib/forex.mjs';
import {
    bannerParts, board, cardRows, castBoard, chartParts, endCard, fitShots, gesture,
    grainParts, hookTitle, inkBlinks, levelParts, markParts, statParts, titleAt,
} from './common.mjs';

const P5 = {
    en: [
        /* 0 */ 'Price does not wander. It travels between places where orders are waiting.',
        /* 1 */ 'Structure first. Higher highs and higher lows is an uptrend. Nothing more '
            + 'complicated than that.',
        /* 2 */ 'Lower highs and lower lows is a downtrend. Neither one is a range — and '
            + 'ranges are where accounts die.',
        /* 3 */ 'Then levels. A level is a price the market has already turned at.',
        /* 4 */ 'Three touches is a level. Two is a line. One is a guess.',
        /* 5 */ 'Now the candle. The body is who won. The wick is who got rejected.',
        /* 6 */ 'A long wick below means sellers pushed down and buyers pushed back harder.',
        /* 7 JUMA  */ 'So a long wick is a buy signal?',
        /* 8 AMARA */ 'Only where it happens. In the middle of nowhere it is noise.',
        /* 9 */ 'The same candle, at a level that has already held three times, is a '
            + 'different thing entirely.',
        /*10 */ 'Two patterns are worth knowing. The pin bar: long wick, small body, at a '
            + 'level.',
        /*11 */ 'The engulfing: one candle swallowing the last one whole, at a level.',
        /*12 */ 'Both say the same thing. One side tried, and failed.',
        /*13 AMARA */ 'A candle means nothing until you know where it happened.',
        /*14 LOOP */ 'Next — why price moves at all.',
    ],
    sw: [
        /* 0 */ 'Bei haizurui tu. Inasafiri kati ya maeneo yenye oda zinazosubiri.',
        /* 1 */ 'Muundo kwanza. Vilele vya juu zaidi na mabonde ya juu zaidi ni mwenendo '
            + 'wa kupanda. Si zaidi ya hapo.',
        /* 2 */ 'Vilele vya chini na mabonde ya chini ni mwenendo wa kushuka. Hakuna '
            + 'kati yao ni range — na range ndiko akaunti zinakufa.',
        /* 3 */ 'Kisha viwango. Kiwango ni bei ambayo soko limeshageukia hapo awali.',
        /* 4 */ 'Kugusa mara tatu ni kiwango. Mara mbili ni mstari. Mara moja ni kubahatisha.',
        /* 5 */ 'Sasa mshumaa. Mwili ni nani alishinda. Utambi ni nani alikataliwa.',
        /* 6 */ 'Utambi mrefu chini maana yake wauzaji walisukuma chini na wanunuzi '
            + 'wakasukuma kwa nguvu zaidi.',
        /* 7 JUMA  */ 'Kwa hiyo utambi mrefu ni ishara ya kununua?',
        /* 8 AMARA */ 'Ni pale unapotokea tu. Katikati ya mahali popote ni kelele.',
        /* 9 */ 'Mshumaa uleule, kwenye kiwango kilichoshikilia mara tatu, ni kitu tofauti '
            + 'kabisa.',
        /*10 */ 'Mifumo miwili inafaa kujulikana. Pin bar: utambi mrefu, mwili mdogo, '
            + 'kwenye kiwango.',
        /*11 */ 'Engulfing: mshumaa mmoja unaomeza uliotangulia mzima, kwenye kiwango.',
        /*12 */ 'Vyote vinasema kitu kimoja. Upande mmoja ulijaribu, ukashindwa.',
        /*13 AMARA */ 'Mshumaa hauna maana mpaka ujue ulitokea wapi.',
        /*14 LOOP */ 'Sehemu ijayo — kwa nini bei inasogea kabisa.',
    ],
};

const T = {
    en: {
        kicker: 'READING THE MARKET  ·  PART 5',
        title: 'What the candle says',
        sub: 'structure, levels, and only then patterns',

        strH: 'HIGHER HIGHS, HIGHER LOWS',
        strUp: 'UPTREND', strRange: 'a range is neither — stay out',

        lvlH: 'A LEVEL IS WHERE IT ALREADY TURNED',
        lvlLabel: 'held 3 times',
        lvlRule: '3 touches = level   ·   2 = a line   ·   1 = a guess',

        canH: 'THE BODY AND THE WICK',
        canBody: 'BODY\nwho won',
        canWick: 'WICK\nwho got rejected',

        whereH: 'SAME CANDLE. DIFFERENT PLACE.',
        whereRows: [
            ['IN THE MIDDLE OF NOWHERE', 'Noise. It happens twenty times a day.', '#9e2b1f'],
            ['AT A LEVEL THAT HELD 3×', 'Evidence. Someone defended that price before.', '#15663f'],
        ],

        patH: 'THE ONLY TWO WORTH KNOWING',
        patRows: [
            ['PIN BAR', 'Long wick, small body, AT a level.', '#2b4f7a'],
            ['ENGULFING', 'One candle swallows the last one, AT a level.', '#5f3f82'],
            ['BOTH MEAN', 'One side tried, and failed.', '#9a6a0d'],
        ],

        next: 'Next — Part 6:\nwhy price moves at all',
    },
    sw: {
        kicker: 'KUSOMA SOKO  ·  SEHEMU 5',
        title: 'Mshumaa unasema nini',
        sub: 'muundo, viwango, kisha ndipo mifumo',

        strH: 'VILELE JUU, MABONDE JUU',
        strUp: 'MWENENDO WA KUPANDA', strRange: 'range si yoyote — kaa mbali',

        lvlH: 'KIWANGO NI PALE ILIPOGEUKA AWALI',
        lvlLabel: 'kimeshikilia mara 3',
        lvlRule: 'kugusa 3 = kiwango   ·   2 = mstari   ·   1 = kubahatisha',

        canH: 'MWILI NA UTAMBI',
        canBody: 'MWILI\nnani alishinda',
        canWick: 'UTAMBI\nnani alikataliwa',

        whereH: 'MSHUMAA ULEULE. MAHALI TOFAUTI.',
        whereRows: [
            ['KATIKATI YA POPOTE', 'Kelele. Inatokea mara ishirini kwa siku.', '#9e2b1f'],
            ['KWENYE KIWANGO CHA MARA 3', 'Ushahidi. Mtu aliitetea bei hiyo awali.', '#15663f'],
        ],

        patH: 'MIWILI PEKEE INAYOFAA',
        patRows: [
            ['PIN BAR', 'Utambi mrefu, mwili mdogo, KWENYE kiwango.', '#2b4f7a'],
            ['ENGULFING', 'Mshumaa mmoja unameza uliotangulia, KWENYE kiwango.', '#5f3f82'],
            ['VYOTE VINAMAANISHA', 'Upande mmoja ulijaribu, ukashindwa.', '#9a6a0d'],
        ],

        next: 'Sehemu ya 6:\nkwa nini bei inasogea kabisa',
    },
};

// ---------------------------------------------------------------------------
// The charts, written out
// ---------------------------------------------------------------------------

/** A clean sequence of higher highs and higher lows. */
const UPTREND = [
    { o: 50, h: 53, l: 49, c: 52 },
    { o: 52, h: 55, l: 51, c: 54 },
    { o: 54, h: 56, l: 52, c: 53 },
    { o: 53, h: 54, l: 50, c: 51 },      // higher low: 50 > 49
    { o: 51, h: 57, l: 51, c: 56 },      // higher high: 57 > 56
    { o: 56, h: 59, l: 55, c: 58 },
    { o: 58, h: 60, l: 56, c: 57 },
    { o: 57, h: 58, l: 54, c: 55 },      // higher low: 54 > 50
    { o: 55, h: 62, l: 55, c: 61 },      // higher high
    { o: 61, h: 64, l: 60, c: 63 },
    { o: 63, h: 65, l: 61, c: 62 },
    { o: 62, h: 63, l: 59, c: 60 },      // higher low: 59 > 54
    { o: 60, h: 68, l: 60, c: 67 },      // higher high
];

/**
 * A level touched three times, with the third touch a long rejection wick.
 *
 * The level sits at 46. Each approach undercuts it by a little and closes
 * well above -- which is what a defended level actually looks like, rather
 * than the textbook version where price stops at exactly the same number
 * three times and never pierces it.
 */
const LEVEL = [
    { o: 52, h: 53, l: 50, c: 51 },
    { o: 51, h: 52, l: 47, c: 48 },
    { o: 48, h: 49, l: 46.2, c: 47 },    // touch 1
    { o: 47, h: 51, l: 46.5, c: 50 },
    { o: 50, h: 52, l: 48, c: 49 },
    { o: 49, h: 50, l: 46.1, c: 48 },    // touch 2
    { o: 48, h: 52, l: 47, c: 51 },
    { o: 51, h: 53, l: 49, c: 50 },
    { o: 50, h: 51, l: 45.6, c: 49.6 },  // touch 3 — the pin bar
    { o: 49.6, h: 55, l: 48.8, c: 54 },
    { o: 54, h: 58, l: 53, c: 57 },
];

// ---------------------------------------------------------------------------

function boardStructure(t) {
    const ch = chartParts('st', UPTREND, {
        box: { x0: 100, y0: 600, x1: 980, y1: 1120 },
    });
    return {
        ...board('str', [
            textPart('h', t.strH, { at: [540, 548], font: `800 36px ${FONT}`, fill: 'ink',
                                    alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0 }),
            ...ch.parts,
            textPart('up', t.strUp, { at: [540, 1182], font: `800 38px ${FONT}`,
                                      fill: 'bull', alpha: 0, z: 60 }),
            textPart('rg', t.strRange, { at: [540, 1240], font: `800 28px ${FONT}`,
                                         fill: 'warn', alpha: 0, z: 60,
                                         maxWidth: SAFE.x1 - SAFE.x0 }),
        ]),
        ch,
    };
}

function boardLevel(t) {
    const ch = chartParts('lv', LEVEL, {
        box: { x0: 100, y0: 600, x1: 980, y1: 1120 },
    });
    // The level is drawn at the PRICE, through the chart's own scale, so it
    // cannot drift away from the candles it is supposed to describe.
    const y = ch.y(46.3);
    return {
        ...board('level', [
            textPart('h', t.lvlH, { at: [540, 548], font: `800 34px ${FONT}`, fill: 'ink',
                                    alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0 }),
            ...ch.parts,
            ...levelParts('ln', y, t.lvlLabel, { x0: 100, x1: 980 }),
            textPart('rule', t.lvlRule, { at: [540, 1196], font: `800 28px ${FONT}`,
                                          fill: 'dim', alpha: 0, z: 60,
                                          maxWidth: SAFE.x1 - SAFE.x0 }),
        ]),
        ch,
    };
}

/**
 * One candle, drawn big enough to label.
 *
 * Not from `chartParts`: that sizes candles to fit a whole series, and the
 * anatomy shot needs a single bar the height of a quarter of the frame.
 */
function boardCandle(t) {
    return board('candle', [
        textPart('h', t.canH, { at: [540, 560], font: `800 36px ${FONT}`, fill: 'ink',
                                alpha: 0, z: 60 }),
        pathPart('wick', `${M(430, 640)} ${L(430, 1160)}`,
                 { stroke: 'ink', strokeWidth: 8, alpha: 0, z: 10 }),
        rectPart('body', 150, 250, { at: [430, 830], fill: 'bull', stroke: 'ink',
                                     strokeWidth: 6, alpha: 0, z: 12 }),
        pathPart('bl', `${M(520, 830)} ${L(620, 830)}`,
                 { stroke: 'dim', strokeWidth: 3, alpha: 0, z: 20 }),
        textPart('bt', t.canBody, { at: [640, 806], font: `800 30px ${FONT}`, fill: 'bull',
                                    align: 'left', alpha: 0, z: 20, maxWidth: 360,
                                    lineHeight: 38 }),
        pathPart('wl', `${M(446, 1090)} ${L(620, 1090)}`,
                 { stroke: 'dim', strokeWidth: 3, alpha: 0, z: 20 }),
        textPart('wt', t.canWick, { at: [640, 1066], font: `800 30px ${FONT}`, fill: 'warn',
                                    align: 'left', alpha: 0, z: 20, maxWidth: 360,
                                    lineHeight: 38 }),
    ]);
}

/**
 * The correction: same candle, different place.
 *
 * The verdict marks are positioned FROM the row geometry rather than typed in
 * by hand. The first version guessed `[160, 1006]` and `[160, 1186]`, which
 * put the cross floating in open paper beside row one and the tick squarely
 * on top of row two's body text. Deriving both from `top`, `h` and `gap` is
 * the only version that cannot drift when a row height changes -- and the
 * cards are narrowed to 880 to open the gutter the marks sit in, because
 * there is no room outside the safe area for them.
 */
function boardWhere(t) {
    const TOP = 660;
    const H = 170;
    const GAP = 24;
    const rows = cardRows('wr', t.whereRows, { top: TOP, h: H, gap: GAP, x: 60, w: 880 });
    const rowY = (i) => TOP + i * (H + GAP) + H / 2;
    return {
        ...board('where', [
            textPart('h', t.whereH, { at: [540, 596], font: `800 34px ${FONT}`, fill: 'ink',
                                      alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0 }),
            ...rows.parts,
            ...markParts('x', false, [982, rowY(0)], { size: 48 }),
            ...markParts('t', true, [982, rowY(1)], { size: 48 }),
        ]),
        rows,
    };
}

function boardPat(t) {
    const rows = cardRows('pr', t.patRows, { top: 620, h: 152, gap: 20 });
    return {
        ...board('pat', [
            textPart('h', t.patH, { at: [540, 560], font: `800 36px ${FONT}`, fill: 'ink',
                                    alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0 }),
            ...rows.parts,
        ]),
        rows,
    };
}

// ---------------------------------------------------------------------------

export function partFive(lang) {
    const t = T[lang];
    const P = P5[lang];

    const str = boardStructure(t);
    const level = boardLevel(t);
    const candle = boardCandle(t);
    const where = boardWhere(t);
    const pat = boardPat(t);
    const card = endCard(lang, 5, t.next);
    const ban = bannerParts(lang, 5);
    const grain = grainParts('gr', { seed: 131 });
    const titles = board('titles', hookTitle(t.kicker, t.title, t.sub));

    const boards = [str, level, candle, where, pat, titles,
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
                      ...inkBlinks('amara', 4, 101),
                  ] },
            ],
        },

        // --- structure ----------------------------------------------------------
        {
            id: 'str', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('str', { alpha: 1 })]),
            shots: [
                // The chart PRINTS, one candle at a time, which is the one
                // thing a still image of a chart cannot do and the reason
                // these are parts rather than a texture.
                { id: 's0', dialogue: [vo(P[1], 0.15)],
                  actions: [
                      ...reveal('str', 'h', 0.15, { span: 0.3 }),
                      ...build('str', str.ch.frameIds, 0.3, { gap: 0.06, span: 0.25 }),
                      ...build('str', str.ch.all(), 0.7, { gap: 0.13, span: 0.2 }),
                      ...pop('str', 'up', 4.4, { span: 0.4 }),
                  ] },
                { id: 's1', dialogue: [vo(P[2], 0.15)],
                  actions: reveal('str', 'rg', 1.6, { span: 0.4 }) },
            ],
        },

        // --- levels ---------------------------------------------------------------
        {
            id: 'level', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('level', { alpha: 1 })]),
            shots: [
                { id: 'l0', dialogue: [vo(P[3], 0.15)],
                  actions: [
                      ...reveal('level', 'h', 0.15, { span: 0.3 }),
                      ...build('level', level.ch.frameIds, 0.3, { gap: 0.06, span: 0.25 }),
                      ...build('level', level.ch.all(), 0.7, { gap: 0.14, span: 0.2 }),
                      ...reveal('level', 'ln_l', 3.0, { span: 0.4 }),
                      ...reveal('level', 'ln_t', 3.4, { span: 0.4 }),
                  ] },
                { id: 'l1', dialogue: [vo(P[4], 0.15)],
                  actions: pop('level', 'rule', 0.4, { span: 0.4 }) },
            ],
        },

        // --- the candle itself ------------------------------------------------------
        {
            id: 'candle', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('candle', { alpha: 1 })]),
            shots: [
                { id: 'c0', dialogue: [vo(P[5], 0.15)],
                  actions: [
                      ...reveal('candle', 'h', 0.15, { span: 0.3 }),
                      ...reveal('candle', 'wick', 0.5, { span: 0.3 }),
                      ...pop('candle', 'body', 0.8, { span: 0.35 }),
                      ...build('candle', ['bl', 'bt'], 1.8, { gap: 0.1, span: 0.3 }),
                      ...build('candle', ['wl', 'wt'], 3.0, { gap: 0.1, span: 0.3 }),
                  ] },
                { id: 'c1', dialogue: [vo(P[6], 0.15)], actions: [] },
            ],
        },

        // --- the correction -----------------------------------------------------------
        {
            id: 'where', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([
                offstage('juma'), offstage('amara'), castBoard('where', { alpha: 1 }),
            ]),
            shots: [
                // Both EMPTY cards come up under the question, so the shot
                // has a frame instead of a heading floating on paper --
                // Phase 34 lost two scenes to "a four-second line over an
                // empty frame", and a question is exactly where it happens,
                // because the answer is what the board is holding.
                { id: 'w0', dialogue: [says('juma', P[7], 0.15)],
                  actions: [
                      ...reveal('where', 'h', 0.2, { span: 0.35 }),
                      ...reveal('where', where.rows.rowIds(0)[0], 0.7, { span: 0.35 }),
                      ...reveal('where', where.rows.rowIds(1)[0], 1.0, { span: 0.35 }),
                  ] },
                { id: 'w1', dialogue: [says('amara', P[8], 0.15)],
                  actions: [
                      ...build('where', where.rows.rowIds(0).slice(1), 0.25,
                               { gap: 0.08, span: 0.3 }),
                      ...reveal('where', 'x', 1.4, { span: 0.3 }),
                  ] },
                { id: 'w2', dialogue: [vo(P[9], 0.15)],
                  actions: [
                      ...build('where', where.rows.rowIds(1).slice(1), 0.25,
                               { gap: 0.08, span: 0.3 }),
                      ...reveal('where', 't', 1.6, { span: 0.3 }),
                  ] },
            ],
        },

        // --- the two patterns ------------------------------------------------------------
        {
            id: 'pat', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('pat', { alpha: 1 })]),
            shots: [
                { id: 'p0', dialogue: [vo(P[10], 0.15)],
                  actions: [
                      ...reveal('pat', 'h', 0.15, { span: 0.3 }),
                      ...build('pat', pat.rows.rowIds(0), 0.6, { gap: 0.08, span: 0.3 }),
                  ] },
                { id: 'p1', dialogue: [vo(P[11], 0.15)],
                  actions: build('pat', pat.rows.rowIds(1), 0.3, { gap: 0.08, span: 0.3 }) },
                { id: 'p2', dialogue: [vo(P[12], 0.15)],
                  actions: build('pat', pat.rows.rowIds(2), 0.3, { gap: 0.08, span: 0.3 }) },
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
                            ...inkBlinks('amara', 5, 149)] },
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
