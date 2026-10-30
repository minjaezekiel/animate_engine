import { FrameSink } from './FrameSink.js';
import { measureAudioPriming } from '../mux/aacPriming.js';

/**
 * WebCodecs encoder: exact timestamps, faster than real time.
 *
 * Unlike MediaRecorder, VideoFrame carries an explicit `timestamp`, so 2880
 * frames spaced 41667us apart is exactly 120.000s no matter how long encoding
 * takes. That removes the pacing requirement and the hidden-tab hazard.
 *
 * The muxer is INJECTED, not imported: no hard CDN dependency lives in the
 * engine. Pass a factory and this sink activates; omit it and
 * `available()` reports false so the renderer falls back to MediaRecorder.
 * A factory must return { addVideoChunk, addAudioChunk?, finalize }.
 */
/** Candidate codecs per container, best first. MP4 means H.264 and nothing else. */
const CODECS = {
    mp4: ['avc1.4d0028', 'avc1.42002a', 'avc1.42001f'],
    webm: ['vp09.00.10.08', 'vp8'],
};

export class WebCodecsSink extends FrameSink {
    constructor({ muxerFactory = null, codec = null, container = 'mp4',
                  bitrate = 6_000_000, keyFrameEvery = 48 } = {}) {
        super();
        this.muxerFactory = muxerFactory;
        this.codec = codec;
        this.container = container;
        this.bitrate = bitrate;
        this.keyFrameEvery = keyFrameEvery;
    }

    /**
     * A muxer alone is no longer enough to answer this. An MP4 the platform
     * cannot encode H.264 for is a file that plays nowhere, so the probe runs
     * here -- while the caller can still fall back -- rather than throwing
     * from `configure` after the render has started.
     */
    static async available({ muxerFactory = null, container = 'mp4',
                             width = 1280, height = 720 } = {}) {
        if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return false;
        if (!muxerFactory) return false;
        return await WebCodecsSink.pickCodec(width, height, null, container) !== null;
    }

    /** First codec string the platform will accept at this size, for this container. */
    static async pickCodec(width, height, preferred, container = 'mp4') {
        const allowed = CODECS[container] ?? CODECS.mp4;
        // A caller's preference is honoured only if the container can carry it.
        const candidates = [preferred, ...allowed]
            .filter((c) => c && allowed.some((a) => a.split('.')[0] === c.split('.')[0]));
        for (const codec of candidates) {
            try {
                const { supported } = await VideoEncoder.isConfigSupported({
                    codec, width, height, bitrate: 6_000_000, framerate: 24,
                });
                if (supported) return codec;
            } catch { /* try the next */ }
        }
        return null;
    }

    async configure({ width, height, fps, totalFrames, audioBuffer = null }) {
        if (!this.muxerFactory) throw new Error('WebCodecsSink: no muxer provided');
        this.fps = fps;
        this.totalFrames = totalFrames;
        this.width = width;
        this.height = height;

        const codec = await WebCodecsSink.pickCodec(width, height, this.codec, this.container);
        if (!codec) {
            throw new Error(`WebCodecsSink: no supported ${this.container} video codec `
                + `at ${width}x${height}`);
        }
        this.chosenCodec = codec;

        // Measured before the muxer is built, because the container has to
        // declare the encoder's lead-in in its sample tables and cannot be
        // told about it afterwards.
        const audio = audioBuffer
            ? { sampleRate: audioBuffer.sampleRate, channels: audioBuffer.numberOfChannels }
            : null;
        if (audio) {
            this.audioCodec = await WebCodecsSink.pickAudioCodec();
            audio.priming = this.audioCodec
                ? await measureAudioPriming({ codec: this.audioCodec, ...audio,
                                              channels: audio.channels })
                : 0;
        }
        this.muxer = await this.muxerFactory({ width, height, fps, codec, audio });

        this.encoder = new VideoEncoder({
            output: (chunk, meta) => this.muxer.addVideoChunk(chunk, meta),
            error: (e) => { this._error = e; },
        });
        this.encoder.configure({
            codec, width, height, bitrate: this.bitrate, framerate: fps,
            latencyMode: 'quality',
        });

        if (audioBuffer) await this._encodeAudio(audioBuffer);
        return this;
    }

    /**
     * Audio is encoded up front from the pre-rendered mix. It is already a
     * complete, sample-exact buffer, so there is nothing to interleave --
     * the muxer orders by timestamp.
     */
    /**
     * AAC first, because it is what MP4 carries everywhere. Chosen in one
     * place so the priming measurement and the real encode cannot disagree
     * about which codec they are talking about.
     */
    static async pickAudioCodec() {
        if (typeof AudioEncoder === 'undefined') return null;
        for (const codec of ['mp4a.40.2', 'opus']) {
            const ok = await AudioEncoder.isConfigSupported({
                codec, sampleRate: 48_000, numberOfChannels: 2, bitrate: 128_000,
            }).catch(() => ({ supported: false }));
            if (ok.supported) return codec;
        }
        return null;
    }

    async _encodeAudio(buffer) {
        if (typeof AudioEncoder === 'undefined' || !this.muxer.addAudioChunk) return;
        const channels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const codec = this.audioCodec ?? await WebCodecsSink.pickAudioCodec();
        if (!codec) return;
        const encoder = new AudioEncoder({
            output: (chunk, meta) => this.muxer.addAudioChunk(chunk, meta),
            error: (e) => { this._error = e; },
        });
        const config = { codec, sampleRate, numberOfChannels: channels, bitrate: 128_000 };
        encoder.configure(config);

        // Interleave into chunks of ~1024 frames per AudioData.
        const CH = 1024;
        const planes = [];
        for (let c = 0; c < channels; c++) planes.push(buffer.getChannelData(c));
        for (let offset = 0; offset < buffer.length; offset += CH) {
            const n = Math.min(CH, buffer.length - offset);
            const inter = new Float32Array(n * channels);
            for (let i = 0; i < n; i++) {
                for (let c = 0; c < channels; c++) inter[i * channels + c] = planes[c][offset + i];
            }
            const data = new AudioData({
                format: 'f32', sampleRate, numberOfFrames: n, numberOfChannels: channels,
                timestamp: Math.round((offset / sampleRate) * 1e6), data: inter,
            });
            encoder.encode(data);
            data.close();
        }
        await encoder.flush();
        encoder.close();
    }

    async writeFrame(canvas, frameIndex) {
        if (this._error) throw this._error;
        // Back-pressure: let the encoder drain so the queue cannot grow
        // unbounded across 2880 frames.
        while (this.encoder.encodeQueueSize > 8) {
            await new Promise((r) => setTimeout(r, 1));
        }
        const frame = new VideoFrame(canvas, {
            timestamp: Math.round((frameIndex / this.fps) * 1e6),
            duration: Math.round(1e6 / this.fps),
        });
        this.encoder.encode(frame, { keyFrame: frameIndex % this.keyFrameEvery === 0 });
        frame.close();                      // mandatory: otherwise the queue stalls
    }

    async finish() {
        await this.encoder.flush();
        this.encoder.close();
        return this.muxer.finalize();
    }

    abort() {
        try { this.encoder?.close(); } catch { /* ignore */ }
    }
}
