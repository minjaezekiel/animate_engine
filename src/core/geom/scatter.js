/**
 * Scatter: a thousand of something, placed rather than authored.
 *
 * # The limit
 *
 * Everything in a 3D film here is cast by hand. Sixteen set pieces is a
 * reasonable thing to type; four hundred pieces of gravel is not, and a
 * forest is out of the question. So every set in this repository is bare: a
 * concrete floor with nothing on it, because the alternative was four hundred
 * lines of JSON with hand-chosen coordinates, and coordinates chosen by hand
 * look chosen by hand.
 *
 * Two separate problems hide in that sentence, and this module is only the
 * first.
 *
 *   1. **Where do the points go**, such that they look natural and come out
 *      the same on every machine. That is here: pure, seeded arithmetic.
 *   2. **What it costs to draw them.** Four hundred nodes is four hundred
 *      draw calls; one `InstancedMesh` is one. That is the backend's half,
 *      and it is the reason this item was described in
 *      [43-DCC-PARITY.md §4.3](../../../docs/pending/43-DCC-PARITY.md) as
 *      "the item that forces instancing".
 *
 * # Why blue noise and not a random spray
 *
 * Uniform random points clump: at four hundred samples you get pairs almost
 * touching and bald patches the size of a tree. That reads as a mistake,
 * because a real scatter -- stones on a floor, trees competing for light --
 * has a *minimum spacing*. Bridson's Poisson-disc sampling gives exactly
 * that, in O(n), with a hard guarantee this module's test asserts: no two
 * points closer than `radius`.
 *
 * # Why it is pure, and seeded
 *
 * Frame *N* must stay a function of *N*, and a film must render the same on
 * every machine and in every re-render, so the sampler takes a `seed` and
 * uses its own PRNG rather than `Math.random`. Changing the seed is how an
 * author asks for a different arrangement; changing nothing gets the same
 * one, forever.
 *
 * It runs **once, at build time**, in the compiler -- so the points are part
 * of the compiled scene and the backend only uploads them.
 */

/**
 * mulberry32: a 32-bit PRNG in four lines.
 *
 * Chosen for being short, well-distributed enough for point placement, and
 * **exactly reproducible** -- it is integer arithmetic in 32 bits, so every
 * engine agrees to the bit. `Math.random` is none of those things.
 */
export function rng(seed = 1) {
    let a = (seed >>> 0) || 1;
    return () => {
        a |= 0; a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * The spacing that fits about `count` points into an area.
 *
 * Poisson-disc packs to roughly 0.7 points per r-squared; this asks for 0.55,
 * which leaves the sampler room to actually REACH the count asked for. At
 * 0.7 a request for 1,000 placed 920 of them, which is a confusing answer to
 * a plain question. `count` is still a maximum, because an explicit `radius`
 * can make it unreachable.
 */
export function radiusFor(area, count) {
    return Math.sqrt((0.55 * area) / Math.max(1, count));
}

/**
 * Bridson's Poisson-disc sampling over a `width` x `depth` rectangle.
 *
 * Returns `[x, z]` pairs centred on the origin, so the caller adds its own
 * offset. The background grid is what makes it linear: a cell of
 * `radius / sqrt(2)` holds at most one sample, so a candidate is checked
 * against the 5x5 cells around it rather than against every point placed.
 */
export function poissonPoints({ width, depth, radius, seed = 1, k = 30 }) {
    const random = rng(seed);
    const cell = radius / Math.SQRT2;
    const cols = Math.max(1, Math.ceil(width / cell));
    const rows = Math.max(1, Math.ceil(depth / cell));
    const grid = new Int32Array(cols * rows).fill(-1);
    const points = [];
    const active = [];

    const index = (x, z) => Math.min(rows - 1, Math.floor(z / cell)) * cols
                          + Math.min(cols - 1, Math.floor(x / cell));
    const fits = (x, z) => {
        if (x < 0 || z < 0 || x >= width || z >= depth) return false;
        const cx = Math.floor(x / cell), cz = Math.floor(z / cell);
        for (let j = Math.max(0, cz - 2); j <= Math.min(rows - 1, cz + 2); j++) {
            for (let i = Math.max(0, cx - 2); i <= Math.min(cols - 1, cx + 2); i++) {
                const p = grid[j * cols + i];
                if (p < 0) continue;
                const dx = points[p][0] - x, dz = points[p][1] - z;
                if (dx * dx + dz * dz < radius * radius) return false;
            }
        }
        return true;
    };
    const place = (x, z) => {
        grid[index(x, z)] = points.length;
        points.push([x, z]);
        active.push(points.length - 1);
    };

    place(random() * width, random() * depth);
    while (active.length) {
        // A deterministic pick from the active list: the order points are
        // retired decides the whole pattern, so it cannot be `pop()` alone
        // (that grows in one direction) nor `Math.random`.
        const slot = Math.floor(random() * active.length);
        const [px, pz] = points[active[slot]];
        let placed = false;
        for (let tries = 0; tries < k; tries++) {
            const angle = random() * Math.PI * 2;
            const dist = radius * (1 + random());          // between r and 2r
            const x = px + Math.cos(angle) * dist;
            const z = pz + Math.sin(angle) * dist;
            if (!fits(x, z)) continue;
            place(x, z);
            placed = true;
            break;
        }
        if (!placed) active.splice(slot, 1);
    }
    // Centre on the origin: a scatter is positioned by its node, like
    // everything else in a film.
    return points.map(([x, z]) => [x - width / 2, z - depth / 2]);
}

/** Fisher-Yates with the same seeded stream, so a subset is not biased. */
function shuffled(items, random) {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
}

/**
 * `{ count, area, seed, scale, rotY, tilt }` -> placed instances.
 *
 * Each is `{ at, rot, scale }` in the scatter node's own space, which is
 * what the backend composes into one matrix per instance.
 *
 * The three jitters are not decoration: four hundred identical stones in
 * four hundred different places still read as four hundred copies of one
 * stone. `rotY` (degrees, default a full turn) hides the repeat, `scale`
 * (a `[min, max]` range) breaks the silhouette, and `tilt` (degrees off
 * vertical) stops them all standing to attention.
 *
 * `count` is a **maximum**: Poisson-disc stops when nothing else fits. When
 * more points fit than were asked for, the subset is shuffled rather than
 * truncated, because the sampler grows outward from its first point and the
 * first `count` of them are a blob, not a scatter.
 */
export function scatterPoints({
    count = 100, area = [1, 1], seed = 1, radius = null,
    scale = 1, rotY = 360, tilt = 0, y = 0,
} = {}) {
    const width = Math.abs(Number(area[0]) || 1);
    const depth = Math.abs(Number(area[1] ?? area[0]) || 1);
    const n = Math.max(0, Math.floor(count));
    if (!n) return [];
    const r = Number(radius) > 0 ? Number(radius) : radiusFor(width * depth, n);
    const raw = poissonPoints({ width, depth, radius: r, seed });

    // A second stream for the jitter. One stream would make a stone's
    // rotation depend on how many candidates the sampler happened to
    // reject before placing it, which is reproducible but impossible to
    // reason about -- and it would mean nudging `tilt` changed the layout.
    const jitter = rng(seed ^ 0x9e3779b9);
    const picked = raw.length > n ? shuffled(raw, jitter).slice(0, n) : raw;
    const [lo, hi] = Array.isArray(scale) ? scale : [scale, scale];

    return picked.map(([x, z]) => {
        const s = lo + (hi - lo) * jitter();
        return {
            at: [x, y, z],
            rot: [(jitter() * 2 - 1) * tilt, jitter() * rotY, (jitter() * 2 - 1) * tilt],
            scale: [s, s, s],
        };
    });
}

/** The closest two points come, for the test that says this is blue noise. */
export function minimumSpacing(instances) {
    let best = Infinity;
    for (let i = 0; i < instances.length; i++) {
        for (let j = i + 1; j < instances.length; j++) {
            const dx = instances[i].at[0] - instances[j].at[0];
            const dz = instances[i].at[2] - instances[j].at[2];
            best = Math.min(best, Math.hypot(dx, dz));
        }
    }
    return best;
}
