/**
 * "XMS" -- a commercial, in English and Swahili. 1080x1920, for phone feeds.
 *
 * Shared furniture: the brand palette, the cast, the voices, the banner and
 * the end card. Kept apart from the film builder so the two language cuts
 * cannot drift from each other -- one palette, one cast, one treatment.
 *
 * ## What this advert is allowed to claim
 *
 * Read `projects/2026-2027/xms/README.md` before changing a single line of
 * narration. The product's own documentation is blunt about it: the
 * over-the-air format is a Hill cipher, which is **obfuscation, not
 * encryption**, and `ROADMAP.md` lists "No 'unhackable' / 'military-grade'
 * marketing" as an explicit non-goal.
 *
 * So this film sells the thing XMS actually is, which is also the stronger
 * story: **a messenger that needs no internet, no account and no server.**
 * The privacy it does claim is the privacy it really has -- the message
 * history and the tap-to-hide lock are sealed under a device-local Android
 * Keystore AES-256-GCM key, screenshots are blocked by FLAG_SECURE, and
 * nothing can be copied out of a bubble. All on-device, all real.
 *
 * One scene is given to what it does NOT do (the carrier still sees who you
 * text and when), because the product says so on its own front page and an
 * advert that contradicts the README is a liability, not a campaign.
 *
 * Nothing here describes how any of it is implemented. No cipher, no key
 * handling, no segment header, no reassembly. A competitor watching this
 * learns what the app is for and nothing about how to rebuild it.
 */
import { FONT, PALETTE, SAFE, W } from './diagram.mjs';

export const APP = 'XMS';
export const LANGS = ['en', 'sw'];

/**
 * Where to get it. The live Google Play listing, given by the owner.
 *
 * Both halves are on the end card: `STORE` is the line a viewer READS and
 * remembers, `DOWNLOAD` is the address they can type or pause on. At 26px the
 * full URL measures about 800 of the 960 usable pixels, so it fits on one
 * line -- which matters, because a wrapped URL is a URL nobody types.
 */
export const STORE = { en: 'Get it on Google Play', sw: 'Ipate kwenye Google Play' };
export const DOWNLOAD = process.env.XMS_DOWNLOAD
    ?? 'https://play.google.com/store/apps/details?id=com.xms.xms';

export const TAGLINE = {
    en: 'messages that do not need the internet',
    sw: 'ujumbe usiohitaji intaneti',
};

/** The pinned banner: up from frame one, never moving. */
/**
 * The pinned banner: up from frame one, never moving.
 *
 * Phrased as "no bundle needed", NOT "no internet, ever". XMS does not need
 * data to send a message and that will stay true, but the roadmap has media
 * arriving over a data channel later -- so an advert built on "it can never
 * go online" would age into a lie. Every claim in this film is written to
 * survive that release.
 */
export const BANNER = {
    en: 'No bundle needed. Your message still goes.',
    sw: 'Hakuna bando? Ujumbe wako unaenda.',
};

export const CTA = {
    en: 'Install it  ·  Send it to the person you text most',
    sw: 'Isakinishe  ·  Mtumie yule unayemtumia ujumbe zaidi',
};

export const SIGNOFF = {
    en: 'Your message goes. Bundle or no bundle.',
    sw: 'Ujumbe wako unaenda. Bando au bila bando.',
};

/**
 * The palette, taken from the app rather than invented.
 *
 * Every colour below with an `xms_` note is lifted verbatim from
 * `app/src/main/res/values-night/colors.xml` and `values/colors.xml`, because
 * a mock-up in colours the app does not use teaches a viewer the wrong
 * product. The first pass of this film used a bright `#4a8ff0`, which is
 * precisely the mistake the app's own palette file records fixing: "A calm,
 * low-saturation blue primary -- kept muted in direct response to the old
 * app's 'colors way too bright' problem."
 *
 * The film shows the DARK theme, so the dark values win: primary `#90CAF9`,
 * outgoing bubble `#1E4B7E`, incoming `#2A2F33`.
 */
export const XMS_PALETTE = {
    ...PALETTE,

    // --- the poster around the phone (film furniture, not app colours) ---
    bg: '#070c14',
    panel: '#121a26',
    panelHi: '#16243a',
    ink: '#f2f6fb',
    dim: '#8ba0bb',
    faint: '#44546b',

    // --- the app, dark theme -------------------------------------------
    blue: '#90CAF9',          // xms_primary (night)
    blueDeep: '#1E4B7E',      // xms_primary_container (night)
    blueLight: '#1565C0',     // xms_primary (day), for the light-theme beat
    surface: '#1C1E22',       // M3 dark surface: toolbar and input bar
    screen: '#121418',        // M3 dark background: the message list
    outline: '#2F3338',
    sent: '#1E4B7E',          // xms_bubble_outgoing (night)
    sentInk: '#FFFFFF',       // xms_bubble_outgoing_text
    recv: '#2A2F33',          // xms_bubble_incoming (night)
    recvInk: '#E3E3E3',       // xms_bubble_incoming_text
    system: '#B0B4B8',        // xms_system_text (night)
    fail: '#B3261E',          // xms_bubble_error
    failInk: '#FFFFFF',

    // Avatar colours, from the app's `avatar_colors` array. They are picked
    // deterministically per contact, so the same person keeps one colour --
    // which is why the film gives Juma and Mama different ones and never
    // swaps them.
    av1: '#1565C0', av2: '#00838F', av3: '#2E7D32', av7: '#EF6C00',

    // --- the film's own accents ----------------------------------------
    good: '#2fae6e',
    lock: '#90CAF9',
    gold: '#ffc64d',          // the ask, and nothing else
    light: '#fff3cf',
};

/** Where a character's hips sit for a talking two-shot at scale 1.42. */
export const TALK_SCALE = 1.42;

export const CHARACTERS = {
    /**
     * THE HOST -- the narrator, who is never seen.
     *
     * A character of her own rather than a second cast member over Neema,
     * because `buildDialogue` finds a speaker's voice through the CHARACTER
     * it was cast from. Casting the narration as another instance of Neema
     * would have given the whole film Neema's voice, and the only symptom
     * would have been that the advert sounded like a girl reading it.
     */
    host: {
        palette: 'xms',
        voice: 'host_v',
        proportions: { height: 520 },
        generate: { build: 'average', hands: 'mitten', face: { jaw: 'round' } },
    },
    /**
     * NEEMA -- the person this is happening to.
     *
     * ## Why the two characters' numbers look so deliberate
     *
     * A generated cast reads as one family of clones unless it is told not
     * to, and `proportions` is where that is said. Three dials do the work,
     * and all three are set differently for these two on purpose:
     *
     *   `heads`   total height in HEAD-HEIGHTS (default 6.2). This is the
     *             stylisation dial: a lower number is a bigger head on a
     *             shorter body, which is what makes a figure read younger or
     *             more cartooned. Neema is 6.5, Juma 5.8 -- a visibly
     *             smaller head on a visibly taller frame.
     *   `height`  head-to-foot in scene units. Separate from `heads`, so two
     *             characters can be the same height with different head
     *             sizes, or the same proportion at different heights.
     *   `build`   slim / average / heavy / athletic / child, each a set of
     *             shoulder, hip, arm and leg widths -- and any of those can
     *             be overridden on its own.
     *
     * The face kit does the rest, and the JAW carries the most identity: two
     * characters with different jaws read as different people even at the
     * back of a wide shot, while two with the same jaw and different eyes do
     * not. So these two share no face slot at all.
     */
    neema: {
        palette: 'xms',
        voice: 'neema_v',
        // Tall, long-limbed, small head: an adult who carries the story.
        proportions: { height: 548, heads: 6.5 },
        generate: {
            build: 'average', hands: 'mitten',
            skin: 'skin', cloth: 'cloth', trouser: 'trouser',
            hair: 'braids', hairColor: 'hair',
            face: { jaw: 'tapered', eyes: 'round', brow: 'arched', nose: 'broad',
                    lips: 'full', ears: 'round' },
        },
        view: 'threeQuarter',
        poses: {
            stand: { armL: { rot: 0.12 }, armR: { rot: -0.12 },
                     foreL: { rot: 0.18 }, foreR: { rot: -0.18 } },
            // Holding a phone up and looking at it. The forearm is a child of
            // the arm and the two rotations compound, so both stay modest --
            // ../../docs/completed_phases/30-STRUCTURE-SERIES.md documents what a big reach does in a
            // two-shot.
            hold: { armR: { rot: -0.72 }, foreR: { rot: -0.62 }, head: { rot: 0.14 } },
            sag: { armR: { rot: -0.18 }, foreR: { rot: -0.1 }, head: { rot: 0.26 } },
            relief: { armR: { rot: -0.58 }, foreR: { rot: -0.34 }, head: { rot: -0.08 } },
        },
    },
    /**
     * JUMA -- the other end.
     *
     * Shorter, squarer and bigger-headed than Neema: 5.8 heads at 492 units
     * against her 6.5 at 548, a heavy build against her average, and not one
     * shared face slot. See the note on her for what each dial does.
     */
    juma: {
        palette: 'xms',
        voice: 'juma_v',
        proportions: { height: 492, heads: 5.8 },
        generate: {
            build: 'heavy', hands: 'mitten',
            skin: 'skinAlt', cloth: 'clothAlt', trouser: 'trouser',
            hair: 'short-fade', hairColor: 'hair',
            face: { jaw: 'square', eyes: 'narrow', brow: 'heavy', nose: 'straight',
                    lips: 'thin', ears: 'small' },
        },
        view: 'threeQuarter',
        poses: {
            stand: { armL: { rot: 0.14 }, armR: { rot: -0.14 },
                     foreL: { rot: 0.2 }, foreR: { rot: -0.2 } },
            hold: { armR: { rot: -0.7 }, foreR: { rot: -0.6 }, head: { rot: 0.12 } },
        },
    },
};

/* The character palette keys. `derivePalette` only defaults a handful, so
 * every *Alt* name used above has to exist or the part draws in whatever fill
 * was last set -- silently. */
Object.assign(XMS_PALETTE, {
    skin: '#8d5a3b',
    skinAlt: '#6f4529',
    cloth: '#2f7f8a',
    clothAlt: '#c9702f',
    trouser: '#39404b',
    hair: '#241a14',
    eye: '#2b1d14',
    white: '#f6f2e8',
    shoe: '#2a2320',
    teeth: '#f6f2e8',
    mouth: '#4a2420',
    accent: '#4a8ff0',
});

/**
 * Which voice backend the film is cast against.
 *
 *   VOICE_BACKEND=piper        the bundled Piper/VITS catalogue (default)
 *   VOICE_BACKEND=voicestudio  a locally-running VoiceStudio, cloned voices
 *
 * For a COMMERCIAL, voicestudio is the one to use if it is available: a
 * synthesised read is recognisably synthetic and an advert is the one place
 * that costs you the sale. Piper is the default so the film builds and
 * renders with no setup at all.
 */
export const VOICE_BACKEND = process.env.VOICE_BACKEND ?? 'piper';

const vsid = (slot, fallback) => process.env[slot] ?? fallback;

export const VOICE_IDS = {
    en: {
        host:  vsid('VS_HOST_EN', 'host-en'),
        neema: vsid('VS_NEEMA_EN', 'neema-en'),
        juma:  vsid('VS_JUMA_EN', 'juma-en'),
    },
    sw: {
        host:  vsid('VS_HOST_SW', 'host-sw'),
        neema: vsid('VS_NEEMA_SW', 'neema-sw'),
        juma:  vsid('VS_JUMA_SW', 'juma-sw'),
    },
};

/**
 * The Piper casting, by role.
 *
 * ## Only cast what is VENDORED
 *
 * `src/core/voice/catalog.js` lists sixteen presets; `vendor/piper-voices/`
 * holds five models. A preset whose `.onnx` is not vendored does not fall
 * back and does not fail -- vits-web tries to fetch it inside a fresh
 * headless Chrome profile, the fetch does not land, and **the line renders
 * silent with exit code 0**.
 *
 * That is how the first English cut shipped with no narration at all. It was
 * cast on `bright-f-en` (en_GB-cori-high) and `young-f-en`
 * (en_GB-jenny_dioco-medium), neither of them vendored, so 25 of 26 lines
 * were silence and the only audio in two minutes was Juma's single line on
 * `narrator-m-en`. Nothing reported it: `check-film` passed, the render
 * reported success, and the file carried a valid AAC track made entirely of
 * 6-byte silent frames. `scripts/check-film.mjs` now refuses to let that
 * happen twice.
 *
 * Vendored today (`ls vendor/piper-voices`):
 *
 *   en_GB-alba-medium                  female   <- narrator-f-en
 *   en_GB-alan-medium                  male     <- narrator-m-en
 *   en_GB-northern_english_male-medium male     <- elder-m-en
 *   en_US-hfc_male-medium              male     <- warm-m-us
 *   sw_CD-lanfrica-medium              all SW presets
 *
 * So English has exactly ONE female model, and the host and Neema share it.
 * Her single line is first-person over her own message, so it reads as a
 * quote rather than as a second character, which is the cheapest honest fix.
 * To give her a voice of her own, vendor a second female model first:
 *
 *   VOICE=en_GB-jenny_dioco-medium npm run vendor-voice
 *
 * and then set `neema: 'young-f-en'` below. For a commercial, cloned voices
 * are better than either -- VOICE_BACKEND=voicestudio.
 */
const PIPER = {
    en: { host: 'narrator-f-en', neema: 'narrator-f-en', juma: 'narrator-m-en' },
    sw: { host: 'host-sw', neema: 'authority-sw', juma: 'young-m-sw' },
};

/** Mirrors VOICE_PRESETS in src/core/voice/catalog.js, for the pacing fit. */
export const PIPER_RATES = {
    'narrator-f-en': 1, 'narrator-m-en': 1,
    'host-sw': 1.06, 'authority-sw': 0.94, 'young-m-sw': 1.10,
};

/** The rate a role will actually be spoken at, for the chosen backend. */
export const rateOf = (lang, who) =>
    (VOICE_BACKEND === 'piper' ? PIPER_RATES[PIPER[lang][who]] : 1) ?? 1;

/**
 * The film's `voices` block.
 *
 * `lang` is DECLARED, not inferred. `langOfSpec` can only read a language out
 * of a Piper model id, so a VoiceStudio film carries none and every pacing
 * estimate silently falls back to the English word rate -- which for the
 * Swahili cut means being measured in the wrong units.
 */
export const voicesFor = (lang) => {
    const tag = lang === 'sw' ? 'sw-TZ' : 'en-GB';
    const make = (who) => (VOICE_BACKEND === 'voicestudio'
        ? { spec: `voicestudio:${VOICE_IDS[lang][who]}`, lang: tag }
        : { spec: PIPER[lang][who], lang: tag });
    return { host_v: make('host'), neema_v: make('neema'), juma_v: make('juma') };
};

/**
 * Narration has to come from a cast member: `buildDialogue` looks the speaker
 * up in the scene's cast to find its voice, and an uncast speaker renders
 * SILENT with only a warning. So a speaker who is not meant to be seen is
 * cast invisible and behind everything.
 */
export const offstage = (as, character = as) =>
    ({ character, as, at: [540, 976], scale: 1, alpha: 0, z: -900 });

/** Narration: the host's voice, subtitled, with no mouth to animate. */
export const vo = (text, at = 0.2) =>
    ({ speaker: 'host', text, at, lipsync: false, subtitle: true });

/** A spoken line, with the mouth. */
export const says = (speaker, text, at = 0.25) =>
    ({ speaker, text, at, lipsync: true, subtitle: true });

/**
 * The subtitle band. Every line is on screen because most viewers watch
 * muted, and an advert that needs sound to work is an advert most of the feed
 * never hears.
 *
 * The key is `bottomMargin`, NOT `y`: `buildSubtitleNode` reads
 * `meta.height - st.bottomMargin` and silently ignores anything else.
 * 1920 - 372 = 1548, clear of the phone UI rail.
 */
export const SUBTITLE_STYLE = {
    font: `600 38px ${FONT}`,
    fill: XMS_PALETTE.ink,
    stroke: '#03060a',
    strokeWidth: 7,
    lineHeight: 46,
    maxWidth: SAFE.x1 - SAFE.x0,
    bottomMargin: 372,
};

export const META = (lang) => ({
    title: `${APP} — ${TAGLINE[lang]}`,
    width: W, height: 1920, fps: 24,
    author: 'Ezekiel Minja',
    description: `${APP} commercial (${lang}). ${TAGLINE[lang]}.`,
    subtitleStyle: SUBTITLE_STYLE,
});
