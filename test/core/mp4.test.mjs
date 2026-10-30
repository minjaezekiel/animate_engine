import test from 'node:test';
import assert from 'node:assert/strict';

import { Mp4Muxer } from '../../src/render/mux/Mp4Muxer.js';
import { box, descriptor, fourcc, u32 } from '../../src/render/mux/boxes.js';

/**
 * The muxer writes bytes, so the tests read bytes back. Asserting on the
 * muxer's own fields would only prove it agrees with itself; parsing the
 * container is the only way to find a wrong box length or a sample offset
 * pointing into the middle of a frame.
 */

/** Walk the boxes at one level. Returns [{type, start, size, body}]. */
function parse(bytes, start = 0, end = bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const out = [];
    let at = start;
    while (at + 8 <= end) {
        let size = view.getUint32(at);
        const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8));
        let headerLen = 8;
        if (size === 1) {
            size = Number(view.getBigUint64(at + 8));
            headerLen = 16;
        } else if (size === 0) {
            size = end - at;
        }
        assert.ok(size >= headerLen, `box ${type} at ${at} has size ${size}`);
        assert.ok(at + size <= end, `box ${type} at ${at} overruns its parent`);
        out.push({ type, start: at, size, bodyStart: at + headerLen,
                   body: bytes.subarray(at + headerLen, at + size) });
        at += size;
    }
    assert.equal(at, end, 'boxes must tile their parent exactly');
    return out;
}

const find = (boxes, type) => boxes.find((b) => b.type === type);

/** Descend a path like 'moov/trak/mdia/minf/stbl'. */
function at(bytes, path) {
    let boxes = parse(bytes);
    let node = null;
    for (const want of path.split('/')) {
        const matches = boxes.filter((b) => b.type === want);
        assert.ok(matches.length, `no ${want} box in ${path}`);
        node = matches[0];
        boxes = parse(bytes, node.bodyStart, node.start + node.size);
    }
    return { node, children: boxes };
}

/** Every box the stbl of track `n` holds, keyed by type. */
function stbl(bytes, trackIndex = 0) {
    const moov = find(parse(bytes), 'moov');
    const inner = parse(bytes, moov.bodyStart, moov.start + moov.size);
    const traks = inner.filter((b) => b.type === 'trak');
    const trak = traks[trackIndex];
    assert.ok(trak, `no track ${trackIndex}`);
    let boxes = parse(bytes, trak.bodyStart, trak.start + trak.size);
    for (const step of ['mdia', 'minf', 'stbl']) {
        const n = find(boxes, step);
        assert.ok(n, `no ${step}`);
        boxes = parse(bytes, n.bodyStart, n.start + n.size);
    }
    const map = {};
    for (const b of boxes) map[b.type] = b;
    return { map, trackCount: traks.length };
}

const dv = (b) => new DataView(b.buffer, b.byteOffset, b.byteLength);

/** A stand-in for an EncodedVideoChunk: the muxer only uses this surface. */
function chunk(timestamp, size, type = 'delta', fill = 0x41) {
    const data = new Uint8Array(size).fill(fill);
    return { timestamp, byteLength: size, type, copyTo: (dest) => dest.set(data) };
}

const AVCC = Uint8Array.from([1, 0x42, 0x00, 0x1f, 0xff, 0xe1, 0x00, 0x04,
                              0x67, 0x42, 0x00, 0x1f, 0x01, 0x00, 0x04,
                              0x68, 0xce, 0x06, 0xe2]);
const videoMeta = { decoderConfig: { description: AVCC } };

/** `frames` video samples at `fps`, key every `keyEvery`. */
function makeVideo(frames, { fps = 24, keyEvery = 48, width = 1080, height = 1920 } = {}) {
    const muxer = new Mp4Muxer({ width, height, fps, codec: 'avc1.42001f' });
    for (let i = 0; i < frames; i++) {
        muxer.addVideoChunk(
            chunk(Math.round((i / fps) * 1e6), i % keyEvery === 0 ? 900 : 300,
                  i % keyEvery === 0 ? 'key' : 'delta'),
            i === 0 ? videoMeta : {});
    }
    return muxer;
}

test('writes a parseable file: ftyp, moov before mdat, and nothing else', () => {
    const bytes = makeVideo(48).bytes();
    const top = parse(bytes);
    assert.deepEqual(top.map((b) => b.type), ['ftyp', 'moov', 'mdat'],
        'moov must precede mdat so the file is playable while downloading');
});

test('ftyp declares brands a phone will accept', () => {
    const bytes = makeVideo(4).bytes();
    const ftyp = find(parse(bytes), 'ftyp');
    const brands = [];
    for (let i = 0; i + 4 <= ftyp.body.length; i += 4) {
        brands.push(String.fromCharCode(...ftyp.body.subarray(i, i + 4)));
    }
    assert.equal(brands[0], 'isom', 'major brand');
    assert.ok(brands.includes('avc1'));
    assert.ok(brands.includes('mp41'));
});

test('a silent film gets one track, not an empty audio track', () => {
    const bytes = makeVideo(24).bytes();
    assert.equal(stbl(bytes).trackCount, 1);
});

test('a film with audio gets two tracks', () => {
    const muxer = new Mp4Muxer({
        width: 1080, height: 1920, fps: 24, codec: 'avc1.42001f',
        audio: { sampleRate: 48000, channels: 2 },
    });
    for (let i = 0; i < 48; i++) {
        muxer.addVideoChunk(chunk(Math.round((i / 24) * 1e6), 300, i ? 'delta' : 'key'),
            i === 0 ? videoMeta : {});
    }
    // 1024 samples per AAC frame at 48 kHz = 21333 us.
    for (let i = 0; i < 94; i++) {
        muxer.addAudioChunk(chunk(Math.round(i * (1024 / 48000) * 1e6), 200, 'key'),
            i === 0 ? { decoderConfig: { description: Uint8Array.of(0x11, 0x90) } } : {});
    }
    const bytes = muxer.bytes();
    const { trackCount, map } = stbl(bytes, 1);
    assert.equal(trackCount, 2);
    assert.ok(map.stsd, 'audio track has a sample description');
    assert.equal(map.stss, undefined, 'audio needs no sync sample table');
    assert.equal(dv(map.stsz.body).getUint32(8), 94, 'all audio samples present');
});

test('audio declared but never encoded leaves no audio track', () => {
    const muxer = new Mp4Muxer({
        width: 640, height: 360, fps: 24, codec: 'avc1.42001f',
        audio: { sampleRate: 48000, channels: 2 },
    });
    for (let i = 0; i < 10; i++) {
        muxer.addVideoChunk(chunk(Math.round((i / 24) * 1e6), 100, i ? 'delta' : 'key'),
            i === 0 ? videoMeta : {});
    }
    assert.equal(stbl(muxer.bytes()).trackCount, 1,
        'an empty track makes players report a zero duration');
});

test('stts sums to the exact film duration and collapses to one entry at constant fps', () => {
    const frames = 240;                       // 10 s at 24 fps
    const bytes = makeVideo(frames).bytes();
    const { map } = stbl(bytes);
    const v = dv(map.stts.body);
    const entries = v.getUint32(4);
    assert.equal(entries, 1, 'constant frame rate is one run-length entry');
    const count = v.getUint32(8);
    const delta = v.getUint32(12);
    assert.equal(count, frames);
    // timescale is fps*1000 = 24000, so one frame lasts exactly 1000 ticks.
    assert.equal(delta, 1000);
    assert.equal(count * delta, 240_000, '10.000 s, exactly');

    const mdhd = at(bytes, 'moov/trak/mdia').children.find((b) => b.type === 'mdhd');
    const m = dv(mdhd.body);
    assert.equal(m.getUint32(12), 24_000, 'timescale');
    assert.equal(m.getUint32(16), 240_000, 'mdhd duration matches stts');
});

test('stss lists exactly the key frames', () => {
    const bytes = makeVideo(100, { keyEvery: 24 }).bytes();
    const { map } = stbl(bytes);
    const v = dv(map.stss.body);
    const n = v.getUint32(4);
    const got = [];
    for (let i = 0; i < n; i++) got.push(v.getUint32(8 + i * 4));
    assert.deepEqual(got, [1, 25, 49, 73, 97], 'sample numbers are 1-based');
});

test('stco offsets land on real sample boundaries, and the first is inside mdat', () => {
    const frames = 120;
    const muxer = makeVideo(frames, { keyEvery: 24 });
    const bytes = muxer.bytes();
    const mdat = find(parse(bytes), 'mdat');
    const { map } = stbl(bytes);

    const sizes = [];
    const sv = dv(map.stsz.body);
    for (let i = 0; i < sv.getUint32(8); i++) sizes.push(sv.getUint32(12 + i * 4));
    assert.equal(sizes.length, frames);

    const offsets = [];
    const ov = dv(map.stco.body);
    for (let i = 0; i < ov.getUint32(4); i++) offsets.push(ov.getUint32(8 + i * 4));
    assert.ok(offsets.length > 1, 'a 5 s film should be several chunks');
    assert.equal(offsets[0], mdat.bodyStart, 'first chunk starts at the mdat payload');

    // Walk the stsc table and confirm every chunk offset is where the running
    // byte total says it should be. This is the check that catches a moov
    // whose size changed between the two layout passes.
    const cv = dv(map.stsc.body);
    const runs = [];
    for (let i = 0; i < cv.getUint32(4); i++) {
        runs.push({ first: cv.getUint32(8 + i * 12), per: cv.getUint32(12 + i * 12) });
    }
    const perChunk = offsets.map((_, i) => {
        let per = runs[0].per;
        for (const r of runs) if (r.first <= i + 1) per = r.per;
        return per;
    });
    assert.equal(perChunk.reduce((a, b) => a + b, 0), frames,
        'stsc must account for every sample exactly once');

    let cursor = mdat.bodyStart;
    let sample = 0;
    offsets.forEach((offset, i) => {
        assert.equal(offset, cursor, `chunk ${i} offset`);
        for (let k = 0; k < perChunk[i]; k++) cursor += sizes[sample++];
    });
    assert.equal(cursor, mdat.start + mdat.size, 'mdat holds exactly the samples');
});

test('mdat actually contains the bytes that were handed in', () => {
    const muxer = new Mp4Muxer({ width: 320, height: 240, fps: 24, codec: 'avc1.42001f' });
    muxer.addVideoChunk(chunk(0, 5, 'key', 0xaa), videoMeta);
    muxer.addVideoChunk(chunk(41667, 3, 'delta', 0xbb), {});
    const bytes = muxer.bytes();
    const mdat = find(parse(bytes), 'mdat');
    assert.deepEqual([...mdat.body], [0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xbb, 0xbb, 0xbb]);
});

test('the avcC the encoder supplied is carried into stsd verbatim', () => {
    const bytes = makeVideo(4).bytes();
    const { map } = stbl(bytes);
    const stsdInner = parse(bytes, map.stsd.bodyStart + 8, map.stsd.start + map.stsd.size);
    const avc1 = find(stsdInner, 'avc1');
    assert.ok(avc1, 'sample entry is avc1');
    const w = dv(avc1.body).getUint16(24);
    const h = dv(avc1.body).getUint16(26);
    assert.equal(w, 1080);
    assert.equal(h, 1920);
    const avcC = find(parse(bytes, avc1.bodyStart + 78, avc1.start + avc1.size), 'avcC');
    assert.ok(avcC, 'avcC present');
    assert.deepEqual([...avcC.body], [...AVCC]);
});

test('tkhd carries the display size as 16.16 fixed point', () => {
    const bytes = makeVideo(4).bytes();
    const tkhd = at(bytes, 'moov/trak').children.find((b) => b.type === 'tkhd');
    const v = dv(tkhd.body);
    assert.equal(v.getUint32(76) / 0x10000, 1080);
    assert.equal(v.getUint32(80) / 0x10000, 1920);
});

test('mvhd duration matches the video, in the movie timescale', () => {
    const bytes = makeVideo(240).bytes();
    const mvhd = at(bytes, 'moov').children.find((b) => b.type === 'mvhd');
    const v = dv(mvhd.body);
    assert.equal(v.getUint32(12), 1000, 'movie timescale');
    assert.equal(v.getUint32(16), 10_000, '10.000 s');
    assert.equal(v.getUint32(96), 2, 'next_track_ID is one past the last track');
});

test('headers carry no wall clock, so two muxings are byte-identical', () => {
    const a = makeVideo(48).bytes();
    const b = makeVideo(48).bytes();
    assert.deepEqual([...a], [...b],
        'this repo asserts deterministic renders; a timestamp would break it');
});

test('a variable frame duration produces several stts entries, not a smeared one', () => {
    const muxer = new Mp4Muxer({ width: 320, height: 240, fps: 24, codec: 'avc1.42001f' });
    // Two frames at 24 fps, then one held twice as long.
    for (const [i, us] of [0, 41667, 83333, 166667].entries()) {
        muxer.addVideoChunk(chunk(us, 100, i === 0 ? 'key' : 'delta'),
            i === 0 ? videoMeta : {});
    }
    const { map } = stbl(muxer.bytes());
    const v = dv(map.stts.body);
    assert.equal(v.getUint32(4), 2, 'one run of 1000, one of 2000');
    assert.equal(v.getUint32(8), 2);
    assert.equal(v.getUint32(12), 1000);
    assert.equal(v.getUint32(16), 2);
    assert.equal(v.getUint32(20), 2000);
});

test('reordered timestamps produce a ctts instead of a shuffled film', () => {
    const muxer = new Mp4Muxer({ width: 320, height: 240, fps: 24, codec: 'avc1.42001f' });
    muxer.addVideoChunk(chunk(0, 100, 'key'), videoMeta);
    muxer.addVideoChunk(chunk(83333, 100, 'delta'), {});     // out of order
    muxer.addVideoChunk(chunk(41667, 100, 'delta'), {});
    const { map } = stbl(muxer.bytes());
    assert.ok(map.ctts, 'composition offsets are required when pts != dts order');
});

test('refuses a codec MP4 cannot usefully carry', () => {
    assert.throws(() => new Mp4Muxer({ width: 16, height: 16, codec: 'vp09.00.10.08' }),
        /avc1/);
});

test('refuses to write a file with no samples or no avcC', () => {
    assert.throws(() => new Mp4Muxer({ width: 16, height: 16, codec: 'avc1.42001f' }).bytes(),
        /no video samples/);
    const muxer = new Mp4Muxer({ width: 16, height: 16, codec: 'avc1.42001f' });
    muxer.addVideoChunk(chunk(0, 10, 'key'), {});            // no description
    assert.throws(() => muxer.bytes(), /avcC/);
});

test('boxes: a four-character code is enforced', () => {
    assert.throws(() => fourcc('mp4'), /4 characters/);
    assert.deepEqual([...box('free')], [0, 0, 0, 8, 102, 114, 101, 101]);
});

test('boxes: descriptor lengths use the 7-bit continuation form', () => {
    const short = descriptor(0x05, new Uint8Array(3));
    assert.deepEqual([...short.subarray(0, 2)], [0x05, 3]);
    const long = descriptor(0x05, new Uint8Array(200));
    assert.deepEqual([...long.subarray(0, 3)], [0x05, 0x81, 0x48]);
    assert.equal(long.length, 3 + 200);
});

test('boxes: u32 handles values above 2^31', () => {
    assert.deepEqual([...u32(0xdead_beef)], [0xde, 0xad, 0xbe, 0xef]);
});

/**
 * Encoder priming. Measured on Chrome 156: the AAC encoder prepends 2112
 * samples, which the sync probe saw as the click landing 44 ms late. The
 * container declares that lead-in with an edit list, so these tests pin the
 * edit list rather than the magic number.
 */
function withAudio({ priming, audioFrames = 94, videoFrames = 48 } = {}) {
    const muxer = new Mp4Muxer({
        width: 640, height: 360, fps: 24, codec: 'avc1.42001f',
        audio: { sampleRate: 48000, channels: 2, priming },
    });
    for (let i = 0; i < videoFrames; i++) {
        muxer.addVideoChunk(chunk(Math.round((i / 24) * 1e6), 300, i ? 'delta' : 'key'),
            i === 0 ? videoMeta : {});
    }
    for (let i = 0; i < audioFrames; i++) {
        muxer.addAudioChunk(chunk(Math.round(i * (1024 / 48000) * 1e6), 200, 'key'),
            i === 0 ? { decoderConfig: { description: Uint8Array.of(0x11, 0x90) } } : {});
    }
    return muxer.bytes();
}

/** The elst of track `n`, decoded. */
function editList(bytes, trackIndex) {
    const moov = find(parse(bytes), 'moov');
    const trak = parse(bytes, moov.bodyStart, moov.start + moov.size)
        .filter((b) => b.type === 'trak')[trackIndex];
    const edts = parse(bytes, trak.bodyStart, trak.start + trak.size)
        .find((b) => b.type === 'edts');
    if (!edts) return null;
    const elst = parse(bytes, edts.bodyStart, edts.start + edts.size)
        .find((b) => b.type === 'elst');
    const v = dv(elst.body);
    return { entries: v.getUint32(4), segmentDuration: v.getUint32(8),
             mediaTime: v.getUint32(12), rate: v.getUint16(16) };
}

test('a primed audio track carries an edit list that skips the lead-in', () => {
    const bytes = withAudio({ priming: 2112 });
    const edit = editList(bytes, 1);
    assert.ok(edit, 'audio track needs an edts/elst');
    assert.equal(edit.entries, 1);
    assert.equal(edit.mediaTime, 2112, 'media_time is the priming, in media timescale');
    assert.equal(edit.rate, 1, 'normal playback rate');
    // 94 AAC frames = 96256 samples; less 2112 primed = 94144 = 1961.33 ms.
    assert.equal(edit.segmentDuration, 1961);
});

test('the video track gets no edit list, because H.264 has no priming', () => {
    assert.equal(editList(withAudio({ priming: 2112 }), 0), null);
});

test('unmeasurable priming writes no edit list rather than a wrong one', () => {
    // 90 AAC frames = 1.92 s, inside the 2.00 s of video, so there is
    // nothing to declare and nothing to trim.
    assert.equal(editList(withAudio({ priming: 0, audioFrames: 90 }), 1), null);
});

test('audio running past the last frame is trimmed to the picture', () => {
    // 94 AAC frames = 2.0053 s against 48 frames = 2.000 s of video. AAC
    // rounds up to whole frames, so this overhang is normal and must not
    // become the film's reported duration.
    const bytes = withAudio({ priming: 0, audioFrames: 94 });
    const edit = editList(bytes, 1);
    assert.ok(edit, 'a trailing overhang needs an edit list of its own');
    assert.equal(edit.mediaTime, 0, 'nothing primed, so nothing skipped');
    assert.equal(edit.segmentDuration, 2000, 'clamped to the video duration');
    const mvhd = at(bytes, 'moov').children.find((b) => b.type === 'mvhd');
    assert.equal(dv(mvhd.body).getUint32(16), 2000);
});

test('priming is clamped so a bad measurement cannot delete the soundtrack', () => {
    // Far more priming than there is audio.
    const bytes = withAudio({ priming: 10_000_000, audioFrames: 10 });
    const edit = editList(bytes, 1);
    assert.ok(edit.mediaTime < 10 * 1024, 'cannot edit out more than exists');
    assert.ok(edit.segmentDuration > 0, 'something must remain to play');
});

test('movie duration counts the picture, not the primed audio tail', () => {
    // 48 video frames = 2.000 s. 94 AAC frames = 2.005 s, less 44 ms priming.
    const bytes = withAudio({ priming: 2112 });
    const mvhd = at(bytes, 'moov').children.find((b) => b.type === 'mvhd');
    assert.equal(dv(mvhd.body).getUint32(16), 2000,
        'the audio lead-in must not make the film longer than its video');
});

test('adding an edit list does not break the two-pass chunk offsets', () => {
    const bytes = withAudio({ priming: 2112, audioFrames: 300, videoFrames: 150 });
    const mdat = find(parse(bytes), 'mdat');
    for (const track of [0, 1]) {
        const { map } = stbl(bytes, track);
        const first = dv(map.stco.body).getUint32(8);
        assert.ok(first >= mdat.bodyStart && first < mdat.start + mdat.size,
            `track ${track} first chunk offset must point inside mdat`);
    }
});
