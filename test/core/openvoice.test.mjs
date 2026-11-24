import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { OpenVoiceProvider } from '../../src/core/voice/providers/OpenVoiceProvider.js';

/**
 * OpenVoice V2, against a stub server that speaks its protocol.
 *
 * Why a stub and not the real thing: OpenVoice is a Python application with a
 * GPU preference that a person installs and starts. It cannot be a test
 * dependency, and a provider that has only ever been read is a provider that
 * has never been shown to work. What CAN be tested without it is the half we
 * wrote -- the request we send, the two response shapes we accept, and what
 * we do when the server is wrong -- which is where every bug of ours would
 * be.
 *
 * The shapes below are the contract this engine expects of a server:
 *
 *   GET  /voices -> [{ id, name, language, reference }] or { voices: [...] }
 *   POST /tts    -> audio/wav bytes, or { audio: <base64>, phonemes? }
 */

/** A server that records what it was asked and answers how it is told to. */
async function stub(handler) {
    const seen = [];
    const srv = createServer(async (req, res) => {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null;
        seen.push({ method: req.method, url: req.url, body });
        handler(req, res, body);
    });
    await new Promise((r) => srv.listen(0, '127.0.0.1', r));
    return { seen, base: `http://127.0.0.1:${srv.address().port}`,
             close: () => srv.close() };
}

const wavBytes = () => {
    const b = Buffer.alloc(64);
    b.write('RIFF', 0); b.write('WAVE', 8);
    return b;
};
/** `decode` just reports what it was handed: the bytes are the point. */
const decode = async (bytes) => ({
    byteLength: bytes.byteLength ?? bytes.length,
    sampleRate: 48000, length: 8, duration: 1, numberOfChannels: 1,
    getChannelData: () => new Float32Array(8),
});

test('OpenVoiceProvider against a stub server', async (t) => {
    await t.test('available() asks /voices and believes the status', async () => {
        const up = await stub((req, res) => {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end('{"voices":[]}');
        });
        const p = new OpenVoiceProvider({ baseUrl: up.base, decode });
        assert.equal(await p.available(), true);
        assert.equal(up.seen[0].url, '/voices');
        up.close();

        const down = await stub((req, res) => { res.writeHead(503).end(); });
        const q = new OpenVoiceProvider({ baseUrl: down.base, decode });
        assert.equal(await q.available(), false);
        down.close();
    });

    await t.test('a server that is not there is unavailable, not an exception', async () => {
        // The registry calls `available()` to build the ladder, so it must
        // never throw: a closed port would otherwise take the whole render
        // down instead of falling through to Piper.
        const p = new OpenVoiceProvider({ baseUrl: 'http://127.0.0.1:1', decode });
        assert.equal(await p.available(), false);
    });

    await t.test('listVoices accepts both shapes a server might send', async () => {
        for (const body of ['[{"id":"a","name":"A","language":"fr"}]',
                            '{"voices":[{"id":"a","name":"A","language":"fr"}]}']) {
            const s = await stub((req, res) => {
                res.writeHead(200, { 'content-type': 'application/json' });
                res.end(body);
            });
            const p = new OpenVoiceProvider({ baseUrl: s.base, decode });
            const list = await p.listVoices();
            assert.equal(list.length, 1, body);
            assert.equal(list[0].lang, 'fr');
            s.close();
        }
    });

    await t.test('the POST carries everything a clone needs', async () => {
        const s = await stub((req, res) => {
            res.writeHead(200, { 'content-type': 'audio/wav' });
            res.end(wavBytes());
        });
        const p = new OpenVoiceProvider({ baseUrl: s.base, decode,
                                          reference: 'refs/default.wav' });
        await p.synthesize({ text: 'Bonjour.',
                             voice: { id: 'a', lang: 'fr', speed: 0.9 } });
        const sent = s.seen.at(-1);
        assert.equal(sent.method, 'POST');
        assert.equal(sent.url, '/tts');
        assert.deepEqual(sent.body, { text: 'Bonjour.', voice: 'a', language: 'fr',
                                      speed: 0.9, reference: 'refs/default.wav' });
        s.close();
    });

    await t.test("a voice's own reference beats the provider default", async () => {
        // Casting two characters on two cloned people is the whole point of
        // this engine; a provider-wide reference that won would give both of
        // them the same voice.
        const s = await stub((req, res) => {
            res.writeHead(200, { 'content-type': 'audio/wav' });
            res.end(wavBytes());
        });
        const p = new OpenVoiceProvider({ baseUrl: s.base, decode, reference: 'default.wav' });
        await p.synthesize({ text: 'x', voice: { id: 'b', ref: 'refs/mine.wav' } });
        assert.equal(s.seen.at(-1).body.reference, 'refs/mine.wav');
        s.close();
    });

    await t.test('raw wav bytes are decoded', async () => {
        const s = await stub((req, res) => {
            res.writeHead(200, { 'content-type': 'audio/wav' });
            res.end(wavBytes());
        });
        const p = new OpenVoiceProvider({ baseUrl: s.base, decode });
        const out = await p.synthesize({ text: 'x', voice: { id: 'a' } });
        assert.equal(out.audioBuffer.byteLength, 64);
        assert.equal(out.phonemes, null);
        s.close();
    });

    await t.test('a base64 JSON body is decoded, and its timings kept', async () => {
        /**
         * The timings are the reason to accept the JSON shape at all: they
         * upgrade lipsync from the estimated tier to the exact one, and a
         * server that sends them should not have them thrown away.
         */
        const s = await stub((req, res) => {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ audio: wavBytes().toString('base64'),
                                     phonemes: [{ p: 'b', t: 0 }] }));
        });
        const p = new OpenVoiceProvider({ baseUrl: s.base, decode });
        const out = await p.synthesize({ text: 'x', voice: { id: 'a' } });
        assert.equal(out.audioBuffer.byteLength, 64);
        assert.equal(out.phonemes.length, 1);
        s.close();
    });

    await t.test('a 500 THROWS rather than returning silence', async () => {
        /**
         * The difference that matters: a null here reads as "this voice had
         * nothing to say" and renders a silent line with a subtitle, which is
         * the Phase 37 defect -- an advert shipped with every line silent and
         * reported success. A throw is caught per line, reported, and the
         * ladder substitutes.
         */
        const s = await stub((req, res) => { res.writeHead(500).end('boom'); });
        const p = new OpenVoiceProvider({ baseUrl: s.base, decode });
        await assert.rejects(() => p.synthesize({ text: 'x', voice: { id: 'a' } }),
                             /500/);
        s.close();
    });

    await t.test('a JSON body with no audio field is nothing, not a crash', async () => {
        const s = await stub((req, res) => {
            res.writeHead(200, { 'content-type': 'application/json' });
            res.end('{"error":"no reference supplied"}');
        });
        const p = new OpenVoiceProvider({ baseUrl: s.base, decode });
        assert.equal(await p.synthesize({ text: 'x', voice: { id: 'a' } }), null);
        s.close();
    });

    await t.test('no baseUrl at all is simply not configured', async () => {
        const p = new OpenVoiceProvider({ baseUrl: null, decode });
        assert.equal(await p.available(), false);
        assert.equal(await p.synthesize({ text: 'x', voice: { id: 'a' } }), null);
    });
});
