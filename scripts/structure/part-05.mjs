/**
 * Part 5 — "Measuring it with almost nothing" / "Kupima bila vifaa".
 *
 * HOW TO CHECK: strike and dip, what to carry, the order to work in, and the
 * surface clues that lead you to a structure before you can see it.
 *
 * This is the practical part, and it is deliberately equipment-light because
 * the audience is an artisanal prospector, not a exploration company. The
 * geology is standard field method: a planar feature is recorded as strike
 * and dip, a linear one as trend and plunge; measurements are only useful in
 * numbers, because one reading is an anecdote and thirty is a pattern.
 *
 * Two field tests are given with their real limits:
 *   - Panning concentrates DENSE minerals, so it finds gold, garnet, zircon,
 *     spinel and sapphire and does NOT find emerald or the other beryls,
 *     which are no denser than the quartz they travel with. Someone panning
 *     for beryl would conclude there is nothing there. This caveat is in the
 *     narration, not only in a comment.
 *   - Float can be traced uphill to its source, but only uphill: a block in a
 *     stream has already left the place that matters.
 *
 * Licensing is kept GENERAL on purpose -- "get one, from the mining
 * authority" -- because procedures and fees change and a confident wrong
 * number in a video does more harm than none.
 */
import {
    build, effect, pathPart, poly, pop, rectPart, reveal, textPart,
} from '../lib/diagram.mjs';
import { FONT, GROUND_Y, L, M } from '../lib/diagram.mjs';
import {
    CHARACTERS, META, STRUCT_PALETTE, offstage, says, vo, voicesFor,
} from '../lib/structure.mjs';
import {
    bannerParts, bedsParts, blinks, board, cardRows, castBoard, endCard,
    fitShots, gesture, gossanParts, hookTitle, statParts, strikeDipParts,
    veinParts, titleAt,
} from './common.mjs';

const TALK_Y = Math.round(GROUND_Y - 274 * 1.5);

const P5 = {
    en: [
        /* 0 HOOK */ 'You can map a structure well enough to find ore with a compass, a lens and '
            + 'a notebook.',
        /* 1 */ 'Every structure so far is a surface in the ground. To record one you need '
            + 'two numbers.',
        /* 2 */ 'Strike, and dip.',
        /* 3 */ 'Dip is the easy one. It is how steeply the surface tilts. Flat is zero, '
            + 'vertical is ninety.',
        /* 4 */ 'Strike is the direction of a level line drawn on that surface. The way it '
            + 'runs across country.',
        /* 5 */ 'On a map: a long line, a short tick. The tick points down-dip, the number '
            + 'is the angle.',
        /* 6 KITWANA */ 'And I need one of those for every rock?',
        /* 7 ASHA */ 'You need a lot of them. One reading is a story. Thirty readings is a '
            + 'map.',
        /* 8 */ 'The pattern is the point. Dips rolling over means a fold. Dips chopped off '
            + 'along a line means a fault.',
        /* 9 */ 'What to carry. A compass with a clinometer — a phone app will start you off.',
        /*10 */ 'A hand lens. A hammer. A notebook, because your memory is not a record.',
        /*11 */ 'A magnet, a streak plate, and a small bottle of dilute acid for the '
            + 'carbonates.',
        /*12 */ 'Now the order of work, and the order matters.',
        /*13 */ 'First walk the ground and note the rock types. You cannot map a structure '
            + 'in rock you cannot name.',
        /*14 */ 'Then measure every surface — bedding, joints, foliation, fault planes. '
            + 'And write where you were.',
        /*15 */ 'Then plot them. Even on paper, the pattern appears quickly.',
        /*16 */ 'And then look for where patterns INTERSECT. That is the whole trick.',
        /*17 */ 'A shear zone crossing a fold hinge. A fault cutting a reactive bed. Two '
            + 'beat either one alone.',
        /*18 */ 'Before any of it, there are clues you can see from a distance.',
        /*19 */ 'Gossan — the rusty orange cap. A colour change in the soil. A line of '
            + 'different vegetation.',
        /*20 */ 'And float: loose quartz on a slope. Trace it UPHILL. Downhill tells you '
            + 'nothing.',
        /*21 */ 'Panning works too, but know what it does. It concentrates DENSE minerals.',
        /*22 */ 'It finds gold, garnet, zircon, sapphire. Not emerald — no heavier than '
            + 'quartz.',
        /*23 */ 'Pan for beryl and you will conclude the ground is empty when it is not.',
        /*24 RAJABU */ 'And the permit. People forget that part until somebody arrives.',
        /*25 ASHA */ 'Get one from the mining authority before you dig. Rules change — ask '
            + 'them, not me.',
        /*26 */ 'Tell someone where you are going. Never enter an old working — the ground '
            + 'that holds ore is the ground that falls.',
        /*27 LOOP */ 'You can measure them now. Last part: how to put all four together, '
            + 'and what not to believe.',
    ],
    sw: [
        /* 0 HOOK */ 'Unaweza kuchora ramani ya muundo vya kutosha kupata madini kwa dira, '
            + 'kioo cha mkono na daftari.',
        /* 1 */ 'Kila kitu kwenye sehemu nne zilizopita ni uso ardhini. Kuuandika unahitaji '
            + 'namba mbili.',
        /* 2 */ 'Strike, na dip.',
        /* 3 */ 'Dip ni rahisi. Ni kiasi uso unavyoinama. Tambarare ni sifuri, wima ni '
            + 'tisini.',
        /* 4 */ 'Strike ni mwelekeo wa mstari ulio sawa juu ya uso huo. Jinsi unavyokwenda '
            + 'nchini.',
        /* 5 */ 'Kwenye ramani ni mstari mrefu na alama fupi. Alama inaelekea chini, na '
            + 'namba ni pembe.',
        /* 6 KITWANA */ 'Na nahitaji moja kwa kila mwamba?',
        /* 7 ASHA */ 'Unahitaji nyingi. Kipimo kimoja ni hadithi. Vipimo thelathini ni '
            + 'ramani.',
        /* 8 */ 'Kwa sababu mchoro ndio maana. Dip zinazogeuka maana yake mkunjo. Dip '
            + 'zinazokatika mstarini maana yake hitilafu.',
        /* 9 */ 'Ubebe nini. Dira yenye clinometer — programu ya simu itakuanzisha.',
        /*10 */ 'Kioo cha mkono. Nyundo. Daftari, kwa sababu kumbukumbu yako si kumbukumbu.',
        /*11 */ 'Sumaku, bamba la mkwaruzo, na chupa ndogo ya asidi dhaifu kwa carbonate.',
        /*12 */ 'Sasa mpangilio wa kazi, na mpangilio ni muhimu.',
        /*13 */ 'Kwanza tembea ardhi uandike aina za miamba. Huwezi kuchora muundo kwenye '
            + 'mwamba usioujua jina.',
        /*14 */ 'Kisha pima kila uso unaokutana nao — tabaka, nyufa, mistari, nyuso za '
            + 'hitilafu. Andika ulipokuwa.',
        /*15 */ 'Kisha zichore. Hata kwenye karatasi, mchoro unaonekana haraka.',
        /*16 */ 'Kisha tafuta mahali michoro INAPOKUTANA. Huo ndio ujanja wote.',
        /*17 */ 'Ukanda wa msuguano ukikata pembe ya mkunjo. Hitilafu ikikata tabaka '
            + 'linaloathiriana. Miundo miwili inayokutana inashinda mmoja.',
        /*18 */ 'Kabla ya yote, kuna dalili unazoziona kwa mbali.',
        /*19 */ 'Gossan — ile kofia ya kutu ya chungwa. Mabadiliko ya rangi ya udongo. '
            + 'Mstari wa mimea tofauti.',
        /*20 */ 'Na float: mawe ya quartz yaliyolegea mteremkoni. Yafuate KUPANDA. Kushuka '
            + 'hakukuambii kitu.',
        /*21 */ 'Kuchuja kwa karai kunafanya kazi pia, lakini jua kunafanya nini. '
            + 'Kunakusanya madini MAZITO.',
        /*22 */ 'Kwa hiyo kunapata dhahabu, garnet, zircon na yakuti. Hakutapata zumaridi, '
            + 'ambayo si nzito kuliko quartz.',
        /*23 */ 'Chuja ukitafuta berili, utahitimisha ardhi ni tupu wakati si tupu.',
        /*24 RAJABU */ 'Na leseni. Watu wanasahau sehemu hiyo hadi mtu anapofika.',
        /*25 ASHA */ 'Ipate, kutoka mamlaka ya madini, kabla ya kuchimba. Sheria zinatofautiana '
            + 'na zinabadilika — waulize wao, si mimi.',
        /*26 */ 'Mwambie mtu unakokwenda. Usiingie kwenye shimo la zamani. Ardhi yenye '
            + 'madini ndiyo ardhi inayoanguka.',
        /*27 LOOP */ 'Sasa unaweza kuvipima. Sehemu ya mwisho: jinsi ya kuunganisha vyote '
            + 'vinne, na nini usiamini.',
    ],
};

const T = {
    en: {
        kicker: 'READING THE ROCK  ·  PART 5', title: 'Measuring it with almost nothing',
        sub: 'strike, dip, and the order to work in',
        sdH: 'TWO NUMBERS DESCRIBE ANY SURFACE',
        dipL: 'DIP — how steeply it tilts  (0 flat, 90 vertical)',
        strL: 'STRIKE — the direction of a level line on it',
        symL: 'long line = strike  ·  tick = down-dip  ·  number = angle',
        kitH: 'WHAT TO CARRY',
        kit: [
            ['COMPASS + CLINOMETER', 'A phone app will start you off.', '#5ec8e8'],
            ['HAND LENS  ·  HAMMER', 'See the grains. Get a fresh surface.', '#ffb23d'],
            ['NOTEBOOK', 'Your memory is not a record.', '#ece8dd'],
            ['MAGNET  ·  STREAK PLATE  ·  DILUTE ACID', 'Magnetite, streak colour, carbonate fizz.', '#d8b98a'],
        ],
        ordH: 'THE ORDER OF WORK',
        ord: [
            ['1  ·  NAME THE ROCKS', 'You cannot map structure in rock you cannot name.', '#8fa0b0'],
            ['2  ·  MEASURE EVERYTHING', 'Bedding, joints, foliation, fault planes. And where you were.', '#5ec8e8'],
            ['3  ·  PLOT IT', 'Even on paper, the pattern appears fast.', '#ffb23d'],
            ['4  ·  FIND THE INTERSECTIONS', 'Two structures meeting beats either one alone.', '#ffc64d'],
        ],
        farH: 'CLUES YOU CAN SEE FROM A DISTANCE',
        gossL: 'GOSSAN — rusty cap over sulphides',
        floatL: 'FLOAT — trace it UPHILL. Downhill tells you nothing.',
        panH: 'PANNING CONCENTRATES DENSE MINERALS',
        panYes: 'FINDS:  gold · garnet · zircon · sapphire',
        panNo: 'MISSES:  emerald and the beryls — no heavier than quartz',
        permV: 'GET A PERMIT', permC: 'from the mining authority, before you dig',
        next: 'Next — Part 6:\nputting all four together, and what not to believe',
    },
    sw: {
        kicker: 'KUSOMA MWAMBA  ·  SEHEMU 5', title: 'Kupima bila vifaa',
        sub: 'strike, dip, na mpangilio wa kazi',
        sdH: 'NAMBA MBILI ZINAELEZA USO WOWOTE',
        dipL: 'DIP — kiasi unavyoinama  (0 tambarare, 90 wima)',
        strL: 'STRIKE — mwelekeo wa mstari ulio sawa juu yake',
        symL: 'mstari mrefu = strike  ·  alama = kuelekea chini  ·  namba = pembe',
        kitH: 'UBEBE NINI',
        kit: [
            ['DIRA + CLINOMETER', 'Programu ya simu itakuanzisha.', '#5ec8e8'],
            ['KIOO CHA MKONO  ·  NYUNDO', 'Ona chembe. Pata uso mbichi.', '#ffb23d'],
            ['DAFTARI', 'Kumbukumbu yako si kumbukumbu.', '#ece8dd'],
            ['SUMAKU  ·  BAMBA  ·  ASIDI DHAIFU', 'Magnetite, rangi ya mkwaruzo, povu la carbonate.', '#d8b98a'],
        ],
        ordH: 'MPANGILIO WA KAZI',
        ord: [
            ['1  ·  TAJA MIAMBA', 'Huwezi kuchora muundo kwenye mwamba usioujua.', '#8fa0b0'],
            ['2  ·  PIMA KILA KITU', 'Tabaka, nyufa, mistari, nyuso za hitilafu. Na ulipokuwa.', '#5ec8e8'],
            ['3  ·  CHORA', 'Hata kwenye karatasi, mchoro unaonekana haraka.', '#ffb23d'],
            ['4  ·  TAFUTA MAKUTANO', 'Miundo miwili inayokutana inashinda mmoja.', '#ffc64d'],
        ],
        farH: 'DALILI UNAZOZIONA KWA MBALI',
        gossL: 'GOSSAN — kofia ya kutu juu ya salfa',
        floatL: 'FLOAT — yafuate KUPANDA. Kushuka hakukuambii kitu.',
        panH: 'KUCHUJA KUNAKUSANYA MADINI MAZITO',
        panYes: 'KUNAPATA:  dhahabu · garnet · zircon · yakuti',
        panNo: 'HAKUPATI:  zumaridi na berili — si nzito kuliko quartz',
        permV: 'PATA LESENI', permC: 'kutoka mamlaka ya madini, kabla ya kuchimba',
        next: 'Inayofuata — Sehemu 6:\nkuunganisha vyote vinne, na nini usiamini',
    },
};

function boardOpen(t) {
    const beds = bedsParts('ob', { top: 680, tilt: 0.22 });
    const sd = strikeDipParts('sd1', [540, 840], { strike: 0.22, dip: 38, len: 120 });
    return { ...board('open', [...beds.parts, ...sd.parts,
                               ...hookTitle(t.kicker, t.title, t.sub)]), beds, sd };
}

/** Strike and dip, built as a definition rather than shown as a symbol. */
function boardSD(t) {
    const beds = bedsParts('sb', { x: 120, w: 840, top: 700, tilt: 0.3,
                                   bands: [['bed', 54], ['bedAlt', 48], ['bed', 54]] });
    const syms = [
        strikeDipParts('m1', [280, 1080], { strike: 0.18, dip: 30 }),
        strikeDipParts('m2', [540, 1080], { strike: 0.18, dip: 44 }),
        strikeDipParts('m3', [800, 1080], { strike: 0.18, dip: 61 }),
    ];
    return { ...board('sd', [
        textPart('h', t.sdH, { at: [540, 580], font: `800 34px ${FONT}`, fill: 'ink',
                               alpha: 0, z: 150, maxWidth: 940 }),
        ...beds.parts,
        textPart('dip', t.dipL, { at: [540, 978], font: `700 27px ${FONT}`, fill: 'joint',
                                  alpha: 0, z: 150, maxWidth: 920 }),
        textPart('str', t.strL, { at: [540, 1022], font: `700 27px ${FONT}`, fill: 'fold',
                                  alpha: 0, z: 150, maxWidth: 920 }),
        ...syms.flatMap((s) => s.parts),
        textPart('sym', t.symL, { at: [540, 1180], font: `600 25px ${FONT}`, fill: 'dim',
                                  alpha: 0, z: 150, maxWidth: 920 }),
    ]), beds, symIds: syms.flatMap((s) => s.ids) };
}

function boardKit(t) {
    const rows = cardRows('kr', t.kit, { top: 606, h: 158, gap: 20 });
    return { ...board('kit', [
        textPart('h', t.kitH, { at: [540, 540], font: `800 36px ${FONT}`, fill: 'ink',
                                alpha: 0, z: 60, maxWidth: 940 }),
        ...rows.parts,
    ]), rows };
}

function boardOrd(t) {
    const rows = cardRows('or', t.ord, { top: 606, h: 158, gap: 20 });
    return { ...board('ord', [
        textPart('h', t.ordH, { at: [540, 540], font: `800 36px ${FONT}`, fill: 'ink',
                                alpha: 0, z: 60, maxWidth: 940 }),
        ...rows.parts,
    ]), rows };
}

/** What you can see before you can see the structure. */
function boardFar(t) {
    const goss = gossanParts('g', { x: 160, w: 760, y: 700, h: 70 });
    // Float: loose blocks scattered DOWN a slope from a source uphill. The
    // slope is drawn so "uphill" is a direction on screen and not a word.
    const slope = pathPart('slope', poly([[60, 1180], [1020, 860], [1020, 1260], [60, 1260]], true),
                           { fill: 'soil', alpha: 0, z: 0 });
    const blocks = [[820, 905], [720, 950], [640, 985], [540, 1020], [430, 1065], [300, 1110]];
    const floatParts = blocks.map(([x, y], i) => pathPart(`fl${i}`, poly([
        [x - 16, y], [x - 6, y - 14], [x + 14, y - 8], [x + 10, y + 10], [x - 10, y + 12]], true),
        { fill: 'quartz', stroke: '#8a8172', strokeWidth: 2, alpha: 0, z: 40 }));
    return { ...board('far', [
        textPart('h', t.farH, { at: [540, 566], font: `800 33px ${FONT}`, fill: 'ink',
                                alpha: 0, z: 150, maxWidth: 940 }),
        ...goss.parts,
        textPart('gl', t.gossL, { at: [540, 800], font: `700 27px ${FONT}`, fill: 'gossan',
                                  alpha: 0, z: 150, maxWidth: 900 }),
        slope, ...floatParts,
        pathPart('up', `${M(300, 1160)} ${L(880, 966)} ${L(836, 952)} ${M(880, 966)} ${L(852, 1000)}`,
                 { stroke: 'gold', strokeWidth: 6, alpha: 0, z: 90, lineCap: 'round' }),
        textPart('fl', t.floatL, { at: [540, 1316], font: `700 27px ${FONT}`, fill: 'gold',
                                   alpha: 0, z: 150, maxWidth: 920 }),
    ]), gossIds: goss.ids, floatIds: floatParts.map((p) => p.id) };
}

function boardPan(t) {
    return board('pan', [
        textPart('h', t.panH, { at: [540, 640], font: `800 34px ${FONT}`, fill: 'ink',
                                alpha: 0, z: 60, maxWidth: 940 }),
        rectPart('yesBg', 940, 130, { at: [540, 810], fill: '#10251a', stroke: '#2fae6e',
                                      strokeWidth: 2, alpha: 0, z: 10 }),
        textPart('yes', t.panYes, { at: [540, 810], font: `700 29px ${FONT}`, fill: 'malachite',
                                    alpha: 0, z: 60, maxWidth: 880, lineHeight: 38 }),
        rectPart('noBg', 940, 150, { at: [540, 990], fill: '#2a1118', stroke: '#e2485f',
                                     strokeWidth: 2, alpha: 0, z: 10 }),
        textPart('no', t.panNo, { at: [540, 990], font: `700 29px ${FONT}`, fill: 'fault',
                                  alpha: 0, z: 60, maxWidth: 880, lineHeight: 38 }),
        ...statParts('perm', t.permV, t.permC, { at: [540, 1200], fill: 'gold', size: 60 }),
    ]);
}

export function partFive(lang) {
    const t = T[lang], P = P5[lang];
    const open = boardOpen(t), sd = boardSD(t), kit = boardKit(t);
    const ord = boardOrd(t), far = boardFar(t), pan = boardPan(t);
    const card = endCard(lang, t.next);
    const ban = bannerParts(lang, 5);
    const boards = [open, sd, kit, ord, far, pan,
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
                      ...build('open', open.beds.ids, 0.2, { gap: 0.1, span: 0.35 }),
                      ...build('open', open.sd.ids, 1.4, { gap: 0.16, span: 0.4, how: pop }),
                      ...build('open', ['kicker', 'title', 'titlesub'], titleAt(P[0], lang),
                               { gap: 0.24, span: 0.5 }),
                  ] },
            ],
        },
        {
            id: 'namba', palette: 'struct', background: { color: '#0d1319' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('sd', { alpha: 1 })]),
            shots: [
                { id: 'n0', dialogue: [vo(P[1], 0.2)],
                  actions: [
                      ...reveal('sd', 'h', 0.2, { span: 0.45 }),
                      ...build('sd', sd.beds.ids, 0.8, { gap: 0.12, span: 0.4 }),
                  ] },
                { id: 'n1', dialogue: [vo(P[2], 0.2)], actions: [] },
                { id: 'n2', dialogue: [vo(P[3], 0.2)],
                  actions: pop('sd', 'dip', 0.4, { span: 0.45 }) },
                { id: 'n3', dialogue: [vo(P[4], 0.2)],
                  actions: pop('sd', 'str', 0.4, { span: 0.45 }) },
                { id: 'n4', dialogue: [vo(P[5], 0.2)],
                  actions: [
                      ...build('sd', sd.symIds, 0.3, { gap: 0.1, span: 0.35, how: pop }),
                      ...pop('sd', 'sym', 2.4, { span: 0.45 }),
                  ] },
            ],
        },
        {
            id: 'swali', palette: 'struct', background: { color: '#111b24' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: two('asha', 'kitwana'),
            shots: [
                { id: 'q0', dialogue: [says('kitwana', P[6], 0.3)],
                  actions: [
                      { target: 'asha', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'kitwana', do: 'pose', pose: 'stand', at: 0 },
                      ...gesture('kitwana', 'ask', 0.3, { hold: 1.2 }),
                      ...blinks('asha', 4.5, 13), ...blinks('kitwana', 4.5, 31),
                  ] },
                { id: 'q1', dialogue: [says('asha', P[7], 0.3)],
                  actions: [
                      ...gesture('asha', 'count', 0.3, { hold: 1.4 }),
                      ...blinks('asha', 5.0, 47), ...blinks('kitwana', 5.0, 59),
                  ] },
                { id: 'q2', dialogue: [vo(P[8], 0.2)], actions: [] },
            ],
        },
        {
            id: 'vifaa', palette: 'struct', background: { color: STRUCT_PALETTE.bg },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('kit', { alpha: 1 })]),
            shots: [
                { id: 'v0', dialogue: [vo(P[9], 0.2)],
                  actions: [
                      ...reveal('kit', 'h', 0.2, { span: 0.45 }),
                      ...build('kit', kit.rows.rowIds(0), 0.8, { gap: 0.1, span: 0.4 }),
                  ] },
                { id: 'v1', dialogue: [vo(P[10], 0.2)],
                  actions: [
                      ...build('kit', kit.rows.rowIds(1), 0.3, { gap: 0.1, span: 0.4 }),
                      ...build('kit', kit.rows.rowIds(2), 1.8, { gap: 0.1, span: 0.4 }),
                  ] },
                { id: 'v2', dialogue: [vo(P[11], 0.2)],
                  actions: build('kit', kit.rows.rowIds(3), 0.3, { gap: 0.1, span: 0.4 }) },
            ],
        },
        {
            id: 'mpango', palette: 'struct', background: { color: '#0d1319' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('ord', { alpha: 1 })]),
            shots: [
                { id: 'p0', dialogue: [vo(P[12], 0.2)],
                  actions: reveal('ord', 'h', 0.2, { span: 0.45 }) },
                { id: 'p1', dialogue: [vo(P[13], 0.2)],
                  actions: build('ord', ord.rows.rowIds(0), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 'p2', dialogue: [vo(P[14], 0.2)],
                  actions: build('ord', ord.rows.rowIds(1), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 'p3', dialogue: [vo(P[15], 0.2)],
                  actions: build('ord', ord.rows.rowIds(2), 0.3, { gap: 0.1, span: 0.4 }) },
                { id: 'p4', dialogue: [vo(P[16], 0.2)],
                  actions: build('ord', ord.rows.rowIds(3), 0.3, { gap: 0.1, span: 0.4, how: pop }) },
                { id: 'p5', dialogue: [vo(P[17], 0.2)], actions: [] },
            ],
        },
        {
            id: 'mbali', palette: 'struct', background: { color: '#120f0b' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('far', { alpha: 1 })]),
            shots: [
                { id: 'f0', dialogue: [vo(P[18], 0.2)],
                  actions: reveal('far', 'h', 0.2, { span: 0.45 }) },
                { id: 'f1', dialogue: [vo(P[19], 0.2)],
                  actions: [
                      ...build('far', far.gossIds, 0.3, { gap: 0.12, span: 0.5 }),
                      ...pop('far', 'gl', 1.2, { span: 0.45 }),
                  ] },
                { id: 'f2', dialogue: [vo(P[20], 0.2)],
                  actions: [
                      ...reveal('far', 'slope', 0.3, { span: 0.5 }),
                      ...build('far', far.floatIds, 0.8, { gap: 0.11, span: 0.35, how: pop }),
                      ...reveal('far', 'up', 2.4, { span: 0.5 }),
                      ...pop('far', 'fl', 3.0, { span: 0.45 }),
                  ] },
            ],
        },
        {
            id: 'karai', palette: 'struct', background: { color: '#0a1016' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('pan', { alpha: 1 })]),
            shots: [
                { id: 'c0', dialogue: [vo(P[21], 0.2)],
                  actions: reveal('pan', 'h', 0.2, { span: 0.45 }) },
                { id: 'c1', dialogue: [vo(P[22], 0.2)],
                  actions: [
                      ...build('pan', ['yesBg', 'yes'], 0.3, { gap: 0.12, span: 0.45 }),
                      ...build('pan', ['noBg', 'no'], 2.6, { gap: 0.12, span: 0.45 }),
                  ] },
                // The caveat that costs someone a deposit if it is not said.
                { id: 'c2', dialogue: [vo(P[23], 0.2)], actions: [] },
            ],
        },
        {
            id: 'leseni', palette: 'struct', background: { color: '#141a14' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: two('rajabu', 'asha'),
            shots: [
                { id: 'l0', dialogue: [says('rajabu', P[24], 0.3)],
                  actions: [
                      { target: 'rajabu', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'asha', do: 'pose', pose: 'stand', at: 0 },
                      ...gesture('rajabu', 'tell', 0.4, { hold: 1.4 }),
                      ...blinks('rajabu', 5.5, 17), ...blinks('asha', 5.5, 83),
                  ] },
                { id: 'l1', dialogue: [says('asha', P[25], 0.3)],
                  actions: [
                      ...gesture('asha', 'present', 0.3, { hold: 2.0 }),
                      ...blinks('rajabu', 6.5, 29), ...blinks('asha', 6.5, 71),
                  ] },
            ],
        },
        {
            id: 'usalama', palette: 'struct', background: { color: '#0a1016' },
            transitionOut: { kind: 'crossfade', duration: 0.5 },
            cast: withBan([offstage('asha'), castBoard('pan', { alpha: 1 })]),
            shots: [
                { id: 'u0', dialogue: [vo(P[26], 0.2)],
                  actions: build('pan', ['perm_v', 'perm_c'], 0.6,
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
