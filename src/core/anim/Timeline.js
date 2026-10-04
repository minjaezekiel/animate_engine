import { createTrack, setKey } from './Track.js';

/**
 * A Timeline is the whole film's animation: flat tracks addressed by node id,
 * plus clip instances that contribute scoped tracks over a time window.
 *
 *   instances: [{ clipId, start, end, speed, scopeId }]
 *
 * `scopeId` is a node-id prefix ('mara'), so the same walk clip drives any
 * cast member. `end` bounds a tiled loop; omit it to run to the timeline end.
 */
export function createTimeline({ fps = 24, duration = 0 } = {}) {
    return { fps, duration, tracks: [], instances: [], clips: new Map() };
}

export function addClip(timeline, clip) {
    timeline.clips.set(clip.id, clip);
    return clip;
}

export function addInstance(timeline, inst) {
    timeline.instances.push({ speed: 1, ...inst });
    return timeline;
}

const trackKey = (target, path) => `${target}\u0000${path}`;

/**
 * Find-or-create the track for (node, channel) and write one key.
 * This is the single mutation entry point the film compiler uses.
 */
export function key(timeline, target, path, t, v, { type, ease = 'linear', h } = {}) {
    timeline._index ??= new Map();
    const k = trackKey(target, path);
    let track = timeline._index.get(k);
    if (!track) {
        track = createTrack({ target, path, type: type ?? inferType(v) });
        timeline.tracks.push(track);
        timeline._index.set(k, track);
    }
    setKey(track, t, v, ease, h);
    if (t > timeline.duration) timeline.duration = t;
    return track;
}

export function getTrack(timeline, target, path) {
    return timeline._index?.get(trackKey(target, path));
}

function inferType(v) {
    if (typeof v === 'number') return 'number';
    if (typeof v === 'string') return v.startsWith('#') ? 'color' : 'discrete';
    if (Array.isArray(v)) return v.length === 4 ? 'quat' : v.length === 3 ? 'vec3' : 'vec2';
    return 'discrete';
}
