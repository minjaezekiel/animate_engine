/**
 * A dog DRAWN rather than assembled.
 *
 * Every part is a short run of pencil contours authored in the part's own
 * local space, with the joint at (0,0). The contours deliberately OVERSHOOT
 * their joints: a hand-drawn animal has one continuous line through the
 * shoulder, and a contour that stops exactly at a pivot is how a cutout rig
 * announces itself.
 *
 * The part names are the rig's, so every gait in `core/script/quadruped.js`
 * drives this unchanged.
 */

const INK = 'ink';

/** One pencil contour. `w` is nib width; roughs are drawn with a fat nib. */
const s = (path, w = 7, color = INK) => ({ path, brush: 'pencil', color, size: w });

/**
 * `k` scales the whole animal. Coordinates below are authored at k = 1,
 * which is a dog about 300 units from chest to rump.
 */
export function drawnDogParts({ k = 1 } = {}) {
    const S = (d) => d.replace(/-?\d*\.?\d+/g, (n) => String(+(Number(n) * k).toFixed(2)));
    const W = (w) => Math.max(2, w * k);

    return [
        // ---- barrel. Origin at the withers. -----------------------------
        { id: 'body', parent: null, pivot: [0, 0], z: 10, strokes: [
            // topline: withers -> loin dip -> croup
            s(S('M 62 -14 C 26 -26 -34 -8 -92 -2 C -124 2 -142 -4 -164 14'), W(7)),
            // chest and brisket, carried well past the shoulder joint
            s(S('M 62 -14 C 92 14 86 76 48 108 C 28 124 -4 118 -26 106'), W(7)),
            // belly, tucked hard at the loin
            s(S('M -26 106 C -56 96 -74 74 -96 62'), W(6)),
            // a second, lighter construction line through the ribs
            s(S('M 40 20 C 10 44 -30 56 -74 54'), W(3.5)),
        ] },

        // ---- hindquarters. A real joint: the spine flexes here. ----------
        { id: 'spine', parent: 'body', pivot: [-164 * k, 14 * k], z: 9 },
        { id: 'rump', parent: 'spine', pivot: [0, 0], z: 9, strokes: [
            // haunch mass, overlapping the barrel's croup
            s(S('M 18 -4 C -22 10 -38 62 -22 104'), W(7)),
            s(S('M -22 104 C 2 116 34 108 52 88'), W(6)),
            // the stifle crease, which is what makes a haunch read as muscle
            s(S('M -6 36 C 14 54 22 78 18 96'), W(3.5)),
        ] },

        { id: 'tail', parent: 'rump', pivot: [-14 * k, 6 * k], z: 8, strokes: [
            s(S('M 6 8 C -22 -26 -40 -66 -36 -104'), W(6)),
            s(S('M 6 8 C -10 -24 -26 -62 -22 -100'), W(4)),
        ] },
        { id: 'tailTip', parent: 'tail', pivot: [-36 * k, -104 * k], z: 8, strokes: [
            s(S('M 0 0 C 4 -26 16 -42 32 -50'), W(5)),
        ] },

        // ---- neck and head ----------------------------------------------
        { id: 'neck', parent: 'body', pivot: [52 * k, -10 * k], z: 9, strokes: [
            // crest, running up out of the withers
            s(S('M -16 10 C 6 -28 34 -58 62 -74'), W(7)),
            // throat, a longer sweep from the brisket
            s(S('M 14 42 C 26 10 40 -14 58 -34'), W(6)),
        ] },

        { id: 'head', parent: 'neck', pivot: [62 * k, -74 * k], z: 20 },
        { id: 'skull', parent: 'head', pivot: [0, 0], z: 20, strokes: [
            // brow and cheek
            s(S('M -22 16 C -26 -14 -8 -34 20 -34 C 40 -34 52 -22 54 -6'), W(6.5)),
            s(S('M -22 16 C -14 30 2 38 22 34'), W(5.5)),
        ] },
        { id: 'muzzle', parent: 'head', pivot: [30 * k, -8 * k], z: 21, strokes: [
            // bridge of the snout
            s(S('M -8 -22 C 18 -28 44 -26 62 -16'), W(5.5)),
            // lower jaw line and chin
            s(S('M -4 14 C 20 18 44 10 60 -4'), W(5)),
            s(S('M 62 -16 C 70 -10 70 -6 60 -4'), W(4.5)),
        ] },
        { id: 'nose', parent: 'muzzle', pivot: [60 * k, -12 * k], z: 22, strokes: [
            s(S('M -8 -4 C 0 -12 10 -10 12 0 C 12 8 2 10 -6 6'), W(5)),
        ] },
        { id: 'eye', parent: 'skull', pivot: [16 * k, -12 * k], z: 23, strokes: [
            s(S('M -9 0 C -6 -8 4 -9 8 -2 C 8 5 -2 8 -9 0'), W(3.5)),
        ] },
        { id: 'earNear', parent: 'head', pivot: [8 * k, -30 * k], z: 25, strokes: [
            s(S('M 0 4 C -10 -24 -6 -52 10 -62 C 20 -46 22 -20 14 2'), W(6)),
        ] },
        { id: 'earFar', parent: 'head', pivot: [-14 * k, -26 * k], z: 18, strokes: [
            s(S('M 0 4 C -12 -18 -10 -42 2 -52 C 12 -38 14 -16 10 2'), W(5)),
        ] },
        { id: 'jaw', parent: 'head', pivot: [24 * k, 10 * k], z: 19, strokes: [
            s(S('M -6 0 C 16 10 38 8 54 -2'), W(5)),
        ] },

        // ---- legs --------------------------------------------------------
        ...['L', 'R'].flatMap((side) => {
            // The far pair is offset and drawn with a lighter nib. Without a
            // real offset the two pairs sit on top of each other and the walk
            // reads as a two-legged animal with thick legs.
            const far = side === 'L';
            const w = (x) => W(far ? x * 0.62 : x);
            const z = far ? 6 : 15;
            const dx = far ? -26 * k : 6 * k;
            const dy = far ? -4 * k : 0;
            return [
                { id: `foreUpper${side}`, parent: 'body', pivot: [40 * k + dx, 58 * k + dy], z, strokes: [
                    s(S('M -16 -18 C -10 14 -6 44 -4 70'), w(6.5)),
                    s(S('M 16 -10 C 16 18 14 46 10 70'), w(6.5)),
                ] },
                { id: `foreLower${side}`, parent: `foreUpper${side}`, pivot: [3 * k, 70 * k], z, strokes: [
                    s(S('M -8 -6 C -8 20 -8 46 -6 66'), w(5.5)),
                    s(S('M 8 -6 C 9 20 8 46 6 66'), w(5.5)),
                ] },
                { id: `forePastern${side}`, parent: `foreLower${side}`, pivot: [0, 66 * k], z, strokes: [
                    s(S('M -6 -4 C -6 10 -5 20 -4 28'), w(5)),
                    s(S('M 6 -4 C 6 10 5 20 4 28'), w(5)),
                ] },
                { id: `forePaw${side}`, parent: `forePastern${side}`, pivot: [0, 28 * k], z, strokes: [
                    s(S('M -6 -2 C -8 8 0 14 12 12 C 18 10 18 2 14 -4'), w(5)),
                ] },

                // The stifle drives BACK and the hock returns forward: a dog
                // stands on a zig-zag, not on a post, and that angle is most
                // of the hind-leg silhouette.
                { id: `thigh${side}`, parent: 'rump', pivot: [-4 * k + dx * 0.7, 70 * k + dy], z, strokes: [
                    s(S('M -22 -24 C -30 2 -30 28 -24 48'), w(7)),
                    s(S('M 20 -16 C 12 10 2 32 -6 48'), w(6.5)),
                ] },
                { id: `shank${side}`, parent: `thigh${side}`, pivot: [-15 * k, 48 * k], z, strokes: [
                    s(S('M -8 -6 C -2 14 6 34 12 52'), w(5.5)),
                    s(S('M 10 -8 C 16 12 22 32 26 50'), w(5.5)),
                ] },
                { id: `hock${side}`, parent: `shank${side}`, pivot: [19 * k, 51 * k], z, strokes: [
                    s(S('M -6 -4 C -6 12 -5 28 -4 42'), w(5)),
                    s(S('M 6 -4 C 6 12 5 28 4 42'), w(5)),
                ] },
                { id: `hindPaw${side}`, parent: `hock${side}`, pivot: [0, 42 * k], z, strokes: [
                    s(S('M -6 -2 C -8 8 0 14 12 12 C 18 10 18 2 14 -4'), w(5)),
                ] },
            ];
        }),
    ];
}
