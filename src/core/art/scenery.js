/**
 * Scenery templates: a named set instead of hand-placed coordinates.
 *
 * Measured motivation. `demo/mountain.json` is 6,118 bytes and 2,427 of them
 * -- 40% -- are scenery, every number of it placed by hand, and the one that
 * was wrong (a ground slope out by 109 px) cost a rendered contact sheet to
 * find. A template is a pure function of the frame size that returns the same
 * entries `scenery` already accepts, PLUS the ground they stand on, so the
 * art and the staging check cannot disagree about where the floor is.
 *
 * Everything here paints with palette KEY names, never literal colours, so a
 * film recolours a whole set by declaring one palette -- and `time` is just a
 * palette overlay, which is why a night version costs one word.
 *
 * Pure: a frame size and a few names in, plain data out.
 */

/** Light through the day, as a palette overlay rather than a filter. */
export const TIMES = {
    morning:   { sky: '#a8c8e0', skyLow: '#e3d3b6', wall: '#d8cfc0', light: '#ffe9bd', far: '#b9c6d4' },
    afternoon: { sky: '#8fb6dc', skyLow: '#cfdcea', wall: '#cfc6b6', light: '#fff4d8', far: '#a9bcd0' },
    evening:   { sky: '#3f4f7a', skyLow: '#d98a52', wall: '#8d7a68', light: '#ffcf8a', far: '#6a6f92' },
    night:     { sky: '#17203a', skyLow: '#2b3457', wall: '#3b3c4a', light: '#cfd8ff', far: '#2a3150' },
};

export const TEMPLATE_NAMES = ['living-room', 'kitchen', 'street', 'hillside', 'interior-wide'];
export const TIME_NAMES = Object.keys(TIMES);

const rect = (id, x, y, w, h, fill, extra = {}) => ({
    id, at: [x, y], shape: { kind: 'rect', w, h }, fill, ...extra,
});
const poly = (id, d, fill, extra = {}) => ({
    id, at: [0, 0], shape: { kind: 'path', d }, fill, ...extra,
});

// ------------------------------------------------------------------- props

/**
 * Optional extras, placed by name. Each takes the frame and a horizontal
 * anchor in 0..1 so `window-left` and `window-right` are the same function.
 */
export const PROPS = {
    'framed-picture': (W, H, x, horizon) => [
        rect('pic', W * x - 44, horizon - 210, 88, 66, 'wood', { z: -460 }),
        rect('picArt', W * x - 36, horizon - 202, 72, 50, 'accent', { z: -455 }),
    ],
    window: (W, H, x, horizon) => [
        rect('win', W * x - 90, horizon - 300, 180, 170, 'light', { z: -470 }),
        rect('winFrame', W * x - 98, horizon - 308, 196, 186, 'wood', { z: -475 }),
        rect('winBar', W * x - 4, horizon - 300, 8, 170, 'wood', { z: -465 }),
    ],
    cabinet: (W, H, x, horizon) => [
        rect('cab', W * x - 70, horizon - 190, 140, 190, 'wood', { z: -450 }),
        rect('cabLine', W * x - 2, horizon - 190, 4, 190, 'woodShade', { z: -449 }),
    ],
    sofa: (W, H, x, horizon) => [
        rect('sofaBack', W * x - 170, horizon - 130, 340, 90, 'accent', { z: -440 }),
        rect('sofaSeat', W * x - 180, horizon - 56, 360, 56, 'accentShade', { z: -435 }),
        rect('sofaArmL', W * x - 196, horizon - 110, 28, 110, 'accent', { z: -434 }),
        rect('sofaArmR', W * x + 168, horizon - 110, 28, 110, 'accent', { z: -434 }),
    ],
    lamp: (W, H, x, horizon) => [
        rect('lampPost', W * x - 4, horizon - 190, 8, 190, 'metal', { z: -430 }),
        poly('lampShade', `M${W * x - 44},${horizon - 250} L${W * x + 44},${horizon - 250} `
            + `L${W * x + 30},${horizon - 196} L${W * x - 30},${horizon - 196} Z`, 'light', { z: -429 }),
    ],
    plant: (W, H, x, horizon) => [
        rect('pot', W * x - 24, horizon - 46, 48, 46, 'clay', { z: -430 }),
        poly('leaves', `M${W * x},${horizon - 46} Q${W * x - 54},${horizon - 110} ${W * x - 14},${horizon - 150} `
            + `Q${W * x + 6},${horizon - 100} ${W * x + 52},${horizon - 126} `
            + `Q${W * x + 22},${horizon - 60} ${W * x},${horizon - 46} Z`, 'foliage', { z: -429 }),
    ],
    door: (W, H, x, horizon) => [
        rect('doorFrame', W * x - 62, horizon - 300, 124, 300, 'woodShade', { z: -470 }),
        rect('door', W * x - 54, horizon - 292, 108, 292, 'wood', { z: -468 }),
    ],
    tree: (W, H, x, horizon) => [
        rect('trunk', W * x - 12, horizon - 120, 24, 120, 'bark', { z: -420 }),
        poly('canopy', `M${W * x},${horizon - 290} Q${W * x + 96},${horizon - 220} ${W * x + 62},${horizon - 140} `
            + `Q${W * x},${horizon - 108} ${W * x - 62},${horizon - 140} `
            + `Q${W * x - 96},${horizon - 220} ${W * x},${horizon - 290} Z`, 'foliage', { z: -419 }),
    ],
    rock: (W, H, x, horizon) => [
        poly('rock', `M${W * x - 54},${horizon} Q${W * x - 40},${horizon - 52} ${W * x},${horizon - 60} `
            + `Q${W * x + 46},${horizon - 50} ${W * x + 56},${horizon} Z`, 'stone', { z: -425 }),
    ],
};

export const PROP_NAMES = Object.keys(PROPS);

// --------------------------------------------------------------- templates

/**
 * Each returns `{ scenery, ground, background }`. The ground is returned
 * BESIDE the art rather than inferred from it, so `do:'move'` and the staging
 * check read the same declaration the floor was drawn from.
 */
export const SCENERY_TEMPLATES = {
    'living-room': (W, H) => {
        const horizon = H * 0.78;
        return {
            background: { color: 'wall' },
            ground: { y: horizon, tolerance: 14 },
            scenery: [
                rect('wall', 0, 0, W, horizon, 'wall', { z: -600 }),
                rect('floor', 0, horizon, W, H - horizon, 'floor', { z: -590 }),
                rect('skirting', 0, horizon - 18, W, 18, 'woodShade', { z: -585 }),
                // A second tone on the floor, hard-edged: the light falls from
                // the window side, and a flat floor reads as paper.
                poly('floorLight', `M0,${horizon} L${W * 0.46},${horizon} L${W * 0.2},${H} L0,${H} Z`,
                     'floorShade', { z: -588 }),
            ],
        };
    },

    kitchen: (W, H) => {
        const horizon = H * 0.80;
        return {
            background: { color: 'wall' },
            ground: { y: horizon, tolerance: 14 },
            scenery: [
                rect('wall', 0, 0, W, horizon, 'wall', { z: -600 }),
                rect('floor', 0, horizon, W, H - horizon, 'floor', { z: -590 }),
                rect('tile', 0, horizon - 150, W, 150, 'tile', { z: -585 }),
                rect('counter', 0, horizon - 96, W, 18, 'stone', { z: -560 }),
                rect('units', 0, horizon - 78, W, 78, 'wood', { z: -565 }),
                rect('uppers', W * 0.08, horizon - 320, W * 0.46, 120, 'wood', { z: -570 }),
                rect('upperLine', W * 0.31, horizon - 320, 4, 120, 'woodShade', { z: -569 }),
            ],
        };
    },

    street: (W, H) => {
        const horizon = H * 0.72;
        const blocks = [];
        // Deterministic, not random: the same street every render, which is
        // what makes a golden frame hash meaningful.
        const widths = [0.16, 0.11, 0.19, 0.13, 0.17, 0.12, 0.18];
        const heights = [0.40, 0.56, 0.31, 0.48, 0.36, 0.60, 0.44];
        let x = -0.03;
        widths.forEach((w, i) => {
            const h = H * heights[i];
            blocks.push(rect(`block${i}`, W * x, horizon - h, W * w + 2, h,
                             i % 2 ? 'far' : 'farShade', { z: -580 + i }));
            x += w;
        });
        return {
            background: { gradient: { stops: [[0, 'sky'], [1, 'skyLow']] } },
            ground: { y: horizon + 54, tolerance: 16 },
            scenery: [
                rect('sky', 0, 0, W, horizon, 'sky', { z: -600 }),
                ...blocks,
                rect('kerb', 0, horizon + 54, W, 8, 'stoneShade', { z: -540 }),
                rect('pavement', 0, horizon, W, 62, 'stone', { z: -550 }),
                rect('road', 0, horizon + 62, W, H - horizon - 62, 'asphalt', { z: -545 }),
            ],
        };
    },

    hillside: (W, H) => {
        const a = H * 0.86, b = H * 0.70;
        return {
            background: { gradient: { stops: [[0, 'sky'], [1, 'skyLow']] } },
            // A slope, declared once. Deriving a walk's y from this is the
            // whole reason the ground is data and not just drawn.
            ground: { points: [[0, a], [W * 0.5, (a + b) / 2], [W, b]], tolerance: 16 },
            scenery: [
                rect('sky', 0, 0, W, H, 'sky', { z: -600 }),
                poly('far', `M0,${H * 0.62} L${W * 0.3},${H * 0.44} L${W * 0.58},${H * 0.58} `
                    + `L${W * 0.82},${H * 0.40} L${W},${H * 0.56} L${W},${H} L0,${H} Z`, 'far', { z: -590 }),
                poly('mid', `M0,${H * 0.74} L${W * 0.42},${H * 0.58} L${W},${H * 0.68} L${W},${H} L0,${H} Z`,
                     'farShade', { z: -585 }),
                poly('slope', `M0,${a} L${W},${b} L${W},${H} L0,${H} Z`, 'foliage', { z: -580 }),
                poly('slopeShade', `M0,${a + 26} L${W},${b + 26} L${W},${H} L0,${H} Z`,
                     'foliageShade', { z: -579 }),
            ],
        };
    },

    'interior-wide': (W, H) => {
        const horizon = H * 0.76;
        return {
            background: { color: 'wall' },
            ground: { y: horizon, tolerance: 14 },
            scenery: [
                rect('wall', 0, 0, W, horizon, 'wall', { z: -600 }),
                rect('wallShade', 0, 0, W * 0.34, horizon, 'wallShade', { z: -599 }),
                rect('floor', 0, horizon, W, H - horizon, 'floor', { z: -590 }),
                rect('skirting', 0, horizon - 16, W, 16, 'woodShade', { z: -585 }),
                rect('railing', 0, horizon - 150, W, 10, 'woodShade', { z: -584 }),
            ],
        };
    },
};

/**
 * Expand `{ template, time, props }` into scenery, a ground and a background.
 *
 * `props` entries are `"name"` or `"name@0.72"` -- a name and a horizontal
 * anchor in 0..1. An anchor is a fraction of the frame rather than a pixel so
 * the same line works at any resolution, and so an author never computes one.
 */
export function buildSceneryTemplate(spec, { width, height } = {}, diagnostics = [], path = '') {
    const name = typeof spec === 'string' ? spec : spec?.template;
    const build = SCENERY_TEMPLATES[name];
    if (!build) {
        diagnostics.push({
            severity: 'warning', path,
            message: `Unknown scenery template "${name}". Known: ${TEMPLATE_NAMES.join(', ')}.`,
        });
        return null;
    }
    const W = width ?? 1280, H = height ?? 720;
    const out = build(W, H);
    const horizon = out.ground.y ?? out.ground.points[0][1];

    const extras = [];
    const wanted = typeof spec === 'string' ? [] : (spec.props ?? []);
    wanted.forEach((entry, i) => {
        const [propName, at] = String(entry).split('@');
        const make = PROPS[propName];
        if (!make) {
            diagnostics.push({
                severity: 'warning', path,
                message: `Unknown prop "${propName}". Known: ${PROP_NAMES.join(', ')}.`,
            });
            return;
        }
        const x = at != null && at !== '' ? Number(at) : (i + 1) / (wanted.length + 1);
        const groundHere = out.ground.y ?? interpolateGround(out.ground.points, W * x);
        for (const item of make(W, H, x, groundHere)) {
            extras.push({ ...item, id: `${propName}${i}_${item.id}` });
        }
    });

    const time = typeof spec === 'string' ? null : spec.time;
    if (time && !TIMES[time]) {
        diagnostics.push({
            severity: 'warning', path,
            message: `Unknown time "${time}". Known: ${TIME_NAMES.join(', ')}.`,
        });
    }
    return {
        scenery: [...out.scenery, ...extras],
        ground: out.ground,
        background: out.background,
        palette: TIMES[time] ?? null,
        horizon,
    };
}

function interpolateGround(points, x) {
    for (let i = 1; i < points.length; i++) {
        if (x <= points[i][0]) {
            const [x0, y0] = points[i - 1], [x1, y1] = points[i];
            return x1 === x0 ? y0 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
        }
    }
    return points[points.length - 1][1];
}
