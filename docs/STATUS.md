# Status — implemented vs not

**Rule: a phase is not done until this file is updated in the same commit.**

Last updated: 2026-10-04 (end of Phase 2).

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
  assert that instead.
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

## Phase 3 — 3D backend over the same core — **not started**

`Three3DBackend` wrapping the existing managers · `PoseApplier` · glTF clips
converted to core tracks · delete ~450 lines of mixer/tween/curve code · fix
the serialization defects the 3D path genuinely needs · `PhysicsManager.stepTo`.

## Phase 4 — real 3D rigging and skinning — **not started**

**Prerequisite: get off Three r128 CDN globals onto ES-module Three r150+.**
Then Bone/Skeleton/SkinnedMesh construction, skin weights or auto-weights,
auto-rig, bone constraints, Mixamo retargeting, FBX, 3D viseme lipsync via
morph targets.

## Phase 5 — performance — **not started**

Dirty-flag incremental sync · on-demand render · persistent gizmo handles and
correct ray-plane drag maths · index-buffer adjacency for the sculpt brush ·
history as diffs · OffscreenCanvas + worker for the 2D offline path.

## Phase 6 — modeling and material parity — **not started**

Parametric primitives · full PBR properties (colour is currently the only
editable one) · more post-FX · boolean/mirror/array modifiers.

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
