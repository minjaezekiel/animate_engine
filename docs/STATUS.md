# Status — implemented vs not

**Rule: a phase is not done until this file is updated in the same commit.**

Last updated: 2026-10-09 (Phase 13: the motion system, built from the fight live test's findings; camera mocap scoped in [12-MOCAP.md](12-MOCAP.md), not built; Phase 14: the 3D film script, from the AK-47 live test).

Legend: **done** · *partial* · — not started

---

## Phase 0 — 2D film pipeline — **done**

| Area | State | Notes |
|---|---|---|
| `core/math` — mat2d, vec2 | **done** | Joint pivots verified: a point past the pivot swings, the pivot itself does not move. |
| `core/scene` — Node, Scene, Transform2D | **done** | Cached world matrices, cycle-safe reparenting, z-ordered draw, subtree removal. |
| `core/anim` — Track, Clip, Timeline, Evaluator | **done** | Sample-time interpolation (linear/step/hold/smooth/bezier), scoped+bounded clip instances, per-frame baseline reset. |
| `core/time` — FrameClock | **done** | `timeOf(2879) * 24 === 2879` exactly. |
| `core/audio` — cues, envelope, visemes, lipsync | **done** | Integer sample offsets; 6 visemes with a fallback chain; three lipsync tiers. |
| `core/voice` — registry + 4 providers | **done** | TTS (124 voices), upload, mic, generic HTTP. |
| `core/script` — schema, validate, compile | **done** | Derived duration, scene-scoped cast, crossfade as core tracks, diagnostics never throw. |
| `core/script/generate` — procedural humanoid | **done** | 19 parts, no orphans, 6-shape mouth, 4 cycles. |
| `core/script/screenplay` — text → film | **done** | Scene headings, speakers, parentheticals, action, continuation lines; grow-only retiming. |
| `backends/canvas2d` | **done** | Synchronous `renderFrame`; gradients; scenery; screen-space nodes; `RecordingContext` for Node tests. |
| `render/OfflineRenderer` + preflight | **done** | One loop; 2,880 frames in ~75 ms in Node against a null backend. |
| `render/sinks` — MediaRecorder (paced), WebCodecs, Memory | **done** | Paced sink measured correct; WebCodecs takes an injected muxer. |
| `audio/OfflineMixer` + wav | **done** | `OfflineAudioContext`, per-bus gain, fades, forced 48 kHz. |
| `studio.js` — orchestration | **done** | compile → voice → retime → mix → lipsync → render → encode. |
| `film.html` — studio UI | **done** | Load/author/cast/record/render/save; `window.jirex` for agents. |
| PWA — manifest, service worker, icons | **done** | Installable; two-cache strategy; icons generated with no dependencies. |
| Subtitles | **done** | Screen-space text node driven by a discrete track. |
| Demo film | **done** | `demo/film.json` — 4 scenes, 19 shots, 10 lines, exactly 120.0 s. |
| Tests — Node unit tests | **done** | anim, compile, audio/lipsync, scene/backend, rig/IK. 83 at the end of Phase 2. |
| Tests — e2e render + determinism | **done** | `test/e2e/render-film.mjs`: 2,880 frames, exact timestamps, draw-call determinism. |
| Tests — e2e A/V sync probe | **done** | `test/e2e/render-av.mjs`: muxed audio, click recovered at 0.007 s. |
| Docs | **done** | This directory. |

### Verified by measurement, not assumption

- MediaRecorder stamps wall-clock time: unpaced, 48 frames at 24 fps gave a
  **0.96 s** file instead of 2.00 s. Pacing is mandatory. See
  [04-RENDER-EXPORT.md](04-RENDER-EXPORT.md).
- Preflight on the demo film at 1280×720: **0.44 ms median / 1.09 ms p95** per
  frame against a 41.67 ms ceiling.
- Full 2,880-frame proxy render at 160×90: about **1 s** in Node against a
  recording context, 2,695 distinct frames, **126 draw calls per frame**.
  (Before group alpha was made to inherit, every scene in the film was drawn
  every frame; fixing that is what made a 120 s render tractable.)
- Determinism holds on the draw-call stream across repeated renders.
- A/V sync probe: a 1 kHz click planted at t=0 is recovered from the encoded
  file at **0.007 s**.

### The delivered film

`npm run produce` renders `demo/film.json` to `demo/out/the-keeper.webm`:

| | |
|---|---|
| duration | 120.000 s authored, **119.97 s** measured off the encoded file |
| frames | 2,880 at 24 fps |
| resolution | 1280×720 |
| codecs | VP9 video + Opus audio, muxed |
| voices | 2 characters, 10 lines, synthesized by in-browser Piper/VITS |
| lipsync | 354 viseme keys derived from the real audio |
| size | ~42 MB |
| render wall time | 120.5 s (paced, as expected) |
| diagnostics | none |

The file is not committed — it is gitignored and reproducible from source.

### Known limits in what shipped

- **Pixel output is not bit-reproducible** between runs. Chrome moves a canvas
  between GPU and CPU rasterization during frequent `getImageData`, which
  perturbs antialiasing. Scene state and draw calls are deterministic; tests
  assert that instead. `Canvas2DBackend.mount` takes `contextAttributes` so a
  readback-heavy caller can ask for `willReadFrequently` — it has to be set
  there, because a canvas returns the context it already has and ignores
  attributes on every later `getContext` call.
- **TTS needs an import map** for `onnxruntime-web`. Present in `film.html`;
  any other host page must supply it or TTS silently reports unavailable.
- **Voice models are 20–60 MB each** and download on first use. They cache in
  OPFS, so a fresh browser profile pays the cost again.
- **A paced render takes as long as the film** and needs the tab visible. The
  WebCodecs path removes both constraints but needs a muxer wired in.
- **A MediaRecorder WebM carries no Cues index, so it is not seekable.**
  Playback is fine and the duration is right, but `currentTime = t` silently
  does not move — a player scrubs badly, and anything verifying the file has to
  play it through rather than seek it. The WebCodecs path writes proper cues;
  this is the strongest practical argument for wiring a muxer in.
- **A finished film cannot be returned as a data URL.** Several megabytes of
  string do not survive the trip out of the page: it arrives truncated, with no
  error, and writes a file of a few bytes. `renderFilm` keeps the blob and
  callers pull it with `readFilmChunk`.
- ~~**No 2D editor UI.**~~ Shipped in Phase 2 as `studio.html`.
- ~~**No IK.**~~ Shipped in Phase 2 as `core/rig/IK2D.js` and the `reach` verb.
- **Image assets are declared but not loaded** by the studio UI; scenery is
  vector only. The compiler handles `background.image` when an asset is passed.
- Scenery `parallax` is accepted by the schema but not yet applied.

---

## Phase 0.5 — legacy data-loss guards — **done**

| Item | State |
|---|---|
| Guard `restoreAutosave` against non-round-trippable geometry | **done** — `exportScene` sets `lossy` when a mesh's geometry type is not one importScene can rebuild; autosave is then skipped with a console warning and the snapshot left in storage. Explicit Load Project is unaffected. |
| Mixers rebuilt so playback survives a load | **done** — `prepareActions` now iterates the animation's keyframes and creates mixers on demand, instead of iterating a `mixers` cache that only `addKeyframe` ever filled. `setCurrentTime` primes them too, so scrubbing works before Play is pressed. This fixes play, scrub and export in one place; Phase 3 still deletes `mixers` entirely. |

Verified by `npm run test:legacy` in headless Chrome: a sculpted mesh flags the
snapshot, and after a simulated reload a scrub at t=1s moves the object to its
midpoint.

---

## Phase 1 — build and CDN packaging — *partial*

| Item | State |
|---|---|
| `scripts/build.mjs` (esbuild) → `dist/` esm + iife + cjs + min | **done** — 58 KB minified for the studio, 39.5 KB for core alone, zero runtime dependencies |
| Fix `package.json` main/module/browser/exports/unpkg/jsdelivr | **done** — they pointed at a stale `animateEngine.min.js` that predated `RigManager` |
| Regenerate `animateEngine.min.js` | **done** — was 74,686 bytes and four features behind; now current |
| `prepublishOnly` so a stale build cannot ship again | **done** |
| `dist/` committed so a CDN serves from the GitHub tag | **done** — no npm publish needed |
| Bundle verified as a CDN consumer loads it | **done** — `npm run test:bundle` loads the script tag, the ESM bundle and the core bundle on a bare page and renders a frame |
| Move the 11 legacy classes into `src/legacy/*.js` | **skipped** — a large mechanical diff that Phase 3 immediately churns, since it deletes ~450 lines of that file. Do it with Phase 3, not before. |
| `createEngine()` factory | **skipped** — `AnimationEngine` is already exported and auto-init is already guarded by `#viewport`, so a factory adds a name and nothing else |
| Decouple DOM: 181 `getElementById` | **skipped** — pure refactor, no behaviour change. Do it when a second host page actually needs the editor UI. |
| Generate MCP zod schemas from a single op table | **skipped** — the op list is duplicated and has drifted, but the server works. Fix when an op is next added. |

---

## Phase 2 — 2D rig depth + authoring UI — *partial*

| Item | State |
|---|---|
| `core/rig/IK2D.js` — closed-form two-bone solve | **done** — law of cosines, both elbow solutions, exact on reachable targets |
| `core/rig/IK2D.js` — CCD for longer chains and rotation limits | **done** — seeded from the closed form; `min`/`max` per bone honoured |
| Degenerate cases return a pose, never `NaN` | **done** — out of range extends, inside the dead zone folds, a target on the root is finite. All four are unit-tested |
| `chainFromParts` / `chainRootOffset` — rig from the film schema | **done** — a child's `pivot` IS its parent's bone vector, so bone lengths and rest angles come straight off the parts list |
| `do: "reach"` verb | **done** — the author names a point, the compiler solves and keys the rotations. No runtime solver on the render path |
| `studio.html` — stage + scrub + direct manipulation | **done** — drag a joint, the editor solves IK and writes a real `reach` action back into the film |
| Onion skinning | **done** — past frames rendered offscreen and composited faint; the backend gets no editor mode |
| Squash and stretch | **done** — `sx`/`sy`/`skx` were already animatable channels; `do: "set"` reaches them. Nothing to build |
| Pose transitions | **done** — `for` on `pose` and `reach` ramps from whatever held before, which is the blending the plan asked for |
| Image assets in the editor UI | **skipped** — the compiler handles `background.image`; the UI still does not load them |
| Scenery parallax | **skipped** — accepted by the schema, still not applied |
| Weighted blending of two simultaneous poses | **skipped** — `for` covers pose-to-pose. Add when something actually needs two poses at once |
| Spectral viseme classification | **rejected, not deferred** — band energy cannot recover place of articulation, so /m/ /b/ /p/ /f/ /v/ would be misclassified. Wrong visemes flicker worse than fewer correct ones. The text+envelope tier stays the fallback |

### What the editor does

`studio.html` is a pose editor, not a second render harness. It stages; the
harness ships, and the two hand a film back and forth through `sessionStorage`.

- Every joint on stage is a handle. Dragging one runs IK and writes the result
  into the film script as a `reach` (or `move` for a whole body). **The edit is
  the script** — there is no editor-only state to lose.
- Arrow keys step a frame, shift-arrow steps twelve, space plays.
- Undo keeps 50 snapshots; the JSON panel is live and editable both ways.

### Verified by measurement

- `npm run test:studio` drives the real page: it loads the demo, clicks the
  left hand's handle, drags it, and asserts the hand lands **within 2.3 px of
  the cursor**, that a `reach` action appears in the film, that undo removes
  it, and that re-compiling from the saved JSON alone reproduces the pose with
  **0 px drift**.
- Preview costs about **1 ms/frame** scrubbing the 120 s demo.
- The residual 2.3 px is the documented IK ceiling, now quantified: reaches are
  solved against the chain's **rest pose**, so a `breathe` cycle scaling the
  torso moves the shoulder out from under the solve. Fixing it means sampling
  the live world matrix at solve time, which makes compilation order-dependent.
  Not worth it at 2 px.

## Phase 3 — 3D backend over the same core — **done**

| Item | State |
|---|---|
| Serialize with Three's own `toJSON` / `ObjectLoader` | **done** — geometry parameters, edited vertex buffers, materials, hierarchy, lights and every light subclass, with uuids preserved so keyframes survive |
| Old project files still open | **done** — a migration branch, which also repairs their light types on the way in |
| `PoseApplier` — a core Pose onto THREE objects | **done** — imports neither THREE nor the DOM, so it is unit-tested in Node |
| `legacyTracks` — editor keyframes → core tracks | **done** — Euler in, quaternion out, ease riding the key |
| `clipToTracks` / `clipToKeyframes` — glTF → core | **done** — imported animation becomes ordinary editable keyframes |
| Delete `mixers`, `tweens`, `animationClips`, `createAnimationClip`, `_vectorTrack`, `createTween`, `createTweenInstance`, `setCurve`, `getCurve` | **done** — ~450 lines |
| `Three3DBackend` | **done** — wraps SceneManager; `sync` has nothing to reconcile |
| `OfflineRenderer` takes a `poser` | **done** — the one loop now serves both backends |
| Frame-stepped WebM export for the 3D editor | **done** — replaces realtime `captureStream(30)` + a wall-clock stop |
| `PhysicsManager.stepTo` | **done** — fixed substeps, rewinds to a recorded rest state, capped catch-up |
| Delete the CSS transition path | **done** — deleted, not ported; the menu now says why |
| `captureFrames` memory (holds raw RGBA **and** PNG bytes per frame) | **done** — see Phase 5 |

### What the rewrite fixed as a consequence, not as feature work

- **`interp` works on rotation.** The old path built a `QuaternionKeyframeTrack`
  and never looked at `interp`, so step and bezier silently did nothing there.
- **Rotation takes the short way round *and* eases.** The mixer slerped but
  ignored the ease; densified Euler keys honoured the ease but travelled 340°
  to move 20°. Slerping with the ease on the key gets both.
- **Bezier is exact at any frame rate.** The old path densified at 30fps and
  rendered at 24.
- **Colour keyframes animate.** They were stored and read by nothing.
- **Scrubbing is a pure function of time**, so an export is reproducible.
- **The dead-mixer bug died by deletion.** There is no cache left that can be
  empty after a load, because the keyframes are the source.

### Three defects found by asserting rather than assuming

Each was silent — nothing in the page reported them. See
[DEFECTS.md](DEFECTS.md#defects-in-the-new-code).

- **cannon.js has never loaded.** `index.html` asked cdnjs for version 1.6.0,
  which does not exist. Every physics feature died on `CANNON is not defined`
  the moment anyone enabled it.
- **`toJSON` serializes `object.matrix`**, which Three only refreshes during a
  render — so an autosave firing on mutation could record a transform one
  frame stale.
- **`BufferGeometry.toJSON` discards edited vertices** on a parametric
  geometry, serializing its parameters instead. Sculpting a primitive and
  saving gave back a pristine primitive.

## Phase 4 — real 3D rigging and skinning — *partial*

| Item | State |
|---|---|
| Three r128 globals → **r169 ES modules** | **done** — an import map plus a shim that publishes a THREE global for the classic engine script |
| `FBXLoader` | **done** — routed by extension, as a module rather than a global with fflate alongside it |
| `GLTFExporter`, `SkeletonUtils` available | **done** — loaded through the same import map |
| Retargeting with a Mixamo name preset | **done** — `RigManager.retarget`, built on `SkeletonUtils.retargetClip` |
| Bone-name mapping | **done** — derived from the bones present (strip `mixamorig`, separators, case), not a fixed table that goes stale |
| Skinned meshes survive save/load | **done** — they did not; see below |
| 3D viseme lipsync via morph targets | **done** — `visemeMorphMap` + `keyVisemes`, driven by the same lipsync tracks the 2D mouths use |
| `SkinnedMesh` / `Skeleton` construction from scratch | **not done** — the engine binds and animates skinned meshes, but does not build one from an unrigged mesh |
| Auto-rig and skin weight painting | **skipped** — Mixamo gives you a rigged character, and auto-rigging an arbitrary mesh well is a research problem. A bad auto-rig is worse than none |
| Bone constraints (lookAt, limit-rotation, copy-rotation) | **not done** — `ikReach` (CCD) already exists |

### Why retargeting was the right rung

Three ships `SkeletonUtils.retargetClip`, which handles rest-pose compensation
and per-bone remapping. Writing one by hand is a bone-name map plus two
quaternion conversions that are easy to get subtly wrong. The work here was
the name map and finding the two skinned meshes.

One trap worth recording: `retargetClip`'s `names` option is keyed by the
**target** bone and yields the **source** bone — the opposite of the direction
that reads naturally — and gets it wrong by returning a clip with zero tracks
rather than by failing.

### A defect the rigging test found

**Skin weights and morph targets were dropped on save.** Same shape as the
sculpt bug from Phase 3: `BufferGeometry.toJSON` short-circuits on
`parameters` and writes only those, so any attribute added to a primitive —
`skinIndex`, `skinWeight`, morph attributes — vanished. A geometry carrying
attributes its parameters do not describe now stops claiming to be parametric
for the duration of the write.

### What the upgrade changed, measured

Three r155 made punctual lights physical, so a `PointLight` at intensity 1
renders barely above the background. The default is `4π` now, which is the
documented conversion. Default scene lights went from 0.5/0.8 to 1.0/1.8:
measured on the default cube (albedo luma 166), its brightest lit face reads
**134** against a background of **4**, where 0.5/0.8 gave 93 and 1.4/2.2 gave
150 and looked flat.

`npm run test:legacy` now asserts the viewport is lit relative to the scene
background, because nothing structural catches a lighting regression.

## Phase 5 — performance — *partial*

Everything here was measured before and after; the numbers are from
`npm run test:legacy`, which now asserts them.

| Item | State |
|---|---|
| GIF export streams | **done** — 12 s of raw frames → compressed bytes only |
| PNG-sequence export streams | **done** — PNGs must be held for the zip's central directory; the raw RGBA need not be, and both were |
| Gizmo built once, not per frame | **done** — `innerHTML=''` + 7 fresh `<div>`s + listeners at 60fps → **0.005 ms/frame** |
| Gizmo handles land on the object | **done** — they were positioned at an absolute viewport coordinate *inside* a container already at that coordinate, so every handle rendered at roughly double the offset |
| Position drags follow the cursor | **done** — ray-plane projection replaces screen pixels × 0.01 |
| Plane handles work at all | **done** — `xy`, `xz` and `yz` had no drag branch whatsoever |
| Sculpt smooth is no longer O(n²) | **done** — **~10,000 ms → 55 ms** over 9,216 vertices |
| Smooth radius scales with the mesh | **done** — a hardcoded 0.5 caught 1,355 "neighbours" per vertex on a dense mesh, so smooth averaged with a quarter of the model |
| History stops amplifying | **done** — a burst of 25 mutations takes **one** snapshot, not 25 |
| History as diffs | **skipped** — coalescing removed the amplification. Diffs would also remove the cost of the edits that *do* land (11 ms serialize + 13 ms localStorage at 9,216 vertices), but need a diff format for a Three JSON tree. Measure again before building one |
| Dirty-flag incremental `sync` | **skipped** — `Canvas2DBackend.sync` is already a no-op and the 2D render costs 0.4 ms/frame at 720p. Nothing to make incremental |
| On-demand render | **skipped** — the editor still renders at 60fps forever. Real, but it is a battery cost, not a correctness or capability one |
| OffscreenCanvas + worker | **skipped** — `MediaRecorderSink` needs the main thread anyway, and the 2D offline render is already ~1 ms/frame |

### Measured

| | before | after |
|---|---|---|
| gizmo, per frame | 7 DOM nodes + 7 listeners rebuilt | **0.005 ms**, reused |
| sculpt smooth, 9,216 verts | ~10,000 ms | **55 ms** (4 ms to index, 51 ms to query) |
| smooth neighbours per vertex | 1,355 | **57** |
| 25 mutations | 25 serialize + 25 localStorage writes | **1 of each** |
| GIF export, peak retained | every frame's RGBA + PNG | compressed GIF bytes only |

### One fix reverted by measurement

Flushing pending history on `visibilitychange`/`pagehide` looked obviously
right — don't lose the last edits to a closing tab. It measurably wedged page
teardown: headless Chrome would not close, because the handler serializes a few
hundred KB synchronously during unload. Dropped. The worst case is losing 350 ms
of autosave with the previous snapshot still in storage, which is a far better
trade than blocking a tab from closing.

## Phase 6 — modeling and material parity — *partial*

| Item | State |
|---|---|
| Parametric primitives | **done** — `createPrimitive(kind, name, props, dims, material)`; six near-identical builders became one data table |
| Resize in place | **done** — `resizePrimitive` rebuilds the geometry rather than scaling it, which is not the same thing: a scaled mesh sculpts and collides wrong |
| Dimensions reachable from the command API | **done** — `createObject` takes `dims` and `material`; a new `resize` op |
| Full PBR material properties | **done** — `setMaterialProperties`: metalness, roughness, emissive, emissiveIntensity, opacity, transparent, wireframe, flatShading, side, depthWrite, envMapIntensity. Colour had been the only one reachable |
| More post-FX | **not done** — `OutputPass` is loaded; only bloom is wired |
| Boolean modifiers | **skipped** — needs a CSG library, which is a dependency and a correctness surface of its own |
| Mirror / array modifiers | **not done** |
| Extrude / bevel / loop-cut | **not done** — real modelling tools, each a feature |

Opacity now implies `transparent` unless stated, because forgetting that is the
usual reason "opacity does nothing".

## Phase 8 — art assets and staging — **done**

The cheap half of [the art system](07-ART-SYSTEM.md). Design and remaining
phases are in that file; this is what shipped.

| Item | State |
|---|---|
| `AssetRegistry` + `Url`/`File` providers | **done** — the same seam as `VoiceRegistry`, so a picture's source is as interchangeable as a voice's |
| Images load end to end | **done** — nothing anywhere loaded one before; `produce.mjs` passed no assets at all, so a headless render could never show a background |
| One asset-id resolution point | **done** — background, scenery and character parts all go through `resolveImageProps` |
| Sprite-atlas sub-rects | **done** — `sx/sy/sw/sh` reach the 9-argument `drawImage`; it was 5-argument only |
| `fit: stretch \| contain \| cover` | **done** — backgrounds were hardcoded to frame size and stretched any art that was not 16:9 |
| Asset + background validation | **done** — `KNOWN.asset`, `KNOWN.background`, and `SHAPE_KINDS` wired up (it was dead code) |
| Scene `ground` declaration | **done** — `{y}` or a polyline |
| `do:'move'` derives y from the ground | **done** — `to: [700]` means "walk there and stay on the floor" |
| `measureCharacter` | **done** — a rig's AABB, stroke widths included |
| `analyseStaging` | **done** — off-frame cast, feet off the ground, reported in pixels |
| `checkFilm` op + `check_film` MCP tool | **done** — there was no way to validate without rendering |

### Why this phase existed

Measured, not assumed: `demo/mountain.json` is 6,118 bytes, about **1,650
tokens**, while the session that produced it cost ~57,000. The film script was
**3%** of the spend. The rest was re-reading engine source, four contact-sheet
images, and three rounds of visual iteration fixing staging the compiler
called clean.

`analyseStaging` reports all three of that session's bugs by name and in
pixels, without rendering a frame. A contact sheet cost ~2,500 tokens; this
costs ~200.

### Two defects it found immediately

- **A shot's camera `to` was silently deleted** whenever the next shot
  declared its own `from`. Both keys land on the same time and `key()`
  replaces rather than appends, so the whole preceding segment interpolated to
  the *next* shot's opening framing. In the shipped demo this flew the camera
  away from both characters for the last eight seconds of a scene. A cut now
  leaves that instant to the outgoing shot and opens half a frame later.
- **An unresolved asset id reached the backend as a string**, passed its
  truthiness check, and threw inside `ctx.drawImage`. Scenery spread `...shape`
  straight into props, so this was a trap rather than a gap.

### Known limits

- `sw.js` is cache-first for same-origin, so editing an image in place serves
  stale pixels until `VERSION` bumps. Content-hash asset URLs, or carve out a
  network-first rule, before shipping an asset directory people edit.
- `film.html` still has no image picker; the `FileProvider` exists and nothing
  calls it yet.
- Staging judges only the cast belonging to the shot's own scene. During a
  crossfade two scenes share one camera, and the incoming cast being outside
  the outgoing framing is a property of crossfades, not an error.

---

## Phase 9 — swap sets — **done**

Limited animation is "hold a drawing, swap it", and lipsync had already built
that: a dictionary of shapes on a node plus a discrete channel naming one.
Generalised rather than duplicated, so a head turn, an expression, a hand
shape and a sprite frame are the same mechanism as a mouth.

| Item | State |
|---|---|
| `applySwapSets` replaces `applyVisemeShapes` | **done** — keyed by channel name, so `props.view` drives the `view` set with no indirection |
| Stale props cleared between members | **done** — see below |
| Per-channel fallback orders | **done** — `SWAP_FALLBACK` for `viseme`, `view`, `eyes`; a front-only character faces front rather than vanishing |
| Several channels on one node | **done** |
| Image members (sprite atlas frames) | **done** — a frame is just a member with `sx/sw/sh` |
| `part.swap` in the film script | **done** |
| Multi-shape parts (`part.shapes`) | **done** — a part becomes a group of stacked layers |
| `visemeShapes` + `props.viseme` still work | **done** — it is what the lipsync compiler emits; read as the `viseme` set rather than migrated |
| An index of swap nodes instead of walking the scene | **skipped** — the walk is a few hundred nodes against a 0.4 ms/frame render. Measure before indexing |

### The footgun this closed

The old pass was a shallow additive copy that never deleted:

```js
for (const [k, v] of Object.entries(shape)) if (k !== 'kind') node.props[k] = v;
```

Swapping a `path` member for an `ellipse` one left a stale `d` on the node. It
was harmless only because every mouth member happened to be the same kind —
which stops being true the moment images and multi-kind views join in. Props a
swap wrote are now tracked and cleared; props the node owns are not touched.

### Why multi-shape parts matter

Cel art is three drawings per part — a flat base, a hard-edged shadow, and
line work — and `instantiateCharacter` was one part, one shape, one node. A
part with `shapes: [...]` is now a group with layered children, which is the
prerequisite for anything in Phase 10 that reads as drawn rather than as
clip-art.

---

## Phase 10 — the procedural art provider — **done**

Design and the corrections to it: [07-ART-SYSTEM.md](07-ART-SYSTEM.md).
Vocabulary: [08-ART-VOCABULARY.md](08-ART-VOCABULARY.md).

| Item | State |
|---|---|
| Enumerated face kit | **done** — `src/core/art/face.js`: 4 jaws, 5 eyes, 5 brows, 5 noses, 4 lip widths, 4 ear types, 7 hair styles |
| Three views per feature | **done** — `front`, `threeQuarter`, `profile`, lerped from two authored outlines so they stay consistent |
| Expressions | **done** — 6, as named geometry overrides rather than rotations |
| Filled tapered limbs replacing strokes | **done** — `limbPath`, with `stroke` carrying the line work |
| Two tones per part | **done** — flat base plus a hard-edged shade layer |
| Line art | **done** — uniform-weight `stroke`, which is what limited animation draws with |
| Proportions in head-heights | **done** — `heads`, plus 5 named builds; `headRatio` still wins when given |
| Palette derivation | **done** — one colour per material yields `<name>Shade` and `<name>Line` |
| Swap-channel inheritance | **done** — one `view` on the cast root turns a dozen head parts |
| View-qualified swap members | **done** — `angry@profile`, `closed@threeQuarter`; lets two channels own the same `d` without fighting |
| Vocabulary validated with named diagnostics | **done** — a typo reports the valid set and renders the default |
| An external image-model provider | — not started, and still the right call: consistency across views is the known hard problem |

### Seven contact sheets, and why that number matters

Every fault worth fixing was invisible to the unit tests and visible
immediately in a render: hair drawn over the whole face, the ear walking
across the cheek as the head turned, the nose as a floating blob beside the
eye, near-circular googly eyes, a shadow that swamped a turned head. The tests
assert that the vocabulary is closed and deterministic, which they should.
**They cannot assert that it looks right, and nothing cheap can.** Budget for
looking.

### Six defects this phase found in existing code

Four were latent and would have bitten whoever came next.

1. **`buildClipFromAction` split the channel at the LAST dot**, so its own
   `props.` branch was unreachable — a generated action could only ever key a
   transform, never a discrete swap.
2. **A part with both `shape` and `shapes` lost its base drawing.** `kind` was
   forced to `group` whenever layers existed.
3. **`measureCharacter` read only `part.shape`**, so a rig whose head draws
   through swap sets measured as a headless body — and every staging check
   that used it was wrong by a head.
4. **Gradient stops were never resolved through the palette.** Naming a colour
   threw inside `ctx.addColorStop` and took the whole frame down.
5. **A scene's palette never reached its cast**, so characters silently
   rendered in default colours surrounded by correctly-coloured scenery.
6. **`swapProps` stamped the default onto the node**, making every part its
   own nearest declaration of the channel.

### Format change: `hair`

`generate.hair` named a palette key and now names a **style**; the colour is
`generate.hairColor`, defaulting to the `hair` palette entry. A film still
saying `"hair": "hair"` renders with a default cap and gets a warning naming
the fix. `demo/film.json` and `demo/mountain.json` are migrated.

### Known limits

- An expression override is drawn per view, but not art-directed per view per
  slot: an angry brow in profile is the angry brow's profile member.
- A near arm raised above the shoulder draws over the head. Arms are the
  neck's siblings under the torso and `z` only sorts siblings.
- No clipping, deliberately. The draw loop is flat with no `save`/`restore`
  stack, and cel shadows are authored to fit rather than clipped.
- Gradients still only reach `rect` and the background.

---

## Phase 11 — scenery templates — **done**

| Item | State |
|---|---|
| Templates | **done** — `living-room`, `kitchen`, `street`, `hillside`, `interior-wide` |
| Props placed by name | **done** — 9, anchored by fraction of frame width (`"sofa@0.55"`), never pixels |
| Times of day | **done** — 4, as a palette overlay that changes zero geometry |
| A template returns its ground | **done** — so the art, `do:'move'` and the staging check read one declaration |
| Authored scenery still wins | **done** — a template is a starting point, not a cage |
| Templates scale to the frame | **done** — asserted at 640×360 and 1920×1080 |

Lives at `scene.template`, not `background.template` as the design sketched:
a template produces scenery *and* a ground, both scene-level, while
`background` is specifically the backdrop fill.

---

## The twelve principles of animation — **audited, four built**

Full audit: [09-PRINCIPLES.md](09-PRINCIPLES.md).

Eight were already expressible; four could not be expressed without
hand-writing extra keyframes every time, which in practice means they went
unused. Those four are now one number on an action, in
`src/core/anim/principles.js`.

| Principle | Affordance | State |
|---|---|---|
| Anticipation | `anticipate` on `pose` · `move` · `reach` | **done** — one place, because all three write through `writeChannel` |
| Follow through | `overshoot` on the same three | **done** |
| Overlapping action | `lag` + `chain` on an action definition | **done** — the generated `walk` and `idle` use it |
| Arcs | `arc` on `move` | **done** — bows the midpoint perpendicular to travel |
| Squash and stretch | `squashKeys`, the `squash` action | **done** — volume-preserving; `breathe` corrected to match |
| Staging · slow in/out · secondary action · timing · pose-to-pose · solid drawing · appeal | existing features, now named | **done** |
| Exaggeration | `overshoot` + `squash` + head-heights | *partial* — no multiplier over an existing performance, and no reason yet to add one |

Each of the four is asserted on the **compiled timeline**, not on the helper
alone: a helper nothing calls is not an affordance.

---

### An operational trap, measured

`npm run test:all` launches Chrome with a **throwaway** profile, so every e2e
suite that voices dialogue re-downloads both Piper voice models — about
**120 MB** — from scratch. Measured on a clean run: 26 s for the first model,
48.7 s before `prepare` returns, against 0.25 ms/frame for the actual render.

Two consequences worth knowing before debugging a "hang":

- the suite is **network-bound**, not CPU-bound, and a stalled run sits at
  **0% CPU** while it downloads;
- running suites concurrently makes it look broken. Three overlapping Chrome
  instances each pulling 120 MB turned a 48-second run into 15 minutes with no
  output, which is indistinguishable from a deadlock until you check CPU.

The fix, when it is worth it, is a persistent `userDataDir` so the models
cache across runs. Not done: it touches all seven e2e harnesses and trades a
known cost for profile-state flakiness. Measure before taking that trade.

---

## Phase 12 — the vocabulary document — **done**

| Item | State |
|---|---|
| `docs/08-ART-VOCABULARY.md` | **done** — every enum, every template, every prop, a worked scene, and an explicit list of what the system cannot do |
| A reference two-hander dialogue film | **done** — `demo/two-hander.json`: 55.0 s, 10 shots, 3 reused setups, 10 voiced lines, no hand-authored geometry |
| Declared framing, checked | **done** — `wide`/`medium`/`close` + `on`, measured in head heights, with the corrective zoom in the diagnostic |
| Authoring cost measured | **done** — see below |

### Measured

| | `mountain.json` | `two-hander.json` |
|---|---|---|
| duration | 23.2 s | 55.0 s |
| script | ~1,505 tokens | ~1,708 tokens |
| **per second of film** | **65 tok/s** | **31 tok/s** |
| hand-placed scenery | 2,154 bytes | 4 bytes |
| characters on screen | 1 | 2 |

Twice the economy for twice the cast. The caveat from Phase 8 still stands and
should not be lost: the script was never the expensive part — it was 3% of the
mountain film's turn. The vocabulary document addresses the re-reading; the
framing check addresses the looking.

### What the reference film found

It compiled clean, staged clean, and framed **every one of its five close-ups
as a full-length two-shot**. The intent lived only in the shot ids and nothing
compared it to the zoom; three contact sheets to notice.

Two fixes, both in `staging.js`:

- `framing` + `on` as a declaration, checked against the zoom in force,
  measured in head heights because a close-up crops the body. The diagnostic
  carries the corrective zoom, and a test follows that suggestion and asserts
  it clears — a suggestion that does not work is worse than none.
- the existing off-frame check no longer fires on non-subjects when a shot
  names its subject. It had assumed every cast member belongs in frame at all
  times, which is true of a one-character film and false of shot/reverse-shot.

The general lesson: **a check can only verify intent that was written down.**
Every unverifiable thing left in this system is something the author never got
to declare.

### Also this phase

`cast.at` may give only an x and the character stands on the scene's declared
ground, using the same helpers `do:'move'` already used. Previously an author
computed the first y by hand or wrote a dummy one-frame `move` to snap it
down — both the arithmetic the ground declaration exists to remove.

---

## Phase 13 — the motion system — **done**

Built from the fight live test's findings. Design and measurements:
[11-MOTION-SYSTEM.md](11-MOTION-SYSTEM.md); the gaps that prompted it:
[10-ACTION-GAPS.md](10-ACTION-GAPS.md).

| Item | State |
|---|---|
| Layered evaluation: `Clip.blend`, `Clip.mask`, instance `weight` | **done** — additive applies the clip's own rest-pose inverse, so cycles stay authored as absolute numbers and become deltas with no re-authoring |
| `breathe` and `idle` additive | **done** — `walk` and `squash` stay override; they are whole-body actions, not overlays |
| On twos: `meta.step`, `shot.step` | **done** — cast held for N frames, `__camera` and `__subtitle` exempt by name |
| Motion measured per drawing, not per frame | **done** — otherwise the anime standard scores as 50% frozen |
| Smears (multiples): `cast.echo` | **done** — a compile pass that clones the subtree and time-shifts its tracks, so frame N stays a pure function of N; gated to named shots |
| Blend modes | **done** — `add`/`screen`/`multiply`/`overlay`/`darken`/`lighten` |
| Glow | **done** — `{ blur, color, x, y }` |
| Trim paths | **done** — `{ start, end, offset }`, via the dash array because Canvas2D exposes path length nowhere |
| Repeater | **done** — `{ count, x, y, rot, sx, sy, alpha }`; the fight's 18-ray speed-line burst is one node |
| Gradients on `path` and `ellipse`, and radial | **done** — previously `rect` only |
| Deformation (mesh/bend, smart bones) | — not started; the largest remaining gap |
| Elongated smears, secondary motion, per-pose z, hit-stop | — not started |

### Measured

| | before | after |
|---|---|---|
| frames with no cast movement | **77%** | **0%** |
| frames visibly moving | 21% | 34% |
| "completely still" diagnostics | 7 | 0 |

Drawing-to-drawing change, camera locked, against 0.85 for a dialogue scene
in the reference clip: `12-giant` 0.00 → 2.7, `17-collide` 0.00 → 3.0/10.6/
9.9/12.9.

### Still a rigid cutout system

Every part is a rigid transformed shape; a limb cannot bend. That is the next
tier and the biggest one. The engine's art is vector paths rather than
textures, which makes skinning *easier* than the texture case — transforming
control points, drawn natively by Canvas2D with no UVs, no triangulation and
no WebGL. Planned with per-point bone weights plus Moho-style driven
correctives.

---

## Live test: action — **the engine is not ready for it**

Full findings and the plan: [10-ACTION-GAPS.md](10-ACTION-GAPS.md).

A sixty-second fight (`demo/fight.json`, script in `demo/fight-script.md`)
rendered to `demo/out/sun-and-sky.webm`. Everything structural passed —
60.0 s authored, 23 shots, validate clean, staging clean, framing clean,
voices, music, zero diagnostics — and the result is a slideshow.

| | exactly frozen | visibly moving |
|---|---|---|
| the fight | **77%** | 21% |
| the dialogue film | 2% | 5% |

Seven shots, including `06-impact`, are 100% frozen. Frame-to-frame luma
change during the punch combo measured 16.2 as rendered and **0.78** with the
camera locked: the motion was almost entirely the camera shaking.

**Root cause: there is no additive layering.** A pose compiles to absolute
keys; a cycle is a clip instance on the same channel; they collide and the
pose wins for the entire film, before and after it. One pose at second three
stops a character breathing for all sixty seconds. It also forces every pose
to restore every channel any other pose touched, which is what produced the
freeze in this film.

Planned as Phase 13 (additive layering), 14 (timing texture: twos, hit-stop),
15 (trails/smears and an effects library), 16 (per-pose z, spring secondary
motion). Phase 13 first; the rest is cosmetic until a pose stops killing
cycles.

### Fixed during the test

| Item | State |
|---|---|
| `camera.shake` | **done** — decaying, declared, written as an offset so the pan underneath survives |
| `spiky` and `flame` hair | **done** — straight-edged radial crowns; smoothing turns a spike into a blob |
| Audio assets actually load | **done** — `assets: { kind: "audio" }` had been in the schema since phase 0 and nothing ever fetched one, so a film could declare a score and render silent |
| `set` resolves palette names on colour channels | **done** — it wrote the literal string, which is not a colour, so the canvas kept the previous fill |
| A later `set`/`show` no longer rewrites the film from frame one | **done** — a track reads as its first key at every earlier time, so gold hair was gold in the opening shot and an effect shown at 35 s was on screen from the start |
| `buildShake` clobbering the previous shot's final framing | **done** — its first key landed on the preceding `to` key and `key()` replaces; caught by the staging check, not by eye |
| Motion is now measurable | **done** — `analyseMotion`/`checkMotion` measure cast movement on world positions, where the camera cannot flatter it. 7 diagnostics on the fight, 0 on the dialogue film |
| No-mouth warning on voiceless characters | **done** — effect sprites were training authors to ignore diagnostics |

---

## Phase 7 — PWA and CDN hardening — *partial, pulled forward*

Phase 2's e2e test asserted PWA installability and found that **it had never
worked** — see [DEFECTS.md](DEFECTS.md). Both causes are fixed.

| Item | State |
|---|---|
| Manifest URLs resolve | **done** — every URL in a manifest resolves against the *manifest's* own location, not the page's. The icons were resolving to `src/pwa/src/pwa/...` (404) and `scope` collapsed to `src/pwa/`, which excludes the app |
| Service worker actually controls the app | **done** — a worker's default scope is its own directory and a static host sends no `Service-Worker-Allowed` header, so `src/pwa/sw.js` registered cleanly and controlled nothing. `sw.js` now lives at the repository root |
| Installability asserted in CI | **done** — `npm run test:studio` fetches the manifest, resolves every icon and `start_url` against it, and checks that both the manifest scope and the service-worker scope cover the page |
| `dist/` published with correct `exports` | **done** in Phase 1 |
| Three as an optional peer resolved at `mount()` | **done** — the 2D path needs no Three.js at all; `jirex-core.esm.min.js` is 43.5 KB with zero dependencies |
| Offline-mode e2e test | — not started |

---

## Camera motion capture — *requested, assessed, not started*

Scoped in [12-MOCAP.md](12-MOCAP.md). Driving a character from a webcam
reading a real person's movement.

| Item | State |
|---|---|
| Landmark capture (Pose Landmarker, in-browser) | — not started |
| Angle retarget — landmark pairs → 16 part rotations | — not started |
| Jitter filter, visibility gating | — not started |
| Keyframe decimation | — not started — **and no curve simplification exists anywhere in the repo yet** |
| Root motion normalisation, facing classification | — not started |
| Foreshortening | **blocked** on deformation, the same gap named in [11-MOTION-SYSTEM.md](11-MOTION-SYSTEM.md#deformation--the-largest-remaining-gap) |
| Face capture → visemes (the higher-ROI cousin) | — not started |

Two findings worth carrying forward even if the feature is never built:

- It needs **no core change**. Capture is an authoring-time ingest that bakes
  a Clip, because frame N must stay a pure function of N. Everything after
  the camera is pure and testable in Node against a committed landmark
  fixture.
- Raw mocap **contradicts** the twelve principles — no anticipation, no
  exaggeration, smooth on ones. It is only worth shipping as a base layer
  under hand-authored exaggeration, which the Phase 13 additive system
  already supports with no new code.

---

## Phase 14 — the 3D film script — **done**

Built from the AK-47 live test. Full findings:
[13-3D-FILM.md](13-3D-FILM.md).

| Item | State |
|---|---|
| `compile3d` — a declarative 3D film script | **done** — shots sequence themselves, duration is derived, `at` resolved once, diagnostics never throw. 3D had only imperative editor ops, so a 50-second film meant several hundred hand-timed keyframes |
| `fly` — the assembly verb | **done** — a part flies in to **its own authored rest pose**, so moving a component in the model cannot desync the animation that lands it |
| Scalar 3D channels | **done** — `position.x`, `rotation.y`, `scale.z`, so the whole 2D animation stack (writeChannel, Additive, anticipation, overshoot) serves 3D with no second copy |
| `material.*` and `fov` keyframeable | **done** — material properties had been settable but never animatable, so a flash could not brighten and a part could not fade |
| Analytic particles | **done** — closed-form `p(t)`, hashed randomness, no integrator, so frame N stays a pure function of N and a burst can be seeked into |
| `SceneAdapter` — core recipe → THREE objects | **done** — the only module that touches THREE, and it takes it as an argument, so the 2D path still needs no Three.js |
| Unlit materials for smoke and dust | **done** — lit, they rendered as solid grey balls |
| Camera `lookAt` as a driven target node | **done** — baking a rotation would interpolate Euler between two aim directions and swing wide |
| `film3d.html` + `scripts/produce3d.mjs` | **done** — render and frame-grab (`GRAB=12,40.3`), no UI |
| `demo/ak47.json` from a dimension table | **done** — 32 rifle parts at real dimensions, 17 shots, 50.0 s |
| Audio on the 3D path | **done** — see Phase 15 |
| 3D staging and exposure checks | **done** — see Phase 15 |

### What the test found, beyond the missing compiler

- A rifle 880 mm long was framed so tight it overflowed on all four sides. 2D
  measures framing in head heights; 3D measures nothing.
- The first pass rendered near-black; the correction blew the rifle to white.
  Nothing checks exposure or contrast.
- Smoke rendered as solid grey balls: particle alpha was written straight into
  `material.opacity`, replacing the authored value, **and** the puffs were lit.
- The entire muzzle flash fired four seconds early, in the wrong shot, because
  the generator hardcoded a start time instead of deriving it. Exactly the
  arithmetic the declarative compiler removes — and it came straight back the
  moment a generator did it by hand.
- Written output was seven bytes. `dataUrl.split(',')[1]` splits on the first
  comma, and the mime type `video/webm;codecs=vp9,opus` contains one.

---

## Phase 15 — closing the 3D film's four limits — **done**

The four gaps Phase 14 reported. Full detail:
[13-3D-FILM.md](13-3D-FILM.md#7-closing-the-four-limits).

| Item | State |
|---|---|
| `staging3d` — analytic framing check | **done** — projects a cast member's world bounds through the camera; no renderer, no GPU, runs in Node in milliseconds. All eight corners, because a long object seen end-on has a centre in frame and both ends off it |
| `on` may name a part | **done** — a macro of a 30 mm handle is measured against the handle, not the 880 mm rifle it belongs to |
| A declared band is tested against the swept range | **done** — a shot is a *move*; requiring every sample in one band calls every push-in an error, and three samples of a fast one step over the band entirely |
| A shot need not contain an undeclared subject | **done** — cutting to the wall is a cut. The 2D check makes the same exemption |
| `checkExposure` + `lumaStats` | **done** — exposure depends on lights and materials, so it cannot be analytic. Measured on real frames at 160×90, judged by a pure function |
| `CHECK=1 npm run produce:3d` | **done** — compile, framing and exposure in one pass; exits non-zero on any finding |
| Audio on the 3D path | **done** — `audioCues` from the compiler plus a `sound` verb; the harness runs the 2D `OfflineMixer` and `MediaRecorderSink` already accepted a buffer. 62 cues on the ad: bed, a clack per part seating, the charge, 17 reports at 600 rpm, 14 impacts |
| Four synthesized audio assets, seeded | **done** — `make-ak47-audio.mjs`; no licensed media in the repo and the audio is as reproducible as the frames |
| `lathe` and `extrude` geometry, with `extrudePath` | **done** — not CSG, which is a dependency and a correctness surface of its own. Three already ships both; the magazine is now one swept profile instead of four rotated slabs, and the seams are gone |
| Velocity-stretched particles | **done** — particles report analytic velocity and a `shutter` stretches each to the distance it covers while the shutter is open. Motion blur for a point, solved rather than accumulated |

### What the new checks found on their first run

- Two shots rendering at **1.7% mean luma with 95% of pixels crushed to black**.
- A magazine insert at **293% of the magazine's own height**, with the magwell
  it was seating into out of shot.
- A compiler bug: **a cut overwrote the outgoing shot's final camera key.**
  Two camera positions at one instant, and `key` replaces, so the firing shot
  spent five seconds drifting toward the next shot's camera and ended with the
  rifle behind it. Found by the check, not by eye.
- And one in the fix itself: `lookAt` aims +Z while a cylinder runs along +Y,
  so the first tracer rendered as a bar *across* the flight path rather than
  along it.

198 unit tests pass.

---

## Phase 16 — characters in 3D — **done**

A presenter explaining order blocks, with a screen, a rig, lipsync and facial
performance. Full findings: [14-CHARACTER-3D.md](14-CHARACTER-3D.md).

| Item | State |
|---|---|
| `SkinnedMesh` / `Skeleton` construction from scratch | **done** — this was the open half of Phase 4. 25 bones, automatic weights, built from a pure data table |
| Swept elliptical surfaces with profile curves | **done** — circular cross-sections and linear tapers are what make a figure read as plumbing; a chest is two thirds as deep as it is wide and a calf bulges a third of the way down |
| Procedural clothing | **done** — the body's own segments inflated, so a garment cannot clip through the body it is derived from |
| A generated head from a ring stack | **done** — chin, jaw angle, cheekbones, braincase and crown, rather than a sphere |
| 24 procedural blendshapes, ARKit-named | **done** — `morph.<name>` had worked since Phase 3 and nothing had ever built a target, so the channel was unreachable |
| Lipsync onto a 3D face | **done** — the 2D viseme track read through `VISEME_SHAPES`, with no two visemes opening the jaw the same amount |
| Expressions, blinks, saccades | **done** — asymmetric blinks (80 ms closed, 150 ms open), jittered intervals, 7°/3° saccade thresholds, all from the literature |
| `express` and `nudge` verbs | **done** — `nudge` offsets from the bind pose, because `move` on a bone destroys it |
| Canvas text textures | **done** — the 3D path had no texturing, so a presenter could stand in front of a screen that could not say anything |
| TTS on the 3D path | **done** — and it had been failing silently; `film3d.html`'s import map was missing `onnxruntime-web` |
| Sculpting, UVs, textures, SSS, hair, cloth sim, IK, correctives | **not done** — see [the ceiling](14-CHARACTER-3D.md#6-the-ceiling-honestly) |

### Defects this test found

Twelve, including four that only a rendered frame could catch: a skeleton
whose surfaces stole each other's bones; inverse bind matrices computed
against an un-updated `matrixWorld`; distance-based skin weights binding a hip
to a forearm and a thigh to a fingertip; and inverted winding that left the
body showing the inside of its far wall while every garment over it was
culled. Plus a flaw in Phase 15's own camera-cut fix, which carried its nudge
into the arrival key and so collided all over again.

213 unit tests pass.
