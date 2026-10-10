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
import { OnionSkin, DEFAULT_TINT } from '../../src/render/onionSkin.js';
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
    assert.throws(() => zipBytes([{ name: 'big', data: { length: 0x100000000 } }]), /ZIP64/);
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
