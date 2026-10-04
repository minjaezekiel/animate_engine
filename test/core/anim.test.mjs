import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FrameClock } from '../../src/core/time/FrameClock.js';
import { createTrack, setKey, trackValueAt } from '../../src/core/anim/Track.js';
import { createClip, clipLocalTime } from '../../src/core/anim/Clip.js';
import { createTimeline, key, addClip, addInstance } from '../../src/core/anim/Timeline.js';
import { samplePose, applyPose, createPoseBaseline, resetPose } from '../../src/core/anim/Evaluator.js';
import { cubicBezierEase, easeProgress } from '../../src/core/anim/easing.js';
import { slerpQuat, lerpColor, interpolateValue } from '../../src/core/anim/interpolate.js';
import { Scene } from '../../src/core/scene/Scene.js';

test('FrameClock: frame index to seconds is exact, with no drift at the end', () => {
    const c = new FrameClock(24);
    assert.equal(c.count(120), 2880);
    assert.equal(c.timeOf(0), 0);
    // division, not accumulation: the identity must hold at the last frame
    assert.equal(c.timeOf(2879) * 24, 2879);
    for (const n of [1, 7, 719, 1440, 2879]) assert.equal(c.frameOf(c.timeOf(n)), n);
    assert.throws(() => new FrameClock(0), /positive/);
});

test('Track: clamps outside its key range instead of extrapolating', () => {
    const t = createTrack({ target: 'a', path: 'transform.x', keys: [{ t: 1, v: 10 }, { t: 3, v: 30 }] });
    assert.equal(trackValueAt(t, 0), 10, 'before the first key holds it');
    assert.equal(trackValueAt(t, 2), 20, 'linear between');
    assert.equal(trackValueAt(t, 9), 30, 'after the last key holds it');
    assert.equal(trackValueAt(createTrack({ target: 'a', path: 'p', keys: [] }), 0), undefined);
});

test('Track: ease belongs to the key it leaves', () => {
    const t = createTrack({ target: 'a', path: 'transform.x', type: 'number' });
    setKey(t, 0, 0, 'step');
    setKey(t, 2, 100, 'linear');
    assert.equal(trackValueAt(t, 0.5), 0, 'step holds the left value');
    assert.equal(trackValueAt(t, 1.999), 0);
    assert.equal(trackValueAt(t, 2), 100, 'then jumps at the next key');
});

test('Track: setKey replaces a key at the same time rather than duplicating', () => {
    const t = createTrack({ target: 'a', path: 'transform.x' });
    setKey(t, 1, 5);
    setKey(t, 1, 9);
    assert.equal(t.keys.length, 1);
    assert.equal(t.keys[0].v, 9);
});

test('easing: bezier matches the engine original, smooth and step behave', () => {
    assert.equal(cubicBezierEase(0.42, 0, 0.58, 1, 0), 0);
    assert.equal(cubicBezierEase(0.42, 0, 0.58, 1, 1), 1);
    assert.ok(Math.abs(cubicBezierEase(0.42, 0, 0.58, 1, 0.5) - 0.5) < 1e-6);
    assert.ok(cubicBezierEase(0.42, 0, 1, 1, 0.25) < 0.25, 'ease-in is slow early');
    assert.equal(easeProgress('step', 0.9), 0);
    assert.equal(easeProgress('hold', 0.9), 0);
    assert.ok(Math.abs(easeProgress('smooth', 0.5) - 0.5) < 1e-9);
    assert.equal(easeProgress('linear', 0.37), 0.37);
});

test('interpolate: quaternions take the short arc and stay unit length', () => {
    const q = slerpQuat([0, 0, 0, 1], [0, 0, Math.sin(Math.PI / 2), Math.cos(Math.PI / 2)], 0.5);
    assert.ok(Math.abs(Math.hypot(...q) - 1) < 1e-4);
    // negated target represents the same rotation; slerp must not take the long way
    const a = slerpQuat([0, 0, 0, 1], [0, 0, 0.2, 0.98], 0.5);
    const b = slerpQuat([0, 0, 0, 1], [0, 0, -0.2, -0.98], 0.5);
    assert.ok(Math.abs(a[2] - b[2]) < 1e-6, 'sign-flipped target gives the same path');
});

test('interpolate: colours and discrete channels', () => {
    assert.equal(lerpColor('#000000', '#ffffff', 0.5), '#808080');
    assert.equal(lerpColor('#000', '#fff', 1), '#ffffff', 'short hex expands');
    assert.equal(interpolateValue('discrete', 'a', 'b', 0.99), 'a', 'discrete holds');
    assert.equal(interpolateValue('discrete', 'a', 'b', 1), 'b', 'then jumps');
});

test('Clip: loop modes map absolute time into local time', () => {
    const once = createClip({ id: 'o', duration: 2, loop: 'once' });
    const rep = createClip({ id: 'r', duration: 2, loop: 'repeat' });
    const ping = createClip({ id: 'p', duration: 2, loop: 'pingpong' });
    assert.equal(clipLocalTime(once, 5), 2, 'once clamps');
    assert.equal(clipLocalTime(rep, 5), 1, 'repeat wraps');
    assert.equal(clipLocalTime(ping, 3), 1, 'pingpong reverses');
    assert.equal(clipLocalTime(ping, 4), 0, 'and returns');
    assert.equal(clipLocalTime(rep, -1), 0, 'negative time is clamped');
});

test('Timeline: key() finds or creates a track and infers its type', () => {
    const tl = createTimeline({ fps: 24 });
    key(tl, 'a', 'transform.x', 0, 0);
    key(tl, 'a', 'transform.x', 1, 10);
    key(tl, 'a', 'props.fill', 0, '#ff0000');
    key(tl, 'a', 'props.viseme', 0, 'closed');
    assert.equal(tl.tracks.length, 3, 'one track per channel');
    assert.equal(tl.tracks[0].keys.length, 2);
    assert.equal(tl.tracks[1].type, 'color');
    assert.equal(tl.tracks[2].type, 'discrete');
    assert.equal(tl.duration, 1, 'duration grows to the last key');
});

test('Evaluator: clip instances are scoped and bounded', () => {
    const tl = createTimeline({ fps: 24 });
    addClip(tl, createClip({
        id: 'walk', duration: 1, loop: 'repeat',
        tracks: [createTrack({ target: 'hips', path: 'transform.y', keys: [{ t: 0, v: 0 }, { t: 0.5, v: -3 }, { t: 1, v: 0 }] })],
    }));
    addInstance(tl, { clipId: 'walk', start: 2, end: 4, scopeId: 'scene/mara' });
    tl.duration = 10;

    assert.equal(samplePose(tl, 1).has('scene/mara/hips'), false, 'silent before start');
    assert.equal(samplePose(tl, 2.5).get('scene/mara/hips').get('transform.y'), -3, 'scoped id resolved');
    assert.equal(samplePose(tl, 3.5).get('scene/mara/hips').get('transform.y'), -3, 'cycle tiles');
    assert.equal(samplePose(tl, 5).has('scene/mara/hips'), false, 'silent after end');
});

test('Evaluator: explicit tracks win over clip instances', () => {
    const tl = createTimeline({ fps: 24 });
    addClip(tl, createClip({
        id: 'c', duration: 1, loop: 'repeat',
        tracks: [createTrack({ target: 'n', path: 'transform.x', keys: [{ t: 0, v: 100 }] })],
    }));
    addInstance(tl, { clipId: 'c', start: 0, end: 10, scopeId: null });
    key(tl, 'n', 'transform.x', 0, 7);
    assert.equal(samplePose(tl, 0.5).get('n').get('transform.x'), 7);
});

test('Evaluator: applyPose writes transforms and props, and invalidates', () => {
    const s = new Scene();
    s.add({ id: 'p' });
    s.add({ id: 'c', transform: { x: 5 } }, 'p');
    const before = s.worldMatrix('c')[4];
    const pose = new Map([['p', new Map([['transform.x', 20], ['props.fill', '#abc']])]]);
    applyPose(s, pose);
    assert.equal(s.get('p').props.fill, '#abc');
    assert.notEqual(s.worldMatrix('c')[4], before, 'child world matrix recomputed');
});

test('Evaluator: baseline + reset make frame N independent of render history', () => {
    const s = new Scene();
    s.add({ id: 'mara' });
    s.add({ id: 'mara/hips', transform: { y: 0 } }, 'mara');
    const tl = createTimeline({ fps: 24 });
    addClip(tl, createClip({
        id: 'walk', duration: 1, loop: 'repeat',
        tracks: [createTrack({ target: 'hips', path: 'transform.y', keys: [{ t: 0, v: 0 }, { t: 0.5, v: -9 }] })],
    }));
    addInstance(tl, { clipId: 'walk', start: 0, end: 1, scopeId: 'mara' });
    tl.duration = 5;

    const baseline = createPoseBaseline(s, tl);
    // run the clip so it leaves a pose behind
    applyPose(s, samplePose(tl, 0.5));
    assert.equal(s.get('mara/hips').transform.y, -9, 'clip posed it');

    // a later frame writes nothing for this channel; without a reset the
    // stale -9 would persist and frame 3 would depend on frame 0.5
    applyPose(s, samplePose(tl, 3));
    assert.equal(s.get('mara/hips').transform.y, -9, 'stale without reset');
    resetPose(s, baseline);
    applyPose(s, samplePose(tl, 3));
    assert.equal(s.get('mara/hips').transform.y, 0, 'reset restores the authored pose');
});
