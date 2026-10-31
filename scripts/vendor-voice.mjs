/**
 * Vendor a Piper voice and a repointed vits-web, so rendering does not depend
 * on fetching 63MB from huggingface.co.
 *
 *   npm run vendor-voice                     # the Swahili voice
 *   VOICE=en_GB-alba-medium npm run vendor-voice
 *
 * Why this exists: a headless render launches a FRESH Chrome profile, so the
 * OPFS cache vits-web keeps its models in is empty every single run. Every
 * render therefore re-downloads the whole model. That is slow, and it is
 * fragile in exactly the way that matters -- 503s from the CDN killed a
 * geology render, and a mid-download tab crash killed the first Swahili one.
 *
 * Two edits are made to the module, both one line. `HF_BASE` is exported but
 * it is a `const` binding, so an importer cannot assign to it; `moduleUrl` on
 * `TtsVitsProvider` is the supported seam, and this writes the file it points
 * at. `vendor/` is gitignored.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const VOICE = process.env.VOICE ?? 'sw_CD-lanfrica-medium';
const MODULE = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web@1.0.3/dist/vits-web.js';
const CHUNK = 'https://cdn.jsdelivr.net/npm/@diffusionstudio/vits-web@1.0.3/dist/piper-DeOu3H9E.js';
const HF = 'https://huggingface.co/diffusionstudio/piper-voices/resolve/main';
const ROOT = new URL('../vendor/', import.meta.url).pathname;

const get = async (url, what) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${what}: ${r.status} ${r.statusText} (${url})`);
    return r;
};

// The module's own path map says where a voice id lives in the tree.
const src = await (await get(MODULE, 'vits-web')).text();
const m = new RegExp(`"${VOICE}":\\s*"([^"]+)"`).exec(src);
if (!m) throw new Error(`"${VOICE}" is not in the vits-web path map`);
const rel = m[1];

for (const suffix of ['', '.json']) {
    const out = `${ROOT}piper-voices/${rel}${suffix}`;
    await mkdir(dirname(out), { recursive: true });
    const bytes = new Uint8Array(await (await get(`${HF}/${rel}${suffix}`, 'voice')).arrayBuffer());
    await writeFile(out, bytes);
    console.log(`${out}  ${(bytes.length / 1e6).toFixed(1)}MB`);
}

const header = `/* @diffusionstudio/vits-web@1.0.3, vendored and repointed by `
    + `scripts/vendor-voice.mjs.\n *\n`
    + ` *   HF_BASE -> /vendor/piper-voices, served by this repo's own server\n`
    + ` *   the relative piper-*.js chunk -> its absolute CDN url, because the\n`
    + ` *   module is now loaded from a different origin than it was published at\n`
    + ` *\n`
    + ` * The upstream OPFS cache is keyed on the url matching huggingface.co, so\n`
    + ` * it is skipped here. That is the point: there is nothing to cache when the\n`
    + ` * file is already local. Do not edit by hand; re-run the script.\n */\n`;
await writeFile(`${ROOT}vits-web.js`,
    header + src.replaceAll(HF, '/vendor/piper-voices').replace('"./piper-DeOu3H9E.js"', `"${CHUNK}"`));
console.log(`${ROOT}vits-web.js`);
console.log(`\nRenders will now use the local copy. produce.mjs picks it up on its own;`);
console.log(`TTS_MODULE_URL= overrides, and deleting vendor/ falls back to the CDN.`);
