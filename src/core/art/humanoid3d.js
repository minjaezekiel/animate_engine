import { VISEME_SHAPES } from './face3d.js';

/**
 * A procedurally built, skinned 3D humanoid.
 *
 * The engine could already animate a skinned mesh it was HANDED -- it binds,
 * retargets and plays Mixamo clips -- but it could not build one. That was
 * recorded as the open half of Phase 4: "SkinnedMesh construction from
 * scratch: not done". Which meant a 3D film needed an external rigged asset
 * before it could show a person, and the 2D path's procedural character had
 * no 3D counterpart.
 *
 * Everything here is data and arithmetic: bone offsets, the capsule segments
 * that make a body, and the weights that bind one to the other. It imports
 * nothing, so the whole rig is unit-testable in Node and the backend's only
 * job is to turn it into THREE objects.
 *
 * Proportions are in metres for a roughly 1.80 m adult, laid out in the
 * eight-head canon that figure drawing uses.
 */

/**
 * Bone offsets are LOCAL to the parent, which is Three's convention and the
 * only one that survives a rotation: a world-space table would have to be
 * recomputed every time an elbow bent.
 */
export const HUMANOID_BONES = [
    { id: 'hips', parent: null, at: [0, 0.98, 0] },
    { id: 'spine', parent: 'hips', at: [0, 0.14, 0] },
    { id: 'chest', parent: 'spine', at: [0, 0.17, 0] },
    { id: 'neck', parent: 'chest', at: [0, 0.17, 0] },
    { id: 'head', parent: 'neck', at: [0, 0.09, 0] },
    // Chin to crown is about 230 mm on an adult, and the head bone sits at
    // the base of the skull -- 170 mm here gave a 350 mm head.
    { id: 'headTop', parent: 'head', at: [0, 0.115, 0] },
    // The jaw is a real bone because lipsync drives it. A mouth that opens by
    // swapping a shape works in 2D; in 3D it has to hinge.
    { id: 'jaw', parent: 'head', at: [0, 0.015, 0.035] },
];

for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1;
    HUMANOID_BONES.push(
        { id: `shoulder${side}`, parent: 'chest', at: [s * 0.055, 0.14, 0] },
        { id: `arm${side}`, parent: `shoulder${side}`, at: [s * 0.125, -0.025, 0] },
        { id: `fore${side}`, parent: `arm${side}`, at: [0, -0.29, 0] },
        { id: `hand${side}`, parent: `fore${side}`, at: [0, -0.26, 0] },
        { id: `fingers${side}`, parent: `hand${side}`, at: [0, -0.09, 0] },
        { id: `thigh${side}`, parent: 'hips', at: [s * 0.085, -0.045, 0] },
        { id: `shin${side}`, parent: `thigh${side}`, at: [0, -0.44, 0] },
        { id: `foot${side}`, parent: `shin${side}`, at: [0, -0.43, 0] },
        { id: `toe${side}`, parent: `foot${side}`, at: [0, -0.045, 0.125] },
    );
}

/**
 * The body as tapered capsules between bones.
 *
 * `group` names the surface a segment belongs to, so clothing can be built
 * from the same table at a slightly larger radius rather than modelled twice.
 */
export const HUMANOID_SEGMENTS = [
    // `rx` is width, `rz` is depth, as a ratio of the radius. A human torso
    // is about two thirds as deep as it is wide and a head is DEEPER than it
    // is wide; circular cross-sections are the loudest "this is a tube"
    // signal a figure can give. `profile` scales the radius along the
    // segment, which is where a calf bulge and a deltoid come from -- a
    // straight taper between two radii reads as plumbing.
    { from: 'hips', to: 'spine', r0: 0.140, r1: 0.128, group: 'pelvis',
      rx: 1.0, rz: 0.78, profile: [[0, 1.0], [0.4, 1.02], [1, 0.95]] },
    { from: 'spine', to: 'chest', r0: 0.126, r1: 0.160, group: 'torso',
      rx: 1.0, rz: 0.70, profile: [[0, 0.94], [0.45, 0.98], [1, 1.0]] },
    { from: 'chest', to: 'neck', r0: 0.162, r1: 0.070, group: 'torso',
      rx: 1.0, rz: 0.68, profile: [[0, 1.0], [0.3, 0.95], [0.72, 0.62], [1, 0.52]] },
    { from: 'neck', to: 'head', r0: 0.055, r1: 0.066, group: 'neck',
      rx: 1.0, rz: 0.92, rings: 4 },
    { from: 'head', to: 'headTop', r0: 0.094, r1: 0.070, group: 'head' },
];

for (const side of ['L', 'R']) {
    HUMANOID_SEGMENTS.push(
        // The deltoid: thickest just below the shoulder, not at it.
        { from: `shoulder${side}`, to: `arm${side}`, r0: 0.080, r1: 0.062, group: 'torso',
          rx: 1.0, rz: 0.94, profile: [[0, 0.92], [0.55, 1.06], [1, 0.98]] },
        // Upper arm: biceps swell in the upper third, narrowing to the elbow.
        { from: `arm${side}`, to: `fore${side}`, r0: 0.058, r1: 0.044, group: 'arm',
          rx: 1.0, rz: 0.94, profile: [[0, 0.98], [0.3, 1.06], [1, 0.92]] },
        // Forearm: swells below the elbow, then narrows hard to the wrist.
        { from: `fore${side}`, to: `hand${side}`, r0: 0.047, r1: 0.030, group: 'arm',
          rx: 1.0, rz: 0.88, profile: [[0, 0.96], [0.25, 1.08], [0.8, 0.82], [1, 0.74]] },
        // A hand is a flat slab, not a sausage: depth is half its width.
        { from: `hand${side}`, to: `fingers${side}`, r0: 0.042, r1: 0.032, group: 'hand',
          rx: 1.0, rz: 0.48, profile: [[0, 0.88], [0.4, 1.0], [1, 0.9]] },
        { from: `thigh${side}`, to: `shin${side}`, r0: 0.098, r1: 0.062, group: 'leg',
          rx: 1.0, rz: 0.92, profile: [[0, 1.0], [0.25, 0.98], [1, 0.88]] },
        // The calf: a distinct bulge a third of the way down, then the ankle.
        { from: `shin${side}`, to: `foot${side}`, r0: 0.064, r1: 0.036, group: 'leg',
          rx: 1.0, rz: 0.90, profile: [[0, 0.94], [0.3, 1.08], [0.85, 0.62], [1, 0.58]] },
        { from: `foot${side}`, to: `toe${side}`, r0: 0.045, r1: 0.038, group: 'foot',
          rx: 1.0, rz: 0.72 },
    );
}

/**
 * Clothing is the same segments, inflated.
 *
 * A shirt is not a separate garment mesh with its own topology -- it is the
 * body's own surface pushed out two centimetres. That is both the laziest
 * route to a dressed figure and the one that cannot clip through the body,
 * because it is derived from it.
 */
export const OUTFITS = {
    suit: [
        { groups: ['torso'], inflate: 0.022, material: 'jacket' },
        { groups: ['arm'], inflate: 0.018, material: 'jacket', until: 1 },
        { groups: ['pelvis', 'leg'], inflate: 0.020, material: 'trouser' },
        { groups: ['foot'], inflate: 0.014, material: 'shoe' },
    ],
    shirt: [
        { groups: ['torso'], inflate: 0.016, material: 'shirt' },
        { groups: ['pelvis', 'leg'], inflate: 0.018, material: 'trouser' },
        { groups: ['foot'], inflate: 0.014, material: 'shoe' },
    ],
};

/** Resolve the local bone table into bind-pose world positions. */
export function bindPose(bones = HUMANOID_BONES) {
    const world = new Map();
    for (const b of bones) {
        const p = b.parent ? world.get(b.parent) : [0, 0, 0];
        world.set(b.id, [p[0] + b.at[0], p[1] + b.at[1], p[2] + b.at[2]]);
    }
    return world;
}

/**
 * The line segments weights are measured against -- one per bone that has a
 * child, plus a short stub for the leaves so a fingertip still binds to the
 * hand rather than to whatever happens to be nearest.
 */
export function boneSegments(bones = HUMANOID_BONES) {
    const world = bindPose(bones);
    const index = new Map(bones.map((b, i) => [b.id, i]));
    const children = new Map();
    for (const b of bones) {
        if (!b.parent) continue;
        if (!children.has(b.parent)) children.set(b.parent, []);
        children.get(b.parent).push(b.id);
    }
    return bones.map((b) => {
        const a = world.get(b.id);
        const kids = children.get(b.id) ?? [];
        if (!kids.length) {
            const parent = b.parent ? world.get(b.parent) : a;
            // Extend past the leaf along the direction it came from.
            const d = [a[0] - parent[0], a[1] - parent[1], a[2] - parent[2]];
            const len = Math.hypot(...d) || 1;
            const k = 0.05 / len;
            return { bone: index.get(b.id), a, b: [a[0] + d[0] * k, a[1] + d[1] * k, a[2] + d[2] * k] };
        }
        // Average the children, so a bone with two (the chest) runs up the
        // middle instead of leaning into one arm.
        const avg = [0, 0, 0];
        for (const id of kids) {
            const w = world.get(id);
            avg[0] += w[0] / kids.length; avg[1] += w[1] / kids.length; avg[2] += w[2] / kids.length;
        }
        return { bone: index.get(b.id), a, b: avg };
    });
}

/** Squared distance from a point to a line segment, and where along it it fell. */
export function distanceToSegment(p, a, b) {
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    const apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2];
    const len2 = abx * abx + aby * aby + abz * abz;
    const t = len2 > 0 ? Math.max(0, Math.min(1, (apx * abx + apy * aby + apz * abz) / len2)) : 0;
    const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
    return { d2: dx * dx + dy * dy + dz * dz, t };
}

/**
 * Automatic skin weights by distance to bone segments.
 *
 * Real rigs paint these, or solve a heat equation over the mesh surface. This
 * takes the nearest few bones and weights by inverse distance raised to a
 * power, which is the standard cheap approximation -- the `falloff` exponent
 * is what decides whether an elbow creases sharply or melts.
 *
 * `positions` is a flat Float32Array-shaped [x,y,z, x,y,z, ...] in BIND
 * space, the same space `boneSegments` returns.
 */
export function skinWeights(positions, segments, { maxInfluences = 4, falloff = 4 } = {}) {
    const count = positions.length / 3;
    const skinIndex = new Uint16Array(count * 4);
    const skinWeight = new Float32Array(count * 4);
    const scratch = [];

    for (let v = 0; v < count; v++) {
        const p = [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]];
        scratch.length = 0;
        for (const seg of segments) {
            const { d2 } = distanceToSegment(p, seg.a, seg.b);
            // A vertex exactly on a bone would divide by zero; the epsilon
            // also stops one bone taking a vertex outright and producing a
            // hard seam where two limbs meet.
            scratch.push({ bone: seg.bone, w: 1 / Math.pow(d2 + 1e-6, falloff / 2) });
        }
        scratch.sort((x, y) => y.w - x.w);
        const take = Math.min(maxInfluences, 4, scratch.length);
        let total = 0;
        for (let i = 0; i < take; i++) total += scratch[i].w;
        for (let i = 0; i < 4; i++) {
            if (i < take && total > 0) {
                skinIndex[v * 4 + i] = scratch[i].bone;
                skinWeight[v * 4 + i] = scratch[i].w / total;
            } else {
                skinIndex[v * 4 + i] = 0;
                skinWeight[v * 4 + i] = 0;
            }
        }
    }
    return { skinIndex, skinWeight };
}

/**
 * Viseme to jaw angle and mouth width.
 *
 * 2D swaps a mouth drawing per viseme. A 3D head has no drawings to swap, so
 * the same discrete track drives a hinge and a stretch instead: how far the
 * jaw drops, and how wide or rounded the lips go. The numbers matter more
 * than the mechanism -- a jaw that opens the same amount on every sound is
 * what makes CG dialogue read as a puppet.
 */
export const VISEME_JAW = {
    closed: { jaw: 0.00, width: 1.00, round: 0.00 },
    mid: { jaw: 0.10, width: 1.04, round: 0.05 },
    open: { jaw: 0.26, width: 1.02, round: 0.10 },
    round: { jaw: 0.13, width: 0.80, round: 0.55 },
    wide: { jaw: 0.09, width: 1.22, round: 0.00 },
    teeth: { jaw: 0.05, width: 1.10, round: 0.00 },
};

/** The whole rig as one spec, ready for a backend to instantiate. */
export function humanoidSpec({ outfit = 'suit', height = 1.80 } = {}) {
    const scale = height / 1.80;
    const bones = HUMANOID_BONES.map((b) => ({ ...b, at: b.at.map((v) => v * scale) }));
    const segments = HUMANOID_SEGMENTS.map((s) => ({
        ...s, r0: s.r0 * scale, r1: s.r1 * scale,
    }));
    return { bones, segments, outfit: OUTFITS[outfit] ?? OUTFITS.suit, scale };
}

/**
 * Drive a 3D face from the 2D pipeline's viseme track.
 *
 * The lipsync stack already solves the hard half -- phoneme timings from TTS
 * when they exist, text plus an amplitude envelope when they do not -- and
 * emits a discrete track naming one of six mouth shapes per frame. A 3D face
 * has no drawings to swap, so each shape is reached by BLENDING MUSCLES
 * instead: the same track, read through `VISEME_SHAPES`.
 *
 * Keys are written on `smooth` because a mouth that steps between positions
 * reads as a hand puppet; lips have mass and take a frame to arrive. And the
 * mouth is the only thing written here -- brows and cheeks belong to the
 * expression layer, which is how production rigs keep the two from fighting.
 */
export function applyLipsync(timeline, visemeTracks, key, { amount = 1 } = {}) {
    let written = 0;
    for (const track of visemeTracks ?? []) {
        const who = track.target;
        if (!who) continue;
        // Every shape this line will ever touch, so a viseme that does not
        // name a shape actively RELEASES it instead of leaving it stuck open.
        const used = new Set();
        for (const k of track.keys) {
            for (const name of Object.keys(VISEME_SHAPES[k.v] ?? {})) used.add(name);
        }
        for (const k of track.keys) {
            const shape = VISEME_SHAPES[k.v] ?? VISEME_SHAPES.closed;
            for (const name of used) {
                key(timeline, `${who}/face`, `morph.${name}`, k.t, (shape[name] ?? 0) * amount,
                    { type: 'number', ease: 'smooth' });
            }
            // The jaw BONE carries a share of the drop as well, so the chin
            // and the neck move with the mouth rather than the face sliding
            // over a rigid skull.
            key(timeline, `${who}/jaw`, 'rotation.x', k.t,
                (shape.jawOpen ?? 0) * 0.30 * amount, { type: 'number', ease: 'smooth' });
            written++;
        }
    }
    return written;
}

/**
 * Weights for one swept limb, bound only to the two bones it spans.
 *
 * `skinWeights` above searches every bone by distance, which is the textbook
 * approximation and is wrong on a human body for a structural reason: a hand
 * hangs beside a thigh. Measured on this rig, a vertex on the hip bound 99.8%
 * to the FOREARM and one on the outer thigh bound 91% to the FINGERS, because
 * those bones genuinely are the nearest in space. Distance knows nothing
 * about connectivity, and a body is not convex.
 *
 * Building the surface segment by segment means the answer is already known:
 * every vertex of the forearm belongs to the forearm and the hand and to
 * nothing else. It is kept beside the distance version rather than replacing
 * it, because the distance one is still the right tool for a mesh that did
 * not come from this generator.
 */
export function segmentSkin(positions, a, b, boneFrom, boneTo, { blend = 1 } = {}) {
    const count = positions.length / 3;
    const skinIndex = new Uint16Array(count * 4);
    const skinWeight = new Float32Array(count * 4);
    for (let v = 0; v < count; v++) {
        const { t } = distanceToSegment(
            [positions[v * 3], positions[v * 3 + 1], positions[v * 3 + 2]], a, b);
        // `blend` sharpens the crease: 1 is a straight linear blend along the
        // bone, higher keeps each half rigid longer and bends over a narrower
        // band, which is what an elbow actually does.
        const u = blend === 1 ? t
            : t < 0.5 ? 0.5 * Math.pow(2 * t, blend) : 1 - 0.5 * Math.pow(2 * (1 - t), blend);
        skinIndex[v * 4] = boneFrom;
        skinIndex[v * 4 + 1] = boneTo;
        skinWeight[v * 4] = 1 - u;
        skinWeight[v * 4 + 1] = u;
    }
    return { skinIndex, skinWeight };
}
