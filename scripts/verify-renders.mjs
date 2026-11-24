/**
 * Verify rendered MP4s without decoding them: duration, and whether the audio
 * track actually contains anything.
 *
 *   node scripts/verify-renders.mjs out/forex/en/*.mp4
 *
 * The audio check is the point. Phase 37 shipped a two-minute advert whose
 * AAC track was structurally valid and made entirely of 6-byte silent frames,
 * and every other check in the repo reported success. A real speech frame is
 * a couple of hundred bytes; a silent one is six. Reading `stsz` off the
 * container catches that in milliseconds, with no browser.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const files = process.argv.slice(2);
if (!files.length) { console.error('usage: verify-renders.mjs <file.mp4> ...'); process.exit(1); }

function boxes(buf, start, end, cb) {
    let p = start;
    while (p + 8 <= end) {
        const size = buf.readUInt32BE(p);
        const type = buf.toString('latin1', p + 4, p + 8);
        if (size < 8) break;
        cb(type, p, size);
        if (['moov', 'trak', 'mdia', 'minf', 'stbl'].includes(type)) {
            boxes(buf, p + 8, Math.min(p + size, end), cb);
        }
        p += size;
    }
}

let bad = 0;
console.log('file'.padEnd(18) + 'dur'.padStart(8) + 'video'.padStart(8)
    + 'audio'.padStart(8) + 'avg'.padStart(8) + '  verdict');
for (const f of files) {
    const b = readFileSync(f);
    let hdlr = null, dur = 0, ts = 1;
    const tracks = [];
    boxes(b, 0, b.length, (type, p) => {
        if (type === 'mvhd') { ts = b.readUInt32BE(p + 20); dur = b.readUInt32BE(p + 24); }
        if (type === 'hdlr') hdlr = b.toString('latin1', p + 16, p + 20);
        if (type === 'stsz') {
            const fixed = b.readUInt32BE(p + 12);
            const count = b.readUInt32BE(p + 16);
            let total = 0;
            if (fixed === 0) for (let i = 0; i < count; i++) total += b.readUInt32BE(p + 20 + i * 4);
            else total = fixed * count;
            tracks.push({ hdlr, count, avg: count ? total / count : 0 });
        }
    });
    const v = tracks.find((t) => t.hdlr === 'vide') ?? { count: 0, avg: 0 };
    const a = tracks.find((t) => t.hdlr === 'soun');
    const seconds = dur / ts;
    let verdict = 'ok';
    if (!a) { verdict = 'NO AUDIO TRACK'; bad++; }
    else if (a.avg < 20) { verdict = `SILENT (avg ${a.avg.toFixed(1)}B/frame)`; bad++; }
    else if (seconds < 5) { verdict = 'SUSPICIOUSLY SHORT'; bad++; }
    console.log(basename(f).padEnd(18)
        + `${seconds.toFixed(1)}s`.padStart(8)
        + String(v.count).padStart(8)
        + String(a ? a.count : 0).padStart(8)
        + `${a ? a.avg.toFixed(0) : 0}B`.padStart(8)
        + '  ' + verdict);
}
console.log(bad ? `\n${bad} PROBLEM(S)` : `\nall ${files.length} have real audio`);
process.exit(bad ? 1 : 0);
