import { FrameClock } from '../core/time/FrameClock.js';
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

    const t0 = Date.now();
    try {
        for (let n = 0; n < total; n++) {
            if (signal?.aborted) throw new Error('render aborted');
            const t = clock.timeOf(n);

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
    return {
        frames: count,
        startSec,
        meanMs: +mean.toFixed(2),
        warmupMs: +warmup.toFixed(2),
        medianMs: +at(0.5).toFixed(2),
        p95Ms: +at(0.95).toFixed(2),
        maxMs: +samples[samples.length - 1].toFixed(2),
        ceilingMs: +(1000 / fps).toFixed(2),
        withinBudget: at(0.95) < (1000 / fps) * 0.6,   // leave room for encode
    };
}
