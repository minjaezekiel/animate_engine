/**
 * The procedural art provider, its palette derivation and its scenery
 * templates.
 *
 * The thing worth asserting is not that a path string has a particular shape
 * -- that is art direction and it belongs in a contact sheet looked at once.
 * It is that the vocabulary is CLOSED and DETERMINISTIC: the same spec yields
 * the same parts twice, every enumerated name produces geometry, a name
 * outside the set degrades rather than vanishing, and the two channels that
 * drive the same property do not fight.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { headParts, FACE_KITS, EXPRESSIONS, VIEWS } from '../../src/core/art/face.js';
import { derivePalette, shadeOf, lineOf, parseHex, mixColor } from '../../src/core/art/palette.js';
import {
    buildSceneryTemplate, SCENERY_TEMPLATES, TEMPLATE_NAMES, PROP_NAMES, TIME_NAMES,
} from '../../src/core/art/scenery.js';
import { generateCharacterParts, generateActions, BUILDS } from '../../src/core/script/generate.js';
import { measureCharacter, groundAt } from '../../src/core/script/staging.js';
import { compileFilm } from '../../src/core/script/compile.js';
import { applySwapSets } from '../../src/core/scene/swapSets.js';

const luma = (hex) => { const [r, g, b] = parseHex(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };

// ------------------------------------------------------------------ palette

test('derived tones are darker than their base and keep its hue', () => {
    for (const base of ['#e8b98f', '#d9533b', '#4a6382', '#3a2a1d', '#f4efe6']) {
        const [r, g, b] = parseHex(base);
        const [sr, sg, sb] = parseHex(shadeOf(base));
        assert.ok(luma(shadeOf(base)) < luma(base), `${base} shade is darker`);
        assert.ok(luma(lineOf(base)) < luma(shadeOf(base)), `${base} line is darkest`);
        // Hue preserved, which is exactly what the HSL route broke -- pale
        // skin shaded toward yellow. Checked only where there is enough
        // chroma for an order to mean anything: for a near-neutral the
        // deliberate cool bias may legitimately reorder green and blue, and
        // a white that shades slightly blue is correct, not a bug.
        if (Math.max(r, g, b) - Math.min(r, g, b) > 20) {
            const order = (x, y, z) => [x > y, y > z, x > z].join();
            assert.equal(order(sr, sg, sb), order(r, g, b), `${base} keeps its channel order`);
        }
        // The cool bias itself: blue loses the least, so a shadow reads cool.
        assert.ok(sb / (b || 1) > sr / (r || 1), `${base} shade is cooler than its base`);
    }
});

test('derivePalette fills in shade and line but never overwrites art direction', () => {
    const p = derivePalette({ skin: '#e8b98f', coat: '#d9533b', coatShade: '#000000' });
    assert.equal(p.skinShade, shadeOf('#e8b98f'));
    assert.equal(p.skinLine, lineOf('#e8b98f'));
    assert.equal(p.coatShade, '#000000', 'a declared tone wins over the derived one');
    assert.ok(p.sky && p.floor, 'scenery defaults are present so a set renders bare');
    assert.equal(p.skinShadeShade, undefined, 'derived keys are not themselves derived');
});

test('a non-colour passes through untouched rather than throwing', () => {
    assert.equal(derivePalette({ sky: 'rebeccapurple' }).skyShade, undefined);
    assert.equal(parseHex('not a colour'), null);
    assert.equal(mixColor('#000000', '#ffffff', 0.5), '#808080');
});

// --------------------------------------------------------------- the face kit

test('every enumerated face name produces geometry in every view', () => {
    for (const slot of ['jaw', 'eyes', 'brow', 'nose', 'ears']) {
        for (const value of FACE_KITS[slot]) {
            const parts = headParts({ R: 20, face: { [slot]: value } });
            assert.ok(parts.length >= 4, `${slot}=${value} builds a head`);
            for (const part of parts) {
                for (const [view, shape] of Object.entries(part.swap?.view?.shapes ?? {})) {
                    assert.ok(VIEWS[view] != null, `${view} is a known view`);
                    assert.ok(shape.d && shape.d.length > 8,
                              `${slot}=${value} ${part.id}/${view} has geometry`);
                }
            }
        }
    }
});

test('every hair style builds, and bald builds nothing rather than failing', () => {
    for (const hair of FACE_KITS.hair) {
        const ids = headParts({ R: 20, hair }).map((p) => p.id);
        assert.ok(ids.includes('skull'), `${hair} still has a skull`);
        assert.equal(ids.includes('hair'), hair !== 'bald', `${hair} hair presence`);
    }
});

test('the same spec yields byte-identical parts twice', () => {
    const spec = { R: 23.5, face: { jaw: 'tapered', eyes: 'hooded', brow: 'angled', nose: 'hooked' },
                   hair: 'locs', facing: -1, colors: { skin: 'skin', hair: 'hair' } };
    assert.equal(JSON.stringify(headParts(spec)), JSON.stringify(headParts(spec)));
    assert.equal(JSON.stringify(generateCharacterParts({ build: 'heavy' }, { height: 170 })),
                 JSON.stringify(generateCharacterParts({ build: 'heavy' }, { height: 170 })));
});

test('an expression overrides geometry per view, and neutral overrides nothing', () => {
    const brows = headParts({ R: 20 }).find((p) => p.id === 'brows');
    const set = brows.swap.expression.shapes;
    assert.deepEqual(set.neutral, {}, 'neutral is empty so the view survives it');
    for (const name of Object.keys(EXPRESSIONS)) {
        if (name === 'neutral') continue;
        assert.ok(set[name]?.d, `${name} has front geometry`);
        assert.ok(set[`${name}@profile`]?.d, `${name} has profile geometry`);
        assert.notEqual(set[name].d, set[`${name}@profile`].d,
                        `${name} differs between views`);
    }
});

test('a blink does not revert a turned head to the front view', () => {
    const eyes = headParts({ R: 20 }).find((p) => p.id === 'eyes');
    // `open` must be empty: it is applied AFTER the view channel, so any
    // geometry on it would overwrite the turn on every open frame.
    assert.deepEqual(eyes.swap.eyes.shapes.open, {});
    assert.ok(eyes.swap.eyes.shapes['closed@profile']?.d, 'closing is view-aware');
});

// ----------------------------------------------------------------- the body

test('every build produces a rig the IK and the staging check can both read', () => {
    for (const build of Object.keys(BUILDS)) {
        const parts = generateCharacterParts({ build }, { height: 180 });
        const ids = new Set(parts.map((p) => p.id));
        for (const required of ['hips', 'torso', 'head', 'skull', 'armL', 'foreR', 'footL']) {
            assert.ok(ids.has(required), `${build} has ${required}`);
        }
        for (const part of parts) {
            if (part.parent) assert.ok(ids.has(part.parent), `${build}: ${part.id} parent exists`);
        }
        const m = measureCharacter(parts);
        assert.ok(m.bottom > 0 && m.top < 0, `${build} straddles its root`);
        // The declared height is head to foot; a head sunk into the torso made
        // the rig measurably shorter than it claimed to be.
        const measured = m.bottom - m.top;
        assert.ok(Math.abs(measured - 180) < 25,
                  `${build} measures ${measured.toFixed(0)} against a declared 180`);
    }
});

test('generated actions only key parts the rig actually has', () => {
    const ids = new Set(generateCharacterParts({}).map((p) => p.id));
    for (const [name, action] of Object.entries(generateActions())) {
        assert.ok(action.duration > 0, `${name} has a duration`);
        for (const channel of Object.keys(action.keys)) {
            const part = channel.slice(0, channel.indexOf('.'));
            assert.ok(ids.has(part), `${name} keys a real part (${part})`);
        }
    }
});

test('squash preserves volume', () => {
    const k = generateActions().squash.keys;
    for (let i = 0; i < k['hips.sy'].length; i++) {
        assert.ok(Math.abs(k['hips.sx'][i][1] * k['hips.sy'][i][1] - 1) < 1e-9,
                  'the hips keep their area through the squash');
    }
});

// ------------------------------------------------------------ scenery templates

test('every template returns scenery plus a ground, and they agree', () => {
    for (const name of TEMPLATE_NAMES) {
        const built = buildSceneryTemplate({ template: name }, { width: 1280, height: 720 });
        assert.ok(built.scenery.length >= 4, `${name} draws something`);
        assert.ok(built.ground, `${name} declares a ground`);
        assert.ok(built.background, `${name} declares a backdrop`);
        // The ground must land inside the frame, below the middle: a floor
        // the staging check reads as off-screen is worse than no floor.
        for (const x of [0, 640, 1280]) {
            const y = groundAt(built.ground, x);
            assert.ok(y > 360 && y <= 720, `${name} ground at x=${x} is ${y}`);
        }
        for (const item of built.scenery) {
            assert.ok(item.id && item.shape && item.fill, `${name}: ${item.id} is complete`);
        }
    }
});

test('templates scale to the frame rather than assuming 720p', () => {
    const small = buildSceneryTemplate('hillside', { width: 640, height: 360 });
    const big = buildSceneryTemplate('hillside', { width: 1920, height: 1080 });
    assert.ok(groundAt(small.ground, 320) < groundAt(big.ground, 960));
    assert.equal(small.scenery.length, big.scenery.length);
});

test('props place by name and by fractional anchor; unknown names are diagnostics', () => {
    const d = [];
    const built = buildSceneryTemplate(
        { template: 'living-room', props: ['sofa@0.5', 'plant@0.9', 'teleporter'] },
        { width: 1280, height: 720 }, d, 'scenes[0].template');
    assert.ok(built.scenery.some((i) => i.id.startsWith('sofa0_')));
    assert.ok(built.scenery.some((i) => i.id.startsWith('plant1_')));
    assert.equal(d.length, 1);
    assert.equal(d[0].severity, 'warning', 'never fatal: an unknown prop still renders the set');
    assert.match(d[0].message, /teleporter/);
    for (const name of PROP_NAMES) {
        const only = buildSceneryTemplate({ template: 'street', props: [name] },
                                          { width: 1280, height: 720 });
        assert.ok(only.scenery.length > SCENERY_TEMPLATES.street(1280, 720).scenery.length,
                  `${name} adds geometry`);
    }
});

test('an unknown template is a diagnostic, never a throw', () => {
    const d = [];
    assert.equal(buildSceneryTemplate({ template: 'dungeon' }, { width: 1280, height: 720 }, d), null);
    assert.equal(d[0].severity, 'warning');
});

test('time of day recolours without touching geometry', () => {
    const base = buildSceneryTemplate({ template: 'street' }, { width: 1280, height: 720 });
    for (const time of TIME_NAMES) {
        const tinted = buildSceneryTemplate({ template: 'street', time }, { width: 1280, height: 720 });
        assert.equal(JSON.stringify(tinted.scenery), JSON.stringify(base.scenery),
                     `${time} changes no geometry`);
        assert.ok(tinted.palette.sky, `${time} supplies a sky`);
    }
    assert.equal(base.palette, null, 'no time means no overlay');
});

// ------------------------------------------------------------ end to end

test('a template film compiles to a scene whose floor the cast stands on', () => {
    const film = {
        version: 'jirex.film/1',
        characters: { kid: { generate: { build: 'child', hair: 'afro-short' },
                             proportions: { height: 150 } } },
        scenes: [{
            id: 's1',
            template: { template: 'hillside', time: 'evening', props: ['tree@0.8', 'rock@0.15'] },
            cast: [{ character: 'kid', as: 'kid', at: [200, 0] }],
            shots: [{ id: 'a', duration: 2,
                      actions: [{ target: 'kid', do: 'move', to: [900], for: 1.5 }] }],
        }],
    };
    const { scene, timeline, diagnostics } = compileFilm(film, {});
    assert.equal(diagnostics.filter((x) => x.severity === 'error').length, 0);
    applySwapSets(scene);

    // `to: [900]` has no y. It must come from the template's own ground, which
    // is the entire point of returning the floor beside the art.
    const yTrack = timeline._index.get('s1/kid\u0000transform.y');
    assert.ok(yTrack, 'the move wrote a y track it was never given');
    const landed = yTrack.keys.at(-1).v;
    const feet = measureCharacter(
        generateCharacterParts({ build: 'child' }, { height: 150 })).bottom;
    const ground = buildSceneryTemplate({ template: 'hillside' }, { width: 1280, height: 720 }).ground;
    assert.ok(Math.abs((landed + feet) - groundAt(ground, 900)) < 1,
              `feet at ${(landed + feet).toFixed(1)} vs ground ${groundAt(ground, 900).toFixed(1)}`);
});
