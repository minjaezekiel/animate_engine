/**
 * The bottle collector, drawn rather than assembled.
 *
 * Studied from `anime22.mp4` frame 0. The proportions matter more than any
 * single contour: he is a **4.5-head caricature**, not a realistic figure --
 * a big head, a deep barrel chest, short legs mostly hidden by the coat.
 * Drawing him at eight heads, as the first pass did, produced a slim tube
 * with a small head and no amount of line quality rescued it.
 *
 * He faces SCREEN LEFT, which is -x here.
 *
 * Part names are the biped rig's, so the generated cycles in
 * `core/script/generate.js` drive him unchanged. Contours deliberately
 * overshoot their joints: a hand-drawn figure has one line through the
 * shoulder, and a contour stopping exactly at a pivot is how a cutout rig
 * announces itself.
 */

const s = (path, w = 6, color = 'ink') => ({ path, brush: 'pencil', color, size: w });

export function drawnManParts({ k = 1 } = {}) {
    const S = (d) => d.replace(/-?\d*\.?\d+/g, (n) => String(+(Number(n) * k).toFixed(2)));
    const W = (w) => Math.max(2, w * k);
    const P = (x, y) => [x * k, y * k];

    return [
        // ---- hips: the root. Short and wide. ----------------------------
        { id: 'hips', parent: null, pivot: [0, 0], z: 10, strokes: [
            s(S('M -82 -16 C -88 14 -84 38 -74 56'), W(7)),
            s(S('M 84 -18 C 92 14 88 40 78 58'), W(7)),
            // the coat hem, which is where his silhouette actually ends
            s(S('M -80 44 C -40 62 36 62 80 46'), W(6)),
        ] },

        // ---- torso: a barrel in a loose coat ----------------------------
        { id: 'torso', parent: 'hips', pivot: [0, 0], z: 12, strokes: [
            // front edge: narrow at the shoulder, bulging hard at the belly
            s(S('M -70 -168 C -92 -120 -106 -62 -96 -8 C -90 24 -84 42 -76 58'), W(7.5)),
            // back edge, fuller still because the sack drags the coat out
            s(S('M 76 -170 C 100 -122 112 -58 104 0 C 100 30 94 46 84 60'), W(7.5)),
            // shoulders, sloping to the arms and lifting at the neck
            s(S('M -70 -168 C -42 -190 30 -192 76 -170'), W(7)),
            // lapels, open over the shirt
            s(S('M -48 -164 C -44 -128 -34 -104 -16 -92'), W(5.5)),
            s(S('M 16 -168 C 12 -132 4 -106 -12 -92'), W(5.5)),
            // the belly. Most of his character is this one curve.
            s(S('M -100 -24 C -58 8 24 6 68 -28'), W(4.5)),
            // a few coat folds, drawn light
            s(S('M -62 -112 C -46 -82 -40 -48 -44 -14'), W(3.2)),
            s(S('M 58 -108 C 70 -74 74 -42 68 -8'), W(3.2)),
            s(S('M -26 -88 C -22 -60 -24 -34 -30 -12'), W(2.8)),
            // a collar standing up behind the beard: without it the shoulders
            // run straight into the head and he has no clothes, just a shape
            s(S('M -52 -160 C -44 -176 -26 -184 -8 -184'), W(5)),
            s(S('M 26 -176 C 36 -172 44 -166 48 -158'), W(5)),
            // the shirt opening under the lapels
            s(S('M -14 -92 C -12 -64 -14 -40 -20 -18'), W(3.4)),
        ] },

        { id: 'neck', parent: 'torso', pivot: P(-6, -168), z: 14, strokes: [
            s(S('M -30 6 C -28 -10 -26 -20 -24 -30'), W(5.5)),
            s(S('M 30 4 C 30 -12 28 -22 26 -32'), W(5.5)),
        ] },

        // ---- head. A group: anything behind the skull must be its sibling
        //      while still turning with it. ------------------------------
        { id: 'head', parent: 'neck', pivot: P(0, -32), z: 20 },

        { id: 'fringe', parent: 'head', pivot: [0, 0], z: 18, strokes: [
            // wiry hair round the back of the skull, in separate tufts
            s(S('M 52 -56 C 72 -50 78 -26 68 -8'), W(5.5)),
            s(S('M 56 -38 C 74 -32 80 -16 72 -2'), W(3.8)),
            s(S('M 48 -68 C 66 -68 76 -56 76 -44'), W(3.8)),
            s(S('M 60 -20 C 74 -14 78 -2 72 8'), W(3.4)),
        ] },

        { id: 'skull', parent: 'head', pivot: [0, 0], z: 20, strokes: [
            // the bald dome. Wide and high: it is half his silhouette.
            s(S('M -58 -40 C -68 -92 -36 -124 4 -124 C 46 -124 64 -94 60 -50'), W(8)),
            // cheek and jaw, running down to where the beard takes over
            s(S('M 60 -50 C 62 -18 56 2 44 10'), W(6)),
        ] },
        { id: 'tuft', parent: 'skull', pivot: P(10, -124), z: 21, strokes: [
            s(S('M 0 0 C 4 -16 12 -24 20 -30'), W(5.5)),
            s(S('M 2 -2 C 10 -12 14 -22 14 -34'), W(4)),
        ] },
        { id: 'ear', parent: 'skull', pivot: P(42, -48), z: 21, strokes: [
            s(S('M 0 0 C 18 -8 28 8 20 24 C 15 32 4 30 2 22'), W(5.5)),
            s(S('M 8 6 C 16 4 19 14 13 19'), W(3.2)),
        ] },
        { id: 'brow', parent: 'skull', pivot: P(-26, -64), z: 22, strokes: [
            // heavy, angled down toward the nose: the whole expression
            s(S('M -28 4 C -12 -16 14 -18 32 -6'), W(9)),
            s(S('M -22 14 C -8 0 12 -2 28 6'), W(5)),
            // the furrows above it. The reference's face is half wrinkles,
            // and without them a caricature of an old man is a bald egg.
            s(S('M -24 -12 C -10 -26 14 -28 30 -18'), W(3.4)),
            s(S('M -18 -24 C -6 -36 14 -38 28 -30'), W(3)),
            s(S('M 2 -4 C 6 -16 6 -26 2 -34'), W(2.8)),
        ] },
        { id: 'eye', parent: 'skull', pivot: P(-20, -46), z: 23, strokes: [
            s(S('M -13 -2 C -5 -11 8 -8 11 0 C 6 6 -5 5 -13 -2'), W(4.5)),
        ] },
        { id: 'pupil', parent: 'eye', pivot: P(-1, -1), z: 24, strokes: [
            s(S('M -4 -3 C 0 -6 4 -3 4 1 C 2 4 -2 3 -4 -3'), W(4)),
        ] },
        { id: 'nose', parent: 'skull', pivot: P(-50, -52), z: 25, strokes: [
            // It has to break the skull's own outline, or it is not a nose,
            // it is a mark on a cheek. Bridge out, hook down, then the bulb.
            s(S('M 14 -18 C -16 -16 -44 2 -48 24'), W(9)),
            // the bulb. It has to be FAT: a thin hook reads as a beak.
            s(S('M -48 24 C -52 48 -30 62 -8 54 C 6 48 12 34 12 20'), W(9)),
            // the nostril, which is what sets the bulb apart from the hook
            s(S('M -34 38 C -22 46 -6 44 2 34'), W(4.5)),
        ] },
        { id: 'moustache', parent: 'skull', pivot: P(-30, 2), z: 24, strokes: [
            s(S('M 10 -14 C -14 -12 -30 0 -26 18'), W(6.5)),
            s(S('M 8 -4 C -10 -2 -20 6 -16 18'), W(4.2)),
        ] },
        { id: 'beard', parent: 'head', pivot: P(0, 10), z: 19, strokes: [
            // It hangs FROM the jaw, it does not sit over the face. Drawn
            // from the cheek down, both sides, open at the top.
            s(S('M -40 -14 C -68 16 -82 62 -64 100'), W(9)),
            s(S('M 50 -6 C 64 36 60 78 38 108'), W(9)),
            // a tufted hem: a smooth arc here reads as a bib, and the
            // reference's single strongest texture is this ragged edge
            s(S('M -64 100 C -56 116 -46 104 -38 118 C -30 130 -20 114 -10 126 '
                + 'C 0 136 10 118 22 126 C 32 132 36 118 38 108'), W(8)),
            // wiry interior, drawn thin so the contour stays dominant
            s(S('M -48 16 C -40 50 -24 80 -2 96'), W(3.6)),
            s(S('M -22 2 C -20 40 -10 74 8 98'), W(3.2)),
            s(S('M 6 -2 C 12 36 12 72 2 104'), W(3.2)),
            s(S('M 28 4 C 36 38 34 74 20 108'), W(3.2)),
            s(S('M -58 50 C -52 74 -40 94 -22 108'), W(2.8)),
        ] },

        // ---- the raised arm, screen left, holding a bottle at eye level --
        // Measured off the reference: the bottle sits about three skull-radii
        // to the LEFT of the head, not in front of the face. The first pass
        // put the hand under his own nose.
        // A coat sleeve is THICK. The first pass set the two contours ~30
        // apart over a 130-long limb, so they merged into one closed almond
        // that read as a leaf rather than an arm.
        { id: 'armL', parent: 'torso', pivot: P(-66, -158), z: 16, strokes: [
            s(S('M -22 -14 C -52 16 -72 50 -76 84'), W(8)),
            s(S('M 34 4 C 14 34 -2 64 -8 94'), W(8)),
            // the cuff, which is where the sleeve ends and the wrist starts
            s(S('M -74 78 C -56 90 -28 94 -10 88'), W(4)),
        ] },
        { id: 'foreL', parent: 'armL', pivot: P(-42, 88), z: 16, strokes: [
            // back UP and OUT: elbow at the waist, hand out past his beard
            s(S('M -30 8 C -56 -32 -72 -84 -72 -130'), W(7.5)),
            s(S('M 28 14 C 4 -24 -12 -76 -16 -126'), W(7.5)),
        ] },
        { id: 'handL', parent: 'foreL', pivot: P(-44, -128), z: 17, strokes: [
            s(S('M -16 10 C -24 -8 -16 -26 2 -28 C 20 -28 30 -14 24 4 C 18 18 -4 22 -16 10'), W(6)),
            // knuckles: three arcs, not fingers
            s(S('M -12 -12 C -2 -22 10 -22 20 -12'), W(4)),
            s(S('M -12 -2 C -2 -12 10 -12 20 -2'), W(4)),
            s(S('M -10 8 C -2 0 8 0 16 8'), W(3.4)),
        ] },
        { id: 'bottle', parent: 'handL', pivot: P(2, -14), z: 18, strokes: [
            s(S('M -18 16 C -20 -16 -18 -44 -13 -60 C -10 -70 -8 -78 -6 -86'), W(5.5)),
            s(S('M 18 16 C 20 -16 18 -44 13 -60 C 10 -70 8 -78 6 -86'), W(5.5)),
            s(S('M -6 -86 C 0 -90 2 -90 6 -86'), W(4.5)),
            s(S('M -16 -16 C -6 -10 8 -10 16 -16'), W(3.4)),
            s(S('M -17 8 C -6 14 8 14 17 8'), W(3.4)),
        ] },

        // ---- the far arm, across the body to the sack strap -------------
        { id: 'armR', parent: 'torso', pivot: P(66, -162), z: 8, strokes: [
            s(S('M -10 -6 C 6 30 12 68 8 100'), W(6.5)),
            s(S('M 32 2 C 42 34 42 70 34 100'), W(6.5)),
        ] },
        { id: 'foreR', parent: 'armR', pivot: P(20, 100), z: 9, strokes: [
            s(S('M -14 4 C -36 20 -58 32 -76 34'), W(6)),
            s(S('M -8 22 C -30 38 -52 50 -70 50'), W(6)),
        ] },
        { id: 'handR', parent: 'foreR', pivot: P(-74, 42), z: 9, strokes: [
            s(S('M 8 -8 C -8 -14 -22 -4 -19 10 C -16 22 -2 24 8 16'), W(5.5)),
        ] },

        // ---- the sack of bottles, over his far shoulder -----------------
        { id: 'sack', parent: 'torso', pivot: P(84, -150), z: 7, strokes: [
            s(S('M -10 -20 C 34 -28 74 -4 80 38 C 86 80 58 116 18 118 C -12 120 -28 102 -30 78'), W(8)),
            // the gathered mouth of the sack
            s(S('M -10 -20 C 2 -38 30 -42 50 -34'), W(5.5)),
            // bottles standing out of it
            // Bottles, not tines: each needs a shoulder and a neck, or three
            // parallel strokes out of a bag read as a fork.
            s(S('M 8 -30 C 6 -48 8 -56 14 -62 C 16 -70 16 -78 15 -84'), W(5)),
            s(S('M 28 -34 C 28 -52 30 -60 36 -66 C 38 -74 38 -82 37 -88'), W(5)),
            s(S('M 30 -34 C 32 -54 36 -62 44 -68 C 48 -74 50 -80 50 -86'), W(5)),
            s(S('M 50 -28 C 54 -46 60 -54 68 -58 C 72 -64 74 -70 74 -76'), W(5)),
            s(S('M 15 -84 C 20 -86 24 -84 25 -80'), W(4)),
            s(S('M 37 -88 C 42 -90 46 -88 47 -84'), W(4)),
            s(S('M 74 -76 C 79 -78 82 -75 82 -70'), W(4)),
        ] },

        // ---- legs: short, under the coat --------------------------------
        ...['L', 'R'].flatMap((side) => {
            const far = side === 'R';
            const w = (x) => W(far ? x * 0.75 : x);
            const z = far ? 6 : 11;
            const dx = far ? 34 : -26;
            return [
                { id: `thigh${side}`, parent: 'hips', pivot: P(dx, 40), z, strokes: [
                    s(S('M -26 6 C -28 24 -26 42 -22 60'), w(7)),
                    s(S('M 24 4 C 24 24 22 42 20 60'), w(7)),
                ] },
                { id: `shin${side}`, parent: `thigh${side}`, pivot: P(-1, 60), z, strokes: [
                    s(S('M -19 0 C -19 20 -17 38 -15 54'), w(6)),
                    s(S('M 19 0 C 19 20 17 38 15 54'), w(6)),
                ] },
                { id: `foot${side}`, parent: `shin${side}`, pivot: P(0, 54), z, strokes: [
                    s(S('M 16 -2 C 19 10 6 20 -22 20 C -34 20 -40 12 -34 2'), w(6)),
                ] },
            ];
        }),
    ];
}
