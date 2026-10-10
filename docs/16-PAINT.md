# The paint layer: strokes, brushes, surfaces

**Status: built.** `src/core/paint/`, **fifteen brushes**, layers, grain,
wet media, chisel nibs, SVG path input, and a `film.json` binding. See the
sheet at `demo/out/brush-sheet.png` (`npm run make:brushes`).

This is the authoring layer over the paint kernels in
[15-PERFORMANCE.md](15-PERFORMANCE.md). The kernels decide how a dab lands;
this decides where the dabs go and what each one is.

---

## 1. The three pieces

```
src/core/paint/
  path.js       SVG path data -> stroke points
  stroke.js     polyline + pressure -> [x, y, r, flow, angle, aspect] dabs
  brushes.js    fifteen named brushes, as plain data
  texture.js    procedural grain tiles
  Surface.js    one premultiplied f32 buffer, and compositing
  Document.js   a layer stack with blend modes

src/backends/canvas2d/
  PaintPainter.js   rasterises a `kind: 'paint'` node onto a canvas
```

```js
import { loadKernels } from './src/kernels/index.js';
import { PaintSurface } from './src/core/paint/Surface.js';

const K = await loadKernels();
const surface = new PaintSurface(K, 1280, 720);

surface.draw({
    path: 'M 20 100 C 120 20, 220 180, 320 100',   // SVG, not coordinates
    brush: 'ink', size: 24, color: '#161a20', seed: 7,
});
surface.toRgba8(imageData.data);
```

Or declaratively, in a `film.json`:

```json
"drawings": [{
  "id": "sketch", "at": [640, 360], "width": 900, "height": 540,
  "layers": [
    { "name": "under", "strokes": [
      { "path": "M 100 400 C 300 120, 600 120, 800 400",
        "brush": "pencil", "color": "ink", "size": 6 } ] },
    { "name": "ink", "blend": "multiply", "strokes": [ ... ] }
  ]
}]
```

```json
{ "target": "sketch", "do": "draw", "for": 3, "ease": "smooth" }
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

## 4. Paths, not coordinate lists

A stroke takes `path` (SVG path data) or `points`. **`path` is the one to
reach for.**

Without it, drawing anything means emitting a list of coordinates — two
hundred of them for a curve. That is miserable to write by hand, and for a
language model it is worse than miserable: a long run of unstructured
numbers with no redundancy is exactly the output shape that drifts. SVG
path data is compact, is the most widely published vector notation there
is, and any model that has seen the web writes it fluently.

`M m L l H h V v C c S s Q q T t Z z` are supported, absolute and
relative, including the compact forms real path data uses — `10-20` with no
separator, `.5.5` as two numbers, exponents. Several subpaths produce
several runs, never one joined run, because joining them draws a line that
was never in the path.

**Arcs (`A`) are not supported** and raise a diagnostic naming the command,
then skip their seven parameters so the rest of the path still parses.
Endpoint-to-centre parameterisation is disproportionate code for a
notation that is rare in hand-authored paths, and `circlePath()` and
`rectPath()` cover what people actually want arcs for.

---

## 5. The brushes

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
| `chiselMarker` | 0.70 | 0.55 | peak | fixed 45° nib; swells with direction |
| `calligraphy` | 0.95 | 1.00 | peak | narrow broad-edge nib at 30° |
| `flatBristle` | 0.50 | 0.70 | peak | nib follows travel; constant-width ribbon |
| `watercolor` | 0.12 | 0.30 | build-up | heavy pickup, little fresh colour |
| `oil` | 0.60 | 0.95 | peak | carries *and* deposits, with canvas grain |
| `smudge` | 0.30 | 1.00 | peak | pure smear: picks up all, deposits nothing |
| `eraser` | 0.95 | 1.00 | peak | destination-out |
| `softEraser` | 0.08 | 0.30 | build-up | feathered, for lifting a highlight |

`pen` exists precisely because everything else varies with the hand: panel
borders and lettering must look drafted, not drawn. And `chalk` against
`charcoal` is the clearest illustration of `mode` — same granularity,
different accumulation, and the grain only stays readable in peak mode.

An unknown brush name **throws**. A typo that quietly substitutes a default
survives until someone compares two renders side by side.

### Nibs: why a chisel cannot be faked

`aspect` is the nib's width across its length and `angleMode` decides what
the angle is measured against. The two choices are different instruments,
not variations:

- **`fixed`** — the nib is held at a constant angle to the *paper*, so the
  mark changes width as the stroke changes direction. A calligraphic pen,
  a chisel marker. **That direction-dependent swell is most of what makes
  lettering read as lettering**, and modelling it the other way produces a
  constant-width ribbon, which is precisely what it must not be.
- **`follow`** — the nib aligns with travel. A flat bristle brush dragged
  edge-on, which does give a constant-width ribbon.

### Grain: paper tooth belongs to the paper

`grainMode: 'canvas'` locks the texture to canvas coordinates, so passing
over the same patch twice hits the same high points — which is what makes
a dry medium look dry. `'dab'` locks it to the dab, right when the texture
*is* the tip shape (a spatter, a bristle cluster) and wrong for paper,
where it smears a copy of the texture along the stroke and reads as a
rubber stamp repeated at high frequency.

Tiles are **generated, not loaded**: four numbers instead of an asset that
has to travel with the `film.json`, deterministic from a seed, and zero
dependencies. Strength is baked into the tile, so the kernel's
`alpha *= texel` is already a strength-weighted blend.

### Wet media: two rates, deliberately independent

A wet brush carries a reservoir that mixes with what is underneath.
`smudge` is how much canvas colour it picks up per dab; `colorRate` is how
much fresh paint it adds. **Krita's original colour-smudge engine coupled
them, and separating the two was the central fix of their rewrite** —
coupled, you cannot ask for "drag existing paint a long way while adding
almost no new colour", which is most of what blending a gradient is. The
`smudge` brush is exactly that case: `colorRate: 0`.

Two details that are wrong in the obvious implementation:

- **Pickup averages over a disc, not a texel.** A point sample jumps at
  every hard edge and speckles the stroke; it is worse still with a
  textured tip, where it can sample a hole. Krita reached the same
  conclusion when they fixed smudge radius.
- **The reservoir loads from the canvas on first contact**, not from the
  brush colour. Seeding it with the brush colour looks harmless, but at
  `colorRate: 0` there is no fresh paint to wash it out and the first
  dabs deposit that colour anyway — measured, 0.09 of it.

Wet brushes composite dab by dab rather than through a coverage mask,
because each dab carries a different colour. That makes them inherently
sequential, so they cannot use the worker pool and are the slowest brushes
here.

---

## 6. Layers

```js
const doc = new PaintDocument(kernels, 1280, 720);
doc.addLayer({ name: 'colour' });
doc.addLayer({ name: 'ink', blend: 'multiply', opacity: 0.9 });
doc.draw('ink', { path: 'M 20 100 L 300 140', brush: 'ink', color: '#111' });
doc.flatten();
```

Stroke order alone covers a single flat drawing. Layers earn their memory
when something must change *after* the strokes under it exist: a blend mode
applies to a whole group at once (ink multiplied over colour is the
standard comic pipeline, and ordering strokes cannot express it); group
opacity is not per-stroke opacity, because overlapping strokes inside the
group would show through one another; and a layer can be hidden or
reordered without re-running the strokes beneath it.

The cost is honest: **33 MB per layer at 1080p**. A twelve-layer document
is 400 MB and a flatten is twelve full-frame passes — exactly the
bandwidth-bound shape the worker pool exists for, so `flattenAsync` is the
one to use at that size.

Thirteen separable blend modes, from the W3C specification. The formula
carries one trap:

```text
co = (1 - ab)·cs + (1 - as)·cb + as·ab·B(Cb, Cs)
```

Lowercase is premultiplied, uppercase is **straight**. `B` is defined on
straight colour, so a premultiplied buffer must un-divide before calling
it. Applying `B` to premultiplied values weights each colour by its own
coverage and drags every blend toward black wherever either layer is
partly transparent — and it looks almost right at full opacity, so it
survives casual inspection.

Layers are addressed **by name**, because a `film.json` should say
`"layer": "ink"`. An index silently means something else the moment a layer
is inserted, which is a particularly nasty failure in a declarative
document where nothing errors.

---

## 7. Two defects the tests found

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

## 8. What is not built

- **Stamp-image brushes from assets.** Grain is procedural and the kernel
  takes any u8 tile, so a scanned paper texture drops in with no change
  below `texture.js` — but nothing loads one yet.
- **Layer masks and clipping groups.** Layers composite; they do not mask
  one another.
- **Non-separable blend modes** — hue, saturation, colour, luminosity.
  They need the whole colour at once plus a luminance model, and no caller
  has asked.
- **Vector-first strokes.** A `path` is flattened at author time. Keeping
  the control points editable, and resampling on change, would make a
  stroke adjustable after the fact.
- **Live input binding.** `pressureFromVelocity` and `smoothPoints` exist
  for pointers with no pressure, but nothing is wired to
  `pointerdown`/`pointermove` yet.
- **Arcs in path data** (§4).
- **Incremental flatten.** Changing one layer re-composites all of them;
  there is no dirty tracking. A flatten is a handful of linear passes and
  the bookkeeping to avoid them is easy to get subtly wrong, in a way that
  shows as a stale layer on screen.
- **Per-stroke undo.** Strokes are replayed from the spec, so undo is
  "drop the last stroke and re-render", which is O(strokes).

---

## 9. Commands

```bash
npm run test:paint        # the stroke model and brushes
npm run test:media        # paths, nibs, grain, wet media, layers, the binding
npm run make:brushes      # -> demo/out/brush-sheet.png, every brush rendered
npm run audit:tests       # mutation audit: break the code, check the tests notice
```

The sheet renders entirely in Node — kernels, strokes, brushes, layers and
surfaces are all pure, and the PNG writer uses `node:zlib` and nothing else.

---

## 10. The mutation audit

Two tests in this repository once passed while measuring nothing. One
checked a smoothing filter by peak displacement, and a phase-inverted
signal has the same peak, so a filter that attenuated *nothing* satisfied
it. The other compared an airbrush against a marker across separate
strokes, where both composite identically.

Neither was found by reading the tests. A suite's pass count says nothing
about whether it would catch a regression, and the only honest way to ask
is to introduce one — so `npm run audit:tests` applies 51 plausible
defects (a flipped comparison, a dropped clamp, a swapped operand) and
reports any the suite fails to notice.

Its first run found **12 survivors**, and most had a single cause: every
test touching the new kernels went through the **wasm** backend, so the
entire JS fallback for blend modes, grain and smudge was unverified. That
is now covered by conformance tests comparing the two backends.

It also found two tests that were simply too weak — an `S` path command
checked by peak height, which pins down only half the reflection, and
grain measured along one scanline, which samples only three noise
features. Both now assert the property that matters: tangent continuity at
the join, and deviation over the stroke's two-dimensional core.

One mutation survives by construction and is marked as such: removing the
upper clamp on `progress` cannot change any result, because
`stampCountAt` already returns early at `p >= 1`. An *equivalent mutant*
is not a coverage gap, and listing it documents the redundancy rather than
leaving a future reader to rediscover it.

The sheet renders entirely in Node — kernels, strokes, brushes and surface
are all pure, and the PNG writer uses `node:zlib` and nothing else.
