import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizeOverlay, overlayAt, wrapText, subtitleSpans, checkOverlay,
} from '../../src/core/art/overlay.js';

/**
 * A stand-in for `ctx.measureText`: 0.52 em per character, which is close
 * enough to a proportional sans for layout assertions and is exactly
 * reproducible, which `measureText` is not across machines.
 */
const measure = (text, font) => {
    const m = /(\d+(?:\.\d+)?)px/.exec(font);
    return String(text).length * Number(m ? m[1] : 16) * 0.52;
};
const FRAME = { width: 1920, height: 1080, measure };
const at = (p) => ({ x: p[0], y: p[1], behind: false });

test('normalizeOverlay', async (t) => {
    await t.test('drops a bad item with a warning instead of throwing', () => {
        const warns = [];
        const o = normalizeOverlay({ items: [
            { kind: 'label', text: 'no anchor' },
            { kind: 'nonsense', text: 'x' },
            { kind: 'text' },
            { kind: 'text', text: 'held for nothing', for: 0 },
            { kind: 'text', text: 'fine' },
        ] }, (m) => warns.push(m));
        assert.equal(o.items.length, 1);
        assert.equal(warns.length, 4);
    });

    await t.test('carries the design height so pixel sizes can scale', () => {
        const o = normalizeOverlay({ items: [] }, () => {}, { designHeight: 1920 });
        assert.equal(o.designHeight, 1920);
    });
});

test('wrapText breaks greedily and never loses a word', () => {
    const font = '400 20px sans';
    const words = 'one two three four five six seven eight nine ten';
    const lines = wrapText(words, 200, font, measure);
    assert.ok(lines.length > 1);
    assert.equal(lines.join(' '), words);
    for (const l of lines) assert.ok(measure(l, font) <= 200 || l.split(' ').length === 1);
});

test('a word wider than the box overflows rather than being broken mid-word', () => {
    const lines = wrapText('antidisestablishmentarianism', 40, '400 20px sans', measure);
    assert.deepEqual(lines, ['antidisestablishmentarianism']);
});

test('pixel sizes scale with the frame', () => {
    /**
     * Everything positional here is a fraction of the frame and everything
     * typographic is in pixels, so a spec authored for 1080 and rendered at
     * 540 drew type at twice its intended relative size. The staging check
     * renders at 540 and the film at 1080, so the check was measuring a 38px
     * caption as 76 and reporting a subtitle band two lines too deep.
     */
    const o = normalizeOverlay({ items: [{ kind: 'title', text: 'Hi', at: 0, for: 2 }] },
                               () => {}, { designHeight: 1080 });
    const big = overlayAt(o, 1, { ...FRAME, project: () => null });
    const small = overlayAt(o, 1, { width: 960, height: 540, measure, project: () => null });
    const sizeOf = (ops) => Number(/(\d+(?:\.\d+)?)px/.exec(ops.find((x) => x.op === 'text').font)[1]);
    assert.equal(sizeOf(big) / sizeOf(small), 2);
});

test('fades', async (t) => {
    const o = normalizeOverlay({ items: [
        { kind: 'title', text: 'A', at: 1, for: 2, fade: 0.5 }] }, () => {});
    const alphaAt = (t2) => overlayAt(o, t2, { ...FRAME, project: () => null })
        .find((x) => x.op === 'text')?.alpha ?? 0;

    await t.test('are zero outside the window and one in the middle', () => {
        assert.equal(alphaAt(0.9), 0);
        assert.equal(alphaAt(3.1), 0);
        assert.equal(alphaAt(2), 1);
    });

    await t.test('a fade longer than half the life still reaches full', () => {
        // A caption held 0.4s with a 0.3s fade never reached opacity 1,
        // which reads as a flicker rather than as a caption.
        const q = normalizeOverlay({ items: [
            { kind: 'title', text: 'A', at: 0, for: 0.4, fade: 0.3 }] }, () => {});
        const peak = overlayAt(q, 0.2, { ...FRAME, project: () => null })
            .find((x) => x.op === 'text').alpha;
        assert.equal(peak, 1);
    });
});

test('a label behind the camera is dropped, not mirrored', () => {
    /**
     * `Vector3.project` divides by w, and for a point behind the camera w is
     * negative -- so the result comes back mirrored through the frame centre,
     * INSIDE the frame, looking entirely valid. A label on the far side of a
     * globe appeared on the near side pointing at nothing, and no numeric
     * check could have caught it because the numbers were in range.
     */
    const o = normalizeOverlay({ items: [
        { kind: 'label', text: 'Core', anchor: 'x', at: 0, for: 5 }] }, () => {});
    const visible = overlayAt(o, 2, { ...FRAME, project: () => ({ x: 900, y: 500, behind: false }) });
    const behind = overlayAt(o, 2, { ...FRAME, project: () => ({ x: 900, y: 500, behind: true }) });
    assert.ok(visible.length > 0);
    assert.equal(behind.length, 0);
});

test('a label flips to the other side rather than running off the frame', () => {
    /**
     * The side follows the sign of the offset, which is right until a camera
     * move puts the anchor near that edge. The outer-core callout was
     * authored at offset -118 and the shot pushed in until its anchor was
     * 10 px from the left edge, so the label ran from x = -225 to x = 40 --
     * three-quarters off screen, in a finished film.
     */
    const o = normalizeOverlay({ items: [
        { kind: 'label', lines: ['Outer core'], anchor: 'n',
          offset: [-120, -40], at: 0, for: 5 }] }, () => {});
    const roomy = overlayAt(o, 2, { ...FRAME, project: () => at([960, 540]) })
        .filter((x) => x.op === 'text');
    const cramped = overlayAt(o, 2, { ...FRAME, project: () => at([40, 540]) })
        .filter((x) => x.op === 'text');
    assert.equal(roomy[0].align, 'right', 'a negative offset prefers the left side');
    assert.equal(cramped[0].align, 'left', 'against the left edge it flips');
    assert.ok(cramped[0].x > 40, 'and the text moves to the other side of the anchor');
});

test('an explicit align is never flipped', () => {
    const o = normalizeOverlay({ items: [
        { kind: 'label', lines: ['Fixed'], anchor: 'n', align: 'right',
          offset: [-120, 0], at: 0, for: 5 }] }, () => {});
    const ops = overlayAt(o, 2, { ...FRAME, project: () => at([40, 540]) })
        .filter((x) => x.op === 'text');
    assert.equal(ops[0].align, 'right');
});

test('a text block is positioned by its whole box, not its first line', () => {
    /**
     * A multi-line text part anchoring on its LAST line is how four captions
     * in a row printed over their own headings in Phase 35. Two lines centred
     * on y must straddle it.
     */
    const o = normalizeOverlay({ items: [
        { kind: 'title', lines: ['one', 'two'], x: 0.5, y: 0.5, at: 0, for: 5 }] }, () => {});
    const ys = overlayAt(o, 2, { ...FRAME, project: () => null })
        .filter((x) => x.op === 'text').map((x) => x.y);
    assert.equal(ys.length, 2);
    assert.ok(ys[0] < 540 && ys[1] > 540, `expected to straddle 540, got ${ys}`);
});

test('subtitleSpans hold past the last phoneme', () => {
    const spans = subtitleSpans(
        [{ nodeId: 'host', at: 2, text: 'hello', subtitle: true }],
        { cues: [{ id: 'host@2', assetId: 'a' }], buffers: { a: { duration: 1.5 } } });
    assert.equal(spans.length, 1);
    assert.equal(spans[0].at, 2);
    // 1.5s of audio plus the 0.25s hold, because a caption that vanishes on
    // the last phoneme reads as cut off.
    assert.equal(spans[0].end, 3.75);
});

test('subtitleSpans skip lines that opted out or have no text', () => {
    const spans = subtitleSpans([
        { nodeId: 'a', at: 0, text: 'shown', subtitle: true },
        { nodeId: 'b', at: 1, text: 'hidden', subtitle: false },
        { nodeId: 'c', at: 2, subtitle: true },
    ], null);
    assert.equal(spans.length, 1);
    assert.equal(spans[0].text, 'shown');
});

test('checkOverlay', async (t) => {
    await t.test('reports text that leaves the frame', () => {
        // Left-aligned three-quarters across the frame: wrapping cannot
        // save it, because wrapping only bounds the line's WIDTH and says
        // nothing about where the box was put.
        const o = normalizeOverlay({ items: [
            { kind: 'title', lines: ['a very long caption indeed'], x: 0.78,
              align: 'left', at: 0, for: 2 }] }, () => {});
        const found = checkOverlay(o, { ...FRAME, duration: 2, project: () => null });
        assert.ok(found.some((f) => /outside the frame/.test(f.message)),
                  `expected an off-frame finding, got ${JSON.stringify(found)}`);
    });

    await t.test('reports an item sitting in the subtitle band', () => {
        const o = normalizeOverlay({ items: [
            { kind: 'title', lines: ['slate'], x: 0.5, y: 0.93, at: 0, for: 2 }] }, () => {});
        o.subtitles = [{ at: 0, end: 2, text: 'a caption' }];
        const found = checkOverlay(o, { ...FRAME, duration: 2, project: () => null });
        assert.ok(found.some((f) => /subtitle band/.test(f.message)));
    });

    await t.test('does NOT report the subtitles themselves', () => {
        /**
         * The first pass checked the whole draw list and reported every
         * subtitle for sitting in the subtitle band, which is where a
         * subtitle goes: 28 findings, none real, burying the two that were.
         */
        const o = normalizeOverlay({ items: [] }, () => {});
        o.subtitles = [{ at: 0, end: 4, text: 'a perfectly ordinary caption' }];
        assert.deepEqual(checkOverlay(o, { ...FRAME, duration: 4, project: () => null }), []);
    });

    await t.test('reports each distinct problem once, not once per sample', () => {
        const o = normalizeOverlay({ items: [
            { kind: 'title', lines: ['a very long caption indeed'], x: 0.78,
              align: 'left', at: 0, for: 20 }] }, () => {});
        const found = checkOverlay(o, { ...FRAME, duration: 20, project: () => null });
        assert.equal(found.length, 1);
    });
});
