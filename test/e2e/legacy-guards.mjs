/**
 * Playback must survive a project load, and must be a pure function of time.
 *
 * Both guards this file started with are gone with the defects they guarded:
 * the lossy-snapshot flag (the round trip is real now -- see
 * legacy-roundtrip.mjs) and the mixer cache (deleted). What is left is the
 * behaviour that mattered: scrubbing works after a load without pressing
 * play, interpolation modes are honoured, and the same time gives the same
 * pose every time.
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
const ROOT='/Users/kodeuni/Desktop/projects/2025-2026/animateEngine/jireX/';
const T={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json'};
const srv=createServer(async(q,r)=>{try{
  const f=join(ROOT,normalize(new URL(q.url,'http://x').pathname).replace(/^\/$/,'/index.html'));
  const b=await readFile(f); r.writeHead(200,{'content-type':T[extname(f)]??'application/octet-stream'}); r.end(b);
}catch{if(!r.headersSent)r.writeHead(404);r.end();}});
await new Promise(r=>srv.listen(0,r));
const base=`http://127.0.0.1:${srv.address().port}`;
const br=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader'],protocolTimeout:600000});
const pg=await br.newPage(); pg.on('pageerror',e=>console.error('[page]',String(e).slice(0,160)));
await pg.goto(`${base}/index.html`,{waitUntil:'load'});
await pg.waitForFunction(()=>window.AnimationEngine?.animationEngine?.animationManager?.core,{timeout:20000});
const out=await pg.evaluate(()=>{
  const e=window.AnimationEngine.animationEngine;
  const sm=e.sceneManager, am=e.animationManager;
  const r={};
  r.noMixers = am.mixers===undefined && am.tweens===undefined;

  const cube=sm.createCube('c');
  am.createAnimation('a',2,'once'); am.selectAnimation('a');
  am.addKeyframe(cube,0,{position:[0,0,0], rotation:[0,0,0]});
  am.addKeyframe(cube,2,{position:[10,0,0], rotation:[0,Math.PI,0]});

  // Round-trip the animation and drop it, the way a project load does.
  const json=am.exportAnimation('a');
  am.deleteAnimation('a');
  am.importAnimation(json); am.selectAnimation('a');

  am.setCurrentTime(1);                    // scrub without pressing play
  r.xAt1s=+cube.position.x.toFixed(3);
  r.quatYAt1s=+cube.quaternion.y.toFixed(3);   // slerped halfway to 180deg

  // Same time, same pose: scrub away and back.
  am.setCurrentTime(1.7); am.setCurrentTime(1);
  r.reproducible = +cube.position.x.toFixed(6)===r.xAt1s;

  // `step` must hold. The mixer path built a quaternion track and ignored
  // interp outright, so this did nothing on rotation.
  am.setInterpolation(cube,'step');
  am.setCurrentTime(1.9);
  r.stepHolds = +cube.position.x.toFixed(3)===0 && +cube.quaternion.y.toFixed(3)===0;
  am.setInterpolation(cube,'linear');

  // Colour keyframes were stored and read by nothing. Keyed on a second
  // object, because addKeyframe replaces the whole property set at a time.
  const ball=sm.createSphere('b');
  am.addKeyframe(ball,0,{color:0x000000});
  am.addKeyframe(ball,2,{color:0xffffff});
  am.setCurrentTime(1);
  r.colorAt1s=ball.material.color.getHex();

  am.setCurrentTime(2);
  r.xAtEnd=+cube.position.x.toFixed(3);
  return r;
});

// The 3D editor's scene rendered through the SAME offline loop the 2D films
// use: frame-stepped, deterministic, with physics advanced in fixed substeps.
const render=await pg.evaluate(async()=>{
  const e=window.AnimationEngine.animationEngine;
  const am=e.animationManager, sm=e.sceneManager;
  const [render3, sinks, three]=await Promise.all([
    import('/src/render/OfflineRenderer.js'),
    import('/src/render/sinks/MemorySink.js'),
    import('/src/backends/three3d/Three3DBackend.js'),
  ]);
  const timeline=am.prepareActions();
  const backend=new three.Three3DBackend({sceneManager:sm});
  backend.mount(sm.renderer.domElement,{width:160,height:90});
  const resolve=(uuid)=>sm.getObjectByUUID(uuid);
  const gl=sm.renderer.domElement;
  const probe=document.createElement('canvas');
  probe.width=16; probe.height=9;
  const pctx=probe.getContext('2d',{willReadFrequently:true});

  const run=async()=>{
    const poser=three.createThreePoser({timeline,resolve,samplePose:am.core.samplePose});
    const digests=[];
    const sink=new sinks.MemorySink({digest:()=>{
      pctx.drawImage(gl,0,0,16,9);
      const d=pctx.getImageData(0,0,16,9).data;
      let h=2166136261;
      for(let i=0;i<d.length;i+=7){h^=d[i];h=Math.imul(h,16777619);}
      return (h>>>0).toString(36);
    }});
    const out=await render3.renderOffline({
      scene:null, timeline, backend, cameraId:null, poser,
      fps:24, width:160, height:90, durationSec:2, sink,
    });
    for(const f of out.frames) digests.push(f.digest);
    return {out, digests};
  };

  const a=await run();
  const b=await run();
  const r={
    frames:a.out.count,
    timestampsExact:a.out.frames.every(f=>f.tSec===f.frameIndex/24),
    distinct:new Set(a.digests).size,
    deterministic:a.digests.join()===b.digests.join(),
  };

  // Physics must advance when an export steps frames. It never did: an
  // offline render does not call update(), so bodies sat still in every
  // exported frame.
  const ball=sm.createSphere('phys');
  ball.position.set(0,10,0);
  e.physicsManager.enable?.();
  e.physicsManager.addObject(ball,{mass:1});
  e.physicsManager.resetSimulation();
  const yStart=ball.position.y;
  e.physicsManager.stepTo(1.0);
  const yAfter=ball.position.y;
  e.physicsManager.stepTo(0);            // rewind: a solver has no reverse
  const yRewound=ball.position.y;
  e.physicsManager.stepTo(1.0);
  r.physics={fell:+(yStart-yAfter).toFixed(2), rewound:+yRewound.toFixed(2),
             repeatable:Math.abs(ball.position.y-yAfter)<1e-6};
  return r;
});
console.log(JSON.stringify(render));

// GIF and PNG-sequence export must stream: the old path held raw RGBA AND
// PNG bytes for every frame, so a long sequence could not finish at all.
const exports_=await pg.evaluate(async()=>{
  const e=window.AnimationEngine.animationEngine;
  const rm=e.recordingManager;
  // Keep the files instead of downloading them.
  const saved=[];
  const originalCreate=URL.createObjectURL;
  URL.createObjectURL=(b)=>{ saved.push(b); return originalCreate.call(URL,b); };
  const peak={bytes:0};
  const gif=await rm.exportAsGIF({fps:8,maxWidth:160});
  const zip=await rm.exportAsImageSequence({fps:8,maxWidth:160});
  URL.createObjectURL=originalCreate;
  const head=new Uint8Array(await gif.slice(0,6).arrayBuffer());
  const zipHead=new Uint8Array(await zip.slice(0,4).arrayBuffer());
  return {
    gifBytes:gif.size,
    gifMagic:String.fromCharCode(...head),
    zipBytes:zip.size,
    zipMagic:[...zipHead],
    captureFramesGone: typeof rm.captureFrames==='undefined',
    downloads:saved.length,
  };
});
console.log(JSON.stringify(exports_));

// Phase 5: the editor's interaction costs, asserted rather than assumed.
const perf=await pg.evaluate(()=>{
  const e=window.AnimationEngine.animationEngine;
  const sm=e.sceneManager, em=e.editManager, h=e.history;
  const r={};
  const ms=(fn,n=1)=>{const t=performance.now();for(let i=0;i<n;i++)fn();return (performance.now()-t)/n;};

  // --- the viewport is actually lit; nothing structural would catch a
  // lighting regression from a Three upgrade ---
  r.three=window.THREE.REVISION;
  const litProbe=(()=>{
    const gl=sm.renderer.domElement;
    sm.scene.children.filter(c=>c.type==='GridHelper'||c.type==='AxesHelper')
      .forEach(c=>{c.visible=false;});
    const probe=sm.createCube('lit-probe');
    probe.position.set(0,0,0);
    sm.camera.position.set(3,3,3); sm.camera.lookAt(0,0,0);
    sm.render();
    const c=document.createElement('canvas'); c.width=64; c.height=36;
    const cx=c.getContext('2d',{willReadFrequently:true});
    const luma=(d,k)=>d[k]*0.299+d[k+1]*0.587+d[k+2]*0.114;
    cx.drawImage(gl,0,0,64,36);
    const mid=cx.getImageData(24,12,16,12).data;
    // The brightest pixel on the cube, not the mean: the mean folds in the
    // background and the shadowed faces, which is what made it look flat.
    let lit=0; for(let k=0;k<mid.length;k+=4) lit=Math.max(lit,luma(mid,k));
    // Reference is the scene's own background colour, not a sampled frame:
    // the scene still holds objects from the blocks above, so hiding the probe
    // does not leave an empty view.
    const bgc=sm.scene.background;
    r.bgLuma=+(bgc ? (bgc.r*0.299+bgc.g*0.587+bgc.b*0.114)*255 : 0).toFixed(1);
    sm.removeObject(probe);
    sm.scene.children.filter(c2=>c2.type==='GridHelper'||c2.type==='AxesHelper')
      .forEach(c2=>{c2.visible=true;});
    return +lit.toFixed(1);
  })();
  r.litLuma=litProbe;
  r.pointIntensity=sm.createLight('point','probe-light').intensity;

  // --- the gizmo is built once, not sixty times a second ---
  const cube=sm.createCube('gizmo-target');
  sm.getSelectedObject=()=>cube;
  em.currentTool='move';
  em.update();
  const gizmo=document.getElementById('transformGizmo');
  const firstHandle=gizmo.children[0];
  r.handles=gizmo.children.length;
  r.frameMs=+ms(()=>em.update(),200).toFixed(3);
  r.handlesReused=gizmo.children[0]===firstHandle;
  // handles sit at offsets from the gizmo origin, not at doubled absolute
  // viewport coordinates
  r.handleLeft=gizmo.children[0].style.left;
  r.gizmoUsesTransform=/translate/.test(gizmo.style.transform);
  // switching tool rebuilds
  em.currentTool='rotate'; em.update();
  r.rebuiltOnToolChange=gizmo.children[0]!==firstHandle;
  em.currentTool='move'; em.update();

  // --- plane handles drag; they had no branch at all ---
  const planeHandle=[...gizmo.children].find(c=>c.className==='transform-plane z');
  r.hasPlaneHandle=!!planeHandle;
  cube.position.set(0,0,0);
  const vp=document.getElementById('viewport').getBoundingClientRect();
  const at=(fx,fy)=>({clientX:vp.left+vp.width*fx, clientY:vp.top+vp.height*fy,
                      preventDefault(){}, stopPropagation(){}});
  em.startDrag(at(0.5,0.5), cube, 'xz');
  em.isDragging=true; em.dragObject=cube;
  em.handleDrag(at(0.62,0.58));
  r.planeDragMoved=+Math.hypot(cube.position.x,cube.position.z).toFixed(3);
  r.planeDragKeptY=+cube.position.y.toFixed(6);
  em.isDragging=false;

  // --- an axis drag follows the cursor instead of a magic 0.01 ---
  cube.position.set(0,0,0);
  em.startDrag(at(0.5,0.5), cube, 'x');
  em.isDragging=true; em.dragObject=cube;
  em.handleDrag(at(0.7,0.5));
  r.axisDragX=+cube.position.x.toFixed(3);
  r.axisDragKeptZ=+cube.position.z.toFixed(6);
  em.isDragging=false;

  // --- smooth brush: spatial hash, radius scaled to the mesh ---
  for(let i=0;i<4;i++) sm.subdivide(cube);
  const g=cube.geometry, n=g.attributes.position.count;
  r.verts=n;
  let idx;
  r.indexBuildMs=+ms(()=>{idx=em.buildVertexIndex(g);}).toFixed(2);
  let found=0;
  r.queryAllMs=+ms(()=>{found=0;for(let i=0;i<n;i++)found+=idx.near(i).length;}).toFixed(1);
  r.avgNeighbors=+(found/n).toFixed(1);
  // what one old full-scan query cost, times n
  const pos=g.attributes.position;
  const oneScan=ms(()=>{let c=0;for(let i=1;i<n;i++){
    const dx=pos.getX(i)-pos.getX(0),dy=pos.getY(i)-pos.getY(0),dz=pos.getZ(i)-pos.getZ(0);
    if(dx*dx+dy*dy+dz*dz<0.25)c++;}});
  r.oldScanAllMs=+(oneScan*n).toFixed(0);

  // --- Phase 6: primitives take dimensions, materials take properties ---
  const box=sm.createCube('sized',{},{width:3,height:1,depth:2});
  r.boxDims=(({width,height,depth})=>({width,height,depth}))(box.geometry.parameters);
  r.boxNotScaled=box.scale.x===1&&box.scale.y===1&&box.scale.z===1;
  sm.resizePrimitive(box,{width:5});
  r.resized=box.geometry.parameters.width;
  r.resizeKeptDepth=box.geometry.parameters.depth;
  const ring=sm.createTorus('ring',{},{radius:2,tube:0.3});
  r.torusDims=[ring.geometry.parameters.radius,ring.geometry.parameters.tube];
  sm.setMaterialProperties(box,{roughness:0.1,metalness:0.9,emissive:0x112233,
                                opacity:0.4,wireframe:true,flatShading:true});
  r.material={roughness:box.material.roughness, metalness:box.material.metalness,
              emissive:box.material.emissive.getHex(), opacity:box.material.opacity,
              transparent:box.material.transparent, wireframe:box.material.wireframe,
              flatShading:box.material.flatShading};
  // a resize must survive a save, which it only can because dimensions are
  // geometry parameters rather than a scale
  const savedBox=box.uuid;
  sm.importScene(sm.exportScene());
  const back=sm.getObjectByUUID(savedBox);
  r.dimsSurvived=back?back.geometry.parameters.width:null;
  r.materialSurvived=back?back.material.roughness:null;

  // --- history coalesces a burst into one snapshot ---
  h.flush();
  const before=h.stack.length;
  for(let i=0;i<25;i++) sm.markChanged();
  r.snapshotsDuringBurst=h.stack.length-before;
  h.flush();
  r.snapshotsAfterFlush=h.stack.length-before;
  return r;
});
console.log(JSON.stringify(perf));
console.log(JSON.stringify(out));
await br.close(); srv.close();
const fails=[];
if(!out.noMixers) fails.push('mixers/tweens still present');
if(render.frames!==48) fails.push(`offline render produced ${render.frames} frames, want 48`);
if(!render.timestampsExact) fails.push('frame timestamps are not exactly n/fps');
if(render.distinct<20) fails.push(`only ${render.distinct} distinct frames; the scene is not animating`);
if(!render.deterministic) fails.push('two renders of the same animation differed');
if(!(render.physics.fell>1)) fails.push(`physics did not advance offline (fell ${render.physics.fell})`);
if(Math.abs(render.physics.rewound-10)>0.01) fails.push(`rewind left the body at y=${render.physics.rewound}`);
if(!render.physics.repeatable) fails.push('stepping to the same time twice gave different physics');
if(exports_.gifMagic!=='GIF89a') fails.push(`GIF export is not a GIF: ${exports_.gifMagic}`);
if(!(exports_.gifBytes>500)) fails.push(`GIF is ${exports_.gifBytes} bytes; it has no frames`);
if(JSON.stringify(exports_.zipMagic)!=='[80,75,3,4]') fails.push('PNG sequence is not a zip');
if(!(exports_.zipBytes>1000)) fails.push(`zip is ${exports_.zipBytes} bytes; it has no frames`);
if(!exports_.captureFramesGone) fails.push('captureFrames is still there, still holding every frame');
if(Number(perf.three)<150) fails.push(`still on Three r${perf.three}`);
// Against the background, not an absolute number: this guards "the scene is
// lit", which a Three upgrade can silently break, without pretending to judge
// how it looks.
if(!(perf.litLuma > perf.bgLuma*2)) fails.push(
  `the lit cube reads ${perf.litLuma} against a background of ${perf.bgLuma}; the scene is unlit`);
if(!(perf.pointIntensity>10)) fails.push(
  `a new point light has intensity ${perf.pointIntensity}, invisible under physical units`);
if(perf.handles!==7) fails.push(`move gizmo built ${perf.handles} handles, want 7`);
if(!perf.handlesReused) fails.push('the gizmo is still rebuilt every frame');
if(!perf.rebuiltOnToolChange) fails.push('the gizmo did not rebuild when the tool changed');
if(!perf.gizmoUsesTransform) fails.push('the gizmo still moves with left/top, which relayouts');
if(perf.frameMs>0.3) fails.push(`gizmo update costs ${perf.frameMs}ms a frame`);
if(!/^-?\d/.test(perf.handleLeft)||Math.abs(parseFloat(perf.handleLeft))>120)
  fails.push(`handle offset ${perf.handleLeft} looks like an absolute viewport coordinate`);
if(!perf.hasPlaneHandle) fails.push('no plane handle to drag');
if(!(perf.planeDragMoved>0.1)) fails.push(`plane handle drag moved the object ${perf.planeDragMoved}`);
if(Math.abs(perf.planeDragKeptY)>1e-6) fails.push('an xz drag moved y');
if(!(perf.axisDragX>0.1)) fails.push(`x-axis drag moved ${perf.axisDragX}`);
if(Math.abs(perf.axisDragKeptZ)>1e-6) fails.push('an x drag moved z');
if(perf.avgNeighbors>200) fails.push(`smooth averages ${perf.avgNeighbors} neighbours; the radius is not scaled`);
if(!(perf.queryAllMs*8<perf.oldScanAllMs)) fails.push(
  `spatial hash (${perf.queryAllMs}ms) is not meaningfully faster than the full scan (${perf.oldScanAllMs}ms)`);
if(JSON.stringify(perf.boxDims)!=='{"width":3,"height":1,"depth":2}')
  fails.push(`createCube ignored its dimensions: ${JSON.stringify(perf.boxDims)}`);
if(!perf.boxNotScaled) fails.push('dimensions were faked with a scale');
if(perf.resized!==5) fails.push(`resize gave width ${perf.resized}`);
if(perf.resizeKeptDepth!==2) fails.push(`resize clobbered depth: ${perf.resizeKeptDepth}`);
if(JSON.stringify(perf.torusDims)!=='[2,0.3]') fails.push(`torus dims ${JSON.stringify(perf.torusDims)}`);
if(perf.material?.roughness!==0.1||perf.material?.metalness!==0.9)
  fails.push(`PBR properties not set: ${JSON.stringify(perf.material)}`);
if(perf.material?.emissive!==0x112233) fails.push('emissive not set');
if(!perf.material?.transparent) fails.push('opacity set without enabling transparency does nothing');
if(!perf.material?.wireframe||!perf.material?.flatShading) fails.push('wireframe/flatShading not set');
if(perf.dimsSurvived!==5) fails.push(`dimensions lost on save: ${perf.dimsSurvived}`);
if(perf.materialSurvived!==0.1) fails.push(`material lost on save: ${perf.materialSurvived}`);
if(perf.snapshotsDuringBurst!==0) fails.push(`25 mutations took ${perf.snapshotsDuringBurst} snapshots mid-burst`);
if(perf.snapshotsAfterFlush!==1) fails.push(`a burst produced ${perf.snapshotsAfterFlush} snapshots, want 1`);
if(Math.abs(out.xAt1s-5)>0.01) fails.push(`position at 1s is ${out.xAt1s}, want 5`);
if(Math.abs(out.quatYAt1s-Math.sin(Math.PI/4))>0.01) fails.push(`rotation not slerped: quat.y ${out.quatYAt1s}`);
if(!out.reproducible) fails.push('same time gave a different pose');
if(!out.stepHolds) fails.push('step interpolation did not hold');
if(out.colorAt1s===0||out.colorAt1s===0xffffff) fails.push(`colour keyframes not interpolated: ${out.colorAt1s.toString(16)}`);
if(Math.abs(out.xAtEnd-10)>0.01) fails.push(`position at end is ${out.xAtEnd}, want 10`);
if(fails.length){ console.error('FAILED:\n - '+fails.join('\n - ')); process.exit(1); }
console.log(`PASS: scrubs after a load, slerps rotation, honours step, animates colour; `
  + `${render.frames} frames rendered offline, ${render.distinct} distinct, deterministic, `
  + `physics fell ${render.physics.fell} and rewinds; `
  + `GIF ${(exports_.gifBytes/1024).toFixed(0)}KB and zip ${(exports_.zipBytes/1024).toFixed(0)}KB streamed; `
  + `gizmo ${perf.frameMs}ms/frame reused, drags follow the cursor, `
  + `smooth ${perf.oldScanAllMs}ms -> ${perf.queryAllMs}ms at ${perf.verts} verts, `
  + `25 mutations -> 1 snapshot; Three r${perf.three}, lit ${perf.litLuma} vs bg ${perf.bgLuma}`);
