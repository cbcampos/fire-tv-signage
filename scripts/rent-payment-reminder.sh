#!/bin/bash
# rent-payment-reminder.sh — deterministic 8pm rent reminder (cron 13f2acee-...)
#
# Replaces an agentTurn payload that kept failing because the agent used
# `message current, emoji eyes` despite prompt instructions telling it not to
# (consecutiveErrors=2 as of 2026-07-10). This script makes the decision tree
# deterministic: search Gmail for the rent receipt, send a one-line alert to
# Amanda if it's missing, print one of two success tags to stdout. Cron
# announce delivery sends the stdout line to Discord.
#
# Behavior:
#   - Search Gmail for noreply@propertyware.com "Lease Payment Receipt" today
#   - If found: print RENT_RECEIPT_FOUND (exit 0)
#   - If not found: send a one-line alert email to amandaclaire.campos@gmail.com
#     (subject: "Your husband did not pay rent"), print RENT_ALERT_SENT (exit 0)
#   - On gog auth or send failure: print a clear diagnostic on stderr AND emit
#     a RENT_REMINDER_FAILED tag on stdout. Exit non-zero so the cron failureAlert
#     path surfaces it. We deliberately do NOT send the alert email when the
#     search is broken — a false-positive alert would be worse than a missing one.
#
# Cron conversion (2026-07-11):
#   - Mirrors the calendar-radar → check-calendar-radar.sh pattern (2026-06-30).
#   - Same argv shape: ["sh", "-lc", "bash ~/.openclaw/workspace/scripts/rent-payment-reminder.sh"]
#   - Same delivery: announce → discord channel (the script's stdout tag is what gets posted).

# Don't `set -e`. gog returns non-zero on transient timeouts; we want the trap
# below to surface the real exit code, not bail at the first failure.
source ~/.openclaw/gog.env 2>/dev/null || true

LOG="/tmp/rent-payment-reminder.log"
: > "$LOG"

trap 'echo "[rent-reminder] FAILED at line $LINENO (exit $?)" >&2 | tee -a "$LOG"' ERR

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG" >&2
}

# Step 0: Day-of-month guard. The cron (13f2acee-..., `0 20 1 * *`) is supposed
# to fire only on the 1st of each month. If anyone triggers this script
# manually on a different day (overnight builder maintenance, accidental
# invocation, a misconfigured cron), we MUST NOT send Amanda a false-positive
# "your husband didn't pay rent" alert.
#
# Allow a 1st–3rd window so a missed 1st (machine asleep, system downtime)
# still gets caught when the next fire happens. Anything past the 3rd means
# we're past rent-due territory — skip cleanly and exit 0 so the cron doesn't
# page anyone.
#
# Verified 2026-07-12: a manual run on the 12th would have falsely alerted
# Amanda (last receipt was July 2, outside the 7d window), so this guard is
# load-bearing, not cosmetic.
TODAY_DOM=$(TZ='America/Chicago' date '+%-d')
if [ "$TODAY_DOM" -gt 3 ]; then
    log "Day-of-month guard: today is the ${TODAY_DOM}th — outside the 1st–3rd rent-check window. Skipping."
    echo "RENT_REMINDER_SKIPPED: today is the ${TODAY_DOM}th, outside the 1st–3rd window"
    exit 0
fi
log "Day-of-month guard: today is the ${TODAY_DOM}th — within window, proceeding."

# Step 1: Gmail search. Query matches the agent prompt's intent:
#   from:noreply@propertyware.com subject:"Lease Payment Receipt" newer_than:7d
# We use the messages.list API directly so we get a structured response.
# `userId: me` is required by google-workspace.py (every other caller in the
# workspace includes it; without it the search exits 2 with
# "missing required parameter 'userId'"). The 7d window catches receipts
# sent a few days before the 1st — the cron fires at 8pm on the 1st, and
# `newer_than:1d` would miss anything Propertyware sent on the 28th–30th.
QUERY='from:noreply@propertyware.com subject:"Lease Payment Receipt" newer_than:7d'
log "Searching Gmail: $QUERY"

# Build params JSON in Python to keep escaping correct.
PARAMS=$(python3 -c "import json,sys; print(json.dumps({'userId': 'me', 'q': sys.argv[1], 'maxResults': 5}))" "$QUERY")

# Capture both stdout (JSON) and stderr (any gog adapter errors). We need the
# JSON even if gog returns non-zero, so we don't bail on first failure.
SEARCH_JSON=$(/Users/ccampos/.openclaw/workspace/scripts/google-workspace.py gmail users messages list --params "$PARAMS" --format json 2>>"$LOG")
SEARCH_EXIT=$?

if [ "$SEARCH_EXIT" -ne 0 ]; then
    log "ERROR: /Users/ccampos/.openclaw/workspace/scripts/google-workspace.py gmail search failed (exit $SEARCH_EXIT). Last log lines:"
    tail -5 "$LOG" >&2
    echo "RENT_REMINDER_FAILED: gog search failed (exit $SEARCH_EXIT); see /tmp/rent-payment-reminder.log"
    exit 1
fi

# Count messages safely. JSON parse failure → 0 (treat as not found).
COUNT=$(printf '%s' "$SEARCH_JSON" | python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    print(len(d.get('messages', [])))
except Exception:
    print(0)
")

if [ "${COUNT:-0}" -gt 0 ]; then
    log "Found $COUNT rent receipt message(s) — Chris paid."
    echo "RENT_RECEIPT_FOUND"
    exit 0
fi

# Step 2: Not paid. Send the alert email. Use Central-time date in body so
# Amanda sees when the alert fired.
log "No rent receipt found — sending alert email to Amanda."

NOW_HUMAN=$(TZ='America/Chicago' date '+%B %-d, %Y at %-I:%M %p %Z')
BODY="Hey Amanda, just a heads up: it is 8pm and Chris has not paid rent yet. You might want to have a conversation.

— Dobby (automated rent reminder, $NOW_HUMAN)"

# Capture stdout/stderr from +send. JSON-formatted send response lands in stdout.
SEND_OUT=$(/Users/ccampos/.openclaw/workspace/scripts/google-workspace.py gmail +send \
    --to amandaclaire.campos@gmail.com \
    --subject "Your husband did not pay rent" \
    --body "$BODY" 2>>"$LOG")
SEND_EXIT=$?

if [ "$SEND_EXIT" -ne 0 ]; then
    log "ERROR: /Users/ccampos/.openclaw/workspace/scripts/google-workspace.py gmail +send failed (exit $SEND_EXIT). Rent receipt was missing AND alert failed to send."
    tail -5 "$LOG" >&2
    echo "RENT_REMINDER_FAILED: rent receipt missing AND alert send failed (gog exit $SEND_EXIT); see /tmp/rent-payment-reminder.log"
    exit 2
fi

# Pull a message-id-ish field for the log line if present.
SENT_ID=$(printf '%s' "$SEND_OUT" | python3 -c "
import json, sys
try:
    d = json.loads(sys.stdin.read())
    print(d.get('id') or d.get('messageId') or d.get('threadId') or 'sent')
except Exception:
    print('sent')
")

log "Alert email sent successfully (id=$SENT_ID)."
echo "RENT_ALERT_SENT"
exit 0
