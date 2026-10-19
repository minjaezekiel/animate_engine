/**
 * Cloth and fluid.
 *
 * Both are pure functions of their own state, and both are stepped once per
 * frame by `SceneAdapter`'s `step`, so both have to be deterministic for the
 * renderer's contract -- frame N is a pure function of N -- to survive. That
 * is what most of this file checks.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCloth, stepCloth, resetCloth, maxStretch } from '../../src/core/sim/cloth.js';
import {
    makeFluid, stepFluid, resetFluid, addSource, fluidMass, fluidToRGBA,
} from '../../src/core/sim/fluid.js';

const settle = (cloth, frames = 48, opts = {}) => {
    for (let f = 0; f < frames; f++) stepCloth(cloth, 1 / 24, opts);
    return cloth;
};

/** The free edge's middle particle -- the one that swings. */
const hem = (c, axis = 0) =>
    c.pos[((c.rows - 1) * c.cols + (c.cols >> 1)) * 3 + axis];

// ------------------------------------------------------------------ cloth

test('a sheet is a grid with structural, shear and bend links', () => {
    const c = makeCloth({ cols: 4, rows: 3 });
    assert.equal(c.count, 12);
    assert.equal(c.indices.length, (4 - 1) * (3 - 1) * 6);
    // Every link has a positive rest length, or the solver divides by zero.
    for (let l = 2; l < c.links.length; l += 3) assert.ok(c.links[l] > 0);
    // Bend links reach two cells, which a net has none of.
    assert.ok(c.links.length / 3 > (4 - 1) * 3 + (3 - 1) * 4, 'more than structural alone');
});

test('the pinned edge never moves and the sheet never stretches', () => {
    const c = makeCloth({ cols: 10, rows: 10, width: 1, height: 1 });
    const pins = [...c.pinned.keys()].filter((i) => c.pinned[i]);
    assert.equal(pins.length, 10, 'the top row is pinned by default');
    const before = pins.map((i) => [c.pos[i * 3], c.pos[i * 3 + 1], c.pos[i * 3 + 2]]);
    settle(c);
    for (const [k, i] of pins.entries()) {
        for (let a = 0; a < 3; a++) assert.equal(c.pos[i * 3 + a], before[k][a]);
    }
    // PBD's whole selling point: the links stay at their rest length however
    // hard gravity pulls. A mass-spring system tuned for one timestep would
    // be metres long here.
    assert.ok(maxStretch(c) < 1.02, `stretched to ${maxStretch(c).toFixed(3)}`);
});

test('gravity pulls it down and nothing comes back NaN', () => {
    const c = makeCloth({ cols: 8, rows: 8, width: 0.5, height: 0.5 });
    const bottomBefore = hem(c, 1);
    settle(c, 24);
    assert.ok(hem(c, 1) <= bottomBefore + 1e-9);
    for (const v of c.pos) assert.ok(Number.isFinite(v));
});

test('wind moves it sideways, and a stiffer solve stretches less', () => {
    // Wind along +z, because the sheet's rest plane is xy and its pinned
    // edge runs along x: wind IN the plane of the cloth is held by the pins
    // and swings nothing, which is also true of a real flag.
    const calm = settle(makeCloth({ cols: 8, rows: 8 }), 48);
    const windy = settle(makeCloth({ cols: 8, rows: 8 }), 48, { wind: [0, 0, 8] });
    assert.ok(hem(windy, 2) > hem(calm, 2) + 0.05,
              `windy hem z ${hem(windy, 2).toFixed(3)}, calm ${hem(calm, 2).toFixed(3)}`);

    const loose = settle(makeCloth({ cols: 10, rows: 10 }), 8, { iterations: 1 });
    const tight = settle(makeCloth({ cols: 10, rows: 10 }), 8, { iterations: 8 });
    assert.ok(maxStretch(tight) <= maxStretch(loose));
});

test('a collider pushes every free particle out of it', () => {
    const at = [0, -0.3, 0];
    const r = 0.25;
    const c = makeCloth({ cols: 8, rows: 8, width: 0.6, height: 0.6 });
    settle(c, 36, { colliders: [{ at, r }] });
    for (let i = 0; i < c.count; i++) {
        if (c.pinned[i]) continue;
        const d = Math.hypot(c.pos[i * 3] - at[0], c.pos[i * 3 + 1] - at[1], c.pos[i * 3 + 2] - at[2]);
        assert.ok(d > r - 1e-4, `particle ${i} is ${d.toFixed(4)} from a ${r} sphere`);
    }
});

test('a floor stops it falling through', () => {
    const c = makeCloth({ cols: 6, rows: 10, height: 1.2 });
    settle(c, 36, { floor: -0.5 });
    for (let i = 0; i < c.count; i++) {
        if (!c.pinned[i]) assert.ok(c.pos[i * 3 + 1] >= -0.5 - 1e-4);
    }
});

test('the same frames give the same cloth, and reset really resets', () => {
    const a = settle(makeCloth({ cols: 9, rows: 9 }), 30, { wind: [2, 0, 1] });
    const b = settle(makeCloth({ cols: 9, rows: 9 }), 30, { wind: [2, 0, 1] });
    assert.deepEqual([...a.pos], [...b.pos]);
    resetCloth(a);
    assert.deepEqual([...a.pos], [...a.bind]);
    assert.deepEqual([...a.prev], [...a.bind]);
});

test('the substep is fixed, so the frame rate does not change the drape', () => {
    // One frame of 1/24 is four substeps of 1/120; four frames of 1/96 is the
    // same four. If the solver stepped by `dt` the two would differ, and the
    // cloth would be stiffer at a higher frame rate.
    const coarse = makeCloth({ cols: 8, rows: 8 });
    const fine = makeCloth({ cols: 8, rows: 8 });
    for (let f = 0; f < 12; f++) stepCloth(coarse, 1 / 24);
    for (let f = 0; f < 48; f++) stepCloth(fine, 1 / 96);
    for (let i = 0; i < coarse.pos.length; i++) {
        assert.ok(Math.abs(coarse.pos[i] - fine.pos[i]) < 1e-5,
                  `index ${i}: ${coarse.pos[i]} vs ${fine.pos[i]}`);
    }
});

test('stepCloth reports how many substeps it took', () => {
    const c = makeCloth({ cols: 4, rows: 4 });
    assert.equal(stepCloth(c, 1 / 120), 1);
    assert.equal(stepCloth(c, 1 / 24), 5);
    assert.equal(stepCloth(c, 0), 0, 'a zero step does nothing');
    // Clamped, so one enormous dt cannot stall a render.
    assert.equal(stepCloth(c, 10, { maxSubsteps: 8 }), 8);
});

// ------------------------------------------------------------------ fluid

const plume = (f, frames = 60, opts = {}) => {
    for (let k = 0; k < frames; k++) {
        if (k < 20) addSource(f, { x: 0.5, y: 0.12, amount: 3, vy: 1.2, radius: 0.07 });
        stepFluid(f, 1 / 24, opts);
    }
    return f;
};

const centreOfMass = (f) => {
    let sy = 0, s = 0;
    for (let j = 1; j <= f.n; j++) {
        for (let i = 1; i <= f.n; i++) {
            const d = f.d[i + (f.n + 2) * j];
            sy += d * j; s += d;
        }
    }
    return s > 0 ? sy / s : 0;
};

test('a grid is allocated with its boundary ring', () => {
    const f = makeFluid({ n: 16 });
    assert.equal(f.size, 18 * 18, 'n+2 squared: the border carries the wall condition');
    assert.equal(f.d.length, f.size);
    assert.equal(fluidMass(f), 0);
});

test('buoyancy makes a plume rise', () => {
    const f = plume(makeFluid({ n: 32 }));
    assert.ok(fluidMass(f) > 0, 'there is smoke');
    // The source is at 12% of the grid; the smoke has to be well above it.
    assert.ok(centreOfMass(f) > 0.12 * 32 + 5,
              `centre of mass at ${centreOfMass(f).toFixed(1)}, source at ${(0.12 * 32).toFixed(1)}`);
});

test('no buoyancy, no rise -- so the lift is the buoyancy term, not the solver', () => {
    const f = plume(makeFluid({ n: 32 }), 60, { buoyancy: 0 });
    const g = plume(makeFluid({ n: 32 }), 60, { buoyancy: 4 });
    assert.ok(centreOfMass(g) > centreOfMass(f) + 2);
});

test('dissipation is per second, so it is frame-rate independent', () => {
    const slow = makeFluid({ n: 16 });
    const fast = makeFluid({ n: 16 });
    addSource(slow, { x: 0.5, y: 0.5, amount: 4, radius: 0.2 });
    addSource(fast, { x: 0.5, y: 0.5, amount: 4, radius: 0.2 });
    for (let k = 0; k < 24; k++) stepFluid(slow, 1 / 24, { buoyancy: 0, dissipation: 1 });
    for (let k = 0; k < 96; k++) stepFluid(fast, 1 / 96, { buoyancy: 0, dissipation: 1 });
    const ratio = fluidMass(fast) / fluidMass(slow);
    assert.ok(ratio > 0.9 && ratio < 1.1, `one second of decay differed by ${ratio.toFixed(3)}`);
});

test('density stays inside the domain and never goes non-finite', () => {
    const f = plume(makeFluid({ n: 24 }), 90, { visc: 0.00005, diff: 0.00002 });
    for (const a of [f.d, f.u, f.v]) for (const v of a) assert.ok(Number.isFinite(v));
    // The wall condition: nothing accumulates in the border ring.
    for (let i = 0; i <= f.n + 1; i++) {
        assert.ok(f.d[i] < 1e3);
        assert.ok(Number.isFinite(f.d[i + (f.n + 2) * (f.n + 1)]));
    }
});

test('the same steps give the same field, and reset empties it', () => {
    const a = plume(makeFluid({ n: 24 }));
    const b = plume(makeFluid({ n: 24 }));
    assert.deepEqual([...a.d], [...b.d]);
    assert.deepEqual([...a.u], [...b.u]);
    resetFluid(a);
    assert.equal(fluidMass(a), 0);
    assert.ok([...a.u].every((v) => v === 0));
});

test('the density field paints to premultiplied RGBA, right way up', () => {
    const f = makeFluid({ n: 8 });
    // A blob low in the grid must appear low in the IMAGE, which is the
    // bottom rows of the byte array -- row 0 of an ImageData is the top.
    addSource(f, { x: 0.5, y: 0.1, amount: 3, radius: 0.1 });
    const px = fluidToRGBA(f, null, { color: [255, 255, 255] });
    assert.equal(px.length, 8 * 8 * 4);
    const rowAlpha = (r) => {
        let s = 0;
        for (let i = 0; i < 8; i++) s += px[(r * 8 + i) * 4 + 3];
        return s;
    };
    assert.ok(rowAlpha(7) > rowAlpha(0), 'a low blob paints into the bottom rows');
    // Premultiplied: colour never exceeds alpha, which is what keeps a grey
    // halo off the edge when the card is drawn with depthWrite off.
    for (let q = 0; q < px.length; q += 4) {
        assert.ok(px[q] <= px[q + 3] + 1, `colour ${px[q]} over alpha ${px[q + 3]}`);
    }
    // And it writes into a buffer the caller owns, so the adapter can hand it
    // an ImageData's own array rather than allocating per frame.
    const mine = new Uint8ClampedArray(8 * 8 * 4);
    assert.equal(fluidToRGBA(f, mine), mine);
});
