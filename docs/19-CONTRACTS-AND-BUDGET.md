# Silent defaults: four defects, one shape, and why none of them is Rust

**Status: built.** `src/core/scene/Scene.js`, `src/core/script/budget.js`,
`src/core/script/staging.js`, `src/core/script/compile.js`.
Tests: `npm run test:budget`.

Directing one film through the engine turned up four defects. They look
unrelated — a scene-graph bug, a checker false-positive, a render-budget
blowout and a check that never ran. They are the same defect four times.

| | the silent default |
|---|---|
| `Scene.add` | accepted `spec.parentId` and **ignored it** |
| `analyseStaging` | assumed **every cast member has feet** |
| the render loop | absorbed **any per-frame cost**, discovering the limit at the encoder |
| `analyseStaging` again | read a **different film** than the compiler built from |

Each is a place the system took something plausible and quietly did
something else. Not one is a throughput problem, and the fix for all four
is the same: make the silence impossible to express — **refuse, declare, or
measure.**

---

## 1. The language question, answered with measurements

The honest answer is that it only applies to one of the four, and for that
one it is **already settled and already insufficient**.

Three of the four are API contracts in pure control flow. They cost
nothing, they run in both Node and the browser, and their entire output is
*diagnostic text an author or an agent reads*. Moving them to Rust would
add a wasm boundary in the middle of the compiler, make the error messages
harder to produce, and buy zero microseconds. That is not a close call.

The fourth — the frame budget — is a real performance problem. So:

```
1400x820 photo warp, wasm kernels, single thread
  warp_mesh                        55.46 ms   48.3 ns/px
  f32 -> u8 conversion             18.18 ms   15.8 ns/px
  vertex solve (JS)                 0.10 ms
  ------------------------------------------
  total                            73.26 ms
  the same film without it          0.70 ms
```

**The expensive part is already Rust.** 48 ns per pixel for a
bilinear-sampled textured triangle raster is not a slow implementation; it
is close to what the memory system will give. `docs/15-PERFORMANCE.md`
established these kernels are **bandwidth bound**, which is why SIMD did
nothing for the blur, and it is why the only two levers that moved anything
here were *fewer pixels* and *more cores*:

```
  serial                           55.03 ms
  six workers, bit-identical       19.74 ms   2.8x
```

2.8× on six cores, not 6× — sub-linear exactly as bandwidth-bound work
should be. Rewriting more of it in Rust has nothing to give. **So the
answer for all four is JavaScript**, and for the fourth the real fix is not
a language at all: it is a *contract* that refuses an over-budget film
before it renders, plus using the worker pool that already existed.

> A measurement that cost a round: an earlier bench reported the pool at
> **1.59 ms**, a 46× speedup. That is 1.4 ns a pixel, which is physically
> impossible, and it was — the benchmark allocated buffers on a *different*
> `Kernels` instance, so the workers wrote into a memory nobody read. The
> pool's `serial` kernels own the shared heap; a pointer is only valid in a
> worker if it came from them. Comparing the output pixel-for-pixel is what
> caught it, and is now what the test does.

---

## 2. `Scene.add`: an argument you discard is a defect

```js
scene.add({ id, kind, parentId: group });        // used to attach to the ROOT
scene.add({ id, kind }, group);                  // the only spelling that worked
```

`add(spec, parentId)` took the parent from its second argument and
`createNode({ ...spec, id, parentId })` overwrote whatever the spec said.
So the first line above — which reads as obviously correct, because every
*other* field on a node is set exactly that way — silently parented to the
root.

Nothing threw. Nothing warned. Every structural test passed, because the
node existed with the right id, kind and props. It only surfaced once
something was **drawn**: the node inherited no scene alpha, so it ignored
every fade and crossfade, and it sorted its z against the root's children
instead of its scene's, so a backdrop at z −700 drew *underneath* its own
scene's background rect at z −1000. The first contact sheet came back
almost entirely black.

Now both spellings work, and passing both with different values **throws**:

```
Scene: node "s1/sky" was given two different parents -- argument
"__root" and spec.parentId "scene/s1". Pass one or the other.
```

Fixing the two call sites would have fixed the film. Refusing the
disagreement fixes the class, which is the difference between a patch and a
contract.

---

## 3. `role`: say what a thing is

A film's cast is not only characters. Beams, impact stars and speed lines
are cast too, because that is how they inherit a transform, a z and an
alpha channel to animate. The ground check treated all of them as people
and reported six "feet off the ground" warnings against eight real ones —
which is how a warning list stops being read.

```jsonc
"characters": { "bolt": { "role": "effect", "parts": [ … ] } },
"cast": [ { "character": "statue", "as": "statue", "role": "prop" } ]
```

`castRole(character, castEntry)` resolves **cast entry → character → rig**,
most specific first. The rig inference — anything with a `foot*` part is a
character — stays as the default so nothing has to be annotated, but it is
a heuristic and heuristics must be overridable by the author who can see
what the thing actually is. A hand-built rig that names its feet `boot_l`
is a character this would call an effect, and `role` is how you say so.

An unknown role is a **warning**, not silence, because silently falling
back would exempt a character from a check it needs.

---

## 4. One film, read twice

`compileFilm` expands a scene's `template` into scenery, ground and
background, then builds from the expanded spec. `analyseStaging` read
`film.scenes` — the raw one. So a scene whose ground came from a template
had **no ground at all** as far as the checker was concerned, and the
ground check, which only runs when there is a ground, never ran.

The failure mode is the worst kind: the film reported **zero staging
notes**, indistinguishable from a film that passed. It had done so for its
entire life. Declaring the ground explicitly turned the check on for the
first time and immediately found a character hanging **5.3 seconds** in
mid-air across two cuts, because his leap keyed y upward and nothing keyed
it back.

`compileFilm` now returns `expanded`, and the checker reads that. One
film, one reading.

---

## 5. The budget: measure it before it is unrenderable

The paced export has a hard ceiling of `1000 / fps` ms a frame, and **it
does not degrade when you cross it**. MediaRecorder stamps frames by wall
clock, so a renderer that cannot keep up does not drop frames or lengthen
the file — it writes a container with nothing in it. The failure here was a
**110-byte undecodable webm** at the end of a sixty-second render, with no
error anywhere before it.

`estimateFrameCost(compiled, film)` is the cheap, pure, Node-side answer,
and its notes are merged into `analyseStaging` so every surface that
already checks a film gets it:

```
Budget: about 73.5ms a frame, over the 41.7ms ceiling at 24fps. A paced
export does not degrade past this -- it writes an undecodable file.
Heaviest: photo "sky" at 73.5ms. Try: lower "resolution" (now 1) or raise
"step" to hold each warp across more frames.
```

Predicted 73.5 ms against **71.7 ms measured in a browser** — a 2.5% error,
from a pure function, before anything renders.

### The model is measured, not invented

| term | value | measured on |
|---|---|---|
| `photoNsPerPixel` | 64 ns | 48.3 warp + 15.8 conversion, 1400×820 |
| `dabNs` | 1350 ns | 8k–33k dabs across three documents (1207–1579) |

Only two node kinds are modelled, and that is not laziness: the fight
measured 71.7 ms *with* its backdrop and 0.7 ms without, so the other 237
nodes together were below this estimate's noise floor. A model that
pretended to know them would be precision theatre. `CALIBRATION` is
exported so a host that has measured its own hardware replaces the numbers
rather than forking the model.

Both numbers are per-unit costs of Rust kernels, so they scale linearly and
travel between machines as a *ratio* even where the absolute figure differs.

### Two throttles, and a third lever

- **`resolution`** renders the mesh at a fraction of its drawn size and
  lets `drawImage` scale it back. Cost is linear in output pixels.
- **`step`** re-renders every N seconds instead of every frame — the same
  "on twos" the cast already uses, in seconds. It is a *hold*, so the key
  floors rather than rounds, and it is applied in `timeAt` so `renderAt`
  and `imageDataAt` cannot disagree with what the film draws.
- **The worker pool**, 2.8×. `canvasAt` cannot use it — it is called from
  `renderFrame`, which is synchronous by contract because that is what
  makes offline rendering deterministic and Node-testable. So the parallel
  work happens in the render loop's `beforeFrame` hook, which is now
  awaited, and leaves a finished canvas for the synchronous path to find.
  `preparePhotos(scene)` is that hook; without a pool it returns
  immediately and nothing changes.

The pool is browser-only by default. In Node the studio is being driven by
a test or a check, and spawning six workers per instance oversubscribes the
machine for work that is never rendered — measured as the suite going from
40 seconds to not finishing. `new FilmStudio({ parallel: true })` forces it
either way, and kernel workers are `unref`'d so they never hold a process
open.

---

## 6. The API surface this added

| | |
|---|---|
| `Scene.add(spec, parentId?)` | honours `spec.parentId`; throws on disagreement |
| `role` on a character or cast entry | `character` \| `effect` \| `prop` |
| `castRole(character, castEntry?)` | the resolver, exported so everything agrees |
| `compiled.expanded` | the scenes the compiler actually built from |
| `estimateFrameCost(compiled, film, opts)` | `{ ceilingMs, worstMs, shots, notes }` |
| `CALIBRATION` | the measured per-unit costs, replaceable |
| `photo.resolution`, `photo.step` | the two throttles, in the film schema |
| `preparePhotos(scene)` | async pre-warp for the render loop's `beforeFrame` |
| `PhotoPainter.prepare(progress)` | one photo, across the pool |
| `new FilmStudio({ parallel })` | force the worker pool on or off |
| `scripts/bench-film.mjs` | per-frame cost with and without a named element |
| `scripts/contact-sheet.mjs` | key frames as one PNG, to look before rendering |
| `strokeDabs(stroke, brush?)` | the painter's own dab derivation, shared with the budget |
| `worstSpan(estimate)` | the shot to measure: `{ shotId, startSec, endSec, ms }` |
| `calibrate(predicted, measured, base?)` | the model, scaled to this machine |
| `preflight({ startSec, endSec, beforeFrame })` | measure that window, through the render's own hook |
| `preflight` result | `meanMs`, `medianMs`, `p95Ms`, `maxMs`, `warmupMs` |
| `analyseStaging(…, { calibration })` | check a film with a fitted model |
| `registerServiceWorker(url)` | register, and reload once if that is what isolates the page |
| `COEP=off npm run serve` | reproduce a static host that sends no policy |

---

## 7. Three approximations, closed

Each of these was written down as a known limit. None of them needed a new
mechanism -- all three were already solved somewhere else in the repo and
simply not wired through.

### The dab count was never an approximation

`dabsOf` guessed a path's dab count from its command count over the brush
size, with a comment saying the real number "needs kernels". It does not.
`resampleStroke` is pure JavaScript -- no kernel, no canvas -- and
`pathToPoints` flattens the SVG. Running the painter's own derivation for a
whole film costs a few hundred microseconds.

The guess was wrong by however long the strokes were: `M 0 0 L 600 0` and
`M 0 0 L 6 0` are both two commands and differ a hundredfold in dabs.

There were two derivations, so now there is one: `strokeDabs(stroke, brush?)`
in `core/paint/stroke.js`, called by `Surface._prepare` and by the budget.
The budget's `dabs` is now the exact number the painter will stamp, and the
`approximate` flag is gone because there is nothing approximate left.

### Preflight and the estimate now measure the same frames

They could disagree because they described *different things*, and the
estimate was not the weaker of the two:

* preflight measured frames 0..47 -- the opening two seconds, which in most
  films is a title card. **A film whose photo backdrop starts forty seconds
  in passed preflight and then wrote an undecodable file**, which is the
  exact failure preflight exists to prevent.
* it did not run the render loop's `beforeFrame` hook, so it measured the
  serial fallback while the render used the worker pool: 2.8x out on the
  heaviest kernel in the film.

Both are now parameters. `worstSpan(estimate)` hands back the shot the
estimate called heaviest, and preflight samples that window through the same
hook the renderer awaits. Then `calibrate(predicted, measured)` scales the
model by the single ratio between them, because both terms are per-unit
costs of the same bandwidth-bound kernels -- fitting two parameters to one
observation would be overfitting whichever shot happened to be heaviest. The
studio stores the fit in `localStorage`, since the thing being measured is
the machine.

Two measurement defects fell out of pointing them at the same frames:

| | measured on the fight film |
|---|---|
| a held warp makes per-frame cost **bimodal** | median 1.0 ms, p95 35.7 ms |
| the **first** frame pays for the mesh and the inpainted plate | 317 ms, once |

So `meanMs` is the number to calibrate from (the estimate is amortised and so
is the mean), `p95Ms` is what `withinBudget` judges, `medianMs` is a trap, and
`warmupMs` is reported and excluded -- averaged into 48 samples that one frame
was 6 ms of phantom per-frame cost, enough to calibrate the model nearly 2x
pessimistic.

This is not a claim of agreement. After a calibration the prediction is
anchored to this machine, so the residual is the model's *shape* error rather
than its scale error. That is the part a measurement can honestly fix.

### Cross-origin isolation, on a host that will not send it

`scripts/serve.mjs` sends COOP and COEP. GitHub Pages, an S3 bucket and a CDN
do not, and cannot be asked to -- so on every real deployment there was no
`SharedArrayBuffer`, no worker pool, and everything ran at full serial cost.
**Silently**, which is the worst version: the app still worked, four times
slower, and nobody investigates something that works.

A service worker synthesises its own responses, so it can attach the headers
the server omitted. That is the one mechanism a static host leaves open, and
`sw.js` was already there for offline support. Two kinds of response need the
headers, and the second is easy to miss:

1. the **document**, since isolation is a property of the document;
2. every **worker script**, because a worker started from an isolated document
   must assert the same policy, and a script response without the header is
   rejected with `ERR_BLOCKED_BY_RESPONSE`.

Only rewriting navigations isolated the page and then could not start a single
worker -- the pool still absent, now for a second reason. The dev server sends
the headers on everything it serves, which is why that never showed up there.
`COEP=off npm run serve` now reproduces a header-less host, and
`test/e2e/kernels-browser.mjs` runs the whole sequence in that mode.

The first visit cannot be rescued -- its document was fetched before the
worker existed -- so `registerServiceWorker` reloads once, guarded by a
`sessionStorage` flag so a browser that *cannot* be isolated (Safari, which
does not implement `credentialless`) runs single-threaded instead of
refreshing forever. Both pages call it before the app boots, so the reload
lands on an empty page rather than part-way through someone's session.

Two things stopped being silent on the way:

- a kernel worker that fails to load used to leave `loadParallelKernels`
  neither resolved nor rejected -- the pool hanging with nothing logged. It
  rejects now, and the caller falls back to serial.
- the studio says which path it is on, every time, and names the cause and the
  fix when the pool is missing.

---

## 8. What is still silent

- **The budget models two node kinds.** If vector scenery or cast rigs ever
  stop being free, the fix is another measured term, not a fudge factor.
- **One ratio, one observation.** `calibrate` scales both terms together. A
  machine whose dab throughput and pixel bandwidth differ *relative to each
  other* would need a film that isolates each, and two fits.
- **Residual shape error.** On the fight film the calibrated model predicted
  5.6 ms against 9.0 ms measured over the same shot, of which 0.8 ms is the
  vector baseline the model does not claim to cost. That residual is real and
  the ratio absorbs it; it is not a guarantee for a different film.
- **A calibration is per machine and per configuration.** It folds in whether
  the pool was engaged. Switching between an isolated and un-isolated host
  invalidates it, and nothing detects that -- the stored ratio is rejected
  only if it falls outside 0.1x..10x.
- **Safari has no pool.** `credentialless` is unimplemented there, so the
  service-worker route does not isolate it. `COEP=require-corp` would, and is
  tested, at the cost of blocking any user-supplied asset from an origin that
  sends no CORP.
