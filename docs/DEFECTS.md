# Defect register

Most of this register covers the legacy 3D engine (`animateEngine.js`). Every
entry was confirmed by reading the code, with line numbers from the state at
the time of writing. **None of the legacy defects block the 2D pipeline**,
which executes none of that code — that is why Phase 0 was built purely
additively.

[Defects found in the new code](#defects-in-the-new-code) are listed at the
end, with how they were found.

Dispositions:

- **fix** — needs a real repair, in the named phase
- **guard** — a cheap mitigation now, real fix later
- **superseded** — the new architecture deletes the code; repairing it would
  be work thrown away

---

## Data loss

### Autosave destroys sculpted meshes and imported models — **guarded in 0.5, fix (3)**

`importScene` reconstructs geometry from a type-name switch whose `default:`
is `createCube` (`:1115`), and sculpted vertex data is never serialized at
all. `restoreAutosave` (`:136`) replays the snapshot **on every boot**, and
`markChanged → serializeProject → localStorage.setItem` fires on **every
mutation**.

This is not a fidelity bug. Sculpting for an hour and reopening the tab
silently converts the work into a cube, with no user action. It is the worst
defect in the repository and the only one earning a mitigation before the
architectural work.

*Guard:* refuse to restore (or prompt) when a snapshot contains geometry that
cannot round-trip.
*Fix:* serialize geometry **parameters** rather than type names, serialize
sculpted vertex buffers, and store imported models as embedded GLB via
`GLTFExporter`.

### Hierarchy is lost on save/load — **fix (3)**

`exportScene` writes groups as `children: [uuid]`; `importScene` reads
`objectData.parent`, which is never written. Same function as above.

### Lights are never saved, listed, or clickable — **fix (3)**

`createLight` registers into `this.lights` only, never `this.objects`, while
`exportScene` (`:1016`) iterates `this.objects`. Consequences: lights are
absent from the project file, absent from the hierarchy panel, and not
pickable in the viewport.

### All lights collapse to point lights on import — **fix (3), one line**

`createLight(lightData.type.toLowerCase())` receives `"pointlight"` /
`"directionallight"`, which match no `case`, so every light falls to the
`default` branch.

---

## Broken behaviour

### Playback and all export are dead after any load or reload — **guarded in 0.5, superseded (3)**

`new THREE.AnimationMixer` is constructed in exactly one place, `addKeyframe`
(`:1438`). `importAnimation` and `applyProject` restore keyframes without ever
rebuilding mixers, and `prepareActions` (`:1341`) iterates `this.mixers`. So
after an autosave restore or a project load, Play and every export silently
animate nothing until a new keyframe is added.

**Do not fix this properly.** The repair is ~15 lines of mixer-lifecycle code
that Phase 3 deletes along with `mixers` entirely, and the bug is invisible to
the 2D path. A labelled throwaway `rebuildMixers()` in Phase 0.5 is the right
investment and no more — purely so the 3D editor is not embarrassing if
demonstrated before Phase 3.

### glTF-with-animation import throws — **fix (3), one line**

`importModel` (`:1182`) calls `this.animationManager`, a field `SceneManager`
never defines. Any glTF carrying animation clips raises a TypeError inside the
loader callback — exactly the files a rigging feature needs.

### WebM export drops frames and has the wrong length — **superseded (0)**

Realtime `captureStream(30)` with a wall-clock `setTimeout` stop, while
`AnimationManager.update` (`:1246`) advances by `clock.getDelta()`. Replaced by
`OfflineRenderer` + paced/WebCodecs sinks.

### A two-minute PNG sequence cannot complete — **superseded (0)**

`captureFrames` (`:4445`) retains both the raw RGBA **and** the PNG bytes of
every frame (~15 GB for 2 min at 1080p), never steps physics, hardcodes 10/15
fps, and only ever downscales. Replaced by the sink contract, which requires
`writeFrame` to consume and release.

### Transitions never appear in any export — **superseded (0)**

`applySceneTransition` (`:3810`) builds CSS-transitioned DOM overlays as
siblings of the canvas, so they are invisible to `captureStream` and to
offline capture alike. In the new pipeline transitions compile to scene-alpha
tracks, so every sink sees them by construction.

### Colour keyframes are dead data — **superseded (3)**

`addKeyframeBtn` stores `properties.color` (`:3085`) and
`createAnimationClip` builds no colour track, so it is never played back.
`PoseApplier` writes `material.color` directly, so this works with no new
feature code.

### Rotation ignores per-key interpolation — **superseded (3)**

The quaternion branch (`:1530`) never consults `interp`/`handles`, so stepped
and bezier rotation are impossible. The core evaluator interpolates at sample
time for every channel type.

### `loop: 'pingpong'` re-fires forever — **superseded (3)**

It flips `mixer.timeScale` but never reverses `currentTime` accumulation, so
the end-of-animation condition trips on every subsequent frame.

---

## Dead code

| Item | Disposition |
|---|---|
| `setCurve` / `getCurve` store data nothing reads; the curve modal's save handler is `// Save curve logic would go here` | delete (3) |
| `createTween` / `createTweenInstance` — unreachable, with empty `pause`/`stop`/`seek` bodies, and scalar arithmetic that yields `NaN` for vectors | delete (3) |
| `animationClips` is written at `:1186` and read nowhere | delete (3) |

---

## Performance and correctness in the editor

### Per-frame DOM churn in the render loop — **fix (5)**

`updateTransformGizmo` runs on every mousemove *and* every animation frame,
setting `innerHTML = ''` and recreating up to 7 nodes with fresh listeners.

### Gizmo drag maths is wrong — **fix (5)**

`handleDrag` (`:2550`) maps pixels to values with hardcoded `* 0.01` factors,
ignoring camera orientation, distance and projection. Dragging the Z handle is
driven by `dy`, so from a rotated view the object moves in a direction
unrelated to the screen. Plane handles (`xy`/`xz`/`yz`) are created and wired
but `handleDrag` has no branch for them, so they do nothing.

### Sculpt smooth brush is O(n²) per mousemove — **fix (5)**

`getVertexNeighbors` (`:2702`) scans every vertex with a distance threshold,
self-documented as *"a simplified approach — in a real implementation, you
would use the index buffer"*. Neighbours are proximity-based, not topological.

### History and autosave amplification — **fix (5)**

Every mutation triggers a full `serializeProject()` for the undo stack **and**
a `localStorage.setItem`. The stack holds 30 complete project serializations.

### Physics is coupled to display refresh rate — **fix (3)**

`world.step(1/60)` once per rendered frame with no accumulator, so simulation
runs at half speed on a 30 fps machine and double on a 120 Hz display.
Deleted objects also leave orphan bodies, because `removeObject` never calls
`physicsManager.removeObject`.

---

## Packaging

### CDN users get a stale build — **fixed (1)**

`animateEngine.min.js` predates `RigManager` and `CameraManager`, and
`package.json` points `unpkg`/`jsdelivr` at it. Anyone loading the package
from a CDN today gets an engine with no rigging. Phase 1 adds
`prepublishOnly: build` so this cannot recur.

---

## Defects in the new code

These are not legacy. Each was found by a test written to assert something
nobody had checked, and each is **fixed**.

### The PWA was never installable — **fixed (2)**

Every URL in a web manifest resolves against the **manifest's own location**,
not the page's. The manifest lives at `src/pwa/manifest.webmanifest` and
declared `"src": "src/pwa/icons/icon-192.png"`, which resolved to
`src/pwa/src/pwa/icons/icon-192.png` — a 404 for all three icons. `scope` and
`start_url` were relative too, so the declared scope collapsed to `src/pwa/`,
which does not contain the application.

Nothing in the page reports this. The manifest link loads, the icons 404
quietly, and the install prompt simply never appears.

*Fix:* icon paths relative to the manifest (`icons/...`), `scope` and
`start_url` pointed back at the root with `../../`.

### The service worker controlled nothing — **fixed (2)**

A service worker's default scope is **its own directory**, and a static host
sends no `Service-Worker-Allowed` header to widen it. Registering
`src/pwa/sw.js` therefore succeeded, resolved its `'./film.html'` shell asset
to the non-existent `src/pwa/film.html`, and intercepted no request the
application ever makes. The offline story in `CDN-AND-PWA.md` had never run.

*Fix:* `sw.js` moved to the repository root — the only place it can work from.
Its `./` shell paths are now correct by construction, and `studio.html` plus
`src/core/index.js` were added to the precache list.

### An editor drag snapped back on release — **fixed (2)**

`studio.html` wrote a dragged pose as an action starting **at** the playhead
with a `for` ramp, so at the playhead the channel still held its previous
value: you let go and the character returned to where it was, with your pose
sitting 0.4 s in the future.

*Fix:* a drag eases **in to** the playhead — the action is written at
`t - for` and arrives at `t`. Asserted in `test/e2e/studio.mjs`, which checks
the written action's arrival time, not just that an action was written.

---

## Not defects, but worth knowing

- `RigManager` discovers bones and morphs in imported glTF and can pose a bone
  chain with one-shot CCD, but it **constructs nothing**: there is no
  `THREE.Bone`, `Skeleton` or `SkinnedMesh` anywhere, no skin weights and no
  auto-rig. Bones are also unpickable in the viewport, having no geometry.
- Colour is the **only** editable material property.
- All six primitives have hardcoded dimensions; the MCP `create_object` tool
  cannot pass a size.
- `README.md` is stale in both directions — it claims IK, bones and morphs are
  future work when `RigManager` exists.
- 2D IK solves against the chain's **rest pose**, so an animated torso moves
  the shoulder out from under the solve. Measured at **2.3 px** on the demo
  film with a `breathe` cycle running. Sampling the live world matrix at solve
  time would fix it and would make compilation order-dependent; not worth it
  at two pixels. Noted in `IK2D.js` as a `ponytail:` ceiling.
