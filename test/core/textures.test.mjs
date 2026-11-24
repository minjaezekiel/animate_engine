import test from 'node:test';
import assert from 'node:assert/strict';
import {
    paintTexture, normalFromHeight, parseColor, sampleRamp, valueNoise, fbm,
} from '../../src/core/art/textures.js';

/** Read one texel as [r, g, b, a] in 0..255. */
const texel = (t, x, y) => {
    const o = (y * t.width + x) * 4;
    return [t.data[o], t.data[o + 1], t.data[o + 2], t.data[o + 3]];
};

test('parseColor', async (t) => {
    await t.test('reads 3, 6 and 8 digit hex', () => {
        assert.deepEqual(parseColor('#fff'), [1, 1, 1, 1]);
        assert.deepEqual(parseColor('#000000'), [0, 0, 0, 1]);
        assert.deepEqual(parseColor('#ff000080').slice(0, 3), [1, 0, 0]);
        assert.ok(Math.abs(parseColor('#ff000080')[3] - 0.502) < 0.01);
    });

    await t.test('returns magenta rather than throwing on nonsense', () => {
        // Every diagnostic on this path is a warning, never a throw: one
        // mistyped colour costs a visible wrong surface, not a render.
        assert.deepEqual(parseColor('not a colour'), [1, 0, 1, 1]);
        assert.deepEqual(parseColor(undefined), [1, 0, 1, 1]);
    });
});

test('sampleRamp', async (t) => {
    await t.test('interpolates between stops and clamps outside them', () => {
        const stops = [[0, '#000000'], [1, '#ffffff']];
        assert.equal(sampleRamp(stops, 0.5)[0], 0.5);
        assert.equal(sampleRamp(stops, -3)[0], 0);
        assert.equal(sampleRamp(stops, 9)[0], 1);
    });

    await t.test('sorts stops given out of order', () => {
        // Authoring a ramp is "and also an ice line at 0.95" appended to the
        // end far more often than it is a list kept in order by hand.
        const a = sampleRamp([[1, '#ffffff'], [0, '#000000']], 0.25);
        const b = sampleRamp([[0, '#000000'], [1, '#ffffff']], 0.25);
        assert.deepEqual(a, b);
    });

    await t.test('carries alpha, which is how a layer gets soft coverage', () => {
        const stops = [[0, '#ffffff00'], [1, '#ffffffff']];
        assert.equal(sampleRamp(stops, 0)[3], 0);
        assert.equal(sampleRamp(stops, 1)[3], 1);
    });
});

test('valueNoise is periodic in both axes', () => {
    // The date line is the whole reason. An equirectangular plate meets
    // itself at u = 0 and u = 1, and non-periodic noise puts a vertical seam
    // down the Pacific on every frame of a rotating globe.
    const gx = 16;
    const gy = 8;
    for (const v of [0.1, 0.37, 0.8]) {
        assert.ok(Math.abs(valueNoise(7, 0, v, gx, gy) - valueNoise(7, 1, v, gx, gy)) < 1e-9,
            `u wrap at v=${v}`);
    }
    for (const u of [0.2, 0.55, 0.9]) {
        assert.ok(Math.abs(valueNoise(7, u, 0, gx, gy) - valueNoise(7, u, 1, gx, gy)) < 1e-9,
            `v wrap at u=${u}`);
    }
});

test('noise is a pure function of (seed, position), never a generator', () => {
    // A generator carries state and state is history: a texture whose pixels
    // depend on the order they were visited cannot be reproduced, and any
    // pixel must be paintable alone.
    const a = fbm(0.31, 0.62, { seed: 5, octaves: 5, scale: 9 });
    for (let i = 0; i < 50; i++) fbm(Math.random(), Math.random(), { seed: 5 });
    const b = fbm(0.31, 0.62, { seed: 5, octaves: 5, scale: 9 });
    assert.equal(a, b);
});

test('fbm stays inside 0..1', () => {
    for (let i = 0; i < 400; i++) {
        const n = fbm(i / 400, (i * 7 % 400) / 400,
                      { seed: 3, octaves: 6, scale: 12, ridged: i % 2 === 0 });
        assert.ok(n >= 0 && n <= 1, `fbm out of range: ${n}`);
    }
});

test('paintTexture', async (t) => {
    await t.test('is deterministic', () => {
        const spec = { width: 32, height: 16, background: '#101820', layers: [
            { kind: 'noise', seed: 11, octaves: 4, scale: 6 }] };
        assert.deepEqual([...paintTexture(spec).data], [...paintTexture(spec).data]);
    });

    await t.test('samples at texel centres, not corners', () => {
        /**
         * At v = y/height the top row sits exactly on the north pole, where
         * an equirectangular map has zero width -- so the first row of a
         * latitude gradient came out as the pole colour across the entire
         * image. The top row of a black-to-white ramp over 4 rows should be
         * 1/8 of the way down, not 0.
         */
        const t4 = paintTexture({ width: 2, height: 4, layers: [
            { kind: 'gradient', axis: 'y', stops: [[0, '#000000'], [1, '#ffffff']] }] });
        assert.equal(texel(t4, 0, 0)[0], Math.round(0.125 * 255));
        assert.equal(texel(t4, 0, 3)[0], Math.round(0.875 * 255));
    });

    await t.test('masks multiply, and `!` inverts', () => {
        // A desert is "on land, AND away from the poles, AND not on the
        // equator". With a single mask slot the only way to say that is to
        // bake latitude into the noise, which is what put sand in Siberia.
        const spec = {
            width: 4, height: 2, background: '#000000',
            layers: [
                { kind: 'solid', id: 'all', color: '#000000', alpha: 0 },
                { kind: 'latitudeBand', id: 'top', north: 0, south: -90,
                  feather: 1, color: '#000000', alpha: 0 },
                { kind: 'solid', color: '#ff0000', mask: 'top' },
                { kind: 'solid', color: '#00ff00', mask: '!top' },
            ],
        };
        const out = paintTexture(spec);
        // Row 0 is the northern half: above the band's `north: 0`, so `top`
        // covers it and the red layer lands there.
        assert.ok(texel(out, 0, 0)[0] > 200, 'north row is red');
        assert.ok(texel(out, 0, 1)[1] > 200, 'south row is green');
    });

    await t.test('a layer with alpha 0 still defines a mask', () => {
        // `alpha: 0` plus an `id` is how a latitude zone becomes a shape for
        // something else to stop at without drawing anything itself.
        const out = paintTexture({
            width: 2, height: 2, background: '#000000',
            layers: [
                { kind: 'solid', id: 'zone', color: '#ffffff', alpha: 0 },
                { kind: 'solid', color: '#0000ff', mask: 'zone' },
            ],
        });
        assert.equal(texel(out, 0, 0)[2], 255, 'masked layer drew');
        assert.equal(texel(out, 0, 0)[0], 0, 'the mask layer itself did not');
    });

    await t.test('polygons fill in equirectangular degrees', () => {
        // A square covering the whole eastern hemisphere's northern half.
        const out = paintTexture({
            width: 8, height: 4, background: '#000000',
            layers: [{ kind: 'polygons', color: '#ffffff',
                       polygons: [[[0, 0], [180, 0], [180, 90], [0, 90]]] }],
        });
        // u > 0.5 is longitude > 0; v < 0.5 is latitude > 0.
        assert.equal(texel(out, 6, 0)[0], 255, 'NE quadrant filled');
        assert.equal(texel(out, 1, 0)[0], 0, 'NW quadrant empty');
        assert.equal(texel(out, 6, 3)[0], 0, 'SE quadrant empty');
    });

    await t.test('blend modes stay in range', () => {
        for (const blend of ['normal', 'multiply', 'screen', 'add', 'overlay', 'softLight']) {
            const out = paintTexture({
                width: 4, height: 4, background: '#808080',
                layers: [{ kind: 'noise', seed: 2, octaves: 3, scale: 4, blend }],
            });
            for (const v of out.data) assert.ok(v >= 0 && v <= 255, `${blend} out of range`);
        }
    });

    await t.test('an unknown layer kind draws magenta rather than throwing', () => {
        const out = paintTexture({ width: 2, height: 2,
            layers: [{ kind: 'nonsense' }] });
        assert.deepEqual(texel(out, 0, 0), [255, 0, 255, 255]);
    });
});

test('normalFromHeight', async (t) => {
    const flat = paintTexture({ width: 8, height: 8, background: '#808080', layers: [] });

    await t.test('a flat height gives a flat normal', () => {
        const n = normalFromHeight(flat, 2);
        // (0, 0, 1) encoded is (128, 128, 255).
        assert.equal(n.data[0], 128);
        assert.equal(n.data[1], 128);
        assert.equal(n.data[2], 255);
    });

    await t.test('the blue channel never drops below neutral', () => {
        // z = 1/len with len >= 1, so the encoded blue is always in 128..255.
        // A normal map whose blue goes below 128 is pointing INTO the
        // surface, which renders black -- and black from a normal map is
        // indistinguishable by eye from a lighting bug.
        const bumpy = paintTexture({ width: 32, height: 32, background: '#000000',
            layers: [{ kind: 'noise', seed: 4, octaves: 5, scale: 16 }] });
        const n = normalFromHeight(bumpy, 6);
        for (let i = 2; i < n.data.length; i += 4) {
            assert.ok(n.data[i] >= 128, `blue ${n.data[i]} below neutral`);
        }
    });

    await t.test('wraps in x and clamps in y', () => {
        // A sphere's texture meets itself at the date line and does not meet
        // itself across a pole.
        const ramp = paintTexture({ width: 8, height: 8, background: '#000000',
            layers: [{ kind: 'gradient', axis: 'x', stops: [[0, '#000000'], [1, '#ffffff']] }] });
        const n = normalFromHeight(ramp, 2);
        // Column 0 sees column 7 to its left because x wraps, so it has a
        // large gradient rather than a clamped one.
        assert.notEqual(n.data[0], 128);
    });
});
