import { easeProgress } from './easing.js';
import { interpolateValue } from './interpolate.js';

/**
 * A Track is one animated channel on one node.
 *
 *   target : node id
 *   path   : dotted channel, e.g. 'transform.x' | 'props.fill' | 'props.viseme'
 *   type   : number | vec2 | vec3 | quat | color | discrete
 *   keys   : [{ t, v, ease, h }] sorted ascending by t
 *
 * The ease on a key governs the segment that *leaves* it, which is the
 * convention every keyframe UI uses.
 */
export function createTrack({ target, path, type = 'number', keys = [] }) {
    return { target, path, type, keys: [...keys].sort((a, b) => a.t - b.t) };
}

export function setKey(track, t, v, ease = 'linear', h) {
    const key = { t, v, ...(ease !== 'linear' ? { ease } : {}), ...(h ? { h } : {}) };
    const i = track.keys.findIndex((k) => k.t === t);
    if (i >= 0) track.keys[i] = key;
    else {
        track.keys.push(key);
        track.keys.sort((a, b) => a.t - b.t);
    }
    return track;
}

/**
 * Sample a track at time t. Clamps outside the key range rather than
 * extrapolating, so a shot that outlives its keys holds the last pose.
 */
export function trackValueAt(track, t) {
    const keys = track.keys;
    if (keys.length === 0) return undefined;
    if (keys.length === 1 || t <= keys[0].t) return keys[0].v;
    const last = keys[keys.length - 1];
    if (t >= last.t) return last.v;

    // binary search for the segment [lo, lo+1] containing t
    let lo = 0, hi = keys.length - 1;
    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (keys[mid].t <= t) lo = mid; else hi = mid;
    }
    const a = keys[lo], b = keys[lo + 1];
    const span = b.t - a.t;
    const u = span <= 0 ? 1 : (t - a.t) / span;
    return interpolateValue(track.type, a.v, b.v, easeProgress(a.ease, u, a.h));
}

export const trackDuration = (track) =>
    track.keys.length ? track.keys[track.keys.length - 1].t : 0;
