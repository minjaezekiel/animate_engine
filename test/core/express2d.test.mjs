/**
 * `express` on the 2D path.
 *
 * The gap, in the verb table's own words until Phase 64: *"the cast entry's
 * `expression`, which is chosen per shot and cannot change mid-shot."* A
 * character could be angry for a whole shot, or cut to another shot to stop
 * being angry. Acting does not work that way -- the beat lands on a line,
 * not on an edit.
 *
 * Nothing new was needed. The tests below check the two things that make
 * that true: that the key lands on the channel the swap pass reads, and that
 * the swap pass then changes the GEOMETRY -- because a track nobody reads is
 * exactly what this verb's absence looked like from the outside.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compileFilm } from '../../src/core/script/compile.js';
import { applySwapSets } from '../../src/core/scene/swapSets.js';
import { samplePose, applyPose, createPoseBaseline, resetPose } from '../../src/core/anim/Evaluator.js';
import { supports, verbDiagnostic } from '../../src/core/script/verbs.js';

const film = (actions, extra = {}) => ({
    version: 'jirex.film/1',
    meta: { title: 'express', fps: 24, width: 320, height: 180 },
    characters: { host: { generate: { build: 'slim' }, proportions: { height: 150 },
                          ...extra } },
    scenes: [{
        id: 's', cast: [{ character: 'host', as: 'host', at: [160, 170] }],
        shots: [{ id: 'a', duration: 4, actions }],
    }],
});

/**
 * Pose the scene at `t` and run the swap pass, as a renderer's frame does.
 *
 * The baseline is taken ONCE per film and cached, because `createPoseBaseline`
 * snapshots whatever the props currently hold -- taking it again after a swap
 * would record the swapped geometry as the rest state.
 */
const baselines = new WeakMap();
function at(compiled, t) {
    let baseline = baselines.get(compiled.scene);
    if (!baseline) baselines.set(compiled.scene,
                                 baseline = createPoseBaseline(compiled.scene, compiled.timeline));
    resetPose(compiled.scene, baseline);
    applyPose(compiled.scene, samplePose(compiled.timeline, t));
    applySwapSets(compiled.scene);
    return compiled.scene;
}

const browOf = (scene) => {
    for (const [id, n] of scene.byId) {
        if (/brow/i.test(id) && n.props?.d) return n.props.d;
    }
    return null;
};

test('the table promises express on both paths now', () => {
    assert.ok(supports('2d', 'express'));
    assert.ok(supports('3d', 'express'));
    assert.equal(verbDiagnostic('express', '2d'), null);
});

test('express writes the channel the cast entry writes', () => {
    const c = compileFilm(film([{ target: 'host', do: 'express',
                                 expression: 'angry', at: 2 }]));
    const root = [...c.scene.byId.keys()].find((id) => id.endsWith('/host'));
    const track = c.timeline.tracks.find((t) => t.target === root
                                                && t.path === 'props.expression');
    assert.ok(track, 'a props.expression track exists on the cast root');
    assert.equal(track.type, 'discrete');
});

/**
 * The trap `seedChannel` exists for: a discrete track with no earlier key
 * reads as its FIRST key at every earlier time, so a character who gets
 * angry at t=2 was angry from frame one. One blink found this once already.
 */
test('and seeds the channel, so the beat does not run backwards to frame one', () => {
    const c = compileFilm(film([{ target: 'host', do: 'express',
                                 expression: 'angry', at: 2 }]));
    const before = browOf(at(c, 0.5));
    const after = browOf(at(c, 2.5));
    assert.ok(before, 'the generated rig has a brow with path data');
    assert.notEqual(before, after, 'the brow geometry changes on the beat');
    assert.equal(before, browOf(at(c, 1.9)), 'and is unchanged up to it');
});

test('the swap reaches the drawing, not just the track', () => {
    const c = compileFilm(film([
        { target: 'host', do: 'express', expression: 'angry', at: 1 },
        { target: 'host', do: 'express', expression: 'delighted', at: 2 },
        { target: 'host', do: 'express', expression: 'neutral', at: 3 },
    ]));
    const seen = [0.5, 1.5, 2.5, 3.5].map((t) => browOf(at(c, t)));
    assert.equal(new Set(seen).size, 3, `three distinct brows, got ${new Set(seen).size}`);
    assert.equal(seen[0], seen[3], 'and neutral comes back to where it started');
});

test('two expressions in one shot -- the thing that could not be said before', () => {
    const c = compileFilm(film([
        { target: 'host', do: 'express', expression: 'surprised', at: 0.5 },
        { target: 'host', do: 'express', expression: 'weary', at: 2.5 },
    ]));
    assert.notEqual(browOf(at(c, 1)), browOf(at(c, 3)));
    assert.equal(c.diagnostics.filter((d) => d.severity === 'warning').length, 0);
});

test('an unknown expression lists what this character can do', () => {
    const c = compileFilm(film([{ target: 'host', do: 'express', expression: 'furious' }]));
    const d = c.diagnostics.find((x) => /Unknown expression "furious"/.test(x.message));
    assert.ok(d, c.diagnostics.map((x) => x.message).join(' | '));
    assert.match(d.message, /angry/);
    assert.match(d.message, /delighted/);
});

test('a character with no face says so, rather than doing nothing', () => {
    const noFace = {
        version: 'jirex.film/1',
        meta: { title: 'x', fps: 24, width: 320, height: 180 },
        characters: { box: { parts: [{ id: 'body', shape: { kind: 'rect', w: 10, h: 10 } }] } },
        scenes: [{ id: 's', cast: [{ character: 'box', as: 'box', at: [0, 0] }],
                   shots: [{ id: 'a', duration: 1,
                             actions: [{ target: 'box', do: 'express', expression: 'angry' }] }] }],
    };
    const c = compileFilm(noFace);
    assert.ok(c.diagnostics.some((d) => /has no face to express with/.test(d.message)));
});

/**
 * Where the two paths honestly differ. 3D blends morph weights over `for`;
 * a drawn expression is a different drawing, and there is nothing between
 * two drawings. Reported rather than silently ignored, which is the whole
 * argument of the verb table.
 */
test('`for` and `amount` are reported on the 2D path, not silently dropped', () => {
    const c = compileFilm(film([{ target: 'host', do: 'express', expression: 'angry',
                                 at: 1, for: 0.4, amount: 0.5 }]));
    assert.ok(c.diagnostics.some((d) => d.severity === 'info'
        && /swap, not a blend/.test(d.message)));
    // It still happens -- the beat is not thrown away over a key that does
    // not apply here.
    assert.notEqual(browOf(at(c, 0.5)), browOf(at(c, 1.5)));
});

test('a hand-authored character expresses with its own set', () => {
    const drawn = {
        version: 'jirex.film/1',
        meta: { title: 'x', fps: 24, width: 320, height: 180 },
        characters: { ink: { parts: [
            { id: 'brow', shape: { kind: 'path', d: 'M0 0 L10 0' },
              swap: { expression: { default: 'calm',
                                    shapes: { calm: { d: 'M0 0 L10 0' },
                                              cross: { d: 'M0 0 L10 -4' } } } } },
        ] } },
        scenes: [{ id: 's', cast: [{ character: 'ink', as: 'ink', at: [0, 0] }],
                   shots: [{ id: 'a', duration: 2, actions: [
                       { target: 'ink', do: 'express', expression: 'cross', at: 1 }] }] }],
    };
    const c = compileFilm(drawn);
    assert.equal(c.diagnostics.filter((d) => d.severity === 'warning').length, 0);
    assert.equal(browOf(at(c, 0.5)), 'M0 0 L10 0');
    assert.equal(browOf(at(c, 1.5)), 'M0 0 L10 -4');
    // And the diagnostic lists ITS vocabulary, not the generated kit's.
    const bad = compileFilm({ ...drawn, scenes: [{ ...drawn.scenes[0],
        shots: [{ id: 'a', duration: 2, actions: [
            { target: 'ink', do: 'express', expression: 'angry' }] }] }] });
    assert.match(bad.diagnostics.find((d) => /Unknown expression/.test(d.message)).message,
                 /calm, cross/);
});
