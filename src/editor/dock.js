/**
 * A dockable workspace: named regions, draggable panels, persisted layout.
 *
 * ```html
 * <div id="workspace">
 *   <div data-dock-region="left"></div>
 *   <div data-dock-region="center"></div>
 *   <div data-dock-region="right"></div>
 *   <div data-dock-region="bottom"></div>
 *   <section data-panel="tools"><header data-panel-header>Tools</header>…</section>
 *   <section data-panel="timeline"><header data-panel-header>Timeline</header>…</section>
 * </div>
 * ```
 * ```js
 * const layout = DockLayout.restore('jirex.layout', DEFAULT_LAYOUT, PANEL_IDS);
 * mountDock(document.getElementById('workspace'), layout,
 *           { onChange: () => layout.save('jirex.layout') });
 * ```
 *
 * # The model is separate from the DOM
 *
 * [`DockLayout`] is which panel sits in which region, in what order, how
 * big each region is and what is collapsed. It touches no DOM, so it is
 * testable in Node -- and the interesting bugs in a workspace are all in
 * the model, not in the pointer handling.
 *
 * [`mountDock`] is the thin half: move elements into region containers,
 * drag a header to another region, drag a splitter to resize.
 *
 * # Regions, not arbitrary splits
 *
 * Four regions -- left, right, bottom, centre -- rather than a tree of
 * splitters that can nest anywhere. An animation tool's panels want the
 * same four places every package puts them: tools and assets at the sides,
 * timeline along the bottom, stage in the middle. A general split tree is
 * several times the code and the drag affordances to go with it, and
 * nothing here needs it. The *model* is a map from region to an ordered
 * list, so a fifth region costs a line; a split tree would have to replace
 * it, which is the trade being made knowingly.
 *
 * # A saved layout must be reconciled, not trusted
 *
 * This is the defect that makes home-grown docking systems infuriating. A
 * layout saved last month does not know about the panel shipped today, so
 * the new panel is **invisible** to every existing user and nothing in the
 * UI hints at why. The mirror image is a layout that still lists a panel
 * since removed, leaving a gap or a null dereference.
 *
 * So [`restore`] takes the panels that actually exist and
 * [`reconcile`] drops the unknown ones and appends the missing ones to
 * their default region. Persistence is a convenience; the code's idea of
 * what panels exist is the truth.
 */

/** The regions a panel can live in. `center` is the stage and has no splitter. */
export const REGIONS = ['left', 'center', 'right', 'bottom'];

/** Region sizes in CSS pixels, applied as custom properties. */
const DEFAULT_SIZES = { left: 240, right: 300, bottom: 180 };

/** Below this a region is unusable; a drag that goes further collapses it. */
const MIN_SIZE = 120;

export class DockLayout {
    /**
     * @param {object} [state]
     * @param {Record<string, string[]>} [state.panels] region -> panel ids
     * @param {Record<string, number>} [state.sizes]
     * @param {string[]} [state.collapsed]
     */
    constructor({ panels = {}, sizes = {}, collapsed = [] } = {}) {
        this.panels = {};
        for (const region of REGIONS) this.panels[region] = [...(panels[region] ?? [])];
        this.sizes = { ...DEFAULT_SIZES, ...sizes };
        this.collapsed = new Set(collapsed);
    }

    /** Which region holds `panelId`, or null. */
    regionOf(panelId) {
        for (const region of REGIONS) {
            if (this.panels[region].includes(panelId)) return region;
        }
        return null;
    }

    /** Panel ids in a region, in order. */
    order(region) { return [...(this.panels[region] ?? [])]; }

    /**
     * Move a panel to a region, optionally at an index.
     *
     * Removes it from wherever it was first, because a panel in two
     * regions is two elements with one id -- and the DOM resolves that by
     * silently showing one of them.
     */
    move(panelId, region, index = Infinity) {
        if (!REGIONS.includes(region)) throw new Error(`unknown dock region "${region}"`);
        for (const r of REGIONS) {
            const at = this.panels[r].indexOf(panelId);
            if (at >= 0) this.panels[r].splice(at, 1);
        }
        const list = this.panels[region];
        list.splice(Math.max(0, Math.min(list.length, index)), 0, panelId);
        return this;
    }

    /**
     * Set a region's size, clamped.
     *
     * A drag below [`MIN_SIZE`] does not shrink further -- it is the
     * caller's cue to collapse instead. Letting a region reach zero makes
     * its splitter unfindable, and the panel is then unrecoverable without
     * clearing storage.
     */
    resize(region, px) {
        if (region === 'center') return this;
        this.sizes[region] = Math.max(MIN_SIZE, Math.round(px));
        return this;
    }

    isCollapsed(panelId) { return this.collapsed.has(panelId); }

    toggleCollapse(panelId, value = !this.collapsed.has(panelId)) {
        if (value) this.collapsed.add(panelId);
        else this.collapsed.delete(panelId);
        return this;
    }

    /**
     * Drop panels that no longer exist and add ones that are new.
     *
     * @param {Record<string, string>} known panel id -> its default region
     */
    reconcile(known) {
        const ids = new Set(Object.keys(known));
        for (const region of REGIONS) {
            this.panels[region] = this.panels[region].filter((id) => ids.has(id));
        }
        for (const [id, region] of Object.entries(known)) {
            if (!this.regionOf(id)) this.move(id, REGIONS.includes(region) ? region : 'left');
        }
        for (const id of [...this.collapsed]) if (!ids.has(id)) this.collapsed.delete(id);
        return this;
    }

    toJSON() {
        return { panels: this.panels, sizes: this.sizes, collapsed: [...this.collapsed] };
    }

    /** Persist. Storage failures are ignored: a layout is not worth a throw. */
    save(key, storage = globalThis.localStorage) {
        try { storage?.setItem(key, JSON.stringify(this.toJSON())); } catch { /* private mode */ }
        return this;
    }

    /**
     * Load a layout, reconcile it against the panels that exist, and fall
     * back to the defaults if anything about the stored value is wrong.
     *
     * @param {string} key
     * @param {Record<string, string>} known panel id -> default region
     */
    static restore(key, known, storage = globalThis.localStorage) {
        let stored = null;
        try { stored = JSON.parse(storage?.getItem(key) ?? 'null'); } catch { stored = null; }
        const layout = new DockLayout(stored && typeof stored === 'object' ? stored : {});
        return layout.reconcile(known);
    }
}

/**
 * Bind a layout to the DOM.
 *
 * @param {HTMLElement} root
 * @param {DockLayout} layout
 * @param {object} [options]
 * @param {Function} [options.onChange] called whenever the layout changes
 * @returns {{apply: Function, destroy: Function}}
 */
export function mountDock(root, layout, { onChange = null } = {}) {
    const regionEl = {};
    for (const region of REGIONS) {
        regionEl[region] = root.querySelector(`[data-dock-region="${region}"]`);
    }
    const panelEl = new Map();
    for (const el of root.querySelectorAll('[data-panel]')) {
        panelEl.set(el.dataset.panel, el);
    }

    const changed = () => { apply(); onChange?.(layout); };

    function apply() {
        for (const region of REGIONS) {
            const host = regionEl[region];
            if (!host) continue;
            for (const id of layout.order(region)) {
                const el = panelEl.get(id);
                // appendChild moves an element that is already elsewhere,
                // so ordering and re-homing are the same operation.
                if (el) host.appendChild(el);
            }
            host.hidden = layout.order(region).length === 0;
        }
        for (const [id, el] of panelEl) {
            el.classList.toggle('collapsed', layout.isCollapsed(id));
        }
        for (const [region, px] of Object.entries(layout.sizes)) {
            root.style.setProperty(`--dock-${region}`, `${px}px`);
        }
    }

    /** The region whose container contains a viewport point. */
    function regionAt(x, y) {
        for (const region of REGIONS) {
            const el = regionEl[region];
            if (!el || el.hidden) continue;
            const r = el.getBoundingClientRect();
            if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return region;
        }
        return null;
    }

    const listeners = [];
    const on = (el, type, fn, opts) => {
        el.addEventListener(type, fn, opts);
        listeners.push(() => el.removeEventListener(type, fn, opts));
    };

    // --- drag a panel header into another region
    for (const [id, el] of panelEl) {
        const header = el.querySelector('[data-panel-header]');
        if (!header) continue;
        on(header, 'pointerdown', (event) => {
            if (event.button !== 0 || event.target.closest('button')) return;
            // Pointer capture, so the drag survives the pointer leaving the
            // header -- which it does immediately, since the point of the
            // gesture is to go somewhere else.
            header.setPointerCapture(event.pointerId);
            const start = { x: event.clientX, y: event.clientY };
            let moved = false;

            const move = (e) => {
                if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 4) {
                    moved = true;
                    el.classList.add('dragging');
                }
                if (moved) {
                    const over = regionAt(e.clientX, e.clientY);
                    for (const region of REGIONS) {
                        regionEl[region]?.classList.toggle('drop-target', region === over);
                    }
                }
            };
            const up = (e) => {
                header.releasePointerCapture?.(event.pointerId);
                header.removeEventListener('pointermove', move);
                header.removeEventListener('pointerup', up);
                el.classList.remove('dragging');
                for (const region of REGIONS) regionEl[region]?.classList.remove('drop-target');
                if (!moved) return;
                const over = regionAt(e.clientX, e.clientY);
                if (over && over !== layout.regionOf(id)) {
                    layout.move(id, over);
                    changed();
                }
            };
            header.addEventListener('pointermove', move);
            header.addEventListener('pointerup', up);
        });
    }

    // --- drag a splitter to resize
    for (const splitter of root.querySelectorAll('[data-dock-splitter]')) {
        const region = splitter.dataset.dockSplitter;
        on(splitter, 'pointerdown', (event) => {
            if (event.button !== 0) return;
            splitter.setPointerCapture(event.pointerId);
            const host = regionEl[region];
            const rect = host.getBoundingClientRect();
            const vertical = region === 'bottom';
            const move = (e) => {
                // Measured from the far edge, so the handle stays under the
                // pointer instead of drifting by the drag's own offset.
                const px = vertical ? rect.bottom - e.clientY
                    : region === 'right' ? rect.right - e.clientX
                        : e.clientX - rect.left;
                layout.resize(region, px);
                apply();
            };
            const up = () => {
                splitter.releasePointerCapture?.(event.pointerId);
                splitter.removeEventListener('pointermove', move);
                splitter.removeEventListener('pointerup', up);
                onChange?.(layout);
            };
            splitter.addEventListener('pointermove', move);
            splitter.addEventListener('pointerup', up);
        });
    }

    // --- collapse buttons
    for (const button of root.querySelectorAll('[data-panel-collapse]')) {
        on(button, 'click', () => {
            layout.toggleCollapse(button.dataset.panelCollapse);
            changed();
        });
    }

    apply();
    return {
        apply,
        destroy: () => { for (const off of listeners) off(); },
    };
}
