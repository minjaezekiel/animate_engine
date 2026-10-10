# jireX — overview

jireX is a browser animation engine with two faces: a studio a person can use
directly, and a declarative format an AI can write in one shot. Both produce
the same artifact — a `film.json` — and the same pipeline renders it to video.

The repository also contains `animateEngine.js`, the original single-file 3D
editor (Three.js r128). It still works and is untouched by the new code. The
plan is for it to become a second *backend* over the shared core rather than a
separate program; see [05-PHASES.md](05-PHASES.md).

## Why there is a core

The hard requirement that shaped everything: a two-minute film must render
**deterministically**, so frame 2,880 is the same every time, and the whole
thing must work for 2D now and 3D later.

That rules out the usual approach of animating by reading a clock inside the
renderer. So `src/core/` obeys one rule:

> **Core reads no clock, no DOM, no RNG and no Three.js.**
> Time enters only as an explicit number.

No `Date.now`, no `performance.now`, no `Math.random` (a seeded `rng.js`
instead), no `clock.getDelta()`. Everything downstream falls out of that:

- **2D and 3D** are backends over the same scene graph and evaluator.
- **Determinism** is free — frame *N* is a pure function of *N*.
- **Node tests** cover ~80% of correctness with no browser at all. The full
  2,880-frame render loop runs in Node in about 75 ms against a null backend.

## Layers

```
film.json  or  screenplay.txt
        |
        v
  core/script      compile / validate / screenplay / generate
        |                                 (pure, deterministic)
        +--------> core/scene   Scene, Node, Transform2D
        +--------> core/anim    Track, Clip, Timeline, Evaluator
        +--------> core/voice   VoiceRegistry + providers
        +--------> core/audio   cues, envelope, visemes, lipsync
        |
        v
  core/paint      strokes, brushes, layers    (see 16-PAINT.md)
  core/motion     photo deformation           (see 17-MOTION-AND-MCP.md)
  core/script/ops headless op table -> MCP tools
        |
        v
  kernels/                    Rust -> wasm numeric kernels, JS fallback
        |                     (deform, paint, image; see 15-PERFORMANCE.md)
        v
  backends/canvas2d           <-- ships today
  backends/three3d            <-- planned (wraps the existing managers)
        |
        v
  render/OfflineRenderer      one loop, swappable sinks
        |
        +--> MediaRecorderSink   paced, zero dependency, carries audio
        +--> WebCodecsSink       exact timestamps, needs an injected muxer
        +--> MemorySink          for tests, runs in Node
        |
        v
  .webm / .mp4
```

`src/studio.js` is the browser entry point that wires it together, and
`film.html` is the UI over it.

## Pipeline order

Audio is rendered **before** the first video frame. That is not incidental:
lipsync needs real samples, because the envelope decides *when* a mouth moves
while the text decides *what shape* it makes.

```
compile -> synthesize voices -> retime shots to real audio -> recompile
        -> mix audio offline (OfflineAudioContext, sample-exact)
        -> derive viseme tracks from the samples
        -> render frames (frame-stepped, deterministic)
        -> encode
```

## Running it

```bash
# the studio
python3 -m http.server 8080     # any static server; ES modules need http://
open http://localhost:8080/film.html

# tests
npm test                         # Node unit tests, no browser
npm run test:e2e                 # headless Chrome: render, determinism, A/V sync

# render the demo film to a file
npm run produce                  # -> demo/out/the-keeper.webm
```

## Where to read next

| Document | For |
|---|---|
| [01-CORE.md](01-CORE.md) | the contracts: Node, Scene, Track, Timeline, Evaluator, Backend, FrameSink |
| [02-FILM-SCRIPT.md](02-FILM-SCRIPT.md) | the `jirex.film/1` format and how it compiles |
| [03-VOICE.md](03-VOICE.md) | voices, casting, and the three lipsync tiers |
| [04-RENDER-EXPORT.md](04-RENDER-EXPORT.md) | the render loop, the MediaRecorder timing trap, frame budget, fallbacks |
| [05-PHASES.md](05-PHASES.md) | the roadmap, phase by phase |
| [07-ART-SYSTEM.md](07-ART-SYSTEM.md) | how flat shapes become cel-shaded limited animation |
| [08-ART-VOCABULARY.md](08-ART-VOCABULARY.md) | **every enumerated name**, with a complete worked scene |
| [09-PRINCIPLES.md](09-PRINCIPLES.md) | the twelve principles of animation mapped to engine features |
| [10-ACTION-GAPS.md](10-ACTION-GAPS.md) | **measured limits on action**, and the phases that address them |
| [11-MOTION-SYSTEM.md](11-MOTION-SYSTEM.md) | layering, timing texture, smears, motion graphics |
| [12-MOCAP.md](12-MOCAP.md) | *assessment, unbuilt* — webcam motion capture, scoped and costed |
| [13-3D-FILM.md](13-3D-FILM.md) | declarative 3D films, analytic particles, the 3D live test |
| [14-CHARACTER-3D.md](14-CHARACTER-3D.md) | procedural rig, skinning, blendshapes, and the honest ceiling |
| [15-PERFORMANCE.md](15-PERFORMANCE.md) | **Rust/wasm kernels, measured; what the browser really offers; the missing-tool register** |
| [16-PAINT.md](16-PAINT.md) | **drawing tools** — SVG paths, 15 brushes, layers, grain, wet media, draw-on |
| [17-MOTION-AND-MCP.md](17-MOTION-AND-MCP.md) | **picture into video**, and the headless agent surface |
| [STATUS.md](STATUS.md) | **what is implemented and what is not** |
| [DEFECTS.md](DEFECTS.md) | the defect register for the legacy 3D engine |
| [CDN-AND-PWA.md](CDN-AND-PWA.md) | loading from a CDN, installing, offline |
