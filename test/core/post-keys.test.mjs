/**
 * Keyframeable post, which is what a rack focus is.
 *
 * `buildComposer` built the chain from a declaration once, so every post
 * number was a constant for the life of a film and the one camera move that
 * most reads as photography -- pulling focus from one subject to another
 * inside a held frame -- could not be expressed at all.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    POST_KEYABLE, POST_NODE, applyPostSample, isPostKeyable, normalizePost,
    normalizePostRamp, postChannel, postChannels, samplePostAt,
} from '../../src/core/script/post.js';
import { createTimeline, key, getTrack } from '../../src/core/anim/Timeline.js';
import { trackValueAt } from '../../src/core/anim/Track.js';
import { compileFilm3D } from '../../src/core/script/compile3d.js';

const DOF = { meta: { post: { dof: { focus: 3, aperture: 0.0008, maxblur: 0.01 } } } };

/** The smallest 3D film that compiles, with a post chain and two shots. */
function film(shots, { post = DOF.meta.post } = {}) {
    return {
        meta: { fps: 24, post },
        models: {}, assemblies: {}, cast: [],
        scenes: [{ id: 's', shots }],
    };
}
const compile = (...a) => compileFilm3D(film(...a));

// ------------------------------------------------------------- the guard list

test('the guard list names scalars, and excludes what should not move', () => {
    assert.ok(isPostKeyable('dof', 'focus'), 'the whole point');
    assert.ok(isPostKeyable('bloom', 'strength'));
    assert.ok(isPostKeyable('grade', 'exposure'));
    // Sampling parameters, not look parameters: animating them makes the
    // ambient term swim rather than change in a way an audience reads.
    assert.ok(!isPostKeyable('ssao', 'radius'));
    assert.ok(!isPostKeyable('ssao', 'bias'));
    // Shape, not amount.
    assert.ok(!isPostKeyable('grade', 'grainSize'));
    assert.ok(!isPostKeyable('grade', 'vignetteSoftness'));
    // Triples need three channels; out of scope and deliberately excluded.
    assert.ok(!isPostKeyable('grade', 'lift'));
    assert.ok(!isPostKeyable('grade', 'gamma'));
    assert.deepEqual(POST_KEYABLE.smaa, [], 'smaa has no parameters');
    assert.equal(isPostKeyable('nope', 'focus'), false);
});

test('every keyable parameter is a real parameter of its pass', () => {
    // A guard list that guards a name the pass does not have is worse than no
    // guard list: it makes a typo look supported.
    const chain = normalizePost({ ssao: {}, bloom: {}, dof: {}, grade: {}, smaa: {} });
    for (const p of chain) {
        for (const param of POST_KEYABLE[p.kind]) {
            assert.ok(Object.hasOwn(p, param),
                `${p.kind}.${param} is keyable but normalizePost does not produce it`);
            assert.equal(typeof p[param], 'number',
                `${p.kind}.${param} must be a scalar to be a channel`);
        }
    }
});

test('postChannels covers only the passes the chain actually has', () => {
    const chain = normalizePost({ dof: {} });
    const chans = postChannels(chain);
    assert.deepEqual(chans, ['dof.focus', 'dof.aperture', 'dof.maxblur']);
    assert.equal(postChannel('dof', 'focus'), 'dof.focus');
    assert.deepEqual(postChannels(normalizePost({ smaa: {} })), []);
    assert.deepEqual(postChannels(null), []);
});

// ----------------------------------------------------------------- the ramp

test('a bare number is a hold, not a ramp', () => {
    const r = normalizePostRamp(4.2, { duration: 3, base: 1 });
    assert.deepEqual(r, { from: 4.2, to: 4.2, span: 0, ease: 'linear', held: true });
});

test('`from` defaults to the base, which is what makes a cut a cut', () => {
    const r = normalizePostRamp({ to: 6 }, { duration: 2, base: 2.5 });
    assert.equal(r.from, 2.5, 'a shot inherits where the last one left the lens');
    assert.equal(r.to, 6);
    assert.equal(r.span, 2, 'no `for` means the whole shot');
});

test('a ramp longer than its shot is clamped, and says so', () => {
    const warns = [];
    const r = normalizePostRamp({ to: 6, for: 9 }, {
        duration: 3, base: 1, path: 'p', warn: (m) => warns.push(m) });
    assert.equal(r.span, 3, 'a pull cut off mid-ramp would land on a value nobody asked to see');
    assert.match(warns.join(), /9s in a 3s shot; clamped/);
});

test('a ramp with no `to` and no base is a diagnostic, not a NaN', () => {
    const warns = [];
    assert.equal(normalizePostRamp({ for: 1 }, {
        duration: 2, base: null, warn: (m) => warns.push(m) }), null);
    assert.match(warns.join(), /needs a `to`/);
    assert.equal(normalizePostRamp('deep', { duration: 2, warn: () => {} }), null);
    assert.equal(normalizePostRamp(Number.NaN, { duration: 2, warn: () => {} }), null);
});

// ------------------------------------------------------- applying a sample

test('applying a sample returns a new chain and leaves the old one alone', () => {
    const chain = normalizePost({ dof: { focus: 3 } });
    const next = applyPostSample(chain, { 'dof.focus': 7.5 });
    assert.equal(next[0].focus, 7.5);
    assert.equal(chain[0].focus, 3, 'the declared chain is the baseline and must not be mutated');
});

test('a sample that changes nothing returns the SAME chain, identity included', () => {
    // The renderer uses this to skip the per-frame write entirely.
    const chain = normalizePost({ dof: { focus: 3 } });
    assert.equal(applyPostSample(chain, { 'dof.focus': 3 }), chain);
    assert.equal(applyPostSample(chain, null), chain);
    assert.equal(applyPostSample(chain, { 'bloom.strength': 2 }), chain,
        'a channel for a pass that is not in the chain cannot change it');
    assert.equal(applyPostSample(chain, { 'dof.focus': Number.NaN }), chain);
});

test('applying a sample reads a Map as well as an object', () => {
    const chain = normalizePost({ dof: {} });
    const next = applyPostSample(chain, new Map([['dof.focus', 9]]));
    assert.equal(next[0].focus, 9);
});

// ------------------------------------------------------------- the sampler

test('the sampler returns null for a film that keys no post', () => {
    const timeline = createTimeline({ fps: 24 });
    assert.equal(samplePostAt(timeline, 1, { getTrack, trackValueAt }), null);
    assert.equal(samplePostAt(null, 1, { getTrack, trackValueAt }), null);
    assert.equal(samplePostAt(timeline, 1, {}), null, 'no injected reader, no sample');
});

test('the sampler interpolates a keyed channel', () => {
    const timeline = createTimeline({ fps: 24 });
    key(timeline, POST_NODE, 'dof.focus', 0, 2, { type: 'number', ease: 'linear' });
    key(timeline, POST_NODE, 'dof.focus', 2, 6, { type: 'number' });
    const at = (t) => samplePostAt(timeline, t, { getTrack, trackValueAt })['dof.focus'];
    assert.equal(at(0), 2);
    assert.equal(at(1), 4, 'halfway, linearly');
    assert.equal(at(2), 6);
});

// ------------------------------------------------------- through the compiler

test('`focus` on a shot writes a dof.focus track', () => {
    const { timeline, diagnostics } = compile([
        { shot: 'a', duration: 4, focus: { to: 6.1, for: 1.6, ease: 'smooth' } },
    ]);
    assert.deepEqual(diagnostics.filter((d) => d.severity === 'error'), []);
    const track = getTrack(timeline, POST_NODE, 'dof.focus');
    assert.ok(track, '`focus` is sugar for post.dof.focus and must reach the timeline');
    assert.equal(trackValueAt(track, 0), 3, 'starts at the declared chain value');
    assert.equal(+trackValueAt(track, 1.6).toFixed(4), 6.1, 'arrives on time');
});

test('a pull holds to the end of its shot — the camera bug, not repeated', () => {
    // A ramp with `for: 1.6` in a 4s shot used to write its arrival key at
    // t+1.6 and nothing after, so the track crept towards the NEXT shot's
    // value for the remaining 2.4s. The authored hold has to exist.
    const { timeline } = compile([
        { shot: 'a', duration: 4, focus: { to: 6.1, for: 1.6 } },
        { shot: 'b', duration: 2, focus: { to: 1.0, for: 0.5 } },
    ]);
    const track = getTrack(timeline, POST_NODE, 'dof.focus');
    for (const t of [1.6, 2.5, 3.0, 3.9]) {
        assert.equal(+trackValueAt(track, t).toFixed(4), 6.1,
            `focus crept to ${trackValueAt(track, t)} at t=${t}; the hold is missing`);
    }
    assert.equal(+trackValueAt(track, 4.5).toFixed(4), 1.0, 'and then the next pull lands');
});

test('a shot that says nothing holds, so two pulls do not drift between them', () => {
    const { timeline } = compile([
        { shot: 'a', duration: 2, focus: { to: 8, for: 1 } },
        { shot: 'b', duration: 2 },
        { shot: 'c', duration: 2 },
        { shot: 'd', duration: 2, focus: { to: 2, for: 1 } },
    ]);
    const track = getTrack(timeline, POST_NODE, 'dof.focus');
    for (const t of [2.5, 3.5, 4.5, 5.5]) {
        assert.equal(+trackValueAt(track, t).toFixed(4), 8,
            `shots b and c do not mention focus but it moved to ${trackValueAt(track, t)} at t=${t}`);
    }
    assert.equal(+trackValueAt(track, 7).toFixed(4), 2);
});

test('the general form reaches any keyable parameter', () => {
    const { timeline, diagnostics } = compile([
        { shot: 'a', duration: 2,
          post: { grade: { exposure: { to: 0.4, for: 1 } },
                  bloom: { strength: 1.4 } } },
    ], { post: { bloom: {}, grade: {} } });
    assert.deepEqual(diagnostics.filter((d) => d.severity === 'error'), []);
    assert.equal(+trackValueAt(getTrack(timeline, POST_NODE, 'grade.exposure'), 1).toFixed(4), 0.4);
    // A bare number is a hold, so it is the same value at both ends.
    const b = getTrack(timeline, POST_NODE, 'bloom.strength');
    assert.equal(trackValueAt(b, 0), 1.4);
    assert.equal(trackValueAt(b, 2), 1.4);
});

test('a non-keyable parameter is a diagnostic naming what IS keyable', () => {
    const { diagnostics } = compile([
        { shot: 'a', duration: 2, post: { ssao: { radius: { to: 1 } } } },
    ], { post: { ssao: {}, dof: {} } });
    const m = diagnostics.map((d) => d.message).join('\n');
    assert.match(m, /`ssao\.radius` is not a keyable post parameter/);
    assert.match(m, /keyable: intensity/, 'the diagnostic must say what to use instead');
});

test('keying a pass that is not in the chain is a diagnostic, not silence', () => {
    // An author ramping a number for a pass that was never built would watch
    // the number change and nothing happen.
    const { diagnostics, timeline } = compile([
        { shot: 'a', duration: 2, focus: { to: 6 } },
    ], { post: { bloom: {} } });
    assert.match(diagnostics.map((d) => d.message).join('\n'),
        /`dof\.focus` is keyed but there is no `dof` pass/);
    assert.equal(getTrack(timeline, POST_NODE, 'dof.focus'), undefined);
});

test('an explicit post.dof.focus beats the `focus` shorthand', () => {
    const { timeline } = compile([
        { shot: 'a', duration: 2, focus: { to: 99 }, post: { dof: { focus: { to: 5 } } } },
    ]);
    assert.equal(+trackValueAt(getTrack(timeline, POST_NODE, 'dof.focus'), 2).toFixed(4), 5);
});

test('a film with no post keys writes no post track at all', () => {
    const { timeline } = compile([{ shot: 'a', duration: 2 }]);
    assert.equal(getTrack(timeline, POST_NODE, 'dof.focus'), undefined,
        'films that do not pull focus must pay nothing');
});

test('post is sampled at the exact time, not the hold', async () => {
    // A film on twos holds its DRAWING on twos, not its lens. Quantising the
    // focus to the hold would make a pull travel in 2-frame jumps, which
    // reads as a fault in the render rather than as a camera operator. This
    // is why `__post` is in SMOOTH_TARGETS beside `__camera`.
    const { samplePose } = await import('../../src/core/anim/Evaluator.js');
    const timeline = createTimeline({ fps: 24 });
    timeline.step = 2;                       // the whole film held on twos
    key(timeline, POST_NODE, 'dof.focus', 0, 0, { type: 'number', ease: 'linear' });
    key(timeline, POST_NODE, 'dof.focus', 1, 24, { type: 'number' });
    // `samplePose` hands back a Map of channel -> value per target, which is
    // why `applyPostSample` reads a Map as readily as an object.
    const focusAt = (frame) => samplePose(timeline, frame / 24).get(POST_NODE).get('dof.focus');
    // Frames 4 and 5 are the same HOLD. A quantised lens gives them the same
    // focus; a smooth one does not.
    assert.notEqual(+focusAt(4).toFixed(6), +focusAt(5).toFixed(6),
        'the focus pull is quantised to the hold and will stair-step');
    assert.equal(+focusAt(5).toFixed(4), 5, 'and it is exactly on the ramp');
});
