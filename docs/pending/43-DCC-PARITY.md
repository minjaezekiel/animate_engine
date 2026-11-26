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
| Subdivision surface | **no** | **Engine gap.** A modifier, not a gesture: `subdivide: 2` on a geometry spec is data |
| Boolean / CSG | **no** | **Engine gap.** The one modelling operation films keep asking for: a magwell, a window, a bolt hole. Named as missing in [13-3D-FILM.md §8](../13-3D-FILM.md) |
| Proportional editing | **no** | Category error: the declarative equivalent is a deform modifier or a lattice |
| Displacement | **no** | Engine gap, small: the height maps already exist (Phase 53) |

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
| Volumetric lighting | **no** | Engine gap, low priority: a god-ray is a shader, and `glow` is the precedent |
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
| Smoke, fire | **no** | Engine gap: both are the same volumetric solver, and neither is cheap |
| Hair | **no** | Engine gap, low priority |
| Force fields | **no** | Engine gap, small: wind and turbulence as fields the particle solver reads |
| Dynamic paint | **no** | Not planned |

### 2.9 Procedural generation

| Feature | State | Where / why |
|---|---|---|
| Procedural geometry | *partial* | bodies, scenery, sets and brush sheets are generated by named functions |
| Procedural textures and materials | **yes** | Phases 39 and 53 |
| Scatter / instance on points | **no** | **Engine gap.** The forest-of-a-thousand-trees case, and the one that most needs `InstancedMesh` |
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
| Render passes / AOVs | **no** | **Engine gap**, and the precondition for real compositing |
| Render layers | **no** | Engine gap, with passes |
| Denoising | **no** | Only matters with path tracing |
| Workbench / preview shading | *partial* | `PROBE=1` and `DIGEST=1` answer "what is in the frame" in numbers instead |

### 2.12 Compositing

| Feature | State | Where / why |
|---|---|---|
| Colour correction and grading | **yes** | the `grade` pass: exposure, contrast, saturation, temperature, lift/gamma/gain |
| Glow, blur, vignette, grain, chromatic aberration | **yes** | `bloom`, `dof`, `grade` |
| Keyable post | **yes** | Phase 44 |
| Lens distortion | **no** | Engine gap, trivial, in the `grade` shader |
| Masking, alpha, background replacement, pass combination | **no** | Engine gap, and all four want 2.11's passes first |
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
| 5 | **Boolean / CSG** | M | The one modelling operation films keep needing. A hole is not a gap between parts |
| 6 | **Subdivision + displacement** | M | Smooth organic form from coarse input, and the height maps already exist |
| 7 | **Scatter / instancing on points** | M | A thousand trees, one draw call. Needs `InstancedMesh` and a point generator |
| 8 | **Rigid-body dynamics, baked to keys** | L | The largest missing subsystem. Already priority 6 of 37 |
| 9 | **Render passes / AOVs** | M | The precondition for masking, pass recombination and any real compositing |
| 10 | **Volumetrics** (smoke, fire, god rays) | L | One solver, three products |
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
3. **The guard list.** `TEXTURE_SLOTS`, `COLOR_PROPS`, `POST_KEYABLE` — a
   named list of what may be set, so a typo is a diagnostic instead of a
   property nothing reads. This repo has shipped that exact bug three times
   (`normalScale`, `props.trim.offset`, `map: "albedo"`); the list is the fix.

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
- **Instancing is the answer to count.** Particles are pooled `Mesh`es today
  and the comment in `SceneAdapter` already says what to do when a film needs
  thousands: `InstancedMesh`. Item 7 forces it.
- **Budget, don't guess.** `budget.js` predicts per-frame cost and
  `preflight()` measures 48 frames before committing. New subsystems report
  into it or they are invisible until a 65-second render.

### 4.4 Scalability: the two axes that bite

**Scene size.** Everything today assumes a set that fits in one bounding
sphere: shadow cameras fit it (Phase 52), the digest walks every node, and
`samplePose` visits every track. At a thousand instanced trees, the pose walk
and the shadow fit both become the bottleneck. The answers, in order:
`InstancedMesh` for draw calls, a **static set** marked as not animated so the
pose walk skips it, and cascades for shadows.

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

**5. Boolean / CSG.** The first real candidate for Rust. Mesh booleans are
notoriously fragile on degenerate input, so: a BVH-accelerated
triangle-triangle intersection in `rust/jirex-kernels`, a JS reference
implementation kept as the oracle, and `geometry: { kind: 'boolean', op:
'subtract', a, b }` as the declaration. It runs **at build time**, not per
frame, and the result is cached by the hash of its inputs — the same
content-addressed trick as the take cache. *Proof:* volume and closedness —
the result is watertight, and its volume equals the analytic answer for
primitive operands.

**6. Subdivision and displacement.** Catmull-Clark in `core/geom/subdivide.js`
(pure, and the loop is a kernel candidate), and `displacementMap` wired
through to the existing height textures. Both are build-time.
*Proof:* a subdivided cube's vertex count follows the exact 4^n rule and its
limit surface stays within tolerance of a sphere of the same radius.

**7. Scatter.** `scatter: { on: 'ground', count: 1000, of: 'tree', seed }` —
points generated by a **pure, seeded** sampler (Poisson-disc in
`core/geom/scatter.js`, so frame *N* stays a function of *N*), uploaded as one
`InstancedMesh`. This is the item that forces instancing, and instancing is
the item that makes a forest possible at all. *Proof:* 1,000 instances in one
draw call, measured against `budget.js`, and the same seed gives the same
positions on every machine.

**8. Rigid bodies.** Its own doc before any code, as 37 already says. The
shape is fixed by this engine's contract: **simulate once, bake to keys**, so
the timeline stays the single source of truth and frame *N* stays pure. The
solver is a kernel (Rust, JS oracle); the output is a `clip`, indistinguishable
from a hand-authored one. *Proof:* energy drift under a fixed step, and a
golden bake that is byte-identical on re-run.

**9. Render passes.** `EffectComposer` already renders to targets;
`MeshNormalMaterial`/`MeshDepthMaterial` overrides already exist in GTAO. An
`aov: ['depth', 'normal', 'object']` on the render request writes extra PNG
sequences beside the video. *Proof:* a depth pass reconstructs the known
camera distance of a test object to within one quantisation step.

**10. Volumetrics.** One grid solver (a kernel) feeding a 3D texture and a
ray-marched shader; smoke, fire and god rays are three configurations of it.
Expensive, and it should not start until 8 is done, because they share the
"solve offline, consume per frame" machinery.

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
| then | **Boolean / CSG** | the one modelling operation films keep asking for; first real Rust kernel beyond images |
| then | **Scatter + instancing** | unblocks environments at scale and forces the draw-call fix |
| then | **Rigid bodies** (37 priority 6) | largest subsystem; needs its own doc first |
| later | subdivision + displacement, render passes, volumetrics, GI | each is a phase of its own |

**Not planned, and the reason stated once:** a mesh-editing viewport,
sculpting, weight painting, a node editor, video editing, motion tracking and
3D printing. Six of those are interfaces for a direct-manipulation product
this is not; the last two consume inputs this engine does not take. If the
product ever grows a viewport — React and Tailwind are already the stated
direction — this section is where to start arguing about it, and the honest
first question will be whether a film is better for it.
