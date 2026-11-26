/**
 * Sprite sheets and atlases: one image, many frames.
 *
 * # Why there is almost nothing here
 *
 * The 2D renderer has been able to draw part of an image since Phase 26 --
 * `drawImageNode` takes `sx`/`sy`/`sw`/`sh` and blits a sub-rectangle --
 * and `schema.js` has listed `frames`, `grid`, `pivot` and `fit` as known
 * asset keys since the asset pipeline landed. **Nothing read them.** That is
 * the same shape as `displacementMap` in Phase 61 and `ssao` in Phase 51: a
 * declared capability with no arithmetic behind it, which looks exactly like
 * a feature until somebody uses it.
 *
 * So this file is the arithmetic, and nothing else. A sheet becomes a
 * **swap set** on the channel `frame`, which means every verb that already
 * drives a swap channel drives a sprite sheet with no further work:
 *
 *   - `set   target: hero, channel: props.frame, value: "3"`
 *   - `expose sheet: "4 4 2 1 1 2"` -- an X-sheet, which is what limited
 *     animation actually is, and already implemented (Phase 31)
 *   - a named cycle in `character.actions`, looped
 *
 * Adding a verb would have been the obvious move and the wrong one: the
 * engine already had three ways to say "hold this drawing, then that one".
 */

/** Keys an asset may use to describe its sheet, so a typo is a diagnostic. */
export const SHEET_KEYS = ['grid', 'frames', 'margin', 'spacing', 'pivot', 'fit', 'count'];

/**
 * The sub-rectangles of a sheet, in source pixels.
 *
 *   grid: [cols, rows]      a regular sheet, the common case
 *   frames: [[x,y,w,h], …]  an atlas, where the packer chose the layout
 *   margin / spacing        the border around the sheet and the gutter
 *                           between cells, both in pixels
 *   count                   stop early: a 4x4 grid holding 13 drawings has
 *                           three blank cells, and cycling through them is a
 *                           stutter nobody authored
 *
 * Returns `[]` rather than throwing, so a malformed sheet draws the whole
 * image and reports -- the behaviour that was there before this existed.
 */
export function sheetFrames({ grid, frames, width = 0, height = 0,
                              margin = 0, spacing = 0, count = null } = {}) {
    if (Array.isArray(frames) && frames.length) {
        return frames
            .filter((f) => Array.isArray(f) && f.length >= 4 && f.every(Number.isFinite))
            .map(([x, y, w, h]) => ({ sx: x, sy: y, sw: w, sh: h }));
    }
    if (!Array.isArray(grid) || grid.length < 2) return [];
    const [cols, rows] = grid.map((n) => Math.floor(n));
    if (!(cols > 0 && rows > 0) || !(width > 0 && height > 0)) return [];
    // The cell size is DERIVED, never declared, for the same reason a film's
    // duration is: a sheet that disagrees with itself is unfixable from the
    // outside, and the image already knows how big it is.
    const sw = (width - margin * 2 - spacing * (cols - 1)) / cols;
    const sh = (height - margin * 2 - spacing * (rows - 1)) / rows;
    if (!(sw > 0 && sh > 0)) return [];
    const out = [];
    const limit = count != null ? Math.min(count, cols * rows) : cols * rows;
    for (let i = 0; i < limit; i++) {
        const c = i % cols, r = Math.floor(i / cols);
        out.push({ sx: margin + c * (sw + spacing), sy: margin + r * (sh + spacing), sw, sh });
    }
    return out;
}

/**
 * Frames -> a swap set for the `frame` channel.
 *
 * Each member also carries the DESTINATION size, because a sheet's cell and
 * the image's full size are different numbers and `drawImageNode` falls back
 * to the whole image when `w`/`h` are absent -- so a sheet without this
 * draws one cell stretched across the footprint of the entire sheet. That is
 * a failure with no error message and a very confusing picture.
 *
 * `pivot` is where inside a cell the part's origin sits, in cell fractions:
 * `[0.5, 1]` is "centred, standing on its feet", which is what a walk cycle
 * wants and what the centre would get wrong by half a body height.
 */
export function sheetSwap(frames, { scale = 1, pivot = null, fit = null } = {}) {
    const shapes = {};
    for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        const w = f.sw * scale, h = f.sh * scale;
        const m = { ...f, w, h };
        if (fit) m.fit = fit;
        if (pivot) { m.ax = pivot[0] * w; m.ay = pivot[1] * h; }
        else { m.cx = true; m.cy = true; }
        shapes[String(i)] = m;
    }
    return shapes;
}

/**
 * Everything a sheet needs, as props to merge onto an image part.
 *
 * Returns `null` when the asset is not a sheet, so the caller's fast path is
 * one falsy check and nothing about a plain image changes.
 */
export function sheetProps(spec, image, { scale = 1 } = {}) {
    if (!spec || (!spec.grid && !spec.frames)) return null;
    const frames = sheetFrames({
        ...spec, width: image?.width ?? 0, height: image?.height ?? 0,
    });
    if (!frames.length) return null;
    const shapes = sheetSwap(frames, { scale, pivot: spec.pivot, fit: spec.fit });
    return {
        swapSets: { frame: shapes },
        swapDefaults: { frame: '0' },
        frameCount: frames.length,
    };
}
