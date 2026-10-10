# Picture into video, and the agent surface

**Status: built.** `src/core/motion/`, `src/core/script/ops.js`,
`mcp/paint-server.js`, `src/io/png.js`. See
[16-PAINT.md](16-PAINT.md) for the paint layer underneath.

---

## 1. Everything here is one operation

Ken Burns, 2.5D parallax, a water ripple and a puppet warp are the same
thing: **deform a textured mesh over time.** `warp_mesh` rasterises it, and
each effect is a function that moves vertices. That is why there is no
separate code path per effect, why they compose by running in sequence, and
why a fifth would be a dozen lines.

| effect | what it moves |
|---|---|
| `kenBurns` | the four corners — the degenerate case |
| `parallax` | each vertex by its depth × a camera offset |
| `wave` | a travelling sinusoid, optionally confined to a band |
| `puppet` | pinned points, with a smooth falloff |

`renderAt(t)` reads only `t`. No integrator, no previous frame, no
accumulation — the same discipline the particle system follows, so
scrubbing backwards costs what scrubbing forwards costs.

```js
const photo = new PhotoMotion(kernels, {
    width: 1280, height: 720, duration: 6,
    source: { data, width, height },          // u8 RGBA
    depth:  { data, width, height },          // greyscale; white is near
    effects: [
        { type: 'kenBurns', to: { zoom: 1.12 } },
        { type: 'parallax', amplitude: 0.05, orbit: [1, 0.4] },
    ],
});
photo.renderAt(2.5);
await photo.renderAtAsync(2.5);               // 91 ms -> 18 ms on the pool
```

---

## 2. Three things that are wrong in the obvious implementation

### Overscan, or a bright band marching along the border

Parallax pushes the background **inward** on one side, which uncovers the
frame edge. Ken Burns below zoom 1 does the same. The fix is to build the
mesh larger than the frame so there is picture to pull in from, and it is
derived from the effects rather than left to the author — who cannot
reasonably compute it, and whose only warning otherwise is watching a
border.

The arithmetic has a trap that cost a round: `overscan = 1 + margin` scales
about the centre, so it puts only `margin / 2` outside **each** edge, while
the displacement being covered is per-side. The first version left exactly
one uncovered row, which is easy to dismiss as antialiasing.
`test/core/motion.test.mjs` now asserts zero uncovered pixels across seven
effect combinations at seventeen times each.

### The depth map must be blurred before it displaces anything

The mesh is continuous, so a hard depth edge **pins the silhouette**:
vertices inside the subject move one way, vertices a cell outside move the
other, and the subject stretches in place instead of sliding. Blurring
spreads the discontinuity over several cells, turning a pinned edge into a
gradual shear. Measured on a hard step, the largest per-cell depth jump
falls from 0.41 to 0.18 at the default radius.

This runs through `blur_rgba`, which is three running-sum box passes, so
the cost does not grow with radius — and a depth map wants a generous one.

Softening a pinned edge is a treatment, not a cure; §3 removes the pinning
itself, and `tear` therefore turns this blur **off** by default.

### Parallax with no depth map must do nothing

Without one, every vertex reads depth 0, so `depth − focus` is the same
constant everywhere and the effect degenerates into a **uniform pan** —
measured at nearly 8 px of unasked-for drift. An effect named "parallax"
doing that silently is worse than doing nothing, so it is skipped and
`photo_create` says `"depth": "none -- parallax will do nothing"`.

---

## 3. Tearing the mesh

Parallax moves a foreground across a background, exposing pixels that were
never photographed. A single connected grid cannot separate the two: the
cell straddling a silhouette has one corner on the subject and one on the
background, parallax sends them opposite ways, and the cell **stretches
across the gap**. The subject's edge smears outward, and past about
`amplitude: 0.05` a portrait turns to rubber.

`tear: true` cuts the surface instead.

```js
new PhotoMotion(kernels, { source, depth, tear: true,
                           effects: [{ type: 'parallax', amplitude: 0.12 }] });
new PhotoMotion(kernels, { source, depth, tear: { at: [0.35, 0.7], fill: 0.04 } });
```

Every triangle whose vertices do not all lie on one side of a depth level
is cut along the contour, and the crossing points are **duplicated** —
the near side's copy takes the depth of the near end of the edge it sits
on, the far side's copy the far end's. The near piece then moves rigidly
at its own depth. Measured on a hard depth step at `amplitude: 0.12`, the
silhouette travels the full 4.9 px its depth calls for; the untorn mesh
moves it **one** pixel and stretches the rest.

Three decisions in there are not obvious:

**No sharpness threshold.** A tear's size is already proportional to the
depth jump across it, so cutting a smooth gradient separates its sides by
an imperceptible amount while cutting a silhouette separates them fully. A
threshold would only buy inconsistency — an edge cut in one triangle and
left whole in its neighbour is a visible hairline.

### Where to cut: finding the planes

`tear.at` defaults to levels found by `depthPlanes`, and the two obvious
ways to pick one are both wrong, which is worth recording because the
second is the textbook answer.

**The midpoint of the observed range** assumes the depth distribution is
symmetric. It never is: a background occupies most of the frame while a
subject occupies a narrow band near the top of the range.

**Otsu's method** maximises the variance *between* two classes, so it
splits whichever class is most spread out. On a subject at 0.95 against a
background spread evenly over 0.0–0.8, Otsu returns **0.499** — it cuts
the background in half and leaves the subject attached to the front of it,
landing within four thousandths of the midpoint it was meant to improve
on. Measured, not assumed; that is why it is not what shipped.

A plane boundary is a **gap**: two clusters of depth with nothing between
them. So the thing to look for is a *valley* in the histogram, ranked by
how far it sits below the lower of its two flanking peaks. `tear.planes`
asks for more than one.

That buys a property the other two cannot have: on a depth field with no
planes — a continuous ramp, a landscape receding to the horizon — there is
no valley, so `depthPlanes` returns nothing, `tear` switches itself back
off, and the ops say so. Tearing a continuous surface is meaningless, and
declining to is what makes `tear: true` safe to set on any photograph.

Two details that cost a round each. The histogram is read from the depth
**map**, not from the mesh's sampled depths: the grid samples the map
bilinearly, so a hard silhouette arrives as a one-cell ramp whose mid
value is a third cluster with a gap either side of it — and the detector
then cut at the wrong gap, leaving the near piece holding the ramp's depth
so that it barely moved. And the histogram uses **64 bins, smoothed**:
more bins than the field has distinct values combs it, and at 128 bins an
8-bit linear ramp 96 pixels wide produced a spurious level at 0.028.

**A crossing point belongs to its edge, not to the triangle being cut**,
so the two triangles sharing an edge agree on it exactly. Together with
leaving the original vertices at their own depth, that means there are no
cracks anywhere except along the contour, where a crack is the point.

**The hole has to be filled, or the tear is worse than the smear.** The
subject slides away and uncovers transparent nothing. So the far side's
copy of each crossing is pushed `fill` pixels *past* the contour, with its
uv advancing to match, and the far side samples a **background plate**
rather than the photograph. `fill` is derived from the parallax reach,
because it is exactly as wide as the relative displacement of the two
sides and no author should have to compute that.

Sampling the photograph for that extension is one line away and looks
right — it is the same affine patch continued — but the picture it
continues into is the *subject*, so the subject's own edge pixels land in
the hole and the silhouette appears not to move at all. Measured, it sat
within a pixel of the untorn mesh. A regression test now compares the two
directly.

Tearing also turns the depth blur off by default (§2), since the blur
exists only to soften the pinning that tearing removes outright; blurring
a map about to be cut just moves the cut off the real edge.

---

## 4. The background plate: inpainting, once

A plate is the source photograph with everything nearer than a tear level
**removed and filled in behind**. One per level, built at construction, so
the per-frame cost of tearing is two `warp_mesh` calls over the same total
triangles instead of one — not one warp plus an inpaint.

| rung | what it gives | why not |
|---|---|---|
| mirror the strip forward | nearly free | visibly a reflection, and a seam where it meets the real background. **What this replaced.** |
| diffuse inward (Laplace) | seamless | a textured background turns to a flat smear, and the band runs the whole length of a silhouette |
| **push-pull pyramid** | detail near the edge, coarse structure in the middle; linear time; nothing to tune | blurry in the middle of a large hole |
| PatchMatch / generative | better again | an order of magnitude more code and time |

Push-pull is the right rung because of *where* the fill is seen. The whole
subject is removed, but only the first few percent of the frame past the
silhouette is ever revealed, and that band is surrounded by real
background on one side — exactly where push-pull is at its best. The
blurry middle of the hole sits behind the subject forever.

It runs as a Rust kernel (`rust/jirex-kernels/src/inpaint.rs`, with the
usual JS mirror and a conformance test). Every pixel carries a colour and
a **weight**: how much real photographed colour went into it. *Pull* sums
four children into a parent, weights included, so a hole contributes
nothing rather than contributing black. *Push* gives a pixel with full
coverage its own colour, one with partial coverage a mix in proportion to
that coverage, and one with none its parent's outright — then marks it
known, so the fill cascades down and arrives continuous with the real
pixels around it.

Two details that are not optional:

**The weight cannot be the alpha channel.** The obvious shortcut fails on
anything with real transparency: a cut-out has alpha 0 over genuinely
empty regions, which the pyramid would try to fill, and a semi-transparent
pixel would count as a partly missing one.

**The mask is dilated** before filling. A depth threshold cannot see the
rim of texels the silhouette shares with the background, because the rim
is where the depth map is *wrong*. Leaving it makes the fill propagate the
subject's colour inward — a coloured halo along the tear.

### What remains

Push-pull is interpolation, not synthesis: it cannot invent a texture or
continue a strong edge through a wide hole. At large amplitudes on a
busy background the fill reads as soft. PatchMatch or a generative model
would fix it, and both are out of scope here.

---

## 5. The agent surface

### Why it runs headless

`mcp/server.js` relays to a live browser over a WebSocket, because the 3D
editor needs WebGL and a DOM. The paint and motion layers need neither —
they read no clock, no DOM and no GPU — so `mcp/paint-server.js` runs them
in Node.

The difference matters more than it looks. With the bridge, an agent cannot
draw anything unless a human has a browser tab open and connected. Here it
calls a tool, a PNG appears on disk, and it can **open that PNG and look at
what it made**. The feedback loop closes without a person in it.

```jsonc
{ "mcpServers": { "jirex-paint": {
    "command": "node",
    "args": ["/path/to/jireX/mcp/paint-server.js"] } } }
```

### Schemas are generated, never written twice

All 21 tools are derived from `src/core/script/ops.js`. The existing server
hand-registers its tools **and** repeats the op list in a doc string, and
the two have already drifted — which is exactly the failure this avoids.
Adding an op to the table adds a documented tool with no edit to the server.

A test asserts every op has a real summary and every parameter a real
description, because those strings are a model's only guidance. It failed
on `"Delete a layer."` and that summary was rewritten.

### Designed for a caller that cannot see the screen

Every op returns a structured summary rather than "ok", because the
returned object is the agent's only feedback.

The sharpest case: a stroke drawn at `(-500, -500)` resamples into
**hundreds of dabs** and would report a healthy count while the picture is
untouched. So `paint_stroke` returns the dabs' bounding box and names the
three outcomes apart:

```jsonc
{"dabs": 533, "bounds": {"x0": 39.7, "y0": 99, "x1": 360.3, "y1": 201}}
{"dabs": 405, "bounds": {...}, "note": "drawn entirely outside the 400x260 canvas; nothing will appear"}
{"dabs": 0,   "bounds": null,  "note": "no dabs -- the stroke is empty; check `path` or `points`"}
```

Likewise `paint_render` reports the inked fraction, so a blank frame is
detectable without opening the file, and every lookup failure names what
does exist (`no layer "nope"; have: layer1, ink`).

Three discovery ops — `list_brushes`, `list_blend_modes`, `list_effects` —
exist so nothing has to be guessed from a name. `list_effects` returns each
effect's fields with units and sensible ranges.

### Strokes are SVG paths

`paint_stroke` takes `path`, not coordinates. One line instead of hundreds
of numbers, in the most widely published vector notation there is. See
[16-PAINT.md](16-PAINT.md) §4 for why that is the decisive ergonomic
choice rather than a convenience.

---

## 6. PNG, by hand

`src/io/png.js` encodes and decodes with `node:zlib` and nothing else. The
engine's rule is that nothing in its path may need an install, and an image
codec is where that rule is usually broken.

PNG is the one format worth implementing: the container is four chunk
types, the compression is deflate, and the only real work is undoing five
scanline filters. JPEG is a DCT and a Huffman decoder and is not worth
hand-rolling — a caller wanting JPEG decodes it in a browser with
`createImageBitmap` and passes the pixels in.

The encoder writes filter 0 throughout, so the decoder's other four
reconstructions would never run against its own output. The tests therefore
build PNGs with each filter applied by hand and decode them, because a PNG
from any other tool uses all five heavily.

Unsupported variants — 16-bit, interlaced — are **refused with a clear
message** rather than misdecoded. A silently wrong image costs far more to
diagnose than a refusal.

---

## 7. Depth from one photograph

Parallax and tearing both need to know what is near, and nothing in a
single photograph says so — depth from one view is a learned prior, not a
measurement. `src/core/motion/depth.js` is the one place in the engine
where a neural network earns its download.

```js
const est = new DepthEstimator({ modelUrl: DEPTH_MODELS.depthAnythingV2Small.url });
if (await est.available()) {
    const depth = await est.estimate({ data, width, height });   // u8 RGBA, white near
}
```

It follows the rules the TTS voices set, which are the precedent:
`onnxruntime-web` imported lazily by bare specifier through the page's
import map, so nothing that does not estimate depth pays for it;
`available()` that never throws, so a caller falls back to supplying a map
by hand; and the model as a url rather than a bundled file, because depth
models are tens of megabytes and would dwarf the engine.

It is **model-agnostic**: the input and output names come off the session
and the spatial dims off the output tensor, so any single-image model with
an NCHW float input and an N(1)HW output works — MiDaS, Depth Anything,
DPT — and a better model is a url change rather than a code change.

Two things a caller must get right, and both are in `DEPTH_MODELS`:

| | why it matters |
|---|---|
| `size` | the model's square input edge. The image is **squashed**, not letterboxed: padding is a colour the model reads as a surface at some distance, right at the frame edge where parallax displaces most. |
| `near` | `high` for inverse-depth models (MiDaS, Depth Anything), `low` for metric ones. `PhotoMotion` reads white as near, so getting this wrong inverts the scene. |

The prediction is normalised to its **own** extremes, since relative depth
has no absolute scale, and `min`/`max` come back on the result because a
flat prediction is a real failure mode: a map with no range makes parallax
a uniform pan, which is the degenerate case §2 refuses outright.

### It runs in Node too

`onnxruntime-node` and `onnxruntime-web` expose the same
`InferenceSession` and `Tensor`, so one adapter covers both and
`DepthEstimator` tries whichever belongs where it is running. That is what
makes `photo_estimate_depth` possible on the headless surface: an agent
takes a photograph, derives its depth map and animates it with no browser
anywhere in the loop.

```
photo_estimate_depth  { source, out, model, size, near }
photo_create          { source, depth: <that out>, tear: true, effects: [...] }
```

The runtime stays **optional** in both places — a page's import map in the
browser, an install the user chooses in Node — and neither is a dependency
of this package. When it is missing, the error names every candidate it
tried and the fix, because "cannot find module 'onnxruntime-node'" tells a
caller nothing about a package it never heard of. Everything except the
session creation is pure, and the Node tests drive the whole pipeline
against a stub session — the same bargain the voice providers make with a
fake provider.

**Not built here:** the two URLs in `DEPTH_MODELS` are candidates to
confirm against the model host, not promises; there is deliberately no
default, because a wrong constant fails as a 404 halfway through a 50 MB
fetch.

---

## 8. A photo in a film

`photos` is the declarative half of all of the above: the same four
effects, authored in the film rather than called through the API.

```jsonc
"scenes": [{
  "id": "s1",
  "photos": [{
    "id": "hero",
    "source": "portrait", "depth": "portrait_depth",   // asset ids
    "duration": 6, "tear": true,
    "effects": [
      { "type": "kenBurns", "to": { "zoom": 1.12 } },
      { "type": "parallax", "amplitude": 0.05 }
    ]
  }],
  "shots": [{ "id": "a", "duration": 6 }]
}]
```

**It reuses `draw`.** A photo's animation runs on `props.progress`, 0 to 1
— the same channel a drawing's reveal uses — so `{ "do": "draw",
"target": "hero", "at": 1, "for": 4 }` retimes a photo with no new verb,
no new validation branch and no new compiler path. Every ease, hold and
transition the animation system already has therefore applies to a photo
for free, including running it backwards with `from: 1, to: 0`.

**A photo with no action plays**, across its own duration, defaulting to
the rest of the scene. That is the opposite default from a drawing, which
holds at `progress: 1`: a drawing with no action should be *present*, a
photograph in a shot should be *moving*.

Nothing is rasterised in the compiler. The node carries an unrasterised
spec in `props.photo` and `attachPainters` resolves it to a `PhotoPainter`
at mount, exactly as a drawing resolves to a `PaintPainter`. One branch in
`shapes.js` draws both, because both expose `canvasAt(progress)`.

The validator checks what it can see: an undeclared source or depth asset
is an **error**, an unknown effect name is a warning that lists the real
ones, and `parallax` or `tear` without a depth map is a warning that says
it will do nothing.

---

## 9. What is not built

- **Texture synthesis in the fill** (§4). Push-pull interpolates; it
  cannot invent a texture or carry a strong edge through a wide hole, so a
  large tear over a busy background reads as soft. PatchMatch or a
  generative model is the upgrade.
- **No verified model url** (§7). `DEPTH_MODELS` lists candidates to
  confirm against the host, and there is deliberately no default.
- **Video output from the ops.** `photo_render_sequence` writes numbered
  PNGs; turning those into a file is an `ffmpeg` call away but is not done
  here.
- **JPEG and WebP decoding** (§5). In a browser `createImageBitmap` plus a
  canvas `getImageData` covers every format the browser decodes, which is
  the path `PhotoPainter` already takes.

---

## 10. Commands

```bash
npm run mcp:paint       # the MCP server, 21 tools, headless
npm run test:motion     # effects, overscan, tearing, depth estimation
npm run test:ops        # the op surface and the PNG codec
npm run audit:tests     # mutation audit across everything
```
