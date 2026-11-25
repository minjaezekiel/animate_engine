/**
 * The asset library, and the licence field that is the point of it.
 *
 * An animation built on an asset whose licence was never recorded is not
 * shippable, and that is discovered at the END, after the work. So the
 * assertions here are mostly about refusing to let that happen quietly.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
    ASSET_KINDS, addAsset, auditManifest, createManifest, credits,
    filmAssetIds, findAsset, listAssets, removeAsset,
} from '../../src/core/io/assetManifest.js';

const HASH = 'a'.repeat(64);
const HASH2 = 'b'.repeat(64);
const ok = (over = {}) => ({ id: HASH, name: 'chair', kind: 'model',
                             licence: 'CC0-1.0', source: 'https://example.test/chair',
                             ...over });

test('an asset without a LICENCE is refused, with the reason', () => {
    const { manifest, error } = addAsset(createManifest(), { id: HASH, name: 'chair' });
    assert.match(error, /no `licence`/);
    assert.match(error, /not shippable/, 'the refusal must say why it matters');
    assert.match(error, /"unknown" deliberately/, 'and offer the escape hatch');
    assert.deepEqual(manifest.assets, {}, 'nothing may be half-added');
});

test('"unknown" is accepted when it is stated deliberately', () => {
    // Refusing it outright would push people to write "CC0" and move on,
    // which is worse than an honest "unknown".
    const { manifest, error } = addAsset(createManifest(), ok({ licence: 'unknown' }));
    assert.equal(error, undefined);
    assert.equal(manifest.assets[HASH].licence, 'unknown');
    // But it must block a release.
    assert.equal(credits(manifest).complete, false);
    assert.match(credits(manifest).problems[0], /cannot be cleared for release/);
});

test('an asset without an id is refused', () => {
    assert.match(addAsset(createManifest(), { licence: 'CC0' }).error, /needs an `id`/);
    assert.match(addAsset(null, {}).error, /needs an `id`/);
});

test('`license` is accepted as well as `licence`', () => {
    // Half the world spells it the other way and failing on that would be
    // pure friction.
    const { manifest, error } = addAsset(createManifest(),
        { id: HASH, name: 'x', license: 'MIT', author: 'A' });
    assert.equal(error, undefined);
    assert.equal(manifest.assets[HASH].licence, 'MIT');
});

test('a missing source is a warning, not a refusal', () => {
    const { manifest, diagnostics } = addAsset(createManifest(), ok({ source: null }));
    assert.ok(manifest.assets[HASH]);
    assert.match(diagnostics.map((d) => d.message).join(), /where did this come from/);
});

test('an attribution licence with no author is warned about', () => {
    const { diagnostics } = addAsset(createManifest(), ok({ licence: 'CC-BY-4.0' }));
    assert.match(diagnostics.map((d) => d.message).join(), /requires attribution/);
    // CC0 does not require it, so it must not warn.
    assert.deepEqual(addAsset(createManifest(), ok()).diagnostics, []);
});

test('an unknown kind is warned about but kept', () => {
    const { manifest, diagnostics } = addAsset(createManifest(), ok({ kind: 'hologram' }));
    assert.equal(manifest.assets[HASH].kind, 'hologram');
    assert.match(diagnostics.map((d) => d.message).join(), /unknown kind/);
    assert.ok(ASSET_KINDS.includes('model'));
});

test('adding the same id twice updates rather than duplicates', () => {
    let m = addAsset(createManifest(), ok()).manifest;
    const second = addAsset(m, ok({ name: 'chair-v2', author: 'Someone' }));
    assert.equal(second.replaced, true);
    assert.equal(Object.keys(second.manifest.assets).length, 1);
    assert.equal(second.manifest.assets[HASH].name, 'chair-v2');
    // Fields not restated are kept rather than wiped.
    assert.equal(second.manifest.assets[HASH].source, 'https://example.test/chair');
});

test('adding never mutates the manifest it was given', () => {
    const m = createManifest();
    addAsset(m, ok());
    assert.deepEqual(m.assets, {});
});

// ---------------------------------------------------------------- lookup

test('an asset is found by id, by id prefix, or by name', () => {
    const m = addAsset(createManifest(), ok()).manifest;
    assert.equal(findAsset(m, HASH).asset.name, 'chair');
    assert.equal(findAsset(m, 'aaaaaa').asset.name, 'chair');
    assert.equal(findAsset(m, 'chair').asset.id, HASH);
    assert.match(findAsset(m, 'nope').error, /no asset matches/);
    assert.match(findAsset(m, null).error, /no query/);
});

test('an AMBIGUOUS prefix is an error, not a first match', () => {
    // The alternative is a command that works until two assets share four
    // characters, and then quietly operates on the wrong one.
    let m = addAsset(createManifest(), ok()).manifest;
    m = addAsset(m, { id: 'a'.repeat(63) + 'c', name: 'stool',
                      licence: 'CC0', source: 's' }).manifest;
    const r = findAsset(m, 'aaaa');
    assert.equal(r.asset, null);
    assert.match(r.error, /matches 2 assets/);
});

test('two assets with the same NAME is an error too', () => {
    let m = addAsset(createManifest(), ok()).manifest;
    m = addAsset(m, ok({ id: HASH2 })).manifest;
    assert.match(findAsset(m, 'chair').error, /2 assets are named/);
});

test('listing is sorted and filterable by kind', () => {
    let m = addAsset(createManifest(), ok({ name: 'zebra' })).manifest;
    m = addAsset(m, ok({ id: HASH2, name: 'apple', kind: 'audio' })).manifest;
    assert.deepEqual(listAssets(m).map((a) => a.name), ['apple', 'zebra']);
    assert.deepEqual(listAssets(m, { kind: 'audio' }).map((a) => a.name), ['apple']);
    assert.deepEqual(listAssets(null), []);
});

test('removing is also non-mutating and tolerates a miss', () => {
    const m = addAsset(createManifest(), ok()).manifest;
    assert.deepEqual(removeAsset(m, HASH).assets, {});
    assert.ok(m.assets[HASH], 'the original must be untouched');
    assert.deepEqual(removeAsset(m, 'nope').assets, m.assets);
});

// --------------------------------------------------------------- credits

test('credits read as credits, and are gated by `complete`', () => {
    let m = addAsset(createManifest(), ok({ name: 'chair', licence: 'CC-BY-4.0',
                                            author: 'A. Maker' })).manifest;
    m = addAsset(m, ok({ id: HASH2, name: 'anvil', licence: 'CC0-1.0',
                         source: 'https://example.test/anvil' })).manifest;
    const c = credits(m);
    assert.equal(c.complete, true);
    assert.equal(c.count, 2);
    assert.equal(c.lines[0], 'anvil (CC0-1.0) — https://example.test/anvil');
    assert.equal(c.lines[1], 'chair by A. Maker (CC-BY-4.0) — https://example.test/chair');
});

test('a credits list never silently omits what it could not determine', () => {
    const m = addAsset(createManifest(), ok({ licence: 'CC-BY-4.0', author: null })).manifest;
    const c = credits(m);
    assert.equal(c.lines.length, 1, 'the asset is still listed');
    assert.equal(c.complete, false, 'and the list is marked incomplete');
    assert.match(c.problems[0], /needs an author/);
});

test('noncommercial and share-alike terms are surfaced as flags', () => {
    let m = addAsset(createManifest(), ok({ licence: 'CC-BY-NC-4.0', author: 'A' })).manifest;
    m = addAsset(m, ok({ id: HASH2, name: 'font', licence: 'CC-BY-SA-4.0',
                         author: 'B' })).manifest;
    const c = credits(m);
    assert.ok(c.flags.some((f) => /forbids commercial use/.test(f)));
    assert.ok(c.flags.some((f) => /inherits its terms/.test(f)));
    assert.equal(c.complete, true, 'a flag constrains a release; it does not block one');
});

test('credits can be asked about a subset', () => {
    let m = addAsset(createManifest(), ok()).manifest;
    m = addAsset(m, ok({ id: HASH2, name: 'anvil' })).manifest;
    assert.equal(credits(m, ['chair']).count, 1);
    assert.equal(credits(m, ['chair', 'nope']).count, 1, 'a miss is skipped, not counted');
    assert.equal(credits(createManifest()).complete, true, 'nothing to clear is clear');
});

test("a film's asset references are collected from every block that can hold one", () => {
    const ids = filmAssetIds({
        models: { rifle: { asset: HASH }, chair: { src: 'assets/chair.glb' } },
        textures: { wood: { asset: HASH2 } },
        assets: { theme: { src: 'audio/theme.wav' } },
        environment: { src: 'hdri/sky.hdr' },
    });
    assert.ok(ids.includes(HASH) && ids.includes(HASH2));
    assert.ok(ids.includes('assets/chair.glb'));
    assert.ok(ids.includes('hdri/sky.hdr'));
    assert.equal(ids.length, 5);
    assert.deepEqual(filmAssetIds(null), []);
});

test('an audit answers "can this be released" in one field', () => {
    let m = addAsset(createManifest(), ok()).manifest;
    m = addAsset(m, ok({ id: HASH2, name: 'mystery', licence: 'unknown',
                         source: null })).manifest;
    const a = auditManifest(m);
    assert.equal(a.total, 2);
    assert.deepEqual(a.byKind, { model: 2 });
    assert.deepEqual(a.unknownLicence, ['mystery']);
    assert.deepEqual(a.missingSource, ['mystery']);
    assert.equal(a.releasable, false);
    assert.equal(auditManifest(createManifest()).releasable, true);
});
