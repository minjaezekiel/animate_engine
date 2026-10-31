/**
 * "Madini ya Vito" -- a Swahili field guide to gemstones: how they form and
 * how an ordinary person can look for them.
 *
 * Shared constants for the series. Narration lives in one indexed table per
 * part and the shots quote it by number, the same arrangement
 * `scripts/geology/` uses, so rewriting a line does not mean editing the same
 * sentence in three places.
 *
 * Two things are deliberately different from the geology series:
 *
 * 1. **A different voice.** The geology parts were narrated by
 *    `en_GB-alba-medium`. These are Swahili, which in the Piper catalogue
 *    means `sw_CD-lanfrica-medium` -- a different model entirely, and the
 *    only Swahili one (1 of 119, checked). The three characters are separated
 *    from each other by DELIVERY, via `core/audio/delivery.js`; Nuru is given
 *    a delivery of her own rather than the model default so she does not read
 *    as "the narrator preset" either.
 *
 * 2. **The hook comes before the title.** Measured against the reference
 *    narration, every retained opening front-loads speech and does not pause;
 *    a card in the first two seconds spends the window. See
 *    docs/27-RETENTION.md.
 */
import { FONT, GROUND_Y, PALETTE, SAFE, W } from './diagram.mjs';

export const SERIES = 'Madini ya Vito';
export const TAGLINE = 'jinsi vito vinazaliwa na jinsi ya kuvitafuta';
export const REPO = 'github.com/minjaezekiel/jireX';

/**
 * One colour, one meaning, across all six parts.
 *
 * Gem hues are the real ones: tanzanite is blue-violet, tsavorite green,
 * ruby red, and the "gem" accent is the tanzanite blue because that is the
 * stone the series opens on.
 */
export const VITO_PALETTE = {
    ...PALETTE,
    bg: '#0b1018',
    ink: '#f4f1e8',
    dim: '#93a1b5',
    // the stones
    gem: '#5b7cfa',          // tanzanite, blue-violet
    tanzanite: '#4a63d8',
    violet: '#8a6ad6',
    tsavorite: '#3fbf7f',
    ruby: '#e0344f',
    sapphire: '#2f6fd0',
    garnet: '#b3384f',
    // the ground
    rock: '#5a5347',
    rockDark: '#3a352d',
    soil: '#6b5a44',
    gneiss: '#7d8794',
    graphite: '#2a2f36',
    pegmatite: '#d8cfc0',
    quartz: '#e8e4da',
    // fluids and heat
    water: '#4aa3d8',
    waterDeep: '#1f5d87',
    foam: '#cfe9f7',
    heat: '#e2663c',
    hot: '#f0a03c',
    // structure
    fault: '#e24a6a',
    gold: '#ffc64d',
    // the cast. `derivePalette` only defaults skin/cloth/trouser/hair, so
    // every *Alt* and *Warm* name a character uses has to exist here or the
    // part draws in whatever fill was last set -- silently.
    skin: '#8d5a3b',
    skinAlt: '#6f4529',
    cloth: '#2f7f6a',          // Nuru's field shirt, teal against the blues
    clothAlt: '#c9702f',       // Bakari
    clothWarm: '#8a5a3c',      // Mzee Hamisi
    trouser: '#39404b',
    hair: '#241a14',
    hairGrey: '#9aa0a6',
    eye: '#2b1d14',
    white: '#f6f2e8',
    shoe: '#2a2320',
    teeth: '#f6f2e8',
    mouth: '#4a2420',
    accent: '#ffc64d',
    light: '#fff3cf',
};

export const FIGURE_H = 520;
export const FIGURE_Y = Math.round(GROUND_Y - 274);

/**
 * One Swahili model, three deliveries. Cast by ROLE so the film does not
 * name a model id, and so swapping in a better Swahili voice later is one
 * edit here rather than six films.
 */
export const VOICES = {
    nuru_v: { spec: 'host-sw' },
    bakari_v: { spec: 'young-m-sw' },
    hamisi_v: { spec: 'elder-m-sw' },
};

export const CHARACTERS = {
    /** NURU -- geologist, the guide. Carries the narration. */
    nuru: {
        palette: 'vito',
        voice: 'nuru_v',
        proportions: { height: FIGURE_H },
        generate: {
            build: 'athletic', hands: 'mitten',
            cloth: 'cloth', trouser: 'trouser', hair: 'braids', hairColor: 'hair',
            face: { jaw: 'tapered', eyes: 'round', brow: 'arched', nose: 'broad',
                    lips: 'full', ears: 'round' },
        },
        view: 'threeQuarter',
        poses: {
            stand: { armL: { rot: 0.12 }, armR: { rot: -0.12 },
                     foreL: { rot: 0.18 }, foreR: { rot: -0.18 } },
            present: { armR: { rot: -0.62 }, foreR: { rot: -0.52 }, head: { rot: -0.05 } },
            count: { armR: { rot: -0.85 }, foreR: { rot: -0.9 } },
            kneel: { armR: { rot: -0.95 }, foreR: { rot: -0.55 }, head: { rot: 0.22 } },
        },
    },
    /** BAKARI -- asks the one question the viewer is already thinking. */
    bakari: {
        palette: 'vito',
        voice: 'bakari_v',
        proportions: { height: FIGURE_H * 0.97 },
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
    /** MZEE HAMISI -- an artisanal miner. Experience, not instruction. */
    hamisi: {
        palette: 'vito',
        voice: 'hamisi_v',
        proportions: { height: FIGURE_H * 0.95 },
        generate: {
            build: 'heavy', hands: 'mitten',
            cloth: 'clothWarm', trouser: 'trouser',
            hair: 'short-fade', hairColor: 'hairGrey',
            face: { jaw: 'square', eyes: 'hooded', brow: 'heavy', nose: 'broad',
                    lips: 'medium', ears: 'round' },
        },
        view: 'threeQuarter',
        poses: {
            stand: { armL: { rot: 0.1 }, armR: { rot: -0.1 },
                     foreL: { rot: 0.22 }, foreR: { rot: -0.22 } },
            tell: { armR: { rot: -0.5 }, foreR: { rot: -0.7 }, head: { rot: -0.06 } },
        },
    },
};

/**
 * Narration has to come from a cast member: `buildDialogue` looks the speaker
 * up in the scene's cast to find its voice, and an uncast speaker renders
 * SILENT with only a warning. So every speaker is cast into every scene they
 * talk in -- invisible and behind everything where they are not meant to be
 * seen.
 */
export const offstage = (as, character = as) =>
    ({ character, as, at: [540, FIGURE_Y], scale: 1, alpha: 0, z: -900 });

/** Narration in Nuru's voice, subtitled, with no mouth to animate. */
export const vo = (text, at = 0.2) =>
    ({ speaker: 'nuru', text, at, lipsync: false, subtitle: true });

/** A spoken line, with the mouth. */
export const says = (speaker, text, at = 0.25) =>
    ({ speaker, text, at, lipsync: true, subtitle: true });

/**
 * The subtitle band. Every line is on screen because most viewers watch
 * muted -- the single most consistent finding in the retention sources.
 * Lifted clear of the phone UI rail at 1920 tall.
 */
export const SUBTITLE_STYLE = {
    font: `600 38px ${FONT}`,
    fill: VITO_PALETTE.ink,
    stroke: '#05080d',
    strokeWidth: 7,
    lineHeight: 46,
    maxWidth: SAFE.x1 - SAFE.x0,
    // The key is `bottomMargin`, NOT `y`. `buildSubtitleNode` reads
    // `meta.height - st.bottomMargin` and ignores anything else, so a `y`
    // here is accepted, carried, and silently does nothing.
    // 1920 - 372 = 1548: clear of the phone UI rail.
    bottomMargin: 372,
};

export const META = (title) => ({
    title: `${SERIES} — ${title}`,
    width: W, height: 1920, fps: 24,
    subtitleStyle: SUBTITLE_STYLE,
});

/** The hashtags and the share line, identical on every part. */
export const SHARE = '#MadiniYaVito  #Tanzania  #Vito';
