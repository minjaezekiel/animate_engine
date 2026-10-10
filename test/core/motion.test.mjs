/**
 * Photo motion: Ken Burns, parallax, wave, puppet.
 *
 *   npm run test:motion
 *
 * The assertions that carry the most weight are the ones about *frame
 * coverage*. Every effect displaces the mesh, and any displacement can
 * uncover the frame edge -- which shows as a bright band marching along
 * the border and is instantly disqualifying. It is also invisible to
 * every other kind of check, so it is tested directly, across amplitudes
 * and across the whole time range rather than at one convenient moment.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadKernels } from '../../src/kernels/index.js';
import { PhotoMotion, EFFECTS } from '../../src/core/motion/PhotoMotion.js';

const K = await loadKernels({ prefer: 'wasm' });

/** An opaque test picture, with a near half and a far half in the depth map. */
function scene(w = 96, h = 64) {
    const source = new Uint8Array(w * h * 4);
    const depth = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const near = x >= w / 2;
            source[i] = near ? 240 : 60;
            source[i + 1] = near ? 160 : 90;
            source[i + 2] = near ? 70 : 150;
            source[i + 3] = 255;
            const d = near ? 235 : 25;
            depth[i] = depth[i + 1] = depth[i + 2] = d;
            depth[i + 3] = 255;
        }
    }
    return { source: { data: source, width: w, height: h },
             depth: { data: depth, width: w, height: h } };
}

const make = (effects, extra = {}) => {
    const s = scene();
    return new PhotoMotion(K, {
        width: 96, height: 64, duration: 2,
        source: s.source, depth: s.depth, effects, ...extra,
    });
};

/** Pixels with no coverage in the frame at `t`. */
function uncovered(photo, t) {
    const a = photo.renderAt(t).array;
    let n = 0;
    for (let i = 3; i < a.length; i += 4) if (a[i] < 0.5) n++;
    return n;
}

test('the effect list is what the effects actually implement', () => {
    // Guards against adding an effect and forgetting to publish it, which
    // leaves it undiscoverable to anything enumerating the API.
    assert.deepEqual([...EFFECTS].sort(), ['kenBurns', 'parallax', 'puppet', 'wave']);
});

test('kenBurns scales about the frame centre, exactly', () => {
    // Hand-computable: at zoom 2 about the centre of a 96x64 frame, the
    // corner (0,0) must land at (-96, -64).
    const photo = make([{ type: 'kenBurns', from: { zoom: 1 }, to: { zoom: 2 } }],
        { duration: 1, overscan: 1 });
    try {
        photo.solveAt(0);
        assert.deepEqual(Array.from(photo.verts.array.slice(0, 2)), [0, 0]);
        // Centre is (48, 32), so (0,0) at 2x lands at 48 - 48*2 = -48.
        photo.solveAt(1);
        assert.deepEqual(Array.from(photo.verts.array.slice(0, 2)), [-48, -32]);
    } finally { photo.dispose(); }
});

test('kenBurns pan is a fraction of the frame, not pixels', () => {
    // So the same film renders correctly at 720p and 4K.
    const photo = make([{ type: 'kenBurns', to: { x: 0.25 } }], { duration: 1, overscan: 1 });
    try {
        photo.solveAt(1);
        assert.ok(Math.abs(photo.verts.array[0] - 24) < 1e-4,
            `expected 0.25 * 96 = 24, got ${photo.verts.array[0]}`);
    } finally { photo.dispose(); }
});

test('kenBurns eases by default, which is why a slow push does not jolt', () => {
    const eased = make([{ type: 'kenBurns', to: { x: 1 } }], { duration: 1, overscan: 1 });
    const linear = make([{ type: 'kenBurns', to: { x: 1 }, ease: 'linear' }],
        { duration: 1, overscan: 1 });
    try {
        // Smoothstep(0.25) = 0.15625 against a linear 0.25.
        eased.solveAt(0.25);
        linear.solveAt(0.25);
        assert.ok(eased.verts.array[0] < linear.verts.array[0] - 1,
            'the eased curve should lag the linear one early on');
        eased.solveAt(1); linear.solveAt(1);
        assert.ok(Math.abs(eased.verts.array[0] - linear.verts.array[0]) < 1e-4,
            'both must arrive at the same place');
    } finally { eased.dispose(); linear.dispose(); }
});

test('parallax moves near and far in opposite directions', () => {
    // The property that distinguishes parallax from a pan. If everything
    // moved the same way it would just be a camera move.
    const photo = make([{ type: 'parallax', amplitude: 0.1, orbit: [1, 0], speed: 1 }]);
    try {
        const n = photo.div + 1, mid = Math.floor(n / 2);
        const nearIdx = mid * n + (n - 2);          // right half: near
        const farIdx = mid * n + 1;                 // left half: far
        const base = photo.baseVerts;
        photo.solveAt(0.5);                         // quarter orbit: ox at maximum
        const near = photo.verts.array[nearIdx * 2] - base[nearIdx * 2];
        const far = photo.verts.array[farIdx * 2] - base[farIdx * 2];
        assert.ok(Math.abs(near) > 1, `near barely moved: ${near}`);
        assert.ok(Math.abs(far) > 1, `far barely moved: ${far}`);
        assert.ok(Math.sign(near) !== Math.sign(far),
            `near ${near.toFixed(2)} and far ${far.toFixed(2)} moved the same way; `
            + 'that is a pan, not parallax');
    } finally { photo.dispose(); }
});

test('parallax does nothing without a depth map', () => {
    // Without one, every vertex reads depth 0, so `depth - focus` is the
    // same constant everywhere and the effect degenerates into a uniform
    // pan -- measured at nearly 8 pixels of unasked-for drift. An effect
    // named "parallax" doing that silently is worse than doing nothing,
    // so it is skipped and `photo_create` reports it.
    const s = scene();
    const photo = new PhotoMotion(K, {
        width: 96, height: 64, duration: 2, source: s.source,
        effects: [{ type: 'parallax', amplitude: 0.2, orbit: [1, 1] }],
    });
    try {
        photo.solveAt(0.7);
        const moved = Array.from(photo.verts.array)
            .some((v, i) => Math.abs(v - photo.baseVerts[i]) > 1e-3);
        assert.equal(moved, false, 'parallax moved something with no depth map');
    } finally { photo.dispose(); }
});

test('the depth map is blurred before it displaces anything', () => {
    // A hard depth edge pins the silhouette: vertices inside the subject
    // move one way and vertices a cell outside move the other, so the
    // subject stretches in place instead of sliding. Blurring spreads the
    // discontinuity over several cells.
    const s = scene();
    const spec = {
        width: 96, height: 64, duration: 2, source: s.source, depth: s.depth, grid: 24,
        effects: [{ type: 'parallax', amplitude: 0.1 }],
    };
    const sharp = new PhotoMotion(K, { ...spec, depthBlur: 0 });
    const soft = new PhotoMotion(K, { ...spec, depthBlur: 0.06 });
    try {
        // Depth sampled across the boundary should go from a step to a ramp.
        const n = sharp.div + 1, row = Math.floor(n / 2) * n;
        const steps = (photo) => {
            let biggest = 0;
            for (let c = 1; c < n; c++) {
                biggest = Math.max(biggest,
                    Math.abs(photo.depths[row + c] - photo.depths[row + c - 1]));
            }
            return biggest;
        };
        // Bilinear sampling already softens a step by one texel, so an
        // unblurred hard edge reads as ~0.41 per cell rather than the
        // full 0.82 of the underlying map.
        assert.ok(steps(sharp) > 0.3,
            `the unblurred map should have a hard step, got ${steps(sharp).toFixed(3)}`);
        assert.ok(steps(soft) < steps(sharp) * 0.6,
            `blurring did not soften the depth edge: ${steps(soft).toFixed(3)} `
            + `against ${steps(sharp).toFixed(3)}`);
    } finally { sharp.dispose(); soft.dispose(); }
});

test('depth is sampled bilinearly, not quantised to texels', () => {
    // A depth map is a smooth field. Nearest sampling quantises it into
    // terraces, which show as visible steps marching across the picture
    // as the camera moves -- the opposite call from the grain texture,
    // which wants nearest precisely because it is high-frequency.
    //
    // A linear ramp is the test: sampled bilinearly the per-vertex depths
    // increase on nearly every step; sampled nearest they repeat wherever
    // two vertices fall in one texel.
    const w = 8, h = 4;                       // deliberately coarser than the mesh
    const source = new Uint8Array(w * h * 4).fill(255);
    const depth = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const v = Math.round((x / (w - 1)) * 255);
            depth[i] = depth[i + 1] = depth[i + 2] = v;
            depth[i + 3] = 255;
        }
    }
    const photo = new PhotoMotion(K, {
        width: 64, height: 32, duration: 1, grid: 24, depthBlur: 0,
        source: { data: source, width: w, height: h },
        depth: { data: depth, width: w, height: h },
        effects: [],
    });
    try {
        const n = photo.div + 1, row = Math.floor(n / 2) * n;
        let distinct = new Set();
        for (let c = 0; c < n; c++) distinct.add(photo.depths[row + c].toFixed(5));
        // 25 vertices across 8 texels: nearest can yield at most 8 values.
        assert.ok(distinct.size > 12,
            `only ${distinct.size} distinct depths across ${n} vertices -- `
            + 'the field looks quantised to texels');
    } finally { photo.dispose(); }
});

test('no effect at any amplitude uncovers the frame edge', () => {
    // Overscan. The bug this pins: `overscan = 1 + margin` puts only
    // `margin / 2` outside each edge while the displacement is per-side,
    // which left exactly one uncovered row -- easy to dismiss as
    // antialiasing.
    const cases = [
        [{ type: 'parallax', amplitude: 0.04, orbit: [1, 1] }],
        [{ type: 'parallax', amplitude: 0.2, orbit: [1, 1] }],
        [{ type: 'parallax', amplitude: 0.35, orbit: [1, 1] }],
        [{ type: 'kenBurns', from: { zoom: 1 }, to: { zoom: 0.6 } }],
        [{ type: 'kenBurns', to: { x: 0.2, y: 0.15 } }],
        [{ type: 'wave', amplitude: 0.05, range: [0, 1] }],
        [{ type: 'parallax', amplitude: 0.15, orbit: [1, 1] },
            { type: 'kenBurns', to: { zoom: 0.8 } }],
    ];
    for (const effects of cases) {
        const photo = make(effects);
        try {
            for (let k = 0; k <= 16; k++) {
                const t = (k / 16) * photo.duration;
                const gaps = uncovered(photo, t);
                assert.equal(gaps, 0,
                    `${effects.map((e) => e.type).join('+')} left ${gaps} uncovered `
                    + `pixels at t=${t.toFixed(2)} (overscan ${photo.overscan.toFixed(3)})`);
            }
        } finally { photo.dispose(); }
    }
});

test('an explicit overscan is respected', () => {
    const photo = make([{ type: 'parallax', amplitude: 0.1 }], { overscan: 1.5 });
    try {
        assert.equal(photo.overscan, 1.5);
        // The mesh corner sits a quarter of the frame outside each edge.
        assert.ok(Math.abs(photo.baseVerts[0] + 24) < 1e-4,
            `corner at ${photo.baseVerts[0]}, expected -24`);
    } finally { photo.dispose(); }
});

test('wave is confined to its range, and fades in at the boundary', () => {
    // Without the fade the wave starts at a hard line, which reads as a
    // seam across the picture.
    const photo = make([{ type: 'wave', amplitude: 0.1, range: [0.6, 1] }], { overscan: 1 });
    try {
        photo.solveAt(0.3);
        const n = photo.div + 1;
        const rowOffset = (r) => {
            let worst = 0;
            for (let c = 0; c < n; c++) {
                const i = r * n + c;
                worst = Math.max(worst,
                    Math.abs(photo.verts.array[i * 2 + 1] - photo.baseVerts[i * 2 + 1]));
            }
            return worst;
        };
        const above = Math.floor(n * 0.3);           // v = 0.3, outside the range
        const inside = Math.floor(n * 0.85);         // well inside
        assert.ok(rowOffset(above) < 1e-6, 'the wave escaped its range');
        assert.ok(rowOffset(inside) > 0.5, 'the wave did not move anything inside its range');
    } finally { photo.dispose(); }
});

test('puppet pins pull nearby points and leave distant ones alone', () => {
    const photo = make([{
        type: 'puppet',
        pins: [{ at: [0.5, 0.5], to: [0.7, 0.5], radius: 0.2 }],
    }], { overscan: 1, duration: 1 });
    try {
        photo.solveAt(1);
        const n = photo.div + 1;
        const at = (u, v) => {
            const c = Math.round(u * (n - 1)), r = Math.round(v * (n - 1));
            const i = r * n + c;
            return photo.verts.array[i * 2] - photo.baseVerts[i * 2];
        };
        assert.ok(at(0.5, 0.5) > 10, `the pin itself barely moved: ${at(0.5, 0.5)}`);
        assert.ok(Math.abs(at(0.05, 0.5)) < 1e-6, 'a point outside the radius moved');
        // Falloff: closer means more.
        assert.ok(at(0.55, 0.5) > at(0.62, 0.5), 'the falloff is not monotonic');
    } finally { photo.dispose(); }
});

test('effects compose in order, and the order matters', () => {
    const a = make([{ type: 'kenBurns', to: { zoom: 2 } }, { type: 'kenBurns', to: { x: 0.2 } }],
        { duration: 1, overscan: 1 });
    const b = make([{ type: 'kenBurns', to: { x: 0.2 } }, { type: 'kenBurns', to: { zoom: 2 } }],
        { duration: 1, overscan: 1 });
    try {
        a.solveAt(1); b.solveAt(1);
        assert.notDeepEqual(Array.from(a.verts.array.slice(0, 2)),
            Array.from(b.verts.array.slice(0, 2)),
            'a pan then a zoom must differ from a zoom then a pan');
    } finally { a.dispose(); b.dispose(); }
});

test('an unknown effect is ignored rather than thrown on', () => {
    // A film should not fail to render because one effect name was
    // mistyped; the rest of the shot is still worth seeing.
    const photo = make([{ type: 'teleport' }, { type: 'kenBurns', to: { zoom: 1.2 } }],
        { duration: 1 });
    try {
        photo.solveAt(1);
        assert.ok(Number.isFinite(photo.verts.array[0]));
    } finally { photo.dispose(); }
});

test('a frame is a pure function of t', () => {
    const photo = make([
        { type: 'parallax', amplitude: 0.08 },
        { type: 'wave', amplitude: 0.01 },
    ]);
    try {
        const a = Float32Array.from(photo.renderAt(0.73).array);
        photo.renderAt(1.9);                              // disturb any hidden state
        const b = Float32Array.from(photo.renderAt(0.73).array);
        assert.deepEqual(Array.from(a), Array.from(b));
    } finally { photo.dispose(); }
});

test('time is clamped, so a held photo keeps its final framing', () => {
    // Wrapping instead would snap back to the start mid-shot.
    const photo = make([{ type: 'kenBurns', to: { zoom: 1.4 } }], { duration: 1 });
    try {
        photo.solveAt(1);
        const atEnd = Array.from(photo.verts.array.slice(0, 2));
        photo.solveAt(5);
        assert.deepEqual(Array.from(photo.verts.array.slice(0, 2)), atEnd);
        photo.solveAt(-3);
        photo.solveAt(0);
        const atStart = Array.from(photo.verts.array.slice(0, 2));
        photo.solveAt(-3);
        assert.deepEqual(Array.from(photo.verts.array.slice(0, 2)), atStart);
    } finally { photo.dispose(); }
});
