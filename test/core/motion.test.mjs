/**
 * Layered evaluation, timing texture, smears and the motion-graphics draw
 * layer -- the systems added after a sixty-second fight rendered 77% frozen
 * while every other check reported clean.
 *
 * Each asserts the property that was MISSING, not merely that the new code
 * runs: a cycle survives a pose, a drawing is held for two frames while the
 * camera is not, a trail lags the thing it trails, a trimmed stroke is
 * shorter than an untrimmed one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { compileFilm } from '../../src/core/script/compile.js';
import { samplePose, applyPose, createPoseBaseline, resetPose, Additive }
    from '../../src/core/anim/Evaluator.js';
import { createClip } from '../../src/core/anim/Clip.js';
import { createTrack, setKey, trackValueAt } from '../../src/core/anim/Track.js';
import { createTimeline, addClip, addInstance } from '../../src/core/anim/Timeline.js';
import { Scene } from '../../src/core/scene/Scene.js';
import { Canvas2DBackend } from '../../src/backends/canvas2d/Canvas2DBackend.js';
import { RecordingContext, RecordingPath2D } from '../../src/backends/canvas2d/RecordingContext.js';
import { drawShape, BLEND_MODES } from '../../src/backends/canvas2d/shapes.js';
import { applyToPoint } from '../../src/core/math/mat2d.js';
import { analyseMotion } from '../../src/core/script/staging.js';

const film = (extra = {}, shots = []) => ({
    version: 'jirex.film/1',
    meta: { fps: 24, width: 1280, height: 720, ...(extra.meta ?? {}) },
    characters: { a: { generate: {}, proportions: { height: 300 },
                       poses: { pin: { torso: { sy: 1 } } } } },
    scenes: [{
        id: 's1', template: { template: 'hillside' },
        cast: [{ character: 'a', as: 'a', at: [200], ...(extra.cast ?? {}) }],
        shots,
    }],
});

// ------------------------------------------------------------------ layering

test('an additive clip layers a delta, a masked one leaves other parts alone', () => {
    const make = ({ blend, mask, weight = 1 }) => {
        const arm = createTrack({ target: 'arm', path: 'transform.rot', type: 'number' });
        setKey(arm, 0, 0.5); setKey(arm, 1, 1.5);
        const leg = createTrack({ target: 'leg', path: 'transform.rot', type: 'number' });
        setKey(leg, 0, 0); setKey(leg, 1, 2);
        const tl = createTimeline({ duration: 2 });
        addClip(tl, createClip({ id: 'c', duration: 1, loop: 'repeat',
                                 tracks: [arm, leg], blend, mask }));
        addInstance(tl, { clipId: 'c', start: 0, end: 2, scopeId: 'a', weight });
        const sc = new Scene();
        sc.add({ id: 'a', kind: 'group' });
        sc.add({ id: 'a/arm', kind: 'rect', transform: { rot: 2 } }, 'a');
        sc.add({ id: 'a/leg', kind: 'rect', transform: { rot: 9 } }, 'a');
        applyPose(sc, samplePose(tl, 0.5));
        return [sc.get('a/arm').transform.rot, sc.get('a/leg').transform.rot];
    };

    // Override replaces outright; additive offsets from the clip's own rest.
    assert.deepEqual(make({ blend: 'override' }).map((v) => +v.toFixed(3)), [1, 1]);
    assert.deepEqual(make({ blend: 'add' }).map((v) => +v.toFixed(3)), [2.5, 10]);
    assert.deepEqual(make({ blend: 'add', weight: 0.5 }).map((v) => +v.toFixed(3)), [2.25, 9.5]);

    // A mask is how an upper-body gesture stops being able to halt the legs.
    assert.deepEqual(make({ blend: 'override', mask: ['arm'] }).map((v) => +v.toFixed(3)),
                     [1, 9], 'the unmasked part keeps its authored value');
});

test('scale layers as a ratio and rotation as an offset', () => {
    const t = createTrack({ target: 'n', path: 'transform.sy', type: 'number' });
    setKey(t, 0, 1); setKey(t, 1, 1.5);
    const tl = createTimeline({ duration: 2 });
    addClip(tl, createClip({ id: 'c', duration: 1, loop: 'repeat', tracks: [t], blend: 'add' }));
    addInstance(tl, { clipId: 'c', start: 0, end: 2, scopeId: 'a' });
    const sc = new Scene();
    sc.add({ id: 'a', kind: 'group' });
    sc.add({ id: 'a/n', kind: 'rect', transform: { sy: 2 } }, 'a');
    applyPose(sc, samplePose(tl, 0.5));
    // A scale that layered as an offset would read 2.25; as a ratio it is 2.5.
    assert.ok(Math.abs(sc.get('a/n').transform.sy - 2.5) < 1e-9,
        `scale is a ratio, got ${sc.get('a/n').transform.sy}`);
});

test('a cycle survives a pose on the same channel', () => {
    const f = film({}, [{ id: 'x', duration: 4, actions: [
        { target: 'a', do: 'play', action: 'breathe', at: 0 },
        { target: 'a', do: 'pose', pose: 'pin', at: 0.5 },
    ] }]);
    const { scene, timeline } = compileFilm(f, {});
    const baseline = createPoseBaseline(scene, timeline);
    const sy = (t) => {
        resetPose(scene, baseline);
        applyPose(scene, samplePose(timeline, t));
        return scene.get('s1/a/torso').transform.sy;
    };
    assert.notEqual(sy(0.3), 1, 'breathing before the pose');
    assert.notEqual(sy(2.5), 1, 'and still breathing long after it');
});

// -------------------------------------------------------------------- timing

test('on twos holds the cast for two frames and leaves the camera on ones', () => {
    const shots = [{ id: 'x', duration: 2,
        camera: { from: { x: 0, y: 0, zoom: 1 }, to: { x: 200, y: 0, zoom: 1 } },
        actions: [{ target: 'a', do: 'move', to: [1000], for: 2 }] }];
    const read = (step) => {
        const { timeline } = compileFilm(film({ meta: step ? { step } : {} }, shots), {});
        const at = (f, id, p) => samplePose(timeline, f / 24).get(id)?.get(p);
        return {
            cast: [0, 1, 2, 3].map((f) => +at(f, 's1/a', 'transform.x').toFixed(3)),
            cam: [0, 1, 2, 3].map((f) => +at(f, '__camera', 'transform.x').toFixed(3)),
        };
    };
    const ones = read(0), twos = read(2), threes = read(3);
    assert.equal(new Set(ones.cast).size, 4, 'on ones every frame is a new drawing');
    assert.equal(twos.cast[0], twos.cast[1], 'on twos frames pair up');
    assert.notEqual(twos.cast[1], twos.cast[2]);
    assert.equal(threes.cast[0], threes.cast[2], 'on threes they come in threes');
    // The camera must not judder: a quantised pan is the classic mistake.
    assert.equal(new Set(twos.cam).size, 4, 'the camera stays on ones');
});

test('motion is measured per DRAWING, so on twos is not scored as frozen', () => {
    const shots = [{ id: 'x', duration: 2,
        actions: [{ target: 'a', do: 'move', to: [1000], for: 2 }] }];
    const frozenOf = (step) => {
        const f = film({ meta: step ? { step } : {} }, shots);
        return analyseMotion(compileFilm(f, {}), f).frozen;
    };
    assert.ok(frozenOf(0) < 0.05, 'a continuous move is not frozen on ones');
    assert.ok(frozenOf(2) < 0.05,
        'and is not frozen on twos either -- every second frame is a duplicate by construction');
});

// -------------------------------------------------------------------- smears

test('a trail lags the drawing it trails, and only during the shots that ask', () => {
    const shots = [
        { id: 'slow', duration: 1 },
        { id: 'fast', duration: 2, actions: [{ target: 'a', do: 'move', to: [1000], for: 2 }] },
    ];
    const f = film({ cast: { echo: { frames: 3, spacing: 2, falloff: 0.5, shots: ['fast'] } } }, shots);
    const { scene, timeline } = compileFilm(f, {});
    const baseline = createPoseBaseline(scene, timeline);
    resetPose(scene, baseline);
    applyPose(scene, samplePose(timeline, 2.0));
    const xs = ['s1/a', 's1/a#echo1', 's1/a#echo2', 's1/a#echo3']
        .map((id) => applyToPoint(scene.worldMatrix(id), 0, 0)[0]);
    for (let i = 1; i < xs.length; i++) {
        assert.ok(xs[i] < xs[i - 1], `ghost ${i} trails behind ghost ${i - 1}`);
    }
    // Gated: nothing shows during the shot that did not ask for it.
    const alpha = timeline._index.get('s1/a#echo1\u0000props.alpha');
    assert.equal(trackValueAt(alpha, 0.5), 0, 'no trail in the slow shot');
    assert.ok(trackValueAt(alpha, 2.0) > 0, 'a trail in the fast one');
    assert.ok(trackValueAt(alpha, 2.95) > 0);
});

// ----------------------------------------------------- motion-graphics layer

test('a repeater draws many copies from one node, with accumulating offsets', () => {
    const sc = new Scene();
    sc.add({ id: 'ray', kind: 'path',
             props: { d: 'M100,0 L300,0', stroke: '#fff', strokeWidth: 3,
                      repeat: { count: 12, rot: 0.5, alpha: 0.9 } } });
    const ctx = new RecordingContext({ width: 200, height: 200 });
    new Canvas2DBackend({ width: 200, height: 200, ctx, Path2DImpl: RecordingPath2D })
        .renderFrame(sc, null);
    const strokes = ctx.calls.filter((c) => String(c).startsWith('stroke'));
    assert.equal(strokes.length, 12, 'one node, twelve drawings');
    const transforms = ctx.calls.filter((c) => String(c).startsWith('setTransform'));
    assert.ok(new Set(transforms).size >= 12, 'each copy is placed differently');
});

test('a trimmed stroke draws a fraction of its length; blend and glow are set and cleared', () => {
    const draw = (props) => {
        const ctx = new RecordingContext({ width: 100, height: 100 });
        drawShape(ctx, { kind: 'path', props: { d: 'M0,0 L50,0', stroke: '#fff', ...props } },
                  { Path2DImpl: RecordingPath2D });
        return ctx;
    };
    const plain = draw({});
    assert.equal(plain.calls.filter((c) => String(c).startsWith('setLineDash')).length, 0,
        'an untrimmed stroke sets no dash at all');

    const trimmed = draw({ trim: { start: 0.25, end: 0.75 } });
    const dash = trimmed.calls.find((c) => String(c).startsWith('setLineDash'));
    const [, on, off] = String(dash).split(',').map(Number);
    // The pattern is [drawn, skipped] where `skipped` is longer than any path
    // the engine draws, so exactly one dash lands: the drawn run is the
    // trimmed fraction of that reference length.
    assert.ok(Math.abs(on / off - 0.5) < 1e-6, `half the length is drawn, got ${on}/${off}`);

    // A fully closed trim draws nothing rather than drawing everything.
    assert.equal(draw({ trim: { start: 0.5, end: 0.5 } })
        .calls.filter((c) => String(c).startsWith('stroke')).length, 0);

    assert.ok(BLEND_MODES.includes('add') && BLEND_MODES.includes('multiply'));
    const lit = draw({ blend: 'add', glow: { blur: 10, color: '#0ff' } });
    // Compositing is context-wide: left on, it bleeds into every later node.
    assert.equal(lit.globalCompositeOperation, 'source-over', 'blend is reset');
    assert.equal(lit.shadowBlur, 0, 'glow is reset');
});

test('an Additive resolves over whatever the base layer produced', () => {
    assert.equal(new Additive(2, 1).over(5), 7);
    assert.equal(new Additive(0, 1.5).over(4), 6);
    assert.equal(new Additive(1, 2).add(new Additive(2, 3)).over(1), 9);
    assert.equal(new Additive(3, 1).over(undefined), 3, 'no base means the delta alone');
});
