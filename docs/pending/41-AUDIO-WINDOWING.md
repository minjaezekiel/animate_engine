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

### 1. Ducking — **DONE in Phase 46**

See [../completed_phases/41-DUCKING.md](../completed_phases/41-DUCKING.md).
`meta.audio.duck` on either path, −9 dB by default, computed from the cue
list rather than from an envelope follower (which pumps), and measured on a
rendered mix at −14.54 dB against a predicted −14.54 dB.

Phase 46 also closed four audio defects that could only ever have been found
by listening: a cue whose `offset` is past the end of its asset rendered
silent with no diagnostic, an out-point past the end was clamped silently, a
fade longer than its own cue never reached its level, and two overlapping
music beds went unreported.

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

### 6. `check` says nothing about audio — **mostly DONE in Phase 46**

`checkCues` in [`cues.js`](../../src/core/audio/cues.js) now catches a window
past the end of its asset, a clamped out-point, a fade longer than its own
cue, an unloaded asset, and two overlapping music beds.

What remains: **a music bed louder than the dialogue over it.** That one needs
the rendered samples rather than the cue list, so it belongs beside the
master-peak measurement rather than in the pure checker.

## Order of work

1. Document the audio block. It already works; nobody can tell. **Still the
   cheapest remaining item in this doc.**
2. An audio-asset report, so an `offset` is chosen rather than guessed.
3. Keyframeable cue gain.
4. Loop-to-fill.
5. A bed-louder-than-the-dialogue check, from the rendered samples.
6. The tempo grid.

~~Ducking~~ and ~~the pure `check` rules~~ shipped in Phase 46.

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
