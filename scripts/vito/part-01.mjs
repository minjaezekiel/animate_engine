/**
 * Sehemu 1 — "Kito kinachopatikana sehemu moja duniani".
 *
 * Tanzanite: what a gemstone is, and why this one exists in exactly one
 * place. The structure is the series' hook pattern -- the first line plays
 * over the picture and the title plate arrives under it, because a card in
 * the first two seconds spends the window the platform gives you.
 *
 * The geology is conventional: tanzanite is the blue-violet variety of
 * zoisite, coloured by vanadium, hosted in Neoproterozoic metasedimentary
 * gneisses on the western limb of the Lelatema antiform in the Mozambique
 * Belt, and commercially mined only in the Merelani Hills. The figures given
 * -- a strike length of a few kilometres, burial of the order of twenty
 * kilometres, temperatures around 600 C -- are the conventional ranges, said
 * as approximations in the narration rather than as precise values.
 */
import {
    L, M, Z, build, conceal, effect, ellipsePart, labelParts, pathPart, poly,
    pop, ramp, rectPart, reveal, smooth, textPart,
} from '../lib/diagram.mjs';
import { GROUND_Y } from '../lib/diagram.mjs';
import {
    CHARACTERS, META, VITO_PALETTE, VOICES, offstage, says, vo,
} from '../lib/vito.mjs';
import {
    blinks, board, castBoard, endCard, fitShots, foldBand, gemParts, glintPart,
    hookTitle, strata,
} from './common.mjs';

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const TALK_Y = Math.round(GROUND_Y - 274 * 1.5);

// ---------------------------------------------------------------------------
// Narration. One table, quoted by number.
// ---------------------------------------------------------------------------

const P1 = [
    /* 0 HOOK -- one unbroken run, no pause, no card over it */
    'Kuna kito kimoja duniani kinachopatikana sehemu moja tu, na sehemu hiyo iko '
        + 'Tanzania, chini ya milima ya Merelani.',
    /* 1 */ 'Jina lake tanzanite. Rangi yake ya bluu-zambarau haipatikani kwenye jiwe '
          + 'lingine lolote duniani, na iligunduliwa mwaka elfu moja mia tisa sitini na '
          + 'saba.',
    /* 2 */ 'Eneo lote linalotoa tanzanite ni kama kilomita nne kwa urefu. Dunia nzima, '
          + 'kilomita nne.',
    /* 3 */ 'Sasa swali ambalo hakuna anayelijibu dukani: kwa nini hapa, na si mahali '
          + 'pengine?',
    /* 4 */ 'Jibu lilianza miaka milioni mia sita iliyopita, wakati hapa palikuwa na '
          + 'bahari.',
    /* 5 */ 'Matope, mchanga na chokaa yalikaa chini ya bahari hiyo kwa mamilioni ya '
          + 'miaka, tabaka juu ya tabaka.',
    /* 6 */ 'Kisha mabara mawili yakagongana. Bahari ikafungwa, na miamba yote ikakunjwa '
          + 'kama nguo inayosukumwa.',
    /* 7 */ 'Mawe yale yakazikwa kilomita ishirini chini ya ardhi, yakakandamizwa kwa '
          + 'nguvu, yakachomwa kwa joto la nyuzi mia sita.',
    /* 8 */ 'Joto na mgandamizo havivunji mawe. Vinayaunda upya. Atomu zinapangika tena '
          + 'katika mpangilio mpya kabisa.',
    /* 9 */ 'Mpangilio huo unaitwa fuwele. Na fuwele inahitaji vitu vitatu: nafasi, '
          + 'muda, na kichocheo sahihi.',
    /*10 */ 'Nafasi ilikuwa kwenye mishipa ya majimaji moto yaliyopenya kwenye miamba '
          + 'iliyopasuka.',
    /*11 */ 'Muda ulikuwa miaka milioni. Na kichocheo kilikuwa kitu cha nadra sana: '
          + 'vanadiumu.',
    /*12 */ 'Vanadiumu kidogo tu, kama chembe moja kwa elfu, ndani ya jiwe linaloitwa '
          + 'zoisite.',
    /*13 */ 'Zoisite peke yake ni jiwe la kijivu, halina thamani. Ongeza vanadiumu na '
          + 'joto, linakuwa bluu.',
    /*14 BAKARI */ 'Lakini joto na mgandamizo vipo kila mahali duniani. Kwa nini '
          + 'tanzanite ni hapa tu?',
    /*15 NURU */ 'Kwa sababu vitu vitatu vilikutana sehemu moja: miamba sahihi, joto '
          + 'sahihi, na vanadiumu. Kikose kimoja, hakuna kito.',
    /*16 */ 'Hiyo ni kanuni ya vito vyote, si tanzanite peke yake. Si bahati. Ni '
          + 'mazingira yaliyokutana.',
    /*17 */ 'Na kazi ya mtafiti ni kujua mazingira hayo, kisha kuyatafuta kwenye ardhi. '
          + 'Hiyo inajifunzika, na haihitaji chuo.',
    /*18 */ 'Sehemu inayofuata: viwanda vitatu vinavyozalisha kila kito duniani. Ukijua '
          + 'viwanda, unajua wapi kuanza.',
    /*19 */ 'Na kuna jambo lingine. Akiba ya Merelani ni ndogo, na wachimbaji wanakadiria '
          + 'miaka ishirini hadi thelathini tu.',
    /*20 */ 'Kila jiwe linalotoka hapa halirudi tena.',
    /*21 */ 'Jambo lingine la kushangaza: tanzanite nyingi inayochimbwa ni ya kahawia, si '
          + 'ya bluu. Joto la nyuzi mia tano linabadilisha rangi kuwa bluu.',
    /*23 */ 'Na sababu ya rangi mbili ni ajabu zaidi. Ukiigeuza, tanzanite inaonyesha '
          + 'bluu, zambarau na nyekundu, kutegemea upande unaoiangalia.',
];

// ---------------------------------------------------------------------------
// Board 1: the stone, the place, the question
// ---------------------------------------------------------------------------

/** Tanzania, roughly. A recognisable silhouette, not a survey boundary. */
const TZ = [
    [300, 700], [392, 676], [470, 686], [540, 666], [612, 672], [690, 700],
    [742, 760], [766, 836], [778, 920], [760, 1000], [720, 1064], [660, 1106],
    [586, 1128], [512, 1120], [446, 1092], [392, 1046], [344, 986], [310, 912],
    [294, 826], [300, 700],
];

function boardStone() {
    // Big, and centred on the stage rather than floating in the upper third:
    // at 250 wide it occupied a tenth of a 1080x1920 frame and the rest was
    // empty.
    const gem = gemParts('gem', 540, 880, 440);
    const parts = [
        ...gem.parts,
        glintPart('glint', 432, 786, 78),
        glintPart('glint2', 660, 836, 52),
        ...hookTitle('MADINI YA VITO  ·  SEHEMU 1',
                     'Kito cha sehemu moja',
                     'tanzanite, na kwa nini ipo hapa tu'),
        // the map, which replaces the stone
        pathPart('tz', poly(TZ, true),
                 { fill: 'rockDark', stroke: 'dim', strokeWidth: 3, alpha: 0, z: 10 }),
        ellipsePart('mer', 13, 13, { at: [596, 772], fill: 'gem', alpha: 0, z: 14 }),
        ellipsePart('merHalo', 34, 34, { at: [596, 772], stroke: 'gem', strokeWidth: 3,
                                        alpha: 0, z: 13 }),
        ...labelParts('merL', 'Merelani\nArusha', [700, 712], [612, 764],
                      { font: `700 30px ${FONT}`, fill: 'ink', stroke: 'gem' }),
        textPart('tzName', 'TANZANIA', { at: [540, 1180], font: `700 32px ${FONT}`,
                                         fill: 'dim', alpha: 0, z: 14 }),
        // the four-kilometre bar: the number that does the work
        pathPart('scaleBar', `${M(420, 1256)} ${L(660, 1256)}`,
                 { stroke: 'gold', strokeWidth: 7, alpha: 0, z: 20, lineCap: 'butt' }),
        pathPart('scaleTickL', `${M(420, 1238)} ${L(420, 1274)}`,
                 { stroke: 'gold', strokeWidth: 4, alpha: 0, z: 20 }),
        pathPart('scaleTickR', `${M(660, 1238)} ${L(660, 1274)}`,
                 { stroke: 'gold', strokeWidth: 4, alpha: 0, z: 20 }),
        textPart('scaleTxt', 'KILOMITA 4 — DUNIA NZIMA', {
            at: [540, 1306], font: `800 34px ${FONT}`, fill: 'gold', alpha: 0, z: 20 }),
        textPart('qMark', 'KWA NINI HAPA?', {
            at: [540, 1400], font: `800 46px ${FONT}`, fill: 'ink', alpha: 0, z: 30 }),
    ];
    return { ...board('stone', parts), gemIds: gem.ids };
}

// ---------------------------------------------------------------------------
// Board 2: the sea, and the sediment that became the host rock
// ---------------------------------------------------------------------------

function boardSea() {
    // The first version drew a flat blue rectangle with a few short dashes on
    // it and read as a swimming pool with sticks in it. What makes flat water
    // read as water is a WAVY surface edge, and streaks that are long, nearly
    // horizontal and densest just under that edge -- falling off with depth,
    // because that is where light stops reaching.
    const SURF = 628, FLOOR = 988;
    const wave = (y, amp, ph) => smooth(
        Array.from({ length: 13 }, (_, i) => {
            const x = -30 + i * 95;
            return [x, y + Math.sin(i * 0.9 + ph) * amp];
        }));
    const body = `${wave(SURF, 11, 0)} L1110,${FLOOR} L-30,${FLOOR} Z`;
    const parts = [
        rectPart('sky', 1160, 240, { at: [540, SURF - 110], fill: '#0c1322', alpha: 0, z: -14 }),
        pathPart('sea', body, { fill: 'waterDeep', alpha: 0, z: -12 }),
        // a lighter wedge near the surface: light falls off with depth
        pathPart('seaLit', `${wave(SURF, 11, 0)} L1110,${SURF + 118} L-30,${SURF + 118} Z`,
                 { fill: '#2a74a6', alpha: 0, z: -11 }),
        pathPart('seaEdge', wave(SURF, 11, 0),
                 { stroke: 'foam', strokeWidth: 5, alpha: 0, z: -6, lineCap: 'round' }),
    ];
    // Five lanes. Long dashes, each lane slower and fainter than the one
    // above it, which is what stops the whole surface sliding as one sheet.
    const LANES = [
        [SURF + 26, 0.46, 9, 'foam', 0.95, 320],
        [SURF + 62, 0.40, 8, 'water', 0.80, 380],
        [SURF + 104, 0.34, 7, 'water', 0.62, 440],
        [SURF + 156, 0.28, 6, 'water', 0.44, 500],
        [SURF + 214, 0.22, 5, 'water', 0.30, 560],
    ];
    LANES.forEach(([y, dash, lw, col, a, len], i) => {
        parts.push(pathPart(`wave${i}`, wave(y, 8 - i, i * 0.7), {
            stroke: col, strokeWidth: lw, alpha: 0, z: -5 + i, lineCap: 'round',
            trim: { end: dash, length: len }, flow: 0,
        }));
    });
    parts.push(textPart('seaTxt', 'MIAKA MILIONI 600 ILIYOPITA', {
        at: [540, 512], font: `700 32px ${FONT}`, fill: 'dim', alpha: 0, z: 30 }));
    // The seabed starts exactly where the water ends, so it reads as a floor
    // rather than as a chart floating under a pool.
    const st = strata('sed', [
        ['chokaa', '#b9b0a0', 50],
        ['matope', '#6f6555', 58],
        ['mchanga', '#8a7a5e', 46],
        ['chokaa', '#a9a192', 52],
        ['matope', '#5e5546', 62],
    ], { x: -30, w: 1140, top: FLOOR, z: 0 });
    parts.push(...st.parts);
    parts.push(textPart('sedTxt', 'TABAKA JUU YA TABAKA', {
        at: [540, st.bottom + 58], font: `800 34px ${FONT}`, fill: 'ink', alpha: 0, z: 30 }));
    return { ...board('sea', parts), sedIds: st.ids,
             waveIds: LANES.map((_, i) => `wave${i}`) };
}

// ---------------------------------------------------------------------------
// Board 3: collision, folding and burial
// ---------------------------------------------------------------------------

function boardFold() {
    // An antiform: the shape the Merelani deposit actually sits on the limb
    // of. Five layers, each a proper closed band -- see `foldBand`, which
    // exists because the first version joined two smooth curves by string
    // surgery and every layer grew spikes off the left edge of the frame.
    const CREST = 560, AMP = 190;
    const ridge = (y) => Array.from({ length: 11 }, (_, i) => {
        const x = -40 + i * 116;
        const u = (x - 540) / 620;
        return [x, y - AMP * Math.exp(-u * u * 2.6)];
    });
    const COLS = [['#c6bdab', 54], ['#7b705d', 62], ['#9a8a6c', 48],
                  ['#b3aa99', 56], ['#655b4b', 150]];
    const parts = [];
    let y = CREST;
    COLS.forEach(([fill, h], i) => {
        parts.push(pathPart(`fold${i}`, foldBand(ridge(y), h),
                            { fill, alpha: 0, z: i }));
        y += h;
    });
    parts.push(
        // The collision, as pressure on the limbs rather than as two
        // free-floating blocks: the first version drew detached grey
        // rectangles under the fold and read as nothing at all.
        pathPart('arrL', `${M(96, 980)} ${L(330, 980)} ${L(292, 954)} `
                       + `${M(330, 980)} ${L(292, 1006)}`,
                 { stroke: 'fault', strokeWidth: 9, alpha: 0, z: 40, lineCap: 'round' }),
        pathPart('arrR', `${M(984, 980)} ${L(750, 980)} ${L(788, 954)} `
                       + `${M(750, 980)} ${L(788, 1006)}`,
                 { stroke: 'fault', strokeWidth: 9, alpha: 0, z: 40, lineCap: 'round' }),
        textPart('pressTxt', 'MABARA MAWILI YANAGONGANA', {
            at: [540, 1046], font: `700 31px ${FONT}`, fill: 'fault', alpha: 0, z: 40 }),
        ...labelParts('foldL', 'mikunjo ya ukanda\nwa Msumbiji', [880, 452], [700, 520],
                      { font: `700 29px ${FONT}`, fill: 'ink', stroke: 'dim',
                        align: 'right' }),
        // depth, as a bar beside the section rather than a bare axis
        rectPart('depthBar', 16, 560, { at: [96, 780], fill: '#1d2735', alpha: 0, z: 38 }),
        rectPart('depthFill', 16, 560, { at: [96, 780], fill: 'heat', alpha: 0, z: 39 }),
        textPart('d0', '0 km', { at: [126, 510], font: `700 27px ${FONT}`, fill: 'dim',
                                 align: 'left', alpha: 0, z: 40 }),
        textPart('d20', '20 km', { at: [126, 1056], font: `800 31px ${FONT}`, fill: 'heat',
                                   align: 'left', alpha: 0, z: 40 }),
        textPart('tempTxt', 'NYUZI 600  ·  KILOMITA 20 CHINI', {
            at: [540, 1180], font: `800 38px ${FONT}`, fill: 'heat', alpha: 0, z: 50,
            maxWidth: 940 }),
    );
    return board('fold', parts);
}

// ---------------------------------------------------------------------------
// Board 4: atoms rearranging into a lattice
// ---------------------------------------------------------------------------

function boardCrystal() {
    const parts = [
        textPart('xHead', 'FUWELE: MPANGILIO, SI MKUSANYIKO', {
            at: [540, 548], font: `700 32px ${FONT}`, fill: 'dim', alpha: 0, z: 40 }),
        textPart('xBefore', 'kabla', { at: [300, 626], font: `700 28px ${FONT}`,
                                       fill: 'dim', alpha: 0, z: 40 }),
        textPart('xAfter', 'baada', { at: [780, 626], font: `700 28px ${FONT}`,
                                      fill: 'gem', alpha: 0, z: 40 }),
    ];
    // Left: disordered. Right: a lattice. Both drawn; the right one reveals
    // as the narration reaches it, so the viewer sees the ORDER appear.
    let s = 1;
    const seed = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    for (let i = 0; i < 28; i++) {
        parts.push(ellipsePart(`a${i}`, 11, 11, {
            at: [160 + seed() * 280, 690 + seed() * 300], fill: 'rock', alpha: 0, z: 10 }));
    }
    for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 6; c++) {
            const x = 630 + c * 56 + (r % 2) * 28;
            const yy = 700 + r * 52;
            parts.push(ellipsePart(`l${r}${c}`, 11, 11,
                { at: [x, yy], fill: r % 2 ? 'gem' : 'violet', alpha: 0, z: 11 }));
        }
    }
    parts.push(
        pathPart('xArrow',
                 `${M(470, 840)} ${L(580, 840)} ${L(552, 820)} ${M(580, 840)} ${L(552, 860)}`,
                 { stroke: 'ink', strokeWidth: 6, alpha: 0, z: 40 }),
        textPart('xNeed', 'nafasi  ·  muda  ·  kichocheo', {
            at: [540, 1092], font: `800 38px ${FONT}`, fill: 'ink', alpha: 0, z: 40 }),
    );
    return board('crystal', parts);
}

// ---------------------------------------------------------------------------
// Board 5: the vein, the fluid, the vanadium
// ---------------------------------------------------------------------------

function boardVein() {
    // The vein runs up the frame and the fluid FLOWS up it -- drawn bottom to
    // top so a falling `flow` carries the pattern upward. The first version
    // made the vein 40 units wide on a slab that did not fill the frame, and
    // it read as a white snake on a brown card with pills on it.
    const spine = [[548, 1330], [486, 1180], [566, 1030], [478, 880],
                   [572, 730], [506, 580], [548, 440]];
    const off = (dx) => spine.map(([x, y]) => [x + dx, y]);
    const parts = [
        rectPart('rockbg', 1160, 960, { at: [540, 880], fill: 'rockDark', alpha: 0, z: -24 }),
        // fractures around the vein: a fluid road exists because the rock broke
        pathPart('frac1', smooth([[90, 1180], [300, 1010], [430, 900]]),
                 { stroke: '#4a443a', strokeWidth: 7, alpha: 0, z: -22 }),
        pathPart('frac2', smooth([[1000, 1120], [800, 960], [640, 860]]),
                 { stroke: '#4a443a', strokeWidth: 7, alpha: 0, z: -22 }),
        pathPart('frac3', smooth([[160, 560], [340, 660], [470, 700]]),
                 { stroke: '#4a443a', strokeWidth: 6, alpha: 0, z: -22 }),
        pathPart('vein', smooth(spine),
                 { stroke: 'quartz', strokeWidth: 66, alpha: 0, z: -14, lineCap: 'round' }),
        pathPart('veinCore', smooth(spine),
                 { stroke: '#f6f3ec', strokeWidth: 44, alpha: 0, z: -13, lineCap: 'round' }),
        // three lanes of fluid: long dashes, so it reads as a current rather
        // than as beads threaded on a wire
        pathPart('fl0', smooth(spine), {
            stroke: 'heat', strokeWidth: 26, alpha: 0, z: -11, lineCap: 'round',
            trim: { end: 0.34, length: 300 }, flow: 0 }),
        pathPart('fl1', smooth(off(-15)), {
            stroke: 'hot', strokeWidth: 12, alpha: 0, z: -10, lineCap: 'round',
            trim: { end: 0.26, length: 380 }, flow: 0 }),
        pathPart('fl2', smooth(off(15)), {
            stroke: 'hot', strokeWidth: 10, alpha: 0, z: -10, lineCap: 'round',
            trim: { end: 0.2, length: 450 }, flow: 0 }),
        ...labelParts('veinL', 'majimaji moto\nyanapanda', [120, 690], [452, 830],
                      { font: `700 30px ${FONT}`, fill: 'ink', stroke: 'heat',
                        align: 'left', leadAt: [300, 740] }),
        // zoisite, grey then blue, clear of the vein on the right
        textPart('zoHead', 'ZOISITE', { at: [846, 560], font: `700 30px ${FONT}`,
                                        fill: 'dim', alpha: 0, z: 40 }),
        pathPart('zoGrey', poly([[760, 604], [918, 614], [952, 742], [848, 826],
                                 [742, 740]], true),
                 { fill: 'rock', stroke: 'dim', strokeWidth: 3, alpha: 0, z: 20 }),
        pathPart('zoBlue', poly([[760, 604], [918, 614], [952, 742], [848, 826],
                                 [742, 740]], true),
                 { fill: 'tanzanite', stroke: 'gem', strokeWidth: 3, alpha: 0, z: 21 }),
        textPart('zoGreyT', 'kijivu — hakuna thamani', {
            at: [846, 882], font: `600 27px ${FONT}`, fill: 'dim', alpha: 0, z: 40,
            maxWidth: 420 }),
        textPart('zoBlueT', 'bluu — TANZANITE', {
            at: [846, 882], font: `800 31px ${FONT}`, fill: 'gem', alpha: 0, z: 41,
            maxWidth: 420 }),
        textPart('vHead', 'VANADIUMU', { at: [540, 1392], font: `800 42px ${FONT}`,
                                         fill: 'gold', alpha: 0, z: 40 }),
        textPart('vSub', 'chembe moja kwa elfu', { at: [540, 1442],
            font: `600 29px ${FONT}`, fill: 'dim', alpha: 0, z: 40 }),
    ];
    // vanadium specks riding up the vein
    const VSPOT = [[520, 1250], [556, 1120], [500, 1010], [540, 940],
                   [506, 846], [548, 782], [520, 690], [556, 626], [516, 540]];
    VSPOT.forEach(([x, y], i) => {
        parts.push(ellipsePart(`v${i}`, 10, 10, { at: [x, y], fill: 'gold',
                                                  alpha: 0, z: 30 }));
    });
    return board('vein', parts);
}

// ---------------------------------------------------------------------------
// Board 6: the three conditions
// ---------------------------------------------------------------------------

function boardThree() {
    const R = 200;
    const C = [[400, 820], [680, 820], [540, 1056]];
    const names = ['MIAMBA\nSAHIHI', 'JOTO\nSAHIHI', 'VANADIUMU'];
    const cols = ['gneiss', 'heat', 'gold'];
    const parts = [
        textPart('tHead', 'VITO HAVITOKEI KWA BAHATI', {
            at: [540, 600], font: `800 40px ${FONT}`, fill: 'ink', alpha: 0, z: 50,
            maxWidth: 940 }),
    ];
    C.forEach(([x, y], i) => {
        parts.push(
            ellipsePart(`c${i}`, R, R, { at: [x, y], fill: cols[i], alpha: 0, z: 10 + i }),
            textPart(`c${i}t`, names[i], {
                at: [x + (i === 0 ? -120 : i === 1 ? 120 : 0), y + (i === 2 ? 150 : -170)],
                font: `800 30px ${FONT}`, fill: 'ink', alpha: 0, z: 40 }),
        );
    });
    parts.push(
        ellipsePart('core', 54, 54, { at: [540, 898], fill: 'gem', alpha: 0, z: 30 }),
        textPart('coreT', 'KITO', { at: [540, 898], font: `800 32px ${FONT}`,
                                    fill: '#05080d', alpha: 0, z: 31 }),
        textPart('tFoot', 'Kikose kimoja — hakuna kito.', {
            at: [540, 1340], font: `800 38px ${FONT}`, fill: 'gold', alpha: 0, z: 50,
            maxWidth: 940 }),
        // the reserve: a bar that is mostly already gone
        textPart('resH', 'AKIBA YA MERELANI', { at: [540, 1252],
            font: `700 29px ${FONT}`, fill: 'dim', alpha: 0, z: 50 }),
        rectPart('resBg', 760, 26, { at: [540, 1300], fill: '#2a3345', alpha: 0, z: 50 }),
        rectPart('resLeft', 190, 26, { at: [255, 1300], fill: 'gem', alpha: 0, z: 51 }),
        textPart('resT', 'miaka 20–30 iliyobaki', { at: [540, 1300],
            font: `800 26px ${FONT}`, fill: 'ink', alpha: 0, z: 52 }),
    );
    return board('three', parts);
}

// ---------------------------------------------------------------------------
// The film
// ---------------------------------------------------------------------------

export function partOne() {
    const stone = boardStone();
    const sea = boardSea();
    const fold = boardFold();
    const crystal = boardCrystal();
    const vein = boardVein();
    const three = boardThree();
    const card = endCard('Inayofuata: viwanda vitatu vya vito');
    const boards = [stone, sea, fold, crystal, vein, three,
                    { ...board('card', card.parts) }];

    const characters = { ...CHARACTERS };
    for (const b of boards) characters[b.name] = effect(b.parts, { palette: 'vito' });

    // Flow loops, long enough to cover the shot that holds them. `cycles` is
    // generous: flow is periodic, so an over-long ramp costs nothing.
    const seaFlow = [
        // One linear ramp each, at falling speeds. Linear is not negotiable:
        // `smooth` on a flow ramp pulses once per cycle and reads as a
        // stutter rather than as current.
        ...ramp('sea', 'wave0', 'props.flow', 0, 26, 0, 11.0, { ease: 'linear' }),
        ...ramp('sea', 'wave1', 'props.flow', 0, 26, 0, 8.6, { ease: 'linear' }),
        ...ramp('sea', 'wave2', 'props.flow', 0, 26, 0, 6.6, { ease: 'linear' }),
        ...ramp('sea', 'wave3', 'props.flow', 0, 26, 0, 4.9, { ease: 'linear' }),
        ...ramp('sea', 'wave4', 'props.flow', 0, 26, 0, 3.4, { ease: 'linear' }),
    ];
    const veinFlow = [
        ...ramp('vein', 'fl0', 'props.flow', 0, 34, 0, -17, { ease: 'linear' }),
        ...ramp('vein', 'fl1', 'props.flow', 0, 34, 0, -13, { ease: 'linear' }),
        ...ramp('vein', 'fl2', 'props.flow', 0, 34, 0, -10, { ease: 'linear' }),
    ];

    const scenes = [
        // --- the hook: stone, place, number, question
        {
            id: 'hook', palette: 'vito',
            background: { color: VITO_PALETTE.bg,
                          gradient: { kind: 'radial', from: [540, 800, 0, 1100],
                                      stops: [[0, '#16203a'], [1, VITO_PALETTE.bg]] } },
            transitionIn: { kind: 'fade', from: '#000000', duration: 0.7 },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage('nuru'), castBoard('stone', { alpha: 1 })],
            shots: [
                // The hook line starts at 0.3s. Nothing is allowed in front of it.
                { id: 'h0', duration: 9.0, dialogue: [vo(P1[0], 0.3)],
                  camera: { from: { zoom: 1.08 }, to: { zoom: 1.0 }, ease: 'smooth' },
                  actions: [
                      ...build('stone', stone.gemIds, 0.2, { gap: 0.07, span: 0.3 }),
                      ...pop('stone', 'glint', 1.5, { span: 0.5 }),
                      ...conceal('stone', 'glint', 2.1, { span: 0.4 }),
                      ...pop('stone', 'glint2', 2.6, { span: 0.4 }),
                      ...conceal('stone', 'glint2', 3.1, { span: 0.4 }),
                      // the plate arrives UNDER the hook, not before it
                      ...build('stone', ['kicker', 'title', 'titlesub'], 4.6,
                               { gap: 0.26, span: 0.5 }),
                  ] },
                { id: 'h1', duration: 6.6, dialogue: [vo(P1[1], 0.2)],
                  actions: [
                      ...pop('stone', 'glint', 1.2, { span: 0.45 }),
                      ...conceal('stone', 'glint', 1.9, { span: 0.4 }),
                  ] },
                { id: 'h2', duration: 7.4, dialogue: [vo(P1[2], 0.2)],
                  actions: [
                      ...conceal('stone', 'kicker', 0.1, { span: 0.4 }),
                      ...conceal('stone', 'titlesub', 0.1, { span: 0.4 }),
                      ...stone.gemIds.flatMap((id) => conceal('stone', id, 0.2, { span: 0.5 })),
                      ...reveal('stone', 'tz', 0.7, { span: 0.6 }),
                      ...reveal('stone', 'tzName', 1.1, { span: 0.4 }),
                      ...pop('stone', 'mer', 1.8, { span: 0.4 }),
                      ...reveal('stone', 'merHalo', 2.0, { span: 0.4 }),
                      ...build('stone', ['merL', 'merL_lead'], 2.4, { gap: 0.1, span: 0.4 }),
                      ...build('stone', ['scaleTickL', 'scaleTickR', 'scaleBar'], 3.8,
                               { gap: 0.1, span: 0.3 }),
                      ...pop('stone', 'scaleTxt', 4.4, { span: 0.45 }),
                  ] },
                { id: 'h3', duration: 6.9, dialogue: [vo(P1[3], 0.2)],
                  actions: pop('stone', 'qMark', 2.4, { span: 0.5 }) },
            ],
        },
        // --- the sea
        {
            id: 'bahari', palette: 'vito',
            background: { color: '#070c14' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage('nuru'), castBoard('sea', { alpha: 1 })],
            shots: [
                { id: 's0', duration: 6.7, dialogue: [vo(P1[4], 0.2)],
                  actions: [
                      ...seaFlow,
                      ...reveal('sea', 'sky', 0.1, { span: 0.5 }),
                      ...reveal('sea', 'sea', 0.3, { span: 0.6 }),
                      ...reveal('sea', 'seaLit', 0.5, { span: 0.6 }),
                      ...reveal('sea', 'seaEdge', 0.6, { span: 0.5 }),
                      ...build('sea', sea.waveIds, 0.8, { gap: 0.14, span: 0.5 }),
                      ...reveal('sea', 'seaTxt', 1.6, { span: 0.5 }),
                  ] },
                { id: 's1', duration: 8.4, dialogue: [vo(P1[5], 0.2)],
                  actions: [
                      // bottom-up, because that is the order they were laid
                      ...build('sea', [...sea.sedIds].reverse(), 0.5,
                               { gap: 0.3, span: 0.5 }),
                      ...reveal('sea', 'sedTxt', 4.6, { span: 0.5 }),
                  ] },
            ],
        },
        // --- collision and burial
        {
            id: 'mgongano', palette: 'vito',
            background: { color: '#0a0f17' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage('nuru'), castBoard('fold', { alpha: 1 })],
            shots: [
                { id: 'f0', duration: 7.0, dialogue: [vo(P1[6], 0.2)],
                  camera: { from: { zoom: 1.0 }, to: { zoom: 1.06 }, ease: 'smooth' },
                  actions: [
                      ...build('fold', ['fold4', 'fold3', 'fold2', 'fold1', 'fold0'], 0.3,
                               { gap: 0.16, span: 0.45 }),
                      ...reveal('fold', 'arrL', 1.8, { span: 0.35 }),
                      ...reveal('fold', 'arrR', 1.8, { span: 0.35 }),
                      ...reveal('fold', 'pressTxt', 2.2, { span: 0.4 }),
                      ...build('fold', ['foldL', 'foldL_lead'], 4.0, { gap: 0.1, span: 0.4 }),
                  ] },
                { id: 'f1', duration: 8.8, dialogue: [vo(P1[7], 0.2)],
                  actions: [
                      ...conceal('fold', 'arrL', 0.1, { span: 0.4 }),
                      ...conceal('fold', 'arrR', 0.1, { span: 0.4 }),
                      ...conceal('fold', 'pressTxt', 0.1, { span: 0.4 }),
                      ...build('fold', ['depthBar', 'd0'], 0.6, { gap: 0.2, span: 0.4 }),
                      // the bar fills downward as the burial is described
                      ...reveal('fold', 'depthFill', 1.2, { span: 0.3 }),
                      ...ramp('fold', 'depthFill', 'transform.sy', 1.2, 2.6, 0.02, 1),
                      ...reveal('fold', 'd20', 3.6, { span: 0.4 }),
                      ...pop('fold', 'tempTxt', 4.2, { span: 0.5 }),
                  ] },
            ],
        },
        // --- recrystallisation
        {
            id: 'fuwele', palette: 'vito',
            background: { color: '#0a0f17' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage('nuru'), castBoard('crystal', { alpha: 1 })],
            shots: [
                { id: 'x0', duration: 7.4, dialogue: [vo(P1[8], 0.2)],
                  actions: [
                      ...reveal('crystal', 'xHead', 0.2, { span: 0.4 }),
                      ...reveal('crystal', 'xBefore', 0.5, { span: 0.4 }),
                      ...build('crystal', Array.from({ length: 28 }, (_, i) => `a${i}`), 0.7,
                               { gap: 0.04, span: 0.25 }),
                      ...reveal('crystal', 'xArrow', 3.0, { span: 0.4 }),
                      ...reveal('crystal', 'xAfter', 3.3, { span: 0.4 }),
                      ...build('crystal',
                               Array.from({ length: 36 }, (_, i) => `l${Math.floor(i / 6)}${i % 6}`),
                               3.6, { gap: 0.05, span: 0.25 }),
                  ] },
                { id: 'x1', duration: 7.5, dialogue: [vo(P1[9], 0.2)],
                  actions: pop('crystal', 'xNeed', 2.6, { span: 0.5 }) },
            ],
        },
        // --- the vein and the vanadium
        {
            id: 'mshipa', palette: 'vito',
            background: { color: '#080c13' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage('nuru'), castBoard('vein', { alpha: 1 })],
            shots: [
                { id: 'v0', duration: 6.2, dialogue: [vo(P1[10], 0.2)],
                  actions: [
                      ...veinFlow,
                      ...reveal('vein', 'rockbg', 0.1, { span: 0.5 }),
                      ...build('vein', ['frac1', 'frac2', 'frac3'], 0.3,
                               { gap: 0.12, span: 0.4 }),
                      ...reveal('vein', 'vein', 0.6, { span: 0.6 }),
                      ...reveal('vein', 'veinCore', 0.8, { span: 0.5 }),
                      ...build('vein', ['fl0', 'fl1', 'fl2'], 1.0, { gap: 0.2, span: 0.5 }),
                      ...build('vein', ['veinL', 'veinL_lead'], 2.4, { gap: 0.1, span: 0.4 }),
                  ] },
                { id: 'v1', duration: 6.4, dialogue: [vo(P1[11], 0.2)],
                  actions: [
                      ...reveal('vein', 'vHead', 2.2, { span: 0.45 }),
                      ...reveal('vein', 'vSub', 2.6, { span: 0.4 }),
                      ...build('vein', Array.from({ length: 9 }, (_, i) => `v${i}`), 3.0,
                               { gap: 0.09, span: 0.3, how: pop }),
                  ] },
                { id: 'v2', duration: 6.5, dialogue: [vo(P1[12], 0.2)],
                  actions: [
                      ...reveal('vein', 'zoHead', 0.3, { span: 0.4 }),
                      ...reveal('vein', 'zoGrey', 0.6, { span: 0.5 }),
                      ...reveal('vein', 'zoGreyT', 1.0, { span: 0.4 }),
                  ] },
                { id: 'v3', duration: 7.5, dialogue: [vo(P1[13], 0.2)],
                  actions: [
                      ...conceal('vein', 'zoGreyT', 3.0, { span: 0.4 }),
                      ...reveal('vein', 'zoBlue', 3.2, { span: 0.7 }),
                      ...pop('vein', 'zoBlueT', 3.6, { span: 0.5 }),
                  ] },
                { id: 'v4', duration: 8.0, dialogue: [vo(P1[21], 0.2)],
                  actions: [
                      ...ramp('vein', 'zoBlue', 'props.alpha', 0.4, 1.2, 1, 0),
                      ...ramp('vein', 'zoGrey', 'props.alpha', 0.4, 1.2, 1, 1),
                      ...conceal('vein', 'zoBlueT', 0.4, { span: 0.4 }),
                      ...reveal('vein', 'zoGreyT', 0.9, { span: 0.4 }),
                      ...ramp('vein', 'zoBlue', 'props.alpha', 4.4, 1.4, 0, 1),
                      ...conceal('vein', 'zoGreyT', 4.4, { span: 0.4 }),
                      ...reveal('vein', 'zoBlueT', 4.9, { span: 0.4 }),
                  ] },
                { id: 'v6', duration: 7.5, dialogue: [vo(P1[22], 0.2)],
                  actions: [
                      ...ramp('vein', 'zoBlue', 'props.fill', 1.0, 1.0,
                              '#4a63d8', '#8a6ad6'),
                      ...ramp('vein', 'zoBlue', 'props.fill', 3.0, 1.0,
                              '#8a6ad6', '#b3384f'),
                      ...ramp('vein', 'zoBlue', 'props.fill', 5.0, 1.0,
                              '#b3384f', '#4a63d8'),
                  ] },
            ],
        },
        // --- the question, asked and answered
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
                { id: 'q0', duration: 7.0, dialogue: [says('bakari', P1[14], 0.3)],
                  actions: [
                      { target: 'nuru', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'bakari', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'bakari', do: 'pose', pose: 'ask', at: 0.3, for: 0.6 },
                      ...blinks('nuru', 7.0, 11), ...blinks('bakari', 7.0, 29),
                  ] },
                { id: 'q1', duration: 8.5, dialogue: [says('nuru', P1[15], 0.3)],
                  actions: [
                      { target: 'nuru', do: 'pose', pose: 'present', at: 0.3, for: 0.7 },
                      { target: 'nuru', do: 'pose', pose: 'count', at: 3.4, for: 0.6 },
                      ...blinks('nuru', 8.5, 43), ...blinks('bakari', 8.5, 57),
                  ] },
            ],
        },
        // --- the rule, and the hook into part two
        {
            id: 'kanuni', palette: 'vito',
            background: { color: '#0a0f17' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage('nuru'), castBoard('three', { alpha: 1 })],
            shots: [
                { id: 'k0', duration: 7.4, dialogue: [vo(P1[16], 0.2)],
                  actions: [
                      ...reveal('three', 'tHead', 0.2, { span: 0.5 }),
                      ...build('three', ['c0', 'c0t', 'c1', 'c1t', 'c2', 'c2t'], 1.0,
                               { gap: 0.3, span: 0.5 }),
                      ...pop('three', 'core', 4.4, { span: 0.5 }),
                      ...reveal('three', 'coreT', 4.7, { span: 0.4 }),
                  ] },
                { id: 'k1', duration: 6.0, dialogue: [vo(P1[17], 0.2)],
                  actions: pop('three', 'tFoot', 1.4, { span: 0.5 }) },
                { id: 'k2', duration: 7.2, dialogue: [vo(P1[19], 0.2)],
                  actions: [
                      ...conceal('three', 'tFoot', 0.1, { span: 0.4 }),
                      ...reveal('three', 'resH', 0.5, { span: 0.4 }),
                      ...reveal('three', 'resBg', 0.8, { span: 0.4 }),
                      ...ramp('three', 'resLeft', 'transform.sx', 1.2, 1.2, 4.0, 1.0),
                      ...reveal('three', 'resLeft', 1.2, { span: 0.4 }),
                      ...reveal('three', 'resT', 2.6, { span: 0.4 }),
                  ] },
                { id: 'k3', duration: 6.6, dialogue: [vo(P1[20], 0.2)],
                  actions: pop('three', 'core', 2.2, { span: 0.45, to: 1.25 }) },
            ],
        },
        // --- end card: five seconds, not twenty
        {
            id: 'card', palette: 'vito',
            background: { color: '#05080d' },
            transitionIn: { kind: 'crossfade', duration: 0.5 },
            cast: [offstage('nuru'), castBoard('card', { alpha: 1 })],
            shots: [
                { id: 'c0', duration: 7.0, dialogue: [vo(P1[18], 0.2)],
                  actions: build('card', card.ids, 0.2, { gap: 0.22, span: 0.45 }) },
            ],
        },
    ];

    return fitShots({
        version: 'jirex.film/1',
        // Shot durations here are a word-count estimate, so the engine may
        // TIGHTEN them to the real audio as well as grow them. That is the
        // whole fix for the slack docs/27-RETENTION.md is about: write the
        // narration, let the picture follow it, rather than the reverse.
        meta: { ...META('Kito cha sehemu moja'), estimatedTiming: true },
        palettes: { vito: VITO_PALETTE },
        voices: VOICES,
        characters,
        scenes,
    });
}
