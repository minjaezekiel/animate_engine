/**
 * One headless Chrome at a time, across every script in this repo.
 *
 * ## Why
 *
 * A full-size render is a headless Chrome holding the whole offline audio
 * mix, a 1080x1920 canvas and the muxed output in memory at once. Two of
 * those on a 16 GB laptop -- which already has the author's own Chrome
 * resident -- is enough for the kernel to take one, and what you see is
 * `TargetCloseError: Target closed` from whichever lost. That message says
 * nothing about the cause, and because it can arrive *after* the file is
 * already on disk it looks exactly like a broken film.
 *
 * Measured, not assumed: two 480x270 renders coexist happily and one
 * 1080x1920 render is fine on its own. The limit is memory, not the design,
 * so forbidding concurrency outright would be wrong. This serialises by
 * default and `RENDER_LOCK=0` turns it off for a machine with the headroom.
 * When nothing else is running the whole cost is one file create.
 *
 * ## Why it is shared rather than per-script
 *
 * The render that started this was not killed by another render. It was
 * killed by `test:e2e`, which launches its own Chrome. A lock that only
 * `produce.mjs` respects would have let exactly that happen again, so every
 * script here that launches a heavy headless Chrome takes the same one.
 *
 * ## Waiting, not failing
 *
 * `for f in *.json; do produce "$f" & done` is the thing a person actually
 * types. Failing the second one teaches them to stop doing it; waiting just
 * makes it work, a little slower, which is what they wanted.
 *
 * A holder that has died -- killed, crashed, Ctrl-C'd -- is detected by pid
 * and stepped over. A lock that can strand the next run forever is one
 * people delete by hand, and then stop trusting.
 *
 * ## Scope: per user, not per machine
 *
 * `os.tmpdir()` is `$TMPDIR`, which on macOS is a per-user directory under
 * `/var/folders`, not `/tmp`. So two people logged into the same machine do
 * not share this lock even though they do share its memory. That is the
 * right trade: a world-writable lock in `/tmp` is one any account can hold
 * forever, and the case it would protect -- two developers rendering films
 * on one laptop at the same moment -- is not one worth that.
 */
import { readFileSync, unlinkSync } from 'node:fs';
import { open, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LOCK_PATH = join(tmpdir(), 'jirex-headless.lock');
const ENABLED = process.env.RENDER_LOCK !== '0';
/** Long enough for any real render; short enough to recover from a kill -9. */
const STALE_MS = 45 * 60 * 1000;

const alive = (pid) => {
    try { process.kill(pid, 0); return true; } catch { return false; }
};

/** Give the lock back, but only while it is still ours. */
export function releaseLock() {
    if (!ENABLED) return;
    try {
        // A lock we were stepped over for belongs to whoever took it next,
        // and deleting that would hand two renders the go-ahead at once.
        if (Number(readFileSync(LOCK_PATH, 'utf8')) === process.pid) unlinkSync(LOCK_PATH);
    } catch { /* already gone, or never ours */ }
}

/**
 * Wait for the lock, take it, and arrange to give it back on any exit.
 *
 * @param {string} what  named in the waiting message, so a person who comes
 *                       back to a stalled terminal can see what it is for.
 */
export async function acquireLock(what = 'a headless Chrome job') {
    if (!ENABLED) return;
    let waited = false;
    for (;;) {
        try {
            const fh = await open(LOCK_PATH, 'wx');
            await fh.writeFile(String(process.pid));
            await fh.close();
            if (waited) console.log('  lock acquired, starting');
            process.on('exit', releaseLock);
            for (const sig of ['SIGINT', 'SIGTERM']) {
                process.on(sig, () => { releaseLock(); process.exit(130); });
            }
            return;
        } catch (e) {
            if (e.code !== 'EEXIST') throw e;
            const held = Number(await readFile(LOCK_PATH, 'utf8').catch(() => '')) || 0;
            const age = await stat(LOCK_PATH)
                .then((st) => Date.now() - st.mtimeMs).catch(() => Infinity);
            if (!held || !alive(held) || age > STALE_MS) {
                await rm(LOCK_PATH, { force: true });
                continue;
            }
            if (!waited) {
                waited = true;
                console.log(`  another headless Chrome job is running (pid ${held}); `
                    + `waiting before ${what}.`);
                console.log('  RENDER_LOCK=0 to go ahead anyway, if this machine has '
                    + 'the memory.');
            }
            await new Promise((r) => { setTimeout(r, 2000); });
        }
    }
}
