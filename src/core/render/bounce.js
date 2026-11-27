/**
 * Bounce light: the set lighting itself.
 *
 * # What was actually missing, after Phase 49
 *
 * [42-RENDER-QUALITY.md](../../../docs/pending/42-RENDER-QUALITY.md) Tier 2
 * lists three routes to global illumination in increasing cost, and the first
 * -- "irradiance from the environment only (spherical harmonics), nearly
 * free" -- **already shipped in Phase 49**, and shipped better than planned:
 * a prefiltered PMREM is a more accurate answer to the same question than an
 * SH9 projection of it, and it provides indirect specular as well as
 * indirect diffuse. Rebuilding it as spherical harmonics would be a
 * downgrade with a longer changelog.
 *
 * What the environment cannot do, at any order of harmonics, is the thing
 * global illumination is *for*: **a red wall making a white floor red**. An
 * environment is a statement about what is infinitely far away. Bounce is a
 * statement about what is in the room, and the room is what the film built.
 *
 * So this is the second route -- baked probes over the set, sampled per
 * object -- and the reason it is cheap here is that the engine renders
 * offline. A cube render per probe, prefiltered once at build time, then free
 * for every frame of the film.
 *
 * # One bounce, and that is the honest number
 *
 * A probe is baked from the scene as DIRECTLY lit, so what it carries is
 * light that has bounced once. Two bounces would mean baking again with the
 * first set of probes applied, which converges and which nothing here has
 * asked for. ponytail: the upgrade is a loop with a stated iteration count,
 * and the place to put it is the bake, not this module.
 *
 * # Opt-in, for the reason Phase 49 is
 *
 * Phase 49 attaches its implicit studio environment to METALS only, weighted
 * by metalness, because lighting dielectrics with a generic grey room took
 * the AK-47's backdrop from 0.44 saturation to 0.17 -- a restyling of fifty
 * finished films to fix a defect in their metals. A probe is not a generic
 * grey room, it is the film's own light, so it is safe to put on a
 * dielectric. It is still a change to every frame of any film that turns it
 * on, so no film gets it without asking.
 *
 * Pure: positions and assignments. The cube renders and the prefilter are in
 * `render/bounce.js`, which is the half that needs a renderer.
 */

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** Cube face sizes a probe may be baked at. A typo must be a diagnostic. */
export const PROBE_SIZES = [16, 32, 64, 128, 256];

/**
 * The default: ONE probe, at the centre of what the film built.
 *
 * One probe is the set's light averaged over the set, which is already a
 * different and better answer than a studio room nobody declared. It also
 * needs no grid, no spacing and no occupancy test -- a probe placed
 * automatically inside a solid would carry that solid's interior colour, and
 * the lazy way to never do that is to not place probes automatically.
 */
export function normalizeBounce(spec, { warn = () => {} } = {}) {
    if (spec == null || spec === false) return null;
    const s = spec === true ? {} : spec;
    if (typeof s !== 'object') {
        warn('`meta.bounce` must be an object, or true for one probe at the '
            + 'centre of the set', 'meta.bounce');
        return null;
    }

    const size = num(s.size, 64);
    if (!PROBE_SIZES.includes(size)) {
        warn(`probe size ${size} is not one of ${PROBE_SIZES.join(', ')}`, 'meta.bounce.size');
        return null;
    }

    let at = null;
    if (s.at != null) {
        if (!Array.isArray(s.at) || !s.at.length) {
            warn('`bounce.at` is a list of [x, y, z] probe positions', 'meta.bounce.at');
            return null;
        }
        at = [];
        for (const [i, p] of s.at.entries()) {
            if (!Array.isArray(p) || p.length !== 3 || p.some((n) => !Number.isFinite(n))) {
                warn(`probe ${i} is not an [x, y, z]`, 'meta.bounce.at');
                return null;
            }
            at.push([p[0], p[1], p[2]]);
        }
    }

    const intensity = num(s.intensity, 1);
    if (intensity < 0) {
        warn(`bounce intensity must not be negative (${intensity})`, 'meta.bounce.intensity');
        return null;
    }

    return {
        at,                                    // null means "one, at the centre"
        size,
        intensity,
        /**
         * Whether a probe also replaces the implicit studio on metals.
         *
         * On by default and it is the bigger half of the look: a metal with
         * nothing to reflect renders black, and what it should be reflecting
         * is the set it is standing in rather than a room from a library.
         */
        metals: s.metals !== false,
        // Near plane for the cube render. Too large clips the floor a probe
        // is sitting above; too small wastes depth precision.
        near: num(s.near, 0.05),
        far: num(s.far, 200),
    };
}

/** The centre of an axis-aligned box, as `[x, y, z]`. */
export function boundsCentre({ min, max }) {
    return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
}

/**
 * Which probe is nearest a point, by index.
 *
 * Squared distance, because a square root cannot change an ordering and this
 * runs once per object per film.
 */
export function nearestProbe(point, positions) {
    let best = -1, bestD = Infinity;
    for (const [i, p] of positions.entries()) {
        const d = (point[0] - p[0]) ** 2 + (point[1] - p[1]) ** 2 + (point[2] - p[2]) ** 2;
        if (d < bestD) { bestD = d; best = i; }
    }
    return best;
}

/**
 * Hand every object the probe nearest it: `[{ id, probe, distance }]`.
 *
 * Returned as a manifest rather than applied, for the same reason
 * `core/render/aov.js` returns the decode rather than the PNG: the assignment
 * is the part that can be wrong, and a list of ids and indices can be checked
 * in Node against no renderer at all.
 */
export function assignProbes(items, positions) {
    if (!positions.length) return [];
    return items.map(({ id, at }) => {
        const probe = nearestProbe(at, positions);
        const p = positions[probe];
        return {
            id,
            probe,
            distance: Math.hypot(at[0] - p[0], at[1] - p[1], at[2] - p[2]),
        };
    });
}

/** The line a render log prints. */
export function bounceReport(bounce, probes, assigned) {
    if (!bounce) return 'bounce: none';
    const far = assigned.reduce((m, a) => Math.max(m, a.distance), 0);
    return `bounce: ${probes.length} probe(s) at ${bounce.size}^2, `
        + `${assigned.length} object(s) assigned, furthest ${far.toFixed(2)} units from `
        + `its probe, intensity ${bounce.intensity}`
        + (bounce.metals ? ' (metals too)' : ' (dielectrics only)');
}
