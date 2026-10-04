/**
 * Value interpolation per track type. Pure.
 *
 * Interpolation happens at sample time rather than by pre-densifying keys
 * into a fixed-rate track. That matters: the old engine densified bezier
 * segments at 30fps and then rendered at other rates, which quantized the
 * easing. Sampling directly means the curve is exact at whatever fps the
 * render uses.
 */

const lerpNum = (a, b, u) => a + (b - a) * u;

export function lerpVec(a, b, u) {
    const out = new Array(a.length);
    for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * u;
    return out;
}

/** Shortest-arc quaternion slerp on [x, y, z, w]. */
export function slerpQuat(a, b, u) {
    let [ax, ay, az, aw] = a;
    let [bx, by, bz, bw] = b;
    let cos = ax * bx + ay * by + az * bz + aw * bw;
    if (cos < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; cos = -cos; }
    if (cos > 0.9995) {
        const out = [lerpNum(ax, bx, u), lerpNum(ay, by, u), lerpNum(az, bz, u), lerpNum(aw, bw, u)];
        const l = Math.hypot(...out) || 1;
        return out.map((v) => v / l);
    }
    const theta = Math.acos(cos);
    const sin = Math.sin(theta);
    const wa = Math.sin((1 - u) * theta) / sin;
    const wb = Math.sin(u * theta) / sin;
    return [ax * wa + bx * wb, ay * wa + by * wb, az * wa + bz * wb, aw * wa + bw * wb];
}

/** #rrggbb (or 0xRRGGBB number) interpolation in sRGB. Good enough for 2D fills. */
export function lerpColor(a, b, u) {
    const parse = (c) => {
        if (typeof c === 'number') return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
        const h = String(c).replace('#', '');
        const s = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
        return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
    };
    const [r1, g1, b1] = parse(a);
    const [r2, g2, b2] = parse(b);
    const to = (v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
    return `#${to(lerpNum(r1, r2, u))}${to(lerpNum(g1, g2, u))}${to(lerpNum(b1, b2, u))}`;
}

export function interpolateValue(type, a, b, u) {
    switch (type) {
        case 'number': return lerpNum(a, b, u);
        case 'vec2':
        case 'vec3': return lerpVec(a, b, u);
        case 'quat': return slerpQuat(a, b, u);
        case 'color': return lerpColor(a, b, u);
        case 'discrete': return u >= 1 ? b : a;   // never blends; holds then jumps
        default: return u >= 1 ? b : a;
    }
}
