/**
 * A ZIP writer, stored (uncompressed) only.
 *
 * ```js
 * const blob = await zip([
 *     { name: 'frames/0000.png', data: bytes },
 *     { name: 'frames/0001.png', data: bytes },
 * ]);
 * ```
 *
 * # Why stored and not deflated
 *
 * The one thing this is for is a PNG image sequence, and PNG is already
 * deflate. Compressing it again typically *grows* the file by the
 * overhead of a second stream, and it would cost either a deflate
 * implementation or `CompressionStream`, which is not everywhere. Stored
 * entries cost a header and a checksum.
 *
 * So this is deliberately not a general archiver. It is the smallest thing
 * that produces a file every operating system can open, for data that is
 * already compressed.
 *
 * # Why a ZIP at all
 *
 * A 2,880-frame render is 2,880 downloads otherwise, and a browser will
 * not do that. The alternative is the File System Access API, which is
 * Chromium-only and prompts for a directory. A single archive works
 * everywhere and is what every "export image sequence" expects.
 *
 * ZIP64 is not implemented: a 4 GB limit on the archive and on any entry.
 * A 2,880-frame 1080p PNG sequence is well inside it, and exceeding it
 * **throws** rather than writing a file that silently truncates -- the
 * failure mode of every hand-rolled ZIP writer that ignores the limit.
 */

const LIMIT = 0xFFFFFFFF;

/** CRC-32, table built once. */
const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
        table[n] = c >>> 0;
    }
    return table;
})();

export function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
}

/** Little-endian writer over a growable byte array. */
function writer() {
    const parts = [];
    let length = 0;
    return {
        get length() { return length; },
        bytes(b) { parts.push(b); length += b.length; },
        u16(v) { this.bytes(Uint8Array.of(v & 0xFF, (v >>> 8) & 0xFF)); },
        u32(v) {
            this.bytes(Uint8Array.of(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF));
        },
        join() {
            const out = new Uint8Array(length);
            let at = 0;
            for (const part of parts) { out.set(part, at); at += part.length; }
            return out;
        },
    };
}

const utf8 = (s) => new TextEncoder().encode(s);

/**
 * Build a ZIP archive.
 *
 * @param {Array<{name: string, data: Uint8Array}>} entries
 * @returns {Uint8Array}
 */
export function zipBytes(entries) {
    const out = writer();
    const central = [];

    for (const entry of entries) {
        const name = utf8(entry.name);
        // Size checked *before* coercing: `new Uint8Array(something huge)`
        // tries to allocate it, so a guard placed after the conversion
        // never runs -- the process is already wedged. Found by the test
        // for this very guard, which hung.
        const size = entry.data?.length ?? entry.data?.byteLength ?? 0;
        if (size > LIMIT) {
            throw new Error(`zip: "${entry.name}" is ${size} bytes; `
                + 'this writer is not ZIP64 and cannot exceed 4GB per entry');
        }
        const data = entry.data instanceof Uint8Array
            ? entry.data : new Uint8Array(entry.data);
        const crc = crc32(data);
        const offset = out.length;

        out.u32(0x04034B50);      // local file header
        out.u16(20);              // version needed: 2.0
        // Bit 11 marks the name as UTF-8. Without it a non-ASCII filename
        // is read in the host's legacy code page and arrives mangled.
        out.u16(0x0800);
        out.u16(0);               // method 0: stored
        out.u16(0); out.u16(0);   // mod time / date: zeroed, so the archive
                                  // is byte-reproducible for the same input
        out.u32(crc);
        out.u32(data.length);     // compressed size == size, stored
        out.u32(data.length);
        out.u16(name.length);
        out.u16(0);               // extra field length
        out.bytes(name);
        out.bytes(data);

        central.push({ name, crc, size: data.length, offset });
    }

    const directoryStart = out.length;
    for (const entry of central) {
        out.u32(0x02014B50);      // central directory header
        out.u16(20); out.u16(20);
        out.u16(0x0800);
        out.u16(0);
        out.u16(0); out.u16(0);
        out.u32(entry.crc);
        out.u32(entry.size); out.u32(entry.size);
        out.u16(entry.name.length);
        out.u16(0); out.u16(0);   // extra, comment
        out.u16(0);               // disk number
        out.u16(0); out.u32(0);   // internal / external attributes
        out.u32(entry.offset);
        out.bytes(entry.name);
    }
    const directorySize = out.length - directoryStart;
    if (out.length > LIMIT) {
        throw new Error('zip: archive exceeds 4GB; this writer is not ZIP64');
    }

    out.u32(0x06054B50);          // end of central directory
    out.u16(0); out.u16(0);
    out.u16(central.length); out.u16(central.length);
    out.u32(directorySize);
    out.u32(directoryStart);
    out.u16(0);                   // comment length
    return out.join();
}

/** As [`zipBytes`], as a Blob. */
export function zip(entries) {
    return new Blob([zipBytes(entries)], { type: 'application/zip' });
}
