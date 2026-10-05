import test from 'node:test';
import assert from 'node:assert/strict';

import { quatFromEuler, eulerFromQuat } from '../../src/backends/three3d/eulerQuat.js';
import { timelineFromAnimation, timelineTargets } from '../../src/backends/three3d/legacyTracks.js';
import {
    clipToTracks, clipToKeyframes, parseTrackName, timelineFromClip,
} from '../../src/backends/three3d/clipToTracks.js';
import { applyPoseToObjects, applyChannel } from '../../src/backends/three3d/PoseApplier.js';
import { samplePose } from '../../src/core/anim/Evaluator.js';
import { trackValueAt } from '../../src/core/anim/Track.js';
import { getTrack } from '../../src/core/anim/Timeline.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} !~= ${b}`);

/** A stand-in for a THREE.Object3D: this path touches only instance methods. */
function fakeObject({ morphs = null } = {}) {
    const vec = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } });
    return {
        position: vec(),
        scale: { ...vec(), x: 1, y: 1, z: 1 },
        quaternion: { x: 0, y: 0, z: 0, w: 1,
                      set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; } },
        visible: true,
        material: { color: { hex: 0, style: null,
                             setHex(h) { this.hex = h; }, setStyle(s) { this.style = s; },
                             getHex() { return this.hex; } } },
        morphTargetDictionary: morphs ? { smile: 0, frown: 1 } : undefined,
        morphTargetInfluences: morphs ? [0, 0] : undefined,
    };
}

// ------------------------------------------------------------- euler/quat

test('euler to quaternion matches the XYZ convention', () => {
    assert.deepEqual(quatFromEuler([0, 0, 0]), [0, 0, 0, 1]);
    const q = quatFromEuler([Math.PI / 2, 0, 0]);
    near(q[0], Math.SQRT1_2);
    near(q[3], Math.SQRT1_2);
});

test('euler/quaternion round trips, including at the pole', () => {
    for (const e of [[0, 0, 0], [0.3, -1.1, 2.0], [1.5, 0.3, 0.2],
                     [0.4, Math.PI / 2, 0.9], [-2.9, 1.5707963, 1.2]]) {
        const q = quatFromEuler(e);
        const again = quatFromEuler(eulerFromQuat(q));
        // Compare quaternions, not angles: at the pole x and z stop being
        // separable, so the angles legitimately differ while the rotation
        // does not.
        const err = Math.max(...q.map((v, i) => Math.abs(v - again[i])));
        // Loose at 1e-7 because the decomposition is ill-conditioned at the
        // pole: asin near +-1 loses precision no matter how it is written.
        // 1e-8 on a unit quaternion is about two millionths of a degree.
        assert.ok(err < 1e-7, `${e} round-tripped to a different rotation (${err})`);
    }
});

test('eulerFromQuat never returns NaN', () => {
    for (const q of [[0, 0, 0, 1], [1, 0, 0, 0], [0, Math.SQRT1_2, 0, Math.SQRT1_2],
                     [0.5, 0.5, 0.5, 0.5]]) {
        for (const v of eulerFromQuat(q)) assert.ok(Number.isFinite(v), `${q} -> NaN`);
    }
});

// ------------------------------------------------- legacy keyframes -> core

const legacyAnimation = (keyframes, extra = {}) => ({
    name: 'a', duration: 2, loop: 'once', keyframes: new Map(Object.entries(keyframes)), ...extra,
});

test('position, scale and rotation become typed tracks', () => {
    const timeline = timelineFromAnimation(legacyAnimation({
        u1: [{ time: 0, properties: { position: [0, 0, 0], scale: [1, 1, 1], rotation: [0, 0, 0] } },
             { time: 2, properties: { position: [10, 0, 0], scale: [2, 2, 2], rotation: [0, Math.PI, 0] } }],
    }));
    assert.equal(getTrack(timeline, 'u1', 'position').type, 'vec3');
    assert.equal(getTrack(timeline, 'u1', 'scale').type, 'vec3');
    // Euler in, quaternion out, so rotation is slerped rather than lerped.
    const rot = getTrack(timeline, 'u1', 'quaternion');
    assert.equal(rot.type, 'quat');
    assert.equal(rot.keys[1].v.length, 4);
    near(trackValueAt(getTrack(timeline, 'u1', 'position'), 1)[0], 5);
});

test('rotation takes the short way round', () => {
    // 350 degrees to 10 degrees is a 20 degree move, not a 340 degree one.
    const timeline = timelineFromAnimation(legacyAnimation({
        u1: [{ time: 0, properties: { rotation: [0, (350 * Math.PI) / 180, 0] } },
             { time: 2, properties: { rotation: [0, (10 * Math.PI) / 180, 0] } }],
    }));
    const mid = eulerFromQuat(trackValueAt(getTrack(timeline, 'u1', 'quaternion'), 1));
    const deg = ((mid[1] * 180) / Math.PI + 360) % 360;
    assert.ok(deg > 359 || deg < 1, `halfway should be ~0/360 degrees, got ${deg}`);
});

test('per-keyframe interp beats the animation default, which beats linear', () => {
    const smooth = timelineFromAnimation(legacyAnimation({
        u1: [{ time: 0, properties: { position: [0, 0, 0] } },
             { time: 2, properties: { position: [10, 0, 0] } }],
    }, { easing: 'smooth' }));
    assert.equal(getTrack(smooth, 'u1', 'position').keys[0].ease, 'smooth');

    const stepped = timelineFromAnimation(legacyAnimation({
        u1: [{ time: 0, properties: { position: [0, 0, 0], interp: 'step' } },
             { time: 2, properties: { position: [10, 0, 0], interp: 'step' } }],
    }, { easing: 'smooth' }));
    assert.equal(getTrack(stepped, 'u1', 'position').keys[0].ease, 'step');
    assert.equal(trackValueAt(getTrack(stepped, 'u1', 'position'), 1.9)[0], 0);
});

test('rotation honours interp, which the mixer path never did', () => {
    const timeline = timelineFromAnimation(legacyAnimation({
        u1: [{ time: 0, properties: { rotation: [0, 0, 0], interp: 'step' } },
             { time: 2, properties: { rotation: [0, Math.PI, 0], interp: 'step' } }],
    }));
    const q = trackValueAt(getTrack(timeline, 'u1', 'quaternion'), 1.9);
    near(q[1], 0, 1e-9);
});

test('bezier handles ride the key, so easing is exact at any frame rate', () => {
    const timeline = timelineFromAnimation(legacyAnimation({
        u1: [{ time: 0, properties: { position: [0, 0, 0], interp: 'bezier', handles: [0.9, 0, 0.1, 1] } },
             { time: 2, properties: { position: [10, 0, 0] } }],
    }));
    const track = getTrack(timeline, 'u1', 'position');
    assert.deepEqual(track.keys[0].h, [0.9, 0, 0.1, 1]);
    // Sampled at an arbitrary time, not quantized to a 30fps densification.
    const a = trackValueAt(track, 0.7333333)[0];
    const b = trackValueAt(track, 0.7666667)[0];
    assert.ok(a !== b, 'bezier was quantized rather than sampled');
});

test('colour and morph keyframes produce tracks', () => {
    const timeline = timelineFromAnimation(legacyAnimation({
        u1: [{ time: 0, properties: { color: '#000000', morphs: { smile: 0 } } },
             { time: 2, properties: { color: '#ffffff', morphs: { smile: 1 } } }],
    }));
    assert.equal(getTrack(timeline, 'u1', 'color').type, 'color');
    near(trackValueAt(getTrack(timeline, 'u1', 'morph.smile'), 1), 0.5);
});

test('an empty or keyframeless animation yields an empty timeline, not a throw', () => {
    assert.equal(timelineFromAnimation({ duration: 3 }).tracks.length, 0);
    assert.equal(timelineFromAnimation(legacyAnimation({})).tracks.length, 0);
    assert.equal(timelineFromAnimation({ duration: 3 }).duration, 3);
});

test('timelineTargets lists every channel the timeline can write', () => {
    const timeline = timelineFromAnimation(legacyAnimation({
        u1: [{ time: 0, properties: { position: [0, 0, 0], rotation: [0, 0, 0] } }],
        u2: [{ time: 0, properties: { scale: [1, 1, 1] } }],
    }));
    const targets = timelineTargets(timeline);
    assert.deepEqual([...targets.get('u1')].sort(), ['position', 'quaternion']);
    assert.deepEqual([...targets.get('u2')], ['scale']);
});

// ------------------------------------------------------ glTF clip -> core

test('parseTrackName handles uuids, bones and indexed channels', () => {
    assert.deepEqual(parseTrackName('abc.position'), { target: 'abc', property: 'position', index: null });
    assert.deepEqual(parseTrackName('.bones[Hips].quaternion'),
                     { target: 'bones[Hips]', property: 'quaternion', index: null });
    assert.deepEqual(parseTrackName('m.morphTargetInfluences[2]'),
                     { target: 'm', property: 'morphTargetInfluences', index: '2' });
    assert.equal(parseTrackName('nodots'), null);
});

const clip = {
    name: 'walk', duration: 2,
    tracks: [
        { name: 'u1.position', times: [0, 1, 2], values: [0, 0, 0, 1, 2, 3, 4, 5, 6], interpolation: 2301 },
        { name: 'u1.quaternion', times: [0, 2], values: [0, 0, 0, 1, 0, 1, 0, 0], interpolation: 2302 },
        { name: 'u1.morphTargetInfluences[1]', times: [0, 2], values: [0, 1], interpolation: 2300 },
        { name: 'u1.someUnsupportedChannel', times: [0], values: [0] },
    ],
};

test('clip tracks convert with their interpolation mode', () => {
    const { tracks, skipped } = clipToTracks(clip);
    assert.deepEqual(tracks.map((t) => t.path), ['position', 'quaternion', 'morphIndex.1']);
    assert.equal(tracks[0].keys[1].ease, undefined);      // linear is the default
    assert.equal(tracks[1].keys[0].ease, 'smooth');
    assert.equal(tracks[2].keys[0].ease, 'step');
    assert.deepEqual(tracks[0].keys[2].v, [4, 5, 6]);
    assert.deepEqual(skipped, ['u1.someUnsupportedChannel']);
});

test('an unresolvable target is skipped rather than keyed against nothing', () => {
    const { tracks, skipped } = clipToTracks(clip, { resolveTarget: () => null });
    assert.equal(tracks.length, 0);
    assert.equal(skipped.length, 4);
});

test('timelineFromClip is samplable by the core evaluator', () => {
    const timeline = timelineFromClip(clip);
    assert.equal(timeline.duration, 2);
    const pose = samplePose(timeline, 1);
    assert.deepEqual(pose.get('u1').get('position'), [1, 2, 3]);
});

test('clipToKeyframes resamples every channel onto one time list', () => {
    const { keyframes } = clipToKeyframes(clip, {
        resolveTarget: (t) => t, trackValueAt, eulerFromQuat,
    });
    const list = keyframes.get('u1');
    assert.deepEqual(list.map((k) => k.time), [0, 1, 2]);
    // t=1 is a position key but only an interpolated rotation: both appear.
    assert.deepEqual(list[1].properties.position, [1, 2, 3]);
    assert.equal(list[1].properties.rotation.length, 3);
    assert.deepEqual(list[2].properties.morphIndices, { 1: 1 });
    // The step-interpolated morph holds at 0 through t=1.
    assert.equal(list[1].properties.morphIndices['1'], 0);
});

// ------------------------------------------------------------ PoseApplier

test('each channel writes where it should', () => {
    const o = fakeObject({ morphs: true });
    applyChannel(o, 'position', [1, 2, 3]);
    applyChannel(o, 'scale', [4, 5, 6]);
    applyChannel(o, 'quaternion', [0, 1, 0, 0]);
    applyChannel(o, 'color', 0x3366cc);
    applyChannel(o, 'visible', false);
    applyChannel(o, 'morph.frown', 0.75);
    applyChannel(o, 'morphIndex.0', 0.25);
    assert.deepEqual([o.position.x, o.position.y, o.position.z], [1, 2, 3]);
    assert.deepEqual([o.scale.x, o.scale.y, o.scale.z], [4, 5, 6]);
    assert.equal(o.quaternion.y, 1);
    assert.equal(o.material.color.getHex(), 0x3366cc);
    assert.equal(o.visible, false);
    assert.deepEqual(o.morphTargetInfluences, [0.25, 0.75]);
});

test('colour accepts a hex number or a css string', () => {
    const o = fakeObject();
    applyChannel(o, 'color', '#808080');
    assert.equal(o.material.color.style, '#808080');
});

test('unknown channels, absent objects and missing morphs are ignored, not fatal', () => {
    const o = fakeObject();                      // no morph dictionary
    assert.doesNotThrow(() => {
        applyChannel(o, 'morph.smile', 1);
        applyChannel(o, 'morphIndex.3', 1);
        applyChannel(o, 'somethingElse', 1);
        applyChannel(o, 'position', undefined);
    });
    assert.equal(o.position.x, 0);
    const pose = new Map([['missing', new Map([['position', [1, 1, 1]]])]]);
    assert.doesNotThrow(() => applyPoseToObjects(pose, () => null));
});

test('a sampled pose drives real objects end to end', () => {
    const timeline = timelineFromAnimation(legacyAnimation({
        u1: [{ time: 0, properties: { position: [0, 0, 0], color: '#000000' } },
             { time: 2, properties: { position: [10, 0, 0], color: '#ffffff' } }],
    }));
    const o = fakeObject();
    const objects = { u1: o };
    applyPoseToObjects(samplePose(timeline, 1), (id) => objects[id]);
    near(o.position.x, 5);
    assert.equal(o.material.color.style, '#808080');

    // Same time, same pose -- the property the whole rewrite exists for.
    o.position.set(999, 999, 999);
    applyPoseToObjects(samplePose(timeline, 1), (id) => objects[id]);
    near(o.position.x, 5);
});
