/**
 * Where a picture comes from.
 *
 * Deliberately the same shape as `core/voice/VoiceRegistry.js`: that system
 * already answered "this media could come from a file, a microphone or a
 * model, and the film should not care which". Art has the identical problem,
 * so it gets the identical seam rather than a second invention.
 *
 *   AssetProvider {
 *       id; label; available() -> bool
 *       load(spec) -> Promise<CanvasImageSource>
 *   }
 *
 * A provider returns something `ctx.drawImage` accepts. ImageBitmap is
 * preferred -- it is transferable, decodes off the main thread, and works
 * under OffscreenCanvas and the WebCodecs sink -- but an HTMLImageElement or
 * a canvas is equally valid, which is what lets a test supply a stub.
 */

export class AssetRegistry {
    constructor() {
        this.providers = new Map();
    }

    register(provider) {
        this.providers.set(provider.id, provider);
        return this;
    }

    all() { return [...this.providers.values()]; }
    byId(id) { return this.providers.get(id) ?? null; }

    /**
     * Pick the provider for an asset.
     *
     * An explicit `provider` wins; otherwise the shape of `src` decides, so
     * a film can just say `"src": "art/room.png"` and mean it.
     */
    resolve(asset) {
        if (asset.provider) return this.byId(asset.provider);
        for (const provider of this.providers.values()) {
            if (provider.accepts?.(asset)) return provider;
        }
        return null;
    }
}

/**
 * Load every image asset a film declares.
 *
 * Returns the map `compileFilm` wants plus diagnostics in the standard shape.
 * A failed asset is never fatal: the compiler already falls back to a colour
 * for a missing background, and a film that renders with one picture missing
 * beats a film that does not render.
 */
export async function loadAssets(film, { registry, baseUrl = '', onProgress = null } = {}) {
    const assets = {};
    const diagnostics = [];
    const declared = Object.entries(film?.assets ?? {})
        .filter(([, a]) => a && a.kind === 'image');

    let done = 0;
    for (const [id, asset] of declared) {
        const provider = registry?.resolve(asset);
        if (!provider) {
            diagnostics.push({
                severity: 'warning', path: `assets.${id}`,
                message: `No art provider can load image asset "${id}"`
                    + `${asset.src ? ` (src "${asset.src}")` : ''}.`,
            });
            continue;
        }
        try {
            assets[id] = await provider.load({ ...asset, id, baseUrl });
        } catch (error) {
            diagnostics.push({
                severity: 'warning', path: `assets.${id}`,
                message: `Image asset "${id}" failed to load: ${error.message}`,
            });
        }
        onProgress?.({ stage: 'assets', done: ++done, total: declared.length, id });
    }
    return { assets, diagnostics };
}
