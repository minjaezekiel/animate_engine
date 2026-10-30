# Status — implemented vs not

**Rule: a phase is not done until this file is updated in the same commit.**

Last updated: 2026-10-30 (Phase 27: **MP4 export** — an ISO-BMFF muxer behind the `WebCodecsSink` seam that nothing had ever filled, so H.264/AAC is now the default container and renders run faster than real time. Phase 26: bring your own assets — trace a 2D character out of an uploaded image, import 3D models and HDR environments; both reachable headless by an agent. Phase 25: hands and fingers on both paths — twenty bones per hand in 3D, three detail levels of cutout hand in 2D, and one `grip` pose table shared by both. Phase 24: bone constraints, 3D IK, correctives, teeth, hair, cloth and fluid simulation, and the full post chain).

Legend: **done** · *partial* · — not started

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
