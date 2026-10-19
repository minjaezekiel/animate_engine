/**
 * Cloth, as position-based dynamics.
 *
 * Why this exists: the character doc's §6 reads "**Cloth simulation** --
 * clothing is an inflated body, so it has no drape, no folds, no collar
 * standing proud of the neck, and no motion of its own." Inflated clothing
 * stays, because it is the only garment that provably cannot clip through the
 * body; this is the layer on top of it -- a cape, a scarf, a flag, a curtain,
 * a tablecloth -- the pieces whose whole job is to move.
 *
 * ponytail: PBD (Verlet + distance-constraint relaxation), not a mass-spring
 * ODE and not FEM. Verlet with constraint projection is unconditionally
 * stable at any stiffness, which is the one property a film renderer needs:
 * a spring system tuned for a 24 fps step explodes the moment someone renders
 * at 60. Sources: Jakobsen, "Advanced Character Physics" (GDC 2001); Müller
 * et al., "Position Based Dynamics" (2006).
 *
 * Pure: plain arrays, no THREE, no clock. The caller owns the clock and the
 * space -- positions are in whatever frame it pinned the cloth in, and for
 * the backend that is world space, because gravity is.
 */

/**
 * A grid of particles with its distance constraints precomputed.
 *
 * Structural constraints hold the weave, shear constraints (the diagonals)
 * stop the grid folding flat into a rhombus, and bend constraints -- every
 * second neighbour -- are what give the sheet stiffness instead of letting it
 * crumple like a chain of beads. All three are the standard set; a cloth
 * built from structural links alone reads as a net.
 *
 * The first ROW is the pinned edge by default, because that is what a cape, a
 * flag and a curtain all are.
 */
export function makeCloth({
    cols = 12, rows = 12, width = 1, height = 1,
    origin = [0, 0, 0], axis = 'xy', pin = 'top',
} = {}) {
    const n = cols * rows;
    const pos = new Float32Array(n * 3);
    const prev = new Float32Array(n * 3);
    const bind = new Float32Array(n * 3);
    const pinned = new Uint8Array(n);

    // `axis` names the plane the rest shape lies in: 'xy' is a flag hanging
    // in front of the camera, 'xz' a tablecloth.
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const i = r * cols + c;
            const u = cols > 1 ? c / (cols - 1) - 0.5 : 0;
            const v = rows > 1 ? r / (rows - 1) : 0;
            const x = origin[0] + u * width;
            const y = axis === 'xz' ? origin[1] : origin[1] - v * height;
            const z = axis === 'xz' ? origin[2] + v * height : origin[2];
            bind[i * 3] = x; bind[i * 3 + 1] = y; bind[i * 3 + 2] = z;
        }
    }
    pos.set(bind); prev.set(bind);

    for (let c = 0; c < cols; c++) {
        if (pin === 'top') pinned[c] = 1;
        else if (pin === 'corners' && (c === 0 || c === cols - 1)) pinned[c] = 1;
    }
    if (Array.isArray(pin)) for (const i of pin) if (i >= 0 && i < n) pinned[i] = 1;

    const links = [];
    const link = (a, b) => {
        const d = Math.hypot(bind[b * 3] - bind[a * 3], bind[b * 3 + 1] - bind[a * 3 + 1],
                             bind[b * 3 + 2] - bind[a * 3 + 2]);
        if (d > 0) links.push(a, b, d);
    };
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const i = r * cols + c;
            if (c + 1 < cols) link(i, i + 1);                           // structural
            if (r + 1 < rows) link(i, i + cols);
            if (c + 1 < cols && r + 1 < rows) {                         // shear
                link(i, i + cols + 1);
                link(i + 1, i + cols);
            }
            if (c + 2 < cols) link(i, i + 2);                           // bend
            if (r + 2 < rows) link(i, i + 2 * cols);
        }
    }

    const indices = new Uint32Array((cols - 1) * (rows - 1) * 6);
    let k = 0;
    for (let r = 0; r + 1 < rows; r++) {
        for (let c = 0; c + 1 < cols; c++) {
            const i = r * cols + c;
            indices[k++] = i; indices[k++] = i + cols; indices[k++] = i + 1;
            indices[k++] = i + 1; indices[k++] = i + cols; indices[k++] = i + cols + 1;
        }
    }

    return { cols, rows, count: n, pos, prev, bind, pinned,
             links: new Float32Array(links), indices };
}

/** Back to the rest shape, which is also what a rewind needs. */
export function resetCloth(cloth) {
    cloth.pos.set(cloth.bind);
    cloth.prev.set(cloth.bind);
    return cloth;
}

/**
 * Advance the cloth by `dt`, in fixed substeps.
 *
 * Fixed substeps, not one step of `dt`, for the reason every simulator ends
 * up here: the constraint solver's stiffness is per-iteration-per-step, so a
 * variable step changes how stiff the cloth IS. Pinning the substep at 1/120
 * means a film rendered at 24 and the same film at 60 drape the same way.
 *
 * Pinned particles are never moved by this; the caller writes them wherever
 * the bone they hang from has got to, before calling. That is the whole
 * attachment mechanism -- no constraint type, no parenting.
 */
export function stepCloth(cloth, dt, {
    gravity = [0, -9.81, 0], wind = [0, 0, 0], damping = 0.012,
    iterations = 5, colliders = [], substep = 1 / 120, maxSubsteps = 8,
    floor = null,
} = {}) {
    const steps = Math.min(maxSubsteps, Math.max(0, Math.round(dt / substep)));
    for (let s = 0; s < steps; s++) integrate(cloth, substep, gravity, wind, damping,
                                              iterations, colliders, floor);
    return steps;
}

function integrate(cloth, h, gravity, wind, damping, iterations, colliders, floor) {
    const { pos, prev, pinned, links, count } = cloth;
    const h2 = h * h;
    const keep = 1 - damping;
    const ax = gravity[0] + wind[0], ay = gravity[1] + wind[1], az = gravity[2] + wind[2];

    for (let i = 0; i < count; i++) {
        if (pinned[i]) {
            // A pinned particle is wherever the caller put it, and its
            // "velocity" has to be forgotten -- carrying a Verlet history
            // across a teleporting anchor is what makes a cape snap when the
            // shoulder it hangs from cuts to another shot.
            prev[i * 3] = pos[i * 3]; prev[i * 3 + 1] = pos[i * 3 + 1];
            prev[i * 3 + 2] = pos[i * 3 + 2];
            continue;
        }
        for (let a = 0; a < 3; a++) {
            const j = i * 3 + a;
            const x = pos[j];
            const g = a === 0 ? ax : a === 1 ? ay : az;
            pos[j] = x + (x - prev[j]) * keep + g * h2;
            prev[j] = x;
        }
    }

    for (let it = 0; it < iterations; it++) {
        for (let l = 0; l < links.length; l += 3) {
            const a = links[l], b = links[l + 1], rest = links[l + 2];
            const ai = a * 3, bi = b * 3;
            const dx = pos[bi] - pos[ai], dy = pos[bi + 1] - pos[ai + 1], dz = pos[bi + 2] - pos[ai + 2];
            const d = Math.hypot(dx, dy, dz);
            if (d < 1e-9) continue;
            const corr = (d - rest) / d;
            // Weight by which ends are free, so a link to a pinned particle
            // moves the free end by the whole error rather than half of it.
            const fa = pinned[a] ? 0 : (pinned[b] ? 1 : 0.5);
            const fb = pinned[b] ? 0 : (pinned[a] ? 1 : 0.5);
            pos[ai] += dx * corr * fa; pos[ai + 1] += dy * corr * fa; pos[ai + 2] += dz * corr * fa;
            pos[bi] -= dx * corr * fb; pos[bi + 1] -= dy * corr * fb; pos[bi + 2] -= dz * corr * fb;
        }
        for (let i = 0; i < count; i++) {
            if (pinned[i]) continue;
            const j = i * 3;
            for (const col of colliders) {
                const dx = pos[j] - col.at[0], dy = pos[j + 1] - col.at[1], dz = pos[j + 2] - col.at[2];
                const d = Math.hypot(dx, dy, dz);
                if (d >= col.r || d < 1e-9) continue;
                const k = col.r / d;
                pos[j] = col.at[0] + dx * k;
                pos[j + 1] = col.at[1] + dy * k;
                pos[j + 2] = col.at[2] + dz * k;
            }
            if (floor != null && pos[j + 1] < floor) pos[j + 1] = floor;
        }
    }
}

/** The longest link as a fraction of its rest length -- a stretch meter. */
export function maxStretch(cloth) {
    const { pos, links } = cloth;
    let worst = 0;
    for (let l = 0; l < links.length; l += 3) {
        const a = links[l] * 3, b = links[l + 1] * 3, rest = links[l + 2];
        const d = Math.hypot(pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]);
        worst = Math.max(worst, d / rest);
    }
    return worst;
}
