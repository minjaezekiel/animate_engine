/**
 * Narration pacing, estimated from a compiled film before anything renders.
 *
 * Why before: `scripts/narration-pacing.mjs` measures pacing from finished
 * audio, and running it over our own output is how we learnt the geology
 * series was leaving roughly a fifth of its runtime silent. That was found
 * after ten parts had been rendered. Most of it is derivable from dialogue
 * text and derived shot durations, so it can be a diagnostic next to the
 * staging ones instead.
 *
 * ## What this measures, and what it does NOT
 *
 * This reports **line coverage**: the fraction of runtime with a line
 * playing. The audio tool reports **speech ratio**: the fraction of frames
 * with voice energy in them. They are different quantities and conflating
 * them was the first version of this module.
 *
 * Measured on the same film, part one of the geology series: line coverage
 * 81%, speech ratio 54%. The gap is intra-line pause -- commas, sentence
 * breaks, breaths -- which the envelope excludes and a line span includes.
 * The audio tool's "phrases" are breath groups at 1.1-1.4s; a line here is
 * about 10s. One is not an estimate of the other, and no calibration factor
 * makes it one, because the references' 73% speech ratio would imply a line
 * coverage above 100%.
 *
 * Coverage is still the right thing to check here, because it is exactly the
 * quantity that catches the defect we actually had: **shot lengths set before
 * the narration was written**, which shows up as silence BETWEEN lines.
 * Intra-line pause is ordinary speech and not a defect. So:
 *
 *   100% - coverage  =  silence no line is even trying to fill.
 *
 * It cannot see picture pacing at all -- cuts, scene changes, whether
 * anything is moving. See docs/27-RETENTION.md.
 */

/**
 * Words per minute by language, over the whole span of a line including its
 * internal pauses. Both figures are measured from synthesis, not assumed. An
 * estimator that silently used English for a Swahili film would misreport it,
 * so the figure used is always reported.
 *
 * `sw` was first recorded as 142 from a single 16-word sentence. Measured
 * properly across 21 lines of a real film it is 147.
 */
export const WORD_RATES = { sw: 147, en: 150 };
export const DEFAULT_WORD_RATE = 150;

/**
 * Syllables per second, where that predicts better than words.
 *
 * Measured over 21 synthesised Swahili lines, against their real audio
 * durations:
 *
 *   words per minute   147      11% line-to-line variation
 *   characters/second  16.1      6%
 *   SYLLABLES/second    6.50     5.6%
 *
 * Swahili orthography is very nearly phonetic and every vowel letter is a
 * syllable nucleus, so counting vowels counts syllables -- which is why it
 * halves the error. Word count is a poor predictor there because Swahili word
 * length varies so much: `tu` and `kinachopatikana` are both one word.
 *
 * English is NOT in this table on purpose. Its spelling is not phonetic --
 * silent `e`, vowel digraphs -- so a vowel count is not a syllable count, and
 * no English measurement has been taken to justify a figure. Words remain the
 * estimator there.
 */
export const SYLLABLE_RATES = { sw: 6.50 };

/** Syllables, for a language where a vowel letter is a syllable nucleus. */
export const syllablesIn = (text) =>
    (String(text ?? '').match(/[aeiouAEIOU]/g) ?? []).length;

export const PACING_TARGETS = {
    /**
     * Line coverage floor. Calibrated against our own films, since coverage
     * cannot be measured from a reference's audio: the geology parts that
     * read well run 81-82%, and the one that drags runs 70% with a 4.4s
     * lead-in and a 5.1s hole in the middle.
     */
    coverage: 0.75,
    /** The hook window. The platforms all decide inside 1-3s. */
    hookWindow: 8,
    /**
     * Coverage inside the hook window. Higher than the film floor on
     * purpose: the references front-load, running 78-87% speech in their
     * first eight seconds against 72-73% after.
     */
    hookCoverage: 0.80,
    /** A title card in front of the first word spends the whole window. */
    firstWord: 1.0,
    /** Longest silence between lines, excluding the tail. */
    gap: 2.5,
    /** After the last line. An end card is about five seconds. */
    tail: 6,
    /** Two lines closer than this are one run. */
    bridge: 0.18,
};

/** Language tag out of a provider spec: 'tts:sw_CD-lanfrica-medium' -> 'sw'. */
export function langOfSpec(spec) {
    const m = /(?:^|:)([a-z]{2})_[A-Z]{2}-/.exec(String(spec ?? ''));
    return m ? m[1] : null;
}

export const wordsIn = (text) =>
    String(text ?? '').trim().split(/\s+/).filter(Boolean).length;

/**
 * How long a line occupies, first word to last.
 *
 * `rate` divides, because delivery rate shortens the line -- which is why
 * raising a narrator's rate is a pacing edit to the whole film.
 */
export function estimateLine(text, { lang = null, rate = 1 } = {}) {
    if (!wordsIn(text)) return 0;
    const sps = SYLLABLE_RATES[lang];
    if (sps) return syllablesIn(text) / sps / (rate || 1);
    const wpm = WORD_RATES[lang] ?? DEFAULT_WORD_RATE;
    return (wordsIn(text) / wpm) * 60 / (rate || 1);
}

/** Merge overlapping or near-touching line spans into runs. */
function runsOf(intervals, bridge) {
    const sorted = [...intervals].sort((a, b) => a.start - b.start);
    const out = [];
    for (const span of sorted) {
        const last = out[out.length - 1];
        if (last && span.start - last.end <= bridge) last.end = Math.max(last.end, span.end);
        else out.push({ start: span.start, end: span.end });
    }
    return out;
}

const totalOf = (spans) => spans.reduce((n, s) => n + (s.end - s.start), 0);

/** Clip a span list to a window, keeping the part inside it. */
function clip(spans, from, to) {
    const out = [];
    for (const s of spans) {
        const start = Math.max(s.start, from);
        const end = Math.min(s.end, to);
        if (end > start) out.push({ start, end });
    }
    return out;
}

/**
 * @param {object} compiled  the result of `compileFilm`
 * @returns {object|null} null when the film has no dialogue at all
 */
export function analysePacing(compiled, targets = PACING_TARGETS) {
    const duration = compiled?.meta?.duration ?? 0;
    const jobs = (compiled?.lipsyncJobs ?? []).filter((j) => wordsIn(j.text) > 0);
    if (!duration || !jobs.length) return null;

    // One language per film in practice; the commonest wins the report, and
    // each line is still estimated with its own.
    const langCount = new Map();
    for (const j of jobs) {
        const lang = langOfSpec(j.voiceSpec);
        if (lang) langCount.set(lang, (langCount.get(lang) ?? 0) + 1);
    }
    const lang = [...langCount.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const spans = jobs.map((j) => {
        const lineLang = langOfSpec(j.voiceSpec) ?? lang;
        const seconds = estimateLine(j.text, { lang: lineLang, rate: j.delivery?.rate ?? 1 });
        return { start: j.at, end: Math.min(duration, j.at + seconds), speaker: j.speaker };
    }).filter((s) => s.end > s.start);

    const runs = runsOf(spans, targets.bridge);
    const spoken = totalOf(runs);
    const words = jobs.reduce((n, j) => n + wordsIn(j.text), 0);

    // --- the hook: the first `hookWindow` seconds, on its own
    const hookEnd = Math.min(targets.hookWindow, duration);
    const hookRuns = clip(runs, 0, hookEnd);
    const hook = {
        window: hookEnd,
        coverage: hookEnd > 0 ? totalOf(hookRuns) / hookEnd : 0,
        firstWord: runs[0]?.start ?? duration,
    };

    // --- silence. The lead-in counts as a gap: it is the most expensive
    // silence in the film. The tail is reported separately because an end
    // card is deliberate.
    let gap = { seconds: runs[0].start, at: 0 };
    for (let i = 1; i < runs.length; i++) {
        const g = runs[i].start - runs[i - 1].end;
        if (g > gap.seconds) gap = { seconds: g, at: runs[i - 1].end };
    }
    const tail = Math.max(0, duration - runs[runs.length - 1].end);

    const scenes = (compiled.sceneSpans ?? []).map((sp, i) => {
        const len = sp.end - sp.start;
        return {
            id: sp.id ?? `scene${i}`, start: sp.start, end: sp.end,
            coverage: len > 0 ? totalOf(clip(runs, sp.start, sp.end)) / len : 0,
        };
    });

    const report = {
        duration,
        lines: jobs.length,
        words,
        lang,
        wordRate: WORD_RATES[lang] ?? DEFAULT_WORD_RATE,
        wordRateSource: SYLLABLE_RATES[lang]
            ? `${SYLLABLE_RATES[lang]} syllables/s, measured for "${lang}"`
            : (WORD_RATES[lang] ? `${WORD_RATES[lang]} wpm, measured for "${lang}"`
                                : `${DEFAULT_WORD_RATE} wpm, default`),
        spoken,
        coverage: spoken / duration,
        /**
         * Words per minute of RUNTIME, not of speaking time. Over speaking
         * time it would be the authored word rate by construction -- the
         * first version reported exactly that and it told you nothing.
         */
        density: (words / duration) * 60,
        runs: runs.length,
        longestRun: runs.reduce((m, s) => Math.max(m, s.end - s.start), 0),
        hook,
        gap,
        tail,
        scenes,
    };
    report.diagnostics = pacingDiagnostics(report, targets);
    return report;
}

const s1 = (v) => v.toFixed(1);
const pc = (v) => `${Math.round(v * 100)}%`;

/**
 * Advisory only -- `warning` and `info`, never `error`. A gap is sometimes
 * correct: a beat of silence on a reveal is acting. The check exists so that
 * the choice is made rather than inherited from shot lengths that were set
 * before the narration was written.
 */
export function pacingDiagnostics(report, targets = PACING_TARGETS) {
    const out = [];
    const at = 'pacing';

    if (report.coverage < targets.coverage) {
        out.push({
            severity: 'warning', path: at,
            message: `${pc(report.coverage)} line coverage against a ${pc(targets.coverage)} `
                + `floor. ${s1(report.duration - report.spoken)}s of this film has no line `
                + 'playing at all. That is not intra-line pause, which is ordinary speech -- '
                + 'it is the gaps between lines, which come from shot lengths set before the '
                + 'narration was written.',
        });
    }

    if (report.hook.firstWord > targets.firstWord) {
        out.push({
            severity: 'warning', path: `${at}.hook`,
            message: `The first word lands at ${s1(report.hook.firstWord)}s. Every platform `
                + 'this ships to decides inside 1-3s, so a title card or an establishing beat '
                + 'in front of the first line spends the window.',
        });
    }
    if (report.hook.coverage < targets.hookCoverage) {
        out.push({
            severity: 'warning', path: `${at}.hook`,
            message: `The first ${s1(report.hook.window)}s is ${pc(report.hook.coverage)} `
                + `covered, under ${pc(targets.hookCoverage)}. The references front-load: `
                + '78-87% speech in their opening against 72-73% after, in longer unbroken '
                + 'phrases. A pause in the first eight seconds is an exit.',
        });
    }

    if (report.gap.seconds > targets.gap) {
        out.push({
            severity: 'warning', path: `${at}.gap`,
            message: `${s1(report.gap.seconds)}s with no line at ${s1(report.gap.at)}s, over a `
                + `${s1(targets.gap)}s limit. `
                + (report.gap.at === 0
                    ? 'This is the lead-in, which is the most expensive silence in the film.'
                    : 'Either shorten the shot or write into it.'),
        });
    }
    if (report.tail > targets.tail) {
        out.push({
            severity: 'info', path: `${at}.tail`,
            message: `${s1(report.tail)}s after the last line. Retention falls off a cliff `
                + 'once the point lands, so an end card is about five seconds.',
        });
    }

    const slack = report.scenes.filter((s) => s.coverage < targets.coverage - 0.1);
    if (slack.length) {
        out.push({
            severity: 'info', path: `${at}.scenes`,
            message: `Slackest scenes: ${slack.slice(0, 4)
                .map((s) => `${s.id} ${pc(s.coverage)} @${s1(s.start)}s`).join(', ')}`
                + `${slack.length > 4 ? `, +${slack.length - 4} more` : ''}. `
                + 'A film under its floor is rarely uniformly slack.',
        });
    }

    out.push({
        severity: 'info', path: at,
        message: `${pc(report.coverage)} line coverage, ${report.lines} lines in `
            + `${report.runs} runs, ${Math.round(report.density)} words per minute of `
            + `runtime, hook ${pc(report.hook.coverage)} from ${s1(report.hook.firstWord)}s. `
            + `Line spans estimated at ${report.wordRateSource}. `
            + 'Coverage is not the speech ratio the audio tool measures: part one of the '
            + 'geology series is 81% covered and 54% voiced.',
    });
    return out;
}
