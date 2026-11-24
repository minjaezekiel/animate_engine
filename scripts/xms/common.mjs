/**
 * The visual vocabulary of the XMS commercial.
 *
 * The whole film is one object -- a phone -- plus the things that happen on
 * its screen. So rather than a diagram kit, what is here is a small UI kit:
 * a handset, a chat bubble, a hidden bubble, a status chip, a signal meter, a
 * padlock. Everything else (cards, stats, staggered builds) comes from
 * `../lib/boards.mjs` and `../lib/diagram.mjs` unchanged.
 *
 * Three engine facts shape all of it:
 *
 * 1. **Canvas2D has no rounded rectangle.** `drawShape`'s `rect` case calls
 *    `fillRect`, so every rounded corner in a UI mock has to be drawn as a
 *    `path`. `roundRect` below is that path.
 * 2. **A part has no `rot`.** `KNOWN.part` carries no transform at all, so a
 *    tilted thing is drawn tilted.
 * 3. **A multi-line text part anchors on its LAST line.** Centring a
 *    two-line bubble label on the bubble's centre therefore hangs it out of
 *    the top. `textBlockY` does the arithmetic once.
 */
import {
    FONT, L, M, Q, SAFE, ellipsePart, pathPart, poly, rectPart, textPart, widthOf,
} from '../lib/diagram.mjs';
import { BANNER, CTA, DOWNLOAD, SIGNOFF, STORE, TAGLINE, XMS_PALETTE, rateOf }
    from '../lib/xms.mjs';
import { estimateLine } from '../../src/core/script/pacing.js';

export {
    blinks, board, cardRows, castBoard, rng, statParts,
} from '../lib/boards.mjs';

import { rng } from '../lib/boards.mjs';

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

/** A rounded rectangle, centred, as path data. */
export function roundRect(cx, cy, w, h, r = 24) {
    return roundRectC(cx, cy, w, h, [r, r, r, r]);
}

/**
 * A rounded rectangle with a radius per corner, clockwise from top-left.
 *
 * Needed because an XMS bubble is not uniformly rounded: `bubble_outgoing.xml`
 * is 18dp on three corners and **4dp on the bottom-right**, and the incoming
 * one mirrors it at the bottom-left. That one small corner is the "tail" that
 * marks which side sent the message, and a mock-up with four equal corners is
 * recognisably not this app.
 */
export function roundRectC(cx, cy, w, h, [tl, tr, br, bl]) {
    const x0 = cx - w / 2, y0 = cy - h / 2, x1 = cx + w / 2, y1 = cy + h / 2;
    const m = Math.min(w, h) / 2;
    const [a, b, c, d] = [tl, tr, br, bl].map((v) => Math.min(v, m));
    return `${M(x0 + a, y0)} ${L(x1 - b, y0)} ${Q(x1, y0, x1, y0 + b)} `
        + `${L(x1, y1 - c)} ${Q(x1, y1, x1 - c, y1)} `
        + `${L(x0 + d, y1)} ${Q(x0, y1, x0, y1 - d)} `
        + `${L(x0, y0 + a)} ${Q(x0, y0, x0 + a, y0)} Z`;
}

/**
 * The `at.y` for a text part of `lines` lines whose BLOCK should sit centred
 * on `cy`. The anchor is the last line, not the middle of the stack, which is
 * how four captions in a row once printed over their own headings.
 */
export const textBlockY = (cy, lines, lineHeight) =>
    cy + ((lines - 1) * lineHeight) / 2;

// ---------------------------------------------------------------------------
// The handset, built to the app's real layouts
// ---------------------------------------------------------------------------

/** The default handset: big enough to read at arm's length in a phone feed. */
export const PHONE = { cx: 540, cy: 898, w: 476, h: 840 };

/**
 * A handset running XMS's chat screen.
 *
 * Built from `app/src/main/res/layout/activity_chat.xml`, top to bottom,
 * because the first version of this kit was a generic blue chat and a viewer
 * who installed the app would not have recognised it:
 *
 *   MaterialToolbar     back arrow at the LEFT, contact name left-aligned
 *   RecyclerView        the message list
 *   ChipGroup           the send-mode chip (lock icon + "Private encrypted
 *                       SMS"), and the SIM chip on a dual-SIM phone
 *   input row           attach (paperclip), "Type a message...", send button
 *
 * `mode` and `sim` are the chips; pass `plain: true` for a stock, non-XMS
 * messaging app, which has neither chip and is what the recipient without
 * XMS is looking at.
 */
export function phoneParts(id, {
    cx = PHONE.cx, cy = PHONE.cy, w = PHONE.w, h = PHONE.h, z = 0,
    title = null, mode = null, sim = null, hint = 'Type a message…',
    plain = false, surface = 'surface', screen = 'screen', accent = 'blue',
} = {}) {
    const bezel = 16;
    const sw = w - bezel * 2, sh = h - bezel * 2;
    const scr = { x0: cx - sw / 2, x1: cx + sw / 2, y0: cy - sh / 2, y1: cy + sh / 2, cx, w: sw };
    const barH = 78;
    const inputH = 72;
    const chipH = mode || sim ? 52 : 0;
    const parts = [
        pathPart(`${id}_body`, roundRect(cx, cy, w, h, 52),
                 { fill: 'chrome', stroke: 'chromeEdge', strokeWidth: 3, z }),
        pathPart(`${id}_scr`, roundRect(cx, cy, sw, sh, 40), { fill: screen, z: z + 1 }),
        // --- toolbar -------------------------------------------------------
        pathPart(`${id}_bar`, roundRectC(cx, scr.y0 + barH / 2, sw, barH, [40, 40, 0, 0]),
                 { fill: surface, z: z + 2 }),
        pathPart(`${id}_rule`, `${M(scr.x0, scr.y0 + barH)} ${L(scr.x1, scr.y0 + barH)}`,
                 { stroke: 'outline', strokeWidth: 2, z: z + 3 }),
        rectPart(`${id}_slot`, 86, 8, { at: [cx, cy - h / 2 + 26], fill: '#26303f', z: z + 4 }),
    ];
    // The back arrow: a chevron plus a shaft, left-aligned, as ic_arrow_back.
    const ax = scr.x0 + 40, ay = scr.y0 + barH / 2;
    parts.push(pathPart(`${id}_back`,
        `${M(ax + 13, ay - 13)} ${L(ax, ay)} ${L(ax + 13, ay + 13)} ${M(ax, ay)} ${L(ax + 26, ay)}`,
        { stroke: 'ink', strokeWidth: 3.5, z: z + 4, lineCap: 'round', lineJoin: 'round' }));
    if (title) {
        // LEFT-aligned, beside the arrow. A centred title is the single most
        // obvious tell that a chat mock-up is not a Material toolbar.
        parts.push(textPart(`${id}_title`, title, {
            at: [scr.x0 + 82, ay + 2], font: `700 31px ${FONT}`, fill: 'ink', align: 'left',
            z: z + 4, maxWidth: sw - 140 }));
    }

    // --- the input row, pinned to the bottom of the screen -----------------
    const iy = scr.y1 - inputH / 2 - 6;
    parts.push(
        pathPart(`${id}_in`, roundRectC(cx, iy + 3, sw, inputH + 12, [0, 0, 36, 36]),
                 { fill: surface, z: z + 2 }),
        // paperclip
        // ic_attach: the hook of a paperclip -- down the long side, round the
        // bend, and back up short of where it started. Drawn with a lean to
        // the right, because a symmetrical one reads as the letter U.
        pathPart(`${id}_clip`,
            `${M(scr.x0 + 48, iy - 18)} ${L(scr.x0 + 33, iy + 8)} `
            + `${Q(scr.x0 + 27, iy + 20, scr.x0 + 38, iy + 24)} `
            + `${Q(scr.x0 + 49, iy + 27, scr.x0 + 54, iy + 15)} `
            + `${L(scr.x0 + 68, iy - 12)} `
            + `${Q(scr.x0 + 74, iy - 24, scr.x0 + 63, iy - 28)} `
            + `${Q(scr.x0 + 52, iy - 31, scr.x0 + 46, iy - 19)}`,
            { fill: null, stroke: 'system', strokeWidth: 3.5, z: z + 4,
              lineCap: 'round', lineJoin: 'round' }),
        textPart(`${id}_hint`, hint, { at: [scr.x0 + 92, iy + 2], font: `600 25px ${FONT}`,
                                       fill: 'system', align: 'left', z: z + 4,
                                       maxWidth: sw - 160 }),
        // The send button carries `bubble_outgoing` as its background, so it
        // is the outgoing-bubble colour, not a flat accent.
        pathPart(`${id}_send`, roundRect(scr.x1 - 44, iy, 56, 56, 18),
                 { fill: plain ? 'recv' : 'sent', z: z + 4 }),
        pathPart(`${id}_tri`, poly([[scr.x1 - 55, iy - 11], [scr.x1 - 31, iy],
                                    [scr.x1 - 55, iy + 11]], true),
                 { fill: plain ? 'system' : 'sentInk', z: z + 5 }));

    // --- the chip row, above the input row ---------------------------------
    const ids = { mode: [], sim: [] };
    if (chipH) {
        const chy = iy - inputH / 2 - 6 - chipH / 2;
        let x = scr.x0 + 16;
        if (mode) {
            const f = `600 23px ${FONT}`;
            const cw = widthOf(mode, f) + 76;
            parts.push(
                pathPart(`${id}_mc`, roundRect(x + cw / 2, chy, cw, 44, 22),
                         { fill: 'surface', stroke: 'outline', strokeWidth: 2, z: z + 4 }),
                // ic_lock, tinted colorPrimary, as the layout specifies.
                ...lockParts(`${id}_ml`, [x + 26, chy + 3],
                             { w: 18, h: 16, fill: accent, z: z + 5,
                               strokeWidth: 2.5, keyhole: surface }),
                textPart(`${id}_mt`, mode, { at: [x + 46, chy + 2], font: f, fill: 'ink',
                                             align: 'left', z: z + 5, maxWidth: cw - 60 }));
            ids.mode = [`${id}_mc`, `${id}_ml_sh`, `${id}_ml_bd`, `${id}_ml_kh`, `${id}_mt`];
            x += cw + 10;
        }
        if (sim) {
            const f = `600 23px ${FONT}`;
            const cw = widthOf(sim, f) + 40;
            parts.push(
                pathPart(`${id}_sc`, roundRect(x + cw / 2, chy, cw, 44, 22),
                         { fill: 'surface', stroke: 'outline', strokeWidth: 2, z: z + 4 }),
                textPart(`${id}_st`, sim, { at: [x + cw / 2, chy + 2], font: f, fill: 'ink',
                                            z: z + 5, maxWidth: cw - 20 }));
            ids.sim = [`${id}_sc`, `${id}_st`];
        }
    }

    return {
        parts, ids: parts.map((x) => x.id), screen: scr, chipIds: ids,
        /** The first row a bubble may occupy. */
        top: scr.y0 + barH + 22,
        /** The last y a bubble may reach before the chips and input bar. */
        floor: iy - inputH / 2 - 12 - chipH,
    };
}

/**
 * A chat bubble, with the app's tail corner.
 *
 * `side` is `right` for a message you sent and `left` for one you received --
 * the one convention every messaging app shares, and therefore the one that
 * needs no explaining on screen. `maxWidth` is 300dp in both item layouts.
 */
export function bubbleParts(id, text, {
    screen, top, w = 300, side = 'right', lines = 1, fill = null, textFill = null,
    font = `600 27px ${FONT}`, lineHeight = 34, z = 20, padX = 22, padY = 20, pad = 14,
} = {}) {
    const h = Math.max(lines * lineHeight + padY * 2, 68);
    const cx = side === 'right' ? screen.x1 - pad - w / 2 : screen.x0 + pad + w / 2;
    const cy = top + h / 2;
    const out = side === 'right';
    // 18dp on three corners, 4dp on the sender's own bottom corner.
    const R = out ? [26, 26, 7, 26] : [26, 26, 26, 7];
    return {
        parts: [
            pathPart(`${id}_b`, roundRectC(cx, cy, w, h, R),
                     { fill: fill ?? (out ? 'sent' : 'recv'), z }),
            textPart(`${id}_t`, text, {
                at: [cx, textBlockY(cy, lines, lineHeight)], font,
                fill: textFill ?? (out ? 'sentInk' : 'recvInk'),
                lineHeight, maxWidth: w - padX * 2, z: z + 1 }),
        ],
        ids: [`${id}_b`, `${id}_t`], bottom: top + h, cx, cy, h,
    };
}

/**
 * A HIDDEN bubble: the shape of a message with bars where the words are.
 *
 * This is the app's "Keep messages hidden" setting drawn literally -- the one
 * feature that is far easier to show than to say. Nothing about how it works
 * is on screen; only what the owner of the phone sees.
 */
export function hiddenBubbleParts(id, {
    screen, top, w = 300, side = 'right', bars = [0.82, 0.56], fill = null,
    z = 20, pad = 14, barH = 15, gap = 13, padY = 22,
} = {}) {
    const h = bars.length * barH + (bars.length - 1) * gap + padY * 2;
    const cx = side === 'right' ? screen.x1 - pad - w / 2 : screen.x0 + pad + w / 2;
    const cy = top + h / 2;
    const out = side === 'right';
    const parts = [pathPart(`${id}_b`, roundRectC(cx, cy, w, h,
                                                  out ? [26, 26, 7, 26] : [26, 26, 26, 7]),
                            { fill: fill ?? (out ? 'sent' : 'recv'), z })];
    bars.forEach((frac, i) => {
        const bw = (w - 44) * frac;
        const by = cy - h / 2 + padY + barH / 2 + i * (barH + gap);
        parts.push(pathPart(`${id}_x${i}`, roundRect(cx - w / 2 + 22 + bw / 2, by, bw, barH, 7),
                            { fill: out ? '#6f93c4' : '#5d6368', alpha: 0, z: z + 1 }));
    });
    for (const x of parts) x.alpha = 0;
    return { parts, ids: parts.map((x) => x.id), bottom: top + h, cx, cy, h };
}

/**
 * A conversation-list row, from `item_conversation.xml`: a 44dp circular
 * avatar whose colour is picked deterministically per contact, a title, a
 * subtitle, and an optional unread badge in the error colour.
 */
export function convRowParts(id, { name, preview, avatar = 'av1', badge = null,
                                   cx = 540, cy = 700, w = 900, h = 150, z = 10 } = {}) {
    const x0 = cx - w / 2;
    const parts = [
        pathPart(`${id}_bg`, roundRect(cx, cy, w, h, 22),
                 { fill: 'panel', stroke: 'outline', strokeWidth: 2, alpha: 0, z }),
        ellipsePart(`${id}_av`, 36, 36, { at: [x0 + 52, cy], fill: avatar, alpha: 0, z: z + 10 }),
        textPart(`${id}_in`, name.slice(0, 1).toUpperCase(), {
            at: [x0 + 52, cy + 2], font: `800 34px ${FONT}`, fill: '#ffffff',
            alpha: 0, z: z + 11 }),
        textPart(`${id}_nm`, name, { at: [x0 + 108, cy - 24], font: `700 34px ${FONT}`,
                                     fill: 'ink', align: 'left', alpha: 0, z: z + 10,
                                     maxWidth: w - 220 }),
        textPart(`${id}_pv`, preview, { at: [x0 + 108, cy + 22], font: `600 26px ${FONT}`,
                                        fill: 'dim', align: 'left', alpha: 0, z: z + 10,
                                        maxWidth: w - 220 }),
    ];
    const ids = [`${id}_bg`, `${id}_av`, `${id}_in`, `${id}_nm`, `${id}_pv`];
    if (badge) {
        parts.push(
            pathPart(`${id}_bd`, roundRect(cx + w / 2 - 52, cy, 48, 40, 14),
                     { fill: 'fail', alpha: 0, z: z + 10 }),
            textPart(`${id}_bt`, badge, { at: [cx + w / 2 - 52, cy + 2],
                                          font: `800 24px ${FONT}`, fill: 'failInk',
                                          alpha: 0, z: z + 11 }));
        ids.push(`${id}_bd`, `${id}_bt`);
    }
    return { parts, ids, cy, bottom: cy + h / 2 };
}

/** A status chip: a pill with a word in it. Sized to its own text. */
export function chipParts(id, text, {
    at, font = `700 26px ${FONT}`, fill = 'panelHi', textFill = 'ink',
    stroke = null, padX = 22, h = 48, z = 60, minW = 0,
} = {}) {
    const w = Math.max(minW, widthOf(text, font) + padX * 2);
    return {
        parts: [
            pathPart(`${id}_c`, roundRect(at[0], at[1], w, h, h / 2),
                     { fill, ...(stroke ? { stroke, strokeWidth: 2 } : {}), z }),
            textPart(`${id}_x`, text, { at: [at[0], at[1] + 2], font, fill: textFill,
                                        z: z + 1, maxWidth: w - padX }),
        ],
        ids: [`${id}_c`, `${id}_x`], w,
    };
}

/**
 * A QR code, for the contact-card scene.
 *
 * Drawn rather than encoded: the film needs something a viewer recognises as
 * a QR code in half a second, not a scannable one, and a real payload on a
 * billboard is a liability. The three finder squares are what make it read;
 * the modules between them are seeded noise, so the same code is drawn on
 * every render.
 */
export function qrParts(id, { cx = 540, cy = 800, size = 300, n = 17, seed = 7,
                              fill = '#0d1116', back = '#f7f9fb', z = 20 } = {}) {
    const m = size / n;
    const x0 = cx - size / 2, y0 = cy - size / 2;
    const r = rng(seed);
    const parts = [pathPart(`${id}_bg`, roundRect(cx, cy, size + 36, size + 36, 18),
                            { fill: back, alpha: 0, z })];
    // A finder square: 7x7 outer ring with a 3x3 solid centre.
    const finder = (gx, gy, k) => {
        const fx = x0 + (gx + 3.5) * m, fy = y0 + (gy + 3.5) * m;
        parts.push(
            pathPart(`${id}_f${k}a`, roundRect(fx, fy, m * 7, m * 7, 4),
                     { stroke: fill, strokeWidth: m, alpha: 0, z: z + 1 }),
            pathPart(`${id}_f${k}b`, roundRect(fx, fy, m * 3, m * 3, 2),
                     { fill, alpha: 0, z: z + 1 }));
    };
    finder(0, 0, 0); finder(n - 7, 0, 1); finder(0, n - 7, 2);
    const inFinder = (gx, gy) =>
        (gx < 8 && gy < 8) || (gx > n - 9 && gy < 8) || (gx < 8 && gy > n - 9);
    const blocks = [];
    for (let gy = 0; gy < n; gy++) {
        for (let gx = 0; gx < n; gx++) {
            if (inFinder(gx, gy) || r() > 0.45) continue;
            blocks.push([x0 + (gx + 0.5) * m, y0 + (gy + 0.5) * m]);
        }
    }
    // One part for every module would be ~130 nodes; one path is one node.
    parts.push(pathPart(`${id}_m`,
        blocks.map(([bx, by]) => roundRect(bx, by, m, m, 0)).join(' '),
        { fill, alpha: 0, z: z + 1 }));
    return { parts, ids: parts.map((x) => x.id) };
}

/**
 * A contact card panel: the avatar, the name, the number and a detail line.
 *
 * This is what a scan produces -- `ProfileActivity` lets the owner choose
 * which fields travel (name and phone always, then work, email and notes), so
 * the card shows exactly those and nothing the app does not carry.
 */
export function contactCardParts(id, { name, phone, detail = null,
                                       cx = 540, cy = 1150, w = 860, h = 212,
                                       avatar = 'av2', z = 30 } = {}) {
    const x0 = cx - w / 2;
    const parts = [
        pathPart(`${id}_bg`, roundRect(cx, cy, w, h, 24),
                 { fill: 'panel', stroke: 'blue', strokeWidth: 3, alpha: 0, z }),
        ellipsePart(`${id}_av`, 44, 44, { at: [x0 + 76, cy], fill: avatar, alpha: 0, z: z + 1 }),
        textPart(`${id}_in`, name.slice(0, 1).toUpperCase(), {
            at: [x0 + 76, cy + 3], font: `800 42px ${FONT}`, fill: '#ffffff',
            alpha: 0, z: z + 2 }),
        textPart(`${id}_nm`, name, { at: [x0 + 142, cy - 44], font: `800 38px ${FONT}`,
                                     fill: 'ink', align: 'left', alpha: 0, z: z + 1,
                                     maxWidth: w - 190 }),
        textPart(`${id}_ph`, phone, { at: [x0 + 142, cy + 6], font: `700 32px ${FONT}`,
                                      fill: 'blue', align: 'left', alpha: 0, z: z + 1,
                                      maxWidth: w - 190 }),
    ];
    const ids = parts.map((x) => x.id);
    if (detail) {
        parts.push(textPart(`${id}_dt`, detail, {
            at: [x0 + 142, cy + 56], font: `600 27px ${FONT}`, fill: 'dim', align: 'left',
            alpha: 0, z: z + 1, maxWidth: w - 190 }));
        ids.push(`${id}_dt`);
    }
    return { parts, ids };
}

/** A signal meter: four ascending bars, `lit` of them in the live colour. */
export function signalParts(id, [x, y], {
    lit = 4, n = 4, w = 9, gap = 7, step = 9, base = 14, live = 'good', dead = 'faint', z = 60,
} = {}) {
    const parts = [];
    for (let i = 0; i < n; i++) {
        const h = base + i * step;
        parts.push(rectPart(`${id}${i}`, w, h,
            { at: [x + i * (w + gap), y - h / 2], fill: i < lit ? live : dead, z }));
    }
    return { parts, ids: parts.map((p) => p.id) };
}

/** A circle with a slash through it, over whatever it is cancelling. */
export const banParts = (id, [cx, cy], { r = 46, fill = 'fail', z = 80, strokeWidth = 9 } = {}) => [
    pathPart(`${id}_o`, roundRect(cx, cy, r * 2, r * 2, r),
             { stroke: fill, strokeWidth, z }),
    pathPart(`${id}_s`, `${M(cx - r * 0.66, cy + r * 0.66)} ${L(cx + r * 0.66, cy - r * 0.66)}`,
             { stroke: fill, strokeWidth, z, lineCap: 'round' }),
];

/**
 * A padlock: a body and a shackle.
 *
 * Everything scales off `w`. The first version hardcoded an 11px shackle and
 * a 10x22 keyhole, which is right for the 150px padlock in the lock scene and
 * turns the 17px `ic_lock` inside the send-mode chip into a solid blob -- the
 * stroke was two thirds of the whole icon. A fixed stroke on a scalable glyph
 * is the bug; this is the fix.
 */
export function lockParts(id, [cx, cy], {
    w = 84, h = 70, fill = 'lock', z = 70, strokeWidth = null, keyhole = 'screen',
} = {}) {
    const r = w * 0.3;
    const sw = strokeWidth ?? Math.max(2.5, w * 0.075);
    return [
        pathPart(`${id}_sh`,
            `${M(cx - r, cy - h / 2)} ${L(cx - r, cy - h / 2 - r * 0.5)} `
            + `${Q(cx - r, cy - h / 2 - r * 1.6, cx, cy - h / 2 - r * 1.6)} `
            + `${Q(cx + r, cy - h / 2 - r * 1.6, cx + r, cy - h / 2 - r * 0.5)} `
            + `${L(cx + r, cy - h / 2)}`,
            { stroke: fill, strokeWidth: sw, z }),
        pathPart(`${id}_bd`, roundRect(cx, cy, w, h, Math.max(3, w * 0.17)), { fill, z: z + 1 }),
        rectPart(`${id}_kh`, Math.max(2, w * 0.12), Math.max(4, h * 0.31),
                 { at: [cx, cy + h * 0.04], fill: keyhole, z: z + 2 }),
    ];
}

/** An arrow from one point to another, drawn as a stroke plus a solid head. */
export function arrowParts(id, from, to, { fill = 'blue', width = 7, head = 22, z = 50 } = {}) {
    const [x0, y0] = from, [x1, y1] = to;
    const len = Math.hypot(x1 - x0, y1 - y0) || 1;
    const ux = (x1 - x0) / len, uy = (y1 - y0) / len;
    const bx = x1 - ux * head, by = y1 - uy * head;
    return [
        pathPart(`${id}_s`, `${M(x0, y0)} ${L(bx, by)}`,
                 { stroke: fill, strokeWidth: width, z, lineCap: 'round' }),
        pathPart(`${id}_h`, poly([[x1, y1],
                                  [bx - uy * head * 0.5, by + ux * head * 0.5],
                                  [bx + uy * head * 0.5, by - ux * head * 0.5]], true),
                 { fill, z }),
    ];
}

// ---------------------------------------------------------------------------
// Standing furniture
// ---------------------------------------------------------------------------

/**
 * The title plate, which does NOT open the film.
 *
 * Every retained opening in the reference narration front-loads speech, and a
 * card in the first two seconds spends the window the platform gives you. So
 * the hook plays over the picture and this arrives under it, a few seconds
 * in, by which time the viewer has decided to stay. docs/27-RETENTION.md.
 */
export const hookTitle = (kicker, title, sub = null) => [
    textPart('kicker', kicker, { at: [540, 318], font: `700 30px ${FONT}`, fill: 'blue',
                                 maxWidth: SAFE.x1 - SAFE.x0 }),
    textPart('title', title, { at: [540, 394], font: `800 68px ${FONT}`, fill: 'ink',
                               maxWidth: SAFE.x1 - SAFE.x0 }),
    ...(sub ? [textPart('titlesub', sub, { at: [540, 462], font: `600 31px ${FONT}`,
                                           fill: 'dim', maxWidth: SAFE.x1 - SAFE.x0 })] : []),
];

/** Where in a hook line the title plate should land. */
export function titleAt(text, lang, { frac = 0.78, min = 2.2, max = 5.0 } = {}) {
    return +Math.min(max, Math.max(min, estimateLine(text, { lang }) * frac)).toFixed(2);
}

/**
 * The pinned banner: a caption chip at the top of frame, up from frame one
 * and never moving, so a viewer arriving three seconds in -- which on these
 * platforms is most of them -- knows what they are watching.
 *
 * Authored at alpha 1 on purpose. A board re-cast in a new scene starts with
 * every part back at 0, so a banner that relied on a reveal would appear in
 * scene one and vanish for the rest of the film.
 */
export function bannerParts(lang) {
    const text = BANNER[lang];
    const font = `700 26px ${FONT}`;
    const w = Math.min(SAFE.x1 - SAFE.x0, widthOf(text, font) + 56);
    return [
        pathPart('ban_bg', roundRect(540, 196, w, 58, 29),
                 { fill: '#0e1724', stroke: '#27374d', strokeWidth: 2, alpha: 1, z: 300 }),
        textPart('ban_t', text, { at: [540, 198], font, fill: 'ink',
                                  alpha: 1, z: 301, maxWidth: w - 32 }),
    ];
}

export const BANNER_IDS = ['ban_bg', 'ban_t'];

/**
 * The end card: the sign-off, the ask, and where to get it.
 *
 * About seven seconds, not twenty. It is the one place the film asks for
 * anything, so every ask lives here and nowhere else.
 */
export function endCard(lang) {
    const parts = [
        rectPart('card_bg', 1080, 1920, { at: [540, 960], fill: '#03070d', alpha: 0, z: 400 }),
        // The wordmark.
        textPart('card_name', 'XMS', {
            at: [540, 712], font: `800 150px ${FONT}`, fill: 'blue', alpha: 0, z: 410 }),
        textPart('card_tag', TAGLINE[lang], {
            at: [540, 818], font: `600 33px ${FONT}`, fill: 'dim',
            maxWidth: SAFE.x1 - SAFE.x0, alpha: 0, z: 410 }),
        pathPart('card_rule', `${M(390, 890)} ${L(690, 890)}`,
                 { stroke: '#27374d', strokeWidth: 2, alpha: 0, z: 410 }),
        textPart('card_sign', SIGNOFF[lang], {
            at: [540, 972], font: `700 44px ${FONT}`, fill: 'ink',
            maxWidth: SAFE.x1 - SAFE.x0, lineHeight: 56, alpha: 0, z: 410 }),
        // The ask, in the one warm colour the film owns.
        textPart('card_cta', CTA[lang], {
            at: [540, 1086], font: `700 32px ${FONT}`, fill: 'gold',
            maxWidth: SAFE.x1 - SAFE.x0, lineHeight: 42, alpha: 0, z: 410 }),
        // Where to get it, twice: the line a viewer remembers, and the
        // address they can pause on and type.
        textPart('card_get', STORE[lang], {
            at: [540, 1192], font: `800 44px ${FONT}`, fill: 'ink', alpha: 0, z: 410 }),
        textPart('card_url', DOWNLOAD, {
            at: [540, 1254], font: `700 26px ${FONT}`, fill: 'blue', alpha: 0, z: 410 }),
        textPart('card_and', 'Android', {
            at: [540, 1306], font: `600 26px ${FONT}`, fill: 'dim', alpha: 0, z: 410 }),
    ];
    return { parts, ids: parts.map((p) => p.id) };
}

/**
 * A gesture that ENDS.
 *
 * `{do:'pose', pose:'hold', at:0.3, for:0.6}` does not mean "hold the pose
 * for 0.6 s". `for` is the transition SPAN, and the pose then holds until
 * something overwrites it -- which is why characters in the earlier series
 * stand there with an arm out three shots later. This poses in, holds, and
 * poses back.
 */
export const gesture = (target, pose, at, { hold = 1.1, span = 0.45, rest = 'stand' } = {}) => [
    { target, do: 'pose', pose, at: +at.toFixed(3), for: span },
    { target, do: 'pose', pose: rest, at: +(at + span + hold).toFixed(3), for: span },
];

/**
 * Derive every shot's duration from the narration it carries.
 *
 * Write the line, then let the picture follow it. Authoring a duration by
 * hand and writing into it is the reverse, and it is the documented cause of
 * an earlier series leaving a fifth of its runtime silent.
 *
 *   max(line.at + estimated span + pad,  last action + 0.4,  min)
 *
 * The pad is tighter than the explainer series use (0.6 against 0.85) and the
 * floor is lower, because this is a 110-second commercial: slack at the end
 * of a shot is the one thing a viewer in a feed will not sit through.
 *
 * `lang` is not optional and has no default, because the film is built twice.
 * An English cut silently estimated at Swahili's syllable rate fits every
 * shot to the wrong length, and the error is invisible until the render.
 */
export function fitShots(film, lang, { pad = 0.6, min = 2.2, hookPad = 0.15 } = {}) {
    if (lang !== 'en' && lang !== 'sw') throw new Error(`fitShots: lang must be en|sw, got ${lang}`);
    let first = true;
    for (const scene of film.scenes ?? []) {
        for (const shot of scene.shots ?? []) {
            // The FIRST shot gets almost no tail pad: a pause in the opening
            // seconds is an exit, and measurably so.
            const tail = first ? hookPad : pad;
            first = false;
            let needed = min;
            for (const line of shot.dialogue ?? []) {
                needed = Math.max(needed, (line.at ?? 0)
                    + estimateLine(line.text, { lang, rate: rateOf(lang, line.speaker) }) + tail);
            }
            for (const a of shot.actions ?? []) {
                // A flow loop is deliberately longer than its shot, and a
                // blink is decoration spread across one -- neither is a beat
                // the shot has to wait for.
                if (a.do === 'set' && a.channel === 'props.flow') continue;
                if (a.do === 'play' && a.action === 'blink') continue;
                needed = Math.max(needed, (a.at ?? 0) + (a.for ?? 0) + 0.4);
            }
            shot.duration = +needed.toFixed(2);
        }
    }
    return film;
}

export { XMS_PALETTE };

