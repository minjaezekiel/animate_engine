import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    GAITS, FEET, planted, support, footfallOrder, quadrupedStride,
    generateQuadrupedParts, generateQuadrupedActions, QUADRUPED_BUILDS,
} from '../../src/core/script/quadruped.js';
import { compileFilm } from '../../src/core/script/compile.js';
import { measureCharacter } from '../../src/core/index.js';
import { validateFilm } from '../../src/core/script/validate.js';

/**
 * A quadruped's gaits are measured quantities -- footfall order and duty
 * factor -- not matters of taste, which is what makes them testable. A wrong
 * gait is a failing number here rather than something only an animator
 * notices. See 23-QUADRUPED.md.
 */

const SAMPLES = 720;
const sweep = (fn) => Array.from({ length: SAMPLES }, (_, i) => fn(i / SAMPLES));

test('a walk is LATERAL sequence: hind, fore, hind, fore, alternating sides', () => {
    assert.deepEqual(footfallOrder('walk'), ['hindL', 'foreL', 'hindR', 'foreR']);
});

test('a walk is never airborne, and that follows from duty > 0.5', () => {
    assert.ok(GAITS.walk.duty > 0.5, 'the duty factor is what guarantees it');
    const min = Math.min(...sweep((f) => support('walk', f)));
    assert.ok(min >= 2, `a walk keeps at least two feet down, got ${min}`);
});

test('a trot lands DIAGONAL pairs together', () => {
    for (const f of sweep((x) => x)) {
        assert.equal(planted('trot', 'foreL', f), planted('trot', 'hindR', f),
            'the left fore and right hind are one diagonal pair');
        assert.equal(planted('trot', 'foreR', f), planted('trot', 'hindL', f),
            'and the right fore and left hind are the other');
    }
});

test('a trot and a bound have a suspension phase; a walk does not', () => {
    assert.equal(Math.min(...sweep((f) => support('trot', f))), 0);
    assert.equal(Math.min(...sweep((f) => support('bound', f))), 0);
    assert.ok(Math.min(...sweep((f) => support('walk', f))) > 0);
});

test('a bound lands the fore pair, then the hind pair', () => {
    assert.deepEqual(footfallOrder('bound'), ['foreL', 'foreR', 'hindL', 'hindR']);
});

test('every foot is down for exactly its duty factor of the cycle', () => {
    for (const [name, gait] of Object.entries(GAITS)) {
        for (const foot of FEET) {
            const down = sweep((f) => planted(name, foot, f)).filter(Boolean).length / SAMPLES;
            assert.ok(Math.abs(down - gait.duty) < 0.01,
                `${name}/${foot}: on the ground ${down.toFixed(3)} of the cycle, duty is ${gait.duty}`);
        }
    }
});

test('stride comes from geometry, so a longer leg takes a longer step', () => {
    const short = quadrupedStride({ length: 200, withers: 0.5 }, 'walk');
    const tall = quadrupedStride({ length: 200, withers: 0.8 }, 'walk');
    assert.ok(tall > short);
    // 2 * legLength * sin(contact), with legLength = length * withers * 0.92
    const legLength = 200 * 0.5 * 0.92;
    assert.ok(Math.abs(short - 2 * legLength * Math.sin(GAITS.walk.contact)) < 1e-6);
});

// --- the rig ---------------------------------------------------------------

test('the hind leg has one more segment than the fore: the hock', () => {
    const ids = new Set(generateQuadrupedParts().map((p) => p.id));
    for (const id of ['foreUpperL', 'foreLowerL', 'forePasternL', 'forePawL']) {
        assert.ok(ids.has(id), `missing ${id}`);
    }
    for (const id of ['thighL', 'shankL', 'hockL', 'hindPawL']) {
        assert.ok(ids.has(id), `missing ${id}`);
    }
    assert.ok(ids.has('hockR'), 'both hind legs have a hock');
});

test('every part names a parent that exists, and only `body` is rootless', () => {
    const parts = generateQuadrupedParts();
    const ids = new Set(parts.map((p) => p.id));
    const roots = parts.filter((p) => !p.parent);
    assert.deepEqual(roots.map((p) => p.id), ['body']);
    for (const p of parts) {
        if (p.parent) assert.ok(ids.has(p.parent), `${p.id} hangs off missing "${p.parent}"`);
    }
});

test('part ids are unique', () => {
    const ids = generateQuadrupedParts().map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length);
});

test('withers height means withers height, for every breed', () => {
    // The leg segments are DERIVED from it. Picked by eye instead, the first
    // version's legs reached 30% past it and the tail hung 220 units through
    // the floor -- while every gait test passed, because neither is a gait.
    for (const build of Object.keys(QUADRUPED_BUILDS)) {
        const parts = generateQuadrupedParts({ build }, { length: 300 });
        const declared = 300 * (QUADRUPED_BUILDS[build].withers ?? 0.62);
        const { bottom } = measureCharacter(parts);
        // measureCharacter includes stroke width, so half a line is exact.
        const line = Math.max(1.2, 300 * 0.006) / 2;
        assert.ok(Math.abs(bottom - declared - line) < 0.25,
            `${build}: declared ${declared.toFixed(1)}, the paws reach ${bottom.toFixed(1)}`);
    }
});

test('nothing hangs below the paws', () => {
    const parts = generateQuadrupedParts({}, { length: 300 });
    const { bottom } = measureCharacter(parts);
    for (const part of parts) {
        const only = measureCharacter(parts.filter((p) => p.id === part.id
            || isAncestor(parts, part, p.id)));
        assert.ok(only.bottom <= bottom + 1e-6, `${part.id} reaches below the feet`);
    }
});

/** Is `id` an ancestor of `part` in the list? */
function isAncestor(parts, part, id) {
    const byId = new Map(parts.map((p) => [p.id, p]));
    let cur = part;
    while (cur?.parent) {
        if (cur.parent === id) return true;
        cur = byId.get(cur.parent);
    }
    return false;
}

test('every breed builds a complete rig', () => {
    for (const build of Object.keys(QUADRUPED_BUILDS)) {
        const parts = generateQuadrupedParts({ build });
        assert.ok(parts.length > 25, `${build} produced only ${parts.length} parts`);
        assert.ok(parts.every((p) => p.id), `${build} has an unnamed part`);
    }
});

// --- the cycles ------------------------------------------------------------

test('each gait keys every leg segment on both sides', () => {
    const cycles = generateQuadrupedActions();
    for (const gait of ['walk', 'trot', 'bound']) {
        const keys = cycles[gait].keys;
        for (const side of ['L', 'R']) {
            for (const seg of ['foreUpper', 'foreLower', 'forePastern', 'forePaw',
                               'thigh', 'shank', 'hock', 'hindPaw']) {
                assert.ok(keys[`${seg}${side}.rot`], `${gait} is missing ${seg}${side}.rot`);
            }
        }
        assert.ok(keys['body.y'], `${gait} has no vertical travel`);
        assert.ok(keys['spine.rot'], `${gait} does not flex its spine`);
    }
});

test('the hock counter-flexes against the stifle above it', () => {
    const k = generateQuadrupedActions().walk.keys;
    const shank = k['shankL.rot'];
    const hock = k['hockL.rot'];
    // At the frame where the shank folds hardest, the hock bends the other way.
    const peak = shank.reduce((best, cur) => (Math.abs(cur[1]) > Math.abs(best[1]) ? cur : best));
    const at = hock.find(([t]) => t === peak[0]);
    assert.ok(peak[1] * at[1] < 0,
        'the hock bending with the stifle is a bear leg, not a dog leg');
});

test('every cycle loops seamlessly: the last key equals the first', () => {
    const cycles = generateQuadrupedActions();
    for (const name of ['walk', 'trot', 'bound']) {
        for (const [channel, keys] of Object.entries(cycles[name].keys)) {
            assert.equal(keys[0][1], keys[keys.length - 1][1],
                `${name}/${channel} jumps at the loop point`);
        }
    }
});

test('the two sides of a walk are half a cycle apart', () => {
    const k = generateQuadrupedActions().walk.keys;
    const dur = generateQuadrupedActions().walk.duration;
    const at = (keys, t) => keys.find(([kt]) => Math.abs(kt - t) < 1e-6)?.[1];
    // hindL strikes at 0, hindR at 0.5 -- so hindR at t+0.5 matches hindL at t.
    for (const f of [0, 0.125, 0.25, 0.375]) {
        assert.equal(at(k['thighR.rot'], +((f + 0.5) * dur).toFixed(4)),
                     at(k['thighL.rot'], +(f * dur).toFixed(4)),
                     `the hind legs are not antiphase at ${f}`);
    }
});

test('the tail trails the spine rather than moving with it', () => {
    const k = generateQuadrupedActions().walk.keys;
    assert.notDeepEqual(k['tail.rot'].map((x) => x[1]), k['spine.rot'].map((x) => x[1]),
        'a tail in phase with the back is a rudder, not overlap');
});

// --- the film-facing surface ----------------------------------------------

const dogFilm = (actions) => ({
    version: 'jirex.film/1',
    meta: { fps: 24, width: 1280, height: 720 },
    characters: { dog: { generate: { kind: 'quadruped', build: 'scruffy' },
                         proportions: { length: 240 } } },
    scenes: [{ id: 's1', cast: [{ character: 'dog', as: 'dog', at: [400, 600] }],
               shots: [{ id: 'a', duration: 2, actions }] }],
});

test('a film can cast a quadruped and play its gaits, clean', () => {
    const film = dogFilm([
        { target: 'dog', do: 'play', action: 'walk' },
        { target: 'dog', do: 'play', action: 'idle' },
        { target: 'dog', do: 'play', action: 'scratch' },
    ]);
    assert.deepEqual(validateFilm(film).filter((d) => d.severity !== 'info'), []);
    assert.deepEqual(compileFilm(film).diagnostics.filter((d) => d.severity !== 'info'), []);
});

test('a quadruped build is checked against breeds, not against biped builds', () => {
    const problems = validateFilm(dogFilm([]));
    assert.deepEqual(problems.filter((d) => /Unknown build/.test(d.message)), [],
        '"scruffy" is a valid quadruped build');

    const wrong = structuredClone(dogFilm([]));
    wrong.characters.dog.generate.build = 'athletic';   // a biped build
    assert.ok(validateFilm(wrong).some((d) => /Unknown build "athletic"/.test(d.message)));
});

test('a quadruped gets no viseme mouth chart', () => {
    const r = compileFilm(dogFilm([]));
    let mouth = null;
    r.scene.walk((n) => { if (n.id === 's1/dog/mouth') mouth = n; });
    assert.equal(mouth, null, 'a human mouth chart on a dog lands on its ribs');
});

test('asking a dog for a human walk names the gaits it does have', () => {
    const r = compileFilm(dogFilm([{ target: 'dog', do: 'play', action: 'squash' }]));
    const d = r.diagnostics.find((x) => /no action "squash"/.test(x.message));
    assert.match(d.message, /walk, trot, bound/);
});
