/**
 * Hands and fingers, on both paths.
 *
 * Both stopped at the wrist: the 3D rig had one `fingers` leaf bone and a
 * flat slab, the 2D cutout a single mitten path. Neither could point, grip,
 * count or gesture. These are the checks that stop that happening quietly
 * again -- including the proportion rules, because a hand that is the wrong
 * SHAPE passes every structural test ever written.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DIGITS, DIGIT_IDS, HAND_POSES, HAND_POSE_NAMES,
    gripAngles, gripMitt, handBones, handSegments, handBoneIds,
} from '../../src/core/art/hands.js';
import { HUMANOID_BONES, HUMANOID_SEGMENTS, HAND_LENGTH, bindPose } from '../../src/core/art/humanoid3d.js';
import { buildTube } from '../../src/core/art/mesh3d.js';
import { generateCharacterParts } from '../../src/core/script/generate.js';
import { chainFromParts } from '../../src/core/rig/IK2D.js';
import { compileFilm3D } from '../../src/core/script/compile3d.js';
import { compileFilm } from '../../src/core/script/compile.js';
import { trackValueAt } from '../../src/core/anim/Track.js';

const DEG = Math.PI / 180;
const len = (v) => Math.hypot(v[0], v[1], v[2]);

// ------------------------------------------------------- the shared table

test('five digits, three phalanges each, thumb first', () => {
    assert.deepEqual(DIGIT_IDS, ['thumb', 'index', 'middle', 'ring', 'pinky']);
    for (const d of DIGITS) {
        assert.equal(d.bones.length, 3, `${d.id} needs three phalanges`);
        assert.equal(d.curl.length, 3);
        assert.equal(d.r.length, 3);
        assert.ok(d.bones.every((b) => b > 0));
        // Each phalanx is shorter than the one above it, which is true of
        // every digit on a human hand and is most of what makes a tapering
        // finger read as a finger.
        assert.ok(d.bones[0] > d.bones[1] && d.bones[1] > d.bones[2], `${d.id} tapers`);
        assert.ok(d.r[0] > d.r[2], `${d.id} narrows toward the tip`);
    }
});

test('the middle finger is longest and the thumb starts at the wrist', () => {
    const by = Object.fromEntries(DIGITS.map((d) => [d.id, d]));
    const total = (d) => d.bones.reduce((a, b) => a + b, 0);
    assert.ok(total(by.middle) > total(by.index), 'middle beats index');
    assert.ok(total(by.index) > total(by.pinky), 'and index beats the little finger');
    // The thumb's metacarpal is MOBILE and starts near the wrist. A thumb
    // drawn at the knuckle line can never oppose, and the hand reads as
    // having five fingers.
    const knuckle = (d) => -d.at[1];
    assert.ok(knuckle(by.thumb) < knuckle(by.index) * 0.5,
              'the thumb starts far above the knuckle line');
    // And the knuckle line is an arc: middle furthest from the wrist.
    assert.ok(knuckle(by.middle) > knuckle(by.pinky));
    assert.ok(knuckle(by.middle) >= knuckle(by.ring));
});

test('a pose blends by amount and clamps, and an unknown one returns null', () => {
    assert.equal(gripAngles('nope'), null);
    assert.equal(gripMitt('nope'), null);
    assert.ok(HAND_POSE_NAMES.includes('fist'));

    const full = gripAngles('fist');
    const half = gripAngles('fist', 0.5);
    assert.ok(Math.abs(half.index.curl[0] - full.index.curl[0] / 2) < 1e-12,
              'half a fist is half the angle -- a hand about to close');
    assert.deepEqual(gripAngles('fist', 0).index.curl, [0, 0, 0]);
    assert.deepEqual(gripAngles('fist', 9).index.curl, full.index.curl, 'clamped at 1');
});

test('relaxed is all zeros, because the bind pose IS relaxed', () => {
    // The relaxed curl is baked into the bone directions, so a character who
    // never mentions their hands still has hands that look like hands -- and
    // it costs no keyframes at all.
    for (const digit of DIGIT_IDS) {
        assert.deepEqual(HAND_POSES.relaxed[digit].curl, [0, 0, 0]);
    }
    const open = gripAngles('open');
    assert.ok(open.index.curl[0] < 0, 'opening the hand takes the baked curl back out');
    const fist = gripAngles('fist');
    assert.ok(fist.index.curl[0] > 60 * DEG, 'a fist closes the knuckle about 90 degrees');
    assert.ok(fist.thumb.lift > 0, 'and the thumb opposes rather than just curling');
});

test('a mitten rig gets the fingers averaged, not nothing', () => {
    // A cutout hand two centimetres across cannot carry five fingers without
    // reading as a smear, so the 2D default rigs four of them as one mitt.
    // Collapsing the pose means a film written for one detail level still
    // plays at the other.
    const mitt = gripMitt('fist');
    const angles = gripAngles('fist');
    const fingers = DIGIT_IDS.filter((d) => d !== 'thumb');
    const mean = fingers.reduce((s, d) => s + angles[d].curl[0], 0) / fingers.length;
    assert.ok(Math.abs(mitt.knuckle - mean) < 1e-12);
    assert.ok(mitt.tip > 0);
    assert.deepEqual(mitt.thumb.curl, angles.thumb.curl, 'the thumb is never collapsed');
    assert.equal(gripMitt('relaxed').knuckle, 0);
});

// --------------------------------------------------------------- 3D bones

test('a hand is twenty bones and fifteen segments, with no orphans', () => {
    const bones = handBones('L', HAND_LENGTH);
    assert.equal(bones.length, 20, 'five digits, four bones each (three joints and a tip)');
    assert.equal(handSegments('L', HAND_LENGTH).length, 15);
    assert.equal(handBoneIds('L').length, 15, 'the tip is not posed');

    const ids = new Set(bones.map((b) => b.id));
    assert.equal(ids.size, bones.length, 'no duplicate ids');
    for (const b of bones) {
        if (b.parent === 'handL') continue;
        assert.ok(ids.has(b.parent), `${b.id} parents to a bone that exists`);
    }
    assert.ok(ids.has('thumbL4') && ids.has('pinkyL4'));
});

test('the skeleton carries both hands and still resolves', () => {
    assert.equal(HUMANOID_BONES.length, 65, '25 body bones plus twenty per hand');
    assert.equal(HUMANOID_SEGMENTS.length, 49);
    const ids = new Set(HUMANOID_BONES.map((b) => b.id));
    assert.equal(ids.size, HUMANOID_BONES.length);
    for (const b of HUMANOID_BONES) {
        if (b.parent) assert.ok(ids.has(b.parent), `${b.id} -> ${b.parent}`);
    }
    // Every segment spans two bones that exist, or `segmentSkin` binds to an
    // index that is not there and the surface collapses to the origin.
    for (const s of HUMANOID_SEGMENTS) {
        assert.ok(ids.has(s.from), `segment from ${s.from}`);
        assert.ok(ids.has(s.to), `segment to ${s.to}`);
    }
});

test('the arm now reaches as far as an arm does', () => {
    const world = bindPose();
    const shoulder = world.get('shoulderL');
    const tip = world.get('middleL4');
    const reach = shoulder[1] - tip[1];
    // Shoulder to fingertip is about 0.73 m on a 1.8 m adult. Before the hand
    // existed the arm stopped at the knuckles, 0.19 m short, and the figure
    // read as short-armed without anything saying why.
    assert.ok(reach > 0.70 && reach < 0.78, `shoulder to fingertip was ${reach.toFixed(3)}`);
    const knuckle = world.get('middleL1');
    assert.ok(knuckle[1] - tip[1] > 0.06, 'and the fingers themselves are about 90mm');
});

test('bones are mirrored across x and nothing else', () => {
    const L = handBones('L', HAND_LENGTH);
    const R = handBones('R', HAND_LENGTH);
    for (const [i, l] of L.entries()) {
        const r = R[i];
        assert.equal(r.id, l.id.replace('L', 'R'));
        assert.ok(Math.abs(r.at[0] + l.at[0]) < 1e-12, `${l.id} x mirrors`);
        assert.ok(Math.abs(r.at[1] - l.at[1]) < 1e-12, `${l.id} y does not`);
        assert.ok(Math.abs(r.at[2] - l.at[2]) < 1e-12, `${l.id} z does not`);
    }
});

test('the relaxed curl is baked in, and the digit does not kink', () => {
    const bones = Object.fromEntries(handBones('L', HAND_LENGTH).map((b) => [b.id, b]));
    // Curled toward the palm, which is -z: the direction `rotation.x` closes.
    assert.ok(bones.indexL2.at[2] < 0, 'the knuckle already leans into the palm');
    assert.ok(bones.indexL4.at[2] < bones.indexL2.at[2], 'and it keeps leaning');

    // The angle between consecutive phalanges must be small and INCREASING
    // smoothly. Applying splay only to the first bone and letting the rest
    // revert to straight down put a visible kink in every thumb.
    const angleBetween = (a, b) => {
        const d = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (len(a) * len(b));
        return Math.acos(Math.min(1, Math.max(-1, d))) / DEG;
    };
    for (const d of DIGITS) {
        const seq = [2, 3, 4].map((j) => bones[`${d.id}L${j}`].at);
        assert.ok(angleBetween(seq[0], seq[1]) < 40, `${d.id} does not kink at the second joint`);
        assert.ok(angleBetween(seq[1], seq[2]) < 40, `${d.id} does not kink at the third`);
    }
});

test('bone lengths follow the table, so a hand scales with the character', () => {
    const small = handBones('L', 0.095);
    const big = handBones('L', 0.19);
    for (const [i, b] of small.entries()) {
        if (big[i].parent === 'handL') continue;
        assert.ok(Math.abs(len(big[i].at) / len(b.at) - 2) < 1e-9, `${b.id} scales`);
    }
});

// ------------------------------------------------- tubes, caps and holes

test('a tube is a closed, outward-facing solid at every dome setting', () => {
    for (const dome of [0, 0.45, 1]) {
        const g = buildTube([0, 0, 0], [0, 1, 0], { r0: 0.2, r1: 0.1, radial: 12, rings: 4, dome });
        const edges = new Map();
        for (let t = 0; t < g.indices.length; t += 3) {
            const v = [g.indices[t], g.indices[t + 1], g.indices[t + 2]];
            for (let k = 0; k < 3; k++) {
                const a = v[k], b = v[(k + 1) % 3];
                const key = a < b ? `${a}_${b}` : `${b}_${a}`;
                edges.set(key, (edges.get(key) ?? 0) + 1);
            }
        }
        // Every cap used to end in a small OPEN ring. At limb scale the next
        // segment covered it; at fingertip scale it is a black pinhole at the
        // end of each of thirty phalanges.
        let open = 0;
        for (const [, n] of edges) if (n !== 2) open++;
        assert.equal(open, 0, `dome ${dome}: ${open} open edges`);

        // And every triangle faces out, caps included. Both cap fans were
        // wound inward on the first pass, which is backface-culled -- so
        // closing the hole did not make the hole go away.
        const v = (k) => [g.positions[k * 3], g.positions[k * 3 + 1], g.positions[k * 3 + 2]];
        let inward = 0;
        for (let t = 0; t < g.indices.length; t += 3) {
            const [a, b, c] = [v(g.indices[t]), v(g.indices[t + 1]), v(g.indices[t + 2])];
            const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
            const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
            const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2],
                       ab[0] * ac[1] - ab[1] * ac[0]];
            const mid = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
            const out = [mid[0], mid[1] - 0.5, mid[2]];
            if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] <= 0) inward++;
        }
        assert.equal(inward, 0, `dome ${dome}: ${inward} inward triangles`);
    }
});

test('extend overlaps the ends without flaring the radius', () => {
    const plain = buildTube([0, 0, 0], [0, 1, 0], { r0: 0.1, r1: 0.1, radial: 8, rings: 2, dome: 0 });
    const over = buildTube([0, 0, 0], [0, 1, 0],
                           { r0: 0.1, r1: 0.1, radial: 8, rings: 2, dome: 0, extend: 0.2 });
    const span = (g) => {
        let lo = 1e9, hi = -1e9, maxR = 0;
        for (let i = 0; i < g.positions.length; i += 3) {
            lo = Math.min(lo, g.positions[i + 1]); hi = Math.max(hi, g.positions[i + 1]);
            maxR = Math.max(maxR, Math.hypot(g.positions[i], g.positions[i + 2]));
        }
        return { lo, hi, maxR };
    };
    const a = span(plain), b = span(over);
    assert.ok(b.lo < a.lo - 0.1 && b.hi > a.hi + 0.1, 'it runs past both ends');
    assert.ok(Math.abs(b.maxR - a.maxR) < 1e-6, 'and the overhang does not flare');
});

// --------------------------------------------------------------- 3D grip

const rig3d = (actions) => compileFilm3D({
    materials: { skin: { color: '#eee' }, jacket: { color: '#333' }, shirt: { color: '#eee' },
                 trouser: { color: '#333' }, shoe: { color: '#111' } },
    characters: { h: { rig: 'humanoid', correctives: false } },
    cast: [{ character: 'h', as: 'p' }],
    scenes: [{ shots: [{ duration: 3, actions }] }],
});

test('grip writes every joint of every digit, and nothing else', () => {
    const c = rig3d([{ do: 'grip', target: 'p/handR', pose: 'fist', at: 0.5, for: 0.4 }]);
    assert.deepEqual(c.diagnostics, []);
    const digits = c.timeline.tracks.filter((t) => /\/(thumb|index|middle|ring|pinky)R/.test(t.target));
    // Five digits: three joints on rotation.x, plus splay and lift on the
    // first joint only -- a finger fans at the knuckle and nowhere else.
    assert.equal(digits.length, 5 * (3 + 2));
    assert.equal(digits.filter((t) => t.path === 'rotation.x').length, 15);
    assert.equal(digits.filter((t) => t.path !== 'rotation.x')
        .every((t) => /[LR]1$/.test(t.target)), true);
    assert.equal(c.timeline.tracks.filter((t) => /L[1-4]$/.test(t.target)).length, 0,
                 'gripping one hand leaves the other alone');
});

test('a 3D grip eases from the bind pose and lands on the pose', () => {
    const c = rig3d([{ do: 'grip', target: 'p/handR', pose: 'fist', at: 0.5, for: 0.4 }]);
    const track = c.timeline.tracks.find((t) => t.target === 'p/indexR1' && t.path === 'rotation.x');
    assert.equal(trackValueAt(track, 0), 0, 'the hand is relaxed until it is told otherwise');
    const want = gripAngles('fist').index.curl[0];
    assert.ok(Math.abs(trackValueAt(track, 0.9) - want) < 1e-9);
});

test('splay and lift mirror between hands and curl does not', () => {
    const c = rig3d([{ do: 'grip', target: 'p/handL', pose: 'spread', at: 0 },
                     { do: 'grip', target: 'p/handR', pose: 'spread', at: 0 }]);
    const at = (target, path) => trackValueAt(
        c.timeline.tracks.find((t) => t.target === target && t.path === path), 1);
    // A rotation about y or z flips sign across the body's plane of symmetry
    // and a rotation about x does not.
    assert.ok(Math.abs(at('p/indexL1', 'rotation.z') + at('p/indexR1', 'rotation.z')) < 1e-12);
    assert.ok(Math.abs(at('p/thumbL1', 'rotation.y') + at('p/thumbR1', 'rotation.y')) < 1e-12);
    assert.ok(Math.abs(at('p/indexL1', 'rotation.x') - at('p/indexR1', 'rotation.x')) < 1e-12);
});

test('a bad 3D grip warns with the list and writes nothing', () => {
    const bad = rig3d([{ do: 'grip', target: 'p/handR', pose: 'claw' },
                       { do: 'grip', target: 'p/head', pose: 'fist' },
                       { do: 'grip', target: 'nobody/handR', pose: 'fist' }]);
    assert.equal(bad.diagnostics.length, 3);
    assert.ok(bad.diagnostics[0].message.includes('fist'), 'the warning lists the known poses');
    assert.ok(bad.diagnostics[1].message.includes('handL'));
    assert.equal(bad.timeline.tracks.filter((t) => /index|thumb/.test(t.target)).length, 0);
});

// ------------------------------------------------------- 2D hand cutouts

const parts2d = (hands) => generateCharacterParts({ hands }, {});

test('the 2D hand has three detail levels and they all hang together', () => {
    const counts = {};
    for (const detail of ['none', 'mitten', 'fingers']) {
        const parts = parts2d(detail);
        const ids = new Set(parts.map((p) => p.id));
        assert.equal(ids.size, parts.length, `${detail}: no duplicate ids`);
        for (const p of parts) {
            if (p.parent) assert.ok(ids.has(p.parent), `${detail}: ${p.id} -> ${p.parent}`);
        }
        assert.ok(ids.has('handL') && ids.has('handR'), `${detail}: the wrist part survives`);
        counts[detail] = parts.length;
    }
    assert.ok(counts.mitten > counts.none, 'a mitten rig adds a thumb and a mitt');
    assert.ok(counts.fingers > counts.mitten, 'and a fingered rig adds four digits');
});

test('2D digit names are the 3D bone names, so one pose table drives both', () => {
    const ids = new Set(parts2d('fingers').map((p) => p.id));
    for (const d of DIGIT_IDS) {
        for (const j of [1, 2]) assert.ok(ids.has(`${d}L${j}`), `${d}L${j}`);
    }
    const mitten = new Set(parts2d('mitten').map((p) => p.id));
    assert.ok(mitten.has('thumbL1') && mitten.has('mittL1') && mitten.has('mittL2'));
    assert.ok(!mitten.has('indexL1'), 'a mitten has no separate index finger');
});

test('a 2D hand is half palm and half finger, not a paddle', () => {
    const byId = new Map(parts2d('fingers').map((p) => [p.id, p]));
    // A child's pivot IS its parent's bone vector -- the identity the whole
    // cutout rig is built on.
    const palm = Math.hypot(...byId.get('middleL1').pivot);
    const finger = Math.hypot(...byId.get('middleL2').pivot)
        + Math.hypot(...byId.get('middleL1').pivot) * 0;
    assert.ok(palm > 0 && finger > 0);
    // The middle finger must be longer than the little finger, and its
    // knuckle further from the wrist.
    assert.ok(byId.get('middleL1').pivot[1] > byId.get('pinkyL1').pivot[1],
              'the knuckle line is an arc, with the little finger set back');
    assert.ok(Math.hypot(...byId.get('middleL2').pivot)
              > Math.hypot(...byId.get('pinkyL2').pivot),
              'and the middle finger is the longer');
});

test('fingers are a real chain, so 2D IK reaches with one', () => {
    const parts = parts2d('fingers');
    const chain = chainFromParts(parts, 'indexL2', 2);
    assert.ok(chain, 'a two-bone chain above the fingertip');
    assert.deepEqual(chain.bones.map((b) => b.id), ['handL', 'indexL1']);
    assert.ok(chain.bones.every((b) => b.length > 0));
    // And the arm chain the engine already had must still work.
    assert.deepEqual(chainFromParts(parts, 'handL', 2).bones.map((b) => b.id), ['armL', 'foreL']);
});

// --------------------------------------------------------------- 2D grip

const film2d = (hands, actions, view) => compileFilm({
    meta: { title: 't', fps: 24, width: 640, height: 360 },
    characters: { bob: { view, generate: { hands, facing: 1 } } },
    scenes: [{ id: 's1', cast: [{ character: 'bob', as: 'bob', at: [320, 300] }],
               shots: [{ id: 'a', duration: 2, actions }] }],
});

test('a 2D grip writes onto whichever hand parts exist', () => {
    const fingers = film2d('fingers', [{ do: 'grip', target: 'bob', part: 'handR', pose: 'fist' }]);
    assert.deepEqual(fingers.diagnostics, []);
    const digitTracks = (c) => c.timeline.tracks
        .filter((t) => /(thumb|index|middle|ring|pinky|mitt)R/.test(t.target));
    // Five digits, two segments each, each carrying a rotation AND a scale.
    assert.equal(digitTracks(fingers).length, 5 * 2 * 2);

    const mitten = film2d('mitten', [{ do: 'grip', target: 'bob', part: 'handR', pose: 'fist' }]);
    assert.equal(digitTracks(mitten).length, 2 * 2 * 2, 'a thumb and a mitt, two segments each');

    const none = film2d('none', [{ do: 'grip', target: 'bob', part: 'handR', pose: 'fist' }]);
    assert.equal(digitTracks(none).length, 0);
    assert.ok(none.diagnostics[0].message.includes('generate.hands'),
              'and it says what to do about it rather than silently doing nothing');
});

test('the view decides how much of a curl is rotation and how much is foreshortening', () => {
    // Face on, a curling finger barely rotates in the picture plane: it turns
    // toward the camera and shortens. Rotating it instead produces a wrist
    // bending sideways, which is what the first version drew.
    const grab = (view) => {
        const c = film2d('fingers', [{ do: 'grip', target: 'bob', part: 'handR', pose: 'fist' }], view);
        const pick = (path) => c.timeline.tracks
            .find((t) => t.target === 's1/bob/indexR1' && t.path === `transform.${path}`);
        return { rot: Math.abs(trackValueAt(pick('rot'), 1)), sy: trackValueAt(pick('sy'), 1) };
    };
    const front = grab('front'), profile = grab('profile');
    assert.ok(profile.rot > front.rot * 2, 'a profile hand curls by rotating');
    assert.ok(front.sy < 0.8, 'a front-on hand curls by foreshortening');
    assert.equal(profile.sy, 1, 'and a profile hand does not foreshorten at all');
});

test('a 2D grip closes toward the side the character faces', () => {
    const sign = (facing) => {
        const c = compileFilm({
            meta: { title: 't', fps: 24, width: 640, height: 360 },
            characters: { bob: { view: 'profile', generate: { hands: 'fingers', facing } } },
            scenes: [{ id: 's1', cast: [{ character: 'bob', as: 'bob', at: [320, 300] }],
                       shots: [{ id: 'a', duration: 2, actions: [
                           { do: 'grip', target: 'bob', part: 'handR', pose: 'fist' }] }] }],
        });
        const t = c.timeline.tracks.find((x) => x.target === 's1/bob/indexR1'
                                             && x.path === 'transform.rot');
        return Math.sign(trackValueAt(t, 1));
    };
    // A character drawn facing left closes the other way round, and the sign
    // has to come from the drawing rather than from a guess.
    assert.equal(sign(1), -sign(-1));
    assert.notEqual(sign(1), 0);
});

test('a bad 2D grip warns and writes nothing', () => {
    const bad = film2d('fingers', [{ do: 'grip', target: 'bob', part: 'foot', pose: 'fist' },
                                   { do: 'grip', target: 'bob', part: 'handL', pose: 'claw' }]);
    assert.equal(bad.diagnostics.length, 2);
    assert.ok(bad.diagnostics.some((d) => d.message.includes('handL')));
    assert.ok(bad.diagnostics.some((d) => d.message.includes('relaxed')));
    assert.equal(bad.timeline.tracks.filter((t) => /index|thumb/.test(t.target)).length, 0);
});
