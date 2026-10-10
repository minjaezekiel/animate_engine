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

### Parallax with no depth map must do nothing

Without one, every vertex reads depth 0, so `depth − focus` is the same
constant everywhere and the effect degenerates into a **uniform pan** —
measured at nearly 8 px of unasked-for drift. An effect named "parallax"
doing that silently is worse than doing nothing, so it is skipped and
`photo_create` says `"depth": "none -- parallax will do nothing"`.

---

## 3. The honest limit: disocclusion

Parallax moves a foreground across a background, exposing pixels that were
never photographed. With a connected mesh the surface **stretches** rather
than tears, which is the right failure — a smear reads as motion blur at
small amplitudes and as rubber at large ones. There is no inpainting here,
so the usable amplitude is bounded by how much stretch the subject
tolerates; beyond about `0.08` a portrait starts to look like melted
plastic.

Tools that go further solve it by generating the background behind the
subject, which needs a generative model and is out of scope. What *is*
in scope and not yet done: tearing the mesh at depth discontinuities so a
near object separates cleanly, leaving a hole to fill rather than a smear.

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

## 6. What is not built

- **Depth estimation.** A depth map must be supplied. `onnxruntime-web` is
  already a verified dependency, so a small monocular depth model is the
  natural next step.
- **Mesh tearing at depth edges**, and inpainting the hole behind (§3).
- **A `film.json` binding for photos.** `drawings` compile to paint nodes;
  there is no `photos` equivalent yet, so photo motion is currently driven
  through the API or the MCP ops rather than declaratively.
- **Video output from the ops.** `photo_render_sequence` writes numbered
  PNGs; turning those into a file is an `ffmpeg` call away but is not done
  here.
- **JPEG and WebP decoding** (§5).

---

## 7. Commands

```bash
npm run mcp:paint       # the MCP server, 20 tools, headless
npm run test:motion     # Ken Burns, parallax, wave, puppet, overscan
npm run test:ops        # the op surface and the PNG codec
npm run audit:tests     # mutation audit across everything
```
