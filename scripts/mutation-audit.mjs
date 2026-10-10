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
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

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
      find: 'const cs = Math.min(1, Math.max(0, s[c] * invSa));', replace: 'const cs = Math.min(1, Math.max(0, s[c]));' },
    { group: 'blend', file: 'src/kernels/js/blend.js', what: 'layer opacity is ignored',
      find: 'const sa = S[p + 3] * op;', replace: 'const sa = S[p + 3];' },
    { group: 'blend', file: 'src/kernels/js/blend.js', what: 'colorDodge divides by the wrong operand',
      find: 'return Math.min(1, cb / (1 - cs));', replace: 'return Math.min(1, cs / (1 - cb));' },
    { group: 'blend', file: 'src/kernels/js/blend.js', what: 'an unknown blend mode silently becomes normal',
      find: "throw new Error(`unknown blend mode \"${name}\"; available: ${MODE_NAMES.join(', ')}`);",
      replace: 'return 0;' },

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
      find: 'if (!layer.visible || layer.opacity <= 0) continue;\n            K.blendLayers(', replace: 'K.blendLayers(' },
    { group: 'document', file: 'src/core/paint/Document.js', what: 'the composite is not cleared before flattening',
      find: 'K.clearF32(target, w * h * 4);', replace: '' },
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
