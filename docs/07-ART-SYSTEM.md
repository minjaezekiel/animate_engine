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

## Phase 9 — swap sets

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

## Phase 10 — the procedural art provider

The big one, and the one whose quality is bounded by art direction rather than
by code.

### What `generate.js` lacks for a drawn look

Measured against the reference, five things:

1. **Limbs are stroked lines.** `arm{L,R}`, `thigh{L,R}` and friends are
   2-point paths with `strokeWidth`. A stroke has no silhouette, no taper and
   no outline — this alone is why the output reads as clip-art.
2. **The face is two ellipses.** No brows, nose, ears or cheek line. Brows
   carry most of the expression in cel animation.
3. **One view.** A side-on paper doll cannot turn its head. You do not rotate a
   2D face; you swap to a drawn three-quarter view.
4. **One tone.** Cel shading is a second, hard-edged tone drawn as its own
   shape — not a gradient and not a filter.
5. **No line art.** Canvas2D cannot stroke with variable width, so the outline
   has to be built as a filled shape.

### Design

**Proportions in head-heights**, the unit animators actually use, rather than
fractions of total height. A 6-head adult and a 4-head child then differ by one
number and stay internally consistent.

**Views** — `front`, `threeQuarter`, `profile`, each mirrorable. Each view
supplies its own geometry for every part; a discrete `props.view` channel swaps
between them through Phase 9.

**Three layers per part** — `base` (flat fill), `shade` (shadow shape), `line`
(outline as fill). Emitted as a group with three children.

**An enumerated face kit** — this is the AI-affordance, so it has to be a
closed vocabulary:

```
jaw:   round | square | tapered | heavy
eyes:  round | hooded | narrow | wide | closed-happy
brow:  flat | arched | heavy | thin | angled
nose:  button | straight | broad | hooked
lips:  full | thin | wide
ears:  small | round | pointed
hair:  afro-large | afro-short | braids | short-fade | locs | wrap | bald
```

**Expressions** as named overrides of brow/eye/mouth: `neutral`, `angry`,
`surprised`, `smug`, `weary`, `delighted`.

**Palette derivation.** An author picks one skin colour and one cloth colour;
the provider derives the shade and line tones by a fixed HSL delta. Three
colours per material authored by hand is three chances to make a character
look wrong.

So a character becomes:

```json
"huey": {
  "art": "procedural",
  "build": { "heads": 5.5, "weight": "slim" },
  "face": { "jaw": "round", "eyes": "hooded", "brow": "heavy", "nose": "small" },
  "hair": "afro-large",
  "palette": "dusk"
}
```

~50 tokens, deterministic, riggable, and consistent across every shot.

### Two deliberate omissions

**Clipping.** Hair over a forehead and a shadow inside a silhouette both
suggest clip paths, and the backend cannot do it — the draw loop is flat with
no `save`/`restore` stack (`Canvas2DBackend.js:184-205`). **Do not add it.**
Real cel animation draws the shadow to fit; the shape is authored inside the
silhouette rather than clipped to it. Revisit only if a specific effect needs
it.

**Gradients beyond `rect`.** `resolveFill` is only called from the `rect` case
(`shapes.js:59`); `ellipse` and `path` read `p.fill` directly. Extending it is
a two-line change at `shapes.js:70` and `:81` and is worth doing for skies —
but cel shading should stay hard-edged shapes, not gradients.

---

## Phase 11 — scenery templates

Scenery is **40% of the mountain film's bytes** (2,427 of 6,118) and all of it
is hand-placed coordinates. The same treatment as characters applies:

```json
"background": {
  "template": "living-room",
  "time": "afternoon",
  "props": ["window-left", "framed-picture", "cabinet-right"]
}
```

A template is a pure function returning scenery entries **and a ground
definition**, exactly as `generateCharacterParts` returns parts. Templates to
start with: `living-room`, `kitchen`, `street`, `hillside`, `interior-wide`.

This is what makes a dialogue-scene background cost ~20 tokens instead of
2,400 bytes.

---

## Phase 12 — the vocabulary document

`docs/08-ART-VOCABULARY.md`: every enum, every template, every prop name, with
one worked example per kind.

This is the direct fix for the largest measured cost. Reading it once is ~3k
tokens; after that a character costs ~50 and a background ~20. Without it, an
agent re-derives the same facts from source every session — which is what
actually happened.

Ship a reference film alongside it: one two-hander dialogue scene in the
reference's idiom — two characters, three reused camera setups, shot/reverse-
shot, ~55 s — so the idiom is demonstrated and not merely described.

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
| 10 | Node: the same character spec yields byte-identical parts twice. Browser: one contact sheet, reviewed once — the only place looking is still worth it. |
| 11 | Node: a template returns scenery plus a ground, and the ground agrees with the scenery it drew. |
| 12 | The reference film renders, and its authoring cost is measured and recorded here. |

Follow the existing idiom: `test/core/compile.test.mjs:157` is the pattern for
"unknown fields and bad references are diagnostics, never throws".

---

## Sequencing

8 → 9 → 10 → 11 → 12. Phase 8 is the only one that unblocks everything else;
10 is the only one that is genuinely multi-day. 12 is cheap and should not be
deferred — it is the phase that converts the rest into a low-cost authoring
surface.
