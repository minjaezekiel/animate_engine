/** Minimal ISO-BMFF probe: duration, tracks, codecs, exact frame timing. */
import { readFileSync } from 'node:fs';
const buf = readFileSync(process.argv[2]);
const fourcc = (o) => buf.toString('latin1', o, o + 4);
function* children(start, end) {
    let o = start;
    while (o + 8 <= end) {
        let size = buf.readUInt32BE(o); const type = fourcc(o + 4); let hdr = 8;
        if (size === 1) { size = Number(buf.readBigUInt64BE(o + 8)); hdr = 16; }
        if (size === 0) size = end - o;
        if (size < hdr) break;
        yield { type, start: o + hdr, end: o + size };
        o += size;
    }
}
function find(path, start, end) {
    const [head, ...rest] = path;
    for (const c of children(start, end)) if (c.type === head)
        return rest.length ? find(rest, c.start, c.end) : c;
    return null;
}
function findAll(type, start, end, out = []) {
    for (const c of children(start, end)) {
        if (c.type === type) out.push(c);
        else if (/^(moov|trak|mdia|minf|stbl|edts|mvex)$/.test(c.type)) findAll(type, c.start, c.end, out);
    }
    return out;
}
const brands = [];
const ftyp = find(['ftyp'], 0, buf.length);
if (ftyp) for (let o = ftyp.start; o + 4 <= ftyp.end; o += 4) brands.push(fourcc(o));
const moov = find(['moov'], 0, buf.length);
const mvhd = find(['mvhd'], moov.start, moov.end);
const mv = mvhd.start, ver = buf[mv];
const mvTs = ver ? buf.readUInt32BE(mv + 20) : buf.readUInt32BE(mv + 12);
const mvDur = ver ? Number(buf.readBigUInt64BE(mv + 24)) : buf.readUInt32BE(mv + 16);
console.log(`file      ${process.argv[2].split('/').pop()}  ${(buf.length / 1048576).toFixed(2)} MB`);
console.log(`brands    ${brands.join(' ')}`);
console.log(`duration  ${(mvDur / mvTs).toFixed(3)} s   (movie timescale ${mvTs})`);
let n = 0;
for (const trak of children(moov.start, moov.end)) {
    if (trak.type !== 'trak') continue;
    n++;
    const hdlr = find(['mdia', 'hdlr'], trak.start, trak.end);
    const kind = fourcc(hdlr.start + 8);
    const mdhd = find(['mdia', 'mdhd'], trak.start, trak.end);
    const mv2 = mdhd.start, v2 = buf[mv2];
    const ts = v2 ? buf.readUInt32BE(mv2 + 20) : buf.readUInt32BE(mv2 + 12);
    const dur = v2 ? Number(buf.readBigUInt64BE(mv2 + 24)) : buf.readUInt32BE(mv2 + 16);
    const stsd = find(['mdia', 'minf', 'stbl', 'stsd'], trak.start, trak.end);
    const entry = [...children(stsd.start + 8, stsd.end)][0];
    let extra = '';
    if (kind === 'vide') {
        const w = buf.readUInt16BE(entry.start + 24), h = buf.readUInt16BE(entry.start + 26);
        extra = `${w}x${h}`;
        const avcC = find(['avcC'], entry.start + 78, entry.end);
        if (avcC) extra += `  profile=0x${buf[avcC.start + 1].toString(16)} level=${buf[avcC.start + 3]}`;
    } else if (kind === 'soun') {
        // `>>>`, not `>>`. The sample rate is 16.16 fixed point, so 48000 sits
        // in the high half as 0xBB800000 -- which is negative as a signed
        // int32, and a signed shift sign-extends it. Every 48kHz file this
        // probe has ever read reported -17536Hz.
        extra = `${buf.readUInt16BE(entry.start + 16)}ch `
            + `${buf.readUInt32BE(entry.start + 24) >>> 16}Hz`;
    }
    // exact sample timing
    const stts = find(['mdia', 'minf', 'stbl', 'stts'], trak.start, trak.end);
    const cnt = buf.readUInt32BE(stts.start + 4);
    const runs = [];
    let total = 0, samples = 0;
    for (let i = 0; i < cnt; i++) {
        const c = buf.readUInt32BE(stts.start + 8 + i * 8);
        const d = buf.readUInt32BE(stts.start + 12 + i * 8);
        runs.push([c, d]); total += c * d; samples += c;
    }
    const stss = find(['mdia', 'minf', 'stbl', 'stss'], trak.start, trak.end);
    const keys = stss ? buf.readUInt32BE(stss.start + 4) : null;
    console.log(`\ntrack ${n}  ${kind}  ${entry.type}  ${extra}`);
    console.log(`  timescale ${ts}  duration ${(dur / ts).toFixed(3)}s  samples ${samples}`);
    if (kind === 'vide') {
        console.log(`  container fps ${(samples / (total / ts)).toFixed(3)}`);
        console.log(`  stts runs (count x delta): ${runs.slice(0, 12).map(([c, d]) => `${c}x${d}`).join(' ')}${runs.length > 12 ? ` ... (${runs.length} runs)` : ''}`);
        if (runs.length === 1) console.log(`  -> constant frame duration ${(runs[0][1] / ts * 1000).toFixed(2)} ms`);
        console.log(`  keyframes ${keys}  (1 every ${(samples / keys).toFixed(1)} frames)`);
    }
}
