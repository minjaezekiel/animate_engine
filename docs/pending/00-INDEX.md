# Pending — the work queue

Everything in this directory is **not done**. Finished phases move to
[../completed_phases/](../completed_phases/); the per-phase register of what
each one found stays in [../STATUS.md](../STATUS.md).

**Read this file first.** It is the list of what to do next, in order, with the
reason each item is where it is. A doc leaves this directory only when its
acceptance test passes, not when its code lands.

| # | Item | Why it is next | Risk |
|---|---|---|---|
| 1 | [35-3D-TRANSITIONS.md](35-3D-TRANSITIONS.md) | `compile3d` has no transitions at all. Every cut in every 3D film in this repo is a hard cut; the 2D compiler references transitions in 22 places and the 3D one in zero. | Low for tiers 1 and 3, medium for tier 2 |
| 2 | [36-VOICE-RUNTIME.md](36-VOICE-RUNTIME.md) | Kokoro 82M and OpenVoice V2 are registered, selectable and tested, and **no film has ever been rendered through either**, because the weights are not vendored and nothing caches a take. | Low |
| 3 | [37-MISSING-TOOLS.md](37-MISSING-TOOLS.md) | The audit: what a hybrid 2D/3D animation engine is expected to have and this one does not, each with a home in the tree, a cost and a risk. Items graduate out of it into their own doc when they come up the queue. | Varies |
| 4 | [10-ACTION-GAPS.md](10-ACTION-GAPS.md) | The older gap list, measured against a fight brief. Still partly open; superseded in places by 37. | — |
| 5 | [32-VOICE-CANDIDATES.md](32-VOICE-CANDIDATES.md) | Voice engines shortlisted and not plugged in. Kokoro and OpenVoice came off this list; the rest are still on it. | Low |
| — | [DEFECTS.md](DEFECTS.md) | The standing defect register, not a phase. It is never finished and never moves. | — |

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
