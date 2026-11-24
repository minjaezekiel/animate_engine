# `digest` on the 2D path

**Phase 42. Done.** The first item to graduate out of the audit
([../pending/37-MISSING-TOOLS.md](../pending/37-MISSING-TOOLS.md)), where it
was ranked first on value over cost.

## Why it was first

Phase 39's central measurement: **~85% of the tokens spent building a film
went on *looking* at it** — fourteen screenshots at ~2,000 tokens each against
~2,400 for eight structured check runs. And continuous vision would be worse,
not better: a 1 fps stream of a 65-second film is ~130,000 tokens to watch it
once.

The answer was to make the engine answer in numbers, and `digest.js` did
that — for the 3D path only. **Fifty of the fifty-one finished films in this
repo are 2D.** The cheapest check in the engine was unavailable to almost all
of its output.

## What had to be new, and what did not

Almost nothing. `digest.js` is arithmetic over `{ id, visible, box, luma,
hue }` rows and does not care how the box was arrived at. 3D projects eight
bounds corners through a camera; 2D reads a world matrix and a measured
extent — which `staging.js` has done since the first staging check, because
the off-frame warning is exactly that box against exactly that frame.

So `src/core/script/digest2d.js` is the **subject rows** for a posed 2D
scene, and everything downstream — the format, the findings, the token
budget — is shared. `cameraAt` was made an export rather than copied; a
second copy of the zoom convention is a second place for it to drift.

One thing moved the other way: the modal-hue pass was inline in
`film3d.html` and is now `dominantHue` in `digest.js`, so both paths get the
same answer from the same code.

## What 2D reports that 3D cannot

**The framing, read in heads.** `FRAMINGS` is defined in head heights, not in
coverage, because a close-up crops the body and a body-based ratio stops
meaning anything exactly where it is needed most. So a 2D digest says:

```
t=17.25 h3 luma=0.24 [0.04..0.829] hist=20/74/0/1/5/0
  framing: mara head=6.6% of frame height, reads "wide"
  mara: box=28,63,35,100 cover=2.5% luma=0.247 red CLIPPED
```

An agent reading that can tell a close-up from a wide **without being told
which was intended**, which is what makes it a check rather than a report.

**Every string on screen, from the scene itself.** 3D reads these off the
overlay draw list; 2D's type is scene nodes, so this walks for visible text —
which also catches a board caption or a title card that no subtitle track
knows about. Subtitles are attached at render time rather than by the
compiler, so the digest attaches them too; a digest blind to the caption
would be blind to the one thing on screen that is already language.

## The defect found while building it

A cast root exists for **every scene at once** — `scenes.*.cast` compiles into
one graph — so the first run reported the same two characters five times, four
of them `off`. True, and four rows of noise per sample in a format whose whole
purpose is to be cheap to read. `subjectsAt` now takes the shot's `sceneId`,
the same filter `analyseStaging` applies for the same reason.

And the framing line measured `rows[0]`, whoever happened to be first in the
graph. It now measures the shot's declared `on`, falling back to the first
character actually on screen.

## Measured

The demo film: **19 shots, 120 seconds, 4,227 characters ≈ 1,200 tokens**,
including every subtitle in full. Nineteen screenshots would be ~38,000 — so
about **32× cheaper**, and the subtitle text is most of what remains.

```bash
FILM=demo/film.json npm run digest2d
FILM=demo/film.json AT=3,12.5 npm run digest2d
```

Exit code is the finding count, like `check-film`. Over MCP: `digest_film`.

## What it does not replace

`grab2d`. Sorting Phase 39's 24 defects by what caught them is the whole
argument: **structured checks caught everything geometric, temporal and
typographic; screenshots caught everything about material and light.** Run
the digest first, every time, and grab a frame when it says something that
needs a picture.

## Proof

11 unit tests in `test/core/digest2d.test.mjs`, in Node with no browser —
which is the point of putting the geometry in core. The boxes, the scene
filtering and the framing bands are arithmetic over a posed scene; only the
pixels need a canvas.
