import {
    ascii, box, concat, descriptor, fixed16, fixed8, fourcc, fullBox,
    i16, u16, u24, u32, u64, u8, zeros, UNITY_MATRIX,
} from './boxes.js';

/**
 * MP4 (ISO base media) muxer for WebCodecs output.
 *
 * `WebCodecsSink` has always been able to encode H.264 and AAC; what it never
 * had was a container to put them in, so `available()` reported false and
 * every render in this repo fell back to the paced MediaRecorder path. This is
 * that container.
 *
 * Three decisions worth knowing:
 *
 * 1. **`moov` is written before `mdat`** ("faststart"), so a player can start
 *    on the first bytes instead of seeking to the end for the sample tables.
 *    That costs a second layout pass -- the chunk offsets depend on the size of
 *    the `moov` that contains them -- which converges because every offset
 *    field is fixed width, so rewriting the values cannot change the length.
 *
 * 2. **Every timestamp is zero.** `mvhd`/`tkhd` creation times are left at 0
 *    rather than set to the wall clock, because this repo asserts that two
 *    renders of one film produce identical output, and a clock in the header
 *    would break that for no gain.
 *
 * 3. **Nothing is retained but the compressed bytes.** Chunks are copied out
 *    and the `EncodedVideoChunk` is released immediately, per the rule in
 *    `FrameSink.js`: 2880 frames of 1080p RGBA would be 23.9 GB.
 *
 * The sample tables are derived from the chunk timestamps rather than assumed
 * from the frame rate, so a dropped or re-timed frame shows up as a real
 * duration instead of silently shifting every later frame.
 */

const SAMPLE_RATES = [96000, 88200, 64000, 48000, 44100, 32000,
                      24000, 22050, 16000, 12000, 11025, 8000, 7350];

/** Media bytes are grouped into chunks of about this long, per track. */
const CHUNK_SECONDS = 0.5;

/** An AAC-LC AudioSpecificConfig, for the case where Chrome does not hand one over. */
function audioSpecificConfig(sampleRate, channels) {
    const idx = SAMPLE_RATES.indexOf(sampleRate);
    if (idx < 0) throw new Error(`Mp4Muxer: AAC does not define a frequency index for ${sampleRate} Hz`);
    // 5 bits object type (2 = AAC-LC), 4 bits frequency index, 4 bits channel config.
    return Uint8Array.of((2 << 3) | (idx >> 1), ((idx & 1) << 7) | (channels << 3));
}

class Track {
    constructor({ id, kind, timescale, defaultDelta }) {
        this.id = id;
        this.kind = kind;
        this.timescale = timescale;
        this.defaultDelta = defaultDelta;
        this.samples = [];          // { data, time, size, key }
        this.config = null;         // avcC or AudioSpecificConfig bytes
        this.reordered = false;
    }

    add(chunk, description) {
        const data = new Uint8Array(chunk.byteLength);
        chunk.copyTo(data);
        const time = Math.round((chunk.timestamp / 1e6) * this.timescale);
        const prev = this.samples[this.samples.length - 1];
        if (prev && time < prev.time) this.reordered = true;
        this.samples.push({ data, time, size: data.length, key: chunk.type !== 'delta' });
        if (description && !this.config) this.config = new Uint8Array(description);
    }

    /** Per-sample durations, from the timestamps; the last one has no successor. */
    deltas() {
        const out = [];
        for (let i = 0; i < this.samples.length; i++) {
            const next = this.samples[i + 1];
            out.push(next ? Math.max(0, next.time - this.samples[i].time)
                          : (out[out.length - 1] ?? this.defaultDelta));
        }
        return out;
    }

    get duration() {
        return this.deltas().reduce((a, b) => a + b, 0);
    }

    get bytes() {
        let n = 0;
        for (const s of this.samples) n += s.size;
        return n;
    }
}

export class Mp4Muxer {
    constructor({ width, height, fps = 24, codec = 'avc1.42001f',
                  audio = null, bitrate = 6_000_000 } = {}) {
        if (!width || !height) throw new Error('Mp4Muxer: width and height are required');
        if (!/^avc1\./.test(codec)) {
            // vp9 and av1 are legal in MP4 but phones and social platforms do
            // not reliably decode them. Failing loudly beats writing a file
            // that looks fine here and will not play anywhere else.
            throw new Error(`Mp4Muxer: expected an avc1.* codec for MP4, got "${codec}"`);
        }
        this.width = width;
        this.height = height;
        this.fps = fps;
        this.codec = codec;
        this.bitrate = bitrate;
        this.audioSpec = audio;

        const timescale = Math.round(fps * 1000) || 24_000;
        this.video = new Track({
            id: 1, kind: 'video', timescale,
            defaultDelta: Math.round(timescale / fps),
        });
        this.audio = audio
            ? new Track({
                id: 2, kind: 'audio', timescale: audio.sampleRate,
                // One AAC access unit is 1024 samples; a real delta replaces
                // this as soon as there are two chunks to subtract.
                defaultDelta: 1024,
            })
            : null;
        /**
         * Samples of encoder lead-in to discard on playback, measured by
         * `aacPriming.js`. Without it the sync probe finds the click 44 ms
         * late -- a full frame at 24 fps.
         */
        this.audioPriming = Math.max(0, Math.round(audio?.priming ?? 0));
        this.finalized = false;
    }

    /** Samples of lead-in to edit out of a track. Only audio is ever primed. */
    _priming(track) {
        if (track.kind !== 'audio') return 0;
        // Never edit out more than there is; a bad measurement should not
        // delete the soundtrack.
        return Math.min(this.audioPriming, Math.max(0, track.duration - track.defaultDelta));
    }

    addVideoChunk(chunk, meta) {
        this.video.add(chunk, meta?.decoderConfig?.description);
    }

    addAudioChunk(chunk, meta) {
        if (!this.audio) return;
        this.audio.add(chunk, meta?.decoderConfig?.description);
    }

    /** The finished file as bytes. `finalize()` wraps this in a Blob. */
    bytes() {
        if (this.finalized) throw new Error('Mp4Muxer: already finalized');
        if (!this.video.samples.length) {
            throw new Error('Mp4Muxer: no video samples -- nothing was encoded');
        }
        if (!this.video.config) {
            throw new Error('Mp4Muxer: the encoder never supplied an avcC description');
        }
        this.finalized = true;

        const tracks = [this.video];
        // A declared-but-empty audio track makes players report a zero
        // duration, so a silent film gets no audio track at all.
        if (this.audio?.samples.length) {
            if (!this.audio.config) {
                this.audio.config = audioSpecificConfig(
                    this.audioSpec.sampleRate, this.audioSpec.channels);
            }
            tracks.push(this.audio);
        }

        const chunks = this._interleave(tracks);
        const payload = tracks.reduce((n, t) => n + t.bytes, 0);
        // Decided before the layout, because promoting stco to co64 changes
        // the size of moov and the two passes would never converge.
        const large = payload + 0x0100_0000 > 0xFFFF_FFFF;
        const mdatHeader = large ? 16 : 8;

        const ftyp = this._ftyp();
        // Pass one measures moov; pass two writes it with real offsets. The
        // offset fields are fixed width, so the length cannot move.
        const sized = this._moov(tracks, chunks, 0, large);
        const mdatStart = ftyp.length + sized.length;
        const moov = this._moov(tracks, chunks, mdatStart + mdatHeader, large);
        if (moov.length !== sized.length) {
            throw new Error('Mp4Muxer: moov changed size between layout passes');
        }

        const header = large
            ? concat(u32(1), fourcc('mdat'), u64(payload + 16))
            : concat(u32(payload + 8), fourcc('mdat'));
        const media = new Uint8Array(payload);
        let at = 0;
        for (const chunk of chunks) {
            for (const s of chunk.samples) { media.set(s.data, at); at += s.size; }
        }
        return concat(ftyp, moov, header, media);
    }

    finalize() {
        return new Blob([this.bytes()], { type: 'video/mp4' });
    }

    /**
     * Group each track's samples into half-second runs and interleave the runs
     * by start time, so a player reading forward always has both tracks to
     * hand. Audio sorts first on a tie because it is the smaller read.
     */
    _interleave(tracks) {
        const groups = [];
        for (const track of tracks) {
            const span = CHUNK_SECONDS * track.timescale;
            let current = null;
            for (const s of track.samples) {
                if (!current || s.time - current.start >= span) {
                    current = { track, start: s.time, startSec: s.time / track.timescale,
                                samples: [], bytes: 0 };
                    groups.push(current);
                }
                current.samples.push(s);
                current.bytes += s.size;
            }
        }
        return groups.sort((a, b) => a.startSec - b.startSec
            || (a.track.kind === 'audio' ? -1 : 1));
    }

    _ftyp() {
        return box('ftyp',
            fourcc('isom'), u32(0x200),
            fourcc('isom'), fourcc('iso2'), fourcc('avc1'), fourcc('mp41'));
    }

    _moov(tracks, chunks, mdatDataStart, large) {
        const MOVIE_TIMESCALE = 1000;
        /**
         * **The picture sets the length of the film.** The audio mix is built
         * to the film's derived duration, but AAC rounds up to whole 1024-
         * sample frames and the encoder flushes a few more, so the audio
         * track runs some tens of milliseconds past the last frame. Reported
         * as the file duration, that disagrees with the duration the compiler
         * derived -- and this repo's whole contract is that a film cannot
         * disagree with itself. The audio edit is clamped to the video
         * instead, which is what `-shortest` does elsewhere.
         */
        const durationSec = this.video.duration / this.video.timescale;
        const movieDuration = Math.round(durationSec * MOVIE_TIMESCALE);
        this._filmSec = durationSec;
        const mvhd = fullBox('mvhd', 0, 0,
            u32(0), u32(0),                      // creation, modification: see the header note
            u32(MOVIE_TIMESCALE), u32(movieDuration),
            fixed16(1),                          // rate
            fixed8(1),                           // volume
            zeros(10),                           // reserved
            UNITY_MATRIX,
            zeros(24),                           // pre_defined
            u32(tracks.length + 1));             // next_track_ID

        // Offsets are assigned in the order the chunks are written, which is
        // the order `_interleave` returned.
        let at = mdatDataStart;
        for (const chunk of chunks) { chunk.offset = at; at += chunk.bytes; }

        return box('moov', mvhd,
            ...tracks.map((t) => this._trak(t, chunks.filter((c) => c.track === t),
                                            MOVIE_TIMESCALE, movieDuration, large)));
    }

    _trak(track, chunks, movieTimescale, movieDuration, large) {
        const isVideo = track.kind === 'video';
        const tkhd = fullBox('tkhd', 0, 3,       // enabled | in movie
            u32(0), u32(0),
            u32(track.id), u32(0),
            u32(Math.round(Math.min((track.duration - this._priming(track)) / track.timescale,
                                    this._filmSec) * movieTimescale)),
            zeros(8),                            // reserved
            i16(0), i16(0),                      // layer, alternate_group
            isVideo ? fixed8(0) : fixed8(1),     // volume
            u16(0),
            UNITY_MATRIX,
            fixed16(isVideo ? this.width : 0),
            fixed16(isVideo ? this.height : 0));

        const mdhd = fullBox('mdhd', 0, 0,
            u32(0), u32(0),
            u32(track.timescale), u32(track.duration),
            u16(0x55c4),                         // language: "und", packed 5 bits each
            u16(0));

        const hdlr = fullBox('hdlr', 0, 0,
            u32(0), fourcc(isVideo ? 'vide' : 'soun'), zeros(12),
            ascii(isVideo ? 'VideoHandler\0' : 'SoundHandler\0'));

        const dinf = box('dinf', box('dref', u32(0), u32(1),
            fullBox('url ', 0, 1)));              // flags 1: the media is in this file

        const header = isVideo
            ? fullBox('vmhd', 0, 1, u16(0), zeros(6))
            : fullBox('smhd', 0, 0, i16(0), u16(0));

        const mdia = box('mdia', mdhd, hdlr,
            box('minf', header, dinf, this._stbl(track, chunks, large)));

        // An edit list is how MP4 says "start playing this many samples in".
        // It is the only place the encoder's priming can be declared, and
        // without it every player starts on the lead-in.
        const priming = this._priming(track);
        const trailing = track.kind === 'audio'
            && (track.duration - priming) / track.timescale > this._filmSec;
        if (!priming && !trailing) return box('trak', tkhd, mdia);
        const presentedSec = Math.min((track.duration - priming) / track.timescale,
                                      this._filmSec);
        const presented = Math.round(presentedSec * movieTimescale);
        const elst = fullBox('elst', 0, 0, u32(1),
            u32(presented), u32(priming), u16(1), u16(0));
        return box('trak', tkhd, box('edts', elst), mdia);
    }

    _stbl(track, chunks, large) {
        const deltas = track.deltas();

        // stts, run-length encoded: consecutive samples that last the same
        // number of ticks collapse into one entry, which for a constant frame
        // rate is a single entry for the whole film.
        const runs = [];
        for (const d of deltas) {
            const last = runs[runs.length - 1];
            if (last && last.delta === d) last.count++;
            else runs.push({ count: 1, delta: d });
        }
        const stts = fullBox('stts', 0, 0, u32(runs.length),
            ...runs.map((r) => concat(u32(r.count), u32(r.delta))));

        const stsz = fullBox('stsz', 0, 0, u32(0), u32(track.samples.length),
            ...track.samples.map((s) => u32(s.size)));

        // stsc maps chunks to how many samples each holds, again run-length
        // encoded by first_chunk.
        const sc = [];
        chunks.forEach((c, i) => {
            const last = sc[sc.length - 1];
            if (last && last.per === c.samples.length) return;
            sc.push({ first: i + 1, per: c.samples.length });
        });
        const stsc = fullBox('stsc', 0, 0, u32(sc.length),
            ...sc.map((e) => concat(u32(e.first), u32(e.per), u32(1))));

        const stco = large
            ? fullBox('co64', 0, 0, u32(chunks.length), ...chunks.map((c) => u64(c.offset)))
            : fullBox('stco', 0, 0, u32(chunks.length), ...chunks.map((c) => u32(c.offset)));

        const parts = [this._stsd(track), stts];

        // Audio samples are all sync samples, and an absent stss says exactly
        // that. For video, list the key frames.
        if (track.kind === 'video') {
            const keys = [];
            track.samples.forEach((s, i) => { if (s.key) keys.push(i + 1); });
            parts.push(fullBox('stss', 0, 0, u32(keys.length), ...keys.map(u32)));
        }

        // Only needed if the encoder handed back reordered frames, which
        // Chrome's AVC encoder does not do today -- but writing nothing when
        // it does would shuffle the film, so it is detected rather than assumed.
        if (track.reordered) {
            const sorted = [...track.samples].map((s) => s.time).sort((a, b) => a - b);
            parts.push(fullBox('ctts', 1, 0, u32(track.samples.length),
                ...track.samples.map((s, i) => concat(u32(1), u32(s.time - sorted[i])))));
        }

        parts.push(stsc, stsz, stco);
        return box('stbl', ...parts);
    }

    _stsd(track) {
        if (track.kind === 'video') {
            const name = 'jirex';
            const compressor = concat(u8(name.length), ascii(name), zeros(31 - name.length));
            const avc1 = box('avc1',
                zeros(6), u16(1),                // reserved, data_reference_index
                zeros(16),                       // pre_defined, reserved
                u16(this.width), u16(this.height),
                u32(0x0048_0000), u32(0x0048_0000),  // 72 dpi, horizontal and vertical
                u32(0), u16(1),                  // reserved, frame_count
                compressor,
                u16(0x0018), i16(-1),            // depth, pre_defined
                box('avcC', track.config));
            return fullBox('stsd', 0, 0, u32(1), avc1);
        }

        const { channels, sampleRate } = this.audioSpec;
        const esds = fullBox('esds', 0, 0,
            descriptor(0x03,
                u16(track.id), u8(0),
                descriptor(0x04,
                    u8(0x40),                    // Audio ISO/IEC 14496-3
                    u8(0x15),                    // streamType 5 (audio), not upstream
                    u24(0),                      // bufferSizeDB
                    u32(this.bitrate), u32(this.bitrate),
                    descriptor(0x05, track.config)),
                descriptor(0x06, u8(0x02))));
        const mp4a = box('mp4a',
            zeros(6), u16(1),
            zeros(8),                            // reserved
            u16(channels), u16(16),              // channelcount, samplesize
            u16(0), u16(0),                      // pre_defined, reserved
            u32(sampleRate * 0x10000),           // 16.16, which 48000 fits inside
            esds);
        return fullBox('stsd', 0, 0, u32(1), mp4a);
    }
}

/**
 * The factory `WebCodecsSink` expects. Hand it to `new FilmStudio({ muxerFactory })`
 * or let `studio.js` install it as the default.
 */
export async function mp4MuxerFactory({ width, height, fps, codec, audio }) {
    return new Mp4Muxer({ width, height, fps, codec, audio });
}
