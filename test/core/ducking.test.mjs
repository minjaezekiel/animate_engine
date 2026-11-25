/**
 * Ducking the music under the dialogue.
 *
 * `OfflineMixer.js` carried the comment "so a music bed can be ducked as a
 * group later" for several phases and later did not happen, so a bed sat at
 * whatever flat gain the author guessed -- and the mix was silently wrong the
 * moment a line moved. Either the voice was buried or the music was
 * inaudible, and nothing reported either, because both are correct renders of
 * what was asked for.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DUCK_DEFAULTS, dbToGain, duckAutomation, duckReport, normalizeDuck, speechSpans,
} from '../../src/core/audio/ducking.js';
import { createCue } from '../../src/core/audio/cues.js';
import { compileFilm } from '../../src/core/script/compile.js';

const voice = (at, duration) => createCue({ id: `v${at}`, assetId: 'vo', at, duration,
                                            bus: 'voice' });
const DUR = { vo: 2, theme: 120 };

test('a decibel depth converts to the gain it means', () => {
    assert.ok(Math.abs(dbToGain(0) - 1) < 1e-12);
    assert.ok(Math.abs(dbToGain(-6) - 0.5012) < 1e-3);
    assert.ok(Math.abs(dbToGain(-9) - 0.3548) < 1e-3);
    assert.equal(DUCK_DEFAULTS.depthDb, -9);
});

test('attack is faster than release, as on every compressor', () => {
    // Getting out of the way must happen before the first word; coming back
    // up slowly is what makes the return inaudible rather than a swell.
    assert.ok(DUCK_DEFAULTS.attack < DUCK_DEFAULTS.release);
});

// ----------------------------------------------------------------- spans

test('only the trigger bus causes ducking', () => {
    const cues = [voice(1, 2),
                  createCue({ id: 'm', assetId: 'theme', at: 0, bus: 'music' }),
                  createCue({ id: 's', assetId: 'vo', at: 5, bus: 'sfx' })];
    assert.deepEqual(speechSpans(cues, DUR), [[1, 3]]);
});

test("a cue's length comes from its own duration, or from the asset", () => {
    // Guessing would duck for the wrong length on every line that does not
    // declare one.
    assert.deepEqual(speechSpans([voice(0, 1.5)], DUR), [[0, 1.5]]);
    assert.deepEqual(speechSpans([createCue({ id: 'v', assetId: 'vo', at: 4, bus: 'voice' })], DUR),
                     [[4, 6]], 'no duration: the asset is 2s long');
    assert.deepEqual(speechSpans([createCue({ id: 'v', assetId: 'missing', at: 0, bus: 'voice' })],
                                 DUR), [], 'an unknown asset has no length and is skipped');
});

test('two lines a breath apart are ONE span, not two', () => {
    /**
     * The pumping this module exists to avoid. Two lines half a second apart
     * are one piece of speech as far as a listener is concerned, and lifting
     * the bed between them is audible and wrong.
     */
    assert.deepEqual(speechSpans([voice(0, 2), voice(2.5, 2)], DUR), [[0, 4.5]]);
    // A gap longer than the bridge does lift.
    assert.deepEqual(speechSpans([voice(0, 2), voice(5, 2)], DUR), [[0, 2], [5, 7]]);
});

test('a short cue inside a long one does not SHORTEN the span', () => {
    assert.deepEqual(speechSpans([voice(0, 10), voice(2, 1)], DUR), [[0, 10]]);
});

test('spans are sorted, whatever order the cues arrive in', () => {
    assert.deepEqual(speechSpans([voice(9, 1), voice(0, 1)], DUR), [[0, 1], [9, 1 + 9]]);
});

// ------------------------------------------------------------ automation

test('the automation dips before the line and returns after it', () => {
    const pts = duckAutomation([voice(5, 2)], DUR);
    assert.deepEqual(pts.map((p) => +p.t.toFixed(3)), [4.82, 5, 7, 7.45]);
    assert.equal(pts[0].gain, 1);
    assert.ok(Math.abs(pts[1].gain - dbToGain(-9)) < 1e-9);
    assert.equal(pts[2].gain, pts[1].gain, 'and holds through the line');
    assert.equal(pts[3].gain, 1);
});

test('a film with no dialogue gets NO automation and pays nothing', () => {
    assert.deepEqual(duckAutomation([createCue({ id: 'm', assetId: 'theme', bus: 'music' })], DUR),
                     []);
    assert.deepEqual(duckAutomation([], DUR), []);
    assert.deepEqual(duckAutomation(null, DUR), []);
});

test('a line near t=0 clamps rather than scheduling a negative time', () => {
    // `setValueAtTime` on a negative time is an error in some
    // implementations and silently ignored in others.
    const pts = duckAutomation([voice(0.1, 1)], DUR);
    assert.ok(pts.every((p) => p.t >= 0), `negative time in ${JSON.stringify(pts)}`);
    // Clamped to 0 at full gain, so the attack is simply SHORTER than asked
    // -- 0.1s instead of 0.18s -- rather than starting mid-ramp. The bed is
    // still fully out of the way by the time the line begins, which is the
    // part that matters.
    assert.equal(pts[0].t, 0);
    assert.equal(pts[0].gain, 1);
    const atLineStart = pts.find((p) => Math.abs(p.t - 0.1) < 1e-9);
    assert.ok(atLineStart && atLineStart.gain < 1,
        'the duck must have arrived by the time the line starts');
});

test('two points at one instant collapse, because a ramp cannot step', () => {
    // A release landing exactly where the next attack begins.
    const pts = duckAutomation([voice(0, 1), voice(1.45, 1)], DUR,
                               { bridge: 0, attack: 0, release: 0.45 });
    const times = pts.map((p) => +p.t.toFixed(4));
    assert.equal(new Set(times).size, times.length, `duplicate instants in ${times}`);
});

test('the depth is honoured', () => {
    const pts = duckAutomation([voice(5, 2)], DUR, { depthDb: -20 });
    assert.ok(Math.abs(pts[1].gain - dbToGain(-20)) < 1e-9);
});

// ------------------------------------------------------------ declaration

test('`true` means do the usual thing', () => {
    assert.deepEqual(normalizeDuck(true), { ...DUCK_DEFAULTS });
    // And every spelling goes through the same validation: the numeric
    // shorthand used to return early and skip it.
    const warns = [];
    normalizeDuck(0.5, { warn: (m) => warns.push(m) });
    const objWarns = [];
    normalizeDuck({ depth: 0.5 }, { warn: (m) => objWarns.push(m) });
    assert.deepEqual(warns, objWarns, 'the same mistake must report the same way');
    assert.equal(normalizeDuck(false), null);
    assert.equal(normalizeDuck(null), null);
    assert.equal(normalizeDuck(undefined), null);
});

test('a depth is accepted signed OR unsigned', () => {
    // "duck by 9 dB" and "duck to -9 dB" are the same intent, and insisting
    // on the minus sign would be pedantry that costs a silent mistake.
    assert.equal(normalizeDuck(9).depthDb, -9);
    assert.equal(normalizeDuck(-9).depthDb, -9);
    assert.equal(normalizeDuck({ depth: 12 }).depthDb, -12);
    assert.equal(normalizeDuck({ depthDb: -12 }).depthDb, -12);
});

test('timings are read and validated', () => {
    const d = normalizeDuck({ attack: 0.05, release: 1, bridge: 0 });
    assert.equal(d.attack, 0.05);
    assert.equal(d.release, 1);
    assert.equal(d.bridge, 0);
    const warns = [];
    const bad = normalizeDuck({ attack: -1, release: 'soon' }, { warn: (m) => warns.push(m) });
    assert.equal(bad.attack, DUCK_DEFAULTS.attack, 'a bad value falls back rather than breaking');
    assert.equal(warns.length, 2);
    assert.match(warns.join(), /non-negative number of seconds/);
});

test('an inaudible or extreme depth is warned about', () => {
    const quiet = [];
    normalizeDuck(0.5, { warn: (m) => quiet.push(m) });
    assert.match(quiet.join(), /inaudible/);
    const loud = [];
    normalizeDuck(40, { warn: (m) => loud.push(m) });
    assert.match(loud.join(), /read as a dropout/);
});

test('a nonsense declaration is a warning, not a throw', () => {
    const warns = [];
    assert.equal(normalizeDuck('loud', { warn: (m) => warns.push(m) }), null);
    assert.match(warns.join(), /must be true, a depth in dB, or an object/);
    assert.equal(normalizeDuck(Number.NaN, { warn: () => {} }), null);
});

test('the buses are configurable', () => {
    const d = normalizeDuck({ trigger: 'vo', target: 'bed' });
    assert.equal(d.trigger, 'vo');
    assert.equal(d.target, 'bed');
});

// ---------------------------------------------------------------- report

test('the report says what happened, because nothing else will', () => {
    /**
     * A duck is invisible in every other number the engine prints: the master
     * peak barely moves, the cue list is unchanged, the duration is
     * identical. Without a line saying so an author cannot tell whether the
     * feature ran at all.
     */
    const pts = duckAutomation([voice(5, 2), voice(20, 3)], DUR);
    const r = duckReport(pts, DUCK_DEFAULTS);
    assert.match(r, /music under voice by -9 dB/);
    assert.match(r, /2 span\(s\)/);
    assert.match(r, /attack 0\.18s, release 0\.45s/);
    assert.match(duckReport([], DUCK_DEFAULTS), /nothing on the trigger bus/);
});

// -------------------------------------------------- through the compilers

test('a 2D film declares it and the compiler normalises it', () => {
    const { meta, diagnostics } = compileFilm({
        meta: { fps: 24, width: 100, height: 100, audio: { duck: 12 } },
        scenes: [{ id: 's', shots: [{ id: 'a', duration: 1 }] }],
    });
    assert.equal(meta.duck.depthDb, -12);
    assert.deepEqual(diagnostics.filter((d) => d.severity === 'error'), []);
});

test('a film that says nothing gets NO duck, so finished mixes do not change', () => {
    // Switching this on for every existing film would change fifty-one
    // finished mixes.
    const { meta } = compileFilm({
        meta: { fps: 24, width: 100, height: 100 },
        scenes: [{ id: 's', shots: [{ id: 'a', duration: 1 }] }],
    });
    assert.equal(meta.duck, null);
});

test('a bad declaration surfaces as a film diagnostic', () => {
    const { diagnostics } = compileFilm({
        meta: { fps: 24, width: 100, height: 100, audio: { duck: { attack: -5 } } },
        scenes: [{ id: 's', shots: [{ id: 'a', duration: 1 }] }],
    });
    assert.ok(diagnostics.some((d) => /non-negative number of seconds/.test(d.message)),
        'the warning must reach the film diagnostics, not just a callback');
});

// ------------------------------------------- the arithmetic, end to end

test('the ducked level is what the depth asks for, measured', () => {
    /**
     * The claim an author cares about: with a bed at 0.5 and a 9 dB duck, the
     * bed under a line is 0.5 * 0.3548 = 0.177. Computed here rather than
     * rendered, because a real mix needs OfflineAudioContext and a browser --
     * `test/e2e/render-av.mjs` is where the rendered mix is measured.
     */
    const bedGain = 0.5;
    const pts = duckAutomation([voice(10, 3)], DUR);
    const mid = pts[1].gain;
    assert.ok(Math.abs(bedGain * mid - 0.1774) < 1e-3,
        `ducked bed is ${(bedGain * mid).toFixed(4)}, want ~0.1774`);
    // And it is fully back up well after the line.
    assert.equal(pts[pts.length - 1].gain, 1);
});

// ------------------------------------------------- cue windows that go silent

test('a cue whose offset is past the end of its asset is an ERROR', async () => {
    /**
     * This shipped silently. The mixer skipped a zero-length window with a
     * bare `continue`, so an offset past the end of a file was silence with
     * no diagnostic: the author heard nothing, every check in the repo passed,
     * and the cause was a number that reads perfectly reasonably in the film.
     */
    const { checkCues } = await import('../../src/core/audio/cues.js');
    const f = checkCues([createCue({ id: 'm', assetId: 'theme', at: 0, offset: 200,
                                     bus: 'music' })], { theme: 120 });
    assert.equal(f.length, 1);
    assert.equal(f[0].severity, 'error');
    assert.match(f[0].message, /past the end of a 120.00s asset/);
    assert.match(f[0].message, /renders SILENT/);
});

test('an out-point past the end of the file is a clamp warning, not silence', async () => {
    const { checkCues } = await import('../../src/core/audio/cues.js');
    const f = checkCues([createCue({ id: 'm', assetId: 'theme', offset: 100, duration: 40,
                                     bus: 'music' })], { theme: 120 });
    assert.equal(f[0].severity, 'warning');
    assert.match(f[0].message, /clamped to 20.00s/);
});

test('a fade longer than its own cue never reaches its level', async () => {
    const { checkCues } = await import('../../src/core/audio/cues.js');
    const f = checkCues([createCue({ id: 'm', assetId: 'theme', duration: 2,
                                     fadeIn: 1.5, fadeOut: 1.5, bus: 'music' })], { theme: 120 });
    assert.match(f.map((x) => x.message).join(), /never reaches its own level/);
});

test('an unloaded asset is reported rather than silently skipped', async () => {
    const { checkCues } = await import('../../src/core/audio/cues.js');
    const f = checkCues([createCue({ id: 'm', assetId: 'nope', bus: 'music' })], { theme: 120 });
    assert.match(f[0].message, /not loaded/);
});

test('two music beds at once is worth saying, because it is only denser', async () => {
    const { checkCues } = await import('../../src/core/audio/cues.js');
    const f = checkCues([
        createCue({ id: 'a', assetId: 'theme', at: 0, duration: 30, bus: 'music' }),
        createCue({ id: 'b', assetId: 'theme', at: 20, duration: 30, bus: 'music' }),
    ], { theme: 120 });
    assert.equal(f.length, 1);
    assert.equal(f[0].severity, 'info');
    assert.match(f[0].message, /overlaps the previous music cue by 10.00s/);
});

test('a correct set of cues produces no findings at all', async () => {
    const { checkCues } = await import('../../src/core/audio/cues.js');
    assert.deepEqual(checkCues([
        createCue({ id: 'a', assetId: 'theme', at: 0, offset: 32, duration: 24,
                    fadeIn: 1.5, fadeOut: 2, bus: 'music' }),
        createCue({ id: 'b', assetId: 'vo', at: 4, bus: 'voice' }),
    ], { theme: 120, vo: 2 }), []);
    assert.deepEqual(checkCues([], {}), []);
    assert.deepEqual(checkCues(null, {}), []);
});
