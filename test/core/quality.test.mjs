/**
 * The quality dial: what size a name means, what bitrate a size earns, and
 * the one thing a composer must never again be built without.
 *
 * The anti-aliasing defect this guards was invisible for every phase it
 * existed in, because no check in the repo looked at an EDGE. The measurement
 * that found it needs a GPU; the mistake that caused it does not -- it is a
 * missing constructor argument, which is exactly what a stub can see.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { QUALITIES, resolveSize, bitrateFor } from '../../src/core/render/quality.js';
import { buildComposer, ssaoDepthWindow } from '../../src/render/post3d.js';
import { bevelRadius, DEFAULT_BEVEL,
         fitShadowCamera } from '../../src/backends/three3d/SceneAdapter.js';

// ------------------------------------------------------------------- the size

test('a name is the short side, and both dimensions come back even', () => {
    assert.deepEqual(resolveSize('720p', { width: 1280, height: 720 }), [1280, 720]);
    assert.deepEqual(resolveSize('360p', { width: 1280, height: 720 }), [640, 360]);
    // 480 * 16/9 is 853.33: odd, and H.264 cannot encode an odd dimension.
    assert.deepEqual(resolveSize('480p', { width: 1920, height: 1080 }), [854, 480]);
    const [w, h] = resolveSize('1024p', {});
    assert.equal(h, 1024);
    assert.equal(w % 2, 0, 'an odd width would be rejected by the encoder');
});

test('720p on a vertical film is 720 ACROSS, not 720 tall', () => {
    // The whole reason the name sets the short side: a 9:16 film asked for
    // 720p and given 1280x720 has been reframed, not resized.
    assert.deepEqual(resolveSize('720p', { width: 1080, height: 1920 }), [720, 1280]);
    assert.deepEqual(resolveSize('1080p', { width: 1080, height: 1920 }), [1080, 1920]);
});

test('no meta means 16:9, and a name that is not a size returns null', () => {
    assert.deepEqual(resolveSize('720p'), [1280, 720]);
    assert.deepEqual(resolveSize('720p', { width: 0, height: 0 }), [1280, 720]);
    assert.equal(resolveSize('huge'), null, 'so the caller keeps its own default');
    assert.equal(resolveSize(''), null);
    assert.equal(resolveSize('1'), null, 'a 1px short side is not a resolution');
    assert.deepEqual(resolveSize(' 720P '), [1280, 720], 'typed by a human');
    // A bare number is honoured, because `QUALITY=576` is a clearer failure
    // mode than refusing a size the ladder happens not to name.
    assert.deepEqual(resolveSize('576', { width: 768, height: 576 }), [768, 576]);
});

// ---------------------------------------------------------------- the bitrate

test('bits follow pixels and frames, which a flat 6 Mbit/s never did', () => {
    const at = (q, fps = 24) => bitrateFor(...resolveSize(q, {}), fps);
    assert.ok(at('360p') < at('480p'), '360p stops being handed bits it cannot use');
    assert.ok(at('480p') < at('720p'));
    assert.ok(at('720p') < at('1080p'), '1080p stops starving');
    // Four times the pixels is four times the bits: the ratio is the claim.
    assert.ok(Math.abs(at('1080p') / at('540p') - 4) < 0.02);
    assert.ok(at('720p', 48) > at('720p', 24), 'twice the frames, twice the bits');
    // The old flat figure, at the size it was chosen for, give or take.
    assert.ok(at('720p') > 3.5e6 && at('720p') < 5e6, `720p24 came out at ${at('720p')}`);
});

test('the clamps hold at both ends', () => {
    assert.equal(bitrateFor(16, 16, 24), 1e6, 'a thumbnail still gets a usable floor');
    assert.equal(bitrateFor(7680, 4320, 60), 40e6, 'and 8K60 does not ask for 400 Mbit/s');
    assert.equal(bitrateFor(0, 0, 0), bitrateFor(1280, 720, 24), 'nonsense falls back to 720p24');
});

test('every name in the ladder resolves', () => {
    for (const name of Object.keys(QUALITIES)) {
        const size = resolveSize(name, {});
        assert.ok(size, name);
        assert.ok(bitrateFor(...size, 24) >= 1e6, name);
    }
});

// -------------------------------------------------------- the composer target

/**
 * Enough of THREE and of the composer to see which render target was passed.
 * `buildComposer` takes its classes as arguments -- so `src/` stays free of
 * bare `three` specifiers -- which is what makes this testable in Node.
 */
function stubs() {
    const made = [];
    class WebGLRenderTarget {
        constructor(w, h, opts = {}) { Object.assign(this, { w, h, ...opts }); made.push(this); }
        setSize() {}
        clone() { return new WebGLRenderTarget(this.w, this.h, { samples: this.samples }); }
    }
    class EffectComposer {
        constructor(renderer, target = null) { this.renderer = renderer; this.target = target; this.passes = []; }
        setSize() {}
        addPass(p) { this.passes.push(p); }
    }
    const Pass = class { constructor(...a) { this.args = a; } };
    return {
        made,
        THREE: { WebGLRenderTarget, HalfFloatType: 1016, Vector2: class { constructor(x, y) { this.x = x; this.y = y; } } },
        EffectComposer, RenderPass: Pass, ShaderPass: Pass, OutputPass: Pass,
        UnrealBloomPass: Pass, SMAAPass: Pass,
    };
}

test('a composer is built on a MULTISAMPLED target, or post turns AA off', () => {
    const s = stubs();
    const built = buildComposer({
        ...s, renderer: {}, scene: {}, camera: {}, width: 1280, height: 720,
        post: { bloom: {} },
    });
    const target = built.composer.target;
    assert.ok(target, '`new EffectComposer(renderer)` allocates samples: 0, and the '
        + "renderer's own `antialias: true` never reaches a composer");
    assert.ok(target.samples >= 4, `samples was ${target.samples}`);
    assert.equal(target.type, s.THREE.HalfFloatType, 'or bloom thresholds a clipped buffer');
    assert.deepEqual([target.w, target.h], [1280, 720]);
});

test('samples is a dial, and 0 is still expressible', () => {
    const s = stubs();
    const built = buildComposer({
        ...s, renderer: {}, scene: {}, camera: {}, width: 640, height: 360,
        post: ['bloom'], samples: 8,
    });
    assert.equal(built.composer.target.samples, 8);
    const off = buildComposer({
        ...stubs(), renderer: {}, scene: {}, camera: {}, width: 640, height: 360,
        post: ['bloom'], samples: 0,
    });
    assert.equal(off.composer.target.samples, 0, 'for a machine that cannot afford it');
});

// ------------------------------------------------------------------ the bevel

/**
 * Nothing in the physical world has a zero-radius edge, and every box in this
 * engine had twelve of them. The radius is a fact about the tool that cut the
 * part, not about how big the part is -- so it is absolute, and clamped only
 * where it would eat the part.
 */
test('a box is bevelled by default, at a tool-sized radius', () => {
    assert.equal(bevelRadius({ width: 0.25, height: 0.07, depth: 0.04 }), DEFAULT_BEVEL);
    assert.equal(bevelRadius({}), DEFAULT_BEVEL, 'a 1x1x1 box too');
    assert.ok(DEFAULT_BEVEL > 0 && DEFAULT_BEVEL < 0.01, 'a chamfer, not a rounded brick');
});

test('the clamp keeps a thin part from being eaten by its own edge', () => {
    // A radius over half the smallest dimension is not a box any more, and
    // RoundedBoxGeometry degenerates there.
    const thin = bevelRadius({ width: 1, height: 1, depth: 0.008 });
    assert.equal(thin, 0.002, 'a quarter of the thinnest dimension');
    assert.ok(thin < 0.008 / 2);
    assert.ok(bevelRadius({ width: 2, height: 1, depth: -0.008 }) > 0, 'sign is not size');
});

test('`bevel` overrides it and `bevel: 0` is a sharp box', () => {
    assert.equal(bevelRadius({ bevel: 0 }), 0, 'for a film that wants the diagram look');
    assert.equal(bevelRadius({ bevel: 0.02, width: 1, height: 1, depth: 1 }), 0.02);
    assert.equal(bevelRadius({ bevel: 5, width: 1, height: 1, depth: 1 }), 0.25, 'still clamped');
    assert.equal(bevelRadius({ bevel: -1 }), 0, 'nonsense is flat, not negative');
});

// ----------------------------------------------------------- contact shadows

/**
 * The ambient occlusion pass existed for six phases and no film used it,
 * because it could not work: `minDistance`/`maxDistance` are differences of
 * orthographic depth NORMALISED over [near, far], and this adapter passed
 * metres. With the film camera's 0.01..200, `bias: 0.008` asked for occlusion
 * only where the depth gap was between 1.6 m and 48 m.
 */
test('the occlusion window is normalised depth, not metres', () => {
    const cam = { near: 0.01, far: 200 };
    const w = ssaoDepthWindow(0.008, 0.12, cam);
    assert.ok(Math.abs(w.minDistance - 0.008 / 199.99) < 1e-9,
        `a 8 mm bias in a 200 m frustum is ${w.minDistance}, not 0.008`);
    assert.ok(w.minDistance < 0.0001, 'the old value was 200x too large');
    assert.ok(w.maxDistance > w.minDistance);
    // The same scene shot with a tighter frustum occludes over the same
    // WORLD distance, which is the whole point of the conversion.
    const tight = ssaoDepthWindow(0.008, 0.12, { near: 0.1, far: 10 });
    assert.ok(tight.minDistance > w.minDistance * 15,
        'a 10 m frustum spends far more of its depth range on 8 mm');
    assert.deepEqual(ssaoDepthWindow(0.008, 0.12), ssaoDepthWindow(0.008, 0.12, null),
        'no camera falls back to the film camera defaults');
});

test('ambient occlusion is GTAO when it can be, and composites on what it is handed', () => {
    // `SSAOPass` renders its OWN beauty pass into a target it allocates with
    // no samples and outputs that -- so asking for occlusion silently threw
    // away the multisampled frame. GTAO multiplies onto `readBuffer`.
    const s = stubs();
    const seen = [];
    class GTAOPass {
        constructor(scene, camera, w, h) { this.size = [w, h]; this.blendIntensity = 1; }
        updateGtaoMaterial(p) { seen.push(p); }
    }
    const built = buildComposer({
        ...s, renderer: {}, scene: {}, camera: { near: 0.1, far: 50 },
        width: 640, height: 360, post: { ssao: { radius: 0.3, intensity: 0.8 } },
        GTAOPass,
    });
    assert.deepEqual(built.passes, ['ssao']);
    const pass = built.composer.passes.find((p) => p instanceof GTAOPass);
    assert.ok(pass, 'GTAO was supplied, so GTAO is what gets built');
    assert.equal(seen[0].radius, 0.3, "GTAO's radius is world units, which is what a film means");
    assert.equal(pass.blendIntensity, 0.8, 'and it has a real intensity, unlike SSAO');
});

// ----------------------------------------------------------------- shadows

/**
 * Two absolute numbers in an engine with no units. `shadow.bias` is
 * normalised over the shadow camera's `[near, far]`, and a hardcoded -0.0008
 * against the default 0.5..500 frustum is **0.4 metres** of depth offset --
 * measured, it detached a 0.5 m cube's shadow by 53 pixels. The frustum
 * itself defaulted to +/-5 units, so a set larger than that had no shadow
 * outside the box and a miniature spent its whole map on empty space.
 */
const WORLD = (f) => -f.bias * (f.far - f.near);   // the bias, back in world units

test('the shadow bias is normalised depth, so it is sub-millimetre, not 0.4 m', () => {
    const f = fitShadowCamera({ radius: 8.5, distance: 3.9, mapSize: 2048 });
    assert.ok(WORLD(f) < 0.01, `the bias is ${WORLD(f)} m of depth offset`);
    assert.ok(WORLD(f) > 0, 'and still offset the right way');
    // What it replaced, at the frustum it was written against.
    assert.ok(0.0008 * (500 - 0.5) > 0.39, 'the old one was 0.4 m');
});

test('a shadow fit is scale-invariant: the same scene ten times bigger renders the same', () => {
    const small = fitShadowCamera({ radius: 8.5, distance: 3.9, mapSize: 2048 });
    const big = fitShadowCamera({ radius: 85, distance: 39, mapSize: 2048 });
    assert.ok(Math.abs(big.extent / small.extent - 10) < 1e-9);
    assert.ok(Math.abs(big.texel / small.texel - 10) < 1e-9, 'the same texels per object');
    assert.ok(Math.abs(big.normalBias / small.normalBias - 10) < 1e-9);
    // The bias is a RATIO of the depth range, so it barely moves at all --
    // only by the near-plane clamp, which is absolute.
    assert.ok(Math.abs(big.bias / small.bias - 1) < 1e-3, `${big.bias} vs ${small.bias}`);
});

test('the near plane survives a light standing inside its own scene', () => {
    // A key light 3.9 units from the centre of a 8.5-unit sphere is inside
    // it, so `distance - radius` is negative and a camera cannot have that.
    const f = fitShadowCamera({ radius: 8.5, distance: 3.9 });
    assert.ok(f.near > 0, `near was ${f.near}`);
    assert.ok(f.far > f.near);
    assert.ok(f.far >= 3.9 + 8.5 - 1e-9, 'and still reaches the far side of the scene');
    const degenerate = fitShadowCamera({ radius: 0, distance: 0 });
    assert.ok(degenerate.extent > 0 && degenerate.far > degenerate.near, 'an empty scene is survivable');
});

test('everything else is derived from the size of one texel', () => {
    const f = fitShadowCamera({ radius: 5, distance: 10, mapSize: 1024 });
    assert.equal(f.texel, 10 / 1024);
    assert.equal(f.normalBias, f.texel * 1.5);
    // Twice the map is half the texel is half the offsets.
    const sharp = fitShadowCamera({ radius: 5, distance: 10, mapSize: 2048 });
    assert.ok(Math.abs(sharp.texel * 2 - f.texel) < 1e-12);
    assert.ok(Math.abs(sharp.normalBias * 2 - f.normalBias) < 1e-12);
});
