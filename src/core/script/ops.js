/**
 * The headless operation table.
 *
 * One declarative list of operations, their parameters and their
 * documentation. `mcp/paint-server.js` **generates** its tool schemas from
 * this, rather than hand-registering each one -- the existing MCP server
 * duplicates its op list in a doc string and the two have already drifted,
 * which is the failure this table exists to prevent.
 *
 * ```js
 * const ctx = await createContext();
 * await run(ctx, 'paint_create', { id: 'sketch', width: 800, height: 600 });
 * await run(ctx, 'paint_stroke', { doc: 'sketch', layer: 'layer1',
 *                                  path: 'M 50 300 C 250 80, 550 80, 750 300',
 *                                  brush: 'ink', color: '#111', size: 18 });
 * await run(ctx, 'paint_render', { doc: 'sketch', out: 'sketch.png' });
 * ```
 *
 * # Why these run headless
 *
 * The paint and motion layers read no clock, no DOM and no GPU, so they
 * run in Node exactly as they do in a browser. That matters most for an
 * agent: it can draw, render a PNG and look at the result without a
 * browser session to attach to, which is what the existing WebSocket
 * bridge requires. The browser bridge stays for the live 3D editor, which
 * genuinely needs WebGL.
 *
 * # Design for a caller that cannot see the screen
 *
 * Every op returns a structured summary rather than a bare "ok", because
 * an agent's only feedback is what comes back. A stroke reports how many
 * dabs it laid down, so "nothing appeared" is distinguishable from "it
 * appeared off-frame". A render reports the inked fraction, so a blank
 * frame is detectable without opening the file. Discovery ops
 * (`list_brushes`, `list_blend_modes`, `list_effects`) exist so nothing
 * has to be guessed from a name.
 */
import { loadKernels } from '../../kernels/index.js';
import { PaintDocument } from '../paint/Document.js';
import { PaintSurface } from '../paint/Surface.js';
import { BRUSHES, BRUSH_NAMES, brush as resolveBrush } from '../paint/brushes.js';
import { BLEND_MODE_NAMES } from '../../kernels/index.js';
import { PhotoMotion, EFFECTS } from '../motion/PhotoMotion.js';
import { textureFromImage } from '../paint/texture.js';

/**
 * A session: the kernels plus whatever documents have been created.
 *
 * Held per server process. Documents are addressed by the id the caller
 * chose, so a conversation can refer to "sketch" across many calls
 * without threading a handle through its own messages.
 */
export async function createContext({ io } = {}) {
    return {
        kernels: await loadKernels(),
        docs: new Map(),
        photos: new Map(),
        textures: new Map(),
        /**
         * File access, injected so the table itself stays pure and
         * testable. A server supplies real `node:fs`; a test supplies a
         * map in memory.
         */
        io: io ?? (await defaultIO()),
    };
}

async function defaultIO() {
    const { readFileSync, writeFileSync, mkdirSync } = await import('node:fs');
    const { dirname } = await import('node:path');
    const { encodePNG, decodePNG } = await import('../../io/png.js');
    return {
        readImage: (path) => decodePNG(readFileSync(path)),
        writeImage: (path, width, height, rgba) => {
            mkdirSync(dirname(path), { recursive: true });
            writeFileSync(path, encodePNG(width, height, rgba));
        },
    };
}

/** Look a document up, or fail with the ids that do exist. */
function doc(ctx, id) {
    const found = ctx.docs.get(id);
    if (!found) {
        throw new Error(`no paint document "${id}"; have: `
            + `${[...ctx.docs.keys()].join(', ') || '(none)'}`);
    }
    return found;
}

/** Build a stroke object from op arguments. */
function strokeFrom(args) {
    const stroke = {
        brush: args.brush ?? 'pen',
        size: args.size,
        color: args.color ?? '#000000',
        opacity: args.opacity ?? 1,
        seed: args.seed ?? 0,
    };
    if (args.points) stroke.points = args.points;
    else stroke.path = args.path;
    if (args.pressure) stroke.pressure = args.pressure;
    if (args.brushOverrides) stroke.brushOverrides = args.brushOverrides;
    return stroke;
}

/**
 * The pixel extent a stroke's dabs occupy, including their radii.
 *
 * Read off the resampled dabs rather than the input points, so it
 * accounts for brush size, taper and jitter -- a one-point tap with a
 * 60px brush covers 60px, not zero.
 */
function strokeBounds(surface, stroke) {
    const { resampled } = surface._prepare(stroke);
    if (!resampled.count) return null;
    const s = resampled.stamps;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < resampled.count; i++) {
        const o = i * 6;
        const r = s[o + 2];
        x0 = Math.min(x0, s[o] - r); x1 = Math.max(x1, s[o] + r);
        y0 = Math.min(y0, s[o + 1] - r); y1 = Math.max(y1, s[o + 1] + r);
    }
    const round = (v) => Math.round(v * 10) / 10;
    return { x0: round(x0), y0: round(y0), x1: round(x1), y1: round(y1) };
}

/** How much of a buffer carries ink, as a fraction. */
function inkedFraction(buffer, pixels) {
    let n = 0;
    for (let i = 3; i < pixels * 4; i += 4) if (buffer.array[i] > 0.01) n++;
    return n / pixels;
}

const S = (doc, required = false) => ({ type: 'string', doc, required });
const N = (doc, required = false) => ({ type: 'number', doc, required });
const B = (doc) => ({ type: 'boolean', doc });

/**
 * The operations.
 *
 * Each has a `summary` written for a reader who cannot see the result,
 * `params` with per-field documentation, and `run(ctx, args)`.
 */
export const OPS = {
    // --- discovery ---------------------------------------------------
    list_brushes: {
        summary: 'List every brush, with the properties that describe how it behaves. '
            + 'Call this before drawing rather than guessing a brush name.',
        params: {},
        run: () => BRUSH_NAMES.map((name) => {
            const b = BRUSHES[name];
            return {
                name,
                size: b.size,
                hardness: b.hardness,
                flow: b.flow,
                accumulation: b.mode === 1 ? 'build-up' : 'peak',
                taper: b.taper || undefined,
                nib: b.aspect < 1 ? { aspect: b.aspect, angleMode: b.angleMode } : undefined,
                grain: b.grain || undefined,
                wet: b.wet ? { smudge: b.smudge, colorRate: b.colorRate } : undefined,
                erase: b.erase || undefined,
            };
        }),
    },

    list_blend_modes: {
        summary: 'List the layer blend modes. The last four are non-separable: '
            + 'hue, saturation, color and luminosity transplant one attribute of a '
            + 'colour onto another and cannot be computed per channel.',
        params: {},
        run: () => BLEND_MODE_NAMES,
    },

    list_effects: {
        summary: 'List the photo-motion effects usable in photo_create, each with its '
            + 'fields explained. Call this before writing an effect spec.',
        params: {},
        run: () => EFFECTS.map((type) => ({ type, ...EFFECT_DOCS[type] })),
    },

    // --- documents ----------------------------------------------------
    paint_create: {
        summary: 'Create a paint document with one layer. Returns its id and size.',
        params: {
            id: S('Name to refer to this document by in later calls.', true),
            width: N('Pixels.', true),
            height: N('Pixels.', true),
            layer: S('Name of the first layer. Defaults to "layer1".'),
        },
        run: (ctx, a) => {
            if (ctx.docs.has(a.id)) throw new Error(`paint document "${a.id}" already exists`);
            const d = new PaintDocument(ctx.kernels, a.width, a.height);
            d.addLayer({ name: a.layer ?? 'layer1' });
            // Textures loaded in this session are shared with every
            // surface, so `paint_load_texture` applies to layers created
            // before or after it.
            ctx.docs.set(a.id, d);
            return { id: a.id, width: a.width, height: a.height, layers: ['layer1'] };
        },
    },

    paint_list: {
        summary: 'List the open paint documents with their size and every layer\'s name, '
            + 'blend mode, opacity, visibility, clipping and whether it has a mask.',
        params: {},
        run: (ctx) => [...ctx.docs.entries()].map(([id, d]) => ({
            id,
            width: d.width,
            height: d.height,
            layers: d.layers.map((l) => ({
                name: l.name, blend: l.blend, opacity: l.opacity,
                visible: l.visible, clip: l.clip, hasMask: !!l.mask,
            })),
        })),
    },

    paint_dispose: {
        summary: 'Release a paint document and all of its layer buffers. Call this when '
            + 'finished with a document; they are large (33 MB per layer at 1080p).',
        params: { id: S('Document id.', true) },
        run: (ctx, a) => { doc(ctx, a.id).dispose(); ctx.docs.delete(a.id); return { disposed: a.id }; },
    },

    // --- layers --------------------------------------------------------
    paint_add_layer: {
        summary: 'Add a layer on top of the stack, or at a given index. Layers are '
            + 'addressed by name everywhere else, so choose a descriptive one.',
        params: {
            doc: S('Document id.', true),
            name: S('Layer name, used to address it later.', true),
            blend: S('Blend mode; see list_blend_modes. Default "normal".'),
            opacity: N('0..1. Default 1.'),
            clip: B('Clip to the layer below, showing this layer only where that one is '
                + 'opaque. Use for shading or colour confined to a subject.'),
            at: N('Insert at this index instead of on top. 0 is the bottom.'),
        },
        run: (ctx, a) => {
            const d = doc(ctx, a.doc);
            d.addLayer({
                name: a.name, blend: a.blend ?? 'normal', opacity: a.opacity ?? 1,
                clip: a.clip ?? false, at: a.at,
            });
            return { layers: d.layers.map((l) => l.name) };
        },
    },

    paint_set_layer: {
        summary: 'Change a layer\'s blend mode, opacity, visibility or clipping without '
            + 'touching its pixels.',
        params: {
            doc: S('Document id.', true),
            layer: S('Layer name.', true),
            blend: S('Blend mode.'),
            opacity: N('0..1.'),
            visible: B('Hide or show.'),
            clip: B('Clip to the layer below.'),
        },
        run: (ctx, a) => {
            const l = doc(ctx, a.doc).layer(a.layer);
            if (a.blend !== undefined) l.blend = a.blend;
            if (a.opacity !== undefined) l.opacity = a.opacity;
            if (a.visible !== undefined) l.visible = a.visible;
            if (a.clip !== undefined) l.clip = a.clip;
            return {
                name: l.name, blend: l.blend, opacity: l.opacity,
                visible: l.visible, clip: l.clip,
            };
        },
    },

    paint_reorder_layer: {
        summary: 'Move a layer to a new position in the stack, where 0 is the bottom. '
            + 'Order matters for every blend mode except normal.',
        params: {
            doc: S('Document id.', true), layer: S('Layer name.', true),
            to: N('New index.', true),
        },
        run: (ctx, a) => {
            const d = doc(ctx, a.doc);
            d.reorder(a.layer, a.to);
            return { layers: d.layers.map((l) => l.name) };
        },
    },

    paint_remove_layer: {
        summary: 'Delete a layer and release its buffers. Any layer clipped to it '
            + 'loses its base and will then draw unclipped.',
        params: { doc: S('Document id.', true), layer: S('Layer name.', true) },
        run: (ctx, a) => {
            const d = doc(ctx, a.doc);
            d.removeLayer(a.layer);
            return { layers: d.layers.map((l) => l.name) };
        },
    },

    paint_clear_layer: {
        summary: 'Erase a layer back to transparent, keeping the layer itself and its '
            + 'blend mode, opacity and mask.',
        params: { doc: S('Document id.', true), layer: S('Layer name.', true) },
        run: (ctx, a) => { doc(ctx, a.doc).layer(a.layer).clear(); return { cleared: a.layer }; },
    },

    // --- masks ----------------------------------------------------------
    paint_add_mask: {
        summary: 'Give a layer a mask. It starts fully opaque, hiding nothing; '
            + 'paint on it with paint_mask_stroke using an eraser brush to hide parts.',
        params: {
            doc: S('Document id.', true), layer: S('Layer name.', true),
            fill: N('Starting coverage 0..1. Default 1 (nothing hidden).'),
        },
        run: (ctx, a) => {
            doc(ctx, a.doc).layer(a.layer).addMask({ fill: a.fill ?? 1 });
            return { layer: a.layer, mask: 'created' };
        },
    },

    paint_mask_stroke: {
        summary: 'Paint on a layer\'s mask. An eraser brush hides the layer there; '
            + 'an ordinary brush reveals it again.',
        params: {
            doc: S('Document id.', true), layer: S('Layer name.', true),
            path: S('SVG path data, e.g. "M 20 100 C 90 20, 210 20, 280 100".'),
            points: { type: 'array', doc: 'Explicit [{x,y,p}] points, instead of path.' },
            brush: S('Brush name; see list_brushes.'),
            size: N('Diameter in pixels.'),
            opacity: N('0..1.'),
        },
        run: (ctx, a) => {
            const l = doc(ctx, a.doc).layer(a.layer);
            const dabs = l.paintMask(strokeFrom({ ...a, color: '#000000' }));
            return { layer: a.layer, dabs };
        },
    },

    // --- drawing ---------------------------------------------------------
    paint_stroke: {
        summary: 'Draw a stroke. Give `path` as SVG path data -- one line instead of '
            + 'hundreds of coordinates. Returns the number of dabs laid down, which is '
            + '0 if the stroke fell outside the canvas.',
        params: {
            doc: S('Document id.', true),
            layer: S('Layer name.', true),
            path: S('SVG path data. Supports M L H V C S Q T Z, absolute and relative. '
                + 'Arcs (A) are not supported.'),
            points: { type: 'array', doc: 'Explicit [{x,y,p}] points, instead of path. '
                + '`p` is pressure 0..1.' },
            brush: S('Brush name; see list_brushes. Default "pen".'),
            color: S('Hex colour, e.g. "#1a2b3c".'),
            size: N('Diameter in pixels. Defaults to the brush\'s own size.'),
            opacity: N('0..1.'),
            pressure: { type: 'array', doc: '[start, end] pressure ramped along the path.' },
            seed: N('Changes the pattern of a brush with jitter.'),
            progress: N('0..1, draw only the first fraction of the stroke. '
                + 'The stroke is revealed from its start, so this is a draw-on.'),
            brushOverrides: { type: 'object', doc: 'Per-stroke brush property overrides, '
                + 'e.g. {"hardness":1,"aspect":0.2,"angle":0.7}.' },
        },
        run: (ctx, a) => {
            const d = doc(ctx, a.doc);
            const layer = d.layer(a.layer);
            const stroke = strokeFrom(a);
            const dabs = layer.draw(stroke, { progress: a.progress ?? 1 });

            // Report where the stroke actually landed.
            //
            // A caller that cannot see the canvas needs to distinguish
            // three outcomes that all look like success: it drew, it drew
            // nothing, and it drew somewhere off the canvas. The third is
            // the trap -- a stroke at (-500, -500) resamples into hundreds
            // of dabs and returns a healthy-looking count while leaving
            // the picture untouched.
            const bounds = strokeBounds(layer.surface, stroke);
            const offCanvas = bounds && (bounds.x1 < 0 || bounds.y1 < 0
                || bounds.x0 > d.width || bounds.y0 > d.height);
            return {
                layer: a.layer,
                dabs,
                bounds,
                note: dabs === 0
                    ? 'no dabs -- the stroke is empty; check `path` or `points`'
                    : offCanvas
                        ? `drawn entirely outside the ${d.width}x${d.height} canvas; `
                          + 'nothing will appear'
                        : undefined,
            };
        },
    },

    paint_load_texture: {
        summary: 'Load a PNG as a named brush grain texture, usable via '
            + 'brushOverrides {"grain":0.7,"grainAsset":"<name>"}.',
        params: {
            name: S('Name to reference it by.', true),
            path: S('Path to a PNG.', true),
            strength: N('0..1, how deeply the grain cuts. Default 1.'),
            invert: B('Invert the image first.'),
        },
        run: (ctx, a) => {
            const image = ctx.io.readImage(a.path);
            const tile = textureFromImage(image, {
                strength: a.strength ?? 1, invert: a.invert ?? false,
            });
            ctx.textures.set(a.name, tile);
            for (const d of ctx.docs.values()) {
                for (const l of d.layers) {
                    l.surface.textures = ctx.textures;
                    if (l.mask) l.mask.textures = ctx.textures;
                }
            }
            return { name: a.name, width: tile.width, height: tile.height };
        },
    },

    // --- output ------------------------------------------------------------
    paint_render: {
        summary: 'Flatten the document and write a PNG. Returns the inked fraction, '
            + 'so a blank result is detectable without opening the file.',
        params: {
            doc: S('Document id.', true),
            out: S('File path to write.', true),
        },
        run: (ctx, a) => {
            const d = doc(ctx, a.doc);
            d.flatten();
            const rgba = d.toRgba8();
            ctx.io.writeImage(a.out, d.width, d.height, rgba);
            return {
                out: a.out, width: d.width, height: d.height,
                inked: Number(inkedFraction(d.composite, d.width * d.height).toFixed(4)),
            };
        },
    },

    // --- photo motion --------------------------------------------------------
    photo_create: {
        summary: 'Load a still picture and give it motion. Effects deform a textured '
            + 'mesh over time; see list_effects. A depth map enables parallax.',
        params: {
            id: S('Name to refer to it by.', true),
            source: S('Path to a PNG.', true),
            width: N('Output width. Defaults to the source width.'),
            height: N('Output height. Defaults to the source height.'),
            depth: S('Path to a greyscale PNG depth map; white is near. '
                + 'Required for parallax to do anything.'),
            duration: N('Seconds the effects span. Default 1.'),
            effects: { type: 'array', doc: 'Effect specs, applied in order. '
                + 'See list_effects for each one\'s fields.' },
            grid: N('Mesh quads across. Default 32; raise it for a detailed depth map.'),
            tear: { type: 'boolean', doc: 'Cut the mesh at depth edges so a near subject '
                + 'separates cleanly instead of stretching across the gap. Needs a depth '
                + 'map. Use it whenever parallax amplitude is above about 0.05.' },
        },
        run: (ctx, a) => {
            if (ctx.photos.has(a.id)) throw new Error(`photo "${a.id}" already exists`);
            const source = ctx.io.readImage(a.source);
            const depth = a.depth ? ctx.io.readImage(a.depth) : undefined;
            const photo = new PhotoMotion(ctx.kernels, {
                width: a.width ?? source.width,
                height: a.height ?? source.height,
                source, depth,
                duration: a.duration ?? 1,
                effects: a.effects ?? [],
                grid: a.grid,
                tear: a.tear ?? false,
            });
            ctx.photos.set(a.id, photo);
            return {
                id: a.id, width: photo.width, height: photo.height,
                duration: photo.duration, overscan: Number(photo.overscan.toFixed(3)),
                effects: photo.effects.map((e) => e.type),
                depth: depth ? 'loaded' : 'none -- parallax will do nothing',
                // Reported rather than echoed: `tear` silently does nothing
                // without a depth map, and a caller that cannot see the
                // screen has no other way to learn that.
                tear: photo.tear
                    ? { levels: photo.tearLevels, fillPx: Number(photo.tearFill.toFixed(1)) }
                    : (a.tear ? 'ignored -- tearing needs a depth map' : false),
            };
        },
    },

    photo_render: {
        summary: 'Render one frame of a photo at time t and write it as a PNG. Use this '
            + 'to check a single moment before committing to a whole sequence.',
        params: {
            id: S('Photo id.', true),
            t: N('Time in seconds.', true),
            out: S('File path to write.', true),
        },
        run: (ctx, a) => {
            const photo = ctx.photos.get(a.id);
            if (!photo) throw new Error(`no photo "${a.id}"`);
            const rgba = photo.imageDataAt(a.t);
            ctx.io.writeImage(a.out, photo.width, photo.height, rgba);
            return { out: a.out, t: a.t, width: photo.width, height: photo.height };
        },
    },

    photo_render_sequence: {
        summary: 'Render a whole photo animation as numbered PNG frames.',
        params: {
            id: S('Photo id.', true),
            out: S('Path pattern containing "####", replaced by the frame number, '
                + 'e.g. "out/frame-####.png".', true),
            fps: N('Frames per second. Default 24.'),
            duration: N('Seconds. Defaults to the photo\'s own duration.'),
        },
        run: (ctx, a) => {
            const photo = ctx.photos.get(a.id);
            if (!photo) throw new Error(`no photo "${a.id}"`);
            const fps = a.fps ?? 24;
            const duration = a.duration ?? photo.duration;
            const frames = Math.max(1, Math.round(fps * duration));
            if (!a.out.includes('####')) {
                throw new Error('out must contain "####" for the frame number');
            }
            for (let i = 0; i < frames; i++) {
                const rgba = photo.imageDataAt(i / fps);
                ctx.io.writeImage(a.out.replace('####', String(i).padStart(4, '0')),
                    photo.width, photo.height, rgba);
            }
            return { frames, fps, duration, pattern: a.out };
        },
    },

    photo_dispose: {
        summary: 'Release a photo and its source, depth and output buffers. Call this '
            + 'when finished with it.',
        params: { id: S('Photo id.', true) },
        run: (ctx, a) => {
            const photo = ctx.photos.get(a.id);
            if (!photo) throw new Error(`no photo "${a.id}"`);
            photo.dispose();
            ctx.photos.delete(a.id);
            return { disposed: a.id };
        },
    },
};

/** Per-effect documentation, surfaced through `list_effects`. */
const EFFECT_DOCS = {
    kenBurns: {
        summary: 'An eased pan and zoom. The degenerate case of a mesh deform.',
        fields: {
            from: '{zoom, x, y} at the start. x and y are fractions of the frame.',
            to: '{zoom, x, y} at the end.',
            ease: '"smooth" (default) or "linear". Linear starts and stops abruptly.',
        },
    },
    parallax: {
        summary: 'Push each point by its depth times a camera offset, so near things '
            + 'move further than far ones. Needs a depth map.',
        fields: {
            amplitude: 'Fraction of width. 0.04 is subtle, beyond ~0.08 the subject '
                + 'visibly stretches because nothing inpaints behind it.',
            focus: 'The depth that stays still, 0..1. Default 0.5.',
            orbit: '[x, y] radii of a slow elliptical drift. Default [1, 0.4].',
            speed: 'Orbits per duration. Default 1.',
            path: 'Explicit [[x,y], ...] camera offsets instead of an orbit.',
        },
    },
    wave: {
        summary: 'A travelling sinusoid, for water, heat haze or cloth.',
        fields: {
            amplitude: 'Fraction of height. Default 0.005.',
            wavelength: 'Fraction of the frame. Default 0.3.',
            speed: 'Cycles per second. Default 0.5.',
            axis: '"y" (default) displaces vertically, "x" horizontally.',
            range: '[v0, v1] confines it to part of the frame, e.g. [0.6, 1] for water '
                + 'below a horizon.',
        },
    },
    puppet: {
        summary: 'Drag pinned points and let the surface follow, with a smooth falloff.',
        fields: {
            pins: '[{at:[x,y], to:[x,y], radius?}] in normalised coordinates.',
            radius: 'Default influence radius for pins that omit one. Default 0.25.',
            ease: '"smooth" (default) or "linear".',
        },
    },
};

/** Op names, for a server enumerating them. */
export const OP_NAMES = Object.keys(OPS);

/**
 * Run one op.
 *
 * Unknown ops fail with the list of known ones rather than a bare error,
 * because the caller may be a model that guessed a plausible name, and the
 * correction is more useful than the rejection.
 */
export async function run(ctx, name, args = {}) {
    const op = OPS[name];
    if (!op) throw new Error(`unknown op "${name}". Known: ${OP_NAMES.join(', ')}`);
    for (const [key, spec] of Object.entries(op.params)) {
        if (spec.required && args[key] === undefined) {
            throw new Error(`op "${name}" requires "${key}": ${spec.doc}`);
        }
    }
    return op.run(ctx, args);
}
