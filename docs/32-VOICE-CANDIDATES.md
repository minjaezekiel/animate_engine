# More human voices: a shortlist, and how one would plug in

**Status: research, not implementation. Nothing here is integrated.** Piper
remains the default and VoiceStudio remains the cloned-voice path.

The brief was to keep looking for more human-sounding open-source voice
models that this engine could adopt without much friction. This records what
was found, what was actually verified, and what the integration would cost.

## The constraint that rules most options out

The engine synthesizes **in the browser**. `scripts/produce.mjs` drives
headless Chrome and `TtsVitsProvider` runs Piper's VITS models through
`vits-web` in that page. So a candidate has to be one of:

1. **Browser-runnable** — ONNX Runtime Web / WebGPU / WASM, or
2. **A local HTTP backend**, the way `VoiceStudioProvider` talks to
   VoiceStudio on `:3900`.

Anything that only runs as a Python process with a GPU is option 2, and
option 2 means the user has to be running something. That is exactly the
failure `30-STRUCTURE-SERIES.md` records — twelve films rendered in a
stand-in voice because nothing was listening on 3900.

So **browser-runnable is worth a lot** here, more than a point or two of
MOS.

## The shortlist

| | params | licence | browser | notes |
|---|---|---|---|---|
| **Kokoro-82M** | 82M | **Apache-2.0** ✅ | yes, via `kokoro-js` | 54 voices, 8 languages. The recommendation. |
| Supertonic | ~99M | MIT (unconfirmed) | claimed, WebGPU | 31 languages; speed claims unverified |
| Kitten TTS | 15–80M | unconfirmed | claimed | English only, 8 voices, 25–80MB |
| Pocket TTS | — | MIT, weights CC-BY-4.0 | claimed, CPU | edge/browser focus |
| Chatterbox | large | MIT | **no** — server | voice cloning; option 2 only |
| Qwen3-TTS | large | Apache-2.0 | **no** — server | option 2 only |
| XTTS-v2 | large | **non-commercial** ❌ | no | licence rules it out |
| Voxtral TTS | large | **CC BY-NC 4.0** ❌ | no | licence rules it out |

### What was actually verified

Only the Kokoro row, and only partly. From the model card at
[huggingface.co/hexgrad/Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M):
**Apache-2.0, 82 million parameters, 54 voices, 8 languages** in v1.0.

Everything else in the table comes from aggregator blog posts, not primary
documentation, and **several of those sources disagree with each other on
licences**. Two of the models most often recommended as "open source" are
non-commercial. Check the licence from the model card itself before shipping
anything, because that is the kind of mistake that is cheap to avoid now and
expensive later.

Also unverified: the ONNX export and the browser runtime are **community
work**, not part of the Kokoro model card — the exports are credited to
taylorchu under `onnx-community/Kokoro-82M-ONNX`, and `kokoro-js` to Xenova,
built on Transformers.js. It started WASM-only with WebGPU added later. No
source was found that benchmarks any of these under WebGPU specifically, so
treat the speed claims as marketing until measured here.

## Why Kokoro is the recommendation

- **Licence is clean and confirmed.** Apache-2.0, from the model card.
- **It runs where this engine runs.** `npm i kokoro-js`, WebGPU with a WASM
  fallback — the same shape as the existing `vits-web` dependency, which is
  already vendored rather than fetched.
- **54 voices against Piper's 119 models but far better per voice.** The
  problem Piper gives us is not count, it is that the voices sound
  synthetic — and in Swahili, that there is exactly **one**.
- **82M is small enough to vendor.** Piper models are 63MB each and this
  repo already vendors five. One Kokoro model covering 54 voices would be
  less total disk than the three English Piper models it replaces.

Against it: Kokoro's 8 languages **almost certainly do not include
Swahili**, so `30-STRUCTURE-SERIES.md`'s one-Swahili-voice problem is not
solved by this. That needs either VoiceStudio cloning or a Swahili-specific
model, and it should be checked explicitly rather than assumed.

## What integration would cost

Small, because the abstraction is already right. `VoiceRegistry`'s entire
provider contract is four members:

```
id, label
available()  -> bool          capability probe; must never throw
listVoices() -> Voice[]
synthesize({text, voice, lang}) -> { audioBuffer, phonemes? }
```

So a `src/core/voice/providers/TtsKokoroProvider.js` sits beside
`TtsVitsProvider.js` and nothing else changes. The work is:

1. The provider itself, modelled on `TtsVitsProvider`.
2. Kokoro voice ids added to `VOICE_PRESETS` in `catalog.js`, so casting
   stays **by role** — a series recasts with one environment variable, the
   way `VOICE_BACKEND` already works.
3. A `vendor-voice` path for the ONNX weights, for the reason the existing
   one exists: a headless render launches a fresh Chrome profile, so an
   unvendored model is re-downloaded every single run, and a CDN 503 has
   killed a render here before.
4. Level-matching against the existing voices. `24-VOICE-AND-DELIVERY.md`
   records a measured 6.6 dB gap between two Piper voices; a new engine will
   not arrive matched either.

**`phonemes` is the prize.** The contract says a provider that returns
timings gets *exact* lipsync instead of estimated. Piper does not. If Kokoro
can be made to, every film in the repo gets better mouths — which is a
bigger quality win than the timbre.

## How to evaluate before committing

Do not take any of the above on trust, including the recommendation.

```bash
SAY="Two balls collide, and fly off in completely different directions." \
  VOICE=<id> npm run voice-studio      # the existing audition path
```

The honest test is the one this repo already uses for everything else:
synthesize the same line on each candidate, render it into a real film, and
listen. `scripts/narration-pacing.mjs` then measures speech ratio on the
output, which is the ground truth the estimator is not.

Worth measuring per candidate, in this order:

1. **Licence**, from the model card. Rules options out for free.
2. **Does it run headless in our Chrome**, at all.
3. **Seconds of audio per second of wall clock.** A render that is slower
   than real time changes the workflow.
4. **Does it return phoneme timings.**
5. **Then** how it sounds.

Sources for the table, all secondary and to be re-checked:
[pinggy.io](https://pinggy.io/blog/best_open_source_self_hosted_text_to_speech_models/),
[picovoice.ai](https://picovoice.ai/blog/on-device-tts/),
[yaps.ai](https://www.yaps.ai/blog/best-local-tts-models),
[localaimaster.com](https://localaimaster.com/blog/best-local-tts-models),
[besthub.dev](https://www.besthub.dev/articles/8-must-watch-open-source-tts-projects-for-2026-b721f1828dbd).
