import { normalizePost, postIsIdentity, applyPostSample,
         POST_KEYABLE } from '../core/script/post.js';
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
/**
 * `SSAOPass`'s occlusion window, in the units the shader actually compares.
 *
 * Pure, and exported, because the bug it fixes is invisible: the pass renders,
 * costs its frames and produces nothing, which looks exactly like a scene with
 * no concavities in it. See the call site for the measurement.
 */
export function ssaoDepthWindow(bias, radius, camera = null) {
    const near = camera?.near ?? 0.01;
    const far = camera?.far ?? 200;
    const span = Math.max(1e-6, far - near);
    return {
        minDistance: bias / span,
        maxDistance: Math.max(bias * 2, radius * 2) / span,
    };
}

export function buildComposer({
    THREE, renderer, scene, camera, width, height,
    post = null, bloom = null, samples = 4,
    EffectComposer, RenderPass, ShaderPass, OutputPass,
    UnrealBloomPass = null, SSAOPass = null, BokehPass = null, SMAAPass = null,
    GTAOPass = null,
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

    /**
     * An EXPLICIT multisampled target, which is most of why this whole phase
     * exists.
     *
     * `new EffectComposer(renderer)` allocates its own target with `samples`
     * unset, and `antialias: true` on the renderer governs only the default
     * drawing buffer -- which a composer never draws to. So declaring any
     * pass at all silently turned anti-aliasing off. Measured on one frame of
     * the AK-47 film, as the fraction of high-contrast edges carrying a pixel
     * resolved BETWEEN the two plateaus (a multisample resolve produces one; a
     * point sample cannot): 57.9% with no post, 1.2% with bloom, 1.1% with
     * bloom -> smaa. A factor of fifty, paid for switching on a glow, and
     * `smaa` -- the pass that exists to compensate -- recovered none of it.
     *
     * `HalfFloatType` is what the composer's own default uses; keeping it is
     * what leaves bloom's luminance threshold meaning the same thing.
     */
    const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(
        width, height, { type: THREE.HalfFloatType, samples }));
    composer.setSize(width, height);
    composer.addPass(new RenderPass(scene, camera));

    const built = [];
    let gradePass = null;
    /**
     * The live pass object per kind, so a keyed parameter can be written into
     * it each frame.
     *
     * Held here rather than looked up off `composer.passes` because the
     * composer's array also holds `RenderPass` and `OutputPass`, and matching
     * a pass by constructor name across a minified build is the kind of thing
     * that works until someone bundles it.
     */
    const live = new Map();

    for (const p of chain) {
        if (p.kind === 'ssao') {
            /**
             * GTAO in preference to SSAO, for two measured reasons.
             *
             * `SSAOPass` renders its OWN beauty pass into a render target it
             * allocates with no samples, and outputs that -- so a film that
             * asked for ambient occlusion silently threw away the
             * multisampled frame the composer had just drawn. That is Finding
             * 1 of 42-RENDER-QUALITY all over again, in a different file.
             * `GTAOPass` composites onto `readBuffer`: it renders the scene
             * once more with an override material for depth and normals, and
             * multiplies the denoised occlusion over the frame it was handed.
             *
             * And GTAO's `radius` is in WORLD UNITS, which is what a film
             * script means by one. See the fallback below for what that cost
             * the old pass.
             */
            if (GTAOPass) {
                const pass = new GTAOPass(scene, camera, width, height);
                pass.updateGtaoMaterial({
                    radius: p.radius,
                    // How fast occlusion falls off with distance, and how
                    // thick a surface is assumed to be when something passes
                    // behind it. Three's own defaults; nothing in a film
                    // script has ever wanted to say otherwise.
                    distanceExponent: 1, thickness: 1, scale: 1,
                });
                pass.blendIntensity = p.intensity;
                if (p.output && p.output !== 'default' && GTAOPass.OUTPUT?.[p.output] != null) {
                    pass.output = GTAOPass.OUTPUT[p.output];
                }
                composer.addPass(pass);
                live.set('ssao', pass);
                built.push('ssao');
                continue;
            }
            if (!SSAOPass) { warn('neither GTAOPass nor SSAOPass was supplied', 'meta.post.ssao'); continue; }
            const pass = new SSAOPass(scene, camera, width, height);
            pass.kernelRadius = p.radius;
            /**
             * `minDistance` and `maxDistance` are NOT world units.
             *
             * The shader compares a difference of orthographic depths
             * normalised over `[near, far]`, so a world distance divides by
             * `far - near` before it means anything here. This adapter passed
             * metres: with the film camera's 0.01..200 range, `bias: 0.008`
             * asked the pass to count occlusion only where the depth gap was
             * between **1.6 m and 48 m**, in scenes where the whole subject is
             * under a metre. Ambient occlusion was arithmetically impossible,
             * which is why the pass existed for six phases and no film used it.
             */
            Object.assign(pass, ssaoDepthWindow(p.bias, p.radius, camera));
            // `intensity` is not a field on SSAOPass; the knob it does have
            // is the output mode, so an author asking for a stronger pass
            // gets a larger kernel rather than nothing happening.
            if (p.intensity !== 1) pass.kernelRadius = p.radius * p.intensity;
            if (p.output && p.output !== 'default' && SSAOPass.OUTPUT?.[p.output] != null) {
                pass.output = SSAOPass.OUTPUT[p.output];
            }
            composer.addPass(pass);
            live.set('ssao', pass);
            built.push('ssao');
            continue;
        }
        if (p.kind === 'bloom') {
            if (!UnrealBloomPass) { warn('UnrealBloomPass was not supplied', 'meta.post.bloom'); continue; }
            const bloomPass = new UnrealBloomPass(new THREE.Vector2(width, height),
                                                 p.strength, p.radius, p.threshold);
            composer.addPass(bloomPass);
            live.set('bloom', bloomPass);
            built.push('bloom');
            continue;
        }
        if (p.kind === 'dof') {
            if (!BokehPass) { warn('BokehPass was not supplied', 'meta.post.dof'); continue; }
            const bokeh = new BokehPass(scene, camera, {
                focus: p.focus, aperture: p.aperture, maxblur: p.maxblur,
            });
            composer.addPass(bokeh);
            live.set('dof', bokeh);
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
            live.set('grade', gradePass);
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

    /**
     * Write a keyed post value into the pass that owns it.
     *
     * Each pass type keeps its parameters somewhere different, which is the
     * whole reason this is a table rather than `pass[param] = v`:
     * `BokehPass` holds them in `uniforms`, `UnrealBloomPass` as plain
     * fields, and the grade is a `ShaderPass` whose uniforms this module
     * built itself. Getting that wrong is silent -- the number lands on an
     * object nobody reads and the image does not change -- so each one is
     * named here rather than guessed.
     */
    const WRITERS = {
        dof: (pass, param, v) => {
            // `maxblur`'s uniform is spelled without the camel case the
            // constructor option uses.
            const u = pass.uniforms ?? pass.materialBokeh?.uniforms;
            const name = param === 'maxblur' ? 'maxblur' : param;
            if (u?.[name]) u[name].value = v;
        },
        bloom: (pass, param, v) => { pass[param] = v; },
        // GTAO has a real intensity; SSAO does not, so for it a stronger
        // pass is a wider kernel, which is the closest thing it has.
        ssao: (pass, param, v) => {
            if ('blendIntensity' in pass) { pass.blendIntensity = v; return; }
            pass.kernelRadius = chain.find((p) => p.kind === 'ssao').radius * v;
        },
        grade: (pass, param, v) => { if (pass.uniforms?.[param]) pass.uniforms[param].value = v; },
    };

    /** What each live pass is currently showing, so a frame writes only changes. */
    const shown = new Map();

    return {
        composer,
        passes: built,
        chain,
        render: () => composer.render(),
        /**
         * Push this frame's sampled post channels into the passes.
         *
         * `sampled` is whatever `samplePose` produced for the `__post`
         * target: `{ 'dof.focus': 4.2, ... }`. Absent, nothing moves, which
         * is what every film without keyed post gets -- so this costs those
         * films one map lookup per frame and no writes.
         */
        setParams(sampled) {
            if (!sampled) return null;
            const next = applyPostSample(chain, sampled);
            if (next === chain) return null;
            for (const [i, p] of next.entries()) {
                const pass = live.get(p.kind);
                const writer = WRITERS[p.kind];
                if (!pass || !writer) continue;
                for (const param of POST_KEYABLE[p.kind] ?? []) {
                    const v = p[param];
                    const k = `${p.kind}.${param}`;
                    if (typeof v !== 'number' || shown.get(k) === v) continue;
                    if (v === chain[i][param] && !shown.has(k)) continue;
                    writer(pass, param, v);
                    shown.set(k, v);
                }
            }
            return next;
        },
        setTime(t) { if (gradePass) gradePass.uniforms.time.value = t; },
        setSize(w, h) {
            composer.setSize(w, h);
            if (gradePass) gradePass.uniforms.resolution.value = [w, h];
        },
        dispose() { composer.dispose?.(); },
    };
}
