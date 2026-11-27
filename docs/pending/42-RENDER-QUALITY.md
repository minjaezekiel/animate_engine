# Render quality — why a 768x576 reference beats our 1280x720

**Status: not started.** This doc is the comparison, the measurements, and the
architecture that follows from them. Nothing here has been built.

The prompt for it was a viewer's reaction to `ak47-blur.mp4`: *"the video is
pixelated like it shows individual pixels instead of a high quality HD
video"*, and *"the objects we create don't even appear as much realistic"*
next to a production-grade reference.

Both observations are correct. Neither has the cause one would guess.

## The reference, measured

`3d_anime1.mp4`, the sample offered for comparison:

| | reference | the file that was watched |
|---|---|---|
| resolution | **768 x 576** | 480 x 270 |
| frame rate | 30 | 24 |
| video bitrate | 651 kbps | 524 kbps |
| **bits per pixel per frame** | **0.049** | **0.168** |

The reference is a *lower* resolution than our 720p default and spends **a
third of our bits on each pixel**, and it still looks incomparably better. So
whatever the gap is, it is not pixel count and it is not the encoder. Raising
the resolution alone will produce a larger picture of the same problem.

That is the single most useful thing this comparison establishes, because it
rules out the two cheapest explanations before any work is planned.

What the reference actually has, from its frames: textured surfaces with
albedo and normal detail; soft contact shadows in every crevice; indirect
light that fills shadows the key never reaches; **not one razor-sharp 90
degree edge anywhere in the frame**; defocused backgrounds; and a filmic warm
grade with highlight rolloff. It is an ordinary Blender/EEVEE-grade render.
None of those are exotic.

## Finding 1 — declaring any post pass silently turns anti-aliasing off

This is a defect, it is in `src/render/post3d.js`, and it affects **every film
in this repository that sets `meta.bloom`**, which is most of them, Earth
included.

`film3d.html:317` asks for `antialias: true`. That flag applies to the
renderer's *default drawing buffer only*. `buildComposer` calls
`new EffectComposer(renderer)` with no render target, and three r169 then
makes one with `samples` unset, i.e. **zero**. The scene is therefore rendered
into a non-multisampled target and the drawing buffer's MSAA is never used.

Measured on the same frame of the same film at 1280x720, by counting high
contrast edges that have at least one pixel resolved *between* the two
plateaus -- the pixel a multisample resolve produces and a point sample
cannot:

| chain | edges found | with a resolved intermediate pixel |
|---|---|---|
| no post at all | 686 | **57.9%** |
| `bloom` | 1440 | **1.2%** |
| `bloom -> smaa` | 2079 | **1.1%** |

Switching bloom on costs **a factor of fifty in edge resolution**. And `smaa`,
the pass that exists to compensate, recovers nothing measurable -- it is an
image-space filter that needs gradients to detect an edge, and a point-sampled
staircase on flat-shaded box geometry gives it none.

That is the "individual pixels" the viewer saw, and it is present at every
resolution. It explains why the complaint arrived about a file that was
already encoded at three times the reference's bit density.

**Fix:** construct the composer's target explicitly with
`samples: <from quality tier>`. One line, plus the tier plumbing below. The
SSAO pass makes its own targets and is unaffected.

## Finding 2 — a metal with no environment is a black slab

Not one film in this repository declares `meta.environment`. The AK-47 film
declares eleven materials, of which six have `metalness` between 0.82 and
0.95.

A metal has no diffuse albedo. Its colour *is* its reflection. With no
environment to reflect, 88% of the receiver's response has nothing to return
and what reaches the frame is a dark slab, which is exactly what the viewer
described as "doesn't appear realistic". This is the classic PBR authoring
mistake and the engine already has everything needed to avoid it:
`loadEnvironment` has been in `film3d.html` since the 3D path existed.

Proved by rendering the same frame twice, the second with nothing changed but
a synthesised 1024x512 studio dome added as `meta.environment`:

| region | without env | with env | change |
|---|---|---|---|
| receiver (`metalness: 0.88`) | 0.0730 | 0.2715 | **x3.7** |
| wood stock (`metalness: 0`) | 0.2403 | 0.3769 | x1.6 |
| fraction of the frame below 2% luma | 9.4% | **0.0%** | — |

The differential is the proof. Both regions got brighter because an
environment lights everything, but the *metal gained 3.7x against the
dielectric's 1.6x* -- that excess is specular reflection finally having
something to reflect. The receiver, barrel, bipod and magazine stop reading as
black cardboard and start reading as steel.

A caveat the experiment also exposed: the environment lit the backdrop too and
washed it from near-black to mid-grey. Scene exposure has to be re-tuned when
one is introduced, which is an argument for the environment being a *default*
rather than an opt-in, so films are authored against it from the start.

## Finding 3 — the encoder spends 6 Mbps whatever the picture is — **fixed**

`WebCodecsSink.js:24` and `Mp4Muxer.js:95` both default to a flat
`bitrate = 6_000_000`. Only one of those two was ever a video
bitrate: the muxer's is read in exactly one place, the **audio** `esds`
descriptor, so it was declaring a 128 kbit/s AAC stream as fifty times its
size. Video declares no rate at all -- `avcC` carries the parameter sets and
nothing else -- so there was one dial here, not two. That is wasteful at 480x270 and visibly thin at
1920x1080 for animation, which is full of the large flat gradients that band
first. Bitrate should be a function of `width * height * fps`.

## Finding 4 — there is no quality dial, only two numbers — **partly fixed**

`WIDTH` and `HEIGHT` environment variables, defaulting to 1280x720, on both
`produce.mjs` and `produce3d.mjs`. Nothing names a quality level, so every
other sampling decision in the pipeline is a constant chosen once and never
revisited: shadow maps are **fixed at 1024x1024** with a fixed bias
(`SceneAdapter.js:1189`), there is no supersampling, no MSAA sample count, and
no relationship between any of them and the output size.

The viewer asked to be able to choose 360 / 480 / 720 / 1024. That request is
right but it is narrower than what is needed: resolution is one of six things
that should move together.

## What is actually missing, in order of look per unit of work

### Tier 0 — defects, near-zero cost — **shipped, Phase 48**

| # | Item | Where | Result |
|---|---|---|---|
| 0.1 | Multisampled composer target | `src/render/post3d.js` | **done.** 1.2% -> **68.5%** of edges resolved, same frame, same film |
| 0.2 | Bitrate from pixels x fps | `src/core/render/quality.js`, `WebCodecsSink` | **done.** 0.2 bits per pixel per frame, clamped |
| 0.3 | Named resolutions, 2D and 3D | `src/core/render/quality.js`, `scripts/produce*.mjs` | **done.** `QUALITY=360p|480p|720p|1024p|1080p|1440p|2160p` |

Measured after the fix, by re-rendering frame 26 of the AK-47 film with the
same `bloom` chain and nothing else changed:

| chain | edges found | with a resolved intermediate pixel |
|---|---|---|
| no post at all | 686 | 57.9% |
| bloom, before | 1440 | 1.2% |
| bloom -> smaa, before | 2079 | 1.1% |
| **bloom, after** | **923** | **68.5%** |

The edge count falling from 1440 to 923 is the same result stated twice: a
staircase registers as several separate steps, and a resolved edge registers
as one. 68.5% is *above* the no-post figure because the only anti-aliasing
there was the default drawing buffer's, and a bloomed frame also carries
gradients that cannot alias.

**What Tier 0 deliberately did not build.** `meta.quality` as one word moving
six dials is still below, unbuilt, because five of its six dials (supersample
scale, shadow resolution, AO, environment, probes) are Tier 1 and Tier 2 work
that does not exist yet -- a tier table whose columns all read `n/a` is a
config file pretending to be a feature. What shipped is the two numbers Tier 0
can actually set today: `samples` on the composer target (a `buildComposer`
argument, default 4) and the output size by name. `meta.quality` lands with
Tier 1, when there is something for it to move, and `src/core/render/quality.js`
is the file it lands in.

### Tier 1 — shading, the largest return

**1.1 shipped in Phase 49, and not as planned, in two ways.** The plan was
`src/core/art/environments.js`: a procedural studio dome synthesised to pixel
data at build time. Three ships one already -- `RoomEnvironment`, a small scene
of emissive boxes, no texture and no network -- and `PMREMGenerator` prefilters
it into the roughness mip chain a `MeshStandardMaterial` actually samples,
which a dome of our own would have had to be put through anyway. So the
feature is six lines in `film3d.html` and a default in the compiler, and the
pure module is not needed. A procedural *sky* still is, and stays on this
list under 1.5, beside the materials.

The second departure is the more interesting one. The plan said "applied
whenever any material has `metalness > 0.2`" and meant applied to the SCENE.
Done that way it measured as a restyling of every finished film: the AK-47's
blue backdrop lost two thirds of its saturation, because a neutral grey room
lights a dielectric too and a dielectric never had the problem. An implicit
environment now attaches to the metals alone, weighted by `metalness`, which
keeps x3.14 of the x3.38 and leaves every other surface at exactly what it
was. Finding 2's caveat -- "scene exposure has to be re-tuned when one is
introduced" -- turned out to be avoidable rather than unavoidable, and a
declared environment still lights everything, because declaring one is asking
for that.

**Three of the five Tier 1 items shipped so far were a wrong number, not a
missing feature.** The environment did not exist; but ambient occlusion
(1.3) was wired and arithmetically impossible, and the shadows (1.4) were
fitted to an absolute 10-unit box with 0.4 m of bias. In both cases the
parameter was in NORMALISED DEPTH and the code passed metres. That is now the
first thing to check in any THREE pass this engine wires: *what are these
units*. See [DEFECTS.md](DEFECTS.md).

**1.2 shipped in Phase 50, and also not as planned.** `src/core/geom/bevel.js`
was to be a pure bevelled-box generator. Three ships `RoundedBoxGeometry` in
the same addons this page already imports from, so the item is one geometry
builder, one radius policy and an argument threaded the way `mergeGeometries`
already is. Two of the three files the plan named have now turned out to be
unnecessary, which is worth noticing before writing the third.


| # | Item | Why |
|---|---|---|
| 1.1 | ~~**A default environment.**~~ **done, Phase 49.** Applied whenever any material has `metalness > 0.2`, or the film imports a model at all -- and attached to the METALS alone, so no dielectric moves. | Finding 2. Receiver **x3.14**, wood stock beside it **x1.00**, backdrop saturation 0.440 -> 0.427; nothing in the frame is below 2% luma any more. |
| 1.2 | ~~**Bevelled edges.**~~ **done, Phase 50.** `cube` is a `RoundedBoxGeometry` at a 4 mm radius by default, clamped to a quarter of the thinnest dimension; `bevel: 0` opts out. `extrude` already took one. | Specular ridges on frame 26 of the AK-47: **89 -> 730**. A cylinder's rim is still sharp -- that needs a `lathe` and is authoring, not engine. |
| 1.3 | ~~**Contact shadows**~~ **done, Phase 51 -- but NOT by default.** `ssao` builds a GTAO pass; the old one's occlusion window was in metres where the shader wanted normalised depth, so it was arithmetically impossible and that is why no film used it. | **x0.893** where a cube meets a floor, x1.000 on the open floor. Not defaulted because any post pass also moves the background colour -- a new entry in DEFECTS.md, and the thing to settle before post can be on for everything. |
| 1.4 | ~~**Shadow quality**~~ **done, Phase 52.** Ortho box fitted to the casters' bounding sphere, near/far from the light, `bias` and `normalBias` derived from the texel, map 2048². Not tied to a tier, because there are no tiers. | The bias was **0.4 m** of depth offset (it is normalised depth, and -0.0008 was written against a 0.5..500 frustum): a 0.5 m cube's shadow sat **53 px** from the cube, now 1 px. The same scene at 10x used to render differently; now it does not. |
| 1.5 | ~~**A procedural material library**~~ **done, Phase 53.** `{ preset: 'brushed-metal' }` fills `map`, `roughnessMap` and `normalMap`; the AK-47 film adopted all four. | Surface detail, as deviation from a 5x5 neighbourhood: wood **x141**, fabric **x25**, metal x3.0, concrete x2.4 on a test cube; on the AK-47, receiver x5.0, stock x13.9, wall x20.5. |
| 1.6 | ~~**Area lights.**~~ **done, Phase 55.** `type: 'area'` with `width`/`height`, aimed by `target`. | On a chrome sphere: highlight **x3.9** in area, **x2.0** in width, and shaped like the light instead of like a dot. The caveat the plan did not know: `RectAreaLight` casts **no shadow map**, so the penumbra half of the claim needs a paired directional or the AO pass, and the compiler says so. |

**Tier 1 is complete.** Six items, five of them defaults a film gets without
asking (environment, bevel, shadow fit) or one line (`ssao`, `preset`,
`area`). What remains of the realism gap is Tier 2, which is light transport,
plus the eleven engine gaps in [43-DCC-PARITY.md](43-DCC-PARITY.md) -- of
which the next three are an orthographic camera, drivers and UV projection.

### Tier 2 — light transport

Three.js has no global illumination, and that is the honest remainder of the
gap to Blender. The reference's shadows are filled by light that bounced off a
wall; ours are filled by a constant ambient term, which flattens everything it
touches.

This is where an **offline renderer should not pretend to be a real-time
one**. We already render headless, frame by frame, with no interactivity
budget. Options, in increasing cost and fidelity:

- ~~**Irradiance from the environment only** (spherical harmonics). Nearly
  free, already implied by 1.1, and it is most of what "ambient" should have
  been.~~ **Already shipped, in Phase 49, and better than this plan.** A
  prefiltered PMREM is a more accurate answer to the same question than an SH9
  projection of it, and it carries indirect specular too. Rebuilding it as
  spherical harmonics would be a downgrade with a longer changelog.
- ~~**Baked irradiance probes** over the set, sampled per object. Minutes once
  per film, then free per frame. The right answer for a static set with moving
  characters, which describes almost every film here.~~ **Shipped, Phase 72**,
  as `meta.bounce`. A cube render per probe prefiltered to a PMREM and assigned
  per object -- a cube map rather than SH9 because three's materials sum light
  probes GLOBALLY, so a per-object SH probe would mean patching every
  material's shader, while `material.envMap` is per material and already
  works. One bounce, baked once, free per frame: **38 ms** for one probe at
  64^2. *Proof:* a white card beside a red wall lifts its red radiance
  **44.8%** against **1.7%** blue, with a black-wall control at **1.7% on
  every channel** and R/B **1.0000**.
- **A path-traced tier** (`three-gpu-pathtracer` or equivalent) for a `master`
  quality level. Minutes per frame, not milliseconds -- but this engine
  renders offline and already has a take cache, a render lock and a resumable
  queue in the plan. This is the only route to parity and it should be left
  architecturally possible even if it is never the default.

### Tier 3 — content, not engine

The AK-47 is built from cubes, cylinders and a torus. No amount of shading
rescues geometry that has no curvature or wear. Phase 45's asset pipeline is
the answer and it already works; what is missing is using it. **This is not an
engine defect and should not be fixed in the engine.**

## The architecture

One principle, because it is what keeps this from becoming a pile of flags:

> **Quality changes how finely the frame is sampled. It never changes what is
> in the frame.**

Timing, layout, camera, composition and colour are identical at every tier.
A draft render and a master render differ in sample counts and resolution and
in nothing else, so a draft is a trustworthy preview and the existing
determinism guarantee -- frame N is a pure function of N -- survives intact.
This is also what makes a proxy render, already item 7 of the audit, actually
usable.

### `meta.quality`, one word that moves six dials

```
   tier       scale   msaa   shadow   AO    env      bitrate      use
   draft      0.5x      0     512    off   sh only   0.5x      iteration
   preview    1.0x      4    1024    on    dome      1.0x      review
   final      1.0x      8    2048    on    dome      1.5x      delivery
   master     2.0x      8    4096    on    probes    2.5x      the one that ships
```

`scale` is a **supersample factor**, not an output size: the frame is rendered
at `scale x` the output and resolved down. It is listed first because it is
the one dial that fixes aliasing regardless of what the post chain does, which
Finding 1 shows SMAA does not. It costs fill rate, which is cheap, and -- 
unlike motion blur's accumulator, which pays `getImageData` per subframe -- 
the downsample stays on the GPU as a single blit. Motion blur cost 19.8x for
8 subframes because of readback; supersampling at 2x should cost close to its
4x fill and no more.

Output size stays `WIDTH`/`HEIGHT`, with named shorthands (`360p`, `480p`,
`720p`, `1080p`) resolved against the film's aspect so that `meta` never has to
restate it. Both the 2D and 3D scripts read the same resolver, because the
drift between the two paths is itself a standing problem in this repo.

### Where each piece lives

```
  src/core/render/quality.js      pure: tier -> every number above. unit-testable
                                  with no browser, like post.js and motionBlur.js
  src/core/art/environments.js    pure: procedural studio dome and sky as pixel data
  src/core/art/materials.js       pure: procedural albedo/normal/roughness synthesis
  src/core/geom/bevel.js          pure: bevelled box and extrude generators
  src/render/post3d.js            reads samples from the tier; multisampled target
  src/render/supersample.js       render-scale resolve, GPU side
  src/backends/three3d/           consumes the tier for shadows, AO, env
  scripts/lib/resolution.mjs      shared by produce.mjs and produce3d.mjs
```

The split follows the rule the rest of the engine already follows: **anything
that is numbers stays in `core/` and is tested without a browser**;
`src/render/` and `src/backends/` are the only places that touch THREE. That
is why `motionBlur.js` exists twice and it has paid for itself.

### How each is checked without a screenshot

Rule 3 of the queue. Every item above has a number attached:

- **Anti-aliasing**: the intermediate-pixel fraction used in Finding 1. A
  threshold of 40% passes a resolved frame and fails a point-sampled one, with
  the three measurements above as the calibration.
- **Environment**: the metal-to-dielectric luma ratio from Finding 2. A metal
  region must gain materially more than a dielectric one.
- **Bevel**: the count of distinct specular maxima along a silhouette; a hard
  edge has none.
- **Shadows**: penumbra width in pixels against the light's declared extent.
- **Bitrate**: bits per pixel per frame against the tier's target.
- **The determinism rule**: the same film at `draft` and at `master` must agree
  on every compiled timing and layout value. That is a unit test, not a render.

### Phasing

Tier 0 is one evening and is worth more than everything after it, because
Finding 1 is currently degrading every film in the repository. It should jump
the queue. Tier 1 is the bulk of the look and is roughly one phase per row.
Tier 2 is a research phase and should not be started until Tier 1 is proved on
a real film.

## Deferred: the motion blur verdict

Phase 47 shipped motion blur proved against its own physics -- a bar travelling
11.7 px/frame smeared 5.8 px at 180 degrees and 11.7 px at 360, both within a
pixel of prediction. What was *not* established is whether it reads as blur to
a viewer, and the first attempt to judge that by eye was inconclusive.

The reason is now clear and it is Finding 1 and Finding 2, not the blur: a
flat-shaded box with a point-sampled staircase edge has almost no
high-frequency detail for a shutter to smear in the first place. **The blur
has little to destroy.** Re-judging it before Tier 0 and Tier 1 land would
measure the wrong thing.

The validation to run afterwards is a subject with dense high-frequency detail
moving fast across frame, and the honest test is numerical rather than
perceptual: a fine stripe or resolution chart loses contrast at a rate the
shutter angle predicts exactly, so "did the detail survive" becomes a measured
modulation-transfer figure instead of an opinion. That is the same move as
Phase 46's ducking proof -- derive the expected number, then measure it.
