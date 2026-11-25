import { FrameClock } from '../core/time/FrameClock.js';
import { createBlurAccumulator } from './motionBlur.js';
import { motionBlurCost } from '../core/motion/motionBlur.js';
import { samplePose, applyPose, createPoseBaseline, resetPose } from '../core/anim/Evaluator.js';

/**
 * Authored-pose snapshots, cached per timeline.
 *
 * The baseline has to come from the scene as AUTHORED, not from whatever
 * state a previous render left it in -- otherwise rendering the same film
 * twice captures a different baseline the second time and the two renders
 * disagree. Caching here, plus restoring after each render, makes repeat
 * renders and scrubbing give identical results.
 */
const baselines = new WeakMap();

function baselineFor(scene, timeline) {
    let baseline = baselines.get(timeline);
    if (!baseline) {
        baseline = createPoseBaseline(scene, timeline);
        baselines.set(timeline, baseline);
    }
    return baseline;
}

/**
 * The one render loop. Every export format is a different FrameSink; the loop
 * itself never changes.
 *
 * Determinism comes from stepping an explicit frame index through FrameClock
 * rather than reading elapsed time. Frame N is always t = N/fps, so two runs
 * of the same film produce identical pixels (encoders are not bit-reproducible,
 * but the renderer is -- which is why tests compare frame hashes, not files).
 */
export async function renderOffline({
    scene, timeline, backend, cameraId,
    fps = 24, width, height, durationSec,
    sink, physics = null, onProgress = null, signal = null,
    beforeFrame = null, poser = null,
    /**
     * Subframe motion blur, already normalised by `normalizeMotionBlur`.
     * `null` -- the default -- leaves the loop exactly as it was, down to the
     * number of draw calls.
     */
    motionBlur = null,
}) {
    const clock = new FrameClock(fps);
    const total = clock.count(durationSec ?? timeline.duration);

    // Every frame starts from the authored pose rather than from the previous
    // frame's leftovers. Without this a clip instance that has ended leaves
    // its last pose stuck, and frame N stops being a pure function of N.
    //
    // `poser` lets a backend own that step: the 3D backend writes onto THREE
    // objects, which are not the plain nodes a core Scene holds. The loop
    // below does not change, which is the part that matters.
    const pose = poser ?? defaultPoser(scene, timeline);

    await sink.configure({
        width, height, fps, totalFrames: total,
        canvas: backend.canvas?.() ?? null,
        audioBuffer: sink.audioBuffer ?? null,
    });

    /**
     * One subframe: everything that happens between "it is now t" and "the
     * surface holds the picture".
     *
     * Factored out so the blurred and unblurred paths cannot drift. They did
     * in an earlier draft of this -- the blur path forgot `physics.stepTo`,
     * so a film with motion blur had static physics, which is exactly the
     * class of divergence that comes from writing the sequence twice.
     */
    const drawAt = async (t, n) => {
        if (physics) physics.stepTo(t);
        pose.reset();
        pose.apply(t);
        // Awaited, so a hook can do asynchronous work *before* the
        // synchronous draw -- which is the only seam a worker pool can
        // use. `renderFrame` is synchronous by contract (that is what
        // makes offline rendering possible at all), so anything
        // parallel has to finish here.
        if (beforeFrame) await beforeFrame(t, n, scene);
        backend.sync(scene);
        backend.renderFrame(scene, cameraId);
    };

    /**
     * Built after `sink.configure`, because on the 3D path the composite
     * canvas the accumulator needs is the same one the sink was handed, and
     * asking for its 2D context before the sink has seen it would be fine
     * but harder to reason about.
     */
    const blur = motionBlur && motionBlur.samples > 1
        ? createBlurAccumulator({ backend, width, height, motionBlur, fps })
        : null;

    const t0 = Date.now();
    try {
        for (let n = 0; n < total; n++) {
            if (signal?.aborted) throw new Error('render aborted');
            const t = clock.timeOf(n);

            if (blur) {
                blur.begin();
                const times = blur.times(t);
                for (const sub of times) {
                    if (signal?.aborted) throw new Error('render aborted');
                    await drawAt(sub, n);
                    blur.take();
                }
                blur.end(times.length);
            } else {
                await drawAt(t, n);
            }
            await sink.writeFrame(backend.canvas?.() ?? null, n, t);

            if (onProgress && (n % 12 === 0 || n === total - 1)) {
                onProgress({
                    frame: n + 1, total, tSec: t,
                    elapsedSec: (Date.now() - t0) / 1000,
                    msPerFrame: (Date.now() - t0) / (n + 1),
                });
            }
        }
    } catch (err) {
        sink.abort();
        throw err;
    } finally {
        // Leave the scene as authored, so a preview, a scrub or a second
        // render all start from the same state.
        pose.reset();
    }

    return sink.finish();
}

/**
 * What one subframe's pixel round trip costs, in milliseconds.
 *
 * Returns 0 where it cannot be measured -- a backend with no 2D canvas, a
 * stub in a test -- rather than guessing, because a made-up number here would
 * silently skew every estimate that uses it.
 */
function measureReadback(backend) {
    try {
        const canvas = backend.canvas?.();
        const ctx = canvas?.getContext?.('2d', { willReadFrequently: true });
        if (!ctx) return 0;
        // The canvas's own size, not a passed-in one: `preflight` does not
        // take the output dimensions, and the surface being measured is the
        // authority on how big it is anyway.
        const w = Math.max(1, Math.round(canvas.width || 1));
        const h = Math.max(1, Math.round(canvas.height || 1));
        const start = performance.now();
        const img = ctx.getImageData(0, 0, w, h);
        ctx.putImageData(img, 0, 0);
        return performance.now() - start;
    } catch { return 0; }
}

/** The core-Scene poser, used whenever a backend does not supply its own. */
function defaultPoser(scene, timeline) {
    const baseline = baselineFor(scene, timeline);
    return {
        reset() { resetPose(scene, baseline); },
        apply(tSec) { applyPose(scene, samplePose(timeline, tSec)); },
    };
}

/**
 * Measure cost per frame before committing to a long render, so an
 * over-budget resolution is caught in seconds rather than discovered two
 * minutes in. The paced MediaRecorder path has a hard ceiling of 1000/fps
 * ms per frame; exceeding it drops frames and drifts audio.
 *
 * # Measure the expensive shot, not the first one
 *
 * `startSec` is where to sample from, and it matters more than it looks.
 * This used to measure frames 0..47 unconditionally -- the opening two
 * seconds -- which is the cheapest part of most films: a title card, a
 * held establishing shot. A film whose photo backdrop starts at forty
 * seconds passed preflight and then wrote an undecodable file, which is
 * the exact failure preflight exists to prevent.
 *
 * `estimateFrameCost` already knows which shot is heaviest and
 * `worstSpan` hands back its start, so the caller points the measurement
 * at the frames that will actually hurt. That also makes the two numbers
 * comparable, which is what `calibrate` needs.
 *
 * The sampled window is clamped to `endSec` when one is given, so a short
 * shot is measured over its own frames rather than running on into the
 * next one.
 *
 * # Which number means what, because they are far apart
 *
 * A photo with `step` set re-warps on one frame and reuses the result on
 * the next several, so the frame costs here are bimodal: on the fight film
 * the median is 1.1 ms and the p95 is 35.3 ms, and neither is "the" cost.
 *
 *  * `meanMs` is the amortised cost, and the one to compare against
 *    `estimateFrameCost`'s `ms` or to calibrate from. A held warp really
 *    is cheaper per frame, and pacing averages over a shot.
 *  * `p95Ms` is the spike, and the one `withinBudget` is judged on. Pacing
 *    averages, but not infinitely: a frame far enough over the ceiling
 *    stalls the encoder whatever the frames around it cost.
 *  * `medianMs` is the typical frame, which with a hold is the cheap one.
 *    It is reported because it is what a viewer's machine mostly does, and
 *    it is a trap to calibrate from.
 *  * `warmupMs` is the first frame, measured and then excluded from the
 *    rest, because it pays for everything construction deferred and no
 *    other frame pays it again.
 */
export async function preflight({
    scene, timeline, backend, cameraId, fps = 24, frames = 48, poser = null,
    startSec = 0, endSec = null, beforeFrame = null,
    /**
     * Subframe motion blur, so the estimate is of the render that will
     * actually happen.
     *
     * Preflight measures ONE draw per frame. With 8-sample blur the real
     * render does eight, plus a pixel readback after each -- so without this
     * the whole point of preflight is defeated in the one case where it
     * matters most: it would clear a render that is far over budget.
     *
     * The DRAWS are multiplied rather than measured, because measuring them
     * would make preflight itself eight times slower -- which is the cost it
     * exists to avoid paying. The READBACK is measured, once, because it
     * turned out to dominate and no multiplier could have guessed it: the
     * AK-47 film at 480x270 went from 6.4 ms a frame to 127.0 ms with
     * 8-sample blur, which is 19.8x and not 8x. A `samples` multiplier alone
     * was 2.5x optimistic, so preflight would have cleared a render it should
     * have flagged -- the exact failure this parameter was added to prevent,
     * surviving in the fix for it.
     */
    motionBlur = null,
}) {
    const clock = new FrameClock(fps);
    const pose = poser ?? defaultPoser(scene, timeline);
    const first = Math.max(0, Math.round(startSec * fps));
    const span = endSec !== null ? Math.max(1, Math.round((endSec - startSec) * fps)) : frames;
    const count = Math.max(1, Math.min(frames, span));
    // One warm-up frame, outside the samples. The first frame of a photo
    // pays for things construction deferred -- the mesh, the inpainted
    // background plate, the first texture upload -- and measured 307 ms on
    // the fight film against 8 ms steady state. Averaged into 48 samples
    // that is 6 ms of phantom per-frame cost, which would calibrate the
    // whole model nearly 2x pessimistic. It is reported as `warmupMs`
    // rather than dropped, because it is one real late frame.
    // Sampling starts at the frame *after* the warm-up, because both
    // painters memoise per frame key: re-drawing the warm-up frame would
    // be a cache hit, which is a cost no frame of a real render has.
    const warmup = await sample(first);
    const samples = [];
    for (let n = first + 1; n <= first + count; n++) {
        samples.push(await sample(n));
    }
    /**
     * One getImageData plus one putImageData at the output size.
     *
     * This is what a subframe costs on top of its draw, and it is measured
     * rather than assumed because it scales with resolution and with how the
     * machine moves pixels off the GPU -- at 480x270 it measured around
     * 9.5 ms, which is larger than the draw it accompanies.
     */
    const readbackMs = motionBlur && motionBlur.samples > 1 ? measureReadback(backend) : 0;

    async function sample(n) {
        const t = clock.timeOf(n);
        const start = performance.now();
        pose.reset();
        pose.apply(t);
        // The same hook the render loop awaits, for the same reason it
        // exists: without it preflight measures the serial fallback and
        // then the render uses the worker pool, so the measurement
        // describes a frame nobody is going to draw -- 2.8x too slow on
        // the backdrop that motivated all of this.
        if (beforeFrame) await beforeFrame(t, n, scene);
        backend.sync(scene);
        backend.renderFrame(scene, cameraId);
        return performance.now() - start;
    }

    pose.reset();
    samples.sort((a, b) => a - b);
    const at = (q) => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))];
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    // Every reported cost is the cost of a REAL frame of this render, blur
    // included, so `withinBudget` answers the question it is asked.
    const k = motionBlurCost(motionBlur);
    const blurred = (ms) => ms * k + readbackMs * k;
    return {
        frames: count,
        startSec,
        subframes: k,
        readbackMs: +readbackMs.toFixed(2),
        meanMs: +blurred(mean).toFixed(2),
        warmupMs: +warmup.toFixed(2),
        medianMs: +blurred(at(0.5)).toFixed(2),
        p95Ms: +blurred(at(0.95)).toFixed(2),
        maxMs: +blurred(samples[samples.length - 1]).toFixed(2),
        ceilingMs: +(1000 / fps).toFixed(2),
        withinBudget: blurred(at(0.95)) < (1000 / fps) * 0.6,   // leave room for encode
    };
}
