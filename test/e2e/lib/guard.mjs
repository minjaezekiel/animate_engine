/**
 * A wall clock and a guaranteed teardown for an end-to-end script.
 *
 * # Why this exists
 *
 * `npm run test:legacy` hung for 2h31m, twice, and had to be killed by hand.
 * It was not slow. Every one of its forty assertions completed in under three
 * seconds; the script then reached `await browser.close()` and stopped there
 * forever, at 0% CPU, holding two Chrome processes.
 *
 * The cause was that the test's two export assertions each triggered a real
 * download -- `downloadBlob` clicks an `<a download>` -- and **headless Chrome
 * will not shut down while its download manager has seen one.** Nothing in the
 * script could notice: a hang is not a failure, so there was no output, no
 * exit code, and nothing to read. Meanwhile the leaked Chrome processes
 * competed for the GPU with whatever rendered next, which is how a 1080p
 * render got OOM-killed.
 *
 * Two lessons, and this file is both of them:
 *
 *   1. **A test that cannot fail cannot be trusted.** An e2e script with no
 *      wall clock has a third outcome besides pass and fail -- "never" -- and
 *      that outcome is the worst one, because it stalls a queue silently
 *      rather than reporting anything. So: a deadline, with the stage it died
 *      in named in the message.
 *
 *   2. **`browser.close()` is a request, not a guarantee.** It asks Chrome to
 *      exit and waits. A browser that refuses -- a download, a modal, a
 *      wedged GPU process -- is waited on indefinitely. So: ask politely,
 *      briefly, then kill the process.
 *
 * None of the ten e2e scripts had either, and nine had no `finally`, so a
 * failed assertion leaked a browser too.
 */

/**
 * Start the clock.
 *
 * `ms` is a ceiling on the WHOLE script, not a per-step timeout: the point is
 * to bound the outcome, not to police individual operations, which
 * `protocolTimeout` already does per call. Pick it generously -- a render
 * script legitimately takes minutes -- because its job is to catch "never",
 * not "slow".
 */
export function startGuard({ ms = 300_000, name = 'e2e' } = {}) {
    let stage = 'startup';
    const cleanups = [];
    let finished = false;

    /**
     * Run every cleanup, even if one of them throws.
     *
     * `Promise.allSettled(cleanups.map((f) => f()))` does NOT do this: the
     * map calls each function eagerly, so a cleanup that throws
     * SYNCHRONOUSLY -- `srv.close()` on a server that never listened, say --
     * escapes before `allSettled` is ever constructed, and every cleanup
     * after it is skipped. Which would mean a failed `browser.close()` leaks
     * the server, the precise class of leak this file exists to stop.
     */
    const teardown = () => Promise.allSettled(
        cleanups.map((f) => Promise.resolve().then(f)));

    const expire = async () => {
        console.error(`\nTIMED OUT: ${name} passed ${Math.round(ms / 1000)}s `
            + `while in stage "${stage}". This is a hang, not a slow test.`);
        await teardown();
        // SIGKILL rather than process.exit: exit() drains the event loop, and
        // the handles a hung browser holds are exactly what will not drain.
        process.kill(process.pid, 'SIGKILL');
    };

    /**
     * Any unhandled throw tears down too.
     *
     * Nine of the ten e2e scripts had no `finally`, so a failed assertion --
     * the ordinary outcome a test is written for -- leaked a browser. Doing
     * it here rather than in each script means a script cannot forget.
     */
    const bail = async (err) => {
        console.error(`\n${name} threw in stage "${stage}":`, err);
        await teardown();
        process.exit(1);
    };
    process.once('uncaughtException', bail);
    process.once('unhandledRejection', bail);

    const timer = setTimeout(expire, ms);
    // Unref'd: the deadline must not be the reason the process stays alive.
    // A script that finishes early should exit early.
    timer.unref?.();

    return {
        /** Name what is happening, so a timeout can say where it died. */
        stage(s) { stage = s; return s; },
        /** Register teardown. Runs on success, on throw, and on timeout. */
        onCleanup(fn) { cleanups.push(fn); return fn; },
        /** Normal end: stop the clock and tear down, once. */
        async done() {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            // Stop intercepting. A guard that has finished its job must not
            // keep swallowing the process's errors into its own teardown
            // path -- and it must not outlive its script when one is
            // imported by something else, such as a test.
            process.off('uncaughtException', bail);
            process.off('unhandledRejection', bail);
            await teardown();
        },
    };
}

/**
 * Close a browser, and mean it.
 *
 * `close()` gets `graceMs` to do the civilised thing -- flush the profile,
 * let the renderer exit -- and then the process is killed outright. The
 * grace period matters: killing immediately can leave a lock file behind in
 * the user data directory.
 */
export async function closeBrowser(browser, { graceMs = 8_000 } = {}) {
    if (!browser) return;
    const proc = browser.process?.();
    try {
        await Promise.race([
            browser.close(),
            // Deliberately NOT unref'd: if close() hangs and nothing else is
            // in the loop, an unref'd timer would let Node exit and leave
            // Chrome orphaned, which is the leak this function prevents.
            new Promise((r) => { setTimeout(r, graceMs); }),
        ]);
    } catch { /* closing a browser that already died is not an error */ }
    try { if (proc && proc.exitCode === null) proc.kill('SIGKILL'); } catch { /* gone */ }
}

/**
 * Stop a page from saving files to the machine running the test.
 *
 * An `<a download>` click in headless Chrome is a real download: it lands in
 * the user's own Downloads folder and it stops the browser from ever
 * shutting down. `test:legacy` had been leaving an `animation (N).gif` and a
 * `frames (N).zip` there on every single run since October -- 32 files --
 * while its own comment claimed it kept the blobs "instead of downloading
 * them". It recorded the blob and then downloaded it anyway.
 *
 * Call this BEFORE exercising any export path. It returns a promise for the
 * filenames that were suppressed, so a test can assert that the download it
 * expected was in fact offered.
 */
export async function suppressDownloads(page) {
    await page.evaluateOnNewDocument(() => {
        window.__downloads = [];
        const origClick = HTMLAnchorElement.prototype.click;
        HTMLAnchorElement.prototype.click = function click() {
            if (this.download) { window.__downloads.push(this.download); return; }
            return origClick.call(this);
        };
    });
    return {
        /** The filenames the page tried to save, in order. */
        offered: () => page.evaluate(() => window.__downloads.slice()),
    };
}
