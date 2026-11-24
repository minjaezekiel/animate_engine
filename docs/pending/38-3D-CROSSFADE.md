# The true 3D crossfade — tier 2

**Status: not started.** Tiers 1 and 3 shipped in Phase 40
([../completed_phases/35-3D-TRANSITIONS.md](../completed_phases/35-3D-TRANSITIONS.md));
this is the one tier left, carved out rather than left implied.

Today `kind: 'crossfade'` on a 3D film compiles, warns by name, and renders as
a dip to colour:

```
crossfade is not implemented on the 3D path yet (it needs two cameras and two
render targets); rendered as a dip to colour. See docs/pending/35-...
```

That is a visible substitution, not a silent one, which is the standard this
repo holds fallbacks to. It is still a substitution.

## Why it is the hard one

Everything in tier 1 is drawn **on** the finished frame, so it needs one
context and one `fillRect`. A crossfade needs two *different frames* of the
same instant:

> A 3D crossfade needs the outgoing and the incoming camera at the same
> instant, and a track holds one value per channel per time. One camera cannot
> be in two places at t.

Ramping material opacity instead is not a dissolve. In a depth-sorted
renderer, alpha is transparency: during the overlap you would see the stars
through the planet. The 2D path gets away with scene-alpha ramps only because
its backend is a painter.

## The design

1. **A second camera node.** `compile3d` emits an `__camera:out` for each
   crossfade boundary. The outgoing camera's keys continue past the cut on it;
   the incoming camera's keys start early on the main one. Both are ordinary
   scene nodes with ordinary keys, so **no new animation machinery exists
   anywhere** — that property is what makes this tier safe rather than
   sprawling.
2. **Two render targets, during the overlap only.** Render the scene twice
   into two `WebGLRenderTarget`s and blend with a one-quad shader pass in the
   shape `src/render/gradeShader.js` already uses. Outside the window nothing
   changes and nothing costs anything.
3. **Post runs per side.** Each target goes through its own pass chain, or the
   blend happens before post — a decision to make by measurement, not here.
   Blending before post is one chain instead of two and is almost certainly
   right; the exception is a grade that differs between the two shots.

Three.js ships `RenderTransitionPass`, but it transitions between two
**scenes**; ours is one scene seen from two cameras. The blend pass is about
forty lines, so writing it keeps the addon surface where it is.

## The cost, stated in advance

2× for `duration × fps` frames per boundary, and nothing elsewhere. Eight
half-second dissolves at 24 fps is 96 doubled frames out of the 1,570 in a
65-second film: about 6% on the render, and zero on every frame that is not
in a dissolve. If measurement disagrees, half-resolution targets during the
overlap are available — but measure first.

Determinism holds: both renders are pure functions of t, so frame N is still
f(N) and a re-render is still identical.

## Acceptance

1. A 3D film with one `crossfade` renders to MP4 with no warning about the
   kind.
2. `digest` reports a blend factor strictly between 0 and 1 on the overlap
   frames, from the *two-camera* path rather than from a colour dip.
3. The render's frame-time report shows the doubled cost confined to the
   overlap window, printed by the render rather than estimated.
4. A frame mid-dissolve shows **both** framings composited — provable by
   measuring a subject that is in one shot's frame and not the other's, which
   `digest`'s per-subject box already gives.

Until all four hold, `crossfade` keeps warning and keeps dipping.
