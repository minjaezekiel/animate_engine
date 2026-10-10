# The paint layer: strokes, brushes, surfaces

**Status: built.** `src/core/paint/`, 28 tests, nine brushes. See the sheet
at `demo/out/brush-sheet.png` (`npm run make:brushes`).

This is the authoring layer over the paint kernels in
[15-PERFORMANCE.md](15-PERFORMANCE.md). The kernels decide how a dab lands;
this decides where the dabs go and what each one is.

---

## 1. The three pieces

```
src/core/paint/
  stroke.js     polyline + pressure -> [x, y, radius, flow] dabs
  brushes.js    nine named brushes, as plain data
  Surface.js    the f32 premultiplied buffer, and compositing
```

```js
import { loadKernels } from './src/kernels/index.js';
import { PaintSurface } from './src/core/paint/Surface.js';

const K = await loadKernels();
const surface = new PaintSurface(K, 1280, 720);

surface.draw({
    points: [{ x: 20, y: 100, p: 0.2 }, { x: 300, y: 140, p: 1 }],
    brush: 'ink', size: 24, color: '#161a20', seed: 7,
});
surface.toRgba8(imageData.data);
```

---

## 2. Why a stroke is two passes, not one

The naive brush composites each dab straight onto the layer. Dabs overlap
about tenfold at normal spacing, so the alpha compounds and the stroke
comes out far darker than asked — **darker still wherever the input
happened to be sampled densely**, which is to say wherever the hand moved
slowly or a corner doubled back. The result records input sampling rate
instead of intent.

So dabs accumulate into a single-channel **coverage mask**, and the mask is
composited **once** at the stroke's opacity. Each pixel is darkened exactly
once per stroke however many dabs hit it.

This is why `flow` and `opacity` are separate fields and must not be
conflated: `flow` is what one dab deposits and shapes the mark; `opacity`
is how strong the finished stroke is.

A test asserts it directly — a flow-0.5 marker drawn over 200 densely
sampled points must peak at 0.5, not at 1.

---

## 3. Draw-on animation is free, and this is why

`resampleStroke` walks the polyline **by arc length from the start**. So
the first N dabs of a stroke are the same dabs however much of it is
revealed: a partially drawn stroke is a *prefix*, not a different
computation.

Frame N therefore renders by stamping the first `stampCountAt(progress)`
quads of a buffer computed **once**:

- frame N stays a pure function of N — no history buffer, no accumulation
  between frames, which is the engine's core contract;
- scrubbing backwards costs exactly what scrubbing forwards costs;
- the reveal is driven by an ordinary **number channel**, so every easing,
  clip, mask and additive layer from Phase 13 applies to it with no new
  concept and no new code.

Two details that are easy to get wrong:

**Taper is computed against the full stroke length, not the revealed
length.** A draw-on reveals a finished stroke progressively, so its tail
must narrow where the stroke truly ends. Tapering to the moving cursor
reads as a stroke being *pushed* rather than uncovered.

**`drawAll({ at })` weights by dab count, not stroke count.** Otherwise a
single dot takes as long to appear as a sweeping line, which reads as a
stall.

---

## 4. The brushes

A brush is a plain data record — nothing executable — so the library is
serialisable into a `film.json`, diffable, and writable by an agent that
has never held a stylus.

What actually distinguishes them is `mode`:

- **peak** — `coverage = max(coverage, dab)`. The mark reaches the brush's
  flow and stops; dwelling changes nothing. A pen, a pencil, a marker.
- **build-up** — `coverage += dab · (1 - coverage)`. Overlap accumulates,
  so dwelling deposits more and a slow pass is darker. An airbrush, and
  charcoal worked with a loaded stick.

| brush | hardness | flow | mode | character |
|---|---|---|---|---|
| `pencil` | 0.75 | 0.55 | peak | granular; pressure drives *flow* more than size |
| `pen` | 1.00 | 1.00 | peak | deliberately inert — no pressure, no taper |
| `ink` | 0.92 | 1.00 | peak | flexible nib; swells and tapers hard |
| `marker` | 0.55 | 0.50 | peak | translucent but uniform; a second pass darkens |
| `airbrush` | 0.04 | 0.08 | build-up | records dwell time |
| `charcoal` | 0.30 | 0.30 | build-up | accumulates *unevenly* — a dry medium |
| `chalk` | 0.70 | 0.72 | peak | granular with a ceiling, so grain stays legible |
| `eraser` | 0.95 | 1.00 | peak | destination-out |
| `softEraser` | 0.08 | 0.30 | build-up | feathered, for lifting a highlight |

`pen` exists precisely because everything else varies with the hand: panel
borders and lettering must look drafted, not drawn. And `chalk` against
`charcoal` is the clearest illustration of `mode` — same granularity,
different accumulation, and the grain only stays readable in peak mode.

An unknown brush name **throws**. A typo that quietly substitutes a default
survives until someone compares two renders side by side.

---

## 5. Two defects the tests found

**The smoothing control did nothing at maximum.** Input stabilisation is
`out = (1-k)·cur + (k/2)·(prev + next)`. Its gain against the
jitter frequency is `|1 - 2k|`, which is **not monotonic in `k`**:

| k | gain |
|---|---|
| 0.25 | 0.50 |
| 0.50 | **0.00** |
| 0.75 | 0.50 |
| 1.00 | **1.00** |

Passing `amount` straight through as `k` meant sliding smoothing to its
maximum attenuated *nothing* — it inverted the wobble's phase and left the
amplitude intact. `amount` now maps to `k = amount/2`, so `amount = 1` is
the standard `[0.25, 0.5, 0.25]` kernel that nulls that frequency exactly,
and `passes` widens the kernel for more. Measured on broadband input, mean
roughness falls from 3.68 to 0.84 in one pass and 0.09 in eight.

The test that caught it originally measured peak displacement and *passed*,
because a phase-inverted signal has the same peak. It now measures the mean
absolute second difference, which is what a wobble physically is.

**The hard brush was not antialiased.** From Phase 17: the circle cull
`d² > r²` rejected every pixel beyond the nominal radius *before* the
falloff was evaluated, discarding the whole feather band. The first fix
exposed a second problem — a half-pixel ramp is too narrow for pixel
centres to land in, giving a radius-8 circle 8 partial pixels out of a
~50px circumference. The ramp is now a full pixel, centred on the nominal
radius.

---

## 6. What is not built

- **Textured and stamp-image brushes.** Every dab here is a procedural
  radial falloff. Real dry media use a sampled grain image, and the
  kernel would need a texture argument.
- **Wet media and colour mixing.** Dabs deposit one colour; they do not
  pick up what is under them.
- **Vector-first strokes.** Points are baked at author time. Editable
  control points with a resample on change would make a stroke adjustable
  after the fact.
- **Layers.** `PaintSurface` is one buffer. Layer stacks, blend modes and
  masks are the obvious next step and are all compositing over the same
  kernel.
- **Tilt and rotation**, for chisel and calligraphic nibs. `stamp_mask`
  stamps circles; an elliptical dab oriented to stroke direction is the
  change.
- **Live input binding.** `pressureFromVelocity` exists for pointers with
  no pressure, but nothing is wired to a `pointerdown`/`pointermove` yet.
- **A node kind.** A stroke list is not yet a scene node, so draw-on is
  not yet drivable from a `film.json` track. The mechanism is ready —
  `progress` is a plain number — only the binding is missing.

---

## 7. Commands

```bash
npm run test:paint        # 28 tests
npm run make:brushes      # -> demo/out/brush-sheet.png, every brush rendered
```

The sheet renders entirely in Node — kernels, strokes, brushes and surface
are all pure, and the PNG writer uses `node:zlib` and nothing else.
