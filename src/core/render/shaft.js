/**
 * Light shafts: in-scattering from a spot light's cone.
 *
 * # The other half of volumetrics
 *
 * [fog.js](fog.js) is extinction -- light LEAVING the view ray. This is the
 * half that arrives: a ray crossing a lit cone of air picks up light the lamp
 * scattered toward the camera, and that is the whole of what a god ray, a
 * headlight beam in rain and a torch in smoke are.
 *
 * # No solver, and no marching either
 *
 * [43-DCC-PARITY.md](../../../docs/pending/43-DCC-PARITY.md) plans
 * volumetrics as "one grid solver feeding a 3D texture and a ray-marched
 * shader". Smoke and fire need that. A shaft does not: with a UNIFORM medium
 * inside a cone, the integral along a view ray has a closed form, and the
 * only geometry needed is where the ray enters and leaves the cone.
 *
 *     in-scatter = I * sigma_s * p(theta) * integral from t0 to t1 of dt/r(t)^2
 *
 * and for r(t) = |o + t d - A| with d a unit vector,
 *
 *     integral dt/r^2 = (1/h) * [ atan((t - tc)/h) ]
 *
 * where `tc` is where the ray passes closest to the apex and `h` is how far
 * away it passes. One atan per endpoint. A 64-step march would compute the
 * same number more slowly and less accurately, and -- the part that matters
 * here -- would have nothing exact to be checked against.
 *
 * So this module is the arithmetic, `render/shaft.js` transcribes it to GLSL,
 * and the pixel probe measures one against the other.
 *
 * # What is deliberately not modelled
 *
 * ponytail: the medium is uniform and unshadowed inside the cone, and
 * extinction along the chord is ignored. In order of what each would cost:
 *
 *   1. SHADOWS in the shaft -- the dust-in-a-window look where a mullion
 *      carves a dark stripe out of the beam. Needs the spot's shadow map
 *      sampled per step, which means giving up the closed form for a march.
 *   2. Occlusion by scene geometry mid-chord. Needs the depth texture.
 *   3. Extinction along the chord, which matters only in a thick medium
 *      where the shaft is dim anyway.
 *
 * A shaft is aimed once, at build time, from the light to its target.
 *
 * Pure: numbers only. No THREE, no canvas.
 */

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** The default anisotropy: forward-scattering, which is why shafts are visible. */
export const SHAFT_G = 0.6;

/**
 * Henyey-Greenstein, the phase function every participating medium is
 * modelled with.
 *
 * `g` is the asymmetry: 0 scatters evenly, positive scatters FORWARD. Air
 * with dust in it is strongly forward-scattering, which is the entire reason
 * a shaft appears when you look towards the lamp and nearly vanishes when you
 * look along the beam from behind. Isotropic scattering gets the brightness
 * roughly right and the phenomenon completely wrong.
 *
 * `cosTheta` is between the direction the light is TRAVELLING and the
 * direction it must leave in to reach the camera: `-dot(ray, axis)`, which is
 * +1 when the camera is looking straight back up the beam.
 */
export function phaseHG(cosTheta, g = SHAFT_G) {
    const gg = Math.min(0.95, Math.max(-0.95, g));
    const d = 1 + gg * gg - 2 * gg * Math.max(-1, Math.min(1, cosTheta));
    return (1 - gg * gg) / (4 * Math.PI * Math.max(1e-6, d) ** 1.5);
}

/**
 * Where a ray enters and leaves a cone: `[t0, t1]`, or null for a miss.
 *
 * The cone is the one a spot light makes: apex `A`, unit axis `V`, half-angle
 * with cosine `cosA`, cut off by a cap at `range` along the axis.
 *
 * Solved rather than marched, and the subtlety is that
 * `dot(x-A,V)^2 = cos^2 * |x-A|^2` describes a DOUBLE cone -- the mirror
 * sheet behind the lamp satisfies it too. A root on that sheet is discarded
 * by the sign test, and a ray that enters through the cap rather than through
 * the wall has its entry clamped to the cap plane. Both cases are ordinary
 * and both produce a plausible wrong picture if skipped: the first puts a
 * second shaft behind the lamp, the second leaves a circular hole where the
 * beam should be brightest.
 */
export function rayCone(o, d, A, V, cosA, range) {
    const co = [o[0] - A[0], o[1] - A[1], o[2] - A[2]];
    const dv = d[0] * V[0] + d[1] * V[1] + d[2] * V[2];
    const cv = co[0] * V[0] + co[1] * V[1] + co[2] * V[2];
    const dc = d[0] * co[0] + d[1] * co[1] + d[2] * co[2];
    const cc = co[0] * co[0] + co[1] * co[1] + co[2] * co[2];
    const k = cosA * cosA;

    const a = dv * dv - k;
    const b = 2 * (dv * cv - k * dc);
    const c = cv * cv - k * cc;

    // On the axis of the cone the quadratic degenerates to a line: a ray
    // parallel to the cone's surface has one crossing, not two.
    const hits = [];
    if (Math.abs(a) < 1e-12) {
        if (Math.abs(b) > 1e-12) hits.push(-c / b);
    } else {
        const disc = b * b - 4 * a * c;
        if (disc < 0) return null;
        const s = Math.sqrt(disc);
        hits.push((-b - s) / (2 * a), (-b + s) / (2 * a));
    }

    // Keep only the forward sheet, and only inside the cap.
    const kept = hits.filter((t) => {
        const h = cv + t * dv;
        return h >= 0 && h <= range;
    }).sort((p, q) => p - q);

    // The cap, which is where a ray looking INTO the beam from in front of
    // the lamp enters. `dv` of zero is a ray parallel to the cap.
    if (Math.abs(dv) > 1e-12) {
        const t = (range - cv) / dv;
        const p = [co[0] + t * d[0], co[1] + t * d[1], co[2] + t * d[2]];
        const len = Math.hypot(p[0], p[1], p[2]);
        // Inside the cap disc: the axial distance IS `range` here, so the
        // test is just the half-angle.
        if (len > 1e-9 && (range / len) >= cosA - 1e-9) kept.push(t);
    }
    if (kept.length < 2) {
        // One crossing means the camera is INSIDE the cone: the chord starts
        // at the eye. A shaft the camera is standing in is the normal case
        // for a torch or a headlight, not an edge case.
        if (kept.length === 1 && insideCone(o, A, V, cosA, range)) {
            return kept[0] > 0 ? [0, kept[0]] : null;
        }
        return null;
    }
    kept.sort((p, q) => p - q);
    const t0 = Math.max(0, kept[0]);
    const t1 = kept[kept.length - 1];
    return t1 > t0 ? [t0, t1] : null;
}

/** Is a point inside the capped cone? */
export function insideCone(x, A, V, cosA, range) {
    const p = [x[0] - A[0], x[1] - A[1], x[2] - A[2]];
    const h = p[0] * V[0] + p[1] * V[1] + p[2] * V[2];
    if (h < 0 || h > range) return false;
    const len = Math.hypot(p[0], p[1], p[2]);
    return len < 1e-9 || h / len >= cosA;
}

/**
 * The closed-form `integral of dt/r^2` along the chord.
 *
 * `radius` is the lamp's own size, and it is not cosmetic: a view ray aimed
 * at a point light passes at `h = 0` and the integral diverges. A real lamp
 * has a filament, so clamping `h` to its radius is the physical answer rather
 * than a fudge -- without it the apex is a single blinding pixel that bloom
 * then smears across the frame.
 */
export function inverseSquareIntegral(o, d, A, [t0, t1], radius = 0.02) {
    const co = [A[0] - o[0], A[1] - o[1], A[2] - o[2]];
    const tc = co[0] * d[0] + co[1] * d[1] + co[2] * d[2];
    const perp = [co[0] - tc * d[0], co[1] - tc * d[1], co[2] - tc * d[2]];
    const h = Math.max(radius, Math.hypot(perp[0], perp[1], perp[2]));
    return (Math.atan2(t1 - tc, h) - Math.atan2(t0 - tc, h)) / h;
}

/**
 * How far inside the cone the chord's midpoint sits, 0 at the axis and 1 on
 * the surface -- and from that, the rim softness.
 *
 * A cone has a hard edge and a lamp does not: a beam with a cut rim reads as
 * a cardboard cone with a light in it. `soft` is taken from the light's own
 * `penumbra`, because they are the same statement about the same lamp.
 *
 * Measured at the midpoint rather than integrated, which is the one
 * approximation in here that is cosmetic rather than physical -- the exact
 * answer would soften the chord's ENDS, not the ray. ponytail: upgrade is a
 * per-endpoint weight, and nothing will notice until a beam is very wide.
 */
export function rimFactor(o, d, shaft, [t0, t1]) {
    const { apex, axis, cosA, soft } = shaft;
    if (!(soft > 0)) return 1;
    const tm = (t0 + t1) / 2;
    const p = [o[0] + tm * d[0] - apex[0], o[1] + tm * d[1] - apex[1],
               o[2] + tm * d[2] - apex[2]];
    const len = Math.hypot(p[0], p[1], p[2]);
    if (len < 1e-9) return 1;
    const c = (p[0] * axis[0] + p[1] * axis[1] + p[2] * axis[2]) / len;
    // cos of the midpoint's angle off the axis, against the cone's own: a
    // ratio of ANGLES rather than of radii, so it does not change with
    // distance down the beam.
    const rr = Math.min(1, Math.acos(Math.min(1, Math.max(-1, c))) / Math.acos(cosA));
    const lo = 1 - soft;
    if (rr <= lo) return 1;
    const u = (rr - lo) / soft;
    return 1 - u * u * (3 - 2 * u);
}

/**
 * In-scattered radiance along one view ray, in the same linear units the
 * renderer works in.
 *
 * This is the function the probe measures a scanline against, so every term
 * in it is one the shader also applies, in the same order.
 */
export function inscatter(o, d, shaft) {
    const { apex, axis, cosA, range, intensity, density, g, radius } = shaft;
    const span = rayCone(o, d, apex, axis, cosA, range);
    if (!span) return 0;
    const cosTheta = -(d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2]);
    return intensity * density * phaseHG(cosTheta, g)
        * inverseSquareIntegral(o, d, apex, span, radius)
        * rimFactor(o, d, shaft, span);
}

/**
 * Normalise a light's `shaft`.
 *
 * `density` defaults to the FILM's fog density, because a shaft is the film's
 * own air being lit: a shaft denser than the medium it is in would be light
 * scattering off nothing. A film with a shaft and no fog at all is almost
 * certainly a mistake, and says so.
 */
export function normalizeShaft(spec, {
    lightType = 'spot', angle = 60, distance = 0, penumbra = 0.2,
    fog = null, path = 'lights[].shaft', warn = () => {},
} = {}) {
    if (spec == null || spec === false) return null;
    const s = spec === true ? {} : spec;
    if (typeof s !== 'object') {
        warn('`shaft` must be an object, or true for the defaults', path);
        return null;
    }
    /**
     * A shaft is a CONE, and only a spot light has one. On a point light the
     * cone has no axis to be aimed along and on a directional light it has no
     * apex -- so this is not a limitation to work around, it is what the
     * feature is. A typo must be a diagnostic.
     */
    if (lightType !== 'spot') {
        warn(`a shaft needs a spot light's cone; this light is '${lightType}'`, path);
        return null;
    }

    const range = num(s.range, distance > 0 ? distance : 0);
    if (!(range > 0)) {
        warn('a shaft needs a finite length: give it `range`, or give the light '
            + 'a `distance`', path);
        return null;
    }

    const density = num(s.density, fog?.density ?? 0);
    if (!(density > 0)) {
        warn('a shaft scatters the air, and this film declares none: set '
            + '`meta.fog` or the shaft\'s own `density`. Nothing will be drawn', path);
        return null;
    }

    return {
        range,
        density,
        intensity: num(s.intensity, 1),
        g: num(s.g, SHAFT_G),
        // The lamp's own size, as a fraction of the beam's length, so the
        // apex clamp is scale-free.
        radius: num(s.radius, 0.02 * range),
        color: s.color ?? null,            // null means the light's own colour
        // Softness at the cone's rim, so the beam has no cut edge. Taken from
        // the light's penumbra, because they are the same statement.
        soft: Math.min(1, Math.max(0, num(s.soft, penumbra))),
        cosA: Math.cos((angle * Math.PI) / 180),
        angle,
    };
}

/** The line a render log prints, so a shaft is understood rather than tuned. */
export function shaftReport(shaft, id) {
    if (!shaft) return `shaft: none`;
    return `shaft: ${id} -- ${shaft.angle.toFixed(0)}deg cone, ${shaft.range.toFixed(2)} long, `
        + `density ${shaft.density.toFixed(4)}, g ${shaft.g.toFixed(2)}`
        + (shaft.soft > 0 ? `, rim soft ${shaft.soft.toFixed(2)}` : '');
}
