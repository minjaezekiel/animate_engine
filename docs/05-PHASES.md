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

## Phase 3 — 3D backend over the same core

The 3D editor starts running on the core evaluator, and `AnimationMixer`
leaves authored animation entirely.

- `Three3DBackend` / `SceneAdapter` / `PoseApplier` **wrapping the existing
  manager instances** rather than replacing them. `sync()` calls the existing
  `createCube`/`createSphere`/`createCamera`; `PoseApplier` writes straight to
  `position`/`quaternion`/`scale`/`material.color`/`morphTargetInfluences`.
- `AnimationManager` becomes a facade over core. **Deleted, not ported:**
  `mixers`, `tweens`, `animationClips`, `prepareActions`,
  `createAnimationClip`, `_vectorTrack`, `createTween`, `createTweenInstance`,
  `setCurve`, `getCurve` — roughly 450 lines. `UIManager` and `EditManager`
  are untouched; they keep calling the same method names.
- `clipToTracks(THREE.AnimationClip)` converts imported glTF clips at import,
  after which the mixer has no remaining job.
- **Fix serialization properly**, because the 3D track cannot proceed without
  it: geometry parameters rather than type names, sculpted vertex buffers,
  imported models as embedded GLB, parent/child round-trip, lights registered
  and serialized, the light-type case miss, and `importModel`'s undefined
  `animationManager`.
- `PhysicsManager.stepTo(t)` with fixed substeps, so offline render advances
  simulation deterministically (today offline capture never steps physics).
- Delete the CSS transition path in favour of core transition tracks.

**Verify:** a Node round-trip of a scene containing every node kind including a
sculpted mesh and a GLB, asserting structural **and vertex-level** equality;
then a golden-frame render of a 3D film script.

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

## Phase 5 — performance

Dirty-flag propagation so `sync` is incremental · on-demand render (the legacy
loop runs the whole manager stack plus a DOM gizmo rebuild at 60 fps forever) ·
persistent gizmo handles and proper ray-plane projection replacing the
hardcoded `* 0.01` drag maths · index-buffer adjacency for the sculpt smooth
brush · history as **diffs** instead of a full `serializeProject()` plus a
`localStorage.setItem` per mutation · OffscreenCanvas and a worker for the 2D
offline path.

**Verify:** a benchmark harness asserting ms-per-frame ceilings; a test that
one transform mutation produces a diff under *N* bytes.

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
