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

# ── Bee todos — last 2 days, open only ─────────────────────────────────────
BEE_TODOS=$(bee todos list 2>/dev/null || echo "")
BEE_OPEN_TODOS=$(echo "$BEE_TODOS" | python3 -c "
import sys, re
from datetime import datetime, timezone, timedelta
lines = sys.stdin.read().split('\n')
two_days_ago = datetime.now(timezone.utc) - timedelta(days=2)
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
                if created < two_days_ago:
                    skip_this = True
            except:
                pass
    if in_open and '- text:' in line and not skip_this:
        todo_text = line.split('- text:', 1)[1].strip()
        if todo_text and todo_text not in [t for t in todos]:
            todos.append(todo_text[:60])
for t in todos:
    print(t)
" 2>/dev/null)

# ── Calendar — all 3 calendars via Python ────────────────────────────────────
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
            date_val = start.get('date', '')
            dt_val = start.get('dateTime', '')
            if date_val:
                # All-day event
                events.append('ALL DAY: ' + e.get('summary', 'No title'))
            elif dt_val:
                dt = datetime.fromisoformat(dt_val.replace('Z', '+00:00'))
                dt += timedelta(hours=work_offsets[name])
                # Flag 12:00 AM events as likely all-day
                time_str = 'ALL DAY' if dt.hour == 0 and dt.minute == 0 else dt.strftime('%-I:%M %p')
                events.append(time_str + ': ' + e.get('summary', 'No title'))
        result = sorted(events) if events else ['No events']
    except:
        result = ['No events']

    print('CAL:' + name)
    for e in result:
        print(' ' + e)
" 2>/dev/null)

# ── Extract sections with Python — avoids shell subshell bugs ─────────────────
CAL_PARSED=$(echo "$CAL_RAW" | python3 -c "
import sys
lines = [l.rstrip() for l in sys.stdin.read().split('\n')]
sections = {}
current = None
for line in lines:
    if line.startswith('CAL:'):
        current = line[4:]
        sections[current] = []
    elif current and line.startswith(' ') and not line.startswith('CAL:'):
        sections[current].append(line.strip())
for name, events in sections.items():
    print(name)
    for e in events:
        print(' ' + e)
" 2>/dev/null)

FAM_LIST=$(echo "$CAL_PARSED" | awk '/^Family$/{p=1; next} /^Personal$|^Work$/{p=0} p{print}' | grep -v '^Family$')
PERS_LIST=$(echo "$CAL_PARSED" | awk '/^Personal$/{p=1; next} /^Family$|^Work$/{p=0} p{print}' | grep -v '^Personal$')
WORK_LIST=$(echo "$CAL_PARSED" | awk '/^Work$/{p=1; next} /^Family$|^Personal$/{p=0} p{print}' | grep -v '^Work$')

# ── Format calendar sections — avoid subshell pipeline mutation ───────────────
fmt_cal_block() {
    local label="$1"
    local content
    content="$2"
    printf "**%s:**\n" "$label"
    if [ -z "$(echo "$content" | grep -v '^$')" ]; then
        printf "  • No events\n"
    else
        while IFS= read -r line; do
            [ -n "$line" ] && printf "  • %s\n" "$(echo "$line" | sed 's/^ //')"
        done <<< "$content"
    fi
}

FAM_CAL=$(fmt_cal_block "Family" "$FAM_LIST")
WRK_CAL=$(fmt_cal_block "Work" "$WORK_LIST")
PERS_CAL=$(fmt_cal_block "Personal" "$PERS_LIST")

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