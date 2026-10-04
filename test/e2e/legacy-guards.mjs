/**
 * Phase 0.5 guards on the legacy 3D editor.
 *
 * 1. a snapshot containing geometry importScene cannot rebuild is flagged
 *    lossy, so autosave never silently replaces a sculpt with a cube
 * 2. mixers are rebuilt on demand, so playback and scrubbing work after a
 *    project load instead of silently doing nothing
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
await pg.goto(`${base}/index.html`,{waitUntil:'networkidle2'});
await new Promise(r=>setTimeout(r,1500));
const out=await pg.evaluate(()=>{
  const e=(window.AnimationEngine&&window.AnimationEngine.animationEngine)||window.animationEngine||null;
  if(!e) return {error:'engine did not boot'};
  const sm=e.sceneManager, am=e.animationManager;
  // guard 2: a sculpted mesh must mark the snapshot lossy
  const cube=sm.createCube('c');
  const before=JSON.parse(sm.exportScene()).lossy||false;
  cube.geometry=new THREE.BufferGeometry().copy(cube.geometry); // no .type match
  cube.geometry.type='SculptedGeometry';
  const after=JSON.parse(sm.exportScene()).lossy||false;
  // guard 1: playback after a load, with mixers never populated
  am.createAnimation('a',2,'once'); am.selectAnimation('a');
  am.addKeyframe(cube,0,{position:[0,0,0]});
  am.addKeyframe(cube,2,{position:[10,0,0]});
  const json=am.exportAnimation('a');
  am.deleteAnimation('a');
  am.mixers.clear();                       // simulate a fresh page load
  am.importAnimation(json); am.selectAnimation('a');
  const mixersAfterImport=am.mixers.size;  // 0 before the fix, still 0 here
  am.setCurrentTime(1);                    // scrub without pressing play
  const mixersAfterScrub=am.mixers.size;
  const x=cube.position.x;
  return {lossyBefore:before, lossyAfter:after, mixersAfterImport, mixersAfterScrub, xAt1s:+x.toFixed(2)};
});
console.log(JSON.stringify(out));
await br.close(); srv.close();
const ok = out.lossyBefore===false && out.lossyAfter===true && out.mixersAfterScrub===1 && Math.abs(out.xAt1s-5)<0.6;
console.log(ok?'PASS: lossy flagged, mixers rebuilt on scrub, object animated':'FAIL');
process.exit(ok?0:1);
