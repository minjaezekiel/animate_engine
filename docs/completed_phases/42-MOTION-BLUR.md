# Phase 47 — motion blur, by subframe accumulation

**Done.** Audit priority 3, and after the rack focus it was the clearest
remaining visual difference between this renderer's output and reference work
at 24fps.

## The problem, stated precisely

Every frame this engine drew was an **instant**. A real camera's shutter is
open for a fraction of a frame and integrates whatever crosses it. Without
that, fast motion strobes: a whip pan judders, and a hand that moves 12 px in
a frame arrives as two sharp hands rather than one smeared one.

## Why accumulation and not a post-process

A velocity-buffer blur is the cheap answer and it is wrong at every
silhouette edge, because it has to guess what was *behind* the moving thing
and there is nothing in the frame that knows. Accumulating real subframes is
ground truth: render the frame several times at several instants inside the
shutter's opening and average them.

Expensive, exact, and — the reason it was the right thing to build here — it
needs nothing the renderer did not already have. **This engine can already
draw frame N at any `t` it is asked for.** That is the whole of it. The render
loop grew one inner loop:

```js
if (blur) {
    blur.begin();
    const times = blur.times(t);
    for (const sub of times) { await drawAt(sub, n); blur.take(); }
    blur.end(times.length);
} else {
    await drawAt(t, n);
}
```

`drawAt` was factored out of the existing loop body rather than written twice
— and that was not tidiness. An earlier draft had the blur path forget
`physics.stepTo`, so a film with motion blur had *static physics*. Writing the
sequence once makes that class of divergence impossible.

## It stays deterministic

Subframe times are a pure function of the frame index, so frame N is still a
pure function of N — the property the whole pipeline rests on. No jitter, no
stochastic sampling, no seed. A stochastic sampler would hide banding better
at low sample counts and would break the one guarantee that makes this
renderer testable, so it was never on the table.

## Three decisions worth recording

**Midpoint sampling.** Subframe *j* sits at `(j + 0.5) / samples` through the
window, not at `j / (samples − 1)`. Endpoint sampling double-counts the frame
boundary — with a 360° shutter the last subframe of frame N is the same
instant as the first of frame N+1, and that instant gets twice the weight —
and the midpoint rule is simply better quadrature, with error falling as
1/n² rather than 1/n. A single sample then lands exactly on `t`, which means
`samples: 1` is bit-identical to no blur rather than a half-frame offset: the
feature switches off without shifting the film in time.

**The average is in linear light.** A shutter integrates radiance, and
radiance is linear. sRGB is roughly a 2.2-power encoding, so averaging the
*encoded* bytes of a bright moving highlight against a dark background gives a
blur that is markedly too dark — the classic "dirty" motion blur. Half a frame
of white and half of black must resolve to **188**, the encoding of 0.5 linear,
and not to the byte average of 128. Alpha is averaged *without* a transfer
curve, because alpha is coverage rather than colour and putting it through a
gamma shows up as a halo on an edge against transparency.

**The result is written back onto the backend's own canvas.** The obvious
design accumulates into a canvas of its own and hands that to the sink. It
does not work, and the reason is invisible until something breaks:
`MediaRecorderSink.configure` calls `canvas.captureStream(0)` on the canvas it
is given and drives every frame from that one object. Hand it a different
canvas at `writeFrame` time and the recording is of the original —
unblurred, or blank. So the averaged pixels are `putImageData`-ed back, and
every sink keeps seeing the surface it was configured with.

Which means the output surface has to be a **2D** canvas. The 2D path always
has one. The 3D path renders into WebGL and only has a 2D composite when
something asked for one — an overlay, a transition — so motion blur joined
that condition. If it is somehow still absent, the accumulator throws with
that sentence in it rather than rendering sharp and saying nothing.

## Defaults, in the language a cinematographer uses

`shutter` is an angle in **degrees**, because every reference an author will
consult uses degrees: 180 is the convention and means half a frame, 360 reads
as smeared, 90 is the staccato *Saving Private Ryan* look. `samples` defaults
to 8 — at 4 a fast pan reads as four ghosts rather than a smear, **which is
worse than no blur at all because it looks like a fault**, and by 8 the ghosts
merge. Below 4 is warned about in exactly those terms.

A bare number is read as a sample *count*, not an angle, because the count is
the quality/cost dial and a bare number under 360 would otherwise be ambiguous
between the two. A `shutter` below 1 degree is **rejected**: 0.5° is 1/720th
of a frame, which nothing has ever been shot at, and it is overwhelmingly
likely to be someone writing the fraction they meant — half a frame *is* 180°.

Opt-in, and the reason is cost rather than taste. Measured below at **19.8x**
for 8 samples — not the 8x the sample count suggests, because the per-subframe
pixel readback is larger than the draw — so switching it on everywhere would
turn the Earth film's 175-second render into the better part of an hour.

```json
"meta": { "motionBlur": true }
"meta": { "motionBlur": 16 }
"meta": { "motionBlur": { "samples": 8, "shutter": 90, "center": true } }
```

## Measured on pixels, against the physics

[`test/e2e/motion-blur.mjs`](../../test/e2e/motion-blur.mjs) builds a Scene
and a Timeline by hand — no film DSL, because `renderOffline` is what the blur
hooks into and putting a compiler between the test and the code under test
buys nothing — and slides a white bar across black at 11.7 px per frame.

```
  variant            partial cols   lit cols   peak
  sharp                         0         24   255.0
  blurred (180 deg)            11         30   255.0
  wide    (360 deg)            21         35
  still frames identical: true (max column difference 0.000)
```

The claim is not "it got blurrier". **The smear must be exactly as wide as the
bar's travel during the shutter's opening**: 11.7 px per frame means 5.8 px at
180° and 11.7 px at 360°. Measured: **6 px and 11 px.** Within a pixel of the
physics, at both angles — which is what distinguishes a correct shutter from
any blur at all, since asserting only "wider is wider" would pass a shutter
open for any fraction unrelated to the angle asked for.

Three more properties, each guarding a failure that would be invisible on
moving footage:

- **A still frame is bit-identical** (max column difference 0.000). A blur
  that drifts a static shot is averaging wrongly and nobody would notice until
  a held shot changed colour. A matching unit test asserts a uniform frame
  resolves to *itself* at every level from 0 to 255.
- **108% of the light survives** — over 100% because the measure sums sRGB
  luma and a smeared edge puts more pixels at mid grey. Its job is to catch
  the opposite failure: averaging in sRGB loses a large fraction of a bright
  thing's light against a dark background.
- **The 3D path renders with blur**, through `film3d.html` and its composite,
  which is where the WebGL-canvas trap lives.

## The real cost is 20x, not 8x — measured, and it caught my own fix

Rendering a real film is what found this. The AK-47 film at 480x270, 1,200
frames, 50 seconds:

| | per frame | wall |
|---|---|---|
| no blur | 6.4 ms | 8.2 s |
| 8-sample, 180 degrees | **127.0 ms** | 152.8 s |

**19.8x, not 8x.** Each subframe pays a `getImageData` that is *larger than
the draw it accompanies* — about 9.5 ms at this resolution against 6.4 ms of
rendering. The readback dominates, and at 8 samples it is three quarters of
the frame's cost.

Which means the first version of the preflight fix was itself wrong. Preflight
measures one draw per frame, so with blur it under-reported by 8x and would
have cleared a render far over budget — the entire point of preflight,
defeated in the one case where it matters most. I multiplied its estimate by
the sample count, which closed 8x of a 19.8x gap and left it **2.5x
optimistic**: still clearing renders it should flag. The exact failure the
parameter was added to prevent, surviving inside the fix for it, and only a
real render showed it.

So the two terms are handled differently, on purpose:

- **The draws are multiplied.** Measuring them would make preflight itself
  eight times slower, which is the cost it exists to avoid paying.
- **The readback is measured**, once, with one `getImageData` plus one
  `putImageData` at the output size. No multiplier could have guessed it: it
  scales with resolution and with how a given machine moves pixels off the
  GPU, and on this one it is the larger half.

`preflight` now reports `readbackMs` and `subframes` alongside the costs, so
the number can be read rather than inferred.

## A flaky test, caught and replaced

The first version of that preflight test busy-waited 4 ms per draw and checked
that `withinBudget` flipped. It passed alone and **failed under `node --test`'s
parallel runner**: contention stretched 4 ms to 60.92 ms, so the *unblurred*
run was already over budget. Wall-clock assertions in a suite that runs files
concurrently measure the machine, not the code. Replaced with assertions on
the accounting — the subframe count is reported, and preflight does not
actually draw eight times — which are deterministic. Verified stable over
repeated full runs.

## Numbers

| | Before | After |
|---|---|---|
| Motion blur | none on either path | subframes, both paths |
| Smear accuracy | — | within 1 px of the travel, at 180° and 360° |
| Preflight with blur | 20× optimistic | measures the readback |
| Measured cost, 8 samples | — | 19.8× (6.4 → 127.0 ms/frame) |
| Unit tests | 1,194 | **1,222** |

## Files

- `src/core/motion/motionBlur.js` — new, pure. `subframeTimes`,
  `normalizeMotionBlur`, the sRGB transfer pair, `accumulateInto`,
  `resolveAccumulator`, `motionBlurCost`.
- `src/render/motionBlur.js` — new. The canvas accumulator.
- `src/render/OfflineRenderer.js` — `drawAt` factored out, the subframe loop,
  and preflight's cost multiplier.
- `src/core/script/compile.js`, `compile3d.js` — `meta.motionBlur` normalised
  on both paths.
- `film3d.html` — motion blur added to the composite condition; passed
  through. `src/studio.js` — passed to the render and to preflight.
- `test/core/motion-blur.test.mjs` — 27 tests.
- `test/e2e/motion-blur.mjs` — `npm run test:blur:e2e`, 2D and 3D arms.

## Not done, and said plainly

**No shipped film declares it yet.** The Earth film's motion is gentle — 0.1
turns over 6.4 seconds — so blur there would be invisible and would cost 20x
for nothing. The AK-47 film was rendered with it to get the numbers above, and
its bolt cycle is the right kind of motion, but whether the result *looks*
better is a judgement that wants eyes on the file rather than a number, so it
is not declared in the committed film.

**The readback is the obvious thing to optimise and has not been.** Averaging
on the GPU — one `drawImage` per subframe at `globalAlpha = 1/samples` —
would remove the readback entirely and is perhaps 2.5x faster. It also
averages in sRGB rather than in linear light, which is the one thing this
phase went out of its way to get right. A `fast: true` option that trades the
gamma for the speed is defensible and is not built.
