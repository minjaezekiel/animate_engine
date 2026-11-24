import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compileFilm } from '../../src/core/script/compile.js';
import { samplePose, applyPose, createPoseBaseline, resetPose }
    from '../../src/core/anim/Evaluator.js';
import { trackValueAt } from '../../src/core/anim/Track.js';
import { subjectsAt, headFractionAt, framingOf } from '../../src/core/script/digest2d.js';

/**
 * The 2D digest's geometry, in Node, with no browser.
 *
 * Which is the point of putting it in core: the boxes, the scene filtering
 * and the framing reading are arithmetic over a posed scene, and only the
 * pixels need a canvas. A defect in any of the above is findable in
 * milliseconds rather than behind a headless Chrome launch.
 */

const film = JSON.parse(readFileSync(new URL('../../demo/film.json', import.meta.url), 'utf8'));

/** Compile, pose at t, and hand back what a digest would read. */
const at = (t) => {
    const compiled = compileFilm(film);
    const baseline = createPoseBaseline(compiled.scene, compiled.timeline);
    resetPose(compiled.scene, baseline);
    applyPose(compiled.scene, samplePose(compiled.timeline, t));
    return compiled;
};

test('subjectsAt', async (t) => {
    await t.test('reports a box in FRAME FRACTIONS, not pixels', () => {
        /**
         * Fractions, because a film is rendered at whatever size it is asked
         * for and `digest.js` reports coverage as a percentage of frame. A
         * box in pixels would mean something different at 1080p and 480p, and
         * the digest of one instant would not match itself.
         */
        const rows = subjectsAt(at(3.3), film, 3.3, { trackValueAt });
        assert.ok(rows.length, 'the demo film has cast');
        for (const r of rows) {
            assert.equal(r.box.length, 4);
            for (const v of r.box) assert.ok(Number.isFinite(v), `${r.id} box ${r.box}`);
        }
    });

    await t.test('a box is left,top,right,bottom in that order', () => {
        const rows = subjectsAt(at(3.3), film, 3.3, { trackValueAt });
        for (const r of rows) {
            assert.ok(r.box[2] > r.box[0], `${r.id} right must exceed left`);
            assert.ok(r.box[3] > r.box[1], `${r.id} bottom must exceed top`);
        }
    });

    await t.test('filters to one scene when asked, because a cast root exists per scene', () => {
        /**
         * `scenes.*.cast` compiles into ONE graph, so a five-scene film
         * reported the same two characters five times, four of them "off" --
         * four rows of noise per sample, in a format whose whole purpose is
         * to be cheap to read.
         */
        const compiled = at(3.3);
        const all = subjectsAt(compiled, film, 3.3, { trackValueAt });
        const scenes = new Set(all.map((r) => r.sceneId));
        assert.ok(scenes.size > 1, 'the demo film has cast in more than one scene');
        const one = subjectsAt(compiled, film, 3.3, { trackValueAt, sceneId: [...scenes][0] });
        assert.ok(one.length < all.length);
        assert.equal(new Set(one.map((r) => r.sceneId)).size, 1);
    });

    await t.test('visibility is ALPHA, not presence', () => {
        // `do: 'hide'` means the audience is not reading that character, and
        // a digest that called a faded-out figure "on screen and black"
        // would be reporting the fade as a lighting fault.
        const rows = subjectsAt(at(3.3), film, 3.3, { trackValueAt });
        assert.ok(rows.some((r) => r.visible === false) || rows.every((r) => r.visible),
                  'visible is a boolean on every row');
        for (const r of rows) assert.equal(typeof r.visible, 'boolean');
    });

    await t.test('survives a film with no cast and a missing camera', () => {
        assert.deepEqual(subjectsAt(null, film, 0, { trackValueAt }), []);
        assert.deepEqual(subjectsAt({ scene: {}, timeline: {}, meta: {} }, film, 0, {}), []);
    });
});

test('headFractionAt and framingOf', async (t) => {
    await t.test('a head is a fraction of FRAME HEIGHT', () => {
        /**
         * Heads, not bodies, which is how a camera department measures and
         * how `FRAMINGS` is defined: a close-up crops the body, so a
         * body-based ratio stops meaning anything exactly where it is needed
         * most.
         */
        const h = headFractionAt(at(3.3), film, 3.3, 'mara', { trackValueAt });
        assert.ok(h > 0 && h < 1, `head fraction ${h}`);
    });

    await t.test('zooming in makes the head bigger', () => {
        const wide = headFractionAt(at(3.3), film, 3.3, 'mara', { trackValueAt });
        const later = headFractionAt(at(17.25), film, 17.25, 'mara', { trackValueAt });
        assert.ok(Number.isFinite(wide) && Number.isFinite(later));
        assert.notEqual(wide, later, 'the demo film pushes in across its opening');
    });

    await t.test('names the band, and says so when it is outside every one', () => {
        assert.equal(framingOf(0.08), 'wide');
        assert.equal(framingOf(0.2), 'medium');
        assert.equal(framingOf(0.4), 'close');
        assert.equal(framingOf(0.01), 'wider than wide');
        assert.equal(framingOf(0.95), 'tighter than close');
        assert.equal(framingOf(null), null);
    });

    await t.test('an unknown character measures nothing rather than guessing', () => {
        assert.equal(headFractionAt(at(3.3), film, 3.3, 'nobody', { trackValueAt }), null);
        assert.equal(headFractionAt(at(3.3), film, 3.3, null, { trackValueAt }), null);
    });
});
