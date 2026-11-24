import test from 'node:test';
import assert from 'node:assert/strict';
import {
    frameDigest, formatDigest, checkDigest, lumaStatsOf, hueName,
} from '../../src/core/script/digest.js';

test('lumaStatsOf', async (t) => {
    await t.test('reports mean, extremes and a six-bucket histogram', () => {
        const s = lumaStatsOf([0, 0.2, 0.5, 0.9, 1]);
        assert.equal(s.min, 0);
        assert.equal(s.max, 1);
        assert.equal(s.mean, 0.52);
        assert.equal(s.buckets.reduce((a, b) => a + b, 0), 100);
    });

    await t.test('survives an empty sample', () => {
        assert.equal(lumaStatsOf([]).mean, 0);
    });
});

test('hueName', async (t) => {
    await t.test('names the eight families', () => {
        assert.equal(hueName(0.1, 0.3, 0.8), 'blue');
        assert.equal(hueName(0.1, 0.6, 0.2), 'green');
        assert.equal(hueName(0.9, 0.5, 0.1), 'orange');
        assert.equal(hueName(0.8, 0.1, 0.1), 'red');
    });

    await t.test('refuses to invent a hue for an unsaturated patch', () => {
        // An unsaturated patch has no meaningful hue, and reporting one
        // invites an agent to chase a number that is noise.
        assert.equal(hueName(0.5, 0.5, 0.5), 'grey');
        assert.equal(hueName(0.95, 0.94, 0.96), 'white');
        assert.equal(hueName(0.01, 0.01, 0.02), 'black');
    });
});

test('subject rows', async (t) => {
    const make = (over) => frameDigest({
        t: 1, shotId: 's', frame: [0.1, 0.2],
        subjects: [{ id: 'x', visible: true, luma: [0.5], hue: 'blue', ...over }],
    }).subjects[0];

    await t.test('cover is measured on the box CLAMPED to the frame', () => {
        /**
         * The digest's own first run reported `cover=17229396.9%`. A
         * projected bounding box is only meaningful while the object is in
         * front of the camera; past the camera plane the perspective divide
         * blows up. A number like that is worse than no number, because a
         * reader has no way to know it is meaningless.
         */
        const r = make({ box: [-236, -717, 237, 1.6] });
        assert.ok(r.cover <= 100, `cover ${r.cover} must not exceed the frame`);
        assert.equal(r.cover, 100);
        assert.equal(r.clipped, true);
        assert.deepEqual(r.box, [0, 0, 100, 100]);
    });

    await t.test('a box fully inside the frame is not flagged clipped', () => {
        const r = make({ box: [0.25, 0.25, 0.75, 0.75] });
        assert.equal(r.clipped, false);
        assert.equal(r.cover, 25);
    });

    await t.test('a box entirely off frame covers nothing', () => {
        const r = make({ box: [1.4, 1.4, 1.9, 1.9] });
        assert.equal(r.cover, 0);
    });

    await t.test('behind-camera and hidden subjects are stated, not measured', () => {
        assert.equal(make({ behind: true }).behind, true);
        assert.equal(make({ visible: false }).on, false);
    });
});

test('formatDigest is terse and still complete', () => {
    const d = frameDigest({
        t: 22, shotId: 'open', frame: [0.1, 0.2, 0.9],
        subjects: [
            { id: 'earth', visible: true, box: [0.3, 0.17, 0.89, 0.98],
              luma: [0.14, 0.16], hue: 'orange' },
            { id: 'host', visible: false },
        ],
        overlay: [{ op: 'text', text: 'Cut it open.' }, { op: 'rect' }],
    });
    const text = formatDigest([d]);
    assert.match(text, /^t=22 open luma=/);
    assert.match(text, /earth: box=30,17,89,98 cover=47\.8% luma=0\.15 orange/);
    assert.match(text, /host: off/);
    assert.match(text, /text: "Cut it open\."/);
    // Rects carry no information a reader can act on; only text does.
    assert.doesNotMatch(text, /rect/);
    // The whole frame on four short lines.
    assert.ok(text.split('\n').length === 4, text);
});

test('checkDigest', async (t) => {
    const at = (subjects) => [frameDigest({ t: 3, shotId: 's', frame: [0.3], subjects })];

    await t.test('reports a large subject that is on screen and black', () => {
        /**
         * The row this module exists for. The Earth's sunlit face rendered at
         * 0.02 mean luma for three iterations because a Vector2 went NaN, and
         * every frame-wide exposure check passed: the frame is mostly space,
         * and a black planet in black space has an unremarkable mean. Only a
         * per-SUBJECT number sees it.
         */
        const found = checkDigest(at([{ id: 'earth', visible: true,
            box: [0.2, 0.2, 0.8, 0.8], luma: [0.02, 0.02], hue: 'black' }]));
        assert.equal(found.length, 1);
        assert.match(found[0].message, /on screen and black/);
        assert.match(found[0].message, /earth/);
    });

    await t.test('ignores a small dark subject', () => {
        // A 2%-of-frame object at low luma is a prop in shadow, not a defect.
        assert.deepEqual(checkDigest(at([{ id: 'speck', visible: true,
            box: [0.5, 0.5, 0.56, 0.56], luma: [0.01], hue: 'black' }])), []);
    });

    await t.test('ignores a subject that is mostly OUTSIDE the frame', () => {
        /**
         * The macro shots of a cutaway leave the presenter as a sliver down
         * one edge, in shadow. Reporting that is reporting what a close-up
         * is, and three identical findings per film is how a checker stops
         * being read.
         */
        assert.deepEqual(checkDigest(at([{ id: 'host', visible: true,
            box: [0.94, 0.3, 1.6, 1.2], luma: [0.028], hue: 'blue' }])), []);
    });

    await t.test('but still reports a large subject that is merely cropped', () => {
        // Clipped is not the test on its own: the Earth fills and overflows
        // every macro frame in the film, and a black Earth is the defect
        // this module was written for.
        const found = checkDigest(at([{ id: 'earth', visible: true,
            box: [-0.2, -0.2, 1.2, 1.2], luma: [0.02], hue: 'black' }]));
        assert.equal(found.length, 1);
        assert.match(found[0].message, /on screen and black/);
    });

    await t.test('reports a blown-out subject', () => {
        const found = checkDigest(at([{ id: 'core', visible: true,
            box: [0.1, 0.1, 0.9, 0.9], luma: [0.97], hue: 'white' }]));
        assert.match(found[0].message, /blown out/);
    });

    await t.test('checks a declared expectation of hue and coverage', () => {
        const subjects = [{ id: 'earth', visible: true, box: [0, 0, 0.5, 0.5],
                            luma: [0.4], hue: 'green' }];
        const found = checkDigest(at(subjects), {
            expect: { earth: { hue: 'blue', cover: [40, 70] } } });
        assert.equal(found.length, 2);
        assert.ok(found.some((f) => /reads green, expected blue/.test(f.message)));
        assert.ok(found.some((f) => /outside the 40-70%/.test(f.message)));
    });

    await t.test('says nothing about a frame that is fine', () => {
        assert.deepEqual(checkDigest(at([{ id: 'earth', visible: true,
            box: [0.2, 0.2, 0.8, 0.8], luma: [0.35], hue: 'blue' }])), []);
    });
});
