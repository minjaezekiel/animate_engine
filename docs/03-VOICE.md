# Voices and lipsync

A voice is a **provider-backed source of speech for a named character**. The
same film renders with any mix of sources — your own recorded voice, uploaded
files from different voice actors, or synthesized speech — because every
provider satisfies one interface.

```js
VoiceProvider {
  id; label; source
  available() -> bool                 // capability probe; must never throw
  listVoices() -> Voice[]
  synthesize({text, voice, lang}) -> { audioBuffer, phonemes? }
}
```

`phonemes` is optional, and it is the payoff: **a provider that returns
timings gets exact lipsync instead of estimated.**

## Providers

| Provider | Source | Status | Notes |
|---|---|---|---|
| `TtsVitsProvider` (`tts:`) | open-source in-browser TTS | **working** | Piper/VITS via onnxruntime-web. 124 voices across 36 languages, permissively licensed, from `rhasspy/piper-voices`. Inference runs off the main thread; models cache in OPFS, so offline works after the first fetch. |
| `UploadProvider` (`upload:`) | voice-actor files | **working** | mp3/wav/ogg. One file can voice every line, or files can be bound per line so different actors read specific lines. |
| `MicProvider` (`mic:`) | your own voice | **working** | `getUserMedia` → `MediaRecorder` → `decodeAudioData`, recorded per line with retakes. Zero ML, zero network. |
| `TtsHttpProvider` (`http:`) | any HTTP endpoint | **working, unconfigured** | The seam for a self-hosted model or a cloning service. If the endpoint returns phoneme timings, lipsync upgrades automatically. |
| voice cloning | your voice on any line | **not implemented** | Needs a server-side model (XTTS-class). Reachable through `TtsHttpProvider` without engine changes. Day-to-day "use my voice" is `MicProvider`, which sounds better than a clone anyway. |
| `SpeechSynthesis` | — | **will not be supported** | The Web Speech API exposes no capturable buffer, so it cannot be rendered into a file. |

### TTS needs an import map

The TTS runtime dynamically imports `onnxruntime-web` by bare specifier, which
a browser cannot resolve alone. `film.html` pins it:

```html
<script type="importmap">
{ "imports": { "onnxruntime-web": "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/+esm" } }
</script>
```

Without it the provider reports itself unavailable and the film renders silent
with subtitles — a deliberate rung on the fallback ladder, not a crash. If
voices are silently missing, check this first.

## Casting

```json
"voices": {
  "mara_v":  { "spec": "tts:en_GB-alba-medium" },
  "jonas_v": { "spec": "upload:actor_jane" },
  "narr_v":  { "spec": "mic:myvoice" }
},
"characters": { "mara": { "voice": "mara_v" } }
```

A spec is `<providerId>:<voiceId>`. The indirection through the `voices` block
means recasting a whole film is one edit, and the same film can render with
TTS on one machine and recorded takes on another.

`VoiceRegistry.synthesize` walks down the provider list if the preferred one is
unavailable, so a film authored against TTS still renders elsewhere.

A line may override its character's voice with `"voice": "…"`, or skip
synthesis entirely with `"audio": "assetId"` to use a pre-recorded clip.

## Pipeline

```
screenplay.txt ──parse──> film.json ──cast──> voices per character
                                                      │
                                                synthesize
                                                      ▼
                                 per-line AudioBuffer (+ phonemes?)
                                                      │
                          ┌───────────────────────────┴──────────────────┐
                          ▼                                              ▼
              OfflineMixer (sample-exact)                     lipsync → viseme track
                          ▼                                              ▼
                   one mixed AudioBuffer                      props.viseme per mouth
```

Synthesis is cached by `hash(text + voiceId)`, so re-rendering does not
re-synthesize unchanged lines.

The mix is rendered with `OfflineAudioContext`: sample-exact regardless of
machine load, and far faster than the film's duration, so it is finished
before the first video frame is drawn. Cues resolve to **integer sample
offsets** — that is where off-by-one sync bugs live, so the arithmetic is pure
and unit-tested apart from Web Audio.

Everything decodes at **48 kHz** on purpose. Dropping a 44.1 kHz buffer into a
48 kHz render plays it 8.8% fast, which reads as narration drifting and gets
misdiagnosed as a muxing fault.

## Lipsync

Six visemes: `closed`, `mid`, `open`, `round`, `wide`, `teeth`. Those are the
distinctions a viewer actually notices at 24 fps — a closure, a neutral, an
open vowel, a rounded vowel, a wide vowel, and teeth-on-lip.

Characters declaring fewer shapes still animate: each viseme names the shapes
it will settle for, so a `closed`/`mid`/`open` mouth renders `teeth` as `mid`.

### Three tiers, best first

```js
visemesFromPhonemes(nodeId, phonemes, …)   // exact — TTS with timings
visemesFromText(nodeId, text, samples, …)  // primary — text gated by the envelope
visemesFromEnvelope(nodeId, samples, …)    // floor — three shapes by amplitude
```

`lipsyncLine` picks the best tier available.

The text tier works like this: the RMS envelope of the real audio decides
**when** the mouth moves (and forces `closed` through every silence), while a
~40-entry grapheme rule table decides **what shape** it makes, distributed
across the measured voiced spans in proportion to their length.

Keys are written only where the viseme changes, with `step` easing — visemes
never blend.

### What is deliberately absent

**Spectral/formant classification.** Band energy cannot recover place of
articulation, so `/m/ /b/ /p/ /f/ /v/` would be guessed. A wrong viseme
flickering is more noticeable than a coarser one that is right, and the text
already carries that information for free. Revisit only with a measured
comparison against the text baseline.

## Recording your own voice

In the studio: **Record my voice**, pick a character, then read each line as
prompted. Takes are stored per line, so a retake replaces one line rather than
the whole performance. The character's spec is rewritten to `mic:<character>`.

Programmatically:

```js
await studio.mic.record({ voiceId: 'mara', lineKey: 'The light has never failed.', stopSignal });
```

Because recording is interactive, a render reads from takes captured earlier
rather than prompting mid-render.
