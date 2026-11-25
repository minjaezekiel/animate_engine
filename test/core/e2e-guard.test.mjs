/**
 * The e2e guard: a hang must become a failure.
 *
 * These assertions exist because `test:legacy` ran for 2h31m, twice, without
 * ever producing a pass, a fail, or a line of output -- it finished all forty
 * of its assertions in under three seconds and then stopped forever inside
 * `browser.close()`, because headless Chrome will not exit once its download
 * manager has seen a download. A test with a third outcome of "never" is
 * worse than a failing one: it stalls a queue and reports nothing.
 *
 * The guard is exercised in a CHILD PROCESS, because what it does on expiry
 * is SIGKILL the process it is guarding. That is the behaviour under test and
 * it cannot be observed from inside.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeBrowser, startGuard } from '../e2e/lib/guard.mjs';

const GUARD = fileURLToPath(new URL('../e2e/lib/guard.mjs', import.meta.url));

/** Run a snippet that imports the guard, and report how it died. */
async function child(body, { timeoutMs = 15_000 } = {}) {
    const dir = await mkdtemp(join(tmpdir(), 'guard-'));
    const file = join(dir, 'case.mjs');
    /**
     * `keepalive()` models what a REAL hang looks like.
     *
     * A bare `await new Promise(() => {})` is not a hang: with nothing in the
     * loop Node notices the await can never settle and exits by itself. The
     * hang this guard is for had Chrome's pipe and an HTTP server open, so the
     * loop stayed alive forever and only a deadline could end it. (That is
     * also why the deadline is unref'd: when the loop does empty, Node's own
     * exit is quicker and tidier than ours.)
     */
    await writeFile(file, `import { startGuard, closeBrowser } from ${JSON.stringify(GUARD)};
const keepalive = () => { const t = setInterval(() => {}, 50); return () => clearInterval(t); };
${body}
`);
    return new Promise((resolve) => {
        execFile(process.execPath, [file], { timeout: timeoutMs },
            (err, stdout, stderr) => resolve({
                code: err?.code ?? 0,
                signal: err?.signal ?? null,
                stdout, stderr,
                // `timeout` above is the LAST resort: if it fires, the guard
                // failed to bound the child, which is the whole point.
                harnessHadToKill: err?.killed === true && err?.signal === 'SIGTERM',
            }));
    });
}

test('a hang is killed, and the message names the stage it hung in', async () => {
    const r = await child(`
        const g = startGuard({ ms: 400, name: 'hang-case' });
        g.stage('closing the browser');
        keepalive();
        await new Promise(() => {});   // exactly what browser.close() did
        console.log('UNREACHABLE');
    `);
    assert.equal(r.signal, 'SIGKILL', 'the guard must kill a hung process');
    assert.ok(!r.harnessHadToKill, 'the guard, not the harness, must end it');
    assert.match(r.stderr, /TIMED OUT: hang-case passed 0s/);
    assert.match(r.stderr, /stage "closing the browser"/);
    assert.match(r.stderr, /a hang, not a slow test/);
    assert.doesNotMatch(r.stdout, /UNREACHABLE/);
});

test('teardown runs on the way out of a hang', async () => {
    const r = await child(`
        const g = startGuard({ ms: 300, name: 'cleanup-case' });
        g.onCleanup(() => console.log('CLOSED BROWSER'));
        g.onCleanup(async () => { await new Promise(r => setTimeout(r, 10)); console.log('CLOSED SERVER'); });
        g.stage('work');
        keepalive();
        await new Promise(() => {});
    `);
    assert.match(r.stdout, /CLOSED BROWSER/, 'a hung run must still close its browser');
    assert.match(r.stdout, /CLOSED SERVER/, 'async cleanups must be awaited before the kill');
});

test('a cleanup that itself throws does not stop the others', async () => {
    const r = await child(`
        const g = startGuard({ ms: 300, name: 'bad-cleanup' });
        g.onCleanup(() => { throw new Error('close failed'); });
        g.onCleanup(() => console.log('SECOND RAN'));
        g.stage('work');
        keepalive();
        await new Promise(() => {});
    `);
    assert.match(r.stdout, /SECOND RAN/);
    assert.equal(r.signal, 'SIGKILL');
});

test('an unhandled throw tears down and exits 1, not 0', async () => {
    // Nine of the ten e2e scripts had no `finally`, so a FAILING assertion --
    // the ordinary outcome -- leaked a browser.
    const r = await child(`
        const g = startGuard({ ms: 30_000, name: 'throw-case' });
        g.onCleanup(() => console.log('TORN DOWN'));
        g.stage('asserting');
        throw new Error('an assertion blew up');
    `);
    assert.equal(r.code, 1, 'a throw must still be a failure');
    assert.match(r.stdout, /TORN DOWN/, 'a throw must not leak the browser');
    assert.match(r.stderr, /threw in stage "asserting"/);
});

test('the deadline does not hold the process open', async () => {
    // Unref'd on purpose: a script that finishes in 3s must exit in 3s, not
    // sit until its 180s ceiling.
    const t0 = Date.now();
    const r = await child(`
        const g = startGuard({ ms: 60_000, name: 'fast-case' });
        g.stage('work');
        const stop = keepalive();
        await g.done();
        stop();
        console.log('DONE');
    `);
    const elapsed = Date.now() - t0;
    assert.match(r.stdout, /DONE/);
    assert.equal(r.code, 0);
    assert.ok(elapsed < 10_000, `finished early but took ${elapsed}ms`);
});

test('done() is idempotent, so cleanups run once', async () => {
    const r = await child(`
        const g = startGuard({ ms: 30_000, name: 'twice' });
        g.onCleanup(() => console.log('TEARDOWN'));
        await g.done(); await g.done(); await g.done();
    `);
    assert.equal((r.stdout.match(/TEARDOWN/g) ?? []).length, 1);
});

test('closeBrowser kills a browser that refuses to close', async () => {
    // The real failure: close() is a REQUEST. Chrome holding a download open
    // never answers it, and puppeteer waits forever.
    let killedWith = null;
    const browser = {
        close: () => new Promise(() => {}),              // never resolves
        process: () => ({ exitCode: null, kill: (s) => { killedWith = s; } }),
    };
    const t0 = Date.now();
    await closeBrowser(browser, { graceMs: 120 });
    assert.equal(killedWith, 'SIGKILL');
    assert.ok(Date.now() - t0 < 5_000, 'closeBrowser must not wait on a wedged browser');
});

test('closeBrowser leaves a browser that closes politely alone', async () => {
    let killedWith = null;
    let closed = false;
    const browser = {
        close: async () => { closed = true; },
        process: () => ({ exitCode: 0, kill: (s) => { killedWith = s; } }),
    };
    await closeBrowser(browser, { graceMs: 5_000 });
    assert.ok(closed);
    assert.equal(killedWith, null, 'a browser that already exited must not be signalled');
});

test('closeBrowser survives a browser that throws, and a missing one', async () => {
    let killedWith = null;
    await closeBrowser({
        close: async () => { throw new Error('already gone'); },
        process: () => ({ exitCode: null, kill: (s) => { killedWith = s; } }),
    }, { graceMs: 50 });
    assert.equal(killedWith, 'SIGKILL');
    // A launch that failed leaves nothing to close; that must not throw.
    await closeBrowser(null);
    await closeBrowser({ close: async () => {} });
});

test('the guard is cheap enough to put in every script', () => {
    const g = startGuard({ ms: 1000, name: 'shape' });
    assert.equal(typeof g.stage, 'function');
    assert.equal(typeof g.onCleanup, 'function');
    assert.equal(typeof g.done, 'function');
    assert.equal(g.stage('named'), 'named', 'stage() returns its label so it can be inlined');
    return g.done();
});
