/**
 * Procedural facial blendshapes, named after the ARKit set.
 *
 * Researched rather than invented. Production facial rigs are blendshapes --
 * per-vertex deltas blended by weight -- and the de facto naming standard is
 * Apple's 52 ARKit shapes, which descend from FACS Action Units, where each
 * unit is one muscle contraction. Using those names means a face built here
 * is driven by the same channel names an iPhone capture or an Unreal Live
 * Link rig emits, instead of a private vocabulary.
 *
 * The engine could already write `morph.<name>` onto a mesh -- `PoseApplier`
 * has handled it since Phase 3 -- but nothing had ever built a morph target,
 * so the channel was unreachable from a film. This is that gap closed.
 *
 * One structural idea is taken straight from how production systems are
 * built: each system owns its OWN SUBSET of shapes. Lipsync writes the mouth,
 * the emotion layer writes brows and cheeks, the blink layer writes lids.
 * They never write the same shape, so they cannot overwrite one another --
 * the same reasoning behind the clip masks added in Phase 13.
 *
 * Sources: Apple ARKit ARFaceAnchor blend shapes; Ekman & Friesen's Facial
 * Action Coding System; CMU "Perceptually Valid Dynamics for Smiles and
 * Blinks" for the timing asymmetries used by the animation helpers below.
 */

const smoothstep = (e0, e1, x) => {
    const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0 || 1e-6)));
    return t * t * (3 - 2 * t);
};

/**
 * A falloff region on the face, in head-local metres.
 *
 * Expressed as a soft box rather than a vertex group because the head is
 * generated, not sculpted: there is no artist to paint a selection, so the
 * selection has to be a function of position.
 */
function region(p, { y, x, z, soft = 0.018, mirror = 0 }) {
    let w = 1;
    if (y) w *= smoothstep(y[0] - soft, y[0] + soft, p[1]) * (1 - smoothstep(y[1] - soft, y[1] + soft, p[1]));
    if (z) w *= smoothstep(z[0] - soft, z[0] + soft, p[2]);
    if (x) {
        const ax = Math.abs(p[0]);
        w *= smoothstep(x[0] - soft, x[0] + soft, ax) * (1 - smoothstep(x[1] - soft, x[1] + soft, ax));
    }
    // mirror: +1 keeps the character's left (+x), -1 the right, 0 both.
    if (mirror > 0) w *= smoothstep(-0.004, 0.012, p[0]);
    if (mirror < 0) w *= smoothstep(-0.004, 0.012, -p[0]);
    return w;
}

/**
 * Build the blendshape deltas for a generated head.
 *
 * `positions` is the head mesh in head-local space. Returns a map of shape
 * name to a Float32Array of the same length -- the per-vertex offset at full
 * weight, which is exactly what a morph target is.
 */
export function faceMorphs(positions, { scale = 1 } = {}) {
    const n = positions.length;
    const shapes = {};
    const make = (name, fn) => {
        const d = new Float32Array(n);
        let touched = 0;
        for (let i = 0; i < n; i += 3) {
            const p = [positions[i] / scale, positions[i + 1] / scale, positions[i + 2] / scale];
            const o = fn(p);
            if (!o) continue;
            d[i] = o[0] * scale; d[i + 1] = o[1] * scale; d[i + 2] = o[2] * scale;
            touched++;
        }
        if (touched) shapes[name] = d;
    };

    const BROW = { y: [0.052, 0.086], x: [0.0, 0.072], z: [0.045], soft: 0.016 };
    const EYE = { y: [0.028, 0.062], x: [0.016, 0.062], z: [0.05], soft: 0.013 };
    const CHEEK = { y: [-0.028, 0.026], x: [0.030, 0.090], z: [0.028], soft: 0.020 };
    const MOUTH = { y: [-0.052, 0.002], x: [0.0, 0.050], z: [0.052], soft: 0.015 };
    const LIPUP = { y: [-0.024, 0.002], x: [0.0, 0.046], z: [0.055], soft: 0.012 };
    const LIPLO = { y: [-0.052, -0.022], x: [0.0, 0.046], z: [0.055], soft: 0.012 };
    const JAW = { y: [-0.090, -0.018], x: [0.0, 0.085], z: [0.0], soft: 0.022 };
    const NOSE = { y: [-0.006, 0.030], x: [0.0, 0.026], z: [0.062], soft: 0.010 };

    // --- brows: AU1 (inner raiser), AU2 (outer raiser), AU4 (lowerer) -----
    make('browInnerUp', (p) => {
        const w = region(p, { ...BROW, x: [0.0, 0.042] });
        return w && [0, 0.0125 * w, 0.0022 * w];
    });
    for (const [side, m] of [['Left', 1], ['Right', -1]]) {
        make(`browOuterUp${side}`, (p) => {
            const w = region(p, { ...BROW, x: [0.030, 0.078], mirror: m });
            return w && [0, 0.0135 * w, 0.0012 * w];
        });
        make(`browDown${side}`, (p) => {
            const w = region(p, { ...BROW, mirror: m });
            // A furrow is not only downward: the inner brow also draws IN,
            // which is what separates a frown from a sleepy half-lid.
            return w && [-0.0042 * w * m, -0.0105 * w, 0.0018 * w];
        });
        // --- eyes: AU6 (cheek raiser / squint), AU5 (lid raiser) ----------
        make(`eyeSquint${side}`, (p) => {
            const w = region(p, { ...EYE, mirror: m });
            return w && [0, 0.0048 * w, 0.0016 * w];
        });
        make(`eyeWide${side}`, (p) => {
            const w = region(p, { ...EYE, mirror: m });
            return w && [0, 0.0032 * w, -0.0012 * w];
        });
        // --- cheeks: AU6, and the squint that makes a smile read as real --
        make(`cheekSquint${side}`, (p) => {
            const w = region(p, { ...CHEEK, mirror: m });
            return w && [0.0022 * w * m, 0.0075 * w, 0.0042 * w];
        });
        // --- mouth corners: AU12 (smile), AU15 (frown) --------------------
        make(`mouthSmile${side}`, (p) => {
            const w = region(p, { ...MOUTH, x: [0.016, 0.052], mirror: m });
            return w && [0.0058 * w * m, 0.0092 * w, 0.0020 * w];
        });
        make(`mouthFrown${side}`, (p) => {
            const w = region(p, { ...MOUTH, x: [0.016, 0.052], mirror: m });
            return w && [0.0020 * w * m, -0.0092 * w, -0.0012 * w];
        });
        make(`mouthStretch${side}`, (p) => {
            const w = region(p, { ...MOUTH, mirror: m });
            return w && [0.0085 * w * m, 0, -0.0022 * w];
        });
        make(`noseSneer${side}`, (p) => {
            const w = region(p, { ...NOSE, mirror: m });
            return w && [0, 0.0048 * w, 0.0012 * w];
        });
    }

    // --- jaw and lips: AU26 (jaw drop), AU18 (pucker), AU22 (funnel) ------
    make('jawOpen', (p) => {
        const w = region(p, JAW);
        // Rotating about the condyle rather than sliding: the chin travels
        // much further than the jaw angle does, which is why a jaw that
        // translates straight down reads as a drawer opening.
        const lever = Math.max(0, (0.055 - Math.abs(p[0])) / 0.055);
        return w && [0, -0.030 * w, 0.0075 * w * lever];
    });
    make('mouthPucker', (p) => {
        const w = region(p, MOUTH);
        return w && [-p[0] * 0.42 * w, 0, 0.0115 * w];
    });
    make('mouthFunnel', (p) => {
        const w = region(p, MOUTH);
        return w && [-p[0] * 0.26 * w, -0.0045 * w, 0.0072 * w];
    });
    make('mouthClose', (p) => {
        const up = region(p, LIPUP), lo = region(p, LIPLO);
        return (up || lo) && [0, (lo * 0.0048) - (up * 0.0048), 0];
    });
    make('mouthRollLower', (p) => {
        const w = region(p, LIPLO);
        return w && [0, 0.0022 * w, -0.0062 * w];
    });

    return shapes;
}

/**
 * Visemes as blendshape combinations.
 *
 * The lipsync stack emits one of six mouth shapes per frame. A 2D mouth swaps
 * a drawing; a 3D face has to reach the same shape by blending muscles, which
 * is what these combinations are. Weights were chosen so that no viseme opens
 * the jaw by the same amount as another -- a jaw that drops identically on
 * every sound is the single clearest tell of machine lipsync.
 */
export const VISEME_SHAPES = {
    closed: { mouthClose: 0.55 },
    mid: { jawOpen: 0.22, mouthStretchLeft: 0.12, mouthStretchRight: 0.12 },
    open: { jawOpen: 0.72, mouthFunnel: 0.10 },
    round: { jawOpen: 0.26, mouthPucker: 0.78, mouthFunnel: 0.42 },
    wide: { jawOpen: 0.18, mouthStretchLeft: 0.68, mouthStretchRight: 0.68 },
    teeth: { jawOpen: 0.10, mouthStretchLeft: 0.34, mouthStretchRight: 0.34, mouthRollLower: 0.45 },
};

/** Named expressions, as weighted sets of the shapes above. */
export const EXPRESSIONS = {
    neutral: {},
    // Asymmetry is doing the work here. A perfectly symmetrical smile reads
    // as a mask; real ones are stronger on one side.
    warm: { mouthSmileLeft: 0.52, mouthSmileRight: 0.44, cheekSquintLeft: 0.38,
            cheekSquintRight: 0.32, eyeSquintLeft: 0.22, eyeSquintRight: 0.18,
            browOuterUpLeft: 0.12 },
    explain: { browInnerUp: 0.34, browOuterUpLeft: 0.22, browOuterUpRight: 0.18,
               eyeWideLeft: 0.14, eyeWideRight: 0.14 },
    emphasis: { browInnerUp: 0.52, browOuterUpLeft: 0.40, browOuterUpRight: 0.36,
                eyeWideLeft: 0.30, eyeWideRight: 0.28, mouthStretchLeft: 0.10 },
    serious: { browDownLeft: 0.44, browDownRight: 0.40, eyeSquintLeft: 0.20,
               eyeSquintRight: 0.18, mouthFrownLeft: 0.14, mouthFrownRight: 0.12 },
    concern: { browInnerUp: 0.62, browDownLeft: 0.22, browDownRight: 0.20,
               mouthFrownLeft: 0.20, mouthFrownRight: 0.16 },
    aside: { browOuterUpLeft: 0.34, mouthSmileLeft: 0.30, eyeSquintLeft: 0.26,
             cheekSquintLeft: 0.22 },
};

/**
 * A blink, with the asymmetry that makes it read as a blink.
 *
 * Measured human blinks close in about 80 ms, stay shut for 50-100 ms, and
 * open again over about 150 ms. The closing is nearly twice as fast as the
 * opening, and a blink given equal times in both directions is the classic
 * mechanical-looking blink. Returns [t, weight] pairs.
 */
export function blinkCurve(at, { close = 0.08, hold = 0.06, open = 0.15 } = {}) {
    return [
        [at, 0],
        [at + close, 1],
        [at + close + hold, 1],
        [at + close + hold + open, 0],
    ];
}

/**
 * Where to put blinks in a spoken line.
 *
 * Blinks cluster on pauses longer than about 150 ms and on the first vowel of
 * a word, rather than falling on a timer. A regular blink every three seconds
 * is noticeably robotic even when nothing else is.
 */
export function blinkTimes(startSec, durationSec, { seed = 1, every = 3.4 } = {}) {
    const out = [];
    let t = startSec + 0.35 + ((seed * 37) % 11) / 20;
    let k = 0;
    while (t < startSec + durationSec - 0.2) {
        out.push(+t.toFixed(3));
        // Jittered, never periodic: a blink on a strict interval is read as a
        // tic within a few seconds.
        const jitter = (((seed + k * 7919) % 1000) / 1000 - 0.5) * 2.2;
        t += Math.max(1.1, every + jitter);
        k++;
    }
    return out;
}

/**
 * Eye darts. Saccade thresholds from the gaze literature: about 7 degrees
 * horizontally and 3 vertically before the eye jumps rather than drifts.
 */
export const SACCADE = { horizontal: 7, vertical: 3 };

export function saccadeTimes(startSec, durationSec, { seed = 1, every = 1.9 } = {}) {
    const out = [];
    let t = startSec + 0.2;
    let k = 0;
    while (t < startSec + durationSec) {
        const h = ((((seed + k * 104729) % 2000) / 1000) - 1) * SACCADE.horizontal;
        const v = ((((seed + k * 15485863) % 2000) / 1000) - 1) * SACCADE.vertical;
        out.push({ t: +t.toFixed(3), x: +v.toFixed(2), y: +h.toFixed(2) });
        t += Math.max(0.55, every + ((((seed + k * 31) % 900) / 1000) - 0.45) * 2);
        k++;
    }
    return out;
}
