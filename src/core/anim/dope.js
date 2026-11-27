/**
 * The dope sheet, as numbers.
 *
 * # Why this exists before any panel does
 *
 * [37-MISSING-TOOLS.md](../../../docs/pending/37-MISSING-TOOLS.md) calls a
 * curve editor and dope sheet a **UI** job, because the tracks are already
 * data. True, and incomplete: before there was anywhere to drag a handle,
 * there was also no way to ANSWER "what is keyed on this channel, and when",
 * for a human or for an agent. Phase 39 measured that ~85% of the tokens
 * spent building a film went on looking at it, and `digest.js` is this
 * repository's answer -- numbers instead of pixels, ~420 tokens for a whole
 * film against ~2,000 for one screenshot.
 *
 * A dope sheet is the same argument pointed at TIME rather than at the
 * frame. So the sheet is a pure function of the timeline, the panel draws
 * what this returns, and `formatDope` answers the same question in a
 * terminal for a caller with no screen at all.
 *
 * # Scale
 *
 * A compiled film has hundreds to thousands of tracks: the AK-47 film has
 * one per channel per part plus the camera, the post chain and every cue.
 * Dumping all of them is not a dope sheet, it is the timeline printed out.
 * So the sheet filters (by target, by channel, by window), orders by first
 * key, and reports what it left out rather than silently truncating -- the
 * one behaviour that would make it untrustworthy.
 *
 * Pure: no DOM, no canvas. The panel is in `src/ui/`.
 */

/**
 * One character per ease, so a row of keys reads as timing at a glance.
 *
 * This is the dope sheet's whole trick: the SHAPE of the row is the
 * information. Evenly spaced diamonds are a mechanical move, bunched ones
 * are an ease, and a run of `=` is a hold.
 */
export const EASE_MARK = {
    linear: '+', smooth: 'o', bezier: '*', step: '=', hold: '=',
};
export const DEFAULT_MARK = 'o';

/** How a key's ease reads, given that `linear` is stored by omission. */
export const easeOf = (key) => key.ease ?? 'linear';

/**
 * Rows for a dope sheet.
 *
 *   targets  node ids, or a prefix ending in `/` -- `s/host/` is "this cast
 *            member and everything under it", which is the question actually
 *            being asked when someone clicks a character
 *   paths    channel names or prefixes: `transform.` , `props.alpha`
 *   from/to  the time window; a track with no key in it is left out
 *   limit    rows returned, after sorting. `truncated` says how many more
 *
 * Rows come back sorted by first key and then by name, because a dope sheet
 * is read down the page in the order things happen.
 */
export function dopeSheet(timeline, { targets = null, paths = null,
                                      from = -Infinity, to = Infinity,
                                      limit = 60 } = {}) {
    const matches = (value, filters) => !filters || filters.some(
        (f) => (f.endsWith('/') || f.endsWith('.') ? value.startsWith(f) : value === f));

    const rows = [];
    let keyCount = 0;
    for (const track of timeline.tracks ?? []) {
        if (!matches(track.target, targets) || !matches(track.path, paths)) continue;
        const keys = track.keys.filter((k) => k.t >= from && k.t <= to);
        if (!keys.length) continue;
        keyCount += keys.length;
        rows.push({
            target: track.target, path: track.path, type: track.type,
            keys: keys.map((k) => ({ t: k.t, ease: easeOf(k), h: k.h ?? null })),
            first: keys[0].t, last: keys[keys.length - 1].t,
        });
    }
    rows.sort((a, b) => a.first - b.first
        || a.target.localeCompare(b.target) || a.path.localeCompare(b.path));
    return {
        rows: rows.slice(0, limit),
        truncated: Math.max(0, rows.length - limit),
        tracks: rows.length,
        keys: keyCount,
        span: rows.length
            ? [Math.min(...rows.map((r) => r.first)), Math.max(...rows.map((r) => r.last))]
            : [0, 0],
    };
}

/**
 * The sheet as text: one line per channel, keys as marks on a shared ruler.
 *
 * ```
 *          0s        1s        2s        3s
 * s/host transform.x   +---------*-------------------o
 * s/host props.alpha   =====o
 * ```
 *
 * Column resolution is the only lossy part, and two keys landing in one
 * column is reported as `2` rather than drawn as one mark -- because "those
 * two keys are closer together than this view can show" is a different fact
 * from "there is one key here", and an animator chasing a pop needs to know
 * which.
 */
export function formatDope(sheet, { from = null, to = null, width = 56,
                                    fps = null, label = 28 } = {}) {
    if (!sheet.rows.length) return '(no keys in this window)';
    /**
     * A non-finite window falls back to the sheet's own span.
     *
     * `dopeSheet` takes -Infinity/Infinity as "no window", so a caller
     * passing its filters straight through to here would make every column
     * NaN -- which prints a full-width sheet of dashes with no keys on it
     * and no error at all. Found by doing exactly that from `scripts/dope.mjs`.
     */
    const t0 = Number.isFinite(from) ? from : sheet.span[0];
    const t1 = Math.max(t0 + 1e-6, Number.isFinite(to) ? to : sheet.span[1]);
    const col = (t) => Math.min(width - 1, Math.max(0, Math.round(((t - t0) / (t1 - t0)) * (width - 1))));

    const name = (r) => {
        const s = `${r.target} ${r.path}`;
        return s.length > label ? `…${s.slice(s.length - label + 1)}` : s.padEnd(label);
    };

    // A ruler whose ticks are at round seconds, because that is the unit an
    // animator counts in -- and frames when the fps is known and it fits.
    const ruler = new Array(width).fill(' ');
    const step = Math.max(1, Math.ceil((t1 - t0) / 6));
    for (let t = Math.ceil(t0); t <= t1; t += step) {
        const mark = fps ? `${t}s/${Math.round(t * fps)}f` : `${t}s`;
        const at = col(t);
        for (let i = 0; i < mark.length && at + i < width; i++) ruler[at + i] = mark[i];
    }

    const lines = [`${' '.repeat(label)} ${ruler.join('')}`];
    for (const r of sheet.rows) {
        const cells = new Array(width).fill('-');
        const counts = new Array(width).fill(0);
        // Nothing is drawn before the first key or after the last: a track
        // holds its end values outside its own range, and a line of dashes
        // across the whole film says "animated here", which is a lie.
        const lo = col(r.first), hi = col(r.last);
        for (let i = 0; i < width; i++) if (i < lo || i > hi) cells[i] = ' ';
        for (const k of r.keys) {
            const c = col(k.t);
            counts[c]++;
            cells[c] = counts[c] > 1
                ? String(Math.min(9, counts[c]))
                : (r.type === 'discrete' ? '=' : (EASE_MARK[k.ease] ?? DEFAULT_MARK));
        }
        /**
         * A hold runs from its key to the next one, so the span reads solid.
         *
         * EVERY segment of a discrete track is a hold, whatever ease is
         * stored on the key: a viseme, a drawing swap or an expression does
         * not interpolate, and drawing those rows as ramps is the sheet
         * telling an animator that something is moving when nothing is.
         */
        const held = r.type === 'discrete';
        for (let i = 0; i < r.keys.length - 1; i++) {
            if (!held && !(r.keys[i].ease === 'step' || r.keys[i].ease === 'hold')) continue;
            for (let c = col(r.keys[i].t) + 1; c < col(r.keys[i + 1].t); c++) {
                if (cells[c] === '-') cells[c] = '=';
            }
        }
        lines.push(`${name(r)} ${cells.join('')}`);
    }
    const tail = [`${sheet.tracks} channel(s), ${sheet.keys} key(s)`];
    if (sheet.truncated) tail.push(`${sheet.truncated} more not shown`);
    lines.push('', `${tail.join(', ')}.  marks: + linear, o smooth, * bezier, = hold`);
    return lines.join('\n');
}

// ------------------------------------------------------------------ curves

/**
 * Handle presets, as the four numbers a CSS cubic-bezier takes.
 *
 * `ease: 'bezier'` with an `h` has been wired end to end since the engine's
 * first timeline and **no film has ever used it** -- the shape this
 * repository keeps finding. Here the reason is different from `ssao`'s or
 * `displacementMap`'s: the arithmetic works. Nobody used it because there
 * was no way to see what four numbers would do.
 */
export const HANDLE_PRESETS = {
    linear: [0, 0, 1, 1],
    smooth: [0.42, 0, 0.58, 1],
    'ease-in': [0.42, 0, 1, 1],
    'ease-out': [0, 0, 0.58, 1],
    snap: [0.9, 0, 1, 1],
    // Overshoot: y leaves [0,1], which a cubic-bezier timing function is
    // allowed to do and which is the entire reason an animator opens a curve
    // editor at all.
    overshoot: [0.3, 0, 0.3, 1.5],
    anticipate: [0.6, -0.4, 0.3, 1],
};

/**
 * `n` points along one segment's ease, as [u, eased] in [0,1]x whatever.
 *
 * Returned normalised rather than in seconds and film units, because the
 * curve pane draws a unit square and the row above it draws the time. Two
 * views of the same key, each in its own coordinates, is the layout every
 * curve editor uses and the reason this returns `u` and not `t`.
 */
export function curveSamples(ease, handles, n = 48, easeFn) {
    const out = new Array(n + 1);
    for (let i = 0; i <= n; i++) {
        const u = i / n;
        out[i] = [u, easeFn(ease, u, handles)];
    }
    return out;
}

/**
 * Clamp a dragged handle to what a timing function may be.
 *
 * x is clamped to [0, 1] because a cubic-bezier timing function must be a
 * function of time -- an x outside that makes the curve fold back on itself
 * and the solver returns whichever root it lands on, which reads as a jump.
 * y is deliberately NOT clamped: leaving [0, 1] is overshoot, and overshoot
 * is the thing an animator came here for.
 */
export function clampHandle([x, y], { maxY = 3 } = {}) {
    return [Math.min(1, Math.max(0, x)), Math.min(maxY, Math.max(-maxY, y))];
}

/** Does this ease actually bend? Used to decide whether a handle is draggable. */
export const isCurved = (ease) => ease === 'bezier';

// ------------------------------------------------------- the authored side

/**
 * The film's own actions, placed on the film's clock.
 *
 * The dope sheet above reads the COMPILED timeline, which is the right thing
 * to look at and the wrong thing to edit: one `move` becomes several keys on
 * two channels, and writing back to them would be editing the output. The
 * standing rule for this editor is that there is no editor-only state -- the
 * edit IS the script -- so the half that can be dragged is this one: the
 * authored action, whose `ease` and `h` are fields of the document an agent
 * reads and writes.
 *
 * `at` is shot-relative in the film and absolute here, because a ruler has
 * one origin. That conversion is the only arithmetic an author should never
 * have to do, and it is the reason this function exists rather than the
 * panel reading `film.scenes` itself.
 */
export function actionRows(film, shots) {
    const rows = [];
    for (const s of shots) {
        for (const [i, action] of (s.shot.actions ?? []).entries()) {
            const at = s.start + (action.at ?? 0);
            const span = action.for ?? null;
            rows.push({
                sceneId: s.sceneId, shotId: s.shotId, index: i, action,
                target: action.target ?? '', verb: action.do ?? action.action ?? '?',
                start: at,
                // An action with no `for` runs to the end of its shot, which
                // is what every verb here does and what the bar must show.
                end: span == null ? s.end : Math.min(s.end, at + span),
                open: span == null,
                ease: action.ease ?? 'smooth',
                handles: action.h ?? null,
            });
        }
    }
    return rows.sort((a, b) => a.start - b.start || a.index - b.index);
}

/**
 * Write an ease back into an authored action, in place.
 *
 * In place, and returning the action, because the film object IS the
 * document: a copy would be editor-only state by another name. Handles are
 * dropped when the ease is not a curve, so a film never carries four numbers
 * that nothing reads.
 */
export function setActionEase(action, ease, handles = null) {
    if (ease === 'smooth') delete action.ease; else action.ease = ease;
    if (isCurved(ease) && handles) action.h = handles.map((n) => +n.toFixed(3));
    else delete action.h;
    return action;
}
