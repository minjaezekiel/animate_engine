# Phase 45 — an imported asset arrives ready to animate

**Done.** Asked for directly: *"there should be a way to import already made
2D or 3D assets... that way it becomes easier to create high quality
animations"*, with the job that remains being *"adding physics, rigging,
lipsync and a few more other features."*

That last clause was the specification, and it is what this phase built. The
download was never the hard part.

## First, a correction to the audit

Writing `docs/pending/40-ASSET-IMPORT.md` required actually checking, and two
of the claims in the brief that prompted it were wrong. Recording that
properly, because both would have led to rebuilding something that works:

**"No morph targets — `grep -i morphTarget` returns nothing."** The grep was
run against `src/` and missed two things. `PoseApplier.js` has handled
`morph.<name>` and `morphIndex.<i>` channels all along, and `humanoid3d.js`'s
`applyLipsync` has driven 3D faces from the viseme track since the humanoid
phase. So **3D lipsync existed.**

**And it was closer to working on imported heads than anyone thought**, because
`VISEME_SHAPES` in `face3d.js` names *ARKit* blendshapes deliberately —
`jawOpen`, `mouthFunnel`, `mouthPucker`, `mouthStretchLeft`. An imported head
that also uses ARKit names would have found them.

Two real things stopped any other head working:

1. **The node name.** The channel target was hardcoded to `<speaker>/face` and
   the jaw to `<speaker>/jaw` — the names the *procedural* rig builds. An
   imported mesh is called `Wolf3D_Head` or `CC_Base_Body` or whatever its
   author typed, so every key landed on a node that does not exist. And an
   unresolved target is *skipped rather than reported*, so nothing moved and
   nothing said so.
2. **The other conventions.** Oculus (`viseme_aa`), Character Creator
   (`Mouth_Open`) and hand-modelled (`mouthOpen`) heads name the same shapes
   differently, and no amount of ARKit naming finds them.

So the gap was narrower and more specific than "no morph targets", and the fix
is a bridge rather than a feature.

## What was built

### Geometry facts without a renderer — `src/core/io/gltfGeometry.js`

`gltf.js` stated its own ceiling: *"this reads the manifest, not the geometry.
It will not tell you a mesh's triangle count ... or evaluate a node's world
transform through its parents."* That ceiling is now lifted, and the trick is
that most of it never needed lifting: **glTF requires `min`/`max` on any
accessor used for POSITION**, so a model's bounding box is in its own metadata
and no vertex has to be read to find it.

- `readAccessor` — honours `byteStride`, because an interleaved buffer is the
  normal output of any exporter that cares about load time, and reading one as
  tightly packed gives numbers that look like geometry and are not. A sparse
  accessor **throws** rather than silently returning base values and losing
  the overrides.
- `meshInstances` — world transforms through the node tree, iteratively with a
  visited set, because a malformed file *can* contain a cycle and a recursive
  walk over one is a stack overflow rather than a diagnostic.
- `modelBounds` — transforms **all eight** corners, not two. Under rotation
  the min and max of two corners gives a box that can be *smaller* than the
  geometry inside it, which is the worst direction for an error that goes on
  to decide a collider.
- `meshStats` — honours `mode`, so a triangle **strip** is counted as `n-2`
  rather than `n/3` (defaulting everything to `count/3` overstates a strip
  threefold), and reports `trianglesDrawn` separately from `triangles`: a
  500-triangle bolt used 4,000 times is 2M triangles in the frame and 500 in
  the file, and reporting only the file's number is how a scene that cannot be
  rendered at all looks lightweight.
- `morphTargets` — count and names separately, because a mesh with eight
  unnamed targets is riggable by index and one with eight named ones is
  riggable by meaning.

### Scale and orientation advice — `src/core/io/normalizeAsset.js`

The gap that costs the most minutes. A model arrives in centimetres and Z-up
from a CAD source, metres and Y-up from a game source, and being 100× wrong is
routine. The engine takes it literally, so an author bisects `scale` against a
render loop.

It **recommends** rather than applies, and that is the design: a unit
inference is a heuristic over a bounding box and it will be wrong for a
cathedral and for a screw. Applied silently the failure is a film that looks
subtly wrong for a reason nobody can find; as a recommendation the failure is
a number overridden in one line.

`guessUpAxis` returns `confidence: 'none'` for a near-cubic model rather than
picking Y and being right 60% of the time — the other 40% is a model lying on
its face, obvious in a render and baffling in a diff. `guessUnits` scores in
log space so 10× too big and 10× too small rank equally, and measures on the
axis the up-guess chose, because 1.7m is a claim about a person's *height*.
`recommendImport` also returns a ground offset, because an imported model's
origin is commonly the centre of its box, so half of it is underground.

### Colliders — `src/core/sim/colliders.js`

`grep -i 'collider\|hull\|convex'` across `src/` returned **nothing**. A mesh
could not become a rigid body without an author writing a primitive by hand
and hand-matching it to geometry only visible in a render.

Box, enclosing sphere (Ritter's, O(n), asserted to **enclose** every vertex —
too big makes contact early, too small lets geometry pass through), and a
convex hull by incremental insertion. `colliderFor` picks one and says why: a
hull filling 100% of its bounding box *is* a box and a box test is cheaper; a
near-cubic hull filling most of its enclosing sphere is a ball.

The part that matters more than the choice is the **concavity warning**, and
getting it right took two attempts:

- Hull volume over *bounding box* volume does not work, and the tests caught
  it: a solid cylinder fills π/4 = 79% of its box and so does a hollow pipe.
- Hull volume over the **mesh's own volume** does — that ratio is `solidity`,
  and it needs the index buffer, so `meshVolume` computes it by the divergence
  theorem. Under 50% means concave, and a convex hull of a concave shape fills
  the hollow: nothing can ever get inside it. That is the bug that reads as
  *"my character cannot walk into the room"* and is traced to a solver working
  perfectly.

Without an index buffer the warning is hedged and says so, because the weak
box signal flags a perfectly convex sphere at 52%. Crying concave at every
sphere would train an author to ignore the warning, which costs more than not
having it.

### Lipsync on any imported head — `src/core/art/visemeMorphs.js`

A name table, because **there is no standard** and there never will be. The
same mouth shape is `viseme_aa` to Oculus, `jawOpen`+`mouthFunnel` to ARKit,
`Mouth_Open` to Character Creator. Matching is case- and
separator-insensitive, so `Mouth_Open`, `mouth-open` and `mouthopen` are one
shape.

Several conventions describe one of the engine's six visemes with a
**combination** — ARKit has no "round", it has `mouthFunnel` plus
`mouthPucker` — so entries carry weights, because a funnel at full strength
with a pucker at full strength is a fish. And a *partial* match is rejected
outright: half of a two-target combination is a different expression, not a
weaker one.

Candidate ORDER is preference, and the first version got it wrong in a way the
tests caught: `mouthPucker` alone was listed above `mouthFunnel +
mouthPucker`, so an ARKit head resolved "round" to a bare pucker. **A pucker
on its own is a kiss.** A funnel opening behind it is an "oo".

`matchVisemeMorphs` *reports*: "this head has 52 morph targets and none of
them is a mouth shape I recognise" is a useful sentence and silence is not.
Three shapes is `usable`, which is the same judgement `VISEME_FALLBACK`
already makes for 2D characters.

`visemeMorphTracks` writes the channels with a short **ramp in** rather than a
step. The 2D path gets away with a discrete swap because a cutout mouth *is* a
swap — there is no in-between drawing to miss. A mesh has one, so a weight
snapping 0→1 pops. 40ms is about a frame at 24fps: enough to stop the pop,
short enough not to smear consecutive visemes together. Only the previous
`blend` seconds are in transition, not the whole gap, or consecutive visemes
read as a crossfade rather than as a mouth.

A film declares which mesh is the face, because a model commonly has a head, a
set of teeth and a tongue all carrying morph targets, and picking the one with
the most would be right often enough to be trusted and wrong often enough to
waste an afternoon. The *names* are discovered by the page, which is the only
place that has the loaded model.

```json
"models": { "host": { "src": "assets/head.glb",
                      "face": { "node": "Wolf3D_Head", "jaw": "Bone_Jaw" } } }
```

An unusable mapping **falls back to the procedural path** rather than going
silent: the engine's own shapes are still the better of two bad options.

### The library and the licence — `src/core/io/assetManifest.js`

Content-addressed by the hash of the bytes, exactly as a voice take is keyed
by what was said. Re-importing a file you already hold is a no-op, two names
for one file resolve to one entry, and a file that changed under you is a
different asset rather than a mystery.

**The licence field is the point, not metadata.** `addAsset` refuses an entry
without one, because an animation built on an asset whose licence was never
recorded is not shippable and that is discovered at the *end*, after the work.
`"unknown"` is accepted when stated deliberately — refusing it would push
people to write "CC0" and move on, which is worse — but it blocks a release.

`credits` returns a `complete` boolean to gate a release on, and **never
silently omits what it could not determine**: an asset under CC-BY with no
author is still listed, and the list is marked incomplete. Noncommercial and
share-alike terms come back as flags, because they constrain what the finished
work can be rather than blocking it.

An ambiguous id prefix is an **error**, not a first match: the alternative is
a command that works until two assets share four characters and then quietly
operates on the wrong one.

### The CLI and the MCP tools

```
npm run asset inspect <file|url> [--as human|building] [--height 1.8]
npm run asset import  <file|url> --licence CC0-1.0 [--author x]
npm run asset list
npm run asset credits [film.json]
npm run asset audit
```

And four MCP tools — `inspect_asset`, `import_asset`, `list_assets`,
`asset_credits` — taking the server from 18 to 22. All eighteen were render,
check, digest and voice, so an agent could author a film referencing an asset
and could not discover, inspect, measure or clear one.

`import` is the only place the network is allowed to happen, for the reason
`takeCache.js` argues at length: a render that can make a network request is a
render that is not reproducible.

## Proven on real files

Against the Khronos sample models, over the network, no browser:

```
RiggedFigure.glb       256 triangles, 1 skin, 22 of 22 addressable nodes
                       bounds 1.179 x 1.450 x 0.326
                       metres inferred (confidence high), import {"scale":1,"at":[0,0,0]}
AnimatedMorphCube.glb  "1 mesh has morph targets but none is named, so they
                        can only be driven by index"
BoxAnimated.glb        "addressable nodes: 0 of 4 (the rest are unnamed and
                        cannot be animated part by part)"
                       import {"scale":1,"at":[0,0.5,0]}  ← lifted onto the floor
```

That last line is the whole argument for the phase: the model's origin is its
centre, so half of it was underground, and the offset that fixes it is
arithmetic nobody should do by hand.

An import without `--licence` is refused with the reason.

## Numbers

| | Before | After |
|---|---|---|
| Collider generation | none at all | box, sphere, convex hull, with a concavity measure |
| Lipsyncable head conventions | ARKit only, and only on the procedural node | ARKit, Oculus, CC, generic, plus author overrides |
| Asset inspection without a browser | container table of contents | + triangles, bounds, instancing, morphs, scale advice |
| Scale/up-axis normalisation | none | recommended, with confidence and reasoning |
| Licence tracking | none | required, auditable, release-gating |
| MCP tools | 18 | **22** |
| Unit tests | 1,071 | **1,165** |

## Files

- `src/core/io/gltfGeometry.js`, `src/core/io/normalizeAsset.js`,
  `src/core/io/assetManifest.js`, `src/core/sim/colliders.js`,
  `src/core/art/visemeMorphs.js` — all new, all pure, all tested in Node.
- `src/core/art/humanoid3d.js` — `applyLipsync` takes `faces`.
- `src/core/script/compile3d.js` — `models[id].face`, exported as
  `compiled.faces`.
- `film3d.html` — resolves declared faces against the loaded model's real
  morph names and reports what it found.
- `mcp/server.js` — four asset tools; `runScript` now takes `args`.
- `scripts/asset.mjs`, `assets/manifest.json`, `assets/.gitignore`.
- `test/core/{colliders,gltf-geometry,asset-manifest,viseme-morphs}.test.mjs`
  — 94 tests. Fixtures are **built**, not downloaded: a test that needs a
  40 MB model from a CDN is a test that fails on a train.

## Still open

Trimmed back into [../pending/40-ASSET-IMPORT.md](../pending/40-ASSET-IMPORT.md):

- **Source catalogues.** `import <url>` works, so downloading from an online
  source works; what does not exist is *searching* Poly Haven, Kenney,
  Quaternius or Sketchfab from here. The licence plumbing that makes that
  safe is now in place, which was the hard half.
- **SVG and sprite-sheet import** for the 2D side, which still ends in
  `createImageBitmap` and is therefore raster-only.
- **Retarget diagnostics** — `humanoid3d.js` knows Mixamo bone names, and a
  retarget that fails does not report which bones it expected and which it
  found.
