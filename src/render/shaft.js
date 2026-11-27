/**
 * The light-shaft mesh: `core/render/shaft.js`'s arithmetic, in GLSL.
 *
 * # Why a mesh and not a post pass
 *
 * A shaft belongs to a LIGHT. As a mesh it costs nothing when no light
 * declares one, it moves when the lamp moves, several lamps are several
 * meshes with no chain to order, and a beam whose lamp is off screen still
 * renders -- which a screen-space radial blur from the light's projected
 * position cannot do at all, and which is the common case for a window.
 *
 * The cone is only a RASTERISER. Nothing is read from its surface: the
 * fragment has the eye, the fragment's world position, and the cone's apex
 * and axis from the model matrix, and from those it solves for where its own
 * view ray enters and leaves the cone and integrates between them. So the
 * mesh's tessellation changes the silhouette's smoothness and nothing else,
 * and 48 segments is plenty.
 *
 * `glowMaterial` in `SceneAdapter` is the precedent and this follows it
 * exactly: a raw `ShaderMaterial`, additive, `depthWrite: false`, and the
 * four clipping chunks -- which a raw shader does not get for free, and
 * without which a shaft stays whole across a cutaway and seals the notch.
 *
 * # The two limits, stated where a film can see them
 *
 * ponytail: `side: FrontSide` with the depth test on. That means a shaft is
 * hidden by anything in front of its NEAR surface, which is right, and is
 * not cut where geometry crosses it mid-chord, which is not -- a beam ending
 * on a floor brightens slightly through it. And a camera inside the cone
 * sees nothing, because its front faces are behind the eye. Both want the
 * scene depth texture; sampling the spot's shadow map, which is what carves
 * a window's mullions out of a beam, wants the march this closed form
 * replaces. Named in that order in `core/render/shaft.js`.
 *
 * # Written in linear light, which is why it needs the composer
 *
 * A raw `ShaderMaterial` gets no `tonemapping_fragment` and no
 * `colorspace_fragment`, so this writes linear radiance. Rendering straight
 * to the canvas, every built-in material around it writes DISPLAY values, and
 * an additive blend between the two spaces is meaningless. So a film with a
 * shaft forces the composer on for the same reason a film with fog does --
 * see `force` in `post3d.js` -- and `OutputPass` tone maps the sum.
 */

/**
 * A cone with its apex at the origin, pointing down -Z -- the axis
 * `Object3D.lookAt` aims.
 *
 * `ConeGeometry` is Y-up with its apex at `+height/2`, so it is translated
 * down to put the apex on the origin and then turned a quarter turn about X.
 * Open-ended: the cap is solved for in the shader, and a real cap face would
 * be a second surface for the same view ray to rasterise.
 */
export function shaftGeometry(THREE, { range, angle, radial = 48 }) {
    const radius = range * Math.tan((angle * Math.PI) / 180);
    const g = new THREE.ConeGeometry(radius, range, radial, 1, true);
    g.translate(0, -range / 2, 0);
    g.rotateX(Math.PI / 2);
    return g;
}

export function shaftMaterial(THREE, shaft, color) {
    return new THREE.ShaderMaterial({
        uniforms: {
            uColor: { value: new THREE.Color(shaft.color ?? color ?? '#ffffff') },
            uIntensity: { value: shaft.intensity },
            uDensity: { value: shaft.density },
            uCos: { value: shaft.cosA },
            uRange: { value: shaft.range },
            uRadius: { value: shaft.radius },
            uG: { value: shaft.g },
            uSoft: { value: shaft.soft },
        },
        vertexShader: `
            #include <clipping_planes_pars_vertex>
            varying vec3 vWorld;
            varying vec3 vApex;
            varying vec3 vAxis;
            void main() {
                vec4 world = modelMatrix * vec4(position, 1.0);
                vWorld = world.xyz;
                // The cone's frame, carried across as varyings because
                // modelMatrix is injected into the VERTEX prefix only --
                // naming it in a fragment shader is an undeclared identifier,
                // the program fails to compile, and three reports it as
                // VALIDATE_STATUS false while the frame renders without the
                // mesh and without a page error.
                //
                // Interpolating them is free rather than wrong: both are the
                // same value at every vertex, and a barycentric blend of
                // three identical vectors is that vector.
                vApex = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
                vAxis = normalize(mat3(modelMatrix) * vec3(0.0, 0.0, -1.0));
                vec4 mv = viewMatrix * world;
                gl_Position = projectionMatrix * mv;
                #include <clipping_planes_vertex>
            }`,
        fragmentShader: `
            #include <clipping_planes_pars_fragment>
            uniform vec3 uColor;
            uniform float uIntensity;
            uniform float uDensity;
            uniform float uCos;
            uniform float uRange;
            uniform float uRadius;
            uniform float uG;
            uniform float uSoft;
            varying vec3 vWorld;
            varying vec3 vApex;
            varying vec3 vAxis;

            // Henyey-Greenstein. Forward-scattering is why a shaft appears
            // when you look towards the lamp and nearly vanishes from behind.
            float phaseHG(float cosTheta, float g) {
                float gg = clamp(g, -0.95, 0.95);
                float d = 1.0 + gg * gg - 2.0 * gg * clamp(cosTheta, -1.0, 1.0);
                return (1.0 - gg * gg) / (12.566370614 * pow(max(d, 1e-6), 1.5));
            }

            void main() {
                #include <clipping_planes_fragment>
                // The cone, from the model matrix via the vertex shader, so
                // a lamp that is animated needs nothing updated per frame.
                vec3 A = vApex;
                vec3 V = normalize(vAxis);
                vec3 o = cameraPosition;
                vec3 d = normalize(vWorld - o);

                vec3 co = o - A;
                float dv = dot(d, V), cv = dot(co, V);
                float dc = dot(d, co), cc = dot(co, co);
                float k = uCos * uCos;
                float a = dv * dv - k;
                float b = 2.0 * (dv * cv - k * dc);
                float c = cv * cv - k * cc;

                // Up to three candidate crossings: two off the quadratic and
                // one off the cap plane. Collected as an interval rather than
                // as a sorted list, which GLSL has no comfortable way to do.
                float lo = 1e20, hi = -1e20;
                if (abs(a) < 1e-9) {
                    if (abs(b) > 1e-9) {
                        float t = -c / b;
                        float h = cv + t * dv;
                        if (h >= 0.0 && h <= uRange) { lo = min(lo, t); hi = max(hi, t); }
                    }
                } else {
                    float disc = b * b - 4.0 * a * c;
                    if (disc < 0.0) discard;
                    float s = sqrt(disc);
                    for (int i = 0; i < 2; i++) {
                        float t = (i == 0) ? (-b - s) / (2.0 * a) : (-b + s) / (2.0 * a);
                        // The mirror sheet behind the lamp satisfies the same
                        // equation; without this sign test there is a second
                        // shaft pointing the wrong way.
                        float h = cv + t * dv;
                        if (h >= 0.0 && h <= uRange) { lo = min(lo, t); hi = max(hi, t); }
                    }
                }
                if (abs(dv) > 1e-9) {
                    float t = (uRange - cv) / dv;
                    vec3 p = co + t * d;
                    float len = length(p);
                    if (len > 1e-6 && uRange / len >= uCos - 1e-6) {
                        lo = min(lo, t); hi = max(hi, t);
                    }
                }
                if (hi <= 0.0 || lo > hi) discard;
                float t0 = max(lo, 0.0), t1 = hi;
                if (t1 <= t0) discard;

                // The closed form: one atan per end. A real lamp has a
                // filament, so the apex miss distance is clamped to its
                // radius rather than diverging into one blinding pixel.
                float tc = dot(A - o, d);
                float hperp = max(uRadius, length((A - o) - tc * d));
                float integral = (atan((t1 - tc) / hperp) - atan((t0 - tc) / hperp)) / hperp;

                float rim = 1.0;
                if (uSoft > 0.0) {
                    vec3 p = o + 0.5 * (t0 + t1) * d - A;
                    float len = length(p);
                    if (len > 1e-6) {
                        float rr = min(1.0, acos(clamp(dot(p, V) / len, -1.0, 1.0))
                                            / acos(uCos));
                        rim = 1.0 - smoothstep(1.0 - uSoft, 1.0, rr);
                    }
                }

                float v = uIntensity * uDensity * phaseHG(-dv, uG) * integral * rim;
                if (v <= 0.0) discard;
                gl_FragColor = vec4(uColor * v, 1.0);
            }`,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        clipping: true,
        side: THREE.FrontSide,
    });
}

/**
 * The mesh, aimed from the lamp towards its target.
 *
 * Parented to the light, so it follows a lamp that moves. ponytail: the
 * direction is baked once -- a lamp that moves RELATIVE to its target would
 * keep its original aim, and the upgrade is one `lookAt` per frame in the
 * poser. No film aims a light by moving it.
 */
export function shaftMesh(THREE, { shaft, color, at = [0, 0, 0], target = [0, 0, 0] }) {
    const mesh = new THREE.Mesh(shaftGeometry(THREE, shaft),
                                shaftMaterial(THREE, shaft, color));
    const dir = new THREE.Vector3(target[0] - at[0], target[1] - at[1], target[2] - at[2]);
    // A lamp aimed at its own position has no axis; straight down is what a
    // ceiling fitting does and is the only defensible guess.
    if (dir.lengthSq() < 1e-12) dir.set(0, -1, 0);
    /**
     * `setFromUnitVectors`, not `lookAt`. `lookAt` resolves its target in
     * WORLD space and compensates for the parent's rotation at the moment it
     * is called -- and this mesh is built before it is parented to the lamp,
     * so it would be aimed against a world matrix it does not have yet. The
     * direction is what is known here, so the direction is what is used.
     */
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir.normalize());
    mesh.name = 'shaft';
    // Drawn after the opaque pass, so the additive blend lands on a finished
    // frame rather than on whatever happened to be rasterised first.
    mesh.renderOrder = 10;
    mesh.frustumCulled = false;
    return mesh;
}
