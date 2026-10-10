/**
 * Mutation audit: break the code on purpose and see if the tests notice.
 *
 *   npm run audit:tests
 *   npm run audit:tests -- --only=blend      # one group
 *
 * # Why
 *
 * Two tests in this repository passed while measuring nothing. One checked
 * a smoothing filter by peak displacement, and a phase-inverted signal has
 * the same peak, so a filter that attenuated *nothing* satisfied it. The
 * other compared an airbrush against a marker across separate strokes,
 * where both composite identically, so it would have passed whatever the
 * accumulation modes did.
 *
 * Neither was found by reading the tests. Both were found by accident. A
 * suite's pass count says nothing about whether it would catch a
 * regression, and the only honest way to ask is to introduce one.
 *
 * Each mutation below is a small, *plausible* defect -- a flipped
 * comparison, a dropped clamp, an off-by-one, a swapped operand -- of the
 * kind a careless edit would really produce. A mutation that **survives**,
 * meaning the suite still passes, marks behaviour nothing is pinning
 * down. That is the finding; the exit code is non-zero when any survive.
 *
 * Mutations are applied to the JavaScript sources only. The Rust kernels
 * are covered transitively: the JS files are their line-by-line mirrors
 * and the conformance tests compare the two backends, so a mutation to a
 * mirror must be caught by conformance even where no correctness test
 * pins the behaviour directly. That is itself worth knowing -- if a
 * mutation to a mirror survives, conformance is not covering that kernel.
 */
import { readFileSync, writeFileSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

/**
 * Refuse to run twice at once.
 *
 * This script deliberately leaves a defect in a source file for the
 * duration of each test run. Two instances therefore corrupt each other:
 * one restores a file while the other is measuring it, and the results of
 * both become noise -- which is exactly what happened, and presented as
 * "the suite fails before any mutation" with no hint of the cause.
 *
 * `wx` is atomic, so this is a real lock rather than a check-then-create
 * race.
 */
const LOCK = '.mutation-audit.lock';
try {
    closeSync(openSync(LOCK, 'wx'));
} catch {
    console.error(`another mutation audit is already running (${LOCK} exists).`);
    console.error('This script edits source files in place, so two runs corrupt each other.');
    console.error(`If no audit is running, delete ${LOCK}.`);
    process.exit(2);
}
const releaseLock = () => { try { unlinkSync(LOCK); } catch { /* already gone */ } };
process.on('exit', releaseLock);
// A kill between mutations would otherwise leave a deliberate defect in
// the tree, so the restore and the lock release both run on a signal.
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => { releaseLock(); process.exit(130); });
}

const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);

/**
 * @typedef {{group: string, file: string, find: string, replace: string, what: string}} Mutation
 */
const MUTATIONS = [
    // --- stroke resampling ------------------------------------------
    { group: 'stroke', file: 'src/core/paint/stroke.js', what: 'taper applies only at the start, never the end',
      find: 'const t = Math.min(fromStart, fromEnd);', replace: 'const t = fromStart;' },
    { group: 'stroke', file: 'src/core/paint/stroke.js', what: 'pressure no longer drives diameter',
      find: 'const sizeF = brush.minSize + (1 - brush.minSize) * pressure ** brush.sizeCurve;',
      replace: 'const sizeF = 1;' },
    { group: 'stroke', file: 'src/core/paint/stroke.js', what: 'dab spacing ignores brush size',
      find: 'travelled += Math.max(0.35, brush.spacing * localSize);',
      replace: 'travelled += Math.max(0.35, brush.spacing * 16);' },
    { group: 'stroke', file: 'src/core/paint/stroke.js', what: 'a single-point tap deposits nothing',
      find: 'push(points[0].x, points[0].y, points[0].p ?? 1, 0, 0);', replace: '' },
    { group: 'stroke', file: 'src/core/paint/stroke.js', what: 'smoothing amount is not halved (non-monotonic again)',
      find: 'const k = Math.min(1, amount) / 2;', replace: 'const k = Math.min(1, amount);' },
    { group: 'stroke', file: 'src/core/paint/stroke.js', what: 'smoothing moves the endpoints',
      find: 'const out = [current[0]];', replace: 'const out = [{ ...current[0], y: current[0].y + 3 }];' },
    // Equivalent mutant, kept and marked rather than deleted. `stampCountAt`
    // returns early when `p >= 1`, so removing the upper clamp cannot change
    // any result -- no test can kill it, and a suite is not at fault for
    // that. Listing it documents the redundancy instead of leaving a future
    // reader to rediscover it.
    { group: 'stroke', file: 'src/core/paint/stroke.js', what: 'progress is not clamped above 1',
      equivalent: 'the `p >= 1` early return already covers it',
      find: 'const p = Math.min(1, Math.max(0, progress));', replace: 'const p = Math.max(0, progress);' },
    { group: 'stroke', file: 'src/core/paint/stroke.js', what: 'the nib never follows stroke direction',
      find: "const follow = brush.angleMode === 'follow';", replace: 'const follow = false;' },

    // --- path parsing -----------------------------------------------
    { group: 'path', file: 'src/core/paint/path.js', what: 'subpaths are concatenated instead of split',
      find: 'if (run.length > 1) runs.push(run);\n        run = [{ x: nx, y: ny }];',
      replace: 'run.push({ x: nx, y: ny });' },
    { group: 'path', file: 'src/core/paint/path.js', what: 'extra pairs after M are dropped, not implicit linetos',
      find: "command = rel ? 'l' : 'L';", replace: "command = rel ? 'm' : 'M';" },
    { group: 'path', file: 'src/core/paint/path.js', what: 'S does not reflect the previous control point (x)',
      find: 'const rx = lastC ? 2 * x - lastC[0] : x;', replace: 'const rx = x;' },
    { group: 'path', file: 'src/core/paint/path.js', what: 'S does not reflect the previous control point (y)',
      find: 'const ry = lastC ? 2 * y - lastC[1] : y;', replace: 'const ry = y;' },
    { group: 'path', file: 'src/core/paint/path.js', what: 'T does not reflect the previous control point',
      find: 'const rx = lastQ ? 2 * x - lastQ[0] : x;', replace: 'const rx = x;' },
    { group: 'path', file: 'src/core/paint/path.js', what: 'Z does not return to the subpath start',
      find: 'lineTo(startX, startY);', replace: '' },
    { group: 'path', file: 'src/core/paint/path.js', what: 'relative commands are treated as absolute',
      find: 'const ox = rel ? x : 0, oy = rel ? y : 0;', replace: 'const ox = 0, oy = 0;' },
    { group: 'path', file: 'src/core/paint/path.js', what: 'the circle bezier constant is wrong',
      find: 'const k = r * 0.5522847498307936;', replace: 'const k = r * 0.4;' },
    { group: 'path', file: 'src/core/paint/path.js', what: 'curve tolerance is ignored (fixed sample count)',
      find: 'return Math.max(2, Math.min(240, Math.ceil(length / Math.max(0.25, tolerance))));',
      replace: 'return 24;' },

    // --- grain ------------------------------------------------------
    { group: 'texture', file: 'src/core/paint/texture.js', what: 'grain is not normalised to full range',
      find: 'const n = span > 1e-6 ? (raw[i] - lo) * norm : 1;', replace: 'const n = raw[i];' },
    { group: 'texture', file: 'src/core/paint/texture.js', what: 'grain strength is ignored',
      find: 'data[i] = Math.round((1 - s + s * n) * 255);', replace: 'data[i] = Math.round(n * 255);' },
    { group: 'texture', file: 'src/core/paint/texture.js', what: 'the noise lattice does not wrap (visible seams)',
      find: 'const wrap = (v) => ((v % period) + period) % period;', replace: 'const wrap = (v) => v;' },
    { group: 'texture', file: 'src/core/paint/texture.js', what: 'lattice interpolation is linear, not smoothstep',
      find: 'const sx = xf * xf * (3 - 2 * xf);', replace: 'const sx = xf;' },

    // --- raster kernels ---------------------------------------------
    { group: 'raster', file: 'src/kernels/js/raster.js', what: 'peak mode accumulates like build-up',
      find: 'M[i] = mode === 0 ? (a > c ? a : c) : c + a * (1 - c);',
      replace: 'M[i] = c + a * (1 - c);' },
    { group: 'raster', file: 'src/kernels/js/raster.js', what: 'the antialias ramp collapses to half a pixel',
      find: 'const feather = Math.max(r - core, 1);', replace: 'const feather = Math.max(r - core, 0.001);' },
    { group: 'raster', file: 'src/kernels/js/raster.js', what: 'the dab is always round (aspect ignored)',
      find: 'const across = (-dx * sinA + dy * cosA) * invAspect;',
      replace: 'const across = (-dx * sinA + dy * cosA);' },
    { group: 'raster', file: 'src/kernels/js/raster.js', what: 'grain is sampled dab-locked even when canvas-locked',
      find: "a *= texMode === 1\n                        ? grain(T, tw, th, x / scale, y / scale)",
      replace: "a *= texMode === 3\n                        ? grain(T, tw, th, x / scale, y / scale)" },
    { group: 'raster', file: 'src/kernels/js/raster.js', what: 'smudge pickup is mixed in premultiplied space',
      find: 'picked = [a0 * k, a1 * k, a2 * k, alpha];', replace: 'picked = [a0 * inv, a1 * inv, a2 * inv, alpha];' },
    { group: 'raster', file: 'src/kernels/js/raster.js', what: 'colorRate is ignored (always full fresh paint)',
      find: 'res[0] += (r - res[0]) * fresh;', replace: 'res[0] = r;' },
    { group: 'raster', file: 'src/kernels/js/raster.js', what: 'the erase path composites normally',
      find: 'D[p] *= inv; D[p + 1] *= inv; D[p + 2] *= inv; D[p + 3] *= inv;',
      replace: 'D[p + 3] *= inv;' },
    { group: 'raster', file: 'src/kernels/js/raster.js', what: 'unpremultiply is skipped in the u8 conversion',
      find: 'const inv = 1 / a;\n        const to8 = (v) => {', replace: 'const inv = 1;\n        const to8 = (v) => {' },

    // --- blend modes ------------------------------------------------
    { group: 'blend', file: 'src/kernels/js/blend.js', what: 'multiply and screen are swapped',
      find: 'case MODES.multiply: return cb * cs;', replace: 'case MODES.multiply: return cb + cs - cb * cs;' },
    { group: 'blend', file: 'src/kernels/js/blend.js', what: 'overlay is hard-light without swapping operands',
      find: 'case MODES.overlay: return blend(MODES.hardLight, cs, cb);',
      replace: 'case MODES.overlay: return blend(MODES.hardLight, cb, cs);' },
    { group: 'blend', file: 'src/kernels/js/blend.js', what: 'the blend term is applied without un-premultiplying',
      find: 'const cs = [0, 1, 2].map((c) => Math.min(1, Math.max(0, s[c] * invSa)));',
      replace: 'const cs = [0, 1, 2].map((c) => Math.min(1, Math.max(0, s[c])));' },
    { group: 'blend', file: 'src/kernels/js/blend.js', what: 'layer opacity is ignored',
      find: 'const sa = S[p + 3] * k;', replace: 'const sa = S[p + 3];' },
    { group: 'blend', file: 'src/kernels/js/blend.js', what: 'colorDodge divides by the wrong operand',
      find: 'return Math.min(1, cb / (1 - cs));', replace: 'return Math.min(1, cs / (1 - cb));' },
    { group: 'blend', file: 'src/kernels/js/blend.js', what: 'an unknown blend mode silently becomes normal',
      find: "throw new Error(`unknown blend mode \"${name}\"; available: ${MODE_NAMES.join(', ')}`);",
      replace: 'return 0;' },

    // --- non-separable blend modes -----------------------------------
    { group: 'nonsep', file: 'src/kernels/js/blend.js', what: 'luminosity uses flat channel weights',
      find: 'const lum = (c) => 0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2];',
      replace: 'const lum = (c) => (c[0] + c[1] + c[2]) / 3;' },
    { group: 'nonsep', file: 'src/kernels/js/blend.js', what: 'clipColor clamps per channel, shifting hue',
      find: 'if (d > 1e-9) out = out.map((v) => l + ((v - l) * (1 - l)) / d);',
      replace: 'out = out.map((v) => Math.min(1, v));' },
    { group: 'nonsep', file: 'src/kernels/js/blend.js', what: 'setSat ignores the channel ordering',
      find: 'out[imid] = span > 1e-9 ? ((c[imid] - c[imin]) * s) / span : 0;',
      replace: 'out[imid] = s / 2;' },
    { group: 'nonsep', file: 'src/kernels/js/blend.js', what: 'color and luminosity are swapped',
      find: 'case MODES.color: return setLum(cs, lum(cb));',
      replace: 'case MODES.color: return setLum(cb, lum(cs));' },
    { group: 'nonsep', file: 'src/kernels/js/blend.js', what: 'hue takes the source saturation, not the backdrop',
      find: 'case MODES.hue: return setLum(setSat(cs, sat(cb)), lum(cb));',
      replace: 'case MODES.hue: return setLum(setSat(cs, sat(cs)), lum(cb));' },
    { group: 'nonsep', file: 'src/kernels/js/blend.js', what: 'the layer mask is ignored',
      find: 'if (M) k *= Math.min(1, Math.max(0, M[p + 3]));', replace: '' },
    { group: 'nonsep', file: 'src/kernels/js/blend.js', what: 'the clip source is ignored',
      find: 'if (C) k *= Math.min(1, Math.max(0, C[p + 3]));', replace: '' },
    { group: 'nonsep', file: 'src/kernels/js/blend.js', what: "the clip base's own mask is ignored",
      find: 'if (CM) k *= Math.min(1, Math.max(0, CM[p + 3]));', replace: '' },
    { group: 'nonsep', file: 'src/kernels/js/blend.js', what: 'mask alpha is read at the wrong stride',
      find: 'if (M) k *= Math.min(1, Math.max(0, M[p + 3]));',
      replace: 'if (M) k *= Math.min(1, Math.max(0, M[i]));' },

    // --- the layer document -------------------------------------------
    { group: 'layers', file: 'src/core/paint/Document.js', what: 'a clipped layer clips to the wrong base',
      find: 'if (!this.layers[i].clip) return this.layers[i];',
      replace: 'return this.layers[i];' },
    { group: 'layers', file: 'src/core/paint/Document.js', what: 'a stale prefix is reused after a low edit',
      find: '                this._prefixUpTo = -1;\n            }\n        }\n\n        for (let i = from; i < this.layers.length; i++) this._compose(target, i);',
      replace: '            }\n        }\n\n        for (let i = from; i < this.layers.length; i++) this._compose(target, i);' },
    { group: 'layers', file: 'src/core/paint/Document.js', what: 'the layer signature ignores compositing properties',
      find: "        return `${this.surface.version}|${this.blend}|${this.opacity}`",
      replace: "        return `${this.surface.version}|x|x`" },
    { group: 'layers', file: 'src/core/paint/Document.js', what: 'the signature ignores the mask',
      find: "            + `|${this.mask ? this.mask.version : -1}`;", replace: '            + `|0`;' },
    { group: 'layers', file: 'src/core/paint/Document.js', what: 'a new mask starts transparent, hiding the layer',
      find: 'if (fill > 0) this.mask.fill(0, 0, 0, Math.min(1, fill));', replace: '' },
    { group: 'layers', file: 'src/core/paint/Surface.js', what: 'drawing does not bump the version',
      find: '        this.version++;\n        return count;\n    }\n\n    /**\n     * As [`draw`], across the worker pool',
      replace: '        return count;\n    }\n\n    /**\n     * As [`draw`], across the worker pool' },

    // --- photo motion ---------------------------------------------------
    { group: 'motion', file: 'src/core/motion/PhotoMotion.js', what: 'overscan is halved (one uncovered row)',
      find: 'return 1 + margin * 2.2;', replace: 'return 1 + margin * 1.1;' },
    { group: 'motion', file: 'src/core/motion/PhotoMotion.js', what: 'the depth map is not blurred',
      find: 'const depth = blur === 0 ? spec.depth : blurDepth(kernels, spec.depth, blur);',
      replace: 'const depth = spec.depth;' },
    { group: 'motion', file: 'src/core/motion/PhotoMotion.js', what: 'parallax runs without a depth map',
      find: '                    if (this.hasDepth) applyParallax(out, this, effect, phase, t);',
      replace: '                    applyParallax(out, this, effect, phase, t);' },
    { group: 'motion', file: 'src/core/motion/PhotoMotion.js', what: 'parallax ignores focus, becoming a pan',
      find: 'const d = photo.depths[i] - focus;', replace: 'const d = 1;' },
    { group: 'motion', file: 'src/core/motion/PhotoMotion.js', what: 'kenBurns zooms about the origin, not the centre',
      find: 'out[i * 2] = cx + (out[i * 2] - cx) * zoom + dx;',
      replace: 'out[i * 2] = out[i * 2] * zoom + dx;' },
    { group: 'motion', file: 'src/core/motion/PhotoMotion.js', what: 'kenBurns pan is in pixels, not frame fractions',
      find: 'const dx = lerp(from.x ?? 0, to.x ?? 0, e) * photo.width;',
      replace: 'const dx = lerp(from.x ?? 0, to.x ?? 0, e);' },
    { group: 'motion', file: 'src/core/motion/PhotoMotion.js', what: 'time is not clamped',
      find: 'return this.duration > 0 ? Math.min(1, Math.max(0, t / this.duration)) : 0;',
      replace: 'return this.duration > 0 ? t / this.duration : 0;' },
    { group: 'motion', file: 'src/core/motion/PhotoMotion.js', what: 'wave escapes its range',
      find: 'if (v < v0 || v > v1) continue;', replace: '' },
    { group: 'motion', file: 'src/core/motion/PhotoMotion.js', what: 'puppet pins have no falloff',
      find: 'const w = smooth(1 - dist / radius);', replace: 'const w = 1;' },
    { group: 'motion', file: 'src/core/motion/PhotoMotion.js', what: 'depth is sampled nearest, terracing the field',
      find: 'return lerp(lerp(at(x0, y0), at(x1, y0), tx), lerp(at(x0, y1), at(x1, y1), tx), ty);',
      replace: 'return at(x0, y0);' },

    // --- PNG ---------------------------------------------------------------
    { group: 'png', file: 'src/io/png.js', what: 'the paeth predictor picks the wrong neighbour',
      find: 'if (pa <= pb && pa <= pc) return a;\n    return pb <= pc ? b : c;',
      replace: 'return a;' },
    { group: 'png', file: 'src/io/png.js', what: 'the average filter does not halve',
      find: 'line[i] = (line[i] + ((left + prev[i]) >> 1)) & 255;',
      replace: 'line[i] = (line[i] + left + prev[i]) & 255;' },
    { group: 'png', file: 'src/io/png.js', what: 'the sub filter uses the byte above',
      find: 'for (let i = bpp; i < n; i++) line[i] = (line[i] + line[i - bpp]) & 255;',
      replace: 'for (let i = bpp; i < n; i++) line[i] = (line[i] + prev[i]) & 255;' },
    { group: 'png', file: 'src/io/png.js', what: 'a 16-bit PNG is accepted and misdecoded',
      find: "        throw new Error(`PNG bit depth ${depth} is not supported (only 8)`);",
      replace: '        depth = 8;' },
    { group: 'png', file: 'src/io/png.js', what: 'greyscale decode drops two channels',
      find: '                    out[d] = out[d + 1] = out[d + 2] = line[s];\n                    out[d + 3] = 255;\n                    break;',
      replace: '                    out[d] = line[s];\n                    out[d + 3] = 255;\n                    break;' },

    // --- the op surface ------------------------------------------------------
    { group: 'ops', file: 'src/core/script/ops.js', what: 'an off-canvas stroke is reported as a success',
      find: 'const offCanvas = bounds && (bounds.x1 < 0 || bounds.y1 < 0',
      replace: 'const offCanvas = false && (bounds.x1 < 0 || bounds.y1 < 0' },
    { group: 'ops', file: 'src/core/script/ops.js', what: 'stroke bounds ignore the brush radius',
      find: '        x0 = Math.min(x0, s[o] - r); x1 = Math.max(x1, s[o] + r);',
      replace: '        x0 = Math.min(x0, s[o]); x1 = Math.max(x1, s[o]);' },
    { group: 'ops', file: 'src/core/script/ops.js', what: 'required arguments are not enforced',
      find: '        if (spec.required && args[key] === undefined) {', replace: '        if (false) {' },
    { group: 'ops', file: 'src/core/script/ops.js', what: 'an unknown op fails without listing the known ones',
      find: 'throw new Error(`unknown op "${name}". Known: ${OP_NAMES.join(\', \')}`);',
      replace: 'throw new Error("bad op");' },
    { group: 'ops', file: 'src/core/script/ops.js', what: 'a sequence overwrites one file instead of numbering',
      find: "                ctx.io.writeImage(a.out.replace('####', String(i).padStart(4, '0')),",
      replace: "                ctx.io.writeImage(a.out," },

    // --- deform kernels ---------------------------------------------
    { group: 'deform', file: 'src/kernels/js/deform.js', what: 'skin reads the matrix transposed',
      find: 'ox += w * (P[m] * x + P[m + 4] * y + P[m + 8] * z + P[m + 12]);',
      replace: 'ox += w * (P[m] * x + P[m + 1] * y + P[m + 2] * z + P[m + 3]);' },
    { group: 'deform', file: 'src/kernels/js/deform.js', what: 'out-of-range bone indices are not guarded',
      find: 'if (b >= boneCount) continue;', replace: 'if (false) continue;' },
    { group: 'deform', file: 'src/kernels/js/deform.js', what: 'morph epsilon skip is removed',
      find: 'if (Math.abs(w) < MORPH_EPSILON) continue;', replace: 'if (false) continue;' },
    { group: 'deform', file: 'src/kernels/js/deform.js', what: 'normals are normalised per face (area weighting lost)',
      find: 'O[ia * 3] += nx; O[ia * 3 + 1] += ny; O[ia * 3 + 2] += nz;',
      replace: 'const _l = Math.hypot(nx, ny, nz) || 1;\n        O[ia * 3] += nx / _l; O[ia * 3 + 1] += ny / _l; O[ia * 3 + 2] += nz / _l;' },
    { group: 'deform', file: 'src/kernels/js/deform.js', what: 'degenerate normals are left as zero, not (0,1,0)',
      find: 'O[v * 3] = 0; O[v * 3 + 1] = 1; O[v * 3 + 2] = 0;',
      replace: 'O[v * 3] = 0; O[v * 3 + 1] = 0; O[v * 3 + 2] = 0;' },
    { group: 'deform', file: 'src/kernels/js/deform.js', what: 'smooth ignores lambda (always full)',
      find: 'O[v * 3] = x + lambda * (sx * inv - x);', replace: 'O[v * 3] = sx * inv;' },

    // --- adjacency ---------------------------------------------------
    { group: 'adjacency', file: 'src/kernels/adjacency.js', what: 'self-loops are not removed',
      find: 'if (n !== prev && n !== v) { packed[w++] = n; prev = n; }',
      replace: 'if (n !== prev) { packed[w++] = n; prev = n; }' },
    { group: 'adjacency', file: 'src/kernels/adjacency.js', what: 'duplicate neighbours are not removed',
      find: 'scratch.sort((p, q) => p - q);', replace: '' },
    { group: 'adjacency', file: 'src/kernels/adjacency.js', what: 'out-of-range indices leak into the graph',
      find: 'if (a >= count || b >= count) return;', replace: 'if (false) return;' },

    // --- layer document ----------------------------------------------
    { group: 'document', file: 'src/core/paint/Document.js', what: 'hidden layers are composited anyway',
      find: '        const layer = this.layers[index];\n        if (!layer.visible || layer.opacity <= 0) return;\n        const base = layer.clip ? this._clipBase(index) : null;\n        this.kernels.blendLayers(',
      replace: '        const layer = this.layers[index];\n        const base = layer.clip ? this._clipBase(index) : null;\n        this.kernels.blendLayers(' },
    { group: 'document', file: 'src/core/paint/Document.js', what: 'the composite is not cleared before flattening',
      find: '            K.clearF32(target, w * h * 4);\n            for (let i = 0; i < from; i++) this._compose(target, i);',
      replace: '            for (let i = 0; i < from; i++) this._compose(target, i);' },
    { group: 'document', file: 'src/core/paint/Document.js', what: 'a missing layer resolves to the first one',
      find: 'if (!found) {\n            throw new Error(', replace: 'if (false) {\n            throw new Error(' },
    { group: 'document', file: 'src/core/paint/Document.js', what: 'toRgba8 does not flatten first',
      find: 'if (!this.composite) this.flatten();', replace: 'if (!this.composite) this._target();' },

    // --- surface ------------------------------------------------------
    { group: 'surface', file: 'src/core/paint/Surface.js', what: 'the mask is not cleared between strokes',
      find: 'K.clearF32(this.mask, w * h);\n        K.stampMask(', replace: 'K.stampMask(' },
    { group: 'surface', file: 'src/core/paint/Surface.js', what: 'wet brushes go through the mask path',
      find: 'if (brushSpec.wet) {', replace: 'if (false) {' },
    { group: 'surface', file: 'src/core/paint/Surface.js', what: 'drawAll weights by stroke count, not dab count',
      find: 'const counts = strokes.map((s) => this._prepare(s).resampled.count);',
      replace: 'const counts = strokes.map(() => 1);' },
    { group: 'surface', file: 'src/core/paint/Surface.js', what: 'the stroke cache ignores the brush',
      find: 'if (hit && hit.brushKey === key) return { ...hit, brushSpec: b };',
      replace: 'if (hit) return { ...hit, brushSpec: b };' },

    // --- tear: the geometry of separating a near object from its background
    { group: 'tear', file: 'src/core/motion/PhotoMotion.js',
      what: "the fill advances the uv with the position, carrying the subject's own edge into the hole",
      find: 'fu + du * (t - k), fv + dv * (t - k), d[far]);',
      replace: 'fu + du * (t + k), fv + dv * (t + k), d[far]);' },
    { group: 'tear', file: 'src/core/motion/PhotoMotion.js', what: 'the tear is left unfilled',
      find: 'const k = fill / len;', replace: 'const k = 0;' },
    { group: 'tear', file: 'src/core/motion/PhotoMotion.js',
      what: 'both copies take the contour depth, so the mesh is subdivided but never torn',
      find: 'fv + dv * t, d[near]);', replace: 'fv + dv * t, level);' },
    { group: 'tear', file: 'src/core/motion/PhotoMotion.js',
      what: 'torn triangles are not ordered far to near',
      find: '.sort((a, b) => mean(a) - mean(b));', replace: ';' },
    { group: 'tear', file: 'src/core/motion/PhotoMotion.js',
      what: 'tearing no longer turns the depth blur off, so the cut misses the real edge',
      find: 'const blur = spec.depthBlur ?? (this.tear ? 0 : 0.02);',
      replace: 'const blur = spec.depthBlur ?? 0.02;' },
    { group: 'tear', file: 'src/core/motion/PhotoMotion.js',
      what: 'the lone vertex is always taken as the near one',
      find: 'const lone = count === 1 ? near.indexOf(true) : near.indexOf(false);',
      replace: 'const lone = near.indexOf(true);' },

    // --- depth: monocular estimation around a model that cannot run in Node
    { group: 'depth', file: 'src/core/motion/depth.js', what: 'the input is not normalised',
      find: 'out[c * plane + i] = (data[i * 4 + c] / 255 - mean[c]) / std[c];',
      replace: 'out[c * plane + i] = data[i * 4 + c] / 255;' },
    { group: 'depth', file: 'src/core/motion/depth.js',
      what: 'a metric model\'s polarity is not inverted, so near and far swap',
      find: "if (near === 'low') g = 255 - g;", replace: '' },
    { group: 'depth', file: 'src/core/motion/depth.js',
      what: 'the prediction is scaled by a fixed 255 rather than its own range',
      find: 'const scale = span > 1e-9 ? 255 / span : 0;', replace: 'const scale = 1;' },
    { group: 'depth', file: 'src/core/motion/depth.js',
      what: "the model's input name is guessed instead of read off the session",
      find: "const name = session.inputNames?.[0] ?? 'input';", replace: "const name = 'input';" },

    // --- photos: the film.json binding
    { group: 'photos', file: 'src/core/script/compile.js',
      what: 'the automatic progress ramp is emitted even when a draw action drives the photo',
      find: 'if (!driven.has(id) && duration > 0) {', replace: 'if (duration > 0) {' },
    { group: 'photos', file: 'src/core/script/compile.js',
      what: 'a photo defaults to one second rather than the rest of the scene',
      find: 'const duration = photo.duration ?? Math.max(0, sceneEnd - start);',
      replace: 'const duration = photo.duration ?? 1;' },
    { group: 'photos', file: 'src/backends/canvas2d/PhotoPainter.js',
      what: "progress is not scaled by the photo's duration",
      find: 'return Math.min(1, Math.max(0, progress)) * this.duration;',
      replace: 'return Math.min(1, Math.max(0, progress)) * 1;' },
    { group: 'photos', file: 'src/backends/canvas2d/PaintPainter.js',
      what: 'attachPainters skips photo nodes, leaving every photograph blank',
      find: '    made.push(...attachPhotoPainters(scene, kernels, options));\n', replace: '' },
];

const selected = only ? MUTATIONS.filter((m) => m.group === only) : MUTATIONS;
if (!selected.length) {
    console.error(`no mutations in group "${only}". groups: `
        + [...new Set(MUTATIONS.map((m) => m.group))].join(', '));
    process.exit(2);
}

/** Run the suite. Returns true if it passed. */
function suitePasses() {
    try {
        // The same glob `npm test` uses. Passing a bare directory makes
        // Node try to load it as a module and fail before any test runs.
        execFileSync('node', ['--test', 'test/**/*.test.mjs'],
            { stdio: 'pipe', timeout: 300_000 });
        return true;
    } catch {
        return false;
    }
}

console.log(`baseline: ${selected.length} mutations over `
    + `${new Set(selected.map((m) => m.file)).size} files\n`);
if (!suitePasses()) {
    console.error('the suite fails before any mutation -- fix that first');
    process.exit(2);
}

const survived = [];
let killed = 0;
let equivalent = 0;

for (const [i, m] of selected.entries()) {
    const original = readFileSync(m.file, 'utf8');
    if (!original.includes(m.find)) {
        console.log(`  ${String(i + 1).padStart(2)}. [${m.group}] STALE — "${m.what}"`);
        console.log('      the pattern no longer exists; update this mutation');
        survived.push({ ...m, stale: true });
        continue;
    }
    try {
        writeFileSync(m.file, original.replace(m.find, m.replace));
        const passed = suitePasses();
        if (passed && m.equivalent) {
            // An equivalent mutant produces the same behaviour, so no test
            // can kill it. Surviving is the correct outcome and is not a
            // coverage gap.
            equivalent++;
            process.stdout.write(`  ${String(i + 1).padStart(2)}. [${m.group}] equivalent\r`);
        } else if (passed) {
            survived.push(m);
            console.log(`  ${String(i + 1).padStart(2)}. [${m.group}] SURVIVED — ${m.what}`);
        } else if (m.equivalent) {
            // It was killed, so it was never equivalent after all.
            survived.push({ ...m, misdeclared: true });
            console.log(`  ${String(i + 1).padStart(2)}. [${m.group}] MISDECLARED equivalent — ${m.what}`);
        } else {
            killed++;
            process.stdout.write(`  ${String(i + 1).padStart(2)}. [${m.group}] killed\r`);
        }
    } finally {
        // Always restore, including on an interrupt, or the repository is
        // left with a deliberate defect in it.
        writeFileSync(m.file, original);
    }
}

console.log(`\n\n${killed}/${selected.length - equivalent} mutations killed`
    + (equivalent ? `  (${equivalent} equivalent, unkillable by construction)` : ''));
if (survived.length) {
    console.log(`\n${survived.length} survived — behaviour nothing is pinning down:\n`);
    for (const m of survived) {
        console.log(`  ${m.file}`);
        console.log(`    ${m.what}${m.stale ? '  (stale pattern)' : ''}`
            + (m.misdeclared ? '  (declared equivalent but was killed)' : ''));
    }
    process.exit(1);
}
console.log('every mutation was caught.');
