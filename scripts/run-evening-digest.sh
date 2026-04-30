#!/bin/bash
# Evening Digest - Tomorrow's prep + Bee voice notes
# Run: 7pm weekdays
# Sources: Google Calendar (primary) + Bee journals/todos (supplementary)

source ~/.openclaw/gog.env 2>/dev/null || true
export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus

DISCORD_CHANNEL="1470900732931735697"

# On Saturdays, show today (the memorial/service is happening NOW) not tomorrow
# weekday evenings: show tomorrow. Saturday evening: show today.
DAY_OF_WEEK=$(date +%u)  # 1=Mon, 7=Sun
if [ "$DAY_OF_WEEK" = "6" ]; then
    TOMORROW=$(date +%Y-%m-%d)  # Saturday evening → show today
else
    TOMORROW=$(date -d "tomorrow" +%Y-%m-%d)
fi
TOMORROW_ISO="${TOMORROW}T00:00:00Z"
TOMORROW_END="${TOMORROW}T23:59:59Z"

# ── Bee data ────────────────────────────────────────────────────────────────
BEE_JOURNALS=$(bee journals list 2>/dev/null || echo "")
BEE_TODOS=$(bee todos list 2>/dev/null || echo "")

# Get tomorrow's calendar using gws
get_cal() {
    local cal_id="$1"
    local params=$(cat <<EOF
{"calendarId": "$cal_id", "timeMin": "$TOMORROW_ISO", "timeMax": "$TOMORROW_END", "maxResults": 10, "singleEvents": true}
EOF
)
    gws calendar events list --params "$params" 2>&1
}

# Fetch all calendars
FAMILY_CAL=$(get_cal "fg5muo04j8joetgfjdtgjtccvo@group.calendar.google.com")
WORK_CAL=$(get_cal "fhlfinoatou6fk56foeu1e820uld5n76@import.calendar.google.com")
PERSONAL_CAL=$(get_cal "chris.campos@gmail.com")

# Parse and format calendar events
parse_events() {
    local json="$1"
    local is_work="${2:-false}"
    echo "$json" | python3 -c "
import sys, json
from datetime import datetime, timedelta
try:
    data = json.load(sys.stdin)
    items = data.get('items', [])
    if not items:
        print('No events')
    else:
        events = []
        for e in items:
            start = e.get('start', {})
            summary = e.get('summary', 'No title')
            dt_val = start.get('dateTime', '')
            if dt_val:
                try:
                    dt = datetime.fromisoformat(dt_val.replace('Z', '+00:00'))
                    if '$is_work' == 'true':
                        dt += timedelta(hours=-6)
                    events.append(f\"{dt.strftime('%-I:%M %p')}: {summary}\")
                except:
                    pass
        if events:
            for ev in sorted(events):
                print(f'  {ev}')
        else:
            print('No events')
except:
    print('No events')
" 2>/dev/null
}

FAMILY_EVENTS=$(parse_events "$FAMILY_CAL" "false")
WORK_EVENTS=$(parse_events "$WORK_CAL" "true")
PERSONAL_EVENTS=$(parse_events "$PERSONAL_CAL" "false")

# Get weather for tomorrow
WEATHER=$(curl -s "https://api.open-meteo.com/v1/forecast?latitude=33.52&longitude=-86.80&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit" 2>&1 | python3 -c "
import sys, json
data = json.load(sys.stdin)
if 'daily' in data:
    d = data['daily']
    print(f\"Tomorrow: {d['temperature_2m_max'][0]}°F high, {d['temperature_2m_min'][0]}°F low, {d['precipitation_probability_max'][0]}% rain\")
else:
    print('Weather unavailable')
")

# Bee journals → extract recent voice notes
parse_bee_journals() {
    local text="$1"
    if [ -z "$text" ] || [ "$text" = "null" ] || echo "$text" | grep -q "no journals"; then
        return
    fi
    local lines=$(echo "$text" | python3 -c "
import sys
lines = sys.stdin.read().split('\n')
entries = []
capture_text = False
current_text = []
for line in lines:
    if line.startswith('### Journal'):
        if current_text:
            entries.append(' '.join(current_text[:2]).strip())
            current_text = []
        capture_text = True
    elif capture_text and not line.startswith('#') and not line.startswith('---') and line.strip():
        current_text.append(line.strip())
if current_text:
    entries.append(' '.join(current_text[:2]).strip())
# Only print most recent
if entries:
    print(entries[0][:120])
" 2>/dev/null)
    if [ -n "$lines" ]; then
        echo "  🗒️ $lines"
    fi
}

# Bee todos → extract open
parse_bee_todos() {
    local text="$1"
    if [ -z "$text" ] || [ "$text" = "null" ] || echo "$text" | grep -q "no todos"; then
        return
    fi
    echo "$text" | python3 -c "
import sys
lines = sys.stdin.read().split('\n')
in_open = True
todos = []
for line in lines:
    if line.startswith('## Completed'):
        in_open = False
        continue
    if in_open and '- text:' in line:
        todo_text = line.split('- text:', 1)[1].strip()
        if todo_text and len(todos) < 3:
            todos.append(f'  ⏳ {todo_text[:60]}')
for t in todos:
    print(t)
" 2>/dev/null
}

BEE_JOURNAL_NOTE=$(parse_bee_journals "$BEE_JOURNALS")
BEE_OPEN_TODOS=$(parse_bee_todos "$BEE_TODOS")

# Get action items from promise tracker + active tasks
MEMORY_SYNC=$(python3 << 'PYEOF'
import re

lines = []
lines.append("**📋 Promises & Follow-Through:**")
try:
    with open("/home/ccampos/.openclaw/workspace/memory/promise-tracker.md") as f:
        content = f.read()
    seen = set()
    for row in content.split("\n"):
        if re.search(r"\| [^|]* \| (⚠️|🔴|PENDING)", row) and "---" not in row:
            cols = [c.strip() for c in row.split("|")]
            if len(cols) >= 4 and cols[2].strip() and cols[2].strip() not in seen:
                lines.append("  • " + cols[2].strip() + " [" + cols[3].strip() + "]")
                seen.add(cols[2].strip())
    bullet_count = len([l for l in lines if l.startswith("  •")])
    if bullet_count == 0:
        lines.append("  • No pending promises")
except Exception as e:
    lines.append("  • Error reading promise tracker")

lines.append("")
lines.append("**✅ Active Tasks:**")
try:
    with open("/home/ccampos/.openclaw/workspace/memory/active-tasks.md") as f:
        content = f.read()
    found = False
    seen = set()
    for line in content.split("\n"):
        if "IN PROGRESS" in line and ("###" in line or "**" in line):
            task = re.sub(r"^[*#]+\s*", "", line).strip()
            task = re.sub(r"\s*[-—].*$", "", task).strip()
            if task and task not in seen and "When to" not in task and "Mark IN PROGRESS" not in task:
                lines.append("  • " + task)
                seen.add(task)
                found = True
    if not found:
        lines.append("  • No active tasks")
except Exception as e:
    lines.append("  • Error reading active tasks")

print("\n".join(lines))
PYEOF
)

# Format output
if [ "$DAY_OF_WEEK" = "6" ]; then
    TOMORROW_DISPLAY="Today, $(date +"%B %d")"
else
    TOMORROW_DISPLAY=$(date -d "tomorrow" +"%A, %B %d")
fi

echo "**🌙 EVENING DIGEST - $TOMORROW_DISPLAY**"
echo ""
echo "**⛅ TOMORROW'S WEATHER:**"
echo "$WEATHER"
echo ""

# Bee voice notes section
if [ -n "$BEE_JOURNAL_NOTE" ] || [ -n "$BEE_OPEN_TODOS" ]; then
    echo "**🗒️ BEE VOICE NOTES**"
    [ -n "$BEE_JOURNAL_NOTE" ] && echo "$BEE_JOURNAL_NOTE"
    [ -n "$BEE_OPEN_TODOS" ] && echo "$BEE_OPEN_TODOS"
    echo ""
fi

echo "**📅 CALENDAR ($TOMORROW):**"
echo "**Family:**"
if [ -z "$FAMILY_EVENTS" ] || echo "$FAMILY_EVENTS" | grep -q "No events"; then
    echo "  • No events"
else
    echo "$FAMILY_EVENTS"
fi
echo "**Work:**"
if [ -z "$WORK_EVENTS" ] || echo "$WORK_EVENTS" | grep -q "No events"; then
    echo "  • No events"
else
    echo "$WORK_EVENTS"
fi
echo "**Personal:**"
if [ -z "$PERSONAL_EVENTS" ] || echo "$PERSONAL_EVENTS" | grep -q "No events"; then
    echo "  • No events"
else
    echo "$PERSONAL_EVENTS"
fi
echo ""
echo "**🧠 ACTION ITEMS (Memory Sync):**"
if [ -z "$MEMORY_SYNC" ]; then
    echo "  • No action items"
else
    echo "$MEMORY_SYNC"
fi

# Save to memory
mkdir -p ~/.openclaw/workspace/memory/nightly_reviews
OUTPUT_FILE=~/.openclaw/workspace/memory/nightly_reviews/evening-$(date +%Y-%m-%d).md
{
    echo "# Evening Digest - $(date +%Y-%m-%d)"
    echo ""
    echo "## Tomorrow ($TOMORROW)"
    echo "$WEATHER"
    echo ""
    echo "## Bee Voice Notes"
    [ -n "$BEE_JOURNAL_NOTE" ] && echo "$BEE_JOURNAL_NOTE"
    [ -n "$BEE_OPEN_TODOS" ] && echo "$BEE_OPEN_TODOS"
    echo ""
    echo "## Calendar - Family"
    echo "$FAMILY_EVENTS"
    echo ""
    echo "## Calendar - Work"
    echo "$WORK_EVENTS"
    echo ""
    echo "## Calendar - Personal"
    echo "$PERSONAL_EVENTS"
    echo ""
    echo "## Memory Sync"
    echo "$MEMORY_SYNC"
} > "$OUTPUT_FILE"

echo ""
echo "✅ Saved to $OUTPUT_FILE"

# Self-deliver to Discord
FAM_DISP=$(if [ -z "$FAMILY_EVENTS" ] || echo "$FAMILY_EVENTS" | grep -q "No events"; then echo "  • No events"; else echo "$FAMILY_EVENTS"; fi)
WRK_DISP=$(if [ -z "$WORK_EVENTS" ] || echo "$WORK_EVENTS" | grep -q "No events"; then echo "  • No events"; else echo "$WORK_EVENTS"; fi)
PERS_DISP=$(if [ -z "$PERSONAL_EVENTS" ] || echo "$PERSONAL_EVENTS" | grep -q "No events"; then echo "  • No events"; else echo "$PERSONAL_EVENTS"; fi)
MEM_DISP=$(if [ -z "$MEMORY_SYNC" ]; then echo "  • No action items"; else echo "$MEMORY_SYNC"; fi)
BEE_DISP=""
[ -n "$BEE_JOURNAL_NOTE" ] && BEE_DISP="${BEE_JOURNAL_NOTE}"$'\n'
[ -n "$BEE_OPEN_TODOS" ] && BEE_DISP="${BEE_DISP}${BEE_OPEN_TODOS}"$'\n'

openclaw message send \
    --channel discord \
    --target "$DISCORD_CHANNEL" \
    --message "**🌙 EVENING DIGEST - $TOMORROW_DISPLAY**

**⛅ TOMORROW'S WEATHER:**
$WEATHER

${BEE_DISP}**📅 CALENDAR ($TOMORROW):**
**Family:**
$FAM_DISP
**Work:**
$WRK_DISP
**Personal:**
$PERS_DISP

**🧠 ACTION ITEMS (Memory Sync):**
$MEM_DISP" \
    2>/dev/null && echo "📤 Delivered to Discord" || echo "⚠️ Discord delivery failed"
