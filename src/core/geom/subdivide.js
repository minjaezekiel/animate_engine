/**
 * Subdivision: more surface where a film needs more surface.
 *
 * # Two different needs, one algorithm
 *
 * **Smoothing.** A coarse mesh -- an imported model, a boolean result, a
 * low-segment primitive -- has visible facets on its silhouette, and no
 * amount of shading fixes a silhouette. Loop subdivision splits every
 * triangle into four *and moves the vertices*, converging on a smooth limit
 * surface.
 *
 * **Density.** A displacement map moves vertices along their normals, so it
 * can only move the vertices that exist: `displacementMap` on a twelve-
 * triangle box moves eight corners and does nothing else. That need is the
 * same split *without* the smoothing, because the shape must not change
 * before the height field is applied to it.
 *
 * So one function and one flag. `smooth: false` is the same 1-to-4 split with
 * the repositioning skipped, which is why it preserves the volume exactly --
 * nothing moves -- and that is the test.
 *
 * # Why Loop and not Catmull-Clark
 *
 * [43-DCC-PARITY.md §5.6](../../../docs/pending/43-DCC-PARITY.md) specified
 * Catmull-Clark. Catmull-Clark subdivides **quads**, and every geometry this
 * engine builds is triangles -- it is what a `BufferGeometry` is. Loop is the
 * triangle-mesh equivalent, published for exactly that reason, and its limit
 * surface is C² everywhere except at extraordinary vertices, which is the
 * same guarantee.
 *
 * # Why it is here, and pure
 *
 * Arithmetic over two typed arrays, like `uv.js` and `csg.js`: unit-tested in
 * Node with no browser and no GPU. It runs **once, at build time**; the
 * backend's share is reading `position` and writing back a subdivided
 * geometry.
 *
 * ponytail: 4^n growth is the ceiling and it is a steep one -- a 30,000
 * triangle globe at two levels is 480,000 -- so the compiler caps the levels
 * and says what the result costs. The upgrade path is the one the plan names:
 * the inner loop is a kernel candidate. Nothing has needed it: the measured
 * cost is milliseconds for the meshes a film actually subdivides.
 */

/** Positions within this distance are the same vertex. One micron. */
export const WELD = 1e-6;

/** Levels above this are a mistake, not a choice: 4^5 is 1,024x the faces. */
export const MAX_LEVELS = 4;

/**
 * Weld a triangle soup into a vertex graph.
 *
 * A soup from THREE repeats a position once per face that touches it -- that
 * is what makes flat shading possible -- and subdivision needs to know that
 * those are one vertex, or every triangle subdivides into its own detached
 * island. Quantised, because two faces computing the same corner from
 * different transforms land within float error of each other rather than on
 * it.
 *
 * The first UV seen at a position wins. A seam -- where one position carries
 * two UVs so the texture can wrap -- therefore loses one of them, and the
 * cost is that a subdivided seam's texture is interpolated from the wrong
 * side for one triangle's width. That is the trade this module takes: the
 * alternative is to not weld, and not welding does not subdivide at all.
 */
export function weld({ positions, uvs = null }, epsilon = WELD) {
    const q = (x) => Math.round(x / epsilon);
    const index = new Map();
    const verts = [];
    const vertUV = [];
    const faces = [];
    for (let i = 0; i + 8 < positions.length; i += 9) {
        const tri = [];
        for (let k = 0; k < 3; k++) {
            const p = i + k * 3;
            const key = `${q(positions[p])},${q(positions[p + 1])},${q(positions[p + 2])}`;
            let at = index.get(key);
            if (at === undefined) {
                at = verts.length;
                index.set(key, at);
                verts.push([positions[p], positions[p + 1], positions[p + 2]]);
                const u = uvs ? ((i / 9) * 3 + k) * 2 : -1;
                vertUV.push(uvs ? [uvs[u] ?? 0, uvs[u + 1] ?? 0] : [0, 0]);
            }
            tri.push(at);
        }
        // A triangle whose corners welded together is a sliver with no area.
        if (tri[0] !== tri[1] && tri[1] !== tri[2] && tri[0] !== tri[2]) faces.push(tri);
    }
    return { verts, vertUV, faces };
}

const edgeKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * One level of Loop subdivision.
 *
 * Interior edge point: `3/8 (a + b) + 1/8 (c + d)`, where c and d are the
 * corners opposite the edge in its two faces. Boundary edge: the midpoint,
 * which is what keeps an open edge where the author put it.
 *
 * Interior vertex: `(1 - n*beta) v + beta * sum(neighbours)` with Warren's
 * beta -- 3/16 at valence three, 3/(8n) above it. Boundary vertex:
 * `1/8 prev + 3/4 v + 1/8 next`, the cubic B-spline rule, so a boundary
 * curve smooths along itself and does not pull inward.
 *
 * `smooth: false` skips both rules and keeps the midpoints, which is a plain
 * 1-to-4 split: more vertices, same surface.
 */
function subdivideOnce({ verts, vertUV, faces }, smooth) {
    const edges = new Map();
    for (const [i, f] of faces.entries()) {
        for (let k = 0; k < 3; k++) {
            const a = f[k], b = f[(k + 1) % 3], c = f[(k + 2) % 3];
            const key = edgeKey(a, b);
            let e = edges.get(key);
            if (!e) edges.set(key, (e = { a, b, opposite: [], faces: [] }));
            e.opposite.push(c);
            e.faces.push(i);
        }
    }

    // Neighbours, and which vertices sit on a boundary.
    const neighbours = verts.map(() => new Set());
    const onBoundary = verts.map(() => false);
    const boundaryNeighbours = verts.map(() => []);
    for (const e of edges.values()) {
        neighbours[e.a].add(e.b);
        neighbours[e.b].add(e.a);
        if (e.faces.length === 1) {
            onBoundary[e.a] = onBoundary[e.b] = true;
            boundaryNeighbours[e.a].push(e.b);
            boundaryNeighbours[e.b].push(e.a);
        }
    }

    // --- moved originals
    const out = [];
    const outUV = [];
    for (const [i, v] of verts.entries()) {
        if (!smooth) { out.push([...v]); outUV.push([...vertUV[i]]); continue; }
        if (onBoundary[i]) {
            const [p, n] = boundaryNeighbours[i];
            if (p === undefined || n === undefined) { out.push([...v]); }
            else {
                out.push(v.map((x, k) => 0.75 * x + 0.125 * (verts[p][k] + verts[n][k])));
            }
        } else {
            const ns = [...neighbours[i]];
            const n = ns.length;
            const beta = n === 3 ? 3 / 16 : 3 / (8 * n);
            const sum = [0, 0, 0];
            for (const j of ns) for (let k = 0; k < 3; k++) sum[k] += verts[j][k];
            out.push(v.map((x, k) => (1 - n * beta) * x + beta * sum[k]));
        }
        // UVs are NOT smoothed. Loop's rule applied to a texture coordinate
        // shrinks the layout a little every level, which reads as the texture
        // creeping; the position is what has to be smooth.
        outUV.push([...vertUV[i]]);
    }

    // --- edge points
    const midpoint = new Map();
    for (const [key, e] of edges) {
        const a = verts[e.a], b = verts[e.b];
        let p;
        if (!smooth || e.faces.length !== 2) {
            p = a.map((x, k) => (x + b[k]) / 2);
        } else {
            const c = verts[e.opposite[0]], d = verts[e.opposite[1]];
            p = a.map((x, k) => 0.375 * (x + b[k]) + 0.125 * (c[k] + d[k]));
        }
        midpoint.set(key, out.length);
        out.push(p);
        outUV.push(vertUV[e.a].map((x, k) => (x + vertUV[e.b][k]) / 2));
    }

    // --- four faces where there was one, winding preserved
    const newFaces = [];
    for (const f of faces) {
        const [a, b, c] = f;
        const ab = midpoint.get(edgeKey(a, b));
        const bc = midpoint.get(edgeKey(b, c));
        const ca = midpoint.get(edgeKey(c, a));
        newFaces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    return { verts: out, vertUV: outUV, faces: newFaces };
}

/**
 * `subdivide(soup, { levels, smooth })` -> an INDEXED mesh.
 *
 * Indexed because the whole point is more vertices, and a soup repeats every
 * one of them three times: a level-two globe as a soup is four times the
 * memory of the same thing indexed, for the same picture.
 *
 * The caller recomputes normals. Smoothing a surface and then keeping the
 * old face normals would move the silhouette and leave the shading flat,
 * which is the one combination worse than either.
 */
export function subdivide({ positions, uvs = null }, { levels = 1, smooth = true } = {}) {
    const n = Math.max(0, Math.min(MAX_LEVELS, Math.floor(levels)));
    let mesh = weld({ positions, uvs });
    for (let i = 0; i < n; i++) mesh = subdivideOnce(mesh, smooth);
    const out = new Float32Array(mesh.verts.length * 3);
    const outUV = new Float32Array(mesh.verts.length * 2);
    for (const [i, v] of mesh.verts.entries()) {
        out[i * 3] = v[0]; out[i * 3 + 1] = v[1]; out[i * 3 + 2] = v[2];
        outUV[i * 2] = mesh.vertUV[i][0]; outUV[i * 2 + 1] = mesh.vertUV[i][1];
    }
    const index = new Uint32Array(mesh.faces.length * 3);
    for (const [i, f] of mesh.faces.entries()) {
        index[i * 3] = f[0]; index[i * 3 + 1] = f[1]; index[i * 3 + 2] = f[2];
    }
    return { positions: out, uvs: uvs ? outUV : null, index, triangles: mesh.faces.length };
}

/**
 * The sharpest crease between two faces that share an edge, in degrees.
 *
 * This is the faceting measure, and it is what subdivision is for: a
 * silhouette is made of creases, and no amount of shading smooths one. A
 * 24x16 sphere creases at about 11 degrees; one level of Loop halves it.
 */
export function maxCrease({ positions, index = null }) {
    const faceNormal = (a, b, c) => {
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        const n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
        const len = Math.hypot(...n);
        return len > 1e-12 ? n.map((x) => x / len) : null;
    };
    const at = (i) => [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
    const tri = index
        ? Array.from({ length: index.length / 3 }, (_, i) => [index[i * 3], index[i * 3 + 1], index[i * 3 + 2]])
        : Array.from({ length: positions.length / 9 }, (_, i) => [i * 3, i * 3 + 1, i * 3 + 2]);
    const normals = tri.map(([a, b, c]) => faceNormal(at(a), at(b), at(c)));
    const byEdge = new Map();
    for (const [i, [a, b, c]] of tri.entries()) {
        for (const [p, q] of [[a, b], [b, c], [c, a]]) {
            const key = edgeKey(Math.min(p, q), Math.max(p, q));
            (byEdge.get(key) ?? byEdge.set(key, []).get(key)).push(i);
        }
    }
    let worst = 0;
    for (const share of byEdge.values()) {
        if (share.length !== 2) continue;
        const [x, y] = share.map((i) => normals[i]);
        if (!x || !y) continue;
        const cos = Math.min(1, Math.max(-1, x[0] * y[0] + x[1] * y[1] + x[2] * y[2]));
        worst = Math.max(worst, (Math.acos(cos) * 180) / Math.PI);
    }
    return worst;
}

/**
 * About how many vertices a geometry spec will build, before subdivision.
 *
 * Only ever used for a diagnostic, and only ever needs an order of
 * magnitude: a `displacementMap` moves the vertices that exist, so on a
 * twelve-triangle box it moves eight corners and nothing else. That failure
 * is completely silent -- the map loads, the material takes it, the surface
 * is unchanged -- which is exactly the class this repository keeps finding,
 * and a count the compiler can estimate is enough to catch it.
 */
export function vertexEstimate(g = {}) {
    const n = (v, d) => Math.max(1, Math.floor(Number(v) || d));
    let base;
    switch (g.kind) {
        case 'cube': case 'box':
            base = 6 * (n(g.widthSegments, 1) + 1) * (n(g.heightSegments, 1) + 1); break;
        case 'plane':
            base = (n(g.widthSegments, 1) + 1) * (n(g.heightSegments, 1) + 1); break;
        case 'sphere':
            base = (n(g.widthSegments, 24) + 1) * (n(g.heightSegments, 16) + 1); break;
        case 'circle': case 'ring':
            base = (n(g.radialSegments, 48) + 1) * 2; break;
        case 'cylinder': case 'cone':
            base = (n(g.radialSegments, 24) + 1) * (n(g.heightSegments, 1) + 2); break;
        case 'torus':
            base = (n(g.radialSegments, 12) + 1) * (n(g.tubularSegments, 32) + 1); break;
        case 'capsule':
            base = (n(g.radialSegments, 16) + 1) * (n(g.capSegments, 6) * 2 + 2); break;
        case 'lathe':
            base = (n(g.segments, 24) + 1) * ((g.points?.length ?? 3)); break;
        case 'extrude':
            base = (n(g.steps, 8) + 1) * ((g.shape?.length ?? 4) * 2); break;
        case 'boolean':
            // A boolean splits the faces its cutter crosses, so the result is
            // denser than `a` -- but not reliably, and under-reporting here
            // only ever produces a warning that was worth reading.
            base = vertexEstimate(g.a ?? {}); break;
        default: base = 64;
    }
    return Math.round(base * 4 ** Math.max(0, Math.min(MAX_LEVELS, Math.floor(g.subdivide ?? 0))));
}

/** Below this, a displacement map has almost nothing to move. */
export const DISPLACEMENT_VERTICES = 400;
