import test from 'node:test';
import assert from 'node:assert/strict';

import { compileFilm } from '../../src/core/script/compile.js';
import { analyseStaging, measureCharacter, groundAt } from '../../src/core/script/staging.js';
import { trackValueAt } from '../../src/core/anim/Track.js';
import { generateCharacterParts } from '../../src/core/script/generate.js';
import { loadAssets, AssetRegistry } from '../../src/core/art/AssetRegistry.js';
import { validateFilm } from '../../src/core/script/validate.js';
import { samplePose, applyPose, createPoseBaseline, resetPose } from '../../src/core/anim/Evaluator.js';

const analyse = (film) => analyseStaging(compileFilm(film, {}), film, { trackValueAt });

const BOY = {
    palette: 'p', generate: {}, proportions: { height: 132, headRatio: 0.17 },
};
const base = (scene) => ({
    version: 'jirex.film/1',
    meta: { title: 't', fps: 24, width: 1280, height: 720 },
    palettes: { p: { coat: '#c33', skin: '#eca' } },
    characters: { boy: BOY },
    scenes: [scene],
});

// ------------------------------------------------------------- measurement

test('measureCharacter bounds the whole rig, stroke width included', () => {
    const m = measureCharacter(generateCharacterParts({}, { height: 132, headRatio: 0.17 }));
    // Feet below the root, head above it; the session that needed this
    // measured 63.2 to the foot node's origin, and the drawn shoe adds its
    // stroke on top of that.
    assert.ok(m.bottom > 60 && m.bottom < 75, `feet at ${m.bottom}`);
    assert.ok(m.top < -30, `head at ${m.top}`);
    assert.ok(m.right > 0 && m.left < 0);
});

test('an empty character measures to nothing rather than throwing', () => {
    assert.deepEqual(measureCharacter([]), { top: 0, bottom: 0, left: 0, right: 0 });
});

// ------------------------------------------------------------------ ground

test('groundAt interpolates a polyline and clamps past the ends', () => {
    const g = { points: [[0, 600], [640, 500], [1280, 400]] };
    assert.equal(groundAt(g, 0), 600);
    assert.equal(groundAt(g, 320), 550);
    assert.equal(groundAt(g, 1280), 400);
    assert.equal(groundAt(g, -99), 600);      // clamp left
    assert.equal(groundAt(g, 9999), 400);     // clamp right
    assert.equal(groundAt({ y: 512 }, 123), 512);
    assert.equal(groundAt(null, 0), null);
});

test('`move` with no y derives it from the ground', () => {
    const film = base({
        id: 's1',
        ground: { points: [[0, 602], [1280, 480]] },
        cast: [{ character: 'boy', as: 'boy', at: [100, 535] }],
        shots: [{ id: 'a', duration: 3,
                  actions: [{ target: 'boy', do: 'move', to: [700], at: 0, for: 2 }] }],
    });
    const { timeline } = compileFilm(film, {});
    const track = timeline.tracks.find((t) => t.target === 's1/boy' && t.path === 'transform.y');
    const landed = track.keys[track.keys.length - 1].v;
    const expected = groundAt(film.scenes[0].ground, 700) - measureCharacter(
        generateCharacterParts({}, BOY.proportions)).bottom;
    assert.ok(Math.abs(landed - expected) < 0.5, `landed ${landed}, ground implies ${expected}`);
});

test('an explicit y is left alone', () => {
    const film = base({
        id: 's1',
        ground: { y: 600 },
        cast: [{ character: 'boy', as: 'boy', at: [100, 535] }],
        shots: [{ id: 'a', duration: 3,
                  actions: [{ target: 'boy', do: 'move', to: [700, 123], at: 0, for: 2 }] }],
    });
    const { timeline } = compileFilm(film, {});
    const track = timeline.tracks.find((t) => t.target === 's1/boy' && t.path === 'transform.y');
    assert.equal(track.keys[track.keys.length - 1].v, 123);
});

// -------------------------------- the three bugs that cost four contact sheets

test('a cast member outside the camera frame is reported', () => {
    // The mountain film's shot 3: the camera climbed to y -150 at zoom 1.22
    // while the boy stayed near the valley floor, so he was off-frame for
    // about four seconds and the compiler said nothing.
    const film = base({
        id: 's1',
        cast: [{ character: 'boy', as: 'boy', at: [250, 648] }],
        shots: [{ id: 'f3', duration: 4,
                  camera: { from: { x: 0, y: 0, zoom: 1 },
                            to: { x: 300, y: -150, zoom: 1.22 }, ease: 'smooth' } }],
    });
    const d = analyse(film);
    assert.ok(d.some((x) => /outside the camera frame/.test(x.message)),
              `expected an off-frame warning, got ${JSON.stringify(d.map((x) => x.message))}`);
    // The MCP boundary drops `path` and filters `info`, so the location has
    // to survive inside the message itself.
    const hit = d.find((x) => /outside the camera frame/.test(x.message));
    assert.equal(hit.severity, 'warning');
    assert.ok(/shot f3/.test(hit.message), `location missing from message: ${hit.message}`);
});

test('a character standing off the ground is reported, with the error in pixels', () => {
    // The boy was authored 109px below the slope and his feet hung off the
    // bottom edge of the frame.
    const film = base({
        id: 's1',
        ground: { points: [[0, 602], [1280, 602]] },
        cast: [{ character: 'boy', as: 'boy', at: [250, 648] }],
        shots: [{ id: 'f1', duration: 2, camera: { to: { x: 0, y: 0, zoom: 1 } } }],
    });
    const hit = analyse(film).find((x) => /ground/.test(x.message));
    assert.ok(hit, 'expected a ground warning');
    assert.ok(/below/.test(hit.message), hit.message);
    assert.ok(/\d+px/.test(hit.message), `no pixel figure: ${hit.message}`);
});

test('correct staging produces no warnings', () => {
    const feet = measureCharacter(generateCharacterParts({}, BOY.proportions)).bottom;
    const film = base({
        id: 's1',
        ground: { points: [[0, 602], [1280, 602]] },
        cast: [{ character: 'boy', as: 'boy', at: [640, 602 - feet] }],
        shots: [{ id: 'f1', duration: 2, camera: { to: { x: 0, y: 0, zoom: 1 } } }],
    });
    assert.deepEqual(analyse(film), []);
});

test('a hidden cast member is not judged', () => {
    const film = base({
        id: 's1',
        cast: [{ character: 'boy', as: 'boy', at: [-5000, 648], alpha: 0 }],
        shots: [{ id: 'f1', duration: 2 }],
    });
    assert.deepEqual(analyse(film), []);
});

test('staging leaves the scene exactly as it found it', () => {
    const film = base({
        id: 's1',
        cast: [{ character: 'boy', as: 'boy', at: [250, 535] }],
        shots: [{ id: 'f1', duration: 3,
                  actions: [{ target: 'boy', do: 'move', to: [900, 500], at: 0, for: 2 }] }],
    });
    const compiled = compileFilm(film, {});
    const before = compiled.scene.get('s1/boy').transform.x;
    analyseStaging(compiled, film, { trackValueAt });
    assert.equal(compiled.scene.get('s1/boy').transform.x, before);
});

test('the shipped demo films stage cleanly', async () => {
    const { readFileSync } = await import('node:fs');
    for (const name of ['demo/mountain.json', 'demo/film.json']) {
        const film = JSON.parse(readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8'));
        const d = analyseStaging(compileFilm(film, {}), film, { trackValueAt });
        assert.deepEqual(d.map((x) => x.message), [], `${name} has staging warnings`);
    }
});

// ------------------------------------------------------------------ assets

test('a declared image with no provider is a diagnostic, never a throw', async () => {
    const film = { assets: { bg: { kind: 'image', src: 'x.png' } } };
    const { assets, diagnostics } = await loadAssets(film, { registry: new AssetRegistry() });
    assert.deepEqual(assets, {});
    assert.equal(diagnostics[0].severity, 'warning');
    assert.match(diagnostics[0].message, /No art provider/);
});

test('a provider that throws degrades to a diagnostic', async () => {
    const registry = new AssetRegistry().register({
        id: 'boom', label: 'boom', available: () => true, accepts: () => true,
        load: async () => { throw new Error('disk on fire'); },
    });
    const { assets, diagnostics } = await loadAssets(
        { assets: { bg: { kind: 'image', src: 'x.png' } } }, { registry });
    assert.deepEqual(assets, {});
    assert.match(diagnostics[0].message, /disk on fire/);
});

test('audio assets are not loaded as images', async () => {
    const registry = new AssetRegistry().register({
        id: 'any', label: 'any', available: () => true, accepts: () => true,
        load: async () => ({ width: 1, height: 1 }),
    });
    const { assets } = await loadAssets(
        { assets: { song: { kind: 'audio', src: 'a.mp3' } } }, { registry });
    assert.deepEqual(Object.keys(assets), []);
});

test('an undeclared image is an error, and a misspelled asset key a warning', () => {
    const film = base({
        id: 's1', background: { image: 'nope' },
        scenery: [{ id: 'p', shape: { kind: 'image', asset: 'alsoNope' } }],
        shots: [{ id: 'a', duration: 1 }],
    });
    film.assets = { real: { kind: 'image', srcc: 'typo.png' } };
    const d = validateFilm(film);
    assert.ok(d.some((x) => x.severity === 'error' && /"nope" is not declared/.test(x.message)));
    assert.ok(d.some((x) => x.severity === 'error' && /"alsoNope" is not declared/.test(x.message)));
    assert.ok(d.some((x) => /Unknown asset key "srcc"/.test(x.message)));
    assert.ok(d.some((x) => /neither "src" nor "file"/.test(x.message)));
});

test('an unresolved asset id never reaches the backend as a string', () => {
    const film = base({
        id: 's1',
        scenery: [{ id: 'p', shape: { kind: 'image', asset: 'missing', w: 10, h: 10 }, at: [0, 0] }],
        shots: [{ id: 'a', duration: 1 }],
    });
    film.assets = { missing: { kind: 'image', src: 'm.png' } };
    const { scene, diagnostics } = compileFilm(film, { assets: {} });
    const node = [...scene.byId.values()].find((n) => n.name === 'p');
    assert.equal(node.props.image, null, 'a string id would throw inside ctx.drawImage');
    assert.equal(node.props.asset, undefined);
    assert.ok(diagnostics.some((x) => /was not loaded/.test(x.message)));
});

// --------------------------------------------------------------- framing

test('a declared framing is checked against the zoom actually in force', () => {
    const film = {
        version: 'jirex.film/1',
        meta: { fps: 24, width: 1280, height: 720 },
        characters: { a: { generate: {}, proportions: { height: 420 } } },
        scenes: [{
            id: 's1',
            template: { template: 'living-room' },
            cast: [{ character: 'a', as: 'a', at: [640] }],
            shots: [
                { id: 'wide', duration: 2, framing: 'wide',
                  camera: { from: { x: 0, y: -25, zoom: 1 }, to: { x: 0, y: -25, zoom: 1 } } },
                { id: 'fake-close', duration: 2, framing: 'close',
                  camera: { from: { x: 0, y: -25, zoom: 1 }, to: { x: 0, y: -25, zoom: 1 } } },
            ],
        }],
    };
    const d = analyseStaging(compileFilm(film, {}), film, { trackValueAt });
    const msgs = d.map((x) => x.message);
    assert.ok(!msgs.some((m) => m.includes('wide')), 'the honest wide passes');
    const bad = msgs.find((m) => m.includes('fake-close'));
    assert.ok(bad, 'a close-up framed at wide-shot zoom is reported');
    // The number to change it to, not just a complaint: an author who cannot
    // see the frame has no other way to pick a zoom.
    assert.match(bad, /Try zoom \d+\.\d+/);

    // And following the advice fixes it, which is the only thing that makes
    // the suggestion worth printing.
    const zoom = Number(/Try zoom (\d+\.\d+)/.exec(bad)[1]);
    film.scenes[0].shots[1].camera.from.zoom = zoom;
    film.scenes[0].shots[1].camera.to.zoom = zoom;
    const after = analyseStaging(compileFilm(film, {}), film, { trackValueAt })
        .filter((x) => x.message.includes('Framing'));
    assert.equal(after.length, 0, `following the suggested zoom clears it: ${after[0]?.message}`);
});

test('a shot that names its subject may exclude the rest of the cast', () => {
    const film = {
        version: 'jirex.film/1',
        meta: { fps: 24, width: 1280, height: 720 },
        characters: {
            a: { generate: {}, proportions: { height: 420 } },
            b: { generate: {}, proportions: { height: 420 } },
        },
        scenes: [{
            id: 's1',
            template: { template: 'living-room' },
            cast: [{ character: 'a', as: 'a', at: [300] }, { character: 'b', as: 'b', at: [1000] }],
            shots: [{ id: 'single', duration: 2, framing: 'close', on: 'a',
                      camera: { from: { x: -340, y: -164, zoom: 4.7 },
                                to: { x: -340, y: -164, zoom: 4.7 } } }],
        }],
    };
    const d = analyseStaging(compileFilm(film, {}), film, { trackValueAt });
    assert.equal(d.length, 0,
        `shot/reverse-shot is the point of a single, not a staging error: ${d[0]?.message}`);

    // The subject itself is still held to it.
    film.scenes[0].shots[0].on = 'b';
    const moved = analyseStaging(compileFilm(film, {}), film, { trackValueAt });
    assert.ok(moved.some((x) => x.message.includes('"b"')),
        'the named subject must still be in frame');
});

test('an unknown framing names the set rather than being ignored', () => {
    const film = {
        version: 'jirex.film/1',
        meta: { fps: 24, width: 1280, height: 720 },
        characters: { a: { generate: {}, proportions: { height: 420 } } },
        scenes: [{
            id: 's1', template: { template: 'living-room' },
            cast: [{ character: 'a', as: 'a', at: [640] }],
            shots: [{ id: 'x', duration: 2, framing: 'extreme-close',
                      camera: { from: { x: 0, y: 0, zoom: 1 }, to: { x: 0, y: 0, zoom: 1 } } }],
        }],
    };
    const d = analyseStaging(compileFilm(film, {}), film, { trackValueAt });
    assert.match(d[0].message, /Known: wide, medium, close/);
    assert.equal(d[0].severity, 'warning', 'never fatal');
});

test('the reference two-hander stages and frames clean', async () => {
    const { readFile } = await import('node:fs/promises');
    const film = JSON.parse(await readFile(
        new URL('../../demo/two-hander.json', import.meta.url), 'utf8'));
    const compiled = compileFilm(film, {});
    assert.equal(compiled.meta.duration, 55, 'durations still sum to 55s');
    const d = analyseStaging(compiled, film, { trackValueAt });
    assert.equal(d.length, 0, `reference film has staging problems: ${d[0]?.message}`);
});

test('a camera shake does not clobber the previous shot\'s final framing', () => {
    const film = {
        version: 'jirex.film/1',
        meta: { fps: 24, width: 1280, height: 720 },
        characters: { a: { generate: {}, proportions: { height: 330 } } },
        scenes: [{
            id: 's1', template: { template: 'hillside' },
            cast: [{ character: 'a', as: 'a', at: [640] }],
            shots: [
                // Holds hard right...
                { id: 'hold', duration: 2,
                  camera: { from: { x: 300, y: 0, zoom: 1 }, to: { x: 300, y: 0, zoom: 1 } } },
                // ...and the next shot opens on an impact.
                { id: 'hit', duration: 2, camera: { from: { x: 0, y: 0, zoom: 1 },
                                                    to: { x: 0, y: 0, zoom: 1 }, shake: 30 } },
            ],
        }],
    };
    const { timeline } = compileFilm(film, {});
    const x = timeline._index.get('__camera\u0000transform.x');
    // The shake's first key lands on the same instant as the previous shot's
    // `to`, and `key()` replaces rather than appends -- so without the cut
    // offset the hold silently became a drift across the whole shot.
    assert.equal(trackValueAt(x, 2), 940, 'the hold still ends where it was told to');
    assert.equal(trackValueAt(x, 1), 940, 'and holds throughout, rather than drifting');
    // The shake itself still happens.
    const during = [2.1, 2.15, 2.2].map((t) => trackValueAt(x, t));
    assert.ok(new Set(during.map((v) => Math.round(v))).size > 1, 'the impact still shakes');
});

// ---------------------------------------------------------------- motion

test('motion is measured on the cast, where the camera cannot flatter it', async () => {
    const { readFile } = await import('node:fs/promises');
    const { analyseMotion, checkMotion } = await import('../../src/core/script/staging.js');

    // The dialogue film holds most of its drawings -- correct for the idiom --
    // but is never completely still, because its cycles run under the holds.
    const dialogue = JSON.parse(await readFile(
        new URL('../../demo/two-hander.json', import.meta.url), 'utf8'));
    const d = analyseMotion(compileFilm(dialogue, {}), dialogue);
    assert.ok(d.frozen < 0.1, `a held dialogue scene still breathes, got ${d.frozen}`);
    assert.equal(checkMotion(compileFilm(dialogue, {}), dialogue).length, 0);

    // A shot whose only movement is the camera reads as busy and is not.
    const film = {
        version: 'jirex.film/1',
        meta: { fps: 24, width: 1280, height: 720 },
        characters: { a: { generate: {}, proportions: { height: 330 },
                           poses: { guard: { armR: { rot: -0.5 } } } } },
        scenes: [{
            id: 's1', template: { template: 'hillside' },
            cast: [{ character: 'a', as: 'a', at: [640] }],
            shots: [
                { id: 'still', duration: 2,
                  camera: { from: { x: 0, y: 0, zoom: 1 }, to: { x: 0, y: 0, zoom: 1 }, shake: 30 },
                  actions: [{ target: 'a', do: 'pose', pose: 'guard', at: 0 }] },
                { id: 'alive', duration: 2,
                  camera: { from: { x: 0, y: 0, zoom: 1 }, to: { x: 0, y: 0, zoom: 1 } },
                  actions: [{ target: 'a', do: 'play', action: 'walk', at: 0 }] },
            ],
        }],
    };
    const compiled = compileFilm(film, {});
    const report = analyseMotion(compiled, film);
    const byId = Object.fromEntries(report.shots.map((s) => [s.shotId, s]));
    assert.ok(byId.still.frozen > 0.9, 'a shaking camera over a held pose is still a held pose');
    assert.ok(byId.alive.frozen < 0.1, 'a running cycle is not');

    const notes = checkMotion(compiled, film);
    assert.ok(notes.some((x) => x.message.includes('still')), 'the frozen shot is reported');
    assert.ok(!notes.some((x) => x.message.includes('alive')), 'the moving one is not');
});

test('a pose and a cycle on the same channel collide, and the pose wins forever', () => {
    // Documented as a FAILING property, not a desired one: this is root cause
    // 1 in docs/10-ACTION-GAPS.md and the reason a sixty-second fight rendered
    // 77% frozen. The assertion exists so that Phase 13's additive layering
    // has something to flip.
    const film = {
        version: 'jirex.film/1',
        meta: { fps: 24, width: 1280, height: 720 },
        characters: { a: { generate: {}, proportions: { height: 300 },
                           poses: { pin: { torso: { sy: 1 } } } } },
        scenes: [{
            id: 's1', template: { template: 'hillside' },
            cast: [{ character: 'a', as: 'a', at: [640] }],
            shots: [{ id: 'x', duration: 4, actions: [
                { target: 'a', do: 'play', action: 'breathe', at: 0 },
                { target: 'a', do: 'pose', pose: 'pin', at: 0.5 },
            ] }],
        }],
    };
    const { scene, timeline } = compileFilm(film, {});
    const baseline = createPoseBaseline(scene, timeline);
    const syAt = (t) => {
        resetPose(scene, baseline);
        applyPose(scene, samplePose(timeline, t));
        return scene.get('s1/a/torso').transform.sy;
    };
    // Worse than "the pose wins after it happens": a track reads as its first
    // key at every EARLIER time too, so one pose at t=0.5 pins the channel for
    // the whole film, before and after.
    assert.equal(syAt(0.3), 1, 'the cycle is dead before the pose as well');
    assert.equal(syAt(2.5), 1, 'and after it');

    // Without the pose, the same cycle moves -- which is what proves the
    // collision rather than a broken clip.
    const alone = structuredClone(film);
    alone.scenes[0].shots[0].actions.pop();
    const solo = compileFilm(alone, {});
    const soloBase = createPoseBaseline(solo.scene, solo.timeline);
    resetPose(solo.scene, soloBase);
    applyPose(solo.scene, samplePose(solo.timeline, 1.0));
    assert.notEqual(solo.scene.get('s1/a/torso').transform.sy, 1,
        'the breathe cycle does move a channel nothing else claims');
});
