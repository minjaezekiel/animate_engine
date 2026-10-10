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

---

## 7. What is still silent

- **The budget models two node kinds.** If vector scenery or cast rigs ever
  stop being free, the fix is another measured term, not a fudge factor.
- **`dabsOf` approximates a path's dab count** from its command count and
  brush size, because the real number needs arc-length resampling and the
  kernels. It is marked `approximate` in the result. A drawing-heavy film
  would want the real count.
- **Preflight and the budget can disagree.** Preflight samples 48 real
  frames in a browser and is the authority; this is the cheap estimate that
  runs first. They are 2.5% apart on the one film where both were measured,
  which is not a guarantee.
- **The pool needs cross-origin isolation.** Without COOP/COEP there is no
  `SharedArrayBuffer`, `loadParallelKernels` returns null, and everything
  falls back to the serial path at full cost.
