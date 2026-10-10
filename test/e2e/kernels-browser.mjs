/**
 * Browser end-to-end check for the kernel layer and its worker pool.
 *
 *   npm run test:kernels:browser
 *
 * Node can create shared memory without any ceremony, so every test in
 * `test/core/` passes there whether or not the browser story works. This
 * file exists because the browser imposes two conditions Node does not,
 * and both are easy to get wrong in a way that only shows up in a browser:
 *
 *  1. `SharedArrayBuffer` requires the document to be **cross-origin
 *     isolated**, which requires COOP and COEP response headers.
 *  2. `Cross-Origin-Embedder-Policy` can **block the CDN dependencies**.
 *     Under `require-corp` every cross-origin subresource must opt in, and
 *     three.js, onnxruntime-web, vits-web and cannon.js are all
 *     cross-origin here. Turning isolation on carelessly trades a worker
 *     pool for a broken 3D path and silent voices.
 *
 * So this runs the real dev server, in both COEP modes, and checks the
 * pool *and* the dependencies in each.
 */
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const CHROME = process.env.CHROME
    || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 8777;

let failures = 0;
const check = (name, ok, detail = '') => {
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
    if (!ok) failures++;
};

/** Start `scripts/serve.mjs` with a given COEP value and wait for it. */
async function serve(coep) {
    const proc = spawn(process.execPath, ['scripts/serve.mjs'], {
        env: { ...process.env, PORT: String(PORT), COEP: coep },
        stdio: ['ignore', 'pipe', 'inherit'],
    });
    await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('server did not start')), 10_000);
        proc.stdout.on('data', (d) => {
            if (String(d).includes('dev server')) { clearTimeout(timer); resolve(); }
        });
        proc.once('exit', (c) => { clearTimeout(timer); reject(new Error(`server exited ${c}`)); });
    });
    return proc;
}

const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--enable-unsafe-webgpu', '--use-angle=metal', '--enable-gpu'],
});

for (const coep of ['credentialless', 'require-corp']) {
    console.log(`\n=== COEP: ${coep} ===`);
    const server = await serve(coep);
    const page = await browser.newPage();
    const consoleErrors = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

    try {
        await page.goto(`http://localhost:${PORT}/index.html`, { waitUntil: 'domcontentloaded' });

        const isolation = await page.evaluate(() => ({
            isolated: window.crossOriginIsolated,
            sab: typeof SharedArrayBuffer !== 'undefined',
            secure: window.isSecureContext,
        }));
        check('document is cross-origin isolated', isolation.isolated === true);
        check('SharedArrayBuffer is available', isolation.sab === true);

        // The pool, for real, in the browser: spawn workers over shared
        // wasm memory and require the result to match the serial kernel
        // exactly. Bit-identity is the right bar -- it is the same kernel
        // with row ranges, so any difference is a band or barrier defect.
        const pool = await page.evaluate(async (port) => {
            const base = `http://localhost:${port}/src/kernels`;
            const { loadKernels } = await import(`${base}/index.js`);
            const { loadParallelKernels, parallelAvailable } = await import(`${base}/parallel.js`);
            if (!parallelAvailable()) return { available: false };
            const P = await loadParallelKernels({ minPixels: 0 });
            if (!P) return { available: false, created: false };

            const w = 160, h = 120, n = w * h * 4;
            const field = new Float32Array(n);
            let s = 7;
            for (let i = 0; i < n; i++) {
                s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
                field[i] = s / 4294967296;
            }

            const S = await loadKernels({ prefer: 'wasm' });
            const sb = S.from(field), stmp = S.f32(n);
            S.blurRgba(sb, stmp, w, h, 5);
            const expected = Float32Array.from(sb.array);

            const pb = P.from(field), ptmp = P.f32(n);
            await P.blurRgba(pb, ptmp, w, h, 5);
            const got = Float32Array.from(pb.array);

            let diverged = -1;
            for (let i = 0; i < n; i++) if (expected[i] !== got[i]) { diverged = i; break; }

            const out = {
                available: true, created: true, workers: P.workerCount,
                backend: P.backend, simd: P.simd, shared: P.memory.buffer instanceof SharedArrayBuffer,
                diverged,
            };
            await P.dispose();
            return out;
        }, PORT);

        check('worker pool was created', pool.created === true,
            pool.created ? `${pool.workers} workers` : 'not created');
        if (pool.created) {
            check('pool memory is a SharedArrayBuffer', pool.shared === true);
            check('pool wasm has simd128', pool.simd === true);
            check('parallel blur is bit-identical to serial in the browser',
                pool.diverged === -1,
                pool.diverged === -1 ? '' : `first divergence at index ${pool.diverged}`);
        }

        // The dependency question. Under `require-corp` these are the
        // loads that get blocked, and a blocked three.js means no 3D.
        const deps = await page.evaluate(async () => {
            const out = {};
            const probe = async (name, fn) => {
                try { out[name] = await fn(); } catch (e) { out[name] = `FAIL: ${String(e.message || e)}`; }
            };
            await probe('three', async () => {
                const T = await import('https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.js');
                new T.Scene();
                return `r${T.REVISION}`;
            });
            await probe('onnxruntime-web', async () => {
                await import('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/+esm');
                return 'loaded';
            });
            await probe('vits-web', async () => {
                const m = await import('https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web@1.0.3/dist/vits-web.js');
                return typeof m.predict === 'function' ? 'loaded' : 'no predict';
            });
            await probe('cannon.js', async () => {
                await new Promise((res, rej) => {
                    const s = document.createElement('script');
                    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/cannon.js/0.6.2/cannon.min.js';
                    s.onload = res; s.onerror = () => rej(new Error('blocked'));
                    document.head.appendChild(s);
                });
                return window.CANNON ? 'loaded' : 'no global';
            });
            return out;
        });

        for (const [name, result] of Object.entries(deps)) {
            const ok = !String(result).startsWith('FAIL');
            // Under require-corp a CDN block is the expected, documented
            // outcome rather than a defect -- it is exactly why the server
            // defaults to credentialless. Report it, do not fail on it.
            if (coep === 'require-corp' && !ok) {
                console.log(`  note ${name} blocked under require-corp — ${result}`);
            } else {
                check(`CDN dependency ${name}`, ok, String(result));
            }
        }
    } finally {
        await page.close();
        server.kill();
        await once(server, 'exit').catch(() => {});
    }
}

await browser.close();

console.log('');
if (failures) {
    console.log(`${failures} check(s) failed`);
    process.exit(1);
}
console.log('all checks passed');
