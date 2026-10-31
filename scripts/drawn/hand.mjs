/**
 * A hand drawn with real fingers, rigged so they can move.
 *
 * Studied from `anime22.mp4`, the fist gripping a bottle, magnified 5x.
 * What that drawing actually does, and what a blob with three arcs scratched
 * on it does not:
 *
 * - **Each finger is a stack of SEGMENTS, not a tube.** You see the proximal
 *   segment nearly end-on, and the knuckle crease between segments is a
 *   separate, shorter, lighter line. The crease is what makes a finger read
 *   as jointed rather than as a sausage.
 * - **The four fingers diminish down the hand.** Index is largest and
 *   highest; the little finger is about three-quarters its length and sits
 *   furthest round the far side. Drawn the same size, they read as a comb.
 * - **Each finger OVERLAPS the one below it.** That overlap is the only
 *   depth cue a flat drawing of a fist has.
 * - **The thumb crosses the front**, from near the wrist, and curls the
 *   other way. A thumb level with the fingers is just a short finger.
 * - **Line weight drops on small forms.** Full contour weight on a digit a
 *   few units wide fills it in solid.
 *
 * Part names match `core/script/generate.js` and the 3D rig -- `thumbL1`,
 * `indexL2` and so on -- so the `grip` verb and its pose table drive these
 * unchanged.
 */

const DIGITS = ['index', 'middle', 'ring', 'little'];

/**
 * Relative length and width of each digit, index = 1, and `slot` -- its
 * position across the knuckles, measured in finger widths from the centre.
 *
 * The first version packed all four into a third of the palm's width because
 * `slot` was being subtracted from a constant instead of spanning the hand.
 * They rendered as a bundle of parallel bars.
 */
const PROPORTION = {
    index:  { len: 1.00, w: 1.00, slot: -1.5 },
    middle: { len: 1.06, w: 1.04, slot: -0.5 },
    ring:   { len: 0.96, w: 0.96, slot: 0.5 },
    little: { len: 0.76, w: 0.82, slot: 1.5 },
};

const stroke = (path, w, color = 'ink') => ({ path, brush: 'pencil', color, size: w });

/**
 * One finger segment: two side contours, a tip if it is the last one, and a
 * crease across the joint at its base.
 */
function segmentStrokes({ len, w0, w1, tip, line, crease }) {
    const a = w0 / 2, b = w1 / 2;
    const out = [
        stroke(`M ${-a} 0 C ${-a * 1.04} ${len * 0.45} ${-b} ${len * 0.7} ${-b} ${len}`, line),
        stroke(`M ${a} 0 C ${a * 1.04} ${len * 0.45} ${b} ${len * 0.7} ${b} ${len}`, line),
    ];
    if (tip) {
        out.push(stroke(`M ${-b} ${len} C ${-b} ${len + b * 1.1} ${b} ${len + b * 1.1} ${b} ${len}`, line));
        // the nail, which is what stops a fingertip reading as a stump
        out.push(stroke(`M ${-b * 0.55} ${len * 0.62} C ${-b * 0.3} ${len * 0.46} `
            + `${b * 0.3} ${len * 0.46} ${b * 0.55} ${len * 0.62}`, crease));
    } else {
        // The knuckle crease sits just BELOW the joint, and is shorter and
        // lighter than the contour. Drawn at full weight it reads as a cut.
        out.push(stroke(`M ${-b * 0.8} ${len * 0.9} C ${-b * 0.3} ${len * 1.02} `
            + `${b * 0.3} ${len * 1.02} ${b * 0.8} ${len * 0.9}`, crease));
    }
    return out;
}

/**
 * @param {object} o
 * @param {string} o.side        'L' or 'R'
 * @param {string} o.parent      the forearm part id
 * @param {[number,number]} o.pivot  the wrist, in the forearm's local space
 * @param {number} o.size        hand length, wrist to fingertip
 * @param {number} [o.facing=1]  1 draws the thumb to +x
 * @param {number} [o.z=0]
 */
/** Finger pitch across the knuckles, shared by the thumb's width. */
const pitchOf = (palmW) => palmW * 0.235;

export function drawnHandParts({ side, parent, pivot, size, facing = 1, z = 0 }) {
    const sgn = facing >= 0 ? 1 : -1;
    const id = (n, j = '') => `${n}${side}${j}`;
    // Roughly half and half. The first version made the fingers 56% of the
    // hand and as thin as pencils, and they read as prison bars.
    const palmL = size * 0.50;
    const fingerL = size - palmL;
    const palmW = size * 0.78;
    const line = Math.max(1.6, size * 0.075);
    const digitLine = Math.max(1.2, line * 0.62);
    const crease = Math.max(0.9, line * 0.42);

    const parts = [
        // The back of the hand: a soft wedge, wrist to knuckles.
        { id: id('hand'), parent, pivot, z, strokes: [
            // the wrist is narrow and the knuckles are wide: a parallel-sided
            // palm is a paddle
            stroke(`M ${-palmW * 0.30} 0 C ${-palmW * 0.46} ${palmL * 0.45} `
                + `${-palmW * 0.52} ${palmL * 0.8} ${-palmW * 0.50} ${palmL}`, line),
            stroke(`M ${palmW * 0.30} 0 C ${palmW * 0.48} ${palmL * 0.45} `
                + `${palmW * 0.54} ${palmL * 0.8} ${palmW * 0.52} ${palmL}`, line),
            // the knuckle line: an ARC, not a straight edge, and it is what
            // tells you which way the hand is turned
            stroke(`M ${-palmW * 0.50} ${palmL * 0.96} C ${-palmW * 0.2} ${palmL * 1.14} `
                + `${palmW * 0.2} ${palmL * 1.14} ${palmW * 0.52} ${palmL * 0.96}`, crease * 1.5),
        ] },
    ];

    // The thumb starts near the WRIST and leans across the front.
    const thumbL = fingerL * 0.86;
    const thumbW = pitchOf(palmW) * 1.08;
    parts.push(
        { id: id('thumb', 1), parent: id('hand'), pivot: [sgn * palmW * 0.40, palmL * 0.30],
          z: z + 0.5,
          strokes: segmentStrokes({ len: thumbL * 0.55, w0: thumbW, w1: thumbW * 0.9,
                                    tip: false, line: digitLine, crease }) },
        { id: id('thumb', 2), parent: id('thumb', 1), pivot: [0, thumbL * 0.55], z: z + 0.5,
          strokes: segmentStrokes({ len: thumbL * 0.45, w0: thumbW * 0.9, w1: thumbW * 0.76,
                                    tip: true, line: digitLine, crease }) },
    );

    // Four digits laid out ACROSS the knuckles, filling the palm's width,
    // and following the knuckle ARC so the outer two sit slightly lower --
    // which is the whole reason a fist reads as having depth.
    const pitch = palmW * 0.235;
    for (const name of DIGITS) {
        const p = PROPORTION[name];
        const L = fingerL * p.len;
        const w = pitch * 0.86 * p.w;
        const x = sgn * p.slot * pitch;
        const drop = (p.slot * p.slot) * palmL * 0.055;
        parts.push(
            { id: id(name, 1), parent: id('hand'), pivot: [x, palmL + drop],
              z: z + 0.4 - p.slot * 0.05,
              strokes: segmentStrokes({ len: L * 0.56, w0: w, w1: w * 0.94,
                                        tip: false, line: digitLine, crease }) },
            { id: id(name, 2), parent: id(name, 1), pivot: [0, L * 0.56],
              z: z + 0.4 - p.slot * 0.05,
              strokes: segmentStrokes({ len: L * 0.44, w0: w * 0.94, w1: w * 0.8,
                                        tip: true, line: digitLine, crease }) },
        );
    }
    return parts;
}

/**
 * Rotations that curl a drawn hand into a grip.
 *
 * A fist is not every joint bent the same amount: the proximal joint carries
 * most of it, the distal joint closes further, and the little finger curls
 * HARDER than the index. Bend them equally and the fist reads as a clamp.
 */
export function gripPose(side, amount = 1) {
    const pose = {};
    const curl = { index: 1.0, middle: 1.06, ring: 1.12, little: 1.2 };
    // A pose names the channel BARE: `compile.js` writes `transform.${channel}`
    // itself. Writing 'transform.rot' here produced `transform.transform.rot`,
    // a track the evaluator happily carried and nothing ever read -- the hand
    // simply never closed, with no diagnostic anywhere.
    for (const name of DIGITS) {
        pose[`${name}${side}1`] = { rot: 1.15 * curl[name] * amount };
        pose[`${name}${side}2`] = { rot: 1.45 * curl[name] * amount };
    }
    pose[`thumb${side}1`] = { rot: -0.55 * amount };
    pose[`thumb${side}2`] = { rot: -0.85 * amount };
    return pose;
}
