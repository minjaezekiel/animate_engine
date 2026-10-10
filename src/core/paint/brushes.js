/**
 * The brush library.
 *
 * A brush is a plain data record. Nothing here is executable, which keeps
 * the whole library serialisable into a `film.json`, diffable, and
 * writable by an agent that has never seen a tablet.
 *
 * ```js
 * import { brush, BRUSHES } from './brushes.js';
 * const b = brush('ink', { size: 32 });      // a named brush, with overrides
 * ```
 *
 * # The parameters, and what each one is for
 *
 * | field | effect |
 * |---|---|
 * | `size` | default diameter in px; a stroke may override it |
 * | `hardness` | edge profile. 1 is a hard round dab, 0 a full-radius falloff |
 * | `flow` | alpha deposited by one dab |
 * | `opacity` | strength of the finished stroke, applied once |
 * | `spacing` | dab interval as a fraction of diameter |
 * | `mode` | `0` peak, `1` build-up — see below, this is the big one |
 * | `minSize`, `sizeCurve` | pressure to diameter |
 * | `minFlow`, `flowCurve` | pressure to flow |
 * | `taper`, `taperMin` | entry and exit narrowing, in diameters |
 * | `jitterPos`, `jitterSize`, `jitterFlow` | granularity, for dry media |
 * | `erase` | composite as destination-out instead of over |
 *
 * # `flow` against `opacity`, and why both exist
 *
 * They are not redundant and confusing them is the most common way to get
 * a brush engine wrong.
 *
 * `flow` is how much a *single dab* deposits. `opacity` is how strong the
 * *finished stroke* is. Dabs overlap roughly tenfold at normal spacing,
 * so if a stroke were composited dab by dab, flow would compound and the
 * line would come out far darker than asked -- darker still wherever the
 * input was sampled densely, which is to say wherever the hand moved
 * slowly or a corner doubled back. The result records input sampling rate
 * instead of intent.
 *
 * So dabs accumulate into a coverage mask first and the mask is
 * composited **once** at `opacity`. That is what `raster.rs` implements,
 * and it is why these two fields are separate: `flow` shapes the mark,
 * `opacity` sets its strength.
 *
 * # `mode`, which is what actually distinguishes the brushes
 *
 * - **`0` peak** — `coverage = max(coverage, dab)`. The mark reaches the
 *   brush's flow and stops. Dwelling in one place changes nothing.
 *   This is a pen, a pencil, a marker: instruments that deposit a
 *   bounded amount of pigment per pass.
 *
 * - **`1` build-up** — `coverage += dab * (1 - coverage)`. Overlap
 *   accumulates toward opaque, so dwelling deposits more and a slow pass
 *   is darker than a quick one. This is an airbrush, and charcoal worked
 *   with a loaded stick.
 *
 * Every brush below is one of those two. A third mode would need an
 * instrument that wants one.
 */

/** Defaults, so a brush record only states what makes it distinctive. */
const BASE = {
    size: 16,
    hardness: 0.6,
    flow: 1,
    opacity: 1,
    spacing: 0.1,
    mode: 0,
    minSize: 1,
    sizeCurve: 1,
    minFlow: 1,
    flowCurve: 1,
    taper: 0,
    taperMin: 0.12,
    jitterPos: 0,
    jitterSize: 0,
    jitterFlow: 0,
    erase: false,
};

/**
 * The named brushes.
 *
 * Each is chosen so that its *behaviour* differs, not only its numbers --
 * a library of eight brushes that all respond identically is one brush
 * with eight sizes.
 */
export const BRUSHES = {
    /**
     * Graphite. The tooth of the paper is the whole character, so this is
     * the one brush where jitter carries the identity: pressure changes
     * how much graphite is laid down far more than how wide the line is,
     * which is why `minFlow` is low while `minSize` stays high.
     */
    pencil: {
        ...BASE,
        size: 4,
        hardness: 0.75,
        flow: 0.55,
        spacing: 0.055,
        minSize: 0.82,
        sizeCurve: 1.3,
        minFlow: 0.16,
        flowCurve: 1.5,
        taper: 0.9,
        taperMin: 0.55,
        jitterPos: 0.14,
        jitterSize: 0.3,
        jitterFlow: 0.42,
    },

    /**
     * A technical pen. Deliberately inert: no pressure response, no
     * taper, full flow, hard edge. Every other brush here varies with the
     * hand, so the library needs one that does not -- for lettering,
     * panel borders and anything that must look drafted rather than drawn.
     */
    pen: {
        ...BASE,
        size: 3,
        hardness: 1,
        flow: 1,
        spacing: 0.06,
    },

    /**
     * A flexible nib. The opposite of `pen`: size follows pressure hard
     * (`sizeCurve` below 1 makes it respond early in the stroke) and both
     * ends taper, which together give the swelling line of brush
     * lettering and comic inking.
     */
    ink: {
        ...BASE,
        size: 18,
        hardness: 0.92,
        flow: 1,
        spacing: 0.045,
        minSize: 0.08,
        sizeCurve: 0.7,
        taper: 1.6,
        taperMin: 0.05,
    },

    /**
     * A chisel marker. Wide, slightly soft, and -- the characteristic
     * part -- `flow` well below 1 in **peak** mode. So one pass is
     * translucent and uniform however slowly it is drawn, while a second
     * crossing pass darkens. That is exactly how marker ink behaves and it
     * is impossible to reproduce by compositing dabs individually.
     */
    marker: {
        ...BASE,
        size: 26,
        hardness: 0.55,
        flow: 0.5,
        spacing: 0.08,
        minSize: 0.95,
    },

    /**
     * Airbrush. The only brush whose identity is `mode: 1`: coverage
     * accumulates, so dwelling darkens and the stroke records speed. Very
     * soft edge and low flow, so it is built up in passes.
     */
    airbrush: {
        ...BASE,
        size: 48,
        hardness: 0.04,
        flow: 0.08,
        spacing: 0.035,
        mode: 1,
        minFlow: 0.1,
        flowCurve: 1.6,
    },

    /**
     * Charcoal. Build-up like the airbrush, but with heavy positional and
     * flow jitter, so it accumulates *unevenly* -- which is what reads as
     * a dry medium dragged across a surface rather than a sprayed one.
     */
    charcoal: {
        ...BASE,
        size: 22,
        hardness: 0.3,
        flow: 0.3,
        spacing: 0.05,
        mode: 1,
        minSize: 0.7,
        minFlow: 0.25,
        flowCurve: 1.3,
        jitterPos: 0.34,
        jitterSize: 0.4,
        jitterFlow: 0.55,
    },

    /**
     * Chalk. Granular like charcoal but **peak** mode, so a pass has a
     * ceiling and the grain stays legible instead of filling in. Harder
     * edge, for the crisper mark of a compressed stick.
     */
    chalk: {
        ...BASE,
        size: 20,
        hardness: 0.7,
        flow: 0.72,
        spacing: 0.07,
        minSize: 0.78,
        minFlow: 0.4,
        jitterPos: 0.26,
        jitterSize: 0.34,
        jitterFlow: 0.3,
    },

    /** Hard eraser. Composites destination-out at full strength. */
    eraser: {
        ...BASE,
        size: 24,
        hardness: 0.95,
        flow: 1,
        spacing: 0.06,
        erase: true,
    },

    /**
     * Soft eraser. Separate from `eraser` because feathering an erase is
     * the common case for lifting a highlight, and asking a user to
     * remember to drop hardness is a worse tool than offering both.
     */
    softEraser: {
        ...BASE,
        size: 56,
        hardness: 0.08,
        flow: 0.3,
        spacing: 0.04,
        mode: 1,
        erase: true,
    },
};

/** Names in the library, for a UI or an agent enumerating its options. */
export const BRUSH_NAMES = Object.keys(BRUSHES);

/**
 * Resolve a brush by name, with overrides.
 *
 * An unknown name throws rather than silently substituting a default. A
 * typo that quietly produces a different brush is the kind of defect that
 * survives until someone compares two renders side by side.
 *
 * @param {string|object} nameOrSpec a library name, or a full record
 * @param {object} [overrides]
 */
export function brush(nameOrSpec, overrides = {}) {
    if (typeof nameOrSpec === 'object' && nameOrSpec) {
        return { ...BASE, ...nameOrSpec, ...overrides };
    }
    const found = BRUSHES[nameOrSpec];
    if (!found) {
        throw new Error(
            `unknown brush "${nameOrSpec}"; available: ${BRUSH_NAMES.join(', ')}`);
    }
    return { ...found, ...overrides };
}
