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

## 3. Tearing the mesh, and the honest limit behind it

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

**A crossing point belongs to its edge, not to the triangle being cut**,
so the two triangles sharing an edge agree on it exactly. Together with
leaving the original vertices at their own depth, that means there are no
cracks anywhere except along the contour, where a crack is the point.

**The hole has to be filled, or the tear is worse than the smear.** The
subject slides away and uncovers transparent nothing. So the far side's
copy of each crossing is pushed `fill` pixels *past* the contour while its
uv steps the same distance *back*, mirroring the strip of background just
behind the silhouette forward over the hole. `fill` is derived from the
parallax reach, because it is exactly as wide as the relative displacement
of the two sides and no author should have to compute that.

The mirror direction is one sign, and the wrong sign looks right on paper:
advancing the uv along with the position continues the same affine patch,
which is tidier — and carries the *subject's own edge pixels* into the
hole, so the silhouette appears not to move at all. It measured within a
pixel of the untorn mesh. The test now asserts the fill is background by
colour.

Tearing also turns the depth blur off by default (§2), since the blur
exists only to soften the pinning that tearing removes outright; blurring
a map about to be cut just moves the cut off the real edge.

### The limit that remains

Mirrored background is not inpainting. The fill is still edge content, now
confined to the hole instead of deforming the subject, and the far triangle
doing the mirroring has a different texture map from its neighbours — a
seam in the background at the contour, hidden under the near piece except
where the tear opens. Tools that go further **generate** the background
behind the subject, which needs a generative model and is out of scope
here.

---

## 4. The agent surface

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

All 20 tools are derived from `src/core/script/ops.js`. The existing server
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

## 5. PNG, by hand

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

## 6. Depth from one photograph

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

`onnxruntime-web` is a browser package, so estimation runs in the browser
and there is no `photo_estimate_depth` op. Everything except the session
creation is pure, and the Node tests drive the whole pipeline against a
stub session — the same bargain the voice providers make with a fake
provider.

**Not built here:** the two URLs in `DEPTH_MODELS` are candidates to
confirm against the model host, not promises; there is deliberately no
default, because a wrong constant fails as a 404 halfway through a 50 MB
fetch.

---

## 7. A photo in a film

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

## 8. What is not built

- **Inpainting the hole a tear opens** (§3). The fill is mirrored
  background, not generated content.
- **Multiple depth planes are supported but not automatic.** `tear.at`
  takes a list of levels; the default is one level at the midpoint of the
  depth present on the mesh, and nothing finds the planes for you.
- **No depth estimation in Node** (§6), and no verified model url.
- **Video output from the ops.** `photo_render_sequence` writes numbered
  PNGs; turning those into a file is an `ffmpeg` call away but is not done
  here.
- **JPEG and WebP decoding** (§5). In a browser `createImageBitmap` plus a
  canvas `getImageData` covers every format the browser decodes, which is
  the path `PhotoPainter` already takes.

---

## 9. Commands

```bash
npm run mcp:paint       # the MCP server, 20 tools, headless
npm run test:motion     # effects, overscan, tearing, depth estimation
npm run test:ops        # the op surface and the PNG codec
npm run audit:tests     # mutation audit across everything
```
