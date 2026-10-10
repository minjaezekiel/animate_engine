/**
 * Onion skinning: ghosted frames behind the live one.
 *
 * ```js
 * const onion = new OnionSkin({ before: 2, after: 1, spacing: 0.25 });
 * onion.draw(ctx, { render: (time) => { poseAt(time); backend.renderFrame(...);
 *                                       return backend.canvas(); },
 *                   time: t, duration: 12 });
 * ```
 *
 * # Why it needs nothing from the backend
 *
 * Each ghost is produced by the **same renderer that produces the final
 * film**, posed at a different time and composited faint. The backend is
 * never told that onion skinning exists: it renders a frame, as always,
 * and the caller draws that frame with a lower alpha.
 *
 * The alternative -- a "ghost" flag threaded through the scene graph and
 * honoured by every draw call -- would put a *view* concern inside the
 * renderer, and then every new node kind would have to remember to respect
 * it. More to the point, it would make what the animator sees a different
 * computation from what the film contains, which is the one thing a
 * reference view must not be.
 *
 * # Past and future are tinted differently
 *
 * Every traditional animation desk shows previous drawings in one colour
 * and the next in another, because a stack of identical grey ghosts is
 * unreadable the moment there is more than one on each side: a limb's
 * direction of travel disappears. The defaults are a warm tint behind and
 * a cool tint ahead, which is the convention in every 2D package, and
 * `tint: null` turns it off for anyone who finds it distracting.
 *
 * Opacity falls off with distance, so the nearest ghost is clearly the
 * nearest. Linear falloff makes the furthest ghost of a long stack
 * invisible and the arithmetic hard to reason about, so it is geometric:
 * each step is `falloff` times the previous one.
 *
 * # Spacing is in seconds, not frames
 *
 * A ghost a frame away from the current one is nearly identical to it and
 * tells an animator nothing. What is wanted is a ghost a *beat* away, and
 * a beat is a duration -- which also means the view does not change
 * meaning when the film's fps does. `spacing` is therefore seconds, with
 * `frames` as an opt-in for the frame-by-frame case.
 */

/** Warm behind, cool ahead -- the desk convention. */
export const DEFAULT_TINT = { before: '#ff4d4d', after: '#2f80ff' };

export class OnionSkin {
    /**
     * @param {object} [options]
     * @param {number} [options.before=2]   ghosts behind the playhead
     * @param {number} [options.after=1]    ghosts ahead of it
     * @param {number} [options.spacing=0.25] seconds between ghosts
     * @param {number} [options.opacity=0.28] opacity of the nearest ghost
     * @param {number} [options.falloff=0.55]
     *   Each further ghost is this much of the previous one's opacity.
     * @param {{before: string, after: string}|null} [options.tint]
     *   Pass null for untinted grey ghosts.
     * @param {boolean} [options.enabled=true]
     */
    constructor({ before = 2, after = 1, spacing = 0.25, opacity = 0.28,
                  falloff = 0.55, tint = DEFAULT_TINT, enabled = true } = {}) {
        Object.assign(this, { before, after, spacing, opacity, falloff, tint, enabled });
    }

    /**
     * The times to render, nearest last.
     *
     * Nearest *last* so the nearest ghost paints over the further ones:
     * they overlap, and the one closest to now should win where they do.
     * Pure, so the ordering is testable without a canvas.
     *
     * @returns {Array<{time: number, offset: number, alpha: number, side: 'before'|'after'}>}
     */
    frames({ time, duration = Infinity, spacing = this.spacing }) {
        if (!this.enabled) return [];
        const out = [];
        for (const [side, n, sign] of [['before', this.before, -1], ['after', this.after, 1]]) {
            for (let k = n; k >= 1; k--) {
                const at = time + sign * k * spacing;
                // Clamped away rather than clamped to the ends: a ghost
                // pinned at t=0 sits exactly on top of several others and
                // reads as one dark frame, which looks like a bug.
                if (at < 0 || at > duration) continue;
                out.push({
                    time: at,
                    offset: sign * k * spacing,
                    alpha: this.opacity * this.falloff ** (k - 1),
                    side,
                });
            }
        }
        // Interleaved by distance so the two sides' nearest ghosts both
        // end up on top of their own further ones.
        return out.sort((a, b) => Math.abs(b.offset) - Math.abs(a.offset));
    }

    /**
     * Render and composite the ghosts onto `ctx`.
     *
     * @param {CanvasRenderingContext2D} ctx the target to composite onto
     * @param {object} job
     * @param {(time: number) => any} job.render
     *   Poses the scene at `time`, renders, and returns something
     *   `drawImage` accepts. Usually `backend.canvas()`.
     * @param {number} job.time       the playhead
     * @param {number} [job.duration]
     * @param {number} [job.width]
     * @param {number} [job.height]
     * @returns {number} how many ghosts were drawn
     */
    draw(ctx, { render, time, duration = Infinity, width = null, height = null }) {
        const frames = this.frames({ time, duration });
        if (!frames.length) return 0;

        const saved = ctx.globalAlpha;
        for (const frame of frames) {
            const image = render(frame.time);
            if (!image) continue;
            const w = width ?? image.width;
            const h = height ?? image.height;
            ctx.globalAlpha = frame.alpha;
            ctx.drawImage(image, 0, 0);
            if (this.tint) {
                // Tinted through the ghost's own coverage: `source-atop`
                // paints only where something was already drawn, so the
                // colour lands on the drawing and not on the whole frame.
                // Without it a tint washes the entire canvas and the
                // ghosts stop being readable at all.
                ctx.save();
                ctx.globalCompositeOperation = 'source-atop';
                ctx.globalAlpha = frame.alpha * 0.55;
                ctx.fillStyle = this.tint[frame.side];
                ctx.fillRect(0, 0, w, h);
                ctx.restore();
            }
        }
        ctx.globalAlpha = saved;
        return frames.length;
    }
}
