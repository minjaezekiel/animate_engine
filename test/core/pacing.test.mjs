import test from 'node:test';
import assert from 'node:assert/strict';

import { analysePacing, estimateLine, langOfSpec, wordsIn,
         WORD_RATES, PACING_TARGETS } from '../../src/core/script/pacing.js';
import { compileFilm } from '../../src/core/script/compile.js';

/**
 * Line coverage, estimated before a render. See docs/27-RETENTION.md.
 *
 * The thing to hold onto: coverage is NOT the speech ratio the audio tool
 * measures. Part one of the geology series is 81% covered and 54% voiced,
 * because a line span includes its internal pauses and an energy envelope
 * does not. Conflating them was the first version of this module and it made
 * every threshold meaningless.
 */

/** A film of `lines` = [[at, text], ...] inside one shot of `duration`. */
const filmOf = (duration, lines, { voice = 'tts:en_GB-alba-medium', scenes = null } = {}) => ({
    version: 'jirex.film/1',
    meta: { title: 'p', width: 1080, height: 1920, fps: 24 },
    voices: { v: voice },
    characters: { n: { voice: 'v', generate: { kind: 'human' } } },
    scenes: scenes ?? [{
        id: 's1', cast: [{ as: 'n', character: 'n', at: [540, 1250] }],
        shots: [{ id: 'h1', duration,
                  dialogue: lines.map(([at, text]) => ({ speaker: 'n', text, at })) }],
    }],
});

const pacingOf = (film) => analysePacing(compileFilm(film, { assets: null }));

// ---------------------------------------------------------------------------
// The estimator
// ---------------------------------------------------------------------------

test('a line span is words over the language word rate', () => {
    // 150 words at 150 wpm is one minute.
    const text = Array.from({ length: 150 }, () => 'neno').join(' ');
    assert.equal(wordsIn(text), 150);
    assert.equal(+estimateLine(text, { lang: 'en' }).toFixed(4), 60);
    // Swahili is measured separately, and slower.
    assert.equal(+estimateLine(text, { lang: 'sw' }).toFixed(4),
                 +((150 / WORD_RATES.sw) * 60).toFixed(4));
    assert.ok(estimateLine(text, { lang: 'sw' }) > estimateLine(text, { lang: 'en' }),
        'a Swahili film must not be estimated at the English rate');
});

test('delivery rate shortens the line, because it actually does', () => {
    const text = 'moja mbili tatu nne tano sita saba nane';
    const plain = estimateLine(text, { lang: 'sw' });
    assert.equal(+estimateLine(text, { lang: 'sw', rate: 1.25 }).toFixed(5),
                 +(plain / 1.25).toFixed(5));
    assert.ok(estimateLine(text, { lang: 'sw', rate: 0.8 }) > plain);
});

test('empty and absent text cost nothing', () => {
    assert.equal(estimateLine(''), 0);
    assert.equal(estimateLine(null), 0);
    assert.equal(estimateLine('   '), 0);
});

test('the language comes off the voice spec', () => {
    assert.equal(langOfSpec('tts:sw_CD-lanfrica-medium'), 'sw');
    assert.equal(langOfSpec('tts:en_GB-alba-medium'), 'en');
    assert.equal(langOfSpec('file:take-03.wav'), null);
    assert.equal(langOfSpec(undefined), null);
});

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

test('coverage is the arithmetic fraction of runtime with a line playing', () => {
    // 50 words at 150 wpm = 20s of line, in a 40s film.
    const text = Array.from({ length: 50 }, () => 'word').join(' ');
    const r = pacingOf(filmOf(40, [[0, text]]));
    assert.equal(+r.coverage.toFixed(3), 0.5);
    assert.equal(+r.spoken.toFixed(3), 20);
    assert.equal(r.duration, 40);
    assert.equal(r.words, 50);
});

test('a film with no dialogue reports nothing rather than dividing by zero', () => {
    assert.equal(pacingOf(filmOf(10, [])), null);
    assert.equal(pacingOf(filmOf(10, [[0, '   ']])), null);
});

test('density is words per minute of RUNTIME, not of speaking time', () => {
    // Over speaking time it would be the authored word rate by construction,
    // which is what the first version reported, and it told you nothing.
    const text = Array.from({ length: 50 }, () => 'word').join(' ');
    const r = pacingOf(filmOf(60, [[0, text]]));
    assert.equal(+r.density.toFixed(3), 50);
    assert.notEqual(Math.round(r.density), r.wordRate);
});

test('the word rate used is reported, so a Swahili film is not read as English', () => {
    const sw = pacingOf(filmOf(40, [[0, 'moja mbili tatu nne tano']],
                                { voice: 'tts:sw_CD-lanfrica-medium' }));
    assert.equal(sw.lang, 'sw');
    assert.equal(sw.wordRate, WORD_RATES.sw);
    assert.match(sw.wordRateSource, /measured/);
    const unknown = pacingOf(filmOf(40, [[0, 'a b c d e']], { voice: 'file:take.wav' }));
    assert.equal(unknown.lang, null);
    assert.equal(unknown.wordRateSource, 'default');
});

// ---------------------------------------------------------------------------
// Runs and the bridge
// ---------------------------------------------------------------------------

test('two lines closer than the bridge are ONE run', () => {
    // Without the bridge the analyser counts syllables: the first version of
    // the audio tool reported medians of 40-140ms and looked plausible.
    const w = Array.from({ length: 25 }, () => 'word').join(' ');   // 10s each
    const joined = pacingOf(filmOf(40, [[0, w], [10.1, w]]));
    assert.equal(joined.runs, 1, 'a 0.1s gap is a breath, not a pause');
    assert.equal(+joined.longestRun.toFixed(1), 20.1);
    const split = pacingOf(filmOf(40, [[0, w], [13, w]]));
    assert.equal(split.runs, 2, 'a 3s gap is a pause');
});

// ---------------------------------------------------------------------------
// The hook
// ---------------------------------------------------------------------------

test('the hook window measures the first 8s only', () => {
    const w = Array.from({ length: 10 }, () => 'word').join(' ');   // 4s
    const r = pacingOf(filmOf(60, [[0, w], [30, w]]));
    assert.equal(r.hook.window, PACING_TARGETS.hookWindow);
    assert.equal(+r.hook.coverage.toFixed(3), 0.5, '4s of line in the first 8s');
});

test('a line straddling the window edge is counted for the part inside it', () => {
    const w = Array.from({ length: 30 }, () => 'word').join(' ');   // 12s, from 2s
    const r = pacingOf(filmOf(60, [[2, w]]));
    assert.equal(+r.hook.coverage.toFixed(4), +((8 - 2) / 8).toFixed(4));
});

test('a late first word is reported, because it is the costliest silence', () => {
    const r = pacingOf(filmOf(60, [[5, 'moja mbili tatu nne tano sita']]));
    assert.equal(r.hook.firstWord, 5);
    const warned = r.diagnostics.filter((d) => d.path === 'pacing.hook');
    assert.ok(warned.some((d) => /first word lands at 5\.0s/.test(d.message)));
    assert.equal(r.gap.at, 0, 'the lead-in IS the longest gap here');
    assert.equal(r.gap.seconds, 5);
});

// ---------------------------------------------------------------------------
// Gaps and the tail
// ---------------------------------------------------------------------------

test('the longest gap between lines is found and located', () => {
    const w = Array.from({ length: 10 }, () => 'word').join(' ');   // 4s
    const r = pacingOf(filmOf(60, [[0, w], [6, w], [20, w]]));
    assert.equal(+r.gap.seconds.toFixed(3), 10, '10 - 4 - 6');
    assert.equal(+r.gap.at.toFixed(3), 10);
});

test('the tail is reported separately from a gap: an end card is deliberate', () => {
    const w = Array.from({ length: 10 }, () => 'word').join(' ');   // 4s
    const r = pacingOf(filmOf(30, [[0, w]]));
    assert.equal(+r.tail.toFixed(3), 26);
    assert.equal(r.gap.seconds, 0, 'trailing silence is not counted as a gap');
    const tailNote = r.diagnostics.find((d) => d.path === 'pacing.tail');
    assert.equal(tailNote.severity, 'info', 'an end card is a note, not a warning');
});

// ---------------------------------------------------------------------------
// Per-scene localisation
// ---------------------------------------------------------------------------

test('a slack stretch is localised to the scene it is in', () => {
    const w = Array.from({ length: 50 }, () => 'word').join(' ');   // 20s
    const film = filmOf(0, [], { scenes: [
        { id: 'busy', cast: [{ as: 'n', character: 'n', at: [540, 1250] }],
          shots: [{ id: 'a', duration: 22, dialogue: [{ speaker: 'n', text: w, at: 0 }] }] },
        { id: 'empty', cast: [{ as: 'n', character: 'n', at: [540, 1250] }],
          shots: [{ id: 'b', duration: 20, actions: [] }] },
    ] });
    const r = pacingOf(film);
    const busy = r.scenes.find((s) => s.id === 'busy');
    const empty = r.scenes.find((s) => s.id === 'empty');
    assert.ok(busy.coverage > 0.85, `busy scene covered: ${busy.coverage}`);
    assert.equal(empty.coverage, 0);
    const note = r.diagnostics.find((d) => d.path === 'pacing.scenes');
    assert.match(note.message, /empty/);
});

// ---------------------------------------------------------------------------
// Severity: this must never fail a check
// ---------------------------------------------------------------------------

test('nothing pacing reports is ever an error', () => {
    // A beat of silence on a reveal is acting. The check exists so the choice
    // is made, not so it is forbidden.
    const r = pacingOf(filmOf(300, [[200, 'neno moja tu']]));
    assert.ok(r.diagnostics.length >= 3, 'this film is as slack as a film can be');
    for (const d of r.diagnostics) {
        assert.ok(d.severity === 'warning' || d.severity === 'info',
            `${d.path} is ${d.severity}; pacing must not fail a check`);
        assert.ok(String(d.path).startsWith('pacing'));
    }
});

test('a well-paced film reports only the summary note', () => {
    const w = Array.from({ length: 24 }, () => 'word').join(' ');   // 9.6s
    const r = pacingOf(filmOf(40, [[0.4, w], [10.2, w], [20, w], [30, w]]));
    assert.ok(r.coverage >= PACING_TARGETS.coverage, `coverage ${r.coverage}`);
    assert.ok(r.hook.coverage >= PACING_TARGETS.hookCoverage, `hook ${r.hook.coverage}`);
    assert.equal(r.diagnostics.filter((d) => d.severity === 'warning').length, 0,
        r.diagnostics.map((d) => d.message).join(' | '));
});

// ---------------------------------------------------------------------------
// The real films, which is what the thresholds were calibrated against
// ---------------------------------------------------------------------------

test('the summary note states that coverage is not the audio speech ratio', () => {
    const r = pacingOf(filmOf(40, [[0, 'moja mbili tatu nne']]));
    const summary = r.diagnostics.find((d) => d.path === 'pacing' && d.severity === 'info');
    assert.match(summary.message, /81% covered and 54% voiced/,
        'the one number that stops the two metrics being conflated again');
});
