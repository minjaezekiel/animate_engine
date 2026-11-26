/**
 * Box projection: UVs from position rather than from the primitive.
 *
 * # The problem, stated as a measurement
 *
 * Every primitive this engine builds unwraps each face to the **full 0..1
 * square**. So a 1.2 m panel and a 0.2 m block carry the same texture across
 * six times the distance, and the wood grain on one is six times coarser
 * than the grain on the other. Phase 53 shipped a material library whose
 * whole contract is "a tile is about a metre of surface", and there was no
 * way to make that true.
 *
 * The second half of the same problem is direction. A primitive's u axis is
 * wherever the generator put it, so grain runs along the length of a part
 * that happens to be modelled along x and across the length of its neighbour
 * modelled along z. No film can fix that today; `angle` is how it says so.
 *
 * # Why it is here and not in the backend
 *
 * It is arithmetic over two typed arrays, so it is `core/`: unit-tested with
 * no browser, no THREE, and no GPU -- the rule the rest of this engine runs
 * on. The backend's whole share is reading `geometry.attributes.position`
 * and writing back a `uv`.
 *
 * It runs **once, at build time**. A per-frame UV recompute would be the one
 * thing [43-DCC-PARITY.md §4.3](../../../docs/pending/43-DCC-PARITY.md)
 * forbids: work per vertex per frame on the CPU.
 */

/**
 * Project positions onto the plane each one most faces.
 *
 * `tile` is how much surface one repeat of the texture covers, in the film's
 * own units -- so `tile: 1` on a 1.2 m panel gives 1.2 repeats and the same
 * 1.2 repeats on the 1.2 m panel beside it, whatever shape either one is.
 * `angle` rotates the projection in degrees, which is what aims a grain.
 *
 * Triplanar blending is deliberately not done: it needs a shader, it costs
 * three texture reads per fragment, and the seam it removes is invisible on
 * the machined, flat-sided geometry this engine builds. A box projection on
 * a sphere shows its seams; that is what the sphere's own UVs are for.
 */
export function boxUV({ positions, normals = null, tile = 1, angle = 0, offset = [0, 0] }) {
    const n = Math.floor(positions.length / 3);
    const uv = new Float32Array(n * 2);
    const s = tile > 0 ? 1 / tile : 1;
    const a = (angle * Math.PI) / 180;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    for (let i = 0; i < n; i++) {
        const px = positions[i * 3];
        const py = positions[i * 3 + 1];
        const pz = positions[i * 3 + 2];
        // Which plane does this vertex face? With no normals, fall back to
        // the position's own dominant axis, which is right for a convex
        // solid and is the only information there is.
        const nx = Math.abs(normals ? normals[i * 3] : px);
        const ny = Math.abs(normals ? normals[i * 3 + 1] : py);
        const nz = Math.abs(normals ? normals[i * 3 + 2] : pz);
        let u;
        let v;
        if (nx >= ny && nx >= nz) { u = pz; v = py; }       // facing x: the zy plane
        else if (ny >= nx && ny >= nz) { u = px; v = pz; }  // facing y: the xz plane
        else { u = px; v = py; }                            // facing z: the xy plane
        uv[i * 2] = (u * ca - v * sa) * s + offset[0];
        uv[i * 2 + 1] = (u * sa + v * ca) * s + offset[1];
    }
    return uv;
}

/**
 * `{ projection: 'box', tile: 0.25, angle: 90 }` -> normalised, or `null`.
 *
 * Returns `null` for anything that is not a projection this module performs,
 * so the caller keeps its own diagnostic rather than silently leaving the
 * primitive's own UVs in place -- which is exactly the failure this feature
 * exists to end.
 */
export const UV_PROJECTIONS = ['box'];

export function normalizeUV(spec) {
    if (!spec) return null;
    const projection = typeof spec === 'string' ? spec : spec.projection ?? 'box';
    if (!UV_PROJECTIONS.includes(projection)) return null;
    const tile = Number(typeof spec === 'object' ? spec.tile : NaN);
    const angle = Number(typeof spec === 'object' ? spec.angle : NaN);
    const off = Array.isArray(spec?.offset) ? spec.offset : [0, 0];
    return {
        projection,
        tile: Number.isFinite(tile) && tile > 0 ? tile : 1,
        angle: Number.isFinite(angle) ? angle : 0,
        offset: [Number(off[0]) || 0, Number(off[1]) || 0],
    };
}
