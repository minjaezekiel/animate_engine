/**
 * Onion skinning for DRAWN animation: which drawings to ghost.
 *
 * # Why the 2D model is its own model
 *
 * `render/onionSkin.js` picks ghosts at fixed intervals of time, which is
 * the right answer for a 3D film: a solid is a continuous function of t and
 * there is no "previous drawing" to speak of.
 *
 * A drawn film is not continuous. It is a sequence of **drawings**, each
 * held for some number of frames, and the question an animator asks is
 * *"show me the two drawings before this one"* -- which is how Toon Boom
 * Harmony states it (red and green markers for previous and next
 * **drawings**, not for previous and next seconds) and how every paperless
 * package has stated it since the light table.
 *
 * Those are different questions and on a shot exposed on twos they have
 * different answers. At 24 fps a ghost 0.25 s back is six frames back,
 * which is three drawings back, and a ghost 0.1 s back is 2.4 frames back,
 * which is a drawing boundary the animator did not choose. An onion skin
 * that lands between drawings is showing something that is never on screen.
 *
 * # It needed no new data
 *
 * The engine has known where every drawing is since the exposure sheet
 * landed: `timeline.sheets` holds the absolute boundaries an `expose` wrote,
 * `timeline.steps` holds the "on twos" spans, and `timeline.step` is the
 * film's default. `Evaluator.js` already reads all three every frame to
 * decide which drawing is showing. This asks the same question of the same
 * data, through the same exported helpers, so there is no second hold model
 * to drift from the first.
 *
 * Pure: no canvas, no DOM. The compositing is in `render/onionSkin.js`,
 * because that part genuinely is shared between the two paths.
 */
import { stepAt, quantise, spanFor, holdStart } from './Evaluator.js';

/**
 * How a ghost's distance is counted.
 *
 *   drawing  the previous/next EXPOSED DRAWING -- the animator's unit, and
 *            the default, because this is a drawn film
 *   frame    whole frames, for working on ones at the pencil-test stage
 *   second   fixed time, which is what a continuous 3D shot wants
 */
export const ONION_STEPS = ['drawing', 'frame', 'second'];
export const isOnionStep = (s) => ONION_STEPS.includes(s);

/**
 * The exposure boundaries around `time` for one target, as absolute seconds.
 *
 * Three cases, in the order `Evaluator.samplePose` resolves them:
 *
 *   1. an X-sheet covers this target here -- the boundaries are a list, and
 *      "the previous drawing" is the previous entry in it;
 *   2. a `step` span (or the film's own) holds every drawing for N frames --
 *      the boundaries are a uniform grid, so they are generated rather than
 *      stored;
 *   3. neither -- the film is on ones and a drawing is a frame.
 *
 * Returns `{ at, prev, next }` where `prev`/`next` are functions of k, so a
 * caller never has to know which of the three cases it is in.
 */
export function exposureAt(timeline, target, time) {
    const fps = timeline.fps || 24;
    const sheet = spanFor(timeline.sheets, target, time);
    if (sheet) {
        const at = holdStart(sheet.boundaries, time);
        const i = sheet.boundaries.indexOf(at);
        return {
            at, kind: 'sheet', count: sheet.boundaries.length,
            step: (k) => {
                const j = i + k;
                return (j < 0 || j >= sheet.boundaries.length) ? null : sheet.boundaries[j];
            },
        };
    }
    const span = spanFor(timeline.steps, target, time);
    const held = span ? (span.step ?? 0) : stepAt(timeline, time);
    // On ones, a drawing IS a frame -- so the two modes agree, which is the
    // behaviour a pencil test wants and not a special case to write down.
    const frames = held > 1 ? held : 1;
    const at = quantise(time, frames, fps);
    return {
        at, kind: held > 1 ? 'step' : 'ones', hold: frames,
        step: (k) => at + (k * frames) / fps,
    };
}

/** Opacity may be one number or `{ before, after }`: the two sides differ. */
const sideOpacity = (opacity, side) =>
    (typeof opacity === 'number' ? opacity : (opacity?.[side] ?? 0.28));

/**
 * The ghosts to render, nearest LAST so the nearest paints over the further.
 *
 *   target   whose exposure to count in. With none, the film's blanket step
 *            is used -- one composited ghost frame cannot be on two
 *            different exposures at once, so the honest answer when several
 *            characters are ghosted is the shot's own.
 *   within   `[start, end]` -- the SHOT, not the film. A ghost across a cut
 *            is a drawing from another scene: different staging, different
 *            camera, and nothing an animator can read an arc from. The old
 *            model clamped to the film, which let exactly that through.
 *
 * Returns `[{ time, offset, alpha, side, index }]`.
 */
export function ghostPlan(timeline, {
    target = null, time = 0, before = 2, after = 1,
    step = 'drawing', spacing = 1, opacity = 0.28, falloff = 0.55,
    within = null, duration = Infinity,
} = {}) {
    if (!isOnionStep(step)) {
        throw new Error(`unknown onion step '${step}'; try ${ONION_STEPS.join(', ')}`);
    }
    const fps = timeline?.fps || 24;
    const [lo, hi] = within ?? [0, duration];
    const exposure = step === 'drawing' ? exposureAt(timeline, target, time) : null;

    const at = (k) => {
        // `spacing` is "every Nth", so a dense pencil test can show every
        // second drawing rather than four consecutive near-identical ones.
        if (step === 'drawing') return exposure.step(k * Math.max(1, Math.round(spacing)));
        if (step === 'frame') return time + (k * spacing) / fps;
        return time + k * spacing;
    };

    const out = [];
    for (const [side, n, sign] of [['before', before, -1], ['after', after, 1]]) {
        for (let k = n; k >= 1; k--) {
            const t = at(sign * k);
            // Clamped AWAY rather than clamped to the ends: a ghost pinned
            // at a shot boundary sits on top of several others and reads as
            // one dark frame, which looks like a bug.
            if (t == null || t < lo - 1e-9 || t > hi + 1e-9) continue;
            out.push({
                time: t, offset: t - time, side, index: sign * k,
                alpha: sideOpacity(opacity, side) * falloff ** (k - 1),
            });
        }
    }
    /**
     * Furthest first, so the nearest ghost paints over the further ones,
     * and ties broken by SIDE rather than by the offset's last bit.
     *
     * Sorting on `|offset|` looked equivalent and was not: on twos at t=1
     * the two four-frame ghosts are -0.16666666666666663 and
     * +0.16666666666666674, so float noise decided which of two overlapping
     * ghosts painted on top. Everything else in this engine is a pure
     * function of the frame number; a paint order that is not would be the
     * one place it isn't.
     */
    return out.sort((a, b) => Math.abs(b.index) - Math.abs(a.index)
        || (a.side === b.side ? 0 : (a.side === 'before' ? -1 : 1)));
}

/**
 * The shot containing `t`, as `[start, end]`, from `filmShots`-shaped rows.
 *
 * A separate function because the caller has the shots and this module does
 * not take the film: `core/anim/` knows about timelines, not about scripts.
 */
export function shotWindow(shots, t) {
    const s = (shots ?? []).find((x) => t >= x.start && t < x.end)
        ?? (shots ?? [])[shots?.length - 1];
    return s ? [s.start, s.end] : null;
}
