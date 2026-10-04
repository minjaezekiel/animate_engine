# Core contracts

Everything in `src/core/` is pure with respect to time, has no DOM access and
no Three.js import. If you are adding to core and reach for a clock, a random
number or a browser global, that code belongs in a backend, a sink or
`studio.js` instead.

## Scene graph

```js
// core/scene/Node.js — data only, no behavior, no backend object
Node = { id, name, kind, parentId, childIds[], transform, props, visible, z, tags }
// kind: group | path | rect | ellipse | image | text | mesh | light | camera | bone
```

`props` is an open bag: `fill`, `stroke`, `strokeWidth`, `alpha`, `d`, `rx`,
`ry`, `w`, `h`, `text`, `viseme`, `zoom`, `screenSpace`, …

```js
Transform2D = { x, y, rot, sx, sy, skx, ox, oy }   // flat numbers
```

`ox`/`oy` is **the pivot, and it is the whole trick behind a cutout rig**: it
is subtracted before rotation and scale, so a limb rotates about the joint
where it attaches rather than about its own centroid. `core/math/mat2d.js`
composes it as translate → rotate → skewX → scale.

Nodes carry no backend object. Backends keep their own `coreId → object`
registry, which is what lets one scene render through canvas2d and three3d, be
structured-cloned into a worker, or be snapshotted for history.

```js
Scene {
  root; byId: Map<id, Node>
  add(spec, parentId) -> Node        // throws on a duplicate id
  remove(id)                         // removes the whole subtree
  reparent(id, newParentId)          // throws on a cycle
  get(id) has(id) walk(fn, fromId?)  // walk: return false to prune
  drawOrder() -> Node[]              // depth-first, siblings by z then insertion
  worldMatrix(id) -> mat2d           // cached
  invalidate(id) invalidateAll()     // call after mutating a transform
}
```

`drawOrder()` skips invisible subtrees, so hiding a parent hides its children.

## Animation

```js
Keyframe = { t, v, ease, h }
// t: seconds. ease: linear | step | hold | smooth | bezier. h: [x1,y1,x2,y2]

Track = { target, path, type, keys }
// target: node id
// path:   dotted channel — 'transform.x' | 'props.fill' | 'props.viseme'
// type:   number | vec2 | vec3 | quat | color | discrete

Clip     = { id, name, duration, loop, tracks }   // loop: once | repeat | pingpong
Timeline = { fps, duration, tracks, instances, clips }
```

Two conventions worth knowing:

- **An ease belongs to the key it leaves.** `setKey(t, 0, v, 'step')` holds
  until the next key, matching how every keyframe UI behaves.
- **A track clamps outside its range** rather than extrapolating, so a shot
  that outlives its keys holds the final pose.

### Clip instances

A clip is *instanced*, not baked:

```js
instances: [{ clipId, start, end, speed, scopeId }]
```

`scopeId` is a node-id prefix, so one `walk` clip drives any cast member:
clip track `hips` under scope `harbour/mara` resolves to
`harbour/mara/hips`. A looping cycle therefore costs a handful of keys no
matter how long it plays.

### Evaluator

```js
Evaluator.sample(timeline, tSec) -> Pose    // Map<nodeId, Map<path, value>>
Evaluator.apply(scene, pose)                // writes transform / props
Evaluator.trackValueAt(track, tSec)         // the one interpolation entry point

Evaluator.createBaseline(scene, timeline) -> baseline
Evaluator.reset(scene, baseline)
Evaluator.channels(timeline) -> [[nodeId, path], …]
```

Explicit timeline tracks win over clip instances, so a one-off pose can
override a cycle.

Interpolation happens **at sample time**, not by pre-densifying keys into a
fixed-rate track. The original engine densified bezier segments at 30 fps and
then rendered at other rates, which quantized the easing; sampling directly
makes the curve exact at whatever fps a render uses, and makes easing work for
rotation too.

### Baselines, and why they exist

A clip instance only contributes while it is active. The `walk` cycle writes
`thighL.rot` between 7 s and 10 s and *nothing* writes it outside that window —
so without intervention the limb keeps whatever the last active frame left
behind, and frame *N* starts depending on render history. That breaks
scrubbing, re-rendering and golden-frame comparison.

`createBaseline` snapshots the authored value of every channel the timeline
can touch; `OfflineRenderer` resets to it before each frame and restores it
when the render finishes. Baselines are cached per timeline, because the
snapshot must come from the scene **as authored** — capturing it from an
already-rendered scene is how a second render silently diverges from the
first.

## Rig and IK

`core/rig/IK2D.js` is pure: no scene, no clock, no DOM. A bone is
`{ length, rest, min?, max? }` and the target is a point in the **chain
root's** pivot space, so the solver never needs the scene graph.

```js
solveTwoBone({ bones, target, bend })      -> { rots, error, tip, clamped }
solveChain  ({ bones, target, bend, iterations, tolerance })
forwardKinematics(bones, rots)             -> joints[]   // bones.length + 1
chainFromParts(parts, tipId, count)        -> { bones, rootId, tipId } | null
chainRootOffset(parts, rootId)             -> [x, y]
```

### The angle convention, which is the only subtle part

`rest` is the direction a bone's own geometry points in its parent's frame.
`rot` is the node's `Transform2D.rot`, which **also rotates every
descendant**. So a bone's world direction is `rest_i + Σ rot_0..rot_i`, and
`forwardKinematics` accumulates accordingly. A solver that assumed every bone
points straight down would be subtly wrong on the generated humanoid, whose
limbs lean a few degrees.

### Why no separate rig format

`chainFromParts` reads the rig straight off the character's `parts` list. The
cutout convention does the work: a child's `pivot` is expressed in its
parent's frame and sits at the parent's tip, so **the child's pivot IS the
parent's bone vector** — length and rest direction both. That holds for
generated characters and for any hand-authored character that pivots its
joints where the joints are, so there is no skeleton to declare, keep in sync
or get wrong.

### Degenerate cases return a pose, never `NaN`

- target beyond `l0 + l1` → limb extends toward it, `clamped: true`
- target inside `|l0 - l1|` → limb folds fully
- target on the root → the rest direction, finite
- rotation limits → honoured by CCD, and reported as not reached

Each is unit-tested, because a `NaN` rotation does not throw — it silently
propagates into a transform and the character vanishes mid-film.

### Where it is solved, and the ceiling that buys

IK runs at **compile time**, not per frame: the solver emits rotation
keyframes and the render loop never sees it. That keeps the render path
exactly as deterministic as it was, and costs one approximation — the chain is
solved against its rest pose, so an animated torso moves the shoulder out from
under the solve. Measured at **2.3 px** on the demo film. Solving against the
live world matrix would require sampling a timeline that the solve is in the
middle of building, which makes compilation order-dependent. Not worth it at
two pixels.

## FrameClock

```js
new FrameClock(fps).timeOf(n)   // n / fps — division, never accumulation
                   .count(sec)  // frames for a duration
```

`timeOf(2879) * 24 === 2879` exactly. Accumulating `+= 1/fps` would not hold.

## Backend contract

```js
Backend {
  mount(host, {width, height})   // HTMLElement | canvas | OffscreenCanvas
  unmount() resize(w, h)
  sync(scene, dirtySet?)         // reconcile backend objects to core nodes
  renderFrame(scene, cameraId)   // SYNCHRONOUS — no rAF, no await
  canvas()
  capabilities                   // { kind: '2d'|'3d', postFX, skinning }
}
```

`renderFrame` being synchronous and rAF-free is the single contract that makes
a frame-stepped offline render possible: a backend that scheduled its own
frames could not be driven.

`Canvas2DBackend` accepts any `CanvasRenderingContext2D`-shaped object. That
is how the 2D path is tested in Node with no native canvas — `RecordingContext`
logs the draw-call sequence instead of rasterizing, and asserting that list
catches the bugs 2D actually has: wrong transform order, wrong z-order, a limb
drawn before its parent's transform landed.

The 2D camera is just the inverse of a camera node's transform, recentred on
the frame. A node with `props.screenSpace` skips it, which is how backgrounds,
subtitles and transition overlays stay put while the camera pans.

## FrameSink contract

```js
FrameSink {
  configure({width, height, fps, totalFrames, canvas, audioBuffer, codecHint})
  writeFrame(canvas, frameIndex, tSec) -> Promise<void>
  finish() -> Promise<Blob|object>
  abort()
  static available(opts) -> Promise<bool>
}
```

**`writeFrame` must consume and release the frame.** A two-minute 1080p render
is 23.9 GB of raw RGBA; a sink that retains frames cannot finish. Any
`VideoFrame` created must be `.close()`d or the browser's encoder queue stalls.

## Testing core

- `Evaluator`, `Track`, `FrameClock`, `compileFilm`, `lipsync`, cue maths,
  `screenplay`, `Scene`, `IK` — all plain Node tests.
- `OfflineRenderer` + `MemorySink` + a null backend runs the entire
  2,880-frame loop in Node in well under a second, asserting the pose and
  timestamp of every frame.
- Determinism is asserted on the **draw-call stream**, not on pixels.
  Rasterizers are not required to be bit-reproducible (Chrome moves a canvas
  between GPU and CPU rasterization during frequent `getImageData`, which
  perturbs antialiasing); the renderer is, and the call stream tests exactly
  that.
