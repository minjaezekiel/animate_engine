import test from 'node:test';
import assert from 'node:assert/strict';

import { CADENCES, generateActions, walkStride } from '../../src/core/script/generate.js';

/**
 * The generated walk is what every character in every film inherits, so its
 * phases have to be the real ones.
 *
 * What it used to be: a single vertical extreme at the PASSING position, no
 * `down` at all, no foot channels on a rig that has had feet since the first
 * generated character, no lateral sway, and one fixed tempo. A character
 * floated through a walk with rigid ankles.
 */

const walk = (opts = {}, height = 520) =>
    generateActions({ height }, opts).walk;

/** Linear sample of a looping channel at time `t`. */
function at(keys, t) {
    for (let i = 0; i < keys.length - 1; i++) {
        const [t0, v0] = keys[i];
        const [t1, v1] = keys[i + 1];
        if (t >= t0 && t <= t1) return t1 === t0 ? v0 : v0 + ((t - t0) / (t1 - t0)) * (v1 - v0);
    }
    return keys[keys.length - 1][1];
}

test('the cycle keys the phases a walk actually has', () => {
    const k = walk().keys;
    for (const ch of ['hips.y', 'hips.x', 'hips.rot', 'thighL.rot', 'thighR.rot',
                      'shinL.rot', 'shinR.rot', 'footL.rot', 'footR.rot',
                      'armL.rot', 'armR.rot', 'torso.rot', 'head.rot']) {
        assert.ok(k[ch], `missing channel ${ch}`);
    }
});

test('the body is LOWEST at the down pose and HIGHEST at push-off', () => {
    const k = walk().keys;
    const cycle = walk().duration;
    // Canvas y grows downward, so a larger value is lower.
    const contact = at(k['hips.y'], 0);
    const down = at(k['hips.y'], cycle * 0.125);
    const passing = at(k['hips.y'], cycle * 0.25);
    const up = at(k['hips.y'], cycle * 0.375);
    assert.ok(down > contact, 'the body must drop as it absorbs the landing');
    assert.ok(up < passing && passing < down, 'and rise through passing to push-off');
    assert.equal(up, Math.min(contact, down, passing, up), 'push-off is the high point');
});

test('there are two full rises and falls per cycle, one per step', () => {
    const w = walk();
    const k = w.keys['hips.y'];
    const first = at(k, w.duration * 0.125);
    const second = at(k, w.duration * 0.625);
    assert.ok(Math.abs(first - second) < 1e-9, 'both steps absorb the same way');
});

test('the feet roll: heel strike, flat, toe-off', () => {
    // Phase: the LEFT leg is at the back of its stride at t=0 and contacts
    // the ground at t=0.5. Sign: canvas y grows downward, so a positive
    // rotation points the toe DOWN. Both were established by rendering a
    // frame, not by reading the numbers.
    const w = walk();
    const f = w.keys['footL.rot'];
    const strike = at(f, w.duration * 0.5);
    const flat = at(f, w.duration * 0.625);
    const stance = at(f, w.duration * 0.75);
    const toeOff = at(f, w.duration * 0.875);
    assert.ok(strike < 0, 'the toe is UP at heel strike');
    assert.ok(flat > strike && Math.abs(flat) < 0.1, 'and flattens onto the ground');
    assert.ok(toeOff > stance, 'then points down hardest at toe-off');
    assert.equal(toeOff, Math.max(...f.map(([, v]) => v)), 'toe-off is the extreme');
});

test('the foot is in phase with the leg it is attached to', () => {
    const w = walk();
    // Thigh fully forward and foot heel-striking are the same instant.
    const t = w.duration * 0.5;
    assert.ok(at(w.keys['thighL.rot'], t) < 0, 'leg forward at contact');
    assert.ok(at(w.keys['footL.rot'], t) < 0, 'toe up at contact');
    // Knee straight at contact, bent in mid-swing.
    assert.ok(at(w.keys['shinL.rot'], t) < 0.15, 'the knee is straight at contact');
    assert.ok(at(w.keys['shinL.rot'], w.duration * 0.125) > 0.6,
        'and flexes hard in early swing to clear the ground');
});

test('the arm bends on the forward swing, not the back one', () => {
    // Arms swing back nearly straight and bend coming forward. The cycle used
    // to do the reverse: 50 degrees of bend going BACK and 7 going forward.
    const w = walk();
    const net = (t) => at(w.keys['armL.rot'], t) + at(w.keys['foreL.rot'], t);
    const forward = net(0);                       // left arm forward at t=0
    const back = net(w.duration * 0.5);
    assert.ok(forward < 0 && back > 0, 'the arm swings through vertical');
    assert.ok(Math.abs(forward) > Math.abs(back),
        `forward reach ${forward.toFixed(2)} should exceed the back swing ${back.toFixed(2)}`);
    assert.ok(Math.abs(forward) < 0.8, 'but it is a walk, not a reach');
});

test('the legs are half a cycle apart, with no duplicated or missing keys', () => {
    const w = walk();
    for (const [a, b] of [['thighL.rot', 'thighR.rot'], ['shinL.rot', 'shinR.rot'],
                          ['footL.rot', 'footR.rot'], ['armL.rot', 'armR.rot']]) {
        const ka = w.keys[a];
        const kb = w.keys[b];
        assert.equal(new Set(kb.map(([t]) => t)).size, kb.length, `${b} has a duplicate key`);
        assert.equal(kb[0][0], 0, `${b} must start the cycle`);
        assert.equal(kb[kb.length - 1][0], w.duration, `${b} must close the cycle`);
        assert.ok(Math.abs(kb[0][1] - kb[kb.length - 1][1]) < 1e-9, `${b} must loop`);
        // Half a cycle apart: one leg's value now is the other's half a cycle on.
        assert.ok(Math.abs(at(ka, 0) - at(kb, w.duration / 2)) < 1e-6,
            `${a} and ${b} are not antiphase`);
    }
});

test('arms swing opposite the legs', () => {
    const w = walk();
    const thighL = at(w.keys['thighL.rot'], 0);
    const armL = at(w.keys['armL.rot'], 0);
    assert.ok(thighL * armL < 0, 'the left arm goes back as the left leg comes forward');
});

test('shoulders counter-rotate against the hips', () => {
    const w = walk();
    assert.ok(at(w.keys['hips.rot'], 0) * at(w.keys['torso.rot'], 0) < 0);
});

test('cadence retimes the whole cycle, in proportion', () => {
    for (const [name, seconds] of Object.entries(CADENCES)) {
        const w = walk({ walk: { cadence: name } });
        assert.equal(w.duration, seconds, `${name} should be ${seconds}s`);
        const last = w.keys['hips.y'][w.keys['hips.y'].length - 1][0];
        assert.ok(Math.abs(last - seconds) < 1e-6, 'keys must span the new duration');
    }
    // A bare number is seconds per cycle.
    assert.equal(walk({ walk: { cadence: 1.4 } }).duration, 1.4);
});

test('the default is unchanged, so no existing film retimes itself', () => {
    assert.equal(walk().duration, 0.9);
    assert.equal(CADENCES.default, 0.9);
});

test('the anime variant flattens the bounce and widens the swing', () => {
    const normal = walk();
    const anime = walk({ walk: { style: 'anime' } });
    const amp = (w) => {
        const v = w.keys['hips.y'].map(([, x]) => x);
        return Math.max(...v) - Math.min(...v);
    };
    assert.ok(amp(anime) < amp(normal), 'less vertical bounce');
    assert.ok(Math.abs(at(anime.keys['armL.rot'], 0))
        > Math.abs(at(normal.keys['armL.rot'], 0)), 'wider arm swing');
});

test('stride is derived from the leg, and scales with the character', () => {
    const s520 = walkStride({ height: 520 });
    const s1040 = walkStride({ height: 1040 });
    assert.ok(Math.abs(s1040 - s520 * 2) < 1e-6, 'twice the character, twice the stride');
    // A human stride is a bit under one body height; 0.8 is the right order.
    assert.ok(s520 / 520 > 0.7 && s520 / 520 < 0.95,
        `stride/height was ${(s520 / 520).toFixed(2)}, expected ~0.8`);
});

test('a bigger build does not change the tempo, only the distance', () => {
    assert.equal(walk({ build: 'heavy' }).duration, walk({ build: 'slim' }).duration);
    assert.ok(walkStride({ height: 520 }, { build: 'heavy' }) > 0);
});

test('the hip rise is the leg geometry, so a planted foot reaches the floor', () => {
    // At contact the legs are splayed by the contact angle, so the hips sit
    // legLength*(1-cos C) lower than at passing, where one leg is straight
    // underneath. Any other number and the character hovers -- which is what
    // the old flat 1.6%-of-height bob did, invisibly.
    const H = 700;
    const legLength = H * 0.46;
    const C = 0.45;
    const w = walk({}, H);
    const y = w.keys['hips.y'];
    const passing = at(y, w.duration * 0.25);
    const contact = at(y, 0);
    assert.ok(Math.abs(passing) < 1e-9, 'passing is the rest height, so staging holds');
    assert.ok(Math.abs(contact - legLength * (1 - Math.cos(C))) < 1e-6,
        `contact drop was ${contact.toFixed(2)}, geometry wants `
        + `${(legLength * (1 - Math.cos(C))).toFixed(2)}`);
    // Both contacts, and both passings, are the same height.
    assert.ok(Math.abs(at(y, w.duration * 0.5) - contact) < 1e-9);
    assert.ok(Math.abs(at(y, w.duration * 0.75) - passing) < 1e-9);
});

test('the rise scales with the character, not with a constant', () => {
    const small = at(walk({}, 400).keys['hips.y'], 0);
    const big = at(walk({}, 800).keys['hips.y'], 0);
    assert.ok(Math.abs(big - small * 2) < 1e-6);
});
