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
const VERSION = 'v1';
const SHELL = `jirex-shell-${VERSION}`;
const VENDOR = 'jirex-vendor';

const SHELL_ASSETS = [
    './',
    './film.html',
    './src/studio.js',
    './src/pwa/manifest.webmanifest',
    './demo/film.json',
    './demo/script.txt',
];

const VENDOR_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com', 'huggingface.co'];

// Pinned third-party modules, warmed on install so a later offline session can
// still synthesize speech. Voice ONNX models are excluded on purpose: the TTS
// runtime keeps those in OPFS, which is the right home for tens of megabytes.
const VENDOR_WARM = [
    'https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web@1.0.3/dist/vits-web.js',
    'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/+esm',
];

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(SHELL);
        // addAll fails the whole install if one asset 404s, which would make
        // the app permanently uninstallable; add individually instead.
        await Promise.all(SHELL_ASSETS.map(async (url) => {
            try { await cache.add(new Request(url, { cache: 'reload' })); }
            catch { /* optional asset */ }
        }));
        const vendor = await caches.open(VENDOR);
        await Promise.all(VENDOR_WARM.map(async (url) => {
            try { await vendor.add(new Request(url, { mode: 'cors' })); }
            catch { /* warmed later on first use */ }
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
    event.respondWith((async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
            const res = await fetch(request);
            if (res.ok && res.type === 'basic') {
                const cache = await caches.open(SHELL);
                cache.put(request, res.clone());
            }
            return res;
        } catch {
            if (request.mode === 'navigate') {
                return (await caches.match('./film.html'))
                    ?? new Response('Offline', { status: 503, statusText: 'Offline' });
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
