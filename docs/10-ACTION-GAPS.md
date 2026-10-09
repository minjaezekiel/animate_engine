# What the engine cannot do: action

Findings from a live test. The brief was a sixty-second full-power fight; the
film is [`demo/fight.json`](../demo/fight.json), the script is
[`demo/fight-script.md`](fight-script.md), and the render is
`demo/out/sun-and-sky.webm`.

**It is not high-quality fight animation.** Everything structural works —
60.0 s authored, 23 shots, validate clean, staging clean, framing clean,
voices, music, no diagnostics anywhere — and the result is still a slideshow.
That gap between "every check passes" and "it does not read" is the finding,
and this document is the measurement of it.

---

## Measured

Two numbers, taken rather than asserted.

**Frame-to-frame luma change** through four action beats, against the
reference clip's median of **0.85** for a *dialogue* scene:

| beat | as rendered | camera locked |
|---|---|---|
| 03 punch combo | 16.2 | **0.78** |
| 10 aerial rush | 0.90 | **0.11** |
| 12 giant swing | 0.28 | **0.00** |
| 17 the climactic clash | 0.53 | **0.00** |

The footage looked busy. With the camera held still the characters are not
moving at all. **The motion in this fight is almost entirely the camera
shaking.**

**Cast movement across the whole film**, measured on node world positions, so
it is exact and the camera cannot flatter it:

| | exactly frozen | sub-visible | visibly moving |
|---|---|---|---|
| `fight.json` | **77%** | 2% | 21% |
| `two-hander.json` (dialogue) | 2% | 93% | 5% |

The dialogue film is more alive than the fight. Seven shots — including
`06-impact`, the hardest hit in the film — are **100% frozen**.

---

## Root causes

### 1. No additive layering. A pose silently kills every cycle. — *the big one*

A pose compiles to absolute keys on a channel. A cycle (`breathe`, `walk`) is
a clip instance on the same channel. They collide and the pose wins — and
because a track reads as its **first** key at every earlier time and its
**last** key at every later one, a single pose at second three stops the
character breathing for the whole sixty seconds, *including the three seconds
before it*. Measured: with the pose present `torso.sy` is exactly 1 at
t = 0.1, 0.3, 0.49, 1.0 and 2.5; without it the same channel reads 1.00018,
1.00148, 1.00362, 1.01136, 1.00979.

Measured directly. Shot `02-sora` runs `breathe` and `blink` and is 100%
frozen:

```
with the pose keying torso.sy=1     torso.sy -> 1 1 1 1 1
with those scale keys removed       torso.sy -> 1.0007 1.0051 1.0114 1.0165
```

This is why the dialogue film is alive and the fight is dead: the dialogue
film uses no poses, so nothing competes with its cycles.

It also makes the Phase 10 pose system unusable in practice, because poses
have to restore every channel any other pose touched — which is what forced
the `neutral(...)` scale-resets in this film, which is what killed the
breathing. The workaround for one bug caused the other.

**Fix — additive channels.** Standard practice is layered evaluation:

- a **base** layer (poses, `move`, IK) holding absolute values;
- an **additive** layer (cycles, secondary motion) summed on top, with a
  weight;
- a pose declares only what it changes and never has to restore anything,
  because layers do not overwrite each other.

Concretely: `Clip` gains `blend: 'override' | 'add'`, `Timeline.instances`
gain a `weight`, and `Evaluator.sample` accumulates additive contributions
after resolving the base. Generated cycles become additive around zero (a
breathe clip keys `+0.018`, not `1.018`). This is the single change with the
largest effect on how the output reads, and everything else in this document
is cosmetic by comparison.

### 2. Nothing exists between the poses

21% of frames move, and when they do there is nothing to sell the speed. The
idiom's entire vocabulary for fast action is missing:

- **smears** — a limb drawn stretched along its path for one or two frames;
- **multiples / afterimages** — the same drawing repeated along the arc at
  falling alpha;
- **speed lines** — radial for a push-in, linear for a travel;
- **impact frames** — one or two frames of inverted or blown-out colour.

None is expressible. At 24 fps a punch that crosses the frame in three frames
simply strobes.

**Fix — a trail/smear primitive at the render level.** `drawOrder` already
yields `{node, alpha}`; a node carrying `props.echo = { frames: 3, falloff:
0.5 }` can be drawn once per previous sampled pose with decaying alpha. That
is one loop in the backend plus a small ring buffer of past world matrices,
and it buys smears, afterimages and ghosting from one mechanism.

### 3. No impact vocabulary

An impact in this idiom is **hit-stop** — the frame holds for 2–4 frames while
everything else continues — plus a flash and a shake. The engine has shake
only, and it had to be added during this test.

There is also no control over **holds on twos or threes**. Anime's look comes
substantially from drawings held for two or three frames against a 24 fps
soundtrack; the engine renders every frame of a smooth interpolation, which is
the *wrong* texture even where the motion is right.

**Fix — a time-quantising shot property.** `shot.step = 2` makes the
evaluator sample at `floor(frame / 2) * 2 / fps` for cast channels while the
camera and audio stay continuous. It is a one-line change at the sampling
seam, it costs nothing to author, and it is closer to the reference look than
any amount of extra keyframing.
Hit-stop is the same mechanism with a window: `{ "holdFor": 3 }` on an action.

### 4. No effects system

Impact flashes and the beam in this film are **cast members** — characters
with a `parts` array, moved and scaled by `set` actions. That works, and it is
obviously wrong: effects get a voice slot, a mouth warning, a staging check
and a framing check, none of which apply to them.

**Fix — `scene.effects` as its own kind**, spawned by a `do: 'fx'` action with
a named, enumerated library (`impact`, `speedlines`, `dust`, `aura`,
`shockwave`), positioned relative to a cast member or a world point, with a
lifetime. Same design rule as everywhere else here: a closed vocabulary of
names, and a diagnostic when the name is wrong.

### 5. Z-order cannot change within a pose

`drawOrder` is depth-first, so a child always draws over its parent and `z`
only sorts siblings. A raised arm therefore draws over the head, and in a
fight limbs cross the body constantly. This was predicted in the script before
the render and it duly appears in shots 08 and 14.

**Fix — a per-pose z override.** A pose may name `z` on a part
(`"armR": { "rot": -1.5, "z": -1 }`), and `drawOrder` sorts against the
accumulated value rather than the authored one. The alternative — a flat draw
list with global z — is a bigger change and would cost the "children inherit
their parent's transform" guarantee that makes the rig work.

### 6. No secondary motion

Hair, coat and sash are rigid. In the idiom they trail, settle and overshoot,
and that is a large part of why a held drawing still feels alive.

**Fix — spring-driven offsets on named parts**, evaluated from the part's own
velocity. Pure, deterministic given a frame index, and it layers naturally on
the additive system from (1) — which is the argument for doing (1) first.

### 7. The engine flattered the result — *fixed this session*

Raw frame-to-frame change said 16.2 on a shot whose characters were static. An
author trusting the obvious metric would have shipped it.

`analyseMotion` / `checkMotion` in `src/core/script/staging.js` now measure
cast movement on world positions, where the camera cannot reach, and report a
shot that is entirely still:

```
Motion: shot 02-sora is completely still -- 100% of its frames have zero cast
movement. A camera move or shake will make it look busy while nothing is
animating. Give it an idle clip, or a pose that changes across the shot.

Motion: 76% of the film's frames have no cast movement at all. For comparison
a held dialogue scene runs near 2%.
```

It reports 7 shots on the fight and **0 on the dialogue film**, which is the
discrimination that makes it worth having.

---

## Plan

Ordered by effect on the output, not by cost.

| phase | work | why it is first |
|---|---|---|
| **13** | Additive layering (`blend: 'add'`, instance weights, additive generated cycles) | Root cause 1. Nothing else matters while one pose can freeze a character for the rest of the film. Also removes the pose-restores-everything burden that caused it. |
| **14** | Timing texture: `shot.step` for twos and threes, `holdFor` hit-stop | Cheapest change with the largest effect on *look*. One line at the sampling seam. |
| **15** | `props.echo` trails/smears, and `scene.effects` with an enumerated library | The in-between vocabulary. Needs 13 so trails sample a pose that is actually moving. |
| **16** | Per-pose `z`, spring secondary motion on hair and cloth | Polish, and both layer on 13. |

Not planned, deliberately: motion blur as a post-process (the draw loop is
flat and compositing it would cost more than smears buy), and a particle
system (a closed effect library covers the idiom at a fraction of the
surface).

---

## What this test also produced

Fixes made while finding the above, all with regression tests:

- `camera.shake`, as a decaying declaration rather than hand-written keys.
- `spiky` and `flame` hair, built as straight-edged radial crowns — smoothing
  turns a spike into a blob.
- **Audio assets actually load.** `assets: { kind: "audio" }` had been in the
  schema since the first phase and nothing ever fetched one; a film could
  declare a score, validate clean and render silent.
- **`set` resolves palette names** on colour channels. `set props.fill "aura"`
  wrote the literal string, which is not a colour, so the canvas kept the
  previous fill — a transformation that never happened and reported nothing.
- **A later `set` or `show` no longer rewrites the film from frame one.** A
  track reads as its first key's value at every earlier time, so a hair colour
  meant to turn gold at second sixteen was gold in the opening shot, and an
  effect first shown at second thirty-five was on screen from the start.
- **`buildShake` no longer clobbers the previous shot's final framing** — its
  first key landed on the exact instant of the preceding `to` key, and `key()`
  replaces rather than appends. Caught by the staging check, not by eye.
- The no-mouth warning no longer fires for characters with no voice, so effect
  sprites stop training authors to ignore diagnostics.
