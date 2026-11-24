# "Reading the Market" / "Kusoma Soko" — the forex series

Ten parts, two languages, twenty films. 1080×1920, ~90 s each, for phone
feeds. English 15:10, Swahili 13:36.

```bash
npm run make:forex                        # every part, both languages
PART=1 node scripts/make-forex.mjs        # one part, both languages
LANG=sw node scripts/make-forex.mjs       # one language, every part
PART=2,3 LANG=en node scripts/make-forex.mjs
```

Sources: `scripts/lib/forex.mjs` (cast, palette, voices),
`scripts/forex/common.mjs` (market vocabulary), `scripts/forex/part-NN.mjs`,
driven by `scripts/make-forex.mjs`. Output: `films/forex/{en,sw}/part-NN.json`.

| Part | English | Swahili |
|---|---|---|
| 1 | "Forex is a scam" | "Forex ni utapeli" |
| 2 | What you actually bought | Ulichonunua hasa |
| 3 | Pips, lots and leverage | Pip, lot na leverage |
| 4 | MT4, MT5, the ticket | MT4, MT5, tiketi |
| 5 | What the candle says | Mshumaa unasema nini |
| 6 | Why price moves | Kwa nini bei inasogea |
| 7 | Who is on the other side | Nani yuko upande wa pili |
| 8 | What an indicator cannot do | Kiashiria hakiwezi nini |
| 9 | The only maths that matters | Hesabu pekee ya maana |
| 10 | The routine | Utaratibu |

## The brief, and the one place this series argues with it

The ask was for a beginner strategy that "would work 95% of the time". No
strategy does, and the only way to manufacture a 95% win rate is a tiny target
against a huge stop — which is precisely the pattern that empties beginner
accounts and earns forex the reputation the series exists to answer. Producing
it as asked would have made these films the same kind of thing as the signal
sellers.

So **expectancy is the spine**, the 95% claim is demolished by name in part
one, and part ten hands the number back with its meaning repaired: of a
hundred charts the routine looks at, it says *no* to about ninety-five. The 95
is real. It was never the win rate.

The arithmetic agrees across parts one and nine to the last decimal, which
is deliberate — a viewer who checks it by hand gets the same answer twice:

```
E = (win% × reward_in_R) − (loss% × 1)

40% at 1:3     0.40 × 3    − 0.60 × 1  = +0.60   R per trade
95% at 1:0.05  0.95 × 0.05 − 0.05 × 1  = −0.0025 R per trade
```

The second line is "risk 100 to make 5", which is part one's demolition
restated in R.

## Figures that are on screen, and where they come from

- **$9.6 trn/day.** BIS Triennial Central Bank Survey, April 2025 (released
  30 Sep 2025), up 28% from $7.5 trn in 2022. The December 2025 BIS Quarterly
  Review states $9.5 trn for the same survey, so the narration says "nine and
  a half trillion" and is true on either basis.
  <https://www.bis.org/statistics/rpfx25_fx.htm>
- **~89% of trades have the dollar on one side.** Same survey. Currency shares
  sum to 200% because every trade has two sides — which part two uses as the
  point rather than a footnote.
- **70–80 of every 100 retail accounts lose.** Not a critic's claim: ESMA's
  2018 product-intervention measures and the FCA's equivalent *require* a CFD
  provider to publish the percentage of its own retail accounts that lost
  money over the preceding twelve months, recalculated quarterly.
  Aggregations across dozens of regulated brokers land around 71–76% average,
  individual firms roughly 51–85%.

That last one is the strongest beat in part one and it took a search to see
why: it is the broker's own legally-required disclosure, on the broker's own
homepage. The narration tells the viewer to go and read it, because a fact
checkable in ten seconds beats one taken on trust — which is the thesis of
the whole series.

Every end card carries `DISCLAIMER`: educational only, not financial advice,
trading carries risk of loss. No broker is named or recommended anywhere.

## The look — ink on paper

The first series here to stage on a **light** background. Measured off the
`anime8` reference: 576×1024, 30 fps, 75.2 s, mean RGB 150,154,137 across its
full length with a chroma spread of 18 — a real sage, not a grey. (`anime6`,
studied for `30-STRUCTURE-SERIES.md`, measured R=G=B and is genuinely
monochrome. They are not the same look.)

`anime8`'s structure is also unlike `anime6`'s: **no cut for the first 38
seconds**, then a cluster at 38.2 / 39.0 / 46.6 / 54.8, then the end card at
70.5. The long opening take is a push-in to an extreme close-up, not a hold —
and the close-up is a *different drawing*, not a zoom of the wide rig. That is
the directorial lesson this series took from it.

The cast is line art: black contour on paper, no fill in the clothing,
everything carried on eye size and mouth shape. Authored as explicit `parts` +
`mouth` characters the way `lib/physics.mjs` does its billiard balls, not
through `generate`. `08-ART-VOCABULARY.md` and Phase 37's fourth correction
both say the generated rig is a diagram of a person that falls apart in close
framing. This style *is* a diagram of a person, on purpose, so the weakness
becomes the look.

Subtitles invert the house style: dark ink with a **pale** halo. The
`#f2efe6`-over-`#04070a` stack the other four series use is invisible on sage.

## The cast

| | role | build | English model | Swahili (rate / pitch) |
|---|---|---|---|---|
| **Amara** | trades for a living, carries narration | tallest, 0.97, bun, narrow shoulders | `en_GB-cori-high` | 0.93 / 0.87 |
| **Juma** | burned once, asks what the viewer is thinking | shortest, 0.88, flat fade, wide | `en_GB-northern_english_male-medium` | 1.14 / 1.24 |
| **Mr Ninety-Five** | sells a signal group | 0.93, widest shoulders, sunglasses | `en_US-ryan-high` | 1.03 / 1.02 |

**Three different English models, separating on gender, accent and register at
once.** The first cast paired `en_GB-alan` with `en_US-hfc_male` — two adult
male voices at similar pitch, fine apart and muddy in the same film. Amara
gets the only `high`-quality model because she carries the narration in all
ten parts.

**Swahili has exactly one voice and that is a hard limit.** Checked against
the vits-web path map: 118 models, one Swahili (`sw_CD-lanfrica-medium`), and
`ar_JO-kareem` is the only other voice on the continent. So all three share it
and are separated by delivery. The spread here is wider than the stock
presets, which put `young-m-sw` (1.10/1.16) and `host-sw` (1.06/1.10) within
0.04 of each other on both dials — that is not a different person, it is the
same person on a different day. Genuinely different Swahili voices need
VoiceStudio, which is the whole reason that backend exists.

Every Piper preset resolves to a model actually in `vendor/piper-voices/`.
That is not a detail — Phase 37 shipped a two-minute advert with 25 of its 26
lines silent because it was cast on two presets whose models were never
vendored, and `validateFilm`, `analysePacing` and `produce` all reported
success. `VOICE_BACKEND=voicestudio` recasts all three roles onto cloned
voices in one variable (`docs/29-VOICE-STUDIO.md`).

Mr Ninety-Five is cast American in English on purpose: the signal-seller voice
an African viewer has actually been pitched by is almost never local.

## Six defects that passed every checker and were only visible in a frame

All twenty films compile with no fatal, no error and no warning, and hook
coverage 85–94% against an 80% floor. None of that caught any of these.

1. **`cardRows` drew a dark navy card on sage paper.** The colours were
   constants — right for four series that stage on near-black, and on paper a
   black slab carrying near-black title text. Now options, defaulted to the
   old values so no existing film moves; `forex/common.mjs` wraps it with
   paper defaults, because "remember to pass the right colours" is a rule that
   holds for about three parts.
2. **A multi-line caption ran back up through its own statistic.** A text part
   anchors on its LAST line, so a two-line caption placed `size × 0.62` below
   a number puts its first line in the number's descenders. `statParts` now
   pushes down one line-height per extra line; single-line captions are
   unaffected.
3. **`dim` measured ~2.8:1 on paper.** Under the 3:1 floor for large text. On
   black it would have been fine. Every board heading came back half-erased,
   and nothing reports it — a colour is never out of bounds.
4. **Two parallel verticals 44 apart read as one trouser leg.** The gap was
   there and the eye refused to see it, because nothing about the shape said
   "two of these". Hips widened, each leg leaned out, shoes mirrored — both
   shoes offset the same way had put one squarely on top of the other.
5. **The arms ran down inside the coat contour** and read as a seam in the
   clothing. The coat flares 10 past the shoulder constant, so at `ARM_X 18` a
   narrow-shouldered figure had 5 units of clearance and the two strokes
   merged.
6. **Amara's braids read as headphones.** Two long arcs at x = ±78–90 on a
   134-wide head sat outside the skull, level with the ears. A hair stroke
   that leaves the silhouette stops being hair and becomes whatever object it
   most resembles.

Plus two staging traps, both the same shape as ones this repo has paid for
before: a line playing over a near-empty frame (part nine had eleven seconds
of it across two shots), and verdict marks positioned by hand at coordinates
that were right until a row height changed. Both now derive from the board
geometry rather than being typed in.

## Two things about the 90-second format

**The pad is tighter than any series here.** 0.55 s tail, 2.2 s floor, against
the earlier series' 0.85. At 0.85 a sixteen-line part spends fourteen seconds
— a sixth of the film — on silence after somebody stops talking, and
`27-RETENTION.md` already measured our films at 54% speech against the
references' 73%.

**Write in lines, not paragraphs.** `estimateLine` works at 150 wpm — two and
a half words a second — so a 25-word sentence is a ten-second shot. Part one's
first cut ran 2:03 against a 1:30 brief for exactly that reason, and the fix
was not to delete the argument but to stop writing it in paragraphs: 17 lines
averaging 12 words instead of 18 averaging 25. It also sounds far more like
the reference, which cuts a new idea every two or three seconds.

The one place that backfired: **a four-word hook is a worse opening than a
twelve-word one.** "Forex is a scam." is the better line and measured 76% hook
coverage, because at 1.6 s of speech the 2.2 s shot floor padded it into a
hole. Adding the viewer's actual evidence — "Everyone I know who tried it lost
money" — took it to 94% and is the more honest hook anyway.

## Loudness, and two tools that did not exist

The engine levels every synthesized line to an RMS of **0.06 on its voiced
frames** — about −24 dBFS — and `voiceLevel` was not plumbed through
`produce.mjs`, so there was no way to change it. That is very quiet next to
the ~−14 LUFS everything else in a phone feed is mastered to: a film rendered
at the default plays noticeably softer than the post above it in the feed.

`VOICE_LEVEL` now threads through `studio.js` into both `synthesizeDialogue`
calls. The default is unchanged at 0.06, so no existing film moves. This
series renders at **0.15**, which measures −18.5 dBFS RMS against the
default's −26.3. Peaks are still protected — `normalizeGain` caps the gain
against each take's own peak, so raising the target cannot clip.

Two diagnostics were written to settle a "there is no voice" report, and both
earn their place permanently:

```bash
npm run measure:audio out/forex/en/market-01.mp4   # level per 5s window
SECONDS=25 npm run extract:audio out/forex/en/market-01.mp4 out/check.wav
```

`measure-audio` decodes a rendered film in real Chrome and reports peak and
RMS overall and per window. `extract-audio` writes the decoded audio out as a
plain WAV, which removes the container, the codec and the edit list from the
argument: if the voice is in the WAV, the render is fine and the problem is
downstream.

**The report turned out to be a muted machine.** That is worth writing down
rather than quietly deleting, because the half hour spent on it was not
wasted: every structural cause had to be ruled out before the boring one was
credible, and ruling them out is what found the real defect underneath — the
dialogue genuinely was 8 dB too quiet to compete in a feed, and nothing in the
repo could measure a rendered film's loudness to notice. Phase 37's silent
advert is the reason "it is probably fine" was not an acceptable answer.

What the check ruled out, in order: a missing audio track; 6-byte silent AAC
frames (Phase 37's exact bug); a disabled track flag in `tkhd`; a malformed
`esds` decoder config; a bad edit list; stereo phase cancellation on mono
downmix (L and R measured identical, correlation 1.0000); and finally the
possibility that the measurement itself was a browser artefact — settled by
reading the PCM off disk in pure Node, where the per-second envelope showed
speech with pauses landing exactly on the gaps between narration lines.

## Rendering

```bash
npm run render:forex                       # all 20, at VOICE_LEVEL=0.15
LANGS=en PARTS="01 02" npm run render:forex
npm run verify:renders out/forex/en/*.mp4 out/forex/sw/*.mp4
```

**`render-forex.sh` verifies every film and retries it.** The first batch run
produced twenty valid MP4s and fourteen of them had no audio track — every
one reported success, and the only tell was wall time, because TTS is what
takes the minutes and the broken films came back in fifteen seconds instead
of two minutes. Each part renders fine in isolation, so this is batch
degradation; until the cause is found, a verify-and-retry loop is the honest
fix. Per-film output goes to `out/forex/logs/`, never `/dev/null` — the first
version discarded stderr and threw away the only evidence there was.

One film, or with cloned voices:

```bash
VOICE_LEVEL=0.15 FORMAT=mp4 FILM=films/forex/en/part-01.json \
  OUT=out/forex/en/market-01.mp4 WIDTH=1080 HEIGHT=1920 npm run produce

VOICE_BACKEND=voicestudio VOICE_STUDIO=http://127.0.0.1:3900 STRICT_VOICE=1 \
VOICE_LEVEL=0.15 FORMAT=mp4 FILM=films/forex/en/part-01.json \
  OUT=out/forex/en/market-01.mp4 WIDTH=1080 HEIGHT=1920 npm run produce
```

`STRICT_VOICE=1` refuses to substitute, so a studio that is not running gives
a silent line and says so, instead of twenty films in a stand-in voice.

Check before spending a render — this series is narration-led, so the pacing
report is the point rather than a footnote:

```bash
FILM=films/forex/en/part-01.json node scripts/check-film.mjs
FILM=films/forex/en/part-01.json OUT=out/fx-sheets/p01.png \
  COLS=5 CELL=250 NO_TTS=1 node scripts/contact-sheet.mjs
```

**Use the contact sheet, not `grab2d`.** It defaults to the midpoint of every
shot — past the transition in, before the transition out — so one image covers
the whole film at the moment each shot is most itself. Six of the eight
defects above were found that way, and every one of them had passed
`check-film` clean.
