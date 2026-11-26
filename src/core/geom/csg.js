/**
 * Constructive solid geometry: a hole in a solid.
 *
 * # Why this is the one modelling operation films keep needing
 *
 * Every mechanical model in this repository is assembled from primitives,
 * and a primitive cannot have a hole. So a magwell is **a gap between four
 * slabs**, a window is a frame with air behind it, and a bolt hole does not
 * exist. That reads as a model made of blocks, because it is one: the parts
 * meet at seams a real part does not have, and the inside of an opening is
 * the inside of a far wall rather than a cut surface.
 *
 * `{ kind: 'boolean', op: 'subtract', a: {...}, b: {...} }` is the
 * declaration. See [43-DCC-PARITY.md §5.5](../../../docs/pending/43-DCC-PARITY.md).
 *
 * # Why it is here, and pure
 *
 * It is arithmetic over planes and polygons. No THREE, no GPU, no DOM: a
 * soup in, a soup out, where a soup is a flat `positions` array of triangles
 * and the matching `normals`. That is what lets the proof run in Node --
 * **volume against the analytic answer, and watertightness** -- which is the
 * only way to know a boolean worked. A CSG result that looks right in one
 * frame and is open along one edge is a shadow that leaks and a cut face
 * that disappears at a grazing angle, and no screenshot catches it.
 *
 * The backend's whole share is building the two operand geometries, handing
 * over their attribute arrays, and wrapping the result back up.
 *
 * It runs **once, at build time**. Per frame it would be the one thing
 * [§4.3](../../../docs/pending/43-DCC-PARITY.md) forbids.
 *
 * # Why a BSP tree and not a Rust kernel, yet
 *
 * The plan called this the first real candidate for Rust. It is not one yet,
 * and the measurement is in `test/core/csg.test.mjs`: a 96-triangle cutter
 * through a bevelled box is **single-digit milliseconds**, once, per part,
 * at build time. Rust would make a millisecond into a tenth of one.
 *
 * ponytail: BSP over polygons, recursive, O(n log n) on well-behaved input
 * and O(n^2) on a mesh that splits badly. The ceiling is the JS stack --
 * tens of thousands of triangles -- and the upgrade path is the one the plan
 * names: a BVH-accelerated triangle-triangle intersection in
 * `rust/jirex-kernels` with this implementation kept as the oracle. Nothing
 * in a film has approached the ceiling; when something does, the oracle is
 * already written and `volumeOf` already says whether the kernel agrees.
 *
 * # The known failure, stated rather than discovered
 *
 * Mesh booleans are fragile on **coplanar** input: a cutter whose face lies
 * exactly on the face it cuts through has no well-defined inside. So a
 * cutter must poke out of both sides of what it cuts. This is not a flaw
 * being hidden -- it is how every CSG implementation behaves, and
 * `coplanarRisk` says so at build time instead of leaving an author to
 * wonder why one face went missing.
 */

/**
 * Distance at which a vertex counts as ON a plane rather than beside it.
 *
 * In the film's own units, so 1e-5 is ten microns: finer than any feature
 * this engine models and coarse enough to absorb the float error in a
 * rotated operand's transform. Too small and a vertex on a shared face
 * classifies both ways, which is what makes a boolean drop a face.
 */
export const EPSILON = 1e-5;

export const CSG_OPS = ['subtract', 'union', 'intersect'];

const COPLANAR = 0, FRONT = 1, BACK = 2, SPANNING = 3;

/** A vertex is `[x, y, z, nx, ny, nz]`: position and the normal to carry. */
function lerpVertex(a, b, t) {
    const v = [
        a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t,
        a[3] + (b[3] - a[3]) * t, a[4] + (b[4] - a[4]) * t, a[5] + (b[5] - a[5]) * t,
    ];
    // Renormalised, because a shortened normal darkens the surface it
    // shades -- the same silent-black class as `normalScale: [0.45, 0.45]`.
    const len = Math.hypot(v[3], v[4], v[5]);
    if (len > 1e-9) { v[3] /= len; v[4] /= len; v[5] /= len; }
    return v;
}

/** The plane `[a, b, c, w]` through three points, or `null` if they are a line. */
function planeFrom(a, b, c) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (!(len > 1e-12)) return null;
    const n = [nx / len, ny / len, nz / len];
    return [n[0], n[1], n[2], n[0] * a[0] + n[1] * a[1] + n[2] * a[2]];
}

const signedDistance = (plane, v) => plane[0] * v[0] + plane[1] * v[1] + plane[2] * v[2] - plane[3];

/** A convex polygon: its vertices, and the plane they lie in. */
function polygon(verts) {
    const plane = planeFrom(verts[0], verts[1], verts[2]);
    return plane ? { verts, plane } : null;
}

function flipPolygon(p) {
    return { verts: p.verts.slice().reverse().map((v) =>
                 [v[0], v[1], v[2], -v[3], -v[4], -v[5]]),
             plane: [-p.plane[0], -p.plane[1], -p.plane[2], -p.plane[3]] };
}

/**
 * Split `p` by `plane` into the four buckets a BSP needs.
 *
 * Coplanar polygons are sorted by which way they FACE, not by where they
 * are: that is what makes a shared face between two solids resolve to one
 * face in the result instead of two that z-fight.
 */
function splitPolygon(p, plane, coplanarFront, coplanarBack, front, back) {
    let type = 0;
    const types = [];
    for (const v of p.verts) {
        const d = signedDistance(plane, v);
        const t = d < -EPSILON ? BACK : d > EPSILON ? FRONT : COPLANAR;
        type |= t;
        types.push(t);
    }
    if (type === COPLANAR) {
        const facing = plane[0] * p.plane[0] + plane[1] * p.plane[1] + plane[2] * p.plane[2];
        (facing > 0 ? coplanarFront : coplanarBack).push(p);
        return;
    }
    if (type === FRONT) { front.push(p); return; }
    if (type === BACK) { back.push(p); return; }

    const f = [], b = [];
    for (let i = 0; i < p.verts.length; i++) {
        const j = (i + 1) % p.verts.length;
        const ti = types[i], tj = types[j];
        const vi = p.verts[i], vj = p.verts[j];
        if (ti !== BACK) f.push(vi);
        if (ti !== FRONT) b.push(ti !== BACK ? vi.slice() : vi);
        if ((ti | tj) === SPANNING) {
            const di = signedDistance(plane, vi);
            const t = di / (di - signedDistance(plane, vj));
            const v = lerpVertex(vi, vj, t);
            f.push(v);
            b.push(v.slice());
        }
    }
    if (f.length >= 3) { const q = polygon(f); if (q) front.push(q); }
    if (b.length >= 3) { const q = polygon(b); if (q) back.push(q); }
}

/**
 * A BSP node: a dividing plane, the polygons that lie in it, and the two
 * half-spaces. Everything below is the classic algorithm -- it is classic
 * because the alternatives are harder to get right, not because it is fast.
 */
class Node {
    constructor(polygons = null) {
        this.plane = null;
        this.front = null;
        this.back = null;
        this.polygons = [];
        if (polygons?.length) this.build(polygons);
    }

    invert() {
        this.polygons = this.polygons.map(flipPolygon);
        if (this.plane) this.plane = this.plane.map((x) => -x);
        this.front?.invert();
        this.back?.invert();
        const swap = this.front; this.front = this.back; this.back = swap;
    }

    /** Everything of `polygons` that is outside this solid. */
    clipPolygons(polygons) {
        if (!this.plane) return polygons.slice();
        const front = [], back = [];
        for (const p of polygons) splitPolygon(p, this.plane, front, back, front, back);
        const keptFront = this.front ? this.front.clipPolygons(front) : front;
        const keptBack = this.back ? this.back.clipPolygons(back) : [];
        return keptFront.concat(keptBack);
    }

    clipTo(node) {
        this.polygons = node.clipPolygons(this.polygons);
        this.front?.clipTo(node);
        this.back?.clipTo(node);
    }

    allPolygons() {
        return this.polygons
            .concat(this.front ? this.front.allPolygons() : [])
            .concat(this.back ? this.back.allPolygons() : []);
    }

    build(polygons) {
        if (!polygons.length) return;
        this.plane ??= polygons[0].plane;
        const front = [], back = [];
        for (const p of polygons) {
            splitPolygon(p, this.plane, this.polygons, this.polygons, front, back);
        }
        if (front.length) (this.front ??= new Node()).build(front);
        if (back.length) (this.back ??= new Node()).build(back);
    }
}

/** A flat triangle soup -> polygons. Degenerate triangles are dropped. */
function toPolygons({ positions, normals = null }) {
    const out = [];
    for (let i = 0; i + 8 < positions.length; i += 9) {
        const verts = [];
        for (let k = 0; k < 3; k++) {
            const p = i + k * 3;
            verts.push([positions[p], positions[p + 1], positions[p + 2],
                        normals ? normals[p] : 0, normals ? normals[p + 1] : 0,
                        normals ? normals[p + 2] : 0]);
        }
        const poly = polygon(verts);
        if (poly) {
            // No normals in: use the face's own, so the result still shades.
            if (!normals) for (const v of poly.verts) { [v[3], v[4], v[5]] = poly.plane; }
            out.push(poly);
        }
    }
    return out;
}

/** Polygons -> a flat triangle soup, fan-triangulated. */
function toSoup(polygons) {
    let tris = 0;
    for (const p of polygons) tris += p.verts.length - 2;
    const positions = new Float32Array(tris * 9);
    const normals = new Float32Array(tris * 9);
    let o = 0;
    for (const p of polygons) {
        for (let k = 2; k < p.verts.length; k++) {
            for (const v of [p.verts[0], p.verts[k - 1], p.verts[k]]) {
                positions[o] = v[0]; positions[o + 1] = v[1]; positions[o + 2] = v[2];
                normals[o] = v[3]; normals[o + 1] = v[4]; normals[o + 2] = v[5];
                o += 3;
            }
        }
    }
    return { positions, normals, triangles: tris };
}

/**
 * `csg('subtract', a, b)` -- a soup in, a soup out.
 *
 * `subtract` is `a` minus `b`, which is the operation films want: the cutter
 * is the second operand. `union` welds two solids into one surface, which is
 * what removes the seam between two parts that are meant to be one piece.
 * `intersect` keeps the common volume, which is how a profile trims a solid.
 *
 * Throws on an unknown op, because an op nobody honours is a part that
 * silently renders as its first operand -- a hole that is simply not there,
 * and nothing on screen says why.
 */
export function csg(op, a, b) {
    if (!CSG_OPS.includes(op)) {
        throw new Error(`unknown boolean op '${op}'; try ${CSG_OPS.join(', ')}`);
    }
    const A = new Node(toPolygons(a));
    const B = new Node(toPolygons(b));

    if (op === 'union') {
        A.clipTo(B);
        B.clipTo(A);
        // B's remaining faces include the ones now inside A's surface; the
        // double invert removes them and leaves one closed shell.
        B.invert(); B.clipTo(A); B.invert();
        A.build(B.allPolygons());
    } else if (op === 'subtract') {
        A.invert();
        A.clipTo(B);
        B.clipTo(A);
        B.invert(); B.clipTo(A); B.invert();
        A.build(B.allPolygons());
        A.invert();
    } else {
        A.invert();
        B.clipTo(A);
        B.invert();
        A.clipTo(B);
        B.clipTo(A);
        A.build(B.allPolygons());
        A.invert();
    }
    return toSoup(A.allPolygons());
}

/**
 * The volume a closed soup encloses, by the divergence theorem.
 *
 * This is the proof. A subtraction's volume is the operand's minus the part
 * of the cutter that was inside it, and for primitives that number is known
 * analytically -- so a boolean can be checked against arithmetic rather than
 * against a picture. Negative means the winding is inverted, which is the
 * failure that renders as an object seen from the inside.
 */
export function volumeOf({ positions }) {
    let v = 0;
    for (let i = 0; i + 8 < positions.length; i += 9) {
        const ax = positions[i], ay = positions[i + 1], az = positions[i + 2];
        const bx = positions[i + 3], by = positions[i + 4], bz = positions[i + 5];
        const cx = positions[i + 6], cy = positions[i + 7], cz = positions[i + 8];
        v += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6;
    }
    return v;
}

/**
 * How far from closed a soup is: 0 is watertight.
 *
 * The total vector area of a **closed** surface is zero -- every outward
 * patch is cancelled by the rest of the shell -- and that is true whatever
 * the tessellation, which is what makes it the right test here. A BSP
 * boolean leaves **T-junctions**: splitting a polygon puts a vertex in the
 * middle of its neighbour's edge, so an edge-matching count reports an open
 * mesh even when the surface has no gap at all. Vector area does not care.
 *
 * Returned normalised by total area, so it is a dimensionless fraction and
 * the same threshold works on a 5 mm pin and a 50 m hull. A missing face
 * takes it to about that face's share of the surface; the arithmetic noise
 * on a correct result is around 1e-7.
 *
 * An open solid casts a shadow that leaks light and shows its own inside at
 * a grazing angle, and neither is visible in a still frame of the face that
 * worked -- which is why this is a number and not a look.
 */
export function closureError({ positions }) {
    let ax = 0, ay = 0, az = 0, total = 0;
    for (let i = 0; i + 8 < positions.length; i += 9) {
        const ux = positions[i + 3] - positions[i];
        const uy = positions[i + 4] - positions[i + 1];
        const uz = positions[i + 5] - positions[i + 2];
        const vx = positions[i + 6] - positions[i];
        const vy = positions[i + 7] - positions[i + 1];
        const vz = positions[i + 8] - positions[i + 2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        ax += cx; ay += cy; az += cz;
        total += Math.hypot(cx, cy, cz);
    }
    return total > 0 ? Math.hypot(ax, ay, az) / total : 0;
}

/**
 * Does `b` have a face lying in a face of `a`?
 *
 * The one input every CSG implementation is fragile on, so it is worth
 * saying at build time rather than leaving an author to find one missing
 * face in one frame. Compares bounding boxes only: a cutter that stops
 * exactly at the surface it cuts is the case that happens in practice,
 * because an author sizes the cutter to the plate.
 */
export function coplanarRisk(a, b) {
    const box = ({ positions }) => {
        const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
        for (let i = 0; i < positions.length; i += 3) {
            for (let k = 0; k < 3; k++) {
                lo[k] = Math.min(lo[k], positions[i + k]);
                hi[k] = Math.max(hi[k], positions[i + k]);
            }
        }
        return { lo, hi };
    };
    const A = box(a), B = box(b);
    const axes = [];
    for (const [k, axis] of ['x', 'y', 'z'].entries()) {
        // Only a face the cutter ENDS on is a risk; a cutter that pokes
        // through, or stops short, is well defined.
        if (Math.abs(B.lo[k] - A.lo[k]) < EPSILON || Math.abs(B.hi[k] - A.hi[k]) < EPSILON) {
            axes.push(axis);
        }
    }
    return axes;
}
