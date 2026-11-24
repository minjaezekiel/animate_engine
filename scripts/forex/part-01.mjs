/**
 * Part 1 — "Forex is a scam" / "Forex ni utapeli".
 *
 * The objection the audience actually holds, answered in ninety seconds, and
 * the arithmetic that makes the rest of the series possible to believe.
 *
 * ## The argument, and why it is in this order
 *
 * The film concedes the premise before defending anything, because an African
 * viewer who has watched a friend lose money to a signal group is not
 * persuaded by enthusiasm. It then separates two things that get conflated:
 * the MARKET, which is real and indifferent, and the INDUSTRY SELLING ACCESS
 * to it, which is where essentially all of the fraud lives.
 *
 * The centre of the part is a demolition of the "95% accuracy" claim, which
 * is both the single most common pitch and the exact thing this series was
 * asked to deliver. It is arithmetic, not opinion: risk 100 to make 5, win
 * nineteen times out of twenty, and you are down five dollars with a 95% win
 * rate. Once a viewer has seen that, every "95% accurate signals" advert they
 * ever see again reads differently, which is the most durable thing ninety
 * seconds can do for them.
 *
 * ## The two figures on screen, and where they come from
 *
 * - **$9.6 trillion a day.** BIS Triennial Central Bank Survey, April 2025
 *   (released 30 September 2025): global FX turnover averaged $9.6 trn/day
 *   net-net, up 28% from $7.5 trn in 2022. The December 2025 BIS Quarterly
 *   Review states $9.5 trn for the same survey; the narration says "nine and
 *   a half trillion" so it is true on either basis.
 *   https://www.bis.org/statistics/rpfx25_fx.htm
 *
 * - **70–80 of every 100 retail accounts lose.** Not an estimate and not
 *   ours: ESMA's 2018 product-intervention measures, and the FCA's equivalent,
 *   REQUIRE a CFD provider to publish the percentage of its own retail
 *   accounts that lost money over the preceding twelve months, recalculated
 *   quarterly. Aggregations of those mandated disclosures across dozens of
 *   regulated brokers land around 71–76% on average, with individual firms
 *   ranging roughly 51–85%.
 *
 * That second one is the strongest beat in the part and it took a search to
 * see why: the number is not a critic's claim that a broker disputes. It is
 * the broker's own legally-required disclosure, printed on its own homepage.
 * A viewer can leave this video, open their broker's site, and read it. The
 * narration says exactly that, because a fact the viewer can check in ten
 * seconds is worth more than one they have to take on trust -- which is the
 * whole thesis of the part.
 */
import {
    FONT, L, M, SAFE, build, conceal, effect, pathPart, pop, rectPart, reveal, textPart,
} from '../lib/diagram.mjs';
import {
    CHARACTERS, FX_PALETTE, H_AMARA, H_HYPE, H_JUMA, META, offstage, says, stand,
    vo, voicesFor,
} from '../lib/forex.mjs';
import {
    bannerParts, inkBlinks, board, cardRows, castBoard, endCard, fitShots, gesture,
    grainParts, hookTitle, markParts, statParts, titleAt,
} from './common.mjs';

/**
 * The narration, indexed, so a rewrite is one edit and not three.
 *
 * Every line is short on purpose. `estimateLine` works at 150 words per
 * minute, which is two and a half words a second, so a 25-word sentence is a
 * ten-second shot -- and the first cut of this part ran 2:03 against a 1:30
 * brief for exactly that reason. The fix was not to delete the argument but
 * to stop writing it in paragraphs: the beats are all still here, in 17 lines
 * averaging 12 words instead of 18 lines averaging 25. It also sounds far
 * more like the reference, which cuts a new idea every two or three seconds.
 */
const P1 = {
    en: [
        // The hook is two sentences, not one. "Forex is a scam." alone is a
        // better line and a worse OPENING: at four words it is 1.6 s of
        // speech, the 2.2 s shot floor pads it out, and the first eight
        // seconds measured 76% covered against an 80% floor -- "a pause in
        // the first eight seconds is an exit". The second sentence is also
        // the more honest hook, because it is the viewer's actual evidence
        // rather than a slogan.
        /* 0 JUMA  */ 'Forex is a scam. Everyone I know who tried it lost money.',
        /* 1 AMARA */ 'Partly true. And not the part you think.',
        /* 2 */ 'The market is real. Nine and a half trillion dollars changed hands '
            + 'yesterday.',
        /* 3 */ 'Banks, governments, every importer paying for a container. It does not '
            + 'know you exist.',
        /* 4 HYPE */ 'Ninety-five percent accuracy! VIP signals! Fifty thousand a month!',
        /* 5 */ 'That is the scam. And the arithmetic takes ten seconds.',
        /* 6 */ 'Want a ninety-five percent win rate? Risk a hundred dollars to make five.',
        /* 7 */ 'Nineteen wins: ninety-five dollars. One loss: a hundred.',
        /* 8 */ 'You won ninety-five percent of the time. You are down five dollars.',
        /* 9 AMARA */ 'Win rate alone tells you nothing. He is counting on you not '
            + 'knowing that.',
        /*10 JUMA  */ 'So nobody makes money?',
        /*11 AMARA */ 'The ones who do look nothing like him. They look boring.',
        /*12 */ 'Money they can lose. One tested method. The same small risk. Written '
            + 'records.',
        /*13 */ 'And by law, your broker publishes how many clients lose. Usually seventy '
            + 'to eighty in a hundred.',
        /*14 */ 'Not proof it is impossible. Proof it is hard, and most people skip the '
            + 'work.',
        /*15 */ 'Forex is not a scam. But almost everything sold to you about forex is.',
        /*16 LOOP */ 'Next — what you actually buy when you buy EUR slash USD.',
    ],
    sw: [
        /* 0 JUMA  */ 'Forex ni utapeli. Kila ninayemjua aliyejaribu alipoteza pesa.',
        /* 1 AMARA */ 'Ni kweli kwa sehemu. Na si sehemu unayodhani.',
        /* 2 */ 'Soko ni la kweli. Dola trilioni tisa na nusu zilibadilishwa jana.',
        /* 3 */ 'Benki, serikali, kila mwagizaji analipia kontena. Halijui kama wewe upo.',
        /* 4 HYPE */ 'Usahihi asilimia tisini na tano! Signal za VIP! Elfu hamsini kwa mwezi!',
        /* 5 */ 'Hiyo ndiyo utapeli. Na hesabu yake inachukua sekunde kumi.',
        /* 6 */ 'Unataka kushinda asilimia tisini na tano? Hatarisha dola mia upate tano.',
        /* 7 */ 'Ushindi kumi na tisa: dola tisini na tano. Hasara moja: dola mia.',
        /* 8 */ 'Umeshinda asilimia tisini na tano. Lakini una hasara ya dola tano.',
        /* 9 AMARA */ 'Kiwango cha ushindi peke yake hakiambii kitu. Anategemea wewe usijue.',
        /*10 JUMA  */ 'Kwa hiyo hakuna anayepata faida?',
        /*11 AMARA */ 'Wanaopata hawafanani naye hata kidogo. Wao wanachosha kuwaangalia.',
        /*12 */ 'Pesa wanazoweza kupoteza. Njia moja iliyojaribiwa. Hatari ileile. '
            + 'Kumbukumbu.',
        /*13 */ 'Na kisheria, broker wako hutangaza wateja wangapi wanapata hasara. Mara '
            + 'nyingi sabini hadi themanini kwa mia.',
        /*14 */ 'Si uthibitisho kwamba haiwezekani. Ni uthibitisho ni ngumu, na wengi '
            + 'wanaruka kazi.',
        /*15 */ 'Forex si utapeli. Lakini karibu kila kitu unachouziwa kuhusu forex ni '
            + 'utapeli.',
        /*16 LOOP */ 'Sehemu ijayo — unanunua nini hasa unaponunua EUR kwa USD.',
    ],
};

const T = {
    en: {
        kicker: 'READING THE MARKET  ·  PART 1',
        title: '"Forex is a scam"',
        sub: 'and the part of that which is true',

        sizeV: '$9.6 trillion',
        sizeC: 'traded every day — BIS survey, April 2025',
        sizeH: 'THE MARKET IS REAL',
        who: ['banks', 'governments', 'importers', 'you, last'],

        claimH: 'THE PITCH',
        claim: '95% ACCURACY',
        claimSub: 'VIP signals  ·  50,000 / month',

        mathH: 'HOW TO WIN 95% OF THE TIME AND LOSE MONEY',
        mathRows: [
            ['RISK 100 TO MAKE 5', 'the only way to get a win rate that high', '#9e2b1f'],
            ['19 WINS  ×  $5', '= $95', '#15663f'],
            ['1 LOSS  ×  $100', '= −$100', '#9e2b1f'],
        ],
        netV: '−$5',
        netC: '95% win rate. Down money.',

        realH: 'WHAT THE REAL ONES ACTUALLY HAVE',
        realRows: [
            ['CAPITAL THEY CAN LOSE', 'Never rent. Never a loan. Never school fees.', '#15663f'],
            ['ONE TESTED METHOD', 'Written down, and traded the same way every time.', '#2b4f7a'],
            ['A FIXED RISK PER TRADE', 'The same small percentage, win or lose.', '#9a6a0d'],
            ['RECORDS', 'Every trade written down. This is the boring part.', '#5f3f82'],
        ],

        honestH: 'YOUR BROKER PUBLISHES THIS BY LAW',
        honestV: '70–80',
        honestC: 'of every 100 retail accounts lose money\nIt is on their own homepage. Go and read it.',

        next: 'Next — Part 2:\nbase, quote, and what you actually buy',
    },
    sw: {
        kicker: 'KUSOMA SOKO  ·  SEHEMU 1',
        title: '"Forex ni utapeli"',
        sub: 'na sehemu ya hilo ambayo ni kweli',

        sizeV: 'trilioni 9.6',
        sizeC: 'za dola kila siku — utafiti wa BIS, Aprili 2025',
        sizeH: 'SOKO NI LA KWELI',
        who: ['benki', 'serikali', 'waagizaji', 'wewe, mwisho'],

        claimH: 'MATANGAZO',
        claim: 'USAHIHI 95%',
        claimSub: 'signal za VIP  ·  50,000 / mwezi',

        mathH: 'JINSI YA KUSHINDA 95% NA BADO UPATE HASARA',
        mathRows: [
            ['HATARISHA 100 UPATE 5', 'ndiyo njia pekee ya kufikia kiwango hicho', '#9e2b1f'],
            ['USHINDI 19  ×  $5', '= $95', '#15663f'],
            ['HASARA 1  ×  $100', '= −$100', '#9e2b1f'],
        ],
        netV: '−$5',
        netC: 'Umeshinda 95%. Una hasara.',

        realH: 'WANAOFANIKIWA WANA NINI HASA',
        realRows: [
            ['MTAJI WANAOWEZA KUPOTEZA', 'Si kodi ya nyumba. Si mkopo. Si ada ya shule.', '#15663f'],
            ['NJIA MOJA ILIYOJARIBIWA', 'Imeandikwa, na inafuatwa vilevile kila mara.', '#2b4f7a'],
            ['HATARI ISIYOBADILIKA', 'Asilimia ileile ndogo, ushinde au upoteze.', '#9a6a0d'],
            ['KUMBUKUMBU', 'Kila biashara imeandikwa. Hii ndiyo sehemu inayochosha.', '#5f3f82'],
        ],

        honestH: 'BROKER WAKO ANATANGAZA HII KISHERIA',
        honestV: '70–80',
        honestC: 'kati ya kila akaunti 100 zinapata hasara\nIko kwenye tovuti yao. Nenda ukasome.',

        next: 'Sehemu ya 2:\nbase, quote, na unanunua nini hasa',
    },
};

// ---------------------------------------------------------------------------
// The boards
// ---------------------------------------------------------------------------

/** The market's size, as one number nobody can argue with. */
function boardSize(t) {
    const who = t.who.map((w, i) => textPart(`w${i}`, w, {
        at: [160 + i * 254, 1118], font: `800 29px ${FONT}`, fill: i === 3 ? 'dim' : 'ink',
        alpha: 0, z: 40, maxWidth: 230 }));
    return {
        ...board('size', [
            textPart('h', t.sizeH, { at: [540, 596], font: `800 36px ${FONT}`, fill: 'dim',
                                     alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0 }),
            ...statParts('big', t.sizeV, t.sizeC, { at: [540, 760], fill: 'ink', size: 104 }),
            // The chain of people whose money is actually in it, left to
            // right and ending on the viewer -- who is last on purpose.
            pathPart('rule', `${M(120, 1046)} ${L(960, 1046)}`,
                     { stroke: 'rule', strokeWidth: 3, alpha: 0, z: 30 }),
            ...who,
        ]),
        whoIds: who.map((p) => p.id),
    };
}

/** The pitch, drawn the way it is always drawn. */
function boardClaim(t) {
    return board('claim', [
        textPart('h', t.claimH, { at: [540, 580], font: `800 32px ${FONT}`, fill: 'dim',
                                  alpha: 0, z: 60 }),
        rectPart('plate', 880, 300, { at: [540, 800], fill: 'paperLit', stroke: 'warn',
                                      strokeWidth: 7, alpha: 0, z: 10 }),
        textPart('big', t.claim, { at: [540, 772], font: `800 108px ${FONT}`, fill: 'warn',
                                   alpha: 0, z: 20, maxWidth: 840 }),
        textPart('sub', t.claimSub, { at: [540, 876], font: `800 32px ${FONT}`, fill: 'ink',
                                      alpha: 0, z: 20, maxWidth: 840 }),
    ]);
}

/**
 * The demolition. The most important board in the series.
 *
 * Three rows and a verdict, and the verdict is a STAT rather than a fourth
 * row, because the whole point is that the last line is a different kind of
 * thing from the three above it: they are the setup, it is the answer.
 */
function boardMath(t) {
    const rows = cardRows('mr', t.mathRows, { top: 620, h: 152, gap: 18 });
    return {
        ...board('math', [
            textPart('h', t.mathH, { at: [540, 560], font: `800 34px ${FONT}`, fill: 'ink',
                                     alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0,
                                     lineHeight: 42 }),
            ...rows.parts,
            ...statParts('net', t.netV, t.netC, { at: [540, 1182], fill: 'warn', size: 96 }),
        ]),
        rows,
    };
}

function boardReal(t) {
    const rows = cardRows('rr', t.realRows, { top: 600, h: 160, gap: 18 });
    return {
        ...board('real', [
            textPart('h', t.realH, { at: [540, 540], font: `800 36px ${FONT}`, fill: 'ink',
                                     alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0 }),
            ...rows.parts,
        ]),
        rows,
    };
}

/** The number the industry would rather you did not look up. */
function boardHonest(t) {
    return board('honest', [
        textPart('h', t.honestH, { at: [540, 620], font: `800 34px ${FONT}`, fill: 'dim',
                                   alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0 }),
        ...statParts('n', t.honestV, t.honestC, { at: [540, 820], fill: 'warn', size: 148 }),
        ...markParts('tick', true, [540, 1132], { size: 56 }),
    ]);
}

// ---------------------------------------------------------------------------
// The part
// ---------------------------------------------------------------------------

export function partOne(lang) {
    const t = T[lang];
    const P = P1[lang];

    const size = boardSize(t);
    const claim = boardClaim(t);
    const math = boardMath(t);
    const real = boardReal(t);
    const honest = boardHonest(t);
    const card = endCard(lang, 1, t.next);
    const ban = bannerParts(lang, 1);
    const grain = grainParts('gr');
    const titles = board('titles', hookTitle(t.kicker, t.title, t.sub));

    const boards = [size, claim, math, real, honest, titles,
                    board('card', card.parts), board('ban', ban), board('grain', grain)];

    const characters = { ...CHARACTERS };
    for (const b of boards) characters[b.name] = effect(b.parts, { palette: 'fx' });

    /**
     * The banner and the paper grain, cast into every scene but the end card.
     *
     * No action raises either: their parts are authored opaque, because a
     * board re-cast in a new scene starts with every part back at alpha 0 and
     * a reveal in scene one does nothing for scene two.
     */
    const withBan = (cast) => [
        castBoard('grain', { alpha: 1 }), ...cast, castBoard('ban', { alpha: 1 })];

    const PAPER = { color: FX_PALETTE.paper };

    const scenes = [
        // --- the concession ------------------------------------------------
        {
            id: 'open', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'fade', from: '#eef0e2', duration: 0.5 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([
                stand('amara', 700, H_AMARA),
                stand('juma', 360, H_JUMA),
                castBoard('titles', { alpha: 1 }),
            ]),
            shots: [
                // The hook carries no title: a card in the first two seconds
                // spends the window the platform gives you. 27-RETENTION.md.
                { id: 'o0', dialogue: [says('juma', P[0], 0.15)],
                  actions: [
                      ...gesture('juma', 'doubt', 0.1, { hold: 1.4 }),
                      ...inkBlinks('amara', 3, 11),
                  ] },
                { id: 'o1', dialogue: [says('amara', P[1], 0.2)],
                  actions: [
                      ...gesture('amara', 'present', 0.2, { hold: 1.6 }),
                      ...build('titles', ['kicker', 'title', 'titlesub'],
                               titleAt(P[1], lang), { gap: 0.2, span: 0.45 }),
                      ...inkBlinks('juma', 5, 23),
                  ] },
            ],
        },

        // --- the market is real ---------------------------------------------
        {
            id: 'size', palette: 'fx',
            background: PAPER,
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('size', { alpha: 1 })]),
            shots: [
                { id: 's0', dialogue: [vo(P[2], 0.15)],
                  actions: [
                      ...reveal('size', 'h', 0.15, { span: 0.35 }),
                      ...pop('size', 'big_v', 0.7, { span: 0.5 }),
                      ...reveal('size', 'big_c', 1.5, { span: 0.4 }),
                  ] },
                // The chain of people whose money is actually in it, landing
                // on the viewer. "you, last" arrives on the clause that says
                // the market does not know they exist, which is the only
                // place the joke works.
                { id: 's1', dialogue: [vo(P[3], 0.15)],
                  actions: [
                      ...reveal('size', 'rule', 0.2, { span: 0.3 }),
                      ...build('size', size.whoIds.slice(0, 3), 0.4,
                               { gap: 0.35, span: 0.28 }),
                      ...reveal('size', size.whoIds[3], 3.2, { span: 0.4 }),
                  ] },
            ],
        },

        // --- the pitch ------------------------------------------------------
        {
            id: 'claim', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([
                stand('hype', 540, H_HYPE * 0.78),
                castBoard('claim', { alpha: 1 }),
            ]),
            shots: [
                { id: 'c0', dialogue: [says('hype', P[4], 0.15)],
                  actions: [
                      // The shades come in on the first frame he is seen: he
                      // is a running character across four parts and has to
                      // be identifiable in one frame.
                      ...reveal('hype', 'shades', 0, { span: 0.01 }),
                      ...gesture('hype', 'cheer', 0.1, { hold: 1.6, span: 0.3 }),
                      ...reveal('claim', 'h', 0.15, { span: 0.25 }),
                      ...pop('claim', 'plate', 0.35, { span: 0.3, overshoot: 0.06 }),
                      ...pop('claim', 'big', 0.5, { span: 0.4 }),
                      ...reveal('claim', 'sub', 1.1, { span: 0.3 }),
                  ] },
            ],
        },

        // --- the arithmetic that kills it -------------------------------------
        {
            id: 'math', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('math', { alpha: 1 })]),
            shots: [
                { id: 'm0', dialogue: [vo(P[5], 0.15)],
                  actions: reveal('math', 'h', 0.2, { span: 0.4 }) },
                { id: 'm1', dialogue: [vo(P[6], 0.15)],
                  actions: build('math', math.rows.rowIds(0), 0.3, { gap: 0.1, span: 0.35 }) },
                { id: 'm2', dialogue: [vo(P[7], 0.15)],
                  actions: [
                      ...build('math', math.rows.rowIds(1), 0.25, { gap: 0.1, span: 0.35 }),
                      ...build('math', math.rows.rowIds(2), 1.9, { gap: 0.1, span: 0.35 }),
                  ] },
                // The verdict gets its OWN shot. It is the punchline of the
                // whole part, and sharing a shot with the two rows that set
                // it up put it on screen while the narration was still
                // reading them out.
                { id: 'm3', dialogue: [vo(P[8], 0.15)],
                  actions: [
                      ...pop('math', 'net_v', 0.3, { span: 0.45 }),
                      ...reveal('math', 'net_c', 2.0, { span: 0.4 }),
                  ] },
            ],
        },

        // --- what win rate is actually worth ----------------------------------
        {
            id: 'verdict', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([
                stand('amara', 540, H_AMARA * 1.06),
            ]),
            shots: [
                { id: 'v0', dialogue: [says('amara', P[9], 0.2)],
                  actions: [
                      ...gesture('amara', 'sure', 0.2, { hold: 2.0 }),
                      ...inkBlinks('amara', 6, 5),
                  ] },
            ],
        },

        // --- so who does make money -------------------------------------------
        {
            id: 'who', palette: 'fx',
            background: PAPER,
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([
                stand('amara', 700, H_AMARA),
                stand('juma', 360, H_JUMA),
            ]),
            shots: [
                { id: 'w0', dialogue: [says('juma', P[10], 0.2)],
                  actions: [
                      ...gesture('juma', 'ask', 0.2, { hold: 1.0 }),
                      ...inkBlinks('amara', 4, 31),
                  ] },
                { id: 'w1', dialogue: [says('amara', P[11], 0.2)],
                  actions: [
                      ...gesture('amara', 'talk', 0.2, { hold: 1.4 }),
                      ...inkBlinks('juma', 4, 13),
                  ] },
            ],
        },

        // --- the boring four --------------------------------------------------
        {
            id: 'real', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('real', { alpha: 1 })]),
            shots: [
                { id: 'r0', dialogue: [vo(P[12], 0.15)],
                  actions: [
                      ...reveal('real', 'h', 0.15, { span: 0.35 }),
                      ...build('real', real.rows.rowIds(0), 0.5, { gap: 0.08, span: 0.3 }),
                      ...build('real', real.rows.rowIds(1), 1.5, { gap: 0.08, span: 0.3 }),
                      ...build('real', real.rows.rowIds(2), 2.5, { gap: 0.08, span: 0.3 }),
                      ...build('real', real.rows.rowIds(3), 3.5, { gap: 0.08, span: 0.3 }),
                  ] },
            ],
        },

        // --- the number they have to print ------------------------------------
        {
            id: 'honest', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('honest', { alpha: 1 })]),
            shots: [
                { id: 'h0', dialogue: [vo(P[13], 0.15)],
                  actions: [
                      ...reveal('honest', 'h', 0.2, { span: 0.4 }),
                      ...pop('honest', 'n_v', 1.6, { span: 0.5 }),
                      ...reveal('honest', 'n_c', 2.6, { span: 0.4 }),
                  ] },
                // The tick belongs to THIS line, not to the number: it marks
                // the turn from "here is the bad news" to "and it is still
                // worth doing", which is the sentence the whole series rests
                // on.
                { id: 'h1', dialogue: [vo(P[14], 0.15)],
                  actions: reveal('honest', 'tick', 0.6, { span: 0.35 }) },
            ],
        },

        // --- the thesis --------------------------------------------------------
        {
            id: 'thesis', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.4 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([
                stand('amara', 540, H_AMARA * 1.06),
            ]),
            shots: [
                { id: 't0', dialogue: [says('amara', P[15], 0.2)],
                  actions: [
                      ...gesture('amara', 'present', 0.2, { hold: 2.2 }),
                      ...inkBlinks('amara', 6, 17),
                  ] },
            ],
        },

        // --- the card -----------------------------------------------------------
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
