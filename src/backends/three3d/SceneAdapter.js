import { emitterState } from '../../core/anim/particles.js';
import { humanoidSpec, segmentSkin } from '../../core/art/humanoid3d.js';
import { buildTube, buildHead, buildHairCap } from '../../core/art/mesh3d.js';
import { faceMorphs } from '../../core/art/face3d.js';
import { solveTwoBone3D } from '../../core/rig/IK3D.js';
import { limitRotation, drivenValue } from '../../core/rig/constraints.js';
import { makeCloth, stepCloth } from '../../core/sim/cloth.js';
import { makeFluid, resetFluid, stepFluid, addSource, fluidToRGBA } from '../../core/sim/fluid.js';
import { applyChannel, readChannel } from './PoseApplier.js';

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

/**
 * Nothing in the physical world has a zero-radius edge.
 *
 * A real edge is a chamfer or a fillet half a millimetre wide, and the only
 * reason it matters at this distance is that it catches a highlight: a thin
 * bright line along every silhouette, which is most of what separates a
 * rendered object from a diagram of one. It is the clearest single difference
 * between the reference footage and ours, and every box in this engine was a
 * `BoxGeometry` -- twelve edges, each of them mathematically sharp, each of
 * them shading as one flat face meeting another with nothing in between.
 *
 * 4 mm rather than a percentage, because a chamfer is a fact about the tool
 * that cut the part and not about how big the part is -- a 2 m door and a
 * 40 mm receiver carry the same one. The clamp is what keeps it from eating
 * a part thinner than itself: a radius over half the smallest dimension is
 * not a box any more, and `RoundedBoxGeometry` degenerates there.
 */
export const DEFAULT_BEVEL = 0.004;

/** The corner radius for a box, in the film's own units. `bevel: 0` is flat. */
export function bevelRadius(g = {}) {
    const want = g.bevel ?? DEFAULT_BEVEL;
    if (!(want > 0)) return 0;
    const min = Math.min(Math.abs(g.width ?? 1), Math.abs(g.height ?? 1), Math.abs(g.depth ?? 1));
    return Math.min(want, min * 0.25);
}

const GEOMETRY = {
    /**
     * A box, bevelled unless the film says otherwise.
     *
     * `RoundedBoxGeometry` is an addon class, so it arrives as an argument
     * for the same reason `mergeGeometries` does: this module takes THREE as
     * a parameter and imports nothing, which is what lets the core bundle
     * resolve in Node. Without it -- an older page, a test harness -- the
     * box is the box it always was.
     */
    cube: (T, g, add = null) => {
        const radius = bevelRadius(g);
        const Rounded = add?.RoundedBoxGeometry;
        if (radius > 0 && Rounded && !g.widthSegments && !g.heightSegments && !g.depthSegments) {
            return new Rounded(g.width ?? 1, g.height ?? 1, g.depth ?? 1,
                               g.bevelSegments ?? 2, radius);
        }
        return new T.BoxGeometry(g.width ?? 1, g.height ?? 1, g.depth ?? 1,
                                 g.widthSegments ?? 1, g.heightSegments ?? 1, g.depthSegments ?? 1);
    },
    box: (T, g, add = null) => GEOMETRY.cube(T, g, add),
    /**
     * A sphere, optionally a WEDGE of one.
     *
     * `phiStart`/`phiLength` sweep longitude and `thetaStart`/`thetaLength`
     * sweep latitude, both in degrees here because every other angle in a
     * film script is in degrees.
     *
     * This is four parameters THREE has always had and this adapter never
     * passed, and their absence is why a cutaway was impossible. A planet
     * opened to its core is a stack of concentric hemispheres --
     * `phiLength: 180` -- and until now the only sphere available was a
     * closed one, so showing the inside of anything meant either CSG (a
     * dependency and a correctness surface) or clipping the whole scene.
     * Half a sphere is neither: it is the geometry that was wanted, built
     * directly, with no fragments discarded and no shadow to fix up.
     */
    sphere: (T, g) => new T.SphereGeometry(
        g.radius ?? 0.5, g.widthSegments ?? 24, g.heightSegments ?? 16,
        (g.phiStart ?? 0) * Math.PI / 180,
        (g.phiLength ?? 360) * Math.PI / 180,
        (g.thetaStart ?? 0) * Math.PI / 180,
        (g.thetaLength ?? 180) * Math.PI / 180),

    /**
     * A flat disc, or an annulus with `innerRadius`.
     *
     * The cap on a sectioned sphere. A hemisphere is open at its cut face,
     * and an open hemisphere shows you the inside of its own far wall --
     * which is the same inverted-winding illusion that made the presenter's
     * body look solid while every garment over it was culled. A ring per
     * layer closes the section into a face you can actually read, and an
     * annulus is the right primitive because a layer IS an annulus: the
     * mantle's cut face is a ring between the core and the crust.
     */
    circle: (T, g) => (g.innerRadius
        ? new T.RingGeometry(g.innerRadius, g.radius ?? 0.5,
                             g.radialSegments ?? 48, 1,
                             (g.thetaStart ?? 0) * Math.PI / 180,
                             (g.thetaLength ?? 360) * Math.PI / 180)
        : new T.CircleGeometry(g.radius ?? 0.5, g.radialSegments ?? 48,
                               (g.thetaStart ?? 0) * Math.PI / 180,
                               (g.thetaLength ?? 360) * Math.PI / 180)),
    ring: (T, g) => GEOMETRY.circle(T, { innerRadius: 0.25, ...g }),
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

/** `new T.Object3D()`, named so the pre-walk block above reads as intent. */
const THREE_OBJECT = (T) => new T.Object3D();

const BLENDING = { additive: 'AdditiveBlending', normal: 'NormalBlending', multiply: 'MultiplyBlending' };

/**
 * Kept in step with `TEXTURE_SLOTS` in `core/script/compile3d.js`, which is
 * what warns about an undeclared name. Duplicated rather than imported
 * because this module is the backend and that one is the compiler, and the
 * compiler does not import the backend in either direction.
 */
const TEXTURE_SLOT_NAMES = [
    'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap',
    'bumpMap', 'alphaMap', 'aoMap', 'displacementMap', 'clearcoatMap',
    'sheenColorMap', 'specularMap', 'iridescenceMap', 'lightMap',
];

/** Fallbacks, so a film that declares a character gets teeth without naming them. */
const MOUTH_MATERIALS = {
    tooth: { color: '#f1ece0', roughness: 0.22, metalness: 0 },
    tongue: { color: '#9e4f58', roughness: 0.45 },
    cavity: { color: '#2a1215', roughness: 0.95 },
};

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

/**
 * Properties a material spec gives as a colour string and THREE wants as a
 * `Color`. Passing '#ff9d86' straight into the constructor sets the field to
 * a STRING, which renders as black and reports nothing.
 */
const COLOR_PROPS = ['sheenColor', 'attenuationColor', 'specularColor', 'emissive'];

/**
 * Material properties a film gives as `[x, y]` and THREE wants as a Vector2.
 *
 * The third instance of the same bug, and the worst of the three. A JSON film
 * can only write arrays, `Material.setValues` copies into the existing
 * Vector2 with `currentValue.copy(newValue)`, and `Vector2.copy` reads `.x`
 * and `.y` -- which on an array are `undefined`. So `normalScale: [0.45,
 * 0.45]` sets the normal scale to (NaN, NaN).
 *
 * NaN in the normal makes every lighting dot product NaN, and the surface
 * renders BLACK. Not magenta, not missing -- black, which looks exactly like
 * a lighting problem. The Earth's entire sunlit face came back unlit while
 * the floor and the presenter beside it were correctly lit, and three
 * separate hypotheses about shadow acne, light direction and colour space
 * were checked before the actual cause, which is a two-element array.
 *
 * `COLOR_PROPS` exists for a string where THREE wants a Color. This is the
 * same hole one type over, and the general lesson is that spreading
 * unrecognised keys into a THREE constructor is free until it is silent.
 */
const VECTOR2_PROPS = ['normalScale', 'clearcoatNormalScale', 'iridescenceThicknessRange'];

/**
 * Build the film's `textures` block into THREE textures, once.
 *
 * Two sources. A `src` is fetched -- somebody's photograph, a NASA albedo
 * plate, a scanned fabric -- and is asynchronous, so it is loaded by the
 * page and handed in already resolved, exactly as `models` and `environment`
 * are. Everything else is SYNTHESIZED by `core/art/textures.js`, which is
 * pure arithmetic over a byte array and therefore testable in Node and
 * identical on every machine.
 *
 * Synthesis is the primary path on purpose: a film in this repo has to be
 * renderable by anyone who clones it, and that rules out depending on
 * somebody else's image for the engine's default surface quality -- the same
 * argument `make-music.mjs` makes about its score.
 */
export function buildTextures(T, textures, { paintTexture, normalFromHeight, images = {} } = {}) {
    const out = new Map();
    const painted = new Map();
    // Two passes: a derived texture (`normalFrom`) reads a painted one, and
    // object key order is not a dependency order.
    for (const [id, spec] of Object.entries(textures ?? {})) {
        if (spec.src || spec.text || spec.normalFrom) continue;
        painted.set(id, paintTexture(spec));
    }
    for (const [id, spec] of Object.entries(textures ?? {})) {
        let texture = null;
        if (spec.src) {
            texture = images[id] ?? null;
            if (!texture) continue;            // the page already reported it
        } else if (spec.text) {
            texture = textTexture(T, spec.text);
        } else {
            const bytes = spec.normalFrom
                ? normalFromHeight(painted.get(spec.normalFrom), spec.strength ?? 2)
                : painted.get(id);
            if (!bytes) continue;
            const canvas = document.createElement('canvas');
            canvas.width = bytes.width;
            canvas.height = bytes.height;
            canvas.getContext('2d').putImageData(
                new ImageData(bytes.data, bytes.width, bytes.height), 0, 0);
            texture = new T.CanvasTexture(canvas);
        }
        /**
         * Colour space, and the one that is wrong by default.
         *
         * An albedo map holds sRGB values and must be tagged `SRGBColorSpace`
         * or every colour renders about 2.2 gammas too bright. A normal,
         * roughness or height map holds LINEAR data and must NOT be tagged,
         * or the renderer un-gammas numbers that were never gammaed -- which
         * shows up as a surface that is far too rough in the midtones and is
         * almost impossible to attribute by eye.
         *
         * `linear: true` on the spec, or a derived normal map, means linear.
         */
        const linear = spec.linear === true || !!spec.normalFrom
            || spec.role === 'data';
        texture.colorSpace = linear ? T.NoColorSpace : T.SRGBColorSpace;
        // Repeat in x, clamp in y: an equirectangular map on a sphere meets
        // itself at the date line and does not meet itself across a pole.
        // Mirrored or clamped wrapping in x puts a visible seam down the
        // Pacific on every frame of a rotating globe.
        texture.wrapS = spec.wrapS === 'clamp' ? T.ClampToEdgeWrapping : T.RepeatWrapping;
        texture.wrapT = spec.wrapT === 'repeat' ? T.RepeatWrapping : T.ClampToEdgeWrapping;
        if (spec.repeat) texture.repeat.set(spec.repeat[0] ?? 1, spec.repeat[1] ?? 1);
        if (spec.offset) texture.offset.set(spec.offset[0] ?? 0, spec.offset[1] ?? 0);
        // 8x costs nothing measurable and is the difference between a planet
        // whose terrain reads at a grazing angle and one that turns to mush
        // at the limb -- which is most of a sphere's visible area.
        texture.anisotropy = spec.anisotropy ?? 8;
        texture.needsUpdate = true;
        out.set(id, texture);
    }
    return out;
}

/**
 * A view-dependent rim: atmosphere, force field, hot metal at a grazing
 * angle.
 *
 * # Why this is a shader and nothing else here is
 *
 * Every other material in this engine is a configured THREE material,
 * deliberately -- a hand-written shader is a second rendering model to keep
 * correct through every engine upgrade. This is the one effect that cannot be
 * configured, because it depends on the angle between the surface normal and
 * the view direction, and no PBR parameter exposes that.
 *
 * It matters out of proportion to its size. A planet without a limb glow
 * reads as a painted ball however good its albedo is: the atmosphere is what
 * tells a viewer there is air, and the only place air is visible is where you
 * are looking through a lot of it -- at the edge.
 *
 * Rendered on the BACK faces of a slightly larger sphere and blended
 * additively, so the shell is invisible in front of the planet and bright
 * around it, which is what a thin atmosphere actually does.
 *
 * `clipping: true` plus the clipping chunks: a raw ShaderMaterial does NOT
 * get clipping planes for free the way a built-in material does, so without
 * these four includes an atmosphere stays whole across a cutaway and seals
 * the notch shut.
 */
function glowMaterial(T, spec = {}) {
    return new T.ShaderMaterial({
        uniforms: {
            uColor: { value: new T.Color(spec.color ?? '#6fb3ff') },
            uIntensity: { value: spec.intensity ?? 1 },
            uPower: { value: spec.power ?? 3 },
            uBias: { value: spec.bias ?? 0 },
        },
        vertexShader: `
            #include <clipping_planes_pars_vertex>
            varying vec3 vNormalV;
            varying vec3 vViewV;
            void main() {
                vec4 mv = modelViewMatrix * vec4(position, 1.0);
                vNormalV = normalize(normalMatrix * normal);
                vViewV = normalize(-mv.xyz);
                gl_Position = projectionMatrix * mv;
                #include <clipping_planes_vertex>
            }`,
        fragmentShader: `
            #include <clipping_planes_pars_fragment>
            uniform vec3 uColor;
            uniform float uIntensity;
            uniform float uPower;
            uniform float uBias;
            varying vec3 vNormalV;
            varying vec3 vViewV;
            void main() {
                #include <clipping_planes_fragment>
                // abs(), because this is drawn on back faces and their
                // normals point away: without it the whole shell is dark
                // and the glow appears only as a ring of z-fighting.
                float facing = abs(dot(normalize(vNormalV), normalize(vViewV)));
                float rim = uBias + (1.0 - uBias) * pow(1.0 - facing, uPower);
                gl_FragColor = vec4(uColor * uIntensity * rim, rim);
            }`,
        transparent: true,
        blending: T.AdditiveBlending,
        depthWrite: false,
        clipping: true,
        side: spec.side === 'front' ? T.FrontSide
            : spec.side === 'double' ? T.DoubleSide : T.BackSide,
    });
}

function makeMaterial(T, spec = {}, blending = null, textures = null, clipPlanes = null) {
    if (spec?.glow) return glowMaterial(T, spec);
    const { color, emissive, blending: _ignore, basic, text, physical, ...rest } = spec;
    for (const prop of COLOR_PROPS) {
        if (typeof rest[prop] === 'string') rest[prop] = new T.Color(rest[prop]);
    }
    for (const prop of VECTOR2_PROPS) {
        const v = rest[prop];
        if (Array.isArray(v)) rest[prop] = new T.Vector2(v[0] ?? 1, v[1] ?? v[0] ?? 1);
        else if (typeof v === 'number') rest[prop] = new T.Vector2(v, v);
    }
    /**
     * A texture slot named as a string becomes the texture it names.
     *
     * Without this the string itself lands in `material.map`, THREE asks it
     * for `.isTexture`, gets undefined, and renders the surface untextured
     * with nothing logged anywhere -- the same silent-wrong-type failure
     * `COLOR_PROPS` exists to prevent one line above. The compiler warns
     * about an undeclared name; this drops it rather than passing a string
     * through, so a mistyped map costs a flat surface and not a broken one.
     */
    for (const slot of TEXTURE_SLOT_NAMES) {
        const ref = rest[slot];
        if (typeof ref !== 'string') continue;
        const found = textures?.get(ref);
        if (found) rest[slot] = found;
        else delete rest[slot];
    }
    /**
     * Per-material clipping: `clip: ["sectionX", "sectionZ"]`.
     *
     * Global planes cut everything, which is right for a sectioned view and
     * wrong whenever the subject is sectioned and the set is not.
     *
     * `clipIntersection` is the parameter that decides what a pair of planes
     * MEANS, and the default is the opposite of what a cutaway wants. False
     * (the default) clips the UNION of the two half-spaces, which takes away
     * three quarters of a sphere. True clips only their INTERSECTION, which
     * takes away the quarter-wedge -- the classic cutaway. One boolean, and
     * it is the whole difference between a notch and a quarter left standing.
     */
    if (Array.isArray(rest.clip)) {
        const planes = rest.clip.map((name) => clipPlanes?.get(name)).filter(Boolean);
        delete rest.clip;
        if (planes.length) {
            rest.clippingPlanes = planes;
            rest.clipIntersection = spec.clipIntersection === true;
        }
    } else {
        delete rest.clip;
    }
    delete rest.clipIntersection;
    delete rest.side;
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
    /**
     * `physical: true` opens MeshPhysicalMaterial, which is the whole of the
     * engine's answer to §6's "**Subsurface scattering** -- skin renders as
     * clay."
     *
     * ponytail: a native material, not a shader. There is no real SSS in
     * three.js, and writing one means a custom `onBeforeCompile` with its own
     * diffusion profile and depth pass. What MeshPhysicalMaterial does have
     * is `sheen` -- a second, retroreflective lobe -- and `transmission` with
     * `thickness`, which genuinely transmits light through thin geometry. A
     * warm sheen on skin is most of why real skin does not read as clay (the
     * velvet rim at a grazing angle), and transmission on the ears and the
     * nose is the rest of it. It is an approximation and it is the one every
     * real-time renderer shipped before compute shaders.
     */
    const Ctor = physical ? T.MeshPhysicalMaterial : T.MeshStandardMaterial;
    const material = new Ctor({
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

/** Every standard-lit material under an object, meshes with arrays included. */
function* materialsIn(root) {
    for (const o of [root]) {
        const seen = new Set();
        o.traverse((n) => {
            for (const m of (Array.isArray(n.material) ? n.material : [n.material])) {
                if (m?.isMeshStandardMaterial && !seen.has(m)) { seen.add(m); }
            }
        });
        yield* seen;
    }
}

/**
 * Every number a shadow camera needs, from the scene it has to cover.
 *
 * Pure, because two of the three numbers it replaces were wrong in a way no
 * render would report: THREE's `shadow.bias` is in **normalised depth over
 * the shadow camera's `[near, far]`**, and this adapter hardcoded `-0.0008`
 * against a default frustum of `0.5..500` -- **0.4 metres** of depth offset,
 * in films whose subjects are under a metre. That is why a shadow here
 * detaches from the thing casting it. And a `DirectionalLight`'s shadow
 * camera defaults to +/-5 units, an absolute size in an engine with no units,
 * so a set larger than 10 units across simply has no shadow outside that box
 * and a miniature wastes its whole map on empty space.
 *
 * `radius` is the bounding sphere of what casts, `distance` is from the light
 * to its centre.
 */
export function fitShadowCamera({ radius, distance = 0, mapSize = 2048 }) {
    const extent = Math.max(1e-4, radius);
    const near = Math.max(1e-3, distance - extent);
    const far = Math.max(near + 1e-3, distance + extent);
    /** How much world a single shadow texel covers. Everything else is this. */
    const texel = (2 * extent) / mapSize;
    return {
        extent,
        near,
        far,
        mapSize,
        texel,
        // Half a texel of world depth, expressed in the units the comparison
        // is actually made in.
        bias: -(texel * 0.5) / (far - near),
        // The real acne cure: step along the surface normal rather than into
        // the light, so a steep surface gets the offset it needs and a flat
        // one does not get an offset it will peter-pan on.
        normalBias: texel * 1.5,
    };
}

/**
 * Point every shadow-casting light at the scene it is actually lighting.
 *
 * Runs once, after the walk, because it needs the geometry to exist. A film
 * that animates a light's position keeps the fit it was built with: the
 * extent is a property of the SET, and a key light swinging through a scene
 * does not change how big that scene is.
 */
function fitShadows(T, root) {
    const box = new T.Box3();
    root.traverse((o) => { if (o.isMesh && o.castShadow) box.expandByObject(o); });
    if (box.isEmpty()) return null;
    const sphere = box.getBoundingSphere(new T.Sphere());
    let fitted = null;
    root.traverse((light) => {
        const shadow = light.isLight && light.castShadow ? light.shadow : null;
        if (!shadow) return;
        const distance = light.position.distanceTo(sphere.center);
        const f = fitShadowCamera({ radius: sphere.radius, distance,
                                    mapSize: shadow.mapSize.x || 2048 });
        const cam = shadow.camera;
        if (cam.isOrthographicCamera) {
            cam.left = -f.extent; cam.right = f.extent;
            cam.top = f.extent; cam.bottom = -f.extent;
        } else if (cam.isPerspectiveCamera && f.distance !== 0) {
            // A spot light's shadow camera is its own cone; only the depth
            // range is ours to fit.
            cam.fov = light.angle ? (light.angle * 2 * 180) / Math.PI : cam.fov;
        }
        cam.near = f.near;
        cam.far = f.far;
        cam.updateProjectionMatrix();
        shadow.bias = f.bias;
        shadow.normalBias = f.normalBias;
        fitted = f;
    });
    return fitted;
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
        // As a fraction of the segment's own radius, so it is scale-free.
        extend: (seg.extend ?? 0) * (seg.r0 + inflate),
        dome: seg.dome ?? 0.45,
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
    const spec = humanoidSpec({ outfit: p.outfit, height: p.height,
                                hair: p.hair === false ? null : p.hairStyle });
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
        const local = buildHead([0, 0, 0], spec.scale,
                                { radial: 28, mouth: p.mouth === false ? null : undefined });
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

    /**
     * Teeth, a tongue and hair, as plain meshes parented to a BONE.
     *
     * Not skinned, and not merged into the body. A mouth part belongs to
     * exactly one bone -- the upper arch to the skull, the lower arch and the
     * tongue to the jaw -- so a skin weight would be 1.0 on one index and
     * there is nothing for a blend to do. Parenting to the bone is the same
     * mechanism the eyes already use, and it means the lower teeth open with
     * the jaw rotation lipsync is already writing: no new channel, no new
     * track.
     */
    for (const part of spec.mouth ?? []) {
        if (p.mouth === false) break;
        const build = GEOMETRY[part.geometry.kind];
        const bone = boneByIdx[indexOf.get(part.bone)];
        if (!build || !bone) continue;
        const scaled = { ...part.geometry };
        if (scaled.shape) scaled.shape = scaled.shape.map(([x, y]) => [x * spec.scale, y * spec.scale]);
        if (scaled.path) scaled.path = scaled.path.map((v) => v.map((n) => n * spec.scale));
        if (scaled.radius) scaled.radius *= spec.scale;
        const material = resolveMaterial(p[part.material] ?? MOUTH_MATERIALS[part.material]);
        if (part.side === 'back') material.side = T.BackSide;
        // ponytail: no addon here -- `buildHumanoid` does not take them, and
        // a 4 mm chamfer on a lip part is not a thing anybody would see.
        const mesh = new T.Mesh(build(T, scaled), material);
        mesh.name = `${node.id}#${part.id}`;
        mesh.position.set(...part.at.map((v) => v * spec.scale));
        if (part.scale) mesh.scale.set(...part.scale);
        mesh.castShadow = true;
        bone.add(mesh);
        group.userData[part.id] = mesh;
    }

    if (p.hair !== false && spec.hair) {
        const head = boneByIdx[indexOf.get('head')];
        const cap = buildHairCap([0, 0, 0], spec.scale, spec.hair);
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.Float32BufferAttribute(cap.positions, 3));
        g.setIndex(new T.Uint32BufferAttribute(cap.indices, 1));
        g.computeVertexNormals();
        const mesh = new T.Mesh(g, resolveMaterial(p.hair ?? { color: '#2b2622', roughness: 0.52 }));
        mesh.name = `${node.id}#hair`;
        mesh.castShadow = true;
        head.add(mesh);
        group.userData.hairMesh = mesh;
    }

    return { group, bones: boneByIdx, indexOf, world, scale: spec.scale };
}

/**
 * Bone constraints, evaluated once per frame between the pose and the draw.
 *
 * This is the half of `core/rig/constraints.js` that needs a scene graph.
 * None of these rules can be a keyframe, because every one of them answers a
 * question about where something ELSE ended up -- and the timeline has
 * already finished writing by the time that is known.
 *
 * Order is declaration order, and a constraint that reads a world position
 * forces a matrix update first. Which is why `driven` is cheap and `lookAt`
 * is not: a driver reads a local channel and never needs the graph resolved.
 */
function makeConstraintSolver(T, resolve, constraints = []) {
    if (!constraints.length) return null;

    const v1 = new T.Vector3(), v2 = new T.Vector3(), v3 = new T.Vector3();
    const q1 = new T.Quaternion(), q2 = new T.Quaternion();
    const prepared = [];

    const firstBone = (object) => object?.children?.find((c) => c.isBone) ?? null;

    for (const c of constraints) {
        if (c.type === 'ik') {
            const upper = resolve(c.chain);
            const fore = firstBone(upper);
            const hand = firstBone(fore);
            const target = resolve(c.target);
            if (!upper || !fore || !hand || !target) continue;
            // The bone lengths and the directions they point in at BIND.
            // Read from the children's local offsets, which the timeline
            // never writes -- only rotations are animated, and the
            // correctives scale girth (x and z) on a bone whose offset runs
            // down y, so the length this reads stays the length it was.
            prepared.push({
                ...c, world: true, upper, fore, hand, target,
                l0: fore.position.length(), l1: hand.position.length(),
                dir0: fore.position.clone().normalize(),
                dir1: hand.position.clone().normalize(),
                pole: new T.Vector3(...c.pole),
            });
            continue;
        }
        if (c.type === 'lookAt') {
            const source = resolve(c.source), target = resolve(c.target);
            if (!source || !target) continue;
            prepared.push({ ...c, world: true, source, target,
                            offsetV: c.offset ? new T.Vector3(...c.offset) : null });
            continue;
        }
        if (c.type === 'limitRotation') {
            const source = resolve(c.source);
            if (source) prepared.push({ ...c, world: false, source });
            continue;
        }
        if (c.type === 'copyRotation') {
            const source = resolve(c.source), from = resolve(c.from);
            if (source && from) prepared.push({ ...c, world: false, source, from });
            continue;
        }
        // driven
        const input = resolve(c.input.target);
        const outputs = c.outputs.map((o) => ({ ...o, object: resolve(o.target) }))
            .filter((o) => o.object);
        if (input && outputs.length) {
            prepared.push({ ...c, world: false, input, inputChannel: c.input.channel, outputs });
        }
    }

    /**
     * Point `bone`'s bind direction at a world-space point.
     *
     * The point arrives as three NUMBERS rather than as a vector, and
     * deliberately: passed a vector, the obvious call site hands in the same
     * scratch `Vector3` this function starts by overwriting with
     * `getWorldPosition`, so the direction comes out zero and the bone
     * silently does not move. Which is exactly what happened -- the forearm
     * tracked and the upper arm stayed in its bind pose.
     */
    const aim = (bone, bindDir, px, py, pz, weight) => {
        bone.getWorldPosition(v1);
        v2.set(px - v1.x, py - v1.y, pz - v1.z);
        if (v2.lengthSq() < 1e-12) return;
        v2.normalize();
        if (bone.parent) {
            bone.parent.getWorldQuaternion(q1);
            v2.applyQuaternion(q1.invert());
        }
        q2.setFromUnitVectors(bindDir, v2);
        // ponytail: `setFromUnitVectors` gives the SHORTEST rotation, so the
        // bone's roll about its own axis is whatever that happens to be. A
        // forearm's aim is still exact, because its direction is set
        // explicitly; what is undefined is the twist of the hand on the end
        // of it. Add a twist term when a film needs a palm to face
        // somewhere -- a `copyRotation` on the hand is the lazy route.
        if (weight >= 1) bone.quaternion.copy(q2);
        else bone.quaternion.slerp(q2, weight);
    };

    const clampTo = (object, limit) => {
        if (!limit) return;
        const [x, y, z] = limitRotation([object.rotation.x, object.rotation.y, object.rotation.z], limit);
        object.rotation.set(x, y, z);
    };

    const apply = (c) => {
        if (c.type === 'ik') {
            c.upper.getWorldPosition(v1);
            const root = [v1.x, v1.y, v1.z];
            c.target.getWorldPosition(v2);
            const target = [v2.x, v2.y, v2.z];
            // The pole hint is authored in the chain's own frame, so it
            // follows the shoulder round: an elbow told to point backwards
            // keeps pointing backwards when the torso turns.
            v3.copy(c.pole);
            if (c.upper.parent) { c.upper.parent.getWorldQuaternion(q1); v3.applyQuaternion(q1); }
            const { mid, tip } = solveTwoBone3D({
                root, target, l0: c.l0, l1: c.l1, pole: [v3.x, v3.y, v3.z],
            });
            aim(c.upper, c.dir0, mid[0], mid[1], mid[2], c.weight);
            c.upper.updateMatrixWorld(true);
            aim(c.fore, c.dir1, tip[0], tip[1], tip[2], c.weight);
            clampTo(c.fore, c.limit);
            c.fore.updateMatrixWorld(true);
            return;
        }
        if (c.type === 'lookAt') {
            c.target.getWorldPosition(v1);
            if (c.offsetV) v1.add(c.offsetV);
            q1.copy(c.source.quaternion);
            c.source.lookAt(v1);
            if (c.weight < 1) {
                q2.copy(c.source.quaternion);
                c.source.quaternion.copy(q1).slerp(q2, c.weight);
            }
            // The limit is what turns a lookAt into eye CONVERGENCE rather
            // than an eyeball on a gimbal: §6's "the eyes dart on an open
            // loop. They do not converge on what the head is turned toward."
            // An eye aimed at a target it cannot see rolls back into the
            // skull without one.
            clampTo(c.source, c.limit);
            return;
        }
        if (c.type === 'limitRotation') { clampTo(c.source, c.limit); return; }
        if (c.type === 'copyRotation') {
            // LOCAL rotation, which is what Blender's Copy Rotation defaults
            // to and what a mirrored limb wants; a world-space copy would
            // make a child of a turned torso fight its own parent.
            const sign = c.invert ? -1 : 1;
            const src = c.from.rotation, dst = c.source.rotation;
            for (const [i, axis] of ['x', 'y', 'z'].entries()) {
                if (!c.axes[i]) continue;
                dst[axis] = dst[axis] + (sign * src[axis] - dst[axis]) * c.weight;
            }
            clampTo(c.source, c.limit);
            return;
        }
        // driven: pose space deformation. Read one channel, write another.
        const driver = readChannel(c.input, c.inputChannel);
        for (const o of c.outputs) {
            const want = drivenValue(driver ?? 0, c.from, o.to, c.ease);
            const now = readChannel(o.object, o.channel);
            applyChannel(o.object, o.channel,
                         c.weight >= 1 || now == null ? want : now + (want - now) * c.weight);
        }
    };

    return (rootObject) => {
        let dirty = true;
        for (const c of prepared) {
            if (c.world && dirty) { rootObject.updateMatrixWorld(true); dirty = false; }
            apply(c);
            dirty = true;
        }
    };
}

/**
 * A simulated cloth sheet: a grid of particles, a dynamic geometry, and the
 * bone it hangs from.
 *
 * The mesh lives at the scene ROOT with no transform and carries WORLD-space
 * positions, because gravity is a world-space quantity and a sheet parented
 * to a moving shoulder would otherwise be simulated in a frame that is itself
 * accelerating. Attachment is not a constraint type: the pinned particles are
 * written to wherever the pin bone has got to, and the solver simply never
 * moves them.
 */
function buildCloth(T, node, resolveMaterial, resolve) {
    const p = node.props ?? {};
    const cloth = makeCloth({
        cols: p.cols ?? 12, rows: p.rows ?? 14,
        width: p.width ?? 0.6, height: p.height ?? 0.8,
        origin: p.at ?? [0, 0, 0], axis: p.axis ?? 'xy', pin: p.pin ?? 'top',
    });
    const geometry = new T.BufferGeometry();
    const attribute = new T.BufferAttribute(cloth.pos, 3);
    attribute.setUsage(T.DynamicDrawUsage);
    geometry.setAttribute('position', attribute);
    geometry.setIndex(new T.Uint32BufferAttribute(cloth.indices, 1));
    geometry.computeVertexNormals();

    const material = resolveMaterial(p.material ?? { color: '#8a2b35', roughness: 0.8 });
    material.side = T.DoubleSide;
    const mesh = new T.Mesh(geometry, material);
    mesh.name = node.id;
    mesh.castShadow = p.castShadow !== false;
    mesh.receiveShadow = true;
    // Simulated geometry moves every frame and the bounding sphere does not
    // follow it, so a cape would be frustum-culled the moment it swung out of
    // its rest bounds.
    mesh.frustumCulled = false;

    const pinNode = p.pinTo ? resolve(p.pinTo) : null;
    const colliders = (p.colliders ?? []).map((c) => ({
        object: c.node ? resolve(c.node) : null,
        at: c.at ? [...c.at] : [0, 0, 0], r: c.r ?? 0.1,
    }));
    const options = {
        gravity: p.gravity ?? [0, -9.81, 0], wind: p.wind ?? [0, 0, 0],
        damping: p.damping ?? 0.012, iterations: p.iterations ?? 5,
        floor: p.floor ?? null,
    };

    const scratch = new T.Vector3();
    const place = (indices) => {
        if (!pinNode) return;
        pinNode.updateWorldMatrix(true, false);
        for (const i of indices) {
            scratch.fromArray(cloth.bind, i * 3)
                .applyMatrix4(pinNode.matrixWorld).toArray(cloth.pos, i * 3);
        }
    };
    const all = [...cloth.pinned.keys()];
    const pins = all.filter((i) => cloth.pinned[i]);

    const seed = () => {
        cloth.pos.set(cloth.bind);
        place(all);
        cloth.prev.set(cloth.pos);
    };
    seed();

    let lastT = 0;
    return {
        mesh,
        step(t) {
            const dt = t - lastT;
            // A rewind, or a jump big enough that the sim would have to catch
            // up through more substeps than it is allowed, restarts from the
            // rest shape. Forward playback -- which is every offline render --
            // never takes this branch, so a render stays a deterministic
            // function of its frame sequence.
            if (dt < -1e-9 || dt > 0.5) { seed(); lastT = t; }
            else if (dt > 0) {
                place(pins);
                for (const c of colliders) {
                    if (c.object) c.object.getWorldPosition(scratch).toArray(c.at);
                }
                stepCloth(cloth, dt, { ...options, colliders });
                lastT = t;
            }
            attribute.needsUpdate = true;
            geometry.computeVertexNormals();
        },
    };
}

/**
 * A fluid card: a grid solver painted into a canvas texture on a plane.
 *
 * ponytail: a card, not a volume. The solver in `core/sim/fluid.js` is 2D, so
 * what it can be is a billboard -- which is how most smoke in most shots is
 * done, and the reason the engine already had a `CanvasTexture` path for
 * slides. Volumetric smoke needs ray-marched 3D density and a different
 * renderer.
 */
function buildFluid(T, node) {
    const p = node.props ?? {};
    const n = Math.max(8, Math.min(128, p.n ?? 48));
    const fluid = makeFluid({ n });
    const canvas = document.createElement('canvas');
    canvas.width = n; canvas.height = n;
    const ctx = canvas.getContext('2d');
    const image = ctx.createImageData(n, n);
    const texture = new T.CanvasTexture(canvas);
    texture.colorSpace = T.SRGBColorSpace;
    texture.minFilter = T.LinearFilter;
    texture.magFilter = T.LinearFilter;
    texture.generateMipmaps = false;

    const size = p.size ?? [2, 2];
    const colour = new T.Color(p.color ?? '#d8d8dd');
    const rgb = [colour.r * 255, colour.g * 255, colour.b * 255];
    const material = new T.MeshBasicMaterial({
        map: texture, transparent: true, depthWrite: false, toneMapped: false,
        opacity: p.opacity ?? 1,
    });
    if (p.blending && BLENDING[p.blending]) material.blending = T[BLENDING[p.blending]];
    const mesh = new T.Mesh(new T.PlaneGeometry(size[0], size[1]), material);
    mesh.name = node.id;

    const options = {
        visc: p.visc ?? 0, diff: p.diff ?? 0,
        dissipation: p.dissipation ?? 0.4, buoyancy: p.buoyancy ?? 1.6,
        gravityX: p.gravityX ?? 0, iterations: p.iterations ?? 12,
    };
    const sources = (p.sources ?? []).map((src) => ({
        x: src.x ?? 0.5, y: src.y ?? 0.08, radius: src.radius ?? 0.06,
        amount: src.amount ?? 2.5, vx: src.vx ?? 0, vy: src.vy ?? 1.2,
        at: src.at ?? 0, for: src.for ?? Infinity,
    }));
    const paint = { color: rgb, gain: p.gain ?? 1, gamma: p.gamma ?? 1 };

    const SUB = 1 / 60;
    let lastT = 0;
    return {
        mesh,
        step(t) {
            const dt = t - lastT;
            if (dt < -1e-9 || dt > 0.5) { resetFluid(fluid); lastT = t; }
            else if (dt > 0) {
                const steps = Math.min(3, Math.max(1, Math.round(dt / SUB)));
                const h = dt / steps;
                for (let k = 0; k < steps; k++) {
                    const now = lastT + h * (k + 1);
                    for (const src of sources) {
                        if (now < src.at || now > src.at + src.for) continue;
                        // Per substep and scaled by the substep, so the
                        // injected mass is the same whatever the frame rate.
                        addSource(fluid, { ...src, amount: src.amount * h * 24 });
                    }
                    stepFluid(fluid, h, options);
                }
                lastT = t;
            }
            fluidToRGBA(fluid, image.data, paint);
            ctx.putImageData(image, 0, 0);
            texture.needsUpdate = true;
        },
    };
}

export function buildScene3D(T, compiled, {
    width, height, mergeGeometries = null,
    /**
     * Models the PAGE already loaded, keyed by the id the film used:
     * `{ scene, clips, nodes }`. Loading is asynchronous and needs the
     * network and a `GLTFLoader`; this function is synchronous and takes
     * THREE as an argument precisely so it imports nothing. Same bargain as
     * `mergeGeometries`.
     */
    models = null, cloneModel = null, environment = null,
    /**
     * Addon geometry classes the page imported. Only `RoundedBoxGeometry` so
     * far, and only `cube` reads it; same bargain as `mergeGeometries`.
     */
    geometries = null,
    /**
     * Built textures, keyed by the id the film declared. Built by the page
     * (via `buildTextures`) for the same reason models are: a `src` has to
     * be fetched, and this function is synchronous.
     */
    textures = null,
} = {}) {
    const { scene: recipe, meta, emitters, cameraId, lookId } = compiled;
    const sims = [];
    const clipPlanes = [];
    const root = new T.Scene();
    root.background = new T.Color(meta.background);
    /**
     * An environment the film DECLARED lights everything, as asked. An
     * implicit one -- the built-in studio, applied because the film contains
     * a metal -- is attached per material instead, below. See the end of this
     * function.
     */
    if (environment && !meta.environment?.implicit) {
        root.environment = environment;
        if (meta.environment?.intensity != null) root.environmentIntensity = meta.environment.intensity;
        // Lighting by default, sky only if the film asked: most shots want
        // the bounce light off a panorama and their own backdrop behind it.
        if (meta.environment?.background) {
            root.background = environment;
            if (meta.environment.blur) root.backgroundBlurriness = meta.environment.blur;
        }
    }
    const registry = new Map();
    const w = width ?? meta.width;
    const h = height ?? meta.height;

    const camera = new T.PerspectiveCamera(meta.fov ?? 38, w / h, 0.01, 200);
    const lookTarget = new T.Object3D();
    root.add(camera);
    root.add(lookTarget);
    registry.set(cameraId, camera);
    registry.set(lookId, lookTarget);

    /**
     * Clip planes FIRST, before any material exists.
     *
     * A material that names a plane has to be handed the plane object itself
     * -- THREE holds the reference and reads `constant` every frame, which is
     * what makes an animated cut work at all. So the planes cannot be created
     * during the walk that also creates the materials: node order in a scene
     * recipe is parent-before-child, not plane-before-user, and a shell
     * declared before its plane would silently get no clipping.
     */
    const clipByName = new Map();
    recipe.walk((node) => {
        if (node.kind !== 'clipPlane') return;
        const p = node.props ?? {};
        const holder = new THREE_OBJECT(T);
        holder.visible = false;
        holder.name = node.id;
        holder.position.set(p.at?.[0] ?? 0, 0, 0);
        const plane = new T.Plane(new T.Vector3(...(p.normal ?? [1, 0, 0])),
                                 p.at?.[0] ?? 0);
        clipPlanes.push({ plane, holder, shadows: p.shadows !== false });
        clipByName.set(node.id.replace(/^__clip:/, ''), plane);
        root.add(holder);
        registry.set(node.id, holder);
    });

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
            object = new T.Mesh(build(T, p.geometry, geometries),
                                makeMaterial(T, p.material, p.blending, textures, clipByName));
            // A cut face and a sky shell are both single-sided surfaces seen
            // from the inside at some point in a move, so a mesh may ask for
            // which sides to draw rather than always getting the front.
            if (p.material?.side === 'double') object.material.side = T.DoubleSide;
            else if (p.material?.side === 'back') object.material.side = T.BackSide;
            object.castShadow = p.castShadow !== false;
            object.receiveShadow = p.receiveShadow !== false;
        } else if (node.kind === 'humanoid') {
            if (!mergeGeometries) return;
            const built = buildHumanoid(T, mergeGeometries, node,
                                        (m) => makeMaterial(T, m, null, textures, clipByName));
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
        } else if (node.kind === 'model') {
            const loaded = models?.get ? models.get(p.model) : models?.[p.model];
            // A model the page could not fetch has already been reported by
            // the page; drawing nothing is better than taking the frame down.
            if (!loaded?.scene) return;
            /**
             * The first cast of a model uses the loaded object; a second has
             * to be a CLONE, and a skinned one has to be cloned by
             * `SkeletonUtils` -- `Object3D.clone` copies the meshes and
             * leaves them bound to the ORIGINAL skeleton, so two characters
             * from one file move as one.
             */
            const instance = loaded.used && cloneModel ? cloneModel(loaded.scene) : loaded.scene;
            if (loaded.used && !cloneModel) return;
            loaded.used = true;
            object = instance;
            instance.traverse((child) => {
                // Every named node becomes addressable as `<cast>/<name>`,
                // which is the whole of how a film animates a part of a
                // model somebody else built.
                if (child.name) {
                    const id = `${node.id}/${child.name}`;
                    if (!registry.has(id)) registry.set(id, child);
                }
                if (!child.isMesh) return;
                child.castShadow = p.castShadow !== false;
                child.receiveShadow = p.receiveShadow !== false;
            });
        } else if (node.kind === 'cloth') {
            const sim = buildCloth(T, node, (m) => makeMaterial(T, m, null, textures, clipByName),
                                   (id) => registry.get(id));
            sims.push(sim);
            object = sim.mesh;
        } else if (node.kind === 'fluid') {
            const sim = buildFluid(T, node);
            sims.push(sim);
            object = sim.mesh;
        } else if (node.kind === 'light') {
            object = makeLight(T, p);
            if (object.castShadow !== undefined && p.castShadow) {
                object.castShadow = true;
                // The map size only; every other number comes from
                // `fitShadows` below, once the scene exists to be measured.
                // 2048 rather than 1024 because this renderer is offline and
                // one more megabyte of depth buffer costs nothing it has.
                if (object.shadow) object.shadow.mapSize.set(2048, 2048);
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
        // An authored `visible: false`. The compiler has accepted `set
        // visible` as a channel since Phase 14 and nothing ever applied the
        // AUTHORED value, so a part that is meant to appear part-way through
        // a film was on screen from frame one.
        if (node.visible === false) object.visible = false;
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
        const geometry = build(T, spec.geometry, geometries);
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
            const mesh = new T.Mesh(geometry, makeMaterial(T, spec.material, spec.blending, textures, clipByName));
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
    // Built after the walk, so every bone, target and prop a constraint
    // names is already in the registry.
    const solveConstraints = makeConstraintSolver(T, (id) => registry.get(id),
                                                  compiled.constraints ?? []);

    const step = (tSec) => {
        // Constraints first: they read and WRITE bone rotations, so they have
        // to run after the timeline's pose and before anything that measures
        // where a bone ended up -- the camera's aim, a cape's pin, a particle
        // parented to a hand.
        if (solveConstraints) solveConstraints(root);
        // The plane's animated distance, pushed into the plane the renderer
        // tests. `constant` is negated against the normal's direction by
        // THREE's own convention, so writing `at` straight in is what makes
        // `cut to: 0.9` mean "the plane is 0.9 m along its normal".
        for (const c of clipPlanes) c.plane.constant = c.holder.position.x;
        for (const sim of sims) sim.step(tSec);
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
    /**
     * An environment nobody asked for lights only what needs it.
     *
     * The built-in studio is a DEFAULT -- the film did not declare it -- and
     * it exists for exactly one reason: a metal has no diffuse albedo, so
     * with nothing to reflect it renders black. A dielectric has no such
     * problem, its colour IS its albedo, and lighting one with a neutral grey
     * room desaturates a palette the film chose under its own lights.
     * Measured: `scene.environment` at full strength took the AK-47's blue
     * backdrop from 0.44 saturation to 0.17. That is a restyling of fifty
     * finished films, to fix a defect in their metals.
     *
     * So an implicit environment is attached to the METALS and to nothing
     * else, weighted by `metalness` so a half-metal gets half of it. Every
     * dielectric in every existing film renders exactly as it did.
     *
     * It has to be `material.envMap` rather than `scene.environment`:
     * `envMapIntensity` is refreshed only for a material that owns its map,
     * so with a scene environment the weighting is silently ignored --
     * measured, setting it to 0 on every material changed not one pixel.
     */
    if (environment && meta.environment?.implicit) {
        const strength = meta.environment.intensity ?? 1;
        for (const m of materialsIn(root)) {
            if (!(m.metalness > 0)) continue;
            m.envMap = environment;
            m.envMapIntensity = m.metalness * strength;
        }
    }

    const shadowFit = fitShadows(T, root);

    return { root, camera, lookTarget, registry, resolve, step, pools, sims,
             clipPlanes, textures, shadowFit,
             constraints: compiled.constraints ?? [],
             dispose() {
                 root.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
             } };
}
