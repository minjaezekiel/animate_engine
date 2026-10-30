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

It needs a container muxer. One ships in the engine — `render/mux/Mp4Muxer.js`,
hand-rolled with no dependency, the way `io/png.js` and `io/zip.js` are — and
`studio.js` installs it by default, so **MP4 is the default output** and this is
the path a render normally takes. It stays **injectable** for anyone who wants a
different container:

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

`available()` also probes the codec, because a muxer alone is not enough to
answer the question: an MP4 the platform cannot encode H.264 for is a file that
plays nowhere. Asking for `format: 'mp4'` on such a browser **throws**, rather
than quietly returning WebM with an MP4's expectations attached.

## The built-in MP4 muxer

Progressive (non-fragmented), `moov` **before** `mdat` so a player can start on
the first bytes instead of seeking to the end for the sample tables. That costs
two layout passes — the chunk offsets depend on the size of the `moov` that
contains them — which converges because every offset field is fixed width, so
rewriting the values cannot change the length. A guard throws if it ever fails
to converge, and `co64` promotion is decided *before* the first pass for the
same reason.

Sample durations come from the chunk timestamps, not from the frame rate, so a
dropped or re-timed frame reads as a real duration instead of silently shifting
every later frame. Header timestamps are left at zero: this repo asserts that
two renders of one film produce identical output, and a wall clock in `mvhd`
would break that for nothing.

### AAC priming: the 44 ms nobody can see

**AAC encoders prepend a lead-in and WebCodecs does not report how long it is.**
Measured on Chrome 156: **2112 samples, 44.0 ms at 48 kHz.** With the container
silent about it the sync probe found the click at 0.044 s — audio a full frame
late at 24 fps — and the test passed anyway, because its threshold was 0.15 s.

`render/mux/aacPriming.js` measures the lead-in with one 40-frame encode/decode
round trip, cached per configuration. It is **measured, not hard-coded**,
because the number belongs to the encoder: another Chrome, codec or platform may
prime differently and a stale constant would desynchronise every film silently.
The muxer then declares it as an `edts`/`elst` edit list on the audio track,
which is the only place MP4 can say "start this many samples in". The click
moved to **0.000 s**, and the probe's threshold is now 0.02 s.

The same measurement exposed a second disagreement. AAC rounds up to whole
1024-sample frames and the encoder flushes a few more, so the audio track ran
23.2747 s against a picture of 23.2083 s — and the file reported the longer
number. **The picture sets the length of the film**, because a film that
disagrees with its own derived duration breaks the one invariant this format
has, so the audio edit is clamped to the video.

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

**That claim was false until Phase 28.** The camera re-centred on the output
size without scaling to the authored frame, so every render at a
non-authored size was a centre *crop* rather than a resize -- including the
160x90 proxy render the e2e harness calls "the same code path, 1/72 the
pixels". The camera now carries `frameWidth`/`frameHeight` and the backend
fits one into the other, uniformly, letterboxing a mismatched aspect instead
of stretching it. `WIDTH=`/`HEIGHT=` on `scripts/grab2d.mjs` is how to look at
a non-authored render.

**Never retain a frame.** 2,880 × 1080p RGBA is 23.9 GB. `writeFrame` consumes
and releases, and every `VideoFrame` is `.close()`d or Chrome's encoder queue
stalls.

## Fallback ladder

**Video:** WebCodecs H.264/mp4 (**the default, and now real**) → paced
MediaRecorder webm → two halves concatenated → PNG sequence + an `ffmpeg`
one-liner. VP9-in-MP4 was removed from the ladder: it is legal in the container
and undecodable on most phones, which is worse than falling through to WebM.

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

`npm run test:e2e` runs 1–3; `npm run test:av` runs 4–5 on the paced WebM path
and `npm run test:av:mp4` runs them on MP4. **Both are shipping paths, so both
are in `test:all`** — the priming defect above existed only on one of them, and
a probe that ran on the other would never have found it.

Measured on MP4: a 23.2 s film at 640×360 encodes in **5.2 s** (4.5× faster
than real time), reports its duration as **23.208 s** against 23.208 s derived,
and recovers the sync click at **0.000 s**.
