import { emitterState } from '../../core/anim/particles.js';

/**
 * Instantiate a compiled 3D film as THREE objects.
 *
 * `compile3d` emits plain nodes carrying a geometry and material *recipe*;
 * this is the only module that turns them into meshes, and the only one that
 * imports anything from THREE -- which it takes as an argument rather than
 * importing, so the core stays Three-free and the 2D path keeps needing no
 * Three.js at all.
 *
 * It returns a `resolve(id)` of the shape `PoseApplier` already expects, so
 * the existing `createThreePoser` and `OfflineRenderer` drive this with no
 * changes: the timeline writes `position.x` onto the mesh named by the node
 * id, exactly as it writes onto the editor's objects.
 */

const GEOMETRY = {
    cube: (T, g) => new T.BoxGeometry(g.width ?? 1, g.height ?? 1, g.depth ?? 1,
                                      g.widthSegments ?? 1, g.heightSegments ?? 1, g.depthSegments ?? 1),
    box: (T, g) => GEOMETRY.cube(T, g),
    sphere: (T, g) => new T.SphereGeometry(g.radius ?? 0.5, g.widthSegments ?? 24, g.heightSegments ?? 16),
    cylinder: (T, g) => new T.CylinderGeometry(g.radiusTop ?? 0.5, g.radiusBottom ?? g.radiusTop ?? 0.5,
                                               g.height ?? 1, g.radialSegments ?? 24,
                                               g.heightSegments ?? 1, g.openEnded ?? false),
    cone: (T, g) => new T.ConeGeometry(g.radius ?? 0.5, g.height ?? 1, g.radialSegments ?? 24),
    torus: (T, g) => new T.TorusGeometry(g.radius ?? 0.5, g.tube ?? 0.2,
                                         g.radialSegments ?? 12, g.tubularSegments ?? 32,
                                         g.arc ?? Math.PI * 2),
    // A capsule is the honest primitive for a grip or a magazine body: a box
    // reads as machined and a cylinder as tubular, and most of a rifle's
    // furniture is neither.
    capsule: (T, g) => new T.CapsuleGeometry(g.radius ?? 0.2, g.height ?? 0.5,
                                             g.capSegments ?? 6, g.radialSegments ?? 16),
    plane: (T, g) => new T.PlaneGeometry(g.width ?? 1, g.height ?? 1,
                                         g.widthSegments ?? 1, g.heightSegments ?? 1),
    tetrahedron: (T, g) => new T.TetrahedronGeometry(g.radius ?? 0.5, g.detail ?? 0),
};

const BLENDING = { additive: 'AdditiveBlending', normal: 'NormalBlending', multiply: 'MultiplyBlending' };

function makeMaterial(T, spec = {}, blending = null) {
    const { color, emissive, blending: _ignore, basic, ...rest } = spec;
    // Smoke and dust must not be lit. A lit sphere has a terminator and a
    // specular highlight, which is precisely what makes a grey ball read as a
    // ball rather than as a puff of smoke, however low its opacity goes.
    if (basic) {
        const m = new T.MeshBasicMaterial({ color: new T.Color(color ?? '#888'), ...rest });
        m.transparent = true;
        m.depthWrite = false;
        if (blending && BLENDING[blending]) m.blending = T[BLENDING[blending]];
        return m;
    }
    const material = new T.MeshStandardMaterial({
        color: new T.Color(color ?? '#9aa0a6'),
        ...(emissive ? { emissive: new T.Color(emissive) } : {}),
        ...rest,
    });
    if (blending && BLENDING[blending]) {
        material.blending = T[BLENDING[blending]];
        material.transparent = true;
        material.depthWrite = false;
    }
    if (rest.opacity != null && rest.opacity < 1) material.transparent = true;
    return material;
}

function makeLight(T, p) {
    switch (p.lightType) {
        case 'ambient': return new T.AmbientLight(new T.Color(p.color), p.intensity);
        case 'hemisphere': return new T.HemisphereLight(new T.Color(p.color), 0x202025, p.intensity);
        case 'point': return new T.PointLight(new T.Color(p.color), p.intensity, p.distance || 0);
        case 'spot': {
            const l = new T.SpotLight(new T.Color(p.color), p.intensity, p.distance || 0,
                                      (p.angle ?? 60) * Math.PI / 180, p.penumbra ?? 0.2);
            return l;
        }
        default: return new T.DirectionalLight(new T.Color(p.color), p.intensity);
    }
}

export function buildScene3D(T, compiled, { width, height } = {}) {
    const { scene: recipe, meta, emitters, cameraId, lookId } = compiled;
    const root = new T.Scene();
    root.background = new T.Color(meta.background);
    const registry = new Map();
    const w = width ?? meta.width;
    const h = height ?? meta.height;

    const camera = new T.PerspectiveCamera(meta.fov ?? 38, w / h, 0.01, 200);
    const lookTarget = new T.Object3D();
    root.add(camera);
    root.add(lookTarget);
    registry.set(cameraId, camera);
    registry.set(lookId, lookTarget);

    // Walk the recipe in parent-before-child order so a parent object always
    // exists to attach to. `Scene.walk` is depth-first from the root, which
    // guarantees exactly that.
    recipe.walk((node) => {
        if (node.id === recipe.rootId || registry.has(node.id)) return;
        const p = node.props ?? {};
        let object = null;
        if (node.kind === 'mesh') {
            const build = GEOMETRY[p.geometry?.kind];
            if (!build) return;
            object = new T.Mesh(build(T, p.geometry), makeMaterial(T, p.material, p.blending));
            object.castShadow = true;
            object.receiveShadow = true;
        } else if (node.kind === 'light') {
            object = makeLight(T, p);
            if (object.castShadow !== undefined && p.castShadow) {
                object.castShadow = true;
                if (object.shadow) {
                    object.shadow.mapSize.set(1024, 1024);
                    object.shadow.bias = -0.0008;
                }
            }
            if (p.target && object.target) {
                object.target.position.set(...p.target);
                root.add(object.target);
            }
        } else {
            object = new T.Object3D();
        }
        if (!object) return;
        if (p.at) object.position.set(p.at[0], p.at[1], p.at[2]);
        if (p.rot) object.rotation.set(p.rot[0], p.rot[1], p.rot[2]);
        if (p.scale) object.scale.set(p.scale[0], p.scale[1], p.scale[2]);
        object.name = node.id;
        const parent = node.parentId && node.parentId !== recipe.rootId
            ? registry.get(node.parentId) : null;
        (parent ?? root).add(object);
        registry.set(node.id, object);
    });

    // ------------------------------------------------------------ particles
    // A fixed pool of meshes per emitter, allocated once. Individual meshes
    // rather than an InstancedMesh because per-particle opacity needs either
    // instance colour or a custom shader, and these counts are in the low
    // hundreds.
    // ponytail: pool of Meshes; move to InstancedMesh with a shader if a film
    // ever needs thousands of particles at once.
    const pools = [];
    for (const spec of emitters.values()) {
        const build = GEOMETRY[spec.geometry.kind] ?? GEOMETRY.sphere;
        const baseOpacity = spec.material.opacity ?? 1;
        const geometry = build(T, spec.geometry);
        const parent = (spec.parent && registry.get(spec.parent)) || root;
        const meshes = [];
        for (let i = 0; i < spec.emitter.count; i++) {
            const mesh = new T.Mesh(geometry, makeMaterial(T, spec.material, spec.blending));
            mesh.visible = false;
            mesh.name = `${spec.id}#${i}`;
            parent.add(mesh);
            meshes.push(mesh);
        }
        pools.push({ spec, meshes, baseOpacity });
    }

    /**
     * The per-frame step the timeline cannot express.
     *
     * Two things live here rather than as channels: aiming the camera, which
     * must follow a moving target rather than interpolate between two baked
     * rotations; and particles, which are a closed-form function of time and
     * would otherwise compile to tens of thousands of keys.
     */
    const step = (tSec) => {
        camera.lookAt(lookTarget.position);
        camera.updateProjectionMatrix();
        for (const { spec, meshes, baseOpacity } of pools) {
            const state = emitterState(spec.emitter, tSec);
            for (const [i, p] of state.entries()) {
                const mesh = meshes[i];
                if (!mesh) continue;
                mesh.visible = p.visible;
                if (!p.visible) continue;
                mesh.position.set(p.x, p.y, p.z);
                mesh.scale.setScalar(p.size);
                mesh.rotation.z = p.spin;
                // Scale the authored opacity rather than replacing it. Writing
                // the alpha straight in made every smoke puff fully opaque at
                // birth, so a 0.5-opacity material rendered as a solid ball.
                if (mesh.material.transparent) mesh.material.opacity = p.alpha * baseOpacity;
            }
        }
    };

    const resolve = (id) => registry.get(id);
    return { root, camera, lookTarget, registry, resolve, step, pools,
             dispose() {
                 root.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
             } };
}
