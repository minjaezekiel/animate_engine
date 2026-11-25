/**
 * Colliders from a mesh, so "add physics" is a line rather than a project.
 *
 * `grep -i 'collider\|hull\|convex'` across `src/` returned NOTHING before
 * this file. An imported mesh could not become a rigid body without an author
 * writing a primitive by hand and hand-matching it to geometry they could
 * only see in a render -- which is the manual loop the engine exists to
 * remove, in the one place where getting it wrong is invisible until things
 * start falling through floors.
 *
 * Three shapes, in increasing cost and fidelity, because the right answer is
 * usually not the most accurate one:
 *
 *   box     an AABB. Free, exact for anything box-shaped, and the right
 *           choice for crates, walls, floors and furniture.
 *   sphere  the minimal enclosing sphere, approximately. Cheapest possible
 *           collision test and correct for anything round.
 *   hull    the convex hull of the vertex set. What you want for a rock, a
 *           tool, a vehicle body -- any solid whose silhouette matters and
 *           which has no deep concavity.
 *
 * A concave shape -- a cup, a room, a chain link -- is NOT representable as
 * one convex hull and this module says so rather than returning a hull that
 * silently fills the hollow. That is a real limitation and a loud one is
 * better than a quiet one: a character who cannot walk into a room because
 * its collider is a solid block is a bug that takes an hour to understand.
 *
 * Pure: arrays of numbers in, descriptions out. No engine, no units, no
 * solver. Tested in Node.
 */

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1],
                         a[2] * b[0] - a[0] * b[2],
                         a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.hypot(a[0], a[1], a[2]);

/** Read a flat `[x,y,z,x,y,z,...]` array as points. */
function* points(positions) {
    for (let i = 0; i + 2 < positions.length; i += 3) {
        yield [positions[i], positions[i + 1], positions[i + 2]];
    }
}

/** An axis-aligned box. Free, and exact for most of what a scene is made of. */
export function boxCollider(positions) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    let n = 0;
    for (const p of points(positions)) {
        n++;
        for (let k = 0; k < 3; k++) {
            if (p[k] < min[k]) min[k] = p[k];
            if (p[k] > max[k]) max[k] = p[k];
        }
    }
    if (!n) return null;
    const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    return {
        kind: 'box', min, max, size,
        center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
        volume: size[0] * size[1] * size[2],
    };
}

/**
 * An enclosing sphere, by Ritter's method.
 *
 * Two passes and no iteration: take the most separated pair found along the
 * cardinal axes as a starting diameter, then grow to swallow any stray. It is
 * typically within ~5% of the true minimal sphere, which for a collider is
 * indistinguishable, and it is O(n) where the exact answer is not.
 *
 * Guaranteed to ENCLOSE every point -- asserted in the tests -- because a
 * collider that is slightly too big makes contact slightly early, and one
 * that is slightly too small lets geometry pass through it.
 */
export function sphereCollider(positions) {
    const pts = [...points(positions)];
    if (!pts.length) return null;
    // Six extremes, then the most distant pair among them.
    let minX = pts[0], maxX = pts[0], minY = pts[0], maxY = pts[0], minZ = pts[0], maxZ = pts[0];
    for (const p of pts) {
        if (p[0] < minX[0]) minX = p; if (p[0] > maxX[0]) maxX = p;
        if (p[1] < minY[1]) minY = p; if (p[1] > maxY[1]) maxY = p;
        if (p[2] < minZ[2]) minZ = p; if (p[2] > maxZ[2]) maxZ = p;
    }
    const spans = [[minX, maxX], [minY, maxY], [minZ, maxZ]]
        .map((pair) => ({ pair, d: len(sub(pair[1], pair[0])) }))
        .sort((a, b) => b.d - a.d);
    const [a, b] = spans[0].pair;
    let center = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    let radius = spans[0].d / 2;
    for (const p of pts) {
        const d = len(sub(p, center));
        if (d <= radius) continue;
        // Move the centre just enough to include p while keeping everything
        // already inside: the new sphere spans from the far side of the old
        // one to p.
        const grown = (radius + d) / 2;
        const t = (grown - radius) / d;
        center = [center[0] + (p[0] - center[0]) * t,
                  center[1] + (p[1] - center[1]) * t,
                  center[2] + (p[2] - center[2]) * t];
        radius = grown;
    }
    return { kind: 'sphere', center, radius,
             volume: (4 / 3) * Math.PI * radius ** 3 };
}

/**
 * The convex hull, by incremental insertion (quickhull's core).
 *
 * `limit` caps how many input points are considered, because a 500k-vertex
 * scan asset does not need 500k points to describe its silhouette and the
 * cost here is superlinear in practice. Points are sampled on a STRIDE rather
 * than taken from the front, since the first n vertices of a mesh are
 * typically one corner of it and would give a hull of one corner -- the kind
 * of bug that produces a collider that is right in testing and wrong in the
 * scene.
 */
export function hullCollider(positions, { limit = 20_000, epsilon = 1e-9 } = {}) {
    let pts = [...points(positions)];
    if (pts.length < 4) return null;
    if (pts.length > limit) {
        const stride = Math.ceil(pts.length / limit);
        const sampled = [];
        for (let i = 0; i < pts.length; i += stride) sampled.push(pts[i]);
        // The extremes decide the hull, so they are kept unconditionally
        // whatever the stride did.
        for (let k = 0; k < 3; k++) {
            let lo = pts[0], hi = pts[0];
            for (const p of pts) { if (p[k] < lo[k]) lo = p; if (p[k] > hi[k]) hi = p; }
            sampled.push(lo, hi);
        }
        pts = sampled;
    }

    // --- an initial tetrahedron with real volume
    let i0 = 0, i1 = 1;
    let best = -1;
    for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < Math.min(pts.length, i + 40); j++) {
            const d = len(sub(pts[j], pts[i]));
            if (d > best) { best = d; i0 = i; i1 = j; }
        }
    }
    if (best <= epsilon) return null;         // all points coincident
    const a = pts[i0], b = pts[i1];
    let c = null, area = epsilon;
    for (const p of pts) {
        const ar = len(cross(sub(b, a), sub(p, a)));
        if (ar > area) { area = ar; c = p; }
    }
    if (!c) return null;                      // collinear: no hull
    const n0 = cross(sub(b, a), sub(c, a));
    let d = null, vol = epsilon;
    for (const p of pts) {
        const v = Math.abs(dot(n0, sub(p, a)));
        if (v > vol) { vol = v; d = p; }
    }
    if (!d) return null;                      // coplanar: no hull

    /** A face, as three vertices plus an outward plane. */
    const face = (p, q, r, inside) => {
        let normal = cross(sub(q, p), sub(r, p));
        if (dot(normal, sub(inside, p)) > 0) {
            normal = [-normal[0], -normal[1], -normal[2]];
            return { v: [p, r, q], normal, offset: dot(normal, p) };
        }
        return { v: [p, q, r], normal, offset: dot(normal, p) };
    };
    const centroid = [(a[0] + b[0] + c[0] + d[0]) / 4,
                      (a[1] + b[1] + c[1] + d[1]) / 4,
                      (a[2] + b[2] + c[2] + d[2]) / 4];
    let faces = [face(a, b, c, centroid), face(a, b, d, centroid),
                 face(a, c, d, centroid), face(b, c, d, centroid)];

    // --- add each remaining point outside the current hull
    for (const p of pts) {
        const visible = faces.filter((f) => dot(f.normal, p) - f.offset > epsilon * (1 + Math.abs(f.offset)));
        if (!visible.length) continue;
        // The horizon: edges on exactly one visible face. Those become the
        // rim of the cone to p; edges shared by two visible faces are
        // interior to the removed cap and must not.
        const count = new Map();
        const keyOf = (u, v) => `${u.join()}|${v.join()}`;
        for (const f of visible) {
            for (let k = 0; k < 3; k++) {
                const u = f.v[k], v = f.v[(k + 1) % 3];
                const fwd = keyOf(u, v), rev = keyOf(v, u);
                if (count.has(rev)) count.delete(rev);
                else count.set(fwd, [u, v]);
            }
        }
        const kept = faces.filter((f) => !visible.includes(f));
        /**
         * `centroid` -- the initial tetrahedron's centre -- is the interior
         * reference, for every face, for the whole run.
         *
         * The first version used the centroid of a surviving FACE, which is a
         * point ON the hull and not inside it. Orienting a plane against a
         * point lying in another plane of the same hull gives the wrong sign
         * whenever the two are close to coplanar, so a handful of faces came
         * out inward-facing and the divergence-theorem volume summed to more
         * than the shape could possibly contain -- a hull of points sampled
         * on a sphere measured LARGER than the sphere. The tetrahedron's
         * centroid is strictly interior and stays interior, because a hull
         * only ever grows.
         */
        for (const [u, v] of count.values()) kept.push(face(u, v, p, centroid));
        faces = kept;
    }

    // --- dedupe vertices
    const seen = new Map();
    for (const f of faces) {
        for (const v of f.v) seen.set(v.map((n) => n.toPrecision(9)).join(), v);
    }
    const vertices = [...seen.values()];
    const box = boxCollider(positions);
    return {
        kind: 'hull',
        vertices,
        faces: faces.length,
        // The share of its own bounding box the hull fills. Low means either
        // a genuinely spindly shape or a concave one -- see `colliderFor`.
        fill: box?.volume ? +(hullVolume(faces) / box.volume).toFixed(4) : null,
        volume: hullVolume(faces),
    };
}

/**
 * A closed mesh's own volume, by the divergence theorem over its triangles.
 *
 * This is what makes concavity detectable. Comparing the hull's volume to the
 * BOUNDING BOX's is not good enough and the tests caught it: a solid cylinder
 * fills pi/4 = 79% of its box and so does a hollow pipe, so the box ratio
 * cannot tell a solid from a shell. Comparing the hull to the mesh ITSELF can
 * -- that ratio is `solidity`, and it is the standard measure for this.
 *
 * Needs the index buffer, because a volume integral needs faces and not just
 * a point cloud. Without one the caller gets the weaker box-based signal and
 * is told that is what it is.
 */
export function meshVolume(positions, indices) {
    if (!indices?.length) return null;
    const at = (i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
    let v = 0;
    for (let t = 0; t + 2 < indices.length; t += 3) {
        const p = at(indices[t]), q = at(indices[t + 1]), r = at(indices[t + 2]);
        v += dot(p, cross(q, r)) / 6;
    }
    return Math.abs(v);
}

/** Signed volume by the divergence theorem, summed over the faces. */
function hullVolume(faces) {
    let v = 0;
    for (const f of faces) {
        const [p, q, r] = f.v;
        v += dot(p, cross(q, r)) / 6;
    }
    return Math.abs(v);
}

/**
 * Pick a collider for a mesh, and say why.
 *
 * The heuristic is deliberately crude and deliberately explained, because the
 * author is better placed to overrule it than this function is to be right:
 * a box that fills its own bounds is a box, a hull that fills most of a
 * sphere is a sphere, and anything else is a hull. What matters more than the
 * choice is the WARNING -- a hull filling very little of its bounding box is
 * the signature of a concave shape, and a convex hull of a concave shape is
 * wrong in the specific way that takes an hour to diagnose.
 */
export function colliderFor(positions, { prefer = null, limit = 20_000, indices = null } = {}) {
    const box = boxCollider(positions);
    if (!box) return { collider: null, reason: 'the mesh has no vertices' };
    // An explicit `box` or `sphere` is taken at face value and costs no hull:
    // the author has decided, and building a hull purely to second-guess them
    // is work nobody asked for. `prefer: 'hull'` still gets the advisory,
    // because there the hull had to be built anyway.
    if (prefer === 'box') return { collider: box, reason: 'requested' };
    if (prefer === 'sphere') return { collider: sphereCollider(positions), reason: 'requested' };

    const hull = hullCollider(positions, { limit });
    const solid = hull ? solidityOf(positions, indices, hull) : null;
    /**
     * The concavity advisory is about the MESH, not about which collider won.
     *
     * A hollow box is the clearest case and the first version missed it: the
     * hull fills ~100% of its bounding box, so the "it is a box, use a box"
     * branch returned before anything checked for a hollow -- and a box
     * collider on a room is precisely the failure the warning exists for.
     * Attached to whatever shape is returned, therefore, rather than only to
     * the hull.
     */
    const w = concaveWarning(hull, solid);
    const out = (collider, reason) => ({ collider, reason, ...(w ? { warning: w } : {}) });
    if (prefer === 'hull') return out(hull, 'requested');
    if (!hull) return out(box, 'the vertices are flat or collinear, so there is no hull');

    const sphere = sphereCollider(positions);
    // Within 2% of its own box: it IS a box, and a box test is far cheaper
    // than a hull test.
    if (hull.fill != null && hull.fill > 0.98) {
        return out(box, `the hull fills ${(hull.fill * 100).toFixed(0)}% of its `
            + 'bounding box, so it is a box and a box is cheaper');
    }
    const [sx, sy, sz] = box.size;
    const cubic = Math.max(sx, sy, sz) / Math.max(1e-12, Math.min(sx, sy, sz));
    if (cubic < 1.1 && sphere && hull.volume / sphere.volume > 0.9) {
        return out(sphere, 'near-cubic bounds and the hull fills most of the '
            + 'enclosing sphere, so it is a ball');
    }
    return out(hull, `a convex hull of ${hull.vertices.length} vertices `
        + `filling ${((hull.fill ?? 0) * 100).toFixed(0)}% of its bounding box`
        + (solid != null ? `, solidity ${(solid * 100).toFixed(0)}%` : ''));
}

/** The share of its own convex hull that the mesh actually occupies. */
function solidityOf(positions, indices, hull) {
    const mv = meshVolume(positions, indices);
    if (mv == null || !hull?.volume) return null;
    return mv / hull.volume;
}

/**
 * Warn only when there is real evidence of concavity.
 *
 * With an index buffer the evidence is `solidity`, and it is conclusive.
 * Without one all that is available is the hull's share of its bounding box,
 * which is a weak signal -- a sphere scores 52% and is perfectly convex -- so
 * the threshold is low and the wording says it is a guess. Crying concave at
 * every sphere would train an author to ignore the warning, which costs more
 * than not having it.
 */
function concaveWarning(hull, solidity) {
    if (!hull) return null;
    const advice = ' A convex hull fills the hollow, so things will not be able to get inside '
        + 'it. Split the mesh into convex parts, or use a box per part.';
    if (solidity != null) {
        if (solidity >= 0.5) return null;
        return `this mesh occupies only ${(solidity * 100).toFixed(0)}% of its own convex hull, `
            + 'so the shape is CONCAVE (a cup, a room, a pipe, a frame).' + advice;
    }
    if (hull.fill != null && hull.fill < 0.12) {
        return `this hull fills only ${(hull.fill * 100).toFixed(0)}% of its bounding box, which `
            + 'MAY mean the shape is concave -- there is no index buffer here, so this is a guess '
            + 'from the box alone rather than a measurement.' + advice;
    }
    return null;
}
