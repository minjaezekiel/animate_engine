/**
 * Procedural cutout humanoid.
 *
 * The point: an author -- especially an LLM -- should be able to ASK for a
 * character rather than hand-author forty SVG paths. A handful of
 * proportions yields a complete, correctly-pivoted part tree whose joints
 * already work as a rig.
 *
 * Pure and deterministic: same proportions in, same parts out.
 */

export const DEFAULT_PROPORTIONS = {
    height: 180,        // head-to-foot in scene units
    headRatio: 0.145,   // head height as a fraction of total
    shoulderWidth: 0.26,
    hipWidth: 0.19,
    armThickness: 0.05,
    legThickness: 0.062,
    torsoTaper: 0.82,
};

/**
 * Build a side-on-capable cutout rig: hips root, torso, head, two arms and
 * two legs with forearm/shin children. Limb pivots sit at the joint, so a
 * rotation reads as a swing rather than a slide.
 */
export function generateCharacterParts(generate = {}, proportions = {}) {
    const p = { ...DEFAULT_PROPORTIONS, ...proportions };
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

    const skin = generate.skin ?? 'skin';
    const cloth = generate.cloth ?? 'coat';
    const trouser = generate.trouser ?? cloth;
    const hair = generate.hair ?? 'hair';

    const half = shoulderW / 2;
    const hipHalf = hipW / 2;
    const taperHalf = half * p.torsoTaper;

    const parts = [
        // hips is the root: everything hangs off it, so a single move or a
        // bob on hips carries the whole body.
        { id: 'hips', parent: null, z: 10,
          shape: { kind: 'ellipse', rx: hipHalf, ry: legW * 0.7 }, fill: trouser },

        { id: 'torso', parent: 'hips', pivot: [0, 0], z: 12,
          shape: { kind: 'path',
                   d: `M${-hipHalf},0 L${hipHalf},0 L${taperHalf},${-torsoH} L${-taperHalf},${-torsoH} Z` },
          fill: cloth },

        { id: 'neck', parent: 'torso', pivot: [0, -torsoH], z: 14,
          shape: { kind: 'rect', w: armW * 0.9, h: headR * 0.5, cx: true }, fill: skin },

        { id: 'head', parent: 'neck', pivot: [0, 0], z: 20,
          shape: { kind: 'ellipse', rx: headR * 0.86, ry: headR }, fill: skin },

        { id: 'hair', parent: 'head', pivot: [0, 0], z: 21,
          shape: { kind: 'path',
                   d: `M${-headR * 0.9},${-headR * 0.1} A${headR * 0.9},${headR} 0 0 1 ${headR * 0.9},${-headR * 0.1} `
                      + `L${headR * 0.75},${-headR * 0.45} L${-headR * 0.8},${-headR * 0.4} Z` },
          fill: hair },

        { id: 'eyeL', parent: 'head', pivot: [-headR * 0.34, -headR * 0.08], z: 22,
          shape: { kind: 'ellipse', rx: headR * 0.1, ry: headR * 0.13 }, fill: 'eye' },
        { id: 'eyeR', parent: 'head', pivot: [headR * 0.34, -headR * 0.08], z: 22,
          shape: { kind: 'ellipse', rx: headR * 0.1, ry: headR * 0.13 }, fill: 'eye' },
    ];

    // Arms and legs, far side drawn behind the torso and near side in front.
    for (const side of ['L', 'R']) {
        const sign = side === 'L' ? -1 : 1;
        const behind = side === 'L';
        const armZ = behind ? 8 : 16;
        const legZ = behind ? 7 : 11;

        parts.push(
            { id: `arm${side}`, parent: 'torso', pivot: [sign * taperHalf, -torsoH * 0.88], z: armZ,
              shape: { kind: 'path', d: `M0,0 L${sign * armW * 0.15},${upperArmH}` },
              stroke: cloth, strokeWidth: armW },
            { id: `fore${side}`, parent: `arm${side}`, pivot: [sign * armW * 0.15, upperArmH], z: armZ,
              shape: { kind: 'path', d: `M0,0 L${sign * armW * 0.1},${foreArmH}` },
              stroke: cloth, strokeWidth: armW * 0.88 },
            { id: `hand${side}`, parent: `fore${side}`, pivot: [sign * armW * 0.1, foreArmH], z: armZ,
              shape: { kind: 'ellipse', rx: armW * 0.52, ry: armW * 0.58 }, fill: skin },

            { id: `thigh${side}`, parent: 'hips', pivot: [sign * hipHalf * 0.62, legW * 0.3], z: legZ,
              shape: { kind: 'path', d: `M0,0 L${sign * legW * 0.1},${thighH}` },
              stroke: trouser, strokeWidth: legW },
            { id: `shin${side}`, parent: `thigh${side}`, pivot: [sign * legW * 0.1, thighH], z: legZ,
              shape: { kind: 'path', d: `M0,0 L0,${shinH}` },
              stroke: trouser, strokeWidth: legW * 0.86 },
            { id: `foot${side}`, parent: `shin${side}`, pivot: [0, shinH], z: legZ,
              shape: { kind: 'path', d: `M${-legW * 0.3},0 L${legW * 1.1},0` },
              stroke: 'shoe', strokeWidth: legW * 0.72 },
        );
    }

    return parts;
}

/** A matching mouth block, positioned on the generated head. */
export function generateMouth(proportions = {}) {
    const p = { ...DEFAULT_PROPORTIONS, ...proportions };
    const headR = (p.height * p.headRatio) / 2;
    const w = headR * 0.42;
    return {
        parent: 'head',
        pivot: [0, headR * 0.42],
        strokeWidth: Math.max(2, headR * 0.1),
        shapes: {
            closed: { kind: 'path', d: `M${-w},0 L${w},0` },
            mid: { kind: 'path', d: `M${-w},0 Q0,${headR * 0.16} ${w},0 Z` },
            open: { kind: 'path', d: `M${-w},0 Q0,${headR * 0.38} ${w},0 Q0,${headR * 0.08} ${-w},0 Z` },
            round: { kind: 'path', d: `M${-w * 0.6},${-headR * 0.04} Q0,${headR * 0.3} ${w * 0.6},${-headR * 0.04} Q0,${headR * 0.02} ${-w * 0.6},${-headR * 0.04} Z` },
            wide: { kind: 'path', d: `M${-w * 1.15},0 Q0,${headR * 0.14} ${w * 1.15},0 Q0,${headR * 0.02} ${-w * 1.15},0 Z` },
            teeth: { kind: 'path', d: `M${-w * 0.9},0 L${w * 0.9},0 L${w * 0.85},${headR * 0.1} L${-w * 0.85},${headR * 0.1} Z` },
        },
    };
}

/** Walk, breathe and blink cycles sized to the proportions. */
export function generateActions(proportions = {}) {
    const p = { ...DEFAULT_PROPORTIONS, ...proportions };
    const bob = p.height * 0.016;
    return {
        breathe: {
            duration: 3.4, loop: 'repeat',
            keys: { 'torso.sy': [[0, 1], [1.7, 1.018], [3.4, 1]] },
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
                'foreL.rot': [[0, 0.22], [0.45, 0.42], [0.9, 0.22]],
                'foreR.rot': [[0, 0.42], [0.45, 0.22], [0.9, 0.42]],
                'torso.rot': [[0, 0.02], [0.45, -0.02], [0.9, 0.02]],
            },
        },
        blink: {
            duration: 4.2, loop: 'repeat',
            keys: {
                'eyeL.sy': [[0, 1], [3.9, 1], [3.98, 0.08], [4.06, 1], [4.2, 1]],
                'eyeR.sy': [[0, 1], [3.9, 1], [3.98, 0.08], [4.06, 1], [4.2, 1]],
            },
        },
        idle: {
            duration: 5.6, loop: 'repeat',
            keys: {
                'torso.rot': [[0, 0.008], [2.8, -0.008], [5.6, 0.008]],
                'head.rot': [[0, -0.012], [2.1, 0.015], [4.2, -0.008], [5.6, -0.012]],
                'armL.rot': [[0, 0.06], [2.8, 0.1], [5.6, 0.06]],
                'armR.rot': [[0, -0.06], [2.8, -0.1], [5.6, -0.06]],
            },
        },
    };
}
