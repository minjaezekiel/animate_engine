/**
 * Part 2 — "The hinge that collects" / "Pembe inayokusanya".
 *
 * FOLDS: beds that bent instead of breaking, and why the hinge of a fold is
 * the single most reliable place to look in folded country.
 *
 * The geology is conventional. A fold has limbs, a hinge, an axial surface
 * and, in three dimensions, a plunge. Two things make the hinge a target.
 * First, OUTER-ARC EXTENSION: the convex side of a bend has further to travel
 * than the concave side, so it goes into tension and cracks, while the inner
 * arc is in compression and closes. Second, that crack array opens a
 * dilational site at the crest which fluid fills -- the classic saddle reef,
 * the form that made Bendigo in Victoria one of the richest goldfields of the
 * nineteenth century, where reefs stacked one above another down the plunge
 * of the same anticline.
 *
 * The practical payoff is the plunge. A hinge is a LINE, not a point, so
 * finding one outcrop of it tells you where the rest of it is -- which is
 * the difference between a sample and a target.
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
    foldParts, gesture, hookTitle, statParts, veinParts, titleAt,
} from './common.mjs';

const TALK_Y = Math.round(GROUND_Y - 274 * 1.5);

const P2 = {
    en: [
        /* 0 HOOK */ 'Rock does not always break. Squeeze it slowly enough, and it bends.',
        /* 1 */ 'That bend is a fold — and the top of the bend is where things collect.',
        /* 2 */ 'Three words. Limbs are the sides. The hinge is the bend. The crest is the top.',
        /* 3 */ 'Folded up is an anticline. Folded down is a syncline. They come in pairs.',
        /* 4 */ 'Why the hinge matters is pure geometry.',
        /* 5 */ 'When a layer bends, the outside of the bend has further to travel than the '
            + 'inside.',
        /* 6 */ 'So the outer arc stretches and cracks. The inner arc squeezes and closes.',
        /* 7 */ 'Cracked means open space — at the crest, over and over, down the whole hinge.',
        /* 8 KITWANA */ 'And fluid goes there?',
        /* 9 ASHA */ 'Fluid goes where pressure is lowest. The crest of an anticline is '
            + 'exactly that.',
        /*10 */ 'Fill those cracks with quartz and you get a saddle reef — a lens of vein '
            + 'sitting in the hinge like a saddle.',
        /*11 */ 'Bendigo in Australia was built on these — reef after reef, down the plunge '
            + 'of one anticline.',
        /*12 */ 'There is a second reason, and it is the cap.',
        /*13 */ 'If a tight bed sits over the fold, rising fluid cannot escape. It gathers '
            + 'under the crest and waits.',
        /*14 */ 'So: space, and a lid. That is a trap.',
        /*15 */ 'What gathers in a hinge? Quartz first — the veins themselves.',
        /*16 */ 'Gold, with pyrite and arsenopyrite, in the quartz of the saddle.',
        /*17 */ 'In metamorphic folds: garnet, staurolite, kyanite — grown where strain is '
            + 'highest.',
        /*18 */ 'In folded limestone, lead and zinc gather along the hinge for the same reason.',
        /*19 RAJABU */ 'We dug the ridge tops. Sometimes very good, sometimes nothing.',
        /*20 ASHA */ 'A ridge is not a hinge. A hinge is where the beds reverse. Sometimes '
            + 'the same place — often not.',
        /*21 */ 'So how do you find one? Two steps, and the first is free.',
        /*22 */ 'One: walk across the beds and watch the dip. If it rolls over and comes '
            + 'back, you crossed a hinge.',
        /*23 */ 'The other tell is repetition — the same bed twice, mirrored either side of '
            + 'one line.',
        /*24 */ 'Two: a hinge is a line, not a spot. Find its direction and follow it.',
        /*25 */ 'It usually goes down at an angle. That angle is the plunge — the most '
            + 'valuable number in folded country.',
        /*26 */ 'Caveat: a tight hinge in brittle rock can seal instead of opening. Look for '
            + 'quartz, not just shape.',
        /*27 LOOP */ 'A fold bends. Next: when rock will not bend any more, it breaks — '
            + 'a fault.',
    ],
    sw: [
        /* 0 HOOK */ 'Mwamba hauvunjiki siku zote. Ukiubana polepole na kwa joto la kutosha, '
            + 'unapinda.',
        /* 1 */ 'Mpindo huo ni mkunjo, na juu ya mpindo ndipo vitu vinakusanyika.',
        /* 2 */ 'Maneno matatu. Mbavu ni pande. Pembe ni mpindo wenyewe. Kilele ni juu kabisa.',
        /* 3 */ 'Ukunjo wa juu ni anticline. Wa chini ni syncline. Vinakuja kwa jozi, '
            + 'kwenye eneo lote.',
        /* 4 */ 'Sasa kwa nini pembe ni muhimu, na ni hesabu tu.',
        /* 5 */ 'Tabaka linapopinda, upande wa nje wa mpindo una safari ndefu kuliko wa ndani.',
        /* 6 */ 'Hivyo upande wa nje unavutwa na unapasuka. Wa ndani unabanwa na unafunga.',
        /* 7 */ 'Kuvutwa na kupasuka maana yake nafasi wazi. Nafasi kileleni mwa mkunjo, '
            + 'tena na tena, kwenye pembe nzima.',
        /* 8 KITWANA */ 'Na majimaji yanakwenda huko?',
        /* 9 ASHA */ 'Majimaji yanakwenda pale shinikizo lilipo dogo zaidi. Kilele cha '
            + 'anticline ndipo hasa.',
        /*10 */ 'Jaza nyufa hizo quartz, unapata saddle reef — kipande cha mshipa kilichokaa '
            + 'pembeni kama tandiko juu ya farasi.',
        /*11 */ 'Bendigo nchini Australia ilijengwa juu ya hizi. Mshipa baada ya mshipa, '
            + 'ukishuka na mteremko wa anticline moja.',
        /*12 */ 'Kuna sababu ya pili, nayo ni kuhusu kifuniko.',
        /*13 */ 'Kama tabaka gumu lisilopenyeza liko juu ya mkunjo, majimaji yanayopanda '
            + 'hayawezi kutoka. Yanakusanyika chini ya kilele na kusubiri.',
        /*14 */ 'Kwa hiyo una nafasi, na una mfuniko. Hilo ndilo tego.',
        /*15 */ 'Nini kinapatikana kwenye pembe za mikunjo? Kwanza quartz — mishipa yenyewe.',
        /*16 */ 'Dhahabu, pamoja na pyrite na arsenopyrite, ndani ya quartz ya saddle.',
        /*17 */ 'Kwenye mikunjo ya metamorphic: garnet, staurolite na kyanite zinakua pembeni '
            + 'ambapo msukumo ni mkubwa zaidi.',
        /*18 */ 'Na kwenye chokaa iliyokunjwa, risasi na zinki zinakusanyika pembeni kwa '
            + 'sababu hiyo hiyo.',
        /*19 RAJABU */ 'Tulikuwa tunachimba vilele vya matuta. Mara nyingine vizuri sana, '
            + 'mara nyingine hakuna kitu.',
        /*20 ASHA */ 'Tuta si pembe. Pembe ni pale tabaka zinapogeuka. Mara nyingine ni '
            + 'sehemu moja — na mara nyingine si.',
        /*21 */ 'Basi, jinsi ya kutafuta pembe. Hatua mbili, na ya kwanza ni bure.',
        /*22 */ 'Moja: tembea ukikata tabaka ukiangalia mwelekeo wake. Kama zinageuka na '
            + 'kuanza kurudi kwako, umevuka pembe.',
        /*23 */ 'Dalili nyingine ni kurudiwa. Tabaka lile lile, mara mbili, likiwa kioo '
            + 'pande mbili za mstari mmoja.',
        /*24 */ 'Pili: pembe ni mstari, si doa. Tafuta mwelekeo wake na uufuate — huko ndiko '
            + 'mshipa mwingine ulipo.',
        /*25 */ 'Na kwa kawaida inashuka chini kwa pembe fulani. Pembe hiyo ni plunge, na '
            + 'ndiyo namba ya thamani zaidi kwenye eneo la mikunjo.',
        /*26 */ 'Tahadhari ya kweli: pembe iliyobana sana kwenye mwamba mgumu inaweza '
            + 'kufunga badala ya kufunguka. Tafuta quartz, si umbo tu.',
        /*27 LOOP */ 'Mkunjo unapinda. Sasa: nini kinatokea mwamba unapokataa kupinda tena, '
            + 'na unavunjika — hitilafu.',
    ],
};

const T = {
    en: {
        kicker: 'READING THE ROCK  ·  PART 2', title: 'The hinge that collects',
        sub: 'folds, and why the top of the bend pays',
        anatH: 'THE THREE WORDS', limb: 'LIMB', hinge: 'HINGE', crest: 'CREST',
        anti: 'ANTICLINE — folded up', syn: 'SYNCLINE — folded down',
        arcH: 'THE OUTSIDE OF A BEND HAS FURTHER TO GO',
        outer: 'outer arc — STRETCHED, cracks open',
        inner: 'inner arc — SQUEEZED, closes',
        reefH: 'A SADDLE REEF', reefC: 'quartz filling the crest of the hinge',
        capH: 'SPACE, AND A LID', capL: 'impermeable cap — fluid cannot escape',
        minH: 'WHAT GATHERS IN A HINGE',
        minRows: [
            ['QUARTZ', 'the vein itself — the saddle reef', '#ece8dd'],
            ['GOLD  ·  PYRITE  ·  ARSENOPYRITE', 'in the quartz of the saddle', '#ffc64d'],
            ['GARNET  ·  STAUROLITE  ·  KYANITE', 'metamorphic folds — grown where strain is highest', '#b3384f'],
            ['GALENA  ·  SPHALERITE', 'folded limestone — lead and zinc along the hinge', '#9aa4ad'],
        ],
        checkH: 'HOW TO FIND A HINGE',
        checks: [
            ['1  ·  WATCH THE DIP', 'Walk across the beds. Does it roll over and come back?', '#ffb23d'],
            ['2  ·  LOOK FOR THE MIRROR', 'The same bed twice, either side of one line.', '#5ec8e8'],
            ['3  ·  FOLLOW THE LINE', 'A hinge is a line. Find its direction and walk it.', '#ffc64d'],
        ],
        plungeV: 'PLUNGE', plungeC: 'the angle the hinge goes underground',
        next: 'Next — Part 3:\nwhen the rock will not bend, it breaks',
    },
    sw: {
        kicker: 'KUSOMA MWAMBA  ·  SEHEMU 2', title: 'Pembe inayokusanya',
        sub: 'mikunjo, na kwa nini juu ya mpindo inalipa',
        anatH: 'MANENO MATATU', limb: 'UBAVU', hinge: 'PEMBE', crest: 'KILELE',
        anti: 'ANTICLINE — umekunjwa juu', syn: 'SYNCLINE — umekunjwa chini',
        arcH: 'NJE YA MPINDO INA SAFARI NDEFU ZAIDI',
        outer: 'upande wa nje — UNAVUTWA, nyufa zinafunguka',
        inner: 'upande wa ndani — UNABANWA, unafunga',
        reefH: 'SADDLE REEF', reefC: 'quartz ikijaza kilele cha pembe',
        capH: 'NAFASI, NA MFUNIKO', capL: 'tabaka lisilopenyeza — majimaji hayatoki',
        minH: 'NINI KINAKUSANYIKA PEMBENI',
        minRows: [
            ['QUARTZ', 'mshipa wenyewe — saddle reef', '#ece8dd'],
            ['DHAHABU  ·  PYRITE  ·  ARSENOPYRITE', 'ndani ya quartz ya saddle', '#ffc64d'],
            ['GARNET  ·  STAUROLITE  ·  KYANITE', 'mikunjo ya metamorphic — pale msukumo ni mkubwa', '#b3384f'],
            ['GALENA  ·  SPHALERITE', 'chokaa iliyokunjwa — risasi na zinki pembeni', '#9aa4ad'],
        ],
        checkH: 'JINSI YA KUTAFUTA PEMBE',
        checks: [
            ['1  ·  ANGALIA MWELEKEO', 'Tembea ukikata tabaka. Zinageuka na kurudi?', '#ffb23d'],
            ['2  ·  TAFUTA KIOO', 'Tabaka lile lile mara mbili, pande mbili za mstari.', '#5ec8e8'],
            ['3  ·  FUATA MSTARI', 'Pembe ni mstari. Tafuta mwelekeo na uufuate.', '#ffc64d'],
        ],
        plungeV: 'PLUNGE', plungeC: 'pembe ambayo mkunjo unashukia ardhini',
        next: 'Inayofuata — Sehemu 3:\nmwamba ukikataa kupinda, unavunjika',
    },
};

// --- boards ----------------------------------------------------------------

function boardOpen(t) {
    const fold = foldParts('of', { crest: 820, amp: 130, layers: 4, bandH: 48, hinge: false });
    return { ...board('open', [...fold.parts, ...hookTitle(t.kicker, t.title, t.sub)]), fold };
}

function boardAnat(t) {
    const fold = foldParts('af', { crest: 800, amp: 140, layers: 3, bandH: 52, hinge: true });
    return { ...board('anat', [
        textPart('h', t.anatH, { at: [540, 548], font: `700 32px ${FONT}`, fill: 'dim',
                                 alpha: 0, z: 90, maxWidth: 940 }),
        ...fold.parts,
        textPart('limb', t.limb, { at: [180, 920], font: `800 30px ${FONT}`, fill: 'ink',
                                   alpha: 0, z: 95 }),
        textPart('hinge', t.hinge, { at: [540, 1136], font: `800 30px ${FONT}`, fill: 'fold',
                                     alpha: 0, z: 95 }),
        textPart('crest', t.crest, { at: [540, 598], font: `800 30px ${FONT}`, fill: 'gold',
                                     alpha: 0, z: 95 }),
    ]), fold };
}

function boardPair(t) {
    const up = foldParts('pu', { x0: 40, x1: 1040, crest: 740, amp: 110, layers: 2,
                                 bandH: 44, hinge: false });
    const dn = foldParts('pd', { x0: 40, x1: 1040, crest: 1010, amp: 110, layers: 2,
                                 bandH: 44, hinge: false, down: true });
    return { ...board('pair', [
        ...up.parts, ...dn.parts,
        textPart('anti', t.anti, { at: [540, 648], font: `700 29px ${FONT}`, fill: 'fold',
                                   alpha: 0, z: 95, maxWidth: 900 }),
        textPart('syn', t.syn, { at: [540, 1210], font: `700 29px ${FONT}`, fill: 'joint',
                                 alpha: 0, z: 95, maxWidth: 900 }),
    ]), up, dn };
}

/** Outer-arc extension: the reason a hinge is a target at all. */
function boardArc(t) {
    const fold = foldParts('cf', { crest: 840, amp: 150, layers: 3, bandH: 50,
                                   hinge: false, cracks: 6 });
    return { ...board('arc', [
        textPart('h', t.arcH, { at: [540, 560], font: `700 31px ${FONT}`, fill: 'dim',
                                alpha: 0, z: 90, maxWidth: 940 }),
        ...fold.parts,
        textPart('out', t.outer, { at: [540, 640], font: `700 28px ${FONT}`, fill: 'joint',
                                   alpha: 0, z: 95, maxWidth: 900 }),
        textPart('in', t.inner, { at: [540, 1150], font: `700 28px ${FONT}`, fill: 'fault',
                                  alpha: 0, z: 95, maxWidth: 900 }),
    ]), fold };
}

/** The saddle reef itself, and the impermeable cap over it. */
function boardReef(t) {
    const fold = foldParts('rf', { crest: 880, amp: 140, layers: 3, bandH: 50, hinge: false });
    // The reef sits IN the crest, following the arch -- not a blob dropped on
    // top of it. Where it sits is the entire teaching.
    const reef = veinParts('reef', [[400, 792], [470, 752], [540, 742], [610, 752], [680, 792]],
                           { width: 40, ore: 5, z: 120 });
    const cap = foldParts('cap', { crest: 700, amp: 140, layers: 1, bandH: 36,
                                   fill: 'basalt', hinge: false, z: 130 });
    return { ...board('reef', [
        textPart('h', t.reefH, { at: [540, 560], font: `800 36px ${FONT}`, fill: 'gold',
                                 alpha: 0, z: 150, maxWidth: 940 }),
        ...fold.parts, ...reef.parts, ...cap.parts,
        textPart('rc', t.reefC, { at: [540, 1172], font: `700 28px ${FONT}`, fill: 'dim',
                                  alpha: 0, z: 150, maxWidth: 900 }),
        textPart('capH', t.capH, { at: [540, 612], font: `800 32px ${FONT}`, fill: 'ink',
                                   alpha: 0, z: 150, maxWidth: 900 }),
        textPart('capL', t.capL, { at: [540, 1230], font: `600 27px ${FONT}`, fill: 'dim',
                                   alpha: 0, z: 150, maxWidth: 900 }),
    ]), fold, reef, cap };
}

function boardMin(t) {
    const rows = cardRows('mr', t.minRows, { top: 596, h: 162, gap: 20 });
    return { ...board('min', [
        textPart('h', t.minH, { at: [540, 532], font: `800 36px ${FONT}`, fill: 'ink',
                                alpha: 0, z: 60, maxWidth: 940 }),
        ...rows.parts,
    ]), rows };
}

function boardCheck(t) {
    const rows = cardRows('cr', t.checks, { top: 616, h: 170, gap: 24 });
    return { ...board('check', [
        textPart('h', t.checkH, { at: [540, 548], font: `800 36px ${FONT}`, fill: 'ink',
                                  alpha: 0, z: 60, maxWidth: 940 }),
        ...rows.parts,
        ...statParts('pl', t.plungeV, t.plungeC, { at: [540, 1252], fill: 'fold', size: 72 }),
    ]), rows };
}

export function partTwo(lang) {
    const t = T[lang];
    const P = P2[lang];
    const open = boardOpen(t), anat = boardAnat(t), pair = boardPair(t);
    const arc = boardArc(t), reef = boardReef(t), min = boardMin(t), check = boardCheck(t);
    const card = endCard(lang, t.next);
    const ban = bannerParts(lang, 2);

    const boards = [open, anat, pair, arc, reef, min, check,
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
                      ...build('open', open.fold.ids, 0.2, { gap: 0.16, span: 0.45 }),
                      ...build('open', ['kicker', 'title', 'titlesub'], titleAt(P[0], lang),
                               { gap: 0.24, span: 0.5 }),
                  ] },
                { id: 'o1', dialogue: [vo(P[1], 0.2)], actions: [] },
            ],
        },
        {
            id: 'anat', palette: 'struct', background: { color: '#0d1319' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('anat', { alpha: 1 })]),
            shots: [
                { id: 'a0', dialogue: [vo(P[2], 0.2)],
                  actions: [
                      ...reveal('anat', 'h', 0.2, { span: 0.4 }),
                      ...build('anat', anat.fold.ids, 0.6, { gap: 0.14, span: 0.4 }),
                      ...pop('anat', 'limb', 2.0, { span: 0.4 }),
                      ...build('anat', anat.fold.hingeIds, 2.8, { gap: 0.1, span: 0.4 }),
                      ...pop('anat', 'hinge', 3.1, { span: 0.4 }),
                      ...pop('anat', 'crest', 4.0, { span: 0.4 }),
                  ] },
            ],
        },
        {
            id: 'pair', palette: 'struct', background: { color: '#0d1319' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('pair', { alpha: 1 })]),
            shots: [
                { id: 'p0', dialogue: [vo(P[3], 0.2)],
                  actions: [
                      ...build('pair', pair.up.ids, 0.2, { gap: 0.16, span: 0.4 }),
                      ...pop('pair', 'anti', 1.2, { span: 0.4 }),
                      ...build('pair', pair.dn.ids, 2.0, { gap: 0.16, span: 0.4 }),
                      ...pop('pair', 'syn', 3.0, { span: 0.4 }),
                  ] },
            ],
        },
        {
            id: 'arc', palette: 'struct', background: { color: '#120f0a' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('arc', { alpha: 1 })]),
            shots: [
                { id: 'c0', dialogue: [vo(P[4], 0.2)],
                  actions: [
                      ...reveal('arc', 'h', 0.2, { span: 0.4 }),
                      ...build('arc', arc.fold.ids, 0.6, { gap: 0.14, span: 0.4 }),
                  ] },
                { id: 'c1', dialogue: [vo(P[5], 0.2)], actions: [] },
                { id: 'c2', dialogue: [vo(P[6], 0.2)],
                  actions: [
                      ...build('arc', arc.fold.crackIds, 0.4, { gap: 0.16, span: 0.35 }),
                      ...pop('arc', 'out', 1.6, { span: 0.4 }),
                      ...pop('arc', 'in', 3.0, { span: 0.4 }),
                  ] },
                { id: 'c3', dialogue: [vo(P[7], 0.2)], actions: [] },
            ],
        },
        {
            id: 'swali', palette: 'struct', background: { color: '#111b24' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: two('asha', 'kitwana'),
            shots: [
                { id: 'q0', dialogue: [says('kitwana', P[8], 0.3)],
                  actions: [
                      { target: 'asha', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'kitwana', do: 'pose', pose: 'stand', at: 0 },
                      ...gesture('kitwana', 'ask', 0.3, { hold: 1.2 }),
                      ...blinks('asha', 4.5, 13), ...blinks('kitwana', 4.5, 31),
                  ] },
                { id: 'q1', dialogue: [says('asha', P[9], 0.3)],
                  actions: [
                      ...gesture('asha', 'present', 0.3, { hold: 1.6 }),
                      ...blinks('asha', 5.5, 47), ...blinks('kitwana', 5.5, 59),
                  ] },
            ],
        },
        {
            id: 'reef', palette: 'struct', background: { color: '#12100a' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('reef', { alpha: 1 })]),
            shots: [
                { id: 'r0', dialogue: [vo(P[10], 0.2)],
                  actions: [
                      ...build('reef', reef.fold.ids, 0.2, { gap: 0.13, span: 0.4 }),
                      ...reveal('reef', 'h', 1.0, { span: 0.45 }),
                      ...build('reef', reef.reef.ids, 1.8, { gap: 0.16, span: 0.4, how: pop }),
                      ...pop('reef', 'rc', 4.0, { span: 0.45 }),
                  ] },
                { id: 'r1', dialogue: [vo(P[11], 0.2)], actions: [] },
                { id: 'r2', dialogue: [vo(P[12], 0.2)],
                  actions: conceal('reef', 'h', 0.2, { span: 0.4 }) },
                { id: 'r3', dialogue: [vo(P[13], 0.2)],
                  actions: [
                      ...build('reef', reef.cap.ids, 0.3, { gap: 0.12, span: 0.45 }),
                      ...pop('reef', 'capL', 1.6, { span: 0.45 }),
                  ] },
                { id: 'r4', dialogue: [vo(P[14], 0.2)],
                  actions: pop('reef', 'capH', 0.6, { span: 0.45 }) },
            ],
        },
        {
            id: 'madini', palette: 'struct', background: { color: STRUCT_PALETTE.bg },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('min', { alpha: 1 })]),
            shots: [
                { id: 'm0', dialogue: [vo(P[15], 0.2)],
                  actions: [
                      ...reveal('min', 'h', 0.2, { span: 0.45 }),
                      ...build('min', min.rows.rowIds(0), 0.8, { gap: 0.1, span: 0.4 }),
                  ] },
                { id: 'm1', dialogue: [vo(P[16], 0.2)],
                  actions: build('min', min.rows.rowIds(1), 0.3, { gap: 0.1, span: 0.4, how: pop }) },
                { id: 'm2', dialogue: [vo(P[17], 0.2)],
                  actions: build('min', min.rows.rowIds(2), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 'm3', dialogue: [vo(P[18], 0.2)],
                  actions: build('min', min.rows.rowIds(3), 0.3, { gap: 0.1, span: 0.4 }) },
            ],
        },
        {
            id: 'mzee', palette: 'struct', background: { color: '#141a14' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: two('rajabu', 'asha'),
            shots: [
                { id: 'z0', dialogue: [says('rajabu', P[19], 0.3)],
                  actions: [
                      { target: 'rajabu', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'asha', do: 'pose', pose: 'stand', at: 0 },
                      ...gesture('rajabu', 'tell', 0.4, { hold: 1.8 }),
                      ...blinks('rajabu', 6.0, 17), ...blinks('asha', 6.0, 83),
                  ] },
                { id: 'z1', dialogue: [says('asha', P[20], 0.3)],
                  actions: [
                      ...gesture('asha', 'present', 0.3, { hold: 2.0 }),
                      ...blinks('rajabu', 6.5, 29), ...blinks('asha', 6.5, 71),
                  ] },
            ],
        },
        {
            id: 'pima', palette: 'struct', background: { color: '#0d1319' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('check', { alpha: 1 })]),
            shots: [
                { id: 'k0', dialogue: [vo(P[21], 0.2)],
                  actions: reveal('check', 'h', 0.2, { span: 0.45 }) },
                { id: 'k1', dialogue: [vo(P[22], 0.2)],
                  actions: build('check', check.rows.rowIds(0), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 'k2', dialogue: [vo(P[23], 0.2)],
                  actions: build('check', check.rows.rowIds(1), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 'k3', dialogue: [vo(P[24], 0.2)],
                  actions: build('check', check.rows.rowIds(2), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 'k4', dialogue: [vo(P[25], 0.2)],
                  actions: build('check', ['pl_v', 'pl_c'], 1.2, { gap: 0.2, span: 0.45, how: pop }) },
                { id: 'k5', dialogue: [vo(P[26], 0.2)], actions: [] },
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
