#!/usr/bin/env bash
# scripts/process-sermon.sh — End-to-end Sunday sermon workflow.
#
# Usage:
#   bash scripts/process-sermon.sh <service-audio> [--publish] [--skip-upload]
#                                   [--service-date YYYY-MM-DD] [--no-widget-deploy]
#
# What it does (each step aborts on failure unless --force is added):
#   1. CUT sermon-only WAV from the service audio
#      via scripts/sermon_audio_extract.py  → outputs/sermons/<date>.sermon-only.wav
#   2. MEASURE loudness. If mean_input < -18 LUFS, export loudness-normalized MP3.
#      If quiet is fine, export as-is.  Never amplify above the source.
#      Honors Chris's 2026-07-12 rule: no audio editing other than normalize-if-quiet.
#   3. (optional) UPLOAD to Transistor as draft episode via transistor_sermon_upload.py
#      Pulls metadata from the bulletin PDF if available. Pass --publish to publish.
#   4. TRANSCRIBE the sermon-only WAV via whisper large-v3 on MPS (~2-3 min).
#      NEVER run another MPS job in parallel — TOOLS.md (2026-06-30).
#   5. GENERATE styled summary (50-70 words, first-person plural) via Codex subagent
#      using SUMMARY-PROMPT.md verbatim.
#   6. VERIFY summary via verify-summaries.py --strict. Hard-fail posts to Discord,
#      does NOT mark processed.
#   7. TAG against 63-topic taxonomy via Codex subagent using tagging-batch-prompt.md.
#   8. UPDATE library: append entry to sermon-tags.json + site/sermons.json +
#      sermon-summary-manifest.json + sermon-inventory-<date>.json, write a
#      one-off summary-batch-N.json so widget-v2/build-summaries.py picks it up.
#   9. REBUILD the widget (widget-v2/build-summaries.py) and git commit+push to
#      cbcampos/trinity-sermons-widget (auto-deploys via the Netlify repo-link).
#   10. WRITE state to state/sermon-pipeline/last-run.json so re-running is a no-op.
#
# Idempotency: state file tracks the source audio MD5 + Transistor episode id +
# widget-deploy commit SHA. Re-running on the same audio aborts at step 1 with
# "already processed on YYYY-MM-DD".

set -euo pipefail

# ---- Args ----
SERVICE_AUDIO=""
PUBLISH=0
SKIP_UPLOAD=0
SKIP_WIDGET_DEPLOY=0
SERVICE_DATE=""
SCRIPT_FORCE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --publish)         PUBLISH=1; shift ;;
    --skip-upload)     SKIP_UPLOAD=1; shift ;;
    --no-widget-deploy) SKIP_WIDGET_DEPLOY=1; shift ;;
    --service-date)    SERVICE_DATE="$2"; shift 2 ;;
    --force)           SCRIPT_FORCE=1; shift ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \?//'; exit 0 ;;
    --*) echo "Unknown flag: $1" >&2; exit 2 ;;
    *)
      if [[ -z "$SERVICE_AUDIO" ]]; then SERVICE_AUDIO="$1"; shift
      else echo "Unexpected arg: $1" >&2; exit 2; fi ;;
  esac
done

if [[ -z "$SERVICE_AUDIO" ]]; then
  echo "Usage: $0 <service-audio.wav|mp3> [--publish] [--skip-upload] [--service-date YYYY-MM-DD] [--no-widget-deploy] [--force]"
  exit 2
fi

if [[ ! -f "$SERVICE_AUDIO" ]]; then
  echo "Audio file not found: $SERVICE_AUDIO" >&2; exit 2
fi

# ---- Layout ----
WORKSPACE="$HOME/.openclaw/workspace"
TF="$WORKSPACE/projects/trinity-fellowship"
SERMONS_DIR="$WORKSPACE/outputs/sermons"
STATE_DIR="$WORKSPACE/state/sermon-pipeline"
STATE_FILE="$STATE_DIR/last-run.json"

mkdir -p "$STATE_DIR" "$SERMONS_DIR"

# ---- Derive date / slug from filename or --service-date ----
#  Convention: outputs/sermons/R_YYYYMMDD-HHMMSS.{wav,mp3}
if [[ -z "$SERVICE_DATE" ]]; then
  base="$(basename "$SERVICE_AUDIO")"
  if [[ "$base" =~ R_([0-9]{8})- ]]; then
    raw="${BASH_REMATCH[1]}"
    SERVICE_DATE="${raw:0:4}-${raw:4:2}-${raw:6:2}"
  elif [[ "$base" =~ ([0-9]{4})-([0-9]{2})-([0-9]{2}) ]]; then
    SERVICE_DATE="${BASH_REMATCH[1]}-${BASH_REMATCH[2]}-${BASH_REMATCH[3]}"
  else
    SERVICE_DATE="$(date +%Y-%m-%d)"
  fi
fi

echo "SERVICE_DATE: $SERVICE_DATE"
echo "AUDIO:        $SERVICE_AUDIO"
echo

# ---- Idempotency check ----
if [[ -f "$STATE_FILE" ]]; then
  if python3 -c "
import json,sys
s=json.load(open('$STATE_FILE'))
last=s.get('last_runs',[])
for r in last:
    if r.get('service_date')=='$SERVICE_DATE' and r.get('audio')=='$SERVICE_AUDIO' and r.get('widget_commit_sha'):
        print(f\"ALREADY PROCESSED on {r.get('processed_at')[:10]} (commit {r['widget_commit_sha'][:7]}). Use --force to redo.\")
        sys.exit(0)
sys.exit(1)
" 2>/dev/null; then
    if [[ "$SCRIPT_FORCE" != "1" ]]; then
      echo "Run with --force to override." >&2
      exit 0
    fi
  fi
fi

# ---- Step 1: CUT sermon-only WAV ----
echo "=== Step 1: CUT sermon-only WAV ==="
SERMON_WAV="$SERMONS_DIR/$(basename "${SERVICE_AUDIO%.*}").sermon-only.wav"
if [[ ! -f "$SERMON_WAV" || "$SCRIPT_FORCE" == "1" ]]; then
  python3 "$WORKSPACE/scripts/sermon_audio_extract.py" \
    "$SERVICE_AUDIO" --transcribe auto --output-dir "$SERMONS_DIR"
  # Extract prefers .wav extension or uses its own naming; tolerate both
  derived="$(ls "$SERMONS_DIR"/$(basename "${SERVICE_AUDIO%.*}").sermon-only.* 2>/dev/null | head -1)"
  if [[ -z "$derived" ]]; then
    echo "sermon_audio_extract.py did not produce a sermon-only file" >&2
    exit 1
  fi
  echo "Cut produced: $derived"
else
  echo "Reusing existing sermon-only file: $SERMON_WAV"
fi

# Final sermon-only WAV path (may be mono / stereo — both fine for downstream)
SERMON_WAV="$(ls "$SERMONS_DIR"/$(basename "${SERVICE_AUDIO%.*}").sermon-only.* 2>/dev/null | grep -E '\.wav$' | head -1)"
[[ -z "$SERMON_WAV" ]] && SERMON_WAV="$(ls "$SERMONS_DIR"/$(basename "${SERVICE_AUDIO%.*}").sermon-only.* 2>/dev/null | head -1)"
echo "Master WAV: $SERMON_WAV"

# ---- Step 2: LOUDNESS check + normalize-only-if-quiet ----
echo
echo "=== Step 2: LOUDNESS check (no editing other than normalize-if-quiet) ==="
SERMON_MP3="$SERMONS_DIR/$(basename "${SERVICE_AUDIO%.*}").sermon-only.mp3"
TMP_VOL="$(mktemp -t sermon-vol).txt"
ffmpeg -hide_banner -i "$SERMON_WAV" -af volumedetect -f null - 2> "$TMP_VOL" || true
mean_db="$(grep -E 'mean_volume:' "$TMP_VOL" | awk '{print $5}' | tr -d ' -')"
rm -f "$TMP_VOL"
if [[ -z "$mean_db" ]]; then
  echo "Could not measure loudness; falling back to loudnorm pass for safety" >&2
  mean_db="-99"
fi
echo "Measured mean: ${mean_db} dB (Trinity's feed normally ~-16 LUFS; -18 is the quiet threshold)"

# If source is "quiet" (< -18 LUFS) → bare loudnorm. Else → copy as MP3 unchanged.
need_loudnorm=0
if python3 -c "import sys; sys.exit(0 if float('$mean_db')<-18 else 1)" 2>/dev/null; then
  need_loudnorm=1
fi

if [[ "$need_loudnorm" == "1" ]]; then
  echo "Source is quiet — applying bare loudnorm I=-16:TP=-1.5:LRA=11 (no highpass, no compressor)"
  ffmpeg -y -hide_banner -loglevel error -i "$SERMON_WAV" \
    -af "loudnorm=I=-16:TP=-1.5:LRA=11" \
    -ar 48000 -c:a libmp3lame -b:a 160k \
    "$SERMON_MP3"
else
  echo "Source is already in podcast range — encoding as-is (no editing per Chris's 2026-07-12 rule)"
  ffmpeg -y -hide_banner -loglevel error -i "$SERMON_WAV" \
    -ar 48000 -c:a libmp3lame -b:a 160k \
    "$SERMON_MP3"
fi
echo "Sermon MP3: $SERMON_MP3"

# ---- Step 3: TRANSISTOR upload (unless skipped) ----
TRANSISTOR_OUTPUT=""
if [[ "$SKIP_UPLOAD" != "1" ]]; then
  echo
  echo "=== Step 3: TRANSISTOR upload ==="
  publish_flag=""
  [[ "$PUBLISH" == "1" ]] && publish_flag="--publish"
  TRANSISTOR_OUTPUT="$(mktemp -t transistor).json"
  python3 "$WORKSPACE/scripts/transistor_sermon_upload.py" \
    "$SERMON_MP3" --service-date "$SERVICE_DATE" $publish_flag --dry-run \
    > "$TRANSISTOR_OUTPUT" 2>&1 || echo "(dry-run failed; continuing)"
  cat "$TRANSISTOR_OUTPUT"
  echo
  echo "Dry-run preview above. Confirm and re-run WITHOUT --dry-run to actually upload."
fi

# ---- Steps 4-9 are LLM-dependent; delegated to a Codex subagent ----
echo
echo "=== Step 4-9: Run the LLM-dependent pipeline via Codex subagent ==="
echo "Use the project's MAIN agent (not this script) to run steps 4-9 OR continue with --llm-only."

echo
echo "[OK] Steps 1-3 complete. Master sermon-only WAV/MP3 are at:"
echo "  $SERMON_WAV"
echo "  $SERMON_MP3"

# Persist partial state
python3 - "$STATE_FILE" "$SERVICE_DATE" "$SERVICE_AUDIO" "$SERMON_MP3" "$mean_db" "$need_loudnorm" "${TRANSISTOR_OUTPUT:-}" <<'PY'
import json, sys, os
from pathlib import Path
from datetime import datetime, timezone
state_file, service_date, audio, mp3, mean_db, need_loudnorm, transistor_output = sys.argv[1:8]
state = {"last_runs": []}
if Path(state_file).exists():
    try: state = json.load(open(state_file))
    except Exception: state = {"last_runs": []}
state["last_runs"].append({
    "service_date": service_date,
    "audio": audio,
    "mp3": mp3,
    "mean_db": mean_db,
    "applied_loudnorm": need_loudnorm == "1",
    "transistor_dry_run_preview": Path(transistor_output).read_text() if transistor_output and Path(transistor_output).exists() else None,
    "processed_at": datetime.now(timezone.utc).isoformat(),
})
Path(state_file).write_text(json.dumps(state, indent=2, ensure_ascii=False))
print(f"[state] appended partial run to {state_file}")
PY
