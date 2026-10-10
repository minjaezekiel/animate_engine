/**
 * Static dev server that sends the cross-origin isolation headers.
 *
 *   npm run serve            # http://localhost:8080
 *   PORT=3000 npm run serve
 *
 * # Why this replaced `python3 -m http.server`
 *
 * `SharedArrayBuffer` is unavailable in a browser document that is not
 * **cross-origin isolated**, and without it there is no shared wasm memory
 * and so no worker pool. Isolation requires two response headers on the
 * document, and no plain static server sends them.
 *
 * The measured stake: a 1080p mesh warp is 91 ms single-threaded and
 * 18 ms across the pool, and the frame budget at 24fps is 41.67 ms. These
 * two headers are the difference between that kernel fitting a frame and
 * not. See `docs/15-PERFORMANCE.md`.
 *
 * # The COEP choice, measured
 *
 * `Cross-Origin-Opener-Policy: same-origin` is uncontroversial.
 * `Cross-Origin-Embedder-Policy` has two usable values, and the
 * interesting part is that **both were measured working** -- see
 * `test/e2e/kernels-browser.mjs`, which runs the whole check in each mode.
 *
 * * **`require-corp`** demands every cross-origin subresource opt in with
 *   `Cross-Origin-Resource-Policy` or CORS. The expectation was that this
 *   would block the CDN dependencies and trade a worker pool for broken 3D
 *   and silent voices. It does not: jsDelivr and cdnjs both send
 *   `cross-origin-resource-policy: cross-origin`, so three.js,
 *   onnxruntime-web, vits-web and cannon.js all load. Verified by header
 *   inspection and by loading each one in an isolated document.
 *
 * * **`credentialless`** lets a cross-origin no-cors subresource load with
 *   no opt-in at all, by sending the request without credentials. None of
 *   the CDN requests here carry cookies, so nothing is lost.
 *
 * The default is `credentialless`, for one reason: an animation tool
 * handles arbitrary user-supplied assets, and an image or audio file on
 * some origin that has never heard of CORP would be blocked under
 * `require-corp`. The known dependencies are fine either way; the unknown
 * future ones are not.
 *
 * The cost of that default is Safari, which does not implement
 * `credentialless` and will therefore leave the document un-isolated --
 * `loadParallelKernels` returns `null` and the engine runs
 * single-threaded. `require-corp` is widely supported and would isolate
 * there. So **`COEP=require-corp npm run serve` is the right choice for a
 * deploy that needs Safari and controls its own assets**, and it is tested.
 *
 * Either way the degradation is correct: slower, never broken.
 *
 * # Dependencies
 *
 * None. `node:http` and `node:fs` only, in keeping with the rule that
 * nothing in the browser path may need an install.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 8080);
const COEP = process.env.COEP || 'credentialless';

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.wasm': 'application/wasm',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.webp': 'image/webp',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.webmanifest': 'application/manifest+json',
    '.onnx': 'application/octet-stream',
};

const server = createServer(async (req, res) => {
    const raw = decodeURIComponent((req.url || '/').split('?')[0]);
    // `normalize` collapses `..` before the prefix check, so a request for
    // `/../../etc/passwd` cannot escape the root.
    const path = normalize(raw === '/' ? '/index.html' : raw);
    const file = join(ROOT, path);

    const headers = {
        // The two headers this server exists for.
        'Cross-Origin-Opener-Policy': 'same-origin',
        'Cross-Origin-Embedder-Policy': COEP,
        // Same-origin workers and wasm are fetched by the page itself, so
        // they need a CORP header under require-corp.
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Cache-Control': 'no-store',
    };

    try {
        if (!file.startsWith(ROOT)) throw Object.assign(new Error('outside root'), { code: 'EACCES' });
        const info = await stat(file);
        if (info.isDirectory()) throw Object.assign(new Error('is a directory'), { code: 'ENOENT' });
        const body = await readFile(file);
        res.writeHead(200, {
            ...headers,
            'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
            'Content-Length': body.length,
        });
        res.end(req.method === 'HEAD' ? undefined : body);
    } catch (err) {
        const code = err.code === 'EACCES' ? 403 : 404;
        res.writeHead(code, { ...headers, 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`${code}\n`);
    }
});

server.listen(PORT, () => {
    console.log(`jireX dev server  http://localhost:${PORT}`);
    console.log(`  Cross-Origin-Opener-Policy:   same-origin`);
    console.log(`  Cross-Origin-Embedder-Policy: ${COEP}`);
    console.log('');
    console.log('  crossOriginIsolated -> SharedArrayBuffer -> the kernel worker pool.');
    if (COEP === 'require-corp') {
        console.log('  require-corp: every cross-origin subresource must send CORP or use CORS.');
        console.log('  The current CDN dependencies all do (measured). Arbitrary user-supplied');
        console.log('  assets from other origins may not -- that is why the default is');
        console.log('  credentialless. This mode gains Safari, which lacks credentialless.');
    } else {
        console.log('  credentialless: cross-origin no-cors subresources load without CORP.');
        console.log('  Safari does not implement it, so Safari will not be isolated and the');
        console.log('  kernel pool will be unavailable there -- use COEP=require-corp for it.');
    }
    console.log('');
    console.log(`  studio      http://localhost:${PORT}/film.html`);
    console.log(`  3D render   http://localhost:${PORT}/film3d.html`);
    console.log(`  legacy      http://localhost:${PORT}/index.html`);
});
