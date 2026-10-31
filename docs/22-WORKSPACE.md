# The workspace: making the tools findable

**Status: design.** Implementation state lives in [STATUS.md](STATUS.md).

The engine's capability list and the engine's *usable surface* have drifted
apart. `18-EDITOR-ARCHITECTURE.md` lists fifteen capabilities as **done**, and
most of them are: history, hotkeys, onion skin, docking, PNG sequence export,
a fifteen-brush paint layer, IK, swap sets. A person opening `studio.html`
can reach perhaps a third of them.

That is not a UI complaint. It is the measurable problem that **a feature
nothing can call is indistinguishable from a feature that does not exist** —
which is exactly how MP4 export sat "done" for months behind an unfilled
`muxerFactory` seam (Phase 27), and how `PngSequenceSink` was fully built and
tested while missing from the export block that would let anything import it.

## 1. What is actually unreachable

| Capability | Built in | Reachable from the UI? |
|---|---|---|
| Dockable workspace | `editor/dock.js`, tested | **No.** No page has a `data-dock-region`. |
| Paint layer, 15 brushes | `core/paint/` | **No.** `studio.html` has no paint tool. |
| Onion skin | `render/onionSkin.js` | Only via a hotkey, with no indicator |
| Swap sets | `core/script/` | Only by hand-editing JSON |
| PNG sequence export | `render/sinks/` | **No.** |
| Undo/redo | `core/history/` | Yes — two buttons |
| IK | `core/rig/IK2D.js` | Yes — dragging |
| Timeline / exposure | `core/anim/` | A scrubber. No track view, no keys. |

`editor/dock.js` declares exactly the four regions a drawing application
needs, and nothing mounts it:

```js
export const REGIONS = ['left', 'center', 'right', 'bottom'];
```

## 2. The arrangement

Adobe Animate's layout is the reference the user named, and it is the right
one to copy because it is what the audience already has in their hands. It is
also a close fit to the regions that already exist.

```
┌──────────────────────────────────────────────────────────────┐
│  menu bar        File  Edit  View  Insert  Modify  Control    │
├────┬────────────────────────────────────────────┬────────────┤
│ T  │                                            │  Library   │
│ o  │                 STAGE                      │  (cast,    │
│ o  │           the film, framed                 │  drawings, │
│ l  │                                            │  assets)   │
│ s  │                                            ├────────────┤
│    │                                            │ Properties │
│    │                                            │ (selection)│
├────┴────────────────────────────────────────────┴────────────┤
│  TIMELINE   layers × frames, keys, holds, exposure, onion     │
└──────────────────────────────────────────────────────────────┘
  left            center                            right
                      bottom
```

Mapping: tools → `left`, stage → `center`, library and properties → `right`,
timeline → `bottom`. One `mountDock` call, four `data-dock-region` divs, and
the panel layout is persisted and rearrangeable for free, because that half
is built and tested already.

## 3. The timeline is the feature, not the dock

The dock is a day's work. The timeline panel is the part that matters, and it
is the one thing in this document with no existing implementation to mount.

An animation timeline is **layers down, frames across**, and each cell is one
of four things: empty, a keyframe, a held frame, or the end of a span. That
is the view `core/anim/Track` already holds the data for — `Track` has keys at
times, and `Timeline` has clips. Nothing renders them.

It must show, because `21-DRAWN-ANIMATION.md` depends on it:

- **exposure** — how many frames each drawing holds, which is the X-sheet
  from §3.2 of that document, in its native form
- **onion skin** range, as a dragged span rather than a hotkey toggle
- **holds** as distinct from interpolated spans, because that distinction is
  the entire difference between the animation types in §2 of that document

## 4. The rule this follows

**No new capability is introduced here.** Every panel is a surface over
something already built and tested. The dock model, history, keymap, onion
skin, paint, sinks and the evaluator are untouched; the work is the DOM that
calls them, plus the timeline view.

That keeps the risk where it belongs. A workspace that breaks the renderer
would be a bad trade for findability, so the workspace gets no privileged
access: it drives the same `film.json` document and the same ops table the
MCP server drives. If a panel can do something the op table cannot, the op
table is what is missing.

## 5. What this will not do

- **Not a second editor.** `animateEngine.js`, the legacy single-file 3D
  editor, stays untouched. Adding a third UI to a repository with two is how
  this problem started.
- **Not a rewrite of `studio.html`'s posing.** The IK dragging works; it
  becomes a tool in the toolbar rather than the whole program.
- **Not menus for their own sake.** A menu bar that mostly contains greyed-out
  items advertises absence. Items appear as the ops behind them land.
