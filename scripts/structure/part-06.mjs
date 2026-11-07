/**
 * Part 6 — "Where they cross" / "Pale zinapokutana".
 *
 * PUTTING IT TOGETHER: the four ingredients a deposit needs, why structural
 * INTERSECTIONS are the best targets, the traps that waste a prospector's
 * year, and the series' closing honesty.
 *
 * This part closes the loop opened in part one. Part one said a quartz vein
 * proves fluid moved and nothing more; this one finally answers what else is
 * needed, which is the reason the series is worth reaching the end of.
 *
 * The geology is the standard mineral-system framing, reduced to four things
 * an ordinary person can actually check for: a SOURCE of metal, a PATHWAY
 * (the structures of parts 1-4), a TRAP (dilation plus a seal), and a
 * chemical or physical DEPOSITIONAL cause. Remove any one and there is no
 * deposit -- which is why most structures are barren and saying so is not
 * pessimism but the single most useful thing in the series.
 *
 * The traps section is deliberately specific, because these are the actual
 * mistakes: pyrite mistaken for gold (and the four tests that separate them
 * in the field, all of which work on a rock in your hand), mica flakes in a
 * pan, and the assumption that one rich sample means a deposit. Grade,
 * continuity and tonnage are three different questions and only the first
 * is visible in a hand specimen.
 *
 * It closes by saying in as many words that this is general education and
 * not legal, safety or valuation advice.
 */
import {
    build, effect, pathPart, poly, pop, rectPart, reveal, textPart,
} from '../lib/diagram.mjs';
import { FONT, GROUND_Y, L, M } from '../lib/diagram.mjs';
import {
    CHARACTERS, META, STRUCT_PALETTE, offstage, says, vo, voicesFor,
} from '../lib/structure.mjs';
import {
    bannerParts, blinks, board, cardRows, castBoard, endCard, fitShots,
    foldParts, gesture, hookTitle, shearParts, statParts, veinParts, titleAt,
} from './common.mjs';

const TALK_Y = Math.round(GROUND_Y - 274 * 1.5);

const P6 = {
    en: [
        /* 0 HOOK */ 'Part one said a quartz vein proves fluid moved, and no more. Here is what '
            + 'else it needs.',
        /* 1 */ 'Four things. Take away any one and there is no deposit, however good the '
            + 'structure looks.',
        /* 2 */ 'A source. The metal comes from somewhere — a magma, or a big volume of '
            + 'rock being cooked.',
        /* 3 */ 'A pathway. That is parts one to four: joints, folds, faults, shear zones.',
        /* 4 */ 'A trap. Open space, and something above it that stops the fluid escaping.',
        /* 5 */ 'And a reason to drop the metal. Cooling, a pressure drop, or a reaction '
            + 'with the wall.',
        /* 6 */ 'That last one is why iron-rich rocks matter. Fluid hits them, chemistry '
            + 'changes, gold comes out.',
        /* 7 KITWANA */ 'So how do I pick one spot out of a whole hillside?',
        /* 8 ASHA */ 'You look for where two of them cross. That is the answer to the whole '
            + 'series.',
        /* 9 */ 'A single structure gives you a line to walk. Two structures crossing gives '
            + 'you a point.',
        /*10 */ 'A shear zone cutting a fold hinge. Both made space at the same place.',
        /*11 */ 'A fault cutting banded iron formation — pathway meets the rock that '
            + 'forces deposition.',
        /*12 */ 'A jog on a fault, inside an alteration halo. Space inside a system already '
            + 'proven to leak.',
        /*13 */ 'Intersections are where the grade is. Walk the lines; dig where they meet.',
        /*14 */ 'Now the traps, because these cost people whole seasons.',
        /*15 */ 'Pyrite is not gold. Four tests, and all of them work on the rock in your '
            + 'hand.',
        /*16 */ 'Pyrite is brassy and it has flat crystal faces, often cubes. Gold is never '
            + 'a cube.',
        /*17 */ 'Hit it: gold flattens, pyrite shatters. Streak it: gold streaks gold, '
            + 'pyrite black-green.',
        /*18 */ 'And turn it in the light. Pyrite flashes and goes dull. Gold stays gold '
            + 'from every angle.',
        /*19 */ 'Mica does the same in a pan — bright flakes that float and bend. Gold '
            + 'sinks and stays put.',
        /*20 */ 'And the biggest one: a rich sample is not a deposit.',
        /*21 */ 'Grade, continuity and tonnage are three questions. A hand specimen '
            + 'answers only the first.',
        /*22 RAJABU */ 'I have seen men sell a farm over one good stone.',
        /*23 ASHA */ 'One stone tells you to come back and look properly. It does not tell '
            + 'you to sell anything.',
        /*24 */ 'A barren vein is still information. It says fluid came through here and '
            + 'dropped nothing.',
        /*25 */ 'Map it anyway. Knowing where there is nothing is how you find where there '
            + 'is something.',
        /*26 */ 'The honest close. This is general education — not legal, safety or '
            + 'valuation advice. Get a permit, get trained, ask the authority.',
        /*27 LOOP */ 'Joints, folds, faults, shear zones. The rock wrote down what happened to '
            + 'it. Now you can read it.',
    ],
    sw: [
        /* 0 HOOK */ 'Sehemu ya kwanza nilisema mshipa wa quartz unathibitisha majimaji '
            + 'yalipita, si zaidi. Hivi ndivyo vinavyohitajika zaidi.',
        /* 1 */ 'Vitu vinne. Ondoa kimoja na hakuna madini, hata muundo ukionekana mzuri '
            + 'kiasi gani.',
        /* 2 */ 'Chanzo. Madini lazima yatoke mahali — magma, au mwamba mwingi unaopikwa.',
        /* 3 */ 'Njia. Hizo ni sehemu moja hadi nne: nyufa, mikunjo, hitilafu, kanda za '
            + 'msuguano.',
        /* 4 */ 'Tego. Nafasi wazi, na kitu juu yake kinachozuia majimaji kutoka.',
        /* 5 */ 'Na sababu ya kuachia madini. Kupoa, kushuka kwa shinikizo, au kuathiriana '
            + 'na mwamba wa kando.',
        /* 6 */ 'Hiyo ya mwisho ndiyo sababu miamba yenye chuma ni muhimu. Majimaji '
            + 'yanaigonga, kemia inabadilika, dhahabu inatoka.',
        /* 7 KITWANA */ 'Sasa nichagueje sehemu moja kwenye mlima mzima?',
        /* 8 ASHA */ 'Tafuta pale miundo miwili inapokutana. Hilo ndilo jibu la mfululizo '
            + 'mzima.',
        /* 9 */ 'Muundo mmoja unakupa mstari wa kutembea. Miundo miwili inayokutana '
            + 'inakupa doa.',
        /*10 */ 'Ukanda wa msuguano ukikata pembe ya mkunjo. Vyote viwili vilitengeneza '
            + 'nafasi mahali pamoja.',
        /*11 */ 'Hitilafu ikikata banded iron formation — njia inakutana na mwamba '
            + 'unaolazimisha madini kutua.',
        /*12 */ 'Pindo la hitilafu, ndani ya eneo la mabadiliko. Nafasi ndani ya mfumo '
            + 'ambao tayari unajulikana unavuja.',
        /*13 */ 'Makutano ndipo ubora ulipo. Tembea mistari; chimba pale inapokutana.',
        /*14 */ 'Sasa mitego, kwa sababu hii inawagharimu watu misimu mizima.',
        /*15 */ 'Pyrite si dhahabu. Vipimo vinne, na vyote vinafanya kazi kwa jiwe mkononi.',
        /*16 */ 'Pyrite ina rangi ya shaba na ina nyuso bapa, mara nyingi za mraba. '
            + 'Dhahabu haiwi mraba kamwe.',
        /*17 */ 'Igonge: dhahabu inajibapa, pyrite inavunjika. Ikwaruze: dhahabu inatoa '
            + 'mstari wa dhahabu, pyrite mstari mweusi-kijani.',
        /*18 */ 'Na igeuze kwenye mwanga. Pyrite inameta kisha inafifia. Dhahabu inabaki '
            + 'dhahabu kwa kila pembe.',
        /*19 */ 'Mica inafanya mchezo ule ule kwenye karai — vipande vyenye kung’aa '
            + 'vinavyoelea na kupinda. Dhahabu inazama na kukaa.',
        /*20 */ 'Na kubwa kuliko zote: sampuli nzuri si mgodi.',
        /*21 */ 'Ubora, mwendelezo na kiasi ni maswali matatu tofauti. Jiwe mkononi '
            + 'linajibu la kwanza tu.',
        /*22 RAJABU */ 'Nimeona watu wakiuza shamba kwa ajili ya jiwe moja zuri.',
        /*23 ASHA */ 'Jiwe moja linakuambia urudi uangalie vizuri. Halikuambii uuze kitu.',
        /*24 */ 'Kwa hiyo: mshipa usio na kitu bado ni taarifa. Unakuambia majimaji '
            + 'yalipita hapa na hayakuacha kitu.',
        /*25 */ 'Uchore tu. Mchoro wa pasipo na kitu ndiyo njia ya kupata palipo na kitu.',
        /*26 */ 'Na hitimisho la kweli. Hii ni elimu ya jumla, si ushauri wa kisheria, '
            + 'usalama au thamani. Pata leseni, pata mafunzo, na uulize mamlaka ya madini.',
        /*27 LOOP */ 'Nyufa, mikunjo, hitilafu, kanda za msuguano. Mwamba tayari '
            + 'umeandika yaliyompata. Sasa unaweza kuusoma.',
    ],
};

const T = {
    en: {
        kicker: 'READING THE ROCK  ·  PART 6', title: 'Where they cross',
        sub: 'putting all four together, and what not to believe',
        fourH: 'FOUR THINGS. REMOVE ONE — NO DEPOSIT.',
        four: [
            ['SOURCE', 'The metal has to come from somewhere.', '#e2663c'],
            ['PATHWAY', 'Joints, folds, faults, shear zones — parts 1 to 4.', '#5ec8e8'],
            ['TRAP', 'Open space, and a seal above it.', '#ffb23d'],
            ['A REASON TO DROP IT', 'Cooling, pressure drop, or reaction with the wall rock.', '#ffc64d'],
        ],
        crossH: 'ONE STRUCTURE = A LINE.  TWO = A POINT.',
        crossRows: [
            ['SHEAR × FOLD HINGE', 'Both made space in the same place.', '#b06ae0'],
            ['FAULT × IRON FORMATION', 'Pathway meets the rock that forces deposition.', '#4a4a52'],
            ['JOG × ALTERATION HALO', 'Space inside a system already proven to leak.', '#d8b98a'],
        ],
        crossC: 'walk the lines — dig where they meet',
        pyH: 'PYRITE IS NOT GOLD  ·  four tests, rock in hand',
        py: [
            ['SHAPE', 'Pyrite makes flat faces and cubes. Gold is never a cube.', '#d4b33c'],
            ['HIT IT', 'Gold flattens. Pyrite shatters.', '#ece8dd'],
            ['STREAK', 'Gold streaks gold. Pyrite streaks black-green.', '#2a2f36'],
            ['TURN IT IN THE LIGHT', 'Pyrite flashes then dulls. Gold stays gold.', '#ffc64d'],
        ],
        sampV: 'A SAMPLE IS NOT A DEPOSIT',
        sampC: 'grade, continuity and tonnage are three different questions',
        closeV: 'GENERAL EDUCATION',
        closeC: 'not legal, safety or valuation advice — get a permit, get trained, ask the authority',
        next: 'That is the series.\nStart again at Part 1 — it reads differently now.',
    },
    sw: {
        kicker: 'KUSOMA MWAMBA  ·  SEHEMU 6', title: 'Pale zinapokutana',
        sub: 'kuunganisha vyote vinne, na nini usiamini',
        fourH: 'VITU VINNE. ONDOA KIMOJA — HAKUNA MADINI.',
        four: [
            ['CHANZO', 'Madini lazima yatoke mahali.', '#e2663c'],
            ['NJIA', 'Nyufa, mikunjo, hitilafu, kanda — sehemu 1 hadi 4.', '#5ec8e8'],
            ['TEGO', 'Nafasi wazi, na kifuniko juu yake.', '#ffb23d'],
            ['SABABU YA KUACHIA', 'Kupoa, kushuka shinikizo, au kuathiriana na mwamba.', '#ffc64d'],
        ],
        crossH: 'MUUNDO MMOJA = MSTARI.  MIWILI = DOA.',
        crossRows: [
            ['UKANDA × PEMBE YA MKUNJO', 'Vyote vilitengeneza nafasi mahali pamoja.', '#b06ae0'],
            ['HITILAFU × MWAMBA WA CHUMA', 'Njia inakutana na mwamba unaolazimisha kutua.', '#4a4a52'],
            ['PINDO × ENEO LA MABADILIKO', 'Nafasi ndani ya mfumo unaojulikana unavuja.', '#d8b98a'],
        ],
        crossC: 'tembea mistari — chimba pale inapokutana',
        pyH: 'PYRITE SI DHAHABU  ·  vipimo vinne, jiwe mkononi',
        py: [
            ['UMBO', 'Pyrite ina nyuso bapa na mraba. Dhahabu si mraba kamwe.', '#d4b33c'],
            ['IGONGE', 'Dhahabu inajibapa. Pyrite inavunjika.', '#ece8dd'],
            ['MSTARI', 'Dhahabu inatoa mstari wa dhahabu. Pyrite mweusi-kijani.', '#2a2f36'],
            ['IGEUZE KWENYE MWANGA', 'Pyrite inameta kisha inafifia. Dhahabu inabaki.', '#ffc64d'],
        ],
        sampV: 'SAMPULI SI MGODI',
        sampC: 'ubora, mwendelezo na kiasi ni maswali matatu tofauti',
        closeV: 'ELIMU YA JUMLA',
        closeC: 'si ushauri wa kisheria, usalama au thamani — pata leseni, pata mafunzo, uliza mamlaka',
        next: 'Huo ndio mfululizo.\nAnza tena Sehemu 1 — utasomeka tofauti sasa.',
    },
};

function boardOpen(t) {
    const v = veinParts('ov', [[240, 1080], [380, 960], [520, 880], [680, 800], [840, 700]],
                        { width: 34, ore: 0, z: 60 });
    return { ...board('open', [
        rectPart('bg', 940, 560, { at: [540, 880], fill: 'rock', stroke: '#2a241c',
                                   strokeWidth: 3, alpha: 0, z: -10 }),
        ...v.parts,
        ...hookTitle(t.kicker, t.title, t.sub),
    ]), v };
}

function boardFour(t) {
    const rows = cardRows('fr', t.four, { top: 606, h: 158, gap: 20 });
    return { ...board('four', [
        textPart('h', t.fourH, { at: [540, 540], font: `800 33px ${FONT}`, fill: 'ink',
                                 alpha: 0, z: 60, maxWidth: 940 }),
        ...rows.parts,
    ]), rows };
}

/** The intersection, drawn as an intersection: a shear across a fold hinge. */
function boardCross(t) {
    const fold = foldParts('xf', { crest: 900, amp: 120, layers: 3, bandH: 46, hinge: true });
    const sh = shearParts('xs', { x: 420, w: 240, top: 600, h: 620, lines: 11,
                                  bandFrac: 0.9, z: 60 });
    const hit = veinParts('xv', [[500, 820], [540, 790], [580, 800]],
                          { width: 30, ore: 3, z: 140 });
    return { ...board('cross', [
        textPart('h', t.crossH, { at: [540, 554], font: `800 32px ${FONT}`, fill: 'ink',
                                  alpha: 0, z: 180, maxWidth: 940 }),
        ...fold.parts, ...sh.parts, ...hit.parts,
        textPart('cc', t.crossC, { at: [540, 1292], font: `800 30px ${FONT}`, fill: 'gold',
                                   alpha: 0, z: 180, maxWidth: 920 }),
    ]), fold, sh, hit };
}

function boardCrossRows(t) {
    const rows = cardRows('xr', t.crossRows, { top: 640, h: 176, gap: 26 });
    return { ...board('xrows', [
        ...rows.parts,
        ...statParts('samp', t.sampV, t.sampC, { at: [540, 1262], fill: 'fault', size: 48 }),
    ]), rows };
}

function boardPyrite(t) {
    const rows = cardRows('pr', t.py, { top: 606, h: 158, gap: 20 });
    return { ...board('py', [
        textPart('h', t.pyH, { at: [540, 540], font: `800 31px ${FONT}`, fill: 'ink',
                               alpha: 0, z: 60, maxWidth: 940 }),
        ...rows.parts,
    ]), rows };
}

function boardClose(t) {
    return board('close', [
        ...statParts('close', t.closeV, t.closeC, { at: [540, 880], fill: 'dim', size: 54 }),
    ]);
}

export function partSix(lang) {
    const t = T[lang], P = P6[lang];
    const open = boardOpen(t), four = boardFour(t), cross = boardCross(t);
    const xrows = boardCrossRows(t), py = boardPyrite(t), close = boardClose(t);
    const card = endCard(lang, t.next);
    const ban = bannerParts(lang, 6);
    const boards = [open, four, cross, xrows, py, close,
                    board('card', card.parts), board('ban', ban)];
    const characters = { ...CHARACTERS };
    for (const b of boards) characters[b.name] = effect(b.parts, { palette: 'struct' });
    const withBan = (cast) => [...cast, castBoard('ban', { alpha: 1 })];
    const two = (a, b) => withBan([
        { character: a, as: a, at: [300, TALK_Y], scale: 1.42, view: 'threeQuarter' },
        { character: b, as: b, at: [800, TALK_Y], scale: 1.42, view: 'threeQuarter', facing: -1 },
    ]);

    const scenes = [
        {
            id: 'open', palette: 'struct', background: { color: STRUCT_PALETTE.bg },
            transitionIn: { kind: 'fade', from: '#000000', duration: 0.6 },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('open', { alpha: 1 })]),
            shots: [
                { id: 'o0', dialogue: [vo(P[0], 0.3)],
                  actions: [
                      ...reveal('open', 'bg', 0.2, { span: 0.5 }),
                      ...build('open', open.v.ids, 0.8, { gap: 0.14, span: 0.45 }),
                      ...build('open', ['kicker', 'title', 'titlesub'], titleAt(P[0], lang),
                               { gap: 0.24, span: 0.5 }),
                  ] },
            ],
        },
        {
            id: 'vinne', palette: 'struct', background: { color: STRUCT_PALETTE.bg },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('four', { alpha: 1 })]),
            shots: [
                { id: 'f0', dialogue: [vo(P[1], 0.2)],
                  actions: reveal('four', 'h', 0.2, { span: 0.45 }) },
                { id: 'f1', dialogue: [vo(P[2], 0.2)],
                  actions: build('four', four.rows.rowIds(0), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 'f2', dialogue: [vo(P[3], 0.2)],
                  actions: build('four', four.rows.rowIds(1), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 'f3', dialogue: [vo(P[4], 0.2)],
                  actions: build('four', four.rows.rowIds(2), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 'f4', dialogue: [vo(P[5], 0.2)],
                  actions: build('four', four.rows.rowIds(3), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 'f5', dialogue: [vo(P[6], 0.2)], actions: [] },
            ],
        },
        {
            id: 'swali', palette: 'struct', background: { color: '#111b24' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: two('asha', 'kitwana'),
            shots: [
                { id: 'q0', dialogue: [says('kitwana', P[7], 0.3)],
                  actions: [
                      { target: 'asha', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'kitwana', do: 'pose', pose: 'stand', at: 0 },
                      ...gesture('kitwana', 'ask', 0.3, { hold: 1.4 }),
                      ...blinks('asha', 5.0, 13), ...blinks('kitwana', 5.0, 31),
                  ] },
                { id: 'q1', dialogue: [says('asha', P[8], 0.3)],
                  actions: [
                      ...gesture('asha', 'present', 0.3, { hold: 1.6 }),
                      ...blinks('asha', 5.5, 47), ...blinks('kitwana', 5.5, 59),
                  ] },
            ],
        },
        {
            id: 'makutano', palette: 'struct', background: { color: '#0f0d14' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('cross', { alpha: 1 })]),
            shots: [
                { id: 'x0', dialogue: [vo(P[9], 0.2)],
                  actions: [
                      ...reveal('cross', 'h', 0.2, { span: 0.45 }),
                      ...build('cross', cross.fold.ids, 0.7, { gap: 0.13, span: 0.4 }),
                      ...build('cross', cross.fold.hingeIds, 2.0, { gap: 0.1, span: 0.4 }),
                  ] },
                { id: 'x1', dialogue: [vo(P[10], 0.2)],
                  actions: [
                      ...build('cross', cross.sh.zoneIds, 0.3, { gap: 0.1, span: 0.5 }),
                      ...build('cross', cross.sh.ids, 0.6, { gap: 0.02, span: 0.3 }),
                      ...build('cross', cross.hit.ids, 2.4, { gap: 0.14, span: 0.4, how: pop }),
                  ] },
            ],
        },
        {
            id: 'mifano', palette: 'struct', background: { color: STRUCT_PALETTE.bg },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('xrows', { alpha: 1 })]),
            shots: [
                { id: 'r0', dialogue: [vo(P[11], 0.2)],
                  actions: build('xrows', xrows.rows.rowIds(1), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 'r1', dialogue: [vo(P[12], 0.2)],
                  actions: [
                      ...build('xrows', xrows.rows.rowIds(0), 0, { gap: 0.1, span: 0.4 }),
                      ...build('xrows', xrows.rows.rowIds(2), 0.6, { gap: 0.1, span: 0.4 }),
                  ] },
                { id: 'r2', dialogue: [vo(P[13], 0.2)], actions: [] },
            ],
        },
        {
            id: 'mitego', palette: 'struct', background: { color: '#14110a' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('py', { alpha: 1 })]),
            shots: [
                // The heading goes on the FIRST shot of the scene. On the
                // second it left five seconds of entirely empty frame, which
                // a still of that moment shows at once and no check can.
                { id: 'p0', dialogue: [vo(P[14], 0.2)],
                  actions: reveal('py', 'h', 0.3, { span: 0.45 }) },
                { id: 'p1', dialogue: [vo(P[15], 0.2)],
                  actions: build('py', py.rows.rowIds(0), 0.4, { gap: 0.1, span: 0.4 }) },
                { id: 'p2', dialogue: [vo(P[16], 0.2)],
                  actions: build('py', py.rows.rowIds(1), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 'p3', dialogue: [vo(P[17], 0.2)],
                  actions: build('py', py.rows.rowIds(2), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 'p4', dialogue: [vo(P[18], 0.2)],
                  actions: build('py', py.rows.rowIds(3), 0.3, { gap: 0.1, span: 0.4, how: pop }) },
                { id: 'p5', dialogue: [vo(P[19], 0.2)], actions: [] },
            ],
        },
        {
            id: 'sampuli', palette: 'struct', background: { color: STRUCT_PALETTE.bg },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('xrows', { alpha: 1 })]),
            shots: [
                { id: 's0', dialogue: [vo(P[20], 0.2)],
                  actions: [
                      ...build('xrows', xrows.rows.allIds, 0, { gap: 0, span: 0.01 }),
                      ...build('xrows', ['samp_v', 'samp_c'], 0.6,
                               { gap: 0.22, span: 0.5, how: pop }),
                  ] },
                { id: 's1', dialogue: [vo(P[21], 0.2)], actions: [] },
            ],
        },
        {
            id: 'mzee', palette: 'struct', background: { color: '#1a1512' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: two('rajabu', 'asha'),
            shots: [
                { id: 'z0', dialogue: [says('rajabu', P[22], 0.3)],
                  actions: [
                      { target: 'rajabu', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'asha', do: 'pose', pose: 'stand', at: 0 },
                      ...gesture('rajabu', 'warn', 0.4, { hold: 1.4 }),
                      ...blinks('rajabu', 5.0, 17), ...blinks('asha', 5.0, 83),
                  ] },
                { id: 'z1', dialogue: [says('asha', P[23], 0.3)],
                  actions: [
                      ...gesture('asha', 'present', 0.3, { hold: 1.6 }),
                      ...blinks('rajabu', 5.5, 29), ...blinks('asha', 5.5, 71),
                  ] },
            ],
        },
        {
            id: 'tupu', palette: 'struct', background: { color: '#0d1319' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('close', { alpha: 1 })]),
            shots: [
                { id: 'n0', dialogue: [vo(P[24], 0.2)], actions: [] },
                { id: 'n1', dialogue: [vo(P[25], 0.2)], actions: [] },
                // The disclaimer gets the frame to itself. It is the one
                // thing in the series that is not geology.
                { id: 'n2', dialogue: [vo(P[26], 0.2)],
                  actions: build('close', ['close_v', 'close_c'], 0.6,
                                 { gap: 0.25, span: 0.5, how: pop }) },
            ],
        },
        {
            id: 'card', palette: 'struct', background: { color: '#04070a' },
            transitionIn: { kind: 'crossfade', duration: 0.5 },
            cast: [offstage('asha'), castBoard('card', { alpha: 1 })],
            shots: [
                // Closes the loop back to part one, which is the only thing
                // that makes the end of an explainer worth reaching.
                { id: 'e0', dialogue: [vo(P[27], 0.2)],
                  actions: build('card', card.ids, 0.2, { gap: 0.2, span: 0.45 }) },
            ],
        },
    ];

    return fitShots({
        version: 'jirex.film/1',
        meta: { ...META(lang, t.title), estimatedTiming: true },
        palettes: { struct: STRUCT_PALETTE },
        voices: voicesFor(lang),
        characters, scenes,
    }, lang);
}
