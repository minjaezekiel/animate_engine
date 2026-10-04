# Rendering and export

## One loop, swappable sinks

```js
renderOffline({ scene, timeline, backend, cameraId, fps, width, height,
                durationSec, sink, physics?, onProgress, signal, beforeFrame })

// for n in 0 .. total-1:
//   t = clock.timeOf(n)            // n / fps, exactly
//   physics?.stepTo(t)
//   resetPose(scene, baseline)     // frame N depends only on N
//   applyPose(scene, samplePose(timeline, t))
//   backend.sync(scene); backend.renderFrame(scene, cameraId)
//   await sink.writeFrame(backend.canvas(), n, t)
```

Every export format is a different sink; the loop never changes. The scene is
restored to its authored pose in a `finally`, so a preview, a scrub and a
second render all start from the same state.

## The MediaRecorder timing trap

This one was measured, not assumed, and it is the most important thing on this
page.

**MediaRecorder stamps each frame with the wall-clock moment the track
produced it, and there is no API to set a presentation timestamp.** A spike
feeding 48 frames at 24 fps as fast as possible produced a file of:

| | wall time | **file duration** | expected |
|---|---|---|---|
| unpaced | 1.30 s | **0.96 s** | 2.00 s |
| paced | 1.97 s | **1.93 s** | 2.00 s |

So `captureStream(0)` + `requestFrame()` gives frame-exact *content* but not
frame-exact *duration*. `MediaRecorderSink` therefore paces to the real clock
against an **absolute** deadline (`t0 + n × frameMs`), not a per-frame sleep —
a slow frame is absorbed instead of accumulating drift over 2,880 frames.

The same spike came up 74 ms short even when paced, because the final frame
has no successor to delimit its display period. `finish()` holds the last frame
for one extra frame period before stopping.

The cost is that an export takes as long as the film: a two-minute film needs
two minutes. The benefit is that it needs no dependency at all, **and it still
carries audio** — one `AudioBufferSourceNode` holding the pre-rendered mix
feeds a `MediaStreamAudioDestinationNode` whose track joins the same stream.
Both tracks share the one real clock, so they are in sync by construction.

## WebCodecsSink

`VideoFrame` carries an explicit `timestamp`, so 2,880 frames spaced 41,667 µs
apart is exactly 120.000 s no matter how long encoding takes. That removes the
pacing requirement and the hidden-tab hazard, and runs faster than real time.

It needs a container muxer, which is **injected rather than imported** — no
hard CDN dependency lives in the engine:

```js
new WebCodecsSink({ muxerFactory: async ({width, height, fps, codec, audio}) => ({
    addVideoChunk(chunk, meta) { … },
    addAudioChunk(chunk, meta) { … },
    finalize() { return blob; },
}) })
```

Without a factory, `available()` returns false and the renderer falls back to
the paced path. Audio is encoded up front from the finished mix; the muxer
orders by timestamp.

## Frame budget

Two minutes at 24 fps is **2,880 frames**.

| Path | Hard ceiling | Target |
|---|---|---|
| paced MediaRecorder | **41.6 ms/frame** | ≤ 25 ms |
| WebCodecs | none | ≤ 20 ms |

Overrunning the paced ceiling drops frames *and* drifts audio. `preflight()`
measures 48 frames before committing and reports median/p95 against the
ceiling. Measured on the demo film at 1280×720: **1.24 ms median, 2.07 ms
p95** — far inside budget, because vector 2D is cheap.

720p24 is the default. 1080p roughly doubles fill and encode cost; vector art
is resolution-independent, so raising it is a config change, not a rebuild.

**Never retain a frame.** 2,880 × 1080p RGBA is 23.9 GB. `writeFrame` consumes
and releases, and every `VideoFrame` is `.close()`d or Chrome's encoder queue
stalls.

## Fallback ladder

**Video:** WebCodecs H.264/mp4 → WebCodecs VP9/webm → paced MediaRecorder webm
→ two halves concatenated → PNG sequence + an `ffmpeg` one-liner.

**Audio:** full mix muxed by WebCodecs `AudioEncoder` → mix played live into
the paced recorder's audio track → separate `.wav` plus silent video →
silent film with subtitles.

**Voice:** TTS → uploaded voice-actor files → your recorded voice → subtitles
only.

**Lipsync:** phoneme-exact → text + envelope → three-shape amplitude → static.

**Resolution:** 1280×720@24 → 960×540@24 → 1280×720@15 → 640×360@24.

Each rung still yields a watchable film. `audioAsWav(prepared)` exists
precisely for the rung where muxing is unavailable.

## Hidden tabs

A paced render dies if the tab is hidden: rAF throttles to ~1 Hz and timers
throttle too. The sink requests a `navigator.wakeLock` and the UI warns. rAF
is used **only to pace**, never to drive timeline time. The WebCodecs path is
immune, having no pacing at all.

## Verifying a render with nobody watching

In cost order:

1. **Fast proxy render** — full 2,880 frames at 160×90. Same code path, 1/72
   the pixels, about 2 s. Catches frame count and timestamp errors.
2. **Golden frame digests** at a fixed sample set — catches "the camera
   stopped moving at frame 900", which a size check never would.
3. **Determinism** — two renders must produce identical **draw-call streams**.
   Not pixels: Chrome moves a canvas between GPU and CPU rasterization during
   frequent `getImageData`, so a pixel digest is unstable even when the scene
   state is identical. Encoders need not be bit-reproducible; the renderer
   must be.
4. **Sync probe** — a one-frame white flash and a 1 kHz click at the same
   instant, asserted back out of the *encoded* file. This is the only check
   that proves alignment rather than mere presence. Measured: click recovered
   at 0.007 s.
5. Output duration read back through a `<video>` element.

`npm run test:e2e` runs 1–3; `node test/e2e/render-av.mjs` runs 4–5.
