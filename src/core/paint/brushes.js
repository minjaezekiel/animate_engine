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
 * | `aspect`, `angle`, `angleMode` | nib shape and orientation |
 * | `grain`, `grainScale`, `grainMode`, `grainSeed` | paper tooth |
 * | `wet`, `smudge`, `colorRate`, `sampleRadius` | colour pickup |
 * | `erase` | composite as destination-out instead of over |
 *
 * # `aspect` and `angleMode`: two different instruments
 *
 * `aspect` is the nib's width across its length. `angleMode` decides what
 * the angle is measured against, and the two choices are not variations of
 * one idea:
 *
 * * **`'fixed'`** — the nib is held at a constant angle to the *paper*, so
 *   the mark changes width as the stroke changes direction. A calligraphic
 *   pen, a chisel marker. That direction-dependent swell is most of what
 *   makes lettering read as lettering, and modelling it the other way
 *   produces a constant-width ribbon, which is precisely what it must not
 *   be.
 * * **`'follow'`** — the nib aligns with travel, plus `angle` as an
 *   offset. A flat bristle brush dragged edge-on.
 *
 * # `grainMode`: paper tooth belongs to the paper
 *
 * `'canvas'` locks the texture to canvas coordinates, so passing over the
 * same patch twice hits the same high points — which is what makes a dry
 * medium look dry. `'dab'` locks it to the dab, so the texture rotates and
 * scales with the nib; that is right when the texture *is* the tip shape,
 * a spatter or a bristle cluster, and wrong for paper, where it smears a
 * copy of the texture along the stroke and reads as a rubber stamp
 * repeated at high frequency.
 *
 * # `wet`: the only brushes that read the canvas
 *
 * A wet brush carries a reservoir that mixes with what is underneath.
 * `smudge` is how much canvas colour is picked up per dab and `colorRate`
 * is how much fresh paint is added — **independent controls**. Krita's
 * original colour-smudge engine coupled them, and separating them was the
 * central fix of their rewrite: coupled, you cannot ask for "drag existing
 * paint a long way while adding almost no new colour", which is most of
 * what blending a gradient is.
 *
 * Wet brushes composite dab by dab rather than through a coverage mask,
 * because each dab carries a different colour. That makes them inherently
 * sequential and the slowest brushes here.
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
    aspect: 1,
    angle: 0,
    angleMode: 'fixed',
    grain: 0,
    grainScale: 1,
    grainMode: 'canvas',
    grainSeed: 1,
    wet: false,
    smudge: 0,
    colorRate: 1,
    sampleRadius: 0,
    erase: false,
};

/** Degrees to radians, so brush records can be written in degrees. */
const deg = (d) => (d * Math.PI) / 180;

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
        grain: 0.45,
        grainScale: 1.1,
        grainSeed: 11,
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
        grain: 0.7,
        grainScale: 2.2,
        grainSeed: 23,
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
        grain: 0.6,
        grainScale: 1.6,
        grainSeed: 31,
    },

    /**
     * A chisel marker, held at a fixed 45 degrees. The stroke is broad
     * across one diagonal and thin across the other, so it swells and
     * narrows purely from where the line is going.
     */
    chiselMarker: {
        ...BASE,
        size: 34,
        hardness: 0.7,
        flow: 0.55,
        spacing: 0.04,
        minSize: 0.95,
        aspect: 0.3,
        angle: deg(45),
    },

    /**
     * A broad-edge calligraphic nib. Narrower and harder than the chisel
     * marker, at the conventional 30-degree hand, with a taper so entries
     * and exits thin out as a real nib does when it lifts.
     */
    calligraphy: {
        ...BASE,
        size: 30,
        hardness: 0.95,
        flow: 1,
        spacing: 0.03,
        minSize: 0.85,
        aspect: 0.14,
        angle: deg(-30),
        taper: 0.5,
        taperMin: 0.35,
    },

    /**
     * A flat bristle brush dragged edge-on: `angleMode: 'follow'`, so the
     * nib turns with the stroke and the ribbon keeps its width. Grain is
     * dab-locked here because the texture *is* the bristle cluster, not
     * the paper.
     */
    flatBristle: {
        ...BASE,
        size: 30,
        hardness: 0.5,
        flow: 0.7,
        spacing: 0.035,
        minSize: 0.7,
        aspect: 0.38,
        angleMode: 'follow',
        angle: deg(90),
        grain: 0.55,
        grainMode: 'dab',
        grainSeed: 47,
    },

    /**
     * Watercolour. Heavy pickup and very little fresh paint, so colours
     * run into one another instead of covering, and build-up accumulation
     * so repeated passes deepen rather than cap.
     */
    watercolor: {
        ...BASE,
        size: 44,
        hardness: 0.12,
        flow: 0.3,
        opacity: 0.85,
        spacing: 0.04,
        mode: 1,
        minFlow: 0.3,
        wet: true,
        smudge: 0.62,
        colorRate: 0.14,
        sampleRadius: 0,
    },

    /**
     * Oil paint. Balanced pickup and fresh colour, so a stroke both
     * carries and deposits, with canvas grain for the weave.
     */
    oil: {
        ...BASE,
        size: 26,
        hardness: 0.6,
        flow: 0.95,
        spacing: 0.03,
        minSize: 0.8,
        aspect: 0.6,
        angleMode: 'follow',
        angle: deg(90),
        wet: true,
        smudge: 0.45,
        colorRate: 0.42,
        grain: 0.3,
        grainScale: 1.4,
        grainSeed: 53,
    },

    /**
     * Pure smear: picks up everything, deposits no new colour. This is the
     * case that `smudge` and `colorRate` being independent exists for --
     * with them coupled it cannot be expressed at all.
     */
    smudge: {
        ...BASE,
        size: 36,
        hardness: 0.3,
        flow: 1,
        spacing: 0.02,
        wet: true,
        smudge: 0.9,
        colorRate: 0,
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
