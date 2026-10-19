/**
 * Tracing a character out of an uploaded picture.
 *
 * The figures here are drawn in code rather than loaded, so the test knows
 * exactly where every landmark should be and can say by how much the reader
 * missed. Most of these check SHAPE rather than structure, because a rig cut
 * in the wrong places passes every structural test ever written and animates
 * like a broken doll.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    matteBackground, clearHoles, maskFromAlpha, maskBounds, components,
    traceRing, simplify, pathFromRings, traceImage,
} from '../../src/core/trace/image.js';
import { landmarks, estimateRegions, characterFromImage, armSeams, rowRuns }
    from '../../src/core/trace/rig.js';
import { traceCharacter } from '../../src/core/trace/index.js';
import { compileFilm } from '../../src/core/script/compile.js';

const BG = [238, 243, 248];

/** A standing figure, with every landmark known by construction. */
function figure({ width = 300, height = 500, neck = true, legGap = true,
                  sameColourArms = false, bridgeFeet = false } = {}) {
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
        rgba[i * 4] = BG[0]; rgba[i * 4 + 1] = BG[1]; rgba[i * 4 + 2] = BG[2]; rgba[i * 4 + 3] = 255;
    }
    const put = (x, y, c) => {
        if (x < 0 || y < 0 || x >= width || y >= height) return;
        const q = (y * width + x) * 4;
        rgba[q] = c[0]; rgba[q + 1] = c[1]; rgba[q + 2] = c[2]; rgba[q + 3] = 255;
    };
    const box = (x0, y0, x1, y1, c) => {
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) put(x, y, c);
    };
    const SKIN = [228, 178, 142], SHIRT = [198, 72, 62], TROUSER = [56, 66, 104];
    const sleeve = sameColourArms ? SHIRT : SKIN;
    box(112, 20, 188, 100, SKIN);                       // head
    if (neck) box(140, 100, 160, 126, SKIN);            // neck
    box(108, neck ? 126 : 100, 192, 268, SHIRT);        // torso
    if (sameColourArms) {
        // Tucked in AND the same colour: no gap in the outline and no seam
        // in the paint. This is the case neither reader can solve.
        box(110, 132, 132, 252, sleeve);
        box(168, 132, 190, 252, sleeve);
    } else {
        box(84, 132, 108, 252, sleeve);                 // arms
        box(192, 132, 216, 252, sleeve);
    }
    box(116, 268, 146, 430, TROUSER);                   // legs
    box(legGap ? 154 : 146, 268, 184, 430, TROUSER);
    if (bridgeFeet) box(112, 430, 188, 452, [28, 28, 34]);
    else { box(112, 430, 150, 452, [28, 28, 34]); box(152, 430, 188, 452, [28, 28, 34]); }
    return { rgba, width, height };
}

// ------------------------------------------------------------- the matte

test('the matte floods from the corners, so enclosed colour survives', () => {
    const { rgba, width, height } = figure();
    // Paint a patch of the background colour INSIDE the torso. A threshold on
    // colour would clear it; a flood from the edges cannot reach it.
    for (let y = 180; y < 200; y++) {
        for (let x = 140; x < 160; x++) {
            const q = (y * width + x) * 4;
            rgba[q] = BG[0]; rgba[q + 1] = BG[1]; rgba[q + 2] = BG[2];
        }
    }
    const { fraction, keys } = matteBackground(rgba, width, height, { tolerance: 20 });
    assert.ok(fraction > 0.5 && fraction < 0.95);
    assert.equal(keys.length, 4, 'one key colour per corner');
    assert.equal(rgba[((190 * width) + 150) * 4 + 3], 255, 'the enclosed patch survives');
    assert.equal(rgba[3], 0, 'and the corner does not');
});

test('an already-transparent pixel is background whatever colour it is', () => {
    const rgba = new Uint8ClampedArray(4 * 4 * 4).fill(255);
    // A red, fully transparent corner: a PNG cut out somewhere else.
    for (let i = 0; i < 16; i++) { rgba[i * 4] = 200; rgba[i * 4 + 3] = i < 4 ? 0 : 255; }
    matteBackground(rgba, 4, 4, { tolerance: 1 });
    assert.equal(rgba[3], 0);
});

test('enclosed background is cleared when it is small and matches', () => {
    // The gap between two legs, closed at the bottom by the shoes, is exactly
    // this: a flood from the edges cannot reach it, and leaving it opaque
    // makes the silhouette one solid mass with both legs in one box.
    const { rgba, width, height } = figure({ bridgeFeet: true });
    const matted = matteBackground(rgba, width, height, { tolerance: 20 });
    const between = ((350 * width) + 150) * 4;
    assert.equal(rgba[between + 3], 255, 'the flood cannot reach between the legs');
    const { regions } = clearHoles(rgba, width, height, matted.keys, { tolerance: 20 });
    assert.ok(regions >= 1);
    assert.equal(rgba[between + 3], 0, 'and the hole pass clears it');
});

test('a large enclosed region is NOT cleared, so a shirt is safe', () => {
    const rgba = new Uint8ClampedArray(60 * 60 * 4);
    for (let i = 0; i < 3600; i++) {
        rgba[i * 4] = 10; rgba[i * 4 + 1] = 10; rgba[i * 4 + 2] = 10; rgba[i * 4 + 3] = 255;
    }
    // A big block of the background colour walled in by one dark pixel ring.
    for (let y = 6; y < 54; y++) {
        for (let x = 6; x < 54; x++) {
            const q = (y * 60 + x) * 4;
            rgba[q] = 10; rgba[q + 1] = 10; rgba[q + 2] = 10;
        }
    }
    const { regions } = clearHoles(rgba, 60, 60, [[10, 10, 10]], { maxFraction: 0.22 });
    assert.equal(regions, 0, 'a region that IS most of the figure is the figure');
});

// ------------------------------------------------------- mask and outline

test('components come back largest first and can be isolated', () => {
    const mask = new Uint8Array(20 * 20);
    for (let y = 2; y < 12; y++) for (let x = 2; x < 12; x++) mask[y * 20 + x] = 1;
    for (let y = 15; y < 18; y++) for (let x = 15; x < 18; x++) mask[y * 20 + x] = 1;
    const { parts } = components(mask, 20, 20, { minArea: 1 });
    assert.equal(parts.length, 2);
    assert.equal(parts[0].area, 100);
    assert.equal(parts[1].area, 9);
    assert.deepEqual(maskBounds(mask, 20, 20), { x: 2, y: 2, w: 16, h: 16, count: 109 });
});

test('a ring is traced in order and simplifies to its corners', () => {
    const mask = new Uint8Array(20 * 20);
    for (let y = 4; y < 15; y++) for (let x = 3; x < 16; x++) mask[y * 20 + x] = 1;
    const ring = traceRing(mask, 20, 20, 4 * 20 + 3);
    assert.ok(ring.length > 20, 'one point per boundary pixel before simplifying');
    // The walk must stay ON the shape.
    for (const [x, y] of ring) assert.equal(mask[y * 20 + x], 1);
    const corners = simplify(ring, 1.5);
    assert.ok(corners.length <= 6, `a rectangle has four corners, got ${corners.length}`);
    const d = pathFromRings([corners]);
    assert.match(d, /^M[\d.,-]+ L.*Z$/);
    assert.equal(simplify([[0, 0], [1, 1]], 1).length, 2, 'two points cannot be simplified');
});

// ------------------------------------------------------------- landmarks

test('the neck is found as a dip and the shoulders as the rise out of it', () => {
    const { rgba, width, height } = figure();
    const t = traceImage(rgba, width, height, { tolerance: 20 });
    const L = landmarks(t.mask, width, t.bounds);
    // The drawn neck runs y=100..126 and the shoulders start at 132.
    assert.ok(Math.abs(L.neckY - 113) < 16, `neck at ${L.neckY}, drawn 100..126`);
    assert.ok(L.shoulderY > L.neckY && L.shoulderY < 140, `shoulders at ${L.shoulderY}`);
    assert.ok(Math.abs(L.crotchY - 268) < 14, `crotch at ${L.crotchY}, drawn 268`);
    assert.ok(L.footY > 440);
});

test('a figure with no neck still finds its shoulders', () => {
    // The fallback: the first row markedly wider than the narrowest so far.
    // It must not fire on the two-pixel crown of a head, which is what the
    // first version did -- it put the neck on row one and every landmark
    // below it cascaded.
    const { rgba, width, height } = figure({ neck: false });
    const t = traceImage(rgba, width, height, { tolerance: 20 });
    const L = landmarks(t.mask, width, t.bounds);
    assert.ok(L.shoulderY > 60, `shoulders at ${L.shoulderY}, not at the top of the head`);
    assert.ok(L.shoulderY < 150);
});

test('arms that touch the torso are separated by colour', () => {
    const { rgba, width, height } = figure();
    const t = traceImage(rgba, width, height, { tolerance: 20 });
    const L = landmarks(t.mask, width, t.bounds);
    const seams = armSeams(rgba, width, rowRuns(t.mask, width, t.bounds),
                           L.shoulderY, L.crotchY, L.core);
    assert.ok(seams, 'a bare arm against a shirt has a seam');
    assert.ok(Math.abs(seams.left - 108) <= 3, `left seam at ${seams.left}, drawn 108`);
    assert.ok(Math.abs(seams.right - 191) <= 3, `right seam at ${seams.right}, drawn 192`);
});

test('arms in the same colour as the torso give up honestly', () => {
    const { rgba, width, height } = figure({ sameColourArms: true });
    const t = traceImage(rgba, width, height, { tolerance: 20 });
    const r = estimateRegions(t.mask, width, height, { bounds: t.bounds, rgba });
    assert.ok(r.warnings.some((w) => w.includes('not separable')));
    assert.ok(r.warnings.some((w) => w.includes('regions')), 'and says how to fix it');
    // A guess is still a usable arm, not a zero-width one.
    assert.ok(r.boxes.armL.w >= 2 && r.boxes.armR.w >= 2);
});

test('the legs are read from down the legs, not from beside the hands', () => {
    const { rgba, width, height } = figure();
    const t = traceImage(rgba, width, height, { tolerance: 20 });
    const r = estimateRegions(t.mask, width, height, { bounds: t.bounds, rgba });
    // The first split row below the crotch still has the hands beside it, so
    // taking the outermost two runs there makes the HANDS into legs.
    assert.ok(Math.abs(r.boxes.legL.x - 116) <= 4, `legL at ${r.boxes.legL.x}, drawn 116`);
    assert.ok(Math.abs(r.boxes.legR.x - 154) <= 4, `legR at ${r.boxes.legR.x}, drawn 154`);
    assert.ok(r.boxes.legL.w < 50 && r.boxes.legR.w < 50, 'a leg, not half the figure');
});

// --------------------------------------------------------- the character

test('a traced character is the generated rig by another route', () => {
    const { rgba, width, height } = figure();
    const r = traceCharacter(rgba, width, height, { asset: 'art', name: 'hero' });
    assert.equal(r.ok, true);
    const ids = r.character.parts.map((p) => p.id);
    // Named exactly like `generateCharacterParts`, which is the whole
    // integration: the free cycles, `reach`, `grip` and `pose` all key off
    // these names and none of them needs to know the character was traced.
    for (const id of ['hips', 'torso', 'head', 'armL', 'foreL', 'handL',
                      'thighR', 'shinR', 'footR']) {
        assert.ok(ids.includes(id), `missing ${id}`);
    }
    const byId = new Map(r.character.parts.map((p) => [p.id, p]));
    assert.equal(byId.get('foreL').parent, 'armL');
    assert.equal(byId.get('shinL').parent, 'thighL');
    assert.equal(byId.get('head').parent, 'torso');
    assert.equal(byId.get('hips').parent, undefined, 'the hips are the root');
});

test('every part is a crop of one image, anchored at its joint', () => {
    const { rgba, width, height } = figure();
    const r = traceCharacter(rgba, width, height, { asset: 'art' });
    for (const part of r.character.parts) {
        if (part.id === 'hips') continue;
        const s = part.shape;
        assert.equal(s.kind, 'image');
        assert.equal(s.asset, 'art', 'one asset, many source rectangles');
        assert.ok(s.sw > 0 && s.sh > 0, `${part.id} has an empty crop`);
        assert.ok(s.sx >= 0 && s.sy >= 0 && s.sx + s.sw <= width && s.sy + s.sh <= height,
                  `${part.id} crops outside the image`);
        // The anchor is where the joint sits INSIDE the crop; without it an
        // image can only turn about its corner or its centre, and a head
        // nodding about its own middle comes off at the chin.
        assert.ok(s.ax >= -1 && s.ax <= s.w + 1, `${part.id} ax ${s.ax} outside 0..${s.w}`);
        assert.ok(s.ay >= -1 && s.ay <= s.h + 1, `${part.id} ay ${s.ay} outside 0..${s.h}`);
    }
});

test('the figure comes out the height it was asked for', () => {
    const { rgba, width, height } = figure();
    const r = traceCharacter(rgba, width, height, { height2d: 240 });
    assert.ok(Math.abs(r.scale * r.bounds.h - 240) < 1, 'scale maps the bounds to the height');
    assert.equal(r.character.proportions.height, 240);
    assert.ok(r.character.proportions.headRatio > 0.1
              && r.character.proportions.headRatio < 0.45);
});

test('a traced character compiles, casts and walks', () => {
    const { rgba, width, height } = figure();
    const r = traceCharacter(rgba, width, height, { asset: 'art', name: 'hero' });
    const film = {
        version: 'jirex.film/1',
        meta: { title: 't', fps: 24, width: 900, height: 700 },
        assets: { art: { kind: 'image', src: 'art.png' } },
        characters: { hero: r.character },
        scenes: [{ id: 's1', cast: [{ character: 'hero', as: 'hero', at: [450, 600] }],
                   shots: [{ id: 'a', duration: 2,
                             actions: [{ target: 'hero', do: 'play', action: 'walk' }] }] }],
    };
    const c = compileFilm(film);
    // A traced character carries `proportions` and no `generate`. Keying the
    // free cycles off `generate` alone meant an uploaded character could be
    // perfectly rigged and still refuse to walk.
    assert.deepEqual(c.diagnostics.filter((d) => d.severity === 'error'), []);
    assert.equal(c.timeline.clips.size, 1);
    assert.ok(c.scene.get('s1/hero/armL'), 'the parts reach the scene');
});

test('the camera rests at the centre of the frame, not at its corner', () => {
    // Camera coordinates are OFFSETS from the centre, so a film with no
    // camera must key (w/2, h/2) and not (w, h). Defaulting to the centre
    // double-counted it and framed every such film half a frame off.
    const c = compileFilm({
        version: 'jirex.film/1',
        meta: { title: 't', fps: 24, width: 900, height: 700 },
        characters: {}, scenes: [{ id: 's1', cast: [], shots: [{ id: 'a', duration: 1 }] }],
    });
    const x = c.timeline.tracks.find((t) => t.target === '__camera' && t.path === 'transform.x');
    const y = c.timeline.tracks.find((t) => t.target === '__camera' && t.path === 'transform.y');
    assert.deepEqual(x.keys.map((k) => k.v), [450, 450]);
    assert.deepEqual(y.keys.map((k) => k.v), [350, 350]);
});

test('an empty matte is reported rather than returning a rig of nothing', () => {
    const rgba = new Uint8ClampedArray(20 * 20 * 4).fill(255);
    const r = traceCharacter(rgba, 20, 20, {});
    assert.equal(r.ok, false);
    assert.ok(r.warnings[0].includes('matte'));
});
