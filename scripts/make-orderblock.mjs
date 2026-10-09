/**
 * Build demo/orderblock.json -- a presenter explaining order blocks.
 *
 * The chart is built from boxes rather than drawn into a texture, because a
 * candlestick IS a box and the order block zone IS a translucent slab. That
 * keeps the one part of the screen that has to animate -- candles printing,
 * the zone appearing, price retesting it -- inside the ordinary timeline,
 * with only the captions needing a canvas texture.
 *
 * The strategy content follows the standard ICT definition: an order block is
 * the last opposing candle before a displacement move, traded on the retest.
 * Sources: ATAS "What are ICT order blocks and breaker blocks"; TradingView
 * "What is ICT Order Block and How to Trade it".
 */
import { writeFileSync } from 'node:fs';
import { blinkTimes, saccadeTimes } from '../src/core/art/face3d.js';

// ------------------------------------------------------------- the stage
const SCREEN = { x: 0.92, y: 1.33, z: -0.30, w: 2.45, h: 1.38 };
const CHART = { x0: -1.02, x1: 1.02, y0: -0.47, y1: 0.47, z: 0.016 };

/**
 * A bullish order block setup, written out rather than randomised: the
 * teaching point is a specific shape, and a random walk will not reliably
 * produce the last-down-candle-before-displacement it needs.
 */
const SERIES = [];
const push = (o, h, l, c) => SERIES.push({ o, h, l, c });
// 0-6: drifting, no commitment
push(52, 54, 51, 53); push(53, 54, 51, 52); push(52, 53, 50, 51);
push(51, 53, 50, 52); push(52, 53, 50, 50); push(50, 52, 49, 51);
push(51, 52, 49, 50);
// 7-8: the order block -- the last DOWN candle, closing near its low
push(50, 51, 47, 48); push(48, 49, 45, 45.4);
const OB = 8;
// 9-12: displacement. Big bodies, little overlap: this is what makes it
// institutional rather than noise.
push(45.6, 52, 45.4, 51.5); push(51.5, 57, 51, 56.4); push(56.4, 61, 56, 60.6);
push(60.6, 63, 60, 62.2);
// 13-17: the retracement back into the zone
push(62.2, 62.6, 58, 58.4); push(58.4, 59, 54, 54.3); push(54.3, 55, 50, 50.4);
push(50.4, 51, 46.6, 47.2); push(47.2, 50, 46.2, 49.6);
// 18-25: continuation from the retest
push(49.6, 54, 49, 53.6); push(53.6, 58, 53, 57.4); push(57.4, 62, 57, 61.5);
push(61.5, 66, 61, 65.4); push(65.4, 70, 65, 69.2); push(69.2, 73, 68.6, 72.4);
push(72.4, 76, 72, 75.6); push(75.6, 79, 75, 78.4);

const LO = Math.min(...SERIES.map((d) => d.l)) - 2;
const HI = Math.max(...SERIES.map((d) => d.h)) + 2;
const py = (p) => CHART.y0 + ((p - LO) / (HI - LO)) * (CHART.y1 - CHART.y0);
const px = (i) => CHART.x0 + ((i + 0.5) / SERIES.length) * (CHART.x1 - CHART.x0);
const CW = ((CHART.x1 - CHART.x0) / SERIES.length) * 0.62;

const parts = [];
const part = (id, spec) => { parts.push({ id, ...spec }); return id; };

// ---------------------------------------------------------------- the set
part('floor', { geometry: { kind: 'cube', width: 12, height: 0.1, depth: 10 },
                material: 'floor', at: [0, -0.05, -1.5] });
part('backdrop', { geometry: { kind: 'cube', width: 12, height: 5, depth: 0.1 },
                   material: 'backdrop', at: [0, 2.4, -2.2] });
part('deskGlow', { geometry: { kind: 'cube', width: 3.4, height: 0.02, depth: 1.2 },
                   material: 'glow', at: [0.3, 0.012, 0.5] });

// The screen: a bezel, a dark panel, and a caption strip along the bottom.
part('bezel', { geometry: { kind: 'cube', width: SCREEN.w + 0.06, height: SCREEN.h + 0.06, depth: 0.05 },
                material: 'bezel', at: [SCREEN.x, SCREEN.y, SCREEN.z - 0.02] });
part('panel', { geometry: { kind: 'cube', width: SCREEN.w, height: SCREEN.h, depth: 0.02 },
                material: 'panel', at: [SCREEN.x, SCREEN.y, SCREEN.z] });
part('stand', { geometry: { kind: 'cylinder', radiusTop: 0.04, radiusBottom: 0.07, height: SCREEN.y - 0.7 },
                material: 'bezel', at: [SCREEN.x, (SCREEN.y - 0.7) / 2, SCREEN.z - 0.02] });

// ------------------------------------------------------------- the candles
for (const [i, d] of SERIES.entries()) {
    const bull = d.c >= d.o;
    const bodyH = Math.max(0.006, Math.abs(py(d.c) - py(d.o)));
    const mat = i === OB ? 'obCandle' : bull ? 'bull' : 'bear';
    part(`wick${i}`, {
        geometry: { kind: 'cube', width: CW * 0.16, height: py(d.h) - py(d.l), depth: 0.008 },
        material: mat,
        at: [SCREEN.x + px(i), SCREEN.y + (py(d.h) + py(d.l)) / 2, SCREEN.z + CHART.z],
        scale: 0,
    });
    part(`candle${i}`, {
        geometry: { kind: 'cube', width: CW, height: bodyH, depth: 0.016 },
        material: mat,
        at: [SCREEN.x + px(i), SCREEN.y + (py(d.c) + py(d.o)) / 2, SCREEN.z + CHART.z],
        scale: 0,
    });
}

// The order block zone: the OB candle's full range, extended right.
const obTop = py(SERIES[OB].h), obBot = py(SERIES[OB].l);
part('obZone', {
    geometry: { kind: 'cube', width: CHART.x1 - px(OB) + CW, height: obTop - obBot, depth: 0.006 },
    material: 'obZone', scale: 0,
    at: [SCREEN.x + (px(OB) - CW / 2 + CHART.x1) / 2, SCREEN.y + (obTop + obBot) / 2,
         SCREEN.z + CHART.z + 0.004],
});
const line = (id, price, material) => part(id, {
    geometry: { kind: 'cube', width: CHART.x1 - px(OB) + CW, height: 0.007, depth: 0.004 },
    material, scale: 0,
    at: [SCREEN.x + (px(OB) - CW / 2 + CHART.x1) / 2, SCREEN.y + py(price), SCREEN.z + CHART.z + 0.012],
});
line('entryLine', SERIES[OB].h, 'entry');
line('stopLine', SERIES[OB].l - 1.2, 'stop');
line('targetLine', 76, 'target');

// Captions are a canvas texture, which is all a slide needs.
const slide = (id, lines, extra = {}) => part(id, {
    geometry: { kind: 'plane', width: SCREEN.w, height: SCREEN.h },
    material: { text: { lines, background: '#0b1119', accent: '#3f8cff', ...extra } },
    at: [SCREEN.x, SCREEN.y, SCREEN.z + 0.03], scale: 0,
});
slide('slideTitle', [
    { text: 'ORDER BLOCKS', size: 86, color: '#ffffff' },
    { text: 'where institutions left their footprint', size: 42, color: '#8fb2d9' },
    { text: '', size: 30 },
    { text: 'A practical walkthrough', size: 38, color: '#3f8cff' },
], { top: 0.22 });
slide('slideDefine', [
    { text: 'WHAT IS IT?', size: 46, color: '#3f8cff' },
    { text: '', size: 18 },
    { text: 'The last opposing candle', size: 62 },
    { text: 'before a strong move.', size: 62 },
    { text: '', size: 18 },
    { text: 'Down candle → up move  =  bullish OB', size: 36, color: '#57d6a0' },
    { text: 'Up candle → down move  =  bearish OB', size: 36, color: '#ff6b6b' },
], { top: 0.10 });
slide('slideRules', [
    { text: 'THE THREE RULES', size: 46, color: '#3f8cff' },
    { text: '', size: 20 },
    { text: '1.  Wait for the displacement', size: 54 },
    { text: '2.  Mark the zone', size: 54 },
    { text: '3.  Only take the retest', size: 54 },
], { top: 0.14 });
slide('slideRisk', [
    { text: 'RISK', size: 46, color: '#ff6b6b' },
    { text: '', size: 20 },
    { text: 'Order blocks fail.', size: 62 },
    { text: 'Size the position so that', size: 46, color: '#b9c7d6' },
    { text: 'when one does, you are still', size: 46, color: '#b9c7d6' },
    { text: 'trading tomorrow.', size: 46, color: '#b9c7d6' },
], { top: 0.12 });

// ------------------------------------------------------------- the speaker
const presenter = {
    rig: 'humanoid', height: 1.82, outfit: 'suit', voice: 'host',
    skin: 'skin', jacket: 'jacket', shirt: 'shirt', trouser: 'trouser', shoe: 'shoe',
    parts: [
        // Parented to BONES by name, which the adapter registers under the
        // character's namespace, so the head carries them when it turns.
        //
        // Every one of these is a primitive stuck onto a skull. That is the
        // honest ceiling of this approach: there is no sculpting, so a brow
        // ridge is a flattened sphere and an eye socket is an eyeball pushed
        // far enough back to read as recessed.
// A brow ridge as a flattened sphere was tried and removed: at any size
        // that read as a ridge it projected further forward than the eyes and
        // swallowed them. The shaped skull already carries the brow; a
        // primitive stuck on top fights it rather than adding to it.
        { id: 'cheekL', parent: 'head', geometry: { kind: 'sphere', radius: 0.026 },
          material: 'skin', at: [0.049, 0.012, 0.050], scale: [1.0, 0.62, 0.62] },
        { id: 'cheekR', parent: 'head', geometry: { kind: 'sphere', radius: 0.026 },
          material: 'skin', at: [-0.049, 0.012, 0.050], scale: [1.0, 0.62, 0.62] },

        // Eyes set BACK into the skull. Spheres at the surface read as a
        // thyroid stare, which is what the first pass did.
        { id: 'eyeL', parent: 'head', geometry: { kind: 'sphere', radius: 0.0142 },
          material: 'eyeWhite', at: [0.0330, 0.0465, 0.0735] },
        { id: 'eyeR', parent: 'head', geometry: { kind: 'sphere', radius: 0.0142 },
          material: 'eyeWhite', at: [-0.0330, 0.0465, 0.0735] },
        { id: 'irisL', parent: 'eyeL', geometry: { kind: 'sphere', radius: 0.0063 },
          material: 'iris', at: [0, 0, 0.0092] },
        { id: 'irisR', parent: 'eyeR', geometry: { kind: 'sphere', radius: 0.0063 },
          material: 'iris', at: [0, 0, 0.0092] },
        { id: 'pupilL', parent: 'irisL', geometry: { kind: 'sphere', radius: 0.0029 },
          material: 'pupil', at: [0, 0, 0.0046] },
        { id: 'pupilR', parent: 'irisR', geometry: { kind: 'sphere', radius: 0.0029 },
          material: 'pupil', at: [0, 0, 0.0046] },
        // Lids: a shell just proud of the eye, scaled flat when open and
        // full when closed. This is the blink.
        { id: 'lidL', parent: 'head', geometry: { kind: 'sphere', radius: 0.0151 },
          material: 'skin', at: [0.0330, 0.0495, 0.0730], scale: [1, 0.10, 1] },
        { id: 'lidR', parent: 'head', geometry: { kind: 'sphere', radius: 0.0151 },
          material: 'skin', at: [-0.0330, 0.0495, 0.0730], scale: [1, 0.10, 1] },
        { id: 'browL', parent: 'head', geometry: { kind: 'cube', width: 0.030, height: 0.0062, depth: 0.011 },
          material: 'hair', at: [0.0330, 0.0680, 0.0810], rot: [0, 0, -7] },
        { id: 'browR', parent: 'head', geometry: { kind: 'cube', width: 0.030, height: 0.0062, depth: 0.011 },
          material: 'hair', at: [-0.0330, 0.0680, 0.0810], rot: [0, 0, 7] },

        // A nose needs a bridge as well as a tip, or it reads as a beak
        // stuck on a ball.
        { id: 'noseBridge', parent: 'head', geometry: { kind: 'cube', width: 0.016, height: 0.044, depth: 0.020 },
          material: 'skin', at: [0, 0.038, 0.0805], rot: [-10, 0, 0] },
        { id: 'noseTip', parent: 'head', geometry: { kind: 'sphere', radius: 0.0132 },
          material: 'skin', at: [0, 0.014, 0.0885], scale: [1.08, 0.86, 1.0] },
        { id: 'nostrilL', parent: 'head', geometry: { kind: 'sphere', radius: 0.0066 },
          material: 'skin', at: [0.0118, 0.0104, 0.0835] },
        { id: 'nostrilR', parent: 'head', geometry: { kind: 'sphere', radius: 0.0066 },
          material: 'skin', at: [-0.0118, 0.0104, 0.0835] },

        // The mouth: lips that read, and a cavity small enough to be a mouth
        // rather than a letterbox.
        { id: 'mouth', parent: 'jaw', geometry: { kind: 'cube', width: 0.034, height: 0.008, depth: 0.014 },
          material: 'mouth', at: [0, -0.0325, 0.0665] },
        { id: 'lipUpper', parent: 'head', geometry: { kind: 'sphere', radius: 0.0215 },
          material: 'lip', at: [0, -0.0225, 0.0695], scale: [1.0, 0.30, 0.42] },
        { id: 'lipLower', parent: 'jaw', geometry: { kind: 'sphere', radius: 0.0205 },
          material: 'lip', at: [0, -0.0415, 0.0680], scale: [1.0, 0.34, 0.42] },
        { id: 'chin', parent: 'jaw', geometry: { kind: 'sphere', radius: 0.030 },
          material: 'skin', at: [0, -0.0605, 0.0455], scale: [1.18, 0.80, 0.86] },

        // Hair sits ON the crown with a hairline, not pulled down to the
        // brow: a cap that reaches the eyebrows reads as a helmet.
        { id: 'hair', parent: 'head', geometry: { kind: 'sphere', radius: 0.0995 },
          material: 'hair', at: [0, 0.0825, -0.0145], scale: [1.01, 0.92, 1.00] },
        { id: 'hairBack', parent: 'head', geometry: { kind: 'sphere', radius: 0.088 },
          material: 'hair', at: [0, 0.028, -0.034], scale: [1.03, 1.0, 0.90] },
        { id: 'earL', parent: 'head', geometry: { kind: 'sphere', radius: 0.0175 },
          material: 'skin', at: [0.0815, 0.030, 0.004], scale: [0.42, 1.25, 0.92] },
        { id: 'earR', parent: 'head', geometry: { kind: 'sphere', radius: 0.0175 },
          material: 'skin', at: [-0.0815, 0.030, 0.004], scale: [0.42, 1.25, 0.92] },

        { id: 'collar', parent: 'chest', geometry: { kind: 'cylinder', radiusTop: 0.078, radiusBottom: 0.09, height: 0.07 },
          material: 'shirt', at: [0, 0.135, 0.004] },
        { id: 'tie', parent: 'chest', geometry: { kind: 'cube', width: 0.042, height: 0.26, depth: 0.02 },
          material: 'tie', at: [0, 0.0, 0.125], rot: [-6, 0, 0] },
    ],
};


// ------------------------------------------------------------------- film
const DIALOGUE = [
    'Right. Order blocks. Let us clear this up, step by step.',
    'An order block is the last opposing candle before a strong move. That is where the big institutional orders went in.',
    'Here is the chart. Watch the shape, not the noise.',
    'This red candle is the order block. The final down candle before price rips higher.',
    'That one candle is the footprint. Institutions filled their buy orders there, then left.',
    'Now the part that matters. Price usually comes back to retest that zone.',
    'The retest is your entry. You are buying where the institutions bought.',
    'Your stop goes below the low of the block. If price closes under it, the idea is invalid.',
    'A bearish order block is the mirror image. The last green candle before a sharp drop. You sell the retest.',
    'Three rules. Wait for the displacement. Mark the zone. Only take the retest.',
    'And none of this is a guarantee. Order blocks fail. Size your risk so that when one does, you are still trading tomorrow.',
];

/** Show a part by scaling it up from nothing, with a little overshoot. */
const show = (target, at, { to = 1, span = 0.3, overshoot = 0.16 } = {}) =>
    ({ do: 'grow', target: `set/${target}`, to, at: +at.toFixed(3), for: span,
       ease: 'smooth', overshoot });
const hide = (target, at, span = 0.25) =>
    ({ do: 'grow', target: `set/${target}`, to: 0, at: +at.toFixed(3), for: span, ease: 'smooth' });

/**
 * A gesture toward the screen.
 *
 * Anticipation and overshoot come free from `writeScalar`; the follow-through
 * is the `lag` -- the forearm starts a beat after the upper arm and arrives a
 * beat after it, which is what stops an arm moving like one rigid stick.
 */
const gesture = (at, { arm = -62, fore = -26, lag = 0.09, span = 0.7, side = 'R' } = {}) => ([
    { do: 'turn', target: `host/arm${side}`, to: [arm, 0, side === 'R' ? -14 : 14],
      at: +at.toFixed(3), for: span, ease: 'smooth', anticipate: 0.18, overshoot: 0.12 },
    { do: 'turn', target: `host/fore${side}`, to: [fore, 0, 0],
      at: +(at + lag).toFixed(3), for: span, ease: 'smooth', overshoot: 0.16 },
    { do: 'turn', target: `host/hand${side}`, to: [fore * 0.35, 0, 0],
      at: +(at + lag * 2).toFixed(3), for: span, ease: 'smooth', overshoot: 0.2 },
]);
const rest = (at, { span = 0.65, side = 'R' } = {}) => ([
    { do: 'turn', target: `host/arm${side}`, to: [-6, 0, side === 'R' ? -6 : 6],
      at: +at.toFixed(3), for: span, ease: 'smooth', anticipate: 0.1 },
    { do: 'turn', target: `host/fore${side}`, to: [-14, 0, 0],
      at: +(at + 0.08).toFixed(3), for: span, ease: 'smooth' },
    { do: 'turn', target: `host/hand${side}`, to: [0, 0, 0],
      at: +(at + 0.16).toFixed(3), for: span, ease: 'smooth' },
]);
/**
 * A blink, with the asymmetry measured blinks actually have: the lid closes
 * in about 80 ms and opens again over about 150 ms. Given equal times in both
 * directions it reads as a shutter rather than an eyelid -- which is what the
 * first pass did.
 */
const blink = (at, { close = 0.08, hold = 0.06, open = 0.15 } = {}) => {
    const a = [];
    for (const lid of ['lidL', 'lidR']) {
        a.push({ do: 'grow', target: `host/${lid}`, to: [1, 1.05, 1],
                 at: +at.toFixed(3), for: close, ease: 'smooth' });
        a.push({ do: 'grow', target: `host/${lid}`, to: [1, 0.08, 1],
                 at: +(at + close + hold).toFixed(3), for: open, ease: 'smooth' });
    }
    return a;
};

/**
 * Eye darts. Real eyes do not hold a fixation for seconds at a time; they
 * jump, and the jumps are what make a face look like it is thinking. Sizes
 * come from the gaze literature -- roughly 7 degrees horizontally and 3
 * vertically before the eye saccades rather than drifts.
 */
const darts = (start, duration, seed) =>
    saccadeTimes(start, duration, { seed }).flatMap(({ t, x, y }) =>
        ['eyeL', 'eyeR'].map((e) => ({
            do: 'turn', target: `host/${e}`, to: [x, y, 0],
            at: +(t - start).toFixed(3), for: 0.08, ease: 'smooth',
        })));

/** Blinks across a whole shot, jittered so they never land on a beat. */
const blinks = (start, duration, seed) =>
    blinkTimes(start, duration, { seed }).flatMap((t) => blink(t - start));

/** An expression, held until the next one releases it. */
const express = (at, expression, { amount = 1, span = 0.45 } = {}) =>
    ({ do: 'express', target: 'host', expression, amount, at: +at.toFixed(3), for: span });
/**
 * A weight shift: the hips carry it and the chest counters, a beat later.
 *
 * `nudge`, not `move`. A bone's rest position IS its bind pose, so writing an
 * absolute position onto the hips puts the pelvis at the world origin and
 * drops the entire skeleton through the floor.
 */
const shift = (at, x, span = 1.3) => ([
    { do: 'nudge', target: 'host/hips', by: [x, 0, 0], at: +at.toFixed(3), for: span, ease: 'smooth' },
    { do: 'turn', target: 'host/chest', to: [0, 0, -x * 220], at: +(at + 0.12).toFixed(3),
      for: span, ease: 'smooth', overshoot: 0.1 },
]);
const look = (at, y, span = 0.6) => ([
    { do: 'turn', target: 'host/head', to: [0, y, 0], at: +at.toFixed(3), for: span,
      ease: 'smooth', overshoot: 0.14 },
    { do: 'turn', target: 'host/neck', to: [0, y * 0.35, 0], at: +at.toFixed(3), for: span, ease: 'smooth' },
]);

const AT_SCREEN = 26, AT_CAMERA = -4;
const shots = [];
const say = (i, at = 0.45) => ({ speaker: 'host', text: DIALOGUE[i], at });

shots.push({
    id: '01-open', duration: 7.5, framing: 'medium', on: 'host',
    camera: { from: { at: [-0.28, 1.83, 4.45], look: [-0.55, 1.42, 0], fov: 36 },
              to: { at: [0.04, 1.67, 3.51], look: [-0.5, 1.4, 0], fov: 38 }, ease: 'smooth' },
    dialogue: [say(0)],
    actions: [...look(0.2, AT_CAMERA), ...gesture(0.6, { arm: -34, fore: -30 }),
              ...rest(3.4), ...shift(5.2, 0.015), show('slideTitle', 0.3)],
});
shots.push({
    id: '02-define', duration: 9.5,
    camera: { from: { at: [0.04, 1.67, 3.51], look: [-0.5, 1.4, 0] },
              to: { at: [0.25, 1.62, 3.55], look: [0.3, 1.38, 0], fov: 42 }, ease: 'smooth' },
    dialogue: [say(1)],
    actions: [hide('slideTitle', 0.1), show('slideDefine', 0.45),
              ...look(0.5, AT_SCREEN), ...gesture(0.7), 
              ...shift(2.6, -0.02), ...rest(6.4), ...look(6.6, AT_CAMERA / 2)],
});
// The chart prints candle by candle, which is the step-by-step the brief asks
// for -- and is what a static image of a setup can never show.
const chartShot = { id: '03-chart', duration: 8.5, dialogue: [say(2)],
    camera: { from: { at: [0.25, 1.55, 2.95], look: [0.3, 1.38, 0], fov: 42 },
              to: { at: [0.72, 1.44, 2.35], look: [0.9, 1.33, 0], fov: 40 }, ease: 'smooth' },
    actions: [hide('slideDefine', 0.1), ...look(0.3, AT_SCREEN), ...gesture(0.5, { arm: -70, fore: -20 }),
              ] };
for (let i = 0; i <= 12; i++) {
    const t = 0.9 + i * 0.16;
    chartShot.actions.push(show(`wick${i}`, t, { span: 0.12, overshoot: 0 }),
                           show(`candle${i}`, t + 0.03, { span: 0.16, overshoot: 0.3 }));
}
shots.push(chartShot);
shots.push({
    id: '04-ob', duration: 8.5, dialogue: [say(3)],
    camera: { from: { at: [0.72, 1.44, 2.35], look: [0.9, 1.33, 0], fov: 40 },
              to: { at: [0.58, 1.36, 1.55], look: [0.52, 1.24, 0], fov: 34 }, ease: 'smooth' },
    actions: [show('obZone', 1.5, { span: 0.5 }), 
              // The order block candle pulses: scale is the only emphasis a
              // mesh has without a material animation.
              { do: 'grow', target: `set/candle${OB}`, to: [1.5, 1.12, 2.2], at: 0.9, for: 0.35,
                ease: 'smooth', overshoot: 0.25 },
              { do: 'grow', target: `set/candle${OB}`, to: [1.25, 1.06, 1.8], at: 1.5, for: 0.4 },
              ],
});
// A close-up on the line that carries the idea. An explainer earns one here,
// and it is also the only framing in which facial animation is legible.
shots.push({
    id: '05-footprint', duration: 8.5, dialogue: [say(4)],
    // Aimed at the FACE, which sits a little above the head bone -- the bone
    // is at the base of the skull, so looking at it frames the chin and
    // looking 100 mm above it frames the backdrop. The framing is declared on
    // the head so the check measures the head rather than the whole man.
    // `medium` on the head, not `close`: the shot holds the whole head and
    // shoulders at 56-66% of frame height, which the check measured and the
    // declaration had to be corrected to match. A talking head is not a macro.
    framing: 'medium', on: 'host/head',
    camera: { from: { at: [-0.54, 1.66, 1.18], look: [-0.76, 1.60, 0.28], fov: 30 },
              to: { at: [-0.49, 1.63, 1.02], look: [-0.76, 1.59, 0.28], fov: 30 }, ease: 'smooth' },
    actions: [...look(0.3, AT_CAMERA), ...gesture(0.6, { arm: -44, fore: -48, side: 'L' }),
              ...shift(2.4, 0.02), ...rest(5.2, { side: 'L' }) ],
});
shots.push({
    id: '06-retest', duration: 9, dialogue: [say(5)],
    camera: { from: { at: [-0.12, 1.62, 2.75], look: [-0.35, 1.42, 0], fov: 40 },
              to: { at: [0.8, 1.48, 2.6], look: [0.95, 1.32, 0], fov: 40 }, ease: 'smooth' },
    actions: [...look(0.4, AT_SCREEN), ...gesture(0.6, { arm: -66, fore: -18 }), 
              ...(function retrace() {
                  const a = [];
                  for (let i = 13; i <= 17; i++) {
                      const t = 1.6 + (i - 13) * 0.42;
                      a.push(show(`wick${i}`, t, { span: 0.14, overshoot: 0 }),
                             show(`candle${i}`, t + 0.04, { span: 0.2, overshoot: 0.25 }));
                  }
                  return a;
              }()) ],
});
shots.push({
    id: '07-entry', duration: 8.5, dialogue: [say(6)],
    camera: { from: { at: [0.8, 1.42, 2.1], look: [0.95, 1.32, 0], fov: 38 },
              to: { at: [0.66, 1.37, 1.6], look: [0.72, 1.28, 0], fov: 35 }, ease: 'smooth' },
    actions: [show('entryLine', 0.9, { span: 0.35 }), 
              ...(function cont() {
                  const a = [];
                  for (let i = 18; i <= 21; i++) {
                      const t = 3.4 + (i - 18) * 0.34;
                      a.push(show(`wick${i}`, t, { span: 0.12, overshoot: 0 }),
                             show(`candle${i}`, t + 0.03, { span: 0.18, overshoot: 0.28 }));
                  }
                  return a;
              }()) ],
});
shots.push({
    id: '08-stop', duration: 9, dialogue: [say(7)],
    camera: { from: { at: [0.66, 1.37, 1.6], look: [0.72, 1.28, 0], fov: 35 },
              to: { at: [0.9, 1.33, 1.95], look: [0.95, 1.2, 0], fov: 38 }, ease: 'smooth' },
    actions: [show('stopLine', 1.1, { span: 0.35 }), show('targetLine', 4.2, { span: 0.35 }),
              
              ...(function cont() {
                  const a = [];
                  for (let i = 22; i <= 25; i++) {
                      const t = 4.6 + (i - 22) * 0.32;
                      a.push(show(`wick${i}`, t, { span: 0.12, overshoot: 0 }),
                             show(`candle${i}`, t + 0.03, { span: 0.18, overshoot: 0.28 }));
                  }
                  return a;
              }()) ],
});
shots.push({
    id: '09-bearish', duration: 9.5, dialogue: [say(8)],
    camera: { from: { at: [0.9, 1.33, 1.95], look: [0.95, 1.2, 0], fov: 38 },
              to: { at: [-0.12, 1.6, 2.55], look: [-0.48, 1.4, 0], fov: 38 }, ease: 'smooth' },
    actions: [...look(0.5, AT_CAMERA), ...gesture(0.8, { arm: -40, fore: -42, side: 'L' }),
              ...shift(3.0, -0.018), ...rest(6.0, { side: 'L' }) ],
});
shots.push({
    id: '10-rules', duration: 9, dialogue: [say(9)],
    camera: { from: { at: [-0.12, 1.6, 2.55], look: [-0.48, 1.4, 0] },
              to: { at: [0.3, 1.54, 3.0], look: [0.32, 1.37, 0], fov: 44 }, ease: 'smooth' },
    actions: [show('slideRules', 0.5), ...look(0.6, AT_SCREEN / 2),
              ...gesture(0.9, { arm: -52, fore: -30 }), 
              ...rest(6.2) ],
});
shots.push({
    id: '11-risk', duration: 10, dialogue: [say(10)],
    camera: { from: { at: [0.3, 1.54, 3.0], look: [0.32, 1.37, 0], fov: 44 },
              to: { at: [-0.2, 1.63, 2.35], look: [-0.5, 1.42, 0], fov: 36 }, ease: 'smooth' },
    actions: [hide('slideRules', 0.2), show('slideRisk', 0.7),
              ...look(0.5, AT_CAMERA), ...gesture(1.1, { arm: -30, fore: -34 }),
              ...shift(3.4, 0.012), ...rest(6.6) ],
});

/**
 * The performance layer, applied after the shots exist.
 *
 * Blinks, eye darts and expressions are added here rather than hand-placed
 * beat by beat, for the reason the research gives: a blink on a strict
 * interval reads as a tic within seconds, and a fixation held for the length
 * of a shot reads as a stare. Both want jitter derived from the shot, which
 * means knowing where the shot starts -- and a shot only knows that once the
 * list is built.
 *
 * Expressions are per shot because they are the beat's attitude: open on
 * warmth, explain through the definition, press on the rules, sober for the
 * risk. Each writes only brows and cheeks; the mouth belongs to lipsync.
 */
const BEAT_EXPRESSION = [
    'warm', 'explain', 'explain', 'emphasis', 'explain',
    'emphasis', 'warm', 'serious', 'explain', 'emphasis', 'concern',
];
let cursor = 0;
for (const [i, shot] of shots.entries()) {
    shot.actions = shot.actions ?? [];
    shot.actions.push(express(0.25, BEAT_EXPRESSION[i] ?? 'explain', { amount: 0.9 }));
    shot.actions.push(...blinks(cursor, shot.duration, i * 17 + 3));
    shot.actions.push(...darts(cursor, shot.duration, i * 29 + 7));
    cursor += shot.duration;
}

const film = {
    version: 'jirex.film3d/1',
    meta: { title: 'Order Blocks, explained', fps: 24, width: 1280, height: 720,
            background: '#0a0e14', bloom: { strength: 0.35, radius: 0.5, threshold: 0.9 } },
    materials: {
        // A fair complexion, warm rather than pink, with the shade the cheek
        // and nose need to separate from the skull.
        skin: { color: '#d8a584', metalness: 0, roughness: 0.78 },
        eyeWhite: { color: '#f6f8fa', metalness: 0, roughness: 0.28 },
        iris: { color: '#3d6f9e', metalness: 0, roughness: 0.3 },
        pupil: { color: '#0d1116', metalness: 0, roughness: 0.2 },
        lip: { color: '#bd7a70', metalness: 0, roughness: 0.6 },
        mouth: { color: '#43222a', metalness: 0, roughness: 0.85 },
        hair: { color: '#473425', metalness: 0, roughness: 0.82 },
        jacket: { color: '#46536a', metalness: 0, roughness: 0.74 },
        shirt: { color: '#e9eef4', metalness: 0, roughness: 0.66 },
        tie: { color: '#8d313c', metalness: 0.05, roughness: 0.58 },
        trouser: { color: '#3b4557', metalness: 0, roughness: 0.78 },
        shoe: { color: '#17191e', metalness: 0.2, roughness: 0.45 },

        floor: { color: '#13171e', metalness: 0.35, roughness: 0.55 },
        backdrop: { color: '#1b232e', metalness: 0, roughness: 0.95 },
        glow: { color: '#2a68c8', emissive: '#2a68c8', emissiveIntensity: 1.6, roughness: 1 },
        bezel: { color: '#1b2029', metalness: 0.6, roughness: 0.4 },
        panel: { color: '#0b1119', metalness: 0, roughness: 0.9 },
        bull: { color: '#3ecf8e', emissive: '#1d6c49', emissiveIntensity: 0.5, roughness: 0.6 },
        bear: { color: '#e85d5d', emissive: '#7a2626', emissiveIntensity: 0.5, roughness: 0.6 },
        obCandle: { color: '#ffb33c', emissive: '#c06f10', emissiveIntensity: 1.1, roughness: 0.5 },
        obZone: { color: '#ffb33c', emissive: '#8a5a12', emissiveIntensity: 0.5,
                  opacity: 0.22, transparent: true, roughness: 1 },
        entry: { color: '#59a7ff', emissive: '#2f6bb5', emissiveIntensity: 1.2, roughness: 0.6 },
        stop: { color: '#ff6b6b', emissive: '#a52f2f', emissiveIntensity: 1.2, roughness: 0.6 },
        target: { color: '#3ecf8e', emissive: '#1d6c49', emissiveIntensity: 1.2, roughness: 0.6 },
    },
    voices: { host: { spec: 'tts:en_GB-northern_english_male-medium' } },
    lights: [
        { id: 'amb', type: 'ambient', color: '#8d9cb0', intensity: 1.9 },
        { id: 'key', type: 'directional', color: '#fff4e6', intensity: 3.4, at: [-2.2, 3.0, 4.0],
          castShadow: true },
        { id: 'fill', type: 'directional', color: '#a8c8ff', intensity: 1.7, at: [2.6, 1.6, 3.2] },
        { id: 'face', type: 'point', color: '#ffeedd', intensity: 0.35,
          at: [-0.55, 1.58, 2.1], distance: 4.0 },
        { id: 'rim', type: 'directional', color: '#8fb6ff', intensity: 2.1, at: [0.6, 2.4, -2.6] },
        { id: 'screenSpill', type: 'point', color: '#3f8cff', intensity: 2.2,
          at: [SCREEN.x - 0.5, SCREEN.y, SCREEN.z + 0.8], distance: 4.5 },
    ],
    characters: { presenter },
    assemblies: { set: { parts } },
    cast: [
        { character: 'presenter', as: 'host', at: [-0.78, 0, 0.25], rot: [0, 14, 0], voice: 'host' },
        { assembly: 'set', as: 'set', at: [0, 0, 0], set: true },
    ],
    scenes: [{ id: 'main', shots }],
};

const total = shots.reduce((a, s) => a + s.duration, 0);
writeFileSync(new URL('../demo/orderblock.json', import.meta.url),
              JSON.stringify(film, null, 1) + '\n');
console.log(`orderblock.json: ${shots.length} shots, ${total.toFixed(1)}s, `
            + `${DIALOGUE.length} lines, ${parts.length} set parts, `
            + `${presenter.parts.length} face/wardrobe parts, ${SERIES.length} candles`);
