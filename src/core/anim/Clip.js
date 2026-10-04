import { trackDuration } from './Track.js';

/**
 * A Clip is a reusable bundle of tracks with its own local time base, e.g. a
 * 0.9-second walk cycle. Clips are instanced onto a Timeline rather than
 * baked into it, so a looping cycle costs a handful of keys no matter how
 * long it plays.
 *
 * Clip track targets are *relative* part names ('torso', 'armL'); the
 * instance's scope prefix resolves them to real node ids at sample time.
 */
export function createClip({ id, name = id, duration, loop = 'once', tracks = [] }) {
    return {
        id,
        name,
        duration: duration ?? Math.max(0, ...tracks.map(trackDuration), 0),
        loop,                                  // once | repeat | pingpong
        tracks,
    };
}

/** Map an absolute time into a clip's local time, honoring its loop mode. */
export function clipLocalTime(clip, local) {
    const d = clip.duration;
    if (d <= 0) return 0;
    if (local < 0) return 0;
    switch (clip.loop) {
        case 'repeat':
            return local % d;
        case 'pingpong': {
            const cycle = local % (2 * d);
            return cycle <= d ? cycle : 2 * d - cycle;
        }
        case 'once':
        default:
            return Math.min(local, d);
    }
}
