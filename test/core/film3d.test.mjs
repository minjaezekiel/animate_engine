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
