/**
 * The disk half of the voice take cache: `GET`/`PUT /__take/<digest>.(wav|json)`.
 *
 * Synthesis happens in the browser, because that is where the voice providers
 * live. The disk is Node's. Rather than move either, the page asks the dev
 * server it is already being served from -- so the cache works identically
 * for the 2D and the 3D path, for a person clicking render in a tab and for
 * an agent driving the headless script, with no second transport and no new
 * dependency.
 *
 * See `src/core/voice/takeCache.js` for why the cache exists at all: a
 * headless render launches a FRESH Chrome profile, so an 86 MB Kokoro model
 * was being fetched per render rather than once, which is why neither of the
 * two engines added in Phase 39 had ever rendered a film.
 *
 * `cache/` is gitignored. It is derived from the film text and can always be
 * rebuilt by deleting it and rendering again.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

const PREFIX = '/__take/';
/** 64 hex of SHA-256, then one of two extensions. Nothing else is a key. */
const KEY = /^[0-9a-f]{64}\.(wav|json)$/;
const TYPE = { wav: 'audio/wav', json: 'application/json' };

/**
 * Handle one request if it is a cache request; return false if it is not.
 *
 * `dir` is where takes land, absolute. The name is validated against a strict
 * pattern rather than sanitized, because this writes files to disk on an
 * unauthenticated local port: a digest is 64 hex characters and an
 * `..%2f..%2fetc` is not a digest.
 */
export async function handleTake(req, res, { dir, report = null } = {}) {
    const url = new URL(req.url, 'http://x');
    if (!url.pathname.startsWith(PREFIX)) return false;
    const name = decodeURIComponent(url.pathname.slice(PREFIX.length));
    if (!KEY.test(name)) {
        res.writeHead(400).end('not a take key');
        return true;
    }
    const file = join(dir, name);
    const ext = name.endsWith('.json') ? 'json' : 'wav';

    if (req.method === 'GET') {
        try {
            const body = await readFile(file);
            res.writeHead(200, { 'content-type': TYPE[ext],
                                 'content-length': body.length });
            res.end(body);
        } catch {
            // A miss is the normal case on a first render, so it is a 404 and
            // not a log line.
            res.writeHead(404).end('no such take');
        }
        return true;
    }

    if (req.method === 'PUT') {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const body = Buffer.concat(chunks);
        try {
            await mkdir(dir, { recursive: true });
            /**
             * Write to a temporary name and rename.
             *
             * Two renders can run at once (`RENDER_LOCK=0`), and a reader
             * that catches a half-written WAV would decode a truncated take
             * and cache a clipped line forever. `rename` within one directory
             * is atomic, so a reader sees either nothing or the whole file.
             */
            const tmp = `${file}.${process.pid}.part`;
            await writeFile(tmp, body);
            const { rename } = await import('node:fs/promises');
            await rename(tmp, file);
            report?.(`[take] stored ${name} (${body.length} bytes)`);
            res.writeHead(204).end();
        } catch (e) {
            report?.(`[take] could not store ${name}: ${e.message}`);
            res.writeHead(500).end('could not store');
        }
        return true;
    }

    res.writeHead(405).end('GET or PUT');
    return true;
}

export { PREFIX as TAKE_PREFIX };
