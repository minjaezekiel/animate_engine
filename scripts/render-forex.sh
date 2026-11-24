#!/usr/bin/env bash
# Render every film in the forex series to MP4, and PROVE each one has audio.
#
#   bash scripts/render-forex.sh            # all 20
#   LANGS="en" PARTS="01 02" bash scripts/render-forex.sh
#
# ## Why this verifies instead of trusting the exit code
#
# The first batch run of this series reported "ok" for all twenty films and
# fourteen of them had no audio track at all. `produce.mjs` exited 0, wrote a
# valid MP4 of the right duration, and said nothing -- which is Phase 37's
# defect exactly: a render can lose its voice and report success. The only
# tell in the log was the wall time, because TTS is what takes the minutes,
# and the broken films came back in fifteen seconds.
#
# So every film is checked by `verify-renders.mjs` the moment it is written,
# and a film that comes back without audio is rendered again. Per-film output
# goes to a log rather than /dev/null, because the first version discarded
# stderr and threw away the only evidence of what went wrong.
set -u
cd "$(dirname "$0")/.."
LANGS="${LANGS:-en sw}"
PARTS="${PARTS:-01 02 03 04 05 06 07 08 09 10}"
TRIES="${TRIES:-3}"
export VOICE_LEVEL="${VOICE_LEVEL:-0.15}"
LOGDIR="out/forex/logs"; mkdir -p "$LOGDIR"
ok=0; bad=0; failed=""

for l in $LANGS; do
  mkdir -p "out/forex/$l"
  [ "$l" = "en" ] && stem="market" || stem="soko"
  for p in $PARTS; do
    out="out/forex/$l/$stem-$p.mp4"
    log="$LOGDIR/$l-$p.log"
    got=0
    for try in $(seq 1 "$TRIES"); do
      printf '[%s] %s/%s try %d ... ' "$(date +%H:%M:%S)" "$l" "$p" "$try"
      rm -f "$out"
      FORMAT=mp4 FILM="films/forex/$l/part-$p.json" OUT="$out" \
        WIDTH=1080 HEIGHT=1920 node scripts/produce.mjs >"$log" 2>&1
      if [ ! -f "$out" ]; then echo "no file (see $log)"; sleep 3; continue; fi
      if node scripts/verify-renders.mjs "$out" >/dev/null 2>&1; then
        echo "ok ($(du -h "$out" | cut -f1 | tr -d ' '))"
        ok=$((ok+1)); got=1; break
      fi
      echo "NO AUDIO -- retrying"
      sleep 5
    done
    if [ "$got" -eq 0 ]; then bad=$((bad+1)); failed="$failed $l/$p"; fi
  done
done

echo "---"
echo "rendered $ok, failed $bad${failed:+ --$failed}"
node scripts/verify-renders.mjs out/forex/en/*.mp4 out/forex/sw/*.mp4
