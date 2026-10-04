# Loading, installing, offline

## Running the studio

ES modules need a real origin, so `file://` will not work.

```bash
python3 -m http.server 8080
open http://localhost:8080/film.html     # author, voice, render, export
open http://localhost:8080/studio.html   # pose characters by dragging them
```

The two pages hand a film back and forth through `sessionStorage`, so you can
stage a shot in the editor and ship it from the harness without saving a file
in between.

## Installing

`film.html` and `studio.html` link a manifest and register a service worker,
so Chrome and Edge offer **Install app** (the page also shows its own button
once the browser fires `beforeinstallprompt`). Installed, it opens standalone
with no browser chrome.

Installability needs a secure context: `https://` or `http://localhost`.

### Two layout rules the platform imposes

Both of these were wrong until a test asserted them, and neither reports an
error when it is — see [DEFECTS.md](DEFECTS.md#defects-in-the-new-code).

- **`sw.js` must live at the repository root.** A service worker's default
  scope is its own directory, and a static host sends no
  `Service-Worker-Allowed` header to widen it. A worker under `src/pwa/`
  registers successfully and then controls nothing.
- **Every URL in the manifest resolves against the manifest**, not against the
  page that links it. `manifest.webmanifest` lives in `src/pwa/`, so its icons
  are `icons/icon-192.png` and its `scope` and `start_url` reach back up with
  `../../`.

`npm run test:studio` checks both: it resolves every icon and `start_url`
against the manifest's own URL and asserts each returns 200, and that the
manifest scope and the service-worker scope both cover the page.

### Offline behaviour

Two caches, because the two kinds of resource fail differently:

- **app shell** — `sw.js` at the root, cache-first and versioned (`jirex-shell-v1`), so a release
  swaps atomically and a cold start never waits on the network. Same-origin
  modules fetched lazily are added as they are used, since ES module graphs
  cannot all be named up front.
- **pinned vendor modules** — stale-while-revalidate in a separate cache that
  survives shell upgrades, because re-downloading a TTS runtime is expensive.
  They are cached on **first use**, not warmed on install.

Warming them on install was tried and removed. It blocked the service worker's
installation on a multi-megabyte `onnxruntime-web` download, holding the
network busy on every first load — and it never delivered what it promised,
because speaking offline also needs a voice model, and those are in OPFS and
were never warmed either.

**Voice models are deliberately not in either cache.** They are 20–60 MB each
and the TTS runtime stores them in OPFS itself, which is the right home for
that much data. A voice works offline once it has been fetched or prefetched,
and prefetching a voice is also what pulls the runtime into the vendor cache:

```js
await studio.tts.prefetch('en_GB-alba-medium');
```

`install` adds shell assets individually rather than with `addAll`, because
`addAll` fails the whole installation if a single asset 404s — which would
leave the app permanently uninstallable.

## Using the engine as a library

`npm run build` emits `dist/`, which is committed so a CDN can serve it
straight from the GitHub tag -- no npm publish needed.

| File | For |
|---|---|
| `dist/jirex.esm.js` / `.esm.min.js` | `import` in a browser or bundler |
| `dist/jirex.min.js` | a plain `<script>` tag; exposes `window.jireX` |
| `dist/jirex.cjs` | `require()` in Node or a CJS bundler |
| `dist/jirex-core.esm.js` / `.min.js` | the core alone: scene graph, timeline, film compiler. No backend, no encoder, no voice system. 39 KB minified. |

```html
<!-- script tag -->
<script src="https://cdn.jsdelivr.net/gh/minjaezekiel/animate_engine@main/dist/jirex.min.js"></script>
<script>
  const studio = new jireX.FilmStudio();
</script>
```

```html
<!-- ES module -->
<script type="module">
  import { FilmStudio, compileFilm } from
    'https://cdn.jsdelivr.net/gh/minjaezekiel/animate_engine@main/dist/jirex.esm.js';
</script>
```

Pin a tag rather than `@main` for anything you care about.

Note the TTS runtime is marked external and still loads from its own pinned
URL at runtime, so the bundle stays dependency-free and the import map is
still required for voices.

The unbundled modules also work directly, which is what `film.html` uses:

```html
<script type="importmap">
{ "imports": { "onnxruntime-web": "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/+esm" } }
</script>
<script type="module">
    import { FilmStudio } from './src/studio.js';

    const studio = new FilmStudio({ onLog: console.log });
    const film = await (await fetch('./my-film.json')).json();
    const { blob } = await studio.produce(film, { canvas: document.querySelector('canvas') });
</script>
```

Or just the pieces, with no audio or voice involved:

```js
import { compileFilm } from './src/core/script/compile.js';
import { Canvas2DBackend } from './src/backends/canvas2d/Canvas2DBackend.js';
import { renderOffline } from './src/render/OfflineRenderer.js';
```

**The 2D path has no dependencies at all** — no Three.js, no muxer, no TTS.
Those are only needed for 3D, for MP4, and for synthesized speech
respectively. That is a direct consequence of the core split, and it is worth
protecting.

### What Phase 1 adds

Phase 1 introduces `scripts/build.mjs` (esbuild) emitting
`dist/animate-engine.{esm.js,umd.js,umd.min.js}` and fixes `package.json` to
point `main`/`module`/`exports`/`unpkg`/`jsdelivr` at `dist/`, so a CDN import
becomes one line. Until then, `package.json` still points at the legacy
single-file build — see [DEFECTS.md](DEFECTS.md), "CDN users get a stale
build".

## The import map is required for TTS

The TTS runtime dynamically imports `onnxruntime-web` by bare specifier. A
browser cannot resolve that on its own, so any page using voices must supply
the import map shown above. Without it the provider reports itself unavailable
and films render silent with subtitles — intentional degradation, but
surprising if you were expecting speech.
