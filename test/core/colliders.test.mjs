/**
 * Colliders from a mesh.
 *
 * Nothing in `src/` could do this before: an imported mesh could not become a
 * rigid body without an author writing a primitive by hand and hand-matching
 * it to geometry they could only see in a render.
 *
 * The property that matters most is ENCLOSURE. A collider slightly too big
 * makes contact slightly early; one slightly too small lets geometry pass
 * through it, which is the bug that reads as "things fall through the floor"
 * and is traced back to a solver that is working perfectly.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { boxCollider, colliderFor, hullCollider, meshVolume,
         sphereCollider } from '../../src/core/sim/colliders.js';

/** A unit cube centred on the origin, as a flat position array. */
const CUBE = [
    -1, -1, -1, 1, -1, -1, 1, 1, -1, -1, 1, -1,
    -1, -1, 1, 1, -1, 1, 1, 1, 1, -1, 1, 1,
];

/** A sphere of `r`, sampled on a lat/long grid. */
function ball(r = 1, rings = 12, segs = 18, offset = [0, 0, 0]) {
    const out = [];
    for (let i = 0; i <= rings; i++) {
        const phi = (i / rings) * Math.PI;
        for (let j = 0; j < segs; j++) {
            const th = (j / segs) * Math.PI * 2;
            out.push(offset[0] + r * Math.sin(phi) * Math.cos(th),
                     offset[1] + r * Math.cos(phi),
                     offset[2] + r * Math.sin(phi) * Math.sin(th));
        }
    }
    return out;
}

test('a box is exact for a box', () => {
    const b = boxCollider(CUBE);
    assert.deepEqual(b.min, [-1, -1, -1]);
    assert.deepEqual(b.max, [1, 1, 1]);
    assert.deepEqual(b.size, [2, 2, 2]);
    assert.deepEqual(b.center, [0, 0, 0]);
    assert.equal(b.volume, 8);
});

test('a box handles an off-centre mesh', () => {
    const b = boxCollider([4, 10, -2, 6, 14, -1]);
    assert.deepEqual(b.center, [5, 12, -1.5]);
    assert.deepEqual(b.size, [2, 4, 1]);
});

test('an empty or malformed position array gives no collider, not a NaN box', () => {
    assert.equal(boxCollider([]), null);
    assert.equal(sphereCollider([]), null);
    assert.equal(hullCollider([1, 2, 3]), null);
    // A trailing partial vertex is ignored rather than read as zeros, which
    // would silently grow every collider towards the origin.
    assert.deepEqual(boxCollider([1, 1, 1, 2, 2]).max, [1, 1, 1]);
});

test('a sphere ENCLOSES every vertex — the property that matters', () => {
    for (const mesh of [CUBE, ball(1), ball(3, 8, 12, [5, -2, 1]),
                        [0, 0, 0, 10, 0, 0, 0, 0.1, 0]]) {
        const s = sphereCollider(mesh);
        for (let i = 0; i + 2 < mesh.length; i += 3) {
            const d = Math.hypot(mesh[i] - s.center[0], mesh[i + 1] - s.center[1],
                                 mesh[i + 2] - s.center[2]);
            assert.ok(d <= s.radius + 1e-9,
                `a vertex sits ${(d - s.radius).toExponential(2)} outside the sphere`);
        }
    }
});

test('a sphere is tight, not merely enclosing', () => {
    // Ritter's method is approximate; "approximate" has to mean within a few
    // percent or the collider is useless even though it encloses.
    const s = sphereCollider(ball(2));
    assert.ok(s.radius >= 2 - 1e-6, `radius ${s.radius} does not contain the ball`);
    assert.ok(s.radius < 2 * 1.1, `radius ${s.radius} is more than 10% loose on a true sphere`);
});

test('a hull of a cube is the cube', () => {
    const h = hullCollider(CUBE);
    assert.equal(h.vertices.length, 8, 'a cube has eight hull vertices and no more');
    assert.ok(Math.abs(h.volume - 8) < 1e-6, `volume ${h.volume}, want 8`);
    assert.ok(h.fill > 0.99, `a cube should fill its own bounding box, got ${h.fill}`);
});

test('a hull discards interior points', () => {
    // The whole value of a hull: 500 points inside a cube add nothing to it.
    const inside = [];
    let seed = 7;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 1.6 - 0.8;
    for (let i = 0; i < 500; i++) inside.push(rnd(), rnd(), rnd());
    const h = hullCollider([...CUBE, ...inside]);
    assert.equal(h.vertices.length, 8);
    assert.ok(Math.abs(h.volume - 8) < 1e-6);
});

test('a hull cannot be bigger than the shape it wraps', () => {
    /**
     * The assertion that caught a real bug.
     *
     * Points sampled ON a sphere must have a hull INSIDE that sphere, so its
     * volume cannot exceed the sphere's -- and it did. The cause was using a
     * point on the hull surface as the interior reference when orienting new
     * faces, which flipped the handful of faces that were near-coplanar with
     * it, so the divergence-theorem sum came out larger than the shape could
     * contain. A hull being too big is also the worst direction for a
     * collider error to run.
     */
    const mesh = ball(1.5, 10, 14);
    const h = hullCollider(mesh);
    const trueVol = (4 / 3) * Math.PI * 1.5 ** 3;
    assert.ok(h.volume <= trueVol + 1e-9,
        `hull volume ${h.volume.toFixed(4)} exceeds the sphere's ${trueVol.toFixed(4)}`);
    // And close to it, or the hull is missing most of the surface.
    assert.ok(h.volume > trueVol * 0.9,
        `hull volume ${h.volume.toFixed(3)} is well under the sphere's ${trueVol.toFixed(3)}`);
    assert.ok(h.vertices.length > 20, 'a sampled sphere should give many hull vertices');
});

test('a flat or collinear mesh has no hull, and says so', () => {
    // A plane has no volume, so there is nothing to insert points into.
    assert.equal(hullCollider([0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 1]), null);
    assert.equal(hullCollider([0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3]), null);
    assert.equal(hullCollider([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]), null);
});

test('a huge mesh is sampled on a stride, keeping the extremes', () => {
    // Sampling from the FRONT would give a hull of one corner of the mesh --
    // right in a test, wrong in a scene.
    const mesh = [];
    for (let i = 0; i < 6000; i++) {
        const t = i / 5999;
        mesh.push(-50 + t * 100, Math.sin(t * 20) * 3, Math.cos(t * 20) * 3);
    }
    const h = hullCollider(mesh, { limit: 300 });
    const box = boxCollider(mesh);
    const hb = boxCollider(h.vertices.flat());
    assert.ok(hb.min[0] <= box.min[0] + 1e-9, 'the far-left extreme was dropped by sampling');
    assert.ok(hb.max[0] >= box.max[0] - 1e-9, 'the far-right extreme was dropped by sampling');
});

// ------------------------------------------------------------- the chooser

test('a box-shaped mesh is given a box, because a box is cheaper', () => {
    const { collider, reason } = colliderFor(CUBE);
    assert.equal(collider.kind, 'box');
    assert.match(reason, /fills 100% of its bounding box/);
});

test('a ball is given a sphere', () => {
    const { collider } = colliderFor(ball(1));
    assert.equal(collider.kind, 'sphere');
});

test('an irregular solid is given a hull', () => {
    // A squashed, sheared blob: not a box, not a ball.
    const mesh = [];
    for (const p of [[0, 0, 0], [3, 0.2, 0], [2.6, 1.4, 0.3], [0.4, 1.1, -0.2],
                     [1.2, 0.6, 1.1], [1.4, 0.7, -1.2], [2.0, 1.9, 0.1]]) mesh.push(...p);
    const { collider } = colliderFor(mesh);
    assert.equal(collider.kind, 'hull');
});

/**
 * A closed hollow box: an outer shell and an inverted inner shell.
 *
 * Returns positions AND indices, because concavity is only measurable with
 * faces. At `inner = 0.9` the walls are thin: 2^3 - 1.8^3 = 2.17 of material
 * inside a hull of 8, so solidity is 27% -- a room, whose convex hull is a
 * solid block.
 *
 * The first attempt used `inner = 0.78` and measured 53%, which is NOT
 * hollow by any reasonable threshold and should not have warned. Worth
 * keeping: a 22%-thick wall is a chunky solid, not a shell, and the
 * measurement was right where the expectation was wrong.
 */
function hollowBox(outer = 1, inner = 0.8) {
    const positions = [];
    const indices = [];
    for (const [r, flip] of [[outer, false], [inner, true]]) {
        const base = positions.length / 3;
        for (const c of [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
                         [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]]) {
            positions.push(c[0] * r, c[1] * r, c[2] * r);
        }
        const quads = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 3, 7],
                       [1, 5, 6, 2], [4, 5, 1, 0], [3, 2, 6, 7]];
        for (const [a, b, c, d] of quads) {
            // The inner shell is wound backwards, so its volume subtracts.
            const t = flip ? [[a, c, b], [a, d, c]] : [[a, b, c], [a, c, d]];
            for (const tri of t) indices.push(base + tri[0], base + tri[1], base + tri[2]);
        }
    }
    return { positions, indices };
}

test('a mesh volume is measured from its own faces', () => {
    const { positions, indices } = hollowBox(1, 0.8);
    // 2^3 - 1.6^3
    assert.ok(Math.abs(meshVolume(positions, indices) - (8 - 4.096)) < 1e-9,
        `got ${meshVolume(positions, indices)}`);
    assert.equal(meshVolume(positions, null), null, 'no faces, no volume');
    assert.equal(meshVolume(positions, []), null);
});

test('a concave shape is WARNED about, because a convex hull fills the hollow', () => {
    // A hollow box: the hull is a solid block, so nothing can ever get
    // inside it -- the bug that reads as "my character cannot walk into the
    // room" and is traced to a solver that is working perfectly.
    const { positions, indices } = hollowBox(1, 0.9);
    const { collider, warning } = colliderFor(positions, { indices });
    assert.equal(collider.kind, 'box', 'a hollow BOX still has box-shaped bounds');
    assert.ok(warning, 'a hollow shape must be reported, not returned silently');
    assert.match(warning, /CONCAVE/);
    assert.match(warning, /not be able to get inside/);
    assert.match(warning, /% of its own convex hull/);
});

test('a SOLID shape is not warned about, so the warning stays worth reading', () => {
    // Crying concave at every sphere would train an author to ignore it.
    const { positions, indices } = hollowBox(1, 0);   // inner shell collapsed: solid
    assert.equal(colliderFor(positions, { indices }).warning, undefined);
    // A chunky wall is a solid, not a shell: 53% of its own hull.
    const chunky = hollowBox(1, 0.78);
    assert.equal(colliderFor(chunky.positions, { indices: chunky.indices }).warning, undefined);
    // And a convex sphere, which fills only 52% of its bounding box, must not
    // trip the weak box-based signal either.
    assert.equal(colliderFor(ball(1)).warning, undefined);
});

test('without an index buffer the concavity check says it is guessing', () => {
    const { positions } = hollowBox(1, 0.9);
    const { warning } = colliderFor(positions, { prefer: 'hull' });
    // Positions alone cannot distinguish a hollow box from a solid one -- the
    // vertices are identical bar the inner shell -- so either no warning or a
    // hedged one, never a confident false claim.
    if (warning) assert.match(warning, /MAY mean|guess/);
});

test('an explicit preference is honoured without argument', () => {
    assert.equal(colliderFor(ball(1), { prefer: 'box' }).collider.kind, 'box');
    assert.equal(colliderFor(CUBE, { prefer: 'sphere' }).collider.kind, 'sphere');
    assert.equal(colliderFor(CUBE, { prefer: 'hull' }).collider.kind, 'hull');
});

test('a mesh with no vertices is reported, not crashed on', () => {
    const { collider, reason } = colliderFor([]);
    assert.equal(collider, null);
    assert.match(reason, /no vertices/);
});

test('a flat mesh falls back to a box rather than to nothing', () => {
    // A ground plane is the single most common collider in any scene and has
    // no hull at all.
    const { collider, reason } = colliderFor([0, 0, 0, 10, 0, 0, 10, 0, 10, 0, 0, 10]);
    assert.equal(collider.kind, 'box');
    assert.match(reason, /flat or collinear/);
});
