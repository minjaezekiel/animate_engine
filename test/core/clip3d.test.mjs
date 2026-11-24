import test from 'node:test';
import assert from 'node:assert/strict';
import { compileFilm3D } from '../../src/core/script/compile3d.js';

/**
 * Clipping planes and the `cut` verb.
 *
 * Covered here deliberately, because "Inside the Earth" does NOT use them:
 * a layered planet wants real cut FACES and a clip plane leaves the body
 * hollow, so the film builds its section as geometry. Clip planes are the
 * right tool for the other case -- sectioning a prop or a set that has no
 * layers to reveal -- and an untested feature that no film exercises is a
 * feature that quietly stops working.
 */

const trackFor = (compiled, target, path) =>
    compiled.timeline.tracks.find((t) => t.target === target && t.path === path);

const baseFilm = (over = {}) => ({
    version: 1,
    meta: { fps: 24, width: 640, height: 360, ...over.meta },
    assemblies: { box: { parts: [
        { id: 'body', geometry: { kind: 'cube' }, material: { color: '#888' } }] } },
    cast: [{ assembly: 'box', as: 'box' }],
    scenes: [{ id: 's', shots: [{ id: 'one', duration: 4, actions: over.actions ?? [] }] }],
    ...over.rest,
});

test('meta.clip', async (t) => {
    await t.test('accepts the long form and the bare array', () => {
        const c = compileFilm3D(baseFilm({ meta: {
            clip: [{ name: 'x', normal: [1, 0, 0], at: 0.5 }, [0, 1, 0, -2]] } }));
        assert.equal(c.diagnostics.length, 0);
        assert.equal(c.meta.clip.length, 2);
        assert.equal(c.meta.clip[0].name, 'x');
        assert.equal(c.meta.clip[1].name, 'clip1');
        assert.equal(c.meta.clip[1].at, -2);
    });

    await t.test('normalises the normal, so `at` is always a distance', () => {
        const c = compileFilm3D(baseFilm({ meta: { clip: [[0, 0, 7, 1.5]] } }));
        assert.deepEqual(c.meta.clip[0].normal.map((n) => +n.toFixed(6)), [0, 0, 1]);
        assert.equal(c.meta.clip[0].at, 1.5);
    });

    await t.test('warns and drops a degenerate plane rather than keeping it', () => {
        /**
         * A zero normal is a plane with no orientation. THREE keeps it, every
         * fragment tests against a degenerate half-space, and the mesh either
         * vanishes entirely or is untouched depending on the sign of a float
         * that is meant to be zero.
         */
        const c = compileFilm3D(baseFilm({ meta: { clip: [[0, 0, 0, 1]] } }));
        assert.equal(c.meta.clip.length, 0);
        assert.ok(c.diagnostics.some((d) => /zero length/.test(d.message)));
    });

    await t.test('warns on a missing normal', () => {
        const c = compileFilm3D(baseFilm({ meta: { clip: [{ at: 1 }] } }));
        assert.equal(c.meta.clip.length, 0);
        assert.equal(c.diagnostics.length, 1);
    });

    await t.test('becomes a scene node carrying its distance on position.x', () => {
        // `position.x`, not a channel of its own: PoseApplier already
        // understands scalar transform channels and a plane's distance is one
        // number. A new target type would mean teaching the poser, the
        // evaluator and the budget estimator about clip planes in order to
        // animate a float they can all already animate.
        const c = compileFilm3D(baseFilm({ meta: { clip: [{ name: 'section', normal: [1, 0, 0], at: 2 }] } }));
        const node = c.scene.get('__clip:section');
        assert.ok(node, 'the plane is a node');
        assert.equal(node.kind, 'clipPlane');
        assert.deepEqual(node.props.at, [2, 0, 0]);
        assert.deepEqual(node.props.normal, [1, 0, 0]);
    });
});

test('the `cut` verb', async (t) => {
    await t.test('animates a named plane from its authored distance', () => {
        const c = compileFilm3D(baseFilm({
            meta: { clip: [{ name: 'section', normal: [1, 0, 0], at: 2 }] },
            actions: [{ do: 'cut', plane: 'section', to: 0, at: 1, for: 2 }],
        }));
        assert.equal(c.diagnostics.length, 0);
        const track = trackFor(c, '__clip:section', 'position.x');
        assert.ok(track, 'cut wrote a track');
        const values = track.keys.map((k) => k.v);
        assert.ok(values.includes(0), 'it reaches the target');
        assert.ok(values.includes(2), 'it starts from the authored distance');
    });

    await t.test('warns, and writes nothing, for a plane that was never declared', () => {
        const c = compileFilm3D(baseFilm({
            actions: [{ do: 'cut', plane: 'nope', to: 0, at: 0, for: 1 }],
        }));
        assert.equal(c.diagnostics.length, 1);
        assert.ok(/unknown clip plane/.test(c.diagnostics[0].message));
        assert.equal(trackFor(c, '__clip:nope', 'position.x'), undefined);
    });

    await t.test('eases and overshoots like every other verb', () => {
        // Routed through `writeScalar`, so a cut that overshoots and settles
        // comes free rather than needing its own interpolation.
        const c = compileFilm3D(baseFilm({
            meta: { clip: [{ name: 's', normal: [0, 1, 0], at: 1 }] },
            actions: [{ do: 'cut', plane: 's', to: 0, at: 0, for: 2, overshoot: 0.3 }],
        }));
        const track = trackFor(c, '__clip:s', 'position.x');
        assert.ok(track.keys.length >= 3, 'overshoot adds a key');
    });
});

test('a material naming clip planes keeps the names for the backend', () => {
    // Per-material clipping is how a cutaway sections the subject and leaves
    // the set whole. The compiler's job is only to carry the names through;
    // the adapter resolves them to THREE.Plane objects.
    const c = compileFilm3D({
        version: 1,
        meta: { fps: 24, clip: [{ name: 'a', normal: [1, 0, 0] }, { name: 'b', normal: [0, 0, 1] }] },
        materials: { shell: { color: '#fff', clip: ['a', 'b'], clipIntersection: true } },
        assemblies: { box: { parts: [
            { id: 'body', geometry: { kind: 'sphere' }, material: 'shell' }] } },
        cast: [{ assembly: 'box', as: 'box' }],
        scenes: [{ id: 's', shots: [{ id: 'one', duration: 1 }] }],
    });
    assert.equal(c.diagnostics.length, 0);
    const mat = c.scene.get('box/body').props.material;
    assert.deepEqual(mat.clip, ['a', 'b']);
    assert.equal(mat.clipIntersection, true);
});

test('sphere sweep parameters survive compilation', () => {
    // The four parameters THREE has always had and the adapter never passed,
    // whose absence is why a cutaway was impossible.
    const c = compileFilm3D({
        version: 1,
        meta: { fps: 24 },
        assemblies: { planet: { parts: [
            { id: 'shell', material: { color: '#fff' },
              geometry: { kind: 'sphere', radius: 1, phiStart: 0, phiLength: 270 } }] } },
        cast: [{ assembly: 'planet', as: 'planet' }],
        scenes: [{ id: 's', shots: [{ id: 'one', duration: 1 }] }],
    });
    const g = c.scene.get('planet/shell').props.geometry;
    assert.equal(g.phiLength, 270);
    assert.equal(g.phiStart, 0);
});

test('a part with no geometry is a pivot, not a cube', () => {
    /**
     * "Tilt the planet 23.4 degrees, and spin the globe inside that tilt" is
     * two nested rotations about two different axes, and a node has one
     * rotation. Defaulting to a cube meant the only empty transform available
     * was an invisible mesh -- and an unknown geometry kind makes the backend
     * skip the node, silently orphaning everything parented to it.
     */
    const c = compileFilm3D({
        version: 1,
        meta: { fps: 24 },
        assemblies: { rig: { parts: [
            { id: 'tilt', rot: [0, 0, -23.4] },
            { id: 'spin', parent: 'tilt', rot: [0, 135, 0] },
            { id: 'ball', parent: 'spin', geometry: { kind: 'sphere' },
              material: { color: '#fff' } },
        ] } },
        cast: [{ assembly: 'rig', as: 'rig' }],
        scenes: [{ id: 's', shots: [{ id: 'one', duration: 1 }] }],
    });
    assert.equal(c.diagnostics.length, 0);
    assert.equal(c.scene.get('rig/tilt').kind, 'group');
    assert.equal(c.scene.get('rig/spin').kind, 'group');
    assert.equal(c.scene.get('rig/ball').kind, 'mesh');
    assert.equal(c.scene.get('rig/ball').parentId, 'rig/spin');
});

test('an authored `visible: false` reaches the scene node', () => {
    // The compiler has accepted `set visible` as a channel since Phase 14 and
    // nothing ever applied the AUTHORED value, so a part meant to appear
    // part-way through a film was on screen from frame one.
    const c = compileFilm3D({
        version: 1,
        meta: { fps: 24 },
        assemblies: { rig: { parts: [
            { id: 'later', geometry: { kind: 'cube' }, material: { color: '#fff' },
              visible: false }] } },
        cast: [{ assembly: 'rig', as: 'rig' }],
        scenes: [{ id: 's', shots: [{ id: 'one', duration: 1 }] }],
    });
    assert.equal(c.scene.get('rig/later').visible, false);
});

test('spin and squash', async (t) => {
    const film = (actions) => compileFilm3D(baseFilm({ actions }));

    await t.test('spin writes two linear keys a whole number of turns apart', () => {
        // `smooth` puts a hesitation at each end of the ramp, which on a
        // continuous rotation reads as a stutter rather than as motion.
        const c = film([{ do: 'spin', target: 'box', axis: 'y', turns: 2, at: 0, for: 4 }]);
        const track = trackFor(c, 'box', 'rotation.y');
        assert.equal(track.keys.length, 2);
        // `setKey` omits `ease` when it is linear, so "linear" on a stored
        // key is the ABSENCE of an ease. What matters is that nothing
        // smoothed it: a `smooth` ramp hesitates at both ends, which on a
        // continuous rotation reads as a stutter.
        assert.ok(track.keys.every((k) => k.ease === undefined || k.ease === 'linear'),
                  `a spin must not be eased: ${JSON.stringify(track.keys)}`);
        const delta = track.keys[1].v - track.keys[0].v;
        assert.ok(Math.abs(delta - 4 * Math.PI) < 1e-9, `${delta} should be two turns`);
    });

    await t.test('spin keys BOTH ends, so earlier shots are unaffected', () => {
        // A track reads as its first key at every earlier time, so a spin
        // starting at second 30 with only an end key is a planet already a
        // quarter turned in shot one.
        const c = film([{ do: 'spin', target: 'box', axis: 'y', turns: 1, at: 2, for: 2 }]);
        const track = trackFor(c, 'box', 'rotation.y');
        assert.equal(track.keys[0].t, 2);
        assert.equal(track.keys[0].v, 0);
    });

    await t.test('spin rejects a bad axis with a warning', () => {
        const c = film([{ do: 'spin', target: 'box', axis: 'w', turns: 1, at: 0, for: 1 }]);
        assert.equal(c.diagnostics.length, 1);
        assert.ok(/axis x, y or z/.test(c.diagnostics[0].message));
    });

    await t.test('squash preserves volume', () => {
        /**
         * Scaling one axis up and the other down by the SAME number changes
         * the volume, and a ball that gains mass on impact is the clearest
         * tell of hand-typed squash. The two widening axes go as the square
         * root, so the product of the three scales is 1.
         */
        const c = film([{ do: 'squash', target: 'box', axis: 'y', amount: 0.44,
                          at: 0, for: 0.1 }]);
        const peak = (axis) => {
            const keys = trackFor(c, 'box', `scale.${axis}`).keys;
            return keys.find((k) => Math.abs(k.t - 0.1) < 1e-6).v;
        };
        const volume = peak('x') * peak('y') * peak('z');
        assert.ok(Math.abs(volume - 1) < 1e-9, `volume ${volume} should stay 1`);
        assert.ok(peak('y') < 1, 'the named axis compresses');
        assert.ok(peak('x') > 1, 'the others widen');
    });

    await t.test('squash returns to rest', () => {
        const c = film([{ do: 'squash', target: 'box', axis: 'y', amount: 0.3,
                          at: 0, for: 0.1, back: 0.3 }]);
        const keys = trackFor(c, 'box', 'scale.y').keys;
        assert.equal(keys[keys.length - 1].v, 1);
        assert.ok(Math.abs(keys[keys.length - 1].t - 0.4) < 1e-9);
    });
});
