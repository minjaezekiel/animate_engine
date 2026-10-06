# Phases

Live state is in [STATUS.md](STATUS.md); this file is the plan and the
reasoning. Defect dispositions referenced here are in
[DEFECTS.md](DEFECTS.md).

## The shape of the plan

Two goals pull in opposite directions: an architecture that can eventually
carry full 2D *and* 3D character animation, and a finished two-minute film
quickly. They are reconciled by building a renderer-agnostic pure-JS core and
shipping the 2D backend on top of it first. The 3D track then becomes a second
backend over the same core rather than a rewrite.

The ordering principle throughout: **work that would be deleted later is not
done at all.** Several real bugs in the legacy engine are therefore left
alone, because the architecture removes the code that contains them.

---

## Phase 0 — 2D film pipeline — **done**

One action turns a `film.json` into a finished video with voices, music and
lipsync.

**The constraint that made it survivable: Phase 0 touched zero lines of
existing code.** Not `SceneManager`, `AnimationManager`, `EditManager`,
`UIManager`, `MediaManager`, `RecordingManager` or `index.html`. Purely
additive, so no existing defect could derail it and the shipped editor could
not regress.

Deliberately excluded: any 3D, any build step, IK, skin weights, voice
cloning, a 2D editor UI, and every legacy defect repair.

Delivered: see [STATUS.md](STATUS.md). The demo film is 4 scenes, 19 shots,
10 voiced lines, exactly 120.0 s.

---

## Phase 0.5 — legacy data-loss guards

Roughly half an hour, and not architecture — just stopping the bleeding on the
shipped editor.

1. Guard `restoreAutosave` so a snapshot containing non-round-trippable
   geometry does not silently replace a sculpt with a cube. This earns its
   place now because it is *unprompted destruction of user data by the
   autosave feature*, not merely lost fidelity on an explicit load.
2. A throwaway `rebuildMixers()` so the 3D editor is not dead after a reload,
   **labelled as throwaway** — Phase 3 deletes it along with `mixers`.

**Verify:** sculpt, reload, confirm the mesh survives or the user was warned;
load a project, press Play, confirm motion.

---

## Phase 1 — module split, build, CDN packaging

Make `src/` the source of truth and `animateEngine.js` a generated shim,
without breaking anything.

- `scripts/build.mjs` (esbuild) → `dist/animate-engine.{esm.js,umd.js,umd.min.js}`.
  Three.js external for esm, global for umd.
- Move the 11 legacy classes into `src/legacy/*.js` as named exports. **Keep
  the `utils` export surface byte-identical** so `test/utils.test.mjs` passes
  untouched — that existing test is the regression harness for the move.
- `animateEngine.js` becomes a ~10-line shim preserving
  `global.AnimationEngine`, the class bag, and the `#viewport` auto-init guard.
- The library entry exposes `createEngine(opts)` with **no auto-instantiation**.
- Fix `package.json` main/module/exports/unpkg/jsdelivr, and add
  `prepublishOnly: build` so a stale min build cannot ship again.
- Decouple the DOM: one id table per panel replacing 181 `getElementById`
  calls — **panel by panel, not all at once**.
- Generate the MCP zod schemas from a single op table, instead of maintaining
  the op list in both `runCommand`'s switch and the tool registrations (where
  the `run_script` doc string has already drifted from reality).

**Verify:** `npm test` green with zero test edits; `require('./animateEngine.js')`
still returns the class bag with `animationEngine === null`; headless Chrome
loads `index.html` from `dist/` with no console errors and a non-blank canvas.

---

## Phase 2 — 2D rig depth and an authoring UI — *shipped, partial*

**Delivered:**

- Two-bone analytic IK plus CCD for longer chains and rotation limits
  (`core/rig/IK2D.js`, pure, 23 unit tests).
- `do: "reach"` — IK reachable from the film script, solved at compile time so
  the render loop stays untouched.
- `chainFromParts` — the rig is read off the character's `parts` list, so
  there is no second skeleton format to keep in sync.
- `studio.html` — drag a joint, the editor solves IK and writes a real
  `reach` action back into the film. The edit **is** the script.
- Onion skinning, frame stepping, playback, undo, a live JSON panel, and a
  `sessionStorage` hand-off to the render harness.

**Not built, with reasons** (see [STATUS.md](STATUS.md)): weighted blending of
two simultaneous poses (`for` already covers pose-to-pose), scenery parallax,
image assets in the UI. Squash and stretch needed nothing — `sx`/`sy`/`skx`
were already animatable channels.

**Spectral viseme refinement: rejected, not deferred.** Band energy cannot
recover place of articulation, so /m/ /b/ /p/ /f/ /v/ would be misclassified,
and wrong visemes flicker worse than fewer correct ones. See
[03-VOICE.md](03-VOICE.md).

**Verified:** IK unit tests for reachable, unreachable, singular, folded and
limit-constrained targets; `npm run test:studio` drives the real page in
headless Chrome — it drags a hand and asserts the hand lands within 2.3 px of
the cursor, that the action was written, that undo removes it, and that
recompiling from the saved JSON alone reproduces the pose with 0 px drift.

It also asserts PWA installability, which is how two Phase-7 defects surfaced
four phases early: the manifest's icons all 404'd and the service worker
controlled nothing. Both fixed.

---

## Phase 3 — 3D backend over the same core — *shipped*

**Delivered:**

- The scene serializes with Three's own `toJSON` / `ObjectLoader`, which fixes
  geometry parameters, edited vertex buffers, hierarchy, lights and light
  types in one move — and preserves uuids, so keyframes survive a round trip.
- `AnimationMixer`, the tween engine and the curve store are gone: ~450 lines
  replaced by a conversion to core tracks and forty lines that write a sampled
  pose onto THREE objects.
- Imported glTF clips convert all the way down into ordinary editable
  keyframes, which is what leaves the mixer with no remaining job.
- `Three3DBackend` + a pluggable `poser` on `OfflineRenderer`, so the 3D
  editor exports through the same frame-stepped loop as the 2D films.
- `PhysicsManager.stepTo` for offline renders, and a real accumulator for live
  ones.
- The CSS transition path is deleted, not ported.

**Not done:** GIF and PNG-sequence export still call `captureFrames`, which
holds raw RGBA *and* PNG bytes per frame. The replacement exists; rewiring
those two buttons is Phase 5.

**Verified:** `npm run test:roundtrip` asserts the project round trip vertex by
vertex, plus hierarchy, uuids, light types, helpers and a v1 project.
`npm run test:legacy` asserts scrubbing after a load, slerped rotation, step
interpolation, animated colour, reproducibility, a 48-frame deterministic
offline render, and physics that falls, rewinds and repeats. 27 Node unit
tests cover the conversion and the applier with no browser.

Three silent defects surfaced from asserting rather than assuming: cannon.js
had never loaded (a CDN version that does not exist), `toJSON` reads a matrix
Three only refreshes during a render, and `BufferGeometry.toJSON` discards
edited vertices on a parametric geometry.

---

## Phase 4 — real 3D rigging and skinning

**Budget the prerequisite explicitly: getting off Three r128 CDN globals onto
ES-module Three r150+.** r128's `examples/js` `FBXLoader` drags fflate and
NURBS in as globals, its skinning and colour management are four years stale,
and `GLTFExporter` is not even loaded today. There is no sensible way to do
Mixamo retargeting on r128 globals, so treat the upgrade as its own sub-phase
rather than discovering it mid-flight.

Then: `THREE.Bone`/`Skeleton`/`SkinnedMesh` construction; skin weight painting
or heat-diffusion auto-weights; auto-rig by bounding-volume skeleton fit; bone
constraints (look-at, limit-rotation, copy-rotation, two-bone IK); retargeting
by bone-name mapping with a Mixamo preset; FBX import; a pose library; 3D
viseme lipsync through morph targets (`setMorph` and morph tracks already
exist).

**Verify:** retargeting is a pure bone-name and rest-pose transform problem —
unit-test it in core; golden-frame renders for skinning.

---

## Phase 5 — performance — *shipped, partial*

Everything here was measured before and after, and `npm run test:legacy`
asserts the numbers so they cannot quietly regress.

**Delivered:** streaming GIF and PNG-sequence export · gizmo handles built once
from a data table (and landing on the object, which they never did) ·
ray-plane drag projection, with the three plane handles working at all for the
first time · a spatial hash for the smooth brush, with a radius that scales
with the mesh · history coalescing.

**Skipped, with reasons in [STATUS.md](STATUS.md):** history as diffs
(coalescing removed the amplification), dirty-flag incremental `sync` (the 2D
backend's `sync` is already a no-op), on-demand render, OffscreenCanvas +
worker.

| | before | after |
|---|---|---|
| gizmo, per frame | 7 nodes + 7 listeners rebuilt | 0.005 ms, reused |
| sculpt smooth, 9,216 verts | ~10,000 ms | 55 ms |
| 25 mutations | 25 serialize + 25 writes | 1 of each |

---

## Phase 6 — modeling and material parity

Parametric primitive arguments (all six are hardcoded, and the MCP
`create_object` tool cannot pass a size) · full PBR material properties
(colour is currently the only editable one) · more post-FX ·
boolean/mirror/array modifiers · extrude, bevel and loop cut.

---

## Phase 7 — PWA and CDN hardening

`dist/` published with correct `exports` · Three as an **optional** peer
resolved at `mount()`, so the 2D path keeps working with no Three.js present ·
Lighthouse installability · an offline-mode end-to-end test that loads with
the network disabled and renders a 2D film.
