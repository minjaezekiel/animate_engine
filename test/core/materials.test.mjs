/**
 * The material library.
 *
 * Every material in every 3D film here was one flat colour with a roughness
 * number, which is the largest remaining reason a frame reads as a diagram.
 * The machinery to fix that -- layered procedural texturing -- has existed
 * since Phase 39 and exactly one film used it, for a planet, because a
 * brushed steel receiver is twenty lines of layer spec per material per film.
 *
 * What is tested here is the CONTRACT, not the look: a preset paints
 * variation and never colour, the film's own numbers always win, and the
 * texture ids it generates are real.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { MATERIAL_PRESETS, PRESET_NAMES, expandPreset } from '../../src/core/art/materials.js';
import { paintTexture } from '../../src/core/art/textures.js';
import { compileFilm3D } from '../../src/core/script/compile3d.js';
import { TEXTURE_SLOTS } from '../../src/core/script/compile3d.js';

test('a preset fills the slots a surface needs, and names real textures', () => {
    const { material, textures } = expandPreset({ preset: 'wood' }, { id: 'stock' });
    for (const slot of ['map', 'roughnessMap', 'normalMap']) {
        assert.ok(material[slot], `no ${slot}`);
        assert.ok(textures[material[slot]], `${slot} names '${material[slot]}', which is not painted`);
        assert.ok(TEXTURE_SLOTS.includes(slot), `${slot} is not a slot the compiler knows`);
    }
    // The normal map is DERIVED from the height, so the bumps agree with the
    // albedo instead of being a second drawing of the same surface.
    const normal = textures[material.normalMap];
    assert.equal(normal.normalFrom, 'preset:stock/height');
    assert.ok(textures[normal.normalFrom], 'and the height it derives from exists');
});

test('data maps are linear and only albedo is sRGB', () => {
    // Tagging data as sRGB un-gammas numbers that were never gammaed: a
    // surface far too rough in the midtones, and nearly impossible to
    // attribute by eye.
    const { material, textures } = expandPreset({ preset: 'concrete' }, { id: 'wall' });
    assert.ok(!textures[material.map].linear, 'albedo is a colour');
    assert.equal(textures[material.roughnessMap].linear, true);
    assert.equal(textures[material.roughnessMap].role, 'data');
});

test('a preset paints variation; the film keeps saying what colour it is', () => {
    const oak = expandPreset({ preset: 'wood', color: '#5e3a1d' }, { id: 'a' });
    const pine = expandPreset({ preset: 'wood', color: '#c9a227' }, { id: 'b' });
    assert.equal(oak.material.color, '#5e3a1d');
    assert.equal(pine.material.color, '#c9a227');
    // Same pattern, two woods: the albedo layers are identical and only the
    // multiplier differs.
    assert.deepEqual(oak.textures['preset:a/map'].layers, pine.textures['preset:b/map'].layers);
});

test("the film's own numbers win over the preset's", () => {
    const { material } = expandPreset({ preset: 'brushed-metal', roughness: 0.05,
                                        metalness: 0.5, color: '#fff' }, { id: 'm' });
    assert.equal(material.roughness, 0.05, 'a preset is a starting point, not a lock');
    assert.equal(material.metalness, 0.5);
    // And the keys that configure the preset do not leak into the material,
    // where THREE would spread them into a constructor that ignores them.
    for (const k of ['preset', 'repeat', 'textureSize', 'normalStrength']) {
        assert.ok(!(k in material), `${k} leaked into the material`);
    }
});

test('an unknown preset is null, so the caller keeps its own diagnostic', () => {
    assert.equal(expandPreset({ preset: 'marble' }, { id: 'x' }), null);
    assert.equal(expandPreset({}, { id: 'x' }), null);
    assert.ok(PRESET_NAMES.length >= 4);
});

test('every preset paints something, and something different each time', () => {
    const seen = new Map();
    for (const name of PRESET_NAMES) {
        const { textures } = expandPreset({ preset: name }, { id: name });
        for (const [id, spec] of Object.entries(textures)) {
            if (spec.normalFrom) continue;
            const painted = paintTexture({ ...spec, width: 48, height: 48 });
            let min = 255, max = 0;
            for (let i = 0; i < painted.data.length; i += 4) {
                if (painted.data[i] < min) min = painted.data[i];
                if (painted.data[i] > max) max = painted.data[i];
            }
            // A flat image is the failure this whole phase is about.
            if (!id.endsWith('/roughnessMap') || MATERIAL_PRESETS[name].maps.roughnessMap.length > 1) {
                assert.ok(max - min > 8, `${id} is flat: ${min}..${max}`);
            }
            seen.set(id, `${min}:${max}`);
        }
    }
    assert.ok(new Set(seen.values()).size > 3, 'four presets that all paint the same thing is one preset');
});

test('a film asking for a preset gets its textures declared for it', () => {
    const film = {
        materials: { stock: { preset: 'wood', color: '#5e3a1d' } },
        assemblies: { a: { parts: [{ id: 'p', geometry: { kind: 'cube' }, material: 'stock' },
                                   { id: 'q', geometry: { kind: 'cube' }, material: 'stock' }] } },
        cast: [{ assembly: 'a', as: 'thing' }],
        scenes: [{ id: 's', shots: [{ id: 'one', duration: 1 }] }],
    };
    const c = compileFilm3D(film);
    assert.deepEqual(c.diagnostics, [], 'a preset is not a missing texture');
    assert.ok(Object.keys(c.textures).length >= 4);
    const mat = c.scene.get('thing/p').props.material;
    assert.equal(mat.color, '#5e3a1d');
    assert.ok(c.textures[mat.map], 'the slot names a texture the film now declares');
    // Painted once per material name, however many parts use it: a rifle has
    // forty, and forty wood grains is the kind of cost that only shows up at
    // 1080p.
    assert.equal(Object.keys(c.textures).filter((k) => k.startsWith('preset:stock/')).length, 4);
});

test('an unknown preset is a diagnostic, not a silently untextured surface', () => {
    const film = {
        materials: { m: { preset: 'marble', color: '#fff' } },
        assemblies: { a: { parts: [{ id: 'p', geometry: { kind: 'cube' }, material: 'm' }] } },
        cast: [{ assembly: 'a', as: 't' }],
        scenes: [{ id: 's', shots: [{ id: 'one', duration: 1 }] }],
    };
    const c = compileFilm3D(film);
    assert.equal(c.diagnostics.length, 1);
    assert.match(c.diagnostics[0].message, /unknown material preset 'marble'/);
    assert.match(c.diagnostics[0].message, /brushed-metal/, 'and says what there is');
    // It still renders, in the colour it asked for.
    assert.equal(c.scene.get('t/p').props.material.color, '#fff');
});
