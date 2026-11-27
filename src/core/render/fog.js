/**
 * Participating media: fog, haze and atmospheric depth.
 *
 * # What was missing, and why it is the first volumetric
 *
 * [43-DCC-PARITY.md](../../../docs/pending/43-DCC-PARITY.md) lists
 * volumetrics as one solver with three products -- smoke, fire, god rays.
 * All three are **in-scattering**: light arriving from somewhere other than
 * the surface the ray hits. Every one of them is built on the half nobody
 * had built here, which is **extinction**: light leaving the ray on its way
 * to the camera. The engine had none. A film could not say "the far wall is
 * 40 m away and hazy", so every shot of a large set rendered with the
 * contrast of a studio tabletop whatever its depth.
 *
 * Extinction is also the one half that is already in the renderer, in every
 * lit material's fragment shader, costing nothing. So this module is the
 * arithmetic and the authoring, and `SceneAdapter` is three lines.
 *
 * # Density is unguessable; visibility is not
 *
 * `density: 0.0652` is not a number anyone can picture, and the first thing
 * an author does with it is render, squint and double it. What a cinematographer
 * actually knows is **how far they can see**, so that is what this takes:
 *
 *     fog: { visibility: 30 }        // 2% of the light survives 30 m
 *     fog: { density: 0.0652 }       // the same medium, stated the hard way
 *
 * `visibility` is a DISTANCE, in the same world units as everything else,
 * and `FOG_THRESHOLD` is what "cannot see" means. Both directions are here
 * because the renderer needs the density and the diagnostic needs the
 * distance.
 *
 * # The depth is along the lens axis, not radial
 *
 * THREE's `vFogDepth` is `-mvPosition.z` -- how far along the camera's
 * forward axis a fragment is, not how far from the camera it is. At the edge
 * of a wide frame those differ by a factor of `1/cos(theta)`, and a probe
 * that measures radial distance and compares it against this arithmetic will
 * read a few percent off and look like a bug in the fog. It is not: it is
 * what a plane of constant fog looks like, which is also what a real
 * atmosphere does NOT look like. Stated here because it is the one thing
 * about this that surprises people.
 *
 * Pure: numbers and names. No THREE, no canvas.
 */

/**
 * Two media, and a guard list for the reason `LIGHT_TYPES` is one:
 *
 *   exp     physical. Transmittance falls as exp(-(density*z)^2) -- THREE's
 *           `FogExp2`, which squares both terms, so it is thicker than
 *           Beer-Lambert at the same number and has no linear region.
 *   linear  `near`/`far` with a smoothstep between. Not physical at all, and
 *           the right answer for a stylised background fade or a matte that
 *           has to end exactly at a known distance.
 *
 * A typo must be a diagnostic. `kind: 'exponential'` would otherwise fall
 * through to linear and fade between the default near and far, which is a
 * plausible-looking fog of entirely the wrong shape.
 */
export const FOG_KINDS = ['exp', 'linear'];
export const isFogKind = (k) => FOG_KINDS.includes(k);

/**
 * What "cannot see that far" means: the fraction of the light still arriving.
 *
 * 2% rather than 0, because transmittance is exponential and never reaches
 * zero -- a threshold has to be picked for `visibility` to be a number at
 * all. 2% is roughly where a white card stops being distinguishable from
 * the fog behind it on an 8-bit display, which is the honest definition.
 */
export const FOG_THRESHOLD = 0.02;

/** The default visibility, when a film says `fog: true` and nothing else. */
export const FOG_VISIBILITY = 60;

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** smoothstep, exactly as the GLSL does it -- the fog factor must match. */
export function smoothstep(a, b, x) {
    if (!(b > a)) return x < a ? 0 : 1;
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
}

/** Its inverse, closed form, for turning a transmittance back into a depth. */
export function smoothstepInverse(y) {
    const c = Math.min(1, Math.max(0, y));
    return 0.5 - Math.sin(Math.asin(1 - 2 * c) / 3);
}

/** The density that leaves `threshold` of the light at `distance`. */
export function densityFor(distance, threshold = FOG_THRESHOLD) {
    if (!(distance > 0)) return 0;
    return Math.sqrt(-Math.log(threshold)) / distance;
}

/**
 * How much of a surface's own colour survives the medium, at view depth `z`.
 *
 * This is the quantity a probe can measure: render the same card with the
 * fog and without it, and the ratio of the two linear-light values IS this
 * number, because the shader's `mix` is linear in it.
 */
export function transmittance(z, fog) {
    if (!fog) return 1;
    const d = Math.max(0, num(z, 0));
    if (fog.kind === 'linear') return 1 - smoothstep(fog.near, fog.far, d);
    return Math.exp(-((fog.density * d) ** 2));
}

/** Its complement: how much of the frame is the fog's own colour. */
export const fogFactor = (z, fog) => 1 - transmittance(z, fog);

/**
 * One channel of fogged colour, in LINEAR light.
 *
 * # Linear is a decision this engine had to make, not a fact about THREE
 *
 * THREE's shaders include `fog_fragment` **after** `tonemapping_fragment`
 * and `colorspace_fragment`, and resolve the `fogColor` uniform into
 * whichever space the fragment is being written in. So the space the fog
 * mixes in depends on where the render is going:
 *
 *   straight to the canvas   the material tone maps and encodes to sRGB
 *                            first, so fog mixes in DISPLAY space
 *   into a render target     tone mapping is `NoToneMapping` and the output
 *                            space is linear, so fog mixes in LINEAR light
 *                            and `OutputPass` tone maps afterwards
 *
 * A composer is a render target. That means the same `fog: { visibility: 50 }`
 * meant two different images depending on whether the film happened to
 * declare an unrelated `bloom`, and the display-space one is wrong: it mixes
 * after the highlights have been compressed, so fog cannot take a blown
 * highlight back down the way a real medium does.
 *
 * Measured, which is how this was found at all. Five cards at known axial
 * depths under `visibility: 50`, transmittance recovered from the pixels:
 *
 *   mix in display space   implied density drifts 0.0569 -> 0.0458 with depth
 *   mix in linear light    implied density 0.0399 against the declared
 *                          0.0396, spread 1.6% across 5 m to 30 m
 *
 * The drift is the tell. A medium has one density; a number that changes
 * with depth means the model and the renderer disagree about the shape of
 * the curve, not about its scale.
 *
 * So the engine forces the composer on when a film declares fog -- see
 * `force` in `render/post3d.js` -- and this function is the linear mix,
 * which is now the only one the renderer performs.
 */
export const fogged = (surface, fogColor, z, fog) => {
    const t = transmittance(z, fog);
    return surface * t + fogColor * (1 - t);
};

/** The depth at which `threshold` of the light is left. */
export function visibilityOf(fog, threshold = FOG_THRESHOLD) {
    if (!fog) return Infinity;
    if (fog.kind === 'linear') {
        return fog.near + smoothstepInverse(1 - threshold) * (fog.far - fog.near);
    }
    if (!(fog.density > 0)) return Infinity;
    return Math.sqrt(-Math.log(threshold)) / fog.density;
}

/** Where half the light is gone -- the number that reads as "how thick". */
export const halfDistance = (fog) => visibilityOf(fog, 0.5);

/**
 * Normalise a film's `meta.fog`.
 *
 * `color` defaults to the BACKGROUND, and that default is most of the
 * feature. `scene.background` is not fogged -- it is painted behind
 * everything at full strength -- so a film with a dark backdrop and pale fog
 * gets a hard ring where the geometry ends and the sky begins, which reads
 * as a clipping bug rather than as a colour choice. Matching them makes the
 * far distance dissolve into the backdrop, which is what atmosphere does.
 */
export function normalizeFog(spec, { background = '#000000', warn = () => {} } = {}) {
    if (spec == null || spec === false) return null;
    const s = spec === true ? {} : spec;
    if (typeof s !== 'object') {
        warn('`meta.fog` must be an object, or true for the default haze', 'meta.fog');
        return null;
    }

    const kind = s.kind ?? 'exp';
    if (!isFogKind(kind)) {
        warn(`unknown fog kind '${kind}'; try ${FOG_KINDS.join(', ')}`, 'meta.fog.kind');
        return null;
    }
    const color = s.color ?? background;

    if (kind === 'linear') {
        const near = num(s.near, 1);
        const far = num(s.far, num(s.visibility, FOG_VISIBILITY));
        if (!(far > near)) {
            warn(`linear fog needs far (${far}) beyond near (${near}); `
                + 'nothing between them would be fogged', 'meta.fog');
            return null;
        }
        return { kind, color, near, far, density: 0 };
    }

    let density = num(s.density, 0);
    if (density > 0 && s.visibility != null) {
        warn(`fog declares both density ${density} and visibility ${s.visibility}; `
            + 'density wins. State one of them', 'meta.fog');
    } else if (!(density > 0)) {
        const vis = num(s.visibility, FOG_VISIBILITY);
        if (!(vis > 0)) {
            warn(`fog visibility must be a positive distance, not ${s.visibility}`, 'meta.fog');
            return null;
        }
        density = densityFor(vis);
    }
    return { kind, color, density, near: 0, far: 0 };
}

/**
 * The one line a render log prints, so a density is understood rather than
 * accepted. A number with no distance beside it teaches an author nothing.
 */
export function fogReport(fog) {
    if (!fog) return 'fog: none';
    const vis = visibilityOf(fog), half = halfDistance(fog);
    const how = fog.kind === 'linear'
        ? `linear ${fog.near}-${fog.far}`
        : `exp, density ${fog.density.toFixed(4)}`;
    return `fog: ${how}, ${fog.color} -- half the light gone by ${half.toFixed(2)}, `
        + `${(FOG_THRESHOLD * 100).toFixed(0)}% left at ${vis.toFixed(2)}`;
}
