import { trackValueAt } from '../anim/Track.js';

/**
 * Does the 3D camera actually see what the shot is about, and is the frame
 * exposed?
 *
 * The AK-47 live test produced an 880 mm rifle framed so tightly it
 * overflowed on all four sides, a first pass that rendered nearly black, and
 * a correction that blew the same rifle to white. Nothing caught any of it;
 * the 2D path measures framing in head heights and motion in world positions,
 * and 3D measured nothing at all. Every fault was found by a person looking
 * at a frame.
 *
 * Framing is solved ANALYTICALLY -- projecting bounds through the camera,
 * with no renderer, no GPU and no pixels -- so it runs in Node in
 * milliseconds and can gate a build. Exposure cannot be: it depends on lights
 * and materials, so it takes luma statistics the harness samples from real
 * frames and judges them here, keeping the judgement pure and testable while
 * the measurement stays where the pixels are.
 */

/** Half-extent of a geometry about its own origin, in metres. */
export function extentOf(g = {}) {
    switch (g.kind) {
        case 'cube': case 'box':
            return [(g.width ?? 1) / 2, (g.height ?? 1) / 2, (g.depth ?? 1) / 2];
        case 'sphere': return Array(3).fill(g.radius ?? 0.5);
        case 'cylinder': {
            const r = Math.max(g.radiusTop ?? 0.5, g.radiusBottom ?? g.radiusTop ?? 0.5);
            return [r, (g.height ?? 1) / 2, r];
        }
        case 'cone': return [g.radius ?? 0.5, (g.height ?? 1) / 2, g.radius ?? 0.5];
        case 'capsule': {
            const r = g.radius ?? 0.2;
            return [r, (g.height ?? 0.5) / 2 + r, r];
        }
        case 'torus': {
            const o = (g.radius ?? 0.5) + (g.tube ?? 0.2);
            return [o, o, g.tube ?? 0.2];
        }
        case 'plane': return [(g.width ?? 1) / 2, (g.height ?? 1) / 2, 0];
        case 'tetrahedron': return Array(3).fill(g.radius ?? 0.5);
        case 'lathe': {
            const pts = g.points ?? [[0, 0]];
            const r = Math.max(...pts.map(([x]) => Math.abs(x)));
            const ys = pts.map(([, y]) => y);
            return [r, (Math.max(...ys) - Math.min(...ys)) / 2 || r, r];
        }
        case 'extrude': {
            const sh = g.shape ?? [[0, 0]];
            const sx = Math.max(...sh.map(([x]) => Math.abs(x)));
            const sy = Math.max(...sh.map(([, y]) => Math.abs(y)));
            if (!g.path) return [sx, sy, (g.depth ?? 1) / 2];
            const ax = g.path.map((p) => p[0]), ay = g.path.map((p) => p[1]),
                  az = g.path.map((p) => p[2] ?? 0);
            const span = (a) => (Math.max(...a) - Math.min(...a)) / 2;
            return [span(ax) + sx, span(ay) + sy, span(az) + Math.max(sx, sy)];
        }
        default: return [0.5, 0.5, 0.5];
    }
}

/**
 * World-space axis-aligned bounds of a cast member.
 *
 * Rotation is ignored and the extent taken as if axis-aligned, which can only
 * ever OVERSTATE the box. For a framing check that is the safe direction to
 * be wrong in: it will not quietly pass a shot whose subject is clipped.
 */
export function castBounds(scene, rootId) {
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    let found = false;
    scene.walk((node) => {
        if (node.kind !== 'mesh') return;
        const at = worldAt(scene, node);
        const e = extentOf(node.props?.geometry);
        const scale = node.props?.scale ?? [1, 1, 1];
        for (let i = 0; i < 3; i++) {
            const r = e[i] * Math.abs(Array.isArray(scale) ? scale[i] : scale);
            lo[i] = Math.min(lo[i], at[i] - r);
            hi[i] = Math.max(hi[i], at[i] + r);
        }
        found = true;
    }, rootId);
    return found ? { lo, hi } : null;
}

/** Sum the authored offsets up the parent chain. Translation only. */
function worldAt(scene, node) {
    const out = [0, 0, 0];
    let n = node;
    while (n && n.id !== scene.rootId) {
        const at = n.props?.at ?? [0, 0, 0];
        for (let i = 0; i < 3; i++) out[i] += at[i] ?? 0;
        n = scene.get(n.parentId);
    }
    return out;
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2],
                         a[0] * b[1] - a[1] * b[0]];
const norm = (a) => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

/**
 * Project a world AABB into normalised device coordinates.
 *
 * All eight corners, not the centre: a long object seen end-on has a centre
 * that sits comfortably in frame while both ends run off it.
 */
export function projectBounds({ lo, hi }, { eye, look, fov, aspect }) {
    const f = norm(sub(look, eye));
    const r = norm(cross(f, Math.abs(f[1]) > 0.99 ? [0, 0, 1] : [0, 1, 0]));
    const u = cross(r, f);
    const tan = Math.tan((fov * Math.PI / 180) / 2);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, behind = 0;
    for (let i = 0; i < 8; i++) {
        const p = [i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]];
        const d = sub(p, eye);
        const z = dot(d, f);
        minZ = Math.min(minZ, z);
        if (z <= 1e-4) { behind++; continue; }
        const x = (dot(d, r) / z) / (tan * aspect);
        const y = (dot(d, u) / z) / tan;
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    if (behind === 8) return { behind: 8, minZ };
    // NDC spans -1..1, so a height of 2 is exactly the frame.
    return { minX, maxX, minY, maxY, behind, minZ,
             height: (maxY - minY) / 2, width: (maxX - minX) / 2 };
}

export const FRAMINGS3D = {
    wide: [0.18, 0.62, 'the subject small in its surroundings'],
    medium: [0.45, 0.92, 'the subject filling most of the frame'],
    close: [0.8, 2.4, 'a detail, deliberately cropped'],
};

/**
 * Check every shot's framing by projection. No renderer involved.
 */
export function analyseFraming3D(compiled, film, { samplesPerShot = 3 } = {}) {
    const { scene, timeline, meta, cameraId, lookId, shots } = compiled;
    const aspect = (meta.width ?? 1280) / (meta.height ?? 720);
    const at = (target, path, t, fallback) => {
        const track = timeline._index?.get(`${target}\u0000${path}`);
        return track ? trackValueAt(track, t) ?? fallback : fallback;
    };

    // Subjects are the cast assemblies, minus anything flagged as set
    // dressing -- a 9-metre wall would swamp every measurement.
    const subjects = (film.cast ?? [])
        .filter((c) => !c.set)
        .map((c) => ({ name: c.as ?? c.assembly, bounds: castBounds(scene, c.as ?? c.assembly) }))
        .filter((c) => c.bounds);

    // `on` may name a cast member ("ak") or one of its parts
    // ("ak/chargingHandle"). Measuring a macro shot of a 30 mm charging
    // handle against the whole 880 mm rifle says the frame is overflowing
    // when it is doing exactly what a detail shot should.
    const named = new Map();
    const boundsOf = (id) => {
        if (!named.has(id)) named.set(id, scene.get(id) ? castBounds(scene, id) : null);
        return named.get(id);
    };

    const report = [];
    for (const shot of shots) {
        for (let i = 0; i < samplesPerShot; i++) {
            const t = shot.start + (shot.duration * (i + 0.5)) / samplesPerShot;
            const eye = ['x', 'y', 'z'].map((a, k) => at(cameraId, `position.${a}`, t, [0, 0, 5][k]));
            const look = ['x', 'y', 'z'].map((a) => at(lookId, `position.${a}`, t, 0));
            const fov = at(cameraId, 'fov', t, 38);
            const wanted = shot.shot.framing;
            const on = shot.shot.on;
            const pool = on && on.includes('/')
                ? [{ name: on, bounds: boundsOf(on) }].filter((x) => x.bounds)
                : subjects;
            for (const s of pool) {
                if (on && !on.includes('/') && s.name !== on) continue;
                report.push({ shotId: shot.shotId, t: +t.toFixed(2), subject: s.name, wanted,
                              on: on === s.name,
                              ...projectBounds(s.bounds, { eye, look, fov, aspect }) });
            }
        }
    }
    return report;
}

export function checkFraming3D(compiled, film, options = {}) {
    const diagnostics = [];
    const warn = (shotId, message) => diagnostics.push({ severity: 'warning', message, location: shotId });

    // Grouped per shot and per subject, because a shot is a MOVE. A push-in
    // is wide at its head and close at its tail, and requiring every sample
    // to sit in one band calls every push-in an error. A declared framing
    // describes where the move arrives, so the band is satisfied if any
    // sample reaches it.
    const groups = new Map();
    for (const r of analyseFraming3D(compiled, film, options)) {
        const k = `${r.shotId}\u0000${r.subject}`;
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k).push(r);
    }

    for (const rows of groups.values()) {
        const r0 = rows[0];
        const where = `shot ${r0.shotId} on "${r0.subject}"`;
        const declared = !!(r0.wanted || r0.on);
        const visible = rows.filter((r) => r.behind !== 8
            && !(r.minX > 1 || r.maxX < -1 || r.minY > 1 || r.maxY < -1));

        // A shot that does not DECLARE a subject is allowed not to contain
        // one: cutting to the wall is a cut, not a staging error. Only a shot
        // that says it is `on` something must actually show it. The 2D
        // staging check makes the same exemption for the same reason.
        if (!visible.length) {
            if (declared) {
                const behind = rows.every((r) => r.behind === 8);
                warn(r0.shotId, `Framing: ${where} is declared the subject but is `
                    + (behind ? 'entirely behind the camera.'
                              : `off frame for the whole shot (x ${r0.minX?.toFixed(2)}`
                                + `..${r0.maxX?.toFixed(2)}, y ${r0.minY?.toFixed(2)}`
                                + `..${r0.maxY?.toFixed(2)}).`));
            }
            continue;
        }

        const straddling = visible.find((r) => r.behind > 0);
        if (straddling) {
            warn(r0.shotId, `Framing: ${where} straddles the camera plane at `
                + `t=${straddling.t}s (${straddling.behind}/8 corners behind it), so it will clip.`);
        }

        const heights = visible.map((r) => r.height);
        const lo = Math.min(...heights), hi = Math.max(...heights);
        const span = lo === hi ? `${(lo * 100).toFixed(0)}%`
            : `${(lo * 100).toFixed(0)}-${(hi * 100).toFixed(0)}%`;

        if (r0.wanted) {
            const band = FRAMINGS3D[r0.wanted];
            if (!band) {
                warn(r0.shotId, `Framing: unknown framing "${r0.wanted}". `
                    + `Known: ${Object.keys(FRAMINGS3D).join(', ')}.`);
            // The band is tested against the RANGE the shot sweeps, not
            // against individual samples. Coverage varies continuously along
            // a move, so three samples of a fast push-in can step straight
            // over a band the shot certainly passes through -- 29% then 94%,
            // with the whole medium band in between unmeasured.
            } else if (!(hi >= band[0] && lo <= band[1])) {
                warn(r0.shotId, `Framing: ${where} declares "${r0.wanted}" (${band[2]}), but it `
                    + `covers ${span} of frame height across the shot and never enters the `
                    + `${(band[0] * 100).toFixed(0)}-${(band[1] * 100).toFixed(0)}% band.`);
            }
            continue;
        }

        // Undeclared: only flag what is unarguably wrong, and only when it is
        // wrong for the WHOLE shot -- a push-in that ends tight is a push-in.
        if (lo > 2.6) {
            warn(r0.shotId, `Framing: ${where} overflows the frame for the whole shot `
                + `(${span} of frame height). If that crop is deliberate, `
                + `declare "framing": "close".`);
        } else if (hi < 0.06) {
            warn(r0.shotId, `Framing: ${where} covers ${span} of frame height `
                + `-- too small to read.`);
        }
    }
    return diagnostics;
}

/**
 * Judge exposure from luma statistics measured on real frames.
 *
 * Each sample is { t, mean, clippedLow, clippedHigh } with mean in 0..1 and
 * the clipped fractions in 0..1. Thresholds are deliberately loose: this
 * exists to catch a frame that is nearly black or blown out, not to impose a
 * look.
 */
export const EXPOSURE = { dark: 0.055, bright: 0.72, blown: 0.09, crushed: 0.86 };

export function checkExposure(samples = [], { thresholds = EXPOSURE } = {}) {
    const diagnostics = [];
    const at = (s) => `t=${s.t.toFixed(1)}s${s.shotId ? ` (${s.shotId})` : ''}`;
    for (const s of samples) {
        if (s.mean < thresholds.dark) {
            diagnostics.push({ severity: 'warning', location: s.shotId,
                message: `Exposure: ${at(s)} has mean luma ${s.mean.toFixed(3)} -- `
                    + `effectively black. Check the lights reach the subject.` });
        } else if (s.mean > thresholds.bright) {
            diagnostics.push({ severity: 'warning', location: s.shotId,
                message: `Exposure: ${at(s)} has mean luma ${s.mean.toFixed(3)} -- `
                    + `washed out. Lower exposure or key intensity.` });
        }
        if (s.clippedHigh > thresholds.blown) {
            diagnostics.push({ severity: 'warning', location: s.shotId,
                message: `Exposure: ${at(s)} blows ${(s.clippedHigh * 100).toFixed(0)}% of pixels `
                    + `to white. Detail there is gone, not dim.` });
        }
        if (s.clippedLow > thresholds.crushed) {
            diagnostics.push({ severity: 'warning', location: s.shotId,
                message: `Exposure: ${at(s)} crushes ${(s.clippedLow * 100).toFixed(0)}% of pixels `
                    + `to black.` });
        }
    }
    return diagnostics;
}

/** Luma statistics for one RGBA frame. Pure; the harness supplies the pixels. */
export function lumaStats(rgba) {
    let sum = 0, low = 0, high = 0;
    const n = rgba.length / 4;
    for (let i = 0; i < rgba.length; i += 4) {
        // Rec. 709 luma on the already-tonemapped, display-referred pixels.
        const y = (0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]) / 255;
        sum += y;
        if (y < 0.02) low++;
        if (y > 0.98) high++;
    }
    return { mean: sum / n, clippedLow: low / n, clippedHigh: high / n };
}
