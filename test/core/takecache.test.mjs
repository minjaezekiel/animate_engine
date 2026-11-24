import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
    takeKeyOf, createMemoryTakeCache, createHttpTakeCache,
} from '../../src/core/voice/takeCache.js';
import { synthesizeDialogue } from '../../src/core/voice/synthesize.js';

const SR = 48000;

/** The smallest thing the pipeline treats as an AudioBuffer. */
const buf = (amp = 0.3, secs = 0.5, rate = SR) => {
    const n = Math.round(rate * secs);
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = amp * Math.sin((2 * Math.PI * 180 * i) / rate);
    return {
        sampleRate: rate, length: n, duration: n / rate, numberOfChannels: 1,
        getChannelData: () => a,
    };
};

const digest = async (s) => createHash('sha256').update(s).digest('hex');

/**
 * A fake WAV codec.
 *
 * Two things it deliberately copies from the real one. It round-trips through
 * 16-bit, so the LOSS is real -- the read-back behaviour this module exists
 * for is only observable if the stored form is lossy. And it returns a
 * **Blob**, because `audioBufferToWav` does: it was written for a download
 * link, and a fake that returned an ArrayBuffer would let a `.byteLength` on
 * a Blob pass here and write a zero-byte file in production. Which is exactly
 * what `scripts/say.mjs` did on its first run.
 */
const encodeWav = (b) => {
    const src = b.getChannelData(0);
    const out = new Int16Array(src.length + 24);   // 48 bytes of fake header
    for (let i = 0; i < src.length; i++) out[i + 24] = Math.round(src[i] * 32767);
    return new Blob([out.buffer], { type: 'audio/wav' });
};
const decode = async (input) => {
    // Same acceptance as `decodeAudio`: an ArrayBuffer, or anything that can
    // give one.
    const bytes = input instanceof ArrayBuffer ? input : await input.arrayBuffer();
    const all = new Int16Array(bytes);
    const pcm = all.subarray(24);
    const a = new Float32Array(pcm.length);
    for (let i = 0; i < pcm.length; i++) a[i] = pcm[i] / 32767;
    return { sampleRate: SR, length: a.length, duration: a.length / SR,
             numberOfChannels: 1, getChannelData: () => a };
};

/** An in-memory HTTP server, as a `fetch`. */
const fakeHttp = ({ fail = false } = {}) => {
    const store = new Map();
    const calls = [];
    const f = async (url, init = {}) => {
        const key = String(url);
        calls.push(`${init.method ?? 'GET'} ${key.split('/').pop()}`);
        if (init.method === 'PUT') {
            if (fail) return { ok: false, status: 500 };
            // A real server stores BYTES, whatever shape the body arrived in.
            store.set(key, init.body instanceof Blob
                ? await init.body.arrayBuffer() : init.body);
            return { ok: true, status: 204 };
        }
        if (!store.has(key)) return { ok: false, status: 404 };
        const body = store.get(key);
        return {
            ok: true, status: 200,
            arrayBuffer: async () => body,
            json: async () => JSON.parse(body),
        };
    };
    return { f, store, calls };
};

test('takeKeyOf', async (t) => {
    await t.test('two identical takes share a key', () => {
        assert.equal(takeKeyOf({ voiceSpec: 'kokoro:bm_george', text: 'Hello.' }),
                     takeKeyOf({ voiceSpec: 'kokoro:bm_george', text: 'Hello.' }));
    });

    await t.test('the delivery is part of the identity', () => {
        /**
         * Five characters share one Swahili model and are told apart only by
         * rate and pitch (docs/26-DELIVERY.md). A key that ignored delivery
         * would give all five of them the first one's voice, from the cache,
         * with nothing reporting it.
         */
        const a = takeKeyOf({ voiceSpec: 'tts:x', text: 'Habari.', delivery: { rate: 1 } });
        const b = takeKeyOf({ voiceSpec: 'tts:x', text: 'Habari.', delivery: { rate: 0.92 } });
        assert.notEqual(a, b);
    });

    await t.test('so is the language, and the voice', () => {
        assert.notEqual(takeKeyOf({ voiceSpec: 'tts:x', text: 'a', lang: 'en' }),
                        takeKeyOf({ voiceSpec: 'tts:x', text: 'a', lang: 'sw' }));
        assert.notEqual(takeKeyOf({ voiceSpec: 'tts:x', text: 'a' }),
                        takeKeyOf({ voiceSpec: 'tts:y', text: 'a' }));
    });

    await t.test('and the text cannot be confused with the fields before it', () => {
        // Text is joined LAST and unescaped, so a value that looks like a
        // field boundary still cannot collide with a different take.
        assert.notEqual(takeKeyOf({ voiceSpec: 'tts:x', text: 'a\u0000b' }),
                        takeKeyOf({ voiceSpec: 'tts:x', text: 'a', lang: 'b' }));
    });
});

test('createMemoryTakeCache', async (t) => {
    await t.test('stores and returns, and counts', async () => {
        const c = createMemoryTakeCache();
        assert.equal(await c.get('k'), null);
        const e = { audioBuffer: buf(), phonemes: [{ p: 'a', t: 0 }] };
        assert.equal(await c.put('k', e), e);
        assert.equal((await c.get('k')).phonemes.length, 1);
        assert.deepEqual(c.stats(), { hits: 1, misses: 1, stored: 1, failed: 0 });
    });
});

test('createHttpTakeCache', async (t) => {
    const make = (http) => createHttpTakeCache({
        fetchImpl: http.f, digest, decode, encodeWav, baseUrl: 'http://x' });

    await t.test('a miss is a 404 and costs nothing else', async () => {
        const http = fakeHttp();
        const c = make(http);
        assert.equal(await c.get('nothing'), null);
        assert.deepEqual(http.calls, ['GET ' + (await digest('nothing')) + '.wav']);
        assert.equal(c.stats().misses, 1);
    });

    await t.test('a put stores the wav AND the timings beside it', async () => {
        const http = fakeHttp();
        const c = make(http);
        await c.put('k', { audioBuffer: buf(), phonemes: [{ p: 'h', t: 0.01 }] });
        const d = await digest('k');
        assert.ok(http.store.has(`http://x/__take/${d}.wav`));
        assert.ok(http.store.has(`http://x/__take/${d}.json`),
                  'timings must travel with the samples');
    });

    await t.test('a hit returns the samples and the timings', async () => {
        /**
         * Lipsync has three tiers and the exact one needs phoneme timings. A
         * cache that stored only the WAV would make the FIRST render of a
         * film lipsync off phonemes and every later one off the envelope -- a
         * regression triggered by nothing but running twice.
         */
        const http = fakeHttp();
        const c = make(http);
        await c.put('k', { audioBuffer: buf(), phonemes: [{ p: 'h', t: 0.01 }] });
        const got = await c.get('k');
        assert.equal(got.phonemes.length, 1);
        assert.equal(got.phonemes[0].p, 'h');
        assert.equal(got.audioBuffer.length, buf().length);
    });

    await t.test('a take with no timings stores no sidecar and still reads back', async () => {
        const http = fakeHttp();
        const c = make(http);
        await c.put('k', { audioBuffer: buf(), phonemes: null });
        const d = await digest('k');
        assert.equal(http.store.has(`http://x/__take/${d}.json`), false);
        const got = await c.get('k');
        assert.equal(got.phonemes, null);
        assert.ok(got.audioBuffer);
    });

    await t.test('a put returns what a later READ would give, not what it was handed', async () => {
        /**
         * The cache stores 16-bit PCM and a model emits float. If a miss used
         * the float and a hit used the decoded WAV, a cold render would
         * differ from a warm one at about -90 dBFS -- a difference nobody
         * could ever attribute to anything. So the write is read back.
         */
        const http = fakeHttp();
        const c = make(http);
        const fresh = buf(0.30000001);
        const kept = await c.put('k', { audioBuffer: fresh, phonemes: null });
        assert.notEqual(kept.audioBuffer, fresh, 'must not hand back the float buffer');
        const warm = await c.get('k');
        assert.deepEqual([...kept.audioBuffer.getChannelData(0).slice(0, 8)],
                         [...warm.audioBuffer.getChannelData(0).slice(0, 8)],
                         'a cold render and a warm one must agree sample for sample');
    });

    await t.test('a truncated entry is a miss, not a silent line', async () => {
        const http = fakeHttp();
        const c = make(http);
        const d = await digest('k');
        http.store.set(`http://x/__take/${d}.wav`, new Int16Array(2).buffer);
        assert.equal(await c.get('k'), null);
    });

    await t.test('a cache that cannot write cannot break a render', async () => {
        const http = fakeHttp({ fail: true });
        const c = make(http);
        const fresh = buf();
        const out = await c.put('k', { audioBuffer: fresh, phonemes: null });
        assert.equal(out.audioBuffer, fresh);
        assert.equal(c.stats().failed, 1);
    });
});

// ------------------------------------------------- in the synthesis pipeline

/** A registry that counts how many times it was asked to speak. */
const stubRegistry = (phonemes = null) => {
    const asked = [];
    return {
        asked,
        async synthesize(spec, { text }) {
            asked.push(`${spec}|${text}`);
            return { audioBuffer: buf(), phonemes, voice: { id: 'v' }, substituted: null };
        },
        diagnostics: () => [],
    };
};
const job = (text, over = {}) => ({
    nodeId: 'host', speaker: 'host', text, at: 0, voiceSpec: 'tts:v', lipsync: false, ...over });

test('synthesizeDialogue and the cache', async (t) => {
    await t.test('the same line twice in one film is synthesized ONCE', async () => {
        /**
         * The docstring on `synthesize.js` claimed this from the first voice
         * phase and it was false: `assetId` was computed AFTER synthesis, so
         * nothing could be looked up. Two characters sharing a model and a
         * line is the common case in a two-hander.
         */
        const registry = stubRegistry();
        await synthesizeDialogue({
            lipsyncJobs: [job('Hello.'), job('Hello.', { at: 2 })], registry });
        assert.equal(registry.asked.length, 1, registry.asked.join(', '));
    });

    await t.test('a warm cache synthesizes NOTHING', async () => {
        const cache = createMemoryTakeCache();
        const cold = stubRegistry();
        await synthesizeDialogue({ lipsyncJobs: [job('One.'), job('Two.', { at: 2 })],
                                   registry: cold, takeCache: cache });
        assert.equal(cold.asked.length, 2);

        const warm = stubRegistry();
        const out = await synthesizeDialogue({
            lipsyncJobs: [job('One.'), job('Two.', { at: 2 })],
            registry: warm, takeCache: cache, buffers: {} });
        assert.equal(warm.asked.length, 0, 'the model must not be touched at all');
        assert.equal(out.cues.length, 2, 'and both lines still have audio');
    });

    await t.test('editing one line re-synthesizes only that line', async () => {
        const cache = createMemoryTakeCache();
        const first = stubRegistry();
        await synthesizeDialogue({ lipsyncJobs: [job('One.'), job('Two.', { at: 2 })],
                                   registry: first, takeCache: cache });
        const second = stubRegistry();
        await synthesizeDialogue({
            lipsyncJobs: [job('One.'), job('Two, corrected.', { at: 2 })],
            registry: second, takeCache: cache });
        assert.deepEqual(second.asked, ['tts:v|Two, corrected.']);
    });

    await t.test('phoneme timings survive the cache, so lipsync does not downgrade', async () => {
        const cache = createMemoryTakeCache();
        const timings = [{ phoneme: 'h', start: 0, end: 0.04 }];
        await synthesizeDialogue({ lipsyncJobs: [job('Hi.', { lipsync: true })],
                                   registry: stubRegistry(timings), takeCache: cache, fps: 24 });
        const warm = stubRegistry(null);
        const out = await synthesizeDialogue({
            lipsyncJobs: [job('Hi.', { lipsync: true })],
            registry: warm, takeCache: cache, fps: 24 });
        assert.equal(warm.asked.length, 0);
        assert.ok(out.tracks.length, 'a cached take still drives a viseme track');
    });

    await t.test('no cache at all behaves exactly as before', async () => {
        const registry = stubRegistry();
        const out = await synthesizeDialogue({ lipsyncJobs: [job('Hello.')], registry });
        assert.equal(out.cues.length, 1);
        assert.equal(out.diagnostics.filter((d) => d.severity === 'warning').length, 0);
    });
});

// ------------------------------------------------------- the disk half

import { handleTake } from '../../scripts/lib/take-cache-server.mjs';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';

/** The smallest thing `handleTake` treats as a response. */
const resStub = () => {
    const r = { status: 0, headers: null, body: null, headersSent: false };
    r.writeHead = (s, h) => { r.status = s; r.headers = h ?? null; r.headersSent = true; return r; };
    r.end = (b) => { r.body = b ?? null; return r; };
    return r;
};
const reqStub = (method, url, body = null) => {
    const base = body ? Readable.from([Buffer.from(body)]) : Readable.from([]);
    base.method = method;
    base.url = url;
    return base;
};
const KEY = 'a'.repeat(64);

test('handleTake', async (t) => {
    const dir = await mkdtemp(join(tmpdir(), 'jirex-takes-'));

    await t.test('ignores anything that is not a cache request', async () => {
        const res = resStub();
        assert.equal(await handleTake(reqStub('GET', '/film3d.html'), res, { dir }), false);
        assert.equal(res.headersSent, false, 'and must not touch the response');
    });

    await t.test('a miss is a 404', async () => {
        const res = resStub();
        assert.equal(await handleTake(reqStub('GET', `/__take/${KEY}.wav`), res, { dir }), true);
        assert.equal(res.status, 404);
    });

    await t.test('a put then a get round-trips the bytes', async () => {
        const put = resStub();
        await handleTake(reqStub('PUT', `/__take/${KEY}.wav`, 'RIFFxxxx'), put, { dir });
        assert.equal(put.status, 204);
        assert.equal(await readFile(join(dir, `${KEY}.wav`), 'utf8'), 'RIFFxxxx');
        const get = resStub();
        await handleTake(reqStub('GET', `/__take/${KEY}.wav`), get, { dir });
        assert.equal(get.status, 200);
        assert.equal(get.headers['content-type'], 'audio/wav');
        assert.equal(get.body.toString(), 'RIFFxxxx');
    });

    await t.test('a put leaves no partial file behind under its final name', async () => {
        // Written to a `.part` and renamed, because two renders can run at
        // once and a reader that caught a half-written WAV would cache a
        // truncated take forever.
        const files = await (await import('node:fs/promises')).readdir(dir);
        assert.equal(files.filter((f) => f.endsWith('.part')).length, 0, files.join(','));
    });

    await t.test('REFUSES anything that is not a digest', async () => {
        /**
         * This writes files to disk from an unauthenticated local port, so
         * the name is validated against a strict pattern rather than
         * sanitized. A digest is 64 hex characters; `../../etc/passwd` is
         * not, and neither is a 63-character one.
         */
        for (const bad of ['../../etc/passwd.wav', `${'a'.repeat(63)}.wav`,
                           `${KEY}.exe`, `${KEY}.wav.wav`, 'x.wav',
                           `${'A'.repeat(64)}.wav`]) {
            const res = resStub();
            const handled = await handleTake(
                reqStub('PUT', `/__take/${encodeURIComponent(bad)}`, 'x'), res, { dir });
            assert.equal(handled, true, bad);
            assert.equal(res.status, 400, `${bad} must be refused, got ${res.status}`);
        }
    });

    await t.test('and refuses a method that is neither', async () => {
        const res = resStub();
        await handleTake(reqStub('DELETE', `/__take/${KEY}.wav`), res, { dir });
        assert.equal(res.status, 405);
    });
});
