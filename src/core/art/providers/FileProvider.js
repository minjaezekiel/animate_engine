/**
 * Images a person picked in the browser.
 *
 * The film carries the File/Blob directly on the asset (`asset.file`), which
 * is how an upload reaches the renderer without a round trip through a URL --
 * and, unlike a URL, it is never intercepted by the service worker's
 * cache-first rule, so re-picking an edited file actually shows the edit.
 */
export class FileProvider {
    constructor({ createBitmap = null } = {}) {
        this.id = 'file';
        this.label = 'Uploaded image';
        this._createBitmap = createBitmap;
    }

    available() {
        return typeof (this._createBitmap ?? globalThis.createImageBitmap) === 'function';
    }

    accepts(asset) { return !!asset.file; }

    async load({ file }) {
        if (!file) throw new Error('no file');
        const createBitmap = this._createBitmap ?? globalThis.createImageBitmap;
        if (!createBitmap) throw new Error('createImageBitmap is unavailable here');
        return createBitmap(file);
    }
}
