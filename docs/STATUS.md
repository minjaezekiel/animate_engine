# Status — implemented vs not

**Rule: a phase is not done until this file is updated in the same commit.**

Last updated: 2026-11-07 (Phase 35: **"Game Physics", all seven parts** -- the series finished end to end, 2:48 to 2:57 each, and three more engine gaps the back half found: `count`, a numeric readout that ramps and costs one key per *visible* value rather than one per frame; `shift`, which moves a board part BY an offset instead of teleporting it to the frame's left edge; and a validator that no longer calls a part's own `rot`/`sx`/`sy` unrecognized. Also two layout traps written down rather than re-learned: nothing may sit below y=1430 because that is the subtitle band, and a multi-line text part anchors on its LAST line, which is how four captions in a row printed over their own headings. Phase 34: **"Game Physics"** -- part one of a seven-part series on collision maths, and the first speaking cast in this repo that is NOT a generated humanoid: two billiard balls and a floating robot, authored as explicit `parts` + `mouth` characters. A ball has no arms, so all of its acting is brows, squash and spin -- and three of those four things the engine could not say. Added `squash` and `spin` as verbs, and fixed `pose`/`reach`/`grip` ramping a part from channel 0 rather than from where the rig authored it. Also the three defects that only a rendered FRAME could catch, all of which passed `check-film` clean: a spotlight revealed to alpha 1 covered the table in solid white, two scenes played a four-second line over an empty frame, and the end card ran its kicker through its own title. Phase 33: **"Reading the Rock" / "Kusoma Mwamba"** -- a six-part structural-geology series on joints, folds, faults and shear zones, built TWICE from one authored staging, in English and Swahili, and the three defects that only a second language could expose: a film voiced by anything but Piper was silently measured at the English word rate, the opening shot's tail pad was a hole in the hook (74% against an 80% floor in Swahili where its English twin passed at 85%), and a 3.5s minimum shot length manufactured its own gap under a two-word line. Also: voice substitution is no longer silent -- a film cast against a VoiceStudio that is not running reported nothing and rendered in a Piper voice. Phase 32: **voices and delivery** -- Swahili confirmed working, voices level-matched after measuring a 6.6 dB gap between two of them, casting by role, and a narration pacing analyser that found our own films are 54% speech against the references' 73%. Phase 31: **drawn animation** -- exposure sheets, time-gated smears and boil, from measuring a hand-drawn reference the engine could not have produced. Phase 30: **"Finding Gold"**, a ten-part 1080x1920 series, and the three defects building it exposed -- `lineCap` never reaching the renderer, every transition in six finished films being a hard cut, and `transform.x` being absolute rather than a delta. Phase 29: the **walk cycle** rebuilt on the real key poses -- it had no `down`, no foot roll, and a hip rise that left every walking character hovering above the ground. Phase 28: a render at a non-authored size **cropped** the film instead of scaling it. Phase 27: **MP4 export** — an ISO-BMFF muxer behind the `WebCodecsSink` seam that nothing had ever filled, so H.264/AAC is now the default container and renders run faster than real time. Phase 26: bring your own assets — trace a 2D character out of an uploaded image, import 3D models and HDR environments; both reachable headless by an agent. Phase 25: hands and fingers on both paths — twenty bones per hand in 3D, three detail levels of cutout hand in 2D, and one `grip` pose table shared by both. Phase 24: bone constraints, 3D IK, correctives, teeth, hair, cloth and fluid simulation, and the full post chain).

Legend: **done** · *partial* · — not started

---

## Phase 35 — "Game Physics", parts two to seven — **done**

Full detail in [31-GAME-PHYSICS-SERIES.md](31-GAME-PHYSICS-SERIES.md).

| Area | State | Notes |
|---|---|---|
| Parts 2–7, English | **done** | 1080x1920, **rendered 2:52 / 2:57 / 2:47 / 2:54 / 2:48 / 2:52** to `out/physics/collisions-0N.mp4`. 35 narration lines each, `check-film` clean with no warnings on all six: 86–87% line coverage, hooks 90–91% from 0.3s. |
| The series pays off backwards | **done** | Part 4 derives part 1's "the cue ball stops dead" AND part 3's reflection formula out of the same impulse line — the second by letting one mass go to infinity, which is also why a real engine gives static bodies `1/m = 0` instead of a special case. Part 6 then shows that part 4's denominator was incomplete. A series that only opens loops never closes any. |
| `count` verb | **done** | A numeric readout that ramps: `{do:"count", from:360, to:180, decimals:0, suffix:" px"}`. The value is eased as a number and then formatted, sampled at the frame rate because a key between two frames cannot be seen — then consecutive duplicates are dropped, so 0→5 at no decimals over two seconds is **six keys, not forty-eight**. Before this, the only way to say it was one `set props.text` per displayed value. |
| `shift` verb | **done** | A board part's authored `at` IS its `transform.x`, so "move it 170 left" written as `set transform.x -170` teleports it to the left edge of the frame. Found when part 2's second circle vanished off the side of its own diagram while the figure's measurement line kept pointing at where it used to be. Relative like `spin`, and two shifts compose. |
| A part's `rot`/`sx`/`sy` validate | **done** | `compileFilm` has always read all three; `validate` did not know them, so a part authored at an angle worked perfectly and reported itself as a mistake on every build. |
| `BAND` and `blockAt` | **done** | Two layout traps, written down instead of re-learned. The subtitle band starts at y≈1430, and four captions in a row were placed under it. And `wrapText` lays a block out ENDING at its anchor, so an N-line body centred on y occupies `y−(N−1)·lh` through `y` — which is how every comparison card printed its body over its own heading. |
| Figures for the back half | **done** | `scripts/physics/figures.mjs`: arcs and curved arrows for spin, readouts, distance figures that shrink with what they measure, AABBs, ghost trails, walls whose normal is DERIVED from the wall, bar meters, comparison cards, the game loop as a ring, a fake game screen, derivations. Separate from `common.mjs` so part 1's imports stop changing. |
| Physics honesty | **done** | Each part's header states its conditions. Part 3 writes down the normal convention and part 4 says out loud that it changes, because half the collision code on the internet is wrong by a sign and it is wrong because nobody wrote the convention down. Part 5 makes a scene of height going as **e²**, not e. Part 6 states that a flat world has one rotation axis, so top spin and back spin are not free. |
| Tests | **done** | 867 total, +16 in `test/core/count.test.mjs` covering both new verbs — including that a count costs one key per visible value, that it lands on its destination whatever the easing did, and that `shift` composes and starts from the authored position. `test:e2e` and `test:studio` pass. |
| Render one at a time | — | Two headless Chrome instances at once get one killed with `TargetCloseError`. The film being written is usually still complete, which makes it easy to misread as a bug in the film. Noted, not fixed. |
| Nobody has watched them | — | Every board was verified from still frames and every container probed, but the Chrome extension is not connected here and no human has played them back with sound. |

---

## Phase 34 — "Game Physics", and a cast with no arms — **done**

Full detail in [31-GAME-PHYSICS-SERIES.md](31-GAME-PHYSICS-SERIES.md).

| Area | State | Notes |
|---|---|---|
| Part 1 of 7, English | **done** | 1080x1920, authored 3:05, **rendered 2:56** to `out/physics/collisions-01.mp4` (28.3 MB, 25s wall clock, no warnings). 100 audio cues and 576 viseme keys — lipsync works on hand-built ball and robot mouths. Parts 2–7 followed in Phase 35. |
| Runtime and pacing | **done** | `check-film` clean, **no warnings**: 85% line coverage, hook 88% from 0.5s, longest gap 1.9s, tail 0.5s. Pad cut to 0.5s and the shot floor to 2.4s — this is motion graphics, and the measured defect across earlier series was slack. |
| A speaking character made of `parts` | **done** | Bolt and Nova are BALLS, Vector is a robot. `compile.js` always supported explicit `parts` + `mouth` + `poses`, but nothing had used it for a character that talks. These are the first, and they found the four gaps below. |
| `pose` ramps from the authored transform | **done** | `writeChannel` fell back to `defaultChannel` — 0 for everything but the scales — so the first pose ramping a brow's `y` slid it up from the middle of the ball. Now `authoredChannel`, the same thing `move` has always done. **No existing film changes**: every pose channel in the repo is `rot`, `sx`, `sy`, or `y` on a `hips` authored at the origin, and for all of those the authored value already equals the default. |
| `squash` verb | **done** | Squash and stretch, the oldest principle in animation, and the engine had no way to say it. Six hand-authored `set` keys each needing the node's ABSOLUTE scale; now `amount` is the only number and the base is read from the node. Area-conserving (`sy = base / (1 + amount)`), negative stretches, `part` targets a sub-node. |
| `spin` verb | **done** | Whole turns, relative to what the node already holds, `linear` and not negotiable — `smooth` puts a hesitation at each end of the ramp that reads as a stutter rather than as rotation. |
| A mark that orbits | **done** | Bolt's lightning and Nova's 5 are drawn off-centre on a node whose PIVOT is the ball's centre, so rotating it spins the marking while the face stays upright. The only way a ball with eyes can spin. |
| A swap channel seeds its own default | **done** | `seedChannel` bailed when `props[channel]` was undefined — and a swap's default lives in `swapDefaults`, deliberately, so `view` can be inherited down a part tree. A discrete track with no earlier key holds its FIRST key's value backwards, so an eye whose first blink was at 6.8s was **closed for the first 6.8 seconds of the film**. Nothing reported it; the film is valid. Now seeded from `swapDefaults`, which is only reachable on a node the author is already keying, so inheritance is untouched. |
| Sound effects | **done** | `scripts/make-sfx.mjs` synthesizes six cues — click, impact, whoosh, pop, tick, riser — to a gitignored `films/physics/sfx/`, the way `make-music.mjs` does. 64 cues in the film. A shot carries `sfx: [['click', 1.62]]` and `liftSfx` lifts it to scene-level `audio`; it MUST run after `fitShots`, since it sums the durations `fitShots` derives. `produce.mjs` now serves `.wav`/`.mp3`/`.ogg` with real media types. |
| `prepare({ skipVoices })` is real | **done** | `grab2d.mjs` has passed it since it was written and nothing read it, so grabbing one still ran the whole voice pipeline — minutes of TTS to draw a picture with no sound in it. Adding audio assets then made it stop completing at all. Now it skips assets, synthesis, mix and retime: **a two-frame grab went from not finishing to 2.4s**. `renderFilm` does not pass it, so rendering is unchanged. Pays back on every film, because looking at a frame is the only check that catches a wrong picture. |
| Eyes blink by shape swap | **done** | Not by squash: a scaled eye slides toward the parent's origin, which on a ball is the middle of the face. The glint is a CHILD of the eye and a swap leaves children alone, so a blink takes the glint down too. |
| Three voices, three models, three accents | **done** | `warm-m-us` / `narrator-f-en` / `narrator-m-en`. English has ten presets, so unlike the Swahili half of Phase 33 nothing is faked from rate and pitch. All three vendored. `VOICE_BACKEND` switches to VoiceStudio in one variable. |
| Defects only a frame could catch | **done** | All three passed `check-film`. (1) The spotlight is authored at alpha 0.05 and `reveal` ramps to 1 — a solid white disc over the table; `revealTo` now carries the target alpha with the part. (2) Two scenes played a four-second line over an empty frame. (3) A 56px title on a 66px line height puts a TWO-line block 66px above its anchor, straight through the kicker. |
| Tests | **done** | 851 total, +14 in `test/core/squash.test.mjs` covering both verbs and the authored-value fallback, including that the scales keep their old defaults and that an eye is open before its first blink. |
| Pre-existing: `test:av` fails | — | **Not caused by this phase.** `npm run test:av` reports "click should start the mix, found at sample -1" and "sync click not found". Verified by running it in a clean worktree at HEAD (438b600) with none of this phase's changes: it fails identically there. The A/V sync probe's 1 kHz click is not reaching `prepared.audio`, so the test cannot currently prove audio/video alignment. Worth chasing before the next render-path change, since it is the only check that catches a frame-late audio track. |
| Music bed | — | Effects only. Three minutes of WAV is tens of megabytes and there is no looping audio cue, so a bed would have to be synthesized at full length. |
| `squash`/`spin` in 3D | — | 2D only; `compile3d.js` has its own action switch. |

---

## Phase 33 — "Reading the Rock" / "Kusoma Mwamba", bilingual — **done**

Full detail in [30-STRUCTURE-SERIES.md](30-STRUCTURE-SERIES.md).

| Area | State | Notes |
|---|---|---|
| Six parts, English **and** Swahili | **done** | 12 films, 1080x1920. Authored ONCE: a part is `partN(lang)` over a `{en, sw}` narration table, so the dub cannot drift from the original. |
| Runtime and pacing | **done** | EN 3:10–3:21, SW 2:44–2:57. All twelve pass `check-film` with **no warnings**: 82–85% line coverage, hook 91–96%, first word at 0.3s. |
| Structural primitives | **done** | `scripts/structure/common.mjs` — beds, joint sets, folds with outer-arc cracks, faults with throw and breccia, shear-zone fabric, veins, strike-and-dip, gossan. Drawn by what each does to the LAYERING, never as an icon. |
| Declared voice language | **done** | `langOfSpec` only reads a Piper model id, so a cloned/uploaded/recorded voice carried no language and every pacing estimate fell back to 150 wpm English. A voice may now declare `lang`; it flows `castVoices` → `lipsyncJobs` → `analysePacing` and beats the guess. |
| Voice substitution is visible | **done** | `VoiceRegistry.synthesize` fell silently down the ladder: a film cast against a VoiceStudio that was not running rendered in a Piper voice and nothing said so. Now a `warning` naming both voices, plus `allowFallback:false` / `STRICT_VOICE=1` to render silent rather than wrong. |
| Hook is not padded | **done** | The first shot gets a 0.2s tail instead of 0.85s. Hook coverage across twelve films went 83–96% → **91–96%**. |
| `gesture()` — a pose that ends | **done** | `for` is the transition SPAN, not a hold; a posed gesture held for the rest of the scene. This is why the earlier two-handers stand with an arm across frame. |
| Segment clipping | **done** | `clipSegment` (Liang–Barsky). An angle is a direction, not a length, so joint sets ran clear out of their own outcrop — invisible to every checker, since a path has no bounds the staging check can see. |
| Generic board helpers lifted | **done** | `cardRows`, `statParts`, `foldBand`, `strata` moved to `lib/boards.mjs` for the THIRD series; `vito/common.mjs` re-exports them. The vito films rebuild **byte-identical**. |
| Pinned banner | **done** | From the references: `anime6` keeps a caption up from frame one. A board's parts start invisible every time it is cast, so it is authored opaque — a reveal in scene one does nothing for scene two. |
| End card: follow, share, engine | **done** | ~6s. What is next, the follow/share ask, and the engine credit with the repo. |
| Tests | **done** | 837 total, +2 pinning declared-language behaviour, +5 pinning visible substitution. |
| Voice backend is one switch | **done** | `VOICE_BACKEND=piper` (default) or `voicestudio`. The cast is by ROLE either way, so nothing downstream of `lib/structure.mjs` knows which engine speaks. English gets three real models; Swahili shares the one Piper model separated by delivery, which is the whole reason the VoiceStudio path exists. |
| `fitShots` is rate-aware | **done** | A line's length depends on WHO says it. Mzee Rajabu at 0.86 takes 16% longer than a flat estimate, and every shot he was in had been under-sized. |
| Models vendored | **done** | All four — alba, alan, northern_english_male, lanfrica. A headless render launches a fresh profile, so an unvendored model is re-downloaded every run; that has killed two renders before. |
| Rendered to MP4 | **done** | Twelve 1080x1920 H.264/AAC files in **one directory**, `out/structure/rock-<lang>-<nn>.mp4`. ~25s of encoding per three-minute film. Rendered runtime is SHORTER than authored (part 1 EN: 3:10 authored, 2:47 rendered) because `retimeToAudio` re-fits to the real audio and Piper speaks faster than the 150 wpm estimate. |

---

## Phase 17 — Rust/WebAssembly kernel layer — **done**

Full detail, with every measurement, in
[15-PERFORMANCE.md](15-PERFORMANCE.md).

| Area | State | Notes |
|---|---|---|
| `rust/jirex-kernels` | **done** | 21 KB wasm, **zero crates.io dependencies**, **zero wasm imports**, no bindgen. `simd128`, verified at build time. |
| `src/kernels` — one API, two backends | **done** | `loadKernels()` prefers wasm, falls back to a real JS implementation. `K.backend` reports which. |
| Deform kernels — skin, morph, normals, smooth | **done** | 4.0× to 18.1× over JS. |
| Paint kernels — stamp_mask, composite_mask, to_rgba8 | **done** | Two-pass stroke: coverage mask, then one composite. |
| Image kernels — warp_mesh, blur_rgba | **done** | Correct, but see the per-pixel limit below. |
| CSR adjacency builder | **done** | Replaces the legacy O(n²) *and topologically wrong* proximity smoothing. |
| Capability probe | **done** | `npm run probe`. WebGPU compute **measured running in headless Chrome.** |
| Dependency audit | **done** | `npm run audit:deps` — 9 browser dependencies, all loaded and smoke-tested in a real browser. |
| Benchmark | **done** | `npm run bench:kernels`. |
| Tests | **done** | 59 kernel + 12 pool: module integrity, wasm↔JS conformance, the maths, and bit-identity of pooled vs serial. Total now **284**. |
| Browser e2e | **done** | `test/e2e/kernels-browser.mjs` — the pool and all four CDN dependencies, in a real browser, under **both** COEP values. |
| Worker pool — wasm threads over shared memory | **done** | `src/kernels/parallel.js`. 11 workers, one `WebAssembly.Memory({shared:true})`, **zero copies**. Pooled results are **bit-identical** to serial. |
| Dev server with COOP/COEP | **done** | `scripts/serve.mjs`, Node stdlib only. Replaces `python3 -m http.server`, which cannot enable `SharedArrayBuffer`. |
| GPU compute backend | — | Scoped in 15-PERFORMANCE.md §7.1, and **less urgent than it was**: the pool brought both over-budget kernels inside the frame budget on the CPU, with determinism intact. |
| Motion graphics, sculpting | — | Kernels exist; the authoring layers do not. §7.3–7.4. |

---

## Phase 18 — the paint layer — **done**

Full detail in [16-PAINT.md](16-PAINT.md).

| Area | State | Notes |
|---|---|---|
| `core/paint/stroke.js` | **done** | Arc-length resampling with pressure, taper, seeded jitter. Pure and deterministic. |
| `core/paint/brushes.js` | **done** | Nine brushes as plain data: pencil, pen, ink, marker, airbrush, charcoal, chalk, eraser, softEraser. |
| `core/paint/Surface.js` | **done** | Premultiplied f32 RGBA, per-stroke resample cache, erase, `drawAll` with progressive reveal. |
| Draw-on animation | **done** | A revealed stroke is a **prefix** of the whole one, so frame N is a pure function of N with no history. Driven by an ordinary number channel, so every easing and clip feature applies unchanged. |
| Input stabilisation | **done** | `smoothPoints`, `pressureFromVelocity`. |
| Brush sheet | **done** | `npm run make:brushes` → a PNG rendered entirely in Node, `node:zlib` only. |
| Tests | **done** | paint, media, motion, ops, editor and budget. Total now **478**, with 160 mutations in the audit (12 new for the calibration path, 4 stale patterns repaired). |
| Mutation audit | **done** | `npm run audit:tests` — 112 deliberate defects across every module. |
| Layers + 13 W3C blend modes | **done** | `Document.js`. Named addressing, because an index means something else the moment a layer is inserted. 33 MB per layer at 1080p. |
| Grain / textured brushes | **done** | `texture.js` — generated, not loaded, so a brush is four numbers rather than an asset. Canvas-locked by default: **paper tooth belongs to the paper**. |
| Wet media and colour mixing | **done** | `smudge_stroke`. `smudge` and `colorRate` are **independent** — coupling them, as Krita's original engine did, makes a pure smear inexpressible. |
| Chisel and calligraphic nibs | **done** | Elliptical dabs with `aspect`/`angle`. `fixed` vs `follow` are different instruments, not variations. |
| SVG path input | **done** | `path.js`. One line instead of two hundred coordinates — the decisive ergonomic choice for agent authoring. |
| `film.json` binding | **done** | `kind:'paint'` nodes from a scene's `drawings`, and a `draw` verb animating `props.progress`. |
| Mutation audit | **done** | `npm run audit:tests` — 51 deliberate defects; 50 killed, 1 equivalent by construction. |
| Layer masks + clipping groups | **done** | A mask *is* a `PaintSurface`, so it is painted with the ordinary brushes. Three coverage multipliers: own mask, clip base, **and the base's own mask**. |
| Non-separable blend modes | **done** | hue, saturation, color, luminosity, with the W3C luminance model and a hue-preserving clip. 17 modes total. |
| Asset-loaded brush textures | **done** | `textureFromImage` + `paint_load_texture`. A named asset wins over generated grain; a missing one warns and falls back. |
| Live pointer binding | **done** | `src/input/StrokeRecorder.js` — coalesced events, pointer capture, derived pressure, `touch-action`. |
| Incremental flatten | **done** | Painting the top of a 12-layer document costs **1 blend instead of 12**; an unchanged flatten returns in 5 µs. |
| Picture → video | **done** | `core/motion/PhotoMotion.js` — Ken Burns, 2.5D parallax, wave, puppet, over `warp_mesh`. |
| Headless MCP surface | **done** | `mcp/paint-server.js`, 21 tools **generated** from `core/script/ops.js`. No browser required. |
| PNG codec | **done** | `src/io/png.js`, `node:zlib` only. All five scanline filters; refuses 16-bit and interlaced rather than misdecoding. |
| Mesh tearing at depth edges | **done** | `tearMesh` cuts the surface along depth iso-contours, so a near subject moves rigidly instead of stretching across the gap. Measured: the silhouette travels its full 4.9 px, against 1 px untorn. The hole is filled by mirroring the background forward. |
| Monocular depth estimation | **done** | `core/motion/depth.js` — model-agnostic ONNX adapter over `onnxruntime-web`, following the TTS voices' rules (lazy bare-specifier import, `available()` never throws, model as a url). Runs in the browser; the Node tests drive it against a stub session. |
| `photos` in `film.json` | **done** | `kind:'photo'` nodes from a scene's `photos`, animated on `props.progress` by the **same `draw` verb** as a drawing — no new verb, no new compiler path. A photo with no action plays; a drawing with no action holds. |
| Inpainting a tear | **done** | A **background plate** per tear level, built once at construction: the subject removed and the hole filled by a push-pull pyramid (`rust/jirex-kernels/src/inpaint.rs`). Per-frame cost unchanged — two `warp_mesh` calls over the same triangles. |
| Finding depth planes automatically | **done** | `depthPlanes` ranks histogram **valleys** by prominence. The midpoint and Otsu were both measured and both land inside the background (Otsu returns 0.499 where the midpoint returns 0.475). On a field with no planes it returns nothing and `tear` switches itself off. |
| Depth estimation in Node | **done** | `onnxruntime-node` and `onnxruntime-web` share an API, so one adapter covers both and `photo_estimate_depth` runs headless. The runtime is optional in both; a missing one names every candidate and the fix. |
| Texture synthesis in the fill | — | Push-pull interpolates and cannot carry a strong edge through a wide hole. PatchMatch or a generative model. 17-MOTION-AND-MCP.md §9. |

### Editor architecture (docs/18-EDITOR-ARCHITECTURE.md)

| Area | State | Notes |
|---|---|---|
| Undo / redo | **done** | `core/history/History.js` — inverse patches with labels, transactions for gestures, `MISSING` so undoing an insertion leaves the key *absent*. Replaces whole-document `JSON.stringify` snapshots in `studio.html`, which also had no redo. |
| Hotkey system | **done** | `editor/keymap.js` — `mod` resolves per platform, chords normalise, `describe()` feeds a help overlay, a collision throws at setup, and a keystroke in a text field belongs to the field. |
| Dockable workspace | **model built, not adopted** | `editor/dock.js` — a pure `DockLayout` (regions, order, sizes, collapse) plus a thin DOM binding. A restored layout is **reconciled** against the panels that exist, so shipping a panel does not make it invisible to existing users. `mountDock` is not yet used by any page; `studio.html` keeps its fixed two-column layout. |
| Onion skinning | **done** | `render/onionSkin.js` — ghosts rendered by the real renderer, tinted warm behind and cool ahead, geometric falloff, spacing in seconds. Extracted from `studio.html`, which had two untinted past ghosts and no future ones. |
| Image-sequence export | **done** | `render/sinks/PngSequenceSink.js` + `io/zip.js` — canvas-native PNG, stored ZIP, byte-reproducible, refuses an impossible render up front rather than at frame 2,000. |
| GIF from the new renderer | — | A tested encoder exists in `animateEngine.js`; not extracted to a sink. 18-EDITOR-ARCHITECTURE.md §7. |
| glTF / FBX export | — | `GLTFExporter` is a verified dependency, earmarked for the Phase 3 3D save/load rework. No browser FBX exporter exists. |
| Floating / tabbed panels, split trees | — | Four fixed regions by design. §4. |

### Contracts and the frame budget (docs/19-CONTRACTS-AND-BUDGET.md)

The four defects below turned out to be one defect four times: **a silent
default where there should have been a refusal or a measurement.** Fixed as
contracts rather than at the call sites that happened to be audited.

| Area | State | Notes |
|---|---|---|
| `Scene.add` parent contract | **done** | Honours `spec.parentId` *and* the second argument, and **throws** when both are given and disagree. An argument the callee discards is the whole class of defect. |
| Cast `role` | **done** | `character` \| `effect` \| `prop`, resolved cast entry → character → rig. The feet heuristic stays as the default but is now overridable, and an unknown role warns rather than silently exempting a check. |
| One film, read once | **done** | `compileFilm` returns `expanded`; the checker reads that instead of the raw film, so a template-supplied ground is checked. |
| Frame budget as a diagnostic | **done** | `estimateFrameCost` predicted **73.5 ms** against **71.7 ms measured in a browser**, as an error, before any render. Merged into `analyseStaging` so every check surface gets it. Calibration is measured and exported. |
| Worker pool on photo warps | **done** | 55.03 → 19.74 ms, **bit-identical**. `renderFrame` is synchronous by contract, so the parallel work runs in the render loop's now-awaited `beforeFrame` via `preparePhotos`. Browser-only by default; workers are `unref`'d. |
| The budget models two node kinds | — | Everything else measured at 0.7 ms for a whole 23-shot film. Another measured term if that changes, not a fudge factor. |

#### Closing the three approximations (§7 of the same doc)

Each was a known limit, and none needed a new mechanism — all three were
already solved elsewhere in the repo and simply not wired through.

| Area | State | Notes |
|---|---|---|
| Exact dab count | **done** | `dabsOf` guessed from the path's command count because the real number supposedly "needs kernels". It does not: `resampleStroke` is pure JS. `strokeDabs` is now the single derivation, shared with `Surface._prepare`, and the `approximate` flag is gone. The guess was wrong by however long the strokes were — `M 0 0 L 600 0` and `M 0 0 L 6 0` are both two commands. |
| Preflight measures the right frames | **done** | It sampled frames 0..47 — the opening two seconds — so **a film whose backdrop starts 40 s in passed preflight and then wrote an undecodable file**. It now takes `startSec`/`endSec` from `worstSpan(estimate)`, and runs the render loop's `beforeFrame`, without which it timed the serial fallback while the render used the pool (2.8× out). |
| Calibration from measurement | **done** | `calibrate(predicted, measured)` scales both terms by one ratio — one observation supports one parameter — and the studio stores the fit in `localStorage`, since the thing measured is the machine. `analyseStaging` takes a `calibration` so a later check is anchored. |
| Bimodal frame cost | **done** | A held warp makes per-frame cost bimodal: median **1.0 ms**, p95 **35.7 ms** on the fight film. `meanMs` is what the amortised estimate compares to, `p95Ms` is what `withinBudget` judges, `medianMs` is a trap. |
| First-frame warm-up | **done** | The first frame pays for the mesh and the inpainted plate: **317 ms** once, against ~9 ms steady state. Measured, excluded from the samples, reported as `warmupMs`. Averaged in, it was 6 ms of phantom per-frame cost — enough to calibrate the model nearly 2× pessimistic. |
| Isolation on a static host | **done** | `sw.js` attaches COOP/COEP to its own responses, which is the one mechanism a static host leaves open. **Two** kinds of response need them: the document, and every worker script — rewriting only navigations isolated the page and then could not start one worker. `COEP=off npm run serve` reproduces a header-less host; the e2e runs the whole sequence there. |
| A blocked kernel worker | **done** | Used to leave `loadParallelKernels` neither resolved nor rejected — the pool hanging, nothing logged. It rejects now and the caller falls back to serial. The studio logs which path it took every time. |
| One ratio, one observation | — | `calibrate` scales both terms together. A machine whose dab throughput and pixel bandwidth differ relative to each other needs a film that isolates each, and two fits. |
| Residual shape error | — | 5.6 ms predicted against 9.0 ms measured over the same shot, of which 0.8 ms is the vector baseline the model does not claim to cost. The ratio absorbs it; that is not a guarantee for another film. |
| Safari has no pool | — | `credentialless` is unimplemented there, so the service-worker route does not isolate it. `COEP=require-corp` would, and is tested, at the cost of blocking user assets from origins that send no CORP. |

**Language choice, with evidence.** Three of the four are pure control flow
whose entire output is diagnostic text — Rust would add a wasm boundary and
buy nothing. The fourth is a throughput problem whose expensive part is
*already* Rust: 48 ns/px for the warp, which `15-PERFORMANCE.md` had already
established as bandwidth bound. The levers that moved it were fewer pixels
and more cores (2.8× on six), not more Rust. **JavaScript for all four.**

### Found by a live test: directing a fight through the engine

Redesigning `demo/fight.json` against reference art turned up four engine
defects that no unit test had reached, because each needed something to be
*drawn* before it showed.

| Found | Fix |
|---|---|
| **Every `drawings` and `photos` node was parented to the scene root.** `Scene.add(spec, parentId)` takes the parent as its second argument and overwrites any `parentId` in the spec. So a drawing inherited no scene alpha (ignoring every fade and crossfade) and sorted by z against the root — a backdrop at z −700 drew *under* its own scene's background rect at z −1000, and the film came back black. | Pass `groupId` as the argument. Test + 2 mutations. |
| **FX cast were ground-checked.** Beams, impact stars and speed lines are cast too, and `analyseStaging` reported all of them as "feet off the ground" — six false warnings burying eight real ones. | Skip cast whose rig has no `foot*` part. Test + 1 mutation. |
| **A scene whose ground comes from a `template` is never ground-checked.** `analyseStaging` reads `scene.ground` off the raw film; a template only supplies it during compile. The fight reported 0 staging notes for its whole life because the check never ran. | Not fixed — documented. Declaring `ground` explicitly turns it on. |
| **A photo warp is the most expensive thing in a frame** — 71.7 ms for a 1400×820 backdrop against a 41.67 ms paced ceiling, on a film that ran at 0.7 ms without it. The export does not degrade over the ceiling; it writes an undecodable 110-byte file. | `resolution` and `step` on the photo spec: 0.9 ms median, 27.4 ms p95. Tests + docs. |

It also found a **5.3-second mid-air hang** in the film itself: a leap keyed
y upward and nothing keyed it back, across two cuts. Invisible until the
ground check was switched on.

New tools from the same pass: `paint_fill` (op #22 — `PaintSurface.fill()`
existed but nothing reached it, and painting a flat base with strokes
cannot work: `marker` has `flow: 0.5` in peak mode, so one stroke caps at
half coverage and overlapping passes band), `scripts/contact-sheet.mjs`
(key frames of a film as one PNG, so a look is checked before a render) and
`scripts/bench-film.mjs` (per-frame cost with and without a named element,
which is what turned "over budget" into "the backdrop is 100% of it").

### Verified by measurement, not assumption

- **The smoothing control did nothing at its maximum.** The three-tap
  kernel's gain against the jitter frequency is `|1 - 2k|`, which is not
  monotonic: at `k = 1` it is 1.0, so maximum smoothing inverted the
  wobble's phase and left its amplitude untouched. `amount` now maps to
  `k = amount/2`. The original test *passed*, because it measured peak
  displacement and a phase-inverted signal has the same peak; it now
  measures the mean absolute second difference, which is what a wobble is.
- A flow-0.5 marker drawn over 200 densely sampled points peaks at exactly
  0.5, confirming that mask-then-composite prevents a stroke's darkness
  from recording input sampling rate.
- An airbrush and a marker composite *identically* across separate
  strokes; `mode` is a within-stroke property, and the test that compares
  them had to be rewritten to use one self-crossing stroke.
- **The mutation audit's first run found 12 survivors**, and most had one
  cause: every test touching the new kernels reached the **wasm** backend,
  so the whole JS fallback for blend modes, grain and smudge was
  unverified. Conformance tests comparing the two backends now cover it.
- Two tests were simply too weak to distinguish a defect: an `S` path
  command checked by peak height pins down only half the control-point
  reflection, and grain measured along one scanline samples only three
  noise features. Both now assert the property that matters — tangent
  continuity at the join, and deviation over the stroke's 2D core.
- `seedChannel` declared a `value` parameter and **never used it**, so
  every caller passing one was silently ignored. Removed.
- Summed octaves of value noise concentrate around 0.5, so grain at
  `strength: 0.7` delivered only ~0.4 of real modulation until the tile
  was stretched to its own extremes.

### Phase 20 findings

- **The incremental flatten returned a stale composite forever.**
  `PaintSurface.version` was never initialised, so `version++` yielded
  `NaN`, every layer signature interpolated the constant string `"NaN"`,
  and change detection never fired — with no error anywhere. A test now
  asserts a fresh surface starts at 0.
- **A prefix that was not re-saved must be invalidated.** Painting low in
  the stack rebuilds from zero and saves no prefix; leaving `_prefixUpTo`
  pointing at the old one meant the next high edit reused a prefix
  captured *before* the low edit, silently dropping it.
- **Overscan was half what it needed to be.** `1 + margin` scales about
  the centre, putting only `margin / 2` outside each edge while the
  displacement is per-side. It left exactly one uncovered row, which is
  easy to dismiss as antialiasing.
- **Parallax with no depth map was a uniform pan** of nearly 8 px, not a
  no-op. Now skipped, and `photo_create` reports it.
- **A stroke drawn at (-500, -500) resampled into 405 dabs** and reported
  success. `paint_stroke` now returns the dabs' bounding box and names
  the three outcomes apart.
- The mutation audit's second run found **10 survivors**, nine of them one
  cause again: tests for masks, clipping and the new blend modes all
  reached the **wasm** backend, leaving the JS mirror's three coverage
  multipliers unexecuted. Conformance now covers each combination.

### Verified by measurement, not assumption

- **Per-vertex work belongs in wasm; full-resolution per-pixel work does not
  fit a frame in either backend.** `blurRgba` at 1080p is 97 ms against a
  41.67 ms budget, and that is **4.0 GB/s of memory traffic** — bandwidth,
  not compute. Raw pointers, checked slices and `get_unchecked` measured
  98/143/100 ms, so neither aliasing information nor removing a per-pixel
  divide moved it. The fix is at the call site: **quarter resolution is
  1.63 ms, a 60× reduction**, and visually identical for a glow.
- Two measurement artefacts nearly set the architecture wrong, and both are
  now guarded: `navigator.gpu` and `VideoEncoder` read as **absent** outside
  a secure context, and cargo discovers `.cargo/config.toml` from the
  **working directory**, not from `--manifest-path`, which silently produced
  a scalar wasm that reported itself fine.
- wasm `f32` is bit-reproducible across machines; **JS cannot match it**,
  having no single-precision arithmetic. The two are numerically equivalent,
  not identical, and a golden hash over kernel output must record the
  backend. GPU is reproducible on neither and may not feed keys or hashes.
- **The worker pool moved both over-budget kernels inside the frame
  budget:** `warpMesh` 90.8 → **18.1 ms (5.01×)** and `blurRgba`
  100 → **36.3 ms (2.76×)** against 41.67 ms. `blurRgba` falls short of
  linear for two inherent reasons — it is the most bandwidth-bound kernel
  here, so cores contend on one memory bus, and a full blur is six
  *barriered* passes against `warpMesh`'s one.
- `COEP: require-corp` was predicted to block the CDN dependencies and
  trade the pool for broken 3D and silent voices. **Measured, it does
  not:** jsDelivr and cdnjs both send
  `cross-origin-resource-policy: cross-origin`, and all four load under
  both COEP values. The default is still `credentialless`, for arbitrary
  user-supplied assets; `require-corp` is what gains Safari.
- Two genuine kernel bugs were found by the tests rather than by eye: the
  brush's circle cull discarded the entire antialiased rim before the
  falloff was evaluated, and the half-pixel feather that replaced it was too
  narrow for pixel centres to land in — a radius-8 circle got 8 partial
  pixels out of a ~50px circumference.

---

---

## Phase 33 — flow, delivery, pacing, and a Swahili series — **done**

Three engine features, a six-part film, and five defects found by looking.

### `props.flow` — travelling dashes

`trim` could already repeat a dash pattern down a path: `applyTrim` sets
`[span * L, L]`, so a SMALL `length` repeats instead of covering the shape,
and advancing the offset makes the pattern travel. Reachable the whole time
except that `trim` is an object and `applyPose` is shallow by design, so
`set props.trim.offset` wrote a property literally named `"trim.offset"` that
nothing read — no error, no diagnostic, no moving water. One scalar added to
the offset at draw time, the same shape as `props.boil` and `props.progress`.

Got the arithmetic wrong first: flow scaled by `length` alone advances by
1/(span+1) of a period, so a loop authored 0 → 1 jumped a quarter period every
cycle. Flow now counts whole periods. `RecordingContext` did not record
`lineDashOffset`, so no test could have seen any of it; it does now, only when
non-zero so no golden log moves. See `25-FLOW.md`.

### `core/audio/delivery.js` — rate and pitch per character

There is exactly **one** Swahili voice in the Piper catalogue, confirmed
against its own path map: 1 of 119. `catalog.js` had said since it was written
that a Swahili cast "is separated by pacing and pitch rather than by timbre",
and nothing in the engine could change either. Pitch by resampling, duration
back by WSOLA; the search is the point, because plain overlap-add splices at
an arbitrary phase and warbles. Post-processing rather than a synthesiser
setting, so it works for recorded takes too. Delivery runs BEFORE loudness
normalisation, or it would undo the levelling Phase 32 added. See
`26-DELIVERY.md`.

### `core/script/pacing.js` — pacing before the render

And this is where the interesting mistake was. The first version reported
"speech ratio" and compared it with the 73 % measured from reference audio.
**It is not the same quantity.** The audio tool counts voiced frames; a
compiled film can only know line spans, which include intra-line pause. Same
film, part one of the geology series: **81 % covered, 54 % voiced.** No
calibration reconciles them — scaling 81 to 54 implies a voicing fraction of
0.67, which applied to the references' 73 % would need 109 % coverage.

So it reports LINE COVERAGE, says so in its own summary line, and takes its
thresholds from our own films rather than from a different metric. That makes
it discriminating: geology parts 1 and 10 pass at 81–82 %, part 4 is flagged
at 70 % with its first word at 4.4 s, a 5.1 s hole at 28.9 s, and its two
field scenes named at 36 % and 29 %. See `27-RETENTION.md`.

### Measured, not assumed: Swahili is syllable-timed

Synthesising 21 lines and comparing with their real durations:

| basis | mean | variation |
|---|---|---|
| words/minute | 147 | 11 % |
| characters/second | 16.1 | 6 % |
| **syllables/second** | **6.50** | **5.6 %** |

Swahili spelling is near-phonetic, so a vowel letter is a syllable, and word
length varies enormously — `tu` and `kinachopatikana` are both one word. Mean
absolute error on the worst lines falls from 18 % to 8 %. English keeps words:
its spelling is not phonetic and no measurement justifies a syllable figure.

### Madini ya Vito — six parts, Swahili

1080×1920, 2:22–2:52 each, 82–85 % line coverage, hook 83–93 % from 0.3 s in
all six. The hook plays before the title, because a card in the first two
seconds spends the window. `fitShots` derives every shot's duration from the
line it carries — the direct fix for the defect that left the geology series a
fifth silent. See `28-MADINI-YA-VITO.md`.

### Found by looking at a frame, not by a test

| | |
|---|---|
| `SUBTITLE_STYLE` used `y`; the engine reads `bottomMargin` | Accepted, carried, ignored — every subtitle sat at the default |
| `grab2d` could not show subtitles at all | They are attached in `studio.js` at render time, not by the compiler. Most viewers watch muted. `attachSubtitles` is now exported |
| The gem was five shapes with a thresholded two-tone fill | Read as a clip-art diamond — the same mistake as the dog and the hands. Rebuilt as a facet ring with a continuous shade ramp |
| Every folded layer grew spikes off the left of the frame | Joining two `smooth()` curves by string-surgery on the second one's `M` starts a new subpath the fill closes across the frame. `foldBand` replaces the prefix with an `L` |
| The sea was a blue rectangle with sticks on it | Wavy surface, graded depth, five lanes at falling speeds |

### And two in the tooling

- **Every render re-downloaded 63 MB.** `vits-web` caches models in OPFS and a
  headless render launches a *fresh* profile, so the cache is empty every run.
  The first Swahili render crashed mid-download. `npm run vendor-voice` serves
  the model locally; that render now finishes in **20.9 seconds**.
- **`probe-video.mjs` reported every 48 kHz track as −17536 Hz.** The sample
  rate is 16.16 fixed point, so 48000 sits in the high half as `0xBB800000`,
  negative as a signed int32, and `>>` sign-extends it. It wanted `>>>`. Wrong
  for every file it had ever read.

797 unit tests pass.

## Phase 32 — voices and delivery — *partial*

Design and the measurements: [24-VOICE-AND-DELIVERY.md](24-VOICE-AND-DELIVERY.md).

| Item | State |
|---|---|
| Swahili | **done** — `sw_CD-lanfrica-medium` was already in the shipped catalogue. Synthesised and measured to confirm: 6.77 s, 16 words, ~142 wpm |
| Voice level matching | **done** — `core/audio/loudness.js`. Two Piper voices differ by **6.6 dB** on the same sentence |
| Measured over VOICED frames only | **done** — a mostly-silent line would otherwise be amplified until its few words were shouted |
| Per-voice `gain` | **done** — a trim on the voices block, kept separate from the per-line gain |
| Casting by role, not model id | **done** — `core/voice/catalog.js`, 11 presets; `castEnsemble` returns distinct voices and reports a shortfall |
| Five characters, five voices | **done** — already supported by the format; now tested and castable in one line |
| `scripts/narration-pacing.mjs` | **done** — speech ratio, phrase, pause, onset rate, dynamics, hook vs body |
| Kokoro provider | — not started |
| Pacing check inside `check-film` | — not started |
| Per-character rate and pitch | — not started |

### The finding that matters

| | narrated references | Finding Gold (ours) |
|---|---|---|
| speech ratio | **73%** | **54%** |
| pauses per minute | 32–34 | 20–22 |
| onsets/s | 2.1–2.6 | 2.1–2.2 |

**Our films leave about a fifth of their runtime silent.** The speaking rate
is right — onset rate matches almost exactly — so the fault is the gaps
between lines, which come from shot lengths being set before the narration
was written.

And the hooks are measurably different from the bodies in every narrated
sample: the first eight seconds run at 78–87% speech with **2.0–2.4 s**
phrases, against 72–73% and 1.1–1.4 s after. An opening is one long
uninterrupted run. A pause in the first eight seconds is an exit.

### A tool that looked like it was working

The first version of the pacing analyser counted any unbroken run of voiced
frames as a phrase and reported medians of **40–140 ms**. Speech dips below
any threshold between syllables and across every stop consonant, so those
were syllables, not breath groups. Gaps under 180 ms are now bridged first.

---

## Phase 31 — drawn animation: exposure, smear, boil — *partial*

Design: [21-DRAWN-ANIMATION.md](21-DRAWN-ANIMATION.md). Prompted by measuring
a reference the engine demonstrably could not have produced — `anime22.mp4`,
24 s of rough pencil animation — rather than by a feature request.

| Item | State |
|---|---|
| `scripts/watch-video.mjs` | **done** — decode and measure a video in headless Chrome, since there is no `ffmpeg` here. Cuts, exposure histogram, palette drift, contact sheets |
| `do: 'expose'` — X-sheet hold lengths | **done** — `"4 4 2 1 1 2"`, per target, repeating to fill its span. `timeline.sheets` beside `timeline.steps` |
| Per-target exposure | **done** — a span naming a target beats a blanket one, so one character can be held while the rest are not |
| `do: 'smear'` — time-gated multiples | **done** — reuses `buildEcho`; a span instead of whole shots |
| `cast.echo` test coverage | **done** — it shipped "done" in Phase 13 with **no test of any kind** |
| `do: 'boil'` — redrawn contour | **done** — a stepped exposure index added to every stroke's jitter seed |
| Boil refuses a rig | **done** — boil redraws strokes; a cutout character has none, so it could only ever do nothing |
| Paper and tonal-wash scenery | — not started |
| Quadruped rig + gaits | **done** — `core/script/quadruped.js`, four breeds, walk/trot/bound with measured footfall order and duty factor ([23-QUADRUPED.md](23-QUADRUPED.md)) |
| `part.strokes` — a rig part DRAWN, not assembled | **done** — the part becomes a paint node and still turns about its joint |
| `measureCharacter` sees strokes | **done** — without it a drawn character measured as a point and `standOnGround` buried it |
| Boil reaches a drawn character | **done** — naming the cast member boils every part, each on its own seed |
| Generated quadruped art | *weak* — rigged and measured, but assembled from shapes, so it reads as clip-art. The drawn path is the one to use |
| **`draw.html` — a drawing surface** | **done** — pressure brushes, reference underlay for tracing, onion skin, frames with holds, exports `part.strokes` / a `drawing` / an X-sheet. Model in `editor/DrawTool.js`, DOM-free and tested |
| **Swap-set members may be DRAWINGS** | **done** — `part.swap` members carrying `strokes`. This is how a hand chart, a drawn mouth chart and a drawn head turn work |
| Painters attach per swap MEMBER | **done** — a chart holds several drawings on one node and only one is in `props` at a time |
| Hand chart (`open`/`grip`/`point`/`fist`) | **done** — `scripts/drawn/handchart.mjs` |
| Rigged drawn fingers | **done** — `scripts/drawn/hand.mjs`, correct for a hand seen from the SIDE |
| The man from the reference | *weak* — proportions are right, the drawing is not. See below |

### What the measurement changed

The whole-film average exposure is 2.5 frames per drawing, which reads as
"on twos" and is **wrong about every individual shot**:

| shot | mean hold | drawings/s |
|---|---|---|
| man at the bin | 1.65 f | 14.5 |
| the dog's acting beat | 5.32 f | 4.5 |
| the chase | 1.36 f | 17.6 |

`shot.step` is one integer per shot and cannot say any of this. That is the
whole case for `expose`, and it came from a histogram, not from taste.

### The correction the user made, which no measurement would have

The first quadruped was assembled the way the biped is: tapered paths and
ellipses, one filled silhouette per part. Every gait test passed — footfall
order, duty factor, suspension, stride, loop continuity, withers height — and
the result read as **clip-art**. The user said so twice before it landed:
*"try drawing with a free hand without joining shapes"*.

They were right, and nothing in the test suite could have said so, because
nothing was wrong in the sense a test can express. An even contour with a seam
at every pivot is a correct rig and a bad drawing.

The fix is `part.strokes`: a rig part drawn with the pressure brushes instead
of assembled from primitives, still rotating about its joint. It also made
`boil` reach a character for the first time — boil had been refusing rigs on
the correct grounds that a cutout character has no strokes to redraw.

| | assembled | drawn |
|---|---|---|
| contour | even, one width | pressure-varied, overlapping |
| joints | a seam at every pivot | contours overshoot, so the line reads through |
| boil | nothing to redraw | every part, each on its own seed |

### The defect the hand chart found

`_attachPainters` decided whether to load the paint kernels by walking the
scene for a node of `kind: 'paint'`. A node carrying a chart of drawings is a
`group` until the swap pass runs, so it was invisible to that check — the
kernels never loaded, `attachPainters` returned nothing, and **every drawn
hand, mouth and head turn rendered blank with no diagnostic anywhere**. The
same class as Phase 27's unfilled `muxerFactory`: a feature that exists, is
reachable, and is never reached.

### Drawing the man: what did not work, stated plainly

Four iterations of hand-authored bezier contours against the reference, each
one rendered and compared side by side. Proportions converged well — from an
eight-head tube to a 4.5-head caricature with the right mass. **The drawing
did not.** It is still clearly worse than the reference, and the user said so.

The method is the problem, not the effort. Authoring curve coordinates blind
and seeing the result once per render is not how anyone draws; a human makes
hundreds of micro-corrections per contour with continuous feedback. The
engine's own art doc says it outright: *"An AI is bad at inventing coordinate
geometry and has no way to check its own visual work without paying for an
image."*

What did come out of it is worth keeping: the silhouette-first rule, the
knuckle-span layout, the bare-channel pose bug, and `draw.html`, which exists
precisely so a person's hand can do the part a person's hand is better at.

### Three things that only measuring caught

- **`cast.echo` already did multiples.** The first draft of the design doc
  said no smear existed and proposed building one. The status table said
  otherwise. Reading source before proposing is cheaper than both.
- **Boil must not clone strokes.** `Surface._prepare` caches by stroke
  *identity* and frees the old kernel buffer when the brush key changes, so
  a clone per exposure leaks one buffer per stroke per exposure and defeats
  the cache. The seed is written back onto the same objects.
- **A drawn character measured as a point.** `measureCharacter` reads
  `shape`, so a part made of strokes had no extent, `standOnGround` put the
  root on the floor and the legs went through it. The rig was fine; the
  staging had no way to see it.
- **`seeked` does not mean a video frame is drawable.** The first version of
  the measuring tool produced four identical stills from four different
  timestamps and they looked entirely plausible. Only
  `requestVideoFrameCallback` means "this is the frame you would see" — and
  it does not fire while paused in headless, so the tool plays the file once
  in real time instead of seeking.

---

## Phase 30 — a ten-part film, and what building it found — **done**

"Finding Gold", a ten-part field guide to mineral exploration at 1080x1920,
in `films/geology/` and generated by `scripts/make-geology.mjs` +
`scripts/geology/part-NN.mjs`. 2:16 to 3:00 each, narrated, subtitled,
rendered to MP4. It is the first thing built on this engine that is longer
than two minutes, and the first that is mostly **text and diagrams** rather
than characters -- which is why it found what it found.

| Area | State | Notes |
|---|---|---|
| `scripts/lib/diagram.mjs` | **done** | The authoring layer the engine deliberately does not have: titles, captions, labels with leader lines, arrows, scales, and the reveal/conceal/pop/glide/build verbs. Lives beside the film, not in `src/`. |
| `scripts/lib/series.mjs` | **done** | One palette, one cast, one title treatment and one end card, so ten films cannot drift apart. |
| `scripts/check-film.mjs` | **done** | The 2D equivalent of `CHECK=1 npm run produce:3d`. Compile, validate, stage and budget, with no render. It caught two duplicate part ids and a shot framed on a character who was not on screen. |
| `WIDTH=`/`HEIGHT=` on `grab2d` | **done** | How a non-authored render gets looked at. |

### Three defects, none of which a test could have seen

**`lineCap` and `lineJoin` never reached the renderer.** `shapes.js` has always
read them and defaults both to `'round'`, and `KNOWN.part` did not list them,
so the schema called them unrecognized *and* `drawProps` did not copy them.
Every wide stroked band -- a shear zone, a vein, a magnetic fabric -- bulged
half its own stroke width past each end of its own path. Both are now declared
and copied, along with `maxWidth` and `lineHeight` for text.

**Easing belongs to the segment that STARTS at a key, not the one arriving at
it.** The authoring helper put `step` on the leading key of every transition,
meaning "hold until the ramp begins". It actually held the start value across
the whole transition and then jumped: **every fade, slide and pop in six
finished films was a hard cut**, and six rounds of still frames could not show
it. Found by sampling a compiled track between its own keys.

**`transform.x` is absolute, not a delta.** The compiler writes
`at[0] + pivot[0]` into it, so moving a part "from 0" teleports it to the
origin and slides back from there. Gold thrown from a stellar merger started
at the left edge of the frame. `glide()` takes the authored point and does the
arithmetic.

Both authoring faults are now pinned by `test/core/diagram.test.mjs`, which
compiles a one-shot film and samples the tracks *between* keys -- the only
place either one is visible.

### Measured

| | |
|---|---|
| Ten parts | 2:16 to 3:00, 28 minutes in all |
| Longest part | 4356 frames at 1080x1920 |
| Render | about 40 s per part, roughly 4x faster than real time |
| Scene cost | 300-580 nodes per part, well inside budget at ~1 ms/frame |

### Not done

- **No automated check that a board fits the frame.** Text has no bounds the
  staging checker can see, so a label running off the edge is still found by
  looking. `labelParts` clamps to the safe area, which is prevention, not
  detection.
- **The series is not re-rendered by any test.** `check-film.mjs` is the
  cheap gate; the films themselves are rendered by hand.

---

## Phase 29 — the walk cycle — **done**

Every generated *and* traced character inherits `walk` for free, and it had
four faults, all of which were invisible in the numbers and obvious in a
frame.

**The character floated.** The hips rose by a flat 1.6% of height. With the
legs splayed at contact the feet have to reach `legLength * (1 - cos C)`
further down than they do at the passing position, so the planted foot never
touched the ground. The rise is now derived from the leg geometry, with zero
at the passing height -- which is also the rest height, so a cast member
staged on the ground stays on it.

**There was no `down` pose at all.** The only vertical extreme sat at
*passing*, so no weight was ever absorbed on the foot that had just landed.
The cycle now keys the real phases, twice per cycle: contact → down → passing
→ up.

**The feet were rigid.** The rig has had `footL`/`footR` since the first
generated character and the walk wrote neither, so there was no heel strike,
no roll and no toe-off. Both are keyed now, and the sign was established by
**rendering a frame**: canvas y grows downward, so a positive rotation points
the toe *down* and swings a limb *backward*. The first version had it
inverted, and the tests passed anyway.

**The arms swung the wrong way round.** The forearm offset was always positive
regardless of which way the shoulder was going, so the arm travelled ~50° back
and ~7° forward. People swing back nearly straight and bend coming forward.
The knee had the same fault: bent at the back of the stride, which is the
extended push-off position, so the trailing foot lifted early and the walk
limped.

| Area | State | Notes |
|---|---|---|
| Phases: contact / down / passing / up | **done** | Keyed as fractions of the cycle, which is what lets `cadence` retime the whole thing by scaling one number. |
| Foot roll | **done** | Heel strike toe-up, flat through the absorb, hardest plantarflexion at toe-off. |
| Lateral sway and pelvic tilt | **done** | `hips.x` over the stance foot, `hips.rot` toward the swinging leg. Small, and only visible in a front or three-quarter view. |
| Shoulder counter-rotation | **done** | Against the hips, as it always should have been. |
| `generate.walk.cadence` | **done** | `brisk` 0.75s/cycle (9 frames per step at 24), `natural` 1.0 (12), `casual` 1.25 (15), `weary` 1.6 (19), or a number. **Default stays 0.9**, so no existing film retimes itself. |
| `generate.walk.style: 'anime'` | **done** | Flattens the absorb and widens the arm swing. The geometric part of the rise is untouched, because flattening that would lift the feet off the ground again. |
| `walkStride(proportions, generate)` | **done** | How far one cycle actually carries the character: `4 * legLength * sin(C) * 0.92`, about 0.74x height. `walk` and `move` are independent in the compiler and nothing tied them together, so **every film in this repo slides its feet**; this is the number that closes it, and `walkTo()` in `scripts/lib/diagram.mjs` is the authoring side. |
| Tests | **done** | 16 in `test/core/walk.test.mjs`: phase order, two absorbs per cycle, foot roll and its sign, legs antiphase with no duplicated or missing keys, arms opposite the legs and bending on the forward swing, counter-rotation, cadence scaling, the unchanged default, the anime variant, and the ground-contact identity that stops the character hovering. |
| `demo/walk-check.json` | **done** | A profile figure on a ground line, one cycle. Grab it at 0, 0.1125, 0.225, 0.3375 to see the four key poses. Measurements cannot tell you a walk looks right. |

### Not done

- **Stance is symmetric with swing.** A real walk spends about 60% of the
  cycle in stance; this spends 50%. Visible only on a slow, heavy walk.
- **No run or jump cycle.** Only `walk`.
- **The stride assumes a flat ground line.** A character walking up the
  `hillside` template's slope still travels its flat-ground distance.

---

## Phase 28 — a resolution is a resolution — **done**

Found by watching a finished MP4, which is the only way it could have been
found.

**Rendering a 2D film at any size but the authored one CROPPED it.**
`Canvas2DBackend.viewMatrix` re-centred the camera on the *output* size and
never scaled by the ratio to the authored frame, so a 1280x720 film rendered
at 640x360 was a 640x360 **window onto the middle of the picture**, at 1:1
pixels. A character walking in from the left simply was not in the frame until
they reached the middle; the aspect looked wrong because the visible rectangle
was not the composed one.

Nothing caught it, and three things actively assumed the opposite:

- `docs/04-RENDER-EXPORT.md`: *"vector art is resolution-independent, so
  raising it is a config change, not a rebuild"* — and the whole fallback
  resolution ladder, 1280x720 → 960x540 → 1280x720@15 → 640x360.
- `WIDTH=`/`HEIGHT=` on `scripts/produce.mjs`, and `width`/`height` on
  `FilmStudio.render`.
- `test/e2e/render-film.mjs`, which renders the full 2880 frames at **160x90**
  as a proxy — *"same code path, 1/72 the pixels"*. It was not the same image.
  It had been sampling a 160x90 window onto the centre of the demo film for
  as long as it has existed, and its camera-liveness and digest checks were
  reading that window.

| Area | State | Notes |
|---|---|---|
| The camera carries its authored frame | **done** | `compile.js` puts `frameWidth`/`frameHeight` on the camera node. The backend is the only thing that knows the output size, and without this it cannot tell a large film rendered small from a small film rendered true. |
| `frameMatrix` fits authored → output | **done** | Uniform `min` of the two ratios, so a mismatched aspect **letterboxes rather than stretching anybody**, and the content is centred. |
| Screen-space nodes scale too | **done** | Subtitles, the background wash and the transition overlay skip the camera but are still authored in frame coordinates. A subtitle at `height - margin` otherwise sat off the bottom of every non-authored render. |
| No declared frame → unchanged | **done** | Hand-built scenes, the legacy path and existing tests get `fit = 1` and byte-identical behaviour. |
| `WIDTH=`/`HEIGHT=` on `grab2d` | **done** | There was no way to *look* at a non-authored render. Now there is, which is how this was confirmed fixed. |
| Tests | **done** | 7 in `test/core/resolution.test.mjs`, asserted on the **draw-call stream**: frame centre lands at output centre at 1280x720, 640x360, 1920x1080 and 160x90; a corner stays a corner instead of being cropped away; scale is uniform; a 9:16 film in a 16:9 output letterboxes; an undeclared frame is unchanged; subtitles scale. |

### Not done

- **Letterbox bars are not drawn.** A mismatched aspect leaves the canvas
  clear outside the fitted rect, which reads as the page behind it. Nobody
  needs it yet: every output so far matches its film's aspect.

---

## Phase 27 — MP4 export — **done**

The seam had been there since Phase 0 and nothing ever filled it.
`WebCodecsSink` could already negotiate `avc1.*` and AAC, pace nothing, apply
back-pressure and pre-encode audio — but `available()` returns false without a
`muxerFactory`, and **no caller in the repository had ever passed one**: not
`studio.js`, not `film.html`, not `scripts/produce.mjs`, not `mcp/server.js`.
So every render in the history of this repo took the paced MediaRecorder rung,
while `18-EDITOR-ARCHITECTURE.md` recorded MP4 as done. That line was wrong and
is now true.

| Area | State | Notes |
|---|---|---|
| `render/mux/boxes.js` | **done** | ISO-BMFF primitives: big-endian ints, 16.16 fixed point, `box`/`fullBox`, MPEG-4 descriptors with 7-bit continuation lengths. Hand-rolled, like `io/png.js` and `io/zip.js` — **no dependency, works offline.** |
| `render/mux/Mp4Muxer.js` | **done** | Progressive MP4. `avc1`+`avcC` from the encoder's own `decoderConfig`, `mp4a`+`esds`, and `stts`/`stsz`/`stsc`/`stco`/`stss` derived from the chunk timestamps rather than assumed from the frame rate. |
| **`moov` before `mdat`** (faststart) | **done** | Two layout passes: the chunk offsets depend on the size of the `moov` that holds them, and converge because every offset field is fixed width. A test asserts the file does not change size between passes. |
| `co64` promotion | **done** | Decided before layout, not during — promoting mid-pass would change `moov`'s size and the passes would never converge. |
| `ctts` when frames are reordered | **done** | Chrome's AVC encoder emits none today (measured), but writing nothing when it does would shuffle the film, so reordering is detected rather than assumed. |
| Default muxer in the ladder | **done** | `studio.js` installs `mp4MuxerFactory` unless a caller injects its own. `format: 'mp4' \| 'webm' \| 'auto'`. |
| Container-aware codec choice | **done** | `pickCodec` used to be willing to return `vp09` for an MP4 — legal in the box, undecodable on most phones. It is now filtered by container. |
| `format: 'mp4'` fails loudly | **done** | Asking for MP4 on a browser that cannot encode H.264 throws, rather than quietly handing back WebM with an MP4's expectations attached. |
| Surfaces | **done** | `FORMAT=` on `scripts/produce.mjs`, `format` on the MCP `render_film` tool, a format control in `film.html`. All three correct the file extension to what was *actually* encoded. |
| `produce.mjs` chunked readback | **done** | It was returning `data: [...bytes]` — every byte as a JSON number across the CDP boundary. Replaced with the same 4 MiB base64 pull `readFilmChunk` uses, and the readback length is asserted against the blob size. |
| `PngSequenceSink` exported | **done** | Implemented and tested since Phase 18 but missing from the export block, so no caller could reach it. |
| Tests | **done** | 27 in `test/core/mp4.test.mjs`, all by **parsing the bytes back** — box nesting, brands, sample counts, `stts` summing to the exact duration, `stco` offsets walked against `stsz`/`stsc` to confirm every chunk lands on a real sample boundary, `stss` key frames, the edit list, and byte-identical output across two muxings. `npm run test:av:mp4` proves it end to end and is in `test:all`. |

### Measured

| | |
|---|---|
| 23.2 s film at 640×360 | **5.2 s wall** — 4.5× faster than real time, against 1× paced |
| Reported duration | **23.208 s** against 23.208 s derived — exact |
| Sync click, MP4 | **0.000 s** (0.007 s on the paced WebM path) |
| 557-frame video track | 557000/24000 ticks — one `stts` entry, no drift |
| `avcC` from Chrome | 46 bytes |

### The defect this phase found, which only the sync probe could see

**AAC encoders prepend priming, and WebCodecs does not report how much.**
Measured on Chrome 156: **2112 samples, 44.0 ms at 48 kHz.** With the container
silent about it, the sync probe found the click at **0.044 s** — audio a full
frame late at 24 fps — and the test still passed, because its threshold was
0.15 s. Both halves of that are now fixed:

- `render/mux/aacPriming.js` **measures** the lead-in with one 40-frame
  encode/decode round trip, cached per configuration. It is measured rather
  than hard-coded because the number belongs to the encoder: a different
  Chrome, codec or platform may prime differently, and a stale constant would
  silently desynchronise every film. If it cannot be measured it returns 0 and
  no edit list is written — late audio beats no render.
- The muxer declares it as an `edts`/`elst` edit list on the audio track, which
  is the only place MP4 can say "start this many samples in". Click moved to
  **0.000 s**.
- The probe's threshold is now **0.02 s**, half a frame, so this cannot come
  back unnoticed.

A second, smaller disagreement came out of the same measurement: AAC rounds up
to whole 1024-sample frames and the encoder flushes a few more, so the audio
track ran 23.2747 s against the picture's 23.2083 s and the *file* claimed the
longer number. **The picture sets the length of the film** — a film that
disagrees with its own derived duration breaks the one invariant this format
has — so the audio edit is clamped to the video.

### Not done

- **Fragmented MP4 (DASH/HLS).** Not needed for file delivery; the sample
  tables would become `moof`/`traf` per fragment.
- **B-frame reordering is handled but untested against a real encoder**, because
  Chrome does not currently produce any. The `ctts` path is unit-tested with
  synthetic reordered input only.
- **No MP4 *demuxing*.** This writes files; it does not read them.

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
| `render/sinks` — MediaRecorder (paced), WebCodecs, Memory, PngSequence | **done** | Paced sink measured correct; WebCodecs now has a muxer (Phase 27) and is the default. |
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
- ~~**A paced render takes as long as the film** and needs the tab visible.~~
  Still true of the WebM path, but MP4 via WebCodecs is now the default and has
  neither constraint — see Phase 27.
- **A MediaRecorder WebM carries no Cues index, so it is not seekable.**
  Playback is fine and the duration is right, but `currentTime = t` silently
  does not move — a player scrubs badly, and anything verifying the file has to
  play it through rather than seek it. This was the strongest practical argument
  for wiring a muxer in, and Phase 27 did: an MP4's sample tables are an index by
  construction, so the default output is seekable.
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

---

## Phase 24 — constraints, IK, simulation and the post chain — **done**

Six of the seven items [§6 of the character
doc](14-CHARACTER-3D.md#6-the-ceiling-honestly) listed as missing, plus the
post-processing chain that was one pass wide. Auto-rigging an arbitrary
imported mesh and skin-weight painting stay **skipped by decision**: Mixamo
hands you a rigged character and retargeting is already wired, auto-rigging an
unknown mesh well is a research problem, and a bad auto-rig is worse than
none.

| Area | State | Notes |
|---|---|---|
| [`core/rig/IK3D.js`](../src/core/rig/IK3D.js) | **done** | Closed-form two-bone solve by the law of cosines. Pure, and exact: a reachable target is hit to within floating point, with both bones at their real lengths |
| [`core/rig/constraints.js`](../src/core/rig/constraints.js) | **done** | `lookAt`, `limitRotation`, `copyRotation`, `driven` and `ik`, validated and converted from degrees in core; applied against the scene graph in `SceneAdapter` |
| Eye convergence | **done** | A `lookAt` per eye at one target, limited to the socket. §6's "the eyes dart on an open loop" needed no new mechanism once `lookAt` existed |
| Correctives | **done** | Pose space deformation as `driven`: a joint's own angle widens the limb above it. On by default for every generated humanoid; `correctives: false` to opt out |
| Teeth, tongue and a mouth | **done** | A dental arch per jaw, a tongue, a back-side mouth bag — **and an aperture in the skull**, without which all three are sealed inside an opaque shell |
| Hair | **done** | A shell derived from `HEAD_PROFILE` with a researched hairline (highest at the temples, down to the nape at the back), not a sphere |
| Subsurface scattering | *partial* | `physical: true` opens `MeshPhysicalMaterial`: sheen for the velvet rim skin has at a grazing angle, `transmission`/`thickness` for the ears and the nose. An approximation, and the one every real-time renderer shipped before compute shaders |
| [`core/sim/cloth.js`](../src/core/sim/cloth.js) | **done** | Position-based dynamics — Verlet plus distance-constraint relaxation. Structural, shear and bend links, sphere colliders, a floor, and a fixed 1/120 substep so the drape does not change with the frame rate |
| [`core/sim/fluid.js`](../src/core/sim/fluid.js) | **done** | Stam's stable fluids in 2D, with a buoyancy term. Renders as a card through the existing `CanvasTexture` path |
| [`core/script/post.js`](../src/core/script/post.js) + [`render/post3d.js`](../src/render/post3d.js) | **done** | SSAO, bloom, defocus, grade and SMAA, ordered by the module rather than by the call site, always ending in `OutputPass` |
| [`render/gradeShader.js`](../src/render/gradeShader.js) | **done** | Exposure, white balance, lift/gamma/gain, contrast, saturation, vignette, film grain and lateral chromatic aberration in one pass. Shared with the legacy editor through `THREE.GradeShader` |
| `targets`, `cloth`, `fluids`, `constraints` in the film script | **done** | And **no new verb**: a target is a node, `move` animates a node, a constraint reads one |
| Tests | **done** | 40 new unit tests across `rig3d`, `sim`, `post`, `character3d` and `film3d`. Total now **527** |
| Live test | **done** | [`demo/rig3d.json`](../demo/rig3d.json) — IK reach, eye convergence, a simulated cape, a smoke plume and the five-pass chain, rendered at 41 ms/frame |

### What the live test found

Four defects, three of which only a rendered frame could catch.

| Defect | Cause |
|---|---|
| **The forearm tracked the IK target and the upper arm stayed in its bind pose** | `aim()` was handed the same scratch `Vector3` it begins by overwriting with `getWorldPosition`, so the direction came out zero and the bone silently did not move. It now takes three numbers, which makes the whole class unexpressible |
| **A forearm bent to 96° from frame one**, three shots before the action that bends it | `restVec` returned `null` for a channel the node does not carry, and a bone node carries only `at`. With nothing to seed from, `turn` wrote a single key at its END time — and a track reads as its first key at every earlier time. A bone's rest rotation **is** identity, so the default is now `[0, 0, 0]`. Same trap as Phase 14's fourteen bullet craters |
| **Teeth and a tongue that could not be seen at any jaw angle** | The generated skull is a closed shell. Opening the jaw lengthened the face and revealed nothing. Needed an aperture, a mouth bag behind it, and the jaw re-weighted to carry the lower LIP rather than only the chin |
| **Every grab and every staging check sampled a simulation it had itself reset** | A cloth and a fluid are functions of the frames before them; jumping straight to t=4 showed a cape at its rest shape and an empty fluid. Grabs now replay from zero at the film's own frame rate, which is exactly what the offline renderer does |

And one that was never a defect in a render because nothing ever rendered it:
the legacy editor imported `OutputPass` and never added it to a composer, so
switching bloom on also changed the exposure and the gamma of the whole frame.

### Known, and left

- A corrective's girth scale sits above an IK chain, and three composes
  non-uniform scale with the rotation below it, so an IK target is missed by
  **under a centimetre** on a 1.8 m figure. `correctives: false` removes it.
- A bone's roll under IK is whatever `setFromUnitVectors` gives, since that
  returns the shortest rotation. The hand's aim is exact; the twist of the
  palm on the end of it is not. A `copyRotation` on the hand is the lazy fix.
- Cloth and fluid restart from rest on a **rewind**, so scrubbing backwards
  shows a cold start. A forward render — which is every offline render — never
  takes that branch, so frame N stays a pure function of the frame sequence.
- The character's own clothing is still an inflated body. `cloth` is for the
  pieces whose job is to move: a cape, a flag, a curtain.
- Fluid is a **card**. Volumetric smoke and free-surface liquid are a
  different project.
- A speckled band at the waist, where the jacket's and the trouser's inflated
  caps meet at the spine, predates this phase and is still there.

527 unit tests pass.

---

## Phase 25 — hands and fingers — **done**

Both paths stopped at the wrist. The 3D rig had one `fingers` leaf bone and a
flat slab; the 2D cutout had a single mitten path. Neither could point, grip,
wave or count, and a hand is the second thing an audience looks at.

| Area | State | Notes |
|---|---|---|
| [`core/art/hands.js`](../src/core/art/hands.js) | **done** | The half both paths share: which digits exist, their proportions as fractions of hand length, and eight named grips. Pure data and arithmetic |
| 3D hand rig | **done** | Twenty bones per hand — five digits of three phalanges plus a tip — and fifteen swept segments. The skeleton is 65 bones |
| 3D `grip` verb | **done** | Curl on `rotation.x`, splay on `.z`, the thumb's opposition on `.y`. Through `writeScalar`, so easing, anticipation and overshoot come free |
| 2D hand cutouts | **done** | Three detail levels: `none` (the old mitten), `mitten` (palm, thumb, one four-finger mitt — the default, and how a Toon Boom rig is built), `fingers` (four separate digits) |
| 2D `grip` verb | **done** | Same pose table. It writes onto whichever parts exist, so a film written for one detail level plays at the other |
| 2D finger IK | **done** | Free: digit pivots are real joints, so `chainFromParts` extracts a finger chain and `reach` solves it |
| The relaxed bind pose | **done** | The resting curl is baked into the bone directions rather than keyed, so a character who never mentions their hands still has hands — at a cost of zero keyframes |
| [`scripts/grab2d.mjs`](../scripts/grab2d.mjs) | **done** | `npm run grab2d`. The 3D path has had `GRAB=` since the AK-47 test; the 2D path had no way to look at a frame at all |
| Tests | **done** | 25 new, including the proportion rules — a hand of the wrong SHAPE passes every structural test ever written. Total now **552** |

### What the live test found

Eight, six of which only a rendered frame could catch.

| Defect | Cause |
|---|---|
| **Every tube in the engine ended in a small open hole** | The cap was three rings at 22%, 62% and 88% of the radius, all at the *same* t — a flat disc, not the dome the comment beside it had claimed since the day it was written, and nothing closed the innermost ring. Invisible at limb scale, a black pinhole at each of thirty fingertips |
| **Closing it did not make it go away** | Both new cap fans were wound inward, and an inward triangle is backface-culled |
| **Fingers came apart into rows of sausages** | Butt-jointed capsules pull apart the moment a joint bends, and three joints at 76° is not a shallow elbow |
| **A kink in every thumb** | Splay was applied to the first bone only and the two below it reverted to straight down. The thumb is the one digit splayed far enough to show it |
| **The sleeve swallowed the wrist** | An 18 mm inflation on a 30 mm wrist is a 96 mm cuff. `until: 1` on the suit's arm layer had been dead config, read by nothing, since it was written |
| **The palm tapered the wrong way** | 84 mm at the wrist down to 64 at the knuckles — a paddle. A hand widens toward the knuckles |
| **The 2D knuckle line was inverted** | In the 3D table y runs up and negative is down the hand; converting to a cutout's y-down frame flips the sign, and getting it backwards set the short fingers LOWER than the long ones |
| **A front-facing 2D fist bent the wrist sideways** | Face on, a curling finger barely rotates in the picture plane — it foreshortens. The curl is now split between `rot` and `sy` by the character's view |

Two fixes landed outside the hand. The dome closed the speckled band at the
waist, where the jacket's and the trouser's flat cap discs met at the spine
and z-fought. And `test:av` had been failing on a clean checkout: `film.html`
reloads itself once on a first visit so the service worker's
cross-origin-isolation headers apply, which destroys the execution context
under a running `evaluate`, and puppeteer gets a fresh profile every run. It
retries once now.

552 unit tests pass.

---

## Phase 26 — bring your own assets — **done**

Two routes in, one per path, both usable by a person at a browser and by an
agent with no browser at all. Full detail in [20-IMPORT.md](20-IMPORT.md).

| Area | State | Notes |
|---|---|---|
| [`core/trace/image.js`](../src/core/trace/image.js) | **done** | Corner-flood matte, enclosed-hole clearing, connected components, Moore boundary walk, Douglas–Peucker. No segmentation model, no new dependency |
| [`core/trace/rig.js`](../src/core/trace/rig.js) | **done** | Silhouette analysis: the neck as a dip in the width profile, the shoulders as the rise out of it, the crotch where the figure stops being two legs, and the arms by colour where the outline has no gap |
| A traced character | **done** | Image crops of one upload with a pivot at each joint — the `{kind:'image'}` sprite-atlas path, so no new rendering code. Named like the generated rig, so `idle`/`walk`/`reach`/`grip`/`pose` all work on it unchanged |
| `ax`/`ay` on an image shape | **done** | The anchor inside a crop. Without it an image turns about its corner or its centre, and a head nodding about its own middle comes off at the chin |
| Upload in `film.html` | **done** | Trace, matte, cast and play `idle`, in one pick. The matted pixels go into the film, not the file |
| [`core/io/gltf.js`](../src/core/io/gltf.js) | **done** | Reads a glTF container's table of contents with no renderer: node names, animations, skins, and the extensions that need a decoder the engine does not ship |
| `models` + `cast.model` | **done** | `.glb`, `.gltf`, `.fbx`. Cloned through `SkeletonUtils` when cast twice. Every named node addressable as `<cast>/<node>` |
| Imported animations | **done** | Converted through `clipToTracks` **before** compiling, so the compiler can name the clips a file does have when a film asks for one it does not — and so imported animation is evaluated by the same code as hand-keyed animation |
| `meta.environment` | **done** | HDR image-based lighting. Parsed since Phase 14 and read by nothing until now |
| Ops: `trace_character`, `model_fetch`, `model_inspect` | **done** | The agent surface. 25 ops total |
| Tests | **done** | 31 new. Total now **583** |

### Defects this found

Four, three of them old.

| Defect | Cause |
|---|---|
| **Every 2D film with no camera was framed half a frame off** | Camera coordinates are OFFSETS from the centre (`centre.x + start.x`), and the no-camera default was `centre` — so it keyed the camera to (width, height) and the whole scene drew up and to the left by half a frame. Films that DO declare a camera were unaffected, which is why it survived: the demo declares one in its first shot |
| **`film.html` never loaded a declared image asset** | `prepare` skipped loading entirely when the caller passed any `assets` map, and the page passes one it fills with uploads — which starts as `{}` and is therefore always truthy. Every film opened there declared its images, validated clean and drew none of them. It merges now |
| **A traced character could be rigged and still refuse to walk** | The free cycles were gated on `char.generate`, and a traced character carries `proportions` and no `generate`. `play` now also says which actions a character *does* have |
| **The legs were read from beside the hands** | The first split row below the crotch still has the hands either side of it, so taking the outermost two runs made the hands into legs. Read from forty percent down the legs instead |

Two of the trace's own rules were wrong first and found by looking at a
rendered figure: the neck was sought as the narrowest row below the widest in
the top third, which finds the torso on anything but a big-headed figure with
its arms down; and the fallback jump rule fired on the second row of the
scalp, where a head is two pixels across.

### Hardened after the fact

All four fixes landed in the same commit that found them, which means none of
them had a test that would have caught the defect. They have one each now,
and each was checked by reverting the fix and watching the test fail:

| Fix | What now guards it |
|---|---|
| The camera default | A film with no camera must key `(w/2, h/2)` |
| `prepare` merging assets | `pendingImageAssets` is the rule, pure and tested, and `prepare` itself is tested against a stub provider -- the rule alone would not have caught where the bug actually lived |
| Cycles on a traced character | A traced character compiles, casts and walks |
| The leg split | A stray mark on one probe row cannot move it |

Two of them were also widened, because the original fix closed one instance
of a defect and not its class:

- **An asset with no `kind` at all** is now a diagnostic. Both loaders filter
  on `kind`, so an asset without one was declared, passed every check, was
  never fetched and drew nothing -- the same silence as the `prepare` bug,
  by a different route.
- **The leg split is a median of three rows**, not a read of one. One row can
  land on a shadow, a prop or a tear in the matte; an artifact now has to
  appear in two of the three samples to move anything. Runs that do not
  overlap the torso core are dropped first, because whatever a leg is, it is
  under the body.

588 unit tests pass.
