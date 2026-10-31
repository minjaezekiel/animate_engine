import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compileFilm } from '../../src/core/script/compile.js';
import { samplePose } from '../../src/core/anim/Evaluator.js';

/**
 * Exposure sheets -- holds that are not all the same length.
 *
 * `shot.step` can only say "hold every drawing N frames". A measured pencil
 * test holds an acting beat five frames and draws the chase on ones, inside
 * one film, so one integer per shot is the wrong control. See
 * 21-DRAWN-ANIMATION.md for the measurement that prompted this.
 */

const film = (actions, over = {}) => ({
    version: 'jirex.film/1',
    meta: { fps: 24, width: 1280, height: 720, ...(over.meta ?? {}) },
    characters: {
        hobo: { generate: { build: 'stocky' }, proportions: { height: 400 } },
        dog: { generate: { build: 'child' }, proportions: { height: 200 } },
    },
    scenes: [{
        id: 's1',
        cast: [{ character: 'hobo', as: 'hobo', at: [400, 0] },
               { character: 'dog', as: 'dog', at: [800, 0] }],
        shots: [{ id: 'a', duration: 2, actions, ...(over.shot ?? {}) }],
    }],
});

/** The time the evaluator actually sampled a target's tracks at. */
const sampledAt = (r, target, t) => {
    const pose = samplePose(r.timeline, t);
    return { pose, has: pose.has(target) };
};

test('a sheet compiles to frame-aligned boundaries that follow the hold lengths', () => {
    const r = compileFilm(film([
        { target: 'dog', do: 'expose', sheet: '4 4 2 1 1 2', loop: false },
    ]));
    assert.deepEqual(r.diagnostics.filter((d) => d.severity === 'error'), []);
    assert.equal(r.timeline.sheets.length, 1);
    const sheet = r.timeline.sheets[0];
    // 0, +4, +4, +2, +1, +1 frames -> frames 0 4 8 10 11 12
    assert.deepEqual(sheet.boundaries.map((t) => Math.round(t * 24)), [0, 4, 8, 10, 11, 12]);
    assert.equal(sheet.target, 's1/dog');
});

test('the sheet repeats to fill the shot unless loop is false', () => {
    const looped = compileFilm(film([{ target: 'dog', do: 'expose', sheet: '6' }]));
    // 2s at 24fps = 48 frames, held 6 at a time = 8 exposures
    assert.equal(looped.timeline.sheets[0].boundaries.length, 8);

    const once = compileFilm(film([{ target: 'dog', do: 'expose', sheet: '6', loop: false }]));
    assert.equal(once.timeline.sheets[0].boundaries.length, 1,
        'with loop:false the single hold runs to the end of the shot');
});

test('"2" as a sheet is exactly step: 2', () => {
    const sheet = compileFilm(film([{ target: 'dog', do: 'expose', sheet: '2' }]));
    const step = compileFilm(film([], { shot: { step: 2 } }));
    for (let f = 0; f < 48; f++) {
        const t = f / 24;
        const a = samplePose(sheet.timeline, t).get('s1/dog/hips');
        const b = samplePose(step.timeline, t).get('s1/dog/hips');
        assert.deepEqual(a, b, `frame ${f}: a sheet of "2" must equal step 2`);
    }
});

test('a held drawing samples its tracks at the time it was exposed', () => {
    const r = compileFilm(film([
        { target: 'dog', do: 'expose', sheet: '8' },
        { target: 'dog', do: 'move', to: [1600], at: 0, for: 2 },
    ]));
    const xAt = (t) => samplePose(r.timeline, t).get('s1/dog')?.get('transform.x');
    // Frames 0..7 are one exposure, so they share one x.
    const first = xAt(0);
    for (let f = 1; f < 8; f++) {
        assert.equal(xAt(f / 24), first, `frame ${f} must hold the frame-0 drawing`);
    }
    assert.notEqual(xAt(8 / 24), first, 'frame 8 is a new exposure');
});

test('a sheet on one target leaves every other target alone', () => {
    const r = compileFilm(film([
        { target: 'dog', do: 'expose', sheet: '8' },
        { target: 'dog', do: 'move', to: [1600], at: 0, for: 2 },
        { target: 'hobo', do: 'move', to: [900], at: 0, for: 2 },
    ]));
    const x = (who, t) => samplePose(r.timeline, t).get(`s1/${who}`)?.get('transform.x');
    assert.equal(x('dog', 0), x('dog', 7 / 24), 'the dog is held');
    assert.notEqual(x('hobo', 0), x('hobo', 7 / 24), 'the hobo is not');
});

test('a targeted sheet beats a blanket one', () => {
    const r = compileFilm(film([
        { do: 'expose', sheet: '12' },                      // whole shot, on twelves
        { target: 'dog', do: 'expose', sheet: '1' },        // except the dog, on ones
        { target: 'dog', do: 'move', to: [1600], at: 0, for: 2 },
        { target: 'hobo', do: 'move', to: [900], at: 0, for: 2 },
    ]));
    const x = (who, t) => samplePose(r.timeline, t).get(`s1/${who}`)?.get('transform.x');
    assert.notEqual(x('dog', 0), x('dog', 1 / 24), 'the dog is exposed on ones');
    assert.equal(x('hobo', 0), x('hobo', 1 / 24), 'the hobo is held by the blanket sheet');
});

test('the camera is never held, whatever the sheet says', () => {
    const r = compileFilm(film([{ do: 'expose', sheet: '12' }], {
        shot: { camera: { from: { x: 0 }, to: { x: 300 } } },
    }));
    const cam = (t) => samplePose(r.timeline, t).get('__camera')?.get('transform.x');
    assert.notEqual(cam(0), cam(1 / 24),
        'a pan quantised to the artwork judders; the camera shoots on ones');
});

test('a malformed sheet warns and changes nothing', () => {
    for (const bad of ['', 'two', [0], [-3], undefined]) {
        const r = compileFilm(film([{ target: 'dog', do: 'expose', sheet: bad }]));
        assert.equal(r.timeline.sheets.length, 0, `sheet ${JSON.stringify(bad)} must not compile`);
        assert.ok(r.diagnostics.some((d) => /expose/.test(d.message)),
            `sheet ${JSON.stringify(bad)} must say why`);
    }
});

test('exposing an unknown target warns rather than silently doing nothing', () => {
    const r = compileFilm(film([{ target: 'ghost', do: 'expose', sheet: '2' }]));
    assert.ok(r.diagnostics.some((d) => /no cast member or drawing "ghost"/.test(d.message)));
});

test('films with no sheet evaluate exactly as before', () => {
    const r = compileFilm(film([{ target: 'dog', do: 'move', to: [1600], at: 0, for: 2 }]));
    assert.deepEqual(r.timeline.sheets, []);
    const x = (t) => samplePose(r.timeline, t).get('s1/dog')?.get('transform.x');
    assert.notEqual(x(0), x(1 / 24), 'no sheet means every frame is its own');
});
