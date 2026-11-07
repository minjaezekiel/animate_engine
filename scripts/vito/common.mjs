/**
 * Shared machinery for "Madini ya Vito".
 *
 * The board helpers are generic and come from `../lib/boards.mjs`. What is
 * here is specific to this series: the Swahili end card, the gem crystal, and
 * the hook plate -- which is this series' one structural difference from the
 * geology parts. See docs/27-RETENTION.md.
 */
import {
    L, M, SAFE, pathPart, poly, rectPart, smooth, textPart,
} from '../lib/diagram.mjs';
import { REPO, SERIES, SHARE, TAGLINE } from '../lib/vito.mjs';
import { estimateLine } from '../../src/core/script/pacing.js';

// `cardRows`, `statParts`, `foldBand` and `strata` moved to `../lib/boards.mjs`
// when a THIRD series needed them -- the same lift boards.mjs records for the
// second. Re-exported here so every existing part keeps its imports.
export {
    rng, squarePath, bez3, blinks, board, castBoard,
    cardRows, foldBand, statParts, strata,
} from '../lib/boards.mjs';

const FONT = '"Helvetica Neue", Helvetica, Arial, sans-serif';

/**
 * The title plate, which does NOT open the film.
 *
 * Every retained opening in the reference narration front-loads speech, and a
 * card in the first two seconds spends the window the platform gives you. So
 * the hook line plays over the picture and this arrives UNDER it, a few
 * seconds in, by which time the viewer has already decided to stay.
 */
export const hookTitle = (kicker, title, sub = null) => [
    textPart('kicker', kicker, { at: [540, 318], font: `700 30px ${FONT}`, fill: 'gem',
                                 maxWidth: SAFE.x1 - SAFE.x0 }),
    textPart('title', title, { at: [540, 392], font: `800 70px ${FONT}`, fill: 'ink',
                               maxWidth: SAFE.x1 - SAFE.x0 }),
    ...(sub ? [textPart('titlesub', sub, { at: [540, 462], font: `600 31px ${FONT}`,
                                           fill: 'dim', maxWidth: SAFE.x1 - SAFE.x0 })] : []),
];

/**
 * A gem, drawn as facets rather than as a silhouette with a gradient.
 *
 * Facets are the whole reason a cut stone reads as a stone: each is a flat
 * plane catching a different amount of light, so the stone has hard edges
 * where the brightness changes instead of a smooth airbrushed bulge. The
 * first version of this drew five big shapes and read as a clip-art diamond
 * -- the same mistake the dog and the hands made, and visible the moment a
 * frame was looked at rather than reasoned about.
 *
 * Built in a three-quarter view: the girdle is an ellipse seen from slightly
 * above, the table is a smaller ellipse, the crown is the ring of facets
 * between them, and the pavilion runs from the girdle down to the culet. The
 * shade of each facet is stepped around the ring, so the near side is lighter
 * than the far side without any lighting model.
 *
 * `tone` and `deep` are the two body colours; everything else is derived, so
 * recolouring the stone is two arguments.
 */
export function gemParts(id, cx, cy, w, {
    tone = 'gem', deep = 'tanzanite', crownTone = 'violet', light = 'ink',
    z = 20, facets = 10, squash = 0.26, table = 0.46,
} = {}) {
    const rg = w / 2;                       // girdle radius
    const rt = rg * table;                  // table radius
    const gy = cy - w * 0.10;               // girdle height
    const ty = gy - w * 0.26;               // table height
    const by = gy + w * 0.70;               // culet
    const ring = (r, yy) => Array.from({ length: facets }, (_, i) => {
        const a = (i / facets) * Math.PI * 2 - Math.PI / 2;
        return [cx + Math.cos(a) * r, yy + Math.sin(a) * r * squash];
    });
    const G = ring(rg, gy), T = ring(rt, ty);
    const parts = [];
    // How much a facet faces the viewer: 1 at the near side, 0 at the far.
    const near = (i) => {
        const a = ((i + 0.5) / facets) * Math.PI * 2 - Math.PI / 2;
        return (Math.sin(a) + 1) / 2;
    };
    // A CONTINUOUS ramp across the ring, not a threshold. Two palette names
    // stepped by a `>` gave two flat masses and the stone read as clip art
    // again; facets only look like facets when adjacent ones differ a little.
    // Literal hex, because a palette name cannot be interpolated.
    const ramp = (a, b, u) => {
        const h = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
        const [r1, g1, b1] = h(a), [r2, g2, b2] = h(b);
        const m = (x, y) => Math.round(x + (y - x) * u).toString(16).padStart(2, '0');
        return `#${m(r1, r2)}${m(g1, g2)}${m(b1, b2)}`;
    };
    // pavilion first, so the crown sits over it
    for (let i = 0; i < facets; i++) {
        const j = (i + 1) % facets;
        const u = near(i);
        parts.push(pathPart(`${id}_p${i}`, poly([G[i], G[j], [cx, by]], true), {
            fill: ramp('#1d2f7a', '#6d8cff', u * u),
            stroke: ramp('#2a3f8f', '#8aa3ff', u), strokeWidth: 1.5,
            alpha: 0, z: z + Math.round(u * 6),
        }));
    }
    // crown
    for (let i = 0; i < facets; i++) {
        const j = (i + 1) % facets;
        const u = near(i);
        parts.push(pathPart(`${id}_c${i}`, poly([G[i], G[j], T[j], T[i]], true), {
            fill: ramp('#4a3f94', '#b49cf0', u),
            stroke: ramp('#5b4fa8', '#cbb8ff', u), strokeWidth: 1.5,
            alpha: 0, z: z + 10 + Math.round(u * 6),
        }));
    }
    // table, girdle and outline: the three lines that make it read as cut
    parts.push(
        pathPart(`${id}_tab`, poly(T, true),
                 { fill: '#9d86e8', stroke: light, strokeWidth: 2.5, alpha: 0, z: z + 20 }),
        pathPart(`${id}_gird`, poly(G, true),
                 { stroke: light, strokeWidth: 3, alpha: 0, z: z + 21 }),
    );
    // the silhouette, last and over everything, so the stone has one clean edge
    const half = Math.round(facets / 2);
    const outline = [...G.slice(0, half + 1)];
    parts.push(pathPart(`${id}_out`,
        `${poly([...G.slice(half), ...G.slice(0, half + 1)])} L${outline[0][0].toFixed(1)},`
        + `${outline[0][1].toFixed(1)}`,
        { stroke: light, strokeWidth: 3.5, alpha: 0, z: z + 22 }));
    parts.push(pathPart(`${id}_cul`,
        poly([G[Math.round(facets * 0.5)], [cx, by], G[0]]),
        { stroke: light, strokeWidth: 3.5, alpha: 0, z: z + 22 }));
    return { parts, ids: parts.map((p) => p.id) };
}

/** A glint: a four-pointed star that pops and goes. */
export const glintPart = (id, cx, cy, r, { fill = 'light', z = 60 } = {}) =>
    pathPart(id, poly([[cx, cy - r], [cx + r * 0.18, cy - r * 0.18], [cx + r, cy],
                       [cx + r * 0.18, cy + r * 0.18], [cx, cy + r],
                       [cx - r * 0.18, cy + r * 0.18], [cx - r, cy],
                       [cx - r * 0.18, cy - r * 0.18]], true),
             { fill, alpha: 0, z });

/**
 * The end card. Short on purpose: retention falls off a cliff once the point
 * lands, so this is about five seconds, not twenty.
 */
export function endCard(nextLine) {
    const parts = [
        rectPart('card_bg', 1080, 1920, { at: [540, 960], fill: '#05080d', alpha: 0, z: 200 }),
        textPart('card_next', nextLine, {
            at: [540, 700], font: `700 40px ${FONT}`, fill: 'gem',
            maxWidth: SAFE.x1 - SAFE.x0, alpha: 0, z: 210 }),
        textPart('card_series', SERIES.toUpperCase(), {
            at: [540, 876], font: `800 54px ${FONT}`, fill: 'ink', alpha: 0, z: 210 }),
        textPart('card_tag', TAGLINE, {
            at: [540, 936], font: `600 29px ${FONT}`, fill: 'dim',
            maxWidth: SAFE.x1 - SAFE.x0, alpha: 0, z: 210 }),
        textPart('card_share', SHARE, {
            at: [540, 1046], font: `700 30px ${FONT}`, fill: 'gold', alpha: 0, z: 210 }),
        textPart('card_eng', 'Imeundwa na Jirex — injini huria ya uhuishaji', {
            at: [540, 1160], font: `600 27px ${FONT}`, fill: 'dim',
            maxWidth: SAFE.x1 - SAFE.x0, alpha: 0, z: 210 }),
        textPart('card_repo', REPO, {
            at: [540, 1204], font: `700 27px ${FONT}`, fill: 'ink', alpha: 0, z: 210 }),
    ];
    return { parts, ids: parts.map((p) => p.id) };
}

/**
 * Derive every shot's duration from the narration it carries.
 *
 * docs/27-RETENTION.md argues that the order matters: write the line, then
 * let the picture follow it. Authoring a duration by hand and writing into it
 * is the reverse, and it is the documented cause of the geology series
 * leaving roughly a fifth of its runtime silent.
 *
 * A shot ends when BOTH are done -- the line, and the last thing that moves:
 *
 *   max(line.at + estimated span + pad,  last action + 0.4,  min)
 *
 * The line span uses the same estimator `check-film` reports with, which for
 * Swahili counts syllables. The engine re-fits to the real audio at render
 * time anyway (`estimatedTiming`), so this is about making the AUTHORED
 * timing honest enough that the action schedule still fits once it does --
 * a shot cut shorter than its own reveals loses them silently.
 */
export function fitShots(film, { pad = 0.85, min = 3.5, lang = 'sw' } = {}) {
    const rate = (speaker) => ({ nuru: 1.06, bakari: 1.10, hamisi: 0.86 }[speaker] ?? 1);
    for (const scene of film.scenes ?? []) {
        for (const shot of scene.shots ?? []) {
            let needed = min;
            for (const line of shot.dialogue ?? []) {
                needed = Math.max(needed,
                    (line.at ?? 0) + estimateLine(line.text, { lang, rate: rate(line.speaker) })
                        + pad);
            }
            for (const a of shot.actions ?? []) {
                // A flow loop is deliberately LONGER than its shot: `flow` is
                // periodic, so an over-long linear ramp costs nothing and
                // saves re-keying per cycle. Counting its far key as a beat
                // to wait for stretched one shot of part three to 41 seconds.
                if (a.do === 'set' && a.channel === 'props.flow') continue;
                // Blinks are decoration spread across a shot, not a beat the
                // shot has to wait for. They are generated against a guessed
                // duration, so sizing the shot to fit them makes the guess
                // self-fulfilling -- which opened a 5s hole in part six after
                // its line was shortened.
                if (a.do === 'play' && a.action === 'blink') continue;
                needed = Math.max(needed, (a.at ?? 0) + (a.for ?? 0) + 0.4);
            }
            shot.duration = +needed.toFixed(2);
        }
    }
    return film;
}
