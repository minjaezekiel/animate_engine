/**
 * The headless op table and the PNG codec behind it.
 *
 *   npm run test:ops
 *
 * The op table is the surface an MCP client sees, so the tests here are
 * as much about *what a caller is told* as about what the code does. An
 * agent's only feedback is the returned object, and several of these
 * assertions exist because a result that looks like success while nothing
 * happened is the worst failure available to it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import { OPS, OP_NAMES, createContext, run } from '../../src/core/script/ops.js';
import { encodePNG, decodePNG } from '../../src/io/png.js';

/** An in-memory `io`, so the tests touch no disk. */
function memoryIO() {
    const files = new Map();
    return {
        files,
        readImage: (path) => {
            const found = files.get(path);
            if (!found) throw new Error(`no such file: ${path}`);
            return decodePNG(found);
        },
        writeImage: (path, width, height, rgba) => {
            files.set(path, encodePNG(width, height, rgba));
        },
    };
}

const ctx = await createContext({ io: memoryIO() });

/** A small opaque PNG, and a matching two-level depth map. */
function fixtures() {
    const w = 48, h = 32;
    const pic = new Uint8Array(w * h * 4);
    const dep = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
        const near = (i % w) >= w / 2;
        pic[i * 4] = near ? 230 : 50;
        pic[i * 4 + 1] = near ? 150 : 90;
        pic[i * 4 + 2] = near ? 60 : 160;
        pic[i * 4 + 3] = 255;
        const d = near ? 240 : 20;
        dep[i * 4] = dep[i * 4 + 1] = dep[i * 4 + 2] = d;
        dep[i * 4 + 3] = 255;
    }
    ctx.io.files.set('pic.png', encodePNG(w, h, pic));
    ctx.io.files.set('dep.png', encodePNG(w, h, dep));
    return { w, h };
}

// =====================================================================
// the table itself
// =====================================================================

test('every op is documented well enough to use without reading the source', () => {
    // The MCP schemas are generated from these strings, so an undocumented
    // parameter reaches a model as a bare name with no guidance.
    for (const [name, op] of Object.entries(OPS)) {
        assert.ok(op.summary && op.summary.length > 20, `${name}: summary too thin`);
        assert.equal(typeof op.run, 'function', `${name}: no run`);
        for (const [key, spec] of Object.entries(op.params)) {
            assert.ok(spec.doc && spec.doc.length > 3, `${name}.${key}: undocumented`);
            assert.ok(['string', 'number', 'boolean', 'array', 'object'].includes(spec.type),
                `${name}.${key}: unknown type "${spec.type}"`);
        }
    }
});

test('a missing required argument says which one and what it is for', () => {
    // A bare validation failure tells a model nothing it can act on.
    await_rejects(() => run(ctx, 'paint_create', { width: 10 }),
        /requires "id".*refer to this document/s);
    await_rejects(() => run(ctx, 'paint_stroke', { doc: 'x' }), /requires "layer"/);
});

test('an unknown op lists the known ones', () => {
    // The caller may have guessed a plausible name; the correction is
    // more useful than the rejection.
    await_rejects(() => run(ctx, 'paint_squiggle', {}), /unknown op .*Known: list_brushes/s);
});

test('discovery ops describe the library rather than naming it', () => {
    const brushes = OPS.list_brushes.run(ctx, {});
    assert.ok(brushes.length >= 15, `only ${brushes.length} brushes`);
    const ink = brushes.find((b) => b.name === 'ink');
    assert.ok(ink.taper > 0 && ink.accumulation === 'peak');
    const wet = brushes.filter((b) => b.wet);
    assert.ok(wet.length >= 3, 'no wet brushes advertised');
    const nibbed = brushes.filter((b) => b.nib);
    assert.ok(nibbed.length >= 3, 'no chisel nibs advertised');

    const modes = OPS.list_blend_modes.run(ctx, {});
    assert.ok(modes.includes('luminosity') && modes.includes('multiply'));

    const effects = OPS.list_effects.run(ctx, {});
    assert.equal(effects.length, 4);
    for (const e of effects) {
        assert.ok(e.summary && e.fields, `${e.type} has no field documentation`);
    }
});

// =====================================================================
// painting through the ops
// =====================================================================

test('a document round-trips through create, draw, render', async () => {
    await run(ctx, 'paint_create', { id: 'd1', width: 60, height: 40 });
    await run(ctx, 'paint_add_layer', { doc: 'd1', name: 'ink', blend: 'multiply' });

    const drawn = await run(ctx, 'paint_stroke', {
        doc: 'd1', layer: 'ink', path: 'M 5 20 L 55 20', brush: 'ink', size: 10, color: '#102030',
    });
    assert.ok(drawn.dabs > 10, `only ${drawn.dabs} dabs`);
    assert.equal(drawn.note, undefined);

    const rendered = await run(ctx, 'paint_render', { doc: 'd1', out: 'out.png' });
    assert.equal(rendered.width, 60);
    assert.ok(rendered.inked > 0.05, `inked fraction ${rendered.inked} looks blank`);

    // The written file must actually be a readable PNG of the right size.
    const back = decodePNG(ctx.io.files.get('out.png'));
    assert.equal(back.width, 60);
    assert.equal(back.height, 40);
});

test('a stroke drawn off-canvas says so instead of reporting success', () => {
    // The trap: a stroke at (-500,-500) resamples into hundreds of dabs
    // and returns a healthy-looking count while the picture is untouched.
    const off = OPS.paint_stroke.run(ctx, {
        doc: 'd1', layer: 'ink', path: 'M -500 -500 L -400 -400', brush: 'pen',
    });
    assert.ok(off.dabs > 0, 'the fixture should resample into dabs');
    assert.match(off.note, /outside the 60x40 canvas/);
    assert.ok(off.bounds.x1 < 0);

    const empty = OPS.paint_stroke.run(ctx, { doc: 'd1', layer: 'ink', path: '' });
    assert.equal(empty.dabs, 0);
    assert.match(empty.note, /empty/);
});

test('stroke bounds include the brush radius', () => {
    // Bounds read off the dab centres would report a single tap as a
    // zero-area point, so a 60px brush just off the edge would be called
    // off-canvas when half of it is plainly visible.
    const near = OPS.paint_stroke.run(ctx, {
        doc: 'd1', layer: 'ink', points: [{ x: 30, y: 20, p: 1 }],
        brush: 'pen', size: 40, color: '#000',
    });
    assert.ok(near.bounds.x1 - near.bounds.x0 > 30,
        `a 40px dab reported a ${(near.bounds.x1 - near.bounds.x0).toFixed(1)}px extent`);
    assert.equal(near.note, undefined);

    // Just outside the canvas, but wide enough to still show.
    const edge = OPS.paint_stroke.run(ctx, {
        doc: 'd1', layer: 'ink', points: [{ x: -8, y: 20, p: 1 }],
        brush: 'pen', size: 60, color: '#000',
    });
    assert.ok(edge.bounds.x1 > 0, 'the brush radius was not counted');
    assert.equal(edge.note, undefined, 'a partly visible dab was called off-canvas');
});

test('an unknown document or layer names what does exist', () => {
    await_rejects(() => run(ctx, 'paint_stroke', { doc: 'nope', layer: 'x', path: 'M 0 0 L 1 1' }),
        /no paint document "nope"; have: d1/);
    await_rejects(() => run(ctx, 'paint_stroke', { doc: 'd1', layer: 'nope', path: 'M 0 0 L 1 1' }),
        /no layer "nope"; have: layer1, ink/);
});

test('masks and clipping are reachable through the ops', async () => {
    await run(ctx, 'paint_create', { id: 'd2', width: 40, height: 30 });
    await run(ctx, 'paint_add_layer', { doc: 'd2', name: 'shade', clip: true });
    await run(ctx, 'paint_stroke', { doc: 'd2', layer: 'layer1',
        path: 'M 4 15 L 20 15', brush: 'pen', size: 16, color: '#ffcc00' });
    await run(ctx, 'paint_stroke', { doc: 'd2', layer: 'shade',
        path: 'M 4 15 L 36 15', brush: 'pen', size: 16, color: '#4040ff' });
    await run(ctx, 'paint_add_mask', { doc: 'd2', layer: 'layer1' });
    const masked = await run(ctx, 'paint_mask_stroke', { doc: 'd2', layer: 'layer1',
        brush: 'eraser', size: 10, path: 'M 10 15 L 12 15' });
    assert.ok(masked.dabs > 0);

    const listed = await run(ctx, 'paint_list', {});
    const d2 = listed.find((d) => d.id === 'd2');
    assert.equal(d2.layers[1].clip, true);
    assert.equal(d2.layers[0].hasMask, true);
});

test('a brush texture can be loaded from a PNG and used', async () => {
    const w = 16, h = 16, tile = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++) {
        const v = (i % w) < 8 ? 40 : 230;
        tile[i * 4] = tile[i * 4 + 1] = tile[i * 4 + 2] = v;
        tile[i * 4 + 3] = 255;
    }
    ctx.io.files.set('paper.png', encodePNG(w, h, tile));
    const loaded = await run(ctx, 'paint_load_texture', { name: 'paper', path: 'paper.png' });
    assert.deepEqual([loaded.width, loaded.height], [16, 16]);

    await run(ctx, 'paint_create', { id: 'd3', width: 60, height: 20 });
    await run(ctx, 'paint_stroke', {
        doc: 'd3', layer: 'layer1', path: 'M 5 10 L 55 10', brush: 'pen', size: 14,
        color: '#000', brushOverrides: { grain: 0.9, grainAsset: 'paper', grainScale: 1 },
    });
    const doc3 = ctx.docs.get('d3');
    doc3.flatten();
    const alphas = [];
    for (let x = 10; x < 50; x++) alphas.push(doc3.composite.array[(10 * 60 + x) * 4 + 3]);
    const span = Math.max(...alphas) - Math.min(...alphas);
    assert.ok(span > 0.3, `the loaded texture did not modulate the stroke (span ${span})`);
});

// =====================================================================
// photo motion through the ops
// =====================================================================

test('photo_create reports whether parallax will actually do anything', async () => {
    fixtures();
    const withDepth = await run(ctx, 'photo_create', {
        id: 'p1', source: 'pic.png', depth: 'dep.png', duration: 2,
        effects: [{ type: 'parallax', amplitude: 0.1 }],
    });
    assert.equal(withDepth.depth, 'loaded');
    assert.ok(withDepth.overscan > 1, 'no overscan was reserved');

    // Saying "created" while the only effect is inert would leave a
    // caller waiting for motion that never comes.
    const without = await run(ctx, 'photo_create', {
        id: 'p2', source: 'pic.png', effects: [{ type: 'parallax', amplitude: 0.1 }],
    });
    assert.match(without.depth, /parallax will do nothing/);
});

test('photo_estimate_depth says what is missing instead of failing obscurely', async () => {
    fixtures();
    // No ONNX runtime is installed here, and that is the normal case: the
    // runtime is optional in both Node and the browser. What matters is
    // that the message names the candidates and the fix, because "cannot
    // find module 'onnxruntime-node'" tells a caller nothing about a
    // package it never heard of.
    await assert.rejects(
        () => run(ctx, 'photo_estimate_depth',
                  { source: 'pic.png', out: 'd.png', model: 'model.onnx' }),
        (error) => {
            assert.match(error.message, /no ONNX runtime available/);
            assert.match(error.message, /onnxruntime-node/);
            assert.match(error.message, /onnxruntime-web/);
            assert.match(error.message, /npm i onnxruntime-node/);
            return true;
        });

    // An injected runtime is the supported seam, and it is what makes the
    // whole path exercisable without a 50MB model: the op is a thin shell
    // over `DepthEstimator`, which has its own tests in motion.test.mjs.
    await assert.rejects(
        () => run(ctx, 'photo_estimate_depth',
                  { source: 'pic.png', out: 'd.png', model: 'model.onnx',
                    runtime: 'node:path' }),
        /InferenceSession|not a function|undefined/);
});

test('photo_create reports what tearing actually did', async () => {
    fixtures();
    const torn = await run(ctx, 'photo_create', {
        id: 'p3', source: 'pic.png', depth: 'dep.png', duration: 2, tear: true,
        effects: [{ type: 'parallax', amplitude: 0.1 }],
    });
    assert.ok(torn.tear.fillPx > 0, `nothing was reserved to fill the tear: ${torn.tear.fillPx}`);
    assert.equal(torn.tear.levels.length, 1);

    // `tear` without a depth map is inert, and a caller who cannot see the
    // screen has no other way to find that out.
    const inert = await run(ctx, 'photo_create', {
        id: 'p4', source: 'pic.png', tear: true,
        effects: [{ type: 'kenBurns', to: { zoom: 1.1 } }],
    });
    assert.match(inert.tear, /tearing needs a depth map/);
});

test('photo frames render, differ over time, and fill the frame', async () => {
    const a = await run(ctx, 'photo_render', { id: 'p1', t: 0, out: 'f0.png' });
    await run(ctx, 'photo_render', { id: 'p1', t: 0.5, out: 'f1.png' });
    assert.equal(a.width, 48);

    const f0 = decodePNG(ctx.io.files.get('f0.png'));
    const f1 = decodePNG(ctx.io.files.get('f1.png'));
    assert.notDeepEqual(Array.from(f0.data), Array.from(f1.data),
        'two different times produced identical frames');
    // Overscan means every pixel is covered.
    for (let i = 3; i < f0.data.length; i += 4) {
        assert.equal(f0.data[i], 255, 'a frame pixel was left uncovered');
    }
});

test('a sequence writes numbered frames and insists on a pattern', async () => {
    const seq = await run(ctx, 'photo_render_sequence', {
        id: 'p1', out: 'seq/frame-####.png', fps: 4, duration: 1,
    });
    assert.equal(seq.frames, 4);
    assert.ok(ctx.io.files.has('seq/frame-0000.png'));
    assert.ok(ctx.io.files.has('seq/frame-0003.png'));

    await_rejects(() => run(ctx, 'photo_render_sequence', { id: 'p1', out: 'nopattern.png' }),
        /must contain "####"/);
});

// =====================================================================
// the PNG codec
// =====================================================================

test('PNG round-trips RGBA and RGB exactly', () => {
    const w = 37, h = 23;
    const rgba = new Uint8Array(w * h * 4);
    for (let i = 0; i < rgba.length; i++) rgba[i] = (i * 7) & 255;
    const back = decodePNG(encodePNG(w, h, rgba));
    assert.deepEqual(Array.from(back.data), Array.from(rgba));

    const rgb = new Uint8Array(w * h * 3);
    for (let i = 0; i < rgb.length; i++) rgb[i] = (i * 11) & 255;
    const back3 = decodePNG(encodePNG(w, h, rgb, { channels: 3 }));
    for (let i = 0; i < w * h; i++) {
        assert.equal(back3.data[i * 4], rgb[i * 3]);
        assert.equal(back3.data[i * 4 + 3], 255, 'RGB decode must fill alpha');
    }
});

test('all five scanline filters decode', () => {
    // The encoder only ever writes filter 0, so without this the other
    // four reconstructions are never executed -- and a PNG from any other
    // tool uses them heavily.
    const w = 19, h = 11, channels = 4, stride = w * channels;
    const pixels = new Uint8Array(w * h * channels);
    for (let i = 0; i < pixels.length; i++) pixels[i] = (i * 13 + (i >> 5)) & 255;

    for (const filter of [0, 1, 2, 3, 4]) {
        const raw = Buffer.alloc(h * (1 + stride));
        let prev = Buffer.alloc(stride);
        for (let y = 0; y < h; y++) {
            const line = Buffer.from(pixels.subarray(y * stride, (y + 1) * stride));
            const encoded = Buffer.alloc(stride);
            for (let i = 0; i < stride; i++) {
                const a = i >= channels ? line[i - channels] : 0;
                const b = prev[i];
                const c = i >= channels ? prev[i - channels] : 0;
                let predictor = 0;
                if (filter === 1) predictor = a;
                else if (filter === 2) predictor = b;
                else if (filter === 3) predictor = (a + b) >> 1;
                else if (filter === 4) {
                    const p = a + b - c;
                    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
                    predictor = pa <= pb && pa <= pc ? a : (pb <= pc ? b : c);
                }
                encoded[i] = (line[i] - predictor) & 255;
            }
            raw[y * (1 + stride)] = filter;
            encoded.copy(raw, y * (1 + stride) + 1);
            prev = line;
        }

        const png = buildPNG(w, h, 6, deflateSync(raw));
        const back = decodePNG(png);
        assert.deepEqual(Array.from(back.data), Array.from(pixels), `filter ${filter}`);
    }
});

test('unsupported PNG variants are refused clearly, not misdecoded', () => {
    // A silently misdecoded image costs far more to diagnose than a
    // refusal does.
    assert.throws(() => decodePNG(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8])), /not a PNG/);
    assert.throws(() => decodePNG(buildPNG(4, 4, 6, deflateSync(Buffer.alloc(4 * 17)), { depth: 16 })),
        /bit depth 16/);
    assert.throws(() => decodePNG(buildPNG(4, 4, 6, deflateSync(Buffer.alloc(4 * 17)), { interlace: 1 })),
        /interlaced/);
});

test('greyscale PNG decodes to RGBA', () => {
    const w = 8, h = 4, stride = w;
    const raw = Buffer.alloc(h * (1 + stride));
    for (let y = 0; y < h; y++) {
        raw[y * (1 + stride)] = 0;
        for (let x = 0; x < w; x++) raw[y * (1 + stride) + 1 + x] = x * 30;
    }
    const back = decodePNG(buildPNG(w, h, 0, deflateSync(raw)));
    assert.equal(back.data[3], 255, 'alpha must be filled');
    // Every grey must reach all three channels. Checking only pixel 0 --
    // which is black -- cannot tell a correct decode from one that
    // writes red and leaves green and blue at zero.
    for (let x = 0; x < w; x++) {
        const v = x * 30;
        const d = x * 4;
        assert.equal(back.data[d], v, `pixel ${x} red`);
        assert.equal(back.data[d + 1], v, `pixel ${x} green`);
        assert.equal(back.data[d + 2], v, `pixel ${x} blue`);
    }
});

// ---------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------

/** Assemble a PNG around an already-deflated IDAT, for decoder tests. */
function buildPNG(width, height, colorType, idat, { depth = 8, interlace = 0 } = {}) {
    const { crc32 } = require_zlib();
    const chunk = (type, data) => {
        const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
        const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
        const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body));
        return Buffer.concat([len, body, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
    ihdr[8] = depth; ihdr[9] = colorType; ihdr[12] = interlace;
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
    ]);
}

let _zlib = null;
function require_zlib() {
    if (!_zlib) _zlib = { crc32: (b) => zlibCrc(b) };
    return _zlib;
}
let zlibCrc;
{
    const mod = await import('node:zlib');
    zlibCrc = mod.crc32;
}

/** `assert.rejects` for a synchronous-or-async call, without the ceremony. */
function await_rejects(fn, pattern) {
    let threw = null;
    try {
        const r = fn();
        if (r && typeof r.then === 'function') {
            return r.then(() => assert.fail('expected a rejection'),
                (e) => assert.match(String(e.message), pattern));
        }
    } catch (e) { threw = e; }
    assert.ok(threw, 'expected a throw');
    assert.match(String(threw.message), pattern);
    return undefined;
}
