/**
 * Hands: digits, their proportions, and the poses they take.
 *
 * Both paths stopped at the wrist. The 3D rig had one `fingers` leaf bone and
 * a flat slab for a hand; the 2D cutout had a single mitten path. Neither
 * could point, grip, count or gesture -- and a hand is the second thing an
 * audience looks at.
 *
 * This module is the half both paths share: WHICH digits exist, how long
 * their bones are relative to the hand, and what a named grip does to each
 * joint. The geometry is not shared, because the two paths do not agree on
 * what a hand is -- 3D sweeps a tube per phalanx in metres with +y up, 2D
 * draws a tapered cutout in scene units with +y down. Sharing the numbers and
 * not the drawing is what keeps `grip: 'fist'` meaning the same thing in both.
 *
 * Pure data and arithmetic. No THREE, no canvas, no clock.
 *
 * Proportions are measured from anthropometric hand data for an adult: a hand
 * is about 190 mm wrist to fingertip, roughly half palm and half finger, and
 * the middle finger is the longest by about 10% over the index. Getting that
 * split wrong is the single loudest "this is a mitten" signal, because a palm
 * as long as the fingers reads as a paddle.
 */

const DEG = Math.PI / 180;

/**
 * The five digits, as fractions of HAND LENGTH (wrist to middle fingertip).
 *
 * `at` is the knuckle, local to the wrist: `x` across the palm from the thumb
 * side, `y` down the hand, `z` through it. `bones` are the three phalanges.
 * Everything is a ratio, so one table serves a 1.8 m adult, a child and a 2D
 * cutout drawn in pixels.
 *
 * The thumb is not a short finger and must not be built as one: its
 * metacarpal is mobile and starts near the WRIST, which is why a thumb drawn
 * at the knuckle line can never oppose and why a hand with one looks wrong in
 * a way that is hard to name.
 */
export const DIGITS = [
    { id: 'thumb',  at: [-0.148, -0.120, -0.022], bones: [0.225, 0.170, 0.135],
      r: [0.062, 0.051, 0.043], splay: 30, lift: -40, curl: [12, 16, 12] },
    { id: 'index',  at: [-0.140, -0.430, 0.016], bones: [0.210, 0.126, 0.096],
      r: [0.050, 0.042, 0.035], splay: 5, curl: [12, 20, 12] },
    { id: 'middle', at: [-0.046, -0.450, 0.000], bones: [0.230, 0.142, 0.106],
      r: [0.052, 0.044, 0.036], splay: 0, curl: [14, 24, 13] },
    { id: 'ring',   at: [0.050, -0.437, -0.014], bones: [0.215, 0.131, 0.100],
      r: [0.049, 0.041, 0.034], splay: -6, curl: [16, 27, 14] },
    { id: 'pinky',  at: [0.146, -0.390, -0.030], bones: [0.168, 0.100, 0.084],
      r: [0.043, 0.036, 0.030], splay: -13, curl: [18, 30, 15] },
];

export const DIGIT_IDS = DIGITS.map((d) => d.id);

/** Wrist to middle fingertip, as a multiple of the palm (wrist to knuckle). */
export const HAND_LENGTH_OVER_PALM = 1 / 0.45;

/**
 * Named grips, in DEGREES of curl per joint, measured from the bind pose.
 *
 * The bind pose is already a relaxed hand -- `DIGITS[].curl` is baked into
 * the bone directions -- so `relaxed` is all zeros and costs no keys at all.
 * That is deliberate: a character who never mentions their hands still has
 * hands that look like hands, and the alternative is thirty keyframes per
 * film just to stop the fingers from reading as a rake.
 *
 * `splay` opens the digits at the knuckle; `lift` is the thumb's opposition,
 * which is the one axis a finger does not have and the one that makes a grip
 * read as holding something rather than as a closed hand near it.
 *
 * Researched rather than guessed: a full fist closes the MCP to about 90°,
 * the PIP to about 100° and the DIP to about 70°; a relaxed hand sits at
 * roughly a third of that, which is why an uncurled rig looks startled.
 */
const grip = (curl, splay = 0, lift = 0) => ({ curl, splay, lift });

export const HAND_POSES = {
    // The bind pose itself.
    relaxed: {
        thumb: grip([0, 0, 0]), index: grip([0, 0, 0]), middle: grip([0, 0, 0]),
        ring: grip([0, 0, 0]), pinky: grip([0, 0, 0]),
    },
    // Flat, as in a wave or a karate chop: the baked curl taken back out.
    open: {
        thumb: grip([-10, -14, -10], 6, -8), index: grip([-12, -20, -12]),
        middle: grip([-14, -24, -13]), ring: grip([-16, -27, -14]),
        pinky: grip([-18, -30, -15]),
    },
    spread: {
        thumb: grip([-10, -14, -10], 22, -16), index: grip([-12, -20, -12], 12),
        middle: grip([-14, -24, -13], 3), ring: grip([-16, -27, -14], -10),
        pinky: grip([-18, -30, -15], -20),
    },
    fist: {
        thumb: grip([18, 30, 26], -12, 26), index: grip([76, 78, 56], -3),
        middle: grip([74, 76, 55]), ring: grip([72, 73, 53], 3),
        pinky: grip([70, 70, 51], 6),
    },
    point: {
        thumb: grip([14, 24, 18], -8, 14), index: grip([-10, -18, -10], -2),
        middle: grip([76, 80, 56]), ring: grip([74, 78, 55]), pinky: grip([72, 74, 53]),
    },
    pinch: {
        thumb: grip([14, 20, 12], -16, 30), index: grip([34, 42, 26], -4),
        middle: grip([28, 44, 28], 2), ring: grip([44, 56, 34]), pinky: grip([52, 62, 38]),
    },
    // Holding something cylindrical -- a handle, a pointer, a mug.
    grasp: {
        thumb: grip([16, 22, 16], -14, 28), index: grip([52, 56, 32]),
        middle: grip([54, 58, 33]), ring: grip([56, 59, 34]), pinky: grip([58, 60, 35]),
    },
    thumbsUp: {
        thumb: grip([-12, -16, -12], 10, -20), index: grip([80, 84, 58]),
        middle: grip([78, 82, 57]), ring: grip([76, 80, 56]), pinky: grip([74, 78, 55]),
    },
};

export const HAND_POSE_NAMES = Object.keys(HAND_POSES);

/**
 * A pose's angles, in RADIANS, blended toward it by `amount`.
 *
 * `amount` is a real knob and not a convenience: a hand half way to a fist is
 * a hand about to close, and it is the difference between a gesture and a
 * switch. Returns `null` for an unknown name so the caller can warn with the
 * list rather than throwing.
 */
export function gripAngles(name, amount = 1) {
    const pose = HAND_POSES[name];
    if (!pose) return null;
    const k = Math.max(0, Math.min(1, amount));
    const out = {};
    for (const digit of DIGIT_IDS) {
        const g = pose[digit] ?? HAND_POSES.relaxed[digit];
        out[digit] = {
            curl: g.curl.map((v) => v * k * DEG),
            splay: (g.splay ?? 0) * k * DEG,
            lift: (g.lift ?? 0) * k * DEG,
        };
    }
    return out;
}

/**
 * The average finger curl of a pose, in radians -- what a hand rigged as one
 * mitt can express.
 *
 * A cutout hand two centimetres across cannot carry five separate fingers
 * without reading as a smear, so the 2D default rigs the four fingers as one
 * piece. Collapsing the pose rather than refusing it means `grip: 'fist'`
 * still does something on a mitten rig, and a film written for one detail
 * level still plays at the other.
 */
export function gripMitt(name, amount = 1) {
    const angles = gripAngles(name, amount);
    if (!angles) return null;
    const fingers = DIGIT_IDS.filter((d) => d !== 'thumb');
    const at = (joint) => fingers.reduce((s, d) => s + angles[d].curl[joint], 0) / fingers.length;
    return {
        // Two joints, because the mitt is drawn as two segments: the knuckle
        // fold and everything past it.
        knuckle: at(0),
        tip: (at(1) + at(2)) / 2,
        thumb: { curl: angles.thumb.curl, splay: angles.thumb.splay, lift: angles.thumb.lift },
    };
}

/**
 * The 3D bone table for one hand, in metres, local to the wrist bone.
 *
 * `handLength` is wrist to middle fingertip. The relaxed curl from `DIGITS`
 * is baked into the bone DIRECTIONS rather than written as keys, so the bind
 * pose is already a relaxed hand.
 *
 * Positive rotation about x curls a digit into the palm, which is why the
 * bake leans toward -z: the palm faces -z, so a closing grip is a positive
 * number on every joint and a film never has to remember a sign.
 */
/** Rotate `v` about a unit `axis` by `a` radians. Rodrigues, in five lines. */
function spin(v, axis, a) {
    const c = Math.cos(a), s = Math.sin(a);
    const d = axis[0] * v[0] + axis[1] * v[1] + axis[2] * v[2];
    const cx = [axis[1] * v[2] - axis[2] * v[1], axis[2] * v[0] - axis[0] * v[2],
                axis[0] * v[1] - axis[1] * v[0]];
    return [v[0] * c + cx[0] * s + axis[0] * d * (1 - c),
            v[1] * c + cx[1] * s + axis[1] * d * (1 - c),
            v[2] * c + cx[2] * s + axis[2] * d * (1 - c)];
}

export function handBones(side, handLength, { parent = `hand${side}` } = {}) {
    const s = side === 'L' ? 1 : -1;
    const bones = [];
    for (const d of DIGITS) {
        // The knuckle, mirrored across the palm for the right hand.
        bones.push({
            id: `${d.id}${side}1`, parent,
            at: [s * d.at[0] * handLength, d.at[1] * handLength, d.at[2] * handLength],
            digit: d.id, joint: 1,
        });

        /**
         * The rest direction, accumulated down the digit.
         *
         * Splay and lift aim the digit ONCE, at the knuckle; the three curls
         * then bend it about a single fixed axis, because a finger's three
         * joints really are parallel hinges. Applying splay only to the first
         * bone and letting the rest revert to straight-down -- which is what
         * the first version did -- put a visible kink in every thumb, since
         * the thumb is the one digit splayed far enough to notice.
         *
         * The bend axis is the HAND's x, not the digit's own, because that is
         * the axis `grip` writes `rotation.x` about: a bind pose baked in one
         * frame and posed in another is a hand that straightens sideways.
         */
        const axis = [1, 0, 0];
        let dir = spin(spin([0, -1, 0], [0, 0, 1], s * (d.splay ?? 0) * DEG),
                       [0, 1, 0], s * (d.lift ?? 0) * DEG);
        for (let j = 0; j < 3; j++) {
            dir = spin(dir, axis, (d.curl[j] ?? 0) * DEG);
            const len = d.bones[j] * handLength;
            bones.push({
                id: `${d.id}${side}${j + 2}`, parent: `${d.id}${side}${j + 1}`,
                at: [dir[0] * len, dir[1] * len, dir[2] * len],
                digit: d.id, joint: j + 2,
            });
        }
    }
    return bones;
}

/** The swept segments for one hand: three phalanges per digit. */
export function handSegments(side, handLength) {
    const segments = [];
    for (const d of DIGITS) {
        for (let j = 0; j < 3; j++) {
            segments.push({
                from: `${d.id}${side}${j + 1}`, to: `${d.id}${side}${j + 2}`,
                r0: d.r[j] * handLength, r1: d.r[j + 1] ? d.r[j + 1] * handLength
                                                        : d.r[j] * handLength * 0.78,
                group: 'hand',
                // A finger is flatter than it is wide and squarer than a limb;
                // the pad is the flat side.
                rx: 1, rz: 0.82,
                // Low counts deliberately: thirty phalanges per character at
                // limb resolution would cost more vertices than the body.
                radial: 10, rings: 2,
                profile: [[0, 0.96], [0.3, 1.0], [1, 0.9]],
                // Phalanges overlap. Three joints at 76 degrees pull
                // butt-jointed capsules apart into a row of sausages.
                extend: j === 2 ? 0.35 : 0.9,
                // A fingertip is round, and it is the one cap on this body
                // that is never buried inside the next segment.
                dome: j === 2 ? 1 : 0.8,
            });
        }
    }
    return segments;
}

/** Every bone id a grip writes, so a caller can clear or mask them. */
export function handBoneIds(side) {
    return DIGITS.flatMap((d) => [1, 2, 3].map((j) => `${d.id}${side}${j}`));
}
