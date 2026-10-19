/**
 * The post chain, declared and ordered.
 *
 * Before this, `film3d.html` wired exactly one pass -- `UnrealBloomPass` --
 * and `OutputPass` was imported in the legacy editor and never added to a
 * composer at all, which is worse than having no chain: a composer without
 * `OutputPass` skips tone mapping and the sRGB conversion the renderer would
 * otherwise do itself, so switching bloom on also changed the exposure and
 * the gamma of the whole frame.
 *
 * Pass ORDER is not a preference, it is most of the correctness, and it is
 * the reason this is a module rather than an array at each call site:
 *
 *   ssao   before anything else -- it needs the raw depth and normals, and a
 *          bloomed frame has neither
 *   bloom  on the linear HDR buffer, which is the only place a threshold on
 *          luminance means anything
 *   dof    after bloom: a defocused highlight blooms, a bloomed highlight
 *          does not then come back into focus
 *   grade  exposure, contrast, saturation, lift/gamma/gain, vignette, grain
 *          and chromatic aberration -- the lens and the print, last of the
 *          image-forming passes
 *   smaa   on the final image, because antialiasing anything but the final
 *          image is work the next pass undoes
 *   output tone map and encode, always last, always present
 *
 * Pure: names and numbers only. [post3d.js](../../render/post3d.js) turns
 * this into THREE passes.
 */

export const POST_ORDER = ['ssao', 'bloom', 'dof', 'grade', 'smaa'];

const DEFAULTS = {
    ssao: { radius: 0.12, intensity: 1, bias: 0.008, output: 'default' },
    bloom: { strength: 0.8, radius: 0.5, threshold: 0.75 },
    dof: { focus: 3, aperture: 0.0008, maxblur: 0.01 },
    grade: {
        exposure: 1, contrast: 1, saturation: 1, temperature: 0, tint: 0,
        lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1],
        vignette: 0, vignetteSoftness: 0.45,
        grain: 0, grainSize: 1.4,
        chromatic: 0,
    },
    smaa: {},
};

const num = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const triple = (v, d) => (Array.isArray(v)
    ? [num(v[0], d[0]), num(v[1], d[1]), num(v[2], d[2])]
    : typeof v === 'number' ? [v, v, v] : d);

/**
 * Normalise `meta.post` into an ordered, defaulted pass list.
 *
 * `meta.bloom` is still honoured and still means what it meant, because films
 * in the repo use it; it folds in as a `bloom` entry. A pass named twice, or
 * named in `post` while `meta.bloom` is also set, resolves to one pass with
 * `post` winning -- rather than two bloom passes, which is what a naive
 * concatenation gives and reads as a milky frame nobody asked for.
 */
export function normalizePost(post, { bloom = null, warn = () => {} } = {}) {
    const wanted = new Map();
    if (bloom) wanted.set('bloom', bloom);

    if (Array.isArray(post)) {
        for (const entry of post) {
            const kind = typeof entry === 'string' ? entry : entry?.kind;
            if (!POST_ORDER.includes(kind)) { warn(`unknown post pass '${kind}'`, 'meta.post'); continue; }
            wanted.set(kind, typeof entry === 'string' ? {} : entry);
        }
    } else if (post && typeof post === 'object') {
        for (const [kind, spec] of Object.entries(post)) {
            if (!POST_ORDER.includes(kind)) { warn(`unknown post pass '${kind}'`, 'meta.post'); continue; }
            if (spec === false || spec == null) { wanted.delete(kind); continue; }
            wanted.set(kind, spec === true ? {} : spec);
        }
    } else if (post != null) {
        warn('`meta.post` must be an object or an array of pass names', 'meta.post');
    }

    const chain = [];
    for (const kind of POST_ORDER) {
        if (!wanted.has(kind)) continue;
        const spec = wanted.get(kind) ?? {};
        const base = DEFAULTS[kind];
        const out = { kind };
        for (const [k, d] of Object.entries(base)) {
            out[k] = Array.isArray(d) ? triple(spec[k], d)
                : typeof d === 'number' ? num(spec[k], d)
                : spec[k] ?? d;
        }
        chain.push(out);
    }
    return chain;
}

/**
 * Does this chain do anything a plain render would not?
 *
 * A grade pass set to all its defaults is an identity transform through a
 * full-screen shader, so the answer matters: it is the difference between
 * "declared post" and "pay for post".
 */
export function postIsIdentity(chain) {
    if (!chain.length) return true;
    return chain.every((p) => p.kind === 'grade' && gradeIsIdentity(p));
}

export function gradeIsIdentity(g) {
    const d = DEFAULTS.grade;
    return Object.keys(d).every((k) => (Array.isArray(d[k])
        ? d[k].every((v, i) => g[k][i] === v)
        : g[k] === d[k]));
}
