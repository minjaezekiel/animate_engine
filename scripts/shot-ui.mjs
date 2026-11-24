/**
 * Screenshot one of this repo's own pages, headless.
 *
 *   node scripts/shot-ui.mjs workspace.html out/ui/workspace.png
 *   WIDTH=1440 HEIGHT=900 node scripts/shot-ui.mjs index.html
 *   FULL=1 node scripts/shot-ui.mjs workspace.html          # full scroll height
 *
 * # Why this did not exist and should have
 *
 * Every rendering lesson in this repo is the same sentence: **a drawing is
 * checked by looking at it.** There is a frame grab for 2D films, a frame
 * grab for 3D films, a contact sheet, and a texture previewer -- and nothing
 * at all for the EDITORS, which are the part a person actually touches.
 *
 * So the five UI surfaces here have never been looked at by anything except a
 * person who already knew where everything was. That is how a project ends up
 * with "Export" in three different panels: each one was correct when it was
 * added, and nothing ever rendered the whole thing at once.
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, dirname, basename } from 'node:path';

const CHROME = process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('..', import.meta.url).pathname;
const PAGE = process.argv[2] ?? 'workspace.html';
const OUT = process.argv[3] ?? `out/ui/${basename(PAGE, '.html')}.png`;
const WIDTH = Number(process.env.WIDTH ?? 1440);
const HEIGHT = Number(process.env.HEIGHT ?? 900);
const FULL = process.env.FULL === '1';
/** CSS selector to click before shooting, so a panel can be opened first. */
const CLICK = process.env.CLICK ?? null;

const TYPES = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.json': 'application/json', '.png': 'image/png', '.css': 'text/css',
    '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
    '.wasm': 'application/wasm', '.wav': 'audio/wav',
};

const server = createServer(async (req, res) => {
    try {
        const p = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
        const f = join(ROOT, p === '/' ? PAGE : p);
        if (!f.startsWith(ROOT)) { res.writeHead(403).end(); return; }
        res.writeHead(200, { 'content-type': TYPES[extname(f)] ?? 'application/octet-stream' });
        res.end(await readFile(f));
    } catch { if (!res.headersSent) res.writeHead(404); res.end('not found'); }
});
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=metal',
           '--hide-scrollbars'],
});
const page = await browser.newPage();
await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
const problems = [];
page.on('pageerror', (e) => problems.push(`page error: ${String(e).slice(0, 160)}`));
page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('404')) {
        problems.push(`console: ${m.text().slice(0, 160)}`);
    }
});

await page.goto(`${base}/${PAGE}`, { waitUntil: 'load' });
// A beat for fonts and for any first paint the page does on load. Not
// `networkidle`: several of these pages register a service worker, so network
// quiet stopped being a readiness signal.
await new Promise((r) => setTimeout(r, 900));
if (CLICK) {
    await page.click(CLICK).catch(() => problems.push(`could not click ${CLICK}`));
    await new Promise((r) => setTimeout(r, 400));
}

await mkdir(join(ROOT, dirname(OUT)), { recursive: true });
await page.screenshot({ path: join(ROOT, OUT), fullPage: FULL });

/**
 * A count of interactive controls, printed with the shot.
 *
 * The number nobody had: a surface with seventy-four buttons visible at once
 * is a different design problem from one with twelve, and until it is
 * measured it is an opinion.
 */
const counts = await page.evaluate(() => {
    const visible = (el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
    };
    const all = [...document.querySelectorAll('button, input, select, textarea, [role="button"], a[href]')];
    return { total: all.length, visible: all.filter(visible).length };
});
console.log(`${OUT}  ${WIDTH}x${HEIGHT}${FULL ? ' (full page)' : ''}`);
console.log(`  controls: ${counts.visible} visible of ${counts.total} in the document`);
for (const p of [...new Set(problems)]) console.log(`  [${p}]`);

await browser.close();
server.close();
