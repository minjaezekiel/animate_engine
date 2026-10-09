# The motion system

What was built after the fight live test measured **77% of its frames exactly
frozen** while every other check reported clean. Findings and the original
plan: [10-ACTION-GAPS.md](10-ACTION-GAPS.md).

Researched against how production systems solve the same problems, then built
to the same shapes.

---

## 1. Layered evaluation — the root cause

**The defect.** A pose compiled to absolute keys; a cycle was a clip instance
on the same channel. They collided and the pose won — and because a track
reads as its *first* key at every earlier time and its *last* at every later
one, one pose at second three stopped a character breathing for the whole
sixty seconds, *including the three before it*.

It compounded: because poses overwrite, every pose had to restore every
channel any other pose touched. That restoration is what killed the breathing.
The workaround for one bug caused the other.

**How the field solves it.** Layered evaluation: each layer has a weight
(0..1), a blend mode (override or additive) and an optional mask of bone
subtrees. Additive applies `reference⁻¹ × pose` in the bone's local space — a
translation *offset*, a rotation *delta*, a scale *ratio* — scaled by weight.
Unity, Unreal and Animancer all land on the same three pieces.

**What was built.**

```json
"breathe": { "duration": 3.4, "loop": "repeat", "blend": "add", "keys": { ... } }
```

- `Clip.blend` — `'override'` (default) or `'add'`.
- `Clip.mask` — part names the clip may touch, or all of them. An upper-body
  gesture cannot stop the legs walking.
- instance `weight` — `{ "do": "play", "action": "idle", "weight": 0.4 }`.
- `Evaluator.Additive` — a deferred `{delta, ratio}` carried in the Pose,
  because `samplePose` has no scene and the value it layers over may be the
  node's own authored rest value, which only `applyPose` can see.

The reference is **the clip's own value at its local zero**. That is what lets
cycles stay authored as absolute numbers — `breathe` still keys `sy` 1 →
1.018 → 1 — and become deltas around their own rest pose with no re-authoring.
`transform.sx`/`sy` layer as ratios; everything else as offsets, because a
scale that adds reads as the character growing.

`breathe` and `idle` are additive. `walk` and `squash` stay override: they are
whole-body actions, not overlays.

**Measured:** 77% → 0% frozen on the fight; the dialogue film unchanged.

---

## 2. Timing texture — on twos

**The defect.** Every frame was a fresh interpolation. That is the wrong
*texture* even where the motion is right.

**How the field does it.** Anime is drawn at roughly twelve unique drawings a
second against a twenty-four frame soundtrack. The slight choppiness is part
of the visual language, not a defect — and the camera is moved on ones while
the artwork is shot on twos.

**What was built.**

```json
"meta": { "step": 2 }              // the whole film on twos
{ "id": "17-collide", "step": 1 }  // this shot on ones
```

Cast channels sample at `floor(frame / step) * step / fps`. `__camera` and
`__subtitle` are exempt by name — a quantised pan judders badly, which is
exactly why productions separate them.

This also forced a correction to the measurement: `analyseMotion` compares
**drawings**, not frames. On twos every second frame is identical by
construction, so a frame-based measure would score the anime standard as 50%
frozen and punish the texture it exists to encourage.

---

## 3. Smears — multiples

**How the field does it.** Two techniques: the *elongated in-between*, which
stretches the subject along its path for a frame or two, and *multiples*,
which duplicates the subject along its motion path at falling opacity.

**What was built** — multiples:

```json
"cast": [{ "character": "sora", "as": "sora", "at": [430],
           "echo": { "frames": 3, "spacing": 2, "falloff": 0.42,
                     "shots": ["10-rush", "17-collide"] } }]
```

Built as a **compile pass that clones the subtree and time-shifts its tracks**,
not as a history buffer in the renderer. A buffer would make frame N depend on
the frames rendered before it, and the whole engine rests on frame N being a
pure function of N — that is what lets a film be scrubbed, re-rendered and
compared against golden hashes. A clone whose tracks read two frames earlier
gives the identical picture and keeps the guarantee.

`shots` gates it. A trail belongs to the one or two shots that need it: a
character is not smearing while it stands still, and three ghosts of a
nineteen-node rig is not free.

Not yet built: the elongated in-between. See *Still missing*.

---

## 4. The motion-graphics draw layer

Five properties, usable on any part or scenery item, resolving colours through
the palette like everything else.

| property | what it does |
|---|---|
| `blend` | `add` · `screen` · `multiply` · `overlay` · `darken` · `lighten` · `normal` |
| `glow` | `{ blur, color, x, y }` — the only blur Canvas2D offers without a second surface, and enough for an aura or a hot edge |
| `trim` | `{ start, end, offset }` — a stroke drawn as a fraction of its own length |
| `repeat` | `{ count, x, y, rot, sx, sy, alpha, from }` — the same node drawn many times with accumulating offsets |
| `gradient` | now on `path` and `ellipse` as well as `rect`, and `kind: "radial"` |

`add` is how every energy effect in this idiom is made; Canvas2D spells it
`lighter`. `trim` is implemented with the dash array rather than by splitting
the path, because Canvas2D exposes path length nowhere — a dash of `span × L`
on and `L` off, offset by the start, reproduces it for any `L` longer than the
path.

The whole speed-line burst in the fight is **one node**:

```json
{ "id": "ray", "shape": { "kind": "path", "d": "M120,0 L470,0" },
  "stroke": "flash", "strokeWidth": 7, "blend": "add",
  "trim": { "start": 0, "end": 0.72 },
  "repeat": { "count": 18, "rot": 0.349, "alpha": 0.97 } }
```

Eighteen drawings, no extra scene nodes, no extra tracks.

---

## Measured, before and after

| | before | after |
|---|---|---|
| frames with no cast movement | **77%** | **0%** |
| frames visibly moving | 21% | 34% |
| "shot is completely still" diagnostics | 7 | 0 |

Drawing-to-drawing change with the camera locked, against **0.85** for a
dialogue scene in the reference clip:

| beat | before | after |
|---|---|---|
| 01 clash | — | 9.3, 11.1, 14.2 |
| 12 giant swing | **0.00** | 2.8, 2.6, 2.7 |
| 17 the climactic clash | **0.00** | 3.0, 10.6, 9.9, 12.9 |

---

## Still missing, honestly

The engine is still a **rigid cutout system**: every part is a rigid
transformed shape. These are the next tier, in order of effect.

### Deformation — the largest remaining gap

A limb cannot bend. Production 2D rigs deform: Spine binds mesh vertices to
bones with weights and skins them by a weighted sum of bone transforms; Moho's
*smart bones* drive corrective poses from a bone's own angle, which is pose
space deformation under another name.

The engine's art is **vector paths, not textures**, which makes this *easier*
than the texture case rather than harder: skinning a path means transforming
its control points, and Canvas2D draws the deformed path natively with no UVs,
no triangulation and no WebGL.

Planned shape:

- `deform: { bone, weights }` on a part — each control point weighted between
  its own bone and the child bone, so an elbow bends instead of hinging;
- a `drive` block — a child bone's angle drives a corrective shape, which is
  the smart-bone mechanism and the thing that makes a 2D bend read as drawn.

### Elongated smears

The other half of the smear vocabulary: stretch the drawing along its motion
direction for one or two frames. Needs the deformer above to be worth doing,
since the stretch should follow the limb rather than the node's axes.

### Secondary motion

Hair, coat and sash are rigid. Spring-driven offsets from each part's own
velocity, layered through the additive system — which is the argument for
having built the additive system first.

### Per-pose z

`drawOrder` is depth-first, so a child always draws over its parent and `z`
only sorts siblings. A raised arm draws over the head, and in a fight limbs
cross the body constantly.

### Hit-stop

`step` holds the whole film or a whole shot. Hit-stop is the same mechanism
with a window — hold 3 frames at the moment of impact while the camera keeps
moving — and should be an action option rather than a shot one.
