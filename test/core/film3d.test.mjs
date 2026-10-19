import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmitter, emitterState, emitterSpan } from '../../src/core/anim/particles.js';
import { compileFilm3D } from '../../src/core/script/compile3d.js';
import { trackValueAt } from '../../src/core/anim/Track.js';
import { samplePose } from '../../src/core/anim/Evaluator.js';

const film = {
    materials: { steel: { color: '#444', metalness: 0.9 } },
    lights: [{ id: 'key', type: 'directional', at: [1, 2, 3], intensity: 2 }],
    assemblies: {
        gun: {
            parts: [
                { id: 'body', geometry: { kind: 'cube', width: 0.25 }, material: 'steel', at: [0, 0, 0] },
                { id: 'barrel', geometry: { kind: 'cylinder', height: 0.415 }, material: 'steel',
                  at: [0.33, 0.012, 0], rot: [0, 0, 90] },
            ],
            actions: { cycle: { duration: 0.1, loop: 'repeat',
                                keys: { 'body.position.x': [[0, 0], [0.05, -0.07], [0.1, 0]] } } },
        },
    },
    emitters: { flash: { count: 8, at: 0, life: 0.1, speed: 4, dir: [1, 0, 0], material: 'steel' } },
    cast: [{ assembly: 'gun', as: 'ak', at: [0, 0, 0] }],
    scenes: [{ id: 'm', shots: [
        { id: 'a', duration: 2, camera: { from: { at: [0, 0, 2], look: [0, 0, 0] },
                                          to: { at: [1, 0, 2], look: [0, 0, 0] } } },
        { id: 'b', duration: 3, actions: [
            { do: 'fly', target: 'ak/barrel', from: [0, 0.5, 0], at: 0.5, for: 1 },
            { do: 'burst', emitter: 'flash', at: 1 },
            { do: 'play', target: 'ak', action: 'cycle', at: 0, for: 2 },
        ] },
    ] }],
};

test('duration is derived from shots, never declared', () => {
    assert.equal(compileFilm3D(film).duration, 5);
    const d = compileFilm3D({ ...film, meta: { duration: 99 } }).diagnostics;
    assert.match(d[0].message, /derived/);
});

test('fly lands exactly on the part\'s authored rest pose', () => {
    const { timeline } = compileFilm3D(film);
    const y = timeline.tracks.find((t) => t.target === 'ak/barrel' && t.path === 'position.y');
    // Before the fly it waits at rest + offset; after, it is seated.
    assert.equal(trackValueAt(y, 0), 0.512);
    assert.equal(trackValueAt(y, 3.5), 0.012);     // shot b starts at 2, fly at +0.5, for 1
    assert.equal(trackValueAt(y, 4.9), 0.012);
});

test('a part that is never flown keeps its rest pose', () => {
    const { timeline, scene } = compileFilm3D(film);
    assert.equal(timeline.tracks.find((t) => t.target === 'ak/body' && t.path === 'position.y'), undefined);
    assert.deepEqual(scene.get('ak/body').props.at, [0, 0, 0]);
});

test('camera is continuous across a cut', () => {
    const { timeline } = compileFilm3D(film);
    const x = timeline.tracks.find((t) => t.target === '__camera' && t.path === 'position.x');
    assert.equal(trackValueAt(x, 2), 1);        // shot a ended here
    assert.equal(trackValueAt(x, 4.9), 1);      // shot b declares no camera: holds, never drifts
});

test('burst claims an emitter rather than appending to its declared time', () => {
    const { emitters } = compileFilm3D(film);
    assert.deepEqual(emitters.get('flash').emitter.at, [3]);   // shot b at 2, burst at +1
});

test('unknown targets and verbs are warnings, never throws', () => {
    const { diagnostics } = compileFilm3D({
        ...film,
        scenes: [{ id: 'm', shots: [{ id: 'a', duration: 1, actions: [
            { do: 'move', target: 'nope/x', to: [0, 0, 0] },
            { do: 'wiggle', target: 'ak' },
        ] }] }],
    });
    assert.equal(diagnostics.length, 2);
    assert.ok(diagnostics.every((d) => d.severity === 'warning'));
});

test('a clip instance drives scalar 3D channels through the shared evaluator', () => {
    const { timeline } = compileFilm3D(film);
    assert.equal(timeline.instances.length, 1);
    const pose = samplePose(timeline, 2.05);     // mid-cycle
    assert.equal(pose.get('ak/body').get('position.x'), -0.07);
});

// ----------------------------------------------------------------- particles

test('particles are a pure function of time', () => {
    const e = createEmitter({ count: 20, at: 0, life: 0.5, speed: 3, seed: 9 });
    assert.deepEqual(emitterState(e, 0.3), emitterState(e, 0.3));
});

test('a particle is invisible before birth and after death', () => {
    const e = createEmitter({ count: 4, at: 1, life: 0.5, speed: 2 });
    assert.equal(emitterState(e, 0.9).filter((p) => p.visible).length, 0);
    assert.equal(emitterState(e, 1.2).filter((p) => p.visible).length, 4);
    assert.equal(emitterState(e, 1.6).filter((p) => p.visible).length, 0);
    assert.deepEqual(emitterSpan(e), { start: 1, end: 1.5 });
});

test('gravity is solved, not integrated', () => {
    // Half g t squared exactly, so seeking mid-burst needs no prior frames.
    const e = createEmitter({ count: 1, at: 0, life: 10, speed: 0, dir: [1, 0, 0],
                              spread: 0, gravity: [0, -10, 0] });
    assert.ok(Math.abs(emitterState(e, 2)[0].y - -20) < 1e-9);
});

test('round-robin spreads particles across bursts', () => {
    const e = createEmitter({ count: 6, at: [0, 5], life: 1, speed: 1 });
    assert.equal(emitterState(e, 0.5).filter((p) => p.visible).length, 3);
    assert.equal(emitterState(e, 5.5).filter((p) => p.visible).length, 3);
});

test('a first transition is seeded from the node\'s authored rest value', () => {
    // Without the seed, `grow` writes one key at its END time, and a track
    // reads as its first key at every earlier time -- so a crater scaled from
    // 0 was already full size at t=0.
    const { timeline } = compileFilm3D({
        assemblies: { s: { parts: [{ id: 'hole', geometry: { kind: 'cube' }, scale: 0 }] } },
        cast: [{ assembly: 's', as: 'set' }],
        scenes: [{ id: 'm', shots: [{ id: 'a', duration: 4, actions: [
            { do: 'grow', target: 'set/hole', to: 1, at: 2, for: 0.1 },
        ] }] }],
    });
    const sx = timeline.tracks.find((t) => t.target === 'set/hole' && t.path === 'scale.x');
    assert.equal(trackValueAt(sx, 0), 0);
    assert.equal(trackValueAt(sx, 1.9), 0);
    assert.equal(trackValueAt(sx, 2.1), 1);
});

test('a second move starts where the first left it, not at rest', () => {
    const { timeline } = compileFilm3D({
        assemblies: { s: { parts: [{ id: 'p', geometry: { kind: 'cube' }, at: [0, 0, 0] }] } },
        cast: [{ assembly: 's', as: 'c' }],
        scenes: [{ id: 'm', shots: [{ id: 'a', duration: 6, actions: [
            { do: 'move', target: 'c/p', to: [5, 0, 0], at: 0, for: 1 },
            { do: 'move', target: 'c/p', to: [9, 0, 0], at: 3, for: 1 },
        ] }] }],
    });
    const x = timeline.tracks.find((t) => t.target === 'c/p' && t.path === 'position.x');
    assert.equal(trackValueAt(x, 3), 5);       // held at the first move's end
    assert.equal(trackValueAt(x, 4), 9);
});

// ------------------------------- targets, constraints, cloth and fluid

const eye = (id, x) => ({ id, parent: 'head', material: 'steel',
                          geometry: { kind: 'sphere', radius: 0.014 },
                          at: [x, 0.0465, 0.0735] });

const rigged = {
    materials: { steel: { color: '#444' }, skin: { color: '#e8c9a8', physical: true, sheen: 0.4 },
                 cape: { color: '#7a1f28' }, jacket: { color: '#2b303a' },
                 shirt: { color: '#e9edf2' }, trouser: { color: '#2b303a' },
                 shoe: { color: '#15171b' } },
    characters: {
        host: {
            rig: 'humanoid', height: 1.82, skin: 'skin',
            parts: [eye('eyeL', 0.033), eye('eyeR', -0.033)],
            constraints: [
                { type: 'lookAt', source: 'eyeL', target: 'gaze', limit: { y: [-32, 32] } },
                { type: 'lookAt', source: 'eyeR', target: 'gaze', limit: { y: [-32, 32] } },
                { type: 'lookAt', source: 'head', target: 'gaze', weight: 0.3 },
                { type: 'ik', chain: 'armL', target: 'hand', pole: [0, 0, -1] },
            ],
        },
    },
    targets: { gaze: [0, 1.6, 2], hand: { at: [0.4, 1.3, 0.3] } },
    cloth: { cape: { pinTo: 'p/chest', cols: 8, rows: 10, material: 'cape',
                     colliders: [{ node: 'p/hips', r: 0.2 }] } },
    fluids: { steam: { n: 16, at: [1, 1, 0], sources: [{ x: 0.5, y: 0.1, at: 0.5, for: 2 }] } },
    cast: [{ character: 'host', as: 'p' }],
    scenes: [{ shots: [{ duration: 2, actions: [{ do: 'move', target: 'gaze', to: [0.4, 1.6, 2], for: 1 }] }] }],
};

test('a target is a node, so `move` animates it and a constraint reads it', () => {
    const c = compileFilm3D(rigged);
    assert.deepEqual(c.diagnostics, []);
    assert.equal(c.scene.get('gaze').kind, 'target');
    assert.deepEqual(c.scene.get('hand').props.at, [0.4, 1.3, 0.3]);
    // This is the whole authoring surface for gaze and IK: no new verb.
    const x = c.timeline.tracks.find((t) => t.target === 'gaze' && t.path === 'position.x');
    assert.equal(trackValueAt(x, 0), 0);
    assert.ok(Math.abs(trackValueAt(x, 1) - 0.4) < 1e-9);
});

test('a bare constraint name is scoped to the character only if it has one', () => {
    const c = compileFilm3D(rigged);
    const look = c.constraints.filter((k) => k.type === 'lookAt');
    assert.deepEqual(look.map((k) => k.source), ['p/eyeL', 'p/eyeR', 'p/head']);
    // `gaze` is a global target and must NOT become `p/gaze`: prefixing
    // blindly made every lookAt point at a node that does not exist.
    assert.ok(look.every((k) => k.target === 'gaze'));
    assert.equal(c.constraints.find((k) => k.type === 'ik').chain, 'p/armL');
    assert.equal(c.constraints.find((k) => k.type === 'ik').target, 'hand');
});

test('correctives are on by default and can be switched off', () => {
    const on = compileFilm3D(rigged).constraints.filter((k) => k.type === 'driven');
    assert.equal(on.length, 4, 'two elbows and two knees');
    assert.ok(on.every((k) => k.input.target.startsWith('p/')));

    const off = compileFilm3D({
        ...rigged,
        characters: { host: { ...rigged.characters.host, correctives: false } },
    }).constraints.filter((k) => k.type === 'driven');
    assert.equal(off.length, 0);
});

test('cloth and fluid compile to nodes, with their references checked', () => {
    const c = compileFilm3D(rigged);
    const cape = c.scene.get('cape');
    assert.equal(cape.kind, 'cloth');
    assert.equal(cape.props.pinTo, 'p/chest');
    assert.equal(cape.props.colliders[0].node, 'p/hips');
    assert.deepEqual(cape.props.gravity, [0, -9.81, 0]);
    assert.equal(c.scene.get('steam').kind, 'fluid');
    assert.equal(c.scene.get('steam').props.sources.length, 1);

    const bad = compileFilm3D({
        ...rigged,
        cloth: { cape: { pinTo: 'nobody', colliders: [{ node: 'also-nobody', r: 1 }] } },
        fluids: { steam: { n: 16 } },
    }).diagnostics.map((d) => d.message);
    assert.ok(bad.some((m) => m.includes("'nobody'")));
    assert.ok(bad.some((m) => m.includes('also-nobody')));
    assert.ok(bad.some((m) => m.includes('no sources')), 'a fluid with no source renders nothing');
});

test('a character gets teeth, a tongue and hair without naming them', () => {
    const p = compileFilm3D(rigged).scene.get('p').props;
    assert.equal(p.mouth, true);
    assert.equal(p.hair, null, 'null means "generate one with the default material"');
    const bald = compileFilm3D({
        ...rigged,
        characters: { host: { ...rigged.characters.host, hair: false, mouth: false } },
    }).scene.get('p').props;
    assert.equal(bald.hair, false);
    assert.equal(bald.mouth, false);
});

test('meta.post compiles and meta.bloom keeps working', () => {
    const graded = compileFilm3D({ ...rigged,
        meta: { post: { grade: { vignette: 0.3 }, bloom: { strength: 1.2 } } } });
    assert.deepEqual(graded.meta.post.map((p) => p.kind), ['bloom', 'grade']);
    const legacy = compileFilm3D({ ...rigged, meta: { bloom: { strength: 0.6 } } });
    assert.deepEqual(legacy.meta.post.map((p) => p.kind), ['bloom']);
    assert.equal(legacy.meta.post[0].strength, 0.6);
    assert.deepEqual(compileFilm3D(rigged).meta.post, [], 'no post declared, no passes');
});

test('an unresolvable constraint warns and never reaches the backend', () => {
    const c = compileFilm3D({
        ...rigged,
        constraints: [{ type: 'lookAt', source: 'p/head', target: 'missing' },
                      { type: 'copyRotation', source: 'p/shoulderR', from: 'p/shoulderL', axes: 'z' }],
    });
    assert.ok(c.diagnostics.some((d) => d.message.includes('missing')));
    assert.equal(c.constraints.filter((k) => k.type === 'copyRotation').length, 1);
    assert.ok(!c.constraints.some((k) => k.target === 'missing'));
});
