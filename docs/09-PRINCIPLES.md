# The twelve principles of animation, and where each one lives

An audit, not a brochure. Each principle names the engine feature that carries
it, the one-line way to use it, and the check that fails if it regresses.

Eight of the twelve were already expressible before this document existed, but
only four of those eight were *named* anywhere, which in practice means they
went unused. Four more could not be expressed at all without an author
hand-writing extra keyframes every single time — and a principle an author has
to hand-key is a principle that never gets used. Those four are now one number
on an action.

| # | principle | carried by | state |
|---|---|---|---|
| 1 | Squash and stretch | `transform.sx`/`sy`, `squashKeys`, the `squash` action | **built** |
| 2 | Anticipation | `anticipate` on `pose` · `move` · `reach` | **built this phase** |
| 3 | Staging | `analyseStaging`, ground planes, the `checkFilm` op | built (Phase 8) |
| 4 | Straight ahead / pose to pose | `poses` + `do:'pose'`; raw keys for straight-ahead | built |
| 5 | Follow through and overlapping action | `overshoot` on actions; `lag`/`chain` on action clips | **built this phase** |
| 6 | Slow in and slow out | `ease: linear\|step\|smooth\|bezier` + `h` handles | built |
| 7 | Arcs | `arc` on `move`; rotation about pivots in the cutout rig | **built this phase** |
| 8 | Secondary action | concurrent clip instances on one cast member | built |
| 9 | Timing | `FrameClock`, derived shot durations, `speed` on `play` | built |
| 10 | Exaggeration | `overshoot` + `squash` + proportions in head-heights | partial |
| 11 | Solid drawing | three views, two tones, line work (Phase 10) | **built this phase** |
| 12 | Appeal | the face kit, silhouette-led jaws, derived palettes | **built this phase** |

---

## The four that needed building

They live in [`src/core/anim/principles.js`](../src/core/anim/principles.js),
pure and Node-testable, and are wired into the compiler so that an author
spends one number rather than four keyframes.

### 2 — Anticipation

A counter-move before the move. A hand reaching right first drifts left, and
that drift is what tells the eye the reach is coming.

```json
{ "target": "huey", "do": "move", "to": [900], "for": 1.6, "anticipate": 0.15 }
```

`0.15` means the counter-move travels 15% of the distance, backwards, in the
first 26% of the span. It is relative, not signed: a move leftward anticipates
rightward. The action still lands exactly on its target.

Works on `pose`, `move` and `reach`, because all three write through the same
`writeChannel` — which is the reason it was worth doing at all.

### 5 — Follow through and overlapping action

Two different things that get conflated, so they are two different knobs.

**Follow-through** is passing the target and settling back onto it. Stopping
dead on a target is the single most mechanical-looking thing a rig can do.

```json
{ "target": "huey", "do": "pose", "pose": "point", "for": 0.7, "overshoot": 0.12 }
```

**Overlapping action** is parts further down a chain arriving late. It belongs
on the action definition, not the shot, because it is a property of the move:

```json
"wave": {
  "duration": 1.0, "loop": "repeat",
  "lag": 0.06, "chain": ["armR", "foreR", "handR"],
  "keys": { "armR.rot": [[0, 0], [1, 1]], "foreR.rot": [[0, 0], [1, 1]] }
}
```

The upper arm leads, the forearm trails it by 0.06 s, the hand trails that by
another 0.06. `lag` also takes an explicit map (`{ "foreR": 0.08 }`) when the
delays are not uniform.

The generated `walk` and `idle` already use this, which is what stops a walk
reading as a single rigid hinge.

### 7 — Arcs

Two keyframes interpolate along a ruled straight line, which is the one path
nothing alive ever travels.

```json
{ "target": "huey", "do": "move", "to": [900], "for": 1.2, "arc": 0.22 }
```

`arc` bows the midpoint perpendicular to the travel, as a fraction of the
distance — so the same number arcs a short step and a long walk by the same
proportion. Positive lifts the path, which is the overwhelmingly common case.

Note that the cutout rig already gets arcs for free wherever motion comes from
a rotation about a pivot: a swinging forearm traces an arc because that is
what rotation does. `arc` is for the root translation, which does not.

### 1 — Squash and stretch, done correctly

`sx` and `sy` were always keyable. What was missing was the constraint that
makes it read as squash rather than as inflation: **volume**.

```js
squashKeys(0.5, 0.16)   // sy dips to 0.84, sx rises to 1/0.84
```

The generated `squash` action is a landing built from this, and it recovers
faster than it compresses — the asymmetry is what makes an impact read as an
impact. `breathe` uses the same rule at a much smaller amplitude, which is why
the chest now widens slightly as it shortens instead of the character
inflating.

---

## The eight that were already there

Worth stating explicitly, because an affordance nobody knows about is the same
as a missing one.

**3 — Staging.** `analyseStaging` samples each shot and reports a cast member
off-frame, feet off the ground, a part outside the canvas, an unintended
camera jump, or a shot with nobody in it. A scenery template returns the
ground it drew, so the art and the check read the same declaration. This is
the one principle the engine can *verify* rather than merely allow.

**4 — Straight ahead and pose to pose.** `poses` plus `do:'pose'` is
pose-to-pose; writing an action's `keys` frame by frame is straight ahead.
Both compile to the same tracks.

**6 — Slow in and slow out.** `ease` is `linear`, `step`, `smooth` or
`bezier` with explicit `h` handles, interpolated at sample time rather than
pre-densified — so an ease is correct at any fps. `smooth` is the default,
which means the easy path is already the right one.

**8 — Secondary action.** Clip instances are additive and scoped to a cast
member, so `breathe` + `blink` + `walk` run together. Three lines.

**9 — Timing.** Shots sequence automatically and durations are derived, never
declared, so a film cannot disagree with itself about its own length.
`FrameClock.timeOf(n) = n/fps` by division, not accumulation, so frame 2879 is
exact. `speed` scales a clip instance.

**10 — Exaggeration.** Partial, and honestly so. `overshoot`, `squash` and
head-height proportions are the levers. There is no "exaggerate this by 1.4×"
multiplier over an existing performance, and adding one without a reason to is
the kind of knob that gets built and never turned.

**11 — Solid drawing.** Three drawn views rather than a rotated flat shape; a
flat tone, a hard-edged shadow and line work on every part; silhouettes built
from jaw and build rather than from a circle. This is what Phase 10 was for.

**12 — Appeal.** Enumerated jaws that actually change the silhouette, palettes
derived so three tones per material cannot disagree, and shadows that stay in
hue. Appeal is the one that is never finished, and it is bounded by art
direction rather than by code.

---

## Verification

`test/core/principles.test.mjs` asserts each of the four built ones on the
**compiled timeline**, not on the helper alone — a helper nothing calls is not
an affordance:

- anticipation dips below the start value and still lands exactly on target
- follow-through peaks past the target and settles exactly onto it
- an arc raises the mid-path `y`, and the same move without `arc` does not
- overlap delays the named parts and leaves every other track untouched
- squash holds `sx * sy == 1` at every key

Staging has its own suite in `test/core/staging.test.mjs`, and easing and
timing are covered by `test/utils.test.mjs` and the evaluator tests.
