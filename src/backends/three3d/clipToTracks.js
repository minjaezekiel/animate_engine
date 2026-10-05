/**
 * Convert a THREE.AnimationClip into core tracks.
 *
 * This is what retires AnimationMixer for imported glTF: a clip is converted
 * once at import and then evaluated by the same code that evaluates everything
 * else, so imported animation scrubs, exports and renders deterministically
 * like hand-keyed animation does.
 *
 * Pure: it reads `name`, `times`, `values` and the interpolation constant off
 * the tracks and never touches THREE itself.
 */

// THREE.InterpolateDiscrete / Linear / Smooth. Inlined rather than imported so
// this stays runnable without THREE present.
const DISCRETE = 2300;
const SMOOTH = 2302;

const EASE_FOR = { [DISCRETE]: 'step', [SMOOTH]: 'smooth' };

/**
 * A clip track name is `<object>.<property>` or `<object>.<property>[<index>]`,
 * where `<object>` may itself be a uuid, a name, or a bone path like
 * `.bones[Hips]`. The object part is handed back untouched so the caller can
 * resolve it however it resolves things.
 */
export function parseTrackName(name) {
    const dot = name.lastIndexOf('.');
    if (dot < 0) return null;
    const target = name.slice(0, dot).replace(/^\./, '');
    const rest = name.slice(dot + 1);
    const bracket = rest.indexOf('[');
    if (bracket < 0) return { target, property: rest, index: null };
    return {
        target,
        property: rest.slice(0, bracket),
        index: rest.slice(bracket + 1, rest.indexOf(']')),
    };
}

const CHANNEL = {
    position: { path: () => 'position', type: 'vec3', stride: 3 },
    scale: { path: () => 'scale', type: 'vec3', stride: 3 },
    quaternion: { path: () => 'quaternion', type: 'quat', stride: 4 },
    morphTargetInfluences: { path: (i) => `morphIndex.${i}`, type: 'number', stride: 1 },
    visible: { path: () => 'visible', type: 'discrete', stride: 1 },
};

export function clipToTracks(clip, { resolveTarget = (t) => t } = {}) {
    const out = [];
    const skipped = [];

    for (const track of clip.tracks ?? []) {
        const parsed = parseTrackName(track.name ?? '');
        const spec = parsed && CHANNEL[parsed.property];
        if (!spec) { skipped.push(track.name); continue; }

        const target = resolveTarget(parsed.target, track);
        if (!target) { skipped.push(track.name); continue; }

        // getInterpolation() is a method on KeyframeTrack; a plain object
        // stand-in may carry the constant directly.
        const mode = typeof track.getInterpolation === 'function'
            ? track.getInterpolation() : track.interpolation;
        const ease = EASE_FOR[mode] ?? 'linear';

        const keys = [];
        for (let i = 0; i < track.times.length; i++) {
            const base = i * spec.stride;
            const v = spec.stride === 1
                ? track.values[base]
                : Array.from(track.values.slice(base, base + spec.stride));
            keys.push({ t: track.times[i], v, ...(ease !== 'linear' ? { ease } : {}) });
        }

        out.push({
            target,
            path: spec.path(parsed.index),
            type: spec.type,
            keys,
        });
    }

    return { tracks: out, skipped };
}

/** A whole clip as a core Timeline, ready to sample. */
export function timelineFromClip(clip, options = {}) {
    const { tracks, skipped } = clipToTracks(clip, options);
    return {
        fps: options.fps ?? 30,
        duration: clip.duration ?? tracks.reduce(
            (d, t) => Math.max(d, t.keys.length ? t.keys[t.keys.length - 1].t : 0), 0),
        tracks,
        instances: [],
        clips: new Map(),
        skipped,
    };
}

/**
 * A clip as the editor's own keyframe model.
 *
 * Converting all the way down rather than keeping clips in a parallel store
 * is what leaves the mixer with no job at all: imported animation becomes
 * ordinary keyframes, so it scrubs, exports, renders and can be EDITED by the
 * same code as hand-keyed animation. The old engine stashed clips in a Map
 * that nothing ever read.
 *
 * Track times differ per channel, so each object's channels are resampled
 * onto the union of their key times. That is exact at every authored key and
 * interpolated in between, which is the best a single-time-list model allows.
 */
export function clipToKeyframes(clip, { resolveTarget, trackValueAt, eulerFromQuat }) {
    const { tracks, skipped } = clipToTracks(clip, { resolveTarget });
    const byTarget = new Map();
    for (const track of tracks) {
        let list = byTarget.get(track.target);
        if (!list) byTarget.set(track.target, (list = []));
        list.push(track);
    }

    const keyframes = new Map();
    for (const [target, list] of byTarget) {
        const times = [...new Set(list.flatMap((t) => t.keys.map((k) => k.t)))].sort((a, b) => a - b);
        const out = [];
        for (const time of times) {
            const properties = {};
            for (const track of list) {
                const value = trackValueAt(track, time);
                if (value === undefined) continue;
                if (track.path === 'position') properties.position = value;
                else if (track.path === 'scale') properties.scale = value;
                else if (track.path === 'quaternion') properties.rotation = eulerFromQuat(value);
                else if (track.path === 'visible') properties.visible = value;
                else if (track.path.startsWith('morphIndex.')) {
                    (properties.morphIndices ??= {})[track.path.slice(11)] = value;
                }
            }
            out.push({ time, properties });
        }
        keyframes.set(target, out);
    }
    return { keyframes, skipped };
}
