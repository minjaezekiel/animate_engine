/**
 * Lipsync on an imported 3D head.
 *
 * The voice pipeline has computed a viseme track for every line of every film
 * since the first voice phase. In 3D it drove NOTHING on an imported model --
 * not because the runtime could not (`PoseApplier` has handled `morph.<name>`
 * all along) but because nothing turned `props.viseme` into those channels.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    VISEME_MORPHS, matchVisemeMorphs, visemeKeysOf, visemeMorphTracks,
} from '../../src/core/art/visemeMorphs.js';
import { VISEMES } from '../../src/core/audio/visemes.js';
import { trackValueAt } from '../../src/core/anim/Track.js';
import { lipsyncLine } from '../../src/core/audio/lipsync.js';

const OCULUS = ['viseme_sil', 'viseme_PP', 'viseme_DD', 'viseme_aa',
                'viseme_OU', 'viseme_I', 'viseme_FF', 'viseme_kk'];
const ARKIT = ['eyeBlinkLeft', 'eyeBlinkRight', 'jawOpen', 'mouthClose',
               'mouthFunnel', 'mouthPucker', 'mouthSmileLeft', 'mouthSmileRight',
               'mouthStretchLeft', 'mouthStretchRight', 'mouthFrown',
               'mouthLowerDownLeft', 'mouthLowerDownRight', 'browInnerUp'];

test('an Oculus-convention head maps every viseme', () => {
    const m = matchVisemeMorphs(OCULUS);
    assert.deepEqual(m.unmatched, [], `unmatched: ${m.unmatched}`);
    assert.equal(m.matched.length, VISEMES.length);
    assert.equal(m.convention, 'oculus/viseme_*');
    assert.ok(m.usable);
    assert.equal(m.map.open[0].name, 'viseme_aa');
});

test('an ARKit head maps through COMBINATIONS, since it has no single round shape', () => {
    const m = matchVisemeMorphs(ARKIT);
    assert.equal(m.convention, 'arkit');
    assert.ok(m.usable, m.reason);
    // Round is a funnel plus a pucker, at partial strength: both at full is
    // a fish, not an "oo".
    const round = m.map.round.map((p) => p.name);
    assert.deepEqual(round, ['mouthFunnel', 'mouthPucker']);
    assert.ok(m.map.round.every((p) => p.weight < 1), 'a combination must be weighted');
    assert.equal(m.map.closed[0].name, 'mouthClose');
});

test('matching ignores case, underscores and hyphens', () => {
    // `Mouth_Open`, `mouth-open` and `mouthopen` are the same shape named by
    // three different exporters.
    for (const spelling of ['Mouth_Open', 'mouth-open', 'MOUTHOPEN', 'mouth open']) {
        const m = matchVisemeMorphs([spelling, 'Mouth_Close', 'Mouth_Round']);
        assert.equal(m.map.open?.[0]?.name, spelling, `failed on '${spelling}'`);
    }
});

test('a head with NO mouth shapes is told so, rather than failing silently', () => {
    // "This head has 52 morph targets and none of them is a mouth shape I
    // recognise" is a useful sentence; silence is not.
    const m = matchVisemeMorphs(['browInnerUp', 'eyeBlinkLeft', 'cheekPuff', 'noseSneer']);
    assert.equal(m.usable, false);
    assert.equal(m.matched.length, 0);
    assert.equal(m.targets, 4);
    assert.match(m.reason, /not enough to read as speech/);
    assert.match(m.reason, /`visemes` map/, 'the message must say what to do about it');
    assert.equal(m.convention, 'unrecognised');
});

test('three shapes is usable, two is not — the same judgement 2D already makes', () => {
    assert.equal(matchVisemeMorphs(['mouthClose', 'mouthOpen', 'mouthRound']).usable, true);
    assert.equal(matchVisemeMorphs(['mouthClose', 'mouthRound']).usable, false);
    assert.equal(matchVisemeMorphs([]).usable, false);
    assert.equal(matchVisemeMorphs(null).usable, false);
});

test("an author's own map beats the table, because they can see the model", () => {
    const names = ['shape_A', 'shape_B', 'shape_C', 'mouthOpen'];
    const m = matchVisemeMorphs(names, {
        extra: { closed: 'shape_A', open: 'shape_B', round: 'shape_C' } });
    assert.equal(m.map.closed[0].name, 'shape_A');
    assert.equal(m.map.open[0].name, 'shape_B', 'the override must beat the table match');
    assert.ok(m.usable);
});

test('an override naming a target the model lacks falls back to the table', () => {
    const m = matchVisemeMorphs(['mouthOpen', 'mouthClose', 'mouthRound'],
                                { extra: { open: 'does_not_exist' } });
    assert.equal(m.map.open[0].name, 'mouthOpen');
});

test('a PARTIAL combination match is rejected, not half-applied', () => {
    // Half of a two-target combination is a different expression, not a
    // weaker one. `round` wants funnel + pucker; with pucker absent the
    // combination must be skipped entirely, and only then may the bare
    // `mouthFunnel` fallback apply -- at full weight, as its own entry says,
    // not at the 0.7 the combination would have used.
    const m = matchVisemeMorphs(['mouthFunnel', 'jawOpen', 'mouthClose']);
    assert.equal(m.map.round.length, 1);
    assert.equal(m.map.round[0].name, 'mouthFunnel');
    assert.equal(m.map.round[0].weight, 1,
        'the fallback must not inherit a weight meant for a pair');
});

test('every table entry names at least one target and weights within range', () => {
    for (const [viseme, candidates] of Object.entries(VISEME_MORPHS)) {
        assert.ok(VISEMES.includes(viseme), `${viseme} is not an engine viseme`);
        for (const c of candidates) {
            assert.ok(c.length >= 1, `${viseme} has an empty candidate`);
            assert.equal(typeof c[0], 'string', `${viseme} candidate must start with a name`);
            for (const part of c) {
                if (typeof part === 'number') {
                    assert.ok(part > 0 && part <= 1, `${viseme}: weight ${part} out of range`);
                }
            }
        }
    }
});

// ------------------------------------------------------------------ tracks

const KEYS = [
    { t: 0, viseme: 'closed' },
    { t: 0.5, viseme: 'open' },
    { t: 1.0, viseme: 'round' },
    { t: 1.5, viseme: 'closed' },
];

test('a viseme track becomes one morph channel per target it touches', () => {
    const m = matchVisemeMorphs(OCULUS);
    const tracks = visemeMorphTracks('head', KEYS, m);
    const paths = tracks.map((t) => t.path).sort();
    assert.deepEqual(paths, ['morph.viseme_OU', 'morph.viseme_aa', 'morph.viseme_sil']);
    for (const t of tracks) assert.equal(t.target, 'head');
});

test('a channel that never leaves zero is not emitted', () => {
    // A model with twelve mouth shapes and a line using three must not get
    // twelve channels of zeros.
    const m = matchVisemeMorphs(OCULUS);
    const tracks = visemeMorphTracks('head', [{ t: 0, viseme: 'open' }], m);
    assert.equal(tracks.length, 1);
    assert.equal(tracks[0].path, 'morph.viseme_aa');
});

test('a shape ramps in over `blend` rather than popping', () => {
    /**
     * A morph weight snapping 0 -> 1 pops. The 2D path gets away with a
     * discrete swap because a cutout mouth IS a swap: there is no in-between
     * drawing to miss. A mesh has one.
     */
    const m = matchVisemeMorphs(OCULUS);
    const [aa] = visemeMorphTracks('head', KEYS, m, { blend: 0.04 })
        .filter((t) => t.path === 'morph.viseme_aa');
    assert.equal(trackValueAt(aa, 0.4), 0, 'still closed well before the change');
    assert.equal(trackValueAt(aa, 0.46), 0, 'and right up to the ramp');
    assert.ok(trackValueAt(aa, 0.48) > 0.3, 'mid-ramp');
    assert.equal(trackValueAt(aa, 0.5), 1, 'full on the key');
});

test('only `blend` seconds are in transition, not the whole gap', () => {
    // Interpolating across the whole 0.5s gap would smear every viseme into
    // the next one and read as a crossfade rather than as a mouth.
    const m = matchVisemeMorphs(OCULUS);
    const [aa] = visemeMorphTracks('head', KEYS, m, { blend: 0.04 })
        .filter((t) => t.path === 'morph.viseme_aa');
    assert.equal(trackValueAt(aa, 0.25), 0, 'halfway through the hold it must still be 0');
    assert.equal(trackValueAt(aa, 0.75), 1, 'and still 1 halfway through its own hold');
});

test('a combination viseme drives all of its targets, at their own weights', () => {
    const m = matchVisemeMorphs(ARKIT);
    const tracks = visemeMorphTracks('head', [{ t: 0, viseme: 'round' }], m);
    const byPath = new Map(tracks.map((t) => [t.path, t]));
    assert.equal(trackValueAt(byPath.get('morph.mouthFunnel'), 0), 0.7);
    assert.equal(trackValueAt(byPath.get('morph.mouthPucker'), 0), 0.5);
    assert.equal(tracks.length, 2, 'exactly the two targets the combination names');
});

test('a shape releases when the next viseme does not use it', () => {
    const m = matchVisemeMorphs(OCULUS);
    const [aa] = visemeMorphTracks('head', KEYS, m)
        .filter((t) => t.path === 'morph.viseme_aa');
    assert.equal(trackValueAt(aa, 1.0), 0, 'the open shape must let go when round arrives');
});

test('an unusable mapping produces no tracks rather than a still face', () => {
    const m = matchVisemeMorphs(['browInnerUp']);
    assert.deepEqual(visemeMorphTracks('head', KEYS, m), []);
    assert.deepEqual(visemeMorphTracks('head', [], matchVisemeMorphs(OCULUS)), []);
    assert.deepEqual(visemeMorphTracks('head', KEYS, null), []);
});

// ------------------------------------------------- against the real pipeline

test('it consumes a REAL lipsync track, not a hand-written one', () => {
    /**
     * The whole claim of this module is that the visemes are decided once, in
     * `lipsync.js`, for both paths. So the input here is what that stage
     * actually emits rather than a fixture shaped to suit.
     */
    const samples = new Float32Array(24000);
    for (let i = 0; i < samples.length; i++) {
        samples[i] = Math.sin(i * 0.05) * (i > 2000 && i < 20000 ? 0.4 : 0.001);
    }
    const track = lipsyncLine('head', {
        text: 'Hello there, round open wide',
        samples, sampleRate: 24000, fps: 24, offsetSec: 0,
    });
    assert.equal(track.path, 'props.viseme');
    const keys = visemeKeysOf(track);
    assert.ok(keys.length > 3, `the lipsync stage gave only ${keys.length} viseme keys`);
    const tracks = visemeMorphTracks('head', keys, matchVisemeMorphs(OCULUS));
    assert.ok(tracks.length > 1, 'a spoken line should move more than one shape');
    for (const t of tracks) {
        assert.match(t.path, /^morph\./);
        // Every weight must be a usable influence, or the renderer gets NaN.
        for (const k of t.keys) {
            assert.ok(Number.isFinite(k.v) && k.v >= 0 && k.v <= 1,
                `${t.path} has an out-of-range weight ${k.v}`);
        }
    }
});

test('reading viseme keys ignores non-string values', () => {
    assert.deepEqual(visemeKeysOf({ keys: [{ t: 0, v: 'open' }, { t: 1, v: null },
                                           { t: 2, v: 3 }] }),
                     [{ t: 0, viseme: 'open' }]);
    assert.deepEqual(visemeKeysOf(null), []);
});

// ------------------------------------------- through the real 3D lipsync stage

test('an IMPORTED head lipsyncs through applyLipsync, on its own node and names', async () => {
    /**
     * The end of the chain, and the two things that stopped it working.
     *
     * `VISEME_SHAPES` names ARKit blendshapes deliberately, so an imported
     * ARKit head always worked. What did not: the channel target was
     * hardcoded to `<speaker>/face`, which is the node the PROCEDURAL rig
     * builds -- an imported mesh called `Wolf3D_Head` got keys on a node that
     * does not exist, and an unresolved target is skipped rather than
     * reported, so nothing moved and nothing said so.
     */
    const { applyLipsync } = await import('../../src/core/art/humanoid3d.js');
    const { createTimeline, key, getTrack } = await import('../../src/core/anim/Timeline.js');

    const track = { target: 'host', path: 'props.viseme',
                    keys: KEYS.map((k) => ({ t: k.t, v: k.viseme })) };
    const mapping = matchVisemeMorphs(OCULUS);

    // Without `faces`: the procedural path, onto `host/face`.
    const bare = createTimeline({ fps: 24 });
    assert.ok(applyLipsync(bare, [track], key) > 0);
    assert.ok(getTrack(bare, 'host/face', 'morph.jawOpen'), 'the procedural path must still work');

    // With `faces`: the imported model's own mesh and its own names.
    const timeline = createTimeline({ fps: 24 });
    const written = applyLipsync(timeline, [track], key, {
        faces: { host: { node: 'host/Wolf3D_Head', mapping } } });
    assert.ok(written > 0, 'nothing was written for the imported head');
    assert.ok(getTrack(timeline, 'host/Wolf3D_Head', 'morph.viseme_aa'),
        'the keys must land on the mesh the model actually has');
    assert.equal(getTrack(timeline, 'host/face', 'morph.jawOpen'), undefined,
        'and NOT on the procedural rig node, which this model does not have');
    assert.equal(trackValueAt(getTrack(timeline, 'host/Wolf3D_Head', 'morph.viseme_aa'), 0.5), 1);
});

test('an unusable mapping falls back to the procedural path rather than going silent', async () => {
    // A head whose names matched nothing must not end up with no lipsync at
    // all: the procedural shapes are still the better of two bad options.
    const { applyLipsync } = await import('../../src/core/art/humanoid3d.js');
    const { createTimeline, key, getTrack } = await import('../../src/core/anim/Timeline.js');
    const track = { target: 'host', path: 'props.viseme',
                    keys: KEYS.map((k) => ({ t: k.t, v: k.viseme })) };
    const timeline = createTimeline({ fps: 24 });
    applyLipsync(timeline, [track], key, {
        faces: { host: { node: 'host/Head', mapping: matchVisemeMorphs(['browInnerUp']) } } });
    assert.ok(getTrack(timeline, 'host/face', 'morph.jawOpen'));
});

test('a declared jaw bone is driven, and an undeclared one is not invented', async () => {
    const { applyLipsync } = await import('../../src/core/art/humanoid3d.js');
    const { createTimeline, key, getTrack } = await import('../../src/core/anim/Timeline.js');
    const track = { target: 'host', path: 'props.viseme',
                    keys: KEYS.map((k) => ({ t: k.t, v: k.viseme })) };
    const mapping = matchVisemeMorphs(OCULUS);

    const withJaw = createTimeline({ fps: 24 });
    applyLipsync(withJaw, [track], key, {
        faces: { host: { node: 'host/Head', jaw: 'host/Bone_Jaw', mapping } } });
    assert.ok(getTrack(withJaw, 'host/Bone_Jaw', 'rotation.x'));

    // Many imported heads drive the chin from the blendshape alone, so a jaw
    // bone is optional rather than assumed.
    const noJaw = createTimeline({ fps: 24 });
    applyLipsync(noJaw, [track], key, { faces: { host: { node: 'host/Head', mapping } } });
    assert.equal(getTrack(noJaw, 'host/jaw', 'rotation.x'), undefined);
});
