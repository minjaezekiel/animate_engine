# 43 — What a DCC has that this does not

A feature-by-feature audit of this engine against a professional digital
content creation tool (Blender, taken as the reference), with an architecture
for the parts worth building and a statement of which parts are not.

Companion to [37-MISSING-TOOLS.md](37-MISSING-TOOLS.md), which audits the same
ground from the side of *what an animator reaches for*. This one audits from
the side of *what a DCC is made of*. Where they overlap, 37 is the older and
narrower list and this is the register; neither repeats the other's detail.

---

## 1. The category question, first

Blender is an **interactive modelling application**: a human drags vertices in
a viewport, and every subsystem exists to serve that loop. jireX is a
**declarative film compiler**: a film is JSON, frame *N* is a pure function of
*N*, and the whole pipeline runs headless so that an agent — or a script, or
CI — can produce a finished MP4 with no human in the loop.

That is not a smaller version of the same thing. It is a different machine,
and the difference decides which of the gaps below are worth closing:

| | Blender | jireX |
|---|---|---|
| authoring | direct manipulation | a declaration a program can write |
| state | a `.blend` the app owns | JSON in git, diffable |
| determinism | best effort | a contract, enforced by tests |
| the user | a trained artist at a workstation | a script, an agent, or an author typing numbers |
| the output | anything | a film |

**The honest consequence.** Half of Blender's surface — the knife tool,
proportional editing, the outliner, auto keying, pose mode — is *interface for
direct manipulation*. Building it would mean building a viewport application,
which is a different product and would not make a single film look better.
The other half — geometry operations, physics, procedural generation, light
transport, compositing — is **engine**, and every one of those is expressible
as data and is fair game.

So this document sorts the list into three, and only one of them becomes work:

- **Engine gap** — a capability a film needs that the engine cannot express.
  These are planned below.
- **Interface, deferred** — real, but it belongs to a viewport this product
  does not have. Recorded, not planned.
- **Category error** — it exists here in a different and better-suited form,
  usually because the declaration replaces the gesture.

---

## 2. The audit

Legend: **yes** · *partial* · **no** · — not applicable in a declarative tool.
Every "yes" names where it lives, so the claim can be checked.

### 2.1 Modelling and geometry

| Feature | State | Where / why |
|---|---|---|
| Primitive objects | **yes** | `GEOMETRY` in [SceneAdapter.js](../../src/backends/three3d/SceneAdapter.js): cube, sphere, cylinder, cone, torus, capsule, plane, ring, tetrahedron, lathe, extrude |
| Extrusion along a path | **yes** | `extrude` with `path`, Phase 39 |
| Lathe / revolve | **yes** | `lathe`, Phase 39 |
| Bevel | **yes** | every `cube` is a `RoundedBoxGeometry`, Phase 50 |
| Transform tools | **yes** | `at` / `rot` / `scale`, and every one of them is a timeline channel |
| Symmetry | *partial* | `face3d.js` and `generate.js` mirror procedurally; there is no mirror *modifier* |
| Vertex / edge / face editing | **no** | **Interface, deferred.** There is no viewport. The legacy editor had it; the new pipeline deliberately does not |
| Inset, knife, loop cut, bridge, merge | **no** | Interface, deferred — all four are gestures |
| Subdivision surface | **yes** | **Closed, Phase 61.** `subdivide: 2` on a geometry spec, Loop in pure `core/geom/subdivide.js`. A 12x8 sphere's sharpest crease: **29.45 -> 15.04 -> 7.57 -> 3.79** degrees |
| Boolean / CSG | **yes** | **Closed, Phase 58.** `{ kind: 'boolean', op, a, b }` -- subtract, union, intersect, in pure `core/geom/csg.js`, proved against analytic volume. See [13-3D-FILM.md § `boolean`](../13-3D-FILM.md) |
| Proportional editing | **no** | Category error: the declarative equivalent is a deform modifier or a lattice |
| Displacement | **yes** | **Closed, Phase 61**, and it was small: the slot had been wired since Phase 24 and no film had used it, because the default scale is 1 metre and a bare primitive has nothing to move. Both are diagnostics now. The earth film's limb: **36.5%** of its pixels changed against **2.3%** on the inner disc |

### 2.2 Sculpting

| Feature | State | Where / why |
|---|---|---|
| Brushes, masking, dyntopo, remesh, multires | **no** | **Interface, deferred.** Sculpting is the most gesture-bound subsystem there is. The legacy `animateEngine.js` had brushes; nothing in the new pipeline does, and a headless sculpt is not a thing |
| Procedural equivalents | *partial* | `humanoid3d.js`, `quadruped.js`, `face3d.js` generate bodies from parameters — which is how a program sculpts |

### 2.3 Objects, assets, reuse

| Feature | State | Where / why |
|---|---|---|
| Duplication, linked duplication, instances | **yes** | `cast` an `assembly` as many times as you like; the geometry is shared and `cloneModel` uses `SkeletonUtils.clone` so two characters from one file do not move as one |
| Collections / grouping | **yes** | assemblies, and `scenes` |
| Parenting, hierarchy | **yes** | the core `Scene` is a graph; `invalidate` walks it |
| Object constraints | **yes** | [constraints.js](../../src/core/rig/constraints.js), Phase 24 |
| Asset library, append, link | **yes** | Phase 45: import from a file or a URL, with licence provenance recorded |
| Outliner | — | the film *is* the outliner; `digest` reports what is on screen as numbers |
| Library overrides | *partial* | a cast entry overrides transform and materials, not arbitrary fields |
| Multi-scene projects | **yes** | `scenes[]` |

### 2.4 Animation

| Feature | State | Where / why |
|---|---|---|
| Timeline, keyframes, interpolation | **yes** | [Timeline.js](../../src/core/anim/Timeline.js), [Track.js](../../src/core/anim/Track.js) |
| Actions / reusable clips | **yes** | `clips` with `instances` |
| Non-linear animation (NLA) | **yes** | clip instances carry `start`, `speed`, `weight`, `blend: 'add'` and a channel `mask` — that *is* an NLA strip, in [Evaluator.js](../../src/core/anim/Evaluator.js) |
| Shape keys | **yes** | morph targets, driven by visemes and expressions |
| Constraints | **yes** | IK, aim, copy, limit |
| Animation baking | *partial* | cloth and fluid are solved per frame; physics is not baked to keys because [rigid bodies do not exist yet](37-MISSING-TOOLS.md) |
| Exposure sheets, holds on twos | **yes** | `sheets` and `step` — a drawn-animation idea Blender does not have |
| Dope sheet, graph editor | **no** | Interface, deferred. Priority 5 of 37; the tracks are already data, so it is a UI job |
| Auto keying | — | category error: there is no manipulation to key |
| Drivers | **no** | **Engine gap**, small and worth it: one property as a function of another. `constraints.js` is the nearest thing |
| Motion paths | *partial* | `echo.js` draws trailing ghosts; there is no editable path |

### 2.5 Rigging

| Feature | State | Where / why |
|---|---|---|
| Armatures, bones, hierarchy, FK | **yes** | [humanoid3d.js](../../src/core/art/humanoid3d.js), 20 bones per hand |
| Inverse kinematics | **yes** | Phase 24, two-bone and chain |
| Automatic weights | **yes** | generated rigs are skinned at build time |
| Weight painting | **no** | Interface, deferred |
| Bone constraints | **yes** | |
| Facial rigging | **yes** | visemes, expressions, morph matching |
| Retargeting | **yes** | Phase 45, onto a differently-named skeleton |

### 2.6 Materials and shading

| Feature | State | Where / why |
|---|---|---|
| PBR materials | **yes** | `MeshStandardMaterial` / `MeshPhysicalMaterial`, every parameter passthrough |
| Procedural textures | **yes** | [textures.js](../../src/core/art/textures.js), layered, pure, unit-tested |
| A material library | **yes** | Phase 53: `{ preset: 'wood' }` fills albedo, roughness and a derived normal |
| Normal / bump maps | **yes** | `normalFrom` derives the normal from the same height field as the albedo |
| Transparency, reflections, SSS | **yes** | `transmission`, `sheen`, IBL since Phase 49 |
| UV unwrapping | **no** | **Engine gap.** UVs are whatever the primitive generates, so a grain direction cannot be chosen per part. Box/triplanar projection as *data* is the declarative form |
| Texture painting, vertex painting | **no** | Interface, deferred (the 2D path has a full paint engine; the 3D path has no surface to paint on) |
| Shader node editor | **no** | Category error. The node graph is an interface; the data behind it is a layer stack, which [textures.js](../../src/core/art/textures.js) already is |
| Displacement | **no** | Engine gap, see 2.1 |

### 2.7 Lighting and camera

| Feature | State | Where / why |
|---|---|---|
| Point, sun, spot, ambient, hemisphere | **yes** | `makeLight` |
| Area lights | **no** | **Engine gap, next.** Soft shadows come from a light having size; PCF blur is a blur, not a penumbra. Tier 1.6 of [42-RENDER-QUALITY.md](42-RENDER-QUALITY.md) |
| HDRI / environment lighting | **yes** | Phase 49, defaulted |
| Shadows, softness | **yes** | PCF soft, fitted per scene in Phase 52 |
| Volumetric lighting | **yes** | **Phase 69** `meta.fog` (extinction), **Phase 70** `shaft` on a spot light (in-scattering), closed form rather than a march. Smoke and fire are the grid solver and still open |
| Global illumination | **no** | Tier 2 of 42 — the honest remainder of the gap to Blender |
| Perspective camera, focal length, DOF, tracking, animation, switching, motion blur | **yes** | shots carry cameras; `dof` is keyable since Phase 44; motion blur Phase 47 |
| Orthographic camera | **no** | Engine gap, trivial: one flag on the camera spec. Wanted by every technical/blueprint film |
| Multiple cameras | *partial* | one camera node, re-aimed per shot. A second named camera is not expressible |

### 2.8 Physics

| Feature | State | Where / why |
|---|---|---|
| Particles | **yes** | solved in closed form, not stepped — frame *N* stays pure |
| Cloth | **yes** | Phase 24 |
| Fluid | *partial* | a 2D grid solver painted onto a card, documented as "a card, honestly" |
| Collision detection | **yes** | colliders, Phase 45 |
| Gravity | **yes** | |
| Rigid bodies and constraints | **no** | **Engine gap, the largest.** Priority 6 of 37; needs its own doc before any code |
| Soft bodies | **no** | Engine gap, after rigid |
| Smoke, fire | **no** | Engine gap: both are the same grid solver, and neither is cheap. The shaft work took god rays off this line without one |
| Hair | **no** | Engine gap, low priority |
| Force fields | **no** | Engine gap, small: wind and turbulence as fields the particle solver reads |
| Dynamic paint | **no** | Not planned |

### 2.9 Procedural generation

| Feature | State | Where / why |
|---|---|---|
| Procedural geometry | *partial* | bodies, scenery, sets and brush sheets are generated by named functions |
| Procedural textures and materials | **yes** | Phases 39 and 53 |
| Scatter / instance on points | **yes** | **Closed, Phase 59.** `scatter: { geometry, on, count, seed }` -- Poisson-disc in pure `core/geom/scatter.js`, one `InstancedMesh`. 600 instances cost **one** draw call, measured. A multi-part assembly is still one primitive per scatter |
| Attribute manipulation, simulation zones | **no** | Not planned: these are node-graph concepts |
| A node editor | **no** | Category error, as above |

### 2.10 2D drawing and animation

| Feature | State | Where / why |
|---|---|---|
| Freehand drawing, strokes, brushes | **yes** | [paint/](../../src/core/paint/), [freehand](../../src/core/art/), Phase 16 |
| Frame-by-frame animation | **yes** | Phase 31, with smear and boil |
| Onion skinning | **yes** | [onionSkin.js](../../src/render/onionSkin.js) |
| Layers, fills | **yes** | `Document.js`, `Surface.js` |
| 2D rigging, interpolation | **yes** | the same Timeline as 3D |
| 2D inside a 3D scene | *partial* | the overlay composites 2D *over* 3D; a stroke cannot live *in* the 3D world |

### 2.11 Rendering

| Feature | State | Where / why |
|---|---|---|
| Real-time (raster) engine | **yes** | three.js, WebGL2 |
| GPU rendering, animation rendering, resolution, sampling | **yes** | Phase 48: `QUALITY=720p`, MSAA, bitrate from pixels |
| Path tracing | **no** | Tier 2 of 42 |
| Render passes / AOVs | **yes** | Phase 62: `AOV=depth,normal,object`. A cube 11.000 m away reads **10.999909 m**, one eighth of a code step |
| Render layers | **no** | Engine gap. The object pass is most of it: a matte per part is a layer you can pull |
| Denoising | **no** | Only matters with path tracing |
| Workbench / preview shading | *partial* | `PROBE=1` and `DIGEST=1` answer "what is in the frame" in numbers instead |

### 2.12 Compositing

| Feature | State | Where / why |
|---|---|---|
| Colour correction and grading | **yes** | the `grade` pass: exposure, contrast, saturation, temperature, lift/gamma/gain |
| Glow, blur, vignette, grain, chromatic aberration | **yes** | `bloom`, `dof`, `grade` |
| Keyable post | **yes** | Phase 44 |
| Lens distortion | **no** | Engine gap, trivial, in the `grade` shader |
| Masking, alpha, background replacement, pass combination | *partial* | Phase 62 shipped what all four waited on: the object pass is the matte, **63 mattes, 0 collisions** on the AK-47. Combining them is a compositor's job, and this engine is not one |
| Node-based compositing | **no** | Category error: `POST_ORDER` is the graph, as a list, because a linear chain is what a film needs |

### 2.13 Video and audio

| Feature | State | Where / why |
|---|---|---|
| Audio tracks, sync, mixing, ducking | **yes** | the offline mixer, Phase 46 |
| Narration / TTS, four engines | **yes** | and a content-addressed take cache |
| Transitions | **yes** | Phases 40 and 51 |
| Text overlays, subtitles | **yes** | |
| Export to MP4 / WebM | **yes** | own ISO-BMFF muxer, Phase 27 |
| Importing and cutting existing video | **no** | **Not planned.** This is an NLE, and `ffmpeg` is one sentence away. The engine's job ends at a correct file |
| Multiple video tracks | — | a film is one timeline by design |

### 2.14 Advanced

| Feature | State | Where / why |
|---|---|---|
| Scripting API | **yes** | the whole product is an API: `ops.js` generates 28 MCP tools from one table |
| Automation | **yes** | every film in this repo is generated by a script in `scripts/` |
| Import / export | *partial* | glTF and FBX **in**; nothing out but video. OBJ, STL and USD are unread |
| Mocap | **yes** | [12-MOCAP.md](../12-MOCAP.md) |
| Motion tracking, camera solving, video masking | **no** | Not planned: these consume live-action footage, which this engine does not take |
| Add-ons / plugins | **no** | **Engine gap**, deliberate for now: see §4.5 |
| 3D printing tools | — | not a film concern |

---

## 3. What this leaves: eleven engine gaps

Sorted by **look or capability per unit of work**, which is the same rule
[42-RENDER-QUALITY.md](42-RENDER-QUALITY.md) is sorted by. The first four are
small and unblock films that exist; the rest are subsystems.

| # | Gap | Size | Why it is where it is |
|---|---|---|---|
| 1 | **Area lights** | S | A light with size is the only source of a real penumbra. Already Tier 1.6 of 42 |
| 2 | ~~Orthographic camera~~ | **done, Phase 56** | `meta.ortho: 2.4`. Two identical cubes at different depths: near/far **2.39 -> 1.00** |
| 3 | ~~Drivers~~ | **done, Phase 56** | `expr` over channels and `t`, parsed not evaluated. Agrees with the hand-keyed version to 1e-9 over every frame; shared by both compilers |
| 4 | ~~UV projection~~ | **done, Phase 56** | `uv: { tile, angle }`. Two panels of one fabric: thread spacing **4.00x apart -> 1.04x**. Triplanar not built, and said why |
| 5 | ~~Boolean / CSG~~ | **done, Phase 58** | A 1x1 bar through a 2-cube leaves **6.000000** against an analytic 6, closure error **< 1e-5**, and the AK-47's receiver has an ejection port. Not Rust: 4.8 ms, once, at build time |
| 6 | ~~Subdivision + displacement~~ | **done, Phase 61** | Loop, not Catmull-Clark: a 12x8 sphere's crease goes **29.45 -> 3.79** degrees over three levels, and a linear split holds a unit cube at 1.000000. The earth film's limb: **36.5%** of pixels changed |
| 7 | ~~Scatter / instancing on points~~ | **done, Phase 59** | 600 grit instances on the AK-47's floor took the frame from **234 draw calls to 235**. Poisson-disc, seeded: closest pair **0.0742 m** against uniform random's 0.0095 m |
| 8 | ~~Rigid-body dynamics, baked to keys~~ | **Tier 1 done, Phase 60** | Eight cases land in the AK-47 film and rest at y **-1.5846** against an analytic -1.5843. Stacking needs box-box and is Tier 2 |
| 9 | ~~Render passes / AOVs~~ | **done, Phase 62** | `AOV=depth,normal,object`, decoded by pure arithmetic in `core/render/aov.js`. A cube at a known 11.000 m reads **10.999909 m**, against that frustum's own quantisation step of 7.2e-4 m. The depth pass opens WHITE and is correct; it is measured, not looked at |
| 10 | **Volumetrics** (smoke, fire, god rays) | L | **Tiers 1 and 2 done, Phases 69 and 70.** Extinction as `meta.fog`: five cards recover the declared density to **0.76%** with a **1.6%** spread across 5 m to 30 m, which is also the proof it is `FogExp2` and not Beer-Lambert, and it found fog mixing in DISPLAY space whenever no post pass was declared. In-scattering as `shaft` on a spot light, closed form: 47 measured pixels at a mean ratio of **0.9993** against the integral, spread **1.031**. Smoke and fire need the grid solver and are open |
| 11 | **Global illumination** | L | Tier 2 of 42; the honest remainder of the gap to Blender |

---

## 4. Architecture

The rules below are not new. Every one of them is already load-bearing
somewhere in this repo, and the point of writing them down is that each of the
eleven gaps above has to be built *inside* them rather than beside them.

### 4.1 The layering, and the one rule that keeps it

```
  src/core/        pure. numbers, tables, arithmetic. imports no THREE,
                   no DOM, no fs. unit-tested in Node.
  src/kernels/     hot loops. one JS implementation, one Rust/WASM,
                   one parallel; chosen at runtime, identical results.
  src/backends/    the only place that touches THREE or a 2D context.
  src/render/      sinks, muxers, composer, offline loop.
  scripts/         the headless harness: serve, open, render, write.
```

**Anything that is a number lives in `core/`.** It is why `motionBlur.js`
exists twice, why `post.js` is pure and `post3d.js` is not, and why a defect
like "the occlusion window was in metres" (Phase 51) is a unit test rather
than a render. Every new subsystem below splits the same way: the solver is
core, the upload is a backend.

### 4.2 Loose coupling: tables, not switches

Three mechanisms already in the tree, in increasing order of strength:

1. **A table generates the surface.** `ops.js` is one op table from which 28
   MCP tools are generated. Adding an op adds a tool. No second place to edit.
2. **Capabilities are injected, not imported.** `buildScene3D(THREE, ...)`,
   `buildComposer({ EffectComposer, ... })`, `geometries: { RoundedBoxGeometry }`.
   A caller that lacks a dependency gets a diagnostic and a working render
   without it, and `core/` stays importable in Node.
3. **The guard list.** `TEXTURE_SLOTS`, `COLOR_PROPS`, `POST_KEYABLE`,
   `LIGHT_TYPES`, `UV_PROJECTIONS`, `CSG_OPS` and — as of Phase 58 —
   `GEOMETRY_KINDS`: a named list of what may be set, so a typo is a
   diagnostic instead of a property nothing reads. This repo has shipped that
   exact bug four times (`normalScale`, `props.trim.offset`, `map:
   "albedo"`, a mistyped light type that lit the scene from a direction); the
   list is the fix. `GEOMETRY_KINDS` closed the fifth before it shipped: an
   unknown geometry kind made the backend skip the node **and everything
   parented to it**, with nothing said.

4. **The verb table.** `src/core/script/verbs.js`, shipped in **Phase 57**:
   the standing structural defect 37 opens with — two compilers sharing a
   vocabulary and not a table — closed by making the vocabulary *data*, with
   `paths` as the per-path capability flag. Every gap below that adds a verb
   adds **one row and one handler**, and a compiler that cannot honour a verb
   names the path it lives on and what to say here instead. A row with no
   handler, or a handler with no row, fails `test/core/verbs.test.mjs`. This
   was a precondition for items 3, 5 and 7 and is no longer in their way.

### 4.3 Performance: where the time actually goes

Measured, in this repo, not assumed:

- **Readback is the enemy.** Motion blur at 8 subframes cost **19.8x**, almost
  all of it `getImageData`. Supersampling costs its fill rate and nothing
  else, because the resolve stays on the GPU. *Rule: never move pixels to the
  CPU inside the frame loop.*
- **Per-frame allocation shows up at 2,880 frames.** The particle pool, the
  pose baseline and the composite canvas are all allocated once.
- **The hot loops are already a seam.** `src/kernels/` picks WASM, parallel
  WASM or JS at runtime and the three agree to the bit. Any solver below with
  an inner loop over vertices or voxels belongs there, written in Rust,
  with the JS kept as the reference implementation and the test oracle.
- **Instancing is the answer to count.** Done for static sets in Phase 59:
  `scatter` is one `InstancedMesh` and 600 instances cost one draw call.
  Particles are still pooled `Mesh`es, and the comment in `SceneAdapter`
  still says what to do when a film needs thousands of *those* -- the
  obstacle there is per-particle opacity, which an `InstancedMesh` cannot
  vary without an instanced attribute and a patched shader.
- **Budget, don't guess.** `budget.js` predicts per-frame cost and
  `preflight()` measures 48 frames before committing. New subsystems report
  into it or they are invisible until a 65-second render.

### 4.4 Scalability: the two axes that bite

**Scene size.** Everything today assumes a set that fits in one bounding
sphere: shadow cameras fit it (Phase 52), the digest walks every node, and
`samplePose` visits every track. The first of the three answers landed in
Phase 59 -- `InstancedMesh` for draw calls -- and it turned out to answer the
pose walk too, for free: a scatter is **one node with no tracks**, so
`samplePose` has nothing to visit and the digest has one entry, however many
instances are in it. What is left on this axis is shadow cascades, and the
scatter's own bounding sphere is what keeps a 600-instance set from being
culled as if it were the one stone at its origin.

**Film length.** 2,880 frames is two minutes; nothing retains a frame, which
is what makes that possible. A ten-minute film is 14,400 frames and the only
new cost is encode time — so the queue, resume and proxy work (priority 7 of
37) is the scaling story, not a rewrite.

### 4.5 Security, and why there is no plugin API yet

The engine runs untrusted input on purpose: a film can name a **URL** for a
model, an HDRI or a texture (Phase 45), and films themselves are JSON written
by agents.

- **No `eval`, no `Function`, no dynamic import of film-supplied paths.** A
  film is data. The moment a film can name code, the film is code, and every
  film in `git` becomes an executable. This is the reason a plugin API is
  listed as a gap and not as work: it needs a sandbox story first, and the
  only credible one here is **WASM with no imports**, which the kernels
  already demonstrate.
- **Asset provenance is recorded, not assumed.** The import path stores
  licence and source for every downloaded asset.
- **Fetches are explicit and logged.** Every network read a render performs is
  reported in the render log; a render with no network should prove it, which
  is what vendoring the voice models is for.
- **Nothing a film declares reaches a constructor unfiltered.** That is the
  guard-list rule in §4.2, and it is a correctness rule *and* a safety rule.
- **The take cache is content-addressed** (`sha256` of voice, text, delivery
  and language), so a poisoned entry cannot masquerade as another line.

### 4.6 Documentation and review, as a mechanism

Three rules this repo already runs on, restated because they are what keeps
a doc like this one true:

1. **A phase is not done until `STATUS.md` is updated in the same commit.**
2. **Every feature lands with a number that proves it**, not a screenshot:
   the intermediate-pixel fraction for anti-aliasing, the metal-to-dielectric
   ratio for the environment, specular ridges for the bevel, the caster-to-
   shadow gap for shadow fitting, 5x5 deviation for materials.
3. **A defect found while building becomes a written entry**, in
   [DEFECTS.md](DEFECTS.md), with how it was found. Three of the five Tier 1
   items so far were a *number in the wrong units* rather than a missing
   feature, and that pattern is only visible because each was written down.

---

## 5. How each gap is built

One paragraph each: where it lives, what shape it takes, and the number that
proves it. No code until its phase.

**1. Area lights.** `RectAreaLight` with `width`/`height` on the light spec.
Needs `RectAreaLightUniformsLib`, injected like every other addon. It does not
cast a shadow map in three, so the shadow comes from a paired directional
light or from the AO pass — which is the honest trade and must be documented
as one. *Proof:* penumbra width in pixels against the declared light size,
which is the check 42 already specifies.

**2. Orthographic camera.** `camera: { ortho: true, height: 2.4 }` on a shot.
`SceneAdapter` builds `OrthographicCamera`; everything downstream reads
`camera.isPerspectiveCamera` already because the shadow fit does.
*Proof:* two objects at different depths with the same world size measure the
same pixel size.

**3. Drivers.** A channel whose value is an expression over other channels,
evaluated in `Evaluator.js` after the base pass and before the additive one.
**Not `eval`:** a tiny arithmetic AST (`+ - * / min max clamp sin`) parsed in
`core/anim/driver.js`, which is also the only way it stays pure and testable.
*Proof:* a driven channel and a hand-keyed one agree to 1e-9 over 240 frames.

**4. UV projection.** A `uv: { projection: 'box' | 'triplanar', scale, angle }`
on a geometry or material spec. Box projection is arithmetic over positions
and normals — `core/geom/uv.js`, pure — applied to the `BufferGeometry` once
at build time. *Proof:* a wood grain's direction on a part rotated 90° in the
film is unchanged in the frame.

**5. Boolean / CSG.** **Shipped in Phase 58**, and the plan was half wrong
about how. The declaration is as written — `geometry: { kind: 'boolean', op:
'subtract', a, b }`, operands nesting because an operand is a geometry spec —
and so is the proof: volume equals the analytic answer for primitive operands
(**6.000000** against 6) and the result is closed (**< 1e-5**).

What the plan got wrong was the implementation. It called this the first real
candidate for Rust and specified a BVH-accelerated triangle-triangle
intersection with a JS oracle beside it. Measured first: a BSP over polygons,
in `core/geom/csg.js`, costs **4.8 ms** for a 24-sided cutter through a box,
**once**, at build time, and the result's volume is identical whether the
operand carries 12 triangles or 1,728. Rust would turn a millisecond into a
tenth of one. The oracle is written; the kernel is not needed, and the
`ponytail:` note in that file names the ceiling (the JS stack, tens of
thousands of triangles) and the upgrade path for when something reaches it.

Input hashing was also skipped for the same reason: caching 5 ms is not worth
a cache. What the operation *does* cost is triangles -- a BSP splits every
face a cutter passes through, so four holes in a box is 2,212 triangles where
the box was 12 -- and that is the number a future phase will care about.

**6. Subdivision and displacement.** **Shipped in Phase 61**, in
`core/geom/subdivide.js`, pure and build-time as specified — with one
correction and one discovery.

The correction: **not Catmull-Clark**, which subdivides quads, where every
geometry this engine builds is triangles. Loop is the triangle-mesh
equivalent and was published for exactly that reason.

The discovery: `displacementMap` needed no wiring at all. It has been a
recognised texture slot since Phase 24 and no film had ever used it, which
here is a reliable sign that something does not work — and two things did
not. THREE's `displacementScale` defaults to 1, a metre of relief in a film
authored in metres; and a map moves only the vertices that exist, so on a
twelve-triangle box it moves eight corners in silence. Both are diagnostics
now, and the second names `subdivide` as its remedy. Same shape as `ssao`
(Phase 51) and `envMapIntensity` (Phase 49).

*Proof:* the 4^n rule holds exactly, and the better half of that test is the
**volume** — a linear split leaves a unit cube at 1.000000 at every level,
which is what says the shape did not change before the height field was
applied. The limit-surface claim was replaced by a measurement that means
something on a silhouette: the sharpest crease between adjacent faces on a
12 x 8 sphere, **29.45 -> 15.04 -> 7.57 -> 3.79** degrees over three levels.
And in the earth film, **36.5%** of the limb's pixels changed against 2.3% on
the inner disc.

Not a kernel, for the third time: a 12 x 8 sphere to level 3 is 62 ms, once.

**7. Scatter.** **Shipped in Phase 59**, as specified: Poisson-disc in pure,
seeded `core/geom/scatter.js`, uploaded as one `InstancedMesh`, with the same
seed giving the same positions on every machine. *Proof, measured:* 600
instances took the AK-47 frame from **234 draw calls to 235**, and the
closest pair of 400 points in 4 m² is **0.0742 m** — the Poisson radius to
three decimals — against uniform random's 0.0095 m.

Two departures from the plan. `of: 'tree'` is `geometry:` — one primitive, so
one InstancedMesh; a multi-part assembly needs one per part plus a shared
transform, and nothing has needed it. And the cost was not measured against
`budget.js`, which models the 2D path only (photo warps and brush dabs); the
number that matters here is `renderer.info.render.calls`, so `film3d.html`
now reports it on the first frame of every render. The first version of that
line read the counters **after** the composer, which resets them per
`renderer.render` — so it reported "1 calls, 1 triangles", which is the final
full-screen quad.

**8. Rigid bodies.** The doc came first, as this item demanded —
[44-RIGID-BODIES.md](44-RIGID-BODIES.md) — and **Tier 1 shipped in Phase
60**. The shape is the one predicted: simulate once, bake to keys, so the
timeline stays the single source of truth and frame *N* stays pure. The output
is a `position` track and a `quaternion` track rather than a `clip`, which is
the same claim in a simpler form: there is nothing to instance, so there is
no instance.

Not a Rust kernel, and for the second time: the bake is 222 ms for the whole
AK-47 film including eight bodies at a 0.8 ms substep. The CSG lesson again.

*Proof,* as specified: the energy loss under a fixed step is 0.84% a bounce at
4 ms, 0.40% at 1 ms and 0.11% at 0.25 ms — first order, which is what
distinguishes discretisation from a leak — and two bakes of one film are
identical to the last digit. Three more were added, because each fails for a
different reason: the *e²* law (the impulse), angular momentum over 10,000
steps (the rotational integrator, which drifts silently), and a settled box's
penetration (Baumgarte and sleeping together).

What is **not** in Tier 1, with the reason stated rather than forgotten: box
against box, which needs a contact manifold and is most of a physics engine,
and therefore stacking; and joints, which are a second system beside the
`constraints` that already exist.

**9. Render passes. Done, Phase 62.** Built as planned, with three
corrections the plan could not have known. The passes do NOT go through
`EffectComposer`: they render into their own `samples: 0` target, because the
page's renderer is antialiased and an antialiased matte is a **wrong** matte
-- a blended edge pixel is a third id belonging to nobody. Tone mapping and
`outputColorSpace` come off around them, because both exist to make light
right and a pass writes data. And the deliverable is not the PNG but the
**decode**: `core/render/aov.js` is pure, unit-tested, and is what the pixel
probe measures the renderer with. *Proof, as specified:* a test cube at a
known 11.000 m reads **10.999909 m**, an error of 9.1e-5 m against
`depthQuantum`'s 7.2e-4 m -- one eighth of a quantisation step. Single times
rather than sequences, marked `ponytail:` with the upgrade named.

**10. Volumetrics.** Two halves, and only one of them is expensive.

**Extinction** -- light leaving the ray -- is already in every lit material's
fragment shader and costs nothing. It shipped as `meta.fog` in Phase 69, with
the authoring (`visibility`, a distance, not a density), the arithmetic, and
the diagnostics for fog that cannot be seen. *Proof, as specified:* five
cards at known axial depths recover the declared density 0.039558 as
**0.039857**, with a **1.6%** spread from 5 m to 30 m -- and the spread is
the claim, because a density that drifts with depth means the model and the
renderer disagree about the shape of the curve. It also found that THREE
includes `fog_fragment` after `tonemapping_fragment`, so fog mixed in
**display space** on the direct-to-canvas path and in linear light through a
composer: the same declared fog meant two images depending on whether an
unrelated `bloom` was declared.

**In-scattering** -- light arriving from the medium itself -- shipped for the
cone case in Phase 70 as `shaft` on a spot light, and it wanted no solver and
no march either. With a uniform medium inside a cone the integral along a
view ray is closed form: `integral dt/r^2 = (1/h)*[atan((t-tc)/h)]`, one atan
per endpoint, so the cone mesh is only a rasteriser and nothing is read off
its surface. *Proof, as specified:* 47 pixels of a rendered scanline against
`inscatter`, mean ratio **0.9993**, worst **1.0159**, spread **1.031** across
a x9.9 brightness range, with zero lit pixels behind the lamp (the double
cone's mirror sheet) and zero outside it. It also found that `modelMatrix` is
injected into the VERTEX prefix only: naming it in a fragment shader fails to
compile, and three reports that as `VALIDATE_STATUS false` while the frame
renders without the mesh and without a page error.

**Smoke and fire** are what is left, and they are the grid solver (a kernel)
feeding a 3D texture. They should not start until the "solve offline, consume
per frame" machinery of 8 is reused rather than rebuilt.

**11. Global illumination.** Tier 2 of 42, unchanged: SH irradiance from the
environment first (nearly free), baked irradiance probes second (the right
answer for a static set with moving characters), a path-traced `master` tier
last. Nothing here is a real-time technique, and this renderer should stop
pretending it is one.

---

## 6. Order

Interleaved with [42-RENDER-QUALITY.md](42-RENDER-QUALITY.md), because that
document is already the look-per-unit-of-work queue and these are the same
kind of items.

| Phase | Work | Rationale |
|---|---|---|
| ~~next~~ | ~~Area lights~~ (42 Tier 1.6) | **done, Phase 55** |
| ~~then~~ | ~~Orthographic camera + drivers + UV projection~~ | **done, Phase 56** |
| ~~then~~ | ~~**The shared verb table**~~ (37 priority 4) | **done, Phase 57** — and it closed two gaps that were a call nobody had made: `show`/`hide` in 3D, `sound` in 2D |
| ~~then~~ | ~~**Boolean / CSG**~~ | **done, Phase 58** — and it did not need Rust: 4.8 ms, once, at build time. It also turned up the missing `GEOMETRY_KINDS` guard list |
| ~~then~~ | ~~**Scatter + instancing**~~ | **done, Phase 59** — 600 instances, one draw call, and the AK-47's floor is no longer bare |
| ~~then~~ | ~~**Rigid bodies**~~ (37 priority 6) | **Tier 1 done, Phase 60** — the doc came first, as both registers demanded |
| ~~then~~ | ~~**Subdivision + displacement**~~ | **done, Phase 61** — and displacement needed no wiring, only two diagnostics |
| ~~then~~ | ~~**Render passes / AOVs**~~ | **done, Phase 62** -- and it found that three's depth packing puts the coarsest bits in red, which read the other way is a plausible depth map of nothing |
| ~~then~~ | ~~**Volumetrics, Tier 1**~~ (extinction) | **done, Phase 69** -- and it found fog mixing in display space on the no-post path, which made one declared fog mean two images |
| ~~then~~ | ~~**Volumetrics, Tier 2**~~ (in-scattering) | **done, Phase 70** -- and it needed no march either: the cone integral is closed form, so the mesh is only a rasteriser |
| next | **Global illumination** | SH irradiance, then baked probes, then a path-traced `master` tier |
| later | volumetrics Tier 3 (smoke, fire) | the grid solver, and the only item here that actually needs one |

**Not planned, and the reason stated once:** a mesh-editing viewport,
sculpting, weight painting, a node editor, video editing, motion tracking and
3D printing. Six of those are interfaces for a direct-manipulation product
this is not; the last two consume inputs this engine does not take. If the
product ever grows a viewport — React and Tailwind are already the stated
direction — this section is where to start arguing about it, and the honest
first question will be whether a film is better for it.
