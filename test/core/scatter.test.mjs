/**
 * Scatter: a thousand of something, placed rather than authored.
 *
 * Two claims, and they are tested separately because they fail separately:
 *
 *   - the **placement** looks natural and is the same everywhere, which is
 *     the minimum-spacing guarantee plus determinism, and
 *   - the **cost** is one draw call however many instances there are, which
 *     no unit test can prove -- it is measured by `film3d.html`'s `draw:`
 *     line against a real WebGL renderer, and recorded in STATUS.
 *
 * What this file can prove about cost is the thing that bites in practice:
 * the sampler runs once, at build time, and its cost is bounded.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { scatterPoints, poissonPoints, minimumSpacing, radiusFor, rng }
    from '../../src/core/geom/scatter.js';
import { compileFilm3D, SCATTER_MAX } from '../../src/core/script/compile3d.js';

/** A film with one floor to scatter on. `floor` chooses the geometry. */
const film = (scatter, floor = { kind: 'cube', width: 4, height: 0.1, depth: 6 }) => ({
    meta: { title: 't', fps: 24 },
    materials: { grey: { color: '#888888' } },
    assemblies: { set: { parts: [{ id: 'floor', geometry: floor, material: 'grey' }] } },
    cast: [{ assembly: 'set', as: 'set' }],
    scatter,
    scenes: [{ id: 's', shots: [{ id: 'one', duration: 1 }] }],
});

const scatterNode = (c) => [...c.scene.byId.values()].find((n) => n.kind === 'scatter');
const messages = (c) => c.diagnostics.map((d) => d.message).join(' | ');

// ---------------------------------------------------------------------------
// The placement
// ---------------------------------------------------------------------------

test('no two points are closer than the radius, which is what blue noise means', () => {
    // Uniform random points CLUMP: at 400 samples in 4 m2 you get pairs
    // almost touching and bald patches the size of a tree, and that reads as
    // a mistake. This is the difference, measured.
    const points = scatterPoints({ count: 400, area: [2, 2], seed: 7 });
    const r = radiusFor(4, 400);
    assert.ok(minimumSpacing(points) >= r * 0.999,
              `closest pair ${minimumSpacing(points)}, radius ${r}`);

    const random = rng(7);
    const uniform = Array.from({ length: 400 }, () => ({ at: [random() * 2, 0, random() * 2] }));
    assert.ok(minimumSpacing(uniform) < r / 3,
              'and uniform random really does clump, or this test proves nothing');
});

test('the count asked for is the count placed', () => {
    for (const count of [1, 50, 400, 1000]) {
        assert.equal(scatterPoints({ count, area: [2, 2], seed: 3 }).length, count);
    }
    assert.deepEqual(scatterPoints({ count: 0 }), []);
});

test('an explicit radius wins, and then the count may not fit', () => {
    // Which is why `count` is documented as a maximum: 100 points at 0.5 m
    // apart do not go into 1 m2, and the honest answer is fewer points.
    const tight = scatterPoints({ count: 100, area: [1, 1], radius: 0.5, seed: 1 });
    assert.ok(tight.length < 100 && tight.length > 0, `${tight.length} placed`);
    assert.ok(minimumSpacing(tight) >= 0.499);
});

test('the same seed gives the same arrangement, on every machine and re-render', () => {
    // Frame N is a function of N, and a film renders the same twice.
    const a = scatterPoints({ count: 200, area: [3, 2], seed: 11, scale: [0.5, 2], tilt: 20 });
    const b = scatterPoints({ count: 200, area: [3, 2], seed: 11, scale: [0.5, 2], tilt: 20 });
    assert.deepEqual(a, b);
    const c = scatterPoints({ count: 200, area: [3, 2], seed: 12, scale: [0.5, 2], tilt: 20 });
    assert.notDeepEqual(a, c, 'and changing the seed is how an author asks for another one');
    // Integer arithmetic in 32 bits, so there is no float drift to disagree
    // about between engines.
    assert.equal(rng(42)().toFixed(12), rng(42)().toFixed(12));
});

test('every point is inside the area it was given', () => {
    const points = scatterPoints({ count: 300, area: [4, 6], seed: 5, y: 1.5 });
    for (const { at } of points) {
        assert.ok(Math.abs(at[0]) <= 2, `x ${at[0]}`);
        assert.ok(Math.abs(at[2]) <= 3, `z ${at[2]}`);
        assert.equal(at[1], 1.5, 'and on the surface, not floating above it');
    }
});

test('the jitter stays inside what was asked for', () => {
    // Four hundred identical stones in four hundred places still read as
    // four hundred copies of one stone; these three are what hide that.
    const points = scatterPoints({ count: 200, area: [3, 3], seed: 9,
                                   scale: [0.5, 1.5], rotY: 360, tilt: 12 });
    const scales = points.map((p) => p.scale[0]);
    assert.ok(Math.min(...scales) >= 0.5 && Math.max(...scales) <= 1.5);
    assert.ok(Math.max(...scales) - Math.min(...scales) > 0.8, 'and actually spread');
    for (const { rot } of points) {
        assert.ok(rot[1] >= 0 && rot[1] <= 360);
        assert.ok(Math.abs(rot[0]) <= 12 && Math.abs(rot[2]) <= 12);
    }
    // Uniform scale, because a non-uniform one on a tilted instance shears.
    for (const { scale } of points) assert.ok(scale[0] === scale[1] && scale[1] === scale[2]);
});

test('it is bounded, and paid once at build time', () => {
    const t0 = performance.now();
    const points = poissonPoints({ width: 2, depth: 2, radius: radiusFor(4, 1000), seed: 1 });
    const ms = performance.now() - t0;
    assert.ok(points.length >= 1000, `${points.length} points`);
    assert.ok(ms < 400, `1,000 points took ${ms.toFixed(0)} ms`);
});

// ---------------------------------------------------------------------------
// What the compiler does with it
// ---------------------------------------------------------------------------

test('a scatter is one node, parented to what it sits on', () => {
    // One node is the whole point: it is also one draw call, one material
    // and one entry for anything that walks the scene.
    const c = compileFilm3D(film({ grit: {
        geometry: { kind: 'tetrahedron', radius: 0.01 }, material: 'grey',
        on: 'set/floor', count: 60, seed: 4 } }));
    assert.equal(messages(c), '');
    const node = scatterNode(c);
    assert.ok(node, 'no scatter node');
    assert.equal(node.parentId, 'set/floor', 'so the floor\'s transform carries it');
    assert.equal(node.props.points.length, 60);
    assert.equal([...c.scene.byId.values()].filter((n) => n.kind === 'scatter').length, 1);
});

test('the area and the height come from the thing scattered on', () => {
    // A floor that is resized does not leave its gravel behind.
    const c = compileFilm3D(film({ grit: {
        geometry: { kind: 'tetrahedron', radius: 0.01 }, material: 'grey',
        on: 'set/floor', count: 200, seed: 4 } }));
    const points = scatterNode(c).props.points;
    const xs = points.map((p) => p.at[0]), zs = points.map((p) => p.at[2]);
    assert.ok(Math.max(...xs) - Math.min(...xs) > 3.5, 'spans the 4 m width');
    assert.ok(Math.max(...zs) - Math.min(...zs) > 5.5, 'and the 6 m depth');
    // On top of the 100 mm slab, not inside it.
    assert.ok(points.every((p) => Math.abs(p.at[1] - 0.05) < 1e-9), 'y is the top face');
});

test('a plane is a surface in its own XY, and the node turns to match', () => {
    /**
     * The first scatter on a `plane` floor read a 2 x 0 area and put every
     * point a metre in the air, because the code assumed a solid's top face.
     * A plane lies in its local XY with its face along +z.
     */
    const c = compileFilm3D(film({ grit: {
        geometry: { kind: 'tetrahedron', radius: 0.01 }, material: 'grey',
        on: 'set/floor', count: 100, seed: 4 } }, { kind: 'plane', width: 4, height: 6 }));
    const node = scatterNode(c);
    assert.ok(Math.abs(node.props.rot[0] - Math.PI / 2) < 1e-9, 'a quarter turn, in radians');
    const zs = node.props.points.map((p) => p.at[2]);
    assert.ok(Math.max(...zs) - Math.min(...zs) > 5.5, 'the plane\'s height is the depth');
    assert.ok(node.props.points.every((p) => p.at[1] === 0), 'and a plane has no thickness');
});

test('every way of getting it wrong is a diagnostic', () => {
    const bad = (spec) => messages(compileFilm3D(film({ x: spec })));
    assert.match(bad({ material: 'grey', on: 'set/floor', count: 10 }), /needs a `geometry`/);
    assert.match(bad({ geometry: { kind: 'cyliner' }, on: 'set/floor', count: 10 }),
                 /unknown geometry kind/);
    assert.match(bad({ geometry: { kind: 'sphere' }, on: 'set/ghost', count: 10 }),
                 /is not a node/);
    assert.match(bad({ geometry: { kind: 'sphere' }, count: 10 }), /needs an `area` or an `on`/);
    assert.match(bad({ geometry: { kind: 'sphere' }, on: 'set/floor' }), /needs a `count`/);
    assert.match(bad({ geometry: { kind: 'sphere' }, area: [1, 1], count: SCATTER_MAX + 1 }),
                 /above the 5000/);
    // And a count that will not fit says so, rather than quietly placing
    // fewer than the film asked for.
    assert.match(bad({ geometry: { kind: 'sphere' }, area: [1, 1], count: 100, radius: 0.5 }),
                 /asked for 100 and \d+ fit/);
});

test('no scatter block is no scatter node, and no diagnostics', () => {
    const c = compileFilm3D(film(undefined));
    assert.equal(scatterNode(c), undefined);
    assert.equal(messages(c), '');
});
