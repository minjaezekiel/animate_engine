/**
 * Generate the PWA icon set with zero dependencies.
 *
 * Writes minimal valid PNGs (RGBA, deflate via node:zlib) so the manifest
 * resolves and the app is installable without committing binaries produced by
 * some other tool. Deterministic: same input, same bytes.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(bytes) {
    let c = 0xffffffff;
    for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    const crcInput = new Uint8Array(4 + data.length);
    for (let i = 0; i < 4; i++) crcInput[i] = type.charCodeAt(i);
    crcInput.set(data, 4);
    view.setUint32(8 + data.length, crc32(crcInput));
    return out;
}

function png(size, draw) {
    const raw = new Uint8Array(size * (size * 4 + 1));
    let p = 0;
    for (let y = 0; y < size; y++) {
        raw[p++] = 0;                             // filter: none
        for (let x = 0; x < size; x++) {
            const [r, g, b, a] = draw(x / size, y / size);
            raw[p++] = r; raw[p++] = g; raw[p++] = b; raw[p++] = a;
        }
    }
    const ihdr = new Uint8Array(13);
    const dv = new DataView(ihdr.buffer);
    dv.setUint32(0, size); dv.setUint32(4, size);
    ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    const parts = [
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', new Uint8Array(deflateSync(raw, { level: 9 }))),
        chunk('IEND', new Uint8Array(0)),
    ];
    const total = parts.reduce((n, a) => n + a.length, 0);
    const out = new Uint8Array(total);
    let o = 0;
    for (const a of parts) { out.set(a, o); o += a.length; }
    return out;
}

/** A lighthouse beam over night sea: the film's own subject as the mark. */
const icon = (inset) => (u, v) => {
    const cx = 0.5, cy = 0.42;
    let r = 11 + v * 12, g = 17 + v * 20, b = 32 + v * 24;
    if (v > 0.66) { r = 10 + (v - 0.66) * 18; g = 24; b = 40; }
    const dx = u - cx, dy = v - cy;
    const ang = Math.abs(Math.atan2(dy, Math.abs(dx)));
    if (Math.abs(dx) > 0.02 && ang < 0.28 && v < 0.66) {
        const fall = 1 - Math.min(1, Math.abs(dx) / 0.5);
        r += 150 * fall; g += 120 * fall; b += 50 * fall;
    }
    if (u > cx - 0.055 && u < cx + 0.055 && v > cy && v < 0.74) {
        const band = v > 0.52 && v < 0.58;
        r = band ? 178 : 214; g = band ? 58 : 208; b = band ? 44 : 196;
    }
    const d = Math.hypot((u - cx) * 1.1, v - cy);
    if (d < 0.075) { r = 255; g = 217; b = 138; }
    else if (d < 0.14) { const f = 1 - (d - 0.075) / 0.065; r += 90 * f; g += 70 * f; b += 25 * f; }
    const clamp = (x) => Math.max(0, Math.min(255, Math.round(x)));
    // maskable icons need their art inside the safe zone; `inset` keeps a border
    if (inset) {
        const m = 0.1;
        if (u < m || u > 1 - m || v < m || v > 1 - m) return [11, 17, 32, 255];
    }
    return [clamp(r), clamp(g), clamp(b), 255];
};

mkdirSync('src/pwa/icons', { recursive: true });
writeFileSync('src/pwa/icons/icon-192.png', png(192, icon(false)));
writeFileSync('src/pwa/icons/icon-512.png', png(512, icon(false)));
writeFileSync('src/pwa/icons/icon-maskable-512.png', png(512, icon(true)));
console.log('wrote 3 icons');
