/**
 * Drivers: a channel whose value is an expression over other channels.
 *
 * Two things are under test and only one of them is arithmetic. The second
 * is that a film is DATA: a film arrives as JSON, is written by scripts and
 * agents, and is checked into git, so the moment it can name code every film
 * in the repository is an executable. There is no `eval` here and these
 * tests are what says so.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    parseExpression, evalExpression, expressionRefs, compileDriver,
    compileDrivers, applyDrivers, FUNCTIONS,
} from '../../src/core/anim/driver.js';
import { createTimeline, key, getTrack } from '../../src/core/anim/Timeline.js';
import { samplePose } from '../../src/core/anim/Evaluator.js';
import { compileFilm3D } from '../../src/core/script/compile3d.js';

const run = (src, vars = {}) =>
    evalExpression(parseExpression(src), (n) => vars[n]);

test('the arithmetic is arithmetic', () => {
    assert.equal(run('1 + 2 * 3'), 7, 'precedence');
    assert.equal(run('(1 + 2) * 3'), 9);
    assert.equal(run('-4 + 1'), -3, 'unary minus');
    assert.equal(run('10 % 3'), 1);
    assert.equal(run('2 - 3 - 4'), -5, 'left associative, which is where a naive parser fails');
    assert.equal(run('1.5e2'), 150);
    assert.equal(run('clamp(9, 0, 5)'), 5);
    assert.equal(run('lerp(10, 20, 0.25)'), 12.5);
    assert.equal(run('max(1, min(8, 4))'), 4, 'nested calls');
    assert.ok(Math.abs(run('sin(rad(90))') - 1) < 1e-12, 'degrees in, because a film is degrees');
});

test('a channel reference reads the pose, and a missing one reads zero', () => {
    assert.equal(run('car.transform.x * 2', { 'car.transform.x': 3 }), 6);
    assert.equal(run('nothing.at.all + 5', {}), 5, 'a dropped channel loses a relationship, not a render');
    assert.deepEqual(expressionRefs(parseExpression('a.b + c.d * a.b')), ['a.b', 'c.d', 'a.b']);
});

test('nothing that is not arithmetic parses', () => {
    // Each of these would be a hole if this were `eval`.
    for (const src of ['alert(1)', 'globalThis.x()', 'a["b"]', '1; 2', 'a => a',
                       '`x`', 'new Date()', 'process.exit()', '1 +', '', '()']) {
        assert.throws(() => parseExpression(src), undefined, `parsed: ${src}`);
    }
    // A bare identifier is a channel, never a global: it resolves through
    // the lookup or it is zero.
    assert.equal(run('globalThis', {}), 0);
    assert.equal(run('constructor', {}), 0);
    // And a function name is only a function if the table has it.
    assert.ok(!Object.hasOwn(FUNCTIONS, 'constructor'));
});

test('a division by zero is zero, not an Infinity that eats the object', () => {
    // An Infinity reaching a transform makes a NaN matrix and the object
    // vanishes with no error -- the same silent failure as `normalScale`.
    assert.equal(run('1 / 0'), 0);
    assert.equal(run('5 % 0'), 0);
    assert.ok(Number.isFinite(run('sqrt(-1) + 1')), 'and a NaN out of a function is zero');
});

test('drivers resolve in order, so a chain works', () => {
    const pose = new Map([['car', new Map([['transform.x', 2]])]]);
    const drivers = [
        compileDriver({ target: 'wheel', path: 'transform.rot', expr: 'car.transform.x * 90' }).driver,
        compileDriver({ target: 'hub', path: 'transform.rot', expr: 'wheel.transform.rot / 2' }).driver,
    ];
    applyDrivers(drivers, pose, { time: 0 });
    assert.equal(pose.get('wheel').get('transform.rot'), 180);
    assert.equal(pose.get('hub').get('transform.rot'), 90, 'a later driver sees an earlier one');
});

test('`t` is the clock, which is procedural animation with no keys', () => {
    const d = compileDriver({ target: 'fan', path: 'transform.rot', expr: 't * 720' }).driver;
    const pose = new Map();
    applyDrivers([d], pose, { time: 1.5 });
    assert.equal(pose.get('fan').get('transform.rot'), 1080);
});

test('a driver is evaluated by samplePose, after the animation it reads', () => {
    const timeline = createTimeline({ fps: 24 });
    key(timeline, 'car', 'transform.x', 0, 0, { type: 'number', ease: 'linear' });
    key(timeline, 'car', 'transform.x', 2, 4, { type: 'number', ease: 'linear' });
    compileDrivers([{ target: 'wheel', path: 'transform.rot', expr: 'car.transform.x * -114.6' }],
                   timeline);
    const at = (t) => samplePose(timeline, t).get('wheel').get('transform.rot');
    assert.ok(Math.abs(at(0) - 0) < 1e-9);
    assert.ok(Math.abs(at(1) - (2 * -114.6)) < 1e-9, 'half way along is half the rotation');
    assert.ok(Math.abs(at(2) - (4 * -114.6)) < 1e-9);
    // Hand-keying the same relationship must agree exactly, which is the
    // whole claim: the driver is the sum, written down.
    const hand = createTimeline({ fps: 24 });
    key(hand, 'wheel', 'transform.rot', 0, 0, { type: 'number', ease: 'linear' });
    key(hand, 'wheel', 'transform.rot', 2, 4 * -114.6, { type: 'number', ease: 'linear' });
    for (let f = 0; f <= 48; f++) {
        const t = f / 24;
        const a = samplePose(timeline, t).get('wheel').get('transform.rot');
        const b = samplePose(hand, t).get('wheel').get('transform.rot');
        assert.ok(Math.abs(a - b) < 1e-9, `frame ${f}: ${a} vs ${b}`);
    }
});

test('a bad driver is a diagnostic and the film still compiles', () => {
    const film = {
        drivers: [{ target: 'a', path: 'transform.y', expr: '1 +' },
                  { target: 'b', path: 'transform.y', expr: 'ghost.transform.x' },
                  { target: 'c', expr: '1' }],
        assemblies: { a: { parts: [{ id: 'p', geometry: { kind: 'cube' } }] } },
        cast: [{ assembly: 'a', as: 'thing' }],
        scenes: [{ id: 's', shots: [{ id: 'one', duration: 1 }] }],
    };
    const c = compileFilm3D(film);
    assert.equal(c.timeline.drivers.length, 1, 'only the parseable one survives');
    const messages = c.diagnostics.map((d) => d.message).join(' | ');
    assert.match(messages, /expected a number/);
    assert.match(messages, /no track writes/, 'a driver reading nothing is worth saying');
    assert.match(messages, /needs a `target` and a `path`/);
});

test('both compilers read the same drivers block', async () => {
    // The standing structural defect in this repo is two compilers sharing a
    // vocabulary and not a table. A driver is arithmetic over channels and
    // neither path owns it, so this is one function called twice.
    const { compileFilm } = await import('../../src/core/script/compile.js');
    const film2d = {
        drivers: [{ target: 'dial', path: 'transform.rot', expr: 't * 36' }],
        scenes: [{ id: 's', shots: [{ id: 'one', duration: 1 }] }],
    };
    const c = compileFilm(film2d);
    assert.equal(c.timeline.drivers.length, 1);
    assert.equal(samplePose(c.timeline, 2).get('dial').get('transform.rot'), 72);
});
