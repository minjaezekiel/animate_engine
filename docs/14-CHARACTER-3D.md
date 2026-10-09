# Characters in 3D: rig, skin, face

A stress test: a presenter in a suit explaining order blocks to camera, with a
screen he teaches from, a skeleton, lipsync and facial performance.

It was chosen to break things, and it did. The list in §5 is the point of the
exercise; §6 is the honest ceiling.

---

## 1. What did not exist

[STATUS](STATUS.md) recorded the open half of Phase 4 as *"`SkinnedMesh` /
`Skeleton` construction from scratch — not done"*. The engine could **animate**
a skinned mesh it was handed: bind it, retarget Mixamo clips onto it, play
them. It could not **make** one. So a 3D film needed an external rigged asset
before it could show a person, while the 2D path had generated its own
characters since Phase 8.

`PoseApplier` had also understood `morph.<name>` since Phase 3 — and nothing
had ever built a morph target, so the channel was unreachable from a film.

---

## 2. Built

| Module | What it is |
|---|---|
| [humanoid3d.js](../src/core/art/humanoid3d.js) | 25 bones, 19 body segments, outfits, automatic skin weights. Pure data and arithmetic |
| [mesh3d.js](../src/core/art/mesh3d.js) | Swept elliptical surfaces with profile curves, and a head built from a ring stack |
| [face3d.js](../src/core/art/face3d.js) | 24 procedural blendshapes, ARKit-named; visemes, expressions, blink and saccade timing |
| `SceneAdapter` | Builds the skeleton, merges the surfaces, binds them, and registers every bone so a timeline can address `host/armL` |
| `compile3d` | `characters`, `dialogue`, and the `express` and `nudge` verbs |

Clothing is the body's own segment table **inflated**. A shirt is not a
separate garment with its own topology — it is the surface pushed out two
centimetres, which is the laziest route to a dressed figure and the only one
that cannot clip through the body, because it is derived from it.

---

## 3. What the research changed

Three things were built wrong first and corrected from the literature.

**Blinks must be asymmetric.** A measured human blink closes in about 80 ms,
holds 50–100 ms, and opens over about 150 ms. The first pass used equal times
in both directions, which reads as a camera shutter rather than an eyelid.

**Blinks and darts must be jittered.** A blink on a strict interval is read as
a tic within seconds; real blinks cluster on pauses and on the first vowel of
a word. Saccades have amplitude thresholds — roughly 7° horizontally and 3°
vertically — before the eye jumps rather than drifts.

**Each system owns its own subset of shapes.** Production facial rigs give the
emotion layer the brows and cheeks and give lipsync the mouth, so the two
cannot overwrite each other. That is the same conclusion the clip masks in
[Phase 13](11-MOTION-SYSTEM.md) reached from the other direction, and it is
why `express` writes only what its expression names.

The blendshape names follow Apple's ARKit set, which descends from FACS Action
Units, so a face built here is driven by the same channel names an iPhone
capture or an Unreal Live Link rig emits rather than a private vocabulary —
and it is why [12-MOCAP.md](12-MOCAP.md)'s face-capture route now has
something to drive.

---

## 4. Lipsync, reused rather than rebuilt

The 2D lipsync stack already solves the hard half: phoneme timings from TTS
where they exist, text plus an amplitude envelope where they do not, emitting
one of six mouth shapes per frame. A 3D face has no drawings to swap, so the
same track is read through `VISEME_SHAPES` and reached by blending muscles
instead.

The weights were chosen so **no two visemes open the jaw by the same amount**.
An identical jaw drop on every sound is the clearest single tell of machine
lipsync, and a test now asserts they stay distinct.

---

## 5. What the test found

Twelve defects, every one of them real, and several that no check would have
caught without a rendered frame to look at.

| Defect | Cause |
|---|---|
| **The body exploded upward**, head at chest height | `new Skeleton(bones)` computes each bone's inverse BIND matrix from its `matrixWorld`, which is identity until something updates it. The root has to be in the graph and the graph updated *before* the skeleton exists |
| **Only the shoes were skinned correctly** | `surface()` called `mesh.add(rootBone)` per surface, and `Object3D.add` removes from the previous parent — so the body, jacket and trousers each stole the skeleton from the one before |
| **A vertex on the hip bound 99.8% to the FOREARM**, one on the outer thigh 91% to the FINGERS | Distance-based automatic weighting has no notion of connectivity, and a body is not convex: a hand genuinely hangs beside a thigh. Fixed by binding each swept limb only to the two bones it spans — which the generator already knows |
| **The clothing vanished; the body looked solid but was inside-out** | Inverted triangle winding on both the tube and the head. What was visible was the *inside of the far wall*, which for a convex tube looks almost right — so the body passed by eye while every garment over it was backface-culled |
| **A close-up framed eight seconds of empty backdrop** | The camera-cut fix from Phase 15 carried its nudge into the *end* key as well, so the outgoing shot's arrival landed on exactly the incoming shot's nudged `from` and collided again. The end key must be measured from the shot's own start |
| **The presenter's head was at knee height** | A weight shift written as `move hips to [0.02, 0, 0]`. `move` is absolute, and a bone's rest position **is its bind pose** — so this did not shift the hips 20 mm, it put the pelvis at the world origin and dropped the skeleton a metre. Fixed by adding `nudge`, which offsets from rest |
| **All eleven lines rendered silent**, and said so only in a line nobody read | `film3d.html`'s import map was missing `onnxruntime-web`, so TTS failed per line and fell back to silence. `index.html` had it; the new page did not |
| **The framing check measured the presenter by his eyes and his tie** | `castBounds` only walked `mesh` nodes, and a humanoid carries no geometry in the core scene — the backend skins it from a bone table. It now measures the rig's bind pose |
| A **350 mm skull** | `headTop` 170 mm above a head bone that already sits at the base of the skull. Chin to crown is about 230 mm |
| **Bald on top with a dark band across the brow** | The hair sphere was centred on the head bone — which is at the *base* of the skull, not its centre |
| **A brow ridge that swallowed the eyes** | At any size that read as a ridge, a flattened sphere projected further forward than the eyes behind it. Removed: the shaped skull already carries the brow |
| **Blinks that read as a shutter** | Symmetric timing; see §3 |

---

## 6. The ceiling, honestly

He reads as a man in a suit. He does not read as a photograph, and the
distance between those two is mostly things this engine does not have.

**There is no sculpting.** A face here is primitives positioned on a swept
skull by typing numbers, rendering, and looking. There is no viewport, no
vertex editing, no symmetry tool, no subdivision — so every feature placement
is a blind iteration, and the brow ridge above took three attempts to decide
it should not exist. This is the single largest gap, and it is not a rendering
problem: it is the absence of a modelling tool.

| Missing | Consequence |
|---|---|
| **UVs and textures on the body** | No skin pores, no stubble, no fabric weave, no eyebrow texture. Everything is one flat colour with PBR roughness. A canvas texture exists, but only for flat panels like the slide |
| **Subsurface scattering** | Skin renders as clay. Real skin transmits light through the ears, nose and lips, and its absence is a large part of why CG faces read as plastic |
| **A hair system** | Hair is a sphere. No cards, no strands, no hairline variation |
| **Cloth simulation** | Clothing is an inflated body, so it has no drape, no folds, no collar standing proud of the neck, and no motion of its own |
| **Corrective / driven shapes** | An elbow at 120° collapses into itself. Production rigs drive corrective blendshapes from the joint's own angle — pose space deformation, the same idea [11-MOTION-SYSTEM.md](11-MOTION-SYSTEM.md) names for 2D |
| **IK** | Gestures are forward-kinematic angles. There is no "put the hand on the screen"; the pose that looks like pointing was found by typing degrees |
| **Teeth and a tongue** | The mouth is a dark cavity. At any real close-up this is obvious |
| **Eye convergence** | The eyes dart on an open loop. They do not converge on what the head is turned toward, so the gaze never quite lands on anything |
| **Ambient occlusion and contact shadows** | Features sit *on* the face rather than *in* it. One shadow-casting light with a 1024 map, no AO, no area lights |
| **Painted weight groups** | Blendshape regions are soft boxes in head-local space, not artist-painted vertex selections. They work on *this* generated head and would need re-tuning for another |
| **Coarticulation** | Lipsync is per-viseme. Real mouths anticipate the next sound while still forming the current one |

A fair summary: the engine can now **build, rig, skin, dress, light, animate
and lipsync a character entirely from code**, with a facial rig named after
the industry standard — and it stops precisely where a human artist would
normally start.
