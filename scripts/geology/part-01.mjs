/**
 * Part 1 — How gold forms.
 *
 * Nucleosynthesis, the crustal budget, and the hydrothermal system that
 * concentrates gold into a lode. The cross-section in `boardSection` is the
 * hero diagram of the whole series: later parts keep coming back to it.
 */
import {
    C, L, M, Q, TYPE, Z, arrowPath, build, captionPart, conceal, effect,
    ellipsePart, glide, labelParts, logScale, pathPart, poly, pop, ramp, rectPart,
    reveal, textPart, titleParts,
} from '../lib/diagram.mjs';
import {
    CHARACTERS, GEO_PALETTE, META, SERIES, VOICES, endCard, offstage, says, vo,
} from '../lib/series.mjs';
import { GROUND_Y } from '../lib/diagram.mjs';
import { bez3, blinks, board, castBoard, rng, squarePath } from './common.mjs';

/** Hips height for a figure cast at 1.5x standing on the ground line. */
const TALK_Y = Math.round(GROUND_Y - 274 * 1.5);

// ===========================================================================
// PART 1 — How gold forms
// ===========================================================================

const P1 = [
    /* 0 */ 'Every gram of gold on Earth is older than the Earth itself.',
    /* 1 */ 'It was forged in dying stars, and in the collisions of their corpses. '
          + 'It arrived here in the dust that built this planet.',
    /* 2 */ 'Most of it sank into the core. What we mine is the little that stayed '
          + 'behind in the crust. And it did not stay evenly.',
    /* 3 */ 'Average crustal rock holds about four parts of gold per billion. To be '
          + 'worth mining, rock must be a thousand times richer than that. So '
          + 'something has to concentrate it.',
    /* 4 */ 'That something is hot water.',
    /* 5 */ 'Deep in the crust, water driven out of rock as it heats becomes a fluid '
          + 'at three to four hundred degrees, carrying silica, carbon dioxide and '
          + 'sulphur. Gold dissolves into it, bound to sulphur, at a few parts per '
          + 'billion.',
    /* 6 */ 'Now give that fluid a road. In an old mountain belt the roads are faults '
          + 'and shear zones: fractures kilometres deep, where the crust has slipped '
          + 'past itself.',
    /* 7 */ 'The fluid rises. And as it rises, it loses pressure, it cools, and it '
          + 'reacts with the rock around it.',
    /* 8 */ 'So the gold complex breaks down. Gold drops out of solution. Into quartz, '
          + 'into carbonate, and into the iron sulphides the fluid builds on the way: '
          + 'pyrite, and arsenopyrite.',
    /* 9 */ 'Repeat that ten thousand times across a million years, and you have a '
          + 'lode. A quartz vein, or a stack of them, threaded with metal.',
    /*10 */ 'This is orogenic gold. It is why the great gold districts of the world '
          + 'sit in Archaean greenstone belts: the deformed roots of mountains two '
          + 'and a half billion years old.',
    /*11 */ "So if I find a quartz vein, I've found gold?",
    /*12 */ "You've found a quartz vein. Almost all of them hold nothing.",
    /*13 */ 'Which is why exploration is a discipline. And why it begins with '
          + 'everything except digging.',
];

// --- board: the cosmos -----------------------------------------------------

const SPECK_ANGLES = Array.from({ length: 16 }, (_, i) => (i / 16) * Math.PI * 2 + 0.2);

function boardCosmos() {
    const r = rng(20261030);
    const parts = [];
    for (let i = 0; i < 90; i++) {
        const rad = 1.2 + r() * 2.6;
        parts.push(ellipsePart(`st${i}`, rad, rad, {
            at: [40 + r() * 1000, 170 + r() * 1500],
            fill: i % 7 ? 'ink' : 'gold',
            // Authored visible: 90 reveals would be 180 actions for something
            // that is simply there from the first frame.
            alpha: 0.22 + r() * 0.55, z: 1,
        }));
    }
    parts.push(
        ellipsePart('nsA', 15, 15, { at: [420, 900], fill: 'light', z: 20,
            glow: { blur: 34, color: '#9fd8ff' } }),
        ellipsePart('nsB', 12, 12, { at: [660, 900], fill: 'light', z: 20,
            glow: { blur: 28, color: '#ffd9a0' } }),
        ellipsePart('flash', 230, 230, { at: [540, 900], fill: 'light', z: 25,
            glow: { blur: 90, color: '#fff3cf' } }),
    );
    SPECK_ANGLES.forEach((_, i) => parts.push(
        ellipsePart(`sp${i}`, 5, 5, { at: [540, 900], fill: 'gold', z: 30 })));
    parts.push(
        ...titleParts(`${SERIES.toUpperCase()}  ·  PART 1`, 'How gold forms'),
        captionPart('cap1', 'forged in the death of stars'),
        captionPart('cap2', 'delivered in the dust that built Earth'),
    );
    return board('cos', parts);
}

/** Shot 2 of the cosmos: the spiral, the merger, and the gold thrown clear. */
function cosmosMerger(fx) {
    const MERGE = 3.7;
    const out = [];
    for (const [id, x0, dir] of [['nsA', 420, 1], ['nsB', 660, -1]]) {
        out.push(...reveal(fx, id, 0.3, { span: 0.4 }));
        // Offsets from where the star was authored, spiralling in to the
        // centre of the frame. `transform.x` is absolute, so each leg is the
        // authored point plus the offset -- see `glide`.
        const legs = [[0.7, 0, 0],
                      [1.7, (x0 - 540) * -0.42, -62 * dir],
                      [2.6, (x0 - 540) * -0.72, 44 * dir],
                      [3.3, (x0 - 540) * -0.9, -15 * dir],
                      [MERGE, (x0 - 540) * -1, 0]];
        let prev = legs[0];
        for (const leg of legs.slice(1)) {
            const span = leg[0] - prev[0];
            out.push(
                ...ramp(fx, id, 'transform.x', prev[0], span, x0 + prev[1], x0 + leg[1]),
                ...ramp(fx, id, 'transform.y', prev[0], span, 900 + prev[2], 900 + leg[2]));
            prev = leg;
        }
        out.push(...conceal(fx, id, MERGE, { span: 0.1 }));
    }
    // A hard rise and a slow decay: two frames up, most of a second down.
    out.push(
        ...ramp(fx, 'flash', 'transform.sx', MERGE - 0.08, 0.18, 0.04, 1.3),
        ...ramp(fx, 'flash', 'transform.sy', MERGE - 0.08, 0.18, 0.04, 1.3),
        ...ramp(fx, 'flash', 'props.alpha', MERGE - 0.08, 0.1, 0, 0.95),
        ...ramp(fx, 'flash', 'props.alpha', MERGE + 0.06, 0.8, 0.95, 0));
    SPECK_ANGLES.forEach((ang, i) => {
        const dist = 350 + (i % 5) * 95;
        out.push(
            ...reveal(fx, `sp${i}`, MERGE, { span: 0.1 }),
            ...glide(fx, `sp${i}`, [540, 900], MERGE, 2.0,
                     [Math.cos(ang) * dist, Math.sin(ang) * dist * 0.82]),
            ...conceal(fx, `sp${i}`, MERGE + 1.5, { span: 0.9 }));
    });
    out.push(...conceal(fx, 'cap1', 5.9, { span: 0.4 }),
             ...reveal(fx, 'cap2', 6.4, { span: 0.5 }));
    return out;
}

// --- board: the Earth, and crustal abundance -------------------------------

const EARTH = { cx: 540, cy: 880, r: 330 };

function boardEarth() {
    const { cx, cy, r } = EARTH;
    const parts = [
        ellipsePart('mantle', r, r, { at: [cx, cy], fill: '#6a4a38', z: 2 }),
        ellipsePart('outer', r * 0.62, r * 0.62, { at: [cx, cy], fill: '#8d5f41', z: 3 }),
        ellipsePart('core', r * 0.34, r * 0.34, { at: [cx, cy], fill: 'fluid', z: 4,
            glow: { blur: 40, color: '#e2663c' } }),
        // The crust is a hairline on this scale, and that IS the point.
        ellipsePart('crust', r, r, { at: [cx, cy], fill: null, stroke: 'gold',
            strokeWidth: 5, z: 6 }),
        ...labelParts('l_crust', 'crust  —  a 35 km skin', [820, 580], [cx + r * 0.72, cy - r * 0.72],
            { align: 'left' }),
        ...labelParts('l_core', 'core', [300, 1290], [cx - 40, cy + r * 0.25], { align: 'right' }),
        captionPart('cap_e', 'most of it is in the core, out of reach'),
    ];
    const r2 = rng(77);
    for (let i = 0; i < 14; i++) {
        const ang = r2() * Math.PI * 2;
        const rad = r * (0.72 + r2() * 0.24);
        parts.push(ellipsePart(`au${i}`, 6, 6, {
            at: [cx + Math.cos(ang) * rad, cy + Math.sin(ang) * rad],
            fill: 'gold', z: 5, _to: [cx - (Math.cos(ang) * rad) * 0.82,
                                      cy - (Math.sin(ang) * rad) * 0.82 - cy + cy] }));
    }
    return board('erth', parts);
}

/** Gold sinking inward: each dot travels most of the way to the centre. */
function earthSinks(fx) {
    const out = [...pop(fx, 'mantle', 0.2, { span: 0.5, overshoot: 0.06 }),
                 ...reveal(fx, 'outer', 0.5), ...reveal(fx, 'core', 0.8),
                 ...reveal(fx, 'crust', 1.1),
                 ...build(fx, ['l_crust', 'l_crust_lead'], 1.5, { gap: 0.1 }),
                 ...reveal(fx, 'cap_e', 2.0, { span: 0.5 })];
    const r2 = rng(77);
    for (let i = 0; i < 14; i++) {
        const ang = r2() * Math.PI * 2;
        const rad = EARTH.r * (0.72 + r2() * 0.24);
        const at = 2.6 + (i % 7) * 0.22;
        out.push(
            ...reveal(fx, `au${i}`, at, { span: 0.2 }),
            ...glide(fx, `au${i}`,
                     [EARTH.cx + Math.cos(ang) * rad, EARTH.cy + Math.sin(ang) * rad],
                     at + 0.2, 2.4,
                     [-Math.cos(ang) * rad * 0.8, -Math.sin(ang) * rad * 0.8]));
    }
    out.push(...build(fx, ['l_core', 'l_core_lead'], 6.0, { gap: 0.1 }));
    return out;
}

function boardAbundance() {
    const x0 = 140, x1 = 940, y = 980;
    const sx = logScale(0.001, 30, x0, x1);
    const tick = (id, v, label, color, up) => [
        pathPart(`${id}_t`, `${M(sx(v), y - 16)} ${L(sx(v), y + 16)}`,
            { stroke: color, strokeWidth: 5, z: 12 }),
        textPart(`${id}_v`, label, { at: [sx(v), up ? y - 54 : y + 62],
            font: TYPE.label, fill: color, z: 12 }),
    ];
    return board('abun', [
        textPart('ab_h', 'gold in rock, grams per tonne', {
            at: [540, 820], font: TYPE.heading, fill: 'ink' }),
        pathPart('ab_axis', `${M(x0, y)} ${L(x1, y)}`,
            { stroke: 'dim', strokeWidth: 3, z: 10 }),
        ...tick('ab_c', 0.004, 'ordinary rock\n0.004', 'dim', true),
        ...tick('ab_o', 1.0, 'worth mining\n1.0', 'gold', true),
        ...tick('ab_r', 20, 'rich vein\n20', 'gold', false),
        pathPart('ab_span', arrowPath([sx(0.004) + 14, y + 120], [sx(1.0) - 14, y + 120],
            { head: 18 }), { fill: 'gold', stroke: 'gold', strokeWidth: 4, z: 12 }),
        textPart('ab_mult', '× 250 richer', {
            at: [(sx(0.004) + sx(1)) / 2, y + 168], font: TYPE.caption, fill: 'gold', z: 13 }),
        captionPart('cap_a', 'something has to concentrate it'),
    ]);
}

// --- board: the crust in section (the hero diagram) ------------------------

const SHEAR = [[760, 1250], [722, 1080], [648, 830], [524, 520]];
const SHEAR_D = `${M(...SHEAR[0])} ${C(...SHEAR[1], ...SHEAR[2], ...SHEAR[3])}`;

function boardSection() {
    const parts = [
        // Country rock, deepest first.
        rectPart('rock', 960, 730, { at: [540, 885], fill: 'greenstone', alpha: 1, z: 1 }),
        rectPart('soil', 960, 34, { at: [540, 537], fill: 'soil', alpha: 1, z: 3 }),
        pathPart('surface', `${M(60, 520)} ${L(1020, 520)}`,
            { stroke: 'ink', strokeWidth: 3, alpha: 1, z: 4 }),
        ellipsePart('granite', 186, 74, { at: [292, 1168], fill: 'granite',
            alpha: 1, z: 3 }),
        // Bedding, so the rock reads as rock and a later offset can be seen.
        ...[640, 730, 830, 980, 1130].map((y, i) => pathPart(`bed${i}`,
            `${M(60, y)} ${Q(540, y - 22, 1020, y + 10)}`,
            { stroke: '#32503f', strokeWidth: 3, alpha: 1, z: 2 })),
        // The shear: a wide soft band with a hard centre line.
        pathPart('shear_band', SHEAR_D,
            { stroke: 'structure', strokeWidth: 52, lineCap: 'butt', alpha: 0, z: 5 }),
        pathPart('shear_line', SHEAR_D,
            { stroke: 'structure', strokeWidth: 4, lineCap: 'butt', z: 6 }),
        // The fluid at depth, and its cargo.
        ellipsePart('fluid', 165, 72, { at: [420, 1135], fill: 'fluid', z: 7,
            glow: { blur: 44, color: '#e2663c' } }),
        ...labelParts('l_fluid', '350–400 °C  ·  SiO₂, CO₂, H₂S',
            [150, 1012], [380, 1100]),
        ...labelParts('l_au', 'Au: a few parts per billion, bound to sulphur',
            [92, 940], [372, 1098], { font: TYPE.small }),
        // Slip on the shear.
        pathPart('slip1', arrowPath([838, 1060], [802, 910], { head: 18 }),
            { fill: 'structure', stroke: 'structure', strokeWidth: 4, z: 8 }),
        pathPart('slip2', arrowPath([636, 745], [686, 890], { head: 18 }),
            { fill: 'structure', stroke: 'structure', strokeWidth: 4, z: 8 }),
        ...labelParts('l_shear', 'shear zone', [1004, 700], [700, 830]),
        // Depth scale.
        // Clear of the surface line, and outlined so they read over green.
        ...[[585, '0'], [745, '2'], [955, '5'], [1190, '10']].map(([y, km], i) => (
            textPart(`dep${i}`, `${km} km`, { at: [1004, y], font: TYPE.small,
                fill: 'dim', stroke: '#0d1420', strokeWidth: 5,
                align: 'right', alpha: 1, z: 9 })
        )),
        // The vein, built in three stacked ribbons so a "stack of them" reads.
        pathPart('vein1', SHEAR_D, { stroke: 'quartz', strokeWidth: 15, lineCap: 'butt', z: 10 }),
        pathPart('vein2', `${M(696, 1105)} ${C(686, 960, 620, 800, 560, 600)}`,
            { stroke: 'quartz', strokeWidth: 9, z: 10 }),
        pathPart('vein3', `${M(800, 1170)} ${C(782, 1010, 712, 830, 628, 586)}`,
            { stroke: 'quartz', strokeWidth: 7, z: 10 }),
        ...labelParts('l_vein', 'quartz vein  —  the lode', [92, 660], [520, 700]),
        captionPart('cap_s1', 'hot water does the concentrating'),
        captionPart('cap_s2', 'pressure drops → gold drops'),
        captionPart('cap_s3', '× 10,000, over a million years'),
    ];
    // Fluid rising along the shear.
    for (let i = 0; i < 7; i++) {
        const t = 0.12 + (i / 6) * 0.8;
        const [x, y] = bez3(t, ...SHEAR);
        parts.push(ellipsePart(`rise${i}`, 20 - i * 1.6, 13 - i, {
            at: [x, y], fill: 'fluid', z: 9, glow: { blur: 20, color: '#e2663c' } }));
    }
    // Pyrite, with gold inside it.
    for (let i = 0; i < 3; i++) {
        const t = 0.62 + i * 0.13;
        const [x, y] = bez3(t, ...SHEAR);
        parts.push(
            pathPart(`py${i}`, squarePath(0, 0, 40, 0.3 + i * 0.15),
                { at: [x + 54, y], fill: 'sulphide', stroke: '#6f6440',
                  strokeWidth: 3, z: 12 }),
            ellipsePart(`pyau${i}`, 7, 7, { at: [x + 54, y], fill: 'gold', z: 13 }));
    }
    parts.push(...labelParts('l_py', 'pyrite  ·  arsenopyrite', [1004, 1055],
        [852, 990], { font: TYPE.small }));
    return board('xsec', parts);
}

const sectionShots = (fx) => ({
    // L4: the fluid arrives.
    s1: [...pop(fx, 'fluid', 0.5, { span: 0.6, overshoot: 0.1 }),
         ...reveal(fx, 'cap_s1', 0.9, { span: 0.5 })],
    // L5: what is in it.
    s2: [...build(fx, ['l_fluid', 'l_fluid_lead'], 0.6, { gap: 0.1 }),
         ...build(fx, ['l_au', 'l_au_lead'], 4.2, { gap: 0.1 })],
    // L6: the road.
    s3: [...reveal(fx, 'shear_band', 0.4, { span: 0.7, to: 0.34 }),
         ...reveal(fx, 'shear_line', 0.4, { span: 0.7 }),
         ...build(fx, ['l_shear', 'l_shear_lead'], 1.4, { gap: 0.1 }),
         ...reveal(fx, 'slip1', 3.0, { span: 0.3 }),
         ...reveal(fx, 'slip2', 3.3, { span: 0.3 }),
         ...conceal(fx, 'cap_s1', 4.6, { span: 0.4 })],
    // L7: it rises.
    s4: [...build(fx, ['rise0', 'rise1', 'rise2', 'rise3', 'rise4', 'rise5', 'rise6'],
                  0.4, { gap: 0.42, span: 0.3 }),
         ...reveal(fx, 'cap_s2', 4.4, { span: 0.5 })],
    // L8: it drops its metal.
    s5: [...reveal(fx, 'vein1', 0.6, { span: 1.1 }),
         ...build(fx, ['py0', 'py1', 'py2'], 4.0, { gap: 0.3, span: 0.3, how: pop }),
         ...build(fx, ['pyau0', 'pyau1', 'pyau2'], 5.0, { gap: 0.3, span: 0.25 }),
         ...build(fx, ['l_py', 'l_py_lead'], 6.2, { gap: 0.1 })],
    // L9: a stack of them.
    s6: [...conceal(fx, 'cap_s2', 0.3, { span: 0.4 }),
         ...reveal(fx, 'vein2', 1.2, { span: 0.8 }),
         ...reveal(fx, 'vein3', 2.0, { span: 0.8 }),
         ...build(fx, ['l_vein', 'l_vein_lead'], 3.0, { gap: 0.1 }),
         ...reveal(fx, 'cap_s3', 4.6, { span: 0.5 })],
});

// --- board: the greenstone belt --------------------------------------------

function boardBelt() {
    const belt = `${M(170, 1290)} ${C(250, 1060, 330, 900, 420, 740)} `
        + `${C(500, 600, 620, 520, 760, 470)} ${L(880, 530)} `
        + `${C(740, 600, 620, 690, 540, 830)} ${C(440, 990, 360, 1150, 300, 1330)} ${Z}`;
    const parts = [
        rectPart('bg_map', 960, 880, { at: [540, 890], fill: '#121b28', alpha: 1, z: 1 }),
        pathPart('belt', belt, { fill: 'greenstone', stroke: '#5d8a6e', strokeWidth: 3, z: 2 }),
        ellipsePart('dome1', 150, 185, { at: [700, 900], fill: 'granite', z: 3 }),
        ellipsePart('dome2', 105, 120, { at: [330, 620], fill: 'granite', z: 3 }),
        // Structures: the belt-parallel shears, and one cross-cutting fault.
        pathPart('str1', `${M(250, 1270)} ${C(330, 1030, 420, 830, 620, 560)}`,
            { stroke: 'structure', strokeWidth: 5, z: 6 }),
        pathPart('str2', `${M(330, 1310)} ${C(410, 1080, 500, 880, 700, 600)}`,
            { stroke: 'structure', strokeWidth: 4, z: 6 }),
        pathPart('str3', `${M(180, 760)} ${L(900, 1080)}`,
            { stroke: '#f08aa0', strokeWidth: 4, z: 6 }),
        ...labelParts('l_belt', 'Archaean greenstone belt', [560, 1370], [420, 1150],
            { align: 'center', font: TYPE.label }),
        ...labelParts('l_str', 'crustal-scale shear zones', [1004, 470], [560, 700]),
        textPart('belt_age', '2.7 – 2.5 billion years old', {
            at: [540, 1430], font: TYPE.small, fill: 'dim' }),
    ];
    // Deposits sit on structures, and especially where two of them cross.
    const spots = [[300, 1140], [372, 972], [455, 806], [560, 668], [700, 1004]];
    spots.forEach(([x, y], i) => {
        parts.push(ellipsePart(`dep${i}`, i === 4 ? 18 : 13, i === 4 ? 18 : 13,
            { at: [x, y], fill: 'gold', z: 8, glow: { blur: 22, color: '#ffc64d' } }));
    });
    parts.push(ellipsePart('xring', 40, 40, { at: [700, 1004], fill: null,
        stroke: 'gold', strokeWidth: 4, z: 9 }));
    parts.push(...labelParts('l_x', 'structures crossing', [1004, 1200], [740, 1030]));
    return board('belt', parts);
}

// --- board: fifty veins ----------------------------------------------------

function boardVeins() {
    const parts = [textPart('v_h', 'fifty quartz veins', {
        at: [540, 560], font: TYPE.heading, fill: 'ink', alpha: 1 })];
    for (let i = 0; i < 50; i++) {
        const col = i % 10;
        const row = (i - col) / 10;
        const x = 160 + col * 84;
        const y = 700 + row * 96;
        parts.push(pathPart(`v${i}`, `${M(x, y)} ${L(x + 30, y + 52)}`,
            { stroke: 'quartz', strokeWidth: 6, alpha: 0.8, z: 4 }));
    }
    parts.push(
        pathPart('v27b', `${M(160 + 7 * 84, 700 + 2 * 96)} ${L(160 + 7 * 84 + 30, 700 + 2 * 96 + 52)}`,
            { stroke: 'gold', strokeWidth: 12, z: 7, glow: { blur: 30, color: '#ffc64d' } }),
        textPart('v_one', 'one of them holds gold', {
            at: [540, 1240], font: TYPE.caption, fill: 'gold' }),
    );
    return board('veins', parts);
}

// --- the film --------------------------------------------------------------

export function partOne() {
    const boards = [boardCosmos(), boardEarth(), boardAbundance(), boardSection(),
                    boardBelt(), boardVeins()];
    const card = endCard('Next: the deposits gold lives in, and what a grade means.');
    boards.push(board('card', card.parts));

    const characters = { ...CHARACTERS };
    for (const b of boards) {
        // `_to` and friends were scratch space for the layout maths; a stray
        // key is a diagnostic, not an error, which is exactly how it would go
        // unnoticed.
        const parts = b.parts.map(({ _to, _ang, ...keep }) => keep);
        characters[b.name] = effect(parts, { palette: 'geo' });
    }

    const sec = sectionShots('xsec');
    const scenes = [
        {
            id: 'cosmos', palette: 'geo',
            background: { color: '#05080d',
                gradient: { kind: 'radial', from: [540, 900, 0, 1150],
                            stops: [[0, '#16233c'], [1, '#05080d']] } },
            transitionIn: { kind: 'fade', from: '#000000', duration: 1.0 },
            transitionOut: { kind: 'crossfade', duration: 0.7 },
            cast: [offstage(), castBoard('cos', { alpha: 1 })],
            shots: [
                { id: 'c1', duration: 5.4,
                  camera: { from: { x: 0, y: 0, zoom: 1.0 }, to: { x: 0, y: 0, zoom: 1.05 },
                            ease: 'smooth' },
                  dialogue: [vo(P1[0], 0.9)],
                  actions: [...build('cos', ['kicker', 'title'], 0.5, { gap: 0.35, span: 0.5 }),
                            ...reveal('cos', 'cap1', 2.0, { span: 0.5 })] },
                { id: 'c2', duration: 11.5,
                  camera: { to: { x: 0, y: 0, zoom: 1.12 }, ease: 'smooth' },
                  dialogue: [vo(P1[1], 0.4)],
                  actions: cosmosMerger('cos') },
            ],
        },
        {
            id: 'earth', palette: 'geo',
            background: { color: '#0d1420' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('erth'), castBoard('abun')],
            shots: [
                { id: 'e1', duration: 11.5,
                  camera: { from: { x: 0, y: 0, zoom: 1.0 }, to: { x: 0, y: 0, zoom: 1.04 },
                            ease: 'smooth' },
                  dialogue: [vo(P1[2], 0.4)],
                  actions: [{ target: 'erth', do: 'show', at: 0.1 }, ...earthSinks('erth')] },
                { id: 'e2', duration: 13.0,
                  dialogue: [vo(P1[3], 0.4)],
                  actions: [
                      { target: 'erth', do: 'hide', at: 0.2, for: 0.5 },
                      { target: 'abun', do: 'show', at: 0.7, for: 0.4 },
                      ...reveal('abun', 'ab_h', 0.9, { span: 0.4 }),
                      ...reveal('abun', 'ab_axis', 1.3, { span: 0.4 }),
                      ...build('abun', ['ab_c_t', 'ab_c_v'], 2.4, { gap: 0.12 }),
                      ...build('abun', ['ab_o_t', 'ab_o_v'], 5.0, { gap: 0.12 }),
                      ...build('abun', ['ab_span', 'ab_mult'], 6.6, { gap: 0.25, span: 0.4 }),
                      ...build('abun', ['ab_r_t', 'ab_r_v'], 8.6, { gap: 0.12 }),
                      ...reveal('abun', 'cap_a', 10.2, { span: 0.5 }),
                  ] },
            ],
        },
        {
            id: 'crust', palette: 'geo',
            background: { color: '#0d1420' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('xsec', { alpha: 1 })],
            shots: [
                { id: 's1', duration: 4.0,
                  camera: { from: { x: 0, y: 0, zoom: 1.0 }, to: { x: 0, y: 0, zoom: 1.03 },
                            ease: 'smooth' },
                  dialogue: [vo(P1[4], 0.5)], actions: sec.s1 },
                { id: 's2', duration: 17.5, dialogue: [vo(P1[5], 0.4)], actions: sec.s2 },
                { id: 's3', duration: 12.5, dialogue: [vo(P1[6], 0.4)], actions: sec.s3 },
                { id: 's4', duration: 9.5, dialogue: [vo(P1[7], 0.4)], actions: sec.s4 },
                { id: 's5', duration: 12.5, dialogue: [vo(P1[8], 0.4)], actions: sec.s5 },
                { id: 's6', duration: 11.5,
                  camera: { to: { x: 0, y: 0, zoom: 0.97 }, ease: 'smooth' },
                  dialogue: [vo(P1[9], 0.4)], actions: sec.s6 },
            ],
        },
        {
            id: 'belt', palette: 'geo',
            background: { color: '#0d1420' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('belt', { alpha: 1 })],
            shots: [
                { id: 'b1', duration: 12.5,
                  camera: { from: { x: 0, y: 0, zoom: 1.02 }, to: { x: 0, y: 0, zoom: 1.0 },
                            ease: 'smooth' },
                  dialogue: [vo(P1[10], 0.4)],
                  actions: [
                      ...reveal('belt', 'belt', 0.3, { span: 0.6 }),
                      ...build('belt', ['dome1', 'dome2'], 1.0, { gap: 0.2, span: 0.4 }),
                      ...build('belt', ['l_belt', 'l_belt_lead'], 1.8, { gap: 0.1 }),
                      ...reveal('belt', 'belt_age', 2.4, { span: 0.4 }),
                      ...build('belt', ['str1', 'str2', 'str3'], 4.2, { gap: 0.3, span: 0.45 }),
                      ...build('belt', ['l_str', 'l_str_lead'], 5.6, { gap: 0.1 }),
                      ...build('belt', ['dep0', 'dep1', 'dep2', 'dep3', 'dep4'], 7.4,
                               { gap: 0.22, span: 0.3, how: pop }),
                      ...reveal('belt', 'xring', 9.4, { span: 0.4 }),
                      ...build('belt', ['l_x', 'l_x_lead'], 9.9, { gap: 0.1 }),
                  ] },
            ],
        },
        {
            id: 'talk', palette: 'geo',
            background: { color: '#101a26' },
            transitionOut: { kind: 'crossfade', duration: 0.6 },
            cast: [
                // 1.5x: a 520-unit figure is 4% of a 1920-tall frame, which
                // reads as a speck on a phone. At 1.5 the head is ~6.6%, which
                // is also what the checker calls a wide two-shot.
                { character: 'zawadi', as: 'zawadi', at: [330, TALK_Y], scale: 1.5,
                  view: 'threeQuarter' },
                { character: 'juma', as: 'juma', at: [770, TALK_Y], scale: 1.5,
                  view: 'threeQuarter', facing: -1 },
                castBoard('veins', { alpha: 0, z: 40 }),
            ],
            shots: [
                { id: 't1', duration: 5.0, framing: 'wide', on: 'juma',
                  dialogue: [says('juma', P1[11], 0.5)],
                  actions: [
                      { target: 'zawadi', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'juma', do: 'pose', pose: 'stand', at: 0 },
                      { target: 'juma', do: 'pose', pose: 'ask', at: 0.3, for: 0.5 },
                      { target: 'zawadi', do: 'play', action: 'breathe' },
                      { target: 'juma', do: 'play', action: 'breathe' },
                      ...blinks('zawadi', 5.0, 11), ...blinks('juma', 5.0, 29),
                  ] },
                { id: 't2', duration: 6.0,
                  dialogue: [says('zawadi', P1[12], 0.4)],
                  actions: [
                      { target: 'juma', do: 'pose', pose: 'stand', at: 0.2, for: 0.5 },
                      { target: 'zawadi', do: 'pose', pose: 'present', at: 0.5, for: 0.6 },
                      { target: 'zawadi', do: 'play', action: 'breathe' },
                      { target: 'juma', do: 'play', action: 'breathe' },
                      // Cut away to the veins: they need the whole frame
                      // to read as fifty, and two figures were standing in it.
                      { target: 'zawadi', do: 'hide', at: 1.5, for: 0.35 },
                      { target: 'juma', do: 'hide', at: 1.5, for: 0.35 },
                      { target: 'veins', do: 'show', at: 1.8, for: 0.45 },
                      ...build('veins', ['v27b', 'v_one'], 3.6, { gap: 0.4, span: 0.4 }),
                      ...blinks('zawadi', 6.0, 13), ...blinks('juma', 6.0, 31),
                  ] },
                { id: 't3', duration: 8.0, framing: 'wide', on: 'zawadi',
                  dialogue: [vo(P1[13], 0.4)],
                  actions: [
                      { target: 'veins', do: 'hide', at: 0.2, for: 0.4 },
                      { target: 'zawadi', do: 'show', at: 0.5, for: 0.4 },
                      { target: 'juma', do: 'show', at: 0.5, for: 0.4 },
                      { target: 'zawadi', do: 'pose', pose: 'stand', at: 0.8, for: 0.6 },
                      { target: 'zawadi', do: 'play', action: 'breathe' },
                      { target: 'juma', do: 'play', action: 'breathe' },
                      ...blinks('zawadi', 8.0, 17), ...blinks('juma', 8.0, 37),
                  ] },
            ],
        },
        {
            id: 'card', palette: 'geo',
            background: { color: '#06090f' },
            transitionIn: { kind: 'crossfade', duration: 0.6 },
            cast: [offstage(), castBoard('card', { alpha: 1 })],
            shots: [
                { id: 'k1', duration: 9.0,
                  actions: card.actions('card', 0.4) },
            ],
        },
    ];

    return {
        version: 'jirex.film/1',
        meta: META('How gold forms'),
        voices: VOICES,
        palettes: { geo: GEO_PALETTE },
        characters,
        scenes,
    };
}
