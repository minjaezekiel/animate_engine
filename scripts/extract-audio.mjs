/**
 * Decode a rendered film's audio in real Chrome and write it out as a WAV.
 *
 *   node scripts/extract-audio.mjs out/forex/en/market-01.mp4 out/check.wav
 *   SECONDS=20 node scripts/extract-audio.mjs <in.mp4> <out.wav>
 *
 * Why: when somebody reports "there is no voice", the question is whether the
 * audio is missing or the player is not playing it. A WAV removes the
 * container, the codec and the edit list from the argument -- if the voice is
 * in the WAV, the render is fine and the problem is downstream.
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';

const inFile = resolve(process.argv[2]);
const outFile = resolve(process.argv[3] ?? 'out/audio.wav');
const SECONDS = Number(process.env.SECONDS ?? 0);
const CHROME = process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const buf = await readFile(inFile);
const name = basename(inFile);
const server = createServer((req, res) => {
    if (req.url === `/${name}`) {
        res.writeHead(200, { 'content-type': 'video/mp4' }); res.end(buf); return;
    }
    res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><title>a</title>');
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/`);
const pcm = await page.evaluate(async (url, secs) => {
    const bytes = await (await fetch(url)).arrayBuffer();
    const ctx = new OfflineAudioContext(1, 48000, 48000);
    const ab = await ctx.decodeAudioData(bytes);
    const n = secs > 0 ? Math.min(ab.length, Math.floor(secs * ab.sampleRate)) : ab.length;
    const L = ab.getChannelData(0).slice(0, n);
    const R = ab.numberOfChannels > 1 ? ab.getChannelData(1).slice(0, n) : L;
    const out = new Int16Array(n * 2);
    for (let i = 0; i < n; i++) {
        out[i * 2] = Math.max(-32768, Math.min(32767, L[i] * 32767));
        out[i * 2 + 1] = Math.max(-32768, Math.min(32767, R[i] * 32767));
    }
    return { rate: ab.sampleRate, frames: n, data: Array.from(new Uint8Array(out.buffer)) };
}, `http://127.0.0.1:${port}/${name}`, SECONDS);
await browser.close(); server.close();

const data = Buffer.from(pcm.data);
const hdr = Buffer.alloc(44);
hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + data.length, 4); hdr.write('WAVE', 8);
hdr.write('fmt ', 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20);
hdr.writeUInt16LE(2, 22); hdr.writeUInt32LE(pcm.rate, 24);
hdr.writeUInt32LE(pcm.rate * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34);
hdr.write('data', 36); hdr.writeUInt32LE(data.length, 40);
await writeFile(outFile, Buffer.concat([hdr, data]));
console.log(`wrote ${outFile} (${(data.length / 1048576).toFixed(2)} MB, `
    + `${(pcm.frames / pcm.rate).toFixed(1)}s @ ${pcm.rate}Hz stereo)`);
