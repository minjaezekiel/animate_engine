/**
 * Part 1 — "The crack that was open" / "Ufa uliokuwa wazi".
 *
 * JOINTS: fractures with no displacement across them, why they are the
 * plumbing of every rock mass, and why only one set in an outcrop is usually
 * worth anything.
 *
 * The geology is conventional. A joint is a fracture with no shear offset --
 * that is the definition, and it is the one test that separates it from a
 * fault in the field. Joints form in sets by unloading, cooling contraction
 * and tectonic stress; spacing scales with bed thickness. Their importance to
 * mineralisation is permeability: intact crystalline rock has effectively
 * none, so fracture porosity is the only route hot fluid has. A joint that
 * was held open normal to the least compressive stress is a conduit; one
 * squeezed shut is not, which is why a single set in a multi-set outcrop is
 * typically the mineralised one.
 *
 * The honest caveat, said out loud in the narration: a quartz-filled joint
 * proves fluid moved, and nothing more. Most quartz veins carry no gold.
 * Part six returns to that.
 */
import {
    L, M, build, conceal, effect, pathPart, poly, pop, rectPart, reveal, textPart,
} from '../lib/diagram.mjs';
import { FONT, GROUND_Y } from '../lib/diagram.mjs';
import {
    CHARACTERS, META, STRUCT_PALETTE, offstage, says, vo, voicesFor,
} from '../lib/structure.mjs';
import {
    bannerParts, bedsParts, blinks, board, cardRows, castBoard,
    endCard, fitShots, gesture, hookTitle, jointSetParts, statParts, veinParts, titleAt,
} from './common.mjs';

const TALK_Y = Math.round(GROUND_Y - 274 * 1.5);

/** The narration, indexed, so a rewrite is one edit and not three. */
const P1 = {
    en: [
        /* 0 HOOK */ 'Gold does not hide in solid rock. It hides in cracks — and only '
            + 'some of them.',
        /* 1 */ 'A crack with no movement across it is a joint. That is the whole definition.',
        /* 2 */ 'Check the layers either side. Still lined up? Joint. Shifted? That is a '
            + 'fault — part three.',
        /* 3 */ 'Joints come in sets — many of them, parallel, all made by the same push.',
        /* 4 */ 'Most outcrops carry two or three sets crossing, cutting the rock into blocks.',
        /* 5 */ 'Now the part that matters. Solid rock will not pass water. A joint will. '
            + 'A joint is space.',
        /* 6 KITWANA */ 'So any crack can fill with minerals?',
        /* 7 ASHA */ 'No. And that is the most useful sentence in this video.',
        /* 8 */ 'A joint only counts if it was held open while fluid moved. Squeezed shut, '
            + 'it carries nothing.',
        /* 9 */ 'So usually only one set in an outcrop is mineralised — the one that was '
            + 'open that day.',
        /*10 */ 'That is the set you want. You find it by what is inside the cracks, not '
            + 'the cracks.',
        /*11 */ 'Empty joint. Just a crack. Nothing moved through it.',
        /*12 */ 'White quartz filling it — fluid moved, carrying silica. Now you are interested.',
        /*13 */ 'Calcite is softer, and it fizzes under acid. Cooler fluid, different chemistry.',
        /*14 */ 'Orange-brown staining down the walls. Something with sulphide sat here and '
            + 'rotted away.',
        /*15 */ 'That stain is the cheapest clue in geology, and most people walk past it.',
        /*16 RAJABU */ 'In my pit, the good rock always had those yellow-brown lines. We '
            + 'never knew why.',
        /*17 ASHA */ 'It is iron, left when pyrite broke down. And pyrite often travels '
            + 'with gold.',
        /*18 */ 'What fills it depends on the rock it cuts. Granite and gneiss: quartz, '
            + 'feldspar, tourmaline, beryl.',
        /*19 */ 'Basalt: zeolites, agate and amethyst, filling cracks and old gas bubbles.',
        /*20 */ 'Limestone: calcite, fluorite, and the lead and zinc sulphides — galena and '
            + 'sphalerite.',
        /*21 */ 'And in any of them, if the fluid came up hot and deep: quartz with '
            + 'sulphides, sometimes gold.',
        /*22 */ 'Three checks, and you need no equipment.',
        /*23 */ 'One: stand back and count the directions. Two: walk each one and ask which '
            + 'is filled.',
        /*24 */ 'Three: test the fill. A knife will not scratch quartz. It scratches '
            + 'calcite, and acid makes it fizz.',
        /*25 */ 'One set, quartz-filled, running tens of metres — follow it. A single crack '
            + 'is not a target.',
        /*26 */ 'But be honest: quartz proves fluid moved, not gold. Most quartz veins '
            + 'carry none.',
        /*27 LOOP */ 'A joint is where fluid could go. Next: where it is forced to gather '
            + '— a fold.',
    ],
    sw: [
        /* 0 HOOK */ 'Dhahabu haijifichi ndani ya mwamba mgumu. Inajificha kwenye nyufa — '
            + 'na si kila ufa.',
        /* 1 */ 'Ufa usio na msogeo pande zake mbili huitwa ufa tu. Hiyo ndiyo maana yake yote.',
        /* 2 */ 'Angalia tabaka pande zote mbili. Bado zinalingana? Ni ufa. Zimehama? Hiyo ni '
            + 'hitilafu, tutaifikia sehemu ya tatu.',
        /* 3 */ 'Nyufa huja kwa makundi — nyingi, sambamba, zote zimetengenezwa na msukumo '
            + 'mmoja.',
        /* 4 */ 'Mwamba mwingi una makundi mawili au matatu yanayokatizana, na kwa pamoja '
            + 'yanaukata mwamba vipande.',
        /* 5 */ 'Sasa kitu cha muhimu. Mwamba mgumu hauruhusu maji kupita. Ufa unaruhusu. '
            + 'Ufa ni nafasi.',
        /* 6 KITWANA */ 'Kwa hiyo kila ufa unaweza kujaa madini?',
        /* 7 ASHA */ 'Hapana. Na hilo ndilo neno la maana zaidi kwenye video hii.',
        /* 8 */ 'Ufa unafaa tu kama ulikuwa wazi wakati majimaji ya moto yanapita. '
            + 'Ukibanwa, haubebi chochote.',
        /* 9 */ 'Hivyo kwenye mwamba mmoja, mara nyingi kundi moja tu ndilo lenye madini — '
            + 'lile lililokuwa wazi siku ile.',
        /*10 */ 'Hilo ndilo kundi unalolitaka, na unalipata kwa kuangalia kilichomo ndani ya '
            + 'nyufa, si nyufa zenyewe.',
        /*11 */ 'Ufa mtupu. Ni ufa tu. Hakuna kilichowahi kupita.',
        /*12 */ 'Umejaa quartz nyeupe — majimaji yalipita, yakibeba silika. Sasa anza '
            + 'kushughulika.',
        /*13 */ 'Kalsiti ni laini zaidi, na inatoa povu ukidondosha asidi. Majimaji ya '
            + 'baridi zaidi, kemia tofauti.',
        /*14 */ 'Rangi ya chungwa-kahawia kuta za ufa. Kitu chenye salfa kilikaa hapa kisha '
            + 'kikaoza.',
        /*15 */ 'Doa hilo ndilo dalili ya bei rahisi kuliko zote, na watu wengi wanalipita tu.',
        /*16 RAJABU */ 'Kwenye shimo langu, mwamba mzuri siku zote ulikuwa na mistari ile ya '
            + 'njano-kahawia. Hatukujua sababu.',
        /*17 ASHA */ 'Ni chuma kilichobaki pyrite ilipooza. Na pyrite mara nyingi husafiri '
            + 'pamoja na dhahabu.',
        /*18 */ 'Kinachojaza ufa kinategemea mwamba unaokatwa. Kwenye granite na gneiss: '
            + 'quartz, feldspar, tourmaline, mara nyingine berili.',
        /*19 */ 'Kwenye basalt: zeolite, akiki na amethisti, zikijaza nyufa na matundu ya '
            + 'gesi ya zamani.',
        /*20 */ 'Kwenye chokaa: kalsiti, fluorite, na salfa za risasi na zinki — galena na '
            + 'sphalerite.',
        /*21 */ 'Na kwenye yoyote kati ya hiyo, kama majimaji yalitoka chini yakiwa ya moto: '
            + 'quartz yenye salfa, na mara nyingine dhahabu.',
        /*22 */ 'Vipimo vitatu, na huhitaji kifaa chochote.',
        /*23 */ 'Kimoja: simama mbali uhesabu pande. Pili: tembea kila upande ujiulize ni '
            + 'upi umejaa.',
        /*24 */ 'Tatu: pima kilichojaa. Kisu hakikwaruzi quartz. Kinakwaruza kalsiti, na '
            + 'asidi inaifanya kalsiti itoe povu.',
        /*25 */ 'Kundi moja, limejaa quartz, likienda mita nyingi — fuata hilo. Ufa mmoja '
            + 'peke yake si shabaha.',
        /*26 */ 'Lakini kuwa mkweli: quartz inathibitisha majimaji yalipita. Haithibitishi '
            + 'dhahabu. Mishipa mingi ya quartz haina kitu.',
        /*27 LOOP */ 'Ufa ni mahali majimaji yangeweza kwenda. Sasa, mahali yanapolazimika '
            + 'kukusanyika — huo ni mkunjo.',
    ],
};

const T = {
    en: {
        kicker: 'READING THE ROCK  ·  PART 1',
        title: 'The crack that was open',
        sub: 'joints, and why only one set pays',
        defH: 'NO MOVEMENT ACROSS IT',
        defYes: 'layers line up  =  JOINT',
        defNo: 'layers offset  =  FAULT',
        setsH: 'JOINTS COME IN SETS',
        setA: 'set 1', setB: 'set 2',
        spaceH: 'ROCK IS NOT PERMEABLE. A JOINT IS.',
        spaceN: 'fracture porosity',
        spaceC: 'the only road fluid has',
        openH: 'OPEN, OR SQUEEZED SHUT',
        openL: 'held OPEN  →  a pipe',
        openR: 'squeezed SHUT  →  nothing',
        fillH: 'LOOK AT WHAT IS INSIDE',
        rows: [
            ['EMPTY', 'Just a crack. Nothing ever moved through it.', '#8fa0b0'],
            ['QUARTZ', 'White, glassy, a knife will not scratch it.\nFluid moved, carrying silica.', '#ece8dd'],
            ['CALCITE', 'Softer, and it fizzes under acid.\nCooler fluid, different chemistry.', '#dfe6e8'],
            ['IRON STAIN', 'Orange-brown down the walls.\nSulphide sat here and rotted away.', '#a4522c'],
        ],
        minH: 'WHAT FILLS IT DEPENDS ON THE ROCK',
        minRows: [
            ['GRANITE  ·  GNEISS', 'quartz, feldspar, tourmaline, sometimes beryl', '#c4b8a4'],
            ['BASALT', 'zeolites, agate, amethyst — cracks and old gas bubbles', '#2e3339'],
            ['LIMESTONE', 'calcite, fluorite, galena, sphalerite', '#dfe6e8'],
            ['ANY, IF HOT AND DEEP', 'quartz with sulphides — and sometimes gold', '#ffc64d'],
        ],
        checkH: 'THREE CHECKS, NO EQUIPMENT',
        checks: [
            ['1  ·  COUNT', 'Stand back. How many directions are there?', '#5ec8e8'],
            ['2  ·  WALK', 'Follow each direction. Which one is filled?', '#ffb23d'],
            ['3  ·  TEST', 'Knife and acid. Quartz resists. Calcite fizzes.', '#ffc64d'],
        ],
        warnV: 'MOST',
        warnC: 'quartz veins carry no gold at all',
        next: 'Next — Part 2:\nthe fold, and the hinge that collects',
    },
    sw: {
        kicker: 'KUSOMA MWAMBA  ·  SEHEMU 1',
        title: 'Ufa uliokuwa wazi',
        sub: 'nyufa, na kwa nini kundi moja tu linalipa',
        defH: 'HAKUNA MSOGEO PANDE ZAKE',
        defYes: 'tabaka zinalingana  =  UFA',
        defNo: 'tabaka zimehama  =  HITILAFU',
        setsH: 'NYUFA HUJA KWA MAKUNDI',
        setA: 'kundi 1', setB: 'kundi 2',
        spaceH: 'MWAMBA HAUPENYEZI. UFA UNAPENYEZA.',
        spaceN: 'nafasi ya nyufa',
        spaceC: 'njia pekee ya majimaji',
        openH: 'WAZI, AU UMEBANWA',
        openL: 'uko WAZI  →  ni bomba',
        openR: 'UMEBANWA  →  hakuna kitu',
        fillH: 'ANGALIA KILICHOMO NDANI',
        rows: [
            ['MTUPU', 'Ni ufa tu. Hakuna kilichowahi kupita.', '#8fa0b0'],
            ['QUARTZ', 'Nyeupe, kama kioo, kisu hakikwaruzi.\nMajimaji yalipita yakibeba silika.', '#ece8dd'],
            ['KALSITI', 'Laini zaidi, inatoa povu kwa asidi.\nMajimaji ya baridi, kemia tofauti.', '#dfe6e8'],
            ['DOA LA CHUMA', 'Chungwa-kahawia kutani.\nSalfa ilikaa hapa kisha ikaoza.', '#a4522c'],
        ],
        minH: 'KINACHOJAZA KINATEGEMEA MWAMBA',
        minRows: [
            ['GRANITE  ·  GNEISS', 'quartz, feldspar, tourmaline, mara nyingine berili', '#c4b8a4'],
            ['BASALT', 'zeolite, akiki, amethisti — nyufa na matundu ya gesi', '#2e3339'],
            ['CHOKAA', 'kalsiti, fluorite, galena, sphalerite', '#dfe6e8'],
            ['YOYOTE, IKIWA MOTO', 'quartz yenye salfa — na mara nyingine dhahabu', '#ffc64d'],
        ],
        checkH: 'VIPIMO VITATU, BILA KIFAA',
        checks: [
            ['1  ·  HESABU', 'Simama mbali. Kuna pande ngapi?', '#5ec8e8'],
            ['2  ·  TEMBEA', 'Fuata kila upande. Ni upi umejaa?', '#ffb23d'],
            ['3  ·  PIMA', 'Kisu na asidi. Quartz inakataa. Kalsiti inatoa povu.', '#ffc64d'],
        ],
        warnV: 'MINGI',
        warnC: 'ya mishipa ya quartz haina dhahabu kabisa',
        next: 'Inayofuata — Sehemu 2:\nmkunjo, na pembe inayokusanya',
    },
};

// --- boards ----------------------------------------------------------------

/** Opening: a jointed outcrop, with the title arriving under the hook. */
function boardOpen(t, lang) {
    const beds = bedsParts('ob', { top: 640, tilt: 0.06 });
    const js = jointSetParts('oj', { x0: 150, x1: 930, y0: 620, y1: 1000, n: 6, angle: 0.3,
                                     box: { x0: 70, y0: 626, x1: 1010, y1: 1004 } });
    const vein = veinParts('ov', [[300, 1010], [430, 880], [520, 760], [610, 640]],
                           { width: 26, ore: 4, z: 90 });
    return {
        ...board('open', [
            ...beds.parts, ...js.parts, ...vein.parts,
            ...hookTitle(t.kicker, t.title, t.sub),
        ]),
        beds, js, vein,
    };
}

/** The definition: joint versus fault, side by side. */
function boardDef(t) {
    const left = bedsParts('dl', { x: 70, w: 420, top: 700, h: 46,
        bands: [['bed', 46], ['carbonate', 40], ['bedAlt', 46], ['bed', 40]] });
    // The SAME beds, offset. The comparison is the teaching, so the two sides
    // differ in exactly one thing and nothing else.
    const rightTop = bedsParts('dr', { x: 590, w: 210, top: 700, h: 46,
        bands: [['bed', 46], ['carbonate', 40], ['bedAlt', 46], ['bed', 40]] });
    const rightBot = bedsParts('dq', { x: 800, w: 210, top: 778, h: 46,
        bands: [['bed', 46], ['carbonate', 40], ['bedAlt', 46], ['bed', 40]] });
    return {
        ...board('def', [
            textPart('h', t.defH, { at: [540, 560], font: `700 32px ${FONT}`, fill: 'dim',
                                    alpha: 0, z: 60, maxWidth: 940 }),
            ...left.parts,
            pathPart('jl', `${M(280, 676)} ${L(280, 928)}`,
                     { stroke: 'joint', strokeWidth: 6, alpha: 0, z: 50, lineCap: 'round' }),
            textPart('yes', t.defYes, { at: [280, 980], font: `700 28px ${FONT}`,
                                        fill: 'joint', alpha: 0, z: 60, maxWidth: 440 }),
            ...rightTop.parts, ...rightBot.parts,
            pathPart('fl', `${M(800, 676)} ${L(800, 1006)}`,
                     { stroke: 'fault', strokeWidth: 6, alpha: 0, z: 50, lineCap: 'round' }),
            textPart('no', t.defNo, { at: [800, 1060], font: `700 28px ${FONT}`,
                                      fill: 'fault', alpha: 0, z: 60, maxWidth: 420 }),
        ]),
        left, rightTop, rightBot,
    };
}

/** Two sets crossing, cutting the rock into blocks. */
function boardSets(t) {
    // Both sets are clipped to the block. An angle is a direction, not a
    // length, so without a box the far end of every line leaves the outcrop.
    const BOX = { x0: 96, y0: 596, x1: 984, y1: 1144 };
    const a = jointSetParts('sa', { x0: 60, x1: 1020, y0: 596, y1: 1144, n: 7, angle: 0.3,
                                    box: BOX });
    const b = jointSetParts('sb', { x0: 60, x1: 1500, y0: 596, y1: 1144, n: 7, angle: -0.95,
                                    stroke: 'fold', box: BOX });
    return {
        ...board('sets', [
            rectPart('bg', 900, 560, { at: [540, 870], fill: 'rock', stroke: '#2a241c',
                                       strokeWidth: 3, alpha: 0, z: -10 }),
            textPart('h', t.setsH, { at: [540, 540], font: `700 32px ${FONT}`, fill: 'dim',
                                     alpha: 0, z: 60, maxWidth: 940 }),
            ...a.parts, ...b.parts,
            textPart('la', t.setA, { at: [250, 1192], font: `700 28px ${FONT}`,
                                     fill: 'joint', alpha: 0, z: 60 }),
            textPart('lb', t.setB, { at: [790, 1192], font: `700 28px ${FONT}`,
                                     fill: 'fold', alpha: 0, z: 60 }),
        ]),
        a, b,
    };
}

/** Permeability: the single idea the whole part turns on. */
function boardSpace(t) {
    return board('space', [
        textPart('h', t.spaceH, { at: [540, 580], font: `800 36px ${FONT}`, fill: 'ink',
                                  alpha: 0, z: 60, maxWidth: 940 }),
        rectPart('solid', 380, 300, { at: [300, 820], fill: 'rock', stroke: '#2a241c',
                                      strokeWidth: 3, alpha: 0, z: 10 }),
        rectPart('frac', 380, 300, { at: [780, 820], fill: 'rock', stroke: '#2a241c',
                                     strokeWidth: 3, alpha: 0, z: 10 }),
        ...jointSetParts('fj', { x0: 620, x1: 940, y0: 666, y1: 974, n: 5, angle: 0.12,
                                 filled: true, strokeWidth: 7, z: 20,
                                 box: { x0: 594, y0: 672, x1: 966, y1: 968 } }).parts,
        ...statParts('perm', '0', t.spaceN, { at: [300, 1052], fill: 'dim', size: 72 }),
        ...statParts('perm2', '>0', t.spaceC, { at: [780, 1052], fill: 'joint', size: 72 }),
    ]);
}

/** Open versus shut: why only one set pays. */
function boardOpen2(t) {
    return board('open2', [
        textPart('h', t.openH, { at: [540, 580], font: `800 36px ${FONT}`, fill: 'ink',
                                 alpha: 0, z: 60, maxWidth: 940 }),
        // open: a gap with quartz in it
        ...jointSetParts('oo', { x0: 200, x1: 400, y0: 680, y1: 1040, n: 2, angle: 0.06,
                                 filled: true, strokeWidth: 16, z: 20 }).parts,
        textPart('ol', t.openL, { at: [300, 1104], font: `700 28px ${FONT}`, fill: 'joint',
                                  alpha: 0, z: 60, maxWidth: 440 }),
        // shut: hairlines, and arrows pressing in
        ...jointSetParts('oc', { x0: 700, x1: 860, y0: 680, y1: 1040, n: 2, angle: 0.06,
                                 strokeWidth: 3, stroke: 'dim', z: 20 }).parts,
        pathPart('pL', `${M(600, 860)} ${L(690, 860)} ${L(664, 842)} ${M(690, 860)} ${L(664, 878)}`,
                 { stroke: 'fault', strokeWidth: 6, alpha: 0, z: 60, lineCap: 'round' }),
        pathPart('pR', `${M(980, 860)} ${L(890, 860)} ${L(916, 842)} ${M(890, 860)} ${L(916, 878)}`,
                 { stroke: 'fault', strokeWidth: 6, alpha: 0, z: 60, lineCap: 'round' }),
        textPart('or', t.openR, { at: [790, 1104], font: `700 28px ${FONT}`, fill: 'fault',
                                  alpha: 0, z: 60, maxWidth: 420 }),
    ]);
}

function boardFill(t) {
    const rows = cardRows('fr', t.rows, { top: 600, h: 168, gap: 20 });
    return { ...board('fill', [
        textPart('h', t.fillH, { at: [540, 536], font: `800 36px ${FONT}`, fill: 'ink',
                                 alpha: 0, z: 60, maxWidth: 940 }),
        ...rows.parts,
    ]), rows };
}

function boardMin(t) {
    const rows = cardRows('mr', t.minRows, { top: 600, h: 162, gap: 20 });
    return { ...board('min', [
        textPart('h', t.minH, { at: [540, 536], font: `800 34px ${FONT}`, fill: 'ink',
                                alpha: 0, z: 60, maxWidth: 940 }),
        ...rows.parts,
    ]), rows };
}

function boardCheck(t) {
    const rows = cardRows('cr', t.checks, { top: 620, h: 170, gap: 24 });
    return { ...board('check', [
        textPart('h', t.checkH, { at: [540, 548], font: `800 36px ${FONT}`, fill: 'ink',
                                  alpha: 0, z: 60, maxWidth: 940 }),
        ...rows.parts,
        ...statParts('warn', t.warnV, t.warnC, { at: [540, 1256], fill: 'fault', size: 84 }),
    ]), rows };
}

// --- the part --------------------------------------------------------------

export function partOne(lang) {
    const t = T[lang];
    const P = P1[lang];
    const open = boardOpen(t, lang);
    const def = boardDef(t);
    const sets = boardSets(t);
    const space = boardSpace(t);
    const open2 = boardOpen2(t);
    const fill = boardFill(t);
    const min = boardMin(t);
    const check = boardCheck(t);
    const card = endCard(lang, t.next);
    const ban = bannerParts(lang, 1);

    const boards = [open, def, sets, space, open2, fill, min, check,
                    board('card', card.parts), board('ban', ban)];
    const characters = { ...CHARACTERS };
    for (const b of boards) characters[b.name] = effect(b.parts, { palette: 'struct' });

    /**
     * The pinned banner, cast into every scene but the end card.
     *
     * No action raises it: its parts are authored opaque (see `bannerParts`),
     * because a board re-cast in a new scene starts with every part back at
     * alpha 0 and a reveal in scene one does nothing for scene two.
     */
    const withBan = (cast) => [...cast, castBoard('ban', { alpha: 1 })];

    const scenes = [
        {
            id: 'open', palette: 'struct',
            background: { color: STRUCT_PALETTE.bg },
            transitionIn: { kind: 'fade', from: '#000000', duration: 0.6 },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('open', { alpha: 1 })]),
            shots: [
                // The hook carries no title: a card in the first two seconds
                // spends the window the platform gives you. 27-RETENTION.md.
                { id: 'o0', dialogue: [vo(P[0], 0.3)],
                  actions: [
                      ...build('open', open.beds.ids, 0.2, { gap: 0.09, span: 0.35 }),
                      ...build('open', open.js.ids, 1.0, { gap: 0.09, span: 0.3 }),
                      ...build('open', open.vein.ids, 2.6, { gap: 0.14, span: 0.4, how: pop }),
                      ...build('open', ['kicker', 'title', 'titlesub'], titleAt(P[0], lang),
                               { gap: 0.24, span: 0.5 }),
                  ] },
            ],
        },
        {
            id: 'def', palette: 'struct',
            background: { color: '#0d1319' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('def', { alpha: 1 })]),
            shots: [
                { id: 'd0', dialogue: [vo(P[1], 0.2)],
                  actions: [
                      ...reveal('def', 'h', 0.2, { span: 0.4 }),
                      ...build('def', def.left.ids, 0.6, { gap: 0.1, span: 0.35 }),
                      ...reveal('def', 'jl', 1.6, { span: 0.4 }),
                      ...pop('def', 'yes', 2.3, { span: 0.45 }),
                  ] },
                { id: 'd1', dialogue: [vo(P[2], 0.2)],
                  actions: [
                      ...build('def', def.rightTop.ids, 0.4, { gap: 0.09, span: 0.3 }),
                      ...build('def', def.rightBot.ids, 1.0, { gap: 0.09, span: 0.3 }),
                      ...reveal('def', 'fl', 2.0, { span: 0.4 }),
                      ...pop('def', 'no', 2.7, { span: 0.45 }),
                  ] },
            ],
        },
        {
            id: 'sets', palette: 'struct',
            background: { color: '#0d1319' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('sets', { alpha: 1 })]),
            shots: [
                { id: 's0', dialogue: [vo(P[3], 0.2)],
                  actions: [
                      ...reveal('sets', 'bg', 0.1, { span: 0.45 }),
                      ...reveal('sets', 'h', 0.5, { span: 0.4 }),
                      ...build('sets', sets.a.ids, 0.9, { gap: 0.11, span: 0.3 }),
                      ...pop('sets', 'la', 2.2, { span: 0.4 }),
                  ] },
                { id: 's1', dialogue: [vo(P[4], 0.2)],
                  actions: [
                      ...build('sets', sets.b.ids, 0.4, { gap: 0.11, span: 0.3 }),
                      ...pop('sets', 'lb', 1.8, { span: 0.4 }),
                  ] },
            ],
        },
        {
            id: 'space', palette: 'struct',
            background: { color: '#0a1016' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('space', { alpha: 1 })]),
            shots: [
                { id: 'p0', dialogue: [vo(P[5], 0.2)],
                  actions: [
                      ...reveal('space', 'h', 0.2, { span: 0.45 }),
                      ...reveal('space', 'solid', 0.8, { span: 0.4 }),
                      ...build('space', ['perm_v', 'perm_c'], 1.6, { gap: 0.18, span: 0.4 }),
                      ...reveal('space', 'frac', 2.6, { span: 0.4 }),
                      ...build('space', ['fj0', 'fj1', 'fj2', 'fj3', 'fj4'], 3.0,
                               { gap: 0.1, span: 0.3 }),
                      ...build('space', ['perm2_v', 'perm2_c'], 3.9, { gap: 0.18, span: 0.4 }),
                  ] },
            ],
        },
        {
            id: 'swali', palette: 'struct',
            background: { color: '#111b24' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([
                { character: 'asha', as: 'asha', at: [300, TALK_Y], scale: 1.42,
                  view: 'threeQuarter' },
                { character: 'kitwana', as: 'kitwana', at: [800, TALK_Y], scale: 1.42,
                  view: 'threeQuarter', facing: -1 },
            ]),
            shots: [
                { id: 'q0', dialogue: [says('kitwana', P[6], 0.3)],
                  actions: [
                      { target: 'asha', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'kitwana', do: 'pose', pose: 'stand', at: 0 },
                      ...gesture('kitwana', 'ask', 0.3, { hold: 1.4 }),
                      ...blinks('asha', 5.0, 13), ...blinks('kitwana', 5.0, 31),
                  ] },
                { id: 'q1', dialogue: [says('asha', P[7], 0.3)],
                  actions: [
                      ...gesture('asha', 'present', 0.3, { hold: 1.6 }),
                      ...blinks('asha', 5.0, 47), ...blinks('kitwana', 5.0, 59),
                  ] },
            ],
        },
        {
            id: 'wazi', palette: 'struct',
            background: { color: '#0a1016' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('open2', { alpha: 1 })]),
            shots: [
                { id: 'w0', dialogue: [vo(P[8], 0.2)],
                  actions: [
                      ...reveal('open2', 'h', 0.2, { span: 0.45 }),
                      ...build('open2', ['oo0', 'oo1'], 0.8, { gap: 0.16, span: 0.4 }),
                      ...pop('open2', 'ol', 1.7, { span: 0.4 }),
                      ...build('open2', ['oc0', 'oc1'], 2.4, { gap: 0.14, span: 0.35 }),
                      ...build('open2', ['pL', 'pR'], 2.9, { gap: 0.12, span: 0.35 }),
                      ...pop('open2', 'or', 3.5, { span: 0.4 }),
                  ] },
                { id: 'w1', dialogue: [vo(P[9], 0.2)], actions: [] },
                { id: 'w2', dialogue: [vo(P[10], 0.2)], actions: [] },
            ],
        },
        {
            id: 'ndani', palette: 'struct',
            background: { color: STRUCT_PALETTE.bg },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('fill', { alpha: 1 })]),
            shots: [
                { id: 'f0', dialogue: [vo(P[11], 0.2)],
                  actions: [
                      ...reveal('fill', 'h', 0.2, { span: 0.45 }),
                      ...build('fill', fill.rows.rowIds(0), 0.8, { gap: 0.1, span: 0.4 }),
                  ] },
                { id: 'f1', dialogue: [vo(P[12], 0.2)],
                  actions: build('fill', fill.rows.rowIds(1), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 'f2', dialogue: [vo(P[13], 0.2)],
                  actions: build('fill', fill.rows.rowIds(2), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 'f3', dialogue: [vo(P[14], 0.2)],
                  actions: build('fill', fill.rows.rowIds(3), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 'f4', dialogue: [vo(P[15], 0.2)], actions: [] },
            ],
        },
        {
            id: 'mzee', palette: 'struct',
            background: { color: '#141a14' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([
                { character: 'rajabu', as: 'rajabu', at: [300, TALK_Y], scale: 1.42,
                  view: 'threeQuarter' },
                { character: 'asha', as: 'asha', at: [800, TALK_Y], scale: 1.42,
                  view: 'threeQuarter', facing: -1 },
            ]),
            shots: [
                { id: 'r0', dialogue: [says('rajabu', P[16], 0.3)],
                  actions: [
                      { target: 'rajabu', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'asha', do: 'pose', pose: 'stand', at: 0 },
                      ...gesture('rajabu', 'tell', 0.4, { hold: 2.0 }),
                      ...blinks('rajabu', 6.0, 17), ...blinks('asha', 6.0, 83),
                  ] },
                { id: 'r1', dialogue: [says('asha', P[17], 0.3)],
                  actions: [
                      ...gesture('asha', 'present', 0.3, { hold: 1.8 }),
                      ...blinks('rajabu', 6.0, 29), ...blinks('asha', 6.0, 71),
                  ] },
            ],
        },
        {
            id: 'madini', palette: 'struct',
            background: { color: STRUCT_PALETTE.bg },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('min', { alpha: 1 })]),
            shots: [
                { id: 'm0', dialogue: [vo(P[18], 0.2)],
                  actions: [
                      ...reveal('min', 'h', 0.2, { span: 0.45 }),
                      ...build('min', min.rows.rowIds(0), 0.8, { gap: 0.1, span: 0.4 }),
                  ] },
                { id: 'm1', dialogue: [vo(P[19], 0.2)],
                  actions: build('min', min.rows.rowIds(1), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 'm2', dialogue: [vo(P[20], 0.2)],
                  actions: build('min', min.rows.rowIds(2), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 'm3', dialogue: [vo(P[21], 0.2)],
                  actions: build('min', min.rows.rowIds(3), 0.3, { gap: 0.1, span: 0.4, how: pop }) },
            ],
        },
        {
            id: 'pima', palette: 'struct',
            background: { color: '#0d1319' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('check', { alpha: 1 })]),
            shots: [
                { id: 'c0', dialogue: [vo(P[22], 0.2)],
                  actions: reveal('check', 'h', 0.2, { span: 0.45 }) },
                { id: 'c1', dialogue: [vo(P[23], 0.2)],
                  actions: [
                      ...build('check', check.rows.rowIds(0), 0.3, { gap: 0.1, span: 0.4 }),
                      ...build('check', check.rows.rowIds(1), 2.4, { gap: 0.1, span: 0.4 }),
                  ] },
                { id: 'c2', dialogue: [vo(P[24], 0.2)],
                  actions: build('check', check.rows.rowIds(2), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 'c3', dialogue: [vo(P[25], 0.2)], actions: [] },
                // The caveat gets its own shot and its own stat, because a
                // qualifier buried inside another line is a qualifier nobody
                // hears. Most quartz veins really do carry nothing.
                { id: 'c4', dialogue: [vo(P[26], 0.2)],
                  actions: build('check', ['warn_v', 'warn_c'], 1.4,
                                 { gap: 0.2, span: 0.45, how: pop }) },
            ],
        },
        {
            id: 'card', palette: 'struct',
            background: { color: '#04070a' },
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
        characters,
        scenes,
    }, lang);
}
