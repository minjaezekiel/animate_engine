# What this engine is missing — an audit, and how to add it safely

**Status: open**, and four items have graduated out of it: 3D transitions
(Phase 40), the voice runtime (Phase 41), `digest` on the 2D path
(Phase 42) and the shared verb table (Phase 57 — §1 below, which is now a
record of what it found rather than a plan). Rigid bodies graduated into
[44-RIGID-BODIES.md](44-RIGID-BODIES.md) and Tier 1 of that shipped in Phase
60. Written against the code, not
against an old plan. Every
claim here was checked by grep or by running something; where a claim is a
judgement rather than a measurement it says so. Items graduate out of this
doc into their own `pending/` doc when they come up the queue.

Role taken deliberately: hybrid 2D/3D animator **and** tools engineer. The
first half of each section is what an animator would miss; the second is where
it goes in this tree and what it costs.

---

## 1. The one structural finding

There are two compilers, `compile.js` (2D) and `compile3d.js` (3D), and the
3D one is a **smaller, younger copy** of the 2D one. Phase 39 found five
capabilities that were not missing machinery at all, only a call nobody had
made — MP4, chunked readback, `retimeToAudio`, voice levelling and vendored
voice models all existed and had never been wired to the 3D path.

That is not a bug to fix once. It is a shape that will keep producing bugs
while the two compilers share a vocabulary but not a table.

**CLOSED in Phase 57.** The table is
[`src/core/script/verbs.js`](../../src/core/script/verbs.js): 24 verbs, one
row each, with `paths` as the per-path capability flag. It is read in three
places and nowhere else — `validate.js`, and each compiler's `default:`
branch. The matrix it replaced is now generated from it and lives in
[02-FILM-SCRIPT.md § Verbs](../02-FILM-SCRIPT.md#verbs).

What the table bought, measured:

| | before | after |
|---|---|---|
| cross-path verbs told which path they live on | 0 of 15 | **15 of 15** |
| …and told what to say on this path instead | 0 | **8** |
| lists of the verbs, kept by hand | 2 (and the 3D path had none) | **1, derived** |
| a verb added to one compiler alone | shipped 15 times | **fails the test suite** |

The fix was deliberately **not** to copy verbs across: half of them are
legitimately one-path-only, because a clip plane is not a thing a flat
drawing has and an exposure sheet is not a thing a solid has. What the author
gets is the honest answer — `'nudge' is a 3D verb. On the 2D path, use
shift.` — where before each path reported a correctly-spelled verb as an
unknown word, which sent the author hunting for a misspelling.

Two of the gaps in the old matrix turned out to be **a call nobody had
made**, the same finding as Phase 39, and shipped with the table:

- **`show` / `hide` on the 3D path.** `PoseApplier` has understood a discrete
  `visible` channel since Phase 14. A cut, not a fade — a fade needs the
  material marked `transparent` at build time, and `for` says so.
- **`sound` on the 2D path.** 2D audio could be declared only at scene level,
  so a cue two seconds into the third shot was arithmetic the author did by
  hand and redid whenever a shot above it changed length.

- **`express` on the 2D path** — **closed in Phase 64**, and it was the same
  shape a third time: `face.js` has built a view-qualified `expression` swap
  set on every brow and eye part since the generated rig landed, and the cast
  entry already wrote `props.expression` on the cast ROOT for the swap pass
  to resolve downward. One discrete key on that channel was the whole verb.
  The `instead` text — "the cast entry's `expression`, which is chosen per
  shot and cannot change mid-shot" — had been sitting in the table describing
  a gap as though it were a design.

Still genuinely missing, and recorded as a row rather than as an absence:
`count` in 3D (it needs a text texture per displayed value, which is a
texture-streaming question, not a verb).

And the guard that makes the table binding rather than decorative:
`test/core/verbs.test.mjs` compiles every verb the table promises on every
path it claims, **and** reads each compiler's own source back out to check
the other direction. Verified by introducing both kinds of drift and watching
the suite fail.

---

## 2. Missing, by what an animator would reach for

Each row: what it is, where it would live, and the honest cost.

### Timing and curves

- ~~**No curve editor, and no dope sheet.**~~ **Done, Phase 65.** This entry
  called it a **UI** job because the tracks are already data. True, and
  incomplete: before there was anywhere to drag a handle there was also no
  way to *answer* "what is keyed on this channel, and when" — for a human or
  for an agent. So the sheet is a pure function of the timeline
  ([`core/anim/dope.js`](../../src/core/anim/dope.js)), `scripts/dope.mjs`
  prints it in a terminal with no browser at all, and
  [`ui/DopeSheet.js`](../../src/ui/DopeSheet.js) draws the same data.
  `ease: 'bezier'` with an `h` had been wired end to end since the first
  timeline and **no film had ever used it** — here, unusually, the arithmetic
  was fine; nobody used it because four numbers are not a shape you can
  picture. *Measured:* dragging the outgoing handle to 0.95 puts a subject
  **32 px behind** the default ease, and to 0.02 **160 px ahead**, through the
  panel's own code path and the real renderer (`npm run test:dope`). Only the
  authored half is draggable, because the compiled keys are output and
  writing to them would be editing the result rather than the cause.
- **No stepped / hold interpolation as a first-class mode.** Blocking a
  performance in steps before splining it is how 3D character work is
  actually done.
- **No time remap.** No way to retime a finished span — slow a beat down, hold
  a frame — without re-authoring its keys.
- **No motion blur on either path.** Confirmed: the only mentions in the tree
  are comments. For a 24 fps film with fast mechanical motion this is the
  single most visible difference from "most 3D animations", which was the
  original brief for Phase 39. Cheap approximation: accumulate 2–4 subframes
  per output frame in `OfflineRenderer` behind a `shutter` meta key. Costs
  exactly what it accumulates, is deterministic, and needs no new pass.
- ~~**No onion skin on either film path.**~~ 3D in **Phase 66**, 2D in
  **Phase 67** — the pose editor had it and neither film path did, so the
  one view that shows an arc was available for a single pose and never for
  a shot. The three surfaces need three compositing answers and share
  `frames()`: ghosts under a transparent 2D editor canvas, added over an
  opaque 3D render, and alpha-composited over a 2D film with everything
  outside the cast switched off. `ONION=2,1,0.25` on `produce3d` and on
  `grab2d`.
- ~~**No onion skin in 3D.**~~ **Done, Phase 66** — and the premise was
  wrong: `onionSkin.js` was never 2D-only. Its contract is
  `draw(ctx, { render: (time) => something drawImage accepts })` and its
  header says it never tells the backend that onion skinning exists, so a
  WebGL canvas always satisfied it. What the 3D path did need was the
  other compositing order: a 3D render is **opaque**, so ghosts laid under
  the live frame are buried by its background — four reported, one on
  screen, measured. `drawLit` adds them over it instead, with the tint
  multiplied in rather than filled `source-atop`. `ONION=2,1,0.25`.

### Camera

- **No lens model.** The camera has a `fov`; it has no focal length in mm, no
  sensor size and no aperture, so "shoot this on an 85" is not expressible and
  depth of field is not physically linked to anything.
- **DONE in Phase 44 — see [../completed_phases/39-KEYFRAMEABLE-POST.md](../completed_phases/39-KEYFRAMEABLE-POST.md).** ~~**Post is not keyframeable**, so there is **no rack focus** — the one camera
  move that most reads as photography. `src/render/post3d.js` builds the chain
  from a declaration once; the chain's parameters need to be timeline channels
  like everything else. This is the highest-value item in this whole section
  and is mostly plumbing.
- **No two-node camera rig** (aim/boom), which is how a real crane shot is
  parameterised. `mocap` and target nodes get part of the way.~~

### Light and material

- **No light rigs or presets.** Every film lights itself from scratch, and
  Phase 39 spent three wrong hypotheses on a 26° spot at intensity 52 — in
  candela, because lights are physically correct since r155. A `keyFillRim`
  preset with a declared intensity model would have made that one line.
- **No shadow catcher**, so a subject cannot be grounded on an invisible
  floor.
- **No node-graph materials.** Procedural *textures* landed in Phase 39 as
  layered specs painted to bytes, which is the right shape and Node-testable;
  materials themselves are still a flat property bag.
- **No UVs on the procedural humanoid**, so a character cannot be textured at
  all. Named in [../14-CHARACTER-3D.md](../14-CHARACTER-3D.md) §7 as the
  largest single gap and still true.
- **No decals, no triplanar projection.**

### Physics and simulation

This is where the engine is thinnest relative to what the word "physics"
promises. `src/core/sim/` contains exactly two files: `cloth.js` and
`fluid.js`.

- ~~**No rigid-body dynamics.**~~ **Tier 1 shipped in Phase 60** — things
  fall, bounce, tumble, land and settle, and the seam is the one predicted
  here: a fixed substep, baked to keyframes, so frame N stays a pure function
  of N. The design, the scope boundary and the five proofs are in
  [44-RIGID-BODIES.md](44-RIGID-BODIES.md). **Stacking is still open**,
  because it needs box-against-box with a real contact manifold; so are
  joints.
- **No particle collision**, inherent to the closed-form solver and still the
  right trade for a spray — but what has to *land* is a rigid body now.
- **No volumetrics.** The fluid solver is a 2D grid on a card.
- **No soft body, no constraints between bodies** (hinges, ropes, springs).

### Sound

- **Music is not ducked under dialogue.** `src/audio/OfflineMixer.js:40`
  carries the comment *"so a music bed can be ducked as a group later"* — and
  `later` has not happened. Every film in this repo has had its bed gains
  hand-lowered in the film script instead, which means the mix is re-tuned by
  hand per film and silently wrong the moment a line moves. A sidechain
  envelope derived from the dialogue bus, computed offline from the already-
  known take boundaries, is deterministic and roughly thirty lines.
- **No per-cue EQ or compression**, no reverb send, so a voice indoors and a
  voice outdoors are the same voice.
- Phase 39 added the master headroom stage, so clipping at least cannot ship
  silently any more.

### Pipeline and scale

- **No resume.** A render that dies at frame 1,400 of 1,570 starts again.
- **No batch queue.** `scripts/render-forex.sh` is a shell loop, which is the
  honest admission that there is no queue.
- **No proxy or draft quality.** There is no "render this at quarter res with
  post off" switch, which is what makes iteration on a 3D shot tolerable.
- **No LOD, no occlusion culling.**
- **No distributed or tiled render**, which for a browser engine is a real
  option: frames are independent and `renderOffline` is already frame-indexed,
  so N tabs could each take every Nth frame.

### Review and the agent surface

- ~~**`digest` exists only on the 3D path.**~~ **Done, Phase 42** —
  [../completed_phases/37-DIGEST-2D.md](../completed_phases/37-DIGEST-2D.md).
  `npm run digest2d`, and `digest_film` over MCP.
- **No A/B compare, no frame annotation.** An agent can grab frames; it cannot
  diff two renders and be told what changed.
- **No `apply_patch` on a film.** An agent rewrites whole documents, which is
  what makes an edit expensive.

### Editor and UI

- **The dockable workspace is a model with no page.** `src/editor/dock.js` is
  tested and `mountDock` is called from nowhere.
- **No timeline UI on the 3D path at all.** `film3d.html` is a renderer with a
  form, not an editor.
- **No asset browser**, so an imported model's node names are discovered by
  running a script.
- **No render queue panel**, which is the UI half of the pipeline gap above.
- **No hotkey rebinding UI**, although the keymap is already data that
  describes itself.

---

## 3. How to add any of it without breaking what works

The repo already has the seams. The rule is to use them rather than reach past
them, and the four that matter:

1. **Pure core, adapted backend.** Anything that can be arithmetic goes in
   `src/core/` with no THREE and no DOM, so it is testable in Node in
   milliseconds. `src/core/art/textures.js` is the model: layered specs in,
   RGBA bytes out, 22 tests, no browser. The backend adapter
   (`src/backends/three3d/SceneAdapter.js`) is the only place allowed to know
   about THREE.
2. **A feature is a normalized spec, a pure function, a checker and a test —
   four things, every time.** The spec is normalized at compile time with
   warnings for anything unread; the function is pure; the checker answers in
   numbers; the test asserts the numbers. Phase 39's overlay shipped that way
   and its 28 false findings were caught by its own checker before any render.
3. **Nothing new may read a key that nothing validates.** The repeated,
   expensive defect in this codebase is a declared key that nothing reads:
   `lineCap` never reaching the renderer, a `subtitle` flag unread since Phase
   16, `subtitleStyle` advertised and ignored, transitions on 3D scenes today.
   See [../19-CONTRACTS-AND-BUDGET.md](../19-CONTRACTS-AND-BUDGET.md). The
   discipline is cheap: normalize every spec and warn on every leftover key.
4. **Guard lists, not special cases.** `COLOR_PROPS` and then `VECTOR2_PROPS`
   in `SceneAdapter.js` exist because THREE's `setValues` copies into a live
   object and an array silently became NaN — which rendered an entire planet
   black. Third instance of that class. A new property type goes on a list,
   and the list is the documentation.

And one process rule that has earned its place: **an animation that hits a
limit ships the engine feature that removes it.** Nothing in this document
should be built because it is on this document. It should be built because a
film could not be made without it — which also guarantees it ships with a
real test instead of a synthetic one.

---

## 4. Priority, with the reasoning

Ordered by value over cost, not by size.

| | Item | Why here |
|---|---|---|
| ~~1~~ | ~~**3D transitions**~~ — **done**, Phase 40 ([35](../completed_phases/35-3D-TRANSITIONS.md)) | Every 3D cut was hard. Tier 1 cost one `fillRect`. `crossfade` remains: [38](38-3D-CROSSFADE.md) |
| ~~2~~ | ~~**Voice runtime**~~ — **done**, Phase 41 ([36](../completed_phases/36-VOICE-RUNTIME.md)) | Two engines had shipped that nothing could render through. Offline weights remain: [39](39-OFFLINE-VOICE-WEIGHTS.md) |
| ~~3~~ | ~~**Port `digest` to 2D**~~ — **done**, Phase 42 ([37](../completed_phases/37-DIGEST-2D.md)) | Best ratio in the document. ~1,200 tokens for a 19-shot film against ~38,000 in screenshots. |
| 1 | **Keyframeable post → rack focus** | The most cinematic missing move, and mostly plumbing. |
| 2 | **Music ducking** | ~30 lines; currently hand-tuned per film and silently wrong the moment a line moves. |
| 3 | **Motion blur via subframe accumulation** | The clearest visual gap against reference 3D work; deterministic. |
| ~~4~~ | ~~**Shared verb table**~~ — **done**, Phase 57 (§1 above) | Stopped the 2D/3D divergence at the source, and closed two gaps that were a call nobody had made. |
| ~~5~~ | ~~**Curve editor + dope sheet UI**~~ — **done**, Phase 65 | It was two things: a sheet that answers in numbers (`scripts/dope.mjs`, no browser) and a canvas panel that drags the authored ease. 32 px of measured difference from one handle. |
| ~~6~~ | ~~**Rigid-body dynamics, baked to keys**~~ — **Tier 1 done**, Phase 60 ([44](44-RIGID-BODIES.md)) | Was the largest missing subsystem. The doc came first, as this row demanded, and it is the doc that caught the `cannon-es` question early. Stacking and joints remain. |
| 7 | **Proxy render + resume + queue** | Iteration cost, not capability. |

---

## 5. What the UI has to become

Phase 39 fixed the immediate sin — six nav items that were `div`s with
`opacity: 0` tooltips for names, unreachable by keyboard — and added
`workspace.html` as a front door. Measured, not assumed: the editor shows 17
controls at rest out of 120 in the document.

What the items above need from the interface, in the order they would arrive:

1. **A timeline panel shared by both paths**, showing shots, dialogue spans
   and transitions on one ruler. The compiler already produces exactly this
   data (`shots[]` with `start`/`duration`, and the retimed dialogue), and
   nothing displays it. It is also where a transition would be *authored*,
   which is the argument for building it alongside item 1.
2. ~~**A curve editor** in the same panel, because a dope sheet without one
   only moves time.~~ **Done, Phase 65** — and the dope sheet came with it,
   in both forms: a canvas panel and a text report for a caller with no
   screen.
3. **A voice picker** populated from `listVoices`, writing a *role* rather
   than a model id so a click cannot weld a film to one engine.
4. **A render panel with a queue and a draft toggle**, replacing the shell
   loop.
5. **Mount `dock.js`**, which is tested and unused, rather than adding a
   fourth fixed layout.

The constraint that holds all of this together, and must not be given up:
**there is no editor-only state.** The edit *is* the script. Every panel above
reads and writes the same document an agent reads and writes, which is why a
pose dragged by hand can be diffed, and why none of this needs a second data
model.
