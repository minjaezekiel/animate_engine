import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compileFilm } from '../../src/core/script/compile.js';
import { validateFilm } from '../../src/core/script/validate.js';
import { trackValueAt } from '../../src/core/anim/Track.js';

/**
 * `count` -- a numeric readout that ramps.
 *
 * Built for the "Game Physics" series, where the thing being taught IS a
 * number: a distance that falls to zero as two circles touch, an impulse
 * that resolves to a figure, a restitution between nought and one. A static
 * label names a quantity; a readout that moves is what makes the quantity
 * mean something. See `docs/31-GAME-PHYSICS-SERIES.md`.
 *
 * The two properties worth testing are not "does it set text" but:
 *
 *   - it ends on the number it was ASKED for, whatever the easing did, and
 *   - it costs one key per *visible* value, not one per frame.
 *
 * The second is the whole reason it is a verb rather than a loop at the
 * call site.
 */

const track = (compiled, target, path) => compiled.timeline.tracks.find(
    (x) => x.target === target && x.path === path);

const at = (compiled, target, path, t) => {
    const tr = track(compiled, target, path);
    assert.ok(tr, `no track for ${target} ${path}`);
    return trackValueAt(tr, t);
};

/** A board with one text part, which is what a readout actually is. */
const film = (actions) => ({
    version: 'jirex.film/1',
    meta: { title: 't', fps: 24, width: 100, height: 100 },
    characters: {
        bd: {
            role: 'effect',
            parts: [
                { id: 'ro', parent: null, pivot: [0, 0], at: [50, 50],
                  shape: { kind: 'text', text: 'd = 0', font: '20px sans-serif' },
                  fill: '#fff' },
            ],
        },
    },
    scenes: [{
        id: 's', cast: [{ character: 'bd', as: 'bd', at: [0, 0] }],
        shots: [{ id: 'sh', duration: 6, actions }],
    }],
});

// ---------------------------------------------------------------------------
// What it displays
// ---------------------------------------------------------------------------

test('a count displays the formatted number at each end of its ramp', () => {
    const c = compileFilm(film([
        { target: 'bd', part: 'ro', do: 'count', at: 1, for: 2,
          from: 0, to: 4, decimals: 0, prefix: 'd = ', ease: 'linear' },
    ]), { assets: null });
    assert.equal(at(c, 's/bd/ro', 'props.text', 1), 'd = 0');
    assert.equal(at(c, 's/bd/ro', 'props.text', 2), 'd = 2');
    assert.equal(at(c, 's/bd/ro', 'props.text', 3), 'd = 4');
});

test('decimals, prefix and suffix are all carried into the string', () => {
    const c = compileFilm(film([
        { target: 'bd', part: 'ro', do: 'count', at: 0, for: 1,
          from: 0, to: 1, decimals: 2, prefix: 'e = ', suffix: ' (no units)',
          ease: 'linear' },
    ]), { assets: null });
    assert.equal(at(c, 's/bd/ro', 'props.text', 1), 'e = 1.00 (no units)');
});

test('a count can run backwards, which is what a closing distance is', () => {
    const c = compileFilm(film([
        { target: 'bd', part: 'ro', do: 'count', at: 0, for: 2,
          from: 240, to: 0, decimals: 0, ease: 'linear' },
    ]), { assets: null });
    assert.equal(at(c, 's/bd/ro', 'props.text', 0), '240');
    assert.equal(at(c, 's/bd/ro', 'props.text', 1), '120');
    assert.equal(at(c, 's/bd/ro', 'props.text', 2), '0');
});

test('the readout holds its AUTHORED text before the count begins', () => {
    // The trap `seedChannel` exists for: a discrete track with no earlier key
    // holds its first key's value backwards to t=0, so a readout whose count
    // starts at 3s would otherwise show the counted value from frame one.
    const c = compileFilm(film([
        { target: 'bd', part: 'ro', do: 'count', at: 3, for: 1,
          from: 7, to: 9, decimals: 0, ease: 'linear' },
    ]), { assets: null });
    assert.equal(at(c, 's/bd/ro', 'props.text', 0), 'd = 0');
    assert.equal(at(c, 's/bd/ro', 'props.text', 2.9), 'd = 0');
    assert.equal(at(c, 's/bd/ro', 'props.text', 4), '9');
});

// ---------------------------------------------------------------------------
// What it costs
// ---------------------------------------------------------------------------

test('a count costs one key per VISIBLE value, not one per frame', () => {
    // Nought to five at no decimal places over two seconds at 24fps: 48
    // samples, but only six strings a viewer can ever read.
    const c = compileFilm(film([
        { target: 'bd', part: 'ro', do: 'count', at: 0, for: 2,
          from: 0, to: 5, decimals: 0, ease: 'linear' },
    ]), { assets: null });
    const keys = track(c, 's/bd/ro', 'props.text').keys.length;
    assert.ok(keys <= 7, `expected at most 7 keys, got ${keys}`);
    assert.ok(keys >= 6, `expected every distinct value to be keyed, got ${keys}`);
});

test('more decimals buys more keys, and is capped at the frame rate', () => {
    const c = compileFilm(film([
        { target: 'bd', part: 'ro', do: 'count', at: 0, for: 2,
          from: 0, to: 5, decimals: 3, ease: 'linear' },
    ]), { assets: null });
    const keys = track(c, 's/bd/ro', 'props.text').keys.length;
    // 2s at 24fps is 48 samples plus the seed and the endpoint. Three
    // decimals makes every one of them distinct, and nothing beyond the
    // frame rate is ever sampled -- a key between two frames cannot be seen.
    assert.ok(keys <= 51, `sampling went past the frame rate: ${keys} keys`);
    assert.ok(keys >= 45, `expected ~one key per frame, got ${keys}`);
});

test('`step` overrides the interval, for a readout that ticks', () => {
    const c = compileFilm(film([
        { target: 'bd', part: 'ro', do: 'count', at: 0, for: 2,
          from: 0, to: 5, decimals: 2, step: 0.5, ease: 'linear' },
    ]), { assets: null });
    const keys = track(c, 's/bd/ro', 'props.text').keys.length;
    // Four intervals: five samples, plus the seed.
    assert.ok(keys <= 6, `expected a ticking readout, got ${keys} keys`);
    assert.equal(at(c, 's/bd/ro', 'props.text', 0.5), '1.25');
});

// ---------------------------------------------------------------------------
// The two ways it could be wrong and say nothing
// ---------------------------------------------------------------------------

test('a count ENDS on its destination even when the easing does not', () => {
    // `smooth` reaches 1 at u=1 so this would pass by luck; the guard exists
    // so that a future ease which overshoots or undershoots still lands on
    // the number the author asked for, rather than near it.
    for (const ease of ['linear', 'smooth', 'bezier']) {
        const c = compileFilm(film([
            { target: 'bd', part: 'ro', do: 'count', at: 0, for: 1.5,
              from: 0, to: 9.9, decimals: 1, ease },
        ]), { assets: null });
        assert.equal(at(c, 's/bd/ro', 'props.text', 1.5), '9.9',
                     `${ease} did not land on its destination`);
    }
});

test('a count with no duration is an instant set', () => {
    const c = compileFilm(film([
        { target: 'bd', part: 'ro', do: 'count', at: 2, from: 0, to: 3,
          decimals: 0 },
    ]), { assets: null });
    assert.equal(at(c, 's/bd/ro', 'props.text', 1.9), 'd = 0');
    assert.equal(at(c, 's/bd/ro', 'props.text', 2), '3');
});

test('the validator accepts a count and all of its options', () => {
    const problems = validateFilm(film([
        { target: 'bd', part: 'ro', do: 'count', at: 0, for: 1, from: 0, to: 5,
          decimals: 2, prefix: 'v = ', suffix: ' px', step: 0.25, ease: 'linear' },
    ]));
    assert.deepEqual(problems.filter((p) => /[Uu]nknown/.test(p.message)), []);
});

test('count leaves every other channel alone', () => {
    // The verb writes exactly one channel on one node. A readout that also
    // nudged a transform would be impossible to use inside a built board.
    const c = compileFilm(film([
        { target: 'bd', part: 'ro', do: 'count', at: 0, for: 1, from: 0, to: 5 },
    ]), { assets: null });
    const touched = c.timeline.tracks
        .filter((t) => t.target === 's/bd/ro').map((t) => t.path);
    assert.deepEqual(touched, ['props.text']);
});

// ---------------------------------------------------------------------------
// `shift` -- a part moved BY an offset
// ---------------------------------------------------------------------------

/**
 * The trap this verb removes: a board part's authored `at` IS its
 * `transform.x`, so `set transform.x` to -170 means "the left edge of the
 * frame", not "170 to the left". It moved an element somewhere plausible
 * rather than somewhere obviously broken, and nothing reported it.
 */
const boardFilm = (actions) => ({
    version: 'jirex.film/1',
    meta: { title: 't', fps: 24, width: 1000, height: 1000 },
    characters: {
        bd: {
            role: 'effect',
            parts: [
                { id: 'ball', parent: null, pivot: [0, 0], at: [690, 960],
                  shape: { kind: 'ellipse', rx: 110, ry: 110 }, fill: '#fff' },
            ],
        },
    },
    scenes: [{
        id: 's', cast: [{ character: 'bd', as: 'bd', at: [0, 0] }],
        shots: [{ id: 'sh', duration: 6, actions }],
    }],
});

test('shift moves a part FROM its authored position, not from zero', () => {
    const c = compileFilm(boardFilm([
        { target: 'bd', part: 'ball', do: 'shift', by: [-170, 0], at: 1, for: 1 },
    ]), { assets: null });
    assert.equal(at(c, 's/bd/ball', 'transform.x', 1), 690);
    assert.equal(at(c, 's/bd/ball', 'transform.x', 2), 520);
});

test('two shifts in a row compose', () => {
    const c = compileFilm(boardFilm([
        { target: 'bd', part: 'ball', do: 'shift', by: [-100, 0], at: 1, for: 1 },
        { target: 'bd', part: 'ball', do: 'shift', by: [-100, 0], at: 3, for: 1 },
    ]), { assets: null });
    assert.equal(at(c, 's/bd/ball', 'transform.x', 2), 590);
    assert.equal(at(c, 's/bd/ball', 'transform.x', 4), 490);
});

test('shift holds the part still before it fires', () => {
    const c = compileFilm(boardFilm([
        { target: 'bd', part: 'ball', do: 'shift', by: [0, -200], at: 3, for: 1 },
    ]), { assets: null });
    assert.equal(at(c, 's/bd/ball', 'transform.y', 0), 960);
    assert.equal(at(c, 's/bd/ball', 'transform.y', 2.9), 960);
    assert.equal(at(c, 's/bd/ball', 'transform.y', 4), 760);
});

test('shift writes only the axes it is given', () => {
    const c = compileFilm(boardFilm([
        { target: 'bd', part: 'ball', do: 'shift', by: [-170, 0], at: 1, for: 1 },
    ]), { assets: null });
    const touched = c.timeline.tracks
        .filter((t) => t.target === 's/bd/ball').map((t) => t.path);
    assert.deepEqual(touched, ['transform.x']);
});

test('the validator accepts shift and its offset', () => {
    const problems = validateFilm(boardFilm([
        { target: 'bd', part: 'ball', do: 'shift', by: [-170, 40], at: 1, for: 1,
          ease: 'smooth' },
    ]));
    assert.deepEqual(problems.filter((p) => /[Uu]nknown/.test(p.message)), []);
});
