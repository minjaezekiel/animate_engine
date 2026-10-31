/**
 * Diagram, title and caption helpers for a 9:16 explainer.
 *
 * The engine has no lower-third, caption, arrow, chart or cross-section
 * primitive, and none of the four demo films puts a single word of text on
 * screen. Rather than add an authoring layer to the engine on a guess, this
 * lives beside the film that needs it -- the same place
 * `scripts/make-orderblock.mjs` keeps its slide and gesture helpers.
 *
 * Two engine facts shape everything here:
 *
 * 1. **Scenery cannot be the target of an action.** `compile.js` resolves
 *    actions against cast roots only. So anything that animates is a
 *    `role: 'effect'` character cast into the scene, and only static backdrop
 *    stays as scenery. This is the pattern `demo/fight.json` uses for its
 *    `fx`, `bolt` and `lines` members.
 *
 * 2. **`set` writes one key, and its seed sits at t=0.** `seedChannel` keys
 *    the node's authored value at time zero with `step` easing, so a single
 *    `set` at t=8 with `smooth` easing ramps across the whole eight seconds.
 *    Every transition here is therefore a *pair* of keys: hold the old value
 *    at the start of the window, reach the new one at its end.
 */

// ---------------------------------------------------------------------------
// The frame
// ---------------------------------------------------------------------------

export const W = 1080;
export const H = 1920;

/**
 * Phone UI eats the top and bottom of a 9:16 frame -- TikTok's caption and
 * action rail, Instagram's header. Nothing that has to be read goes outside
 * this box, and the stage below sits inside a centred 1080x1350 core so a 4:5
 * or 1:1 crop still reads.
 */
export const SAFE = { x0: 60, x1: 1020, y0: 260, y1: 1480 };

export const KICKER_Y = 318;        // "PART 3"
export const TITLE_Y = 392;         // the part's name
export const STAGE = { cx: 540, cy: 850, top: 450, bottom: 1250, w: 960, h: 800 };
export const GROUND_Y = 1250;       // where characters stand
export const CAPTION_Y = 1322;      // one line of on-screen text
/**
 * Narration sits between here and `SUBTITLE_BOTTOM`, growing UPWARD. Four
 * wrapped lines at this size is 190px, so nothing else may live below
 * `CAPTION_Y` -- which is why the stage stops at 1250 rather than filling the
 * frame. Before the text wrapped, a long line simply ran off both edges and
 * the collision was invisible.
 */
export const SUBTITLE_BOTTOM = 1560;

/**
 * Pinned, not inherited. `shapes.js` hands a raw CSS font string to
 * `ctx.font`, and headless Chrome resolves `system-ui` to something other
 * than the desktop app does -- so a render would not match a preview. This is
 * the stack the 3D text panels already hardcode.
 */
export const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

export const TYPE = {
    kicker:  `700 38px ${FONT}`,
    title:   `800 74px ${FONT}`,
    heading: `700 54px ${FONT}`,
    caption: `600 42px ${FONT}`,
    label:   `600 34px ${FONT}`,
    small:   `600 28px ${FONT}`,
    number:  `800 92px ${FONT}`,
    credit:  `700 36px ${FONT}`,
};

/** One colour, one meaning, for all ten parts. */
export const PALETTE = {
    bg:        '#0d1420',
    panel:     '#141d2d',
    ink:       '#f2efe6',
    dim:       '#8ea0b8',
    gold:      '#ffc64d',
    fluid:     '#e2663c',
    water:     '#4aa3d8',
    sulphide:  '#b8a86a',
    structure: '#e24a6a',
    granite:   '#cfc3b8',
    greenstone:'#3f5d4a',
    soil:      '#6b5a44',
    quartz:    '#e8e4da',
    basalt:    '#2f4150',
};

// ---------------------------------------------------------------------------
// Path building
// ---------------------------------------------------------------------------

/** One decimal is plenty at 1080 wide, and keeps the film JSON readable. */
const n = (v) => {
    const r = Math.round(v * 10) / 10;
    return Object.is(r, -0) ? 0 : r;
};

export const M = (x, y) => `M${n(x)},${n(y)}`;
export const L = (x, y) => `L${n(x)},${n(y)}`;
export const C = (x1, y1, x2, y2, x, y) =>
    `C${n(x1)},${n(y1)} ${n(x2)},${n(y2)} ${n(x)},${n(y)}`;
export const Q = (x1, y1, x, y) => `Q${n(x1)},${n(y1)} ${n(x)},${n(y)}`;
export const Z = 'Z';

/** A polyline through points, as path data. */
export const poly = (points, close = false) =>
    points.map(([x, y], i) => (i ? L(x, y) : M(x, y))).join(' ') + (close ? Z : '');

/**
 * A smooth curve through points (Catmull-Rom converted to cubics). Used for
 * spectral curves, variograms and grade-tonnage curves, where a polyline
 * would read as data rather than as a trend.
 */
export function smooth(points, tension = 0.5) {
    if (points.length < 3) return poly(points);
    let d = M(...points[0]);
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i - 1] ?? points[i];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[i + 2] ?? p2;
        const k = tension / 3;
        d += ' ' + C(p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k,
                     p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k,
                     p2[0], p2[1]);
    }
    return d;
}

/** A straight arrow with a solid head, as one closed path. */
export function arrowPath(from, to, { head = 22, width = 0 } = {}) {
    const [x0, y0] = from;
    const [x1, y1] = to;
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const ux = (x1 - x0) / len;
    const uy = (y1 - y0) / len;
    const bx = x1 - ux * head;
    const by = y1 - uy * head;
    const px = -uy;
    const py = ux;
    const shaft = width
        ? poly([[x0 + px * width / 2, y0 + py * width / 2],
                [bx + px * width / 2, by + py * width / 2],
                [bx - px * width / 2, by - py * width / 2],
                [x0 - px * width / 2, y0 - py * width / 2]], true)
        : `${M(x0, y0)} ${L(bx, by)}`;
    const headPath = `${M(x1, y1)} ${L(bx + px * head * 0.42, by + py * head * 0.42)} `
        + `${L(bx - px * head * 0.42, by - py * head * 0.42)} ${Z}`;
    return `${shaft} ${headPath}`;
}

/** A curved arrow, for flow and "this becomes that". */
export function curveArrow(from, to, bow = 0.25, { head = 22 } = {}) {
    const [x0, y0] = from;
    const [x1, y1] = to;
    const mx = (x0 + x1) / 2;
    const my = (y0 + y1) / 2;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const cx = mx - dy * bow;
    const cy = my + dx * bow;
    // The head points along the tangent at the end, which for a quadratic is
    // the direction from the control point to the end point.
    const len = Math.hypot(x1 - cx, y1 - cy) || 1;
    const ux = (x1 - cx) / len;
    const uy = (y1 - cy) / len;
    const bx = x1 - ux * head;
    const by = y1 - uy * head;
    return `${M(x0, y0)} ${Q(cx, cy, bx, by)} `
        + `${M(x1, y1)} ${L(bx - uy * head * 0.42, by + ux * head * 0.42)} `
        + `${L(bx + uy * head * 0.42, by - ux * head * 0.42)} ${Z}`;
}

// ---------------------------------------------------------------------------
// Parts: the pieces an effect character is made of
// ---------------------------------------------------------------------------

/**
 * Every diagram part starts invisible. A reveal then has something to ramp
 * from, and a part nobody reveals is simply never seen -- which is the right
 * default for a build-up, and the opposite of a character's rest pose.
 */
const part = (id, shape, { at = [0, 0], z = 0, alpha = 0, ...rest } = {}) =>
    ({ id, parent: null, pivot: [0, 0], at, shape, z, alpha, ...rest });

/** Rough advance width. Enough to keep text inside the frame without metrics. */
export const widthOf = (text, font) => {
    const px = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16);
    return text.length * px * 0.54;
};

export const textPart = (id, text, {
    at = [0, 0], font = TYPE.label, fill = 'ink', align = 'center',
    baseline = 'middle', maxWidth, ...rest
} = {}) => part(id, {
    kind: 'text', text, font, align, baseline,
    ...(maxWidth ? { maxWidth } : {}),
}, { at, fill, ...rest });

export const pathPart = (id, d, opts = {}) => part(id, { kind: 'path', d }, opts);

export const rectPart = (id, w, h, opts = {}) =>
    part(id, { kind: 'rect', w, h, cx: true, cy: true }, opts);

export const ellipsePart = (id, rx, ry, opts = {}) =>
    part(id, { kind: 'ellipse', rx, ry }, opts);

/**
 * A label with a leader line to the thing it names -- two parts that reveal
 * together, which is why they share an id prefix.
 *
 * The anchor is **clamped inside the safe area** and the text is given a
 * `maxWidth` so it wraps rather than running off the edge. A label placed at
 * x=880 reading "shear zone" left-aligned ran a third of the way off the
 * frame, and nothing reported it: text has no bounds the staging checker
 * can see.
 */
export function labelParts(id, text, at, pointsTo, {
    font = TYPE.label, fill = 'ink', stroke = 'dim', align, z = 40,
    // Where the leader leaves the label. The default starts it at the text
    // ANCHOR, which for a left-aligned label is its left edge -- so a leader
    // pointing right runs straight through its own words. Opt-in rather than
    // changed outright, so no existing film moves.
    leadAt = null,
} = {}) {
    // Grow away from the nearer edge: a label on the right of the frame reads
    // right-aligned, ending at its anchor.
    const side = align ?? (at[0] > 540 ? 'right' : 'left');
    const room = side === 'right' ? at[0] - SAFE.x0
        : side === 'left' ? SAFE.x1 - at[0]
        : Math.min(at[0] - SAFE.x0, SAFE.x1 - at[0]) * 2;
    const x = side === 'right' ? Math.min(at[0], SAFE.x1)
        : side === 'left' ? Math.max(at[0], SAFE.x0)
        : at[0];
    const maxWidth = Math.max(160, Math.min(room, SAFE.x1 - SAFE.x0));
    const out = [textPart(`${id}`, text, {
        at: [x, at[1]], font, fill, z, align: side, maxWidth,
    })];
    if (pointsTo) {
        const [lx, ly] = leadAt ?? [x, at[1]];
        out.push(pathPart(`${id}_lead`, `${M(lx, ly)} ${L(...pointsTo)}`,
            { stroke, strokeWidth: 2, z: z - 1 }));
    }
    return out;
}

/** A role:'effect' character: a container for diagram parts. */
export const effect = (parts, { palette } = {}) =>
    ({ role: 'effect', ...(palette ? { palette } : {}), parts });

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

const t = (v) => +Number(v).toFixed(3);

/**
 * Ramp a channel on a part. Two keys, because a lone `set` interpolates from
 * the seed at t=0 (see the header note).
 *
 * **Easing belongs to the segment that STARTS at a key**, not the one that
 * arrives at it. Putting `step` on the leading key -- which looks like
 * "hold until the ramp begins" -- actually holds the start value across the
 * whole transition and then jumps. Every reveal, slide and pop in this series
 * was a hard cut until that was measured.
 *
 * What holds the value BEFORE `at` is the compiler's own seed: `seedChannel`
 * keys the authored value at t=0 with `step`, so the segment up to our first
 * key already holds. The trailing key takes `step` so the value stays put
 * afterwards instead of drifting toward whatever is keyed next.
 */
export function ramp(target, part, channel, at, span, from, to,
                     { ease = 'smooth', h } = {}) {
    return [
        { target, do: 'set', part, channel, value: from, at: t(at), ease,
          ...(h ? { h } : {}) },
        { target, do: 'set', part, channel, value: to, at: t(at + span), ease: 'step' },
    ];
}

/** Fade a part in. */
export const reveal = (target, part, at, { span = 0.3, to = 1 } = {}) =>
    ramp(target, part, 'props.alpha', at, span, 0, to);

/** Fade a part out. */
export const conceal = (target, part, at, { span = 0.25, from = 1 } = {}) =>
    ramp(target, part, 'props.alpha', at, span, from, 0);

/**
 * Scale a part up from nothing, with a little overshoot. The engine's 3D path
 * has `grow` with an `overshoot` option; 2D has no such verb, so the
 * overshoot is a third key.
 */
export function pop(target, part, at, { span = 0.32, overshoot = 0.12, to = 1 } = {}) {
    const out = [];
    for (const axis of ['transform.sx', 'transform.sy']) {
        if (overshoot) {
            out.push(...ramp(target, part, axis, at, span * 0.68, 0, to * (1 + overshoot)),
                     ...ramp(target, part, axis, at + span * 0.68, span * 0.32,
                             to * (1 + overshoot), to));
        } else {
            out.push(...ramp(target, part, axis, at, span, 0, to));
        }
    }
    out.push(...reveal(target, part, at, { span: Math.min(0.18, span) }));
    return out;
}

/**
 * Move a part by an OFFSET from where it was authored.
 *
 * **`transform.x` is absolute, not a delta.** The compiler writes
 * `at[0] + pivot[0]` into it, so ramping it "from 0" does not mean "from
 * where it is" -- it teleports the part to the left edge of the character's
 * space and slides back from there. `origin` is the part's authored `at`, and
 * this does the arithmetic.
 */
export function glide(target, part, origin, at, span, [dx = 0, dy = 0] = [],
                      { ease = 'smooth' } = {}) {
    const [x, y] = origin;
    const out = [];
    if (dx) out.push(...ramp(target, part, 'transform.x', at, span, x, x + dx, { ease }));
    if (dy) out.push(...ramp(target, part, 'transform.y', at, span, y, y + dy, { ease }));
    return out;
}

/** Slide a part in from an offset while it fades up. */
export function slideIn(target, part, origin, at, { dx = 0, dy = 40, span = 0.4 } = {}) {
    return [
        ...reveal(target, part, at, { span: span * 0.7 }),
        ...glide(target, part, [origin[0] - dx, origin[1] - dy], at, span, [dx, dy]),
    ];
}

/** Stagger a build: one reveal per id, `gap` seconds apart. */
export function build(target, ids, at, { gap = 0.22, span = 0.3, how = reveal } = {}) {
    return ids.flatMap((id, i) => how(target, id, at + i * gap, { span }));
}

/**
 * Walk a character from `from` to `to` without the feet sliding.
 *
 * `play walk` and `move` are independent in the engine -- one tiles a cycle,
 * the other keys the root's position -- and nothing ties them together, so
 * every film in this repo slides its feet. `walkStride` says how far one
 * two-step cycle actually carries the character, so the travel time is the
 * distance divided by that, rounded to a WHOLE number of cycles: a partial
 * cycle ends the walk mid-stride with one foot in the air.
 *
 * Returns the duration it chose and where the character actually lands,
 * because the shot has to be at least that long and the arrival moves rather
 * than the stride stretching to meet it.
 */
export function walkTo(target, { from, to, stride, cadence = 0.9, at = 0 }) {
    const delta = to[0] - from[0];
    const cycles = Math.max(1, Math.round(Math.abs(delta) / stride));
    const span = cycles * cadence;
    const travelled = cycles * stride * (delta < 0 ? -1 : 1);
    const landing = [from[0] + travelled, to[1]];
    return {
        duration: span,
        landing,
        actions: [
            { target, do: 'play', action: 'walk', at: t(at), for: t(span) },
            { target, do: 'move', to: landing, at: t(at), for: t(span), ease: 'linear' },
        ],
    };
}


/**
 * Ramp a drawing's own reveal. `draw` targets the drawing id directly.
 *
 * This is how a line draws itself here. A part's `trim` looked like the
 * obvious route, but `shapes.js` reads it as an **object** (`{start, end,
 * offset}`) and the interpolator keys numbers, vectors, colours and discrete
 * values -- not objects -- so `trim` can only be stepped, not ramped. A
 * `drawing` animates `props.progress`, which is a scalar and is what the
 * engine built the `draw` verb for.
 */
export const drawOn = (id, at, span, { from = 0, to = 1, ease = 'smooth' } = {}) =>
    ({ target: id, do: 'draw', from, to, at: t(at), for: t(span), ease });

// ---------------------------------------------------------------------------
// Standing furniture
// ---------------------------------------------------------------------------

/** The kicker + title block every part opens with. */
export const titleParts = (kicker, title, lines = []) => [
    textPart('kicker', kicker, { at: [540, KICKER_Y], font: TYPE.kicker, fill: 'gold' }),
    textPart('title', title, { at: [540, TITLE_Y], font: TYPE.title, fill: 'ink',
                               maxWidth: SAFE.x1 - SAFE.x0 }),
    ...lines.map((line, i) => textPart(`sub${i}`, line, {
        at: [540, TITLE_Y + 58 + i * 46], font: TYPE.caption, fill: 'dim' })),
];

/** A single line of on-screen text under the stage. */
export const captionPart = (id, text, { y = CAPTION_Y, font = TYPE.caption, fill = 'ink' } = {}) =>
    textPart(id, text, { at: [540, y], font, fill, z: 60,
                         maxWidth: SAFE.x1 - SAFE.x0 });

/**
 * The end card. Named in full because the ask was explicit: say what made the
 * film, where the source is, and that contributions are welcome.
 */
export const END_CARD = {
    repo: 'github.com/minjaezekiel/jireX',
    engine: 'Jirex',
    parts: () => [
        textPart('ec_made', 'Animated with', {
            at: [540, 780], font: TYPE.caption, fill: 'dim' }),
        textPart('ec_name', 'JIREX', {
            at: [540, 880], font: `800 112px ${FONT}`, fill: 'gold' }),
        textPart('ec_what', 'an open-source browser animation engine', {
            at: [540, 956], font: TYPE.label, fill: 'dim' }),
        textPart('ec_repo', 'github.com/minjaezekiel/jireX', {
            at: [540, 1070], font: TYPE.credit, fill: 'ink' }),
        textPart('ec_lic', 'MIT licensed  ·  free to use and fork', {
            at: [540, 1124], font: TYPE.small, fill: 'dim' }),
        textPart('ec_call', 'Build a feature. Send a pull request.', {
            at: [540, 1210], font: TYPE.label, fill: 'gold' }),
    ],
    /** Staggered in over `span`, starting at `at`. */
    actions: (target, at) => build(target,
        ['ec_made', 'ec_name', 'ec_what', 'ec_repo', 'ec_lic', 'ec_call'],
        at, { gap: 0.18, span: 0.34 }),
};

// ---------------------------------------------------------------------------
// Scales: data to coordinates
// ---------------------------------------------------------------------------

/**
 * A linear scale, the way `make-orderblock.mjs` maps candles to boxes. Charts
 * are built from scale functions in the generator rather than from a chart
 * primitive, because the engine has none and a bar is a rect.
 */
export const scale = (d0, d1, r0, r1) => (v) => r0 + ((v - d0) / (d1 - d0)) * (r1 - r0);

/** A log scale, for anything spanning orders of magnitude (cost per hectare). */
export const logScale = (d0, d1, r0, r1) => {
    const l0 = Math.log10(d0);
    const l1 = Math.log10(d1);
    return (v) => r0 + ((Math.log10(v) - l0) / (l1 - l0)) * (r1 - r0);
};

// ---------------------------------------------------------------------------
// Flowing water
// ---------------------------------------------------------------------------

/**
 * Loop `props.flow` so a dashed stroke travels.
 *
 * `flow` counts whole dash periods, so a ramp of N over N * period seconds
 * moves one period per `period` and is seamless at every instant -- not only
 * at the ends. One key pair is therefore enough; per-cycle keys would be the
 * same line with more numbers in it.
 *
 * `ease` is linear and not negotiable. Water does not accelerate between
 * keys: `smooth` on a flow ramp produces a visible pulse once per cycle,
 * which reads as a stutter rather than as current.
 */
export function flowLoop(target, part, { period = 2, cycles = 8, at = 0, from = 0 } = {}) {
    return [
        { target, do: 'set', part, channel: 'props.flow', value: t(from),
          at: t(at), ease: 'linear' },
        { target, do: 'set', part, channel: 'props.flow', value: t(from + cycles),
          at: t(at + cycles * period), ease: 'linear' },
    ];
}

/**
 * A closed band of constant width around a centreline.
 *
 * Offsetting each point along the normal of the mean of its two adjacent
 * segment directions. Good enough for a river in a diagram; it will pinch on
 * a hairpin, which is why the banks below are drawn from the same points
 * rather than from the polygon's edges.
 */
export function bandPath(points, width) {
    const half = width / 2;
    const normals = points.map((p, i) => {
        const prev = points[Math.max(0, i - 1)];
        const next = points[Math.min(points.length - 1, i + 1)];
        const dx = next[0] - prev[0], dy = next[1] - prev[1];
        const len = Math.hypot(dx, dy) || 1;
        return [-dy / len, dx / len];
    });
    const left = points.map((p, i) => [p[0] + normals[i][0] * half, p[1] + normals[i][1] * half]);
    const right = points.map((p, i) => [p[0] - normals[i][0] * half, p[1] - normals[i][1] * half]);
    return `${smooth(left)} L${n(right[right.length - 1][0])},${n(right[right.length - 1][1])} `
        + `${smooth([...right].reverse()).slice(1)} ${Z}`;
}

/**
 * A river: a filled body, two banks, and streaks that travel.
 *
 * The streaks ARE the water. A filled blue shape is a lake however nicely it
 * is drawn; what reads as current is short highlights moving downstream at
 * slightly different speeds, which is also how flat 2D water has always been
 * faked. `lanes` places them across the channel, shorter and fainter toward
 * the banks because that is where real flow slows.
 *
 * Returns `{ parts, actions }` -- the actions are the flow loops, which need
 * the cast name the river is cast under.
 */
export function riverParts(id, points, {
    width = 150, lanes = 5, water = 'water', deep = 'waterDeep', foam = 'foam',
    bank = null, period = 2.2, cycles = 60, z = -40, dash = 0.22, lineWidth = 7,
} = {}) {
    const parts = [
        pathPart(`${id}_body`, bandPath(points, width), { fill: deep, z }),
        pathPart(`${id}_shallow`, bandPath(points, width * 0.62), { fill: water, z: z + 1 }),
    ];
    if (bank) {
        parts.push(pathPart(`${id}_bankL`, smooth(points.map(([x, y]) => [x, y - width / 2])),
                            { stroke: bank, strokeWidth: 5, z: z + 2 }));
        parts.push(pathPart(`${id}_bankR`, smooth(points.map(([x, y]) => [x, y + width / 2])),
                            { stroke: bank, strokeWidth: 5, z: z + 2 }));
    }
    const actions = [];
    for (let i = 0; i < lanes; i++) {
        // -1 .. 1 across the channel, avoiding the exact banks.
        const u = lanes === 1 ? 0 : (i / (lanes - 1)) * 1.6 - 0.8;
        const edge = Math.abs(u);
        const offset = u * (width / 2);
        const line = points.map(([x, y]) => [x, y + offset]);
        const sid = `${id}_f${i}`;
        parts.push(pathPart(sid, smooth(line), {
            stroke: edge > 0.55 ? foam : water,
            strokeWidth: Math.max(3, lineWidth * (1 - edge * 0.45)),
            alpha: 0.55 + 0.4 * (1 - edge),
            lineCap: 'round',
            z: z + 3 + i,
            // A short on-dash on a short period: several highlights down the
            // channel at once, not one streak chasing along it.
            trim: { end: dash * (1 - edge * 0.3), length: 150 + i * 23 },
            flow: 0,
        }));
        // Mid-channel runs fastest. Lanes at different speeds are what stops
        // the whole river reading as one sliding sheet.
        actions.push([sid, { period: period * (1 + edge * 0.5), cycles, from: i * 0.17 }]);
    }
    return { parts, actions };
}

/** The flow loops for a river, once its cast name is known. */
export const riverFlow = (target, actions, at = 0) =>
    actions.flatMap(([part, opts]) => flowLoop(target, part, { ...opts, at }));
