import test from 'node:test';
import assert from 'node:assert/strict';

import { Scene } from '../../src/core/scene/Scene.js';
import { Canvas2DBackend } from '../../src/backends/canvas2d/Canvas2DBackend.js';
import { RecordingContext, RecordingPath2D } from '../../src/backends/canvas2d/RecordingContext.js';
import { compileFilm } from '../../src/core/script/compile.js';

/**
 * Rendering a film at a size other than the one it was authored at must
 * SCALE it, not crop it.
 *
 * It used to crop: the camera re-centred on the output size and nothing
 * scaled, so a 1280x720 film at 640x360 showed a 640x360 window onto the
 * middle of the frame. Characters walked through a frame that was not the
 * frame. Every `WIDTH=`/`HEIGHT=` option and the whole resolution ladder in
 * `docs/04-RENDER-EXPORT.md` assumed otherwise.
 */

/** A scene with a camera authored for `fw`x`fh` and one dot at a point. */
function sceneWithDot(fw, fh, at) {
    const scene = new Scene();
    scene.add({
        id: '__camera', kind: 'camera',
        transform: { x: fw / 2, y: fh / 2 },
        props: { zoom: 1, frameWidth: fw, frameHeight: fh },
    });
    scene.add({
        id: 'dot', kind: 'ellipse',
        transform: { x: at[0], y: at[1] },
        props: { rx: 10, ry: 10, fill: '#fff' },
    });
    return scene;
}

/** Where the backend actually places `dot`, at this output size. */
function drawnAt(scene, width, height) {
    const ctx = new RecordingContext({ width, height });
    const backend = new Canvas2DBackend({ ctx, width, height, Path2DImpl: RecordingPath2D });
    backend.renderFrame(scene, '__camera');
    // The last setTransform before the dot is drawn carries its placement.
    const i = backend.ctx.calls.findIndex(([op]) => op === 'fill' || op === 'ellipse'
        || op === 'arc');
    assert.ok(i > 0, 'the dot must be drawn');
    const t = [...backend.ctx.calls.slice(0, i)].reverse()
        .find(([op]) => op === 'setTransform');
    assert.ok(t, 'a transform must be set before drawing');
    return { scaleX: t[1], scaleY: t[4], x: t[5], y: t[6] };
}

test('the authored frame centre lands at the output centre, at any size', () => {
    const scene = sceneWithDot(1280, 720, [640, 360]);
    for (const [w, h] of [[1280, 720], [640, 360], [1920, 1080], [160, 90]]) {
        const got = drawnAt(scene, w, h);
        assert.ok(Math.abs(got.x - w / 2) < 0.01, `centre x at ${w}x${h}: ${got.x}`);
        assert.ok(Math.abs(got.y - h / 2) < 0.01, `centre y at ${w}x${h}: ${got.y}`);
    }
});

test('a corner of the authored frame stays a corner, instead of being cropped away', () => {
    // Before the fix this point was outside a 640x360 render entirely.
    const scene = sceneWithDot(1280, 720, [1180, 660]);
    const full = drawnAt(scene, 1280, 720);
    const half = drawnAt(scene, 640, 360);
    assert.ok(Math.abs(full.x - 1180) < 0.01);
    assert.ok(Math.abs(half.x - 590) < 0.01, `expected 590, got ${half.x}`);
    assert.ok(Math.abs(half.y - 330) < 0.01, `expected 330, got ${half.y}`);
    assert.ok(half.x < 640 && half.y < 360, 'must be inside the smaller frame');
});

test('everything scales by the same factor, so nothing is stretched', () => {
    const scene = sceneWithDot(1080, 1920, [540, 960]);
    const got = drawnAt(scene, 540, 960);
    assert.ok(Math.abs(got.scaleX - 0.5) < 1e-6, `scaleX ${got.scaleX}`);
    assert.ok(Math.abs(got.scaleY - 0.5) < 1e-6, `scaleY ${got.scaleY}`);
});

test('a mismatched aspect letterboxes rather than distorting', () => {
    // A 9:16 film into a 16:9 output: fit on height, centred horizontally.
    const scene = sceneWithDot(1080, 1920, [540, 960]);
    const got = drawnAt(scene, 1920, 1080);
    const fit = 1080 / 1920;                       // height-limited
    assert.ok(Math.abs(got.scaleX - fit) < 1e-6);
    assert.ok(Math.abs(got.scaleY - fit) < 1e-6, 'uniform: no stretch');
    assert.ok(Math.abs(got.x - 960) < 0.01, 'centred in the wider frame');
});

test('a scene with no declared frame behaves exactly as before', () => {
    const scene = new Scene();
    scene.add({ id: '__camera', kind: 'camera',
                transform: { x: 160, y: 90 }, props: { zoom: 1 } });
    scene.add({ id: 'dot', kind: 'ellipse', transform: { x: 160, y: 90 },
                props: { rx: 4, ry: 4, fill: '#fff' } });
    const got = drawnAt(scene, 320, 180);
    assert.ok(Math.abs(got.scaleX - 1) < 1e-6, 'no frame declared, no scaling');
    assert.ok(Math.abs(got.x - 160) < 0.01);
});

test('a compiled film carries its authored frame on the camera', () => {
    const { scene, cameraId } = compileFilm({
        version: 'jirex.film/1',
        meta: { title: 't', fps: 24, width: 1080, height: 1920 },
        characters: {}, scenes: [{ id: 's', shots: [{ id: 'a', duration: 1 }] }],
    }, { assets: null });
    const cam = scene.get(cameraId);
    assert.equal(cam.props.frameWidth, 1080);
    assert.equal(cam.props.frameHeight, 1920);
});

test('subtitles and other screen-space nodes scale with the frame too', () => {
    const scene = sceneWithDot(1080, 1920, [540, 960]);
    scene.add({
        id: '__subtitle', kind: 'text',
        transform: { x: 540, y: 1920 - 375 },
        props: { text: 'x', font: '10px x', fill: '#fff', screenSpace: true },
    });
    const ctx = new RecordingContext({ width: 540, height: 960 });
    const backend = new Canvas2DBackend({ ctx, width: 540, height: 960,
                                          Path2DImpl: RecordingPath2D });
    backend.renderFrame(scene, '__camera');
    const i = ctx.calls.findIndex(([op]) => op === 'fillText');
    assert.ok(i > 0, 'the subtitle must be drawn');
    const t = [...ctx.calls.slice(0, i)].reverse().find(([op]) => op === 'setTransform');
    // Half size: y 1545 -> 772.5, still on screen. Unscaled it would be 1545,
    // which is 585px below the bottom of the picture.
    assert.ok(Math.abs(t[6] - 772.5) < 0.01, `subtitle y ${t[6]}`);
    assert.ok(t[6] < 960, 'must be inside the frame');
});
