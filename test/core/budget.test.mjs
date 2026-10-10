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
import { estimateFrameCost, CALIBRATION } from '../../src/core/script/budget.js';
import { validateFilm } from '../../src/core/script/validate.js';
import { trackValueAt } from '../../src/core/anim/Track.js';

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
