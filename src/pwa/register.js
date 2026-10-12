/**
 * Register the service worker, and reload once if that is what makes the
 * document cross-origin isolated.
 *
 * ```js
 * const { isolated, reloading } = await registerServiceWorker('./sw.js');
 * ```
 *
 * # Why a reload is involved at all
 *
 * `sw.js` attaches the `Cross-Origin-Opener-Policy` and
 * `Cross-Origin-Embedder-Policy` headers that a static host will not send,
 * because those two headers are the difference between having a
 * `SharedArrayBuffer` -- and therefore the kernel worker pool, 2.8x on a
 * photo warp -- and not. But a worker only shapes responses it serves, and
 * on a first visit the document that registered it was fetched *before* it
 * existed. That document is already un-isolated and no header can be added
 * to it retroactively.
 *
 * So the first load registers, the worker claims the page, and one reload
 * fetches the document through the worker, this time with the headers. From
 * then on every load is isolated with no reload at all.
 *
 * # The loop guard, which is the part worth being careful about
 *
 * If isolation is impossible -- Safari, which does not implement
 * `credentialless`; a cross-origin frame; a host sending a conflicting
 * policy -- the reload would not fix it, and reloading again on the next
 * load would be an infinite refresh of the user's studio. The `sessionStorage`
 * flag is set *before* the reload, so at most one happens per tab whatever the
 * outcome, and a browser that cannot be isolated simply runs single-threaded.
 *
 * Returning `isolated` lets the caller say which happened rather than leave
 * the pool quietly absent, which is how this cost four months of unexplained
 * slowness in the first place.
 */
const RELOADED = 'jirex.coi-reload';

export async function registerServiceWorker(url = './sw.js') {
    const already = typeof crossOriginIsolated !== 'undefined' && crossOriginIsolated;
    if (!('serviceWorker' in navigator)) {
        return { registered: false, isolated: already, reloading: false };
    }

    await navigator.serviceWorker.register(url);

    if (already) return { registered: true, isolated: true, reloading: false };

    let tried = true;
    try {
        tried = sessionStorage.getItem(RELOADED) === '1';
        if (!tried) sessionStorage.setItem(RELOADED, '1');
    } catch { /* no storage: do not reload, since the guard cannot be kept */ }
    if (tried) return { registered: true, isolated: false, reloading: false };

    // `ready` resolves once a worker is active for this scope; `activate`
    // already calls `clients.claim()`, so the reload is served by it.
    await navigator.serviceWorker.ready;
    location.reload();
    return { registered: true, isolated: false, reloading: true };
}
