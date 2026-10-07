import { Scene } from '../scene/Scene.js';
import { createTimeline, key, addClip, addInstance } from '../anim/Timeline.js';
import { createClip } from '../anim/Clip.js';
import { createTrack, setKey } from '../anim/Track.js';
import { createCue } from '../audio/cues.js';
import { DEFAULTS, FILM_VERSION } from './schema.js';

/** Epsilon for a hard on/off alpha step at a cut. */
const EPS = 1e-4;
import { validateFilm } from './validate.js';
import { castVoices } from '../voice/synthesize.js';
import { generateCharacterParts, generateMouth, generateActions } from './generate.js';
import { solveChain, chainFromParts, chainRootOffset } from '../rig/IK2D.js';
import { groundAt, measureCharacter } from './staging.js';

/**
 * compileFilm: declarative film -> core Scene + Timeline + audio cues +
 * lipsync jobs + diagnostics.
 *
 * Pure and deterministic: no clock, no randomness, no DOM. That makes this
 * the highest-value unit-test target in the project -- derived duration, key
 * times, shot-offset arithmetic and camera continuity are all assertable in
 * Node without a browser.
 *
 * Structural choices worth knowing:
 *   - every scene becomes a group node whose `props.alpha` is animated, so
 *     crossfades are ordinary core tracks. Transitions therefore appear in
 *     every export, unlike the CSS overlays they replace.
 *   - one camera node for the whole film, animated. Only one camera renders
 *     at a time, so a second camera object would buy nothing.
 *   - cast part trees are instantiated as `<as>/<partId>` nodes. The part
 *     tree IS the cutout rig: parent/child transforms, no skin weights.
 */
export function compileFilm(film, { assets = {} } = {}) {
    const diagnostics = validateFilm(film);
    if (diagnostics.some((d) => d.severity === 'fatal')) {
        return { scene: null, timeline: null, audioCues: [], lipsyncJobs: [], diagnostics, meta: null };
    }

    const meta = {
        title: film.meta?.title ?? 'Untitled',
        fps: film.meta?.fps ?? DEFAULTS.fps,
        width: film.meta?.width ?? DEFAULTS.width,
        height: film.meta?.height ?? DEFAULTS.height,
        version: FILM_VERSION,
    };

    const scene = new Scene();
    const timeline = createTimeline({ fps: meta.fps });
    const audioCues = [];
    const lipsyncJobs = [];

    const { castBySpeaker, diagnostics: voiceDiag } = castVoices(film);
    diagnostics.push(...voiceDiag);

    // --- camera: starts at frame centre so authored coordinates read as
    // screen coordinates, which is what an author (and an LLM) expects.
    const cameraId = '__camera';
    scene.add({
        id: cameraId, kind: 'camera',
        transform: { x: meta.width / 2, y: meta.height / 2 },
        props: { zoom: 1 },
    });

    const palettes = film.palettes ?? {};
    const characters = film.characters ?? {};

    // --- scenes and shots: time resolves by accumulation, never by the author
    const sceneSpans = planScenes(film);
    let filmTime = 0;

    for (const [si, span] of sceneSpans.entries()) {
        const { sceneId, sceneStart, sceneEnd, spec: sceneSpec, fadeIn, fadeOut } = span;
        const shots = sceneSpec.shots ?? [];

        const groupId = `scene/${sceneId}`;
        scene.add({ id: groupId, kind: 'group', props: { alpha: 1 }, z: si });

        // Scene visibility. A scene is hidden until it starts and hidden
        // again once it ends, so only the active scene occupies the frame.
        // Where a crossfade governs a boundary it owns the ramp instead, and
        // the hard on/off keys are suppressed -- otherwise the step key would
        // overwrite the fade and the transition would snap.
        if (fadeIn) {
            key(timeline, groupId, 'props.alpha', sceneStart - fadeIn, 0, { type: 'number' });
            key(timeline, groupId, 'props.alpha', sceneStart, 1, { type: 'number' });
        } else {
            if (sceneStart > 0) {
                key(timeline, groupId, 'props.alpha', sceneStart - EPS, 0, { type: 'number', ease: 'step' });
            }
            key(timeline, groupId, 'props.alpha', sceneStart, 1, { type: 'number' });
        }
        if (fadeOut) {
            key(timeline, groupId, 'props.alpha', sceneEnd - fadeOut, 1, { type: 'number' });
            key(timeline, groupId, 'props.alpha', sceneEnd, 0, { type: 'number' });
        } else if (si < sceneSpans.length - 1) {
            key(timeline, groupId, 'props.alpha', sceneEnd - EPS, 1, { type: 'number', ease: 'step' });
            key(timeline, groupId, 'props.alpha', sceneEnd, 0, { type: 'number', ease: 'step' });
        }

        buildBackground(scene, timeline, sceneSpec, groupId, meta, assets, diagnostics);
        buildScenery(scene, sceneSpec, groupId, palettes, meta, assets, diagnostics);

        // --- cast: instantiate each character's part tree
        const castMap = new Map();
        for (const entry of sceneSpec.cast ?? []) {
            const charName = entry.character;
            const char = characters[charName];
            if (!char) continue;
            const as = entry.as ?? charName;
            const rootId = `${sceneId}/${as}`;
            instantiateCharacter({
                scene, char, charName, as, rootId, parentId: groupId,
                entry, palettes, diagnostics, assets,
            });
            castMap.set(as, { rootId, char, charName, entry });
        }

        // --- scene-level audio (music beds)
        for (const cue of sceneSpec.audio ?? []) {
            if (!cue.asset) continue;
            audioCues.push(createCue({
                id: `${sceneId}/${cue.asset}@${cue.at ?? 0}`,
                assetId: cue.asset,
                at: sceneStart + (cue.at ?? 0),
                gain: cue.gain ?? 1,
                fadeIn: cue.fadeIn ?? 0,
                fadeOut: cue.fadeOut ?? 0,
                offset: cue.offset ?? 0,
                duration: cue.duration ?? null,
                bus: cue.bus ?? 'music',
            }));
        }

        // --- shots
        let shotTime = sceneStart;
        let prevCamera = null;
        for (const [hi, shot] of shots.entries()) {
            const dur = shot.duration ?? DEFAULTS.shotDuration;
            const shotStart = shotTime;
            const shotEnd = shotStart + dur;

            prevCamera = buildCamera({
                timeline, cameraId, shot, shotStart, dur, meta, prevCamera,
            });

            for (const action of shot.actions ?? []) {
                buildAction({
                    scene, timeline, action, castMap, shotStart, shotEnd,
                    sceneId, characters, diagnostics, ground: sceneSpec.ground ?? null,
                });
            }

            for (const line of shot.dialogue ?? []) {
                buildDialogue({
                    line, shotStart, shotEnd, sceneId, castMap, castBySpeaker,
                    film, lipsyncJobs, audioCues, diagnostics,
                });
            }

            shotTime = shotEnd;
            if (hi === shots.length - 1) filmTime = shotEnd;
        }
        filmTime = sceneEnd;
    }

    timeline.duration = Math.max(timeline.duration, filmTime);

    buildTransitions({ scene, timeline, sceneSpans, meta });
    buildSubtitleNode({ scene, meta });

    return {
        scene,
        timeline,
        audioCues,
        lipsyncJobs,
        diagnostics,
        meta: { ...meta, duration: filmTime, frames: Math.round(filmTime * meta.fps) },
        cameraId,
    };
}

/**
 * Turn an asset id into something `drawImage` accepts.
 *
 * There has to be exactly one of these. Scenery spreads `...shape` straight
 * into props, so `{ kind: 'image', image: 'bg1' }` used to put the STRING on
 * `props.image`, pass the backend's truthiness check, and then throw inside
 * a real canvas -- a trap rather than a gap. Every path that can name an
 * image now comes through here and gets a diagnostic instead.
 *
 * Accepts `image` or `asset` as the id, so scenery and parts can read the way
 * their authors expect.
 */
function resolveImageProps(props, assets, diagnostics, path) {
    const id = props.asset ?? (typeof props.image === 'string' ? props.image : null);
    if (id == null) return props;

    const image = assets[id];
    delete props.asset;
    if (!image) {
        diagnostics.push({
            severity: 'warning', path,
            message: `Image asset "${id}" was not loaded; nothing will be drawn here.`,
        });
        props.image = null;
        return props;
    }
    props.image = image;
    return props;
}

// ---------------------------------------------------------------- background

function buildBackground(scene, timeline, sceneSpec, groupId, meta, assets, diagnostics) {
    const bg = sceneSpec.background;
    if (!bg) return;
    const id = `${groupId}/bg`;
    if (bg.image) {
        const image = assets[bg.image];
        if (!image) {
            diagnostics.push({
                severity: 'warning', path: `scenes.${sceneSpec.id}.background.image`,
                message: `Image asset "${bg.image}" was not loaded; using its color instead.`,
            });
        }
        scene.add({
            id, kind: image ? 'image' : 'rect',
            props: image
                // `cover` rather than a stretch: a background declared at
                // frame size would otherwise distort any art that is not
                // exactly the film's aspect ratio.
                ? { image, w: meta.width, h: meta.height, cx: true, cy: true,
                    fit: bg.fit ?? 'cover', screenSpace: true }
                : { w: meta.width, h: meta.height, fill: bg.color ?? '#111317', screenSpace: true },
            transform: image ? { x: meta.width / 2, y: meta.height / 2 } : undefined,
            z: -1000,
        }, groupId);
    } else if (bg.color || bg.gradient) {
        scene.add({
            id, kind: 'rect',
            props: {
                w: meta.width, h: meta.height,
                fill: bg.color ?? '#111317',
                gradient: bg.gradient ?? null,
                screenSpace: true,
            },
            z: -1000,
        }, groupId);
    }
}

/**
 * Decorative shapes that are not characters: horizons, rocks, rails, stars.
 *
 * `parallax` scales a shape's apparent camera response -- 0 pins it to the
 * frame like a sky, 1 moves with the world. It is applied by nesting the
 * shape in a group whose transform is a fraction of the camera's, which keeps
 * the whole thing inside the ordinary transform hierarchy instead of needing
 * a special case in the renderer.
 */
function buildScenery(scene, sceneSpec, groupId, palettes, meta, assets, diagnostics) {
    const items = sceneSpec.scenery ?? [];
    if (!items.length) return;
    const palette = palettes[sceneSpec.palette] ?? {};
    const colorOf = (c) => (c == null ? null : (palette[c] ?? c));

    items.forEach((item, i) => {
        const id = `${groupId}/set${i}_${item.id ?? ''}`;
        const at = item.at ?? [0, 0];
        const { kind, ...shape } = item.shape ?? { kind: 'rect' };
        scene.add({
            id, kind: kind ?? 'rect', name: item.id ?? `set${i}`,
            transform: {
                x: at[0], y: at[1],
                sx: item.sx ?? 1, sy: item.sy ?? 1, rot: item.rot ?? 0,
            },
            props: resolveImageProps({
                ...shape,
                fill: colorOf(item.fill),
                stroke: colorOf(item.stroke),
                strokeWidth: item.strokeWidth,
                gradient: item.gradient ?? null,
                alpha: item.alpha ?? 1,
                screenSpace: item.screenSpace ?? false,
            }, assets, diagnostics, `scenes.${sceneSpec.id}.scenery.${item.id ?? i}`),
            z: item.z ?? -500,
        }, groupId);
    });
}

/**
 * Flatten a film into absolutely-timed shots.
 *
 * Shot timing is derived, so anything that needs to map a playhead back to
 * the authored shot -- an editor, a progress readout, a diagnostic -- has to
 * reproduce the compiler's arithmetic or ask for it. This is the ask.
 */
export function filmShots(film) {
    const out = [];
    let t = 0;
    for (const [si, scene] of (film.scenes ?? []).entries()) {
        const sceneId = scene.id ?? `s${si + 1}`;
        for (const [shi, shot] of (scene.shots ?? []).entries()) {
            const duration = shot.duration ?? DEFAULTS.shotDuration;
            out.push({
                sceneId, sceneIndex: si, shotIndex: shi,
                shotId: shot.id ?? `${sceneId}.${shi + 1}`,
                start: t, end: t + duration, duration, scene, shot,
            });
            t += duration;
        }
    }
    return out;
}

/** The shot a given time falls in, or null past the end. */
export function shotAt(film, t) {
    const shots = filmShots(film);
    return shots.find((s) => t >= s.start && t < s.end) ?? shots[shots.length - 1] ?? null;
}

// ----------------------------------------------------------------- character

function instantiateCharacter({ scene, char, charName, as, rootId, parentId,
                               entry, palettes, diagnostics, assets = {} }) {
    const palette = { ...(palettes[char.palette] ?? {}), ...(entry.palette ?? {}) };
    const colorOf = (c) => (c == null ? null : (palette[c] ?? c));
    const scale = entry.scale ?? 1;
    const at = entry.at ?? [0, 0];

    scene.add({
        id: rootId, kind: 'group',
        transform: { x: at[0], y: at[1], sx: scale, sy: scale },
        props: { alpha: entry.alpha ?? 1 },
        z: entry.z ?? 0,
        tags: ['cast', charName],
    }, parentId);

    const parts = characterParts(char);

    // Parts are added parents-first so a child always finds its parent.
    const byId = new Map((parts ?? []).map((p) => [p.id, p]));
    const added = new Set();
    const addPart = (part) => {
        if (!part || added.has(part.id)) return;
        if (part.parent && byId.has(part.parent)) addPart(byId.get(part.parent));
        const pivot = part.pivot ?? [0, 0];
        const nodeId = `${rootId}/${part.id}`;
        scene.add({
            id: nodeId,
            kind: part.shape?.kind ?? 'group',
            name: part.id,
            // The pivot is the joint: a limb rotates about where it attaches,
            // which is the whole trick behind a cutout rig reading correctly.
            transform: {
                x: (part.at?.[0] ?? 0) + pivot[0],
                y: (part.at?.[1] ?? 0) + pivot[1],
                ox: 0, oy: 0,
            },
            props: resolveImageProps({
                ...shapeProps(part.shape),
                fill: colorOf(part.fill),
                stroke: colorOf(part.stroke),
                strokeWidth: part.strokeWidth,
                alpha: part.alpha ?? 1,
            }, assets, diagnostics, `characters.${charName}.parts.${part.id}`),
            z: part.z ?? 0,
        }, part.parent ? `${rootId}/${part.parent}` : rootId);
        added.add(part.id);
    };
    for (const part of parts ?? []) addPart(part);

    // Mouth: one node whose shape is swapped by the viseme track. Keeping all
    // shapes on a single node means lipsync writes one discrete channel.
    const mouthSpec = char.mouth
        ?? (char.generate ? generateMouth(char.proportions) : null);
    if (mouthSpec) {
        const m = mouthSpec;
        const shapes = {};
        for (const [name, shape] of Object.entries(m.shapes ?? {})) shapes[name] = shape;
        const pivot = m.pivot ?? [0, 0];
        const parent = m.parent && added.has(m.parent) ? `${rootId}/${m.parent}` : rootId;
        scene.add({
            id: `${rootId}/mouth`, kind: 'path', name: 'mouth',
            transform: { x: pivot[0], y: pivot[1] },
            props: {
                visemeShapes: shapes,
                viseme: 'closed',
                fill: colorOf(m.fill ?? null),
                stroke: colorOf(m.stroke ?? '#3a2318'),
                strokeWidth: m.strokeWidth ?? 3,
            },
            z: m.z ?? 100,
        }, parent);
    } else if (char.parts?.length) {
        diagnostics.push({
            severity: 'warning', path: `characters.${charName}.mouth`,
            message: 'No mouth block; this character cannot be lipsynced.',
        });
    }
}

/**
 * The parts list a character actually renders with. Generated characters have
 * no `parts` in the film, so anything that needs the rig -- instantiation and
 * IK alike -- has to go through here rather than reading `char.parts`.
 */
export function characterParts(char) {
    if (char.parts?.length) return char.parts;
    return char.generate ? generateCharacterParts(char.generate, char.proportions) : [];
}

function shapeProps(shape) {
    if (!shape) return {};
    const { kind, ...rest } = shape;
    return rest;
}

// -------------------------------------------------------------------- camera

/**
 * Camera keys. `from` is optional: omitting it continues from the previous
 * shot's end, which is what keeps a multi-shot pan continuous instead of
 * snapping back at every cut.
 */
function buildCamera({ timeline, cameraId, shot, shotStart, dur, meta, prevCamera }) {
    const cam = shot.camera;
    const centre = { x: meta.width / 2, y: meta.height / 2, zoom: 1 };
    const start = cam?.from ?? prevCamera ?? centre;
    const end = cam?.to ?? start;
    const ease = cam?.ease ?? 'smooth';
    const h = cam?.h;
    const moveStart = shotStart + (cam?.at ?? 0);
    const moveEnd = moveStart + (cam?.for ?? dur - (cam?.at ?? 0));

    // A shot that declares its own `from` is a cut, not a continuation. Its
    // start key lands on the same time as the previous shot's end key, and
    // `key()` replaces rather than appends -- so writing it at `moveStart`
    // silently DELETED the previous shot's `to` and made the whole preceding
    // segment interpolate to this shot's opening framing instead. In the
    // shipped demo that flew the camera away from both characters for the
    // last eight seconds of a scene.
    //
    // Half a frame later is close enough to be a cut and late enough not to
    // clobber the key before it.
    // Not `prevCamera != null`: that resets at a scene boundary, which is
    // exactly where the clobber happened. Any explicit `from` after t=0
    // lands on a time some earlier shot already keyed.
    const cut = cam?.from != null && moveStart > 0;
    const startAt = cut ? moveStart + 0.5 / (meta.fps || 24) : moveStart;

    const write = (path, a, b) => {
        // On a cut, nothing is written AT `moveStart` -- that instant belongs
        // to the previous shot's `to`, and writing there is what deleted it.
        key(timeline, cameraId, path, startAt, a, { type: 'number', ease, h });
        key(timeline, cameraId, path, moveEnd, b, { type: 'number' });
    };
    write('transform.x', centre.x + (start.x ?? 0), centre.x + (end.x ?? 0));
    write('transform.y', centre.y + (start.y ?? 0), centre.y + (end.y ?? 0));
    write('props.zoom', start.zoom ?? 1, end.zoom ?? 1);
    if (start.rot != null || end.rot != null) {
        write('transform.rot', start.rot ?? 0, end.rot ?? 0);
    }

    return { x: end.x ?? 0, y: end.y ?? 0, zoom: end.zoom ?? 1, rot: end.rot ?? 0 };
}

// ------------------------------------------------------------------- actions

/**
 * Write one channel, as a snap or as a transition.
 *
 * `for` means "ramp from wherever this channel already was", which needs the
 * previous value held at the start or the ramp begins from the default. Both
 * `pose` and `reach` need exactly this, so it lives in one place.
 */
function writeChannel({ timeline, target, channel, value, at, span, ease, h }) {
    const path = `transform.${channel}`;
    if (span == null) {
        key(timeline, target, path, at, value, { type: 'number', ease, h });
        return;
    }
    const prev = lastValueBefore(timeline, target, path, at) ?? defaultChannel(channel);
    key(timeline, target, path, at, prev, { type: 'number', ease, h });
    key(timeline, target, path, at + span, value, { type: 'number' });
}

/** How far a cast member's feet sit below its root, at its staged scale. */
function castFeet(char, entry) {
    const parts = characterParts(char ?? {});
    if (!parts.length) return 0;
    return measureCharacter(parts).bottom * (entry?.scale ?? 1);
}

function buildAction({ scene, timeline, action, castMap, shotStart, shotEnd,
                       sceneId, characters, diagnostics, ground = null }) {
    const cast = castMap.get(action.target);
    if (!cast) return;
    const { rootId, charName, entry } = cast;
    const char = characters[charName];
    const at = shotStart + (action.at ?? 0);
    const span = action.for ?? null;
    const ease = action.ease ?? 'smooth';
    const h = action.h;

    switch (action.do) {
        case 'pose': {
            const pose = char?.poses?.[action.pose];
            if (!pose) return;
            // `for` makes it a transition: hold the current value, then ramp.
            for (const [partId, channels] of Object.entries(pose)) {
                for (const [channel, value] of Object.entries(channels)) {
                    writeChannel({ timeline, target: `${rootId}/${partId}`,
                                   channel, value, at, span, ease, h });
                }
            }
            break;
        }
        case 'move': {
            const to = action.to ?? [0, 0];
            // `to: [700]` with a declared ground means "walk to x=700 and
            // stay on the floor". Deriving y from the ground beats computing
            // a slope by hand, which is how the demo ended up 109px under it.
            if (to[1] == null && ground) {
                const feet = castFeet(char, entry);
                const gy = groundAt(ground, to[0]);
                if (gy != null) to[1] = gy - feet;
            }
            const prevX = lastValueBefore(timeline, rootId, 'transform.x', at)
                ?? scene.get(rootId)?.transform.x ?? 0;
            const prevY = lastValueBefore(timeline, rootId, 'transform.y', at)
                ?? scene.get(rootId)?.transform.y ?? 0;
            const end = at + (span ?? (shotEnd - at));
            key(timeline, rootId, 'transform.x', at, prevX, { type: 'number', ease, h });
            key(timeline, rootId, 'transform.x', end, to[0], { type: 'number' });
            key(timeline, rootId, 'transform.y', at, prevY, { type: 'number', ease, h });
            key(timeline, rootId, 'transform.y', end, to[1], { type: 'number' });
            break;
        }
        case 'play': {
            // Generated characters get the standard cycles for free, so a
            // film can say do:'walk' without authoring one.
            const spec = char?.actions?.[action.action]
                ?? (char?.generate ? generateActions(char.proportions)[action.action] : null);
            if (!spec) return;
            const clipId = `${charName}:${action.action}`;
            if (!timeline.clips.has(clipId)) {
                addClip(timeline, buildClipFromAction(clipId, action.action, spec));
            }
            // An instance rather than expanded keys: a looping cycle costs a
            // handful of keys no matter how long it plays.
            addInstance(timeline, {
                clipId,
                start: at,
                end: at + (span ?? (shotEnd - at)),
                speed: action.speed ?? 1,
                scopeId: rootId,
            });
            break;
        }
        case 'reach': {
            // IK: the author names a point, the solver names the rotations.
            if (!action.part || !Array.isArray(action.to)) return;
            const parts = characterParts(char ?? {});
            const chain = chainFromParts(parts, action.part, action.bones ?? 2);
            if (!chain) {
                diagnostics.push({
                    severity: 'warning', path: `scenes.${sceneId}.actions`,
                    message: `reach: no ${action.bones ?? 2}-bone chain above part `
                        + `"${action.part}" on "${charName}"; ignored.`,
                });
                return;
            }
            // `to` is in the character's own space (its root at the origin),
            // so a reach keeps meaning the same thing wherever the character
            // is standing and at whatever scale.
            const offset = chainRootOffset(parts, chain.rootId);
            const solved = solveChain({
                bones: chain.bones,
                target: [action.to[0] - offset[0], action.to[1] - offset[1]],
                bend: action.bend ?? 1,
            });
            chain.bones.forEach((bone, i) => {
                writeChannel({ timeline, target: `${rootId}/${bone.id}`,
                               channel: 'rot', value: solved.rots[i], at, span, ease, h });
            });
            if (solved.clamped) {
                diagnostics.push({
                    severity: 'info', path: `scenes.${sceneId}.actions`,
                    message: `reach: [${action.to}] is out of range for "${action.part}" `
                        + `(off by ${solved.error.toFixed(1)}); limb extended as far as it goes.`,
                });
            }
            break;
        }
        case 'set': {
            if (!action.channel) return;
            const node = action.part ? `${rootId}/${action.part}` : rootId;
            key(timeline, node, action.channel, at, action.value, { ease, h });
            break;
        }
        case 'show':
        case 'hide': {
            key(timeline, rootId, 'props.alpha', at, action.do === 'show' ? 1 : 0,
                { type: 'number', ease: span ? ease : 'step' });
            if (span != null) {
                key(timeline, rootId, 'props.alpha', at + span,
                    action.do === 'show' ? 1 : 0, { type: 'number' });
            }
            break;
        }
        default:
            break;      // validate() already reported the unknown verb
    }
}

function buildClipFromAction(clipId, name, spec) {
    const tracks = [];
    for (const [channelPath, keys] of Object.entries(spec.keys ?? {})) {
        const dot = channelPath.lastIndexOf('.');
        const partId = dot < 0 ? channelPath : channelPath.slice(0, dot);
        const channel = dot < 0 ? 'y' : channelPath.slice(dot + 1);
        const track = createTrack({
            target: partId,
            path: channel.startsWith('props.') ? channel : `transform.${channel}`,
            type: 'number',
        });
        for (const entry of keys) {
            const [t, v, ease, h] = Array.isArray(entry) ? entry : [entry.t, entry.v, entry.ease, entry.h];
            setKey(track, t, v, ease ?? 'smooth', h);
        }
        tracks.push(track);
    }
    return createClip({ id: clipId, name, duration: spec.duration, loop: spec.loop ?? 'repeat', tracks });
}

/** Last authored value strictly before t, so a transition starts where it is. */
function lastValueBefore(timeline, target, path, t) {
    const track = timeline._index?.get(`${target}\u0000${path}`);
    if (!track) return undefined;
    let found;
    for (const k of track.keys) {
        if (k.t <= t) found = k.v; else break;
    }
    return found;
}

const defaultChannel = (channel) => (channel === 'sx' || channel === 'sy' ? 1 : 0);

// ------------------------------------------------------------------ dialogue

function buildDialogue({ line, shotStart, shotEnd, sceneId, castMap, castBySpeaker, film, lipsyncJobs, audioCues, diagnostics }) {
    if (!line.text && !line.audio) return;
    const at = shotStart + (line.at ?? 0);
    const cast = castMap.get(line.speaker);
    const charName = cast?.charName;
    const voiceSpec = line.voice
        ?? (charName ? castBySpeaker[charName] : null)
        ?? null;

    if (!voiceSpec && !line.audio) {
        diagnostics.push({
            severity: 'warning',
            path: `scenes.${sceneId}.dialogue`,
            message: `"${line.speaker ?? 'unknown'}" has no voice assigned; line will be silent `
                + 'but still subtitled and lipsynced from text.',
        });
    }

    lipsyncJobs.push({
        nodeId: cast ? `${cast.rootId}/mouth` : null,
        speaker: line.speaker,
        text: line.text ?? null,
        at,
        voiceSpec,
        audioAssetId: line.audio ?? null,
        lipsync: line.lipsync !== false,
        gain: line.gain ?? 1,
        durationSec: line.duration ?? null,
        subtitle: line.subtitle !== false,
        shotEnd,
    });
}

// --------------------------------------------------------------- transitions

/**
 * Transitions as core tracks on a screen-space overlay, not CSS.
 *
 * This is the structural fix for overlays that never appeared in any export:
 * because the overlay is a scene node, every sink sees it.
 */
function buildTransitions({ scene, timeline, sceneSpans, meta }) {
    const overlayId = '__overlay';
    const firstFade = sceneSpans.find((s) => s.spec.transitionIn?.kind === 'fade');
    scene.add({
        id: overlayId, kind: 'rect',
        props: {
            w: meta.width, h: meta.height,
            fill: firstFade?.spec.transitionIn?.from ?? '#000000',
            alpha: 0, screenSpace: true,
        },
        z: 10000,
    });

    // Only colour fades land on the overlay. Crossfades were already written
    // as scene-alpha ramps by the visibility plan, which is what keeps them
    // visible in every export instead of living in a CSS layer the encoder
    // never sees.
    let any = false;
    for (const span of sceneSpans) {
        const tIn = span.spec.transitionIn;
        const tOut = span.spec.transitionOut;
        if (tIn && tIn.kind !== 'none' && tIn.kind !== 'crossfade') {
            const d = tIn.duration ?? DEFAULTS.transitionDuration;
            key(timeline, overlayId, 'props.alpha', span.sceneStart, 1, { type: 'number' });
            key(timeline, overlayId, 'props.alpha', span.sceneStart + d, 0, { type: 'number' });
            any = true;
        }
        if (tOut && tOut.kind !== 'none' && tOut.kind !== 'crossfade') {
            const d = tOut.duration ?? DEFAULTS.transitionDuration;
            key(timeline, overlayId, 'props.alpha', span.sceneEnd - d, 0, { type: 'number' });
            key(timeline, overlayId, 'props.alpha', span.sceneEnd, 1, { type: 'number' });
            any = true;
        }
    }
    if (!any) key(timeline, overlayId, 'props.alpha', 0, 0, { type: 'number' });
}

/**
 * Resolve every scene's absolute span and decide who owns each boundary.
 *
 * A crossfade is cooperative: the outgoing scene's transitionOut and the
 * incoming scene's transitionIn describe the same overlap, so either side may
 * declare it and the plan gives both scenes matching ramps.
 */
function planScenes(film) {
    const scenes = film.scenes ?? [];
    const spans = [];
    let t = 0;
    for (const [si, spec] of scenes.entries()) {
        const duration = (spec.shots ?? []).reduce(
            (sum, sh) => sum + (sh.duration ?? DEFAULTS.shotDuration), 0);
        spans.push({
            sceneId: spec.id ?? `s${si + 1}`,
            sceneStart: t, sceneEnd: t + duration, spec,
            fadeIn: 0, fadeOut: 0,
        });
        t += duration;
    }
    for (const [i, span] of spans.entries()) {
        const prev = spans[i - 1];
        const next = spans[i + 1];
        const inSpec = span.spec.transitionIn;
        const outSpec = span.spec.transitionOut;
        if (i > 0 && (inSpec?.kind === 'crossfade'
            || (prev?.spec.transitionOut?.kind === 'crossfade'))) {
            span.fadeIn = inSpec?.kind === 'crossfade'
                ? (inSpec.duration ?? DEFAULTS.transitionDuration)
                : (prev.spec.transitionOut.duration ?? DEFAULTS.transitionDuration);
        }
        if (next && (outSpec?.kind === 'crossfade'
            || next.spec.transitionIn?.kind === 'crossfade')) {
            span.fadeOut = outSpec?.kind === 'crossfade'
                ? (outSpec.duration ?? DEFAULTS.transitionDuration)
                : (next.spec.transitionIn.duration ?? DEFAULTS.transitionDuration);
        }
    }
    return spans;
}

/** One reusable screen-space text node; dialogue writes its string channel. */
function buildSubtitleNode({ scene, meta }) {
    const st = DEFAULTS.subtitleStyle;
    scene.add({
        id: '__subtitle', kind: 'text',
        transform: { x: meta.width / 2, y: meta.height - st.bottomMargin },
        props: {
            text: '', font: st.font, fill: st.fill,
            stroke: st.stroke, strokeWidth: st.strokeWidth,
            align: 'center', baseline: 'alphabetic', screenSpace: true,
        },
        z: 9000,
    });
}
