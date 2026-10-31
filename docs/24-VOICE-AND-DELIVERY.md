# Voices, and how narration is delivered

**Status: partly built.** State lives in [STATUS.md](STATUS.md).

Two things that look separate and are not: **which voice speaks**, and **how
it is paced**. A film can be perfectly cast and still be unwatchable because
it leaves a fifth of its runtime silent.

---

## 1. What the engine already had, and what it was missing

`core/voice/` has had a provider registry and four providers since Phase 0 —
microphone, upload, Piper/VITS in the browser, and an HTTP endpoint. The
Piper catalogue is **124 voices across 38 languages**, verified by calling
`voices()` rather than by reading a list.

Three things were missing, and only one of them was a voice.

### 1.1 Swahili was already there

`sw_CD-lanfrica-medium` is in the catalogue the engine already ships. It was
synthesised to check rather than assumed:

| | |
|---|---|
| text | *"Habari yako rafiki. Leo tutajifunza jinsi ya kutafuta dhahabu ardhini…"* |
| output | 6.77 s, 16 words, ~142 wpm |
| level | peak 0.836, RMS 0.095 |
| first fetch | ~60 MB, then cached in OPFS |

It is the **only** Swahili voice in the catalogue, which matters for casting:
a Swahili ensemble cannot be separated by timbre and has to be separated by
pacing and pitch instead. `castEnsemble` says so rather than silently handing
back the same voice five times.

### 1.2 Voices are not level-matched, and that is audible

The same sentence through two voices:

| voice | speech RMS |
|---|---|
| `sw_CD-lanfrica-medium` | 0.0948 |
| `en_GB-alba-medium` | 0.0441 |

**2.1×, about 6.6 dB.** In a five-hander that is one character shouting at
the others for no reason the author can see or fix, because nothing in the
film format said anything about level.

`core/audio/loudness.js` measures each take and the cue carries the gain.
Two details that are the whole design:

- **The measurement runs over voiced frames only.** A line that is mostly
  pause measures quiet, and whole-buffer normalising would push it up until
  its few words were shouted. A test asserts that a take with 0.8 s of
  leading silence measures identically to the same speech without it.
- **It is applied as a cue gain, not by scaling samples.** The buffer stays
  the one the synthesis cache holds, and the mix stays a pure function of the
  numbers.

Order is normalise → per-voice trim → per-line gain, so an author's
deliberate whisper survives the levelling.

### 1.3 Casting by model id is casting blind

`tts:en_GB-northern_english_male-medium` says nothing about who that is.
`core/voice/catalog.js` names voices by **role**:

```json
"voices": {
  "zawadi": "narrator-f-en",
  "juma":   "young-f-en",
  "mzee":   { "spec": "elder-m-en", "gain": 0.9 },
  "mama":   "narrator-sw"
}
```

A spec containing a colon is passed through untouched, so every existing film
keeps working. `castEnsemble(5, {lang:'en'})` returns five **distinct**
presets, because two characters sharing a voice in a five-hander is the one
casting mistake an audience notices immediately.

---

## 2. Delivery: what the sample videos actually do

`scripts/narration-pacing.mjs` measures how narration is delivered, from a
50 Hz energy envelope of the decoded audio. No speech recogniser — this is
the *shape* of the delivery, not the words.

| measure | what it is |
|---|---|
| speech ratio | how much of the runtime carries voice at all |
| phrase | a run of speech between pauses: the breath group |
| pause | a gap of 180 ms or more. Below that is articulation |
| onsets/s | energy rises per second — a syllable-rate proxy |
| dynamics | how far the level moves; a flat number is a flat read |
| hook | the first 8 s, measured separately |

### The numbers

| | narrated references | **Finding Gold** (ours) |
|---|---|---|
| speech ratio | **73%** | **54%** |
| median phrase | 1.1–1.4 s | 1.4–1.6 s |
| median pause | 0.34–0.46 s | 0.38 s |
| pauses per minute | **32–34** | **20–22** |
| onsets/s | 2.1–2.6 | 2.1–2.2 |

**Our films leave a fifth of their runtime silent.** 54% against 73% is
roughly nineteen points of dead air, and in a feed silence is where people
scroll. The speaking *rate* is right — onsets per second match almost exactly
— so this is not about talking faster. It is about the gaps between lines,
which come from shot lengths being set before the narration was written.

### What the hook does

The openings are measurably different from the bodies, in the same direction
in every narrated sample:

| | hook (first 8 s) | body |
|---|---|---|
| speech ratio | 78%, 87% | 73%, 72% |
| median phrase | 2.4 s, 2.0 s | 1.1 s, 1.4 s |

**An opening is one long uninterrupted run; the body breaks into shorter
phrases with regular beats.** The hook does not pause, because a pause in the
first eight seconds is an exit. Our Part 5 does this by accident (2.86 s hook
phrase against a 1.38 s body); Part 1 does not (1.58 s flat throughout).

### A caution about this tool

The first version counted a phrase as any unbroken run of voiced frames and
reported median phrases of **40–140 ms**. Speech dips below any threshold
between syllables and across every stop consonant, so those were syllables,
not breath groups — a number no human could produce, from a tool that looked
like it was working. Gaps shorter than 180 ms are now bridged before phrases
are counted.

---

## 3. Not built

- **Kokoro**, the 82M StyleTTS2 model, is the strongest free realistic
  browser voice available and is Apache-2.0. It would be a fifth provider
  beside Piper, not a replacement: Piper is faster, far smaller per voice,
  and carries the 38 languages including the only Swahili. Kokoro is English
  and a handful of others.
- **A pacing check in `check-film`.** Speech ratio is derivable from the
  compiled dialogue timings before anything is rendered, so "this film is 54%
  speech" could be a diagnostic next to the staging ones rather than
  something found afterwards with a tool.
- **Per-character delivery.** Nothing yet varies rate or pitch per character,
  so a five-hander in Swahili has five identical deliveries.
