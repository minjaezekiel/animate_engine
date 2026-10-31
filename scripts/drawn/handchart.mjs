/**
 * A hand CHART: several drawings of one hand, swapped by name.
 *
 * This replaces the rigged-finger hand for anything seen from the back or
 * three-quarters, and the reason is worth writing down because it cost two
 * rebuilds to learn.
 *
 * **A flat rig cannot curl a finger that points at the camera.** Rotating a
 * finger part turns it in the PICTURE plane, so a hand seen from the back
 * curls by sweeping its fingers sideways across the knuckles -- which reads
 * as a spider, not a fist. Curl is foreshortening, and foreshortening is
 * depth, and a cutout has none.
 *
 * Hand-drawn animation has always solved this by drawing the hand again.
 * `anime22.mp4` does exactly that: every grip is its own drawing. So the hand
 * is a swap set of drawings on one node, driven by a discrete `hand` channel,
 * which is the same mechanism as a mouth chart and a head turn.
 *
 * Rigged fingers in `hand.mjs` remain correct for a hand seen from the SIDE,
 * where the curl does happen in the picture plane. Both are right; they are
 * right about different shots.
 */

const s = (path, w, color = 'ink') => ({ path, brush: 'pencil', color, size: w });

/**
 * @param {object} o
 * @param {number} o.size      hand length, wrist to fingertip
 * @param {number} [o.facing=1] 1 puts the thumb on +x
 */
export function handChart({ size = 70, facing = 1 } = {}) {
    const k = size / 70;
    const S = (d) => d.replace(/-?\d*\.?\d+/g, (n) => String(+(Number(n) * k).toFixed(2)));
    const X = (d) => (facing >= 0 ? d
        : d.replace(/-?\d*\.?\d+/g, (n, i, str) => n));   // mirrored below instead
    const W = (w) => Math.max(1.4, w * k);
    const m = (d) => (facing >= 0 ? S(d) : S(mirrorX(d)));

    /** Mirror a path about x = 0 by negating every x coordinate. */
    function mirrorX(d) {
        let i = 0;
        return d.replace(/-?\d*\.?\d+/g, (n) => {
            const v = Number(n);
            return String(i++ % 2 === 0 ? -v : v);
        });
    }

    /**
     * **Draw the SILHOUETTE first, as one continuous closed contour, then put
     * the interior lines inside it.**
     *
     * Three rebuilds were spent drawing a line around each feature -- a curve
     * for the palm, a loop per finger -- and every one of them rendered as a
     * bundle of wire hoops. A hand is one shape with creases in it, not nine
     * shapes in a heap. The outer path below never lifts: wrist, down the
     * little-finger side, round every fingertip and up every valley, out
     * round the thumb, back to the wrist.
     */
    return {
        // --- relaxed, fingers slightly apart, back of the hand -----------
        open: {
            strokes: [
                s(m('M -20 0 C -28 16 -30 34 -29 48 '
                    + 'C -31 62 -30 80 -27 92 C -24 101 -14 101 -13 92 '
                    + 'C -12 80 -13 66 -13 56 '
                    + 'C -12 70 -11 92 -8 106 C -5 116 6 116 6 105 '
                    + 'C 6 90 4 70 3 56 '
                    + 'C 5 72 8 94 12 108 C 16 118 26 116 25 105 '
                    + 'C 24 88 20 68 18 54 '
                    + 'C 21 68 26 86 31 97 C 36 106 45 102 42 92 '
                    + 'C 38 76 33 58 30 44 '
                    + 'C 40 44 54 38 56 26 C 58 12 48 4 36 10 '
                    + 'C 31 12 27 15 25 19 '
                    + 'C 25 10 24 4 22 0 Z'), W(6)),
                // knuckles: short creases inside the silhouette
                s(m('M -24 50 C -20 56 -16 56 -13 52'), W(2.8)),
                s(m('M -9 52 C -4 58 1 58 4 53'), W(2.8)),
                s(m('M 8 50 C 13 56 18 56 20 51'), W(2.8)),
                s(m('M 30 30 C 34 26 40 26 43 30'), W(2.6)),
            ],
        },

        // --- gripping a cylinder. The reference drawing. ------------------
        // Four fingers wrap AWAY from the viewer, so each reads as a short
        // fat hook overlapping the one below. The silhouette is the back of
        // the hand plus the near edge of those hooks.
        grip: {
            strokes: [
                s(m('M -18 -2 C -30 10 -34 28 -33 44 '
                    + 'C -34 58 -32 74 -28 86 C -22 98 -4 100 6 92 '
                    + 'C 16 84 22 70 24 54 '
                    + 'C 36 52 50 44 52 30 C 54 16 44 8 33 13 '
                    + 'C 24 8 22 2 20 -2 Z'), W(6.5)),
                // the four hooks, drawn as creases ACROSS the mass -- each one
                // is where a finger passes behind the next
                s(m('M -32 26 C -22 34 -8 34 0 26'), W(5)),
                s(m('M -33 44 C -22 53 -6 53 4 44'), W(5)),
                s(m('M -31 62 C -21 71 -7 71 3 62'), W(4.6)),
                s(m('M -27 78 C -18 86 -6 86 2 78'), W(4.2)),
                // and the second joint of each, lighter and shorter
                s(m('M -24 31 C -17 36 -8 36 -3 31'), W(2.6)),
                s(m('M -25 49 C -17 55 -8 55 -2 49'), W(2.6)),
                s(m('M -23 67 C -16 72 -8 72 -3 67'), W(2.4)),
                // the thumb's own crease, crossing the front
                s(m('M 28 24 C 35 22 40 27 39 34'), W(3)),
            ],
        },

        // --- pointing: index out, the rest closed ------------------------
        point: {
            strokes: [
                s(m('M -18 -2 C -30 10 -34 28 -33 44 '
                    + 'C -34 56 -31 68 -26 76 '
                    + 'C -24 90 -22 110 -20 124 C -18 135 -8 135 -8 124 '
                    + 'C -8 108 -9 88 -10 74 '
                    + 'C -2 80 10 78 16 70 C 22 62 24 50 24 40 '
                    + 'C 36 38 50 30 52 17 C 54 4 44 -3 33 3 '
                    + 'C 24 2 22 -1 20 -2 Z'), W(6.5)),
                s(m('M -14 112 C -11 116 -8 116 -7 112'), W(2.6)),
                s(m('M -30 52 C -20 60 -4 60 6 52'), W(4.6)),
                s(m('M -28 66 C -19 74 -6 74 2 66'), W(4.2)),
                s(m('M 28 16 C 35 14 40 19 39 26'), W(3)),
            ],
        },

        // --- a closed fist, knuckles toward the viewer -------------------
        fist: {
            strokes: [
                s(m('M -18 -2 C -32 10 -37 30 -36 48 '
                    + 'C -36 68 -26 82 -8 86 C 10 90 26 80 30 62 '
                    + 'C 32 52 31 42 28 34 '
                    + 'C 40 30 52 22 52 9 C 52 -3 42 -9 32 -3 '
                    + 'C 24 0 22 -1 20 -2 Z'), W(6.5)),
                // the knuckle row: four bumps, which is the whole read
                s(m('M -34 44 C -28 36 -20 36 -15 44'), W(4.2)),
                s(m('M -15 44 C -9 35 -1 35 4 44'), W(4.2)),
                s(m('M 4 44 C 10 36 17 36 21 44'), W(4)),
                s(m('M 21 44 C 25 38 30 38 32 44'), W(3.6)),
                // the fingers folded under
                s(m('M -30 60 C -20 68 -4 68 6 60'), W(3.4)),
                s(m('M -26 72 C -17 79 -5 79 2 72'), W(3)),
                s(m('M 30 14 C 37 12 41 17 40 24'), W(3)),
            ],
        },
    };
}

/** The part that carries the chart. `props.hand` names the member. */
export function handChartPart({ side, parent, pivot, size = 70, facing = 1, z = 0,
                                defaultShape = 'open' } = {}) {
    return {
        id: `hand${side}`, parent, pivot, z,
        swap: { hand: { ...handChart({ size, facing }), default: defaultShape } },
    };
}
