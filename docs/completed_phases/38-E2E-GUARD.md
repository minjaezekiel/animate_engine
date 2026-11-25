# Phase 43 — a hang becomes a failure

**Done.** `npm run test:legacy` had run for **2 h 31 m**, twice in one
session, without passing and without failing. It now runs in **12 s**, and
`npm run test:all` — which lists it sixth of eleven — is runnable for the
first time in a month.

## It was not slow

The instinct with a 2h31m test is to look for the slow part. There wasn't one.
Instrumenting the four stages showed every one of the script's forty
assertions completing, correctly, in **under three seconds**: the offline
render produced its 48 frames, deterministically; the GIF and the zip were
both built; all thirty-odd interaction-cost numbers came back inside budget.
The script then reached `await br.close()` and stopped there forever, at **0%
CPU**, holding two Chrome processes.

The hang was entirely in teardown, after the last assertion had already been
computed and printed. Which is why reading the test for an expensive loop
would never have found it.

## The cause

Both export assertions call an export path that ends in `downloadBlob`, which
clicks an `<a download>`. In headless Chrome that is a **real download**, and
once Chrome's download manager has seen one, Chrome does not shut down on
`Browser.close` — there is nobody in headless to answer the prompt it wants to
raise. Puppeteer waits on a browser that will never exit.

Two measurements settled it rather than one, because the obvious suspect was
wrong:

| Variant | Result |
|---|---|
| As written | 2 h 31 m, never finished |
| Anchor click suppressed | **2.9 s, exit 0, PASS** |
| Click fires, `revokeObjectURL` deferred 30 s | still hung past 90 s |

The third row is the one that matters: it rules out the immediate
`revokeObjectURL` — the plausible-looking bug — and pins it on the download
itself. So `downloadBlob` is correct in production, and a person clicking
*Export GIF* in a real browser gets their file. The downloads in the test had
in fact been completing: the bytes on disk matched the test's own `gifBytes`
exactly.

## The second defect, found while confirming the first

The test's own comment read *"Keep the files instead of downloading them"*,
and it did not keep them. It recorded the Blob and handed back a live object
URL, so the file downloaded anyway.

Every run since October had been writing `animation (N).gif` and
`frames (N).zip` into the machine's real Downloads folder. **33 files** were
sitting there, one pair per run, sizes matching the test's own output. A test
that writes to a person's home directory is a defect whether or not anything
hangs.

## The fix is general, because the specific bug was the smaller half

A download wedging Chrome is one cause. The reason it cost two and a half
hours twice is that **nothing was watching**, and that was true of all ten
e2e scripts. [`test/e2e/lib/guard.mjs`](../../test/e2e/lib/guard.mjs):

- **A deadline.** Without one, an e2e script has a third outcome besides pass
  and fail — *never* — and it is the worst of the three, because it stalls a
  queue and reports nothing at all. The timeout message names the stage it
  died in, so the next person starts where this investigation ended rather
  than at the beginning. Ceilings are generous (120 s for `test:bundle`,
  900 s for the render scripts): this bounds the outcome, it is not a
  performance budget.
- **`closeBrowser`.** `browser.close()` is a request, not a guarantee. It now
  gets eight seconds of grace — enough to flush the profile and avoid leaving
  a lock file — and then the process is killed outright.
- **Teardown on every path.** Nine of the ten scripts had no `finally`, so a
  *failing* assertion — the ordinary outcome a test is written for — leaked a
  browser too. Registering cleanups with the guard means a script cannot
  forget.
- **`suppressDownloads`.** What the test meant to do, done where it works:
  `evaluateOnNewDocument`, before the page loads. It records what each
  suppressed anchor would have saved, and the test now **asserts both exports
  still offer a file** — so suppressing the save cannot quietly disable the
  thing under test.

All ten scripts are wired to it. `kernels-browser.mjs` names its guard `clock`
because it already had a `guard` of its own, and its dev server is a spawned
child per COEP mode, so the live one is tracked in a binding the cleanup can
reach.

## Two bugs in the guard, found by its tests

Worth recording, because they are the argument for having written the tests at
all — both were invisible on the page and both would have reproduced the
original failure in a new place.

1. **`Promise.allSettled(cleanups.map((f) => f()))` does not do what it
   looks like.** The `map` calls every cleanup *eagerly*, so a cleanup that
   throws **synchronously** — `srv.close()` on a server that never listened —
   escapes before `allSettled` is ever constructed, and every cleanup after it
   is skipped. A failed `browser.close()` would have leaked the server. Fixed
   by deferring each into its own promise.

2. **`closeBrowser`'s grace timer was `unref`'d.** Copied from the deadline,
   where unref is right. Here it is exactly wrong: if `close()` hangs and
   nothing else is in the loop, an unref'd timer lets **Node exit and orphan
   Chrome** — the precise leak the function exists to prevent.

The tests run the guard in a **child process**, because what it does on expiry
is SIGKILL the process it guards, and that cannot be observed from inside.
They also had to learn that a bare `await new Promise(() => {})` is *not* a
hang: with nothing in the loop Node notices the await can never settle and
exits by itself. A real hang holds handles — Chrome's pipe, an HTTP server —
so the cases hold a ref'd interval to model it. That is also the proof that
unref'ing the deadline is safe: when the loop does empty, Node's own exit is
quicker than ours.

## Numbers

| | Before | After |
|---|---|---|
| `test:legacy` | 2 h 31 m, no result | **12 s, PASS** |
| Scripts with a deadline | 0 of 10 | 10 of 10 |
| Scripts with guaranteed teardown | 1 of 10 | 10 of 10 |
| Files written to `~/Downloads` per run | 2 | **0** |
| Leaked Chrome processes after a run | up to 8 | 0 |
| Unit tests | 1,040 | **1,050** |
| `npm run test:all` | could not complete | runnable |

## Files

- `test/e2e/lib/guard.mjs` — new. `startGuard`, `closeBrowser`,
  `suppressDownloads`.
- `test/core/e2e-guard.test.mjs` — new, 10 tests.
- `test/e2e/legacy-guards.mjs` — guard, stages, downloads suppressed, and a
  new assertion that both exports still offer a file.
- The other nine `test/e2e/*.mjs` — guard and hard close.
- `docs/pending/DEFECTS.md` — the register's one open entry closed.

## Left alone

The 33 stray files already in `~/Downloads` are the user's own and were not
touched. They are safe to delete:
`rm ~/Downloads/animation*.gif ~/Downloads/frames*.zip`.
