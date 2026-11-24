# Game Physics — collisions, for people who build games

Seven parts, 1080×1920, English, about three minutes each, on the collision
maths that makes a game world feel alive. **All seven are built and
rendered**, between 2:48 and 2:57 each.

The brief: the audience is beginner game developers on TikTok, Reels and
Shorts. So each part teaches one layer of a real physics step, shows it as a
picture before it shows it as a formula, and ends by opening the next part.

## The parts

| | | runtime | |
|---|---|---|---|
| 1 | The secret behind every collision | 2:56 | velocity, momentum, the normal, restitution |
| 2 | Did they even touch? | 2:52 | circle and box tests, tunnelling, the separation push |
| 3 | Which way did it hit? | 2:57 | normals, unit vectors, the dot product, reflection |
| 4 | One line does every collision | 2:47 | the impulse, derived — and parts 1 and 3 fall out of it |
| 5 | Bounce, and grip | 2:54 | restitution, e², the jitter bug, Coulomb friction |
| 6 | Spin | 2:48 | ω, moment of inertia, the contact point, the completed impulse |
| 7 | Build the whole thing | 2:52 | the loop, the fixed step, the order, four games |

### The spine that holds the seven together

Three devices, used deliberately rather than as decoration:

- **The six-step list** appears in every part with the steps earned so far
  lit and the rest dimmed. A viewer who drops in at part five can see where
  they are in ten seconds.
- **Colour means the same thing in all seven parts.** Cyan is velocity,
  amber momentum, magenta the normal, violet the tangent, green
  restitution, orange spin. See `GAME_PALETTE` in `scripts/lib/physics.mjs`.
  It is the series' one real teaching device besides the narration.
- **Payoffs run backwards, not only forwards.** Part 4 derives part 1's
  "the cue ball stops dead" and part 3's reflection formula out of the same
  impulse line, and part 6 then shows that part 4's denominator was
  incomplete. A series that only ever opens loops never pays any off.

Part 1 opens a loop in its first eight seconds — Bolt claims he will *stop
dead* when he hits Nova — and closes it at 1:50 with the collision normal.
`27-RETENTION.md` rule 6, and it is the only reason the middle of an
explainer is worth reaching.

## The cast is not human, and that is the whole technical story

Every earlier series casts `generate` humanoid rigs. **Bolt and Nova are
billiard balls and Vector is a floating robot**, so all three are authored as
explicit `parts` + `mouth` + `poses` characters. `compile.js` has always
supported that path — `characterParts` returns `char.parts` when they exist —
but nothing in the repo had ever used it for a character that *talks*, so
these are the first, and they found four things the engine was missing.

| | role | voice | Piper model |
|---|---|---|---|
| **Bolt** | the cue ball; confident, fast, wrong first | `warm-m-us` | `en_US-hfc_male-medium` |
| **Nova** | the five ball; dry, curious, asks what the viewer is thinking | `narrator-f-en` | `en_GB-alba-medium` |
| **Vector** | the guide; measured, explains | `narrator-m-en` | `en_GB-alan-medium` |

Three genuinely different **models**, and deliberately three different
accents — American, RP, Scottish. Unlike the Swahili half of
`30-STRUCTURE-SERIES.md`, nothing here is faked out of rate and pitch: the
only delivery number in the series is Bolt's rate of 1.06, and that is
characterisation rather than a workaround for a one-voice catalogue.

```bash
VOICE_BACKEND=piper        node scripts/make-physics.mjs   # default
VOICE_BACKEND=voicestudio  node scripts/make-physics.mjs   # cloned voices
```

All three models are vendored, so a render does not depend on huggingface.co:

```bash
VOICE=en_GB-alba-medium       npm run vendor-voice
VOICE=en_GB-alan-medium       npm run vendor-voice
VOICE=en_US-hfc_male-medium   npm run vendor-voice
```

### A ball has no arms, so the acting is brows, squash and spin

There is no `armR` to swing, and therefore none of the forearm-compounding
trap `30-STRUCTURE-SERIES.md` documents. What a ball has instead:

- **Brows** — one path each, rotated and raised. `rot` mirrored across the
  pair is the one expression everybody reads the same way: inner ends down is
  determination on Bolt and scepticism on Nova.
- **Squash** on impact, **stretch** along travel.
- **A mark that spins.** Bolt's lightning and Nova's white 5 are drawn
  *off-centre* on a node whose **pivot is the ball's centre**, so rotating
  the node orbits the mark around the ball while the face stays upright.
  That is the cartoon convention and the only way a ball with eyes can spin
  without the eyes going with it.

### Eyes blink by shape SWAP, not by squash

`generate.js` makes the same choice for the humanoid blink and says why:
squashing a node whose geometry carries its own position pulls it toward the
parent's origin instead of closing it. On a ball that origin is the middle of
the face, so a scaled eye slides into the nose.

The glint is a **child** of the eye, and a shape swap on a parent leaves its
children alone — so a blink has to take the glint down too. A white dot left
floating on a closed eye is the one thing that reads as a bug.

## Seven features this series added to the engine

Per the standing rule: an animation that hits an engine limit ships the
feature that removes it. All four are additive, tested, and change no
existing film.

### 1. `pose` now ramps from where a part actually is

`writeChannel` ramped from `lastValueBefore(...) ?? defaultChannel(channel)`,
and `defaultChannel` is 1 for `sx`/`sy` and **0 for everything else** — it did
not know the part's authored `at`. So the first pose in a scene that ramped a
brow's `y` slid it up from y=0, which on these rigs is the middle of the ball.

`move` had always read the scene for this (`?? scene.get(rootId)?.transform.x`).
Now `pose`, `reach` and `grip` do too, via `authoredChannel`.

**No existing film changes.** Audited: every pose channel in the repo is
`rot`, `sx`, `sy`, or `y` on `hips` — and `hips` is generated with no `at` and
no `pivot`. For all of those the authored value already equals
`defaultChannel`, so the fallback never fires differently.

### 2. `squash` — squash and stretch, as a verb

```json
{ "target":"bolt", "do":"squash", "at":1.6, "for":0.1, "amount":0.2, "back":0.24 }
```

The oldest principle in animation and the engine had no way to say it.
Hand-authoring it takes six `set` keys, and every one has to carry the node's
**absolute** scale — a cast entry's `scale` writes `sx`/`sy`, so "20% wider"
is `scale * 1.2` and the author has to know `scale`. Getting that wrong
silently resizes the character for the rest of the film.

Now the base is read from the node, so `amount` is the only number. Negative
stretches. `part` targets a sub-node.

Volume is conserved as `sy = base / (1 + amount)` rather than
`base * (1 - amount)`, so the ellipse's area is unchanged — which is what
makes a squash read as the same object deforming rather than a smaller one.

### 3. `spin` — continuous rotation, in whole turns

```json
{ "target":"bolt", "do":"spin", "part":"mark", "at":0, "for":2, "turns":3 }
```

`set transform.rot` can do this in two keys, but only if the author converts
turns to radians and remembers that `ease` must be `linear` — `smooth` puts a
hesitation at each end of the ramp, which on a rolling ball reads as a
stutter rather than as rotation. Both are mistakes worth making impossible.
The rotation is relative, so a second `spin` continues from the first.

### 4. `prepare({ skipVoices })` actually skips the voices

`grab2d.mjs` has passed `skipVoices: true` since it was written and
**nothing read it**. So grabbing a single still ran the entire voice
pipeline: on a thirty-six line film, minutes of TTS to draw a picture that
contains no sound. Adding the SFX assets made it worse — it then also
fetched and decoded six WAVs per frame — and the tool stopped completing at
all.

`prepare` now honours it: no audio assets, no synthesis, no mix, and no
retime (there are no audio durations to retime against, which also means a
still is posed at the **authored** time rather than the rendered one).

Measured on this film: **a two-frame grab went from not finishing to 2.4
seconds.** `renderFilm` does not pass the flag, so rendering is unchanged.

This is the one fix here that pays back on every film in the repo, because
looking at a frame is the only check that catches a picture being wrong —
which is the whole argument of `grab2d`'s own header, and which three
defects in this film proved again.

### 5. `count` — a numeric readout that ramps

Parts 2 to 6 are about *numbers*: a distance that falls to zero as two
circles touch, a vector length that falls to one, a dot product, a step size
that is too big. Text cannot be interpolated, so the only way to say this
before was one `set props.text` per displayed value — forty keys for a
two-second count, hand-written, with the easing applied by the author.

```json
{ "target":"board", "part":"dist", "do":"count", "at":0.4, "for":1.2,
  "from":360, "to":180, "decimals":0, "suffix":" px" }
```

The value is eased as a *number* and then formatted, so `ease` means what it
means everywhere else. Sampling is at the timeline's frame rate, because a
key between two frames cannot be seen. Then consecutive duplicates are
dropped, which is what makes it cheap rather than merely correct: counting 0
to 5 at no decimal places over two seconds is **six** keys, not forty-eight.

### 6. `shift` — move a part BY an offset

A board part's authored `at` *is* its `transform.x`. So "move it 170 left"
written as `set transform.x -170` teleports it to the left edge of the
frame, and the author has to look up the authored coordinate and do the
arithmetic by hand. Getting it wrong moves the element somewhere plausible
rather than somewhere obviously broken, so nothing reports it — this bug is
how part 2's second circle vanished off the side of its own diagram.

```json
{ "target":"board", "part":"ball", "do":"shift", "by":[-170,0],
  "at":0.3, "for":1.2 }
```

Relative, like `spin`, and from the same two sources in the same order: the
node's last keyed value, or failing that its authored position. Two shifts
in a row compose.

### 7. A part's `rot`, `sx` and `sy` are no longer "unrecognized"

`compileFilm` has always read all three off an authored part. The validator
did not know them, so a part authored at an angle worked perfectly and
reported itself as a mistake on every build. Found by `distanceParts`, whose
measured span has to be drawn along its own +x and then turned so that
scaling it shortens it toward one end rather than toward the frame's origin.

### 8. `revealTo` — revealing a part to its own alpha

Not an engine change but a series helper worth naming, because it came from a
rendered defect: `reveal` ramps alpha to **1**, so the pool table's spotlight
— four ellipses authored at alpha 0.05 — came up as a **solid white disc
covering the table**. A faint part cannot be revealed by the generic helper.
`revealTo` takes `[id, alpha]` pairs so the target value travels with the
part instead of being restated at the call site.

`test/core/squash.test.mjs` covers 1–3: twelve tests, including that the
scales keep their old defaults so no existing film moves.

## Pacing

Narration first, shot lengths derived from it. `27-RETENTION.md` rule 3.

| | this series | the earlier ones |
|---|---|---|
| tail pad | **0.5 s** | 0.85 s |
| shot floor | **2.4 s** | 2.6 s |
| first shot's pad | 0.2 s | 0.2 s |

The pad is tighter because the measured defect was slack — our films ran 54%
speech against the references' 73% — and because fast cutting is what this
subject looks like when it is done well. The floor is lower so a deliberate
two-beat ("Same rules. Different game.") is not padded into three seconds of
silence.

Measured by `check-film` on the built film:

```
1080x1920 @ 24   184.59s = 4430 frames  (3:05)
85% line coverage · 36 lines in 36 runs · 129 words/min of runtime
hook 88% from 0.5s · longest gap 1.8s · tail 0.5s · 64 audio cues
```

No warnings. The **rendered** runtime comes in shorter, because
`meta.estimatedTiming` is true and `retimeToAudio` re-fits every shot to the
audio that actually exists; Piper speaks faster than the 150 wpm the
estimator assumes. The authored number is a scaffold for the action
schedule; the rendered number is the film.

**Rendered: 2:56** (176.17s), 1080×1920 H.264/AAC, 28.3 MB, in 25 s of wall
clock — comfortably faster than real time. 100 audio cues (36 lines, 64
effects) and 576 viseme keys, with no warnings in the render log.

A first cut authored at 3:12 rendered at **3:02** — over the brief's three
minutes. Note the ratio: 0.95, not the 0.88 the structure series showed. The
shrink depends on the voices, so it is not a constant you can budget
against; the only way to land a runtime is to render and look. Getting from
3:02 to 2:56 took cutting one beat, tightening four lines and dropping the
pad from 0.50 to 0.46.

## Sound

`scripts/make-sfx.mjs` synthesizes six cues to `films/physics/sfx/` — click,
impact, whoosh, pop, tick, riser. Written rather than sourced, for the reason
`make-music.mjs` gives: a film in this repo should be renderable by anyone who
clones it, and that rules out anybody else's recording. Pure maths to 16-bit
PCM, fixed seed, no dependencies.

```bash
npm run make:sfx        # films/physics/sfx/ is gitignored; this is the source
```

The set is small and functional — one sound per thing that actually happens
in the picture — because on a muted-by-default feed sound is not what carries
the information. The subtitles do that. Sound is most of what makes a video
feel *produced* rather than assembled, and almost none of what makes it
understood.

Everything is mixed to sit under the narration: peaks of 0.18–0.5 before the
cue gains take them lower again. The voices are the film; these are
punctuation.

**A shot carries `sfx: [['click', 1.62]]` and `liftSfx` turns it into
scene-level `audio` cues.** A cue's `at` is measured from its scene's start,
but a sound belongs to a moment in a *shot*. `liftSfx` must therefore run
**after** `fitShots`, since it sums the durations `fitShots` derives — run
first, it puts every cue after the first in the wrong place, and nothing
reports it. Audio has no staging check, and a sound 400 ms late still sounds
like a sound.

`produce.mjs` now serves `.wav`, `.mp3` and `.ogg` with real media types. They
decoded before only because `decodeAudioData` sniffs the bytes rather than
trusting the header.

## What was cut from the supplied script, and why

The brief was 2–3 minutes; the supplied script runs 4:20.

**Scene 6, rotation and moment of inertia, is cut.** Two reasons pointing the
same way: the script's own director's notes say "for the simplest
billiard-ball collision model, you can initially ignore spin and treat the
balls as smooth circles", and the episode table already gives spin a
dedicated Part 6. It is not lost, it is placed. What survives is a two-line
tease — Bolt asks "what if things spin?" — which keeps the seven-item framing
honest and plants the later part as a dimmed seventh row.

Scene 7's seven narrated steps became six rows that build while three lines
play over them, and Scene 8's six games became a grid rather than six beats.

## The physics, and where it is conditional

Every claim is true *under stated conditions*, and the conditions are said
out loud in the narration rather than only in a comment. Collisions are a
topic where the unconditional version is simply wrong.

- **The cue ball stops dead.** Only for equal masses, a head-on hit, and a
  perfectly elastic collision; then the two exchange their normal-direction
  velocities. The narration states all three in one breath — "equal mass,
  dead straight, no energy lost". Real billiards is e≈0.95 with spin and
  friction, so a real cue ball dribbles forward. This is the most memorable
  result in the film and the one most often repeated without its conditions.
- **The collision normal** for two circles is the line joining the centres at
  contact. Exact, not an approximation.
- **The tangential component is unchanged** only for frictionless, smooth,
  non-rotating bodies. The narration says "for smooth balls"; friction and
  spin are Parts 5 and 6.
- **Restitution** `e` is the ratio of relative normal speed after to before.
  `e = 0` leaves the pair with no relative normal velocity — which is *not*
  "both stop", a distinction the on-screen text keeps by saying "no bounce at
  all".

## Restitution is a ratio of speeds, so height goes as e²

`bounceParts(e)` draws the return apex at `h · e²`. It used to draw `h · e`.

Kinetic energy goes as v², and so does the height a given speed buys, so a
ball with e = 0.8 returns to 64% of its drop and not 80% — which is the
single most common mistake made about restitution and the subject of a whole
scene in part 5. A figure in the same series quietly drawing `h · e` was
teaching the mistake in the margin while the narration corrected it in the
middle.

Part 1's three arcs are labelled e = 1, e = 0 and 0 < e < 1, where the square
changes nothing, changes nothing, and lowers the middle arc to where it
should always have been. No caption in either part claims a height, so the
fix makes the drawing right without making any line wrong. Both films were
re-rendered.

There is deliberately no second parameter for "height ratio": two ways to
say the same thing is how the two drifted apart in the first place. A caller
who wants a literal height ratio passes `e: Math.sqrt(ratio)` and says so.

## Drawing rule

> The normal is drawn as the line **through both centres**, always, and the
> tangent as the line perpendicular to it **at the contact point**.

Never as a free-floating arrow off the side of a ball. A viewer who learns
the arrow learns a logo; a viewer who learns "centre to centre" can find it
in any collision they ever look at, which is the only place it matters.
`normalParts` therefore **derives** both lines and the contact point from the
two centres rather than taking them as parameters — it is not possible to
author that diagram wrong.

The same principle drives the palette: one colour, one quantity, across all
seven parts. Cyan is velocity, amber is momentum, magenta is the collision
normal, violet is the tangent, green is restitution, orange is spin. A viewer
who has watched Part 1 should read magenta as "normal" in Part 4 without
being told again.

## Three defects only a rendered frame could catch

All three passed `check-film` with no warnings. None is visible in the film
JSON. This is the argument for `grab2d.mjs`, restated.

1. **The spotlight was a solid white disc.** `reveal` ramps to alpha 1, and
   the light pool is authored at 0.05. The table was invisible underneath it.
   Fixed by `revealTo`.
2. **Two scenes played a four-second line over an empty frame.** The `build`
   scene raised only its heading before the rows arrived in the *next* shot,
   and the `next` scene left the code panel standing empty for eight seconds
   — exactly where the hook for Part 2 lives. Both now put the empty
   containers up first and fill them.
3. **"NEXT" ran through the end card's title.** A 56px title on a 66px line
   height, centred on `at.y`, puts a *two-line* block 66px above its anchor.
   A multi-line text part has to be placed from the top of the block it will
   occupy, not its middle.

And one that only a second look caught: `reveal` ramps **from 0**, so
re-revealing an already-visible part blinks it off and back on. The step rows
and the bounce floors are revealed once and then skipped with `.slice(1)` and
`.filter`.

## Building and rendering

```bash
node scripts/make-physics.mjs                      # every authored part
PART=1 node scripts/make-physics.mjs

FILM=films/physics/part-01.json node scripts/check-film.mjs
ROOT=. FILM=films/physics/part-01.json AT=3,52,110,150 OUT=out/physics/grab/x \
  node scripts/grab2d.mjs

FORMAT=mp4 FILM=films/physics/part-01.json \
  OUT=out/physics/collisions-01.mp4 WIDTH=1080 HEIGHT=1920 npm run produce
```

**Renders serialise themselves.** Two headless Chrome instances at once — a
render beside `test:e2e`, say — used to get one of them killed with
`TargetCloseError: Target closed`, and because that can arrive *after* the
file is on disk it looked exactly like a broken film. `scripts/lib/render-lock.mjs`
is now taken by `produce`, `grab2d`, `narration-pacing` and the four heavy
e2e tests alike — the render that started this was killed by `test:e2e`,
not by another render, so a lock only `produce` respected would have let
exactly that happen again. A second job waits and says so rather than
fighting. `RENDER_LOCK=0` opts out on a
machine with the memory. Measured first — two 480×270 renders coexist fine
and one 1080×1920 render is fine alone, so the limit is memory, not the
design.

## Where the code lives

| | |
|---|---|
| `scripts/lib/physics.mjs` | palette, cast, banner, end card, subtitle style |
| `scripts/physics/shapes.mjs` | `roundRect`, `circlePath`, `arcPath` |
| `scripts/physics/common.mjs` | the rigs, the acting, part 1's figures, `fitShots`, sound |
| `scripts/physics/figures.mjs` | everything parts 2–7 needed and part 1 did not |
| `scripts/physics/part-0N.mjs` | one file per part |

`figures.mjs` is separate for one reason: part 1 is rendered and approved, so
the file it imports from should stop changing. It is re-exported through
`common.mjs`, so every part still has one import.

### `BAND` — the vertical layout, written down

The same mistake was made four times in one part: a caption at 1440, a
readout at 1430, a note at 1412, each of which looked fine in the source and
landed underneath the subtitles. The subtitle band is `height` minus the
style's `bottomMargin` of 372, and a two-line subtitle rises about 46px
above that, so **nothing a board draws may sit below 1430**. `BAND` in
`figures.mjs` names the rows above it.

### `blockAt` — a multi-line text anchors on its LAST line

`wrapText` lays a block out *ending* at the anchor: an N-line block occupies
`at.y − (N−1)·lineHeight` through `at.y`. This is how part 1's end card ran
its title through its own kicker, and how every comparison card in parts 2
and 3 printed its body over its own heading. Anything with a known line
count is now placed through `blockAt(top, lines, lineHeight)`.

Check before spending a render. This series is narration-led, so the pacing
report is the point rather than a footnote.

## Measured, after rendering

`node scripts/narration-pacing.mjs out/physics/collisions-0*.mp4` decodes
each finished film and measures the delivery off a 50 Hz energy envelope.
This is the ground truth that `check-film`'s line coverage only estimates.

| | speech | phrase | pause | onsets/s |
|---|---|---|---|---|
| 1 | 74% | 1.50s | 0.66s × 24.1/min | 1.73 |
| 2 | 74% | 1.60s | 0.60s × 24.3/min | 1.91 |
| 3 | 75% | 1.78s | 0.66s × 23.4/min | 1.81 |
| 4 | 75% | 2.06s | 0.90s × 21.4/min | 1.81 |
| 5 | 75% | 2.02s | 0.88s × 21.6/min | 1.95 |
| 6 | 76% | 2.60s | 0.98s × 18.8/min | 1.91 |
| 7 | 73% | 1.64s | 0.52s × 24.7/min | 1.80 |

**73–76% speech**, against the 73% `27-RETENTION.md` measured in the
references and the **54%** it measured in part one of the geology series.
The tighter pad and the 2.4s shot floor did what they were cut for.

### And the one thing the measurement does not like

The references **front-load**: 78–87% speech in their opening against
72–73% after. These films do the opposite — the hook measures *below* the
body in five of seven (62% in part 2, 66% in parts 3 and 5, against bodies
at 73–76%).

That is not the same defect `check-film` reports, which these all pass at
90–91%: coverage credits a line for its whole estimated span, and the
audio has the real gaps in it. The cause is that every hook here is
**acted** — a whoosh, a roll, a beat before the reaction — and those beats
are silent on purpose. Whether an animated hook should be held to a
talking-head's speech ratio is a genuine question and not one a tool can
answer. Recorded rather than quietly fixed; if retention data says the
openings are losing people, this is the first number to attack.

## What is weak

- **There is no music bed**, only effects. Three minutes of WAV is tens of
  megabytes and the engine has no looping audio cue, so a bed would have to
  be synthesized at full length. Worth doing; not done.
- **10 to 16 scenes in under three minutes** is more cutting than
  `27-RETENTION.md`'s "~10 scenes in 2:30" suggests. Deliberate — this is
  motion graphics, not a field guide — but it is a departure from the
  measured guidance, not an endorsement by it.
- **Line coverage is an estimate**, and of a different quantity from the
  speech ratio `narration-pacing.mjs` measures. After a render that tool is
  the ground truth, and it has not been run over this film.
- **Nothing is drawn by hand.** Every frame is assembled from primitives.
- **Nobody has watched these with sound.** Every board was verified from
  still frames, every container probed, and `narration-pacing.mjs` measured
  the delivery off the decoded audio of each finished MP4 — but the Chrome
  extension is not connected in this environment and no human has played
  them back.
- **`squash` and `spin` are 2D only.** `compile3d.js` has its own action
  switch and did not get them.
- ~~`npm run test:av` fails~~ **fixed.** The probe looked for its 1 kHz
  click above an absolute 0.9, and voice loudness matching legitimately
  brings the synthetic provider down by 10.3 dB, so the click arrived at
  0.289 and the one check that proves A/V alignment had been failing ever
  since. The pipeline was right and the ruler was stale. The click is now
  found relative to its own window's peak, which survives any gain the
  chain applies; the measured separation (2.71× in the mix, 2.66–2.86×
  after muxing) is printed and asserted, so an erosion of it fails loudly
  instead of making the test pass by luck. Both encoders pass: the click
  lands at 0.007 s on the paced WebM path and **0.000 s on MP4**, which is
  the path all seven films use.
