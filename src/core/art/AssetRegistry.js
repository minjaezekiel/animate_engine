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

/**
 * Load every AUDIO asset a film declares.
 *
 * `scene.audio` cues and `assets: { kind: "audio" }` have been in the schema
 * since the first phase, `validate.js` checks that a cue names a declared
 * asset, and `createCue` turns one into sample offsets -- but nothing ever
 * fetched the file. `loadAssets` filters to `kind === 'image'`, and `prepare`
 * only ever saw the buffers a caller passed in by hand. A film could declare
 * a music bed, validate clean, and render silent.
 *
 * Audio is fetched rather than routed through the art providers: those return
 * something `drawImage` accepts, which is the wrong contract entirely.
 * Decoding is injected so core stays free of Web Audio.
 */
export async function loadAudioAssets(film, { baseUrl = '', decode, fetchImpl, onProgress } = {}) {
    const buffers = {};
    const diagnostics = [];
    const declared = Object.entries(film?.assets ?? {})
        .filter(([, a]) => a && a.kind === 'audio' && a.src);
    if (!declared.length || !decode) return { buffers, diagnostics };

    const get = fetchImpl ?? globalThis.fetch;
    let done = 0;
    for (const [id, asset] of declared) {
        const url = /^(https?:|data:|blob:)/.test(asset.src) ? asset.src : `${baseUrl}${asset.src}`;
        try {
            const res = await get(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            buffers[id] = await decode(await res.arrayBuffer());
        } catch (error) {
            // Never fatal, for the same reason a missing picture is not: a
            // film that renders without its music beats one that does not
            // render.
            diagnostics.push({
                severity: 'warning', path: `assets.${id}`,
                message: `Audio asset "${id}" failed to load from "${url}": ${error.message}.`
                    + ' It will be silent.',
            });
        }
        onProgress?.({ stage: 'audio', done: ++done, total: declared.length, id });
    }
    return { buffers, diagnostics };
}
