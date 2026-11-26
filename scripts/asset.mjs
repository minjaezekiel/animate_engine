#!/usr/bin/env node
/**
 * The asset library, from the command line.
 *
 *   node scripts/asset.mjs inspect <file>
 *   node scripts/asset.mjs import  <file|url> --licence CC0-1.0 [--name x] [--author y] [--kind model]
 *   node scripts/asset.mjs list    [--kind model]
 *   node scripts/asset.mjs credits [film.json]
 *   node scripts/asset.mjs audit
 *
 * `inspect` is read-only and needs no library: it is the command for deciding
 * between four candidate models without loading any of them into a browser.
 *
 * `import` is where the network is allowed to happen, and it is the only
 * place: a render that can make a network request is a render that is not
 * reproducible, which is the argument `takeCache.js` makes at length for
 * voice and which applies unchanged here.
 */
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { inspectGLTF, isGLTF } from '../src/core/io/gltf.js';
import { parseSVG } from '../src/core/art/svg.js';
import { glbJSON } from '../src/core/io/gltf.js';
import { meshStats, modelBounds, morphTargets } from '../src/core/io/gltfGeometry.js';
import { recommendImport, triangleAdvice } from '../src/core/io/normalizeAsset.js';
import { matchVisemeMorphs } from '../src/core/art/visemeMorphs.js';
import {
    addAsset, auditManifest, createManifest, credits, filmAssetIds,
    listAssets,
} from '../src/core/io/assetManifest.js';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const DIR = process.env.ASSET_DIR ?? join(ROOT, 'assets');
const MANIFEST = join(DIR, 'manifest.json');

const argv = process.argv.slice(2);
const cmd = argv[0];
const positional = argv.slice(1).filter((a) => !a.startsWith('--'));
const flag = (name, fallback = null) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

const KIND_BY_EXT = {
    '.glb': 'model', '.gltf': 'model', '.fbx': 'model',
    '.png': 'image', '.jpg': 'image', '.jpeg': 'image', '.webp': 'image',
    '.hdr': 'hdri', '.exr': 'hdri',
    '.wav': 'audio', '.mp3': 'audio', '.ogg': 'audio',
    '.ttf': 'font', '.otf': 'font', '.woff2': 'font',
    // A vector import is not an image import: it ends in paths, not pixels.
    '.svg': 'vector',
};

async function loadManifest() {
    try { return JSON.parse(await readFile(MANIFEST, 'utf8')); }
    catch { return createManifest(); }
}
async function saveManifest(m) {
    await mkdir(DIR, { recursive: true });
    await writeFile(MANIFEST, `${JSON.stringify(m, null, 2)}\n`);
}

/** Everything worth knowing about a model, without a renderer. */
export function inspectModelBytes(bytes, { kind = 'human' } = {}) {
    if (!isGLTF(bytes)) {
        return { kind: 'unknown',
                 note: 'not a glTF container. FBX and image formats import fine but cannot be '
                     + 'inspected here: a .fbx is a proprietary binary, and the engine reads it '
                     + 'through FBXLoader in the browser.' };
    }
    const toc = inspectGLTF(bytes);
    const glb = glbJSON(bytes);
    const json = glb ? glb.json : JSON.parse(new TextDecoder().decode(bytes));
    const bounds = modelBounds(json);
    const stats = meshStats(json);
    const morphs = morphTargets(json);
    const faceMorphs = morphs.find((m) => m.names?.length);
    return {
        ...toc,
        bounds,
        stats,
        triangles: triangleAdvice(stats),
        morphTargets: morphs,
        // The question an author actually has about a head.
        lipsync: faceMorphs
            ? { mesh: faceMorphs.mesh, ...matchVisemeMorphs(faceMorphs.names) }
            : (morphs.length
                ? { usable: false,
                    reason: `${morphs.length} mesh(es) have morph targets but none is named, `
                        + 'so they can only be driven by index' }
                : { usable: false, reason: 'no morph targets: this model cannot be lipsynced' }),
        import: recommendImport(bounds, { kind,
            ...(flag('height') ? { targetHeight: Number(flag('height')) } : {}) }),
    };
}

function printInspection(r, label) {
    console.log(`\n${label}`);
    if (r.kind === 'unknown') { console.log(`  ${r.note}`); return; }
    console.log(`  ${r.format} ${r.version} · ${(r.bytes / 1048576).toFixed(2)} MB`
        + `${r.generator ? ` · ${r.generator}` : ''}`);
    console.log(`  ${r.stats.triangles.toLocaleString()} triangles in `
        + `${r.meshes.length} mesh(es), ${r.stats.instances} instance(s)`
        + (r.stats.trianglesDrawn !== r.stats.triangles
            ? ` → ${r.stats.trianglesDrawn.toLocaleString()} drawn` : ''));
    if (r.triangles.level === 'warning') console.log(`  ! ${r.triangles.message}`);
    if (r.bounds) {
        console.log(`  bounds ${r.bounds.size.map((v) => v.toFixed(3)).join(' x ')} `
            + `(extent ${r.bounds.extent.toFixed(3)})`);
    }
    console.log(`  rig: ${r.skinned ? `${r.skins} skin(s)` : 'none'} · `
        + `clips: ${r.animations.length ? r.animations.join(', ') : 'none'}`);
    console.log(`  lipsync: ${r.lipsync.usable ? 'YES' : 'no'} — ${r.lipsync.reason}`);
    if (r.needsDecoder?.length) {
        console.log(`  ! needs a decoder this engine does not ship: ${r.needsDecoder.join(', ')}`);
        console.log('    (a Draco model loads as an EMPTY SCENE with no error)');
    }
    if (r.import?.ok) {
        console.log(`  import: ${JSON.stringify(r.import.suggestion)}`);
        for (const n of r.import.notes) console.log(`    · ${n}`);
    } else if (r.import) {
        console.log(`  import: ${r.import.reason}`);
    }
    const addressable = r.nodes.filter((n) => !/^node_\d+$/.test(n));
    console.log(`  addressable nodes: ${addressable.length} of ${r.nodes.length}`
        + (addressable.length < r.nodes.length
            ? ' (the rest are unnamed and cannot be animated part by part)' : ''));
}

async function fetchBytes(src) {
    if (/^https?:/.test(src)) {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${src}`);
        return new Uint8Array(await res.arrayBuffer());
    }
    return new Uint8Array(await readFile(src));
}

// ------------------------------------------------------------------ commands

if (cmd === 'svg') {
    /**
     * An SVG as film parts, printed or written.
     *
     *   node scripts/asset.mjs svg logo.svg --width 400 --id logo --out parts.json
     *
     * This is a CONVERSION, not an import: the output is film data, to paste
     * into a scene's `scenery` or a character's `parts`, and it never gets
     * rasterised on the way. `import` still records the source file and its
     * licence, which is the half of the asset pipeline that matters.
     */
    const src = positional[0];
    if (!src) { console.error('usage: asset.mjs svg <file|url> [--width N] [--id name] [--out f]'); process.exit(2); }
    const text = new TextDecoder().decode(await fetchBytes(src));
    const res = parseSVG(text, {
        id: flag('id', 'svg'),
        width: flag('width') ? Number(flag('width')) : null,
        center: flag('center', 'yes') !== 'no',
    });
    for (const w of res.warnings) console.error(`  [svg] ${w}`);
    console.error(`  ${res.parts.length} part(s), `
        + `${res.size[0].toFixed(1)} x ${res.size[1].toFixed(1)} units, `
        + `${res.parts.reduce((a, p) => a + p.shape.d.length, 0)} chars of path data`);
    const json = `${JSON.stringify(res.parts, null, 2)}\n`;
    const out = flag('out');
    if (out) { await writeFile(out, json); console.error(`  wrote ${out}`); }
    else process.stdout.write(json);
} else if (cmd === 'inspect') {
    const src = positional[0];
    if (!src) { console.error('usage: asset.mjs inspect <file|url>'); process.exit(2); }
    const bytes = await fetchBytes(src);
    printInspection(inspectModelBytes(bytes, { kind: flag('as', 'human') }), src);
    console.log('');
} else if (cmd === 'import') {
    const src = positional[0];
    const licence = flag('licence') ?? flag('license');
    if (!src) { console.error('usage: asset.mjs import <file|url> --licence <terms>'); process.exit(2); }
    if (!licence) {
        console.error('--licence is required. An animation built on an asset whose licence was\n'
            + 'never recorded is not shippable, and that is discovered late. Pass\n'
            + '--licence unknown deliberately if that is the truth.');
        process.exit(2);
    }
    const bytes = await fetchBytes(src);
    const id = createHash('sha256').update(bytes).digest('hex');
    const ext = extname(src.split('?')[0]).toLowerCase();
    const name = flag('name') ?? basename(src.split('?')[0], ext);
    await mkdir(DIR, { recursive: true });
    const path = join(DIR, `${id}${ext}`);
    // Content-addressed, so re-importing a file you already have is a no-op
    // rather than a second copy under a second name.
    let already = false;
    try { await stat(path); already = true; } catch { /* new */ }
    if (!already) await writeFile(path, bytes);
    const info = ext === '.glb' || ext === '.gltf'
        ? inspectModelBytes(bytes, { kind: flag('as', 'human') }) : null;
    const { manifest, error, diagnostics, replaced } = addAsset(await loadManifest(), {
        id, name, licence,
        kind: flag('kind') ?? KIND_BY_EXT[ext] ?? 'other',
        source: /^https?:/.test(src) ? src : `local:${basename(src)}`,
        author: flag('author'),
        bytes: bytes.byteLength,
        added: new Date().toISOString().slice(0, 10),
        notes: flag('notes'),
        info: info && info.kind !== 'unknown'
            ? { triangles: info.stats.triangles, bounds: info.bounds,
                clips: info.animations, skinned: info.skinned,
                lipsync: info.lipsync.usable, suggestion: info.import?.suggestion ?? null }
            : null,
    });
    if (error) { console.error(error); process.exit(1); }
    await saveManifest(manifest);
    for (const d of diagnostics ?? []) console.log(`  [${d.severity}] ${d.message}`);
    console.log(`${replaced ? 'updated' : 'imported'} ${name}  ${id.slice(0, 12)}  `
        + `${(bytes.byteLength / 1048576).toFixed(2)} MB${already ? '  (bytes already held)' : ''}`);
    if (info && info.kind !== 'unknown') printInspection(info, `  ${name}`);
    console.log(`\nreference it as: { "asset": "${id.slice(0, 12)}" }`);
} else if (cmd === 'list') {
    const m = await loadManifest();
    const rows = listAssets(m, { kind: flag('kind') });
    if (!rows.length) { console.log('no assets. `asset.mjs import <file> --licence <terms>`'); }
    for (const a of rows) {
        console.log(`${a.id.slice(0, 12)}  ${String(a.kind).padEnd(7)} `
            + `${String(a.name).padEnd(24)} ${a.licence}`
            + (a.info?.triangles ? `  ${a.info.triangles.toLocaleString()} tris` : '')
            + (a.info?.lipsync ? '  lipsync' : ''));
    }
} else if (cmd === 'credits') {
    const m = await loadManifest();
    const filmPath = positional[0];
    const ids = filmPath ? filmAssetIds(JSON.parse(await readFile(filmPath, 'utf8'))) : null;
    const c = credits(m, ids);
    console.log(c.lines.length ? c.lines.map((l) => `  ${l}`).join('\n') : '  (no assets)');
    for (const f of c.flags) console.log(`\n  ! ${f}`);
    for (const p of c.problems) console.log(`\n  PROBLEM: ${p}`);
    console.log(`\n  ${c.count} asset(s), ${c.complete ? 'clear for release' : 'NOT clear for release'}`);
    if (!c.complete) process.exit(1);
} else if (cmd === 'audit') {
    const a = auditManifest(await loadManifest());
    console.log(JSON.stringify(a, null, 2));
    if (!a.releasable) process.exit(1);
} else {
    console.log(`usage:
  asset.mjs svg     <file|url> [--width N] [--id name] [--out f] [--center no]
  asset.mjs inspect <file|url> [--as human|prop|furniture|vehicle|building] [--height 1.8]
  asset.mjs import  <file|url> --licence <terms> [--name n] [--author a] [--kind k] [--notes t]
  asset.mjs list    [--kind model]
  asset.mjs credits [film.json]
  asset.mjs audit`);
    process.exit(cmd ? 2 : 0);
}
