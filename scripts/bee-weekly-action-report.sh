#!/usr/bin/env bash
set -euo pipefail

# Weekly Bee action-report helper.
# Default window: previous Monday 00:00:00 through current Monday 00:00:00
# in America/Chicago. Read-only: uses Bee status/list/get only.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TZ_NAME="${BEE_REPORT_TZ:-America/Chicago}"
REPORT_DATE="${BEE_REPORT_DATE:-$(TZ="$TZ_NAME" date +%F)}"
REPORT_ROOT="${BEE_REPORT_ROOT:-$ROOT_DIR/data/bee-weekly-reports/$REPORT_DATE}"
SOURCE_DIR="$REPORT_ROOT/source"
ACTION_MD="$REPORT_ROOT/actionable-report.md"
DOCX_OUT="$ROOT_DIR/outputs/bee-weekly-action-report-$REPORT_DATE.docx"
PDF_OUT="$ROOT_DIR/outputs/bee-weekly-action-report-$REPORT_DATE.pdf"

export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=/run/user/1000/bus}"
export BEE_BIN="${BEE_BIN:-bee}"
export BEE_PAGE_LIMIT="${BEE_PAGE_LIMIT:-100}"
export BEE_MAX_PAGES="${BEE_MAX_PAGES:-80}"
export BEE_GET_TIMEOUT="${BEE_GET_TIMEOUT:-60s}"

if ! command -v "$BEE_BIN" >/dev/null 2>&1; then
  echo "Bee CLI not found: $BEE_BIN" >&2
  exit 127
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 127
fi

mkdir -p "$SOURCE_DIR" "$ROOT_DIR/outputs"

# Compute previous full week boundaries in local wall-clock time.
# If run Monday 2026-05-18, window is 2026-05-11T00:00 through 2026-05-18T00:00 CT.
read -r SINCE_MS UNTIL_MS SINCE_LOCAL UNTIL_LOCAL WINDOW_LABEL < <(
  TZ="$TZ_NAME" REPORT_DATE="$REPORT_DATE" node <<'NODE'
const tz = process.env.TZ || 'America/Chicago';
function pad(n){return String(n).padStart(2,'0')}
const reportDate = process.env.REPORT_DATE || '';
const now = reportDate ? new Date(`${reportDate}T12:00:00`) : new Date();
if (Number.isNaN(now.getTime())) {
  throw new Error(`Invalid BEE_REPORT_DATE: ${reportDate}`);
}
const day = now.getDay(); // Sun=0, Mon=1
const daysSinceMonday = (day + 6) % 7;
const thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday, 0, 0, 0, 0);
const prevMonday = new Date(thisMonday.getTime() - 7 * 86400000);
function local(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`}
const label = `${local(prevMonday).slice(0,10)}_to_${local(thisMonday).slice(0,10)}`;
console.log(prevMonday.getTime(), thisMonday.getTime(), local(prevMonday), local(thisMonday), label);
NODE
)

export BEE_SINCE_MS="$SINCE_MS"
export BEE_UNTIL_MS="$UNTIL_MS"
export BEE_REPORT_TZ="$TZ_NAME"

cat > "$REPORT_ROOT/window.json" <<EOF
{
  "timezone": "$TZ_NAME",
  "report_date": "$REPORT_DATE",
  "since_ms": $SINCE_MS,
  "until_ms": $UNTIL_MS,
  "since_local": "$SINCE_LOCAL",
  "until_local": "$UNTIL_LOCAL",
  "window_label": "$WINDOW_LABEL"
}
EOF

# Use the exact-window exporter next to this script.
"$ROOT_DIR/scripts/bee-weekly-export-window.sh" "$SOURCE_DIR"

# Generate an actionable-only report. Source summaries/transcripts stay in
# source/ for evidence and are never merged into the final rendered document.
python3 "$ROOT_DIR/scripts/bee-weekly-action-report.py" digest \
  --report-root "$REPORT_ROOT" \
  --source-dir "$SOURCE_DIR"
python3 "$ROOT_DIR/scripts/bee-weekly-action-report.py" build \
  --report-root "$REPORT_ROOT" \
  --source-dir "$SOURCE_DIR"
python3 "$ROOT_DIR/scripts/bee-weekly-action-report.py" render \
  --report-root "$REPORT_ROOT"

cat <<EOF
Bee weekly actionable report complete.
Report root: $REPORT_ROOT
Source dir: $SOURCE_DIR
Action report: $ACTION_MD
DOCX: $DOCX_OUT
PDF: $PDF_OUT
Window: $SINCE_LOCAL → $UNTIL_LOCAL $TZ_NAME
EOF
