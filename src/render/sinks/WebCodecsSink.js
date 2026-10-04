import { FrameSink } from './FrameSink.js';

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
export class WebCodecsSink extends FrameSink {
    constructor({ muxerFactory = null, codec = null, bitrate = 6_000_000, keyFrameEvery = 48 } = {}) {
        super();
        this.muxerFactory = muxerFactory;
        this.codec = codec;
        this.bitrate = bitrate;
        this.keyFrameEvery = keyFrameEvery;
    }

    static async available({ muxerFactory = null } = {}) {
        if (typeof VideoEncoder === 'undefined' || typeof VideoFrame === 'undefined') return false;
        if (!muxerFactory) return false;
        return true;
    }

    /** First codec string the platform will actually accept at this size. */
    static async pickCodec(width, height, preferred) {
        const candidates = [preferred, 'avc1.4d0028', 'avc1.42001f', 'vp09.00.10.08', 'vp8']
            .filter(Boolean);
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

        const codec = await WebCodecsSink.pickCodec(width, height, this.codec);
        if (!codec) throw new Error('WebCodecsSink: no supported video codec');
        this.chosenCodec = codec;

        this.muxer = await this.muxerFactory({
            width, height, fps, codec,
            audio: audioBuffer
                ? { sampleRate: audioBuffer.sampleRate, channels: audioBuffer.numberOfChannels }
                : null,
        });

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
    async _encodeAudio(buffer) {
        if (typeof AudioEncoder === 'undefined' || !this.muxer.addAudioChunk) return;
        const channels = buffer.numberOfChannels;
        const sampleRate = buffer.sampleRate;
        const encoder = new AudioEncoder({
            output: (chunk, meta) => this.muxer.addAudioChunk(chunk, meta),
            error: (e) => { this._error = e; },
        });
        let config = { codec: 'mp4a.40.2', sampleRate, numberOfChannels: channels, bitrate: 128_000 };
        const ok = await AudioEncoder.isConfigSupported(config).catch(() => ({ supported: false }));
        if (!ok.supported) {
            config = { codec: 'opus', sampleRate, numberOfChannels: channels, bitrate: 128_000 };
            const ok2 = await AudioEncoder.isConfigSupported(config).catch(() => ({ supported: false }));
            if (!ok2.supported) { encoder.close(); return; }
        }
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
