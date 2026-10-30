import test from 'node:test';
import assert from 'node:assert/strict';

import { drawShape } from '../../src/backends/canvas2d/shapes.js';
import { RecordingContext, RecordingPath2D } from '../../src/backends/canvas2d/RecordingContext.js';
import { compileFilm } from '../../src/core/script/compile.js';

/**
 * Canvas has no word wrap: `fillText` draws one line and runs off the edge.
 * A narration line longer than the picture was therefore cut off at BOTH
 * ends, silently, which for a subtitle means the viewer loses the sentence
 * that carries the teaching.
 *
 * `RecordingContext.measureText` is 6px per character, so the widths here are
 * in characters, not real glyphs -- which is the right granularity to assert
 * the wrapping LOGIC without pinning a font.
 */
const draw = (props, ctx = new RecordingContext({ width: 1080, height: 1920 })) => {
    drawShape(ctx, { kind: 'text', props }, { Path2DImpl: RecordingPath2D, alpha: 1 });
    return ctx.calls.filter(([op]) => op === 'fillText');
};

test('without maxWidth, text is drawn exactly as before: one call at the anchor', () => {
    const calls = draw({ text: 'a fairly long line of narration', fill: '#fff' });
    assert.equal(calls.length, 1);
    assert.equal(calls[0][1], 'a fairly long line of narration');
    assert.equal(calls[0][3], 0, 'on the authored baseline');
});

test('a long line wraps into several, inside the box', () => {
    const text = 'In an old mountain belt the roads are faults and shear zones: '
        + 'fractures kilometres deep where the crust has slipped past itself.';
    const calls = draw({ text, fill: '#fff', maxWidth: 300 });   // 50 characters
    assert.ok(calls.length >= 3, `expected several lines, got ${calls.length}`);
    for (const [, line] of calls) {
        assert.ok(line.length * 6 <= 300 || !line.includes(' '),
            `line overflows the box: "${line}"`);
    }
    assert.equal(calls.map(([, l]) => l).join(' '), text.replace(/\s+/g, ' '),
        'wrapping must not lose or reorder a word');
});

test('the block grows upward, so the last line stays on the baseline', () => {
    const calls = draw({ text: 'one two three four five six seven eight nine ten',
                         fill: '#fff', maxWidth: 120, font: '600 40px x' });
    const ys = calls.map(([, , , y]) => y);
    assert.equal(ys[ys.length - 1], 0, 'last line sits on the anchor');
    assert.ok(ys[0] < 0, 'earlier lines go up, not down off the frame');
    // Default line height is 1.25x the font size.
    assert.equal(ys[1] - ys[0], 50);
});

test('an explicit newline breaks regardless of width', () => {
    const calls = draw({ text: 'crust\n0.004', fill: '#fff' });
    assert.deepEqual(calls.map(([, l]) => l), ['crust', '0.004']);
});

test('a single word wider than the box gets its own line rather than being broken', () => {
    const calls = draw({ text: 'short supercalifragilistic short', fill: '#fff', maxWidth: 60 });
    assert.ok(calls.some(([, l]) => l === 'supercalifragilistic'));
});

test('the stroke is drawn per line too, not just the fill', () => {
    const ctx = new RecordingContext({ width: 1080, height: 1920 });
    drawShape(ctx, { kind: 'text', props: {
        text: 'one two three four five', fill: '#fff', stroke: '#000',
        strokeWidth: 7, maxWidth: 60 } }, { Path2DImpl: RecordingPath2D, alpha: 1 });
    const fills = ctx.calls.filter(([op]) => op === 'fillText').length;
    const strokes = ctx.calls.filter(([op]) => op === 'strokeText').length;
    assert.ok(fills > 1);
    assert.equal(strokes, fills, 'every line needs its outline or it is unreadable');
});

test('a film sets its own subtitle style, and the default wraps inside the frame', () => {
    const film = (meta) => compileFilm({
        version: 'jirex.film/1',
        meta: { title: 't', fps: 24, width: 1080, height: 1920, ...meta },
        characters: {}, scenes: [{ id: 's', shots: [{ id: 'a', duration: 1 }] }],
    }, { assets: null }).scene.get('__subtitle');

    const plain = film({});
    assert.equal(plain.transform.y, 1920 - 64, 'the documented default');
    assert.equal(plain.props.maxWidth, 950, '88% of the frame width');

    const styled = film({ subtitleStyle: { bottomMargin: 375, font: '600 40px X',
                                           maxWidth: 900 } });
    assert.equal(styled.transform.y, 1920 - 375, 'lifted clear of the phone UI rail');
    assert.equal(styled.props.font, '600 40px X');
    assert.equal(styled.props.maxWidth, 900);
    assert.equal(styled.props.fill, '#ffffff', 'unset keys keep the default');
});
