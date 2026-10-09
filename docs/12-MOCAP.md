# Camera motion capture

> **Status: assessment only. None of this is built.** Unlike
> [07](07-ART-SYSTEM.md)–[11](11-MOTION-SYSTEM.md), which describe shipped
> mechanisms, this is a scoping document for a requested feature: drive a
> character from a webcam reading a real person's movement.

The conclusion up front: **capture is easy, cleanup is the project, and the
aesthetics are the real cost.** A spike lands in half a day. Something usable
in a film is three to four days further. The thing that makes it *worth*
shipping is not accuracy — it is deciding that mocap is reference for an
animator rather than the performance itself.

---

## 1. The decision that sets the price

Capture must be an **authoring-time ingest that bakes a Clip**. It must not
drive the rig live.

The core contract is that **frame N is a pure function of N** — see
[01-CORE.md](01-CORE.md). That is what makes scrubbing, deterministic
re-render and golden frame hashes possible, and it is the reason smears were
built as a compile pass rather than a renderer history buffer
([11-MOTION-SYSTEM.md](11-MOTION-SYSTEM.md#3-smears--multiples)). A webcam is
wall-clock, nondeterministic, drops frames and never reproduces a take. Let it
reach the rig at render time and all three guarantees go.

So the camera lives at the edge, and the pipeline ends at a clip:

```
webcam ─> landmarks ─> retarget ─> filter ─> decimate ─> createClip()
 live       33 pts      16 rots     smooth    ~5% keys     an action
 \_________ browser only _________/ \____ pure, Node-testable ____/
```

The output is indistinguishable from the hand-authored `walk` in
[generate.js](../src/core/script/generate.js). **Core changes: zero.** Nothing
in [Evaluator.js](../src/core/anim/Evaluator.js),
[Clip.js](../src/core/anim/Clip.js) or
[compile.js](../src/core/script/compile.js) needs to know mocap exists. That
containment is the whole reason the feature is affordable.

---

## 2. What already lines up

Three things in the repo happen to fit, and they are most of why the spike is
cheap.

**Part ids already match a landmark skeleton.**
[generate.js](../src/core/script/generate.js) emits `hips`, `torso`, `neck`,
`head`, and per side `arm`, `fore`, `hand`, `thigh`, `shin`, `foot` — sixteen
parts against MediaPipe Pose Landmarker's thirty-three landmarks, a near 1:1
mapping expressible as a static table. Procedurally generated characters need
no rigging UI at all.

**A 2D joint is one scalar.** `Transform2D` gives each part a single `rot`
([Transform.js](../src/core/scene/Transform.js)). Retargeting a
position-based skeleton onto it is trigonometry:

```
theta_world = atan2(b.y - a.y, b.x - a.x)       // landmark pair for the bone
rot_local   = theta_world - sum(ancestor rots) - restAngle
```

In 3D this is the hard step — quaternion retargeting, rest-pose mismatch,
twist decomposition. Here it is `atan2` and a parent-chain sum, and
[IK2D.js](../src/core/rig/IK2D.js) already provides `forwardKinematics`,
`wrapAngle` and `chainFromParts` to do the summing.

**Facing has somewhere to land.**
[swapSets.js](../src/core/scene/swapSets.js) already carries a `view` channel
with `front` / `threeQuarter` / `profile` / `back` and a fallback order, so a
person turning sideways can swap to the profile drawing instead of shearing
the front one.

Also reusable: [MicProvider.js](../src/core/voice/providers/MicProvider.js) is
the `available()` capability probe plus `getUserMedia` shape to copy for
video, and the provider pattern from [03-VOICE.md](03-VOICE.md) is the right
shape for a capture source too.

---

## 3. The hard 80%

Ranked by how much of the actual work they are.

| Problem | Why it bites | Cost |
|---|---|---|
| **Jitter** | Landmarks wobble +/-2–3 px while you stand still. Against a 20 px forearm that is visible shake on every frame. Needs a one-euro (or equivalent low-pass) filter per channel. | ~40 lines, must-have |
| **Occlusion** | An arm crossing the torso drops its confidence and the inferred angle snaps 180 degrees. This is the single largest source of "why did the limb teleport". Needs `visibility` gating plus hold-last-good. | ~50 lines, must-have |
| **Key explosion** | 24 fps x 60 s x 16 bones = **23,000 keys**. Clips exist so a walk cycle costs ten keys; raw mocap defeats that and is uneditable by hand. Needs Ramer–Douglas–Peucker per channel, to roughly 5%. No curve simplification exists anywhere in the repo yet. | ~60 lines, must-have |
| **No depth** | Reach toward the camera and your forearm *shortens* on screen rather than rotating. A rigid cutout cannot foreshorten. Scaling along the limb axis is the cheap fake; the honest fix is the deformer already named as the largest outstanding gap. | blocked on deformation |
| **Root motion scale** | A pixel hip position means nothing until it is normalised by the performer's own on-screen shoulder-to-hip distance against the character's `torsoH`, then re-grounded. `standOnGround` in [compile.js](../src/core/script/compile.js) is the landing. | ~30 lines |
| **Facing** | Shoulder-width ratio classifies front / three-quarter / profile and writes the existing `view` swap channel. Cheapest real win on the list. | ~20 lines |

Decimation deserves emphasis because it is an *architectural* requirement, not
a nicety. A baked 23,000-key clip would be technically correct and practically
worthless: nobody can adjust it, and it contradicts the reason
[Clip.js](../src/core/anim/Clip.js) instances cycles instead of baking them.

---

## 4. The cost nobody budgets for

**Mocap is the opposite of the twelve principles.** It has no anticipation, no
exaggeration, no squash and stretch, no snap, and it is inherently smooth on
ones. Everything [11-MOTION-SYSTEM.md](11-MOTION-SYSTEM.md) added — the
on-twos texture, the overshoot and anticipation shares in
[principles.js](../src/core/anim/principles.js) — is flattened by it. Raw
mocap on an anime cutout rig reads as rotoscope. That is a real style, used
deliberately in *Take On Me*, *Waking Life* and selectively in *Spider-Verse*,
but it is not what [09-PRINCIPLES.md](09-PRINCIPLES.md) is aimed at.

So the framing that makes it worth building is **mocap as blocking and
reference, not as the performance** — capture the timing and the gross
trajectory, then exaggerate on top.

And that composition already works, with no new code:

```json
{ "do": "play", "action": "mocap-take-3" },
{ "do": "play", "action": "anticipate", "weight": 0.8 }
```

The captured clip is the `override` base; hand-authored poses layer over it as
`add`. The layered evaluator built in Phase 13 is exactly the mechanism this
needs, which is a good sign about the order those phases were done in.

A corollary worth stating: **the decimation should snap keys to the `step`
grid** when the film is on twos, or captured motion will be the one smooth
element in a film whose texture is deliberately choppy.

---

## 5. Sketched schema

Per character, because part ids are authored. Generated characters get a
built-in default table.

```json
"mocap": {
  "source": "pose-landmarker",
  "map": {
    "armL":   [11, 13],   "foreL": [13, 15],   "handL": [15, 19],
    "thighL": [23, 25],   "shinL": [25, 27],   "footL": [27, 31],
    "torso":  [[23,24], [11,12]],
    "head":   [[11,12], 0]
  },
  "filter":   { "cutoff": 1.2, "beta": 0.04 },
  "minVisibility": 0.6,
  "tolerance": 0.015,
  "root": { "from": 23, "normaliseBy": [11, 23] }
}
```

A pair is a bone's two landmarks; a nested pair is a midpoint, which is how
the torso and head read from shoulder and hip centres. `tolerance` is the
decimation error budget in radians — the one knob that trades key count
against fidelity.

---

## 6. Effort

| Tier | What you get | Cost |
|---|---|---|
| **Spike** | You wave, the character waves. Landmarker from CDN, angle retarget, bake to a clip. Jittery; limbs snap on occlusion; no root motion. | ~150 lines, **half a day** |
| **Usable in a film** | Plus filtering, visibility gating, decimation, root scale, facing swap, `mocap:` schema block, and a record / retake / trim surface in `studio.html`. | **+3–4 days** |
| **Production** | Foreshortening (needs the deformer), foot locking through the existing IK, finger capture, an exaggeration pass that re-introduces anticipation and overshoot. | **weeks**, gated on deformation |

What it does **not** need, which is as important as what it does: no server, no
WebGL, no model training, no new node kind, no skin weights, no change to the
core. The WASM model is a few megabytes and service-worker cacheable, which
the PWA already does for the Piper voices
([CDN-AND-PWA.md](CDN-AND-PWA.md)).

---

## 7. Verification

The usual split from [05-PHASES.md](05-PHASES.md) applies, and it is unusually
favourable here: **everything after capture is a pure function.**

Record a landmark stream once into a JSON fixture — thirty-odd frames of a
real wave, including a deliberately occluded arm — and commit it. Then, with
no browser:

1. **Retarget** — fixture in, rotations out. Assert a known elbow angle, and
   assert that a straight arm gives a near-zero local `rot` regardless of
   where the shoulder is on screen (the test that catches a missing
   parent-chain subtraction, which is the bug this step will actually have).
2. **Filter** — a square-wave channel in; assert monotone convergence and no
   overshoot past the input range.
3. **Visibility gating** — the occluded span in the fixture; assert the output
   holds the last good angle instead of snapping, and that it is not
   interpolated *across* the gap as if the data were good.
4. **Decimation** — assert key count falls below a threshold **and** that
   resampling the decimated track stays within `tolerance` of the original at
   every original sample. Both halves matter; either alone passes trivially.
5. **Bake** — the emitted clip loads through
   [compile.js](../src/core/script/compile.js) and survives `validate`, with
   `analyseMotion` reporting non-zero movement.

Only step 0 — getting landmarks out of a camera — needs headless Chrome, and
it needs it once, to produce the fixture.

---

## 8. The higher-ROI cousin

If the goal is "use my camera to drive the character", **face capture is the
better first build.**

MediaPipe's Face Landmarker returns fifty-two ARKit-compatible blendshapes
including `jawOpen`, `mouthPucker` and `mouthFunnel`. Those map directly onto
the existing viseme swap set, and they would beat the current lipsync tiers in
[03-VOICE.md](03-VOICE.md) — text-driven with an envelope gate — rather than
merely matching what a hand animator already does well.

It also dodges every hard problem on the list in section 3: one channel, no
occlusion, no depth, no decimation (visemes are discrete and already sparse),
no root motion, no principles conflict. And it slots into
[swapSets.js](../src/core/scene/swapSets.js), which is built and tested.

Smaller project, and it lands *above* the current ceiling instead of below it.
