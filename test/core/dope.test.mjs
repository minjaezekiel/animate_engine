import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dopeSheet, formatDope, actionRows, setActionEase, curveSamples,
         clampHandle, isCurved, easeOf, HANDLE_PRESETS, EASE_MARK }
    from '../../src/core/anim/dope.js';
import { createTrack, setKey, trackValueAt } from '../../src/core/anim/Track.js';
import { createTimeline } from '../../src/core/anim/Timeline.js';
import { easeProgress } from '../../src/core/anim/easing.js';
import { compileFilm, filmShots } from '../../src/core/script/compile.js';

function timelineOf(specs) {
    const tl = createTimeline({ fps: 24 });
    for (const [target, path, keys, type] of specs) {
        const t = createTrack({ target, path, type: type ?? 'number' });
        for (const [at, v, ease, h] of keys) setKey(t, at, v, ease ?? 'linear', h);
        tl.tracks.push(t);
    }
    return tl;
}

// ------------------------------------------------------------------ sheet

test('the sheet is ordered by when things happen, not by name', () => {
    const tl = timelineOf([
        ['zeta', 'transform.x', [[2, 0], [3, 1]]],
        ['alpha', 'transform.y', [[0, 0], [1, 1]]],
    ]);
    assert.deepEqual(dopeSheet(tl).rows.map((r) => r.target), ['alpha', 'zeta']);
});

test('a target filter ending in / means "and everything under it"', () => {
    const tl = timelineOf([
        ['s/host', 'transform.x', [[0, 0]]],
        ['s/host/arm', 'transform.rot', [[0, 0]]],
        ['s/hostile', 'transform.x', [[0, 0]]],
        ['s/other', 'transform.x', [[0, 0]]],
    ]);
    const got = dopeSheet(tl, { targets: ['s/host/'] }).rows.map((r) => r.target);
    assert.deepEqual(got, ['s/host/arm']);
    const exact = dopeSheet(tl, { targets: ['s/host'] }).rows.map((r) => r.target);
    assert.deepEqual(exact, ['s/host']);
});

test('a channel filter ending in . is a prefix too', () => {
    const tl = timelineOf([
        ['a', 'transform.x', [[0, 0]]],
        ['a', 'props.alpha', [[0, 0]]],
    ]);
    assert.deepEqual(dopeSheet(tl, { paths: ['transform.'] }).rows.map((r) => r.path),
                     ['transform.x']);
});

test('a time window drops channels with nothing in it, and trims the rest', () => {
    const tl = timelineOf([['a', 'transform.x', [[0, 0], [5, 1], [9, 2]]],
                           ['b', 'transform.y', [[8, 0]]]]);
    const s = dopeSheet(tl, { from: 1, to: 6 });
    assert.equal(s.rows.length, 1);
    assert.deepEqual(s.rows[0].keys.map((k) => k.t), [5]);
});

/**
 * Silent truncation is the one behaviour that would make a dope sheet
 * untrustworthy: an animator looking for a channel and not finding it must
 * be able to tell "it is not keyed" from "it is below the fold".
 */
test('what is left out is counted, not dropped quietly', () => {
    const tl = timelineOf(Array.from({ length: 50 },
        (_, i) => [`n${i}`, 'transform.x', [[i * 0.1, 0]]]));
    const s = dopeSheet(tl, { limit: 10 });
    assert.equal(s.rows.length, 10);
    assert.equal(s.truncated, 40);
    assert.equal(s.tracks, 50);
    assert.equal(s.keys, 50);
});

test('an empty sheet is empty, not a box around zero', () => {
    const s = dopeSheet(createTimeline({ fps: 24 }));
    assert.deepEqual(s.rows, []);
    assert.deepEqual(s.span, [0, 0]);
    assert.equal(formatDope(s), '(no keys in this window)');
});

// ----------------------------------------------------------------- format

test('the shape of a row is the information', () => {
    const tl = timelineOf([['a', 'transform.x', [[0, 0, 'linear'], [5, 1, 'smooth'],
                                                 [10, 2, 'bezier']]]]);
    const text = formatDope(dopeSheet(tl), { width: 21 });
    const row = text.split('\n').find((l) => l.includes('transform.x'));
    const marks = row.slice(row.indexOf('+'));
    assert.equal(marks[0], EASE_MARK.linear);
    assert.equal(marks[10], EASE_MARK.smooth);
    assert.equal(marks[20], EASE_MARK.bezier);
});

test('two keys in one column read as a count, not as one key', () => {
    const tl = timelineOf([['a', 'transform.x', [[0, 0], [0.01, 1], [0.02, 2], [4, 3]]]]);
    const row = formatDope(dopeSheet(tl), { width: 20 })
        .split('\n').find((l) => l.includes('transform.x'));
    assert.match(row, /3/, 'three keys inside one column are reported as 3');
});

test('nothing is drawn outside a channel\'s own key range', () => {
    const tl = timelineOf([['a', 'transform.x', [[4, 0], [6, 1]]],
                           ['b', 'transform.y', [[0, 0], [10, 1]]]]);
    const row = formatDope(dopeSheet(tl), { width: 11 })
        .split('\n').find((l) => l.includes('transform.x'));
    const plot = row.slice(row.length - 11);
    assert.equal(plot[0], ' ', 'a track holds outside its range; a dash would claim it moves');
    assert.equal(plot[10], ' ');
});

test('every segment of a discrete track reads as a hold', () => {
    const tl = timelineOf([['a', 'props.viseme', [[0, 'A', 'smooth'], [4, 'B']], 'discrete']]);
    const row = formatDope(dopeSheet(tl), { width: 11 })
        .split('\n').find((l) => l.includes('props.viseme'));
    const plot = row.slice(row.length - 11);
    assert.equal(plot, '===========', `a viseme does not interpolate, got ${plot}`);
});

test('the ruler labels frames when it is told the rate', () => {
    const tl = timelineOf([['a', 'transform.x', [[0, 0], [2, 1]]]]);
    assert.match(formatDope(dopeSheet(tl), { fps: 24, width: 40 }), /1s\/24f/);
    assert.doesNotMatch(formatDope(dopeSheet(tl), { width: 40 }), /24f/);
});

test('a long name is truncated from the LEFT, so the channel stays readable', () => {
    const tl = timelineOf([['scene1/characters/host/arm/upper', 'transform.rot', [[0, 0]]]]);
    const row = formatDope(dopeSheet(tl), { label: 20, width: 10 }).split('\n')[1];
    assert.match(row, /^…/);
    assert.match(row, /transform\.rot/);
});

// --------------------------------------------------------- authored actions

const film = {
    version: 'jirex.film/1',
    meta: { title: 'd', fps: 24, width: 320, height: 180 },
    characters: { host: { generate: {}, proportions: { height: 150 } } },
    scenes: [{
        id: 's', cast: [{ character: 'host', as: 'host', at: [100, 170] }],
        shots: [
            { id: 'one', duration: 3, actions: [
                { target: 'host', do: 'move', to: [200, 170], at: 0.5, for: 2 }] },
            { id: 'two', duration: 2, actions: [
                { target: 'host', do: 'spin', turns: 1, at: 0.25, ease: 'bezier', h: [0.3, 0, 0.2, 1] },
                { target: 'host', do: 'show', at: 0 }] },
        ],
    }],
};

test('an action row is placed on the FILM clock, not the shot clock', () => {
    const rows = actionRows(film, filmShots(film));
    assert.deepEqual(rows.map((r) => [r.verb, r.start]),
                     [['show', 3], ['move', 0.5], ['spin', 3.25]].sort((a, b) => a[1] - b[1]));
});

test('an action with no `for` runs to the end of its shot, and says so', () => {
    const rows = actionRows(film, filmShots(film));
    const show = rows.find((r) => r.verb === 'show');
    assert.equal(show.open, true);
    assert.equal(show.end, 5);
    const move = rows.find((r) => r.verb === 'move');
    assert.equal(move.open, false);
    assert.equal(move.end, 2.5);
});

test('handles ride along from the authored action', () => {
    const spin = actionRows(film, filmShots(film)).find((r) => r.verb === 'spin');
    assert.equal(spin.ease, 'bezier');
    assert.deepEqual(spin.handles, [0.3, 0, 0.2, 1]);
});

/**
 * The standing rule for this editor: there is no editor-only state, the edit
 * IS the script. So an ease change is a change to the document an agent
 * reads -- which also means it must not leave numbers behind that nothing
 * reads.
 */
test('setting an ease writes the document, and leaves no dead keys in it', () => {
    const a = { target: 'x', do: 'move' };
    setActionEase(a, 'bezier', [0.1, 0.2, 0.3, 0.4]);
    assert.deepEqual(a, { target: 'x', do: 'move', ease: 'bezier', h: [0.1, 0.2, 0.3, 0.4] });
    setActionEase(a, 'linear');
    assert.deepEqual(a, { target: 'x', do: 'move', ease: 'linear' });
    assert.equal('h' in a, false, 'handles nothing reads are removed');
    // `smooth` is the default, so it is stored by omission like `linear` is
    // on a key -- a film should not gain a field for choosing the default.
    setActionEase(a, 'smooth');
    assert.equal('ease' in a, false);
});

test('handles are rounded, because a film is a file people diff', () => {
    const a = {};
    setActionEase(a, 'bezier', [1 / 3, 0, 2 / 3, 1]);
    assert.deepEqual(a.h, [0.333, 0, 0.667, 1]);
});

test('an edited ease reaches the compiled curve', () => {
    const copy = structuredClone(film);
    const move = copy.scenes[0].shots[0].actions[0];
    // The CAST ROOT's x, not the camera's, which also has one.
    const xOf = (c) => trackValueAt(c.timeline.tracks.find(
        (t) => t.target === 's/host' && t.path === 'transform.x'), 1.0);
    const beforeX = xOf(compileFilm(copy));
    setActionEase(move, 'bezier', [0.9, 0, 1, 1]);     // a late, snappy start
    const afterX = xOf(compileFilm(copy));
    assert.notEqual(beforeX, afterX);
    assert.ok(afterX < beforeX, `a late start is behind the default at 1s: ${afterX} vs ${beforeX}`);
});

// ----------------------------------------------------------------- curves

test('a curve starts at 0 and ends at 1, whatever it does between', () => {
    for (const [name, h] of Object.entries(HANDLE_PRESETS)) {
        const pts = curveSamples('bezier', h, 16, easeProgress);
        assert.ok(Math.abs(pts[0][1]) < 1e-6, `${name} starts at 0`);
        assert.ok(Math.abs(pts[16][1] - 1) < 1e-6, `${name} ends at 1`);
    }
});

test('overshoot leaves the unit square, which is the point of it', () => {
    const over = curveSamples('bezier', HANDLE_PRESETS.overshoot, 48, easeProgress);
    assert.ok(Math.max(...over.map(([, v]) => v)) > 1.05, 'it goes past the target');
    const anti = curveSamples('bezier', HANDLE_PRESETS.anticipate, 48, easeProgress);
    assert.ok(Math.min(...anti.map(([, v]) => v)) < -0.05, 'and anticipation pulls back first');
});

/**
 * x is clamped because a timing function must be a function OF TIME: an x
 * outside [0,1] folds the curve back on itself and the solver returns
 * whichever root it lands on, which reads as a jump. y is not clamped,
 * because leaving [0,1] is overshoot.
 */
test('a dragged handle is clamped in x and free in y', () => {
    assert.deepEqual(clampHandle([-0.4, 0.5]), [0, 0.5]);
    assert.deepEqual(clampHandle([1.8, 0.5]), [1, 0.5]);
    assert.deepEqual(clampHandle([0.5, 1.4]), [0.5, 1.4]);
    assert.deepEqual(clampHandle([0.5, -1.2]), [0.5, -1.2]);
    assert.deepEqual(clampHandle([0.5, 99]), [0.5, 3]);
});

test('only a bezier has handles to drag', () => {
    assert.ok(isCurved('bezier'));
    for (const e of ['linear', 'smooth', 'hold', 'step']) assert.ok(!isCurved(e));
});

test('linear is stored by omission, and reads back as linear', () => {
    assert.equal(easeOf({ t: 0, v: 1 }), 'linear');
    assert.equal(easeOf({ t: 0, v: 1, ease: 'smooth' }), 'smooth');
});

/**
 * Forty shots of one character is forty ACTIONS over a handful of channels,
 * which is the shape a real film has and the reason the two halves of this
 * panel are counted separately: an animator asking "what is keyed here" and
 * an animator asking "what did I write" are asking different questions.
 */
test('the two halves scale independently, as a real film makes them', () => {
    const big = structuredClone(film);
    big.scenes[0].shots = Array.from({ length: 40 }, (_, i) => ({
        id: `s${i}`, duration: 1,
        actions: [{ target: 'host', do: 'move', to: [i * 3, 170], at: 0, for: 0.8 }],
    }));
    const c = compileFilm(big);
    assert.equal(actionRows(big, filmShots(big)).length, 40);
    const sheet = dopeSheet(c.timeline);
    // One `move` per shot, all on the same two channels -- so 40 actions and
    // 80 keys land on 2 rows, plus the camera's.
    const root = sheet.rows.filter((r) => r.target === 's/host');
    assert.deepEqual(root.map((r) => r.path).sort(), ['transform.x', 'transform.y']);
    assert.ok(root[0].keys.length >= 40, `${root[0].keys.length} keys on one channel`);
    // The text form stays one line per row plus a header, a blank and a footer.
    assert.equal(formatDope(sheet, { width: 40 }).split('\n').length, sheet.rows.length + 3);
});
