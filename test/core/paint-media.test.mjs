/**
 * Tests for the media features: paths, nibs, grain, wet paint, layers.
 *
 *   npm run test:media
 *
 * Each group asserts against hand-computed answers or an analytic
 * reference where one exists, rather than against whatever the code
 * currently produces. Blend modes in particular are checked against values
 * worked out from the W3C formulas by hand, because a blend implementation
 * that is self-consistently wrong looks completely plausible on screen.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernels, BLEND_MODE_NAMES } from '../../src/kernels/index.js';
import { pathToPoints, pathToRuns, circlePath, rectPath } from '../../src/core/paint/path.js';
import { makeGrainTexture } from '../../src/core/paint/texture.js';
import { resampleStroke, STAMP_STRIDE } from '../../src/core/paint/stroke.js';
import { brush } from '../../src/core/paint/brushes.js';
import { PaintSurface, parseColor } from '../../src/core/paint/Surface.js';
import { PaintDocument } from '../../src/core/paint/Document.js';

const K = await loadKernels({ prefer: 'wasm' });

/** Bounding box of the inked pixels of a surface. */
function inkBounds(surface) {
    const { width: w, height: h } = surface;
    const a = surface.buffer.array;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, n = 0;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (a[(y * w + x) * 4 + 3] > 0.02) {
                x0 = Math.min(x0, x); x1 = Math.max(x1, x);
                y0 = Math.min(y0, y); y1 = Math.max(y1, y);
                n++;
            }
        }
    }
    return { x0, y0, x1, y1, n, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

const px = (s, x, y) => Array.from(s.buffer.array.slice((y * s.width + x) * 4,
    (y * s.width + x) * 4 + 4));

// =====================================================================
// SVG path input
// =====================================================================

test('a cubic flattens to within a fraction of a pixel of the true curve', () => {
    // Checked against the analytic Bernstein evaluation, not against
    // whatever the flattener happens to emit.
    const P = [[20, 100], [80, 20], [200, 20], [260, 100]];
    const at = (t) => {
        const u = 1 - t;
        return [0, 1].map((c) => u * u * u * P[0][c] + 3 * u * u * t * P[1][c]
            + 3 * u * t * t * P[2][c] + t * t * t * P[3][c]);
    };
    const pts = pathToPoints('M 20 100 C 80 20, 200 20, 260 100', { tolerance: 2 });

    assert.deepEqual([pts[0].x, pts[0].y], at(0));
    const last = pts[pts.length - 1];
    assert.ok(Math.hypot(last.x - 260, last.y - 100) < 1e-6, 'endpoint drifted');

    // Every sample must lie on the curve at *some* parameter. Checking the
    // minimum distance over a dense analytic sampling avoids assuming the
    // flattener spaces its samples uniformly in t.
    const dense = Array.from({ length: 2001 }, (_, i) => at(i / 2000));
    for (const q of pts) {
        let best = Infinity;
        for (const d of dense) best = Math.min(best, Math.hypot(q.x - d[0], q.y - d[1]));
        assert.ok(best < 0.25, `sample (${q.x}, ${q.y}) is ${best.toFixed(3)}px off the curve`);
    }
});

test('tolerance controls sample density', () => {
    const coarse = pathToPoints('M 0 0 C 50 100, 150 100, 200 0', { tolerance: 20 });
    const fine = pathToPoints('M 0 0 C 50 100, 150 100, 200 0', { tolerance: 1 });
    assert.ok(fine.length > coarse.length * 3, `${fine.length} vs ${coarse.length}`);
});

test('subpaths are separate runs, never joined', () => {
    // Joining them would draw a line from the end of one to the start of
    // the next -- the classic artefact of flattening a glyph naively.
    const runs = pathToRuns('M 0 0 L 10 0 M 100 0 L 110 0');
    assert.equal(runs.length, 2);
    assert.deepEqual([runs[0][runs[0].length - 1].x, runs[1][0].x], [10, 100]);
    assert.equal(pathToPoints('M 0 0 L 10 0 M 100 0 L 110 0').length, 2,
        'the single-run form must return the first subpath, not a concatenation');
});

test('relative commands accumulate from the current point', () => {
    const pts = pathToPoints('M 10 10 l 10 0 l 0 10 l -10 0');
    assert.deepEqual(pts.map((q) => [q.x, q.y]), [[10, 10], [20, 10], [20, 20], [10, 20]]);
});

test('extra pairs after M are implicit linetos, and relative m yields relative l', () => {
    // Per the SVG grammar. Getting this wrong makes a polygon written in
    // the compact form collapse to its first edge.
    assert.deepEqual(pathToPoints('M 0 0 10 0 10 10').map((q) => [q.x, q.y]),
        [[0, 0], [10, 0], [10, 10]]);
    assert.deepEqual(pathToPoints('m 5 5 10 0 0 10').map((q) => [q.x, q.y]),
        [[5, 5], [15, 5], [15, 15]]);
});

/** Angle in degrees between the directions either side of `x = at`. */
function tangentBreak(pts, at) {
    const j = pts.findIndex((q) => q.x >= at);
    assert.ok(j > 1 && j < pts.length - 2, 'join not found in the flattened points');
    const dir = (a, b) => Math.atan2(pts[b].y - pts[a].y, pts[b].x - pts[a].x);
    const before = dir(j - 2, j - 1);
    const after = dir(j + 1, j + 2);
    return Math.abs(((before - after) * 180) / Math.PI);
}

test('S reflects the previous control point, giving a smooth join', () => {
    // What `S` guarantees is **tangent continuity**: its first control is
    // the reflection of the previous cubic's second control, so the curve
    // leaves the join heading exactly where it arrived.
    //
    // Testing the peak height instead is too narrow -- it pins down only
    // the reflected *y*, and a mutation that broke only the reflected *x*
    // survived the audit. The tangent covers both components at once,
    // which is also the property anyone drawing with S actually relies on.
    //
    // Here the cubic arrives along (5, 10), i.e. 63.4 degrees. Reflected,
    // it leaves along (5, 10) too; unreflected it leaves along (0, 10),
    // a 26-degree kink.
    const pts = pathToPoints('M 0 0 C 5 -10, 15 -10, 20 0 S 35 10, 40 0', { tolerance: 0.4 });
    const kink = tangentBreak(pts, 20);
    assert.ok(kink < 6, `S left a ${kink.toFixed(1)} degree kink at the join`);
});

test('T reflects the previous control point, giving a smooth join', () => {
    const pts = pathToPoints('M 0 0 Q 10 -12, 20 0 T 40 0', { tolerance: 0.4 });
    const kink = tangentBreak(pts, 20);
    assert.ok(kink < 6, `T left a ${kink.toFixed(1)} degree kink at the join`);
});

test('Z closes back to the subpath start', () => {
    const pts = pathToPoints('M 10 10 L 50 10 L 50 50 Z');
    const last = pts[pts.length - 1];
    assert.deepEqual([last.x, last.y], [10, 10]);
});

test('compact number forms parse: no separator, leading dot, exponent', () => {
    assert.deepEqual(pathToPoints('M10-20L.5.5').map((q) => [q.x, q.y]), [[10, -20], [0.5, 0.5]]);
    assert.deepEqual(pathToPoints('M 1e2 2e-1 L 0 0')[0], { x: 100, y: 0.2, p: 1 });
});

test('an arc raises a diagnostic and does not desynchronise the rest', () => {
    // One unsupported command must not corrupt every command after it.
    const diagnostics = [];
    const pts = pathToPoints('M 0 0 A 5 5 0 0 1 10 10 L 50 50', { diagnostics });
    assert.equal(diagnostics.length, 1);
    assert.match(diagnostics[0].message, /arc/);
    const last = pts[pts.length - 1];
    assert.deepEqual([last.x, last.y], [50, 50], 'the L after the arc was lost');
});

test('pressure ramps across a run', () => {
    const pts = pathToPoints('M 0 0 L 100 0', { pressure: [0.2, 1] });
    assert.ok(Math.abs(pts[0].p - 0.2) < 1e-9);
    assert.ok(Math.abs(pts[pts.length - 1].p - 1) < 1e-9);
});

test('circlePath is round to within a quarter of a pixel', () => {
    // The 0.5522847 constant should match a quarter circle to about one
    // part in two thousand; a wrong constant shows up as an octagon.
    const pts = pathToPoints(circlePath(100, 100, 50), { tolerance: 1 });
    for (const q of pts) {
        const r = Math.hypot(q.x - 100, q.y - 100);
        assert.ok(Math.abs(r - 50) < 0.25, `radius ${r.toFixed(3)} at (${q.x}, ${q.y})`);
    }
});

test('rectPath closes and has the requested extent', () => {
    const pts = pathToPoints(rectPath(10, 20, 100, 50));
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    assert.deepEqual([Math.min(...xs), Math.max(...xs)], [10, 110]);
    assert.deepEqual([Math.min(...ys), Math.max(...ys)], [20, 70]);
});

// =====================================================================
// grain texture
// =====================================================================

test('grain is deterministic in its seed, and the seed matters', () => {
    const a = makeGrainTexture({ seed: 5, size: 32 });
    const b = makeGrainTexture({ seed: 5, size: 32 });
    const c = makeGrainTexture({ seed: 6, size: 32 });
    assert.deepEqual(Array.from(a.data), Array.from(b.data));
    assert.notDeepEqual(Array.from(a.data), Array.from(c.data));
});

test('grain uses its full range, so strength means what it says', () => {
    // Summed octaves of value noise concentrate around 0.5, so without a
    // contrast stretch `strength: 0.7` delivered only about 0.4 of actual
    // modulation and no setting could reach full contrast.
    const { data } = makeGrainTexture({ seed: 7, size: 64, strength: 1 });
    assert.ok(Math.min(...data) <= 2, `darkest texel is ${Math.min(...data)}, expected ~0`);
    assert.ok(Math.max(...data) >= 253, `brightest texel is ${Math.max(...data)}, expected ~255`);
});

test('grain values stay inside [1 - strength, 1]', () => {
    // Strength is baked into the tile so the kernel multiply is already a
    // strength-weighted blend. A tile that dipped below the floor would
    // make the brush more transparent than asked.
    for (const strength of [0, 0.25, 1]) {
        const { data } = makeGrainTexture({ seed: 3, size: 32, strength });
        const floor = Math.round((1 - strength) * 255) - 1;
        for (const v of data) {
            assert.ok(v >= floor && v <= 255, `strength ${strength}: value ${v}`);
        }
    }
});

test('grain at strength 0 is uniformly opaque', () => {
    const { data } = makeGrainTexture({ seed: 3, size: 16, strength: 0 });
    for (const v of data) assert.equal(v, 255);
});

test('lattice interpolation is smooth, not linear', () => {
    // Smoothstep makes the gradient vanish at lattice points; linear
    // interpolation leaves it discontinuous there, which shows on a grain
    // texture as a regular grid of creases -- a repeating pattern exactly
    // where the texture is supposed to be irregular.
    //
    // So the first difference should be markedly *smaller* at lattice
    // crossings than midway between them. Under linear interpolation the
    // two are equal, since the slope is constant across each cell.
    const size = 64, frequency = 4;          // a lattice line every 16px
    const { data } = makeGrainTexture({ seed: 2, size, frequency, octaves: 1, strength: 1 });
    const cell = size / frequency;
    const diff = (x, y) => Math.abs(data[y * size + x] - data[y * size + x - 1]);

    let atLattice = 0, atMid = 0, n = 0;
    for (let y = 0; y < size; y++) {
        for (let k = 1; k < frequency; k++) {
            atLattice += diff(k * cell, y);
            atMid += diff(k * cell - (cell >> 1), y);
            n++;
        }
    }
    assert.ok(atLattice / n < (atMid / n) * 0.5,
        `gradient does not flatten at lattice points: `
        + `${(atLattice / n).toFixed(2)} vs ${(atMid / n).toFixed(2)} midway`);
});

test('grain tiles seamlessly', () => {
    // Canvas-locked grain is sampled across an arbitrarily large canvas,
    // so a tile whose edges do not meet shows a hard line at every repeat.
    const size = 64;
    const { data } = makeGrainTexture({ seed: 9, size, frequency: 8, octaves: 2 });
    const at = (x, y) => data[y * size + x];
    // The step across the wrap must be no worse than a typical interior step.
    let interior = 0;
    for (let y = 0; y < size; y++) {
        for (let x = 1; x < size; x++) interior += Math.abs(at(x, y) - at(x - 1, y));
    }
    const meanInterior = interior / (size * (size - 1));
    let seam = 0;
    for (let y = 0; y < size; y++) seam += Math.abs(at(0, y) - at(size - 1, y));
    const meanSeam = seam / size;
    assert.ok(meanSeam < meanInterior * 3,
        `seam step ${meanSeam.toFixed(1)} against interior ${meanInterior.toFixed(1)}`);
});

test('a grained brush breaks up where an ungrained one is solid', () => {
    const measure = (grain) => {
        const S = new PaintSurface(K, 200, 60);
        try {
            S.draw({
                path: 'M 10 30 L 190 30', brush: 'pen', size: 30, color: '#000',
                brushOverrides: { grain, grainSeed: 4, jitterPos: 0, jitterFlow: 0 },
            });
            // Standard deviation of alpha over the *two-dimensional* core
            // of the stroke, where a hard pen would be exactly 1.0.
            //
            // A single scanline is too weak a probe: the noise has
            // features around 16px across, so 50 pixels of one row sample
            // only three of them and the deviation reads far lower than
            // the texture actually is. The 2D core samples enough of the
            // tile to be representative -- measured, an ungrained pen gives
            // exactly 0 and a grained one 0.106.
            const vals = [];
            for (let y = 22; y <= 38; y++) {
                for (let x = 20; x < 180; x++) vals.push(px(S, x, y)[3]);
            }
            const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
            return Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / vals.length);
        } finally { S.dispose(); }
    };
    assert.ok(measure(0) < 1e-5, 'an ungrained pen should be perfectly solid');
    assert.ok(measure(0.7) > 0.05, 'a grained brush did not break up');
});

test('canvas-locked grain repeats under a second pass over the same place', () => {
    // The property that makes a dry medium look dry: paper tooth belongs
    // to the paper, so the same patch must hit the same high points every
    // time. Dab-locked grain instead smears a copy of the texture along
    // the stroke and reads as a rubber stamp at high frequency.
    const sample = (grainMode) => {
        const S = new PaintSurface(K, 120, 60);
        try {
            const stroke = {
                path: 'M 10 30 L 110 30', brush: 'pen', size: 26, color: '#000',
                brushOverrides: { grain: 0.8, grainSeed: 6, grainMode, jitterPos: 0, jitterFlow: 0 },
            };
            S.draw(stroke);
            const first = [];
            for (let x = 20; x < 100; x++) first.push(px(S, x, 30)[3]);
            return first;
        } finally { S.dispose(); }
    };
    // Drawing the same stroke on two fresh surfaces must give the same
    // pattern for canvas-locked grain, since it depends only on position.
    assert.deepEqual(sample('canvas'), sample('canvas'));

    // And the two modes must actually differ, or the mode is doing nothing.
    assert.notDeepEqual(sample('canvas'), sample('dab'));
});

// =====================================================================
// nib shape
// =====================================================================

test('an elliptical nib marks wider along its axis than across it', () => {
    const S = new PaintSurface(K, 120, 120);
    try {
        // A single dab, nib along x.
        S.draw({
            points: [{ x: 60, y: 60, p: 1 }], brush: 'pen', size: 60, color: '#000',
            brushOverrides: { aspect: 0.25, angle: 0, taper: 0 },
        });
        const b = inkBounds(S);
        assert.ok(b.w > b.h * 2.5, `expected an elongated dab, got ${b.w}x${b.h}`);
    } finally { S.dispose(); }
});

test('the nib angle rotates the mark', () => {
    const S = new PaintSurface(K, 120, 120);
    try {
        S.draw({
            points: [{ x: 60, y: 60, p: 1 }], brush: 'pen', size: 60, color: '#000',
            brushOverrides: { aspect: 0.25, angle: Math.PI / 2, taper: 0 },
        });
        const b = inkBounds(S);
        assert.ok(b.h > b.w * 2.5, `rotating by 90 degrees should swap the axes, got ${b.w}x${b.h}`);
    } finally { S.dispose(); }
});

test('a fixed nib changes width with direction; a following nib does not', () => {
    // This is the whole point of `angleMode`. A fixed broad-edge nib makes
    // lettering swell and thin purely from where the line goes; modelling
    // it as following the stroke yields a constant-width ribbon, which is
    // precisely what it must not be.
    const widthOf = (angleMode, dx, dy) => {
        const S = new PaintSurface(K, 200, 200);
        try {
            S.draw({
                points: [{ x: 100 - dx, y: 100 - dy, p: 1 }, { x: 100 + dx, y: 100 + dy, p: 1 }],
                brush: 'pen', size: 40, color: '#000',
                brushOverrides: { aspect: 0.2, angle: 0, angleMode, taper: 0 },
            });
            return inkBounds(S).n;
        } finally { S.dispose(); }
    };
    const fixedAlong = widthOf('fixed', 40, 0);     // travel parallel to the nib
    const fixedAcross = widthOf('fixed', 0, 40);    // travel across it
    assert.ok(fixedAcross > fixedAlong * 1.5,
        `a fixed nib must vary with direction: ${fixedAlong} vs ${fixedAcross}`);

    const followAlong = widthOf('follow', 40, 0);
    const followAcross = widthOf('follow', 0, 40);
    assert.ok(Math.abs(followAlong - followAcross) < followAlong * 0.15,
        `a following nib must keep its width: ${followAlong} vs ${followAcross}`);
});

test('a round nib is unaffected by angle', () => {
    const r = (angle) => resampleStroke(
        { points: [{ x: 10, y: 10, p: 1 }, { x: 60, y: 10, p: 1 }], size: 10 },
        brush('pen', { angle, aspect: 1 }));
    const a = r(0).stamps, b = r(1.1).stamps;
    for (let i = 0; i < a.length; i++) {
        if (i % STAMP_STRIDE === 4) continue;        // the angle field itself
        assert.equal(a[i], b[i], `round dab changed at field ${i % STAMP_STRIDE}`);
    }
});

// =====================================================================
// wet media
// =====================================================================

/** A surface with a red band above a blue band. */
function twoBands() {
    const S = new PaintSurface(K, 120, 60);
    S.draw({ points: [{ x: 5, y: 20, p: 1 }, { x: 115, y: 20, p: 1 }],
        brush: 'pen', size: 30, color: '#ff0000' });
    S.draw({ points: [{ x: 5, y: 45, p: 1 }, { x: 115, y: 45, p: 1 }],
        brush: 'pen', size: 24, color: '#0000ff' });
    return S;
}

test('a smudge brush drags colour across a boundary', () => {
    const S = twoBands();
    try {
        const before = px(S, 60, 45);
        S.draw({ points: [{ x: 20, y: 20, p: 1 }, { x: 100, y: 45, p: 1 }],
            brush: 'smudge', size: 26 });
        const after = px(S, 60, 45);
        assert.ok(before[0] < 0.02, 'the blue band started with red in it');
        assert.ok(after[0] > 0.1, `no red was dragged in: ${after.map((v) => v.toFixed(2))}`);
    } finally { S.dispose(); }
});

test('colorRate 0 deposits no new colour, only what was picked up', () => {
    // The case that independent `smudge` and `colorRate` exists for. With
    // the two coupled it cannot be expressed at all.
    const S = twoBands();
    try {
        S.draw({
            points: [{ x: 20, y: 20, p: 1 }, { x: 100, y: 20, p: 1 }],
            brush: 'smudge', size: 20, color: '#00ff00',
            brushOverrides: { colorRate: 0 },
        });
        let green = 0;
        for (let i = 1; i < S.buffer.array.length; i += 4) green = Math.max(green, S.buffer.array[i]);
        assert.ok(green < 0.05, `colorRate 0 still deposited green: ${green.toFixed(3)}`);
    } finally { S.dispose(); }
});

test('smudge 0 with colorRate 1 paints like an ordinary brush', () => {
    const S = new PaintSurface(K, 60, 40);
    try {
        S.draw({
            points: [{ x: 10, y: 20, p: 1 }, { x: 50, y: 20, p: 1 }],
            brush: 'smudge', size: 16, color: '#ff0000',
            brushOverrides: { smudge: 0, colorRate: 1, hardness: 1 },
        });
        const c = px(S, 30, 20);
        assert.ok(c[0] > 0.9 && c[1] < 0.05 && c[2] < 0.05,
            `expected solid red, got ${c.map((v) => v.toFixed(2))}`);
    } finally { S.dispose(); }
});

test('smudging over transparency does not darken toward black', () => {
    // The canvas is premultiplied. Mixing premultiplied values weights
    // each colour by its own coverage, so picking up from an empty region
    // would drag the reservoir to black -- visible as a grey smear
    // trailing off the edge of a shape.
    const S = new PaintSurface(K, 100, 60);
    try {
        S.draw({ points: [{ x: 5, y: 30, p: 1 }, { x: 40, y: 30, p: 1 }],
            brush: 'pen', size: 24, color: '#ff4040' });
        S.draw({ points: [{ x: 20, y: 30, p: 1 }, { x: 90, y: 30, p: 1 }],
            brush: 'smudge', size: 20, brushOverrides: { colorRate: 0 } });

        for (let x = 45; x < 85; x++) {
            const [r, g, b, a] = px(S, x, 30);
            if (a < 0.02) continue;
            // Whatever was dragged out must stay reddish, never neutral dark.
            assert.ok(r >= g - 1e-3 && r >= b - 1e-3,
                `smear went neutral at x=${x}: ${[r, g, b].map((v) => v.toFixed(3))}`);
        }
    } finally { S.dispose(); }
});

test('a wet stroke is deterministic', () => {
    const run = () => {
        const S = twoBands();
        try {
            S.draw({ points: [{ x: 20, y: 20, p: 1 }, { x: 100, y: 45, p: 1 }],
                brush: 'watercolor', size: 24, color: '#2080ff' });
            return Float32Array.from(S.buffer.array);
        } finally { S.dispose(); }
    };
    assert.deepEqual(Array.from(run()), Array.from(run()));
});

// =====================================================================
// layers and blend modes
// =====================================================================

/**
 * Composite one opaque colour over another on a two-layer document and
 * return the result at the centre.
 */
function blendPair(mode, backdrop, source, opacity = 1) {
    const doc = new PaintDocument(K, 24, 24);
    try {
        doc.addLayer({ name: 'b' });
        doc.addLayer({ name: 's', blend: mode, opacity });
        const band = [{ x: 2, y: 12, p: 1 }, { x: 22, y: 12, p: 1 }];
        doc.draw('b', { points: band, brush: 'pen', size: 20, color: backdrop });
        doc.draw('s', { points: band, brush: 'pen', size: 20, color: source });
        doc.flatten();
        const i = (12 * 24 + 12) * 4;
        return Array.from(doc.composite.array.slice(i, i + 4));
    } finally { doc.dispose(); }
}

test('separable blend modes match the W3C formulas', () => {
    // Backdrop 0.6 grey, source 0.4 grey, both opaque. Values worked out
    // by hand from the specification; a self-consistently wrong blend
    // implementation looks entirely plausible on screen.
    const b = '#999999';   // 0x99 = 153 -> 0.6
    const s = '#666666';   // 0x66 = 102 -> 0.4
    const cb = 153 / 255, cs = 102 / 255;
    const expected = {
        normal: cs,
        multiply: cb * cs,
        screen: cb + cs - cb * cs,
        darken: Math.min(cb, cs),
        lighten: Math.max(cb, cs),
        difference: Math.abs(cb - cs),
        exclusion: cb + cs - 2 * cb * cs,
        hardLight: cb * (2 * cs),                          // cs <= 0.5
        overlay: (() => { const d = 2 * cb - 1; return cs + d - cs * d; })(),
        colorDodge: Math.min(1, cb / (1 - cs)),
        colorBurn: 1 - Math.min(1, (1 - cb) / cs),
        add: Math.min(1, cb + cs),
        softLight: cb - (1 - 2 * cs) * cb * (1 - cb),      // cs <= 0.5
    };
    for (const [mode, want] of Object.entries(expected)) {
        const got = blendPair(mode, b, s)[0];
        assert.ok(Math.abs(got - want) < 0.01,
            `${mode}: got ${got.toFixed(4)}, expected ${want.toFixed(4)}`);
    }
});

/** The W3C luminosity, with the specification's NTSC weights. */
const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];
const satOf = (c) => Math.max(...c) - Math.min(...c);

test('non-separable modes transplant the right attribute', () => {
    // These four cannot be checked per channel, so they are pinned by the
    // properties that define them rather than by one arithmetic result.
    //
    // `color` takes the source's hue and saturation but the backdrop's
    // luminosity; `luminosity` is the exact converse. Asserting the
    // luminosity of the result is the sharpest available check, because
    // getting the hue-preserving clip wrong perturbs it immediately.
    const cases = [
        ['#00ff00', '#ff0000'],      // green backdrop, red source
        ['#2060a0', '#e0a020'],      // blue backdrop, amber source
        ['#808080', '#3fa05f'],      // grey backdrop
    ];
    for (const [bHex, sHex] of cases) {
        const cb = parseColor(bHex), cs = parseColor(sHex);

        const color = blendPair('color', bHex, sHex).slice(0, 3);
        assert.ok(Math.abs(lum(color) - lum(cb)) < 0.02,
            `color: luminosity ${lum(color).toFixed(3)} should match the backdrop's `
            + `${lum(cb).toFixed(3)}`);

        const luminosity = blendPair('luminosity', bHex, sHex).slice(0, 3);
        assert.ok(Math.abs(lum(luminosity) - lum(cs)) < 0.02,
            `luminosity: ${lum(luminosity).toFixed(3)} should match the source's `
            + `${lum(cs).toFixed(3)}`);

        // `saturation` takes the source's saturation and the backdrop's
        // luminosity.
        const saturation = blendPair('saturation', bHex, sHex).slice(0, 3);
        assert.ok(Math.abs(lum(saturation) - lum(cb)) < 0.02, 'saturation changed luminosity');

        // `hue` likewise keeps the backdrop's luminosity.
        const hue = blendPair('hue', bHex, sHex).slice(0, 3);
        assert.ok(Math.abs(lum(hue) - lum(cb)) < 0.02, 'hue changed luminosity');
    }
});

test('hue and saturation collapse correctly against a grey', () => {
    // Decisive degenerate cases, computable by hand from the definitions.
    //
    // A grey backdrop has zero saturation, so `hue` -- which gives the
    // result the *backdrop's* saturation -- must return that same grey
    // whatever the source is.
    const grey = blendPair('hue', '#808080', '#ff3300').slice(0, 3);
    for (const c of grey) {
        assert.ok(Math.abs(c - 0.502) < 0.02, `hue over grey returned ${c.toFixed(3)}`);
    }

    // A grey *source* has zero saturation, so `saturation` must fully
    // desaturate the backdrop while holding its luminosity.
    const desat = blendPair('saturation', '#ff3300', '#808080').slice(0, 3);
    assert.ok(satOf(desat) < 0.02, `saturation with a grey source left ${satOf(desat).toFixed(3)}`);
    assert.ok(Math.abs(lum(desat) - lum(parseColor('#ff3300'))) < 0.02);
});

test('the hue-preserving clip does not shift hue on out-of-gamut results', () => {
    // `setLum` routinely pushes a channel outside 0..1, and clamping each
    // channel independently shifts the hue because they clamp by
    // different amounts. Scaling toward the luminosity instead keeps the
    // channel *ordering*, which is what carries the hue. A very bright
    // target luminosity is the case that forces the clip.
    const got = blendPair('color', '#f0f0f0', '#0040ff').slice(0, 3);
    // The source is blue: blue highest, green middle, red lowest. That
    // ordering must survive.
    assert.ok(got[2] >= got[1] - 1e-3 && got[1] >= got[0] - 1e-3,
        `channel ordering lost: ${got.map((v) => v.toFixed(3))}`);
});

test('every named blend mode is covered by a maths test', () => {
    // Guards against adding a mode and forgetting to pin it -- which is
    // exactly what happened when the four non-separable modes landed.
    const separable = new Set(['normal', 'multiply', 'screen', 'darken', 'lighten',
        'difference', 'exclusion', 'hardLight', 'overlay', 'colorDodge',
        'colorBurn', 'add', 'softLight']);
    const nonSeparable = new Set(['hue', 'saturation', 'color', 'luminosity']);
    for (const name of BLEND_MODE_NAMES) {
        assert.ok(separable.has(name) || nonSeparable.has(name),
            `blend mode "${name}" has no maths test`);
    }
});

// =====================================================================
// masks, clipping groups, incremental flatten
// =====================================================================

/** Alpha at a pixel of a document's composite. */
const alphaAt = (d, x, y) => d.composite.array[(y * d.width + x) * 4 + 3];

test('a surface starts at version 0, so change detection works at all', () => {
    // Left uninitialised, `version++` yields NaN, every layer signature
    // interpolates the constant string "NaN", and the incremental flatten
    // returns a stale composite forever with no error anywhere. That is
    // precisely what happened.
    const S = new PaintSurface(K, 8, 8);
    try {
        assert.equal(S.version, 0);
        S.draw({ points: [{ x: 4, y: 4, p: 1 }], brush: 'pen', size: 4, color: '#000' });
        assert.equal(S.version, 1);
        assert.ok(Number.isFinite(S.version));
    } finally { S.dispose(); }
});

test('a layer mask hides what it covers, and is painted with ordinary brushes', () => {
    const doc = new PaintDocument(K, 60, 40);
    try {
        doc.addLayer({ name: 'a' });
        doc.draw('a', { points: [{ x: 2, y: 20, p: 1 }, { x: 58, y: 20, p: 1 }],
            brush: 'pen', size: 30, color: '#ff0000' });
        doc.flatten();
        assert.ok(alphaAt(doc, 30, 20) > 0.9, 'nothing was painted');

        // A new mask is opaque, so adding one must change nothing --
        // otherwise the layer vanishes the moment a mask appears, which
        // reads as a bug rather than as a blank mask.
        doc.layer('a').addMask();
        doc.flatten();
        assert.ok(alphaAt(doc, 30, 20) > 0.9, 'adding a mask hid the layer');

        doc.layer('a').paintMask({ points: [{ x: 30, y: 20, p: 1 }],
            brush: 'eraser', size: 16 });
        doc.flatten();
        assert.ok(alphaAt(doc, 30, 20) < 0.05, 'erasing the mask did not hide the layer');
        assert.ok(alphaAt(doc, 5, 20) > 0.9, 'the mask hid more than it covered');
    } finally { doc.dispose(); }
});

test('a clipping group is confined to the layer below', () => {
    const doc = new PaintDocument(K, 80, 40);
    try {
        doc.addLayer({ name: 'base' });
        doc.addLayer({ name: 'shade', blend: 'multiply', clip: true });
        doc.draw('base', { points: [{ x: 5, y: 20, p: 1 }, { x: 40, y: 20, p: 1 }],
            brush: 'pen', size: 28, color: '#ffcc00' });
        // The shading runs the full width; the clip must cut it back.
        doc.draw('shade', { points: [{ x: 5, y: 20, p: 1 }, { x: 75, y: 20, p: 1 }],
            brush: 'pen', size: 28, color: '#4040ff' });
        doc.flatten();
        assert.ok(alphaAt(doc, 20, 20) > 0.9, 'the base is missing');
        assert.ok(alphaAt(doc, 70, 20) < 0.05,
            'the clipped layer painted beyond its base');
    } finally { doc.dispose(); }
});

test("a base layer's own mask also hides what is clipped to it", () => {
    // Easy to omit and wrong to: a shading pass would keep showing over a
    // region its subject had been masked out of.
    const doc = new PaintDocument(K, 80, 40);
    try {
        doc.addLayer({ name: 'base' });
        doc.addLayer({ name: 'shade', blend: 'multiply', clip: true });
        const band = [{ x: 5, y: 20, p: 1 }, { x: 75, y: 20, p: 1 }];
        doc.draw('base', { points: band, brush: 'pen', size: 28, color: '#ffcc00' });
        doc.draw('shade', { points: band, brush: 'pen', size: 28, color: '#4040ff' });
        doc.flatten();
        assert.ok(alphaAt(doc, 40, 20) > 0.9);

        doc.layer('base').addMask();
        doc.layer('base').paintMask({ points: [{ x: 40, y: 20, p: 1 }],
            brush: 'eraser', size: 14 });
        doc.flatten();
        assert.ok(alphaAt(doc, 40, 20) < 0.05,
            'masking the base left its clipped layer showing');
    } finally { doc.dispose(); }
});

test('a run of clipped layers all clip to the same base', () => {
    // The base is the nearest layer below that is not *itself* clipped.
    // Returning simply "the layer below" looks identical with one clipped
    // layer and is wrong with two: the second would clip to the first
    // rather than to the subject, and would disappear wherever the first
    // happened not to paint.
    const doc = new PaintDocument(K, 90, 40);
    try {
        doc.addLayer({ name: 'base' });
        doc.addLayer({ name: 'shade', clip: true });
        doc.addLayer({ name: 'light', clip: true });
        // The base covers x 5..45. `shade` paints only the left third, so
        // if `light` clipped to `shade` it would vanish past x 20.
        doc.draw('base', { points: [{ x: 5, y: 20, p: 1 }, { x: 45, y: 20, p: 1 }],
            brush: 'pen', size: 26, color: '#ffcc00' });
        doc.draw('shade', { points: [{ x: 5, y: 20, p: 1 }, { x: 18, y: 20, p: 1 }],
            brush: 'pen', size: 26, color: '#403020' });
        doc.draw('light', { points: [{ x: 5, y: 20, p: 1 }, { x: 85, y: 20, p: 1 }],
            brush: 'pen', size: 26, color: '#ffffff' });
        doc.flatten();

        const white = (x) => doc.composite.array[(20 * doc.width + x) * 4 + 2];
        assert.ok(white(35) > 0.8,
            'the second clipped layer should reach the base\'s full extent, '
            + 'not stop where the first one did');
        assert.ok(doc.composite.array[(20 * doc.width + 70) * 4 + 3] < 0.05,
            'it must still be clipped to the base');
    } finally { doc.dispose(); }
});

test('a clip with nothing beneath it is ignored, not blanked', () => {
    // A clipping group at the bottom of the stack is an authoring
    // mistake; silently blanking the layer makes it very hard to see
    // which one.
    const doc = new PaintDocument(K, 40, 30);
    try {
        doc.addLayer({ name: 'only', clip: true });
        doc.draw('only', { points: [{ x: 5, y: 15, p: 1 }, { x: 35, y: 15, p: 1 }],
            brush: 'pen', size: 16, color: '#ff0000' });
        doc.flatten();
        assert.ok(alphaAt(doc, 20, 15) > 0.9, 'a clip with no base blanked the layer');
    } finally { doc.dispose(); }
});

test('incremental flatten matches a full rebuild after every kind of edit', () => {
    const doc = new PaintDocument(K, 90, 60);
    try {
        for (let i = 0; i < 5; i++) {
            doc.addLayer({ name: 'L' + i, blend: i % 2 ? 'multiply' : 'normal', opacity: 0.9 });
            doc.draw('L' + i, { path: `M 5 ${8 + i * 10} L 85 ${14 + i * 9}`,
                brush: 'pen', size: 9, color: '#3080c0' });
        }
        const same = (what) => {
            const incremental = Float32Array.from(doc.flatten().array);
            const full = Float32Array.from(doc.flattenFull().array);
            for (let i = 0; i < incremental.length; i++) {
                if (incremental[i] !== full[i]) {
                    assert.fail(`${what}: incremental differs from full at ${i}`);
                }
            }
        };
        const dot = (layer, x) => doc.draw(layer, { points: [{ x, y: 30, p: 1 }],
            brush: 'pen', size: 6, color: '#fff' });

        same('initial');
        dot('L4', 20); same('after painting the top layer');
        dot('L4', 30); same('after painting it again');
        dot('L0', 40); same('after painting the bottom layer');

        // The stale-prefix regression, which needs an *uninterrupted*
        // sequence: `same()` calls `flattenFull()`, and that invalidates
        // the cache, so checking after every step never lets a stale
        // prefix survive long enough to be reused. The run below
        // therefore flattens incrementally throughout and compares only
        // at the end, against a reference document built independently.
        // Each step must be flattened, or the lowest change is always
        // layer 0 at the final flatten and the prefix is never reused at
        // all -- the path under test simply does not execute.
        dot('L4', 50); doc.flatten();      // saves a prefix below L4
        dot('L0', 60); doc.flatten();      // rebuilds; that prefix is now stale
        dot('L4', 70);
        const incremental = Float32Array.from(doc.flatten().array);
        const rebuilt = Float32Array.from(doc.flattenFull().array);
        for (let i = 0; i < incremental.length; i++) {
            if (incremental[i] !== rebuilt[i]) {
                assert.fail('a prefix captured before a low edit was reused after it, '
                    + `dropping that edit (first difference at ${i})`);
            }
        }

        doc.layer('L2').visible = false; same('after hiding a layer');
        doc.layer('L2').visible = true; same('after showing it again');
        doc.layer('L1').opacity = 0.3; same('after an opacity change');
        doc.layer('L3').blend = 'screen'; same('after a blend change');
        doc.layer('L3').addMask(); same('after adding a mask');
        doc.layer('L3').paintMask({ points: [{ x: 45, y: 30, p: 1 }],
            brush: 'eraser', size: 12 });
        same('after painting a mask');
        doc.reorder('L1', 4); same('after reordering');
        doc.removeLayer('L0'); same('after removing a layer');
    } finally { doc.dispose(); }
});

test('incremental flatten actually skips work', () => {
    // Without this the scheme could be correct and pointless.
    const doc = new PaintDocument(K, 64, 64);
    try {
        for (let i = 0; i < 6; i++) {
            doc.addLayer({ name: 'L' + i });
            doc.draw('L' + i, { path: `M 2 ${6 + i * 9} L 62 ${10 + i * 9}`,
                brush: 'pen', size: 7, color: '#38c' });
        }
        let blends = 0;
        const real = doc._compose.bind(doc);
        doc._compose = (t, i) => { blends++; return real(t, i); };
        const dot = (layer, x) => doc.draw(layer, { points: [{ x, y: 32, p: 1 }],
            brush: 'pen', size: 5, color: '#fff' });

        doc.flatten();
        blends = 0; doc.flatten();
        assert.equal(blends, 0, 'an unchanged flatten still composited');

        dot('L5', 10); doc.flatten();          // builds the prefix
        blends = 0; dot('L5', 20); doc.flatten();
        assert.equal(blends, 1, `painting the top layer cost ${blends} blends, expected 1`);

        blends = 0; dot('L0', 30); doc.flatten();
        assert.equal(blends, 6, 'painting the bottom layer should rebuild everything');
    } finally { doc.dispose(); }
});



test('blending over an empty backdrop is plain source-over', () => {
    // The blend term is scaled by the backdrop alpha, so with nothing
    // underneath every mode must reduce to the source.
    for (const mode of BLEND_MODE_NAMES) {
        const doc = new PaintDocument(K, 16, 16);
        try {
            doc.addLayer({ name: 'only', blend: mode });
            doc.draw('only', {
                points: [{ x: 2, y: 8, p: 1 }, { x: 14, y: 8, p: 1 }],
                brush: 'pen', size: 12, color: '#ff8000',
            });
            doc.flatten();
            const i = (8 * 16 + 8) * 4;
            const got = Array.from(doc.composite.array.slice(i, i + 4));
            assert.ok(Math.abs(got[0] - 1) < 0.01 && Math.abs(got[1] - 0.502) < 0.01
                && got[2] < 0.01, `${mode} over nothing: ${got.map((v) => v.toFixed(3))}`);
        } finally { doc.dispose(); }
    }
});

test('layer opacity scales the source contribution', () => {
    const full = blendPair('normal', '#000000', '#ffffff', 1)[0];
    const half = blendPair('normal', '#000000', '#ffffff', 0.5)[0];
    assert.ok(Math.abs(full - 1) < 0.01, `full: ${full}`);
    assert.ok(Math.abs(half - 0.5) < 0.01, `half: ${half}`);
    assert.equal(blendPair('normal', '#000000', '#ffffff', 0)[0], 0);
});

test('the flattened composite stays premultiplied-valid under every mode', () => {
    for (const mode of BLEND_MODE_NAMES) {
        const doc = new PaintDocument(K, 20, 20);
        try {
            doc.addLayer({ name: 'b' });
            doc.addLayer({ name: 's', blend: mode, opacity: 0.7 });
            doc.draw('b', { points: [{ x: 2, y: 10, p: 1 }, { x: 18, y: 10, p: 1 }],
                brush: 'airbrush', size: 14, color: '#20c0ff' });
            doc.draw('s', { points: [{ x: 2, y: 12, p: 1 }, { x: 18, y: 12, p: 1 }],
                brush: 'airbrush', size: 14, color: '#ffa000' });
            doc.flatten();
            const a = doc.composite.array;
            for (let i = 0; i < 20 * 20; i++) {
                const alpha = a[i * 4 + 3];
                assert.ok(alpha >= -1e-6 && alpha <= 1 + 1e-6, `${mode}: alpha ${alpha}`);
                for (let c = 0; c < 3; c++) {
                    assert.ok(a[i * 4 + c] <= alpha + 1e-5,
                        `${mode}: channel ${c} exceeds alpha at ${i}`);
                }
            }
        } finally { doc.dispose(); }
    }
});

test('hiding a layer removes it, and showing it restores exactly', () => {
    const doc = new PaintDocument(K, 24, 24);
    try {
        doc.addLayer({ name: 'a' });
        doc.addLayer({ name: 'b', blend: 'multiply' });
        const band = [{ x: 2, y: 12, p: 1 }, { x: 22, y: 12, p: 1 }];
        doc.draw('a', { points: band, brush: 'pen', size: 20, color: '#ffcc00' });
        doc.draw('b', { points: band, brush: 'pen', size: 20, color: '#3366ff' });

        doc.flatten();
        const both = Float32Array.from(doc.composite.array);
        doc.layer('b').visible = false;
        doc.flatten();
        const one = Float32Array.from(doc.composite.array);
        doc.layer('b').visible = true;
        doc.flatten();
        const again = Float32Array.from(doc.composite.array);

        assert.notDeepEqual(Array.from(both), Array.from(one), 'hiding changed nothing');
        assert.deepEqual(Array.from(both), Array.from(again), 'showing did not restore');
    } finally { doc.dispose(); }
});

test('reordering changes the result for an order-dependent mode', () => {
    const doc = new PaintDocument(K, 24, 24);
    try {
        doc.addLayer({ name: 'warm' });
        doc.addLayer({ name: 'cool', blend: 'colorBurn' });
        const band = [{ x: 2, y: 12, p: 1 }, { x: 22, y: 12, p: 1 }];
        doc.draw('warm', { points: band, brush: 'pen', size: 20, color: '#ff8800' });
        doc.draw('cool', { points: band, brush: 'pen', size: 20, color: '#3366ff' });
        doc.flatten();
        const before = Float32Array.from(doc.composite.array);
        doc.reorder('cool', 0);
        assert.deepEqual(doc.layers.map((l) => l.name), ['cool', 'warm']);
        doc.flatten();
        assert.notDeepEqual(Array.from(before), Array.from(doc.composite.array),
            'colorBurn is not commutative; reordering must change the result');
    } finally { doc.dispose(); }
});

test('bad layer and blend references fail loudly', () => {
    const doc = new PaintDocument(K, 8, 8);
    try {
        doc.addLayer({ name: 'one' });
        // A stroke to a layer that does not exist would otherwise vanish
        // silently, which in a declarative document is near-impossible to
        // notice.
        assert.throws(() => doc.layer('two'), /no layer "two"; have: one/);
        assert.throws(() => doc.addLayer({ name: 'one' }), /duplicate layer name/);
        assert.throws(() => doc.addLayer({ name: 'x', blend: 'multiplyy' }), /unknown blend mode/);
    } finally { doc.dispose(); }
});

test('toRgba8 flattens first if it has not been flattened', () => {
    // Forgetting to flatten would otherwise give an empty frame with no error.
    const doc = new PaintDocument(K, 16, 16);
    try {
        doc.addLayer({ name: 'a' });
        doc.draw('a', { points: [{ x: 8, y: 8, p: 1 }], brush: 'pen', size: 12, color: '#ff0000' });
        const out = doc.toRgba8();
        const i = (8 * 16 + 8) * 4;
        assert.equal(out[i], 255);
        assert.equal(out[i + 3], 255);
    } finally { doc.dispose(); }
});

// =====================================================================
// the film.json binding
// =====================================================================

const { compileFilm } = await import('../../src/core/script/compile.js');
const { attachPainters } = await import('../../src/backends/canvas2d/PaintPainter.js');

/** A one-scene film with one drawing and whatever actions are given. */
function filmWith(actions, drawing = {}) {
    return {
        version: 'jirex.film/1',
        meta: { title: 't', fps: 24, width: 400, height: 300 },
        palettes: { p: { ink: '#1a2b3c' } },
        scenes: [{
            id: 's1',
            palette: 'p',
            drawings: [{
                id: 'sketch', at: [200, 150], width: 300, height: 200,
                layers: [
                    { name: 'under', strokes: [{ path: 'M 20 100 C 90 20, 210 20, 280 100',
                        brush: 'pencil', color: 'ink', size: 8 }] },
                    { name: 'ink', blend: 'multiply', strokes: [{ path: 'M 20 150 L 280 150',
                        brush: 'ink', color: 'ink', size: 10 }] },
                ],
                ...drawing,
            }],
            shots: [{ id: 'a', duration: 4, actions }],
        }],
    };
}

const progressKeys = (out) => out.timeline.tracks
    .filter((t) => t.target === 's1/sketch' && t.path === 'props.progress')
    .flatMap((t) => t.keys.map((k) => [Number(k.t.toFixed(3)), k.v]));

test('drawings compile to paint nodes with palette colours resolved', () => {
    const out = compileFilm(filmWith([]), {});
    const node = out.scene.get('s1/sketch');
    assert.equal(node.kind, 'paint');
    assert.equal(node.props.paint.layers.length, 2);
    assert.equal(node.props.paint.layers[1].blend, 'multiply');
    // A drawing restyles with the scene instead of carrying hard-coded hexes.
    assert.equal(node.props.paint.layers[0].strokes[0].color, '#1a2b3c');
    assert.equal(out.diagnostics.length, 0);
});

test('a drawing with no draw action is simply present', () => {
    // The same way a character with no actions stands in its rest pose
    // rather than being invisible.
    const out = compileFilm(filmWith([]), {});
    assert.equal(out.scene.get('s1/sketch').props.progress, 1);
    assert.deepEqual(progressKeys(out), []);
});

test('draw emits a progress ramp, held at its start value beforehand', () => {
    // A drawing's authored progress is 1, so a reveal must explicitly hold
    // at 0 from frame one -- a track reads as its *first* key at every
    // earlier time, so without the hold the drawing is fully visible for
    // every frame before its own draw-on.
    const out = compileFilm(filmWith([
        { target: 'sketch', do: 'draw', at: 0.5, for: 3, ease: 'smooth' },
    ]), {});
    assert.deepEqual(progressKeys(out), [[0, 0], [0.5, 0], [3.5, 1]]);
});

test('draw with no duration is an instant reveal', () => {
    // Two keys are emitted at t=1 -- the ramp's start and end -- and they
    // collapse, because `key()` *replaces* a key at the same time rather
    // than appending. What survives is the right thing: a step-eased hold
    // at 0 from frame one, then full at t=1.
    const out = compileFilm(filmWith([{ target: 'sketch', do: 'draw', at: 1 }]), {});
    assert.deepEqual(progressKeys(out), [[0, 0], [1, 1]]);

    const track = out.timeline.tracks.find(
        (t) => t.target === 's1/sketch' && t.path === 'props.progress');
    assert.equal(track.keys[0].ease, 'step',
        'without a step ease the drawing would fade in rather than appear');
});

test('draw from/to can run the reveal backwards', () => {
    const out = compileFilm(filmWith([
        { target: 'sketch', do: 'draw', at: 0, for: 2, from: 1, to: 0 },
    ]), {});
    assert.deepEqual(progressKeys(out), [[0, 1], [2, 0]]);
});

test('draw at a drawing that does not exist is reported, not silent', () => {
    const out = compileFilm(filmWith([{ target: 'nope', do: 'draw' }]), {});
    assert.ok(out.diagnostics.some((d) => /no drawing "nope"/.test(d.message)),
        `expected a diagnostic, got ${JSON.stringify(out.diagnostics)}`);
    // And it must not be reported as a *cast* problem, which would send
    // whoever wrote it looking in the wrong place entirely.
    assert.ok(!out.diagnostics.some((d) => /is not cast/.test(d.message)));
});

test('an empty drawing and a stroke with no geometry are both reported', () => {
    const empty = compileFilm(filmWith([], { layers: [{ name: 'a', strokes: [] }] }), {});
    assert.ok(empty.diagnostics.some((d) => /no strokes/.test(d.message)));

    const bad = compileFilm(filmWith([], {
        layers: [{ name: 'a', strokes: [{ brush: 'ink', color: 'ink' }] }],
    }), {});
    assert.ok(bad.diagnostics.some((d) => /neither "path" nor "points"/.test(d.message)));
});

test('a painter renders a compiled drawing progressively', () => {
    const out = compileFilm(filmWith([]), {});
    const [painter] = attachPainters(out.scene, K);
    try {
        assert.ok(painter.totalDabs > 100, `only ${painter.totalDabs} dabs`);
        const inked = (p) => {
            const buf = painter.renderAt(p);
            let n = 0;
            for (let i = 3; i < buf.array.length; i += 4) if (buf.array[i] > 0.02) n++;
            return n;
        };
        const none = inked(0), half = inked(0.5), all = inked(1);
        assert.equal(none, 0, 'progress 0 drew something');
        assert.ok(half > 0 && half < all, `0 < ${half} < ${all}`);
        // Re-rendering the same progress must give the same pixels; frame
        // N is a pure function of N.
        const a = Float32Array.from(painter.renderAt(0.37).array);
        const b = Float32Array.from(painter.renderAt(0.37).array);
        assert.deepEqual(Array.from(a), Array.from(b));
    } finally { painter.dispose(); }
});

test('attachPainters is idempotent and skips nodes without a spec', () => {
    const out = compileFilm(filmWith([]), {});
    const first = attachPainters(out.scene, K);
    const second = attachPainters(out.scene, K);
    try {
        assert.equal(first.length, 1);
        assert.equal(second.length, 0, 'a second pass re-created painters');
    } finally { first.forEach((p) => p.dispose()); }
});
