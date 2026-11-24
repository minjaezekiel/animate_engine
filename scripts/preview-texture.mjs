/**
 * Paint a procedural texture to a PNG, in Node, with no browser.
 *
 *   node scripts/preview-texture.mjs earth:albedo out/tex/albedo.png
 *   node scripts/preview-texture.mjs earth                 # all of them
 *
 * # Why this exists
 *
 * Every phase in this repo has relearned that **a drawing is checked by
 * looking at it**. Texture synthesis is drawing: a ramp that clips, a mask
 * read off the wrong channel, a seam at the date line and noise at the wrong
 * octave all pass every assertion you would think to write and are obvious in
 * one glance.
 *
 * Without this, looking at a texture meant rendering a film, which means a
 * headless Chrome, a lock, a WebGL context and thirty seconds -- so in
 * practice it meant not looking. `paintTexture` is pure arithmetic over a
 * byte array precisely so that this script can be twenty lines and instant.
 *
 * The PNG encoder is `zlib.deflateSync` plus four chunk headers, because
 * `node:zlib` is in the standard library and an image encoder is not worth a
 * dependency.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { paintTexture, normalFromHeight } from '../src/core/art/textures.js';
import * as earth from './lib/earth.mjs';

const ROOT = new URL('..', import.meta.url).pathname;

/** The named spec sets a caller can preview. */
const SETS = {
    earth: {
        albedo: earth.albedoSpec(1024),
        height: earth.heightSpec(512),
        roughness: earth.roughnessSpec(512),
        cloud: earth.cloudSpec(1024),
        night: earth.nightSpec(512),
        mantle: earth.mantleSpec(512),
        outerCore: earth.outerCoreSpec(256),
        innerCore: earth.innerCoreSpec(256),
        stars: earth.starSpec(1024),
    },
};

/**
 * RGBA bytes to a PNG.
 *
 * One IDAT, filter type 0 on every scanline. No interlacing, no palette, no
 * ancillary chunks -- this is for looking at, not for shipping.
 */
export function encodePng({ width, height, data }) {
    const raw = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
        const o = y * (width * 4 + 1);
        raw[o] = 0;                                   // filter: none
        Buffer.from(data.buffer ?? data, (data.byteOffset ?? 0) + y * width * 4,
                    width * 4).copy(raw, o + 1);
    }
    const crcTable = (() => {
        const t = new Int32Array(256);
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
            t[n] = c;
        }
        return t;
    })();
    const crc = (buf) => {
        let c = -1;
        for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
        return (c ^ -1) >>> 0;
    };
    const chunk = (type, body) => {
        const head = Buffer.alloc(8);
        head.writeUInt32BE(body.length, 0);
        head.write(type, 4, 'ascii');
        const tail = Buffer.alloc(4);
        tail.writeUInt32BE(crc(Buffer.concat([head.subarray(4), body])), 0);
        return Buffer.concat([head, body, tail]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;        // bit depth
    ihdr[9] = 6;        // colour type: RGBA
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', deflateSync(raw, { level: 6 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

const [target = 'earth', outArg] = process.argv.slice(2);
const [setName, which] = target.split(':');
const set = SETS[setName];
if (!set) {
    console.error(`unknown set '${setName}'. Known: ${Object.keys(SETS).join(', ')}`);
    process.exit(1);
}
const wanted = which ? { [which]: set[which] } : set;
if (which && !set[which]) {
    console.error(`unknown texture '${which}'. Known: ${Object.keys(set).join(', ')}`);
    process.exit(1);
}

for (const [name, spec] of Object.entries(wanted)) {
    const t0 = Date.now();
    const bytes = paintTexture(spec);
    const out = outArg ?? `out/tex/${setName}-${name}.png`;
    await mkdir(join(ROOT, dirname(out)), { recursive: true });
    await writeFile(join(ROOT, out), encodePng(bytes));
    // Mean and extremes, because a plate that is all one value is the most
    // common synthesis bug and the cheapest thing to report.
    let sum = 0;
    let min = 255;
    let max = 0;
    for (let i = 0; i < bytes.data.length; i += 4) {
        const v = (bytes.data[i] + bytes.data[i + 1] + bytes.data[i + 2]) / 3;
        sum += v; if (v < min) min = v; if (v > max) max = v;
    }
    const n = bytes.data.length / 4;
    console.log(`${out}  ${bytes.width}x${bytes.height}  `
        + `mean ${(sum / n).toFixed(1)} range ${min.toFixed(0)}..${max.toFixed(0)}  `
        + `${Date.now() - t0}ms`);

    // A normal map, whenever a height plate was asked for: it is derived, so
    // previewing the height without it hides half of what will be rendered.
    if (name === 'height') {
        const nm = normalFromHeight(bytes, 2.4);
        const nmOut = out.replace(/\.png$/, '-normal.png');
        await writeFile(join(ROOT, nmOut), encodePng(nm));
        console.log(`${nmOut}  ${nm.width}x${nm.height}  (derived)`);
    }
}
