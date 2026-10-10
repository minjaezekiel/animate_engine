/**
 * PNG encode and decode, with `node:zlib` and nothing else.
 *
 * The engine's rule is that nothing in its path may need an install, and
 * an image codec is where that rule is usually broken. PNG is the one
 * format worth implementing by hand: the container is four chunk types,
 * the compression is deflate, and the only real work is undoing five
 * scanline filters. JPEG, by contrast, is a DCT decoder and a Huffman
 * decoder and is not worth hand-rolling -- callers wanting JPEG should
 * decode it in a browser with `createImageBitmap` and pass the pixels in.
 *
 * Both directions work on straight (non-premultiplied) RGBA, which is
 * what `ImageData` is and what `maskToRgba8` produces.
 */
import { deflateSync, inflateSync, crc32 } from 'node:zlib';

/**
 * Encode 8-bit RGBA or RGB as a PNG.
 *
 * Every scanline is written with filter 0, "none". That costs some
 * compression and removes every opportunity to get the filter arithmetic
 * wrong in the direction where a mistake is silent -- a bad filter choice
 * still decodes, just to the wrong pixels.
 *
 * @param {number} width
 * @param {number} height
 * @param {Uint8Array|Buffer} pixels   `channels * width * height` bytes
 * @param {object} [options]
 * @param {3|4} [options.channels=4]
 */
export function encodePNG(width, height, pixels, { channels = 4 } = {}) {
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
    ihdr[8] = 8;                                  // bit depth
    ihdr[9] = channels === 4 ? 6 : 2;             // 6 = RGBA, 2 = RGB
    // bytes 10-12: deflate, adaptive filtering, no interlace -- all zero.

    const stride = width * channels;
    const raw = Buffer.alloc(height * (1 + stride));
    const src = Buffer.from(pixels.buffer ?? pixels, pixels.byteOffset ?? 0,
        height * stride);
    for (let y = 0; y < height; y++) {
        const row = y * (1 + stride);
        raw[row] = 0;
        src.copy(raw, row + 1, y * stride, (y + 1) * stride);
    }

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

/** Bytes per pixel for each PNG colour type, at bit depth 8. */
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

/**
 * Decode a PNG to straight 8-bit RGBA.
 *
 * Supports bit depth 8 in greyscale, greyscale+alpha, truecolour,
 * truecolour+alpha and palette. Refuses 16-bit and interlaced images with
 * a clear message rather than returning something plausible but wrong --
 * a silently misdecoded image is far more expensive to diagnose than a
 * refusal.
 *
 * @param {Buffer|Uint8Array} bytes
 * @returns {{data: Uint8Array, width: number, height: number}}
 */
export function decodePNG(bytes) {
    const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (let i = 0; i < 8; i++) {
        if (buf[i] !== SIG[i]) throw new Error('not a PNG (bad signature)');
    }

    let width = 0, height = 0, depth = 0, colorType = 0, interlace = 0;
    let palette = null, transparency = null;
    const idat = [];

    let at = 8;
    while (at < buf.length) {
        const len = buf.readUInt32BE(at);
        const type = buf.toString('ascii', at + 4, at + 8);
        const data = buf.subarray(at + 8, at + 8 + len);
        at += 12 + len;                            // length + type + data + crc

        if (type === 'IHDR') {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            depth = data[8];
            colorType = data[9];
            interlace = data[12];
        } else if (type === 'PLTE') {
            palette = data;
        } else if (type === 'tRNS') {
            transparency = data;
        } else if (type === 'IDAT') {
            idat.push(data);
        } else if (type === 'IEND') {
            break;
        }
    }

    if (depth !== 8) {
        throw new Error(`PNG bit depth ${depth} is not supported (only 8)`);
    }
    if (interlace) throw new Error('interlaced PNG is not supported');
    const channels = CHANNELS[colorType];
    if (!channels) throw new Error(`PNG colour type ${colorType} is not supported`);
    if (colorType === 3 && !palette) throw new Error('palette PNG with no PLTE chunk');

    const raw = inflateSync(Buffer.concat(idat));
    const stride = width * channels;
    const out = new Uint8Array(width * height * 4);
    // One scanline of already-unfiltered bytes, for the filters that
    // reference the row above.
    let prev = Buffer.alloc(stride);

    for (let y = 0; y < height; y++) {
        const start = y * (stride + 1);
        const filter = raw[start];
        const line = Buffer.from(raw.subarray(start + 1, start + 1 + stride));
        unfilter(filter, line, prev, channels);

        for (let x = 0; x < width; x++) {
            const s = x * channels;
            const d = (y * width + x) * 4;
            switch (colorType) {
                case 0:                                     // greyscale
                    out[d] = out[d + 1] = out[d + 2] = line[s];
                    out[d + 3] = 255;
                    break;
                case 2:                                     // RGB
                    out[d] = line[s]; out[d + 1] = line[s + 1]; out[d + 2] = line[s + 2];
                    out[d + 3] = 255;
                    break;
                case 3: {                                   // palette
                    const p = line[s] * 3;
                    out[d] = palette[p]; out[d + 1] = palette[p + 1]; out[d + 2] = palette[p + 2];
                    out[d + 3] = transparency && line[s] < transparency.length
                        ? transparency[line[s]] : 255;
                    break;
                }
                case 4:                                     // greyscale + alpha
                    out[d] = out[d + 1] = out[d + 2] = line[s];
                    out[d + 3] = line[s + 1];
                    break;
                default:                                    // RGBA
                    out[d] = line[s]; out[d + 1] = line[s + 1];
                    out[d + 2] = line[s + 2]; out[d + 3] = line[s + 3];
                    break;
            }
        }
        prev = line;
    }

    return { data: out, width, height };
}

/**
 * Reverse one scanline filter, in place.
 *
 * The five filters all predict a byte from its left neighbour, the byte
 * above, or both, and store the difference. Decoding therefore has to run
 * strictly left to right, because each prediction uses bytes this same
 * loop has already reconstructed -- which is why this cannot be
 * vectorised and why `bpp` is a byte offset rather than a pixel one.
 */
function unfilter(filter, line, prev, bpp) {
    const n = line.length;
    switch (filter) {
        case 0: return;                                      // none
        case 1:                                              // sub: left
            for (let i = bpp; i < n; i++) line[i] = (line[i] + line[i - bpp]) & 255;
            return;
        case 2:                                              // up: above
            for (let i = 0; i < n; i++) line[i] = (line[i] + prev[i]) & 255;
            return;
        case 3:                                              // average
            for (let i = 0; i < n; i++) {
                const left = i >= bpp ? line[i - bpp] : 0;
                line[i] = (line[i] + ((left + prev[i]) >> 1)) & 255;
            }
            return;
        case 4:                                              // paeth
            for (let i = 0; i < n; i++) {
                const a = i >= bpp ? line[i - bpp] : 0;
                const b = prev[i];
                const c = i >= bpp ? prev[i - bpp] : 0;
                line[i] = (line[i] + paeth(a, b, c)) & 255;
            }
            return;
        default:
            throw new Error(`unknown PNG scanline filter ${filter}`);
    }
}

/** The Paeth predictor: whichever of left, above or upper-left is closest. */
function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    return pb <= pc ? b : c;
}
