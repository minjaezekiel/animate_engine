# Editor architecture: history, hotkeys, docking, onion skin, export

**Status: built.** `src/core/history/`, `src/editor/`, `src/render/onionSkin.js`,
`src/io/zip.js`, `src/render/sinks/PngSequenceSink.js`. Tests: `npm run test:editor`.

This covers the parts of an animation tool that are neither rendering nor
timeline maths — the ones a feature list names in one line each and that
take the rest of the program to get right.

---

## 1. Where each capability lives

A standard checklist for building animation software, against this engine.

| Capability | State | Where |
|---|---|---|
| Document + scene graph in memory | **done** | `core/scene/` — `Node`, `Scene`, `Transform2D`; cached world matrices, dirty-invalidated |
| Serialize to disk | **done** | `film.json` **is** the document format (`02-FILM-SCRIPT.md`). `validateFilm` is its schema check |
| Timeline + frame engine | **done** | `core/anim/` — `Track`, `Clip`, `Timeline`, `Evaluator`, `FrameClock`. Interpolated at sample time, not pre-densified |
| **Undo/redo stack** | **done** | `core/history/History.js` — §2 |
| 2D raster engine | **done** | `core/paint/` + the Rust kernels — 15 brushes, layers, 17 blend modes (`16-PAINT.md`) |
| 2D vector engine | **done** | SVG path data in, Bezier/fill/stroke out (`core/paint/path.js`, `backends/canvas2d/shapes.js`) |
| 3D viewport, matrices, shaders | **done** | `backends/three3d/` over Three.js; the legacy editor in `animateEngine.js` |
| Skinning, forward and inverse kinematics | **done** | `core/rig/IK2D.js` (2D, closed form + CCD), `deform.rs` `skin`/`morph` (3D) |
| **Dockable workspace** | **model built, not yet adopted** | `editor/dock.js` — §4 |
| Pen-tablet pressure | **done** | `input/StrokeRecorder.js` — coalesced events, tilt, derived pressure |
| Timeline scrubber | **done** | `studio.html`, driven by the keymap's frame-step commands |
| **Hotkey system** | **done** | `editor/keymap.js` — §3 |
| **Onion skinning** | **done** | `render/onionSkin.js` — §5 |
| Rigging and bones | **done** | the cutout part tree *is* the rig; `14-CHARACTER-3D.md` for 3D |
| Export: MP4 / WebM | **done** | `render/sinks/` — WebCodecs, then paced MediaRecorder (`04-RENDER-EXPORT.md`) |
| **Export: image sequence** | **done** | `render/sinks/PngSequenceSink.js` + `io/zip.js` — §6 |
| Export: GIF | **legacy only** | `animateEngine.js` has a tested GIF encoder; not ported to the new sinks — §7 |
| Export: glTF / FBX | **not built** | §7 |

---

## 2. Undo and redo

```js
const history = new History();
history.apply(film, set('scenes.0.shots.0.duration', 6, 'shot length'));
history.transaction(film, 'drag arm', (apply) => {
    for (const sample of gesture) apply(set(`...rot`, sample));
});
history.undo(film);
```

### Inverse patches, not snapshots

The three-line implementation keeps a stack of `JSON.stringify(document)`.
Both editors in this repository did that, and it is the wrong shape:

- **Cost is the document, not the edit.** Dragging a joint for two seconds
  at 60 Hz is 120 edits; against a 500 KB film that is 60 MB of garbage and
  120 full serialisations for 120 changed numbers. `DEFECTS.md` already
  lists the legacy editor's version — `markChanged` → `serializeProject()`
  → `localStorage.setItem` on *every mutation*.
- **A snapshot cannot say what it is undoing.** No label, so no "Undo move
  arm" in a menu and nothing useful in a log.
- **A snapshot is a dead end.** A patch is data: loggable, replayable,
  invertible, sendable to another client. The step to collaborative editing
  is a transport, not a rewrite.

So a command is a path, a new value, and the value that was there before.

### `MISSING` is not `undefined`

Undoing an insertion has to leave the key **absent**, not present and
`undefined`. `JSON.stringify` drops one and keeps the other, and
`validateFilm` reports the difference, so the distinction is real and
`getIn` returns a sentinel for it.

### Transactions, not time-based coalescing

A gesture must be one undo step. The usual trick merges commands touching
the same path within N milliseconds, which needs a clock — and `src/core/`
is not allowed one (`00-OVERVIEW.md`). It is also a guess: the true
boundaries of a drag are `pointerdown` and `pointerup`, which the caller
knows exactly. `transaction` takes them literally, and rolls back if the
body throws rather than leaving a half-applied gesture.

### A group reverts backwards

A later command in a group can depend on an earlier one, so undoing
forwards reverts into a state the command never saw. Two inserts into one
array is the smallest case that shows it.

### What the studio uses, and why it is not patches

`studio.html` records **whole-document** commands, because this editor's
edits genuinely are document-sized: committing a drag writes one action
object into `film.json`. The high-frequency part — the drag *preview* at
pointer rate — never touches `film` at all; it lives in a separate
`override` map. A keyframe editor dragging hundreds of keys is the consumer
that wants `set`/`splice` per key, and that is why the model is there.

Converting the page did find a real defect: `clearPoseBtn` called
`pushHistory()` **after** mutating `shot.actions`, so the snapshot captured
the already-edited document and undo for "clear pose" did nothing. Recording
from an explicit before-snapshot makes that ordering impossible to get
wrong, and `afterEdit` — the single exit every edit path already used — is
where the command is committed.

---

## 3. Hotkeys

```js
const keymap = new Keymap({
    'mod+z': 'undo', 'mod+shift+z': 'redo',
    space: { command: 'play', doc: 'Play / pause' },
    o: { command: 'toggle.onion', doc: 'Onion skin' },
});
keymap.attach(document, (command) => COMMANDS[command]?.() !== undefined);
```

A table rather than a chain of `if (ev.key === ...)`, because an animation
tool wants all four of these and a switch gives none:

- **`mod` is written once.** It resolves to Command on Apple platforms and
  Control elsewhere. Hard-coding `ev.ctrlKey` is the most common keymap bug
  there is, and on a Mac it ships an editor where undo does nothing.
- **A help overlay comes from the same source.** `describe()` is the
  switch's missing half, rendered with the platform's own symbols — a Mac
  user shown "Ctrl+Z" will press Ctrl+Z.
- **Rebinding is editing data.** Animators arrive with muscle memory from
  other packages.
- **Two commands on one chord throws at setup**, rather than becoming
  "sometimes the wrong thing happens".

**A keystroke inside a text field belongs to the field.** Without that rule
the letter `o` in a JSON editor toggles onion skin, which gets reported as
"the editor is haunted". `resolve` returns null for events from an input,
a textarea, a select or anything `contenteditable` — unless a binding is
marked `always`, which is what `mod+s` needs.

Chords normalise, so `shift+mod+Z` and `mod+shift+z` are one binding, and
`space`/`left`/`del` spell what `event.key` actually reports.

---

## 4. The dockable workspace

The **model** (`DockLayout`) is which panel sits in which region, in what
order, how big each region is and what is collapsed. It touches no DOM, so
it is tested in Node — and every interesting bug in a workspace is in the
model. `mountDock` is the thin half: move elements into region containers,
drag a header to another region, drag a splitter to resize.

### Four regions, not a split tree

Left, right, bottom, centre. An animation tool's panels want the same four
places every package puts them: tools and assets at the sides, timeline
along the bottom, stage in the middle. A general tree of nested splitters
is several times the code plus the drag affordances to go with it. The
model is a map from region to an ordered list, so a fifth region costs a
line — a split tree would have to replace it, which is the trade being made
knowingly.

### A saved layout must be reconciled, not trusted

This is the defect that makes home-grown docking systems infuriating. A
layout saved last month does not know about the panel shipped today, so the
new panel is **invisible** to every existing user and nothing in the UI
hints at why. The mirror image is a layout still listing a panel since
removed, leaving a gap or a null dereference.

`DockLayout.restore(key, knownPanels)` therefore drops unknown panels and
appends missing ones to their default region. Persistence is a convenience;
the code's idea of what panels exist is the truth. Corrupt JSON, a blocked
`localStorage` and a missing storage all fall back to the defaults rather
than throwing — a layout is never worth failing a boot over.

A region also cannot be dragged to nothing: below 120 px it stops, because
a zero-width region has an unfindable splitter and the panel is then
unrecoverable without clearing storage.

### What is and is not exercised

`DockLayout` is covered by tests. **`mountDock` is not yet used by any
page**: `studio.html` still has a fixed two-column layout, and converting
it is an HTML and CSS change rather than a wiring change — its side column
is one `<aside>` holding four logical panels with no headers to drag. So
the model, the reconciliation and the clamping are verified; the pointer
handling is not. That is stated here rather than implied, because "a
dockable workspace that nothing docks" is worth saying out loud.

This is the opposite of the other three modules in this document: history,
hotkeys and onion skinning all replaced live code in `studio.html` in the
same change, which is how the clear-pose undo defect surfaced.

---

## 5. Onion skinning

```js
const onion = new OnionSkin({ before: 2, after: 1, spacing: 0.25 });
onion.draw(ctx, { time: t, duration, render: (time) => {
    poseAt(time);
    backend.renderFrame(scene, cameraId);
    return backend.canvas();
} });
```

### The backend is never told that ghosting exists

Each ghost is produced by **the same renderer that produces the final
film**, posed at a different time and composited faint. The alternative — a
"ghost" flag threaded through the scene graph and honoured by every draw
call — would put a view concern inside the renderer, and then every new node
kind would have to remember to respect it. Worse, it would make what the
animator sees a different computation from what the film contains, which is
the one thing a reference view must not be.

### Three details that are the whole feature

**Past and future are tinted differently** — warm behind, cool ahead, the
desk convention. A stack of identical grey ghosts is unreadable the moment
there is more than one per side: a limb's direction of travel disappears.
The tint is applied through the ghost's own coverage with `source-atop`;
filling the frame washes the canvas and hides the drawing.

**Opacity falls off geometrically**, so the nearest ghost is clearly the
nearest and a long stack stays readable.

**Ghosts outside the film are dropped, not clamped.** Clamping stacks
several ghosts on frame 0, which composites to one dark frame and reads as
a rendering bug.

**Spacing is in seconds.** A ghost one frame away is nearly identical to
the current one and tells an animator nothing; what is wanted is a ghost a
*beat* away. It also means the view does not change meaning when the film's
fps does.

---

## 6. Image-sequence export

`PngSequenceSink` is the bottom rung of the export ladder in
`04-RENDER-EXPORT.md` and the only one that cannot fail for want of a
codec: no WebCodecs, no MediaRecorder, no muxer, no container negotiation.
If a browser can draw the film it can export it this way, and the archive
carries the `ffmpeg -framerate N -i %04d.png` line that finishes the job.

It is also the only export a compositor will take: "render to an image
sequence" is the normal hand-off to After Effects, Nuke or Resolve, because
it is lossless and frame-addressable.

**The canvas encodes its own PNG.** `toBlob('image/png')` is everywhere and
hardware-accelerated in most browsers. `io/png.js` is deliberately not used
here — it reaches for `node:zlib`, exactly the kind of dependency the
browser path must not grow. Two encoders for one format is right when one
of them is free.

**The ZIP is stored, not deflated** (`io/zip.js`). The payload is PNG,
which is already deflate; compressing it again typically *grows* the file
and would cost either a deflate implementation or `CompressionStream`,
which is not everywhere. Timestamps are zeroed, so the same frames produce
byte-identical archives and a determinism test can compare whole exports.
ZIP64 is not implemented and exceeding 4 GB **throws** rather than writing
a file that silently truncates.

**Memory is the real constraint.** The sink holds encoded PNGs, not frames:
a 1080p frame is 8.3 MB of RGBA and its PNG is a few hundred kilobytes, so
2,880 frames is of the order of a gigabyte rather than 24 — the difference
between finishing and not. It is still the heaviest sink here, so
`maxFrames` refuses *before* the render starts. A render that cannot
complete should say so in the first second, not the fourth minute.

---

## 7. What is not built

- **GIF from the new renderer.** `animateEngine.js` has a working, tested
  GIF encoder (palette + LZW) inside its UMD closure; it has not been
  extracted to a sink. WebM and MP4 cover delivery and PNG covers
  interchange, so this is a convenience, not a gap in capability.
- **glTF / FBX export.** `GLTFExporter` is already a verified dependency
  (`15-PERFORMANCE.md` §9) and is earmarked for the 3D save/load rework in
  `05-PHASES.md` Phase 3, where it replaces rebuilding geometry by type
  name. There is no browser FBX *exporter* to wire up at all.
- **`mountDock` is not wired into a page yet** (§4).
- **Floating and tabbed panels**, and arbitrary split trees (§4).
- **Rebinding UI.** The keymap is data and `describe()` renders it, but
  nothing yet lets a user edit and persist their own bindings.
- **Path-level commands in the 2D studio** (§2). The model supports them;
  the page does not need them yet.
- **No Rust here, deliberately.** Every module in this document is control
  flow, DOM or layout arithmetic — none of it is per-pixel. The one
  pixel-heavy candidate, GIF palette quantisation, is unbuilt for the
  reason above. Adding a kernel would buy a build step and nothing else;
  `15-PERFORMANCE.md` §3 is where measurement decides that, and it is the
  same rule that kept SIMD out of the blur.

---

## 8. Commands

```bash
npm run test:editor     # history, onion skin, keymap, dock, zip, sink
npm run test:studio     # headless Chrome: boot, pick, solve, write, undo, scrub
npm run audit:tests     # mutation audit across everything
```
