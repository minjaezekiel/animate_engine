/**
 * Part 3 — "It broke, and it moved" / "Ulivunjika, ukahama".
 *
 * FAULTS: fractures WITH displacement, the three kinds, and why the bends and
 * jogs along a fault are worth more than the fault plane itself.
 *
 * The geology is conventional. Displacement is the definition and the field
 * test. Normal faults drop the hanging wall under extension; reverse and
 * thrust faults push it up under compression; strike-slip faults move
 * sideways. The mineralisation argument is dilation: a planar fault surface
 * slipping does not open, but a BEND in it must either open or close as the
 * blocks move past. Releasing bends and jogs are dilational and host ore;
 * restraining bends close. Breccia matters for the same reason twice over --
 * enormous permeability, and enormous reactive surface area.
 *
 * The caution is real and is said out loud: faulted ground is bad ground.
 * Gouge is slippery, breccia is loose, and old workings follow faults
 * precisely because the ore does.
 */
import {
    build, conceal, effect, pathPart, poly, pop, rectPart, reveal, textPart,
} from '../lib/diagram.mjs';
import { FONT, GROUND_Y, L, M } from '../lib/diagram.mjs';
import {
    CHARACTERS, META, STRUCT_PALETTE, offstage, says, vo, voicesFor,
} from '../lib/structure.mjs';
import {
    bannerParts, blinks, board, cardRows, castBoard, endCard, faultParts,
    fitShots, gesture, gossanParts, hookTitle, statParts, veinParts, titleAt,
} from './common.mjs';

const TALK_Y = Math.round(GROUND_Y - 274 * 1.5);

const P3 = {
    en: [
        /* 0 HOOK */ 'If the layers on one side do not line up with the other, this is not '
            + 'a crack. It is a fault.',
        /* 1 */ 'A joint splits. A fault splits and then SLIDES. That is the only difference '
            + 'that matters.',
        /* 2 */ 'And it is the difference that makes a fault the biggest plumbing system in '
            + 'the crust.',
        /* 3 */ 'Three kinds, by what the rock was doing.',
        /* 4 */ 'Pulled apart, one side drops. Normal fault.',
        /* 5 */ 'Pushed together, one side rides up over the other. Reverse, or a thrust if '
            + 'it is shallow.',
        /* 6 */ 'Pushed sideways, the two sides slide past each other. Strike-slip.',
        /* 7 KITWANA */ 'But if the two sides are sliding, surely they are pressed together, '
            + 'not open?',
        /* 8 ASHA */ 'On a flat fault, yes. Which is why the flat parts are usually barren.',
        /* 9 */ 'Faults are not flat. They bend. And a bend has to do one of two things '
            + 'when the blocks move.',
        /*10 */ 'Bend one way and the rock is forced together. It closes. Nothing gets in.',
        /*11 */ 'Bend the other way and a hole opens. That is a dilational jog, and that is '
            + 'your target.',
        /*12 */ 'So on any fault, look for the bends and the steps. Not the straight run.',
        /*13 */ 'The second gift is breccia — rock shattered in place, all sharp edges and '
            + 'gaps.',
        /*14 */ 'Huge permeability, and huge surface area for fluid to react with. Breccia '
            + 'is where grade lives.',
        /*15 */ 'And a tell from the surface: gossan. A rusty, iron-stained cap where '
            + 'sulphides have weathered out.',
        /*16 */ 'A gossan running in a straight line across country is a fault with '
            + 'sulphides in it.',
        /*17 */ 'What do faults carry? Quartz, with gold, in the jogs.',
        /*18 */ 'Galena, sphalerite and chalcopyrite — lead, zinc and copper — in the '
            + 'breccia.',
        /*19 */ 'Barite and fluorite, near the surface, often with the lead.',
        /*20 */ 'And in volcanic country, epithermal gold and silver: banded quartz, with '
            + 'cavities in it.',
        /*21 */ 'How to read one. Slickensides — polished grooves on the fault face. They '
            + 'tell you which way it slid.',
        /*22 */ 'Offset. Find one bed on both sides and measure how far it moved.',
        /*23 */ 'And gouge: crushed clay-like rock. It seals, so look for ore on the side '
            + 'the fluid came from.',
        /*24 RAJABU */ 'The faults were always the best ground. They were also where two '
            + 'men died.',
        /*25 ASHA */ 'Say that part loudly. Faulted ground is broken ground. Gouge is '
            + 'slippery and breccia does not hold.',
        /*26 */ 'Never enter an old working. Never dig under loose rock. The ore follows the '
            + 'fault, and so does the collapse.',
        /*27 LOOP */ 'A fault breaks and slides. Next: rock that does both at once, and '
            + 'smears — the shear zone.',
    ],
    sw: [
        /* 0 HOOK */ 'Kama tabaka upande mmoja hazilingani na upande mwingine, huu si ufa. '
            + 'Ni hitilafu.',
        /* 1 */ 'Ufa unapasua. Hitilafu inapasua kisha INATELEZA. Hiyo ndiyo tofauti pekee '
            + 'ya maana.',
        /* 2 */ 'Na ndiyo tofauti inayoifanya hitilafu kuwa mfumo mkubwa zaidi wa mabomba '
            + 'ardhini.',
        /* 3 */ 'Aina tatu, kulingana na mwamba ulichokuwa unafanya.',
        /* 4 */ 'Ukivutwa kando, upande mmoja unashuka. Hitilafu ya kawaida.',
        /* 5 */ 'Ukisukumwa pamoja, upande mmoja unapanda juu ya mwingine. Reverse, au '
            + 'thrust ikiwa iko juujuu.',
        /* 6 */ 'Ukisukumwa kando, pande mbili zinapishana. Strike-slip.',
        /* 7 KITWANA */ 'Lakini kama pande zinateleza, si zinabanana, badala ya kufunguka?',
        /* 8 ASHA */ 'Kwenye hitilafu iliyonyooka, ndiyo. Ndiyo maana sehemu zilizonyooka '
            + 'mara nyingi hazina kitu.',
        /* 9 */ 'Hitilafu hazijanyooka. Zinapinda. Na pindo lazima lifanye mojawapo ya mawili.',
        /*10 */ 'Likipinda upande mmoja, mwamba unabanwa pamoja. Linafunga. Hakuna kinachoingia.',
        /*11 */ 'Likipinda upande mwingine, shimo linafunguka. Hilo ni dilational jog, na '
            + 'ndiyo shabaha yako.',
        /*12 */ 'Hivyo kwenye hitilafu yoyote, tafuta pindo na ngazi. Si sehemu iliyonyooka.',
        /*13 */ 'Zawadi ya pili ni breccia — mwamba uliosagwa pale pale, kingo kali na '
            + 'mianya.',
        /*14 */ 'Upenyezaji mkubwa, na eneo kubwa la majimaji kuathiriana nalo. Breccia '
            + 'ndipo ubora unapokaa.',
        /*15 */ 'Na dalili kutoka juu: gossan. Kofia yenye kutu, rangi ya chuma, pale salfa '
            + 'zilipooza.',
        /*16 */ 'Gossan inayokwenda mstari mnyoofu nchini ni hitilafu yenye salfa ndani yake.',
        /*17 */ 'Hitilafu zinabeba nini? Quartz, yenye dhahabu, kwenye pindo.',
        /*18 */ 'Galena, sphalerite na chalcopyrite — risasi, zinki na shaba — ndani ya '
            + 'breccia.',
        /*19 */ 'Barite na fluorite, karibu na uso, mara nyingi pamoja na risasi.',
        /*20 */ 'Na kwenye nchi ya volkano, dhahabu na fedha za epithermal: quartz yenye '
            + 'mistari na matundu.',
        /*21 */ 'Jinsi ya kuisoma. Slickensides — mistari laini kwenye uso wa hitilafu. '
            + 'Inakuambia ilitelezea upande gani.',
        /*22 */ 'Msogeo. Tafuta tabaka moja pande zote mbili upime limehama kiasi gani.',
        /*23 */ 'Na gouge: mwamba uliosagwa kama udongo. Unafunga, hivyo tafuta madini '
            + 'upande majimaji yalikotoka.',
        /*24 RAJABU */ 'Hitilafu siku zote zilikuwa ardhi bora. Pia ndipo watu wawili '
            + 'walikufa.',
        /*25 ASHA */ 'Sema hilo kwa sauti. Ardhi ya hitilafu ni ardhi iliyovunjika. Gouge '
            + 'inateleza na breccia haishiki.',
        /*26 */ 'Usiingie kwenye shimo la zamani. Usichimbe chini ya mwamba legevu. Madini '
            + 'yanafuata hitilafu, na maporomoko pia.',
        /*27 LOOP */ 'Hitilafu inavunjika na kuteleza. Sasa: mwamba unaofanya yote mawili '
            + 'kwa pamoja, na kupakaa — ukanda wa msuguano.',
    ],
};

const T = {
    en: {
        kicker: 'READING THE ROCK  ·  PART 3', title: 'It broke, and it moved',
        sub: 'faults, jogs and breccia',
        defH: 'A JOINT SPLITS. A FAULT SLIDES.', offset: 'the same bed, at two heights',
        kindsH: 'THREE KINDS, BY WHAT THE ROCK WAS DOING',
        kinds: [
            ['NORMAL', 'Pulled apart. One side drops.', '#5ec8e8'],
            ['REVERSE  ·  THRUST', 'Pushed together. One side rides up.', '#e2485f'],
            ['STRIKE-SLIP', 'Pushed sideways. The two slide past.', '#ffb23d'],
        ],
        bendH: 'A BEND MUST OPEN, OR CLOSE',
        closes: 'restraining bend — CLOSES', opens: 'releasing jog — OPENS',
        jogC: 'the jog is the target, not the straight run',
        brecH: 'BRECCIA  ·  shattered in place',
        brecC: 'huge permeability, huge surface area — where grade lives',
        gossH: 'GOSSAN', gossC: 'a rusty cap where sulphides weathered out',
        minH: 'WHAT A FAULT CARRIES',
        minRows: [
            ['QUARTZ  ·  GOLD', 'in the jogs, where the bend opened', '#ffc64d'],
            ['GALENA  ·  SPHALERITE  ·  CHALCOPYRITE', 'lead, zinc and copper in the breccia', '#9aa4ad'],
            ['BARITE  ·  FLUORITE', 'near the surface, often with the lead', '#dfe6e8'],
            ['EPITHERMAL Au–Ag', 'volcanic country — banded quartz with cavities', '#c98f2e'],
        ],
        readH: 'HOW TO READ ONE',
        reads: [
            ['SLICKENSIDES', 'Polished grooves. Which way did it slide?', '#5ec8e8'],
            ['OFFSET', 'One bed, both sides. How far did it move?', '#ffb23d'],
            ['GOUGE', 'Crushed clay. It seals — ore sits on the fluid side.', '#a4522c'],
        ],
        warnV: 'BROKEN GROUND', warnC: 'the ore follows the fault — so does the collapse',
        next: 'Next — Part 4:\nrock that breaks and bends at once',
    },
    sw: {
        kicker: 'KUSOMA MWAMBA  ·  SEHEMU 3', title: 'Ulivunjika, ukahama',
        sub: 'hitilafu, pindo na breccia',
        defH: 'UFA UNAPASUA. HITILAFU INATELEZA.', offset: 'tabaka lile lile, kwenye vimo viwili',
        kindsH: 'AINA TATU, KWA MWAMBA ULICHOKUWA UNAFANYA',
        kinds: [
            ['KAWAIDA', 'Umevutwa kando. Upande mmoja unashuka.', '#5ec8e8'],
            ['REVERSE  ·  THRUST', 'Umesukumwa pamoja. Upande mmoja unapanda.', '#e2485f'],
            ['STRIKE-SLIP', 'Umesukumwa kando. Pande mbili zinapishana.', '#ffb23d'],
        ],
        bendH: 'PINDO LAZIMA LIFUNGUKE, AU LIFUNGE',
        closes: 'pindo la kubana — LINAFUNGA', opens: 'pindo la kuachia — LINAFUNGUKA',
        jogC: 'pindo ndiyo shabaha, si sehemu iliyonyooka',
        brecH: 'BRECCIA  ·  uliosagwa pale pale',
        brecC: 'upenyezaji mkubwa, eneo kubwa — ndipo ubora unakaa',
        gossH: 'GOSSAN', gossC: 'kofia ya kutu pale salfa zilipooza',
        minH: 'HITILAFU INABEBA NINI',
        minRows: [
            ['QUARTZ  ·  DHAHABU', 'kwenye pindo, pale lilipofunguka', '#ffc64d'],
            ['GALENA  ·  SPHALERITE  ·  CHALCOPYRITE', 'risasi, zinki na shaba ndani ya breccia', '#9aa4ad'],
            ['BARITE  ·  FLUORITE', 'karibu na uso, mara nyingi na risasi', '#dfe6e8'],
            ['EPITHERMAL Au–Ag', 'nchi ya volkano — quartz yenye mistari na matundu', '#c98f2e'],
        ],
        readH: 'JINSI YA KUISOMA',
        reads: [
            ['SLICKENSIDES', 'Mistari laini. Ilitelezea upande gani?', '#5ec8e8'],
            ['MSOGEO', 'Tabaka moja, pande mbili. Limehama kiasi gani?', '#ffb23d'],
            ['GOUGE', 'Udongo uliosagwa. Unafunga — madini upande wa majimaji.', '#a4522c'],
        ],
        warnV: 'ARDHI ILIYOVUNJIKA', warnC: 'madini yanafuata hitilafu — na maporomoko pia',
        next: 'Inayofuata — Sehemu 4:\nmwamba unaovunjika na kupinda kwa pamoja',
    },
};

function boardOpen(t) {
    const f = faultParts('of', { top: 660, bandH: 54, layers: 5, throw_: 96, angle: 0.3 });
    return { ...board('open', [...f.parts, ...hookTitle(t.kicker, t.title, t.sub)]), f };
}

function boardDef(t) {
    const f = faultParts('df', { top: 680, bandH: 56, layers: 5, throw_: 100, angle: 0.32 });
    return { ...board('def', [
        textPart('h', t.defH, { at: [540, 580], font: `800 34px ${FONT}`, fill: 'ink',
                                alpha: 0, z: 150, maxWidth: 940 }),
        ...f.parts,
        textPart('off', t.offset, { at: [540, 1140], font: `700 28px ${FONT}`, fill: 'carbonate',
                                    alpha: 0, z: 150, maxWidth: 900 }),
    ]), f };
}

function boardKinds(t) {
    const rows = cardRows('kr', t.kinds, { top: 640, h: 176, gap: 26 });
    return { ...board('kinds', [
        textPart('h', t.kindsH, { at: [540, 566], font: `700 31px ${FONT}`, fill: 'dim',
                                  alpha: 0, z: 60, maxWidth: 940 }),
        ...rows.parts,
    ]), rows };
}

/** The jog. The one idea that makes this part worth three minutes. */
function boardBend(t) {
    // A strike-slip fault drawn in MAP view, with one restraining bend and
    // one releasing jog on the same trace -- so the difference is a
    // comparison and not two separate diagrams.
    const trace = `${M(90, 1080)} ${L(360, 980)} ${L(430, 860)} ${L(700, 780)} `
        + `${L(760, 900)} ${L(1000, 820)}`;
    const vein = veinParts('jv', [[432, 866], [470, 820], [520, 800], [580, 790], [640, 786]],
                           { width: 36, ore: 4, z: 140 });
    return { ...board('bend', [
        textPart('h', t.bendH, { at: [540, 600], font: `800 34px ${FONT}`, fill: 'ink',
                                 alpha: 0, z: 160, maxWidth: 940 }),
        pathPart('trace', trace, { stroke: 'fault', strokeWidth: 9, alpha: 0, z: 100,
                                   lineCap: 'round' }),
        // the sense of slip, one arrow each side
        pathPart('sA', `${M(150, 1000)} ${L(280, 952)} ${L(246, 938)}`,
                 { stroke: 'ink', strokeWidth: 5, alpha: 0, z: 160, lineCap: 'round' }),
        pathPart('sB', `${M(940, 900)} ${L(810, 948)} ${L(844, 962)}`,
                 { stroke: 'ink', strokeWidth: 5, alpha: 0, z: 160, lineCap: 'round' }),
        rectPart('closeM', 170, 66, { at: [812, 974], fill: '#3a1119', stroke: 'fault',
                                      strokeWidth: 2, alpha: 0, z: 110 }),
        textPart('closeT', t.closes, { at: [812, 1058], font: `700 25px ${FONT}`, fill: 'fault',
                                       alpha: 0, z: 160, maxWidth: 420 }),
        ...vein.parts,
        textPart('openT', t.opens, { at: [470, 706], font: `700 27px ${FONT}`, fill: 'gold',
                                     alpha: 0, z: 160, maxWidth: 520 }),
        textPart('jc', t.jogC, { at: [540, 1200], font: `700 28px ${FONT}`, fill: 'dim',
                                 alpha: 0, z: 160, maxWidth: 900 }),
    ]), vein };
}

function boardBrec(t) {
    const f = faultParts('bf', { top: 680, bandH: 54, layers: 5, throw_: 90, angle: 0.3,
                                 breccia: 16 });
    const goss = gossanParts('goss', { x: 200, w: 680, y: 600, h: 74 });
    return { ...board('brec', [
        ...f.parts, ...goss.parts,
        textPart('h', t.brecH, { at: [540, 1160], font: `800 34px ${FONT}`, fill: 'ink',
                                 alpha: 0, z: 160, maxWidth: 940 }),
        textPart('bc', t.brecC, { at: [540, 1216], font: `600 27px ${FONT}`, fill: 'dim',
                                  alpha: 0, z: 160, maxWidth: 900 }),
        textPart('gh', t.gossH, { at: [540, 548], font: `800 34px ${FONT}`, fill: 'gossan',
                                  alpha: 0, z: 160 }),
        textPart('gc', t.gossC, { at: [540, 1272], font: `600 27px ${FONT}`, fill: 'gossan',
                                  alpha: 0, z: 160, maxWidth: 900 }),
    ]), f, goss };
}

function boardMin(t) {
    const rows = cardRows('mr', t.minRows, { top: 596, h: 162, gap: 20 });
    return { ...board('min', [
        textPart('h', t.minH, { at: [540, 532], font: `800 36px ${FONT}`, fill: 'ink',
                                alpha: 0, z: 60, maxWidth: 940 }),
        ...rows.parts,
    ]), rows };
}

function boardRead(t) {
    const rows = cardRows('rr', t.reads, { top: 616, h: 172, gap: 24 });
    return { ...board('read', [
        textPart('h', t.readH, { at: [540, 548], font: `800 36px ${FONT}`, fill: 'ink',
                                 alpha: 0, z: 60, maxWidth: 940 }),
        ...rows.parts,
        ...statParts('warn', t.warnV, t.warnC, { at: [540, 1256], fill: 'fault', size: 56 }),
    ]), rows };
}

export function partThree(lang) {
    const t = T[lang], P = P3[lang];
    const open = boardOpen(t), def = boardDef(t), kinds = boardKinds(t);
    const bend = boardBend(t), brec = boardBrec(t), min = boardMin(t), read = boardRead(t);
    const card = endCard(lang, t.next);
    const ban = bannerParts(lang, 3);
    const boards = [open, def, kinds, bend, brec, min, read,
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
                      ...build('open', open.f.leftIds, 0.2, { gap: 0.1, span: 0.35 }),
                      ...build('open', open.f.rightIds, 1.0, { gap: 0.1, span: 0.35 }),
                      ...reveal('open', open.f.planeId, 2.0, { span: 0.4 }),
                      ...build('open', ['kicker', 'title', 'titlesub'], titleAt(P[0], lang),
                               { gap: 0.24, span: 0.5 }),
                  ] },
            ],
        },
        {
            id: 'def', palette: 'struct', background: { color: '#0d1319' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('def', { alpha: 1 })]),
            shots: [
                { id: 'd0', dialogue: [vo(P[1], 0.2)],
                  actions: [
                      ...reveal('def', 'h', 0.2, { span: 0.4 }),
                      ...build('def', def.f.leftIds, 0.6, { gap: 0.09, span: 0.3 }),
                      ...build('def', def.f.rightIds, 1.4, { gap: 0.09, span: 0.3 }),
                      ...reveal('def', def.f.planeId, 2.4, { span: 0.4 }),
                      ...build('def', def.f.slipIds, 2.8, { gap: 0.14, span: 0.4 }),
                      ...pop('def', 'off', 3.6, { span: 0.45 }),
                  ] },
                { id: 'd1', dialogue: [vo(P[2], 0.2)], actions: [] },
            ],
        },
        {
            id: 'aina', palette: 'struct', background: { color: STRUCT_PALETTE.bg },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('kinds', { alpha: 1 })]),
            shots: [
                { id: 'k0', dialogue: [vo(P[3], 0.2)],
                  actions: reveal('kinds', 'h', 0.2, { span: 0.45 }) },
                { id: 'k1', dialogue: [vo(P[4], 0.2)],
                  actions: build('kinds', kinds.rows.rowIds(0), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 'k2', dialogue: [vo(P[5], 0.2)],
                  actions: build('kinds', kinds.rows.rowIds(1), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 'k3', dialogue: [vo(P[6], 0.2)],
                  actions: build('kinds', kinds.rows.rowIds(2), 0.3, { gap: 0.1, span: 0.4 }) },
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
                      ...gesture('kitwana', 'ask', 0.3, { hold: 1.6 }),
                      ...blinks('asha', 5.5, 13), ...blinks('kitwana', 5.5, 31),
                  ] },
                { id: 'q1', dialogue: [says('asha', P[8], 0.3)],
                  actions: [
                      ...gesture('asha', 'present', 0.3, { hold: 1.6 }),
                      ...blinks('asha', 5.5, 47), ...blinks('kitwana', 5.5, 59),
                  ] },
            ],
        },
        {
            id: 'pindo', palette: 'struct', background: { color: '#140d10' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('bend', { alpha: 1 })]),
            shots: [
                { id: 'b0', dialogue: [vo(P[9], 0.2)],
                  actions: [
                      ...reveal('bend', 'h', 0.2, { span: 0.45 }),
                      ...reveal('bend', 'trace', 0.8, { span: 0.6 }),
                      ...build('bend', ['sA', 'sB'], 1.8, { gap: 0.16, span: 0.4 }),
                  ] },
                { id: 'b1', dialogue: [vo(P[10], 0.2)],
                  actions: [
                      ...reveal('bend', 'closeM', 0.4, { span: 0.4 }),
                      ...pop('bend', 'closeT', 1.0, { span: 0.45 }),
                  ] },
                { id: 'b2', dialogue: [vo(P[11], 0.2)],
                  actions: [
                      ...build('bend', bend.vein.ids, 0.4, { gap: 0.14, span: 0.4, how: pop }),
                      ...pop('bend', 'openT', 1.8, { span: 0.45 }),
                  ] },
                { id: 'b3', dialogue: [vo(P[12], 0.2)],
                  actions: pop('bend', 'jc', 0.6, { span: 0.45 }) },
            ],
        },
        {
            id: 'breccia', palette: 'struct', background: { color: '#130e0a' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('brec', { alpha: 1 })]),
            shots: [
                { id: 'r0', dialogue: [vo(P[13], 0.2)],
                  actions: [
                      ...build('brec', brec.f.leftIds, 0.2, { gap: 0.08, span: 0.3 }),
                      ...build('brec', brec.f.rightIds, 0.7, { gap: 0.08, span: 0.3 }),
                      ...reveal('brec', brec.f.planeId, 1.3, { span: 0.4 }),
                      ...build('brec', brec.f.brecciaIds, 1.7, { gap: 0.07, span: 0.3, how: pop }),
                      ...pop('brec', 'h', 3.4, { span: 0.45 }),
                  ] },
                { id: 'r1', dialogue: [vo(P[14], 0.2)],
                  actions: pop('brec', 'bc', 0.5, { span: 0.45 }) },
                { id: 'r2', dialogue: [vo(P[15], 0.2)],
                  actions: [
                      ...build('brec', brec.goss.ids, 0.3, { gap: 0.1, span: 0.5 }),
                      ...pop('brec', 'gh', 1.0, { span: 0.45 }),
                      ...pop('brec', 'gc', 2.0, { span: 0.45 }),
                  ] },
                { id: 'r3', dialogue: [vo(P[16], 0.2)], actions: [] },
            ],
        },
        {
            id: 'madini', palette: 'struct', background: { color: STRUCT_PALETTE.bg },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('min', { alpha: 1 })]),
            shots: [
                { id: 'm0', dialogue: [vo(P[17], 0.2)],
                  actions: [
                      ...reveal('min', 'h', 0.2, { span: 0.45 }),
                      ...build('min', min.rows.rowIds(0), 0.8, { gap: 0.1, span: 0.4, how: pop }),
                  ] },
                { id: 'm1', dialogue: [vo(P[18], 0.2)],
                  actions: build('min', min.rows.rowIds(1), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 'm2', dialogue: [vo(P[19], 0.2)],
                  actions: build('min', min.rows.rowIds(2), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 'm3', dialogue: [vo(P[20], 0.2)],
                  actions: build('min', min.rows.rowIds(3), 0.3, { gap: 0.1, span: 0.4 }) },
            ],
        },
        {
            id: 'soma', palette: 'struct', background: { color: '#0d1319' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('read', { alpha: 1 })]),
            shots: [
                { id: 's0', dialogue: [vo(P[21], 0.2)],
                  actions: [
                      ...reveal('read', 'h', 0.2, { span: 0.45 }),
                      ...build('read', read.rows.rowIds(0), 0.8, { gap: 0.1, span: 0.4 }),
                  ] },
                { id: 's1', dialogue: [vo(P[22], 0.2)],
                  actions: build('read', read.rows.rowIds(1), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 's2', dialogue: [vo(P[23], 0.2)],
                  actions: build('read', read.rows.rowIds(2), 0.3, { gap: 0.1, span: 0.4 }) },
            ],
        },
        {
            id: 'hatari', palette: 'struct', background: { color: '#1a1210' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: two('rajabu', 'asha'),
            shots: [
                { id: 'h0', dialogue: [says('rajabu', P[24], 0.3)],
                  actions: [
                      { target: 'rajabu', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'asha', do: 'pose', pose: 'stand', at: 0 },
                      ...gesture('rajabu', 'tell', 0.4, { hold: 1.8 }),
                      ...blinks('rajabu', 6.0, 17), ...blinks('asha', 6.0, 83),
                  ] },
                { id: 'h1', dialogue: [says('asha', P[25], 0.3)],
                  actions: [
                      ...gesture('asha', 'count', 0.3, { hold: 2.0 }),
                      ...blinks('rajabu', 6.5, 29), ...blinks('asha', 6.5, 71),
                  ] },
            ],
        },
        {
            id: 'onyo', palette: 'struct', background: { color: '#0d1319' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('read', { alpha: 1 })]),
            shots: [
                // The safety line gets a shot of its own and the whole frame.
                // Buried inside another line it is a line nobody hears, and
                // this is the one piece of the series that can hurt somebody.
                { id: 'w0', dialogue: [vo(P[26], 0.2)],
                  actions: [
                      ...reveal('read', 'h', 0, { span: 0.01 }),
                      ...build('read', read.rows.allIds, 0, { gap: 0, span: 0.01 }),
                      ...build('read', ['warn_v', 'warn_c'], 0.8,
                               { gap: 0.2, span: 0.5, how: pop }),
                  ] },
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
