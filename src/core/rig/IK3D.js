/**
 * Two-bone inverse kinematics in 3D.
 *
 * Why this exists: [14-CHARACTER-3D.md](../../../docs/14-CHARACTER-3D.md) §6
 * recorded "**IK** -- gestures are forward-kinematic angles. There is no 'put
 * the hand on the screen'; the pose that looks like pointing was found by
 * typing degrees." The 2D cutout rig has had a real solver since Phase 8
 * ([IK2D.js](IK2D.js)); the 3D character pipeline had nothing.
 *
 * This is the 3D half, and it is deliberately the *closed form* only. An arm
 * and a leg are two-bone chains, which is every chain the generated humanoid
 * has: hips->thigh->shin->foot is a two-bone solve with the foot along for
 * the ride, and so is shoulder->arm->fore->hand. The 2D side needed CCD as
 * well because a cutout can have a tail of six segments; the 3D side does not
 * yet, so it does not have one.
 *
 * Pure: no THREE, no scene, no clock. Everything is plain [x, y, z] arrays in
 * ONE space -- whichever space the caller measured the root and the target
 * in. The caller turns the returned joint POSITIONS into bone rotations,
 * because only the caller knows the bind pose.
 */

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
                         a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * Where the middle joint and the tip land, by the law of cosines.
 *
 * `pole` is a hint, not a position: the joint bends toward the component of
 * `pole` that is PERPENDICULAR to the chain. That is what makes an elbow
 * point backwards and a knee forwards without the author having to compute a
 * plane -- and it is why the hint can be a constant like [0, 0, -1] and still
 * be right as the shoulder turns, as long as the caller rotates it into the
 * same space as the root.
 *
 * Out of range the chain is extended (or folded) as far as it goes and
 * `reached` is false, rather than returning NaN from `acos` -- the same
 * contract `solveTwoBone` in IK2D keeps.
 */
export function solveTwoBone3D({ root, target, l0, l1, pole = [0, 0, 1] }) {
    const toTarget = sub(target, root);
    const raw = len(toTarget);
    // A hair inside the limits, not exactly on them: at full extension the
    // two bones are colinear and the bend plane stops existing, so a chain
    // asked for a dead-straight reach would flicker between elbow-in and
    // elbow-out as the target crosses the boundary frame by frame.
    const EPS = 1e-4;
    const lo = Math.abs(l0 - l1) + EPS;
    const hi = l0 + l1 - EPS;
    const d = clamp(raw, lo, hi);
    // A target exactly on the root has no direction; aim down, which is the
    // rest direction of every limb on this rig.
    const dir = raw < 1e-9 ? [0, -1, 0] : mul(toTarget, 1 / raw);

    let perp = sub(pole, mul(dir, dot(pole, dir)));
    if (len(perp) < 1e-6) {
        // The hint is parallel to the chain and says nothing about the plane.
        // Cross with whichever cardinal axis the chain is least aligned to,
        // which is the same degeneracy guard `frameFor` in mesh3d.js uses.
        perp = cross(dir, Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1]);
    }
    perp = norm(perp);

    const a = Math.acos(clamp((l0 * l0 + d * d - l1 * l1) / (2 * l0 * d), -1, 1));
    const mid = add(root, mul(add(mul(dir, Math.cos(a)), mul(perp, Math.sin(a))), l0));
    // The reachable point on the line to the target, which the tip lands on
    // exactly whenever the target was in range.
    const seat = add(root, mul(dir, d));
    const tip = add(mid, mul(norm(sub(seat, mid)), l1));

    return { mid, tip, reached: raw <= hi && raw >= lo, error: len(sub(tip, target)) };
}

/**
 * The two bone lengths of a chain, from a local bone-offset table.
 *
 * A bone's length is the distance to its child, because that is what a local
 * offset means -- the same identity `chainFromParts` exploits in 2D, where a
 * child's pivot IS the parent's bone vector.
 */
export function chainLengths(bones, rootId) {
    const childOf = (id) => bones.find((b) => b.parent === id);
    const mid = childOf(rootId);
    const end = mid && childOf(mid.id);
    if (!mid || !end) return null;
    return {
        l0: len(mid.at), l1: len(end.at),
        midId: mid.id, endId: end.id,
        // The bind direction each bone points in its OWN local space, which
        // is what a rotation has to be measured against.
        dir0: norm(mid.at), dir1: norm(end.at),
    };
}
