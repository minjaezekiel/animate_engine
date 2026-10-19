/**
 * The post chain.
 *
 * Mostly a test about ORDER, because order is where a post chain is wrong in
 * ways that look like a lighting problem: AO after bloom measures depth that
 * no longer exists, antialiasing before a grade is undone by the grade, and a
 * composer without `OutputPass` silently changes the exposure of the whole
 * frame relative to a plain render.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    normalizePost, postIsIdentity, gradeIsIdentity, POST_ORDER,
} from '../../src/core/script/post.js';
import { GradeShader, applyGrade } from '../../src/render/gradeShader.js';

const kinds = (chain) => chain.map((p) => p.kind);

test('passes come back in render order, not declaration order', () => {
    assert.deepEqual(kinds(normalizePost(['smaa', 'bloom', 'ssao', 'grade', 'dof'])), POST_ORDER);
    assert.deepEqual(kinds(normalizePost({ grade: {}, bloom: {} })), ['bloom', 'grade']);
    assert.deepEqual(POST_ORDER, ['ssao', 'bloom', 'dof', 'grade', 'smaa']);
});

test('`meta.bloom` still means what it meant, and is not doubled', () => {
    // Films already in the repo declare `meta.bloom` and nothing else.
    const only = normalizePost(null, { bloom: { strength: 0.6, threshold: 0.88 } });
    assert.deepEqual(kinds(only), ['bloom']);
    assert.equal(only[0].strength, 0.6);
    assert.equal(only[0].threshold, 0.88);
    assert.equal(only[0].radius, 0.5, 'and the unnamed knobs default');

    // Named in both places: one pass, `post` winning. Concatenating would
    // give two bloom passes, which reads as a milky frame nobody asked for.
    const both = normalizePost({ bloom: { strength: 1.4 } }, { bloom: { strength: 0.3 } });
    assert.equal(both.length, 1);
    assert.equal(both[0].strength, 1.4);
});

test('a pass can be switched off by name', () => {
    assert.deepEqual(kinds(normalizePost({ bloom: false }, { bloom: { strength: 1 } })), []);
    assert.deepEqual(kinds(normalizePost({ ssao: true })), ['ssao']);
});

test('an unknown pass warns and is dropped, never thrown', () => {
    const warnings = [];
    const warn = (m, where) => warnings.push(`${m} @ ${where}`);
    assert.deepEqual(kinds(normalizePost({ glitch: true, grade: { grain: 0.02 } }, { warn })), ['grade']);
    assert.deepEqual(kinds(normalizePost(['vhs'], { warn })), []);
    assert.deepEqual(kinds(normalizePost(42, { warn })), []);
    assert.equal(warnings.length, 3);
    assert.ok(warnings[0].includes('meta.post'));
});

test('numbers and triples default per field, and a scalar fills a triple', () => {
    const [g] = normalizePost({ grade: { lift: 0.04, gamma: [1, 0.98, 1.02], contrast: 'loads' } });
    assert.deepEqual(g.lift, [0.04, 0.04, 0.04], 'one number lifts all three channels');
    assert.deepEqual(g.gamma, [1, 0.98, 1.02]);
    assert.equal(g.contrast, 1, 'a non-number falls back rather than reaching the shader');
    assert.deepEqual(g.gain, [1, 1, 1]);
});

test('an identity grade is detected, so it can be skipped entirely', () => {
    // A grade pass at all its defaults is a full-resolution read and write
    // that changes nothing.
    assert.equal(postIsIdentity(normalizePost({ grade: {} })), true);
    assert.equal(postIsIdentity(normalizePost({ grade: { vignette: 0.2 } })), false);
    assert.equal(postIsIdentity(normalizePost({ grade: { lift: [0, 0, 0.01] } })), false);
    assert.equal(postIsIdentity(normalizePost({ bloom: {} })), false, 'bloom is never identity');
    assert.equal(postIsIdentity([]), true);
    assert.equal(gradeIsIdentity(normalizePost({ grade: { grainSize: 2 } })[0]), false);
});

test('the grade shader declares every uniform the normaliser emits', () => {
    const [g] = normalizePost({ grade: {} });
    for (const k of Object.keys(g)) {
        if (k === 'kind') continue;
        const name = k === 'gamma' ? 'gammaC' : k;
        assert.ok(name in GradeShader.uniforms, `no uniform for '${k}'`);
    }
    // And the shader reads every one of them, so none is dead config.
    for (const name of Object.keys(GradeShader.uniforms)) {
        if (name === 'tDiffuse') continue;
        assert.ok(GradeShader.fragmentShader.includes(name),
                  `uniform '${name}' is declared and never used`);
    }
});

test('applyGrade copies values rather than aliasing the film', () => {
    const uniforms = Object.fromEntries(Object.entries(GradeShader.uniforms)
        .map(([k, u]) => [k, { value: Array.isArray(u.value) ? [...u.value] : u.value }]));
    const [g] = normalizePost({ grade: { vignette: 0.3, gamma: [1, 0.9, 1] } });
    applyGrade(uniforms, g, { width: 640, height: 360 });
    assert.equal(uniforms.vignette.value, 0.3);
    assert.deepEqual(uniforms.gammaC.value, [1, 0.9, 1]);
    assert.deepEqual(uniforms.resolution.value, [640, 360]);
    uniforms.gammaC.value[1] = 0.1;
    assert.equal(g.gamma[1], 0.9, 'the uniform must not alias the compiled film');
    // The module-level shader is a template and must stay pristine, or two
    // composers in one page fight over every slider.
    assert.equal(GradeShader.uniforms.vignette.value, 0);
});
