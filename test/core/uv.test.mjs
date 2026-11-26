/**
 * Box projection, and the orthographic camera that shipped with it.
 *
 * Both are the same kind of defect: a number the engine took from the
 * primitive or from the lens when it should have taken it from the film.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { boxUV, normalizeUV, UV_PROJECTIONS } from '../../src/core/geom/uv.js';
import { projectBounds } from '../../src/core/script/staging3d.js';
import { compileFilm3D } from '../../src/core/script/compile3d.js';

// ------------------------------------------------------------- box projection

/** One quad facing +z, `w` wide and `h` tall, centred on the origin. */
const quad = (w, h) => ({
    positions: new Float32Array([-w / 2, -h / 2, 0, w / 2, -h / 2, 0,
                                 w / 2, h / 2, 0, -w / 2, h / 2, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]),
});

test('a tile is a fixed amount of SURFACE, whatever the part', () => {
    // The defect: every primitive unwraps each face to the full 0..1 square,
    // so a 1.2 m panel and a 0.3 m panel carry the same texture over four
    // times the distance. Measured in a render: 4.00x apart.
    const big = boxUV({ ...quad(1.2, 0.5), tile: 0.3 });
    const small = boxUV({ ...quad(0.3, 0.5), tile: 0.3 });
    const span = (uv, i) => Math.max(uv[i], uv[i + 2], uv[i + 4], uv[i + 6])
        - Math.min(uv[i], uv[i + 2], uv[i + 4], uv[i + 6]);
    assert.ok(Math.abs(span(big, 0) - 4) < 1e-6, `1.2 m at 0.3 m a tile is 4 tiles, got ${span(big, 0)}`);
    assert.ok(Math.abs(span(small, 0) - 1) < 1e-6);
    // Which is the claim: the same world distance is the same number of tiles.
    assert.ok(Math.abs(span(big, 0) / 1.2 - span(small, 0) / 0.3) < 1e-9);
    assert.ok(Math.abs(span(big, 1) - span(small, 1)) < 1e-9, 'and both are 0.5 m tall');
});

test('angle aims the grain, which is the other half of the problem', () => {
    const flat = boxUV({ ...quad(1, 1), tile: 1, angle: 0 });
    const turned = boxUV({ ...quad(1, 1), tile: 1, angle: 90 });
    // A 90 degree turn swaps the axes: what ran along u now runs along v.
    assert.ok(Math.abs(turned[0] - -flat[1]) < 1e-6);
    assert.ok(Math.abs(turned[1] - flat[0]) < 1e-6);
    const off = boxUV({ ...quad(1, 1), tile: 1, offset: [0.25, -0.5] });
    assert.ok(Math.abs(off[0] - (flat[0] + 0.25)) < 1e-9);
    assert.ok(Math.abs(off[1] - (flat[1] - 0.5)) < 1e-9);
});

test('each face projects onto the plane it faces', () => {
    // A vertex facing +x takes its uv from z and y; facing +y, from x and z.
    const positions = new Float32Array([2, 3, 5, 2, 3, 5, 2, 3, 5]);
    const normals = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const uv = boxUV({ positions, normals, tile: 1 });
    assert.deepEqual([uv[0], uv[1]], [5, 3], 'facing x: (z, y)');
    assert.deepEqual([uv[2], uv[3]], [2, 5], 'facing y: (x, z)');
    assert.deepEqual([uv[4], uv[5]], [2, 3], 'facing z: (x, y)');
});

test('the spec normalises, and an unknown projection is null', () => {
    assert.deepEqual(normalizeUV({ projection: 'box', tile: 0.3 }),
                     { projection: 'box', tile: 0.3, angle: 0, offset: [0, 0] });
    assert.deepEqual(normalizeUV('box').tile, 1);
    assert.equal(normalizeUV({ projection: 'triplanar' }), null,
        'so the caller keeps its own diagnostic rather than silently doing nothing');
    assert.equal(normalizeUV(null), null);
    assert.deepEqual(normalizeUV({ tile: -3 }).tile, 1, 'a negative tile is not a tile');
    assert.deepEqual(UV_PROJECTIONS, ['box']);
});

// --------------------------------------------------------- the ortho camera

test('an orthographic frame does not divide by depth', () => {
    // Two boxes of the same size at different depths. Under perspective the
    // near one is bigger; that division IS perspective, and a technical
    // drawing is defined by not doing it.
    const eye = [0, 0, 4];
    const look = [0, 0, 0];
    const near = { lo: [-0.25, -0.25, 0.75], hi: [0.25, 0.25, 1.25] };
    const far = { lo: [-0.25, -0.25, -1.25], hi: [0.25, 0.25, -0.75] };
    const w = (b, opts) => {
        const p = projectBounds(b, { eye, look, fov: 38, aspect: 16 / 9, ...opts });
        return p.maxX - p.minX;
    };
    const persp = w(near, {}) / w(far, {});
    const ortho = w(near, { ortho: 2.4 }) / w(far, { ortho: 2.4 });
    assert.ok(persp > 1.5, `perspective should foreshorten, got ${persp}`);
    assert.ok(Math.abs(ortho - 1) < 1e-9, `orthographic should not, got ${ortho}`);
});

test('`ortho` is a frame height, and `true` is a sensible one', () => {
    const film = (ortho) => compileFilm3D({
        meta: { ortho },
        assemblies: { a: { parts: [{ id: 'p', geometry: { kind: 'cube' } }] } },
        cast: [{ assembly: 'a', as: 't' }],
        scenes: [{ id: 's', shots: [{ id: 'one', duration: 1 }] }],
    }).meta.ortho;
    assert.equal(film(2.4), 2.4);
    assert.equal(film(true), 2);
    assert.equal(film(undefined), 0, 'and every film that predates this is perspective');
    assert.equal(film(false), 0);
    assert.equal(film(-1), 0, 'a negative frame is not a frame');
});
