#!/bin/bash
# Morning Digest - Daily brief for Master Chris
# Self-delivers to Discord — no model response needed
# Sources: Google Calendar + Tasks + Gmail (primary) + Bee journals/todos/daily (supplementary)

source ~/.openclaw/gog.env 2>/dev/null || true
export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus

DISCORD_CHANNEL="1470900732931735697"

# ── Bee: journals, todos, daily summary ─────────────────────────────────────
BEE_JOURNALS=$(bee journals list 2>/dev/null || echo "")
BEE_TODOS=$(bee todos list 2>/dev/null || echo "")
BEE_DAILY=$(bee daily list --limit 1 2>/dev/null || echo "")
BEE_NOW=$(bee now 2>/dev/null || echo "")

# ── Calendar: raw JSON ────────────────────────────────────────────────────────
CALENDAR_FAM=$(gws calendar events list \
    --params "{\"calendarId\": \"fg5muo04j8joetgfjdtgjtccvo@group.calendar.google.com\", \"timeMin\": \"$(date +%Y-%m-%d)T00:00:00Z\", \"timeMax\": \"$(date +%Y-%m-%d)T23:59:59Z\", \"maxResults\": 20, \"singleEvents\": true, \"orderBy\": \"startTime\"}" \
    2>/dev/null)

CALENDAR_PERS=$(gws calendar events list \
    --params "{\"calendarId\": \"chris.campos@gmail.com\", \"timeMin\": \"$(date +%Y-%m-%d)T00:00:00Z\", \"timeMax\": \"$(date +%Y-%m-%d)T23:59:59Z\", \"maxResults\": 20, \"singleEvents\": true, \"orderBy\": \"startTime\"}" \
    2>/dev/null)

# Combine both calendars into single JSON array
FAM_ITEMS=$(echo "$CALENDAR_FAM" | python3 -c "import sys,json; d=json.load(sys.stdin); print(','.join(json.dumps(i) for i in d.get('items',[])))" 2>/dev/null || echo "")
PERS_ITEMS=$(echo "$CALENDAR_PERS" | python3 -c "import sys,json; d=json.load(sys.stdin); print(','.join(json.dumps(i) for i in d.get('items',[])))" 2>/dev/null || echo "")

if [ -n "$FAM_ITEMS" ] && [ -n "$PERS_ITEMS" ]; then
    CALENDAR="{\"items\": [${FAM_ITEMS},${PERS_ITEMS}]}"
elif [ -n "$FAM_ITEMS" ]; then
    CALENDAR="{\"items\": [${FAM_ITEMS}]}"
else
    CALENDAR="$CALENDAR_PERS"
fi

# ── Tasks: raw JSON ──────────────────────────────────────────────────────────
PERSONAL_TASKS=$(gws tasks tasks list \
    --params '{"tasklist": "U2hNd1k3eTlVTjc1S1JuUw", "maxResults": 20}' \
    2>/dev/null)

# ── Email: IDs only ──────────────────────────────────────────────────────────
EMAIL_IDS=$(gws gmail users messages list \
    --params '{"userId": "me", "maxResults": 10, "q": "is:unread newer_than:12h"}' \
    2>/dev/null | python3 -c "
import json, sys
data = json.load(sys.stdin)
ids = [m.get('id', '') for m in data.get('messages', [])[:10]]
print(','.join(ids))
" 2>/dev/null || echo "")

# ── Weather ──────────────────────────────────────────────────────────────────
WEATHER=$(curl -sf "https://api.open-meteo.com/v1/forecast?latitude=33.52&longitude=-86.80&current_weather=true&temperature_unit=fahrenheit&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=America%2FChicago&forecast_days=1" 2>/dev/null || echo "{}")

# ── Generate digest ──────────────────────────────────────────────────────────
DIGEST=$(CALENDAR="$CALENDAR" \
PERSONAL_TASKS="$PERSONAL_TASKS" \
EMAIL_IDS="$EMAIL_IDS" \
WEATHER="$WEATHER" \
BEE_JOURNALS="$BEE_JOURNALS" \
BEE_TODOS="$BEE_TODOS" \
BEE_DAILY="$BEE_DAILY" \
BEE_NOW="$BEE_NOW" \
python3 ~/.openclaw/workspace/scripts/format-morning-briefing.py 2>/dev/null)

# ── Self-deliver to Discord ──────────────────────────────────────────────────
if [ -n "$DIGEST" ]; then
    openclaw message send \
        --channel discord \
        --target "$DISCORD_CHANNEL" \
        --message "$DIGEST" \
        2>/dev/null && echo "Delivered" || echo "Delivery failed"
else
    echo "No digest generated"
fi
