/**
 * The procedural face: an enumerated kit, three views, two tones and a line.
 *
 * Why enumerated. An author -- especially an LLM -- is good at naming and
 * choosing and bad at inventing coordinate geometry, and has no cheap way to
 * check its own visual work. So every decision here is a name from a closed
 * set, and the geometry behind the name is written once, here, by someone who
 * can see it.
 *
 * Why views rather than rotation. You do not rotate a 2D face; a rotated
 * ellipse reads as a tilted egg, not a turned head. Cel animation swaps to a
 * drawn three-quarter or profile, which is exactly what Phase 9's swap sets
 * do -- so each feature carries a `view` set and one discrete channel turns
 * the whole head.
 *
 * Coordinate space. Everything is authored in the HEAD part's local space,
 * whose origin is the neck joint, with the skull centred at `CY` above it.
 * Geometry carries its own position because a swap set can only change props,
 * never a transform -- so a feature that moves between views has to move
 * inside its own path data.
 *
 * Pure: numbers in, path strings out.
 */

/** Skull centre above the neck joint, in head radii. */
export const CY = -0.92;

/** Facing amount per view, and whether the far eye survives. */
export const VIEWS = { front: 0, threeQuarter: 0.55, profile: 1 };
export const VIEW_NAMES = Object.keys(VIEWS);

const n = (v) => (Math.round(v * 100) / 100);
const pt = ([x, y]) => `${n(x)},${n(y)}`;
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

/**
 * A smooth closed curve through a polygon's midpoints.
 *
 * Quadratics with the polygon's corners as control points and its edge
 * midpoints as anchors. One helper, and every organic shape in the kit is a
 * short list of corners rather than hand-tuned Bezier handles -- which is the
 * only reason a kit this size is maintainable.
 */
export function smoothClosed(points) {
    const k = points.length;
    if (k < 3) return '';
    let d = `M${pt(mid(points[k - 1], points[0]))}`;
    for (let i = 0; i < k; i++) {
        d += ` Q${pt(points[i])} ${pt(mid(points[i], points[(i + 1) % k]))}`;
    }
    return `${d} Z`;
}

const circle = (cx, cy, r, sides = 8) => smoothClosed(
    Array.from({ length: sides }, (_, i) => {
        const a = (i / sides) * Math.PI * 2;
        // 1/cos(pi/sides) pushes the control polygon out so the smoothed
        // curve passes through radius r rather than inside it.
        const k = r / Math.cos(Math.PI / sides);
        return [cx + Math.cos(a) * k, cy + Math.sin(a) * k];
    }),
);

const lerp = (a, b, t) => a + (b - a) * t;
const lerpPts = (a, b, t) => a.map((p, i) => [lerp(p[0], b[i][0], t), lerp(p[1], b[i][1], t)]);

// ------------------------------------------------------------------- the kit

/**
 * Jaw: cheek, jaw-corner and chin half-widths. The silhouette is the single
 * biggest contributor to whether two characters read as different people.
 */
export const JAWS = {
    round:   { cheek: 1.00, jaw: 0.80, chin: 0.36 },
    square:  { cheek: 0.98, jaw: 0.96, chin: 0.62 },
    tapered: { cheek: 0.96, jaw: 0.60, chin: 0.20 },
    heavy:   { cheek: 1.06, jaw: 1.02, chin: 0.54 },
};

/** Eyes: half-width, upper-lid rise, lower-lid drop, and whether a white shows. */
export const EYES = {
    // Wider than tall. A near-circular eye reads as a googly cartoon eye, not
    // as a drawing -- the first sheet made that unmistakable.
    round:          { w: 0.21, up: 0.12, low: 0.10 },
    hooded:         { w: 0.22, up: 0.07, low: 0.08 },
    narrow:         { w: 0.23, up: 0.05, low: 0.05 },
    wide:           { w: 0.21, up: 0.16, low: 0.12 },
    'closed-happy': { w: 0.22, up: 0.09, low: 0.07, lidOnly: true },
};

/** Brows: height above the eye, thickness, and the tilt of the inner end. */
export const BROWS = {
    flat:   { rise: 0.30, thick: 0.055, arch: 0.02, tilt: 0.00 },
    arched: { rise: 0.34, thick: 0.045, arch: 0.10, tilt: -0.02 },
    heavy:  { rise: 0.26, thick: 0.095, arch: 0.03, tilt: 0.01 },
    thin:   { rise: 0.32, thick: 0.028, arch: 0.06, tilt: 0.00 },
    angled: { rise: 0.30, thick: 0.065, arch: 0.02, tilt: 0.09 },
};

/** Nose: length down from the eye line, width, and how far the tip juts. */
export const NOSES = {
    button:   { len: 0.20, w: 0.11, jut: 0.10 },
    straight: { len: 0.30, w: 0.09, jut: 0.14 },
    broad:    { len: 0.24, w: 0.17, jut: 0.12 },
    hooked:   { len: 0.32, w: 0.10, jut: 0.20, hook: 0.07 },
    small:    { len: 0.16, w: 0.09, jut: 0.08 },
};

/** Lips: a width multiplier on the generated mouth chart. */
export const LIPS = { full: 1.12, thin: 0.86, wide: 1.26, medium: 1.0 };

/** Ears: size and how far they stand out. */
export const EARS = {
    small:   { r: 0.13, out: 0.02 },
    round:   { r: 0.18, out: 0.05 },
    pointed: { r: 0.16, out: 0.04, point: 0.10 },
    none:    null,
};

/**
 * Expressions: named overrides, not rotations.
 *
 * A brow is redrawn rather than rotated, because rotating a brow about the
 * head origin swings it across the forehead. That is also how cel animation
 * does it, so the limitation and the idiom agree.
 */
export const EXPRESSIONS = {
    neutral:   {},
    angry:     { brow: 'angled', browRise: -0.06, browTilt: 0.10, eyes: 'narrow' },
    surprised: { brow: 'arched', browRise: 0.08, eyes: 'wide' },
    smug:      { brow: 'arched', browRise: 0.02, browTilt: -0.05, eyes: 'hooded' },
    weary:     { brow: 'flat', browRise: -0.03, browTilt: -0.06, eyes: 'hooded' },
    delighted: { brow: 'arched', browRise: 0.06, eyes: 'closed-happy' },
};

export const HAIRS = ['afro-large', 'afro-short', 'braids', 'short-fade', 'locs', 'wrap', 'bald'];

/** The whole vocabulary, for validation and for the reference document. */
export const FACE_KITS = {
    jaw: Object.keys(JAWS),
    eyes: Object.keys(EYES),
    brow: Object.keys(BROWS),
    nose: Object.keys(NOSES),
    lips: Object.keys(LIPS),
    ears: Object.keys(EARS),
    hair: HAIRS,
    expression: Object.keys(EXPRESSIONS),
    view: VIEW_NAMES,
};

export const DEFAULT_FACE = {
    jaw: 'round', eyes: 'round', brow: 'flat', nose: 'button',
    lips: 'medium', ears: 'round',
};

// -------------------------------------------------------------- silhouettes

/** Front skull outline, 14 corners clockwise from the crown. */
function frontOutline(k) {
    const m = (k.cheek + k.jaw) / 2;
    return [
        [0, -1.00], [0.70, -0.78], [1.00, -0.30], [k.cheek, 0.14],
        [m, 0.42], [k.jaw, 0.64], [k.chin, 0.90], [0, 1.00],
        [-k.chin, 0.90], [-k.jaw, 0.64], [-m, 0.42], [-k.cheek, 0.14],
        [-1.00, -0.30], [-0.70, -0.78],
    ];
}

/**
 * Profile outline, corner-for-corner with the front one so the two lerp.
 * Facing +x: brow ridge, nose, lip, chin, jaw line, then the back of the
 * skull, which is fuller than the front view's side because a head is deeper
 * than it is wide.
 */
function profileOutline(k, nose) {
    const tip = 1.02 + nose.jut * 2.9 + (nose.hook ?? 0) * 0.8;
    return [
        [0.10, -1.04], [0.78, -0.80], [0.98, -0.32],
        [tip, nose.len + 0.02],                            // nose tip, well clear
        [0.90, nose.len + 0.20],                           // under the nose, recessed
        [1.00, nose.len + 0.38],                           // lip
        [0.86 * (0.55 + k.chin * 0.8), 0.80], [0.48, 0.98],  // chin
        [-0.14, 0.94], [-0.74, 0.70], [-1.10, 0.28],
        [-1.26, -0.12], [-1.10, -0.58], [-0.60, -0.94],
    ];
}

const scalePts = (pts, W, R, sgn) => pts.map(([x, y]) => [sgn * x * W, CY * R + y * R]);

// ------------------------------------------------------------------- feature

/** Where a feature sits, given how far the head has turned. */
function layout(dir) {
    return {
        // The near eye rides toward the facing edge; the far eye crowds the
        // silhouette and narrows until it is gone.
        nearEyeX: 0.34 + 0.44 * dir,
        farEyeX: -(0.38 - 0.12 * dir),
        // Foreshortens in width only, and vanishes at full profile. A linear
        // ramp steep enough to reach zero by profile squeezed the
        // three-quarter eye into a vertical sliver that read as a dot.
        farEyeScale: dir >= 0.85 ? 0 : 1 - 0.55 * dir,
        eyeY: 0.04,
        browY: -0.26,
        // The drawn nose tracks the silhouette's nose tip, so the shape and
        // the outline agree instead of the nose floating on the cheek.
        noseX: 0.06 + 0.98 * dir,
        // An ear travels BACKWARD as the head turns -- it ends up behind the
        // eye, not in front of it. Sliding it only slightly inward left it
        // sitting on top of the eye in profile, which is what the sheet showed.
        // When a head turns to face +x you see the OTHER side of it, so the
        // ear that survives the turn is the far one, travelling forward from
        // the back of the skull. Carrying the near ear through instead walked
        // it across the middle of the face.
        earX: 1.00 - 0.30 * dir,            // the facing-side ear, before it is lost
        earBackX: -(1.00 - 0.76 * dir),     // the one you actually keep seeing
        earY: -0.02 + 0.08 * dir,
        earScale: 1 - 0.26 * dir,
        nearEarVisible: dir < 0.35,
    };
}

function eyePath(cx, cy, e, scale, R, W, sgn) {
    const w = e.w * scale * W * (sgn || 1);
    const up = e.up * R, low = e.low * R;
    const x = cx, y = cy;
    if (e.lidOnly) {
        // A closed lid is drawn as a thin CLOSED crescent, not an open arc.
        // An open arc still takes the node's fill, so a happy eye filled with
        // the eye-white colour and read as a pale blob.
        const t = Math.abs(up) * 0.34 + R * 0.012;
        return smoothClosed([
            [x - w, y + low * 0.3], [x, y - up], [x + w, y + low * 0.3],
            [x + w * 0.8, y + low * 0.3 + t], [x, y - up + t * 1.3], [x - w * 0.8, y + low * 0.3 + t],
        ]);
    }
    return smoothClosed([
        [x - w, y + low * 0.1],
        [x - w * 0.45, y - up],
        [x + w * 0.45, y - up * 0.88],
        [x + w, y + low * 0.15],
        [x + w * 0.45, y + low],
        [x - w * 0.45, y + low * 0.88],
    ]);
}

function browPath(cx, cy, b, scale, R, W, inner) {
    const w = b.w ?? 0.2;
    const halfW = w * scale * W;
    const th = b.thick * R;
    // `inner` is the sign pointing at the nose, so a tilt raises or drops the
    // end nearest the centre -- which is the whole of an angry brow.
    const tiltIn = b.tilt * R * inner * -1;
    const a = [cx - halfW, cy + b.arch * R * 0.2 + (inner < 0 ? tiltIn : 0)];
    const c = [cx + halfW, cy + b.arch * R * 0.2 + (inner > 0 ? tiltIn : 0)];
    const peak = [cx, cy - b.arch * R];
    return smoothClosed([
        a, peak, c, [c[0], c[1] + th], [peak[0], peak[1] + th * 1.2], [a[0], a[1] + th],
    ]);
}

function earPath(cx, cy, k, R, W, sgn) {
    const r = k.r * R, out = k.out * W * sgn;
    const pts = [
        [cx - r * 0.3 * sgn, cy - r],
        [cx + r * 0.7 * sgn + out, cy - r * (k.point ? 1.6 : 0.5)],
        [cx + r * 0.9 * sgn + out, cy + r * 0.3],
        [cx + r * 0.2 * sgn, cy + r],
    ];
    return smoothClosed(pts);
}

/**
 * Hair sits in two pieces, and the split is the whole trick.
 *
 * The MASS goes behind the skull; the front piece is only the hairline cap.
 * A first attempt drew an afro as one circle at the top of the z-order, which
 * covered the entire face -- correct silhouette, no character. Cel art draws
 * hair the same way for the same reason.
 */
function hairFront(style, k, R, W, sgn, dir) {
    if (style === 'bald') return null;
    const o = lerpPts(frontOutline(k), profileOutline(k, NOSES.button), dir);
    const { grow, hairline } = HAIR_FRONT[style] ?? HAIR_FRONT['short-fade'];
    const edge = [12, 13, 0, 1, 2].map((i) => [o[i][0] * grow, o[i][1] * grow]);
    // Back across the forehead, which is what stops the cap at the hairline
    // instead of over the eyes.
    const inner = [
        [o[2][0] * 0.80, hairline + 0.06],
        [0, hairline],
        [o[12][0] * 0.80, hairline + 0.06],
    ];
    return smoothClosed(scalePts([...edge, ...inner], W, R, sgn));
}

/** How far the cap grows past the skull, and how low the hairline sits. */
const HAIR_FRONT = {
    'short-fade': { grow: 1.04, hairline: -0.50 },
    wrap:         { grow: 1.14, hairline: -0.38 },
    'afro-short': { grow: 1.12, hairline: -0.46 },
    'afro-large': { grow: 1.16, hairline: -0.44 },
    braids:       { grow: 1.08, hairline: -0.46 },
    locs:         { grow: 1.10, hairline: -0.48 },
};

/** The hair mass behind the skull: everything a front view only hints at. */
function hairBackPath(style, k, R, W, sgn, dir) {
    if (style === 'bald') return null;
    const cx = -sgn * 0.22 * W * dir;
    switch (style) {
        case 'short-fade': return circle(cx, (CY - 0.06) * R, W * 1.16, 10);
        case 'wrap': return circle(cx, (CY - 0.10) * R, W * 1.22, 10);
        case 'afro-short': return circle(cx, (CY - 0.22) * R, W * 1.34, 12);
        case 'afro-large': return circle(cx, (CY - 0.30) * R, W * 1.74, 14);
        case 'braids': {
            const d = [circle(cx, (CY - 0.12) * R, W * 1.14, 10)];
            for (const side of [-1, 1]) {
                if (dir > 0.75 && side * sgn < 0) continue;   // far braid hidden in profile
                const x = side * W * 0.98 + cx;
                d.push(smoothClosed([
                    [x, (CY - 0.10) * R], [x + side * W * 0.26, (CY + 0.55) * R],
                    [x + side * W * 0.16, (CY + 1.45) * R], [x - side * W * 0.16, (CY + 1.38) * R],
                    [x - side * W * 0.22, (CY + 0.45) * R],
                ]));
            }
            return d.join(' ');
        }
        case 'locs': {
            const d = [circle(cx, (CY - 0.18) * R, W * 1.2, 10)];
            for (let i = -2; i <= 2; i++) {
                const x = cx + i * W * 0.5;
                if (dir > 0.75 && i * sgn < 0) continue;
                const drop = 1.1 + Math.abs(i) * 0.18;
                d.push(smoothClosed([
                    [x - W * 0.13, (CY - 0.5) * R], [x + W * 0.13, (CY - 0.45) * R],
                    [x + W * 0.11, (CY + drop) * R], [x - W * 0.11, (CY + drop - 0.08) * R],
                ]));
            }
            return d.join(' ');
        }
        default: return circle(cx, (CY - 0.08) * R, W * 1.08, 10);
    }
}

// ---------------------------------------------------------------- assembly

/**
 * Head parts for a generated character.
 *
 * Returns a flat part list parented to `head`, which is a group rather than a
 * shape: `drawOrder` walks depth-first, so a child always draws over its
 * parent and `z` only sorts siblings. Anything that has to sit BEHIND the
 * skull -- the far ear, the hair mass -- must therefore be the skull's
 * sibling, not its child, while still turning with the head.
 *
 * Every feature whose drawing changes with the view carries a `view` swap set
 * and no transform of its own. Features that also respond to an expression
 * carry a second set whose `neutral` member is empty, which leaves the view's
 * geometry in place -- the swap pass writes nothing for a member with no
 * props.
 */
export function headParts({ R, face = {}, hair = 'short-fade', facing = 1, colors = {} }) {
    const f = { ...DEFAULT_FACE, ...face };
    const jaw = JAWS[f.jaw] ?? JAWS.round;
    const nose = NOSES[f.nose] ?? NOSES.button;
    const ear = f.ears in EARS ? EARS[f.ears] : EARS.round;
    const sgn = facing >= 0 ? 1 : -1;
    const W = R * 0.86;
    const skin = colors.skin ?? 'skin';
    const parts = [];

    /** Build one swap set by running `make` once per view. */
    const perView = (make) => {
        const shapes = {};
        for (const [name, dir] of Object.entries(VIEWS)) {
            const d = make(dir, name);
            if (d) shapes[name] = { kind: 'path', d };
        }
        return Object.keys(shapes).length ? shapes : null;
    };

    const addSwap = (part, sets) => {
        const kept = Object.fromEntries(Object.entries(sets).filter(([, v]) => v));
        if (!Object.keys(kept).length) return;
        part.swap = {};
        for (const [channel, shapes] of Object.entries(kept)) {
            part.swap[channel] = { default: channel === 'view' ? 'front' : 'neutral', shapes };
        }
        parts.push(part);
    };

    // --- behind the skull
    const back = perView((dir) => hairBackPath(hair, jaw, R, W, sgn, dir));
    if (back) addSwap({ id: 'hairBack', parent: 'head', z: 0, fill: `${colors.hair ?? 'hair'}Shade` }, { view: back });

    const farEar = ear && perView((dir) => {
        const L = layout(dir);
        return L.nearEarVisible
            ? earPath(sgn * L.earX * W, L.earY * R + CY * R, ear, R, W, sgn)
            : null;
    });
    if (farEar) {
        addSwap({ id: 'earFar', parent: 'head', z: 1, fill: `${skin}Shade`,
                  stroke: `${skin}Line`, strokeWidth: Math.max(1, R * 0.045) }, { view: farEar });
    }

    // --- the skull itself: flat tone, a hard-edged shadow, and a line
    const skullViews = perView((dir) => smoothClosed(
        scalePts(lerpPts(frontOutline(jaw), profileOutline(jaw, nose), dir), W, R, sgn)));
    // The shadow is drawn to fit inside the silhouette rather than clipped to
    // it: the 2D draw loop is flat, with no save/restore stack, so there is
    // no clip path to use even if cel art wanted one -- and it does not.
    const shadeViews = perView((dir) => {
        const o = lerpPts(frontOutline(jaw), profileOutline(jaw, nose), dir);
        const take = sgn > 0 ? [12, 13, 0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0, 13, 12];
        const edge = take.map((i) => o[i]);
        // The band narrows as the head turns: the far side of a turned head
        // is mostly out of sight, and a shadow sized for a front view swamps
        // what is left.
        const inner = edge.slice().reverse()
            .map(([x, y]) => [x * (0.42 + 0.34 * dir) - sgn * 0.30 * (1 - dir), y * 0.72 - 0.10]);
        return smoothClosed(scalePts([...edge, ...inner], W, R, sgn));
    });
    const skull = { id: 'skull', parent: 'head', z: 10, fill: skin,
                    stroke: `${skin}Line`, strokeWidth: Math.max(1.2, R * 0.055) };
    if (skullViews) {
        skull.swap = { view: { default: 'front', shapes: skullViews } };
        skull.shapes = [{ id: 'shade', z: 1, fill: `${skin}Shade`,
                          swap: { view: { default: 'front', shapes: shadeViews } } }];
    }
    parts.push(skull);

    const nearEar = ear && perView((dir) => {
        const L = layout(dir);
        // Foreshortened as it comes round; drawn flat it reads as a blob stuck
        // to the cheek, which is exactly how the first sheet read.
        return earPath(sgn * L.earBackX * W, L.earY * R + CY * R,
                       { ...ear, r: ear.r * L.earScale }, R, W, -sgn);
    });
    if (nearEar) {
        addSwap({ id: 'earNear', parent: 'head', z: 12, fill: skin,
                  stroke: `${skin}Line`, strokeWidth: Math.max(1, R * 0.045) }, { view: nearEar });
    }

    // --- eyes: white, then pupil, each carrying both channels
    const eyeSet = (kind) => perView((dir) => {
        const L = layout(dir);
        const e = EYES[kind] ?? EYES.round;
        const near = eyePath(sgn * L.nearEyeX * W, (CY + L.eyeY) * R, e, 1, R, W, sgn);
        if (L.farEyeScale <= 0.02) return near;
        const far = eyePath(sgn * L.farEyeX * W, (CY + L.eyeY) * R, e, L.farEyeScale, R, W, sgn);
        return `${far} ${near}`;
    });
    const lidOnly = (kind) => (EYES[kind] ?? EYES.round).lidOnly;
    const white = colors.white ?? 'white';
    // A member carries its own fill, because a closed lid is dark and an open
    // eye is white, and the two share a node.
    const tint = (shapes, kind) => Object.fromEntries(Object.entries(shapes)
        .map(([k, v]) => [k, { ...v, fill: lidOnly(kind) ? `${skin}Line` : white }]));

    addSwap({
        id: 'eyes', parent: 'head', z: 20, fill: lidOnly(f.eyes) ? `${skin}Line` : white,
        stroke: `${skin}Line`, strokeWidth: Math.max(1, R * 0.05),
    }, {
        view: tint(eyeSet(f.eyes), f.eyes),
        expression: expressionSet(f, (ex) => (ex.eyes ? tint(eyeSet(ex.eyes), ex.eyes) : null)),
        // `open` is EMPTY on purpose: a blink must not re-specify geometry the
        // view and the expression already decided, or it silently reverts a
        // turned head to a front-facing pair of eyes every frame it is open.
        // Only `closed` draws, and it is view-qualified so a blink in profile
        // closes one eye rather than two.
        eyes: { open: {}, ...viewQualified(tint(eyeSet('closed-happy'), 'closed-happy'), 'closed') },
    });

    if (!lidOnly(f.eyes)) {
        const pupils = perView((dir) => {
            const L = layout(dir);
            const r = Math.max(1.1, R * 0.062);
            const near = circle(sgn * L.nearEyeX * W, (CY + L.eyeY + 0.02) * R, r);
            if (L.farEyeScale <= 0.02) return near;
            return `${circle(sgn * L.farEyeX * W, (CY + L.eyeY + 0.02) * R, r * L.farEyeScale)} ${near}`;
        });
        addSwap({ id: 'pupils', parent: 'head', z: 21, fill: colors.eye ?? 'eye' },
                { view: pupils, eyes: { open: {}, closed: { kind: 'path', d: '' } } });
    }

    // --- brows
    const browSet = (kind, riseAdj = 0, tiltAdj = 0) => perView((dir) => {
        const L = layout(dir);
        const base = BROWS[kind] ?? BROWS.flat;
        const b = { ...base, rise: base.rise + riseAdj, tilt: base.tilt + tiltAdj,
                    w: (EYES[f.eyes] ?? EYES.round).w * 1.15 };
        const near = browPath(sgn * L.nearEyeX * W, (CY + L.browY - b.rise + 0.26) * R,
                              b, 1, R, W, -sgn);
        if (L.farEyeScale <= 0.02) return near;
        const far = browPath(sgn * L.farEyeX * W, (CY + L.browY - b.rise + 0.26) * R,
                             b, L.farEyeScale, R, W, sgn);
        return `${far} ${near}`;
    });
    addSwap({ id: 'brows', parent: 'head', z: 22, fill: colors.hair ?? 'hair' }, {
        view: browSet(f.brow),
        expression: expressionSet(f, (ex) => (ex.brow
            ? browSet(ex.brow, ex.browRise ?? 0, ex.browTilt ?? 0) : null)),
    });

    // --- nose and hair
    // The nose is always a LINE, never a filled shape. Drawn as a closed
    // shape it reads as a blob sitting next to the eye, and in a turned view
    // the silhouette already carries the nose -- so what is left to draw is
    // the underside, which has to be taken FROM the outline or the two
    // disagree by a few pixels and the nose looks detached.
    const noseViews = perView((dir) => {
        const L = layout(dir);
        if (dir < 0.25) {
            const x = sgn * L.noseX * W, y = (CY + 0.06) * R;
            const len = nose.len * R, w = nose.w * W;
            return `M${n(x - w * 0.2 * sgn)},${n(y)} `
                + `Q${n(x + nose.jut * W * sgn * 0.9)},${n(y + len * 0.8)} `
                + `${n(x + w * 0.5 * sgn)},${n(y + len)}`;
        }
        // Just the nostril, hugging the outline's own under-nose point. Run
        // any further back and it reads as a crease across the cheek rather
        // than as part of the nose.
        const o = lerpPts(frontOutline(jaw), profileOutline(jaw, nose), dir);
        const [tip, under] = scalePts([o[3], o[4]], W, R, sgn);
        const start = [tip[0] * 0.3 + under[0] * 0.7, tip[1] * 0.3 + under[1] * 0.7];
        return `M${pt(start)} Q${pt(under)} `
            + `${pt([under[0] - sgn * nose.w * W * 0.75, under[1] + R * 0.02])}`;
    });
    addSwap({ id: 'nose', parent: 'head', z: 23, fill: null,
              stroke: `${skin}Line`, strokeWidth: Math.max(1, R * 0.05) }, { view: noseViews });

    const hairViews = perView((dir) => hairFront(hair, jaw, R, W, sgn, dir));
    if (hairViews) {
        addSwap({ id: 'hair', parent: 'head', z: 30, fill: colors.hair ?? 'hair',
                  stroke: `${colors.hair ?? 'hair'}Line`, strokeWidth: Math.max(1, R * 0.04) },
                { view: hairViews });
    }

    return parts;
}

/**
 * One member per expression, with `neutral` empty.
 *
 * An empty member writes no props, so the view's geometry survives untouched
 * -- which is what lets two channels drive the same `d` without the later one
 * having to know the earlier one's value.
 */
function expressionSet(face, make) {
    const shapes = { neutral: {} };
    let any = false;
    for (const [name, ex] of Object.entries(EXPRESSIONS)) {
        if (name === 'neutral') continue;
        const set = make(ex);
        if (!set) continue;
        Object.assign(shapes, viewQualified(set, name));
        any = true;
    }
    return any ? shapes : null;
}

/**
 * Re-key a per-view set under one member name: `angry`, `angry@threeQuarter`,
 * `angry@profile`. `resolveSwap` prefers the view-qualified member, so a
 * second channel can override geometry WITHOUT throwing away the turn.
 */
function viewQualified(perViewShapes, name) {
    const out = {};
    for (const [view, shape] of Object.entries(perViewShapes)) {
        out[view === 'front' ? name : `${name}@${view}`] = shape;
    }
    return out;
}
