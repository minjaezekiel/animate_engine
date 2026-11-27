/**
 * Baking bounce probes: the half that needs a renderer.
 *
 * `core/render/bounce.js` decides where the probes go and which object takes
 * which. This renders them and hands each object its map.
 *
 * # Why a prefiltered cube map rather than spherical harmonics
 *
 * SH9 is the textbook answer and three ships `LightProbe` for it, but three's
 * built-in materials sum light probes GLOBALLY -- there is no per-object
 * probe without patching every material's shader. A prefiltered cube map
 * goes in `material.envMap`, which is per material, already works, and is
 * the exact mechanism Phase 49 uses for the implicit studio. It also carries
 * indirect SPECULAR, which SH9 cannot: a metal standing in the set reflects
 * the set.
 *
 * So the shortest route that works is the better-looking one, which does
 * happen sometimes.
 */

/**
 * Render the scene from each probe position and prefilter the result.
 *
 * The renderer's state is saved and restored around the bake for the reason
 * `captureAOV` does it: this runs in the middle of somebody else's render
 * setup, and a left-behind render target is a black film.
 *
 * @returns {{maps: object[], disposables: object[]}}
 */
export function bakeProbes(THREE, { renderer, scene, positions, size = 64,
                                    near = 0.05, far = 200 }) {
    const maps = [];
    const disposables = [];
    const prevTarget = renderer.getRenderTarget();
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileCubemapShader();

    for (const at of positions) {
        const target = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType });
        const cam = new THREE.CubeCamera(near, far, target);
        cam.position.set(at[0], at[1], at[2]);
        /**
         * Added to the scene for the update and taken straight back out. A
         * CubeCamera reads its own world matrix, so a camera that is not in
         * the graph bakes six faces of the view from the origin -- which
         * renders, looks like a probe, and is a probe of the wrong place.
         */
        scene.add(cam);
        cam.updateMatrixWorld(true);
        cam.update(renderer, scene);
        scene.remove(cam);

        const filtered = pmrem.fromCubemap(target.texture);
        maps.push(filtered.texture);
        disposables.push(filtered, target);
    }

    pmrem.dispose();
    renderer.setRenderTarget(prevTarget);
    return { maps, disposables };
}

/**
 * Every mesh under `root` that can take a probe, with its world centre.
 *
 * The CENTRE of its geometry rather than its origin: a floor plane's origin
 * is often a corner or the world origin, and the probe it should take is the
 * one nearest the surface a viewer sees, not nearest a pivot.
 *
 * Named nodes only would miss parts; every mesh is used, and each one's
 * nearest-probe id is the node path the registry gave the object it belongs
 * to, so the manifest stays readable.
 */
export function probeTargets(THREE, root) {
    const box = new THREE.Box3();
    const centre = new THREE.Vector3();
    const out = [];
    root.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        if (!mats.some((m) => m && 'envMap' in m)) return;
        box.setFromObject(o);
        if (box.isEmpty()) return;
        box.getCenter(centre);
        out.push({ id: o.name || '(unnamed)', at: centre.toArray(), object: o });
    });
    return out;
}

/**
 * Give each object its probe.
 *
 * A probe REPLACES the implicit studio environment on a metal, because the
 * set it is standing in is a better thing for it to reflect than a room from
 * a library -- and leaves it alone when `metals: false`, so a film can light
 * its dielectrics off the set and keep the studio in its chrome.
 */
export function applyProbes(targets, assigned, maps, { intensity = 1, metals = true } = {}) {
    let touched = 0;
    for (const [i, a] of assigned.entries()) {
        const map = maps[a.probe];
        if (!map) continue;
        const o = targets[i].object;
        for (const m of (Array.isArray(o.material) ? o.material : [o.material])) {
            if (!m || !('envMap' in m)) continue;
            if (m.metalness > 0 && !metals) continue;
            m.envMap = map;
            m.envMapIntensity = intensity;
            m.needsUpdate = true;
            touched++;
        }
    }
    return touched;
}
