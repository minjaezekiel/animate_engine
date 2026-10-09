import { trackValueAt } from './Track.js';
import { clipLocalTime } from './Clip.js';

/**
 * Samples a Timeline at an explicit time into a Pose, then applies a Pose to
 * a Scene. Both halves are pure with respect to time: nothing here reads a
 * clock, so frame N always yields the same pose.
 *
 * Pose = Map<nodeId, Map<channelPath, value>>
 */

/**
 * A layered contribution: what to add to, or multiply into, whatever the base
 * layer resolved this channel to.
 *
 * Carried in the Pose as a marker rather than a resolved number because
 * `samplePose` has no scene -- the value it layers over may come from the
 * node's own authored rest value, which only `applyPose` can see.
 */
export class Additive {
    constructor(delta = 0, ratio = 1) { this.delta = delta; this.ratio = ratio; }
    /** Resolve against the base this channel already holds. */
    over(base) {
        const b = typeof base === 'number' ? base : 0;
        return b * this.ratio + this.delta;
    }
    add(other) { return new Additive(this.delta + other.delta, this.ratio * other.ratio); }
}

/** Channels where "more" means a ratio, not an offset. */
const RATIO_CHANNELS = new Set(['transform.sx', 'transform.sy']);

/**
 * Hold cast drawings for `step` frames at a time -- "on twos".
 *
 * Anime is drawn at roughly twelve unique drawings a second against a
 * twenty-four frame soundtrack, and the slight choppiness that produces is
 * part of the idiom rather than a defect. Interpolating every frame smoothly
 * is the wrong TEXTURE even where the motion itself is right.
 *
 * The camera is exempt by name. A pan quantised to twos judders horribly,
 * which is exactly why a real production shoots the artwork on twos and moves
 * the camera on ones.
 */
const SMOOTH_TARGETS = new Set(['__camera', '__subtitle']);

function stepAt(timeline, tSec) {
    for (const span of timeline.steps ?? []) {
        if (tSec >= span.start && tSec < span.end) return span.step ?? 0;
    }
    return timeline.step ?? 0;
}

function quantise(tSec, step, fps) {
    if (!step || step <= 1) return tSec;
    const frame = Math.floor(tSec * fps + 1e-6);
    return (Math.floor(frame / step) * step) / fps;
}

export function samplePose(timeline, tSec) {
    const pose = new Map();
    const layered = [];
    const step = stepAt(timeline, tSec);
    const fps = timeline.fps || 24;
    const held = quantise(tSec, step, fps);
    const timeFor = (target) => (SMOOTH_TARGETS.has(String(target).split('/')[0]) ? tSec : held);

    const write = (target, path, value) => {
        if (value === undefined) return;
        let channels = pose.get(target);
        if (!channels) pose.set(target, (channels = new Map()));
        channels.set(path, value);
    };

    // 1. Base layer: override clips, then explicit timeline tracks, so a pose
    //    still wins over a cycle that is trying to replace the same channel.
    for (const inst of timeline.instances) {
        const clip = timeline.clips.get(inst.clipId);
        if (!clip) continue;
        const start = inst.start ?? 0;
        const end = inst.end ?? timeline.duration;
        if (tSec < start || tSec > end) continue;
        const sampleAt = timeFor(inst.scopeId ?? '');
        if (sampleAt < start || sampleAt > end) continue;
        const local = clipLocalTime(clip, (sampleAt - start) * (inst.speed ?? 1));
        const weight = inst.weight ?? 1;
        if (weight <= 0) continue;
        for (const track of clip.tracks) {
            if (clip.mask && !clip.mask.has(track.target)) continue;
            const target = inst.scopeId ? `${inst.scopeId}/${track.target}` : track.target;
            const value = trackValueAt(track, local);
            if (clip.blend !== 'add') { write(target, track.path, value); continue; }

            // 2. Additive layer, deferred. The reference is the clip's own
            //    value at its local zero, so a cycle authored as absolute
            //    numbers (sy 1 -> 1.018 -> 1) becomes a delta around its own
            //    rest pose with no re-authoring: reference-inverse times pose,
            //    which is how layered skeletal animation does it everywhere.
            if (typeof value !== 'number') continue;
            const ref = trackValueAt(track, 0);
            if (typeof ref !== 'number') continue;
            const contribution = RATIO_CHANNELS.has(track.path)
                ? new Additive(0, ref === 0 ? 1 : 1 + ((value / ref) - 1) * weight)
                : new Additive((value - ref) * weight, 1);
            layered.push([target, track.path, contribution]);
        }
    }

    for (const track of timeline.tracks) {
        write(track.target, track.path, trackValueAt(track, timeFor(track.target)));
    }

    // 3. Fold the additive layer on top of the base.
    for (const [target, path, contribution] of layered) {
        let channels = pose.get(target);
        if (!channels) pose.set(target, (channels = new Map()));
        const base = channels.get(path);
        channels.set(path, base instanceof Additive ? base.add(contribution)
            : base === undefined ? contribution
            : contribution.over(base));
    }

    return pose;
}

/**
 * Write a Pose into a Scene. Channel paths are dotted and shallow by design
 * ('transform.rot', 'props.fill'), which keeps this a plain property write
 * with no reflection machinery.
 */
export function applyPose(scene, pose) {
    for (const [nodeId, channels] of pose) {
        const node = scene.get(nodeId);
        if (!node) continue;                  // tolerate poses for absent cast
        let transformTouched = false;
        for (const [path, value] of channels) {
            const dot = path.indexOf('.');
            if (dot < 0) { node[path] = value; continue; }
            const group = path.slice(0, dot);
            const field = path.slice(dot + 1);
            if (group === 'transform') {
                node.transform[field] = value instanceof Additive
                    ? value.over(node.transform[field]) : value;
                transformTouched = true;
            } else if (group === 'props') {
                node.props[field] = value instanceof Additive
                    ? value.over(node.props[field]) : value;
            } else {
                const bag = (node[group] ??= {});
                bag[field] = value instanceof Additive ? value.over(bag[field]) : value;
            }
        }
        if (transformTouched) scene.invalidate(nodeId);
    }
    return scene;
}

/**
 * Every (node, channel) the timeline is capable of writing.
 *
 * Needed because a clip instance only contributes while it is active: the
 * `walk` cycle writes thighL.rot between 7s and 10s and nothing writes it
 * outside that window. Without knowing the full channel set, those nodes
 * would keep whatever value the last active frame left behind.
 */
export function timelineChannels(timeline) {
    const channels = [];
    for (const track of timeline.tracks) channels.push([track.target, track.path]);
    for (const inst of timeline.instances) {
        const clip = timeline.clips.get(inst.clipId);
        if (!clip) continue;
        for (const track of clip.tracks) {
            const target = inst.scopeId ? `${inst.scopeId}/${track.target}` : track.target;
            channels.push([target, track.path]);
        }
    }
    return channels;
}

/**
 * Snapshot the scene's authored value for every channel the timeline can
 * touch. Taken once, before the first frame.
 */
export function createPoseBaseline(scene, timeline) {
    const baseline = new Map();
    for (const [nodeId, path] of timelineChannels(timeline)) {
        const node = scene.get(nodeId);
        if (!node) continue;
        let channels = baseline.get(nodeId);
        if (!channels) baseline.set(nodeId, (channels = new Map()));
        if (channels.has(path)) continue;
        const dot = path.indexOf('.');
        const group = dot < 0 ? null : path.slice(0, dot);
        const field = dot < 0 ? path : path.slice(dot + 1);
        const value = group === 'transform' ? node.transform[field]
            : group === 'props' ? node.props[field]
            : group ? node[group]?.[field]
            : node[path];
        channels.set(path, value);
    }
    return baseline;
}

/**
 * Restore the baseline before applying a frame's pose.
 *
 * This is what makes frame N a pure function of N rather than of render
 * history, which in turn is what lets a timeline be scrubbed, re-rendered
 * and compared against golden frames.
 */
export function resetPose(scene, baseline) {
    for (const [nodeId, channels] of baseline) {
        const node = scene.get(nodeId);
        if (!node) continue;
        for (const [path, value] of channels) {
            const dot = path.indexOf('.');
            if (dot < 0) { node[path] = value; continue; }
            const group = path.slice(0, dot);
            const field = path.slice(dot + 1);
            if (group === 'transform') node.transform[field] = value;
            else if (group === 'props') node.props[field] = value;
            else if (node[group]) node[group][field] = value;
        }
        scene.invalidate(nodeId);
    }
    return scene;
}

export const Evaluator = {
    sample: samplePose, apply: applyPose, trackValueAt, Additive,
    createBaseline: createPoseBaseline, reset: resetPose, channels: timelineChannels,
};
