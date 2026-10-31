import { test } from 'node:test';
import assert from 'node:assert/strict';

import { speechRms, normalizeGain, toDb } from '../../src/core/audio/loudness.js';
import { VOICE_PRESETS, voicesFor, resolveVoices, castEnsemble } from '../../src/core/voice/catalog.js';
import { castVoices } from '../../src/core/voice/synthesize.js';
import { compileFilm } from '../../src/core/script/compile.js';

/**
 * Voices: casting by role, and matching their levels.
 *
 * The measurement that prompted the levelling: the same sentence through
 * `sw_CD-lanfrica-medium` and `en_GB-alba-medium` came back at RMS 0.095 and
 * 0.044 -- 2.1x, about 6.6 dB. In a five-hander that is one character
 * shouting for no reason the author can see.
 */

const SR = 48000;
const tone = (amp, secs, { silentFor = 0 } = {}) => {
    const n = Math.round(SR * secs);
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) {
        const t = i / SR;
        a[i] = t < silentFor ? 0 : amp * Math.sin(2 * Math.PI * 180 * t);
    }
    return a;
};

// --- loudness --------------------------------------------------------------

test('silence does not drag the measurement down', () => {
    // This is the whole reason the measure is per-frame rather than whole-buffer:
    // a line that is mostly pause would otherwise be amplified until its few
    // words were shouted.
    const full = speechRms(tone(0.4, 1), SR).rms;
    const sparse = speechRms(tone(0.4, 1, { silentFor: 0.8 }), SR).rms;
    assert.ok(Math.abs(full - sparse) < 1e-6, `${full} vs ${sparse}`);
});

test('a loud take is turned down and a quiet one up, toward one target', () => {
    const loud = tone(0.4, 1), quiet = tone(0.05, 1);
    const gl = normalizeGain(loud, SR, { target: 0.06 });
    const gq = normalizeGain(quiet, SR, { target: 0.06 });
    assert.ok(gl < 1, `loud gain ${gl}`);
    assert.ok(gq > 1, `quiet gain ${gq}`);
    const after = (s, g) => speechRms(s.map((v) => v * g), SR).rms;
    assert.ok(Math.abs(after(loud, gl) - after(quiet, gq)) < 0.01,
        'after levelling the two takes sit together');
});

test('normalising never pushes a signal into clipping', () => {
    const hot = tone(0.95, 1);
    const g = normalizeGain(hot, SR, { target: 0.9, maxGain: 8 });
    assert.ok(speechRms(hot.map((v) => v * g), SR).peak <= 0.971,
        'a normaliser that clips is worse than no normaliser');
});

test('a nearly silent take is not amplified into noise', () => {
    assert.ok(normalizeGain(tone(0.00002, 1), SR, { target: 0.06, maxGain: 4 }) <= 4);
});

test('nothing to measure is a no-op, not a throw', () => {
    assert.equal(normalizeGain(new Float32Array(0), SR), 1);
    assert.equal(normalizeGain(new Float32Array(1000), SR), 1, 'pure silence');
});

test('the measured gap between the two real voices closes', () => {
    // Standing in for the measured RMS of each: 0.0948 and 0.0441.
    const sw = tone(0.134, 1);     // rms ~0.0948
    const en = tone(0.0624, 1);    // rms ~0.0441
    const gap = speechRms(sw, SR).rms / speechRms(en, SR).rms;
    assert.ok(gap > 2, `the untreated gap is ${toDb(gap)} dB`);
    const after = speechRms(sw.map((v) => v * normalizeGain(sw, SR)), SR).rms
        / speechRms(en.map((v) => v * normalizeGain(en, SR)), SR).rms;
    assert.ok(Math.abs(toDb(after)) < 1, `after levelling, ${toDb(after)} dB apart`);
});

// --- the catalogue ---------------------------------------------------------

test('every preset names a provider and a voice id', () => {
    for (const [id, v] of Object.entries(VOICE_PRESETS)) {
        assert.match(v.spec, /^[a-z]+:.+/, `${id} has a malformed spec`);
        assert.ok(v.lang && v.role, `${id} is missing lang or role`);
    }
});

test('voices can be found by language', () => {
    assert.ok(voicesFor('en').length >= 6);
    assert.deepEqual(voicesFor('sw'), ['narrator-sw']);
    assert.deepEqual(voicesFor('xx'), []);
});

test('a five-hander gets five DISTINCT English voices', () => {
    const { cast, shortfall } = castEnsemble(5, { lang: 'en' });
    assert.equal(cast.length, 5);
    assert.equal(new Set(cast).size, 5, 'two characters sharing a voice is noticed immediately');
    assert.equal(shortfall, 0);
});

test('a language with one voice says so rather than failing silently', () => {
    const { cast, shortfall } = castEnsemble(5, { lang: 'sw' });
    assert.equal(cast.length, 5);
    assert.equal(shortfall, 4, 'the caller is told it cannot distinguish them by timbre');
});

test('a preset name resolves to a spec, and a raw spec passes through', () => {
    const { voices } = resolveVoices({
        a: 'narrator-f-en',
        b: { spec: 'elder-m-en', gain: 0.8 },
        c: 'tts:en_US-amy-medium',
    });
    assert.equal(voices.a.spec, 'tts:en_GB-alba-medium');
    assert.equal(voices.b.spec, 'tts:en_GB-northern_english_male-medium');
    assert.equal(voices.b.gain, 0.8, 'the trim survives resolution');
    assert.equal(voices.c.spec, 'tts:en_US-amy-medium', 'a raw spec is untouched');
});

test('an unknown preset warns and lists the known ones', () => {
    const { diagnostics } = resolveVoices({ a: 'does-not-exist' });
    assert.equal(diagnostics.length, 1);
    assert.match(diagnostics[0].message, /Unknown voice preset "does-not-exist"/);
    assert.match(diagnostics[0].message, /narrator-f-en/);
});

// --- casting through a film ------------------------------------------------

const ensemble = (voices) => ({
    version: 'jirex.film/1',
    meta: { fps: 24, width: 1280, height: 720 },
    voices,
    characters: Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map((k) => [k, {
        generate: { build: 'slim' }, proportions: { height: 300 }, voice: k,
    }])),
    scenes: [{ id: 's1',
        cast: ['a', 'b', 'c', 'd', 'e'].map((k, i) => ({ character: k, as: k, at: [150 + i * 220, 0] })),
        shots: [{ id: 'x', duration: 6, dialogue: ['a', 'b', 'c', 'd', 'e'].map((k, i) => ({
            speaker: k, at: i * 1.1, text: `Line from ${k}.` })) }] }],
});

test('five characters can carry five different voices, cast by role', () => {
    const { cast } = castEnsemble(5, { lang: 'en' });
    const film = ensemble(Object.fromEntries(['a', 'b', 'c', 'd', 'e']
        .map((k, i) => [k, cast[i]])));
    const { castBySpeaker, diagnostics } = castVoices(film);
    assert.deepEqual(diagnostics, []);
    assert.equal(Object.keys(castBySpeaker).length, 5);
    assert.equal(new Set(Object.values(castBySpeaker)).size, 5, 'five distinct specs');
});

test('a per-voice gain reaches the dialogue job, separate from the line gain', () => {
    const film = ensemble({
        a: { spec: 'narrator-f-en', gain: 0.5 },
        b: 'elder-m-en', c: 'young-f-en', d: 'bright-f-en', e: 'narrator-m-en',
    });
    film.scenes[0].shots[0].dialogue[0].gain = 0.5;
    const r = compileFilm(film);
    const job = r.lipsyncJobs.find((j) => j.speaker === 'a');
    assert.equal(job.voiceGain, 0.5, 'the voice trim');
    assert.equal(job.gain, 0.5, 'and the line trim, kept apart');
    assert.equal(r.lipsyncJobs.find((j) => j.speaker === 'b').voiceGain, 1);
});

test('a Swahili film casts and compiles', () => {
    const film = ensemble({ a: 'narrator-sw', b: 'narrator-sw', c: 'narrator-sw',
                            d: 'narrator-sw', e: 'narrator-sw' });
    film.scenes[0].shots[0].dialogue[0].text = 'Habari yako rafiki. Tutatafuta dhahabu.';
    const r = compileFilm(film);
    assert.deepEqual(r.diagnostics.filter((d) => d.severity === 'error'), []);
    assert.equal(r.lipsyncJobs.length, 5);
    assert.ok(r.lipsyncJobs.every((j) => j.voiceSpec === 'tts:sw_CD-lanfrica-medium'));
});
