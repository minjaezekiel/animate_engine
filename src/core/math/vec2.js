/** Minimal 2D vector helpers as plain [x, y] arrays. Pure. */
export const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
export const scale = (a, s) => [a[0] * s, a[1] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
export const len = (a) => Math.hypot(a[0], a[1]);
export const dist = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
export const angle = (a) => Math.atan2(a[1], a[0]);

export function normalize(a) {
    const l = len(a);
    return l === 0 ? [0, 0] : [a[0] / l, a[1] / l];
}

export const lerp = (a, b, u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u];
