# Pending — the work queue

Everything in this directory is **not done**. Finished phases move to
[../completed_phases/](../completed_phases/); the per-phase register of what
each one found stays in [../STATUS.md](../STATUS.md).

**Read this file first.** It is the list of what to do next, in order, with the
reason each item is where it is. A doc leaves this directory only when its
acceptance test passes, not when its code lands.

| # | Item | Why it is next | Risk |
|---|---|---|---|
| 1 | [42-RENDER-QUALITY.md](42-RENDER-QUALITY.md) | **Tier 0 shipped in Phase 48** -- anti-aliasing is back on (1.2% -> 68.5% of edges resolved), bitrate follows pixels, and `QUALITY=720p` names a size on both paths. Tier 1.1, **the default environment, shipped in Phase 49**: every film with a metal in it now gets three's `RoomEnvironment` prefiltered to a PMREM, and the AK-47's receiver measures **x3.14** while the wood stock beside it measures x1.00 -- an implicit environment lights the metal and nothing else, so no finished film is restyled. Tier 1.2, **bevelled edges, shipped in Phase 50**: every `cube` is a `RoundedBoxGeometry` at a 4 mm radius, and specular ridges on the AK-47 went from 89 to 730. Tier 1.3, **contact shadows, in Phase 51**: `ssao` is a working GTAO pass -- it was arithmetically impossible before, which is why no film used it -- measuring x0.893 where a cube meets a floor and x1.000 on the open floor. Tier 1.4, **shadow quality, in Phase 52**: the bias was 0.4 m of depth offset and the frustum a fixed 10 units, so a 0.5 m cube's shadow sat 53 px away from it and a set at any other scale was clipped; both are fitted now. Tier 1.5, **the material library, in Phase 53**: `{ preset: 'wood' }` fills albedo, roughness and normal from one synthesised height field, the AK-47 film adopted all four presets, and surface detail went up x141 on wood and x20 on the concrete wall behind it. Tier 1.6, **area lights, in Phase 55**, completes Tier 1: a chrome sphere's highlight is x3.9 in area and shaped like the light rather than like a dot. What is left here is **Tier 2, light transport** -- SH irradiance, then baked probes, then a path-traced `master` tier -- and a procedural sky. The nearer work is in [43-DCC-PARITY.md](43-DCC-PARITY.md). Also holds the deferred motion-blur verdict, which cannot be judged until Tier 1 lands. | Low |
| 2 | [43-DCC-PARITY.md](43-DCC-PARITY.md) | **The register**: every feature a professional DCC has, audited against this engine with a pointer for each claim, and sorted into *engine gap*, *interface deferred* and *category error*. Eleven engine gaps survive the sort, with an architecture for each and the number that will prove it. Also the standing rules -- pure core, injected capabilities, guard lists, no `eval` on film data -- written down as preconditions rather than habits. Read it before planning any new subsystem. Three of its eleven gaps closed in Phase 56 -- orthographic camera, drivers, UV projection -- the precondition they all waited on, the **shared verb table**, landed in Phase 57, and **boolean / CSG** closed in Phase 58 without needing the Rust kernel the plan specified for it. **Scatter with instancing** followed in Phase 59 -- 600 instances for one draw call, and the AK-47's floor is no longer bare. **Rigid bodies** followed in Phase 60 -- its design doc is [44-RIGID-BODIES.md](44-RIGID-BODIES.md) and Tier 1 of it shipped. **Subdivision and displacement** followed in Phase 61 -- and displacement needed no wiring, only the two diagnostics that explain why no film had ever used it. **Render passes / AOVs** closed in Phase 62: `AOV=depth,normal,object`, with the decode as the feature and a cube at a known 11.000 m reading **10.999909 m** -- one eighth of the frustum's own quantisation step. That leaves two of the eleven: **volumetrics** and **global illumination**, each a phase of its own. | — |
| 3 | [44-RIGID-BODIES.md](44-RIGID-BODIES.md) | **Tier 1 shipped in Phase 60**: things fall, bounce, tumble, land and settle, baked to ordinary keyframe tracks so frame *N* stays a pure function of *N*. Eight of the AK-47's cases rest at y **−1.5846** against an analytic −1.5843. What is open: **box against box**, which needs a contact manifold and is most of a physics engine, and therefore **stacking**; then joints; then the Rust kernel, if a measured number ever asks for one. Also the record of why `cannon-es` was declined, which is the decision to revisit if stacking matters. | Medium |
| 4 | [37-MISSING-TOOLS.md](37-MISSING-TOOLS.md) | The audit: what a hybrid 2D/3D animation engine is expected to have and this one does not, each with a home in the tree, a cost and a risk. Items graduate out of it into their own doc when they come up the queue. **§1, the one structural finding, closed in Phase 57**: the verb table is data both compilers read, so a verb can no longer be added to half the engine — and it closed two gaps that were a call nobody had made (`show`/`hide` in 3D, `sound` in 2D). Next out of it: a **curve editor and dope sheet** (priority 5), **rigid-body dynamics baked to keys** (6) — the collider half of which shipped in Phase 45 — and **proxy render, resume and queue** (7). Keyframeable post came off this list in Phase 44, music ducking in Phase 46, motion blur in Phase 47 and the verb table in Phase 57. | Varies |
| 5 | [38-3D-CROSSFADE.md](38-3D-CROSSFADE.md) | Tier 2 of the transition work. `kind: 'crossfade'` compiles, warns by name and renders as a dip; a true dissolve needs two cameras and two render targets. | Medium |
| 6 | [39-OFFLINE-VOICE-WEIGHTS.md](39-OFFLINE-VOICE-WEIGHTS.md) | The take cache made Kokoro's download a one-off rather than per-render, which was the real problem. An air-gapped checkout still cannot make that first bake. | Low |
| 7 | [40-ASSET-IMPORT.md](40-ASSET-IMPORT.md) | Mostly shipped in Phase 45. **SVG and sprite-sheet import closed in Phase 63** -- neither needed a renderer, because `Path2D` already took SVG path data and `drawImageNode` already took a sub-rectangle; the same mark imports with a **2.00 px** edge against a raster's 16.67 px, and a sheet is a swap set so `expose` drives it with no new verb. What is left: **source catalogues** to search (importing from a URL already works, and the licence plumbing that makes it safe is done) and **retarget diagnostics** for non-Mixamo skeletons. | Low |
| 8 | [41-AUDIO-WINDOWING.md](41-AUDIO-WINDOWING.md) | Ducking and the cue checks shipped in Phase 46. What is left: **documenting the audio block**, which already works and is the cheapest item in the queue; a duration-and-envelope report so an `offset` is chosen rather than guessed; keyable cue gain; loop-to-fill. | Low |
| 9 | [10-ACTION-GAPS.md](10-ACTION-GAPS.md) | The older gap list, measured against a fight brief. Still partly open; superseded in places by 37. | — |
| 10 | [32-VOICE-CANDIDATES.md](32-VOICE-CANDIDATES.md) | Voice engines shortlisted and not plugged in. Kokoro and OpenVoice came off this list; the rest are still on it. | Low |
| — | [DEFECTS.md](DEFECTS.md) | The standing defect register, not a phase. It is never finished and never moves. **One open entry:** declaring a post pass changes the background colour. | — |

**Done and moved out:**

- 3D transitions, tiers 1 and 3 — Phase 40,
  [../completed_phases/35-3D-TRANSITIONS.md](../completed_phases/35-3D-TRANSITIONS.md).
- Kokoro and OpenVoice made renderable — Phase 41,
  [../completed_phases/36-VOICE-RUNTIME.md](../completed_phases/36-VOICE-RUNTIME.md).
- `digest` on the 2D path — Phase 42,
  [../completed_phases/37-DIGEST-2D.md](../completed_phases/37-DIGEST-2D.md).
- The `test:legacy` hang, and a deadline for every e2e script — Phase 43,
  [../completed_phases/38-E2E-GUARD.md](../completed_phases/38-E2E-GUARD.md).
- Keyframeable post, and the rack focus it makes possible — Phase 44,
  [../completed_phases/39-KEYFRAMEABLE-POST.md](../completed_phases/39-KEYFRAMEABLE-POST.md).
- Colliders, scale normalisation, lipsync on imported heads, and the asset
  library — Phase 45,
  [../completed_phases/40-ASSET-PIPELINE.md](../completed_phases/40-ASSET-PIPELINE.md).
- Music ducking, and four audio defects that shipped silently — Phase 46,
  [../completed_phases/41-DUCKING.md](../completed_phases/41-DUCKING.md).
- Motion blur by subframe accumulation — Phase 47,
  [../completed_phases/42-MOTION-BLUR.md](../completed_phases/42-MOTION-BLUR.md).
- Tier 0 of the render-quality work -- anti-aliasing, bitrate and named
  resolutions — Phase 48, and Tier 1.1, the default environment — Phase 49.
  The doc stays here, because the rest of Tier 1 and Tiers 2 to 3 are the
  realism gap and are still open.

## The three rules this queue runs on

1. **An animation that hits a limit ships the engine feature that removes
   it.** No feature is built speculatively; each one is built because a film
   needed it and could not be made without it. Everything in
   [../completed_phases/](../completed_phases/) arrived that way.
2. **A phase is not done until [../STATUS.md](../STATUS.md) is updated in the
   same commit.**
3. **A feature is not done until something can check it without a
   screenshot.** The cheapest lesson of Phase 39: structured checks caught
   every geometric, temporal and typographic defect, and screenshots caught
   every defect about material and light. So each item below names its
   checker, and `core/script/digest.js` is the pattern — it answers in
   numbers, at about 420 tokens for a whole film against about 2,000 for one
   screenshot.
