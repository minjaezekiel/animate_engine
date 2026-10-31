# Flow: travelling dashes

A river has to look like it is moving. So does hydrothermal fluid climbing a
shear, sediment going downstream, and current in a wire. Until now the engine
could draw all of those and none of them moved.

## What was already there, and why it could not be used

`shapes.js` has had `trim` since the motion-graphics phase:

```json
{ "kind": "path", "d": "...", "stroke": "water", "trim": { "start": 0, "end": 0.25, "offset": 0, "length": 8000 } }
```

`applyTrim` implements it with the dash array — `setLineDash([span * L, L])`,
`lineDashOffset = -(start + offset) * L` — and that implementation turns out to
be more capable than the feature it was written for. With the default
`length: 8000` ("longer than any path this engine draws") one dash covers the
whole shape and you get a single trimmed segment. But **set `length` small and
the dash array repeats**: `length: 160` with `end: 0.25` is 40 on, 160 off,
over and over down the path. Ramp `offset` and that repeating pattern travels.

That is flowing water, and it was reachable the whole time except for one
thing: **`trim` is an object, and the interpolator keys scalars.**

`applyPose` is explicit that channel paths are "dotted and shallow by design":

```js
const group = path.slice(0, dot);     // 'props'
const field = path.slice(dot + 1);    // 'trim.offset'
node.props[field] = value;            // props['trim.offset'] = 0.5
```

So `set props.trim.offset` writes a property literally named `"trim.offset"`,
which nothing reads. No error, no diagnostic, no drawn difference — the
authored animation simply does not exist. `diagram.mjs` records the conclusion
that was drawn from this at the time: *"`trim` can only be stepped, not
ramped"*, and `drawOn` was routed through `props.progress` on a `drawing`
instead.

That conclusion was right about `trim` and wrong about the capability. Deep
channel paths are not the only way to animate one number inside an object.

## The change

One scalar prop, `props.flow`, added to `trim.offset` at draw time.

```js
function applyTrim(ctx, p, trim, flow = 0) {
    ...
    ctx.lineDashOffset = -(start + offset + flow) * L;
}
```

`props.flow` is a plain number on the node, so it keys, interpolates and eases
like `props.alpha` — no reflection machinery, and `applyPose` stays shallow.
It composes with an authored static `trim` rather than replacing it, so a path
can be both trimmed to a quarter of its length *and* flowing.

This is the same shape as two decisions already in the engine: `props.boil` is
one number selecting a jitter seed, and `props.progress` is one number
selecting how much of a drawing exists. A single scalar standing in for an
awkward internal is the established idiom here.

## Direction and speed

`flow` counts whole dash **periods**. A period is the on-dash plus the
off-dash, `length * (end - start + 1)` pixels, so `flow = 1` advances the
pattern by exactly one period whatever the span is. A flow of 1.0 per second
therefore moves one period per second and speed is read straight off the keys
instead of being tuned by eye.

Scaling flow by `length` alone was the first implementation and it was wrong:
with `end: 0.25` one unit of flow advanced 1/1.25 of a period, so a loop
authored as 0 -> 1 jumped a quarter period at every cycle boundary. Counting
periods instead makes the seam claim below true for any span, which is the
only reason a loop can be one linear key pair.

Sign is direction. Because `lineDashOffset` is negated, **increasing `flow`
moves the pattern along the path in its drawn direction** — the direction the
`d` string goes. A river that flows right to left is authored either as a path
drawn right to left, or with a descending `flow`. Both work; the first is
easier to reason about and is what `riverParts` does.

## Looping without a seam

A continuous ramp over a long shot ends up at `flow: 40` and the keys get hard
to read. It also need not be continuous: the dash pattern is periodic and
`flow` is measured in periods, so **`flow` and `flow + 1` draw identical
pixels.** A ramp of N over N periods is therefore seamless at every instant,
not only at the ends, so `flowLoop` emits a single linear key pair and lets
the ramp run: per-cycle keys would be the same line with more numbers in it.

```js
flowLoop('river', 'streak0', { period: 2.0, cycles: 8 })
```

Easing matters more than it looks. Water does not accelerate and decelerate
between keys; `smooth` on a flow ramp produces a visible pulse once per cycle,
which reads as a stutter rather than as current. Flow keys are linear.

## What it does not do

- **No turbulence.** The pattern translates rigidly. Eddies, breaking and
  foam are authored as separate parts at different speeds, which is how flat
  2D water has always been faked and suits the diagram look.
- **Stroked paths only.** `flow` does nothing on a fill. A river is a filled
  body with stroked streaks over it.
- **No per-dash variation.** Every dash in one part is identical. Varying
  width or brightness along the stream means more parts.

## Tests

`test/core/flow.test.mjs`:

- `flow` absent leaves `lineDashOffset` exactly where `trim` alone put it, so
  every existing film is byte-identical.
- `flow` with no `trim` still dashes, taking `length` and a default period.
- `flow` and `flow + 1` produce the same recorded draw calls — the loop
  seam claim, as an assertion rather than a comment.
- `flow` of 1.0 offsets by exactly one dash period, for several spans --
  the arithmetic the first implementation got wrong.
- Sign: increasing `flow` moves the pattern in the path's drawn direction.
- A `flow` key interpolates (it is in the pose as a number, not an object),
  which is the thing `props.trim.offset` silently failed to do.
