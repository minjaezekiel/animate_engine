/**
 * Part 4 — "The rock that smeared" / "Mwamba uliopakaa".
 *
 * SHEAR ZONES: the ductile equivalent of a fault, where strain is spread
 * across a band instead of concentrated on a plane -- and the single most
 * important host for gold in Tanzania.
 *
 * The geology is conventional and the Tanzanian specifics are real. A shear
 * zone deforms by flow rather than fracture, producing foliation that is
 * dragged into parallelism with the zone and, at high strain, mylonite. The
 * reason they matter is that they are crustal-scale, long-lived fluid
 * conduits: they stay permeable for millions of years, and they focus flow
 * at the brittle-ductile transition, roughly 300-400 degrees C and 10-15 km,
 * which is close to where gold drops out of a quartz-carbonate fluid. That is
 * the orogenic gold model, and it is why the Archaean greenstone belts of the
 * Lake Victoria Goldfield -- Geita, Bulyanhulu, North Mara, Buzwagi -- are
 * where Tanzania's gold is.
 *
 * The field payoff is the ALTERATION HALO, which is wider than the vein and
 * therefore easier to find: carbonate alteration weathering buff-orange,
 * sericite, chlorite, and chrome mica (fuchsite) a distinctive green.
 *
 * The honest limits: "shear zone" does not mean "gold", the halo can be
 * tens of metres or hundreds, and the model is a guide to where to look
 * rather than a promise. Said out loud in the narration.
 */
import {
    build, conceal, effect, pathPart, poly, pop, rectPart, reveal, textPart,
} from '../lib/diagram.mjs';
import { FONT, GROUND_Y, L, M } from '../lib/diagram.mjs';
import {
    CHARACTERS, META, STRUCT_PALETTE, offstage, says, vo, voicesFor,
} from '../lib/structure.mjs';
import {
    bannerParts, blinks, board, cardRows, castBoard, endCard, fitShots,
    gesture, hookTitle, shearParts, statParts, veinParts, titleAt,
} from './common.mjs';

const TALK_Y = Math.round(GROUND_Y - 274 * 1.5);

const P4 = {
    en: [
        /* 0 HOOK */ 'Most of Tanzania\u2019s gold came out of a structure that looks like almost '
            + 'nothing at the surface.',
        /* 1 */ 'A fault breaks the rock. A shear zone smears it.',
        /* 2 */ 'Same squeeze, but deeper and hotter — so instead of snapping, the rock '
            + 'flows.',
        /* 3 */ 'And the strain is spread across a band, metres to kilometres wide, instead '
            + 'of one clean break.',
        /* 4 */ 'Here is how you recognise it, and it is one shape.',
        /* 5 */ 'Outside the zone, the fabric of the rock sits at its own angle.',
        /* 6 */ 'Walk in, and it swings round until it runs parallel with the zone itself.',
        /* 7 */ 'That S-shaped drag is the diagnosis. Nothing else makes it.',
        /* 8 */ 'In the middle, the rock is fine-grained, hard, and it takes on a sheen. '
            + 'That is mylonite.',
        /* 9 KITWANA */ 'So why is the gold there and not in a normal fault?',
        /*10 ASHA */ 'Two reasons, and they are both about time.',
        /*11 */ 'A shear zone is crustal scale. It reaches down kilometres, tapping fluid a '
            + 'shallow fault never meets.',
        /*12 */ 'And it stays open for millions of years. A fault heals. A shear zone keeps '
            + 'moving, keeps leaking.',
        /*13 */ 'There is also a depth where it works best — where the rock stops flowing '
            + 'and starts cracking.',
        /*14 */ 'Three to four hundred degrees. Ten to fifteen kilometres down. Gold drops '
            + 'out of solution right about there.',
        /*15 */ 'That is the orogenic gold model, and it is where Geita, Bulyanhulu and '
            + 'North Mara sit.',
        /*16 */ 'Now the useful part. The vein is narrow, but the ALTERATION is wide — and '
            + 'that is what you can find.',
        /*17 */ 'Carbonate alteration. The rock weathers a buff, orange-brown colour, '
            + 'different from the fresh rock beside it.',
        /*18 */ 'Sericite — a pale, soft, silvery sheen on the surfaces.',
        /*19 */ 'And fuchsite: a bright green mica. If you see that green, stop walking.',
        /*20 */ 'What you are looking for: quartz-carbonate veins with pyrite and '
            + 'arsenopyrite, carrying the gold.',
        /*21 */ 'And one test that separates a shear vein from an ordinary one.',
        /*22 */ 'An ordinary vein cuts straight across the fabric. A shear vein is folded '
            + 'and stretched WITH it.',
        /*23 */ 'Because it formed while the rock was still moving. That is the vein you '
            + 'want.',
        /*24 RAJABU */ 'The old men said: follow the green rock and the soft rock. They had no '
            + 'names for it.',
        /*25 ASHA */ 'They had the right rule. Fuchsite and sericite. The names came later '
            + 'and changed nothing.',
        /*26 */ 'Be honest — a shear zone is not a promise. Most carry nothing. It tells '
            + 'you where to look, not what you will find.',
        /*27 LOOP */ 'You now know all four structures. Next: how to measure them, with '
            + 'almost no equipment.',
    ],
    sw: [
        /* 0 HOOK */ 'Dhahabu nyingi iliyochimbwa Tanzania ilitoka kwenye muundo '
            + 'unaoonekana karibu si kitu juu ya ardhi.',
        /* 1 */ 'Hitilafu inavunja mwamba. Ukanda wa msuguano unaupakaa.',
        /* 2 */ 'Mbano ule ule, lakini chini zaidi na moto zaidi — hivyo badala ya '
            + 'kukatika, mwamba unatiririka.',
        /* 3 */ 'Na msukumo unaenea kwenye ukanda, mita hadi kilomita kwa upana, si '
            + 'mpasuko mmoja safi.',
        /* 4 */ 'Hivi ndivyo unavyoutambua, na ni umbo moja tu.',
        /* 5 */ 'Nje ya ukanda, mistari ya mwamba iko kwenye pembe yake yenyewe.',
        /* 6 */ 'Ingia ndani, nayo inageuka hadi inakuwa sambamba na ukanda wenyewe.',
        /* 7 */ 'Mkunjo huo wa herufi S ndiyo utambuzi. Hakuna kingine kinachoufanya.',
        /* 8 */ 'Katikati, mwamba ni laini, mgumu, na unapata mng\\u2019ao. Huo ni mylonite.',
        /* 9 KITWANA */ 'Kwa nini dhahabu iko hapo na si kwenye hitilafu ya kawaida?',
        /*10 ASHA */ 'Sababu mbili, na zote ni kuhusu muda.',
        /*11 */ 'Ukanda wa msuguano ni wa kina kirefu. Unashuka kilomita nyingi, hivyo '
            + 'unafikia majimaji ambayo hitilafu ya juujuu haikutani nayo.',
        /*12 */ 'Na unabaki wazi kwa mamilioni ya miaka. Hitilafu inapona. Ukanda '
            + 'unaendelea kusogea, unaendelea kuvuja.',
        /*13 */ 'Pia kuna kina ambapo unafanya kazi vizuri zaidi — pale mwamba unapoacha '
            + 'kutiririka na kuanza kupasuka.',
        /*14 */ 'Karibu nyuzi mia tatu hadi mia nne. Takriban kilomita kumi hadi kumi na '
            + 'tano chini. Dhahabu inatoka kwenye myeyusho hapo hapo.',
        /*15 */ 'Huo ndio mfumo wa orogenic gold, na ndipo Geita, Bulyanhulu na North Mara '
            + 'zilipo.',
        /*16 */ 'Sasa sehemu ya maana. Mshipa ni mwembamba, lakini MABADILIKO ya mwamba ni '
            + 'mapana — na ndiyo unayoweza kuyaona.',
        /*17 */ 'Mabadiliko ya carbonate. Mwamba unageuka rangi ya chungwa-kahawia isiyo '
            + 'kali, tofauti na mwamba mbichi karibu nao.',
        /*18 */ 'Sericite — mng\\u2019ao hafifu, laini, wa fedha juu ya nyuso.',
        /*19 */ 'Na fuchsite: mica ya kijani kibichi. Ukiona kijani hicho, acha kutembea.',
        /*20 */ 'Unachokitafuta: mishipa ya quartz na carbonate yenye pyrite na '
            + 'arsenopyrite, ikibeba dhahabu.',
        /*21 */ 'Na kipimo kimoja kinachotenganisha mshipa wa ukanda na wa kawaida.',
        /*22 */ 'Mshipa wa kawaida unakata mistari ya mwamba moja kwa moja. Wa ukanda '
            + 'umekunjwa na kunyooshwa PAMOJA nayo.',
        /*23 */ 'Kwa sababu uliumbwa mwamba ukiwa bado unasogea. Huo ndio mshipa unaoutaka.',
        /*24 RAJABU */ 'Wazee walituambia: fuata mwamba wa kijani na mwamba laini. '
            + 'Hawakuwa na majina yake.',
        /*25 ASHA */ 'Walikuwa na kanuni sahihi. Fuchsite na sericite. Majina yalikuja '
            + 'baadaye na hayakubadilisha kitu.',
        /*26 */ 'Lakini kuwa mkweli — ukanda wa msuguano si ahadi. Mingi haina kitu. '
            + 'Unakuambia wapi pa kuangalia, si utakachokipata.',
        /*27 LOOP */ 'Sasa unajua miundo yote minne. Sasa: jinsi ya kuipima, bila vifaa '
            + 'vingi.',
    ],
};

const T = {
    en: {
        kicker: 'READING THE ROCK  ·  PART 4', title: 'The rock that smeared',
        sub: 'shear zones, and Tanzania’s gold',
        dragH: 'THE DRAG IS THE DIAGNOSIS',
        outside: 'outside — fabric at its own angle',
        inside: 'inside — dragged parallel  ·  MYLONITE',
        whyH: 'WHY A SHEAR ZONE AND NOT A FAULT',
        whys: [
            ['CRUSTAL SCALE', 'Reaches down kilometres. Taps fluid a shallow fault never meets.', '#b06ae0'],
            ['LONG-LIVED', 'A fault heals. A shear zone keeps moving, and keeps leaking.', '#5ec8e8'],
            ['THE RIGHT DEPTH', 'Where rock stops flowing and starts cracking.', '#ffb23d'],
        ],
        depthV: '300–400 °C', depthC: 'about 10–15 km down — where gold leaves solution',
        beltV: 'LAKE VICTORIA GOLDFIELD', beltC: 'Geita · Bulyanhulu · North Mara · Buzwagi',
        haloH: 'THE VEIN IS NARROW. THE ALTERATION IS WIDE.',
        haloRows: [
            ['CARBONATE', 'Weathers buff, orange-brown — unlike the fresh rock beside it.', '#d8b98a'],
            ['SERICITE', 'Pale, soft, a silvery sheen on the surfaces.', '#cfc6b2'],
            ['FUCHSITE', 'Bright green chrome mica. See that green — stop walking.', '#4fbf86'],
            ['THE VEIN', 'Quartz–carbonate, pyrite and arsenopyrite, carrying gold.', '#ffc64d'],
        ],
        testH: 'ONE TEST FOR A SHEAR VEIN',
        cuts: 'ordinary vein — CUTS straight across the fabric',
        withF: 'shear vein — FOLDED AND STRETCHED with it',
        testC: 'because it formed while the rock was still moving',
        warnV: 'NOT A PROMISE', warnC: 'it tells you where to look, not what you will find',
        next: 'Next — Part 5:\nhow to measure all four, with almost nothing',
    },
    sw: {
        kicker: 'KUSOMA MWAMBA  ·  SEHEMU 4', title: 'Mwamba uliopakaa',
        sub: 'kanda za msuguano, na dhahabu ya Tanzania',
        dragH: 'MKUNJO NDIYO UTAMBUZI',
        outside: 'nje — mistari kwenye pembe yake',
        inside: 'ndani — imevutwa sambamba  ·  MYLONITE',
        whyH: 'KWA NINI UKANDA NA SI HITILAFU',
        whys: [
            ['KINA KIREFU', 'Unashuka kilomita nyingi. Unafikia majimaji ya ndani.', '#b06ae0'],
            ['UNADUMU MUDA MREFU', 'Hitilafu inapona. Ukanda unaendelea kusogea na kuvuja.', '#5ec8e8'],
            ['KINA SAHIHI', 'Pale mwamba unapoacha kutiririka na kuanza kupasuka.', '#ffb23d'],
        ],
        depthV: '300–400 °C', depthC: 'takriban km 10–15 chini — dhahabu inapotoka kwenye myeyusho',
        beltV: 'UKANDA WA DHAHABU ZIWA VICTORIA', beltC: 'Geita · Bulyanhulu · North Mara · Buzwagi',
        haloH: 'MSHIPA NI MWEMBAMBA. MABADILIKO NI MAPANA.',
        haloRows: [
            ['CARBONATE', 'Inageuka chungwa-kahawia — tofauti na mwamba mbichi.', '#d8b98a'],
            ['SERICITE', 'Hafifu, laini, mng’ao wa fedha juu ya nyuso.', '#cfc6b2'],
            ['FUCHSITE', 'Mica ya kijani kibichi. Ukiona kijani — acha kutembea.', '#4fbf86'],
            ['MSHIPA', 'Quartz na carbonate, pyrite na arsenopyrite, ikibeba dhahabu.', '#ffc64d'],
        ],
        testH: 'KIPIMO KIMOJA CHA MSHIPA WA UKANDA',
        cuts: 'mshipa wa kawaida — UNAKATA mistari moja kwa moja',
        withF: 'mshipa wa ukanda — UMEKUNJWA NA KUNYOOSHWA nayo',
        testC: 'kwa sababu uliumbwa mwamba ukiwa bado unasogea',
        warnV: 'SI AHADI', warnC: 'unakuambia wapi pa kuangalia, si utakachokipata',
        next: 'Inayofuata — Sehemu 5:\njinsi ya kupima yote minne, bila vifaa',
    },
};

function boardOpen(t) {
    const sh = shearParts('os', { top: 600, h: 560, lines: 15 });
    const v = veinParts('ov', [[300, 1000], [430, 930], [560, 880], [700, 820], [840, 760]],
                        { width: 24, ore: 4, z: 150 });
    return { ...board('open', [...sh.parts, ...v.parts,
                               ...hookTitle(t.kicker, t.title, t.sub)]), sh, v };
}

function boardDrag(t) {
    const sh = shearParts('ds', { top: 620, h: 540, lines: 15 });
    return { ...board('drag', [
        textPart('h', t.dragH, { at: [540, 566], font: `800 34px ${FONT}`, fill: 'shear',
                                 alpha: 0, z: 150, maxWidth: 940 }),
        ...sh.parts,
        textPart('out', t.outside, { at: [540, 1196], font: `700 27px ${FONT}`, fill: 'dim',
                                     alpha: 0, z: 150, maxWidth: 900 }),
        textPart('in', t.inside, { at: [540, 1248], font: `700 27px ${FONT}`, fill: 'shear',
                                   alpha: 0, z: 150, maxWidth: 900 }),
    ]), sh };
}

function boardWhy(t) {
    const rows = cardRows('wr', t.whys, { top: 620, h: 172, gap: 24 });
    return { ...board('why', [
        textPart('h', t.whyH, { at: [540, 552], font: `800 34px ${FONT}`, fill: 'ink',
                                alpha: 0, z: 60, maxWidth: 940 }),
        ...rows.parts,
        ...statParts('dp', t.depthV, t.depthC, { at: [540, 1248], fill: 'hot', size: 72 }),
    ]), rows };
}

function boardBelt(t) {
    return board('belt', [
        ...statParts('belt', t.beltV, t.beltC, { at: [540, 880], fill: 'gold', size: 44 }),
    ]);
}

function boardHalo(t) {
    const rows = cardRows('hr', t.haloRows, { top: 606, h: 162, gap: 20 });
    return { ...board('halo', [
        textPart('h', t.haloH, { at: [540, 536], font: `800 32px ${FONT}`, fill: 'ink',
                                 alpha: 0, z: 60, maxWidth: 940 }),
        ...rows.parts,
    ]), rows };
}

/** The syn-tectonic test: a vein folded WITH the fabric, not cutting it. */
function boardTest(t) {
    const shA = shearParts('ta', { x: 70, w: 420, top: 660, h: 360, lines: 9, bandFrac: 0.5 });
    const shB = shearParts('tb', { x: 590, w: 420, top: 660, h: 360, lines: 9, bandFrac: 0.5 });
    const cut = veinParts('cut', [[120, 1000], [200, 900], [280, 800], [360, 700]],
                          { width: 18, z: 160, fill: 'quartz' });
    // Folded and boudinaged: the vein follows the same drag the fabric does.
    const wth = veinParts('wth', [[620, 960], [700, 900], [790, 880], [880, 850], [970, 790]],
                          { width: 18, z: 160, fill: 'quartz' });
    return { ...board('test', [
        textPart('h', t.testH, { at: [540, 580], font: `800 33px ${FONT}`, fill: 'ink',
                                 alpha: 0, z: 180, maxWidth: 940 }),
        ...shA.parts, ...shB.parts, ...cut.parts, ...wth.parts,
        textPart('cuts', t.cuts, { at: [280, 1078], font: `700 25px ${FONT}`, fill: 'dim',
                                   alpha: 0, z: 180, maxWidth: 440 }),
        textPart('with', t.withF, { at: [800, 1078], font: `700 25px ${FONT}`, fill: 'gold',
                                    alpha: 0, z: 180, maxWidth: 440 }),
        textPart('tc', t.testC, { at: [540, 1180], font: `600 27px ${FONT}`, fill: 'dim',
                                  alpha: 0, z: 180, maxWidth: 900 }),
        ...statParts('warn', t.warnV, t.warnC, { at: [540, 1268], fill: 'fault', size: 54 }),
    ]), shA, shB, cut, wth };
}

export function partFour(lang) {
    const t = T[lang], P = P4[lang];
    const open = boardOpen(t), drag = boardDrag(t), why = boardWhy(t);
    const belt = boardBelt(t), halo = boardHalo(t), test = boardTest(t);
    const card = endCard(lang, t.next);
    const ban = bannerParts(lang, 4);
    const boards = [open, drag, why, belt, halo, test,
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
                      ...build('open', open.sh.zoneIds, 0.2, { gap: 0.1, span: 0.5 }),
                      ...build('open', open.sh.ids, 0.5, { gap: 0.022, span: 0.3 }),
                      ...build('open', open.v.ids, 2.4, { gap: 0.12, span: 0.4, how: pop }),
                      ...build('open', ['kicker', 'title', 'titlesub'], titleAt(P[0], lang),
                               { gap: 0.24, span: 0.5 }),
                  ] },
                { id: 'o1', dialogue: [vo(P[1], 0.2)], actions: [] },
            ],
        },
        {
            id: 'pakaa', palette: 'struct', background: { color: '#120d18' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('drag', { alpha: 1 })]),
            shots: [
                { id: 'g0', dialogue: [vo(P[2], 0.2)],
                  // The rows OUTSIDE the zone first: the fabric as it sits
                  // before anything drags it.
                  actions: build('drag',
                      drag.sh.ids.slice(0, drag.sh.cols * 3)
                          .concat(drag.sh.ids.slice(-drag.sh.cols * 3)),
                      0.3, { gap: 0.04, span: 0.3 }) },
                { id: 'g1', dialogue: [vo(P[3], 0.2)],
                  actions: build('drag', drag.sh.zoneIds, 0.3, { gap: 0.1, span: 0.5 }) },
                { id: 'g2', dialogue: [vo(P[4], 0.2)],
                  actions: reveal('drag', 'h', 0.3, { span: 0.45 }) },
                { id: 'g3', dialogue: [vo(P[5], 0.2)],
                  actions: pop('drag', 'out', 1.0, { span: 0.45 }) },
                { id: 'g4', dialogue: [vo(P[6], 0.2)],
                  actions: build('drag', drag.sh.ids, 0.3, { gap: 0.022, span: 0.3 }) },
                { id: 'g5', dialogue: [vo(P[7], 0.2)],
                  actions: build('drag', drag.sh.senseIds, 0.5, { gap: 0.16, span: 0.4 }) },
                { id: 'g6', dialogue: [vo(P[8], 0.2)],
                  actions: pop('drag', 'in', 0.6, { span: 0.45 }) },
            ],
        },
        {
            id: 'swali', palette: 'struct', background: { color: '#141021' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: two('asha', 'kitwana'),
            shots: [
                { id: 'q0', dialogue: [says('kitwana', P[9], 0.3)],
                  actions: [
                      { target: 'asha', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'kitwana', do: 'pose', pose: 'stand', at: 0 },
                      ...gesture('kitwana', 'ask', 0.3, { hold: 1.4 }),
                      ...blinks('asha', 5.0, 13), ...blinks('kitwana', 5.0, 31),
                  ] },
                { id: 'q1', dialogue: [says('asha', P[10], 0.3)],
                  actions: [
                      ...gesture('asha', 'count', 0.3, { hold: 1.4 }),
                      ...blinks('asha', 4.5, 47), ...blinks('kitwana', 4.5, 59),
                  ] },
            ],
        },
        {
            id: 'kwanini', palette: 'struct', background: { color: STRUCT_PALETTE.bg },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('why', { alpha: 1 })]),
            shots: [
                { id: 'y0', dialogue: [vo(P[11], 0.2)],
                  actions: [
                      ...reveal('why', 'h', 0.2, { span: 0.45 }),
                      ...build('why', why.rows.rowIds(0), 0.8, { gap: 0.1, span: 0.4 }),
                  ] },
                { id: 'y1', dialogue: [vo(P[12], 0.2)],
                  actions: build('why', why.rows.rowIds(1), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 'y2', dialogue: [vo(P[13], 0.2)],
                  actions: build('why', why.rows.rowIds(2), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 'y3', dialogue: [vo(P[14], 0.2)],
                  actions: build('why', ['dp_v', 'dp_c'], 1.0, { gap: 0.2, span: 0.5, how: pop }) },
            ],
        },
        {
            id: 'ukanda', palette: 'struct', background: { color: '#0f1408' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('belt', { alpha: 1 })]),
            shots: [
                { id: 'l0', dialogue: [vo(P[15], 0.2)],
                  actions: build('belt', ['belt_v', 'belt_c'], 0.6,
                                 { gap: 0.3, span: 0.55, how: pop }) },
            ],
        },
        {
            id: 'halo', palette: 'struct', background: { color: STRUCT_PALETTE.bg },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('halo', { alpha: 1 })]),
            shots: [
                { id: 'h0', dialogue: [vo(P[16], 0.2)],
                  actions: reveal('halo', 'h', 0.2, { span: 0.45 }) },
                { id: 'h1', dialogue: [vo(P[17], 0.2)],
                  actions: build('halo', halo.rows.rowIds(0), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 'h2', dialogue: [vo(P[18], 0.2)],
                  actions: build('halo', halo.rows.rowIds(1), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 'h3', dialogue: [vo(P[19], 0.2)],
                  actions: build('halo', halo.rows.rowIds(2), 0.3, { gap: 0.1, span: 0.4, how: pop }) },
                { id: 'h4', dialogue: [vo(P[20], 0.2)],
                  actions: build('halo', halo.rows.rowIds(3), 0.3, { gap: 0.1, span: 0.4, how: pop }) },
            ],
        },
        {
            id: 'kipimo', palette: 'struct', background: { color: '#110c17' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('test', { alpha: 1 })]),
            shots: [
                { id: 't0', dialogue: [vo(P[21], 0.2)],
                  actions: [
                      ...reveal('test', 'h', 0.2, { span: 0.45 }),
                      ...build('test', test.shA.ids, 0.7, { gap: 0.02, span: 0.3 }),
                      ...build('test', test.shB.ids, 1.1, { gap: 0.02, span: 0.3 }),
                  ] },
                { id: 't1', dialogue: [vo(P[22], 0.2)],
                  actions: [
                      ...build('test', test.cut.ids, 0.3, { gap: 0.1, span: 0.4 }),
                      ...pop('test', 'cuts', 1.0, { span: 0.45 }),
                      ...build('test', test.wth.ids, 2.2, { gap: 0.1, span: 0.4 }),
                      ...pop('test', 'with', 3.0, { span: 0.45 }),
                  ] },
                { id: 't2', dialogue: [vo(P[23], 0.2)],
                  actions: pop('test', 'tc', 0.5, { span: 0.45 }) },
            ],
        },
        {
            id: 'mzee', palette: 'struct', background: { color: '#111a12' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: two('rajabu', 'asha'),
            shots: [
                { id: 'z0', dialogue: [says('rajabu', P[24], 0.3)],
                  actions: [
                      { target: 'rajabu', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'asha', do: 'pose', pose: 'stand', at: 0 },
                      ...gesture('rajabu', 'tell', 0.4, { hold: 1.8 }),
                      ...blinks('rajabu', 6.0, 17), ...blinks('asha', 6.0, 83),
                  ] },
                { id: 'z1', dialogue: [says('asha', P[25], 0.3)],
                  actions: [
                      ...gesture('asha', 'present', 0.3, { hold: 1.8 }),
                      ...blinks('rajabu', 6.0, 29), ...blinks('asha', 6.0, 71),
                  ] },
            ],
        },
        {
            id: 'ukweli', palette: 'struct', background: { color: '#110c17' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('test', { alpha: 1 })]),
            shots: [
                { id: 'u0', dialogue: [vo(P[26], 0.2)],
                  actions: build('test', ['warn_v', 'warn_c'], 0.8,
                                 { gap: 0.22, span: 0.5, how: pop }) },
            ],
        },
        {
            id: 'card', palette: 'struct', background: { color: '#04070a' },
            transitionIn: { kind: 'crossfade', duration: 0.5 },
            cast: [offstage('asha'), castBoard('card', { alpha: 1 })],
            shots: [
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
