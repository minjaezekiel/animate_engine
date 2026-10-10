/**
 * Build CSR vertex adjacency from a triangle index buffer.
 *
 * # Why this exists as its own module
 *
 * The legacy sculpt smoothing finds a vertex's neighbours by **searching
 * for nearby vertices**, per vertex, every stroke. That is O(n^2) -- it is
 * self-documented in the source as "simplified" -- but the cost is the
 * lesser problem. It is also *wrong*: proximity is not connectivity. Two
 * vertices can sit a millimetre apart and belong to unconnected parts of
 * the mesh, so smoothing drags them together and welds surfaces that
 * should slide past each other. The same non-convexity that broke
 * distance-based skin weighting in Phase 16 -- a hand hangs beside a
 * thigh, so the nearest vertex to a hip was in a forearm -- breaks
 * proximity smoothing identically.
 *
 * Topological adjacency has neither problem. It is O(triangles) to build,
 * exact, and reusable for as many smoothing iterations and frames as the
 * mesh survives.
 *
 * # Format
 *
 * Compressed sparse row, the standard layout for a graph with a fixed node
 * set:
 *
 * ```text
 *   start: Uint32Array(count + 1)
 *   adj:   Uint32Array(start[count])
 *   vertex v's neighbours are adj[start[v] .. start[v + 1]]
 * ```
 *
 * One flat array with an offset table, rather than an array of arrays:
 * it allocates twice instead of `count` times, and the kernel reads it
 * linearly.
 */

/**
 * @param {ArrayLike<number>} indices  3 per triangle
 * @param {number} count               vertex count
 * @returns {{start: Uint32Array, adj: Uint32Array}}
 */
export function buildAdjacency(indices, count) {
    const tris = Math.floor(indices.length / 3);

    // Counting pass. Each triangle edge is recorded in both directions, so
    // a vertex's degree is counted once per incident triangle corner --
    // which over-counts, because an interior edge is shared by two
    // triangles and both report it. The duplicates are removed below
    // rather than prevented here: a hash set per vertex would cost more
    // than the extra slack, and the slack is bounded at 2x.
    const degree = new Uint32Array(count);
    const bump = (a, b) => {
        if (a < count && b < count) { degree[a]++; degree[b]++; }
    };
    for (let t = 0; t < tris; t++) {
        const a = indices[t * 3], b = indices[t * 3 + 1], c = indices[t * 3 + 2];
        bump(a, b); bump(b, c); bump(c, a);
    }

    const start = new Uint32Array(count + 1);
    for (let v = 0; v < count; v++) start[v + 1] = start[v] + degree[v];

    const fill = new Uint32Array(count);
    const raw = new Uint32Array(start[count]);
    const put = (a, b) => {
        if (a >= count || b >= count) return;
        raw[start[a] + fill[a]++] = b;
        raw[start[b] + fill[b]++] = a;
    };
    for (let t = 0; t < tris; t++) {
        const a = indices[t * 3], b = indices[t * 3 + 1], c = indices[t * 3 + 2];
        put(a, b); put(b, c); put(c, a);
    }

    // Deduplicate per vertex. Sorting each neighbour list makes duplicates
    // adjacent, so one linear sweep removes them; the lists are tiny
    // (degree 6 on a regular mesh) so the sort is not a factor. Sorted
    // output is also better for the kernel's cache behaviour than the
    // triangle-emission order would be.
    const outStart = new Uint32Array(count + 1);
    const packed = new Uint32Array(raw.length);
    let w = 0;
    const scratch = [];
    for (let v = 0; v < count; v++) {
        outStart[v] = w;
        const s = start[v], e = start[v] + fill[v];
        scratch.length = 0;
        for (let k = s; k < e; k++) scratch.push(raw[k]);
        scratch.sort((p, q) => p - q);
        let prev = -1;
        for (const n of scratch) {
            if (n !== prev && n !== v) { packed[w++] = n; prev = n; }
        }
    }
    outStart[count] = w;

    return { start: outStart, adj: packed.slice(0, w) };
}
