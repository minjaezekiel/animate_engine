# jireX

A browser animation studio. Write a film as JSON or as a plain screenplay,
cast voices for its characters, and render it deterministically to video —
entirely client side, installable, and usable offline.

The repository also contains **animateEngine**, the original single-file
Three.js 3D editor. It still works and is unchanged; the roadmap folds it in
as a second rendering backend over the shared core rather than keeping two
programs. See [docs/05-PHASES.md](docs/05-PHASES.md).

MIT licensed — see [LICENSE](LICENSE).

---

## What it does today

- **Author a film** as `jirex.film/1` JSON, or paste a screenplay and have it
  structured into one. Durations sequence automatically; the total is derived,
  never declared.
- **Characters without asset work.** Ask for a figure and get a 19-part cutout
  rig with correctly placed joints, a six-shape mouth, and `idle`, `breathe`,
  `walk` and `blink` cycles. The part tree *is* the rig — parent/child
  transforms, no skin weights.
- **Voices from three sources, interchangeably:** 124 open-source Piper/VITS
  voices running in the browser, uploaded recordings from voice actors, or
  your own voice through the microphone. Each character is cast independently.
- **Lipsync** in three tiers: exact from phoneme timings where a voice
  provides them, otherwise the dialogue text gated by the real audio envelope,
  with a three-shape amplitude floor beneath that.
- **Pose by dragging.** `studio.html` turns every joint into a handle: drag a
  hand and inverse kinematics solves the arm, then writes the result back into
  the film script as a real action. There is no editor-only state — the edit
  *is* the script, so anything posed by hand can be read, diffed and rewritten
  by an AI, and anything written by an AI can be posed by hand.
- **Deterministic rendering.** Frame *N* is a pure function of *N*, so a
  re-render is identical and a timeline can be scrubbed. The full 2,880-frame
  loop runs in Node in about 75 ms against a null backend.
- **Draw and paint.** 15 brushes over a Rust/wasm raster layer — pencil,
  ink, chisel marker, calligraphy, watercolour, oil, smudge — with layers,
  masks, clipping groups and 17 W3C blend modes. Strokes are authored as
  **SVG path data**, so one line replaces two hundred coordinates and an
  agent can write them. Draw-on reveal is one number channel, so every
  easing the animation system has applies to it.
- **A photograph into a shot.** Ken Burns, 2.5D parallax, wave and puppet
  warp over one textured-mesh kernel, with monocular depth estimation, the
  mesh **torn** at depth edges so a subject separates instead of
  stretching, and the hole behind it filled from an inpainted background
  plate.
- **An editor that behaves like one.** Undo *and* redo as labelled inverse
  patches rather than whole-document snapshots, platform-correct hotkeys as
  a rebindable table, and onion skinning rendered by the real renderer with
  past and future tinted apart.
- **Video out** with audio muxed, as WebM today — no dependencies at all on
  the 2D path. Or a lossless PNG sequence in a zip, which needs no codec at
  all and is what a compositor wants.
- **A headless agent surface.** 21 MCP tools generated from one op table,
  running in Node: an agent paints, animates a photograph, writes a PNG and
  then *looks at what it made*, with no browser in the loop.
- **Installable PWA**, offline after first load.

A worked example ships in the repo: `demo/film.json` is four scenes, nineteen
shots and ten voiced lines, running exactly 120.0 seconds.

## Quick start

```bash
npm install          # only dev dependencies (terser, puppeteer-core, omggif)
npm run serve        # ES modules need an http:// origin
open http://localhost:8080/film.html     # author, voice, render, export
open http://localhost:8080/studio.html   # pose characters by dragging them
```

Then **Load "The Keeper"** and **Render film**, or paste a screenplay and
build a film from it. The two pages hand a film back and forth, so you can
stage a shot in the editor and ship it from the harness without saving a file
in between.

To render the demo to a file from the command line:

```bash
npm run produce      # -> demo/out/the-keeper.webm
```

## Driving it from code

```js
import { FilmStudio } from './src/studio.js';

const studio = new FilmStudio({ onLog: console.log });
const film = await (await fetch('./demo/film.json')).json();

const { blob } = await studio.produce(film, { canvas: myCanvas });
```

Or from a CDN, with no install at all:

```html
<script src="https://cdn.jsdelivr.net/gh/minjaezekiel/animate_engine@main/dist/jirex.min.js"></script>
<script>const studio = new jireX.FilmStudio();</script>
```

Or the core alone — scene graph, timeline and film compiler, 39 KB minified,
no backend, encoder or voice system:

```js
import { compileFilm, FrameClock, Evaluator } from './src/core/index.js';
```

Inside the studio page, `window.jirex` exposes `setFilm`, `prepare`, `render`
and `produce`, so an agent can author a film and render it without touching
the UI.

**Voices need an import map** for `onnxruntime-web`; `film.html` has it. Any
other host page must supply it or films render silent with subtitles. See
[docs/03-VOICE.md](docs/03-VOICE.md).

## Tests

```bash
npm test             # 60 Node unit tests, no browser
npm run test:e2e     # headless Chrome: 2,880 frames, timestamps, determinism
npm run test:av      # audio muxing + the A/V sync probe
npm run test:legacy  # the two 3D-editor data-loss guards
npm run test:bundle  # dist/ bundles load and render as a CDN consumer gets them
npm run test:all     # all of the above
```

Determinism is asserted on the **draw-call stream**, not on pixels: encoders
and rasterizers need not be bit-reproducible, but the renderer must be. The
A/V test plants a one-frame flash and a 1 kHz click at the same instant and
recovers both from the encoded file.

## Documentation

| Document | For |
|---|---|
| [docs/00-OVERVIEW.md](docs/00-OVERVIEW.md) | architecture and why the core exists |
| [docs/01-CORE.md](docs/01-CORE.md) | the contracts: Node, Scene, Track, Timeline, Evaluator, Backend, FrameSink |
| [docs/02-FILM-SCRIPT.md](docs/02-FILM-SCRIPT.md) | the `jirex.film/1` format and how it compiles |
| [docs/03-VOICE.md](docs/03-VOICE.md) | voice providers, casting, lipsync tiers |
| [docs/04-RENDER-EXPORT.md](docs/04-RENDER-EXPORT.md) | the render loop, the MediaRecorder timing trap, frame budget, fallbacks |
| [docs/05-PHASES.md](docs/05-PHASES.md) | roadmap |
| [docs/07-ART-SYSTEM.md](docs/07-ART-SYSTEM.md) | the art system's design, and the corrections measurement forced on it |
| [docs/08-ART-VOCABULARY.md](docs/08-ART-VOCABULARY.md) | **every name the procedural art accepts** — read this to author cheaply |
| [docs/09-PRINCIPLES.md](docs/09-PRINCIPLES.md) | the twelve principles of animation, and the feature carrying each |
| [docs/10-ACTION-GAPS.md](docs/10-ACTION-GAPS.md) | **what the engine could not do**, measured against a fight brief |
| [docs/11-MOTION-SYSTEM.md](docs/11-MOTION-SYSTEM.md) | layering, on-twos, smears and the motion-graphics draw layer |
| [docs/12-MOCAP.md](docs/12-MOCAP.md) | *assessment, unbuilt* — rigging a character from a webcam, and what it would cost |
| [docs/13-3D-FILM.md](docs/13-3D-FILM.md) | the 3D film script, particles, and what an AK-47 ad found |
| [docs/14-CHARACTER-3D.md](docs/14-CHARACTER-3D.md) | **building, rigging and skinning a character from code** — and where it stops |
| [docs/15-PERFORMANCE.md](docs/15-PERFORMANCE.md) | **Rust/wasm kernels, measured**; what the browser really offers |
| [docs/16-PAINT.md](docs/16-PAINT.md) | **the drawing tools** — SVG paths, 15 brushes, layers, grain, wet media |
| [docs/17-MOTION-AND-MCP.md](docs/17-MOTION-AND-MCP.md) | **picture into video** — tearing, inpainting, depth — and the agent surface |
| [docs/18-EDITOR-ARCHITECTURE.md](docs/18-EDITOR-ARCHITECTURE.md) | **undo/redo, hotkeys, docking, onion skin, image-sequence export** |
| [docs/STATUS.md](docs/STATUS.md) | **implemented vs not** |
| [docs/DEFECTS.md](docs/DEFECTS.md) | defect register — the legacy 3D engine, and what tests found in the new code |
| [docs/CDN-AND-PWA.md](docs/CDN-AND-PWA.md) | library use, installing, offline |

## Known limits

Honest list; the fuller version is in [docs/STATUS.md](docs/STATUS.md).

- **2D IK is solved against the rest pose**, so a character whose torso is
  leaning or breathing has moved the shoulder out from under the solve.
  Measured at 2.3 px on the demo film.
- **A paced export takes as long as the film** and needs the tab visible,
  because MediaRecorder timestamps frames by wall clock. The WebCodecs path
  removes both limits but needs a muxer wired in.
- **Voice models are 20–60 MB** and download on first use.
- **MP4 needs a muxer**; WebM works with no dependencies.
- **The legacy 3D editor's DOM is still hardwired** to 181 element ids, so it
  only runs inside its own `index.html`.
- **The 3D editor animates rigged characters but cannot rig one.** Import a
  rigged character (glTF or FBX) and retarget animations onto it; building a
  skeleton for an unrigged mesh is not implemented.
- **The legacy GIF and PNG-sequence exports hold every frame in memory**, so
  a long sequence will not complete there. The new `PngSequenceSink` holds
  encoded PNGs rather than frames and refuses an impossible render up front;
  GIF has not been ported to it.
- **A torn photograph's hole is filled by interpolation, not synthesis.** A
  push-pull pyramid cannot carry a strong edge through a wide hole, so a
  large parallax over a busy background reads as soft.
- **Depth estimation needs a model.** The runtime is optional in both the
  browser and Node, and no model url is bundled.
- Pixel output is not bit-reproducible between runs (scene state is).
- The 3D engine's remaining defects are mostly performance — see
  [docs/DEFECTS.md](docs/DEFECTS.md) before relying on it.

---

## Not implemented

What is genuinely absent, checked against the code rather than carried over
from an old plan. Everything the earlier "planned features" list named that
has since shipped — IK, skinning and blendshapes, animation blending and
layering, PBR materials, parametric primitives, particles, WebAssembly
kernels, video export with encoding, and an external API — has been removed
from this list rather than left to look pending. So has "AI text-to-prompt
animation generation", though by a different route than that entry imagined:
rather than the engine parsing a sentence, the format is designed so an LLM
writes it directly, and a plain-text screenplay parses into one. Per-phase
detail is in [docs/STATUS.md](docs/STATUS.md).

### Modelling

- **Boolean operations** — *skipped by decision.* It needs a CSG library,
  which is both a dependency and a correctness surface of its own.
- **Mirror and array modifiers, bevel, loop-cut, subdivision-surface
  modelling.** `lathe` and `extrude` exist as *geometry* — a swept profile is
  one primitive — and `subdivide` splits every triangle of a mesh to give a
  sculpt brush more vertices to push. Neither is a modelling tool you can
  point at a face.
- **UV mapping tools, and painting a texture onto a 3D surface.** The paint
  layer is 2D only; a procedural character carries no UVs.
- **Sculpting beyond the legacy editor's six brushes.** Named in
  [docs/14-CHARACTER-3D.md](docs/14-CHARACTER-3D.md) §6 as the largest
  single gap: a face is still primitives positioned by typing numbers.

### Rigging

- **Auto-rigging an arbitrary imported mesh, and skin-weight painting** —
  *skipped by decision.* Mixamo hands you a rigged character and retargeting
  is wired up; auto-rigging an unknown mesh well is a research problem, and a
  bad auto-rig is worse than none. The engine *does* build a 25-bone skeleton
  with automatic weights for its own procedural character.
- **Bone constraints** — lookAt, limit-rotation, copy-rotation.
- **IK for the 3D character rig.** The 2D cutout rig has a real solver
  (closed-form two-bone, CCD beyond that); the legacy editor has one-shot
  CCD. The 3D character pipeline has neither.
- **Correctives, teeth and tongue, eye convergence, hair, subsurface
  scattering, cloth** — [docs/14-CHARACTER-3D.md](docs/14-CHARACTER-3D.md) §6.

### Simulation and effects

- **Fluid and cloth simulation.**
- **Post-processing beyond bloom.** `OutputPass` is loaded; nothing else is
  wired.

### Performance

- **Level-of-detail and occlusion culling.**

### Export

- **glTF and FBX export.** `GLTFExporter` is loaded in `index.html` but
  nothing is wired to it, and there is no browser FBX *exporter* to wire up
  at all. Project save/load uses Three's own `toJSON`/`ObjectLoader`.
- **GIF from the frame-stepped renderer.** The legacy editor's encoder works
  and is tested, but holds every frame in memory and has not been ported to
  a sink — see [docs/18-EDITOR-ARCHITECTURE.md](docs/18-EDITOR-ARCHITECTURE.md) §7.

### Collaboration and extensibility

- **Real-time multi-user editing, version control, cloud storage, review
  comments.** `src/core/history/` records labelled inverse patches, which is
  exactly the data such a transport would carry, so this is a transport
  problem rather than a rewrite — but none of it is built.
- **A plugin system.**
- **VR / AR.**

### User interface

- **The dockable workspace is a model without a page.** `src/editor/dock.js`
  is tested, but `mountDock` is not used anywhere yet: `studio.html` keeps a
  fixed two-column layout. Floating and tabbed panels, and arbitrary split
  trees, are out of scope by design.
- **No UI for rebinding hotkeys.** The keymap is data and describes itself;
  nothing lets a user edit and persist their own bindings.

---

# animateEngine (legacy 3D editor)

`index.html` + `animateEngine.js` — a single-file Three.js r128 editor,
unchanged by the 2D work above.

**What works:** six primitives, four light types, HDRI environments, texture
slots, multiple keyframeable cameras, bloom post-processing, Cannon.js rigid
bodies, six sculpt brushes, subdivide, keyframe animation with per-key
interpolation, undo/redo and project save/load, WebM/GIF/PNG-sequence export,
audio import with microphone recording, a programmatic `runCommands()` API,
and an MCP server (`mcp/`) that lets an AI drive a live browser session — see
[mcp/README.md](mcp/README.md).

**What `RigManager` does:** it discovers bones and morph targets in imported
glTF or FBX, shows a `SkeletonHelper`, poses a bone chain with one-shot CCD,
sets morph influences, and **retargets** a clip onto a differently-named
skeleton through `SkeletonUtils.retargetClip` with a Mixamo name preset. It
still *constructs* no skeleton of its own — that lives in
`src/core/art/humanoid3d.js`, which builds a 25-bone `SkinnedMesh` with
automatic weights for the procedural character.

**Not implemented here:** auto-rigging an arbitrary mesh, skin-weight
painting, bone constraints, boolean/bevel/loop-cut, and MP4 without an
injected muxer. Parametric primitives and full PBR material properties
*were* added — colour had been the only reachable one.

**Before relying on it, read [docs/DEFECTS.md](docs/DEFECTS.md).** Most
pressing: autosave replays a lossy snapshot on every boot, so sculpted and
imported geometry can be silently replaced with a cube.

## Contributing

We welcome contributions to the Three.js Animation Engine! Here's how you can help:

### Getting Started
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Areas for Contribution
- **UI/UX Improvements**: Enhance the user interface and experience
- **Performance Optimization**: Improve rendering performance and memory usage
- **New Features**: pick anything from [Not implemented](#not-implemented) above
- **Bug Fixes**: Address issues in the issue tracker
- **Documentation**: Improve documentation and create tutorials
- **Testing**: Write tests to ensure code quality

### Code Style
- Follow the existing code style
- Use ES6+ features where appropriate
- Comment complex functionality
- Ensure responsive design for mobile devices

## Complex Methods Explained

### AnimationManager.createAnimationClip()
This method converts keyframe data into a Three.js AnimationClip that can be played by the AnimationMixer. It processes position, rotation, and scale keyframes separately, creating VectorKeyframeTracks and QuaternionKeyframeTracks as needed. The rotation keyframes are converted from Euler angles to quaternions to avoid gimbal lock issues.

```javascript
createAnimationClip(object, animation) {
    const uuid = object.uuid;
    const keyframes = animation.keyframes.get(uuid);
    
    if (!keyframes || keyframes.length === 0) {
        return null;
    }
    
    const tracks = [];
    
    // Process position keyframes
    const positionTimes = [];
    const positionValues = [];
    
    keyframes.forEach(kf => {
        if (kf.properties.position) {
            positionTimes.push(kf.time);
            positionValues.push(...kf.properties.position);
        }
    });
    
    if (positionTimes.length > 0) {
        tracks.push(new THREE.VectorKeyframeTrack(
            `${object.uuid}.position`,
            positionTimes,
            positionValues
        ));
    }
    
    // Similar process for rotation and scale...
    
    return new THREE.AnimationClip(animation.name, animation.duration, tracks);
}
```

### EditManager.handleSculpting()
This method implements real-time mesh deformation based on user interaction. It uses raycasting to determine the point of interaction and applies sculpting operations to vertices within a specified radius. Different sculpting tools (push, pull, smooth, etc.) modify vertex positions in different ways.

```javascript
handleSculpting(event, object) {
    // Raycast to find intersection point
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(mouse, this.sceneManager.camera);
    const intersects = raycaster.intersectObject(object);
    
    if (intersects.length === 0) return;
    
    const point = intersects[0].point;
    const face = intersects[0].face;
    
    // Get face normal in world space
    const normal = new THREE.Vector3();
    normal.copy(face.normal);
    normal.transformDirection(object.matrixWorld);
    
    // Modify vertices within sculpt radius
    const positions = object.geometry.attributes.position.array;
    const vertex = new THREE.Vector3();
    
    for (let i = 0; i < positions.length; i += 3) {
        vertex.set(positions[i], positions[i + 1], positions[i + 2]);
        vertex.applyMatrix4(object.matrixWorld);
        
        const distance = vertex.distanceTo(point);
        
        if (distance < this.sculptSize) {
            const influence = 1 - (distance / this.sculptSize);
            const strength = this.sculptStrength * influence * 0.1;
            
            // Apply sculpting based on selected tool
            if (this.sculptTool === 'push') {
                vertex.sub(normal.clone().multiplyScalar(strength));
            } else if (this.sculptTool === 'pull') {
                vertex.add(normal.clone().multiplyScalar(strength));
            }
            // Other tools...
            
            // Convert back to local space and update
            vertex.applyMatrix4(new THREE.Matrix4().getInverse(object.matrixWorld));
            positions[i] = vertex.x;
            positions[i + 1] = vertex.y;
            positions[i + 2] = vertex.z;
        }
    }
    
    // Update geometry
    object.geometry.attributes.position.needsUpdate = true;
    object.geometry.computeVertexNormals();
}
```

### SceneManager.importModel()
This method handles importing 3D models in GLTF format. It uses the Three.js GLTFLoader to parse the model data, adds it to the scene, and processes any animations included with the model.

```javascript
importModel(file, callback) {
    const reader = new FileReader();
    reader.onload = (event) => {
        const contents = event.target.result;
        
        const loader = new THREE.GLTFLoader();
        
        try {
            loader.parse(contents, '', (gltf) => {
                const model = gltf.scene;
                
                // Add model to scene
                this.addObject(model, file.name.replace(/\.[^/.]+$/, ""));
                
                // Process animations if available
                if (gltf.animations && gltf.animations.length > 0) {
                    gltf.animations.forEach((clip, index) => {
                        const animationName = clip.name || `Animation_${index + 1}`;
                        this.animationManager.createAnimation(animationName, clip.duration, 'repeat');
                        this.animationManager.animationClips.set(animationName, clip);
                    });
                }
                
                // Set up model properties
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        this.objects.set(child.uuid, child);
                        this.objectProperties.set(child.uuid, {
                            visible: true,
                            locked: false,
                            physicsEnabled: false
                        });
                    }
                });
                
                callback(true, model);
            }, (error) => {
                console.error('Error parsing GLTF:', error);
                callback(false, null);
            });
        } catch (error) {
            console.error('Error loading model:', error);
            callback(false, null);
        }
    };
    
    reader.readAsArrayBuffer(file);
}
```

## Basic Usage

### Creating a Simple Animation

1. **Create a Scene Object**
   ```javascript
   // Create a cube
   const cube = sceneManager.createCube("My Cube");
   sceneManager.selectObject(cube);
   ```

2. **Add Keyframes**
   ```javascript
   // Select or create an animation
   animationManager.createAnimation("Cube Animation", 5, "repeat");
   animationManager.selectAnimation("Cube Animation");
   
   // Add keyframes at different times
   animationManager.setCurrentTime(0);
   animationManager.addKeyframe(cube, 0, {
       position: [0, 0, 0],
       rotation: [0, 0, 0],
       scale: [1, 1, 1]
   });
   
   animationManager.setCurrentTime(2);
   cube.position.x = 5;
   animationManager.addKeyframe(cube, 2, {
       position: [5, 0, 0],
       rotation: [0, Math.PI, 0],
       scale: [1, 1, 1]
   });
   
   animationManager.setCurrentTime(4);
   cube.position.x = 0;
   animationManager.addKeyframe(cube, 4, {
       position: [0, 0, 0],
       rotation: [0, Math.PI * 2, 0],
       scale: [1, 1, 1]
   });
   ```

3. **Play the Animation**
   ```javascript
   animationManager.play();
   ```

### Adding Physics to an Object

```javascript
// Select an object
const sphere = sceneManager.createSphere("Bouncing Ball");
sceneManager.selectObject(sphere);

// Enable physics
const properties = sceneManager.getObjectProperties(sphere.uuid);
properties.physicsEnabled = true;
properties.mass = 1;
properties.restitution = 0.8; // Bounciness
sceneManager.setObjectProperties(sphere.uuid, properties);

// Add to physics world
physicsManager.addObject(sphere, properties);
```

### Sculpting a Mesh

```javascript
// Select a sculpting tool
editManager.setTool('sculpt');
editManager.setSculptTool('push');

// Adjust sculpting parameters
editManager.sculptSize = 0.8;
editManager.sculptStrength = 1.2;

// Perform sculpting (usually done through UI interaction)
// The handleSculpting method would be called during mouse/touch events
```

## Conclusion

jireX is two programs sharing one core: a 2D film pipeline that renders a
voiced, lipsynced, deterministic video from a JSON script, and the legacy
single-file 3D editor it grew out of. The core reads no clock, no DOM and no
RNG, which is what makes frame *N* a pure function of *N*, the whole render
loop testable in Node, and a second backend a backend rather than a rewrite.

The lists above are meant to stay honest in both directions: nothing is
claimed that is not wired up, and nothing that shipped is left looking
pending. [docs/STATUS.md](docs/STATUS.md) is the per-phase register and
[docs/DEFECTS.md](docs/DEFECTS.md) the defect one. Contributions welcome —
start from [Not implemented](#not-implemented).