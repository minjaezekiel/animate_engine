# SUN AND SKY — sixty seconds, full power

The script. Written first, executed from it, and kept so the film can be
checked against what it was meant to be.

## The characters

The brief was Goku and Luffy in Gear 5. This engine builds characters from a
closed kit — four jaw shapes, five eye shapes, a list of hair styles — so it
cannot draw Toriyama's or Oda's linework, and calling the output by their
names would be a lie about what came out of it.

What it *can* do is the design language, which is what makes a fight read at
all. From the reference:

| | reference | here |
|---|---|---|
| the martial artist | bright orange gi, deep blue undershirt and boots, spiky black hair; the silhouette plus the orange is enough to recognise him at a glance | **SORA** — orange gi, blue boots, spiky black hair, hard angled brows |
| the pirate, awakened | stark white flame-like hair, white clothes, a constant joyous grin, rubbery exaggerated "toon force" motion | **TAIYO** — white flame hair, white coat, wide eyes, permanent smile |

The contrast is the test. One fighter is crisp and grounded; the other is
elastic and absurd. "Toon force" is squash-and-stretch and exaggeration under
a different name, which makes this brief a direct exercise of the principles
work.

**Abilities to show.** Sora: speed, a rising aura that turns his hair gold,
and a two-handed beam. Taiyo: limbs that stretch the width of frame, a body
that absorbs hits by deforming, and a giant inflated arm.

## Setting

A hillside at dusk. Open ground and a clear horizon — nothing to read but the
two figures, which is correct for a fight and keeps the eye on the animation.

## Rhythm

Twenty-three shots in sixty seconds: **2.6 s a shot**, against 5.5 s for the
dialogue reference. The cut rate *is* the genre. Long holds are saved for the
charge and the final beat.

Four lines of dialogue, widely spaced. A fight that talks through itself
stops being a fight.

## Shots

| # | id | dur | framing | beat | principle |
|---|---|---|---|---|---|
| 1 | `01-clash` | 3.0 | wide | Open mid-collision. They meet, shockwave, hard shake. No establishing. | timing |
| 2 | `02-sora` | 2.0 | close Sora | Teeth bared. He drives forward. | appeal |
| 3 | `03-combo` | 2.5 | medium Sora | A punch combo; forearm and hand trail the upper arm. | **overlap** |
| 4 | `04-taiyo` | 2.0 | close Taiyo | Taking it on a forearm, grinning. "Is that everything you've got?" | appeal |
| 5 | `05-stretch` | 3.0 | wide | Taiyo's arm crosses the whole frame. Volume held as it thins. | **squash/stretch, exaggeration** |
| 6 | `06-impact` | 1.5 | medium Sora | It lands. Hardest shake in the film. | timing |
| 7 | `07-skid` | 2.5 | wide | Sora carried backwards, digs in and stops. | **follow through** |
| 8 | `08-charge` | 3.5 | close Sora | Aura rises. Hair goes gold. "Not even close." | **anticipation** |
| 9 | `09-react` | 2.0 | close Taiyo | Eyes wide. Still grinning. | appeal |
| 10 | `10-rush` | 2.5 | wide | Sora leaves the ground and crosses in an arc. | **arcs** |
| 11 | `11-absorb` | 3.0 | medium Taiyo | Blows land; his body squashes and springs back. | **squash/stretch** |
| 12 | `12-giant` | 2.5 | wide | Taiyo's arm inflates and swings. | **exaggeration** |
| 13 | `13-duck` | 2.0 | medium Sora | Sora ducks; the arm carries past and keeps going. | **overlap** |
| 14 | `14-draw` | 3.5 | close Sora | Both hands drawn back. Light builds. The counter-move. | **anticipation** |
| 15 | `15-beam` | 3.0 | wide | It fires across the frame. | timing |
| 16 | `16-catch` | 3.0 | medium Taiyo | He inflates and bats it back. "My turn!" | exaggeration |
| 17 | `17-collide` | 2.5 | wide | Beam and fist meet. Everything shakes. | timing |
| 18 | `18-apart` | 3.0 | wide | Both thrown backwards along arcs. | **arcs** |
| 19 | `19-land` | 2.5 | wide | Both land. Compress, recover faster than they compressed. | **squash/stretch** |
| 20 | `20-rise` | 4.0 | wide | Standing. Breathing. "Then let's finish this." | **slow in/out** |
| 21 | `21-sora` | 2.5 | close Sora | Still gold. Settled. | solid drawing |
| 22 | `22-taiyo` | 2.0 | close Taiyo | Delighted. | appeal |
| 23 | `23-out` | 2.0 | wide | Two silhouettes. The light goes. | staging |

Sum: **60.0 s**.

Underneath every shot: breathing and blinking, running as their own clips —
**secondary action**, and the thing that stops a held pose reading as a freeze.

## Music

`demo/assets/battle.wav`, synthesized by `scripts/make-music.mjs` — D minor,
152 BPM, sectioned to the fight (intro, build, main, push, climax, out) rather
than looped. Written rather than sourced so the film renders for anyone who
clones the repo, and because it is the only end-to-end exercise of the
audio-asset path.

## Predicted failures

Written in advance so the test means something.

1. **No spiky or flame hair in the kit.** Both silhouettes need it. — *added:
   `spiky`, `flame`, built as straight-edged radial crowns, because smoothing
   turns a spike into a blob.*
2. **No camera shake.** `shot.camera` is a from/to pair; an oscillation is
   neither. — *added `camera.shake`, decaying, written as an offset so the pan
   underneath still happens.*
3. **Audio assets never load.** Declared since phase 0, fetched by nothing. —
   *added `loadAudioAssets`.*
4. **Scenery cannot be animated**, so the beam and the impact flashes have to
   be cast members, not props.
5. **A raised arm draws over the head** — arms are the neck's siblings and `z`
   only sorts siblings. Shot 14 raises both hands, so this will show.
6. **`move` derives `y` from the ground**, so anything airborne (10, 18) needs
   an explicit `y` for the arc to bow away from.
