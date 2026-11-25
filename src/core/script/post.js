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

/* ---------------------------------------------------------------- keyframing

 * Post as timeline channels, which is what a rack focus is.
 *
 * `buildComposer` builds the chain from a declaration ONCE, and the only
 * thing that then varies with time is the grain seed. So every number above
 * is a constant for the life of a film, and a **rack focus** -- the one
 * camera move that most reads as photography, pulling focus from one subject
 * to another within a held frame -- was impossible to express.
 *
 * Everything else in this engine that varies over time is a timeline channel.
 * Post was the exception, and it had no reason to be: the passes already
 * exist, the interpolator already exists, and `samplePose` already walks
 * every target. What was missing was a NODE to key against and a guard list
 * saying which numbers may be keyed.
 *
 * The guard list is the pattern `SceneAdapter.js` already uses for
 * `COLOR_PROPS` and `VECTOR2_PROPS`, and it exists for the same reason: a
 * typo must be a diagnostic, not a channel nothing reads. `set
 * props.trim.offset` once wrote a property literally named "trim.offset" that
 * nothing read, silently, and that is the failure this prevents.
 */

/**
 * The synthetic target post channels are keyed against.
 *
 * `__camera` and `__subtitle` are the existing synthetic nodes; this is the
 * third. It must also be listed in `SMOOTH_TARGETS` in
 * [Evaluator.js](../anim/Evaluator.js): a film held on twos would otherwise
 * stair-step its focus pull in 2-frame jumps, which is the same reason the
 * camera is exempt from the hold.
 */
export const POST_NODE = '__post';

/**
 * Which post parameters may be keyed, per pass.
 *
 * Scalars only, and deliberately not everything:
 *
 * - `ssao.radius`/`bias` are **excluded**. They are sampling parameters, not
 *   look parameters; animating them makes the ambient term swim between
 *   frames rather than change in any way an audience reads as intent.
 * - `grade`'s triples (`lift`, `gamma`, `gain`) are excluded for now because
 *   a channel holds one scalar and three channels per triple is a wider
 *   change than this needs. `exposure`, `contrast` and `saturation` cover
 *   what a shot actually asks for.
 * - `grainSize` and `vignetteSoftness` are excluded: they are the shape of an
 *   effect, not its amount, and animating shape reads as a mistake.
 * - `smaa` has no parameters at all.
 *
 * `dof.focus` is the one this whole section exists for.
 */
export const POST_KEYABLE = {
    ssao: ['intensity'],
    bloom: ['strength', 'radius', 'threshold'],
    dof: ['focus', 'aperture', 'maxblur'],
    grade: ['exposure', 'contrast', 'saturation', 'temperature', 'tint',
            'vignette', 'grain', 'chromatic'],
    smaa: [],
};

/** The channel path for one parameter: `dof.focus`. */
export function postChannel(kind, param) { return `${kind}.${param}`; }

/** Is this a parameter that may be keyed? */
export function isPostKeyable(kind, param) {
    return (POST_KEYABLE[kind] ?? []).includes(param);
}

/**
 * Every keyable channel, in pass order, for a chain.
 *
 * Only passes the chain actually HAS: keying `dof.focus` on a film with no
 * `dof` pass is a diagnostic, because the alternative is an author ramping a
 * number for a pass that was never built and seeing nothing happen.
 */
export function postChannels(chain) {
    const out = [];
    for (const p of chain ?? []) {
        for (const param of POST_KEYABLE[p.kind] ?? []) out.push(postChannel(p.kind, param));
    }
    return out;
}

/**
 * Read a ramp declaration into `{ from, to, span, ease }`, or a bare number
 * into a hold.
 *
 * Mirrors `shot.camera` -- `from`, `to`, `for`, `ease` -- rather than
 * inventing a second vocabulary for the same idea, because a shot that pulls
 * focus and pushes in is describing one move and should read like one. `from`
 * defaults to whatever the previous shot left, which is what makes a cut
 * between two focus depths a cut rather than a ramp from nowhere.
 */
export function normalizePostRamp(spec, { duration, base = null, path = 'post', warn = () => {} } = {}) {
    if (typeof spec === 'number') {
        if (!Number.isFinite(spec)) { warn(`${path} is not a finite number`, path); return null; }
        return { from: spec, to: spec, span: 0, ease: 'linear', held: true };
    }
    if (!spec || typeof spec !== 'object') {
        warn(`${path} must be a number or { from, to, for, ease }`, path);
        return null;
    }
    const from = num(spec.from, base);
    const to = num(spec.to, from);
    if (from == null || to == null) {
        warn(`${path} needs a \`to\`, or a \`from\` to hold`, path);
        return null;
    }
    // Clamped to the shot, exactly as the camera's `for` is: a focus pull
    // longer than the shot it is in would otherwise be cut off mid-ramp and
    // land on a value the author never asked to see.
    const want = num(spec.for, duration);
    const span = Math.max(0, Math.min(want, duration));
    if (want > duration + 1e-6) {
        warn(`${path}.for is ${want}s in a ${duration}s shot; clamped`, path);
    }
    return { from, to, span, ease: spec.ease ?? 'smooth', held: from === to };
}

/**
 * Apply sampled channel values onto a chain, returning a new chain.
 *
 * Pure, and the reason the runtime stays simple: `post3d.js` asks for the
 * chain it should be showing at time t and writes the differences into the
 * passes, rather than each pass type knowing how to sample a timeline.
 *
 * Unknown channels are ignored rather than thrown on, because a film may be
 * rendered after its `meta.post` was edited to drop a pass, and losing a
 * frame to that is worse than ignoring a number nothing can use.
 */
export function applyPostSample(chain, sampled) {
    if (!sampled) return chain;
    const read = sampled instanceof Map
        ? (k) => sampled.get(k)
        : (k) => sampled[k];
    let changed = false;
    const out = (chain ?? []).map((p) => {
        let next = p;
        for (const param of POST_KEYABLE[p.kind] ?? []) {
            const v = read(postChannel(p.kind, param));
            if (typeof v !== 'number' || !Number.isFinite(v) || v === p[param]) continue;
            if (next === p) next = { ...p };
            next[param] = v;
            changed = true;
        }
        return next;
    });
    return changed ? out : chain;
}

/**
 * Sample the keyed post channels at one time.
 *
 * A focused sampler rather than reading `samplePose`'s result, for two
 * reasons. A full pose sample walks every target in the film to collect four
 * or five numbers, and the renderer already pays for one of those per frame
 * -- paying twice to read the lens is the kind of cost that only shows up at
 * 1080p. And it keeps the post path independent of whether the caller
 * happens to have a pose in hand: `film3d.html` does, the probe scripts do
 * not.
 *
 * Returns `null` when the film keys no post at all, which is the common case
 * and lets the caller skip the write entirely.
 */
export function samplePostAt(timeline, t, { getTrack, trackValueAt, chain = null } = {}) {
    if (!timeline || !getTrack || !trackValueAt) return null;
    const channels = chain ? postChannels(chain) : null;
    let out = null;
    for (const [kind, params] of Object.entries(POST_KEYABLE)) {
        for (const param of params) {
            const channel = postChannel(kind, param);
            if (channels && !channels.includes(channel)) continue;
            const track = getTrack(timeline, POST_NODE, channel);
            if (!track?.keys?.length) continue;
            const v = trackValueAt(track, t);
            if (typeof v !== 'number' || !Number.isFinite(v)) continue;
            (out ??= {})[channel] = v;
        }
    }
    return out;
}
