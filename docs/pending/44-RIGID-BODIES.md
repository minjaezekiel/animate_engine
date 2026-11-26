# Rigid-body dynamics — the design, before the code

**Status: Tier 1 shipped in Phase 60; Tiers 2 to 4 are open.** This document
exists because [37-MISSING-TOOLS.md](37-MISSING-TOOLS.md) and
[43-DCC-PARITY.md](43-DCC-PARITY.md) both say the same thing about this item
and nothing else in either list: *its own doc before any code*. It is the
largest genuinely-missing subsystem, it is the one where a wrong seam is
expensive to undo, and it is the one where "it looks right" is least
trustworthy — a solver that is subtly wrong produces plausible motion for
twenty frames and then a body sinks through a floor.

---

## 1. The limit, stated as something that happened

`src/core/sim/` contains `cloth.js`, `fluid.js` and `colliders.js`. The third
is descriptions only — box, sphere and convex hull from a mesh, added in
Phase 45 — and **there has never been a solver to hand them to**. So:

- A **seven-part series about collision maths** (Phases 34–35) animated every
  collision with authored keyframes. That was the right call for teaching,
  where each frame has to illustrate the equation under discussion, and it is
  not a substitute: nothing in that series could be re-timed without
  re-deriving the keys by hand.
- The AK-47 film ejects seventeen rounds and **not one case lands**. Debris is
  particles, particles are closed-form, and the trade recorded in
  [13-3D-FILM.md §8](../13-3D-FILM.md) is explicit: *"Debris passes through
  the floor."*
- Phase 36 fixed `bounceParts` to **square** the restitution, because bounce
  height goes as *e²* — a correction to an authoring helper that exists only
  because there is no solver to ask.

What a film cannot say today: *drop this, let it land.*

---

## 2. The contract: bake, do not simulate

**Frame *N* is a pure function of *N*.** That is the rule the whole engine
rests on — it is what makes a render resumable, a frame grab reproducible,
and `test:e2e`'s determinism check meaningful. A live solver breaks it: the
state at frame 600 depends on having integrated frames 0 to 599, so seeking
is impossible, a dropped frame changes the film, and two renders of the same
file differ.

So the solver **runs once, at build time, in the compiler**, and its output is
ordinary keyframe tracks. After the bake there is no physics in the engine at
all: there is a `position` track and a `quaternion` track, exactly the shape
`clipToTracks` already emits for an imported Mixamo clip, and every mechanism
the timeline has — easing, additive layers, masks, retiming, the digest, the
budget — applies to a simulated body for free, because it is not a simulated
body any more.

This is the same decision as the take cache (Phase 41: *never synthesize
during a render at all*) and for the same reason, and it is the decision that
makes everything below cheap.

### What that costs, honestly

A baked body cannot react to anything decided at render time. There is nothing
decided at render time in this engine, so today that costs nothing; if
interactive playback ever matters, this is the seam that would have to move.

---

## 3. The data model

Two new top-level blocks, and no new verb — the same shape `cloth` and
`fluids` already use.

```jsonc
"physics": {
  "gravity": [0, -9.81, 0],      // m/s^2; the film's own units are metres
  "step": 0.004,                 // the solver's fixed step, seconds
  "until": 2.5,                  // how long to simulate; default: the film
  "iterations": 8                // contact passes per step
},

"bodies": {
  "case1": {
    "of": "ak/case",             // the node this drives
    "shape": "box",              // box | sphere, or omitted to measure the mesh
    "size": [0.039, 0.010, 0.010],
    "mass": 0.0105,              // kg. A 7.62x39 case is 10.5 g
    "at": [0.06, 0.02, 0.03],    // where it starts
    "velocity": [1.8, 2.4, 2.1], // m/s
    "spin": [0, 0, 40],          // rad/s
    "restitution": 0.35,
    "friction": 0.4,
    "start": 39.5                // when it is released, in film seconds
  }
},

"surfaces": [
  { "node": "set/floor" },                    // measured from its geometry
  { "normal": [0, 1, 0], "offset": -1.59 }    // or stated directly
]
```

Three deliberate choices:

- **`of` names a node that already exists.** A body does not create geometry;
  it drives a part the film cast in the ordinary way. So a case is modelled,
  materialled and lit like everything else, and the solver only decides where
  it is. This is the same split as `scatter` (Phase 59), where placement is
  data and the mesh is a mesh.
- **Units are real.** `mass` in kilograms and `gravity` in m/s² only mean
  anything because this engine's 3D films are already authored in metres —
  the AK-47 is 880 mm because a real one is. A dimensionless solver would be
  a second system of units in the same file.
- **`surfaces` are static and separate from `bodies`.** A floor is not a body
  with infinite mass; it is a half-space, and a half-space contact is exact,
  branchless and cannot tunnel. Treating the world as a special case rather
  than as a very heavy body is what keeps resting contact stable.

---

## 4. The solver

### 4.1 Scope: what Tier 1 does and does not do

| | Tier 1 | why |
|---|---|---|
| gravity, linear and angular motion | **yes** | the whole point |
| sphere vs half-space | **yes** | exact, two lines |
| box vs half-space, at its corners | **yes** | what makes a thing *topple* rather than slide |
| sphere vs sphere | **yes** | exact, and it is the collision-maths series' own case |
| restitution and Coulomb friction | **yes** | without friction everything slides forever and nothing looks heavy |
| resting contact, without jitter | **yes** | the single hardest thing here; §4.4 |
| **box vs box** | **no** | needs a contact manifold (SAT, clipping, feature pairs), which is most of a physics engine. Deferred with its reason stated, not forgotten |
| stacking boxes | **no** | follows from box-box |
| joints, hinges, ropes, motors | **no** | `constraints` already exist for authored relationships; a *dynamic* joint is a second system |
| soft bodies | **no** | `cloth.js` is the soft body this engine has |
| CCD (continuous collision) | **no** | a small fixed step is the cheap answer; §4.3 names where it stops being enough |

Boxes against the world and spheres against each other covers *falls, bounces,
rolls, tumbles, lands, settles* — which is the list a film actually asks for.
Box-box is what a **stack** needs, and no film here has asked for a stack.

### 4.2 The integrator

Semi-implicit (symplectic) Euler at a fixed step, with contacts resolved by
sequential impulses.

Not RK4: RK4 is more accurate for smooth forces and **worse** here, because
collisions are discontinuous and the four sub-evaluations straddle the impact.
Semi-implicit Euler is one evaluation, is stable for gravity at any step a
film would use, and does not pretend to accuracy it cannot have across a
contact.

Orientation integrates as a **quaternion**, normalised every step, with the
angular velocity in world space and the inertia tensor rotated into it.
Baking Euler angles instead would interpolate 359° to 1° the long way round
and make a tumbling case spin backwards for one frame.

### 4.3 The step, and why it is 4 ms rather than the frame

A 24 fps frame is 41.7 ms. At 41.7 ms a body falling under gravity moves
8.5 mm in the first step and 170 mm by the tenth — a 10 mm case would pass
straight through a 1 mm floor and out the other side, with no contact ever
detected. So the solver substeps: `step: 0.004` is about ten substeps per
frame, at which a case moves 0.08 mm per step and cannot tunnel through
anything it is bigger than.

The rule that falls out, and belongs in the diagnostics: **a body must not
move more than half its own smallest dimension in one step.** The compiler can
check that from `size`, `velocity` and `step` before simulating, and say so,
which is cheaper than discovering it as an object that vanished.

### 4.4 Resting contact, which is where naive solvers fail

A body on a floor is the case everything else is judged by, and the two
failure modes are famous:

- **Jitter.** An impulse that exactly cancels penetration each step, applied to
  a body gravity re-penetrates each step, oscillates. Fixed by *Baumgarte
  stabilisation* with a slop: push out only the penetration beyond a small
  allowance (0.5 mm), and only a fraction of it (0.2) per step.
- **Sinking.** Too little correction and the body creeps through. Fixed by the
  same two numbers from the other side, and measured: §6's proof asserts a
  settled body's penetration stays under the slop for a thousand steps.

Plus **sleeping**: a body whose linear and angular speed stay under a
threshold for 0.3 s is frozen, which is what makes a hundred settled cases
free rather than a hundred bodies being integrated for the rest of the film.
Sleeping is also what makes the bake *short*: a sleeping body writes no more
keys.

### 4.5 Why not a physics library

`cannon-es` is pure ESM JavaScript, runs in Node, and would bring box-box,
stacking and joints for nothing. It was declined, and the reason is the
layering rule in [43-DCC-PARITY.md §4.1](43-DCC-PARITY.md): **`src/core/` has
no dependencies.** It is the property that makes the core testable in Node
with no browser, importable from a script, and auditable — and this would be
the first exception, in the subsystem with the largest surface.

The honest counter-argument is that a solver is not "a few lines", which is
exactly when the ladder says to take the dependency. What settles it is that
Tier 1's scope is small enough to be a few hundred lines of arithmetic with
the proofs in §6, and that a library's scope is not the issue — its
*determinism guarantee* is. A bake has to be byte-identical on re-run and
across machines, and that is a property of our own float arithmetic that we
can test and a property of a dependency that we would be assuming.

If box-box and joints become a real requirement, this is the decision to
revisit, and the shape of the revisit is clear: the solver sits behind
`simulateBodies(...)` and nothing else in the engine knows it exists.

---

## 5. Architecture

### 5.1 Layering

```
core/sim/rigid.js       the solver. Pure arithmetic, no THREE, no DOM, no fs.
core/sim/colliders.js   shapes, from Phase 45. Already pure. Reused, not rewritten.
core/script/compile3d.js runs the bake and writes tracks.
core/anim/Timeline.js   receives them. It cannot tell them from hand-keyed ones.
```

Nothing is added to the backend at all. That is the test of whether the seam
is right: a feature that needs no renderer change is a feature the renderer
already supports.

### 5.2 Loose coupling

The solver's interface is one function:

```js
simulateBodies({ bodies, surfaces, gravity, step, until, iterations })
  -> [{ id, samples: [{ t, at: [x,y,z], q: [x,y,z,w], sleeping }] }]
```

It takes numbers and returns numbers. It does not know what a film is, what a
node is, or that keyframes exist. That is what lets the proofs in §6 be unit
tests and what would let a Rust kernel replace it behind the same call.

### 5.3 Performance

It runs once, at build time, and the cost is `bodies x steps`: 20 bodies for
2.5 s at a 4 ms step is 12,500 steps and 250,000 body-updates, which is
milliseconds. Sleeping removes the settled ones. The quadratic term is
body-body pair testing — 20 bodies is 190 pairs, and above a few hundred
bodies it wants the same uniform grid `scatter` already uses for Poisson-disc.
A measured number goes in STATUS, not an estimate.

The output is the thing to watch, as it was for CSG. One key per frame per
channel per body is 24 x 2.5 x 20 x 2 = 2,400 keys; keys that lie on the line
between their neighbours are dropped, which is the same trick `count` uses to
cost one key per *visible* value.

### 5.4 Scalability

Not the frame rate — the bake is not in the frame loop — but the **track
count**, which `samplePose` walks every frame. A hundred baked bodies is 200
tracks. The answer is the one §4.4 already gives: a sleeping body stops
emitting keys, so a hundred cases that land in the first second cost a hundred
short tracks rather than a hundred long ones.

### 5.5 Security

A film is data. `physics` and `bodies` are numbers and node names; nothing is
evaluated, nothing is fetched, nothing names a path. The one hazard is a
**non-terminating bake** — `until: 1e9`, or a step of zero — so the compiler
clamps the step to a sane range, caps the total steps, and reports when it
does.

### 5.6 Diagnostics (the guard lists)

- `BODY_SHAPES = ['box', 'sphere']` — a typo is a diagnostic, not a body that
  silently never collides. Fifth member of the family after `GEOMETRY_KINDS`.
- `of` naming a node that does not exist.
- A `surfaces` entry naming neither a node nor a normal.
- The tunnelling check from §4.3, before simulating.
- A body that is still moving when the bake ends, which means `until` is too
  short and the film will show a case frozen in mid-air.

---

## 6. The proofs

Each is a number a unit test asserts, and each one fails for a different
reason — which is the point of having five.

| Property | Test |
|---|---|
| **Energy** | A ball dropped with `restitution: 1` stays within 2% of its drop height for five bounces, **and the loss is proportional to the step**: 0.84% a bounce at 4 ms, 0.40% at 1 ms, 0.11% at 0.25 ms. Asserting the convergence rather than a tolerance is what distinguishes first-order discretisation from a leak. This is the integrator. |
| **The e² law** | With `restitution: 0.5`, bounce *n*'s apex is `h0 x 0.25^n` to 5% for the first two. This is the impulse, and it is the law Phase 36 had to correct `bounceParts` for. |
| **Angular momentum** | A body spinning in zero gravity holds |L| to 1e-9 over 10,000 steps, with its quaternion staying unit-length. This is the rotational integrator, and it is the one that silently drifts. |
| **Rest** | A settled box's penetration stays under the slop and its position changes by less than 10 µm over 1,000 steps. This is Baumgarte and sleeping together. |
| **Determinism** | Two bakes of the same film are byte-identical, and the same across a re-run. This is the contract. |

And one measurement for the film: a shell case that **lands**, with the frame
showing it on the floor where before it was below it.

---

## 7. Order

| Tier | Work | Why here |
|---|---|---|
| 1 | gravity, sphere and box vs half-space, sphere-sphere, friction, rest, sleep, bake | the whole of what a film has asked for |
| 2 | box-box with a real contact manifold, and stacking | the first thing a *new* film will ask for |
| 3 | joints: hinge, point, distance | a door, a chain, a sling |
| 4 | the solver as a Rust kernel, with this as the oracle | only if a measured number says so — the CSG lesson, where the kernel the plan specified turned out to be unnecessary |

Tier 1 is this document's acceptance test. When §6's five numbers pass and a
case lands in the AK-47 film, this document moves to
[../completed_phases/](../completed_phases/).
