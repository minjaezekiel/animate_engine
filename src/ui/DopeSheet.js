/**
 * The dope sheet and curve editor, as one canvas panel.
 *
 * # What it is for
 *
 * Easing in this engine is chosen by name from a table. For dialogue and
 * mechanical motion that is enough; for weight it is not --
 * [37-MISSING-TOOLS.md](../../docs/pending/37-MISSING-TOOLS.md) puts it
 * exactly: *"an animator fixes overshoot by dragging a handle, and there is
 * nowhere to drag."*
 *
 * `ease: 'bezier'` with an `h` of four numbers has been wired end to end
 * since the first timeline and **no film has ever used it**. Unlike the
 * other times this repository has found that shape, the arithmetic was
 * fine. Nobody used it because there was no way to see what four numbers
 * would do.
 *
 * # The one rule this panel must not break
 *
 * **There is no editor-only state. The edit IS the script.** So the panel
 * has two halves and only one of them is draggable:
 *
 *   - the **authored actions**, from the film document, whose `ease` and `h`
 *     are fields an agent reads and writes. These can be dragged.
 *   - the **compiled channels**, from the timeline, which are the OUTPUT --
 *     one `move` becomes several keys on two channels, and writing back to
 *     them would be editing the result rather than the cause. Read-only, and
 *     shown precisely so that what a verb produced stops being invisible.
 *
 * # Scale
 *
 * A compiled film has hundreds to thousands of channels. Rows are therefore
 * **virtualised**: the draw loop touches only the rows inside the scrolled
 * window, so a 2,000-channel film costs the same frame as a 20-channel one.
 * There is one canvas and no DOM node per key, for the same reason.
 */
import { dopeSheet, actionRows, setActionEase, curveSamples, clampHandle,
         isCurved, HANDLE_PRESETS, EASE_MARK } from '../core/anim/dope.js';
import { easeProgress } from '../core/anim/easing.js';

const ROW = 18;
const GUTTER = 190;
const RULER = 20;
const CURVE = 132;
const PAD = 8;

const THEME = {
    bg: '#12161c', line: '#2d3542', grid: '#1b212a', ink: '#c8d0da', dim: '#78828f',
    bar: '#3b6ea5', barOpen: '#2a4663', sel: '#e8b339', key: '#9fb4c9',
    curve: '#7fd1b9', handle: '#e8b339', axis: '#39424f',
};

/** Hit targets, in device-independent pixels. */
const GRAB = 7;

export function createDopeSheet(canvas, {
    onEdit = () => {}, onSelect = () => {}, onSeek = null,
} = {}) {
    const ctx = canvas.getContext('2d');
    let state = {
        film: null, timeline: null, shots: [], duration: 1, fps: 24,
        actions: [], sheet: { rows: [], tracks: 0, keys: 0, truncated: 0, span: [0, 0] },
        scroll: 0, selected: -1, playhead: null, filter: null,
    };
    let drag = null;        // { which: 0 | 1 }  -- which bezier handle
    let dpr = 1;

    // ------------------------------------------------------------ geometry
    const plotW = () => canvas.clientWidth - GUTTER - PAD;
    const xOf = (t) => GUTTER + (t / Math.max(1e-6, state.duration)) * plotW();
    const tOf = (x) => ((x - GUTTER) / Math.max(1, plotW())) * state.duration;
    const listTop = () => RULER;
    const listH = () => Math.max(ROW, canvas.clientHeight - RULER - CURVE);
    const rows = () => [
        ...state.actions.map((r, i) => ({ kind: 'action', r, i })),
        ...state.sheet.rows.map((r) => ({ kind: 'track', r })),
    ];

    /**
     * The curve pane's unit square. y runs UP, and the box is taller than
     * one unit so that overshoot -- which is the whole point of dragging a
     * handle -- has somewhere to be drawn rather than being clipped at the
     * frame of its own editor.
     */
    const curveBox = () => {
        const top = canvas.clientHeight - CURVE + PAD;
        const h = CURVE - PAD * 2;
        return { x: PAD + 4, y: top, w: Math.min(h, canvas.clientWidth - GUTTER), h,
                 lo: -0.5, hi: 1.5 };
    };
    const cx = (b, u) => b.x + u * b.w;
    const cy = (b, v) => b.y + b.h - ((v - b.lo) / (b.hi - b.lo)) * b.h;
    const cuOf = (b, px) => (px - b.x) / b.w;
    const cvOf = (b, py) => b.lo + ((b.y + b.h - py) / b.h) * (b.hi - b.lo);

    // --------------------------------------------------------------- paint
    function draw() {
        const w = canvas.clientWidth, h = canvas.clientHeight;
        if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.fillStyle = THEME.bg;
        ctx.fillRect(0, 0, w, h);
        ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
        ctx.textBaseline = 'middle';

        drawRuler(w);
        drawRows(w);
        drawCurve();
    }

    function drawRuler(w) {
        ctx.fillStyle = THEME.dim;
        ctx.strokeStyle = THEME.grid;
        ctx.lineWidth = 1;
        // A tick every round second while they are more than 44 px apart,
        // then every 2, 5, 10... A ruler whose labels overlap is not a ruler.
        const pxPerSec = plotW() / Math.max(1e-6, state.duration);
        const step = [1, 2, 5, 10, 15, 30, 60].find((s) => s * pxPerSec > 44) ?? 120;
        for (let t = 0; t <= state.duration + 1e-9; t += step) {
            const x = Math.round(xOf(t)) + 0.5;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.clientHeight - CURVE); ctx.stroke();
            ctx.fillText(`${t}s`, x + 3, RULER / 2);
        }
        ctx.strokeStyle = THEME.line;
        ctx.beginPath();
        ctx.moveTo(0, RULER + 0.5); ctx.lineTo(w, RULER + 0.5);
        ctx.moveTo(GUTTER + 0.5, 0); ctx.lineTo(GUTTER + 0.5, canvas.clientHeight - CURVE);
        ctx.stroke();
        if (state.playhead != null) {
            ctx.strokeStyle = THEME.sel;
            const x = Math.round(xOf(state.playhead)) + 0.5;
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.clientHeight - CURVE); ctx.stroke();
        }
    }

    function drawRows(w) {
        const all = rows();
        const top = listTop(), height = listH();
        // Virtualised: only the rows inside the scrolled window are touched,
        // so a 2,000-channel film costs the same frame as a 20-channel one.
        const first = Math.max(0, Math.floor(state.scroll / ROW));
        const last = Math.min(all.length, first + Math.ceil(height / ROW) + 1);
        ctx.save();
        ctx.beginPath(); ctx.rect(0, top, w, height); ctx.clip();

        for (let i = first; i < last; i++) {
            const y = top + i * ROW - state.scroll;
            const mid = y + ROW / 2;
            const item = all[i];
            const selected = item.kind === 'action' && item.i === state.selected;
            if (selected) {
                ctx.fillStyle = '#1d2733';
                ctx.fillRect(0, y, w, ROW);
            } else if (i % 2) {
                ctx.fillStyle = THEME.grid;
                ctx.fillRect(0, y, w, ROW);
            }
            if (item.kind === 'action') {
                const r = item.r;
                ctx.fillStyle = selected ? THEME.sel : THEME.ink;
                ctx.fillText(clip(`${r.verb} ${r.target}`, 22), 6, mid);
                ctx.fillStyle = THEME.dim;
                ctx.fillText(clip(r.shotId, 8), 132, mid);
                const x0 = xOf(r.start), x1 = Math.max(x0 + 2, xOf(r.end));
                ctx.fillStyle = selected ? THEME.sel : (r.open ? THEME.barOpen : THEME.bar);
                ctx.fillRect(x0, y + 4, x1 - x0, ROW - 8);
                // The ease, named on the bar when it fits -- the one fact an
                // animator is scanning for.
                if (x1 - x0 > 34) {
                    ctx.fillStyle = '#0d1116';
                    ctx.fillText(clip(r.ease, Math.floor((x1 - x0) / 7) - 1), x0 + 4, mid);
                }
            } else {
                const r = item.r;
                ctx.fillStyle = THEME.dim;
                ctx.fillText(clip(`${r.target} ${r.path}`, 30), 6, mid);
                ctx.strokeStyle = THEME.axis;
                ctx.beginPath();
                ctx.moveTo(xOf(r.first), mid + 0.5); ctx.lineTo(xOf(r.last), mid + 0.5);
                ctx.stroke();
                ctx.fillStyle = THEME.key;
                for (const k of r.keys) {
                    const x = xOf(k.t);
                    // A diamond, which is what every dope sheet draws, and a
                    // square for a hold so the eye separates them at a glance.
                    if (r.type === 'discrete' || k.ease === 'step' || k.ease === 'hold') {
                        ctx.fillRect(x - 2, mid - 2, 4, 4);
                    } else {
                        ctx.beginPath();
                        ctx.moveTo(x, mid - 3); ctx.lineTo(x + 3, mid);
                        ctx.lineTo(x, mid + 3); ctx.lineTo(x - 3, mid);
                        ctx.fill();
                    }
                }
            }
        }
        ctx.restore();

        if (state.sheet.truncated) {
            ctx.fillStyle = THEME.dim;
            ctx.fillText(`+${state.sheet.truncated} more channels`, 6, top + height - 8);
        }
    }

    function drawCurve() {
        const b = curveBox();
        const sel = state.actions[state.selected] ?? null;
        ctx.strokeStyle = THEME.line;
        ctx.strokeRect(b.x + 0.5, b.y + 0.5, b.w, b.h);
        // The unit square inside the taller box, so overshoot is visibly
        // outside something rather than merely high.
        ctx.strokeStyle = THEME.axis;
        ctx.setLineDash([2, 3]);
        ctx.beginPath();
        ctx.moveTo(b.x, cy(b, 0)); ctx.lineTo(b.x + b.w, cy(b, 0));
        ctx.moveTo(b.x, cy(b, 1)); ctx.lineTo(b.x + b.w, cy(b, 1));
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = THEME.dim;
        if (!sel) {
            ctx.fillText('select an action to shape its ease', b.x + b.w + 16, b.y + 14);
            return;
        }
        const handles = sel.handles ?? HANDLE_PRESETS[sel.ease] ?? HANDLE_PRESETS.smooth;
        const pts = curveSamples(sel.ease, handles, 64, easeProgress);
        ctx.strokeStyle = THEME.curve;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        pts.forEach(([u, v], i) => (i ? ctx.lineTo(cx(b, u), cy(b, v)) : ctx.moveTo(cx(b, u), cy(b, v))));
        ctx.stroke();
        ctx.lineWidth = 1;

        const text = [
            `${sel.verb} ${sel.target}  ·  ${sel.shotId}`,
            `${sel.start.toFixed(2)}s → ${sel.end.toFixed(2)}s${sel.open ? ' (to end of shot)' : ''}`,
            `ease ${sel.ease}${isCurved(sel.ease) ? `  h [${handles.map((n) => n.toFixed(2)).join(', ')}]` : ''}`,
        ];
        ctx.fillStyle = THEME.ink;
        text.forEach((line, i) => ctx.fillText(line, b.x + b.w + 16, b.y + 12 + i * 15));
        if (!isCurved(sel.ease)) {
            ctx.fillStyle = THEME.dim;
            ctx.fillText('a named ease has no handles — press B for bezier',
                         b.x + b.w + 16, b.y + 12 + 3 * 15);
            return;
        }
        for (const [i, [hx, hy]] of [[handles[0], handles[1]], [handles[2], handles[3]]].entries()) {
            const anchor = i === 0 ? [0, 0] : [1, 1];
            ctx.strokeStyle = THEME.axis;
            ctx.beginPath();
            ctx.moveTo(cx(b, anchor[0]), cy(b, anchor[1]));
            ctx.lineTo(cx(b, hx), cy(b, hy));
            ctx.stroke();
            ctx.fillStyle = THEME.handle;
            ctx.beginPath();
            ctx.arc(cx(b, hx), cy(b, hy), 4, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

    // -------------------------------------------------------------- events
    const local = (e) => {
        const r = canvas.getBoundingClientRect();
        return [e.clientX - r.left, e.clientY - r.top];
    };

    function handleAt(x, y) {
        const sel = state.actions[state.selected];
        if (!sel || !isCurved(sel.ease)) return null;
        const b = curveBox();
        const h = sel.handles ?? HANDLE_PRESETS.smooth;
        for (const i of [0, 1]) {
            const px = cx(b, h[i * 2]), py = cy(b, h[i * 2 + 1]);
            if (Math.hypot(x - px, y - py) <= GRAB) return i;
        }
        return null;
    }

    canvas.addEventListener('pointerdown', (e) => {
        const [x, y] = local(e);
        const which = handleAt(x, y);
        if (which != null) {
            drag = { which };
            canvas.setPointerCapture(e.pointerId);
            return;
        }
        if (y < RULER && onSeek) { onSeek(Math.max(0, Math.min(state.duration, tOf(x)))); return; }
        if (y >= canvas.clientHeight - CURVE) return;
        const i = Math.floor((y - listTop() + state.scroll) / ROW);
        const all = rows();
        if (i < 0 || i >= all.length) return;
        const item = all[i];
        if (item.kind === 'action') {
            state.selected = item.i;
            onSelect(item.r);
        } else if (onSeek && x > GUTTER) {
            onSeek(Math.max(0, Math.min(state.duration, tOf(x))));
        }
        draw();
    });

    canvas.addEventListener('pointermove', (e) => {
        if (!drag) {
            canvas.style.cursor = handleAt(...local(e)) != null ? 'grab' : 'default';
            return;
        }
        const [x, y] = local(e);
        const b = curveBox();
        const sel = state.actions[state.selected];
        const h = [...(sel.handles ?? HANDLE_PRESETS.smooth)];
        const [nx, ny] = clampHandle([cuOf(b, x), cvOf(b, y)]);
        h[drag.which * 2] = nx;
        h[drag.which * 2 + 1] = ny;
        sel.handles = h;
        setActionEase(sel.action, 'bezier', h);
        draw();
    });

    const release = (e) => {
        if (!drag) return;
        drag = null;
        try { canvas.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
        // The recompile happens on RELEASE, not on every move: recompiling a
        // film is milliseconds and dragging fires at the display's rate, so
        // doing it per move turns a smooth drag into a slideshow on a long
        // film. The curve itself redraws live, which is the feedback that
        // matters.
        onEdit(state.actions[state.selected]?.action ?? null);
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    canvas.addEventListener('wheel', (e) => {
        const max = Math.max(0, rows().length * ROW - listH());
        state.scroll = Math.max(0, Math.min(max, state.scroll + e.deltaY));
        e.preventDefault();
        draw();
    }, { passive: false });

    canvas.addEventListener('keydown', (e) => {
        const sel = state.actions[state.selected];
        if (!sel) return;
        const preset = { b: 'bezier', l: 'linear', s: 'smooth', h: 'hold' }[e.key.toLowerCase()];
        if (!preset) return;
        sel.ease = preset;
        sel.handles = preset === 'bezier'
            ? (sel.handles ?? [...HANDLE_PRESETS.smooth]) : null;
        setActionEase(sel.action, preset, sel.handles);
        onEdit(sel.action);
        draw();
        e.preventDefault();
    });

    // ----------------------------------------------------------------- api
    return {
        /**
         * Rebuild from a film and its compiled timeline.
         *
         * Called after every edit AND after every recompile, so the two
         * halves can never disagree about what the film says -- which is the
         * failure mode a panel holding its own copy would have.
         */
        update({ film, timeline, shots, duration, fps = 24, filter = null,
                 playhead = null, limit = 400 } = {}) {
            state.film = film ?? state.film;
            state.timeline = timeline ?? state.timeline;
            state.shots = shots ?? state.shots;
            state.duration = Math.max(1e-6, duration ?? state.duration);
            state.fps = fps;
            state.filter = filter;
            state.playhead = playhead;
            state.actions = state.film ? actionRows(state.film, state.shots) : [];
            state.sheet = state.timeline
                ? dopeSheet(state.timeline, { targets: filter, limit })
                : { rows: [], tracks: 0, keys: 0, truncated: 0, span: [0, 0] };
            if (state.selected >= state.actions.length) state.selected = -1;
            draw();
            return this;
        },
        select(i) { state.selected = i; draw(); return this; },
        get selected() { return state.actions[state.selected] ?? null; },
        get counts() {
            return { actions: state.actions.length, channels: state.sheet.tracks,
                     keys: state.sheet.keys, truncated: state.sheet.truncated };
        },
        setDpr(n) { dpr = n; draw(); return this; },
        redraw: draw,
        /** For a test, and for a keyboard: the same path a pointer takes. */
        dragHandle(which, [u, v]) {
            const sel = state.actions[state.selected];
            if (!sel || !isCurved(sel.ease)) return null;
            const h = [...(sel.handles ?? HANDLE_PRESETS.smooth)];
            const [nx, ny] = clampHandle([u, v]);
            h[which * 2] = nx; h[which * 2 + 1] = ny;
            sel.handles = h;
            setActionEase(sel.action, 'bezier', h);
            onEdit(sel.action);
            draw();
            return h;
        },
        setEase(name) {
            const sel = state.actions[state.selected];
            if (!sel) return null;
            sel.ease = name;
            sel.handles = name === 'bezier'
                ? (sel.handles ?? [...HANDLE_PRESETS.smooth]) : null;
            setActionEase(sel.action, name, sel.handles);
            onEdit(sel.action);
            draw();
            return sel.action;
        },
    };
}

export { HANDLE_PRESETS, EASE_MARK };
