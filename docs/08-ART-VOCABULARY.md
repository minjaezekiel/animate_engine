# The art vocabulary

Every name the procedural art provider accepts, in one place.

**Why this file exists.** Producing `demo/mountain.json` cost ~57,000 tokens
and only 3% of that was the film script. The rest went on re-reading engine
source to recall how things compose, and on rendering contact sheets to find
out whether the staging was wrong. This document is the direct fix for the
first. Read it once (~3k tokens) and a character costs ~50 tokens and a
background ~20.

Companion documents: [07-ART-SYSTEM.md](07-ART-SYSTEM.md) is the design and
the reasoning; [09-PRINCIPLES.md](09-PRINCIPLES.md) maps the twelve principles
of animation to the feature that carries each.

---

## The rule behind every table here

An author — especially an AI — is good at naming, choosing, timing and
staging, and bad at inventing coordinate geometry with no cheap way to check
the result. So **every art decision is a name from a closed set, and every
mistake is reportable.** A name outside a set produces a `warning` diagnostic
that lists the valid set, and the render continues with the default. Nothing
here ever throws.

Run `checkFilm` (or the `validate_film` MCP tool) to see them. Diagnostics are
`warning` severity with the location folded into the message, because
`loadFilm` drops `path` and filters `info`.

---

## Characters

A character is a name, a build, a face and a hair style.

```json
"huey": {
  "palette": "dusk",
  "proportions": { "height": 210 },
  "generate": {
    "build": "slim",
    "face": { "jaw": "round", "eyes": "hooded", "brow": "heavy", "nose": "small" },
    "hair": "afro-large",
    "cloth": "coat", "trouser": "trouser",
    "facing": 1
  }
}
```

That is the whole character. It yields a 25-part rig with three views, two
tones and line work, and it is deterministic — the same spec renders the same
character in every shot of every film.

### The face kit

| slot | values |
|---|---|
| `jaw` | `round` · `square` · `tapered` · `heavy` |
| `eyes` | `round` · `hooded` · `narrow` · `wide` · `closed-happy` |
| `brow` | `flat` · `arched` · `heavy` · `thin` · `angled` |
| `nose` | `button` · `straight` · `broad` · `hooked` · `small` |
| `lips` | `full` · `thin` · `wide` · `medium` |
| `ears` | `small` · `round` · `pointed` · `none` |

`hair` sits beside `face`, not inside it: `afro-large` · `afro-short` ·
`braids` · `short-fade` · `locs` · `wrap` · `bald`.

The jaw carries the most identity. Two characters with different jaws read as
different people even at the back of a wide shot; two with the same jaw and
different eyes do not.

### Builds and proportions

| key | values |
|---|---|
| `build` | `slim` · `average` · `heavy` · `athletic` · `child` |

`proportions` overrides anything a build sets. The unit is **head-heights**,
which is what animators actually use:

```json
"proportions": { "height": 210, "heads": 6.2 }
```

`height` is head to foot in scene units and is what you tune to stage a
character in frame. `heads` is the stylisation: 6.2 is the default adult,
`child` uses 4.8, and a lower number means a bigger head. Changing `heads`
keeps the figure internally consistent, which separate fractions of total
height do not.

`headRatio` still works and still wins when given, so films authored before
head-heights keep their proportions exactly.

### Other `generate` keys

| key | meaning |
|---|---|
| `cloth` `trouser` `skin` `hairColor` `eye` `white` `shoe` | palette key for that material |
| `facing` | `1` faces right (default), `-1` faces left |

**`hair` names a style; `hairColor` names a colour.** They used to be one key,
which produced `fill: "afro-largeShade"` — not a colour, so the canvas kept
whatever fill the previous node left and the hair rendered in skin tone with
no error anywhere. A film still saying `"hair": "hair"` now gets a warning
naming the fix.

---

## Palettes

Declare **one** colour per material. The shade and the line are derived.

```json
"palettes": {
  "dusk": { "skin": "#9c6239", "coat": "#b8452f", "hair": "#1b1310" }
}
```

That gives you `skin`, `skinShade` and `skinLine` to paint with. Declaring
`skinShade` yourself overrides the derived one — the escape hatch for the one
material where the rule is wrong.

Derivation is a per-channel RGB multiply, not an HSL lightness change: holding
HSL saturation while dropping lightness grows chroma, so pale skin shaded
toward **yellow** (`#e8b98f` → `#e0ae6a`, measured). The multiply keeps hue
exactly and keeps blue's multiplier highest, which is what makes the shadow
read cool.

**Known keys**, all with sensible defaults so a film renders with no palette
at all:

`skin` · `cloth` · `trouser` · `hair` · `eye` · `white` · `shoe` · `coat` ·
`teeth` · `mouth` · `sky` · `skyLow` · `far` · `wall` · `floor` · `wood` ·
`stone` · `asphalt` · `tile` · `metal` · `light` · `accent` · `foliage` ·
`bark` · `clay`

A character with no `palette` of its own uses its **scene's**.

---

## Scenery templates

A set is a name, a time of day and a list of props.

```json
"template": {
  "template": "living-room",
  "time": "evening",
  "props": ["window@0.18", "sofa@0.55", "plant@0.88"]
}
```

| key | values |
|---|---|
| `template` | `living-room` · `kitchen` · `street` · `hillside` · `interior-wide` |
| `time` | `morning` · `afternoon` · `evening` · `night` |
| `props` | `framed-picture` · `window` · `cabinet` · `sofa` · `lamp` · `plant` · `door` · `tree` · `rock` |

A prop is `"name"` or `"name@x"`, where `x` is a **fraction of the frame
width**, 0 to 1 — never a pixel, so the same line works at any resolution and
you never compute one. Omit it and props space themselves evenly.

`time` is a palette overlay, not a filter: it recolours the set and changes no
geometry, which is why a night version costs one word.

**A template returns its ground.** That is the point of templates, more than
the saved bytes:

```json
{ "target": "huey", "do": "move", "to": [900], "for": 2.0 }
```

One coordinate. The `y` comes from the floor the set was drawn from, so the
art, the walk and the staging check cannot disagree. Hand-deriving that slope
is how `demo/mountain.json` ended up with a boy standing 109 px below the
ground.

Anything the scene declares itself wins, and authored `scenery` appends to the
template's. A template is a starting point, never a cage.

---

## Turning a head, and changing an expression

Both are **swaps**, not rotations. You do not rotate a 2D face; a rotated
ellipse reads as a tilted egg.

```json
"cast": [{ "character": "huey", "as": "huey", "at": [420, 0],
           "view": "threeQuarter", "expression": "smug" }]
```

| channel | values |
|---|---|
| `view` | `front` · `threeQuarter` · `profile` |
| `expression` | `neutral` · `angry` · `surprised` · `smug` · `weary` · `delighted` |

Mid-shot, write the channel on the cast root and every one of the dozen head
parts follows, because a swap channel is inherited from the nearest ancestor
that declares one:

```json
{ "target": "huey", "do": "set", "channel": "props.view",  "value": "profile", "at": 1.2 }
{ "target": "huey", "do": "set", "channel": "props.expression", "value": "angry", "at": 1.4 }
```

`facing` mirrors the whole character; `view` turns the head within it. A
character facing left in profile looks left.

### Why the shot/reverse-shot idiom is cheap here

The reference clip this engine was measured against is 54.6 s with 10 cuts —
about 5.5 s a shot — reusing roughly three camera setups, and its median
frame-to-frame luma change is **0.85 out of 255**. That is limited animation:
held drawings, moving mouths, an occasional head turn. The engine's model —
hold a pose, swap a shape, cut — is already the right shape for it, and a
two-hander dialogue scene is mostly `view` swaps and shot durations.

---

## Actions

| verb | what it does |
|---|---|
| `play` | run a named action clip (`breathe` `walk` `blink` `idle` `squash`, or your own) |
| `pose` | key a named pose from the character's `poses` |
| `move` | move the cast root; `to: [x]` derives `y` from the ground |
| `reach` | IK: name a point, the solver names the rotations |
| `set` | write any channel, including `props.view` and `props.expression` |
| `show` / `hide` | fade the whole cast member |

Shared keys: `target` · `at` · `for` · `ease` · `h` · `anticipate` ·
`overshoot` · `arc`.

`at` is shot-relative and `for` is a duration — you never add up shot start
times. The last three are the animation principles; see
[09-PRINCIPLES.md](09-PRINCIPLES.md).

### Generated actions

Every generated character gets these for free, sized to its own proportions:

| action | loop | notes |
|---|---|---|
| `breathe` | repeat | volume-preserving: the chest widens as it shortens |
| `idle` | repeat | a slow weight shift with the forearms trailing |
| `walk` | repeat | forearms and hands trail the limb above them |
| `blink` | repeat | a discrete `eyes` swap, not a scale |
| `squash` | once | a landing; recovers faster than it compresses |

Stack them — `breathe` + `blink` + `walk` run together as separate clip
instances. That is secondary action, and it costs three lines.

---

## A complete scene, in about 40 lines

```json
{
  "version": "jirex.film/1",
  "meta": { "title": "The Argument", "fps": 24, "width": 1280, "height": 720 },
  "palettes": { "dusk": { "skin": "#9c6239", "coat": "#b8452f",
                          "accent": "#45607d", "hair": "#1b1310" } },
  "characters": {
    "huey":  { "generate": { "build": "slim", "hair": "afro-large", "cloth": "coat",
                             "face": { "jaw": "round", "eyes": "hooded", "brow": "heavy" } },
               "proportions": { "height": 210 } },
    "riley": { "generate": { "build": "child", "hair": "braids", "cloth": "accent",
                             "face": { "jaw": "tapered", "eyes": "wide", "brow": "arched" },
                             "facing": -1 },
               "proportions": { "height": 170 } }
  },
  "scenes": [{
    "id": "s1",
    "palette": "dusk",
    "template": { "template": "living-room", "time": "evening",
                  "props": ["sofa@0.5", "window@0.15", "plant@0.9"] },
    "cast": [
      { "character": "huey",  "as": "huey",  "at": [430, 0], "view": "threeQuarter" },
      { "character": "riley", "as": "riley", "at": [820, 0], "view": "threeQuarter" }
    ],
    "shots": [
      { "id": "a", "duration": 5.5,
        "camera": { "to": { "x": -90, "zoom": 1.25 } },
        "actions": [
          { "target": "huey",  "do": "play", "action": "breathe" },
          { "target": "huey",  "do": "play", "action": "blink" },
          { "target": "riley", "do": "play", "action": "idle" }
        ],
        "dialogue": [{ "speaker": "huey", "at": 0.5, "lipsync": true,
                       "text": "You did not have to say that." }] },
      { "id": "b", "duration": 4.5,
        "camera": { "from": { "x": 110, "zoom": 1.25 }, "to": { "x": 110, "zoom": 1.3 } },
        "actions": [
          { "target": "riley", "do": "set", "channel": "props.expression",
            "value": "smug", "at": 0.2 }
        ],
        "dialogue": [{ "speaker": "riley", "at": 0.4, "lipsync": true,
                       "text": "I said what I said." }] }
    ]
  }]
}
```

No coordinates except where the two characters stand and where the camera
sits. No geometry. Two shots, two cameras, two voiced lines, a set, a floor
and two rigged characters.

---

## What this cannot do

Stated plainly so it is not discovered the expensive way.

- **No clipping.** The 2D draw loop is flat with no `save`/`restore` stack.
  Shadows are drawn to fit inside a silhouette rather than clipped to it,
  which is what cel animation does anyway.
- **No variable-width line.** Canvas2D strokes at one width. Uniform cel line
  weight is what limited animation uses, so this costs less than it sounds.
- **An expression override is drawn front-on per view, not per view per
  slot.** An angry brow in profile is the angry brow's profile member, not a
  separately art-directed drawing.
- **A near arm raised above the shoulder draws over the head.** Arms are the
  neck's siblings under the torso and `z` only sorts siblings. Author around
  it or give that character its own `parts`.
- **Gradients only reach `rect` and the background.** `ellipse` and `path`
  read `fill` directly.
- **This is a production style, not a specific artist's hand.** For a look
  that has to be exact, draw the views and supply them as image assets with
  swap sets — that path is first-class, not a fallback.
