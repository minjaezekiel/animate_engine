import { normalizePost, postIsIdentity } from '../core/script/post.js';
import { GradeShader, applyGrade } from './gradeShader.js';

/**
 * Build an EffectComposer from a declared post chain.
 *
 * The pass classes come in as arguments rather than as imports, for the same
 * reason `SceneAdapter` takes `THREE` as an argument: `src/` stays free of
 * bare `three` specifiers, so the core bundle resolves in Node and the 2D
 * path keeps needing no Three.js at all. A caller that has not imported a
 * given pass simply does not get it, with a diagnostic, instead of the page
 * failing to parse.
 *
 * Returns `setTime`, which is the only reason this is stateful: the grain in
 * the grade pass must advance with the FRAME, not with the wall clock, or two
 * renders of the same film differ. `film3d.html` calls it from `beforeFrame`,
 * beside `built.step(t)`.
 */
export function buildComposer({
    THREE, renderer, scene, camera, width, height,
    post = null, bloom = null,
    EffectComposer, RenderPass, ShaderPass, OutputPass,
    UnrealBloomPass = null, SSAOPass = null, BokehPass = null, SMAAPass = null,
    warn = () => {},
} = {}) {
    const chain = normalizePost(post, { bloom, warn });
    // A chain that is only an identity grade is a full-resolution read and
    // write that changes nothing. Return null and let the caller render
    // straight to the canvas.
    if (!chain.length || postIsIdentity(chain)) return null;
    if (!EffectComposer || !RenderPass || !OutputPass) {
        warn('post-processing needs EffectComposer, RenderPass and OutputPass', 'meta.post');
        return null;
    }

    const composer = new EffectComposer(renderer);
    composer.setSize(width, height);
    composer.addPass(new RenderPass(scene, camera));

    const built = [];
    let gradePass = null;

    for (const p of chain) {
        if (p.kind === 'ssao') {
            if (!SSAOPass) { warn('SSAOPass was not supplied', 'meta.post.ssao'); continue; }
            const pass = new SSAOPass(scene, camera, width, height);
            pass.kernelRadius = p.radius;
            pass.minDistance = p.bias;
            pass.maxDistance = Math.max(p.bias * 2, p.radius * 2);
            // `intensity` is not a field on SSAOPass; the knob it does have
            // is the output mode, so an author asking for a stronger pass
            // gets a larger kernel rather than nothing happening.
            if (p.intensity !== 1) pass.kernelRadius = p.radius * p.intensity;
            if (p.output && p.output !== 'default' && SSAOPass.OUTPUT?.[p.output] != null) {
                pass.output = SSAOPass.OUTPUT[p.output];
            }
            composer.addPass(pass);
            built.push('ssao');
            continue;
        }
        if (p.kind === 'bloom') {
            if (!UnrealBloomPass) { warn('UnrealBloomPass was not supplied', 'meta.post.bloom'); continue; }
            composer.addPass(new UnrealBloomPass(new THREE.Vector2(width, height),
                                                 p.strength, p.radius, p.threshold));
            built.push('bloom');
            continue;
        }
        if (p.kind === 'dof') {
            if (!BokehPass) { warn('BokehPass was not supplied', 'meta.post.dof'); continue; }
            composer.addPass(new BokehPass(scene, camera, {
                focus: p.focus, aperture: p.aperture, maxblur: p.maxblur,
            }));
            built.push('dof');
            continue;
        }
        if (p.kind === 'grade') {
            if (!ShaderPass) { warn('ShaderPass was not supplied', 'meta.post.grade'); continue; }
            // A fresh copy of the uniforms per pass: THREE's ShaderPass
            // clones the uniform object, but the nested `{ value }` holders
            // are shared, so two composers built from the module-level
            // GradeShader would fight over every slider.
            gradePass = new ShaderPass({
                name: GradeShader.name,
                uniforms: Object.fromEntries(Object.entries(GradeShader.uniforms)
                    .map(([k, u]) => [k, { value: Array.isArray(u.value) ? [...u.value] : u.value }])),
                vertexShader: GradeShader.vertexShader,
                fragmentShader: GradeShader.fragmentShader,
            });
            applyGrade(gradePass.uniforms, p, { width, height });
            composer.addPass(gradePass);
            built.push('grade');
            continue;
        }
        if (p.kind === 'smaa') {
            if (!SMAAPass) { warn('SMAAPass was not supplied', 'meta.post.smaa'); continue; }
            composer.addPass(new SMAAPass(width, height));
            built.push('smaa');
        }
    }

    // Always last, always present. A composer without it skips the tone map
    // and the sRGB encode the renderer would have done on its own, so
    // switching post on would otherwise also change the exposure and the
    // gamma of the whole frame.
    composer.addPass(new OutputPass());

    return {
        composer,
        passes: built,
        chain,
        render: () => composer.render(),
        setTime(t) { if (gradePass) gradePass.uniforms.time.value = t; },
        setSize(w, h) {
            composer.setSize(w, h);
            if (gradePass) gradePass.uniforms.resolution.value = [w, h];
        },
        dispose() { composer.dispose?.(); },
    };
}
