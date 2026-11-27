/**
 * Where the probes go and which object takes which.
 *
 * The bake needs a GPU and is measured by `npm run test:bounce`. What can be
 * checked here is the half that decides what gets baked and who reads it --
 * and an assignment that is silently wrong produces a film that renders,
 * looks lit, and is lit by the wrong room.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    PROBE_SIZES, PROBE_DARK, normalizeBounce, boundsCentre, nearestProbe, assignProbes,
    bounceReport, probeVerdicts,
} from '../../src/core/render/bounce.js';

test('off is off, and true is one probe at the centre of the set', () => {
    const seen = [];
    const warn = (m) => seen.push(m);
    for (const off of [null, undefined, false]) assert.equal(normalizeBounce(off, { warn }), null);
    assert.deepEqual(seen, []);

    const b = normalizeBounce(true, { warn });
    assert.deepEqual(seen, []);
    assert.equal(b.at, null, 'no positions means derive one from the bounds');
    assert.equal(b.size, 64);
    assert.equal(b.intensity, 1);
    assert.equal(b.metals, true, 'the set is a better thing for a metal to reflect');
});

test('the centre of the set is the centre of its bounds', () => {
    assert.deepEqual(boundsCentre({ min: [-2, 0, -4], max: [2, 3, 0] }), [0, 1.5, -2]);
    // A film with one flat object has a degenerate box and still gets a probe.
    assert.deepEqual(boundsCentre({ min: [1, 1, 1], max: [1, 1, 1] }), [1, 1, 1]);
});

test('nearest wins, and ties go to the first declared', () => {
    const probes = [[-5, 0, 0], [5, 0, 0]];
    assert.equal(nearestProbe([-1, 0, 0], probes), 0);
    assert.equal(nearestProbe([1, 0, 0], probes), 1);
    assert.equal(nearestProbe([0, 0, 0], probes), 0, 'a tie must be deterministic');
    // In three dimensions, not two: a probe directly above beats one far aside.
    assert.equal(nearestProbe([0, 0, 0], [[0, 1, 0], [4, 0, 0]]), 0);
    assert.equal(nearestProbe([0, 0, 0], []), -1);
});

test('the assignment is a manifest, so it can be checked without a renderer', () => {
    const items = [{ id: 'floor', at: [0, 0, 0] }, { id: 'wall', at: [9, 0, 0] },
                   { id: 'lamp', at: [4, 3, 0] }];
    const probes = [[0, 0, 0], [10, 0, 0]];
    const got = assignProbes(items, probes);
    assert.deepEqual(got.map((a) => [a.id, a.probe]),
                     [['floor', 0], ['wall', 1], ['lamp', 0]]);
    assert.equal(got[1].distance, 1, 'the distance is reported, so a bad probe is visible');
    assert.equal(got[2].distance, 5);
    // No probes at all assigns nothing rather than throwing: a film with an
    // empty set should render, not fail.
    assert.deepEqual(assignProbes(items, []), []);
});

test('a probe size that is not a power of two is a diagnostic', () => {
    const seen = [];
    const warn = (m, l) => seen.push(`${l}: ${m}`);
    assert.equal(normalizeBounce({ size: 100 }, { warn }), null);
    assert.match(seen[0], /probe size 100 is not one of/);
    assert.ok(PROBE_SIZES.includes(64) && !PROBE_SIZES.includes(100));
});

test('malformed probe positions are a diagnostic, not a probe at the origin', () => {
    const seen = [];
    const warn = (m) => seen.push(m);
    assert.equal(normalizeBounce({ at: [] }, { warn }), null);
    assert.match(seen[0], /list of \[x, y, z\]/);
    seen.length = 0;
    assert.equal(normalizeBounce({ at: [[0, 1, 0], [2, 3]] }, { warn }), null);
    assert.match(seen[0], /probe 1 is not an/);
    seen.length = 0;
    assert.equal(normalizeBounce({ at: [[0, 1, Number.NaN]] }, { warn }), null);
    assert.match(seen[0], /probe 0 is not an/);
    seen.length = 0;
    assert.equal(normalizeBounce({ intensity: -1 }, { warn }), null);
    assert.match(seen[0], /must not be negative/);
    seen.length = 0;
    assert.equal(normalizeBounce('lots', { warn }), null);
    assert.match(seen[0], /must be an object/);
});

test('authored positions are kept exactly, in order', () => {
    const b = normalizeBounce({ at: [[0, 1, 0], [4, 1, -2]], size: 128, intensity: 0.6,
                                metals: false }, {});
    assert.deepEqual(b.at, [[0, 1, 0], [4, 1, -2]]);
    assert.equal(b.size, 128);
    assert.equal(b.intensity, 0.6);
    assert.equal(b.metals, false);
});

test('the report names the furthest object from its probe', () => {
    // The number that says whether one probe was enough: an object 20 units
    // from the only probe in the film is lit by a room it is not in.
    const b = normalizeBounce(true, {});
    const line = bounceReport(b, [[0, 0, 0]],
        assignProbes([{ id: 'a', at: [0, 0, 0] }, { id: 'b', at: [0, 0, 12] }], [[0, 0, 0]]));
    assert.match(line, /1 probe\(s\) at 64\^2/);
    assert.match(line, /2 object\(s\) assigned/);
    assert.match(line, /furthest 12\.00 units/);
    assert.match(line, /\(metals too\)/);
    assert.equal(bounceReport(null, [], []), 'bounce: none');
});

test('a probe that caught nothing is a verdict, not a number to ignore', () => {
    const v = probeVerdicts([
        { r: 0, g: 0, b: 0 },                    // behind single-sided geometry
        { r: 0.1, g: 0.09, b: 0.09 },            // a lit room
        { r: 0.002, g: 0.002, b: 0.002 },        // a dim backdrop and nothing else
    ]);
    assert.deepEqual(v.map((p) => p.dark), [true, false, true]);
    assert.match(v[0].note, /caught no light/);
    assert.match(v[0].note, /single-sided geometry/);
    assert.equal(v[1].note, null, 'a working probe must say nothing');
    // Not a strict zero test: below one byte of an 8-bit frame a probe cannot
    // change a pixel, so calling it lit would be the diagnostic lying.
    assert.ok(v[2].dark, `${v[2].mean} should be below PROBE_DARK ${PROBE_DARK}`);
    assert.ok(Math.abs(v[1].mean - (0.1 + 0.09 + 0.09) / 3) < 1e-12);
});

test('the report states the measured radiance, not just that the bake ran', () => {
    const b = normalizeBounce(true, {});
    const assigned = assignProbes([{ id: 'a', at: [0, 0, 0] }], [[0, 0, 0]]);
    const line = bounceReport(b, [[0, 0, 0]], assigned,
                              probeVerdicts([{ r: 0.2, g: 0.2, b: 0.2 }]));
    assert.match(line, /1\/1 carrying light/);
    assert.match(line, /brightest mean 2\.00e-1/);
    // A dark probe is visible in the count, so the log reads as wrong too.
    const dead = bounceReport(b, [[0, 0, 0]], assigned, probeVerdicts([{ r: 0, g: 0, b: 0 }]));
    assert.match(dead, /0\/1 carrying light/);
    // And with no verdicts at all the line is what it was.
    assert.doesNotMatch(bounceReport(b, [[0, 0, 0]], assigned), /carrying light/);
});
