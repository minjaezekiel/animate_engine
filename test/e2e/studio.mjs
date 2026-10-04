/**
 * The pose editor, driven the way a person drives it: load a film, click a
 * hand, drag it somewhere, and check that the hand ended up there AND that
 * the film script now says so.
 *
 * That round trip is the only thing worth asserting here. IK correctness is
 * covered by unit tests; what a browser is needed for is that picking,
 * dragging, compiling and drawing agree with each other on screen.
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const CHROME = process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('../..', import.meta.url).pathname;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
                '.json': 'application/json', '.png': 'image/png',
                '.webmanifest': 'application/manifest+json' };

const server = createServer(async (req, res) => {
    try {
        const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
        const body = await readFile(join(ROOT, p === '/' ? 'studio.html' : p));
        res.writeHead(200, { 'content-type': TYPES[extname(p)] ?? 'application/octet-stream' });
        res.end(body);
    } catch { if (!res.headersSent) res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));
page.on('response', (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });

await page.goto(`${base}/studio.html`, { waitUntil: 'load' });
await page.waitForFunction(() => window.jirexStudio?.compiled, { timeout: 15000 });

const fail = (msg) => { console.error(`FAILED: ${msg}`); failures.push(msg); };
const failures = [];

// --- 1. the blank film boots, compiles and draws something ----------------
const boot = await page.evaluate(() => {
    const s = window.jirexStudio;
    const c = document.getElementById('stage');
    const px = c.getContext('2d', { willReadFrequently: true })
        .getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 3; i < px.length; i += 4) if (px[i] > 8) lit++;
    return {
        title: s.film.meta.title,
        duration: s.compiled.meta.duration,
        nodes: s.compiled.scene.byId.size,
        joints: s.joints().length,
        lit,
    };
});
console.log('boot:', JSON.stringify(boot));
if (boot.duration !== 4) fail(`blank film should be 4s, got ${boot.duration}`);
if (boot.joints < 15) fail(`expected a full rig of joints, got ${boot.joints}`);
if (boot.lit < 10000) fail(`stage looks blank: ${boot.lit} lit pixels`);

// --- 2. load the real demo film ------------------------------------------
await page.evaluate(async (origin) => {
    const film = await (await fetch(`${origin}/demo/film.json`)).json();
    window.jirexStudio.setFilm(film, 'test');
}, base);
await page.waitForFunction(() => window.jirexStudio.compiled?.meta.duration > 100);

const demo = await page.evaluate(() => ({
    duration: window.jirexStudio.compiled.meta.duration,
    joints: window.jirexStudio.joints().length,
}));
console.log('demo:', JSON.stringify(demo));
if (Math.abs(demo.duration - 120) > 0.001) fail(`demo should be 120s, got ${demo.duration}`);

// --- 3. drag a hand: picking, IK, write-back, redraw ----------------------
// Seek into the first shot, find the left hand's handle, and drag it 90px up
// and 60px left of where it is.
const dragResult = await page.evaluate(async () => {
    const s = window.jirexStudio;
    s.seek(1.5);
    const hand = s.joints().find((j) => j.partId === 'handL');
    if (!hand) return { error: 'no handL joint on stage' };

    const canvas = document.getElementById('picks');
    const rect = canvas.getBoundingClientRect();
    const toClient = (sx, sy) => [
        rect.left + sx * (rect.width / canvas.width),
        rect.top + sy * (rect.height / canvas.height),
    ];
    const send = (type, sx, sy) => {
        const [cx, cy] = toClient(sx, sy);
        canvas.dispatchEvent(new PointerEvent(type, {
            clientX: cx, clientY: cy, bubbles: true, pointerId: 1, isPrimary: true,
        }));
    };

    // Short enough to be inside the arm's reach, long enough to be obvious.
    const targetSx = hand.sx - 30;
    const targetSy = hand.sy - 45;
    send('pointerdown', hand.sx, hand.sy);
    const selected = s.compiled && document.getElementById('selProps').textContent;
    send('pointermove', targetSx, targetSy);
    send('pointerup', targetSx, targetSy);

    // Where did the hand actually end up on screen after the write-back?
    const after = s.joints().find((j) => j.nodeId === hand.nodeId);
    const shot = s.film.scenes[0].shots.find((sh) => (sh.actions ?? [])
        .some((a) => a.do === 'reach' && a.part === 'handL'));
    const action = shot?.actions.find((a) => a.do === 'reach' && a.part === 'handL');
    return {
        selected: /handL/.test(selected ?? ''),
        wrote: !!action,
        action,
        movedPx: Math.hypot(after.sx - hand.sx, after.sy - hand.sy),
        missPx: Math.hypot(after.sx - targetSx, after.sy - targetSy),
        // The action must EASE IN to the playhead, not start there, or the
        // pose you just made would not be the pose you are looking at.
        arrival: action ? (action.at ?? 0) + (action.for ?? 0) : null,
        log: document.getElementById('log').textContent.trim().split('\n').pop(),
    };
});
console.log('drag:', JSON.stringify(dragResult));
if (dragResult.error) fail(dragResult.error);
if (!dragResult.selected) fail('clicking the hand handle did not select it');
if (!dragResult.wrote) fail('the drag wrote no reach action into the film');
if (dragResult.action && dragResult.action.target !== 'mara' && dragResult.action.target !== 'jonas') {
    fail(`reach written against an unexpected target: ${dragResult.action?.target}`);
}
if (!(dragResult.movedPx > 20)) fail(`the hand barely moved: ${dragResult.movedPx}px`);
// A reachable drag must land under the cursor at the playhead. This is the
// assertion that caught the action being written to START at the playhead,
// which made every release look like it had snapped back.
if (!(dragResult.missPx < 6)) fail(`the hand missed the drag target by ${dragResult.missPx.toFixed(1)}px`);
if (dragResult.arrival == null || Math.abs(dragResult.arrival - 1.5) > 0.02) {
    fail(`the action lands at +${dragResult.arrival}s, not on the playhead (+1.5s)`);
}

// --- 4. undo puts the action back ------------------------------------------------
const undone = await page.evaluate(() => {
    const s = window.jirexStudio;
    const count = () => s.film.scenes.flatMap((sc) => sc.shots)
        .flatMap((sh) => sh.actions ?? []).filter((a) => a.do === 'reach').length;
    const was = count();
    const json = JSON.stringify(s.film);
    document.getElementById('undoBtn').click();
    const now = count();
    // restore, so the next check still has the posed film
    document.getElementById('jsonBox').value = json;
    return { was, now };
});
console.log('undo:', JSON.stringify(undone));
if (!(undone.now < undone.was)) fail(`undo left ${undone.now} reach actions (was ${undone.was})`);

// Put it back so the reproducibility check below has something to reproduce.
await page.evaluate(() => document.getElementById('applyBtn').click());

// --- 5. the written action survives a recompile from JSON alone ----------
const reloaded = await page.evaluate(() => {
    const s = window.jirexStudio;
    const json = JSON.stringify(s.film);
    const hand = s.joints().find((j) => j.partId === 'handL');
    const before = [hand.sx, hand.sy];
    s.setFilm(JSON.parse(json), 'reloaded');
    s.seek(1.5);
    const after = s.joints().find((j) => j.partId === 'handL');
    return { drift: Math.hypot(after.sx - before[0], after.sy - before[1]) };
});
console.log('reload:', JSON.stringify(reloaded));
if (!(reloaded.drift < 0.01)) {
    fail(`the pose is not reproducible from the saved script: ${reloaded.drift}px drift`);
}

// --- 6. onion skin and handles toggle without throwing -------------------
for (const id of ['ghosts', 'handles']) {
    await page.evaluate((i) => {
        const el = document.getElementById(i);
        el.checked = !el.checked;
        el.dispatchEvent(new Event('change'));
    }, id);
}

// --- 7. scrubbing the whole film draws every frame without error ---------
const scrub = await page.evaluate(() => {
    const s = window.jirexStudio;
    const dur = s.compiled.meta.duration;
    const t0 = performance.now();
    let frames = 0;
    for (let t = 0; t < dur; t += dur / 40) { s.seek(t); frames++; }
    return { frames, msPerFrame: Math.round((performance.now() - t0) / frames) };
});
console.log('scrub:', JSON.stringify(scrub));
if (scrub.frames !== 40) fail(`scrub drew ${scrub.frames} frames`);

// --- 8. the PWA is actually installable -------------------------------
// Every URL in a manifest resolves against the MANIFEST's own location, and a
// service worker only controls its own directory. Both were silently wrong,
// and neither shows up as an error in the page -- only as a 404 and an
// offline story that never worked. So assert them.
const pwa = await page.evaluate(async () => {
    const href = document.querySelector('link[rel=manifest]')?.href;
    if (!href) return { error: 'no manifest link' };
    const res = await fetch(href);
    if (!res.ok) return { error: `manifest ${res.status}` };
    const manifest = await res.json();
    const resolve = (u) => new URL(u, href).href;

    const icons = [];
    for (const icon of manifest.icons ?? []) {
        const r = await fetch(resolve(icon.src));
        icons.push({ src: icon.src, status: r.status });
    }
    const startUrl = resolve(manifest.start_url);
    const scope = resolve(manifest.scope ?? './');
    const reg = await navigator.serviceWorker.getRegistration();
    return {
        icons,
        startUrlStatus: (await fetch(startUrl)).status,
        scopeCoversPage: location.href.startsWith(scope),
        scopeCoversStart: startUrl.startsWith(scope),
        swScope: reg?.scope ?? null,
        swControlsPage: reg ? location.href.startsWith(reg.scope) : false,
    };
});
console.log('pwa:', JSON.stringify(pwa));
if (pwa.error) fail(`manifest: ${pwa.error}`);
for (const icon of pwa.icons ?? []) {
    if (icon.status !== 200) fail(`manifest icon "${icon.src}" resolves to a ${icon.status}`);
}
if (!pwa.icons?.length) fail('manifest declares no icons; it will not install');
if (pwa.startUrlStatus !== 200) fail(`manifest start_url resolves to a ${pwa.startUrlStatus}`);
if (!pwa.scopeCoversStart) fail('manifest scope does not contain its own start_url');
if (!pwa.scopeCoversPage) fail('manifest scope does not cover the editor page');
if (!pwa.swControlsPage) fail(`service worker scope ${pwa.swScope} does not cover the app`);

await browser.close();
server.close();

if (errors.length) { console.error('page errors:\n - ' + errors.join('\n - ')); failures.push('page errors'); }
if (failures.length) { console.error(`\nFAILED (${failures.length})`); process.exit(1); }
console.log(`\nPASS: editor boots, picks, solves, writes, undoes, reproduces and scrubs `
    + `(${scrub.msPerFrame}ms/frame preview); PWA installable, sw scope ${pwa.swScope}.`);
