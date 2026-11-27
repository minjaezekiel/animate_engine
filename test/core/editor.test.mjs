/**
 * The editor architecture: history, onion skin, hotkeys, docking, export.
 *
 *   npm run test:editor
 *
 * These are the pieces an animation tool needs that are not rendering or
 * timeline maths, and the reason they are in `src/` with tests rather than
 * inline in a page is that every one of them has a failure mode that a
 * click-through would not find: an undo that costs the whole document, a
 * ghost frame that is also the final frame, a hotkey that fires while
 * someone is typing, a saved layout that hides a panel shipped later.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { History, set, remove, splice, getIn, setIn, keysOf, MISSING }
    from '../../src/core/history/History.js';
import { OnionSkin, DEFAULT_TINT, ghostMask, castRoots }
    from '../../src/render/onionSkin.js';
import { Keymap, chordOf, normalizeChord, isTyping } from '../../src/editor/keymap.js';
import { DockLayout, REGIONS } from '../../src/editor/dock.js';
import { zipBytes, crc32 } from '../../src/io/zip.js';
import { PngSequenceSink } from '../../src/render/sinks/PngSequenceSink.js';

// =====================================================================
// history
// =====================================================================

const film = () => ({
    meta: { title: 'T', fps: 24 },
    scenes: [{ id: 's1', shots: [{ id: 'a', duration: 4 }, { id: 'b', duration: 3 }] }],
});

test('paths read and write, and a missing key is not undefined', () => {
    const doc = film();
    assert.equal(getIn(doc, 'scenes.0.shots.1.duration'), 3);
    assert.equal(getIn(doc, 'scenes.0.shots.9.duration'), MISSING);
    // The distinction matters: `undefined` is a value a document can hold
    // and `JSON.stringify` drops, so undo has to know which it is putting
    // back or the result fails schema validation.
    assert.equal(getIn({ a: undefined }, 'a'), undefined);
    assert.deepEqual(keysOf('scenes.0.shots'), ['scenes', 0, 'shots']);
    assert.deepEqual(keysOf(['a.b', 'c']), ['a.b', 'c']);
});

test('setIn builds the containers the path implies', () => {
    const doc = {};
    // A numeric key means an array, anything else an object -- otherwise
    // `scenes.0` makes `{ "0": ... }` and every later index lookup fails.
    setIn(doc, 'scenes.0.shots.0.duration', 4);
    assert.ok(Array.isArray(doc.scenes));
    assert.ok(Array.isArray(doc.scenes[0].shots));
    assert.equal(doc.scenes[0].shots[0].duration, 4);
});

test('undo and redo restore exactly, including an absent key', () => {
    const doc = film();
    const h = new History();
    h.apply(doc, set('meta.step', 2, 'on twos'));
    assert.equal(doc.meta.step, 2);
    assert.equal(h.undoLabel, 'on twos');

    h.undo(doc);
    // Not `undefined`: the key was absent before, so it must be absent
    // after. This is the whole reason MISSING exists.
    assert.ok(!('step' in doc.meta), `left ${JSON.stringify(doc.meta)}`);
    h.redo(doc);
    assert.equal(doc.meta.step, 2);
});

test('a transaction is one undo step, and rolls back on a throw', () => {
    const doc = film();
    const h = new History();
    h.transaction(doc, 'drag', (apply) => {
        for (const v of [1, 2, 3, 4, 5]) apply(set('scenes.0.shots.0.duration', v));
    });
    assert.equal(doc.scenes[0].shots[0].duration, 5);
    assert.equal(h.past.length, 1, 'a gesture became more than one undo step');
    h.undo(doc);
    assert.equal(doc.scenes[0].shots[0].duration, 4, 'undo did not reach the start of the drag');

    // A throw halfway must not leave the document in a state no command
    // describes -- the whole group goes back.
    assert.throws(() => h.transaction(doc, 'bad', (apply) => {
        apply(set('meta.title', 'X'));
        throw new Error('nope');
    }), /nope/);
    assert.equal(doc.meta.title, 'T');
    assert.equal(h.past.length, 0);
});

test('a group reverts in reverse order', () => {
    // A later command can depend on an earlier one, so undoing forwards
    // reverts into a state the command never saw.
    const doc = { list: ['a'] };
    const h = new History();
    h.transaction(doc, 'two inserts', (apply) => {
        apply(splice('list', 1, 0, ['b']));
        apply(splice('list', 2, 0, ['c']));
    });
    assert.deepEqual(doc.list, ['a', 'b', 'c']);
    h.undo(doc);
    assert.deepEqual(doc.list, ['a']);
});

test('splice puts a removed item back where it was, not at the end', () => {
    const doc = film();
    const h = new History();
    h.apply(doc, splice('scenes.0.shots', 0, 1));
    assert.deepEqual(doc.scenes[0].shots.map((s) => s.id), ['b']);
    h.undo(doc);
    assert.deepEqual(doc.scenes[0].shots.map((s) => s.id), ['a', 'b'],
        'the shot came back in the wrong position');
});

test('a new edit discards the redo branch', () => {
    const doc = film();
    const h = new History();
    h.apply(doc, set('meta.title', 'A'));
    h.undo(doc);
    assert.ok(h.canRedo);
    h.apply(doc, set('meta.title', 'B'));
    assert.ok(!h.canRedo, 'offering to redo a change that no longer applies');
});

test('history is bounded, and reports what it would undo', () => {
    const doc = film();
    const h = new History({ limit: 3 });
    for (const v of [1, 2, 3, 4, 5]) h.apply(doc, set('meta.fps', v, `fps ${v}`));
    assert.equal(h.past.length, 3);
    assert.equal(h.undoLabel, 'fps 5');
    // The oldest entries are gone, so undoing everything available does
    // not reach the original value -- which is what a limit means.
    while (h.canUndo) h.undo(doc);
    assert.equal(doc.meta.fps, 2);
});

test('remove is undoable, and onChange fires', () => {
    const doc = film();
    let changes = 0;
    const h = new History({ onChange: () => changes++ });
    h.apply(doc, remove('meta.fps'));
    assert.ok(!('fps' in doc.meta));
    h.undo(doc);
    assert.equal(doc.meta.fps, 24);
    assert.equal(changes, 2);
});

// =====================================================================
// onion skin
// =====================================================================

test('ghost times are offsets in seconds, nearest painted last', () => {
    const onion = new OnionSkin({ before: 3, after: 2, spacing: 0.25 });
    const frames = onion.frames({ time: 2, duration: 10 });
    assert.equal(frames.length, 5);
    // Furthest first: they overlap, and the one closest to now must win.
    const distances = frames.map((f) => Math.abs(f.offset));
    assert.deepEqual(distances, [...distances].sort((a, b) => b - a));
    // Opacity falls off geometrically, so a long stack stays readable.
    const nearest = frames[frames.length - 1];
    assert.ok(nearest.alpha > frames[0].alpha * 2);
    assert.deepEqual([...new Set(frames.map((f) => f.side))].sort(), ['after', 'before']);
});

test('ghosts outside the film are dropped, not clamped', () => {
    // Clamping would stack several ghosts on frame 0, which composites to
    // one dark frame and reads as a rendering bug.
    const onion = new OnionSkin({ before: 3, after: 3, spacing: 0.5 });
    const frames = onion.frames({ time: 0.6, duration: 1.2 });
    assert.ok(frames.every((f) => f.time >= 0 && f.time <= 1.2));
    assert.equal(frames.length, 2, `got ${JSON.stringify(frames.map((f) => f.time))}`);
});

test('a time ghost is clamped to the shot, not to the film', () => {
    // The 2D plan model got this in 55db3e7; `frames()` is the sibling
    // caller and still clamped to [0, duration], so a 3D ghost one frame
    // after a cut showed a frame of the previous shot -- another camera on
    // another set, which is exactly what onion skin must not show.
    const onion = new OnionSkin({ before: 3, after: 3, spacing: 0.5 });
    const film = onion.frames({ time: 2.1, duration: 10 });
    const shot = onion.frames({ time: 2.1, duration: 10, within: [2, 4] });
    assert.equal(film.length, 6);
    assert.ok(film.some((f) => f.time < 2), 'the film-clamped ghosts never crossed the cut');
    assert.deepEqual(shot.map((f) => Number(f.time.toFixed(2))), [3.6, 3.1, 2.6],
        'kept a ghost from before the cut, or dropped one inside the shot');
    // Dropped, not stacked on the boundary: three on one spot is one dark
    // frame and reads as a bug rather than as the start of a shot.
    assert.ok(shot.every((f) => f.time >= 2 && f.time < 4));
});

test('onion skin renders through the real renderer and restores alpha', () => {
    // The point of the design: the backend is never told that ghosting
    // exists, so what the animator sees is the same computation as the film.
    const calls = [];
    const ops = [];
    const ctx = {
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        fillStyle: null,
        save() { ops.push('save'); },
        restore() { ops.push('restore'); },
        drawImage() { ops.push(`draw@${this.globalAlpha.toFixed(3)}`); },
        fillRect() { ops.push(`tint:${this.fillStyle}@${this.globalCompositeOperation}`); },
    };
    const onion = new OnionSkin({ before: 1, after: 1, spacing: 0.2 });
    const drawn = onion.draw(ctx, {
        render: (time) => { calls.push(Number(time.toFixed(3))); return { width: 8, height: 8 }; },
        time: 1, duration: 5,
    });

    assert.equal(drawn, 2);
    assert.deepEqual(calls, [0.8, 1.2]);
    assert.equal(ctx.globalAlpha, 1, 'left the target context at a ghost alpha');
    // The tint is applied through the ghost's own coverage; filling the
    // whole frame would wash the canvas and hide the drawing.
    assert.ok(ops.includes(`tint:${DEFAULT_TINT.before}@source-atop`), ops.join(' '));
    assert.ok(ops.includes(`tint:${DEFAULT_TINT.after}@source-atop`), ops.join(' '));

    assert.equal(new OnionSkin({ enabled: false }).draw(ctx, { render: () => null, time: 1 }), 0);
});

/**
 * The tint, at full strength.
 *
 * Tinting in place draws the ghost at its falloff opacity and then washes
 * 55% of that over it, which reads on a mid-tone rig and does not on dark
 * ink: the 2D film probe measured R-B of **6** on a black subject against
 * the 3D path's 24 on a white one, and a stack of identically dark ghosts
 * hides the direction of travel. Given an offscreen canvas, the ghost's ink
 * becomes the tint colour instead and the whole thing carries the falloff
 * -- a faint red line rather than a black line with a hint of red. The same
 * probe then measured 59.
 */
test('a scratch canvas recolours the ghost instead of washing it', () => {
    const ops = [];
    const mk = (name) => ({
        globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: null,
        clearRect() { ops.push(`${name}:clear`); },
        drawImage() { ops.push(`${name}:draw@${this.globalAlpha.toFixed(3)}`); },
        fillRect() { ops.push(`${name}:tint:${this.fillStyle}@${this.globalCompositeOperation}`
            + `@${this.globalAlpha.toFixed(3)}`); },
    });
    const ctx = mk('out');
    const sctx = mk('scratch');
    const onion = new OnionSkin({ before: 1, after: 1, spacing: 0.2 });
    const drawn = onion.draw(ctx, {
        render: () => ({ width: 8, height: 8 }),
        time: 1, duration: 5, width: 8, height: 8, scratch: { getContext: () => sctx },
    });

    assert.equal(drawn, 2);
    // The ghost goes onto the scratch at FULL opacity and the tint covers
    // its own coverage at full strength...
    assert.ok(ops.includes('scratch:draw@1.000'), ops.join(' '));
    assert.ok(ops.includes(`scratch:tint:${DEFAULT_TINT.before}@source-atop@1.000`), ops.join(' '));
    assert.ok(ops.includes(`scratch:tint:${DEFAULT_TINT.after}@source-atop@1.000`), ops.join(' '));
    // ...and only the finished, recoloured ghost carries the falloff.
    assert.ok(ops.some((o) => o.startsWith('out:draw@0.280')), ops.join(' '));
    assert.ok(!ops.some((o) => o.startsWith('out:tint')), 'nothing is tinted on the target');
    assert.equal(ctx.globalAlpha, 1);
});

/**
 * The 3D surface. `draw` assumes what a 2D canvas gives it -- transparency
 * where nothing was drawn -- so a ghost under the live frame is still
 * visible around it. A 3D render is opaque, and the first run of
 * `test/e2e/onion-3d.mjs` measured the consequence exactly: four ghosts
 * reported, one cluster on screen, every one of them buried under the
 * background of the frame in front.
 */
test('drawLit adds ghosts OVER an opaque frame, and tints them before adding', () => {
    const ops = [];
    const mk = () => ({
        globalAlpha: 1, globalCompositeOperation: 'source-over', fillStyle: null,
        clearRect() { ops.push('clear'); },
        drawImage() { ops.push(`draw@${this.globalAlpha.toFixed(3)}:${this.globalCompositeOperation}`); },
        fillRect() { ops.push(`tint:${this.fillStyle}@${this.globalCompositeOperation}`); },
    });
    const ctx = mk();
    const sctx = mk();
    const scratch = { getContext: () => sctx };
    const onion = new OnionSkin({ before: 1, after: 1, spacing: 0.2 });
    const drawn = onion.drawLit(ctx, {
        render: () => ({ width: 8, height: 8 }),
        time: 1, duration: 5, width: 8, height: 8, scratch,
    });

    assert.equal(drawn, 2);
    // Additive, so a black background contributes nothing and only the lit
    // pixels of a ghost brighten the frame already underneath.
    assert.ok(ops.some((o) => o.endsWith(':lighter')), ops.join(' '));
    // Multiplied, not `source-atop`: the destination is opaque everywhere,
    // so an atop fill would wash the whole frame rather than the drawing.
    assert.ok(ops.includes(`tint:${DEFAULT_TINT.before}@multiply`), ops.join(' '));
    assert.ok(ops.includes(`tint:${DEFAULT_TINT.after}@multiply`), ops.join(' '));
    assert.ok(!ops.some((o) => o.includes('source-atop')));
    // And it hands the context back as it found it, or the next thing drawn
    // on this frame is drawn additively at a ghost's opacity.
    assert.equal(ctx.globalAlpha, 1);
    assert.equal(ctx.globalCompositeOperation, 'source-over');
});

test('drawLit still chooses its times with the shared logic', () => {
    const calls = [];
    const ctx = { globalAlpha: 1, globalCompositeOperation: 'source-over',
                  drawImage() {}, fillRect() {}, clearRect() {} };
    const onion = new OnionSkin({ before: 2, after: 1, spacing: 0.25, tint: null });
    onion.drawLit(ctx, {
        render: (t) => { calls.push(Number(t.toFixed(3))); return { width: 1, height: 1 }; },
        time: 1, duration: 5, width: 1, height: 1,
    });
    // Furthest first, so the nearest ghost lands on top of the further
    // ones; the two at equal distance keep their own order.
    assert.deepEqual(calls, [0.5, 0.75, 1.25]);
    // A ghost whose render returned nothing is not on screen, so it is not
    // counted: a view that reports three ghosts over a frame with one is
    // lying about itself.
    assert.equal(onion.drawLit(ctx, { render: () => null, time: 1, width: 1, height: 1 }), 0);
    assert.equal(new OnionSkin({ enabled: false })
        .drawLit(ctx, { render: () => null, time: 1, width: 1, height: 1 }), 0);
});

// =====================================================================
// hotkeys
// =====================================================================

const ev = (over) => ({ key: 'z', target: { tagName: 'DIV' }, ...over });

test('mod is the platform accelerator, written once', () => {
    // Hard-coding ctrlKey is the most common keymap bug there is, and on a
    // Mac it produces an editor where undo does nothing.
    const bindings = { 'mod+z': 'undo', 'mod+shift+z': 'redo' };
    const mac = new Keymap(bindings, { apple: true });
    const pc = new Keymap(bindings, { apple: false });

    assert.equal(mac.resolve(ev({ metaKey: true })), 'undo');
    assert.equal(mac.resolve(ev({ ctrlKey: true })), null, 'ctrl acted as mod on a Mac');
    assert.equal(pc.resolve(ev({ ctrlKey: true })), 'undo');
    assert.equal(pc.resolve(ev({ metaKey: true })), null);
    assert.equal(mac.resolve(ev({ metaKey: true, shiftKey: true })), 'redo');
});

test('chords normalise, so modifier order and spelling do not matter', () => {
    assert.equal(normalizeChord('shift+mod+Z'), 'mod+shift+z');
    assert.equal(normalizeChord('Cmd+Z'), 'mod+z');
    assert.equal(normalizeChord('ctrl+alt+Delete'), 'ctrl+alt+delete');
    assert.equal(normalizeChord('Space'), ' ');
    assert.equal(normalizeChord('left'), 'arrowleft');
    // A trailing '+' is the plus key, which splitting on '+' would eat.
    assert.equal(normalizeChord('mod++'), 'mod++');
    assert.equal(normalizeChord('mod+plus'), 'mod++');
    assert.throws(() => normalizeChord('hyper+z'), /unknown modifier/);
    assert.equal(chordOf({ key: 'ArrowLeft' }, { apple: false }), 'arrowleft');
});

test('a keystroke in a text field belongs to the field', () => {
    const keys = new Keymap({ o: 'toggle.onion', 'mod+s': { command: 'save', always: true } },
                            { apple: false });
    assert.equal(keys.resolve(ev({ key: 'o' })), 'toggle.onion');
    for (const tagName of ['INPUT', 'TEXTAREA', 'SELECT']) {
        assert.equal(keys.resolve(ev({ key: 'o', target: { tagName } })), null, tagName);
    }
    assert.equal(keys.resolve(ev({ key: 'o', target: { tagName: 'DIV', isContentEditable: true } })), null);
    // `always` is the exception that mod+s needs.
    assert.equal(keys.resolve(ev({ key: 's', ctrlKey: true, target: { tagName: 'TEXTAREA' } })), 'save');
    assert.ok(isTyping({ tagName: 'input' }));
    assert.ok(!isTyping(null));
});

test('two commands on one chord is a setup error, not a surprise at use', () => {
    const keys = new Keymap({ 'mod+z': 'undo' });
    assert.throws(() => keys.bind('mod+z', 'delete'), /already bound to "undo"/);
    keys.bind('shift+mod+z', 'undo');        // rebinding the same command is fine
    keys.unbind('mod+z');
    assert.equal(keys.resolve(ev({ metaKey: true, ctrlKey: true })), null);
});

test('describe lists every binding with the platform symbol', () => {
    // The hand-written help list beside a hand-written switch is what
    // drifts; this is the switch's missing half.
    const mac = new Keymap({ 'mod+z': 'undo' }, { apple: true }).describe();
    assert.equal(mac[0].label, '⌘z');
    const pc = new Keymap({ 'mod+z': 'undo' }, { apple: false }).describe();
    assert.equal(pc[0].label, 'Ctrl+z');
});

// =====================================================================
// docking
// =====================================================================

const PANELS = { tools: 'left', inspector: 'right', timeline: 'bottom', stage: 'center' };

test('a saved layout is reconciled against the panels that exist', () => {
    // The defect that makes home-grown docking infuriating: a layout saved
    // last month does not know about the panel shipped today, so the new
    // panel is invisible and nothing hints at why.
    const stale = new DockLayout({ panels: { left: ['tools', 'retired'], bottom: ['timeline'] } });
    stale.reconcile(PANELS);
    assert.deepEqual(stale.order('left'), ['tools'], 'a removed panel survived');
    assert.equal(stale.regionOf('inspector'), 'right', 'a new panel was not placed');
    assert.equal(stale.regionOf('stage'), 'center');
    assert.equal(stale.regionOf('retired'), null);
});

test('moving a panel removes it from where it was', () => {
    // A panel in two regions is two elements with one id, and the DOM
    // resolves that by silently showing one of them.
    const layout = new DockLayout().reconcile(PANELS);
    layout.move('timeline', 'right', 0);
    assert.deepEqual(layout.order('bottom'), []);
    assert.deepEqual(layout.order('right'), ['timeline', 'inspector']);
    assert.equal(layout.regionOf('timeline'), 'right');
    assert.throws(() => layout.move('timeline', 'floating'), /unknown dock region/);
});

test('a region cannot be dragged to nothing', () => {
    // Zero width makes the splitter unfindable and the panel unrecoverable
    // without clearing storage.
    const layout = new DockLayout();
    layout.resize('left', -50);
    assert.ok(layout.sizes.left >= 120);
    layout.resize('center', 400);
    assert.equal(layout.sizes.center, undefined, 'the stage got a splitter size');
});

test('layout persistence survives junk and a missing storage', () => {
    const store = { value: null, getItem() { return this.value; }, setItem(k, v) { this.value = v; } };
    const layout = new DockLayout().reconcile(PANELS);
    layout.move('inspector', 'left').toggleCollapse('timeline').resize('bottom', 260);
    layout.save('k', store);

    const back = DockLayout.restore('k', PANELS, store);
    assert.deepEqual(back.order('left'), ['tools', 'inspector']);
    assert.ok(back.isCollapsed('timeline'));
    assert.equal(back.sizes.bottom, 260);

    // Corrupt or absent storage must give the defaults, not throw: a
    // layout is a convenience and is never worth failing a boot over.
    const junk = DockLayout.restore('k', PANELS, { getItem: () => '{oh no' });
    assert.equal(junk.regionOf('tools'), 'left');
    assert.equal(DockLayout.restore('k', PANELS, null).regionOf('stage'), 'center');
    new DockLayout().save('k', { setItem() { throw new Error('private mode'); } });
    assert.deepEqual(REGIONS, ['left', 'center', 'right', 'bottom']);
});

// =====================================================================
// image-sequence export
// =====================================================================

test('the archive is a real zip: signatures, CRCs, and reproducible', () => {
    const data = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);
    const bytes = zipBytes([{ name: 'frames/0000.png', data }, { name: 'frames/0001.png', data }]);
    assert.deepEqual([...bytes.slice(0, 4)], [0x50, 0x4B, 0x03, 0x04]);
    assert.deepEqual([...bytes.slice(-22, -18)], [0x50, 0x4B, 0x05, 0x06]);
    // Two entries in the end-of-central-directory record.
    assert.equal(bytes[bytes.length - 14], 2);
    assert.equal(crc32(data) >>> 0, 0x7a0709a4);

    // Timestamps are zeroed, so the same frames give the same bytes --
    // which is what lets a determinism test compare whole exports.
    assert.deepEqual([...zipBytes([{ name: 'a', data }])], [...zipBytes([{ name: 'a', data }])]);
    // The 4GB guard has to refuse *before* the data is coerced, because
    // `new Uint8Array(somethingHuge)` tries to allocate it and the process
    // is wedged before any guard behind it runs. This entry's data throws
    // the moment anything reads it, so a guard in the wrong place fails
    // this assertion in microseconds -- where a plain `{length: 2**32}`
    // would simply hang, and a hang is not a test result.
    const untouchable = {
        length: 0x100000000,
        [Symbol.iterator]() { throw new Error('the data was read before the size was checked'); },
    };
    assert.throws(() => zipBytes([{ name: 'big', data: untouchable }]), /ZIP64/);
});

test('PngSequenceSink numbers frames, keeps no pixels, and refuses up front', async () => {
    const encoded = [];
    const sink = new PngSequenceSink({
        pad: 4,
        encode: (canvas) => { encoded.push(canvas.id); return Uint8Array.of(1, 2, 3); },
    });
    await sink.configure({ width: 320, height: 180, fps: 24, totalFrames: 3 });
    for (let n = 0; n < 3; n++) await sink.writeFrame({ id: n }, n, n / 24);

    assert.deepEqual(encoded, [0, 1, 2]);
    assert.deepEqual(sink.entries.map((e) => e.name),
        ['frames/0000.png', 'frames/0001.png', 'frames/0002.png']);
    // Encoded bytes, never frames: a sink that retains frames cannot
    // complete a two-minute 1080p render.
    assert.ok(sink.entries.every((e) => e.data.length === 3));

    const blob = await sink.finish();
    assert.equal(blob.type, 'application/zip');
    const readme = sink.entries.find((e) => e.name.endsWith('README.txt'));
    assert.match(new TextDecoder().decode(readme.data), /ffmpeg -framerate 24 -i %04d\.png/);

    // A render that cannot finish should say so before it starts, not
    // after four minutes of encoding.
    await assert.rejects(
        () => new PngSequenceSink({ maxFrames: 10 }).configure({ totalFrames: 2880 }),
        /exceeds maxFrames/);
});


// =====================================================================
// which nodes a 2D film ghosts
// =====================================================================

/**
 * A scene shaped like a compiled film's: a group per scene, a background
 * and some scenery beside the cast, and a rig under each cast root. The
 * ids matter -- a cast root is `climb/mara` and its parent is the group
 * `scene/climb`, two different namespaces, which is the whole trap.
 */
const sceneFixture = () => {
    const node = (id, parentId, childIds = []) => [id, { id, parentId, childIds, props: {} }];
    return { byId: new Map([
        node('__root', null, ['scene/climb', '__camera']),
        node('__camera', '__root'),
        node('scene/climb', '__root', ['climb/bg', 'climb/set0_rail', 'climb/mara', 'climb/jonas']),
        node('climb/bg', 'scene/climb'),
        node('climb/set0_rail', 'scene/climb'),
        node('climb/mara', 'scene/climb', ['climb/mara/torso', 'climb/mara/head']),
        node('climb/mara/torso', 'climb/mara', ['climb/mara/armL']),
        node('climb/mara/armL', 'climb/mara/torso'),
        node('climb/mara/head', 'climb/mara'),
        node('climb/jonas', 'scene/climb', ['climb/jonas/torso']),
        node('climb/jonas/torso', 'climb/jonas'),
    ]) };
};

test('a ghost keeps the cast subtree and drops the page around it', () => {
    const { keep, hidden, total } = ghostMask(sceneFixture(), ['climb/mara']);
    assert.ok(keep.has('climb/mara/armL'), 'a grandchild of the ghosted root is kept');
    assert.ok(keep.has('climb/mara/head'));
    const ids = hidden.map((n) => n.id).sort();
    assert.deepEqual(ids, ['__camera', 'climb/bg', 'climb/jonas', 'climb/jonas/torso',
                           'climb/set0_rail']);
    assert.equal(total, 11);
});

/**
 * The defect this function exists for. A cast root is `climb/mara` and its
 * parent is `scene/climb`: the parent is NOT a string prefix of the child,
 * so matching on ids alone hides the group the cast lives in and every
 * ghost renders perfectly blank -- which looks exactly like onion skinning
 * being switched off.
 */
test('and keeps the ANCESTORS, which are in a different namespace', () => {
    const { keep } = ghostMask(sceneFixture(), ['climb/mara']);
    assert.ok(keep.has('scene/climb'), 'the scene group the cast hangs from');
    assert.ok(keep.has('__root'));
    // A naive string-prefix rule would have hidden both.
    assert.ok(!'climb/mara'.startsWith('scene/climb'));
});

test('ghosting several roots keeps all of them', () => {
    const { hidden } = ghostMask(sceneFixture(), ['climb/mara', 'climb/jonas']);
    assert.deepEqual(hidden.map((n) => n.id).sort(),
                     ['__camera', 'climb/bg', 'climb/set0_rail']);
});

test('ghosting nothing hides everything, which the caller must notice', () => {
    const { hidden, total } = ghostMask(sceneFixture(), []);
    assert.equal(hidden.length, total);
});

test('an id that is not in the scene is skipped, not thrown', () => {
    const { keep } = ghostMask(sceneFixture(), ['climb/nobody', 'climb/mara']);
    assert.ok(keep.has('climb/mara'));
    assert.deepEqual(ghostMask(null, ['x']).hidden, []);
});

test('the cast roots come from the film, as the compiler names them', () => {
    assert.deepEqual(castRoots({ scenes: [
        { id: 'climb', cast: [{ character: 'mara', as: 'mara' }, { character: 'j', as: 'jonas' }] },
        { id: 'light', cast: [{ character: 'mara' }] },          // `as` defaults to the character
        { cast: [{ character: 'x', as: 'x' }] },                 // and an unnamed scene to s3
    ] }), ['climb/mara', 'climb/jonas', 'light/mara', 's3/x']);
    assert.deepEqual(castRoots({}), []);
    assert.deepEqual(castRoots({ scenes: [{ id: 'a' }] }), []);
});
