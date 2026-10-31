import test from 'node:test';
import assert from 'node:assert/strict';

import { drawShape } from '../../src/backends/canvas2d/shapes.js';
import { RecordingContext, RecordingPath2D } from '../../src/backends/canvas2d/RecordingContext.js';
import { compileFilm } from '../../src/core/script/compile.js';
import { samplePose, applyPose } from '../../src/core/anim/Evaluator.js';

/**
 * `props.flow` is one scalar added to the dash offset, which is what makes a
 * river move. See docs/25-FLOW.md.
 *
 * The thing these tests have to be able to see is the dash OFFSET: a still
 * river and a flowing one set an identical dash pattern and differ only
 * there. `RecordingContext` records it on `stroke` when non-zero for exactly
 * that reason.
 */
const draw = (props) => {
    const ctx = new RecordingContext({ width: 1080, height: 1920 });
    drawShape(ctx, { kind: 'path', props: { d: 'M0,0 L500,0', stroke: '#4aa3d8', ...props } },
              { Path2DImpl: RecordingPath2D, alpha: 1 });
    return ctx.calls;
};

const dashOf = (calls) => calls.find(([op]) => op === 'setLineDash')?.slice(1) ?? null;
const offsetOf = (calls) => calls.find(([op]) => op === 'lineDashOffset')?.[1] ?? 0;

// ---------------------------------------------------------------------------
// It must change nothing that already worked
// ---------------------------------------------------------------------------

test('no flow and no trim: a plain stroke, no dash at all', () => {
    const calls = draw({});
    assert.equal(dashOf(calls), null, 'an undashed line must not acquire a dash array');
    assert.equal(offsetOf(calls), 0);
});

test('trim alone behaves exactly as before: one dash covering the path', () => {
    const calls = draw({ trim: { start: 0, end: 0.4 } });
    assert.deepEqual(dashOf(calls), [0.4 * 8000, 8000],
        'the default length is still 8000, so one dash covers the shape');
    assert.equal(offsetOf(calls), 0);
});

test('trim with a start offsets as before, with no flow term', () => {
    const calls = draw({ trim: { start: 0.25, end: 0.5, length: 400 } });
    assert.deepEqual(dashOf(calls), [0.25 * 400, 400]);
    assert.equal(offsetOf(calls), -0.25 * 400, 'start * length, unchanged');
});

test('a full-length trim with no flow still skips the dash machinery', () => {
    const calls = draw({ trim: { start: 0, end: 1 } });
    assert.equal(dashOf(calls), null);
});

// ---------------------------------------------------------------------------
// What flow adds
// ---------------------------------------------------------------------------

test('flow with no trim dashes anyway, on a short default period', () => {
    const calls = draw({ flow: 0 });
    assert.deepEqual(dashOf(calls), [0.25 * 160, 160],
        'a declared flow defaults to a repeating pattern, not a single dash');
});

test('flow of zero still dashes: the pattern must not vanish once a cycle', () => {
    // A flowing part passes through exactly 0 at every loop boundary. Keying
    // the defaults off the VALUE rather than off the declaration would make
    // that one frame draw solid while its neighbours dashed.
    const still = draw({ flow: 0, trim: { end: 0.3, length: 200 } });
    const moving = draw({ flow: 0.01, trim: { end: 0.3, length: 200 } });
    assert.deepEqual(dashOf(still), dashOf(moving),
        'the dash pattern must be continuous across flow = 0');
});

test('flow of 1 advances by exactly one dash period, for any span', () => {
    // The period is the on-dash plus the off-dash, length * (span + 1).
    // Scaling by `length` alone was the first implementation and it was out
    // by a factor of (span + 1), so a "seamless" loop jumped every cycle.
    for (const [end, length] of [[0.25, 160], [0.5, 200], [0.1, 400], [0.75, 80]]) {
        const span = end;
        const period = length * (span + 1);
        const at0 = offsetOf(draw({ flow: 0, trim: { end, length } }));
        const at1 = offsetOf(draw({ flow: 1, trim: { end, length } }));
        assert.equal(+(at0 - at1).toFixed(4), +period.toFixed(4),
            `one unit of flow must be one period at end=${end}, length=${length}`);
    }
});

test('flow and flow + 1 draw identical pixels, so a loop has no seam', () => {
    const trim = { end: 0.3, length: 180 };
    const a = draw({ flow: 0.42, trim });
    const b = draw({ flow: 1.42, trim });
    const c = draw({ flow: 5.42, trim });
    const period = 180 * 1.3;
    // The offsets differ by whole periods, which Canvas resolves to the same
    // dash phase. Asserted as the arithmetic, since the recorder keeps the
    // raw offset rather than the reduced one.
    assert.equal(+((offsetOf(a) - offsetOf(b)) / period).toFixed(6), 1);
    assert.equal(+((offsetOf(a) - offsetOf(c)) / period).toFixed(6), 5);
    assert.deepEqual(dashOf(a), dashOf(b));
});

test('increasing flow moves the pattern along the path, not against it', () => {
    // lineDashOffset is negated, so a MORE negative offset is further along.
    const a = offsetOf(draw({ flow: 0, trim: { end: 0.3, length: 200 } }));
    const b = offsetOf(draw({ flow: 0.5, trim: { end: 0.3, length: 200 } }));
    assert.ok(b < a, `flow must advance in the path's drawn direction (${a} -> ${b})`);
});

test('flow composes with an authored trim rather than replacing it', () => {
    // Same SPAN on both, so the flow term is identical and only the `start`
    // term can account for the difference.
    const withStart = offsetOf(draw({ flow: 0.5, trim: { start: 0.1, end: 0.5, length: 200 } }));
    const withoutStart = offsetOf(draw({ flow: 0.5, trim: { start: 0, end: 0.4, length: 200 } }));
    assert.equal(+(withoutStart - withStart).toFixed(4), 0.1 * 200,
        'a trimmed line can also flow; the two terms add');
});

test('flow works on an ellipse too, not only a path', () => {
    const ctx = new RecordingContext({ width: 320, height: 180 });
    drawShape(ctx, { kind: 'ellipse', props: { rx: 50, ry: 50, stroke: '#fff', flow: 0.5 } },
              { Path2DImpl: RecordingPath2D, alpha: 1 });
    assert.ok(dashOf(ctx.calls), 'a flowing ring is a legitimate shape');
    assert.ok(offsetOf(ctx.calls) < 0);
});

// ---------------------------------------------------------------------------
// It has to survive the compiler and the interpolator
// ---------------------------------------------------------------------------

const riverFilm = (actions) => ({
    version: 'jirex.film/1',
    meta: { title: 'flow', width: 1080, height: 1920, fps: 24 },
    characters: {
        river: {
            role: 'effect',
            parts: [{ id: 'streak', shape: { kind: 'path', d: 'M0,0 L900,0' },
                      stroke: '#4aa3d8', strokeWidth: 8,
                      trim: { end: 0.25, length: 160 }, flow: 0 }],
        },
    },
    scenes: [{
        id: 's1', cast: [{ as: 'river', character: 'river', at: [540, 900] }],
        shots: [{ duration: 4, actions }],
    }],
});

test('an authored flow survives compilation onto the node', () => {
    const { scene, diagnostics } = compileFilm(riverFilm([]), { assets: null });
    assert.equal(diagnostics.filter((d) => d.severity === 'error').length, 0,
        diagnostics.map((d) => d.message).join('; '));
    const node = [...scene.byId.values()].find((n) => n.name === 'streak');
    assert.ok(node, 'the streak part must exist');
    assert.equal(node.props.flow, 0, 'flow must be copied out of the part, not dropped');
    assert.deepEqual(node.props.trim, { end: 0.25, length: 160 });
});

test('flow INTERPOLATES, which is the thing props.trim.offset silently could not', () => {
    // `applyPose` is shallow by design: `set props.trim.offset` wrote a
    // property literally named "trim.offset" that nothing read -- no error,
    // no diagnostic, no moving water. A scalar is the whole fix.
    const film = riverFilm([
        { target: 'river', do: 'set', part: 'streak', channel: 'props.flow',
          value: 0, at: 0, ease: 'linear' },
        { target: 'river', do: 'set', part: 'streak', channel: 'props.flow',
          value: 4, at: 4, ease: 'linear' },
    ]);
    const { scene, timeline } = compileFilm(film, { assets: null });
    const at = (t) => {
        applyPose(scene, samplePose(timeline, t));
        return [...scene.byId.values()].find((n) => n.name === 'streak').props.flow;
    };
    assert.equal(at(0), 0);
    assert.equal(+at(2).toFixed(3), 2, 'halfway through must be halfway along');
    assert.equal(+at(3).toFixed(3), 3);
    assert.notEqual(at(1), at(2), 'a held value would mean still water');
});

test('a flow ramp reaches the renderer as a moving dash offset', () => {
    const film = riverFilm([
        { target: 'river', do: 'set', part: 'streak', channel: 'props.flow',
          value: 0, at: 0, ease: 'linear' },
        { target: 'river', do: 'set', part: 'streak', channel: 'props.flow',
          value: 2, at: 4, ease: 'linear' },
    ]);
    const { scene, timeline } = compileFilm(film, { assets: null });
    const offsetAt = (t) => {
        applyPose(scene, samplePose(timeline, t));
        const node = [...scene.byId.values()].find((n) => n.name === 'streak');
        const ctx = new RecordingContext({ width: 1080, height: 1920 });
        drawShape(ctx, { kind: 'path', props: node.props },
                  { Path2DImpl: RecordingPath2D, alpha: 1 });
        return offsetOf(ctx.calls);
    };
    const a = offsetAt(0), b = offsetAt(1), c = offsetAt(2);
    assert.ok(c < b && b < a, `the water must keep moving (${a}, ${b}, ${c})`);
    // Two periods over four seconds: one period per two seconds.
    assert.equal(+((a - c) / (160 * 1.25)).toFixed(3), 1,
        'half the ramp must be exactly one dash period');
});
