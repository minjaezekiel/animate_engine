# Asset import: a library, online sources, and MCP

**Status:** pending. Asked for directly: *"there should be a way to import
already made 2D or 3D assets which are available in local storage or download
from online sources... if i or an AI agent can do that from MCP that would be
great. Overall outcome is... it becomes easier to create high quality
animations"* — with the job that remains being *"adding physics, rigging,
lipsync and or a few more other features."*

That last clause is the actual specification. The point is not a download
button. The point is that **an imported asset should arrive ready to be
animated**, and today it arrives as geometry and nothing else.

## What already works — do not rebuild it

The premise "there is a way to export but there is no way to import" is half
right, and the half that is wrong matters, because it is the expensive half.

| Kind | How | Where |
|---|---|---|
| 3D models: glTF, GLB, FBX | `film.models[id] = { src }` | [`film3d.html:91`](../../film3d.html#L91) `loadModels` |
| Baked animation on those models | clips converted to core clips, named nodes listed | same, via `coreClip` |
| HDR / image panoramas for IBL | `film.environment = { src, background, blur }` | [`film3d.html:120`](../../film3d.html#L120) |
| 2D images by URL or path | `asset.src` | [`UrlProvider.js`](../../src/core/art/providers/UrlProvider.js) |
| 2D images a person picked | `asset.file`, a File/Blob carried on the asset | [`FileProvider.js`](../../src/core/art/providers/FileProvider.js) |
| Textures by id | `film.textures` | `buildTextures`, into `buildScene3D` |
| Humanoid skeleton retarget | partial, Mixamo-aware | [`humanoid3d.js`](../../src/core/art/humanoid3d.js) |
| glTF inspection without loading | `inspectGLTF`, `glbJSON`, `isGLTF` | [`gltf.js`](../../src/core/io/gltf.js) |

So a film can already say `models: { rifle: { src: 'assets/ak47.glb' } }` and
get a rigged, animated model into a shot. The AK-47 and Earth films do exactly
that.

What is missing is everything **around** that one line: finding the file,
knowing what is in it before loading it, making it fit the scene, recording
what licence it came under, and doing any of it from an agent.

## The six real gaps

### 1. No library, so every import is a bare path

`{ src: 'assets/ak47.glb' }` is a string resolved against the page. There is
no manifest, no listing, no "what do I already have", no dedupe, and nothing
that survives moving a film between machines. Fifty-one films share no asset
vocabulary.

*Wanted:* `assets/manifest.json` — content-addressed, the same bargain
`takeCache.js` already makes for voice takes, and for the same reason: an
asset is identified by its bytes, so a film references `sha256:…` and the
manifest maps that to a path, a source URL, a licence and a thumbnail. Two
films importing the same chair import it once.

### 2. No inspection before commitment

`inspectGLTF` exists and nothing calls it from a tool. An agent choosing
between four candidate models cannot ask what is in them — how many meshes,
how many triangles, what the bounds are, whether it is rigged, which clips it
has, whether it has morph targets — without loading each one into a browser.

This is the [`digest`](../completed_phases/37-DIGEST-2D.md) argument again, and
the numbers there were 32× in favour of answering in numbers rather than
pixels. An asset digest is the same trade.

### 3. No normalisation, so an import is the wrong size and facing the wrong way

**This is the gap that costs the most minutes.** A model from a public library
arrives in whatever units and whatever up-axis its author used: centimetres
and Z-up from a CAD source, metres and Y-up from a game source, inches from a
hobby source, and 100× off either way is routine. The engine takes it
literally. The author then hand-tunes `scale` and `rotation` against a render
loop, which is precisely the loop everything else in this repo exists to
avoid.

*Wanted:* measure the bounding box, infer the up-axis from it and from the
node names, and emit a **recommended** `scale`, `rotation` and ground offset —
recommended, not applied, because guessing silently is worse than guessing
visibly. `standOnGround` in `compile.js` already establishes the pattern of
putting a thing on the floor rather than at the origin.

### 4. Nothing to add after import — the user's actual ask

> *"i should... just only have the job of either adding physics, rigging,
> lipsync and or a few more other features"*

For an imported mesh, each of those is currently impossible or manual:

- **Physics.** No collider generation of any kind. `grep -i 'collider\|hull\|convex'`
  across `src/` returns nothing. A mesh cannot become a rigid body without an
  author writing a primitive by hand. Wanted: AABB, sphere, and a convex hull
  from the vertex set, with the hull cached in the manifest because computing
  it is not free.
- **Rigging.** `humanoid3d.js` knows Mixamo bone names, so a Mixamo-sourced
  model retargets. Anything else does not, and there is no report of *why* a
  retarget failed — which bones were expected and which were found.
- **Lipsync.** `grep -i morphTarget` across `src/` returns **nothing**. The
  lipsync pipeline is excellent and drives 2D mouth shapes; an imported 3D
  head with ARKit or Oculus visemes as morph targets cannot be driven by it at
  all. This is the largest single capability gap in the list: the viseme track
  already exists, computed, per line, and there is no consumer for it in 3D.

### 5. No online sources, and licence is the hard part

Nothing fetches from a catalogue. The honest difficulty here is not HTTP — it
is that **an animation built on an asset whose licence was never recorded is
not shippable**, and that is a worse failure than not having the asset,
because it is discovered late.

So the licence field is not metadata, it is the feature. Any source that is
added must give a licence string and an attribution line per asset, the
manifest must carry both, and there must be a command that prints the credits
for a film. Sources worth having, each CC0 or clearly licensed and each with a
real API: Poly Haven (HDRIs and models, CC0), Kenney (game assets, CC0),
Quaternius (CC0), Sketchfab (mixed — downloadable-with-licence filter),
Freesound (CC, for the audio side), and plain direct URL for anything else.

Fetching is also the one part of this that reaches the network, so it belongs
**outside** a render, in a bake step, exactly as voice synthesis now does. See
[`takeCache.js`](../../src/core/voice/takeCache.js) for why: a render that can
make a network request is a render that is not reproducible.

### 6. No MCP surface

The server has 18 tools, all render, check, digest and voice. None touches
assets, so an agent can author a film that references an asset and cannot
discover, inspect, fetch or verify one.

*Wanted:* `list_assets`, `inspect_asset`, `import_asset` (local path or URL →
manifest entry, with the normalisation recommendation in the result),
`search_assets` (across configured sources), and `asset_credits`.

### Also missing, and smaller: 2D vector and sprite import

`UrlProvider` and `FileProvider` both end in `createImageBitmap`, so a 2D
import is a **raster** import. There is no SVG-to-path import, no sprite-sheet
or atlas import, and no Lottie. For an engine whose 2D side draws
`rect`/`text`/`line`/`dot` primitives and could consume paths directly, SVG is
the obvious one and the cheapest.

## Order of work, by value per unit of risk

1. The manifest and `assets/`, content-addressed. Everything else hangs off it.
2. `inspect_asset` over the existing `inspectGLTF`, plus bounds. Cheap, pure,
   and it is what makes an agent able to choose.
3. Normalisation recommendations. Pure arithmetic over the bounds; saves the
   most time.
4. Collider generation. Pure, testable in Node, unblocks "add physics".
5. Morph-target visemes. Connects a pipeline that already exists to a consumer
   that does not. Highest ceiling of anything here.
6. The MCP tools over 1–5.
7. Online sources, licence-first, in a bake step.
8. SVG import for the 2D side.

## How it stays safe

The additive pattern the whole tree already uses: a provider class per source
behind one interface, as in [`src/core/art/providers/`](../../src/core/art/providers/);
pure measurement and hull code in `src/core/io/` with Node tests; and nothing
that touches the network inside a render.

## Acceptance

- A film imports a model by manifest id and renders.
- `inspect_asset` reports meshes, triangles, bounds, rig, clips and morph
  targets without a browser, in under a second.
- A 100×-wrong import is *reported* as 100× wrong, with a recommended scale.
- A convex hull from an imported mesh drops under gravity and lands on the
  floor, asserted numerically.
- An imported head with visemes lipsyncs off the existing track.
- `asset_credits` prints a complete attribution list for a film, and fails if
  any asset lacks a licence.
- Unit tests for every pure part; a film that could not be made before.
