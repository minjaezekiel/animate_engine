/**
 * Swept surfaces: the geometry a body needs and a primitive cannot give it.
 *
 * A capsule between two bones makes a figure that reads as a balloon animal,
 * for two specific reasons, and both are fixable with arithmetic rather than
 * with a modelling tool:
 *
 *   1. Cross-sections are CIRCULAR. A human chest is about as wide as it is
 *      tall and two thirds as deep; a head is deeper than it is wide; a shin
 *      is a rounded triangle. Circular cross-sections are the single loudest
 *      "this is a tube" signal in a figure.
 *   2. Radius is LINEAR between the ends. A calf bulges a third of the way
 *      down and narrows to the ankle; a forearm swells below the elbow. A
 *      straight taper reads as plumbing.
 *
 * So a segment carries an elliptical ratio and a profile curve, and this
 * module sweeps rings along it. Everything returns plain arrays -- positions,
 * indices, and the along-axis parameter of every vertex -- which keeps it
 * testable in Node and hands the backend something it only has to wrap.
 *
 * Returning `t` per vertex is what makes skinning free: a vertex three
 * quarters of the way down the forearm capsule is, by construction, three
 * quarters weighted to the wrist.
 */

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
                         a[0] * b[1] - a[1] * b[0]];

/** Sample a profile [[t, scale], ...] with linear interpolation. */
export function sampleProfile(profile, t) {
    if (!profile || profile.length === 0) return 1;
    if (t <= profile[0][0]) return profile[0][1];
    const last = profile[profile.length - 1];
    if (t >= last[0]) return last[1];
    for (let i = 1; i < profile.length; i++) {
        const [t1, v1] = profile[i];
        if (t <= t1) {
            const [t0, v0] = profile[i - 1];
            const u = (t - t0) / (t1 - t0 || 1);
            return v0 + (v1 - v0) * u;
        }
    }
    return last[1];
}

/**
 * An orthonormal frame around a direction, stable for any axis.
 *
 * Crossing with whichever cardinal axis the direction is least aligned to is
 * what stops the frame degenerating -- a limb pointing straight down would
 * otherwise cross with +Y and produce a zero vector.
 */
export function frameFor(dir, up = null) {
    const f = norm(dir);
    const ref = up ?? (Math.abs(f[1]) < 0.9 ? [0, 1, 0] : [0, 0, 1]);
    const r = norm(cross(ref, f));
    return { f, r, u: cross(f, r) };
}

/**
 * Sweep an elliptical ring along a straight segment.
 *
 * `rx` runs along the frame's right vector and `rz` along its up vector, so a
 * limb's flattening follows the limb rather than the world -- a forearm stays
 * flat across its width however the arm is posed, because the flattening is
 * baked into the bind pose and then skinned like everything else.
 */
export function buildTube(a, b, {
    r0 = 0.1, r1 = 0.1, profile = null, rx = 1, rz = 1,
    radial = 16, rings = 8, capStart = true, capEnd = true, up = null,
} = {}) {
    const dir = sub(b, a);
    const { f, r, u } = frameFor(dir, up);
    const length = Math.hypot(...dir) || 1e-5;

    const positions = [], tParam = [], indices = [];
    // One extra ring at each end, pulled in to a near point, is what caps the
    // tube without a separate disc: a disc leaves a hard rim that catches the
    // key light and reads as a cut pipe.
    const ringCount = rings + 1;
    const rows = [];
    const emitRing = (t, scale, inset) => {
        const row = [];
        const radius = (r0 + (r1 - r0) * t) * sampleProfile(profile, t) * scale;
        const cx = a[0] + f[0] * length * t;
        const cy = a[1] + f[1] * length * t;
        const cz = a[2] + f[2] * length * t;
        for (let i = 0; i < radial; i++) {
            const ang = (i / radial) * Math.PI * 2;
            const ca = Math.cos(ang) * radius * rx * inset;
            const sa = Math.sin(ang) * radius * rz * inset;
            row.push(positions.length / 3);
            positions.push(cx + r[0] * ca + u[0] * sa,
                           cy + r[1] * ca + u[1] * sa,
                           cz + r[2] * ca + u[2] * sa);
            tParam.push(t);
        }
        rows.push(row);
        return row;
    };

    if (capStart) {
        // A dome rather than a flat lid: three rings easing in.
        for (const [t, inset] of [[0, 0.22], [0, 0.62], [0, 0.88]]) emitRing(t, 1, inset);
    }
    for (let i = 0; i < ringCount; i++) emitRing(i / rings, 1, 1);
    if (capEnd) {
        for (const [t, inset] of [[1, 0.88], [1, 0.62], [1, 0.22]]) emitRing(t, 1, inset);
    }

    for (let s = 0; s < rows.length - 1; s++) {
        const lo = rows[s], hi = rows[s + 1];
        for (let i = 0; i < radial; i++) {
            const j = (i + 1) % radial;
            // Wound counter-clockwise seen from OUTSIDE. The other order
            // builds a surface whose normals face inward, which Three then
            // backface-culls: the body looked solid only because what was
            // visible was the inside of its far wall, and the clothing over
            // it vanished entirely.
            indices.push(lo[i], hi[j], hi[i], lo[i], lo[j], hi[j]);
        }
    }
    return {
        positions: new Float32Array(positions),
        indices: new Uint32Array(indices),
        tParam: new Float32Array(tParam),
    };
}

/**
 * A head from a stack of shaped rings.
 *
 * A sphere is a skull only in the sense that both are round. This is the
 * profile a head actually has, read bottom to top: a narrow chin, the jaw
 * widening to its angle, cheekbones as the widest point of the face, a
 * braincase wider still and set BACK, and a crown that closes over. `z` leans
 * each ring forward or back, which is what gives a face a brow and a jaw
 * instead of a uniform egg.
 *
 * Each entry is [y, halfWidth, halfDepth, zCentre], in metres from the head
 * bone, which sits at the base of the skull.
 */
export const HEAD_PROFILE = [
    [-0.082, 0.030, 0.040, 0.020],
    [-0.068, 0.048, 0.058, 0.019],
    [-0.050, 0.064, 0.073, 0.014],
    [-0.030, 0.076, 0.084, 0.009],
    [-0.010, 0.084, 0.090, 0.005],
    [0.012, 0.089, 0.093, 0.002],
    [0.034, 0.091, 0.094, -0.001],
    [0.056, 0.092, 0.092, -0.005],
    [0.078, 0.090, 0.088, -0.010],
    [0.098, 0.082, 0.080, -0.015],
    [0.114, 0.066, 0.064, -0.019],
    [0.126, 0.042, 0.040, -0.022],
    [0.133, 0.016, 0.015, -0.024],
];

export function buildHead(origin = [0, 0, 0], scale = 1, { radial = 24 } = {}) {
    const positions = [], tParam = [], indices = [];
    const rows = [];
    const lo = HEAD_PROFILE[0][0], hi = HEAD_PROFILE[HEAD_PROFILE.length - 1][0];
    for (const [y, w, d, zc] of HEAD_PROFILE) {
        const row = [];
        const t = (y - lo) / (hi - lo);
        for (let i = 0; i < radial; i++) {
            const ang = (i / radial) * Math.PI * 2;
            row.push(positions.length / 3);
            positions.push(origin[0] + Math.sin(ang) * w * scale,
                           origin[1] + y * scale,
                           origin[2] + (zc + Math.cos(ang) * d) * scale);
            // The whole head belongs to the head bone; only the lowest rings
            // hand any weight to the jaw, and the mouth parts ride the jaw
            // directly, so `t` here is deliberately flat.
            tParam.push(t < 0.12 ? 0.35 : 0);
        }
        rows.push(row);
    }
    for (let s = 0; s < rows.length - 1; s++) {
        const a = rows[s], b = rows[s + 1];
        for (let i = 0; i < radial; i++) {
            const j = (i + 1) % radial;
            indices.push(a[i], b[j], b[i], a[i], a[j], b[j]);
        }
    }
    return {
        positions: new Float32Array(positions),
        indices: new Uint32Array(indices),
        tParam: new Float32Array(tParam),
    };
}
