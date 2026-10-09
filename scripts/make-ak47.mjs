/**
 * Build demo/ak47.json -- a 50-second 3D product animation.
 *
 * Generated rather than hand-written for one reason: the gun is modelled at
 * its real dimensions in metres, and a table of named measurements with their
 * sources is auditable in a way that nine hundred lines of JSON coordinates
 * is not. Change RECEIVER_LEN here and every part that references it moves.
 *
 * Reference dimensions (AK-47, fixed wooden stock):
 *   overall length   880 mm
 *   barrel           415 mm (rifled bore 369 mm)
 *   calibre          7.62 x 39 mm
 *   cyclic rate      ~600 rounds/min  -> one round every 0.1 s
 *   muzzle velocity  ~715 m/s
 * Sources: Wikipedia AK-47; TFB field-strip guide for the strip order.
 *
 * The assembly sequence is the field strip run backwards, which is the order
 * the rifle actually goes together:
 *   dust cover -> recoil spring -> bolt carrier -> bolt -> gas tube
 * comes apart, so it goes together bolt -> carrier -> spring -> cover last.
 */
import { writeFileSync } from 'node:fs';

// ---------------------------------------------------------------- dimensions
const BORE_Y = 0;                     // bore axis is the datum for everything
const MUZZLE_X = 0.435;
const OVERALL = 0.880;
const STOCK_REAR = MUZZLE_X - OVERALL;   // -0.445
const RECEIVER_LEN = 0.250;
const RECEIVER_FRONT = 0.105;
const RECEIVER_REAR = RECEIVER_FRONT - RECEIVER_LEN;   // -0.145
const RECEIVER_W = 0.038;
const RECEIVER_TOP = 0.015;
const RECEIVER_BOT = -0.055;
const BARREL_R = 0.0085;
const GAS_Y = 0.028;
const MAG_X = 0.010;

const deg = (d) => d;
const mid = (a, b) => (a + b) / 2;

/** A cylinder whose axis runs along X rather than Three's default Y. */
const alongX = (len, r, rEnd = r) => ({
    geometry: { kind: 'cylinder', radiusTop: rEnd, radiusBottom: r, height: len, radialSegments: 20 },
    rot: [0, 0, 90],
});

const parts = [];
const part = (id, spec) => { parts.push({ id, ...spec }); return id; };

// --------------------------------------------------------------- the rifle
part('receiver', {
    geometry: { kind: 'cube', width: RECEIVER_LEN, height: RECEIVER_TOP - RECEIVER_BOT, depth: RECEIVER_W },
    material: 'steel',
    at: [mid(RECEIVER_REAR, RECEIVER_FRONT), mid(RECEIVER_BOT, RECEIVER_TOP), 0],
});

// The front trunnion: the block the barrel is actually pressed into.
part('trunnion', {
    geometry: { kind: 'cube', width: 0.050, height: 0.058, depth: RECEIVER_W + 0.002 },
    material: 'steel', at: [RECEIVER_FRONT - 0.015, -0.014, 0],
});

part('barrel', { ...alongX(0.415, BARREL_R, BARREL_R * 0.86), material: 'steel',
                 at: [MUZZLE_X - 0.415 / 2, BORE_Y, 0] });

// AK-47 wears a plain thread protector, not the AKM's slant brake.
part('muzzleNut', { ...alongX(0.022, 0.0115), material: 'steel', at: [MUZZLE_X - 0.011, BORE_Y, 0] });

part('gasBlock', { geometry: { kind: 'cube', width: 0.046, height: 0.050, depth: 0.030 },
                   material: 'steel', at: [0.322, 0.012, 0] });
part('gasTube', { ...alongX(0.205, 0.0095), material: 'steel', at: [0.218, GAS_Y, 0] });

part('frontSightBlock', { geometry: { kind: 'cube', width: 0.030, height: 0.038, depth: 0.028 },
                          material: 'steel', at: [0.406, 0.016, 0] });
part('frontSightPost', { geometry: { kind: 'cylinder', radiusTop: 0.0028, radiusBottom: 0.0035, height: 0.022 },
                         material: 'steel', at: [0.406, 0.042, 0] });
part('frontSightEars', { geometry: { kind: 'torus', radius: 0.012, tube: 0.0035, radialSegments: 8,
                                     tubularSegments: 20, arc: 3.14159 },
                         material: 'steel', at: [0.406, 0.040, 0], rot: [0, 90, 0] });

part('rearSightBlock', { geometry: { kind: 'cube', width: 0.040, height: 0.026, depth: 0.034 },
                         material: 'steel', at: [0.086, 0.022, 0] });
part('rearSightLeaf', { geometry: { kind: 'cube', width: 0.030, height: 0.012, depth: 0.030 },
                        material: 'steel', at: [0.080, 0.038, 0], rot: [0, 0, -6] });

// Both handguards run from the trunnion to the gas block. Sized short, they
// left a visible gap of bare barrel at the gas end.
part('handguardLower', { geometry: { kind: 'cube', width: 0.175, height: 0.048, depth: 0.044 },
                         material: 'wood', at: [0.213, -0.018, 0] });
part('handguardUpper', { geometry: { kind: 'cube', width: 0.155, height: 0.028, depth: 0.040 },
                         material: 'wood', at: [0.222, 0.040, 0] });

part('dustCover', { geometry: { kind: 'cube', width: 0.218, height: 0.014, depth: RECEIVER_W + 0.001 },
                    material: 'steel', at: [mid(RECEIVER_REAR + 0.01, RECEIVER_FRONT - 0.02), 0.021, 0] });

part('boltCarrier', { geometry: { kind: 'cube', width: 0.158, height: 0.024, depth: 0.026 },
                      material: 'bright', at: [-0.030, 0.004, 0] });
part('chargingHandle', { parent: 'boltCarrier',
                         geometry: { kind: 'cube', width: 0.030, height: 0.012, depth: 0.040 },
                         material: 'bright', at: [0.064, 0.001, 0.030] });
part('bolt', { ...alongX(0.070, 0.0105), material: 'bright', at: [0.028, 0.004, 0] });
part('gasPiston', { ...alongX(0.085, 0.0072), material: 'bright', at: [0.120, GAS_Y, 0] });
part('recoilSpring', { ...alongX(0.112, 0.0062), material: 'bright', at: [-0.085, 0.006, 0] });

part('triggerGuard', { geometry: { kind: 'cube', width: 0.062, height: 0.008, depth: 0.026 },
                       material: 'steel', at: [-0.052, -0.080, 0] });
part('trigger', { geometry: { kind: 'cube', width: 0.009, height: 0.026, depth: 0.008 },
                  material: 'bright', at: [-0.040, -0.068, 0], rot: [0, 0, 8] });
// A box, not a capsule: a capsule's hemispherical ends read as a sausage,
// and an AK grip is a flat-sided slab with a swell.
part('pistolGrip', { geometry: { kind: 'cube', width: 0.032, height: 0.092, depth: 0.034 },
                     material: 'wood', at: [-0.106, -0.098, 0], rot: [0, 0, 18] });
part('selector', { geometry: { kind: 'cube', width: 0.052, height: 0.012, depth: 0.006 },
                   material: 'steel', at: [-0.028, -0.004, RECEIVER_W / 2 + 0.004], rot: [0, 0, 20] });

// Fixed wooden stock: the buttstock plus the wrist that meets the receiver.
// The wrist has to reach the butt. At 105 mm it stopped 35 mm short and the
// stock rendered as two floating blocks.
part('stockWrist', { geometry: { kind: 'cube', width: 0.148, height: 0.052, depth: 0.036 },
                     material: 'wood', at: [RECEIVER_REAR - 0.066, -0.034, 0], rot: [0, 0, -4] });
part('stockButt', { geometry: { kind: 'cube', width: 0.165, height: 0.072, depth: 0.038 },
                    material: 'wood', at: [STOCK_REAR + 0.082, -0.054, 0], rot: [0, 0, -5] });
part('buttPlate', { geometry: { kind: 'cube', width: 0.008, height: 0.074, depth: 0.038 },
                    material: 'steel', at: [STOCK_REAR + 0.003, -0.056, 0], rot: [0, 0, -5] });

/**
 * The curved 30-round magazine, as one profile swept along a curve.
 *
 * This was four rotated slabs, because the engine had six primitives and no
 * way to sweep a section along a path. It now has `extrude` with a path, so
 * the banana curve is the curve rather than an approximation of it, and the
 * seams between the slabs are gone.
 *
 * The section is 75 mm front-to-back -- a 7.62x39 round is 56 mm long and
 * sits crosswise -- by 25 mm across the staggered stack.
 */
part('magazine', {
    geometry: {
        kind: 'extrude',
        shape: [[-0.0125, -0.0375], [0.0125, -0.0375], [0.0125, 0.0375], [-0.0125, 0.0375]],
        path: [[0, 0, 0], [0.006, -0.052, 0], [0.024, -0.101, 0],
               [0.050, -0.146, 0], [0.084, -0.186, 0]],
        steps: 40, bevel: true, bevelSize: 0.0015, bevelThickness: 0.0015,
    },
    material: 'mag', at: [MAG_X, -0.056, 0],
});

part('cleaningRod', { ...alongX(0.265, 0.0024), material: 'bright', at: [0.288, -0.016, 0] });
part('slingLoop', { geometry: { kind: 'torus', radius: 0.009, tube: 0.0022, radialSegments: 8, tubularSegments: 16 },
                    material: 'steel', at: [0.146, -0.044, 0.016], rot: [0, 90, 0] });

// ------------------------------------------------------------------- stage
const WALL_X = 2.4;
const stage = [
    { id: 'wall', geometry: { kind: 'cube', width: 0.22, height: 5.2, depth: 11 },
      material: 'concrete', at: [WALL_X, 0.4, 0] },
    { id: 'floor', geometry: { kind: 'cube', width: 9, height: 0.08, depth: 9 },
      material: 'floor', at: [0.4, -1.63, 0] },
];

// Bullet craters: placed along the burst, grown from nothing on impact.
const IMPACTS = 14;
const craters = [];
for (let i = 0; i < IMPACTS; i++) {
    const a = i / (IMPACTS - 1);
    craters.push({
        id: `crater${i}`,
        geometry: { kind: 'cylinder', radiusTop: 0.030, radiusBottom: 0.046, height: 0.05, radialSegments: 14 },
        material: 'crater', rot: [0, 0, 90], scale: 0,
        // A ragged rising line across the wall, the way recoil actually walks
        // a burst up and right.
        at: [WALL_X - 0.09, -0.45 + a * 0.62 + Math.sin(i * 2.1) * 0.05,
             -0.55 + a * 1.15 + Math.cos(i * 1.7) * 0.07],
    });
}

const film = {
    version: 'jirex.film3d/1',
    meta: { title: 'AK-47 — Assembly', fps: 24, width: 1280, height: 720,
            background: '#1b222c',
            // Threshold high enough that only the flash blooms. At 0.72 the
            // lit steel bloomed too and the whole frame went milky.
            bloom: { strength: 0.6, radius: 0.45, threshold: 0.88 } },
    assets: {
        bed: { kind: 'audio', src: 'demo/assets/ak-bed.wav' },
        clack: { kind: 'audio', src: 'demo/assets/ak-clack.wav' },
        charge: { kind: 'audio', src: 'demo/assets/ak-charge.wav' },
        shot: { kind: 'audio', src: 'demo/assets/ak-shot.wav' },
        impact: { kind: 'audio', src: 'demo/assets/ak-impact.wav' },
    },
    audio: [{ asset: 'bed', at: 0, gain: 0.55, fadeIn: 2.5, fadeOut: 3.5, bus: 'music' }],
    materials: {
        steel: { color: '#4b5058', metalness: 0.88, roughness: 0.38 },
        bright: { color: '#7d848e', metalness: 0.94, roughness: 0.22 },
        wood: { color: '#5e3a1d', metalness: 0.0, roughness: 0.68 },
        mag: { color: '#3a3d43', metalness: 0.82, roughness: 0.45 },
        concrete: { color: '#6a6660', metalness: 0.0, roughness: 0.94 },
        floor: { color: '#121316', metalness: 0.3, roughness: 0.8 },
        crater: { color: '#17161a', metalness: 0.1, roughness: 1.0 },
        flash: { color: '#ffd9a0', emissive: '#ffb347', emissiveIntensity: 3.2, roughness: 1 },
        spark: { color: '#ffd27a', emissive: '#ff9b2e', emissiveIntensity: 5, roughness: 1 },
        // Ejected cases are hot brass, not tracer. On the spark material they
        // glowed like flares tumbling out of the ejection port.
        brass: { color: '#b08436', metalness: 0.95, roughness: 0.28 },
        // Unlit and nearly transparent. Lit, these rendered as solid grey
        // balls hanging in the air -- the worst thing in the first pass.
        smoke: { color: '#9a978f', basic: true, opacity: 0.13 },
        dustM: { color: '#b4ac9c', basic: true, opacity: 0.11 },
        debris: { color: '#6d675d', roughness: 0.95 },
    },
    lights: [
        { id: 'amb', type: 'ambient', color: '#7a8698', intensity: 1.55 },
        { id: 'key', type: 'directional', color: '#fff6e8', intensity: 3.6, at: [1.6, 2.4, 2.2], castShadow: true },
        { id: 'fill', type: 'directional', color: '#9fc4ff', intensity: 1.5, at: [-2.2, 0.6, 1.8] },
        { id: 'rim', type: 'directional', color: '#8ec0ff', intensity: 2.4, at: [-1.8, 1.2, -2.4] },
        { id: 'under', type: 'point', color: '#ffb066', intensity: 0.45, at: [0.1, -0.7, 0.9], distance: 3 },
    ],
    assemblies: {
        ak47: {
            parts: [...parts],
            actions: {
                // 600 rounds/min is one cycle every 0.1 s. The carrier travels
                // its full stroke and returns inside that window.
                cycle: { duration: 0.1, loop: 'repeat',
                         keys: { 'boltCarrier.position.x': [[0, -0.030], [0.045, -0.098], [0.1, -0.030]] } },
            },
        },
    },
    emitters: {},
    cast: [
        { assembly: 'ak47', as: 'ak', at: [0, 0, 0] },
    ],
    scenes: [],
};

// Stage and craters are cast as a second, static assembly.
film.assemblies.set = { parts: [...stage, ...craters] };
// `set: true` keeps the 9-metre wall and floor out of the framing check; a
// subject-sized measurement is meaningless against set dressing.
film.cast.push({ assembly: 'set', as: 'set', at: [0, 0, 0], set: true });

// ========================================================= the fifty seconds

/**
 * Where each part waits before it is fitted.
 *
 * Scattered on a ring by index rather than hand-placed: an exploded view
 * wants parts separated in every direction, and forty-eight hand-chosen
 * offsets is forty-eight chances to overlap two of them.
 */
const flyFrom = (i, n, reach = 0.95) => {
    const a = (i / n) * Math.PI * 2 * 3.5;          // 3.5 turns around the ring
    const r = reach * (0.55 + 0.45 * ((i * 7) % n) / n);
    return [Math.cos(a) * r * 0.75, Math.sin(a) * r, Math.sin(a * 1.7) * r * 0.8];
};
const tumble = (i) => [((i * 53) % 90) - 45, ((i * 97) % 180) - 90, ((i * 31) % 120) - 60];

const partIndex = new Map(parts.map((p, i) => [p.id, i]));
const N = parts.length;

/** One assembly beat: parts arrive staggered inside the shot. */
/**
 * Push a camera away from what it is aiming at.
 *
 * The first pass framed every assembly beat so tight that an 880 mm rifle
 * overflowed the frame on all four sides. There is no staging check for 3D
 * the way there is for 2D, so nothing caught it but looking at a frame.
 */
const pull = (cam, k) => {
    if (!cam) return cam;
    const push = (e) => (!e?.at ? e : { ...e,
        at: e.at.map((v, i) => (e.look?.[i] ?? 0) + (v - (e.look?.[i] ?? 0)) * k) });
    return { ...cam, from: push(cam.from), to: push(cam.to) };
};

function beat({ id, duration, fit, camera, step, lead = 0.25, gap = 0.16, span = 0.62,
                reach = 1.45, on = null, framing = null }) {
    const actions = [];
    for (const [k, pid] of fit.entries()) {
        const i = partIndex.get(pid);
        const arrive = +(lead + k * gap).toFixed(3);
        actions.push({
            do: 'fly', target: `ak/${pid}`,
            from: flyFrom(i, N), fromRot: tumble(i),
            at: arrive, for: span, ease: 'smooth', overshoot: 0.14,
        });
        // The clack lands when the part seats, not when it sets off.
        actions.push({ do: 'sound', asset: 'clack',
                       at: +(arrive + span).toFixed(3), gain: 0.5 });
    }
    return { id, duration, camera: pull(camera, reach), ...(on ? { on } : {}),
             ...(framing ? { framing } : {}), ...(step ? { step } : {}), actions };
}

// ---- firing timing: 600 rpm is one round every 0.1 s --------------------
// Round times are absolute on the timeline, so they are derived from where
// the firing shot actually starts rather than written down. Hardcoding 35.6
// put the entire muzzle flash inside the charging shot, four seconds early --
// which is exactly the arithmetic the declarative compiler exists to remove,
// and it reappeared the moment this generator did it by hand.
const ROUNDS = 17;
const MUZZLE = [MUZZLE_X + 0.02, BORE_Y, 0];
const shotStart = (id) => {
    let t = 0;
    for (const s of shots) { if (s.id === id) return t; t += s.duration; }
    throw new Error(`no shot '${id}'`);
};
const FIRE_IN = 0.45;                       // into the firing shot
let FIRE_AT = 0, roundTimes = [];

const buildEmitters = () => ({
    flash: { count: ROUNDS * 6, at: roundTimes, life: [0.05, 0.095], speed: [3.6, 8.0],
             size: [1.5, 0.25], dir: [1, 0.05, 0], spread: 0.66, origin: MUZZLE,
             geometry: { kind: 'sphere', radius: 0.026 }, material: 'flash',
             blending: 'additive', fade: 0.55, seed: 11 },
    sparks: { count: ROUNDS * 5, at: roundTimes, life: [0.12, 0.3], speed: [1.6, 4.2],
              size: [0.5, 0.1], dir: [1, 0.15, 0], spread: 0.85, gravity: [0, -7, 0],
              origin: MUZZLE, geometry: { kind: 'sphere', radius: 0.008 },
              material: 'spark', blending: 'additive', fade: 1.3, seed: 23 },
    smoke: { count: 24, at: roundTimes.filter((_, i) => i % 3 === 0), life: [1.5, 2.6],
             speed: [0.22, 0.6], size: [0.5, 2.3], dir: [0.75, 0.6, 0], spread: 1.0,
             gravity: [0.05, 0.35, 0], origin: MUZZLE,
             geometry: { kind: 'sphere', radius: 0.035 }, material: 'smoke',
             blending: 'normal', fade: 1.6, seed: 31 },
    // Brass clears the ejection port up and to the right, then falls.
    shells: { count: ROUNDS, at: roundTimes, life: [1.1, 1.5], speed: [1.5, 2.3],
              size: [1, 1], dir: [0.15, 0.78, 0.62], spread: 0.3, gravity: [0, -9.81, 0],
              origin: [0.055, 0.012, 0.022], spin: 24,
              geometry: { kind: 'cylinder', radiusTop: 0.0056, radiusBottom: 0.0062, height: 0.039 },
              material: 'brass', seed: 47 },
    // A round at 715 m/s crosses the 2.4 m to the wall in 3.4 ms -- an eighth
    // of one frame -- so a real bullet cannot be photographed in flight and
    // is not drawn. This is a tracer: slowed to stay on screen for about a
    // frame, which every firearms film does, but with its streak LENGTH
    // solved from velocity x shutter rather than guessed. Geometry for a
    // stretched emitter has its long axis on +Z.
    tracer: { count: ROUNDS, at: roundTimes, life: [0.055, 0.055], speed: [46, 50],
              size: [1, 1], dir: [1, 0.02, 0], spread: 0.012, origin: MUZZLE,
              shutter: 1 / 48,
              geometry: { kind: 'cylinder', radiusTop: 0.0075, radiusBottom: 0.0075,
                          height: 1, radialSegments: 6 },
              material: 'spark', blending: 'additive', fade: 0.4, seed: 71 },

    debris: { count: 60, at: roundTimes.slice(0, IMPACTS), life: [0.7, 1.5],
              speed: [1.0, 3.6], size: [1, 0.4], dir: [-1, 0.35, 0], spread: 0.7,
              gravity: [0, -9.81, 0], origin: [WALL_X - 0.12, -0.15, 0.3],
              geometry: { kind: 'tetrahedron', radius: 0.021 }, material: 'debris',
              spin: 12, seed: 59 },
    dust: { count: 30, at: roundTimes.slice(0, IMPACTS), life: [1.4, 2.8],
            speed: [0.5, 1.9], size: [0.7, 2.8], dir: [-1, 0.45, 0], spread: 1.15,
            gravity: [0, 0.2, 0], origin: [WALL_X - 0.12, -0.15, 0.3],
            geometry: { kind: 'sphere', radius: 0.05 }, material: 'dustM',
            blending: 'normal', fade: 1.5, seed: 67 },
});

const MAG = ['magazine'];

const shots = [
    // ---- Act 1: the exploded reveal -----------------------------------
    { id: '01-reveal', duration: 5,
      camera: { from: { at: [-1.5, 0.95, 2.5], look: [0, 0, 0], fov: 46 },
                to: { at: [-0.75, 0.45, 1.65], look: [0, 0, 0], fov: 38 }, ease: 'smooth' } },
    { id: '02-survey', duration: 4,
      camera: { from: { at: [-0.75, 0.45, 1.65], look: [0, 0, 0] },
                to: { at: [0.85, -0.25, 1.5], look: [0.05, 0, 0] }, ease: 'smooth' } },

    // ---- Act 2: assembly, the field strip run backwards ---------------
    beat({ id: '03-receiver', duration: 2.5, fit: ['receiver', 'trunnion'],
           camera: { from: { at: [0.85, -0.25, 1.5], look: [0.05, 0, 0] },
                     to: { at: [-0.18, 0.2, 0.68], look: [-0.02, -0.01, 0], fov: 36 } } }),
    beat({ id: '04-barrel', duration: 2.5, fit: ['barrel', 'muzzleNut'],
           camera: { from: { at: [-0.18, 0.2, 0.68], look: [-0.02, -0.01, 0] },
                     to: { at: [0.46, 0.12, 0.52], look: [0.3, 0.0, 0], fov: 34 } } }),
    beat({ id: '05-gas', duration: 2.5,
           fit: ['gasBlock', 'gasTube', 'frontSightBlock', 'frontSightPost', 'frontSightEars'],
           camera: { from: { at: [0.46, 0.12, 0.52], look: [0.3, 0, 0] },
                     to: { at: [0.3, 0.2, 0.4], look: [0.33, 0.02, 0], fov: 32 } },
           gap: 0.12, span: 0.5 }),
    beat({ id: '06-furniture', duration: 2.5, fit: ['handguardLower', 'handguardUpper', 'cleaningRod'],
           camera: { from: { at: [0.3, 0.2, 0.4], look: [0.33, 0.02, 0] },
                     to: { at: [0.16, -0.1, 0.56], look: [0.2, -0.01, 0], fov: 34 } } }),
    beat({ id: '07-sights', duration: 2, fit: ['rearSightBlock', 'rearSightLeaf', 'slingLoop'],
           camera: { from: { at: [0.16, -0.1, 0.56], look: [0.2, -0.01, 0] },
                     to: { at: [-0.02, 0.16, 0.38], look: [0.08, 0.02, 0], fov: 30 } },
           gap: 0.13, span: 0.5 }),
    beat({ id: '08-trigger', duration: 2.5, fit: ['triggerGuard', 'trigger', 'pistolGrip'],
           camera: { from: { at: [-0.02, 0.16, 0.38], look: [0.08, 0.02, 0] },
                     to: { at: [-0.22, -0.16, 0.5], look: [-0.07, -0.07, 0], fov: 34 } } }),
    beat({ id: '09-stock', duration: 2.5, fit: ['stockWrist', 'stockButt', 'buttPlate'],
           camera: { from: { at: [-0.22, -0.16, 0.5], look: [-0.07, -0.07, 0] },
                     to: { at: [-0.5, 0.06, 0.62], look: [-0.3, -0.04, 0], fov: 36 } } }),
    beat({ id: '10-bolt', duration: 3,
           fit: ['bolt', 'boltCarrier', 'gasPiston', 'recoilSpring'],
           camera: { from: { at: [-0.5, 0.06, 0.62], look: [-0.3, -0.04, 0] },
                     to: { at: [-0.1, 0.34, 0.44], look: [-0.02, 0.01, 0], fov: 32 } },
           gap: 0.2, span: 0.58 }),
    beat({ id: '11-cover', duration: 2.5, fit: ['dustCover', 'selector'],
           camera: { from: { at: [-0.1, 0.34, 0.44], look: [-0.02, 0.01, 0] },
                     to: { at: [-0.08, 0.1, 0.52], look: [-0.03, -0.01, 0], fov: 34 } } }),
    // The magazine rocks in as one piece: four slabs, no stagger between them.
    // Measured on the magazine, which is what this beat is about.
    // Pulled back until the magazine meets the magwell in frame. At the
    // original reach the check measured 293% of the magazine's own height --
    // a slab of metal filling the screen, with the thing it was seating into
    // out of shot.
    beat({ id: '12-mag', duration: 3, fit: MAG, on: 'ak/magazine', framing: 'close', reach: 2.6,
           camera: { from: { at: [-0.08, 0.1, 0.52], look: [-0.03, -0.01, 0] },
                     to: { at: [0.1, -0.22, 0.46], look: [0.01, -0.09, 0], fov: 33 } },
           lead: 0.55, gap: 0.015, span: 0.75 }),

    // ---- Act 3: charge, then fire -------------------------------------
    // Declared, because the crop is the point: this is the charging handle.
    // `on` names the handle, not the rifle, so the check measures what the
    // shot is about: a macro of a 30 mm part is not an overflowing shot of an
    // 880 mm one. No `framing` band is claimed, because the handle TRAVELS
    // 68 mm here and the shot has to hold both ends of the stroke -- the
    // undeclared overflow and too-small guards still apply.
    { id: '13-charge', duration: 2.5, on: 'ak/chargingHandle',
      camera: { from: { at: [0.0118, -0.0164, 0.1298], look: [0.005, 0.004, 0.015] },
                to: { at: [0.0017, 0.0372, 0.1060], look: [0, 0.004, 0.015], fov: 32 } },
      actions: [
          // Pulled fully to the rear, held, then released to slam forward.
          { do: 'move', target: 'ak/boltCarrier', to: [-0.098, 0.004, 0], at: 0.35, for: 0.45,
            ease: 'smooth', anticipate: 0.1 },
          { do: 'move', target: 'ak/boltCarrier', to: [-0.030, 0.004, 0], at: 1.05, for: 0.1,
            ease: 'smooth', overshoot: 0.22 },
          { do: 'turn', target: 'ak/selector', to: [0, 0, -16], at: 1.5, for: 0.35 },
          { do: 'sound', asset: 'charge', at: 0.3, gain: 0.85 },
          { do: 'sound', asset: 'clack', at: 1.52, gain: 0.4 },
      ] },
    { id: '14-shoulder', duration: 2,
      camera: { from: { at: [0.1, 0.12, 0.34], look: [0.02, 0.01, 0], fov: 30 },
                to: { at: [-1.25, 0.34, 1.75], look: [0.55, -0.08, 0.1], fov: 52 }, ease: 'smooth' },
      actions: [{ do: 'turn', target: 'ak', to: [0, 0, 0], at: 0, for: 1.6 }] },
    { id: '15-fire', duration: 5,
      camera: { from: { at: [-1.25, 0.34, 1.75], look: [0.55, -0.08, 0.1], fov: 52 },
                to: { at: [-1.05, 0.26, 2.05], look: [0.85, -0.14, 0.15], fov: 54 },
                ease: 'smooth', shake: { amount: 0.022, frequency: 26, at: 0.4, for: 1.9 } },
      actions: [{ do: 'play', target: 'ak', action: 'cycle', at: 0.35, for: 1.75 }] },
    { id: '16-impact', duration: 3.5,
      camera: { from: { at: [1.35, 0.05, 1.15], look: [2.3, -0.2, 0.2], fov: 38 },
                to: { at: [1.72, -0.08, 0.78], look: [2.33, -0.24, 0.22], fov: 32 },
                ease: 'smooth' } },
    // The closing frame has to carry the brief: the rifle AND what it did to
    // the wall, in one shot.
    { id: '17-hero', duration: 2.5,
      camera: { from: { at: [-0.55, 0.62, 2.15], look: [1.0, -0.12, 0.25], fov: 52 },
                to: { at: [-0.3, 0.3, 1.75], look: [0.75, -0.14, 0.22], fov: 48 }, ease: 'smooth' } },
];

// Now that the shots exist, the firing beat has a real start time.
const FIRE_SHOT = '15-fire';
FIRE_AT = +(shotStart(FIRE_SHOT) + FIRE_IN).toFixed(3);
roundTimes = Array.from({ length: ROUNDS }, (_, i) => +(FIRE_AT + i * 0.1).toFixed(3));
film.emitters = buildEmitters();

// Craters open on the frame their round lands. Scale is the only channel that
// can bring geometry into existence here -- there is no "spawn" -- and 0 to 1
// over two frames reads as the hole punching through.
const craterShot = shots.find((s) => s.id === FIRE_SHOT);
craterShot.actions = craterShot.actions ?? [];
// One report per round, one concrete crack per impact.
for (const t of roundTimes) {
    craterShot.actions.push({ do: 'sound', asset: 'shot', gain: 0.95,
                              at: +(t - shotStart(FIRE_SHOT)).toFixed(3) });
}
for (const [i] of craters.entries()) {
    craterShot.actions.push({ do: 'sound', asset: 'impact', gain: 0.5,
                              at: +(roundTimes[i] + 0.004 - shotStart(FIRE_SHOT)).toFixed(3) });
}
for (const [i, c] of craters.entries()) {
    craterShot.actions.push({ do: 'grow', target: `set/${c.id}`, to: 1,
                              at: +(roundTimes[i] - shotStart(FIRE_SHOT)).toFixed(3),
                              for: 0.08, ease: 'smooth' });
}

film.scenes = [{ id: 'main', shots }];

const total = shots.reduce((a, s) => a + s.duration, 0);
console.log(`${shots.length} shots, ${total.toFixed(1)}s, `
            + `${ROUNDS} rounds from ${FIRE_AT}s to ${roundTimes[ROUNDS - 1]}s `
            + `at 600 rpm, ${IMPACTS} craters`);

writeFileSync(new URL('../demo/ak47.json', import.meta.url),
              JSON.stringify(film, null, 1) + '\n');
console.log(`ak47.json: ${parts.length} rifle parts, ${stage.length + craters.length} set pieces`);
console.log(`overall ${((MUZZLE_X - STOCK_REAR) * 1000).toFixed(0)}mm (real 880mm), `
            + `barrel 415mm, receiver ${(RECEIVER_LEN * 1000).toFixed(0)}mm`);
