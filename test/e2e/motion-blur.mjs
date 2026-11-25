/**
 * Motion blur, measured on real pixels.
 *
 * `test/core/motion-blur.test.mjs` proves the arithmetic: the sample times,
 * the shutter angle, the linear-light averaging, the declaration. What it
 * cannot prove is that the render loop draws those subframes and that the
 * average reaches the surface the sink is recording -- and that last part is
 * the one with a real trap in it, because `MediaRecorderSink` captures a
 * stream from the canvas it was handed at configure time, so a blur that
 * accumulated into a canvas of its own would record the unblurred original
 * and report nothing.
 *
 * So this renders one film twice, identical but for the blur, and measures:
 *
 *   1. A MOVING edge must spread. Counted as the number of columns that are
 *      neither background nor foreground -- an instantaneous frame has at
 *      most one or two (antialiasing), a blurred one has many.
 *   2. A STILL frame must be bit-identical. A blur that drifts a static shot
 *      is averaging wrongly, and it would be invisible on moving footage.
 *   3. The brightness must survive. Averaging in sRGB rather than in linear
 *      light makes a bright thing on a dark background come out markedly too
 *      dark, which is the classic "dirty" motion blur.
 */
import puppeteer from 'puppeteer-core';
import { startGuard, closeBrowser } from './lib/guard.mjs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const CHROME = process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('../..', import.meta.url).pathname;
const T = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

const PAGE = `<!doctype html><meta charset="utf-8"><title>blur</title>
<canvas id="c" width="320" height="64"></canvas>
<script type="module">
import { Scene } from '/src/core/scene/Scene.js';
import { createTimeline, key } from '/src/core/anim/Timeline.js';
import { renderOffline } from '/src/render/OfflineRenderer.js';
import { Canvas2DBackend } from '/src/backends/canvas2d/Canvas2DBackend.js';
import { MemorySink } from '/src/render/sinks/MemorySink.js';
import { normalizeMotionBlur } from '/src/core/motion/motionBlur.js';

/**
 * A Scene and a Timeline built by hand, not a film.
 *
 * renderOffline() is what the blur hooks into, and it takes a scene and a
 * timeline -- so going through the film DSL would put a compiler between the
 * test and the thing under test, for no gain. A white bar on black, flat, so
 * every number below is about the shutter and not about shading.
 *
 * 280 px of travel in one second at 24fps is 11.7 px per frame, which is
 * about where strobing becomes obvious and therefore the speed worth testing.
 */
const W = 320, H = 64, FPS = 24;
function build(moving) {
  const scene = new Scene();
  scene.add({ id: '__camera', kind: 'camera',
              transform: { x: W / 2, y: H / 2 },
              props: { zoom: 1, frameWidth: W, frameHeight: H } });
  scene.add({ id: 'bg', kind: 'rect', transform: { x: W / 2, y: H / 2 },
              props: { w: W * 3, h: H * 3, cx: true, cy: true, fill: '#000000' }, z: -900 });
  scene.add({ id: 'bar', kind: 'rect', transform: { x: 20, y: H / 2 },
              props: { w: 24, h: H, cx: true, cy: true, fill: '#ffffff' }, z: 0 });
  const timeline = createTimeline({ fps: FPS, duration: 1 });
  if (moving) {
    key(timeline, 'bar', 'transform.x', 0, 20, { type: 'number', ease: 'linear' });
    key(timeline, 'bar', 'transform.x', 1, 300, { type: 'number', ease: 'linear' });
  } else {
    key(timeline, 'bar', 'transform.x', 0, 160, { type: 'number', ease: 'linear' });
    key(timeline, 'bar', 'transform.x', 1, 160, { type: 'number', ease: 'linear' });
  }
  return { scene, timeline };
}

/** Column profile of a middle band, as 0..255 luma. */
function columns(ctx) {
  const y0 = Math.round(H * 0.4), rows = Math.round(H * 0.2);
  const d = ctx.getImageData(0, y0, W, rows).data;
  const out = [];
  for (let x = 0; x < W; x++) {
    let s = 0;
    for (let y = 0; y < rows; y++) {
      const i = (y * W + x) * 4;
      s += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    }
    out.push(s / rows);
  }
  return out;
}

async function renderAt(mbSpec, moving, frame) {
  const canvas = document.getElementById('c');
  const backend = new Canvas2DBackend({ width: W, height: H });
  backend.mount(canvas, { width: W, height: H });
  const { scene, timeline } = build(moving);
  const motionBlur = normalizeMotionBlur(mbSpec);
  await renderOffline({
    scene, timeline, backend, cameraId: '__camera', fps: FPS,
    width: W, height: H, durationSec: (frame + 1) / FPS,
    sink: new MemorySink(), motionBlur,
  });
  return { cols: columns(backend.canvas().getContext('2d', { willReadFrequently: true })),
           blur: motionBlur };
}

window.run = async () => {
  const FRAME = 12;
  const sharp      = await renderAt(null, true, FRAME);
  const blurred    = await renderAt({ samples: 8, shutter: 180 }, true, FRAME);
  const wide       = await renderAt({ samples: 8, shutter: 360 }, true, FRAME);
  const stillSharp = await renderAt(null, false, FRAME);
  const stillBlur  = await renderAt({ samples: 8, shutter: 180 }, false, FRAME);

  // A column is "in between" when it is neither near-black nor near-white.
  const partial = (c) => c.filter((v) => v > 12 && v < 243).length;
  const lit = (c) => c.filter((v) => v > 12).length;
  const peak = (c) => Math.max(...c);
  const energy = (c) => c.reduce((a, b) => a + b, 0);

  return {
    declared: blurred.blur,
    sharp:   { partial: partial(sharp.cols), lit: lit(sharp.cols),
               peak: peak(sharp.cols), energy: energy(sharp.cols) },
    blurred: { partial: partial(blurred.cols), lit: lit(blurred.cols),
               peak: peak(blurred.cols), energy: energy(blurred.cols) },
    wide:    { partial: partial(wide.cols), lit: lit(wide.cols) },
    stillIdentical: stillSharp.cols.every((v, i) => Math.abs(v - stillBlur.cols[i]) < 0.5),
    stillMaxDiff: Math.max(...stillSharp.cols.map((v, i) => Math.abs(v - stillBlur.cols[i]))),
  };
};
</script>`;

const srv = createServer(async (q, r) => {
    const path = normalize(new URL(q.url, 'http://x').pathname);
    if (path === '/__blur') { r.writeHead(200, { 'content-type': 'text/html' }); r.end(PAGE); return; }
    try {
        const f = join(ROOT, path);
        const b = await readFile(f);
        r.writeHead(200, { 'content-type': T[extname(f)] ?? 'application/octet-stream' });
        r.end(b);
    } catch { if (!r.headersSent) r.writeHead(404); r.end(); }
});
await new Promise((r) => srv.listen(0, r));
const base = `http://127.0.0.1:${srv.address().port}`;

const br = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
    protocolTimeout: 300_000,
});
const guard = startGuard({ ms: 300_000, name: 'test:blur:e2e' });
guard.onCleanup(() => closeBrowser(br));
guard.onCleanup(() => srv.close());
const pg = await br.newPage();
const errors = [];
pg.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
guard.stage('load');
await pg.goto(`${base}/__blur`, { waitUntil: 'load', timeout: 120_000 });
await pg.waitForFunction(() => typeof window.run === 'function', { timeout: 30_000 });
guard.stage('render five films');
const r = await pg.evaluate(() => window.run());

const fails = [];
if (errors.length) fails.push(`page errors: ${errors.join(' | ')}`);
if (!r.declared) fails.push('the film declared motion blur and the compiler produced none');

console.log('\n  variant            partial cols   lit cols   peak');
for (const [k, v] of Object.entries({ sharp: r.sharp, blurred: r.blurred })) {
    console.log(`  ${k.padEnd(18)} ${String(v.partial).padStart(12)} `
        + `${String(v.lit).padStart(10)} ${v.peak.toFixed(1).padStart(7)}`);
}
console.log(`  wide (360 deg)     ${String(r.wide.partial).padStart(12)} `
    + `${String(r.wide.lit).padStart(10)}`);
console.log(`  still frames identical: ${r.stillIdentical} `
    + `(max column difference ${r.stillMaxDiff.toFixed(3)})`);

// 1. A moving edge must spread.
if (!(r.sharp.partial <= 4)) {
    fails.push(`an UNBLURRED frame has ${r.sharp.partial} partial columns; the test's own `
        + 'premise is wrong, since an instant should have hard edges');
}
if (!(r.blurred.partial > r.sharp.partial + 4)) {
    fails.push(`blurred has ${r.blurred.partial} partial columns against ${r.sharp.partial} `
        + 'sharp: the subframes are not being accumulated');
}
if (!(r.blurred.lit > r.sharp.lit + 3)) {
    fails.push(`the bar covers ${r.blurred.lit} columns blurred against ${r.sharp.lit} sharp; `
        + 'a 180-degree shutter should smear it over roughly half a frame of travel');
}
/**
 * 2. The smear must be exactly as wide as the travel during the opening.
 *
 * This is the claim worth making, and the one that distinguishes a correct
 * shutter from any blur at all. The bar crosses 280 px in 1 second at 24fps,
 * so it travels 280/24 = 11.67 px per frame. A 180-degree shutter is open for
 * half of that and must therefore smear it by ~5.8 px; a 360-degree shutter
 * by the full ~11.7.
 *
 * Asserting only "wider is wider" would pass a shutter that was open for any
 * fraction at all, including one unrelated to the angle asked for.
 */
const travel = 280 / 24;
for (const [name, v, angle] of [['180', r.blurred, 180], ['360', r.wide, 360]]) {
    const want = travel * (angle / 360);
    const got = v.lit - r.sharp.lit;
    if (Math.abs(got - want) > 2) {
        fails.push(`a ${name}-degree shutter smeared the bar by ${got} px where its own travel `
            + `predicts ${want.toFixed(1)} px: the angle is not reaching the sample times`);
    }
}
if (!(r.wide.lit > r.blurred.lit)) {
    fails.push(`a 360-degree shutter lit ${r.wide.lit} columns and a 180-degree one `
        + `${r.blurred.lit}; the shutter angle is not reaching the sample times`);
}
// 3. A still frame must be untouched.
if (!r.stillIdentical) {
    fails.push(`a STILL frame differs by up to ${r.stillMaxDiff.toFixed(3)} with blur on; `
        + 'the averaging is lossy and would drift a static shot');
}
/**
 * 4. The light must survive.
 *
 * Summed over sRGB luma rather than over linear light, so the figure runs a
 * little OVER 100% -- a smeared edge puts more pixels at mid grey, and mid
 * grey is disproportionately bright once encoded. That is fine for this
 * assertion, whose job is to catch the opposite failure: averaging in sRGB
 * instead of in linear light loses a large fraction of a bright thing's
 * light against a dark background, which is the classic "dirty" blur.
 */
const ratio = r.blurred.energy / r.sharp.energy;
if (!(ratio > 0.85)) {
    fails.push(`the blurred frame carries only ${(ratio * 100).toFixed(0)}% of the sharp `
        + "frame's light; that is the signature of averaging in sRGB rather than in linear light");
}

/**
 * The 3D arm, which is where the real trap is.
 *
 * The 2D backend always has a 2D canvas. The 3D backend renders into a WebGL
 * one and only has a 2D composite when something asked for one -- an overlay,
 * a transition. `putImageData` needs the 2D context, so motion blur has to be
 * on that list too, and if it is not the symptom is a thrown error rather
 * than a silently sharp render. This checks the list includes it.
 */
guard.stage('3D path');
const pg2 = await br.newPage();
const errors3d = [];
pg2.on('pageerror', (e) => errors3d.push(String(e).slice(0, 300)));
await pg2.goto(`${base}/film3d.html`, { waitUntil: 'load', timeout: 120_000 });
await pg2.waitForFunction(() => typeof window.render3d === 'function', { timeout: 30_000 });
const r3d = await pg2.evaluate(async () => {
    const film = {
        version: 'jirex.film3d/1',
        meta: { title: 'blur3d', fps: 24, width: 240, height: 135, background: '#101010',
                motionBlur: { samples: 4, shutter: 180 } },
        materials: { pale: { color: '#e8e8e8', roughness: 1, metalness: 0,
                             emissive: '#e8e8e8', emissiveIntensity: 1 } },
        lights: [{ id: 'amb', type: 'ambient', color: '#ffffff', intensity: 1 }],
        assemblies: { card: { parts: [{ id: 'face',
            geometry: { kind: 'box', width: 1, height: 1, depth: 1 }, material: 'pale' }] } },
        cast: [{ assembly: 'card', as: 'card', at: [0, 0, 0], set: true }],
        scenes: [{ id: 's1', shots: [{
            id: 'a', duration: 0.5,
            camera: { from: { at: [0, 0, 8], look: [0, 0, 0] }, for: 0 },
            actions: [{ do: 'move', target: 'card', to: [4, 0, 0], at: 0, for: 0.5 }],
        }] }],
    };
    try {
        const out = await window.render3d(film, {
            width: 240, height: 135, silent: true, mute: true, grab: [0.25],
        });
        return { ok: true, frames: out.frames?.length ?? 0,
                 png: (out.frames?.[0]?.png ?? '').slice(0, 20),
                 diagnostics: (out.diagnostics ?? []).filter((d) => d.severity === 'error')
                     .map((d) => d.message) };
    } catch (e) { return { ok: false, error: String(e.message ?? e) }; }
});
await guard.done();

console.log(`\n  3D path: ${r3d.ok ? `rendered ${r3d.frames} frame(s) with blur` : `FAILED — ${r3d.error}`}`);
if (!r3d.ok) {
    fails.push(`the 3D path threw with motion blur declared: ${r3d.error}`);
} else {
    if (!r3d.frames) fails.push('the 3D path produced no frames with motion blur on');
    if (!r3d.png.startsWith('data:image/png')) {
        fails.push(`the 3D path did not return a PNG: ${r3d.png}`);
    }
    for (const m of r3d.diagnostics ?? []) fails.push(`3D compile error: ${m}`);
}
if (errors3d.length) fails.push(`3D page errors: ${errors3d.join(' | ')}`);

if (fails.length) { console.error('\nFAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
console.log(`\nPASS: a moving edge spreads from ${r.sharp.partial} to ${r.blurred.partial} `
    + `partial columns; the bar travels ${travel.toFixed(1)} px a frame and is smeared by `
    + `${r.blurred.lit - r.sharp.lit} px at 180 degrees and ${r.wide.lit - r.sharp.lit} px at `
    + `360, against ${(travel / 2).toFixed(1)} and ${travel.toFixed(1)} predicted; a still `
    + `frame is unchanged and ${(ratio * 100).toFixed(0)}% of the light survives`);
