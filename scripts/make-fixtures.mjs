/**
 * Write the two fixtures the import paths are demonstrated with.
 *
 *   npm run make:fixtures
 *
 *   demo/out/trace/figure.png   a drawn character, for `trace_character`
 *   demo/out/models/pedestal.glb a .glb with a named node and an animation
 *
 * Generated rather than committed, because a binary asset in a repo is a
 * thing nobody can diff and everybody has to trust. Both are small enough to
 * write in a few dozen lines, and writing them is itself a check: the GLB is
 * packed to the spec's chunk alignment by hand, so `model_inspect` reading it
 * back proves both halves.
 */
import { encodePNG } from '../src/io/png.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const out = (p) => { mkdirSync(dirname(ROOT + p), { recursive: true }); return ROOT + p; };

// ------------------------------------------------------------ the drawing
const W = 300, H = 500;
const px = new Uint8ClampedArray(W * H * 4);
for (let i = 0; i < W*H; i++) { px[i*4]=238; px[i*4+1]=243; px[i*4+2]=248; px[i*4+3]=255; }
const put=(x,y,c)=>{ if(x<0||y<0||x>=W||y>=H) return; const q=(y*W+x)*4; px[q]=c[0];px[q+1]=c[1];px[q+2]=c[2];px[q+3]=255; };
const ell=(cx,cy,rx,ry,c)=>{for(let y=Math.ceil(cy-ry);y<=cy+ry;y++)for(let x=Math.ceil(cx-rx);x<=cx+rx;x++){const u=(x-cx)/rx,v=(y-cy)/ry;if(u*u+v*v<=1)put(x,y,c);}};
const box=(x0,y0,x1,y1,c)=>{for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++)put(x,y,c);};
const SKIN=[228,178,142], HAIR=[64,44,34], SHIRT=[198,72,62], TROUSER=[56,66,104], SHOE=[28,28,34];
ell(150,70,38,46,SKIN);                 // head
ell(150,44,40,30,HAIR);                 // hair
box(140,112,160,126,SKIN);              // neck
box(108,126,192,268,SHIRT);             // torso
ell(150,126,42,12,SHIRT);               // shoulders
box(84,132,108,252,SKIN);               // arm (image left)
box(192,132,216,252,SKIN);              // arm (image right)
ell(96,254,12,14,SKIN); ell(204,254,12,14,SKIN);   // hands
box(116,268,146,430,TROUSER);           // legs
box(154,268,184,430,TROUSER);
box(112,430,150,452,SHOE); box(150,430,188,452,SHOE);
ell(138,62,6,8,[250,250,252]); ell(162,62,6,8,[250,250,252]);  // eyes
ell(138,62,3,4,[30,30,40]); ell(162,62,3,4,[30,30,40]);
mkdirSync('/Users/kodeuni/Desktop/projects/2025-2026/animateEngine/jireX/demo/out/trace', { recursive: true });
writeFileSync('/Users/kodeuni/Desktop/projects/2025-2026/animateEngine/jireX/demo/out/trace/figure.png', encodePNG(W, H, px));
console.log('wrote demo/out/trace/figure.png');

// ----------------------------------------------------------------- the model
const P = new Float32Array([
  -0.5,0,-0.5,  0.5,0,-0.5,  0.5,0,0.5,  -0.5,0,0.5,
  -0.5,1,-0.5,  0.5,1,-0.5,  0.5,1,0.5,  -0.5,1,0.5,
]);
const I = new Uint16Array([
  0,2,1, 0,3,2,  4,5,6, 4,6,7,
  0,1,5, 0,5,4,  1,2,6, 1,6,5,
  2,3,7, 2,7,6,  3,0,4, 3,4,7,
]);
const T = new Float32Array([0, 1, 2]);
const h = Math.SQRT1_2;
const R = new Float32Array([0,0,0,1, 0,h,0,h, 0,1,0,0]);
const parts = [P, I, T, R];
let off = 0; const views = [];
const chunks = [];
for (const a of parts) {
  const bytes = new Uint8Array(a.buffer.slice(0));
  const pad = (4 - (off % 4)) % 4;
  if (pad) { chunks.push(new Uint8Array(pad)); off += pad; }
  views.push({ buffer: 0, byteOffset: off, byteLength: bytes.byteLength });
  chunks.push(bytes); off += bytes.byteLength;
}
const bin = new Uint8Array(off); let q = 0;
for (const c of chunks) { bin.set(c, q); q += c.byteLength; }
const json = {
  asset: { version: '2.0', generator: 'jirex test fixture' },
  scene: 0, scenes: [{ nodes: [0] }],
  nodes: [{ name: 'Pedestal', mesh: 0 }],
  meshes: [{ name: 'PedestalMesh', primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
  materials: [{ name: 'Stone', pbrMetallicRoughness: {
    baseColorFactor: [0.72, 0.68, 0.62, 1], metallicFactor: 0.05, roughnessFactor: 0.75 } }],
  animations: [{ name: 'Turn', samplers: [{ input: 2, output: 3, interpolation: 'LINEAR' }],
                 channels: [{ sampler: 0, target: { node: 0, path: 'rotation' } }] }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: 8, type: 'VEC3',
      min: [-0.5, 0, -0.5], max: [0.5, 1, 0.5] },
    { bufferView: 1, componentType: 5123, count: 36, type: 'SCALAR' },
    { bufferView: 2, componentType: 5126, count: 3, type: 'SCALAR', min: [0], max: [2] },
    { bufferView: 3, componentType: 5126, count: 3, type: 'VEC4' },
  ],
  bufferViews: views,
  buffers: [{ byteLength: off }],
};
const jb = new TextEncoder().encode(JSON.stringify(json));
const jpad = (4 - (jb.length % 4)) % 4;
const bpad = (4 - (bin.length % 4)) % 4;
const total = 12 + 8 + jb.length + jpad + 8 + bin.length + bpad;
const glbBytes = new Uint8Array(total); const dv = new DataView(glbBytes.buffer);
dv.setUint32(0, 0x46546c67, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
dv.setUint32(12, jb.length + jpad, true); dv.setUint32(16, 0x4e4f534a, true);
glbBytes.set(jb, 20); for (let i = 0; i < jpad; i++) glbBytes[20 + jb.length + i] = 0x20;
const bo = 20 + jb.length + jpad;
dv.setUint32(bo, bin.length + bpad, true); dv.setUint32(bo + 4, 0x004e4942, true);
glbBytes.set(bin, bo + 8);

writeFileSync(out('demo/out/models/pedestal.glb'), glbBytes);
console.log('wrote demo/out/models/pedestal.glb', total, 'bytes');
