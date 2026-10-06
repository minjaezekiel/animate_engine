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
const br=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
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
  + `GIF ${(exports_.gifBytes/1024).toFixed(0)}KB and zip ${(exports_.zipBytes/1024).toFixed(0)}KB streamed`);
