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

## 2. 2D vector and sprite-sheet import

[`UrlProvider`](../../src/core/art/providers/UrlProvider.js) and
[`FileProvider`](../../src/core/art/providers/FileProvider.js) both end in
`createImageBitmap`, so **a 2D import is a raster import**. There is no
SVG-to-path import, no sprite-sheet or atlas import, and no Lottie.

SVG is the obvious one and the cheapest: the 2D side already draws
`rect`/`text`/`line`/`dot` primitives and could consume paths directly, rather
than scaling someone's PNG and losing the edges. Fifty of the fifty-one films
live on this path, so it is worth more than its size suggests.

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
- An SVG imports as paths and renders in a 2D film without being rasterised.
- A retarget against a non-Mixamo skeleton reports the bones it could not
  match, by name.
- Unit tests for every pure part; fixtures built rather than downloaded.
