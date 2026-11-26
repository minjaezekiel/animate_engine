/**
 * Subdivision and displacement.
 *
 * Two needs with one algorithm, and the tests are split the same way:
 *
 *   - `smooth: false` must change the **count** and not the **shape**, which
 *     is what a displacement map needs: it moves the vertices that exist, so
 *     the surface has to be dense before the height field is applied and
 *     must not have been bent on the way.
 *   - `smooth: true` must take the facets off a silhouette, which is measured
 *     as the sharpest crease between adjacent faces -- because a silhouette
 *     is made of creases and no amount of shading smooths one.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { subdivide, weld, maxCrease, vertexEstimate, MAX_LEVELS, DISPLACEMENT_VERTICES }
    from '../../src/core/geom/subdivide.js';
import { volumeOf, closureError } from '../../src/core/geom/csg.js';
import { compileFilm3D } from '../../src/core/script/compile3d.js';

/** An axis-aligned box as a flat triangle soup, with per-face UVs. */
function boxSoup(size = [1, 1, 1]) {
    const [hx, hy, hz] = size.map((v) => v / 2);
    const faces = [
        [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]],
        [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]],
        [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]],
        [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]],
        [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]],
        [[-1, 1, -1], [1, 1, -1], [1, -1, -1], [-1, -1, -1]],
    ];
    const positions = [], uvs = [];
    const corner = [[0, 0], [1, 0], [1, 1], [0, 1]];
    for (const quad of faces) {
        const v = quad.map(([x, y, z]) => [x * hx, y * hy, z * hz]);
        for (const tri of [[0, 1, 2], [0, 2, 3]]) {
            for (const i of tri) { positions.push(...v[i]); uvs.push(...corner[i]); }
        }
    }
    return { positions: Float32Array.from(positions), uvs: Float32Array.from(uvs) };
}

/** A UV sphere soup: the shape whose facets a film actually sees. */
function sphereSoup({ radius = 1, widthSegments = 12, heightSegments = 8 } = {}) {
    const at = (i, j) => {
        const phi = (i / widthSegments) * Math.PI * 2;
        const theta = (j / heightSegments) * Math.PI;
        return [radius * Math.sin(theta) * Math.cos(phi),
                radius * Math.cos(theta),
                radius * Math.sin(theta) * Math.sin(phi)];
    };
    const positions = [];
    for (let i = 0; i < widthSegments; i++) {
        for (let j = 0; j < heightSegments; j++) {
            const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
            for (const tri of [[a, b, c], [a, c, d]]) for (const p of tri) positions.push(...p);
        }
    }
    return { positions: Float32Array.from(positions) };
}

/** An indexed mesh back to a soup, so `volumeOf` can read it. */
const toSoup = ({ positions, index }) => {
    const out = new Float32Array(index.length * 3);
    for (let i = 0; i < index.length; i++) {
        out[i * 3] = positions[index[i] * 3];
        out[i * 3 + 1] = positions[index[i] * 3 + 1];
        out[i * 3 + 2] = positions[index[i] * 3 + 2];
    }
    return { positions: out };
};

// ---------------------------------------------------------------------------
// Welding, which everything else depends on
// ---------------------------------------------------------------------------

test('a soup welds into a vertex graph, or every triangle subdivides alone', () => {
    // THREE repeats a position once per face that touches it -- that is what
    // makes flat shading possible -- and without welding, subdivision turns
    // one box into twelve detached triangles.
    const { verts, faces } = weld(boxSoup());
    assert.equal(verts.length, 8, 'a box has eight corners');
    assert.equal(faces.length, 12);
});

// ---------------------------------------------------------------------------
// Density: the count changes, the shape does not
// ---------------------------------------------------------------------------

test('a linear split is exactly 4^n faces and does not move one vertex', () => {
    for (const levels of [0, 1, 2, 3]) {
        const out = subdivide(boxSoup([1, 1, 1]), { levels, smooth: false });
        assert.equal(out.triangles, 12 * 4 ** levels, `level ${levels}`);
        // The volume is the proof that nothing moved: a unit cube, exactly,
        // at every level. This is what displacement needs.
        assert.equal(volumeOf(toSoup(out)).toFixed(6), '1.000000', `level ${levels} volume`);
        assert.ok(closureError(toSoup(out)) < 1e-6, 'and it is still closed');
    }
});

test('UVs come through, or a subdivided part loses its texture', () => {
    const out = subdivide(boxSoup(), { levels: 2, smooth: false });
    assert.equal(out.uvs.length / 2, out.positions.length / 3);
    for (const u of out.uvs) assert.ok(u >= -1e-6 && u <= 1 + 1e-6, `uv out of range: ${u}`);
});

// ---------------------------------------------------------------------------
// Smoothing: the creases go away
// ---------------------------------------------------------------------------

test('Loop subdivision takes the facets off a silhouette', () => {
    // A silhouette is made of creases. A 12x8 sphere creases at 22 degrees;
    // each level roughly halves it, which is the convergence Loop promises.
    const sphere = sphereSoup({ widthSegments: 12, heightSegments: 8 });
    const creases = [0, 1, 2].map((levels) => maxCrease(subdivide(sphere, { levels, smooth: true })));
    assert.ok(creases[0] > 20, `a coarse sphere creases at ${creases[0].toFixed(1)} degrees`);
    assert.ok(creases[1] < creases[0] * 0.7, `level 1: ${creases[1].toFixed(1)}`);
    assert.ok(creases[2] < creases[1] * 0.7, `level 2: ${creases[2].toFixed(1)}`);
    // And a linear split does NOT, which is the whole distinction: more
    // triangles on exactly the same faceted surface.
    const flat = maxCrease(subdivide(sphere, { levels: 2, smooth: false }));
    assert.ok(Math.abs(flat - creases[0]) < 1e-3,
              `a linear split changed the crease: ${flat} vs ${creases[0]}`);
});

test('smoothing shrinks toward the limit surface, and stays closed', () => {
    // Loop is APPROXIMATING, not interpolating: the surface pulls inward
    // toward its limit. Worth stating, because a film that subdivides a
    // measured part gets a slightly smaller part.
    const sphere = sphereSoup({ widthSegments: 16, heightSegments: 10 });
    const before = volumeOf(sphere);
    const after = volumeOf(toSoup(subdivide(sphere, { levels: 2, smooth: true })));
    assert.ok(after < before, 'it shrinks');
    assert.ok(after > before * 0.95, `by 5% at most, not ${(100 * (1 - after / before)).toFixed(1)}%`);
    assert.ok(closureError(toSoup(subdivide(sphere, { levels: 1 }))) < 1e-5);
});

test('levels are capped, because 4^n is a steep ceiling', () => {
    const out = subdivide(boxSoup(), { levels: 99, smooth: false });
    assert.equal(out.triangles, 12 * 4 ** MAX_LEVELS);
});

// ---------------------------------------------------------------------------
// The estimate behind the diagnostic
// ---------------------------------------------------------------------------

test('the vertex estimate knows a dense geometry from a bare one', () => {
    assert.ok(vertexEstimate({ kind: 'cube' }) < DISPLACEMENT_VERTICES);
    assert.ok(vertexEstimate({ kind: 'plane' }) < DISPLACEMENT_VERTICES);
    assert.ok(vertexEstimate({ kind: 'sphere' }) > DISPLACEMENT_VERTICES);
    assert.ok(vertexEstimate({ kind: 'sphere', widthSegments: 160, heightSegments: 96 }) > 15_000);
    // And `subdivide` is what moves a bare one across the line.
    assert.ok(vertexEstimate({ kind: 'cube', subdivide: 3 }) > DISPLACEMENT_VERTICES);
    assert.equal(vertexEstimate({ kind: 'cube', subdivide: 2 }),
                 vertexEstimate({ kind: 'cube' }) * 16);
});

// ---------------------------------------------------------------------------
// What the compiler says
// ---------------------------------------------------------------------------

const film = (geometry, material) => ({
    meta: { title: 't', fps: 24 },
    textures: { h: { layers: [{ kind: 'fbm' }] } },
    materials: { m: material },
    assemblies: { a: { parts: [{ id: 'p', geometry, material: 'm' }] } },
    cast: [{ assembly: 'a', as: 'x' }],
    scenes: [{ id: 's', shots: [{ id: 'one', duration: 1 }] }],
});
const messages = (g, m) => compileFilm3D(film(g, m)).diagnostics.map((d) => d.message).join(' | ');

test('a displacement map that cannot displace anything is a diagnostic', () => {
    /**
     * Both halves of this are silent today: the map loads, the material
     * takes it, and either every vertex moves a metre or none of them moves
     * at all. Same shape as `ssao`, which was wired for seven phases and
     * arithmetically could not occlude.
     */
    const bare = messages({ kind: 'cube' }, { displacementMap: 'h' });
    assert.match(bare, /no `displacementScale` displaces by 1 unit/);
    assert.match(bare, /moves the vertices that exist and this geometry has about 24/);

    // Enough vertices and a stated scale: nothing to say.
    assert.equal(messages({ kind: 'sphere', widthSegments: 64, heightSegments: 40 },
                          { displacementMap: 'h', displacementScale: 0.02 }), '');
    // And `subdivide` is the remedy the diagnostic names.
    assert.equal(messages({ kind: 'cube', subdivide: 3 },
                          { displacementMap: 'h', displacementScale: 0.01 }), '');
    // A material with no displacement map is not nagged about a scale.
    assert.equal(messages({ kind: 'cube' }, { color: '#ffffff' }), '');
});

test('a bad `subdivide` is a diagnostic, not a silent cap', () => {
    assert.match(messages({ kind: 'cube', subdivide: 6 }, { color: '#fff' }),
                 /4096x the triangles; 4 levels is the cap/);
    assert.match(messages({ kind: 'cube', subdivide: 'two' }, { color: '#fff' }),
                 /a number of levels, or `\{ levels, smooth \}`/);
    assert.equal(messages({ kind: 'cube', subdivide: { levels: 2, smooth: false } },
                          { color: '#fff' }), '');
});
