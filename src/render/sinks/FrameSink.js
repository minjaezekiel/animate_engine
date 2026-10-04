/**
 * FrameSink is the contract every encoder implements.
 *
 *   configure({width,height,fps,totalFrames,audioBuffer|null,codecHint})
 *   writeFrame(canvas, frameIndex, tSec) -> Promise<void>
 *   finish() -> Promise<Blob|object>
 *   abort()
 *
 * The hard rule: writeFrame must CONSUME the frame and release it. A
 * two-minute 1080p render is 23.9 GB of raw RGBA, so a sink that retains
 * frames cannot complete. Any VideoFrame created must be .close()d or the
 * browser's encoder queue stalls.
 */
export class FrameSink {
    async configure() { throw new Error('FrameSink.configure not implemented'); }
    async writeFrame() { throw new Error('FrameSink.writeFrame not implemented'); }
    async finish() { throw new Error('FrameSink.finish not implemented'); }
    abort() {}
    static async available() { return true; }
}
