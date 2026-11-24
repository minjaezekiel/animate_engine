# Making Kokoro and OpenVoice actually renderable

**Status: not started.** The gateway, both providers and their unit tests are
in (Phase 39). What is missing is the part that lets a render *use* them, and
it is not in the gateway.

## The honest position today

`VOICE_BACKEND=kokoro npm run render:earth` is wired, documented and has
**never been run to completion**, and the same is true of OpenVoice. Two
reasons, neither of them about the provider interface:

1. **Kokoro's weights are not vendored.** `KokoroProvider` fetches
   `onnx-community/Kokoro-82M-v1.0-ONNX` from the network. A headless render
   launches a *fresh Chrome profile*, so the browser HTTP cache is empty every
   single time — an ~86 MB download is paid per render, not once.
2. **OpenVoice needs a server you start**, and a film that cannot be rendered
   without one is a film welded to a machine.

## Why "synthesize per frame" is the wrong seam

The ask was to load the speech model and then render per frame. That cannot
work here, and the reason is worth writing down because it is a property worth
protecting rather than a limitation:

> **The film retimes to the audio.** `retimeToAudio` (in
> `src/core/script/screenplay.js`) walks `scenes[].shots[].dialogue[]` and
> grows each shot to fit its real take. So every line must exist *in full*
> before frame 0 is drawn — otherwise the timeline depends on the render, and
> frame N stops being a pure function of N.

Per-frame synthesis would trade the determinism guarantee for nothing: it
would also be *slower*, because a model loaded in the render process competes
with the renderer for the same GPU and the same memory, which is exactly the
contention that already forced `scripts/lib/render-lock.mjs` into existence.

The right answer is stronger than the one asked for: **never synthesize during
a render at all.**

## Three parts

### 1. Vendor the weights, exactly like Piper's

`vendor/piper-voices/` is already the pattern, and `check-film.mjs` already
errors when a cast model is not on disk — that check exists because an advert
rendered with *every line silent* and reported success (Phase 37). Kokoro runs
on Transformers.js, which honours `env.localModelPath` and
`env.allowRemoteModels = false`, so:

- `npm run vendor-kokoro` fetches the ONNX weights and voice packs once into
  `vendor/kokoro/`.
- `KokoroProvider` points the runtime at `/vendor/kokoro/` on the same
  localhost origin the film is already served from.

A localhost fetch is not a fetch. After one download the engine is offline
forever, fresh profile or not — and `npm run voices` stops being a promise and
starts being a fact.

The same `checkVoiceModels` shape extends to Kokoro, so a film cast on a voice
that is not vendored fails **before** the render instead of after.

### 2. A content-addressed take cache

`cache/voice/<sha256(provider|voice|lang|speed|text)>.wav`.

A `CacheProvider` sits first in the registry ladder: a hit returns the buffer
and never touches a model; a miss falls through to the real provider and
writes the take on the way back. Because the key is the content:

- editing one line of narration re-synthesizes one line;
- re-rendering at a different resolution re-synthesizes nothing;
- a second render of the same film makes no network request and loads no
  model.

`npm run say -- FILM=films/earth/inside.json` bakes a whole film's dialogue
out of band. That is also what makes OpenVoice practical: **start the server,
bake, stop the server, render offline for the rest of the week.**

### 3. The switch stays one string

Nothing above changes how a film is cast. `voices: { host: 'narrator-m-en' }`
still resolves through `VOICE_PRESETS`, `VOICE_BACKEND=<name>` still promotes
an engine, and the `tts:` / `kokoro:` / `openvoice:` / `voicestudio:` prefixes
stay as they are. The gateway was the right abstraction; what was missing was
the *delivery* of the models behind it.

What to add on top, for the two audiences:

- **Users:** a voice picker in `film.html` and `film3d.html` populated from
  `listVoices(registry, { probe: true })`, showing licence, whether the engine
  clones, and what it needs — the same four facts `npm run voices` prints.
  Cast-by-role stays the default and the picker writes a role, not a model id,
  so the film does not get welded to one engine by a click.
- **Agents:** `list_voices` over MCP already exists. Add `bake_voices`, so an
  agent can fill the cache and then render with no model in the loop — which
  is the cheap path for the same reason `digest` is.

## OpenVoice: consent is not optional

`OpenVoiceProvider`'s header says it and this doc repeats it: a reference
recording used for cloning needs the consent of the person who recorded it.
The provider should refuse a reference with no accompanying consent record
rather than leave that to policy.

## Acceptance

1. `npm run vendor-kokoro`, then `VOICE_BACKEND=kokoro npm run render:earth`
   completes with the network disabled.
2. The same render run twice produces **byte-identical** audio.
3. `check:earth` fails when a cast Kokoro voice is not vendored.

Until all three pass, this doc stays in `pending/` and the README keeps saying
these two engines are wired but unexercised.
