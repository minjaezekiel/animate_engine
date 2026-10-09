# The art system — design

How this engine gets from flat vector shapes to cel-shaded limited animation,
and how an AI and a person author it at a cost either can afford.

Status lives in [STATUS.md](STATUS.md). This file is the design; it is written
to be executed from months later.

---

## Context

Two measurements prompted this, both taken rather than assumed.

**The reference.** A 54.6 s clip of *The Boondocks*, measured frame by frame:

| | |
|---|---|
| resolution | 640×288 |
| cuts | 10 — about **5.5 s per shot** |
| frame-to-frame luma change | median **0.85**, p90 **5.64** (0–255) |
| camera setups | ~3, reused — A-side close, B-side close, one wide |

That median is the whole point. **This is limited animation**: held drawings,
moving mouths, an occasional head turn, shot/reverse-shot between fixed
setups. It is not fluid full animation, and the engine's model — hold a pose,
swap a shape, cut — is already the right shape for it.

**The authoring cost.** The `demo/mountain.json` film is **6,118 bytes, about
1,650 tokens**. The turn that produced it cost ~57,000. So the film script was
**3%** of the spend. The other 97% was:

1. re-reading engine source to recall how things compose,
2. four contact-sheet images (~2.5k tokens each) to check staging,
3. three rounds of visual iteration fixing staging the compiler reported as clean.

This matters because it redirects the work. Making the file format terser
saves almost nothing. **Removing the need to re-read the engine, and removing
the need to look at an image to know the staging is wrong, is where the order
of magnitude lives.**

### The constraint that shapes every decision

An AI is good at naming, choosing from enumerated options, timing, staging and
structure. An AI is bad at inventing coordinate geometry and has no way to
check its own visual work without paying for an image.

So: **every art decision must be a named choice from a documented set, and
every mistake must be reportable as a number.** A tool built on coordinates
will stay expensive no matter how good it is.

---

## Architecture

### Art providers, mirroring the voice system

The voice system already solved "where does this media come from": a registry
with interchangeable providers (`src/core/voice/VoiceRegistry.js` plus
`providers/{Mic,Upload,TtsVits,TtsHttp}Provider.js`). Art has the identical
shape and should reuse it exactly.

```js
ArtProvider {
  id; label; available() -> bool
  listKinds() -> ['character' | 'prop' | 'background']
  build(spec) -> { parts } | { image } | { scenery }
}
ArtRegistry { register(p) all() byId(id) resolve(spec) }
```

| provider | source | notes |
|---|---|---|
| `ProceduralArtProvider` | constructed from named parameters | no assets needed; an AI authors a character in ~50 tokens |
| `UploadArtProvider` | drawn PNG/SVG supplied by a person | highest ceiling on look; maps views and mouth charts onto swap sets |
| `GeneratedArtProvider` | an external image model | later, optional; consistency across views is the known hard problem |

Both of the first two are first-class. A film mixes them: a drawn hero and
procedural extras in the same scene, the same way a film mixes a recorded
voice with a synthesized one today.

### Where the existing code already reaches

| capability | state | file |
|---|---|---|
| draws an `image` node | **yes** | `src/backends/canvas2d/shapes.js:91` |
| accepts `background.image` | **yes** | `src/core/script/compile.js:188` |
| swaps geometry by name per frame | **yes** | `src/core/scene/visemeShapes.js` |
| discrete tracks that drive a swap | **yes** | `src/core/audio/lipsync.js:23` |
| **loads an image** | **no — nothing, anywhere** | — |

The chain is built except one link. That is why assets are first.

---

## Phase 8 — assets and staging (the cheap half)

Two unrelated jobs, grouped because together they remove most of the 97%.

### 8a — images, end to end

**New:** `src/core/art/AssetRegistry.js`, `src/core/art/providers/{Url,File}Provider.js`.

```js
loadAssets(film, { providers, baseUrl }) -> { assets: {id: ImageBitmap}, diagnostics }
```

`ImageBitmap`, not `HTMLImageElement`: it is transferable, decodes off-thread,
and works in `OffscreenCanvas` and under the WebCodecs sink.

**One resolution point.** Today `assets` is read in exactly one place —
`compile.js:189` for the background — and scenery spreads `...shape` straight
into props, so `shape: {kind:'image', image:'bg1'}` puts the **string** `'bg1'`
on `props.image`, passes the truthiness check at `shapes.js:93`, and then
throws inside the real `ctx.drawImage`. That is a trap, not a gap.

Add one helper and route all three paths through it:

```js
resolveAssetProps(props, assets, diagnostics, path)   // id -> ImageBitmap, or a diagnostic
```

Used by `buildBackground`, `buildScenery`, and character parts.

**Backend:** extend `case 'image'` (`shapes.js:91`) to the 9-argument
`drawImage` with `sx, sy, sw, sh` so a sprite atlas is expressible, and add
`fit: 'stretch' | 'contain' | 'cover'` because `compile.js:199` currently
hardcodes `w`/`h` to the full frame and will stretch any non-16:9 background.
`RecordingContext.js:52` already forwards `...rest`, so Node tests need no
change.

**Schema:** add `KNOWN.asset = ['kind','src','frames','grid','pivot','fit']`
and `KNOWN.background`; wire up `SHAPE_KINDS` (`schema.js:48`), which is
defined and imported by nothing. Add a `validate.js` check that
`background.image` and any scenery/part asset id is declared, mirroring the
audio check at `validate.js:121`.

**Call sites that must pass assets:** `studio.js prepare()` should load them
when the caller supplies none; `scripts/produce.mjs:105` passes neither
`assets` nor `audioBuffers` today, so a film with a background image can never
render headless. `film.html:214` declares `const assets = {}` and never writes
to it, and has no `accept="image/*"` input.

**Service worker:** `sw.js:84-96` is cache-first for same-origin, so editing
`assets/bg.png` in place serves stale pixels until `VERSION` bumps. Either
content-hash asset URLs or carve out a network-first rule for the asset
directory.

### 8b — ground planes and the staging check

**Ground planes are the idea worth stealing from traditional layout.** A scene
declares its walkable surface once, and both the art and the validator read
the same definition:

```json
"ground": { "kind": "polyline", "points": [[0,602],[640,554],[1280,480]] }
```

That single declaration:

- lets `do:'move'` take `to: [700]` and derive y, instead of me computing a
  slope by hand (which I got wrong, by 109 px, in the mountain film),
- gives the staging check something to test feet against,
- can be reused by scenery so the grass and the character agree.

**New:** `src/core/script/staging.js`.

```js
measureCharacter(parts) -> { top, bottom, left, right }   // rest-pose AABB from the root
analyseStaging(compiled, film, { samplesPerShot = 5 }) -> diagnostics[]
```

`analyseStaging` runs **after** the scene and timeline exist — `validateFilm`
is pre-compile and film-only, so it cannot see world positions. Insert it
between `buildTransitions` and the return (`compile.js:168-171`), where
`scene`, `timeline`, `meta`, `sceneSpans` and `diagnostics` are all in scope.

Per shot, sample N times; at each sample `samplePose` + `applyPose`, then:

| check | catches |
|---|---|
| cast AABB vs camera frame | the mountain film's boy, off-frame for 4 s |
| feet vs the declared ground | the boy standing 109 px below the slope |
| any part outside the canvas | branches drawn 200 px above their trunk |
| camera continuity across a cut | an unintended jump |
| scene with no cast in frame | an empty shot |

Two details that decide whether this is useful:

- Camera track values are **centre-relative plus the centre**: `buildCamera`
  writes `centre.x + authored.x`, so a track value of 640 means authored 0 at
  width 1280. Get this backwards and every check is wrong.
- `loadFilm` (`animateEngine.js:530`) drops `path` and filters `'info'`.
  Staging diagnostics must therefore use **`warning`** and **fold the location
  into `message`**, or an agent will never see them.

**Surfacing.** `studio.html:189` logs only `fatal`; warnings are discarded. Add
a `checkFilm` op and a `validate_film` MCP tool — there is no validation-only
tool today, so an agent's only way to see diagnostics is to call `loadFilm`.

### Why 8b pays for itself immediately

Each contact sheet I rendered cost ~2,500 tokens and I rendered four. A
staging report costs ~200 tokens and catches more than I caught by eye.

---

## Phase 9 — swap sets — *shipped*

`applyVisemeShapes` (`src/core/scene/visemeShapes.js`) already does the hard
part: it reassigns `node.kind` at runtime, so one node can be a path on one
frame and an image on the next. Generalise it rather than write a second
mechanism.

```js
node.props.swapSets = { view: {...}, mouth: {...}, eyes: {...}, hand: {...} }
node.props.view = 'threeQuarter'     // a discrete track writes this
```

**Fix the footgun while generalising.** The current loop is a shallow additive
copy that never deletes:

```js
for (const [k, v] of Object.entries(shape)) if (k !== 'kind') node.props[k] = v;
```

Swap a `path` shape for an `ellipse` one and the stale `d` stays on the node.
It is harmless today only because `drawShape` dispatches per kind. With images
in the mix it stops being harmless. Record which props a set owns and clear
them before applying the next.

Also: the loop walks **every node in the scene every frame** with no index.
Build the index once per scene.

**Multi-shape parts.** Cel art is three shapes per part — flat base, a
hard-edged shadow, and line art — but `instantiateCharacter` is one part, one
shape, one node (`compile.js:315`: `kind: part.shape?.kind ?? 'group'`). Allow
`part.shapes: [...]` to emit a group node with children. This is the
prerequisite for anything that looks drawn rather than clip-art.

**Fallbacks.** `resolveViseme` is viseme-specific with a hand-written
preference table (`visemes.js:16`). Each swap set needs its own, declared
alongside it, so a character with only a front view degrades to front rather
than vanishing.

---

## Phase 10 — the procedural art provider — *shipped*

The big one, and the one whose quality is bounded by art direction rather than
by code. What follows is what was actually built and what the design got
wrong, kept together because the corrections are the useful part.

### The five gaps, and how each closed

1. **Limbs were stroked lines.** Now filled tapered paths with rounded ends
   (`limbPath`), each taking a `stroke` as well — which *is* the line work.
   The design said Canvas2D cannot do variable-width strokes so an outline had
   to be built as a filled shape. True for variable width; false for the
   uniform cel line weight limited animation actually uses. So the planned
   three layers per part became **two**: a filled base that strokes itself,
   plus an optional shade layer. Less code than designed, for the same result.

2. **The face was two ellipses.** Now `src/core/art/face.js`: an enumerated
   kit of jaws, eyes, brows, noses, lips, ears and hair, assembled into nine
   head parts.

3. **One view.** Now three — `front`, `threeQuarter`, `profile` — as swap sets
   on each feature, driven by one inherited `view` channel.

4. **One tone.** Now a flat base plus a hard-edged shade shape, with the shade
   drawn to fit inside the silhouette rather than clipped to it.

5. **No line art.** `stroke` on the filled shape, at a width scaled to the
   figure.

### What the design did not anticipate

**The head had to become a group.** `drawOrder` walks depth-first, so a child
always draws over its parent and `z` only sorts siblings. Anything behind the
skull — the hair mass, the far ear — must therefore be the skull's *sibling*
while still turning with the head. `head` is now a group with `skull`,
`hairBack`, `earFar`, `eyes`, `pupils`, `brows`, `nose`, `earNear` and `hair`
under it.

**Hair is two pieces.** The mass goes behind the skull; the front is only a
hairline cap. A first attempt drew an afro as one circle at the top of the
z-order and it covered the entire face — correct silhouette, no character.

**Two channels could not both own `d`.** A blink, an expression and a view all
want to rewrite the same eye geometry. Resolved with two mechanisms:

- an **empty member** writes no props, so `expression: 'neutral'` and
  `eyes: 'open'` leave the view's geometry standing;
- a **view-qualified member** (`angry@profile`, `closed@threeQuarter`) is
  preferred by `resolveSwap` when a view is in effect, so a second channel can
  override geometry *without* throwing away the turn.

Before this, a blink reverted a turned head to front-facing on every open
frame, and the mouth chart ignored the view entirely.

**Swap defaults could not live on the node.** `swapProps` stamped
`props[channel] = default` onto every part, which made each part its own
nearest declaration of the channel — so a `view` written once on the cast root
could never reach the dozen head parts that have to turn with it. Defaults now
sit in `props.swapDefaults`, and precedence runs **author > part default >
first member**.

**Palette derivation had to leave HSL.** Holding HSL saturation while dropping
lightness grows chroma, so `#e8b98f` shaded to `#e0ae6a` — pale skin turning
yellow. A per-channel RGB multiply preserves hue exactly, and keeping blue's
multiplier highest is what makes the shadow read cool.

**`hair` meant two things.** It was the palette key and became the style name,
which produced `fill: "afro-largeShade"` — not a colour, so the canvas kept
whatever fill the previous node left and the hair rendered in skin tone with
no error anywhere. Split into `hair` (style) and `hairColor` (palette key).

**`measureCharacter` only read `part.shape`.** Every head feature now draws
through a swap set, so the rig measured as a headless body and every staging
check that used it was wrong by a head.

**`buildClipFromAction` split the channel at the LAST dot**, which made its
own `props.` branch unreachable — a generated action could only ever key a
transform. Splitting at the first dot is what let a blink be a swap.

### What it costs to author

```json
"huey": {
  "generate": { "build": "slim", "hair": "afro-large",
                "face": { "jaw": "round", "eyes": "hooded", "brow": "heavy" } },
  "proportions": { "height": 210 }
}
```

~45 tokens, deterministic, riggable, three views, consistent across every
shot. The full vocabulary is [08-ART-VOCABULARY.md](08-ART-VOCABULARY.md).

### Two deliberate omissions, both still deliberate

**Clipping.** The draw loop is flat with no `save`/`restore` stack. Shadows are
authored inside the silhouette, which is what cel animation does anyway.

**Gradients beyond `rect`.** `ellipse` and `path` still read `fill` directly.
Gradients *did* gain palette resolution this phase — naming a palette colour
in a stop used to throw inside `addColorStop` and take the whole frame down.

---

## Phase 11 — scenery templates — *shipped*

`src/core/art/scenery.js`. Five templates — `living-room`, `kitchen`,
`street`, `hillside`, `interior-wide` — nine props, four times of day.

```json
"template": { "template": "living-room", "time": "evening",
              "props": ["window@0.18", "sofa@0.55", "plant@0.88"] }
```

Three decisions worth recording:

**The template returns its ground.** This matters more than the saved bytes. A
`move` with one coordinate derives its `y` from the floor the set was drawn
from, so the art, the walk and the staging check cannot disagree — which is
exactly how `demo/mountain.json` put a boy 109 px below a hand-computed slope.

**It lives at `scene.template`, not `background.template`** as the design
sketched. A template produces scenery *and* a ground, both scene-level;
`background` is specifically the backdrop fill.

**`time` is a palette overlay, not a filter.** It recolours and changes no
geometry, which the test asserts by comparing serialized scenery between
times. A night version costs one word.

Prop anchors are fractions of frame width (`"sofa@0.55"`), never pixels, so
the same line works at any resolution and an author never computes one.
Authored `scenery` appends to the template's and anything the scene declares
itself wins.

---

## Phase 12 — the vocabulary document — *shipped*

[08-ART-VOCABULARY.md](08-ART-VOCABULARY.md): every enum, every template,
every prop, a complete worked scene, and an explicit list of what the system
cannot do. Reading it once is ~3.5k tokens; after that a character costs ~45
and a background ~20.

Shipped alongside it: [`demo/two-hander.json`](../demo/two-hander.json), a
55-second dialogue scene in the reference idiom — two characters, three reused
camera setups, shot/reverse-shot, ten shots, ten voiced lines — written with
**no hand-authored geometry at all**.

### Measured

| | `mountain.json` | `two-hander.json` |
|---|---|---|
| duration | 23.2 s | 55.0 s |
| script | ~1,505 tokens | ~1,708 tokens |
| **per second** | **65 tok/s** | **31 tok/s** |
| hand-placed scenery | 2,154 bytes | 4 bytes |
| characters | 1 | 2 |

Twice the economy for twice the cast and a harder form. But the honest caveat
stands: the script was never the expensive part. It was 3% of the mountain
film's turn, and the other 97% was re-reading source and looking at renders.
This document fixes the first. The framing check below is what fixes the
second.

### What the reference film found: framing was unverifiable

The film compiled clean, staged clean, and framed **every one of its five
close-ups as a full-length two-shot**. The intent existed only in the shot ids
(`3-marcus`), and nothing compared it to the zoom. It took three contact
sheets to notice.

So framing became a declaration:

```json
{ "id": "3-marcus", "framing": "close", "on": "marcus", "camera": { ... } }
```

| framing | one head occupies |
|---|---|
| `wide` | 4–15% of frame height |
| `medium` | 13–30% |
| `close` | 26–75% |

Measured in head heights, not body heights, because a close-up crops the body.
A miss reports the measured percentage **and the zoom that would fix it** —
and a test asserts that following the suggestion actually clears the
diagnostic, because a suggestion that does not work is worse than none.

`on` also tells the checker that everyone else is meant to be out of frame.
Without that, the existing "cast off-frame" check fired once per cut on a
shot/reverse-shot scene — it had assumed every cast member belongs in frame at
all times, which is true of a one-character film and false of the dominant
idiom of dialogue animation.

**This is the general lesson of the phase.** A check can only verify intent
that was written down. Every unverifiable thing in this system is a thing the
author never got to declare.

---

## Can an AI actually use this?

Yes, with one honest caveat.

**What works.** Choosing from enumerated vocabularies, structuring shots,
timing dialogue, staging two characters in a room, picking camera setups,
writing the screenplay — all cheap and reliable. With Phases 8–12 in place, a
55-second dialogue scene is roughly **3–5k tokens of authoring** instead of
57k, because the job becomes directing rather than drawing.

**What does not.** Inventing coordinate geometry, and judging visual quality
without paying for an image. Both are designed around rather than fixed: enums
instead of coordinates, a staging report instead of a contact sheet.

**The caveat.** The ceiling is set by the shape library's art direction, and
that is human work. A procedural provider can produce a *consistent, appealing,
well-staged* cel style. It will not produce a specific artist's hand. That is
precisely why `UploadArtProvider` is first-class and not an afterthought — when
the look matters more than the authoring cost, a person draws the views and the
engine composites, rigs and times them.

What this will not do is reproduce *The Boondocks*. Those are someone else's
designs drawn by their artists. The target is that **production style** — cel
shading, limited animation, shot/reverse-shot dialogue — applied to your own
characters.

---

## Verification

Each phase lands with a check that fails if the thing regresses.

| phase | verification |
|---|---|
| 8a | Node: an atlas sub-rect reaches `drawImage` with 9 args via `RecordingContext`; a missing asset is a diagnostic, never a throw. Browser: `demo/` film with a real background PNG renders it, and `npm run produce` works headless. |
| 8b | Node: `analyseStaging` on a film with a cast member off-frame reports it; the mountain film's three original bugs each reproduce as a diagnostic. This is the regression test for the bugs that cost four contact sheets. |
| 9 | Node: a swap from a `path` shape to an `image` shape leaves no stale `d`; per-set fallbacks degrade rather than vanish. |
| 10 | Node: the same character spec yields byte-identical parts twice; every enumerated name produces geometry in every view; a blink leaves a turned head turned. Browser: contact sheets, reviewed — which took **seven passes**, and every fault they caught (hair over the face, the ear walking across the cheek, the nose as a floating blob, googly eyes) was invisible to every unit test. Looking is still the only way to find those. |
| 11 | Node: every template returns scenery plus a ground, the ground lands inside the frame, templates scale to the frame rather than assuming 720p, and a time of day changes zero geometry. |
| 12 | The reference film compiles to exactly 55 s, stages clean and frames clean, asserted in `test/core/staging.test.mjs`. A declared framing that misses its band reports the zoom that fixes it, and a test follows that suggestion and asserts it clears. Authoring cost measured above. |

Follow the existing idiom: `test/core/compile.test.mjs:157` is the pattern for
"unknown fields and bad references are diagnostics, never throws".

---

## Sequencing

8 → 9 → 10 → 11 → 12. Phase 8 is the only one that unblocks everything else;
10 is the only one that is genuinely multi-day. 12 is cheap and should not be
deferred — it is the phase that converts the rest into a low-cost authoring
surface.
