#!/bin/bash
# Evening Digest - Tomorrow's prep + Bee voice notes from today only
# Run: 7pm weekdays
# Sources: Google Calendar (all 3) + Bee journals/todos from today only

source ~/.openclaw/gog.env 2>/dev/null || true
export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus

DISCORD_CHANNEL="1470900732931735697"

# ── Resolve dates before any subshells ──────────────────────────────────────
DAY_OF_WEEK=$(date +%u)
if [ "$DAY_OF_WEEK" = "6" ]; then
    TOMORROW=$(date +%Y-%m-%d)
else
    TOMORROW=$(date -d "tomorrow" +%Y-%m-%d)
fi
TODAY_DATE=$(date +%Y-%m-%d)
TOMORROW_ISO="${TOMORROW}T00:00:00Z"
TOMORROW_END="${TOMORROW}T23:59:59Z"

# ── Bee journals — today only ──────────────────────────────────────────────
BEE_JOURNALS_TODAY=$(bee journals list 2>/dev/null | python3 -c "
import sys, re
lines = sys.stdin.read().split('\n')
entries = []
current_lines = []
in_meta = False
current_meta = {}
for line in lines:
    if line.startswith('### Journal'):
        if current_lines and current_meta.get('date') == '$TODAY_DATE':
            text_lines = []
            seen_blank = False
            for l in current_lines:
                if not l.strip():
                    seen_blank = True
                    continue
                if seen_blank and l.strip() and not l.startswith('- '):
                    text_lines.append(l.strip())
            if text_lines:
                entries.append(' '.join(text_lines[:2]))
        current_lines = []
        in_meta = True
        current_meta = {}
    elif line.startswith('---'):
        in_meta = False
    elif in_meta and line.startswith('- created_at:'):
        date_match = re.search(r'(\d{4}-\d{2}-\d{2})', line)
        if date_match:
            current_meta['date'] = date_match.group(1)
    else:
        current_lines.append(line)
if current_lines and current_meta.get('date') == '$TODAY_DATE':
    text_lines = []
    seen_blank = False
    for l in current_lines:
        if not l.strip():
            seen_blank = True
            continue
        if seen_blank and l.strip() and not l.startswith('- '):
            text_lines.append(l.strip())
    if text_lines:
        entries.append(' '.join(text_lines[:2]))
for e in entries:
    print(e[:120])
" 2>/dev/null)

# ── Bee todos — last 7 days, open only ─────────────────────────────────────
BEE_TODOS=$(bee todos list 2>/dev/null || echo "")
parse_bee_todos() {
    echo "$1" | python3 -c "
import sys, re
from datetime import datetime, timezone, timedelta
lines = sys.stdin.read().split('\n')
seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)
in_open = True
skip_this = False
todos = []
for line in lines:
    if line.startswith('## Completed'):
        in_open = False
        continue
    if not in_open:
        continue
    if 'created_at:' in line:
        date_match = re.search(r'(\d{4}-\d{2}-\d{2})', line)
        skip_this = False
        if date_match:
            try:
                created = datetime.strptime(date_match.group(1), '%Y-%m-%d').replace(tzinfo=timezone.utc)
                if created < seven_days_ago:
                    skip_this = True
            except:
                pass
    if in_open and '- text:' in line and not skip_this:
        todo_text = line.split('- text:', 1)[1].strip()
        if todo_text and len(todos) < 3:
            todos.append(todo_text[:60])
for t in todos:
    print(t)
" 2>/dev/null
}
BEE_OPEN_TODOS=$(parse_bee_todos "$BEE_TODOS")

# ── Calendar — all 3 calendars, parsed in Python ────────────────────────────
CAL_RAW=$(python3 -c "
import subprocess, json
from datetime import datetime, timedelta

cal_ids = {
    'Family':   'fg5muo04j8joetgfjdtgjtccvo@group.calendar.google.com',
    'Personal': 'chris.campos@gmail.com',
    'Work':     'fhlfinoatou6fk56foeu1e820uld5n76@import.calendar.google.com'
}
work_offsets = {'Family': 0, 'Personal': 0, 'Work': -6}

for name, cal_id in cal_ids.items():
    params = json.dumps({
        'calendarId': cal_id,
        'timeMin': '$TOMORROW_ISO',
        'timeMax': '$TOMORROW_END',
        'maxResults': 10,
        'singleEvents': True
    })
    r = subprocess.run(
        ['gws', 'calendar', 'events', 'list', '--params', params],
        capture_output=True, text=True
    )
    try:
        data = json.loads(r.stdout)
        events = []
        for e in data.get('items', []):
            start = e.get('start', {})
            dt_val = start.get('dateTime', '')
            if dt_val:
                dt = datetime.fromisoformat(dt_val.replace('Z', '+00:00'))
                dt += timedelta(hours=work_offsets[name])
                events.append(dt.strftime('%-I:%M %p') + ': ' + e.get('summary', 'No title'))
        result = sorted(events) if events else ['No events']
    except:
        result = ['No events']

    print('CAL:' + name)
    for e in result:
        print(' ' + e)
" 2>/dev/null)

FAMILY_EVENTS=$(echo "$CAL_RAW" | awk '/^CAL:Family$/{found=1; next} /^CAL:/&&found{exit} found{print}' | grep -v '^CAL:' | sed 's/^ //')
PERSONAL_EVENTS=$(echo "$CAL_RAW" | awk '/^CAL:Personal$/{found=1; next} /^CAL:/&&found{exit} found{print}' | grep -v '^CAL:' | sed 's/^ //')
WORK_EVENTS=$(echo "$CAL_RAW" | awk '/^CAL:Work$/{found=1; next} /^CAL:/&&found{exit} found{print}' | grep -v '^CAL:' | sed 's/^ //')

# ── Weather ────────────────────────────────────────────────────────────────
WEATHER=$(curl -s "https://api.open-meteo.com/v1/forecast?latitude=33.52&longitude=-86.80&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit" | python3 -c "
import sys, json
d = json.load(sys.stdin)
if 'daily' in d:
    dn = d['daily']
    print(f\"Tomorrow: {dn['temperature_2m_max'][0]}°F high, {dn['temperature_2m_min'][0]}°F low, {dn['precipitation_probability_max'][0]}% rain\")
else:
    print('Weather unavailable')
" 2>/dev/null)

# ── Format output ────────────────────────────────────────────────────────────
if [ "$DAY_OF_WEEK" = "6" ]; then
    TOMORROW_DISPLAY="Today, $(date +"%B %d")"
else
    TOMORROW_DISPLAY=$(date -d "tomorrow" +"%A, %B %d")
fi

# Clean up empty event vars
FAM_DISP=$(echo "$FAMILY_EVENTS" | grep -v '^$' | head -10 || echo "  • No events")
WRK_DISP=$(echo "$WORK_EVENTS" | grep -v '^$' | head -10 || echo "  • No events")
PERS_DISP=$(echo "$PERSONAL_EVENTS" | grep -v '^$' | head -10 || echo "  • No events")

# Build Bee block
BEE_BLOCK=""
if [ -n "$BEE_JOURNALS_TODAY" ] || [ -n "$BEE_OPEN_TODOS" ]; then
    BEE_BLOCK="**🗒️ BEE VOICE NOTES (TODAY)**"$'\n'
    [ -n "$BEE_JOURNALS_TODAY" ] && BEE_BLOCK+="  📌 ${BEE_JOURNALS_TODAY}"$'\n'
    if [ -n "$BEE_OPEN_TODOS" ]; then
        while IFS= read -r todo; do
            [ -n "$todo" ] && BEE_BLOCK+="  ⏳ ${todo}"$'\n'
        done <<< "$BEE_OPEN_TODOS"
    fi
    BEE_BLOCK+=$'\n'
fi

# Build calendar sections
fmt_cal() {
    local label="$1"
    local content="$2"
    echo "**${label}:**"
    if [ -z "$(echo "$content" | grep -v '^$')" ]; then
        echo "  • No events"
    else
        echo "$content" | while IFS= read -r line; do
            [ -n "$line" ] && echo "  • $line"
        done
    fi
    echo ""
}

FAM_CAL=$(fmt_cal "Family" "$FAMILY_EVENTS")
WRK_CAL=$(fmt_cal "Work" "$WORK_EVENTS")
PERS_CAL=$(fmt_cal "Personal" "$PERSONAL_EVENTS")

# ── Save to memory ──────────────────────────────────────────────────────────
mkdir -p ~/.openclaw/workspace/memory/nightly_reviews
OUTPUT_FILE=~/.openclaw/workspace/memory/nightly_reviews/evening-${TODAY_DATE}.md
{
    echo "# Evening Digest - $TODAY_DATE"
    echo "## Tomorrow ($TOMORROW)"
    echo "$WEATHER"
    echo ""
    echo "## Bee Voice Notes (Today)"
    [ -n "$BEE_JOURNALS_TODAY" ] && echo "  📌 $BEE_JOURNALS_TODAY"
    [ -n "$BEE_OPEN_TODOS" ] && echo "$BEE_OPEN_TODOS" | while IFS= read -r t; do [ -n "$t" ] && echo "  ⏳ $t"; done
    echo ""
    echo "## Calendar"
    echo "$FAM_CAL"
    echo "$WRK_CAL"
    echo "$PERS_CAL"
} > "$OUTPUT_FILE"

# ── Deliver to Discord ────────────────────────────────────────────────────
MESSAGE="**🌙 EVENING DIGEST - $TOMORROW_DISPLAY**

**⛅ TOMORROW'S WEATHER:**
$WEATHER

${BEE_BLOCK}**📅 CALENDAR ($TOMORROW):**
$FAM_CAL
$WRK_CAL
$PERS_CAL"

timeout 15 openclaw message send \
    --channel discord \
    --target "$DISCORD_CHANNEL" \
    --message "$MESSAGE" \
    2>/dev/null && echo "📤 Delivered to Discord" || echo "⚠️ Discord delivery failed"