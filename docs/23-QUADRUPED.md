# Quadrupeds: a rig that is not a biped with extra legs

**Status: design.** State lives in [STATUS.md](STATUS.md). Prompted by
[21-DRAWN-ANIMATION.md](21-DRAWN-ANIMATION.md) §3.4 — a reference film whose
middle third is carried by a dog, against a generator that builds bipeds only.

## 1. Why this is not a variation

`generate.js` builds a body around `hips` as the root, with two legs hanging
below it and a torso rising above. Every number in it is a fraction of
**height**, which is the right unit for an upright animal and the wrong one
for a horizontal one: a dog's defining measurements are its **length** and its
**withers height**, and those vary independently. A dachshund and a whippet
have nearly the same withers height.

So the quadruped is its own module with its own units, not a `build` entry.

## 2. The skeleton, and the one joint that matters

```
            neck ── head ── muzzle
           /                 ears
   chest ──────────── spine ──────── hips
     |                                 |
  shoulder                          hipJoint
     |                                 |
  foreUpper  (humerus)              thigh  (femur)
     |                                 |
  foreLower  (radius)                shank  (tibia)
     |                                 |
  forePaw                            hock   (metatarsus)  <-- the dog joint
                                       |
                                    hindPaw
```

The front leg is a near-vertical column that carries weight. The hind leg is
the engine, and it has **one more segment than the front** — the hock, the
raised heel that reads as a backwards-bending knee. Leave it out and the
animal reads as a bear or a toy; it is the single most identifying feature of
a dog's silhouette in motion.

The spine is a real joint, not decoration: a quadruped's back flexes in the
sagittal plane and that flexion is most of what a bound looks like.

## 3. Gaits are data, and they are checkable

A gait is a **phase offset per foot** plus a **duty factor** — the fraction of
the cycle each foot spends on the ground. These are measured quantities in the
literature, not stylistic choices, which is what makes them testable.

| gait | beats | cycle | duty | phases (hindL, foreL, hindR, foreR) |
|---|---|---|---|---|
| `walk` | 4, lateral sequence | 1.00 s | 0.65 | 0.00, 0.25, 0.50, 0.75 |
| `trot` | 2, diagonal pairs | 0.60 s | 0.45 | 0.50, 0.00, 0.00, 0.50 |
| `bound` | 2, pairs | 0.45 s | 0.35 | 0.50, 0.00, 0.55, 0.05 |

Three properties fall straight out and become the tests:

- **Walk footfall order is LH → LF → RH → RF.** Lateral sequence. A walk that
  lands diagonal pairs together is a trot that has been slowed down, which is
  the classic wrong quadruped walk.
- **Duty > 0.5 means never airborne.** At `duty: 0.65` at least two feet are
  down at every instant, and the sum of ground contacts never reaches zero.
  A walk with a suspension phase is a bug.
- **Duty < 0.5 means there is a suspension phase**, and `bound` must have one
  — at `0.35` all four feet leave the ground. If the arithmetic says a bound
  never leaves the ground, the gait is wrong.

## 4. What drives what

Within one cycle a foot at phase φ and duty *d* has local time
`u = (t / cycle + φ) mod 1`:

- `u < d` — **stance.** The foot is planted, so the limb rotates backward as
  the body travels over it. This is the half that must not slide.
- `u ≥ d` — **swing.** The limb folds and carries forward. The knee (or hock)
  flexes hardest in mid-swing, because a straight leg swinging forward hits
  the ground.

Everything else is derived from the legs rather than animated beside them:

| channel | driven by |
|---|---|
| body rise and fall | twice per cycle in a walk — one dip per diagonal support pair |
| spine flex | the difference between fore and hind support; largest in `bound` |
| head bob | the body, one beat late, so the neck trails |
| tail | the body, two beats late, with a wider arc |

The trailing offsets are overlap, which is the principle that makes the whole
thing read as an animal rather than a mechanism.

## 5. Stride length, so the feet do not slide

Exactly as for the biped: the planted foot must not move, so stride comes from
the geometry rather than from a number someone liked.

```
stride = 2 × legLength × sin(contactAngle)
```

`walkTo` then takes a whole number of cycles over the distance. A quadruped
that slides is the single most common failure in this kind of rig, and it is
arithmetic, not art.

## 6. What this will not do

- **No gallop.** A transverse gallop is four-beat and asymmetric, and needs a
  lead-leg concept the other three gaits do not have. `bound` covers the fast
  case for a dog; a horse needs more and is not what this is for.
- **No breed library.** One `dog` build, parameterised. A cat or a horse is a
  different proportion table, and the moment a film needs one it can have one.
- **No quadruped IK.** The biped's `reach` solver is two-bone; the hind leg
  has three. Gaits are forward-kinematic, which is how they are animated by
  hand anyway.
