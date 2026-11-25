# Phase 44 — post is keyframeable, so there is a rack focus

**Done.** The top item of the audit, and its description was accurate: *"This
is the highest-value item in this whole section and is mostly plumbing."*

## What was wrong

`buildComposer` built the post chain from a declaration **once**. The only
thing that then varied with time was the grain seed, advanced by `setTime` so
two renders of a film would not differ. So every post number was a constant
for the life of a film, and a **rack focus** — pulling focus from one subject
to another inside a held frame, the one camera move that most reads as
photography rather than as rendering — could not be expressed at all.

The Earth film documents the consequence in its own source, which is the
clearest statement of the problem anyone wrote:

> *"A very small aperture, because focus CANNOT be racked. `meta.post` is read
> once at build time and no post parameter is keyframeable, so a film has
> exactly one focal plane for its whole length. This film moves the camera
> from 5 metres off the planet to 0.85 metres off a cut face, and any aperture
> wide enough to be visible at one end defocuses the other end completely. So
> the depth of field here is almost nothing, and 'rack focus' is in the gap
> list rather than in the film."*

`aperture: 0.00012`. An aperture bought not for how the film should look but
for what its worst shot could tolerate.

## The shape of the fix

Everything else in this engine that varies over time is a timeline channel.
Post was the exception and it had no reason to be: the passes existed, the
interpolator existed, and `samplePose` already walked every target. What was
missing was a **node to key against** and a **guard list** saying which
numbers may be keyed.

- `POST_NODE = '__post'` — the third synthetic target, after `__camera` and
  `__subtitle`.
- `POST_KEYABLE` — the keyable scalars per pass, following the
  `COLOR_PROPS`/`VECTOR2_PROPS` pattern in `SceneAdapter.js`, and for the same
  reason: **a typo must be a diagnostic, not a channel nothing reads.** `set
  props.trim.offset` once wrote a property literally named `"trim.offset"`
  that nothing read, silently, and that is the failure this prevents.
- `normalizePostRamp` — reads `{ from, to, for, ease }`, deliberately the same
  vocabulary as `shot.camera`, because a shot that pulls focus while pushing
  in is describing one move and should read like one.
- `buildPost3D` in the compiler, beside `buildCamera3D`.
- `samplePostAt` — a focused sampler, so a film that keys no post pays one map
  lookup per frame and no writes.
- `setParams` in `post3d.js` — pushes sampled values into the live passes.

Authored as:

```json
{ "shot": "crust", "duration": 6.4,
  "focus": { "to": 0.886, "for": 1.6, "ease": "smooth" } }
```

`focus` is sugar for `post.dof.focus`, since it is overwhelmingly the common
case. The general form reaches any keyable parameter:

```json
"post": { "grade": { "exposure": { "to": 0.4, "for": 2 } },
          "bloom": { "strength": 1.4 } }
```

## What is deliberately not keyable

A guard list is only useful if it excludes things, and each exclusion is a
judgement rather than an omission:

- **`ssao.radius` and `ssao.bias`** are sampling parameters, not look
  parameters. Animating them makes the ambient term *swim* between frames
  rather than change in any way an audience reads as intent.
- **`grade.lift`, `gamma`, `gain`** are triples, and a channel holds one
  scalar. Three channels per triple is a wider change than this needed;
  `exposure`, `contrast` and `saturation` cover what a shot actually asks for.
- **`grainSize`, `vignetteSoftness`** are the *shape* of an effect rather than
  its amount, and animating shape reads as a mistake.

A test asserts that every name in the guard list is a real scalar
`normalizePost` produces — because a guard list that guards a name the pass
does not have is worse than none: it makes a typo look supported.

## Three defects avoided by having just done the camera

**The shot-end hold.** A ramp with `for: 1.6` in a 4s shot writes its arrival
key at t+1.6 and nothing after it, so the track interpolates from there
straight to the next shot's key and the focus creeps for the shot's remaining
2.4 seconds. This is *exactly* the bug the camera had, found during the
transition work. Written correctly the first time here, with a test that
samples 1.6, 2.5, 3.0 and 3.9 — and a second test proving that a shot which
says nothing about focus **holds** rather than drifting between two distant
pulls.

**Smooth sampling.** `__post` had to join `SMOOTH_TARGETS` beside `__camera`.
A film held on twos holds its *drawing* on twos, not its lens; a focus pull
quantised to the hold travels in 2-frame jumps, which reads as a fault in the
render rather than as a camera operator. The test puts a film on twos and
asserts that two frames inside one hold have *different* focus.

**Keying a pass that does not exist.** `focus` on a film whose `meta.post` has
no `dof` pass is a diagnostic. The alternative is an author ramping a number,
watching it change in the file, and seeing nothing happen on screen.

## The Earth film now pulls focus, and does not guess the numbers

The film's own cameras already declare `from.at`/`to.look` for every shot, so
the focal plane is **derivable**: a focus puller does not invent a number,
they measure lens-to-subject and follow it.

```
hello      {"from":2.192,"to":1.961}
reveal     {"from":1.961,"to":3.785}
globe      {"from":6.975,"to":5.625}
open       {"from":5.275,"to":5.639}
crust      {"from":1.268,"to":0.886}
mantle     {"from":0.886,"to":2.48}
outer      {"from":2.48,"to":1.792}
inner      {"from":1.792,"to":1.659}
close      {"from":1.659,"to":3.708,"for":2.4}
```

Each shot's `from` equals the previous shot's `to`: the focus is continuous
across every cut, which is the mark of a puller following the camera rather
than nine independent guesses. It also means a shot whose framing is edited
later cannot silently keep the old focal plane.

And the aperture is now **0.0006 — five times wider** — because it can be what
the shot wants rather than what the worst shot can tolerate. `check:earth` is
clean: compile 0, framing 0, exposure 0, overlay 0, transitions 0.

## Measured on pixels, and the first metric was wrong

Unit tests prove the arithmetic. They cannot prove the number reaches the
lens, and that is precisely where this repo has been bitten: each pass keeps
its parameters somewhere different — `BokehPass` in `uniforms`,
`UnrealBloomPass` as plain fields — so writing to the wrong place changes
nothing and reports nothing.

`test/e2e/rack-focus.mjs` renders a film whose **camera never moves** and
whose only animated value is `dof.focus`, with two striped pickets at 2.5m and
8m in opposite halves of the frame. Any change in sharpness is therefore the
focus and nothing else.

The first version measured mean `|dLuma/dx|` and nearly passed while proving
little. **Mean absolute gradient is total variation, and blur very nearly
preserves it**: spreading an edge over k pixels makes each step Δ/k and there
are k of them, so the sum is unchanged. Measured that way the near picket read
13.698 sharp and 13.210 defocused — a 4% difference for a lens change that is
obvious to look at. Squaring fixes it by the same arithmetic: k steps of
(Δ/k)² sum to Δ²/k, so the measure falls as the blur widens. This is the
standard gradient-energy focus measure, and it is standard for this reason.

What tipped it off was that one target moved and the other did not: the far
picket *did* register on the absolute measure, because at the near focus
setting it was blurred so hard its bars merged into flat grey, which destroys
total variation outright.

With gradient energy:

```
  t     near      far       near/far
  0     612.3     74.2      8.252
  1.5   582.0     74.9      7.770
  3     582.0     1007.4    0.578
```

The ratio **crosses**: the near target starts 8.25× sharper and ends 0.58×.
That is a rack focus, stated as a number.

## A finding worth knowing before authoring a pull

`BokehPass` is **asymmetric**, strongly. The target *behind* the focal plane
went 74 → 1007, a factor of 13.6. The target *in front* of it softened by 5%.
Defocus in this pass is far stronger beyond the focus distance than nearer
than it.

The probe's assertions are asymmetric to match — the strong claim is made
about the far target, and the near target is only required not to get
*sharper*, which it has no honest reason to do. Passing a test on a 5% margin
is passing by luck.

## A fragility found while measuring

`film3d.html` fetches ten `three` modules from a CDN, and every headless run
launches a **fresh** Chrome profile, so the cache is empty every time.
Measured at 7.8s for `three.module.js` alone, which puts a cold page load
within reach of puppeteer's default 30s navigation timeout and occasionally
past it — an intermittent *"Navigation timeout"* that looks like a broken page
and is a slow network. It bit `check:earth` and the new probe once each.

Raised to 120s in the four scripts that load `film3d.html`. The real fix is
the same one the voice take cache applied to Kokoro's weights, and it is
already queued in
[39-OFFLINE-VOICE-WEIGHTS.md](../pending/39-OFFLINE-VOICE-WEIGHTS.md) — the
argument there now covers `three` too.

The new guard from Phase 43 earned itself here: the failure reported
`test:rack:e2e threw in stage "startup"` and exited, instead of hanging.

## Numbers

| | Before | After |
|---|---|---|
| Keyable post parameters | 0 | 18 across 4 passes |
| Earth film's aperture | 0.00012 | 0.0006 (5× wider) |
| Earth film's focal planes | 1, for 65s | 9, continuous across cuts |
| Unit tests | 1,050 | **1,071** |
| Earth film `check` findings | 0 | 0 |

## Files

- `src/core/script/post.js` — `POST_NODE`, `POST_KEYABLE`, `postChannel`,
  `isPostKeyable`, `postChannels`, `normalizePostRamp`, `applyPostSample`,
  `samplePostAt`.
- `src/core/script/compile3d.js` — `buildPost3D`, called from the shot loop
  with `prevPost` threaded like `prevCamera`.
- `src/core/anim/Evaluator.js` — `__post` added to `SMOOTH_TARGETS`.
- `src/render/post3d.js` — `live` pass handles, a `WRITERS` table per pass
  type, `setParams`.
- `film3d.html` — one `postAt(t)` used by all three render paths, rather than
  three copies of the same two lines.
- `scripts/make-earth.mjs` — `focusFor(camera)`, derived per shot.
- `test/core/post-keys.test.mjs` — 21 tests.
- `test/e2e/rack-focus.mjs` — the pixel probe, `npm run test:rack:e2e`.

## Still open

`crossfade` in 3D ([38-3D-CROSSFADE.md](../pending/38-3D-CROSSFADE.md)) is
unaffected. The next audit items are **music ducking** (priority 2, ~30 lines)
and **motion blur by subframe accumulation** (priority 3).
