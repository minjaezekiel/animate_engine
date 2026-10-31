/**
 * The drawing model behind the studio's paint surface.
 *
 * Deliberately DOM-free, for the reason `editor/dock.js` is: the interesting
 * bugs in a drawing tool are in the model -- which frame a stroke lands on,
 * what undo removes, where the origin is when you export -- and those are all
 * testable in Node. The page is the thin half.
 *
 * It produces the two things the film format actually consumes:
 *
 *   tool.toPartStrokes()   ->  a rig part's `strokes`, origin at the joint
 *   tool.toDrawing()       ->  a scene `drawings[]` entry
 *
 * Frames and holds come out as an exposure sheet, so a sequence drawn here
 * is read back by `do: 'expose'` without anyone counting frames by hand.
 */

let seq = 0;
const nextId = (prefix) => `${prefix}${++seq}`;

export class DrawTool {
    /**
     * @param {object} [options]
     * @param {number} [options.width=1280]
     * @param {number} [options.height=720]
     */
    constructor({ width = 1280, height = 720 } = {}) {
        this.width = width;
        this.height = height;
        /** @type {{id: string, name: string, visible: boolean, opacity: number, blend: string}[]} */
        this.layers = [];
        /** @type {{id: string, hold: number, strokes: Map<string, object[]>}[]} */
        this.frames = [];
        this.layerIndex = 0;
        this.frameIndex = 0;
        /** Append-only history of what was added, for undo/redo. */
        this._undo = [];
        this._redo = [];
        this.addLayer({ name: 'rough' });
        this.addFrame();
    }

    get layer() { return this.layers[this.layerIndex] ?? null; }
    get frame() { return this.frames[this.frameIndex] ?? null; }

    addLayer({ name, blend = 'normal', opacity = 1, visible = true } = {}) {
        const layer = { id: nextId('L'), name: name ?? `layer ${this.layers.length + 1}`,
                        blend, opacity, visible };
        this.layers.push(layer);
        for (const frame of this.frames) frame.strokes.set(layer.id, []);
        this.layerIndex = this.layers.length - 1;
        return layer;
    }

    removeLayer(id) {
        const i = this.layers.findIndex((l) => l.id === id);
        if (i < 0 || this.layers.length === 1) return false;
        this.layers.splice(i, 1);
        for (const frame of this.frames) frame.strokes.delete(id);
        this.layerIndex = Math.min(this.layerIndex, this.layers.length - 1);
        return true;
    }

    /** A new drawing, held `hold` frames. Inserted after the current one. */
    addFrame({ hold = 2, after = this.frameIndex } = {}) {
        const frame = { id: nextId('F'), hold, strokes: new Map() };
        for (const layer of this.layers) frame.strokes.set(layer.id, []);
        this.frames.splice(after + 1, 0, frame);
        this.frameIndex = Math.min(after + 1, this.frames.length - 1);
        return frame;
    }

    /** Copy the current frame, which is how an in-between actually starts. */
    duplicateFrame() {
        const src = this.frame;
        const frame = this.addFrame({ hold: src?.hold ?? 2 });
        if (src) for (const [layerId, strokes] of src.strokes) {
            frame.strokes.set(layerId, strokes.map((s) => ({ ...s, points: [...s.points] })));
        }
        return frame;
    }

    removeFrame(id) {
        const i = this.frames.findIndex((f) => f.id === id);
        if (i < 0 || this.frames.length === 1) return false;
        this.frames.splice(i, 1);
        this.frameIndex = Math.min(this.frameIndex, this.frames.length - 1);
        return true;
    }

    /**
     * Commit a stroke to the current frame and layer.
     *
     * The stroke is whatever `StrokeRecorder` produced -- points with
     * pressure -- plus the brush settings in force.
     */
    addStroke(stroke) {
        const frame = this.frame, layer = this.layer;
        if (!frame || !layer || !stroke?.points?.length) return null;
        const committed = { ...stroke, id: nextId('S') };
        frame.strokes.get(layer.id).push(committed);
        this._undo.push({ frameId: frame.id, layerId: layer.id, stroke: committed });
        this._redo.length = 0;
        return committed;
    }

    /** Strokes on one frame, bottom layer first, hidden layers skipped. */
    strokesOf(frame = this.frame) {
        if (!frame) return [];
        return this.layers.flatMap((l) => (l.visible ? frame.strokes.get(l.id) ?? [] : []));
    }

    undo() {
        const last = this._undo.pop();
        if (!last) return false;
        const frame = this.frames.find((f) => f.id === last.frameId);
        const list = frame?.strokes.get(last.layerId);
        if (list) list.splice(list.indexOf(last.stroke), 1);
        this._redo.push(last);
        return true;
    }

    redo() {
        const next = this._redo.pop();
        if (!next) return false;
        const frame = this.frames.find((f) => f.id === next.frameId);
        frame?.strokes.get(next.layerId)?.push(next.stroke);
        this._undo.push(next);
        return true;
    }

    /** The bounding box of every stroke on a frame, in canvas pixels. */
    bounds(frame = this.frame) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, pad = 0;
        for (const stroke of this.strokesOf(frame)) {
            pad = Math.max(pad, stroke.size ?? 8);
            for (const p of stroke.points) {
                if (p.x < x0) x0 = p.x;
                if (p.y < y0) y0 = p.y;
                if (p.x > x1) x1 = p.x;
                if (p.y > y1) y1 = p.y;
            }
        }
        if (!Number.isFinite(x0)) return null;
        const m = pad * 0.75 + 2;
        return [x0 - m, y0 - m, x1 + m, y1 + m];
    }

    /**
     * The current frame as a rig part's `strokes`, with `origin` moved to
     * (0, 0).
     *
     * The origin is the JOINT. A part drawn on a canvas and exported without
     * one rotates about wherever the artist happened to start, which is the
     * single most confusing thing a cutout rig can do.
     */
    toPartStrokes({ origin = [0, 0], frame = this.frame } = {}) {
        const [ox, oy] = origin;
        return this.strokesOf(frame).map((stroke) => ({
            brush: stroke.brush ?? 'pencil',
            color: stroke.color ?? '#000000',
            size: stroke.size ?? 8,
            ...(stroke.opacity != null ? { opacity: stroke.opacity } : {}),
            ...(stroke.seed != null ? { seed: stroke.seed } : {}),
            points: stroke.points.map((p) => ({
                x: +(p.x - ox).toFixed(2), y: +(p.y - oy).toFixed(2), p: p.p ?? 1,
            })),
        }));
    }

    /** The current frame as a scene `drawings[]` entry. */
    toDrawing({ id = 'sketch', at = null, frame = this.frame } = {}) {
        const box = this.bounds(frame) ?? [0, 0, this.width, this.height];
        const [x0, y0, x1, y1] = box;
        const width = Math.max(1, Math.ceil(x1 - x0));
        const height = Math.max(1, Math.ceil(y1 - y0));
        return {
            id,
            at: at ?? [Math.round((x0 + x1) / 2), Math.round((y0 + y1) / 2)],
            width, height,
            layers: this.layers.filter((l) => l.visible).map((l) => ({
                name: l.name, blend: l.blend, opacity: l.opacity,
                strokes: (frame?.strokes.get(l.id) ?? []).map((stroke) => ({
                    brush: stroke.brush ?? 'pencil',
                    color: stroke.color ?? '#000000',
                    size: stroke.size ?? 8,
                    points: stroke.points.map((p) => ({
                        x: +(p.x - x0).toFixed(2), y: +(p.y - y0).toFixed(2), p: p.p ?? 1,
                    })),
                })),
            })),
        };
    }

    /**
     * The frame holds as an X-sheet string, ready for `do: 'expose'`.
     *
     * This is the whole reason holds live on frames rather than being counted
     * afterwards: the drawing and its exposure are authored together, which
     * is how an X-sheet has always worked.
     */
    toExposureSheet() {
        return this.frames.map((f) => Math.max(1, Math.round(f.hold))).join(' ');
    }

    /** Total frames the sequence occupies at its declared holds. */
    get duration() {
        return this.frames.reduce((n, f) => n + Math.max(1, Math.round(f.hold)), 0);
    }

    /** Serialise everything, so a session survives a reload. */
    toJSON() {
        return {
            width: this.width, height: this.height,
            layers: this.layers,
            frames: this.frames.map((f) => ({
                id: f.id, hold: f.hold,
                strokes: Object.fromEntries([...f.strokes].map(([k, v]) => [k, v])),
            })),
        };
    }

    static fromJSON(data) {
        const tool = new DrawTool({ width: data.width, height: data.height });
        tool.layers = data.layers?.length ? data.layers.map((l) => ({ ...l })) : tool.layers;
        tool.frames = (data.frames ?? []).map((f) => ({
            id: f.id, hold: f.hold ?? 2,
            strokes: new Map(Object.entries(f.strokes ?? {})),
        }));
        if (!tool.frames.length) tool.addFrame();
        tool.layerIndex = 0;
        tool.frameIndex = 0;
        return tool;
    }
}
