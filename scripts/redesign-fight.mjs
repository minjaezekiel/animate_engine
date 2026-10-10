/**
 * Second pass on the fight: character design, and an environment instead of
 * a template.
 *
 *   node scripts/make-fight-sky.mjs && node scripts/redesign-fight.mjs
 *
 * Rewrites `demo/fight.json` in place, keeping all 23 shots and their timing
 * -- those were planned, verified and are not what this pass is about. What
 * changes is the look: palette, the two characters' kits and proportions,
 * and the set.
 *
 * # The design brief
 *
 * Two references. A martial artist with a **white-silver mane, a green gi
 * with orange trim, pale trousers and green boots**; and an awakened pirate
 * in **white hair and a white coat with violet accents**, grinning
 * constantly.
 *
 * Both have white hair, which is a staging problem before it is a design
 * one: two white-haired figures in a fast fight lose each other in
 * silhouette. Four independent channels separate them instead --
 *
 *   | channel | martial artist | pirate |
 *   |---|---|---|
 *   | hair silhouette | `spiky`, hard triangles | `flame`, soft curls |
 *   | hair value | silver, cool blue line | pure white, violet line |
 *   | costume | saturated green | white |
 *   | eyes | teal | plum |
 *
 * -- so the read survives even at the size the wide shots put them at.
 *
 * # The set
 *
 * The `hillside` template is gone. In its place: a **painted sky** driven as
 * a photo-motion mesh (see `make-fight-sky.mjs`), with mesas and a
 * foreground ridge as crisp scenery path fills in front of it, and an
 * explicit `ground` polyline matching the painted ridge so feet still land
 * on the floor the art drew.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const film = JSON.parse(readFileSync('demo/fight.json', 'utf8'));

// =====================================================================
// palette
// =====================================================================

film.palettes.dusk = {
    // --- the martial artist
    gi: '#2f9e3f',
    giLine: '#f08a1e',          // authored lines survive derivation, which is
    under: '#e2eaf4',           // how the gi gets its orange trim
    underLine: '#9fb6cf',
    boot: '#34a84a',
    bootLine: '#f08a1e',
    spike: '#eef3f9',           // the mane
    spikeLine: '#8ea6c2',
    teal: '#2fc7bd',
    skin: '#f0c28c',
    // The mane when he charges. It was gold, which was right when his hair
    // started black; from silver, gold reads as a colour change rather than
    // a power change, so it goes incandescent instead and matches his eyes.
    aura: '#a9fff4',

    // --- the pirate
    coat: '#fbf8f2',
    coatLine: '#8e5bb5',        // the violet edge standing in for the sash
    snow: '#ffffff',
    snowLine: '#cbaae2',
    sash: '#c9a06a',            // sandals
    sashLine: '#6b4a2a',
    plum: '#6a2f8c',
    tan: '#e8ae74',

    // --- shared
    white: '#fbf7ef',
    flash: '#fff6c8',
    beam: '#8fe6ff',

    // --- the set, in front of the painted sky
    mesaFar: '#452754',
    mesa: '#38203f',
    mesaLine: '#2a1733',
    // Two values for the floor, not one. A single flat near-black across
    // the bottom third reads as a hole punched in the picture rather than
    // as ground -- which is how the first pass looked.
    ridge: '#1d0f26',
    ridgeLine: '#1d0f26',
    ridgeDeep: '#0b0511',
    dust: '#c9708a',
    crest: '#ffb067',
};

// =====================================================================
// characters
// =====================================================================

Object.assign(film.characters.sora, {
    // Heavier than athletic: the reference is visibly built, and shoulder
    // width is what carries that at wide-shot size, not shading.
    proportions: { height: 336, shoulderWidth: 0.325, hipWidth: 0.185,
                   armThickness: 0.074, legThickness: 0.085 },
    generate: {
        build: 'athletic', facing: 1,
        hair: 'spiky', hairColor: 'spike',
        cloth: 'gi', trouser: 'under', shoe: 'boot',
        skin: 'skin', eye: 'teal', white: 'white',
        face: { jaw: 'square', eyes: 'narrow', brow: 'angled', nose: 'straight', ears: 'small' },
    },
});

Object.assign(film.characters.taiyo, {
    // Longer and lighter: the awakened pirate is lanky, and the extra head
    // height is what separates his proportion from the fighter's.
    proportions: { height: 324, heads: 6.6, shoulderWidth: 0.245, hipWidth: 0.175,
                   armThickness: 0.048, legThickness: 0.062 },
    generate: {
        build: 'slim', facing: -1,
        hair: 'flame', hairColor: 'snow',
        cloth: 'coat', trouser: 'coat', shoe: 'sash',
        skin: 'tan', eye: 'plum', white: 'white',
        face: { jaw: 'round', eyes: 'wide', brow: 'arched', nose: 'button', lips: 'wide' },
    },
});

// The grin is the character, so it is his resting state rather than a beat.
for (const entry of film.scenes[0].cast) {
    if (entry.as === 'taiyo') entry.expression = 'delighted';
}

// =====================================================================
// the set
// =====================================================================

const scene = film.scenes[0];
delete scene.template;

/** Matches the painted horizon; see make-fight-sky.mjs. */
scene.ground = { points: [[0, 614], [320, 592], [640, 600], [960, 558], [1280, 544]] };

const ridgeCrest = 'M -60 614 C 128 614, 192 592, 320 592 '
    + 'C 448 592, 512 600, 640 600 C 768 600, 832 558, 960 558 '
    + 'C 1088 558, 1152 544, 1340 544';
const ridgePath = `${ridgeCrest} L 1340 780 L -60 780 Z`;

scene.scenery = [
    // Mesas, straight off the first reference's horizon. They stand ON the
    // painted glow -- tops at 398-430, bases at 470 -- so the brightest
    // band in the picture reads between and above them instead of behind
    // them. The first version put an opaque 534-582 band across exactly
    // that glow and the whole film came back black.
    //
    // Parallax 0.4 so they lag the camera the way distance does; the ridge
    // stays at 1, because it *is* the ground the fighters stand on and must
    // not slide under their feet when the camera pushes in.
    { id: 'mesaA', at: [0, 0], parallax: 0.4, z: -600, fill: 'mesa', stroke: 'mesaLine',
      shape: { kind: 'path', d: 'M 64 470 L 104 428 L 140 398 L 300 398 L 336 428 L 376 470 Z' } },
    { id: 'mesaB', at: [0, 0], parallax: 0.4, z: -601, fill: 'mesaFar',
      shape: { kind: 'path', d: 'M 496 470 L 522 436 L 548 414 L 700 414 L 726 436 L 752 470 Z' } },
    { id: 'mesaC', at: [0, 0], parallax: 0.4, z: -600, fill: 'mesa', stroke: 'mesaLine',
      shape: { kind: 'path', d: 'M 896 470 L 922 430 L 948 396 L 1105 396 L 1140 430 L 1172 470 Z' } },
    // The near ridge. Nothing is detailed inside it, because anything there
    // competes with the fighters standing in front of it -- but it is two
    // values deep, so the floor recedes instead of reading as a void.
    { id: 'ridge', at: [0, 0], z: -560, fill: 'ridge',
      shape: { kind: 'path', d: ridgePath } },
    // Dust catching the horizon light, just under the crest.
    { id: 'dust', at: [0, 0], z: -559.5, fill: 'dust', alpha: 0.16,
      shape: { kind: 'path', d: `${ridgeCrest} L 1340 ${608 + 46} L -60 ${614 + 46} Z` } },
    { id: 'floor', at: [0, 0], z: -558, fill: 'ridgeDeep',
      shape: { kind: 'path', d: 'M -60 690 C 380 676, 900 700, 1340 686 L 1340 790 L -60 790 Z' } },
    // A warm lip along the crest so the silhouette separates from the
    // horizon glow instead of swallowing it.
    { id: 'crest', at: [0, 0], z: -557, stroke: 'crest', strokeWidth: 3, alpha: 0.8,
      shape: { kind: 'path', d: ridgeCrest } },
];

// A colour behind everything, so a backdrop that fails to resolve shows a
// sky rather than black.
scene.background = { color: '#140a24' };

film.assets = {
    ...film.assets,
    skyPlate: { kind: 'image', src: 'demo/assets/sky-plate.png' },
    skyDepth: { kind: 'image', src: 'demo/assets/sky-depth.png' },
};

// The sky as a photo-motion mesh rather than a flat rect.
//
// 1400x820 rather than frame size: the camera pans to an offset of -340 at
// zoom ~1, so a frame-sized backdrop would expose its own edge. Computed
// from the shot list, not guessed.
//
// `tear` cuts the mesh between the sky and the cloud bank, so the bank
// drifts as a bank instead of smearing the sky along with it. The levels
// come from `depthPlanes`, which found the single valley in the painted
// depth map at 0.46.
scene.photos = [{
    id: 'sky',
    source: 'skyPlate', depth: 'skyDepth',
    at: [640, 360], width: 1400, height: 820, z: -700,
    duration: 60, tear: true,
    // Measured, not guessed. A 1400x820 warp every frame is 71.7 ms
    // against a 41.67 ms paced-export ceiling, and the first render of
    // this film came back as a 110-byte undecodable file because of it.
    // The same film without the backdrop ran at 0.7 ms a frame, so the
    // backdrop *was* the whole cost.
    //
    // Rendering at 0.62 and holding each warp for a sixth of a second
    // brings it to roughly 4 ms a frame amortised. Neither is visible: the
    // backdrop is the softest thing in frame, and a sky drifting across a
    // minute does not need a new warp every 42 ms any more than a held cel
    // does -- the cast is already on twos.
    resolution: 0.55, step: 1 / 6,
    effects: [
        { type: 'kenBurns', from: { zoom: 1.05 }, to: { zoom: 1.0, x: 0.012 } },
        { type: 'parallax', amplitude: 0.022, orbit: [1, 0.25], speed: 0.5, focus: 0.3 },
    ],
}];

// =====================================================================
// landings
// =====================================================================
//
// Found by measuring feet against the declared ground every half second,
// not by watching: **sora hung motionless 120px above the floor for 5.3
// seconds** after his leap in `10-rush`, across two cuts, because nothing
// keyed his y back down until `12-giant` moved him. The knockback in
// `18-apart` held both fighters at a constant height for 2.5s before
// `19-land` dropped them.
//
// Neither was visible to the checker before this pass, because a scene
// whose ground came from a `template` was never ground-checked at all --
// `analyseStaging` reads `scene.ground` off the raw film, and a template
// only supplies it during compile. Declaring the ground explicitly turned
// the check on for the first time.
//
// A leap has to come down. At this scale the characters are ~1.8 m, so
// 120px is about 0.64 m and a free fall from there takes ~0.36 s; the
// shonen idiom stretches that, but not to five seconds.
const shotById = (id) => film.scenes[0].shots.find((s) => s.id === id);

// Land him as the blows land, so the exchange has weight under it.
shotById('11-absorb').actions.unshift({
    target: 'sora', do: 'move', to: [520], at: 0, for: 0.34, ease: 'smooth',
});

// Launched, floats, then falls -- rather than hanging flat until the cut.
// `19-land` still finishes the drop; this is the fall that reaches it.
const apart = shotById('18-apart');
// The y values are the ones that put the feet *on* the floor at the end of
// the fall, measured and corrected: the first pair were 18 and 27px too
// low and drove both fighters through the ground for a third of a second
// before `19-land` pulled them back up.
apart.actions.push(
    { target: 'sora', do: 'move', to: [300, 414], at: 1.5, for: 1.4, ease: 'smooth' },
    { target: 'taiyo', do: 'move', to: [960, 391], at: 1.5, for: 1.4, ease: 'smooth' },
);

film.meta.description = 'Sixty seconds at full power. Two fighters in the shonen idiom, '
    + 'on a painted dusk ridge driven as a photo-motion mesh; see demo/fight-script.md.';

writeFileSync('demo/fight.json', `${JSON.stringify(film, null, 2)}\n`);
console.log(`wrote demo/fight.json  (${film.scenes[0].shots.length} shots, `
    + `${Object.keys(film.palettes.dusk).length} palette entries, `
    + `${scene.scenery.length} scenery shapes, ${scene.photos.length} photo)`);
