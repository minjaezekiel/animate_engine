/**
 * "Reading the Market" / "Kusoma Soko" -- a ten-part bilingual series on
 * foreign exchange trading, for an audience that has mostly met forex
 * through somebody trying to sell them something.
 *
 * 1080x1920, English and Swahili, ~90 s a part, 20 films from ten builders.
 *
 * Shared furniture for every part in both languages, kept apart from the
 * part builders so twenty films cannot drift from each other: one palette,
 * one cast, one banner, one end card, one disclaimer.
 *
 * ## How this series differs from the four before it
 *
 * 1. **It is drawn on PAPER, not on a dark stage.** Every earlier series
 *    here opens on `#0d1420`. This one is ink on a flat sage field, measured
 *    off the `anime8` reference (mean RGB 150,154,137 across 75 s, chroma
 *    spread 18 -- it is a real colour, not a grey). That is the brief, and it
 *    is also a reason: a feed full of finance content is uniformly dark, and
 *    the cheapest way to not look like the scam channels is to not look like
 *    them.
 *
 * 2. **The cast is line art, not a filled humanoid.** `anime8` draws its
 *    people as black contour on paper with no fill in the clothing at all,
 *    and carries every emotional beat on eye size and mouth shape. So Amara,
 *    Juma and Mr Ninety-Five are authored as explicit `parts` + `mouth`
 *    characters the way `lib/physics.mjs` does its billiard balls, rather
 *    than through `generate`. `08-ART-VOCABULARY.md` and Phase 37's fourth
 *    correction both say the generated rig is a diagram of a person that
 *    falls apart in close framing. This style IS a diagram of a person, on
 *    purpose, so the weakness becomes the look.
 *
 * 3. **The series argues with its own brief.** The ask was for a strategy
 *    that works "95% of the time". No strategy does, and the only way to
 *    manufacture a 95% win rate is a tiny target against a huge stop -- which
 *    is precisely the pattern that empties beginner accounts and earns forex
 *    the reputation this series exists to answer. So expectancy is the spine,
 *    the 95% claim is debunked by name in part one, and `Mr Ninety-Five` is
 *    a character rather than a promise.
 *
 * Not financial advice. `DISCLAIMER` goes on every end card.
 */
import { FONT, GROUND_Y, SAFE, W } from './diagram.mjs';

export const LANGS = ['en', 'sw'];
export const PARTS_IN_SERIES = 10;

export const SERIES = {
    en: 'Reading the Market',
    sw: 'Kusoma Soko',
};

export const TAGLINE = {
    en: 'forex, without anyone selling you anything',
    sw: 'forex, bila mtu kukuuzia kitu',
};

export const REPO = 'github.com/minjaezekiel/jireX';

/** The engine advert, in as many words, at the end of every part. */
export const ENGINE_AD = {
    en: 'Animated with Jirex — the free, open-source animation engine',
    sw: 'Imeundwa na Jirex — injini huria ya uhuishaji, bure kabisa',
};

/**
 * The risk disclaimer.
 *
 * On every end card, in both languages, non-negotiable. A series whose first
 * part is about people being scammed cannot itself skip the sentence the
 * scammers always skip. It is also the cheapest credibility the films have:
 * nobody selling a signal group has ever put this on screen.
 */
export const DISCLAIMER = {
    en: 'Educational only — not financial advice. Trading carries risk of loss.',
    sw: 'Kwa elimu tu — si ushauri wa kifedha. Biashara hii ina hatari ya hasara.',
};

/**
 * Follow / share, per part.
 *
 * Per part because "Follow for Part 2" on the end of part ten is the kind of
 * detail that tells a viewer the series was assembled rather than made. The
 * last part points back at the first, which is the only ask that still makes
 * sense to somebody who has finished.
 */
export const CTA = {
    en: (n) => (n >= PARTS_IN_SERIES
        ? 'Start again at Part 1  ·  Send this to someone who got burned'
        : `Follow for Part ${n + 1}  ·  Send this to someone who got burned`),
    sw: (n) => (n >= PARTS_IN_SERIES
        ? 'Anza upya Sehemu ya 1  ·  Mtumie aliyewahi kuibiwa'
        : `Fuatilia Sehemu ya ${n + 1}  ·  Mtumie aliyewahi kuibiwa`),
};

export const SHARE = {
    en: '#Forex  #TradingEducation  #RiskManagement  #Africa',
    sw: '#Forex  #ElimuYaBiashara  #UsimamiziWaHatari  #Afrika',
};

/**
 * The pinned banner, top of frame, up from frame one and never moving.
 *
 * From `anime6` by way of `../../docs/completed_phases/30-STRUCTURE-SERIES.md`: a caption pinned from the
 * first frame so a viewer arriving three seconds in -- which on these
 * platforms is most of them -- knows what they are watching without waiting
 * for a title.
 */
export const BANNER = {
    en: (n) => `Reading the Market  ·  Part ${n} of ${PARTS_IN_SERIES}`,
    sw: (n) => `Kusoma Soko  ·  Sehemu ${n} ya ${PARTS_IN_SERIES}`,
};

// ---------------------------------------------------------------------------
// The paper
// ---------------------------------------------------------------------------

/**
 * One colour, one meaning, across ten parts and both languages.
 *
 * The field is sage paper and the drawing is ink. Everything else is an
 * accent that has to survive being laid on a mid-tone rather than on black,
 * which is why the chart colours here are darker and less saturated than the
 * ones a trading platform uses: `#26a69a` on white is legible, and on this
 * paper it disappears.
 *
 * The three market colours never swap meaning. A viewer who has watched part
 * two should read green as "price closed up" in part ten without being told,
 * and violet as "a zone somebody drew on the chart" rather than as a thing
 * the market did. That is the whole reason this table is shared.
 */
export const FX_PALETTE = {
    // --- the field -----------------------------------------------------
    // Measured off anime8: mean RGB 150,154,137 over its full 75 s.
    paper:    '#969a89',
    paperLit: '#b4b8a6',      // boards and cards sit a shade lighter
    paperDim: '#7e8373',      // inset panels, the inside of a platform window
    card:     '#a7ab99',

    // --- the line ------------------------------------------------------
    // Near-black rather than black. The reference scans as ink on paper, and
    // ink is never #000.
    ink:      '#15170f',
    inkSoft:  '#30342a',
    // `dim` was #565b49, and on black that would be fine. On this paper it
    // measured about 2.8:1 -- under the 3:1 floor for large text, let alone
    // the 4.5:1 for body -- and every board heading drawn in it came back
    // from the contact sheets looking half-erased. Nothing reports this: a
    // colour is never out of bounds, and the only symptom is a frame that
    // looks wrong. Darkened to roughly 3.8:1 against `paper`, which still
    // reads as clearly secondary to `ink` at #15170f.
    dim:      '#3d4234',
    rule:     '#6f7563',
    white:    '#eef0e2',

    // --- the market ----------------------------------------------------
    bull:     '#15663f',      // price closed up
    bear:     '#9e2b1f',      // price closed down
    level:    '#2b4f7a',      // a price level that exists in the market
    zone:     '#5f3f82',      // a zone somebody DREW. Never a market fact.
    gold:     '#9a6a0d',      // money, and the one thing being asked for
    warn:     '#9e2b1f',
    good:     '#15663f',

    // --- the cast ------------------------------------------------------
    // Line art: the fill is the paper showing through, so a figure occludes
    // what is behind it instead of being a wireframe over it.
    skin:     '#969a89',
    cloth:    '#969a89',
    trouser:  '#969a89',
    hair:     '#15170f',
    eye:      '#15170f',
    eyeWhite: '#eef0e2',
    teeth:    '#eef0e2',
    mouth:    '#15170f',
    accent:   '#9a6a0d',
};

/**
 * Where a figure's soles sit below its root, at scale 1.
 *
 * This rig is hand-authored rather than generated, so `measureCharacter`'s
 * 274 does not apply -- the number below is the one the parts actually draw
 * to, and `FIGURE_Y` is what stands a figure ON the ground line instead of
 * hovering or sinking.
 */
export const FIGURE_SOLE = 256;
export const FIGURE_Y = GROUND_Y - FIGURE_SOLE;

// ---------------------------------------------------------------------------
// The voices
// ---------------------------------------------------------------------------

const vsid = (slot, fallback) => process.env[slot] ?? fallback;

/**
 * The cast, as VoiceStudio voice ids.
 *
 * Cloned or recorded human voices in the user's own local VoiceStudio
 * (`docs/29-VOICE-STUDIO.md`), so the ids are per-install and cannot be
 * guessed from here. Recasting twenty films is six edits, or six environment
 * variables.
 *
 *   npm run voice-studio                            # list what the studio has
 *   SAY="Habari" VOICE=<id> npm run voice-studio     # hear one before casting
 *
 * Consent is not optional: clone your own voice, or one whose owner agreed.
 */
export const VOICE_IDS = {
    en: {
        amara: vsid('VS_AMARA_EN', 'amara-en'),
        juma:  vsid('VS_JUMA_EN', 'juma-en'),
        hype:  vsid('VS_HYPE_EN', 'hype-en'),
    },
    sw: {
        amara: vsid('VS_AMARA_SW', 'amara-sw'),
        juma:  vsid('VS_JUMA_SW', 'juma-sw'),
        hype:  vsid('VS_HYPE_SW', 'hype-sw'),
    },
};

/**
 * Which backend the films are cast against.
 *
 *   VOICE_BACKEND=piper        the bundled Piper/VITS catalogue (default)
 *   VOICE_BACKEND=voicestudio  a locally-running VoiceStudio, cloned voices
 *
 * One variable, because the cast is by ROLE either way -- nothing downstream
 * of this file knows which engine is speaking.
 */
export const VOICE_BACKEND = process.env.VOICE_BACKEND ?? 'piper';

/**
 * The Piper casting, by role.
 *
 * Every preset here resolves to a model that is actually in
 * `vendor/piper-voices/`. That is not a detail: Phase 37 shipped an entire
 * two-minute advert with 25 of its 26 lines SILENT because it was cast on two
 * presets whose models were never vendored, and `validateFilm`, `analysePacing`
 * and `produce` all reported success. `check-film.mjs` now errors on it, and
 * this table is chosen so it never has to.
 *
 * Mr Ninety-Five is cast American in English on purpose. The signal-seller
 * voice an African viewer has actually been pitched by is almost never local,
 * and the joke only lands if the voice is the one they remember.
 *
 * Swahili has exactly ONE Piper model (1 of 119), so all three share it and
 * are separated by delivery -- rate and pitch, via `core/audio/delivery.js`.
 * That is a workaround, `26-DELIVERY.md` is honest about being one, and it is
 * the whole reason `VOICE_BACKEND=voicestudio` exists.
 */
const PIPER = {
    // Three different MODELS, chosen to separate on every axis at once:
    // gender, accent and register. The first cast used `narrator-m-en`
    // (en_GB-alan) for Juma and `warm-m-us` (en_US-hfc_male) for Mr
    // Ninety-Five, which are two adult male voices at similar pitch -- fine
    // apart, muddy in the same film.
    en: {
        // Lead. Carries the narration in all ten parts, so it gets the only
        // `high` quality model in the cast.
        amara: { spec: 'tts:en_GB-cori-high' },
        // Northern English male: a completely different timbre from Amara's,
        // and from an American one.
        juma:  { spec: 'tts:en_GB-northern_english_male-medium' },
        // Confident American. The signal-seller voice an African viewer has
        // actually been pitched by is almost never local, and the joke only
        // lands if the voice is the one they remember.
        hype:  { spec: 'tts:en_US-ryan-high' },
    },
    // Swahili has exactly ONE model in the Piper catalogue -- 1 of 118,
    // checked against the vits-web path map, and `ar_JO-kareem` is the only
    // other voice on the continent. So all three share it and are separated
    // by DELIVERY, which `26-DELIVERY.md` is honest about being a workaround.
    //
    // Spread wider than the stock presets. `young-m-sw` (1.10/1.16) and
    // `host-sw` (1.06/1.10) sit within 0.04 of each other on both dials,
    // which is not a different person -- it is the same person on a slightly
    // different day. These three are pushed to the edges of what the pitch
    // shifter holds without artefacting: slow-and-low, fast-and-high, and a
    // near-neutral middle for the salesman.
    sw: {
        amara: { spec: 'tts:sw_CD-lanfrica-medium', rate: 0.93, pitch: 0.87 },
        juma:  { spec: 'tts:sw_CD-lanfrica-medium', rate: 1.14, pitch: 1.24 },
        hype:  { spec: 'tts:sw_CD-lanfrica-medium', rate: 1.03, pitch: 1.02 },
    },
};

/**
 * The delivery each Piper preset carries, so `fitShots` can estimate a line
 * at the rate it will ACTUALLY be spoken. A rate of 1.1 makes a line 9%
 * shorter; ignoring it over-sizes every one of Juma's shots and leaves a hole
 * after each of his questions.
 *
 * Mirrors `VOICE_PRESETS` in `src/core/voice/catalog.js`. Kept here rather
 * than imported because this is a build-time script and the catalogue is
 * engine source; the render re-fits to the real audio anyway.
 */
/**
 * The rate a character will be spoken at, on the chosen backend.
 *
 * Read straight off `PIPER` rather than kept in a parallel table. The first
 * version mirrored the rates in a second object keyed by preset name, which
 * is one edit away from disagreeing with the cast it describes -- and a rate
 * that disagrees under-sizes or over-sizes every one of that character's
 * shots, silently, until the render.
 */
export const rateOf = (lang, who) =>
    (VOICE_BACKEND === 'piper' ? (PIPER[lang][who].rate ?? 1) : 1);

/**
 * The film `voices` block for a language.
 *
 * `lang` is DECLARED, not inferred. `langOfSpec` can only read a language out
 * of a Piper model id, so a film voiced by VoiceStudio carries none and every
 * pacing estimate silently falls back to the English word rate -- which for
 * the Swahili half of this series means being measured in the wrong units.
 * Declaring it costs nothing and is correct on both backends.
 */
export const voicesFor = (lang) => {
    const tag = lang === 'sw' ? 'sw-TZ' : 'en-GB';
    const make = (who) => (VOICE_BACKEND === 'voicestudio'
        ? { spec: `voicestudio:${VOICE_IDS[lang][who]}`, lang: tag }
        // Raw `tts:` specs plus their own delivery, rather than preset names.
        // `resolveVoices` treats a preset's rate/pitch as a DEFAULT the film
        // may override, so stating both here is the same mechanism with the
        // numbers visible in one table instead of two files apart.
        : { ...PIPER[lang][who], lang: tag });
    return { amara_v: make('amara'), juma_v: make('juma'), hype_v: make('hype') };
};

// ---------------------------------------------------------------------------
// The rig
// ---------------------------------------------------------------------------

const cpart = (id, shape, { at = [0, 0], z = 0, parent = null, alpha = 1, ...rest } = {}) =>
    ({ id, parent, pivot: [0, 0], at, shape, z, alpha, ...rest });

/**
 * Where the pieces sit, in rig space, root at the hips.
 *
 * Everything below is measured off this one table so a change to the head
 * size moves the eyes, the brows and the mouth with it rather than leaving
 * three of them behind -- which is how the first pass ended up with brows
 * floating above the crown.
 */
const NECK_Y = -168;       // the head part's own origin: it rotates about here
const HEAD_H = 156;        // chin (local 0) to crown (local -HEAD_H)
const HEAD_W = 136;
const EYE_Y = -96;         // all three in HEAD-LOCAL space
const EYE_X = 32;
const BROW_Y = -136;
const MOUTH_Y = -44;
const SHOULDER_Y = -150;
const SHOULDER_X = 34;
const UPPER_ARM = 72;
const FOREARM = 68;
// Legs splay. At HIP_X 22 with two vertical 5-wide strokes 44 apart, the
// first render read as ONE trouser leg with two outlines rather than as two
// legs -- the gap was there and the eye refused to see it, because nothing
// about the shape said "two of these". Widening the hips and leaning each
// leg outward by LEG_SPLAY is what separates them.
const HIP_X = 30;
const THIGH = 120;
const SHIN = 118;
const LEG_SPLAY = 13;      // how far out the ankle sits from the hip

// The arm hangs OUTSIDE the coat. At SHOULDER_X + 4 it ran down inside the
// torso contour and read as a seam in the clothing rather than as an arm.
// 26, not 18. The coat flares 10 past the shoulder constant, so at 18 a
// narrow-shouldered figure's arm ran 5 units clear of its own contour and the
// two strokes merged into one heavy edge. 26 clears it on the narrowest
// build in the cast and still reads as an arm against the body, not away
// from it.
const ARM_X = 26;          // beyond the shoulder corner

export const HEAD = { neck: NECK_Y, h: HEAD_H, w: HEAD_W, top: NECK_Y - HEAD_H };

const LINE = 7;            // the body contour weight at scale 1
const THIN = 5;            // limbs

/**
 * The head: a soft slab, not an oval.
 *
 * `anime8` draws a tall rounded rectangle with a flat-ish crown and a heavy
 * jaw, and that silhouette is most of the style. Filled with `paper` rather
 * than left open, because the neck and shoulder lines run up behind it and a
 * hollow head shows them through the face.
 */
const headPath = (w = HEAD_W, h = HEAD_H) => {
    const x = w / 2;
    const r = w * 0.34;              // crown corner radius
    const j = w * 0.22;              // jaw corner radius
    return `M${-x},${-h + r} `
        + `C${-x},${-h + r * 0.3} ${-x + r * 0.3},${-h} ${-x + r},${-h} `
        + `L${x - r},${-h} `
        + `C${x - r * 0.3},${-h} ${x},${-h + r * 0.3} ${x},${-h + r} `
        + `L${x},${-j} `
        + `C${x},${-j * 0.3} ${x - j * 0.3},0 ${x - j},0 `
        + `L${-x + j},0 `
        + `C${-x + j * 0.3},0 ${-x},${-j * 0.3} ${-x},${-j} Z`;
};

/**
 * An eye, as a shape SWAP rather than a squash.
 *
 * `generate.js` makes the same choice for the humanoid blink and says why:
 * squashing a node whose geometry carries its own position pulls it toward
 * the parent's origin instead of closing it, so a scaled eye slides into the
 * middle of the face. The closed member declares its own `fill`, which
 * `swapProps` resolves through the palette like any other colour.
 *
 * The iris is a CHILD of the white, so it travels with it -- and the blink
 * has to take it down too, which is why `blinkLid` drives both. A dark disc
 * left floating on a shut eye is the one thing that reads as a bug.
 */
const eyeParts = (side, { rx = 25, ry = 28, iris = 13 } = {}) => {
    const x = side === 'L' ? -EYE_X : EYE_X;
    return [
        cpart(`eye${side}`, { kind: 'ellipse', rx, ry },
              { parent: 'head', at: [x, EYE_Y], z: 12,
                fill: 'eyeWhite', stroke: 'ink', strokeWidth: 4,
                swap: { lid: { default: 'open', shapes: {
                    open: { kind: 'ellipse', rx, ry },
                    // A shut eye in this style is a LINE, not a thin ellipse:
                    // the reference closes to a single stroke with a slight
                    // downward bow.
                    closed: { kind: 'path', d: `M${-rx},0 Q0,${ry * 0.34} ${rx},0`,
                              fill: null, stroke: 'ink', strokeWidth: 5 },
                } } } }),
        // The iris carries no swap of its own. `drawShape` composites the
        // INHERITED alpha ("the caller supplies the inherited alpha"), so
        // taking the iris to 0 takes its glint with it, and a blink costs two
        // channels per eye instead of three. The glint has to go: a white dot
        // left floating on a shut eye is the one thing that reads as a bug.
        cpart(`iris${side}`, { kind: 'ellipse', rx: iris, ry: iris },
              { parent: `eye${side}`, at: [0, 2], z: 13, fill: 'ink' }),
        cpart(`glint${side}`, { kind: 'ellipse', rx: iris * 0.34, ry: iris * 0.34 },
              { parent: `iris${side}`, at: [-iris * 0.32, -iris * 0.34], z: 14,
                fill: 'eyeWhite' }),
    ];
};

/**
 * The six visemes, as paths, because the mouth node is created `kind: 'path'`.
 *
 * Drawn large. The reference carries nearly all of its performance on mouth
 * shape, and at the scale these figures sit in a wide shot a subtle mouth is
 * simply not there. Parented to the head so the whole face tilts together.
 */
const MOUTH_SHAPES = {
    closed: { kind: 'path', d: 'M-26,0 Q0,10 26,0' },
    mid:    { kind: 'path', d: 'M-23,-5 Q0,13 23,-5 Q0,3 -23,-5 Z' },
    open:   { kind: 'path', d: 'M-25,-8 Q0,30 25,-8 Q0,2 -25,-8 Z' },
    round:  { kind: 'path', d: 'M-15,1 Q0,-19 15,1 Q0,21 -15,1 Z' },
    wide:   { kind: 'path', d: 'M-34,-4 Q0,19 34,-4 Q0,5 -34,-4 Z' },
    teeth:  { kind: 'path', d: 'M-27,-7 Q0,4 27,-7 Q0,15 -27,-7 Z' },
};

/**
 * A brow pose, mirrored.
 *
 * `rot` is mirrored so a positive `tilt` lowers the INNER end of both brows,
 * which is the one expression everybody reads the same way: determination on
 * Amara, suspicion on Juma. `up` lifts both.
 */
const brows = (tilt, up) => ({
    browL: { rot: tilt, y: BROW_Y - up },
    browR: { rot: -tilt, y: BROW_Y - up },
});

/**
 * The arm poses, and the trap they avoid.
 *
 * `../../docs/completed_phases/30-STRUCTURE-SERIES.md` paid for this: the forearm is a CHILD of the arm,
 * so the two rotations compound. `armR: -0.62` with `foreR: -0.52` puts the
 * forearm about 65 degrees off vertical, which at two-shot spacing reaches
 * straight through whoever the character is talking to. Keeping the forearm
 * near the body is what makes a gesture a gesture rather than a point.
 */
const arms = (aL, fL, aR, fR) => ({
    armL: { rot: aL }, foreL: { rot: fL },
    armR: { rot: aR }, foreR: { rot: fR },
});

/**
 * One line-art figure.
 *
 * `fill: 'paper'` on the head, torso and shoes is doing real work: it is what
 * makes this a drawing rather than a wireframe. Without it the arm lines show
 * through the coat and the neck shows through the chin.
 */
function figure({
    voice, hair, headW = HEAD_W, headH = HEAD_H, eye = {}, extras = [],
    // Build. These are what make three figures read as three people at the
    // size a phone shows them -- Phase 37's third correction, which cost an
    // entire commercial: a cast that differs only in face slots reads as the
    // same person twice, and the fix is the things still legible at 300 px.
    shoulder = SHOULDER_X, hipW = 10, coat = 60,
}) {
    const parts = [
        // --- legs, behind everything ------------------------------------
        ...['L', 'R'].flatMap((s) => {
            const dir = s === 'L' ? -1 : 1;
            return [
                // Leaning OUT, not straight down. Two parallel verticals 44
                // apart read as one trouser leg with two outlines; the splay
                // is what makes the eye see two legs.
                cpart(`thigh${s}`, { kind: 'path', d: `M0,0 L${dir * LEG_SPLAY * 0.4},${THIGH}` },
                      { at: [dir * HIP_X, 0], z: 2, stroke: 'ink', strokeWidth: THIN,
                        lineCap: 'round' }),
                cpart(`shin${s}`, { kind: 'path', d: `M0,0 L${dir * LEG_SPLAY * 0.6},${SHIN}` },
                      { parent: `thigh${s}`, at: [dir * LEG_SPLAY * 0.4, THIGH], z: 2,
                        stroke: 'ink', strokeWidth: THIN, lineCap: 'round' }),
                // The one piece of mass on the whole figure. The reference
                // gives its stick people enormous shoes and nothing else, and
                // that single weight at the bottom is what stops them reading
                // as a diagram.
                //
                // Mirrored. Both shoes offset the same way put one squarely
                // on top of the other and the pair read as a single blob.
                cpart(`shoe${s}`, { kind: 'ellipse', rx: 32, ry: 14 },
                      { parent: `shin${s}`, at: [dir * LEG_SPLAY * 0.6 + dir * 14, SHIN + 2],
                        z: 3, fill: 'paper', stroke: 'ink', strokeWidth: LINE }),
            ];
        }),

        // --- torso ------------------------------------------------------
        // A coat, drawn as one closed contour rather than a stick, because
        // the shoulders are where the three characters differ most in build.
        cpart('torso', { kind: 'path', d:
            `M${-shoulder - 10},${SHOULDER_Y} `
            + `C${-shoulder - 16},${SHOULDER_Y + coat} ${-HIP_X - hipW - 2},${-40} ${-HIP_X - hipW},6 `
            + `L${HIP_X + hipW},6 `
            + `C${HIP_X + hipW + 2},${-40} ${shoulder + 16},${SHOULDER_Y + coat} ${shoulder + 10},${SHOULDER_Y} `
            + `C${shoulder},${SHOULDER_Y - 14} ${-shoulder},${SHOULDER_Y - 14} `
            + `${-shoulder - 10},${SHOULDER_Y} Z` },
              { at: [0, 0], z: 5, fill: 'paper', stroke: 'ink', strokeWidth: LINE }),

        // --- arms, in front of the torso ---------------------------------
        ...['L', 'R'].flatMap((s) => {
            const x = (s === 'L' ? -1 : 1) * (shoulder + ARM_X);
            return [
                cpart(`arm${s}`, { kind: 'path', d: `M0,0 L0,${UPPER_ARM}` },
                      { at: [x, SHOULDER_Y + 22], z: 8, stroke: 'ink',
                        strokeWidth: THIN + 1, lineCap: 'round' }),
                cpart(`fore${s}`, { kind: 'path', d: `M0,0 L0,${FOREARM}` },
                      { parent: `arm${s}`, at: [0, UPPER_ARM], z: 8, stroke: 'ink',
                        strokeWidth: THIN + 1, lineCap: 'round' }),
                cpart(`hand${s}`, { kind: 'ellipse', rx: 12, ry: 14 },
                      { parent: `fore${s}`, at: [0, FOREARM + 5], z: 9,
                        fill: 'paper', stroke: 'ink', strokeWidth: 4 }),
            ];
        }),

        // --- neck and head ------------------------------------------------
        cpart('neck', { kind: 'path', d: `M0,0 L0,${-22}` },
              { at: [0, SHOULDER_Y + 4], z: 6, stroke: 'ink', strokeWidth: THIN }),
        // Rotates about the NECK, not about its own centre: the geometry is
        // drawn upward from this origin, so a head tilt hinges where a head
        // actually hinges instead of swinging the chin out sideways.
        cpart('head', { kind: 'path', d: headPath(headW, headH) },
              { at: [0, NECK_Y], z: 10, fill: 'paper', stroke: 'ink',
                strokeWidth: LINE }),
        ...hair.map((d, i) => cpart(`hair${i}`, { kind: 'path', d },
              { parent: 'head', at: [0, 0], z: 11, fill: null, stroke: 'ink',
                strokeWidth: LINE, lineCap: 'round' })),
        ...eyeParts('L', eye), ...eyeParts('R', eye),
        ...['L', 'R'].map((s) => cpart(`brow${s}`,
            { kind: 'path', d: s === 'L' ? 'M-20,4 L20,-4' : 'M-20,-4 L20,4' },
            { parent: 'head', at: [s === 'L' ? -EYE_X : EYE_X, BROW_Y], z: 15,
              stroke: 'ink', strokeWidth: 7, lineCap: 'round' })),
        ...extras,
    ];

    return {
        palette: 'fx',
        voice,
        parts,
        mouth: { parent: 'head', pivot: [0, MOUTH_Y], shapes: MOUTH_SHAPES,
                 fill: 'ink', stroke: 'ink', strokeWidth: 4, z: 16 },
        poses: {
            // Every pose states both brows and all four arm channels. A pose
            // that names only what it changes leaves the previous pose's arm
            // where it was, and the character accumulates gestures.
            stand:    { ...brows(0, 0), ...arms(0.14, 0.18, -0.14, -0.18), head: { rot: 0 } },
            talk:     { ...brows(-0.06, 4), ...arms(0.2, 0.3, -0.26, -0.34), head: { rot: 0 } },
            present:  { ...brows(-0.1, 6), ...arms(0.14, 0.18, -0.52, -0.2), head: { rot: -0.04 } },
            count:    { ...brows(-0.08, 4), ...arms(0.14, 0.18, -0.72, -0.42), head: { rot: 0 } },
            // The one big reach, and it is for SOLO shots at a board -- there
            // is nobody beside them to cross.
            point:    { ...brows(-0.12, 8), ...arms(0.14, 0.18, -1.05, -0.25), head: { rot: -0.1 } },
            ask:      { ...brows(-0.2, 12), ...arms(0.14, 0.18, -0.55, -0.32), head: { rot: 0.08 } },
            think:    { ...brows(0.14, 6), ...arms(0.14, 0.18, -1.3, -1.45), head: { rot: 0.12 } },
            doubt:    { ...brows(0.34, -4), ...arms(0.16, 0.22, -0.16, -0.24), head: { rot: 0.1 } },
            sure:     { ...brows(0.26, 2), ...arms(0.12, 0.16, -0.12, -0.16), head: { rot: -0.03 } },
            shock:    { ...brows(-0.34, 22), ...arms(0.46, 0.5, -0.46, -0.5), head: { rot: -0.06 } },
            // Both arms up. The reference's one big physical beat, and the
            // only pose here that uses the left arm for anything.
            cheer:    { ...brows(-0.3, 20), ...arms(2.5, 0.3, -2.5, -0.3), head: { rot: -0.08 } },
            slump:    { ...brows(0.3, -8), ...arms(0.08, 0.1, -0.08, -0.1), head: { rot: 0.22 } },
        },
    };
}

/**
 * The cast.
 *
 * Three people, built to be told apart in silhouette at the size a phone
 * actually shows them. Phase 37's third correction is the reason that is
 * stated as a requirement rather than assumed: a cast differing only in face
 * slots reads as the same person twice, and the fix was height, build and
 * hair -- the three things still legible when the figure is 300 px tall.
 */
export const CHARACTERS = {
    /**
     * AMARA — trades for a living, and is bored of being asked for signals.
     * Carries the narration. Tallest, braids, square shoulders.
     */
    amara: figure({
        voice: 'amara_v',
        headW: 134, headH: 158,
        shoulder: 30, hipW: 14, coat: 72,
        // A hairline swept back into a high bun, and nothing at the sides.
        //
        // The first version had two long braid arcs running down past the jaw
        // at x = ±78-90. The head is only 134 wide, so they sat OUTSIDE the
        // skull on both sides, level with the ears, and read unmistakably as
        // headphones. A hair stroke that leaves the silhouette stops being
        // hair: it becomes whatever object it most resembles.
        hair: ['M-62,-104 C-66,-142 -36,-158 0,-158 C36,-158 66,-142 62,-104',
               'M-40,-132 C-18,-146 18,-146 40,-132'],
        eye: { rx: 26, ry: 30, iris: 14 },
        extras: [
            cpart('bun', { kind: 'ellipse', rx: 26, ry: 24 },
                  { parent: 'head', at: [6, -176], z: 9, fill: 'paper', stroke: 'ink',
                    strokeWidth: LINE }),
        ],
    }),

    /**
     * JUMA — has been burned once and is not keen to be burned twice. Asks
     * what the viewer is already thinking.
     *
     * Shorter and wider than Amara, with a low flat fade and no crown
     * ornament at all, so the two silhouettes differ at the top AND at the
     * shoulders. Cast through `stand()` at 0.88 against her 0.97, which is
     * where most of the height difference actually comes from.
     */
    juma: figure({
        voice: 'juma_v',
        headW: 142, headH: 138,
        shoulder: 40, hipW: 8, coat: 52,
        hair: ['M-66,-96 L-58,-122 C-30,-136 30,-136 58,-122 L66,-96'],
        eye: { rx: 24, ry: 27, iris: 13 },
    }),

    /**
     * MR NINETY-FIVE — sells a signal group. Not a villain with a moustache:
     * he is likeable, confident and completely plausible, because that is the
     * only kind that actually works on anybody.
     *
     * Marked by the one accessory in the series — sunglasses, as a brow-level
     * bar — so that he is identifiable in a single frame at any size, which
     * matters because he appears in four parts and is the running joke.
     */
    hype: figure({
        voice: 'hype_v',
        headW: 138, headH: 148,
        shoulder: 46, hipW: 6, coat: 44,
        // Slicked straight back: three parallel strokes over the crown. The
        // widest shoulders in the cast and the only one with no hairline
        // curve, so even in silhouette he is the wedge.
        hair: ['M-64,-100 C-68,-140 -36,-154 0,-154 C36,-154 68,-140 64,-100',
               'M-34,-150 L-26,-108 M0,-154 L0,-110 M34,-150 L26,-108'],
        eye: { rx: 25, ry: 28, iris: 13 },
        extras: [
            cpart('shades', { kind: 'path', d:
                'M-62,-104 L62,-104 L58,-70 L10,-66 L0,-78 L-10,-66 L-58,-70 Z' },
                  { parent: 'head', at: [0, 0], z: 20, fill: 'ink', stroke: 'ink',
                    strokeWidth: 4, alpha: 0 }),
        ],
    }),
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

/**
 * Cast a figure standing ON the ground line, at any scale.
 *
 * The root is the hips and the soles are `FIGURE_SOLE` below it, so the sole
 * offset scales with the figure: a character cast at 0.88 beside one at 0.97
 * on the same `at.y` stands 18 units higher, which at 1080 wide is a visible
 * hover and is exactly the mistake `29-WALK-CYCLE` documents for the
 * generated rig. Deriving `y` from the scale is the whole job.
 *
 * This is also what lets height carry the character differences. Three rigs
 * that share one geometry can still be three obviously different people if
 * they are cast at 0.97, 0.88 and 0.93 -- and height is the single most
 * legible difference at phone size, ahead of face, hair or build.
 */
export const stand = (who, x, scale = 0.95, { as = who, ...rest } = {}) => ({
    character: who, as, scale,
    at: [x, Math.round(GROUND_Y - FIGURE_SOLE * scale)],
    ...rest,
});

/** The heights the three are cast at, so no part has to guess. */
export const H_AMARA = 0.97;
export const H_JUMA = 0.88;
export const H_HYPE = 0.93;

/** Narration in Amara's voice, subtitled, with no mouth to animate. */
export const vo = (text, at = 0.2) =>
    ({ speaker: 'amara', text, at, lipsync: false, subtitle: true });

/** A spoken line, with the mouth. */
export const says = (speaker, text, at = 0.25) =>
    ({ speaker, text, at, lipsync: true, subtitle: true });

/**
 * The subtitle band.
 *
 * Every line is on screen because most viewers watch muted -- the single most
 * consistent finding in the retention sources.
 *
 * Inverted from every other series here, and that is the whole point of the
 * paper look: dark ink with a PALE halo. The dark-on-light stack the other
 * four series use (`#f2efe6` over `#04070a`) is invisible on sage.
 *
 * The key is `bottomMargin`, NOT `y`. `buildSubtitleNode` reads
 * `meta.height - st.bottomMargin` and ignores anything else, so a `y` here is
 * accepted, carried, and silently does nothing. 1920 - 372 = 1548, clear of
 * the phone UI rail.
 */
export const SUBTITLE_STYLE = {
    font: `700 38px ${FONT}`,
    fill: FX_PALETTE.ink,
    stroke: '#d6d9c6',
    strokeWidth: 8,
    lineHeight: 46,
    maxWidth: SAFE.x1 - SAFE.x0,
    bottomMargin: 372,
};

export const META = (lang, title) => ({
    title: `${SERIES[lang]} — ${title}`,
    width: W, height: 1920, fps: 24,
    author: 'Ezekiel Minja',
    description: `${SERIES[lang]}: ${TAGLINE[lang]}. ${DISCLAIMER[lang]}`,
    subtitleStyle: SUBTITLE_STYLE,
});
