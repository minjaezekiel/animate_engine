import test from 'node:test';
import assert from 'node:assert/strict';

import { applySwapSets, applyVisemeShapes, resolveSwap } from '../../src/core/scene/swapSets.js';
import { Scene } from '../../src/core/scene/Scene.js';
import { compileFilm } from '../../src/core/script/compile.js';

const sceneWith = (props) => {
    const s = new Scene();
    s.add({ id: 'n', kind: 'path', props }, s.rootId);
    return s;
};

// ------------------------------------------------------------- resolution

test('an exact match wins', () => {
    assert.equal(resolveSwap('view', 'profile', { front: {}, profile: {} }), 'profile');
});

test('each channel degrades through its own preference order', () => {
    // A character drawn front-only should face front, not vanish.
    assert.equal(resolveSwap('view', 'profile', { front: {} }), 'front');
    assert.equal(resolveSwap('view', 'back', { threeQuarter: {}, front: {} }), 'threeQuarter');
    // Visemes keep the table lipsync was built against.
    assert.equal(resolveSwap('viseme', 'round', { open: {}, closed: {} }), 'open');
    assert.equal(resolveSwap('eyes', 'squint', { closed: {} }), 'closed');
});

test('an unknown channel or name falls back to whatever exists', () => {
    assert.equal(resolveSwap('nosuch', 'whatever', { only: {} }), 'only');
    assert.equal(resolveSwap('view', 'nonsense', { front: {} }), 'front');
    assert.equal(resolveSwap('view', 'front', {}), null);
});

// ------------------------------------------------------------ the footgun

test('props from the previous shape are cleared, not left behind', () => {
    // The old pass was a shallow additive copy that never deleted. Swapping a
    // path member for an ellipse one left a stale `d` on the node -- harmless
    // only while every member is the same kind, which images end.
    const scene = sceneWith({
        swapSets: { view: { front: { kind: 'ellipse', rx: 20, ry: 24 },
                            profile: { kind: 'path', d: 'M0,0 L10,10' } } },
        view: 'front',
    });
    const node = scene.get('n');

    applySwapSets(scene);
    assert.equal(node.kind, 'ellipse');
    assert.equal(node.props.rx, 20);
    assert.ok(!('d' in node.props), 'nothing stale before the first swap');

    node.props.view = 'profile';
    applySwapSets(scene);
    assert.equal(node.kind, 'path');
    assert.equal(node.props.d, 'M0,0 L10,10');
    assert.ok(!('rx' in node.props), 'rx survived a swap to a path');

    node.props.view = 'front';
    applySwapSets(scene);
    assert.equal(node.props.rx, 20);
    assert.ok(!('d' in node.props), 'd survived a swap back to an ellipse');
});

test('props the node owns itself are not clobbered by a swap', () => {
    const scene = sceneWith({
        swapSets: { view: { front: { kind: 'ellipse', rx: 5, ry: 5 } } },
        view: 'front', fill: '#abcdef', alpha: 0.5,
    });
    applySwapSets(scene);
    assert.equal(scene.get('n').props.fill, '#abcdef');
    assert.equal(scene.get('n').props.alpha, 0.5);
});

// ------------------------------------------------------------ many channels

test('several channels drive one node', () => {
    const scene = sceneWith({
        swapSets: {
            view: { front: { kind: 'image', sx: 0 }, profile: { kind: 'image', sx: 128 } },
            eyes: { open: { ey: 1 }, closed: { ey: 0 } },
        },
        view: 'front', eyes: 'open',
    });
    const node = scene.get('n');
    applySwapSets(scene);
    assert.equal(node.props.sx, 0);
    assert.equal(node.props.ey, 1);

    node.props.view = 'profile';
    node.props.eyes = 'closed';
    applySwapSets(scene);
    assert.equal(node.props.sx, 128);
    assert.equal(node.props.ey, 0);
});

test('a sprite atlas frame is just another swap member', () => {
    const bitmap = { width: 256, height: 64 };
    const scene = sceneWith({
        image: bitmap,
        swapSets: { frame: { a: { kind: 'image', sx: 0, sw: 64, sh: 64 },
                             b: { kind: 'image', sx: 64, sw: 64, sh: 64 } } },
        frame: 'b',
    });
    applySwapSets(scene);
    const node = scene.get('n');
    assert.equal(node.kind, 'image');
    assert.equal(node.props.sx, 64);
    // The decoded image belongs to the node, not the frame, so it survives.
    assert.equal(node.props.image, bitmap);
});

// ---------------------------------------------------------------- caching

test('an unchanged channel does no work but stays correct', () => {
    const scene = sceneWith({
        swapSets: { view: { front: { kind: 'ellipse', rx: 3 } } }, view: 'front',
    });
    const node = scene.get('n');
    applySwapSets(scene);
    // A per-frame pose reset can wipe props; the cache must not then claim
    // geometry the node no longer has.
    node.props.rx = 999;
    node._swapNames = {};
    applySwapSets(scene);
    assert.equal(node.props.rx, 3);
});

test('nodes with no swap sets are untouched', () => {
    const scene = sceneWith({ d: 'M0,0 L1,1', fill: '#fff' });
    applySwapSets(scene);
    assert.equal(scene.get('n').props.d, 'M0,0 L1,1');
    assert.equal(scene.get('n').kind, 'path');
});

// ------------------------------------------------------- backwards compat

test('the original visemeShapes form still drives mouths', () => {
    // This is what the lipsync compiler emits, and demo films carry it.
    const scene = sceneWith({
        visemeShapes: { closed: { kind: 'path', d: 'M-7,0 L7,0' },
                        open: { kind: 'ellipse', rx: 7, ry: 7 } },
        viseme: 'open',
    });
    applyVisemeShapes(scene);
    assert.equal(scene.get('n').kind, 'ellipse');
    assert.equal(scene.get('n').props.rx, 7);
});

test('a generated character still lipsyncs through the new pass', () => {
    const film = {
        version: 'jirex.film/1',
        meta: { title: 't', fps: 24, width: 1280, height: 720 },
        palettes: { p: { coat: '#c33', skin: '#eca' } },
        characters: { boy: { generate: {}, palette: 'p' } },
        scenes: [{ id: 's1', cast: [{ character: 'boy', as: 'boy', at: [640, 500] }],
                   shots: [{ id: 'a', duration: 2 }] }],
    };
    const { scene } = compileFilm(film, {});
    const mouth = scene.get('s1/boy/mouth');
    mouth.props.viseme = 'open';
    applySwapSets(scene);
    assert.ok(mouth.props.d || mouth.props.rx, 'the mouth took a shape');
});

// -------------------------------------------------- multi-shape parts

test('a part can be several stacked drawings', () => {
    const film = {
        version: 'jirex.film/1',
        meta: { title: 't', fps: 24, width: 1280, height: 720 },
        palettes: { p: { skin: '#eca', shade: '#c9a', line: '#432' } },
        characters: { hero: { palette: 'p', parts: [{
            id: 'torso', parent: null, shapes: [
                { id: 'base', shape: { kind: 'path', d: 'M0,0 L10,0' }, fill: 'skin' },
                { id: 'shade', shape: { kind: 'path', d: 'M5,0 L10,0' }, fill: 'shade', z: 1 },
                { id: 'line', shape: { kind: 'path', d: 'M0,0 L10,0' }, stroke: 'line', z: 2 },
            ],
        }] } },
        scenes: [{ id: 's1', cast: [{ character: 'hero', as: 'hero', at: [0, 0] }],
                   shots: [{ id: 'a', duration: 1 }] }],
    };
    const { scene, diagnostics } = compileFilm(film, {});
    const torso = scene.get('s1/hero/torso');
    assert.equal(torso.kind, 'group', 'a layered part is a group');
    assert.equal(torso.childIds.length, 3);
    // Palette keys resolve on layers exactly as they do on a plain part.
    assert.equal(scene.get('s1/hero/torso/base').props.fill, '#eca');
    assert.equal(scene.get('s1/hero/torso/shade').props.fill, '#c9a');
    assert.equal(scene.get('s1/hero/torso/line').props.stroke, '#432');
    // Draw order is base, then shadow, then line work.
    const order = scene.drawOrder().filter((e) => e.node.id.startsWith('s1/hero/torso/'));
    assert.deepEqual(order.map((e) => e.node.name), ['base', 'shade', 'line']);
    assert.ok(!diagnostics.some((d) => d.severity === 'error'));
});

test('a part declares swap sets through the film script', () => {
    const film = {
        version: 'jirex.film/1',
        meta: { title: 't', fps: 24, width: 1280, height: 720 },
        palettes: { p: { skin: '#eca' } },
        characters: { hero: { palette: 'p', parts: [{
            id: 'head', parent: null, fill: 'skin',
            swap: { view: { default: 'profile',
                            shapes: { front: { kind: 'ellipse', rx: 20 },
                                      profile: { kind: 'path', d: 'M0,0 L5,5' } } } },
        }] } },
        scenes: [{ id: 's1', cast: [{ character: 'hero', as: 'hero', at: [0, 0] }],
                   shots: [{ id: 'a', duration: 1 }] }],
    };
    const { scene } = compileFilm(film, {});
    const head = scene.get('s1/hero/head');
    assert.equal(head.props.view, 'profile', 'the declared default is the starting channel value');
    applySwapSets(scene);
    assert.equal(head.kind, 'path');
    assert.equal(head.props.fill, '#eca', 'the part keeps its own paint across a swap');
});
