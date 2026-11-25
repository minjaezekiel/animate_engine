# Music windowing and ducking

**Status:** pending, and **smaller than it looks** — most of what was asked
for already works. Asked for directly: *"on background music, i hope there is
a way to trim certain background music and or audio so as to make it play only
in certain scenery of the animation or video."*

## This already works today

Trimming a music bed to a window, and placing that window in one scene, is
supported end to end and has been for some time. It is just undocumented,
which is why it reads as missing.

`createCue` in [`cues.js`](../../src/core/audio/cues.js) takes:

| Field | Meaning |
|---|---|
| `at` | when on the film timeline the cue starts — **relative to the scene**, in `compile.js` |
| `offset` | the **in-point**: how far into the source file to start reading |
| `duration` | the **out-point**: how much of it to play, `null` for the rest |
| `fadeIn` / `fadeOut` | linear ramps, in seconds |
| `gain` | a flat trim |
| `bus` | `music`, `voice` or `sfx` |

`cueSampleWindow` resolves those to integer samples, and does the two things
that are easy to get wrong: it **clamps to what the asset actually holds**
(`available = assetDuration − offset`, so an out-point past the end of the
file shortens rather than reading silence or throwing), and it **rounds rather
than truncates**, so a cue at 0.6 s lands on the same sample whichever way the
float error fell — which is what keeps narration aligned with the viseme track
derived from the same number.

Both compilers expose it:

- **2D** — [`compile.js:177`](../../src/core/script/compile.js#L177), `scene.audio[]`,
  with `at` offset by `sceneStart`. So a cue declared on a scene plays only
  during that scene, which is exactly the request.
- **3D** — [`compile3d.js:647`](../../src/core/script/compile3d.js#L647), at
  three levels: `film.audio[]`, and `shot.audio[]` offset by the shot start.

So this plays bars 17–41 of one track under scene three and nowhere else:

```json
{ "scenes": [ { "id": "s3", "audio": [
  { "asset": "theme", "at": 0, "offset": 32.0, "duration": 24.0,
    "fadeIn": 1.5, "fadeOut": 2.0, "gain": 0.5, "bus": "music" }
] } ] }
```

`demo/film.json`, `demo/ak47.json` and `demo/fight.json` all use scene audio.

**First action for this item is therefore documentation, not code**: a
reference page for the audio block, since the capability existing and nobody
knowing it exists is indistinguishable from it not existing.

## What is genuinely missing

### 1. Ducking — the one that is actually felt

[`OfflineMixer.js:40`](../../src/audio/OfflineMixer.js#L40) has said *"so a
music bed can be ducked as a group later"* for several phases, and later has
not happened. Music under dialogue sits at whatever flat `gain` the author
guessed, so either the voice is buried or the music is inaudible, and the
guess has to be re-made per film.

This is also **priority 2 in the audit**
([37-MISSING-TOOLS.md](37-MISSING-TOOLS.md)) at an estimated ~30 lines. The
buses already exist, which is the whole reason it is cheap: compute an
envelope over the `voice` bus, invert it, apply it to the `music` bus with an
attack and a release. Pure arithmetic over sample arrays, testable in Node,
and no new concept in the film format beyond `duck: true` or a depth in dB.

### 2. Music gain is a constant, not a channel

`gain` is one number for the life of a cue. Everything else in this engine
that varies over time is a timeline channel, and this is not — so there is no
swell, no fade to a held bed under a line, no ramp into a climax, except by
splitting one cue into several abutting cues and hoping the seams are
inaudible.

The guard-list pattern in `SceneAdapter.js` (`COLOR_PROPS`, `VECTOR2_PROPS`)
is how a property becomes keyable here, and this is the same shape of change
as the keyframeable-post item that is already next in the queue.

### 3. No loop-to-fill

A 30 s track under a 90 s scene must be declared three times by hand, with the
author computing the offsets. Wanted: `loop: true` with an optional
crossfade at the seam, so the cue fills its window.

### 4. Nothing reports an audio asset's duration

To choose an `offset` and a `duration` an author needs to know how long the
file is and roughly where its sections are — and **nothing in the repo will
tell them.** There is no tool, no MCP tool, and no diagnostic. So trimming,
though supported, is done by guessing and re-rendering, which is the loop this
project exists to close.

Wanted, and cheap: a duration and peak-envelope report over an audio asset.
Coarse RMS per 100 ms is enough to see where a track changes section, and it
is a few hundred bytes of numbers rather than a waveform image — the
[`digest`](../completed_phases/37-DIGEST-2D.md) trade once more.

### 5. No beat or bar grid

`offset: 32.0` is a guess at where a bar starts. With a declared tempo, a cue
could ask for bar 17 and land on it. Low priority, high polish: it is the
difference between music that happens to be under a cut and music the cut was
made to.

### 6. `check` says nothing about audio

The checkers catch geometric, temporal and typographic defects. Nothing
catches: a cue whose window is entirely past the end of its asset (clamped to
zero length — **silence, no warning**), a music bed louder than the dialogue
over it, a fade longer than its own cue, or two cues on the `music` bus
overlapping unintentionally. Each is a few lines next to the existing checks,
and each is a defect that currently ships.

## Order of work

1. Document the audio block. It already works; nobody can tell.
2. The `check` rules — they are cheap and they catch shipping defects, in
   particular the silently-clamped window.
3. Ducking. Audit priority 2, ~30 lines, the one a viewer hears.
4. An audio-asset report, so an `offset` is chosen rather than guessed.
5. Keyframeable cue gain.
6. Loop-to-fill.
7. The tempo grid.

## Acceptance

- A reference page for `scene.audio[]` / `shot.audio[]` with the worked
  example above.
- A film where dialogue sits over a bed, with ducking measured: the music bus
  RMS during speech against outside it, asserted as a number.
- A cue whose window falls past the end of its asset is a **warning**, not
  silence.
- Keyed gain swells, asserted on the rendered mix rather than on the cue.
- A looped bed fills a 90 s scene from a 30 s file with no audible seam, and
  no author arithmetic.
- Unit tests for each; `cues.js` is already pure and already tested, so they
  belong beside the existing ones.
