# Asset import: what is left

**Most of this shipped in Phase 45** —
[../completed_phases/40-ASSET-PIPELINE.md](../completed_phases/40-ASSET-PIPELINE.md).
Done: the content-addressed library with required licences and release
gating; inspection without a renderer (triangles stored and drawn, world
bounds, rig, clips, morph targets); scale and up-axis recommendations;
collider generation with a real concavity measure; lipsync on any imported
head across the ARKit, Oculus, Character Creator and generic naming
conventions; a CLI; and four MCP tools.

Three things remain.

## 1. Source catalogues

`npm run asset import <url> --licence <terms>` already downloads, hashes,
inspects and records an asset from anywhere on the web, so *"download from
online sources"* works today. What does not exist is **searching** — asking
"what rock models are there" and getting candidates back.

The hard half of this was never HTTP, it was the licence, and that is now
done: every asset carries its terms, `asset_credits` gates a release on them,
and noncommercial and share-alike constraints are surfaced. A catalogue
adapter therefore has somewhere safe to put what it finds.

Worth having, each CC0 or clearly licensed with a real API: **Poly Haven**
(HDRIs and models, CC0), **Kenney** (CC0), **Quaternius** (CC0), **Sketchfab**
(mixed — filter to downloadable-with-licence), **Freesound** (CC, for the
audio side).

Shape: one provider class per source behind one interface, exactly as
[`src/core/art/providers/`](../../src/core/art/providers/) already does for
images, and a `search_assets` MCP tool over them. Each provider must return a
licence string and an author per result, or it is not usable here.

**Keep it out of the render.** `import` is the only place the network is
allowed to happen, for the reason [`takeCache.js`](../../src/core/voice/takeCache.js)
argues at length: a render that can make a network request is not
reproducible.

## ~~2. 2D vector and sprite-sheet import~~ — done, Phase 63

Both halves shipped, and both were smaller than this section assumed, for the
same reason: the renderer was already there and only the arithmetic was
missing.

**SVG.** `backends/canvas2d/shapes.js` has fed a part's `d` straight to
`Path2D` since the beginning, so SVG path syntax was already this engine's
native path format. The work was a parser --
[`core/art/svgPath.js`](../../src/core/art/svgPath.js) for one `d` string and
[`core/art/svg.js`](../../src/core/art/svg.js) for a document -- reducing
everything to absolute `M`/`L`/`C`/`Z` and never flattening a curve.
`npm run svg -- logo.svg --width 400` emits film parts. *Measured:* the same
mark has a **2.00 px** edge as imported paths against **16.67 px** delivered
as a raster at an eighth the size and scaled up, through the real compiler
and the real backend (`npm run test:svg`).

**Sprite sheets.** `frames`, `grid`, `pivot` and `fit` were listed in
`schema.js` as known asset keys and **nothing read them**. A sheet is now a
swap set on the channel `frame`, so `set`, `expose` and a named cycle all
drive one with no new verb. `margin`, `spacing` and `count` were added
because a real packer's output needs all three.

It also fixed a defect it did not go looking for: `staging.js` measured a
path's bounds by reading `d` as a flat list of coordinate PAIRS, which is
right for absolute `M`/`L` and wrong for relative commands (`m0 0 l10 0 l10 0
l10 0` measured **10** wide and is 30), for arcs (`a20 20 0 0 1 40 0`
measured **20 x 40** and is 40 x 20) and for `H`/`V`. That box is what every
2D framing check measures against.

**Not done, and said rather than forgotten:** Lottie, which is a different
format with its own animation model; `<use>` resolution; and CSS class
application. Each is reported by name at import rather than dropped.

## 3. Retarget diagnostics

[`humanoid3d.js`](../../src/core/art/humanoid3d.js) knows Mixamo bone names,
so a Mixamo-sourced model retargets and anything else does not — **and a
failed retarget does not say which bones it expected and which it found.**

That report is the whole fix, and it is the same argument
`matchVisemeMorphs` settled for faces: "this skeleton has 64 bones and none of
them is named like a hip" is a useful sentence, and a character standing in a
T-pose with no explanation is not. The viseme work is the template to copy.

## Acceptance

- `search_assets` returns candidates with a licence and an author, from at
  least two sources, and `import_asset` takes one of those results directly.
- ~~An SVG imports as paths and renders in a 2D film without being rasterised.~~
  **Done, Phase 63:** 2.00 px edge against a raster's 16.67 px.
- A retarget against a non-Mixamo skeleton reports the bones it could not
  match, by name.
- Unit tests for every pure part; fixtures built rather than downloaded.
