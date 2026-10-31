import test from 'node:test';
import assert from 'node:assert/strict';

import { compileFilm } from '../../src/core/script/compile.js';
import { trackValueAt } from '../../src/core/anim/Track.js';
import {
    conceal, effect, ellipsePart, glide, pop, ramp, reveal,
} from '../../scripts/lib/diagram.mjs';

/**
 * The authoring helpers behind the "Finding Gold" series.
 *
 * Two mistakes here are invisible in every still frame and ruin every film:
 *
 * 1. **Easing belongs to the segment that STARTS at a key.** `step` on the
 *    leading key of a transition holds the start value across the whole
 *    transition and then jumps, so every fade becomes a hard cut.
 * 2. **`transform.x` is absolute**, not a delta -- the compiler writes
 *    `at[0] + pivot[0]` into it -- so moving a part "from 0" teleports it to
 *    the origin first.
 */

/** Compile a one-shot film whose only cast member is a board of `parts`. */
function compiled(parts, actions, duration = 10) {
    const film = {
        version: 'jirex.film/1',
        meta: { title: 't', fps: 24, width: 1080, height: 1920 },
        palettes: { p: { gold: '#ffc64d', ink: '#f2efe6' } },
        characters: { fx: effect(parts, { palette: 'p' }) },
        scenes: [{
            id: 's', palette: 'p',
            cast: [{ character: 'fx', as: 'fx', at: [0, 0], scale: 1, alpha: 1,
                     role: 'effect' }],
            shots: [{ id: 'a', duration, actions }],
        }],
    };
    const out = compileFilm(film, { assets: null });
    const problems = out.diagnostics.filter((d) => d.severity !== 'info');
    assert.deepEqual(problems, [], 'the helpers must not emit unknown keys');
    return out;
}

const at = (c, id, path, t) => {
    const track = c.timeline.tracks.find((x) => x.target === `s/fx/${id}` && x.path === path);
    assert.ok(track, `no ${path} track on ${id}`);
    return trackValueAt(track, t);
};

const dot = (id, pos) => ellipsePart(id, 10, 10, { at: pos });

test('a reveal actually interpolates, instead of jumping at the end', () => {
    const c = compiled([dot('a', [540, 900])], reveal('fx', 'a', 2, { span: 1 }));
    assert.equal(at(c, 'a', 'props.alpha', 1.9), 0, 'held before it starts');
    assert.equal(at(c, 'a', 'props.alpha', 2), 0);
    const mid = at(c, 'a', 'props.alpha', 2.5);
    assert.ok(mid > 0.2 && mid < 0.8, `half way through it should be mid-fade, got ${mid}`);
    assert.equal(at(c, 'a', 'props.alpha', 3), 1);
    assert.equal(at(c, 'a', 'props.alpha', 6), 1, 'and holds afterwards');
});

test('a conceal interpolates too, and holds its start value until it begins', () => {
    const c = compiled([dot('a', [540, 900])],
        [...reveal('fx', 'a', 1, { span: 0.5 }), ...conceal('fx', 'a', 5, { span: 1 })]);
    assert.equal(at(c, 'a', 'props.alpha', 4), 1, 'holds between the two');
    const mid = at(c, 'a', 'props.alpha', 5.5);
    assert.ok(mid > 0.2 && mid < 0.8, `got ${mid}`);
    assert.equal(at(c, 'a', 'props.alpha', 6), 0);
});

test('glide moves a part by an offset from where it was authored', () => {
    const c = compiled([dot('a', [300, 900])],
        glide('fx', 'a', [300, 900], 2, 2, [400, -100]));
    assert.equal(at(c, 'a', 'transform.x', 1), 300, 'starts where it was authored');
    assert.equal(at(c, 'a', 'transform.x', 2), 300);
    const midX = at(c, 'a', 'transform.x', 3);
    assert.ok(midX > 340 && midX < 660, `half way across, got ${midX}`);
    assert.equal(at(c, 'a', 'transform.x', 4), 700);
    assert.equal(at(c, 'a', 'transform.y', 4), 800);
});

test('glide never teleports the part to the origin first', () => {
    const c = compiled([dot('a', [900, 300])],
        glide('fx', 'a', [900, 300], 1, 1, [-200, 0]));
    for (const t of [0, 0.5, 0.9, 1, 1.5, 2, 5]) {
        assert.ok(at(c, 'a', 'transform.x', t) >= 700,
            `at ${t}s the part was at x=${at(c, 'a', 'transform.x', t)}`);
    }
});

test('pop scales up from nothing, overshoots, and settles', () => {
    const c = compiled([dot('a', [540, 900])],
        pop('fx', 'a', 2, { span: 1, overshoot: 0.2 }));
    assert.equal(at(c, 'a', 'transform.sx', 2), 0);
    const over = at(c, 'a', 'transform.sx', 2.68);
    assert.ok(over > 1.1, `should overshoot past 1, got ${over}`);
    assert.ok(Math.abs(at(c, 'a', 'transform.sx', 3) - 1) < 1e-9, 'and settle on 1');
    assert.equal(at(c, 'a', 'transform.sy', 3), at(c, 'a', 'transform.sx', 3),
        'uniformly, or it reads as a squash');
});

test('a ramp holds its end value rather than drifting to the next key', () => {
    const c = compiled([dot('a', [540, 900])], [
        ...ramp('fx', 'a', 'props.alpha', 1, 0.5, 0, 1),
        ...ramp('fx', 'a', 'props.alpha', 6, 0.5, 1, 0),
    ]);
    for (const t of [1.6, 3, 4.5, 5.9]) {
        assert.equal(at(c, 'a', 'props.alpha', t), 1, `drifted at ${t}s`);
    }
});
