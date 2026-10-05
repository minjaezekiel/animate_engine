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
console.log(JSON.stringify(out));
await br.close(); srv.close();
const fails=[];
if(!out.noMixers) fails.push('mixers/tweens still present');
if(Math.abs(out.xAt1s-5)>0.01) fails.push(`position at 1s is ${out.xAt1s}, want 5`);
if(Math.abs(out.quatYAt1s-Math.sin(Math.PI/4))>0.01) fails.push(`rotation not slerped: quat.y ${out.quatYAt1s}`);
if(!out.reproducible) fails.push('same time gave a different pose');
if(!out.stepHolds) fails.push('step interpolation did not hold');
if(out.colorAt1s===0||out.colorAt1s===0xffffff) fails.push(`colour keyframes not interpolated: ${out.colorAt1s.toString(16)}`);
if(Math.abs(out.xAtEnd-10)>0.01) fails.push(`position at end is ${out.xAtEnd}, want 10`);
if(fails.length){ console.error('FAILED:\n - '+fails.join('\n - ')); process.exit(1); }
console.log('PASS: scrubs after a load, slerps rotation, honours step, animates colour, reproducible');
