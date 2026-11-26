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
free. `generate.walk` takes `{ cadence, style }` -- a name from `CADENCES`
(`brisk`/`natural`/`casual`/`weary`) or seconds per two-step cycle, and
`'anime'` for a flatter, wider-swinging variant. To walk somewhere without
sliding the feet, ask `walkStride()` how far one cycle carries the character
and give `move` that distance over a whole number of cycles; `walk` and `move`
are otherwise independent. This is deliberate: an author — especially an LLM — should be able to
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

### Drawings and photos

Two more things a scene can hold, both animated by one channel —
`props.progress`, 0 to 1 — and therefore both retimed by the same `draw`
verb.

```jsonc
"drawings": [{
  "id": "sketch", "at": [640, 360],
  "layers": [{ "name": "ink", "blend": "multiply", "strokes": [
      { "path": "M 100 400 C 300 120, 600 120, 800 400",
        "brush": "pencil", "color": "ink", "size": 6 } ] }]
}],
"photos": [{
  "id": "hero",
  "source": "portrait", "depth": "portrait_depth",    // asset ids
  "duration": 6, "tear": true,
  "effects": [{ "type": "kenBurns", "to": { "zoom": 1.12 } },
              { "type": "parallax", "amplitude": 0.05 }]
}]
```

Strokes are **SVG path data**: one line instead of two hundred numbers, in
the most widely published vector notation there is. Colours resolve through
the scene palette like everything else painted, so a drawing restyles with
the scene.

The two defaults are deliberately opposite. A **drawing** with no `draw`
action holds at `progress: 1` — it should be *present*, the way a character
with no actions stands in its rest pose. A **photo** with no action
*plays*, across its own duration, defaulting to the rest of the scene,
because a photograph in a shot is there to move.

Full detail: [16-PAINT.md](16-PAINT.md) for the brushes and
[17-MOTION-AND-MCP.md](17-MOTION-AND-MCP.md) §3 and §7 for the effects,
mesh tearing and depth maps.

### Verbs

Every verb lives in one table, [`src/core/script/verbs.js`](../src/core/script/verbs.js),
which **both compilers read**. That is the whole of the mechanism: the `2D`
and `3D` columns below are the table's `paths` field, and they are checked in
three places and nowhere else — `validate.js`, and each compiler's `default:`
branch.

An arrow means the verb is not on that path and names what to say there
instead; `—` means there is no equivalent, which is an honest answer and a
recorded engine gap rather than a typo. Either way the compiler says so, by
name: before Phase 57 a 2D film that wrote `nudge` was told the word was
unknown, which is false — it is a verb, on the other path.

| `do` | 2D | 3D | what it does |
|---|---|---|---|
| `move` | yes | yes | go to an absolute position |
| `set` | yes | yes | write one channel directly; `part` selects a sub-node |
| `play` | yes | yes | run a named cycle, tiled across `for`, or an imported clip |
| `spin` | yes | yes | rotate, by whole revolutions (`turns`) |
| `squash` | yes | yes | squash and stretch at conserved volume |
| `grip` | yes | yes | take a named hand pose on `handL` / `handR` |
| `show` | yes | yes | reveal, mid-shot |
| `hide` | yes | yes | conceal, mid-shot |
| `sound` | yes | yes | fire an effect at a shot-relative moment |
| `pose` | yes | → `play`, or `nudge` for one bone | adopt a named pose from the character |
| `reach` | yes | → a `targets` entry with an `ik` constraint | **IK** — put `part` on a point, solving the bones above it |
| `shift` | yes | → `nudge` | move BY an offset from where it is |
| `count` | yes | — | a numeric readout that ramps and reformats |
| `draw` | yes | — | reveal a drawing stroke by stroke, or play a photo's motion |
| `expose` | yes | — | an exposure sheet: hold drawings for n frames each |
| `boil` | yes | — | reseed a drawing per hold, for a living line |
| `smear` | yes | → `meta.shutter` | a smear frame through the fastest part of a move |
| `nudge` | → `shift` | yes | offset BY an amount from the rest pose |
| `turn` | → `spin` | yes | rotate to an absolute orientation, in degrees |
| `grow` | → `set transform.sx` | yes | scale to an absolute size |
| `fly` | — | yes | arrive from an offset start pose — an assembly shot |
| `cut` | — | yes | slide a declared clip plane through a solid |
| `express` | → the cast entry's `expression` | yes | a facial expression, as morph weights |
| `burst` | — | yes | fire a declared particle emitter |

Adding a verb is **one row and one handler**. A row that promises a path
whose compiler has no handler is reported as a *table/compiler divergence*,
and `test/core/verbs.test.mjs` fails on it — in both directions: it also
reads each compiler's own source back out and fails on a verb implemented
there and absent from the table, which is how all 15 of the cross-path verbs
came to exist in the first place.

#### `sound` — an effect at a shot-relative moment

```json
{ "do": "sound", "asset": "slam", "at": 2.0, "gain": 0.8 }
```

No `target`: an asset is not a cast member. Before Phase 57 the 2D path
could declare audio only at **scene** level, with `at` measured from the
start of the scene — so a door slam two seconds into the third shot was
arithmetic the author did by hand, and redid whenever a shot above it changed
length. A scene-level `audio` entry is still the right place for a music bed,
which belongs to the scene rather than to a moment in it.

#### Characters from an uploaded image

A character's `parts` can be crops of an uploaded picture rather than drawn
paths, which is what `trace_character` and **Trace a character from an image**
in `film.html` produce. The parts are named like the generated rig, so
everything in this document applies to one unchanged — including the free
`idle`/`walk`/`breathe` cycles, which key off `proportions` rather than
`generate`. See [20-IMPORT.md](20-IMPORT.md).

#### `grip` — hands and fingers

A cutout's hand used to be a single mitten path, which is why a character
could never point, grip, wave or count: there was nothing below the wrist to
rotate. `generate.hands` decides how much hand there is, and `grip` poses it.

```json
{ "target": "jonas", "do": "grip", "part": "handR",
  "pose": "fist", "at": 0.4, "for": 0.3, "amount": 1 }
```

| `generate.hands` | what gets drawn |
|---|---|
| `"none"` | the original single mitten, for a film that wants it back |
| `"mitten"` | palm, a two-segment thumb, and the four fingers as one two-segment mitt — **the default**, and how a Toon Boom or Moho cutout hand is built |
| `"fingers"` | palm, thumb and four separate two-segment digits, for a close-up |

Poses: `relaxed`, `open`, `spread`, `fist`, `point`, `pinch`, `grasp`,
`thumbsUp`. `amount` blends toward one — a hand half way to a fist is a hand
about to close, which is the difference between a gesture and a switch.

`grip` writes onto whichever parts the character actually has, so a film
written against `fingers` still plays on a `mitten` rig with the four
fingers' average curl on the mitt. The same table drives the 3D rig's
`grip`, so `fist` is the same shape on both paths.

**How a curl is drawn depends on the view, and that is not a detail.** In
profile a curling finger swings across the frame and a rotation is the whole
of it. Face on, it barely rotates at all — it turns toward the camera and
**foreshortens**, which is why an animator draws a fist rather than rotating
one. `grip` splits the curl between `rot` and `sy` by the character's `view`,
so a front-facing hand shortens and a profile one swings. Rotating a
front-facing hand instead produces a wrist bending sideways.

**Ceiling worth knowing:** the digits are also a real IK chain, so
`{ "do": "reach", "part": "indexL2" }` solves a finger onto a point. And the
thumb's opposition is out of the picture plane; a cutout cannot rotate into
depth, so what carries it in 2D is the thumb swinging across the palm. A
drawing swap through `swapSets` is still the sharper tool for a hero close-up.

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

## Driving it from an agent

Two ops reach the 2D pipeline from `runCommands`, which is what the MCP server
relays to — so an agent can produce a finished film without touching the
editor UI:

| op | what it does |
|---|---|
| `loadFilm` | `{film}` or `{url}` — compiles and reports the derived duration, frame count and diagnostics, without rendering |
| `renderFilm` | renders to WebM with audio, lipsync and subtitles; returns a summary and keeps the blob |
| `readFilmChunk` | `{offset, length}` — pulls the rendered bytes as base64 |

The MCP tools `load_film` and `render_film` wrap these; `render_film` with a
`path` does the chunked pull and writes the file.

`readFilmChunk` exists because a finished film cannot cross the page boundary
as a data URL. Several megabytes of string arrives **truncated with no error**,
writing a file of a few bytes — which looks like a successful render until you
open it.

## Driving it programmatically

`engine.runCommands([{op, args}])` on the legacy 3D engine is imperative and
interactive — right for an agent iterating against a live editor. The film
script is declarative and batch — right for producing a finished film in one
shot. Both are kept; they solve different problems.

In the studio page, `window.jirex` exposes `setFilm`, `prepare`, `render` and
`produce`, so an agent can author a `film.json` and render it without touching
the UI.

## Vector and sprite-sheet import

**Phase 63.** Every 2D import used to end in `createImageBitmap`, so a vector
logo arrived as pixels and the first shot that pushed in on it went soft.
Both halves of the fix were smaller than they look, because the engine
already had the renderer for each and only wanted the arithmetic.

### SVG, as paths

```
npm run svg -- logo.svg --width 400 --id logo --out logo-parts.json
```

The output is film data: a list of parts with `shape: { kind: 'path', d }`,
ready to paste into a scene's `scenery` or a character's `parts`. There is no
new shape kind and no new renderer, because
[`backends/canvas2d/shapes.js`](../src/backends/canvas2d/shapes.js) has fed a
part's `d` straight to `Path2D` since the beginning — **SVG path syntax was
already this engine's native path format.** What was missing was the parser.

Measured, through the real compiler and the real backend: the same mark
rendered as imported paths has an edge transition of **2.00 px**; delivered
as a raster at an eighth the size and scaled up, it is **16.67 px** — 8.3×
softer. `npm run test:svg`.

| Handled | Reported, with what to do instead |
|---|---|
| `path`, `rect` (with `rx`/`ry`), `circle`, `ellipse`, `line`, `polyline`, `polygon` | `text` — a `text` part with a font, not geometry |
| `g`/`a`/`switch` nesting, `transform` on any element | `use` — flatten the symbol in the editor |
| `viewBox` with uniform scaling and centring | `image` — a raster inside an SVG is still a raster |
| `fill`, `stroke`, `stroke-width`, `stroke-linecap`/`linejoin`, `opacity`, inherited | `<style>` — CSS classes are not applied; export with presentation attributes |
| `style="…"` overriding presentation attributes | `url(#…)` fills — the film has its own `gradient`, which is keyable |
| `defs`, `clipPath` and `mask` subtrees, correctly **not** drawn | — |

Everything reduces to absolute `M`/`L`/`C`/`Z`: arcs become cubics, `H`/`V`
become `L`, `S`/`T` get their reflected controls written out. **Curves are
never flattened to polylines** — a flattened curve bakes a resolution
decision in at import time, and `Path2D` can draw the real thing.

### Sprite sheets and atlases

`frames`, `grid`, `pivot` and `fit` have been listed as known asset keys
since the asset pipeline landed and **nothing read them** — the same shape as
`displacementMap` in Phase 61 and `ssao` in Phase 51.

```json
"assets": {
  "walk": { "kind": "image", "src": "walk.png",
            "grid": [8, 2], "count": 13, "pivot": [0.5, 1],
            "margin": 2, "spacing": 2 }
}
```

A sheet becomes a **swap set on the channel `frame`**, which means no new
verb: the engine already had three ways to say "hold this drawing, then that
one", and all three now drive a sprite sheet unchanged.

```json
{ "target": "hero", "do": "set", "channel": "props.frame", "value": "3" },
{ "target": "hero", "do": "expose", "sheet": "4 4 2 1 1 2" }
```

| key | what it is |
|---|---|
| `grid` | `[cols, rows]`. The **cell size is derived** from the image, never declared, for the same reason a film's duration is |
| `frames` | `[[x, y, w, h], …]` — an atlas, where the packer chose the layout. Beats `grid` when both are present |
| `margin`, `spacing` | the border around the sheet and the gutter between cells, in pixels |
| `count` | stop early: a 4 × 4 grid holding 13 drawings has three blank cells, and cycling through them is a stutter nobody authored |
| `pivot` | where inside a cell the origin sits, in cell fractions. `[0.5, 1]` is "centred, standing on its feet" — what a walk cycle wants and what centring gets wrong by half a body height |

A sheet declared on the **part** beats the asset's own, so one atlas can serve
six characters with one of them taking a different slice.
