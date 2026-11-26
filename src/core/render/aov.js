/**
 * Arbitrary Output Variables: the passes a compositor needs, as arithmetic.
 *
 * # Why this is in `core/`
 *
 * An AOV is only worth writing if it can be READ BACK. A depth pass that
 * cannot be turned into metres is a grey picture; an object pass whose
 * colours nobody can map to node ids is a picture of confetti. The decode is
 * therefore the feature, and the decode is pure arithmetic over bytes -- so
 * it lives here, is unit-tested in Node, and is the same code the e2e probe
 * uses to check real pixels.
 *
 * # The three passes, and why these three
 *
 *   - `depth`   -- distance from the camera, per pixel. Fog, depth-of-field
 *                  and any depth composite in a compositor want it.
 *   - `normal`  -- the surface normal in VIEW space. Relighting and normal-
 *                  based masks (floor vs wall vs ceiling) want it.
 *   - `object`  -- a flat, unique colour per node. This is the matte pass,
 *                  and matting is the gap `43-DCC-PARITY.md` 2.12 names
 *                  four times: masking, alpha, background replacement and
 *                  pass combination all start here.
 *
 * `GEOMETRY_KINDS`, `POST_KEYABLE`, `BODY_SHAPES`: `AOV_KINDS` is the same
 * kind of list, for the same reason. `aov: ['dpeth']` must be a diagnostic.
 */

export const AOV_KINDS = ['depth', 'normal', 'object'];
export const isAOV = (kind) => AOV_KINDS.includes(kind);

/**
 * Usable bits in a packed depth pass.
 *
 * Each channel is 8 bits and four channels are packed, so the arithmetic
 * carries 32; the shader that writes it works in `highp float`, which has a
 * 24-bit significand. 24 is therefore the honest number, and `depthQuantum`
 * below is what the e2e probe compares against -- so if this were optimistic
 * the probe would say so rather than this comment being believed.
 */
export const DEPTH_BITS = 24;

/**
 * Three's `packDepthToRGBA`, inverted.
 *
 * RED IS THE MOST SIGNIFICANT BYTE and alpha the least, which is the one
 * thing about this format that is easy to get backwards -- and it was, here,
 * for one run: `test/e2e/aov.mjs` read a cube 11 m away as 0.010027 m, which
 * is the near plane, because the bytes were summed in the other order. The
 * reversed reading is not noisy or obviously broken; it is a smooth,
 * plausible depth map of nothing that exists. That is why the probe compares
 * against a distance known from the film's own geometry rather than eyeing a
 * grey picture.
 *
 * Returns the raw window-space depth in [0, 1) -- NOT a distance. It is
 * non-linear for a perspective camera; `depthToDistance` is the other half.
 */
export function unpackDepth([r, g, b, a]) {
    return r / 256 + g / 65536 + b / 16777216 + a / 4294967296;
}

/** The inverse, for the unit tests and for anyone generating a reference. */
export function packDepth(z) {
    const v = Math.min(4294967295, Math.max(0, Math.round(z * 4294967296)));
    return [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
}

/**
 * Window-space depth -> distance from the camera along the view axis, metres.
 *
 * This is three's `perspectiveDepthToViewZ` with the sign flipped, because a
 * film author thinks in distances and not in negative view-space z.
 *
 * An orthographic camera's depth buffer is LINEAR, which is the whole reason
 * `ortho` is a parameter rather than an assumption: the same bytes mean two
 * different distances depending on the projection, and silently applying the
 * perspective formula to an ortho pass is a wrong answer with no symptom.
 */
export function depthToDistance(z, { near = 0.01, far = 200, ortho = false } = {}) {
    if (ortho) return near + z * (far - near);
    return (near * far) / (far - (far - near) * z);
}

/** The inverse. */
export function distanceToDepth(d, { near = 0.01, far = 200, ortho = false } = {}) {
    if (ortho) return (d - near) / (far - near);
    return (far - (near * far) / d) / (far - near);
}

/**
 * Metres per code step at a given distance: the tolerance of a depth pass.
 *
 * A perspective depth buffer spends nearly all its codes near the near
 * plane, so the precision of a depth AOV is a function of where you look.
 * Any claim about a depth pass that does not come with this number is not a
 * claim. d(distance)/d(z) = distance^2 * (far - near) / (near * far).
 */
export function depthQuantum(d, { near = 0.01, far = 200, ortho = false,
                                  bits = DEPTH_BITS } = {}) {
    const step = 1 / 2 ** bits;
    if (ortho) return (far - near) * step;
    return (d * d * (far - near) / (near * far)) * step;
}

/**
 * Three's `packNormalToRGB`, inverted: a view-space unit vector.
 *
 * Renormalised, because 8 bits per axis cannot hold a unit vector exactly
 * and a caller doing arithmetic with a 0.997-long "unit" normal gets slowly
 * wrong answers.
 */
export function decodeNormal([r, g, b]) {
    const v = [r / 127.5 - 1, g / 127.5 - 1, b / 127.5 - 1];
    const len = Math.hypot(...v) || 1;
    return v.map((n) => n / len);
}

/**
 * A node id -> its matte colour. Deterministic, FNV-1a, stable across runs.
 *
 * Deterministic matters more than pretty: the manifest written beside the
 * pass and the colour in the pixels must agree, and a compositor's mask set
 * built against last week's render must still apply this week. A hash over
 * the id gives that for free, where a counter would renumber every node the
 * moment a film gains one.
 *
 * BLACK IS RESERVED for "no object here", so the one colour the background
 * uses is the one colour this never returns.
 */
export function objectColor(id) {
    let h = 0x811c9dc5;
    for (let i = 0; i < id.length; i++) {
        h ^= id.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    return ((h >>> 8) & 0xffffff) || 1;
}

/**
 * The manifest: colour -> id, plus any collisions, by name.
 *
 * 24 bits and a few hundred nodes makes a collision unlikely and not
 * impossible (the birthday bound is about 1 in 5,000 at 300 nodes), and a
 * collision means two objects share a matte -- which looks exactly like a
 * correct render of one object. So it is reported, not hoped about.
 */
export function objectManifest(ids) {
    const byColor = new Map();
    const collisions = [];
    for (const id of ids) {
        const c = objectColor(id);
        if (byColor.has(c)) collisions.push([byColor.get(c), id]);
        else byColor.set(c, id);
    }
    const colors = {};
    for (const [c, id] of byColor) colors[`#${c.toString(16).padStart(6, '0')}`] = id;
    return { colors, collisions };
}

/** One pixel out of a top-down RGBA buffer. */
export function pixelAt(pixels, x, y, width) {
    const i = (y * width + x) * 4;
    return [pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]];
}

/**
 * What fraction of an object pass is a given id's matte.
 *
 * Exact byte equality, deliberately. A blended edge pixel is not a partial
 * membership of two mattes -- it is a third colour that belongs to neither
 * object, and counting it as either is how a mask grows a halo. So this
 * under-reports an antialiased pass, which is why `src/render/aov.js`
 * renders the object pass without multisampling.
 */
export function matteCoverage(pixels, id, width) {
    const want = typeof id === 'number' ? id : objectColor(id);
    const r = (want >> 16) & 255, g = (want >> 8) & 255, b = want & 255;
    let hits = 0;
    const n = pixels.length / 4;
    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] === r && pixels[i + 1] === g && pixels[i + 2] === b) hits++;
    }
    void width;
    return hits / n;
}

/**
 * The near and far of what is actually IN a depth pass, in metres.
 *
 * A packed depth PNG looks WHITE. That is not a bug and it is not a blank
 * pass: with a 0.01 m near plane, red -- the most significant byte -- is
 * saturated for everything beyond 2.56 m, so a scene filmed from three
 * metres away writes 255 into red for every pixel of it and keeps the
 * picture in green and blue. Opening the file and seeing white is the
 * expected experience, and is indistinguishable from the pass having failed.
 *
 * So the range is measured and reported instead of being looked at. `far`
 * here is the furthest SURFACE, with the background excluded, because the
 * background is the far plane by construction and would hide the answer.
 */
export function depthRange(pixels, cam = {}) {
    const far = cam.far ?? 200;
    let min = Infinity, max = -Infinity, covered = 0;
    for (let i = 0; i < pixels.length; i += 4) {
        const d = depthToDistance(
            unpackDepth([pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]]), cam);
        if (d >= far * 0.999) continue;
        covered++;
        if (d < min) min = d;
        if (d > max) max = d;
    }
    return covered
        ? { near: min, far: max, covered: covered / (pixels.length / 4) }
        : { near: 0, far: 0, covered: 0 };
}
