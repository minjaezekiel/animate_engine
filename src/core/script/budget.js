/**
 * What a frame of this film will cost, before anything is rendered.
 *
 * ```js
 * const { shots, notes } = estimateFrameCost(compiled, film);
 * // notes are ordinary diagnostics; analyseStaging merges them in
 * ```
 *
 * # Why this exists
 *
 * The paced export has a hard ceiling of `1000 / fps` milliseconds a
 * frame, and **it does not degrade when you cross it**. MediaRecorder
 * stamps frames by wall clock, so a renderer that cannot keep up does not
 * drop frames or lengthen the file -- it writes a container with almost
 * nothing in it. The failure that produced this module was a **110-byte
 * undecodable webm** at the end of a sixty-second render, with no error
 * anywhere before it.
 *
 * Preflight already samples 48 real frames, which is accurate but comes
 * *after* a film is loaded, voiced and mixed, and only in a browser. This
 * is the cheap, pure, Node-side version: it reads the compiled scene and
 * says which shots are over budget and why, in the same diagnostic stream
 * as every other film problem. A wrong answer here costs a second; a wrong
 * answer at the encoder costs the render.
 *
 * # The model is measured, not invented
 *
 * Only two node kinds cost anything worth modelling. That is not a guess
 * either: the fight film measured **71.7 ms a frame with its photo
 * backdrop and 0.7 ms without it** -- the backdrop was the entire cost,
 * and the other 237 nodes together were noise.
 *
 * | term | measured | how |
 * |---|---|---|
 * | `photoNsPerPixel` | 48.3 ns warp + 15.8 ns f32→u8 = **64 ns** | 1400×820 warp, wasm, single thread |
 * | `dabNs` | **1350 ns** | 8k–33k dabs across three documents, 1207–1579 ns/dab |
 *
 * Both are per-unit costs of Rust kernels, so they scale linearly and
 * travel between machines as a *ratio* even when the absolute number
 * differs. [`CALIBRATION`] is exported so a host that has measured its own
 * hardware can replace them rather than fork the model.
 *
 * # What it deliberately does not model
 *
 * Vector scenery, cast rigs, text, transitions and FX. They measured at
 * 0.7 ms for a whole 23-shot film, which is below the noise floor of this
 * estimate, and a model that pretends to know them would be precision
 * theatre. If that stops being true the fix is another measured term, not
 * a fudge factor.
 */
import { filmShots } from './compile.js';

/**
 * Per-unit costs, in nanoseconds. Measured on wasm kernels, single thread.
 * Replace wholesale for a host with different hardware.
 */
export const CALIBRATION = {
    /** One output pixel of a photo warp, including the f32 to u8 pass. */
    photoNsPerPixel: 64,
    /** One brush dab of a drawing that is re-rendering this frame. */
    dabNs: 1350,
    /**
     * Fraction of the ceiling above which a shot is *advised* against.
     * Matches `preflight`'s own margin, which leaves room for the encoder
     * running alongside the renderer.
     */
    advisory: 0.6,
};

/** Dabs in a drawing spec, cheaply: the painter's own count needs kernels. */
function dabsOf(drawing) {
    let total = 0;
    for (const layer of drawing.layers ?? [{ strokes: drawing.strokes ?? [] }]) {
        for (const stroke of layer.strokes ?? []) {
            // Points are dabs directly; a path is resampled by arc length,
            // which needs the geometry. The path's own command count is a
            // poor proxy, so this estimates from the brush size and a
            // nominal stroke length instead -- deliberately rough, and
            // reported as such by `approximate`.
            if (Array.isArray(stroke.points)) { total += stroke.points.length; continue; }
            const size = stroke.size ?? 12;
            const commands = String(stroke.path ?? '').match(/[MLHVCSQTAZmlhvcsqtaz]/g)?.length ?? 0;
            total += Math.round((commands * 180) / Math.max(1, size * 0.1));
        }
    }
    return total;
}

/**
 * Estimated milliseconds per frame, per shot.
 *
 * @param {object} compiled the result of `compileFilm`
 * @param {object} film     the film it was compiled from
 * @param {object} [options]
 * @param {Function} [options.trackValueAt] enables the held-drawing test
 * @param {object} [options.calibration] overrides [`CALIBRATION`]
 * @returns {{ceilingMs: number, shots: Array, notes: Array, worstMs: number}}
 */
export function estimateFrameCost(compiled, film, { trackValueAt = null,
                                                    calibration = CALIBRATION } = {}) {
    const notes = [];
    if (!compiled?.timeline || !compiled.meta) return { ceilingMs: 0, shots: [], notes, worstMs: 0 };

    const fps = compiled.meta.fps || 24;
    const ceilingMs = 1000 / fps;
    const scenes = compiled.expanded ?? film.scenes ?? [];
    const spans = filmShots({ ...film, scenes });

    /** Does this node's progress channel move inside the span? */
    const animates = (nodeId, span) => {
        const track = compiled.timeline._index?.get(`${nodeId}\u0000props.progress`);
        if (!track || !trackValueAt) return true;        // assume the worst
        return trackValueAt(track, span.start) !== trackValueAt(track, span.end);
    };

    const shots = [];
    for (const span of spans) {
        const scene = span.scene;
        const items = [];

        for (const [i, photo] of (scene.photos ?? []).entries()) {
            const id = photo.id ?? `photo${i + 1}`;
            const scale = Math.min(1, Math.max(0.05, photo.resolution ?? 1));
            const px = (photo.width ?? compiled.meta.width) * (photo.height ?? compiled.meta.height)
                * scale * scale;
            const perWarp = (px * calibration.photoNsPerPixel) / 1e6;
            // `step` holds one warp across several frames, so the cost the
            // renderer actually has to absorb is the amortised one. Pacing
            // is per frame but averages over a shot, which is why this is
            // the primary number and `peakMs` is only reported.
            const held = photo.step > 0 ? Math.max(1, Math.round(photo.step * fps)) : 1;
            items.push({ kind: 'photo', id, ms: perWarp / held, peakMs: perWarp, held });
        }

        for (const [i, drawing] of (scene.drawings ?? []).entries()) {
            const id = drawing.id ?? `drawing${i + 1}`;
            if (!animates(`${span.sceneId}/${id}`, span)) continue;   // held: memoised
            const dabs = dabsOf(drawing);
            items.push({ kind: 'drawing', id, ms: (dabs * calibration.dabNs) / 1e6,
                         dabs, approximate: true });
        }

        const ms = items.reduce((sum, it) => sum + it.ms, 0);
        const peakMs = items.reduce((sum, it) => sum + (it.peakMs ?? it.ms), 0);
        shots.push({ shotId: span.shotId, sceneId: span.sceneId, ms, peakMs, items });

        if (!items.length) continue;
        const worst = items.slice().sort((a, b) => b.ms - a.ms)[0];
        const fix = worst.kind === 'photo'
            ? `lower "resolution" (now ${scene.photos.find((p, j) => (p.id ?? `photo${j + 1}`) === worst.id)?.resolution ?? 1}) `
                + 'or raise "step" to hold each warp across more frames'
            : 'reveal fewer dabs, or split the drawing across shots';
        if (ms > ceilingMs) {
            notes.push({
                severity: 'error', path: `scenes.${span.sceneId}.shots.${span.shotId}`,
                message: `Budget: about ${ms.toFixed(1)}ms a frame, over the ${ceilingMs.toFixed(1)}ms `
                    + `ceiling at ${fps}fps. A paced export does not degrade past this -- it writes `
                    + `an undecodable file. Heaviest: ${worst.kind} "${worst.id}" at `
                    + `${worst.ms.toFixed(1)}ms. Try: ${fix}.`,
            });
        } else if (ms > ceilingMs * calibration.advisory) {
            notes.push({
                severity: 'warning', path: `scenes.${span.sceneId}.shots.${span.shotId}`,
                message: `Budget: about ${ms.toFixed(1)}ms a frame against a ${ceilingMs.toFixed(1)}ms `
                    + `ceiling, leaving little room for the encoder. Heaviest: ${worst.kind} `
                    + `"${worst.id}". Try: ${fix}.`,
            });
        }
    }

    return {
        ceilingMs,
        shots,
        notes,
        worstMs: shots.reduce((m, s) => Math.max(m, s.ms), 0),
    };
}
