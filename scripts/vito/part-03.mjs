/**
 * Sehemu 3 — "Mto unakuambia".
 *
 * Weathering frees gems from their host rock; hardness and density mean they
 * survive the journey and concentrate where moving water loses energy. This
 * is the most immediately useful part of the series, because a river is where
 * an ordinary person can actually start, and it is also the part the engine's
 * `props.flow` was built for -- see docs/25-FLOW.md.
 *
 * Conventional placer geology: trap sites are the inside of bends, the eddy
 * behind an obstruction, bedrock riffles and crevices, the slack water at a
 * confluence, and where the gradient flattens. The pay layer sits in the
 * lowest gravel, on bedrock. Grains coarsen and become more angular toward
 * the source, which is what makes a placer a signpost as well as a deposit.
 *
 * One honest caveat is in the narration rather than only in this comment:
 * panning concentrates DENSE minerals, so it works for garnet, zircon,
 * sapphire and spinel, and does not work for emerald and the other beryls,
 * which are no denser than the quartz they travel with.
 */
import {
    L, M, build, conceal, effect, ellipsePart, pathPart, poly, pop, ramp,
    rectPart, reveal, smooth, textPart, labelParts,
} from '../lib/diagram.mjs';
import { GROUND_Y } from '../lib/diagram.mjs';
import {
    CHARACTERS, META, VITO_PALETTE, VOICES, offstage, says, vo,
} from '../lib/vito.mjs';
import {
    blinks, board, castBoard, cardRows, endCard, fitShots, hookTitle, statParts,
} from './common.mjs';

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const TALK_Y = Math.round(GROUND_Y - 274 * 1.5);

const P3 = [
    /* 0 HOOK */ 'Kama unataka kuanza kutafuta vito leo, usianze mlimani. Anza mtoni, '
        + 'kwa sababu mto tayari umeshafanya kazi ngumu kwa ajili yako.',
    /* 1 */ 'Vito havikai pale vilipozaliwa. Mvua, jua na mizizi vinavunja mwamba '
          + 'polepole kwa maelfu ya miaka.',
    /* 2 */ 'Mwamba unaozunguka kito unachakaa na kuyeyuka. Lakini kito chenyewe hakichakai.',
    /* 3 */ 'Hiyo ndiyo siri ya kwanza: vito ni vigumu. Mwamba wa kawaida unasagwa, kito '
          + 'kinabaki kama kilivyo.',
    /* 4 */ 'Siri ya pili ni uzito. Vito vingi ni vizito kuliko mchanga unaovisafirisha.',
    /* 5 */ 'Maji yanayotembea kwa kasi yanabeba vyote. Maji yanaposhuka kasi, kizito '
          + 'kinatua kwanza, na chepesi kinaendelea.',
    /* 6 */ 'Kwa hiyo vito vinakusanyika mahali ambapo maji yanapoteza nguvu. Na mahali '
          + 'hapo panajulikana.',
    /* 7 */ 'Moja: ndani ya kona. Maji ya nje yanakwenda kasi, ya ndani yanalegea, na '
          + 'hapo ndipo mchanga mzito unakaa.',
    /* 8 */ 'Mbili: nyuma ya jiwe kubwa. Maji yanazunguka, yanapumzika, na yanaacha '
          + 'mzigo wake hapo.',
    /* 9 */ 'Tatu: kwenye nyufa za mwamba wa chini. Nyufa hizo ni kama sanduku la '
          + 'kukamatia, zimejengwa na maumbile.',
    /*10 */ 'Nne: pale mto mdogo unapoingia kwenye mkubwa, na tano, pale bonde '
          + 'linapolalia na maji yanapopunguza mwendo.',
    /*11 BAKARI */ 'Nichimbe wapi basi? Mchanga wote unaonekana sawa kwangu.',
    /*12 NURU */ 'Chini kabisa. Vito vizito vinazama hadi vinagonga mwamba wa chini, na '
          + 'vinakaa kwenye nusu mita ya mwisho ya changarawe.',
    /*13 */ 'Tabaka hilo linaitwa tabaka la mali. Ndiyo maana wachimbaji wanachimba hadi '
          + 'mwambani, na kusafisha nyufa kwa mikono.',
    /*14 */ 'Na kuna jambo la mwisho ambalo ni muhimu kuliko yote.',
    /*15 */ 'Kito ulichokiokota mtoni kilitoka mahali fulani juu ya mto. Siku zote juu, '
          + 'kamwe si chini.',
    /*16 */ 'Panda mto taratibu. Chembe zikizidi kuwa kubwa na zenye pembe kali, '
          + 'unakaribia chanzo chake.',
    /*17 */ 'Kwa hiyo mto si tu mahali pa kupata vito. Ni ramani inayokuelekeza kwenye '
          + 'mwamba vilikotoka.',
    /*18 */ 'Lakini tahadhari moja: kuosha kwenye karai kunakusanya madini mazito tu. '
          + 'Zumaridi haina uzito zaidi ya mchanga, kwa hiyo haitakusanyika.',
    /*19 */ 'Sehemu inayofuata: dalili za ardhini, kwa yule anayetaka kwenda chanzoni.',
    /*20 */ 'Jambo lingine la vitendo: kiasi cha maji kinabadilika mwaka mzima, na mahali '
          + 'pa kutafuta pia panabadilika.',
    /*21 */ 'Baada ya mvua kubwa, mto unasogeza changarawe mpya na kufunua tabaka ambalo '
          + 'halikuwa linaonekana msimu uliopita.',
    /*22 */ 'Kwa hiyo mahali ulipotafuta mwaka jana si lazima pawe tupu mwaka huu. Mto '
          + 'unafanya kazi upya kila msimu wa mvua.',
];

// --- board: weathering releases the gem ------------------------------------

function boardFree() {
    const parts = [
        ...hookTitle('MADINI YA VITO  ·  SEHEMU 3', 'Mto unakuambia',
                     'kwa nini kuanza mtoni, si mlimani'),
        rectPart('hill', 1160, 520, { at: [540, 1060], fill: '#4a4336', alpha: 0, z: -20 }),
        pathPart('skyline', smooth([[-40, 820], [240, 742], [540, 790], [820, 726],
                                    [1120, 800]]),
                 { stroke: '#6a6150', strokeWidth: 10, alpha: 0, z: -19 }),
        // the vein at surface, breaking up
        pathPart('vein', smooth([[300, 980], [460, 930], [640, 950], [800, 900]]),
                 { stroke: 'quartz', strokeWidth: 34, alpha: 0, z: -10, lineCap: 'round' }),
        textPart('rainH', 'MVUA  ·  JUA  ·  MIZIZI', { at: [540, 640],
            font: `700 31px ${FONT}`, fill: 'dim', alpha: 0, z: 40 }),
    ];
    for (let i = 0; i < 16; i++) {
        const x = 90 + i * 60;
        parts.push(pathPart(`rain${i}`, `${M(x, 690)} ${L(x - 16, 760)}`,
            { stroke: 'water', strokeWidth: 4, alpha: 0, z: 30, lineCap: 'round' }));
    }
    // gems freed from the broken vein
    const FREED = [[352, 1016], [470, 1052], [588, 1024], [700, 1064], [806, 1030]];
    FREED.forEach(([x, y], i) => {
        parts.push(pathPart(`fr${i}`, poly([[x - 20, y], [x, y - 26], [x + 20, y],
                                            [x, y + 26]], true),
            { fill: 'tanzanite', stroke: 'gem', strokeWidth: 3, alpha: 0, z: 40 }));
    });
    parts.push(textPart('freeT', 'MWAMBA UNACHAKAA — KITO HAKICHAKAI', {
        at: [540, 1280], font: `800 34px ${FONT}`, fill: 'gem', alpha: 0, z: 50,
        maxWidth: 940 }));
    return { ...board('free', parts), rainIds: Array.from({ length: 16 }, (_, i) => `rain${i}`),
             freedIds: FREED.map((_, i) => `fr${i}`) };
}

// --- board: hardness and density ------------------------------------------

function boardWhy() {
    const rows = cardRows('w', [
        ['UGUMU', 'Kito ni kigumu kuliko mwamba unaokizunguka.\nMwamba unasagwa; kito '
            + 'kinabaki.', '#5b7cfa'],
        ['UZITO', 'Vito vingi ni vizito kuliko mchanga.\nMaji yakishuka kasi, kizito '
            + 'kinatua kwanza.', '#ffc64d'],
    ], { top: 596, h: 186, gap: 26 });
    const parts = [
        textPart('wh', 'KWA NINI VITO VINABAKI?', { at: [540, 516],
            font: `800 40px ${FONT}`, fill: 'ink', alpha: 0, z: 50, maxWidth: 940 }),
        ...rows.parts,
    ];
    // a flume: fast water carries both, slow water drops the heavy one
    const FY = 1130;
    parts.push(
        rectPart('flume', 1000, 92, { at: [540, FY], fill: 'waterDeep', alpha: 0, z: 10 }),
        pathPart('fast', `${M(60, FY - 16)} ${L(1020, FY - 16)}`, {
            stroke: 'foam', strokeWidth: 7, alpha: 0, z: 12, lineCap: 'round',
            trim: { end: 0.3, length: 220 }, flow: 0 }),
        pathPart('fast2', `${M(60, FY + 14)} ${L(1020, FY + 14)}`, {
            stroke: 'water', strokeWidth: 5, alpha: 0, z: 12, lineCap: 'round',
            trim: { end: 0.24, length: 290 }, flow: 0 }),
        textPart('fastL', 'kasi', { at: [150, FY - 78], font: `700 27px ${FONT}`,
                                    fill: 'dim', alpha: 0, z: 40 }),
        textPart('slowL', 'polepole', { at: [900, FY - 78], font: `700 27px ${FONT}`,
                                        fill: 'dim', alpha: 0, z: 40 }),
    );
    // quartz travels on; the gem drops
    for (let i = 0; i < 7; i++) {
        parts.push(ellipsePart(`q${i}`, 9, 9, {
            at: [200 + i * 118, FY + 6], fill: '#cfc8b8', alpha: 0, z: 20 }));
    }
    parts.push(
        pathPart('drop', poly([[300, FY + 18], [318, FY - 6], [336, FY + 18],
                               [318, FY + 42]], true),
                 { fill: 'gem', stroke: 'ink', strokeWidth: 2.5, alpha: 0, z: 22 }),
        textPart('dropT', 'kizito kinatua kwanza', { at: [540, FY + 112],
            font: `800 31px ${FONT}`, fill: 'gold', alpha: 0, z: 40, maxWidth: 940 }),
    );
    return { ...board('why', parts), rows };
}

// --- board: the river in plan, with the five trap sites --------------------

function boardRiver() {
    // The channel, in plan view, running down the frame -- which is the right
    // orientation for 9:16 and lets the five trap sites stack as the
    // narration reaches them.
    const SPINE = [[300, 460], [720, 600], [320, 790], [760, 980],
                   [340, 1180], [700, 1340]];
    const WID = 190;
    const half = WID / 2;
    const bankL = SPINE.map(([x, y]) => [x - half, y]);
    const bankR = SPINE.map(([x, y]) => [x + half, y]);
    const parts = [
        rectPart('land', 1160, 1060, { at: [540, 900], fill: '#3a4432', alpha: 0, z: -30 }),
        pathPart('water', `${smooth(bankL)} L${bankR[bankR.length - 1][0]},`
            + `${bankR[bankR.length - 1][1]} `
            + `${smooth([...bankR].reverse()).replace(/^M[^C]*/, '')} Z`,
            { fill: 'waterDeep', alpha: 0, z: -20 }),
    ];
    // four lanes of current: fastest mid-channel, slowest at the banks, which
    // is the whole mechanism the trap sites depend on
    [[0, 0.30, 9, 'foam', 230], [-0.45, 0.24, 7, 'water', 300],
     [0.45, 0.24, 7, 'water', 300], [-0.8, 0.16, 5, 'water', 380]]
        .forEach(([u, dash, lw, col, len], i) => {
            parts.push(pathPart(`cur${i}`,
                smooth(SPINE.map(([x, y]) => [x + u * half, y])), {
                    stroke: col, strokeWidth: lw, alpha: 0, z: -10 + i, lineCap: 'round',
                    trim: { end: dash, length: len }, flow: 0 }));
        });
    // the obstruction, and the bedrock bar
    parts.push(
        ellipsePart('rock', 44, 36, { at: [560, 886], fill: '#6e6757', stroke: '#8f8676',
                                      strokeWidth: 3, alpha: 0, z: 10 }),
        pathPart('riffle', `${M(250, 1180)} ${L(430, 1180)}`,
                 { stroke: '#6e6757', strokeWidth: 16, alpha: 0, z: 10, lineCap: 'butt' }),
        pathPart('trib', smooth([[940, 820], [860, 920], [790, 980]]),
                 { stroke: 'waterDeep', strokeWidth: 60, alpha: 0, z: -21,
                   lineCap: 'round' }),
    );
    // five numbered trap markers
    const TRAPS = [
        ['t1', 362, 622, '1'], ['t2', 592, 940, '2'], ['t3', 340, 1180, '3'],
        ['t4', 792, 1000, '4'], ['t5', 520, 1330, '5'],
    ];
    TRAPS.forEach(([id, x, y, n]) => {
        parts.push(
            ellipsePart(`${id}`, 30, 30, { at: [x, y], fill: 'gold', alpha: 0, z: 50 }),
            textPart(`${id}_n`, n, { at: [x, y], font: `800 32px ${FONT}`,
                                     fill: '#1a1205', alpha: 0, z: 51 }),
        );
    });
    parts.push(textPart('trapH', 'MAHALI MAJI YANAPOPOTEZA NGUVU', {
        at: [540, 1430], font: `800 33px ${FONT}`, fill: 'gold', alpha: 0, z: 60,
        maxWidth: 940 }));
    return { ...board('river', parts),
             curIds: [0, 1, 2, 3].map((i) => `cur${i}`),
             trap: (i) => [TRAPS[i][0], `${TRAPS[i][0]}_n`] };
}

// --- board: the pay layer, in section --------------------------------------

function boardPay() {
    const parts = [
        textPart('ph', 'TABAKA LA MALI', { at: [540, 528], font: `800 42px ${FONT}`,
                                           fill: 'gold', alpha: 0, z: 50 }),
        rectPart('ovb', 1160, 190, { at: [540, 690], fill: '#6b5a44', alpha: 0, z: 10 }),
        textPart('ovbL', 'udongo wa juu', { at: [96, 690], font: `700 28px ${FONT}`,
            fill: '#17120c', align: 'left', alpha: 0, z: 12 }),
        rectPart('grv', 1160, 260, { at: [540, 916], fill: '#8a8070', alpha: 0, z: 10 }),
        textPart('grvL', 'changarawe', { at: [96, 916], font: `700 28px ${FONT}`,
            fill: '#17120c', align: 'left', alpha: 0, z: 12 }),
        rectPart('pay', 1160, 76, { at: [540, 1084], fill: 'gold', alpha: 0, z: 11 }),
        textPart('payL', 'tabaka la mali', { at: [96, 1084], font: `800 30px ${FONT}`,
            fill: '#1a1205', align: 'left', alpha: 0, z: 13 }),
        rectPart('bed', 1160, 230, { at: [540, 1237], fill: '#4a4438', alpha: 0, z: 10 }),
        textPart('bedL', 'mwamba wa chini', { at: [96, 1200], font: `700 28px ${FONT}`,
            fill: '#d8d2c4', align: 'left', alpha: 0, z: 12 }),
    ];
    // gems resting on bedrock, in the crevices
    for (let i = 0; i < 9; i++) {
        const x = 150 + i * 96;
        parts.push(pathPart(`pg${i}`, poly([[x - 15, x % 2 ? 1082 : 1092],
                                            [x, (x % 2 ? 1082 : 1092) - 20],
                                            [x + 15, x % 2 ? 1082 : 1092],
                                            [x, (x % 2 ? 1082 : 1092) + 20]], true),
            { fill: 'tanzanite', stroke: 'ink', strokeWidth: 2, alpha: 0, z: 20 }));
    }
    parts.push(textPart('payT', 'CHIMBA HADI MWAMBANI. SAFISHA NYUFA.', {
        at: [540, 1420], font: `800 34px ${FONT}`, fill: 'ink', alpha: 0, z: 50,
        maxWidth: 940 }));
    return { ...board('pay', parts), gemIds: Array.from({ length: 9 }, (_, i) => `pg${i}`) };
}

// --- board: follow it upstream --------------------------------------------

function boardUp() {
    const line = [[160, 1300], [360, 1120], [300, 940], [520, 800], [460, 640], [680, 520]];
    const parts = [
        rectPart('bg2', 1160, 1020, { at: [540, 920], fill: '#333d2c', alpha: 0, z: -30 }),
        pathPart('ch', smooth(line), { stroke: 'waterDeep', strokeWidth: 92, alpha: 0,
                                       z: -20, lineCap: 'round' }),
        pathPart('cf', smooth(line), {
            stroke: 'water', strokeWidth: 10, alpha: 0, z: -18, lineCap: 'round',
            trim: { end: 0.22, length: 280 }, flow: 0 }),
        textPart('uh', 'CHEMBE ZINAKUA UKIPANDA', { at: [540, 470],
            font: `800 36px ${FONT}`, fill: 'ink', alpha: 0, z: 50, maxWidth: 940 }),
    ];
    // grains getting larger and more angular toward the source
    const SIZES = [8, 11, 15, 20, 27, 36];
    line.forEach(([x, y], i) => {
        const r = SIZES[i];
        parts.push(pathPart(`gr${i}`, i < 2
            ? poly([[x - r, y], [x, y - r], [x + r, y], [x, y + r]], true)
            : poly([[x - r, y - r * 0.4], [x - r * 0.3, y - r], [x + r * 0.8, y - r * 0.6],
                    [x + r, y + r * 0.5], [x - r * 0.2, y + r]], true),
            { fill: 'tanzanite', stroke: 'gem', strokeWidth: 2.5, alpha: 0, z: 20 }));
    });
    parts.push(
        pathPart('src', poly([[640, 470], [760, 480], [790, 560], [700, 600],
                              [618, 548]], true),
                 { fill: 'quartz', stroke: 'ink', strokeWidth: 3, alpha: 0, z: 30 }),
        ...labelParts('srcL', 'chanzo: mwamba\nvilikotoka', [820, 640], [740, 574],
                      { font: `800 30px ${FONT}`, fill: 'gold', stroke: 'gold',
                        align: 'right', leadAt: [820, 700] }),
        textPart('upT', 'MTO NI RAMANI, SI TU MAHALI PA KUCHIMBA', {
            at: [540, 1430], font: `800 33px ${FONT}`, fill: 'gold', alpha: 0, z: 50,
            maxWidth: 940 }),
    );
    return { ...board('up', parts), grainIds: line.map((_, i) => `gr${i}`) };
}

export function partThree() {
    const free = boardFree();
    const why = boardWhy();
    const river = boardRiver();
    const pay = boardPay();
    const up = boardUp();
    const card = endCard('Inayofuata: dalili za ardhini');
    const boards = [free, why, river, pay, up, { ...board('card', card.parts) }];
    const characters = { ...CHARACTERS };
    for (const b of boards) characters[b.name] = effect(b.parts, { palette: 'vito' });

    const flow = (target, part, cycles, span) =>
        ramp(target, part, 'props.flow', 0, span, 0, cycles, { ease: 'linear' });

    const scenes = [
        {
            id: 'kuachiliwa', palette: 'vito',
            background: { color: VITO_PALETTE.bg },
            transitionIn: { kind: 'fade', from: '#000000', duration: 0.7 },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage('nuru'), castBoard('free', { alpha: 1 })],
            shots: [
                { id: 'a0', duration: 9.5, dialogue: [vo(P3[0], 0.3)],
                  camera: { from: { zoom: 1.06 }, to: { zoom: 1.0 }, ease: 'smooth' },
                  actions: [
                      ...reveal('free', 'hill', 0.2, { span: 0.5 }),
                      ...reveal('free', 'skyline', 0.4, { span: 0.5 }),
                      ...reveal('free', 'vein', 0.9, { span: 0.5 }),
                      ...build('free', ['kicker', 'title', 'titlesub'], 4.8,
                               { gap: 0.24, span: 0.5 }),
                  ] },
                { id: 'a1', duration: 8.0, dialogue: [vo(P3[1], 0.2)],
                  actions: [
                      ...reveal('free', 'rainH', 0.3, { span: 0.4 }),
                      ...build('free', free.rainIds, 0.6, { gap: 0.07, span: 0.3 }),
                  ] },
                { id: 'a2', duration: 7.0, dialogue: [vo(P3[2], 0.2)],
                  actions: build('free', free.freedIds, 1.0,
                                 { gap: 0.25, span: 0.4, how: pop }) },
                { id: 'a3', duration: 7.5, dialogue: [vo(P3[3], 0.2)],
                  actions: pop('free', 'freeT', 2.4, { span: 0.5 }) },
            ],
        },
        {
            id: 'sababu', palette: 'vito',
            background: { color: VITO_PALETTE.bg },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage('nuru'), castBoard('why', { alpha: 1 })],
            shots: [
                { id: 'b0', duration: 7.0, dialogue: [vo(P3[4], 0.2)],
                  actions: [
                      ...flow('why', 'fast', 14, 30), ...flow('why', 'fast2', 10, 30),
                      ...reveal('why', 'wh', 0.2, { span: 0.45 }),
                      ...build('why', why.rows.rowIds(0), 0.8, { gap: 0.1, span: 0.4 }),
                      ...build('why', why.rows.rowIds(1), 2.2, { gap: 0.1, span: 0.4 }),
                  ] },
                { id: 'b1', duration: 9.0, dialogue: [vo(P3[5], 0.2)],
                  actions: [
                      ...reveal('why', 'flume', 0.3, { span: 0.5 }),
                      ...build('why', ['fast', 'fast2'], 0.7, { gap: 0.15, span: 0.5 }),
                      ...build('why', ['fastL', 'slowL'], 1.2, { gap: 0.2, span: 0.4 }),
                      ...build('why', Array.from({ length: 7 }, (_, i) => `q${i}`), 2.0,
                               { gap: 0.12, span: 0.3 }),
                      ...pop('why', 'drop', 4.4, { span: 0.45 }),
                      ...pop('why', 'dropT', 5.2, { span: 0.5 }),
                  ] },
            ],
        },
        {
            id: 'mto', palette: 'vito',
            background: { color: '#1a2318' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage('nuru'), castBoard('river', { alpha: 1 })],
            shots: [
                { id: 'r0', duration: 7.5, dialogue: [vo(P3[6], 0.2)],
                  actions: [
                      ...flow('river', 'cur0', 24, 46), ...flow('river', 'cur1', 17, 46),
                      ...flow('river', 'cur2', 17, 46), ...flow('river', 'cur3', 11, 46),
                      ...reveal('river', 'land', 0.1, { span: 0.5 }),
                      ...reveal('river', 'trib', 0.4, { span: 0.5 }),
                      ...reveal('river', 'water', 0.5, { span: 0.6 }),
                      ...build('river', river.curIds, 1.0, { gap: 0.16, span: 0.5 }),
                  ] },
                { id: 'r1', duration: 8.5, dialogue: [vo(P3[7], 0.2)],
                  actions: build('river', river.trap(0), 2.0,
                                 { gap: 0.1, span: 0.4, how: pop }) },
                { id: 'r2', duration: 7.5, dialogue: [vo(P3[8], 0.2)],
                  actions: [
                      ...pop('river', 'rock', 0.8, { span: 0.4 }),
                      ...build('river', river.trap(1), 2.2,
                               { gap: 0.1, span: 0.4, how: pop }),
                  ] },
                { id: 'r3', duration: 7.5, dialogue: [vo(P3[9], 0.2)],
                  actions: [
                      ...reveal('river', 'riffle', 0.8, { span: 0.4 }),
                      ...build('river', river.trap(2), 2.0,
                               { gap: 0.1, span: 0.4, how: pop }),
                  ] },
                { id: 'r4', duration: 8.5, dialogue: [vo(P3[10], 0.2)],
                  actions: [
                      ...build('river', river.trap(3), 1.4,
                               { gap: 0.1, span: 0.4, how: pop }),
                      ...build('river', river.trap(4), 4.0,
                               { gap: 0.1, span: 0.4, how: pop }),
                      ...pop('river', 'trapH', 5.6, { span: 0.5 }),
                  ] },
            ],
        },
        {
            id: 'swali', palette: 'vito',
            background: { color: '#101a26' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [
                { character: 'nuru', as: 'nuru', at: [330, TALK_Y], scale: 1.5,
                  view: 'threeQuarter' },
                { character: 'bakari', as: 'bakari', at: [770, TALK_Y], scale: 1.5,
                  view: 'threeQuarter', facing: -1 },
            ],
            shots: [
                { id: 'q0', duration: 6.0, dialogue: [says('bakari', P3[11], 0.3)],
                  actions: [
                      { target: 'nuru', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'bakari', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'bakari', do: 'pose', pose: 'ask', at: 0.3, for: 0.6 },
                      ...blinks('nuru', 6.0, 17), ...blinks('bakari', 6.0, 37),
                  ] },
                { id: 'q1', duration: 8.0, dialogue: [says('nuru', P3[12], 0.3)],
                  actions: [
                      { target: 'nuru', do: 'pose', pose: 'present', at: 0.3, for: 0.7 },
                      ...blinks('nuru', 8.0, 53), ...blinks('bakari', 8.0, 71),
                  ] },
            ],
        },
        {
            id: 'tabaka', palette: 'vito',
            background: { color: '#14100b' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage('nuru'), castBoard('pay', { alpha: 1 })],
            shots: [
                { id: 'p0', duration: 8.5, dialogue: [vo(P3[13], 0.2)],
                  actions: [
                      ...reveal('pay', 'ph', 0.2, { span: 0.45 }),
                      ...build('pay', ['ovb', 'ovbL', 'grv', 'grvL', 'bed', 'bedL'], 0.6,
                               { gap: 0.18, span: 0.4 }),
                      ...reveal('pay', 'pay', 2.4, { span: 0.5 }),
                      ...reveal('pay', 'payL', 2.7, { span: 0.4 }),
                      ...build('pay', pay.gemIds, 3.4, { gap: 0.1, span: 0.3, how: pop }),
                      ...pop('pay', 'payT', 5.4, { span: 0.5 }),
                  ] },
            ],
        },
        {
            id: 'juu', palette: 'vito',
            background: { color: '#171d13' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage('nuru'), castBoard('up', { alpha: 1 })],
            shots: [
                { id: 'u0', duration: 5.5, dialogue: [vo(P3[14], 0.2)],
                  actions: [
                      ...flow('up', 'cf', 16, 34),
                      ...reveal('up', 'bg2', 0.1, { span: 0.5 }),
                      ...reveal('up', 'ch', 0.4, { span: 0.6 }),
                      ...reveal('up', 'cf', 0.9, { span: 0.5 }),
                  ] },
                { id: 'u1', duration: 8.0, dialogue: [vo(P3[15], 0.2)],
                  actions: [
                      ...reveal('up', 'uh', 0.4, { span: 0.45 }),
                      ...build('up', up.grainIds, 1.2, { gap: 0.34, span: 0.4, how: pop }),
                  ] },
                { id: 'u2', duration: 8.5, dialogue: [vo(P3[16], 0.2)],
                  actions: [
                      ...pop('up', 'src', 2.6, { span: 0.5 }),
                      ...build('up', ['srcL', 'srcL_lead'], 3.2, { gap: 0.1, span: 0.4 }),
                  ] },
                { id: 'u3', duration: 8.0, dialogue: [vo(P3[17], 0.2)],
                  actions: pop('up', 'upT', 2.8, { span: 0.5 }) },
                { id: 'u4', duration: 9.0, dialogue: [vo(P3[18], 0.2)],
                  actions: conceal('up', 'upT', 0.2, { span: 0.4 }) },
                { id: 'u5', duration: 7.5, dialogue: [vo(P3[20], 0.2)],
                  actions: reveal('up', 'upT', 2.0, { span: 0.4 }) },
                { id: 'u6', duration: 8.5, dialogue: [vo(P3[21], 0.2)],
                  actions: conceal('up', 'upT', 0.2, { span: 0.4 }) },
                { id: 'u7', duration: 8.0, dialogue: [vo(P3[22], 0.2)],
                  actions: pop('up', 'upT', 2.4, { span: 0.5 }) },
            ],
        },
        {
            id: 'card', palette: 'vito',
            background: { color: '#05080d' },
            transitionIn: { kind: 'crossfade', duration: 0.5 },
            cast: [offstage('nuru'), castBoard('card', { alpha: 1 })],
            shots: [
                { id: 'c0', duration: 7.0, dialogue: [vo(P3[19], 0.2)],
                  actions: build('card', card.ids, 0.2, { gap: 0.22, span: 0.45 }) },
            ],
        },
    ];

    return fitShots({
        version: 'jirex.film/1',
        meta: { ...META('Mto unakuambia'), estimatedTiming: true },
        palettes: { vito: VITO_PALETTE },
        voices: VOICES,
        characters,
        scenes,
    });
}
