import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DrawTool } from '../../src/editor/DrawTool.js';
import { compileFilm } from '../../src/core/script/compile.js';
import { validateFilm } from '../../src/core/script/validate.js';

/**
 * The drawing model. DOM-free on purpose: the interesting bugs in a drawing
 * tool are which frame a stroke lands on, what undo removes and where the
 * origin is on export, and none of those need a browser.
 */

const stroke = (pts, over = {}) => ({
    points: pts.map(([x, y, p = 1]) => ({ x, y, p })),
    brush: 'pencil', color: '#5a3a24', size: 8, ...over,
});

test('a stroke lands on the current frame and the current layer', () => {
    const t = new DrawTool();
    t.addLayer({ name: 'ink' });
    t.addStroke(stroke([[0, 0], [10, 10]]));
    assert.equal(t.frame.strokes.get(t.layers[1].id).length, 1);
    assert.equal(t.frame.strokes.get(t.layers[0].id).length, 0);
});

test('a new layer exists on every frame, including ones already drawn', () => {
    const t = new DrawTool();
    t.addFrame();
    t.addFrame();
    const l = t.addLayer({ name: 'late' });
    for (const f of t.frames) assert.ok(f.strokes.has(l.id), 'every frame has the new layer');
});

test('undo removes the last stroke and redo puts it back, on the right frame', () => {
    const t = new DrawTool();
    t.addStroke(stroke([[0, 0], [5, 5]]));
    const first = t.frame;
    t.addFrame();
    t.addStroke(stroke([[20, 20], [30, 30]]));
    assert.equal(t.strokesOf(t.frame).length, 1);

    t.undo();
    assert.equal(t.strokesOf(t.frame).length, 0, 'the second frame lost its stroke');
    assert.equal(t.strokesOf(first).length, 1, 'the first frame kept its own');

    t.redo();
    assert.equal(t.strokesOf(t.frame).length, 1);
});

test('undo reaches back past a frame change', () => {
    const t = new DrawTool();
    t.addStroke(stroke([[0, 0], [5, 5]]));
    const first = t.frame;
    t.addFrame();
    t.undo();      // the only stroke is on the PREVIOUS frame
    assert.equal(t.strokesOf(first).length, 0);
});

test('a new stroke drops the redo stack', () => {
    const t = new DrawTool();
    t.addStroke(stroke([[0, 0]]));
    t.undo();
    t.addStroke(stroke([[9, 9]]));
    assert.equal(t.redo(), false, 'redo after a new stroke would resurrect a discarded one');
});

test('duplicating a frame copies its strokes without sharing them', () => {
    const t = new DrawTool();
    t.addStroke(stroke([[0, 0], [5, 5]]));
    const src = t.frame;
    t.duplicateFrame();
    assert.equal(t.strokesOf(t.frame).length, 1);
    t.addStroke(stroke([[40, 40]]));
    assert.equal(t.strokesOf(src).length, 1, 'the original is untouched');
    assert.equal(t.strokesOf(t.frame).length, 2);
});

test('hidden layers are left out of what is drawn and exported', () => {
    const t = new DrawTool();
    t.addStroke(stroke([[0, 0], [5, 5]]));
    assert.equal(t.strokesOf().length, 1);
    t.layers[0].visible = false;
    assert.equal(t.strokesOf().length, 0);
});

test('the export is relative to the JOINT, not to the canvas', () => {
    const t = new DrawTool({ width: 400, height: 400 });
    t.addStroke(stroke([[100, 100], [140, 180]]));
    const out = t.toPartStrokes({ origin: [100, 100] });
    assert.deepEqual(out[0].points, [{ x: 0, y: 0, p: 1 }, { x: 40, y: 80, p: 1 }]);
});

test('pressure survives the export', () => {
    const t = new DrawTool();
    t.addStroke(stroke([[0, 0, 0.2], [10, 0, 0.9]]));
    assert.deepEqual(t.toPartStrokes({ origin: [0, 0] })[0].points.map((p) => p.p), [0.2, 0.9]);
});

test('frame holds come out as an X-sheet, and sum to the duration', () => {
    const t = new DrawTool();
    t.frames[0].hold = 4;
    t.addFrame({ hold: 2 });
    t.addFrame({ hold: 1 });
    assert.equal(t.toExposureSheet(), '4 2 1');
    assert.equal(t.duration, 7);
});

test('the exposure sheet it writes is one `expose` accepts', () => {
    const t = new DrawTool();
    t.frames[0].hold = 3;
    t.addFrame({ hold: 1 });
    const film = {
        version: 'jirex.film/1',
        meta: { fps: 24, width: 400, height: 300 },
        characters: { a: { generate: { build: 'slim' }, proportions: { height: 150 } } },
        scenes: [{ id: 's1', cast: [{ character: 'a', as: 'a', at: [200, 0] }],
            shots: [{ id: 'x', duration: 1, actions: [
                { target: 'a', do: 'expose', sheet: t.toExposureSheet() }] }] }],
    };
    assert.deepEqual(validateFilm(film).filter((d) => d.severity === 'error'), []);
    const r = compileFilm(film);
    assert.equal(r.timeline.sheets.length, 1);
    // 3 then 1, repeating: frames 0, 3, 4, 7, 8, ...
    assert.deepEqual(r.timeline.sheets[0].boundaries.slice(0, 5).map((b) => Math.round(b * 24)),
        [0, 3, 4, 7, 8]);
});

test('a drawing export is a scene drawing the compiler accepts', () => {
    const t = new DrawTool({ width: 400, height: 300 });
    t.addStroke(stroke([[100, 100], [200, 160]]));
    const film = {
        version: 'jirex.film/1',
        meta: { fps: 24, width: 400, height: 300 },
        characters: {},
        scenes: [{ id: 's1', drawings: [t.toDrawing({ id: 'sketch' })],
                   shots: [{ id: 'x', duration: 1 }] }],
    };
    assert.deepEqual(validateFilm(film).filter((d) => d.severity === 'error'), []);
    const r = compileFilm(film);
    assert.deepEqual(r.diagnostics.filter((d) => d.severity !== 'info'), []);
    assert.equal(r.scene.get('s1/sketch').kind, 'paint');
});

test('a part export is a part the compiler accepts', () => {
    const t = new DrawTool({ width: 400, height: 300 });
    t.addStroke(stroke([[100, 100], [200, 160]]));
    const film = {
        version: 'jirex.film/1',
        meta: { fps: 24, width: 400, height: 300 },
        characters: { a: { proportions: { height: 150 }, parts: [
            { id: 'body', parent: null, pivot: [0, 0],
              ...{ strokes: t.toPartStrokes({ origin: [100, 100] }) } }] } },
        scenes: [{ id: 's1', cast: [{ character: 'a', as: 'a', at: [200, 150] }],
                   shots: [{ id: 'x', duration: 1 }] }],
    };
    assert.deepEqual(validateFilm(film).filter((d) => d.severity === 'error'), []);
    assert.equal(compileFilm(film).scene.get('s1/a/body').kind, 'paint');
});

test('the last layer and the last frame cannot be removed', () => {
    const t = new DrawTool();
    assert.equal(t.removeLayer(t.layers[0].id), false);
    assert.equal(t.removeFrame(t.frames[0].id), false);
});

test('a session round-trips through JSON', () => {
    const t = new DrawTool({ width: 640, height: 480 });
    t.addStroke(stroke([[1, 2], [3, 4]]));
    t.addFrame({ hold: 6 });
    t.addStroke(stroke([[5, 6]]));
    const back = DrawTool.fromJSON(JSON.parse(JSON.stringify(t.toJSON())));
    assert.equal(back.width, 640);
    assert.equal(back.frames.length, 2);
    assert.equal(back.toExposureSheet(), t.toExposureSheet());
    assert.equal(back.strokesOf(back.frames[1]).length, 1);
});
