/**
 * The Earth, as data: coarse coastlines, layer radii, and the texture specs
 * built from them.
 *
 * # Why the coastlines are in this repo and not fetched
 *
 * A planet that does not look like Earth is not a test of anything. Pure
 * fractal noise gives a convincing *alien* world -- the continents are the
 * wrong shape and a viewer knows instantly, without being able to say why.
 *
 * The obvious answer is NASA's Blue Marble plate, and `textures: { id: {
 * src } }` now loads exactly that. But the repo's bargain is that `git clone`
 * plus `npm run` reproduces every film byte for byte, and a 5 MB image
 * fetched from a government server at render time is not that. So the
 * geography is ~340 vertices of public-domain outline, checked in, rasterized
 * by `core/art/textures.js` into an equirectangular plate, and roughened with
 * fBm so the coast is a coast rather than a vector path.
 *
 * It is coarse on purpose. At the framings this film uses -- a globe between
 * a third and the full height of frame -- a 2-degree coastline is already
 * finer than the pixels. What it has to get right is the *silhouette* of each
 * landmass, because that is what makes a viewer recognise the planet.
 *
 * # Radii are real, and one of them is the whole argument
 *
 * Every number below is in kilometres from the centre, and the film works in
 * units of one Earth radius, so a layer's drawn thickness IS its real
 * fraction of the planet. That matters because the crust then comes out as a
 * hairline you can barely see -- which is correct, and which almost every
 * Earth-layers diagram ever drawn gets wrong by a factor of ten in order to
 * have something to label. The narration says "less than one percent of the
 * planet"; a picture showing it as a tenth would be contradicting the
 * sentence being spoken over it. So the film keeps the true scale and solves
 * legibility with a macro shot instead, which is what `staging3d`'s
 * part-level `on:` exemption exists for.
 */

export const R_EARTH = 6371;          // km, mean radius
export const LAYERS = {
    innerCore: { to: 1220, name: 'Inner core' },
    outerCore: { to: 3480, name: 'Outer core' },
    mantle: { to: 6341, name: 'Mantle' },
    crust: { to: 6371, name: 'Crust' },
};
/** A layer boundary as a fraction of the radius -- the film's own unit. */
export const r = (km) => +(km / R_EARTH).toFixed(5);

export const R_INNER = r(LAYERS.innerCore.to);      // 0.19149
export const R_OUTER = r(LAYERS.outerCore.to);      // 0.54623
export const R_MANTLE = r(LAYERS.mantle.to);        // 0.99529
export const R_CRUST = r(LAYERS.crust.to);          // 1

/**
 * Coastlines, [longitude, latitude] in degrees, one ring per landmass.
 *
 * Traced coarsely from public-domain outlines. Rings close themselves, so the
 * last point need not repeat the first.
 */
export const COASTLINES = [
    // Africa
    [[-17, 21], [-16, 13], [-13, 9], [-8, 5], [0, 5], [9, 4], [9, 0], [12, -5],
     [13, -12], [15, -18], [18, -29], [20, -34], [25, -34], [32, -29], [33, -26],
     [35, -21], [40, -16], [40, -10], [39, -6], [41, -2], [44, 2], [51, 11],
     [44, 12], [43, 13], [39, 15], [37, 20], [34, 28], [32, 31], [25, 32],
     [18, 30], [11, 33], [3, 36], [-2, 35], [-6, 36], [-10, 30], [-13, 27]],
    // Eurasia
    [[-10, 36], [-9, 39], [-9, 43], [-2, 43], [0, 47], [-5, 48], [-1, 49],
     [2, 51], [4, 52], [7, 53], [9, 55], [13, 54], [19, 55], [21, 56], [24, 57],
     [28, 59], [30, 60], [25, 65], [21, 65], [22, 70], [28, 71], [38, 68],
     [44, 67], [55, 68], [60, 70], [70, 73], [80, 73], [90, 76], [105, 77],
     [113, 74], [128, 73], [140, 72], [160, 70], [170, 69], [180, 66], [180, 62],
     [170, 60], [162, 60], [155, 57], [143, 59], [137, 54], [131, 43], [128, 38],
     [126, 37], [122, 40], [120, 36], [122, 31], [121, 24], [110, 21], [108, 13],
     [105, 9], [100, 13], [98, 8], [100, 4], [103, 1], [98, 6], [94, 16],
     [90, 22], [80, 8], [77, 8], [70, 22], [66, 25], [57, 25], [48, 30],
     [44, 38], [36, 36], [30, 36], [27, 37], [23, 38], [16, 38], [18, 41],
     [13, 45], [12, 44], [8, 44], [3, 43], [-2, 37], [-6, 36]],
    // North America
    [[-168, 66], [-162, 70], [-156, 71], [-145, 70], [-133, 69], [-125, 70],
     [-115, 69], [-105, 68], [-95, 68], [-85, 70], [-80, 73], [-70, 76],
     [-62, 66], [-64, 60], [-78, 62], [-80, 52], [-67, 50], [-60, 47], [-66, 44],
     [-70, 42], [-74, 40], [-76, 35], [-81, 31], [-80, 25], [-83, 28], [-85, 30],
     [-90, 29], [-95, 29], [-97, 26], [-98, 21], [-95, 18], [-92, 15], [-87, 13],
     [-83, 9], [-78, 8], [-80, 9], [-85, 15], [-90, 20], [-97, 22], [-105, 22],
     [-110, 24], [-112, 30], [-117, 32], [-122, 37], [-124, 43], [-124, 48],
     [-131, 53], [-136, 58], [-146, 60], [-153, 58], [-162, 55], [-165, 60]],
    // South America
    [[-78, 8], [-75, 10], [-70, 12], [-62, 10], [-60, 5], [-52, 5], [-50, 0],
     [-44, -2], [-38, -5], [-35, -8], [-39, -13], [-39, -18], [-43, -23],
     [-48, -25], [-53, -34], [-57, -38], [-62, -40], [-65, -45], [-68, -50],
     [-70, -55], [-75, -52], [-73, -45], [-74, -40], [-72, -35], [-71, -30],
     [-70, -23], [-70, -18], [-77, -12], [-81, -6], [-80, -2], [-78, 1], [-77, 8]],
    // Australia
    [[113, -22], [114, -27], [116, -32], [122, -34], [129, -32], [135, -35],
     [138, -35], [141, -38], [147, -38], [150, -36], [153, -29], [153, -25],
     [146, -19], [142, -11], [136, -12], [130, -12], [125, -14], [122, -18]],
    // Greenland
    [[-45, 60], [-50, 64], [-53, 68], [-58, 72], [-55, 76], [-45, 82], [-30, 83],
     [-20, 80], [-22, 74], [-30, 68], [-40, 63]],
    // Antarctica -- a ring just inside the pole, so the fill has an edge to
    // frazzle rather than running off the bottom of the plate as a band.
    [[-180, -72], [-150, -76], [-120, -74], [-90, -73], [-60, -78], [-30, -72],
     [0, -70], [30, -69], [60, -67], [90, -66], [120, -67], [150, -70],
     [180, -72], [180, -89], [-180, -89]],
    // Madagascar, Britain, Japan, New Guinea, Borneo, Sumatra, New Zealand
    [[43, -12], [50, -15], [50, -25], [45, -25], [43, -18]],
    [[-6, 50], [-3, 51], [1, 51], [0, 54], [-2, 56], [-5, 58], [-5, 55], [-3, 53]],
    [[130, 31], [135, 34], [140, 36], [142, 40], [145, 43], [141, 45], [140, 41],
     [137, 37], [132, 34]],
    [[131, -1], [140, -3], [147, -8], [141, -9], [134, -8], [131, -4]],
    [[109, 2], [115, 5], [119, 5], [117, -3], [110, -3], [109, 0]],
    [[95, 5], [100, 2], [105, -5], [102, -6], [97, 1]],
    [[173, -35], [178, -38], [177, -41], [172, -43], [167, -46], [166, -45],
     [170, -41], [172, -38]],
];

/**
 * The albedo plate: ocean, land, terrain variation, deserts, ice.
 *
 * Layer order is the argument. Ocean first as a latitude ramp, because the
 * sea really is a different colour at the poles than at the equator and a
 * flat blue is the single thing that most makes a CG globe read as a beach
 * ball. Then the continents as one masked fill, so every later land layer can
 * say `mask: 'land'` and stop at the coast. Then two noise passes on that
 * mask -- one for green/brown variation, one much coarser for the arid belts
 * at the horse latitudes. Ice last, over everything, because an ice sheet
 * covers land and sea alike.
 */
export const albedoSpec = (size = 2048) => ({
    width: size, height: size / 2,
    background: '#0b2545',
    layers: [
        {
            kind: 'gradient', axis: 'y', id: 'ocean',
            stops: [
                [0.00, '#2e4f6b'], [0.10, '#17446e'], [0.28, '#0d4a7d'],
                [0.50, '#0a5285'], [0.72, '#0d4a7d'], [0.90, '#17446e'],
                [1.00, '#2e4f6b'],
            ],
        },
        // Deep-ocean mottling: the sea floor shows through as a value change
        // at the scale of a basin, not a wave.
        { kind: 'noise', seed: 4411, octaves: 4, scale: 10, blend: 'softLight',
          alpha: 0.35 },
        {
            kind: 'polygons', id: 'land', polygons: COASTLINES,
            color: '#4e6b3c', jitter: 0.03, seed: 77,
        },
        // Terrain: green through olive to brown, on land only.
        { kind: 'noise', id: 'relief', seed: 1301, octaves: 7, scale: 18,
          mask: 'land', alpha: 1, contrast: 1.45,
          stops: [[0.00, '#1e3d1b'], [0.22, '#2b5222'], [0.42, '#3d6228'],
                  [0.60, '#4e6a2e'], [0.74, '#5f6c35'], [0.88, '#7a7044'],
                  [1.00, '#9c8c60']] },
        /**
         * The arid belts, as a three-way intersection.
         *
         * Deserts are a circulation feature: air rises at the equator, dries,
         * and descends at the horse latitudes around 15-35 degrees. So this
         * is noise masked by land AND by "inside 36 degrees" AND by "outside
         * 7 degrees" -- which is exactly the composition the single-mask
         * version could not express, and why its first pass put sand in
         * Siberia and none in the Sahara.
         */
        { kind: 'latitudeBand', id: 'subtropics', north: 36, south: -36,
          feather: 9, color: '#000000', alpha: 0 },
        { kind: 'latitudeBand', id: 'offEquator', north: 12, south: -12,
          feather: 9, color: '#000000', alpha: 0 },
        { kind: 'noise', seed: 909, octaves: 4, scale: 9, contrast: 1.9,
          mask: ['land', '!subtropics', 'offEquator'],
          stops: [[0.00, '#6b6a3800'], [0.46, '#8a7c4800'], [0.66, '#b99f68bb'],
                  [1.00, '#dcc08cff']] },
        /**
         * Polar ice, ragged.
         *
         * The first pass was two hard latitude bands, and it drew a white BAR
         * across the plate from 55 degrees north -- straight-edged, over
         * ocean and land alike, reaching most of Canada and Scandinavia. Real
         * ice has a coastline of its own.
         *
         * So the band defines a zone and draws nothing (`alpha: 0`), and
         * noise with transparent stops paints inside it. The ramp carries
         * alpha, so the ice fades out through broken pack rather than ending
         * on a line.
         */
        { kind: 'latitudeBand', id: 'polar', north: 73, south: -64,
          feather: 10, color: '#000000', alpha: 0 },
        { kind: 'noise', seed: 3777, octaves: 5, scale: 22, mask: 'polar',
          contrast: 1.5,
          stops: [[0.00, '#dfeaf400'], [0.34, '#e4eef700'], [0.52, '#eef4fa99'],
                  [0.72, '#f6fafdee'], [1.00, '#ffffffff']] },
        // Antarctica is a continent under permanent sheet, not pack ice, so
        // the land there is covered outright rather than fringed.
        // `north: 999` disables the northern half of the band: a latitude
        // band covers everything ABOVE north and BELOW south, and the north
        // pole has no continent under it -- only the pack ice the layer
        // above already drew.
        { kind: 'latitudeBand', id: 'deepSouth', north: 999, south: -74,
          feather: 6, color: '#f7fbff', alpha: 1 },
    ],
});

/**
 * A height plate for the normal map: sea flat, land rough.
 *
 * Shares the land mask and the relief seed with the albedo, so a mountain in
 * the normal map is a mountain in the colour map. Two independently seeded
 * noises would put the shading in the wrong places, which reads as a surface
 * that is lit from nowhere.
 */
export const heightSpec = (size = 1024) => ({
    width: size, height: size / 2,
    background: '#303030',
    linear: true,
    layers: [
        { kind: 'polygons', id: 'land', polygons: COASTLINES, color: '#808080',
          jitter: 0.012, seed: 77 },
        { kind: 'noise', seed: 1301, octaves: 6, scale: 14, mask: 'land',
          alpha: 1, contrast: 1.6,
          stops: [[0, '#4a4a4a'], [1, '#ffffff']] },
        // Ridged noise on top: a mountain chain is a ridge, and plain fBm
        // makes rolling hills everywhere instead.
        { kind: 'noise', seed: 2027, octaves: 5, scale: 20, ridged: true,
          mask: 'land', alpha: 0.5, blend: 'screen',
          stops: [[0, '#000000'], [1, '#ffffff']] },
    ],
});

/**
 * Roughness: the ocean is smooth and specular, the land is not.
 *
 * This single map is most of why the globe reads as a planet rather than a
 * painted ball -- the sun's reflection crawls across the sea and stops dead
 * at every coastline, which is the strongest cue there is that one of those
 * surfaces is water.
 *
 * Stored LINEAR. Tagged sRGB it is un-gammaed on read, and a 0.12 ocean
 * becomes about 0.013 -- a mirror, with a hard white sun-dot and no sheen at
 * all. That failure is almost impossible to attribute by eye.
 */
export const roughnessSpec = (size = 1024) => ({
    width: size, height: size / 2,
    // 0.29, not 0.12. Real sea is nearly a mirror, and on a sphere lit by a
    // single distant sun that gives one small bright glint, which is lovely.
    // Lit by five directional lights it gives FIVE, scattered across the
    // ocean like a disco ball -- and a studio rig aimed at a presenter
    // standing beside the globe is five lights whether the globe wants them
    // or not.
    background: '#4a4a4a',
    linear: true,
    layers: [
        { kind: 'polygons', polygons: COASTLINES, color: '#d8d8d8',
          jitter: 0.012, seed: 77 },
        { kind: 'noise', seed: 1301, octaves: 4, scale: 14, alpha: 0.25,
          blend: 'softLight' },
    ],
});

/**
 * Cloud cover, as an alpha plate.
 *
 * The bands matter. Real cloud is organised by latitude -- a wet belt at the
 * equator, dry at the horse latitudes, wet again at the storm tracks -- and
 * uniform noise reads as static. So this is noise multiplied by a banded
 * gradient, and the result is recognisably a weather map rather than a
 * texture.
 */
export const cloudSpec = (size = 2048) => ({
    width: size, height: size / 2,
    background: '#000000',
    linear: true,
    layers: [
        /**
         * Fine cells, not continents.
         *
         * The first pass used `scale: 8`, which on a 2048-wide plate makes a
         * lattice cell about 2500 km across -- so every "cloud" was the size
         * of the Mediterranean and the globe looked marbled rather than
         * weathered. Real cumulus organises at tens to low hundreds of
         * kilometres, which on this plate is scale 24 and up.
         */
        { kind: 'noise', seed: 5150, octaves: 7, scale: 26, contrast: 1.7,
          stops: [[0.00, '#000000'], [0.44, '#000000'], [0.58, '#8c8c8c'],
                  [0.74, '#e8e8e8'], [1.00, '#ffffff']] },
        /**
         * Latitude weighting, GENTLY.
         *
         * The first pass multiplied by a ramp running from near-black to pure
         * white, which drew hard bright horizontal streaks across the plate
         * wherever a white stop fell -- a multiply against 1.0 leaves the
         * noise untouched while its neighbours at 0.17 are erased, and the
         * eye reads the boundary as a drawn line. Weather bands are a bias of
         * maybe two to one, not twenty, so the ramp now runs 0.45 to 1.0 and
         * the bands read as bands instead of as banding.
         */
        { kind: 'gradient', axis: 'y', blend: 'multiply',
          stops: [[0.00, '#c4c4c4'], [0.14, '#9a9a9a'], [0.26, '#ededed'],
                  [0.36, '#737373'], [0.50, '#ffffff'], [0.64, '#737373'],
                  [0.74, '#ededed'], [0.86, '#9a9a9a'], [1.00, '#c4c4c4']] },
        // Wisps, so a cell edge is torn rather than contoured.
        { kind: 'noise', seed: 6161, octaves: 6, scale: 70, alpha: 0.5,
          blend: 'screen',
          stops: [[0, '#000000'], [0.62, '#000000'], [1, '#ffffff']] },
    ],
});

/** Night lights: a sparse emissive plate, on land only, away from the poles. */
export const nightSpec = (size = 1024) => ({
    width: size, height: size / 2,
    background: '#000000',
    layers: [
        { kind: 'polygons', id: 'land', polygons: COASTLINES, color: '#ffffff' },
        { kind: 'noise', seed: 8313, octaves: 7, scale: 44, mask: 'land',
          contrast: 3.4,
          stops: [[0.00, '#000000'], [0.70, '#000000'], [0.86, '#3a2a10'],
                  [0.95, '#ffc766'], [1.00, '#fff0c2']] },
        { kind: 'latitudeBand', north: 60, south: -48, feather: 10,
          color: '#000000', alpha: 1 },
    ],
});

/**
 * The mantle's cut face, and the shells below it.
 *
 * Not a colour: a cut face is where a layered planet is read, and a flat
 * orange disc is a pie chart. Ridged noise gives it the convective grain the
 * mantle actually has, and the radial gradient gives the temperature
 * gradient -- cooler at the top, hotter toward the core -- which is the one
 * thing the narration is about.
 */
export const mantleSpec = (size = 1024) => ({
    width: size, height: size,
    background: '#5a2411',
    layers: [
        { kind: 'gradient', axis: 'radial', center: [0.5, 0.5], radius: 0.5,
          stops: [[0.00, '#c8591c'], [0.35, '#a33f16'], [0.62, '#7a2d12'],
                  [0.84, '#5a2411'], [1.00, '#3f1a0d']] },
        { kind: 'noise', seed: 3141, octaves: 6, scale: 12, ridged: true,
          alpha: 0.55, blend: 'softLight' },
        { kind: 'noise', seed: 2718, octaves: 4, scale: 30, alpha: 0.3,
          blend: 'overlay' },
    ],
});

/** The outer core: liquid iron, so the grain is flow rather than fracture. */
export const outerCoreSpec = (size = 512) => ({
    width: size, height: size,
    background: '#c2440c',
    layers: [
        { kind: 'gradient', axis: 'radial', center: [0.5, 0.5], radius: 0.5,
          stops: [[0.00, '#ffd27a'], [0.30, '#ffa23a'], [0.62, '#f06a16'],
                  [1.00, '#b93c08']] },
        { kind: 'noise', seed: 1618, octaves: 5, scale: 9, alpha: 0.4,
          blend: 'softLight' },
    ],
});

/** The inner core: solid, so a crystalline grain rather than a flowing one. */
export const innerCoreSpec = (size = 512) => ({
    width: size, height: size,
    background: '#ffe9b0',
    layers: [
        { kind: 'gradient', axis: 'radial', center: [0.5, 0.5], radius: 0.5,
          stops: [[0.00, '#fffbe8'], [0.45, '#ffe28c'], [0.80, '#ffb347'],
                  [1.00, '#f08a1e']] },
        { kind: 'noise', seed: 2357, octaves: 4, scale: 16, ridged: true,
          alpha: 0.3, blend: 'overlay' },
    ],
});

/**
 * A starfield, for the inside of a very large sphere.
 *
 * Thresholded noise at a fine lattice, which gives points rather than
 * clumps, plus a faint wide layer for the Milky Way's glow. A uniform black
 * sky is the other thing that makes a CG planet read as a studio shot.
 */
export const starSpec = (size = 2048) => ({
    width: size, height: size / 2,
    background: '#04060b',
    layers: [
        // The galactic band: one broad, faint, slanted glow. Without it the
        // sky is uniform, and a uniform sky is the other thing that makes a
        // CG planet read as a studio shot.
        { kind: 'noise', seed: 9001, octaves: 3, scale: 5, alpha: 0.5,
          blend: 'screen',
          stops: [[0.00, '#04060b'], [0.55, '#070b16'], [0.80, '#0e1526'],
                  [1.00, '#1b2742']] },
        /**
         * Stars: a fine lattice, thresholded HIGH, and no `contrast`.
         *
         * `contrast` was the bug. It is `(n - 0.5) * k + 0.5`, so at k = 14
         * every value above 0.536 saturates to 1 and everything below 0.464
         * to 0 -- a fair coin per texel. The plate came out as television
         * static: half the sky lit, mean 165 of 255.
         *
         * Sparseness is a property of the RAMP, not of the contrast. Value
         * noise is roughly uniform on 0..1, so a ramp that is black until
         * 0.986 lights about one and a half percent of texels, which is what
         * a star field is. Two passes at different lattices give two
         * magnitudes without a second mechanism.
         */
        { kind: 'noise', seed: 4242, octaves: 1, scale: 260, blend: 'screen',
          stops: [[0.000, '#000000'], [0.972, '#000000'], [0.984, '#9fb0cc'],
                  [1.000, '#ffffff']] },
        { kind: 'noise', seed: 1771, octaves: 1, scale: 430, blend: 'screen',
          stops: [[0.000, '#000000'], [0.988, '#000000'], [0.995, '#dce9ff'],
                  [1.000, '#ffffff']] },
    ],
});
