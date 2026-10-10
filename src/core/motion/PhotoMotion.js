/**
 * Animate a still picture: 2.5D parallax, Ken Burns, wave, puppet warp.
 *
 * ```js
 * const photo = new PhotoMotion(kernels, {
 *     width: 1280, height: 720,
 *     source: { data, width, height },        // u8 RGBA, straight alpha
 *     depth:  { data, width, height },        // optional, any greyscale image
 *     effects: [
 *         { type: 'kenBurns', to: { zoom: 1.15, x: -0.04 } },
 *         { type: 'parallax', amplitude: 0.05, orbit: [0.03, 0.012] },
 *     ],
 * });
 * photo.renderAt(2.5);          // -> premultiplied f32 RGBA
 * ```
 *
 * # Everything here is one operation
 *
 * All four effects are the same thing: **deform a textured mesh over
 * time**. `warp_mesh` rasterises it, and each effect is just a function
 * that moves vertices. That is why there is no separate code path per
 * effect, why they compose by being applied in sequence, and why adding a
 * fifth is a dozen lines.
 *
 *   - **Ken Burns** moves the four corners. The degenerate case.
 *   - **Parallax** pushes each vertex by its depth times a camera offset,
 *     so near things slide further than far ones.
 *   - **Wave** is a time-varying sinusoid, for water, heat haze, cloth.
 *   - **Puppet** pins some vertices and drags others with a falloff.
 *
 * # Frame N is still a pure function of N
 *
 * `renderAt(t)` reads only `t`. No integrator, no previous frame, no
 * accumulation -- the vertex positions are solved from `t` directly, the
 * same discipline the particle system follows. Scrubbing backwards costs
 * what scrubbing forwards costs.
 *
 * # The honest limit: disocclusion
 *
 * Parallax moves a foreground across a background, which exposes pixels
 * that were never photographed. With a connected mesh the surface
 * *stretches* to cover them rather than tearing, which is the right
 * failure -- a smear reads as motion blur at small amplitudes and as
 * rubber at large ones. There is no inpainting here, so the usable
 * amplitude is bounded by how much stretch the subject tolerates;
 * `amplitude` beyond about 0.08 starts to look like melted plastic on a
 * portrait. Real depth-aware video tools solve this by inpainting the
 * background behind the subject, which needs a generative model and is
 * out of scope.
 */

/** Effects, by name. Exposed so a UI or an agent can enumerate them. */
export const EFFECTS = ['kenBurns', 'parallax', 'wave', 'puppet'];

/**
 * How much larger than the frame the mesh must be, given its effects.
 *
 * Parallax displaces by `amplitude * (depth - focus)`, whose magnitude is
 * bounded by `amplitude * max(focus, 1 - focus)`. A Ken Burns ending
 * below zoom 1 exposes `1/zoom - 1`. Both are covered with a margin,
 * because they compound when a push-out and a drift run together.
 *
 * `test/core/motion.test.mjs` asserts that no frame of a parallax at
 * several amplitudes leaves an uncovered pixel.
 */
function autoOverscan(effects, hasDepth = true) {
    let margin = 0;
    for (const e of effects ?? []) {
        if (e.type === 'parallax') {
            if (!hasDepth) continue;       // it will not run; see `hasDepth`
            const focus = e.focus ?? 0.5;
            margin += (e.amplitude ?? 0.04) * Math.max(focus, 1 - focus);
        } else if (e.type === 'kenBurns') {
            const zoom = Math.min(e.from?.zoom ?? 1, e.to?.zoom ?? 1);
            if (zoom < 1) margin += 1 / zoom - 1;
            margin += Math.max(Math.abs(e.from?.x ?? 0), Math.abs(e.to?.x ?? 0),
                Math.abs(e.from?.y ?? 0), Math.abs(e.to?.y ?? 0));
        } else if (e.type === 'wave') {
            margin += e.amplitude ?? 0.005;
        } else if (e.type === 'puppet') {
            for (const pin of e.pins ?? []) {
                margin = Math.max(margin, Math.abs(pin.to[0] - pin.at[0]),
                    Math.abs(pin.to[1] - pin.at[1]));
            }
        }
    }
    // Doubled, because `overscan` scales the mesh about its centre: a
    // factor of `1 + m` puts only `m / 2` outside each edge, while the
    // displacement being covered is per-side. Getting this wrong leaves
    // exactly one uncovered row at the boundary -- which is what it did,
    // and which is easy to dismiss as antialiasing.
    //
    // The extra 10% is slack for the bilinear tap at the very edge and
    // for effects whose extremes do not coincide.
    return 1 + margin * 2.2;
}

/**
 * How far the far layer must reach under the near one, in pixels.
 *
 * A tear opens a hole exactly as wide as the relative displacement of the
 * two sides, which for parallax is `amplitude * reach * depthSpan * width`.
 * The far layer is extended by that much so there is picture to show in
 * the hole instead of nothing -- see [`tearMesh`].
 *
 * Only parallax is counted: Ken Burns, wave and puppet move the whole
 * surface together, so they open no hole at a depth edge.
 */
function autoFill(effects, width, span) {
    let fill = 0;
    for (const e of effects ?? []) {
        if (e.type !== 'parallax') continue;
        const reach = Array.isArray(e.path) && e.path.length
            ? Math.max(...e.path.map(([x, y]) => Math.max(Math.abs(x), Math.abs(y))))
            : Math.max(...(e.orbit ?? [1, 0.4]).map(Math.abs));
        fill += (e.amplitude ?? 0.04) * width * reach * span;
    }
    return fill * 1.2;       // slack, as in `autoOverscan`
}

/**
 * Cut the mesh along depth iso-contours so a near object separates from
 * its background instead of stretching into it.
 *
 * # What the connected mesh does wrong
 *
 * A single grid is one continuous surface, so the cell that straddles a
 * silhouette has one corner on the subject and one on the background.
 * Parallax sends those corners opposite ways and the cell *stretches
 * across the gap* -- the subject's edge smears outward and, at any
 * useful amplitude, the face turns to rubber. Blurring the depth map
 * (see [`blurDepth`]) spreads the damage over several cells and makes it
 * a gradual shear rather than a pinned edge, but the surface is still
 * connected and the subject still deforms.
 *
 * # The cut
 *
 * For each global `level`, every triangle whose vertices do not all lie
 * on one side of it is cut along the contour. The lone vertex gives one
 * sub-triangle, the other two give a quad, and both keep the original
 * winding. The crossing points are **duplicated**: the near side's copy
 * takes the depth of the near endpoint of the edge it sits on, the far
 * side's copy takes the far endpoint's. So the surface is genuinely torn,
 * and the near piece now moves rigidly at its own depth.
 *
 * Two properties make this safe to do per triangle:
 *
 *   - **The original vertices keep their own depth.** Only crossing
 *     points are duplicated, so every vertex shared with a neighbouring
 *     triangle still has exactly one position -- there are no cracks
 *     anywhere except along the contour, where a crack is the point.
 *   - **A crossing point is defined by its edge alone**, not by the
 *     triangle being cut, so the two triangles sharing an edge agree on
 *     it to the last bit. That is why `seam` is keyed on the edge.
 *
 * There is deliberately **no "is this edge sharp enough" threshold**. The
 * size of a tear is already proportional to the depth jump across it, so
 * a cut through a smooth gradient separates the two sides by an
 * imperceptible amount while a cut through a silhouette separates them
 * fully. A threshold would only buy inconsistency: an edge cut in one
 * triangle and left whole in its neighbour is a visible hairline.
 *
 * # Filling the hole
 *
 * A tear with nothing behind it is *worse* than a smear -- the subject
 * slides away and uncovers transparent nothing. So the far side's copy of
 * each crossing point is pushed `fill` pixels **past** the contour while
 * its uv steps the same distance **back**, which mirrors the strip of
 * background lying just behind the silhouette forward over the hole. It
 * is hidden under the near piece until the tear opens, and then it is
 * what fills the hole.
 *
 * Mirroring, rather than continuing the uv along with the position: the
 * latter is one sign away and looks right on paper, but it carries the
 * *subject's* own edge pixels into the hole, so the silhouette appears
 * not to move at all. Measured on a hard depth step it left the visible
 * edge within a pixel of where the untorn mesh put it.
 *
 * Mirrored background is still not inpainting -- the honest limit of
 * doing this without a generative model, documented in
 * `docs/17-MOTION-AND-MCP.md` -- and the far triangle that does the
 * mirroring has a different texture map from its neighbours, so there is
 * a seam in the background at the contour. It sits under the near piece,
 * and only the part of it inside the hole is ever seen.
 *
 * # Draw order
 *
 * `warp_mesh` has no depth test: it writes, and the last triangle over a
 * pixel wins. Torn triangles overlap by construction, so they are
 * emitted **far to near** and the near piece paints over the fill behind
 * it. The sort is by mean depth and `Array.prototype.sort` is stable, so
 * ties keep grid order and the result stays deterministic.
 *
 * @param {{verts: number[], uvs: number[], depths: number[], indices: number[]}} mesh
 * @param {number[]} levels   depth values to cut along, each in 0..1
 * @param {number} fill       pixels the far side reaches past the contour
 * @returns {{verts: number[], uvs: number[], depths: number[], indices: number[]}}
 */
export function tearMesh(mesh, levels, fill) {
    let m = mesh;
    for (const level of levels) m = cutAtLevel(m, level, fill);

    const d = m.depths;
    const tris = m.indices.length / 3;
    const mean = (t) => (d[m.indices[t * 3]] + d[m.indices[t * 3 + 1]]
                       + d[m.indices[t * 3 + 2]]) / 3;
    const order = Array.from({ length: tris }, (_, t) => t)
        .sort((a, b) => mean(a) - mean(b));
    const indices = [];
    for (const t of order) {
        indices.push(m.indices[t * 3], m.indices[t * 3 + 1], m.indices[t * 3 + 2]);
    }
    return { verts: m.verts, uvs: m.uvs, depths: d, indices };
}

/** One iso-contour cut. See [`tearMesh`] for the whole argument. */
function cutAtLevel({ verts, uvs, depths, indices }, level, fill) {
    const v = verts.slice(), u = uvs.slice(), d = depths.slice();
    const out = [];
    const seam = new Map();

    const push = (x, y, s, t, depth) => {
        const i = d.length;
        v.push(x, y); u.push(s, t); d.push(depth);
        return i;
    };

    /**
     * The two copies of the point where the edge `near -> far` crosses
     * `level`: `[nearCopy, farCopy]`. Keyed on the unordered edge so both
     * triangles sharing it get the identical pair of vertices.
     */
    const cross = (near, far) => {
        const key = near < far ? `${near},${far}` : `${far},${near}`;
        const hit = seam.get(key);
        if (hit) return hit;

        const span = d[near] - d[far];
        // Guarded rather than asserted: a level sitting exactly on both
        // endpoints is a legitimate input, and the midpoint is as good a
        // crossing as any.
        const t = Math.abs(span) < 1e-9 ? 0.5 : (level - d[far]) / span;
        const [fx, fy] = [v[far * 2], v[far * 2 + 1]];
        const [dx, dy] = [v[near * 2] - fx, v[near * 2 + 1] - fy];
        const [fu, fv] = [u[far * 2], u[far * 2 + 1]];
        const [du, dv] = [u[near * 2] - fu, u[near * 2 + 1] - fv];

        const nearIdx = push(fx + dx * t, fy + dy * t,
                             fu + du * t, fv + dv * t, d[near]);
        // The far copy reaches `fill` px *past* the contour while its uv
        // steps the same distance *back* into the far side -- so the strip
        // of background just behind the silhouette is mirrored forward
        // across the hole. Advancing the uv with the position instead
        // would carry the subject's own edge pixels into the hole, which
        // reads as the subject smearing: the exact artefact the tear
        // exists to remove. Measured on a hard step, that mistake left the
        // visible silhouette at the untorn position.
        const len = Math.hypot(dx, dy) || 1;
        const k = fill / len;
        const farIdx = push(fx + dx * (t + k), fy + dy * (t + k),
                            fu + du * (t - k), fv + dv * (t - k), d[far]);

        const pair = [nearIdx, farIdx];
        seam.set(key, pair);
        return pair;
    };

    for (let t = 0; t < indices.length; t += 3) {
        const tri = [indices[t], indices[t + 1], indices[t + 2]];
        const near = tri.map((i) => d[i] > level);
        const count = (near[0] ? 1 : 0) + (near[1] ? 1 : 0) + (near[2] ? 1 : 0);
        if (count === 0 || count === 3) {
            out.push(tri[0], tri[1], tri[2]);
            continue;
        }

        // Rotate so the vertex that is alone on its side comes first. That
        // collapses six cases to one and preserves winding, because a
        // rotation of a triangle's vertices is the same triangle.
        const lone = count === 1 ? near.indexOf(true) : near.indexOf(false);
        const [L, A, B] = [tri[lone], tri[(lone + 1) % 3], tri[(lone + 2) % 3]];
        const [pa, pb] = near[lone]
            ? [cross(L, A), cross(L, B)]
            : [cross(A, L), cross(B, L)];
        // Which copy each side takes: the lone side gets 0 (the near copy)
        // when the lone vertex is the near one, and 1 otherwise.
        const s = near[lone] ? 0 : 1;
        const o = 1 - s;
        out.push(L, pa[s], pb[s]);
        out.push(pa[o], A, B);
        out.push(pa[o], B, pb[o]);
    }

    return { verts: v, uvs: u, depths: d, indices: out };
}

/** Smoothstep, used by every effect that needs an eased parameter. */
const smooth = (t) => t * t * (3 - 2 * t);

/** Linear interpolation that tolerates missing endpoints. */
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Sample a greyscale depth image at normalised `(u, v)`, bilinearly.
 *
 * Bilinear rather than nearest, unlike the grain texture: a depth map is
 * a *smooth* field, and nearest sampling quantises it into terraces that
 * show up as visible steps marching across the picture as the camera
 * moves. This is the opposite call from `stamp_mask`'s, for the opposite
 * reason, which is worth noticing rather than copying either blindly.
 */
function sampleDepth(depth, u, v) {
    if (!depth) return 0;
    const { data, width: w, height: h } = depth;
    const fx = Math.min(w - 1, Math.max(0, u * w - 0.5));
    const fy = Math.min(h - 1, Math.max(0, v * h - 0.5));
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
    const tx = fx - x0, ty = fy - y0;
    const at = (x, y) => {
        const i = (y * w + x) * 4;
        // A depth map is greyscale, so a flat average is right; the
        // perceptual luminance weights in `blend.js` would make a blue
        // channel count for a twentieth of a green one, which is
        // meaningless for a distance.
        return (data[i] + data[i + 1] + data[i + 2]) / 765;
    };
    return lerp(lerp(at(x0, y0), at(x1, y0), tx), lerp(at(x0, y1), at(x1, y1), tx), ty);
}

/**
 * Blur a depth image, returning a new one in the same u8 RGBA shape.
 *
 * Runs through the `blur_rgba` kernel rather than a hand-rolled loop: it
 * is three running-sum box passes, so the cost is independent of radius,
 * and a depth map wants a generous radius. See `docs/15-PERFORMANCE.md`.
 *
 * The buffers are freed before returning. A depth map is read once, at
 * construction, so holding kernel memory for it would be waste that
 * accumulates with every photo in a film.
 */
function blurDepth(kernels, depth, fraction) {
    if (!depth || fraction <= 0) return depth;
    const { width: w, height: h } = depth;
    const radius = Math.max(1, Math.round(w * fraction));
    const n = w * h;

    const buf = kernels.f32(n * 4);
    const scratch = kernels.f32(n * 4);
    try {
        const b = buf.array;
        for (let i = 0; i < n; i++) {
            // Premultiplied, with alpha 1 throughout: the kernel divides
            // by the window's sample count, and a depth map has no
            // transparency to carry.
            b[i * 4] = depth.data[i * 4] / 255;
            b[i * 4 + 1] = depth.data[i * 4 + 1] / 255;
            b[i * 4 + 2] = depth.data[i * 4 + 2] / 255;
            b[i * 4 + 3] = 1;
        }
        kernels.blurRgba(buf, scratch, w, h, radius);

        const out = new Uint8Array(n * 4);
        const r = buf.array;
        for (let i = 0; i < n * 4; i++) {
            out[i] = Math.max(0, Math.min(255, Math.round(r[i] * 255)));
        }
        return { data: out, width: w, height: h };
    } finally {
        buf.free();
        scratch.free();
    }
}

export class PhotoMotion {
    /**
     * @param {import('../../kernels/index.js').Kernels} kernels
     * @param {object} spec
     * @param {number} spec.width            output width
     * @param {number} spec.height           output height
     * @param {{data: Uint8Array, width: number, height: number}} spec.source
     * @param {{data: Uint8Array, width: number, height: number}} [spec.depth]
     * @param {number} [spec.depthBlur=0.02]
     *   Depth softening, as a fraction of width. Set 0 to disable, which
     *   is almost always wrong -- see `blurDepth`.
     * @param {Array<object>} [spec.effects]
     * @param {number} [spec.grid=32]        quads across the mesh
     * @param {number} [spec.overscan]
     *   Mesh size relative to the frame. Derived from the effects when
     *   omitted; raising it crops more of the source, lowering it risks
     *   uncovering the frame edge.
     * @param {number} [spec.duration=1]     seconds the effects span
     * @param {object} [options]
     * @param {import('../../kernels/parallel.js').ParallelKernels} [options.pool]
     */
    constructor(kernels, spec, { pool } = {}) {
        this.kernels = kernels;
        this.pool = pool ?? null;
        this.spec = spec;
        this.width = spec.width;
        this.height = spec.height;
        this.duration = spec.duration ?? 1;
        this.effects = spec.effects ?? [];

        // A denser grid follows depth more closely and stretches less at
        // a given amplitude, but costs triangles. 32 is a good default:
        // at 1280 wide a cell is 40px, finer than most depth maps resolve.
        const div = Math.max(1, spec.grid ?? 32);
        this.div = div;
        const n = div + 1;
        // Overwritten after a tear, which appends vertices.
        this.vertexCount = n * n;

        // Overscan: build the mesh larger than the frame.
        //
        // Parallax pushes the background *inward* on one side, which
        // uncovers the frame edge -- a bright band marching along the
        // border, instantly recognisable and instantly disqualifying.
        // Ken Burns zooming out below 1 does the same thing.
        //
        // The fix is to start with more picture than the frame shows, so
        // there is something to pull in from. The default is derived from
        // the effects rather than left to the author, because the author
        // cannot be expected to compute it and the failure is silent
        // until someone watches a border.
        this.overscan = spec.overscan
            ?? autoOverscan(this.effects, !!spec.depth);

        // Soften the depth map before anything displaces by it.
        //
        // This is not optional polish. The mesh is continuous, so a hard
        // depth edge pins the silhouette: vertices inside the subject move
        // one way, vertices a cell outside move the other, and the subject
        // *stretches in place* instead of sliding. Blurring spreads that
        // discontinuity over several cells, which turns a pinned edge into
        // a gradual shear -- still not a true separation, but the
        // difference between "the face wobbles" and "the face moves".
        //
        // The radius is a fraction of width so it is resolution
        // independent, and the blur runs at the depth map's own size,
        // which is usually far smaller than the output.
        /**
         * Whether a depth map was supplied at all.
         *
         * Without one, every vertex reads depth 0, so `depth - focus` is
         * the same constant everywhere and parallax degenerates into a
         * uniform pan. That is a surprising thing for an effect named
         * "parallax" to do -- measured, it drifted the whole frame by
         * nearly 8 pixels -- so it is skipped instead, and `photo_create`
         * says so in its result.
         */
        this.hasDepth = !!spec.depth;

        /**
         * Whether the mesh is cut at depth discontinuities. See [`tearMesh`].
         *
         * `tear` turns the depth blur **off** by default, because the blur
         * exists only to soften the pinned silhouette that tearing removes
         * outright: blurring a map that is about to be cut just moves the
         * cut off the real edge.
         */
        this.tear = !!spec.tear && this.hasDepth;
        const blur = spec.depthBlur ?? (this.tear ? 0 : 0.02);
        const depth = blur === 0 ? spec.depth : blurDepth(kernels, spec.depth, blur);

        // Built as plain arrays rather than typed ones because tearing
        // *appends* vertices, and the count is not known until the cut has
        // run. They are converted once, below.
        const mesh = { verts: [], uvs: [], depths: [], indices: [] };
        for (let r = 0; r < n; r++) {
            for (let c = 0; c < n; c++) {
                const u = c / div, v = r / div;
                mesh.uvs.push(u, v);
                // Placed with overscan about the frame centre, while the
                // uv stays 0..1 -- so the same picture covers a larger
                // area and the edges have somewhere to come from.
                mesh.verts.push(
                    spec.width / 2 + (u * spec.width - spec.width / 2) * this.overscan,
                    spec.height / 2 + (v * spec.height - spec.height / 2) * this.overscan);
                mesh.depths.push(sampleDepth(depth, u, v));
            }
        }
        for (let r = 0; r < div; r++) {
            for (let c = 0; c < div; c++) {
                const i = r * n + c;
                mesh.indices.push(i, i + 1, i + n + 1, i, i + n + 1, i + n);
            }
        }

        // Cut the surface at depth discontinuities, so a near object
        // separates instead of stretching across the gap.
        //
        // The levels default to the midpoint of the depth actually present
        // on the mesh, which for a subject against a background sits in
        // the gap between them. An author who knows better passes
        // `tear: { at: 0.6 }`, or several levels for several planes --
        // cutting is a fold over levels, so more cost nothing but time.
        if (this.tear) {
            const lo = Math.min(...mesh.depths), hi = Math.max(...mesh.depths);
            const opts = typeof spec.tear === 'object' ? spec.tear : {};
            const at = opts.at ?? (lo + hi) / 2;
            this.tearLevels = (Array.isArray(at) ? at : [at]);
            this.tearFill = opts.fill != null
                ? opts.fill * spec.width
                : autoFill(this.effects, spec.width, hi - lo);
            Object.assign(mesh, tearMesh(mesh, this.tearLevels, this.tearFill));
        }

        this.vertexCount = mesh.depths.length;
        this.triangleCount = mesh.indices.length / 3;
        this.baseVerts = Float32Array.from(mesh.verts);
        this.depths = Float32Array.from(mesh.depths);
        // Kept on the instance because `wave` needs a vertex's uv: after a
        // tear the vertices are no longer a grid, so a row/column index is
        // not a thing any more.
        this.uvArray = Float32Array.from(mesh.uvs);
        const uvs = this.uvArray;
        const indices = mesh.indices;

        // Kernel buffers, allocated once. `verts` is rewritten per frame;
        // the rest never change, which is why the mesh is built here and
        // not in `renderAt`.
        this.src = kernels.u8(spec.source.data.length);
        this.src.array.set(spec.source.data);
        this.uvs = kernels.from(uvs);
        this.indices = kernels.from(Uint32Array.from(indices), Uint32Array);
        this.verts = kernels.f32(this.vertexCount * 2);
        this.dst = kernels.f32(spec.width * spec.height * 4);
        this._u8buf = null;
    }

    /**
     * Normalised time, clamped.
     *
     * Clamped rather than wrapped so a photo held past the end of its
     * animation stays at its final framing instead of snapping back to
     * the start -- which on a cut reads as a glitch.
     */
    _phase(t) {
        return this.duration > 0 ? Math.min(1, Math.max(0, t / this.duration)) : 0;
    }

    /**
     * Solve vertex positions at time `t` and write them into `verts`.
     *
     * Effects are applied in order, each reading the positions the
     * previous one produced. That makes composition obvious -- a parallax
     * inside a Ken Burns push is just the two in that order -- at the cost
     * of making order significant, which it genuinely is.
     */
    solveAt(t) {
        const out = this.verts.array;
        out.set(this.baseVerts);
        const phase = this._phase(t);

        for (const effect of this.effects) {
            switch (effect.type) {
                case 'kenBurns': applyKenBurns(out, this, effect, phase); break;
                // Skipped without a depth map: see `hasDepth`.
                case 'parallax':
                    if (this.hasDepth) applyParallax(out, this, effect, phase, t);
                    break;
                case 'wave': applyWave(out, this, effect, t); break;
                case 'puppet': applyPuppet(out, this, effect, phase); break;
                default: break;      // unknown effects are ignored, never thrown on
            }
        }
        return this.verts;
    }

    /** Rasterise the frame at `t`. Returns the premultiplied f32 buffer. */
    renderAt(t) {
        this.solveAt(t);
        const { width: w, height: h, kernels: K } = this;
        K.clearF32(this.dst, w * h * 4);
        K.warpMesh(this.src, this.spec.source.width, this.spec.source.height,
            this.dst, w, h, this.verts, this.uvs, this.indices,
            this.triangleCount, this.vertexCount);
        return this.dst;
    }

    /**
     * As [`renderAt`], across the worker pool.
     *
     * This is the call that matters at full resolution: a 1080p warp is
     * 91 ms single-threaded and 18 ms pooled, against a 41.67 ms frame
     * budget. See `docs/15-PERFORMANCE.md`.
     */
    async renderAtAsync(t) {
        if (!this.pool) return this.renderAt(t);
        this.solveAt(t);
        const { width: w, height: h } = this;
        this.kernels.clearF32(this.dst, w * h * 4);
        await this.pool.warpMesh(this.src, this.spec.source.width, this.spec.source.height,
            this.dst, w, h, this.verts, this.uvs, this.indices,
            this.triangleCount, this.vertexCount);
        return this.dst;
    }

    /** Straight u8 RGBA at `t`. */
    imageDataAt(t, target) {
        this.renderAt(t);
        const n = this.width * this.height;
        if (!this._u8buf) this._u8buf = this.kernels.u8(n * 4);
        this.kernels.maskToRgba8(this.dst, this._u8buf, n);
        if (target) { target.set(this._u8buf.array); return target; }
        return Uint8Array.from(this._u8buf.array);
    }

    dispose() {
        for (const b of [this.src, this.uvs, this.indices, this.verts, this.dst, this._u8buf]) {
            b?.free();
        }
        this._u8buf = null;
    }
}

/**
 * Ken Burns: an eased pan and zoom about a centre.
 *
 * Zoom is applied as a scale about the frame centre and pan in fractions
 * of the frame, so a move reads the same at any output size -- an author
 * writing `x: -0.04` means "four percent of the frame left", not forty
 * pixels, and the same film renders correctly at 720p and 4K.
 *
 * The motion is smoothstepped. A linear Ken Burns starts and stops
 * abruptly, and on a slow push that is the single most noticeable thing
 * in the shot.
 */
function applyKenBurns(out, photo, effect, phase) {
    const from = effect.from ?? {};
    const to = effect.to ?? {};
    const e = effect.ease === 'linear' ? phase : smooth(phase);

    const zoom = lerp(from.zoom ?? 1, to.zoom ?? 1, e);
    const dx = lerp(from.x ?? 0, to.x ?? 0, e) * photo.width;
    const dy = lerp(from.y ?? 0, to.y ?? 0, e) * photo.height;
    const cx = photo.width / 2, cy = photo.height / 2;

    for (let i = 0; i < photo.vertexCount; i++) {
        out[i * 2] = cx + (out[i * 2] - cx) * zoom + dx;
        out[i * 2 + 1] = cy + (out[i * 2 + 1] - cy) * zoom + dy;
    }
}

/**
 * 2.5D parallax: displace each vertex by its depth times a camera offset.
 *
 * `focus` is the depth that stays still -- the plane the camera is
 * pointed at. Everything nearer moves one way and everything further the
 * other, which is what sells the effect: a parallax where *everything*
 * moves in the same direction is just a pan.
 *
 * The camera offset comes from `orbit`, a slow ellipse, or from an
 * explicit `path` of `[x, y]` pairs sampled across the phase. An orbit is
 * the right default because a photograph has no real camera path and a
 * gentle continuous drift is what the effect wants; a straight line
 * arrives at an end and stops, which draws attention to the limit.
 */
function applyParallax(out, photo, effect, phase, t) {
    const amplitude = (effect.amplitude ?? 0.04) * photo.width;
    const focus = effect.focus ?? 0.5;
    let ox, oy;

    if (Array.isArray(effect.path) && effect.path.length >= 2) {
        const span = effect.path.length - 1;
        const at = phase * span;
        const i = Math.min(span - 1, Math.floor(at));
        const f = at - i;
        ox = lerp(effect.path[i][0], effect.path[i + 1][0], f);
        oy = lerp(effect.path[i][1], effect.path[i + 1][1], f);
    } else {
        const [ax, ay] = effect.orbit ?? [1, 0.4];
        const speed = effect.speed ?? 1;
        const angle = 2 * Math.PI * speed * (effect.useTime === false ? phase : t / photo.duration);
        ox = Math.sin(angle) * ax;
        oy = Math.cos(angle) * ay;
    }

    const aspect = photo.height / photo.width;
    for (let i = 0; i < photo.vertexCount; i++) {
        const d = photo.depths[i] - focus;
        out[i * 2] += d * ox * amplitude;
        out[i * 2 + 1] += d * oy * amplitude * aspect;
    }
}

/**
 * A travelling sinusoid, for water, heat haze or cloth.
 *
 * Reads each vertex's uv rather than walking the grid by row and column:
 * after a tear the vertices are no longer a grid, and indexing by row
 * would leave every duplicated vertex un-waved -- which is a crack along
 * the tear rather than a missing ripple.
 */
function applyWave(out, photo, effect, t) {
    const amp = (effect.amplitude ?? 0.005) * photo.height;
    const wavelength = Math.max(1e-3, effect.wavelength ?? 0.3);
    const speed = effect.speed ?? 0.5;
    const axis = effect.axis ?? 'y';
    // `mask` confines the wave to part of the frame -- water below the
    // horizon, say -- as a normalised v range. Without it the whole
    // picture ripples, which never looks like water.
    const [v0, v1] = effect.range ?? [0, 1];

    for (let i = 0; i < photo.vertexCount; i++) {
        const u = photo.uvArray[i * 2], v = photo.uvArray[i * 2 + 1];
        if (v < v0 || v > v1) continue;
        // Fade in from the boundary so the wave does not start abruptly
        // at a hard line, which reads as a seam.
        const edge = Math.min(1, Math.min(v - v0, v1 - v) / Math.max(1e-6, (v1 - v0) * 0.25));
        const along = axis === 'y' ? u : v;
        const d = Math.sin((along / wavelength + t * speed) * 2 * Math.PI) * amp * smooth(edge);
        if (axis === 'y') out[i * 2 + 1] += d;
        else out[i * 2] += d;
    }
}

/**
 * Puppet warp: drag pinned points and let the surface follow.
 *
 * Each pin moves from `at` to `to` over the phase, and pulls nearby
 * vertices with a smooth falloff over `radius`. Influences are summed, so
 * two pins pulling the same region share it rather than one winning --
 * which is what makes a two-handed gesture look like one surface rather
 * than two competing ones.
 *
 * Coordinates are normalised, like every other effect here.
 */
function applyPuppet(out, photo, effect, phase) {
    const pins = effect.pins ?? [];
    if (!pins.length) return;
    const e = effect.ease === 'linear' ? phase : smooth(phase);
    const defaultRadius = effect.radius ?? 0.25;

    for (let i = 0; i < photo.vertexCount; i++) {
        const bx = photo.baseVerts[i * 2] / photo.width;
        const by = photo.baseVerts[i * 2 + 1] / photo.height;
        let dx = 0, dy = 0;
        for (const pin of pins) {
            const radius = pin.radius ?? defaultRadius;
            const dist = Math.hypot(bx - pin.at[0], by - pin.at[1]);
            if (dist >= radius) continue;
            const w = smooth(1 - dist / radius);
            dx += (pin.to[0] - pin.at[0]) * w * e;
            dy += (pin.to[1] - pin.at[1]) * w * e;
        }
        out[i * 2] += dx * photo.width;
        out[i * 2 + 1] += dy * photo.height;
    }
}
