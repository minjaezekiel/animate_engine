/**
 * Bone constraints: the declarative half.
 *
 * A constraint is a rule evaluated AFTER the timeline has written the pose
 * and BEFORE the frame is drawn -- which is the one thing a keyframe cannot
 * express, because its answer depends on where something else ended up.
 * Three of the four here are the standard DCC set (Blender's Track To, Limit
 * Rotation and Copy Rotation; Maya's aim, limit and orient); the fourth,
 * `driven`, is pose space deformation, and `ik` routes to
 * [IK3D](IK3D.js).
 *
 * What lives in this file is everything that does not need a scene graph:
 * validation, degrees-to-radians, the clamp, and the driver remap. Applying
 * the result needs world matrices, so it lives in the backend --
 * [SceneAdapter](../../backends/three3d/SceneAdapter.js) -- and this module
 * stays pure and Node-testable, the same split `humanoid3d` and
 * `SceneAdapter` already make for the rig itself.
 */

const DEG = Math.PI / 180;
const AXES = ['x', 'y', 'z'];

export const CONSTRAINT_TYPES = ['lookAt', 'limitRotation', 'copyRotation', 'driven', 'ik'];

/** Clamp with either bound optional, so `[null, 30]` is a one-sided limit. */
export function clampAngle(v, min, max) {
    let r = v;
    if (min != null) r = Math.max(min, r);
    if (max != null) r = Math.min(max, r);
    return r;
}

/**
 * Clamp an Euler triple against per-axis limits, in radians.
 *
 * `limits` is `{ x: [min, max], y: ..., z: ... }` and an absent axis is free.
 * Euler space, not quaternion space, because a limit is authored per axis --
 * "the eye turns 35 degrees left and 25 degrees up" is three numbers an
 * animator can reason about and a quaternion cone is not.
 *
 * ponytail: Euler clamp, which is gimbal-prone near +-90 degrees on the
 * middle axis. Every constraint here is on a joint that lives well inside
 * that; move to a swing-twist decomposition if a shoulder ever needs limits.
 */
export function limitRotation(euler, limits = {}) {
    return AXES.map((axis, i) => {
        const range = limits[axis];
        return range ? clampAngle(euler[i], range[0], range[1]) : euler[i];
    });
}

/**
 * Remap a driver value onto an output range, clamped at both ends.
 *
 * This is pose space deformation reduced to its smallest honest form: read
 * one channel, write another, with a curve between them. §6 of the character
 * doc names the problem it is for -- "an elbow at 120 degrees collapses into
 * itself. Production rigs drive corrective blendshapes from the joint's own
 * angle."
 *
 * `ease` is 'linear' or 'smooth'; smoothstep is what keeps a corrective from
 * popping on at the instant the joint crosses the threshold.
 */
export function drivenValue(input, from, to, ease = 'smooth') {
    const [a, b] = from;
    const span = b - a;
    let u = span === 0 ? (input >= b ? 1 : 0) : (input - a) / span;
    u = Math.min(1, Math.max(0, u));
    if (ease === 'smooth') u = u * u * (3 - 2 * u);
    return to[0] + (to[1] - to[0]) * u;
}

/** Is this channel measured in degrees when authored? */
const isAngle = (channel) => String(channel).startsWith('rotation.');

const pair = (v, fallback) => (Array.isArray(v) && v.length >= 2
    ? [Number(v[0]), Number(v[1])] : fallback);

/**
 * Validate and canonicalise a constraint list.
 *
 * Angles arrive in DEGREES, like every other angle in a film script, and
 * leave in radians -- so nothing downstream has to remember which. A
 * constraint that names a node the film does not have is dropped with a
 * warning rather than throwing, which is the diagnostics contract the whole
 * compiler keeps.
 *
 * `exists(id)` is the caller's node lookup; passing `null` skips the check,
 * which is what a unit test wants.
 */
export function normalizeConstraints(list = [], { warn = () => {}, exists = null,
                                                  where = 'constraints' } = {}) {
    const out = [];
    const known = (id, field) => {
        if (!id) { warn(`constraint needs a \`${field}\``, where); return false; }
        if (exists && !exists(id)) { warn(`constraint ${field} '${id}' is not a node`, where); return false; }
        return true;
    };

    for (const [i, raw] of list.entries()) {
        const at = `${where}[${i}]`;
        const spec = raw ?? {};
        if (!CONSTRAINT_TYPES.includes(spec.type)) {
            warn(`unknown constraint type '${spec.type}'. Known: ${CONSTRAINT_TYPES.join(', ')}.`, at);
            continue;
        }
        const weight = spec.weight == null ? 1 : Math.min(1, Math.max(0, spec.weight));
        if (weight === 0) continue;             // declared and switched off
        const limits = {};
        for (const axis of AXES) {
            const range = spec.limit?.[axis];
            if (range) limits[axis] = [range[0] == null ? null : range[0] * DEG,
                                       range[1] == null ? null : range[1] * DEG];
        }

        if (spec.type === 'lookAt') {
            if (!known(spec.source, 'source') || !known(spec.target, 'target')) continue;
            out.push({ type: 'lookAt', source: spec.source, target: spec.target, weight,
                       limit: Object.keys(limits).length ? limits : null,
                       offset: spec.offset ? spec.offset.map(Number) : null });
            continue;
        }
        if (spec.type === 'limitRotation') {
            if (!known(spec.source, 'source')) continue;
            if (!Object.keys(limits).length) {
                warn('limitRotation has no `limit` to apply', at);
                continue;
            }
            out.push({ type: 'limitRotation', source: spec.source, limit: limits, weight });
            continue;
        }
        if (spec.type === 'copyRotation') {
            if (!known(spec.source, 'source') || !known(spec.from, 'from')) continue;
            const axes = String(spec.axes ?? 'xyz').toLowerCase();
            out.push({ type: 'copyRotation', source: spec.source, from: spec.from, weight,
                       axes: AXES.map((a) => axes.includes(a)),
                       invert: !!spec.invert,
                       limit: Object.keys(limits).length ? limits : null });
            continue;
        }
        if (spec.type === 'driven') {
            const input = spec.input ?? {};
            if (!known(input.target, 'input.target')) continue;
            if (!input.channel) { warn('driven needs an `input.channel`', at); continue; }
            const scaleIn = isAngle(input.channel) ? DEG : 1;
            const from = pair(spec.from, [0, 1]).map((v) => v * scaleIn);
            const outputs = [];
            for (const o of spec.outputs ?? []) {
                if (!known(o.target, 'outputs[].target')) continue;
                if (!o.channel) { warn('a driven output needs a `channel`', at); continue; }
                const scaleOut = isAngle(o.channel) ? DEG : 1;
                outputs.push({ target: o.target, channel: o.channel,
                               to: pair(o.to, [0, 1]).map((v) => v * scaleOut) });
            }
            if (!outputs.length) { warn('driven has no usable outputs', at); continue; }
            out.push({ type: 'driven', input: { target: input.target, channel: input.channel },
                       from, outputs, ease: spec.ease ?? 'smooth', weight });
            continue;
        }
        // ik
        if (!known(spec.chain, 'chain') || !known(spec.target, 'target')) continue;
        // `limit` on an `ik` applies to the MIDDLE joint, because that is
        // the one a limit is for: an elbow and a knee are hinges, and
        // stopping them from inverting is the whole use.
        out.push({ type: 'ik', chain: spec.chain, target: spec.target, weight,
                   pole: spec.pole ? spec.pole.map(Number) : [0, 0, -1],
                   limit: Object.keys(limits).length ? limits : null });
    }
    return out;
}

/**
 * The default correctives for the generated humanoid.
 *
 * Two drivers per limb, which is the smallest set that addresses the defect
 * §6 names. The elbow and the knee are the joints where linear blend skinning
 * loses the most volume, and the cheap production answer -- long before
 * corrective blendshapes -- is to let the joint's own angle widen the limb as
 * it closes. Scaling the bone scales every vertex weighted to it, so this
 * costs two channels and no new geometry.
 *
 * ponytail: bone scale, not corrective blendshapes. It restores the volume an
 * elbow loses; it cannot make a crease. Shapes when the engine can author
 * them for the body mesh, which today only the head carries.
 */
export function humanoidCorrectives(as) {
    const out = [];
    for (const side of ['L', 'R']) {
        out.push({
            type: 'driven',
            input: { target: `${as}/fore${side}`, channel: 'rotation.x' },
            from: [0, -110],
            outputs: [
                { target: `${as}/arm${side}`, channel: 'scale.x', to: [1, 1.11] },
                { target: `${as}/arm${side}`, channel: 'scale.z', to: [1, 1.11] },
            ],
        });
        out.push({
            type: 'driven',
            input: { target: `${as}/shin${side}`, channel: 'rotation.x' },
            from: [0, 100],
            outputs: [
                { target: `${as}/thigh${side}`, channel: 'scale.x', to: [1, 1.08] },
                { target: `${as}/thigh${side}`, channel: 'scale.z', to: [1, 1.08] },
            ],
        });
    }
    return out;
}
