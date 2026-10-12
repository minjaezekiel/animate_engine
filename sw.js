/**
 * Service worker: makes the studio installable and genuinely usable offline.
 *
 * Two caches with different policies, because the two kinds of resource fail
 * differently:
 *   - the app shell is cache-first and versioned, so a release swaps
 *     atomically and a cold start never waits on the network.
 *   - pinned third-party modules (the TTS runtime, a muxer) are
 *     stale-while-revalidate in a separate cache that survives shell
 *     upgrades, since re-downloading a voice model is expensive.
 *
 * Voice ONNX models are NOT cached here: the TTS runtime stores them in OPFS
 * itself, which is the right place for tens of megabytes.
 */
const VERSION = 'v2';
const SHELL = `jirex-shell-${VERSION}`;
const VENDOR = 'jirex-vendor';

// This file has to live at the repository root. A service worker's default
// scope is its own directory and a static host sends no Service-Worker-Allowed
// header, so a worker under src/pwa/ registers without error and then controls
// nothing -- which is how the offline story was quietly broken.
const SHELL_ASSETS = [
    './',
    './film.html',
    './studio.html',
    './src/studio.js',
    './src/pwa/register.js',
    './src/core/index.js',
    './src/pwa/manifest.webmanifest',
    './src/pwa/icons/icon-192.png',
    './src/pwa/icons/icon-512.png',
    './demo/film.json',
    './demo/script.txt',
];

const VENDOR_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com', 'huggingface.co'];

/**
 * Cross-origin isolation, from the worker, for hosts that will not send it.
 *
 * `SharedArrayBuffer` exists only in a cross-origin-isolated document, and
 * isolation comes from two response headers on the document. `scripts/serve.mjs`
 * sends them, but a static host -- GitHub Pages, an S3 bucket, a CDN, anything
 * the person deploying this does not configure -- does not, and there is no way
 * to ask it to. The whole kernel worker pool was therefore unavailable on every
 * real deployment: not broken, just silently four times slower, which is worse
 * because nobody investigates a thing that works.
 *
 * A service worker synthesises its own responses, so it can attach the headers
 * the server omitted. This is the only mechanism a static host leaves open, and
 * it is exactly why `sw.js` is worth having beyond offline support.
 *
 * Two kinds of response need them, and the second is easy to miss. The
 * document, obviously: isolation is a property of the document. But also every
 * **worker script**, because a dedicated worker created from an isolated
 * document must assert the same embedder policy, and a script response without
 * the header is rejected with `ERR_BLOCKED_BY_RESPONSE`. The dev server happens
 * to satisfy this by sending the headers on everything it serves; a worker that
 * rewrote only navigations isolated the document and then could not start a
 * single worker -- so the pool was still absent, now for a second reason.
 * Measured: `src/kernels/wasm/worker.js` blocked, five workers, nothing said.
 *
 * Ordinary subresources are left alone, since COEP does not affect same-origin
 * ones and rewriting them all would read every response body for nothing.
 *
 * `credentialless` matches the dev server's default and for the same reason: an
 * animation tool loads arbitrary user-supplied images and audio, and under
 * `require-corp` an asset from an origin that has never heard of CORP is
 * blocked outright. The cost is Safari, which does not implement
 * `credentialless` and so stays un-isolated and single-threaded -- correct
 * degradation, and the only honest option when the alternative breaks assets.
 *
 * If the server already sent these headers, setting them again changes nothing.
 */
const ISOLATION = {
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Embedder-Policy': 'credentialless',
};

/** The same response, with the isolation headers attached. */
function isolated(response) {
    // An opaque (`type: 'opaque'`) response has an unreadable body and
    // immutable headers, so it is passed through untouched -- a cross-origin
    // no-cors navigation is not a document we isolate anyway.
    if (!response || response.type === 'opaque' || response.type === 'opaqueredirect') {
        return response;
    }
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(ISOLATION)) headers.set(name, value);
    return new Response(response.body, {
        status: response.status, statusText: response.statusText, headers,
    });
}

// Third-party modules are cached on FIRST USE, by the stale-while-revalidate
// path below, and not warmed on install.
//
// They used to be warmed, and it was a bad trade once the worker started
// actually running: install blocked on a multi-megabyte `onnxruntime-web`
// download, which held the page's network busy on every first load. It also
// never bought what it claimed -- speaking offline needs a 20-60 MB voice
// model too, and those live in OPFS and were never warmed. Use
// `studio.tts.prefetch(voiceId)` to prepare for offline deliberately.

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(SHELL);
        // addAll fails the whole install if one asset 404s, which would make
        // the app permanently uninstallable; add individually instead.
        await Promise.all(SHELL_ASSETS.map(async (url) => {
            try { await cache.add(new Request(url, { cache: 'reload' })); }
            catch { /* optional asset */ }
        }));
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys
            .filter((k) => k.startsWith('jirex-shell-') && k !== SHELL)
            .map((k) => caches.delete(k)));
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    if (request.method !== 'GET') return;
    const url = new URL(request.url);

    if (VENDOR_HOSTS.some((h) => url.hostname.endsWith(h))) {
        event.respondWith(staleWhileRevalidate(request, VENDOR));
        return;
    }
    if (url.origin !== location.origin) return;

    // Same-origin: serve from cache, fall back to network, and keep whatever
    // the network gives us for next time (ES modules are fetched lazily, so
    // the shell list cannot name them all up front).
    //
    // A navigation is additionally re-served with the isolation headers (see
    // `ISOLATION`), which is what gives the kernel worker pool a
    // SharedArrayBuffer on a host that sends no headers of its own. The
    // rewrite happens on the way out, so the cached copy stays verbatim and a
    // later change of policy does not need the cache cleared.
    // See `ISOLATION`: the document, and every worker script started from it.
    const needsIsolation = request.mode === 'navigate'
        || request.destination === 'worker' || request.destination === 'sharedworker';
    event.respondWith((async () => {
        const cached = await caches.match(request);
        if (cached) return needsIsolation ? isolated(cached) : cached;
        try {
            const res = await fetch(request);
            if (res.ok && res.type === 'basic') {
                const cache = await caches.open(SHELL);
                cache.put(request, res.clone());
            }
            return needsIsolation ? isolated(res) : res;
        } catch {
            if (request.mode === 'navigate') {
                const offline = await caches.match('./film.html');
                return offline ? isolated(offline)
                    : new Response('Offline', { status: 503, statusText: 'Offline' });
            }
            throw new Error(`offline and uncached: ${url.pathname}`);
        }
    })());
});

async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    const network = fetch(request)
        .then((res) => { if (res.ok) cache.put(request, res.clone()); return res; })
        .catch(() => null);
    return cached ?? (await network) ?? new Response('Offline', { status: 503 });
}
