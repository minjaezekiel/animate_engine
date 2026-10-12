/**
 * The frame-budget model, and the three contract fixes beside it.
 *
 *   npm run test:budget
 *
 * These four defects came out of directing one film, and they are the same
 * defect four times: **a silent default where there should have been a
 * refusal or a measurement.** A parentId accepted and ignored. A cast
 * member assumed to have feet. A per-frame cost absorbed until the encoder
 * gave up. A ground declaration the checker could not see. Each test here
 * pins the silence shut rather than the symptom.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from '../../src/core/scene/Scene.js';
import { compileFilm } from '../../src/core/script/compile.js';
import { analyseStaging, castRole, CAST_ROLES } from '../../src/core/script/staging.js';
import { strokeDabs } from '../../src/core/paint/stroke.js';
import { estimateFrameCost, CALIBRATION, calibrate, worstSpan } from '../../src/core/script/budget.js';
import { validateFilm } from '../../src/core/script/validate.js';
import { trackValueAt } from '../../src/core/anim/Track.js';
import { preflight } from '../../src/render/OfflineRenderer.js';

// =====================================================================
// 1. a discarded argument
// =====================================================================

test('Scene.add takes the parent from either spelling, and refuses a disagreement', () => {
    const scene = new Scene();
    const group = scene.add({ id: 'g', kind: 'group' });

    // The second argument, as before.
    assert.equal(scene.add({ id: 'a', kind: 'rect' }, 'g').parentId, 'g');
    // And the spec field, which used to be accepted and silently ignored --
    // attaching the node to the root while every structural test passed.
    assert.equal(scene.add({ id: 'b', kind: 'rect', parentId: 'g' }).parentId, 'g');
    assert.deepEqual(group.childIds, ['a', 'b']);
    // Neither: the root, as before.
    assert.equal(scene.add({ id: 'c', kind: 'rect' }).parentId, scene.rootId);

    // Both, disagreeing: there is no right answer, so it is an error rather
    // than a coin toss between two plausible ones.
    assert.throws(() => scene.add({ id: 'd', kind: 'rect', parentId: 'g' }, scene.rootId),
        /two different parents/);
    assert.ok(!scene.has('d'), 'the refused node was added anyway');
    // Both, agreeing: fine.
    assert.equal(scene.add({ id: 'e', kind: 'rect', parentId: 'g' }, 'g').parentId, 'g');
});

// =====================================================================
// 2. what a cast member is
// =====================================================================

const EFFECT = { parts: [{ id: 'star', shape: { kind: 'rect', w: 8, h: 8 }, fill: 'c' }] };
const PERSON = { generate: {}, proportions: { height: 120 } };

test('castRole prefers the declaration and falls back to the rig', () => {
    // Inference is the default, not the rule: a hand-built rig that names
    // its feet `boot_l` is a character this would call an effect, and
    // `role` is how an author says so.
    assert.equal(castRole(PERSON), 'character');
    assert.equal(castRole(EFFECT), 'effect');
    assert.equal(castRole({ ...EFFECT, role: 'prop' }), 'prop');
    // The cast entry is more specific than the character: the same rig can
    // perform in one scene and sit on a shelf in another.
    assert.equal(castRole(PERSON, { role: 'prop' }), 'prop');
    assert.equal(castRole({ ...PERSON, role: 'prop' }, { role: 'character' }), 'character');
    // A nonsense role falls back rather than exempting the thing silently.
    assert.equal(castRole(PERSON, { role: 'scenery' }), 'character');
    assert.deepEqual(CAST_ROLES, ['character', 'effect', 'prop']);
});

test('an unknown role is reported, because it would silently exempt a check', () => {
    const film = {
        version: 'jirex.film/1', meta: { title: 't' },
        palettes: { p: { c: '#111' } },
        characters: { hero: { palette: 'p', ...PERSON, role: 'persona' } },
        scenes: [{ id: 's1', cast: [{ character: 'hero', as: 'hero', role: 'thing' }],
                   shots: [{ id: 'a', duration: 1 }] }],
    };
    const messages = validateFilm(film).map((d) => d.message).join(' | ');
    assert.match(messages, /Unknown role "thing"/);
    assert.match(messages, /Unknown role "persona"/);
    assert.match(messages, /character, effect, prop/);
});

// =====================================================================
// 3. the checker reads the film the compiler built from
// =====================================================================

const templated = (over = {}) => ({
    version: 'jirex.film/1', meta: { title: 't', fps: 24, width: 1280, height: 720 },
    palettes: { p: { coat: '#c33', skin: '#eca' } },
    characters: { boy: { palette: 'p', ...PERSON } },
    scenes: [{
        id: 's1',
        template: { template: 'hillside', time: 'evening' },
        cast: [{ character: 'boy', as: 'boy', at: [400, 120] }],
        shots: [{ id: 'a', duration: 2 }],
        ...over,
    }],
});

test('a template-supplied ground is checked, because the checker sees the expanded scene', () => {
    // The ground check only runs when there *is* a ground, and
    // `analyseStaging` read `film.scenes` -- where a templated scene has
    // none, because the template only supplies it during compile. So the
    // check silently never ran, and a film reported zero staging notes for
    // its whole life while a character hung in mid-air across two cuts.
    const film = templated();
    const compiled = compileFilm(film, {});
    assert.ok(Array.isArray(compiled.expanded), 'compileFilm did not return expanded scenes');
    assert.ok(compiled.expanded[0].ground, 'the template supplied no ground');
    assert.ok(!film.scenes[0].ground, 'the raw film should still have none');

    const notes = analyseStaging(compiled, film, { trackValueAt });
    assert.ok(notes.some((d) => /feet/.test(d.message)),
        `the ground check did not run: ${notes.map((d) => d.message).join(' | ')}`);
});

// =====================================================================
// 4. the budget
// =====================================================================

const withPhoto = (photo) => ({
    version: 'jirex.film/1', meta: { title: 't', fps: 24, width: 1280, height: 720 },
    assets: { plate: { kind: 'image', src: 'p.png' } },
    palettes: { p: {} }, characters: {},
    scenes: [{
        id: 's1',
        photos: [{ id: 'sky', source: 'plate', width: 1400, height: 820, duration: 6, ...photo }],
        shots: [{ id: 'a', duration: 6 }],
    }],
});
const plate = { data: new Uint8Array(16 * 16 * 4), width: 16, height: 16 };

test('the budget catches the configuration that wrote an undecodable file', () => {
    // Measured in a browser at 71.7 ms a frame; this predicts 73.5. The
    // point is not the two percent, it is that the answer arrives from a
    // pure function in Node before anything is rendered, instead of as a
    // 110-byte webm after a sixty-second encode.
    const film = withPhoto({});
    const cost = estimateFrameCost(compileFilm(film, { assets: { plate } }), film, { trackValueAt });
    assert.ok(cost.worstMs > 60 && cost.worstMs < 90, `predicted ${cost.worstMs}`);
    const note = cost.notes[0];
    assert.equal(note.severity, 'error');
    assert.match(note.message, /over the 41\.7ms ceiling/);
    // A diagnostic that does not name the fix is a diagnostic nobody acts on.
    assert.match(note.message, /resolution/);
    assert.match(note.message, /step/);
    assert.match(note.message, /photo "sky"/);
});

test('resolution and step each lower the estimate, and together clear the ceiling', () => {
    const at = (photo) => {
        const film = withPhoto(photo);
        return estimateFrameCost(compileFilm(film, { assets: { plate } }), film, { trackValueAt });
    };
    const full = at({}).worstMs;
    // Cost is linear in output pixels, so half the scale is a quarter the work.
    const half = at({ resolution: 0.5 }).worstMs;
    assert.ok(Math.abs(half - full / 4) < full * 0.02, `${half} is not a quarter of ${full}`);
    // A step holds one warp across `step * fps` frames.
    const stepped = at({ step: 1 / 6 }).worstMs;
    assert.ok(Math.abs(stepped - full / 4) < full * 0.02, `${stepped} is not a quarter of ${full}`);

    const both = at({ resolution: 0.55, step: 1 / 6 });
    assert.ok(both.worstMs < both.ceilingMs * CALIBRATION.advisory,
        `${both.worstMs} is not comfortably under ${both.ceilingMs}`);
    assert.deepEqual(both.notes, []);
    // The peak is still reported, because the amortised figure hides it.
    assert.ok(both.shots[0].items[0].peakMs > both.shots[0].items[0].ms);
    assert.equal(both.shots[0].items[0].held, 4);
});

test('budget notes reach every check surface through analyseStaging', () => {
    // A finding in its own report that nothing reads is not a finding.
    const film = withPhoto({});
    const notes = analyseStaging(compileFilm(film, { assets: { plate } }), film, { trackValueAt });
    assert.ok(notes.some((d) => /Budget:/.test(d.message)),
        `no budget note: ${notes.map((d) => d.message).join(' | ')}`);
});

test('a film with nothing expensive in it is not warned about', () => {
    // The whole 23-shot fight measured 0.7 ms a frame without its
    // backdrop, so anything that reports a cost for plain scenery and
    // cast is modelling noise and will cry wolf.
    const film = {
        version: 'jirex.film/1', meta: { title: 't', fps: 24, width: 1280, height: 720 },
        palettes: { p: { coat: '#c33', skin: '#eca' } },
        characters: { boy: { palette: 'p', ...PERSON } },
        scenes: [{ id: 's1', cast: [{ character: 'boy', as: 'boy', at: [400] }],
                   shots: [{ id: 'a', duration: 3 }] }],
    };
    const cost = estimateFrameCost(compileFilm(film, {}), film, { trackValueAt });
    assert.equal(cost.worstMs, 0);
    assert.deepEqual(cost.notes, []);
});

test('the dab count is the painter\'s own, not an approximation of it', () => {
    // Two strokes, same two commands, a hundredfold difference in length.
    // The old estimate derived the count from the command string and the
    // brush size, so it read these as identical. The painter does not.
    const stroke = (d) => ({ path: d, brush: 'pen', size: 12, color: '#000' });
    const short = strokeDabs(stroke('M 0 0 L 6 0')).count;
    const long = strokeDabs(stroke('M 0 0 L 600 0')).count;
    assert.ok(long > short * 20, `${long} dabs vs ${short} for a 100x longer stroke`);

    // And the count is exactly what the surface will stamp, because it is
    // the same call: a drawing's estimate is now a prediction of a number,
    // not of an order of magnitude.
    const film = {
        version: 'jirex.film/1',
        meta: { title: 'dabs', fps: 24, width: 400, height: 300 },
        scenes: [{
            id: 's1',
            drawings: [{ id: 'd', width: 400, height: 300,
                         strokes: [stroke('M 0 0 L 600 0')] }],
            shots: [{ id: 'a', duration: 1, actions: [] }],
        }],
    };
    const est = estimateFrameCost(compileFilm(film, {}), film, { trackValueAt });
    const item = est.shots[0].items.find((i) => i.kind === 'drawing');
    assert.equal(item.dabs, long);
    assert.equal(item.approximate, undefined, 'no longer flagged approximate');
});

test('preflight samples the shot the estimate called heaviest', () => {
    // A cheap opening shot and an expensive one four seconds in. Preflight
    // measuring frames 0..47 would measure the cheap one and pass a film
    // that cannot be rendered, which is the failure it exists to prevent.
    const film = {
        version: 'jirex.film/1',
        meta: { title: 'late', fps: 24, width: 1280, height: 720 },
        assets: { plate: { kind: 'image', src: 'p.png' } },
        palettes: { p: {} }, characters: {},
        scenes: [{
            id: 's1',
            photos: [{ id: 'sky', source: 'plate', width: 1400, height: 820, duration: 4 }],
            shots: [
                { id: 'cheap', duration: 4 },
                { id: 'heavy', duration: 4, actions: [
                    { target: 'sky', do: 'draw', from: 0, to: 1, for: 4 }] },
            ],
        }],
    };
    const est = estimateFrameCost(compileFilm(film, { assets: { plate } }), film, { trackValueAt });
    const span = worstSpan(est);
    assert.ok(span, 'a worst shot was identified');
    assert.equal(span.shotId, 'heavy');
    assert.equal(span.startSec, 4, 'samples the expensive shot, not the cheap opening');
    assert.equal(span.endSec, 8);

    // And the cheap shot is charged nothing: the photo is declared on the
    // scene so it exists during both, but its progress does not move in the
    // first, and both painters memoise on exactly that.
    assert.equal(est.shots.find((s) => s.shotId === 'cheap').ms, 0);

    // The harder case, where both shots cost something: picking the first
    // shot that costs anything would be indistinguishable above, and it is
    // the heaviest that has to be measured.
    const two = {
        ...film,
        scenes: [{
            id: 's1',
            photos: [
                { id: 'small', source: 'plate', width: 320, height: 180, duration: 4 },
                { id: 'big', source: 'plate', width: 1600, height: 900, duration: 4 },
            ],
            shots: [
                { id: 'first', duration: 4, actions: [
                    { target: 'small', do: 'draw', from: 0, to: 1, for: 4 }] },
                { id: 'second', duration: 4, actions: [
                    { target: 'big', do: 'draw', from: 0, to: 1, for: 4 }] },
            ],
        }],
    };
    const both = estimateFrameCost(compileFilm(two, { assets: { plate } }), two,
        { trackValueAt });
    assert.ok(both.shots[0].ms > 0 && both.shots[1].ms > both.shots[0].ms,
        'both shots cost, the later one more');
    assert.equal(worstSpan(both).shotId, 'second');
    assert.equal(worstSpan(both).startSec, 4);
});

test('calibrate scales the model to a measurement, and rejects nothing silently', () => {
    const fitted = calibrate(100, 150);
    assert.equal(fitted.ratio, 1.5);
    assert.equal(fitted.measured, true);
    assert.equal(fitted.photoNsPerPixel, CALIBRATION.photoNsPerPixel * 1.5);
    assert.equal(fitted.dabNs, CALIBRATION.dabNs * 1.5);

    // A calibrated model predicts the measurement it was fitted to. That is
    // the whole claim: not that the defaults are right, but that one
    // measurement makes the estimate agree with this machine.
    const compiled = compileFilm(withPhoto({}), { assets: { plate } });
    const film = withPhoto({});
    const before = estimateFrameCost(compiled, film, { trackValueAt });
    const measured = before.worstMs * 1.3;                  // this machine is 30% slower
    const again = estimateFrameCost(compiled, film,
        { trackValueAt, calibration: calibrate(before.worstMs, measured) });
    assert.ok(Math.abs(again.worstMs - measured) < 1e-6,
        `calibrated estimate ${again.worstMs} should equal the measurement ${measured}`);

    // Degenerate input leaves the model alone rather than dividing by zero.
    assert.equal(calibrate(0, 50).ratio, 1);
    assert.equal(calibrate(50, 0).measured, false);
});

// =====================================================================
// 5. the measurement, and what it is allowed to measure
// =====================================================================

test('preflight measures the window it was given, warm-up excluded', async () => {
    const film = withPhoto({});
    const compiled = compileFilm(film, { assets: { plate } });

    const frames = [];
    const backend = { sync() {}, renderFrame() {} };
    const pf = await preflight({
        scene: compiled.scene, timeline: compiled.timeline, backend,
        cameraId: compiled.cameraId, fps: compiled.meta.fps,
        startSec: 2, endSec: 3, frames: 48,
        beforeFrame: (t, n) => { frames.push(n); },
    });

    // One second at 24fps is 24 frames, so the window shortens from the
    // default 48 rather than running on into whatever follows the shot.
    assert.equal(pf.frames, 24);
    assert.equal(pf.startSec, 2);

    // Frame 48 is t = 2s. The warm-up is that frame; the samples are the
    // 24 after it, because both painters memoise per frame and re-drawing
    // the warm-up frame would time a cache hit no real frame gets.
    assert.equal(frames[0], 48, 'warm-up is the first frame of the window');
    assert.deepEqual(frames.slice(1, 4), [49, 50, 51]);
    assert.equal(frames.length, 25, '1 warm-up + 24 samples');
    assert.equal(new Set(frames).size, 25, 'no frame measured twice');

    // Every number the budget talks about is present, including the two
    // that exist because a held warp makes the per-frame cost bimodal.
    for (const key of ['meanMs', 'medianMs', 'p95Ms', 'maxMs', 'warmupMs', 'ceilingMs']) {
        assert.equal(typeof pf[key], 'number', `${key} is reported`);
    }
    assert.ok(pf.meanMs <= pf.maxMs);
    assert.equal(pf.ceilingMs, 41.67);
});

test('preflight defaults to the opening frames when given no window', async () => {
    const compiled = compileFilm(withPhoto({}), { assets: { plate } });
    const frames = [];
    const pf = await preflight({
        scene: compiled.scene, timeline: compiled.timeline,
        backend: { sync() {}, renderFrame() {} },
        cameraId: compiled.cameraId, fps: 24, frames: 6,
        beforeFrame: (t, n) => { frames.push(n); },
    });
    assert.equal(pf.frames, 6);
    assert.deepEqual(frames, [0, 1, 2, 3, 4, 5, 6]);
});
