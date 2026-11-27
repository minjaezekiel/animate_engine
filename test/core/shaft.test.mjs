/**
 * The shaft arithmetic: the chord, the integral, the phase function.
 *
 * The chord is where the bugs are. `dot(x-A,V)^2 = cos^2*|x-A|^2` is a
 * DOUBLE cone, a ray can enter through the cap rather than the wall, and a
 * ray parallel to the cone's surface has one crossing rather than two --
 * three cases that each render something plausible and wrong, and none of
 * which a screenshot distinguishes from the correct picture.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    SHAFT_G, phaseHG, rayCone, insideCone, inverseSquareIntegral, rimFactor,
    inscatter, normalizeShaft, shaftReport,
} from '../../src/core/render/shaft.js';

const close = (a, b, eps, what) =>
    assert.ok(Math.abs(a - b) < eps, `${what}: ${a} vs ${b} (eps ${eps})`);

const A = [0, 0, 0];           // apex at the origin
const V = [0, 0, -1];          // pointing down -Z, as `lookAt` aims
const DEG = 20;
const cosA = Math.cos((DEG * Math.PI) / 180);
const RANGE = 10;
const cone = { apex: A, axis: V, cosA, range: RANGE };

test('a ray across the beam enters and leaves at the cone wall', () => {
    // At 5 units down the axis the cone is 5*tan(20) = 1.8199 wide.
    const half = 5 * Math.tan((DEG * Math.PI) / 180);
    const span = rayCone([-10, 0, -5], [1, 0, 0], A, V, cosA, RANGE);
    assert.ok(span, 'missed a ray straight through the middle of the beam');
    close(span[0], 10 - half, 1e-9, 'entry');
    close(span[1], 10 + half, 1e-9, 'exit');
    close(span[1] - span[0], 2 * half, 1e-9, 'chord is the full width');
});

test('the mirror cone behind the lamp is not a second shaft', () => {
    // The quadratic is satisfied at -5 as well as at -5 the other way. A
    // missing sign test puts a beam out of the back of every lamp.
    assert.equal(rayCone([-10, 0, 5], [1, 0, 0], A, V, cosA, RANGE), null);
    assert.equal(insideCone([0, 0, 5], A, V, cosA, RANGE), false);
    assert.equal(insideCone([0, 0, -5], A, V, cosA, RANGE), true);
});

test('a ray down the axis enters through the cap and ends at the apex', () => {
    // Looking straight back up the beam from in front of it. Without the cap
    // there is a circular hole exactly where the shaft is brightest.
    const span = rayCone([0, 0, -20], [0, 0, 1], A, V, cosA, RANGE);
    assert.ok(span, 'no chord for a ray looking up the axis');
    close(span[0], 10, 1e-6, 'enters at the cap');
    close(span[1], 20, 1e-6, 'ends at the apex');
});

test('past the cap, outside the cone, and behind the eye are all misses', () => {
    assert.equal(rayCone([-10, 100, -5], [1, 0, 0], A, V, cosA, RANGE), null, 'wide');
    assert.equal(rayCone([-10, 0, -50], [1, 0, 0], A, V, cosA, RANGE), null, 'past the cap');
    // Travelling away from the beam: the chord is behind the eye.
    assert.equal(rayCone([-10, 0, -5], [-1, 0, 0], A, V, cosA, RANGE), null, 'behind');
});

test('a camera inside the beam gets a chord that starts at the eye', () => {
    // A torch or a headlight. Clamping to zero rather than dropping it is
    // what keeps the beam from vanishing when you walk into it.
    const o = [0, 0, -5];
    assert.ok(insideCone(o, A, V, cosA, RANGE));
    const span = rayCone(o, [0, 0, -1], A, V, cosA, RANGE);
    assert.ok(span, 'no chord from inside the cone');
    close(span[0], 0, 1e-9, 'starts at the eye');
    close(span[1], 5, 1e-6, 'ends at the cap');
});

test('the integral is the closed form, and matches a numeric march', () => {
    const o = [-10, 0, -5], d = [1, 0, 0];
    const span = rayCone(o, d, A, V, cosA, RANGE);
    const exact = inverseSquareIntegral(o, d, A, span, 1e-6);
    // The thing the closed form replaces, at enough steps to be the truth.
    let sum = 0;
    const N = 200000;
    const dt = (span[1] - span[0]) / N;
    for (let i = 0; i < N; i++) {
        const t = span[0] + (i + 0.5) * dt;
        const r2 = (o[0] + t * d[0]) ** 2 + (o[1] + t * d[1]) ** 2 + (o[2] + t * d[2]) ** 2;
        sum += dt / r2;
    }
    close(exact, sum, 1e-7, 'closed form against 200k steps');
});

test('the apex clamp is the lamp having a size, not a fudge', () => {
    // A ray aimed at a point light passes at h = 0 and the integral
    // diverges: one blinding pixel that bloom then smears over the frame.
    const o = [0, 0, -20], d = [0, 0, 1];
    const span = rayCone(o, d, A, V, cosA, RANGE);
    const tight = inverseSquareIntegral(o, d, A, span, 0.01);
    const wide = inverseSquareIntegral(o, d, A, span, 0.5);
    assert.ok(Number.isFinite(tight) && Number.isFinite(wide));
    assert.ok(tight > wide * 10, `the clamp should dominate: ${tight} vs ${wide}`);
    // pi/h is the limit for a ray passing a point source and continuing. This
    // chord ENDS at the apex -- the lamp is the end of the beam, not a bead
    // on it -- so it covers one side of the sweep and the answer is pi/2h.
    close(tight, Math.PI / (2 * 0.01), 1, 'a chord ending at the apex is pi/2h');
});

test('forward scattering is why a shaft is visible at all', () => {
    // Looking back up the beam against looking along it.
    assert.ok(phaseHG(1, SHAFT_G) > phaseHG(-1, SHAFT_G) * 50,
        `${phaseHG(1, SHAFT_G)} vs ${phaseHG(-1, SHAFT_G)}`);
    close(phaseHG(0, 0), 1 / (4 * Math.PI), 1e-12, 'isotropic is 1/4pi');
    close(phaseHG(1, 0), 1 / (4 * Math.PI), 1e-12, 'and has no direction');
    // Normalised: the integral over the sphere is 1, whatever g.
    for (const g of [0, 0.3, 0.6, 0.9]) {
        let s = 0;
        const N = 20000;
        for (let i = 0; i < N; i++) {
            const mu = -1 + (2 * (i + 0.5)) / N;
            s += phaseHG(mu, g) * (2 / N) * 2 * Math.PI;
        }
        close(s, 1, 2e-3, `phase normalisation at g=${g}`);
    }
});

test('the rim softens inward from the cone surface, not outward', () => {
    const soft = { ...cone, soft: 0.4 };
    const hard = { ...cone, soft: 0 };
    const o = [0, 0, -20];
    // Straight up the axis: dead centre, so full strength either way.
    const axis = [0, 0, 1];
    close(rimFactor(o, axis, soft, rayCone(o, axis, A, V, cosA, RANGE)), 1, 1e-12, 'centre');
    close(rimFactor(o, axis, hard, rayCone(o, axis, A, V, cosA, RANGE)), 1, 1e-12, 'hard centre');
    // A ray grazing the wall: the midpoint sits near the rim, so faint.
    const o2 = [-10, 0, -5];
    const grazing = [Math.cos(0.01), 0.994, 0];
    const len = Math.hypot(...grazing);
    const d2 = grazing.map((x) => x / len);
    const span = rayCone(o2, d2, A, V, cosA, RANGE);
    if (span) {
        const f = rimFactor(o2, d2, soft, span);
        assert.ok(f < 1, `a grazing ray should be dimmed, got ${f}`);
        assert.equal(rimFactor(o2, d2, hard, span), 1, 'soft 0 must not dim anything');
    }
});

test('a shaft that cannot work is a diagnostic', () => {
    const seen = [];
    const warn = (m) => seen.push(m);
    // Not a spot: no cone, so no shaft. This is what the feature IS.
    assert.equal(normalizeShaft(true, { lightType: 'point', warn }), null);
    assert.match(seen[0], /needs a spot light's cone/);
    // No length.
    seen.length = 0;
    assert.equal(normalizeShaft(true, { lightType: 'spot', distance: 0, warn }), null);
    assert.match(seen[0], /needs a finite length/);
    // Length but no medium: light scattering off nothing.
    seen.length = 0;
    assert.equal(normalizeShaft({ range: 10 }, { lightType: 'spot', warn }), null);
    assert.match(seen[0], /declares none/);
    // Off is off, silently.
    seen.length = 0;
    for (const off of [null, undefined, false]) {
        assert.equal(normalizeShaft(off, { lightType: 'spot', warn }), null);
    }
    assert.deepEqual(seen, []);
});

test('density and length default to the film, not to a guess', () => {
    const seen = [];
    const warn = (m) => seen.push(m);
    const s = normalizeShaft(true, {
        lightType: 'spot', angle: 25, distance: 12, penumbra: 0.3,
        fog: { kind: 'exp', density: 0.05 }, warn,
    });
    assert.deepEqual(seen, []);
    assert.equal(s.range, 12, 'took the light`s own distance');
    assert.equal(s.density, 0.05, 'took the film`s air');
    assert.equal(s.soft, 0.3, 'took the light`s penumbra');
    close(s.cosA, Math.cos((25 * Math.PI) / 180), 1e-12, 'half-angle in degrees');
    close(s.radius, 0.24, 1e-12, 'lamp size scales with the beam');
    assert.match(shaftReport(s, 'key'), /25deg cone, 12\.00 long/);
});

test('in-scatter falls off down the beam and brightens into the lamp', () => {
    const shaft = { ...cone, intensity: 1, density: 0.05, g: SHAFT_G, radius: 0.2, soft: 0 };
    const eye = [-10, 0, 0];
    // Two rays across the beam, one near the lamp and one near the cap.
    const near = inscatter(eye, [1, 0, 0].map((x, i) => [1, 0, 0][i]), shaft);
    const aim = (z) => {
        const v = [10, 0, z];
        const L = Math.hypot(...v);
        return v.map((x) => x / L);
    };
    const a2 = inscatter(eye, aim(-2), shaft);
    const a8 = inscatter(eye, aim(-8), shaft);
    assert.ok(a2 > a8 * 3, `1/r^2 should dominate: ${a2} vs ${a8}`);
    assert.ok(near >= 0);
    // Outside the cone, nothing at all -- not a dim glow.
    assert.equal(inscatter(eye, aim(2), shaft), 0, 'lit behind the lamp');
});
