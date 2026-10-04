import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../../src/core/scene/Scene.js';
import { transform2D } from '../../src/core/scene/Transform.js';
import { fromTransform, multiply, invert, applyToPoint, identity } from '../../src/core/math/mat2d.js';
import { Canvas2DBackend } from '../../src/backends/canvas2d/Canvas2DBackend.js';
import { RecordingContext, RecordingPath2D } from '../../src/backends/canvas2d/RecordingContext.js';
import { generateCharacterParts, generateMouth, generateActions } from '../../src/core/script/generate.js';

const round = (a) => a.map((v) => +v.toFixed(6));

test('a transform rotates about its pivot, which is what makes a joint work', () => {
    const m = fromTransform({ x: 10, y: 0, rot: Math.PI / 2, ox: 10, oy: 0 });
    assert.deepEqual(round(applyToPoint(m, 10, 0)), [10, 0], 'the pivot itself does not move');
    assert.deepEqual(round(applyToPoint(m, 20, 0)), [10, 10], 'a point past it swings');
});

test('matrix inverse round-trips and identity is neutral', () => {
    const m = fromTransform({ x: 3, y: -7, rot: 0.9, sx: 2, sy: 0.5, skx: 0.2 });
    assert.deepEqual(round(applyToPoint(multiply(m, invert(m)), 7, 3)), [7, 3]);
    assert.deepEqual(applyToPoint(identity(), 5, 9), [5, 9]);
    assert.equal(invert([0, 0, 0, 0, 0, 0]), null, 'a singular matrix has no inverse');
});

test('transform2D fills defaults without dropping given values', () => {
    assert.deepEqual(transform2D(), { x: 0, y: 0, rot: 0, sx: 1, sy: 1, skx: 0, ox: 0, oy: 0 });
    assert.equal(transform2D({ sx: 0 }).sx, 0, 'an explicit zero survives');
});

test('parent transforms propagate to descendants', () => {
    const s = new Scene();
    s.add({ id: 'hips' });
    s.add({ id: 'torso', transform: { y: -40 } }, 'hips');
    s.add({ id: 'head', transform: { y: -40 } }, 'torso');
    assert.deepEqual(round(applyToPoint(s.worldMatrix('head'), 0, 0)), [0, -80]);
    s.get('hips').transform.x = 100;
    s.invalidate('hips');
    assert.deepEqual(round(applyToPoint(s.worldMatrix('head'), 0, 0)), [100, -80]);
});

test('world matrices are cached until invalidated', () => {
    const s = new Scene();
    s.add({ id: 'a', transform: { x: 5 } });
    const first = s.worldMatrix('a');
    assert.equal(s.worldMatrix('a'), first, 'same array returned from cache');
    s.invalidate('a');
    assert.notEqual(s.worldMatrix('a'), first, 'recomputed after invalidation');
});

test('removing a node removes its subtree and nothing else', () => {
    const s = new Scene();
    s.add({ id: 'a' });
    s.add({ id: 'b' }, 'a');
    s.add({ id: 'c' }, 'b');
    s.add({ id: 'keep' });
    s.remove('b');
    assert.equal(s.has('b'), false);
    assert.equal(s.has('c'), false, 'descendants go too');
    assert.equal(s.has('a'), true);
    assert.equal(s.has('keep'), true);
    assert.deepEqual(s.get('a').childIds, [], "the parent's child list is updated");
});

test('the scene graph refuses cycles and duplicate ids', () => {
    const s = new Scene();
    s.add({ id: 'a' });
    s.add({ id: 'b' }, 'a');
    assert.throws(() => s.reparent('a', 'b'), /cycle/);
    assert.throws(() => s.add({ id: 'a' }), /duplicate/);
    assert.throws(() => s.remove(s.rootId), /root/);
    assert.throws(() => s.add({ id: 'x' }, 'nope'), /no such parent/);
});

test('draw order is z then insertion, and hidden subtrees are skipped', () => {
    const s = new Scene();
    s.add({ id: 'back', z: -10 });
    s.add({ id: 'front', z: 10 });
    s.add({ id: 'mid', z: 0 });
    s.add({ id: 'child', z: 0 }, 'front');
    assert.deepEqual(s.drawOrder().map((e) => e.node.id), ['back', 'mid', 'front', 'child']);
    s.get('front').visible = false;
    assert.deepEqual(s.drawOrder().map((e) => e.node.id), ['back', 'mid'],
        'hiding a parent hides its children');
});

test('group alpha is inherited, and a fully transparent subtree is skipped', () => {
    const s = new Scene();
    s.add({ id: 'scene', props: { alpha: 0.5 } });
    s.add({ id: 'child', props: { alpha: 0.5 } }, 'scene');
    const byId = Object.fromEntries(s.drawOrder().map((e) => [e.node.id, e.alpha]));
    assert.equal(byId.scene, 0.5);
    assert.equal(byId.child, 0.25, "a group's opacity multiplies into its children");

    s.get('scene').props.alpha = 0;
    assert.deepEqual(s.drawOrder().map((e) => e.node.id), [],
        'a transparent group costs nothing to draw');
});

test('the 2D backend draws in order, applying each world transform', () => {
    const ctx = new RecordingContext({ width: 320, height: 180 });
    const b = new Canvas2DBackend({ ctx, width: 320, height: 180, Path2DImpl: RecordingPath2D });
    const s = new Scene();
    s.add({ id: 'cam', kind: 'camera', transform: { x: 160, y: 90 }, props: { zoom: 1 } });
    s.add({ id: 'hips', kind: 'ellipse', transform: { x: 100, y: 150 }, props: { rx: 9, ry: 7, fill: '#f00' }, z: 1 });
    s.add({ id: 'head', kind: 'ellipse', transform: { y: -40 }, props: { rx: 10, ry: 11, fill: '#0f0' }, z: 2 }, 'hips');
    b.renderFrame(s, 'cam');
    const log = ctx.log();
    assert.ok(log[0].startsWith('setTransform 1 0 0 1 0 0'), 'resets before clearing');
    assert.ok(log[1].startsWith('clearRect'));
    const transforms = ctx.calls.filter((c) => c[0] === 'setTransform');
    assert.ok(transforms.some((c) => c[5] === 100 && c[6] === 150), 'hips at its world position');
    assert.ok(transforms.some((c) => c[5] === 100 && c[6] === 110), 'head inherits hips');
});

test('the camera centres the frame and zooms about that centre', () => {
    const ctx = new RecordingContext({ width: 1280, height: 720 });
    const b = new Canvas2DBackend({ ctx, width: 1280, height: 720, Path2DImpl: RecordingPath2D });
    const s = new Scene();
    s.add({ id: 'cam', kind: 'camera', transform: { x: 640, y: 360 }, props: { zoom: 1 } });
    s.add({ id: 'dot', kind: 'ellipse', transform: { x: 420, y: 540 }, props: { rx: 1, ry: 1, fill: '#fff' } });
    b.renderFrame(s, 'cam');
    const m = ctx.calls.filter((c) => c[0] === 'setTransform').at(-2);
    assert.deepEqual([m[5], m[6]], [420, 540],
        'with the camera at frame centre, authored coords are screen coords');
});

test('screen-space nodes ignore the camera, so overlays survive a pan', () => {
    const ctx = new RecordingContext({ width: 320, height: 180 });
    const b = new Canvas2DBackend({ ctx, width: 320, height: 180, Path2DImpl: RecordingPath2D });
    const s = new Scene();
    s.add({ id: 'cam', kind: 'camera', transform: { x: 999, y: 999 }, props: { zoom: 3 } });
    s.add({ id: 'ov', kind: 'rect', props: { w: 320, h: 180, fill: '#000', screenSpace: true } });
    b.renderFrame(s, 'cam');
    const m = ctx.calls.filter((c) => c[0] === 'setTransform')[1];
    assert.deepEqual(m.slice(1), [1, 0, 0, 1, 0, 0], 'drawn unmoved despite an extreme camera');
});

test('the generated humanoid is a complete, well-formed rig', () => {
    const parts = generateCharacterParts({});
    const ids = new Set(parts.map((p) => p.id));
    assert.ok(parts.length >= 15, 'enough parts to read as a figure');
    assert.deepEqual(parts.filter((p) => p.parent && !ids.has(p.parent)), [], 'no orphan parts');
    assert.equal(parts.filter((p) => !p.parent).length, 1, 'exactly one root');
    for (const side of ['L', 'R']) {
        for (const limb of ['arm', 'fore', 'hand', 'thigh', 'shin', 'foot']) {
            assert.ok(ids.has(limb + side), `${limb}${side} exists`);
        }
    }
    // proportions must actually scale the figure
    const tall = generateCharacterParts({}, { height: 400 });
    const hips = parts.find((p) => p.id === 'hips');
    const hipsTall = tall.find((p) => p.id === 'hips');
    assert.ok(hipsTall.shape.rx > hips.shape.rx, 'height drives the geometry');
});

test('generated mouths and actions line up with the generated rig', () => {
    const parts = generateCharacterParts({});
    const ids = new Set(parts.map((p) => p.id));
    const mouth = generateMouth();
    assert.ok(ids.has(mouth.parent), 'the mouth attaches to a real part');
    assert.ok(Object.keys(mouth.shapes).length >= 6, 'all six visemes have geometry');

    for (const [name, action] of Object.entries(generateActions())) {
        assert.ok(action.duration > 0, `${name} has a duration`);
        for (const channel of Object.keys(action.keys)) {
            const part = channel.slice(0, channel.lastIndexOf('.'));
            assert.ok(ids.has(part), `${name} animates a real part (${part})`);
        }
    }
});
