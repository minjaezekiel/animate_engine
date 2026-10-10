# Performance: Rust, WebAssembly, and what the browser actually gives you

**Status:** the kernel layer is built, tested and measured. The GPU path is
scoped here and **not built**. Everything below marked *measured* was run on
this machine; re-run it with `npm run probe`, `npm run bench:kernels` and
`npm run audit:deps`.

---

## 1. Correcting the premise

The idea that prompted this work was that "a part of the browser supports
Rust built-in engines that offer 3D support". That is half right, and the
half that is wrong matters, because it points at a mechanism that does not
exist.

**What is true:** browsers really are shipping Rust for graphics. Firefox's
WebGPU implementation *is* `wgpu`, a Rust crate. Chrome's is Dawn, which is
C++. So there is Rust rendering code inside the browser.

**What is not true:** none of it is reachable from a page. There is no API
that hands you the browser's internal engine, and no way to run your Rust
inside it.

The two mechanisms that do exist, and that this engine now uses, are:

| Mechanism | What it is | Where it helps |
|---|---|---|
| **WebGPU** | The browser's modern GPU API, which those engines implement. Includes **compute shaders** in WGSL. | Data-parallel per-pixel and per-vertex work. Thousands of threads. |
| **Rust → WebAssembly** | *Our* Rust, compiled to wasm, running in the JS engine with SIMD. | CPU numeric work, and anything that must be deterministic. |

So the instinct was right and the route was wrong. Rust helps here because
*we* compile it, not because the browser lends us its own.

---

## 2. Measured browser capability

`npm run probe`, headless Chrome 154 on macOS:

| | |
|---|---|
| WebGPU | **present**, adapter acquired, **a compute shader ran and returned the correct value** |
| WebGPU limits | 1024 invocations/workgroup, 2 GB max buffer, `subgroups` available |
| wasm `simd128` | **yes** |
| wasm bulk memory | yes |
| `SharedArrayBuffer` | **no** — so no wasm threads without COOP/COEP headers |
| WebCodecs | yes — VP9, H.264 **and** AV1 all supported |
| WebGL2 / OffscreenCanvas | yes |
| cores | 6 |

### Two false readings this probe produced first

Both are worth recording, because each would have sent the design the wrong
way, and neither announced itself as a measurement error.

1. **`navigator.gpu` and `VideoEncoder` are secure-context-only.** Probed
   from `about:blank` they read as *absent*, on a browser that supports both
   perfectly. The first run of the probe concluded "no WebGPU, no
   WebCodecs" and nearly settled the architecture on that basis. The probe
   now serves itself a page over `localhost` and asserts
   `window.isSecureContext` before believing anything.

2. **Cargo discovers `.cargo/config.toml` from the working directory, not
   from `--manifest-path`.** Building the crate from the repository root
   silently dropped `-C target-feature=+simd128`. The build succeeded and
   produced a scalar module whose only symptom was `has_simd()` returning
   0. `scripts/build-wasm.mjs` now runs cargo with `cwd` set to the crate
   and **refuses to embed a module that reports no SIMD.**

---

## 3. Measured kernel performance

`npm run bench:kernels`. Each workload is sized to something the engine
actually does per frame.

| kernel | wasm | JS | speedup |
|---|---|---|---|
| `skin` 20k verts / 64 bones | 0.36 ms | 1.72 ms | **4.8×** |
| `morph` 6k verts / 24 shapes, 3 active | 0.03 ms | 0.20 ms | **6.1×** |
| `morph` 6k verts / 24 shapes, all active | 0.07 ms | 1.34 ms | **18.1×** |
| `normals` 20k verts / 40k tris | 0.32 ms | 1.30 ms | **4.0×** |
| `smooth` 20k verts, 1 iteration | 0.20 ms | 0.88 ms | **4.5×** |
| `compositeMask` 1080p | 4.73 ms | 30.44 ms | **6.4×** |
| `stampMask` 600 stamps r24 @1080p | 6.04 ms | 9.66 ms | 1.6× |
| `warpMesh` 1080p, 32×32 grid | **87.7 ms** | 120.6 ms | 1.4× |
| `blurRgba` 1080p radius 16 | **97.2 ms** | 259.1 ms | 2.7× |
| `blurRgba` quarter-res radius 4 | **1.63 ms** | 14.84 ms | **9.1×** |

The 24 fps frame budget is **41.67 ms**.

### The governing rule this produced

> **Cost that scales with vertices belongs in wasm. Cost that scales with
> full-resolution pixels does not fit a frame in either backend.**

Per-vertex kernels land between 4× and 18× faster and are three orders of
magnitude inside the budget. The two full-frame per-pixel kernels are over
budget *in wasm* — twice over, for `blur`.

And the reason is not compute. A 1080p RGBA f32 buffer is 33 MB; a blur is
six passes reading and writing it, so 398 MB of traffic, and 97 ms of that
is **4.0 GB/s** — which is simply what a single-threaded strided sweep gets.
Three attempts confirmed it:

| variant | time |
|---|---|
| raw pointers | 98 ms |
| checked slice indexing | 143 ms |
| slices + `get_unchecked` + reciprocal table | 100 ms |

Giving LLVM the `noalias` guarantee did nothing. Removing a per-pixel float
divide did nothing. Neither was the constraint, and **no amount of SIMD
addresses a bandwidth limit.**

The fix was at the call site, and it is the one every real-time renderer
already uses: **blur a downsampled copy.** Quarter resolution touches a
sixteenth of the pixels, measures **1.63 ms instead of 97 ms — a 60×
reduction** — and for a glow or a depth-map smooth is visually identical,
because destroying detail is the entire point of the operation.

`stampMask`'s weak 1.6× has a different and benign cause: it is already
bounding-box limited, so it touches ~1,200 pixels for a 20px brush on a 4K
canvas rather than the whole canvas. There is little there to speed up.

### What this means for the GPU path

Full-frame resampling at 24 fps needs ~50M pixel-samples/second. wasm
delivers roughly 22M. WebGPU compute delivers billions, and is **measured
available in the headless render pipeline**, which is the surprising and
useful part — it is not limited to the interactive studio.

So `warpMesh` at full resolution is the first real candidate for a compute
shader, and the architecture already allows it: see §6.

---

## 4. Architecture of the kernel layer

```
src/kernels/index.js        loadKernels() -> one API, two backends
  js/{deform,raster,warp}.js    reference implementations, and the fallback
  wasm/loader.js                instantiate + linear-memory views
  wasm/module.js                GENERATED: the wasm, base64-embedded
  adjacency.js                  CSR graph builder (pure JS, shared)

rust/jirex-kernels/         zero dependencies, no bindgen
  src/deform.rs                 skin, morph, normals, smooth
  src/raster.rs                 stamp_mask, composite_mask, mask_to_rgba8
  src/warp.rs                   warp_mesh, blur_rgba
```

### What counts as a kernel

A kernel is a **batch transform over flat numeric arrays** with no
scene-graph knowledge, no per-call allocation, and no state between calls.

The rule that falls out: **if the cost scales with vertices or pixels it is
a kernel; if it scales with control points or bones it is not.** So
resampling a stroke into stamps stays in JS — it is a few hundred points,
and it is where brush *feel* lives, so it should be readable and tunable.
Composing a skinning palette stays in JS — that is per-bone, not per-vertex,
and it belongs where the scene graph is.

### Three decisions worth defending

**No wasm-bindgen.** Every export takes `i32` offsets into linear memory
plus counts. The arguments are already contiguous `f32` buffers, so bindgen
would add an npm toolchain, a generated glue module, and a copy in each
direction, for nothing. The module's import list is **empty**, verified at
build time — no WASI, no host functions, no glue. It runs under
`WebAssembly.instantiate(bytes)` with no import object, in any browser and
in Node.

**The wasm is embedded as base64, not fetched.** 21 KB becomes 28 KB, which
against any real asset here is noise, and it removes an entire class of
deployment failure that all presents as "the fast path silently never
loaded": a wrong path under a bundler or sub-path deploy, a server not
sending `Content-Type: application/wasm`, a page opened from `file://`, CORS
on a cross-origin CDN build. A caller who prefers to fetch can still pass
`loadKernels({ wasmBytes })`.

**Buffers are explicit and long-lived.** `K.f32(n)` returns a handle, not a
copy, and the same handle is passed to every call. A 1080p f32 paint buffer
is 33 MB; copying it per call would cost more than the kernel saves.

`Buf.array` re-derives its view every access, and that is load-bearing:
`memory.grow` **allocates a new `ArrayBuffer` and detaches the old one**, so
any cached `Float32Array` becomes zero-length. Code that caches a view at
allocation time works perfectly until the heap first expands and then reads
zeros with no error anywhere. `test/core/kernels.test.mjs` forces a 64 MB
allocation and asserts an earlier buffer survives.

---

## 5. Determinism, in three tiers

The engine's contract is that **frame N is a pure function of N**. The three
backends do not support it equally, and conflating them would quietly break
the golden hashes.

| | reproducible across machines? | may feed keys and hashes? |
|---|---|---|
| **wasm** | **yes** — IEEE-754, no reassociation, no FMA substitution | yes |
| **JS** | yes across JS engines, but **not bit-identical to wasm** | yes, if the backend is recorded |
| **GPU** | **no** — not even across devices of one vendor | **no**: display and authoring-time bakes only |

The JS caveat is not a defect and is worth stating precisely: **JavaScript
has no `f32` arithmetic.** Values read from a `Float32Array` widen to `f64`,
every operation runs at double precision, and rounding back to single
happens only on store. So the JS path carries more intermediate precision
and is marginally *more* accurate. Matching exactly would mean wrapping
every operation in `Math.fround`, which costs more than the kernel saves.

Therefore: the two are **numerically equivalent, not identical**, the tests
assert agreement to a tolerance, and anything taking a golden hash over
kernel output must record `K.backend` beside it. This is consistent with the
contract already in `STATUS.md`, where scene state and draw calls are the
asserted invariants and exact pixels are not.

One rule follows and is easy to violate by accident: **a SIMD path and its
scalar fallback must reduce in the same order.** Floating-point addition is
not associative, so summing four lanes and combining differs in the last bit
from summing in sequence. `skin` deliberately leaves its four influences
scalar for this reason.

---

## 6. Dependency policy

`npm run audit:deps` loads every browser-facing dependency in a real
browser over a secure origin and runs a smoke check against it. The engine
ships as static ES modules with no bundler, so its true dependency list is
not `package.json` — it is whatever the import maps name. **Those two drift:
`package.json` declared `three@^0.128.0` as a peer while every page actually
imported r169.** The audit found it; it now says `^0.169.0`.

Current state — **9 checked, 9 ok**:

| dependency | required | why |
|---|---|---|
| `src/kernels` (in-tree) | yes | deform, paint, image. **0 deps, 0 wasm imports** |
| `three@0.169.0` | yes | 3D scene graph and renderer |
| `three/addons` BufferGeometryUtils | yes | `mergeGeometries` |
| `three/addons` SkeletonUtils | no | the only clone that preserves a skeleton |
| `three/addons` GLTFExporter | no | serialising imported models properly |
| `three/addons` FBXLoader | no | Mixamo; drags in fflate + NURBS |
| `onnxruntime-web@1.18.0` | no | inference under the TTS voices |
| `@diffusionstudio/vits-web@1.0.3` | no | in-browser Piper/VITS speech |
| `cannon.js@0.6.2` | no | rigid bodies, legacy editor only |

The standing rule: **anything on this list must work in a browser with no
build step, or be replaced by something in-tree.** `src/kernels` is the
model — zero dependencies, and its wasm embedded rather than fetched
precisely so there is nothing left to misconfigure.

`required: false` means the engine degrades past it rather than needing it.
A failure of a required dependency exits non-zero; an offline machine
reports `unreachable` and does not fail the build.

### Building the wasm

`npm run build:wasm` needs a Rust toolchain and the `wasm32-unknown-unknown`
target. **`src/kernels/wasm/module.js` is generated but committed**, so
users, CI and `npm install` need no Rust at all — only someone changing the
crate does. The loader checks `abi_version()` and falls back to JS rather
than calling a stale module with a shifted argument list.

---

## 7. Register of missing tools

Measured and documented, not built. Ordered by what blocks the most.

### 7.1 The GPU compute path — *next*

Justified by §3: full-resolution per-pixel work does not fit a frame on the
CPU, and WebGPU compute is measured working in the headless pipeline.

- WGSL compute ports of `warp_mesh` and `blur_rgba`.
- A third backend behind the same `Kernels` API, so call sites do not change.
- **Must not feed keys or hashes** (§5). Display and authoring bakes only.
- Blocked on nothing. The limits probe already reports what it needs.

### 7.2 Drawing and painting tools

The kernels exist (`stamp_mask`, `composite_mask`, `mask_to_rgba8`); the
authoring layer above them does not.

- **Stroke model** — polyline with pressure, tilt and velocity; arc-length
  resampling to stamp spacing. Pure, deterministic, frame-N-exact, so a
  **draw-on animation renders frame N by stamping the first N-worth of the
  stroke** and needs no history buffer.
- **Brush library** — pencil, hard pen, tapered ink, marker, airbrush,
  charcoal, eraser. Each a declarative spec over the two accumulation modes
  the kernel already has: peak for pen-like brushes, build-up for airbrush.
- **Not yet designed:** textured/stamp-image brushes, dual brushes, wet
  media and colour mixing, stabilisation, vector-first strokes with
  editable control points.

### 7.3 Motion graphics: a picture into a video

`warp_mesh` is the whole engine for this; the layer above is missing.

- **2.5D parallax** — grid over the photo, vertices displaced by depth ×
  camera offset. Needs a monocular depth estimate; `onnxruntime-web` is
  already a verified dependency, so a small depth model is the natural fit.
- **Depth maps must be blurred before they displace anything** — parallax
  tears along any one-pixel depth discontinuity. At quarter resolution that
  is 1.6 ms (§3).
- **Puppet warp** — pinned and driven vertices over the same rasteriser.
- **Not yet designed:** segmentation into layers, inpainting what parallax
  reveals behind the subject, camera-path authoring UI.

### 7.4 Sculpting and modelling

Named in `14-CHARACTER-3D.md` §6 as the single largest gap, and still is.
A face is currently primitives positioned by typing numbers, rendering, and
looking.

- `smooth` plus `buildAdjacency` replace the legacy proximity-based
  smoothing, which was O(n²) **and wrong**: proximity is not connectivity,
  so it welded unconnected surfaces that happened to be near each other —
  the same non-convexity that broke distance-based skin weighting in
  Phase 16.
- **Not yet built:** grab/inflate/pinch/flatten brushes over the same
  adjacency, dynamic topology, subdivision, CSG, UVs, a viewport with vertex
  selection and symmetry.

### 7.5 Carried forward, still open

From `STATUS.md` and `14-CHARACTER-3D.md`: UVs and textures on the body;
subsurface scattering; hair; cloth simulation; correctives driven by joint
angle; IK in 3D; teeth and tongue; eye convergence; ambient occlusion and
contact shadows; painted weight groups; lipsync coarticulation. 2D: Spine
or Moho-style deformation, elongated smears, spring secondary motion,
per-pose z, hit-stop. (wasm threads are now built -- see §9.)

---

## 8. Commands

```bash
npm run probe           # what this browser supports, measured
npm run build:wasm      # compile Rust -> wasm, embed, verify no imports + simd
npm run test:kernels    # 59 tests: integrity, conformance, maths
npm run bench:kernels   # the table in §3
npm run audit:deps      # load every browser dependency and smoke-test it
npm test                # everything, 272 tests
```


---

## 9. The worker pool: wasm threads over one shared memory

**Built and measured.** `src/kernels/parallel.js`, `scripts/serve.mjs`.

§3 established that full-resolution per-pixel kernels miss the frame budget
and that the cause is memory bandwidth, which SIMD cannot address. More
cores can, because each brings its own share of bandwidth — so a worker
pool was the cheaper lever than porting kernels to WGSL. It reuses the
kernels unchanged and keeps the determinism guarantee the GPU cannot offer.

### Measured

`npm run bench:kernels`, 11 workers:

| kernel | 1 thread | pooled | speedup | budget |
|---|---|---|---|---|
| `warpMesh` 1080p, 32×32 grid | 90.8 ms | **18.1 ms** | **5.01×** | over → **ok** |
| `blurRgba` 1080p radius 16 | 100.0 ms | **36.3 ms** | 2.76× | over → **ok** |
| `stampMask` 600 stamps @1080p | 6.9 ms | 1.6 ms | 4.29× | ok |
| `compositeMask` 1080p | 5.8 ms | 3.0 ms | 1.96× | ok |

**Both kernels that missed the budget now fit it.** `warpMesh` hits 5.01×,
essentially linear. `blurRgba` gets 2.76× rather than 5× for two reasons
that are both inherent: it is the most bandwidth-bound kernel here, so
extra cores contend on the same memory bus, and a full blur is **six
barriered passes**, so it pays 6 × *workers* round trips of dispatch where
`warpMesh` pays one.

`compositeMask`'s 1.96× is the same bandwidth story at a size that was
already comfortable. Below `minPixels` (64k pixels by default) the pool
runs the kernel inline, because a round trip is ~100 µs and a small buffer
genuinely comes out slower in parallel.

### How it works, and the three things that would silently break it

Every worker instantiates **the same module against the same
`WebAssembly.Memory({shared: true})`**, so a pointer means the same bytes
everywhere and **no pixel is ever copied between threads**. The obvious
alternative — a worker per band with its own memory, staged through a
`SharedArrayBuffer` — costs two copies of the buffer per pass, which for a
blur would roughly double the very traffic that is already the bottleneck.

1. **Only the main thread allocates.** One allocator, one caller, no
   question of lock contention or reentrancy. Workers receive pointers.
   Every kernel is allocation-free by construction to make this hold, which
   is why `blur` has a `MAX_BLUR_RADIUS` and a stack-allocated reciprocal
   table instead of a `Vec`.

2. **Each worker gets its own stack.** Instances share a linear memory but
   each initialises `__stack_pointer` from module data — to the *same*
   address. Without relocation every worker's call frames overlap. The
   corruption is silent, timing-dependent and effectively undebuggable, so
   the module exports `__stack_pointer` and the pool moves each worker's
   before any kernel runs.

3. **Passes are barriered.** Within one blur pass rows (or columns) are
   independent; *between* passes they are not, since a vertical pass reads
   what the horizontal pass wrote across rows. Omitting a barrier does not
   crash — it produces a subtly wrong result that varies with worker
   timing, which is the worst failure mode available. Each horizontal pass
   splits by rows and each vertical by columns, i.e. along the axis that
   pass does not read across, so **no band needs a halo and the pooled
   result is bit-identical to the serial one** rather than approximately
   equal. The tests assert exactly that.

### Why `+atomics` needs nightly, and why that is optional

Shared memory requires the `atomics` target feature, which is still
unstable, so `core` and `alloc` must be rebuilt with it via `-Z build-std`.
Three flags follow: `--import-memory --shared-memory` so the host supplies
the memory, and `--export=__stack_pointer` for (2) above. `+atomics` also
makes the linker emit data segments as **passive**, initialised once behind
an atomic guard — which is what makes instantiating one module N times safe.

That is a heavier toolchain than the rest of the repo needs, so the
multi-threaded build is **optional**: `npm run build:wasm` skips it with an
explanation when nightly or `rust-src` is absent, and the committed
`module-mt.js` is left alone. A machine without nightly loses parallelism
and nothing else.

### The headers, and the CDN question

`SharedArrayBuffer` needs the document **cross-origin isolated**, which
needs two response headers that no plain static server sends — so
`npm run serve` is now `scripts/serve.mjs` (Node stdlib only, no
dependencies) instead of `python3 -m http.server`.

The expectation was that `COEP: require-corp` would block the CDN
dependencies and trade a worker pool for broken 3D and silent voices.
**Measured, it does not:** jsDelivr and cdnjs both send
`cross-origin-resource-policy: cross-origin`, and all four dependencies
load in an isolated document under both COEP values.
`test/e2e/kernels-browser.mjs` runs the full check in each mode.

| | isolates | cross-origin assets without CORP | Safari |
|---|---|---|---|
| `credentialless` *(default)* | yes | **load** | **not isolated** |
| `require-corp` | yes | blocked | isolated |

The default is `credentialless` because an animation tool handles arbitrary
user-supplied assets, and an image on an origin that has never heard of
CORP would be blocked by the stricter value. The known dependencies are
fine either way; unknown future ones are not. The cost is Safari, which
does not implement `credentialless` and so stays un-isolated —
`COEP=require-corp npm run serve` is the right choice for a deploy that
needs Safari and controls its own assets.

Either way `loadParallelKernels` returns `null` rather than throwing when
isolation is absent, so the fallback is one line and the degradation is
slower, never broken.

### Where this leaves the GPU path

Less urgent than §7.1 claimed. Both over-budget kernels now fit a frame on
the CPU, with determinism intact. The GPU remains the right answer for work
that is an order of magnitude larger — 4K, real-time interactive painting,
or per-pixel simulation — and for nothing that feeds a key or a hash.

### Commands

```bash
npm run serve                   # dev server with COOP/COEP
COEP=require-corp npm run serve # the stricter value, for Safari
npm run test:parallel           # 12 tests: bit-identity with serial, bands, barriers
npm run test:kernels:browser    # the pool and all CDN deps, in a real browser, both modes
```
