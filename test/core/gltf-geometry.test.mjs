/**
 * Geometry facts about a glTF model, without a renderer.
 *
 * Fixtures are BUILT here rather than downloaded. A test that needs a 40 MB
 * model from a CDN is a test that fails on a train, and the whole argument
 * for parsing the container rather than loading the model is that it needs
 * nothing -- so the tests should need nothing either.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyMatrix, meshInstances, meshStats, modelBounds, morphTargets,
    mul4, nodeMatrix, readAccessor,
} from '../../src/core/io/gltfGeometry.js';
import {
    EXPECTED_HEIGHT, guessUnits, guessUpAxis, recommendImport, triangleAdvice,
} from '../../src/core/io/normalizeAsset.js';

/** A glTF with one mesh of `tris` triangles and a declared position range. */
function doc({ min = [-1, -1, -1], max = [1, 1, 1], tris = 2, nodes = null,
               mode = 4, indexed = true, targets = null, targetNames = null } = {}) {
    const verts = indexed ? tris + 2 : tris * 3;
    return {
        asset: { version: '2.0' },
        scene: 0,
        scenes: [{ nodes: [0] }],
        nodes: nodes ?? [{ mesh: 0 }],
        meshes: [{
            name: 'body',
            ...(targetNames ? { extras: { targetNames } } : {}),
            primitives: [{
                mode,
                attributes: { POSITION: 0 },
                ...(indexed ? { indices: 1 } : {}),
                ...(targets ? { targets } : {}),
            }],
        }],
        accessors: [
            { type: 'VEC3', componentType: 5126, count: verts, min, max },
            { type: 'SCALAR', componentType: 5123, count: tris * 3 },
        ],
    };
}

// ----------------------------------------------------------- the accessors

test('an accessor is read, honouring type and component type', () => {
    const floats = new Float32Array([1, 2, 3, 4, 5, 6]);
    const json = {
        buffers: [{ byteLength: floats.byteLength }],
        bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: floats.byteLength }],
        accessors: [{ bufferView: 0, type: 'VEC3', componentType: 5126, count: 2 }],
    };
    assert.deepEqual([...readAccessor(json, new Uint8Array(floats.buffer), 0)],
                     [1, 2, 3, 4, 5, 6]);
});

test('an INTERLEAVED buffer is read by its stride, not as if packed', () => {
    /**
     * An interleaved buffer -- position, normal, uv alternating per vertex --
     * is the normal output of every exporter that cares about load time.
     * Reading it as tightly packed gives numbers that look like geometry and
     * are not, which is the worst kind of wrong for a collider.
     */
    // Two vertices: [px,py,pz, nx,ny,nz] each, stride 24 bytes.
    const raw = new Float32Array([7, 8, 9, 0, 1, 0, 70, 80, 90, 0, 1, 0]);
    const json = {
        bufferViews: [{ buffer: 0, byteOffset: 0, byteStride: 24,
                        byteLength: raw.byteLength }],
        accessors: [{ bufferView: 0, type: 'VEC3', componentType: 5126, count: 2, byteOffset: 0 }],
    };
    assert.deepEqual([...readAccessor(json, new Uint8Array(raw.buffer), 0)],
                     [7, 8, 9, 70, 80, 90]);
});

test('an accessor with no bufferView reads as zeros, which is legal', () => {
    // How a morph target that moves nothing is encoded.
    const json = { accessors: [{ type: 'VEC3', componentType: 5126, count: 2 }] };
    assert.deepEqual([...readAccessor(json, new Uint8Array(0), 0)], [0, 0, 0, 0, 0, 0]);
});

test('a sparse accessor THROWS rather than silently losing its overrides', () => {
    const json = { accessors: [{ type: 'VEC3', componentType: 5126, count: 1, sparse: {} }] };
    assert.throws(() => readAccessor(json, new Uint8Array(0), 0), /sparse/);
});

test('a missing or unknown accessor is reported, not guessed at', () => {
    assert.equal(readAccessor({ accessors: [] }, new Uint8Array(0), 0), null);
    assert.throws(() => readAccessor(
        { accessors: [{ type: 'WAT', componentType: 5126, count: 1 }] }, new Uint8Array(0), 0),
        /unknown type/);
    assert.throws(() => readAccessor(
        { accessors: [{ bufferView: 9, type: 'VEC3', componentType: 5126, count: 1 }] },
        new Uint8Array(0), 0), /bufferView 9 is missing/);
});

// ------------------------------------------------------------- transforms

test('a node matrix comes from `matrix` or from T/R/S', () => {
    assert.deepEqual(nodeMatrix({ matrix: [2, 0, 0, 0, 0, 2, 0, 0, 0, 0, 2, 0, 1, 2, 3, 1] })[12], 1);
    const m = nodeMatrix({ translation: [5, 6, 7], scale: [2, 2, 2] });
    assert.deepEqual([m[12], m[13], m[14]], [5, 6, 7]);
    assert.equal(m[0], 2);
    assert.deepEqual(nodeMatrix(null).slice(0, 4), [1, 0, 0, 0]);
});

test('a quarter turn about X maps +Y to +Z', () => {
    const q = Math.sin(Math.PI / 4);
    const m = nodeMatrix({ rotation: [q, 0, 0, Math.cos(Math.PI / 4)] });
    const p = applyMatrix(m, [0, 1, 0]).map((v) => +v.toFixed(6));
    assert.deepEqual(p, [0, 0, 1]);
});

test('T * R * S is composed in glTF order, which only shows up when nested', () => {
    // A translated child under a scaled parent: getting the order wrong puts
    // it in the wrong place, and only in that case, which is exactly the case
    // nobody checks by eye.
    const parent = nodeMatrix({ scale: [10, 10, 10] });
    const child = nodeMatrix({ translation: [1, 0, 0] });
    assert.deepEqual(applyMatrix(mul4(parent, child), [0, 0, 0]), [10, 0, 0]);
});

test('mesh instances are found through the node tree, with world transforms', () => {
    const json = doc({ nodes: [
        { children: [1], scale: [2, 2, 2] },
        { children: [2], translation: [0, 5, 0] },
        { mesh: 0, name: 'leaf' },
    ] });
    const inst = meshInstances(json);
    assert.equal(inst.length, 1);
    assert.equal(inst[0].name, 'leaf');
    assert.deepEqual(applyMatrix(inst[0].world, [0, 0, 0]), [0, 10, 0],
        'the leaf inherits its grandparent scale and its parent offset');
});

test('a cyclic node tree is a diagnosis, not a stack overflow', () => {
    // A malformed file CAN contain one, and a recursive walk over it crashes.
    const json = doc({ nodes: [{ children: [1] }, { children: [0], mesh: 0 }] });
    const inst = meshInstances(json);
    assert.equal(inst.length, 1);
});

// ---------------------------------------------------------------- bounds

test('bounds come from the accessor min/max, with no buffer read at all', () => {
    const b = modelBounds(doc({ min: [-2, 0, -1], max: [2, 4, 1] }));
    assert.deepEqual(b.min, [-2, 0, -1]);
    assert.deepEqual(b.size, [4, 4, 2]);
    assert.deepEqual(b.center, [0, 2, 0]);
    assert.equal(b.extent, 4);
});

test('bounds compose the node transform', () => {
    const b = modelBounds(doc({ min: [-1, -1, -1], max: [1, 1, 1],
                                nodes: [{ mesh: 0, scale: [3, 1, 1], translation: [10, 0, 0] }] }));
    assert.deepEqual(b.min, [7, -1, -1]);
    assert.deepEqual(b.max, [13, 1, 1]);
});

test('ALL EIGHT corners are transformed, so a rotated box is not undersized', () => {
    /**
     * Taking the min and max of only two corners under rotation gives a box
     * that can be SMALLER than the geometry inside it -- the worst direction
     * for an error that goes on to decide a collider.
     */
    const q = Math.sin(Math.PI / 8);     // 45 degrees about Z
    const b = modelBounds(doc({ min: [-1, -1, 0], max: [1, 1, 0],
                                nodes: [{ mesh: 0, rotation: [0, 0, q, Math.cos(Math.PI / 8)] }] }));
    const diag = Math.SQRT2;
    assert.ok(Math.abs(b.size[0] - 2 * diag) < 1e-6,
        `a square rotated 45 degrees spans its diagonal; got ${b.size[0]}`);
});

test('a model with no position ranges has no bounds, and says so', () => {
    const json = doc();
    delete json.accessors[0].min;
    delete json.accessors[0].max;
    assert.equal(modelBounds(json), null);
    assert.equal(modelBounds({ asset: {} }), null);
});

// ----------------------------------------------------------------- stats

test('triangles are counted from the index accessor', () => {
    const s = meshStats(doc({ tris: 1000 }));
    assert.equal(s.triangles, 1000);
    assert.equal(s.meshes[0].name, 'body');
    assert.equal(s.primitives, 1);
});

test('a STRIP is not counted as if it were a triangle list', () => {
    // n indices as a strip is n-2 triangles, not n/3. Defaulting everything
    // to count/3 overstates a strip by a factor of three.
    assert.equal(meshStats(doc({ tris: 30, mode: 5 })).triangles, 88);  // 90 indices -> 88
    assert.equal(meshStats(doc({ tris: 30, mode: 4 })).triangles, 30);
    assert.equal(meshStats(doc({ tris: 30, mode: 0 })).triangles, 0, 'points are not triangles');
});

test('an unindexed primitive counts its vertices instead', () => {
    assert.equal(meshStats(doc({ tris: 12, indexed: false })).triangles, 12);
});

test('INSTANCED geometry reports what is drawn, not just what is stored', () => {
    /**
     * A 500-triangle bolt used 4,000 times is 2M triangles in the frame and
     * 500 in the file. Reporting only the file's number is how a scene that
     * cannot be rendered at all looks lightweight.
     */
    const json = doc({ tris: 500, nodes: [
        { children: [1, 2, 3] }, { mesh: 0 }, { mesh: 0 }, { mesh: 0 },
    ] });
    const s = meshStats(json);
    assert.equal(s.triangles, 500, 'the file holds 500');
    assert.equal(s.instances, 3);
    assert.equal(s.trianglesDrawn, 1500, 'the frame draws 1500');
});

// --------------------------------------------------------- morph targets

test('morph targets are found, and named when the file names them', () => {
    // The gap this closes: `grep -i morphTarget` across src/ returned nothing,
    // so the viseme track computed for every line had no 3D consumer.
    const json = doc({ targets: [{ POSITION: 0 }, { POSITION: 0 }],
                       targetNames: ['viseme_AA', 'viseme_O'] });
    assert.deepEqual(morphTargets(json), [
        { mesh: 'body', count: 2, names: ['viseme_AA', 'viseme_O'] },
    ]);
});

test('unnamed morph targets are reported as a count, not invented names', () => {
    // Eight unnamed targets are riggable by index; eight named ones are
    // riggable by meaning. The difference has to survive the report.
    const json = doc({ targets: [{ POSITION: 0 }, { POSITION: 0 }] });
    assert.deepEqual(morphTargets(json), [{ mesh: 'body', count: 2, names: null }]);
    assert.deepEqual(morphTargets(doc()), []);
});

// -------------------------------------------------------- normalisation

test('a Z-up model is detected and given a rotation to paste', () => {
    // The CAD and Blender-export default, and why an imported model so often
    // arrives face-down.
    const up = guessUpAxis({ size: [0.5, 0.4, 1.8] });
    assert.equal(up.axis, 'z');
    assert.deepEqual(up.rotation, [-Math.PI / 2, 0, 0]);
    assert.equal(up.confidence, 'high');
    assert.match(up.reason, /Z is the longest axis/);
});

test('a Y-up model needs no rotation', () => {
    const up = guessUpAxis({ size: [0.5, 1.8, 0.4] });
    assert.equal(up.axis, 'y');
    assert.equal(up.rotation, undefined);
});

test('a near-cubic model admits it carries NO signal', () => {
    // Picking Y and being right 60% of the time means being wrong 40% of the
    // time about a model lying on its face -- obvious in a render, baffling
    // in a diff.
    const up = guessUpAxis({ size: [1, 1.1, 1.05] });
    assert.equal(up.axis, null);
    assert.equal(up.confidence, 'none');
    assert.match(up.reason, /near-cubic/);
    assert.equal(guessUpAxis(null).confidence, 'none');
    assert.equal(guessUpAxis({ size: [0, 0, 0] }).confidence, 'none');
});

test('centimetres are inferred for a 170-unit-tall character', () => {
    const u = guessUnits({ size: [50, 170, 30] });
    assert.equal(u.units, 'centimetres');
    assert.equal(u.scale, 0.01);
    assert.equal(u.wouldBe, 1.7);
    assert.equal(u.confidence, 'high');
    assert.equal(u.measuredAxis, 'y');
});

test('metres are inferred for a 1.7-unit-tall character', () => {
    const u = guessUnits({ size: [0.5, 1.7, 0.3] });
    assert.equal(u.units, 'metres');
    assert.equal(u.scale, 1);
    assert.equal(u.confidence, 'high');
});

test('the inference is measured against the KIND of thing it is', () => {
    // 170 units tall is centimetres for a person and metres for a building;
    // the expectation is an argument because the answer depends on it.
    assert.equal(guessUnits({ size: [50, 8, 30] }, { kind: 'building' }).units, 'metres');
    assert.equal(guessUnits({ size: [50, 800, 30] }, { kind: 'building' }).units, 'centimetres');
    assert.equal(EXPECTED_HEIGHT.human, 1.7);
});

test('a wildly implausible size says confidence NONE rather than picking one', () => {
    const u = guessUnits({ size: [1, 40000, 1] });
    assert.equal(u.confidence, 'none');
});

test('a full recommendation is something an author can paste', () => {
    const bounds = modelBounds(doc({ min: [-25, 0, -15], max: [25, 170, 15] }));
    const r = recommendImport(bounds, { kind: 'human' });
    assert.equal(r.ok, true);
    assert.equal(r.scale, 0.01);
    assert.equal(r.units, 'centimetres');
    assert.equal(r.suggestion.scale, 0.01);
    // Its feet are at y=0 in the file, so no ground offset is needed.
    assert.deepEqual(r.suggestion.at, [0, 0, 0]);
    assert.ok(r.notes.some((n) => /centimetres inferred/.test(n)));
});

test('a model whose origin is its centre is lifted onto the floor', () => {
    // An imported model's origin is wherever its author left it -- commonly
    // the centre of the box, so half of it is underground.
    const bounds = modelBounds(doc({ min: [-25, -85, -15], max: [25, 85, 15] }));
    const r = recommendImport(bounds, { kind: 'human' });
    assert.equal(r.scale, 0.01);
    assert.equal(r.suggestion.at[1], 0.85, 'half its height, in metres, is the lift');
});

test('an explicit target height beats any inference, and says so', () => {
    const bounds = modelBounds(doc({ min: [0, 0, 0], max: [1, 2, 1] }));
    const r = recommendImport(bounds, { targetHeight: 10 });
    assert.equal(r.scale, 5);
    assert.equal(r.confidence, 'given');
    assert.ok(r.notes.some((n) => /requested height/.test(n)));
});

test('a large correction is flagged for confirmation', () => {
    const bounds = modelBounds(doc({ min: [0, 0, 0], max: [500, 1700, 300] }));
    const r = recommendImport(bounds, { kind: 'human' });
    assert.ok(r.notes.some((n) => /worth confirming/.test(n)),
        'a 1000x correction should not be applied on trust');
});

test('a model with no bounds gets a reason, not a crash', () => {
    const r = recommendImport(null);
    assert.equal(r.ok, false);
    assert.match(r.reason, /no measurable bounds/);
});

test('triangle advice is a number WITH a threshold beside it', () => {
    assert.equal(triangleAdvice({ trianglesDrawn: 0 }).level, 'info');
    assert.match(triangleAdvice({ trianglesDrawn: 0 }).message, /draws nothing/);
    assert.equal(triangleAdvice({ trianglesDrawn: 500_000 }).level, 'info');
    assert.equal(triangleAdvice({ trianglesDrawn: 2_000_000 }).level, 'info');
    const heavy = triangleAdvice({ trianglesDrawn: 20_000_000 });
    assert.equal(heavy.level, 'warning');
    assert.match(heavy.message, /decimated copy/);
});
