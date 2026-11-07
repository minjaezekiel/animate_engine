/**
 * "Reading the Rock" / "Kusoma Mwamba" -- a bilingual field series on
 * STRUCTURE: joints, folds, faults and shear zones, and why structure decides
 * where minerals sit.
 *
 * Shared furniture for all six parts, in both languages. Kept apart from the
 * part builders so twelve films cannot drift from each other -- one palette,
 * one cast, one title treatment, one end card.
 *
 * ## Two things that are different from the earlier series
 *
 * 1. **Every part is built twice**, once per language, from ONE builder. A
 *    part exports `partN(lang)` and reads its narration out of a `{en, sw}`
 *    table, so the staging is authored once and cannot drift between the dub
 *    and the original. Durations still differ per language, because
 *    `fitShots` derives them from the narration it is actually carrying --
 *    Swahili and English do not take the same time to say the same thing.
 *
 * 2. **The voices are VoiceStudio, not Piper.** `docs/29-VOICE-STUDIO.md`.
 *    Piper has exactly one Swahili model, which is why `delivery.js` had to
 *    fake a cast out of rate and pitch. Real cloned voices make that
 *    unnecessary, so nothing here carries a `rate`/`pitch` delivery: the
 *    voices are already different people.
 */
import { FONT, GROUND_Y, PALETTE, SAFE, W } from './diagram.mjs';

export const LANGS = ['en', 'sw'];

export const SERIES = {
    en: 'Reading the Rock',
    sw: 'Kusoma Mwamba',
};

export const TAGLINE = {
    en: 'structure is where the minerals are',
    sw: 'muundo wa mwamba ndio unaoonyesha madini',
};

export const REPO = 'github.com/minjaezekiel/jireX';

/** The engine advert, in as many words, at the end of every part. */
export const ENGINE_AD = {
    en: 'Animated with Jirex — the free, open-source animation engine',
    sw: 'Imeundwa na Jirex — injini huria ya uhuishaji, bure kabisa',
};

/** Follow / share. The platforms want to be told, so the film tells them. */
export const CTA = {
    en: 'Follow for the rest of the series  ·  Share this with a prospector',
    sw: 'Fuatilia upate sehemu zote  ·  Msambazie mtafutaji madini',
};

export const SHARE = {
    en: '#ReadingTheRock  #Geology  #Minerals  #Tanzania',
    sw: '#KusomaMwamba  #Jiolojia  #Madini  #Tanzania',
};

/** The pinned banner, top of frame, present for the whole part. The one
 *  device lifted straight from the references: `anime6` keeps a caption
 *  pinned from frame 1 to the end card and never moves it. */
export const BANNER = {
    en: (n) => `Where minerals hide  ·  Part ${n} of 6`,
    sw: (n) => `Madini yanajificha wapi  ·  Sehemu ${n} ya 6`,
};

/**
 * One colour, one meaning, across all six parts and both languages.
 *
 * The four structures get four accents and never swap: a viewer who has
 * watched part one should read "red" as "fault" in part six without being
 * told again. That is the entire reason this table is shared.
 */
export const STRUCT_PALETTE = {
    ...PALETTE,
    bg: '#0a0f14',
    ink: '#f2efe6',
    dim: '#8fa0b0',

    // --- the four structures, one colour each --------------------------
    joint: '#5ec8e8',        // part 1 — cool blue, a clean dry crack
    fold: '#ffb23d',         // part 2 — amber, warm and bent
    fault: '#e2485f',        // part 3 — red, something broke and moved
    shear: '#b06ae0',        // part 4 — violet, smeared and ductile

    // --- the rocks -----------------------------------------------------
    rock: '#5a5347',
    rockDark: '#352f27',
    rockPale: '#8a8172',
    soil: '#6b5a44',
    bed: '#7a6c55',
    bedAlt: '#9a8a6d',
    granite: '#c4b8a4',
    basalt: '#2e3339',
    bif: '#4a4a52',          // banded iron formation
    schist: '#6d7684',
    mylonite: '#7a6a86',

    // --- what fills the space ------------------------------------------
    quartz: '#ece8dd',
    calcite: '#dfe6e8',
    carbonate: '#d8b98a',    // ankerite: the buff weathering that gives it away
    gold: '#ffc64d',
    pyrite: '#d4b33c',
    galena: '#9aa4ad',
    chalco: '#c98f2e',
    malachite: '#2fae6e',
    azurite: '#2f6fd0',
    fuchsite: '#4fbf86',
    gossan: '#a4522c',       // iron-stained cap: the thing you see from afar
    sericite: '#cfc6b2',

    // --- fluid and heat --------------------------------------------------
    fluid: '#48b6d8',
    heat: '#e2663c',
    hot: '#f0a03c',

    // --- the cast. `derivePalette` only defaults skin/cloth/trouser/hair,
    // so every *Alt* name a character uses must exist here or the part draws
    // in whatever fill was last set -- silently.
    skin: '#8d5a3b',
    skinAlt: '#6f4529',
    skinWarm: '#a06a44',
    cloth: '#2f7f8a',        // Asha's field shirt, teal against the rock browns
    clothAlt: '#c9702f',     // Kitwana
    clothWarm: '#7a5a3c',    // Mzee Rajabu
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
/**
 * The root sits at the hips and `measureCharacter` puts the soles 274 units
 * below it at this height -- so this is the `at.y` that stands a figure ON
 * the ground line instead of hovering or sinking.
 */
export const FIGURE_Y = Math.round(GROUND_Y - 274);

/**
 * The cast, as VoiceStudio voice ids.
 *
 * These are CLONED / recorded human voices living in the user's own local
 * VoiceStudio (docs/29-VOICE-STUDIO.md), so the ids are per-install and
 * cannot be guessed from here. Everything is in this one table: recasting
 * twelve films is six edits, or six environment variables.
 *
 *   npm run voice-studio                      # list what your studio has
 *   SAY="Habari" VOICE=<id> npm run voice-studio   # hear one before casting
 *
 * Consent is not optional: clone your own voice, or one whose owner agreed.
 */
const vsid = (slot, fallback) => process.env[slot] ?? fallback;

export const VOICE_IDS = {
    en: {
        asha:    vsid('VS_ASHA_EN', 'asha-en'),
        kitwana: vsid('VS_KITWANA_EN', 'kitwana-en'),
        rajabu:  vsid('VS_RAJABU_EN', 'rajabu-en'),
    },
    sw: {
        asha:    vsid('VS_ASHA_SW', 'asha-sw'),
        kitwana: vsid('VS_KITWANA_SW', 'kitwana-sw'),
        rajabu:  vsid('VS_RAJABU_SW', 'rajabu-sw'),
    },
};

/**
 * Which voice backend the films are cast against.
 *
 *   VOICE_BACKEND=piper        the bundled Piper/VITS catalogue (default)
 *   VOICE_BACKEND=voicestudio  a locally-running VoiceStudio, cloned voices
 *
 * Both are supported and the choice is ONE environment variable, because the
 * cast is by role either way -- nothing downstream of this file knows which
 * engine is speaking.
 */
export const VOICE_BACKEND = process.env.VOICE_BACKEND ?? 'piper';

/**
 * The Piper casting, by role.
 *
 * English gets three genuinely different models. Swahili cannot: the Piper
 * catalogue has exactly ONE Swahili voice (1 of 119, checked against its own
 * path map), so the three characters share it and are separated by DELIVERY
 * -- rate and pitch, via `core/audio/delivery.js`. That is a workaround and
 * `26-DELIVERY.md` is honest about being one; it is also the whole reason
 * `VOICE_BACKEND=voicestudio` exists.
 *
 * Asha is cast on `authority-sw` rather than `host-sw` so she does not read
 * as the same person as Nuru, who carries "Madini ya Vito".
 */
const PIPER = {
    en: { asha: 'narrator-f-en', kitwana: 'narrator-m-en', rajabu: 'elder-m-en' },
    sw: { asha: 'authority-sw', kitwana: 'young-m-sw', rajabu: 'elder-m-sw' },
};

/**
 * The delivery each Piper preset carries, so `fitShots` can estimate a line
 * at the rate it will ACTUALLY be spoken. A rate of 0.86 makes a line 16%
 * longer; ignoring it under-sizes every one of Mzee Rajabu's shots.
 *
 * Mirrors `VOICE_PRESETS` in `src/core/voice/catalog.js`. Kept here rather
 * than imported because this file is a build-time script and the catalogue is
 * engine source; the one number that matters is asserted by the render, which
 * re-fits to the real audio anyway.
 */
export const PIPER_RATES = {
    'narrator-f-en': 1, 'narrator-m-en': 1, 'elder-m-en': 1,
    'authority-sw': 0.94, 'young-m-sw': 1.10, 'elder-m-sw': 0.86,
};

/** The rate a character will be spoken at, for the chosen backend. */
export const rateOf = (lang, who) =>
    (VOICE_BACKEND === 'piper' ? PIPER_RATES[PIPER[lang][who]] : 1) ?? 1;

/**
 * Film `voices` block for a language.
 *
 * `lang` is DECLARED, not inferred. `langOfSpec` can only read a language out
 * of a Piper model id, so a film voiced by VoiceStudio carries none and every
 * pacing estimate silently falls back to the English word rate -- which for
 * the Swahili half of this series means being measured in the wrong units.
 * Declaring it costs nothing and is correct for both backends.
 */
export const voicesFor = (lang) => {
    const tag = lang === 'sw' ? 'sw-TZ' : 'en-GB';
    const make = (who) => (VOICE_BACKEND === 'voicestudio'
        ? { spec: `voicestudio:${VOICE_IDS[lang][who]}`, lang: tag }
        // A preset name, not a model id: `resolveVoices` expands it and
        // carries its rate/pitch across, so the cast stays by ROLE.
        : { spec: PIPER[lang][who], lang: tag });
    return {
        asha_v: make('asha'),
        kitwana_v: make('kitwana'),
        rajabu_v: make('rajabu'),
    };
};

export const CHARACTERS = {
    /** DR ASHA — structural geologist. Carries the narration. */
    asha: {
        palette: 'struct',
        voice: 'asha_v',
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
            // Low, open and COMPACT. The forearm is a child of the arm, so
            // the two rotations compound: -0.62 and -0.52 put the forearm
            // about 65 degrees off vertical, which at two-shot spacing
            // reaches straight through whoever she is talking to. Keeping
            // the forearm near the body is what makes it a gesture rather
            // than a point.
            present: { armR: { rot: -0.52 }, foreR: { rot: -0.20 }, head: { rot: -0.05 } },
            count: { armR: { rot: -0.72 }, foreR: { rot: -0.42 } },
            // The one big reach, and it is for SOLO shots at a diagram --
            // there is nobody beside her to cross.
            point: { armR: { rot: -1.05 }, foreR: { rot: -0.25 }, head: { rot: -0.12 } },
            kneel: { armR: { rot: -0.95 }, foreR: { rot: -0.55 }, head: { rot: 0.22 } },
        },
    },
    /** KITWANA — young prospector. Asks what the viewer is already thinking. */
    kitwana: {
        palette: 'struct',
        voice: 'kitwana_v',
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
            ask: { armR: { rot: -0.55 }, foreR: { rot: -0.32 }, head: { rot: 0.08 } },
            scratch: { armR: { rot: -1.25 }, foreR: { rot: -1.5 }, head: { rot: 0.14 } },
        },
    },
    /** MZEE RAJABU — licensed artisanal miner. Experience, not instruction. */
    rajabu: {
        palette: 'struct',
        voice: 'rajabu_v',
        proportions: { height: FIGURE_H * 0.95 },
        generate: {
            build: 'heavy', hands: 'mitten',
            skin: 'skinWarm', cloth: 'clothWarm', trouser: 'trouser',
            hair: 'short-fade', hairColor: 'hairGrey',
            face: { jaw: 'square', eyes: 'hooded', brow: 'heavy', nose: 'broad',
                    lips: 'medium', ears: 'round' },
        },
        view: 'threeQuarter',
        poses: {
            stand: { armL: { rot: 0.1 }, armR: { rot: -0.1 },
                     foreL: { rot: 0.22 }, foreR: { rot: -0.22 } },
            tell: { armR: { rot: -0.42 }, foreR: { rot: -0.38 }, head: { rot: -0.06 } },
            warn: { armR: { rot: -0.78 }, foreR: { rot: -0.55 }, head: { rot: -0.1 } },
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

/** Narration in Asha's voice, subtitled, with no mouth to animate. */
export const vo = (text, at = 0.2) =>
    ({ speaker: 'asha', text, at, lipsync: false, subtitle: true });

/** A spoken line, with the mouth. */
export const says = (speaker, text, at = 0.25) =>
    ({ speaker, text, at, lipsync: true, subtitle: true });

/**
 * The subtitle band. Every line is on screen because most viewers watch
 * muted -- the single most consistent finding in the retention sources.
 *
 * The key is `bottomMargin`, NOT `y`. `buildSubtitleNode` reads
 * `meta.height - st.bottomMargin` and ignores anything else, so a `y` here is
 * accepted, carried, and silently does nothing.
 * 1920 - 372 = 1548: clear of the phone UI rail.
 */
export const SUBTITLE_STYLE = {
    font: `600 38px ${FONT}`,
    fill: STRUCT_PALETTE.ink,
    stroke: '#04070a',
    strokeWidth: 7,
    lineHeight: 46,
    maxWidth: SAFE.x1 - SAFE.x0,
    bottomMargin: 372,
};

export const META = (lang, title) => ({
    title: `${SERIES[lang]} — ${title}`,
    width: W, height: 1920, fps: 24,
    subtitleStyle: SUBTITLE_STYLE,
});
