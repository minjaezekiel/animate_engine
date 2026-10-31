import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compileFilm } from '../../src/core/script/compile.js';
import { validateFilm } from '../../src/core/script/validate.js';
import { measureCharacter } from '../../src/core/index.js';

/**
 * A rig part DRAWN rather than assembled.
 *
 * Joining ellipses and tapered paths produces a figure that reads as clip-art
 * however well it is rigged: the contour is too even and the joints show. A
 * part carrying `strokes` becomes a paint node drawn with the pressure brushes
 * in `core/paint/`, and still rotates about its joint like any other part.
 * See 21-DRAWN-ANIMATION.md.
 */

const drawn = (parts, actions = []) => ({
    version: 'jirex.film/1',
    meta: { fps: 24, width: 800, height: 600 },
    palettes: { p: { ink: '#5a3a24' } },
    characters: { pup: { palette: 'p', proportions: { height: 200 }, parts } },
    scenes: [{ id: 's1', palette: 'p',
        cast: [{ character: 'pup', as: 'pup', at: [400, 300] }],
        shots: [{ id: 'a', duration: 1, actions }] }],
});

const PARTS = [
    { id: 'body', parent: null, pivot: [0, 0], strokes: [
        { path: 'M -60 0 C -40 -50, 40 -50, 60 0', brush: 'pencil', color: 'ink', size: 9 }] },
    { id: 'leg', parent: 'body', pivot: [40, 0], strokes: [
        { path: 'M 0 0 L 4 60', brush: 'pencil', color: 'ink', size: 6 }] },
];

test('a part with strokes becomes a paint node, not a shape node', () => {
    const r = compileFilm(drawn(PARTS));
    assert.deepEqual(r.diagnostics.filter((d) => d.severity !== 'info'), []);
    assert.equal(r.scene.get('s1/pup/body').kind, 'paint');
    assert.equal(r.scene.get('s1/pup/leg').kind, 'paint');
});

test('the part still turns about its JOINT, not about the image centre', () => {
    const r = compileFilm(drawn(PARTS));
    const leg = r.scene.get('s1/pup/leg');
    // `ax`/`ay` are the anchor in destination units from the image's top-left.
    // The joint is local (0,0), so the anchor is minus the box's top-left.
    const { paint, ax, ay } = leg.props;
    assert.ok(ax > 0 && ay > 0, 'the anchor sits inside the surface');
    assert.ok(ax <= paint.width && ay <= paint.height);
    // The leg's strokes run from local y=0 down to y=60, so the joint is near
    // the TOP of its own surface.
    assert.ok(ay < paint.height / 2, 'a limb hangs from its joint');
});

test('the surface covers the strokes with room for the nib', () => {
    const r = compileFilm(drawn(PARTS));
    const { paint } = r.scene.get('s1/pup/body').props;
    // The body spans x -60..60 and the curve rises to about y -37.
    assert.ok(paint.width >= 120 && paint.width < 160, `width ${paint.width}`);
    assert.ok(paint.height >= 40, `height ${paint.height}`);
});

test('path data is flattened to points rather than shifted as text', () => {
    // `H`, `V` and `A` do not take alternating x,y pairs, so translating every
    // number in a path string corrupts exactly the commands hardest to notice.
    const r = compileFilm(drawn([{ id: 'body', parent: null, pivot: [0, 0], strokes: [
        { path: 'M 10 10 H 90 V 50 L 10 50 Z', brush: 'ink', color: 'ink', size: 4 }] }]));
    const stroke = r.scene.get('s1/pup/body').props.paint.layers[0].strokes[0];
    assert.ok(stroke.points?.length, 'stored as points');
    assert.equal(stroke.path, undefined, 'and the path is gone, not left to disagree');
    const xs = stroke.points.map((q) => q.x);
    const ys = stroke.points.map((q) => q.y);
    // 80 wide and 40 tall, wherever in the surface it landed.
    assert.ok(Math.abs((Math.max(...xs) - Math.min(...xs)) - 80) < 1.5);
    assert.ok(Math.abs((Math.max(...ys) - Math.min(...ys)) - 40) < 1.5);
});

test('a path with several subpaths becomes several strokes', () => {
    const r = compileFilm(drawn([{ id: 'body', parent: null, pivot: [0, 0], strokes: [
        { path: 'M 0 0 L 20 0 M 0 20 L 20 20', brush: 'pencil', color: 'ink', size: 4 }] }]));
    assert.equal(r.scene.get('s1/pup/body').props.paint.layers[0].strokes.length, 2);
});

test('stroke colours resolve through the palette', () => {
    const r = compileFilm(drawn(PARTS));
    assert.equal(r.scene.get('s1/pup/body').props.paint.layers[0].strokes[0].color, '#5a3a24');
});

test('measureCharacter sees strokes, so a drawn character stands on the ground', () => {
    const bounds = measureCharacter(PARTS);
    // The leg hangs to local y=60 from a joint at y=0.
    assert.ok(bounds.bottom > 55, `bottom ${bounds.bottom}`);
    assert.ok(bounds.top < 0, 'and the body curve rises above the root');

    // Without this the whole animal measured as a point and `standOnGround`
    // buried it: the root sat on the floor and the legs went through it.
    const r = compileFilm({
        ...drawn(PARTS),
        scenes: [{ id: 's1', palette: 'p', ground: { y: 500 },
            cast: [{ character: 'pup', as: 'pup', at: [400] }],
            shots: [{ id: 'a', duration: 1 }] }],
    });
    const root = r.scene.get('s1/pup');
    assert.ok(root.transform.y < 500 - 50,
        `a drawn character must be lifted clear of the ground, got y=${root.transform.y}`);
});

test('an authored box wins over the inferred one', () => {
    const r = compileFilm(drawn([{ id: 'body', parent: null, pivot: [0, 0],
        box: [-200, -100, 200, 100],
        strokes: [{ path: 'M 0 0 L 10 10', brush: 'pencil', color: 'ink', size: 4 }] }]));
    const { paint } = r.scene.get('s1/pup/body').props;
    assert.equal(paint.width, 400);
    assert.equal(paint.height, 200);
});

test('a stroke with no geometry warns instead of rendering nothing in silence', () => {
    const r = compileFilm(drawn([{ id: 'body', parent: null, pivot: [0, 0],
        strokes: [{ brush: 'pencil', color: 'ink', size: 4 }] }]));
    assert.ok(r.diagnostics.some((d) => /neither "path" nor "points"/.test(d.message)));
});

test('strokes and box are declared keys, not reported as unknown', () => {
    const problems = validateFilm(drawn(PARTS));
    assert.deepEqual(problems.filter((d) => /Unknown key/i.test(d.message)), []);
});

test('a drawn part is posed by the ordinary channels', () => {
    const r = compileFilm(drawn(PARTS, [
        { target: 'pup', do: 'set', part: 'leg', channel: 'transform.rot',
          value: 0.5, at: 0.2, for: 0.5 },
    ]));
    const track = r.timeline.tracks.find(
        (t) => t.target === 's1/pup/leg' && t.path === 'transform.rot');
    assert.ok(track, 'a drawn part animates like any other part');
    assert.equal(track.keys.at(-1).v, 0.5);
});
