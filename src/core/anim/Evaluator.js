import { trackValueAt } from './Track.js';
import { clipLocalTime } from './Clip.js';

/**
 * Samples a Timeline at an explicit time into a Pose, then applies a Pose to
 * a Scene. Both halves are pure with respect to time: nothing here reads a
 * clock, so frame N always yields the same pose.
 *
 * Pose = Map<nodeId, Map<channelPath, value>>
 */

export function samplePose(timeline, tSec) {
    const pose = new Map();

    const write = (target, path, value) => {
        if (value === undefined) return;
        let channels = pose.get(target);
        if (!channels) pose.set(target, (channels = new Map()));
        channels.set(path, value);
    };

    // Clip instances first, so explicit timeline tracks win over cycles.
    for (const inst of timeline.instances) {
        const clip = timeline.clips.get(inst.clipId);
        if (!clip) continue;
        const start = inst.start ?? 0;
        const end = inst.end ?? timeline.duration;
        if (tSec < start || tSec > end) continue;
        const local = clipLocalTime(clip, (tSec - start) * (inst.speed ?? 1));
        for (const track of clip.tracks) {
            const target = inst.scopeId ? `${inst.scopeId}/${track.target}` : track.target;
            write(target, track.path, trackValueAt(track, local));
        }
    }

    for (const track of timeline.tracks) {
        write(track.target, track.path, trackValueAt(track, tSec));
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
                node.transform[field] = value;
                transformTouched = true;
            } else if (group === 'props') {
                node.props[field] = value;
            } else {
                (node[group] ??= {})[field] = value;
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
    sample: samplePose, apply: applyPose, trackValueAt,
    createBaseline: createPoseBaseline, reset: resetPose, channels: timelineChannels,
};
