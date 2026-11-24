/**
 * Shared machinery for "Reading the Market" / "Kusoma Soko".
 *
 * The generic board helpers come from `../lib/boards.mjs`. What is here is
 * this series' own: the bilingual end card, the pinned banner, the 90-second
 * shot fitter, and the MARKET primitives -- candles, levels, zones, an order
 * ticket, a risk:reward ladder and an equity curve -- which are the entire
 * visual vocabulary of the ten parts.
 *
 * Two rules govern the drawings.
 *
 * **1. What the market did and what somebody drew are never the same colour.**
 * Candles, levels and spreads are facts: they are in the data whether or not
 * anybody is looking. A zone, a trendline, a target is an OPINION somebody
 * drew on top. The palette keeps those apart -- `bull`/`bear`/`level` for the
 * first, `zone` for the second -- and nothing in ten parts crosses over. A
 * beginner who cannot tell the difference will treat their own rectangle as
 * evidence, which is the single most expensive habit in retail trading.
 *
 * **2. A platform window is drawn for its LAYOUT, not its skin.** The MT4/MT5
 * mock below is ink on paper, which is not what MetaTrader looks like. That
 * is deliberate, and it is the one place this series departs from Phase 37's
 * fifth correction ("a mock-up in colours the product does not use teaches
 * the viewer the wrong product"). What a viewer has to carry out of part four
 * is *where the stop-loss field is relative to the volume field* -- the
 * spatial arrangement they will navigate under pressure. That survives
 * restyling. The grey-and-blue skin does not survive being shrunk to a phone
 * frame, and copying it would also pass off a drawing as a screenshot.
 */
import {
    FONT, L, M, Q, SAFE, Z, arrowPath, pathPart, poly, rectPart, smooth, textPart,
} from '../lib/diagram.mjs';
import {
    BANNER, CTA, DISCLAIMER, ENGINE_AD, FX_PALETTE, PARTS_IN_SERIES, REPO,
    SERIES, SHARE, TAGLINE, rateOf,
} from '../lib/forex.mjs';
import { estimateLine } from '../../src/core/script/pacing.js';

export {
    bez3, blinks, board, castBoard, rng, squarePath, statParts, strata,
} from '../lib/boards.mjs';

import { cardRows as rawCardRows } from '../lib/boards.mjs';

/**
 * `cardRows`, on paper.
 *
 * The shared helper defaults to the dark navy card the first four series
 * stage on. Re-exporting it unchanged put a black slab with near-black title
 * text in the middle of part one, and every checker passed it -- a colour is
 * never out of bounds, so only a grabbed frame says anything. Wrapped here
 * rather than overridden at each call site, because "remember to pass the
 * paper colours" is a rule that holds for about three parts.
 */
export const cardRows = (id, rows, opts = {}) => rawCardRows(id, rows, {
    bg: 'paperLit',
    border: 'ink',
    borderWidth: 3,
    titleFill: 'ink',
    bodyFill: 'inkSoft',
    ...opts,
});

export { FX_PALETTE };

const n = (v) => {
    const r = Math.round(v * 10) / 10;
    return Object.is(r, -0) ? 0 : r;
};

// ---------------------------------------------------------------------------
// Standing furniture
// ---------------------------------------------------------------------------

/**
 * The title plate, which does NOT open the film.
 *
 * Every retained opening in the reference narration front-loads speech, and a
 * card in the first two seconds spends the window the platform gives you. So
 * the hook line plays over the picture and this arrives UNDER it a few
 * seconds in, by which time the viewer has already decided to stay.
 * `docs/27-RETENTION.md`.
 */
export const hookTitle = (kicker, title, sub = null) => [
    textPart('kicker', kicker, { at: [540, 318], font: `800 30px ${FONT}`, fill: 'gold',
                                 maxWidth: SAFE.x1 - SAFE.x0 }),
    textPart('title', title, { at: [540, 396], font: `800 70px ${FONT}`, fill: 'ink',
                               maxWidth: SAFE.x1 - SAFE.x0, lineHeight: 74 }),
    ...(sub ? [textPart('titlesub', sub, { at: [540, 464], font: `700 31px ${FONT}`,
                                           fill: 'dim', maxWidth: SAFE.x1 - SAFE.x0 })] : []),
];

/**
 * The pinned banner: a caption chip at the top of frame, up from frame one
 * and never moving.
 *
 * Authored at alpha 1, which is the one deviation from the rule that every
 * diagram part starts invisible. That rule is right for a build-up -- a
 * reveal needs something to ramp from -- and wrong here: a board re-cast in a
 * new scene starts invisible again, so a banner that relied on a reveal
 * appeared in scene one and vanished for the rest of the film.
 */
export function bannerParts(lang, part) {
    const text = BANNER[lang](part);
    // Sized off the text rather than fixed: the Swahili and English strings
    // differ by enough that one width leaves one of them rattling in a box.
    const w = Math.min(SAFE.x1 - SAFE.x0, text.length * 15 + 56);
    return [
        rectPart('ban_bg', w, 58, { at: [540, 196], fill: 'paperLit', stroke: 'ink',
                                    strokeWidth: 3, alpha: 1, z: 300 }),
        textPart('ban_t', text, { at: [540, 196], font: `800 26px ${FONT}`, fill: 'ink',
                                  alpha: 1, z: 301, maxWidth: w - 32 }),
    ];
}

export const BANNER_IDS = ['ban_bg', 'ban_t'];

/**
 * The end card: what comes next, follow/share, the engine, and the disclaimer.
 *
 * About six seconds, not twenty. Retention falls off a cliff once the point
 * lands, so this is deliberately short -- but it is the one place the series
 * asks for anything, so every ask lives here and nowhere else.
 *
 * The disclaimer is last and smallest, and it is not optional. A series whose
 * first part is about people being scammed cannot skip the sentence the
 * scammers always skip.
 */
export function endCard(lang, part, nextLine) {
    const parts = [
        rectPart('card_bg', 1080, 1920, { at: [540, 960], fill: 'paperLit', alpha: 0, z: 400 }),
        textPart('card_next', nextLine, {
            at: [540, 660], font: `800 40px ${FONT}`, fill: 'gold',
            maxWidth: SAFE.x1 - SAFE.x0, lineHeight: 50, alpha: 0, z: 410 }),
        textPart('card_series', SERIES[lang].toUpperCase(), {
            at: [540, 838], font: `800 54px ${FONT}`, fill: 'ink', alpha: 0, z: 410 }),
        textPart('card_tag', TAGLINE[lang], {
            at: [540, 898], font: `700 29px ${FONT}`, fill: 'dim',
            maxWidth: SAFE.x1 - SAFE.x0, alpha: 0, z: 410 }),
        textPart('card_cta', CTA[lang](part), {
            at: [540, 1006], font: `800 32px ${FONT}`, fill: 'ink',
            maxWidth: SAFE.x1 - SAFE.x0, lineHeight: 42, alpha: 0, z: 410 }),
        textPart('card_share', SHARE[lang], {
            at: [540, 1090], font: `700 27px ${FONT}`, fill: 'dim',
            maxWidth: SAFE.x1 - SAFE.x0, alpha: 0, z: 410 }),
        pathPart('card_rule', `${M(380, 1156)} ${L(700, 1156)}`,
                 { stroke: 'rule', strokeWidth: 3, alpha: 0, z: 410 }),
        textPart('card_eng', ENGINE_AD[lang], {
            at: [540, 1206], font: `700 27px ${FONT}`, fill: 'dim',
            maxWidth: SAFE.x1 - SAFE.x0, lineHeight: 36, alpha: 0, z: 410 }),
        textPart('card_repo', REPO, {
            at: [540, 1262], font: `800 28px ${FONT}`, fill: 'ink', alpha: 0, z: 410 }),
        // Last, smallest, and present on all twenty films.
        textPart('card_disc', DISCLAIMER[lang], {
            at: [540, 1366], font: `700 25px ${FONT}`, fill: 'warn',
            maxWidth: SAFE.x1 - SAFE.x0, lineHeight: 33, alpha: 0, z: 410 }),
    ];
    return { parts, ids: parts.map((p) => p.id) };
}

/** When the title plate should arrive: under the hook line, not before it. */
export function titleAt(text, lang, { frac = 0.72, min = 2.2, max = 4.2 } = {}) {
    const span = estimateLine(text, { lang });
    return +Math.min(max, Math.max(min, span * frac)).toFixed(2);
}

/**
 * A gesture that ENDS.
 *
 * `{do:'pose', pose:'ask', at:0.3, for:0.6}` does not mean "gesture for 0.6
 * seconds". `for` is the transition SPAN -- the time taken to move into the
 * pose -- and the pose then holds until something else overwrites it. So a
 * character who asks a question in shot one still has their arm out three
 * shots later. This poses in, holds, and poses back, which is what the
 * authoring intent always was.
 */
export const gesture = (target, pose, at, { hold = 1.0, span = 0.4, rest = 'stand' } = {}) => [
    { target, do: 'pose', pose, at: +at.toFixed(3), for: span },
    { target, do: 'pose', pose: rest, at: +(at + span + hold).toFixed(3), for: span },
];

/**
 * One blink, as a pair of discrete swaps.
 *
 * A hand-authored `parts` character has no `blink` ACTION. `generate.js`
 * builds `idle`, `breathe`, `walk` and `blink` out of the proportions it was
 * given, and a rig that was drawn rather than generated gets none of them --
 * so `{do:'play', action:'blink'}` validates as an error and the warning
 * beside it ("Known: breathe, walk, blink, ...") is listing what a GENERATED
 * character would have had, which is misleading at exactly the wrong moment.
 * `lib/physics.mjs` hit this first and solved it the same way.
 *
 * `step` on both keys is correct here and almost nowhere else in this file: a
 * lid is discrete, so there is nothing to ease.
 *
 * Four channels, not two. The iris is a child of the eye and a shape swap on
 * the parent leaves the child alone -- but alpha IS inherited, so dropping
 * the iris takes its glint down as well.
 */
export function inkBlink(target, at, { shut = 0.11 } = {}) {
    const t3 = (v) => +Number(v).toFixed(3);
    const out = [];
    for (const side of ['L', 'R']) {
        out.push(
            { target, do: 'set', part: `eye${side}`, channel: 'props.lid',
              value: 'closed', at: t3(at), ease: 'step' },
            { target, do: 'set', part: `eye${side}`, channel: 'props.lid',
              value: 'open', at: t3(at + shut), ease: 'step' },
            { target, do: 'set', part: `iris${side}`, channel: 'props.alpha',
              value: 0, at: t3(at), ease: 'step' },
            { target, do: 'set', part: `iris${side}`, channel: 'props.alpha',
              value: 1, at: t3(at + shut), ease: 'step' },
        );
    }
    return out;
}

/** Blinks scattered across a shot, seeded so two characters never blink together. */
export function inkBlinks(target, duration, seed) {
    let a = seed >>> 0;
    const rnd = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let x = Math.imul(a ^ (a >>> 15), 1 | a);
        x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
    const out = [];
    for (let t = 0.8 + rnd() * 1.6; t < duration - 0.4; t += 2.1 + rnd() * 2.6) {
        out.push(...inkBlink(target, t));
    }
    return out;
}

/**
 * Derive every shot's duration from the narration it carries.
 *
 * `docs/27-RETENTION.md` argues the order matters: write the line, then let
 * the picture follow it. Authoring a duration by hand and writing into it is
 * the reverse, and it is the documented cause of the geology series leaving a
 * fifth of its runtime silent.
 *
 * A shot ends when BOTH are done -- the line, and the last thing that moves:
 *
 *   max(line.at + estimated span + pad,  last action + 0.35,  min)
 *
 * **The pad is tighter than any series before this one.** 90 seconds was the
 * brief, and at 0.85 s of tail per shot a sixteen-line part spends fourteen
 * seconds -- a sixth of the film -- on silence after somebody has stopped
 * talking. `27-RETENTION.md` already measured our films at 54% speech against
 * the references' 73% and named exactly this as the cause.
 *
 * `lang` is not optional and has no default, because this series is built
 * twice. An English film silently estimated at Swahili's rate, or the
 * reverse, fits every shot to the wrong length and the error is invisible
 * until the render -- so the caller has to say which it is.
 */
export function fitShots(film, lang, { pad = 0.55, min = 2.2, hookPad = 0.15 } = {}) {
    if (lang !== 'en' && lang !== 'sw') throw new Error(`fitShots: lang must be en|sw, got ${lang}`);
    let first = true;
    for (const scene of film.scenes ?? []) {
        for (const shot of scene.shots ?? []) {
            // The FIRST shot gets almost no tail pad. Everywhere else half a
            // second of air after a line is breathing; in the opening it is
            // the one thing the retention sources agree is fatal -- "a pause
            // in the first eight seconds is an exit". Measured in
            // `../../docs/completed_phases/30-STRUCTURE-SERIES.md`: the ordinary pad dragged a Swahili
            // hook window to 74% against an 80% floor while its English twin
            // passed at 85%. Same staging, different language.
            const tail = first ? hookPad : pad;
            first = false;
            let needed = min;
            for (const line of shot.dialogue ?? []) {
                // The SPEAKER's rate, because a line's length depends on who
                // says it. On VoiceStudio every rate is 1 -- real people need
                // no delivery multiplier. On Piper the Swahili cast shares one
                // model and is separated by rate, so Juma at 1.10 finishes 9%
                // early and every one of his shots would hold on silence.
                needed = Math.max(needed,
                    (line.at ?? 0)
                        + estimateLine(line.text, { lang, rate: rateOf(lang, line.speaker) })
                        + tail);
            }
            for (const a of shot.actions ?? []) {
                // A flow loop is deliberately LONGER than its shot: `flow` is
                // periodic, so an over-long linear ramp costs nothing and
                // saves re-keying per cycle.
                if (a.do === 'set' && a.channel === 'props.flow') continue;
                // Blinks are decoration spread across a shot, not a beat the
                // shot must wait for. They are generated against a GUESSED
                // duration, so sizing the shot to fit them makes the guess
                // self-fulfilling -- a shot guessed at 6 s grows to 6 s
                // because of the blink that was scattered on the assumption
                // it would be 6 s long.
                //
                // `play blink` covers a generated rig. This series has none:
                // `inkBlink` writes discrete `set`s instead, so both of its
                // channels have to be named here. Without this the whole
                // mechanism is circular and silently so.
                if (a.do === 'play' && a.action === 'blink') continue;
                if (a.do === 'set' && a.channel === 'props.lid') continue;
                if (a.do === 'set' && /^iris[LR]$/.test(a.part ?? '')) continue;
                needed = Math.max(needed, (a.at ?? 0) + (a.for ?? 0) + 0.35);
            }
            shot.duration = +needed.toFixed(2);
        }
    }
    return film;
}

// ---------------------------------------------------------------------------
// The chart
// ---------------------------------------------------------------------------

/**
 * A candlestick chart, built from boxes rather than drawn into a texture.
 *
 * `scripts/make-orderblock.mjs` made this choice first and the reasoning
 * still holds: a candlestick IS a box and a zone IS a translucent slab, so
 * keeping them as ordinary parts puts the one region of the screen that has
 * to animate -- candles printing, a level being hit, a zone appearing --
 * inside the ordinary timeline, with no canvas texture anywhere.
 *
 * Each candle is TWO parts under a shared index, so `upTo(i)` can print the
 * chart one bar at a time, which is how every "watch what happens next" beat
 * in this series works.
 *
 * `series` is `[{o,h,l,c}, ...]`, written out rather than randomised: the
 * teaching point is always a specific shape, and a random walk will not
 * reliably produce the one being named.
 */
export function chartParts(id, series, {
    box = { x0: 96, y0: 560, x1: 984, y1: 1150 },
    padFrac = 0.1, z = 10, width = 0.62, grid = 3, axis = true,
} = {}) {
    const lo0 = Math.min(...series.map((d) => d.l));
    const hi0 = Math.max(...series.map((d) => d.h));
    const pad = (hi0 - lo0) * padFrac || 1;
    const lo = lo0 - pad;
    const hi = hi0 + pad;

    const y = (p) => box.y1 - ((p - lo) / (hi - lo)) * (box.y1 - box.y0);
    const step = (box.x1 - box.x0) / series.length;
    const x = (i) => box.x0 + (i + 0.5) * step;
    const cw = step * width;

    const parts = [];
    if (axis) {
        parts.push(pathPart(`${id}_frame`,
            `${M(box.x0, box.y0)} ${L(box.x0, box.y1)} ${L(box.x1, box.y1)}`,
            { stroke: 'rule', strokeWidth: 3, alpha: 0, z: z - 2 }));
    }
    for (let g = 1; g <= grid; g++) {
        const gy = box.y0 + ((box.y1 - box.y0) * g) / (grid + 1);
        parts.push(pathPart(`${id}_g${g}`, `${M(box.x0, gy)} ${L(box.x1, gy)}`,
            { stroke: 'rule', strokeWidth: 2, alpha: 0, z: z - 3 }));
    }

    const ids = [];
    series.forEach((d, i) => {
        const up = d.c >= d.o;
        const fill = up ? 'bull' : 'bear';
        const top = y(Math.max(d.o, d.c));
        const bot = y(Math.min(d.o, d.c));
        // A doji closes where it opened, so its body is zero tall and
        // disappears. Three units is the thinnest bar that still reads as a
        // bar rather than as a missing candle.
        const h = Math.max(3, bot - top);
        parts.push(
            pathPart(`${id}w${i}`, `${M(x(i), y(d.h))} ${L(x(i), y(d.l))}`,
                     { stroke: 'ink', strokeWidth: 3, alpha: 0, z }),
            rectPart(`${id}b${i}`, cw, h,
                     { at: [x(i), (top + bot) / 2], fill, stroke: 'ink', strokeWidth: 3,
                       alpha: 0, z: z + 1 }),
        );
        ids.push([`${id}w${i}`, `${id}b${i}`]);
    });

    const frameIds = parts.filter((p) => /_frame$|_g\d+$/.test(p.id)).map((p) => p.id);
    return {
        parts, ids, frameIds, box, lo, hi, x, y, cw, step,
        /** Both parts of candle `i`. */
        candle: (i) => ids[i],
        /** Every candle from `a` to `b` inclusive, flat, for a staggered build. */
        upTo: (b, a = 0) => ids.slice(a, b + 1).flat(),
        all: () => ids.flat(),
    };
}

/**
 * A horizontal price level, with a label on the left inside the chart.
 *
 * `level` blue, because a level the market keeps reacting to is a fact about
 * the data. A line somebody drew because it looked nice is a `zone` and gets
 * the other colour. See the header.
 */
export const levelParts = (id, yAt, label, {
    x0 = 96, x1 = 984, fill = 'level', z = 30, dash = true, labelAt = null,
} = {}) => [
    pathPart(`${id}_l`, dash
        ? Array.from({ length: Math.ceil((x1 - x0) / 34) }, (_, i) => {
            const a = x0 + i * 34;
            return `${M(a, yAt)} ${L(Math.min(a + 20, x1), yAt)}`;
        }).join(' ')
        : `${M(x0, yAt)} ${L(x1, yAt)}`,
          { stroke: fill, strokeWidth: 4, alpha: 0, z }),
    textPart(`${id}_t`, label, {
        at: labelAt ?? [x0 + 10, yAt - 26], font: `800 27px ${FONT}`, fill,
        align: 'left', alpha: 0, z: z + 1, maxWidth: x1 - x0 - 20 }),
];

/**
 * A zone: a translucent slab somebody DREW on the chart.
 *
 * Always `zone` violet, always with its label outside the band so the band
 * can be semi-transparent without the text going grey with it.
 */
export const zoneParts = (id, yTop, yBot, label, {
    x0 = 96, x1 = 984, fill = 'zone', z = 8, alphaTo = 0.3,
} = {}) => [
    rectPart(`${id}_z`, x1 - x0, Math.abs(yBot - yTop),
             { at: [(x0 + x1) / 2, (yTop + yBot) / 2], fill, alpha: 0, z }),
    pathPart(`${id}_e`, `${M(x0, yTop)} ${L(x1, yTop)} ${M(x0, yBot)} ${L(x1, yBot)}`,
             { stroke: fill, strokeWidth: 3, alpha: 0, z: z + 1 }),
    ...(label ? [textPart(`${id}_t`, label, {
        at: [x1 - 10, yTop - 24], font: `800 26px ${FONT}`, fill,
        align: 'right', alpha: 0, z: z + 2, maxWidth: x1 - x0 - 20 })] : []),
];

/** The target alpha a zone slab ramps to. Exported so a part cannot guess. */
export const ZONE_ALPHA = 0.3;

// ---------------------------------------------------------------------------
// The money
// ---------------------------------------------------------------------------

/**
 * The base/quote plate: one pair, split, with what each side means.
 *
 * The whole of part two turns on this one picture, so it is a shared helper
 * rather than a drawing in one file -- parts three, four and ten all point
 * back at it, and they have to point at the same thing.
 */
export function pairParts(id, { base, quote, rate, baseL, quoteL, line, at = [540, 700] }) {
    const [cx, cy] = at;
    return {
        parts: [
            rectPart(`${id}_bg`, 860, 190, { at: [cx, cy], fill: 'paperLit', stroke: 'ink',
                                             strokeWidth: 4, alpha: 0, z: 10 }),
            textPart(`${id}_base`, base, { at: [cx - 196, cy - 18], font: `800 92px ${FONT}`,
                                           fill: 'bull', alpha: 0, z: 12 }),
            textPart(`${id}_slash`, '/', { at: [cx, cy - 18], font: `800 92px ${FONT}`,
                                           fill: 'dim', alpha: 0, z: 12 }),
            textPart(`${id}_quote`, quote, { at: [cx + 196, cy - 18], font: `800 92px ${FONT}`,
                                             fill: 'level', alpha: 0, z: 12 }),
            textPart(`${id}_bl`, baseL, { at: [cx - 196, cy + 58], font: `800 28px ${FONT}`,
                                          fill: 'bull', alpha: 0, z: 12, maxWidth: 380 }),
            textPart(`${id}_ql`, quoteL, { at: [cx + 196, cy + 58], font: `800 28px ${FONT}`,
                                           fill: 'level', alpha: 0, z: 12, maxWidth: 380 }),
            textPart(`${id}_rate`, rate, { at: [cx, cy + 162], font: `800 76px ${FONT}`,
                                           fill: 'ink', alpha: 0, z: 12 }),
            textPart(`${id}_line`, line, { at: [cx, cy + 236], font: `700 31px ${FONT}`,
                                           fill: 'dim', alpha: 0, z: 12,
                                           maxWidth: SAFE.x1 - SAFE.x0, lineHeight: 40 }),
        ],
        ids: [`${id}_bg`, `${id}_base`, `${id}_slash`, `${id}_quote`,
              `${id}_bl`, `${id}_ql`, `${id}_rate`, `${id}_line`],
        pairIds: [`${id}_bg`, `${id}_base`, `${id}_slash`, `${id}_quote`],
        meanIds: [`${id}_bl`, `${id}_ql`],
    };
}

/**
 * An order ticket, the shape MT4 and MT5 both put it in.
 *
 * Field order is the thing being taught and is faithful: symbol, volume,
 * stop loss, take profit, then the two coloured buttons with Sell on the LEFT
 * and Buy on the right. A beginner who learns the order backwards will one
 * day click the wrong one in a hurry, which is the entire reason this is
 * drawn at all rather than described.
 *
 * `rows` is `[[label, value, accent?], ...]` so the same helper draws the MT4
 * ticket, the MT5 ticket and the "what you got wrong" version.
 */
export function ticketParts(id, { title, rows, sell, buy, at = [540, 820], w = 760 }) {
    const [cx, cy] = at;
    const rowH = 84;
    const top = cy - (rows.length * rowH) / 2 - 10;
    const parts = [
        rectPart(`${id}_win`, w, rows.length * rowH + 190,
                 { at: [cx, cy + 56], fill: 'paperLit', stroke: 'ink', strokeWidth: 5,
                   alpha: 0, z: 10 }),
        rectPart(`${id}_bar`, w, 62,
                 { at: [cx, cy - (rows.length * rowH) / 2 - 50], fill: 'paperDim',
                   stroke: 'ink', strokeWidth: 5, alpha: 0, z: 11 }),
        textPart(`${id}_title`, title,
                 { at: [cx, cy - (rows.length * rowH) / 2 - 50], font: `800 30px ${FONT}`,
                   fill: 'ink', alpha: 0, z: 12, maxWidth: w - 40 }),
    ];
    const ids = [];
    rows.forEach(([label, value, accent], i) => {
        const y = top + i * rowH + rowH / 2;
        const rid = `${id}_r${i}`;
        parts.push(
            rectPart(`${rid}_box`, w - 56, rowH - 18,
                     { at: [cx, y], fill: 'paper', stroke: 'rule', strokeWidth: 3,
                       alpha: 0, z: 12 }),
            textPart(`${rid}_l`, label,
                     { at: [cx - w / 2 + 44, y], font: `700 27px ${FONT}`, fill: 'dim',
                       align: 'left', alpha: 0, z: 13, maxWidth: w * 0.52 }),
            textPart(`${rid}_v`, value,
                     { at: [cx + w / 2 - 44, y], font: `800 30px ${FONT}`,
                       fill: accent ?? 'ink', align: 'right', alpha: 0, z: 13,
                       maxWidth: w * 0.44 }),
        );
        ids.push([`${rid}_box`, `${rid}_l`, `${rid}_v`]);
    });
    const by = top + rows.length * rowH + 52;
    parts.push(
        rectPart(`${id}_sell`, (w - 76) / 2, 76,
                 { at: [cx - (w - 60) / 4, by], fill: 'bear', stroke: 'ink',
                   strokeWidth: 4, alpha: 0, z: 14 }),
        textPart(`${id}_sellt`, sell, { at: [cx - (w - 60) / 4, by],
                 font: `800 32px ${FONT}`, fill: 'white', alpha: 0, z: 15 }),
        rectPart(`${id}_buy`, (w - 76) / 2, 76,
                 { at: [cx + (w - 60) / 4, by], fill: 'bull', stroke: 'ink',
                   strokeWidth: 4, alpha: 0, z: 14 }),
        textPart(`${id}_buyt`, buy, { at: [cx + (w - 60) / 4, by],
                 font: `800 32px ${FONT}`, fill: 'white', alpha: 0, z: 15 }),
    );
    return {
        parts, rowIds: (i) => ids[i], allRowIds: ids.flat(),
        chromeIds: [`${id}_win`, `${id}_bar`, `${id}_title`],
        buttonIds: [`${id}_sell`, `${id}_sellt`, `${id}_buy`, `${id}_buyt`],
        bottom: by + 50,
    };
}

/**
 * The risk:reward ladder -- the spine of the whole series.
 *
 * An entry line, a stop below it and a target above, drawn so the two
 * distances are literally measurable against each other on screen. The
 * teaching is entirely in the PROPORTION, so the bars are drawn to scale from
 * `risk` and `reward` rather than at fixed heights: a 1:3 that does not look
 * like a 1:3 teaches the opposite of the lesson.
 */
export function rrParts(id, { risk = 1, reward = 3, entryY = 880, unit = 86,
    labels = {}, x0 = 300, w = 420, z = 20 } = {}) {
    const stopY = entryY + risk * unit;
    const targY = entryY - reward * unit;
    const cx = x0 + w / 2;
    return {
        parts: [
            rectPart(`${id}_rbar`, w, risk * unit,
                     { at: [cx, entryY + (risk * unit) / 2], fill: 'bear', alpha: 0, z }),
            rectPart(`${id}_wbar`, w, reward * unit,
                     { at: [cx, entryY - (reward * unit) / 2], fill: 'bull', alpha: 0, z }),
            pathPart(`${id}_entry`, `${M(x0 - 40, entryY)} ${L(x0 + w + 40, entryY)}`,
                     { stroke: 'ink', strokeWidth: 5, alpha: 0, z: z + 3 }),
            pathPart(`${id}_stop`, `${M(x0 - 40, stopY)} ${L(x0 + w + 40, stopY)}`,
                     { stroke: 'bear', strokeWidth: 5, alpha: 0, z: z + 3 }),
            pathPart(`${id}_targ`, `${M(x0 - 40, targY)} ${L(x0 + w + 40, targY)}`,
                     { stroke: 'bull', strokeWidth: 5, alpha: 0, z: z + 3 }),
            textPart(`${id}_el`, labels.entry ?? 'ENTRY',
                     { at: [x0 + w + 54, entryY], font: `800 28px ${FONT}`, fill: 'ink',
                       align: 'left', alpha: 0, z: z + 4, maxWidth: 240 }),
            textPart(`${id}_sl`, labels.stop ?? 'STOP',
                     { at: [x0 + w + 54, stopY], font: `800 28px ${FONT}`, fill: 'bear',
                       align: 'left', alpha: 0, z: z + 4, maxWidth: 240 }),
            textPart(`${id}_tl`, labels.target ?? 'TARGET',
                     { at: [x0 + w + 54, targY], font: `800 28px ${FONT}`, fill: 'bull',
                       align: 'left', alpha: 0, z: z + 4, maxWidth: 240 }),
            textPart(`${id}_rn`, `${risk}R`,
                     { at: [x0 - 54, entryY + (risk * unit) / 2], font: `800 34px ${FONT}`,
                       fill: 'bear', align: 'right', alpha: 0, z: z + 4 }),
            textPart(`${id}_wn`, `${reward}R`,
                     { at: [x0 - 54, entryY - (reward * unit) / 2], font: `800 34px ${FONT}`,
                       fill: 'bull', align: 'right', alpha: 0, z: z + 4 }),
        ],
        riskIds: [`${id}_rbar`, `${id}_stop`, `${id}_sl`, `${id}_rn`],
        rewardIds: [`${id}_wbar`, `${id}_targ`, `${id}_tl`, `${id}_wn`],
        entryIds: [`${id}_entry`, `${id}_el`],
        stopY, targY, entryY,
    };
}

/**
 * An equity curve: what the account did over many trades.
 *
 * Drawn as a `drawing`-free polyline that is revealed by `trim` ramping --
 * except `trim` is read as an OBJECT by `shapes.js` and the interpolator
 * cannot ramp objects, which `lib/diagram.mjs` documents at length. So this
 * returns the path in segments and the caller stages them, which is cruder
 * and actually works.
 */
export function equityParts(id, points, {
    box = { x0: 140, y0: 600, x1: 940, y1: 1080 }, fill = 'bull', z = 20, segments = 6,
} = {}) {
    const lo = Math.min(...points);
    const hi = Math.max(...points);
    const x = (i) => box.x0 + (i / (points.length - 1)) * (box.x1 - box.x0);
    const y = (v) => box.y1 - ((v - lo) / ((hi - lo) || 1)) * (box.y1 - box.y0);
    const pts = points.map((v, i) => [x(i), y(v)]);
    const per = Math.ceil(pts.length / segments);
    const parts = [
        pathPart(`${id}_ax`, `${M(box.x0, box.y0)} ${L(box.x0, box.y1)} ${L(box.x1, box.y1)}`,
                 { stroke: 'rule', strokeWidth: 3, alpha: 0, z: z - 1 }),
    ];
    const ids = [];
    for (let s = 0; s < segments; s++) {
        const a = s * per;
        const b = Math.min(pts.length - 1, (s + 1) * per);
        if (a >= b) continue;
        const sid = `${id}_s${s}`;
        parts.push(pathPart(sid, smooth(pts.slice(a, b + 1)),
            { stroke: fill, strokeWidth: 6, alpha: 0, z, lineCap: 'round' }));
        ids.push(sid);
    }
    return { parts, ids, axisId: `${id}_ax`, x, y, pts };
}

/**
 * A big labelled arrow, for "this causes that".
 *
 * `arrowPath` draws it; this wraps it with the label so the two reveal
 * together, which is the only way they are ever used.
 */
export const arrowParts = (id, from, to, label, {
    fill = 'ink', z = 40, head = 26, width = 8, labelAt = null,
} = {}) => [
    pathPart(`${id}_a`, arrowPath(from, to, { head, width }),
             { fill, stroke: fill, strokeWidth: 2, alpha: 0, z }),
    ...(label ? [textPart(`${id}_t`, label, {
        at: labelAt ?? [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 - 36],
        font: `800 28px ${FONT}`, fill, alpha: 0, z: z + 1,
        maxWidth: SAFE.x1 - SAFE.x0 })] : []),
];

/**
 * A tick-or-cross verdict mark, for the checklist parts.
 *
 * Hand-drawn rather than a glyph, because the series font has no tick that
 * matches the ink weight and a system glyph in the middle of a drawn frame
 * reads as a pasted icon.
 */
export const markParts = (id, ok, at, { size = 44, z = 60 } = {}) => [
    pathPart(id, ok
        ? `${M(at[0] - size * 0.5, at[1])} ${L(at[0] - size * 0.12, at[1] + size * 0.4)} `
          + `${L(at[0] + size * 0.54, at[1] - size * 0.46)}`
        : `${M(at[0] - size * 0.42, at[1] - size * 0.42)} ${L(at[0] + size * 0.42, at[1] + size * 0.42)} `
          + `${M(at[0] + size * 0.42, at[1] - size * 0.42)} ${L(at[0] - size * 0.42, at[1] + size * 0.42)}`,
        { stroke: ok ? 'good' : 'warn', strokeWidth: 9, alpha: 0, z, lineCap: 'round' }),
];

/**
 * Paper texture: a scatter of lighter flecks over the field.
 *
 * `anime8` is a scanned-paper look with visible grain and drifting white
 * specks, and without something in the empty half of the frame a flat fill at
 * this size reads as a rendering error rather than as paper. Seeded, so the
 * texture is identical on every run and on both language cuts.
 */
export function grainParts(id, { count = 54, seed = 7, z = -200 } = {}) {
    let a = seed >>> 0;
    const r = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const parts = [];
    for (let i = 0; i < count; i++) {
        const rx = 2 + r() * 7;
        parts.push({
            id: `${id}${i}`, parent: null, pivot: [0, 0],
            at: [n(r() * 1080), n(140 + r() * 1700)],
            shape: { kind: 'ellipse', rx: n(rx), ry: n(rx * (0.6 + r() * 0.5)) },
            fill: r() > 0.3 ? 'paperLit' : 'paperDim',
            alpha: n(0.2 + r() * 0.3), z,
        });
    }
    return parts;
}
