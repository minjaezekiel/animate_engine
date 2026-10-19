/**
 * Importing models and environments into a 3D film.
 *
 * The container reader is the part that has to be exact: an agent writes a
 * film around the NAMES in somebody else's file, and a name it cannot see is
 * a part it cannot animate.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectGLTF, glbJSON, isGLTF } from '../../src/core/io/gltf.js';
import { compileFilm3D } from '../../src/core/script/compile3d.js';

/** Pack a glTF manifest into a .glb exactly as the spec lays one out. */
function glb(json, binLength = 0) {
    const jb = new TextEncoder().encode(JSON.stringify(json));
    const jpad = (4 - (jb.length % 4)) % 4;
    const bpad = (4 - (binLength % 4)) % 4;
    const total = 12 + 8 + jb.length + jpad + (binLength ? 8 + binLength + bpad : 0);
    const out = new Uint8Array(total);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, 0x46546c67, true);
    dv.setUint32(4, 2, true);
    dv.setUint32(8, total, true);
    dv.setUint32(12, jb.length + jpad, true);
    dv.setUint32(16, 0x4e4f534a, true);
    out.set(jb, 20);
    for (let i = 0; i < jpad; i++) out[20 + jb.length + i] = 0x20;
    if (binLength) {
        const at = 20 + jb.length + jpad;
        dv.setUint32(at, binLength + bpad, true);
        dv.setUint32(at + 4, 0x004e4942, true);
    }
    return out;
}

const MANIFEST = {
    asset: { version: '2.0', generator: 'Blender glTF 2.0' },
    scenes: [{ nodes: [0] }],
    nodes: [{ name: 'Armature', children: [1] }, { name: 'Head' }, { name: 'Lamp' }],
    meshes: [{ name: 'Body' }],
    materials: [{ name: 'Skin' }, {}],
    animations: [{ name: 'Idle' }, { name: 'Walk' }],
    skins: [{}],
    extensionsUsed: ['KHR_materials_emissive_strength'],
};

test('a .glb manifest is read without a renderer', () => {
    const info = inspectGLTF(glb(MANIFEST, 64));
    assert.equal(info.format, 'glb');
    assert.equal(info.version, '2.0');
    assert.equal(info.generator, 'Blender glTF 2.0');
    assert.equal(info.binBytes, 64);
    assert.deepEqual(info.nodes, ['Armature', 'Head', 'Lamp']);
    assert.deepEqual(info.animations, ['Idle', 'Walk']);
    assert.deepEqual(info.meshes, ['Body']);
    assert.equal(info.skinned, true);
    // An unnamed material still gets a stable name, because a caller
    // referring to "the second material" needs something to refer to.
    assert.deepEqual(info.materials, ['Skin', 'material_1']);
});

test('roots are the nodes nothing else parents', () => {
    const info = inspectGLTF(glb(MANIFEST));
    assert.deepEqual(info.roots, ['Armature', 'Lamp'], 'Head is a child of Armature');
});

test('a .gltf JSON document reads the same way', () => {
    const info = inspectGLTF(JSON.stringify(MANIFEST));
    assert.equal(info.format, 'gltf');
    assert.deepEqual(info.nodes, ['Armature', 'Head', 'Lamp']);
    assert.equal(info.binBytes, 0);
});

test('chunks are walked with their padding, or everything after the first desyncs', () => {
    // A JSON chunk whose length is not a multiple of four is the normal case;
    // walking by `length` alone reads the next chunk header from the middle
    // of the padding and finds nothing.
    const odd = { ...MANIFEST, asset: { version: '2.0', generator: 'x' } };
    const bytes = glb(odd, 12);
    const parsed = glbJSON(bytes);
    assert.ok(parsed);
    assert.equal(parsed.binBytes, 12, 'the BIN chunk was found after the padded JSON chunk');
});

test('a file that needs a decoder says so, because it otherwise renders empty', () => {
    const info = inspectGLTF(glb({ ...MANIFEST,
        extensionsRequired: ['KHR_draco_mesh_compression', 'KHR_texture_basisu'] }));
    assert.deepEqual(info.needsDecoder, ['KHR_draco_mesh_compression', 'KHR_texture_basisu']);
});

test('isGLTF accepts both forms and rejects noise', () => {
    assert.equal(isGLTF(glb(MANIFEST)), true);
    assert.equal(isGLTF(JSON.stringify(MANIFEST)), true);
    assert.equal(isGLTF(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7])), false);
    assert.equal(isGLTF('not json'), false);
});

// ------------------------------------------------------- the film script

const loaded = { pedestal: { nodes: ['Pedestal', 'Plinth'],
                             clips: [{ name: 'Turn', duration: 2, tracks: [] }] } };

const filmWith = (extra = {}, actions = []) => compileFilm3D({
    meta: { title: 't', ...extra },
    models: { pedestal: { src: 'pedestal.glb' } },
    cast: [{ model: 'pedestal', as: 'pod', at: [1, 0, 0], rot: [0, 90, 0] }],
    scenes: [{ shots: [{ duration: 3, actions }] }],
}, { models: loaded });

test('a model is one node in the core scene, however many it has inside', () => {
    const c = filmWith();
    assert.deepEqual(c.diagnostics, []);
    const node = c.scene.get('pod');
    assert.equal(node.kind, 'model');
    assert.equal(node.props.model, 'pedestal');
    assert.deepEqual(node.props.at, [1, 0, 0]);
    assert.ok(Math.abs(node.props.rot[1] - Math.PI / 2) < 1e-12, 'degrees in, radians out');
    // A downloaded environment can carry thousands of nodes and the core
    // scene exists to be walked and measured.
    assert.equal(c.scene.byId.size, 4, 'root, camera, look target, model');
});

test('its named nodes are still addressable', () => {
    const c = filmWith({}, [{ do: 'turn', target: 'pod/Plinth', to: [0, 45, 0], for: 1 }]);
    assert.deepEqual(c.diagnostics, []);
    assert.ok(c.timeline.tracks.some((t) => t.target === 'pod/Plinth'));
});

test('animating a node the file does not have is a warning, not silence', () => {
    const c = filmWith({}, [{ do: 'turn', target: 'pod/Nonsense', to: [0, 45, 0] }]);
    assert.ok(c.diagnostics.some((d) => d.message.includes('Nonsense')));
});

test('play uses the animations that came in the file, and names them when it cannot', () => {
    const good = filmWith({}, [{ do: 'play', target: 'pod', action: 'Turn', at: 0.5 }]);
    assert.deepEqual(good.diagnostics, []);
    assert.equal(good.timeline.clips.size, 1);
    assert.equal(good.timeline.instances.length, 1);
    assert.equal(good.timeline.instances[0].scopeId, 'pod');

    const bad = filmWith({}, [{ do: 'play', target: 'pod', action: 'Sprint' }]);
    assert.equal(bad.diagnostics.length, 1);
    assert.ok(bad.diagnostics[0].message.includes('Turn'),
              'the one thing a caller cannot do is guess what a stranger called their walk');
});

test('a model with no clips says that rather than listing nothing', () => {
    const c = compileFilm3D({
        models: { prop: { src: 'p.glb' } },
        cast: [{ model: 'prop', as: 'prop' }],
        scenes: [{ shots: [{ duration: 1, actions: [{ do: 'play', target: 'prop', action: 'X' }] }] }],
    }, { models: { prop: { nodes: ['Prop'], clips: [] } } });
    assert.ok(c.diagnostics[0].message.includes('declares none'));
});

test('an undeclared model, and a declared one nobody casts, are both reported', () => {
    const c = compileFilm3D({
        models: { used: { src: 'a.glb' }, spare: { src: 'b.glb' }, broken: {} },
        cast: [{ model: 'used', as: 'u' }, { model: 'ghost', as: 'g' }],
        scenes: [{ shots: [{ duration: 1 }] }],
    }, { models: { used: { nodes: [], clips: [] } } });
    const messages = c.diagnostics.map((d) => d.message);
    assert.ok(messages.some((m) => m.includes("unknown model 'ghost'")));
    assert.ok(messages.some((m) => m.includes("'spare' is declared and never cast")));
    assert.ok(messages.some((m) => m.includes("'broken' has no `src`")));
});

test('a model compiles without the loader having run, just without its names', () => {
    // `compileFilm3D` is pure and Node-testable; the page does the fetching.
    // A compile with no `models` still has to place the model.
    const c = compileFilm3D({
        models: { chair: { src: 'c.glb' } },
        cast: [{ model: 'chair', as: 'chair', at: [0, 0, 2] }],
        scenes: [{ shots: [{ duration: 1 }] }],
    });
    assert.deepEqual(c.diagnostics, []);
    assert.deepEqual(c.scene.get('chair').props.at, [0, 0, 2]);
});

// ------------------------------------------------------------ environment

test('an environment lights the scene, and is the sky only if asked', () => {
    assert.equal(filmWith().meta.environment, null);
    const short = filmWith({ environment: 'studio.hdr' }).meta.environment;
    assert.deepEqual(short, { src: 'studio.hdr', background: false, intensity: 1, blur: 0 });
    const long = filmWith({ environment: { src: 'sky.hdr', background: true,
                                           intensity: 1.4, blur: 0.2 } }).meta.environment;
    assert.deepEqual(long, { src: 'sky.hdr', background: true, intensity: 1.4, blur: 0.2 });
    // Declared since Phase 14 and read by nothing until now, so a film could
    // name one and render under its three point lights with no diagnostic.
    assert.equal(filmWith({ environment: {} }).meta.environment, null);
});
