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

// This file has to live at the repository root. A service worker's default
// scope is its own directory and a static host sends no Service-Worker-Allowed
// header, so a worker under src/pwa/ registers without error and then controls
// nothing -- which is how the offline story was quietly broken.
const SHELL_ASSETS = [
    './',
    './film.html',
    './studio.html',
    './src/studio.js',
    './src/core/index.js',
    './src/pwa/manifest.webmanifest',
    './src/pwa/icons/icon-192.png',
    './src/pwa/icons/icon-512.png',
    './demo/film.json',
    './demo/script.txt',
];

const VENDOR_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com', 'huggingface.co'];

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
