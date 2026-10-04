# Status — implemented vs not

**Rule: a phase is not done until this file is updated in the same commit.**

Last updated: 2026-10-04 (end of Phase 0).

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
| Tests — 59 Node unit tests | **done** | anim, compile, audio/lipsync, scene/backend/rig. |
| Tests — e2e render + determinism | **done** | `test/e2e/render-film.mjs`: 2,880 frames, exact timestamps, draw-call determinism. |
| Tests — e2e A/V sync probe | **done** | `test/e2e/render-av.mjs`: muxed audio, click recovered at 0.007 s. |
| Docs | **done** | This directory. |

### Verified by measurement, not assumption

- MediaRecorder stamps wall-clock time: unpaced, 48 frames at 24 fps gave a
  **0.96 s** file instead of 2.00 s. Pacing is mandatory. See
  [04-RENDER-EXPORT.md](04-RENDER-EXPORT.md).
- Preflight on the demo film at 1280×720: **0.44 ms median / 1.09 ms p95** per
  frame against a 41.67 ms ceiling.
- Full 2,880-frame proxy render at 160×90: about **2 s**, 2,695 distinct
  frames, **39 draw calls per frame**. (It was 527 before group alpha was made
  to inherit — every scene in the film was being drawn every frame.)
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
- **No 2D editor UI.** Films are authored as JSON or from a screenplay; there
  is no timeline/stage editor yet (Phase 2).
- **No IK.** 2D rigs are parent/child rotation only (Phase 2).
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

## Phase 1 — module split, build, CDN packaging — **not started**

| Item | State |
|---|---|
| `scripts/build.mjs` (esbuild) → `dist/` esm + umd + min | — |
| Move the 11 legacy classes into `src/legacy/*.js` | — |
| `animateEngine.js` becomes a shim; `utils` export kept byte-identical | — |
| `createEngine()` factory, no auto-instantiation in the library entry | — |
| Fix `package.json` main/module/exports/unpkg/jsdelivr + `prepublishOnly` | — |
| Decouple DOM: one id table per panel, replacing 181 `getElementById` | — |
| Generate MCP zod schemas from a single op table | — |

---

## Phase 2 — 2D rig depth + authoring UI — **not started**

Two-bone analytic IK and CCD chains · pose library with blending · squash and
stretch · onion skinning · `studio.html` timeline/stage editor · spectral
viseme refinement *evaluated against* the text baseline rather than shipped
blind.

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

## Phase 7 — PWA and CDN hardening — **not started**

`dist/` published with correct `exports` · Three as an optional peer resolved
at `mount()` so the 2D path works with no Three.js at all · Lighthouse
installability · offline-mode e2e test.
