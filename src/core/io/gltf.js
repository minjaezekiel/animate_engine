/**
 * Read a glTF container's table of contents, without a renderer.
 *
 * Why this exists: to write a film around a downloaded model, a caller has to
 * know what is IN it -- which nodes it can address, which animations it can
 * play, whether it is skinned, how big it is. In a browser that means loading
 * it with `GLTFLoader` and walking the result; in Node it would mean
 * standing up three.js, a DOM shim and a fetch polyfill to read a list of
 * names.
 *
 * ponytail: parse the container, not the model. A `.gltf` is JSON and a
 * `.glb` is a 12-byte header and two chunks, one of which is that same JSON.
 * Names, animations, skins and the node tree are all in it. No dependency,
 * no GPU, and it runs in Node on a file an agent just downloaded.
 *
 * The ceiling is exactly where you would expect: this reads the manifest, not
 * the geometry. It will not tell you a mesh's triangle count, decode a Draco
 * buffer, or evaluate a node's world transform through its parents.
 */

const MAGIC = 0x46546c67;        // 'glTF', little-endian
const CHUNK_JSON = 0x4e4f534a;   // 'JSON'
const CHUNK_BIN = 0x004e4942;    // 'BIN\0'

/** Pull the JSON manifest out of a .glb, or null if it is not one. */
export function glbJSON(bytes) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (u8.byteLength < 20) return null;
    const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    if (view.getUint32(0, true) !== MAGIC) return null;
    const total = view.getUint32(8, true);
    let offset = 12;
    let json = null, binBytes = 0;
    while (offset + 8 <= Math.min(total, u8.byteLength)) {
        const length = view.getUint32(offset, true);
        const type = view.getUint32(offset + 4, true);
        const start = offset + 8;
        if (type === CHUNK_JSON) {
            json = JSON.parse(new TextDecoder().decode(u8.subarray(start, start + length)));
        } else if (type === CHUNK_BIN) {
            binBytes = length;
        }
        // Chunks are four-byte aligned; walking by `length` alone desyncs on
        // the first chunk whose payload is not a multiple of four, and every
        // chunk after it reads as garbage.
        offset = start + length + ((4 - (length % 4)) % 4);
    }
    return json ? { json, binBytes, version: view.getUint32(4, true) } : null;
}

const named = (list, kind) => (list ?? []).map((item, i) => item?.name || `${kind}_${i}`);

/**
 * What a film can address inside this model.
 *
 * Node names matter more than anything else here, because that is how a
 * timeline reaches into an imported model: the adapter registers every named
 * descendant as `<cast id>/<node name>`, so a film writes `city/streetlamp`
 * exactly as it writes any other node. A model whose nodes are all called
 * `Object_12` can be imported and cannot be animated part by part, and
 * saying so up front is the point of this function.
 */
export function inspectGLTF(source) {
    const bytes = typeof source === 'string' ? null : source;
    let json = null, binBytes = 0, format = 'gltf', byteLength = 0;

    if (typeof source === 'string') {
        json = JSON.parse(source);
        byteLength = source.length;
    } else {
        const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
        byteLength = u8.byteLength;
        const glb = glbJSON(u8);
        if (glb) { json = glb.json; binBytes = glb.binBytes; format = 'glb'; }
        else { json = JSON.parse(new TextDecoder().decode(u8)); }
    }
    if (!json || typeof json !== 'object') throw new Error('not a glTF document');

    const nodes = json.nodes ?? [];
    const children = new Set(nodes.flatMap((n) => n.children ?? []));
    const roots = nodes.map((_, i) => i).filter((i) => !children.has(i));

    return {
        format,
        version: json.asset?.version ?? '?',
        generator: json.asset?.generator ?? null,
        bytes: byteLength,
        binBytes,
        scenes: (json.scenes ?? []).length,
        // Every name a film could use as `<cast>/<name>`.
        nodes: named(nodes, 'node'),
        roots: roots.map((i) => nodes[i]?.name || `node_${i}`),
        meshes: named(json.meshes, 'mesh'),
        materials: named(json.materials, 'material'),
        animations: named(json.animations, 'animation'),
        skins: (json.skins ?? []).length,
        cameras: (json.cameras ?? []).length,
        images: (json.images ?? []).length,
        extensions: json.extensionsUsed ?? [],
        /**
         * Extensions that need a loader the engine does not ship.
         *
         * A Draco-compressed model loads as an empty scene with no error from
         * `GLTFLoader` unless the decoder is registered, which is the single
         * most common "my model is invisible" report there is.
         */
        needsDecoder: (json.extensionsRequired ?? []).filter((e) => /draco|meshopt|ktx|basisu/i.test(e)),
        skinned: (json.skins ?? []).length > 0,
    };
}

/** Does this look like a glTF container at all? */
export function isGLTF(bytes) {
    if (typeof bytes === 'string') {
        try { return !!JSON.parse(bytes).asset; } catch { return false; }
    }
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (u8.byteLength >= 4
        && new DataView(u8.buffer, u8.byteOffset, 4).getUint32(0, true) === MAGIC) return true;
    try { return !!JSON.parse(new TextDecoder().decode(u8.subarray(0, 4096)) + '}'); } catch { /* */ }
    try { return !!JSON.parse(new TextDecoder().decode(u8)).asset; } catch { return false; }
}
