/**
 * Rigid bodies: drop this, let it land.
 *
 * The design, the scope boundary and the reasoning behind every constant in
 * this file are in
 * [44-RIGID-BODIES.md](../../../docs/pending/44-RIGID-BODIES.md). The short
 * version:
 *
 * **It bakes.** The solver runs once, at build time, and its output is
 * ordinary keyframe tracks -- a `position` track and a `quaternion` track,
 * the same shape `clipToTracks` emits for an imported clip. After the bake
 * there is no physics in the engine at all, which is what keeps frame *N* a
 * pure function of *N*: a live solver's state at frame 600 depends on having
 * integrated frames 0 to 599, so seeking would be impossible and two renders
 * of one file would differ.
 *
 * **It is pure.** Numbers in, numbers out. No THREE, no DOM, no dependency --
 * which is why the five proofs in that document's §6 are unit tests rather
 * than screenshots, and it is the reason `cannon-es` was declined despite
 * being free: `src/core/` has no dependencies, and a solver's *determinism*
 * is a property we can test in our own arithmetic and would have to assume in
 * someone else's.
 *
 * **Tier 1 scope**: gravity, linear and angular motion, sphere and box
 * against a static half-space, sphere against sphere, Coulomb friction,
 * resting contact and sleeping. **Box against box is deliberately not here**
 * -- it needs a contact manifold, which is most of a physics engine, and a
 * stack is the only thing that needs it. No film has asked for a stack.
 */

export const BODY_SHAPES = ['box', 'sphere'];

/**
 * Contact constants. Every one of these is a failure mode with a number
 * attached, and they are exported so a test can pin them.
 *
 *   SLOP       penetration allowed before anything pushes back. Without an
 *              allowance the correction fights gravity every step and the
 *              body buzzes.
 *   BAUMGARTE  fraction of the excess penetration corrected per step. At 1
 *              the body is flicked off the floor; at 0 it sinks.
 *   REST_SPEED below this closing speed a contact is RESTING, and
 *              restitution is switched off -- a ball bouncing at 1 mm/s
 *              should stop, not bounce forever at 1 mm.
 *   SLEEP_*    a body this slow for this long is frozen. This is what makes
 *              a hundred settled cases free, and what keeps the bake short:
 *              a sleeping body writes no more keys.
 */
export const CONTACT = {
    SLOP: 0.0005,              // 0.5 mm
    BAUMGARTE: 0.2,
    REST_SPEED: 0.05,          // m/s
    SLEEP_LINEAR: 0.02,        // m/s
    SLEEP_ANGULAR: 0.2,        // rad/s
    SLEEP_TIME: 0.3,           // s
};

// --------------------------------------------------------------- vectors
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1],
                         a[2] * b[0] - a[0] * b[2],
                         a[0] * b[1] - a[1] * b[0]];
const length = (a) => Math.hypot(a[0], a[1], a[2]);
const normalize = (a) => {
    const l = length(a);
    return l > 1e-12 ? scale(a, 1 / l) : [0, 1, 0];
};

// ----------------------------------------------------------- quaternions
/** Rotate `v` by the unit quaternion `q = [x, y, z, w]`. */
export function rotateByQuat(q, v) {
    const [x, y, z, w] = q;
    const t = scale(cross([x, y, z], v), 2);
    return add(add(v, scale(t, w)), cross([x, y, z], t));
}

/**
 * Integrate an orientation by an angular velocity, and RENORMALISE.
 *
 * `dq/dt = 0.5 * omega * q` with omega as a pure quaternion. The
 * renormalisation is not tidiness: without it the quaternion's length drifts
 * with every step, a non-unit quaternion is a rotation *and a scale*, and a
 * tumbling body slowly shrinks. That is the silent-black class of defect this
 * repository has shipped four times, in a form nobody would look for.
 */
export function integrateQuat(q, omega, dt) {
    const [x, y, z, w] = q;
    const [ox, oy, oz] = omega;
    const half = dt * 0.5;
    const nx = x + half * (ox * w + oy * z - oz * y);
    const ny = y + half * (oy * w + oz * x - ox * z);
    const nz = z + half * (oz * w + ox * y - oy * x);
    const nw = w - half * (ox * x + oy * y + oz * z);
    const l = Math.hypot(nx, ny, nz, nw) || 1;
    return [nx / l, ny / l, nz / l, nw / l];
}

/**
 * Inverse inertia, in WORLD space: `R * Iinv_body * R^T`.
 *
 * The body-space tensor is diagonal for both shapes here, so this is nine
 * multiplies rather than a matrix product. It has to be re-derived every
 * step, because a box that has rolled onto its edge resists rotation
 * differently about the same world axis -- which is most of what makes a
 * tumble read as a solid object rather than a spinning sprite.
 */
function worldInverseInertia(q, inv) {
    const r = [rotateByQuat(q, [1, 0, 0]), rotateByQuat(q, [0, 1, 0]), rotateByQuat(q, [0, 0, 1])];
    const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            m[i][j] = r[0][i] * inv[0] * r[0][j]
                    + r[1][i] * inv[1] * r[1][j]
                    + r[2][i] * inv[2] * r[2][j];
        }
    }
    return m;
}

const applyMat3 = (m, v) => [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
];

/**
 * A body spec -> solver state.
 *
 * `mass: 0` means static, which is how a body opts out of gravity without
 * becoming a surface. The inertia is the textbook tensor for the shape:
 * `m/12 * (h^2 + d^2, ...)` for a box, `2/5 m r^2` for a sphere.
 */
export function makeBody(spec = {}) {
    const shape = BODY_SHAPES.includes(spec.shape) ? spec.shape : 'box';
    const size = Array.isArray(spec.size) ? spec.size.map(Math.abs) : [0.1, 0.1, 0.1];
    const radius = Math.abs(Number(spec.radius) || Math.max(...size) / 2);
    const mass = Math.max(0, Number(spec.mass ?? 1));
    const invMass = mass > 0 ? 1 / mass : 0;
    let inertia;
    if (shape === 'sphere') {
        const i = 0.4 * mass * radius * radius;
        inertia = [i, i, i];
    } else {
        const [w, h, d] = size;
        inertia = [mass * (h * h + d * d) / 12,
                   mass * (w * w + d * d) / 12,
                   mass * (w * w + h * h) / 12];
    }
    return {
        id: spec.id ?? 'body',
        shape, size, radius, mass, invMass,
        invInertia: inertia.map((i) => (i > 0 ? 1 / i : 0)),
        at: [...(spec.at ?? [0, 0, 0])],
        q: spec.q ? [...spec.q] : [0, 0, 0, 1],
        v: [...(spec.velocity ?? [0, 0, 0])],
        w: [...(spec.spin ?? [0, 0, 0])],
        restitution: Math.min(1, Math.max(0, Number(spec.restitution ?? 0.3))),
        friction: Math.max(0, Number(spec.friction ?? 0.4)),
        /** Seconds before this body is released; until then it does not move. */
        start: Math.max(0, Number(spec.start ?? 0)),
        sleeping: false,
        still: 0,
        drift: 0,
        twist: 0,
        /** Where it was at the last sleep check. See the sleep block. */
        lastAt: [...(spec.at ?? [0, 0, 0])],
        lastQ: spec.q ? [...spec.q] : [0, 0, 0, 1],
    };
}

/** `{ normal, offset }`, or a node's top face measured from its own box. */
export function makeSurface(spec = {}) {
    return {
        normal: normalize(spec.normal ?? [0, 1, 0]),
        offset: Number(spec.offset) || 0,
        restitution: spec.restitution == null ? null : Number(spec.restitution),
        friction: spec.friction == null ? null : Number(spec.friction),
    };
}

/** The eight corners of a box, in world space. */
function boxCorners(body) {
    const [w, h, d] = body.size.map((s) => s / 2);
    const out = [];
    for (const sx of [-1, 1]) {
        for (const sy of [-1, 1]) {
            for (const sz of [-1, 1]) {
                out.push(add(body.at, rotateByQuat(body.q, [sx * w, sy * h, sz * d])));
            }
        }
    }
    return out;
}

/**
 * Contacts between one body and the static world.
 *
 * A surface is a **half-space**, not a very heavy body: the test is one dot
 * product, it cannot tunnel, and resting on it is stable. Treating the floor
 * as a body with infinite mass is the usual way to make a floor jitter.
 */
function surfaceContacts(body, surfaces) {
    const out = [];
    for (const s of surfaces) {
        if (body.shape === 'sphere') {
            const depth = body.radius - (dot(s.normal, body.at) - s.offset);
            if (depth > 0) {
                out.push({ s, n: s.normal, depth,
                           r: scale(s.normal, -body.radius) });
            }
            continue;
        }
        // A box touches a plane at its corners, which is what makes it
        // TOPPLE: two corners down and the impulse pair is a torque.
        for (const corner of boxCorners(body)) {
            const depth = s.offset - dot(s.normal, corner);
            if (depth > 0) out.push({ s, n: s.normal, depth, r: sub(corner, body.at) });
        }
    }
    return out;
}

/** Sphere against sphere: exact, and the collision-maths series' own case. */
function pairContact(a, b) {
    if (a.shape !== 'sphere' || b.shape !== 'sphere') return null;
    const delta = sub(b.at, a.at);
    const dist = length(delta);
    const depth = a.radius + b.radius - dist;
    if (depth <= 0) return null;
    const n = dist > 1e-12 ? scale(delta, 1 / dist) : [0, 1, 0];
    return { a, b, n, depth, ra: scale(n, a.radius), rb: scale(n, -b.radius) };
}

/** Velocity of the material point at `r` (an offset from the centre of mass). */
const pointVelocity = (body, r) => add(body.v, cross(body.w, r));

function applyImpulse(body, r, impulse, worldInv) {
    if (body.invMass === 0 || body.sleeping) return;
    body.v = add(body.v, scale(impulse, body.invMass));
    body.w = add(body.w, applyMat3(worldInv, cross(r, impulse)));
}

/**
 * One contact, resolved at the velocity level, with friction.
 *
 * Normal first, then a tangential impulse clamped to Coulomb's `mu * jn`:
 * without friction everything slides forever, a box never topples (it needs
 * a tangential force at the corner to rotate about it), and nothing reads as
 * heavy.
 *
 * Restitution is switched off below `REST_SPEED`, because a ball bouncing at
 * a millimetre a second should stop.
 *
 * **No positional bias here.** Folding the penetration correction into the
 * normal impulse -- textbook Baumgarte -- puts energy into the body, and the
 * first version of this file did exactly that: a ball dropped from 1.000 m at
 * `restitution: 1` came back to 1.281, then 1.349, then 1.473, climbing
 * forever. Penetration is corrected by `correctPositions` instead, which
 * moves bodies and never touches their velocity.
 */
function resolveContact({ n, depth, bodyA, rA, bodyB, rB, restitution, friction }) {
    const invA = bodyA ? worldInverseInertia(bodyA.q, bodyA.invInertia) : null;
    const invB = bodyB ? worldInverseInertia(bodyB.q, bodyB.invInertia) : null;
    const velA = bodyA ? pointVelocity(bodyA, rA) : [0, 0, 0];
    const velB = bodyB ? pointVelocity(bodyB, rB) : [0, 0, 0];
    const rel = sub(velA, velB);
    const vn = dot(rel, n);

    let k = 0;
    if (bodyA) k += bodyA.invMass + dot(n, cross(applyMat3(invA, cross(rA, n)), rA));
    if (bodyB) k += bodyB.invMass + dot(n, cross(applyMat3(invB, cross(rB, n)), rB));
    if (k <= 1e-12) return;

    const bounce = -vn > CONTACT.REST_SPEED ? restitution : 0;
    const jn = (-(1 + bounce) * vn) / k;
    if (jn <= 0) return;                    // separating: nothing to do

    const normalImpulse = scale(n, jn);
    if (bodyA) applyImpulse(bodyA, rA, normalImpulse, invA);
    if (bodyB) applyImpulse(bodyB, rB, scale(normalImpulse, -1), invB);

    // Friction, along the tangent of the post-impulse relative velocity.
    const relAfter = sub(bodyA ? pointVelocity(bodyA, rA) : [0, 0, 0],
                         bodyB ? pointVelocity(bodyB, rB) : [0, 0, 0]);
    const tangentVel = sub(relAfter, scale(n, dot(relAfter, n)));
    const speed = length(tangentVel);
    if (speed < 1e-9 || friction <= 0) return;
    const t = scale(tangentVel, 1 / speed);
    let kt = 0;
    if (bodyA) kt += bodyA.invMass + dot(t, cross(applyMat3(invA, cross(rA, t)), rA));
    if (bodyB) kt += bodyB.invMass + dot(t, cross(applyMat3(invB, cross(rB, t)), rB));
    if (kt <= 1e-12) return;
    const jt = Math.min(speed / kt, friction * jn);
    const frictionImpulse = scale(t, -jt);
    if (bodyA) applyImpulse(bodyA, rA, frictionImpulse, invA);
    if (bodyB) applyImpulse(bodyB, rB, scale(frictionImpulse, -1), invB);
}

/**
 * Push overlapping bodies apart, without touching their velocity.
 *
 * This is the half of contact resolution that is about POSITION, kept
 * separate because mixing it into the impulse is what made the first version
 * of this solver a perpetual-motion machine. Only the penetration beyond
 * `SLOP` is corrected, and only `BAUMGARTE` of it per step: at 1 the body is
 * flicked off the floor, at 0 it sinks, and the allowance is what stops the
 * correction fighting gravity every step and buzzing.
 *
 * Translation only. Rotating a box out of a floor is what a full solver does
 * with its manifold, and the torque that makes a box settle flat comes from
 * the friction impulses at its corners rather than from here.
 */
function correctPositions(body, contacts) {
    if (body.invMass === 0 || body.sleeping) return;
    for (const c of contacts) {
        const excess = Math.max(0, c.depth - CONTACT.SLOP);
        if (excess <= 0) continue;
        body.at = add(body.at, scale(c.n, excess * CONTACT.BAUMGARTE));
    }
}

/**
 * Simulate, and hand back one sample per body per output frame.
 *
 * `step` is the solver's fixed substep and `fps` the sampling rate: a 24 fps
 * frame is 41.7 ms, at which a falling body moves 8.5 mm in one step and
 * would pass straight through a 10 mm floor with no contact ever detected.
 * Ten substeps per frame is the cheap answer to tunnelling, and it is why
 * this is a bake -- nobody would pay it per frame.
 *
 * Returns `{ id, samples: [{ t, at, q, sleeping }] }` per body. Numbers in,
 * numbers out: this function does not know what a film is.
 */
export function simulateBodies({
    bodies = [], surfaces = [], gravity = [0, -9.81, 0],
    step = 0.004, until = 2, fps = 24, iterations = 8,
    maxSteps = 200_000,
} = {}) {
    const dt = Math.min(0.05, Math.max(1e-4, Number(step) || 0.004));
    const state = bodies.map((b) => (b.invMass === undefined ? makeBody(b) : b));
    const walls = surfaces.map((s) => (s.normal && s.offset !== undefined ? s : makeSurface(s)));
    const frames = Math.max(1, Math.round(until * fps));
    /**
     * A resting body cannot be slower than one step of gravity.
     *
     * Each substep adds `g * dt` to the velocity and the contact takes it
     * back, so a body at rest reads about 19.6 mm/s at a 2 ms step -- just
     * under the 20 mm/s threshold, which is near enough that a box which
     * landed with any rotation at all never slept: it sat still, to 30
     * microns a frame, for six seconds, being integrated the whole time.
     */
    const sleepSpeed = Math.max(CONTACT.SLEEP_LINEAR, 2 * length(gravity) * dt);
    const out = state.map((b) => ({ id: b.id, samples: [] }));

    let t = 0;
    let steps = 0;
    const sample = (time) => {
        for (const [i, b] of state.entries()) {
            out[i].samples.push({ t: +time.toFixed(6), at: [...b.at], q: [...b.q],
                                  // Carried so the compiler can say "this body
                                  // was still moving when the bake ended",
                                  // which renders as a case frozen mid-air.
                                  speed: length(b.v), spin: length(b.w),
                                  sleeping: b.sleeping });
        }
    };
    sample(0);

    for (let frame = 1; frame <= frames; frame++) {
        const frameEnd = frame / fps;
        while (t < frameEnd - 1e-9 && steps < maxSteps) {
            const h = Math.min(dt, frameEnd - t);
            // --- integrate
            for (const b of state) {
                if (b.invMass === 0 || b.sleeping || t + 1e-9 < b.start) continue;
                b.v = add(b.v, scale(gravity, h));
                b.at = add(b.at, scale(b.v, h));
                b.q = integrateQuat(b.q, b.w, h);
            }
            // --- resolve
            for (let pass = 0; pass < iterations; pass++) {
                for (const b of state) {
                    if (b.invMass === 0 || b.sleeping || t + 1e-9 < b.start) continue;
                    const contacts = surfaceContacts(b, walls);
                    for (const c of contacts) {
                        resolveContact({
                            n: c.n, depth: c.depth, bodyA: b, rA: c.r, bodyB: null, rB: null,
                            restitution: c.s.restitution ?? b.restitution,
                            friction: c.s.friction ?? b.friction,
                        });
                    }
                    if (pass === iterations - 1) correctPositions(b, contacts);
                }
                for (let i = 0; i < state.length; i++) {
                    for (let j = i + 1; j < state.length; j++) {
                        const c = pairContact(state[i], state[j]);
                        if (!c) continue;
                        // A moving body wakes what it hits, or a case would
                        // bounce off a settled one as if off the air.
                        if (state[i].sleeping || state[j].sleeping) {
                            state[i].sleeping = state[j].sleeping = false;
                            state[i].still = state[j].still = 0;
                            state[i].drift = state[j].drift = 0;
                            state[i].twist = state[j].twist = 0;
                        }
                        resolveContact({
                            n: scale(c.n, -1), depth: c.depth,
                            bodyA: state[i], rA: c.ra, bodyB: state[j], rB: c.rb,
                            restitution: Math.min(state[i].restitution, state[j].restitution),
                            friction: Math.max(state[i].friction, state[j].friction),
                        });
                        if (pass === iterations - 1) {
                            // Shared between the two, by inverse mass: a case
                            // bouncing off a boulder moves, the boulder does not.
                            const total = state[i].invMass + state[j].invMass;
                            const excess = Math.max(0, c.depth - CONTACT.SLOP) * CONTACT.BAUMGARTE;
                            if (total > 0 && excess > 0) {
                                state[i].at = add(state[i].at,
                                    scale(c.n, -excess * state[i].invMass / total));
                                state[j].at = add(state[j].at,
                                    scale(c.n, excess * state[j].invMass / total));
                            }
                        }
                    }
                }
            }
            /**
             * --- sleep, judged by how far the body MOVED
             *
             * Not by its instantaneous velocity, which is the obvious test
             * and the wrong one: at rest, every substep adds `g * dt` to the
             * velocity and the contact takes it straight back, so a settled
             * box reads 7-9 mm/s of linear and 0.20-0.25 rad/s of angular
             * velocity forever -- right on the thresholds. Measured that way
             * a box that landed with any rotation at all never slept. It sat
             * still to thirty microns a frame for six seconds, being
             * integrated the whole time.
             *
             * Displacement answers the question actually being asked: has
             * this body moved? And it is accumulated over the whole window
             * rather than tested per step, because a box resting on four
             * corners micro-rocks: it turns 8e-5 radians in a typical step
             * and 5e-4 in the occasional one, and a per-step test reset the
             * timer on every spike so the window never closed. The budget is
             * the same thresholds times the window -- 6 mm of drift and 3.4
             * degrees of twist in 0.3 s -- which is a thing one can picture.
             */
            for (const b of state) {
                if (b.invMass === 0 || b.sleeping) continue;
                /**
                 * A body waiting for its `start` has not moved, which is not
                 * the same as having settled. Without this it falls asleep
                 * 0.3 s before it is born and never wakes: in the AK-47 film
                 * the first three cases ejected and the other five -- every
                 * one released later than `SLEEP_TIME` -- sat at the port for
                 * the rest of the film.
                 */
                if (t + 1e-9 < b.start) { b.still = 0; b.drift = 0; b.twist = 0; continue; }
                const moved = length(sub(b.at, b.lastAt));
                const turned = 2 * Math.acos(Math.min(1, Math.abs(
                    b.q[0] * b.lastQ[0] + b.q[1] * b.lastQ[1]
                    + b.q[2] * b.lastQ[2] + b.q[3] * b.lastQ[3])));
                b.lastAt = [...b.at];
                b.lastQ = [...b.q];
                b.still += h;
                b.drift += moved;
                b.twist += turned;
                if (b.drift > sleepSpeed * CONTACT.SLEEP_TIME
                    || b.twist > CONTACT.SLEEP_ANGULAR * CONTACT.SLEEP_TIME) {
                    b.still = 0;
                    b.drift = 0;
                    b.twist = 0;
                } else if (b.still >= CONTACT.SLEEP_TIME) {
                    b.sleeping = true;
                    b.v = [0, 0, 0];
                    b.w = [0, 0, 0];
                }
            }
            t += h;
            steps++;
        }
        sample(frameEnd);
    }
    return out;
}

/** Kinetic plus potential energy, for the test that says the integrator works. */
export function energyOf(body, { gravity = [0, -9.81, 0], datum = 0 } = {}) {
    const linear = 0.5 * body.mass * dot(body.v, body.v);
    const inv = body.invInertia;
    const local = rotateByQuat([-body.q[0], -body.q[1], -body.q[2], body.q[3]], body.w);
    const angular = 0.5 * (local[0] * local[0] / (inv[0] || Infinity)
                         + local[1] * local[1] / (inv[1] || Infinity)
                         + local[2] * local[2] / (inv[2] || Infinity));
    const height = body.at[1] - datum;
    return linear + angular + body.mass * Math.abs(gravity[1]) * height;
}

/** Angular momentum in world space: the quantity a free body must conserve. */
export function angularMomentum(body) {
    const conj = [-body.q[0], -body.q[1], -body.q[2], body.q[3]];
    const local = rotateByQuat(conj, body.w);
    const L = local.map((x, i) => (body.invInertia[i] > 0 ? x / body.invInertia[i] : 0));
    return rotateByQuat(body.q, L);
}
