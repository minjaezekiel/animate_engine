/** Decode an MP4's audio in real Chrome and report level, per 5s window. */
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const file = resolve(process.argv[2]);
const CHROME = process.env.CHROME_PATH
  ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const buf = await readFile(file);
const name = basename(file);

const server = createServer((req, res) => {
  if (req.url === '/' ) { res.writeHead(200, {'content-type':'text/html'}); res.end('<!doctype html><title>x</title>'); return; }
  if (req.url === '/' + encodeURIComponent(name) || req.url === '/' + name) {
    res.writeHead(200, {'content-type':'video/mp4'}); res.end(buf); return;
  }
  res.writeHead(404); res.end();
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox','--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/`);
const out = await page.evaluate(async (url) => {
  const r = await fetch(url);
  const bytes = await r.arrayBuffer();
  const ctx = new OfflineAudioContext(1, 48000, 48000);
  const buf = await ctx.decodeAudioData(bytes);
  const ch = buf.getChannelData(0);
  const sr = buf.sampleRate;
  let peak = 0, sum = 0;
  for (let i = 0; i < ch.length; i++) { const a = Math.abs(ch[i]); if (a > peak) peak = a; sum += ch[i]*ch[i]; }
  const rms = Math.sqrt(sum / ch.length);
  const win = [];
  const W = 5 * sr;
  for (let s = 0; s + 1 < ch.length; s += W) {
    const e = Math.min(ch.length, s + W);
    let p = 0, q = 0;
    for (let i = s; i < e; i++) { const a = Math.abs(ch[i]); if (a > p) p = a; q += ch[i]*ch[i]; }
    win.push({ t: +(s/sr).toFixed(1), peak: +p.toFixed(4), rms: +Math.sqrt(q/(e-s)).toFixed(5) });
  }
  return { duration: +buf.duration.toFixed(2), sampleRate: sr, channels: buf.numberOfChannels,
           peak: +peak.toFixed(4), rms: +rms.toFixed(5), windows: win };
}, `http://127.0.0.1:${port}/${name}`);

const db = (v) => v > 0 ? (20*Math.log10(v)).toFixed(1) + ' dBFS' : '-inf';
console.log(`${name}  ${out.duration}s  ${out.sampleRate}Hz  ${out.channels}ch`);
console.log(`  overall peak ${out.peak} (${db(out.peak)})   rms ${out.rms} (${db(out.rms)})`);
console.log('  per 5s window:');
for (const w of out.windows) {
  const bar = '#'.repeat(Math.max(0, Math.round(w.rms * 300)));
  console.log(`   ${String(w.t).padStart(5)}s  peak ${String(w.peak).padEnd(7)} rms ${String(w.rms).padEnd(8)} ${bar}`);
}
await browser.close(); server.close();
