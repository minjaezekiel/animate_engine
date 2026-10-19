/**
 * The grade pass: the lens and the print, as one full-screen shader.
 *
 * Seven effects in one pass rather than seven passes, because each extra
 * `ShaderPass` is another full-resolution read, write and buffer swap, and
 * none of these needs a neighbourhood larger than its own pixel except the
 * two that sample a fixed offset.
 *
 * Plain data, no THREE import: `uniforms` values are numbers and arrays,
 * which is what THREE's uniform setters accept for `float`, `vec2` and
 * `vec3`. So this file stays importable in Node and the shader text is
 * testable as a string, and the same object serves the module path
 * (`ShaderPass`) and the legacy editor (`THREE.GradeShader`).
 *
 * Where it sits in the chain matters: after bloom and defocus, before
 * `OutputPass`. That means the colours arriving here are LINEAR and may
 * exceed 1, so contrast and saturation pivot about 0.5 in linear light
 * rather than about mid-grey in display light.
 *
 * ponytail: linear-light grade, pivoting on 0.5. Correct enough for a look
 * and wrong for matching a reference print; the fix is a log encode either
 * side of the grade, which is a second shader nobody has asked for yet.
 */
export const GradeShader = {
    name: 'GradeShader',

    uniforms: {
        tDiffuse: { value: null },
        resolution: { value: [1280, 720] },
        exposure: { value: 1 },
        contrast: { value: 1 },
        saturation: { value: 1 },
        temperature: { value: 0 },
        tint: { value: 0 },
        lift: { value: [0, 0, 0] },
        gammaC: { value: [1, 1, 1] },
        gain: { value: [1, 1, 1] },
        vignette: { value: 0 },
        vignetteSoftness: { value: 0.45 },
        grain: { value: 0 },
        grainSize: { value: 1.4 },
        chromatic: { value: 0 },
        // Frame time, not wall time. Grain driven by a clock is the one thing
        // in a post chain that can make two renders of the same film differ,
        // and the renderer's whole contract is that frame N is a pure
        // function of N -- so the caller sets this from the frame's t.
        time: { value: 0 },
    },

    vertexShader: /* glsl */`
        varying vec2 vUv;
        void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,

    fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse;
        uniform vec2 resolution;
        uniform float exposure, contrast, saturation, temperature, tint;
        uniform vec3 lift, gammaC, gain;
        uniform float vignette, vignetteSoftness;
        uniform float grain, grainSize, chromatic, time;
        varying vec2 vUv;

        float hash(vec2 p) {
            return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
            vec2 c = vUv - 0.5;
            vec3 col;
            if (chromatic > 0.0) {
                // Lateral chromatic aberration: the three channels are
                // magnified differently about the optical centre, which is
                // what a real lens does -- so the fringe is zero in the
                // middle and widest at the corners, rather than a uniform
                // offset that reads as a printing misregistration.
                float k = chromatic * 0.01;
                col.r = texture2D(tDiffuse, 0.5 + c * (1.0 - k)).r;
                col.g = texture2D(tDiffuse, vUv).g;
                col.b = texture2D(tDiffuse, 0.5 + c * (1.0 + k)).b;
            } else {
                col = texture2D(tDiffuse, vUv).rgb;
            }

            col *= exposure;

            // White balance as a channel trim. A full chromatic adaptation
            // matrix is the correct tool and three times the code; +-1 here
            // covers "warm it up a stop" and nothing is asking for more.
            col.r *= 1.0 + temperature * 0.10;
            col.b *= 1.0 - temperature * 0.10;
            col.g *= 1.0 + tint * 0.10;

            // Lift / gamma / gain, the ASC CDL ordering: lift raises the
            // shadows without touching white, gain scales the whole range,
            // gamma bends the middle.
            col = max(col, 0.0);
            col = gain * (col + lift * (1.0 - min(col, 1.0)));
            col = pow(max(col, 0.0), 1.0 / max(gammaC, vec3(0.001)));

            col = (col - 0.5) * contrast + 0.5;

            float luma = dot(max(col, 0.0), vec3(0.2126, 0.7152, 0.0722));
            col = mix(vec3(luma), col, saturation);

            if (vignette > 0.0) {
                float d = length(c) * 1.41421356;
                float v = 1.0 - smoothstep(1.0 - clamp(vignetteSoftness, 0.001, 0.999), 1.0, d);
                col *= mix(1.0, v, clamp(vignette, 0.0, 1.0));
            }

            if (grain > 0.0) {
                // Quantised to a grain-sized cell so the noise has a SIZE.
                // Per-pixel noise reads as sensor hiss; film grain is
                // clumped, and the difference is visible at any strength.
                vec2 cell = floor(vUv * resolution / max(grainSize, 0.25));
                float nz = hash(cell + vec2(time * 37.0, time * 61.0)) - 0.5;
                // Scaled by luminance: grain lives in the midtones and
                // dies in the blacks, which is why crushed shadows look
                // clean on film.
                col += nz * grain * (0.35 + 0.65 * clamp(luma, 0.0, 1.0));
            }

            gl_FragColor = vec4(max(col, 0.0), 1.0);
        }
    `,
};

/** Push a normalised `grade` entry from `core/script/post.js` onto the uniforms. */
export function applyGrade(uniforms, g, { width, height } = {}) {
    if (width && height) uniforms.resolution.value = [width, height];
    for (const k of ['exposure', 'contrast', 'saturation', 'temperature', 'tint',
                     'vignette', 'vignetteSoftness', 'grain', 'grainSize', 'chromatic']) {
        if (g[k] != null) uniforms[k].value = g[k];
    }
    if (g.lift) uniforms.lift.value = [...g.lift];
    // `gamma` is a reserved word in some GLSL versions and a THREE renderer
    // property elsewhere; the uniform is `gammaC` so nothing shadows it.
    if (g.gamma) uniforms.gammaC.value = [...g.gamma];
    if (g.gain) uniforms.gain.value = [...g.gain];
    return uniforms;
}
