/**
 * 2D inverse kinematics for the cutout rig.
 *
 * Why this exists: posing a cutout arm means choosing two rotations whose
 * composition happens to put the hand where you want it. Authors (and LLMs)
 * think in positions, not in rotations, so IK is the difference between
 * "hand at the lantern" and two numbers found by trial and error.
 *
 * Pure: no clock, no DOM, no scene. A bone is {length, rest, min?, max?} and
 * the target is a point in the CHAIN ROOT's pivot space, so the solver never
 * needs the scene graph or the timeline.
 *
 * Angle convention matches the rig: `rest` is the direction a bone's own
 * geometry points in its parent's frame (about +y/PI_2 for the generated
 * humanoid, whose limbs are drawn downward), and `rot` is the node's
 * Transform2D.rot, which also rotates every descendant. So a bone's world
 * direction is rest_i + sum(rot_0..rot_i).
 */

const TAU = Math.PI * 2;

/** Wrap to (-PI, PI] so a solved rotation never comes back as 7 radians. */
export function wrapAngle(a) {
    const r = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;
    return r === -Math.PI ? Math.PI : r;
}

const clampRot = (bone, rot) => {
    let r = wrapAngle(rot);
    if (bone.min != null) r = Math.max(bone.min, r);
    if (bone.max != null) r = Math.min(bone.max, r);
    return r;
};

/**
 * Joint positions for a chain, in the chain root's pivot space.
 * Returns bones.length + 1 points; the first is always [0, 0].
 */
export function forwardKinematics(bones, rots) {
    const joints = [[0, 0]];
    let acc = 0;
    let x = 0;
    let y = 0;
    for (let i = 0; i < bones.length; i++) {
        acc += rots[i] ?? 0;
        const dir = (bones[i].rest ?? Math.PI / 2) + acc;
        x += bones[i].length * Math.cos(dir);
        y += bones[i].length * Math.sin(dir);
        joints.push([x, y]);
    }
    return joints;
}

/**
 * Closed-form two-bone solve (law of cosines). Exact, branch-free and the
 * right tool for an arm or a leg -- which is every chain a cutout rig has.
 *
 * `bend` picks the elbow side: +1 and -1 are the two mirror solutions, and
 * which one reads as "natural" depends on the limb, so the caller chooses.
 */
export function solveTwoBone({ bones, target, bend = 1 }) {
    const [b0, b1] = bones;
    const l0 = b0.length;
    const l1 = b1.length;
    const rest0 = b0.rest ?? Math.PI / 2;
    const rest1 = b1.rest ?? Math.PI / 2;

    const raw = Math.hypot(target[0], target[1]);
    // Degenerate: a target exactly on the root has no defined direction.
    const base = raw < 1e-9 ? rest0 : Math.atan2(target[1], target[0]);
    // Clamp into the annulus the chain can actually reach. Outside it the
    // solve still returns the best pose (fully extended or fully folded)
    // rather than NaN, and reports that it fell short.
    const lo = Math.abs(l0 - l1);
    const hi = l0 + l1;
    const d = Math.min(hi, Math.max(lo, raw));

    const cosA = d < 1e-9 ? 1 : (l0 * l0 + d * d - l1 * l1) / (2 * l0 * d);
    const cosI = (l0 * l0 + l1 * l1 - d * d) / (2 * l0 * l1);
    const alpha = Math.acos(Math.min(1, Math.max(-1, cosA)));
    const interior = Math.acos(Math.min(1, Math.max(-1, cosI)));

    const dir0 = base + bend * alpha;
    const dir1 = dir0 - bend * (Math.PI - interior);

    const rot0 = clampRot(b0, dir0 - rest0);
    const rot1 = clampRot(b1, dir1 - rest1 - rot0);
    const rots = [rot0, rot1];
    const tip = forwardKinematics(bones, rots)[2];

    return {
        rots,
        error: Math.hypot(target[0] - tip[0], target[1] - tip[1]),
        tip,
        // `clamped` means the target was unreachable, not that the solve
        // failed: the limb is extended or folded as far as it goes.
        clamped: raw > hi + 1e-9 || raw < lo - 1e-9,
    };
}

/**
 * Cyclic coordinate descent for chains of any length, and the path taken
 * whenever rotation limits are present (the closed form cannot honour them).
 *
 * ponytail: CCD, not FABRIK or Jacobian. It converges in a handful of
 * iterations at cutout scale, honours per-bone limits for free, and is
 * twenty lines. Revisit only if a long chain visibly crawls.
 */
export function solveChain({ bones, target, bend = 1, iterations = 12, tolerance = 0.25 }) {
    if (bones.length === 0) return { rots: [], error: Math.hypot(...target), tip: [0, 0], clamped: true };
    if (bones.length === 1) {
        const rest = bones[0].rest ?? Math.PI / 2;
        const raw = Math.hypot(target[0], target[1]);
        const rots = [clampRot(bones[0], (raw < 1e-9 ? rest : Math.atan2(target[1], target[0])) - rest)];
        const tip = forwardKinematics(bones, rots)[1];
        return { rots, error: Math.hypot(target[0] - tip[0], target[1] - tip[1]), tip, clamped: Math.abs(raw - bones[0].length) > 1e-9 };
    }

    const limited = bones.some((b) => b.min != null || b.max != null);
    if (bones.length === 2 && !limited) return solveTwoBone({ bones, target, bend });

    // Seed from the closed form where we can: a good start keeps CCD from
    // settling into a folded-back pose that technically reaches.
    const rots = bones.length === 2
        ? solveTwoBone({ bones, target, bend }).rots.map((r, i) => clampRot(bones[i], r))
        : bones.map(() => 0);

    let joints = forwardKinematics(bones, rots);
    let error = Math.hypot(target[0] - joints[bones.length][0], target[1] - joints[bones.length][1]);

    for (let it = 0; it < iterations && error > tolerance; it++) {
        for (let i = bones.length - 1; i >= 0; i--) {
            const pivot = joints[i];
            const tip = joints[bones.length];
            const a = Math.atan2(tip[1] - pivot[1], tip[0] - pivot[0]);
            const b = Math.atan2(target[1] - pivot[1], target[0] - pivot[0]);
            rots[i] = clampRot(bones[i], rots[i] + wrapAngle(b - a));
            joints = forwardKinematics(bones, rots);
        }
        const tip = joints[bones.length];
        const next = Math.hypot(target[0] - tip[0], target[1] - tip[1]);
        // No progress means CCD is stuck against limits or the target is out
        // of range; another ten iterations will not help.
        if (error - next < 1e-6) { error = next; break; }
        error = next;
    }

    return { rots, error, tip: joints[bones.length], clamped: error > tolerance };
}

// ---------------------------------------------------------- rig extraction

/**
 * Derive a bone chain from a character's `parts` list.
 *
 * The cutout convention does the work for us: a child's `pivot` is expressed
 * in its parent's frame and sits at the parent's tip, so the child's pivot
 * IS the parent's bone vector -- length and rest direction both. That makes
 * this exact for generated characters and for any hand-authored character
 * that pivots its joints where the joints are.
 *
 * `tipId` is the part being placed (a hand or a foot). The chain is the
 * `count` bones above it, root-first.
 */
export function chainFromParts(parts, tipId, count = 2) {
    const byId = new Map(parts.map((p) => [p.id, p]));
    const lineage = [];
    for (let id = tipId; id != null && lineage.length <= count; ) {
        const part = byId.get(id);
        if (!part) break;
        lineage.unshift(part);
        id = part.parent;
    }
    // lineage is [chainRoot, ..., tip]; each non-root entry's pivot describes
    // the bone that ends at it.
    const chain = lineage.slice(-(count + 1));
    if (chain.length < 2) return null;

    const bones = [];
    for (let i = 1; i < chain.length; i++) {
        const pivot = chain[i].pivot ?? [0, 0];
        const length = Math.hypot(pivot[0], pivot[1]);
        if (length < 1e-9) return null;     // coincident joints: no bone here
        bones.push({
            id: chain[i - 1].id,
            length,
            rest: Math.atan2(pivot[1], pivot[0]),
        });
    }
    return { bones, rootId: chain[0].id, tipId: chain[chain.length - 1].id };
}

/**
 * Where a chain root's pivot sits in the character's own space (hips at the
 * origin), by walking pivots up the rest pose.
 *
 * ponytail: rest pose, not the animated pose. A reach solved while the torso
 * is leaning is off by the lean. Sample the live world matrix instead if
 * reaches ever need to survive a lean.
 */
export function chainRootOffset(parts, rootId) {
    const byId = new Map(parts.map((p) => [p.id, p]));
    let x = 0;
    let y = 0;
    for (let id = rootId; id != null; ) {
        const part = byId.get(id);
        if (!part) break;
        const pivot = part.pivot ?? [0, 0];
        x += pivot[0];
        y += pivot[1];
        id = part.parent;
    }
    return [x, y];
}
