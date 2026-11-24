# Vendoring the Kokoro weights, so a checkout can start offline

**Status: not started**, and deliberately carved out of Phase 41
([../completed_phases/36-VOICE-RUNTIME.md](../completed_phases/36-VOICE-RUNTIME.md))
rather than left implied.

## What is already solved, and what is not

The take cache removed the real problem: a render no longer loads a model at
all, so Kokoro's ~86 MB is paid **once** instead of once per headless render.
Measured — baking nine lines cost 165 s including the download, and the render
that followed reported `9 cached, 0 synthesized`.

What is left is narrower and still real: **the first bake needs the network.**
An air-gapped checkout, or one behind a proxy that blocks the CDN, cannot
start. `vendor/piper-voices/` exists precisely because Phase 30 lost a
ten-part series to voice models re-downloading per render, 503s from the host,
and a renderer killed mid-download.

## Why it is harder than `npm run vendor-voice`

Piper is vendored by pointing `vits-web` at a local module URL. Kokoro's
weights are not fetched by `kokoro-js` directly — they are fetched by
Transformers.js underneath it, from
`https://huggingface.co/<model>/resolve/main/...`, and that is configured
through `env.allowRemoteModels` and `env.localModelPath`.

`kokoro-js` **does** export an `env`, and it is not that one:

```js
const Mf = { set wasmPaths(e) { …onnx.wasm.wasmPaths = e },
             get wasmPaths() { … } };
export { Ef as KokoroTTS, kf as TextSplitterStream, Mf as env };
```

A proxy over exactly one property. The Transformers.js `env` is bundled inside
`kokoro.web.js` (2.1 MB) and unreachable, so the obvious move — set
`localModelPath`, set `allowRemoteModels = false` — is not available.

## Three ways in, in order of preference

1. **Import map, against the node build.** `dist/kokoro.js` is 11 KB and
   imports `@huggingface/transformers` as an *external*, so an import map
   pointing at a vendored copy gives us the same module instance
   `KokoroTTS.from_pretrained` will use, and `env` becomes ours. The catch:
   that build also imports `path` and `fs/promises`, which need browser
   shims. Two small shims against a bundled 2.1 MB blob is probably the right
   trade, and `film3d.html` already uses an import map for `three` and
   `onnxruntime-web`.
2. **Serve the Hugging Face paths from our own origin**, by intercepting the
   request in the dev server. Every render here already runs one. It is a few
   lines and it works for the headless scripts, but it does nothing for a tab
   someone opened themselves, which is half the point.
3. **Ask kokoro-js upstream to widen its `env` proxy.** Cheapest of all if it
   lands, and not something to wait on.

Option 1, with option 2 as the fallback while it is proven.

## What else belongs in this phase

- **A check.** `check-film.mjs` stats every cast Piper `.onnx` before a render
  and errors if one is missing, because an advert once shipped with every line
  silent and reported success. The equivalent — cast on `kokoro:`, nothing
  baked, no vendored weights, no network — does not exist. The fallback ladder
  reports the substitution loudly, which is a safety net and not a check.
- **`npm run vendor-kokoro`**, beside `vendor-voice`, writing into
  `vendor/kokoro/` with the same gitignore treatment.

## Acceptance

1. `npm run vendor-kokoro`, then `FILM=… SPEC=kokoro:bm_george npm run say`
   completes **with the network disabled**.
2. `npm run check:earth` fails when a film is cast on a Kokoro voice that is
   neither baked nor vendored, naming the voice and what to run.
3. A tab opened by hand at `film.html` can tick "Kokoro 82M" and speak,
   offline.
