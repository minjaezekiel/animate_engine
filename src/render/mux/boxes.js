/**
 * ISO base media file format: the byte-level primitives.
 *
 * Hand-rolled for the same reason `io/png.js` and `io/zip.js` are: the format
 * is small, the dependency would not be, and a muxer that ships inside the
 * engine is a muxer that works offline.
 *
 * Every number in MP4 is big-endian, and every box is `size type payload`
 * with the size counting its own four bytes. Those two facts are the whole
 * file format; everything else is which boxes nest inside which.
 */

export const u8 = (n) => Uint8Array.of(n & 0xff);

export const u16 = (n) => Uint8Array.of((n >>> 8) & 0xff, n & 0xff);

export const i16 = (n) => u16(n < 0 ? n + 0x10000 : n);

export const u24 = (n) => Uint8Array.of((n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);

// `>>> 24` on a value above 2^31 still works because the shift coerces to
// uint32 first -- but `n / 2**24 | 0` does not, so the shift is deliberate.
export const u32 = (n) => Uint8Array.of((n >>> 24) & 0xff, (n >>> 16) & 0xff,
                                        (n >>> 8) & 0xff, n & 0xff);

export const i32 = (n) => u32(n < 0 ? n + 0x1_0000_0000 : n);

/** 64-bit, split through division because bitwise ops in JS are 32-bit. */
export const u64 = (n) => {
    const hi = Math.floor(n / 2 ** 32);
    return concat(u32(hi), u32(n % 2 ** 32));
};

/** 16.16 fixed point, as used by tkhd width/height and the display matrix. */
export const fixed16 = (n) => u32(Math.round(n * 0x10000));

/** 8.8 fixed point, as used by tkhd volume. */
export const fixed8 = (n) => u16(Math.round(n * 0x100));

export const ascii = (s) => {
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
    return out;
};

/** A four-character code. Anything but four characters is a silent corruption. */
export const fourcc = (s) => {
    if (s.length !== 4) throw new Error(`fourcc must be 4 characters, got "${s}"`);
    return ascii(s);
};

export const zeros = (n) => new Uint8Array(n);

export function concat(...parts) {
    let total = 0;
    for (const p of parts) total += p.length;
    const out = new Uint8Array(total);
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
}

/** `size type payload…`. */
export function box(type, ...parts) {
    const body = concat(...parts);
    return concat(u32(body.length + 8), fourcc(type), body);
}

/** A box whose first four payload bytes are a version and 24 flag bits. */
export function fullBox(type, version, flags, ...parts) {
    return box(type, u8(version), u24(flags), ...parts);
}

/**
 * An MPEG-4 descriptor: tag, a 7-bits-per-byte length, then the payload.
 *
 * The length is the minimal number of 7-bit groups, high bit set on every
 * byte but the last. An AudioSpecificConfig is two bytes, so in practice
 * every descriptor here takes the one-byte form.
 */
export function descriptor(tag, ...parts) {
    const body = concat(...parts);
    let n = body.length;
    const len = [n & 0x7f];
    n >>>= 7;
    while (n > 0) { len.unshift((n & 0x7f) | 0x80); n >>>= 7; }
    return concat(u8(tag), Uint8Array.from(len), body);
}

/** The unity display matrix, as nine 16.16 values. */
export const UNITY_MATRIX = concat(
    u32(0x0001_0000), u32(0), u32(0),
    u32(0), u32(0x0001_0000), u32(0),
    u32(0), u32(0), u32(0x4000_0000),
);
