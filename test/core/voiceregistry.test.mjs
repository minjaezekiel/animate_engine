import test from 'node:test';
import assert from 'node:assert/strict';

import { VoiceRegistry } from '../../src/core/voice/VoiceRegistry.js';

/**
 * The fallback ladder, and what it costs.
 *
 * The first version of the "a down provider must not break the ladder" fix
 * was correct and not performant: it guarded the call and cached nothing, so
 * a provider that was down got asked again for EVERY line -- measured at 3
 * network attempts per line, 75 for a 25-line film. Against a closed port
 * that is instant; against a host that hangs rather than refusing, each one
 * waits out the provider's timeout and the render never finishes.
 *
 * These tests pin the cost, not just the behaviour.
 */

/** A provider that counts how often it is asked. */
function counted(id, { available = true, voices = [{ id: `${id}-v` }],
                       throws = false, delayMs = 0 } = {}) {
    const p = {
        id, source: 'tts', calls: { available: 0, listVoices: 0, synthesize: 0 },
        async available() {
            p.calls.available++;
            if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
            if (throws) throw new Error('ECONNREFUSED');
            return available;
        },
        async listVoices() {
            p.calls.listVoices++;
            if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
            if (throws) throw new Error('ECONNREFUSED');
            return voices.map((v) => ({ provider: id, lang: 'en', tags: [], ...v }));
        },
        async synthesize({ text }) {
            p.calls.synthesize++;
            return { audioBuffer: { from: id, text }, phonemes: null };
        },
    };
    return p;
}

// ---------------------------------------------------------------------------
// The guarantee
// ---------------------------------------------------------------------------

test('a provider that THROWS does not take the ladder down with it', () => {
    // The defect this whole file exists for. Unguarded, `resolve()` let a
    // throwing `listVoices()` reject the render.
    const reg = new VoiceRegistry();
    const down = counted('voicestudio', { throws: true });
    const piper = counted('tts', { voices: [{ id: 'sw' }] });
    reg.register(down).register(piper);
    return reg.synthesize('voicestudio:nuru-clone', { text: 'habari' })
        .then((out) => {
            assert.equal(out.audioBuffer.from, 'tts',
                'a film cast against an absent provider must still render');
        });
});

test('a named voice is not silently swapped for someone else at resolve time', async () => {
    const reg = new VoiceRegistry();
    reg.register(counted('voicestudio', { throws: true }));
    const voice = await reg.resolve('voicestudio:nuru-clone');
    assert.equal(voice.id, 'nuru-clone');
    assert.equal(voice.provider, 'voicestudio',
        'resolve must name the asked-for voice, and let synthesize decide');
});

// ---------------------------------------------------------------------------
// The cost
// ---------------------------------------------------------------------------

test('a down provider is probed ONCE for a whole film, not once per line', async () => {
    const reg = new VoiceRegistry();
    const down = counted('voicestudio', { throws: true });
    reg.register(down).register(counted('tts'));
    for (let i = 0; i < 25; i++) {
        await reg.synthesize('voicestudio:x', { text: `line ${i}` });
    }
    const total = down.calls.available + down.calls.listVoices;
    assert.ok(total <= 2,
        `25 lines cost ${total} attempts against a dead host; before the memo it was 75`);
});

test('concurrent lines share ONE in-flight probe, rather than stampeding', async () => {
    // The TTL alone cannot prevent this: in parallel, none of the attempts
    // has settled yet, so every one of them would start its own connection.
    const reg = new VoiceRegistry();
    const slow = counted('slow', { available: false, delayMs: 30 });
    reg.register(slow).register(counted('tts'));
    await Promise.all(Array.from({ length: 20 },
        (_, i) => reg.synthesize('slow:v', { text: `t${i}` })));
    assert.equal(slow.calls.available, 1);
});

test('a healthy provider is not re-listed per line either', async () => {
    const reg = new VoiceRegistry();
    const piper = counted('tts', { voices: [{ id: 'sw' }] });
    reg.register(piper);
    for (let i = 0; i < 25; i++) await reg.synthesize('tts:sw', { text: `l${i}` });
    assert.ok(piper.calls.listVoices <= 2, `listed ${piper.calls.listVoices} times`);
    assert.equal(piper.calls.synthesize, 25, 'but every line is still synthesised');
});

// ---------------------------------------------------------------------------
// Freshness: a cache that never expires is its own bug
// ---------------------------------------------------------------------------

test('the memo expires, so a provider that comes up is noticed', async () => {
    let clock = 0;
    const reg = new VoiceRegistry({ statusTtlMs: 100, now: () => clock });
    const p = counted('x', { available: false });
    reg.register(p);
    await reg.isAvailable(p);
    await reg.isAvailable(p);
    assert.equal(p.calls.available, 1, 'within the TTL, one probe');
    clock = 500;
    await reg.isAvailable(p);
    assert.equal(p.calls.available, 2, 'past the TTL, it asks again');
});

test('invalidate() forces an immediate re-probe, for "I just started it"', async () => {
    const reg = new VoiceRegistry();
    const p = counted('x', { available: false });
    reg.register(p);
    await reg.isAvailable(p);
    reg.invalidate('x');
    await reg.isAvailable(p);
    assert.equal(p.calls.available, 2);
    reg.invalidate();
    await reg.isAvailable(p);
    assert.equal(p.calls.available, 3, 'invalidate() with no argument clears everything');
});

test('statusTtlMs 0 disables the memo outright', async () => {
    const reg = new VoiceRegistry({ statusTtlMs: 0 });
    const p = counted('x', { available: false });
    reg.register(p);
    await reg.isAvailable(p);
    await reg.isAvailable(p);
    assert.equal(p.calls.available, 2);
});

test('registering a provider clears any stale verdict about it', async () => {
    const reg = new VoiceRegistry();
    const dead = counted('x', { available: false });
    reg.register(dead);
    await reg.isAvailable(dead);
    const live = counted('x', { available: true });
    reg.register(live);
    assert.equal(await reg.isAvailable(live), true,
        'a replacement provider must not inherit its predecessor\'s verdict');
});

// ---------------------------------------------------------------------------
// Visibility: a fallback the author cannot see is one they cannot fix
// ---------------------------------------------------------------------------

test('a skipped provider is REPORTED, not silently swallowed', async () => {
    const reg = new VoiceRegistry();
    reg.register(counted('voicestudio', { throws: true })).register(counted('tts'));
    await reg.synthesize('voicestudio:x', { text: 'hi' });
    const notes = reg.diagnostics();
    assert.ok(notes.length > 0, 'the author must be able to see why the voice changed');
    assert.ok(notes.every((d) => d.path === 'voices.voicestudio'));
    assert.ok(notes.some((d) => /ECONNREFUSED/.test(d.message)),
        'the real reason, not a generic one');
    // TWO different notes, and the difference is the point. That an optional
    // provider is absent is expected -- `info`. That a line consequently came
    // out in somebody else's voice is not -- `warning`. Asserting everything
    // was `info` conflated them, and it is the warning that makes a film cast
    // against a local voice server fail visibly instead of quietly.
    const skipped = notes.filter((d) => /Falling back to the next provider/.test(d.message));
    const swapped = notes.filter((d) => /spoken by/.test(d.message));
    assert.ok(skipped.length > 0 && skipped.every((d) => d.severity === 'info'),
        'an absent optional provider is expected, not an error');
    assert.equal(swapped.length, 1, 'the substitution itself is reported exactly once');
    assert.equal(swapped[0].severity, 'warning',
        'a line in the wrong voice is a defect, not a note');
});

// ---------------------------------------------------------------------------
// Substitution: the failure that otherwise looks exactly like success
// ---------------------------------------------------------------------------

test('a substituted voice is named in the result, not just in the notes', async () => {
    const reg = new VoiceRegistry();
    reg.register(counted('voicestudio', { throws: true }))
       .register(counted('tts', { voices: [{ id: 'alba' }] }));
    const out = await reg.synthesize('voicestudio:asha-en', { text: 'hi' });
    assert.equal(out.audioBuffer.from, 'tts', 'it still renders');
    assert.deepEqual(out.substituted, { requested: 'voicestudio:asha-en', actual: 'tts:alba' },
        'and it says whose voice that actually was');
});

test('the happy path reports no substitution', async () => {
    const reg = new VoiceRegistry();
    reg.register(counted('a', { voices: [{ id: 'one' }] }));
    const out = await reg.synthesize('a:one', { text: 'hello' });
    assert.equal(out.substituted, null);
    assert.equal(reg.diagnostics().filter((d) => d.severity === 'warning').length, 0);
});

test('allowFallback:false renders SILENT rather than in the wrong voice', async () => {
    const reg = new VoiceRegistry();
    reg.register(counted('voicestudio', { throws: true }))
       .register(counted('tts', { voices: [{ id: 'alba' }] }));
    const out = await reg.synthesize('voicestudio:asha-sw',
                                     { text: 'habari', allowFallback: false });
    assert.equal(out, null, 'a silent line is a bug you notice; a stand-in is one you ship');
    const warn = reg.diagnostics().filter((d) => d.severity === 'warning');
    assert.equal(warn.length, 1);
    assert.match(warn[0].message, /Rendering silent rather than in the wrong voice/);
});

test('allowFallback:false does not punish a voice that CAN speak', async () => {
    // Strictness must cost nothing on the happy path, or nobody turns it on.
    const reg = new VoiceRegistry();
    reg.register(counted('voicestudio', { voices: [{ id: 'asha-sw' }] }))
       .register(counted('tts', { voices: [{ id: 'alba' }] }));
    const out = await reg.synthesize('voicestudio:asha-sw',
                                     { text: 'habari', allowFallback: false });
    assert.equal(out.audioBuffer.from, 'voicestudio');
    assert.equal(out.substituted, null);
    assert.equal(reg.diagnostics().filter((d) => d.severity === 'warning').length, 0);
});

test('one warning per swap, not one per line, over a long render', async () => {
    const reg = new VoiceRegistry();
    reg.register(counted('voicestudio', { throws: true }))
       .register(counted('tts', { voices: [{ id: 'alba' }] }));
    for (let i = 0; i < 200; i++) await reg.synthesize('voicestudio:x', { text: `l${i}` });
    const warn = reg.diagnostics().filter((d) => d.severity === 'warning');
    assert.equal(warn.length, 1, `200 lines produced ${warn.length} warnings`);
});

test('diagnostics do not grow without bound over a long render', async () => {
    const reg = new VoiceRegistry();
    reg.register(counted('voicestudio', { throws: true })).register(counted('tts'));
    for (let i = 0; i < 200; i++) await reg.synthesize('voicestudio:x', { text: `l${i}` });
    assert.ok(reg.diagnostics().length <= 4,
        `200 lines produced ${reg.diagnostics().length} notes; one per reason is enough`);
});

test('diagnostics are plain data, and the internal key is not leaked', async () => {
    const reg = new VoiceRegistry();
    reg.register(counted('x', { throws: true }));
    await reg.synthesize('x:v', { text: 'hi' });
    for (const d of reg.diagnostics()) {
        assert.deepEqual(Object.keys(d).sort(), ['message', 'path', 'severity']);
    }
});

// ---------------------------------------------------------------------------
// Unchanged behaviour
// ---------------------------------------------------------------------------

test('the happy path is untouched: the named provider gets the line', async () => {
    const reg = new VoiceRegistry();
    const a = counted('a', { voices: [{ id: 'one' }] });
    reg.register(a).register(counted('b'));
    const out = await reg.synthesize('a:one', { text: 'hello' });
    assert.equal(out.audioBuffer.from, 'a');
    assert.equal(a.calls.synthesize, 1);
});

test('a bare provider id with no voice takes that provider first voice', async () => {
    const reg = new VoiceRegistry();
    reg.register(counted('a', { voices: [{ id: 'first' }, { id: 'second' }] }));
    assert.equal((await reg.resolve('a')).id, 'first');
});

test('an unknown provider resolves to nothing', async () => {
    const reg = new VoiceRegistry();
    reg.register(counted('a'));
    assert.equal(await reg.resolve('nope:x'), null);
    assert.equal(await reg.resolve(''), null);
    assert.equal(await reg.resolve(null), null);
});

test('listVoices gathers across providers and skips the sulking ones', async () => {
    const reg = new VoiceRegistry();
    reg.register(counted('a', { voices: [{ id: 'a1' }] }))
       .register(counted('bad', { throws: true }))
       .register(counted('c', { voices: [{ id: 'c1' }, { id: 'c2' }] }));
    const all = await reg.listVoices();
    assert.deepEqual(all.map((v) => v.id), ['a1', 'c1', 'c2']);
});

test('with every provider down, synthesize returns null rather than throwing', async () => {
    const reg = new VoiceRegistry();
    reg.register(counted('a', { throws: true })).register(counted('b', { throws: true }));
    assert.equal(await reg.synthesize('a:x', { text: 'hi' }), null);
});
