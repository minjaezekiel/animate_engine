/**
 * "Inside the Earth" -- a one-minute 3D film, written as a generator.
 *
 *   node scripts/make-earth.mjs            # writes films/earth3d.json
 *
 * # What it is for
 *
 * It is a TEST, and the brief says so: a presenter says what the engine can
 * do, and then the engine has to actually do it. Everything in frame is a
 * thing the 3D path either had or did not have, and the ones it did not have
 * are now in `../docs/completed_phases/../docs/completed_phases/34-EARTH-3D.md` with what each cost.
 *
 * # The two decisions worth arguing about
 *
 * **The crust is drawn at true scale.** It is 30 km of 6371, so it comes out
 * as a hairline you can barely see. Every Earth-layers diagram ever printed
 * draws it ten times too thick in order to have somewhere to put the label,
 * and the narration here says "less than one percent of the planet" -- so a
 * fattened crust would be contradicting the sentence spoken over it. The
 * legibility problem is solved with a macro shot instead, which is what a
 * camera is for.
 *
 * **The cutaway is geometry, not a clipping plane.** A clip plane discards
 * fragments, which leaves the planet hollow: you see the inside of the far
 * wall and there is no cut FACE, and a cut face is the entire content of a
 * cutaway. So the section is built as real geometry -- 270-degree shells
 * plus annular caps -- and the quarter that was removed is a separate group
 * that flies out, which also makes the cut an EVENT rather than a state.
 * (Clip planes are still the right tool for sectioning a set or a prop that
 * has no layers to show, and `meta.clip` + the `cut` verb now do that.)
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import {
    R_INNER, R_OUTER, R_MANTLE, R_CRUST,
    albedoSpec, heightSpec, roughnessSpec, cloudSpec, nightSpec,
    mantleSpec, outerCoreSpec, innerCoreSpec, starSpec,
} from './lib/earth.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
const OUT = process.argv[2] ?? 'films/earth3d.json';

/** The globe's own frame, in world space. A two-metre hologram beside a man. */
const EARTH_AT = [-0.78, 1.5, -0.55];
const HOST_AT = [1.52, 0, 0.55];

/**
 * The notch faces the camera.
 *
 * THREE's sphere runs phi from -X (0 deg) through +Z (90) and +X (180) to -Z
 * (270). A shell of phiLength 270 is therefore missing the quadrant between
 * -Z and -X, whose bisector points at (-0.707, 0, -0.707). Rotating the globe
 * 135 degrees about Y swings that bisector onto +Z, which is where the camera
 * lives. Worked out once here rather than found by rotating until it looked
 * right, because "until it looked right" is six renders.
 */
const NOTCH_FACING_CAMERA = 135;
const AXIAL_TILT = -23.4;

/**
 * The exposed normal of cut face A, in world space.
 *
 * The section's two faces lie at local phi = 0 and phi = 270. Face A is the
 * half-plane x <= 0, and the removed quadrant is on its -Z side, so the
 * surface you actually see faces local -Z. Through the globe's 135-degree
 * spin and the 23.4-degree tilt that becomes the vector below -- derived
 * once, here, rather than found by orbiting a camera until the cut looked
 * flat-on, which is six renders and a number nobody can check.
 *
 * Confirmed against `WHERE=earth/mCrust,...`: the four layer markers lie on
 * a straight line out of the globe's centre along exactly this direction.
 */
const FACE_A = (() => {
    const spin = NOTCH_FACING_CAMERA * Math.PI / 180;
    const tilt = AXIAL_TILT * Math.PI / 180;
    // local -Z, spun about Y, then tilted about Z
    let [x, y, z] = [0, 0, -1];
    [x, z] = [x * Math.cos(spin) + z * Math.sin(spin), -x * Math.sin(spin) + z * Math.cos(spin)];
    [x, y] = [x * Math.cos(tilt) - y * Math.sin(tilt), x * Math.sin(tilt) + y * Math.cos(tilt)];
    const L = Math.hypot(x, y, z);
    return [x / L, y / L, z / L];
})();

/** Mid-radius of each layer on the cut face, where its label points. */
const mark = (r, elevDeg = 34) => [
    -r * Math.cos(elevDeg * Math.PI / 180),
    r * Math.sin(elevDeg * Math.PI / 180),
    0,
].map((n) => +n.toFixed(4));

const LINES = [
    'This is the current ability of the 3D animate engine.',
    'Everything here — the figure, the planet, the light — is one text file, '
        + 'rendered in a browser.',
    'This is Earth. Six thousand three hundred and seventy-one kilometres '
        + 'from the surface to the centre.',
    'Cut it open, and it is four layers.',
    'The crust. Seventy kilometres under a mountain range, five under the ocean floor. '
        + 'Less than one percent of the planet.',
    'Below it, the mantle. Two thousand nine hundred kilometres of rock hot enough to flow, '
        + 'about as fast as a fingernail grows.',
    'Then the outer core. Liquid iron, four thousand degrees, and moving — '
        + 'which is what gives this planet a magnetic field.',
    'At the centre, the inner core. Iron so compressed it stays solid at '
        + 'five thousand four hundred degrees — nearly as hot as the surface of the sun.',
    'Four layers. One file. One browser. That is the engine.',
];

/** A cut face is an annulus; the innermost one is a disc. */
const capPart = (id, parent, inner, outer, material, face) => ({
    id, parent,
    geometry: inner > 0
        ? { kind: 'circle', innerRadius: inner, radius: outer, radialSegments: 96,
            // Face A is the phi=0 plane, which is the x<=0 half of the XY
            // plane: a ring sweeping from +Y through -X to -Y.
            thetaStart: face === 'A' ? 90 : -90, thetaLength: 180 }
        : { kind: 'circle', radius: outer, radialSegments: 96,
            thetaStart: face === 'A' ? 90 : -90, thetaLength: 180 },
    // Face B is the phi=270 plane: the same half-ring, rotated so +X lands
    // on -Z.
    rot: face === 'A' ? [0, 0, 0] : [0, 90, 0],
    material,
    // Double-sided because a cut face is looked at from whichever side the
    // camera happens to be on, and a one-sided cap vanishes from half the
    // orbit with nothing to say why.
    castShadow: false,
});

/** One layer: a sectioned shell plus its cap on both faces. */
const layerParts = (id, parent, radius, material, { phiStart = 0, phiLength = 270 } = {}) => ([
    { id, parent,
      geometry: { kind: 'sphere', radius, widthSegments: 128, heightSegments: 80,
                  phiStart, phiLength },
      // Nothing in the globe casts: a planet throwing a hard ellipse onto a
      // studio floor is the single cue that makes a hologram read as a ball
      // on a table, which is what the first pass looked like.
      material, castShadow: false, receiveShadow: false },
]);

const film = {
    version: 1,
    meta: {
        title: 'Inside the Earth',
        fps: 24,
        width: 1920,
        height: 1080,
        background: '#04060b',
        /**
         * A documentary grade, not a game look.
         *
         * `ssao` is deliberately absent: the globe is a smooth convex body
         * with nothing to occlude, and SSAO on it only darkens the limb,
         * which fights the atmosphere. The passes that earn their cost here
         * are bloom (the core has to glow), a shallow DOF so a macro of the
         * crust has a focal plane, and grain, which is most of what stops a
         * clean raster frame reading as a render.
         */
        post: {
            bloom: { strength: 0.42, radius: 0.62, threshold: 0.72 },
            /**
             * A very small aperture, because focus CANNOT be racked.
             *
             * `meta.post` is read once at build time and no post parameter is
             * keyframeable, so a film has exactly one focal plane for its
             * whole length. This film moves the camera from 5 metres off the
             * planet to 0.85 metres off a cut face, and any aperture wide
             * enough to be visible at one end defocuses the other end
             * completely. So the depth of field here is almost nothing, and
             * "rack focus" is in the gap list rather than in the film.
             */
            dof: { focus: 2.4, aperture: 0.00012, maxblur: 0.004 },
            grade: {
                exposure: 1.09, contrast: 1.06, saturation: 1.2,
                temperature: 0.06, vignette: 0.3, vignetteSoftness: 0.55,
                grain: 0.016, grainSize: 1.4, chromatic: 0.09,
                lift: [0.004, 0.005, 0.012],
            },
            smaa: true,
        },
    },

    /**
     * Textures, all synthesized. See `scripts/lib/earth.mjs` for why the
     * coastlines are checked in rather than fetched.
     */
    textures: {
        albedo: albedoSpec(2048),
        height: heightSpec(1024),
        // Derived from the height plate, so a ridge in the shading is a
        // ridge in the colour. Two independent noises would light the
        // terrain from nowhere.
        surfaceNormal: { normalFrom: 'height', strength: 2.6 },
        roughness: roughnessSpec(1024),
        cloud: cloudSpec(2048),
        night: nightSpec(1024),
        mantleFace: mantleSpec(1024),
        outerFace: outerCoreSpec(512),
        innerFace: innerCoreSpec(512),
        stars: starSpec(2048),
    },

    materials: {
        surface: {
            map: 'albedo',
            normalMap: 'surfaceNormal',
            roughnessMap: 'roughness',
            // Night lights on the dark side. `emissiveMap` is modulated by
            // `emissive`, so the colour here is the lamp colour and the plate
            // is where the lamps are.
            emissiveMap: 'night',
            emissive: '#ffcf84',
            /**
             * 0.45, not 1.5.
             *
             * There is no day/night mask without a custom shader, so an
             * emissive map glows on the LIT side too. At 1.5 the first render
             * had orange city blobs scattered across a sunlit Pacific. At
             * 0.45 they are invisible against daylight and are the only thing
             * on the dark side, which is the whole effect and the honest
             * limit of doing it without a shader.
             */
            emissiveIntensity: 0.45,
            metalness: 0,
            roughness: 1,
            // 0.85 made every coastline a cliff: the height plate steps from
            // sea to land in one texel, so a strong normal scale turns the
            // whole coast into a shadowed ridge.
            normalScale: [0.45, 0.45],
        },
        clouds: {
            color: '#ffffff',
            alphaMap: 'cloud',
            transparent: true,
            // 0.92 whited the planet out: the alpha plate averages 0.26, but
            // its bright cells are near 1.0 and they are large, so almost
            // every continent was under opaque cloud. Earth is about 67%
            // covered and you can still see it.
            // 0.38. The frame digest reported the globe's most common lit
            // hue as "white" rather than "blue" at 0.5 -- which is a true
            // statement about a planet under too much cloud, arrived at
            // without rendering a single image to look at.
            opacity: 0.38,
            depthWrite: false,
            roughness: 0.95,
            metalness: 0,
        },
        air: { glow: true, color: '#7cc0ff', intensity: 1.35, power: 2.9, bias: 0.02 },
        airInner: { glow: true, color: '#9ed4ff', intensity: 0.5, power: 5.0, side: 'front' },
        mantleRock: {
            map: 'mantleFace', roughness: 0.82, metalness: 0.05,
            emissive: '#5d1d08', emissiveIntensity: 0.55, side: 'double',
        },
        outerCore: {
            map: 'outerFace', roughness: 0.42, metalness: 0.25,
            emissive: '#ff7a1e', emissiveIntensity: 1.25, side: 'double',
        },
        innerCore: {
            map: 'innerFace', roughness: 0.3, metalness: 0.5,
            // 1.7 put the inner-core close-up at 0.78 mean luma -- washed
            // out, and reported by the exposure check before a frame was
            // graded. An emissive that fills the frame is a light source
            // pointed at the lens.
            emissive: '#ffcb5e', emissiveIntensity: 0.85, side: 'double',
        },
        crustFace: { color: '#6b5a4a', roughness: 0.95, metalness: 0, side: 'double' },
        /**
         * `toneMapped: false` on the sky.
         *
         * The star plate has a mean of 13 in 255 -- that is what a sky
         * looks like -- and ACES maps that to about 0.03 before the grade's
         * vignette takes another third off the corners. The first render had
         * a pure black background with no stars visible at all, and the
         * texture was bound correctly the whole time. A sky is not a surface
         * being lit; it is the reference white of the shot.
         */
        sky: { map: 'stars', basic: true, side: 'back', opacity: 1,
               toneMapped: false, depthWrite: false },
        // Near black. A visible floor under a planet reads as a ball on a
        // table, which is the one thing a hologram must not look like. What
        // is wanted is a ground plane dark enough to be only a shadow
        // catcher and a faint sense of down.
        floor: { color: '#03050a', roughness: 0.95, metalness: 0 },

        // The presenter, carried over from demo/rig3d.json so this film is
        // testing the Earth and not a second character setup.
        skin: { color: '#d8a584', metalness: 0, roughness: 0.74, physical: true,
                sheen: 0.5, sheenRoughness: 0.62, sheenColor: '#ff9f82' },
        skinThin: { color: '#d8a584', roughness: 0.7, physical: true, sheen: 0.6,
                    sheenColor: '#ff8f72', transmission: 0.18, thickness: 0.008,
                    attenuationColor: '#b3503c', attenuationDistance: 0.03 },
        eyeWhite: { color: '#f6f8fa', roughness: 0.26 },
        iris: { color: '#3d6f9e', roughness: 0.3 },
        pupil: { color: '#0d1116', roughness: 0.2 },
        hair: { color: '#2e231a', roughness: 0.58, physical: true, sheen: 0.8,
                sheenColor: '#8a6a46', clearcoat: 0.25 },
        tooth: { color: '#f1ece0', roughness: 0.2 },
        tongue: { color: '#9e4f58', roughness: 0.45 },
        jacket: { color: '#333d4f', roughness: 0.76 },
        shirt: { color: '#e4ebf3', roughness: 0.68 },
        trouser: { color: '#2a3240', roughness: 0.8 },
        shoe: { color: '#15171c', metalness: 0.2, roughness: 0.45 },
    },

    lights: [
        // Low ambient: space is not a softbox, and the whole point of a
        // planet shot is a hard terminator.
        { id: 'amb', type: 'ambient', color: '#5b6b84', intensity: 0.95 },
        {
            id: 'sun', type: 'directional', color: '#fff6e8', intensity: 5.2,
            at: [4.2, 2.6, 3.4], castShadow: true,
        },
        // A cool bounce so the night side is readable rather than black. A
        // real planet gets this from nothing, but a frame where half the
        // subject is pure black is a frame where half the subject is gone.
        { id: 'bounce', type: 'directional', color: '#4e7ebd', intensity: 1.15,
          at: [-3.4, -0.8, -2.2] },
        /**
         * The section light, aimed straight into the cut face.
         *
         * The sun sits at (4.2, 2.6, 3.4) and the exposed cut face points at
         * (-0.65, 0.28, 0.71): the dot product of the face normal with the
         * direction to the sun is 0.07, so the face is within four degrees of
         * edge-on to it and receives essentially nothing. The first render of
         * the cutaway came back at 0.029 mean luma -- a black frame where the
         * whole content of the film was supposed to be -- and the exposure
         * check named the shot and the second.
         *
         * Placed by the same `FACE_A` vector the cameras use, so moving the
         * notch moves the light with it instead of leaving a second hand-typed
         * direction to drift.
         */
        /**
         * A SPOT, not a directional.
         *
         * A directional light is infinite and parallel, so a section light
         * strong enough to read the cut face also washed the studio floor
         * forty degrees away -- which is why the crust macro had a pale grey
         * wedge across its empty half.
         *
         * A spot at 4 m with a 26-degree cone lights the section and nothing
         * else. Its intensity is in candela and falls off as 1/r-squared
         * (three.js has been physically correct since r155), so matching a
         * directional's 3.2 at four metres means 3.2 x 16 -- which is why the
         * number below looks absurd next to the others and is not.
         */
        { id: 'section', type: 'spot', color: '#ffe9d2', intensity: 52,
          angle: 26, penumbra: 0.55, distance: 0, castShadow: false,
          at: [+(EARTH_AT[0] + FACE_A[0] * 4).toFixed(2),
               +(EARTH_AT[1] + FACE_A[1] * 4).toFixed(2),
               +(EARTH_AT[2] + FACE_A[2] * 4).toFixed(2)],
          target: EARTH_AT },
        // The studio half: key, fill and rim on the presenter.
        /**
         * The studio rig, turned well down.
         *
         * A directional light is infinite: there is no way to light the
         * presenter without also lighting the planet two metres away, and at
         * the first intensities each of these put its own specular glint on
         * the ocean. Five suns. The sun and the section light do most of the
         * work now and these only shape the figure.
         */
        { id: 'key', type: 'directional', color: '#fff2e2', intensity: 1.1,
          at: [2.6, 3.0, 3.2] },
        { id: 'fill', type: 'directional', color: '#9bbcf0', intensity: 0.45,
          at: [-1.4, 1.6, 3.0] },
        { id: 'rim', type: 'directional', color: '#8fb6ff', intensity: 0.9,
          at: [1.2, 2.2, -2.4] },
    ],

    assemblies: {
        set: {
            parts: [
                { id: 'sky',
                  geometry: { kind: 'sphere', radius: 60, widthSegments: 64, heightSegments: 40 },
                  material: 'sky', castShadow: false, receiveShadow: false },
                // 14 metres, not 44: at 44 the plane reached well behind the
                // globe and its lit far edge drew a horizon line straight
                // across every space shot.
                { id: 'floor', geometry: { kind: 'plane', width: 14, height: 14 },
                  material: 'floor', at: [0, 0, 0], rot: [-90, 0, 0], castShadow: false },
            ],
        },

        earth: {
            parts: [
                // Tilt, then spin inside the tilt. Two nested pivots, because
                // one node has one rotation and the pole has to hold still.
                { id: 'tilt', rot: [0, 0, AXIAL_TILT] },
                { id: 'globe', parent: 'tilt', rot: [0, NOTCH_FACING_CAMERA, 0] },

                /**
                 * The unbroken planet, for the first three shots.
                 *
                 * A 270-degree shell butted against a 90-degree wedge meets
                 * along two seams, and at 128 segments the normals either
                 * side of a seam do not quite agree -- which draws a thin
                 * dark meridian down an otherwise perfect globe, on every
                 * frame, including the three shots where the planet is
                 * supposed to be whole. So the whole planet is its own mesh
                 * and the sectioned set is a second one, swapped on a cut
                 * where nobody can see the join.
                 */
                { id: 'whole', parent: 'globe',
                  geometry: { kind: 'sphere', radius: R_CRUST,
                              widthSegments: 160, heightSegments: 96 },
                  material: 'surface', castShadow: false, receiveShadow: false },
                { id: 'cloudsWhole', parent: 'globe',
                  geometry: { kind: 'sphere', radius: R_CRUST * 1.008,
                              widthSegments: 128, heightSegments: 72 },
                  material: 'clouds', castShadow: false, receiveShadow: false },

                // The sectioned planet, hidden until the cut.
                { id: 'sec', parent: 'globe', visible: false },
                ...layerParts('crust', 'sec', R_CRUST, 'surface'),
                ...layerParts('mantle', 'sec', R_MANTLE, 'mantleRock'),
                ...layerParts('outer', 'sec', R_OUTER, 'outerCore'),
                ...layerParts('inner', 'sec', R_INNER, 'innerCore'),
                ...['A', 'B'].flatMap((f) => [
                    capPart(`cap${f}Crust`, 'sec', R_MANTLE, R_CRUST, 'crustFace', f),
                    capPart(`cap${f}Mantle`, 'sec', R_OUTER, R_MANTLE, 'mantleRock', f),
                    capPart(`cap${f}Outer`, 'sec', R_INNER, R_OUTER, 'outerCore', f),
                    capPart(`cap${f}Inner`, 'sec', 0, R_INNER, 'innerCore', f),
                ]),

                /**
                 * The quarter that was removed, as a group that can leave.
                 *
                 * It carries no caps of its own: while it is in place its own
                 * shells hide the section's caps, and giving it a second set
                 * of coincident discs is a z-fight on two full-screen planes.
                 */
                { id: 'wedge', parent: 'globe', visible: false },
                ...layerParts('wCrust', 'wedge', R_CRUST, 'surface',
                              { phiStart: 270, phiLength: 90 }),
                ...layerParts('wMantle', 'wedge', R_MANTLE, 'mantleRock',
                              { phiStart: 270, phiLength: 90 }),
                ...layerParts('wOuter', 'wedge', R_OUTER, 'outerCore',
                              { phiStart: 270, phiLength: 90 }),
                ...layerParts('wInner', 'wedge', R_INNER, 'innerCore',
                              { phiStart: 270, phiLength: 90 }),

                // Atmosphere: two shells, outside and in. The inner one at
                // low intensity and FRONT side puts a haze over the disc
                // itself, which is what keeps the terminator from reading as
                // a hard edge.
                { id: 'air', parent: 'globe',
                  geometry: { kind: 'sphere', radius: R_CRUST * 1.035,
                              widthSegments: 96, heightSegments: 56 },
                  material: 'air', castShadow: false, receiveShadow: false },
                { id: 'airIn', parent: 'globe',
                  geometry: { kind: 'sphere', radius: R_CRUST * 1.002,
                              widthSegments: 96, heightSegments: 56 },
                  material: 'airInner', castShadow: false, receiveShadow: false },

                // Label anchors: pivots on cut face A at the mid-radius of
                // each layer. Invisible, weightless, and the only reason the
                // callouts stay on their layer while the camera moves.
                { id: 'mCrust', parent: 'sec', at: mark((R_MANTLE + R_CRUST) / 2) },
                { id: 'mMantle', parent: 'sec', at: mark((R_OUTER + R_MANTLE) / 2) },
                { id: 'mOuter', parent: 'sec', at: mark((R_INNER + R_OUTER) / 2) },
                { id: 'mInner', parent: 'sec', at: mark(R_INNER * 0.5) },
            ],
        },
    },

    characters: {
        host: {
            rig: 'humanoid', height: 1.82, outfit: 'suit',
            skin: 'skin', jacket: 'jacket', shirt: 'shirt', trouser: 'trouser',
            shoe: 'shoe', hair: 'hair', tooth: 'tooth', tongue: 'tongue',
            hairStyle: { thickness: 0.009, strands: 11, ripple: 0.45 },
            parts: [
                { id: 'eyeL', parent: 'head', material: 'eyeWhite',
                  geometry: { kind: 'sphere', radius: 0.0142 }, at: [0.033, 0.0465, 0.0735] },
                { id: 'eyeR', parent: 'head', material: 'eyeWhite',
                  geometry: { kind: 'sphere', radius: 0.0142 }, at: [-0.033, 0.0465, 0.0735] },
                { id: 'irisL', parent: 'eyeL', material: 'iris',
                  geometry: { kind: 'sphere', radius: 0.0063 }, at: [0, 0, 0.0092] },
                { id: 'irisR', parent: 'eyeR', material: 'iris',
                  geometry: { kind: 'sphere', radius: 0.0063 }, at: [0, 0, 0.0092] },
                { id: 'pupilL', parent: 'irisL', material: 'pupil',
                  geometry: { kind: 'sphere', radius: 0.0029 }, at: [0, 0, 0.0046] },
                { id: 'pupilR', parent: 'irisR', material: 'pupil',
                  geometry: { kind: 'sphere', radius: 0.0029 }, at: [0, 0, 0.0046] },
                { id: 'noseTip', parent: 'head', material: 'skinThin',
                  geometry: { kind: 'sphere', radius: 0.0145 }, at: [0, 0.018, 0.088],
                  scale: [0.9, 0.85, 1.05] },
                { id: 'earL', parent: 'head', material: 'skinThin',
                  geometry: { kind: 'sphere', radius: 0.021 }, at: [0.082, 0.032, 0.004],
                  scale: [0.35, 1.25, 0.85] },
                { id: 'earR', parent: 'head', material: 'skinThin',
                  geometry: { kind: 'sphere', radius: 0.021 }, at: [-0.082, 0.032, 0.004],
                  scale: [0.35, 1.25, 0.85] },
            ],
            constraints: [
                { type: 'lookAt', source: 'eyeL', target: 'gaze',
                  limit: { x: [-22, 22], y: [-34, 34] } },
                { type: 'lookAt', source: 'eyeR', target: 'gaze',
                  limit: { x: [-22, 22], y: [-34, 34] } },
                { type: 'lookAt', source: 'head', target: 'gaze', weight: 0.34,
                  limit: { x: [-14, 14], y: [-38, 38] } },
                { type: 'ik', chain: 'armR', target: 'reach', pole: [0, 0, -1],
                  limit: { x: [-145, 2] } },
            ],
            voice: 'host',
        },
    },

    voices: {
        /**
         * One voice, named by ROLE.
         *
         * `warm-m-us` resolves through `core/voice/catalog.js` to a vendored
         * Piper model, so this film renders offline. The same name resolves
         * to a Kokoro or a cloned OpenVoice voice when one is configured --
         * see `src/core/voice/gateway.js`. Nothing in this document changes.
         */
        host: { spec: 'tts:en_US-hfc_male-medium', lang: 'en-US' },
    },

    targets: {
        gaze: { at: [1.45, 1.62, 3.2] },
        reach: { at: [1.18, 1.2, 0.72] },
    },

    assets: {
        bed: { kind: 'audio', src: 'films/assets/earth-bed.wav' },
        swell: { kind: 'audio', src: 'films/assets/earth-swell.wav' },
        open: { kind: 'audio', src: 'films/assets/earth-open.wav' },
        core: { kind: 'audio', src: 'films/assets/earth-core.wav' },
    },

    // A bed under the whole film, ducked well below the voice. One cue,
    // because there is still no looping cue and a 64-second bed is 6 MB of
    // WAV -- which is the honest cost and is written down in the status file.
    /**
     * Gains chosen against a measured mix, not by ear.
     *
     * At bed 0.3 / swell 0.42 / open 0.5 the finished file peaked at +0.3
     * dBFS -- clipping, through an encoder, with every check in the repo
     * passing it. The mixer now holds a 1 dB ceiling and says how far it had
     * to pull back; these numbers are set so it does not have to.
     */
    audio: [{ asset: 'bed', at: 0, gain: 0.22, fadeIn: 1.2, fadeOut: 3.0, bus: 'music' }],

    cast: [
        /**
         * `set: true` keeps the floor and the sky sphere out of the framing
         * check's subject pool. Without it every shot with no declared `on`
         * is measured against a 44-metre floor and a 60-metre sky, which
         * overflow the frame by construction -- three warnings per shot, all
         * of them about scenery nobody is framing.
         */
        { assembly: 'set', as: 'set', set: true },
        { assembly: 'earth', as: 'earth', at: EARTH_AT },
        { character: 'host', as: 'host', at: HOST_AT, rot: [0, -16, 0] },
    ],

    overlay: {
        subtitle: {
            font: '600 38px "Helvetica Neue", Helvetica, Arial, sans-serif',
            bottom: 0.085, maxWidth: 0.78,
        },
        label: {
            font: '600 27px "Helvetica Neue", Helvetica, Arial, sans-serif',
            band: 'rgba(6,9,14,0.66)',
        },
        items: [],      // filled below, once shot times are known
    },

    scenes: [],
};

/**
 * Shots, with their dialogue and their actions.
 *
 * Durations are first guesses: `retimeToAudio` grows any shot whose line runs
 * longer than it, on the real synthesized audio, so these are a floor rather
 * than a contract. Written as a list so the overlay can be timed off the same
 * numbers instead of a second set of hand-copied offsets -- which is exactly
 * the arithmetic that fired an entire muzzle flash four seconds early in
 * Phase 14.
 */
const E = EARTH_AT;
const near = (dx, dy, dz) => [E[0] + dx, E[1] + dy, E[2] + dz];

/**
 * How big a sphere of radius `r` looks, and therefore where to stand.
 *
 * `d = r / (f * tan(fov/2))` for a subject occupying fraction `f` of frame
 * HEIGHT (three.js fov is vertical). Written down because the first pass
 * placed every camera by eye at between 2.3 and 2.6 metres from a one-metre
 * planet, which at fov 32 puts the subject at 130% of frame height -- the
 * planet overflowed the frame in all four of its own shots, and the framing
 * check passed every one of them because none of them declared a `framing`
 * to be checked against.
 *
 * That is the whole lesson: the analytic check can only catch what the film
 * claims. Every shot below now declares one.
 */
const standOff = (r, f, fovDeg) => +(r / (f * Math.tan(fovDeg * Math.PI / 360))).toFixed(3);


/** A point `d` out along the cut face's normal from `p`, nudged sideways. */
const offFace = (p, d, lift = 0) => [
    +(p[0] + FACE_A[0] * d).toFixed(3),
    +(p[1] + FACE_A[1] * d + lift).toFixed(3),
    +(p[2] + FACE_A[2] * d).toFixed(3),
];

/** An orbit position around the globe. Azimuth 0 looks straight into the notch. */
const orbit = (azDeg, elDeg, d) => {
    const az = azDeg * Math.PI / 180;
    const el = elDeg * Math.PI / 180;
    return [
        +(E[0] + d * Math.sin(az) * Math.cos(el)).toFixed(3),
        +(E[1] + d * Math.sin(el)).toFixed(3),
        +(E[2] + d * Math.cos(az) * Math.cos(el)).toFixed(3),
    ];
};

// The four layer markers, in world space. Same arithmetic the compiler does,
// so the cameras and the label anchors cannot drift apart.
const WORLD = (localAt) => {
    const spin = NOTCH_FACING_CAMERA * Math.PI / 180;
    const tilt = AXIAL_TILT * Math.PI / 180;
    let [x, y, z] = localAt;
    [x, z] = [x * Math.cos(spin) + z * Math.sin(spin), -x * Math.sin(spin) + z * Math.cos(spin)];
    [x, y] = [x * Math.cos(tilt) - y * Math.sin(tilt), x * Math.sin(tilt) + y * Math.cos(tilt)];
    return [+(E[0] + x).toFixed(3), +(E[1] + y).toFixed(3), +(E[2] + z).toFixed(3)];
};
const M_CRUST = WORLD(mark((R_MANTLE + R_CRUST) / 2));
const M_MANTLE = WORLD(mark((R_OUTER + R_MANTLE) / 2));
const M_OUTER = WORLD(mark((R_INNER + R_OUTER) / 2));

const SHOTS = [
    {
        id: 'hello', duration: 5.2, line: 0, on: 'host', framing: 'close',
        camera: { from: { at: [1.74, 1.62, 2.72], look: [1.5, 1.42, 0.55], fov: 38 },
                  to: { at: [1.80, 1.60, 2.48], look: [1.5, 1.43, 0.55], fov: 37 } },
        actions: [
            { do: 'express', target: 'host', expression: 'warm', at: 0.4, for: 0.6, amount: 0.55 },
            { do: 'grip', target: 'host/handR', pose: 'relaxed', at: 0, for: 0.3 },
            { do: 'grip', target: 'host/handL', pose: 'relaxed', at: 0, for: 0.3 },
            { do: 'move', target: 'gaze', to: [1.5, 1.6, 3.4], at: 0.2, for: 0.8 },
        ],
    },
    {
        id: 'reveal', duration: 6.4, line: 1, on: 'host', framing: 'close',
        camera: { from: { at: [1.80, 1.60, 2.48], look: [1.5, 1.43, 0.55], fov: 37 },
                  to: { at: [0.52, 1.86, 3.65], look: [0.15, 1.5, -0.1], fov: 44 } },
        actions: [
            // He turns to present the globe: the gaze target moves onto it
            // and the IK hand follows, which is the whole of "he gestures".
            { do: 'move', target: 'gaze', to: near(0.1, 0.1, 0.9), at: 1.1, for: 1.1 },
            { do: 'move', target: 'reach', to: [0.72, 1.36, 0.95], at: 1.0, for: 1.2,
              overshoot: 0.12 },
            { do: 'grip', target: 'host/handR', pose: 'open', at: 1.2, for: 0.5 },
            { do: 'spin', target: 'earth/whole', axis: 'y', turns: 0.1, at: 0, for: 6.4 },
            { do: 'spin', target: 'earth/cloudsWhole', axis: 'y', turns: 0.125, at: 0, for: 6.4 },
        ],
    },
    {
        id: 'globe', duration: 7.4, line: 2, on: 'earth', framing: 'medium',
        camera: { from: { at: orbit(-7, 11, standOff(1, 0.50, 32)), look: E, fov: 32 },
                  to: { at: orbit(-2, 8, standOff(1, 0.62, 32)), look: E, fov: 32 } },
        actions: [
            { do: 'spin', target: 'earth/whole', axis: 'y', turns: 0.115, at: 0, for: 7.4 },
            { do: 'spin', target: 'earth/cloudsWhole', axis: 'y', turns: 0.14, at: 0, for: 7.4 },
            { do: 'move', target: 'gaze', to: near(0.1, 0.1, 0.9), at: 0, for: 0.5 },
        ],
    },
    {
        id: 'open', duration: 5.6, line: 3, on: 'earth', framing: 'medium',
        camera: { from: { at: orbit(-2, 8, standOff(1, 0.62, 34)), look: E, fov: 34 },
                  to: { at: orbit(-26, 15, standOff(1, 0.58, 34)), look: E, fov: 34 } },
        actions: [
            /**
             * The swap and the departure.
             *
             * `set visible` on one frame, under a cut, so nobody sees the
             * whole planet become a sectioned one. Then the wedge leaves
             * along its own bisector -- which after the 135-degree spin is
             * simply +Z in the globe's frame, straight at the camera and up
             * out of shot.
             *
             * The atmosphere goes with it. Both shells are full spheres, so
             * once the planet has a notch in it they hang in the gap as two
             * stray blue arcs over empty space -- which is what the first
             * render showed, and is the price of an effect that only makes
             * sense around a whole body.
             */
            { do: 'set', target: 'earth/whole', channel: 'visible', value: false, at: 0 },
            { do: 'set', target: 'earth/cloudsWhole', channel: 'visible', value: false, at: 0 },
            { do: 'set', target: 'earth/air', channel: 'visible', value: false, at: 0 },
            { do: 'set', target: 'earth/airIn', channel: 'visible', value: false, at: 0 },
            { do: 'set', target: 'earth/sec', channel: 'visible', value: true, at: 0 },
            { do: 'set', target: 'earth/wedge', channel: 'visible', value: true, at: 0 },
            { do: 'move', target: 'earth/wedge', to: [0, 0.6, 2.5], at: 1.25, for: 2.7,
              ease: 'smooth', anticipate: 0.12 },
            { do: 'turn', target: 'earth/wedge', to: [16, 0, -24], at: 1.25, for: 2.7 },
            { do: 'set', target: 'earth/wedge', channel: 'visible', value: false, at: 4.2 },
            { do: 'sound', asset: 'open', at: 1.2, gain: 0.36 },
        ],
    },
    {
        id: 'crust', duration: 8.6, line: 4, on: 'earth/crust', framing: 'macro',
        label: { anchor: 'earth/mCrust', text: ['Crust', '5\u201370 km \u00b7 <1%'],
                 offset: [110, -70], at: 1.5, for: 6.3 },
        // A macro of the cut face: the crust is 5 mm of a 1000 mm planet at
        // this scale, so the frame has to be about 0.34 m tall for it to be
        // a visible line -- and a visible LINE is the point. Fattening it
        // would contradict the sentence spoken over it.
        camera: { from: { at: offFace(M_CRUST, 1.25, 0.06), look: M_CRUST, fov: 22 },
                  to: { at: offFace(M_CRUST, 0.88, 0.02), look: M_CRUST, fov: 22 } },
        actions: [],
    },
    {
        id: 'mantle', duration: 8.6, line: 5, on: 'earth/mantle', framing: 'macro',
        label: { anchor: 'earth/mMantle', text: ['Mantle', '2,900 km of flowing rock'],
                 offset: [118, -54], at: 1.3, for: 6.6 },
        camera: { from: { at: offFace(M_CRUST, 0.88, 0.02), look: M_CRUST, fov: 22 },
                  to: { at: offFace(M_MANTLE, 2.45, 0.1), look: M_MANTLE, fov: 30 } },
        actions: [],
    },
    {
        id: 'outer', duration: 8.2, line: 6, on: 'earth/outer', framing: 'close',
        label: { anchor: 'earth/mOuter', text: ['Outer core', 'Liquid iron \u00b7 4,000 \u00b0C'],
                 offset: [-118, -58], at: 1.2, for: 6.4 },
        camera: { from: { at: offFace(M_MANTLE, 2.45, 0.1), look: M_MANTLE, fov: 30 },
                  to: { at: offFace(M_OUTER, 1.78, 0.04), look: M_OUTER, fov: 28 } },
        actions: [
            { do: 'sound', asset: 'core', at: 0.3, gain: 0.24 },
        ],
    },
    {
        id: 'inner', duration: 9.0, line: 7, on: 'earth/inner', framing: 'medium',
        label: { anchor: 'earth/mInner', text: ['Inner core', 'Solid iron \u00b7 5,400 \u00b0C'],
                 offset: [-124, -50], at: 1.4, for: 7.0 },
        camera: { from: { at: offFace(M_OUTER, 1.78, 0.04), look: M_OUTER, fov: 28 },
                  to: { at: offFace(E, standOff(R_INNER, 0.5, 26)), look: E, fov: 26 } },
        actions: [],
    },
    {
        id: 'close', duration: 6.4, line: 8, on: 'host', framing: 'medium',
        camera: { from: { at: offFace(E, standOff(R_INNER, 0.5, 26)), look: E, fov: 26 },
                  to: { at: [0.72, 1.92, 4.75], look: [0.3, 1.45, 0.05], fov: 46 } },
        actions: [
            { do: 'move', target: 'gaze', to: [1.45, 1.62, 3.4], at: 1.8, for: 1.2 },
            { do: 'move', target: 'reach', to: [1.18, 1.2, 0.72], at: 1.4, for: 1.1 },
            { do: 'grip', target: 'host/handR', pose: 'relaxed', at: 1.6, for: 0.5 },
            { do: 'express', target: 'host', expression: 'warm', at: 3.0, for: 0.7, amount: 0.5 },
            { do: 'sound', asset: 'swell', at: 0.2, gain: 0.3 },
        ],
    },
];

let t = 0;
const shots = [];
for (const s of SHOTS) {
    shots.push({
        id: s.id,
        duration: s.duration,
        camera: s.camera,
        ...(s.on ? { on: s.on } : {}),
        ...(s.framing ? { framing: s.framing } : {}),
        dialogue: s.line != null
            ? [{ speaker: 'host', text: LINES[s.line], at: 0.35 }]
            : [],
        actions: s.actions ?? [],
    });
    if (s.label) {
        film.overlay.items.push({
            kind: 'label',
            lines: s.label.text,
            anchor: s.label.anchor,
            offset: s.label.offset,
            // Timed off the shot's own start, computed here, so a shot
            // duration can change without a label going with the wrong one.
            at: +(t + s.label.at).toFixed(2),
            for: s.label.for,
            fade: 0.4,
        });
    }
    t += s.duration;
}

/**
 * The slate, ABOVE the subtitle band.
 *
 * Authored at y: 0.915 first, which is exactly where a caption goes -- so the
 * opening line would have printed straight through it for its whole life.
 * The overlay check reported it by name and by pixel before a frame was ever
 * rendered, which is the entire reason the check works on a draw list rather
 * than on a canvas.
 */
film.overlay.items.push({
    kind: 'text', lines: ['jireX · 3D engine test'], x: 0.5, y: 0.072,
    at: 0.6, for: 3.6, fade: 0.5, size: 26, align: 'center',
});

film.scenes = [{ id: 'main', shots }];

await mkdir(join(ROOT, dirname(OUT)), { recursive: true });
await writeFile(join(ROOT, OUT), `${JSON.stringify(film, null, 2)}\n`);
const words = LINES.join(' ').split(/\s+/).length;
console.log(`wrote ${OUT}`);
console.log(`  ${shots.length} shots, ${t.toFixed(1)}s authored, `
    + `${words} words (~${(words / 2.7).toFixed(0)}s of speech)`);
console.log(`  ${film.overlay.items.length} overlay items, `
    + `${Object.keys(film.textures).length} textures`);
