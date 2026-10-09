/**
 * Particles as a closed-form function of time.
 *
 * Every particle system in a game engine is an integrator: it steps state
 * forward from the last frame. That is exactly what this engine cannot have.
 * Frame N must be a pure function of N -- it is what lets a film be scrubbed,
 * re-rendered, and compared against golden hashes, and it is the same reason
 * smears were built as a compile pass rather than a renderer history buffer.
 *
 * So the position of particle `i` at time `t` is solved, not accumulated:
 *
 *     p(t) = origin + dir_i * speed_i * age + 0.5 * gravity * age^2
 *
 * which is the analytic solution to constant acceleration. Seeking to the
 * middle of a burst gives the identical frame whether or not the frames
 * before it were ever drawn. The cost is that particles cannot collide or
 * respond to anything -- which muzzle flash, smoke, sparks and dust do not
 * need, and which is most of what this idiom is made of.
 *
 * Randomness is a hash of (seed, i, burst), never a generator, because a
 * generator carries state and state is history.
 */

/**
 * Wang hash. One multiply-heavy integer mix; enough decorrelation for
 * scattering particles, and identical in every JS engine because it stays
 * inside 32-bit integer ops.
 */
function hash(n) {
    let x = n | 0;
    x = (x ^ 61) ^ (x >>> 16);
    x = (x + (x << 3)) | 0;
    x ^= x >>> 4;
    x = Math.imul(x, 0x27d4eb2d);
    x ^= x >>> 15;
    return x >>> 0;
}

/** Deterministic unit float for stream `k` of particle `i`. */
const rand = (seed, i, k) => hash(seed * 7919 + i * 131 + k * 2654435761) / 4294967296;

const lerp = (a, b, u) => a + (b - a) * u;
const pair = (v, fallback) => (Array.isArray(v) ? v : [v ?? fallback, v ?? fallback]);

/**
 * Spread a direction into a cone of half-angle `spread` radians.
 *
 * Sampled as sqrt(u) rather than u so particles distribute evenly over the
 * cone's area instead of bunching along its axis -- the same correction a
 * uniform disc sample needs, and visible as a dense spine up the middle
 * without it.
 */
function coneDir([dx, dy, dz], spread, seed, i) {
    const len = Math.hypot(dx, dy, dz) || 1;
    const ax = dx / len, ay = dy / len, az = dz / len;
    if (spread <= 0) return [ax, ay, az];

    // An orthonormal basis around the axis. Cross with whichever cardinal
    // axis the direction is least aligned to, so the cross never degenerates.
    const up = Math.abs(ay) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let ux = up[1] * az - up[2] * ay;
    let uy = up[2] * ax - up[0] * az;
    let uz = up[0] * ay - up[1] * ax;
    const ul = Math.hypot(ux, uy, uz) || 1;
    ux /= ul; uy /= ul; uz /= ul;
    const vx = ay * uz - az * uy;
    const vy = az * ux - ax * uz;
    const vz = ax * uy - ay * ux;

    const theta = rand(seed, i, 1) * Math.PI * 2;
    const r = Math.sqrt(rand(seed, i, 2)) * Math.tan(spread);
    const cx = ax + (ux * Math.cos(theta) + vx * Math.sin(theta)) * r;
    const cy = ay + (uy * Math.cos(theta) + vy * Math.sin(theta)) * r;
    const cz = az + (uz * Math.cos(theta) + vz * Math.sin(theta)) * r;
    const cl = Math.hypot(cx, cy, cz) || 1;
    return [cx / cl, cy / cl, cz / cl];
}

/**
 * Normalise an emitter spec. Kept separate so a compiler can validate a spec
 * once rather than on every one of 1,440 frames.
 */
export function createEmitter(spec = {}) {
    return {
        count: Math.max(0, Math.floor(spec.count ?? 24)),
        at: Array.isArray(spec.at) ? [...spec.at] : [spec.at ?? 0],
        life: pair(spec.life, 0.4),
        speed: pair(spec.speed, 2),
        size: pair(spec.size, 1),
        dir: spec.dir ? [...spec.dir] : [0, 0, 1],
        spread: spec.spread ?? 0.3,
        gravity: spec.gravity ? [...spec.gravity] : [0, 0, 0],
        origin: spec.origin ? [...spec.origin] : [0, 0, 0],
        // Particles released over a window rather than all on one frame. A
        // true instant burst reads as a single popping shell; a muzzle flash
        // wants it, smoke does not.
        stagger: spec.stagger ?? 0,
        spin: spec.spin ?? 0,
        seed: spec.seed ?? 1,
        // Shutter time in seconds. Non-zero makes a particle report the
        // distance it travels while the shutter is open, which is how a
        // supersonic round is drawn honestly: a point moving 715 m/s cannot
        // be a sphere in one frame, it is a streak as long as its own
        // displacement. This is motion blur for a point, solved rather than
        // accumulated over sub-frames.
        shutter: spec.shutter ?? 0,
        // Fade as a power of remaining life. 1 is linear; >1 holds bright
        // then drops away, which is how a flash and a spark actually read.
        fade: spec.fade ?? 1,
    };
}

/**
 * Where every particle is at `tSec`.
 *
 * Returns one entry per particle in a stable order, each carrying `visible`
 * so a caller can drive a fixed pool of meshes without allocating or
 * reordering. A dead particle keeps its slot.
 */
export function emitterState(emitter, tSec) {
    const e = emitter;
    const out = [];
    for (let i = 0; i < e.count; i++) {
        // Each particle belongs to one burst, round-robin, so a 4-burst
        // emitter of 40 particles puts 10 in each without a nested loop.
        const burst = e.at.length ? e.at[i % e.at.length] : 0;
        const index = Math.floor(i / Math.max(1, e.at.length));
        const birth = burst + (e.stagger ? index * e.stagger : 0);
        const life = lerp(e.life[0], e.life[1], rand(e.seed, i, 3));
        const age = tSec - birth;
        if (age < 0 || age >= life) {
            out.push({ visible: false, x: 0, y: 0, z: 0, size: 0, alpha: 0, spin: 0,
                       vx: 0, vy: 0, vz: 0, stretch: 0, age: 0, life });
            continue;
        }
        const speed = lerp(e.speed[0], e.speed[1], rand(e.seed, i, 4));
        const [dx, dy, dz] = coneDir(e.dir, e.spread, e.seed, i);
        const u = age / life;
        // v(t) = dir*speed + g*age, the derivative of the position above.
        const vx = dx * speed + e.gravity[0] * age;
        const vy = dy * speed + e.gravity[1] * age;
        const vz = dz * speed + e.gravity[2] * age;
        out.push({
            visible: true,
            x: e.origin[0] + dx * speed * age + 0.5 * e.gravity[0] * age * age,
            y: e.origin[1] + dy * speed * age + 0.5 * e.gravity[1] * age * age,
            z: e.origin[2] + dz * speed * age + 0.5 * e.gravity[2] * age * age,
            size: lerp(e.size[0], e.size[1], u),
            alpha: Math.pow(1 - u, e.fade),
            spin: e.spin ? (rand(e.seed, i, 5) - 0.5) * 2 * e.spin * age : 0,
            vx, vy, vz,
            // Length of the streak in world units. Zero means "draw me as I
            // am"; the adapter only orients and stretches when it is set.
            stretch: e.shutter ? Math.hypot(vx, vy, vz) * e.shutter : 0,
            age, life,
        });
    }
    return out;
}

/** The window an emitter can possibly show anything in. */
export function emitterSpan(emitter) {
    if (!emitter.count || !emitter.at.length) return null;
    const perBurst = Math.ceil(emitter.count / emitter.at.length);
    const last = Math.max(...emitter.at) + Math.max(0, perBurst - 1) * emitter.stagger;
    return { start: Math.min(...emitter.at), end: last + emitter.life[1] };
}
