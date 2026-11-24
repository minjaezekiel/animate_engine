/**
 * A frame digest: what is on screen, as numbers an agent can read cheaply.
 *
 * # The problem this is for
 *
 * An agent building a film through the MCP bridge cannot see. The only way it
 * has ever had to find out whether a frame is right is to render a PNG and
 * look at it, and a screenshot costs roughly two thousand tokens -- a
 * measured median of 2,054 across 25,457 agent tool results, with a p99 over
 * six thousand. Building "Inside the Earth" took fourteen of them. That is
 * about twenty-five thousand tokens spent on looking, against two and a half
 * thousand for every structured check the engine ran put together.
 *
 * The tempting conclusion is "give the agent continuous vision", and it is
 * backwards. A video stream is N screenshots: at one frame a second a
 * sixty-second film is 120,000 tokens to watch once. Continuous vision is the
 * most expensive option available, not the cheapest.
 *
 * # What actually happened, measured
 *
 * Sorting the defects this film exposed by what caught them:
 *
 *   Caught by a structured check, ~300 tokens each:
 *     a shot overflowing the frame, a camera inside its subject, a caption
 *     printed through the slate, two labels three-quarters off screen, a
 *     cutaway at 0.029 mean luma, an inner core blown to 0.78.
 *
 *   Caught only by looking, ~2,000 tokens each:
 *     a planet rendering black (NaN in a Vector2), clouds at twice the
 *     opacity they should be, a star field invisible after tone mapping, a
 *     studio floor intruding, five specular hotspots from five lights.
 *
 * The split is not random. The checks caught everything GEOMETRIC, temporal
 * or typographic -- things with a right answer you can compute. The images
 * caught everything about MATERIAL and LIGHT -- "what colour did this end up".
 *
 * So the way to spend fewer tokens on looking is not to look faster. It is to
 * make the second column computable, and a colour statistic per named object
 * does most of it: a planet whose sunlit face measures 0.02 mean luma is a
 * black planet, and saying so costs about twenty tokens instead of two
 * thousand.
 *
 * # What this module is
 *
 * The pure half. The browser samples pixels (it is the only thing that has
 * any) and hands them here as small arrays; this turns them into a report,
 * and `formatDigest` turns that into the most compact text that still says
 * everything -- because the token cost is in the serialisation, not in the
 * measurement.
 */

/** Mean, spread and a 6-bucket histogram from a luma array in 0..1. */
export function lumaStatsOf(values) {
    const n = values.length;
    if (!n) return { mean: 0, min: 0, max: 0, buckets: [0, 0, 0, 0, 0, 0] };
    let sum = 0;
    let min = 1;
    let max = 0;
    const buckets = [0, 0, 0, 0, 0, 0];
    for (const v of values) {
        sum += v;
        if (v < min) min = v;
        if (v > max) max = v;
        buckets[Math.min(5, Math.floor(v * 6))]++;
    }
    return {
        mean: +(sum / n).toFixed(3),
        min: +min.toFixed(3),
        max: +max.toFixed(3),
        buckets: buckets.map((b) => Math.round((b / n) * 100)),
    };
}

/**
 * The dominant hue family of a patch, as a word.
 *
 * A word, not three numbers, because the question an agent asks is "is the
 * ocean blue" and not "what is the mean RGB of the ocean". Eight families
 * plus `grey` is enough resolution to catch every colour defect this film
 * produced and costs one token instead of five.
 *
 * `grey` when saturation is under 12%: an unsaturated patch has no
 * meaningful hue, and reporting one invites an agent to chase a number that
 * is noise.
 */
export function hueName(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    if (max < 0.04) return 'black';
    if (d / max < 0.12) return max > 0.8 ? 'white' : 'grey';
    let h;
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    const names = [[15, 'red'], [45, 'orange'], [70, 'yellow'], [160, 'green'],
                   [200, 'cyan'], [260, 'blue'], [310, 'purple'], [345, 'pink'], [360, 'red']];
    return names.find(([lim]) => h < lim)[1];
}

/**
 * One subject's row.
 *
 * `cover` is the fraction of frame AREA it occupies, which is the number a
 * framing argument is actually about -- `staging3d` reports frame HEIGHT
 * because that is what a framing band is defined in, and the two disagree by
 * a lot for anything that is not square.
 */
function subjectRow(s) {
    const stats = lumaStatsOf(s.luma ?? []);
    if (!s.box) {
        return { id: s.id, on: s.visible !== false, box: null, cover: 0,
                 luma: stats.mean, hue: null, clipped: false, behind: s.behind === true };
    }
    /**
     * `cover` is measured on the box CLAMPED to the frame.
     *
     * The digest's own first run reported `cover=17229396.9%` for a macro
     * shot. A projected bounding box is only meaningful while the object is
     * in front of the camera; the moment a corner passes the camera plane the
     * perspective divide blows up, and an unclamped box is tens of thousands
     * of frame widths across. A number like that is worse than no number,
     * because an agent reading it has no way to know it is meaningless.
     *
     * So the visible area is clamped and the overflow is reported as a flag.
     * "Clipped, and 34% of the frame is this object" is true and useful;
     * "17 million percent" is neither.
     */
    const [x0, y0, x1, y1] = s.box;
    const cx0 = Math.max(0, Math.min(1, x0));
    const cy0 = Math.max(0, Math.min(1, y0));
    const cx1 = Math.max(0, Math.min(1, x1));
    const cy1 = Math.max(0, Math.min(1, y1));
    const cover = Math.max(0, cx1 - cx0) * Math.max(0, cy1 - cy0) * 100;
    return {
        id: s.id,
        on: s.visible !== false,
        // The CLAMPED box, as whole percentages: a frame is 1920 px and
        // nobody has needed a bounding box to a tenth of a percent.
        box: [cx0, cy0, cx1, cy1].map((v) => Math.round(v * 100)),
        cover: +cover.toFixed(1),
        luma: stats.mean,
        // Classified where the pixels are; see film3d.html on why it is
        // the mode of the per-pixel hue and not the mean colour.
        hue: s.hue ?? (s.rgb ? hueName(s.rgb[0], s.rgb[1], s.rgb[2]) : null),
        clipped: x0 < 0 || y0 < 0 || x1 > 1 || y1 > 1,
        behind: s.behind === true,
    };
}

/** Build a digest from one sampled frame. */
export function frameDigest({ t, shotId, frame = [], subjects = [], overlay = [],
                              blend = null }) {
    return {
        t: +Number(t).toFixed(2),
        shot: shotId ?? null,
        frame: lumaStatsOf(frame),
        subjects: subjects.map(subjectRow),
        /**
         * The transition covering this frame, if any.
         *
         * Without it a frame mid-dip reports a dark subject and an agent has
         * no way to tell a lighting fault from a fade that is working. That
         * is a screenshot's worth of tokens to answer "is this meant to be
         * dark", so it is worth the twenty characters.
         */
        blend: blend ?? null,
        // Overlay text is reported as the strings themselves. It is the one
        // thing on screen that is already language, so a hash or a box would
        // be throwing away the cheapest information in the frame.
        text: overlay.filter((o) => o.op === 'text').map((o) => o.text),
    };
}

/**
 * Digests as the smallest text that still says everything.
 *
 * Measured against `JSON.stringify(x, null, 2)` on the same data: the pretty
 * JSON of nine samples of this film is about 4,300 tokens, the compact JSON
 * about 1,900, and this about 420. The saving is not in the measurement, it
 * is in not spending four characters of indentation and a quoted key on
 * every number.
 */
export function formatDigest(digests) {
    const out = [];
    for (const d of digests) {
        const f = d.frame;
        out.push(`t=${d.t} ${d.shot ?? '-'} luma=${f.mean} [${f.min}..${f.max}] `
            + `hist=${f.buckets.join('/')}`);
        for (const s of d.subjects) {
            if (!s.on) { out.push(`  ${s.id}: off`); continue; }
            if (s.behind) { out.push(`  ${s.id}: behind camera`); continue; }
            if (!s.box) { out.push(`  ${s.id}: no bounds`); continue; }
            if (s.cover === 0) { out.push(`  ${s.id}: off frame`); continue; }
            out.push(`  ${s.id}: box=${s.box.join(',')} cover=${s.cover}% `
                + `luma=${s.luma} ${s.hue ?? ''}${s.clipped ? ' CLIPPED' : ''}`);
        }
        if (d.text.length) out.push(`  text: ${d.text.map((x) => JSON.stringify(x)).join(' ')}`);
        if (d.blend) {
            out.push(`  blend: ${d.blend.kind} ${Math.round(d.blend.cover * 100)}% `
                + `(${d.blend.from ?? 'start'} -> ${d.blend.to ?? 'end'})`);
        }
    }
    return out.join('\n');
}

/**
 * Findings a digest supports that no other check in the engine does.
 *
 * Deliberately narrow. These are exactly the defects that cost a screenshot
 * each while building "Inside the Earth", written as the rule that would
 * have caught them -- which is the only honest way to decide what a check
 * should look for.
 */
export function checkDigest(digests, { expect = {} } = {}) {
    const findings = [];
    const say = (severity, message) => findings.push({ severity, message, location: 'digest' });
    for (const d of digests) {
        const where = `t=${d.t}${d.shot ? ` (${d.shot})` : ''}`;
        /**
         * A frame under a transition is MEANT to be dark or washed out, so
         * the luma findings below do not apply to it. Reporting "on screen
         * and black" for the middle of a dip to black is a false finding, and
         * a checker that cries wolf stops being read -- the overlay checker
         * produced 28 of those on its first run and the lesson is the same.
         */
        const dipped = d.blend ? d.blend.cover > 0.25 : false;
        for (const s of d.subjects) {
            if (!s.on || s.behind || !s.box) continue;
            if (dipped) continue;

            /**
             * A lit subject measuring near zero.
             *
             * The Earth's sunlit face rendered at 0.02 mean luma for three
             * iterations because `normalScale: [0.45, 0.45]` put NaN in the
             * surface normal. Every frame-wide exposure check passed, because
             * the frame is mostly space and a black planet in black space has
             * an unremarkable mean. Only a per-SUBJECT number sees it.
             */
            /**
             * A subject mostly OUTSIDE the frame was never this shot's
             * subject, so its exposure says nothing about the shot.
             *
             * The macro shots of the cutaway leave the presenter as a
             * six-percent-wide vertical sliver down the right edge, in
             * shadow, at 0.028 luma -- and the rule above reported it by
             * name on every one of them. Three identical findings that mean
             * "a man is standing off to one side of a close-up", which is
             * what a close-up IS. A checker that cries wolf stops being
             * read, and this file exists to be read.
             */
            const sliver = s.clipped && s.cover < 12;
            if (!sliver && s.cover > 4 && s.luma < 0.035) {
                say('warning', `${where}: "${s.id}" covers ${s.cover}% of frame at luma `
                    + `${s.luma} -- it is on screen and black. Check its material and `
                    + 'whether any value reached THREE as the wrong type.');
            }
            if (!sliver && s.cover > 4 && s.luma > 0.9) {
                say('warning', `${where}: "${s.id}" is blown out (luma ${s.luma}).`);
            }
            const want = expect[s.id];
            if (want?.hue && s.hue && s.hue !== want.hue) {
                say('warning', `${where}: "${s.id}" reads ${s.hue}, expected ${want.hue}.`);
            }
            if (want?.cover) {
                const [lo, hi] = want.cover;
                if (s.cover < lo || s.cover > hi) {
                    say('warning', `${where}: "${s.id}" covers ${s.cover}% of frame, `
                        + `outside the ${lo}-${hi}% this shot asks for.`);
                }
            }
        }
    }
    return findings;
}
