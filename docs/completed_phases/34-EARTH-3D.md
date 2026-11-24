# The 3D engine, tested against a minute of film

A live test: **"Inside the Earth"** — a presenter says what the engine can do,
and then the engine has to do it. Sixty-five seconds, 1920×1080, H.264/AAC, a
sectioned planet with true-scale layers, nine spoken lines, callouts that track
the geometry, a synthesized score.

The film is the point only insofar as it is the instrument. The findings are
§3 onward.

**Build it:**

```
npm run make:earth-audio    # synthesize the score and effects
npm run make:earth          # write films/earth3d.json
npm run check:earth         # compile, framing, exposure, overlay — seconds
npm run render:earth        # 1920x1080 H.264/AAC
```

---

## 1. What the brief asked for, and what it exposed

The brief was one minute of a man explaining the Earth's layers, "realistic
like most 3D animations". Three words in that sentence are each a different
hole in this engine:

| The ask | What it needed | What existed |
|---|---|---|
| "realistic" | textures, a normal map, an atmosphere | **one flat colour per material**, and a canvas text panel |
| "cross section from the crust to the core" | a way to open a solid body | six closed primitives, no CSG, no clipping, no partial sphere |
| "a man saying…" over a diagram | subtitles, labels, a title | **nothing** — the 3D path has never put a single character of type on screen |

Plus one the brief added mid-build — **"the 3D engine should also be capable of
creating mp4 videos"** — which turned out to be a call nobody had made rather
than a feature nobody had written.

---

## 2. The film, and the two decisions worth arguing about

### The crust is drawn at true scale

The crust is 30 km of 6371: **0.47% of the radius**. Drawn honestly it is a
hairline you can barely see, and essentially every Earth-layers diagram ever
printed fattens it by a factor of ten so there is somewhere to put the label.

The narration says *"less than one percent of the planet."* A picture showing
it as a tenth would be contradicting the sentence being spoken over it. So the
film keeps the true ratio and solves legibility with a **macro shot** instead,
which is what a camera is for — and which is exactly what `staging3d`'s
part-level `on:` exemption was built for in Phase 15.

That shot is the best single frame in the film, and it is the one that could
not have been staged without being willing to look wrong first.

### The cutaway is geometry, not a clipping plane

A clip plane discards fragments. That leaves the planet **hollow**: you see
the inside of the far wall, and there is no cut *face* — and a cut face is the
entire content of a cutaway. So the section is real geometry: 270° shells plus
annular caps, with the missing quarter built as a separate group that **flies
out**, which also turns the cut from a state into an event.

Clip planes shipped anyway (§4), because they are the right tool for the other
case — sectioning a set or a prop that has no layers to reveal — and because
the distinction is worth having written down.

---

## 3. What the test found, in the order it found it

Every row is a real defect, and the column that matters is the last one.

| # | Defect | Cause | Caught by |
|---|---|---|---|
| 1 | The written film would have been **truncated with no error** | `produce3d.mjs` returned the whole video as a data URL. A multi-megabyte data URL crosses the CDP boundary short, silently. The 2D path learned this in Phase 27 and reads back in 4 MB chunks with a length check; a 50 s 720p WebM was small enough to survive and a 65 s 1080p MP4 is not | reading the 2D harness |
| 2 | **No MP4 on the 3D path at all** | `film3d.html` hardcoded `MediaRecorderSink`. The WebCodecs sink and the ISO-BMFF muxer have both been in the repo since Phase 27 and nothing on this page had ever called them | the brief |
| 3 | **No subtitles, ever** | `compile3d` has carried a `subtitle` flag on every line of dialogue since Phase 16 and **nothing has ever read it**. Every 3D film in this repo is unsubtitled | the brief |
| 4 | **Dialogue mixed ~7 dB under its 2D siblings** | the 2D harness has passed a louder `voiceLevel` since Phase 32; this page used the 0.06 engine default | reading the 2D harness |
| 5 | **A line could be cut off mid-word at a cut** | `retimeToAudio` grows a shot that is shorter than the speech in it, has existed since the screenplay phase, and is entirely shape-compatible with a 3D film. Nobody had noticed | reading the 2D harness |
| 6 | Voice models **re-downloaded from a CDN every render** | `TTS_MODULE_URL` wiring, present in `produce.mjs`, absent here. A fresh headless profile has an empty OPFS. This is what cost Phase 30 a ten-part series | reading the 2D harness |
| 7 | **No render lock** | the shared lock added in Phase 36 is taken by `produce`, `grab2d` and `narration-pacing`. A 3D render was the one job that could still OOM-kill a neighbour | reading the 2D harness |
| 8 | **The entire planet rendered black** | `normalScale: [0.45, 0.45]`. `Material.setValues` copies into the existing Vector2 with `currentValue.copy(newValue)`, and `Vector2.copy` reads `.x`/`.y` — which on an array are `undefined`. **NaN in the normal makes every lighting dot product NaN, and the surface renders black.** Not magenta, not missing — black, which looks exactly like a lighting bug. Three hypotheses (shadow acne, light direction, colour space) were checked before the actual cause, which is a two-element array | **a screenshot** |
| 9 | The cutaway rendered at **0.029 mean luma** | the sun sits at (4.2, 2.6, 3.4), the exposed cut face points at (−0.65, 0.28, 0.71), and the dot product is **0.07** — within four degrees of edge-on. A section light was needed and the shot had none | the exposure check |
| 10 | Every camera was **far too close**; the planet overflowed the frame in all four of its own shots | placed by eye at 2.3–2.6 m from a 1 m planet. `d = r / (f·tan(fov/2))` was never written down. And the framing check passed all four, because **none of them declared a `framing` to be checked against** | the framing check, once the shots declared something |
| 11 | The slate printed **through its own subtitles** | authored at y: 0.915, which is where a caption goes | the overlay check |
| 12 | Two callouts ran **three-quarters off screen** | authored at offset −118 and the shot pushes in until the anchor is 10 px from the frame edge. A label's side was a fixed preference, not a constraint | the overlay check |
| 13 | The overlay check reported **28 findings, none of them real** | it checked the whole draw list and reported every subtitle for sitting in the subtitle band, which is where a subtitle goes. The two real findings were buried under them | reading the output |
| 14 | The staging check measured type at **twice its size** | everything positional in the overlay is a fraction of the frame and everything typographic was in absolute pixels. The check renders at 960×540 and the film at 1920×1080. The 2D path learned the same lesson from the other direction in Phase 30 | the same false findings |
| 15 | Clouds at **twice the opacity they should be** | 0.92 on an alpha plate whose bright cells are near 1.0 and large. Almost every continent was under opaque cloud | **a screenshot**, then the digest |
| 16 | The **star field was invisible** | a sky plate has a mean of 13 in 255 — that is what a sky looks like — and ACES maps it to 0.03 before the grade's vignette takes another third. The texture was bound correctly the whole time. A sky is not a surface being lit; it is the reference white of the shot (`toneMapped: false`) | **a screenshot** |
| 17 | **Five specular hotspots on one ocean** | five directional lights. A directional light is infinite: there is no way to light a presenter without also lighting the planet two metres away | **a screenshot** |
| 18 | The studio floor **washed across the macro shots** | the section light was directional, so a light strong enough to read the cut face also lit a floor forty degrees away. Replaced with a 26° spot | **a screenshot** |
| 19 | The finished mix **clipped at +0.3 dBFS** | `renderMix` had `master.gain.value = 1` and no limiter, no ceiling and — worse — **no report**. A bed at 0.3, dialogue at 0.14 RMS and a swell at 0.42 summed past full scale, the encoder clipped it, and every check in the repo passed the file | `measure-audio.mjs`, pointed at the finished file afterwards by luck |
| 20 | The ice sheet was a **white bar from 55°N** | two hard latitude bands, straight-edged, over ocean and land alike | the texture previewer |
| 21 | The cloud plate had **hard horizontal streaks** | a latitude ramp running from near-black to pure white, multiplied in: a multiply against 1.0 leaves the noise untouched while its neighbours at 0.17 are erased, and the eye reads the boundary as a drawn line | the texture previewer |
| 22 | The star plate was **television static**, half the sky lit | `contrast` is `(n − 0.5)·k + 0.5`, so at k = 14 every value above 0.536 saturates to 1 — a fair coin per texel. **Sparseness is a property of the ramp, not of the contrast** | the texture previewer |
| 23 | The digest reported `cover=17229396.9%` | a projected bounding box is only meaningful while the object is in front of the camera; past the camera plane the perspective divide blows up | the digest, on itself |
| 24 | The digest called a blue Earth **"grey"**, then **"white"** | averaging RGB over a bounding box includes 21% black background and desaturates; taking the brightest quarter instead measures *cloud*. "What colour is this" is a question about the **most common** colour, not the mean one | the digest, on itself |

**The split is the finding.** Sort that table by what caught each row:

- **Structured checks** caught everything *geometric, temporal or typographic* —
  framing, exposure, camera planes, caption collisions, off-frame labels,
  truncated reads. Things with a computable right answer.
- **Screenshots** caught everything about *material and light* — a black
  planet, heavy cloud, an invisible sky, five suns, an intruding floor.

That split is not a coincidence, and §7 is what to do about it.

---

## 4. Built

### `core/art/textures.js` — procedural textures

The 3D path had exactly one texture: a slide drawn with a 2D context. Every
other surface in every 3D film in this repo is one flat colour with a PBR
roughness, and that is the single largest reason a 3D frame here reads as a
diagram rather than a photograph.

A texture is a **stack of layers** composited in order — `solid`, `gradient`,
`noise` (fBm, optionally ridged), `polygons` (filled in equirectangular
degrees), `latitudeBand` — each with a blend mode, an alpha and a mask. A
first pass had one `kind` per texture; that collapses the moment a surface
needs two, which is every real surface.

Three design points earned by being wrong first:

- **Masks multiply, and several of them.** A desert is "on land, AND away
  from the poles, AND not on the equator" — three conditions. With a single
  mask slot the only way to express it is to bake latitude into the noise,
  which is what put sand in Siberia.
- **A layer with `alpha: 0` still defines a mask.** That is how a latitude
  zone becomes a shape for something else to stop at, and how the polar ice
  got a ragged coastline instead of a ruled line.
- **Texel centres, not corners.** At `v = y/height` the top row sits exactly
  on the north pole, where an equirectangular map has zero width — so the
  first row of a latitude gradient was the pole colour across the whole image.

It returns **bytes, not a canvas**: pure arithmetic over a `Uint8ClampedArray`,
importing neither THREE nor the DOM, so it is unit-tested in Node like
everything else in `core/`. The browser side is `putImageData` plus
`new CanvasTexture`.

`normalFromHeight` derives a tangent-space normal map by central differences,
wrapping in x and clamping in y, so a ridge in the shading is a ridge in the
colour rather than two independently seeded noises lighting the terrain from
nowhere.

**`scripts/preview-texture.mjs`** paints any spec to a PNG in Node with no
browser, using `zlib.deflateSync` and four chunk headers. Rows 20–22 of §3 were
all found with it, in seconds each, and none of them would have been found
otherwise because looking at a texture used to mean rendering a film.

### `core/art/overlay.js` + `render/Overlay2D.js` — the screen layer

Subtitles, titles and world-anchored callouts, as **one mechanism**. They
differ in where the position comes from and nothing else: a subtitle is a text
box at a fixed screen position, a title is a text box at a fixed screen
position, and a callout is a text box at a *projected* screen position with a
leader line. Three subsystems with three sets of timing, fade and safe-area
rules would be three places for the same bug.

`overlayAt` returns a **draw list** — rects, lines and positioned runs of text
— and `Overlay2D` executes it on a 2D context. The split is not ceremony:
layout is where the bugs are, and rows 11–14 of §3 are now Node assertions over
a plain array instead of something you find at frame 847.

Three things it does that are not obvious:

- **It composites, it does not draw into the scene.** The backend's
  `canvas()` returns a composite canvas that blits the WebGL frame and then
  the overlay, so `OfflineRenderer` needs no change at all. A CSS layer over
  the canvas would be invisible to `MediaRecorder` and to `VideoFrame` — it
  would show in a preview and be absent from the file, which is the worst
  failure shape there is.
- **It draws after the post chain.** ACES crushes pure white to about 0.84,
  bloom smears a caption's edges, and DOF puts type out of focus whenever the
  focal plane is not at the camera. Drawing last is the only place type stays
  type.
- **A label behind the camera is dropped, not clamped.** `Vector3.project`
  divides by w, and behind the camera w is negative — so the point comes back
  mirrored through the frame centre, *inside the frame*, looking entirely
  valid. No numeric check could have caught it, because the numbers were in
  range.

Labels also **flip** to the other side of their anchor rather than running off
the frame, which removes a note that would otherwise recur once per camera
move.

### MP4 on the 3D path

`film3d.html` now chooses its encoder the way `studio.js` does: WebCodecs
H.264 into the ISO-BMFF muxer, falling back to paced MediaRecorder WebM, and
**refusing** to silently hand back a WebM when MP4 was asked for by name.

Measured: 1570 frames at 1920×1080 in **214 s wall**, which is 3.3× faster than
real time. The old path could not have been faster than real time at all —
`MediaRecorder` is paced, with a hard ceiling of 1000/fps ms per frame.

Verified structurally, not by eye: `avc1` Main@L4.0, `stts` a single run of
1570×1000 at timescale 24000 — **constant 41.67 ms, no drift** — and an AAC
track averaging 286 bytes per frame, which is real speech and not the 6-byte
silent frames that cost Phase 37 a finished advert.

### Geometry: sphere sweeps, caps, and pivots

- `sphere` now passes `phiStart`/`phiLength`/`thetaStart`/`thetaLength` — four
  parameters THREE has always had and this adapter never passed. Their absence
  is why a cutaway was impossible. A planet opened to its core is a stack of
  concentric hemispheres.
- `circle` / `ring` — the cap on a sectioned body. A layer *is* an annulus:
  the mantle's cut face is a ring between the core and the crust.
- **A part with no geometry is a pivot, not a cube.** "Tilt the planet 23.4°
  and spin the globe inside that tilt" is two nested rotations about two
  different axes, and a node has one rotation. Defaulting to a cube meant the
  only empty transform available was an invisible mesh — and an unknown
  geometry kind makes the backend skip the node, silently orphaning everything
  parented to it.
- An authored `visible: false` now reaches the scene node. `set visible` has
  been a channel since Phase 14 and nothing ever applied the **authored**
  value, so a part meant to appear part-way through a film was on screen from
  frame one.

### Clipping planes and the `cut` verb

`meta.clip` declares planes; a material names them with `clip: [...]`; the
`cut` verb animates one. The plane is an ordinary scene node carrying its
distance on `position.x`, because `PoseApplier` already understands scalar
transform channels and a plane's distance is one number — a new target type
would mean teaching the poser, the evaluator and the budget estimator about
clip planes in order to animate a float they can all already animate.

`clipIntersection` is the parameter that decides what a *pair* of planes
means, and its default is the opposite of what a cutaway wants: `false` clips
the **union** of the half-spaces and takes away three quarters of a sphere;
`true` clips only their **intersection** and takes away the quarter-wedge. One
boolean, and it is the whole difference between a notch and a quarter left
standing.

A raw `ShaderMaterial` does **not** get clipping for free the way a built-in
material does, so the glow material carries the four clipping chunks
explicitly — without them an atmosphere stays whole across a cutaway and seals
the notch shut.

### `glow` — a view-dependent rim

The one effect that cannot be configured, because it depends on the angle
between the surface normal and the view direction and no PBR parameter exposes
that. It matters out of proportion to its size: a planet without a limb glow
reads as a painted ball however good its albedo is.

Rendered on the **back** faces of a slightly larger sphere, blended additively,
with `abs()` on the facing term — without it the shell is dark and the glow
appears only as a ring of z-fighting.

### `spin`, `squash`, and the Vector2 guard

`spin` and `squash` close a row STATUS has carried since Phase 35
("`squash`/`spin` in 3D — 2D only"). `squash` **preserves volume**: the two
widening axes go as the square root, so the product of the three scales is 1.
Scaling one axis up and the other down by the same number changes the volume,
and a ball that gains mass on impact is the clearest tell of hand-typed squash.

`VECTOR2_PROPS` is row 8 of §3 — the third instance of the same bug.
`COLOR_PROPS` exists for a string where THREE wants a `Color`. This is the same
hole one type over, and the general lesson is that **spreading unrecognised
keys into a THREE constructor is free until it is silent.**

### The framing check grew a `macro` band

The three existing bands top out at 240% of frame height, which assumes the
subject is a thing you could step back from. A cutaway explainer is the case
they do not cover: a shot of the crust layer measures the whole crust *shell*,
because there is no node whose bounds are "the thin part", so a correctly
framed macro reports 4300% and reads as an error.

Without the band the only options were a warning on every build or dropping
`on` and switching the check off for the four shots that are the body of the
film. A band that admits the case keeps the check running on them.

### The mixer grew a master stage

Row 19. A measured true peak and one flat gain, not a compressor: a
`DynamicsCompressorNode` would be one line and is the wrong answer here — it
changes the shape of the programme, it is tuned by four parameters nobody in
this repo has a reason to have an opinion about, and the contract of this
pipeline is that the output is a pure function of the input. Scaling by one
number preserves every relative level exactly and is what a mastering engineer
does first anyway.

It **reports** either way, which is the part that was missing: a mix that had
to be pulled back is a cue to fix the gains, not a safety net to lean on.

### The voice gateway, and two more engines

`VoiceRegistry` was already the right abstraction — `<provider>:<voice>`, a
four-method interface, a fallback ladder that says out loud when a line came
out in someone else's voice. What was missing is that **registration order was
written out by hand at four call sites**, and they had drifted: the 2D path
registered a vendored Piper plus a VoiceStudio if configured; the 3D path
registered Piper from a CDN and nothing else. A film cast on a cloned voice
rendered in that voice in 2D and in a Piper preset in 3D.

`core/voice/gateway.js` is now the single list, and it carries two new engines:

| Engine | Spec | Runs | Clones | Licence |
|---|---|---|---|---|
| VoiceStudio | `voicestudio:` | a local app you start | yes | its own |
| **OpenVoice V2** | `openvoice:` | an HTTP server you start | **yes** | MIT |
| **Kokoro 82M** | `kokoro:` | browser, ONNX | no | Apache-2.0 |
| Piper | `tts:` | browser, ONNX, vendored | no | MIT |

Registration order *is* fallback order, so it is a statement about what should
speak when the cast voice cannot: a named human first, a cloner second, the
best-phrasing preset third, and the one that is always there at the bottom.

Two things worth keeping:

- **Piper's provider id is `tts`, not `piper`.** Every film in this repo is
  cast as `tts:en_US-amy-medium`. Renaming it would be a one-line change and a
  silent re-cast of eight series — `resolve()` finds nothing for `tts:`,
  returns null, and the ladder hands every line to whoever is first. That is
  the Phase 33 defect exactly. So the engine is called `piper` where a person
  reads it and `tts` where a spec is parsed, and `SPEC_PREFIX` is the join.
- **Kokoro registers only when asked for.** It could always work — it is a CDN
  fetch away — and a provider that is always available and always 86 MB does
  not belong silently in a fallback ladder.

`npm run voices` prints what exists, what it costs and what it needs, from a
table, touching no network. Choosing a voice should not cost a model download
to find out it was not available.

---

## 5. "Spaces at the joints" — both readings

The brief named gaps at the joints of animations. There are two different
things that could mean and both are real here.

### Geometric: where limbs meet

The humanoid's surfaces are swept bone-to-bone and **butt-jointed** — the
upper arm ends exactly where the forearm begins. For two rigid tubes that
would open a gap on the outside of every bend: at a 90° elbow with a 45 mm
radius it is 2·r·tan(θ/2) ≈ **90 mm of daylight**.

It does not happen, because the mesh is skinned and vertices near the joint
blend between the two bones. What happens instead is the opposite failure —
the joint **collapses**, losing volume, which is what the driven correctives
added in Phase 24 exist to push back out. The honest statement is: *the 3D rig
does not gap at the joints; it pinches, and that is partly corrected.*

Where it genuinely does gap:

- **Fingers did**, and were fixed by overlapping rather than butt-jointing
  them — three joints at 76° is not a shallow elbow (Phase 25).
- **Rigid assemblies still do.** Any hinged `parts` assembly — a jaw, a hatch,
  a landing gear — is butt-jointed and unskinned, and will open exactly the gap
  above. Nothing checks for it and no film in the repo has hit it yet.
- **Twist is undefined.** A forearm pronates about its own axis and this rig
  has no bone for it, which is also why a hand's roll under IK is arbitrary.

### Temporal: where shots meet

This is the one that bites, and it is the better reading.

**`compile3d` has no transitions at all.** The 2D compiler references
transitions in 22 places; the 3D compiler in zero. Every cut in every 3D film
in this repo is a hard cut, which is the same finding Phase 30 recorded for the
2D path — *"every transition in six finished films being a hard cut"* — arriving
on the other path, unfixed.

The related gaps, two of which are now closed:

| Gap | State |
|---|---|
| A shot shorter than its own dialogue cut the line off | **closed** — `retimeToAudio` now runs on the 3D path |
| A shot longer than its content plays over silence | open — nothing measures it on the 3D path; `narration-pacing` is 2D-only |
| No transition of any kind between 3D shots | **open**, and the biggest of them |
| Nothing can say "start when that lands" | open — a crater and the round that makes it are timed independently against the same clock and nothing checks they agree |

---

## 6. Rendering performance and browser scalability

Researched rather than assumed, because the obvious answer is wrong.

### WebGPU is not the move yet

three.js's own manual still calls `WebGPURenderer` experimental and says
plainly that *"depending on your application and scene setup, you will
encounter missing features or a better performance with `WebGLRenderer`"*, and
that `WebGLRenderer` remains the recommended choice for WebGL 2 applications.
Independent reports on r181/r183 put WebGPU behind on many-mesh scenes — ~2×
slower on CPU and 5–10× slower to first frame in some tests. Support sits
around 70–80% of browsers, so a fallback is mandatory regardless.

**Where it does win is compute**: particles, simulations, GPGPU. This engine's
particles are deliberately closed-form (frame N is a pure function of N, which
is what makes them seekable), so the one thing WebGPU is clearly better at is
the one thing this engine has decided not to do that way.

**Recommendation: stay on WebGL 2.** Write new shader work in TSL where it is
cheap to, since TSL transpiles to both WGSL and GLSL, and keep the renderer
behind the seam it is already behind (`SceneAdapter` takes THREE as an
argument). Revisit when the cloth and fluid solvers are the bottleneck, which
they are not.

### Where the time actually goes

Measured on this film: **214 s for 1570 frames at 1920×1080 including encode**
— 136 ms/frame. For comparison `demo/rig3d.json` renders at 41 ms/frame at
960×540, which is 4× fewer pixels. The cost is close to linear in pixels, which
means it is **fill-bound, not draw-call-bound** — 120 nodes is nothing.

So the levers that matter, in order:

1. **The post chain.** Four passes at full resolution. Bloom alone is a mip
   pyramid per frame. Half-resolution bloom and SSAO are the standard answer
   and are not wired.
2. **Shadow map resolution.** One 1024 map, which is fine, but it is re-rendered
   every frame for a scene that barely moves. A static-light scene can render
   the shadow map once.
3. **Texture upload.** Ten procedural textures totalling ~34 MB of RGBA are
   painted on the CPU at startup. For delivery that should be KTX2/Basis
   (GPU-compressed, ~6× smaller, no decode) — but note the trade: the whole
   point of procedural textures here is that the repo does not ship binaries.
   The right split is procedural for authoring, KTX2 for publishing.
4. **Geometry is already cheap** and `mergeGeometries` is already used for the
   humanoid.

What is *not* worth doing: instancing (there is nothing repeated), LOD (nothing
is far away), a BVH (nothing raycasts per frame).

### For the browser, not the render farm

The published artefact is an MP4, so browser scalability is really about the
*editor*. The three things that would matter there and are absent:

- **`OffscreenCanvas` in a worker.** The render loop is synchronous by
  contract, which is what makes offline rendering possible — but it means a
  long render freezes the tab. The sink interface is already the right seam.
- **A frame budget that degrades.** `preflight` measures cost and warns, but
  nothing *adapts*: there is no "drop SSAO if p95 exceeds the ceiling".
- **Progressive texture synthesis.** Painting a 2048×1024 albedo plate takes
  ~9 s on the CPU and blocks. It is per-texel pure, so it is embarrassingly
  parallel across workers — and `core/kernels` already has a worker pool.

---

## 7. Token expenditure through the MCP bridge

This is the part of the brief with a counter-intuitive answer.

### Measured

Building this film, by category:

| What | Count | ~Tokens each | ~Total |
|---|---|---|---|
| Rendered frames read as images | 14 | ~2,000 | **~28,000** |
| `CHECK=1` structured runs | 8 | ~300 | ~2,400 |
| Texture previews read as images | 6 | ~1,800 | ~11,000 |
| `DIGEST` runs (after it existed) | 4 | ~450 | ~1,800 |

Published measurements agree on the per-image figure: a study of 25,457 agent
tool results found a **median of 2,054 tokens per screenshot** with a p99 over
6,000, while an accessibility-style text snapshot of the same page runs 2–5 KB
against 100 KB+ for the image.

**Roughly 85% of the tokens spent building this film went on looking at it.**

### Why continuous vision makes it worse, not better

The brief proposed giving the agent real-time sight of the screen instead of
screenshots. It is the most expensive option available, not the cheapest: a
video stream *is* N screenshots. At one frame per second a 65-second film costs
**130,000 tokens to watch once** — five times what the entire build cost.

Chrome DevTools Protocol does expose `Page.startScreencast`, and Chrome
DevTools MCP exposes a `screencast_start` tool, so the capability is real. The
economics are not. Continuous vision only pays when the agent must *react* to
something it cannot predict — driving someone else's UI, watching a live
system. It does not pay for inspecting output the agent itself generated
deterministically.

### What actually works: make the engine answer, not the agent look

The §3 split says exactly where the money goes. Structured checks already
covered the geometric and typographic defects at ~300 tokens. The expensive
column was **material and light** — "what colour did this end up" — and that is
computable too, it had simply never been computed.

**`core/script/digest.js`** closes it. For a given time it reports, per named
subject: screen-space box, frame coverage, mean luma, dominant hue, plus a
frame-wide luma histogram and every string of overlay text.

```
t=22 open luma=0.081 [0..0.984] hist=85/9/1/0/3/1
  earth: box=30,17,89,98 cover=48% luma=0.146 orange
  host: box=81,45,100,100 cover=10.5% luma=0.069 blue CLIPPED
  text: "Cut it open, and it is four layers."
```

**~420 tokens for a whole film** against ~2,000 for *one* screenshot — about a
**40× reduction** for the questions it can answer.

It would have caught row 8 — the black planet — instantly and for nothing:
`earth: cover=50% luma=0.02` is a planet that is on screen and black, and
`checkDigest` says so by name. Three screenshots and two wrong hypotheses went
into finding that by eye.

Three things the digest had to get right, each of which it got wrong first:

- **Clamp the box to the frame.** An unclamped projected box past the camera
  plane reported `cover=17229396.9%`. A number like that is worse than no
  number, because a reader has no way to know it is meaningless.
- **Hue is a mode, not a mean.** A mean of blue and white is grey, and nothing
  in the frame is grey.
- **Report text as text.** Overlay strings are the one thing on screen that is
  already language; hashing or boxing them throws away the cheapest
  information in the frame.

### The policy that falls out

1. `check` first — compiler, framing, exposure, overlay. ~300 tokens, catches
   the computable class.
2. `digest` second — what is on screen, as numbers. ~400 tokens for a film.
3. **A screenshot only when a number is surprising, or when the question is
   genuinely "does this look like a planet".** That question is irreducible and
   worth 2,000 tokens a handful of times per film — not per iteration.

Expected cost for a film of this size under that policy: **~6,000 tokens of
looking instead of ~39,000.**

### The other half: what the bridge sends

`mcp/server.js` serialised every result with `JSON.stringify(value, null, 2)`.
Two spaces of indentation per level and a newline per field, on documents
nested four deep, for ~40% more tokens than the same data compact — and no
model parses indented JSON better than compact JSON. Now compact, and plain
text where plain text is available (`formatDigest` is about a fifth of the
same data as JSON).

And the bridge had **no 3D tools at all**. `load_film` / `check_film` /
`render_film` drive the 2D compiler; `compile3d` — shots, cameras, characters,
cutaways, textures, overlays — had no tool of any kind. Added:
`check_film_3d`, `digest_film_3d`, `grab_frames_3d`, `render_film_3d`,
`list_voices`, each with a description that says what it costs relative to the
others, because an agent choosing between tools should be told the price.

### On the Chrome extension

Worth being precise. Driving a real browser is the right tool for exercising
the *editor* — clicking through panels, confirming a control does what it
claims, catching a layout that only breaks at a real window size. It is the
wrong tool for inspecting *output*, because output inspection is exactly the
case where the engine can be made to answer in numbers, and a browser session
can only hand back pixels.

---

## 8. UI and navigation

Measured with **`scripts/shot-ui.mjs`**, written for this and absent before.
Every rendering lesson in this repo is "a drawing is checked by looking at it",
and there was a frame grab for 2D films, a frame grab for 3D films, a contact
sheet and a texture previewer — and nothing at all for the editors, which are
the part a person actually touches.

The tool corrected its author on the first run. The 3D editor has **120
controls in its document and shows 17 at rest** — not a wall of buttons, which
was the guess. The real findings:

| Finding | Fix |
|---|---|
| The six rail items were `div`s with click handlers — **no `tabindex`, no `role`, unreachable by keyboard** | `button` elements with `role="tab"`, `aria-selected`, `aria-controls`, and a visible focus ring |
| Their names were `:hover` tooltips at `opacity: 0`. A tooltip is not a label: it cannot be read before you point at it and never appears for keyboard or touch | permanent 10 px captions. Costs 18 px of rail width and removes the guessing |
| **Export was split across two panels under three headings** — "Export Recording" (6 buttons), "Export Formats" (4) and "Share" (2). Which one you wanted depended on knowing that "Export as Video" meant the recording and "Export Animation" meant the data | all twelve in one panel, grouped by **what you get**: Video, Project file, Animation data, Share |
| The editor's "Export as Video" records the viewport in real time; the thing most people want — a finished film with voice and subtitles — is a terminal command, and nothing in the UI said so | a hint under the Video group naming `npm run produce:3d` |
| **Five surfaces with no link between them.** `index.html`, `film.html`, `studio.html`, `draw.html` and `film3d.html` are separate programs with similar names, and a newcomer had to read the README to learn which is which | `workspace.html`, and a persistent "← Workspace" link on every surface |

`workspace.html` groups everything by **task** — Make, Check, Render, Voices,
Build a film, Known limits — in the order the work happens, not by subsystem
and not by which file something lives in. Every card says what it is *for* in a
sentence, because "Studio" and "Film Studio" are indistinguishable names for
different programs and only a sentence fixes that.

It also publishes the known-limits table, because a limit you find out about
after a render is worse than one you read first.

---

## 9. The ceiling, as it stands

Closed by this phase: no textures, no UVs on anything but a slide, no screen
text, no subtitles, no MP4, no sphere sweeps, no clipping, no pivots in
assemblies, no `spin`/`squash` in 3D, no retiming, no voice levelling, no
vendored voices, no render lock, no truncation check, no master headroom, no
way to look at a texture, no way to look at the UI, no 3D tools on the bridge,
and no cheap way for an agent to know what is on screen.

Still open, honestly:

| Missing | Consequence |
|---|---|
| **No modelling tool** | Still the largest gap, and unchanged since Phase 16. Every 3D form is typed as numbers, rendered, and looked at. No viewport, no vertex editing, no symmetry, no subdivision |
| **No transitions on the 3D path** | Every cut is hard. §5 |
| **Post is not keyframeable** | One focal plane for the whole film. This film moves from 5 m off a planet to 0.85 m off a cut face, so its aperture is almost closed and "rack focus" is in this list instead of in the film |
| **No day/night mask** | An emissive map glows on the lit side too, so city lights are dialled to 0.45 until they are invisible by day. A real one needs a custom shader or a second light-direction uniform |
| **No action dependencies** | Nothing says "open when this lands" |
| **Particles cannot collide** | Inherent to the closed form, and the right trade |
| **No per-object motion blur** | Particles stretch by velocity; meshes do not |
| **Garment simulation** | Clothing is still an inflated body. The cloth solver drapes a cape, not a sleeve |
| **Twist bones** | A forearm has no bone for pronation; a hand's roll under IK is undefined |
| **UVs on the body** | The texture system exists now and the humanoid still has no UVs to put a texture on. The next obvious piece of work |
| **Exposure is sampled, not continuous** | Two frames per shot. A one-second blown highlight between samples is invisible |
| **Framing ignores rotation** | Bounds are axis-aligned and can only overstate — the safe direction, but it is why a sphere measures ~√2 larger than it is |

A fair summary: the engine can now **build, texture, light, section, animate,
voice, subtitle, caption and encode a 3D film entirely from one document**, and
it stops precisely where a human artist would normally start — and, newly, it
can tell an agent what it just drew without being photographed.
