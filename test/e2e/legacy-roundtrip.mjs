/**
 * The legacy 3D editor's project round trip.
 *
 * The old serializer wrote a geometry TYPE NAME and rebuilt from a switch
 * whose default was createCube, so a sculpt came back as a cube; it wrote
 * groups as `children` but read `parent`, so hierarchy was lost; and it never
 * serialized lights at all. Phase 0.5 could only FLAG that ("lossy"); this
 * asserts the round trip is now real, vertex by vertex.
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const CHROME = process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = new URL('../..', import.meta.url).pathname;
const T = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
            '.json': 'application/json', '.png': 'image/png' };

const srv = createServer(async (q, r) => {
    try {
        const f = join(ROOT, normalize(new URL(q.url, 'http://x').pathname).replace(/^\/$/, '/index.html'));
        const b = await readFile(f);
        r.writeHead(200, { 'content-type': T[extname(f)] ?? 'application/octet-stream' });
        r.end(b);
    } catch { if (!r.headersSent) r.writeHead(404); r.end(); }
});
await new Promise((r) => srv.listen(0, r));
const base = `http://127.0.0.1:${srv.address().port}`;

const br = await puppeteer.launch({
    executablePath: CHROME, headless: true,
    args: ['--no-sandbox', '--enable-unsafe-swiftshader'],
    protocolTimeout: 600_000,
});
const pg = await br.newPage();
const pageErrors = [];
pg.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 200)));
await pg.goto(`${base}/index.html`, { waitUntil: 'load' });
await pg.waitForFunction(() => window.AnimationEngine?.animationEngine?.sceneManager?.scene,
    { timeout: 20000 });

const out = await pg.evaluate(() => {
    const e = window.AnimationEngine.animationEngine;
    const sm = e.sceneManager;
    const r = {};

    // A scene with every node kind that used to break.
    const group = sm.createGroup('rig');
    const cube = sm.createCube('sculpted');
    sm.addToGroup(cube, group);
    const sphere = sm.createSphere('ball');
    sphere.position.set(1.5, 2.25, -3.5);
    sphere.scale.set(2, 0.5, 1);
    const spot = sm.createLight('spot', 'key');
    spot.position.set(4, 6, 2);
    spot.intensity = 2.5;
    spot.color.setHex(0xff8800);
    const dir = sm.createLight('directional', 'fill');
    dir.intensity = 0.4;

    // Sculpt the cube: a geometry no type-name switch can rebuild, edited
    // through the same call the sculpt brush uses.
    e.editManager.startSculpting({ clientX: 0, clientY: 0 }, cube);
    e.editManager.isSculpting = false;
    const pos = cube.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        pos.setXYZ(i, pos.getX(i) * 1.37 + 0.11, pos.getY(i) * 0.63, pos.getZ(i) - 0.29);
    }
    pos.needsUpdate = true;
    cube.geometry.computeVertexNormals();
    cube.material.color.setHex(0x3366cc);

    const before = {
        vertices: Array.from(pos.array),
        spherePos: sphere.position.toArray(),
        sphereScale: sphere.scale.toArray(),
        cubeColor: cube.material.color.getHex(),
        parentName: cube.parent && cube.parent.name,
        lightCount: sm.lights.size,
        geometryType: cube.geometry.type,
    };
    r.lightsInObjects = sm.objects.has(spot.uuid) && sm.objects.has(dir.uuid);

    const t0 = performance.now();
    const json = sm.exportScene();
    r.exportMs = Math.round(performance.now() - t0);
    r.bytes = json.length;
    r.flagsLossy = JSON.parse(json).lossy ?? false;

    sm.importScene(json);

    const cube2 = [...sm.objects.values()].find((o) => o.name === 'sculpted');
    const sphere2 = [...sm.objects.values()].find((o) => o.name === 'ball');
    const spot2 = [...sm.lights.values()].find((o) => o.name === 'key');
    const dir2 = [...sm.lights.values()].find((o) => o.name === 'fill');
    if (!cube2 || !sphere2 || !spot2 || !dir2) {
        return { ...r, error: `missing after import: ${[['cube',cube2],['sphere',sphere2],['spot',spot2],['dir',dir2]].filter(([,v])=>!v).map(([k])=>k).join(',')}` };
    }

    const after = Array.from(cube2.geometry.attributes.position.array);
    r.vertexCount = before.vertices.length;
    r.maxVertexError = before.vertices.reduce((m, v, i) => Math.max(m, Math.abs(v - after[i])), 0);
    r.uuidPreserved = cube2.uuid === cube.uuid;
    r.hierarchy = { before: before.parentName, after: cube2.parent && cube2.parent.name };
    r.spherePos = sphere2.position.toArray().map((v) => +v.toFixed(4));
    r.spherePosWant = before.spherePos;
    r.sphereScale = sphere2.scale.toArray().map((v) => +v.toFixed(4));
    r.cubeColor = cube2.material.color.getHex();
    r.cubeColorWant = before.cubeColor;
    // The old importer lower-cased "SpotLight" whole, matched no case, and
    // turned every light in a file into a point light.
    r.spotIsSpot = spot2.isSpotLight === true;
    r.dirIsDirectional = dir2.isDirectionalLight === true;
    r.spotIntensity = spot2.intensity;
    r.spotColor = spot2.color.getHex();
    r.lightCount = sm.lights.size;
    r.lightCountWant = before.lightCount;
    // three.min.js is minified, so constructor names are mangled; a light helper
    // is identifiable by the light it points at.
    r.helperRestored = spot2.children.some((c) => c.light === spot2);

    // A v1 project must still open rather than throw.
    const legacy = JSON.stringify({
        objects: [{ uuid: 'legacy-1', name: 'old', type: 'Mesh', geometry: 'SphereGeometry',
                    material: { color: 0x112233 }, position: [1, 2, 3], rotation: [0, 0, 0],
                    scale: [1, 1, 1], properties: { visible: true } }],
        lights: [{ uuid: 'legacy-2', name: 'oldspot', type: 'SpotLight', position: [0, 4, 0],
                   color: 0x00ff00, intensity: 3, properties: {} }],
        groups: [],
    });
    sm.importScene(legacy);
    const old = [...sm.objects.values()].find((o) => o.name === 'old');
    const oldLight = [...sm.lights.values()].find((o) => o.name === 'oldspot');
    r.v1 = {
        loaded: !!old && !!oldLight,
        geometry: old && old.geometry.type,
        position: old && old.position.toArray(),
        isSpot: !!oldLight && oldLight.isSpotLight === true,
    };
    return r;
});

await br.close();
srv.close();
console.log(JSON.stringify(out, null, 1));

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };
check(!out.error, out.error);
check(out.maxVertexError === 0, `sculpted vertices changed by ${out.maxVertexError}`);
check(out.vertexCount > 0, 'no vertices compared');
check(out.uuidPreserved, 'uuid changed, which breaks every keyframe keyed by it');
check(out.hierarchy?.after === 'rig', `hierarchy lost: parent is ${out.hierarchy?.after}`);
check(JSON.stringify(out.spherePos) === JSON.stringify(out.spherePosWant), 'position not restored');
check(JSON.stringify(out.sphereScale) === JSON.stringify([2, 0.5, 1]), 'scale not restored');
check(out.cubeColor === out.cubeColorWant, 'material colour not restored');
check(out.lightsInObjects, 'lights are still absent from `objects`, so unclickable and unlisted');
check(out.lightCount === out.lightCountWant, `lights lost: ${out.lightCount} of ${out.lightCountWant}`);
check(out.spotIsSpot, 'a SpotLight came back as something else');
check(out.dirIsDirectional, 'a DirectionalLight came back as something else');
check(out.spotIntensity === 2.5 && out.spotColor === 0xff8800, 'light properties not restored');
check(out.helperRestored, 'no helper rebuilt for the restored light');
check(out.flagsLossy === false, 'still flagging the save lossy');
check(out.v1?.loaded, 'a pre-2.0 project no longer opens');
check(out.v1?.isSpot, 'a pre-2.0 SpotLight still comes back as a point light');
if (pageErrors.length) failures.push(`page errors: ${pageErrors.join(' | ')}`);

if (failures.length) {
    console.error('FAILED:\n - ' + failures.join('\n - '));
    process.exit(1);
}
console.log(`\nPASS: ${out.vertexCount / 3} vertices, hierarchy, lights and uuids all survive `
    + `(${(out.bytes / 1024).toFixed(0)} KB, ${out.exportMs} ms to serialize); v1 projects still open.`);
