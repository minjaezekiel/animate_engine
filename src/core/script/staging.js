import { samplePose, applyPose, createPoseBaseline, resetPose } from '../anim/Evaluator.js';
import { characterParts, filmShots } from './compile.js';
import { applyToPoint } from '../math/mat2d.js';

/**
 * Staging checks: is what you authored actually on screen?
 *
 * The compiler validates structure and says nothing about composition, so a
 * film can report zero diagnostics while a character stands below the ground,
 * a prop floats two hundred pixels off the thing it belongs to, and the
 * camera climbs out of frame faster than the actor walks. All three of those
 * happened in `demo/mountain.json` and all three cost a rendered contact
 * sheet to find.
 *
 * This runs after the scene and timeline exist -- `validateFilm` is
 * pre-compile and film-only, so it has no world positions to test.
 *
 * Two details decide whether the numbers mean anything:
 *   - Camera track values are centre-relative PLUS the centre, because
 *     `buildCamera` writes `centre.x + authored.x`. A track value of 640 is
 *     authored 0 at width 1280.
 *   - The MCP `loadFilm` op drops `path` and filters `info`, so every
 *     diagnostic here is a `warning` with the location folded into `message`.
 */

const CHANNELS = [
    ['x', 'transform.x'], ['y', 'transform.y'], ['zoom', 'props.zoom'],
];

/** Where a character's parts reach, relative to its cast root, at rest. */
export function measureCharacter(parts) {
    const byId = new Map(parts.map((p) => [p.id, p]));
    const offsetOf = (part) => {
        let x = 0, y = 0;
        for (let p = part; p; p = p.parent ? byId.get(p.parent) : null) {
            const pivot = p.pivot ?? [0, 0];
            x += (p.at?.[0] ?? 0) + pivot[0];
            y += (p.at?.[1] ?? 0) + pivot[1];
            if (!p.parent) break;
        }
        return [x, y];
    };

    let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity;
    const take = (ox, oy, e) => {
        if (!e) return;
        left = Math.min(left, ox + e.left);
        right = Math.max(right, ox + e.right);
        top = Math.min(top, oy + e.top);
        bottom = Math.max(bottom, oy + e.bottom);
    };
    for (const part of parts) {
        const [ox, oy] = offsetOf(part);
        const sw = part.strokeWidth ?? 0;
        take(ox, oy, shapeExtent(part.shape, sw));
        // A part may draw through a swap set instead of a single `shape` --
        // every procedural head feature does -- and through stacked layers for
        // cel tones. Measuring only `part.shape` lost the whole head, so the
        // rig measured as a headless body and every frame check that used it
        // was wrong by a head.
        for (const set of Object.values(part.swap ?? {})) {
            for (const shape of Object.values(set.shapes ?? set)) {
                take(ox, oy, shapeExtent(shape, sw));
            }
        }
        for (const layer of part.shapes ?? []) {
            const lx = ox + (layer.at?.[0] ?? 0), ly = oy + (layer.at?.[1] ?? 0);
            const lsw = layer.strokeWidth ?? sw;
            take(lx, ly, shapeExtent(layer.shape, lsw));
            for (const set of Object.values(layer.swap ?? {})) {
                for (const shape of Object.values(set.shapes ?? set)) take(lx, ly, shapeExtent(shape, lsw));
            }
        }
    }
    if (!Number.isFinite(top)) return { top: 0, bottom: 0, left: 0, right: 0 };
    return { top, bottom, left, right };
}

/** Local bounds of one shape, in its own coordinates. */
function shapeExtent(shape, strokeWidth) {
    if (!shape) return null;
    const pad = strokeWidth / 2;
    switch (shape.kind) {
        case 'ellipse':
            return { left: -(shape.rx ?? 1) - pad, right: (shape.rx ?? 1) + pad,
                     top: -(shape.ry ?? 1) - pad, bottom: (shape.ry ?? 1) + pad };
        case 'rect': {
            const w = shape.w ?? 0, h = shape.h ?? 0;
            return { left: (shape.cx ? -w / 2 : 0) - pad, right: (shape.cx ? w / 2 : w) + pad,
                     top: (shape.cy ? -h / 2 : 0) - pad, bottom: (shape.cy ? h / 2 : h) + pad };
        }
        case 'image': {
            const w = shape.w ?? 0, h = shape.h ?? 0;
            return { left: shape.cx ? -w / 2 : 0, right: shape.cx ? w / 2 : w,
                     top: shape.cy ? -h / 2 : 0, bottom: shape.cy ? h / 2 : h };
        }
        case 'path': return pathExtent(shape.d, pad);
        default: return null;
    }
}

/**
 * Bounds of an SVG path, from its coordinate pairs.
 *
 * ponytail: the numbers in `d`, not a real path parse. Control points lie
 * outside the drawn curve, so this over-estimates slightly -- which is the
 * right direction for a check that warns about things leaving the frame.
 */
function pathExtent(d, pad) {
    if (!d) return null;
    const nums = String(d).match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
    if (!nums || nums.length < 2) return null;
    let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity;
    for (let i = 0; i + 1 < nums.length; i += 2) {
        const x = Number(nums[i]), y = Number(nums[i + 1]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    if (!Number.isFinite(left)) return null;
    return { left: left - pad, right: right + pad, top: top - pad, bottom: bottom + pad };
}

/** The ground height under x, from a scene's declared ground. */
export function groundAt(ground, x) {
    if (!ground) return null;
    if (typeof ground.y === 'number') return ground.y;
    const pts = ground.points;
    if (!Array.isArray(pts) || pts.length === 0) return null;
    if (x <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) {
        if (x <= pts[i][0]) {
            const [x0, y0] = pts[i - 1];
            const [x1, y1] = pts[i];
            const span = x1 - x0;
            const u = span === 0 ? 0 : (x - x0) / span;
            return y0 + (y1 - y0) * u;
        }
    }
    return pts[pts.length - 1][1];
}

const trackOf = (timeline, path) => timeline._index?.get(`__camera\u0000${path}`);

function cameraAt(timeline, t, meta, trackValueAt) {
    const read = (path, fallback) => {
        const track = trackOf(timeline, path);
        return track ? trackValueAt(track, t) : fallback;
    };
    const zoom = read('props.zoom', 1) || 1;
    const cx = read('transform.x', meta.width / 2);
    const cy = read('transform.y', meta.height / 2);
    const w = meta.width / zoom;
    const h = meta.height / zoom;
    return { left: cx - w / 2, right: cx + w / 2, top: cy - h / 2, bottom: cy + h / 2, zoom };
}

/**
 * Check every shot's composition and return diagnostics.
 *
 * `trackValueAt` is injected rather than imported to keep this module free of
 * a cycle with the animation layer.
 */

/**
 * Framing, measured the way a camera department measures it: how much of the
 * visible frame height one head occupies.
 *
 * A shot declares what it is meant to be and the check says whether it is.
 * Without this, "close-up" is an intention living only in a shot id -- the
 * reference film declared five of them and every one compiled clean while
 * actually framing both characters head to foot, because nothing compared the
 * zoom against the subject.
 *
 * Head height rather than body height, because a close-up crops the body: a
 * body-based ratio stops meaning anything exactly where it is needed most.
 */
export const FRAMINGS = {
    wide:   { min: 0.04, max: 0.15, says: 'the whole figure with room around it' },
    medium: { min: 0.13, max: 0.30, says: 'roughly waist up' },
    close:  { min: 0.26, max: 0.75, says: 'head and shoulders filling the frame' },
};
export const FRAMING_NAMES = Object.keys(FRAMINGS);

/** One head's height in scene units, from the proportions a character declares. */
export function headHeight(char) {
    const p = char?.proportions ?? {};
    const height = p.height ?? 180;
    const ratio = p.headRatio ?? (1 / (p.heads ?? (char?.generate?.build === 'child' ? 4.8 : 6.2)));
    return height * ratio;
}

export function analyseStaging(compiled, film, { samplesPerShot = 5, trackValueAt } = {}) {
    const d = [];
    if (!compiled?.scene || !compiled.timeline || !trackValueAt) return d;

    const { scene, timeline, meta } = compiled;
    const baseline = createPoseBaseline(scene, timeline);
    const shots = filmShots(film);
    const extents = new Map();
    const measureOf = (charName) => {
        if (!extents.has(charName)) {
            extents.set(charName, measureCharacter(characterParts(film.characters?.[charName] ?? {})));
        }
        return extents.get(charName);
    };

    // Cast roots carry tags ['cast', charName]; that is how they are found
    // without re-deriving the id convention.
    const casts = [...scene.byId.values()]
        .filter((n) => n.tags?.includes('cast'))
        .map((n) => {
            const [sceneId, as] = String(n.id).split('/');
            // `n.id` is "<scene>/<cast>", which reads like a body part in a
            // message about feet. Name the cast member instead.
            return { node: n, charName: n.tags[1], sceneId, as: as ?? n.id };
        });

    const seenOffFrame = new Set();
    const seenGround = new Set();
    const seenFraming = new Set();

    try {
        for (const span of shots) {
            const ground = span.scene.ground ?? null;
            for (let i = 0; i < samplesPerShot; i++) {
                // Midpoints, so a sample never lands exactly on a cut. That
                // instant belongs to the outgoing shot's camera while the
                // incoming shot's cast is already visible, and every sample
                // there is a false alarm.
                const t = span.start + (span.duration * (i + 0.5)) / samplesPerShot;
                resetPose(scene, baseline);
                applyPose(scene, samplePose(timeline, t));
                scene.invalidateAll();

                const frame = cameraAt(timeline, t, meta, trackValueAt);

                // Visibility is inherited: a film with four scenes keeps all
                // four casts in one graph and hides three of them with an
                // alpha on the scene group. `drawOrder` already accumulates
                // that product and prunes transparent subtrees, so ask it
                // rather than re-deriving it from the cast node alone.
                const onScreen = new Map();
                for (const { node, alpha } of scene.drawOrder()) onScreen.set(node.id, alpha);

                // Declared framing, checked against the zoom that is actually
                // in force. `on` names the subject; with one cast member in
                // frame it is unambiguous and may be left out.
                const wanted = span.shot?.framing;
                if (wanted && !seenFraming.has(span.shotId)) {
                    const band = FRAMINGS[wanted];
                    if (!band) {
                        seenFraming.add(span.shotId);
                        d.push({
                            severity: 'warning', path: `scenes.${span.sceneId}.shots.${span.shotId}`,
                            message: `Framing: unknown framing "${wanted}" in shot ${span.shotId}. `
                                + `Known: ${FRAMING_NAMES.join(', ')}.`,
                        });
                    } else {
                        // With no `on`, measure the LARGEST head in frame. For
                        // a wide that is the right question anyway -- "is even
                        // the nearest figure small?" -- so only a shot that
                        // genuinely needs to name its subject has to.
                        const inScene = casts.filter((c) => c.sceneId === span.sceneId
                            && (onScreen.get(c.node.id) ?? 0) >= 0.5);
                        const headOf = (c) => headHeight(film.characters?.[c.charName])
                            * (Math.abs(scene.worldMatrix(c.node.id)[0]) || 1);
                        const subject = span.shot.on
                            ? inScene.find((c) => c.as === span.shot.on)
                            : inScene.slice().sort((a, b) => headOf(b) - headOf(a))[0];
                        const subjectName = subject?.as ?? span.shot.on;
                        if (span.shot.on && !subject) {
                            seenFraming.add(span.shotId);
                            d.push({
                                severity: 'warning', path: `scenes.${span.sceneId}.shots.${span.shotId}`,
                                message: `Framing: shot ${span.shotId} is framed on "${span.shot.on}", `
                                    + `who is not on screen here.`,
                            });
                        } else if (subject) {
                            const scale = Math.abs(scene.worldMatrix(subject.node.id)[0]) || 1;
                            const head = headHeight(film.characters?.[subject.charName]) * scale;
                            const visible = frame.bottom - frame.top;
                            const ratio = visible > 0 ? head / visible : 0;
                            if (ratio < band.min || ratio > band.max) {
                                seenFraming.add(span.shotId);
                                // The zoom that WOULD land it, placed low in
                                // the band rather than at its centre: an
                                // author who cannot see the frame needs a
                                // number to use, and the middle of "close" is
                                // a tighter shot than anyone means by it.
                                const target = band.min + (band.max - band.min) * 0.3;
                                const suggest = (meta.height * target) / head;
                                d.push({
                                    severity: 'warning',
                                    path: `scenes.${span.sceneId}.shots.${span.shotId}`,
                                    message: `Framing: shot ${span.shotId} declares "${wanted}" `
                                        + `(${band.says}) on "${subjectName}", but one head is `
                                        + `${(ratio * 100).toFixed(0)}% of the frame height at `
                                        + `${t.toFixed(1)}s -- "${wanted}" wants `
                                        + `${(band.min * 100).toFixed(0)}-${(band.max * 100).toFixed(0)}%. `
                                        + `Try zoom ${suggest.toFixed(2)}.`,
                                });
                            }
                        }
                    }
                }

                for (const { node, charName, sceneId, as } of casts) {
                    // Only this shot's own scene. During a crossfade two
                    // scenes share one camera, so the incoming cast is on
                    // screen under the outgoing shot's framing -- a real
                    // property of crossfades, and not this shot's staging to
                    // answer for.
                    if (sceneId !== span.sceneId) continue;
                    // Within the scene, alpha still matters: `do:'hide'`
                    // means the audience is not reading that character.
                    if ((onScreen.get(node.id) ?? 0) < 0.5) continue;
                    const m = scene.worldMatrix(node.id);
                    const [wx, wy] = applyToPoint(m, 0, 0);
                    const scale = Math.abs(m[0]) || 1;
                    const e = measureOf(charName);
                    const box = {
                        left: wx + e.left * scale, right: wx + e.right * scale,
                        top: wy + e.top * scale, bottom: wy + e.bottom * scale,
                    };

                    const outside = box.right < frame.left || box.left > frame.right
                        || box.bottom < frame.top || box.top > frame.bottom;
                    // A shot that names its subject is allowed to exclude
                    // everyone else -- that is what a close-up IS, and
                    // shot/reverse-shot is the dominant idiom of dialogue
                    // animation. Without this the reference two-hander
                    // reported four "errors" for working exactly as written.
                    const subjectOnly = span.shot?.on ?? (span.shot?.framing === 'close'
                        || span.shot?.framing === 'medium');
                    const isSubject = span.shot?.on ? as === span.shot.on : false;
                    if (subjectOnly && !isSubject) continue;
                    const key = `${span.shotId}:${node.id}`;
                    if (outside && !seenOffFrame.has(key)) {
                        seenOffFrame.add(key);
                        d.push({
                            severity: 'warning', path: `scenes.${span.sceneId}.shots.${span.shotId}`,
                            message: `Staging: "${as}" is outside the camera frame `
                                + `at ${t.toFixed(1)}s in shot ${span.shotId}. Cast box is `
                                + `[${box.left.toFixed(0)},${box.top.toFixed(0)} to `
                                + `${box.right.toFixed(0)},${box.bottom.toFixed(0)}], frame is `
                                + `[${frame.left.toFixed(0)},${frame.top.toFixed(0)} to `
                                + `${frame.right.toFixed(0)},${frame.bottom.toFixed(0)}].`,
                        });
                    }

                    if (ground && !seenGround.has(key)) {
                        const gy = groundAt(ground, wx);
                        if (gy != null && Math.abs(box.bottom - gy) > (ground.tolerance ?? 12)) {
                            seenGround.add(key);
                            d.push({
                                severity: 'warning', path: `scenes.${span.sceneId}.shots.${span.shotId}`,
                                message: `Staging: "${as}" has its feet at y=`
                                    + `${box.bottom.toFixed(0)} but the ground at x=${wx.toFixed(0)} `
                                    + `is y=${gy.toFixed(0)} (${(box.bottom - gy).toFixed(0)}px `
                                    + `${box.bottom > gy ? 'below' : 'above'}) at ${t.toFixed(1)}s `
                                    + `in shot ${span.shotId}.`,
                            });
                        }
                    }
                }
            }
        }
    } finally {
        resetPose(scene, baseline);
        scene.invalidateAll();
    }

    return d;
}

/**
 * How much the cast actually moves, shot by shot.
 *
 * Added after a sixty-second fight rendered with **77% of its frames exactly
 * frozen** while every other check reported clean. The camera shake made the
 * footage look busy -- raw frame-to-frame luma change during the punch combo
 * measured 16.2, against 0.85 for a dialogue scene in the reference clip --
 * but with the camera locked the characters' own median was 0.00. The film
 * was a slideshow with a vibrating lens, and nothing in the engine said so.
 *
 * Measured on node world positions rather than pixels: it is exact, it needs
 * no renderer, and it cannot be fooled by the camera, which is the entire
 * point.
 *
 * `moving` counts frames where the average part travels at least
 * `visibleMove` px. Below that a viewer reads the frame as held, whatever the
 * numbers say.
 */
export function analyseMotion(compiled, film, { fps = null, visibleMove = 0.3 } = {}) {
    const { scene, timeline, meta } = compiled ?? {};
    if (!scene || !timeline) return { frames: 0, shots: [], frozen: 0, moving: 0 };
    const rate = fps ?? meta?.fps ?? 24;
    const frames = Math.round((meta?.duration ?? timeline.duration ?? 0) * rate);
    const baseline = createPoseBaseline(scene, timeline);
    const ids = [...scene.byId.values()]
        .filter((n) => n.kind !== 'group' && n.kind !== 'camera'
            && String(n.id).split('/').length >= 3 && !String(n.id).includes('/set'))
        .map((n) => n.id);
    if (!ids.length || frames < 2) return { frames: 0, shots: [], frozen: 0, moving: 0 };

    // Compare DRAWINGS, not frames. On twos every second frame is identical by
    // construction, so a frame-based measure would score the anime standard as
    // 50% frozen and punish exactly the texture it is there to encourage.
    const steps = timeline.steps ?? [];
    const globalStep = timeline.step ?? 0;
    const stepAt = (t) => {
        for (const span of steps) if (t >= span.start && t < span.end) return span.step ?? 0;
        return globalStep;
    };
    const perFrame = [];
    let prev = null;
    let lastDrawn = null;
    for (let f = 0; f < frames; f++) {
        const t = f / rate;
        const step = stepAt(t);
        const drawing = step > 1 ? Math.floor(f / step) : f;
        if (lastDrawn === drawing) continue;
        lastDrawn = drawing;
        resetPose(scene, baseline);
        applyPose(scene, samplePose(timeline, t));
        const cur = ids.map((id) => applyToPoint(scene.worldMatrix(id), 0, 0));
        if (prev) {
            let sum = 0;
            for (let i = 0; i < cur.length; i++) {
                sum += Math.hypot(cur[i][0] - prev[i][0], cur[i][1] - prev[i][1]);
            }
            perFrame.push({ t, v: sum / cur.length });
        }
        prev = cur;
    }
    const frozen = perFrame.filter((x) => x.v < 1e-3).length / perFrame.length;
    const moving = perFrame.filter((x) => x.v >= visibleMove).length / perFrame.length;
    const shots = filmShots(film).map((sh) => {
        const seg = perFrame.filter((x) => x.t >= sh.start && x.t < sh.end).map((x) => x.v);
        if (!seg.length) return { shotId: sh.shotId, frozen: 1, moving: 0, median: 0 };
        const sorted = [...seg].sort((x, y) => x - y);
        return {
            shotId: sh.shotId, sceneId: sh.sceneId,
            frozen: seg.filter((v) => v < 1e-3).length / seg.length,
            moving: seg.filter((v) => v >= visibleMove).length / seg.length,
            median: sorted[Math.floor(sorted.length / 2)],
        };
    });
    return { frames: perFrame.length, frozen, moving, shots, perFrame };
}

/**
 * Report shots that are held when they are meant to be moving.
 *
 * Deliberately conservative: a held drawing is correct in this idiom and most
 * of a dialogue film is held. What is reported is a shot that is *entirely*
 * frozen, because no drawing stays perfectly still in any animation worth the
 * name -- the reference dialogue clip is frozen in 2% of its frames; the fight
 * that prompted this was frozen in 77%.
 */
export function checkMotion(compiled, film, options = {}) {
    const d = [];
    // 0.95, not 1.0: a shot whose only movement is the single frame its pose
    // lands on is a held shot, and that is exactly what a shaking camera over
    // a static pose measures at.
    const { frozenShot = 0.95 } = options;
    const report = analyseMotion(compiled, film, options);
    for (const shot of report.shots) {
        if (shot.frozen >= frozenShot) {
            d.push({
                severity: 'warning', path: `scenes.${shot.sceneId}.shots.${shot.shotId}`,
                message: `Motion: shot ${shot.shotId} is completely still -- `
                    + `${(shot.frozen * 100).toFixed(0)}% of its frames have zero cast movement. `
                    + 'A camera move or shake will make it look busy while nothing is animating. '
                    + 'Give it an idle clip, or a pose that changes across the shot.',
            });
        }
    }
    if (report.frames && report.frozen >= 0.5) {
        d.push({
            severity: 'warning', path: 'scenes',
            message: `Motion: ${(report.frozen * 100).toFixed(0)}% of the film's frames have no `
                + 'cast movement at all. For comparison a held dialogue scene runs near 2%.',
        });
    }
    return d;
}
