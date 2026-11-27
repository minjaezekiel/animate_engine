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
 * # Two surfaces, one set of times
 *
 * `draw` composites ghosts UNDER the live frame, which works because a 2D
 * canvas is transparent where nothing was drawn. A 3D render is opaque, so
 * `drawLit` composites them OVER it additively instead. What the two share
 * is `frames()` -- which times, in what order, at what opacity -- because
 * that is the part that is about onion skinning rather than about pixels.
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
 * # A `plan` replaces the arithmetic, and a drawn film brings one
 *
 * `frames()` below picks ghosts at fixed intervals of TIME, which is right
 * for a 3D shot: a solid is a continuous function of t and there is no
 * "previous drawing" to speak of. A drawn film is a sequence of drawings
 * held for some number of frames, and the animator's question is "show me
 * the two drawings before this one" -- a different question with a
 * different answer the moment a shot is on twos. `core/anim/onion.js`
 * answers that one, off the engine's own exposure data, and hands the
 * result in as `plan`. Everything below composites whatever it is given.
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
     * @param {HTMLCanvasElement} [job.scratch]
     *   An offscreen canvas. With one, each ghost's ink is recoloured to
     *   the tint before compositing, which is the only way a dark subject
     *   reads as past or future. See `#drawTinted`.
     * @returns {number} how many ghosts were drawn
     */
    draw(ctx, { render, time, duration = Infinity, width = null, height = null,
                scratch = null, plan = null }) {
        const frames = plan ?? this.frames({ time, duration });
        if (!frames.length) return 0;
        if (scratch) return this.#drawTinted(ctx, frames, { render, width, height, scratch });

        const saved = ctx.globalAlpha;
        // Counted as DRAWN, not as asked for: a `render` that returns
        // nothing -- a frame outside a clip, a backend not ready -- is a
        // ghost that is not on screen, and a caller reporting "3 ghosts"
        // over a frame with one is the reference view lying about itself.
        let drawn = 0;
        for (const frame of frames) {
            const image = render(frame.time);
            if (!image) continue;
            drawn++;
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
        return drawn;
    }

    /**
     * Ghosts whose INK is the tint colour, rather than ink with a wash over it.
     *
     * The route above tints in place on the target: it draws the ghost at
     * its falloff opacity and then fills the tint `source-atop` at 55% of
     * that opacity. On a mid-tone rig that reads. On **dark ink it does
     * not** -- 15% of red over black is still black, and the 2D film probe
     * measured exactly that: R-B of **6** on a black subject, against the
     * 3D path's 24 on a white one. A stack of ghosts that are all the same
     * dark grey hides the direction of travel, which is the one thing the
     * tint exists to show.
     *
     * Given somewhere offscreen to work, the ghost is instead drawn at full
     * opacity, its coverage is filled with the tint at full strength -- so
     * the ink BECOMES red or blue, which is what an animation desk actually
     * shows -- and only then is the whole thing composited at the ghost's
     * own falloff opacity. A faint red line, not a black line with a hint
     * of red.
     *
     * The in-place route stays for a caller with no offscreen canvas. It is
     * the weaker picture, and now it is the weaker picture on purpose.
     */
    #drawTinted(ctx, frames, { render, width, height, scratch }) {
        const sctx = scratch.getContext('2d');
        const savedAlpha = ctx.globalAlpha;
        let drawn = 0;
        for (const frame of frames) {
            const image = render(frame.time);
            if (!image) continue;
            drawn++;
            const w = width ?? image.width;
            const h = height ?? image.height;
            sctx.globalCompositeOperation = 'source-over';
            sctx.globalAlpha = 1;
            sctx.clearRect(0, 0, w, h);
            sctx.drawImage(image, 0, 0, w, h);
            if (this.tint) {
                sctx.globalCompositeOperation = 'source-atop';
                sctx.fillStyle = this.tint[frame.side];
                sctx.fillRect(0, 0, w, h);
                sctx.globalCompositeOperation = 'source-over';
            }
            ctx.globalAlpha = frame.alpha;
            ctx.drawImage(scratch, 0, 0, w, h);
        }
        ctx.globalAlpha = savedAlpha;
        return drawn;
    }

    /**
     * The same ghosts, composited ADDITIVELY onto an opaque frame.
     *
     * `draw` above assumes what a 2D canvas gives it: an image that is
     * transparent where nothing was drawn, so a ghost can be laid under the
     * live frame and still be seen around it. **A 3D render has no such
     * transparency.** Its drawing buffer is opaque, the background is a
     * wall of pixels, and laying the live frame over four ghosts hides all
     * four of them completely -- which is exactly what the first run of
     * `test/e2e/onion-3d.mjs` measured: four ghosts reported, one cluster
     * on screen.
     *
     * So the 3D path composites the other way round: the live frame first,
     * then each ghost added on top with `lighter`, where black contributes
     * nothing and lit pixels brighten. The tint cannot be a `source-atop`
     * fill either -- the destination is opaque everywhere, so that would
     * wash the whole frame -- and is instead multiplied into the ghost on a
     * scratch canvas before it is added, which leaves black black and
     * colours only what was drawn.
     *
     * What is shared is `frames()`: which times, in what order, at what
     * opacity, clamped away from the ends. That is the part that is about
     * onion skinning. How pixels combine is about the surface, and the two
     * surfaces genuinely differ.
     *
     * @param {CanvasRenderingContext2D} ctx the opaque frame, already drawn
     * @param {object} job as `draw`, plus `scratch`: a canvas to tint on
     * @returns {number} how many ghosts were drawn
     */
    drawLit(ctx, { render, time, duration = Infinity, width, height, scratch,
                   plan = null }) {
        const frames = plan ?? this.frames({ time, duration });
        if (!frames.length) return 0;
        const sctx = scratch?.getContext('2d') ?? null;
        const savedAlpha = ctx.globalAlpha;
        const savedOp = ctx.globalCompositeOperation;
        let drawn = 0;

        for (const frame of frames) {
            const image = render(frame.time);
            if (!image) continue;
            drawn++;
            let source = image;
            if (this.tint && sctx) {
                sctx.globalCompositeOperation = 'source-over';
                sctx.globalAlpha = 1;
                sctx.clearRect(0, 0, width, height);
                sctx.drawImage(image, 0, 0, width, height);
                sctx.globalCompositeOperation = 'multiply';
                sctx.fillStyle = this.tint[frame.side];
                sctx.fillRect(0, 0, width, height);
                sctx.globalCompositeOperation = 'source-over';
                source = scratch;
            }
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = frame.alpha;
            ctx.drawImage(source, 0, 0, width, height);
        }
        ctx.globalAlpha = savedAlpha;
        ctx.globalCompositeOperation = savedOp;
        return drawn;
    }
}

/**
 * Which nodes a ghost may draw, given the ones being ghosted.
 *
 * # Why a 2D FILM needs this and a pose does not
 *
 * The pose editor's canvas is empty behind the rig, so a ghost rendered
 * over it is transparent where there is no ink and composites correctly.
 * A film is not: it has a background rectangle at z -1000 and scenery that
 * is often full-width, so every ghost arrives as a solid page and a stack
 * of them is one flat wash. An animator ghosts *the drawing that moves*.
 *
 * So everything outside the ghosted set is turned off for the ghost
 * renders, which gives back the transparency a 2D canvas is supposed to
 * have. The 3D path's answer -- compositing additively, where black
 * contributes nothing -- is wrong here: half the films in this repository
 * are ink on light paper, and adding light to a pale background does
 * nothing at all.
 *
 * # Ancestors are not optional, and not obvious
 *
 * A cast root is `climb/mara` and its parent is the scene group
 * `scene/climb` -- two different namespaces, so the parent is **not a
 * string prefix of the child**. The first version of this matched on ids
 * alone, hid the scene group along with everything else, and rendered four
 * perfectly blank ghosts: the one failure mode that looks exactly like
 * onion skinning being switched off.
 *
 * Pure, and takes the scene rather than a renderer, so the rule can be
 * tested without a canvas.
 *
 * @param {{byId: Map}} scene
 * @param {string[]} ids   node ids whose subtrees are ghosted
 * @returns {{keep: Set<string>, hidden: object[], total: number}}
 */
export function ghostMask(scene, ids = []) {
    const byId = scene?.byId ?? new Map();
    const keep = new Set();
    const addSubtree = (id) => {
        const n = byId.get(id);
        if (!n || keep.has(id)) return;
        keep.add(id);
        for (const c of n.childIds ?? []) addSubtree(c);
    };
    for (const g of ids) {
        addSubtree(g);
        for (let p = byId.get(g)?.parentId; p; p = byId.get(p)?.parentId) keep.add(p);
    }
    const all = [...byId.values()].filter((n) => n.id && n.props);
    return { keep, hidden: all.filter((n) => !keep.has(n.id)), total: all.length };
}

/**
 * The cast roots of a film, which is what gets ghosted unless told otherwise.
 *
 * Reads the FILM and not the compiled scene, because `as` is the name the
 * author wrote and `${sceneId}/${as}` is the id the compiler makes from it.
 */
export function castRoots(film) {
    return (film?.scenes ?? []).flatMap((sc, i) => (sc.cast ?? [])
        .map((c) => `${sc.id ?? `s${i + 1}`}/${c.as ?? c.character}`));
}
