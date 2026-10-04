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

export const Evaluator = { sample: samplePose, apply: applyPose, trackValueAt };
