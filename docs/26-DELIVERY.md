# Delivery: five characters, one voice model

## The problem this solves

There is exactly **one** Swahili voice in the Piper catalogue:
`sw_CD-lanfrica-medium`. It works — it was synthesised and measured, not
assumed (6.77 s for 16 words, ~142 wpm). But `catalog.js` has had to say so
in a comment since it was written:

> the only Swahili voice in the Piper catalogue, so a Swahili cast shares it
> and is separated by pacing and pitch rather than by timbre

Except that nothing in the engine could change pacing or pitch. A Swahili
five-hander rendered as five identical deliveries, which is not a cast — it is
one person reading a playscript aloud.

That gap is not specific to Swahili. `24-VOICE-AND-DELIVERY.md` already lists
per-character rate and pitch as not started, and the reference measurements
there are about delivery too: the narrated references run 2.1–2.6 onsets per
second, and the only way to hit a number like that deliberately is to be able
to set it.

## Why not ask the synthesiser

Piper does expose the knobs. `vits-web`'s `predict` builds

```js
scales: new Tensor("float32", [noise_scale, length_scale, noise_w])
```

where `length_scale` is duration and the two noise terms are variation. But it
reads all three **from the model's own JSON config** and offers the caller no
way to override them:

```js
const i = JSON.parse(await (await f(`${u}/${n}.json`)).text());
const d = i.inference.noise_scale, g = i.inference.length_scale, U = i.inference.noise_w;
```

So getting at them means vendoring a patched copy of someone else's module and
keeping it patched. And it would buy rate only — VITS has no pitch input at
all — and it would work only for Piper, not for a recorded take or an uploaded
clip.

## The change: delivery as post-processing

`src/core/audio/delivery.js` reshapes the synthesised samples instead, which
makes it provider-agnostic. Every voice gets rate and pitch, including
recorded ones.

```json
"voices": {
  "nuru":   { "spec": "narrator-sw", "rate": 1.00, "pitch": 1.00 },
  "bakari": { "spec": "narrator-sw", "rate": 1.08, "pitch": 1.14 },
  "hamisi": { "spec": "narrator-sw", "rate": 0.86, "pitch": 0.84 }
}
```

- **`pitch`** is a frequency ratio. 1.14 is about two semitones up, 0.84 about
  three down.
- **`rate`** is a speed ratio. 1.08 is 8% faster, and *shortens the line*.

Two primitives, composed:

1. **Pitch shift by resampling.** Reading the samples at `p` samples per
   output sample multiplies every frequency by `p`. It also divides the
   duration by `p` — resampling alone cannot separate the two.
2. **Time-stretch by WSOLA**, to put the duration back.

So `pitch: 1.14, rate: 1.0` resamples by 1.14 (up two semitones, 12% shorter)
then stretches by 1.14 (back to the original length, pitch untouched). The two
knobs come out independent.

### Why WSOLA and not plain overlap-add

Overlap-add at a fixed hop stretches the signal, but the two windows being
crossfaded are at an arbitrary phase relative to each other, so each splice
partially cancels the pitch period. On speech that is audible immediately as a
hollow, warbling tone — the "robot voice" of a naive stretcher.

WSOLA (waveform-similarity overlap-add) fixes it with a search: before each
splice it slides the source window within ±`tolerance` samples and takes the
offset with the highest cross-correlation against what has already been
written. Splices then land in phase and the periodicity survives. It is about
ninety lines, needs no FFT, and is the standard choice for speech at these
modest ratios.

Settings, and why: a 46 ms frame (2208 samples at 48 kHz) is longer than any
pitch period in a human voice, so one frame always contains a full cycle to
correlate against. Hop is half the frame. Tolerance is a quarter, which covers
a pitch period down to about 85 Hz.

### Range, and the clamp

`rate` and `pitch` are clamped to **0.6–1.6** and a diagnostic says so when a
film asks for more. This is not timidity; it is where the method stops being
honest. Beyond roughly ±40% resampling moves the formants far enough that the
result stops sounding like a person of a different build and starts sounding
like a tape at the wrong speed — a chipmunk or a drawl, not a character. Five
voices fit comfortably inside the band:

| | rate | pitch | reads as |
|---|---|---|---|
| narrator | 1.00 | 1.00 | the model as shipped |
| young, eager | 1.10 | 1.16 | lighter, quicker |
| elder | 0.86 | 0.84 | heavier, slower |
| authoritative | 0.94 | 0.92 | deliberate |
| child | 1.14 | 1.30 | at the top of the band |

## Order of operations

Delivery runs **before** loudness normalisation, and that order is load-bearing.

`loudness.js` measures RMS over voiced frames and applies the result as a cue
gain. Resampling changes the measured level slightly, and WSOLA's crossfades
change it more. Normalising first and reshaping after would undo the levelling
that `24-VOICE-AND-DELIVERY.md` was written to fix, and would reintroduce the
6.6 dB gap it measured — this time between two characters sharing one model.

So: synthesise → pitch-shift → time-stretch → measure → gain.

## Interaction with timing

A film's shot durations are derived, not declared, and dialogue timing comes
from the synthesised length. `rate` changes that length, so **changing a
character's rate changes the film's duration**, as it should. Nothing needs to
be re-timed by hand; the derived durations follow.

The one thing to know: `rate` is applied per character, not per line, so
raising a narrator's rate shortens every shot they speak in. That is the point
— it is how the speech ratio in `27-RETENTION.md` gets moved — but it means a
rate change is a pacing edit to the whole film, not a local one.

## Tests

`test/core/delivery.test.mjs`:

- **Identity.** `rate: 1, pitch: 1` returns the input samples unchanged, so
  every existing film is unaffected and the cost is zero when unused.
- **Rate changes length and only length.** `rate: 1.25` on a 1 s buffer gives
  0.80 s ±1 frame, and the detected fundamental is unchanged within 2%.
- **Pitch changes frequency and only frequency.** `pitch: 1.5` on a 200 Hz
  tone detects 300 Hz ±2%, and the duration is unchanged within 1%.
- **Both at once**, which is the case that catches a wrong composition order.
- **Autocorrelation survives.** The periodicity of a synthetic glottal pulse
  train is still detectable after stretching — the assertion that separates
  WSOLA from plain overlap-add, and the one that would have caught shipping
  the naive version.
- **Clamping** reports a diagnostic rather than silently obeying.
- **No clipping**: peak stays below 1.0 after overlap-add, which can sum two
  correlated windows above the original peak.
