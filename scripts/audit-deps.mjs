/**
 * Audit every dependency the *browser* is asked to load.
 *
 *   npm run audit:deps
 *
 * This engine ships as static ES modules with no bundler, so its real
 * dependency list is not `package.json` -- it is whatever the import maps
 * in the HTML entry points name, plus anything a module fetches at
 * runtime. Those two lists drift apart silently: `package.json` declared
 * `three@^0.128.0` as a peer while every page actually imported r169.
 *
 * So this script loads each one in a real browser over a secure origin and
 * runs a smoke check against it, rather than trusting a manifest. A
 * dependency that cannot be exercised is reported as such; the exit code
 * is non-zero only when something that should work does not, so an offline
 * machine reports `unreachable` and does not fail the build.
 *
 * The standing rule this enforces: anything on this list must either work
 * in a browser with no build step, or be replaced by something in-tree.
 * `src/kernels` is the model -- it has no dependencies at all, and its
 * wasm is embedded rather than fetched for exactly this reason.
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const CHROME = process.env.CHROME
    || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const TYPES = {
    '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
    '.json': 'application/json', '.wasm': 'application/wasm', '.css': 'text/css',
};

// Serve the repository, so a dependency check runs against the same module
// graph the app does -- including the kernel loader, which must work from
// a plain static server with no configuration.
// The import map must arrive with the served document. Setting it via
// `page.setContent` and then navigating replaces the document and drops
// the map, which makes every bare specifier fail to resolve and reads
// exactly like a broken CDN -- it did, on the first run of this script.
const AUDIT_PAGE = `<!doctype html><meta charset="utf-8"><title>dependency audit</title>
<script type="importmap">{"imports":{
  "three": "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/",
  "onnxruntime-web": "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/+esm"
}}</script>`;

const server = createServer((req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    if (path === '/__audit') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(AUDIT_PAGE);
        return;
    }
    const file = join(ROOT, path === '/' ? '/index.html' : path);
    if (!file.startsWith(ROOT) || !existsSync(file)) {
        res.writeHead(404).end('not found');
        return;
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
}).listen(0);
await new Promise((r) => server.on('listening', r));
const ORIGIN = `http://localhost:${server.address().port}`;

/**
 * Each check is `{ name, why, required, probe }`. `probe` runs in the page
 * and returns a short string on success or throws. `required: false` marks
 * a dependency the engine degrades past rather than needs.
 */
const CHECKS = [
    {
        name: 'src/kernels (in-tree, wasm)',
        why: 'deform, paint and image kernels',
        required: true,
        probe: async (origin) => {
            const m = await import(`${origin}/src/kernels/index.js`);
            const K = await m.loadKernels({ prefer: 'wasm' });
            if (K.backend !== 'wasm') throw new Error('wasm did not load in the browser');
            const out = K.f32(3);
            K.skin(K.from(Float32Array.from([1, 2, 3])),
                K.from(Uint32Array.from([0, 0, 0, 0]), Uint32Array),
                K.from(Float32Array.from([1, 0, 0, 0])),
                K.from(Float32Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 10, 0, 0, 1])),
                out, 1, 1);
            if (Math.abs(out.array[0] - 11) > 1e-5) throw new Error('kernel returned wrong value');
            return `wasm, simd128=${K.simd}, 0 deps, 0 imports`;
        },
    },
    {
        name: 'three@0.169.0',
        why: '3D scene graph and WebGL renderer',
        required: true,
        probe: async () => {
            const T = await import('three');
            const s = new T.Scene();
            s.add(new T.Mesh(new T.BoxGeometry(1, 1, 1), new T.MeshStandardMaterial()));
            if (!T.REVISION) throw new Error('no REVISION');
            return `r${T.REVISION}, scene built`;
        },
    },
    {
        name: 'three/addons BufferGeometryUtils',
        why: 'mergeGeometries, used by every built mesh',
        required: true,
        probe: async () => {
            const T = await import('three');
            const U = await import('three/addons/utils/BufferGeometryUtils.js');
            const g = U.mergeGeometries([new T.BoxGeometry(1, 1, 1), new T.SphereGeometry(1)]);
            if (!g || !g.attributes.position) throw new Error('merge produced nothing');
            return `merged to ${g.attributes.position.count} verts`;
        },
    },
    {
        name: 'three/addons SkeletonUtils',
        why: 'retargeting; the only clone that preserves a skeleton',
        required: false,
        probe: async () => {
            const S = await import('three/addons/utils/SkeletonUtils.js');
            if (typeof S.clone !== 'function') throw new Error('no clone export');
            return 'clone present';
        },
    },
    {
        name: 'three/addons GLTFExporter',
        why: 'serialising imported models instead of rebuilding by type name',
        required: false,
        probe: async () => {
            const E = await import('three/addons/exporters/GLTFExporter.js');
            if (!E.GLTFExporter) throw new Error('no GLTFExporter');
            return 'constructor present';
        },
    },
    {
        name: 'three/addons FBXLoader',
        why: 'Mixamo import; pulls in fflate and NURBS curve deps',
        required: false,
        probe: async () => {
            const L = await import('three/addons/loaders/FBXLoader.js');
            if (!L.FBXLoader) throw new Error('no FBXLoader');
            return 'constructor present';
        },
    },
    {
        name: 'onnxruntime-web@1.18.0',
        why: 'inference runtime under the TTS voices',
        required: false,
        probe: async () => {
            const ort = await import('onnxruntime-web');
            const v = ort.env?.versions?.common ?? ort.version ?? 'unknown';
            return `loaded, version ${v}`;
        },
    },
    {
        name: '@diffusionstudio/vits-web@1.0.3',
        why: 'in-browser Piper/VITS speech synthesis',
        required: false,
        probe: async () => {
            const m = await import('https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web@1.0.3/dist/vits-web.js');
            // Deliberately not calling `predict`: that downloads a voice
            // model of tens of megabytes. The API surface is what matters
            // here; the render tests exercise synthesis for real.
            const api = ['predict', 'voices', 'stored', 'download']
                .filter((k) => typeof m[k] === 'function');
            if (!api.length) throw new Error(`no usable exports: ${Object.keys(m)}`);
            return `exports ${api.join(', ')}`;
        },
    },
    {
        name: 'cannon.js@0.6.2',
        why: 'rigid-body physics in the legacy editor',
        required: false,
        probe: async () => {
            await new Promise((res, rej) => {
                const s = document.createElement('script');
                s.src = 'https://cdnjs.cloudflare.com/ajax/libs/cannon.js/0.6.2/cannon.min.js';
                s.onload = res; s.onerror = () => rej(new Error('script failed to load'));
                document.head.appendChild(s);
            });
            if (!window.CANNON) throw new Error('loaded but no CANNON global');
            new window.CANNON.World();
            return 'World constructed';
        },
    },
];

const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-webgpu', '--use-angle=metal', '--enable-gpu'],
});
const page = await browser.newPage();

// Navigate to the served page, so the document carries both the secure
// localhost origin and the same import map the app uses.
await page.goto(`${ORIGIN}/__audit`, { waitUntil: 'domcontentloaded' });

const rows = [];
for (const check of CHECKS) {
    let status = 'ok', detail = '';
    try {
        detail = await page.evaluate(
            async (src, origin) => {
                // eslint-disable-next-line no-new-func
                const fn = new Function('origin', `return (${src})(origin)`);
                return await fn(origin);
            },
            check.probe.toString(), ORIGIN,
        );
    } catch (err) {
        const msg = String(err.message || err);
        const offline = /ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|Failed to fetch|ERR_CONNECTION/.test(msg);
        status = offline ? 'unreachable' : (check.required ? 'FAIL' : 'degraded');
        detail = msg.slice(0, 110).replace(/\s+/g, ' ');
    }
    rows.push({ ...check, status, detail });
}

await browser.close();
server.close();

const pad = (s, n) => String(s).padEnd(n);
console.log(pad('dependency', 38), pad('status', 13), 'detail');
console.log('-'.repeat(100));
for (const r of rows) {
    console.log(pad(r.name, 38), pad(r.status, 13), r.detail);
}
console.log('-'.repeat(100));
for (const r of rows) console.log(`  ${pad(r.name, 38)} ${r.why}`);

const failed = rows.filter((r) => r.status === 'FAIL');
const unreachable = rows.filter((r) => r.status === 'unreachable');
console.log('');
console.log(`${rows.length} checked · ${rows.filter((r) => r.status === 'ok').length} ok · `
    + `${failed.length} failed · ${unreachable.length} unreachable · `
    + `${rows.filter((r) => r.status === 'degraded').length} degraded`);
if (unreachable.length) {
    console.log('unreachable means no network from this machine, not a broken dependency.');
}
if (failed.length) {
    console.log('\nREQUIRED dependencies failed:');
    for (const f of failed) console.log(`  ${f.name}: ${f.detail}`);
    process.exit(1);
}
