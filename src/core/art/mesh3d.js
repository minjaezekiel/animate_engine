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

/**
 * The mouth aperture: a window of triangles the skull does not have.
 *
 * Without one, teeth and a tongue are geometry sealed inside an opaque shell
 * -- which is what they were on the first pass, and the only way to find out
 * was to open the jaw in a render and see nothing happen. `y` is the height
 * band in head-local metres and `halfAngle` how far round the skull the
 * opening reaches from dead ahead.
 */
export const MOUTH_WINDOW = { y: [-0.042, -0.006], halfAngle: 0.46 };

export function buildHead(origin = [0, 0, 0], scale = 1, {
    radial = 24, mouth = MOUTH_WINDOW,
} = {}) {
    const positions = [], tParam = [], indices = [];
    const rows = [];
    for (const [y, w, d, zc] of HEAD_PROFILE) {
        const row = [];
        for (let i = 0; i < radial; i++) {
            const ang = (i / radial) * Math.PI * 2;
            row.push(positions.length / 3);
            positions.push(origin[0] + Math.sin(ang) * w * scale,
                           origin[1] + y * scale,
                           origin[2] + (zc + Math.cos(ang) * d) * scale);
            /**
             * How much of this vertex the JAW owns.
             *
             * By height alone, not by angle, so the jawline stays continuous
             * round the sides rather than hinging only at the front. The
             * previous rule gave a flat 0.35 to the lowest two rings and
             * nothing above them, which meant the chin followed the jaw and
             * the lower LIP did not -- so a jaw rotation lengthened the face
             * without opening the mouth.
             */
            tParam.push(y >= -0.012 ? 0 : Math.min(0.85, (-0.012 - y) / 0.045));
        }
        rows.push(row);
    }

    // Dead ahead is angle 0, so a column is in the mouth when its angle is
    // within `halfAngle` of 0 measured the short way round.
    const inMouth = (i, yLo, yHi) => {
        if (!mouth) return false;
        const ang = (i / radial) * Math.PI * 2;
        const off = Math.abs(ang > Math.PI ? ang - Math.PI * 2 : ang);
        return off < mouth.halfAngle && yLo >= mouth.y[0] && yHi <= mouth.y[1];
    };

    for (let s = 0; s < rows.length - 1; s++) {
        const a = rows[s], b = rows[s + 1];
        const yLo = HEAD_PROFILE[s][0], yHi = HEAD_PROFILE[s + 1][0];
        for (let i = 0; i < radial; i++) {
            const j = (i + 1) % radial;
            if (inMouth(i, yLo, yHi) && inMouth(j, yLo, yHi)) continue;
            indices.push(a[i], b[j], b[i], a[i], a[j], b[j]);
        }
    }
    return {
        positions: new Float32Array(positions),
        indices: new Uint32Array(indices),
        tParam: new Float32Array(tParam),
    };
}

/**
 * The hairline, as a function of the angle around the skull.
 *
 * `[degrees from the front, y in head-local metres]`, mirrored left to right.
 * Researched by looking at where a hairline actually is rather than by
 * guessing a sphere: it is HIGHEST at the temples, not at the centre of the
 * brow -- temple recession is why a male hairline reads as a widow's peak
 * even when there is no peak -- then drops steeply over the ear and runs down
 * to the nape at the back.
 *
 * This table is the whole reason the cap reads as hair. Previously hair was a
 * sphere centred on the head BONE, which sits at the base of the skull rather
 * than at its centre, so the figure rendered bald on top with a dark band
 * across the brow -- defect ten in §5 of the character doc.
 */
export const HAIRLINE = [
    [0, 0.080], [30, 0.087], [52, 0.094], [72, 0.064],
    [90, 0.038], [120, 0.008], [150, -0.004], [180, -0.013],
];

/** Interpolate the head profile's half-width, half-depth and z centre at a given y. */
function headAt(y) {
    const P = HEAD_PROFILE;
    if (y <= P[0][0]) return P[0].slice(1);
    const last = P[P.length - 1];
    if (y >= last[0]) return last.slice(1);
    for (let i = 1; i < P.length; i++) {
        if (y <= P[i][0]) {
            const u = (y - P[i - 1][0]) / (P[i][0] - P[i - 1][0] || 1);
            return [1, 2, 3].map((k) => P[i - 1][k] + (P[i][k] - P[i - 1][k]) * u);
        }
    }
    return last.slice(1);
}

/**
 * A hair cap: the skull's own profile, inflated, from the hairline up.
 *
 * Derived from the head rather than modelled beside it, which is the same
 * bargain the clothing makes in `humanoid3d.js` -- a shell that cannot float
 * off the head or sink into it, because its radius IS the skull's radius plus
 * a thickness.
 *
 * `strands` ripples that thickness around the skull. Hair with a constant
 * offset is a plastic swim cap at any colour; a few millimetres of periodic
 * variation, plus a slower one that does not divide into it, is what gives
 * the specular a direction to run along. Deterministic -- two cosines, not a
 * PRNG, for the same reason the camera shake is two sines.
 *
 * ponytail: a shell, not cards and not strands. It fixes "hair is a sphere";
 * it does not give long hair, a parting that opens, or anything that moves.
 * Hair cards when a shot needs hair to swing -- at which point they are a
 * cloth problem, and `core/sim/cloth.js` is the thing to hang them off.
 */
export function buildHairCap(origin = [0, 0, 0], scale = 1, {
    radial = 32, rings = 7, thickness = 0.007, strands = 9, ripple = 0.4,
    crown = 0.129, lift = 1,
} = {}) {
    const positions = [], tParam = [], indices = [];
    const rows = [];
    for (let r = 0; r <= rings; r++) {
        const t = r / rings;
        const row = [];
        for (let i = 0; i < radial; i++) {
            const ang = (i / radial) * Math.PI * 2;
            // Mirror the table: 0 at the front, 180 at the back, either way round.
            const deg = Math.abs(((ang * 180 / Math.PI) + 180) % 360 - 180);
            const base = sampleProfile(HAIRLINE, deg) * lift;
            const y = base + (crown - base) * t;
            const [w, d, zc] = headAt(y);
            // Thin out to nothing at the crown so the cap closes instead of
            // ending in a rim, and ripple around the skull for direction.
            const taper = 1 - t * t * 0.55;
            const strand = 1 + ripple * (Math.cos(ang * strands) * 0.6
                                       + Math.cos(ang * (strands + 4) + 1.1) * 0.4);
            const off = thickness * taper * strand;
            row.push(positions.length / 3);
            positions.push(origin[0] + Math.sin(ang) * (w + off) * scale,
                           origin[1] + y * scale,
                           origin[2] + (zc + Math.cos(ang) * (d + off)) * scale);
            tParam.push(t);
        }
        rows.push(row);
    }
    // Close the crown with a single apex vertex, so the top is a dome rather
    // than a flat lid with a hole in it.
    const apex = positions.length / 3;
    const [, , zcTop] = headAt(crown);
    positions.push(origin[0], origin[1] + (crown + 0.004) * scale, origin[2] + zcTop * scale);
    tParam.push(1);

    for (let s = 0; s < rows.length - 1; s++) {
        const a = rows[s], b = rows[s + 1];
        for (let i = 0; i < radial; i++) {
            const j = (i + 1) % radial;
            indices.push(a[i], b[j], b[i], a[i], a[j], b[j]);
        }
    }
    const top = rows[rows.length - 1];
    for (let i = 0; i < radial; i++) indices.push(top[i], top[(i + 1) % radial], apex);

    return {
        positions: new Float32Array(positions),
        indices: new Uint32Array(indices),
        tParam: new Float32Array(tParam),
    };
}
