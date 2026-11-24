/**
 * Transitions for the 3D path: the spaces at the joints.
 *
 * # Why this file exists
 *
 * `compile.js` mentions transitions in twenty-two places. `compile3d.js`
 * mentioned them in none, so every cut in every 3D film in this repository
 * was a hard cut -- including all nine boundaries of a finished 65-second
 * film. Worse, nothing *rejected* a `transitionIn` on a 3D scene: the key was
 * read by nothing, which is this codebase's most expensive defect shape (see
 * `docs/19-CONTRACTS-AND-BUDGET.md`).
 *
 * # Why the 2D implementation does not port
 *
 * 2D does it two ways and both rely on properties 3D does not have.
 *
 * Colour fades are a full-frame screen-space `rect` SCENE NODE at `z: 10000`,
 * which works because the 2D backend is a painter. Crossfades are scene-alpha
 * ramps: both scenes exist at once with complementary alphas.
 *
 * In 3D the second one is not a dissolve at all. Ramping material opacity
 * across a scene makes it *translucent* -- during the overlap you see the
 * stars through the planet -- because alpha blending in a depth-sorted
 * renderer is transparency, not compositing. And more fundamentally:
 *
 *   A 3D crossfade needs the outgoing and the incoming CAMERA at the same
 *   instant, and a track holds one value per channel per time. One camera
 *   cannot be in two places at t.
 *
 * That makes a true crossfade a data-model problem, not a rendering one, and
 * it is why it is tier 2 (two cameras, two render targets, during the overlap
 * only) rather than part of this module.
 *
 * # What this module is
 *
 * Tier 1: everything that can be done by drawing ON the finished frame, which
 * for a dip to colour, a wipe and an iris is all of it. The composite canvas
 * built for the overlay in Phase 39 already hands us a 2D context over the
 * post-processed frame, so these cost one `fillRect` per frame, touch no
 * material, no light and no scene graph, and -- because they are baked into
 * the frame before it reaches a sink -- appear in MP4, WebM and a PNG
 * sequence alike with no per-sink code.
 *
 * Tier 3, `continue`, is in `compile3d.js` instead, because it is not drawn:
 * it is the transition that is not one. Rather than dissolving a cut, it
 * eases the camera into the incoming framing before the cut arrives, so there
 * is no join to hide. One camera, ordinary keys, zero render cost, and for
 * explainer work it is usually the right answer.
 *
 * Everything here is pure arithmetic over numbers and returns the same
 * primitive op list `overlayAt` returns, so a transition is assertable in
 * Node with no browser, no GPU and no render.
 */
import { easeProgress } from '../anim/easing.js';
import { parseColor } from './textures.js';

/**
 * The kinds the 3D path implements. Deliberately NOT merged into
 * `schema.js`'s `TRANSITION_KINDS`, which is the 2D list: adding `wipe` there
 * would make the 2D validator accept a kind the 2D compiler ignores, which is
 * the exact defect this module was written to remove.
 */
export const TRANSITION_KINDS_3D = [
    'none', 'fade', 'dip', 'wipe', 'iris', 'continue', 'crossfade',
];

/** Matches `DEFAULTS.transitionDuration` in `schema.js`, so both paths agree. */
export const TRANSITION_DURATION = 0.8;
const TRANSITION_COLOR = '#000000';
/** Half a frame at 24 fps. Below this a transition cannot be seen at all. */
const MIN_DURATION = 1 / 48;
const MODES = ['in', 'out', 'dip'];
const DIRS = ['left', 'right', 'up', 'down'];

const round = (v) => +v.toFixed(4);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** `#rrggbbaa`, with the alpha replaced. An invalid colour reads magenta. */
function hexWithAlpha(color, alpha) {
    const [r, g, b] = parseColor(color);
    const h = (v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}${h(alpha)}`;
}

/**
 * Collect every declared transition into one list of boundaries.
 *
 * Two declaration sites, each with one meaning:
 *
 *   - `shot.transition` -- the boundary where this shot BEGINS.
 *   - `scene.transitionIn` / `scene.transitionOut` -- the 2D vocabulary,
 *     accepted so that a film document reads the same on both paths.
 *
 * A scene's `transitionIn` and its first shot's `transition` describe the
 * same instant. The shot wins, because it is the more specific statement, and
 * the collision is reported rather than resolved silently.
 */
export function normalizeTransitions(film = {}, shots = [], warn = () => {},
                                     { duration = null } = {}) {
    if (!shots.length) return [];
    const filmEnd = duration ?? shots[shots.length - 1].end;
    const byTime = new Map();

    const declare = (spec, at, where, specific) => {
        if (!spec) return;
        const t = round(at);
        const existing = byTime.get(t);
        if (existing && existing.specific && !specific) {
            warn(`transition at ${t}s is declared twice; `
                 + `'${where}' is ignored in favour of '${existing.where}'`, where);
            return;
        }
        if (existing && !existing.specific && specific) {
            warn(`transition at ${t}s is declared twice; `
                 + `'${existing.where}' is ignored in favour of '${where}'`, existing.where);
        } else if (existing) {
            warn(`transition at ${t}s is declared twice; '${existing.where}' is ignored`,
                 existing.where);
        }
        byTime.set(t, { spec, at: t, where, specific });
    };

    // Scenes first, shots second, so a shot overwrites its scene's edge.
    let i = 0;
    for (const [si, sceneSpec] of (film.scenes ?? []).entries()) {
        const list = sceneSpec.shots ?? [];
        if (!list.length) continue;
        const first = shots[i];
        const last = shots[i + list.length - 1];
        i += list.length;
        if (!first || !last) break;
        const sid = sceneSpec.id ?? `s${si + 1}`;
        declare(sceneSpec.transitionIn, first.start, `scenes.${sid}.transitionIn`, false);
        declare(sceneSpec.transitionOut, last.end, `scenes.${sid}.transitionOut`, false);
    }
    for (const s of shots) {
        declare(s.shot?.transition, s.start, `${s.shotId}.transition`, true);
    }

    const out = [];
    for (const { spec, at, where } of [...byTime.values()].sort((a, b) => a.at - b.at)) {
        const tr = normalizeOne(spec, at, where, shots, filmEnd, warn);
        if (tr) out.push(tr);
    }
    return out;
}

function normalizeOne(spec, at, where, shots, filmEnd, warn) {
    const raw = typeof spec === 'string' ? { kind: spec } : spec;
    let kind = raw.kind ?? 'fade';
    if (!TRANSITION_KINDS_3D.includes(kind)) {
        warn(`unknown transition kind '${kind}'; treated as 'fade'. `
             + `Known: ${TRANSITION_KINDS_3D.join(', ')}`, `${where}.kind`);
        kind = 'fade';
    }
    if (kind === 'none') return null;
    /**
     * `crossfade` is tier 2 -- two cameras rendered into two targets during
     * the overlap -- and is not built. It falls back to a dip because a dip is
     * the closest thing that reads as a soft join, and it says so LOUDLY:
     * Phase 33 shipped twelve films in the wrong voice because a fallback was
     * silent, and that lesson is not path-specific.
     */
    if (kind === 'crossfade') {
        warn('crossfade is not implemented on the 3D path yet (it needs two '
             + 'cameras and two render targets); rendered as a dip to colour. '
             + 'See docs/pending/35-3D-TRANSITIONS.md', `${where}.kind`);
        kind = 'dip';
    }

    const incoming = shots.find((s) => round(s.start) === at) ?? null;
    const outgoing = shots.find((s) => round(s.end) === at) ?? null;

    let mode = raw.mode ?? null;
    if (mode && !MODES.includes(mode)) {
        warn(`unknown transition mode '${mode}'; known: ${MODES.join(', ')}`, `${where}.mode`);
        mode = null;
    }
    if (!mode) mode = at <= 0 ? 'in' : (round(filmEnd) === at ? 'out' : 'dip');
    // `continue` draws nothing, so an 'in'/'out'/'dip' reading of it is noise
    // in every diagnostic that prints a transition. Name what it actually is.
    if (kind === 'continue') mode = 'camera';

    /**
     * Clamp, because `retimeToAudio` grows a shot to fit its real take AFTER
     * the author picked this number. A transition declared as a constant can
     * therefore end up longer than the shot it overlaps, and the symptom is a
     * dip that never finishes opening with nothing anywhere reporting it --
     * the same shape as Phase 33's 3.5s minimum shot length manufacturing its
     * own gap under a two-word line.
     *
     * The cap is the shorter of the two shots the boundary joins, so each
     * half of a dip can never eat more than half of the shot it sits in.
     */
    const room = Math.min(...[outgoing?.duration, incoming?.duration]
        .filter((v) => typeof v === 'number'));
    let d = raw.duration ?? TRANSITION_DURATION;
    if (Number.isFinite(room) && d > room) {
        warn(`transition is ${d}s but the shorter of the shots it joins is `
             + `${round(room)}s; clamped. A transition longer than its shot never `
             + 'finishes, and nothing downstream would have reported it',
             `${where}.duration`);
        d = room;
    }
    if (d < MIN_DURATION) {
        warn(`transition duration ${d}s is below half a frame; treated as a hard cut`,
             `${where}.duration`);
        return null;
    }

    let dir = raw.dir ?? 'left';
    if (kind === 'wipe' && !DIRS.includes(dir)) {
        warn(`unknown wipe direction '${dir}'; known: ${DIRS.join(', ')}`, `${where}.dir`);
        dir = 'left';
    }

    return {
        at, kind, mode, duration: round(d),
        color: raw.color ?? TRANSITION_COLOR,
        ease: raw.ease ?? 'linear',
        dir,
        soft: raw.soft ?? 0.06,
        centre: raw.centre ?? raw.center ?? [0.5, 0.5],
        from: outgoing?.shotId ?? null,
        to: incoming?.shotId ?? null,
        where,
    };
}

/**
 * How much of the frame the transition colour covers at t: 0 = picture,
 * 1 = colour. Outside the window it is 0, so a transition is exactly as long
 * as it says it is.
 */
export function coverAt(tr, t) {
    const d = tr.duration;
    if (!d || d <= 0) return 0;
    if (tr.kind === 'continue') return 0;
    let u;
    if (tr.mode === 'in') {
        u = (t - tr.at) / d;
        if (u < 0 || u > 1) return 0;
        return 1 - easeProgress(tr.ease, clamp01(u));
    }
    if (tr.mode === 'out') {
        u = (t - (tr.at - d)) / d;
        if (u < 0 || u > 1) return 0;
        return easeProgress(tr.ease, clamp01(u));
    }
    // dip: out over the half before the cut, in over the half after.
    const h = d / 2;
    if (t < tr.at - h || t > tr.at + h) return 0;
    u = t <= tr.at ? (t - (tr.at - h)) / h : 1 - (t - tr.at) / h;
    return easeProgress(tr.ease, clamp01(u));
}

/**
 * The transition covering t, with its coverage -- for `digest`, so an agent
 * can see that a transition is happening for a handful of tokens instead of
 * a screenshot.
 */
export function blendAt(list, t) {
    for (const tr of list ?? []) {
        const cover = coverAt(tr, t);
        if (cover > 0) {
            return { kind: tr.kind, mode: tr.mode, cover: round(cover),
                     at: tr.at, from: tr.from, to: tr.to };
        }
    }
    return null;
}

/**
 * Draw ops for every transition active at t, in the same vocabulary
 * `overlayAt` emits, so one renderer executes both.
 *
 * These are drawn LAST -- over the overlay's type, not under it. A subtitle
 * that stays legible through a fade to black is a defect, and the draw order
 * is the whole fix.
 */
export function transitionOps(list, t, { width, height }) {
    const ops = [];
    for (const tr of list ?? []) {
        const cover = coverAt(tr, t);
        if (cover <= 0) continue;
        if (tr.kind === 'wipe') ops.push(...wipeOps(tr, cover, width, height));
        else if (tr.kind === 'iris') ops.push(...irisOps(tr, cover, width, height));
        else ops.push({ op: 'rect', x: 0, y: 0, w: width, h: height,
                        fill: tr.color, alpha: cover });
    }
    return ops;
}

/**
 * A band of colour sweeping across the frame, with a soft leading edge.
 *
 * The edge travels to `cover * (span + soft)` rather than `cover * span`, so
 * at cover = 1 the gradient has passed the far side and the frame is actually
 * covered. Stopping at `span` leaves a translucent strip down one edge for
 * the whole of the hold -- visible, and invisible to any check that only
 * looks at the middle of the frame.
 */
function wipeOps(tr, cover, width, height) {
    const vertical = tr.dir === 'up' || tr.dir === 'down';
    const span = vertical ? height : width;
    const soft = Math.max(1, tr.soft * span);
    const edge = cover * (span + soft);
    const solid = Math.max(0, edge - soft);
    const from = hexWithAlpha(tr.color, 1);
    const to = hexWithAlpha(tr.color, 0);
    const ops = [];
    // `left` means the colour enters from the left and sweeps right.
    const forward = tr.dir === 'left' || tr.dir === 'up';
    if (vertical) {
        const y0 = forward ? 0 : height - solid;
        if (solid > 0) ops.push({ op: 'rect', x: 0, y: y0, w: width, h: solid,
                                  fill: tr.color, alpha: 1 });
        const gy = forward ? solid : height - edge;
        ops.push({ op: 'grad', x: 0, y: gy, w: width, h: Math.min(soft, height - gy),
                   x1: 0, y1: forward ? gy : gy + soft, x2: 0, y2: forward ? gy + soft : gy,
                   from, to, alpha: 1 });
    } else {
        const x0 = forward ? 0 : width - solid;
        if (solid > 0) ops.push({ op: 'rect', x: x0, y: 0, w: solid, h: height,
                                  fill: tr.color, alpha: 1 });
        const gx = forward ? solid : width - edge;
        ops.push({ op: 'grad', x: gx, y: 0, w: Math.min(soft, width - gx), h: height,
                   x1: forward ? gx : gx + soft, y1: 0, x2: forward ? gx + soft : gx, y2: 0,
                   from, to, alpha: 1 });
    }
    return ops;
}

/**
 * Colour everywhere except a shrinking circle.
 *
 * The radius runs from the half-diagonal, not the half-width: at cover = 0
 * the hole has to contain the whole frame or the corners stay tinted through
 * every held frame of the shot.
 */
function irisOps(tr, cover, width, height) {
    const cx = tr.centre[0] * width;
    const cy = tr.centre[1] * height;
    const rMax = Math.hypot(Math.max(cx, width - cx), Math.max(cy, height - cy));
    return [{ op: 'hole', x: 0, y: 0, w: width, h: height,
              cx, cy, r: (1 - cover) * rMax, fill: tr.color, alpha: 1 }];
}

/**
 * Findings a transition list can produce without rendering anything.
 *
 * Every one of these is a defect that a finished film would show and no
 * existing check would mention.
 */
export function checkTransitions(list = [], shots = [], { duration = null } = {}) {
    const found = [];
    const filmEnd = duration ?? (shots.length ? shots[shots.length - 1].end : 0);
    const sorted = [...list].sort((a, b) => a.at - b.at);

    for (const [i, tr] of sorted.entries()) {
        /**
         * An 'out' that is not at the end of the film, with no 'in' after it,
         * leaves the frame at full colour and then POPS back to picture at
         * the boundary -- because `coverAt` is 0 outside its own window and
         * nothing is holding the colour.
         */
        if (tr.mode === 'out' && round(tr.at) !== round(filmEnd)) {
            const next = sorted[i + 1];
            const paired = next && next.mode === 'in' && round(next.at) === round(tr.at);
            if (!paired) {
                found.push({ severity: 'warning', path: tr.where,
                    message: `'${tr.where}' fades OUT to ${tr.color} at ${tr.at}s, which is `
                        + 'not the end of the film, and nothing fades back in. The frame '
                        + 'will snap from solid colour to picture. Use kind "dip", or add '
                        + 'a matching transition with mode "in"' });
            }
        }
        const prev = sorted[i - 1];
        if (prev) {
            const gap = tr.at - prev.at;
            const span = (prev.mode === 'dip' ? prev.duration / 2 : prev.duration)
                + (tr.mode === 'dip' ? tr.duration / 2 : 0);
            if (gap < span) {
                found.push({ severity: 'warning', path: tr.where,
                    message: `'${tr.where}' at ${tr.at}s starts before '${prev.where}' at `
                        + `${prev.at}s has finished. Overlapping transitions multiply their `
                        + 'coverage, so the frame goes darker than either one asked for' });
            }
            /**
             * Two dissolves in a row reads as a fault rather than a style.
             * The threshold is a judgement, so it is a note and not an error.
             */
            if (gap < 2 && prev.kind !== 'continue' && tr.kind !== 'continue') {
                found.push({ severity: 'note', path: tr.where,
                    message: `two transitions ${round(gap)}s apart ('${prev.where}' and `
                        + `'${tr.where}'). Back-to-back dissolves read as a mistake; `
                        + 'consider a hard cut for one of them' });
            }
        }
    }
    return found;
}
