import { AOV_KINDS, isAOV, objectColor } from '../core/render/aov.js';

/**
 * Render one AOV pass off a built 3D scene.
 *
 * Takes THREE as an argument for the reason every module in this directory
 * does: `src/` imports no bare `three` specifier, so the core bundle keeps
 * resolving in Node.
 *
 * # Why a render TARGET and not the canvas
 *
 * The page's renderer is created with `antialias: true`, and an antialiased
 * object pass is not a worse object pass -- it is a WRONG one. A pixel on the
 * boundary between two mattes resolves to the average of two ids, which is a
 * third id: either nobody's, or, with bad luck, a third object's. Masking
 * built on that grows a halo of pixels that belong to something else.
 *
 * So every pass renders into an explicit target with `samples: 0`, which also
 * buys the thing the canvas route cannot give: `readRenderTargetPixels`
 * returns the bytes directly, so the probe that checks a depth pass does not
 * have to encode and decode a PNG to find out what the renderer wrote.
 *
 * # Why the renderer state is saved and restored
 *
 * Tone mapping and `outputColorSpace` exist to make LIGHT look right, and
 * every one of these passes writes DATA. ACES filmic applied to a packed
 * depth value is a number with an S-curve through it; an sRGB transfer
 * function applied to a matte colour is a different colour, which no
 * manifest will match. Both are switched off here and switched back after,
 * because the next frame of the film still wants them.
 */
export function aovTarget(THREE, width, height) {
    return new THREE.WebGLRenderTarget(width, height, {
        type: THREE.UnsignedByteType,
        colorSpace: THREE.NoColorSpace,
        samples: 0,
        depthBuffer: true,
    });
}

/**
 * A top-down RGBA buffer for one pass.
 *
 * `registry` is the backend's id -> object map. The object pass walks the
 * graph from the root carrying the nearest enclosing id, so a mesh inside
 * `set/floor` inside `set` gets `set/floor`'s colour: the most specific
 * matte, which is the one a compositor asked for.
 */
export function captureAOV(THREE, {
    kind, renderer, scene, camera, target, registry = new Map(), width, height,
} = {}) {
    if (!isAOV(kind)) throw new Error(`unknown AOV '${kind}'; try ${AOV_KINDS.join(', ')}`);

    const prev = {
        tone: renderer.toneMapping,
        space: renderer.outputColorSpace,
        clear: new THREE.Color(),
        alpha: renderer.getClearAlpha(),
        override: scene.overrideMaterial,
        background: scene.background,
    };
    renderer.getClearColor(prev.clear);
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    // A film's sky, environment or backdrop colour is a statement about
    // LIGHT. In a depth pass it would be a wall at the near plane.
    scene.background = null;

    const swapped = [];
    const mats = new Map();
    if (kind === 'depth') {
        scene.overrideMaterial = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking });
        // White unpacks to 1.0, which is the far plane -- the true answer for
        // a pixel with nothing in it. Black would unpack to 0 and claim
        // every empty pixel is touching the lens.
        renderer.setClearColor(0xffffff, 1);
    } else if (kind === 'normal') {
        scene.overrideMaterial = new THREE.MeshNormalMaterial();
        renderer.setClearColor(0x000000, 1);
    } else {
        renderer.setClearColor(0x000000, 1);
        const idOf = new Map();
        for (const [id, obj] of registry) if (obj) idOf.set(obj, id);
        const paint = (obj, inherited) => {
            const id = idOf.get(obj) ?? inherited;
            if (obj.isMesh || obj.isPoints || obj.isLine) {
                if (id) {
                    let m = mats.get(id);
                    if (!m) {
                        m = new THREE.MeshBasicMaterial({ toneMapped: false });
                        // Set in LINEAR space so the byte written is the byte
                        // asked for: `setHex` defaults to sRGB and would
                        // convert, and the manifest would then name colours
                        // that are not in the file.
                        m.color.setHex(objectColor(id), THREE.LinearSRGBColorSpace);
                        mats.set(id, m);
                    }
                    swapped.push([obj, obj.material]);
                    obj.material = m;
                }
            }
            for (const c of obj.children) paint(c, id);
        };
        paint(scene, null);
    }

    const t = target ?? aovTarget(THREE, width, height);
    renderer.setRenderTarget(t);
    renderer.clear();
    renderer.render(scene, camera);
    const raw = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(t, 0, 0, width, height, raw);
    renderer.setRenderTarget(null);

    // GL reads bottom-up; an image is top-down. Flipping here rather than in
    // `core/render/aov.js` keeps the pure half free of the one convention
    // that belongs to the graphics API.
    const pixels = new Uint8Array(raw.length);
    const row = width * 4;
    for (let y = 0; y < height; y++) {
        pixels.set(raw.subarray((height - 1 - y) * row, (height - y) * row), y * row);
    }

    for (const [obj, m] of swapped) obj.material = m;
    for (const m of mats.values()) m.dispose();
    scene.overrideMaterial?.dispose?.();
    scene.overrideMaterial = prev.override;
    scene.background = prev.background;
    renderer.toneMapping = prev.tone;
    renderer.outputColorSpace = prev.space;
    renderer.setClearColor(prev.clear, prev.alpha);
    if (!target) t.dispose();

    return { kind, pixels, width, height };
}

/** The pass as a PNG data URL, via a 2D canvas. */
export function aovToPNG({ pixels, width, height }, makeCanvas) {
    const c = makeCanvas(width, height);
    const ctx = c.getContext('2d');
    ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), width, height), 0, 0);
    return c.toDataURL('image/png');
}
