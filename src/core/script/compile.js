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
import { generateMouth, generatedParts, generatedCycles, isQuadruped } from './generate.js';
import { pathToRuns } from '../paint/path.js';
import { solveChain, chainFromParts, chainRootOffset } from '../rig/IK2D.js';
import { gripAngles, gripMitt, DIGIT_IDS, HAND_POSE_NAMES } from '../art/hands.js';
import { groundAt, measureCharacter } from './staging.js';
import {
    anticipationValue, overshootValue, arcMidpoint, overlapDelays, applyOverlap,
    ANTICIPATION_SHARE, OVERSHOOT_AT,
} from '../anim/principles.js';
import { derivePalette } from '../art/palette.js';
import { buildSceneryTemplate } from '../art/scenery.js';
import { buildEcho } from '../anim/echo.js';

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
        // Frames per drawing for the cast: 2 is the anime standard, 1 is
        // every frame. A shot may override it.
        step: film.meta?.step ?? 0,
        // Carried through because `buildSubtitleNode` needs it; `meta` is
        // rebuilt key by key here, so anything not listed is dropped.
        ...(film.meta?.subtitleStyle ? { subtitleStyle: film.meta.subtitleStyle } : {}),
        version: FILM_VERSION,
    };

    const scene = new Scene();
    const timeline = createTimeline({ fps: meta.fps });
    // Spans where the cast is held on twos or threes; the camera stays on ones.
    timeline.steps = [];
    timeline.sheets = [];
    timeline.step = meta.step ?? 0;
    const audioCues = [];
    const lipsyncJobs = [];

    const { castBySpeaker, voiceGains, voiceDeliveries, diagnostics: voiceDiag } = castVoices(film);
    diagnostics.push(...voiceDiag);

    // --- camera: starts at frame centre so authored coordinates read as
    // screen coordinates, which is what an author (and an LLM) expects.
    const cameraId = '__camera';
    scene.add({
        id: cameraId, kind: 'camera',
        transform: { x: meta.width / 2, y: meta.height / 2 },
        // The authored frame travels WITH the camera, because the backend is
        // the only thing that knows the output size and it cannot otherwise
        // tell a 1080x1920 film rendered small from a 540x960 film rendered
        // true. Without it, rendering at any size but the authored one
        // CROPPED the film instead of scaling it.
        props: { zoom: 1, frameWidth: meta.width, frameHeight: meta.height },
    });

    const palettes = film.palettes ?? {};
    const characters = film.characters ?? {};
    /**
     * Each scene **after** its template has been expanded.
     *
     * Returned because the checker needs the same film the compiler built
     * from. It used to read `film.scenes` directly, so a scene whose
     * `ground` came from a template had no ground as far as the checker was
     * concerned -- and the ground check, which only runs when there is a
     * ground, silently never ran. One film reported zero staging notes for
     * its entire life on that basis, while a character hung five seconds in
     * mid-air across two cuts.
     */
    const expanded = [];

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

        // A named set expands into the same scenery, ground and background an
        // author could have written by hand -- so nothing downstream has to
        // know a template was involved, and authored entries still win.
        const spec = expandTemplate(sceneSpec, meta, palettes, diagnostics);
        expanded.push(spec);

        const scenePalette = derivePalette(palettes[spec.palette] ?? {});
        buildBackground(scene, timeline, spec, groupId, meta, assets, diagnostics,
                        (c) => (c == null ? null : (scenePalette[c] ?? c)));
        buildScenery(scene, spec, groupId, palettes, meta, assets, diagnostics);
        buildDrawings(scene, spec, groupId, sceneId, scenePalette, meta, diagnostics);
        buildPhotos(scene, timeline, spec, groupId, sceneId, meta, assets, diagnostics,
                    sceneStart, sceneEnd);

        // --- cast: instantiate each character's part tree
        const castMap = new Map();
        const echoes = [];
        // `do: 'smear'` is an echo gated to a time span rather than to whole
        // shots. Collected here and applied after the shot loop for the same
        // reason `cast.echo` is: the trail clones tracks, so every track it
        // will clone has to exist first.
        const smears = [];
        const shotSpans = [];
        for (const entry of sceneSpec.cast ?? []) {
            const charName = entry.character;
            const char = characters[charName];
            if (!char) continue;
            const as = entry.as ?? charName;
            const rootId = `${sceneId}/${as}`;
            instantiateCharacter({
                scene, char, charName, as, rootId, parentId: groupId,
                entry: standOnGround(entry, char, spec.ground),
                palettes, diagnostics, assets, scenePalette: spec.palette,
            });
            castMap.set(as, { rootId, char, charName, entry });
            if (entry.echo) echoes.push([rootId, entry.echo]);
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
                if (action.do === 'smear') {
                    const cast = castMap.get(action.target);
                    if (!cast) {
                        diagnostics.push({ severity: 'warning', path: `scenes.${sceneId}.actions`,
                            message: `smear: no cast member "${action.target}" in this scene.` });
                        continue;
                    }
                    const start = shotStart + (action.at ?? 0);
                    smears.push([cast.rootId, action,
                                 { start, end: action.for != null ? start + action.for : shotEnd }]);
                    continue;
                }
                buildAction({
                    scene, timeline, action, castMap, shotStart, shotEnd,
                    sceneId, characters, diagnostics, ground: spec.ground ?? null,
                    // So `set props.fill` can name a palette colour, exactly
                    // as a part or a scenery item does.
                    colorOf: (c) => (c == null ? null : (scenePalette[c] ?? c)),
                });
            }

            for (const line of shot.dialogue ?? []) {
                buildDialogue({
                    line, shotStart, shotEnd, sceneId, castMap, castBySpeaker, voiceGains,
                    voiceDeliveries,
                    film, lipsyncJobs, audioCues, diagnostics,
                });
            }

            shotSpans.push({ id: shot.id ?? `shot${hi}`, start: shotStart, end: shotEnd });

            // "On twos": held drawings against a continuous camera.
            const step = shot.step ?? meta.step ?? 0;
            if (step > 1) timeline.steps.push({ start: shotStart, end: shotEnd, step });

            shotTime = shotEnd;
            if (hi === shots.length - 1) filmTime = shotEnd;
        }

        // After every shot, so the trail clones tracks that already exist.
        // A smear is an echo that lasts a beat, not a shot: a limb smears for
        // three frames of a swing, and `cast.echo`'s shot granularity cannot
        // say that. Same clone pass, same determinism, a span instead.
        for (const [rootId, action, span] of smears) {
            buildEcho({ scene, timeline, meta }, rootId, {
                frames: action.samples ?? 3,
                spacing: action.spread != null ? action.spread * (meta.fps ?? 24) : 2,
                falloff: action.fade ?? 0.45,
            }, [span]);
        }

        for (const [rootId, spec] of echoes) {
            const want = spec.shots ? new Set([].concat(spec.shots)) : null;
            const spans = want
                ? shotSpans.filter((sp) => want.has(sp.id)).map(({ start, end }) => ({ start, end }))
                : null;
            buildEcho({ scene, timeline, meta }, rootId, spec, spans);
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
        expanded,
        // Scene boundaries, so a pacing report can localise a slack stretch.
        // A film that is 54% speech is rarely uniformly slack; it is three
        // slack scenes. See docs/27-RETENTION.md.
        //
        // Projected, not passed through: the internal spans carry each
        // scene's whole authored `spec`, and handing that back out would put
        // the entire film inside its own compile result.
        sceneSpans: sceneSpans.map(({ sceneId, sceneStart, sceneEnd }) =>
            ({ id: sceneId, start: sceneStart, end: sceneEnd })),
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

/**
 * Resolve a gradient's stops through the palette.
 *
 * Without this a stop could only ever be a literal colour: naming one throws
 * inside `ctx.addColorStop`, which takes the whole frame down rather than
 * drawing the wrong colour. Everything else a scene paints already resolves
 * through `colorOf`, so this was a hole in an otherwise consistent rule.
 */
function resolveGradient(gradient, colorOf) {
    if (!gradient?.stops) return gradient ?? null;
    return { ...gradient, stops: gradient.stops.map(([at, c]) => [at, colorOf(c)]) };
}

// ---------------------------------------------------------------- background

function buildBackground(scene, timeline, sceneSpec, groupId, meta, assets, diagnostics,
                         colorOf = (c) => c) {
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
                : { w: meta.width, h: meta.height, fill: colorOf(bg.color) ?? '#111317',
                    screenSpace: true },
            transform: image ? { x: meta.width / 2, y: meta.height / 2 } : undefined,
            z: -1000,
        }, groupId);
    } else if (bg.color || bg.gradient) {
        scene.add({
            id, kind: 'rect',
            props: {
                w: meta.width, h: meta.height,
                fill: colorOf(bg.color) ?? '#111317',
                gradient: resolveGradient(bg.gradient, colorOf),
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
/**
 * Resolve `scene.template` into a plain scene spec.
 *
 * The template supplies the floor the set was drawn from, which is the point:
 * `do:'move'` and the staging check then read the SAME declaration the art
 * used, instead of an author re-deriving a slope by hand and getting it wrong.
 * Anything the scene declares itself wins -- a template is a starting point,
 * never a cage.
 */
function expandTemplate(sceneSpec, meta, palettes, diagnostics) {
    if (!sceneSpec.template) return sceneSpec;
    const built = buildSceneryTemplate(sceneSpec.template, meta, diagnostics,
                                       `scenes.${sceneSpec.id}.template`);
    if (!built) return sceneSpec;
    // A time of day is a palette overlay, not a filter, so it recolours the
    // set without touching any geometry -- and an authored palette still wins.
    if (built.palette && sceneSpec.palette) {
        palettes[sceneSpec.palette] = { ...built.palette, ...palettes[sceneSpec.palette] };
    } else if (built.palette) {
        palettes[`__t_${sceneSpec.id}`] = built.palette;
    }
    return {
        ...sceneSpec,
        palette: sceneSpec.palette ?? (built.palette ? `__t_${sceneSpec.id}` : undefined),
        background: sceneSpec.background ?? built.background,
        ground: sceneSpec.ground ?? built.ground,
        scenery: [...built.scenery, ...(sceneSpec.scenery ?? [])],
    };
}

function buildScenery(scene, sceneSpec, groupId, palettes, meta, assets, diagnostics) {
    const items = sceneSpec.scenery ?? [];
    if (!items.length) return;
    const palette = derivePalette(palettes[sceneSpec.palette] ?? {});
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
                gradient: resolveGradient(item.gradient, colorOf),
                alpha: item.alpha ?? 1,
                ...drawProps(item, colorOf),
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
                               entry, palettes, diagnostics, assets = {}, scenePalette }) {
    // Derived, so a part can name `skinShade` and `skinLine` without the
    // author having picked three tones per material -- and so a generated
    // character renders at all with no palette declared, instead of sending
    // the literal string "skin" to the canvas as a fill.
    // A character with no palette of its own takes the SCENE's. Without the
    // fallback a cast member silently renders in default colours while every
    // piece of scenery around it uses the declared palette, which looks like
    // a colour bug rather than a missing key.
    const named = palettes[char.palette] ?? palettes[scenePalette] ?? {};
    const palette = derivePalette({ ...named, ...(entry.palette ?? {}) });
    const colorOf = (c) => (c == null ? null : (palette[c] ?? c));
    const scale = entry.scale ?? 1;
    const at = entry.at ?? [0, 0];

    scene.add({
        id: rootId, kind: 'group',
        transform: { x: at[0], y: at[1], sx: scale, sy: scale },
        // `view` and `expression` live on the root and are read by every
        // feature below it through ancestor lookup, so one `set` turns a head
        // whose dozen parts would otherwise need a dozen identical writes.
        // Declared ONLY when the author asked for one. A blanket `view:
        // 'front'` here would be the nearest declaration for every part below
        // it, which silently overrides a part's own declared default -- the
        // precedence has to run author > part default > first member.
        props: {
            alpha: entry.alpha ?? 1,
            ...(entry.view ?? char.view ? { view: entry.view ?? char.view } : {}),
            ...(entry.expression ?? char.expression
                ? { expression: entry.expression ?? char.expression } : {}),
        },
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
        // `shapes` makes the part a group of stacked drawings. Cel art is
        // three per part -- flat base, a hard-edged shadow, and line work --
        // and one part/one shape/one node could not express that.
        const layers = Array.isArray(part.shapes) ? part.shapes : null;
        // A part may be DRAWN rather than assembled. `strokes` turns it into a
        // paint node that still rotates about its joint.
        const painted = part.strokes?.length
            ? paintPartProps(part, colorOf, diagnostics, `characters.${charName}.parts.${part.id}`)
            : null;
        scene.add({
            id: nodeId,
            // A part with BOTH a shape and layers keeps its own shape: the
            // layers are children, and children draw over their parent, which
            // is exactly base-then-shade. Forcing `group` whenever layers
            // existed silently dropped the base drawing.
            kind: painted ? 'paint' : (part.shape?.kind ?? 'group'),
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
                ...drawProps(part, colorOf),
                ...swapProps(part, colorOf, diagnostics,
                             `characters.${charName}.parts.${part.id}`),
                ...(painted ?? {}),
            }, assets, diagnostics, `characters.${charName}.parts.${part.id}`),
            z: part.z ?? 0,
        }, part.parent ? `${rootId}/${part.parent}` : rootId);

        for (const [i, layer] of (layers ?? []).entries()) {
            scene.add({
                id: `${nodeId}/${layer.id ?? i}`,
                kind: layer.shape?.kind ?? 'group',
                name: layer.id ?? `layer${i}`,
                transform: { x: layer.at?.[0] ?? 0, y: layer.at?.[1] ?? 0 },
                props: resolveImageProps({
                    ...shapeProps(layer.shape),
                    fill: colorOf(layer.fill),
                    stroke: colorOf(layer.stroke),
                    strokeWidth: layer.strokeWidth,
                    alpha: layer.alpha ?? 1,
                    ...drawProps(layer, colorOf),
                    ...swapProps(layer, colorOf),
                }, assets, diagnostics, `characters.${charName}.parts.${part.id}.${layer.id ?? i}`),
                z: layer.z ?? i,
            }, nodeId);
        }
        added.add(part.id);
    };
    for (const part of parts ?? []) addPart(part);

    // Mouth: one node whose shape is swapped by the viseme track. Keeping all
    // shapes on a single node means lipsync writes one discrete channel.
    // A quadruped has a jaw, not a viseme chart: it is not going to lipsync,
    // and generating a human mouth chart for it would park one on its ribs.
    const mouthSpec = char.mouth
        ?? ((char.generate && !isQuadruped(char.generate))
            ? generateMouth(char.proportions, char.generate) : null);
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
    } else if (char.parts?.length && char.voice) {
        // Only for a character that was cast to SPEAK. An effect sprite -- a
        // beam, an impact flash -- is a character with parts and no business
        // having a mouth, and warning about it trains an author to ignore the
        // diagnostics that matter.
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
    return char.generate ? generatedParts(char.generate, char.proportions) : [];
}

/**
 * Turn a part's `swap` declaration into the props the swap pass reads.
 *
 *   "swap": { "view": { "default": "front",
 *                       "shapes": { "front": {...}, "profile": {...} } } }
 *
 * The channel name is the key, because that is the prop a discrete track
 * writes -- `props.view` drives the `view` set, with no indirection between.
 */
/**
 * Draw-level properties: compositing, glow, trimmed strokes, repeaters.
 *
 * Kept separate from paint because they are the motion-graphics layer rather
 * than the character layer -- the same five keys serve a speed-line burst, an
 * energy beam and a lower third. Colours inside them resolve through the
 * palette like every other colour in the film.
 */
function drawProps(part, colorOf) {
    const out = {};
    if (part.blend) out.blend = part.blend;
    if (part.trim) out.trim = part.trim;
    // One scalar added to `trim.offset` at draw time. `trim` is an object and
    // the interpolator keys scalars, so `set props.trim.offset` wrote a
    // property literally named "trim.offset" that nothing read -- silently.
    // `props.flow` keys like `props.alpha`. See docs/25-FLOW.md.
    if (part.flow != null) out.flow = part.flow;
    if (part.repeat) out.repeat = part.repeat;
    // `shapes.js` has always read these and defaults both to 'round', but
    // nothing ever copied them out of the part -- so a wide band drawn as a
    // stroke bulged half its own width past each end of its path, and the
    // only clue was in the picture.
    if (part.lineCap) out.lineCap = part.lineCap;
    if (part.lineJoin) out.lineJoin = part.lineJoin;
    // Text that has to stay inside the frame.
    if (part.maxWidth) out.maxWidth = part.maxWidth;
    if (part.lineHeight) out.lineHeight = part.lineHeight;
    if (part.gradient) out.gradient = resolveGradient(part.gradient, colorOf);
    if (part.glow) {
        out.glow = typeof part.glow === 'object'
            ? { ...part.glow, ...(part.glow.color != null && { color: colorOf(part.glow.color) }) }
            : part.glow;
    }
    return out;
}

function swapProps(part, colorOf, diagnostics = [], path = '') {
    const spec = part.swap;
    if (!spec) return {};
    const swapSets = {};
    const swapDefaults = {};
    for (const [channel, set] of Object.entries(spec)) {
        const shapes = set.shapes ?? set;
        // A member may declare its own fill or stroke -- a closed eyelid is
        // dark where an open eye is white -- so those resolve through the
        // palette like any other colour.
        swapSets[channel] = Object.fromEntries(Object.entries(shapes).map(([k, v]) => {
            // A member may be DRAWN rather than shaped -- a hand chart is
            // four drawings of a hand, not four polygons. This is the
            // mechanism limited animation actually runs on, and until now a
            // set member could only be a shape.
            if (v?.strokes?.length) {
                const painted = paintPartProps({ ...v, id: `${part.id}:${channel}:${k}` },
                                               colorOf, diagnostics, path);
                return [k, painted ? { kind: 'paint', ...painted } : v];
            }
            return [k, (v && (v.fill != null || v.stroke != null))
                ? { ...v, ...(v.fill != null && { fill: colorOf(v.fill) }),
                          ...(v.stroke != null && { stroke: colorOf(v.stroke) }) }
                : v];
        }));
        // The default goes BESIDE the set, never onto `props[channel]`.
        // Stamping it on the node made the node its own nearest declaration of
        // the channel, so a `view` written once on the cast root could never
        // reach the dozen head parts that have to turn with it.
        swapDefaults[channel] = set.default ?? Object.keys(shapes)[0];
    }
    return { swapSets, swapDefaults };
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
    /**
     * Camera coordinates are OFFSETS from the centre of the frame -- see the
     * `centre.x + start.x` below -- so a shot with no camera rests at zero,
     * not at the centre.
     *
     * Defaulting to `centre` double-counted it and keyed the camera to
     * (width, height): every film that never mentions a camera was framed
     * half a frame up and to the left, with its own content as the only
     * evidence. Films that DO declare one were unaffected, which is why it
     * survived -- the demo declares a camera in its first shot.
     */
    const rest = { x: 0, y: 0, zoom: 1 };
    const start = cam?.from ?? prevCamera ?? rest;
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
    if (cam?.shake) buildShake({ timeline, cameraId, cam, moveStart, startAt, dur, meta, centre, start, end });

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

/**
 * Camera shake, as a declaration rather than a dozen hand-written keys.
 *
 * An impact without a shake is a pose change -- the hit lands on the frame,
 * not on the character -- and `shot.camera` had no way to say so: it is a
 * from/to pair, and an oscillation is neither. An author could only get one
 * by cutting the shot into pieces, which puts a cut where a cut does not
 * belong.
 *
 *   "camera": { ..., "shake": 14 }          // amplitude in scene units
 *   "camera": { ..., "shake": { "amount": 20, "at": 0.4, "for": 0.5 } }
 *
 * Decays to nothing across its span, because a shake that stops abruptly
 * reads as a mistake. Alternating sign at twice the frame rate is what makes
 * it register as a jolt rather than as a wobble -- below that it looks like
 * the camera operator is unwell.
 */
function buildShake({ timeline, cameraId, cam, moveStart, startAt, dur, meta, centre, start, end }) {
    const spec = typeof cam.shake === 'number' ? { amount: cam.shake } : cam.shake;
    const amount = spec.amount ?? 12;
    if (!(amount > 0)) return;
    const fps = meta.fps || 24;
    // Never earlier than `startAt`. A shake beginning at `moveStart` writes its
    // first key at the exact time the PREVIOUS shot's `to` key sits on, and
    // `key()` replaces rather than appends -- so an impact at the top of a
    // shot silently deleted the end of the shot before it and the camera
    // drifted across the cut instead of holding. This is the same clobber the
    // cut offset above exists to prevent; the shake has to respect it too.
    const at = Math.max(startAt, moveStart + (spec.at ?? 0));
    const span = Math.min(spec.for ?? 0.45, dur - (at - moveStart));
    const steps = Math.max(2, Math.round(span * fps));
    // The pan underneath still has to happen, so each jolt is written as an
    // OFFSET from the interpolated position rather than as an absolute.
    const baseX = centre.x + (start.x ?? 0), endX = centre.x + (end.x ?? 0);
    const baseY = centre.y + (start.y ?? 0), endY = centre.y + (end.y ?? 0);
    for (let i = 0; i <= steps; i++) {
        const t = at + (i / steps) * span;
        const decay = 1 - i / steps;
        const sign = i % 2 ? -1 : 1;
        const u = dur > 0 ? Math.min(1, Math.max(0, (t - moveStart) / dur)) : 0;
        key(timeline, cameraId, 'transform.x', t,
            baseX + (endX - baseX) * u + sign * amount * decay,
            { type: 'number', ease: 'linear' });
        key(timeline, cameraId, 'transform.y', t,
            baseY + (endY - baseY) * u + sign * amount * decay * 0.6,
            { type: 'number', ease: 'linear' });
    }
}

function writeChannel({ timeline, target, channel, value, at, span, ease, h,
                       anticipate = 0, overshoot = 0 }) {
    const path = `transform.${channel}`;
    if (span == null) {
        key(timeline, target, path, at, value, { type: 'number', ease, h });
        return;
    }
    const prev = lastValueBefore(timeline, target, path, at) ?? defaultChannel(channel);
    key(timeline, target, path, at, prev, { type: 'number', ease, h });
    // Anticipation and follow-through both live here rather than in each
    // verb, because `pose`, `move` and `reach` all write through this one
    // function -- so one number on an action buys both for all three.
    if (anticipate) {
        key(timeline, target, path, at + span * ANTICIPATION_SHARE,
            anticipationValue(prev, value, anticipate), { type: 'number', ease: 'smooth' });
    }
    if (overshoot) {
        key(timeline, target, path, at + span * OVERSHOOT_AT,
            overshootValue(prev, value, overshoot), { type: 'number', ease: 'smooth' });
    }
    key(timeline, target, path, at + span, value, { type: 'number' });
}

/**
 * Place a cast member on the scene's floor when it gives only an x.
 *
 * `do:'move'` already derives y from the declared ground; staging a character
 * did not, so an author had to compute the same number by hand for the first
 * position and then never again -- or write a dummy one-frame `move` to snap
 * it down. Both are the arithmetic the ground declaration exists to remove.
 */
function standOnGround(entry, char, ground) {
    const at = entry.at;
    if (!ground || !Array.isArray(at) || at[1] != null) return entry;
    const gy = groundAt(ground, at[0] ?? 0);
    if (gy == null) return entry;
    return { ...entry, at: [at[0] ?? 0, gy - castFeet(char, entry)] };
}

/** How far a cast member's feet sit below its root, at its staged scale. */
function castFeet(char, entry) {
    const parts = characterParts(char ?? {});
    if (!parts.length) return 0;
    return measureCharacter(parts).bottom * (entry?.scale ?? 1);
}

/**
 * Hold a channel's existing value at t=0 before changing it later.
 *
 * A track reads as its FIRST key's value at every time before that key. So a
 * single `set` at t=16 does not change anything at t=16 -- it rewrites the
 * whole film from frame one. A hair colour meant to turn gold on a
 * transformation was gold in the opening shot, and an effect sprite first
 * shown at t=35 was on screen from the start. Both looked like the author's
 * mistake and neither was.
 *
 * Seeding only when the track does not yet exist keeps a later `set` on the
 * same channel behaving as a plain keyframe.
 */
/**
 * Hold a channel at its authored value from frame one.
 *
 * Without this, a channel first keyed at t=35 reads as that key's value
 * for the whole film before it, because a track reads as its *first* key
 * at every earlier time.
 *
 * It deliberately takes no value: the seed is always the node's own
 * authored state. A caller wanting to start somewhere else must say so
 * with an explicit key -- which `draw` does, since a drawing's authored
 * `progress` is 1 but a reveal has to begin at 0.
 */
function seedChannel(scene, timeline, nodeId, path) {
    if (timeline._index?.get(`${nodeId}\u0000${path}`)) return;
    const node = scene.get(nodeId);
    if (!node) return;
    const dot = path.indexOf('.');
    const bag = path.slice(0, dot) === 'props' ? node.props : node.transform;
    const current = bag?.[path.slice(dot + 1)];
    if (current === undefined) return;
    key(timeline, nodeId, path, 0, current, { type: typeof current === 'number' ? 'number' : undefined, ease: 'step' });
}

const COLOR_CHANNELS = new Set(['props.fill', 'props.stroke']);

/**
 * Boil: the contour that will not sit still.
 *
 *   { "target": "ink", "do": "boil", "rate": 8, "amplitude": 0.35 }
 *
 * In a pencil test a held drawing is redrawn rather than held, so the line
 * shifts a little between exposures. `props.boil` is the exposure index; the
 * painter adds it to every stroke's jitter seed, so the same strokes resample
 * to a slightly different contour. Stepped, never interpolated -- a boil that
 * eased between seeds would be a morph, not a redraw.
 *
 * Deterministic: the index is a function of the frame, so frame N boils the
 * same way on every render.
 */
function buildBoil({ scene, timeline, action, shotStart, shotEnd, sceneId, diagnostics, fps }) {
    const path = `scenes.${sceneId}.actions`;
    const nodeId = `${sceneId}/${action.target}`;
    const node = scene.get(nodeId);
    if (!node) {
        diagnostics.push({ severity: 'warning', path,
            message: `boil: no drawing or cast member "${action.target}" in this scene.` });
        return;
    }
    // Boil belongs to the DRAWING, but a character drawn with `part.strokes`
    // IS drawings -- one per part. Naming the cast member boils all of them,
    // which is what an animator means by "boil the dog".
    const targets = [];
    if (node.kind === 'paint' || node.kind === 'photo') targets.push(nodeId);
    else scene.walk((n) => { if (n.kind === 'paint') targets.push(n.id); }, nodeId);
    if (!targets.length) {
        diagnostics.push({ severity: 'warning', path,
            message: `boil: "${action.target}" is a ${node.kind} with no strokes to redraw. `
                + `Boil applies to a scene's "drawings", or to a character whose parts carry `
                + `"strokes" -- a character assembled from shapes has no contour to redraw.` });
        return;
    }

    const rate = Number(action.rate ?? 8);
    if (!Number.isFinite(rate) || rate <= 0) {
        diagnostics.push({ severity: 'warning', path,
            message: `boil: "rate" is exposures per second and must be positive. Got ${action.rate}.` });
        return;
    }
    const start = shotStart + (action.at ?? 0);
    const end = action.for != null ? start + action.for : shotEnd;
    // Each part gets its own seed offset, so the whole figure does not boil
    // in lockstep -- a drawing whose every contour jumps on the same frame
    // reads as a glitch rather than as a redraw.
    let i = 0;
    for (const [ti, id] of targets.entries()) {
        if (action.amplitude != null) {
            key(timeline, id, 'props.boilAmount', start, action.amplitude,
                { type: 'number', ease: 'step' });
        }
        // One key per exposure, frame-aligned so the redraw lands on a frame
        // rather than between two.
        i = 0;
        for (let t = start; t < end; t += 1 / rate, i++) {
            key(timeline, id, 'props.boil', Math.round(t * fps) / fps, i + ti * 7,
                { type: 'number', ease: 'step' });
        }
    }
    if (i === 0) {
        diagnostics.push({ severity: 'warning', path,
            message: `boil: the span is shorter than one exposure at ${rate}/s; nothing to boil.` });
    }
}


/**
 * A stroke's runs as point lists, whether it was authored as `points` or as
 * path data.
 *
 * Flattening here rather than translating the path text is deliberate: `H`,
 * `V` and `A` do not take alternating x,y pairs, so shifting every number in
 * a path string corrupts exactly the commands that are hardest to notice. The
 * brush resamples to dabs by arc length regardless, so nothing is lost.
 */
function strokePoints(stroke) {
    if (stroke.points?.length) {
        return [stroke.points.map((pt) => (Array.isArray(pt)
            ? { x: pt[0], y: pt[1], p: pt[2] ?? 1 }
            : { ...pt, p: pt.p ?? 1 }))];
    }
    return stroke.path ? pathToRuns(stroke.path).filter((run) => run.length) : [];
}

/**
 * The local-space box a part's freehand strokes occupy, plus the margin the
 * widest brush needs so a nib centred on the contour is not clipped in half.
 */
function strokeBounds(strokes, fallbackSize = 8) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, pad = 0;
    for (const stroke of strokes) {
        pad = Math.max(pad, (stroke.size ?? fallbackSize));
        for (const pt of strokePoints(stroke).flat()) {
            if (!Number.isFinite(pt.x) || !Number.isFinite(pt.y)) continue;
            if (pt.x < x0) x0 = pt.x;
            if (pt.y < y0) y0 = pt.y;
            if (pt.x > x1) x1 = pt.x;
            if (pt.y > y1) y1 = pt.y;
        }
    }
    if (!Number.isFinite(x0)) return null;
    const m = pad * 0.75 + 2;
    return [x0 - m, y0 - m, x1 + m, y1 + m];
}

/**
 * A part drawn FREEHAND rather than assembled from primitives.
 *
 * Joining ellipses and tapered paths makes a figure that reads as clip-art no
 * matter how well it is rigged -- the contour is too even and the joints show.
 * A part carrying `strokes` becomes a `paint` node instead, so it is drawn
 * with the pressure-responsive brushes in `core/paint/` and still rotates
 * about its joint like any other part. Rig and drawing, not rig or drawing.
 *
 * It is also what lets `boil` reach a character: boil redraws strokes, and
 * until a part could HAVE strokes there were none on a rig to redraw.
 */
function paintPartProps(part, colorOf, diagnostics, path) {
    const strokes = (part.strokes ?? []).map((stroke) => ({
        brush: stroke.brush ?? 'pencil',
        ...stroke,
        color: colorOf(stroke.color) ?? '#000000',
    }));
    if (!strokes.length) return null;
    for (const stroke of strokes) {
        if (!stroke.path && !stroke.points) {
            diagnostics.push({ severity: 'warning', path,
                message: `part "${part.id}": a stroke has neither "path" nor "points".` });
        }
    }
    // An authored `box` wins: a part whose strokes are drawn on later frames
    // needs a surface big enough for all of them, which this cannot infer.
    const box = part.box ?? strokeBounds(strokes);
    if (!box) {
        diagnostics.push({ severity: 'warning', path,
            message: `part "${part.id}": no stroke has any point, so it would render as nothing.` });
        return null;
    }
    const [x0, y0, x1, y1] = box;
    const width = Math.max(1, Math.ceil(x1 - x0));
    const height = Math.max(1, Math.ceil(y1 - y0));
    return {
        paint: {
            width, height,
            layers: [{
                name: part.id, blend: 'normal', opacity: 1, visible: true,
                // Into surface space: the box's top-left becomes (0, 0). A
                // path with several subpaths becomes several strokes, which
                // is what it already was.
                strokes: strokes.flatMap((stroke, si) => strokePoints(stroke).map((run, ri) => {
                    const { path: _drop, ...rest } = stroke;
                    return {
                        ...rest,
                        seed: stroke.seed ?? (si * 131 + ri),
                        points: run.map((pt) => ({ ...pt, x: pt.x - x0, y: pt.y - y0 })),
                    };
                })),
            }],
            background: null,
        },
        progress: part.progress ?? 1,
        w: width, h: height,
        // The JOINT, not the image centre: `ax`/`ay` are the anchor in
        // destination units from the image's top-left, so the part turns
        // about where it attaches exactly as a shape-based part does.
        ax: -x0, ay: -y0,
    };
}

/**
 * An exposure sheet: how long each successive drawing is held, in frames.
 *
 *   { "target": "dog", "do": "expose", "sheet": "4 4 2 1 1 2 4" }
 *
 * Read left to right from `at`. This is the notation on a real X-sheet, and
 * it is here because `shot.step` -- one integer for the whole shot -- cannot
 * say "hold the acting beat four frames and then snap on ones", which is what
 * every measured pencil test actually does.
 *
 * The sheet repeats to fill its span, so `"2"` is exactly `step: 2`. With
 * `loop: false` the last hold runs to the end instead.
 */
function buildExposure({ scene, timeline, action, castMap, shotStart, shotEnd,
                         sceneId, diagnostics, fps }) {
    const path = `scenes.${sceneId}.actions`;
    const raw = action.sheet ?? action.value;
    const holds = (typeof raw === 'string' ? raw.trim().split(/[\s,]+/) : raw ?? [])
        .map(Number)
        .filter((n) => Number.isFinite(n));
    if (!holds.length || holds.some((n) => n < 1)) {
        diagnostics.push({ severity: 'warning', path,
            message: `expose: "sheet" must be one or more hold lengths of at least 1 frame, `
                + `e.g. "4 4 2 1 1 2". Got ${JSON.stringify(raw)}.` });
        return;
    }

    // No target is legal and means the whole shot -- a non-uniform `step`.
    let target = null;
    if (action.target && action.target !== '*') {
        const cast = castMap.get(action.target);
        if (cast) target = cast.rootId;
        else if (scene.get(`${sceneId}/${action.target}`)) target = `${sceneId}/${action.target}`;
        else {
            diagnostics.push({ severity: 'warning', path,
                message: `expose: no cast member or drawing "${action.target}" in this scene.` });
            return;
        }
    }

    const start = shotStart + (action.at ?? 0);
    const end = action.for != null ? start + action.for : shotEnd;
    if (end <= start) {
        diagnostics.push({ severity: 'warning', path,
            message: `expose: the sheet spans no time (${start.toFixed(3)}s to ${end.toFixed(3)}s).` });
        return;
    }

    // Boundaries are frame-aligned absolute seconds: the times at which a new
    // drawing is exposed. Sampling snaps back to the last one, which is what
    // holding a drawing means.
    const loop = action.loop !== false;
    const startFrame = Math.round(start * fps);
    const endFrame = Math.round(end * fps);
    const boundaries = [];
    for (let f = startFrame, i = 0; f < endFrame; i++) {
        boundaries.push(f / fps);
        if (!loop && i >= holds.length - 1) break;
        f += Math.round(holds[i % holds.length]);
    }
    timeline.sheets.push({ start, end, target, boundaries });
}

function buildAction({ scene, timeline, action, castMap, shotStart, shotEnd,
                       sceneId, characters, diagnostics, ground = null, colorOf = null }) {
    const at0 = shotStart + (action.at ?? 0);

    // `draw` targets a *drawing*, not a cast member, so it resolves before
    // the cast lookup -- which would otherwise discard it silently.
    if (action.do === 'draw') {
        const nodeId = `${sceneId}/${action.target}`;
        if (!scene.get(nodeId)) {
            diagnostics.push({
                severity: 'warning', path: `scenes.${sceneId}.actions`,
                message: `draw: no drawing or photo "${action.target}" in this scene`,
            });
            return;
        }
        // The whole mechanism is one number. `props.progress` selects how
        // many of a stroke's dabs are stamped, and the resampler walks
        // from the start, so a partially drawn stroke is a *prefix* of the
        // finished one rather than a different computation. Frame N stays
        // a pure function of N with no history buffer -- and because the
        // reveal is an ordinary number channel, every easing, clip, mask
        // and additive layer the animation system already has applies to
        // a draw-on for free.
        const from = action.from ?? 0;
        const to = action.to ?? 1;
        const span0 = action.for ?? null;
        const ease0 = action.ease ?? 'smooth';
        // A drawing's authored `progress` is 1, so that a drawing with no
        // actions is simply present. A reveal therefore cannot use
        // `seedChannel` -- it must hold at `from` before it starts, or the
        // drawing is fully visible for every frame preceding its own
        // draw-on.
        if (at0 > 0) {
            key(timeline, nodeId, 'props.progress', 0, from, { type: 'number', ease: 'step' });
        }
        key(timeline, nodeId, 'props.progress', at0, from,
            { type: 'number', ease: ease0, h: action.h });
        // No duration is a legitimate request: `draw` without `for` is an
        // instant reveal, matching how `show` behaves.
        key(timeline, nodeId, 'props.progress', at0 + (span0 ?? 0), to,
            { type: 'number', ease: ease0, h: action.h });
        return;
    }

    // `boil` targets a drawing and writes a stepped channel the painter reads
    // as "redraw with a new seed". Resolved before the cast lookup, like
    // `draw`, because a drawing is not a cast member.
    if (action.do === 'boil') {
        buildBoil({ scene, timeline, action, shotStart, shotEnd, sceneId, diagnostics,
                    fps: timeline.fps || 24 });
        return;
    }

    // `expose` writes an exposure sheet, not a channel. Like `draw` it can
    // name a drawing rather than a cast member -- and unlike every other verb
    // it can name nothing at all, meaning "the whole shot".
    if (action.do === 'expose') {
        buildExposure({ scene, timeline, action, castMap, shotStart, shotEnd,
                        sceneId, diagnostics, fps: timeline.fps || 24 });
        return;
    }

    const cast = castMap.get(action.target);
    if (!cast) return;
    const { rootId, charName, entry } = cast;
    const char = characters[charName];
    const at = shotStart + (action.at ?? 0);
    const span = action.for ?? null;
    const ease = action.ease ?? 'smooth';
    const h = action.h;
    const anticipate = action.anticipate ?? 0;
    const overshoot = action.overshoot ?? 0;

    switch (action.do) {
        case 'pose': {
            const pose = char?.poses?.[action.pose];
            if (!pose) return;
            // `for` makes it a transition: hold the current value, then ramp.
            for (const [partId, channels] of Object.entries(pose)) {
                for (const [channel, value] of Object.entries(channels)) {
                    writeChannel({ timeline, target: `${rootId}/${partId}`,
                                   channel, value, at, span, ease, h, anticipate, overshoot });
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
            const dur = end - at;
            key(timeline, rootId, 'transform.x', at, prevX, { type: 'number', ease, h });
            key(timeline, rootId, 'transform.y', at, prevY, { type: 'number', ease, h });
            // Arcs. Two keys interpolate along a ruled straight line, which is
            // the one path nothing alive ever travels. `arc` bows the middle
            // of it; a jump, a thrown object and a shoulder-led step all need
            // this and none of them can express it with two keys.
            if (action.arc && dur > 0) {
                const [mx, my] = arcMidpoint([prevX, prevY], [to[0], to[1]], action.arc);
                key(timeline, rootId, 'transform.x', at + dur / 2, mx, { type: 'number', ease: 'smooth' });
                key(timeline, rootId, 'transform.y', at + dur / 2, my, { type: 'number', ease: 'smooth' });
            }
            if (anticipate && dur > 0) {
                const t = at + dur * ANTICIPATION_SHARE;
                key(timeline, rootId, 'transform.x', t, anticipationValue(prevX, to[0], anticipate),
                    { type: 'number', ease: 'smooth' });
                key(timeline, rootId, 'transform.y', t, anticipationValue(prevY, to[1], anticipate),
                    { type: 'number', ease: 'smooth' });
            }
            if (overshoot && dur > 0) {
                const t = at + dur * OVERSHOOT_AT;
                key(timeline, rootId, 'transform.x', t, overshootValue(prevX, to[0], overshoot),
                    { type: 'number', ease: 'smooth' });
                key(timeline, rootId, 'transform.y', t, overshootValue(prevY, to[1], overshoot),
                    { type: 'number', ease: 'smooth' });
            }
            key(timeline, rootId, 'transform.x', end, to[0], { type: 'number' });
            key(timeline, rootId, 'transform.y', end, to[1], { type: 'number' });
            break;
        }
        case 'play': {
            // Generated characters get the standard cycles for free, so a
            // film can say do:'walk' without authoring one -- and so does a
            // TRACED one, whose parts are named the same and which carries
            // `proportions` but no `generate`. Keying off `generate` alone
            // meant an uploaded character could be rigged and still refuse to
            // walk, with no diagnostic to say why.
            const spec = char?.actions?.[action.action]
                ?? ((char?.generate || char?.proportions)
                    ? generatedCycles(char)[action.action] : null);
            if (!spec) {
                diagnostics.push({
                    severity: 'warning', path: `scenes.${sceneId}.actions`,
                    message: `play: "${charName}" has no action "${action.action}". `
                        + `Known: ${[...new Set([...Object.keys(char?.actions ?? {}),
                            ...Object.keys(generatedCycles(char ?? {}))])].join(', ')}.`,
                });
            }
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
                weight: action.weight ?? 1,
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
                               channel: 'rot', value: solved.rots[i], at, span, ease, h,
                               anticipate, overshoot });
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
        /**
         * A named hand pose: `grip handR to fist`.
         *
         * The same table the 3D rig uses, via `core/art/hands.js`, so `fist`
         * is the same shape on both paths. It writes onto whichever hand
         * parts the character actually has -- a mitten rig gets the four
         * fingers' average curl on one mitt, a fingered rig gets each digit
         * -- so a film written for one detail level plays on the other
         * rather than silently doing nothing.
         */
        case 'grip': {
            const side = /^hand([LR])$/.exec(action.part ?? '')?.[1];
            if (!side) {
                diagnostics.push({
                    severity: 'warning', path: `scenes.${sceneId}.actions`,
                    message: `grip: \`part\` must be "handL" or "handR"; got `
                        + `"${action.part}".`,
                });
                return;
            }
            const amount = action.amount ?? 1;
            const angles = gripAngles(action.pose, amount);
            if (!angles) {
                diagnostics.push({
                    severity: 'warning', path: `scenes.${sceneId}.actions`,
                    message: `grip: unknown hand pose "${action.pose}". `
                        + `Known: ${HAND_POSE_NAMES.join(', ')}.`,
                });
                return;
            }
            const parts = characterParts(char ?? {});
            const have = new Set(parts.map((part) => part.id));
            // Positive `rot` swings a part's tip toward -x (see IK2D's angle
            // convention), and a hand closes toward the side the character
            // FACES -- so a character drawn facing left closes the other way
            // round, and the sign has to come from the drawing, not a guess.
            const dir = -((char?.generate?.facing ?? 1) >= 0 ? 1 : -1);
            const gripSpan = span ?? 0.3;
            let written = 0;

            /**
             * A curled finger does two things to a drawing, and which one you
             * see depends entirely on the view.
             *
             * In PROFILE the finger swings across the frame, and a rotation
             * is the whole of it. Face ON, a curling finger barely rotates in
             * the picture plane at all -- it FORESHORTENS, because it is
             * turning toward the camera, and that is why an animator draws a
             * fist rather than rotating one. Rotating a front-facing hand
             * instead produces a wrist bending sideways, which is what the
             * first version did and it looked broken.
             *
             * So the curl is split between a rotation and a scale along the
             * digit, weighted by the view the character is drawn in. The
             * scale factor is just the cosine of the accumulated angle --
             * the actual projected length of the bone.
             */
            const view = entry?.view ?? char?.view ?? 'front';
            const flat = view === 'profile' ? 0 : view === 'threeQuarter' ? 0.45 : 1;
            const shorten = (angle) => {
                const projected = Math.cos(Math.min(Math.abs(angle), Math.PI * 0.62));
                return 1 - (1 - projected) * flat;
            };
            const put = (id, value, scale = null) => {
                if (!have.has(id)) return;
                writeChannel({ timeline, target: `${rootId}/${id}`, channel: 'rot',
                               value: dir * value * (1 - flat * 0.62), at, span: gripSpan,
                               ease, h, anticipate, overshoot });
                if (scale != null) {
                    writeChannel({ timeline, target: `${rootId}/${id}`, channel: 'sy',
                                   value: scale, at, span: gripSpan, ease, h });
                }
                written++;
            };
            // `sy` compounds down the chain, so the second segment carries
            // only what the first has not already foreshortened.
            const split = (c0, total) => {
                const near = shorten(c0);
                return [near, Math.max(0.28, Math.min(1, shorten(total) / near))];
            };

            const mitt = gripMitt(action.pose, amount);
            const mittScale = split(mitt.knuckle, mitt.knuckle + mitt.tip);
            put(`mitt${side}1`, mitt.knuckle, mittScale[0]);
            put(`mitt${side}2`, mitt.tip, mittScale[1]);
            for (const digit of DIGIT_IDS) {
                const a = angles[digit];
                // The thumb's opposition is out of the picture plane and a
                // cutout cannot rotate into depth. What reads in 2D is the
                // thumb swinging across the palm, so splay carries it.
                const first = digit === 'thumb' ? a.curl[0] - a.splay * 0.8 : a.curl[0];
                const rest = a.curl[1] + a.curl[2];
                const scale = split(first, first + rest);
                put(`${digit}${side}1`, first, scale[0]);
                put(`${digit}${side}2`, rest, scale[1]);
            }
            if (!written) {
                diagnostics.push({
                    severity: 'info', path: `scenes.${sceneId}.actions`,
                    message: `grip: "${charName}" has no hand parts below the wrist; `
                        + 'set `generate.hands` to "mitten" or "fingers".',
                });
            }
            break;
        }
        case 'set': {
            if (!action.channel) return;
            const node = action.part ? `${rootId}/${action.part}` : rootId;
            // A colour channel takes a palette NAME like everything else that
            // paints. Without this, `set props.fill "aura"` wrote the literal
            // string, which is not a colour, so the canvas silently kept the
            // previous fill -- a transformation that simply never happened and
            // reported nothing.
            const value = COLOR_CHANNELS.has(action.channel) && typeof action.value === 'string'
                ? (colorOf?.(action.value) ?? action.value)
                : action.value;
            if (at > 0) seedChannel(scene, timeline, node, action.channel);
            key(timeline, node, action.channel, at, value, { ease, h });
            break;
        }
        case 'show':
        case 'hide': {
            // Same trap: an effect first shown at t=35 was visible from frame
            // one, because nothing held its starting alpha before that key.
            if (at > 0) seedChannel(scene, timeline, rootId, 'props.alpha');
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

/**
 * Instantiate a scene's `drawings` as paint nodes.
 *
 * ```json
 * "drawings": [{
 *   "id": "sketch",
 *   "at": [640, 360], "width": 900, "height": 540,
 *   "layers": [
 *     { "name": "under", "strokes": [
 *         { "path": "M 100 400 C 300 120, 600 120, 800 400",
 *           "brush": "pencil", "color": "ink", "size": 6 } ] },
 *     { "name": "ink", "blend": "multiply", "strokes": [...] }
 *   ]
 * }]
 * ```
 *
 * Then `{ "target": "sketch", "do": "draw", "for": 3 }` reveals it.
 *
 * # Why this shape
 *
 * Strokes are given as **SVG path data**, not coordinate lists. A curve is
 * one line instead of two hundred numbers, the notation is the most widely
 * published vector syntax there is, and the intent stays readable in the
 * source. For an agent writing a film that difference is decisive: a long
 * run of unstructured coordinates is exactly the output shape that drifts.
 *
 * Colours go through the scene palette like every other painted thing, so
 * `"color": "ink"` resolves to the palette entry and a drawing restyles
 * with the scene rather than carrying its own hard-coded hexes.
 *
 * The node carries the spec in `props.paint`; nothing is rasterised here.
 * Compilation stays pure -- no canvas, no kernels, no DOM -- and the
 * backend resolves the spec to a painter at mount, exactly as it already
 * resolves an `image` node's asset id to a real image.
 */
function buildDrawings(scene, spec, groupId, sceneId, scenePalette, meta, diagnostics) {
    const colorOf = (c) => (c == null ? null : (scenePalette[c] ?? c));

    for (const [i, drawing] of (spec.drawings ?? []).entries()) {
        const id = drawing.id ?? `drawing${i + 1}`;
        const nodeId = `${sceneId}/${id}`;
        const width = drawing.width ?? meta.width;
        const height = drawing.height ?? meta.height;

        const layers = (drawing.layers ?? [{ strokes: drawing.strokes ?? [] }])
            .map((layer, li) => ({
                name: layer.name ?? `layer${li + 1}`,
                blend: layer.blend ?? 'normal',
                opacity: layer.opacity ?? 1,
                visible: layer.visible ?? true,
                strokes: (layer.strokes ?? []).map((stroke) => ({
                    ...stroke,
                    color: colorOf(stroke.color) ?? '#000000',
                })),
            }));

        const strokeCount = layers.reduce((n, l) => n + l.strokes.length, 0);
        if (strokeCount === 0) {
            diagnostics.push({
                severity: 'warning', path: `scenes.${sceneId}.drawings.${id}`,
                message: 'drawing has no strokes; it will render as nothing',
            });
        }
        for (const layer of layers) {
            for (const stroke of layer.strokes) {
                if (!stroke.path && !stroke.points) {
                    diagnostics.push({
                        severity: 'warning', path: `scenes.${sceneId}.drawings.${id}`,
                        message: `a stroke in layer "${layer.name}" has neither "path" nor "points"`,
                    });
                }
            }
        }

        // The parent is `add`'s **second argument**; a `parentId` in the spec
        // is overwritten by it. Passing it in the spec parented every
        // drawing and every photo to the scene *root*, where it neither
        // inherits the scene group's alpha -- so it ignored every fade and
        // crossfade -- nor sorts by z against the scenery it belongs
        // behind. The backdrop of this film was drawn *under* the scene's
        // own background rect because of it.
        scene.add({
            id: nodeId,
            kind: 'paint',
            transform: { x: drawing.at?.[0] ?? meta.width / 2, y: drawing.at?.[1] ?? meta.height / 2 },
            z: drawing.z ?? 40,
            props: {
                // The unrasterised spec. The backend turns this into a
                // painter; the compiler never touches a canvas.
                paint: { width, height, layers, background: drawing.background ?? null },
                // Default 1, so a drawing with no `draw` action is simply
                // present -- the same way a character with no actions
                // stands in its rest pose rather than being invisible.
                progress: drawing.progress ?? 1,
                alpha: drawing.alpha ?? 1,
                w: width, h: height, cx: true, cy: true,
            },
        }, groupId);
    }
}

/**
 * Instantiate a scene's `photos` as photo-motion nodes.
 *
 * ```json
 * "photos": [{
 *   "id": "hero",
 *   "source": "portrait", "depth": "portrait_depth",
 *   "duration": 6,
 *   "tear": true,
 *   "effects": [
 *     { "type": "kenBurns", "to": { "zoom": 1.12 } },
 *     { "type": "parallax", "amplitude": 0.05 }
 *   ]
 * }]
 * ```
 *
 * This is the declarative half of `src/core/motion/PhotoMotion.js`: it is
 * the same four effects, authored in the film rather than called through
 * the API or an MCP op. A still photograph with a depth map becomes a shot.
 *
 * # It reuses `draw`, deliberately
 *
 * A photo's animation is driven by `props.progress` running 0 to 1, the
 * same channel a drawing's reveal uses, so `{ "do": "draw", "target":
 * "hero", "at": 1, "for": 4 }` retimes a photo with no new verb, no new
 * validation branch and no new compiler path. Every ease, hold and
 * transition the animation system already has therefore applies to a
 * photo for free -- including running it backwards, which is just `from:
 * 1, to: 0`.
 *
 * A photo with no `draw` action plays once across its own duration from
 * `start`, because the useful default for a photograph in a shot is that
 * it moves. That is the opposite default from a drawing, which holds at
 * `progress: 1` and only animates when asked -- a drawing with no action
 * should be *present*, a photo with no action should be *playing*.
 *
 * Nothing is rasterised here. The node carries an unrasterised spec in
 * `props.photo` and the backend resolves it to a `PhotoPainter` at mount,
 * exactly as `drawings` resolve to a `PaintPainter` and an `image` node's
 * asset id resolves to a real image. Compilation stays pure: no canvas,
 * no kernels, no DOM.
 */
function buildPhotos(scene, timeline, spec, groupId, sceneId, meta, assets, diagnostics,
                     sceneStart, sceneEnd) {
    // A photo whose progress a `draw` action drives must not also get the
    // automatic track: two sources of keys on one channel interleave into
    // a motion neither one asked for.
    const driven = new Set();
    for (const shot of spec.shots ?? []) {
        for (const a of shot.actions ?? []) {
            if (a.do === 'draw' && a.target) driven.add(a.target);
        }
    }

    for (const [i, photo] of (spec.photos ?? []).entries()) {
        const id = photo.id ?? `photo${i + 1}`;
        const nodeId = `${sceneId}/${id}`;
        const path = `scenes.${sceneId}.photos.${id}`;

        // The source is the whole point, so a missing one is an error
        // rather than a warning: a photo node with no picture renders an
        // empty rectangle and looks like a layout bug.
        const resolve = (assetId, required) => {
            if (assetId == null) return null;
            const asset = assets[assetId];
            if (!asset) {
                diagnostics.push({
                    severity: required ? 'error' : 'warning', path,
                    message: `Image asset "${assetId}" was not loaded; `
                        + (required ? 'this photo cannot render.'
                                    : 'parallax and tearing will do nothing.'),
                });
                return null;
            }
            return asset;
        };
        const source = resolve(photo.source ?? photo.image, true);
        const depth = resolve(photo.depth, false);
        if (photo.source == null && photo.image == null) {
            diagnostics.push({
                severity: 'error', path,
                message: 'photo has no "source"; nothing will render.',
            });
        }
        if (!depth && (photo.effects ?? []).some((e) => e.type === 'parallax')) {
            diagnostics.push({
                severity: 'warning', path,
                message: 'parallax needs a "depth" map; without one it is skipped.',
            });
        }

        const start = sceneStart + (photo.start ?? 0);
        // Defaults to the rest of the scene, so the common case -- one
        // photograph carrying one scene -- needs no number at all.
        const duration = photo.duration ?? Math.max(0, sceneEnd - start);

        // Second argument, as in `buildDrawings` -- see the note there.
        scene.add({
            id: nodeId,
            kind: 'photo',
            transform: { x: photo.at?.[0] ?? meta.width / 2, y: photo.at?.[1] ?? meta.height / 2 },
            z: photo.z ?? 30,
            props: {
                photo: {
                    width: photo.width ?? meta.width,
                    height: photo.height ?? meta.height,
                    source, depth,
                    effects: photo.effects ?? [],
                    duration,
                    grid: photo.grid,
                    overscan: photo.overscan,
                    depthBlur: photo.depthBlur,
                    tear: photo.tear ?? false,
                    // Throttles. A warp is the most expensive thing in a
                    // frame; see PhotoPainter. `resolution` renders smaller
                    // and scales up on draw, `step` re-renders every N
                    // seconds instead of every frame.
                    resolution: photo.resolution,
                    step: photo.step,
                },
                progress: 0,
                alpha: photo.alpha ?? 1,
                w: photo.width ?? meta.width, h: photo.height ?? meta.height,
                cx: true, cy: true,
            },
        }, groupId);

        if (!driven.has(id) && duration > 0) {
            key(timeline, nodeId, 'props.progress', start, 0, { type: 'number' });
            key(timeline, nodeId, 'props.progress', start + duration, 1, { type: 'number' });
        }
    }
}

function buildClipFromAction(clipId, name, spec) {
    const tracks = [];
    // Overlapping action: parts further down a chain arrive late. `lag` is
    // either a per-part map or one number plus an ordered `chain`, and
    // without it an author has to hand-offset every key of every trailing
    // part -- which is why a rig that CAN overlap usually does not.
    const keyed = applyOverlap(spec.keys ?? {},
                               overlapDelays(spec.lag, spec.chain ?? []));
    // `blend: 'add'` layers the cycle over whatever pose is in force instead
    // of replacing it. An overlay -- breathing, a weight shift, hair settling
    // -- must be additive or the first pose of the film silences it forever.
    const blend = spec.blend ?? 'override';
    const mask = spec.mask ?? null;
    for (const [channelPath, keys] of Object.entries(keyed)) {
        // Split at the FIRST dot: a part id never contains one, but a channel
        // can be `props.eyes`, and splitting at the last dot made the
        // `props.` branch below unreachable -- so a generated action could
        // only ever key a transform.
        const dot = channelPath.indexOf('.');
        const partId = dot < 0 ? channelPath : channelPath.slice(0, dot);
        const channel = dot < 0 ? 'y' : channelPath.slice(dot + 1);
        const first = Array.isArray(keys?.[0]) ? keys[0][1] : keys?.[0]?.v;
        const track = createTrack({
            target: partId,
            path: channel.startsWith('props.') ? channel : `transform.${channel}`,
            // A generated action may key a named shape rather than a number --
            // a blink is a swap, not a scale -- and interpolating between two
            // strings as numbers yields NaN.
            type: typeof first === 'string' ? 'discrete' : 'number',
        });
        for (const entry of keys) {
            const [t, v, ease, h] = Array.isArray(entry) ? entry : [entry.t, entry.v, entry.ease, entry.h];
            setKey(track, t, v, ease ?? 'smooth', h);
        }
        tracks.push(track);
    }
    return createClip({ id: clipId, name, duration: spec.duration,
                       loop: spec.loop ?? 'repeat', tracks, blend, mask });
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

function buildDialogue({ line, shotStart, shotEnd, sceneId, castMap, castBySpeaker,
                        voiceGains = {}, voiceDeliveries = {},
                        film, lipsyncJobs, audioCues, diagnostics }) {
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
        voiceGain: (charName ? voiceGains[charName] : null) ?? 1,
        // Rate and pitch for this character. `rate` changes the line's
        // LENGTH, so it moves the film's derived durations with it.
        delivery: (charName ? voiceDeliveries[charName] : null) ?? null,
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
    // `meta.subtitleStyle` overrides the defaults. The schema has advertised
    // a per-shot `subtitleStyle` for a while and nothing ever read one, so a
    // 1080x1920 film put its subtitles at `1920 - 64` -- inside the phone UI
    // rail, with no way to move them.
    const st = { ...DEFAULTS.subtitleStyle, ...(meta.subtitleStyle ?? {}) };
    scene.add({
        id: '__subtitle', kind: 'text',
        transform: { x: meta.width / 2, y: meta.height - st.bottomMargin },
        props: {
            text: '', font: st.font, fill: st.fill,
            stroke: st.stroke, strokeWidth: st.strokeWidth,
            // Wrap inside the frame by default, with a margin either side.
            maxWidth: st.maxWidth ?? Math.round(meta.width * 0.88),
            ...(st.lineHeight ? { lineHeight: st.lineHeight } : {}),
            align: 'center', baseline: 'alphabetic', screenSpace: true,
        },
        z: 9000,
    });
}
