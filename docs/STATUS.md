# Status — implemented vs not

**Rule: a phase is not done until this file is updated in the same commit.**

Last updated: 2026-10-07 (end of Phases 4 and 6).

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
