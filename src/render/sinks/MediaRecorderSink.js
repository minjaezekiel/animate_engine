import { FrameSink } from './FrameSink.js';

/**
 * Deterministic-content WebM via captureStream(0) + requestFrame().
 *
 * THE TIMING TRAP, measured rather than assumed: MediaRecorder stamps each
 * frame with the wall-clock moment the track produced it, and there is no API
 * to set a presentation timestamp. A spike feeding 48 frames at 24fps as fast
 * as possible produced a 0.96-second file instead of 2.00s. So frames MUST be
 * paced to the real clock. Content stays frame-exact; the export simply takes
 * as long as the film is long.
 *
 * The same spike came up 74ms short even when paced, because the final frame
 * has no successor to delimit its display period. `finish()` therefore holds
 * the last frame for one extra frame period before stopping.
 *
 * Audio rides along for free: a single AudioBufferSourceNode holding the
 * pre-rendered mix feeds a MediaStreamAudioDestinationNode whose track is
 * added to the same stream. Both tracks share the one real clock, so they are
 * in sync by construction -- no muxer required.
 */
export class MediaRecorderSink extends FrameSink {
    constructor({ mimeType = null, videoBitsPerSecond = 6_000_000, audioContext = null } = {}) {
        super();
        this.preferredMime = mimeType;
        this.videoBitsPerSecond = videoBitsPerSecond;
        this.audioContext = audioContext;
        this.chunks = [];
        this._t0 = 0;
    }

    static async available() {
        return typeof MediaRecorder !== 'undefined'
            && typeof HTMLCanvasElement !== 'undefined'
            && typeof HTMLCanvasElement.prototype.captureStream === 'function';
    }

    static pickMime(preferred) {
        const candidates = [
            preferred,
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp9',
            'video/webm;codecs=vp8,opus',
            'video/webm;codecs=vp8',
            'video/webm',
        ].filter(Boolean);
        for (const m of candidates) {
            if (MediaRecorder.isTypeSupported(m)) return m;
        }
        return '';
    }

    async configure({ fps, totalFrames, canvas, audioBuffer = null }) {
        if (!canvas) throw new Error('MediaRecorderSink: needs the live canvas');
        this.fps = fps;
        this.totalFrames = totalFrames;
        this.frameMs = 1000 / fps;

        const stream = canvas.captureStream(0);          // 0 => we drive every frame
        this.videoTrack = stream.getVideoTracks()[0];
        if (!this.videoTrack?.requestFrame) {
            throw new Error('MediaRecorderSink: captureStream track has no requestFrame()');
        }

        // Attach the pre-rendered audio mix, started with the first frame.
        if (audioBuffer) {
            const ac = this.audioContext
                ?? new (globalThis.AudioContext || globalThis.webkitAudioContext)({
                    sampleRate: audioBuffer.sampleRate,
                });
            this._ownsContext = !this.audioContext;
            this.ac = ac;
            if (ac.state === 'suspended') await ac.resume();
            const dest = ac.createMediaStreamDestination();
            const src = ac.createBufferSource();
            src.buffer = audioBuffer;
            src.connect(dest);
            this._audioSource = src;
            for (const t of dest.stream.getAudioTracks()) stream.addTrack(t);
        }

        const mimeType = MediaRecorderSink.pickMime(this.preferredMime);
        this.recorder = new MediaRecorder(stream, {
            ...(mimeType ? { mimeType } : {}),
            videoBitsPerSecond: this.videoBitsPerSecond,
        });
        this.mimeType = mimeType || 'video/webm';
        this.chunks = [];
        this.recorder.ondataavailable = (e) => { if (e.data?.size) this.chunks.push(e.data); };
        this.recorder.start();
        this._t0 = performance.now();
        this._audioSource?.start();
        return this;
    }

    async writeFrame(canvas, frameIndex) {
        // Pace against an ABSOLUTE deadline, not a per-frame sleep, so a slow
        // frame is absorbed instead of accumulating drift across 2880 frames.
        const due = this._t0 + frameIndex * this.frameMs;
        let late = false;
        for (;;) {
            const remaining = due - performance.now();
            if (remaining <= 0) { late = remaining < -this.frameMs; break; }
            await new Promise((r) => setTimeout(r, remaining > 4 ? remaining - 2 : 0));
        }
        if (late) this.droppedBudget = (this.droppedBudget ?? 0) + 1;
        this.videoTrack.requestFrame();
    }

    async finish() {
        // Hold the final frame for one frame period; without this the last
        // frame has no duration and the file lands ~1/fps short.
        const due = this._t0 + this.totalFrames * this.frameMs;
        for (;;) {
            const remaining = due - performance.now();
            if (remaining <= 0) break;
            await new Promise((r) => setTimeout(r, Math.min(remaining, 20)));
        }
        const stopped = new Promise((r) => { this.recorder.onstop = r; });
        this.recorder.stop();
        await stopped;
        try { this._audioSource?.stop(); } catch { /* already ended */ }
        if (this._ownsContext) { try { await this.ac.close(); } catch { /* ignore */ } }
        return new Blob(this.chunks, { type: this.mimeType });
    }

    abort() {
        try { this.recorder?.stop(); } catch { /* ignore */ }
        try { this._audioSource?.stop(); } catch { /* ignore */ }
    }
}
