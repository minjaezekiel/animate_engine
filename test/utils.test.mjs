import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';

// The engine is a UMD file; requiring it in Node must NOT touch the DOM.
const require = createRequire(import.meta.url);
const engine = require('../animateEngine.js');
const { encodeGIF, buildZip, crc32, subdivideGeometry, dataURLToBytes } = engine.utils;

test('packaging: module loads in Node without a browser', () => {
  assert.equal(engine.animationEngine, null, 'auto-init must be skipped without #viewport');
  assert.equal(typeof engine.AnimationEngine, 'function');
  for (const name of ['encodeGIF', 'buildZip', 'crc32', 'subdivideGeometry']) {
    assert.equal(typeof engine.utils[name], 'function', `missing util ${name}`);
  }
});

test('crc32 matches the standard check value', () => {
  const bytes = new TextEncoder().encode('123456789');
  assert.equal(crc32(bytes) >>> 0, 0xCBF43926);
});

test('dataURLToBytes decodes base64 payloads', () => {
  const bytes = dataURLToBytes('data:text/plain;base64,' + Buffer.from('hi!').toString('base64'));
  assert.deepEqual([...bytes], [...new TextEncoder().encode('hi!')]);
});

test('subdivideGeometry turns one triangle into four', () => {
  const triangle = [0, 0, 0, 2, 0, 0, 0, 2, 0]; // one tri = 9 floats
  const out = subdivideGeometry(triangle);
  assert.equal(out.length, 36, '4 triangles => 36 floats');
  // Every output vertex lies within the original triangle's bounding box.
  for (let i = 0; i < out.length; i += 3) {
    assert.ok(out[i] >= 0 && out[i] <= 2 && out[i + 1] >= 0 && out[i + 1] <= 2);
  }
});

test('buildZip produces an archive the OS unzip accepts', () => {
  const files = [
    { name: 'a.txt', data: new TextEncoder().encode('hello world') },
    { name: 'b.bin', data: new Uint8Array([1, 2, 3, 4, 5]) },
  ];
  const zip = buildZip(files);
  assert.deepEqual([...zip.slice(0, 4)], [0x50, 0x4b, 0x03, 0x04], 'PK local header');

  const dir = mkdtempSync(join(tmpdir(), 'ae-zip-'));
  const path = join(dir, 'out.zip');
  writeFileSync(path, zip);
  const listing = execFileSync('unzip', ['-l', path], { encoding: 'utf8' });
  assert.match(listing, /a\.txt/);
  assert.match(listing, /b\.bin/);
  execFileSync('unzip', ['-tqq', path]); // integrity check; throws on CRC error
});

test('encodeGIF yields a valid animated GIF decodable by omggif', async () => {
  const { GifReader } = await import('omggif');
  const W = 4, H = 4;
  const solid = (r, g, b) => {
    const a = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) { a[i * 4] = r; a[i * 4 + 1] = g; a[i * 4 + 2] = b; a[i * 4 + 3] = 255; }
    return a;
  };
  const gif = encodeGIF([solid(255, 0, 0), solid(0, 0, 255)], W, H, 100);
  assert.equal(new TextDecoder().decode(gif.slice(0, 6)), 'GIF89a');
  assert.equal(gif[gif.length - 1], 0x3B, 'GIF trailer');

  const reader = new GifReader(Buffer.from(gif));
  assert.equal(reader.width, W);
  assert.equal(reader.height, H);
  assert.equal(reader.numFrames(), 2);

  const px = new Uint8Array(W * H * 4);
  reader.decodeAndBlitFrameRGBA(0, px);
  assert.ok(px[0] > 200 && px[1] < 50 && px[2] < 50, 'frame 0 is red');
  reader.decodeAndBlitFrameRGBA(1, px);
  assert.ok(px[0] < 50 && px[1] < 50 && px[2] > 200, 'frame 1 is blue');
});
