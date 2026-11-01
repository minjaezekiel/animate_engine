# VoiceStudio: cloned and designed voices

[VoiceStudio](https://github.com/debpalash/VoiceStudio) is an open-source,
fully local voice studio — cloning, voice design, dubbing, 646 languages. It
runs as its own application and exposes an HTTP API on loopback, which is the
only reason this integration is possible, and the only reason it is legal.

## Why it is worth having

`26-DELIVERY.md` exists because of a hard limit: the Piper catalogue has
**exactly one Swahili voice** — 1 of 119, checked against its own path map.
Delivery separates three characters by rate and pitch because nothing could
separate them by timbre. That is a workaround, and it is honest about being
one.

A cloning engine removes the constraint at the source. Record yourself, or a
few people who agreed to it, and a Swahili cast becomes a cast of real human
voices. Nothing else available comes close to fixing this.

## Licensing — read before changing the provider

**VoiceStudio is AGPL-3.0. This engine is MIT.** Those coexist only because
of how the integration is built:

- `VoiceStudioProvider` is a **client**. It talks to a separate program, which
  the user installs and runs themselves, over HTTP. Separate programs
  communicating at arm's length over a protocol are not one combined work.
- **Nothing is vendored, bundled, copied or linked.** This is the deliberate
  opposite of `scripts/vendor-voice.mjs`, which copies Piper's runtime into
  `vendor/` — safe there because Piper and vits-web are permissively licensed.
- AGPL §13 obliges whoever *operates* a modified VoiceStudio over a network to
  offer its source. A user running it on their own machine, for themselves,
  distributes nothing and triggers nothing.

Shipping VoiceStudio inside this project would be a different decision with
different consequences. This document is not permission for it.

**The audio is licensed separately from the app.** VoiceStudio says so itself:
model weights, voices and generated output each carry their own terms. Anyone
publishing or monetising the output needs to check the licence of the *model
that made it*, not just the app's. For a series that goes on TikTok and
Facebook, that check is not optional.

## Consent

Cloning a voice that is not yours, without the owner's agreement, is not
something this engine should help with. There is no technical lock — one would
be trivially bypassed and would only inconvenience honest use — so the
constraint is stated instead: `probe()` prints it on every run, and it is here.

Clone your own voice, or one whose owner agreed to it.

## Using it

```bash
# 1. Install and start VoiceStudio (separately -- not from this repo)
#    https://github.com/debpalash/VoiceStudio
#    Record and clone your voices in its own UI.

# 2. Check this engine can see it, and what it found
npm run voice-studio

# 3. Hear one line before committing a film to a voice
SAY="Habari, mimi ni Nuru." VOICE=<voice-id> npm run voice-studio

# 4. Render against it
VOICE_STUDIO=http://127.0.0.1:3900 \
FORMAT=mp4 FILM=films/vito/part-01.json \
  OUT=out/vito/madini-01.mp4 WIDTH=1080 HEIGHT=1920 npm run produce
```

Cast a film by naming voices with the `voicestudio:` prefix:

```json
"voices": {
  "nuru":   { "spec": "voicestudio:nuru-clone" },
  "bakari": { "spec": "voicestudio:bakari-clone" },
  "hamisi": { "spec": "voicestudio:hamisi-clone" }
}
```

Delivery still applies on top, but with genuinely distinct voices you will
usually not want it: `rate` and `pitch` exist to fake a difference that real
voices already have.

## It is optional, and stays optional

`VOICE_STUDIO` unset means the provider is never constructed. When it is set
but the studio is not running, `available()` returns false and the ladder
falls through to the bundled Piper voices. **A film cast against VoiceStudio
still renders on a machine that has never heard of it** — asserted by a test,
not assumed.

That matters because of what `28-MADINI-YA-VITO.md` records: the Swahili
renders were made self-contained on purpose, after a 63 MB network fetch
crashed one outright. Adding a dependency on a running desktop application
would undo that, so it is added as an option and not a requirement.

## What is verified and what is inferred

Honest, because the difference decides how a failure will look.

**Verified** from the project's own documentation:

| | |
|---|---|
| backend | `http://localhost:3900` |
| loopback auth | none — "no key, no PIN, no header" |
| list voices | `GET /v1/audio/voices` |
| style | described as OpenAI-compatible |

**Inferred**, because it follows from "OpenAI-compatible" and could not be
confirmed against a running instance — VoiceStudio is not installed on the
machine this was written on:

| | |
|---|---|
| synthesis | `POST /v1/audio/speech` |
| body | `{model, input, voice, response_format}` |
| response | raw audio bytes |

Every one of those is a constructor option, so a mismatch is one line of
configuration rather than a rewrite. And `probe()` reports what it actually
found, so a moved route shows up as a *different* message from a studio that
is simply not running — those two must never look the same.

**This has not been run against a live VoiceStudio.** The tests drive an
injected `fetch` and pin the exact request that would go over the wire, which
is worth having precisely because that request shape is the inferred part.
They are not a substitute for one real call. Run `npm run voice-studio` with
`SAY=` set before trusting it with a film.

## The defect this found, and the one the fix had

Writing the "a missing studio must still render" test failed, and not in the
provider. `VoiceRegistry.resolve()` called `provider.listVoices()` unguarded,
so a provider whose listing *threw* took the whole ladder down with it — the
fallback never got a chance to run. A film naming a local voice server that
was not running would have failed outright instead of falling back to the
bundled voices.

The first fix was a `.catch(() => null)` around that one call. It was correct
and it was bad, in two ways that only showed up when measured.

**It was not performant.** Providers cache their own successful listings;
none of them caches a *refusal*. So a provider that was down was asked again
for every line — measured at **three network attempts per line, 75 for a
25-line film**:

| | before | after |
|---|---|---|
| attempts against a dead host, 25-line film | 75 | **2** |
| 20 lines synthesised in parallel | 20 simultaneous connections | **1** |

Against a closed port that is instant, because `ECONNREFUSED` returns at once
— which is exactly why it was invisible. Against a host that **hangs** rather
than refusing, a dropping firewall or an app still starting, each attempt
waits out the provider's timeout. At the 120 s synthesis timeout that is two
and a half hours of waiting for one film.

**It was not visible.** Swallowing the error meant the render worked, the
voice was quietly someone else's, and nothing said so. That is the same
silence that lost the subtitle margin and the voice levels, and it is the
defect class this codebase keeps rediscovering.

### What it is now

- **Memoized with a TTL** (30 s default) in the registry, caching *failure*
  as well as success — the thing no provider does for itself. Thirty seconds
  is a balance: short enough that an editor notices a server starting,
  long enough that a render does not re-probe per line.
- **Single-flight.** Concurrent callers join the one in-flight attempt. The
  TTL alone cannot prevent a stampede, because in parallel nothing has
  settled yet.
- **`invalidate(id?)`** for "I have just started it", so the editor does not
  have to wait out a TTL.
- **`diagnostics()`**, reported by `studio.js` alongside the voice warnings,
  one note per provider per reason so a 200-line film does not emit 200
  notes. Severity `info`: an absent optional provider is expected, not an
  error.
- **A separate `probeTimeoutMs`** (3 s) on the provider. Synthesising a long
  line legitimately takes a while; deciding whether anything is listening
  must not, or a dead host stalls the render instead of being skipped.

`test/core/voiceregistry.test.mjs` pins the **cost**, not just the behaviour:
25 lines must cost at most two attempts against a dead host, 20 parallel
lines at most one probe, and 200 lines at most four diagnostics. A future
change that reintroduces the per-line probe fails those tests rather than
quietly costing someone a render.

## Tests

`test/core/voicestudio.test.mjs`, all against an injected fetch:

- `available()` is false when nothing is running **and** when the route moved,
  and never throws in either case.
- A missing studio falls through the registry ladder to Piper.
- Listings parse as a bare array, `{data}` or `{voices}` — all three shapes
  OpenAI-compatible servers actually use.
- Cloned voices are tagged, by any of the three flags seen in the wild.
- The listing is fetched once, not once per line of dialogue.
- The POST body is pinned exactly, because it is the inferred part.
- Every path and field name is overridable.
- A 200 response carrying almost no bytes is an **error**, not a silent empty
  line — the failure that would otherwise look like success.
- `probe()` distinguishes unreachable from reachable-but-empty, and states the
  consent and output-licence caveats every time.
