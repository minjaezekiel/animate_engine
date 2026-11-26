# The 3D film script

Built from a live test: a fifty-second AK-47 assembly and firing ad, chosen
because it exercises what a character film never touches -- rigid mechanical
assembly, hard-surface materials, and effects that are mostly particles.

The headline finding came before a single frame was rendered.

---

## 1. What the test found first: 3D was not authorable

[Phase 3](STATUS.md) gave 3D a real backend -- `Three3DBackend`, `PoseApplier`,
frame-stepped export, Three r169 modules, parametric primitives, full PBR
materials. All of that worked. But there was **no declarative path**:

| | 2D | 3D, before |
|---|---|---|
| Authoring | `film.json` → `compileFilm` | imperative editor ops only |
| Shot sequencing, derived duration, `at` offsets | free | hand-computed |
| Camera continuity across cuts | automatic | hand-matched endpoints |
| Staging diagnostics | [staging.js](../src/core/script/staging.js) | none |
| Keyframeable channels | any, including `props.*` and colour | position, rotation, scale, morphs |
| Particles | — | none at all |

A fifty-second ad meant several hundred hand-timed `addKeyframe` calls. The
cheaper fix was not to write them but to notice that **the existing compiler
already does the hard parts** -- sequencing, `at` resolution, camera tracks,
action-to-clip, diagnostics -- and that `Node.kind` already had `mesh`,
`light` and `camera` with `transform3D` already defined. So 3D became a
second compiler sharing the whole animation stack, not a second engine.

---

## 2. Scalar channels, so the 2D stack serves 3D unchanged

`PoseApplier` understood whole-value channels: `position` as a vec3,
`quaternion` as a quat. A vec3 channel would have needed its own copy of
`writeChannel`, of `Additive`, and of anticipation and overshoot.

It now also understands the scalar forms, which is what a hand-authored film
emits:

```
position.x | .y | .z      rotation.x | .y | .z      scale.x | .y | .z
material.<prop>           fov                       visible      color
```

`material.*` and `fov` are new capability, not just ergonomics: material
properties had been settable but never **keyframeable**, so a flash could not
brighten and a part could not fade.

---

## 3. `fly` — the verb the whole thing exists for

```json
{ "do": "fly", "target": "ak/barrel", "from": [0, 0.6, 0],
  "fromRot": [0, 0, 45], "at": 0.5, "for": 0.8, "overshoot": 0.14 }
```

The rifle is modelled **once**, at its real dimensions, assembled. An assembly
animation then says only *where a part comes in from*; the destination is the
part's own authored rest pose rather than a second copy of the same
coordinates. Move a component in the model and the animation that lands it
follows, instead of silently desyncing.

A part waits at its start pose from frame one, because a track reads as its
first key at every earlier time -- so the exploded array hanging in space
before assembly is the opening shot rather than an accident.

---

## 4. Particles, solved rather than stepped

Every particle system in a game engine is an integrator. This engine cannot
have one: frame N must be a pure function of N. So position is closed-form:

```
p(t) = origin + dir_i * speed_i * age + 0.5 * gravity * age^2
```

Randomness is a hash of `(seed, i)`, never a generator, because a generator
carries state and state is history. Seeking to the middle of a burst gives the
identical frame whether or not the frames before it were ever drawn.

The cost is honest: particles cannot collide or respond to anything. Muzzle
flash, smoke, sparks, brass and wall debris need none of that.

---

## 5. What the rendered frames found that no check did

Every item here was found by **looking at a frame**. None of it was caught by
a test, and that is the finding.

| Fault | Cause |
|---|---|
| Smoke rendered as **solid grey balls** | Two bugs. Particle alpha was written straight into `material.opacity`, replacing the authored 0.5 so every puff was born opaque; and the puffs were lit, so each had a terminator and a specular highlight. Fixed by scaling the authored opacity and adding unlit materials |
| An 880 mm rifle **overflowed the frame on all four sides** | Cameras placed by eye at 0.4–0.7 m. 2D has a staging check measured in head heights; 3D has nothing equivalent |
| First pass near-black, second pass **blew the rifle to white** | No exposure or contrast check at all |
| The stock rendered as **two floating blocks** | The wrist was 105 mm and the gap to the butt was 35 mm |
| The magazine rendered as a **thin dark blade** | Modelled 30 mm front-to-back; a 30-round AK magazine is about 75 mm |
| The grip read as a **sausage** | A capsule's hemispherical ends; an AK grip is a flat-sided slab |
| Ejected brass **glowed like tracer** | It was sharing the spark material |
| **Fourteen bullet craters were in the wall before a shot was fired** | A first `grow` wrote one key at its END time, and a track reads as its first key at every earlier time, so the holes were full size from frame one. Transitions are now seeded from the node's authored rest value -- the same fix the 2D compiler needed and calls `seedChannel` |
| The written video was **seven bytes** | `dataUrl.split(',')[1]`, and the mime type `video/webm;codecs=vp9,opus` contains a comma, so it decoded the literal string `opus;base64` |

And the one worth keeping as a lesson:

> **The entire muzzle flash fired four seconds early, in the wrong shot.**
> The generator hardcoded `FIRE_AT = 35.6` when the firing shot actually began
> at 39.0. This is exactly the arithmetic the declarative compiler exists to
> remove -- and it came straight back the moment the generator did it by hand.
> Round times are now derived from where the shot actually starts.

---

## 6. Modelling against the real weapon

Dimensions are metres, 1:1, in [scripts/make-ak47.mjs](../scripts/make-ak47.mjs)
as named constants rather than literals in JSON, so they are auditable:

| | real | modelled |
|---|---|---|
| overall length | 880 mm | 880 mm |
| barrel | 415 mm | 415 mm |
| receiver | ~250 mm | 250 mm |
| cyclic rate | ~600 rpm | one cycle / 0.1 s |

The assembly order is the field strip **run backwards**, which is the order
the rifle actually goes together: the dust cover comes off first, so it goes
on last.

Two honest limits:

- **The curved magazine is four rotated slabs.** It wants an extrusion along a
  path, and the engine has six primitives and no CSG, lathe or extrude. Four
  slabs read as a curve at the framings this film uses; the seams would show
  on a macro shot.
- **A bullet in flight cannot be shown honestly.** At 715 m/s a round crosses
  the 2.4 m to the wall in 3.4 ms -- under a tenth of one frame. Without
  motion blur there is no truthful way to draw it, so the film shows flash and
  impact on the same frame, which is also what a real camera records.

---

## 7. Closing the four limits

The gaps §6 and the first pass left open, and what each cost.

### Staging and exposure — the largest gap

`staging3d.js`. Framing is solved **analytically**: project a cast member's
world bounds through the camera and measure what fraction of frame height
they cover. No renderer, no GPU, no pixels, so it runs in Node in
milliseconds and can gate a build.

```
CHECK=1 npm run produce:3d
  compile: 0 · framing: 0 · exposure: 0 (over 34 samples)
  luma: darkest 0.068 (03-receiver), brightest 0.271 (15-fire)
```

Three design points earned by being wrong first:

- **All eight corners, not the centre.** A long object seen end-on has a
  centre comfortably in frame while both ends run off it.
- **A shot that does not declare a subject may legitimately not contain
  one.** Cutting to the wall is a cut. Only a shot that says it is `on`
  something must show it — the same exemption the 2D check makes.
- **A band is tested against the range a shot sweeps, not against each
  sample.** A shot is a *move*; a push-in is wide at its head and close at
  its tail. Requiring every sample to sit in one band calls every push-in an
  error, and three samples of a fast one step straight over the band it
  certainly passes through — measured 29% then 94%, with the whole medium
  band in between unsampled.

`on` may name a part (`ak/chargingHandle`), because measuring a macro of a
30 mm handle against the whole 880 mm rifle reports an overflowing frame when
the shot is doing exactly what a detail shot should.

Exposure **cannot** be analytic — it depends on lights, materials and tone
mapping. So the harness measures luma on real frames at 160×90 (1/72 the
pixels) and a pure `checkExposure` judges them, keeping the judgement
testable while the measurement stays where the pixels are.

**What it caught immediately**, none of which any existing test saw: two
shots rendering at 1.7% mean luma with 95% of pixels crushed to black; a
magazine insert at 293% of the magazine's own height, with the magwell it
was seating into out of shot; and a real compiler bug —

> A cut is two camera positions at one instant, and a track cannot hold two
> values at one time: `key` **replaces**. The incoming shot's `from` landed on
> exactly the same time as the outgoing shot's final key and overwrote it, so
> the firing shot spent its whole five seconds drifting toward the *next*
> shot's camera. By the end the rifle was behind the camera during its own
> firing shot. Found by the check, not by eye.

### Audio

`compile3d` emits an `audioCues` list and a `sound` verb; the harness runs the
2D path's `OfflineMixer` and hands the buffer to `MediaRecorderSink`, which
already accepted one and already rides it on the same wall clock as the video
track. Sound on the 3D path cost a cue list and eight lines of wiring — it was
never missing machinery, only the list.

The ad now carries 62 cues: a bed, a clack as each of 29 parts seats, the
charging handle, 17 reports at 600 rpm and 14 concrete impacts. All four
assets are synthesized in `make-ak47-audio.mjs` and seeded, so the audio is as
reproducible as the frames.

Two things had to be true about the browser, and neither was obvious from a
silent render working:

- Headless needs `--autoplay-policy=no-user-gesture-required`, which
  `produce.mjs` had and `produce3d.mjs` did not.
- **The AudioContext must exist and be running before `MediaRecorder` starts.**
  Left to the sink to create mid-render, the stream's audio track produced
  nothing and the recorder stalled waiting for it, emitting a 110-byte WebM
  header and no video frames at all. The failure looked like a *video* bug,
  which is what made it worth writing down.

### Geometry — lathe and extrude-along-path

Not CSG, which is a dependency and a correctness surface of its own. Three
already ships `LatheGeometry` and `ExtrudeGeometry`, and `ExtrudeGeometry`
takes an `extrudePath` — which is precisely "sweep a section along a curve",
the thing the magazine wanted.

The magazine is now **one swept profile** instead of four rotated slabs, and
the seams are gone. A lathe covers every turned part — a muzzle nut, a gas
piston, a case — where stacked cylinders are what make a model read as blocks.

### `ortho` — the camera a technical drawing is read with

Perspective is how an eye sees. **Orthographic is how a drawing of a machine
is read**: two parts the same size measure the same on the page whatever
their depth, which is the entire point of a technical drawing and was not
expressible here at all.

```jsonc
"meta": { "ortho": 2.4 }     // the frame is 2.4 world units tall
"meta": { "ortho": true }    // the same, at 2
```

Measured on two identical cubes at different depths:

| | perspective | orthographic |
|---|---|---|
| near cube | 201 px wide | 100 px |
| far cube | 84 px | 100 px |
| near / far | **2.39** | **1.00** |

The width follows the output aspect, so changing the resolution never
reframes the film — the same rule `test/core/resolution.test.mjs` enforces
for 2D. The framing checks know about it: `projectBounds` skips the divide by
depth, because that division *is* perspective, and without the branch every
staging warning on an ortho film would measure a frame the renderer never
drew.

It is a property of the **film**, not of a shot. The post chain, the AO pass
and the depth-of-field pass each hold a reference to one camera object, so
switching projections mid-film means swapping that object underneath them —
and every film that wants this (a blueprint, an exploded view, an isometric
set) wants it throughout.

### `drivers` — a relationship instead of a list of answers

Some values are **arithmetic, not acting**. A wheel's rotation is the
vehicle's travel over its radius. A dial reads a pressure. A fan turns at a
constant rate forever. Keying those is writing down the answers to a sum, and
the sum has to be re-done by hand every time the input moves.

```jsonc
"drivers": [
  { "target": "wheel", "path": "transform.rot", "expr": "car.transform.x * -114.6" },
  { "target": "fan",   "path": "transform.rot", "expr": "t * 720" }
]
```

`t` is the time in seconds, so the second line is a fan that spins forever
with no keys at all. Available: `+ - * / %`, parentheses, and `abs floor ceil
round sqrt sign sin cos tan atan2 min max pow clamp lerp rad deg step`.
Angles are degrees, like every other angle in a film script.

Drivers resolve **after** the animation they read and in declaration order,
so a chain works (`b` from `a`, `c` from `b`). A reference nothing animates
reads 0 and says so at compile time, because a driver that silently evaluates
to zero is a part that silently does not move. A driver and the hand-keyed
version of the same relationship agree to 1e-9 over every frame, which is the
test that says this is the sum rather than an approximation of it.

**There is no `eval` here, and that is the point.** A film is data: it arrives
as JSON, it is written by scripts and by agents, and it is checked into git.
The moment a film can name code, every film in the repository is an
executable and `git clone` is an arbitrary code execution. `expr` is parsed
by a hand-written recursive-descent parser over a closed grammar with no
property access, no call into anything it did not define, and no way to reach
a global — `alert(1)` is a parse error, and `globalThis` is a channel name
that resolves to zero. See
[43-DCC-PARITY.md §4.5](pending/43-DCC-PARITY.md).

Shared by both compilers, deliberately: a driver is arithmetic over channels
and neither path owns that, so `core/anim/driver.js` is called by
`compile.js` and `compile3d.js` alike.

### `scatter` — a thousand of something, placed rather than authored

Everything in a 3D film here is cast by hand. Sixteen set pieces is a
reasonable thing to type; six hundred pieces of grit is not, and a forest is
out of the question. So every set in this repository was bare — the AK-47's
floor was nine metres of flat concrete with nothing on it, because the
alternative was six hundred lines of JSON with coordinates chosen by hand,
and coordinates chosen by hand look chosen by hand.

```jsonc
"scatter": {
  "grit": { "geometry": { "kind": "tetrahedron", "radius": 0.012 },
            "material": "crater", "on": "set/floor",
            "area": [4.2, 4.2], "count": 600, "seed": 1947,
            "scale": [0.35, 1.5], "tilt": 180, "castShadow": false }
}
```

**One draw call.** That is the claim and it is measured, not asserted: adding
600 instances to the AK-47 film took the frame from **234 draw calls to 235**
and added 2,400 triangles. Six hundred *cast* parts would have been six
hundred calls and six hundred nodes for everything that walks the scene. The
`draw:` line `film3d.html` now prints on the first frame is where that number
comes from — `renderer.info`, after a real render.

**Blue noise, not a random spray.** Uniform random points clump: at 400
samples you get pairs almost touching and bald patches the size of a tree,
and that reads as a mistake, because a real scatter has a *minimum spacing*.
[`core/geom/scatter.js`](../src/core/geom/scatter.js) is Bridson's
Poisson-disc sampling, and the guarantee is exact — measured against uniform
random over the same area:

| | closest pair, 400 points in 4 m² |
|---|---|
| uniform random | **0.0095 m** |
| Poisson-disc | **0.0742 m** — the radius, to three decimals |

**Seeded, and pure.** Its own 32-bit PRNG rather than `Math.random`, so a
film renders the same on every machine and in every re-render; changing
`seed` is how an author asks for a different arrangement. It runs once, in
the compiler, so the points are part of the compiled scene and the backend
only uploads them. 1,000 points is 37 ms at build time, 4,000 is 400 ms —
which is why `SCATTER_MAX` warns at 5,000. The *drawing* is free at any
count; the sampler is not.

**`on` measures what it sits on.** The area and the height come from the
target's own geometry, and the node is **parented** to it, so a floor that is
resized or rotated does not leave its gravel behind. A `plane`, `circle` or
`ring` is a surface in its own local XY rather than a solid with a top face,
so the node carries a quarter turn — the first scatter on a `plane` floor
read a 2 × 0 area and put every point a metre in the air.

**The three jitters are not decoration.** Six hundred identical stones in six
hundred different places still read as six hundred copies of one stone.
`rotY` hides the repeat, `scale` (a `[min, max]` range) breaks the
silhouette, and `tilt` stops them all standing to attention.

ponytail: `geometry` is one primitive, so a scatter is one `InstancedMesh`.
Scattering a multi-part **assembly** — the plan's `of: 'tree'` — is one
InstancedMesh per part plus a shared transform, which is a bigger change than
this and nothing has needed it yet.

### `boolean` — a hole in a solid

Every mechanical model here is assembled from primitives, and a primitive
cannot have a hole. So the AK-47's magwell was **a gap between four slabs**,
a window was a frame with air behind it, and the receiver — the part the
film's third shot is entirely about — was a featureless 250 × 70 × 38 mm
box with no ejection port, because there was no way to cut one.

```jsonc
{ "kind": "boolean", "op": "subtract",
  "a": { "kind": "cube", "width": 0.25, "height": 0.07, "depth": 0.038 },
  "b": { "kind": "cube", "width": 0.045, "height": 0.021, "depth": 0.02,
         "at": [0.055, 0.016, 0.019] },
  "uv": { "tile": 0.07 } }
```

`op` is `subtract`, `union` or `intersect`. Operands are **geometry specs**,
so they nest — a second cutter is a `boolean` in the `a` slot — and each
takes its own `at`, `rot` and `scale`, because a cutter is positioned
relative to what it cuts and has no node of its own to carry a transform.

The arithmetic is [`core/geom/csg.js`](../src/core/geom/csg.js) and it is
pure: a flat triangle soup in, a soup out. The backend's whole share is
building the two operands, baking their transforms into their vertices, and
wrapping the result back up. That is what lets the proof run in Node, which
matters more here than anywhere else in the engine — **a boolean can be
checked against arithmetic**:

| | measured | analytic |
|---|---|---|
| a 1 × 1 bar through a 2-cube | **6.000000** | 6 |
| a 6 mm hole through a 40 mm plate | within **1e-4** relative | — |
| two cubes overlapping by half, unioned | **12.000000** | 12 |
| closure error, every case | **< 1e-5** | 0 |

Volume catches an inverted result (it goes negative, which renders as an
object seen from inside) and closure catches a dropped face (which renders
as a shadow that leaks and a surface that disappears at a grazing angle).
Neither is visible in a still frame of the side that worked.

In the film, the receiver's ejection port changed **556 pixels** — 0.06% of
the frame, confined to a 237 × 78 px box — and took the strong luma steps
inside that box from **99 to 137**, while whole-frame mean luma moved
0.12512 → 0.12521. A cut, and nothing else.

**UVs.** A CSG result has none of its own: the vertices it keeps came from
two different unwraps and the vertices it made are new. So it gets a box
projection at `tile: 1`, which is the Phase 56 contract — a tile is an
amount of surface. Declare `uv` to choose: on the receiver, `tile: 0.07`
keeps the brushed-steel grain at the scale the primitive's own unwrap gave
it, and `tile: 0.25` visibly stretches it, because a box's faces are not
square and its per-face unwrap was stretching the texture to hide that.

**The known failure, stated rather than discovered.** Mesh booleans are
fragile on **coplanar** input: a cutter whose face lies exactly in the face
it cuts has no well-defined inside. So a cutter must poke out of both sides,
or stop short to make a pocket. `coplanarRisk` names the axis at build time
instead of leaving an author to wonder why one face went missing.

**Cost, and why this is not Rust yet.** A 24-sided cutter through a box is
**4.8 ms**; four holes is 31.6 ms; the result's volume is identical whether
the operand carries 12 triangles or 1,728. It runs once, at build time. What
it does cost is *triangles* — a BSP splits the faces it passes through, so
four holes in a box is 2,212 triangles where the box was 12. That, not the
milliseconds, is the thing to watch.

### `show` / `hide` — reveal a prop mid-shot, and the shared verb table

The verb list is now **data**: [`src/core/script/verbs.js`](../src/core/script/verbs.js),
read by both compilers, with the full matrix and the rules in
[02-FILM-SCRIPT.md § Verbs](02-FILM-SCRIPT.md#verbs). What that bought on
this path immediately was `show` / `hide`, which was never missing machinery
— `PoseApplier` has understood a discrete `visible` channel since Phase 14.
A 3D film could only reveal a prop by writing `set visible`, naming an
internal channel to say one of the plainest things in the language, which is
why no film ever did it.

```json
{ "target": "crate/lid", "do": "hide", "at": 2.0 }
```

`visible` is honoured for the whole subtree, so hiding a cast root hides the
prop and its parts together, and the key is **seeded at frame zero** with the
prop's authored state — without that, one `hide` at t=2 hides it from frame
one, because a track reads as its first key at every earlier time.

It is a **cut**, not a fade. A fade needs the material marked `transparent`
at build time, which the adapter deliberately does not imply from opacity
because transparency changes sort order, depth writes and shadow casting for
the whole object; the upgrade path is a material-level flag, not a wider
verb. Until then `for` on a 3D `show` / `hide` says so rather than being
silently dropped.

The same table closed the mirror-image gap on the 2D path — `sound`, a cue
at a shot-relative moment, which the 3D path has had since Phase 20.

### `uv` — a tile is an amount of surface

Every primitive unwraps each face to the full 0..1 square. So a 1.2 m panel
and a 0.3 m panel carry the same texture across four times the distance, and
the cloth on one is woven four times coarser than the cloth on the other.
Phase 53 shipped a material library whose whole contract is "one tile is
about a metre of surface", and there was no way to make that true.

```jsonc
{ "kind": "cube", "width": 1.2, "height": 0.5,
  "uv": { "projection": "box", "tile": 0.3, "angle": 0 } }
```

Measured on two panels of the same fabric, 1.2 m and 0.3 m wide:

| | thread spacing, long panel | short panel | ratio |
|---|---|---|---|
| the primitive's own UVs | 22.86 px | 5.71 px | **4.00** |
| `box`, `tile: 0.3` | 5.93 px | 5.71 px | **1.04** |

And the weave stops being stretched: 5.93 across against 5.83 down, where the
primitive's UVs gave 22.86 against 10.00 on the same panel.

`angle` rotates the projection in degrees, which is how a part aims its grain
— the limitation Phase 53 shipped with. Box projection only; triplanar
blending needs a shader and three texture reads per fragment to remove a seam
that is invisible on flat-sided geometry. It runs once, at build time: a
per-frame UV recompute is the one thing the performance rule forbids.

### `area` — a light with size

Every light in this engine was a point or a direction. A point source cannot
make a penumbra, a soft terminator, or a highlight with a **shape** — it makes
a dot, and a dot is what reads as computer graphics. Every real key light is a
rectangle: a window, a softbox, a strip, a practical in shot.

```jsonc
"lights": [
  { "id": "key", "type": "area", "width": 1.6, "height": 1.6,
    "intensity": 4, "at": [1.4, 1.6, 1.8], "target": [0, 0.5, 0] }
]
```

Measured on a chrome sphere, one light, nothing else changed:

| | point | area (1.6 x 1.6) |
|---|---|---|
| specular highlight | 734 px | **2,888 px** (x3.9) |
| highlight width | 30 px | **60 px** (x2.0) |
| shape | a dot | **the rectangle, reflected** |

The last row is the one that matters: a metal surface shows you the shape of
what is lighting it, and until now the answer was always "a point".

Two honest limits, both of which the compiler states rather than leaving to be
discovered. `RectAreaLight` **casts no shadow** — `castShadow: true` on one is
a diagnostic, and the answer is to pair it with a directional key or to let
`post.ssao` carry the contact. And it lights only `MeshStandardMaterial` and
`MeshPhysicalMaterial`, which is every lit material this engine builds, so in
practice that limit costs nothing. It is aimed by `target` like a spot, and
aimed once at build time: a film that animates a light's position keeps the
aim it was built with.

The same phase closed a guard-list hole beside it. `makeLight`'s `switch`
falls through to a directional light, so `type: 'arealight'` lit the scene
from a direction and said nothing at all — the third instance of the class
`COLOR_PROPS` and `TEXTURE_SLOTS` exist to prevent. `LIGHT_TYPES` now names
the six that are real, and a typo is a diagnostic.

### `preset` — surfaces, from a library

Every material in every 3D film here was **one flat colour** with a roughness
number. That is the largest remaining reason a frame reads as a diagram rather
than a photograph: a real surface varies, and the variation is what the eye
uses to decide what a thing is made of.

The machinery to fix it has existed since Phase 39 —
[textures.js](../src/core/art/textures.js) is layered procedural synthesis in
pure arithmetic — and exactly one film used it, for a planet. The AK-47 film
used **zero** textures. The reason is not that nobody wanted texture: it is
that a brushed steel receiver is twenty lines of layer spec that have to be
got right before you can see whether they were worth it, per material, per
film. So [Phase 53](STATUS.md) does that work once, as data.

```jsonc
"materials": {
  "steel": { "preset": "brushed-metal", "color": "#4b5058", "roughness": 0.38 },
  "stock": { "preset": "wood", "color": "#5e3a1d", "repeat": [1, 1] },
  "wall":  { "preset": "concrete", "color": "#6a6660", "repeat": [6, 6] }
}
```

`brushed-metal` · `wood` · `concrete` · `fabric`. Each fills `map`,
`roughnessMap` and `normalMap`, and the normal map is **derived from the same
height field as the albedo** rather than drawn twice, so the bumps and the
pattern agree.

**A preset paints variation, never colour.** `material.color` multiplies
`map`, so a preset's albedo is a pattern around white and the film keeps
saying what colour its wood is: `{ preset: "wood", color: "#5e3a1d" }` and
`{ preset: "wood", color: "#c9a227" }` are oak and pine, not two copies of one
texture. Roughness works the same way — `roughnessMap` says where a surface is
rougher than its average, and `roughness` says what that average is. Every
number the film writes wins over the preset's.

`repeat` is how much surface one tile covers, and it is the one thing the
engine cannot guess: these presets are authored so that one tile is roughly a
metre of surface, so a 9 m wall wants `[6, 6]` and a 25 cm receiver wants
`[1, 1]`. Get it wrong by 10x and a brushed finish averages out to flat grey.

Measured on four cubes, lit identically, as the mean deviation of each pixel
from its 5x5 neighbourhood — which is what "surface detail" is, and what a
flat-shaded face has none of:

| surface | flat | preset | |
|---|---|---|---|
| wood | 0.00008 | 0.01069 | **x141** |
| fabric | 0.00085 | 0.02138 | **x25** |
| brushed metal | 0.00227 | 0.00677 | x3.0 |
| concrete | 0.00215 | 0.00523 | x2.4 |

One 8-bit level is 0.0039, so the metal and concrete baselines are mostly the
quantisation of a smooth gradient rather than real detail. On the AK-47 film,
which adopted the presets in the same phase: receiver **x5.0**, stock
**x13.9**, the concrete wall behind it **x20.5**.

Unlike the default environment and the default bevel, this is **opt-in**, and
deliberately: a material cannot be guessed from a film. `metalness: 0.88`
could be a milled receiver, a cast housing or a chromed trim strip, and they
look nothing alike.

Two gaps it opened in the texture engine, both now closed: `fbm`'s lattice was
hardcoded to an aspect of 2 because the first caller was an equirectangular
planet, and **brushed metal, wood grain and a woven thread are all
anisotropic** — one `aspect` number is the difference between "noisy" and
"machined". And noise is aperiodic by construction, so a weave was
inexpressible until a `stripes` layer existed.

Still missing: the grain runs along the texture's own axis, so it follows
whatever UVs the geometry has. On a box that means along the face, which is
right for a stock and arbitrary for a part that was modelled sideways.

### Every box is bevelled

Nothing in the physical world has a zero-radius edge. A real one is a chamfer
or a fillet half a millimetre wide, and the only reason it matters at a
film's distance is that it **catches a highlight**: a thin bright line along
every silhouette, which is most of what separates a rendered object from a
diagram of one. It is the clearest single difference between reference
footage and ours, and every box here was a `BoxGeometry` — twelve edges, each
mathematically sharp, each shading as one flat face meeting another with
nothing in between.

So since [Phase 50](STATUS.md) a `cube` is a `RoundedBoxGeometry` with a
**4 mm** radius. Measured on frame 26 of the AK-47 film, counting specular
ridges — a pixel brighter than what is two pixels either side of it along a
scanline, which is what a rim highlight is and what a step between two flat
faces is not: **89 → 730**, with 2.3% of the frame's pixels changed at all.

```jsonc
{ "kind": "cube", "width": 0.25, "bevel": 0 }      // sharp, for a diagram
{ "kind": "cube", "width": 2.0, "bevel": 0.02 }    // a cast corner
```

4 mm rather than a percentage, because a chamfer is a fact about the tool
that cut the part and not about how big the part is — a 2 m door and a 40 mm
receiver carry the same one. It is clamped to a quarter of the smallest
dimension, which is what keeps a part thinner than its own edge from
degenerating, and a box that asks for explicit `widthSegments` is left alone
because it wanted a subdivided box for a reason.

### Shadows are fitted to the scene, not to a fixed box

Two absolute numbers in an engine that has no units, both of them wrong in
ways no render reports.

`DirectionalLight`'s shadow camera defaults to **+/-5 units**. A set larger
than ten units across has no shadow outside that box — the shadow is cut off
mid-floor, in a straight line, and reads as a rendering error nobody can name
— and a miniature spends its whole map on empty space.

And `shadow.bias` is **normalised depth over the shadow camera's
`[near, far]`**, not a distance. This adapter hardcoded `-0.0008` against the
default `0.5..500` frustum: **0.4 metres** of depth offset, in films whose
subjects are under a metre. That is peter-panning — the shadow detaches from
the thing casting it and sits on the floor nearby, which is exactly what makes
an object look pasted on rather than placed.

Since [Phase 52](STATUS.md) every shadow-casting light is fitted once, after
the scene exists: the ortho box to the bounding sphere of what casts, near and
far to that sphere as seen from the light, and **everything else derived from
the size of one texel** — `normalBias` at 1.5 texels, `bias` at half a texel
of world depth expressed as the ratio the comparison actually uses. The map is
2048² rather than 1024², because this renderer is offline and a megabyte of
depth buffer costs it nothing.

Measured on a cube resting on a plane, lit by one directional light:

| | before | after |
|---|---|---|
| gap between the block and its own shadow | **53 px** | **1 px** |
| the same scene authored 10x larger: shadow edge deviation from straight | **15.12 px** | **0.45 px** |
| the 1x and 10x frames differing by more than 2% luma | 2.35% | **0.27%** |

The last row is the real result: **the same scene at ten times the size now
renders the same picture.** It did not before, and nothing in the film said
what size a scene was supposed to be.

The render log says what was chosen, because a fit that silently picks a bad
box is the failure mode this replaces:

```
shadows: 2048^2 over 15.13 units (7.4 mm per texel), bias -4.1e-4
```

Still fixed: the fit covers the whole **set**, so a 1 m subject on a 9 m floor
gets 7 mm texels rather than the 1 mm a close-up deserves. Fitting to the
camera's view instead — one cascade, snapped to texel increments so the edges
do not swim between frames — is the next step and is not built.

### The bullet

A round at 715 m/s crosses the 2.4 m to the wall in 3.4 ms, an eighth of one
frame. That has not changed and cannot: a real bullet is not photographable
in flight, and none is drawn.

What *is* drawn is a tracer, and the engine can now draw it honestly.
Particles report their analytic velocity — `v(t) = dir·speed + g·age`, the
derivative of the position they already solve — and a `shutter` setting
stretches each one to the distance it covers while the shutter is open. That
is motion blur for a point, solved rather than accumulated over sub-frames.
The round is slowed to stay on screen for about a frame, which every firearms
film does; the streak's **length** is measured rather than guessed.

One contract came out of getting it wrong: `lookAt` aims an object's +Z, but
a cylinder, capsule and cone all run along +Y, so the first tracer rendered
as a bar *across* the flight path. The adapter now rotates the geometry once
at build time, so "long axis on +Z" holds for any primitive instead of being
a rule each film has to rediscover.

---

## 8. Still missing

| Gap | Note |
|---|---|
Measured against Blender, this is still a small toolset. The honest list:

| Gap | Note |
|---|---|
| **No loop cut or subdivision** | *CSG closed in Phase 58:* `{ kind: 'boolean' }` subtracts, unions and intersects, proved against analytic volume, and the AK-47's receiver has an ejection port. What is left here is **subdivision** — nothing smooths a coarse mesh — and the cost CSG does carry: a BSP splits the faces a cutter passes through, so holes are paid for in triangles. Bevel came off this list in Phase 50, but a **cylinder's rim is still sharp** — a chamfered rim needs a `lathe`, by hand |
| **No UV control on the 3D film path** | Closed in part: `preset` gives a material a synthesised albedo, roughness and normal map as of Phase 53, and the AK-47 uses them. But the UVs are whatever the primitive generates, so a grain direction cannot be chosen per part, and there are still no stamped markings and no wear |
| **No "spawn"** | Scaling from zero is the only way to bring geometry into existence; the bullet craters use it |
| **Particles cannot collide** | Inherent to the closed-form solution, and the right trade. Debris passes through the floor |
| **No per-object motion blur** | Particles stretch by velocity; meshes do not. A fast-moving bolt carrier is sharp when it should smear |
| **No dependency between actions** | A crater cannot say "open when this round lands"; both are timed independently against the same clock, and nothing checks they agree |
| **Shadow and contact quality** | *Half closed:* `ssao` is a working GTAO pass as of Phase 51, shadow cameras are fitted to the scene at 2048² as of Phase 52, and area lights exist as of Phase 55 — but an area light casts no shadow map in THREE, and the shadow fit covers the set rather than the view |
| **Exposure is sampled, not continuous** | Two frames per shot. A one-second blown highlight between samples is invisible to the check |
| **Framing ignores rotation** | Bounds are axis-aligned and can only overstate, which is the safe direction — it will not pass a clipped shot, but it will occasionally complain about a tight one |

---

## 9. Constraints, targets, simulation and post

Added in [Phase 24](STATUS.md). Four new top-level blocks and no new verb,
which is the part worth explaining.

### `targets` — and why IK and gaze needed no verb

```jsonc
"targets": {
  "gaze":  [0, 1.62, 3.4],              // shorthand for { "at": [...] }
  "reach": { "at": [-0.42, 1.18, 0.34] }
}
```

A target is an ordinary node. `move` already animates nodes, with easing,
anticipation and overshoot; a constraint already needs somewhere to point.
So "put the hand on the screen" is a target at the screen plus an `ik`
constraint, and "look at the camera" is a target plus a `lookAt` — using the
same two mechanisms the **camera's own** look-at has used since this compiler
was written.

The alternative was a `reach` verb and a `gaze` verb, each with its own
timing, easing and diagnostics. Two verbs that could not be eased, layered or
overshot without reimplementing what `move` already does.

### `constraints` — the rule the timeline cannot write

Declared globally, or inside a character where a bare name means that
character's own bone. Evaluated after the pose and before the draw, in
declaration order.

```jsonc
"characters": { "host": { "constraints": [
  { "type": "lookAt", "source": "eyeL", "target": "gaze",
    "limit": { "x": [-22, 22], "y": [-34, 34] } },
  { "type": "lookAt", "source": "head", "target": "gaze", "weight": 0.3 },
  { "type": "ik", "chain": "armR", "target": "reach", "pole": [0, 0, -1],
    "limit": { "x": [-145, 2] } },
  { "type": "copyRotation", "source": "shoulderR", "from": "shoulderL",
    "axes": "z", "invert": true },
  { "type": "limitRotation", "source": "neck", "limit": { "y": [-45, 45] } },
  { "type": "driven",
    "input":   { "target": "foreL", "channel": "rotation.x" },
    "from":    [0, -110],
    "outputs": [{ "target": "armL", "channel": "scale.x", "to": [1, 1.11] }] }
] } }
```

Every angle is in **degrees**, like every other angle in a film script.
`weight` blends against the pose the timeline wrote, so `0.3` on the head is
a head that follows a third of the way — which is what makes a gaze land on
something instead of snapping to it.

`driven` is pose space deformation reduced to its smallest honest form: read
one channel, write another, with a smoothstep between them. The four default
**correctives** on every generated humanoid are exactly this — a closing
elbow widens the upper arm — and `"correctives": false` on the character
turns them off.

A constraint naming a node the film does not have is a **warning and a
dropped constraint**, never a throw. Same contract as every other diagnostic
here.

### `cloth` — the pieces whose job is to move

```jsonc
"cloth": { "cape": {
  "pinTo": "host/chest", "cols": 14, "rows": 16,
  "width": 0.46, "height": 0.82, "at": [0, 0.06, -0.17],
  "material": "cape", "wind": [0.4, 0, -1.6], "floor": 0.02,
  "colliders": [{ "node": "host/chest", "r": 0.19 },
                { "node": "host/hips",  "r": 0.19 }]
} }
```

The character's own clothing stays an inflated body, because that is the one
garment that provably cannot clip through it. This is the layer on top — a
cape, a flag, a curtain, a tablecloth.

The mesh lives at the scene root in **world space** and carries world
positions, because gravity is a world-space quantity and a sheet parented to
a moving shoulder would be simulated in an accelerating frame. Attachment is
not a constraint type: the pinned particles are written to wherever
`pinTo` has got to, and the solver never moves them.

### `fluids` — a card, honestly

```jsonc
"fluids": { "steam": {
  "n": 48, "at": [-0.62, 1.52, 0.42], "size": [0.9, 0.9],
  "color": "#cfd8e4", "buoyancy": 2.2, "dissipation": 0.55,
  "sources": [{ "x": 0.5, "y": 0.06, "radius": 0.05,
                "amount": 2.6, "vy": 1.1, "at": 0.2, "for": 6 }]
} }
```

`emitterState` is a **closed form** — position as a function of time, which
is what makes particles free and deterministic, and also what makes them
unable to swirl. Smoke that curls back on itself is the velocity field acting
on itself, and no closed form has one. So this is a grid solver, painted into
a canvas texture on a plane — the same texturing path the slide already used.

Source `x` and `y` are fractions of the card, so changing `n` does not move
them. `at` and `for` are the window in which a source injects, on the film's
own clock.

### `meta.post` — the chain, ordered by the engine

```jsonc
"meta": { "post": {
  "ssao":  { "radius": 0.18 },
  "bloom": { "strength": 0.3, "threshold": 0.9 },
  "dof":   { "focus": 3.4, "aperture": 0.0010, "maxblur": 0.008 },
  "grade": { "exposure": 1.12, "temperature": 0.25, "vignette": 0.26,
             "grain": 0.018, "chromatic": 0.12,
             "lift": [0.004, 0.004, 0.010] },
  "smaa":  true
} }
```

Declaration order is ignored; the chain is built in render order and always
ends in `OutputPass`. That order is most of the correctness: AO needs raw
depth and a bloomed frame has none, bloom's threshold only means something on
the linear buffer, a defocused highlight blooms but a bloomed highlight does
not come back into focus, and antialiasing anything but the final image is
work the next pass undoes.

#### `ssao` — contact shadows, and why no film had ever used one

An object with no ambient occlusion floats above the floor rather than sitting
on it. The pass to fix that has been declared, documented and wired since
Phase 24, and **not one film in this repository used it**, for a reason that
was never going to show up in a review: it could not work.

`SSAOPass`'s `minDistance` and `maxDistance` are differences of orthographic
depth **normalised over `[near, far]`**, and this adapter passed them metres.
A film camera is built with `near: 0.01, far: 200`, so `bias: 0.008` asked the
shader to count occlusion only where the depth gap was between **1.6 m and
48 m** — in scenes where the whole subject is under a metre. The pass rendered,
cost its frames, and produced a white AO buffer. That looks exactly like a
scene with no concavities in it.

Since [Phase 51](STATUS.md) `ssao` builds a **`GTAOPass`** instead, for two
reasons beyond quality. GTAO's `radius` is in world units, which is what a
film script means by one. And `SSAOPass` renders its *own* beauty pass into a
target it allocates with no samples and outputs that — so asking for ambient
occlusion silently threw away the multisampled frame the composer had just
drawn, which is Finding 1 of the render-quality work all over again in a
different file. GTAO composites onto the buffer it is handed. The old pass is
still the fallback for a page that supplies it and not GTAO, with the
conversion applied.

Measured on a cube resting on a plane, flat-lit so that nothing but occlusion
can move:

| region | no AO | with AO | |
|---|---|---|---|
| where the cube meets the floor (2.3% of the frame) | 0.617 | 0.551 | **x0.893** |
| darkest pixel of that band | — | — | **-0.337** |
| open floor, same material, same light | 0.635 | 0.635 | x1.000 |

Occlusion where surfaces meet and nowhere else, which is the whole claim.

```jsonc
"meta": { "post": { "ssao": { "radius": 0.3, "intensity": 1 } } }
```

It is **not on by default**, unlike the environment and the bevel, and that is
a deliberate exception: switching any post pass on also moves the background
colour (see [the defect register](pending/DEFECTS.md)), so defaulting it would
restyle every film to fix the shading of some of them. Turning it on is one
line, and it is worth it on anything that touches anything.

`meta.bloom` still means what it meant and folds in as a `bloom` entry, so
every film already in the repo renders unchanged. Naming bloom in both places
gives **one** pass, with `post` winning — concatenating gives two and reads
as a milky frame nobody asked for.

Film grain advances with the frame time, not with a clock, because the
renderer's contract is that frame *N* is a pure function of *N*.

### What it costs

[`demo/rig3d.json`](../demo/rig3d.json) — a rigged presenter with eye
convergence, an IK reach, four correctives, a simulated cape, a smoke plume
and all five post passes — renders at **41 ms/frame** at 960x540, including
encode.

---

## 10. `grip` — hands and fingers

Added in [Phase 25](STATUS.md). The rig had one `fingers` leaf bone below the
wrist and a flat slab for a hand, so the arm ended at the knuckles — 190 mm
short of a fingertip, which is also why the figure read as short-armed
without anything saying why.

Each hand is now five digits of three phalanges, plus a tip bone each: twenty
bones and fifteen swept segments per hand, and sixty-five bones on the
skeleton. They are always built; the geometry is deliberately low — seven
rings and ten sides per phalanx — so thirty of them cost less than one thigh.

```jsonc
{ "do": "grip", "target": "host/handR", "pose": "fist",
  "at": 0.4, "for": 0.3, "amount": 1, "overshoot": 0.2 }
```

`target` names the **hand bone**. Poses are `relaxed`, `open`, `spread`,
`fist`, `point`, `pinch`, `grasp` and `thumbsUp`, from the table in
[`core/art/hands.js`](../src/core/art/hands.js) — which the 2D compiler reads
too, so `fist` is the same shape on both paths.

Routed through `writeScalar` like every other verb, so easing, anticipation
and overshoot come free. A hand that overshoots closing is most of what makes
a grab read as a grab.

### The bind pose is already a relaxed hand

The relaxed curl is baked into the bone DIRECTIONS rather than written as
keys, so `relaxed` is all zeros and costs nothing. A character who never
mentions their hands still has hands that look like hands; the alternative is
thirty keyframes per film just to stop the fingers reading as a rake.

Curl is `rotation.x` on all three joints and closes toward the palm, so a
closing grip is a positive number everywhere and a film never has to remember
a sign. Splay is `rotation.z` and the thumb's opposition `rotation.y`, both on
the first joint only — a finger fans at the knuckle and nowhere else. Those
two mirror between hands and the curl does not, which is just what happens to
rotations across a plane of symmetry.

### What the test found

| Defect | Cause |
|---|---|
| **Every tube in the engine ended in a small open hole** | The cap was three rings at 22%, 62% and 88% of the radius — all at the *same* t, which is a flat disc, not the dome the comment beside it had always claimed. Nothing closed the innermost ring. At limb scale the next segment covers it; at fingertip scale it is a black pinhole at the end of each of thirty phalanges |
| **Closing it did not make it go away** | Both new cap fans were wound inward, and an inward triangle is backface-culled — so the hole was still a hole |
| **Fingers came apart into rows of sausages** | Butt-jointed capsules meeting at a joint pull apart the moment it bends. Three joints at 76° is not a shallow elbow. They overlap now, which is what a 2D cutout does for the same reason |
| **A kink in every thumb** | Splay was applied to the first bone and the two below it reverted to straight down. The thumb is the one digit splayed far enough to notice |
| **The sleeve swallowed the wrist** | An 18 mm inflation on a 30 mm wrist is a 96 mm cuff, and the hand came out of it like a flower out of a vase. The forearm is its own group now, with a thinner sleeve |
| **The palm tapered the wrong way** | 84 mm at the wrist down to 64 at the knuckles. A hand widens from the wrist |

The dome fix also closed a defect nobody had traced: the speckled band at the
waist, where the jacket's and the trouser's flat cap discs met at the spine
and z-fought.

---

## 11. `models` and `environment` — somebody else's assets

Added in [Phase 26](STATUS.md) and documented in full in
[20-IMPORT.md](20-IMPORT.md).

```jsonc
"models": { "chair": { "src": "assets/chair.glb" } },
"cast":   [ { "model": "chair", "as": "chair", "at": [0, 0, 0] } ],
"meta":   { "environment": { "src": "assets/studio.hdr", "intensity": 1.2 } }
```

A model is **one node in the core scene** however many it contains, because a
downloaded environment can carry thousands and the core scene exists to be
walked and measured. Its named nodes are still addressable as
`chair/Seat`, and the animations that came in the file are playable by name —
converted through `clipToTracks` before the film compiles, so the compiler can
list the clips a file *does* have when you ask for one it does not.

### There is always an environment now

A metal has **no diffuse albedo**. Its colour *is* its reflection, so a
`metalness: 0.9` surface with nothing to reflect renders near-black whatever
colour it was given, and adding lights does not fix it: a light is a point and
a reflection needs a surround. Not one film in this repository declared an
environment, and six of the AK-47's materials are above 0.8 — which is why it
read as orange cardboard rather than steel.

So since [Phase 49](STATUS.md) an environment is a **default, not an option**.
A film gets the built-in studio — three's own `RoomEnvironment`, a handful of
emissive boxes prefiltered into a PMREM, nothing downloaded — whenever it
declares a material above `metalness: 0.2`, or imports a model at all (a glTF
brings its own PBR materials, authored against image-based lighting by
whoever exported it; the compiler never sees them).

**An implicit environment lights the metal and nothing else.** A dielectric
does not have the black-slab problem — its colour is its albedo — and putting
a neutral grey room on one desaturates a palette the film chose under its own
lights. So the built-in studio is attached per material, weighted by
`metalness`, and every dielectric in every existing film renders exactly as it
did. A **declared** environment is applied to the whole scene, because
declaring one is asking for precisely that.

Measured on frame 26 of the AK-47 film:

| region | without | studio on everything | studio on the metals |
|---|---|---|---|
| receiver, `metalness: 0.88` | 0.073 | 0.246 (x3.38) | **0.229 (x3.14)** |
| wood stock, `metalness: 0` | 0.240 | 0.459 (x1.91) | **0.240 (x1.00)** |
| backdrop saturation | 0.440 | 0.168 | **0.427** |
| frame below 2% luma | 9.3% | 0.0% | **0.0%** |

Nearly all of the gain on the metal, none of the restyling. The Earth film,
whose core materials are 0.25 and 0.5, moved only where it should: its
brightest sampled shot (the inner core) 0.515 → 0.528, its darkest unchanged,
and `check:earth` still reports zero exposure problems.

```jsonc
"meta": { "environment": false }                                 // opt out
"meta": { "environment": "studio" }                              // the built-in, by name
"meta": { "environment": { "src": "studio", "intensity": 1.4 } } // turned up
"meta": { "environment": { "src": "sky.hdr", "background": true } }
```

Naming it — `"environment": "studio"` — makes it **declared**, so it lights
everything at full strength. That is the switch for a film authored against a
studio rather than one rescued by it.

One three.js detail worth knowing before changing any of this:
`material.envMapIntensity` is refreshed **only for a material that owns its
`envMap`**. With a `scene.environment` the per-material weight is silently
ignored — measured, setting it to zero on every material in the film changed
not one pixel — which is why the implicit path assigns `material.envMap`
directly.

`meta.environment` had been parsed here since Phase 14 and read by nothing.
