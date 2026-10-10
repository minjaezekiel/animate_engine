/**
 * Export a render as a numbered PNG sequence in a ZIP.
 *
 * ```js
 * const blob = await renderOffline({ ..., sink: new PngSequenceSink() });
 * // frames/0000.png … frames/2879.png
 * ```
 *
 * # Why this sink exists next to the video ones
 *
 * It is the bottom rung of the export ladder in `docs/04-RENDER-EXPORT.md`
 * and the only one that cannot fail for want of a codec: no WebCodecs, no
 * MediaRecorder, no muxer, no container negotiation. If a browser can draw
 * the film it can export it this way, and `ffmpeg -i frames/%04d.png` from
 * the printed one-liner finishes the job at whatever quality is wanted.
 *
 * It is also the only export a compositor will take. "Render to an image
 * sequence" is the normal hand-off to After Effects, Nuke or Resolve,
 * because it is lossless and frame-addressable.
 *
 * # The canvas encodes its own PNG
 *
 * `toBlob('image/png')` is in every browser and is hardware-accelerated in
 * most. `src/io/png.js` is not used here: it is the Node-side codec and it
 * reaches for `node:zlib`, which is exactly the kind of dependency the
 * browser path must not grow. Two encoders for one format is the right
 * answer when one of them is free.
 *
 * # Memory
 *
 * The sink holds **encoded** PNGs, not frames. A 1080p frame is 8.3 MB of
 * RGBA and a PNG of a cel-shaded frame is a few hundred kilobytes, so
 * 2,880 of them is of the order of a gigabyte rather than 24 -- which is
 * the difference between finishing and not. It is still the largest memory
 * footprint of any sink here, so [`maxFrames`] refuses up front rather
 * than failing at frame 2,000: a render that cannot complete should say so
 * before it starts, not after four minutes.
 */
import { FrameSink } from './FrameSink.js';
import { zip } from '../../io/zip.js';

/** Encode a canvas as PNG bytes, in a window or a worker. */
async function toPng(canvas) {
    if (typeof canvas.convertToBlob === 'function') {        // OffscreenCanvas
        return new Uint8Array(await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer());
    }
    if (typeof canvas.toBlob === 'function') {
        const blob = await new Promise((resolve, reject) => {
            canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob produced nothing'))),
                          'image/png');
        });
        return new Uint8Array(await blob.arrayBuffer());
    }
    throw new Error('PngSequenceSink needs a canvas with toBlob or convertToBlob');
}

export class PngSequenceSink extends FrameSink {
    /**
     * @param {object} [options]
     * @param {string} [options.prefix='frames/'] directory inside the archive
     * @param {number} [options.pad=4] digits in the frame number
     * @param {number} [options.maxFrames=6000]
     *   Refused up front. 6,000 frames is four minutes at 24fps.
     * @param {Function} [options.encode] override, for tests
     */
    constructor({ prefix = 'frames/', pad = 4, maxFrames = 6000, encode = toPng } = {}) {
        super();
        this.prefix = prefix;
        this.pad = pad;
        this.maxFrames = maxFrames;
        this.encode = encode;
        this.entries = [];
        this.config = null;
    }

    async configure(config) {
        if (config?.totalFrames > this.maxFrames) {
            throw new Error(`PngSequenceSink: ${config.totalFrames} frames exceeds maxFrames `
                + `(${this.maxFrames}). A sequence is held in memory until the archive is `
                + 'written; render in parts or raise maxFrames deliberately.');
        }
        this.config = config;
        this.entries = [];
    }

    async writeFrame(canvas, frameIndex) {
        // Encoded immediately and the canvas released: the contract in
        // FrameSink.js is that a sink never retains a frame.
        const data = await this.encode(canvas);
        const name = `${this.prefix}${String(frameIndex).padStart(this.pad, '0')}.png`;
        this.entries.push({ name, data });
    }

    async finish() {
        const fps = this.config?.fps ?? 24;
        // A README beside the frames, because the next step is always the
        // same command and nobody remembers `%04d`.
        this.entries.push({
            name: `${this.prefix}README.txt`,
            data: new TextEncoder().encode(
                `${this.entries.length} frames at ${fps} fps, `
                + `${this.config?.width ?? '?'}x${this.config?.height ?? '?'}.\n\n`
                + `ffmpeg -framerate ${fps} -i %0${this.pad}d.png `
                + '-c:v libx264 -pix_fmt yuv420p out.mp4\n'),
        });
        return zip(this.entries);
    }

    abort() { this.entries = []; }

    /** True wherever a canvas can encode a PNG, which is everywhere. */
    static async available() { return typeof Blob !== 'undefined'; }
}
