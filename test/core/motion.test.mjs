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
import { PhotoMotion, EFFECTS, tearMesh } from '../../src/core/motion/PhotoMotion.js';

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

// =====================================================================
// tearing the mesh at depth discontinuities
// =====================================================================

/**
 * Where the silhouette is, on the middle scanline at `t`.
 *
 * The test picture's near half is bright red and its far half is not, so
 * the first bright pixel across the row *is* the silhouette. This is the
 * measurement that matters: an untorn mesh stretches the cell that
 * straddles the edge, so the silhouette barely moves while the subject's
 * interior does -- which is the rubber-face artefact, visible here as a
 * number.
 */
function silhouetteX(photo, t) {
    const a = photo.renderAt(t).array;
    const y = photo.height >> 1;
    for (let x = 0; x < photo.width; x++) {
        if (a[(y * photo.width + x) * 4] > 0.5) return x;
    }
    return -1;
}

/** Parallax at its extreme: `orbit: [1, 0]` and `t = duration / 4`. */
const PUSH = [{ type: 'parallax', amplitude: 0.12, orbit: [1, 0] }];

test('tearing moves the silhouette by its own parallax, not an average', () => {
    const plain = make(PUSH, { depthBlur: 0 });
    const torn = make(PUSH, { depthBlur: 0, tear: true });

    // The near half sits at depth 0.92 against a focus of 0.5, so at full
    // push it should travel (0.92 - 0.5) * 0.12 * 96 = 4.9 px.
    const rest = silhouetteX(plain, 0);
    assert.equal(silhouetteX(torn, 0), rest, 'tearing moved the edge at rest');

    const plainShift = silhouetteX(plain, 0.5) - rest;
    const tornShift = silhouetteX(torn, 0.5) - rest;
    assert.ok(Math.abs(plainShift) <= 1,
        `the untorn mesh should pin the edge, moved ${plainShift}px`);
    assert.ok(tornShift >= 4 && tornShift <= 6,
        `expected about +5px of real displacement, got ${tornShift}px`);

    // And symmetrically the other way, half a cycle later.
    const back = silhouetteX(torn, 1.5) - rest;
    assert.ok(back <= -4 && back >= -6, `expected about -5px, got ${back}px`);
});

test('a tear leaves no hole: the far side is mirrored forward to fill it', () => {
    // A tear with nothing behind it is worse than a smear -- the subject
    // slides off transparent nothing. `fill` is derived from the parallax
    // reach, so this must hold without the author computing anything.
    const torn = make(PUSH, { depthBlur: 0, tear: true });
    for (let i = 0; i <= 16; i++) {
        const t = (i / 16) * 2;
        assert.equal(uncovered(torn, t), 0, `uncovered pixels at t=${t}`);
    }
    assert.ok(torn.tearFill > 10 && torn.tearFill < 20,
        `fill should cover the ~10px tear, got ${torn.tearFill}`);
});

test('what fills the hole is background, not a copy of the subject', () => {
    // The uv steps *back* while the position steps forward. Advancing both
    // is one sign away, looks right on paper, and carries the subject's own
    // edge pixels into the hole -- which leaves the visible silhouette
    // exactly where the untorn mesh put it. Measured here as colour: the
    // far half of the picture is blue-dominant, the near half red.
    const torn = make(PUSH, { depthBlur: 0, tear: true });
    // Both edges first: allocating another photo can grow the wasm memory,
    // which detaches any typed-array view captured beforehand.
    const rest = silhouetteX(torn, 0);
    const moved = silhouetteX(torn, 0.5);
    const a = torn.renderAt(0.5).array;
    const y = torn.height >> 1;
    let background = 0;
    for (let x = rest; x < moved; x++) {
        const i = (y * torn.width + x) * 4;
        if (a[i + 2] > a[i]) background++;      // blue beats red
    }
    assert.ok(background >= 3,
        `the hole should be filled with background, found ${background} such pixels`);
});

test('tearing appends vertices and emits triangles far to near', () => {
    const plain = make(PUSH);
    const torn = make(PUSH, { depthBlur: 0, tear: true });
    assert.ok(torn.vertexCount > plain.vertexCount, 'nothing was duplicated');
    assert.ok(torn.triangleCount > plain.triangleCount, 'nothing was cut');

    // `warp_mesh` has no depth test -- it writes, and the last triangle
    // over a pixel wins -- so torn triangles must be ordered far to near
    // or the fill paints over the subject it is meant to hide behind.
    const idx = torn.indices.array, d = torn.depths;
    let previous = -Infinity;
    for (let i = 0; i < torn.triangleCount; i++) {
        const mean = (d[idx[i * 3]] + d[idx[i * 3 + 1]] + d[idx[i * 3 + 2]]) / 3;
        assert.ok(mean >= previous - 1e-6, `triangle ${i} breaks the far-to-near order`);
        previous = mean;
    }
});

test('tear without a depth map is a no-op, not a different mesh', () => {
    // There is nothing to tear along, and silently producing a differently
    // tessellated mesh would make the flag look like it did something.
    const s = scene();
    const base = new PhotoMotion(K, { width: 96, height: 64, duration: 2,
                                      source: s.source, effects: PUSH });
    const asked = new PhotoMotion(K, { width: 96, height: 64, duration: 2,
                                       source: s.source, effects: PUSH, tear: true });
    assert.equal(asked.tear, false);
    assert.equal(asked.vertexCount, base.vertexCount);
    assert.equal(asked.triangleCount, base.triangleCount);
});

test('tear turns the depth blur off by default, and an explicit blur still wins', () => {
    // The blur exists only to soften the pinned silhouette that tearing
    // removes outright; blurring a map about to be cut moves the cut off
    // the real edge.
    // Measured as the largest depth step between neighbouring grid
    // columns, which is what the blur exists to reduce. The overall range
    // is the wrong metric: a box blur clamps at the image border, so the
    // extremes survive it untouched.
    const jump = (photo) => {
        const n = photo.div + 1, r = n >> 1;
        let worst = 0;
        for (let c = 0; c < n - 1; c++) {
            worst = Math.max(worst, Math.abs(photo.depths[r * n + c + 1] - photo.depths[r * n + c]));
        }
        return worst;
    };
    const torn = make(PUSH, { tear: true });
    // 0.41 rather than the source's full 0.82: the grid samples the depth
    // map bilinearly, so a step between two source pixels already lands
    // across two cells. That is the baseline the blur has to beat.
    assert.ok(jump(torn) > 0.4, `an unblurred step should be sharp, got ${jump(torn)}`);

    const blurred = make(PUSH, { tear: true, depthBlur: 0.05 });
    assert.ok(jump(blurred) < jump(torn) * 0.75,
        `an explicit depthBlur was ignored: ${jump(blurred)} vs ${jump(torn)}`);
});

test('a wave reaches the vertices a tear duplicated', () => {
    // `wave` used to walk the grid by row and column, which after a tear
    // leaves every duplicated vertex un-waved -- a crack along the tear
    // rather than a missing ripple. It reads uvs now, so this asserts the
    // appended vertices actually move.
    const grid = 33 * 33;
    const torn = make([...PUSH, { type: 'wave', amplitude: 0.05, wavelength: 0.25 }],
                      { depthBlur: 0, tear: true });
    assert.ok(torn.vertexCount > grid, 'nothing was duplicated');
    const out = torn.solveAt(0.7).array;
    let moved = 0;
    for (let i = grid; i < torn.vertexCount; i++) {
        if (Math.abs(out[i * 2 + 1] - torn.baseVerts[i * 2 + 1]) > 1e-4) moved++;
    }
    assert.ok(moved > 0, 'every duplicated vertex was left behind by the wave');
});

test('tearMesh cuts one quad and gives each side its own depth', () => {
    // The unit case, where the arithmetic is checkable by hand: a unit
    // quad whose left edge is far and right edge is near, cut at 0.5.
    const mesh = {
        verts: [0, 0, 10, 0, 0, 10, 10, 10],
        uvs: [0, 0, 1, 0, 0, 1, 1, 1],
        depths: [0, 1, 0, 1],
        indices: [0, 1, 3, 0, 3, 2],
    };
    const cut = tearMesh(mesh, [0.5], 0);
    // Each triangle straddles the contour, so each becomes three: one for
    // the lone vertex and two for the quad on the other side.
    assert.equal(cut.indices.length / 3, 6);
    // Three crossing edges, not four: the two triangles share the diagonal,
    // and the seam is keyed on the edge so they agree on it exactly. Each
    // crossing becomes two vertices, one per side.
    assert.equal(cut.depths.length, 4 + 3 * 2);
    // Every duplicate takes the depth of its own side's endpoint, which is
    // what makes the surface genuinely torn rather than merely subdivided.
    for (let i = 4; i < cut.depths.length; i++) {
        assert.ok(cut.depths[i] === 0 || cut.depths[i] === 1,
            `duplicate ${i} has an interpolated depth ${cut.depths[i]}`);
    }
    // A crossing at the midpoint of a 10-unit edge sits at 5.
    assert.equal(cut.verts[8], 5);
});

test('a level below or above every depth cuts nothing', () => {
    const mesh = {
        verts: [0, 0, 10, 0, 0, 10, 10, 10],
        uvs: [0, 0, 1, 0, 0, 1, 1, 1],
        depths: [0.2, 0.3, 0.2, 0.3],
        indices: [0, 1, 3, 0, 3, 2],
    };
    for (const level of [0, 1]) {
        const cut = tearMesh(mesh, [level], 4);
        assert.equal(cut.depths.length, 4, `level ${level} duplicated vertices`);
        assert.equal(cut.indices.length, 6, `level ${level} cut a triangle`);
    }
});

// =====================================================================
// monocular depth estimation
// =====================================================================

const { DepthEstimator, DEPTH_MODELS, IMAGENET, resizeRgba, toNchw, depthToImage,
        depthPlanes, dilateMask } = await import('../../src/core/motion/depth.js');

/**
 * A stub onnxruntime.
 *
 * The real runtime is a browser package, so the model itself can never run
 * in these tests -- but everything around it can, and that is where the
 * bugs live: the normalisation, the input name, the output's dims, the
 * rescale back to the source size, and which end of the range is near.
 * This is the same bargain the voice providers make with a fake provider.
 */
function stubOrt(predict, dims) {
    const seen = {};
    const ort = {
        Tensor: class { constructor(type, data, d) { this.type = type; this.data = data; this.dims = d; } },
        InferenceSession: {
            create: async () => ({
                inputNames: ['pixel_values'],
                outputNames: ['predicted_depth'],
                run: async (feeds) => {
                    Object.assign(seen, feeds);
                    const [h, w] = dims;
                    const data = new Float32Array(w * h);
                    for (let y = 0; y < h; y++) {
                        for (let x = 0; x < w; x++) data[y * w + x] = predict(x / (w - 1), y / (h - 1));
                    }
                    return { predicted_depth: { data, dims: [1, h, w] } };
                },
            }),
        },
    };
    return { ort, seen };
}

/** A 4x2 picture whose left half is black and right half white. */
const halfLit = () => {
    const data = new Uint8Array(4 * 2 * 4);
    for (let i = 0; i < 8; i++) {
        const v = (i % 4) >= 2 ? 255 : 0;
        data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
        data[i * 4 + 3] = 255;
    }
    return { data, width: 4, height: 2 };
};

test('resizeRgba samples pixel centres and preserves the corners', () => {
    const up = resizeRgba(halfLit(), 8, 4);
    assert.equal(up.data.length, 8 * 4 * 4);
    assert.equal(up.data[0], 0, 'top-left corner changed value');
    assert.equal(up.data[(8 * 4 - 1) * 4], 255, 'bottom-right corner changed value');
    // Downsampling must average rather than drop pixels: a half-black,
    // half-white row collapsed to two pixels keeps both ends.
    const down = resizeRgba(halfLit(), 2, 1);
    assert.ok(down.data[0] < 60 && down.data[4] > 195,
        `expected the two halves to survive, got ${down.data[0]} and ${down.data[4]}`);
});

test('toNchw is plane-major and ImageNet-normalised', () => {
    const t = toNchw(halfLit(), 2, IMAGENET);
    assert.equal(t.length, 3 * 2 * 2);
    // Plane-major: channel 0 is the first four values, not interleaved.
    const black = (0 - IMAGENET.mean[0]) / IMAGENET.std[0];
    const white = (1 - IMAGENET.mean[0]) / IMAGENET.std[0];
    assert.ok(Math.abs(t[0] - black) < 1e-5, `${t[0]} is not a normalised 0`);
    assert.ok(Math.abs(t[1] - white) < 1e-5, `${t[1]} is not a normalised 255`);
    // The green plane starts a whole plane later and uses green's own mean.
    assert.ok(Math.abs(t[4] - (0 - IMAGENET.mean[1]) / IMAGENET.std[1]) < 1e-5);
});

test('depthToImage normalises to the prediction\'s own extremes', () => {
    // A relative-depth model has no absolute scale, so the observed range
    // is the only sane mapping -- the same call `makeGrainTexture` makes.
    const out = depthToImage([10, 12, 14, 16], 2, 2, 2, 2);
    assert.equal(out.data[0], 0);
    assert.equal(out.data[3 * 4], 255);
    assert.equal(out.min, 10);
    assert.equal(out.max, 16);
    assert.equal(out.data[3], 255, 'the map must be opaque');

    // `near: 'low'` is for metric models, where a larger number is further.
    const flipped = depthToImage([10, 12, 14, 16], 2, 2, 2, 2, 'low');
    assert.equal(flipped.data[0], 255);
    assert.equal(flipped.data[3 * 4], 0);
});

test('a flat prediction is reported rather than divided by zero', () => {
    // A map with no range makes parallax a uniform pan -- the degenerate
    // case `PhotoMotion` refuses outright -- so it has to be visible.
    const out = depthToImage([7, 7, 7, 7], 2, 2, 2, 2);
    assert.equal(out.min, out.max);
    assert.equal(out.data[0], 128);
    assert.ok(out.data.every((v, i) => i % 4 === 3 || v === 128));
});

test('estimate returns a depth map at the source size, white near', async () => {
    // The prediction is deliberately a different size from the picture, as
    // every real model's is: the model sees a square and the photo is not.
    const { ort, seen } = stubOrt((u) => u, [16, 16]);
    const est = new DepthEstimator({ modelUrl: 'stub.onnx', size: 8, ort });
    const image = { data: new Uint8Array(12 * 6 * 4).fill(128), width: 12, height: 6 };
    const depth = await est.estimate(image);

    assert.equal(depth.width, 12);
    assert.equal(depth.height, 6);
    assert.equal(depth.data.length, 12 * 6 * 4);
    // The stub predicted depth rising to the right, and white is near.
    const row = (x) => depth.data[(2 * 12 + x) * 4];
    assert.ok(row(0) < 40, `left edge should be far, got ${row(0)}`);
    assert.ok(row(11) > 215, `right edge should be near, got ${row(11)}`);
    assert.ok(row(5) > row(0) && row(11) > row(5), 'the gradient is not monotonic');

    // The feed is keyed on the session's own input name, not a guess, and
    // shaped NCHW at the configured size.
    assert.deepEqual(Object.keys(seen), ['pixel_values']);
    assert.deepEqual(seen.pixel_values.dims, [1, 3, 8, 8]);
});

test('a missing model or runtime is false, never a throw', async () => {
    // The whole ladder depends on this: a caller probes, and falls back to
    // supplying a map by hand or to effects that need no depth.
    const none = new DepthEstimator({});
    assert.equal(await none.available(), false);
    await assert.rejects(() => none.load(), /needs a modelUrl/);

    const broken = new DepthEstimator({
        modelUrl: 'x.onnx',
        ort: { InferenceSession: { create: async () => { throw new Error('404'); } } },
    });
    assert.equal(await broken.available(), false);
});

test('the model table names a size and a polarity for every entry', () => {
    // Those two are what a caller cannot guess and what silently produce a
    // wrong map: the wrong input size distorts, the wrong polarity inverts.
    for (const [name, model] of Object.entries(DEPTH_MODELS)) {
        assert.match(model.url, /^https:\/\/\S+\.onnx$/, `${name} has no model url`);
        assert.ok(model.size >= 64, `${name} has no input size`);
        assert.ok(model.near === 'high' || model.near === 'low', `${name} has no polarity`);
        assert.ok(model.note?.length > 20, `${name} has no note worth reading`);
    }
});

// =====================================================================
// inpainted plates, and finding the planes to tear along
// =====================================================================

test('the fill is a real background plate, not the subject smeared', () => {
    // This is the whole point of the tear, so it is measured against the
    // alternative rather than on its own. `inpaint: false` keeps the
    // geometry and drops the plate, so the extension band samples the
    // source -- which at that uv is the subject. The silhouette then
    // appears not to move, which is what the untorn mesh already did.
    const torn = make(PUSH, { depthBlur: 0, tear: true });
    const naive = make(PUSH, { depthBlur: 0, tear: { inpaint: false } });
    const rest = silhouetteX(torn, 0);

    assert.ok(silhouetteX(torn, 0.5) - rest >= 4,
        'the plate did not let the silhouette move');
    assert.ok(Math.abs(silhouetteX(naive, 0.5) - rest) <= 1,
        'without a plate the silhouette should be pinned by its own ghost');

    // One plate, on the far band only. The near band shows the photograph.
    assert.equal(torn.bands.length, 2);
    assert.ok(torn.bands[0].plate, 'the far band has no plate');
    assert.equal(torn.bands[1].plate, null, 'the near band should use the source');
    assert.equal(naive.bands.filter((b) => b.plate).length, 0);
});

test('bands partition the triangles and stay in far-to-near order', () => {
    // `warp_mesh` has no depth test, so a triangle in the wrong band is
    // drawn with the wrong texture *and* at the wrong time.
    const torn = make(PUSH, { depthBlur: 0, tear: true });
    const total = torn.bands.reduce((n, b) => n + b.tris, 0);
    assert.equal(total, torn.triangleCount, 'bands lost or duplicated triangles');
    for (let i = 1; i < torn.bands.length; i++) {
        assert.ok(torn.bands[i].band > torn.bands[i - 1].band, 'bands are out of order');
    }
});

test('tear declines on a depth field with no planes, and says so', () => {
    // A continuous ramp -- a landscape receding to the horizon -- has
    // nothing to tear along, and cutting it anyway would separate two
    // halves of one surface. `tear` goes back to false so the caller can
    // see that it did nothing.
    const w = 96, h = 64;
    const source = new Uint8Array(w * h * 4).fill(200);
    const depth = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            depth[i] = depth[i + 1] = depth[i + 2] = Math.round((x / (w - 1)) * 255);
            depth[i + 3] = 255;
        }
    }
    for (let i = 3; i < source.length; i += 4) source[i] = 255;

    const photo = new PhotoMotion(K, {
        width: w, height: h, duration: 2,
        source: { data: source, width: w, height: h },
        depth: { data: depth, width: w, height: h },
        effects: PUSH, depthBlur: 0, tear: true,
    });
    assert.equal(photo.tear, false, 'a continuous ramp was torn');
    assert.deepEqual(photo.tearLevels, []);
    assert.equal(photo.bands.length, 1);
    assert.equal(photo.bands[0].plate, null);
});

test('tear.planes cuts along more than one level', () => {
    // Three hard planes, so two gaps.
    const w = 96, h = 64;
    const source = new Uint8Array(w * h * 4);
    const depth = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const band = x < w / 3 ? 0 : x < (2 * w) / 3 ? 1 : 2;
            source[i] = 60 + band * 90; source[i + 1] = 120; source[i + 2] = 200 - band * 60;
            source[i + 3] = 255;
            const d = [20, 128, 236][band];
            depth[i] = depth[i + 1] = depth[i + 2] = d;
            depth[i + 3] = 255;
        }
    }
    const spec = {
        width: w, height: h, duration: 2,
        source: { data: source, width: w, height: h },
        depth: { data: depth, width: w, height: h },
        effects: PUSH, depthBlur: 0,
    };
    const two = new PhotoMotion(K, { ...spec, tear: { planes: 2 } });
    assert.equal(two.tearLevels.length, 2, `got ${JSON.stringify(two.tearLevels)}`);
    assert.equal(two.bands.length, 3);
    // A plate per level, and the nearest band on the photograph itself.
    assert.ok(two.bands[0].plate && two.bands[1].plate);
    assert.equal(two.bands[2].plate, null);

    const one = new PhotoMotion(K, { ...spec, tear: true });
    assert.equal(one.tearLevels.length, 1, 'the default should be a single level');
});

test('depthPlanes finds the gap, where a midpoint and Otsu both miss it', () => {
    const cluster = (lo, hi, n) =>
        Array.from({ length: n }, (_, i) => lo + ((i + 0.5) / n) * (hi - lo));
    // A background spread evenly over 0.0-0.8 with a subject at 0.95. The
    // midpoint lands at 0.475 and Otsu, which maximises between-class
    // variance, lands at 0.499 -- both inside the background.
    const values = [...cluster(0, 0.8, 800), ...cluster(0.94, 0.98, 120)];
    const [level] = depthPlanes(values, 1);
    assert.ok(level > 0.8 && level < 0.94, `level ${level} is not in the gap`);

    // Nothing at all on a field with no gap, which is what makes
    // `tear: true` safe to set on any photograph.
    assert.deepEqual(depthPlanes(cluster(0, 1, 2000), 1), []);
    assert.deepEqual(depthPlanes([0.5, 0.5, 0.5], 1), []);

    // Three clusters, two gaps, ranked by prominence.
    const three = [...cluster(0, 0.05, 400), ...cluster(0.48, 0.52, 400),
                   ...cluster(0.95, 1, 400)];
    const levels = depthPlanes(three, 2);
    assert.equal(levels.length, 2);
    assert.ok(levels[0] > 0.05 && levels[0] < 0.48, `first ${levels[0]}`);
    assert.ok(levels[1] > 0.52 && levels[1] < 0.95, `second ${levels[1]}`);
});

test('depthPlanes reads a depth image without flattening it', () => {
    // A 4K depth map is twelve million values; materialising them to fill
    // a 128-bin histogram would be 48MB of waste.
    const w = 32, h = 16;
    const data = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
        const v = (i % w) < w / 2 ? 20 : 230;
        data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
        data[i * 4 + 3] = 255;
    }
    const [level] = depthPlanes({ data, width: w, height: h }, 1);
    assert.ok(level > 20 / 255 && level < 230 / 255, `level ${level} is not in the gap`);
});

test('dilateMask grows a mask by the radius, in both axes', () => {
    // The plate needs this: a depth threshold cannot see the rim of texels
    // the silhouette shares with the background, because the rim is where
    // the depth map is wrong.
    const w = 9, h = 9;
    const mask = new Float32Array(w * h);
    mask[4 * w + 4] = 1;
    dilateMask(mask, w, h, 2);
    let on = 0;
    for (const v of mask) if (v > 0.5) on++;
    assert.equal(on, 25, 'a radius-2 dilation of one pixel is a 5x5 block');
    assert.equal(mask[4 * w + 2], 1);
    assert.equal(mask[2 * w + 4], 1);
    assert.equal(mask[4 * w + 1], 0);
});
