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

## 7. Still missing

| Gap | Note |
|---|---|
| **No 3D staging check** | The largest remaining gap, and the cause of most of §5. Framing, exposure and contrast are all unverified; 2D measures framing in head heights and motion in world positions |
| **No audio on the 3D path** | `compile3d` emits no audio cues, so the ad is silent. The 2D path's whole voice, music and mix pipeline is unreachable from here |
| **Six primitives, no modelling** | No extrude, lathe, CSG, bevel or loop cut. Anything curved is segmented by hand |
| **No "spawn"** | Scaling from zero is the only way to bring geometry into existence; the bullet craters use it |
| **Particles cannot collide** | Inherent to the closed-form solution, and the right trade |
| **No motion blur** | Which is why a supersonic round cannot be drawn in flight |
| **No dependency between actions** | A crater cannot say "open when this round lands"; both are timed independently against the same clock, and nothing checks they agree |
| **Shadow and contact quality** | One shadow-casting light, 1024 map, no contact shadows or AO |
