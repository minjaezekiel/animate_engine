/**
 * Transform2D is a plain record of flat numbers, never a class with methods.
 *
 * Two reasons it stays dumb data: the animation Evaluator addresses channels
 * by dotted path ('transform.rot'), which needs plain property access; and a
 * whole scene has to be structured-clonable for worker and history use.
 */
export const transform2D = (t = {}) => ({
    x: t.x ?? 0,
    y: t.y ?? 0,
    rot: t.rot ?? 0,
    sx: t.sx ?? 1,
    sy: t.sy ?? 1,
    skx: t.skx ?? 0,
    ox: t.ox ?? 0,
    oy: t.oy ?? 0,
});

export const transform3D = (t = {}) => ({
    p: t.p ? [...t.p] : [0, 0, 0],
    q: t.q ? [...t.q] : [0, 0, 0, 1],
    s: t.s ? [...t.s] : [1, 1, 1],
});

export const TRANSFORM2D_CHANNELS = ['x', 'y', 'rot', 'sx', 'sy', 'skx', 'ox', 'oy'];
