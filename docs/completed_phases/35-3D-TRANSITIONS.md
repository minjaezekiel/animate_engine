# 3D transitions — the spaces at the joints, closed

**Phase 40. Done**, except the one tier deliberately carved out into
[../pending/38-3D-CROSSFADE.md](../pending/38-3D-CROSSFADE.md).

## What was wrong

`compile.js` mentioned transitions in twenty-two places. `compile3d.js`
mentioned them in **none**, so every cut in every 3D film in this repository
was a hard cut — all nine boundaries of a finished 65-second film among them.

The worse half: nothing *rejected* a transition on a 3D scene either. A film
could declare `transitionIn` and cut hard with no diagnostic anywhere, which
is this codebase's most expensive defect shape and has now produced
`lineCap`, an unread `subtitle` flag, an ignored `subtitleStyle` and this.

## Why the 2D implementation could not be ported

2D does it two ways and both depend on properties 3D does not have.

- **Colour fades** are a full-frame screen-space `rect` *scene node* at
  `z: 10000`. That works because the 2D backend is a painter: a node drawn
  last is on top.
- **Crossfades** are scene-alpha ramps — both scenes present at once with
  complementary alphas.

In 3D the second is not a dissolve at all. Ramping material opacity across a
scene makes it **translucent**: during the overlap you see the stars through
the planet, because alpha in a depth-sorted renderer is transparency, not
compositing. And underneath that:

> A 3D crossfade needs the outgoing and the incoming **camera** at the same
> instant, and a track holds one value per channel per time. One camera cannot
> be in two places at t.

So a true crossfade is a *data-model* problem, not a rendering one. That is
why it is a separate tier and why the other two shipped without it.

## What shipped

### Tier 1 — drawn on the frame. No GPU cost.

Phase 39 had already built the seam and did not know it: `film3d.html`
composites the WebGL canvas into a 2D canvas each frame and draws the overlay
list on top. A full-frame `rect` with a keyed alpha *is* a dip to colour. So
`core/art/transitions.js` emits the same primitive op vocabulary `overlayAt`
emits, and one renderer executes both:

| kind | what it draws | cost |
|---|---|---|
| `fade` | full-frame colour, opening or closing | one `fillRect` |
| `dip` | colour out before the cut and in after it, peaking **at** the boundary | one `fillRect` |
| `wipe` | a band sweeping from `left`/`right`/`up`/`down` with a soft edge | one `fillRect` + one gradient |
| `iris` | colour everywhere except a shrinking circle | one even-odd path |
| `none` | nothing, explicitly | — |

Because these are baked into the frame **before** it reaches a sink, they
appear in MP4, WebM and a PNG sequence with no per-sink code. The alternative
— a DOM layer — shows in a preview and is absent from the file, which is the
worst failure shape there is and is why `Overlay2D` is a canvas.

Draw order is the whole of one defect's fix: transition ops go **last**, over
the overlay's type. A subtitle that stays legible through a fade to black is
wrong.

### Tier 3 — `continue`: the transition that is not one

Usually the right answer, and the cheapest. A hard cut is two camera positions
at one instant; rather than dissolving over it, `continue` writes a key holding
the outgoing framing `d` seconds *before* the boundary and lets the camera ease
from there into the incoming shot's `from`, arriving exactly at the cut. The
join stops existing. One camera, ordinary keys, no second render, no pass.

It needs `d` seconds in which the outgoing camera is at rest, so it cannot
overwrite the tail of the previous shot's own move — which would snap the
camera back to an earlier key and read as a glitch rather than a move.
`moveEnd` is threaded through `prevCamera` for exactly this, and every clamp
is reported:

```
`continue` was 2.5s but only 1.00s of the previous shot is still; shortened
`continue` needs a moment in which the previous camera is still … Rendered as a hard cut
`continue` on the first shot has no previous framing to continue from
`continue` eases the camera into the INCOMING framing, and this shot declares no camera
```

### Authoring

Two declaration sites, each with one meaning. A shot's `transition` is the
boundary where that shot **begins**; a scene's `transitionIn`/`transitionOut`
are the 2D vocabulary, read now so one film document means the same thing on
both paths. When both describe the same instant the shot wins — the more
specific statement — and the collision is reported rather than resolved
quietly.

`mode` is inferred and overridable: `in` at the film's start, `out` at its
end, `dip` anywhere between.

## The defect found on the way, which was not a transition

Asserting that a hard cut *holds its framing* is what exposed it.

**A shot with `for: 2` and a duration of 3 wrote its camera arrival key at
t+2 and nothing after it.** The track therefore interpolated from there
straight to the next shot's `from` key: the camera spent the shot's final
second drifting into the next shot's framing, and the authored hold did not
exist. Not the same bug as the `CUT` nudge beside it — that stops two keys
colliding at one instant; this was the missing key at the shot's own end. Both
have the same symptom, a camera that will not stay put, which is presumably
why fixing one looked like fixing both.

No shipped 3D film declared `for` shorter than its shot, so nothing
re-rendered differently. The authored form simply started meaning what it
says — and the very next thing written needed it.

## Two defects in a finished film, fixed by the new numbers

`check:earth` had been reporting one warning since Phase 39, undocumented:

```
Exposure: t=63.8s (close) has mean luma 0.052 -- effectively black.
```

The closing shot — "Four layers. One file. One browser. That is the engine."
— pulled out from inside the inner core over its whole 6.4 seconds, so
two-thirds of the way through the camera was *still inside the planet*. The
digest named it precisely: Earth at 100% cover and 0.108 luma, the presenter
jammed against the right edge at 8% cover and 0.033 luma. **The film's
punchline was delivered over a black frame.**

The fix is `for: 2.4` — land the pull-out early and hold on the presenter —
which is exactly the authored form the camera-hold defect above had made
meaningless. Then the framing check pushed back twice more (105% of frame
height, then too dark again) until the shot sat inside both bands at once.

`check:earth` and `digest:earth` are now **clean for the first time**: zero
compile, framing, exposure, overlay and transition findings.

The second was the checker crying wolf. `checkDigest` reported the presenter
"on screen and black" on every macro shot of the cutaway, where he is a
six-percent-wide vertical sliver down the frame edge, in shadow. Three
identical findings per film meaning "a man is standing off to one side of a
close-up", which is what a close-up is. A subject that is clipped **and**
covers less than 12% was never the shot's subject, so its exposure says
nothing about the shot; clipping alone is not the test, because the Earth
overflows every macro frame and a black Earth is the defect the rule exists
for.

## Proof

| | |
|---|---|
| `test/core/transitions.test.mjs` | 41 unit tests: normalization, every mode's coverage curve, the op geometry, the checks, and the `continue` camera keys sampled off the real track |
| `test/e2e/transitions-3d.mjs` | a pixel probe. A purpose-built film, four kinds, `clippedLow` measured at nine instants |
| `scripts/frame-luma.mjs` | **decodes the finished MP4** and measures its frames, which nothing here could do before |
| `check:earth` | 0 findings |
| `digest:earth` | 0 findings, and it now prints `blend: dip 100% (inner -> close)` so an agent can see a transition for a handful of tokens rather than a screenshot |

The pixel probe is the one that matters, because the unit tests cannot prove
the ops reach the frame the encoder sees, nor that "covered" means every
pixel:

```
  t      shot  clippedLow  mean   expected
  0      a     1.000       0.000  ok  a fade IN begins fully covered
  0.5    a     0.000       0.447  ok  and is half open by its midpoint
  1.5    a     0.000       0.894  ok  with no transition, the frame is clear
  2      b     1.000       0.000  ok  a dip is fully covered AT the cut
  2.5    b     0.000       0.894  ok  and open again half a second later
  4      c     1.000       0.000  ok  a wipe covers EVERY pixel at full coverage
  3.75   c     0.469       0.448  ok  and half of them halfway through
  8      d     1.000       0.000  ok  an iris closes completely at the end
  7.75   d     0.881       0.103  ok  and covers the corners first
```

The wipe row at t=4 is the assertion worth keeping. The soft edge travels to
`cover × (span + soft)`, not `cover × span`: stopping at `span` leaves a
translucent strip down the far edge for every held frame — visible in the
file, and invisible to any check that samples the middle of the frame.

### And the finished file, decoded

The probe above measures the composite canvas, which is the canvas the encoder
is handed and **still not the file**. That last step is exactly where this
repo has been burned — a DOM overlay shows in a preview and is absent from the
file — so `scripts/frame-luma.mjs` now closes it: a `<video>` in headless
Chrome, seeked, drawn to a canvas, counted. No ffmpeg and no dependency,
because the browser that encoded the file can obviously decode it.

```
inside-the-earth.mp4  decoded 7 frame(s)

  asked    actual   mean    low     high    quads (TL TR BL BR)
  0        0        0.000   1.000   0.000   0.000 0.000 0.000 0.000
  0.45     0.45     0.052   0.653   0.000   0.092 0.012 0.072 0.033
  15.7     15.7     0.106   0.604   0.000   0.096 0.101 0.100 0.125
  19       19       0.000   1.000   0.000   0.000 0.000 0.000 0.000
  19.35    19.35    0.050   0.653   0.000   0.044 0.064 0.037 0.058
  59       59       0.000   1.000   0.000   0.000 0.000 0.000 0.000
  65.39    65.39    0.001   1.000   0.000   0.004 0.000 0.001 0.001
```

t=0 is the fade in, t=19 the dip across the geometry swap, t=59 the dip back
to the room and t=65.39 the fade out — every one of them `low = 1.000`, every
pixel below 2%, in the encoded H.264. t=15.7 is an ordinary frame for
comparison. `npm run frames:earth`.

### The render

`out/earth/inside-the-earth.mp4` — 65.417 s, 1920×1080, H.264 Main@L4.0 +
AAC, 1570 samples at a constant 41.67 ms, 47.45 MB, **188.8 s wall**: 3.5×
faster than real time, and no slower than the same film without transitions.
Four `fillRect`s per transition frame and nothing else is the reason.

## What this does not do

- **No `crossfade`.** [../pending/38-3D-CROSSFADE.md](../pending/38-3D-CROSSFADE.md).
- **No transition between two different *scene states*** other than by
  dipping through colour. That is the same gap as above.
- **No soft-edged iris.** The circle is hard. A radial gradient is one op away
  if a film wants one.
- **Transitions are not on the 2D path's new kinds.** `wipe` and `iris` are in
  `TRANSITION_KINDS_3D`, deliberately **not** merged into `schema.js`'s
  `TRANSITION_KINDS`: adding them there would make the 2D validator accept
  kinds the 2D compiler ignores, which is the exact defect this phase was
  written to remove.
