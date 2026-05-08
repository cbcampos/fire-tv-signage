#!/usr/bin/env python3
"""
format-morning-briefing.py v4
Morning briefing for Master Chris.

Changes from v3:
  - Yesterday summary: full text from Bee, no char cap
  - Bee todos: 2 days (not 7), section hidden if empty
  - Calendar: all events listed (not just first)
  - Tasks: Bee todos only (dropped Google Tasks)
"""

import re
import json
import os
import sys
from datetime import datetime, timezone, timedelta

try:
    from dateutil import parser as dtparser
except ImportError:
    sys.exit(0)

UTC = timezone.utc

CALENDAR_RAW   = os.environ.get("CALENDAR", "")
WEATHER_RAW    = os.environ.get("WEATHER", "")
BEE_JOURNALS   = os.environ.get("BEE_JOURNALS", "").strip()
BEE_TODOS      = os.environ.get("BEE_TODOS", "").strip()
BEE_DAILY      = os.environ.get("BEE_DAILY", "").strip()
EMAIL_IDS      = os.environ.get("EMAIL_IDS", "").strip()
TODAYS_DATE    = os.environ.get("TODAYS_DATE", datetime.now(UTC).strftime("%Y-%m-%d"))

TODAY = datetime.now(UTC)
DAY_NAME   = TODAY.strftime("%A")
DATE_DISPLAY = TODAY.strftime("%B %d")

# ── Parse calendar — all events ─────────────────────────────────────────────
events = []
if CALENDAR_RAW:
    try:
        cal_data = json.loads(CALENDAR_RAW)
        for item in cal_data.get("items", []):
            start = item.get("start", {})
            end   = item.get("end", {})
            s = start.get("dateTime", start.get("date", ""))
            e = end.get("dateTime", end.get("date", ""))
            if not s:
                continue
            try:
                dt_start = dtparser.parse(s)
                if dt_start.date() != TODAY.date():
                    continue
                dt_end = dtparser.parse(e) if e else None
                events.append({
                    "start": dt_start,
                    "end": dt_end,
                    "summary": item.get("summary", "(no title)"),
                    "location": item.get("location", ""),
                    "attendees": len(item.get("attendees", [])),
                })
            except Exception:
                continue
        events.sort(key=lambda x: x["start"])
    except Exception:
        pass

# ── Parse weather ────────────────────────────────────────────────────────────
weather_info = {}
if WEATHER_RAW and WEATHER_RAW != "{}":
    try:
        w = json.loads(WEATHER_RAW)
        current = w.get("current_weather", {})
        daily   = w.get("daily", {})
        weather_info = {
            "temp":   round(current.get("temperature", 0)),
            "high":   round(daily.get("temperature_2m_max",   [0])[0]) if daily.get("temperature_2m_max")   else 0,
            "low":    round(daily.get("temperature_2m_min",   [0])[0]) if daily.get("temperature_2m_min")   else 0,
            "rain":   round(daily.get("precipitation_probability_max", [0])[0]) if daily.get("precipitation_probability_max") else 0,
            "condition": current.get("weathercode", 0),
            "wind":   round(current.get("windspeed", 0)),
        }
    except Exception:
        pass

WEATHER_CODES = {
    0: "clear", 1: "mostly clear", 2: "partly cloudy", 3: "overcast",
    45: "foggy", 48: "foggy", 51: "light drizzle", 53: "drizzle", 55: "heavy drizzle",
    61: "light rain", 63: "rain", 65: "heavy rain", 71: "light snow", 73: "snow",
    75: "heavy snow", 80: "showers", 81: "showers", 82: "heavy showers",
    95: "thunderstorm", 96: "thunderstorm", 99: "thunderstorm",
}

def weather_icon(code):
    return {
        0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️", 45: "🌫️", 48: "🌫️",
        51: "🌦️", 53: "🌧️", 55: "🌧️", 61: "🌧️", 63: "🌧️", 65: "🌧️",
        71: "🌨️", 73: "🌨️", 75: "❄️", 80: "🌦️", 81: "🌧️", 82: "🌧️",
        95: "⛈️", 96: "⛈️", 99: "⛈️"
    }.get(code, "🌡️")

def weather_advice(code, rain, wind):
    tips = []
    if code >= 61: tips.append("Bring an umbrella")
    if code >= 95: tips.append("Storms likely — maybe indoor exercise")
    if wind > 25:  tips.append(f"Wind advisory ({wind}mph) — secure loose items")
    if rain > 50:  tips.append("High rain chance — plan accordingly")
    if not tips:   tips.append("Great day to get outside")
    return tips[0]

# ── Parse Bee daily summary — FULL text, no truncation ───────────────────────
def extract_daily_summary(text):
    """Extract everything under '# Summary' verbatim."""
    if not text or "# Summary" not in text:
        return None
    lines = text.split("\n")
    summary_lines = []
    in_summary = False
    for line in lines:
        if "# Summary" in line:
            in_summary = True
            continue
        if in_summary and (line.startswith("# ") or line.startswith("---")):
            break
        if in_summary:
            summary_lines.append(line.rstrip())
    return "\n".join(summary_lines).strip() if summary_lines else None

# ── Parse Bee journals — last 2 days, text only ─────────────────────────────
def extract_bee_journals(text, days=2):
    """Extract journal entries from the last `days` days (text only)."""
    if not text or "### Journal" not in text:
        return []
    lines = text.split("\n")
    cutoff = datetime.now(UTC) - timedelta(days=days)
    entries = []
    current_date = None
    text_lines = []
    in_header = False   # True: processing metadata (created_at, state, etc.)
    in_body = False     # True: processing text content between --- and next ###
    for line in lines:
        stripped = line.strip()
        if stripped.startswith("### Journal"):
            # Save previous entry
            if current_date and text_lines:
                try:
                    entry_dt = datetime.strptime(current_date, "%Y-%m-%d").replace(tzinfo=UTC)
                    if entry_dt >= cutoff:
                        entries.append({"date": current_date, "text": " ".join(text_lines).strip()})
                except ValueError:
                    pass
            # Reset for new entry
            current_date = None
            text_lines = []
            in_header = True
            in_body = False
        elif stripped.startswith("---"):
            in_header = False
            in_body = True
        elif in_header and "created_at:" in stripped:
            date_match = re.search(r"(\d{4}-\d{2}-\d{2})", stripped)
            if date_match:
                current_date = date_match.group(1)
        elif stripped and not stripped.startswith("- "):
            # Non-blank, non-metadata line = text content
            if current_date is not None:
                text_lines.append(stripped)
    # Save last entry
    if current_date and text_lines:
        try:
            entry_dt = datetime.strptime(current_date, "%Y-%m-%d").replace(tzinfo=UTC)
            if entry_dt >= cutoff:
                entries.append({"date": current_date, "text": " ".join(text_lines).strip()})
        except ValueError:
            pass
    return entries

# ── Parse Bee todos — last 2 days, open only ─────────────────────────────────
def extract_bee_todos(text, days=2):
    """Extract Bee todos from the last `days` days."""
    if not text or "## Open" not in text:
        return []
    lines = text.split("\n")
    cutoff = datetime.now(UTC) - timedelta(days=days)
    todos = []
    in_open = True
    skip_this = False
    for line in lines:
        if line.startswith("## Completed"):
            in_open = False
            continue
        if not in_open:
            continue
        if "created_at:" in line:
            date_match = re.search(r"(\d{4}-\d{2}-\d{2})", line)
            skip_this = False
            if date_match:
                try:
                    created = datetime.strptime(date_match.group(1), "%Y-%m-%d").replace(tzinfo=UTC)
                    if created < cutoff:
                        skip_this = True
                except Exception:
                    pass
        if in_open and "- text:" in line and not skip_this:
            todo_text = line.split("- text:", 1)[1].strip()
            if todo_text and todo_text not in [t["text"] for t in todos]:
                todos.append({"text": todo_text})
    return todos[:8]

# ── Short summary (2-3 sentences max) ─────────────────────────────────────
def extract_short_summary(text):
    """Extract the Short Summary from Bee daily summary."""
    if not text:
        return None
    lines = text.split('\n')
    for i, line in enumerate(lines):
        stripped = line.strip()
        # Check for Short Summary section
        if '## Short Summary' in stripped or stripped.startswith('## Short Summary'):
            # Next non-empty, non-EOF line is the actual summary
            for j in range(i+1, len(lines)):
                next_line = lines[j].strip()
                if next_line and not next_line.startswith('#') and not next_line.startswith('---'):
                    return next_line.strip()
    return None

# ── Compute free blocks ──────────────────────────────────────────────────────
def compute_free_blocks(events_today):
    if not events_today:
        return []
    workday_start = TODAY.replace(hour=8, minute=0, second=0).replace(tzinfo=None)
    workday_end   = TODAY.replace(hour=18, minute=0, second=0).replace(tzinfo=None)
    prev_end = workday_start
    blocks = []
    for e in events_today:
        start = e["start"].replace(tzinfo=None) if e["start"] else None
        end   = e["end"].replace(tzinfo=None)   if e["end"]   else None
        e["start"] = start
        e["end"]   = end
        if start and prev_end and start > prev_end and (start - prev_end).total_seconds() >= 3600:
            blocks.append({"start": prev_end, "end": start})
        if end and (not prev_end or end > prev_end):
            prev_end = end
    if prev_end and prev_end < workday_end and (workday_end - prev_end).total_seconds() >= 3600:
        blocks.append({"start": prev_end, "end": workday_end})
    return blocks

# ── Build output ─────────────────────────────────────────────────────────────
lines = []

# Header
lines.append(f"☀️ Morning Briefing — {DAY_NAME}, {DATE_DISPLAY}")
lines.append("")

# Weather
if weather_info:
    cond = WEATHER_CODES.get(weather_info["condition"], "unknown")
    icon = weather_icon(weather_info["condition"])
    advice = weather_advice(weather_info["condition"], weather_info["rain"], weather_info["wind"])
    lines.append(f"{icon} {weather_info['temp']}°F — {cond}, "
                 f"high {weather_info['high']}° / low {weather_info['low']}°")
    if weather_info["rain"] > 0:
        lines.append(f"   Rain: {weather_info['rain']}% chance")
    lines.append(f"   💡 {advice}")
    lines.append("")

# Yesterday — full Bee summary, no truncation
short_summary = extract_short_summary(BEE_DAILY)
if short_summary:
    lines.append("📖 YESTERDAY (Bee Summary)")
    lines.append(f"   {short_summary}")
    lines.append("")

# Bee todos + today's journal
recent_journals = extract_bee_journals(BEE_JOURNALS, days=2)
bee_todos_2day = extract_bee_todos(BEE_TODOS, days=2)

if bee_todos_2day or recent_journals:
    lines.append("🗒️ BEE TASKS & NOTES (LAST 2 DAYS)")
    for j in recent_journals:
        lines.append(f"   📌 [{j['date']}] {j['text']}")
    if bee_todos_2day:
        for t in bee_todos_2day:
            lines.append(f"   ⏳ {t['text'][:70]}")
    if not bee_todos_2day and not recent_journals:
        pass  # section not shown per Chris's request
    lines.append("")

# Calendar — ALL events
lines.append("📅 TODAY'S CALENDAR")
if not events:
    lines.append("   No events scheduled.")
else:
    # Show all events
    for e in events:
        if e["end"] is None:
            ftime = "ALL DAY"
        else:
            ftime = e["start"].strftime("%-I:%M %p")
        loc = f" 📍 {e['location']}" if e["location"] else ""
        lines.append(f"   • {ftime} — {e['summary']}{loc}")
    lines.append("")

    # Free blocks
    free_blocks = compute_free_blocks(events)
    if free_blocks:
        fb_strs = [f"{b['start'].strftime('%-I:%M')}-{b['end'].strftime('%-I:%M%p')}" for b in free_blocks[:3]]
        lines.append(f"   Free: {', '.join(fb_strs)}")

    # After-hours flag
    after_hours = [e for e in events if e["start"].hour >= 18 or e["start"].hour < 8]
    if after_hours:
        lines.append(f"   ⚠️ {len(after_hours)} event(s) outside 8am-6pm")
    else:
        lines.append("   ✅ No after-hours events")

lines.append("")

# Email count
if EMAIL_IDS:
    count = len([x for x in EMAIL_IDS.split(",") if x.strip()])
    lines.append(f"📬 {count} emails to catch up on")
    lines.append("")

# Contextual tip
meetings = [e for e in events if any(k in e["summary"].lower() for k in
              ["standup", "meeting", "call", "review", "sync", "1:1", "office hour", "interview"])]
meeting_count = len(meetings)
meeting_hours = sum((e["end"] - e["start"]).total_seconds() / 3600
                     for e in meetings if e["end"] is not None)

lines.append("💡 TODAY'S TIP")
if not events:
    lines.append("   Wide open day — protect it for deep work.")
elif meeting_count >= 5:
    lines.append(f"   Heavy meeting day ({meeting_count} meetings, {meeting_hours:.1f}hrs) — block lunch and protect one focus block.")
elif meeting_count <= 1 and free_blocks:
    lines.append("   Light day with free time — ideal for deep work or tackling the hard stuff.")
elif free_blocks:
    lines.append("   Some free time between meetings — use it strategically.")
else:
    lines.append("   Stay on top of your inbox between meetings.")

lines.append("")
lines.append(f"Have a great {DAY_NAME}! 👋")

print("\n".join(lines))