# The film script — `jirex.film/1`

A film is one JSON document. It is the only artifact the pipeline needs, and
it is what both a person and an AI produce.

Three constraints shaped the format:

1. **An author never does arithmetic.** Shots and scenes sequence
   automatically; `at` is relative to the shot it sits in.
2. **It compiles purely and deterministically**, which makes the compiler the
   highest-value test target in the repo.
3. **Dialogue carries its text**, not just an audio file — because the text is
   what makes lipsync accurate.

## Shape

```json
{
  "version": "jirex.film/1",
  "meta":    { "title": "…", "fps": 24, "width": 1280, "height": 720 },
  "voices":  { "mara_v": { "spec": "tts:en_GB-alba-medium" } },
  "assets":  { "music": { "kind": "audio", "src": "assets/theme.mp3" } },
  "palettes":{ "dusk": { "coat": "#b23a2c", "skin": "#e8c39e" } },
  "characters": { "mara": { … } },
  "scenes": [ { … } ]
}
```

`meta.duration` is **derived, never declared.** Declaring one produces a
diagnostic and is ignored, so a film cannot disagree with itself.

## Characters

Either author the parts, or ask for a figure:

```json
"mara": {
  "palette": "dusk",
  "voice": "mara_v",
  "generate": { "cloth": "coat", "hair": "hair" },
  "proportions": { "height": 196 },
  "poses":   { "point": { "armR": { "rot": -1.35 }, "head": { "rot": -0.12 } } },
  "actions": { "nod": { "duration": 1.2, "loop": "repeat",
                        "keys": { "head.rot": [[0,0],[0.6,0.2],[1.2,0]] } } }
}
```

`generate` builds a 19-part cutout humanoid with correctly placed joints, a
six-shape mouth, and the cycles `idle`, `breathe`, `walk` and `blink` for
free. This is deliberate: an author — especially an LLM — should be able to
*ask* for a character rather than hand-write forty SVG paths.

To author parts explicitly instead:

```json
"parts": [
  { "id": "hips",  "parent": null,   "shape": {"kind":"ellipse","rx":18,"ry":14}, "fill":"coat", "z":10 },
  { "id": "torso", "parent": "hips", "pivot":[0,-2], "shape":{"kind":"path","d":"M-16,0 …Z"}, "fill":"coat", "z":12 },
  { "id": "armL",  "parent": "torso","pivot":[-13,-40], "shape":{"kind":"path","d":"M0,0 L4,34"},
    "stroke":"coat", "strokeWidth":9, "z":11 }
]
```

**`pivot` is the joint.** The part tree *is* the rig — parent/child
`Transform2D`, no skin weights, no bind matrices. Rotating `armL` swings
`foreL` and `handL` with it because they are its children.

`fill` and `stroke` may name a palette entry or give a colour directly.

### Mouth

```json
"mouth": { "parent": "head", "pivot": [0,8], "shapes": {
  "closed": {"kind":"path","d":"M-7,0 L7,0"},
  "mid":    {"kind":"ellipse","rx":6,"ry":3},
  "open":   {"kind":"ellipse","rx":7,"ry":7}
}}
```

One node whose shape is swapped by the viseme track, so lipsync writes a
single discrete channel. Declaring only `closed`/`mid`/`open` is fine — the
six-viseme set degrades through a fallback chain. See [03-VOICE.md](03-VOICE.md).

## Scenes, scenery, shots

```json
{
  "id": "harbour",
  "palette": "dusk",
  "background": { "color": "#17233f",
                  "gradient": { "from": [0,-360,0,300], "stops": [[0,"#111b33"],[1,"#c4663a"]] } },
  "transitionIn":  { "kind": "fade", "from": "#000000", "duration": 1.6 },
  "transitionOut": { "kind": "crossfade", "duration": 1.0 },
  "scenery": [ { "id":"sea", "shape":{"kind":"rect","w":2600,"h":300,"cx":true},
                 "at":[640,498], "fill":"sea", "z":-800 } ],
  "cast":  [ { "character":"mara", "as":"mara", "at":[252,648], "scale":0.92 } ],
  "audio": [ { "asset":"music", "at":0, "gain":0.35, "fadeIn":2.0, "bus":"music" } ],
  "shots": [ … ]
}
```

A shot:

```json
{
  "id": "h2",
  "duration": 8.5,
  "camera": { "to": { "x": -230, "y": -40, "zoom": 1.5 }, "ease": "smooth" },
  "actions": [
    { "target":"mara", "do":"play", "action":"idle" },
    { "target":"mara", "do":"pose", "pose":"point", "at":4.0, "for":0.8,
      "ease":"bezier", "h":[0.3,0,0.2,1] }
  ],
  "dialogue": [
    { "speaker":"mara", "at":0.5, "text":"The light has never failed.",
      "lipsync":true, "subtitle":true }
  ]
}
```

### Verbs

| `do` | Effect |
|---|---|
| `play` | instance a named action as a clip, tiled across `for` (or the shot) |
| `pose` | key every channel in a named pose; with `for`, transition from the current value |
| `move` | key the cast root's `x`/`y` to `to` over `for` |
| `reach` | **IK** — put `part` on the point `to`, solving the bones above it |
| `set` | key an arbitrary channel; `part` selects a sub-node |
| `show` / `hide` | key the cast root's alpha |

#### `reach` — inverse kinematics

Authors think in positions; a cutout rig wants rotations. `reach` closes that
gap: name the part and the point, and the compiler solves the chain above it
and keys the rotations.

```json
{ "target": "jonas", "do": "reach", "part": "handL",
  "to": [-55, -95], "at": 0.4, "for": 0.9, "bend": -1 }
```

| key | meaning |
|---|---|
| `part` | the part to place — a hand, a foot, any joint |
| `to` | the target **in the character's own space**, its root at the origin |
| `bones` | how many bones above `part` to solve; default `2` (elbow or knee) |
| `bend` | `1` or `-1` — the two mirror elbow solutions. Pick what reads right |
| `for` | ramp in from whatever held before, exactly as `pose` does |

`to` is in character space rather than scene space on purpose: a reach then
means the same thing wherever the character is standing and at whatever
scale, so staging a shot does not break every pose in it.

Two bones are solved in closed form and hit a reachable target **exactly**.
Longer chains, and any chain with rotation limits, fall through to CCD seeded
from the closed form. An unreachable target is not an error — the limb extends
as far as it goes and the compiler emits an `info` diagnostic saying by how
much it fell short.

**Ceiling worth knowing:** the chain is solved against its **rest pose**. A
character whose torso is leaning or breathing has moved the shoulder out from
under the solve, so the hand lands slightly off — measured at 2.3 px on the
demo film. See [01-CORE.md](01-CORE.md#rig-and-ik).

### Camera

Coordinates are offsets from frame centre, so `{x:0,y:0,zoom:1}` is a neutral
framing and authored cast positions read as screen positions.

**Omitting `from` continues from the previous shot**, which is what keeps a
multi-shot pan continuous instead of snapping back at every cut. Across a
*scene* boundary the camera resets to neutral, since a new scene is a new
place.

### Transitions

`fade` animates a screen-space overlay's alpha. `crossfade` ramps the alpha of
both scenes over the same window — either side may declare it and the compiler
gives both scenes matching ramps.

Both compile to ordinary core tracks. That matters: the previous
implementation used CSS overlays, which were invisible to every export path.
As scene nodes they appear in every sink by construction.

## Compilation

```js
compileFilm(film, { assets }) -> {
  scene, timeline, audioCues, lipsyncJobs, diagnostics, meta, cameraId
}
```

What it does:

- **Time** accumulates: `shot.start = Σ previous durations`, scenes likewise.
  An `at` inside a shot is offset once into absolute time.
- **Cast instantiation** deep-copies each character's part tree into nodes
  named `<sceneId>/<as>/<partId>`. Scene scoping is load-bearing: the same
  character cast in two scenes must be two independent instances, because a
  crossfade renders both at once.
- **Scenes** become group nodes with an animated `props.alpha`.
- **One camera** for the whole film, animated. Only one renders at a time, so
  a second camera object would buy nothing.
- **Dialogue** emits an audio cue plus a lipsync job; the job runs after
  synthesis, since it needs real samples.

### Unknown fields are diagnostics, never errors

An LLM will emit plausible-but-unsupported keys. A render that aborts at frame
1 on a typo is worse than one that renders and reports, so `validateFilm`
returns `{severity, path, message}` entries — `warning` for anything
unrecognized, `error` for a broken reference (a missing character, an
undeclared asset, a duplicate part id), and `fatal` only when there is
nothing to render at all.

## Authoring from a screenplay

```js
parseScreenplay(text) -> { film, diagnostics, speakers, estimatedDuration }
```

Recognized, forgivingly:

```
TITLE: The Keeper
## SCENE: the harbour at dusk      (or: INT. LAMP ROOM - NIGHT)
[the sea works against the rocks]  action

MARA
The light has never failed.        speaker then dialogue

MARA (quietly)                     parentheticals are fine
Tonight it failed.

JONAS: You should not have come.   speaker and line on one row
```

Characters are detected from speaker lines, each gets a generated figure and a
suggested voice, every beat becomes its own shot, and shot lengths start from
a word-count estimate. `retimeToAudio` then corrects them once the lines have
actually been voiced — otherwise a shot shorter than its dialogue would cut
the speech off.

## Driving it programmatically

`engine.runCommands([{op, args}])` on the legacy 3D engine is imperative and
interactive — right for an agent iterating against a live editor. The film
script is declarative and batch — right for producing a finished film in one
shot. Both are kept; they solve different problems.

In the studio page, `window.jirex` exposes `setFilm`, `prepare`, `render` and
`produce`, so an agent can author a `film.json` and render it without touching
the UI.
