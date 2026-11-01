import test from 'node:test';
import assert from 'node:assert/strict';

import { VoiceStudioProvider } from '../../src/core/voice/providers/VoiceStudioProvider.js';
import { VoiceRegistry } from '../../src/core/voice/VoiceRegistry.js';

/**
 * A client for a separate, locally-run program. See docs/29-VOICE-STUDIO.md.
 *
 * Everything here runs against an INJECTED fetch, so the suite never needs
 * VoiceStudio installed, never opens a socket, and still asserts the exact
 * request that would go over the wire -- which is the part that was inferred
 * from "OpenAI-compatible" rather than read from a running instance, and so
 * is the part most worth pinning.
 */

const wav = (n = 4096) => new Uint8Array(n).buffer;

/** A fake server. Records what it was asked for. */
function studio({ voices = [], speech = wav(), failOn = null } = {}) {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
        calls.push({ url, method: init.method ?? 'GET',
                     body: init.body ? JSON.parse(init.body) : null });
        if (failOn && url.includes(failOn)) {
            return { ok: false, status: 404, statusText: 'Not Found' };
        }
        if ((init.method ?? 'GET') === 'GET' && !url.includes('.well-known')) {
            return { ok: true, status: 200, json: async () => voices };
        }
        // Match on METHOD, not on the path: the paths are configurable and a
        // fake that only knew the defaults could not test an override.
        if ((init.method ?? 'GET') === 'POST') {
            return { ok: true, status: 200, arrayBuffer: async () => speech };
        }
        return { ok: false, status: 404, statusText: 'Not Found' };
    };
    return { fetchImpl, calls };
}

const make = (opts = {}, srv = studio()) => new VoiceStudioProvider({
    fetchImpl: srv.fetchImpl,
    decode: async (bytes) => ({ bytes, duration: bytes.byteLength / 96000 }),
    ...opts,
});

// ---------------------------------------------------------------------------
// Absence is the normal case
// ---------------------------------------------------------------------------

test('available() is false when nothing is running, and never throws', async () => {
    const p = make({ fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
    assert.equal(await p.available(), false);
});

test('available() is false when the route moved, and still never throws', async () => {
    const srv = studio({ failOn: '/voices' });
    const p = make({}, srv);
    assert.equal(await p.available(), false);
});

test('a missing studio does not break the registry: the ladder falls through', async () => {
    // This is the guarantee that keeps a render self-contained. A film cast
    // against VoiceStudio must still render on a machine without it.
    const reg = new VoiceRegistry();
    reg.register(make({ fetchImpl: async () => { throw new Error('down'); } }));
    reg.register({
        id: 'tts', source: 'tts',
        available: async () => true,
        listVoices: async () => [{ id: 'piper-1', provider: 'tts', lang: 'sw', tags: [] }],
        synthesize: async () => ({ audioBuffer: { fallback: true }, phonemes: null }),
    });
    const out = await reg.synthesize('voicestudio:my-clone', { text: 'habari' });
    assert.deepEqual(out.audioBuffer, { fallback: true },
        'a film cast against a studio that is absent must still render');
});

// ---------------------------------------------------------------------------
// Listing, in the three shapes OpenAI-compatible servers actually use
// ---------------------------------------------------------------------------

test('a bare array, {data} and {voices} all list the same way', async () => {
    const rows = [{ id: 'a', language: 'sw_CD' }];
    for (const body of [rows, { data: rows }, { voices: rows }]) {
        const p = make({}, studio({ voices: body }));
        const list = await p.listVoices();
        assert.equal(list.length, 1, JSON.stringify(body));
        assert.equal(list[0].id, 'a');
        assert.equal(list[0].lang, 'sw-CD', 'the underscore form is normalised');
        assert.equal(list[0].provider, 'voicestudio');
    }
});

test('a cloned voice is tagged, which is what makes it findable', async () => {
    const p = make({}, studio({ voices: [
        { id: 'mine', cloned: true, language: 'sw' },
        { voice_id: 'stock', language: 'en' },
        { id: 'designed', type: 'cloned', language: 'en' },
    ] }));
    const list = await p.listVoices();
    assert.deepEqual(list.map((v) => v.id), ['mine', 'stock', 'designed']);
    assert.ok(list[0].tags.includes('cloned'));
    assert.ok(!list[1].tags.includes('cloned'));
    assert.ok(list[2].tags.includes('cloned'), 'type: "cloned" counts too');
});

test('the listing is fetched once, not once per line of dialogue', async () => {
    const srv = studio({ voices: [{ id: 'a' }] });
    const p = make({}, srv);
    await p.listVoices(); await p.listVoices(); await p.listVoices();
    assert.equal(srv.calls.filter((c) => c.url.includes('/voices')).length, 1);
});

// ---------------------------------------------------------------------------
// The request shape -- the inferred part, pinned
// ---------------------------------------------------------------------------

test('synthesis POSTs the OpenAI audio shape to /v1/audio/speech', async () => {
    const srv = studio({ voices: [{ id: 'nuru-clone', language: 'sw' }] });
    const p = make({}, srv);
    const [voice] = await p.listVoices();
    await p.synthesize({ text: 'Habari ya asubuhi.', voice });
    const post = srv.calls.find((c) => c.method === 'POST');
    assert.ok(post, 'synthesis must POST');
    assert.match(post.url, /\/v1\/audio\/speech$/);
    assert.deepEqual(post.body, {
        model: 'voicestudio',
        input: 'Habari ya asubuhi.',
        voice: 'nuru-clone',
        response_format: 'wav',
    });
});

test('every path and field name is overridable, so a moved route is one line', async () => {
    const srv = studio({ voices: [{ id: 'v1' }] });
    const p = make({
        speechPath: '/api/tts', voicesPath: '/api/voices',
        model: 'omni', format: 'mp3',
        fields: { model: 'engine', text: 'text', voice: 'speaker', format: 'fmt' },
    }, srv);
    const [voice] = await p.listVoices();
    await p.synthesize({ text: 'x', voice });
    const post = srv.calls.find((c) => c.method === 'POST');
    assert.match(post.url, /\/api\/tts$/);
    assert.deepEqual(post.body, { engine: 'omni', text: 'x', speaker: 'v1', fmt: 'mp3' });
});

test('the decoded buffer comes back, and is cached per (voice, text)', async () => {
    const srv = studio({ voices: [{ id: 'v' }], speech: wav(9600) });
    const p = make({}, srv);
    const [voice] = await p.listVoices();
    const a = await p.synthesize({ text: 'moja', voice });
    const b = await p.synthesize({ text: 'moja', voice });
    assert.ok(a.audioBuffer);
    assert.equal(a.audioBuffer, b.audioBuffer, 'the same line is not re-synthesised');
    assert.equal(a.phonemes, null, 'no timings, so lipsync uses the text tier');
    assert.equal(srv.calls.filter((c) => c.method === 'POST').length, 1);
    await p.synthesize({ text: 'mbili', voice });
    assert.equal(srv.calls.filter((c) => c.method === 'POST').length, 2,
        'a different line IS synthesised');
});

// ---------------------------------------------------------------------------
// Failures that must be loud rather than silent
// ---------------------------------------------------------------------------

test('a tiny response is an error, not a silent empty line', async () => {
    // The failure that matters: a server that answers 200 with nothing would
    // otherwise render a silent line and look like it worked.
    const p = make({}, studio({ voices: [{ id: 'v' }], speech: wav(8) }));
    const [voice] = await p.listVoices();
    await assert.rejects(() => p.synthesize({ text: 'x', voice }), /too short to be speech/);
});

test('synthesising with no voice is refused outright', async () => {
    const p = make({}, studio());
    await assert.rejects(() => p.synthesize({ text: 'x', voice: null }), /no voice selected/);
});

test('empty text costs nothing', async () => {
    const srv = studio({ voices: [{ id: 'v' }] });
    const p = make({}, srv);
    assert.equal(await p.synthesize({ text: '', voice: { id: 'v' } }), null);
    assert.equal(srv.calls.filter((c) => c.method === 'POST').length, 0);
});

// ---------------------------------------------------------------------------
// probe(): "not running" and "running but wrong" must not look the same
// ---------------------------------------------------------------------------

test('probe reports unreachable distinctly from reachable-but-empty', async () => {
    const down = await make({ fetchImpl: async () => { throw new Error('x'); } }).probe();
    assert.equal(down.reachable, false);
    assert.ok(down.notes.some((n) => n.includes('failed')));

    const up = await make({}, studio({ voices: [
        { id: 'a', cloned: true, language: 'sw' }, { id: 'b', language: 'en' },
    ] })).probe();
    assert.equal(up.reachable, true);
    assert.equal(up.voices, 2);
    assert.equal(up.cloned, 1);
    assert.deepEqual(up.languages, ['en', 'sw']);
});

test('probe always states the consent and output-licence caveats', async () => {
    const up = await make({}, studio({ voices: [{ id: 'a' }] })).probe();
    assert.ok(up.notes.some((n) => /agreed to it/i.test(n)),
        'cloning consent must be stated every time, not buried in a doc');
    assert.ok(up.notes.some((n) => /licensed by the MODEL/i.test(n)));
});

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

test('a "voicestudio:<id>" spec routes to this provider', async () => {
    const reg = new VoiceRegistry();
    const p = make({}, studio({ voices: [{ id: 'nuru-clone', language: 'sw' }] }));
    reg.register(p);
    const voice = await reg.resolve('voicestudio:nuru-clone');
    assert.equal(voice.provider, 'voicestudio');
    assert.equal(voice.id, 'nuru-clone');
    assert.equal(voice.lang, 'sw');
});

test('a spec naming a voice the studio has not got still resolves, so it fails loudly later', async () => {
    const reg = new VoiceRegistry();
    reg.register(make({}, studio({ voices: [{ id: 'other' }] })));
    const voice = await reg.resolve('voicestudio:missing');
    assert.equal(voice.id, 'missing', 'the registry does not silently substitute another voice');
});
