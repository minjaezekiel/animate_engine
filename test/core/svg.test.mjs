import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tokenizePath, normalizePath, arcToCubics, parseTransform, transformPath,
         pathBounds, toPathData, multiply, IDENTITY } from '../../src/core/art/svgPath.js';
import { parseSVG, shapeToPathData, viewBoxMatrix, SVG_MAX_NODES } from '../../src/core/art/svg.js';
import { sheetFrames, sheetSwap, sheetProps } from '../../src/core/art/sheet.js';

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

// ------------------------------------------------------------- the tokeniser

test('SVG number syntax is its own language, and all of it parses', () => {
    // `1.5.5` is two numbers; a minus sign needs no separator; exponents count.
    assert.deepEqual(tokenizePath('M1.5.5L-1-2'), [['M', 1.5, 0.5], ['L', -1, -2]]);
    assert.deepEqual(tokenizePath('M1e2 1E-2'), [['M', 100, 0.01]]);
    // Implicit repeats: a second coordinate pair after M is a lineto.
    assert.deepEqual(tokenizePath('M0 0 1 1 2 2'),
                     [['M', 0, 0], ['L', 1, 1], ['L', 2, 2]]);
    assert.deepEqual(tokenizePath('m0 0 1 1'), [['m', 0, 0], ['l', 1, 1]]);
});

test("an arc's flags are single digits and may carry no delimiter", () => {
    // `a5 5 0 015 5` is rx=5 ry=5 rot=0 large=0 sweep=1 x=5 y=5 -- the form a
    // real optimiser emits. Read as seven whitespace-separated numbers it is
    // a different arc, silently.
    assert.deepEqual(tokenizePath('a5 5 0 015 5'), [['a', 5, 5, 0, 0, 1, 5, 5]]);
});

test('a truncated path yields what it had, not a throw', () => {
    assert.deepEqual(tokenizePath('M0 0 L5'), [['M', 0, 0]]);
    assert.deepEqual(tokenizePath('Q1 2 3'), []);
    assert.deepEqual(tokenizePath(''), []);
    assert.deepEqual(tokenizePath('5 5 L1 1'), []);        // numbers before a command
});

// ----------------------------------------------------------- the normal form

test('every command reduces to absolute M / L / C / Z', () => {
    const segs = normalizePath('m10 10 h20 v20 l-20 0 Z');
    assert.deepEqual(segs.map((s) => s[0]), ['M', 'L', 'L', 'L', 'Z']);
    assert.deepEqual(segs[1], ['L', 30, 10]);
    assert.deepEqual(segs[2], ['L', 30, 30]);
    assert.deepEqual(segs[3], ['L', 10, 30]);
});

test('a quadratic becomes the exact cubic, not an approximation', () => {
    const [, c] = normalizePath('M0 0 Q30 0 30 30');
    // Controls two thirds of the way out from each end.
    assert.deepEqual(c, ['C', 20, 0, 30, 10, 30, 30]);
});

test("S and T reflect the previous control point, and fall back to the current point", () => {
    const a = normalizePath('M0 0 C10 0 20 0 30 0 S40 10 50 0');
    assert.deepEqual(a[2].slice(1, 3), [40, 0]);        // reflected: 2*30 - 20
    const b = normalizePath('M0 0 S10 10 20 0');
    assert.deepEqual(b[1].slice(1, 3), [0, 0]);         // no previous cubic
});

test('a closepath returns the pen to the subpath start', () => {
    const segs = normalizePath('M10 10 L20 10 Z l5 0');
    assert.deepEqual(segs[segs.length - 1], ['L', 15, 10]);
});

// -------------------------------------------------------------------- arcs

test('an arc becomes cubics that land where the arc ends', () => {
    const segs = arcToCubics(0, 0, 20, 20, 0, 0, 1, 40, 0);
    const last = segs[segs.length - 1];
    near(last[5], 40); near(last[6], 0);
    // A half turn is two quarter-turn cubics; one would be visibly wrong.
    assert.equal(segs.length, 2);
    // Midpoint of a semicircle of radius 20, swept clockwise in screen space.
    const b = pathBounds([['M', 0, 0], ...segs]);
    near(b.height, 20, 0.02);
});

test('radii too small to reach the endpoint are scaled up, per the spec', () => {
    // A 1-unit radius cannot span 40 units; the spec says grow it, not give up.
    const segs = arcToCubics(0, 0, 1, 1, 0, 0, 1, 40, 0);
    const last = segs[segs.length - 1];
    near(last[5], 40); near(last[6], 0);
    near(pathBounds([['M', 0, 0], ...segs]).height, 20, 0.05);
});

test('a degenerate arc is a line', () => {
    assert.deepEqual(arcToCubics(0, 0, 0, 10, 0, 0, 1, 5, 5), [['L', 5, 5]]);
    assert.deepEqual(arcToCubics(3, 3, 5, 5, 0, 0, 1, 3, 3), []);
});

// --------------------------------------------------------------- transforms

test('a transform list composes left to right, as SVG says', () => {
    // `translate(10,0) scale(2)` scales FIRST: (1,1) -> (2,2) -> (12,2).
    const m = parseTransform('translate(10,0) scale(2)');
    assert.deepEqual(transformPath(normalizePath('M1 1'), m), [['M', 12, 2]]);
    // Reading it as function application would give (1,1) -> (11,1) -> (22,2).
});

test('rotate about a point returns that point to itself', () => {
    const m = parseTransform('rotate(90 5 5)');
    const [p] = transformPath(normalizePath('M5 5'), m);
    near(p[1], 5); near(p[2], 5);
    const [q] = transformPath(normalizePath('M15 5'), m);
    near(q[1], 5); near(q[2], 15);
});

test('an affine transform maps a cubic exactly, with no resampling', () => {
    const m = parseTransform('rotate(37) scale(1.5,0.5) translate(3,-4)');
    const segs = normalizePath('M0 0 C10 20 30 -5 40 0');
    const moved = transformPath(segs, m);
    assert.equal(moved.length, segs.length);
    assert.equal(moved[1][0], 'C');
    // The transformed curve's bounds equal the transform of nothing less --
    // if it had been flattened first the control points would be gone.
    assert.equal(moved[1].length, 7);
});

test('nonsense in a transform is skipped, not thrown', () => {
    assert.deepEqual(parseTransform('scale(nope) translate(5,5)'), [1, 0, 0, 1, 5, 5]);
    assert.deepEqual(parseTransform(null), IDENTITY);
    assert.deepEqual(multiply(IDENTITY, IDENTITY), IDENTITY);
});

// ------------------------------------------------------------------ bounds

/**
 * The defect this replaced: `staging.js` read `d` as a flat list of
 * coordinate pairs, which is right for absolute `M`/`L` and wrong for
 * everything else -- and that box is what every 2D framing check measures.
 */
test('bounds are exact where counting number pairs was not', () => {
    const naive = (d) => {
        const n = String(d).match(/-?\d*\.?\d+/g) ?? [];
        let l = Infinity, r = -Infinity;
        for (let i = 0; i + 1 < n.length; i += 2) { l = Math.min(l, +n[i]); r = Math.max(r, +n[i]); }
        return r - l;
    };
    // Relative commands: the numbers are deltas, so the old reading was a third.
    near(pathBounds(normalizePath('m0 0 l10 0 l10 0 l10 0')).width, 30);
    assert.equal(naive('m0 0 l10 0 l10 0 l10 0'), 10);
    // An arc: seven arguments, five of which are not coordinates.
    near(pathBounds(normalizePath('M0 0 a20 20 0 0 1 40 0')).width, 40);
    assert.equal(naive('M0 0 a20 20 0 0 1 40 0'), 20);
});

test("a curve's bulge is in the bounds and its control points are not", () => {
    // Controls at y=40, the curve peaks at y=30.
    const b = pathBounds(normalizePath('M0 0 C0 40 40 40 40 0'));
    near(b.height, 30);
    near(b.width, 40);
});

test('bounds of nothing is null, not a box around the origin', () => {
    assert.equal(pathBounds([]), null);
    assert.equal(pathBounds(normalizePath('Z')), null);
});

// ------------------------------------------------------------- serialising

test('path data is rounded, because a film is a file people read', () => {
    const d = toPathData(normalizePath('M0.00000001 0 L1 1'));
    assert.equal(d, 'M0 0 L1 1');
    assert.ok(!d.includes('-0 '), 'no negative zero');
});

// ------------------------------------------------------------- the document

test('every SVG shape becomes path data', () => {
    assert.equal(shapeToPathData('rect', { width: 4, height: 2 }), 'M0 0H4V2H0Z');
    assert.equal(shapeToPathData('line', { x1: 1, y1: 2, x2: 3, y2: 4 }), 'M1 2L3 4');
    assert.equal(shapeToPathData('polygon', { points: '0,0 4,0 4,4' }), 'M0 0L4 0L4 4Z');
    assert.equal(shapeToPathData('polyline', { points: '0,0 4,0' }), 'M0 0L4 0');
    near(pathBounds(normalizePath(shapeToPathData('circle', { r: 5 }))).width, 10, 1e-9);
    near(pathBounds(normalizePath(shapeToPathData('ellipse', { rx: 5, ry: 3 }))).height, 6, 1e-9);
    // Degenerate shapes draw nothing rather than a point.
    assert.equal(shapeToPathData('rect', { width: 0, height: 5 }), '');
    assert.equal(shapeToPathData('circle', { r: 0 }), '');
});

test("a rect's corner radii are clamped to half its own side", () => {
    const b = pathBounds(normalizePath(shapeToPathData('rect',
        { width: 10, height: 10, rx: 99 })));
    near(b.width, 10, 1e-9);
    near(b.height, 10, 1e-9);
});

test('viewBox scales uniformly and centres, like preserveAspectRatio does', () => {
    // A 2:1 box into a square: scale 1, centred vertically.
    assert.deepEqual(viewBoxMatrix('0 0 100 50', 100, 100), [1, 0, 0, 1, 0, 25]);
    assert.deepEqual(viewBoxMatrix(null, 10, 10), IDENTITY);
    assert.deepEqual(viewBoxMatrix('bad', 10, 10), IDENTITY);
});

test('a group transform reaches every child and composes with its own', () => {
    const { parts } = parseSVG(
        '<svg viewBox="0 0 100 100"><g transform="translate(10,0)">'
        + '<rect x="0" y="0" width="10" height="10" transform="translate(0,5)"/></g></svg>',
        { center: false });
    assert.equal(parts.length, 1);
    const b = pathBounds(normalizePath(parts[0].shape.d));
    assert.deepEqual([b.left, b.top], [10, 5]);
});

test('what is not geometry is reported by name, with what to do instead', () => {
    const { parts, warnings } = parseSVG(
        '<svg><text>a</text><text>b</text><use href="#x"/><image href="y.png"/></svg>');
    assert.equal(parts.length, 0);
    assert.ok(warnings.some((w) => /2 <text>/.test(w)));
    assert.ok(warnings.some((w) => /<use>/.test(w) && /flatten/.test(w)));
    assert.ok(warnings.some((w) => /<image>/.test(w) && /still a raster/.test(w)));
});

test('nothing inside defs, clipPath or mask is drawn', () => {
    const { parts, warnings } = parseSVG(
        '<svg viewBox="0 0 10 10"><defs><linearGradient id="g"><stop/></linearGradient>'
        + '<rect width="9" height="9"/></defs><clipPath id="c"><circle r="4"/></clipPath>'
        + '<rect width="5" height="5"/></svg>', { center: false });
    assert.equal(parts.length, 1);
    // And a gradient in there is not an element the author forgot.
    assert.ok(!warnings.some((w) => /linearGradient|<stop>/.test(w)), warnings.join(' | '));
});

test('a comment and a stylesheet are not markup', () => {
    const { parts, warnings } = parseSVG(
        '<svg viewBox="0 0 10 10"><!-- <rect width="9" height="9"/> -->'
        + '<style>rect { fill: red }</style><rect width="5" height="5"/></svg>',
        { center: false });
    assert.equal(parts.length, 1);
    assert.ok(warnings.some((w) => /CSS classes are not applied/.test(w)));
});

test('paint is inherited, and SVG fill defaults to black', () => {
    const { parts } = parseSVG(
        '<svg><g fill="#abc" stroke-width="3"><path d="M0 0L1 1" stroke="#def"/>'
        + '<path d="M0 0L1 1" fill="none"/></g><path d="M0 0L1 1"/></svg>',
        { center: false });
    assert.equal(parts[0].fill, '#abc');
    assert.equal(parts[0].stroke, '#def');
    assert.equal(parts[0].strokeWidth, 3);
    assert.equal(parts[1].fill, undefined);      // fill="none"
    assert.equal(parts[2].fill, '#000000');      // the SVG default, made explicit
});

test('a style attribute beats the presentation attribute', () => {
    const { parts } = parseSVG(
        '<svg><path d="M0 0L1 1" fill="#111" style="fill:#222;opacity:0.5"/></svg>',
        { center: false });
    assert.equal(parts[0].fill, '#222');
    assert.equal(parts[0].alpha, 0.5);
});

test('a gradient fill is reported once, not once per element', () => {
    const { warnings } = parseSVG(
        '<svg><path d="M0 0L1 1" fill="url(#g)"/><path d="M0 0L1 1" fill="url(#g)"/></svg>');
    assert.equal(warnings.filter((w) => /gradient and pattern/.test(w)).length, 1);
});

test('width resizes uniformly and scales the stroke with it', () => {
    const { parts, size } = parseSVG(
        '<svg viewBox="0 0 20 10"><rect width="20" height="10" stroke="#000" stroke-width="2"/></svg>',
        { width: 200 });
    near(size[0], 200); near(size[1], 100);
    assert.equal(parts[0].strokeWidth, 20);
    // Centred on the origin, because a film places things by their middle.
    const b = pathBounds(normalizePath(parts[0].shape.d));
    near(b.left, -100); near(b.right, 100);
});

test('a file with no svg element is a warning, not a crash', () => {
    const r = parseSVG('<html><body>no</body></html>');
    assert.deepEqual(r.parts, []);
    assert.deepEqual(r.warnings, ['no <svg> element']);
    assert.equal(parseSVG(null).parts.length, 0);
});

test('an absurdly dense file is capped and says so', () => {
    const one = '<rect width="1" height="1"/>';
    const r = parseSVG(`<svg viewBox="0 0 1 1">${one.repeat(SVG_MAX_NODES + 10)}</svg>`);
    assert.equal(r.parts.length, SVG_MAX_NODES);
    assert.ok(r.warnings.some((w) => /more than 2000/.test(w)));
});

// ------------------------------------------------------------ sprite sheets

test('a grid divides the image, and the cell size is derived', () => {
    const f = sheetFrames({ grid: [4, 2], width: 256, height: 128 });
    assert.equal(f.length, 8);
    assert.deepEqual(f[0], { sx: 0, sy: 0, sw: 64, sh: 64 });
    assert.deepEqual(f[5], { sx: 64, sy: 64, sw: 64, sh: 64 });
});

test('margin and spacing are what a real packer leaves behind', () => {
    const f = sheetFrames({ grid: [2, 1], width: 2 * 10 + 2 * 2 + 3, margin: 2, spacing: 3,
                            height: 10 + 4 });
    assert.deepEqual(f[0], { sx: 2, sy: 2, sw: 10, sh: 10 });
    assert.deepEqual(f[1], { sx: 15, sy: 2, sw: 10, sh: 10 });
});

test('count stops before the blank cells a grid cannot avoid', () => {
    assert.equal(sheetFrames({ grid: [4, 4], width: 64, height: 64, count: 13 }).length, 13);
    assert.equal(sheetFrames({ grid: [2, 2], width: 64, height: 64, count: 99 }).length, 4);
});

test('an explicit atlas wins over a grid', () => {
    const f = sheetFrames({ grid: [4, 4], frames: [[1, 2, 3, 4], [5, 6, 7, 8]],
                            width: 64, height: 64 });
    assert.deepEqual(f, [{ sx: 1, sy: 2, sw: 3, sh: 4 }, { sx: 5, sy: 6, sw: 7, sh: 8 }]);
});

test('a sheet that cannot resolve returns nothing rather than guessing', () => {
    assert.deepEqual(sheetFrames({ grid: [4, 2] }), []);                      // no image size
    assert.deepEqual(sheetFrames({ grid: [0, 2], width: 10, height: 10 }), []);
    assert.deepEqual(sheetFrames({}), []);
    assert.equal(sheetProps({ grid: [2, 2] }, null), null);
    assert.equal(sheetProps({}, { width: 10, height: 10 }), null);
});

test('each frame carries its DESTINATION size, or one cell fills the sheet', () => {
    const shapes = sheetSwap(sheetFrames({ grid: [2, 1], width: 128, height: 64 }));
    assert.equal(shapes['0'].w, 64);
    assert.equal(shapes['0'].h, 64);
    assert.equal(shapes['0'].cx, true);
});

test('a pivot puts the origin where the animator needs it', () => {
    const shapes = sheetSwap(sheetFrames({ grid: [2, 1], width: 128, height: 64 }),
                             { pivot: [0.5, 1] });
    assert.equal(shapes['0'].ax, 32);
    assert.equal(shapes['0'].ay, 64);          // standing on its feet, not centred
    assert.equal(shapes['0'].cx, undefined);
});

test('a sheet is a swap set on `frame`, so the existing verbs drive it', () => {
    const p = sheetProps({ grid: [3, 1] }, { width: 96, height: 32 });
    assert.deepEqual(Object.keys(p.swapSets.frame), ['0', '1', '2']);
    assert.equal(p.swapDefaults.frame, '0');
    assert.equal(p.frameCount, 3);
});

// --------------------------------------------- the sheet reaching the scene

import { compileFilm } from '../../src/core/script/compile.js';

const sheetFilm = (assetSpec, extra = {}) => ({
    version: 'jirex.film/1',
    meta: { title: 'sheet', fps: 24, width: 320, height: 180 },
    assets: { walk: { kind: 'image', src: 'walk.png', ...assetSpec } },
    scenes: [{
        id: 's',
        scenery: [{ id: 'hero', at: [160, 90],
                    shape: { kind: 'image', asset: 'walk', ...extra } }],
        shots: [{ id: 'a', duration: 1 }],
    }],
});
const fakeImage = { width: 256, height: 64 };

test('a declared sprite sheet reaches the scene as a swap channel', () => {
    const { scene, diagnostics } = compileFilm(sheetFilm({ grid: [4, 1] }),
                                               { assets: { walk: fakeImage } });
    const node = [...scene.byId.values()].find((n) => n.name === 'hero');
    assert.deepEqual(Object.keys(node.props.swapSets.frame), ['0', '1', '2', '3']);
    assert.equal(node.props.swapDefaults.frame, '0');
    assert.equal(node.props.frameCount, 4);
    assert.equal(node.props.swapSets.frame['2'].sx, 128);
    assert.equal(diagnostics.filter((d) => d.severity !== 'info').length, 0);
});

test('a part may override the asset with its own slice of the atlas', () => {
    const { scene } = compileFilm(sheetFilm({ grid: [4, 1] }, { grid: [2, 1] }),
                                  { assets: { walk: fakeImage } });
    const node = [...scene.byId.values()].find((n) => n.name === 'hero');
    assert.equal(Object.keys(node.props.swapSets.frame).length, 2);
    assert.equal(node.props.swapSets.frame['1'].sw, 128);
    // The declaration itself does not survive onto the node: `grid` is not a
    // thing the renderer reads, and leaving it there is a prop nobody owns.
    assert.equal(node.props.grid, undefined);
});

test('a sheet that cannot resolve is a diagnostic, not a silent whole image', () => {
    const { diagnostics } = compileFilm(sheetFilm({ grid: [4, 1] }), { assets: {} });
    assert.ok(diagnostics.some((d) => /sprite sheet that does not resolve/.test(d.message)
                                      && /not loaded/.test(d.message)),
              diagnostics.map((d) => d.message).join(' | '));
});

test('an ordinary image is untouched by any of this', () => {
    const { scene } = compileFilm(sheetFilm({}), { assets: { walk: fakeImage } });
    const node = [...scene.byId.values()].find((n) => n.name === 'hero');
    assert.equal(node.props.swapSets, undefined);
    assert.equal(node.props.image, fakeImage);
});
