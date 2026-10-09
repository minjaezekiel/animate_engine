import { headParts, CY, LIPS, DEFAULT_FACE, VIEWS } from '../art/face.js';
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
            // A mitten, not a capsule: a hand is wider than the wrist it hangs
            // off, and a capsule the same width as the forearm disappears.
            { id: `hand${side}`, parent: `fore${side}`, pivot: [s * armW * 0.1, foreArmH], z: armZ,
              shape: { kind: 'path',
                       d: `M${-armW * 0.32},${-armW * 0.3} `
                          + `Q${-armW * 0.62},${armW * 0.35} ${-armW * 0.44},${armW * 0.95} `
                          + `Q${-armW * 0.1},${armW * 1.35} ${armW * 0.34},${armW * 1.05} `
                          + `Q${armW * 0.66},${armW * 0.6} ${armW * 0.5},${-armW * 0.1} `
                          + `Q${armW * 0.2},${-armW * 0.42} ${-armW * 0.32},${-armW * 0.3} Z` },
              fill: tone(skin), stroke: `${skin}Line`, strokeWidth: line },

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

/** Walk, breathe, blink and idle cycles sized to the proportions. */
export function generateActions(proportions = {}, generate = {}) {
    const p = resolveProportions(proportions, generate.build);
    const bob = p.height * 0.016;
    return {
        breathe: {
            duration: 3.4, loop: 'repeat',
            // Volume-preserving: the chest widens as it shortens. A scale on
            // one axis alone reads as the character inflating.
            keys: {
                'torso.sy': [[0, 1], [1.7, 1.018], [3.4, 1]],
                'torso.sx': [[0, 1], [1.7, 0.994], [3.4, 1]],
            },
        },
        walk: {
            duration: 0.9, loop: 'repeat',
            keys: {
                'hips.y': [[0, 0], [0.225, -bob], [0.45, 0], [0.675, -bob], [0.9, 0]],
                'thighL.rot': [[0, 0.5], [0.45, -0.42], [0.9, 0.5]],
                'shinL.rot': [[0, 0.1], [0.3, 0.62], [0.62, 0.05], [0.9, 0.1]],
                'thighR.rot': [[0, -0.42], [0.45, 0.5], [0.9, -0.42]],
                'shinR.rot': [[0, 0.62], [0.32, 0.05], [0.72, 0.62], [0.9, 0.62]],
                'armL.rot': [[0, -0.42], [0.45, 0.42], [0.9, -0.42]],
                'armR.rot': [[0, 0.42], [0.45, -0.42], [0.9, 0.42]],
                // Forearms and hands trail the limb above them: follow-through
                // and overlapping action, which is what stops a walk reading
                // as a single rigid hinge.
                'foreL.rot': [[0, 0.3], [0.52, 0.46], [0.9, 0.3]],
                'foreR.rot': [[0, 0.46], [0.52, 0.3], [0.9, 0.46]],
                'handL.rot': [[0, 0.1], [0.58, 0.22], [0.9, 0.1]],
                'handR.rot': [[0, 0.22], [0.58, 0.1], [0.9, 0.22]],
                'torso.rot': [[0, 0.02], [0.45, -0.02], [0.9, 0.02]],
                'head.rot': [[0, -0.015], [0.5, 0.012], [0.9, -0.015]],
            },
        },
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
        idle: {
            duration: 5.6, loop: 'repeat',
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
