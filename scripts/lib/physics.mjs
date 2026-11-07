/**
 * "Game Physics" -- a seven-part series on the collision maths that makes a
 * game world feel alive. 1080x1920, English, for phone feeds.
 *
 * Shared furniture for every part, kept apart from the part builders so seven
 * films cannot drift from each other: one palette, one cast, one title
 * treatment, one banner, one end card.
 *
 * ## How this series differs from the three before it
 *
 * 1. **The cast is not human.** Every earlier series casts `generate`
 *    humanoid rigs. Bolt and Nova are billiard BALLS and Vector is a
 *    floating robot, so all three are authored as explicit `parts` + `mouth`
 *    characters. `compile.js` supports that path fully -- `characterParts`
 *    returns `char.parts` when they exist -- but nothing in this repo had
 *    ever used it for a speaking character, so the rigs below are the first.
 *
 * 2. **A ball has no arms, so acting is brows, squash and spin.** The poses
 *    here key brow rotation, brow height and the ball's own `sx`/`sy`. There
 *    is no `armR` to swing and therefore none of the forearm-compounding trap
 *    that `30-STRUCTURE-SERIES.md` documents.
 *
 * 3. **The pad is tighter.** `27-RETENTION.md` measured our own films at 54%
 *    speech against the references' 73%, and named the cause: slack at the
 *    end of every shot. The earlier series pad 0.85 s. This is motion
 *    graphics with fast cuts, so it pads 0.6 s and floors a shot at 2.4 s.
 */
import { FONT, PALETTE, SAFE, W } from './diagram.mjs';

export const SERIES = 'Game Physics';
export const TAGLINE = 'the maths that makes a game world feel alive';
export const REPO = 'github.com/minjaezekiel/jireX';
export const PARTS_IN_SERIES = 7;

/** The engine advert, in as many words, at the end of every part. */
export const ENGINE_AD = 'Animated with Jirex — the free, open-source animation engine';

/**
 * Follow / share. The platforms want to be told, so the film tells them.
 *
 * Per part, because "Follow for Part 2" on the end of part six is the kind
 * of detail that tells a viewer the series was assembled rather than made.
 * The last part has no next part, so it points back at the first -- which is
 * also the only ask that still makes sense once somebody has finished.
 */
export const CTA = (n = 1) => (n >= PARTS_IN_SERIES
    ? 'Start again at Part 1  ·  Send this to someone building a game'
    : `Follow for Part ${n + 1}  ·  Send this to someone building a game`);

export const SHARE = '#GameDev #GamePhysics #Python #IndieDev #LearnToCode';

/**
 * The pinned banner, top of frame, present for the whole part.
 *
 * Lifted from `anime6` by way of `30-STRUCTURE-SERIES.md`: a caption pinned
 * from frame one so a viewer arriving three seconds in -- which on these
 * platforms is most of them -- knows what they are watching.
 */
export const BANNER = (n) => `Why things bounce  ·  Part ${n} of ${PARTS_IN_SERIES}`;

/**
 * One colour, one meaning, across all seven parts.
 *
 * The physical QUANTITIES get the fixed accents and never swap: a viewer who
 * has watched part one should read magenta as "collision normal" in part four
 * without being told again. That is the entire reason this table is shared,
 * and it is the series' one real teaching device besides the narration.
 */
export const GAME_PALETTE = {
    ...PALETTE,
    bg: '#0b1026',
    bgDeep: '#070a1a',
    panel: '#141b3a',
    panelLine: '#28345f',
    ink: '#f4f7ff',
    dim: '#93a3c8',
    grid: '#1e2850',
    gridHot: '#2c3a70',

    // --- the quantities, one colour each --------------------------------
    velocity: '#36e3ff',     // electric cyan — every velocity arrow, always
    momentum: '#ffd23d',     // amber — mass x velocity
    normal: '#ff4d8d',       // magenta — the collision normal
    tangent: '#8e7bff',      // violet — the sideways component
    restitution: '#3ddc84',  // green — bounciness
    spin: '#ff9f1c',         // orange — angular velocity (part 6)
    loss: '#ff5c5c',         // red — energy that does not come back

    // --- the cast --------------------------------------------------------
    cue: '#f2f5fb',          // Bolt: cue-ball white
    cueDark: '#b9c2d6',
    bolt: '#3b9dff',         // his lightning mark
    nova: '#ff8c32',         // Nova: the orange five
    novaDark: '#c7641a',
    novaPale: '#ffd9b4',
    robot: '#aebdd8',        // Vector's shell
    robotDark: '#6f7d99',
    screen: '#071225',       // his face panel
    glow: '#36e3ff',         // and what is lit on it

    // --- the table -------------------------------------------------------
    felt: '#0f6b4d',
    feltDark: '#0a5340',
    feltLine: '#1c8a66',
    rail: '#6b4320',
    railDark: '#422814',
    pocket: '#050d0b',

    // --- code, for the cliffhanger and parts 2 onward --------------------
    codeBg: '#080d1c',
    codeLine: '#1a2444',
    codeKey: '#ff7bd5',
    codeStr: '#9ff07a',
    codeNum: '#ffd23d',
    codeFn: '#7fc9ff',
    codeCmt: '#64739b',

    // --- shared ink ------------------------------------------------------
    white: '#ffffff',
    eyeLine: '#12192f',      // the eyes themselves: near-black, not black
    mouthDark: '#2a1420',
    brow: '#12192f',
    browNova: '#7a3a0e',
    shadow: '#05081a',
};

/** The radius every ball rig is drawn at, so one scale means one size. */
export const BALL_R = 120;

/**
 * Which voice backend the films are cast against.
 *
 *   VOICE_BACKEND=piper        the bundled Piper/VITS catalogue (default)
 *   VOICE_BACKEND=voicestudio  a locally-running VoiceStudio, cloned voices
 *
 * The cast is by ROLE either way -- nothing downstream of this file knows or
 * cares which engine is speaking. See `29-VOICE-STUDIO.md`.
 */
export const VOICE_BACKEND = process.env.VOICE_BACKEND ?? 'piper';

const vsid = (slot, fallback) => process.env[slot] ?? fallback;

/** VoiceStudio ids are per-install and cannot be guessed from here. */
export const VOICE_IDS = {
    bolt: vsid('VS_BOLT', 'bolt-en'),
    nova: vsid('VS_NOVA', 'nova-en'),
    vector: vsid('VS_VECTOR', 'vector-en'),
};

/**
 * The Piper casting, by role.
 *
 * Three genuinely different MODELS, and deliberately three different
 * accents -- American, RP, Scottish. English has ten presets in the
 * catalogue, so unlike the Swahili half of `30-STRUCTURE-SERIES.md` nothing
 * here is faked out of rate and pitch: the only delivery number below is
 * Bolt's rate, and that is characterisation rather than a workaround.
 *
 *   Bolt    enthusiastic, talks fast, American and conversational
 *   Nova    calm, dry, curious; the one who is wrong first and asks why
 *   Vector  the explainer, measured RP — the classic voice-over read
 */
const PIPER = {
    bolt: 'warm-m-us',
    nova: 'narrator-f-en',
    vector: 'narrator-m-en',
};

/**
 * The delivery each role carries, so `fitShots` can estimate a line at the
 * rate it will ACTUALLY be spoken.
 *
 * Bolt is the only one that moves. 1.06 makes his lines ~6% shorter than a
 * flat estimate assumes, and ignoring it OVER-sizes every shot he is in --
 * the mirror of the Mzee Rajabu defect in `30-STRUCTURE-SERIES.md`, where a
 * slow speaker's shots came out short. Same cause, opposite sign.
 */
export const DELIVERY = {
    bolt: { rate: 1.06 },
    nova: {},
    vector: {},
};

/** The rate a character will be spoken at, for the chosen backend. */
export const rateOf = (who) =>
    (VOICE_BACKEND === 'piper' ? (DELIVERY[who]?.rate ?? 1) : 1);

/**
 * The film `voices` block.
 *
 * `lang` is DECLARED, not inferred. `langOfSpec` can only read a language out
 * of a Piper model id, so a film voiced by VoiceStudio carries none and every
 * pacing estimate silently falls back to the English word rate. This series
 * IS English, so that fallback would happen to be right -- which is exactly
 * why it is declared anyway. A default that is accidentally correct is a
 * defect waiting for the first film that is not English.
 */
export const voicesFor = () => {
    const make = (who) => (VOICE_BACKEND === 'voicestudio'
        ? { spec: `voicestudio:${VOICE_IDS[who]}`, lang: 'en-GB', ...DELIVERY[who] }
        // A preset NAME, not a model id: `resolveVoices` expands it and
        // carries its own rate/pitch across, so the cast stays by role.
        : { spec: PIPER[who], lang: who === 'bolt' ? 'en-US' : 'en-GB',
            ...DELIVERY[who] });
    return {
        bolt_v: make('bolt'),
        nova_v: make('nova'),
        vector_v: make('vector'),
    };
};

/**
 * The subtitle band. Every line is on screen because most viewers watch
 * muted -- the single most consistent finding in the retention sources.
 *
 * The key is `bottomMargin`, NOT `y`. `buildSubtitleNode` reads
 * `meta.height - st.bottomMargin` and ignores anything else, so a `y` here is
 * accepted, carried, and silently does nothing.
 */
export const SUBTITLE_STYLE = {
    font: `600 38px ${FONT}`,
    fill: GAME_PALETTE.ink,
    stroke: '#03050f',
    strokeWidth: 7,
    lineHeight: 46,
    maxWidth: SAFE.x1 - SAFE.x0,
    bottomMargin: 372,
};

export const META = (title) => ({
    title: `${SERIES} — ${title}`,
    width: W, height: 1920, fps: 24,
    author: 'Ezekiel Minja',
    description: `${SERIES}: ${TAGLINE}. Educational.`,
    subtitleStyle: SUBTITLE_STYLE,
});
