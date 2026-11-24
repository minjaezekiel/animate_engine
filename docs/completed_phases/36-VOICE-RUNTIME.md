# Kokoro and OpenVoice, actually renderable

**Phase 41. Done**, with one piece carved out into
[../pending/39-OFFLINE-VOICE-WEIGHTS.md](../pending/39-OFFLINE-VOICE-WEIGHTS.md).

## The position this started from

Kokoro 82M and OpenVoice V2 had been registered, selectable and unit-tested
since Phase 39, and **no film had ever been rendered through either**. Not
because the gateway was wrong — it is the right abstraction — but because of
where the models live:

- Kokoro fetches ~86 MB from a CDN, and a headless render launches a **fresh
  Chrome profile**, so the browser cache is empty every run. The download was
  paid per render rather than once.
- OpenVoice needs a server you start, and a film that cannot render without
  one is a film welded to a machine.

## Why "synthesize per frame" is the wrong seam

The obvious reading of *load the model once, then render* is to synthesize as
the frames go by. That cannot work here, and the reason is a property worth
protecting rather than a limitation:

> **The film retimes to the audio.** `retimeToAudio` grows each shot to fit
> its real take, so every line must exist in full before frame 0 is drawn —
> otherwise the timeline depends on the render and frame *N* stops being a
> pure function of *N*.

It would also be slower, not faster: a model loaded in the render process
competes with the renderer for the same GPU and the same memory, which is the
contention that already forced `scripts/lib/render-lock.mjs` into existence.

So the answer is stronger than the one asked for: **never synthesize during a
render at all.**

## What shipped

### A content-addressed take cache

`src/core/voice/takeCache.js`. The key is everything that can change the
samples — voice spec, text, delivery, language — so editing one line of
narration re-synthesizes one line, re-rendering at a different resolution
re-synthesizes nothing, and a second render touches no model and makes no
network request.

The browser is where synthesis happens; the disk is Node's. Rather than move
either, the page asks the dev server it is already being served from:

```
GET  /__take/<sha256>.wav   -> the bytes, or 404
PUT  /__take/<sha256>.wav   -> stores them
```

One cache for the whole engine: a line voiced while rendering a 2D film is
already baked when a 3D film says it.

Three details that are the difference between working and nearly working:

1. **A miss reads its own write back.** The cache stores 16-bit PCM and a
   model emits float. Using the float on a cold run and the decoded WAV on a
   warm one would make the two differ at about −90 dBFS — a difference nobody
   could ever attribute to anything. Measured: the audio of a cold render and
   a warm one is **byte-identical**.
2. **An entry is `{ audioBuffer, phonemes }`, not samples.** Piper returns
   exact phoneme timings and lipsync has three tiers. A cache storing only the
   WAV would make the *first* render of a film lipsync off phonemes and every
   later one off the envelope — a regression triggered by nothing but running
   twice.
3. **A cache that cannot write cannot break a render.** Every failure path
   returns the freshly synthesized take unchanged and says so.

### `scripts/say.mjs` — audition and bake

```bash
SAY="This is Kokoro." SPEC=kokoro:bm_george npm run say
FILM=films/earth3d.json SPEC=kokoro:bm_george npm run say
```

Hearing a voice used to cost a three-minute render, because Kokoro needs a
browser and the only page that had one rendered films. Baking a film out of
band is what makes both engines practical: **start the OpenVoice server, bake,
stop it, and render offline for the rest of the week.**

### `VOICE_CAST` — try an engine without editing the film

`VOICE_BACKEND` only reorders the fallback **ladder**, and that was the thing
missing: a film cast as `tts:en_US-hfc_male-medium` resolves to Piper whatever
is promoted ahead of it, so promoting Kokoro and expecting to hear it is the
one mistake this removes.

```bash
VOICE_CAST=kokoro:bm_george npm run render:earth
```

It rewrites `voices.<role>.spec` and leaves `lang`, `gain`, `rate` and `pitch`
exactly as authored, because those describe the **performance** and not the
model.

### The defect the gateway was written to remove, surviving in the file that predated it

`createRegistry` exists because provider registration order was written out by
hand at four call sites and they had drifted. **`src/studio.js` was still one
of the hand-written ones** — so the entire 2D path could not cast on Kokoro or
OpenVoice at all. The gateway listed them, `npm run voices` printed them, the
voice picker could not show them, and a 2D film cast on `kokoro:bm_george`
would have rendered in a Piper preset by way of the ladder.

Converted. `mic` and `upload` stay registered by the page, because they are
not engines — they are its two input devices, and nothing headless has either.

### The picker, and a defect in it

The voice dropdown assigned `{ spec }` outright, which **erased `lang`,
`gain`, `rate` and `pitch`**. Changing the voice of a Swahili character
dropped its language — and Phase 33's whole lesson is that a missing `lang`
silently measures pacing at the English word rate and reports gaps that are
not there.

Also: options now name their engine (`George · Kokoro`), because with four
engines "George" alone does not say whether picking it commits the film to a
download or to a server being up. And the two optional engines are now
reachable from a browser at all, through `FilmStudio.useEngine()` and two
labelled checkboxes — previously they could only be chosen by an environment
variable, which a browser does not have. A newly enabled engine registers at
the **front** of the ladder, because ticking a box is a request to use it;
appending would have left it behind Piper with nothing saying why.

### `bake_voices` over MCP

So an agent can fill the cache and then render with no model in the loop —
cheap for the same reason `digest` is.

## Proof

| | |
|---|---|
| 28 unit tests | `test/core/takecache.test.mjs` — key identity, both cache shapes, the read-back, the phoneme sidecar, and the disk half including its refusal of anything that is not a 64-hex digest |
| 11 unit tests | `test/core/openvoice.test.mjs` — the provider against a stub server that speaks its protocol: both `/voices` shapes, both `/tts` response shapes, the reference precedence, and a 500 **throwing** rather than returning silence |
| a rendered film | `out/earth/inside-the-earth-kokoro.mp4` |

The render is the one that matters:

```
  [voice] recast host: tts:en_US-hfc_male-medium -> kokoro:bm_george
  [voice] providers: kokoro > tts
  [take] 9 cached, 0 synthesized, 0 written
  [audio] master: peak -1.78 dBFS, 0.78 dB of headroom.
  73.35s · 120 nodes · 92 tracks · 10 textures · 196.0s wall
  wrote out/earth/inside-the-earth-kokoro.mp4 (55.85 MB)
```

**Nine lines cached, zero synthesized**: the render never loaded the model.
The film grew from 65.4 s to 73.35 s because Kokoro phrases more slowly than
Piper and `retimeToAudio` grew every shot to fit — which is the retiming
working, on a path where it had never been exercised with a second engine.

Baking all nine lines cost 165 s *once*, including the 86 MB download.

And the audition, measured rather than described:

```
kokoro.wav  5.33s  48000Hz  1ch
  overall peak 0.5241 (-5.6 dBFS)   rms 0.08307 (-21.6 dBFS)
```

## What this does not do

- **The weights are not vendored.** The first bake still needs the network.
  The cache makes that a one-off rather than per-render, which was the actual
  problem, but an air-gapped checkout still cannot start.
  [../pending/39-OFFLINE-VOICE-WEIGHTS.md](../pending/39-OFFLINE-VOICE-WEIGHTS.md)
  has why it is harder than it looks: `kokoro-js` exports an `env` that
  proxies only `wasmPaths`, so Transformers.js's `localModelPath` and
  `allowRemoteModels` cannot be reached through it.
- **No check for an unbaked engine.** `check-film.mjs` stats Piper's `.onnx`
  before a render because an advert once shipped with every line silent; the
  equivalent for "cast on Kokoro, nothing baked, no network" does not exist.
  The ladder does report the substitution, loudly, which is the safety net
  rather than the check.
- **OpenVoice has still never spoken here.** Its client is tested against a
  stub that speaks its documented protocol; no real server has been run. That
  is a smaller claim than Kokoro's and it is stated rather than implied.
