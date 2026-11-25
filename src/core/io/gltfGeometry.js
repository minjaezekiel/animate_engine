/**
 * Geometry facts about a glTF model, computed without a renderer.
 *
 * [`gltf.js`](./gltf.js) reads the container's table of contents and states
 * its own ceiling plainly: *"this reads the manifest, not the geometry. It
 * will not tell you a mesh's triangle count ... or evaluate a node's world
 * transform through its parents."* This file is that ceiling, lifted, because
 * everything an importer needs to do its job is on the other side of it:
 *
 *   - **How big is it?** A model from a public library arrives in whatever
 *     units its author used -- centimetres and Z-up from a CAD source, metres
 *     and Y-up from a game source -- and being 100x wrong is routine. The
 *     engine takes it literally, so an author hand-tunes `scale` against a
 *     render loop, which is the loop this whole repo exists to close.
 *   - **How heavy is it?** A 2-million-triangle hero asset in a 24fps offline
 *     render is a decision, and it should be an informed one.
 *   - **Can it talk?** Morph target names are the difference between a head
 *     that can be lipsynced and one that cannot, and the viseme track is
 *     already computed for every line of every film.
 *
 * Still no dependency and still no GPU: a `.glb` carries its vertex data in a
 * BIN chunk right there in the file, and the accessor table says exactly how
 * to read it. So this runs in Node on a file an agent just downloaded.
 */

const COMPONENT = {
    5120: { array: Int8Array, size: 1 },
    5121: { array: Uint8Array, size: 1 },
    5122: { array: Int16Array, size: 2 },
    5123: { array: Uint16Array, size: 2 },
    5125: { array: Uint32Array, size: 4 },
    5126: { array: Float32Array, size: 4 },
};
const COMPONENTS_PER = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

/**
 * Read one accessor into a flat array.
 *
 * Honours `byteStride`, which matters because an interleaved buffer -- one
 * where position, normal and uv alternate per vertex -- is the normal output
 * of every exporter that cares about load time, and reading it as if it were
 * tightly packed gives numbers that look like geometry and are not. A
 * sparse accessor is NOT supported and says so rather than returning the
 * base values and quietly losing the overrides.
 */
export function readAccessor(json, bin, index) {
    const acc = json.accessors?.[index];
    if (!acc) return null;
    if (acc.sparse) throw new Error(`accessor ${index} is sparse, which is not supported`);
    const per = COMPONENTS_PER[acc.type];
    const comp = COMPONENT[acc.componentType];
    if (!per || !comp) throw new Error(`accessor ${index}: unknown type ${acc.type}/${acc.componentType}`);
    // No bufferView at all is legal: the accessor reads as zeros, and is how
    // a morph target that moves nothing is encoded.
    if (acc.bufferView == null) return new Float64Array(acc.count * per);

    const view = json.bufferViews?.[acc.bufferView];
    if (!view) throw new Error(`accessor ${index}: bufferView ${acc.bufferView} is missing`);
    const u8 = bin instanceof Uint8Array ? bin : new Uint8Array(bin ?? new ArrayBuffer(0));
    const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0);
    const stride = view.byteStride || per * comp.size;
    const out = new Float64Array(acc.count * per);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const reader = {
        5120: (o) => dv.getInt8(o), 5121: (o) => dv.getUint8(o),
        5122: (o) => dv.getInt16(o, true), 5123: (o) => dv.getUint16(o, true),
        5125: (o) => dv.getUint32(o, true), 5126: (o) => dv.getFloat32(o, true),
    }[acc.componentType];
    for (let i = 0; i < acc.count; i++) {
        for (let c = 0; c < per; c++) {
            const o = base + i * stride + c * comp.size;
            if (o + comp.size > u8.byteLength) return out;   // truncated file
            out[i * per + c] = reader(o);
        }
    }
    return out;
}

/* ------------------------------------------------------------- transforms */

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Column-major 4x4 multiply, matching glTF's own storage order. */
export function mul4(a, b) {
    const out = new Array(16).fill(0);
    for (let c = 0; c < 4; c++) {
        for (let r = 0; r < 4; r++) {
            let s = 0;
            for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
            out[c * 4 + r] = s;
        }
    }
    return out;
}

/** A node's local matrix, from `matrix` or from translation/rotation/scale. */
export function nodeMatrix(node) {
    if (!node) return [...IDENTITY];
    if (Array.isArray(node.matrix) && node.matrix.length === 16) return [...node.matrix];
    const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
    const [sx, sy, sz] = node.scale ?? [1, 1, 1];
    const [tx, ty, tz] = node.translation ?? [0, 0, 0];
    // Quaternion to a rotation basis, then scaled columns: T * R * S, which
    // is the order glTF specifies. Getting it wrong puts a translated child
    // in the wrong place only when its parent is also scaled, which is
    // exactly the case nobody tests by eye.
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2;
    const yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    return [
        (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
        (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
        (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
        tx, ty, tz, 1,
    ];
}

export function applyMatrix(m, p) {
    return [
        m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
        m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
        m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
    ];
}

/** Every mesh-bearing node, with its world matrix. Depth-first from the roots. */
export function meshInstances(json, { sceneIndex = null } = {}) {
    const nodes = json.nodes ?? [];
    const scene = json.scenes?.[sceneIndex ?? json.scene ?? 0];
    const children = new Set(nodes.flatMap((n) => n.children ?? []));
    const roots = scene?.nodes ?? nodes.map((_, i) => i).filter((i) => !children.has(i));
    const out = [];
    // Iterative, with a visited set: a malformed file CAN contain a cycle,
    // and a recursive walk over one is a stack overflow rather than a
    // diagnostic.
    const stack = roots.map((i) => [i, [...IDENTITY]]);
    const seen = new Set();
    while (stack.length) {
        const [i, parent] = stack.pop();
        if (seen.has(i)) continue;
        seen.add(i);
        const node = nodes[i];
        if (!node) continue;
        const world = mul4(parent, nodeMatrix(node));
        if (node.mesh != null) {
            out.push({ node: i, name: node.name ?? `node_${i}`, mesh: node.mesh, world,
                       skinned: node.skin != null });
        }
        for (const c of node.children ?? []) stack.push([c, world]);
    }
    return out;
}

/* ----------------------------------------------------------------- bounds */

/**
 * The model's world-space bounding box, from the accessor table alone.
 *
 * glTF REQUIRES `min` and `max` on any accessor used for POSITION, which is
 * the whole trick: the box is in the file's own metadata and no vertex has to
 * be read to find it. All eight corners are transformed rather than just the
 * two, because a rotated node's box corners do not map to the corners of the
 * transformed box -- taking the min and max of two corners under rotation
 * gives a box that can be smaller than the geometry inside it, which is the
 * worst possible direction for an error that decides a collider.
 *
 * A skinned node is measured in its BIND pose, which is what the accessor
 * holds; a character whose bind pose is a T-pose therefore measures wider
 * than it will ever be in a shot, and that is the honest answer to "how big
 * is this file".
 */
export function modelBounds(json, { sceneIndex = null } = {}) {
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    let found = 0;
    for (const inst of meshInstances(json, { sceneIndex })) {
        for (const prim of json.meshes?.[inst.mesh]?.primitives ?? []) {
            const acc = json.accessors?.[prim.attributes?.POSITION];
            if (!acc?.min || !acc?.max) continue;
            found++;
            for (let corner = 0; corner < 8; corner++) {
                const p = applyMatrix(inst.world, [
                    corner & 1 ? acc.max[0] : acc.min[0],
                    corner & 2 ? acc.max[1] : acc.min[1],
                    corner & 4 ? acc.max[2] : acc.min[2],
                ]);
                for (let k = 0; k < 3; k++) {
                    if (p[k] < min[k]) min[k] = p[k];
                    if (p[k] > max[k]) max[k] = p[k];
                }
            }
        }
    }
    if (!found) return null;
    const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
    return {
        min, max, size,
        center: [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2],
        // The longest edge, which is what a "fit this in frame" scale divides by.
        extent: Math.max(...size),
    };
}

/* ------------------------------------------------------------------ stats */

/**
 * Triangles, vertices and draw calls, per mesh and in total.
 *
 * Counted from accessor `count`s rather than by reading any buffer, so this
 * is cheap enough to run over a directory. `mode` is honoured because a
 * primitive drawn as a strip or a fan has a completely different triangle
 * count from the same index buffer drawn as a list, and defaulting everything
 * to `count / 3` overstates a strip by a factor of three.
 */
export function meshStats(json) {
    const trianglesFor = (mode, n) => {
        switch (mode ?? 4) {
            case 4: return Math.floor(n / 3);     // TRIANGLES
            case 5: case 6: return Math.max(0, n - 2);  // STRIP, FAN
            default: return 0;                    // POINTS, LINES: not triangles
        }
    };
    const meshes = (json.meshes ?? []).map((mesh, i) => {
        let triangles = 0;
        let vertices = 0;
        for (const prim of mesh.primitives ?? []) {
            const pos = json.accessors?.[prim.attributes?.POSITION];
            const idx = prim.indices != null ? json.accessors?.[prim.indices] : null;
            vertices += pos?.count ?? 0;
            triangles += trianglesFor(prim.mode, idx ? idx.count : (pos?.count ?? 0));
        }
        return {
            name: mesh.name || `mesh_${i}`,
            primitives: (mesh.primitives ?? []).length,
            triangles, vertices,
        };
    });
    const instances = meshInstances(json);
    // Instanced geometry is drawn as often as it is placed, so a 500-triangle
    // bolt used 4,000 times is 2M triangles in the frame and 500 in the file.
    // Reporting only the file's number is how a scene that cannot render at
    // all looks lightweight.
    const uses = new Map();
    for (const inst of instances) uses.set(inst.mesh, (uses.get(inst.mesh) ?? 0) + 1);
    let drawn = 0;
    for (const [mi, n] of uses) drawn += (meshes[mi]?.triangles ?? 0) * n;
    return {
        meshes,
        triangles: meshes.reduce((a, m) => a + m.triangles, 0),
        vertices: meshes.reduce((a, m) => a + m.vertices, 0),
        primitives: meshes.reduce((a, m) => a + m.primitives, 0),
        instances: instances.length,
        trianglesDrawn: drawn,
    };
}

/* --------------------------------------------------------- morph targets */

/**
 * Morph target names per mesh, and what they look like they are for.
 *
 * This is the one that unlocks the most. The voice pipeline computes a viseme
 * track for every line of every film and in 3D there has been **no consumer
 * for it at all** -- `grep -i morphTarget` across `src/` returned nothing. A
 * head exported from any of the usual tools carries its visemes as morph
 * targets, and whether they are there is a fact about the file that nobody
 * could previously ask for.
 *
 * Names live in `mesh.extras.targetNames` by convention rather than by
 * specification, which is why the count and the names are reported
 * separately: a mesh with eight unnamed targets is riggable by index and a
 * mesh with eight named ones is riggable by meaning.
 */
export function morphTargets(json) {
    const out = [];
    for (const [i, mesh] of (json.meshes ?? []).entries()) {
        const prim = (mesh.primitives ?? []).find((p) => p.targets?.length);
        if (!prim) continue;
        const names = mesh.extras?.targetNames ?? null;
        out.push({
            mesh: mesh.name || `mesh_${i}`,
            count: prim.targets.length,
            names: Array.isArray(names) ? names.slice(0, prim.targets.length) : null,
        });
    }
    return out;
}
