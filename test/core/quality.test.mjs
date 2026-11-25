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
import { buildComposer } from '../../src/render/post3d.js';

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
