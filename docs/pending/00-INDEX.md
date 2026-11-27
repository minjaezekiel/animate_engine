# Pending — the work queue

Everything in this directory is **not done**. Finished phases move to
[../completed_phases/](../completed_phases/); the per-phase register of what
each one found stays in [../STATUS.md](../STATUS.md).

**Read this file first.** It is the list of what to do next, in order, with the
reason each item is where it is. A doc leaves this directory only when its
acceptance test passes, not when its code lands.

| # | Item | What is left | Risk |
|---|---|---|---|
| 1 | [42-RENDER-QUALITY.md](42-RENDER-QUALITY.md) | A **path-traced `master` tier** (Tier 2, route 3), a **procedural sky**, and the **deferred motion-blur verdict**. Tier 0 and all of Tier 1 shipped (Phases 48-55); Tier 2's first two routes are done -- route 1 turned out to have shipped in Phase 49 and better than planned, route 2 is Phase 72's `meta.bounce`. | Low |
| 2 | [43-DCC-PARITY.md](43-DCC-PARITY.md) | **Smoke and fire** -- the grid solver, and the only item in this queue that genuinely needs one. **All eleven engine gaps are now closed** (Phases 56-72). The doc stays because it is also the standing register: every DCC feature audited against this engine, plus the architecture rules -- pure core, injected capabilities, guard lists, no `eval` on film data. Read it before planning any new subsystem. | — |
| 3 | [44-RIGID-BODIES.md](44-RIGID-BODIES.md) | **Box against box**, which needs a contact manifold and is most of a physics engine, and therefore **stacking**; then **joints**; then a **Rust kernel** if a measured number ever asks for one. Tier 1 shipped in Phase 60. Also holds the record of why `cannon-es` was declined, which is the decision to revisit if stacking matters. | Medium |
| 4 | [37-MISSING-TOOLS.md](37-MISSING-TOOLS.md) | **Proxy render, resume and queue** (priority 7). Everything above it has shipped: the verb table (57), rigid bodies (60), the curve editor and dope sheet (65). | Low |
| 5 | [38-3D-CROSSFADE.md](38-3D-CROSSFADE.md) | A **true dissolve**, which needs two cameras and two render targets. `kind: 'crossfade'` compiles, warns by name and renders as a dip. | Medium |
| 6 | [39-OFFLINE-VOICE-WEIGHTS.md](39-OFFLINE-VOICE-WEIGHTS.md) | The **first bake on an air-gapped checkout**. The take cache already made Kokoro's download a one-off rather than per-render, which was the real problem. | Low |
| 7 | [40-ASSET-IMPORT.md](40-ASSET-IMPORT.md) | **Source catalogues** to search, and **retarget diagnostics** for non-Mixamo skeletons. Importing from a URL works, the licence plumbing is done, and SVG and sprite sheets closed in Phase 63. | Low |
| 8 | [41-AUDIO-WINDOWING.md](41-AUDIO-WINDOWING.md) | **Documenting the audio block**, which already works and is the cheapest item in the queue; a **duration-and-envelope report** so an `offset` is chosen rather than guessed; **keyable cue gain**; **loop-to-fill**. | Low |
| 9 | [10-ACTION-GAPS.md](10-ACTION-GAPS.md) | Its **phase 16**: elongated smears, spring secondary motion on hair and cloth, per-pose `z`, and **hit-stop**. Phases 13 to 15 shipped -- additive layering, timing texture, `props.echo` and the effects library. Superseded in places by 37. | — |
| 10 | [32-VOICE-CANDIDATES.md](32-VOICE-CANDIDATES.md) | The **remaining shortlisted engines**, none of them plugged in. Kokoro and OpenVoice came off this list in Phase 41. | Low |
| — | [DEFECTS.md](DEFECTS.md) | The standing defect register, not a phase. It is never finished and never moves. **One open entry:** declaring a post pass changes the background colour. | — |

**What each item has already produced** is not repeated here -- it is in
[../STATUS.md](../STATUS.md), one entry per phase, with the number that proved
it. This table answers one question only: what is left.

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

## The four rules this queue runs on

1. **A doc leaves this directory the moment nothing in it is open.** When the
   last item in a `pending/*.md` is finished, the file moves to
   [../completed_phases/](../completed_phases/) in the same commit and its row
   comes out of this table. The size of this directory is how much work is
   left; a finished doc sitting in it, accumulating a paragraph of history,
   makes the queue look full when it is nearly empty and stops this file
   answering the one question it exists for.
2. **An animation that hits a limit ships the engine feature that removes
   it.** No feature is built speculatively; each one is built because a film
   needed it and could not be made without it. Everything in
   [../completed_phases/](../completed_phases/) arrived that way.
3. **A phase is not done until [../STATUS.md](../STATUS.md) is updated in the
   same commit.**
4. **A feature is not done until something can check it without a
   screenshot.** The cheapest lesson of Phase 39: structured checks caught
   every geometric, temporal and typographic defect, and screenshots caught
   every defect about material and light. So each item below names its
   checker, and `core/script/digest.js` is the pattern — it answers in
   numbers, at about 420 tokens for a whole film against about 2,000 for one
   screenshot.
