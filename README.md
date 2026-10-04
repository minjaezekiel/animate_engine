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
- **Video out** with audio muxed, as WebM today — no dependencies at all on
  the 2D path.
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
- Pixel output is not bit-reproducible between runs (scene state is).
- The 3D engine has real defects, including autosave data loss — see
  [docs/DEFECTS.md](docs/DEFECTS.md) before relying on it.

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

**What `RigManager` actually does:** it *discovers* bones and morph targets in
imported glTF, shows a `SkeletonHelper`, poses a bone chain with one-shot CCD,
and sets morph influences. It **constructs nothing** — there is no
`THREE.Bone`, `Skeleton` or `SkinnedMesh` anywhere, no skin weights and no
auto-rig. (Earlier versions of this README were wrong in both directions
about this.)

**Not implemented:** skinning, auto-rigging, bone constraints, retargeting,
FBX/Mixamo import, boolean/extrude/bevel, PBR material properties beyond
colour, MP4 export, animation blending, collaboration.

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
- **New Features**: Implement missing features like advanced materials, undo/redo system
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

## Future Development

### AI Text-to-Prompt Animation Generation
We plan to implement an AI-powered text-to-prompt system that will allow users to generate animations through natural language descriptions. This feature will:

1. Parse user input to understand animation requirements
2. Generate appropriate 3D scenes and objects based on the description
3. Create plausible animations that match the user's intent
4. Provide options for refinement and customization

Example: A user might type "A bouncing ball that changes color when it hits the ground," and the system would generate a scene with a ball, apply physics properties, create keyframes for the bouncing motion, and add color change animations at impact points.

### Planned Features

1. **Advanced Animation Tools**
   - Inverse kinematics for character animation
   - Bone rigging and skinning system
   - Morph targets for facial animation
   - Animation blending and layering

2. **Enhanced Materials and Textures**
   - PBR (Physically Based Rendering) materials
   - Texture painting tools
   - Procedural texture generation
   - UV mapping tools

3. **Improved Modeling Tools**
   - Boolean operations
   - Bevel and extrude tools
   - Subdivision surface modeling
   - Parametric modeling

4. **Visual Effects**
   - Particle systems
   - Fluid simulation
   - Cloth simulation
   - Post-processing effects

5. **Collaboration Features**
   - Real-time multi-user editing
   - Version control system
   - Cloud storage integration
   - Comment and review system

6. **Performance Enhancements**
   - WebGL 2.0 support
   - WebAssembly integration for heavy computations
   - Level of detail (LOD) systems
   - Occlusion culling

7. **Export Options**
   - Video export with encoding
   - GIF export with optimization
   - WebGL application export
   - 3D model export in multiple formats

8. **Integration Capabilities**
   - Plugin system for extensibility
   - API for external application integration
   - VR/AR support
   - Import/export to professional animation formats

## Conclusion

The Three.js Animation Engine provides a solid foundation for browser-based 3D animation creation. While it already offers a comprehensive set of features for basic animation and modeling tasks, there are many opportunities for enhancement and expansion. We welcome contributions from the community to help realize the full potential of this project and make it a powerful tool for 3D animation on the web.