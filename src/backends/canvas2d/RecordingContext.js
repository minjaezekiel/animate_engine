/**
 * A CanvasRenderingContext2D-shaped stub that records the draw-call sequence
 * instead of rasterizing.
 *
 * This is why the 2D backend is testable in Node with no native canvas
 * dependency: assert the call list for a known scene and you catch the bugs
 * 2D actually has -- wrong transform order, wrong z-order, a limb drawn
 * before its parent's transform is applied.
 */
export class RecordingContext {
    constructor({ width = 320, height = 180 } = {}) {
        this.calls = [];
        this.canvas = { width, height };
        this.fillStyle = '#000';
        this.strokeStyle = '#000';
        this.lineWidth = 1;
        this.globalAlpha = 1;
        this.lineCap = 'butt';
        this.lineJoin = 'miter';
        this.font = '10px sans-serif';
        this.textAlign = 'start';
        this.textBaseline = 'alphabetic';
    }

    _rec(op, ...args) { this.calls.push([op, ...args.map(round)]); }

    save() { this._rec('save'); }
    restore() { this._rec('restore'); }
    setTransform(a, b, c, d, e, f) { this._rec('setTransform', a, b, c, d, e, f); }
    transform(a, b, c, d, e, f) { this._rec('transform', a, b, c, d, e, f); }
    translate(x, y) { this._rec('translate', x, y); }
    scale(x, y) { this._rec('scale', x, y); }
    rotate(r) { this._rec('rotate', r); }
    clearRect(x, y, w, h) { this._rec('clearRect', x, y, w, h); }
    fillRect(x, y, w, h) { this._rec('fillRect', x, y, w, h, this.fillStyle, this.globalAlpha); }
    strokeRect(x, y, w, h) { this._rec('strokeRect', x, y, w, h); }
    beginPath() { this._rec('beginPath'); }
    closePath() { this._rec('closePath'); }
    moveTo(x, y) { this._rec('moveTo', x, y); }
    lineTo(x, y) { this._rec('lineTo', x, y); }
    quadraticCurveTo(a, b, c, d) { this._rec('quadraticCurveTo', a, b, c, d); }
    bezierCurveTo(a, b, c, d, e, f) { this._rec('bezierCurveTo', a, b, c, d, e, f); }
    arc(x, y, r, s, e, ccw) { this._rec('arc', x, y, r, s, e, ccw ? 1 : 0); }
    ellipse(x, y, rx, ry, rot, s, e) { this._rec('ellipse', x, y, rx, ry, rot, s, e); }
    rect(x, y, w, h) { this._rec('rect', x, y, w, h); }
    fill(p) { this._rec('fill', typeof p === 'string' ? p : (p?.d ?? ''), this.fillStyle, this.globalAlpha); }
    stroke(p) { this._rec('stroke', typeof p === 'string' ? p : (p?.d ?? ''), this.strokeStyle, this.lineWidth); }
    clip() { this._rec('clip'); }
    fillText(t, x, y) { this._rec('fillText', t, x, y, this.fillStyle); }
    strokeText(t, x, y) { this._rec('strokeText', t, x, y); }
    measureText(t) { return { width: String(t).length * 6 }; }
    drawImage(img, ...rest) { this._rec('drawImage', img?.id ?? img?.src ?? 'img', ...rest); }
    createLinearGradient() { return { addColorStop: () => {}, _gradient: true }; }

    /** Call list as compact strings, for golden comparison. */
    log() { return this.calls.map((c) => c.join(' ')); }
}

const round = (v) => (typeof v === 'number' ? +v.toFixed(4) : v);

/** Path2D stand-in that just keeps the `d` string so it can be asserted. */
export class RecordingPath2D {
    constructor(d = '') { this.d = d; }
}
