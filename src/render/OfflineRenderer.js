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
            if (beforeFrame) beforeFrame(t, n, scene);

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
 * Measure cost per frame on a short prefix before committing to a long
 * render, so an over-budget resolution is caught in seconds rather than
 * discovered two minutes in. The paced MediaRecorder path has a hard ceiling
 * of 1000/fps ms per frame; exceeding it drops frames and drifts audio.
 */
export async function preflight({
    scene, timeline, backend, cameraId, fps = 24, frames = 48, poser = null,
}) {
    const clock = new FrameClock(fps);
    const pose = poser ?? defaultPoser(scene, timeline);
    const samples = [];
    for (let n = 0; n < frames; n++) {
        const t = clock.timeOf(n);
        const start = performance.now();
        pose.reset();
        pose.apply(t);
        backend.sync(scene);
        backend.renderFrame(scene, cameraId);
        samples.push(performance.now() - start);
    }
    pose.reset();
    samples.sort((a, b) => a - b);
    const at = (q) => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))];
    return {
        frames,
        medianMs: +at(0.5).toFixed(2),
        p95Ms: +at(0.95).toFixed(2),
        ceilingMs: +(1000 / fps).toFixed(2),
        withinBudget: at(0.95) < (1000 / fps) * 0.6,   // leave room for encode
    };
}
