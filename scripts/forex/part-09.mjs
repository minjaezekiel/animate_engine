/**
 * Part 9 — "The only maths that matters" / "Hesabu pekee ya maana".
 *
 * Expectancy and position sizing. This is the spine of the series, the part
 * every other part was clearing ground for, and the direct answer to the
 * brief that asked for "something that works 95% of the time".
 *
 * ## The arithmetic, checked
 *
 * Expectancy per trade, in units of R (R = the amount risked):
 *
 *     E = (win% x reward_in_R) - (loss% x 1)
 *
 *   - 40% at 1:3   ->  0.40 x 3   - 0.60 x 1  =  1.20 - 0.60  =  +0.60 R
 *   - 95% at 1:0.05 ->  0.95 x 0.05 - 0.05 x 1  =  0.0475 - 0.05 = -0.0025 R
 *
 * The second line is deliberately the SAME trade part one demolished -- risk
 * 100 to make 5 -- restated in R so the two parts agree to the last decimal.
 * A viewer who works it out by hand across both films gets the same answer,
 * which is the only kind of consistency that earns trust on this subject.
 *
 * The drawdown figure is likewise exact: a 50% loss requires a 100% gain to
 * recover, because 0.5 x 2 = 1. That asymmetry is the entire argument for
 * risking 1%, and it is why "slow" is the feature rather than the cost.
 *
 * ## The position-sizing formula
 *
 *     lots = (account x risk%) / (stop_in_pips x pip_value_per_lot)
 *
 * Worked on screen with round numbers: a $2,000 account risking 1% is $20;
 * a 25-pip stop on a standard lot is $10 a pip, so $20 / (25 x 10) = 0.08
 * lots. The important part is the DIRECTION of the calculation -- the stop
 * comes first and the size falls out of it. Beginners do it backwards,
 * choosing a lot size they like and then placing the stop wherever it leaves
 * room, which is how position size ends up uncorrelated with risk.
 */
import {
    FONT, L, M, SAFE, build, effect, pathPart, pop, rectPart, reveal, textPart,
} from '../lib/diagram.mjs';
import {
    CHARACTERS, FX_PALETTE, H_AMARA, H_JUMA, META, offstage, says, stand, vo, voicesFor,
} from '../lib/forex.mjs';
import {
    bannerParts, board, cardRows, castBoard, endCard, equityParts, fitShots, gesture,
    grainParts, hookTitle, inkBlinks, markParts, rrParts, statParts, titleAt,
} from './common.mjs';

const P9 = {
    en: [
        /* 0 */ 'This is the part that turns gambling into a business. It is also the part '
            + 'nobody sells.',
        /* 1 */ 'One number decides whether you make money. It is called expectancy.',
        /* 2 */ 'Win rate times average win, minus loss rate times average loss.',
        /* 3 */ 'Lose six times out of ten, win four — but win three times what you risk.',
        /* 4 */ 'Point four times three is one point two. Point six times one is point six. '
            + 'You are up.',
        /* 5 */ 'Plus nought point six per trade, losing most of them.',
        /* 6 */ 'Now the man from part one. Ninety-five percent right, risking a hundred '
            + 'to make five.',
        /* 7 */ 'Minus nought point two five percent per trade. He wins almost always and '
            + 'still goes broke.',
        /* 8 */ 'That is the whole answer to "how often does it win". It was the wrong '
            + 'question.',
        /* 9 */ 'Now the practical half. Risk the same small percentage every time. One '
            + 'percent.',
        /*10 */ 'At one percent, ten losses in a row costs you ten percent. Not your '
            + 'account.',
        /*11 */ 'And size the position from the STOP, not from a lot size you fancied.',
        /*12 */ 'Account times one percent, divided by the stop, divided by the pip value.',
        /*13 JUMA  */ 'One percent feels painfully slow.',
        /*14 AMARA */ 'Losing half your account needs a hundred percent to get back. Slow '
            + 'is the point.',
        /*15 AMARA */ 'This is the part that makes it a business.',
        /*16 LOOP */ 'Next — the routine that puts all ten parts together.',
    ],
    sw: [
        /* 0 */ 'Hii ndiyo sehemu inayogeuza kamari kuwa biashara. Pia ndiyo sehemu '
            + 'hakuna anayeiuza.',
        /* 1 */ 'Namba moja inaamua kama unapata faida. Inaitwa expectancy.',
        /* 2 */ 'Kiwango cha ushindi mara wastani wa faida, toa kiwango cha hasara mara '
            + 'wastani wa hasara.',
        /* 3 */ 'Poteza mara sita kati ya kumi, shinda nne — lakini shinda mara tatu ya '
            + 'uliyohatarisha.',
        /* 4 */ 'Nukta nne mara tatu ni moja nukta mbili. Nukta sita mara moja ni nukta '
            + 'sita. Uko juu.',
        /* 5 */ 'Pamoja na nukta sita kwa kila biashara, ukipoteza nyingi kati yake.',
        /* 6 */ 'Sasa yule wa sehemu ya kwanza. Sahihi asilimia tisini na tano, '
            + 'anahatarisha mia kupata tano.',
        /* 7 */ 'Hasara ya asilimia nukta mbili tano kwa biashara. Anashinda karibu kila '
            + 'mara na bado anafilisika.',
        /* 8 */ 'Hilo ndilo jibu lote la "inashinda mara ngapi". Lilikuwa swali baya.',
        /* 9 */ 'Sasa upande wa vitendo. Hatarisha asilimia ndogo ileile kila mara. '
            + 'Asilimia moja.',
        /*10 */ 'Kwa asilimia moja, hasara kumi mfululizo inakugharimu asilimia kumi. Si '
            + 'akaunti yako.',
        /*11 */ 'Na pima ukubwa kutoka kwenye STOP, si kutoka kwenye lot uliyoipenda.',
        /*12 */ 'Akaunti mara asilimia moja, gawanya kwa stop, gawanya kwa thamani ya pip.',
        /*13 JUMA  */ 'Asilimia moja inaonekana polepole mno.',
        /*14 AMARA */ 'Kupoteza nusu ya akaunti kunahitaji asilimia mia kurudi. Polepole '
            + 'ndiyo lengo.',
        /*15 AMARA */ 'Hii ndiyo sehemu inayoifanya kuwa biashara.',
        /*16 LOOP */ 'Sehemu ijayo — utaratibu unaounganisha sehemu zote kumi.',
    ],
};

const T = {
    en: {
        kicker: 'READING THE MARKET  ·  PART 9',
        title: 'The only maths that matters',
        sub: 'expectancy, and one percent',

        formH: 'EXPECTANCY',
        form: '(  WIN%  ×  AVG WIN  )   −   (  LOSS%  ×  AVG LOSS  )',
        formNote: 'everything else in this series feeds this one line',

        rrH: 'LOSE SIX OUT OF TEN. STILL WIN.',
        rrLabels: { entry: 'ENTRY', stop: 'STOP  −1R', target: 'TARGET  +3R' },
        rrMath: '0.4 × 3  =  1.2        0.6 × 1  =  0.6',
        rrNet: '+0.60R', rrNetC: 'per trade, losing most of them',

        badH: 'AND THE MAN FROM PART ONE',
        badMath: '0.95 × 0.05  =  0.0475        0.05 × 1  =  0.05',
        badNet: '−0.0025R', badNetC: 'right 95% of the time. Broke anyway.',

        sizeH: 'SIZE COMES FROM THE STOP',
        sizeRows: [
            ['1  ·  ACCOUNT × RISK%', '$2,000 × 1%  =  $20 at risk', '#2b4f7a'],
            ['2  ·  ÷ STOP IN PIPS', '$20 ÷ 25 pips  =  $0.80 per pip', '#9a6a0d'],
            ['3  ·  ÷ PIP VALUE', '$0.80 ÷ $10  =  0.08 lots', '#15663f'],
        ],
        sizeWarn: 'never the other way round',

        drawH: 'WHY ONE PERCENT',
        drawV: '−50%  →  +100%',
        drawC: 'what it costs to get back to even',

        next: 'Next — Part 10:\nthe routine, and the checklist',
    },
    sw: {
        kicker: 'KUSOMA SOKO  ·  SEHEMU 9',
        title: 'Hesabu pekee ya maana',
        sub: 'expectancy, na asilimia moja',

        formH: 'EXPECTANCY',
        form: '(  USHINDI%  ×  FAIDA  )   −   (  HASARA%  ×  HASARA  )',
        formNote: 'kila kitu kingine kwenye mfululizo huu kinalisha mstari huu',

        rrH: 'POTEZA SITA KATI YA KUMI. BADO SHINDA.',
        rrLabels: { entry: 'KUINGIA', stop: 'STOP  −1R', target: 'LENGO  +3R' },
        rrMath: '0.4 × 3  =  1.2        0.6 × 1  =  0.6',
        rrNet: '+0.60R', rrNetC: 'kwa biashara, ukipoteza nyingi',

        badH: 'NA YULE WA SEHEMU YA KWANZA',
        badMath: '0.95 × 0.05  =  0.0475        0.05 × 1  =  0.05',
        badNet: '−0.0025R', badNetC: 'sahihi 95% ya muda. Amefilisika.',

        sizeH: 'UKUBWA UNATOKANA NA STOP',
        sizeRows: [
            ['1  ·  AKAUNTI × HATARI%', '$2,000 × 1%  =  $20 hatarini', '#2b4f7a'],
            ['2  ·  ÷ STOP KWA PIP', '$20 ÷ pip 25  =  $0.80 kwa pip', '#9a6a0d'],
            ['3  ·  ÷ THAMANI YA PIP', '$0.80 ÷ $10  =  lot 0.08', '#15663f'],
        ],
        sizeWarn: 'kamwe si kinyume chake',

        drawH: 'KWA NINI ASILIMIA MOJA',
        drawV: '−50%  →  +100%',
        drawC: 'gharama ya kurudi pale ulipoanzia',

        next: 'Sehemu ya 10:\nutaratibu, na orodha ya ukaguzi',
    },
};

// ---------------------------------------------------------------------------

function boardForm(t) {
    return board('form', [
        textPart('h', t.formH, { at: [540, 640], font: `800 56px ${FONT}`, fill: 'ink',
                                 alpha: 0, z: 60 }),
        rectPart('bg', 940, 150, { at: [540, 800], fill: 'paperLit', stroke: 'ink',
                                   strokeWidth: 5, alpha: 0, z: 10 }),
        textPart('f', t.form, { at: [540, 800], font: `800 30px ${FONT}`, fill: 'ink',
                                alpha: 0, z: 20, maxWidth: 900, lineHeight: 42 }),
        textPart('n', t.formNote, { at: [540, 940], font: `800 29px ${FONT}`, fill: 'gold',
                                    alpha: 0, z: 30, maxWidth: SAFE.x1 - SAFE.x0,
                                    lineHeight: 38 }),
    ]);
}

/**
 * The good trade, drawn to scale.
 *
 * `rrParts` sizes the bars from `risk` and `reward`, so a 1:3 on screen is
 * literally three times as tall as its stop. The teaching is entirely in that
 * proportion: a diagram where the two look similar argues the opposite of the
 * narration carrying it.
 */
function boardRr(t) {
    const rr = rrParts('g', {
        risk: 1, reward: 3, entryY: 1010, unit: 112, labels: t.rrLabels,
        x0: 260, w: 380,
    });
    return {
        ...board('rr', [
            textPart('h', t.rrH, { at: [540, 500], font: `800 33px ${FONT}`, fill: 'ink',
                                   alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0 }),
            ...rr.parts,
            textPart('m', t.rrMath, { at: [540, 1186], font: `800 28px ${FONT}`,
                                      fill: 'dim', alpha: 0, z: 60,
                                      maxWidth: SAFE.x1 - SAFE.x0 }),
            ...statParts('net', t.rrNet, t.rrNetC, { at: [540, 1286], fill: 'good',
                                                     size: 70 }),
        ]),
        rr,
    };
}

/** The same arithmetic, applied to the pitch from part one. */
function boardBad(t) {
    return board('bad', [
        textPart('h', t.badH, { at: [540, 620], font: `800 34px ${FONT}`, fill: 'dim',
                                alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0 }),
        textPart('m', t.badMath, { at: [540, 740], font: `800 28px ${FONT}`, fill: 'dim',
                                   alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0 }),
        ...statParts('n', t.badNet, t.badNetC, { at: [540, 880], fill: 'warn', size: 118 }),
        ...markParts('x', false, [540, 1066], { size: 60 }),
    ]);
}

function boardSize(t) {
    const rows = cardRows('sr', t.sizeRows, { top: 614, h: 152, gap: 20 });
    return {
        ...board('size', [
            textPart('h', t.sizeH, { at: [540, 556], font: `800 36px ${FONT}`, fill: 'ink',
                                     alpha: 0, z: 60, maxWidth: SAFE.x1 - SAFE.x0 }),
            ...rows.parts,
            textPart('w', t.sizeWarn, { at: [540, 1172], font: `800 32px ${FONT}`,
                                        fill: 'warn', alpha: 0, z: 60,
                                        maxWidth: SAFE.x1 - SAFE.x0 }),
        ]),
        rows,
    };
}

function boardDraw(t) {
    return board('draw', [
        textPart('h', t.drawH, { at: [540, 660], font: `800 34px ${FONT}`, fill: 'dim',
                                 alpha: 0, z: 60 }),
        ...statParts('d', t.drawV, t.drawC, { at: [540, 840], fill: 'warn', size: 100 }),
    ]);
}

// ---------------------------------------------------------------------------

export function partNine(lang) {
    const t = T[lang];
    const P = P9[lang];

    const form = boardForm(t);
    const rr = boardRr(t);
    const bad = boardBad(t);
    const size = boardSize(t);
    const draw = boardDraw(t);
    const card = endCard(lang, 9, t.next);
    const ban = bannerParts(lang, 9);
    const grain = grainParts('gr', { seed: 367 });
    const titles = board('titles', hookTitle(t.kicker, t.title, t.sub));

    const boards = [form, rr, bad, size, draw, titles,
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
                      ...gesture('amara', 'sure', 0.15, { hold: 1.6 }),
                      ...build('titles', ['kicker', 'title', 'titlesub'],
                               titleAt(P[0], lang), { gap: 0.2, span: 0.45 }),
                      ...inkBlinks('amara', 5, 373),
                  ] },
            ],
        },

        {
            id: 'form', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('form', { alpha: 1 })]),
            shots: [
                { id: 'f0', dialogue: [vo(P[1], 0.15)],
                  actions: pop('form', 'h', 0.3, { span: 0.45 }) },
                { id: 'f1', dialogue: [vo(P[2], 0.15)],
                  actions: [
                      ...reveal('form', 'bg', 0.2, { span: 0.3 }),
                      ...reveal('form', 'f', 0.5, { span: 0.4 }),
                      ...reveal('form', 'n', 2.4, { span: 0.4 }),
                  ] },
            ],
        },

        // --- the good trade -----------------------------------------------------
        {
            id: 'rr', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('rr', { alpha: 1 })]),
            shots: [
                { id: 'g0', dialogue: [vo(P[3], 0.15)],
                  actions: [
                      ...reveal('rr', 'h', 0.15, { span: 0.3 }),
                      ...build('rr', rr.rr.entryIds, 0.5, { gap: 0.12, span: 0.3 }),
                      ...build('rr', rr.rr.riskIds, 1.2, { gap: 0.1, span: 0.3 }),
                      ...build('rr', rr.rr.rewardIds, 2.6, { gap: 0.1, span: 0.35 }),
                  ] },
                { id: 'g1', dialogue: [vo(P[4], 0.15)],
                  actions: reveal('rr', 'm', 0.4, { span: 0.4 }) },
                { id: 'g2', dialogue: [vo(P[5], 0.15)],
                  actions: [
                      ...pop('rr', 'net_v', 0.3, { span: 0.45 }),
                      ...reveal('rr', 'net_c', 1.2, { span: 0.4 }),
                  ] },
            ],
        },

        // --- the callback to part one -------------------------------------------
        {
            id: 'bad', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('bad', { alpha: 1 })]),
            shots: [
                { id: 'b0', dialogue: [vo(P[6], 0.15)],
                  actions: [
                      ...reveal('bad', 'h', 0.15, { span: 0.3 }),
                      ...reveal('bad', 'm', 1.2, { span: 0.4 }),
                  ] },
                { id: 'b1', dialogue: [vo(P[7], 0.15)],
                  actions: [
                      ...pop('bad', 'n_v', 0.3, { span: 0.45 }),
                      ...reveal('bad', 'n_c', 1.4, { span: 0.4 }),
                      ...reveal('bad', 'x', 2.4, { span: 0.3 }),
                  ] },
                { id: 'b2', dialogue: [vo(P[8], 0.15)], actions: [] },
            ],
        },

        {
            id: 'size', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([offstage('amara'), castBoard('size', { alpha: 1 })]),
            shots: [
                // Row one arrives on the line about one percent, not on the
                // line about the stop. It IS the one-percent step
                // ("$2,000 x 1% = $20"), and holding it back left two
                // consecutive shots -- eleven seconds -- playing over a bare
                // heading. Phase 34 lost two scenes to exactly that.
                { id: 's0', dialogue: [vo(P[9], 0.15)],
                  actions: [
                      ...reveal('size', 'h', 0.2, { span: 0.35 }),
                      ...build('size', size.rows.rowIds(0), 1.4, { gap: 0.08, span: 0.3 }),
                  ] },
                { id: 's1', dialogue: [vo(P[10], 0.15)],
                  actions: pop('size', 'w', 1.2, { span: 0.4 }) },
                { id: 's2', dialogue: [vo(P[11], 0.15)],
                  actions: build('size', size.rows.rowIds(1), 0.4, { gap: 0.08, span: 0.3 }) },
                { id: 's3', dialogue: [vo(P[12], 0.15)],
                  actions: build('size', size.rows.rowIds(2), 0.4, { gap: 0.08, span: 0.3 }) },
            ],
        },

        // --- why slow is the point ------------------------------------------------
        {
            id: 'draw', palette: 'fx',
            background: PAPER,
            transitionIn: { kind: 'crossfade', duration: 0.3 },
            transitionOut: { kind: 'crossfade', duration: 0.4 },
            cast: withBan([
                offstage('juma'), offstage('amara'), castBoard('draw', { alpha: 1 }),
            ]),
            shots: [
                { id: 'd0', dialogue: [says('juma', P[13], 0.15)],
                  actions: reveal('draw', 'h', 0.2, { span: 0.35 }) },
                { id: 'd1', dialogue: [says('amara', P[14], 0.15)],
                  actions: [
                      ...pop('draw', 'd_v', 0.3, { span: 0.45 }),
                      ...reveal('draw', 'd_c', 1.6, { span: 0.4 }),
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
                { id: 't0', dialogue: [says('amara', P[15], 0.2)],
                  actions: [...gesture('amara', 'present', 0.2, { hold: 1.6 }),
                            ...inkBlinks('amara', 5, 379)] },
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
