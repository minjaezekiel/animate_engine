/**
 * Images fetched by URL or path, relative to the film.
 *
 * `createImageBitmap` rather than `new Image()`: it decodes off the main
 * thread, which matters because loading happens between compiling and
 * rendering, and it yields a transferable the WebCodecs sink can take.
 */
export class UrlProvider {
    constructor({ fetchImpl = null, createBitmap = null } = {}) {
        this.id = 'url';
        this.label = 'File or URL';
        this._fetch = fetchImpl;
        this._createBitmap = createBitmap;
    }

    available() {
        return typeof (this._fetch ?? globalThis.fetch) === 'function'
            && typeof (this._createBitmap ?? globalThis.createImageBitmap) === 'function';
    }

    accepts(asset) { return typeof asset.src === 'string'; }

    async load({ src, baseUrl = '' }) {
        if (!src) throw new Error('no src');
        const fetchImpl = this._fetch ?? globalThis.fetch;
        const createBitmap = this._createBitmap ?? globalThis.createImageBitmap;
        if (!fetchImpl || !createBitmap) throw new Error('no fetch/createImageBitmap here');

        const base = baseUrl || globalThis.location?.href || 'http://localhost/';
        const url = /^(https?:|data:|blob:)/.test(src) ? src : new URL(src, base).href;
        const res = await fetchImpl(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return createBitmap(await res.blob());
    }
}
