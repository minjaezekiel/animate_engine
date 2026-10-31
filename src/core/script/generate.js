import { headParts, CY, LIPS, DEFAULT_FACE, VIEWS } from '../art/face.js';
import { DIGITS } from '../art/hands.js';
import { squashKeys } from '../anim/principles.js';

/**
 * Procedural cutout humanoid.
 *
 * The point: an author -- especially an LLM -- should be able to ASK for a
 * character rather than hand-author forty SVG paths. A handful of named
 * choices yields a complete, correctly-pivoted part tree whose joints already
 * work as a rig, in three views, with two tones and a line.
 *
 * Why limbs are filled shapes and not strokes. A stroked line has no
 * silhouette, no taper and no outline, and that one fact is most of why the
 * earlier output read as clip-art rather than as a drawing. A filled path
 * takes a `stroke` as well, which is the line work -- uniform weight, which
 * is what limited animation draws with anyway, and the only thing Canvas2D
 * can stroke.
 *
 * Pure and deterministic: same proportions in, same parts out.
 */

import { generateQuadrupedActions, generateQuadrupedParts } from './quadruped.js';

/**
 * A quadruped is its own rig, not a `build`. See 23-QUADRUPED.md: the biped
 * measures everything as a fraction of HEIGHT, which is the wrong unit for a
 * horizontal animal whose length and withers height vary independently.
 */
export const isQuadruped = (generate) => generate?.kind === 'quadruped';

/**
 * The part tree for a generated character of either species.
 *
 * Every caller that needs a rig goes through one of these two dispatchers
 * rather than deciding for itself, so adding a species does not mean finding
 * four call sites -- which is how `generateActions` ended up being called
 * with no `generate` argument in three places.
 */
export function generatedParts(generate = {}, proportions = {}) {
    return isQuadruped(generate)
        ? generateQuadrupedParts(generate, proportions)
        : generateCharacterParts(generate, proportions);
}

/** The free cycles for a generated character of either species. */
export function generatedCycles(char = {}) {
    return isQuadruped(char.generate)
        ? generateQuadrupedActions(char.proportions ?? {}, char.generate ?? {})
        : generateActions(char.proportions ?? {}, char.generate ?? {});
}

export const DEFAULT_PROPORTIONS = {
    height: 180,        // head-to-foot in scene units
    heads: 6.2,         // total height in head-heights, the unit animators use
    shoulderWidth: 0.235,
    hipWidth: 0.175,
    armThickness: 0.052,
    legThickness: 0.07,
    torsoTaper: 0.82,
};

/**
 * Builds in head-heights. A 6-head adult and a 4.5-head child differ by one
 * number and stay internally consistent, which is not true of independent
 * fractions of total height.
 */
export const BUILDS = {
    slim:     { shoulderWidth: 0.23, hipWidth: 0.17, armThickness: 0.046, legThickness: 0.060 },
    average:  { shoulderWidth: 0.26, hipWidth: 0.19, armThickness: 0.055, legThickness: 0.070 },
    heavy:    { shoulderWidth: 0.30, hipWidth: 0.25, armThickness: 0.072, legThickness: 0.090 },
    athletic: { shoulderWidth: 0.29, hipWidth: 0.18, armThickness: 0.062, legThickness: 0.078 },
    child:    { heads: 4.8, shoulderWidth: 0.22, hipWidth: 0.19, armThickness: 0.052, legThickness: 0.066 },
};

/** Resolve proportions from a build name plus explicit overrides. */
export function resolveProportions(proportions = {}, build) {
    const named = typeof build === 'string' ? (BUILDS[build] ?? {}) : (build ?? {});
    const p = { ...DEFAULT_PROPORTIONS, ...named, ...proportions };
    // `headRatio` is the older way to say the same thing; when it is given it
    // wins, so films authored before head-heights keep their proportions.
    p.headRatio = proportions.headRatio ?? named.headRatio ?? (1 / p.heads);
    return p;
}

/**
 * A tapered limb with rounded ends, as a closed fillable path running down
 * from its joint at the origin. `dx` drifts the far end sideways so an arm
 * hangs rather than dropping like a post.
 */
function limbPath(L, w0, w1, dx = 0) {
    const a = w0 / 2, b = w1 / 2;
    const r = (v) => Math.round(v * 100) / 100;
    // The top cap runs ABOVE the joint, not across it. A segment whose top
    // edge stops at y=0 butts against its parent and the outline draws a seam
    // at every elbow and knee -- which is what made the first full-body sheet
    // read as a paper doll. Overlapping by half a width hides the joint the
    // way a cutout rig is supposed to.
    return `M${r(-a)},0 `
        + `Q${r(-a * 1.08)},${r(L * 0.5)} ${r(dx - b)},${r(L)} `
        + `Q${r(dx)},${r(L + b * 0.9)} ${r(dx + b)},${r(L)} `
        + `Q${r(a * 1.08)},${r(L * 0.5)} ${r(a)},0 `
        + `Q${r(a * 0.92)},${r(-a * 0.9)} 0,${r(-a * 0.95)} `
        + `Q${r(-a * 0.92)},${r(-a * 0.9)} ${r(-a)},0 Z`;
}

/** The sliver of shadow along one edge of a limb. */
function limbShadePath(L, w0, w1, dx = 0, side = 1) {
    const a = (w0 / 2) * side, b = (w1 / 2) * side;
    const r = (v) => Math.round(v * 100) / 100;
    return `M${r(a)},0 `
        + `Q${r(a * 1.06)},${r(L * 0.5)} ${r(dx + b)},${r(L * 0.97)} `
        + `Q${r(dx + b * 0.3)},${r(L * 0.95)} ${r(a * 0.34)},${r(L * 0.45)} `
        + `Q${r(a * 0.42)},${r(L * 0.2)} ${r(a * 0.4)},0 Z`;
}

/**
 * The hand, as cutout parts.
 *
 * A single mitten path is what this rig had, and it is why a character could
 * never point, grip, wave or count: there was nothing below the wrist to
 * rotate. Three detail levels, because a hand drawn two centimetres across
 * cannot carry five separate fingers without reading as a smear, and a hand
 * filling the frame cannot get away with a mitten:
 *
 *   'none'    the old single mitten, for a film that wants it back
 *   'mitten'  palm, a two-segment thumb, and the four fingers as one
 *             two-segment mitt -- which is exactly how a Toon Boom or Moho
 *             cutout hand is built, and the default here for the same reason
 *   'fingers' palm, thumb and four separate two-segment digits
 *
 * All three are driven by the same `grip` poses, because `grip` writes onto
 * whichever parts exist. A film authored against one plays on the others.
 */
function handParts({ side, s, sgn, pivot, armW, z, skin, line, tone, detail }) {
    // `thumbL1`, matching the 3D rig's bone names exactly, so one pose table
    // and one `grip` verb address both paths.
    const id = (n, j = '') => `${n}${side}${j}`;
    // A hand is about a tenth of body height, and a little under half of it
    // is palm -- so the fingers are the LONGER half. Drawn the other way
    // round they read as teeth on the end of a paddle, which is what the
    // first pass looked like. The forearm here ends at `armW * 0.56` wide,
    // which is the wrist.
    const hand = armW * 2.1;
    const palmL = hand * 0.42;
    const digitL = hand - palmL;
    const wristW = armW * 0.56;
    const knuckW = armW * 0.82;
    const r = (v) => Math.round(v * 100) / 100;

    const palm = {
        id: id('hand'), parent: `fore${side}`, pivot, z,
        shape: { kind: 'path', d: limbPath(palmL, wristW, knuckW, 0) },
        fill: tone(skin), stroke: `${skin}Line`, strokeWidth: line,
    };
    if (detail === 'none') {
        // The original mitten, kept whole.
        return [{ ...palm, shape: { kind: 'path',
            d: `M${r(-armW * 0.32)},${r(-armW * 0.3)} `
               + `Q${r(-armW * 0.62)},${r(armW * 0.35)} ${r(-armW * 0.44)},${r(armW * 0.95)} `
               + `Q${r(-armW * 0.1)},${r(armW * 1.35)} ${r(armW * 0.34)},${r(armW * 1.05)} `
               + `Q${r(armW * 0.66)},${r(armW * 0.6)} ${r(armW * 0.5)},${r(-armW * 0.1)} `
               + `Q${r(armW * 0.2)},${r(-armW * 0.42)} ${r(-armW * 0.32)},${r(-armW * 0.3)} Z` } }];
    }

    // A digit is a fifth the width of a limb, and the limb's line weight on
    // it covers the fill entirely: five fingers at full line weight render as
    // a dark scribble where a hand should be. Limited animation does thin its
    // line on small forms for exactly this reason.
    const digitLine = Math.max(0.5, line * 0.58);
    const digit = (name, parent, at, len, w0, w1, dx, dz) => ({
        id: name, parent, pivot: at, z: z + dz,
        shape: { kind: 'path', d: limbPath(len, w0, w1, dx) },
        fill: tone(skin), stroke: `${skin}Line`, strokeWidth: digitLine,
    });

    // The thumb starts near the WRIST, not at the knuckles, and leans out
    // across the front of the hand. A thumb drawn level with the fingers can
    // only ever read as a short finger.
    const thumbL = digitL * 0.78;
    const thumbDrift = sgn * thumbL * 0.34;
    const out = [
        palm,
        digit(id('thumb', 1), id('hand'), [sgn * knuckW * 0.46, palmL * 0.24],
              thumbL * 0.56, knuckW * 0.46, knuckW * 0.38, thumbDrift, 0.5),
        digit(id('thumb', 2), id('thumb', 1), [thumbDrift, thumbL * 0.56],
              thumbL * 0.44, knuckW * 0.38, knuckW * 0.30, sgn * thumbL * 0.12, 0.5),
    ];

    if (detail !== 'fingers') {
        out.push(
            digit(id('mitt', 1), id('hand'), [0, palmL],
                  digitL * 0.56, knuckW * 0.94, knuckW * 0.84, 0, 0),
            digit(id('mitt', 2), id('mitt', 1), [0, digitL * 0.56],
                  digitL * 0.44, knuckW * 0.84, knuckW * 0.58, 0, 0),
        );
        return out;
    }

    // Four separate digits, laid out from the same proportion table the 3D
    // rig uses -- so `fist` closes the same hand on both paths.
    for (const [i, d] of DIGITS.filter((x) => x.id !== 'thumb').entries()) {
        // The thumb sits on the facing side, so the index is nearest it.
        const x = -sgn * d.at[0] * hand;
        // The knuckle line is an ARC, not a row: the middle finger's knuckle
        // sits furthest from the wrist and the little finger's nearest. In
        // the 3D table y runs up and negative is down the hand, so the sign
        // flips on the way into a cutout's y-down frame -- getting that
        // backwards set the short fingers LOWER than the long ones, which
        // reads as a hand with something wrong with it that is hard to name.
        const base = -(d.at[1] + 0.45) * hand;
        const len = (d.bones[0] + d.bones[1] + d.bones[2]) * hand;
        const w = d.r[0] * hand * 2;
        out.push(
            digit(id(d.id, 1), id('hand'), [x, palmL + base],
                  len * 0.52, w, w * 0.9, -sgn * d.splay * len * 0.004, 0.4 - i * 0.1),
            digit(id(d.id, 2), id(d.id, 1), [-sgn * d.splay * len * 0.004, len * 0.52],
                  len * 0.48, w * 0.9, w * 0.62, 0, 0.4 - i * 0.1),
        );
    }
    return out;
}

/**
 * Build a cutout rig: hips root, torso, head group and two of each limb with
 * forearm/shin children. Limb pivots sit at the joint, so a rotation reads as
 * a swing rather than a slide.
 */
export function generateCharacterParts(generate = {}, proportions = {}) {
    const p = resolveProportions(proportions, generate.build);
    const H = p.height;
    const headH = H * p.headRatio;
    const headR = headH / 2;
    const torsoH = H * 0.30;
    const legH = H * 0.46;
    const thighH = legH * 0.52;
    const shinH = legH - thighH;
    const armH = H * 0.38;
    const upperArmH = armH * 0.47;
    const foreArmH = armH - upperArmH;
    const shoulderW = H * p.shoulderWidth;
    const hipW = H * p.hipWidth;
    const armW = H * p.armThickness;
    const legW = H * p.legThickness;
    const line = Math.max(1.2, H * 0.008);

    const skin = generate.skin ?? 'skin';
    const cloth = generate.cloth ?? 'coat';
    const trouser = generate.trouser ?? cloth;
    // `hair` NAMES A STYLE; `hairColor` names a palette entry. Letting one key
    // mean both produced `fill: "afro-largeShade"`, which is not a colour, so
    // the canvas kept whatever fill the previous node left -- a hair mass that
    // rendered in skin tone with no error anywhere.
    const hair = generate.hair ?? 'short-fade';
    const hairColor = generate.hairColor ?? 'hair';
    const facing = generate.facing ?? 1;
    const sgn = facing >= 0 ? 1 : -1;

    const half = shoulderW / 2;
    const hipHalf = hipW / 2;
    const taperHalf = half * p.torsoTaper;

    const parts = [
        // hips is the root: everything hangs off it, so a single move or a bob
        // on hips carries the whole body.
        { id: 'hips', parent: null, z: 10,
          shape: { kind: 'ellipse', rx: hipHalf, ry: legW * 0.7 }, fill: trouser },

        { id: 'torso', parent: 'hips', pivot: [0, 0], z: 12,
          // The shoulder line slopes down to the arms and lifts toward the
          // neck. A flat lid across the top reads as a box with a head
          // balanced on it.
          shape: { kind: 'path',
                   d: `M${-hipHalf},0 Q${-hipHalf * 1.06},${-torsoH * 0.52} ${-taperHalf},${-torsoH * 0.88} `
                      + `Q${-taperHalf * 0.86},${-torsoH * 1.0} ${-taperHalf * 0.4},${-torsoH * 1.02} `
                      + `Q0,${-torsoH * 1.08} ${taperHalf * 0.4},${-torsoH * 1.02} `
                      + `Q${taperHalf * 0.86},${-torsoH * 1.0} ${taperHalf},${-torsoH * 0.88} `
                      + `Q${hipHalf * 1.06},${-torsoH * 0.52} ${hipHalf},0 Z` },
          fill: cloth, stroke: `${cloth}Line`, strokeWidth: line,
          shapes: [{ id: 'shade', z: 1, fill: `${cloth}Shade`,
                     shape: { kind: 'path',
                              d: `M${sgn * taperHalf},${-torsoH} `
                                 + `Q${sgn * hipHalf * 1.02},${-torsoH * 0.5} ${sgn * hipHalf},0 `
                                 + `L${sgn * hipHalf * 0.48},0 `
                                 + `Q${sgn * taperHalf * 0.5},${-torsoH * 0.55} ${sgn * taperHalf * 0.52},${-torsoH} Z` } }] },

        { id: 'neck', parent: 'torso', pivot: [0, -torsoH], z: 14,
          shape: { kind: 'rect', w: armW * 0.95, h: headR * 0.6, cx: true },
          fill: `${skin}Shade` },

        // `head` is a GROUP, not a shape. drawOrder walks depth-first, so a
        // child always draws over its parent and `z` only sorts siblings --
        // which means anything behind the skull (hair mass, far ear) has to be
        // the skull's sibling while still turning with the head.
        { id: 'head', parent: 'neck', pivot: [0, 0], z: 20 },
        ...headParts({ R: headR, face: generate.face, hair, facing,
                       colors: { skin, hair: hairColor, eye: generate.eye ?? 'eye',
                                 white: generate.white ?? 'white' } }),
    ];

    // Arms and legs, far side drawn behind the torso and near side in front.
    for (const side of ['L', 'R']) {
        const s = side === 'L' ? -1 : 1;
        const behind = s !== sgn;
        const armZ = behind ? 8 : 16;
        const legZ = behind ? 7 : 11;
        const tone = (base) => (behind ? `${base}Shade` : base);
        const drift = s * armW * 0.18;

        parts.push(
            { id: `arm${side}`, parent: 'torso', pivot: [s * taperHalf * 0.94, -torsoH * 0.9], z: armZ,
              shape: { kind: 'path', d: limbPath(upperArmH, armW, armW * 0.82, drift) },
              fill: tone(cloth), stroke: `${cloth}Line`, strokeWidth: line,
              shapes: behind ? [] : [{ id: 'shade', z: 1, fill: `${cloth}Shade`,
                  shape: { kind: 'path', d: limbShadePath(upperArmH, armW, armW * 0.82, drift, sgn) } }] },
            { id: `fore${side}`, parent: `arm${side}`, pivot: [drift, upperArmH], z: armZ,
              shape: { kind: 'path', d: limbPath(foreArmH, armW * 0.82, armW * 0.56, s * armW * 0.1) },
              fill: tone(skin), stroke: `${skin}Line`, strokeWidth: line },
            ...handParts({ side, s, sgn, pivot: [s * armW * 0.1, foreArmH], armW,
                           z: armZ, skin, line, tone,
                           detail: generate.hands ?? 'mitten' }),

            { id: `thigh${side}`, parent: 'hips', pivot: [s * hipHalf * 0.6, legW * 0.25], z: legZ,
              shape: { kind: 'path', d: limbPath(thighH, legW, legW * 0.84, s * legW * 0.08) },
              fill: tone(trouser), stroke: `${trouser}Line`, strokeWidth: line,
              shapes: behind ? [] : [{ id: 'shade', z: 1, fill: `${trouser}Shade`,
                  shape: { kind: 'path', d: limbShadePath(thighH, legW, legW * 0.84, s * legW * 0.08, sgn) } }] },
            { id: `shin${side}`, parent: `thigh${side}`, pivot: [s * legW * 0.08, thighH], z: legZ,
              shape: { kind: 'path', d: limbPath(shinH, legW * 0.84, legW * 0.5, 0) },
              fill: tone(trouser), stroke: `${trouser}Line`, strokeWidth: line },
            { id: `foot${side}`, parent: `shin${side}`, pivot: [0, shinH], z: legZ,
              shape: { kind: 'path',
                       d: `M${-legW * 0.34},0 L${legW * 0.34},0 `
                          + `Q${sgn * legW * 1.15},${legW * 0.1} ${sgn * legW * 1.2},${legW * 0.44} `
                          + `Q${sgn * legW * 1.1},${legW * 0.56} ${-sgn * legW * 0.38},${legW * 0.56} `
                          + `Q${-legW * 0.42},${legW * 0.3} ${-legW * 0.34},0 Z` },
              fill: tone(generate.shoe ?? 'shoe'),
              stroke: `${generate.shoe ?? 'shoe'}Line`, strokeWidth: line },
        );
    }

    return parts;
}

/** A matching mouth chart, positioned and sized on the generated head. */
export function generateMouth(proportions = {}, generate = {}) {
    const p = resolveProportions(proportions, generate.build);
    const headR = (p.height * p.headRatio) / 2;
    const face = { ...DEFAULT_FACE, ...(generate.face ?? {}) };
    const sgn = (generate.facing ?? 1) >= 0 ? 1 : -1;
    const w = headR * 0.30 * (LIPS[face.lips] ?? 1);
    const h = headR;
    // Turned heads carry the mouth toward the facing edge, the same way the
    // nose and eyes do; without this the mouth floats mid-cheek in profile.
    const views = { front: 0, threeQuarter: 0.55, profile: 1 };
    const shift = (dir) => sgn * headR * 0.62 * dir;
    const chart = (dir) => {
        const x = shift(dir);
        const k = 1 - 0.52 * dir;                       // foreshortened when turned
        const u = w * k;
        return {
            closed: { kind: 'path', d: `M${x - u},0 Q${x},${h * 0.05} ${x + u},0` },
            mid: { kind: 'path', d: `M${x - u},0 Q${x},${h * 0.17} ${x + u},0 Z` },
            open: { kind: 'path', d: `M${x - u},0 Q${x},${h * 0.4} ${x + u},0 Q${x},${h * 0.08} ${x - u},0 Z` },
            round: { kind: 'path', d: `M${x - u * 0.6},${-h * 0.04} Q${x},${h * 0.32} ${x + u * 0.6},${-h * 0.04} Q${x},${h * 0.02} ${x - u * 0.6},${-h * 0.04} Z` },
            wide: { kind: 'path', d: `M${x - u * 1.15},0 Q${x},${h * 0.15} ${x + u * 1.15},0 Q${x},${h * 0.02} ${x - u * 1.15},0 Z` },
            teeth: { kind: 'path', d: `M${x - u * 0.9},0 L${x + u * 0.9},0 L${x + u * 0.85},${h * 0.11} L${x - u * 0.85},${h * 0.11} Z` },
        };
    };
    // One chart per view, flattened into `viseme:view` members, because the
    // mouth is the one node where both channels must change the same `d` and
    // neither can be the empty override.
    const shapes = {};
    for (const [name, dir] of Object.entries(views)) {
        for (const [viseme, shape] of Object.entries(chart(dir))) {
            shapes[name === 'front' ? viseme : `${viseme}@${name}`] = shape;
        }
    }
    return {
        parent: 'head',
        pivot: [0, (CY + 0.52) * headR],
        strokeWidth: Math.max(1.2, headR * 0.055),
        stroke: 'skinLine',
        fill: 'mouth',
        shapes,
    };
}

/**
 * A two-step walk cycle on the standard key poses.
 *
 * **Contact -> down -> passing -> up -> contact**, twice. The old cycle had
 * the body's only vertical extreme at the passing position and nothing at all
 * at `down`, so the character floated: there was no weight being absorbed on
 * the foot that had just landed. Phases here are fractions of the cycle, which
 * is what lets `cadence` retime the whole thing by scaling one number.
 *
 * It also writes `footL`/`footR`, which the old cycle never touched at all --
 * the rig has had feet since the first generated character and the walk left
 * them rigid, so there was no heel strike, no roll and no toe-off.
 */
function walkCycle({ cycle, legLength, sway, anime }) {
    const t = (f) => +(f * cycle).toFixed(4);
    // Anime walks sit flatter and swing wider: less bounce, more shape.
    const B = anime ? 0.6 : 1;
    const A = anime ? 1.25 : 1;
    const C = CONTACT_ANGLE;

    /** Linear value of a looping channel at fraction `f`. */
    const sampleLoop = (keys, f) => {
        for (let i = 0; i < keys.length - 1; i++) {
            const [f0, v0] = keys[i];
            const [f1, v1] = keys[i + 1];
            if (f >= f0 && f <= f1) {
                return f1 === f0 ? v0 : v0 + ((f - f0) / (f1 - f0)) * (v1 - v0);
            }
        }
        return keys[keys.length - 1][1];
    };

    /**
     * The same channel for the other leg, half a cycle later.
     *
     * The endpoints are sampled rather than shifted: the key at f=1 is the
     * same key as f=0, so shifting the list naively produces two keys at 0.5
     * and none at 0, which leaves one leg holding its first pose until a
     * quarter of the way into the cycle.
     */
    const mirror = (keys) => {
        const edge = sampleLoop(keys, 0.5);
        const shifted = keys
            .filter(([f]) => f < 1)
            .map(([f, v]) => [+(((f + 0.5) % 1).toFixed(6)), v])
            .filter(([f]) => f > 0 && f < 1)
            .sort((a, b) => a[0] - b[0]);
        return [[0, edge], ...shifted, [1, edge]];
    };
    const at = (keys) => keys.map(([f, v]) => [t(f), v]);

    /**
     * **Sign convention, measured rather than assumed.** Canvas y grows
     * downward, so a positive rotation turns a limb clockwise on screen. A
     * character facing +x therefore swings a limb BACKWARD on a positive
     * angle, and a foot's toe points DOWN on one. Getting this backwards is
     * invisible in the numbers and obvious in a frame.
     *
     * Phase: the left leg is at the back of its stride at t=0 and contacts
     * the ground at t=0.5 -- which is the phase the original cycle used, and
     * is kept so a film that staged a character against it does not shift.
     */

    /**
     * **The rise is geometry, not taste.** With the legs splayed by the
     * contact angle the hips sit `legLength * (1 - cos C)` lower than they do
     * at the passing position, where one leg is straight underneath. Pick any
     * other number and the planted foot cannot reach the floor: the old cycle
     * used a flat 1.6% of height, which left a walking character hovering
     * above the ground with no test able to see it.
     *
     * Zero is the passing height, which is also the character's rest height,
     * so a cast member staged on the ground stays on it.
     */
    const drop = legLength * (1 - Math.cos(C));
    // The absorb is the only part that is a choice, so it is the only part
    // the anime variant flattens.
    const absorb = drop * 0.22 * B;
    const hipsY = [
        [0, drop], [0.125, drop + absorb], [0.25, 0], [0.375, -absorb * 0.5],
        [0.5, drop], [0.625, drop + absorb], [0.75, 0], [0.875, -absorb * 0.5],
        [1, drop],
    ];
    // The pelvis shifts over whichever foot is carrying the weight.
    const hipsX = [[0, 0], [0.25, sway], [0.5, 0], [0.75, -sway], [1, 0]];
    // ...and tilts down toward the leg that is swinging through.
    const hipsRot = [[0, 0.03], [0.25, 0], [0.5, -0.03], [0.75, 0], [1, 0.03]];

    // Thigh: fully back at 0, vertical at passing, fully forward at contact.
    const thighL = [[0, C], [0.25, 0.08], [0.5, -C], [0.75, -0.05], [1, C]];
    /**
     * Knee. At t=0 the leg is at the back of its stride, which is the
     * EXTENDED push-off position -- a knee bent there lifts the trailing foot
     * off the ground and the character limps. It flexes immediately after, to
     * clear the ground through swing, and is straight again at contact.
     */
    const shinL = [[0, 0.12], [0.125, 0.62], [0.25, 0.45], [0.375, 0.15],
                   [0.5, 0.05], [0.625, 0.20], [0.75, 0.06], [0.875, 0.08],
                   [1, 0.12]];
    // Foot: toe down at toe-off, levelling through swing, toe UP at heel
    // strike, flat through stance, hardest plantarflexion at push-off.
    // Negative is toe-up. The old cycle wrote nothing here at all.
    const footL = [[0, 0.34], [0.125, 0.10], [0.25, -0.02], [0.375, -0.16],
                   [0.5, -0.26], [0.625, 0.0], [0.75, 0.05], [0.875, 0.42],
                   [1, 0.34]];

    // Arms swing opposite the legs: the left arm is FORWARD while the left
    // leg is back. Forward is negative. A walking arm swings about 15 degrees
    // at the shoulder -- wider than that and it reads as a march.
    const armL = [[0, -0.26 * A], [0.5, 0.26 * A], [1, -0.26 * A]];
    // The elbow bends on the way FORWARD and comes back nearly straight,
    // which is how an arm swings. It also lags the shoulder, so the bend
    // peaks a little after the swing does.
    const foreL = [[0, -0.13], [0.08, -0.16], [0.56, -0.02], [1, -0.13]];
    const handL = [[0, -0.06], [0.62, 0.03], [1, -0.06]];

    return {
        duration: cycle, loop: 'repeat',
        keys: {
            'hips.y': at(hipsY),
            'hips.x': at(hipsX),
            'hips.rot': at(hipsRot),
            'thighL.rot': at(thighL), 'thighR.rot': at(mirror(thighL)),
            'shinL.rot': at(shinL), 'shinR.rot': at(mirror(shinL)),
            'footL.rot': at(footL), 'footR.rot': at(mirror(footL)),
            // Arms swing opposite the legs, widest at contact.
            'armL.rot': at(armL), 'armR.rot': at(mirror(armL)),
            // Forearms and hands trail the limb above them: follow-through
            // and overlapping action, which is what stops a walk reading
            // as a single rigid hinge.
            'foreL.rot': at(foreL), 'foreR.rot': at(mirror(foreL)),
            'handL.rot': at(handL), 'handR.rot': at(mirror(handL)),
            // Shoulders counter-rotate against the hips.
            'torso.rot': at([[0, -0.03], [0.5, 0.03], [1, -0.03]]),
            // The head lags the body and stays level on purpose.
            'head.rot': at([[0, 0.018], [0.55, -0.015], [1, 0.018]]),
        },
    };
}

/**
 * Seconds per two-step cycle. The standard animation table, in seconds rather
 * than frames so it does not assume 24 fps: brisk is 9 frames per step at 24,
 * natural 12, casual 15, weary 19.
 */
export const CADENCES = {
    brisk: 0.75,
    natural: 1.0,
    casual: 1.25,
    weary: 1.6,
    // What every film in this repo was authored against, so it stays the
    // default and no existing timing moves.
    default: 0.9,
};

/**
 * How far the character travels in one two-step cycle, in character units.
 *
 * `walk` and `move` are independent -- one plays a cycle, the other keys the
 * root's position -- and nothing ties them together, so every film in this
 * repo slides its feet. This is the number that closes that: travel this far
 * per cycle and the planted foot stays put.
 *
 * Derived, not guessed: the foot is `legLength * sin(contactAngle)` ahead of
 * the hip at contact, so a step spans twice that, and a cycle is two steps.
 * The knee is never quite straight at contact, which the 0.92 accounts for.
 */
export function walkStride(proportions = {}, generate = {}) {
    const p = resolveProportions(proportions, generate.build);
    const legLength = p.height * 0.46;
    return 4 * legLength * Math.sin(CONTACT_ANGLE) * 0.92;
}

/** Thigh angle from vertical at contact. Sets both the pose and the stride. */
const CONTACT_ANGLE = 0.45;

/** Walk, breathe, blink and idle cycles sized to the proportions. */
export function generateActions(proportions = {}, generate = {}) {
    const p = resolveProportions(proportions, generate.build);
    const bob = p.height * 0.016;
    const walkOpts = generate.walk ?? {};
    const cycle = Number(walkOpts.cadence) > 0 ? Number(walkOpts.cadence)
        : (CADENCES[walkOpts.cadence] ?? CADENCES.default);
    const anime = walkOpts.style === 'anime';
    return {
        breathe: {
            duration: 3.4, loop: 'repeat', blend: 'add',
            // Volume-preserving: the chest widens as it shortens. A scale on
            // one axis alone reads as the character inflating.
            keys: {
                'torso.sy': [[0, 1], [1.7, 1.018], [3.4, 1]],
                'torso.sx': [[0, 1], [1.7, 0.994], [3.4, 1]],
            },
        },
        walk: walkCycle({ cycle, legLength: p.height * 0.46,
                          sway: p.height * 0.006, anime }),
        blink: {
            duration: 4.2, loop: 'repeat',
            // A discrete swap, not a scale. Squashing an eye node whose
            // geometry carries its own position would pull both eyes toward
            // the head's origin instead of closing them.
            keys: {
                'eyes.props.eyes': [[0, 'open'], [3.9, 'closed'], [4.04, 'open']],
            },
        },
        // A landing. Volume-preserving, so the character compresses rather
        // than deflating, and it recovers faster than it compresses -- the
        // asymmetry is what makes an impact read as an impact.
        squash: (() => {
            const k = squashKeys(0.5, 0.16);
            return {
                duration: 0.5, loop: 'once',
                keys: {
                    'hips.sy': k.sy, 'hips.sx': k.sx,
                    'hips.y': [[0, 0], [0.2, bob * 0.6], [0.5, 0]],
                    'torso.sy': k.sy.map(([t, v]) => [t, 1 + (v - 1) * 0.5]),
                    'head.y': [[0, 0], [0.2, bob * 0.3], [0.5, 0]],
                },
            };
        })(),
        // Additive, like `breathe`: an idle is a drift ON TOP of whatever the
        // character is doing, not a replacement for it. Authored as absolute
        // numbers and converted to deltas against its own rest pose, so the
        // cycle reads the same whether it layers over a guard or a standing
        // pose.
        idle: {
            duration: 5.6, loop: 'repeat', blend: 'add',
            keys: {
                'torso.rot': [[0, 0.008], [2.8, -0.008], [5.6, 0.008]],
                'head.rot': [[0, -0.012], [2.1, 0.015], [4.2, -0.008], [5.6, -0.012]],
                'armL.rot': [[0, 0.06], [2.8, 0.1], [5.6, 0.06]],
                'armR.rot': [[0, -0.06], [2.8, -0.1], [5.6, -0.06]],
                'foreL.rot': [[0, 0.08], [3.1, 0.14], [5.6, 0.08]],
                'foreR.rot': [[0, -0.08], [3.1, -0.14], [5.6, -0.08]],
            },
        },
    };
}

export { VIEWS };
