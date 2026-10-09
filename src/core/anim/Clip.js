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
export function createClip({ id, name = id, duration, loop = 'once', tracks = [],
                             blend = 'override', mask = null }) {
    return {
        id,
        name,
        duration: duration ?? Math.max(0, ...tracks.map(trackDuration), 0),
        loop,                                  // once | repeat | pingpong
        // 'override' replaces the channel; 'add' layers a DELTA over whatever
        // the base already resolved to. Without the additive mode a pose and a
        // cycle fight over the same channel and the pose wins for the whole
        // film -- which is what left a sixty-second fight 77% frozen.
        blend,
        // Part names this clip is allowed to touch, or null for all of them.
        // The equivalent of an avatar mask: an upper-body gesture should not
        // be able to stop the legs walking.
        mask: mask ? new Set(mask) : null,
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
