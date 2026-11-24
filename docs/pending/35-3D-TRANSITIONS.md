# 3D transitions — the spaces at the joints

**Status: not started.** The design below is what Phase 39 learned the shape
of; none of it is built.

## What is actually wrong

`src/core/script/compile.js` mentions transitions in twenty-two places.
`src/core/script/compile3d.js` mentions them in none. Every cut in every 3D
film in this repository is therefore a hard cut, including all nine boundaries
in `inside-the-earth.mp4`. The film script schema does not even reject
`transitionIn` on a 3D scene — it is read by nothing, which is the quietest
failure mode this repo has (see
[../19-CONTRACTS-AND-BUDGET.md](../19-CONTRACTS-AND-BUDGET.md)), so the first
commit of this work should make an unread transition key a **warning** even
before any of it renders.

## Why the 2D solution does not port

2D does transitions two different ways, and both depend on properties 3D does
not have.

- **Colour fades** are a full-frame screen-space `rect` scene node whose alpha
  is keyed (`buildTransitions`, `compile.js:2058`). That works because the 2D
  backend is a painter — a node at `z: 10000` is simply drawn last.
- **Crossfades** are scene-alpha ramps written by the visibility plan: both
  scenes' contents exist at once with complementary alphas.

In 3D, the second one is not a dissolve. Ramping material opacity across a
whole scene makes the scene *translucent*: during the overlap you would see
the stars through the planet, because alpha blending in a depth-sorted
renderer is transparency, not compositing. And more fundamentally:

> **A 3D crossfade needs the outgoing and the incoming camera at the same
> instant, and the timeline holds one value per channel per time.** One camera
> cannot be in two places at t. This is the whole difficulty, and it is a
> data-model problem rather than a rendering one.

## The design: three tiers, cheapest first

### Tier 1 — the overlay dip. No GPU cost at all.

Phase 39 built the seam this needs and did not know it: `film3d.html` composites
the WebGL canvas into a 2D canvas each frame and draws the overlay draw list on
top (`createCompositeCanvas`, `src/render/Overlay2D.js`). A full-frame `rect`
op with a keyed alpha *is* a dip to colour. So:

- `fade` / `dipTo` — one `fillRect` per frame.
- `wipe` — the same rect with a moving edge, plus a `dir` and a soft edge.
- `iris` — an arc clip around a point, which is the one transition that can
  carry meaning in an explainer: it points at where to look next.
- `push` / `slide` — a translated blit of the composite, which costs a second
  `drawImage` and nothing else.

All four are deterministic, all four appear in **every** sink because they are
baked into the frame before it reaches one, and none of them touches the scene
graph, the materials or the post chain. That last point is why this tier is
first: it cannot break a render that already works.

Two things to get right:

1. `composite` is currently created only when an overlay exists
   (`film3d.html:305`). It must also be created when transitions exist, and
   the extra per-frame cost (one 1920×1080 `drawImage`) has to be reported
   through the existing `frameTime` tracking rather than discovered later.
2. Ops go **in front of** the overlay list, so a title or a subtitle fades
   with the picture instead of floating over the dip. A subtitle that stays
   legible through a fade to black is the defect this ordering prevents.

Where it lives: a pure `transitionOps(spans, t, { width, height })` in
`src/core/art/` returning the same primitive ops `overlayAt` already returns,
so it is assertable in Node with no browser and no GPU.

### Tier 2 — the true crossfade. Dual render, overlap only.

Only when tier 1 is in and measured.

- `compile3d` emits a **second camera node** for the boundary: the outgoing
  camera keeps the previous shot's keys past the cut, and the incoming camera
  starts its keys early. Both are ordinary scene nodes, so no new animation
  machinery exists anywhere — this is the property that makes the tier safe.
- During the overlap window **only**, render the scene twice into two
  `WebGLRenderTarget`s and blend them with a one-quad shader pass, in the
  shape `src/render/gradeShader.js` already uses.
- Outside the window nothing changes and nothing costs anything.

The cost is bounded and worth stating in advance: 2× for `duration × fps`
frames per boundary. Eight half-second dissolves at 24 fps is 96 doubled
frames out of the 1,570 in a 65-second film — about 6% on the render, and
*zero* on every frame that is not in a dissolve. That is the argument for
doing it this way rather than with a persistent second composer.

Three.js ships `RenderTransitionPass` for this, but it transitions between two
**scenes**; ours is one scene seen from two cameras, and the blend pass is
about forty lines. Writing it keeps the addon surface where it is.

Determinism holds: both renders are pure functions of t, so frame N is still
f(N) and a re-render is still identical.

### Tier 3 — `continue`: the transition that is not one.

Ship this **with tier 1**, because it is both the cheapest and, for this kind
of film, usually the right answer. Many hard cuts should not be dissolves at
all; they should not be cuts. A `continue` boundary interpolates the camera
from the outgoing framing to the incoming one across the join — one camera,
keyed, no extra render, no new pass. `buildCamera3D` already threads
`prevCamera` through exactly for this sort of continuity, so the work is
keyframe arithmetic and an ease.

## The checker, without which none of this is done

In `src/core/script/staging3d.js`, or beside it:

- A dissolve longer than the shorter of the two shots it joins. This is the
  **Phase 33 shape**: `retimeToAudio` grows a shot to fit its real take, so a
  transition duration declared as a constant can end up longer than a shot
  after retiming. The compiler must clamp it and say so, because the symptom
  otherwise is a dissolve that never completes and no error anywhere.
- Two dissolves back to back, which reads as a fault rather than a style.
- A dissolve between two subjects at two different scales — that is a defect
  in intent, and the data to catch it is already in `digest`'s per-subject box.
- `digest.js` should report the blend factor per frame, so an agent can see a
  transition is happening for a handful of tokens instead of a screenshot.

## Order of work

1. Warn on an unread transition key. One commit, no behaviour change.
2. Tier 3 `continue` + tier 1 dip/fade/wipe/iris + the checks + Node tests.
3. Tier 2 crossfade behind `kind: 'crossfade'`, with the measured frame-time
   cost printed by the render rather than estimated here.
4. `digest` reports transitions.

## Acceptance

A 3D film with a fade in, a dip between scenes, one `continue` and one
`crossfade` renders to MP4; `check` reports no findings; `digest` names the
blend factor on the overlap frames; and the frame-time report shows the
doubled cost confined to the overlap. Until a rendered file does all four,
this doc stays in `pending/`.
