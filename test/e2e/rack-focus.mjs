/**
 * A rack focus, measured on real pixels.
 *
 * `test/core/post-keys.test.mjs` proves the arithmetic: that a `focus` ramp
 * becomes a timeline channel, interpolates, holds to the end of its shot and
 * is sampled smoothly. None of that proves the number reaches the lens.
 *
 * That gap is exactly where this repo has been bitten before. `set
 * props.trim.offset` wrote a property literally named "trim.offset" that
 * nothing read, silently. A keyed post parameter has the same failure mode and
 * it is worse, because each pass keeps its parameters somewhere different --
 * `BokehPass` in `uniforms`, `UnrealBloomPass` as plain fields -- so writing
 * to the wrong place changes nothing and reports nothing.
 *
 * So this measures SHARPNESS, as mean absolute horizontal luma gradient, over
 * two striped targets at different depths, in a film whose camera never
 * moves. Any change in sharpness is therefore the focus and nothing else. A
 * rack focus is then a very specific claim: the near target starts sharper
 * than the far one and ends blurrier than it. The ratio must CROSS.
 */
import puppeteer from 'puppeteer-core';
import { startGuard, closeBrowser } from './lib/guard.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { acquireLock } from '../../scripts/lib/render-lock.mjs';

const CHROME = process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('../..', import.meta.url).pathname;
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
            '.json': 'application/json', '.png': 'image/png', '.wav': 'audio/wav' };

const srv = createServer(async (q, r) => {
    try {
        const f = join(ROOT, normalize(new URL(q.url, 'http://x').pathname));
        const b = await readFile(f);
        r.writeHead(200, { 'content-type': T[extname(f)] ?? 'application/octet-stream' });
        r.end(b);
    } catch { if (!r.headersSent) r.writeHead(404); r.end(); }
});
await new Promise((r) => srv.listen(0, r));
const base = `http://127.0.0.1:${srv.address().port}`;

/** A picket of thin bright bars: high-frequency detail that blur destroys. */
function bars(n = 11, pitch = 0.11, w = 0.055, h = 1.3) {
    const parts = [];
    for (let i = 0; i < n; i++) {
        parts.push({
            id: `b${i}`,
            geometry: { kind: 'plane', width: w, height: h },
            material: i % 2 ? 'dark' : 'bright',
            at: [(i - (n - 1) / 2) * pitch, 0, 0],
        });
    }
    return { parts };
}

/**
 * Two pickets, one near and one far, in opposite halves of the frame, lit
 * flat and emissive so neither depends on a light. The camera is nailed down
 * (`for: 0`, one `from`, no `to`) and the ONLY thing that moves in the whole
 * film is `dof.focus`.
 */
const NEAR_Z = -2.5;
const FAR_Z = -8;
const film = {
    version: 'jirex.film3d/1',
    meta: {
        title: 'rack focus', fps: 24, width: 480, height: 270, background: '#000000',
        post: { dof: { focus: 2.5, aperture: 0.012, maxblur: 0.03 } },
    },
    materials: {
        bright: { color: '#ffffff', roughness: 1, metalness: 0,
                  emissive: '#ffffff', emissiveIntensity: 1 },
        dark: { color: '#000000', roughness: 1, metalness: 0,
                emissive: '#000000', emissiveIntensity: 0 },
    },
    lights: [{ id: 'amb', type: 'ambient', color: '#ffffff', intensity: 1 }],
    assemblies: { picket: bars() },
    cast: [
        { assembly: 'picket', as: 'near', at: [-1.10, 0, NEAR_Z], set: true },
        { assembly: 'picket', as: 'far', at: [3.20, 0, FAR_Z], set: true },
    ],
    scenes: [{
        id: 's1',
        shots: [{
            id: 'rack', duration: 3,
            camera: { from: { at: [0, 0, 0], look: [0, 0, -5], fov: 50 }, for: 0 },
            // The pull: from the near picket's depth to the far one's.
            focus: { from: -NEAR_Z, to: -FAR_Z, for: 3, ease: 'linear' },
        }],
    }],
};

const AT = [0, 1.5, 3];

await acquireLock('the rack-focus probe');
const br = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=metal'],
    protocolTimeout: 600_000,
});
const guard = startGuard({ ms: 600_000, name: 'test:rack:e2e' });
guard.onCleanup(() => closeBrowser(br));
guard.onCleanup(() => srv.close());
const pg = await br.newPage();
const pageErrors = [];
pg.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)));
/**
 * 120s, not puppeteer's default 30s.
 *
 * Every headless run launches a FRESH Chrome profile, so the browser cache is
 * empty and `film3d.html`'s ten `three` modules are fetched from a CDN from
 * scratch every single time. Measured at 7.8s for `three.module.js` alone on
 * an ordinary connection, which puts a cold load within reach of 30s and
 * occasionally past it -- an intermittent "Navigation timeout" that looks
 * like a broken page and is a slow network. The same reason the voice take
 * cache exists; see src/core/voice/takeCache.js.
 */
await pg.goto(`${base}/film3d.html`, { waitUntil: 'load', timeout: 120_000 });
await pg.waitForFunction(() => typeof window.render3d === 'function', { timeout: 30000 });

const res = await pg.evaluate(async (f, times) => {
    const out = await window.render3d(f, {
        width: 480, height: 270, silent: true, mute: true, grab: times,
    });
    /**
     * Sharpness as mean SQUARED horizontal luma gradient over a band.
     *
     * Squared, and the first version of this probe got it wrong in a way
     * worth keeping: mean |dLuma/dx| is total variation, and blur very nearly
     * PRESERVES total variation. Spreading an edge over k pixels makes each
     * step Δ/k, and there are k of them, so the sum is unchanged. Measured
     * that way the near picket read 13.698 sharp and 13.210 defocused -- a 4%
     * difference for a lens change that is obvious to look at.
     *
     * Squaring fixes it for the same arithmetic: k steps of (Δ/k)² sum to
     * Δ²/k, so the measure falls as the blur widens. This is the standard
     * gradient-energy focus measure and it is standard for this reason.
     *
     * (The far picket DID register on the absolute measure, because at the
     * near focus setting it was blurred so hard its bars merged into flat
     * grey, which destroys total variation outright. One target changing and
     * the other not is what exposed the flaw.)
     *
     * Measured on the decoded PNG rather than on the live canvas, so what is
     * being judged is the image that was actually produced. A mid-height band
     * only, because the pickets are 1.3 units tall and the rest of the frame
     * is empty black whose gradient is zero and would dilute both numbers
     * equally but needlessly.
     */
    const sharpness = async (dataUrl) => {
        const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
        const c = new OffscreenCanvas(bmp.width, bmp.height);
        const cx = c.getContext('2d', { willReadFrequently: true });
        cx.drawImage(bmp, 0, 0);
        const d = cx.getImageData(0, 0, bmp.width, bmp.height).data;
        const luma = (x, y) => {
            const i = (y * bmp.width + x) * 4;
            return d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        };
        const band = (x0, x1) => {
            const y0 = Math.round(bmp.height * 0.3);
            const y1 = Math.round(bmp.height * 0.7);
            const a = Math.round(bmp.width * x0);
            const b = Math.round(bmp.width * x1);
            let sum = 0;
            let n = 0;
            for (let y = y0; y < y1; y++) {
                for (let x = a; x < b - 1; x++) {
                    const g = luma(x + 1, y) - luma(x, y);
                    sum += g * g;
                    n++;
                }
            }
            return n ? sum / n : 0;
        };
        return {
            // The near picket sits left of centre, the far one right of it.
            near: +band(0.02, 0.45).toFixed(1),
            far: +band(0.55, 0.98).toFixed(1),
        };
    };
    const rows = [];
    for (const fr of out.frames) rows.push({ t: fr.t, ...(await sharpness(fr.png)) });
    return { rows, diagnostics: out.diagnostics };
}, film, AT);

await guard.done();

const fails = [];
if (pageErrors.length) fails.push(`page errors: ${pageErrors.join(' | ')}`);
for (const d of res.diagnostics ?? []) {
    if (d.severity === 'error') fails.push(`compile error: ${d.message}`);
}

console.log('\n  t     near      far       near/far');
for (const r of res.rows) {
    console.log(`  ${String(r.t).padEnd(5)} ${r.near.toFixed(1).padEnd(9)} `
        + `${r.far.toFixed(1).padEnd(9)} ${(r.near / (r.far || 1e-9)).toFixed(3)}`);
}

const [start, mid, end] = res.rows;
if (!start || !end) fails.push('the probe produced no frames');
else {
    // Both targets must be VISIBLE, or two zeroes would satisfy every ratio
    // test below and the probe would pass while measuring nothing.
    if (!(start.near > 50)) fails.push(`the near picket is not resolved at all (${start.near})`);
    if (!(end.far > 50)) fails.push(`the far picket is not resolved at all (${end.far})`);
    // The claim, in one line: the ratio crosses.
    const r0 = start.near / (start.far || 1e-9);
    const r1 = end.near / (end.far || 1e-9);
    if (!(r0 > 1)) fails.push(`at t=0 the near target is not the sharper one (ratio ${r0.toFixed(3)})`);
    if (!(r1 < 1)) fails.push(`at the end the far target is not the sharper one (ratio ${r1.toFixed(3)})`);
    if (!(r0 / r1 > 1.5)) {
        fails.push(`the focus barely moved: near/far went ${r0.toFixed(3)} -> ${r1.toFixed(3)}`);
    }
    /**
     * At least one target must change by a LARGE factor on its own, not just
     * relative to the other, or a ratio that crosses proves only that two
     * numbers moved a little.
     *
     * The thresholds are asymmetric because `BokehPass` is, and that is worth
     * knowing before authoring a pull: measured here, the target BEHIND the
     * focal plane went from 74 to 1007 -- 13.6x -- while the target in FRONT
     * of it softened by 5%. Defocus in this pass is far stronger beyond the
     * focus distance than nearer than it. So the strong claim is made about
     * the far target, and the near target is only required not to get
     * SHARPER, which it has no honest reason to do.
     */
    if (!(end.far / (start.far || 1e-9) > 3)) {
        fails.push(`the far target never came into focus: ${start.far} -> ${end.far} `
            + `(want at least 3x)`);
    }
    if (!(end.near <= start.near * 1.02)) {
        fails.push(`the near target got SHARPER as focus pulled away from it: `
            + `${start.near} -> ${end.near}`);
    }
    // Halfway through a linear pull both should be partly defocused, which is
    // what distinguishes a RAMP from a cut between two focus settings.
    if (mid && !(mid.far < end.far && mid.far >= start.far)) {
        fails.push(`the pull is not continuous: the far target reads ${mid.far} halfway, `
            + `outside its own ${start.far} -> ${end.far} range`);
    }
}

if (fails.length) { console.error('\nFAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
const [s, , e] = res.rows;
console.log(`\nPASS: focus racked ${-NEAR_Z}m -> ${-FAR_Z}m; near sharpness `
    + `${s.near} -> ${e.near}, far ${s.far} -> ${e.far}, `
    + `near/far ${(s.near / s.far).toFixed(2)} -> ${(e.near / e.far).toFixed(2)}`);
