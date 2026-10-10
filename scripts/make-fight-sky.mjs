/**
 * Paint the sky for the fight, and the depth map that drives it.
 *
 *   node scripts/make-fight-sky.mjs
 *
 *   demo/assets/sky-plate.png   the painting
 *   demo/assets/sky-depth.png   two flat depth plateaus matching it
 *
 * The film feeds both to a `photos` entry, so the sky is not a flat rect
 * behind the fight but a deformable mesh: the cloud bank sits in front of
 * the sky and slides against it as the camera drifts across sixty seconds,
 * with the surface **torn** between the two so the bank moves as a bank
 * instead of smearing the sky with it.
 *
 * # What is painted here and what is not
 *
 * Brushes are for the soft half of a sky -- the vertical ramp, cloud mass,
 * rim light, haze, light shafts. They are the wrong tool for a flat
 * silhouette: a brush with `flow` below 1 in peak-accumulation mode cannot
 * exceed that flow within one stroke, so painting a "solid" mesa with
 * `marker` (flow 0.5) gives a half-transparent shape, and overlapping
 * passes to fix it band where they meet. Both happened on the first pass.
 *
 * So the mesas and the foreground ridge are **scenery path fills** in the
 * film instead, which are crisp, free, and already part of the format. See
 * `demo/fight.json`.
 *
 * # Why the depth map is painted flat
 *
 * `depthPlanes` finds levels to tear along by looking for **valleys** in
 * the depth histogram -- gaps with nothing in them. A smoothly graded depth
 * map has no valleys and is correctly refused. Two hard plateaus give one
 * unambiguous gap, which is what a painted backdrop actually is: discrete
 * matte planes, not a continuous field.
 */
import { createContext, run } from '../src/core/script/ops.js';

const W = 1280, H = 720;
const ctx = await createContext({});
const notes = [];

async function op(name, args) {
    const result = await run(ctx, name, args);
    if (result?.note) notes.push(`${name} ${args.layer ?? args.id ?? ''}: ${result.note}`);
    if (result?.dabs === 0) notes.push(`${name} ${args.layer}: drew nothing`);
    return result;
}

/**
 * The cloud bank, declared once so the painting and the depth map cannot
 * drift apart. Big-small-big across the frame: a cloud bank wants a rhythm,
 * and the gaps are where the light gets in.
 */
const CLOUDS = [
    { d: 'M -60 140 C 120 50, 300 80, 420 140 C 330 205, 120 220, -60 200 Z',
      rim: 'M 420 196 C 330 258, 120 272, -60 252', size: 150 },
    { d: 'M 360 88 C 520 18, 760 32, 900 102 C 760 178, 520 182, 360 152 Z',
      rim: 'M 900 158 C 760 232, 520 236, 360 208', size: 170 },
    { d: 'M 860 122 C 1000 48, 1220 62, 1340 132 C 1220 198, 1000 208, 860 182 Z',
      rim: 'M 1340 188 C 1220 252, 1000 262, 860 238', size: 150 },
    { d: 'M 150 262 C 340 206, 560 222, 700 268 C 520 320, 320 322, 150 300 Z',
      rim: 'M 700 316 C 520 368, 320 370, 150 348', size: 118 },
    { d: 'M 720 248 C 910 196, 1150 208, 1340 260 C 1150 316, 910 318, 720 292 Z',
      rim: 'M 1340 306 C 1150 362, 910 364, 720 338', size: 124 },
];

// =====================================================================
// the painting
// =====================================================================

await op('paint_create', { id: 'sky', width: W, height: H, layer: 'base' });
// One flood instead of six overlapping sweeps. Every pixel of a backdrop
// must be opaque, and a stroke-painted base cannot guarantee that.
await op('paint_fill', { doc: 'sky', layer: 'base', color: '#0f0820' });

// The ramp sits high in the frame on purpose. The horizon is the brightest
// band in the picture and the mesas stand *on* it, so if the glow is lower
// than the mesa tops the scenery covers the only bright thing in the shot
// -- which is exactly what the first composition did, and the contact sheet
// came back almost entirely black.
for (const [color, y, size] of [
    ['#1d1138', 150, 300], ['#361c52', 240, 220], ['#642c5f', 320, 170],
    ['#a33e52', 378, 120], ['#d4682f', 414, 86],
]) {
    await op('paint_stroke', {
        doc: 'sky', layer: 'base', brush: 'airbrush', color, size, opacity: 1,
        path: `M -120 ${y} C 320 ${y - 14}, 960 ${y + 14}, 1400 ${y}`,
    });
}
// The horizon line: tight and bright. The eye goes to the brightest edge in
// frame, and at dusk that edge is a few pixels tall, not a band.
await op('paint_stroke', {
    doc: 'sky', layer: 'base', brush: 'airbrush', color: '#ffc98a', size: 30, opacity: 0.95,
    path: 'M -120 448 C 320 442, 960 454, 1400 448',
});
// Ground haze below the horizon, so the lower third is not flat indigo
// behind the scenery that will stand in front of it.
// The valley floor between the far mesas and the near ridge. Warm rather
// than neutral, because it is lit by the same horizon the mesas stand on.
await op('paint_stroke', {
    doc: 'sky', layer: 'base', brush: 'airbrush', color: '#6b3148', size: 200, opacity: 1,
    path: 'M -120 560 C 320 552, 960 568, 1400 560',
});
await op('paint_stroke', {
    doc: 'sky', layer: 'base', brush: 'airbrush', color: '#3b1b2c', size: 150, opacity: 1,
    path: 'M -120 700 C 320 694, 960 706, 1400 700',
});

await op('paint_add_layer', { doc: 'sky', name: 'clouds', blend: 'multiply', opacity: 0.9 });
// Varied per cloud: one colour and one opacity across all five gives a
// single flat slab, which is what the bank looked like before. Depth in a
// cloud bank is value separation, not outline.
const BANK = [
    ['#241640', 0.62], ['#180d2a', 0.82], ['#2a1a46', 0.58],
    ['#140a24', 0.88], ['#211338', 0.7],
];
for (const [i, cloud] of CLOUDS.entries()) {
    const [color, opacity] = BANK[i % BANK.length];
    await op('paint_stroke', {
        doc: 'sky', layer: 'clouds', brush: 'watercolor', color,
        size: cloud.size, opacity, seed: 11 + i * 7, path: cloud.d,
    });
}

// Light under the bank, as a **pool** rather than a traced edge.
//
// Two earlier attempts drew the rim along each cloud's underside curve and
// both read as wires strung across the sky. The reason is that a long
// smooth curve of constant width is a *drawn line*, whatever blend mode it
// is in -- and light on a cloud base is none of those things. What it
// actually is: a broad glow, brightest nearest the sun, fading upward into
// the mass. So it is one wide soft pass under the whole bank, warm on the
// side the sun is on and cooler away from it, with the bank's own
// multiplied darkness shaping it from above.
await op('paint_add_layer', { doc: 'sky', name: 'rim', blend: 'add', opacity: 0.34 });
for (const [y, color, size, opacity] of [
    [372, '#ff5b96', 150, 0.55],
    [344, '#ff8a46', 110, 0.4],
    [318, '#c04a86', 90, 0.22],
]) {
    await op('paint_stroke', {
        doc: 'sky', layer: 'rim', brush: 'airbrush', color, size, opacity,
        path: `M -120 ${y + 16} C 380 ${y - 10}, 900 ${y + 10}, 1400 ${y - 14}`,
    });
}

// Three shafts, uneven, converging on one low sun. Evenly spaced shafts
// read as wallpaper.
await op('paint_add_layer', { doc: 'sky', name: 'shafts', blend: 'screen', opacity: 0.26 });
for (const [x0, x1, width] of [[300, 150, 80], [630, 560, 44], [980, 1110, 96]]) {
    await op('paint_stroke', {
        doc: 'sky', layer: 'shafts', brush: 'airbrush', color: '#ffd7a8',
        size: width, opacity: 0.55, path: `M ${x0} 200 L ${x1} 520`, pressure: [0.85, 0.1],
    });
}

const plate = await op('paint_render', { doc: 'sky', out: 'demo/assets/sky-plate.png' });

// =====================================================================
// the depth map: two flat plateaus, nothing between them
// =====================================================================

await op('paint_create', { id: 'depth', width: W, height: H, layer: 'far' });
await op('paint_fill', { doc: 'depth', layer: 'far', color: '#141414' });

await op('paint_add_layer', { doc: 'depth', name: 'bank' });
for (const cloud of CLOUDS) {
    // `pen` for the plateaus: hardness 1 and flow 1, so one stroke reaches
    // full coverage and overlapping strokes stay there. Peak accumulation
    // means they cannot build past it either, which is exactly what a flat
    // depth plane wants.
    await op('paint_stroke', {
        doc: 'depth', layer: 'bank', brush: 'pen', color: '#b4b4b4',
        size: cloud.size, opacity: 1, path: cloud.d,
    });
}

const depth = await op('paint_render', { doc: 'depth', out: 'demo/assets/sky-depth.png' });
await op('paint_dispose', { id: 'sky' });
await op('paint_dispose', { id: 'depth' });

// Report what the tear will actually do, before the film is rendered: a
// depth map with no valley is refused outright and parallax would be a
// uniform pan, which is a thing worth knowing now rather than on screen.
const { decodePNG } = await import('../src/io/png.js');
const { readFileSync } = await import('node:fs');
const { depthPlanes } = await import('../src/core/motion/depth.js');
const map = decodePNG(readFileSync('demo/assets/sky-depth.png'));
const planes = depthPlanes(map, 1);

console.log(`plate  inked ${(plate.inked ?? 0).toFixed(3)}  ${plate.out}`);
console.log(`depth  inked ${(depth.inked ?? 0).toFixed(3)}  ${depth.out}`);
console.log(`tear levels found: ${planes.length ? planes.map((v) => v.toFixed(3)).join(', ') : 'NONE -- the sky will not tear'}`);
if (notes.length) { console.log('\nnotes:'); for (const n of notes) console.log('  ' + n); }
