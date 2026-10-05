import { createTimeline, key } from '../../core/anim/Timeline.js';
import { quatFromEuler } from './eulerQuat.js';

/**
 * Turn the 3D editor's keyframe model into a core Timeline.
 *
 *   animation.keyframes : Map<uuid, [{ time, properties }]>
 *   properties          : { position?, rotation?, scale?, color?, morphs?,
 *                           interp?, handles? }
 *
 * What this buys over AnimationClip + AnimationMixer:
 *
 *  - `interp` works on rotation. The mixer path built a QuaternionKeyframeTrack
 *    and never looked at interp, so step and bezier silently did nothing there.
 *  - bezier is exact at any frame rate. The old path densified bezier segments
 *    at 30fps and then rendered at 24, quantizing the easing.
 *  - colour keyframes animate. They were stored and read by nothing.
 *  - scrubbing is a pure function of time, so a render is reproducible.
 */
export function timelineFromAnimation(animation, { fps = 30 } = {}) {
    const timeline = createTimeline({ fps, duration: animation.duration ?? 0 });
    if (!animation.keyframes) return timeline;

    // An animation-level 'smooth' is the default ease; a keyframe's own
    // `interp` overrides it. That is the old precedence, kept.
    const fallback = animation.easing === 'smooth' ? 'smooth' : 'linear';

    animation.keyframes.forEach((keyframes, uuid) => {
        for (const kf of keyframes ?? []) {
            const p = kf.properties || {};
            const opts = { ease: p.interp || fallback, h: p.handles };
            const at = (path, value, type) => key(timeline, uuid, path, kf.time, value, { type, ...opts });

            if (p.position) at('position', [...p.position], 'vec3');
            if (p.scale) at('scale', [...p.scale], 'vec3');
            // Euler in, quaternion out: slerped so it takes the short way, and
            // eased because the ease rides the key rather than the track type.
            if (p.rotation) at('quaternion', quatFromEuler(p.rotation), 'quat');
            if (p.color != null) at('color', p.color, 'color');
            if (p.visible != null) at('visible', p.visible, 'discrete');
            if (p.morphs) {
                for (const [name, value] of Object.entries(p.morphs)) {
                    if (value != null) at(`morph.${name}`, value, 'number');
                }
            }
        }
    });

    timeline.duration = Math.max(timeline.duration, animation.duration ?? 0);
    return timeline;
}

/** Every (uuid, channel) the timeline can write, for baseline capture. */
export function timelineTargets(timeline) {
    const targets = new Map();
    for (const track of timeline.tracks) {
        let paths = targets.get(track.target);
        if (!paths) targets.set(track.target, (paths = new Set()));
        paths.add(track.path);
    }
    for (const inst of timeline.instances) {
        const clip = timeline.clips.get(inst.clipId);
        for (const track of clip?.tracks ?? []) {
            const target = inst.scopeId ? `${inst.scopeId}/${track.target}` : track.target;
            let paths = targets.get(target);
            if (!paths) targets.set(target, (paths = new Set()));
            paths.add(track.path);
        }
    }
    return targets;
}
