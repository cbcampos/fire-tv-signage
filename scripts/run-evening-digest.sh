#!/bin/bash
# Evening Digest - Tomorrow's prep + Bee voice notes
# Run: 7pm weekdays
# Sources: Google Calendar (primary) + Bee journals/todos (supplementary)

source ~/.openclaw/gog.env 2>/dev/null || true
export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus

DISCORD_CHANNEL="1470900732931735697"

# On Saturdays, show today (the memorial/service is happening NOW) not tomorrow
DAY_OF_WEEK=$(date +%u)  # 1=Mon, 7=Sun
if [ "$DAY_OF_WEEK" = "6" ]; then
    TOMORROW=$(date +%Y-%m-%d)
else
    TOMORROW=$(date -d "tomorrow" +%Y-%m-%d)
fi
TOMORROW_ISO="${TOMORROW}T00:00:00Z"
TOMORROW_END="${TOMORROW}T23:59:59Z"

# ── Bee data ────────────────────────────────────────────────────────────────
BEE_JOURNALS=$(bee journals list 2>/dev/null || echo "")
BEE_TODOS=$(bee todos list 2>/dev/null || echo "")

# ── Bee journals parser ─────────────────────────────────────────────────────
parse_bee_journals() {
    local text="$1"
    if [ -z "$text" ] || [ "$text" = "null" ] || echo "$text" | grep -q "no journals"; then
        echo ""
        return
    fi
    echo "$text" | python3 -c "
import sys
lines = sys.stdin.read().split('\n')
entries = []
current_lines = []
in_meta = False
for line in lines:
    if line.startswith('### Journal'):
        if current_lines:
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
    elif line.startswith('---'):
        in_meta = False
    else:
        current_lines.append(line)
if current_lines:
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
if entries:
    note = entries[0][:120].rsplit('. ', 1)[0]
    if not note.endswith('.'):
        note += '.'
    print(note)
else:
    print('')
" 2>/dev/null
}

# ── Bee todos parser (last 7 days) ──────────────────────────────────────────
parse_bee_todos() {
    local text="$1"
    if [ -z "$text" ] || [ "$text" = "null" ] || echo "$text" | grep -q "no todos"; then
        echo ""
        return
    fi
    echo "$text" | python3 -c "
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

BEE_JOURNAL_NOTE=$(parse_bee_journals "$BEE_JOURNALS")
BEE_OPEN_TODOS=$(parse_bee_todos "$BEE_TODOS")

# ── Calendar ────────────────────────────────────────────────────────────────
get_cal() {
    local cal_id="$1"
    local params=$(cat <<EOF
{"calendarId": "$cal_id", "timeMin": "$TOMORROW_ISO", "timeMax": "$TOMORROW_END", "maxResults": 10, "singleEvents": true}
EOF
)
    gws calendar events list --params "$params" 2>&1
}

FAMILY_CAL=$(get_cal "fg5muo04j8joetgfjdtgjtccvo@group.calendar.google.com")
WORK_CAL=$(get_cal "fhlfinoatou6fk56foeu1e820uld5n76@import.calendar.google.com")
PERSONAL_CAL=$(get_cal "chris.campos@gmail.com")

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

# ── Weather ────────────────────────────────────────────────────────────────
WEATHER=$(curl -s "https://api.open-meteo.com/v1/forecast?latitude=33.52&longitude=-86.80&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&temperature_unit=fahrenheit" 2>&1 | python3 -c "
import sys, json
data = json.load(sys.stdin)
if 'daily' in data:
    d = data['daily']
    print(f\"Tomorrow: {d['temperature_2m_max'][0]}°F high, {d['temperature_2m_min'][0]}°F low, {d['precipitation_probability_max'][0]}% rain\")
else:
    print('Weather unavailable')
" 2>/dev/null)

# ── Memory Sync ────────────────────────────────────────────────────────────
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

# ── Output ────────────────────────────────────────────────────────────────
if [ "$DAY_OF_WEEK" = "6" ]; then
    TOMORROW_DISPLAY="Today, $(date +"%B %d")"
else
    TOMORROW_DISPLAY=$(date -d "tomorrow" +"%A, %B %d")
fi

# Print to stdout (for testing)
echo "**🌙 EVENING DIGEST - $TOMORROW_DISPLAY**"
echo ""
echo "**⛅ TOMORROW'S WEATHER:**"
echo "$WEATHER"
echo ""

if [ -n "$BEE_JOURNAL_NOTE" ] || [ -n "$BEE_OPEN_TODOS" ]; then
    echo "**🗒️ BEE VOICE NOTES**"
    [ -n "$BEE_JOURNAL_NOTE" ] && echo "  🗒️ $BEE_JOURNAL_NOTE"
    if [ -n "$BEE_OPEN_TODOS" ]; then
        echo "$BEE_OPEN_TODOS" | while IFS= read -r todo; do
            [ -n "$todo" ] && echo "  ⏳ $todo"
        done
    fi
    echo ""
fi

echo "**📅 CALENDAR ($TOMORROW):**"
echo "**Family:**"
[ -z "$FAMILY_EVENTS" ] || echo "$FAMILY_EVENTS" | grep -q "No events" && echo "  • No events" || echo "$FAMILY_EVENTS"
echo "**Work:**"
[ -z "$WORK_EVENTS" ] || echo "$WORK_EVENTS" | grep -q "No events" && echo "  • No events" || echo "$WORK_EVENTS"
echo "**Personal:**"
[ -z "$PERSONAL_EVENTS" ] || echo "$PERSONAL_EVENTS" | grep -q "No events" && echo "  • No events" || echo "$PERSONAL_EVENTS"
echo ""
echo "**🧠 ACTION ITEMS (Memory Sync):**"
echo "$MEMORY_SYNC"

# ── Save to memory ────────────────────────────────────────────────────────────
mkdir -p ~/.openclaw/workspace/memory/nightly_reviews
OUTPUT_FILE=~/.openclaw/workspace/memory/nightly_reviews/evening-$(date +%Y-%m-%d).md
{
    echo "# Evening Digest - $(date +%Y-%m-%d)"
    echo ""
    echo "## Tomorrow ($TOMORROW)"
    echo "$WEATHER"
    echo ""
    echo "## Bee Voice Notes"
    [ -n "$BEE_JOURNAL_NOTE" ] && echo "  🗒️ $BEE_JOURNAL_NOTE"
    [ -n "$BEE_OPEN_TODOS" ] && echo "$BEE_OPEN_TODOS" | while IFS= read -r todo; do [ -n "$todo" ] && echo "  ⏳ $todo"; done
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

# ── Deliver to Discord ────────────────────────────────────────────────────
BEE_BLOCK=""
if [ -n "$BEE_JOURNAL_NOTE" ] || [ -n "$BEE_OPEN_TODOS" ]; then
    BEE_BLOCK="**🗒️ BEE VOICE NOTES**"$'\n'
    [ -n "$BEE_JOURNAL_NOTE" ] && BEE_BLOCK="${BEE_BLOCK}  🗒️ ${BEE_JOURNAL_NOTE}"$'\n'
    if [ -n "$BEE_OPEN_TODOS" ]; then
        while IFS= read -r todo; do
            [ -n "$todo" ] && BEE_BLOCK="${BEE_BLOCK}  ⏳ ${todo}"$'\n'
        done <<< "$BEE_OPEN_TODOS"
    fi
    BEE_BLOCK="${BEE_BLOCK}"$'\n'
fi

FAM_DISP=$(echo "$FAMILY_EVENTS" | grep -q "No events" && echo "  • No events" || echo "$FAMILY_EVENTS")
WRK_DISP=$(echo "$WORK_EVENTS" | grep -q "No events" && echo "  • No events" || echo "$WORK_EVENTS")
PERS_DISP=$(echo "$PERSONAL_EVENTS" | grep -q "No events" && echo "  • No events" || echo "$PERSONAL_EVENTS")

openclaw message send \
    --channel discord \
    --target "$DISCORD_CHANNEL" \
    --message "**🌙 EVENING DIGEST - $TOMORROW_DISPLAY**

**⛅ TOMORROW'S WEATHER:**
$WEATHER

${BEE_BLOCK}**📅 CALENDAR ($TOMORROW):**
**Family:**
$FAM_DISP
**Work:**
$WRK_DISP
**Personal:**
$PERS_DISP

**🧠 ACTION ITEMS (Memory Sync):**
$MEMORY_SYNC" \
    2>/dev/null && echo "📤 Delivered to Discord" || echo "⚠️ Discord delivery failed"
