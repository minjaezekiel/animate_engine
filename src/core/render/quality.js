/**
 * Render quality as numbers: how big a frame is, and how many bits it gets.
 *
 * Pure, and shared, so the 2D script, the 3D script and the browser read one
 * table instead of each carrying its own -- the drift between `produce.mjs`
 * and `produce3d.mjs` is a standing problem in this repo and a second copy of
 * a resolution ladder is how it starts.
 *
 * Phase 48 measured why this exists. The reference film our renders were
 * losing to is 768x576 at **0.049 bits per pixel per frame**; ours was
 * 480x270 at **0.168** -- a third of our bits spent on a smaller picture, and
 * it still looked better. So resolution was never the gap. But there was also
 * no way to ASK for a size by name, and a flat 6 Mbit/s meant a 360p frame
 * got four times the bits it can use while a 1080p frame got less than a 720p
 * one deserves.
 *
 * See [docs/pending/42-RENDER-QUALITY.md](../../../docs/pending/42-RENDER-QUALITY.md).
 */

/** The SHORT side, in pixels, for each name `QUALITY=` accepts. */
export const QUALITIES = {
    '360p': 360, '480p': 480, '720p': 720,
    '1024p': 1024, '1080p': 1080, '1440p': 1440, '2160p': 2160,
};

/** H.264 cannot encode an odd dimension. */
const even = (n) => Math.max(2, Math.round(n / 2) * 2);

/**
 * `720p` plus the film's own shape -> `[width, height]`.
 *
 * The name sets the short side rather than the height, because half the films
 * here are 9:16 and "720p" on a vertical film means 720 across and 1280 tall
 * -- which is what anyone asking for it means. The aspect comes from the
 * film's authored `meta`, so asking for a quality never reframes a film:
 * `test/core/resolution.test.mjs` proves a size change scales rather than
 * crops, and this only chooses the size.
 *
 * Returns `null` for a name that is not a size, so a caller can fall back to
 * its own default rather than render at 2x2.
 */
export function resolveSize(name, meta = {}) {
    const short = QUALITIES[String(name).trim().toLowerCase()]
        ?? Number(String(name).trim().replace(/p$/i, ''));
    if (!Number.isFinite(short) || short < 2) return null;
    const w = Number(meta?.width) > 0 ? Number(meta.width) : 1280;
    const h = Number(meta?.height) > 0 ? Number(meta.height) : 720;
    const aspect = w / h;
    return aspect >= 1
        ? [even(short * aspect), even(short)]
        : [even(short), even(short / aspect)];
}

/**
 * Bits per pixel per frame.
 *
 * 0.049 is what the reference spends and gets away with, so 0.2 is four times
 * the measured floor -- headroom for grain, motion blur and the fast cuts a
 * fixed figure has to survive. It is also what the old flat 6 Mbit/s came to
 * at 720p24, so no film in the repo loses bits by this landing; what changes
 * is that 360p stops wasting them and 1080p stops starving.
 */
const BPP = 0.2;

/** What to hand the encoder for a picture this size. */
export function bitrateFor(width, height, fps = 24) {
    const bits = (width || 1280) * (height || 720) * (fps || 24) * BPP;
    // ponytail: flat clamps, not a codec model. A measured per-film curve is
    // Tier 0.2's successor if 2-pass encoding ever lands.
    return Math.round(Math.min(40e6, Math.max(1e6, bits)));
}
