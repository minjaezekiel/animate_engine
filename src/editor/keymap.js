/**
 * Hotkeys: a declarative chord table that resolves to command names.
 *
 * ```js
 * const keys = new Keymap({
 *     'mod+z': 'undo', 'mod+shift+z': 'redo', 'mod+y': 'redo',
 *     'space': 'play', 'left': 'step.back', 'right': 'step.forward',
 *     'o': 'toggle.onion',
 * });
 * window.addEventListener('keydown', (event) => {
 *     const command = keys.resolve(event);
 *     if (command && dispatch(command)) event.preventDefault();
 * });
 * ```
 *
 * # Why a table and not a switch
 *
 * The thing it replaces is one `keydown` listener with a chain of `if
 * (ev.key === ...)`, which is fine until any of these is wanted -- and all
 * of them are, in an animation tool:
 *
 *   - **A help overlay.** [`describe`] is the switch's missing half; a
 *     hand-written list beside a hand-written switch drifts on the first
 *     change.
 *   - **Rebinding.** Animators have muscle memory from other packages, so
 *     the table is data the user can edit and persist.
 *   - **One table, two platforms.** `mod` resolves to Command on macOS and
 *     Control elsewhere, so the binding is written once. Hard-coding
 *     `ev.ctrlKey` is the single most common keymap bug, and on a Mac it
 *     produces an editor where undo does nothing.
 *   - **Conflict detection.** Two commands on one chord is a bug that
 *     otherwise shows up as "sometimes the wrong thing happens".
 *
 * # Typing is not a shortcut
 *
 * A keystroke inside a text field belongs to the field. Without that rule
 * the letter `o` in a JSON editor toggles onion skin, which is the sort of
 * defect that gets reported as "the editor is haunted". [`resolve`]
 * returns null for events originating in an input, a textarea, a select or
 * anything `contenteditable` -- unless the binding is explicitly marked
 * `always`, which is what `mod+s` wants.
 */

/** True on an Apple platform, where `mod` is Command rather than Control. */
export function isApple(platform = globalThis.navigator?.platform ?? '') {
    return /mac|iphone|ipad|ipod/i.test(platform);
}

/** Canonical modifier order, so `mod+shift+z` and `shift+mod+z` are one chord. */
const ORDER = ['mod', 'ctrl', 'alt', 'shift'];

/** Spellings people reach for, mapped to what `event.key` actually gives. */
const ALIASES = {
    esc: 'escape', escape: 'escape', del: 'delete', delete: 'delete',
    ins: 'insert', return: 'enter', enter: 'enter', space: ' ', spacebar: ' ',
    up: 'arrowup', down: 'arrowdown', left: 'arrowleft', right: 'arrowright',
    plus: '+', minus: '-', comma: ',', period: '.', slash: '/',
};

/** Normalise a chord string: lowercase, canonical modifier order, aliases. */
export function normalizeChord(chord) {
    const parts = String(chord).toLowerCase().split('+').filter(Boolean);
    // A trailing '+' means the key *is* plus, which the filter above would
    // otherwise eat: 'mod++' and 'mod+plus' must mean the same thing.
    const key = String(chord).endsWith('+') ? '+' : parts.pop();
    const mods = new Set(parts.map((p) => (p === 'cmd' || p === 'meta' || p === 'command' ? 'mod'
        : p === 'control' ? 'ctrl' : p === 'option' ? 'alt' : p)));
    const ordered = ORDER.filter((m) => mods.has(m));
    for (const m of mods) if (!ORDER.includes(m)) throw new Error(`unknown modifier "${m}" in "${chord}"`);
    return [...ordered, ALIASES[key] ?? key].join('+');
}

/** The chord a keyboard event represents, in the same spelling as a binding. */
export function chordOf(event, { apple = isApple() } = {}) {
    const mods = [];
    // `mod` is whichever of meta/ctrl is the platform's accelerator; the
    // *other* one is still reportable, so `ctrl+click` on a Mac stays
    // distinct from `cmd+click`.
    if (apple ? event.metaKey : event.ctrlKey) mods.push('mod');
    if (apple ? event.ctrlKey : event.metaKey) mods.push('ctrl');
    if (event.altKey) mods.push('alt');
    if (event.shiftKey) mods.push('shift');
    const key = String(event.key ?? '').toLowerCase();
    return [...ORDER.filter((m) => mods.includes(m)), key].join('+');
}

/** Whether an event came from somewhere that owns its own keystrokes. */
export function isTyping(target) {
    if (!target || typeof target !== 'object') return false;
    const tag = String(target.tagName ?? '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    return target.isContentEditable === true;
}

export class Keymap {
    /**
     * @param {Record<string, string|{command: string, always?: boolean, doc?: string}>} [bindings]
     * @param {object} [options]
     * @param {boolean} [options.apple] override platform detection, for tests
     */
    constructor(bindings = {}, { apple = isApple() } = {}) {
        this.apple = apple;
        /** @type {Map<string, {command: string, always: boolean, doc: string|null}>} */
        this.bindings = new Map();
        for (const [chord, value] of Object.entries(bindings)) this.bind(chord, value);
    }

    /**
     * Add a binding. Rebinding a chord is allowed; *colliding* is not.
     *
     * The difference: `bind` with the same command replaces, and with a
     * different one throws. Two commands on one chord cannot be resolved
     * correctly, and failing at setup beats failing intermittently at use.
     */
    bind(chord, value) {
        const key = normalizeChord(chord);
        const entry = typeof value === 'string' ? { command: value } : value;
        const existing = this.bindings.get(key);
        if (existing && existing.command !== entry.command) {
            throw new Error(`chord "${key}" is already bound to "${existing.command}"`);
        }
        this.bindings.set(key, {
            command: entry.command,
            always: entry.always === true,
            doc: entry.doc ?? null,
        });
        return this;
    }

    unbind(chord) {
        this.bindings.delete(normalizeChord(chord));
        return this;
    }

    /** The command a keyboard event asks for, or null. */
    resolve(event) {
        const entry = this.bindings.get(chordOf(event, { apple: this.apple }));
        if (!entry) return null;
        if (!entry.always && isTyping(event.target)) return null;
        return entry.command;
    }

    /**
     * Every binding, for a help overlay, sorted by command.
     *
     * `mod` is rendered as the platform's own symbol, because a Mac user
     * shown "Ctrl+Z" will press Ctrl+Z.
     */
    describe() {
        const label = (chord) => chord
            .replace('mod', this.apple ? '⌘' : 'Ctrl')
            .replace('alt', this.apple ? '⌥' : 'Alt')
            .replace('shift', this.apple ? '⇧' : 'Shift')
            .replace(/\+/g, this.apple ? '' : '+')
            .replace(' ', 'Space');
        return [...this.bindings.entries()]
            .map(([chord, entry]) => ({ chord, label: label(chord), ...entry }))
            .sort((a, b) => a.command.localeCompare(b.command) || a.chord.localeCompare(b.chord));
    }

    /**
     * Attach to a target and dispatch resolved commands.
     *
     * `dispatch` returning anything but `false` counts as handled and the
     * event's default is prevented -- so an unhandled `mod+s` still opens
     * the browser's save dialog rather than silently doing nothing.
     *
     * @returns {() => void} detach
     */
    attach(target, dispatch) {
        const listener = (event) => {
            const command = this.resolve(event);
            if (!command) return;
            if (dispatch(command, event) !== false) {
                event.preventDefault();
                event.stopPropagation();
            }
        };
        target.addEventListener('keydown', listener);
        return () => target.removeEventListener('keydown', listener);
    }
}
