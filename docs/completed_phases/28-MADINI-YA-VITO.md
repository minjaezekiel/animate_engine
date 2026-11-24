# Madini ya Vito — a Swahili gemstone series

Six parts, 1080×1920, about two and a half minutes each, on how gemstones
form and how an ordinary person can look for them. Swahili throughout.

The brief behind it was commercial: the previous series scored ~100 views on
Instagram and TikTok and ~250 on Facebook, and the question was how to present
the content better. `27-RETENTION.md` is the engine's answer to that question;
this is the series built against it.

## The parts

| | | |
|---|---|---|
| 1 | **Kito cha sehemu moja** | Tanzanite: the stone found in one place on Earth, and why |
| 2 | **Viwanda vitatu** | The three environments that make every gem |
| 3 | **Mto unakuambia** | Why to start at the river, and the five places gems collect |
| 4 | **Dalili za ardhini** | Host rocks, companion minerals, and the Tanzanian districts |
| 5 | **Vipimo vinne** | Hardness, density, light and streak — with no laboratory |
| 6 | **Usidanganywe** | Rough against cut, the three tells of glass, and selling |

Each part opens a loop and closes it; part 6 closes the series' loop back to
part 1. Every part ends with a five-second card, because retention falls off a
cliff once the point lands.

## Three structural decisions

**The hook comes before the title.** Measured against the reference
narration, every opening that holds front-loads speech and does not pause. So
the first line plays over the picture from 0.3 s and the title plate arrives
*under* it four or five seconds later, by which time the viewer has decided to
stay. Measured across the six parts: the hook window runs **83–93 %** covered,
and the first word lands at **0.3 s** in all six.

**The narration is written first and the picture follows it.** `fitShots`
derives every shot's duration from the line it carries plus the last thing
that moves — never the other way round. This is the direct fix for the defect
`27-RETENTION.md` names: the geology series set its shot lengths before the
narration was written and left roughly a fifth of its runtime silent. The six
parts here run **82–85 % line coverage**, against 70–82 % for the geology
parts and 63 % for the worst of them.

**Every line is on screen.** Most viewers watch muted, which is the single
most consistent finding in the retention sources. The subtitle sits at
`bottomMargin: 372` — 1548 of 1920 — clear of the phone UI rail.

## The cast, and the voice

A different voice from *Finding Gold*, and not by preference: that series was
narrated by `en_GB-alba-medium`, and this one is Swahili, which in the Piper
catalogue means `sw_CD-lanfrica-medium` — **the only Swahili model, 1 of 119**,
checked against the catalogue's own path map rather than assumed.

Three characters share it and are separated by delivery (`26-DELIVERY.md`):

| | preset | rate | pitch | |
|---|---|---|---|---|
| **Nuru** | `host-sw` | 1.06 | 1.10 | field geologist, carries the narration |
| **Bakari** | `young-m-sw` | 1.10 | 1.16 | asks the question the viewer is thinking |
| **Mzee Hamisi** | `elder-m-sw` | 0.86 | 0.84 | experience rather than instruction |

Nuru is given a delivery of her own rather than the model default, so she does
not read as "the narrator preset" either.

## What the series measured

Building it produced two first-party measurements worth keeping.

**Swahili speech length is predicted by syllables, not words.** Synthesising
all 21 lines of part one and comparing with their real audio durations:

| basis | mean | line-to-line variation |
|---|---|---|
| words per minute | 147 | 11 % |
| characters per second | 16.1 | 6 % |
| **syllables per second** | **6.50** | **5.6 %** |

Swahili orthography is very nearly phonetic, so every vowel letter is a
syllable nucleus and counting vowels counts syllables. Word count is a poor
predictor because Swahili word length varies so much — `tu` and
`kinachopatikana` are both one word. `pacing.js` now uses syllables for
Swahili and says which basis it used; mean absolute error on the worst lines
falls from 18 % to 8 %. English keeps words, because English spelling is not
phonetic and no measurement justifies a syllable figure there.

**A render must not depend on a 63 MB download.** The first Swahili render
died with "Target closed" during `voice model: 0%` — the tab crashed before a
frame was drawn. `vits-web` caches models in OPFS and a headless render
launches a *fresh* profile, so that cache is empty every run and every render
re-downloads the whole model. `npm run vendor-voice` fixes it; the render that
crashed now finishes in **20.9 seconds**.

## Content and its limits

The geology is conventional and the specifics are Tanzanian: tanzanite is the
blue-violet variety of zoisite coloured by vanadium, hosted in Neoproterozoic
metasedimentary gneisses in the Merelani Hills and commercially mined nowhere
else; Longido is ruby in green zoisite; Umba, Winza, Mahenge, Songea and
Tunduru are the other well-known districts; all of it sits in the Mozambique
Belt. Quantities given in narration are stated as approximations — "about
twenty kilometres", "around six hundred degrees" — because they are ranges.

Three things are deliberately careful rather than confident:

- **Treatment is not fraud.** Heating tanzanite to bring out the blue is
  routine, ancient and legal; the only requirement is disclosure. Part 6 says
  so outright rather than implying every treated stone is a cheat.
- **Licensing stays general.** "Get one, from the mining authority" — no
  procedure, no fee, because those change and a confident wrong number in a
  video does more harm than none.
- **The panning caveat is said out loud.** A pan concentrates *dense*
  minerals, so it finds garnet, zircon, sapphire and spinel and does **not**
  find emerald or the other beryls, which are no denser than the quartz they
  travel with. Someone panning for emerald would conclude there is nothing
  there. This is in the narration, not only in a comment.

Part 6 ends by saying in as many words that the series is general education,
not legal or valuation advice.

## Building and rendering

```bash
node scripts/make-vito.mjs                 # all six
PART=3 node scripts/make-vito.mjs          # one

FILM=films/vito/part-03.json node scripts/check-film.mjs
ROOT=. FILM=films/vito/part-03.json AT=4,30,60 OUT=out/v node scripts/grab2d.mjs

npm run vendor-voice                       # once: the local Swahili model
FORMAT=mp4 FILM=films/vito/part-03.json \
  OUT=out/vito/madini-03.mp4 WIDTH=1080 HEIGHT=1920 npm run produce
```

`grab2d` now renders subtitles, which it could not before: they are attached
in `studio.js` at render time rather than by the compiler, so a posed scene
had an empty subtitle node and there was no way to check the words were inside
the frame without a full render.

## What is weak

- **The two-hander scenes are the weakest pictures in the series.** They use
  the generated cutout rig, which is the same clip-art silhouette problem
  `21-DRAWN-ANIMATION.md` records; the diagram scenes carry the series.
- **Nothing here is drawn by hand.** `draw.html` exists and the rig supports
  `part.strokes`, but every frame of this series is assembled from primitives.
- **Line coverage is an estimate**, and of a different quantity from the
  speech ratio `narration-pacing.mjs` measures. After rendering, that tool is
  still the ground truth and has not been run over these six.
