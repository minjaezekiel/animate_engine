/**
 * 3D rigging: skinning, retargeting and morph-target visemes.
 *
 * None of this had ever been exercised. RigManager could *discover* bones in
 * an imported model, but nothing checked that a SkinnedMesh deforms, that it
 * survives a save, or that an animation built for one skeleton can be moved
 * onto another -- which is the entire reason to support Mixamo.
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
await pg.waitForFunction(() => window.AnimationEngine?.animationEngine?.animationManager?.core,
    { timeout: 20000 });

const out = await pg.evaluate(() => {
    const e = window.AnimationEngine.animationEngine;
    const sm = e.sceneManager, rm = e.rigManager, am = e.animationManager;
    const r = {};

    /**
     * A two-bone arm: a tall box skinned to a root bone and a mid bone, with
     * weights by height. Built rather than loaded so the test needs no asset.
     */
    const makeRigged = (name, boneNames) => {
        const geometry = new THREE.BoxGeometry(0.4, 4, 0.4, 1, 8, 1);
        const pos = geometry.attributes.position;
        const skinIndices = [], skinWeights = [];
        for (let i = 0; i < pos.count; i++) {
            // 0 at the bottom, 1 at the top: a linear blend between the bones
            const t = Math.min(1, Math.max(0, (pos.getY(i) + 2) / 4));
            skinIndices.push(0, 1, 0, 0);
            skinWeights.push(1 - t, t, 0, 0);
        }
        geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
        geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

        const root = new THREE.Bone();
        root.name = boneNames[0];
        root.position.y = -2;
        const mid = new THREE.Bone();
        mid.name = boneNames[1];
        mid.position.y = 2;   // halfway up, so rotating it swings the top half
        root.add(mid);

        const mesh = new THREE.SkinnedMesh(geometry,
            new THREE.MeshStandardMaterial({ color: 0xcc8844, skinning: true }));
        mesh.name = `${name}-mesh`;
        mesh.add(root);
        mesh.bind(new THREE.Skeleton([root, mid]));

        const group = new THREE.Group();
        group.name = name;
        group.add(mesh);
        sm.addObject(group, name);
        sm.objects.set(mesh.uuid, mesh);
        rm.extractRig(group);
        return { group, mesh, root, mid };
    };

    // --- 1. a skinned mesh actually deforms -------------------------------
    const a = makeRigged('actor', ['mixamorig:Hips', 'mixamorig:Spine']);
    r.bonesFound = rm.bones.size;
    r.isSkinned = a.mesh.isSkinnedMesh === true;

    const tipOf = (mesh) => {
        mesh.updateMatrixWorld(true);
        mesh.skeleton.update();
        // Where the top of the box ends up, through the skinning transform
        const v = new THREE.Vector3(0, 2, 0);
        const index = (() => {
            const p = mesh.geometry.attributes.position;
            let best = 0, bestY = -Infinity;
            for (let i = 0; i < p.count; i++) if (p.getY(i) > bestY) { bestY = p.getY(i); best = i; }
            return best;
        })();
        v.fromBufferAttribute(mesh.geometry.attributes.position, index);
        mesh.applyBoneTransform(index, v);
        return mesh.localToWorld(v);
    };

    const rest = tipOf(a.mesh).clone();
    a.mid.rotation.z = Math.PI / 2;
    const bent = tipOf(a.mesh).clone();
    r.deformed = +rest.distanceTo(bent).toFixed(3);
    a.mid.rotation.z = 0;

    // --- 2. a skinned mesh survives save/load ------------------------------
    const json = sm.exportScene();
    sm.importScene(json);
    const restored = [...sm.objects.values()].find((o) => o.name === 'actor-mesh');
    r.restoredSkinned = !!restored && restored.isSkinnedMesh === true;
    r.restoredBones = restored && restored.skeleton ? restored.skeleton.bones.length : 0;
    r.restoredWeights = !!(restored && restored.geometry.attributes.skinWeight);

    // --- 3. retargeting moves a clip between skeletons ---------------------
    // Rebuild both: importScene cleared the scene above.
    const src = makeRigged('mixamo-source', ['mixamorig:Hips', 'mixamorig:Spine']);
    const dst = makeRigged('my-character', ['Hips', 'Spine']);

    const clip = new THREE.AnimationClip('wave', 1, [
        new THREE.QuaternionKeyframeTrack('mixamorig:Spine.quaternion',
            [0, 1], [0, 0, 0, 1, 0, 0, 0.7071, 0.7071]),
        new THREE.VectorKeyframeTrack('mixamorig:Hips.position',
            [0, 1], [0, -2, 0, 0, -1, 0]),
    ]);
    sm.importedClips.set(src.group.uuid, [clip]);

    r.nameMap = rm.boneNameMap(dst.mesh, src.mesh);
    r.hip = rm.guessHipBone(dst.mesh);
    try {
        const moved = rm.retarget(src.group.uuid, dst.group.uuid, { clipName: 'wave' });
        r.retargeted = {
            tracks: moved.tracks.length,
            names: moved.tracks.map((t) => t.name),
            duration: +moved.duration.toFixed(2),
        };
    } catch (err) {
        r.retargetError = String(err.message);
    }

    // --- 4. retargeting refuses honestly when it cannot work ---------------
    const plain = sm.createCube('not-a-rig');
    try {
        rm.retarget(plain.uuid, dst.group.uuid, {});
        r.refusedPlainMesh = false;
    } catch (err) { r.refusedPlainMesh = /skinned mesh/i.test(err.message); }

    // --- 5. visemes map onto whatever the face calls its morphs ------------
    const faceGeom = new THREE.BoxGeometry(1, 1, 1);
    const base = faceGeom.attributes.position.clone();
    const shifted = base.clone();
    for (let i = 0; i < shifted.count; i++) shifted.setY(i, shifted.getY(i) * 1.4);
    faceGeom.morphAttributes.position = [base, shifted, shifted];
    const face = new THREE.Mesh(faceGeom, new THREE.MeshStandardMaterial());
    face.name = 'face';
    face.morphTargetDictionary = { viseme_sil: 0, viseme_aa: 1, viseme_O: 2 };
    face.morphTargetInfluences = [0, 0, 0];
    sm.addObject(face, 'face');
    rm.morphMeshes.set(face.uuid, face);

    r.visemeMap = rm.visemeMorphMap(face.uuid);

    am.createAnimation('speech', 2, 'once');
    am.selectAnimation('speech');
    const track = { keys: [{ t: 0, v: 'closed' }, { t: 0.5, v: 'open' },
                           { t: 1.0, v: 'mid' }, { t: 1.5, v: 'closed' }] };
    r.visemeKeys = rm.keyVisemes(face.uuid, track);
    am.setCurrentTime(0.6);
    r.openInfluence = face.morphTargetInfluences.slice();
    am.setCurrentTime(1.6);
    r.closedInfluence = face.morphTargetInfluences.slice();
    return r;
});

await br.close();
srv.close();
console.log(JSON.stringify(out, null, 1));

const fails = [];
const check = (ok, msg) => { if (!ok) fails.push(msg); };
check(out.isSkinned, 'the mesh is not a SkinnedMesh');
check(out.bonesFound >= 2, `RigManager found ${out.bonesFound} bones`);
check(out.deformed > 0.5, `rotating a bone moved the skin ${out.deformed}; skinning is not applied`);
check(out.restoredSkinned, 'a SkinnedMesh does not survive save/load');
check(out.restoredBones >= 2, `restored skeleton has ${out.restoredBones} bones`);
check(out.restoredWeights, 'skin weights were lost in the round trip');
check(!out.retargetError, `retargeting failed: ${out.retargetError}`);
// keyed by the TARGET bone, yielding the SOURCE bone, which is the direction
// SkeletonUtils wants and the direction that silently yields an empty clip
// when you get it wrong
check(out.nameMap?.Hips === 'mixamorig:Hips',
      `bone name map is wrong or backwards: ${JSON.stringify(out.nameMap)}`);
check(out.hip === 'Hips', `hip bone guessed as ${out.hip}`);
check((out.retargeted?.tracks ?? 0) >= 1, 'retargeted clip has no tracks');
check(!(out.retargeted?.names ?? []).some((n) => n.startsWith('mixamorig')),
      `retargeted tracks still address source bones: ${out.retargeted?.names}`);
check(out.refusedPlainMesh, 'retargeting a plain mesh did not refuse with a useful message');
check(out.visemeMap?.closed === 'viseme_sil' && out.visemeMap?.open === 'viseme_O',
      `viseme map is wrong: ${JSON.stringify(out.visemeMap)}`);
check(out.visemeKeys === 4, `keyed ${out.visemeKeys} viseme keyframes, want 4`);
check(out.openInfluence?.[2] === 1 && out.openInfluence?.[0] === 0,
      `at 0.6s the open morph is not driven: ${JSON.stringify(out.openInfluence)}`);
check(out.closedInfluence?.[0] === 1 && out.closedInfluence?.[2] === 0,
      `at 1.6s the mouth did not close: ${JSON.stringify(out.closedInfluence)}`);
if (pageErrors.length) fails.push(`page errors: ${pageErrors.join(' | ')}`);

if (fails.length) { console.error('FAILED:\n - ' + fails.join('\n - ')); process.exit(1); }
console.log(`\nPASS: skinning deforms (${out.deformed}) and round-trips, `
    + `${out.retargeted.tracks} tracks retargeted onto a differently-named skeleton, `
    + `visemes drive morph targets.`);
