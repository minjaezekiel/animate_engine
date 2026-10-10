/**
 * Undo and redo over a plain-JSON document.
 *
 * ```js
 * const history = new History();
 * history.apply(film, set('scenes.0.shots.0.duration', 6, 'shot length'));
 * history.undo(film);          // back to whatever it was
 * history.redo(film);
 *
 * // one undo step for a whole drag
 * history.transaction(film, 'drag arm', (tx) => {
 *     for (const sample of gesture) tx(set(`...rot`, sample));
 * });
 * ```
 *
 * # Why inverse patches and not snapshots
 *
 * The obvious implementation keeps a stack of `JSON.stringify(document)`.
 * It is three lines, it is what both editors in this repository did, and
 * it is the wrong shape:
 *
 *   - **Cost is the document, not the edit.** Dragging a joint for two
 *     seconds at 60 Hz is 120 edits. Against a 500 KB film that is 60 MB
 *     of garbage and 120 full serialisations, for 120 changed numbers.
 *     `docs/DEFECTS.md` already lists the legacy editor's version of this
 *     -- `markChanged` -> `serializeProject()` -> `localStorage.setItem`
 *     on *every mutation* -- as a performance defect.
 *   - **It cannot say what it is undoing.** A snapshot has no label, so
 *     the UI cannot offer "Undo move arm" and a log cannot explain itself.
 *   - **It cannot be anything else later.** A patch is data: it can be
 *     logged, replayed, sent to another client, or inverted. A snapshot is
 *     a dead end.
 *
 * So a command is a path, a new value, and the value that was there
 * before. Undo writes the old one back. Cost is the size of the edit.
 *
 * # Transactions, not time-based coalescing
 *
 * A gesture must be one undo step. The usual trick is to merge commands
 * that touch the same path within N milliseconds -- which needs a clock,
 * and `src/core/` is not allowed one (see `docs/00-OVERVIEW.md`). It is
 * also a guess: the real boundaries of a drag are `pointerdown` and
 * `pointerup`, which the caller already knows exactly.
 *
 * [`transaction`] takes them literally. Everything inside becomes one
 * entry, undone and redone as a unit, and a transaction that threw is
 * rolled back rather than left half-applied.
 *
 * # It does not know what a film is
 *
 * Nothing here mentions scenes, shots or nodes. It operates on any JSON
 * document, which is why the same class serves the 2D studio, the 3D
 * editor and anything an agent drives through the ops table -- and why it
 * is testable without a browser, a canvas or a compile.
 */

/** Returned by [`getIn`] when a path does not exist, distinct from `undefined`. */
export const MISSING = Symbol('missing');

/**
 * Split a path into keys.
 *
 * Accepts the dotted form the rest of the engine uses for channels
 * (`transform.x`, `props.alpha`) so one notation covers both, and an array
 * for keys that contain a dot.
 */
export function keysOf(path) {
    if (Array.isArray(path)) return path;
    return String(path).split('.').map((k) => (/^\d+$/.test(k) ? Number(k) : k));
}

/** Read a path, or [`MISSING`]. */
export function getIn(doc, path) {
    let node = doc;
    for (const key of keysOf(path)) {
        if (node == null || typeof node !== 'object' || !(key in node)) return MISSING;
        node = node[key];
    }
    return node;
}

/**
 * Write a path, creating intermediate containers, and return what was
 * there before (or [`MISSING`]).
 *
 * A numeric key creates an array and anything else an object, so
 * `scenes.0.shots.1` builds the right shapes without being told. Passing
 * [`MISSING`] as the value **deletes** the key, which is what makes undo
 * of an insertion exact rather than leaving an `undefined` behind -- a
 * difference `JSON.stringify` makes visible and schema validation
 * complains about.
 */
export function setIn(doc, path, value) {
    const keys = keysOf(path);
    if (!keys.length) throw new Error('setIn needs a non-empty path');
    let node = doc;
    for (let i = 0; i < keys.length - 1; i++) {
        const key = keys[i];
        if (node[key] == null || typeof node[key] !== 'object') {
            node[key] = typeof keys[i + 1] === 'number' ? [] : {};
        }
        node = node[key];
    }
    const last = keys[keys.length - 1];
    const before = last in node ? node[last] : MISSING;
    if (value === MISSING) {
        if (Array.isArray(node) && typeof last === 'number') node.splice(last, 1);
        else delete node[last];
    } else {
        node[last] = value;
    }
    return before;
}

/**
 * A command that sets one path.
 *
 * The previous value is captured on *apply*, not now, because a command
 * may be created before the document is in the state it will be applied
 * to -- which is exactly what happens when a transaction is replayed by
 * redo.
 */
export function set(path, value, label = `set ${Array.isArray(path) ? path.join('.') : path}`) {
    let before = MISSING;
    return {
        label,
        apply: (doc) => { before = setIn(doc, path, value); },
        revert: (doc) => { setIn(doc, path, before); },
    };
}

/** A command that removes one path. Undo puts the value back where it was. */
export function remove(path, label = `remove ${Array.isArray(path) ? path.join('.') : path}`) {
    return set(path, MISSING, label);
}

/**
 * A command that splices an array in place.
 *
 * Insertion and deletion in one, because an editor's "add a shot" and
 * "delete a shot" are the same operation with different arguments, and
 * because an array index shifts: reverting a deletion has to put the item
 * back at its old position, not at the end.
 */
export function splice(path, start, deleteCount, items = [], label = null) {
    let removed = [];
    return {
        label: label ?? (deleteCount && items.length ? `replace in ${path}`
            : deleteCount ? `remove from ${path}` : `insert into ${path}`),
        apply: (doc) => {
            const array = getIn(doc, path);
            if (!Array.isArray(array)) throw new Error(`splice: ${path} is not an array`);
            removed = array.splice(start, deleteCount, ...items);
        },
        revert: (doc) => {
            const array = getIn(doc, path);
            if (Array.isArray(array)) array.splice(start, items.length, ...removed);
        },
    };
}

/**
 * Replace a document's entire contents, in place.
 *
 * The one case where a snapshot is the honest representation rather than a
 * shortcut: "apply the JSON in this text box" *is* an edit the size of the
 * document, so recording it as one costs nothing extra.
 *
 * It mutates the object rather than returning a new one, so every
 * reference the host holds stays valid. A document identity that changes
 * under undo is how an editor ends up rendering a stale copy of itself.
 */
export function replaceAll(next, label = 'replace document', { before = null } = {}) {
    let previous = before;
    const swap = (doc, source) => {
        for (const key of Object.keys(doc)) delete doc[key];
        Object.assign(doc, structuredClone(source));
    };
    return {
        label,
        apply: (doc) => {
            // Captured on apply unless the caller supplies it, and deeply,
            // because the caller usually goes on to edit the document and a
            // shallow copy would alias into it -- an undo that restores the
            // state it was undoing.
            //
            // `before` is passed explicitly by a host that snapshots at the
            // *start* of an edit and records it at the end, which is the
            // shape a UI with many small mutation sites actually has.
            if (previous === null) previous = structuredClone({ ...doc });
            swap(doc, next);
        },
        revert: (doc) => { swap(doc, previous); },
    };
}

/** Several commands undone and redone as one. */
export function group(commands, label) {
    return {
        label,
        apply: (doc) => { for (const c of commands) c.apply(doc); },
        // Reverse order: a later command may depend on an earlier one, so
        // undoing forwards can revert into a state the command never saw.
        revert: (doc) => { for (let i = commands.length - 1; i >= 0; i--) commands[i].revert(doc); },
        commands,
    };
}

export class History {
    /**
     * @param {object} [options]
     * @param {number} [options.limit=200]
     *   Entries kept. Each is the size of its edit, not of the document,
     *   so this can be generous; 200 drags is more than anyone reaches for.
     * @param {Function} [options.onChange] called after every change
     */
    constructor({ limit = 200, onChange = null } = {}) {
        this.limit = limit;
        this.onChange = onChange;
        /** @type {object[]} applied, oldest first */
        this.past = [];
        /** @type {object[]} undone, most recently undone last */
        this.future = [];
        this._open = null;
    }

    get canUndo() { return this.past.length > 0; }
    get canRedo() { return this.future.length > 0; }
    /** What `undo()` would undo, for a menu item or a log line. */
    get undoLabel() { return this.past[this.past.length - 1]?.label ?? null; }
    get redoLabel() { return this.future[this.future.length - 1]?.label ?? null; }

    /**
     * Apply a command and record it.
     *
     * Inside a [`transaction`] the command joins the open group instead of
     * becoming its own entry.
     */
    apply(doc, command) {
        command.apply(doc);
        if (this._open) {
            this._open.push(command);
            return command;
        }
        this.past.push(command);
        // A new edit invalidates the redo branch. Keeping it would offer
        // to redo a change that no longer makes sense against what is now
        // in the document -- the standard choice, and the only safe one
        // without a tree-shaped history.
        this.future.length = 0;
        if (this.past.length > this.limit) this.past.shift();
        this.onChange?.(this);
        return command;
    }

    /**
     * Run `body` as one undo step.
     *
     * `body` receives a function to apply commands with. A throw rolls the
     * whole group back, so a half-finished gesture cannot leave the
     * document in a state no command describes.
     */
    transaction(doc, label, body) {
        if (this._open) throw new Error('a transaction is already open');
        const commands = [];
        this._open = commands;
        try {
            body((command) => this.apply(doc, command));
        } catch (error) {
            for (let i = commands.length - 1; i >= 0; i--) commands[i].revert(doc);
            this._open = null;
            throw error;
        }
        this._open = null;
        if (!commands.length) return null;
        // One command needs no wrapper, and keeping its own label is
        // better than the group's generic one.
        const entry = commands.length === 1 ? commands[0] : group(commands, label);
        this.past.push(entry);
        this.future.length = 0;
        if (this.past.length > this.limit) this.past.shift();
        this.onChange?.(this);
        return entry;
    }

    undo(doc) {
        const entry = this.past.pop();
        if (!entry) return null;
        entry.revert(doc);
        this.future.push(entry);
        this.onChange?.(this);
        return entry;
    }

    redo(doc) {
        const entry = this.future.pop();
        if (!entry) return null;
        entry.apply(doc);
        this.past.push(entry);
        this.onChange?.(this);
        return entry;
    }

    /** Forget everything. Call this when the document is replaced. */
    clear() {
        this.past.length = 0;
        this.future.length = 0;
        this._open = null;
        this.onChange?.(this);
    }
}
