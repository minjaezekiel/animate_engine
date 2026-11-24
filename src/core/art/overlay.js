/**
 * The screen-space overlay: subtitles, titles and callouts, as a draw list.
 *
 * # What was missing
 *
 * The 2D path has had subtitles since the first phase -- a `kind: 'text'`
 * node with `screenSpace: true`, drawn by the canvas2d backend. The 3D path
 * has no 2D renderer at all, so `compile3d` has carried a `subtitle` flag on
 * every line of dialogue since Phase 16 and **nothing has ever read it**.
 * Every 3D film in this repo is unsubtitled, which for a muted phone feed
 * means unwatchable.
 *
 * The same hole costs more than subtitles. An explainer -- a cutaway, an
 * exploded assembly, a diagram -- is mostly *labels*: a word beside a thing,
 * with a line pointing at it, that stays pointing at it while the camera
 * moves. There was no way to put a single word on screen over a 3D render.
 *
 * # Why one mechanism rather than three
 *
 * A subtitle is a text box at a fixed screen position. A title is a text box
 * at a fixed screen position. A callout is a text box at a *projected* screen
 * position with a leader line. They differ in where the position comes from
 * and nothing else, so they are one item type with two position sources, not
 * three subsystems with three sets of timing, fade and safe-area rules.
 *
 * # Why a draw list
 *
 * `overlayAt` returns primitives -- rects, lines, runs of text with resolved
 * positions -- and `render/Overlay2D.js` executes them on a 2D context. The
 * split is not ceremony: layout is where the bugs are (a caption wrapped past
 * the frame, a label sitting on top of the subtitle band, text anchored on
 * its last line, a leader line drawn to a node behind the camera) and every
 * one of those is now a Node assertion over a plain array instead of
 * something you find by looking at frame 847.
 *
 * It is the same conclusion `staging3d.js` reached: judge in core, measure
 * where the pixels are.
 */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

const DEFAULTS = {
    safe: 0.05,
    subtitle: {
        font: '600 34px "Helvetica Neue", Helvetica, Arial, sans-serif',
        fill: '#f4f7fb',
        band: 'rgba(8,11,16,0.62)',
        bandPad: 14,
        radius: 10,
        lineHeight: 1.3,
        bottom: 0.075,
        maxWidth: 0.82,
        align: 'center',
    },
    label: {
        font: '600 24px "Helvetica Neue", Helvetica, Arial, sans-serif',
        fill: '#eef3f8',
        band: 'rgba(8,11,16,0.55)',
        bandPad: 9,
        radius: 6,
        lead: 'rgba(238,243,248,0.75)',
        leadWidth: 1.5,
        dot: 3,
        lineHeight: 1.28,
    },
    title: {
        font: '700 62px "Helvetica Neue", Helvetica, Arial, sans-serif',
        fill: '#ffffff',
        lineHeight: 1.18,
        align: 'center',
    },
};

const merge = (base, over) => ({ ...base, ...(over ?? {}) });

/**
 * Validate and fill in an overlay spec. Never throws; a bad item is dropped
 * with a warning, like every other diagnostic on this path.
 */
export function normalizeOverlay(spec, warn = () => {}, { designHeight = 1080 } = {}) {
    if (!spec) return null;
    const styles = {
        /**
         * The frame height these pixel sizes were authored for.
         *
         * Everything positional in this module is a FRACTION of the frame,
         * and everything typographic is in PIXELS -- which means a spec
         * authored for 1920x1080 and rendered at 960x540 draws type at twice
         * its intended relative size. That is not hypothetical: the staging
         * check renders at 960x540 and the film at 1920x1080, so the check
         * was measuring a 38px caption as if it were 76, and reporting a
         * subtitle band two lines deeper than the one the film actually has.
         *
         * The 2D path learned the same lesson in Phase 30 from the other
         * direction, when a 1080x1920 film put its subtitles at `1920 - 64`.
         * Absolute pixels in a layout that is otherwise relative is the bug.
         */
        designHeight,
        safe: spec.safe ?? DEFAULTS.safe,
        subtitle: merge(DEFAULTS.subtitle, spec.subtitle),
        label: merge(DEFAULTS.label, spec.label),
        title: merge(DEFAULTS.title, spec.title),
    };
    const items = [];
    for (const [i, raw] of (spec.items ?? []).entries()) {
        const where = `overlay.items[${i}]`;
        const kind = raw.kind ?? 'text';
        if (!['text', 'title', 'label'].includes(kind)) {
            warn(`unknown overlay kind '${kind}'`, where);
            continue;
        }
        if (!raw.text && !raw.lines) { warn('an overlay item needs `text` or `lines`', where); continue; }
        if (kind === 'label' && !raw.anchor && !raw.at3) {
            warn('a label needs `anchor` (a node id) or `at3` (a world point)', where);
            continue;
        }
        const at = raw.at ?? 0;
        const dur = raw.for ?? 3;
        if (dur <= 0) { warn(`\`for\` is ${dur}; an item with no duration never shows`, where); continue; }
        items.push({
            kind,
            lines: raw.lines ?? [String(raw.text)],
            at, for: dur, end: at + dur,
            fade: raw.fade ?? 0.28,
            // Screen position as a FRACTION of the frame, so one spec serves
            // 1920x1080 and 1080x1920. A film that moves between the two
            // otherwise has every caption in a different place.
            x: raw.x ?? 0.5, y: raw.y ?? 0.5,
            anchor: raw.anchor ?? null,
            at3: raw.at3 ?? null,
            offset: raw.offset ?? [0, -52],
            align: raw.align ?? null,
            size: raw.size ?? null,
            weight: raw.weight ?? null,
            fill: raw.fill ?? null,
            band: raw.band ?? null,
            leader: raw.leader !== false,
            maxWidth: raw.maxWidth ?? null,
            id: raw.id ?? `item${i}`,
        });
    }
    return { ...styles, items, subtitles: [] };
}

/** `600 34px X` with the size swapped, for a per-item override. */
function restyle(font, size, weight) {
    if (!size && !weight) return font;
    const m = /^\s*(\d+)?\s*(\d+(?:\.\d+)?)px\s+(.*)$/.exec(font);
    if (!m) return font;
    return `${weight ?? m[1] ?? 400} ${size ?? m[2]}px ${m[3]}`;
}

const fontSizeOf = (font) => {
    const m = /(\d+(?:\.\d+)?)px/.exec(font);
    return m ? Number(m[1]) : 16;
};

/**
 * Greedy word wrap against a measured width.
 *
 * `measure` is supplied by the caller because text metrics live in the
 * renderer, and passing them in is what keeps this module pure. In Node a
 * test passes an approximation; in the browser it is `ctx.measureText`.
 *
 * A single word longer than the box is left to overflow rather than broken
 * mid-word: a hyphenation rule is a different job, and a broken word is
 * harder to read than a slightly wide line.
 */
export function wrapText(text, maxWidth, font, measure) {
    const words = String(text).split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const out = [];
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
        const trial = `${line} ${words[i]}`;
        if (measure(trial, font) <= maxWidth) line = trial;
        else { out.push(line); line = words[i]; }
    }
    out.push(line);
    return out;
}

/**
 * A text block with its band, positioned by its own box rather than by its
 * first or last line.
 *
 * `anchorY` is 'top' | 'middle' | 'bottom' and names which edge of the whole
 * BLOCK sits at y. That distinction cost four captions in Phase 35, where a
 * multi-line text part anchored on its last line and printed up through its
 * own heading. Doing it here means no caller has to know.
 */
function textBlock({ lines, x, y, font, fill, align, lineHeight, anchorY,
                     band, bandPad, radius, alpha, measure }) {
    const size = fontSizeOf(font);
    const step = size * lineHeight;
    const blockH = step * lines.length;
    const top = anchorY === 'bottom' ? y - blockH
        : anchorY === 'middle' ? y - blockH / 2
        : y;
    const widest = lines.reduce((w, l) => Math.max(w, measure(l, font)), 0);
    const ops = [];
    if (band) {
        const bx = align === 'center' ? x - widest / 2 - bandPad
            : align === 'right' ? x - widest - bandPad
            : x - bandPad;
        ops.push({
            op: 'rect', x: bx, y: top - bandPad * 0.7,
            w: widest + bandPad * 2, h: blockH + bandPad * 1.4,
            fill: band, radius, alpha,
        });
    }
    for (const [i, line] of lines.entries()) {
        ops.push({
            op: 'text', text: line, x, y: top + step * i + size * 0.82,
            font, fill, align: align ?? 'left', alpha,
        });
    }
    return { ops, width: widest, height: blockH, top, bottom: top + blockH };
}

/**
 * Fade in and out, as one number.
 *
 * Linear, and clamped so a fade longer than half the item's life does not
 * invert. A caption held for 0.4s with a 0.3s fade used to never reach full
 * opacity, which reads as a flicker rather than as a caption.
 */
function fadeAt(item, t) {
    if (t < item.at || t > item.end) return 0;
    const f = Math.min(item.fade, item.for / 2);
    if (f <= 0) return 1;
    return Math.min(1, Math.min(t - item.at, item.end - t) / f);
}

/**
 * The draw list for time `t`.
 *
 * `project(nodeIdOrPoint)` returns `{ x, y, behind }` in pixels, or null when
 * the node does not exist. `behind` is true when the point is behind the
 * camera, in which case the label is dropped -- a projected point behind the
 * camera comes back mirrored through the frame centre, so a label on the far
 * side of the globe used to appear on the near side pointing at nothing.
 */
export function overlayAt(overlay, t, { width, height, project, measure, items = true,
                                        subtitles = true }) {
    if (!overlay) return [];
    const ops = [];
    const safe = overlay.safe * height;
    // One scale factor for every pixel quantity: type, padding, radii,
    // leader widths and label offsets. See `designHeight`.
    const k = height / (overlay.designHeight || height);
    const px = (v) => v * k;

    // Labels first, subtitles last: the subtitle band is the one thing that
    // must never be occluded, so it is drawn over everything.
    for (const item of (items ? overlay.items : [])) {
        const alpha = fadeAt(item, t);
        if (alpha <= 0) continue;

        if (item.kind === 'label') {
            const p = project(item.anchor ?? item.at3);
            if (!p || p.behind) continue;
            const style = overlay.label;
            const font = restyle(style.font, (item.size ?? fontSizeOf(style.font)) * k,
                                 item.weight);
            const pad = px(style.bandPad);
            const maxW = (item.maxWidth ?? 0.3) * width;
            const lines = item.lines.flatMap((l) => wrapText(l, maxW, font, measure));
            const widest = lines.reduce((w, l) => Math.max(w, measure(l, font)), 0);

            /**
             * Which side the label sits on, and the FLIP when it does not fit.
             *
             * The side follows the sign of the offset, so a label on the left
             * of its anchor is right-aligned and grows leftward. That is
             * right until the anchor itself is near the left edge -- and a
             * camera move puts it there without the author doing anything.
             * The outer-core callout was authored at offset -108 and the shot
             * pushes in until its anchor is 10 px from the frame edge, so the
             * label ran from x = -225 to x = 40: a caption three-quarters off
             * screen, in a finished film, with nothing to say so.
             *
             * So the side is a PREFERENCE and the frame wins. Flipping costs
             * one comparison and removes a whole class of note that would
             * otherwise be "move this label" once per camera move.
             */
            let dx = px(item.offset[0]);
            const dy = px(item.offset[1]);
            let align = item.align ?? (dx < 0 ? 'right' : 'left');
            const fits = (a, d) => {
                const x = p.x + d;
                const left = a === 'right' ? x - widest - pad : x - pad;
                return left >= safe * 0.4 && left + widest + pad * 2 <= width - safe * 0.4;
            };
            if (!item.align && !fits(align, dx)) {
                const flipped = align === 'right' ? 'left' : 'right';
                if (fits(flipped, -dx)) { align = flipped; dx = -dx; }
            }
            const tx = p.x + dx;
            const ty = p.y + dy;
            const block = textBlock({
                lines, x: tx, y: ty, font, fill: item.fill ?? style.fill,
                align, lineHeight: style.lineHeight, anchorY: 'middle',
                band: item.band ?? style.band, bandPad: pad,
                radius: px(style.radius), alpha, measure,
            });
            if (item.leader) {
                // The leader stops at the text box rather than at its
                // baseline, and starts a few pixels off the anchor so the
                // dot is not buried under the line.
                const edgeX = align === 'right' ? tx + pad : tx - pad;
                ops.push({ op: 'line', x1: p.x, y1: p.y, x2: edgeX, y2: ty,
                           stroke: style.lead, width: px(style.leadWidth), alpha });
                ops.push({ op: 'dot', x: p.x, y: p.y, r: px(style.dot),
                           fill: style.lead, alpha });
            }
            ops.push(...block.ops);
            continue;
        }

        const style = item.kind === 'title' ? overlay.title : overlay.label;
        const font = restyle(style.font, (item.size ?? fontSizeOf(style.font)) * k,
                             item.weight);
        const align = item.align ?? style.align ?? 'center';
        const maxW = (item.maxWidth ?? 0.86) * width;
        const lines = item.lines.flatMap((l) => wrapText(l, maxW, font, measure));
        // `y` is a fraction, and clamped into the safe area: a title at
        // y: 0.02 on a phone sits under the status bar, which is the 2D
        // path's own subtitle-margin lesson arriving on the 3D path.
        const py = Math.min(Math.max(item.y * height, safe), height - safe);
        // `cx`, not `px`: `px()` is the scale helper, and shadowing it with a
        // number here made every item in this branch throw "px is not a
        // function" -- on the first frame, so the whole render died rather
        // than one caption going missing. Which is the better failure, but
        // worth a name that cannot collide.
        const cx = item.x * width;
        ops.push(...textBlock({
            lines, x: cx, y: py, font, fill: item.fill ?? style.fill,
            align, lineHeight: style.lineHeight, anchorY: 'middle',
            band: item.band ?? (item.kind === 'title' ? null : style.band),
            bandPad: px(style.bandPad), radius: px(style.radius), alpha, measure,
        }).ops);
    }

    // ------------------------------------------------------------ subtitles
    const span = subtitles ? overlay.subtitles.find((s) => t >= s.at && t < s.end) : null;
    if (span) {
        const st = overlay.subtitle;
        const font = restyle(st.font, fontSizeOf(st.font) * k);
        const lines = wrapText(span.text, st.maxWidth * width, font, measure);
        ops.push(...textBlock({
            lines, x: width / 2, y: height - st.bottom * height,
            font, fill: st.fill, align: st.align, lineHeight: st.lineHeight,
            anchorY: 'bottom', band: st.band, bandPad: px(st.bandPad),
            radius: px(st.radius), alpha: 1, measure,
        }).ops);
    }
    return ops;
}

/**
 * Dialogue spans for the subtitle track, from the jobs and the real audio.
 *
 * The same arithmetic `studio.js:attachSubtitles` does for 2D, lifted here so
 * both paths agree about the 0.25s hold after a line -- which exists because
 * a caption that vanishes on the last phoneme reads as cut off.
 */
export function subtitleSpans(lipsyncJobs, voiced) {
    const spans = [];
    for (const job of lipsyncJobs ?? []) {
        if (!job.subtitle || !job.text) continue;
        const cue = voiced?.cues?.find((c) => c.id === `${job.nodeId}@${job.at}`);
        const buf = cue ? voiced.buffers?.[cue.assetId] : null;
        const dur = buf?.duration ?? job.durationSec
            ?? Math.max(1.4, String(job.text).trim().split(/\s+/).length / 2.6);
        spans.push({ at: job.at, end: job.at + dur + 0.25, text: job.text });
    }
    return spans.sort((a, b) => a.at - b.at);
}

/**
 * Overlay problems a render would otherwise show you and nothing would say.
 *
 * Checked over the draw list, at sampled times, which is why the draw list
 * is a value: "is any text outside the frame" is one loop over an array, and
 * there is no equivalent question you can ask a canvas.
 */
export function checkOverlay(overlay, { width, height, fps = 24, duration, project, measure }) {
    const findings = [];
    if (!overlay) return findings;
    const seen = new Set();
    const k = height / (overlay.designHeight || height);
    const subtitleTop = height - overlay.subtitle.bottom * height
        - overlay.subtitle.bandPad * k * 2
        - fontSizeOf(overlay.subtitle.font) * k * overlay.subtitle.lineHeight * 2;
    for (let n = 0; n <= Math.round(duration * fps); n += Math.max(1, Math.round(fps / 4))) {
        const t = n / fps;
        // ITEMS ONLY. The first pass checked the whole draw list and
        // reported every subtitle for sitting in the subtitle band, which is
        // where a subtitle goes -- 28 findings, none of them real, burying
        // the two that were.
        for (const op of overlayAt(overlay, t,
                                   { width, height, project, measure, subtitles: false })) {
            if (op.op !== 'text') continue;
            const w = measure(op.text, op.font);
            const left = op.align === 'center' ? op.x - w / 2
                : op.align === 'right' ? op.x - w : op.x;
            const key = `${op.text}`;
            if ((left < 0 || left + w > width) && !seen.has(`off:${key}`)) {
                seen.add(`off:${key}`);
                findings.push({
                    severity: 'warning',
                    message: `overlay text "${op.text.slice(0, 40)}" runs outside the frame `
                        + `(${Math.round(left)}..${Math.round(left + w)} of ${width}) at ${t.toFixed(2)}s`,
                    location: 'overlay',
                });
            }
            // Anything in the subtitle band's rows will be printed through
            // by a caption. Phase 35 wrote this rule down for 2D as "nothing
            // below y=1430"; here it is derived from the style instead.
            if (op.y > subtitleTop && overlay.subtitles.length && !seen.has(`band:${key}`)) {
                seen.add(`band:${key}`);
                findings.push({
                    severity: 'warning',
                    message: `overlay text "${op.text.slice(0, 40)}" sits at y=${Math.round(op.y)}, `
                        + `inside the subtitle band (below ${Math.round(subtitleTop)})`,
                    location: 'overlay',
                });
            }
        }
    }
    return findings;
}
