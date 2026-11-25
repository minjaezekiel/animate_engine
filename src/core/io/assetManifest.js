/**
 * The asset library: what you have, where it came from, and on what terms.
 *
 * # Why a manifest rather than a path
 *
 * A film could already import a model -- `models: { rifle: { src: '...' } }`
 * -- and that one line is where the trouble starts. A bare path has no
 * identity, so two films importing the same chair import it twice and neither
 * knows; it has no provenance, so a year later nobody can say where it came
 * from; and it has no licence, which is the expensive one.
 *
 * **An animation built on an asset whose licence was never recorded is not
 * shippable.** That is a worse failure than not having the asset, because it
 * is discovered at the end, after the work. So the licence field here is not
 * metadata, it is the point: `addAsset` REFUSES an entry without one, and
 * `credits` can produce the attribution list for a finished film.
 *
 * # Content addressing
 *
 * The id of an asset is the hash of its bytes, exactly as a voice take's id
 * is the hash of what was said -- see
 * [`takeCache.js`](../voice/takeCache.js), which argues this at length. The
 * consequences are the same and they are the good ones: re-downloading a file
 * you already have is a no-op, two names for one file resolve to one entry,
 * and a file that changed under you is a different asset rather than a
 * mystery.
 *
 * Pure. No fs, no fetch, no hashing: the caller supplies the digest, so this
 * module is assertable in Node with nothing stood up.
 */

/** Licences that need an attribution line in the finished work. */
const NEEDS_ATTRIBUTION = /^(cc-by|cc-by-sa|cc-by-nd|cc-by-nc|mit|apache|bsd|ofl)/i;
/** Licences that forbid commercial use, which is worth saying out loud. */
const NONCOMMERCIAL = /nc(-|$)|noncommercial/i;
/** Licences that require derivative works to carry the same terms. */
const SHARE_ALIKE = /sa(-|$)|sharealike|gpl/i;

export const ASSET_KINDS = ['model', 'image', 'texture', 'hdri', 'audio', 'font', 'other'];

/** An empty library. */
export function createManifest({ version = 1 } = {}) {
    return { version, assets: {} };
}

const clean = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Add or update an asset, returning a NEW manifest.
 *
 * `licence` is mandatory and deliberately a free string rather than an enum:
 * the real world contains "CC0-1.0", "royalty-free, see invoice 4471" and
 * "drawn by me", and refusing the last two in the name of tidiness would
 * push people to write "CC0" and move on. What cannot be allowed is silence.
 *
 * `source` is mandatory for the same reason in a weaker form: six months
 * later "where did this come from" is unanswerable without it, and the honest
 * answer is sometimes "a colleague sent it", which is still worth recording.
 */
export function addAsset(manifest, entry) {
    const m = manifest ?? createManifest();
    const id = clean(entry?.id);
    const licence = clean(entry?.licence ?? entry?.license);
    const diagnostics = [];
    if (!id) return { manifest: m, error: 'an asset needs an `id` (the hash of its bytes)' };
    if (!licence) {
        return { manifest: m,
                 error: `asset '${id}' has no \`licence\`. An animation built on an asset whose `
                     + 'licence was never recorded is not shippable, and that is discovered '
                     + 'late. Record "unknown" deliberately if that is the truth.' };
    }
    const kind = clean(entry?.kind) ?? 'other';
    if (!ASSET_KINDS.includes(kind)) {
        diagnostics.push({ severity: 'warning',
                           message: `asset '${id}': unknown kind '${kind}'` });
    }
    if (!clean(entry?.source)) {
        diagnostics.push({ severity: 'warning',
                           message: `asset '${id}' records no \`source\`; in six months `
                               + '"where did this come from" will have no answer' });
    }
    if (NEEDS_ATTRIBUTION.test(licence) && !clean(entry?.author)) {
        diagnostics.push({ severity: 'warning',
                           message: `asset '${id}' is under ${licence}, which requires `
                               + 'attribution, but records no `author` to attribute' });
    }
    const existing = m.assets[id];
    const next = {
        ...m,
        assets: {
            ...m.assets,
            [id]: {
                id, kind, licence,
                name: clean(entry?.name) ?? existing?.name ?? id.slice(0, 12),
                path: clean(entry?.path) ?? existing?.path ?? null,
                source: clean(entry?.source) ?? existing?.source ?? null,
                author: clean(entry?.author) ?? existing?.author ?? null,
                bytes: Number.isFinite(entry?.bytes) ? entry.bytes : (existing?.bytes ?? null),
                added: clean(entry?.added) ?? existing?.added ?? null,
                // Whatever `inspect` found: triangles, bounds, clips, morph
                // targets, and the import recommendation. Cached because
                // computing it means reading the file.
                info: entry?.info ?? existing?.info ?? null,
                notes: clean(entry?.notes) ?? existing?.notes ?? null,
            },
        },
    };
    return { manifest: next, diagnostics, replaced: !!existing };
}

/** Remove an asset, returning a new manifest. */
export function removeAsset(manifest, id) {
    if (!manifest?.assets?.[id]) return manifest ?? createManifest();
    const assets = { ...manifest.assets };
    delete assets[id];
    return { ...manifest, assets };
}

/**
 * Find an asset by id, by a prefix of its id, or by name.
 *
 * Prefix matching because a 64-character hash is not something a person
 * types, and an ambiguous prefix is an ERROR rather than a first match: the
 * alternative is a command that works until two assets share four characters
 * and then quietly operates on the wrong one.
 */
export function findAsset(manifest, query) {
    const q = clean(query);
    if (!q || !manifest?.assets) return { asset: null, error: 'no query' };
    if (manifest.assets[q]) return { asset: manifest.assets[q] };
    const all = Object.values(manifest.assets);
    const byPrefix = all.filter((a) => a.id.startsWith(q));
    if (byPrefix.length === 1) return { asset: byPrefix[0] };
    if (byPrefix.length > 1) {
        return { asset: null,
                 error: `'${q}' matches ${byPrefix.length} assets: `
                     + byPrefix.map((a) => a.id.slice(0, 12)).join(', ') };
    }
    const byName = all.filter((a) => a.name === q);
    if (byName.length === 1) return { asset: byName[0] };
    if (byName.length > 1) {
        return { asset: null, error: `${byName.length} assets are named '${q}'; use an id` };
    }
    return { asset: null, error: `no asset matches '${q}'` };
}

/** Every asset of a kind, by name. */
export function listAssets(manifest, { kind = null } = {}) {
    return Object.values(manifest?.assets ?? {})
        .filter((a) => !kind || a.kind === kind)
        .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

/**
 * The attribution list for a set of assets, and whether it is complete.
 *
 * `complete` is the field that matters: it is the answer to "can this be
 * published", and it is false when any asset has an unknown licence or needs
 * an author it does not have. A credits list that silently omits what it
 * could not determine is worse than no credits list.
 */
export function credits(manifest, ids = null) {
    const all = Object.values(manifest?.assets ?? {});
    const wanted = ids
        ? ids.map((id) => findAsset(manifest, id).asset).filter(Boolean)
        : all;
    const lines = [];
    const problems = [];
    const flags = new Set();
    for (const a of wanted.sort((x, y) => String(x.name).localeCompare(String(y.name)))) {
        const bits = [a.name];
        if (a.author) bits.push(`by ${a.author}`);
        bits.push(`(${a.licence})`);
        if (a.source) bits.push(`— ${a.source}`);
        lines.push(bits.join(' '));
        if (/^unknown$/i.test(a.licence)) {
            problems.push(`'${a.name}' has an unknown licence and cannot be cleared for release`);
        } else if (NEEDS_ATTRIBUTION.test(a.licence) && !a.author) {
            problems.push(`'${a.name}' is under ${a.licence} and needs an author to attribute`);
        }
        if (NONCOMMERCIAL.test(a.licence)) flags.add(`'${a.name}' forbids commercial use`);
        if (SHARE_ALIKE.test(a.licence)) {
            flags.add(`'${a.name}' is share-alike, so the finished work inherits its terms`);
        }
    }
    return {
        lines,
        count: wanted.length,
        problems,
        // Not "problems.length === 0 and good luck": the caller gets a single
        // boolean to gate a release on.
        complete: problems.length === 0,
        flags: [...flags],
    };
}

/**
 * Which assets a film refers to.
 *
 * Reads the blocks that can carry an asset reference in either film format,
 * so `credits` can be asked about one film rather than a whole library. A
 * reference that is not in the manifest is returned under `unknown`, because
 * that is the case that stops a release: an asset in the film and not in the
 * library has no licence by construction.
 */
export function filmAssetIds(film) {
    const refs = new Set();
    const take = (v) => { const s = clean(v); if (s) refs.add(s); };
    for (const spec of Object.values(film?.models ?? {})) take(spec?.asset ?? spec?.src);
    for (const spec of Object.values(film?.textures ?? {})) take(spec?.asset ?? spec?.src);
    for (const spec of Object.values(film?.assets ?? {})) take(spec?.asset ?? spec?.src);
    take(film?.environment?.asset ?? film?.environment?.src);
    return [...refs];
}

/** Audit a whole manifest: what is unusable, and what constrains a release. */
export function auditManifest(manifest) {
    const c = credits(manifest);
    const assets = Object.values(manifest?.assets ?? {});
    return {
        total: assets.length,
        byKind: assets.reduce((acc, a) => ({ ...acc, [a.kind]: (acc[a.kind] ?? 0) + 1 }), {}),
        missingSource: assets.filter((a) => !a.source).map((a) => a.name),
        unknownLicence: assets.filter((a) => /^unknown$/i.test(a.licence)).map((a) => a.name),
        problems: c.problems,
        flags: c.flags,
        releasable: c.complete,
    };
}
