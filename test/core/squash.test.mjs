import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compileFilm } from '../../src/core/script/compile.js';
import { validateFilm } from '../../src/core/script/validate.js';
import { trackValueAt } from '../../src/core/anim/Track.js';

/**
 * `squash`, `spin`, and the authored-value fallback the three ramping verbs
 * share.
 *
 * All three came out of building the "Game Physics" series, whose cast is
 * billiard balls rather than humanoid rigs -- a ball has no arms, so all of
 * its acting is squash, spin and brow position, and none of the three had
 * engine support. See `docs/31-GAME-PHYSICS-SERIES.md`.
 */

const at = (compiled, target, path, t) => {
    const track = compiled.timeline.tracks.find(
        (x) => x.target === target && x.path === path);
    assert.ok(track, `no track for ${target} ${path}`);
    return trackValueAt(track, t);
};

/** A ball: one part at the origin, one part authored well away from it. */
const film = (actions, { scale = 1 } = {}) => ({
    version: 'jirex.film/1',
    meta: { title: 't', fps: 24, width: 100, height: 100 },
    characters: {
        ball: {
            parts: [
                { id: 'body', parent: null, pivot: [0, 0], at: [0, 0],
                  shape: { kind: 'ellipse', rx: 10, ry: 10 }, fill: '#fff' },
                // Authored 82 units ABOVE the root. This is the part whose
                // position the ramping verbs used to forget.
                { id: 'brow', parent: null, pivot: [0, 0], at: [0, -82],
                  shape: { kind: 'path', d: 'M-5,0 L5,0' }, stroke: '#000' },
            ],
            poses: {
                rest: { brow: { rot: 0, y: -82 } },
                up: { brow: { rot: -0.3, y: -96 } },
            },
        },
    },
    scenes: [{
        id: 's', cast: [{ character: 'ball', as: 'ball', at: [50, 50], scale }],
        shots: [{ id: 'sh', duration: 4, actions }],
    }],
});

// ---------------------------------------------------------------------------
// The authored-value fallback
// ---------------------------------------------------------------------------

test('a pose ramps a part from where it was AUTHORED, not from zero', () => {
    // No prior pose: the only thing that can say where the brow starts is the
    // rig. Before the fix this ramped from defaultChannel('y') = 0, which is
    // the middle of the character, so the brow flew up from the ball's navel.
    const c = compileFilm(film([
        { target: 'ball', do: 'pose', pose: 'up', at: 1, for: 1 },
    ]), { assets: null });
    assert.equal(at(c, 's/ball/brow', 'transform.y', 1), -82);
    assert.equal(at(c, 's/ball/brow', 'transform.y', 2), -96);
});

test('a pose still ramps from a PREVIOUS pose when there is one', () => {
    const c = compileFilm(film([
        { target: 'ball', do: 'pose', pose: 'rest', at: 0 },
        { target: 'ball', do: 'pose', pose: 'up', at: 1, for: 1 },
    ]), { assets: null });
    assert.equal(at(c, 's/ball/brow', 'transform.y', 1), -82);
    assert.equal(at(c, 's/ball/brow', 'transform.y', 2), -96);
});

test('rot and the scales keep their old defaults, so no existing film moves', () => {
    // Every pose channel in the repo before this change was `rot`, `sx`, `sy`
    // or `y` on a part at the origin. For all of those the authored value and
    // the channel default agree -- which is why the fix is output-identical.
    const c = compileFilm(film([
        { target: 'ball', do: 'pose', pose: 'up', at: 1, for: 1 },
    ]), { assets: null });
    assert.equal(at(c, 's/ball/brow', 'transform.rot', 1), 0);
});

// ---------------------------------------------------------------------------
// squash
// ---------------------------------------------------------------------------

test('squash widens and flattens about the cast scale, then returns to it', () => {
    const c = compileFilm(film([
        { target: 'ball', do: 'squash', at: 1, for: 0.1, amount: 0.2, back: 0.2 },
    ], { scale: 2 }), { assets: null });
    // Base is the CAST SCALE, not 1: this is the arithmetic an author had to
    // do by hand, and getting it wrong resized the character permanently.
    assert.equal(at(c, 's/ball', 'transform.sx', 1), 2);
    assert.equal(at(c, 's/ball', 'transform.sx', 1.1), 2 * 1.2);
    assert.equal(at(c, 's/ball', 'transform.sy', 1.1), 2 / 1.2);
    assert.equal(at(c, 's/ball', 'transform.sx', 1.3), 2);
    assert.equal(at(c, 's/ball', 'transform.sy', 1.3), 2);
});

test('squash conserves area, so it reads as one object deforming', () => {
    const c = compileFilm(film([
        { target: 'ball', do: 'squash', at: 1, for: 0.1, amount: 0.5 },
    ]), { assets: null });
    const sx = at(c, 's/ball', 'transform.sx', 1.1);
    const sy = at(c, 's/ball', 'transform.sy', 1.1);
    assert.ok(Math.abs(sx * sy - 1) < 1e-9, `area ${sx * sy} should be 1`);
});

test('a negative amount stretches instead of squashing', () => {
    const c = compileFilm(film([
        { target: 'ball', do: 'squash', at: 1, for: 0.1, amount: -0.25 },
    ]), { assets: null });
    assert.ok(at(c, 's/ball', 'transform.sx', 1.1) < 1);
    assert.ok(at(c, 's/ball', 'transform.sy', 1.1) > 1);
});

test('squash holds its base before it fires, instead of ramping from frame one', () => {
    // The `seedChannel` trap: a key at t=1 with nothing before it interpolates
    // from t=0, so the ball would be mid-squash from the first frame.
    const c = compileFilm(film([
        { target: 'ball', do: 'squash', at: 2, for: 0.1, amount: 0.3 },
    ], { scale: 1.5 }), { assets: null });
    assert.equal(at(c, 's/ball', 'transform.sx', 0), 1.5);
    assert.equal(at(c, 's/ball', 'transform.sx', 1.9), 1.5);
});

test('squash can target a part rather than the whole character', () => {
    const c = compileFilm(film([
        { target: 'ball', do: 'squash', part: 'body', at: 1, for: 0.1, amount: 0.2 },
    ]), { assets: null });
    assert.equal(at(c, 's/ball/body', 'transform.sx', 1.1), 1.2);
});

// ---------------------------------------------------------------------------
// spin
// ---------------------------------------------------------------------------

test('spin turns a whole number of revolutions, linearly', () => {
    const c = compileFilm(film([
        { target: 'ball', do: 'spin', part: 'body', at: 0, for: 2, turns: 3 },
    ]), { assets: null });
    const full = Math.PI * 2;
    assert.ok(Math.abs(at(c, 's/ball/body', 'transform.rot', 2) - 3 * full) < 1e-9);
    // Linear: halfway through the time is halfway through the rotation. With
    // `smooth` this would lag, which on a rolling ball reads as a stutter.
    assert.ok(Math.abs(at(c, 's/ball/body', 'transform.rot', 1) - 1.5 * full) < 1e-9);
});

test('a second spin continues from the first instead of snapping back', () => {
    const c = compileFilm(film([
        { target: 'ball', do: 'spin', part: 'body', at: 0, for: 1, turns: 1 },
        { target: 'ball', do: 'spin', part: 'body', at: 1, for: 1, turns: 1 },
    ]), { assets: null });
    const full = Math.PI * 2;
    assert.ok(Math.abs(at(c, 's/ball/body', 'transform.rot', 2) - 2 * full) < 1e-9);
});

test('negative turns spin the other way', () => {
    const c = compileFilm(film([
        { target: 'ball', do: 'spin', part: 'body', at: 0, for: 1, turns: -2 },
    ]), { assets: null });
    assert.ok(at(c, 's/ball/body', 'transform.rot', 1) < 0);
});

// ---------------------------------------------------------------------------
// Both verbs are known to the validator
// ---------------------------------------------------------------------------

test('squash and spin validate clean, options and all', () => {
    const problems = validateFilm(film([
        { target: 'ball', do: 'squash', at: 1, for: 0.1, amount: 0.2, back: 0.3 },
        { target: 'ball', do: 'spin', part: 'body', at: 1, for: 1, turns: 2 },
    ]));
    assert.deepEqual(problems.filter((p) => /Unknown/.test(p.message)), []);
});

// ---------------------------------------------------------------------------
// Swap channels seed from their own default
// ---------------------------------------------------------------------------

/** An eye that is open by default and blinks once, late. */
const blinker = (blinkAt) => ({
    version: 'jirex.film/1',
    meta: { title: 't', fps: 24, width: 100, height: 100 },
    characters: {
        ball: {
            parts: [{
                id: 'eye', parent: null, pivot: [0, 0], at: [0, 0],
                shape: { kind: 'ellipse', rx: 30, ry: 34 }, fill: '#111',
                swap: { lid: { default: 'open', shapes: {
                    open: { kind: 'ellipse', rx: 30, ry: 34 },
                    closed: { kind: 'ellipse', rx: 30, ry: 5 },
                } } },
            }],
        },
    },
    scenes: [{
        id: 's', cast: [{ character: 'ball', as: 'ball', at: [50, 50] }],
        shots: [{
            id: 'sh', duration: 10,
            actions: [
                { target: 'ball', do: 'set', part: 'eye', channel: 'props.lid',
                  value: 'closed', at: blinkAt, ease: 'step' },
                { target: 'ball', do: 'set', part: 'eye', channel: 'props.lid',
                  value: 'open', at: blinkAt + 0.11, ease: 'step' },
            ],
        }],
    }],
});

test('an eye is OPEN before its first blink, not closed from frame one', () => {
    // A discrete track holds its first key's value backwards in time, so
    // without a seed at t=0 the eye was shut for the 6.8 seconds before it
    // first blinked -- and nothing reported it, because the film is valid.
    const c = compileFilm(blinker(6.8), { assets: null });
    assert.equal(at(c, 's/ball/eye', 'props.lid', 0), 'open');
    assert.equal(at(c, 's/ball/eye', 'props.lid', 3), 'open');
    assert.equal(at(c, 's/ball/eye', 'props.lid', 6.85), 'closed');
    assert.equal(at(c, 's/ball/eye', 'props.lid', 7.5), 'open');
});

test('the seed comes from swapDefaults, which is where a swap keeps it', () => {
    // `swapProps` deliberately does NOT stamp the default onto props[channel]
    // -- that would break `view` inheritance down the part tree. So the seed
    // has to read swapDefaults, and this pins that it does.
    const c = compileFilm(blinker(2), { assets: null });
    const node = c.scene.get('s/ball/eye');
    assert.equal(node.props.lid, undefined, 'default must not be stamped on props');
    assert.equal(node.props.swapDefaults.lid, 'open');
    assert.equal(at(c, 's/ball/eye', 'props.lid', 0), 'open');
});
