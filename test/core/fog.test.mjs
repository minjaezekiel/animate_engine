/**
 * The fog arithmetic, which is the deliverable.
 *
 * `root.fog = new T.FogExp2(...)` is two lines in the adapter. What is worth
 * testing is the part an author touches and a probe measures: the conversion
 * between a density nobody can picture and a visibility distance everybody
 * can, and the transmittance curve that has to agree exactly with the GLSL
 * the renderer already runs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    FOG_KINDS, FOG_THRESHOLD, isFogKind, normalizeFog, transmittance, fogFactor,
    fogged, visibilityOf, halfDistance, densityFor, smoothstep, smoothstepInverse,
    fogReport,
} from '../../src/core/render/fog.js';

const close = (a, b, eps, what) =>
    assert.ok(Math.abs(a - b) < eps, `${what}: ${a} vs ${b} (eps ${eps})`);

test('visibility and density are the same statement, both ways', () => {
    for (const vis of [5, 30, 60, 200]) {
        const fog = normalizeFog({ visibility: vis });
        close(visibilityOf(fog), vis, 1e-9, `round trip at ${vis}`);
        close(transmittance(vis, fog), FOG_THRESHOLD, 1e-12, `2% left at ${vis}`);
    }
    // And stated the hard way, it is the same medium.
    const byDensity = normalizeFog({ density: densityFor(30) });
    close(visibilityOf(byDensity), 30, 1e-9, 'density -> visibility');
});

test('transmittance is 1 at the lens and falls monotonically', () => {
    const fog = normalizeFog({ visibility: 30 });
    assert.equal(transmittance(0, fog), 1);
    // Behind the camera is not a negative thickness of fog.
    assert.equal(transmittance(-5, fog), 1);
    let prev = 1;
    for (let z = 1; z <= 60; z++) {
        const t = transmittance(z, fog);
        assert.ok(t < prev, `not falling at ${z}`);
        prev = t;
    }
    close(fogFactor(halfDistance(fog), fog), 0.5, 1e-12, 'half distance');
});

test('exp fog is NOT Beer-Lambert, and the half distance proves which it is', () => {
    // THREE's FogExp2 squares both terms. Under Beer-Lambert the half
    // distance would be ln2/density; here it is sqrt(ln2)/density, which at
    // density 0.1 is 8.33 against 6.93 -- a 20% error in the one number an
    // author would use to pick the density.
    const fog = normalizeFog({ density: 0.1 });
    close(halfDistance(fog), Math.sqrt(Math.LN2) / 0.1, 1e-9, 'FogExp2 half distance');
    assert.ok(Math.abs(halfDistance(fog) - Math.LN2 / 0.1) > 1,
        'the two models were indistinguishable, so this test proves nothing');
});

test('fog mixes in linear light, and the mix is linear in transmittance', () => {
    const fog = normalizeFog({ visibility: 30, color: '#808080' });
    // A white surface in black fog: the fogged value IS the transmittance,
    // which is what makes a with/without pixel ratio a measurement.
    for (const z of [5, 12.63, 30]) {
        close(fogged(1, 0, z, fog), transmittance(z, fog), 1e-12, `white in black at ${z}`);
    }
    // A surface the colour of the fog never changes, at any depth.
    for (const z of [0, 10, 100]) close(fogged(0.5, 0.5, z, fog), 0.5, 1e-12, `matched at ${z}`);
});

test('linear fog ends exactly where it was told to', () => {
    const fog = normalizeFog({ kind: 'linear', near: 5, far: 50 });
    assert.equal(transmittance(5, fog), 1);
    assert.equal(transmittance(50, fog), 0);
    assert.equal(transmittance(80, fog), 0, 'past far is not negative transmittance');
    // The smoothstep has to be the GLSL one, or the fog in the render is a
    // different shape from the fog in the arithmetic.
    close(fogFactor(27.5, fog), 0.5, 1e-12, 'midpoint of a smoothstep');
    close(smoothstepInverse(smoothstep(0, 1, 0.3)), 0.3, 1e-9, 'smoothstep inverse');
});

test('the colour defaults to the background, because the sky is not fogged', () => {
    // THREE paints `scene.background` behind everything at full strength, so
    // mismatched fog leaves a hard ring where the geometry ends.
    assert.equal(normalizeFog(true, { background: '#102030' }).color, '#102030');
    assert.equal(normalizeFog({ visibility: 10 }, { background: '#102030' }).color, '#102030');
    assert.equal(normalizeFog({ color: '#ffffff' }, { background: '#102030' }).color, '#ffffff');
});

test('a typo in the fog kind is a diagnostic, not a different fog', () => {
    const seen = [];
    const warn = (m, l) => seen.push(`${l}: ${m}`);
    assert.equal(normalizeFog({ kind: 'exponential', density: 0.1 }, { warn }), null);
    assert.match(seen[0], /unknown fog kind 'exponential'/);
    assert.ok(FOG_KINDS.every(isFogKind) && !isFogKind('exponential'));
});

test('fog that cannot work says so', () => {
    const seen = [];
    const warn = (m) => seen.push(m);
    // Both stated: one of them is being ignored, and silence would hide it.
    normalizeFog({ density: 0.1, visibility: 30 }, { warn });
    assert.match(seen[0], /both density 0\.1 and visibility 30/);
    // A far plane inside near.
    seen.length = 0;
    assert.equal(normalizeFog({ kind: 'linear', near: 50, far: 5 }, { warn }), null);
    assert.match(seen[0], /beyond near/);
    // Not an object.
    seen.length = 0;
    assert.equal(normalizeFog('thick', { warn }), null);
    assert.match(seen[0], /must be an object/);
    // Off is off, and says nothing.
    seen.length = 0;
    for (const off of [null, undefined, false]) assert.equal(normalizeFog(off, { warn }), null);
    assert.deepEqual(seen, []);
});

test('the report states a distance, never a bare density', () => {
    const line = fogReport(normalizeFog({ visibility: 30 }));
    assert.match(line, /half the light gone by 12\.63/);
    assert.match(line, /2% left at 30\.00/);
    assert.equal(fogReport(null), 'fog: none');
});
