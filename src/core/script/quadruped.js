/**
 * Quadrupeds: a rig that is not a biped with extra legs.
 *
 * Design and the gait numbers: [23-QUADRUPED.md](../../../docs/23-QUADRUPED.md).
 *
 * `generate.js` measures everything as a fraction of HEIGHT, which is the
 * right unit for an upright animal and the wrong one for a horizontal one. A
 * dog's defining measurements are its body length and its withers height, and
 * those vary independently -- a dachshund and a whippet stand about the same
 * height. So this is its own module with its own units.
 *
 * Sign convention is the biped's, and is measured rather than assumed: canvas
 * y grows downward, so a positive rotation turns a limb clockwise on screen,
 * and an animal facing +x swings a limb BACKWARD on a positive angle.
 */

/** Proportions in fractions of BODY LENGTH, except where named otherwise. */
export const QUADRUPED_DEFAULTS = {
    length: 240,            // chest to rump, the unit everything else uses
    // Withers height as a fraction of body length. A medium dog stands about
    // as tall as it is long through the barrel; the first version used 0.62,
    // which is a dachshund, and every build inherited it.
    withers: 0.80,
    depth: 0.42,            // chest depth, likewise: 0.30 read as a table top
    legThickness: 0.058,
    neckLength: 0.34,
    headLength: 0.32,
    tailLength: 0.38,
    muzzle: 0.55,           // fraction of head length that is snout
    earHeight: 0.42,        // fraction of head length
};

/**
 * Builds. `scruffy` is the reference film's street dog: short-coupled, light,
 * with a long muzzle and tall ears.
 */
export const QUADRUPED_BUILDS = {
    scruffy: { withers: 0.84, depth: 0.40, legThickness: 0.052, tailLength: 0.42,
               muzzle: 0.58, earHeight: 0.52, headLength: 0.31 },
    hound:   { withers: 0.76, depth: 0.46, legThickness: 0.062, neckLength: 0.30,
               muzzle: 0.62, earHeight: 0.60, headLength: 0.33 },
    terrier: { withers: 0.72, depth: 0.42, legThickness: 0.056, headLength: 0.30,
               tailLength: 0.26, muzzle: 0.46, earHeight: 0.34 },
    wolf:    { withers: 0.92, depth: 0.44, legThickness: 0.064, neckLength: 0.38,
               muzzle: 0.60, earHeight: 0.40, headLength: 0.34 },
};

export function resolveQuadruped(proportions = {}, build) {
    const named = typeof build === 'string' ? (QUADRUPED_BUILDS[build] ?? {}) : (build ?? {});
    return { ...QUADRUPED_DEFAULTS, ...named, ...proportions };
}

/**
 * Gaits, as a STRIKE TIME per foot plus a duty factor -- the fraction of the
 * cycle each foot is on the ground. These are measured quantities, which is
 * what makes them testable rather than a matter of taste.
 *
 * `phases[foot]` is the cycle fraction at which that foot LANDS, so reading
 * the table in order gives the footfall sequence directly. Defining it as an
 * offset added to the clock instead inverts the order -- which is how the
 * first version of this table produced hindL, foreR, hindR, foreL and still
 * passed every arithmetic check about support and suspension.
 *
 * `walk` is LATERAL SEQUENCE: left hind, left fore, right hind, right fore.
 * A walk that lands diagonal pairs together is a slowed-down trot, and is the
 * classic wrong quadruped walk.
 */
export const GAITS = {
    walk:  { cycle: 1.00, duty: 0.65, contact: 0.38, lift: 0.16,
             phases: { hindL: 0.00, foreL: 0.25, hindR: 0.50, foreR: 0.75 } },
    trot:  { cycle: 0.60, duty: 0.45, contact: 0.46, lift: 0.26,
             phases: { foreL: 0.00, hindR: 0.00, foreR: 0.50, hindL: 0.50 } },
    bound: { cycle: 0.45, duty: 0.35, contact: 0.54, lift: 0.40,
             phases: { foreL: 0.00, foreR: 0.05, hindL: 0.50, hindR: 0.55 } },
};

export const FEET = ['foreL', 'foreR', 'hindL', 'hindR'];

/** Is this foot on the ground at cycle fraction `f`? */
export function planted(gait, foot, f) {
    const g = typeof gait === 'string' ? GAITS[gait] : gait;
    const u = (((f - (g.phases[foot] ?? 0)) % 1) + 1) % 1;
    return u < g.duty;
}

/** How many feet are down at cycle fraction `f`. Zero means a suspension. */
export function support(gait, f) {
    return FEET.reduce((n, foot) => n + (planted(gait, foot, f) ? 1 : 0), 0);
}

/**
 * The order feet strike the ground over one cycle, earliest first.
 *
 * This is the property that distinguishes the gaits from each other, so it is
 * computed from the phase data rather than restated beside it.
 */
export function footfallOrder(gait) {
    const g = typeof gait === 'string' ? GAITS[gait] : gait;
    return [...FEET]
        .map((foot) => [foot, (((g.phases[foot] ?? 0) % 1) + 1) % 1])
        .sort((a, b) => a[1] - b[1])
        .map(([foot]) => foot);
}

/** Stride from geometry, so the planted foot cannot slide. */
export function quadrupedStride(proportions = {}, gait = 'walk') {
    const p = resolveQuadruped(proportions, proportions.build);
    const g = typeof gait === 'string' ? (GAITS[gait] ?? GAITS.walk) : gait;
    const legLength = p.length * p.withers * 0.92;
    return 2 * legLength * Math.sin(g.contact);
}

/**
 * A tapered segment running from its joint at the origin to `L`.
 *
 * `L` may be negative, which runs the segment UP -- a neck rises from the
 * chest. The end cap follows the direction of travel; hard-coding it as `+b`
 * turns the cap inside out on an upward segment.
 */
function segment(L, w0, w1, dx = 0) {
    const a = w0 / 2, b = w1 / 2;
    const cap = L + Math.sign(L || 1) * b * 0.9;
    return `M${-a},0 Q${-a * 1.02},${L * 0.5} ${dx - b},${L} `
        + `Q${dx},${cap} ${dx + b},${L} `
        + `Q${a * 1.02},${L * 0.5} ${a},0 Z`;
}

/**
 * The part tree. `body` is the root: everything hangs off it, so one move
 * carries the whole animal, exactly as `hips` does for the biped.
 */
export function generateQuadrupedParts(generate = {}, proportions = {}) {
    const p = resolveQuadruped(proportions, generate.build ?? 'scruffy');
    const L = p.length;
    const H = L * p.withers;
    const depth = L * p.depth;
    const legW = L * p.legThickness;
    const line = Math.max(1.2, L * 0.006);

    const coat = generate.coat ?? 'coat';
    const belly = generate.belly ?? `${coat}Shade`;
    const nose = generate.nose ?? 'ink';
    const facing = generate.facing ?? 1;
    const sgn = facing >= 0 ? 1 : -1;

    // Front legs are a near-vertical column; the hind leg is the engine and
    // carries one more segment -- the hock, the raised heel that reads as a
    // backwards-bending knee. Without it the animal reads as a bear.
    //
    // **Segment lengths are DERIVED so the paws land exactly at withers
    // height**, the same way the biped derives its hip drop from the contact
    // angle. Picking them by eye made `withers` a number that meant nothing:
    // the first version's legs reached 30% past it, so a dog declared 180
    // units at the shoulder stood 234 tall and every `at` in a film was
    // measuring against a figure that did not exist.
    const pawDrop = legW * 0.54;
    const foreAttach = depth * 0.52;
    const foreChain = H - foreAttach - pawDrop;
    const foreUpper = foreChain * 0.42;
    const foreLower = foreChain * 0.40;
    const forePastern = foreChain * 0.18;

    // The hind leg hangs off `rump`, which hangs off `spine`, so its attach
    // height is the sum of both pivots.
    const spineY = depth * 0.08;
    const hipY = depth * 0.40;
    const hindChain = H - spineY - hipY - pawDrop;
    const thigh = hindChain * 0.36;
    const shank = hindChain * 0.34;
    const hock = hindChain * 0.30;

    const halfL = L / 2;
    const neckL = L * p.neckLength;
    const headL = L * p.headLength;
    const tailL = L * p.tailLength;

    const parts = [
        // The barrel. Its origin is the centre of the back, at withers height.
        { id: 'body', parent: null, z: 10,
          // Deep at the chest, tucked at the loin: that asymmetry is most of
          // what reads as "dog" in silhouette. A symmetrical barrel reads as
          // a table.
          shape: { kind: 'path',
                   d: `M${-halfL * 0.86},${depth * 0.04} `
                      + `C${-halfL * 1.04},${depth * 0.46} ${-halfL * 0.92},${depth * 0.74} `
                      + `${-halfL * 0.52},${depth * 0.80} `
                      + `C${-halfL * 0.1},${depth * 0.86} ${halfL * 0.18},${depth * 1.02} `
                      + `${halfL * 0.6},${depth * 0.98} `
                      + `C${halfL * 0.98},${depth * 0.94} ${halfL * 1.06},${depth * 0.52} `
                      + `${halfL * 0.98},${depth * 0.20} `
                      + `C${halfL * 0.92},${-depth * 0.12} ${halfL * 0.62},${-depth * 0.20} `
                      + `${halfL * 0.34},${-depth * 0.12} `
                      + `C${halfL * 0.02},${-depth * 0.02} ${-halfL * 0.3},${depth * 0.06} `
                      + `${-halfL * 0.52},${-depth * 0.04} `
                      + `C${-halfL * 0.72},${-depth * 0.12} ${-halfL * 0.84},${-depth * 0.08} `
                      + `${-halfL * 0.86},${depth * 0.04} Z` },
          fill: coat, stroke: `${coat}Line`, strokeWidth: line,
          shapes: [{ id: 'belly', z: 1, fill: belly,
                     shape: { kind: 'path',
                              d: `M${-halfL * 0.52},${depth * 0.66} `
                                 + `Q${-halfL * 0.05},${depth * 0.88} ${halfL * 0.5},${depth * 0.99} `
                                 + `Q${-halfL * 0.05},${depth * 0.80} `
                                 + `${-halfL * 0.52},${depth * 0.66} Z` } }] },

        // The spine flexes in the sagittal plane; in a bound that flexion is
        // most of what the gait looks like. A decorative joint would not.
        { id: 'spine', parent: 'body', pivot: [-halfL * 0.52, spineY], z: 9 },
        // Same fill and NO stroke: an outlined ellipse here reads as a disc
        // bolted to the back of the dog, which is exactly how it read.
        { id: 'rump', parent: 'spine', pivot: [0, 0], z: 9,
          shape: { kind: 'ellipse', rx: halfL * 0.30, ry: depth * 0.46, cy: depth * 0.34 },
          fill: coat },

        // The tail RISES and trails back. Hanging it downward, as the legs
        // hang, dropped it 220 units below the back -- past the paws and
        // through the floor, while every gait test still passed.
        { id: 'tail', parent: 'rump', pivot: [-halfL * 0.24, depth * 0.06], z: 8,
          shape: { kind: 'path', d: segment(-tailL, legW * 0.85, legW * 0.3, -tailL * 0.34) },
          fill: coat, stroke: `${coat}Line`, strokeWidth: line },
        { id: 'tailTip', parent: 'tail', pivot: [-tailL * 0.40, -tailL], z: 8,
          shape: { kind: 'path', d: segment(-tailL * 0.45, legW * 0.3, legW * 0.14, -tailL * 0.14) },
          fill: coat, stroke: `${coat}Line`, strokeWidth: line },

        // The neck RISES from the chest and leans forward. Running it
        // downward, as every other segment here runs, put the head under the
        // ribs -- which the compiler had no way to object to.
        //
        // It joins at the TOP of the shoulder, not mid-chest. `drawOrder` is
        // depth-first, so a child always draws over its parent and no `z` can
        // put the neck behind the barrel (the same limit the biped's arms
        // have). Joining high means only a little of it overlaps, instead of
        // a trapezoid plate across the whole shoulder.
        { id: 'neck', parent: 'body', pivot: [halfL * 0.62, depth * 0.06], z: 9,
          shape: { kind: 'path',
                   d: segment(-neckL * 0.92, depth * 0.52, depth * 0.36, neckL * 0.44 * sgn) },
          fill: coat, stroke: `${coat}Line`, strokeWidth: line },

        // `head` is a GROUP: drawOrder walks depth-first, so anything behind
        // the skull has to be the skull's sibling while still turning with it.
        { id: 'head', parent: 'neck', pivot: [neckL * 0.44 * sgn, -neckL * 0.92], z: 20 },
        { id: 'earFar', parent: 'head', pivot: [-headL * 0.06 * sgn, -headL * 0.20], z: 18,
          shape: { kind: 'path',
                   d: `M0,0 Q${-headL * 0.16 * sgn},${-headL * p.earHeight * 1.1} `
                      + `${headL * 0.04 * sgn},${-headL * p.earHeight} `
                      + `Q${headL * 0.20 * sgn},${-headL * p.earHeight * 0.5} 0,0 Z` },
          fill: `${coat}Shade`, stroke: `${coat}Line`, strokeWidth: line },
        { id: 'skull', parent: 'head', pivot: [0, 0], z: 20,
          shape: { kind: 'ellipse', rx: headL * 0.40, ry: headL * 0.34 },
          fill: coat, stroke: `${coat}Line`, strokeWidth: line },
        { id: 'muzzle', parent: 'head', pivot: [headL * 0.30 * sgn, headL * 0.06], z: 21,
          shape: { kind: 'path',
                   d: `M0,${-headL * 0.14} L${headL * p.muzzle * sgn},${-headL * 0.10} `
                      + `Q${headL * (p.muzzle + 0.08) * sgn},${headL * 0.02} `
                      + `${headL * p.muzzle * sgn},${headL * 0.12} `
                      + `L0,${headL * 0.18} Z` },
          fill: coat, stroke: `${coat}Line`, strokeWidth: line },
        { id: 'nose', parent: 'muzzle', pivot: [headL * p.muzzle * sgn, headL * 0.01], z: 22,
          shape: { kind: 'ellipse', rx: headL * 0.07, ry: headL * 0.055 }, fill: nose },
        { id: 'eye', parent: 'skull', pivot: [headL * 0.17 * sgn, -headL * 0.07], z: 23,
          shape: { kind: 'ellipse', rx: headL * 0.075, ry: headL * 0.085 },
          fill: generate.white ?? 'white', stroke: `${coat}Line`, strokeWidth: line * 0.8,
          swap: {
            eyes: {
              open:   { kind: 'ellipse', rx: headL * 0.075, ry: headL * 0.085 },
              half:   { kind: 'ellipse', rx: headL * 0.075, ry: headL * 0.040 },
              closed: { kind: 'ellipse', rx: headL * 0.075, ry: headL * 0.010 },
            },
          } },
        { id: 'pupil', parent: 'eye', pivot: [headL * 0.012 * sgn, 0], z: 24,
          shape: { kind: 'ellipse', rx: headL * 0.040, ry: headL * 0.050 },
          fill: generate.eye ?? 'ink' },
        { id: 'earNear', parent: 'head', pivot: [headL * 0.10 * sgn, -headL * 0.24], z: 25,
          shape: { kind: 'path',
                   d: `M0,0 Q${-headL * 0.14 * sgn},${-headL * p.earHeight * 1.15} `
                      + `${headL * 0.08 * sgn},${-headL * p.earHeight * 1.05} `
                      + `Q${headL * 0.24 * sgn},${-headL * p.earHeight * 0.45} 0,0 Z` },
          fill: coat, stroke: `${coat}Line`, strokeWidth: line },

        // The jaw swings for a bark or a yawn, which is most of a dog's acting.
        { id: 'jaw', parent: 'head', pivot: [headL * 0.26 * sgn, headL * 0.16], z: 19,
          shape: { kind: 'path',
                   d: `M0,0 L${headL * p.muzzle * 0.92 * sgn},${headL * 0.02} `
                      + `Q${headL * p.muzzle * 0.5 * sgn},${headL * 0.20} 0,${headL * 0.16} Z` },
          fill: `${coat}Shade`, stroke: `${coat}Line`, strokeWidth: line },
    ];

    // Legs. The far pair draws behind the barrel, the near pair in front.
    for (const side of ['L', 'R']) {
        const s = side === 'L' ? -1 : 1;
        const behind = s !== sgn;
        const z = behind ? 6 : 15;
        const tone = behind ? `${coat}Shade` : coat;
        const skew = s * legW * 0.1;

        parts.push(
            { id: `foreUpper${side}`, parent: 'body', pivot: [halfL * 0.62, foreAttach], z,
              shape: { kind: 'path', d: segment(foreUpper, legW * 1.25, legW, skew) },
              fill: tone, stroke: `${coat}Line`, strokeWidth: line },
            { id: `foreLower${side}`, parent: `foreUpper${side}`, pivot: [skew, foreUpper], z,
              shape: { kind: 'path', d: segment(foreLower, legW, legW * 0.72, 0) },
              fill: tone, stroke: `${coat}Line`, strokeWidth: line },
            { id: `forePastern${side}`, parent: `foreLower${side}`, pivot: [0, foreLower], z,
              shape: { kind: 'path', d: segment(forePastern, legW * 0.72, legW * 0.62, 0) },
              fill: tone, stroke: `${coat}Line`, strokeWidth: line },
            { id: `forePaw${side}`, parent: `forePastern${side}`, pivot: [0, forePastern], z,
              shape: { kind: 'path',
                       d: `M${-legW * 0.4},0 L${legW * 0.4},0 `
                          + `Q${sgn * legW * 1.0},${legW * 0.14} ${sgn * legW * 1.05},${legW * 0.44} `
                          + `Q${sgn * legW * 0.9},${legW * 0.54} ${-sgn * legW * 0.42},${legW * 0.54} Z` },
              fill: tone, stroke: `${coat}Line`, strokeWidth: line },

            { id: `thigh${side}`, parent: 'rump', pivot: [-halfL * 0.06, hipY], z,
              shape: { kind: 'path', d: segment(thigh, legW * 1.9, legW * 1.1, skew) },
              fill: tone, stroke: `${coat}Line`, strokeWidth: line },
            { id: `shank${side}`, parent: `thigh${side}`, pivot: [skew, thigh], z,
              shape: { kind: 'path', d: segment(shank, legW * 1.1, legW * 0.72, 0) },
              fill: tone, stroke: `${coat}Line`, strokeWidth: line },
            // The hock. This is the joint that makes a dog a dog.
            { id: `hock${side}`, parent: `shank${side}`, pivot: [0, shank], z,
              shape: { kind: 'path', d: segment(hock, legW * 0.72, legW * 0.58, 0) },
              fill: tone, stroke: `${coat}Line`, strokeWidth: line },
            { id: `hindPaw${side}`, parent: `hock${side}`, pivot: [0, hock], z,
              shape: { kind: 'path',
                       d: `M${-legW * 0.38},0 L${legW * 0.38},0 `
                          + `Q${sgn * legW * 0.95},${legW * 0.14} ${sgn * legW * 1.0},${legW * 0.42} `
                          + `Q${sgn * legW * 0.86},${legW * 0.52} ${-sgn * legW * 0.4},${legW * 0.52} Z` },
              fill: tone, stroke: `${coat}Line`, strokeWidth: line },
        );
    }

    return parts;
}

/**
 * Round to four places and normalise negative zero.
 *
 * `Math.sin(2 * Math.PI)` is a tiny NEGATIVE number, so a channel that should
 * close its loop on 0 closes it on -0 instead. `Object.is(0, -0)` is false, so
 * that is a real loop-point mismatch to a strict comparison and an ugly `-0`
 * in any serialised film.
 */
const round = (x) => {
    const r = +x.toFixed(4);
    return r === 0 ? 0 : r;
};

/** Sample a looping [frac, value] key list linearly. */
function sampleLoop(keys, f) {
    for (let i = 0; i < keys.length - 1; i++) {
        const [f0, v0] = keys[i];
        const [f1, v1] = keys[i + 1];
        if (f >= f0 && f <= f1) return f1 === f0 ? v0 : v0 + ((f - f0) / (f1 - f0)) * (v1 - v0);
    }
    return keys[keys.length - 1][1];
}

/**
 * One limb's rotation over a cycle, sampled from the gait rather than posed
 * by hand.
 *
 * At strike the foot is FORWARD of the body, which is a negative rotation --
 * canvas y grows downward, so positive turns a limb clockwise and therefore
 * backward for an animal facing +x. Through stance the body travels over the
 * planted foot, so the limb rotates to +contact at lift-off. Swing carries it
 * back to -contact for the next strike.
 */
function limbAngles(gait, phase, samples = 16) {
    const { duty, contact } = gait;
    const keys = [];
    for (let i = 0; i <= samples; i++) {
        const f = i / samples;
        const u = (((f - phase) % 1) + 1) % 1;
        const angle = u < duty
            ? contact * ((u / duty) * 2 - 1)                     // stance: forward -> back
            : contact * (1 - ((u - duty) / (1 - duty)) * 2);     // swing: back -> forward
        keys.push([f, round(angle)]);
    }
    return keys;
}

/** How much a leg folds, peaking in mid-swing: a straight swinging leg hits the floor. */
function foldAngles(gait, phase, amount, samples = 16) {
    const { duty } = gait;
    const keys = [];
    for (let i = 0; i <= samples; i++) {
        const f = i / samples;
        const u = (((f - phase) % 1) + 1) % 1;
        const fold = u < duty ? 0 : Math.sin(Math.PI * ((u - duty) / (1 - duty)));
        keys.push([f, round(fold * amount)]);
    }
    return keys;
}

/** Shift a looping key list later by `d` of a cycle, sampling the wrap. */
function phaseShift(keys, d) {
    const out = [];
    const samples = keys.length - 1;
    for (let i = 0; i <= samples; i++) {
        const f = i / samples;
        out.push([f, round(sampleLoop(keys, (((f - d) % 1) + 1) % 1))]);
    }
    return out;
}

/**
 * The gait cycles, plus the idles a dog needs to act.
 *
 * Everything that is not a leg is DERIVED from the legs rather than animated
 * beside them: the body rises and falls on the support pattern, the head
 * trails the body and the tail trails the head. That lag is overlap, and it
 * is what makes the result read as an animal rather than a mechanism.
 */
export function generateQuadrupedActions(proportions = {}, generate = {}) {
    const p = resolveQuadruped(proportions, generate.build ?? 'scruffy');
    const H = p.length * p.withers;
    const out = {};

    for (const [name, gait] of Object.entries(GAITS)) {
        const cycle = Number(generate.cadence) > 0 && name === 'walk'
            ? Number(generate.cadence) : gait.cycle;
        const t = (keys) => keys.map(([f, v]) => [round(f * cycle), v]);

        // A 4-beat walk dips the body twice a cycle, once per diagonal
        // support pair. A bound dips once, deeply.
        const beats = name === 'bound' ? 1 : 2;
        const amp = H * (name === 'bound' ? 0.085 : name === 'trot' ? 0.035 : 0.022);
        const bodyY = [];
        const spine = [];
        for (let i = 0; i <= 16; i++) {
            const f = i / 16;
            bodyY.push([f, round(-amp * Math.cos(2 * Math.PI * beats * f))]);
            // Sagittal spine flex. In a bound this IS the gait.
            const flex = name === 'bound' ? 0.26 : name === 'trot' ? 0.05 : 0.03;
            spine.push([f, round(flex * Math.sin(2 * Math.PI * f))]);
        }

        const keys = {
            'body.y': t(bodyY),
            'spine.rot': t(spine),
            // The neck trails the body by a tenth of a cycle, the tail by a
            // fifth, each with a wider arc than the thing it follows.
            'neck.rot': t(phaseShift(bodyY, 0.1).map(([f, v]) => [f, round(-v / H * 0.9)])),
            'head.rot': t(phaseShift(bodyY, 0.16).map(([f, v]) => [f, round(v / H * 0.7)])),
            'tail.rot': t(phaseShift(spine, 0.2).map(([f, v]) => [f, round(v * 2.2)])),
            'tailTip.rot': t(phaseShift(spine, 0.3).map(([f, v]) => [f, round(v * 2.8)])),
        };

        for (const side of ['L', 'R']) {
            const fore = gait.phases[`fore${side}`];
            const hind = gait.phases[`hind${side}`];
            keys[`foreUpper${side}.rot`] = t(limbAngles(gait, fore));
            keys[`foreLower${side}.rot`] = t(foldAngles(gait, fore, gait.lift * 1.6));
            keys[`forePastern${side}.rot`] = t(foldAngles(gait, fore, gait.lift * 0.9));
            keys[`forePaw${side}.rot`] = t(foldAngles(gait, fore, -gait.lift * 0.8));

            keys[`thigh${side}.rot`] = t(limbAngles(gait, hind));
            keys[`shank${side}.rot`] = t(foldAngles(gait, hind, gait.lift * 1.9));
            // The hock counter-flexes: it bends the OTHER way from the stifle
            // above it, and that opposition is the whole dog-leg silhouette.
            keys[`hock${side}.rot`] = t(foldAngles(gait, hind, -gait.lift * 2.3));
            keys[`hindPaw${side}.rot`] = t(foldAngles(gait, hind, gait.lift * 1.1));
        }

        out[name] = { duration: cycle, loop: 'repeat', keys };
    }

    out.breathe = {
        duration: 2.6, loop: 'repeat', blend: 'add',
        keys: { 'body.sy': [[0, 1], [1.3, 1.022], [2.6, 1]],
                'body.sx': [[0, 1], [1.3, 0.993], [2.6, 1]] },
    };
    out.blink = {
        duration: 3.8, loop: 'repeat',
        keys: { 'eye.props.eyes': [[0, 'open'], [3.5, 'closed'], [3.66, 'open']] },
    };
    // A dog's idle is the tail and the ears, not the body.
    out.idle = {
        duration: 4.4, loop: 'repeat', blend: 'add',
        keys: {
            'tail.rot': [[0, -0.18], [1.1, 0.22], [2.2, -0.18], [3.3, 0.24], [4.4, -0.18]],
            'tailTip.rot': [[0, -0.1], [1.3, 0.3], [2.6, -0.1], [3.6, 0.28], [4.4, -0.1]],
            'earNear.rot': [[0, 0], [2.0, -0.07], [4.4, 0]],
            'head.rot': [[0, 0.01], [2.2, -0.02], [4.4, 0.01]],
        },
    };
    // Scratching with a hind leg -- the reference film's acting beat.
    out.scratch = {
        duration: 1.2, loop: 'repeat',
        keys: {
            'thighL.rot': [[0, -0.5], [0.15, -1.25], [1.05, -1.25], [1.2, -0.5]],
            'shankL.rot': [[0, 0.3], [0.15, 1.5], [0.3, 1.1], [0.45, 1.5], [0.6, 1.1],
                           [0.75, 1.5], [0.9, 1.1], [1.05, 1.5], [1.2, 0.3]],
            'hockL.rot': [[0, 0], [0.15, -0.9], [1.05, -0.9], [1.2, 0]],
            'head.rot': [[0, 0], [0.2, 0.26], [1.0, 0.26], [1.2, 0]],
            'neck.rot': [[0, 0], [0.2, -0.18], [1.0, -0.18], [1.2, 0]],
        },
    };
    // A bark: the jaw is most of a dog's acting.
    out.bark = {
        duration: 0.5, loop: 'once',
        keys: {
            'jaw.rot': [[0, 0], [0.06, 0.62], [0.2, 0.5], [0.34, 0.06], [0.5, 0]],
            'head.rot': [[0, 0], [0.06, -0.16], [0.3, -0.1], [0.5, 0]],
            'neck.rot': [[0, 0], [0.06, 0.12], [0.5, 0]],
            'body.y': [[0, 0], [0.06, -H * 0.03], [0.24, 0], [0.5, 0]],
        },
    };
    return out;
}

/** The action names a generated quadruped gets for free. */
export const QUADRUPED_ACTIONS = ['walk', 'trot', 'bound', 'breathe', 'blink',
                                  'idle', 'scratch', 'bark'];
