import { test } from 'node:test';
import assert from 'node:assert/strict';

import { compileFilm } from '../../src/core/script/compile.js';
import { validateFilm } from '../../src/core/script/validate.js';
import { samplePose, applyPose } from '../../src/core/anim/Evaluator.js';
import { PaintPainter } from '../../src/backends/canvas2d/PaintPainter.js';
import { loadKernels } from '../../src/kernels/index.js';

/**
 * Boil -- the redrawn contour of a pencil test.
 *
 * The thing being tested is not "a number changed". It is that the same
 * strokes RASTERISE DIFFERENTLY between exposures and identically within one,
 * because that is the whole feature. See 21-DRAWN-ANIMATION.md.
 */

const kernels = await loadKernels({ prefer: 'js' });

const film = (actions, over = {}) => ({
    version: 'jirex.film/1',
    meta: { title: 'boil', fps: 24, width: 400, height: 300 },
    characters: { man: { generate: { build: 'stocky' }, proportions: { height: 200 } } },
    scenes: [{
        id: 's1',
        cast: [{ character: 'man', as: 'man', at: [200, 0] }],
        drawings: [{
            id: 'ink', at: [200, 150], width: 300, height: 200,
            layers: [{ name: 'l', strokes: [{
                path: 'M 20 100 C 90 20, 210 20, 280 100',
                brush: 'pencil', color: '#2b1a10', size: 10, seed: 1,
            }] }],
        }],
        shots: [{ id: 'a', duration: 2, actions, ...(over.shot ?? {}) }],
    }],
});

const boilKeys = (r) => r.timeline.tracks
    .filter((t) => t.target === 's1/ink' && t.path === 'props.boil')
    .flatMap((t) => t.keys.map((k) => [Math.round(k.t * 24), k.v]));

test('boil keys one stepped exposure index per 1/rate second', () => {
    const r = compileFilm(film([{ target: 'ink', do: 'boil', rate: 8, for: 1 }]));
    assert.deepEqual(r.diagnostics.filter((d) => d.severity === 'error'), []);
    // 8 exposures in 1s at 24fps -> every 3 frames, indices 0..7
    assert.deepEqual(boilKeys(r), [[0, 0], [3, 1], [6, 2], [9, 3], [12, 4], [15, 5], [18, 6], [21, 7]]);
});

test('the index is stepped, never interpolated -- a redraw is not a morph', () => {
    const r = compileFilm(film([{ target: 'ink', do: 'boil', rate: 8, for: 1 }]));
    const track = r.timeline.tracks.find((t) => t.target === 's1/ink' && t.path === 'props.boil');
    assert.ok(track.keys.every((k) => k.ease === 'step'), 'every boil key holds');
    const v = (t) => samplePose(r.timeline, t).get('s1/ink')?.get('props.boil');
    assert.equal(v(0), 0);
    assert.equal(v(2 / 24), 0, 'still the first exposure');
    assert.equal(v(3 / 24), 1, 'and now the second');
});

test('boiling a character assembled from shapes refuses, and says why', () => {
    const r = compileFilm(film([{ target: 'man', do: 'boil', rate: 8 }]));
    assert.equal(boilKeys(r).length, 0);
    const d = r.diagnostics.find((x) => /boil:/.test(x.message));
    assert.match(d.message, /no strokes to redraw/);
    assert.match(d.message, /"strokes"/, 'it names what a character needs to be boilable');
});

test('boiling a DRAWN character boils every one of its parts', () => {
    const drawn = {
        version: 'jirex.film/1',
        meta: { fps: 24, width: 400, height: 300 },
        palettes: { p: { ink: '#2b1a10' } },
        characters: { pup: { palette: 'p', proportions: { height: 120 }, parts: [
            { id: 'body', parent: null, pivot: [0, 0], strokes: [
                { path: 'M -40 0 C -20 -30, 20 -30, 40 0', brush: 'pencil', color: 'ink', size: 7 }] },
            { id: 'tail', parent: 'body', pivot: [-40, 0], strokes: [
                { path: 'M 0 0 Q -20 -20 -30 -40', brush: 'pencil', color: 'ink', size: 5 }] },
        ] } },
        scenes: [{ id: 's1', palette: 'p',
            cast: [{ character: 'pup', as: 'pup', at: [200, 150] }],
            shots: [{ id: 'a', duration: 1,
                      actions: [{ target: 'pup', do: 'boil', rate: 8 }] }] }],
    };
    assert.deepEqual(validateFilm(drawn).filter((d) => d.severity === 'error'), []);
    const r = compileFilm(drawn);
    const boiled = new Set(r.timeline.tracks
        .filter((t) => t.path === 'props.boil').map((t) => t.target));
    assert.deepEqual([...boiled].sort(), ['s1/pup/body', 's1/pup/tail']);
});

test('parts do not boil in lockstep', () => {
    const drawn = compileFilm({
        version: 'jirex.film/1',
        meta: { fps: 24, width: 400, height: 300 },
        palettes: { p: { ink: '#2b1a10' } },
        characters: { pup: { palette: 'p', proportions: { height: 120 }, parts: [
            { id: 'body', parent: null, pivot: [0, 0], strokes: [
                { path: 'M -40 0 L 40 0', brush: 'pencil', color: 'ink', size: 7 }] },
            { id: 'tail', parent: 'body', pivot: [-40, 0], strokes: [
                { path: 'M 0 0 L -30 -40', brush: 'pencil', color: 'ink', size: 5 }] },
        ] } },
        scenes: [{ id: 's1', palette: 'p',
            cast: [{ character: 'pup', as: 'pup', at: [200, 150] }],
            shots: [{ id: 'a', duration: 1,
                      actions: [{ target: 'pup', do: 'boil', rate: 8 }] }] }],
    });
    const seedAt0 = (target) => drawn.timeline.tracks
        .find((t) => t.target === target && t.path === 'props.boil').keys[0].v;
    assert.notEqual(seedAt0('s1/pup/body'), seedAt0('s1/pup/tail'),
        'a figure whose every contour jumps on the same seed reads as a glitch');
});

test('boiling an unknown target warns', () => {
    const r = compileFilm(film([{ target: 'nope', do: 'boil' }]));
    assert.ok(r.diagnostics.some((d) => /boil: no drawing or cast member "nope"/.test(d.message)));
});

test('a non-positive rate warns rather than looping forever', () => {
    for (const rate of [0, -4, 'fast']) {
        const r = compileFilm(film([{ target: 'ink', do: 'boil', rate }]));
        assert.equal(boilKeys(r).length, 0, `rate ${rate} must not compile`);
        assert.ok(r.diagnostics.some((d) => /boil: "rate"/.test(d.message)));
    }
});

// --- what the feature is actually for -------------------------------------

/** Rasterise the drawing at a given exposure and return its pixels. */
function pixelsAt(boil, amplitude = null) {
    const r = compileFilm(film([]));
    const spec = structuredClone(r.scene.get('s1/ink').props.paint);
    const painter = new PaintPainter(spec, kernels, { createCanvas: () => null });
    painter.renderAt(1, boil, amplitude);
    return Uint8ClampedArray.from(painter.document.toRgba8());
}

test('two exposures of the same strokes rasterise DIFFERENTLY', () => {
    const a = pixelsAt(0);
    const b = pixelsAt(1);
    assert.equal(a.length, b.length);
    let changed = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) changed++;
    assert.ok(changed > 0, 'a boiled redraw that is identical is not a boil');
});

test('the same exposure is byte-identical, so a render is reproducible', () => {
    assert.deepEqual(pixelsAt(3), pixelsAt(3));
});

test('amplitude moves the contour further', () => {
    const base = pixelsAt(0);
    const diffAgainstBase = (amp) => {
        const p = pixelsAt(1, amp);
        let n = 0;
        for (let i = 0; i < base.length; i++) if (base[i] !== p[i]) n++;
        return n;
    };
    assert.ok(diffAgainstBase(0.6) > diffAgainstBase(0.05),
        'a wider jitter displaces more pixels than a narrow one');
});

test('a drawing that is never boiled renders exactly as it always did', () => {
    const r = compileFilm(film([]));
    const spec = structuredClone(r.scene.get('s1/ink').props.paint);
    const painter = new PaintPainter(spec, kernels, { createCanvas: () => null });
    const plain = Uint8ClampedArray.from(painter.renderAt(1) && painter.document.toRgba8());
    assert.deepEqual(plain, pixelsAt(0), 'boil 0 is the unboiled drawing');
});

test('the painter does not clone strokes, so the resample cache still hits', () => {
    const r = compileFilm(film([]));
    const spec = structuredClone(r.scene.get('s1/ink').props.paint);
    const painter = new PaintPainter(spec, kernels, { createCanvas: () => null });
    const stroke = painter.spec.layers[0].strokes[0];
    painter.renderAt(1, 5);
    assert.equal(painter.spec.layers[0].strokes[0], stroke,
        'cloning a stroke leaks one kernel buffer per exposure: _prepare caches by identity');
    assert.equal(stroke.__seed0, 1, 'the authored seed is remembered');
    assert.equal(stroke.seed, 1 + 5 * 9973);
});
