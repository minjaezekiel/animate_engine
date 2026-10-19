# Bring your own assets

Two routes in, one for each path, both usable by a person at a browser and by
an agent with no browser at all.

* **2D** — upload a drawing of a character and get a rigged cutout that walks.
* **3D** — import a model or an environment from Blender, Mixamo or an asset
  site and animate it.

Neither needs a new renderer. The 2D rig is image crops of one upload, which
the engine has drawn since Phase 8; the 3D import is a THREE object graph,
which the backend has instantiated since Phase 3. What was missing in both
cases was the step in the middle, and that is all this adds.

---

## 1. Tracing a 2D character

```
npm run mcp:paint          # the headless op surface
```
```jsonc
{ "op": "trace_character",
  "args": { "source": "art/hero.png", "asset": "hero", "name": "hero",
            "out": "art/hero-cut.png", "film": "films/hero.json" } }
```

or, in `film.html`, **Trace a character from an image**.

Either way the result is a `jirex.film/1` character whose parts are crops of
the uploaded image with a pivot at each joint.

### Why it does not vectorise

"Trace" usually means "turn into paths". This does not, and the reason is
that for a character it would be worse: a traced path of a painted figure
loses the painting. Spine, Live2D and every image-based cutout tool cut the
artwork into parts and pivot them, and the engine already draws exactly that
— `{ kind: 'image', sx, sy, sw, sh }` is a sprite-atlas crop, so every part is
the SAME upload at a different source rectangle and there is no new rendering
code at all.

The silhouette *is* traced, by a boundary walk and Douglas–Peucker, and comes
back as SVG path data. Nothing in the rig needs it; it is there because a
stylised outline sometimes does.

### What it reads, and how

No segmentation model, no pose estimator, no new dependency. Four passes of
arithmetic over the pixels:

| Pass | What it does |
|---|---|
| **Matte** | Floods inward from the four corners, clearing anything close to a corner's colour. Flooding rather than thresholding is what keeps a white shirt: the shirt is not *connected* to the edge |
| **Holes** | Clears background the flood could not reach — the gap between two legs, closed at the bottom by the shoes. Only regions that match a corner colour AND are small next to the figure, so a shirt is still safe |
| **Landmarks** | The neck is a **dip** in the width profile and the shoulders are the rise out of it; the crotch is where the figure stops being two legs; the hips are the last solid row above it |
| **Seams** | Arms touching the torso leave no gap in the outline, so it looks for the colour change instead — a bare arm against a shirt has a seam even where the silhouette has none |

Everything it decides comes back in the result: every landmark, every box.
Any of them can be overridden with `regions` and the call repeated. That
escape hatch is the design, not a fallback: a person looking at the drawing,
or an agent that can see it, is a better detector than this will ever be.

### The naming is the integration

The parts come out called `hips`, `torso`, `head`, `armL`, `foreL`, `handL`,
`thighR` and so on — exactly what `generateCharacterParts` calls its own. So a
traced character gets `idle`, `breathe`, `walk` and `blink` free from
`generateActions`, and `reach`, `grip` and `pose` work on it unchanged. There
is no "traced character" code path anywhere downstream.

### The ceiling

- **One figure, standing, facing the camera.** A crossed arm, a three-quarter
  turn or two people in frame will need `regions`.
- **A figure in a one-colour costume** has arms the outline cannot find and
  the paint cannot either. It says so and carves a sleeve; `regions` fixes it.
- **A photograph against a busy background** is the case the matte is not for.
  Cut it out first and pass `matte: false`.
- **The crops are rectangles.** Parts overlap at the joints, which is what a
  cutout rig wants, but a limb drawn at a diagonal brings its neighbours'
  pixels with it. Transparent pixels from the matte hide most of that.

---

## 2. Importing a 3D model

```jsonc
{
  "models": {
    "chair": { "src": "assets/chair.glb" },
    "city":  { "src": "https://example.com/city.glb", "environment": true }
  },
  "cast": [
    { "model": "chair", "as": "chair", "at": [0, 0, 0], "rot": [0, 30, 0] },
    { "model": "chair", "as": "spare", "at": [1.2, 0, 0], "scale": [1, 1.6, 1] }
  ]
}
```

`.glb`, `.gltf` and `.fbx` load. A model cast twice is **cloned** through
`SkeletonUtils`, because `Object3D.clone` copies a skinned mesh and leaves it
bound to the original skeleton — two characters from one file would move as
one.

### Addressing what is inside it

Every named node is registered as `<cast id>/<node name>`, so a film reaches
into somebody else's model with the verbs it already has:

```jsonc
{ "do": "turn", "target": "chair/Seat", "to": [0, 45, 0], "for": 1.2 }
```

A model is **one node in the core scene** however many it contains: a
downloaded environment can carry thousands, and the core scene exists to be
walked and measured. The consequence is that the framing and exposure checks
measure the model's placement, not its individual parts.

### Playing the animations that came with it

```jsonc
{ "do": "play", "target": "robot", "action": "Walk", "at": 0, "for": 4 }
```

The page converts each `AnimationClip` into core tracks through
`clipToTracks` **before** the film is compiled, which is why the compiler can
tell you that there is no `Sprint` and that the file has `Idle` and `Walk` —
the one thing a caller cannot do is guess what a stranger called their walk
cycle. It also means imported animation is evaluated by the same code as
hand-keyed animation: it scrubs, layers, masks and renders deterministically,
and there is no `AnimationMixer` in the pipeline.

### Environments

```jsonc
"meta": { "environment": { "src": "assets/studio.hdr",
                           "background": true, "intensity": 1.2, "blur": 0.15 } }
```

An HDR panorama lights the scene through `scene.environment`. It is the
visible sky only if `background` is set, because most shots want the bounce
light off a panorama and their own backdrop behind it. `"environment":
"studio.hdr"` is the short form and means lighting only.

`meta.environment` had been parsed since Phase 14 and read by nothing, so a
film could declare one and render under its three point lights with no
diagnostic anywhere.

---

## 3. For an agent with no browser

Both halves are reachable headless, through the op table in
[`core/script/ops.js`](../src/core/script/ops.js).

| Op | What it is for |
|---|---|
| `trace_character` | Image in, rigged character out. Optionally writes the cut-out PNG and a ready-to-render film |
| `model_fetch` | Download a `.glb`, `.gltf`, `.fbx` or `.hdr` to a path, with a size cap, and report what is in it |
| `model_inspect` | Read a glTF's node names, animation names, meshes, materials and skins |

`model_inspect` parses the **container**, not the model: a `.gltf` is JSON and
a `.glb` is a twelve-byte header around that same JSON. Getting those names
the obvious way would mean standing up three.js, a DOM shim and a fetch
polyfill in Node to read a list of strings.

It also answers the two questions that otherwise show up as an empty render:

- a file requiring `KHR_draco_mesh_compression` (or meshopt, or KTX2) loads as
  an empty scene with no error unless the decoder is registered, and the
  engine does not ship one;
- a file whose nodes are all called `Object_12` can be placed and moved but
  cannot be animated part by part.

The loop an agent runs is: `model_fetch` → write a film around the names it
reports → `npm run produce:3d`. For 2D: `trace_character` → render.

### Ceiling

- `model_inspect` reads the manifest. It will not count triangles, decode a
  Draco buffer or evaluate a node's world transform through its parents.
- FBX can be imported by the browser page and **cannot** be inspected
  headless. Export `.glb` from Blender and both work.
- `model_fetch` is a plain HTTPS GET with a size cap. It does not resolve a
  `.gltf` that references external `.bin` and texture files — use `.glb`,
  which has them inside it.
