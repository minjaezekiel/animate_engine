# Pending — the work queue

Everything in this directory is **not done**. Finished phases move to
[../completed_phases/](../completed_phases/); the per-phase register of what
each one found stays in [../STATUS.md](../STATUS.md).

**Read this file first.** It is the list of what to do next, in order, with the
reason each item is where it is. A doc leaves this directory only when its
acceptance test passes, not when its code lands.

| # | Item | Why it is next | Risk |
|---|---|---|---|
| 1 | [37-MISSING-TOOLS.md](37-MISSING-TOOLS.md) | The audit: what a hybrid 2D/3D animation engine is expected to have and this one does not, each with a home in the tree, a cost and a risk. Items graduate out of it into their own doc when they come up the queue. Next out of it: **music ducking** (~30 lines; `OfflineMixer.js:40` has promised it for several phases), then **motion blur by subframe accumulation**. Keyframeable post came off this list in Phase 44. | Varies |
| 2 | [38-3D-CROSSFADE.md](38-3D-CROSSFADE.md) | Tier 2 of the transition work. `kind: 'crossfade'` compiles, warns by name and renders as a dip; a true dissolve needs two cameras and two render targets. | Medium |
| 3 | [39-OFFLINE-VOICE-WEIGHTS.md](39-OFFLINE-VOICE-WEIGHTS.md) | The take cache made Kokoro's download a one-off rather than per-render, which was the real problem. An air-gapped checkout still cannot make that first bake. | Low |
| 4 | [40-ASSET-IMPORT.md](40-ASSET-IMPORT.md) | Asked for directly. Importing a model or an image already works; what is missing is the library around it, inspection before loading, scale and up-axis normalisation, colliders, **morph-target visemes**, licence tracking, online sources and an MCP surface. The lipsync gap is the largest single capability hole in the engine: the viseme track is computed per line and has no 3D consumer. | Medium |
| 5 | [41-AUDIO-WINDOWING.md](41-AUDIO-WINDOWING.md) | Asked for directly, and mostly already done: `offset`/`duration`/`fadeIn`/`fadeOut` per cue, per scene, work today and are undocumented. The real gaps are **ducking** (audit priority 2, ~30 lines, the one a viewer hears), keyable gain, loop-to-fill, and that nothing reports an audio file's duration so an in-point is guessed. | Low |
| 6 | [10-ACTION-GAPS.md](10-ACTION-GAPS.md) | The older gap list, measured against a fight brief. Still partly open; superseded in places by 37. | — |
| 7 | [32-VOICE-CANDIDATES.md](32-VOICE-CANDIDATES.md) | Voice engines shortlisted and not plugged in. Kokoro and OpenVoice came off this list; the rest are still on it. | Low |
| — | [DEFECTS.md](DEFECTS.md) | The standing defect register, not a phase. It is never finished and never moves. **No open entries.** | — |

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
