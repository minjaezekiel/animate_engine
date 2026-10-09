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
| **No CSG, bevel, loop cut or subdivision** | `lathe` and `extrude` cover swept and turned shapes, which is most of a mechanical model, but nothing cuts a hole in a solid. A magwell is a gap between parts, not an opening |
| **No UV mapping or texturing on the 3D film path** | Materials are untextured PBR. No wood grain, no stamped markings, no wear |
| **No "spawn"** | Scaling from zero is the only way to bring geometry into existence; the bullet craters use it |
| **Particles cannot collide** | Inherent to the closed-form solution, and the right trade. Debris passes through the floor |
| **No per-object motion blur** | Particles stretch by velocity; meshes do not. A fast-moving bolt carrier is sharp when it should smear |
| **No dependency between actions** | A crater cannot say "open when this round lands"; both are timed independently against the same clock, and nothing checks they agree |
| **Shadow and contact quality** | One shadow-casting light, a 1024 map, no contact shadows, no ambient occlusion, no area lights |
| **Exposure is sampled, not continuous** | Two frames per shot. A one-second blown highlight between samples is invisible to the check |
| **Framing ignores rotation** | Bounds are axis-aligned and can only overstate, which is the safe direction — it will not pass a clipped shot, but it will occasionally complain about a tight one |
