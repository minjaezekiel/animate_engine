import { FrameSink } from './FrameSink.js';

/**
 * Records frame metadata and an optional cheap digest, never pixels.
 *
 * This is what makes the whole render loop unit-testable in Node: pair it
 * with a null backend and you can assert that frame N carried the right pose
 * at exactly n/fps seconds, for all 2880 frames, in under a second.
 */
export class MemorySink extends FrameSink {
    constructor({ digest = null } = {}) {
        super();
        this.frames = [];
        this.digest = digest;          // optional (canvas, n) => string
        this.config = null;
    }

    async configure(config) { this.config = config; this.frames = []; }

    async writeFrame(canvas, frameIndex, tSec) {
        this.frames.push({
            frameIndex,
            tSec,
            ...(this.digest ? { digest: this.digest(canvas, frameIndex) } : {}),
        });
    }

    async finish() {
        return { frames: this.frames, count: this.frames.length, config: this.config };
    }
}
