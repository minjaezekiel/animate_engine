/**
 * Onion skinning for a DRAWN film: which drawings get ghosted.
 *
 * `render/onionSkin.js` picks ghosts at fixed intervals of time, which is
 * right for a 3D shot -- a solid is a continuous function of t. A drawn
 * film is a sequence of drawings held for some number of frames, and the
 * animator's question is the one Toon Boom's markers ask: *show me the two
 * DRAWINGS before this one*. On a shot exposed on twos those are different
 * questions with different answers, and a ghost that lands between drawings
 * is showing something that is never on screen.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ONION_STEPS, isOnionStep, exposureAt, ghostPlan, shotWindow }
    from '../../src/core/anim/onion.js';
import { compileFilm, filmShots } from '../../src/core/script/compile.js';

const F = 1 / 24;
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const times = (plan) => plan.map((g) => +g.time.toFixed(5));

const film = (shots) => ({
    version: 'jirex.film/1',
    meta: { title: 'o', fps: 24, width: 320, height: 180 },
    characters: { box: { parts: [{ id: 'b', shape: { kind: 'rect', w: 10, h: 10 } }] } },
    scenes: [{ id: 's', cast: [{ character: 'box', as: 'box', at: [0, 0] }], shots }],
});
const compiled = (shots) => compileFilm(film(shots));

test('the step list is closed, so a typo is a diagnostic', () => {
    assert.deepEqual(ONION_STEPS, ['drawing', 'frame', 'second']);
    assert.ok(isOnionStep('drawing'));
    assert.ok(!isOnionStep('drawings'));
    assert.throws(() => ghostPlan({ fps: 24 }, { step: 'drawings' }), /unknown onion step/);
});

// ------------------------------------------------------------- on ones

test('on ones a drawing IS a frame, so the two modes agree', () => {
    const c = compiled([{ id: 'a', duration: 2 }]);
    const byDrawing = ghostPlan(c.timeline, { target: 's/box', time: 1, before: 2, after: 2 });
    const byFrame = ghostPlan(c.timeline,
        { target: 's/box', time: 1, before: 2, after: 2, step: 'frame' });
    assert.deepEqual(times(byDrawing), times(byFrame));
    assert.deepEqual(times(byDrawing), [1 - 2 * F, 1 + 2 * F, 1 - F, 1 + F].map((n) => +n.toFixed(5)));
});

// -------------------------------------------------------------- on twos

test('on twos, "two back" is two DRAWINGS back and not two frames', () => {
    const c = compiled([{ id: 'a', duration: 2, step: 2 }]);
    const plan = ghostPlan(c.timeline, { target: 's/box', time: 1, before: 2, after: 2 });
    // The drawing showing at t=1 was exposed on frame 24, and the ones
    // around it on 20, 22, 26, 28.
    assert.deepEqual(times(plan), [20, 28, 22, 26].map((f) => +(f * F).toFixed(5)));
    // Counting in seconds at the same spacing would land on frames 23 and
    // 25 -- drawings the author never exposed.
    const bySecond = ghostPlan(c.timeline,
        { target: 's/box', time: 1, before: 1, after: 1, step: 'second', spacing: F });
    assert.deepEqual(times(bySecond), [23, 25].map((f) => +(f * F).toFixed(5)));
});

test('every ghost lands on a drawing boundary, not between two', () => {
    const c = compiled([{ id: 'a', duration: 4, step: 3 }]);
    for (const g of ghostPlan(c.timeline, { target: 's/box', time: 2.07, before: 3, after: 3 })) {
        const frame = Math.round(g.time * 24);
        assert.equal(frame % 3, 0, `frame ${frame} is not a drawing on threes`);
    }
});

// --------------------------------------------------------- an X-sheet

/**
 * The case a uniform step cannot describe, and the reason `expose` exists:
 * a measured pencil test holds an acting beat four frames and draws the
 * snap nearly on ones. The ghosts have to follow the author's own sheet.
 */
test('an exposure sheet is followed exactly, holds of different lengths and all', () => {
    const c = compiled([{ id: 'a', duration: 2,
                          actions: [{ target: 'box', do: 'expose', sheet: '4 4 2 1 1 2' }] }]);
    const sheet = c.timeline.sheets[0];
    assert.deepEqual(sheet.boundaries.slice(0, 7).map((t) => Math.round(t * 24)),
                     [0, 4, 8, 10, 11, 12, 14]);
    // Showing at t = 12/24: the drawings around it are 10, 11, 14, 18.
    const plan = ghostPlan(c.timeline, { target: 's/box', time: 12 * F, before: 2, after: 2 });
    assert.deepEqual(times(plan), [10, 18, 11, 14].map((f) => +(f * F).toFixed(5)));
});

test('a sheet runs out rather than inventing drawings past its ends', () => {
    const c = compiled([{ id: 'a', duration: 2,
                          actions: [{ target: 'box', do: 'expose', sheet: '6', loop: false }] }]);
    const plan = ghostPlan(c.timeline, { target: 's/box', time: 0, before: 3, after: 0 });
    assert.deepEqual(plan, [], 'nothing precedes the first drawing');
});

test('spacing means "every Nth drawing", for a dense pencil test', () => {
    const c = compiled([{ id: 'a', duration: 2, step: 2 }]);
    const plan = ghostPlan(c.timeline,
        { target: 's/box', time: 1, before: 3, after: 0, spacing: 2 });
    assert.deepEqual(times(plan), [12, 16, 20].map((f) => +(f * F).toFixed(5)));
});

// ------------------------------------------------------------ the cut

/**
 * The defect the film-wide clamp let through. A ghost across a cut is a
 * drawing from another scene: different staging, different camera, nothing
 * an animator can read an arc from.
 */
test('a ghost never crosses a cut', () => {
    const c = compiled([{ id: 'one', duration: 2 }, { id: 'two', duration: 2 }]);
    const shots = filmShots(film([{ id: 'one', duration: 2 }, { id: 'two', duration: 2 }]));
    const justAfter = 2 + 2 * F;
    const loose = ghostPlan(c.timeline,
        { target: 's/box', time: justAfter, before: 3, after: 0, duration: 4 });
    assert.equal(loose.length, 3, 'unclamped, three ghosts -- two of them in the last shot');
    assert.ok(loose.some((g) => g.time < 2), 'and they are across the cut');

    const clamped = ghostPlan(c.timeline, {
        target: 's/box', time: justAfter, before: 3, after: 0,
        within: shotWindow(shots, justAfter),
    });
    assert.equal(clamped.length, 2);
    assert.ok(clamped.every((g) => g.time >= 2));
});

test('shotWindow finds the shot a time falls in, and holds at the end', () => {
    const shots = filmShots(film([{ id: 'one', duration: 2 }, { id: 'two', duration: 3 }]));
    assert.deepEqual(shotWindow(shots, 0), [0, 2]);
    assert.deepEqual(shotWindow(shots, 1.99), [0, 2]);
    assert.deepEqual(shotWindow(shots, 2), [2, 5]);
    assert.deepEqual(shotWindow(shots, 99), [2, 5]);
    assert.equal(shotWindow([], 1), null);
});

// ------------------------------------------------------------- the rest

test('nearest last, so the nearest ghost paints over the further ones', () => {
    const c = compiled([{ id: 'a', duration: 4 }]);
    const plan = ghostPlan(c.timeline, { target: 's/box', time: 2, before: 3, after: 3 });
    const d = plan.map((g) => Math.abs(g.index));
    assert.deepEqual(d, [3, 3, 2, 2, 1, 1], `got ${d.join(',')}`);
});

test('opacity falls off geometrically and may differ per side', () => {
    const c = compiled([{ id: 'a', duration: 4 }]);
    const plan = ghostPlan(c.timeline, {
        target: 's/box', time: 2, before: 2, after: 2,
        opacity: { before: 0.4, after: 0.2 }, falloff: 0.5,
    });
    const by = (side, k) => plan.find((g) => g.side === side && Math.abs(g.index) === k).alpha;
    near(by('before', 1), 0.4);
    near(by('before', 2), 0.2);
    near(by('after', 1), 0.2);
    near(by('after', 2), 0.1);
    // A plain number still means both sides, as it always did.
    const flat = ghostPlan(c.timeline, { target: 's/box', time: 2, before: 1, after: 1 });
    near(flat[0].alpha, flat[1].alpha);
});

test('exposureAt names which of the three hold models it used', () => {
    const ones = compiled([{ id: 'a', duration: 2 }]);
    assert.equal(exposureAt(ones.timeline, 's/box', 1).kind, 'ones');
    const twos = compiled([{ id: 'a', duration: 2, step: 2 }]);
    assert.equal(exposureAt(twos.timeline, 's/box', 1).kind, 'step');
    const sheet = compiled([{ id: 'a', duration: 2,
                              actions: [{ target: 'box', do: 'expose', sheet: '3' }] }]);
    const e = exposureAt(sheet.timeline, 's/box', 1);
    assert.equal(e.kind, 'sheet');
    assert.ok(e.count > 1);
});

/**
 * Ties are broken by SIDE, not by the offset's last bit: on twos the two
 * four-frame ghosts are -0.16666666666666663 and +0.16666666666666674, so
 * sorting on the magnitude let float noise decide which of two overlapping
 * ghosts painted on top.
 */
test('equal-distance ghosts paint in a fixed order, before then after', () => {
    const c = compiled([{ id: 'a', duration: 4, step: 2 }]);
    const plan = ghostPlan(c.timeline, { target: 's/box', time: 1, before: 2, after: 2 });
    assert.deepEqual(plan.map((g) => `${g.side}${Math.abs(g.index)}`),
                     ['before2', 'after2', 'before1', 'after1']);
});

/**
 * One composited ghost frame cannot be on two exposures at once, so with no
 * target the film's blanket step is used. Stated here because the
 * alternative -- silently picking one character's sheet -- would be a
 * reference view that is right for one cast member and wrong for the rest.
 */
test('with no target, the blanket step is used', () => {
    const c = compiled([{ id: 'a', duration: 2, step: 4 }]);
    const plan = ghostPlan(c.timeline, { time: 1, before: 1, after: 1 });
    assert.deepEqual(times(plan), [20, 28].map((f) => +(f * F).toFixed(5)));
});
