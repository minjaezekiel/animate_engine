/**
 * The canvas side of subframe motion blur.
 *
 * The arithmetic -- which instants to render, and how to average them in
 * linear light -- is in
 * [`core/motion/motionBlur.js`](../core/motion/motionBlur.js). This is the
 * part that has to touch a canvas, and it exists separately for the usual
 * reason: that one is assertable in Node and this one is not.
 *
 * # Why the result is written BACK onto the backend's own canvas
 *
 * The obvious design accumulates into a canvas of its own and hands that to
 * the sink. It does not work, and the reason is worth stating because it is
 * invisible until something breaks:
 *
 *   `MediaRecorderSink.configure` calls `canvas.captureStream(0)` on the
 *   canvas it is given and drives every frame from that ONE object. Hand it a
 *   different canvas at `writeFrame` time and the recording is of the
 *   original -- unblurred, or blank.
 *
 * So the averaged pixels are `putImageData`-ed back onto `backend.canvas()`,
 * and every sink keeps seeing exactly the surface it was configured with.
 *
 * # Which means the output surface must be a 2D canvas
 *
 * `putImageData` needs a 2D context. The 2D path always has one. The 3D path
 * renders into a WebGL canvas and only has a 2D composite when something
 * asked for one -- an overlay, a transition. So motion blur asks for one too,
 * and `film3d.html` includes it in that condition. If it is somehow still
 * absent this throws with that sentence in it, rather than rendering sharp
 * and saying nothing.
 */
import {
    accumulateInto, buildDecodeTable, resolveAccumulator, subframeTimes,
} from '../core/motion/motionBlur.js';

/**
 * An accumulator bound to one backend and one output size.
 *
 * Buffers are allocated once, not per frame: at 1920x1080 the float
 * accumulator alone is 33 MB, and churning that 1,574 times is a lot of
 * garbage to make for a film that is only 65 seconds long.
 */
export function createBlurAccumulator({ backend, width, height, motionBlur, fps }) {
    const canvas = backend.canvas?.();
    if (!canvas) throw new Error('motion blur needs an output canvas');
    const ctx = canvas.getContext?.('2d', { willReadFrequently: true });
    if (!ctx) {
        throw new Error('motion blur needs a 2D output surface, and this backend is rendering '
            + 'straight to a WebGL canvas. On the 3D path a 2D composite exists when an '
            + 'overlay, a transition or motion blur itself is declared -- so this means the '
            + 'composite was not built.');
    }
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const decode = buildDecodeTable();
    const acc = new Float32Array(w * h * 4);
    let out = null;

    return {
        samples: Math.max(1, Math.round(motionBlur.samples)),
        /** The instants this frame integrates over. */
        times: (t) => subframeTimes(t, fps, motionBlur),
        begin() { acc.fill(0); },
        /** Fold the surface as it stands now into the accumulator. */
        take() {
            const img = ctx.getImageData(0, 0, w, h);
            accumulateInto(acc, img.data, decode);
            // The ImageData object is reused as the output buffer, so the
            // resolve step has somewhere to write without a second
            // allocation of the same size.
            out = img;
        },
        /** Average and write back, leaving the backend's canvas holding the frame. */
        end(count) {
            if (!out) return;
            resolveAccumulator(acc, count, out.data);
            ctx.putImageData(out, 0, 0);
        },
    };
}
