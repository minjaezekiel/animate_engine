# Reading the Rock / Kusoma Mwamba — a bilingual structural-geology series

Six parts, 1080×1920, about three minutes each, on joints, folds, faults and
shear zones, and what each one means for where minerals sit. **Every part is
built twice, in English and in Swahili**, from one authored staging.

The brief: the audience is artisanal prospectors and curious people on
Instagram, Facebook and TikTok. So each part teaches one structure, says how
to recognise it with no equipment, names the minerals that actually occur
there, and ends by asking for a follow and a share.

## The parts

| | | |
|---|---|---|
| 1 | **The crack that was open** · *Ufa uliokuwa wazi* | Joints, and why only one set in an outcrop usually pays |
| 2 | **The hinge that collects** · *Pembe inayokusanya* | Folds, outer-arc extension, saddle reefs, plunge |
| 3 | **It broke, and it moved** · *Ulivunjika, ukahama* | Faults, dilational jogs, breccia, gossan |
| 4 | **The rock that smeared** · *Mwamba uliopakaa* | Shear zones, alteration halos, Tanzania's gold |
| 5 | **Measuring it with almost nothing** · *Kupima bila vifaa* | Strike and dip, the order of work, surface clues |
| 6 | **Where they cross** · *Pale zinapokutana* | Intersections, the four ingredients, and what not to believe |

Part 6 closes the loop part 1 opens: part 1 says a quartz vein proves fluid
moved **and nothing more**, and part 6 finally answers what else is needed.

## Built twice from one staging

A part exports `partN(lang)` and reads its narration from a `{en, sw}` table.
The boards, the shot list, the cast and the action schedules are authored
once; only the words and the derived durations differ.

That is not a convenience, it is a correctness property: the dub cannot drift
from the original, because there is only one of them. What *must* differ is
timing — `fitShots` derives every shot's length from the line it carries, and
English and Swahili do not take the same time to say the same thing:

| | English | Swahili |
|---|---|---|
| runtime | 3:10 – 3:21 | 2:44 – 2:57 |
| line coverage | 85% | 82–84% |
| hook coverage (first 8 s) | 91–96% | 91–96% |
| first word | 0.3 s | 0.3 s |

All twelve pass `check-film` with no warnings.

## What building it twice exposed

Three defects, and all three were **invisible in English**. That is the
finding worth keeping: a second language is a test, and it caught things no
amount of staring at the English version would have.

**1. A film voiced by anything but Piper was measured as English.**
`langOfSpec` reads a language out of a model id — `tts:sw_CD-lanfrica-medium`
→ `sw`. A cloned VoiceStudio voice (`voicestudio:asha-sw`) carries no language
at all, so `estimateLine` fell through to the 150 wpm English default and
measured all six Swahili films in the wrong units. It reported gaps that were
not there and coverage that was wrong in both directions.

A voice may now declare `lang`, which flows `castVoices` → `lipsyncJobs` →
`analysePacing`, and a declared language beats one guessed from the spec. The
same change fixes uploads and recordings, which never had a language either.

```json
"voices": { "asha_v": { "spec": "voicestudio:asha-sw", "lang": "sw-TZ" } }
```

**2. The opening shot's tail pad was a hole in the hook.** `fitShots` gave
every shot 0.85 s of air after its line. Everywhere else that is breathing;
in the opening it is the one thing the retention sources agree is fatal.
Measured: Swahili part four's hook window ran **74%** against an 80% floor
while its English twin passed at 85% — same staging, same numbers, different
language. The first shot now gets 0.2 s, and hook coverage across all twelve
went from 83–96% to **91–96%**.

**3. A `min` shot length of 3.5 s manufactured its own gap.** A deliberate
two-word beat — "Strike, and dip." — was padded out to three seconds of
silence and tripped the gap check. The floor exists so a shot is not
subliminal, not so every short line is followed by a pause. Now 2.6 s.

## The voices

The cast is by **role**, and which engine speaks it is one environment
variable. Nothing downstream of `scripts/lib/structure.mjs` knows or cares.

```bash
VOICE_BACKEND=piper        node scripts/make-structure.mjs   # default
VOICE_BACKEND=voicestudio  node scripts/make-structure.mjs
```

| | role | Piper (default) | VoiceStudio slot |
|---|---|---|---|
| **Dr Asha** | structural geologist; carries the narration | `narrator-f-en` / `authority-sw` | `VS_ASHA_EN` / `VS_ASHA_SW` |
| **Kitwana** | young prospector; asks what the viewer is thinking | `narrator-m-en` / `young-m-sw` | `VS_KITWANA_EN` / `VS_KITWANA_SW` |
| **Mzee Rajabu** | licensed artisanal miner; experience, not instruction | `elder-m-en` / `elder-m-sw` | `VS_RAJABU_EN` / `VS_RAJABU_SW` |

English gets three genuinely different models. **Swahili cannot**: the Piper
catalogue has exactly one Swahili voice — 1 of 119, checked against its own
path map — so the three share it and are separated by *delivery*, rate and
pitch, via `core/audio/delivery.js`. That is a workaround and
`26-DELIVERY.md` is honest about being one. It is also the entire reason the
VoiceStudio backend exists: real cloned voices remove the constraint at the
source rather than faking around it.

Asha is cast on `authority-sw` rather than `host-sw` so she does not read as
the same person as Nuru, who carries *Madini ya Vito*.

### A speaker's rate changes how long their shots must be

`fitShots` estimates each line at the rate its **speaker** will actually be
spoken at. Mzee Rajabu sits at 0.86, which makes his lines 16% longer than a
flat estimate assumes — ignoring it under-sizes every shot he is in. Switching
the Swahili films from VoiceStudio (every rate 1) to Piper moved them from
2:44–2:57 to **2:52–3:07**, which is the correction, not a regression.

### Rendering will not quietly use the wrong voice

`VoiceRegistry.synthesize` used to fall silently down the provider ladder, so
a film cast against a VoiceStudio that happened not to be running rendered end
to end in a Piper voice with nothing anywhere reporting it — twelve films in
the wrong voice, discovered on watching them. Substitution is now a `warning`
naming both voices, and `STRICT_VOICE=1` refuses to substitute at all.

A silent line is a bug you notice on the first watch; a stand-in is one you
ship.

### Models are vendored, not fetched

A headless render launches a fresh Chrome profile, so vits-web's OPFS cache is
empty every run and every render re-downloads the whole model. A 503 from the
CDN killed a geology render and a mid-download tab crash killed the first
Swahili one. All four models this series needs are local:

```bash
npm run vendor-voice                                      # Swahili
VOICE=en_GB-alba-medium                npm run vendor-voice
VOICE=en_GB-alan-medium                npm run vendor-voice
VOICE=en_GB-northern_english_male-medium npm run vendor-voice
```

`vendor/` is gitignored, so this is a one-time 250 MB on a fresh checkout.

## The look, and what the references gave it

Studied `anime6` and `anime21` (both 576×1024, 30 fps) by decoding them in a
real browser with `scripts/watch-video.mjs`, because there is no ffmpeg here.

| | anime6 | anime21 |
|---|---|---|
| runtime | 39.1 s | 28.0 s |
| palette | deliberately monochrome (measured: R=G=B) | full colour |
| cutting | 6 cuts in the first 17 s, then one long take | four shots of exactly 8 s |
| end card | from 35.1 s | from 24.0 s |

Two things were taken from them directly:

- **The pinned banner.** `anime6` keeps a caption at the top of frame from
  frame one to the end card and never animates it. It is there so a viewer
  arriving three seconds in — which on these platforms is most of them —
  knows what they are watching. Cheap, and the one device both references use
  that the earlier series did not.
- **A short, hard end card.** Both references stop dead and put up a card.
  Ours is about six seconds and carries all three asks: what is next, follow
  and share, and the engine.

What was **not** taken: the reference films are almost pure character acting,
which teaches nothing about strike and dip. These lean the way the brief asked
— characters carry the spine, labelled diagrams cut in when a structure has to
be *shown*.

## Drawing rule

> A structure is drawn by what it DOES to the layering, never as an icon of
> itself.

A fault is beds that no longer line up. A fold is beds that bend. A shear zone
is fabric dragged into parallelism. Drawn as symbols instead, the viewer
learns the logo rather than the thing, and then cannot recognise it in a real
outcrop — which is the only place it matters.

Two drawing defects this caught, both invisible to every checker because a
path has no bounds the staging check can see:

- **Joint sets escaped their own outcrop.** An angle is a direction, not a
  length, so the far end of every line ran hundreds of units past the rock it
  was supposed to be inside. `clipSegment` (Liang–Barsky) now clips a set to
  its `box`.
- **The shear zone drew a starburst.** Full-width curves with their ends swung
  up and down crossed each other and read as a sunburst — the exact opposite
  of the thing being taught. Foliation is a *fabric*: short marks, dense,
  where only the ORIENTATION varies. And the first version had the rotation
  inverted, steep in the middle and shallow outside; it is the rotation
  **into** parallelism that identifies a shear zone in the field.

## Two authoring traps worth knowing

**`for` on a pose is the transition span, not a hold.** `{do:'pose',
pose:'ask', at:0.3, for:0.6}` does not gesture for 0.6 s — it takes 0.6 s to
move into the pose and then holds it forever. That is why the two-handers in
the earlier series stand with an arm extended across frame for the rest of the
scene. `gesture()` poses in, holds, and poses back.

**The forearm is a child of the arm, so rotations compound.** `armR: -0.62`
with `foreR: -0.52` puts the forearm about 65° off vertical, which at
two-shot spacing reaches straight through the other character. The poses here
keep the forearm near the body.

**A board's parts start invisible every time it is cast.** `castBoard(…,
{alpha: 1})` makes the cast member opaque and does nothing for the parts
inside it. So the banner, which is cast into every scene, is authored at
`alpha: 1` — a reveal in scene one does nothing for scene two, and the first
version of this series had a banner that appeared once and vanished.

## Building and rendering

```bash
node scripts/make-structure.mjs                 # all six, both languages
PART=3 node scripts/make-structure.mjs          # one part, both languages
LANG=sw node scripts/make-structure.mjs         # one language, all six
PART=2 LANG=en node scripts/make-structure.mjs

FILM=films/structure/en/part-03.json node scripts/check-film.mjs
ROOT=. FILM=films/structure/en/part-03.json AT=4,40,90 OUT=out/s \
  node scripts/grab2d.mjs

# one film
FORMAT=mp4 FILM=films/structure/en/part-01.json \
  OUT=out/structure/rock-en-01.mp4 WIDTH=1080 HEIGHT=1920 npm run produce
```

Check before spending a render. This series is narration-led, so the pacing
report is the point.

All twelve MP4s land in **one directory**, `out/structure/`, named
`rock-<lang>-<nn>.mp4`. A render runs faster than real time — about 25 s of
encoding for a three-minute film.

### Rendered runtime is shorter than authored runtime

Expect it. `meta.estimatedTiming` is true, so `retimeToAudio` re-fits every
shot to the audio that actually exists and may *shrink* as well as grow.
Part one English is authored at 3:10 and renders at **2:47**, because Piper's
`en_GB-alba-medium` speaks faster than the 150 wpm the estimator assumes. The
authored number is a scaffold for the action schedule; the rendered number is
the film.

## Content, and its limits

The geology is conventional and the specifics are Tanzanian: the Archaean
greenstone belts of the Lake Victoria Goldfield — Geita, Bulyanhulu, North
Mara, Buzwagi — are orogenic gold hosted in shear zones, which is why part
four is the one that matters commercially.

Four things are deliberately careful rather than confident, and each is said
out loud in the narration rather than only in a comment:

- **A quartz vein is not gold.** Most quartz veins carry none. Part 1 says so
  in the same breath as telling you to follow them, and part 6 returns to it.
- **A shear zone is not a promise.** It says where to look, not what you will
  find. Most carry nothing.
- **Panning finds DENSE minerals.** Gold, garnet, zircon, sapphire — not
  emerald or the other beryls, which are no denser than the quartz they travel
  with. Someone panning for beryl would conclude the ground is empty when it
  is not.
- **Licensing stays general.** "Get one, from the mining authority" — no
  procedure, no fee, because those change and a confident wrong number in a
  video does more harm than none.

Faulted ground is bad ground, and part 3 spends a whole shot on it rather than
burying it inside another line. Part 6 ends by saying in as many words that
the series is general education, not legal, safety or valuation advice.

## What is weak

- **The two-handers are still the weakest pictures**, as they are in
  `28-MADINI-YA-VITO.md`. The gesture fix stops arms crossing the frame; it
  does not make the generated cutout rig act.
- **Nothing is drawn by hand.** Every frame is assembled from primitives.
- **Line coverage is an estimate**, and of a different quantity from the
  speech ratio `narration-pacing.mjs` measures. After a render that tool is
  still the ground truth, and it has not been run over these twelve.
- **The Swahili cast is one model in three hats.** Piper has a single Swahili
  voice, so Asha, Kitwana and Rajabu are separated by rate and pitch alone.
  They read as three people; they do not read as three *voices*. Recasting on
  `VOICE_BACKEND=voicestudio` is the fix and is one environment variable away.
- **VoiceStudio was not usable on the machine this was built on.** It is
  installed and its Electron shell runs, but its Python backend never
  provisioned, so nothing ever listened on 3900. The bundled `uv` at
  `Contents/Resources/tools/uv` works, so the provisioning step is the thing
  to look at if it is tried again.
- **Line coverage was checked, loudness was not.** `narration-pacing.mjs` has
  not been run over the rendered MP4s, and it is the ground truth for speech
  ratio.
