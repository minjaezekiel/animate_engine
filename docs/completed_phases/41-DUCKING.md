# Phase 46 — music ducking, and the audio defects nobody could hear

**Done.** Audit priority 2, and the top code gap in the audio doc.

## The comment that waited several phases

[`OfflineMixer.js`](../../src/audio/OfflineMixer.js) has said this since the
mix was first bussed:

> `// One gain node per bus, so a music bed can be ducked as a group later.`

Later did not happen. A bed sat at whatever flat `gain` the author guessed,
and the guess had to be re-made per film — which means the mix was **silently
wrong the moment a line moved**. Either the voice was buried or the music was
inaudible, and *nothing reported either*, because both are correct renders of
exactly what was asked for. That is the whole class of defect this phase is
about: audio faults that no check could see because nothing was wrong with the
code, only with the numbers.

## Computed from the cue list, not from the samples

The tempting implementation follows the voice bus's envelope and inverts it.
That is worse, twice over.

**Musically**, an envelope follower ducks on every syllable and lifts in every
gap between words, which *pumps*. A duck should go down when someone starts
talking and come back up when they stop; a line is a continuous thing even
though the waveform inside it is not. So the spans come from the cues, and
gaps shorter than `bridge` (1.2s, about a breath) are bridged rather than
lifted through — two lines half a second apart are one piece of speech as far
as a listener is concerned.

**Practically**, the cue list is a handful of numbers available before any
audio exists, so [`ducking.js`](../../src/core/audio/ducking.js) is pure, runs
in Node, and is asserted directly. An envelope follower would need real
buffers and a browser to test, for a worse result.

```
1.0 ────────╮                    ╭──────────   music, unducked
            ╲                   ╱
0.35         ╰─────────────────╯               ducked, through the line
           ↑ attack          release ↑
```

Attack (0.18s) is faster than release (0.45s), as on every compressor and for
the same reason: getting out of the way must happen *before* the first word,
and coming back up slowly is what makes the return inaudible rather than a
swell. Depth defaults to **−9 dB** — broadcast practice is 9 to 12; under
about 6 the words still fight the bed, past about 15 it reads as a dropout
rather than a mix, and `normalizeDuck` warns at both ends.

Opt-in, declared as `meta.audio.duck`, because switching it on for every
existing film would change fifty-one finished mixes:

```json
"meta": { "audio": { "duck": true } }
"meta": { "audio": { "duck": 12 } }
"meta": { "audio": { "duck": { "depth": 9, "attack": 0.1, "release": 0.6 } } }
```

A depth is accepted signed **or** unsigned, because "duck by 9 dB" and "duck
to −9 dB" are the same intent and insisting on the minus sign would be
pedantry that costs a silent mistake.

## Measured, not asserted to be quieter

[`test/e2e/duck.mjs`](../../test/e2e/duck.mjs) renders the same film twice in
a real `OfflineAudioContext` — once with the duck and once without, every
other number identical — and measures the mix's RMS in three windows:

```
  window        ducked mix   flat mix    difference
  before          -15.05 dB     -15.05 dB       0.00 dB
  ducked          -14.54 dB     -12.04 dB      -2.50 dB
  after           -15.05 dB     -15.05 dB       0.00 dB
```

Asserting only "it got quieter" would pass a duck of any depth, including a
1 dB one. So the expected figure is **derived in the test** and has to match.
Two incoherent tones each at amplitude 0.25 sum in RMS rather than in
amplitude:

```
flat    sqrt(0.177² + 0.177²) = 0.250   → −12.04 dBFS
ducked  bed × 0.3548 = 0.0627, line 0.177
        sqrt(0.0627² + 0.177²) = 0.1878 → −14.53 dBFS
```

Measured: **−14.54 dB against a predicted −14.54 dB.** The mix drops 2.50 dB
rather than 9 because the *line itself is not ducked* — and checking against
the derived figure rather than against "9" is what makes that distinction a
test instead of a surprise. The 0.00 dB either side is the proof that the
automation does not leak outside its span and that the bed fully returns.

A pre-recorded take on the `voice` bus rather than synthesis, so the probe
costs a second rather than a minute: the duck triggers off a **cue**, and a
cue does not care where its samples came from.

## The report exists because nothing else would show it

A duck is invisible in every other number the engine prints. The master peak
barely moves, the cue list is unchanged, the duration is identical. Without
a line saying so an author cannot tell whether the feature ran at all:

```
[audio] duck: music under voice by -9 dB over 1 span(s), 3.5s ducked
        (attack 0.18s, release 0.45s)
```

It also reports the two ways a duck can do nothing — no cues on the trigger
bus, and nothing routed to the target bus — rather than succeeding quietly.

## A bug the tests found

`normalizeDuck` returned straight out of its numeric branch, so `duck: 0.5`
silently accepted an inaudible half-decibel while `duck: { depth: 0.5 }`
warned about it. **The same mistake, reported in one spelling and not the
other.** Both shorthands are now rewritten into the object form so every
spelling goes through the same validation, and a test asserts the two produce
identical warnings.

## Four audio defects that shipped silently

Found while writing the above, and each one could only ever have been noticed
by listening:

1. **A cue whose `offset` is past the end of its asset rendered silent with
   no diagnostic.** `OfflineMixer` skipped a zero-length window with a bare
   `continue`. The author heard nothing, every check in the repo passed, and
   the cause was a number that reads perfectly reasonably in the film. Now an
   `error` from `checkCues` and a report from the mixer.
2. **An out-point past the end of a file was clamped silently.** Now a
   warning that says what it was clamped to — `cueSampleWindow` was always
   right to clamp, it just never said so.
3. **A fade longer than its own cue never reaches its target level**, so the
   author's intended level is never heard. Now a warning.
4. **Two music beds overlapping** — a scene's bed left running under the next
   — is now reported, because the result is merely *denser* rather than
   obviously wrong, which is why it survives review.

## Numbers

| | Before | After |
|---|---|---|
| Music under dialogue | a flat hand-tuned gain | ducked −9 dB, measured exact |
| Audio cue validation | none | 5 rules, 4 of them previously silent |
| Unit tests | 1,165 | **1,194** |

## Files

- `src/core/audio/ducking.js` — new. `speechSpans`, `duckAutomation`,
  `normalizeDuck`, `duckReport`.
- `src/core/audio/cues.js` — `checkCues`.
- `src/audio/OfflineMixer.js` — applies the automation to the target bus, and
  reports a zero-length cue instead of skipping it.
- `src/core/script/compile.js`, `src/core/script/compile3d.js` —
  `meta.audio.duck` normalised into `meta.duck` on both paths.
- `film3d.html`, `src/studio.js` — passed to the mixer.
- `test/core/ducking.test.mjs` — 29 tests.
- `test/e2e/duck.mjs` — `npm run test:duck:e2e`.

## Still open in the audio doc

[41-AUDIO-WINDOWING.md](../pending/41-AUDIO-WINDOWING.md) keeps: documenting
the audio block (which already works and is the cheapest remaining item), a
report of an audio file's duration and section envelope so an `offset` is
chosen rather than guessed, keyframeable cue gain, loop-to-fill, and a tempo
grid.
