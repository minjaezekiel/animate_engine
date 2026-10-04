import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCue, cueSampleWindow, mixDuration, cueGainAt } from '../../src/core/audio/cues.js';
import { envelope, voicedSpans, normalize } from '../../src/core/audio/envelope.js';
import { visemesFromText, visemesFromEnvelope, visemesFromPhonemes, lipsyncLine } from '../../src/core/audio/lipsync.js';
import { textToVisemeSequence, phonemeToViseme, resolveViseme, VISEMES } from '../../src/core/audio/visemes.js';
import { trackValueAt } from '../../src/core/anim/Track.js';

const SR = 48000;

/** tone / silence / tone, one second each. */
function probeSignal() {
    const s = new Float32Array(SR * 3);
    for (let i = 0; i < SR; i++) s[i] = Math.sin((2 * Math.PI * 220 * i) / SR) * 0.5;
    for (let i = SR * 2; i < s.length; i++) s[i] = Math.sin((2 * Math.PI * 220 * i) / SR) * 0.5;
    return s;
}

test('cues resolve to integer sample offsets', () => {
    const c = createCue({ id: 'v', assetId: 'a', at: 0.6, gain: 0.8, fadeIn: 0.1, fadeOut: 0.2 });
    const w = cueSampleWindow(c, SR, 3);
    assert.equal(w.startSample, 28800, '0.6s at 48k is exactly 28800 samples');
    assert.equal(Number.isInteger(w.startSample), true);
    assert.equal(w.lengthSamples, 144000);
    assert.equal(w.endSample, 172800);
    assert.equal(w.fadeInSamples, 4800);
});

test('cue windows clamp to the asset and honour offset/duration', () => {
    const c = createCue({ id: 'v', assetId: 'a', at: 0, offset: 1, duration: 10 });
    const w = cueSampleWindow(c, SR, 3);
    assert.equal(w.srcOffset, SR, 'offset skips into the source');
    assert.equal(w.lengthSamples, SR * 2, 'cannot play past the end of the asset');
});

test('cue gain ramps in and out, flat in the middle', () => {
    const c = createCue({ id: 'v', assetId: 'a', at: 0, gain: 0.8, fadeIn: 0.1, fadeOut: 0.1 });
    const w = cueSampleWindow(c, SR, 2);
    assert.equal(cueGainAt(c, w, 0), 0, 'silent at the very start of a fade-in');
    assert.ok(Math.abs(cueGainAt(c, w, SR) - 0.8) < 1e-9, 'base gain in the middle');
    assert.equal(cueGainAt(c, w, w.lengthSamples), 0, 'silent at the end of a fade-out');
});

test('mix duration spans the latest cue', () => {
    const cues = [
        createCue({ id: 'a', assetId: 'm', at: 0 }),
        createCue({ id: 'b', assetId: 'v', at: 10 }),
    ];
    assert.equal(mixDuration(cues, { m: 4, v: 2.5 }, SR), 12.5);
});

test('envelope and voiced spans find speech and ignore silence', () => {
    const env = envelope(probeSignal(), SR, 24);
    assert.equal(env.length, 72, 'one value per video frame');
    const spans = voicedSpans(env);
    assert.equal(spans.length, 2, 'two bursts, one gap');
    assert.ok(spans[0].startFrame <= 1);
    assert.ok(spans[0].endFrame < 30, 'first burst ends before the silence is over');
    assert.ok(spans[1].startFrame > 40, 'second burst starts after the silence');
    assert.deepEqual([...normalize(new Float32Array([0, 0, 0]))], [0, 0, 0], 'silence normalizes safely');
    assert.deepEqual(voicedSpans(new Float32Array(10)), [], 'pure silence has no spans');
});

test('grapheme rules put closures and teeth on the right letters', () => {
    assert.deepEqual(textToVisemeSequence('my'), ['closed', 'wide']);
    assert.deepEqual(textToVisemeSequence('five'), ['teeth', 'wide', 'teeth', 'mid']);
    const seq = textToVisemeSequence('pop');
    assert.equal(seq[0], 'closed', 'a plosive opens with a closure');
    assert.ok(textToVisemeSequence('shoe').includes('wide'), 'digraphs match before single letters');
    assert.deepEqual(textToVisemeSequence(''), []);
    assert.deepEqual(textToVisemeSequence('!!! ???'), [], 'punctuation only yields nothing');
});

test('every viseme a mapping can emit is a declared viseme', () => {
    for (const v of textToVisemeSequence('the quick brown fox jumps over five lazy dogs')) {
        assert.ok(VISEMES.includes(v), `${v} is a known viseme`);
    }
    for (const p of ['m', 'f', 'uː', 'iː', 'ɑ', 'ə', 'zzz']) {
        assert.ok(VISEMES.includes(phonemeToViseme(p)), `${p} maps into the viseme set`);
    }
});

test('viseme fallback degrades for characters with fewer mouth shapes', () => {
    assert.equal(resolveViseme('teeth', { closed: 1, mid: 1, open: 1 }), 'mid');
    assert.equal(resolveViseme('teeth', { closed: 1, mid: 1, open: 1, teeth: 1 }), 'teeth');
    assert.equal(resolveViseme('round', { closed: 1, open: 1 }), 'open');
    assert.equal(resolveViseme('open', { squiggle: 1 }), 'squiggle', 'falls back to whatever exists');
});

test('text lipsync: mouth moves only where there is voice', () => {
    const t = visemesFromText('m', 'Mama saw five boats', probeSignal(), { sampleRate: SR, fps: 24 });
    assert.equal(trackValueAt(t, 1.5), 'closed', 'closed through the silence');
    assert.ok(t.keys.length > 3, 'several shape changes');
    assert.ok(t.keys.length < 72, 'keys only on change, not one per frame');
    for (const k of t.keys) assert.equal(k.ease, 'step', 'visemes never blend');
});

test('phoneme lipsync is used when timings are available', () => {
    const t = visemesFromPhonemes('m', [
        { p: 'm', start: 0, end: 0.1 },
        { p: 'ɑ', start: 0.1, end: 0.3 },
        { p: 'f', start: 0.3, end: 0.5 },
    ], { fps: 24, offsetSec: 0.6, durationSec: 0.5 });
    assert.equal(trackValueAt(t, 0.65), 'closed', 'offset applied, m is a closure');
    assert.equal(trackValueAt(t, 0.75), 'open');
    assert.equal(trackValueAt(t, 0.95), 'teeth');
    assert.equal(trackValueAt(t, 1.2), 'closed', 'returns to rest after the line');
});

test('envelope lipsync is the three-shape floor', () => {
    const t = visemesFromEnvelope('m', probeSignal(), { sampleRate: SR, fps: 24 });
    const used = new Set(t.keys.map((k) => k.v));
    for (const v of used) assert.ok(['closed', 'mid', 'open'].includes(v));
    assert.ok(used.has('closed') && used.has('open'), 'uses the range');
});

test('lipsyncLine picks the best available tier', () => {
    const samples = probeSignal();
    const phon = lipsyncLine('m', { text: 'hi', samples, sampleRate: SR, phonemes: [{ p: 'm', start: 0, end: 0.2 }] });
    assert.equal(trackValueAt(phon, 0.05), 'closed', 'phonemes win');

    const text = lipsyncLine('m', { text: 'five', samples, sampleRate: SR });
    assert.ok(new Set(text.keys.map((k) => k.v)).has('teeth'), 'text tier recovers teeth');

    const amp = lipsyncLine('m', { samples, sampleRate: SR });
    assert.ok(amp.keys.length > 1, 'amplitude tier still animates');

    const none = lipsyncLine('m', { text: 'hi' });
    assert.equal(none.keys.length, 1, 'with nothing to go on, hold closed');
    assert.equal(none.keys[0].v, 'closed');
});
