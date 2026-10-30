/**
 * Shared furniture for the "Finding Gold" series: the cast, the palette, the
 * frame, and the end card every part closes on.
 *
 * Kept apart from the part builders so ten films cannot drift from each other
 * -- one palette, one pair of characters, one title treatment, one credit.
 */
import { FONT, GROUND_Y, H, PALETTE, TYPE, W, build, textPart } from './diagram.mjs';

export const SERIES = 'Finding Gold';
export const TAGLINE = 'a field guide to mineral exploration';
export const REPO = 'github.com/minjaezekiel/jireX';

/**
 * The scene palette. Diagram meanings come from `PALETTE`; the character
 * entries are the names `generate` expects (`skin`, `cloth`, `hair`, ...), so
 * both resolve through the same lookup.
 */
export const GEO_PALETTE = {
    ...PALETTE,
    skin: '#8d5a3b',
    skinAlt: '#6f4529',
    cloth: '#c9702f',          // Zawadi's field vest
    clothAlt: '#3f6f8a',       // Juma's shirt
    trouser: '#4a4f58',
    hair: '#241a14',
    eye: '#2b1d14',
    white: '#f6f2e8',
    shoe: '#2a2320',
    teeth: '#f6f2e8',
    mouth: '#4a2420',
    accent: '#ffc64d',
    light: '#fff3cf',
};

/** One grown character height, so both read at the same scale in every part. */
export const FIGURE_H = 520;
/**
 * The root sits at the hips, and `measureCharacter` puts the soles 274 units
 * below it at this height -- so this is the `at.y` that stands a figure on
 * the ground line instead of hovering or sinking.
 */
export const FIGURE_Y = Math.round(GROUND_Y - 274);

export const VOICES = {
    zawadi_v: { spec: 'tts:en_GB-alba-medium' },
    juma_v: { spec: 'tts:en_GB-alan-medium' },
};

export const CHARACTERS = {
    zawadi: {
        palette: 'geo',
        voice: 'zawadi_v',
        proportions: { height: FIGURE_H },
        generate: {
            build: 'athletic', hands: 'mitten',
            cloth: 'cloth', trouser: 'trouser', hair: 'braids', hairColor: 'hair',
            face: { jaw: 'tapered', eyes: 'round', brow: 'arched', nose: 'broad',
                    lips: 'full', ears: 'round' },
        },
        view: 'threeQuarter',
        poses: {
            // Arms down and relaxed: the rest the engine gives has them
            // straighter than a person stands.
            stand: { armL: { rot: 0.12 }, armR: { rot: -0.12 },
                     foreL: { rot: 0.18 }, foreR: { rot: -0.18 } },
            // Low and open, not a reach: at shoulder height the arm
            // crossed straight through whoever she is talking to.
            present: { armR: { rot: -0.62 }, foreR: { rot: -0.52 },
                       head: { rot: -0.05 } },
            count: { armR: { rot: -0.85 }, foreR: { rot: -0.9 } },
        },
    },
    juma: {
        palette: 'geo',
        voice: 'juma_v',
        proportions: { height: FIGURE_H * 0.98 },
        generate: {
            build: 'slim', hands: 'mitten',
            skin: 'skinAlt', cloth: 'clothAlt', trouser: 'trouser',
            hair: 'short-fade', hairColor: 'hair',
            face: { jaw: 'round', eyes: 'wide', brow: 'flat', nose: 'button',
                    lips: 'medium', ears: 'round' },
        },
        view: 'threeQuarter',
        poses: {
            stand: { armL: { rot: 0.14 }, armR: { rot: -0.14 },
                     foreL: { rot: 0.2 }, foreR: { rot: -0.2 } },
            ask: { armR: { rot: -0.7 }, foreR: { rot: -0.75 }, head: { rot: 0.08 } },
        },
    },
};

/**
 * Narration has to come from a cast member: `buildDialogue` looks the speaker
 * up in the scene's cast to find its voice, and an uncast speaker renders
 * SILENT with only a warning. So the narrator is cast into every scene --
 * invisible and behind everything where she is not meant to be seen.
 */
export const offstage = (as = 'zawadi', character = 'zawadi') =>
    ({ character, as, at: [540, FIGURE_Y], scale: 1, alpha: 0, z: -900 });

/** Narration: Zawadi's voice, subtitled, with no mouth to animate. */
export const vo = (text, at = 0.35) =>
    ({ speaker: 'zawadi', text, at, lipsync: false, subtitle: true });

/** A spoken line, with the mouth. */
export const says = (speaker, text, at = 0.35) =>
    ({ speaker, text, at, lipsync: true, subtitle: true });

/** The subtitle band, lifted clear of the phone UI rail at 1920 tall. */
export const SUBTITLE_STYLE = {
    font: `600 37px ${FONT}`,
    fill: '#f2efe6',
    stroke: '#06090f',
    strokeWidth: 7,
    lineHeight: 47,
    maxWidth: 940,
    // 1920 - 360 = 1560: above the phone UI rail, below everything staged.
    bottomMargin: 360,
};

export const META = (title) => ({
    title: `${SERIES} — ${title}`,
    fps: 24,
    width: W,
    height: H,
    author: 'Ezekiel Minja',
    description: `${SERIES}: ${TAGLINE}. Educational — not a design standard.`,
    subtitleStyle: SUBTITLE_STYLE,
});

/**
 * The closing credit, as parts plus the actions that bring them in. Returned
 * as pieces rather than a whole scene so a part can put its own hook line and
 * backdrop around it, while the credit itself stays identical in all ten.
 */
export function endCard(nextLine) {
    const parts = [
        textPart('next', nextLine, {
            at: [540, 700], font: TYPE.caption, fill: 'gold' }),
        textPart('made', 'Animated with', {
            at: [540, 1000], font: TYPE.label, fill: 'dim' }),
        textPart('name', 'JIREX', {
            at: [540, 1098], font: `800 118px ${FONT}`, fill: 'ink' }),
        textPart('what', 'an open-source browser animation engine', {
            at: [540, 1172], font: TYPE.small, fill: 'dim' }),
        textPart('repo', REPO, {
            at: [540, 1278], font: TYPE.credit, fill: 'gold' }),
        textPart('lic', 'MIT licensed  \u00b7  free to use, fork and build on', {
            at: [540, 1330], font: TYPE.small, fill: 'dim' }),
        textPart('call', 'Add a feature. Send a pull request.', {
            at: [540, 1402], font: TYPE.label, fill: 'ink' }),
    ];
    const ids = parts.map((x) => x.id);
    return {
        parts,
        /** `next` first, then the credit block staggered under it. */
        actions: (target, at = 0.3) => [
            ...build(target, ids.slice(0, 1), at, { gap: 0, span: 0.45 }),
            ...build(target, ids.slice(1), at + 1.6, { gap: 0.16, span: 0.32 }),
        ],
    };
}
