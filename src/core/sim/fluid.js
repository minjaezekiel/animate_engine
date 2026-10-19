/**
 * Fluid: a 2D grid solver for smoke, steam, ink and dust.
 *
 * Why this exists: the engine's particles are a CLOSED FORM -- `emitterState`
 * evaluates position as a function of time, which is what makes them free and
 * deterministic, and also what makes them unable to swirl. A puff of smoke
 * that curls back on itself, an ink drop that blooms, steam that rolls off a
 * surface: all of those are the velocity field acting on itself, and no
 * closed form has one.
 *
 * ponytail: Jos Stam's "Stable Fluids" / "Real-Time Fluid Dynamics for
 * Games" -- semi-Lagrangian advection, Gauss-Seidel diffusion, and a
 * projection step to keep the field divergence-free. It is the smallest
 * solver that is actually a fluid, it is unconditionally stable at any
 * timestep, and it is about a hundred lines. The ceiling is in the name: it
 * is a GRID, and a 2D one, so what it produces is a card -- a plane facing
 * the camera carrying a density texture, which is how most smoke in most
 * shots is done anyway. Volumetric smoke, free-surface liquid and SPH splash
 * are a different project.
 *
 * Pure: plain typed arrays, no THREE, no canvas, no clock. `fluidToRGBA`
 * hands back bytes the caller can put straight into a 2D context, which is
 * the texture path [SceneAdapter](../../backends/three3d/SceneAdapter.js)
 * already has for slides.
 */

/**
 * `n` is the interior resolution; the grid is (n+2)^2 with a one-cell border
 * that carries the boundary condition. That border is the whole reason the
 * indexing looks the way it does, and dropping it is what makes a naive
 * solver leak density out of the domain.
 */
export function makeFluid({ n = 48 } = {}) {
    const size = (n + 2) * (n + 2);
    const f32 = () => new Float32Array(size);
    return { n, size, u: f32(), v: f32(), u0: f32(), v0: f32(), d: f32(), d0: f32() };
}

export function resetFluid(f) {
    for (const a of [f.u, f.v, f.u0, f.v0, f.d, f.d0]) a.fill(0);
    return f;
}

const IX = (n, i, j) => i + (n + 2) * j;

/**
 * Inject density and velocity in a disc.
 *
 * `x` and `y` are 0..1 across the grid, so a film names a source in the
 * fraction of the card it comes from and the resolution can change without
 * moving it.
 */
export function addSource(f, { x = 0.5, y = 0.1, radius = 0.06,
                               amount = 1, vx = 0, vy = 0 } = {}) {
    const { n, d, u, v } = f;
    const cx = x * n, cy = y * n, r = Math.max(0.5, radius * n);
    const lo = Math.max(1, Math.floor(cx - r)), hi = Math.min(n, Math.ceil(cx + r));
    const lov = Math.max(1, Math.floor(cy - r)), hiv = Math.min(n, Math.ceil(cy + r));
    for (let j = lov; j <= hiv; j++) {
        for (let i = lo; i <= hi; i++) {
            const dx = i - cx, dy = j - cy;
            const q = Math.hypot(dx, dy) / r;
            if (q > 1) continue;
            // Smooth falloff: a hard disc of density advects as a disc and
            // reads as a dropped coin rather than as a plume.
            const w = (1 - q) * (1 - q);
            const k = IX(n, i, j);
            d[k] += amount * w;
            u[k] += vx * w;
            v[k] += vy * w;
        }
    }
    return f;
}

/**
 * Boundary condition. `b` is 0 for a scalar, 1 for the x velocity, 2 for y:
 * velocity REFLECTS at a wall and density merely stops, and swapping the two
 * is what makes smoke either stick to the edges or pour through them.
 */
function setBounds(n, b, x) {
    for (let i = 1; i <= n; i++) {
        x[IX(n, 0, i)] = b === 1 ? -x[IX(n, 1, i)] : x[IX(n, 1, i)];
        x[IX(n, n + 1, i)] = b === 1 ? -x[IX(n, n, i)] : x[IX(n, n, i)];
        x[IX(n, i, 0)] = b === 2 ? -x[IX(n, i, 1)] : x[IX(n, i, 1)];
        x[IX(n, i, n + 1)] = b === 2 ? -x[IX(n, i, n)] : x[IX(n, i, n)];
    }
    x[IX(n, 0, 0)] = 0.5 * (x[IX(n, 1, 0)] + x[IX(n, 0, 1)]);
    x[IX(n, 0, n + 1)] = 0.5 * (x[IX(n, 1, n + 1)] + x[IX(n, 0, n)]);
    x[IX(n, n + 1, 0)] = 0.5 * (x[IX(n, n, 0)] + x[IX(n, n + 1, 1)]);
    x[IX(n, n + 1, n + 1)] = 0.5 * (x[IX(n, n, n + 1)] + x[IX(n, n + 1, n)]);
}

/** Gauss-Seidel relaxation, the inner solve both diffusion and projection need. */
function linearSolve(n, b, x, x0, a, c, iterations) {
    const inv = 1 / c;
    for (let k = 0; k < iterations; k++) {
        for (let j = 1; j <= n; j++) {
            for (let i = 1; i <= n; i++) {
                const q = IX(n, i, j);
                x[q] = (x0[q] + a * (x[q - 1] + x[q + 1] + x[q - (n + 2)] + x[q + (n + 2)])) * inv;
            }
        }
        setBounds(n, b, x);
    }
}

/**
 * Semi-Lagrangian advection: for each cell, trace BACKWARD along the velocity
 * and sample where the stuff came from. Tracing forward and scattering is the
 * version that is unstable, loses mass and was the reason this method was
 * published.
 */
function advect(n, b, dst, src, u, v, dt) {
    const dt0 = dt * n;
    for (let j = 1; j <= n; j++) {
        for (let i = 1; i <= n; i++) {
            const q = IX(n, i, j);
            let x = i - dt0 * u[q];
            let y = j - dt0 * v[q];
            if (x < 0.5) x = 0.5; if (x > n + 0.5) x = n + 0.5;
            if (y < 0.5) y = 0.5; if (y > n + 0.5) y = n + 0.5;
            const i0 = Math.floor(x), j0 = Math.floor(y);
            const s1 = x - i0, s0 = 1 - s1, t1 = y - j0, t0 = 1 - t1;
            dst[q] = s0 * (t0 * src[IX(n, i0, j0)] + t1 * src[IX(n, i0, j0 + 1)])
                   + s1 * (t0 * src[IX(n, i0 + 1, j0)] + t1 * src[IX(n, i0 + 1, j0 + 1)]);
        }
    }
    setBounds(n, b, dst);
}

/** Subtract the gradient field, which is what makes the flow incompressible. */
function project(n, u, v, p, div, iterations) {
    const h = 1 / n;
    for (let j = 1; j <= n; j++) {
        for (let i = 1; i <= n; i++) {
            const q = IX(n, i, j);
            div[q] = -0.5 * h * (u[q + 1] - u[q - 1] + v[q + (n + 2)] - v[q - (n + 2)]);
            p[q] = 0;
        }
    }
    setBounds(n, 0, div); setBounds(n, 0, p);
    linearSolve(n, 0, p, div, 1, 4, iterations);
    for (let j = 1; j <= n; j++) {
        for (let i = 1; i <= n; i++) {
            const q = IX(n, i, j);
            u[q] -= 0.5 * (p[q + 1] - p[q - 1]) / h;
            v[q] -= 0.5 * (p[q + (n + 2)] - p[q - (n + 2)]) / h;
        }
    }
    setBounds(n, 1, u); setBounds(n, 2, v);
}

/**
 * One step.
 *
 * `buoyancy` is the one piece of physics Stam's games paper leaves out and
 * smoke cannot do without: hot smoke rises because it is less dense than the
 * air, so density itself has to push the velocity field upward. Without it a
 * plume drifts wherever its initial velocity pointed and then stops, which
 * reads as a smear.
 *
 * `dissipation` is per second, not per step, so it means the same thing at
 * any frame rate.
 */
export function stepFluid(f, dt, {
    visc = 0, diff = 0, dissipation = 0.4, buoyancy = 1.6,
    iterations = 12, gravityX = 0,
} = {}) {
    const { n, u, v, u0, v0, d, d0 } = f;

    if (buoyancy || gravityX) {
        for (let j = 1; j <= n; j++) {
            for (let i = 1; i <= n; i++) {
                const q = IX(n, i, j);
                v[q] += d[q] * buoyancy * dt;
                u[q] += d[q] * gravityX * dt;
            }
        }
    }

    // Diffuse, project, advect, project -- in that order, and the second
    // projection is not optional: advecting with a divergent field is what
    // makes density pile up in corners.
    if (visc > 0) {
        const a = dt * visc * n * n;
        u0.set(u); v0.set(v);
        linearSolve(n, 1, u, u0, a, 1 + 4 * a, iterations);
        linearSolve(n, 2, v, v0, a, 1 + 4 * a, iterations);
    }
    project(n, u, v, u0, v0, iterations);
    u0.set(u); v0.set(v);
    advect(n, 1, u, u0, u0, v0, dt);
    advect(n, 2, v, v0, u0, v0, dt);
    project(n, u, v, u0, v0, iterations);

    if (diff > 0) {
        const a = dt * diff * n * n;
        d0.set(d);
        linearSolve(n, 0, d, d0, a, 1 + 4 * a, iterations);
    }
    d0.set(d);
    advect(n, 0, d, d0, u, v, dt);

    if (dissipation > 0) {
        const keep = Math.exp(-dissipation * dt);
        for (let i = 0; i < d.length; i++) d[i] *= keep;
    }
    return f;
}

/** Total interior density -- the quantity a conservation test watches. */
export function fluidMass(f) {
    const { n, d } = f;
    let sum = 0;
    for (let j = 1; j <= n; j++) for (let i = 1; i <= n; i++) sum += d[IX(n, i, j)];
    return sum;
}

/**
 * The density field as RGBA bytes, premultiplied by its own alpha.
 *
 * Premultiplied because the texture is drawn additively or with
 * `depthWrite: false` over the scene, and a straight-alpha edge against a
 * dark card leaves a grey halo -- the same reason the particle materials
 * carry `basic` rather than being lit.
 *
 * Row 0 of the output is the TOP of the image, and j=0 is the BOTTOM of the
 * grid, so the write walks j backwards. A plume that renders upside down and
 * sinks is this line.
 */
export function fluidToRGBA(f, out, { color = [230, 230, 235], gain = 1, gamma = 1 } = {}) {
    const { n, d } = f;
    const bytes = out ?? new Uint8ClampedArray(n * n * 4);
    for (let j = 0; j < n; j++) {
        const row = (n - 1 - j) * n;
        for (let i = 0; i < n; i++) {
            let a = d[IX(n, i + 1, j + 1)] * gain;
            a = a <= 0 ? 0 : a >= 1 ? 1 : (gamma === 1 ? a : Math.pow(a, gamma));
            const q = (row + i) * 4;
            bytes[q] = color[0] * a; bytes[q + 1] = color[1] * a; bytes[q + 2] = color[2] * a;
            bytes[q + 3] = a * 255;
        }
    }
    return bytes;
}
