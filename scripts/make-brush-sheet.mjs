/**
 * Render every brush in the library to a PNG, for looking at.
 *
 *   npm run make:brushes            # -> demo/out/brush-sheet.png
 *   OUT=/tmp/x.png npm run make:brushes
 *
 * Tests assert that the brushes *behave* differently -- that a marker caps
 * at its flow and an airbrush builds past it. They cannot say whether the
 * marks look like the instruments they are named after, and that is the
 * actual requirement. So this exists to be examined.
 *
 * It also demonstrates the paint layer running with no browser at all:
 * kernels, strokes, brushes and surface are pure, so the whole thing
 * renders in Node. The PNG writer below uses `node:zlib` and nothing else,
 * in keeping with the rule that nothing in this engine needs an install.
 */
import { deflateSync, crc32 } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadKernels } from '../src/kernels/index.js';
import { PaintSurface } from '../src/core/paint/Surface.js';
import { BRUSH_NAMES, brush } from '../src/core/paint/brushes.js';

const OUT = process.env.OUT || 'demo/out/brush-sheet.png';

/**
 * Write 8-bit RGB as a PNG.
 *
 * Four chunks: signature, IHDR, IDAT, IEND. Each scanline is prefixed
 * with a zero filter byte -- "no filtering" -- which costs some
 * compression and removes every opportunity to get the filter arithmetic
 * wrong. `zlib.crc32` has been in Node since 20.12, so the chunk CRCs need
 * no hand-rolled table either.
 */
function png(width, height, rgb) {
    const chunk = (type, data) => {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length);
        const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
        const crc = Buffer.alloc(4);
        crc.writeUInt32BE(crc32(body));
        return Buffer.concat([len, body, crc]);
    };

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;     // bit depth
    ihdr[9] = 2;     // colour type 2 = truecolour RGB
    // bytes 10-12: deflate, adaptive filtering, no interlace -- all zero.

    const raw = Buffer.alloc(height * (1 + width * 3));
    for (let y = 0; y < height; y++) {
        const row = y * (1 + width * 3);
        raw[row] = 0;                                   // filter: none
        rgb.copy(raw, row + 1, y * width * 3, (y + 1) * width * 3);
    }

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

const K = await loadKernels({ prefer: 'wasm' });
console.log(`kernels: ${K.backend}, simd128=${K.simd}`);

const ROW = 104;
const W = 980;
const H = ROW * BRUSH_NAMES.length;
const surface = new PaintSurface(K, W, H);

/** A stroke that rises and falls in pressure, so dynamics are visible. */
function wave(y, { from = 70, to = W - 60, amp = 24, n = 160 } = {}) {
    const pts = [];
    for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        pts.push({
            x: from + t * (to - from),
            y: y + Math.sin(t * Math.PI * 2.1) * amp,
            // Pressure ramps 0 -> 1 -> 0 across the stroke, so taper,
            // size response and flow response all show in one mark.
            p: Math.sin(t * Math.PI) ** 0.7,
        });
    }
    return pts;
}

for (const [i, name] of BRUSH_NAMES.entries()) {
    const y = i * ROW + ROW / 2;
    const spec = brush(name);

    if (spec.erase) {
        // An eraser needs something to erase, so lay a solid band first
        // and cut through it. Erasing an empty surface shows nothing, and
        // a sheet with blank rows would look like a bug.
        const band = [];
        for (let x = 50; x <= W - 40; x += 6) band.push({ x, y, p: 1 });
        surface.draw({ points: band, brush: 'pen', size: 64, color: '#c2452f', opacity: 1 });
        surface.draw({ points: wave(y, { amp: 18 }), brush: name, size: 26 });
    } else if (spec.wet) {
        // A wet brush has nothing to say against an empty canvas -- its
        // whole character is what it picks up. So the row is prepared with
        // adjacent bands of colour and the brush is dragged across them,
        // which is exactly the case a smear is for.
        const bands = ['#1f6fb2', '#c9a227', '#9c3d8f', '#2f8f57'];
        for (const [bi, color] of bands.entries()) {
            const x0 = 60 + bi * 220;
            const run = [];
            for (let x = x0; x < x0 + 215; x += 5) run.push({ x, y, p: 1 });
            surface.draw({ points: run, brush: 'pen', size: 58, color, opacity: 1 });
        }
        surface.draw({
            points: wave(y, { from: 70, to: W - 60, amp: 14, n: 420 }),
            brush: name, size: 30, color: '#f2f2f2', seed: 70 + i,
        });
    } else {
        // The fine brushes are drawn smaller, as they would be used.
        const size = name === 'pencil' || name === 'pen' ? 7 : 22;
        surface.draw({
            points: wave(y),
            brush: name,
            size,
            color: '#161a20',
            opacity: 1,
            seed: 9 + i,
        });
        // A short second mark at low pressure, to show the light end of
        // the brush's range beside the full one. It must use the *same*
        // size as the main stroke: at a different size a brush with no
        // pressure response, like `pen`, renders as a slab that looks
        // like a defect rather than a sample.
        const tail = [];
        for (let x = 20; x <= 58; x += 1.5) tail.push({ x, y, p: 0.3 });
        surface.draw({ points: tail, brush: name, size, color: '#161a20', seed: 300 + i });
    }
}

// Composite over white. The surface is premultiplied, so `over white` is
// `colour + (1 - alpha)`; doing it here keeps the surface itself free of
// any assumption about what it will be shown against.
const premul = surface.buffer.array;
const rgb = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H; i++) {
    const a = premul[i * 4 + 3];
    for (let c = 0; c < 3; c++) {
        const v = premul[i * 4 + c] + (1 - a);
        rgb[i * 3 + c] = Math.max(0, Math.min(255, Math.round(v * 255)));
    }
    // A hairline rule between rows, so the sheet reads as a list.
    const y = (i / W) | 0;
    if (y % ROW === 0) { rgb[i * 3] = 222; rgb[i * 3 + 1] = 226; rgb[i * 3 + 2] = 232; }
}

mkdirSync(dirname(OUT), { recursive: true });
const bytes = png(W, H, rgb);
writeFileSync(OUT, bytes);
surface.dispose();

console.log(`\nwrote ${OUT}  ${W}x${H}, ${(bytes.length / 1024).toFixed(1)} KB`);
console.log('\nrows, top to bottom:');
for (const [i, name] of BRUSH_NAMES.entries()) {
    const b = brush(name);
    console.log(`  ${String(i + 1).padStart(2)}. ${name.padEnd(11)}`
        + `hardness ${b.hardness.toFixed(2)}  flow ${b.flow.toFixed(2)}  `
        + `${b.mode === 1 ? 'build-up' : 'peak    '}  `
        + `${b.taper > 0 ? `taper ${b.taper}` : 'no taper'}`
        + `${b.jitterPos > 0 ? `  jitter ${b.jitterPos}` : ''}`
        + `${b.grain > 0 ? `  grain ${b.grain} ${b.grainMode}` : ''}`
        + `${b.aspect < 1 ? `  nib ${b.aspect} ${b.angleMode}` : ''}`
        + `${b.wet ? `  WET smudge ${b.smudge} colour ${b.colorRate}` : ''}`
        + `${b.erase ? '  ERASE' : ''}`);
}
