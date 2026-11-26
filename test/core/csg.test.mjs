/**
 * Booleans: a hole in a solid.
 *
 * The point of these tests is that a boolean can be checked against
 * **arithmetic** rather than against a picture. Two numbers do it:
 *
 *   - the volume the result encloses, which for primitive operands is known
 *     analytically, and
 *   - the closure error, which is zero for a watertight shell.
 *
 * Both matter. A boolean that drops one face still renders, still casts most
 * of a shadow, and is wrong in a way no still frame of the good side shows.
 * A boolean with inverted winding renders as an object seen from inside,
 * which looks like a lighting bug. Volume catches the second (it goes
 * negative) and closure catches the first.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { csg, volumeOf, closureError, coplanarRisk, CSG_OPS, EPSILON }
    from '../../src/core/geom/csg.js';
import { GEOMETRY_KINDS } from '../../src/core/geom/kinds.js';
import { GEOMETRY_BUILDERS } from '../../src/backends/three3d/SceneAdapter.js';

/** An axis-aligned box as a flat triangle soup, centred at `c`. */
function boxSoup(c = [0, 0, 0], size = [1, 1, 1]) {
    const [hx, hy, hz] = size.map((v) => v / 2);
    const faces = [
        [[1, 0, 0], [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]]],
        [[-1, 0, 0], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]]],
        [[0, 1, 0], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]]],
        [[0, -1, 0], [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]]],
        [[0, 0, 1], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]],
        [[0, 0, -1], [[-1, 1, -1], [1, 1, -1], [1, -1, -1], [-1, -1, -1]]],
    ];
    const positions = [], normals = [];
    for (const [n, quad] of faces) {
        const v = quad.map(([x, y, z]) => [c[0] + x * hx, c[1] + y * hy, c[2] + z * hz]);
        for (const tri of [[0, 1, 2], [0, 2, 3]]) {
            for (const i of tri) { positions.push(...v[i]); normals.push(...n); }
        }
    }
    return { positions: Float32Array.from(positions), normals: Float32Array.from(normals) };
}

/** An n-sided prism about Y: what a `cylinder` really is, and a drill bit. */
function prismSoup({ sides = 24, radius = 0.5, height = 1, at = [0, 0, 0] }) {
    const positions = [], normals = [];
    const ring = [];
    for (let i = 0; i < sides; i++) {
        const a = (i / sides) * Math.PI * 2;
        ring.push([Math.cos(a) * radius, Math.sin(a) * radius, Math.cos(a), Math.sin(a)]);
    }
    const top = at[1] + height / 2, bottom = at[1] - height / 2;
    const P = (x, y, z) => [at[0] + x, y, at[2] + z];
    for (let i = 0; i < sides; i++) {
        const [x0, z0, nx0, nz0] = ring[i];
        const [x1, z1, nx1, nz1] = ring[(i + 1) % sides];
        const quad = [[P(x0, bottom, z0), [nx0, 0, nz0]], [P(x1, bottom, z1), [nx1, 0, nz1]],
                      [P(x1, top, z1), [nx1, 0, nz1]], [P(x0, top, z0), [nx0, 0, nz0]]];
        // Wound so the faces point OUT: a prism built the other way round has
        // the volume it claims with a minus sign, and `subtract` then
        // behaves as `intersect` -- which is how this fixture was wrong
        // first time, and exactly why `volumeOf` is signed.
        for (const tri of [[0, 2, 1], [0, 3, 2]]) {
            for (const i2 of tri) { positions.push(...quad[i2][0]); normals.push(...quad[i2][1]); }
        }
        // Caps, fanned from the axis.
        for (const [y, n, order] of [[top, [0, 1, 0], [[0, 0, 0], [x1, 0, z1], [x0, 0, z0]]],
                                     [bottom, [0, -1, 0], [[0, 0, 0], [x0, 0, z0], [x1, 0, z1]]]]) {
            for (const [x, , z] of order) { positions.push(...P(x, y, z)); normals.push(...n); }
        }
    }
    return { positions: Float32Array.from(positions), normals: Float32Array.from(normals) };
}

const prismVolume = (sides, radius, height) =>
    0.5 * sides * radius * radius * Math.sin((Math.PI * 2) / sides) * height;

// ---------------------------------------------------------------------------
// The operands themselves, so a failure above is not blamed on the test
// ---------------------------------------------------------------------------

test('the fixtures are closed solids of the volume they claim', () => {
    const box = boxSoup([0, 0, 0], [2, 2, 2]);
    assert.ok(Math.abs(volumeOf(box) - 8) < 1e-5, `box volume ${volumeOf(box)}`);
    assert.ok(closureError(box) < 1e-6);
    const prism = prismSoup({ sides: 24, radius: 0.5, height: 1 });
    const want = prismVolume(24, 0.5, 1);
    assert.ok(Math.abs(volumeOf(prism) - want) / want < 1e-6,
              `prism volume ${volumeOf(prism)}, wanted ${want}`);
    assert.ok(closureError(prism) < 1e-6);
});

// ---------------------------------------------------------------------------
// The three operations, against arithmetic
// ---------------------------------------------------------------------------

test('subtract removes exactly the volume the cutter occupied', () => {
    // A 1x1 bar driven straight through a 2-cube: 2 units of material gone.
    const r = csg('subtract', boxSoup([0, 0, 0], [2, 2, 2]), boxSoup([0, 0, 0], [1, 1, 4]));
    assert.ok(Math.abs(volumeOf(r) - 6) < 1e-5, `volume ${volumeOf(r)}, wanted 6`);
    assert.ok(closureError(r) < 1e-6, `closure ${closureError(r)}`);
    assert.ok(volumeOf(r) > 0, 'positive, or the winding is inside out');
});

test('union welds two solids into one shell, with the overlap counted once', () => {
    // Two 2-cubes overlapping by half: 8 + 8 - 4.
    const r = csg('union', boxSoup([0, 0, 0], [2, 2, 2]), boxSoup([1, 0, 0], [2, 2, 2]));
    assert.ok(Math.abs(volumeOf(r) - 12) < 1e-5, `volume ${volumeOf(r)}`);
    assert.ok(closureError(r) < 1e-6);
});

test('intersect keeps the common volume', () => {
    const r = csg('intersect', boxSoup([0, 0, 0], [2, 2, 2]), boxSoup([1, 0, 0], [2, 2, 2]));
    assert.ok(Math.abs(volumeOf(r) - 4) < 1e-5, `volume ${volumeOf(r)}`);
    assert.ok(closureError(r) < 1e-6);
});

test('a round hole through a plate, which is the case films actually want', () => {
    // A 6 mm hole through a 40 mm plate -- a pin hole, at the scale the
    // AK-47 film models.
    const plate = boxSoup([0, 0, 0], [0.04, 0.008, 0.04]);
    const drill = prismSoup({ sides: 24, radius: 0.003, height: 0.04 });
    const r = csg('subtract', plate, drill);
    const want = 0.04 * 0.008 * 0.04 - prismVolume(24, 0.003, 0.008);
    assert.ok(Math.abs(volumeOf(r) - want) / want < 1e-4,
              `volume ${volumeOf(r)}, wanted ${want}`);
    assert.ok(closureError(r) < 1e-5, `closure ${closureError(r)}`);
    // And the hole is a surface, not an absence: the result has more
    // triangles than the plate it came from.
    assert.ok(r.triangles > 12, `${r.triangles} triangles`);
});

test('a second cutter nests, because an operand is a geometry like any other', () => {
    const once = csg('subtract', boxSoup([0, 0, 0], [2, 2, 2]), boxSoup([0, 0, 0], [1, 1, 4]));
    const twice = csg('subtract', once, boxSoup([0, 0, 0], [4, 0.5, 0.5]));
    // The second bar spans the box's 2 units of x at 0.5 x 0.5, so it would
    // remove 0.5 -- less the 1 x 0.5 x 0.5 the first cutter had already
    // taken where the two cross.
    const want = 6 - (2 * 0.5 * 0.5 - 1 * 0.5 * 0.5);
    assert.ok(Math.abs(volumeOf(twice) - want) < 1e-4, `volume ${volumeOf(twice)}, wanted ${want}`);
    assert.ok(closureError(twice) < 1e-5);
});

test('the normals survive, because a flat-shaded cut face reads as a crack', () => {
    const r = csg('subtract', boxSoup([0, 0, 0], [2, 2, 2]), boxSoup([0, 0, 0], [1, 1, 4]));
    for (let i = 0; i < r.normals.length; i += 3) {
        const len = Math.hypot(r.normals[i], r.normals[i + 1], r.normals[i + 2]);
        assert.ok(Math.abs(len - 1) < 1e-4, `normal ${i / 3} has length ${len}`);
    }
});

test('an unknown op throws rather than silently returning the first operand', () => {
    // Silently returning `a` is a hole that is simply not there, with
    // nothing on screen to say why.
    assert.throws(() => csg('difference', boxSoup(), boxSoup()), /unknown boolean op/);
    assert.deepEqual(CSG_OPS, ['subtract', 'union', 'intersect']);
});

test('the result is deterministic, because frame N is a function of N', () => {
    const run = () => csg('subtract', boxSoup([0, 0, 0], [2, 2, 2]),
                          prismSoup({ sides: 16, radius: 0.4, height: 4 })).positions;
    assert.deepEqual(Array.from(run()), Array.from(run()));
});

// ---------------------------------------------------------------------------
// The known failure, and the cost
// ---------------------------------------------------------------------------

test('a cutter that stops on the surface it cuts is flagged, not guessed at', () => {
    // Every CSG implementation is fragile on coplanar faces: a cutter whose
    // face lies exactly in the face it cuts has no well-defined inside.
    const plate = boxSoup([0, 0, 0], [0.04, 0.008, 0.04]);
    assert.deepEqual(coplanarRisk(plate, boxSoup([0, 0, 0], [0.01, 0.008, 0.01])), ['y'],
                     'a cutter exactly as deep as the plate');
    assert.deepEqual(coplanarRisk(plate, boxSoup([0, 0, 0], [0.01, 0.02, 0.01])), [],
                     'one that pokes through both sides is well defined');
    assert.deepEqual(coplanarRisk(plate, boxSoup([0, 0.001, 0], [0.01, 0.004, 0.01])), [],
                     'and one that stops short is a pocket, which is fine');
});

test('it costs milliseconds, once, at build time -- which is why it is not Rust yet', () => {
    // The plan called this the first real candidate for Rust. It is not one
    // until this number says so.
    const plate = boxSoup([0, 0, 0], [0.25, 0.07, 0.038]);
    const drill = prismSoup({ sides: 32, radius: 0.004, height: 0.1 });
    const t0 = performance.now();
    const r = csg('subtract', plate, drill);
    const ms = performance.now() - t0;
    assert.ok(closureError(r) < 1e-5);
    assert.ok(ms < 250, `a 32-sided cutter through a box took ${ms.toFixed(1)} ms`);
    // Not an assertion about speed -- an assertion that the cost is bounded
    // and paid once. See the `ponytail:` note in csg.js for the ceiling.
});

// ---------------------------------------------------------------------------
// One list of geometry kinds, not two
// ---------------------------------------------------------------------------

test('the backend builds every geometry kind core declares, and no others', () => {
    // `group` is a pivot: a transform node, deliberately with no builder.
    const declared = GEOMETRY_KINDS.filter((k) => k !== 'group').sort();
    assert.deepEqual(GEOMETRY_BUILDERS.slice().sort(), declared,
        'a kind in one list and not the other is a part that silently vanishes, '
        + 'taking its children with it');
    assert.ok(EPSILON > 0 && EPSILON < 1e-3);
});
