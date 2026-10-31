# Retention: hooks, pacing, and checking them before the render

The brief that produced this doc was commercial, not technical: the first
series scored ~100 views on Instagram and TikTok and ~250 on Facebook, and the
question was how to present the content better.

This is the engine's answer to that question, which is narrow on purpose. The
engine cannot make content interesting. It *can* stop a film shipping with a
measurable retention defect in it, the same way `check-film` already stops one
shipping with a character's feet off the ground.

## What the sources actually support

Searched and read rather than recalled. The honest summary is that the
qualitative advice is consistent across sources and **the numbers are mostly
vendor marketing**, so they are treated here as direction, not as targets.

Consistent across sources:

- The hook lands in the **first 1–3 seconds** on TikTok, Reels and Shorts.
  ([teleprompter.com](https://www.teleprompter.com/blog/tiktok-3-second-rule),
  [hansencommerce.com](https://hansencommerce.com/insights-tiktok-hook-3-seconds))
- Hooks that hold are **short** — under about 12 spoken words — and are one of
  a small number of shapes: an identity call, a contrarian claim, an open
  loop, or a confession.
  ([socialync.io](https://www.socialync.io/viral-hooks-library),
  [faceless.so](https://faceless.so/blog/17-hook-formulas-for-short-video-retention))
- **On-screen text is not optional**, because a large share of viewers watch
  muted. ([playplay.com](https://playplay.com/blog/video-hooks/))
- Early drop-off is itself a **distribution signal**, not merely a lost view.
  ([hypenest.ai](https://hypenest.ai/blogs/tiktok-algorithm-2026-video-hooks-retention))
- Educational pacing is **slower** than entertainment pacing — roughly 10
  scene changes in three minutes against about 30 — and "one idea per scene"
  beats maximising cuts.
  ([raffertyweiss.com](https://www.raffertyweiss.com/blog/making-animated-videos-for-education-impact-benefits-key-considerations),
  [increditors.com](https://increditors.com/video-pacing-youtube-retention-science/))
- Explainers typically hold well and then **drop sharply once the key point
  lands**, which argues for ending shortly after it does.
  ([educationalvoice.co.uk](https://educationalvoice.co.uk/animation-retention-rates-statistics/))

Explicitly not relied on: the "60–65% retention gain from animation" figures,
which trace to an animation vendor and to no named study; and the various
"average retention at 3 seconds" percentages, which disagree with each other
between sources.

## What we measured ourselves

This part is first-party, from `scripts/narration-pacing.mjs` run over the
reference videos and over our own output. It is the more useful half, because
it is the same quantity measured the same way on both sides.

| | narrated references | Finding Gold (ours) |
|---|---|---|
| speech ratio | **73%** | **54%** |
| phrase length | 1.1–1.4 s | 1.4–1.6 s |
| pauses/min | 32–34 | 20–22 |
| onsets/s | 2.1–2.6 | 2.1–2.2 |

And within the references, the opening is a different animal from the body:

| | first 8 s | after |
|---|---|---|
| speech ratio | 78–87% | 72–73% |
| phrase length | 2.0–2.4 s | 1.1–1.4 s |

Two findings fall out of that table, and they are the ones worth acting on.

**1. Our films are a fifth dead air.** 54% against 73%. Onsets per second
match almost exactly, so this is not about talking faster — the *speaking* is
fine. It is the gaps between lines, and the cause is structural: shot lengths
were set before the narration was written, so every shot has slack at the end.

**2. A hook is not a short sentence; it is a long unbroken one.** This is the
counter-intuitive result and it contradicts the "keep it snappy" advice. The
references open with *fewer, longer* phrases than they use later — 2.0–2.4 s
unbroken against 1.1–1.4 s in the body. The opening does not pause. A pause in
the first eight seconds is an exit, so the hook is one continuous run of
speech and the breathing starts afterwards.

## The engine change: a pacing report in `check-film`

Most of this is derivable from compiled dialogue before anything is rendered.
Dialogue carries text and a start time, shots carry derived durations, and a
line's span estimates from its word count at a measured rate. So the slack can
be a diagnostic next to the staging ones instead of something found afterwards
with a tool on the finished MP4.

### What it reports, and what it does *not*

The first version of this module reported "speech ratio" and was wrong, in a
way worth recording because it looked entirely plausible.

`check-film` can only estimate **line coverage**: the fraction of runtime with
a line playing. The audio tool measures **speech ratio**: the fraction of
frames with voice energy in them. Measured on the same film — part one of the
geology series — those are **81% and 54%**. The difference is intra-line
pause: commas, sentence breaks, breaths. An energy envelope excludes them and
a line span includes them. The audio tool's "phrases" are breath groups at
1.1–1.4 s; a *line* in part one averages about 10 s.

No calibration factor reconciles them, and trying is how the error is caught:
scaling 81% down to 54% implies a within-line voicing fraction of 0.67, and
applying that to the references' measured 73% speech ratio would require a
line coverage of **109%**. Impossible. They are simply two different
quantities.

Coverage is still the right thing to check here, because it is exactly the
quantity that catches the defect we actually had. Intra-line pause is ordinary
speech, not a defect. Silence *between* lines is the symptom of shot lengths
set before the narration was written. So:

> 100% − coverage = silence that no line is even trying to fill.

`src/core/script/pacing.js` reports, per film:

- **line coverage** — estimated line span over film duration.
- **hook** — coverage in the first 8 s, and when the first word lands.
- **longest gap** between lines, and where; the lead-in counts as one.
- **tail**, separately, because an end card is deliberate.
- **density** — words per minute of *runtime*. Over speaking time it would be
  the authored word rate by construction; the first version reported exactly
  that and it told you nothing.
- **per-scene coverage**, which localises the problem: a slack film is rarely
  uniformly slack, it is two or three slack scenes.

Thresholds, advisory `info`/`warning` and never errors:

| | warns below | from |
|---|---|---|
| line coverage | 0.75 | our own films: the parts that read well run 81–82% |
| hook coverage (first 8 s) | 0.80 | higher than the film floor; references front-load |
| first word | 1.0 s | every platform decides inside 1–3 s |
| longest gap | 2.5 s | over the longest gap in any reference |
| tail | 6 s (info) | retention falls off once the point lands |

Coverage thresholds are calibrated against **our own films**, not the
references, because coverage cannot be measured from someone else's audio —
it needs the script. The reference measurements still set the hook thresholds'
*shape* (front-load, don't pause early); they cannot set coverage's level.

Run over the ten geology parts, the check agrees with the editorial reading:
parts 1 and 10 pass at 81–82% with only a long-tail note, and **part 4 is
flagged** at 70% with its first word at 4.4 s, a 5.1 s hole at 28.9 s, and the
two field scenes named at 36% and 29%.

The word-rate estimate uses the one thing measured directly: the Swahili voice
produced 16 words in 6.77 s, i.e. **142 wpm**; `en_GB-alba-medium` sits near
150. The per-language figure is used and reported, because an estimate that
silently assumed English would misreport every Swahili film.

### Honest limits

- It is an **estimate**, not a measurement, and of a *different quantity* from
  the audio tool. Both are worth having; neither substitutes for the other.
  After a render, `narration-pacing.mjs` is still the ground truth.
- It cannot see **picture** pacing at all — cuts per minute, scene changes,
  whether anything is moving. The sources above are clear that those matter,
  and `check-film` has no opinion on them.
- Low coverage is **sometimes correct**. A beat of silence on a reveal is
  acting. Hence `warning`, never `error`.

## The authoring rules that follow

These are editorial, enforced by nobody, and they are what the series built
against this doc actually does.

1. **The hook is shot one and carries no title.** Title cards come after it.
   A card in the first two seconds spends the window on a logo.
2. **The hook is one unbroken sentence of 8–12 words**, and the next line
   starts before any pause has a chance to register.
3. **Write the narration, then derive the shot length from it.** The reverse
   order is the documented cause of our 54%.
4. **Every line is also on screen.** Muted viewers are most viewers.
5. **One idea per scene**, ~10 scenes in 2:30, not 30.
6. **Open a loop in the first 15 seconds and close it in the last 20.** It is
   the only thing that makes the end of an explainer worth reaching.
7. **Stop when the point lands.** Retention falls off a cliff after it; an
   end card is five seconds, not twenty.

## Tests

`test/core/pacing.test.mjs`:

- A film of known dialogue and duration gives the arithmetic coverage.
- The hook window measures the first 8 s only, and a line straddling the
  boundary is counted for the part inside it.
- Two lines separated by less than 180 ms are one run (the same bridging
  `narration-pacing.mjs` needed — without it that analyser measured syllables
  and reported 40–140 ms "phrases" while looking entirely correct).
- The longest gap is found and located; the lead-in counts, the tail does not.
- A film with no dialogue reports no pacing rather than dividing by zero.
- Word rate is taken per language, and the chosen figure is stated — asserted
  by giving the same text an English and a Swahili voice and requiring
  different spans.
- Density is words per minute of runtime, asserted to differ from the
  authored word rate.
- A slack scene is named.
- Every diagnostic is `warning` or `info`, never `error`, so a check cannot be
  failed by a deliberate silence.
- The summary note states the 81%-covered / 54%-voiced pair outright, so the
  two metrics cannot quietly be conflated again.
