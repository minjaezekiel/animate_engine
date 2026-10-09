import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFilm } from '../../src/core/script/compile.js';
import { validateFilm } from '../../src/core/script/validate.js';
import { trackValueAt } from '../../src/core/anim/Track.js';
import { samplePose } from '../../src/core/anim/Evaluator.js';

const demo = JSON.parse(readFileSync(new URL('../../demo/film.json', import.meta.url), 'utf8'));
const T = (r, target, path) => r.timeline._index.get(`${target}\u0000${path}`);

const minimal = (over = {}) => ({
    version: 'jirex.film/1',
    meta: { fps: 24, width: 1280, height: 720 },
    characters: {},
    scenes: [{ id: 's1', shots: [{ id: 'a', duration: 3 }] }],
    ...over,
});

test('the demo film compiles clean at exactly 120s / 2880 frames', () => {
    const r = compileFilm(demo);
    const problems = r.diagnostics.filter((d) => d.severity !== 'info');
    assert.deepEqual(problems, [], 'no warnings or errors');
    assert.equal(r.meta.duration, 120, 'duration is exactly two minutes');
    assert.equal(r.meta.frames, 2880);
    assert.equal(r.lipsyncJobs.length, 10, 'every dialogue line produced a job');
});

test('duration is derived by accumulation, and a declared one is reported', () => {
    const r = compileFilm(minimal({
        scenes: [
            { id: 'a', shots: [{ duration: 2 }, { duration: 3 }] },
            { id: 'b', shots: [{ duration: 5 }] },
        ],
    }));
    assert.equal(r.meta.duration, 10, 'shots and scenes sequence automatically');

    const declared = compileFilm(minimal({ meta: { fps: 24, duration: 99 } }));
    assert.ok(declared.diagnostics.some((d) => d.path === 'meta.duration'),
        'a declared duration is flagged, not trusted');
});

test('shot-relative `at` is offset once into absolute time', () => {
    const r = compileFilm({
        ...minimal(),
        characters: { a: { generate: {}, voice: 'v' } },
        voices: { v: { spec: 'tts:x' } },
        scenes: [{
            id: 's', cast: [{ character: 'a', as: 'a' }],
            shots: [
                { duration: 5 },
                { duration: 5, dialogue: [{ speaker: 'a', at: 1.5, text: 'hello' }] },
            ],
        }],
    });
    assert.equal(r.lipsyncJobs[0].at, 6.5, 'shot 2 starts at 5, plus at:1.5');
});

test('camera continues across a cut when `from` is omitted', () => {
    const r = compileFilm(minimal({
        scenes: [{
            id: 's',
            shots: [
                { duration: 4, camera: { from: { x: 0, zoom: 1 }, to: { x: -100, zoom: 1.5 } } },
                { duration: 4, camera: { to: { x: -200, zoom: 2 } } },
            ],
        }],
    }));
    const zoom = (t) => +trackValueAt(T(r, '__camera', 'props.zoom'), t).toFixed(4);
    assert.equal(zoom(4), 1.5, 'shot 1 ends at 1.5');
    assert.equal(zoom(8), 2, 'shot 2 reaches 2');
    assert.ok(zoom(4.01) > 1.49, 'no snap back to neutral at the cut');
});

test('a character cast in two scenes becomes two independent instances', () => {
    const r = compileFilm({
        ...minimal(),
        characters: { a: { generate: {} } },
        scenes: [
            { id: 'one', cast: [{ character: 'a', as: 'a' }], shots: [{ duration: 2 }] },
            { id: 'two', cast: [{ character: 'a', as: 'a' }], shots: [{ duration: 2 }] },
        ],
    });
    assert.ok(r.scene.has('one/a/head'), 'scene one has its own head');
    assert.ok(r.scene.has('two/a/head'), 'scene two has its own head');
    assert.notEqual(r.scene.get('one/a/head'), r.scene.get('two/a/head'));
});

test('crossfade ramps both scenes and is not overwritten by visibility keys', () => {
    const r = compileFilm(minimal({
        scenes: [
            { id: 'a', shots: [{ duration: 4 }], transitionOut: { kind: 'crossfade', duration: 1 } },
            { id: 'b', shots: [{ duration: 4 }] },
        ],
    }));
    const a = (t) => +trackValueAt(T(r, 'scene/a', 'props.alpha'), t).toFixed(3);
    const b = (t) => +trackValueAt(T(r, 'scene/b', 'props.alpha'), t).toFixed(3);
    assert.equal(a(3), 1);
    assert.equal(a(3.5), 0.5, 'outgoing scene is mid-fade');
    assert.equal(b(3.5), 0.5, 'incoming scene is mid-fade at the same instant');
    assert.equal(a(4), 0);
    assert.equal(b(4), 1);
});

test('a colour fade becomes an overlay track, so it reaches every export', () => {
    const r = compileFilm(minimal({
        scenes: [{ id: 'a', shots: [{ duration: 4 }], transitionIn: { kind: 'fade', from: '#000000', duration: 1 } }],
    }));
    const ov = (t) => +trackValueAt(T(r, '__overlay', 'props.alpha'), t).toFixed(3);
    assert.equal(ov(0), 1, 'starts opaque');
    assert.equal(ov(0.5), 0.5);
    assert.equal(ov(1), 0, 'and clears');
    assert.equal(r.scene.get('__overlay').props.screenSpace, true, 'overlay ignores the camera');
});

test("do:'play' becomes a bounded clip instance, not expanded keys", () => {
    const r = compileFilm({
        ...minimal(),
        characters: { a: { generate: {} } },
        scenes: [{
            id: 's', cast: [{ character: 'a', as: 'a' }],
            shots: [{ duration: 10, actions: [{ target: 'a', do: 'play', action: 'walk', for: 3 }] }],
        }],
    });
    assert.equal(r.timeline.instances.length, 1);
    const inst = r.timeline.instances[0];
    assert.equal(inst.start, 0);
    assert.equal(inst.end, 3, '`for` bounds the cycle');
    assert.equal(inst.scopeId, 's/a');
    const at = (t) => samplePose(r.timeline, t).get('s/a/thighL')?.get('transform.rot');
    assert.notEqual(at(1), undefined, 'walking during its span');
    assert.equal(at(5), undefined, 'silent afterwards');
});

test("do:'pose' with `for` transitions from the previous value", () => {
    const r = compileFilm({
        ...minimal(),
        characters: { a: { generate: {}, poses: { lo: { torso: { rot: 0 } }, hi: { torso: { rot: 1 } } } } },
        scenes: [{
            id: 's', cast: [{ character: 'a', as: 'a' }],
            shots: [{
                duration: 10,
                actions: [
                    { target: 'a', do: 'pose', pose: 'lo', at: 0 },
                    { target: 'a', do: 'pose', pose: 'hi', at: 4, for: 2 },
                ],
            }],
        }],
    });
    const rot = (t) => +trackValueAt(T(r, 's/a/torso', 'transform.rot'), t).toFixed(3);
    assert.equal(rot(0), 0);
    assert.equal(rot(4), 0, 'the transition starts where it was');
    assert.equal(rot(6), 1, 'and arrives on time');
    assert.ok(rot(5) > 0 && rot(5) < 1, 'interpolating between');
});

test('unknown fields and bad references are diagnostics, never throws', () => {
    const d = validateFilm({
        version: 'jirex.film/9',
        meta: { fps: 24, nonsense: 1 },
        wat: true,
        characters: { a: { parts: [{ id: 'x' }, { id: 'x' }], sideburns: 'yes' } },
        scenes: [{
            id: 's', fancy: 1,
            cast: [{ character: 'ghost', as: 'g' }],
            shots: [{ duration: 1, actions: [{ target: 'g', do: 'teleport' }] }],
            audio: [{ asset: 'missing' }],
        }],
    });
    const msgs = d.map((x) => `${x.severity} ${x.path}`);
    assert.ok(msgs.some((m) => m.includes('wat')), 'unknown root key reported');
    assert.ok(msgs.some((m) => m.includes('meta.nonsense')));
    assert.ok(msgs.some((m) => m.includes('sideburns')));
    assert.ok(d.some((x) => x.severity === 'error' && /Duplicate part/.test(x.message)));
    assert.ok(d.some((x) => /not defined/.test(x.message)), 'missing character is an error');
    assert.ok(d.some((x) => /Unknown verb/.test(x.message)));
    assert.ok(d.some((x) => /not declared/.test(x.message)), 'missing audio asset reported');
    assert.ok(!d.some((x) => x.severity === 'fatal'), 'nothing fatal: it still renders');
});

test('a film that is not an object is fatal, and compiles to nothing', () => {
    const r = compileFilm(null);
    assert.equal(r.timeline, null);
    assert.equal(r.diagnostics[0].severity, 'fatal');
});

test('generated characters expose the standard cycles and a mouth', () => {
    const r = compileFilm({
        ...minimal(),
        characters: { a: { generate: {} } },
        scenes: [{
            id: 's', cast: [{ character: 'a', as: 'a' }],
            shots: [{ duration: 4, actions: [{ target: 'a', do: 'play', action: 'blink' }] }],
        }],
    });
    assert.deepEqual(r.diagnostics.filter((d) => d.severity === 'error'), []);
    assert.ok(r.scene.has('s/a/mouth'), 'a generated character can be lipsynced');
    assert.ok(r.scene.get('s/a/mouth').props.visemeShapes.closed, 'mouth declares shapes');
    assert.equal(r.timeline.instances.length, 1, 'blink resolved from the generated set');
});

test('the subtitle node exists and ignores the camera', () => {
    const r = compileFilm(minimal());
    const sub = r.scene.get('__subtitle');
    assert.ok(sub, 'a reusable subtitle node is always present');
    assert.equal(sub.props.screenSpace, true);
    assert.equal(sub.props.align, 'center');
});

test('a later set changes the channel rather than rewriting the whole film', () => {
    const film = {
        version: 'jirex.film/1',
        meta: { fps: 24, width: 1280, height: 720 },
        palettes: { p: { aura: '#ffd33a', spike: '#151014' } },
        characters: {
            a: { palette: 'p', proportions: { height: 300 },
                 generate: { hair: 'spiky', hairColor: 'spike' } },
            fx: { parts: [{ id: 's', shape: { kind: 'rect', w: 10, h: 10 }, fill: 'aura' }] },
        },
        scenes: [{
            id: 's1', palette: 'p', template: { template: 'hillside' },
            cast: [{ character: 'a', as: 'a', at: [640] },
                   { character: 'fx', as: 'fx', at: [640, 300], alpha: 0 }],
            shots: [{ id: 'x', duration: 4, actions: [
                { target: 'a', do: 'set', part: 'hair', channel: 'props.fill', value: 'aura', at: 2 },
                { target: 'fx', do: 'show', at: 2 },
            ] }],
        }],
    };
    const { timeline } = compileFilm(film, {});
    const hair = timeline._index.get('s1/a/hair\u0000props.fill');
    const alpha = timeline._index.get('s1/fx\u0000props.alpha');

    // A track reads as its FIRST key before that key, so a lone `set` at t=2
    // used to make the value true from frame one: a transformation that had
    // already happened, and an effect on screen before it was shown.
    assert.equal(trackValueAt(hair, 0.5), '#151014', 'the hair holds its own colour first');
    assert.equal(trackValueAt(hair, 3.0), '#ffd33a', 'and still changes when told to');
    assert.equal(trackValueAt(alpha, 0.5), 0, 'the effect stays hidden until shown');
    assert.equal(trackValueAt(alpha, 3.0), 1);

    // A palette NAME on a colour channel resolves, rather than reaching the
    // canvas as the literal string "aura" and being silently ignored.
    assert.match(trackValueAt(hair, 3.0), /^#/);
});
