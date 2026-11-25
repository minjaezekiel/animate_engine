import { Scene } from '../scene/Scene.js';
import { createTimeline, key, addClip, addInstance } from '../anim/Timeline.js';
import { createClip } from '../anim/Clip.js';
import { createTrack, setKey } from '../anim/Track.js';
import { createEmitter, emitterSpan } from '../anim/particles.js';
import { createCue } from '../audio/cues.js';
import { HUMANOID_BONES } from '../art/humanoid3d.js';
import { EXPRESSIONS } from '../art/face3d.js';
import { normalizeConstraints, humanoidCorrectives } from '../rig/constraints.js';
import { gripAngles, DIGIT_IDS, HAND_POSE_NAMES } from '../art/hands.js';
import { normalizePost, normalizePostRamp, isPostKeyable, postChannel,
         POST_KEYABLE, POST_NODE } from './post.js';
import { normalizeOverlay } from '../art/overlay.js';
import { normalizeDuck } from '../audio/ducking.js';
import { normalizeMotionBlur } from '../motion/motionBlur.js';
import { normalizeTransitions } from '../art/transitions.js';
import { anticipationValue, overshootValue, ANTICIPATION_SHARE, OVERSHOOT_AT } from '../anim/principles.js';

/**
 * Compile a 3D film script into a scene recipe and a timeline.
 *
 * The 2D path had a declarative film script from day one; 3D had only the
 * editor's imperative command ops, so a fifty-second product animation meant
 * hand-computing several hundred keyframe times. Everything that made the 2D
 * compiler worth having -- shots that sequence themselves, `at` resolved
 * once, a derived duration, diagnostics that never throw -- was unavailable
 * in 3D for no reason other than that nobody had written this file.
 *
 * What it deliberately does NOT do is build THREE objects. It emits a core
 * Scene of plain nodes carrying a geometry and material *recipe*, which
 * `backends/three3d/SceneAdapter` instantiates. That keeps this module pure
 * and Node-testable, which is the same bargain the 2D compiler makes.
 *
 * Channels are scalar (`position.x`, `rotation.y`, `material.opacity`) rather
 * than vec3, so the 2D animation stack serves this path unchanged: one
 * `writeChannel`, one `Additive`, one set of anticipation and overshoot
 * helpers rather than a second copy of each for arrays.
 */

const DEG = Math.PI / 180;
const DEFAULTS = { shotDuration: 3, fov: 38, fps: 24, width: 1280, height: 720 };
const AXES = ['x', 'y', 'z'];

const vec3 = (v, fallback = 0) => (Array.isArray(v)
    ? [v[0] ?? fallback, v[1] ?? fallback, v[2] ?? fallback]
    : [v ?? fallback, v ?? fallback, v ?? fallback]);

/**
 * `"environment": "sky.hdr"` and the long form both mean the same thing.
 */
function normalizeEnvironment(spec) {
    if (!spec) return null;
    const src = typeof spec === 'string' ? spec : spec.src;
    if (!src) return null;
    return {
        src,
        // An environment lights the scene by default and is only the visible
        // sky if you ask: most shots want the lighting and their own backdrop.
        background: typeof spec === 'string' ? false : spec.background === true,
        intensity: (typeof spec === 'string' ? 1 : spec.intensity) ?? 1,
        blur: (typeof spec === 'string' ? 0 : spec.blur) ?? 0,
    };
}

/**
 * Clipping planes, as plane equations.
 *
 * Accepts the long form `{ normal: [x,y,z], at: d, name }` and the bare
 * `[x,y,z,d]`. A plane is animatable through `set` on `clip.<name>.at`,
 * which is what makes a cutaway *open* rather than simply be open -- the
 * section sweeps through the body on a timeline like any other channel.
 */
function normalizeClip(spec, warn) {
    if (!spec) return [];
    const list = Array.isArray(spec) ? spec : [spec];
    const out = [];
    for (const [i, p] of list.entries()) {
        const where = `meta.clip[${i}]`;
        const normal = Array.isArray(p) ? p.slice(0, 3) : p.normal;
        const at = Array.isArray(p) ? p[3] ?? 0 : p.at ?? 0;
        if (!Array.isArray(normal) || normal.length < 3) {
            warn('a clip plane needs a 3-component `normal`', where);
            continue;
        }
        const len = Math.hypot(...normal);
        if (len < 1e-6) {
            // A zero normal is a plane with no orientation: THREE keeps it,
            // and every fragment tests against a degenerate half-space, so
            // the mesh either vanishes entirely or is untouched depending on
            // the sign of a float that is meant to be zero.
            warn('a clip plane\'s `normal` has zero length', where);
            continue;
        }
        out.push({
            name: (Array.isArray(p) ? null : p.name) ?? `clip${i}`,
            // Normalised here, not in the backend, so `at` is a distance in
            // metres whatever scale the normal was typed at.
            normal: normal.map((n) => n / len),
            at,
            // A clipped shadow is the other half of a cutaway reading
            // correctly: without it the removed half still casts.
            shadows: (Array.isArray(p) ? true : p.shadows) !== false,
        });
    }
    return out;
}

/**
 * The `textures` block: generated or fetched, declared once and referenced by
 * name from any number of material slots.
 *
 * Validated here and BUILT in the backend, the same division `models` and
 * `environment` already use: the compiler owns what is legal, the page owns
 * the network and the GPU.
 */
function normalizeTextures(spec, warn) {
    const out = {};
    for (const [id, t] of Object.entries(spec ?? {})) {
        if (!t || typeof t !== 'object') { warn(`texture '${id}' is not an object`, `textures.${id}`); continue; }
        if (!t.src && !t.layers && !t.normalFrom && !t.text) {
            warn(`texture '${id}' has no \`src\`, \`layers\`, \`text\` or \`normalFrom\``,
                 `textures.${id}`);
            continue;
        }
        if (t.normalFrom && !spec[t.normalFrom]) {
            warn(`texture '${id}' derives from '${t.normalFrom}', which is not declared`,
                 `textures.${id}`);
            continue;
        }
        out[id] = { id, ...t };
    }
    return out;
}

/**
 * Material slots that take a texture rather than a number or a colour.
 *
 * This list exists because of the shape of the bug it prevents. `makeMaterial`
 * spreads every unrecognised key straight into the THREE constructor, which
 * is what makes new PBR properties free -- and it means `map: "albedo"` sets
 * `material.map` to the STRING "albedo". THREE then calls `.map.isTexture` on
 * it, gets undefined, and renders the surface untextured with no error
 * anywhere. Exactly the failure `COLOR_PROPS` exists to prevent one type
 * earlier, so it is fixed the same way: by naming the slots.
 */
export const TEXTURE_SLOTS = [
    'map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap',
    'bumpMap', 'alphaMap', 'aoMap', 'displacementMap', 'clearcoatMap',
    'sheenColorMap', 'specularMap', 'iridescenceMap', 'lightMap',
];

/**
 * `models` is what the PAGE already loaded, keyed by the id the film used:
 * `{ nodes: ['Seat', ...], clips: [coreClip, ...] }`. Passing it in rather
 * than loading here keeps this module pure and Node-testable, the same
 * bargain it already makes with THREE -- and it is the only way the compiler
 * can know which node names and which animations a downloaded file actually
 * contains, which is exactly what it has to validate.
 */
export function compileFilm3D(film = {}, { assets = {}, models = {} } = {}) {
    const diagnostics = [];
    const warn = (message, location) => diagnostics.push({ severity: 'warning', message, location });

    const meta = {
        title: film.meta?.title ?? 'untitled',
        fps: film.meta?.fps ?? DEFAULTS.fps,
        width: film.meta?.width ?? DEFAULTS.width,
        height: film.meta?.height ?? DEFAULTS.height,
        background: film.meta?.background ?? '#0b0b0d',
        /**
         * An image-based lighting environment: an HDR panorama that lights
         * the scene and can also be its sky.
         *
         * Parsed since Phase 14 and read by nothing, so a film could declare
         * one and render under its three point lights with no diagnostic. It
         * is normalised here and loaded by the page, which owns the network.
         */
        environment: normalizeEnvironment(film.meta?.environment),
        bloom: film.meta?.bloom ?? null,
        step: film.meta?.step ?? 0,
        post: null,         // filled below, once `warn` can be used
        overlay: null,      // ditto
        /**
         * Transitions, filled once the shot spans exist -- a boundary is
         * defined by the shots either side of it, so this cannot be done up
         * here with the rest of `meta`.
         *
         * Until this phase the 3D path had none at all and did not reject a
         * `transitionIn` either, so a film could declare one and cut hard
         * with no diagnostic. See `core/art/transitions.js`.
         */
        transitions: [],
        /**
         * Global clipping planes: the engine's answer to having no CSG.
         *
         * [13-3D-FILM.md §8](../../../docs/13-3D-FILM.md) lists "nothing cuts
         * a hole in a solid" as an open gap, and for a cutaway -- a planet
         * opened to its core, an engine sectioned, a building in half -- that
         * gap is the whole film. A clipping plane is not CSG: it does not
         * produce new geometry and it leaves the cut hollow. But it is a
         * *half-space test in the fragment shader*, which costs one dot
         * product per fragment, needs no new dependency, no mesh boolean and
         * no correctness surface of its own -- and for a sectioned view it
         * shows exactly what a section drawing shows.
         *
         * `[nx, ny, nz, d]` is the plane equation: geometry on the NEGATIVE
         * side is discarded, which matches `THREE.Plane`'s own convention so
         * a film's numbers mean what the renderer's docs say they mean.
         */
        clip: normalizeClip(film.meta?.clip, warn),
    };
    meta.post = normalizePost(film.meta?.post, { bloom: meta.bloom, warn });
    /**
     * Ducking the bed under the dialogue. Opt-in, because turning it on for
     * every existing film would change fifty-one finished mixes.
     */
    meta.duck = normalizeDuck(film.meta?.audio?.duck ?? film.meta?.duck, { warn });
    /**
     * Subframe motion blur. Opt-in, and the reason is cost rather than taste:
     * it multiplies render time by the sample count, so turning it on for
     * every film would make a 175-second render take 23 minutes.
     */
    meta.motionBlur = normalizeMotionBlur(film.meta?.motionBlur, { warn });
    meta.overlay = normalizeOverlay(film.overlay, warn, { designHeight: meta.height });

    const scene = new Scene();
    const timeline = createTimeline({ fps: meta.fps });
    if (meta.step) timeline.step = meta.step;

    const materials = film.materials ?? {};
    const textures = normalizeTextures(film.textures, warn);
    /**
     * A material's texture slots name declared textures. An undeclared name
     * is a warning HERE rather than a silently untextured surface at render
     * time -- see `TEXTURE_SLOTS`.
     */
    const checkTextureRefs = (spec, path) => {
        for (const slot of TEXTURE_SLOTS) {
            const ref = spec[slot];
            if (ref == null || typeof ref !== 'string') continue;
            if (!textures[ref]) {
                warn(`${slot} names texture '${ref}', which is not declared under \`textures\``, path);
            }
        }
        return spec;
    };
    const resolveMaterial = (ref, path) => {
        if (!ref) return { color: '#9aa0a6' };
        if (typeof ref === 'object') return checkTextureRefs({ ...ref }, path);
        if (materials[ref]) return checkTextureRefs({ ...materials[ref] }, `materials.${ref}`);
        warn(`unknown material '${ref}'`, path);
        return { color: '#ff00ff' };
    };

    // ---------------------------------------------------------------- lights
    for (const [i, light] of (film.lights ?? []).entries()) {
        const id = light.id ?? `light${i + 1}`;
        scene.add({
            id, kind: 'light',
            props: {
                lightType: light.type ?? 'directional',
                color: light.color ?? '#ffffff',
                intensity: light.intensity ?? 1,
                distance: light.distance ?? 0,
                angle: light.angle ?? 60,
                penumbra: light.penumbra ?? 0.2,
                castShadow: light.castShadow ?? (light.type !== 'ambient'),
                at: vec3(light.at ?? [0, 0, 0]),
                target: light.target ? vec3(light.target) : null,
            },
        });
    }

    // ------------------------------------------------------------ the camera
    const cameraId = '__camera';
    const lookId = '__look';
    scene.add({ id: cameraId, kind: 'camera', props: { fov: DEFAULTS.fov, at: [0, 0, 5] } });
    // A look-at target as a real node, driven by ordinary position keys, with
    // the adapter calling camera.lookAt on it each frame. Baking a rotation
    // instead would interpolate Euler angles between two aim directions,
    // which swings wide on anything but a straight dolly.
    scene.add({ id: lookId, kind: 'target', props: { at: [0, 0, 0] } });

    // -------------------------------------------------------------- targets
    /**
     * Named, animatable points in space.
     *
     * This is the entire authoring surface for IK and for gaze, and it is why
     * neither needed a verb of its own. A target is a node; `move` animates a
     * node; a constraint reads one. "Put the hand on the screen" is a target
     * at the screen and an `ik` constraint, and "look at the camera" is a
     * target and a `lookAt` -- using the same two mechanisms a camera's own
     * look-at has used since this compiler was written.
     */
    for (const [id, spec] of Object.entries(film.targets ?? {})) {
        if (scene.get(id)) { warn(`target '${id}' collides with an existing node`, `targets.${id}`); continue; }
        scene.add({ id, kind: 'target',
                    props: { at: vec3(Array.isArray(spec) ? spec : spec?.at ?? [0, 0, 0]) } });
    }

    /**
     * A clipping plane is a node too, for exactly the reason a target is one:
     * a node can be animated, and the whole animation stack already knows
     * how. `cut` writes `at` on it; the backend reads `at` each frame and
     * pushes it into the plane's `constant`.
     */
    for (const plane of meta.clip) {
        scene.add({ id: `__clip:${plane.name}`, kind: 'clipPlane',
                    // `at` is a vec3 because every other node's `at` is, and
                    // `restVec` reads it. Only x is meaningful: it is the
                    // plane's distance along its own normal.
                    props: { at: [plane.at, 0, 0], normal: plane.normal,
                             shadows: plane.shadows } });
    }

    // ----------------------------------------------------------------- cast
    const castMap = new Map();
    /** Imported talking heads, by cast name. Resolved to morph names by the page. */
    const faces = {};
    const constraintSpecs = [];
    const characters = new Map();
    for (const entry of film.cast ?? []) {
        const as = entry.as ?? entry.character ?? entry.assembly ?? entry.model;

        /**
         * An imported model: a chair from Blender, a city from an asset site,
         * a rigged robot from Mixamo.
         *
         * One node in the core scene, not one per glTF node. A downloaded
         * environment can carry thousands, and the core scene exists to be
         * walked and measured. Its named children are still addressable --
         * the backend registers each as `<cast>/<node name>` -- which is
         * what `loaded.nodes` is checked against here, so a film that
         * animates a part that is not in the file says so at compile time
         * rather than by not moving.
         */
        if (entry.model) {
            const spec = film.models?.[entry.model];
            if (!spec) { warn(`unknown model '${entry.model}'`, `cast.${as}`); continue; }
            /**
             * Which node of this model is the talking head.
             *
             * Declared rather than guessed, because a model commonly has
             * several meshes with morph targets -- a head, a set of teeth, a
             * tongue -- and picking the one with the most targets would be
             * right often enough to be trusted and wrong often enough to
             * waste an afternoon. The morph NAMES are discovered (the page
             * reads them off the loaded model); which mesh to drive is the
             * author's call.
             */
            if (spec.face) {
                const face = typeof spec.face === 'string' ? { node: spec.face } : spec.face;
                if (!face.node) {
                    warn(`model '${entry.model}' declares a \`face\` with no \`node\``,
                         `models.${entry.model}.face`);
                } else {
                    faces[as] = {
                        node: `${as}/${face.node}`,
                        ...(face.jaw ? { jaw: `${as}/${face.jaw}` } : {}),
                        // An author's own viseme -> morph-name map, for a head
                        // whose naming no table could guess.
                        ...(face.visemes ? { visemes: face.visemes } : {}),
                    };
                }
            }
            const loaded = models[entry.model] ?? null;
            scene.add({
                id: as, kind: 'model',
                props: {
                    model: entry.model, src: spec.src ?? null,
                    at: vec3(entry.at ?? [0, 0, 0]),
                    rot: vec3(entry.rot ?? [0, 0, 0]).map((d) => d * DEG),
                    scale: vec3(entry.scale ?? spec.scale ?? 1, 1),
                    castShadow: entry.castShadow ?? spec.castShadow ?? true,
                    receiveShadow: entry.receiveShadow ?? spec.receiveShadow ?? true,
                    // A downloaded environment is usually lit already and
                    // looks wrong taking a shadow from this film's key.
                    environment: spec.environment === true,
                },
            });
            const parts = new Map();
            for (const node of loaded?.nodes ?? []) parts.set(node, `${as}/${node}`);
            castMap.set(as, { rootId: as, parts, assembly: spec, model: entry.model,
                              clips: loaded?.clips ?? [], nodes: loaded?.nodes ?? null });
            continue;
        }

        // A character is a rig, not a parts list: the backend builds its
        // bones and skins a surface over them. Its extra geometry -- eyes,
        // hair, a pointer in the hand -- parents to a BONE by name, which the
        // adapter registers under the character's namespace.
        if (entry.character) {
            const char = film.characters?.[entry.character];
            if (!char) { warn(`unknown character '${entry.character}'`, `cast.${as}`); continue; }
            scene.add({
                id: as, kind: 'humanoid',
                props: {
                    outfit: char.outfit ?? 'suit', height: char.height ?? 1.8,
                    skin: resolveMaterial(char.skin ?? 'skin', `${as}.skin`),
                    jacket: resolveMaterial(char.jacket ?? 'jacket', `${as}.jacket`),
                    shirt: resolveMaterial(char.shirt ?? char.jacket ?? 'shirt', `${as}.shirt`),
                    trouser: resolveMaterial(char.trouser ?? 'trouser', `${as}.trouser`),
                    shoe: resolveMaterial(char.shoe ?? 'shoe', `${as}.shoe`),
                    // Teeth, a tongue and a hair shell, all generated. A
                    // character that names none of these still gets them,
                    // because a mouth with no teeth is not a style choice.
                    tooth: char.tooth ? resolveMaterial(char.tooth, `${as}.tooth`) : null,
                    tongue: char.tongue ? resolveMaterial(char.tongue, `${as}.tongue`) : null,
                    hair: char.hair === false ? false
                        : char.hair ? resolveMaterial(char.hair, `${as}.hair`) : null,
                    hairStyle: char.hairStyle ?? null,
                    mouth: char.mouth !== false,
                    at: vec3(entry.at ?? [0, 0, 0]),
                    rot: vec3(entry.rot ?? [0, 0, 0]).map((d) => d * DEG),
                    scale: vec3(entry.scale ?? 1, 1),
                },
            });
            // The bones exist in the core scene too, not only in the
            // backend. A part that parents to `head` needs a node to parent
            // TO, the staging check needs something to measure, and the
            // adapter skips any node already in its registry -- which the
            // humanoid's own bones are, by the time its children are walked.
            const parts = new Map();
            const scale = (char.height ?? 1.8) / 1.8;
            for (const bone of HUMANOID_BONES) {
                scene.add({
                    id: `${as}/${bone.id}`, kind: 'bone',
                    parentId: bone.parent ? `${as}/${bone.parent}` : as,
                    props: { at: bone.at.map((v) => v * scale), bone: bone.id },
                }, bone.parent ? `${as}/${bone.parent}` : as);
                parts.set(bone.id, `${as}/${bone.id}`);
            }
            // The face mesh, which is what carries the blendshapes. Declared
            // here so a film can write `morph.<name>` onto `<as>/face` the
            // same way it writes any other channel.
            scene.add({ id: `${as}/face`, kind: 'face', parentId: `${as}/head`,
                        props: { at: [0, 0, 0] } }, `${as}/head`);
            parts.set('face', `${as}/face`);
            for (const part of char.parts ?? []) {
                const nodeId = `${as}/${part.id}`;
                // `parent` may name a bone ('head') or an earlier part.
                const parentId = part.parent ? `${as}/${part.parent}` : as;
                if (part.parent && !parts.has(part.parent)) {
                    warn(`part '${part.id}' parents to '${part.parent}', which is neither `
                         + 'a bone nor an earlier part', nodeId);
                    continue;
                }
                scene.add({
                    id: nodeId, kind: 'mesh', parentId,
                    props: {
                        geometry: { ...(part.geometry ?? { kind: 'sphere', radius: 0.01 }) },
                        material: resolveMaterial(part.material, nodeId),
                        at: vec3(part.at ?? [0, 0, 0]),
                        rot: vec3(part.rot ?? [0, 0, 0]).map((d) => d * DEG),
                        scale: vec3(part.scale ?? 1, 1),
                        blending: part.blending ?? null,
                        attachTo: part.parent ?? null,
                    },
                }, parentId);
                parts.set(part.id, nodeId);
            }
            castMap.set(as, { rootId: as, parts, assembly: char, character: true });
            characters.set(as, { name: entry.character, spec: char, voice: entry.voice ?? char.voice });

            /**
             * A character's own constraints, with bare names read as its own
             * bones -- `armL` rather than `presenter/armL` -- because a
             * character block is already scoped to one character and
             * repeating its name on every line is how a rig spec becomes
             * unreadable.
             *
             * `correctives` defaults ON. The alternative is an elbow that
             * collapses into itself at 120 degrees, which is a defect, not a
             * style; a film that wants the raw skin can say `false`.
             */
            // Only a name the character actually HAS is scoped. A bare
            // `gaze` is a global target and must stay one -- prefixing it
            // blindly turned every lookAt into a constraint pointing at a
            // node that does not exist, and said so four times.
            const scope = (ref) => (typeof ref === 'string' && !ref.includes('/')
                && parts.has(ref) ? `${as}/${ref}` : ref);
            for (const raw of char.constraints ?? []) {
                const c = { ...raw };
                for (const field of ['source', 'target', 'from', 'chain']) {
                    if (c[field] != null) c[field] = scope(c[field]);
                }
                if (c.input) c.input = { ...c.input, target: scope(c.input.target) };
                if (c.outputs) c.outputs = c.outputs.map((o) => ({ ...o, target: scope(o.target) }));
                constraintSpecs.push({ c, where: `${as}.constraints` });
            }
            if (char.correctives !== false) {
                for (const c of humanoidCorrectives(as)) {
                    constraintSpecs.push({ c, where: `${as}.correctives` });
                }
            }
            continue;
        }

        const assembly = film.assemblies?.[entry.assembly];
        if (!assembly) { warn(`unknown assembly '${entry.assembly}'`, `cast.${as}`); continue; }
        const rootId = as;
        scene.add({ id: rootId, kind: 'group',
                    props: { at: vec3(entry.at ?? [0, 0, 0]),
                             rot: vec3(entry.rot ?? [0, 0, 0]).map((d) => d * DEG),
                             scale: vec3(entry.scale ?? 1, 1) } });
        const parts = new Map();
        for (const part of assembly.parts ?? []) {
            const nodeId = `${rootId}/${part.id}`;
            const parentId = part.parent ? `${rootId}/${part.parent}` : rootId;
            if (part.parent && !parts.has(part.parent)) {
                warn(`part '${part.id}' names parent '${part.parent}' before it is declared`,
                     `${rootId}/${part.id}`);
            }
            /**
             * A part with no geometry is a PIVOT, not a cube.
             *
             * It used to default to `{ kind: 'cube' }`, so the only way to
             * get an empty transform node inside an assembly was an invisible
             * mesh -- and an unknown geometry kind makes the backend skip the
             * node entirely, which silently orphans everything parented to
             * it.
             *
             * A pivot is not a nicety. "Tilt the planet 23.4 degrees, and
             * spin the globe inside that tilt" is two nested rotations about
             * two different axes, and a single node has one rotation. Without
             * a pivot the spin has to be composed into the tilt by hand, per
             * frame, which is precisely the arithmetic this compiler exists
             * to remove -- and getting it wrong makes the pole trace a cone
             * instead of holding still.
             */
            const isPivot = !part.geometry || part.geometry.kind === 'group';
            scene.add({
                id: nodeId, kind: isPivot ? 'group' : 'mesh', parentId,
                props: {
                    geometry: { ...(part.geometry ?? { kind: 'group' }) },
                    material: isPivot ? null : resolveMaterial(part.material, nodeId),
                    at: vec3(part.at ?? [0, 0, 0]),
                    rot: vec3(part.rot ?? [0, 0, 0]).map((d) => d * DEG),
                    scale: vec3(part.scale ?? 1, 1),
                    blending: part.blending ?? null,
                    // A cut face, a cloud shell and an atmosphere are all
                    // surfaces you see from both sides at some point in a
                    // move, and a part that is not meant to cast (a glow, a
                    // cloud deck) would otherwise print its own silhouette
                    // onto the thing it surrounds.
                    castShadow: part.castShadow,
                    receiveShadow: part.receiveShadow,
                },
                // `visible` lives on the node, not in props, because that is
                // where `set visible` reads and writes it.
                visible: part.visible !== false,
            }, parentId);
            parts.set(part.id, nodeId);
        }
        castMap.set(as, { rootId, parts, assembly });
    }

    for (const [id, spec] of Object.entries(film.models ?? {})) {
        if (!spec?.src) warn(`model '${id}' has no \`src\``, `models.${id}`);
        if (![...castMap.values()].some((c) => c.model === id)) {
            warn(`model '${id}' is declared and never cast`, `models.${id}`);
        }
    }

    // ---------------------------------------------------------------- cloth
    /**
     * Simulated sheets: a cape, a flag, a curtain, a tablecloth.
     *
     * The character's own clothing stays an inflated body, because that is
     * the only garment that provably cannot clip through it. This is the
     * layer whose whole job is to move, and it is declared beside the cast
     * rather than inside a character because a flag is not a character.
     */
    for (const [id, spec] of Object.entries(film.cloth ?? {})) {
        if (spec.pinTo && !scene.get(spec.pinTo)) {
            warn(`cloth '${id}' pins to '${spec.pinTo}', which is not a node`, `cloth.${id}`);
        }
        for (const [ci, col] of (spec.colliders ?? []).entries()) {
            if (col.node && !scene.get(col.node)) {
                warn(`cloth '${id}' collider ${ci} names '${col.node}', which is not a node`,
                     `cloth.${id}.colliders[${ci}]`);
            }
        }
        scene.add({
            id, kind: 'cloth',
            props: {
                cols: spec.cols ?? 12, rows: spec.rows ?? 14,
                width: spec.width ?? 0.6, height: spec.height ?? 0.8,
                axis: spec.axis ?? 'xy', pin: spec.pin ?? 'top',
                pinTo: spec.pinTo ?? null,
                at: vec3(spec.at ?? [0, 0, 0]),
                material: resolveMaterial(spec.material, `cloth.${id}`),
                gravity: spec.gravity ? vec3(spec.gravity) : [0, -9.81, 0],
                wind: spec.wind ? vec3(spec.wind) : [0, 0, 0],
                damping: spec.damping ?? 0.012,
                iterations: spec.iterations ?? 5,
                floor: spec.floor ?? null,
                colliders: (spec.colliders ?? []).map((c) => ({
                    node: c.node ?? null, at: c.at ? vec3(c.at) : [0, 0, 0], r: c.r ?? 0.1,
                })),
                castShadow: spec.castShadow !== false,
            },
        });
    }

    // --------------------------------------------------------------- fluids
    for (const [id, spec] of Object.entries(film.fluids ?? {})) {
        scene.add({
            id, kind: 'fluid', parentId: spec.parent ?? undefined,
            props: {
                n: spec.n ?? 48, size: spec.size ? [spec.size[0], spec.size[1]] : [2, 2],
                at: vec3(spec.at ?? [0, 0, 0]),
                rot: vec3(spec.rot ?? [0, 0, 0]).map((d) => d * DEG),
                color: spec.color ?? '#d8d8dd', gain: spec.gain ?? 1, gamma: spec.gamma ?? 1,
                opacity: spec.opacity ?? 1, blending: spec.blending ?? null,
                visc: spec.visc ?? 0, diff: spec.diff ?? 0,
                dissipation: spec.dissipation ?? 0.4, buoyancy: spec.buoyancy ?? 1.6,
                gravityX: spec.gravityX ?? 0, iterations: spec.iterations ?? 12,
                sources: (spec.sources ?? []).map((src) => ({ ...src })),
            },
        }, spec.parent ?? undefined);
        if (!(spec.sources ?? []).length) warn(`fluid '${id}' has no sources`, `fluids.${id}`);
    }

    // ---------------------------------------------------------- constraints
    // Last, so every bone, target, cloth pin and prop a constraint can name
    // already exists -- which is also what makes the "is not a node" warning
    // worth printing rather than a false alarm about declaration order.
    for (const [i, spec] of (film.constraints ?? []).entries()) {
        constraintSpecs.push({ c: spec, where: `constraints[${i}]` });
    }
    const constraints = [];
    for (const { c, where } of constraintSpecs) {
        constraints.push(...normalizeConstraints([c], { warn, where, exists: (id) => !!scene.get(id) }));
    }

    // ------------------------------------------------------------- emitters
    const emitters = new Map();
    for (const [id, spec] of Object.entries(film.emitters ?? {})) {
        const emitter = createEmitter(spec);
        emitters.set(id, {
            id, emitter,
            geometry: { ...(spec.geometry ?? { kind: 'sphere', radius: 0.5 }) },
            material: resolveMaterial(spec.material, `emitters.${id}`),
            blending: spec.blending ?? 'additive',
            parent: spec.parent ?? null,
            span: emitterSpan(emitter),
        });
        if (!emitter.count) warn(`emitter '${id}' has no particles`, `emitters.${id}`);
    }

    // ------------------------------------------------------- shots in order
    const shots = [];
    let t = 0;
    for (const [si, sceneSpec] of (film.scenes ?? []).entries()) {
        const sceneId = sceneSpec.id ?? `s${si + 1}`;
        for (const [shi, shot] of (sceneSpec.shots ?? []).entries()) {
            const duration = shot.duration ?? DEFAULTS.shotDuration;
            shots.push({ sceneId, shotId: shot.id ?? `${sceneId}.${shi + 1}`,
                         start: t, end: t + duration, duration, shot });
            t += duration;
        }
    }
    const duration = t;
    timeline.duration = duration;
    if (!shots.length) warn('film has no shots', 'scenes');
    if (film.meta?.duration != null && Math.abs(film.meta.duration - duration) > 0.001) {
        warn(`declared duration ${film.meta.duration}s but shots total ${duration.toFixed(2)}s; `
             + 'duration is derived, so the declaration was ignored', 'meta.duration');
    }

    meta.transitions = normalizeTransitions(film, shots, warn, { duration });
    /**
     * `continue` is not drawn, so it is resolved here rather than in the
     * overlay: it eases the camera into the incoming framing BEFORE the cut,
     * so there is no join left to hide. Keyed by the boundary time.
     */
    const continueAt = new Map(meta.transitions
        .filter((tr) => tr.kind === 'continue')
        .map((tr) => [tr.at, tr]));

    // On twos per shot, same mechanism as 2D: the camera stays on ones.
    for (const s of shots) {
        if (s.shot.step != null) {
            (timeline.steps ??= []).push({ start: s.start, end: s.end, step: s.shot.step });
        }
    }

    // ------------------------------------------------------------- audio
    // Cues, not a mixer. The 2D path already owns the mixing, the buses and
    // the fades; 3D was silent only because nothing here emitted the cue
    // list it consumes.
    /**
     * A character names a voice from the film's `voices` block; that block
     * maps the name to a provider spec. Passing the NAME straight through as
     * if it were a spec is silent: the provider finds no such voice, falls
     * back to whatever is first in its list, and the presenter delivers an
     * English script in an Arabic voice without anything reporting a problem.
     */
    const resolveVoice = (ref, where) => {
        if (!ref) return null;
        const declared = film.voices?.[ref];
        if (declared) return declared.spec ?? declared;
        if (String(ref).includes(':')) return ref;      // already a provider spec
        warn(`unknown voice '${ref}'; declare it under \`voices\``, where);
        return null;
    };

    const audioCues = [];
    // Dialogue produces JOBS, not audio: synthesis needs a browser, and the
    // samples it returns are what lipsync reads. Identical in shape to the 2D
    // compiler's jobs, so `synthesizeDialogue` consumes them unchanged.
    const lipsyncJobs = [];
    const addCue = (spec, at, where) => {
        if (!spec?.asset) return warn('audio needs an `asset`', where);
        if (!film.assets?.[spec.asset]) warn(`unknown audio asset '${spec.asset}'`, where);
        audioCues.push(createCue({
            id: `${where}:${audioCues.length}`, assetId: spec.asset,
            at: +(at + (spec.at ?? 0)).toFixed(4),
            gain: spec.gain ?? 1, fadeIn: spec.fadeIn ?? 0, fadeOut: spec.fadeOut ?? 0,
            offset: spec.offset ?? 0, duration: spec.duration ?? null,
            bus: spec.bus ?? 'sfx',
        }));
    };
    for (const [i, spec] of (film.audio ?? []).entries()) addCue(spec, 0, `audio[${i}]`);

    let prevCamera = null;
    // What each keyable post channel ends the previous shot on, so the next
    // shot's `from` defaults to it. Same bargain as `prevCamera`.
    let prevPost = null;
    const clipSeq = { n: 0 };
    // What each face is currently holding, so the next expression knows which
    // shapes to release rather than leaving a brow raised for the whole film.
    const expressionHold = new Map();
    for (const s of shots) {
        prevCamera = buildCamera3D({ timeline, cameraId, lookId, shot: s.shot,
                                     start: s.start, duration: s.duration, prevCamera, warn,
                                     shotId: s.shotId,
                                     glide: continueAt.get(+s.start.toFixed(4)) ?? null });
        prevPost = buildPost3D({ timeline, shot: s.shot, start: s.start,
                                 duration: s.duration, prevPost, chain: meta.post,
                                 warn, shotId: s.shotId });
        for (const [ai, spec] of (s.shot.audio ?? []).entries()) {
            addCue(spec, s.start, `${s.shotId}.audio[${ai}]`);
        }
        for (const [di, line] of (s.shot.dialogue ?? []).entries()) {
            const who = characters.get(line.speaker);
            if (!who) { warn(`unknown speaker '${line.speaker}'`, `${s.shotId}.dialogue[${di}]`); continue; }
            lipsyncJobs.push({
                nodeId: line.speaker, speaker: line.speaker, text: line.text ?? null,
                at: +(s.start + (line.at ?? 0)).toFixed(4),
                voiceSpec: resolveVoice(line.voice ?? who.voice,
                                        `${s.shotId}.dialogue[${di}]`),
                audioAssetId: line.audio ?? null,
                lipsync: line.lipsync !== false,
                gain: line.gain ?? 1,
                durationSec: line.duration ?? null,
                subtitle: line.subtitle !== false,
                shotEnd: s.end,
            });
        }
        for (const [ai, action] of (s.shot.actions ?? []).entries()) {
            buildAction3D({ scene, timeline, action, castMap, emitters, shot: s,
                            cameraId, warn, clipSeq, audioCues, expressionHold,
                            location: `${s.shotId}.actions[${ai}]` });
        }
    }

    return { scene, timeline, emitters, meta, cameraId, lookId, shots, constraints,
             duration, audioCues, lipsyncJobs, characters, textures, faces, diagnostics };
}

/**
 * Camera as position keys plus a look target, continuous across cuts.
 *
 * `from` defaults to wherever the previous shot left the camera, so a dolly
 * that spans three shots is authored as three `to`s rather than six
 * hand-matched endpoints -- and a mismatched pair cannot produce the silent
 * jump that used to show up only in the rendered file.
 */
/**
 * Write a shot's post ramps as timeline channels.
 *
 * This is what makes a **rack focus** expressible. `buildComposer` builds the
 * chain once from `meta.post`, so before this every post number was a
 * constant for the life of the film, and pulling focus from one subject to
 * another -- the one camera move that most reads as photography -- could not
 * be said at all.
 *
 * Authored like the camera, because it is the same idea and a shot that pulls
 * focus while pushing in is describing one move:
 *
 *   { "shot": "s", "duration": 4,
 *     "focus": { "to": 6.1, "for": 1.6, "ease": "smooth" } }
 *
 * `focus` is sugar for `post.dof.focus`, since it is the overwhelmingly
 * common case. The general form reaches any keyable parameter:
 *
 *   "post": { "grade": { "exposure": { "to": 0.4, "for": 2 } },
 *             "bloom": { "strength": 1.4 } }
 *
 * Returns the values this shot ENDS on, so the next shot's `from` defaults to
 * them -- which is what makes a cut between two focus depths a cut, rather
 * than a ramp from a number nobody wrote.
 */
function buildPost3D({ timeline, shot, start, duration, prevPost, chain, warn, shotId }) {
    const rest = { ...(prevPost ?? {}) };
    // `focus` is sugar, and it loses to an explicit `post.dof.focus` rather
    // than silently fighting it.
    const authored = {};
    for (const [kind, spec] of Object.entries(shot.post ?? {})) {
        if (!POST_KEYABLE[kind]) { warn(`unknown post pass '${kind}'`, `${shotId}.post`); continue; }
        for (const [param, ramp] of Object.entries(spec ?? {})) {
            if (!isPostKeyable(kind, param)) {
                warn(`\`${kind}.${param}\` is not a keyable post parameter`
                     + ` (keyable: ${(POST_KEYABLE[kind] ?? []).join(', ') || 'none'})`,
                     `${shotId}.post.${kind}`);
                continue;
            }
            authored[postChannel(kind, param)] = ramp;
        }
    }
    if (shot.focus != null && authored['dof.focus'] == null) authored['dof.focus'] = shot.focus;

    const ended = { ...rest };
    for (const [channel, ramp] of Object.entries(authored)) {
        const [kind] = channel.split('.');
        // A pass that is not in the chain was never built, so a ramp on it
        // would be an author watching a number change and nothing happen.
        const pass = (chain ?? []).find((p) => p.kind === kind);
        if (!pass) {
            warn(`\`${channel}\` is keyed but there is no \`${kind}\` pass in`
                 + ' `meta.post`, so nothing would read it',
                 `${shotId}.post.${kind}`);
            continue;
        }
        const param = channel.slice(kind.length + 1);
        const base = rest[channel] ?? pass[param];
        const r = normalizePostRamp(ramp, {
            duration, base, path: `${shotId}.post.${channel}`, warn });
        if (!r) continue;

        key(timeline, POST_NODE, channel, start, r.from, { type: 'number', ease: r.ease });
        const moveEnd = start + r.span;
        if (r.span > 0) key(timeline, POST_NODE, channel, moveEnd, r.to, { type: 'number' });
        /**
         * Hold the arrival value to the end of the shot.
         *
         * The same defect the camera had and which `continue` exposed: a ramp
         * with `for: 1.6` in a 4s shot wrote its arrival key at t+1.6 and
         * nothing after it, so the track interpolated from there straight to
         * the next shot's key and the focus crept for the shot's remaining
         * 2.4 seconds. Written once there, deliberately, rather than
         * discovered again in a rendered file.
         */
        const shotEnd = start + duration;
        if (r.span > 0 && moveEnd < shotEnd - 1e-6) {
            key(timeline, POST_NODE, channel, shotEnd, r.to, { type: 'number' });
        }
        ended[channel] = r.to;
    }

    /**
     * A channel this shot does not mention holds, explicitly.
     *
     * Without a key here the track interpolates on from the last shot that
     * did mention it straight to the next one that does -- so a focus pull in
     * shot 2 and another in shot 5 would have shots 3 and 4 drifting between
     * them, which is the camera's old bug in a new channel.
     */
    for (const channel of Object.keys(rest)) {
        if (authored[channel] != null) continue;
        key(timeline, POST_NODE, channel, start, rest[channel], { type: 'number', ease: 'linear' });
    }
    return ended;
}

function buildCamera3D({ timeline, cameraId, lookId, shot, start, duration, prevCamera, warn,
                        shotId, glide = null }) {
    const cam = shot.camera;
    const rest = prevCamera ?? { at: [0, 1.2, 3.2], look: [0, 0, 0], fov: DEFAULTS.fov,
                                 moveEnd: start };
    if (!cam) {
        // No camera on this shot: hold the previous framing, explicitly, so
        // the track has a key here rather than drifting on from a far earlier
        // one when a later shot interpolates back.
        writeVec(timeline, cameraId, 'position', rest.at, start, null, 'linear');
        writeVec(timeline, lookId, 'position', rest.look, start, null, 'linear');
        if (glide) {
            warn('`continue` eases the camera into the INCOMING framing, and this shot '
                 + 'declares no camera, so there is nothing to ease towards. It holds the '
                 + 'previous framing, which is already continuous', `${shotId}.transition`);
        }
        return { ...rest, moveEnd: start };
    }
    const from = {
        at: vec3(cam.from?.at ?? rest.at), look: vec3(cam.from?.look ?? rest.look),
        fov: cam.from?.fov ?? rest.fov,
    };
    const to = {
        at: vec3(cam.to?.at ?? from.at), look: vec3(cam.to?.look ?? from.look),
        fov: cam.to?.fov ?? from.fov,
    };
    const ease = cam.ease ?? 'smooth';
    const span = Math.min(cam.for ?? duration, duration);
    // A cut is two camera positions at one instant, and a track cannot hold
    // two values at one time -- `key` replaces. Without this nudge the
    // incoming shot's `from` overwrote the outgoing shot's final key, and the
    // outgoing shot spent its whole duration drifting toward the NEXT shot's
    // camera instead of holding its own. The framing check caught it: the
    // rifle ended up behind the camera during its own firing shot.
    const CUT = 1e-4;
    /**
     * `continue`: tier 3, and usually the right answer.
     *
     * A hard cut is two camera positions at one instant. Rather than
     * dissolving over it, write a key holding the OUTGOING framing `d`
     * seconds before the boundary and let the camera ease from there into
     * this shot's `from`, which it reaches exactly at the cut. The join
     * stops existing: one camera, ordinary keys, no second render, no pass.
     *
     * It needs `d` seconds in which the outgoing camera is at rest, so the
     * glide cannot overwrite the tail of the previous shot's own move --
     * which would snap the camera back to an earlier key and read as a
     * glitch, not a move. `moveEnd` is threaded through `prevCamera` for
     * exactly this, and the clamp is reported rather than silent.
     */
    let glideFrom = null;
    if (glide && prevCamera) {
        const room = start - (prevCamera.moveEnd ?? start);
        const d = Math.min(glide.duration, Math.max(0, room));
        if (d < 1 / 48) {
            warn(`\`continue\` needs a moment in which the previous camera is still, and `
                 + `the previous shot's own move runs to ${(prevCamera.moveEnd ?? start).toFixed(2)}s, `
                 + `${(start).toFixed(2)}s being the cut. Rendered as a hard cut`,
                 `${shotId}.transition`);
        } else {
            if (d < glide.duration) {
                warn(`\`continue\` was ${glide.duration}s but only ${d.toFixed(2)}s of the `
                     + 'previous shot is still; shortened', `${shotId}.transition`);
            }
            glideFrom = start - d;
        }
    } else if (glide && !prevCamera) {
        warn('`continue` on the first shot has no previous framing to continue from; '
             + 'rendered as a hard cut', `${shotId}.transition`);
    }
    if (glideFrom != null) {
        // The hold key carries the ease, so the segment LEAVING it is the
        // glide. Written before the `from` key below, which lands at `start`
        // with no cut nudge -- there is no collision to nudge around, because
        // the outgoing value now has a key of its own earlier in the shot.
        writeVec(timeline, cameraId, 'position', rest.at, glideFrom, null, 'smooth');
        writeVec(timeline, lookId, 'position', rest.look, glideFrom, null, 'smooth');
        key(timeline, cameraId, 'fov', glideFrom, rest.fov, { type: 'number', ease: 'smooth' });
    }
    const moveStart = start + (cam.at ?? 0)
        + (prevCamera && (cam.at ?? 0) === 0 && glideFrom == null ? CUT : 0);
    // The arrival key is measured from the shot's OWN start, not from the
    // nudged one. Carrying the nudge into the end key put it at
    // next_start + CUT -- exactly where the next shot's nudged `from` lands --
    // so the two collided again and the outgoing shot spent its whole
    // duration drifting into the next shot's framing. A close-up aimed at a
    // face rendered as eight seconds of empty backdrop.
    const moveEnd = start + (cam.at ?? 0) + span;

    writeVec(timeline, cameraId, 'position', from.at, moveStart, null, ease);
    writeVec(timeline, lookId, 'position', from.look, moveStart, null, ease);
    key(timeline, cameraId, 'fov', moveStart, from.fov, { type: 'number', ease });
    if (span > 0) {
        writeVec(timeline, cameraId, 'position', to.at, moveEnd, null, 'linear');
        writeVec(timeline, lookId, 'position', to.look, moveEnd, null, 'linear');
        key(timeline, cameraId, 'fov', moveEnd, to.fov, { type: 'number' });
    }
    /**
     * Hold the arrival framing to the end of the shot.
     *
     * Found while building `continue`, which needs the outgoing camera to be
     * at rest before the cut -- and discovered that it never was. A shot with
     * `for: 2` and a duration of 3 wrote its arrival key at t+2 and nothing
     * after it, so the track interpolated from there straight to the NEXT
     * shot's `from` key: the camera spent the shot's final second drifting
     * into the next shot's framing, and the authored hold did not exist.
     *
     * Not the same defect as the `CUT` nudge above, which stops two keys
     * colliding at one instant. This is the missing key at the shot's own
     * end. Both have the same symptom -- a camera that will not stay put --
     * which is presumably why fixing one looked like fixing both.
     *
     * No shipped 3D film in this repo declares `for` shorter than its shot,
     * so nothing re-renders differently; the authored form simply starts
     * meaning what it says.
     */
    const shotEnd = start + duration;
    if (span > 0 && moveEnd < shotEnd - 1e-6) {
        writeVec(timeline, cameraId, 'position', to.at, shotEnd, null, 'linear');
        writeVec(timeline, lookId, 'position', to.look, shotEnd, null, 'linear');
        key(timeline, cameraId, 'fov', shotEnd, to.fov, { type: 'number' });
    }
    if (cam.shake) {
        buildShake3D({ timeline, cameraId, shake: cam.shake, start: moveStart,
                       duration, centre: to.at });
    }
    if (span < (cam.for ?? 0)) warn(`camera move is longer than the shot`, shotId);
    // `moveEnd` is what the NEXT boundary needs to know before it can glide:
    // the instant after which this camera is at rest.
    return { ...to, moveEnd: span > 0 ? moveEnd : moveStart };
}

/**
 * A decaying positional rattle written as an offset around the pan, so the
 * move underneath survives. Deterministic: a fixed sine pair, not a PRNG.
 */
function buildShake3D({ timeline, cameraId, shake, start, duration, centre }) {
    const amp = shake.amount ?? 0.04;
    const freq = shake.frequency ?? 22;
    const span = Math.min(shake.for ?? 0.5, duration);
    const steps = Math.max(2, Math.ceil(span * freq));
    const at = start + (shake.at ?? 0);
    for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const decay = (1 - u) ** 2;
        const t = at + u * span;
        // Coprime multipliers so x and y do not trace a line.
        key(timeline, cameraId, 'position.x',
            t, centre[0] + Math.sin(u * freq * 6.28) * amp * decay, { type: 'number', ease: 'linear' });
        key(timeline, cameraId, 'position.y',
            t, centre[1] + Math.cos(u * freq * 9.42) * amp * decay, { type: 'number', ease: 'linear' });
    }
}

function writeVec(timeline, target, group, value, at, span, ease, opts = {}) {
    for (const [i, axis] of AXES.entries()) {
        writeScalar(timeline, target, `${group}.${axis}`, value[i], at, span, ease,
                    { ...opts, from: opts.from?.[i] });
    }
}

/**
 * The node's authored value for a channel group, used to seed a transition
 * that has nothing keyed before it.
 *
 * Without this a first `grow` writes a single key at its END time, and
 * because a track reads as its first key at every EARLIER time, the thing
 * being grown is already full size from frame one. Fourteen bullet craters
 * were in the wall before a shot was fired. The 2D compiler needed the same
 * fix and calls it `seedChannel`.
 */
const REST = { position: 'at', rotation: 'rot', scale: 'scale' };
/**
 * What a channel reads as when the node does not carry it.
 *
 * Not `null`. A bone node carries `at` and nothing else -- its rest ROTATION
 * is identity, because a bone's rest pose IS the bind pose -- so `turn
 * host/foreR to [-96, 0, 0]` found no value to start from, wrote a single key
 * at its END time, and a track reads as its first key at every earlier time.
 * The forearm was therefore bent to 96 degrees from frame one, three shots
 * before the action that bends it. It is the same trap `fly` and `set`
 * already guard against, and the 2D compiler calls `seedChannel`.
 */
const REST_DEFAULT = { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
function restVec(node, group) {
    if (!node) return null;
    const v = node.props?.[REST[group]];
    if (v == null) return REST_DEFAULT[group];
    return Array.isArray(v) ? v : [v, v, v];
}

/**
 * One scalar channel, with anticipation and follow-through available to every
 * verb that routes through it -- which is all of them.
 */
function writeScalar(timeline, target, path, value, at, span, ease = 'smooth',
                     { anticipate = 0, overshoot = 0, from } = {}) {
    if (value == null) return;
    if (span == null || span <= 0) {
        key(timeline, target, path, at, value, { type: 'number', ease });
        return;
    }
    // A previously keyed value wins: a second `move` starts where the first
    // one left the part, not back at its rest pose. `from` is only the
    // fallback for a channel nothing has touched yet.
    const prev = lastValueBefore3D(timeline, target, path, at) ?? from;
    if (prev != null) key(timeline, target, path, at, prev, { type: 'number', ease });
    if (prev != null && anticipate) {
        key(timeline, target, path, at + span * ANTICIPATION_SHARE,
            anticipationValue(prev, value, anticipate), { type: 'number', ease: 'smooth' });
    }
    if (prev != null && overshoot) {
        key(timeline, target, path, at + span * OVERSHOOT_AT,
            overshootValue(prev, value, overshoot), { type: 'number', ease: 'smooth' });
    }
    key(timeline, target, path, at + span, value, { type: 'number' });
}

function lastValueBefore3D(timeline, target, path, t) {
    const track = timeline._index?.get(`${target}\u0000${path}`);
    if (!track) return undefined;
    let found;
    for (const k of track.keys) { if (k.t <= t) found = k.v; else break; }
    return found;
}

function buildAction3D({ scene, timeline, action, castMap, emitters, shot, cameraId,
                        warn, clipSeq, audioCues, expressionHold, location }) {
    const at = shot.start + (action.at ?? 0);
    const span = action.for ?? 0;
    const ease = action.ease ?? 'smooth';
    const opts = { anticipate: action.anticipate ?? 0, overshoot: action.overshoot ?? 0 };

    // A target is either a cast root ('gun') or one of its parts
    // ('gun/barrel'); both resolve to a node id the same way.
    const resolve = (ref) => {
        if (!ref) return null;
        const slash = String(ref).indexOf('/');
        if (slash < 0) return castMap.get(ref)?.rootId ?? (scene.get(ref) ? ref : null);
        const cast = castMap.get(String(ref).slice(0, slash));
        return cast?.parts.get(String(ref).slice(slash + 1)) ?? null;
    };

    switch (action.do) {
        /**
         * Offset a node from its authored rest pose.
         *
         * `move` writes an ABSOLUTE position, which is right for a prop and
         * catastrophic for a bone: a weight shift written as
         * `move hips to [0.02, 0, 0]` does not shift the hips 20 mm sideways,
         * it moves them to the floor and takes the whole skeleton with them.
         * The head ended up at knee height and the close-up framed an empty
         * backdrop. `nudge` is the verb that means what an animator means.
         */
        case 'nudge': {
            const id = resolve(action.target);
            if (!id) return warn(`unknown target '${action.target}'`, location);
            const group = action.channel === 'rotation' ? 'rotation'
                : action.channel === 'scale' ? 'scale' : 'position';
            const rest = restVec(scene.get(id), group) ?? (group === 'scale' ? [1, 1, 1] : [0, 0, 0]);
            const by = group === 'rotation' ? vec3(action.by).map((d) => d * DEG) : vec3(action.by);
            const to = rest.map((v, i) => (group === 'scale' ? v * (by[i] || 1) : v + by[i]));
            writeVec(timeline, id, group, to, at, span, ease, { ...opts, from: rest });
            return;
        }

        case 'move':
        case 'turn':
        case 'grow': {
            const id = resolve(action.target);
            if (!id) return warn(`unknown target '${action.target}'`, location);
            const group = action.do === 'move' ? 'position'
                : action.do === 'turn' ? 'rotation' : 'scale';
            const to = action.do === 'turn' ? vec3(action.to).map((d) => d * DEG)
                : action.do === 'grow' ? vec3(action.to ?? 1, 1)
                : vec3(action.to);
            writeVec(timeline, id, group, to, at, span, ease,
                     { ...opts, from: action.from ? vec3(action.from) : restVec(scene.get(id), group) });
            return;
        }

        /**
         * The assembly verb: a part starts displaced and arrives at the pose
         * it was authored with.
         *
         * This is why a declarative 3D script was worth writing. The gun is
         * modelled once, at its real dimensions, in its assembled position.
         * An assembly animation then says only "this part comes in from over
         * there", and the destination is the part's own rest pose rather than
         * a second copy of the same coordinates -- so moving a component in
         * the model does not silently desync the animation that lands it.
         */
        case 'fly': {
            const id = resolve(action.target);
            if (!id) return warn(`unknown target '${action.target}'`, location);
            const node = scene.get(id);
            const rest = node.props.at ?? [0, 0, 0];
            const restRot = node.props.rot ?? [0, 0, 0];
            const offset = vec3(action.from ?? [0, 0, 0]);
            const fromRot = action.fromRot ? vec3(action.fromRot).map((d) => d * DEG) : null;
            const absolute = action.absolute === true;
            const origin = absolute ? offset : rest.map((v, i) => v + offset[i]);

            // The part waits at its start pose from frame one. A track reads
            // as its first key at every earlier time, so one key at `at` is
            // all that is needed -- and an exploded array of parts hanging in
            // space before they assemble is the shot, not an accident.
            for (const [i, axis] of AXES.entries()) {
                key(timeline, id, `position.${axis}`, at, origin[i], { type: 'number', ease });
                key(timeline, id, `position.${axis}`, at + (span || 0.6), rest[i],
                    { type: 'number', ease: 'linear' });
            }
            if (fromRot) {
                for (const [i, axis] of AXES.entries()) {
                    key(timeline, id, `rotation.${axis}`, at, fromRot[i], { type: 'number', ease });
                    key(timeline, id, `rotation.${axis}`, at + (span || 0.6), restRot[i],
                        { type: 'number', ease: 'linear' });
                }
            }
            if (opts.overshoot) {
                // Settle past the seat and back, which is what reads as a
                // part snapping home rather than easing to a stop.
                for (const [i, axis] of AXES.entries()) {
                    const v = overshootValue(origin[i], rest[i], opts.overshoot);
                    key(timeline, id, `position.${axis}`, at + (span || 0.6) * OVERSHOOT_AT, v,
                        { type: 'number', ease: 'smooth' });
                }
            }
            return;
        }

        /**
         * `spin` -- continuous rotation in whole TURNS about one axis.
         *
         * 2D has had this since Phase 34 and `compile3d` has its own action
         * switch, so [STATUS](../../../docs/STATUS.md) has carried
         * "`squash`/`spin` in 3D -- 2D only" as an open row ever since. It is
         * the verb a rotating planet, a flywheel or a drill wants, and
         * writing it as two `turn` keys needs the author to convert turns to
         * radians AND to remember that the easing must be `linear` -- a
         * `smooth` ramp puts a hesitation at each end, which on a continuous
         * rotation reads as a stutter rather than as motion.
         *
         * It is also the verb that cannot be faked by looping a clip: a
         * rotation of 2.5 turns over eleven seconds is not a cycle.
         */
        case 'spin': {
            const id = resolve(action.target);
            if (!id) return warn(`unknown target '${action.target}'`, location);
            const axis = (action.axis ?? 'y').toLowerCase();
            if (!AXES.includes(axis)) {
                return warn(`spin wants axis x, y or z; got '${action.axis}'`, location);
            }
            const dur = span || 1;
            const channel = `rotation.${axis}`;
            const from = restVec(scene.get(id), 'rotation')?.[AXES.indexOf(axis)] ?? 0;
            // Both ends keyed explicitly and linearly. Only the start key
            // being seeded would leave the track reading its first key at
            // every earlier time, which for a spin starting at second 30 is
            // a planet already turned a quarter way round in shot one.
            key(timeline, id, channel, at, from, { type: 'number', ease: 'linear' });
            key(timeline, id, channel, at + dur, from + (action.turns ?? 1) * Math.PI * 2,
                { type: 'number', ease: 'linear' });
            return;
        }

        /**
         * `squash` -- volume-preserving deformation and recovery, in one verb.
         *
         * Wide by `amount`, flat by the same factor, back to rest. The
         * reciprocal is the point: scaling one axis up and the other down by
         * the SAME number changes the volume, and a ball that gains mass on
         * impact is the single clearest tell of hand-typed squash.
         *
         * `axis` is the axis of compression, so an impact on the floor is
         * `axis: 'y'` and the other two widen.
         */
        case 'squash': {
            const id = resolve(action.target);
            if (!id) return warn(`unknown target '${action.target}'`, location);
            const axis = (action.axis ?? 'y').toLowerCase();
            if (!AXES.includes(axis)) {
                return warn(`squash wants axis x, y or z; got '${action.axis}'`, location);
            }
            const amount = action.amount ?? 0.2;
            const hit = span || 0.1;
            const back = action.back ?? hit * 2.2;
            const rest = restVec(scene.get(id), 'scale') ?? [1, 1, 1];
            // sqrt on the two widening axes, so the product of the three
            // scales is unchanged: (1+a) along one and 1/sqrt(1+a) along the
            // other two multiply back to 1.
            const flat = 1 / (1 + amount);
            const wide = Math.sqrt(1 + amount);
            for (const [i, ax] of AXES.entries()) {
                const f = ax === axis ? flat : wide;
                const ch = `scale.${ax}`;
                key(timeline, id, ch, at, rest[i], { type: 'number', ease: 'smooth' });
                key(timeline, id, ch, at + hit, rest[i] * f, { type: 'number', ease: 'smooth' });
                key(timeline, id, ch, at + hit + back, rest[i], { type: 'number', ease: 'smooth' });
            }
            return;
        }

        /**
         * `cut` -- animate a named clipping plane's distance.
         *
         * The verb that makes a cutaway a *shot* rather than a state. A
         * section that is simply open shows you the inside; a section that
         * sweeps in shows you the relationship between the inside and the
         * outside, which is the entire pedagogical content of a cutaway.
         *
         * The plane is a scene node (`__clip:<name>`) with one scalar
         * channel, so it eases, anticipates and overshoots like anything
         * else rather than needing its own interpolation.
         */
        case 'cut': {
            const id = `__clip:${action.plane ?? 'clip0'}`;
            if (!scene.get(id)) {
                return warn(`unknown clip plane '${action.plane}'; `
                    + 'declare it under `meta.clip` with a `name`', location);
            }
            // `position.x`, not a channel of its own: `PoseApplier` already
            // understands scalar transform channels, and a plane's distance
            // is one number. A new target type would mean teaching the poser,
            // the evaluator and the budget estimator about clip planes to
            // animate a float they can all already animate.
            writeScalar(timeline, id, 'position.x', action.to ?? 0, at, span, ease,
                        { ...opts, from: action.from
                            ?? restVec(scene.get(id), 'position')?.[0] });
            return;
        }

        case 'set': {
            const id = resolve(action.target);
            if (!id) return warn(`unknown target '${action.target}'`, location);
            if (!action.channel) return warn('`set` needs a channel', location);
            const type = typeof action.value === 'number' ? 'number' : 'discrete';
            // Hold the prior value until this instant, or a single `set` late
            // in the film rewrites every frame before it -- the exact trap the
            // 2D compiler had to grow `seedChannel` for.
            if (!timeline._index?.get(`${id}\u0000${action.channel}`) && at > 0) {
                const prior = action.from ?? priorValue(scene.get(id), action.channel);
                if (prior !== undefined) {
                    key(timeline, id, action.channel, 0, prior, { type, ease: 'step' });
                }
            }
            if (type === 'number' && span > 0) {
                writeScalar(timeline, id, action.channel, action.value, at, span, ease);
            } else {
                key(timeline, id, action.channel, at, action.value, { type, ease: 'step' });
            }
            return;
        }

        /**
         * An expression: one named set of blendshape weights.
         *
         * Production facial rigs give each system its own subset of shapes --
         * the emotion layer owns brows and cheeks, lipsync owns the mouth --
         * so the two never write the same channel and cannot fight. `express`
         * writes only what its expression names, and clears what the previous
         * expression set and this one does not.
         */
        case 'express': {
            const cast = castMap.get(action.target);
            const faceId = cast?.parts?.get('face');
            if (!faceId) return warn(`'${action.target}' has no face to express with`, location);
            const shape = EXPRESSIONS[action.expression];
            if (!shape) {
                return warn(`unknown expression '${action.expression}'. `
                    + `Known: ${Object.keys(EXPRESSIONS).join(', ')}.`, location);
            }
            const amount = action.amount ?? 1;
            const span = action.for ?? 0.4;
            const held = expressionHold.get(faceId) ?? new Set();
            const next = new Set(Object.keys(shape));
            for (const name of held) {
                if (!next.has(name)) writeScalar(timeline, faceId, `morph.${name}`, 0, at, span, ease);
            }
            for (const [name, w] of Object.entries(shape)) {
                writeScalar(timeline, faceId, `morph.${name}`, w * amount, at, span, ease,
                            { from: 0 });
            }
            expressionHold.set(faceId, next);
            return;
        }

        /**
         * A named hand pose: `grip host/handR to fist`.
         *
         * Fifteen bones per hand, and three channels on the first joint of
         * each digit, is forty-five numbers an author would otherwise type
         * per hand per gesture. The table lives in `core/art/hands.js` and
         * the 2D compiler reads the same one, so `fist` means the same shape
         * on both paths.
         *
         * Routed through `writeScalar` like every other verb, so easing,
         * anticipation and overshoot come free -- and a hand that overshoots
         * closing is most of what makes a grab read as a grab.
         */
        case 'grip': {
            const ref = String(action.target ?? '');
            const slash = ref.indexOf('/');
            const as = slash < 0 ? ref : ref.slice(0, slash);
            const hand = slash < 0 ? '' : ref.slice(slash + 1);
            const side = hand.slice(-1);
            if (!castMap.get(as)?.character || !/^hand[LR]$/.test(hand)) {
                return warn(`grip wants a character's hand bone, like `
                    + `'<character>/handL'; got '${action.target}'`, location);
            }
            const angles = gripAngles(action.pose, action.amount ?? 1);
            if (!angles) {
                return warn(`unknown hand pose '${action.pose}'. `
                    + `Known: ${HAND_POSE_NAMES.join(', ')}.`, location);
            }
            // Mirrored: a rotation about y or z flips sign across the body's
            // plane of symmetry and a rotation about x does not, which is why
            // curl is signless and splay and lift are not.
            const m = side === 'L' ? 1 : -1;
            const gripSpan = action.for ?? 0.3;
            for (const digit of DIGIT_IDS) {
                const a = angles[digit];
                for (let j = 0; j < 3; j++) {
                    const bone = `${as}/${digit}${side}${j + 1}`;
                    writeScalar(timeline, bone, 'rotation.x', a.curl[j], at, gripSpan, ease,
                                { ...opts, from: 0 });
                    if (j > 0) continue;
                    // A finger fans at the knuckle and nowhere else, and only
                    // the thumb leaves the plane of the palm.
                    writeScalar(timeline, bone, 'rotation.z', m * a.splay, at, gripSpan, ease,
                                { from: 0 });
                    writeScalar(timeline, bone, 'rotation.y', m * a.lift, at, gripSpan, ease,
                                { from: 0 });
                }
            }
            return;
        }

        case 'sound': {
            audioCues.push(createCue({
                id: `${location}:sfx`, assetId: action.asset,
                at: +at.toFixed(4), gain: action.gain ?? 1,
                fadeIn: action.fadeIn ?? 0, fadeOut: action.fadeOut ?? 0,
                offset: action.offset ?? 0, bus: action.bus ?? 'sfx',
            }));
            return;
        }

        case 'burst': {
            const emitter = emitters.get(action.emitter);
            if (!emitter) return warn(`unknown emitter '${action.emitter}'`, location);
            // Burst times are absolute on the timeline, so an emitter
            // declared once can fire in several shots. The first `burst` to
            // claim an emitter replaces its declared times; later ones add to
            // them. Filtering out zero instead would silently discard a time
            // an author meant, which is the kind of bug that only shows up as
            // a missing flash in the rendered file.
            if (!emitter.claimed) { emitter.emitter.at = []; emitter.claimed = true; }
            emitter.emitter.at = [...new Set([...emitter.emitter.at, at])].sort((a, b) => a - b);
            emitter.span = emitterSpan(emitter.emitter);
            if (action.origin) emitter.emitter.origin = vec3(action.origin);
            return;
        }

        case 'play': {
            const cast = castMap.get(action.target);
            if (!cast) return warn(`unknown cast '${action.target}'`, location);

            /**
             * An imported model plays the animations that came IN the file.
             *
             * A downloaded character arrives with its clips -- Mixamo names
             * them, Blender exports them -- and the page has already turned
             * them into core clips by the time this runs. So `play` looks
             * there first, and a name that is not in the file is reported
             * WITH the names that are, because the one thing a caller cannot
             * do is guess what a stranger called their walk cycle.
             */
            if (cast.model) {
                const clip = cast.clips.find((c) => c.name === action.action);
                if (!clip) {
                    return warn(`model '${cast.model}' has no animation `
                        + `'${action.action}'. ${cast.clips.length
                            ? `Known: ${cast.clips.map((c) => c.name).join(', ')}.`
                            : 'The file declares none.'}`, location);
                }
                const clipId = `${action.target}.${action.action}.${clipSeq.n++}`;
                addClip(timeline, { ...clip, id: clipId,
                                    loop: action.loop ?? clip.loop ?? 'repeat' });
                addInstance(timeline, {
                    clipId, scopeId: cast.rootId, start: at,
                    end: at + (action.for ?? clip.duration ?? (shot.end - at)),
                    speed: action.speed ?? 1, weight: action.weight ?? 1,
                });
                return;
            }

            const spec = cast.assembly.actions?.[action.action];
            if (!spec) return warn(`unknown action '${action.action}'`, location);
            const clipId = `${action.target}.${action.action}.${clipSeq.n++}`;
            addClip(timeline, buildClip3D(clipId, action.action, spec));
            addInstance(timeline, {
                clipId, scopeId: cast.rootId, start: at,
                end: at + (action.for ?? shot.end - at),
                speed: action.speed ?? 1, weight: action.weight ?? 1,
            });
            return;
        }

        default:
            warn(`unknown verb '${action.do}'`, location);
    }
}

const priorValue = (node, channel) => {
    if (!node) return undefined;
    if (channel === 'visible') return node.visible !== false;
    if (channel.startsWith('material.')) return node.props?.material?.[channel.slice(9)];
    return undefined;
};

/** A reusable 3D cycle: same shape as the 2D action, scalar channels. */
function buildClip3D(clipId, name, spec) {
    const tracks = [];
    for (const [channelPath, keys] of Object.entries(spec.keys ?? {})) {
        const dot = channelPath.indexOf('.');
        if (dot < 0) continue;
        const track = createTrack({
            target: channelPath.slice(0, dot),
            path: channelPath.slice(dot + 1),
            type: 'number',
        });
        for (const entry of keys) {
            const [t, v, ease, h] = Array.isArray(entry) ? entry : [entry.t, entry.v, entry.ease, entry.h];
            setKey(track, t, v, ease ?? 'smooth', h);
        }
        tracks.push(track);
    }
    return createClip({ id: clipId, name, duration: spec.duration,
                        loop: spec.loop ?? 'repeat', tracks,
                        blend: spec.blend ?? 'override', mask: spec.mask ?? null });
}
