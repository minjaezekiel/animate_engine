/**
 * A library of surfaces, synthesised.
 *
 * # Why
 *
 * Every material in every 3D film in this repository is **one flat colour**
 * with a roughness number. That is the largest remaining reason a frame reads
 * as a diagram rather than as a photograph: a real surface varies, and the
 * variation is what the eye uses to decide what a thing is made of. Phase 39
 * built the synthesis machinery -- `paintTexture` is layered procedural
 * texturing in pure arithmetic -- and then exactly one film used it, for a
 * planet. The AK-47 film uses **zero** textures.
 *
 * The reason is not that authors do not want texture. It is that a brushed
 * steel receiver is twenty lines of layer spec that have to be got right
 * before you can see whether they were worth it, per material, per film. So
 * this is that work done once, as data.
 *
 * # The contract: a preset paints VARIATION, never colour
 *
 * `material.color` multiplies `map`, so a preset's albedo layer is a pattern
 * around white and the film keeps saying what colour its wood is. Same for
 * roughness: `roughnessMap` is sampled and multiplied by `material.roughness`,
 * so a preset describes where a surface is rougher than its average, not how
 * rough it is. That is what lets `{ preset: 'wood', color: '#5e3a1d' }` and
 * `{ preset: 'wood', color: '#c9a227' }` be oak and pine rather than two
 * copies of one texture.
 *
 * # Why it is opt-in
 *
 * Unlike the default environment and the default bevel, a material cannot be
 * guessed from the film: `metalness: 0.88` could be a milled receiver, a cast
 * housing or a chromed trim strip, and they look nothing alike. So a film
 * says `preset` and gets a surface; it says nothing and gets exactly what it
 * always got.
 *
 * Pure: names, numbers and layer specs. [textures.js](textures.js) paints
 * them and [SceneAdapter.js](../../backends/three3d/SceneAdapter.js) uploads
 * them.
 */

/** Painted once per material that asks for a preset. 512 is ~40 ms of fbm. */
const SIZE = 512;

/**
 * Each preset is `{ material, maps }`.
 *
 * `material` is the PBR defaults the surface implies, which a film overrides
 * freely. `maps` are layer specs keyed by the slot they fill; `height` is not
 * a slot -- it exists so `normalMap` can be derived from it, which is how a
 * normal map stays consistent with the albedo it belongs to instead of being
 * a second drawing of the same surface.
 */
export const MATERIAL_PRESETS = {
    /**
     * Brushed metal. The grain is the whole effect: parallel scratches at
     * one scale, a slower waviness across them, and the roughness varying
     * along the scratches rather than in blobs.
     */
    'brushed-metal': {
        material: { metalness: 0.9, roughness: 0.34, normalScale: [0.35, 0.35] },
        repeat: [2, 2],
        maps: {
            map: [
                { kind: 'solid', color: '#ffffff' },
                { kind: 'noise', seed: 11, octaves: 3, scale: 3, aspect: 1 / 240,
                  contrast: 0.5, blend: 'multiply', alpha: 0.5,
                  stops: [[0, '#b8b8b8'], [1, '#ffffff']] },
            ],
            roughnessMap: [
                { kind: 'solid', color: '#ffffff' },
                { kind: 'noise', seed: 12, octaves: 4, scale: 3, aspect: 1 / 200,
                  contrast: 1.6, blend: 'multiply', alpha: 0.85,
                  stops: [[0, '#6e6e6e'], [1, '#ffffff']] },
                { kind: 'noise', seed: 13, octaves: 3, scale: 12, aspect: 1,
                  blend: 'multiply', alpha: 0.25, stops: [[0, '#9a9a9a'], [1, '#ffffff']] },
            ],
            height: [
                { kind: 'noise', seed: 11, octaves: 3, scale: 3, aspect: 1 / 240,
                  contrast: 0.8 },
            ],
        },
        normalStrength: 1.2,
    },

    /**
     * Wood. Rings, not stripes: the grain is a band structure along one axis
     * with noise pushing the bands around, which is why this is anisotropic
     * noise rather than a `stripes` layer -- real grain is irregular and a
     * periodic one reads as corduroy.
     */
    wood: {
        material: { metalness: 0, roughness: 0.62, normalScale: [0.4, 0.4] },
        repeat: [1, 1],
        maps: {
            map: [
                { kind: 'solid', color: '#ffffff' },
                { kind: 'noise', seed: 21, octaves: 4, scale: 2, aspect: 1 / 90,
                  contrast: 1.5, blend: 'multiply',
                  stops: [[0, '#8c7257'], [0.45, '#c9ab86'], [0.7, '#ffffff'], [1, '#e8d6bd']] },
                { kind: 'noise', seed: 22, octaves: 3, scale: 3, aspect: 1 / 3,
                  blend: 'multiply', alpha: 0.35,
                  stops: [[0, '#b9a890'], [1, '#ffffff']] },
            ],
            roughnessMap: [
                { kind: 'solid', color: '#dcdcdc' },
                { kind: 'noise', seed: 21, octaves: 4, scale: 2, aspect: 1 / 90,
                  contrast: 1.5, blend: 'multiply', alpha: 0.6,
                  stops: [[0, '#ffffff'], [1, '#9d9d9d']] },
            ],
            height: [
                { kind: 'noise', seed: 21, octaves: 4, scale: 2, aspect: 1 / 90,
                  contrast: 1.5 },
            ],
        },
        normalStrength: 1.6,
    },

    /**
     * Concrete, and by extension any cast or moulded surface: mottling at two
     * scales plus a fine aggregate speckle, all of it isotropic.
     */
    concrete: {
        material: { metalness: 0, roughness: 0.95, normalScale: [0.6, 0.6] },
        repeat: [3, 3],
        maps: {
            map: [
                { kind: 'solid', color: '#ffffff' },
                { kind: 'noise', seed: 31, octaves: 4, scale: 6, aspect: 1,
                  contrast: 0.9, blend: 'multiply', alpha: 0.55,
                  stops: [[0, '#9b9b9b'], [1, '#ffffff']] },
                { kind: 'noise', seed: 32, octaves: 2, scale: 180, aspect: 1,
                  contrast: 2.2, blend: 'multiply', alpha: 0.35,
                  stops: [[0, '#8a8a8a'], [0.6, '#ffffff'], [1, '#ffffff']] },
            ],
            roughnessMap: [
                { kind: 'solid', color: '#ffffff' },
                { kind: 'noise', seed: 31, octaves: 4, scale: 6, aspect: 1,
                  blend: 'multiply', alpha: 0.4, stops: [[0, '#c4c4c4'], [1, '#ffffff']] },
            ],
            height: [
                { kind: 'noise', seed: 32, octaves: 3, scale: 180, aspect: 1, contrast: 1.4 },
                { kind: 'noise', seed: 31, octaves: 4, scale: 6, aspect: 1,
                  blend: 'multiply', alpha: 0.5 },
            ],
        },
        normalStrength: 2.4,
    },

    /**
     * Fabric. Two crossed periodic bands -- the one surface here that cannot
     * be made of noise, because a weave is periodic by definition and noise
     * is aperiodic by construction.
     */
    fabric: {
        material: { metalness: 0, roughness: 0.88, normalScale: [0.5, 0.5] },
        repeat: [2, 2],
        maps: {
            map: [
                { kind: 'solid', color: '#ffffff' },
                { kind: 'stripes', axis: 'x', count: 16, softness: 1, blend: 'multiply',
                  alpha: 0.45, stops: [[0, '#9a9a9a'], [1, '#ffffff']] },
                { kind: 'stripes', axis: 'y', count: 16, softness: 1, blend: 'multiply',
                  alpha: 0.45, stops: [[0, '#9a9a9a'], [1, '#ffffff']] },
                { kind: 'noise', seed: 41, octaves: 3, scale: 24, aspect: 1,
                  blend: 'multiply', alpha: 0.25, stops: [[0, '#b5b5b5'], [1, '#ffffff']] },
            ],
            roughnessMap: [{ kind: 'solid', color: '#ffffff' }],
            height: [
                { kind: 'stripes', axis: 'x', count: 16, softness: 1 },
                { kind: 'stripes', axis: 'y', count: 16, softness: 1,
                  blend: 'screen', alpha: 0.9 },
            ],
        },
        normalStrength: 2.0,
    },
};

export const PRESET_NAMES = Object.keys(MATERIAL_PRESETS);

/**
 * Expand `{ preset: 'wood', color: '#5e3a1d' }` into a material plus the
 * textures it needs.
 *
 * Texture ids are namespaced by the MATERIAL's name rather than the preset's,
 * so two materials off one preset can carry different `repeat` values without
 * fighting over one painted image. Returns `null` for an unknown preset, so
 * the caller can keep its own diagnostic.
 */
export function expandPreset(spec = {}, { id = 'material' } = {}) {
    const preset = MATERIAL_PRESETS[spec.preset];
    if (!preset) return null;
    const textures = {};
    const material = { ...preset.material };
    const repeat = spec.repeat ?? preset.repeat ?? [1, 1];
    const size = spec.textureSize ?? SIZE;
    const common = { width: size, height: size, repeat, wrapS: 'repeat', wrapT: 'repeat' };

    for (const [slot, layers] of Object.entries(preset.maps)) {
        const texId = `preset:${id}/${slot}`;
        textures[texId] = {
            id: texId, ...common, layers,
            // Only albedo is a colour. Roughness and height are DATA, and
            // tagging data as sRGB un-gammas numbers that were never gammaed
            // -- a surface far too rough in the midtones, and almost
            // impossible to attribute by eye.
            ...(slot === 'map' ? {} : { linear: true, role: 'data' }),
        };
        if (slot !== 'height') material[slot] = texId;
    }
    if (preset.maps.height) {
        const normalId = `preset:${id}/normalMap`;
        textures[normalId] = {
            id: normalId, ...common,
            normalFrom: `preset:${id}/height`,
            strength: spec.normalStrength ?? preset.normalStrength ?? 2,
        };
        material.normalMap = normalId;
    }
    // The film's own numbers win over the preset's, always: `preset` is a
    // starting point and not a lock.
    const { preset: _p, textureSize: _s, normalStrength: _n, repeat: _r, ...rest } = spec;
    return { material: { ...material, ...rest }, textures };
}
