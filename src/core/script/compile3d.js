import { Scene } from '../scene/Scene.js';
import { createTimeline, key, addClip, addInstance } from '../anim/Timeline.js';
import { createClip } from '../anim/Clip.js';
import { createTrack, setKey } from '../anim/Track.js';
import { createEmitter, emitterSpan } from '../anim/particles.js';
import { createCue } from '../audio/cues.js';
import { HUMANOID_BONES } from '../art/humanoid3d.js';
import { EXPRESSIONS } from '../art/face3d.js';
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

export function compileFilm3D(film = {}, { assets = {} } = {}) {
    const diagnostics = [];
    const warn = (message, location) => diagnostics.push({ severity: 'warning', message, location });

    const meta = {
        title: film.meta?.title ?? 'untitled',
        fps: film.meta?.fps ?? DEFAULTS.fps,
        width: film.meta?.width ?? DEFAULTS.width,
        height: film.meta?.height ?? DEFAULTS.height,
        background: film.meta?.background ?? '#0b0b0d',
        environment: film.meta?.environment ?? null,
        bloom: film.meta?.bloom ?? null,
        step: film.meta?.step ?? 0,
    };

    const scene = new Scene();
    const timeline = createTimeline({ fps: meta.fps });
    if (meta.step) timeline.step = meta.step;

    const materials = film.materials ?? {};
    const resolveMaterial = (ref, path) => {
        if (!ref) return { color: '#9aa0a6' };
        if (typeof ref === 'object') return { ...ref };
        if (materials[ref]) return { ...materials[ref] };
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

    // ----------------------------------------------------------------- cast
    const castMap = new Map();
    const characters = new Map();
    for (const entry of film.cast ?? []) {
        const as = entry.as ?? entry.character ?? entry.assembly;

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
            scene.add({
                id: nodeId, kind: 'mesh', parentId,
                props: {
                    geometry: { ...(part.geometry ?? { kind: 'cube' }) },
                    material: resolveMaterial(part.material, nodeId),
                    at: vec3(part.at ?? [0, 0, 0]),
                    rot: vec3(part.rot ?? [0, 0, 0]).map((d) => d * DEG),
                    scale: vec3(part.scale ?? 1, 1),
                    blending: part.blending ?? null,
                },
            }, parentId);
            parts.set(part.id, nodeId);
        }
        castMap.set(as, { rootId, parts, assembly });
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
    const clipSeq = { n: 0 };
    // What each face is currently holding, so the next expression knows which
    // shapes to release rather than leaving a brow raised for the whole film.
    const expressionHold = new Map();
    for (const s of shots) {
        prevCamera = buildCamera3D({ timeline, cameraId, lookId, shot: s.shot,
                                     start: s.start, duration: s.duration, prevCamera, warn,
                                     shotId: s.shotId });
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

    return { scene, timeline, emitters, meta, cameraId, lookId, shots,
             duration, audioCues, lipsyncJobs, characters, diagnostics };
}

/**
 * Camera as position keys plus a look target, continuous across cuts.
 *
 * `from` defaults to wherever the previous shot left the camera, so a dolly
 * that spans three shots is authored as three `to`s rather than six
 * hand-matched endpoints -- and a mismatched pair cannot produce the silent
 * jump that used to show up only in the rendered file.
 */
function buildCamera3D({ timeline, cameraId, lookId, shot, start, duration, prevCamera, warn, shotId }) {
    const cam = shot.camera;
    const rest = prevCamera ?? { at: [0, 1.2, 3.2], look: [0, 0, 0], fov: DEFAULTS.fov };
    if (!cam) {
        // No camera on this shot: hold the previous framing, explicitly, so
        // the track has a key here rather than drifting on from a far earlier
        // one when a later shot interpolates back.
        writeVec(timeline, cameraId, 'position', rest.at, start, null, 'linear');
        writeVec(timeline, lookId, 'position', rest.look, start, null, 'linear');
        return rest;
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
    const moveStart = start + (cam.at ?? 0) + (prevCamera && (cam.at ?? 0) === 0 ? CUT : 0);
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
    if (cam.shake) {
        buildShake3D({ timeline, cameraId, shake: cam.shake, start: moveStart,
                       duration, centre: to.at });
    }
    if (span < (cam.for ?? 0)) warn(`camera move is longer than the shot`, shotId);
    return to;
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
function restVec(node, group) {
    const v = node?.props?.[REST[group]];
    if (v == null) return null;
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
