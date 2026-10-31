/**
 * Measure how a video's narration is DELIVERED.
 *
 * Not what is said -- there is no speech recogniser here -- but the shape of
 * the delivery, which is what decides whether anyone keeps watching: how fast
 * the speaker goes, how often they stop, how long the phrases run, how much
 * the level moves, and whether the opening is pitched differently from the
 * body.
 *
 *   node scripts/narration-pacing.mjs <file.mp4> [more.mp4 ...]
 *
 * Everything is derived from a 50 Hz energy envelope of the decoded audio:
 *
 *   speech ratio   how much of the runtime carries voice at all
 *   phrase         a run of speech between pauses; its length is the
 *                  breath-group, and short ones read as urgency
 *   pause          a gap above 180 ms. Below that is articulation, not a beat
 *   onsets/s       energy rises per second: a syllable-rate proxy, and the
 *                  closest thing to "words per minute" without a recogniser
 *   dynamics       how far the level moves; a flat number is a flat read
 *   hook           the first 8 s measured separately, because that is the
 *                  window a feed gives you
 */
import puppeteer from 'puppeteer-core';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { basename, dirname, join, normalize, resolve } from 'node:path';

const CHROME = process.env.CHROME_PATH
    ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const HOOK = Number(process.env.HOOK ?? 8);
const files = process.argv.slice(2).map((f) => resolve(f));
if (!files.length) { console.error('usage: narration-pacing.mjs <file.mp4> ...'); process.exit(1); }

let ROOT = dirname(files[0]);
const server = createServer(async (req, res) => {
    try {
        if (req.url === '/index.html') {
            res.writeHead(200, { 'content-type': 'text/html' });
            res.end('<!doctype html><meta charset=utf-8><body>ready</body>');
            return;
        }
        const body = await readFile(join(ROOT, normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname))));
        res.writeHead(200, { 'content-type': 'video/mp4', 'accept-ranges': 'bytes' });
        res.end(body);
    } catch { if (!res.headersSent) res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const origin = `http://127.0.0.1:${server.address().port}`;

const browser = await puppeteer.launch({
    executablePath: CHROME, headless: true, protocolTimeout: 600_000,
    args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('[page]', String(e).slice(0, 200)));
await page.goto(`${origin}/index.html`, { waitUntil: 'load' });

const rows = [];
for (const file of files) {
    ROOT = dirname(file);
    const url = `/${encodeURIComponent(basename(file))}`;
    const r = await page.evaluate(async (url, HOOK) => {
        const res = await fetch(url);
        const bytes = await res.arrayBuffer();
        const ctx = new OfflineAudioContext(1, 48000, 48000);
        let audio;
        try { audio = await ctx.decodeAudioData(bytes); }
        catch (e) { return { error: 'no decodable audio: ' + String(e).slice(0, 80) }; }
        const d = audio.getChannelData(0);
        const sr = audio.sampleRate;

        // 20 ms energy envelope.
        const win = Math.round(sr * 0.02);
        const env = [];
        for (let i = 0; i < d.length; i += win) {
            let s = 0;
            const end = Math.min(d.length, i + win);
            for (let j = i; j < end; j++) s += d[j] * d[j];
            env.push(Math.sqrt(s / (end - i)));
        }
        const sorted = [...env].sort((a, b) => a - b);
        const q = (p) => sorted[Math.floor(p * (sorted.length - 1))];
        // Noise floor from the quiet quartile; speech is well above it.
        const floor = Math.max(q(0.25) * 2.5, q(0.95) * 0.06);

        const analyse = (from, to) => {
            const a = env.slice(from, to);
            if (!a.length) return null;
            let voiced = a.map((v) => v > floor);
            // **Bridge short gaps before counting phrases.** Speech dips below
            // any threshold between syllables and across every stop consonant,
            // so counting raw frames gives median "phrases" of 40-140 ms --
            // which is a syllable, not a breath group, and made the first run
            // of this tool report numbers no human could produce.
            const BRIDGE = Math.round(0.18 / 0.02);
            for (let i = 0; i < voiced.length; i++) {
                if (voiced[i]) continue;
                let j = i;
                while (j < voiced.length && !voiced[j]) j++;
                const gap = j - i;
                // A gap is only a pause if it is long enough to hear as one,
                // and only when it has speech on BOTH sides.
                if (gap < BRIDGE && i > 0 && j < voiced.length) {
                    for (let k = i; k < j; k++) voiced[k] = true;
                }
                i = j - 1;
            }
            const phrases = [], pauses = [];
            let run = 0, gap = 0;
            for (const v of voiced) {
                if (v) { if (gap) { pauses.push(gap * 0.02); gap = 0; } run++; }
                else { if (run) { phrases.push(run * 0.02); run = 0; } gap++; }
            }
            if (run) phrases.push(run * 0.02);
            if (gap) pauses.push(gap * 0.02);
            // Everything below the bridge is already inside a phrase.
            const real = pauses.filter((p) => p >= 0.18);
            // Energy rises while voiced: a syllable-rate proxy.
            let onsets = 0;
            for (let i = 1; i < a.length - 1; i++) {
                if (voiced[i] && a[i] > a[i - 1] * 1.35 && a[i] >= a[i + 1]) onsets++;
            }
            const secs = a.length * 0.02;
            const lv = a.filter((v) => v > floor);
            const mean = lv.reduce((x, y) => x + y, 0) / (lv.length || 1);
            const sd = Math.sqrt(lv.reduce((x, y) => x + (y - mean) ** 2, 0) / (lv.length || 1));
            const med = (xs) => (xs.length ? [...xs].sort((x, y) => x - y)[xs.length >> 1] : 0);
            return {
                seconds: +secs.toFixed(1),
                speechRatio: +(voiced.filter(Boolean).length / a.length).toFixed(3),
                phrases: phrases.length,
                medPhrase: +med(phrases).toFixed(2),
                pauses: real.length,
                medPause: +med(real).toFixed(2),
                pausesPerMin: +(real.length / secs * 60).toFixed(1),
                onsetsPerSec: +(onsets / secs).toFixed(2),
                dynamics: +(sd / (mean || 1)).toFixed(2),
            };
        };
        return {
            duration: +audio.duration.toFixed(1),
            hook: analyse(0, Math.round(HOOK / 0.02)),
            body: analyse(Math.round(HOOK / 0.02), env.length),
            whole: analyse(0, env.length),
        };
    }, url, HOOK);
    rows.push({ name: basename(file), ...r });
    const w = r.whole, h = r.hook, b = r.body;
    if (r.error) { console.log(`${basename(file)}: ${r.error}`); continue; }
    console.log(`\n${basename(file)}  ${r.duration}s`);
    console.log(`  whole  speech ${(w.speechRatio * 100).toFixed(0)}%  `
        + `phrase ${w.medPhrase}s  pause ${w.medPause}s x${w.pausesPerMin}/min  `
        + `onsets ${w.onsetsPerSec}/s  dynamics ${w.dynamics}`);
    if (h && b) {
        console.log(`  hook   speech ${(h.speechRatio * 100).toFixed(0)}%  `
            + `phrase ${h.medPhrase}s  onsets ${h.onsetsPerSec}/s  dynamics ${h.dynamics}`);
        console.log(`  body   speech ${(b.speechRatio * 100).toFixed(0)}%  `
            + `phrase ${b.medPhrase}s  onsets ${b.onsetsPerSec}/s  dynamics ${b.dynamics}`);
    }
}

console.log(`\n${JSON.stringify(rows).length > 0 ? '' : ''}`);
await browser.close();
server.close();
