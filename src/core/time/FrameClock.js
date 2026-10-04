/**
 * Frame index <-> time. The only place a frame number becomes seconds.
 *
 * Core never reads a wall clock: time enters as an explicit number, and that
 * number comes from here. `timeOf` divides rather than accumulating so there
 * is no float drift at frame 2879 of a two-minute render.
 */
export class FrameClock {
    constructor(fps = 24) {
        if (!(fps > 0)) throw new Error('FrameClock: fps must be positive');
        this.fps = fps;
    }

    timeOf(frameIndex) { return frameIndex / this.fps; }

    /**
     * Frame count for a duration. A 2.0s film at 24fps is 48 frames covering
     * t=0..47/24; the final frame's own display period is the sink's problem,
     * not the clock's.
     */
    count(durationSec) { return Math.max(1, Math.round(durationSec * this.fps)); }

    frameOf(tSec) { return Math.round(tSec * this.fps); }
    get frameDuration() { return 1 / this.fps; }
}
