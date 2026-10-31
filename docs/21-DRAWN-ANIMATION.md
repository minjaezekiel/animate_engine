# Drawn animation: roughs, exposure, boil and smear

**Status: design.** Nothing here is built yet. Implementation state lives in
[STATUS.md](STATUS.md); this file is the design, written to be executed from
months later.

This document exists because a reference film was measured and the engine was
found to be missing a *production mode*, not a feature. Everything jireX does
today assumes **clean art held and transformed**: a cel-shaded character with
flat fills, swapped between drawings, moved by a rig. The reference is the
other tradition — **animation roughs**, where the drawing itself is redrawn
every frame or two and the line is alive.

---

## 1. The reference, measured

`anime22.mp4`, a 24-second TikTok post by `@akeleeanimation`. Measured rather
than described, with `scripts/watch-video.mjs` (§7).

| | |
|---|---|
| container | 1024×576, H.264 High@3.1, AAC 44.1 kHz stereo |
| timing | 23.976 fps, **constant** — one `stts` run of 580×500/11988 |
| length | 24.19 s, 580 frames, 9 keyframes |
| cuts | 4 → five segments |
| line | single sepia pencil, variable width, visible overdraw |
| paper | warm cream `#f5ddc6` in shot 1, near-white `#f9f5f1` after |

### The shots

| # | span | content | mean hold | drawings/s |
|---|---|---|---|---|
| 1 | 0.00–8.26 | old man at a bin, examining a bottle, sack of bottles on his shoulder; lifts the lid | **1.65 f** | 14.5 |
| 2 | 8.26–13.89 | a scruffy dog sits on the pavement, scratches with a hind leg, yawns wide | **5.32 f** | 4.5 |
| 3 | 13.89–17.40 | the man wears the bin lid as a top hat and tips it | **3.40 f** | 7.1 |
| 4 | 17.40–20.19 | the bin goes over, the lid rolls, the dog charges and snarls; push-in | **1.36 f** | 17.6 |
| 5 | 20.19–24.15 | TikTok end card, black | — | — |

### The finding that matters

**Exposure is not a global setting. It is a shot-by-shot, beat-by-beat
decision, and it follows the action.**

The whole-film average is 2.5 frames per drawing, which would read as "on
twos" and be wrong about every individual shot. The dog's acting beat is held
five frames at a time. The chase is drawn very nearly on ones. The engine's
`shot.step` is a single integer per shot, which can express shot 2 or shot 4
but cannot express the *change* inside shot 1, where a four-frame hold on the
bottle is followed by a snap to the lid.

The per-frame luma difference makes the texture visible directly — one
character per frame, `.` held, `#` a large change:

```
shot 1  .+++#.+.+.#++##-#-+-+.-+.-#.#.#.#.###.#.+.+.+.#.#######.#.#.#.#.#
shot 2  ..#.....#....#....@...@.......#.......#..............-@........#.
shot 4  -#+#+#-#.+#.....+@+#.+#....+#+#+#+#+#+#-#+#+#..+#..+#-#-#-#.+#.+#
```

Shot 2 is a held drawing with a pose change every six to eight frames. Shot 4
changes on nearly every frame. These are different animation techniques inside
one film, and an engine that offers one `step` per shot is offering the wrong
control.

---

## 2. Classification: naming the types

"Animations are of different types" is the premise this design starts from, so
the types get names, and the names are **measured, not asserted**. Each is a
point in a four-axis space the scanner in §7 reports directly.

| axis | what it measures | from |
|---|---|---|
| `exposure` | mean frames per unique drawing | hold run-lengths |
| `cutRate` | seconds per shot | diff spikes against the local median |
| `motion` | median per-frame change | luma diff distribution |
| `chroma` | saturation of the mean frame | mean RGB |

| name | exposure | cutRate | chroma | what it is |
|---|---|---|---|---|
| `rough-pencil` | 1–3, **variable within a shot** | slow | near-zero | animation roughs / pencil test. **The reference.** |
| `cel-limited` | 2–3, steady | 4–6 s | full | TV anime: held cels, moving mouths, shot/reverse-shot |
| `full-cel` | 1–2, steady | 3–5 s | full | feature animation, clean line and flat fill |
| `cutout-rig` | 1, steady | slow | full | puppet rig interpolated every frame; no drawing changes |
| `motion-graphic` | 1, steady | very slow | full | shapes and type on eased curves; no character |
| `whiteboard` | 1, steady | none | near-zero | a drawing revealed progressively on a static ground |
| `stop-motion` | 2, **rigidly** steady | slow | full | shot on twos by the camera, not by choice |

jireX today produces `cutout-rig` and `motion-graphic` well, `cel-limited`
adequately via swap sets and `shot.step`, and `whiteboard` via the paint
layer's progressive reveal. It cannot produce `rough-pencil` at all, and that
is the gap this design closes.

`full-cel` is deliberately out of scope: it needs an artist drawing every
frame, and no engine feature substitutes for that.

---

## 3. What `rough-pencil` needs that does not exist

Six things. Four are engine work; two are authoring.

### 3.1 Boil — the line that will not sit still

In a pencil test the same held drawing is *redrawn* rather than held, so the
contour shifts a pixel or two between exposures. That shimmer, **boil**, is
the single strongest signal that a thing is hand-drawn. Freeze it and the shot
reads as a cutout puppet immediately.

The engine already has everything needed except the control. `core/paint/`
resamples a stroke with seeded jitter (`stroke.js`), and the seed is an
ordinary number. Advance the seed on a schedule and the same path redraws
slightly differently.

```json
{ "target": "dog", "do": "boil", "amplitude": 1.5, "rate": 3 }
```

`amplitude` in points of contour displacement, `rate` in exposures per second.
Determinism is preserved because the seed is derived from the frame index, not
from a clock: frame *N* boils the same way every render.

**The risk, named up front:** boil applied to a rig is wrong. Boil belongs to
the *drawing*, so it must apply to painted strokes and swap-set members, and
be refused on a generated cutout character with a diagnostic that says why.

### 3.2 An exposure sheet, not an integer

`shot.step` holds every target for N frames. The reference needs holds that
differ per target and change inside a shot. The X-sheet is the hundred-year-old
solution and the engine's `timeline.steps` already carries spans — only the
film script cannot write them.

```json
{ "target": "dog", "do": "expose",
  "sheet": "4 4 4 4 2 2 1 1 1 2 4 8", "at": 0 }
```

Each number is how long the next drawing holds, in frames, read left to right.
It is the notation animators already use, it is auditable at a glance, and it
sums to a duration the compiler can check against the shot.

`step` stays exactly as it is and keeps its meaning, so no existing film
changes. `expose` is the finer tool for when one integer is not enough.

### 3.3 Smear and multiple-image

Shot 4 has both of the classic fast-motion cheats: a limb drawn as a
stretched ribbon, and a limb drawn three times at once.

**Correction to the first draft of this document, which claimed neither
existed.** Multiple-image is built and has been since Phase 13, as
`cast.echo` — `core/anim/echo.js` clones the subtree at compile time and
shifts the clones' tracks back in time, which is exactly the right design: a
history buffer in the renderer would make frame *N* depend on the frames
before it and cost the engine its determinism. Reading the status table
before the source would have caught this.

What `echo` cannot do is end: it is a property of a **cast member**, gated to
whole named shots. A limb smears for three frames of a swing, and a character
is not smearing while it stands still. So the gap is granularity, not
mechanism, and the fix is an action that reuses the same pass:

```json
{ "target": "dog", "do": "smear", "samples": 3, "spread": 0.08, "fade": 0.5,
  "at": 1.0, "for": 0.25 }
```

`spread` is in seconds and converts to the frame spacing `buildEcho` already
takes. Nothing new is computed; the trail is simply keyed on for a span
instead of for a shot.

`cast.echo` shipped marked **done** with **no test of any kind**. Covering it
is part of this work, and is why `test/core/smear.test.mjs` tests both.

The *stretched* smear stays unbuilt. It is `set transform.sx` on a part for
one or two frames — authorable today, tedious, and not worth a verb until a
film has proved it needs one.

### 3.4 A quadruped

The dog carries a third of the film and `core/script/generate.js` builds
bipeds only. A quadruped is not a variation on the biped: four legs, a spine
that bends in the horizontal plane, a tail, and gaits (walk, trot, bound) with
footfall patterns that have nothing to do with a human's.

This is the largest item here and the one most likely to be cut. It is also
the one with the clearest test: a gait has a documented footfall sequence, and
a wrong one is a failing number, not a matter of taste.

### 3.5 Paper and tonal wash

The grounds are a flat warm paper with soft tonal blobs and **no outline** —
the brick wall in shot 1 is suggested entirely in tone. `core/paint/` can do
this; there is simply no scenery template that does. Authoring, not engine.

### 3.6 A rig part that is DRAWN, not assembled

**This section replaces the original §3.6, which said nothing needed
building. It was wrong, and the frame is what showed it.**

The original claim was that the rough look routes through `drawings` and the
paint layer, so nothing was missing. That is true for a *backdrop*. It is not
true for a *character*, and a character is what the reference film is.

The first quadruped was assembled the way `generate.js` assembles a biped —
tapered paths, ellipses, a filled silhouette per part. Rigged correctly,
gaits measured and passing, and it read as **clip-art**. Not badly drawn:
wrongly made. An even contour with a joint seam at every pivot is what a
cutout rig looks like, and no amount of rigging fixes it, because the problem
is that the drawing is a diagram of an animal rather than a drawing of one.

So a part may now carry `strokes` instead of, or beside, a `shape`:

```json
{ "id": "body", "parent": null, "pivot": [0, 0],
  "strokes": [
    { "path": "M 62 -14 C 26 -26 -34 -8 -92 -2 C -124 2 -142 -4 -164 14",
      "brush": "pencil", "color": "ink", "size": 7 }
  ] }
```

The part becomes a `paint` node and is drawn with the pressure-responsive
brushes, while still rotating about its joint like any other part. Rig **and**
drawing, not rig *or* drawing.

Three things make it work:

- **`attachPainters` already walked the whole scene**, attaching a painter to
  any node with `kind: 'paint'`. Nothing in the renderer needed changing; the
  compiler simply never produced such a node for a part.
- **The joint is the anchor.** `ax`/`ay` place the node's origin inside its
  own surface, so a limb turns about where it attaches rather than about the
  middle of its bounding box.
- **Paths are flattened to points, not shifted as text.** Moving strokes into
  surface space by adding an offset to every number in the path string
  corrupts `H`, `V` and `A`, which do not take alternating x,y pairs. The
  brush resamples by arc length anyway, so flattening costs nothing.

It also makes boil reach a character at last. `boil` refused a rig on the
grounds that a cutout character has no strokes to redraw — correct at the
time, and obsolete now. Naming a drawn cast member boils every one of its
parts, each on its own seed, because a figure whose every contour jumps on
the same frame reads as a glitch rather than as a redraw.

**Draw the contours past the joints.** A hand-drawn animal has one continuous
line through the shoulder. A contour that stops exactly at a pivot is how a
cutout rig announces itself, and overshooting is free.

#### What this does not solve

The generated quadruped in `core/script/quadruped.js` is still assembled from
shapes, and still reads as clip-art. It is kept because it is the parameterised
one — four breeds, measured gaits, derived proportions — and because the gait
cycles drive a drawn character unchanged, which is the whole point of keeping
the part names identical. A drawn animal is authored art; a generated one is
a default. They are different jobs.

### 3.7 Line weight that varies along the stroke

`08-ART-VOCABULARY.md` records "No variable-width line" as a limit of the
Canvas2D vector path. That is true and stays true — it is a limit of `path`,
not of the engine, because the paint layer's `pencil` brush is pressure-driven
and produces exactly this. With §3.6 that reaches characters too. **The
vocabulary doc needs correcting so the next reader does not conclude the look
is impossible.**

---

## 4. Order, and what each step is worth

| wave | item | engine? | risk | state |
|---|---|---|---|---|
| 1 | `expose` sheets | yes | low — `timeline.steps` already exists | **built** |
| 1 | `smear` over `buildEcho` | yes | low — the pass existed | **built** |
| 2 | `boil` | yes | medium — must refuse on rigs, must stay deterministic | **built** |
| 2 | paper/wash scenery templates | no | low | |
| 3 | quadruped `generate` | yes | high — new rig, new gaits | **built** |
| 3 | `part.strokes` — a drawn rig | yes | medium — found only by looking | **built** |
| 4 | the film itself | no | — | |

Waves 1 and 2 are what make a `rough-pencil` short possible at all. Wave 3 is
what makes *this particular* short possible.

---

## 5. What this design refuses to do

- **It will not redraw the reference.** The drawings in `anime22.mp4` are an
  artist's work. Reproducing the *technique* — rough line, varied exposure,
  boil, smear, a dog and a man — is the goal; tracing the frames is not, and
  passing off a trace as engine output would be a lie about what the engine
  can do.
- **It will not add a global "sketch filter."** A post-process that roughens
  clean art is the thing that looks like rough animation in a still and like
  nothing at all in motion, because it boils uniformly and has no construction.
- **It will not touch `shot.step`.** Six finished films depend on it.

---

## 6. How each item is verified

Per the repository's standing rule: the measurement is the evidence, and a
frame is checked only for what a number cannot see.

| item | measured by |
|---|---|
| `expose` | compiled `timeline.steps` spans match the sheet, and sum to the shot |
| `boil` | frame *N* renders byte-identical twice; frames *N* and *N*+1 differ |
| `smear` | the pose is sampled exactly `samples` times at the stated offsets |
| quadruped gait | footfall order and duty factor against the documented gait |
| the look | the scanner in §7, run on jireX output, lands in `rough-pencil` |

That last row is the real test, and it is the reason §2 defines the types by
measurement. **The engine's output is classified by the same program that
classified the reference.** If it does not come back `rough-pencil`, the look
was not achieved, whatever a frame appears to show.

---

## 7. `scripts/watch-video.mjs`

The tool all of the above depends on. There is no `ffmpeg` on the build
machine and no decoder in `node_modules`, so it decodes in headless Chrome and
reads frames back through a canvas — the same browser the renderer uses.

Three things it learned the expensive way, recorded so they are not relearned:

- **`seeked` does not mean the frame is drawable.** Seek, await `seeked`, then
  `drawImage`, and you get the frame that was on screen *before* the seek. The
  event that means "this frame is now the one you would see" is
  `requestVideoFrameCallback`. The first run of this tool produced four
  identical stills from four different timestamps and they looked plausible.
- **`requestVideoFrameCallback` does not fire while paused in headless.** So
  seek-per-frame deadlocks. The working design plays the file once in real
  time and captures from the callback, which is also ~20× faster.
- **A `setContent` page is a different origin from the video**, so the canvas
  taints and `getImageData` throws. Serve the host page from the same server.
