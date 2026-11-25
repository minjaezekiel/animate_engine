/**
 * What scale and orientation an imported model probably wants.
 *
 * # The problem
 *
 * A model from a public library arrives in whatever units and whatever
 * up-axis its author used: centimetres and Z-up from a CAD source, metres and
 * Y-up from a game source, inches from a hobby source. Being 100x wrong is
 * routine, not exceptional. The engine takes the file literally, so an author
 * imports a chair, sees nothing, and starts bisecting `scale` against a
 * render loop -- which is the loop this entire repo exists to close.
 *
 * # Why it RECOMMENDS rather than applies
 *
 * Guessing silently is worse than guessing visibly. A unit inference is a
 * heuristic over a bounding box, and it will be wrong for a model of a
 * cathedral and for a model of a screw. If it were applied automatically the
 * failure would be a film that looks subtly wrong for a reason nobody can
 * find; as a recommendation the failure is a number an author overrides in
 * one line.
 *
 * So every function here returns advice with its reasoning attached, and
 * nothing here mutates anything.
 *
 * Pure arithmetic over a bounding box. No geometry is read.
 */

/**
 * Plausible unit scales, largest first.
 *
 * Only the four that actually occur. A "guess the unit" that can return 37
 * different answers is a worse tool than one that can return four, because
 * the author has to check it either way and checking four is quick.
 */
const UNITS = [
    { name: 'millimetres', toMetres: 0.001 },
    { name: 'centimetres', toMetres: 0.01 },
    { name: 'inches', toMetres: 0.0254 },
    { name: 'metres', toMetres: 1 },
];

/**
 * How tall this kind of thing is, in metres, when it is right.
 *
 * The inference is only ever as good as the expectation it is measured
 * against, so the expectation is an explicit argument with a stated default
 * rather than a number buried in the arithmetic. `human` is the default
 * because a character is the most common import and the one whose wrong scale
 * is most immediately visible.
 */
export const EXPECTED_HEIGHT = {
    human: 1.7,
    prop: 0.3,
    furniture: 0.8,
    vehicle: 1.5,
    building: 8,
};

/**
 * Guess which axis is up, from the shape of the box alone.
 *
 * Reliable for exactly one case and honest about the rest: a thing that is
 * much taller than it is wide (a person, a tree, a lamp, a tower) has its
 * long axis up. A thing that is roughly as tall as it is wide gives no signal
 * at all, and this says so with `confidence: 'none'` rather than picking Y
 * and being right 60% of the time -- because the 40% is a model lying on its
 * face, which is obvious in a render and baffling in a diff.
 *
 * Z-up is the one worth catching: it is the CAD and Blender-export default
 * and it is why an imported model so often arrives face-down.
 */
export function guessUpAxis(bounds) {
    if (!bounds) return { axis: null, confidence: 'none', reason: 'no bounds' };
    const [x, y, z] = bounds.size;
    const sorted = [['x', x], ['y', y], ['z', z]].sort((a, b) => b[1] - a[1]);
    const [tallest, tall] = sorted[0];
    const second = sorted[1][1];
    if (!(tall > 0) || !(second > 0)) {
        return { axis: null, confidence: 'none', reason: 'the box is degenerate' };
    }
    const ratio = tall / second;
    if (ratio < 1.25) {
        return { axis: null, confidence: 'none',
                 reason: `the box is near-cubic (${ratio.toFixed(2)}:1), which carries no signal` };
    }
    if (tallest === 'y') {
        return { axis: 'y', confidence: ratio > 1.6 ? 'high' : 'low',
                 reason: `Y is the longest axis by ${ratio.toFixed(2)}:1, and Y-up is what the engine uses` };
    }
    return {
        axis: tallest, confidence: ratio > 1.6 ? 'high' : 'low',
        // The actionable half: what to write.
        rotation: tallest === 'z' ? [-Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2],
        reason: `${tallest.toUpperCase()} is the longest axis by ${ratio.toFixed(2)}:1, `
            + `so this model is probably ${tallest.toUpperCase()}-up and needs rotating`,
    };
}

/**
 * Guess the file's units, by asking which one makes the model a sane size.
 *
 * Measured on the axis that `guessUpAxis` thinks is up, because that is the
 * axis the expectation is about: 1.7m is a statement about a person's height,
 * not about the diagonal of their bounding box.
 */
export function guessUnits(bounds, { kind = 'human', expected = null } = {}) {
    if (!bounds) return null;
    const want = expected ?? EXPECTED_HEIGHT[kind] ?? EXPECTED_HEIGHT.human;
    const up = guessUpAxis(bounds);
    const axis = up.axis ?? 'y';
    const height = bounds.size[{ x: 0, y: 1, z: 2 }[axis]];
    if (!(height > 0)) return null;
    let best = null;
    for (const unit of UNITS) {
        // How far off from `want` this unit would leave the model, as a ratio
        // in log space so being 10x too big and 10x too small score equally.
        const err = Math.abs(Math.log(height * unit.toMetres / want));
        if (!best || err < best.err) best = { ...unit, err, height };
    }
    return {
        units: best.name,
        scale: best.toMetres,
        measured: +height.toFixed(4),
        measuredAxis: axis,
        wouldBe: +(height * best.toMetres).toFixed(3),
        expected: want,
        // Within a factor of 1.5 of the expectation is a confident call; a
        // factor of 4 means the model is probably not the KIND of thing it
        // was compared against, and saying "metres, confidence low" is more
        // use than saying "metres".
        confidence: best.err < Math.log(1.5) ? 'high' : best.err < Math.log(4) ? 'low' : 'none',
    };
}

/**
 * The whole recommendation: scale, rotation, and where the floor is.
 *
 * `ground` exists because `standOnGround` in the 2D compiler already
 * established the pattern and it is the right one: a thing belongs on the
 * floor, not at the origin. An imported model's origin is wherever its author
 * left it -- commonly the centre of the bounding box, so half the model is
 * underground -- and the offset that fixes it is arithmetic nobody should do
 * by hand.
 */
export function recommendImport(bounds, { kind = 'human', expected = null,
                                          targetHeight = null } = {}) {
    if (!bounds) {
        return { ok: false, reason: 'the model has no measurable bounds; '
            + 'every POSITION accessor is missing its min/max' };
    }
    const up = guessUpAxis(bounds);
    const units = guessUnits(bounds, { kind, expected });
    const notes = [];

    // An explicit target height wins over any inference: an author who says
    // "make it 1.8m" has given a fact, not a hint.
    let scale = units?.scale ?? 1;
    if (targetHeight != null) {
        const axis = up.axis ?? 'y';
        const h = bounds.size[{ x: 0, y: 1, z: 2 }[axis]];
        scale = h > 0 ? targetHeight / h : 1;
        notes.push(`scale ${scale.toPrecision(4)} is from the requested height of ${targetHeight}m, `
            + 'not from a unit guess');
    } else if (units) {
        notes.push(`${units.units} inferred: the ${units.measuredAxis}-extent of `
            + `${units.measured} reads as ${units.wouldBe}m against an expected ${units.expected}m `
            + `(confidence ${units.confidence})`);
    }
    if (up.reason) notes.push(up.reason);
    if (scale !== 1 && Math.abs(Math.log10(scale)) >= 1.5) {
        notes.push(`this is a ${Math.round(1 / scale)}x correction -- large enough that `
            + 'it is worth confirming rather than trusting');
    }

    const rotation = up.rotation ?? null;
    // After rotating, "down" is a different component of the original box, so
    // the ground offset is read off the axis that ENDS UP vertical.
    const lowIndex = rotation ? ({ z: 2, x: 0 }[up.axis] ?? 1) : 1;
    const ground = -bounds.min[lowIndex] * scale;

    return {
        ok: true,
        scale: +scale.toPrecision(6),
        rotation,
        ground: +ground.toPrecision(6),
        // What to paste. The point of the whole file.
        suggestion: {
            scale: +scale.toPrecision(6),
            ...(rotation ? { rotation } : {}),
            at: [0, +ground.toPrecision(6), 0],
        },
        units: units?.units ?? null,
        confidence: targetHeight != null ? 'given' : (units?.confidence ?? 'none'),
        upAxis: up.axis,
        notes,
    };
}

/**
 * Is this model's triangle count a problem, and for which use?
 *
 * A number with no threshold beside it is not advice. These are budgets for a
 * 24fps OFFLINE render, which is a different and much more generous
 * conversation than a realtime one -- this engine renders a frame in 70ms and
 * is happy to.
 */
export function triangleAdvice(stats, { budget = 1_500_000 } = {}) {
    const drawn = stats?.trianglesDrawn ?? stats?.triangles ?? 0;
    if (!drawn) return { level: 'info', message: 'no triangles: this model draws nothing' };
    if (drawn > budget * 4) {
        return { level: 'warning',
                 message: `${drawn.toLocaleString()} triangles drawn is ${(drawn / budget).toFixed(1)}x `
                     + 'a comfortable offline budget; expect seconds per frame and consider a decimated copy' };
    }
    if (drawn > budget) {
        return { level: 'info',
                 message: `${drawn.toLocaleString()} triangles drawn is above the ${budget.toLocaleString()} `
                     + 'guide but renderable offline' };
    }
    return { level: 'info', message: `${drawn.toLocaleString()} triangles drawn` };
}
