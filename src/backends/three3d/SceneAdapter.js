import { emitterState } from '../../core/anim/particles.js';
import { humanoidSpec, segmentSkin } from '../../core/art/humanoid3d.js';
import { buildTube, buildHead } from '../../core/art/mesh3d.js';
import { faceMorphs } from '../../core/art/face3d.js';

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

    /**
     * A profile revolved around Y. Every turned part on a machine -- a muzzle
     * nut, a gas piston, a case -- is a lathe, and approximating one with
     * stacked cylinders is what makes a model read as blocks.
     */
    lathe: (T, g) => new T.LatheGeometry(
        (g.points ?? [[0, 0], [1, 0], [1, 1]]).map(([x, y]) => new T.Vector2(x, y)),
        g.segments ?? 24, g.phiStart ?? 0, g.phiLength ?? Math.PI * 2),

    /**
     * A 2D profile swept along a 3D path -- the thing the AK magazine wanted
     * and could not have, so it was built as four rotated slabs with visible
     * seams. With `path` this is a true curved extrusion; without, a straight
     * one of `depth`.
     */
    extrude: (T, g) => {
        const shape = new T.Shape((g.shape ?? [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]])
            .map(([x, y]) => new T.Vector2(x, y)));
        const options = { bevelEnabled: g.bevel ?? false, curveSegments: g.curveSegments ?? 8,
                          bevelSize: g.bevelSize ?? 0.002, bevelThickness: g.bevelThickness ?? 0.002,
                          bevelSegments: g.bevelSegments ?? 2 };
        if (g.path) {
            options.extrudePath = new T.CatmullRomCurve3(
                g.path.map(([x, y, z]) => new T.Vector3(x, y, z ?? 0)));
            options.steps = g.steps ?? Math.max(8, g.path.length * 6);
        } else {
            options.depth = g.depth ?? 1;
        }
        return new T.ExtrudeGeometry(shape, options);
    },
};

const BLENDING = { additive: 'AdditiveBlending', normal: 'NormalBlending', multiply: 'MultiplyBlending' };

/**
 * Draw a text panel to a canvas and hand back a texture.
 *
 * The 3D path had no texturing at all, which meant a presenter could stand in
 * front of a screen but the screen could not say anything. A canvas texture
 * is the whole of what a slide needs -- type, rules, a highlight -- and it
 * costs one 2D context that the engine already depends on everywhere else.
 */
function textTexture(T, spec) {
    const w = spec.width ?? 1024;
    const h = spec.height ?? 576;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const c = canvas.getContext('2d');
    c.fillStyle = spec.background ?? '#0e141c';
    c.fillRect(0, 0, w, h);
    if (spec.accent) {
        c.fillStyle = spec.accent;
        c.fillRect(0, 0, w, Math.max(4, h * 0.012));
    }
    const pad = spec.pad ?? w * 0.07;
    let y = pad + (spec.top ?? 0) * h;
    for (const line of spec.lines ?? []) {
        const text = typeof line === 'string' ? line : line.text ?? '';
        const size = (typeof line === 'object' && line.size) || spec.size || 54;
        const weight = (typeof line === 'object' && line.weight) || spec.weight || 600;
        c.font = `${weight} ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
        c.fillStyle = (typeof line === 'object' && line.color) || spec.color || '#eef3f8';
        c.textBaseline = 'top';
        const align = (typeof line === 'object' && line.align) || spec.align || 'left';
        c.textAlign = align;
        const x = align === 'center' ? w / 2 : align === 'right' ? w - pad : pad;
        c.fillText(text, x, y);
        y += size * ((typeof line === 'object' && line.lead) || spec.lead || 1.42);
    }
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

function makeMaterial(T, spec = {}, blending = null) {
    const { color, emissive, blending: _ignore, basic, text, ...rest } = spec;
    if (text) {
        // Unlit, because a slide is a light source in the room, not a surface
        // being lit by one -- a lit screen picks up the key light's gradient
        // and stops reading as a display.
        const m = new T.MeshBasicMaterial({ map: textTexture(T, text), toneMapped: false, ...rest });
        return m;
    }
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

/**
 * One tapered capsule between two points, baked into bind space.
 *
 * Baked rather than positioned, because the vertices have to be in the same
 * space as the skeleton for the weights to mean anything -- a transform left
 * on the mesh would skin the body in one space and pose it in another.
 */
function limbGeometry(T, a, b, seg, inflate) {
    const { positions, indices, tParam } = buildTube(a, b, {
        r0: seg.r0 + inflate, r1: seg.r1 + inflate,
        profile: seg.profile, rx: seg.rx ?? 1, rz: seg.rz ?? 1,
        radial: seg.radial ?? 18, rings: seg.rings ?? 8,
    });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
    g.setIndex(new T.Uint32BufferAttribute(indices, 1));
    g.userData.tParam = tParam;
    return g;
}

/**
 * Build a skinned humanoid: bones, a merged body surface, automatic weights.
 *
 * The engine could already animate a skinned mesh it was handed; it could not
 * make one. This is that gap closed. Clothing is the same segment table at a
 * larger radius, which cannot clip through the body because it is derived
 * from it.
 */
function buildHumanoid(T, mergeGeometries, node, resolveMaterial) {
    const p = node.props ?? {};
    const spec = humanoidSpec({ outfit: p.outfit, height: p.height });
    const group = new T.Group();
    group.name = node.id;

    // 1. Bones, in the local-offset form Three expects.
    const boneByIdx = spec.bones.map((b) => {
        const bone = new T.Bone();
        bone.name = b.id;
        bone.position.set(b.at[0], b.at[1], b.at[2]);
        return bone;
    });
    const indexOf = new Map(spec.bones.map((b, i) => [b.id, i]));
    spec.bones.forEach((b, i) => {
        if (b.parent) boneByIdx[indexOf.get(b.parent)].add(boneByIdx[i]);
    });
    // Order matters and is easy to get wrong in both directions. `new
    // Skeleton` computes each bone's inverse BIND matrix from its
    // `matrixWorld`, which is identity until something updates it -- so the
    // root must be in the graph and the graph updated BEFORE the skeleton
    // exists, or every surface binds against identity and the body explodes.
    //
    // The root is added to the group, not to a mesh: `Object3D.add` removes
    // from the previous parent, so adding it per surface let the body, jacket
    // and trousers each steal the skeleton from the one before.
    group.add(boneByIdx[0]);
    boneByIdx[0].updateMatrixWorld(true);
    const skeleton = new T.Skeleton(boneByIdx);

    const world = new Map();
    for (const b of spec.bones) {
        const parent = b.parent ? world.get(b.parent) : [0, 0, 0];
        world.set(b.id, [parent[0] + b.at[0], parent[1] + b.at[1], parent[2] + b.at[2]]);
    }

    /**
     * Merge a set of segments into one skinned surface.
     *
     * Weights are computed PER PIECE, before merging, so each capsule binds
     * only to the two bones it actually spans. Merging first and then
     * searching by distance is what let a thigh bind to a fingertip.
     */
    const surface = (picked, inflate, material, name) => {
        const parts = [];
        const idx = [], wts = [];
        const piece = (geometry, a, b, from, to) => {
            const { skinIndex, skinWeight } = segmentSkin(
                geometry.attributes.position.array, a, b, from, to, { blend: 1.6 });
            idx.push(skinIndex); wts.push(skinWeight);
            parts.push(geometry);
        };
        for (const seg of picked) {
            const a = world.get(seg.from), b = world.get(seg.to);
            piece(limbGeometry(T, a, b, seg, inflate), a, b,
                  indexOf.get(seg.from), indexOf.get(seg.to));
        }
        if (!parts.length) return null;
        const geometry = mergeGeometries(parts, false);
        for (const g of parts) g.dispose();
        if (!geometry) return null;
        const total = idx.reduce((n, a) => n + a.length, 0);
        const skinIndex = new Uint16Array(total), skinWeight = new Float32Array(total);
        let o = 0;
        for (let i = 0; i < idx.length; i++) {
            skinIndex.set(idx[i], o); skinWeight.set(wts[i], o); o += idx[i].length;
        }
        geometry.setAttribute('skinIndex', new T.Uint16BufferAttribute(skinIndex, 4));
        geometry.setAttribute('skinWeight', new T.Float32BufferAttribute(skinWeight, 4));
        geometry.computeVertexNormals();
        const mesh = new T.SkinnedMesh(geometry, material);
        mesh.name = `${node.id}#${name}`;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // The root bone is added to the GROUP once, above -- never to each
        // mesh. `Object3D.add` removes from the previous parent, so adding it
        // per surface let the body, jacket and trousers each steal the
        // skeleton from the one before, leaving every surface but the last
        // skinned against bones that were no longer where it thought.
        // An explicit identity bind matrix, because the mesh's own
        // matrixWorld is not meaningful until it is in the scene and the
        // vertices are already baked in bind space.
        mesh.bind(skeleton, new T.Matrix4());
        group.add(mesh);
        return mesh;
    };

    const skinMaterial = resolveMaterial(p.skin ?? { color: '#e8c9a8', roughness: 0.72 });
    surface(spec.segments.filter((s) => s.group !== 'head'), 0, skinMaterial, 'body');

    // The head is built and skinned separately because it is the only part
    // that carries blendshapes, and a morph target has to cover exactly the
    // mesh it deforms -- merging the head into the body would mean every
    // smile shipped deltas for the shins.
    {
        const origin = world.get('head');
        const local = buildHead([0, 0, 0], spec.scale, { radial: 28 });
        const shapes = faceMorphs(local.positions, { scale: spec.scale });
        const positions = new Float32Array(local.positions.length);
        for (let i = 0; i < positions.length; i += 3) {
            positions[i] = local.positions[i] + origin[0];
            positions[i + 1] = local.positions[i + 1] + origin[1];
            positions[i + 2] = local.positions[i + 2] + origin[2];
        }
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
        g.setIndex(new T.Uint32BufferAttribute(local.indices, 1));

        // Relative, so each target is a per-vertex OFFSET rather than an
        // absolute pose -- which is what makes two expressions additive.
        g.morphTargetsRelative = true;
        g.morphAttributes.position = [];
        const dictionary = {};
        for (const [name, delta] of Object.entries(shapes)) {
            dictionary[name] = g.morphAttributes.position.length;
            g.morphAttributes.position.push(new T.Float32BufferAttribute(delta, 3));
        }

        const headIdx = indexOf.get('head'), jawIdx = indexOf.get('jaw');
        const si = new Uint16Array(positions.length / 3 * 4);
        const sw = new Float32Array(positions.length / 3 * 4);
        for (let v = 0; v < positions.length / 3; v++) {
            const t = local.tParam[v];          // >0 only on the lowest rings
            si[v * 4] = headIdx; si[v * 4 + 1] = jawIdx;
            sw[v * 4] = 1 - t; sw[v * 4 + 1] = t;
        }
        g.setAttribute('skinIndex', new T.Uint16BufferAttribute(si, 4));
        g.setAttribute('skinWeight', new T.Float32BufferAttribute(sw, 4));
        g.computeVertexNormals();

        const headMesh = new T.SkinnedMesh(g, skinMaterial);
        headMesh.name = `${node.id}#head`;
        headMesh.castShadow = true;
        headMesh.morphTargetDictionary = dictionary;
        headMesh.morphTargetInfluences = new Array(g.morphAttributes.position.length).fill(0);
        headMesh.bind(skeleton, new T.Matrix4());
        group.add(headMesh);
        group.userData.headMesh = headMesh;
    }
    for (const [i, layer] of (spec.outfit ?? []).entries()) {
        const picked = spec.segments.filter((seg) => layer.groups.includes(seg.group));
        surface(picked, layer.inflate, resolveMaterial(p[layer.material] ?? { color: '#39404c' }),
                layer.material || `cloth${i}`);
    }
    return { group, bones: boneByIdx, indexOf, world, scale: spec.scale };
}

export function buildScene3D(T, compiled, { width, height, mergeGeometries = null } = {}) {
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
        } else if (node.kind === 'humanoid') {
            if (!mergeGeometries) return;
            const built = buildHumanoid(T, mergeGeometries, node,
                                        (m) => makeMaterial(T, m, null));
            object = built.group;
            // The face is addressed as `<character>/face`, so a film writes
            // `morph.mouthSmileLeft` onto it exactly as it writes any channel.
            if (built.group.userData.headMesh) {
                registry.set(`${node.id}/face`, built.group.userData.headMesh);
            }
            // Bones join the registry under the character's own namespace, so
            // a timeline addresses them exactly as it addresses any node:
            // "presenter/armL". Extra geometry -- eyes, hair, a prop in the
            // hand -- then parents to a bone through the ordinary parentId.
            for (const bone of built.bones) registry.set(`${node.id}/${bone.name}`, bone);
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
    const Y_AXIS = new Set(['cylinder', 'capsule', 'cone']);
    for (const spec of emitters.values()) {
        const build = GEOMETRY[spec.geometry.kind] ?? GEOMETRY.sphere;
        const baseOpacity = spec.material.opacity ?? 1;
        const geometry = build(T, spec.geometry);
        // A stretched particle is oriented with lookAt, which aims +Z -- but
        // a cylinder, capsule and cone all run along +Y. Rotating the
        // geometry once at build time makes "long axis on +Z" true for every
        // primitive, rather than leaving each film to discover that its
        // tracer renders as a bar across the flight path instead of along it.
        if (spec.emitter.shutter && Y_AXIS.has(spec.geometry.kind)) {
            geometry.rotateX(Math.PI / 2);
        }
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
                if (p.stretch > 0) {
                    // Point +Z down the velocity and stretch to the distance
                    // covered while the shutter is open. Geometry for a
                    // stretched emitter must have its long axis on +Z.
                    mesh.lookAt(p.x + p.vx, p.y + p.vy, p.z + p.vz);
                    mesh.scale.set(p.size, p.size, Math.max(p.size, p.stretch));
                } else {
                    mesh.scale.setScalar(p.size);
                    mesh.rotation.z = p.spin;
                }
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
