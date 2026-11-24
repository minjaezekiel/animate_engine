/**
 * `digest`, on the 2D path.
 *
 * # Why this is the highest-value thing in the audit
 *
 * `core/script/digest.js` answers "what is on screen" in numbers rather than
 * pixels -- per-subject box, coverage, luma, dominant hue, and every string of
 * on-screen text -- at about 420 tokens for a whole film against about 2,000
 * for one screenshot. It was built for the 3D path in Phase 39 and existed
 * nowhere else, and **fifty of the fifty-one finished films in this repo are
 * 2D**. The cheapest check in the engine was unavailable to almost all of its
 * output.
 *
 * # What had to be new, and what did not
 *
 * Almost nothing. `digest.js` is pure arithmetic over `{ id, visible, box,
 * luma, hue }` rows and does not care how the box was arrived at. 3D projects
 * eight bounds corners through a camera; 2D reads a world matrix and a
 * measured extent, which `staging.js` has done since the first staging check
 * -- the off-frame warning is exactly this box compared against exactly this
 * frame.
 *
 * So this module is the SUBJECT ROWS for a posed 2D scene, and everything
 * downstream -- formatting, the findings, the token budget -- is shared.
 *
 * # Why the scene must already be posed
 *
 * The caller poses it: `resetPose`, `applyPose(samplePose(timeline, t))`,
 * `applySwapSets`. That is the same three lines every 2D renderer and the
 * frame grabber already run, and doing it here as well would either duplicate
 * the baseline or pose the scene twice per frame. A digest is taken *of* a
 * rendered frame, so it reads the state that frame was drawn from.
 */
import { applyToPoint } from '../math/mat2d.js';
import { cameraAt, measureCharacter, FRAMINGS } from './staging.js';
import { characterParts } from './compile.js';

/**
 * Every cast member's screen box at the current pose, in frame fractions.
 *
 * Fractions rather than pixels, because `digest.js` reports coverage as a
 * percentage of frame and a film is rendered at whatever size it is asked
 * for. A box in pixels would mean something different at 1080p and at 480p
 * and the digest of the same instant would not match itself.
 */
export function subjectsAt(compiled, film, t, { trackValueAt, sceneId = null } = {}) {
    const { scene, timeline, meta } = compiled ?? {};
    if (!scene || !timeline || !trackValueAt) return [];

    const frame = cameraAt(timeline, t, meta, trackValueAt);
    const fw = frame.right - frame.left;
    const fh = frame.bottom - frame.top;
    if (!(fw > 0) || !(fh > 0)) return [];

    const alphaOf = new Map();
    for (const { node, alpha } of scene.drawOrder()) alphaOf.set(node.id, alpha);

    const extents = new Map();
    const measureOf = (charName) => {
        if (!extents.has(charName)) {
            extents.set(charName,
                measureCharacter(characterParts(film?.characters?.[charName] ?? {})));
        }
        return extents.get(charName);
    };

    const rows = [];
    for (const node of scene.byId.values()) {
        if (!node.tags?.includes('cast')) continue;
        const charName = node.tags[1];
        const [nodeScene, named] = String(node.id).split('/');
        const as = named ?? node.id;
        /**
         * Only this shot's own scene, when the caller says which.
         *
         * A cast root exists for every scene at once -- `scenes.*.cast` is
         * compiled into one graph -- so a five-scene film reported the same
         * two characters five times, four of them "off". Which is true, and
         * is four rows of noise per sample in a format whose whole purpose
         * is to be cheap to read.
         */
        if (sceneId && nodeScene !== sceneId) continue;
        const m = scene.worldMatrix(node.id);
        if (!m) continue;
        const [wx, wy] = applyToPoint(m, 0, 0);
        const scale = Math.abs(m[0]) || 1;
        const e = measureOf(charName);
        // Scene units -> frame fractions. The camera rect IS the frame, so
        // this is one subtraction and one divide; there is no projection and
        // nothing can go behind anything.
        const box = [
            (wx + e.left * scale - frame.left) / fw,
            (wy + e.top * scale - frame.top) / fh,
            (wx + e.right * scale - frame.left) / fw,
            (wy + e.bottom * scale - frame.top) / fh,
        ];
        rows.push({
            id: as,
            sceneId: nodeScene,
            character: charName,
            // Alpha, not presence. `do: 'hide'` means the audience is not
            // reading that character, and a digest that reported a faded-out
            // figure as on screen and black would be reporting the fade.
            visible: (alphaOf.get(node.id) ?? 0) >= 0.5,
            box,
        });
    }
    return rows;
}

/**
 * Head height as a fraction of the frame, for the subject of a shot.
 *
 * The one measurement 3D's digest has no equivalent of, and the one a 2D
 * film is actually composed by: `FRAMINGS` is defined in heads, not in
 * coverage, because a close-up crops the body and a body-based ratio stops
 * meaning anything exactly where it is needed most.
 *
 * Reported beside the box so an agent reading a digest can tell a close-up
 * from a wide without being told which was intended.
 */
export function headFractionAt(compiled, film, t, charName, { trackValueAt } = {}) {
    const { scene, timeline, meta } = compiled ?? {};
    if (!scene || !timeline || !trackValueAt || !charName) return null;
    const char = film?.characters?.[charName];
    if (!char) return null;
    const frame = cameraAt(timeline, t, meta, trackValueAt);
    const fh = frame.bottom - frame.top;
    if (!(fh > 0)) return null;
    const node = [...scene.byId.values()].find(
        (n) => n.tags?.includes('cast') && n.tags[1] === charName);
    const m = node ? scene.worldMatrix(node.id) : null;
    const scale = m ? Math.abs(m[0]) || 1 : 1;
    const p = char.proportions ?? {};
    const height = p.height ?? 180;
    const ratio = p.headRatio
        ?? (1 / (p.heads ?? (char?.generate?.build === 'child' ? 4.8 : 6.2)));
    return +((height * ratio * scale) / fh).toFixed(4);
}

/** The framing band a head fraction falls in, or null between bands. */
export function framingOf(headFraction) {
    if (headFraction == null) return null;
    for (const [name, band] of Object.entries(FRAMINGS)) {
        if (headFraction >= band.min && headFraction <= band.max) return name;
    }
    return headFraction < FRAMINGS.wide.min ? 'wider than wide' : 'tighter than close';
}
