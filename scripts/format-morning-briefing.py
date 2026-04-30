#!/usr/bin/env python3
"""
format-morning-briefing.py v2
Adds Bee journals, todos, and daily summary to the morning briefing.

Input env vars:
  CALENDAR       — raw JSON from gws calendar list
  PERSONAL_TASKS — raw JSON from gws tasks list
  EMAIL_IDS      — comma-separated list of recent email IDs (optional)
  WEATHER        — raw JSON from open-meteo API (optional)
  BEE_JOURNALS   — output of: bee journals list (raw text)
  BEE_TODOS      — output of: bee todos list (raw text)
  BEE_DAILY      — output of: bee daily list --limit 1 (raw text, most recent summary)
  BEE_NOW        — output of: bee now (raw text, last 10h conversations)
  TODAYS_DATE    — YYYY-MM-DD (optional, defaults to today)

Output: Discord-formatted morning briefing, no markdown tables.
"""

import re
import json
import os
import sys
from datetime import datetime, timezone, timedelta

try:
    from dateutil import parser as dtparser
except ImportError:
    sys.exit(0)  # Fail silently if dateutil not available

UTC = timezone.utc

CALENDAR_RAW = os.environ.get("CALENDAR", "")
TASKS_RAW = os.environ.get("PERSONAL_TASKS", "")
EMAIL_IDS = os.environ.get("EMAIL_IDS", "")
WEATHER_RAW = os.environ.get("WEATHER", "")
BEE_JOURNALS = os.environ.get("BEE_JOURNALS", "").strip()
BEE_TODOS = os.environ.get("BEE_TODOS", "").strip()
BEE_DAILY = os.environ.get("BEE_DAILY", "").strip()
BEE_NOW = os.environ.get("BEE_NOW", "").strip()
TODAYS_DATE = os.environ.get("TODAYS_DATE", datetime.now(UTC).strftime("%Y-%m-%d"))

TODAY = datetime.now(UTC)
DAY_NAME = TODAY.strftime("%A")
DATE_DISPLAY = TODAY.strftime("%B %d")

# ── Parse calendar ─────────────────────────────────────────────────────────────
events = []
if CALENDAR_RAW:
    try:
        cal_data = json.loads(CALENDAR_RAW)
        for item in cal_data.get("items", []):
            start = item.get("start", {})
            end = item.get("end", {})
            s = start.get("dateTime", start.get("date", ""))
            e = end.get("dateTime", end.get("date", ""))
            if not s:
                continue
            try:
                dt_start = dtparser.parse(s)
                if dt_start.date() != TODAY.date():
                    continue
                if not e:
                    dt_end = None
                else:
                    dt_end = dtparser.parse(e)
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
        daily = w.get("daily", {})
        weather_info = {
            "temp": round(current.get("temperature", 0)),
            "high": round(daily.get("temperature_2m_max", [0])[0]) if daily.get("temperature_2m_max") else 0,
            "low": round(daily.get("temperature_2m_min", [0])[0]) if daily.get("temperature_2m_min") else 0,
            "rain": round(daily.get("precipitation_probability_max", [0])[0]) if daily.get("precipitation_probability_max") else 0,
            "condition": current.get("weathercode", 0),
            "wind": round(current.get("windspeed", 0)),
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
    icons = {0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️", 45: "🌫️", 48: "🌫️",
              51: "🌦️", 53: "🌧️", 55: "🌧️", 61: "🌧️", 63: "🌧️", 65: "🌧️",
              71: "🌨️", 73: "🌨️", 75: "❄️", 80: "🌦️", 81: "🌧️", 82: "🌧️",
              95: "⛈️", 96: "⛈️", 99: "⛈️"}
    return icons.get(code, "🌡️")

def weather_advice(code, rain, wind):
    tips = []
    if code >= 61: tips.append("Bring an umbrella")
    if code >= 95: tips.append("Storms likely — maybe indoor exercise")
    if wind > 25: tips.append(f"Wind advisory ({wind}mph) — secure loose items")
    if rain > 50: tips.append("High rain chance — plan accordingly")
    if not tips: tips.append("Great day to get outside")
    return tips[0]

# ── Parse tasks (Google Tasks) — incomplete only ─────────────────────────────
tasks = []
if TASKS_RAW:
    try:
        task_data = json.loads(TASKS_RAW)
        items = task_data.get("items", [])
        for item in items:
            tasks.append({
                "title": item.get("title", ""),
                "due": item.get("due", ""),
                "completed": item.get("completed"),
                "priority": item.get("priority", "normal"),
            })
    except Exception:
        pass

# ── Parse Bee journals — summarize as a topic, not raw text ─────────────────
def extract_latest_journal(text):
    """Pull the most recent journal entry, summarize as a topic label."""
    if not text or "### Journal" not in text:
        return None
    lines = text.split("\n")
    entry_lines = []
    capture = False
    for line in lines:
        if line.startswith("### Journal"):
            if capture and entry_lines:
                break
            capture = True
            entry_lines = []
        elif capture:
            entry_lines.append(line)
    # entry_lines starts with metadata lines (starting with "- ")
    # Find first non-metadata line for actual content
    for i, l in enumerate(entry_lines):
        stripped = l.strip()
        if stripped and not stripped.startswith("- "):
            snippet = " ".join(entry_lines[i:i+3]).strip()
            summarized = snippet[:120].rsplit(". ", 1)[0]
            if not summarized.endswith("."):
                summarized += "."
            return summarized
    return None

# ── Parse Bee todos — extract open items from last 7 days ───────────────────
def extract_open_bee_todos(text):
    """Extract incomplete Bee todos from the last 7 days."""
    if not text or "## Open" not in text:
        return []
    lines = text.split("\n")
    todos = []
    seven_days_ago = datetime.now(UTC) - timedelta(days=7)
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
                    if created < seven_days_ago:
                        skip_this = True
                except Exception:
                    pass
        if in_open and "- text:" in line and not skip_this:
            todo_text = line.split("- text:", 1)[1].strip()
            if todo_text and todo_text not in [t["text"] for t in todos]:
                todos.append({"text": todo_text})
    return todos[:5]

# ── Parse Bee daily summary ──────────────────────────────────────────────────
def extract_daily_summary(text):
    """Extract the # Summary section from bee daily list."""
    if not text or "# Summary" not in text:
        return None
    lines = text.split("\n")
    in_summary = False
    summary_lines = []
    for line in lines:
        if "# Summary" in line:
            in_summary = True
            continue
        if in_summary and (line.startswith("#") or line.startswith("---")):
            break
        if in_summary:
            summary_lines.append(line.strip())
    return " ".join(summary_lines[:100]).strip() if summary_lines else None

# ── Analyze day ──────────────────────────────────────────────────────────────
total_events = len(events)
meetings = [e for e in events if any(k in e["summary"].lower() for k in
              ["standup", "meeting", "call", "review", "sync", "1:1", "office hour", "interview"])]
meeting_count = len(meetings)
meeting_hours = sum((e["end"] - e["start"]).total_seconds() / 3600 for e in meetings if e["end"] is not None)

free_blocks = []
if events:
    workday_start = TODAY.replace(hour=8, minute=0, second=0).replace(tzinfo=None)
    workday_end = TODAY.replace(hour=18, minute=0, second=0).replace(tzinfo=None)
    prev_end = workday_start
    for e in events:
        start = e["start"].replace(tzinfo=None) if e["start"] else None
        end = e["end"].replace(tzinfo=None) if e["end"] else None
        e["start"] = start
        e["end"] = end
        if start and prev_end and start > prev_end and (start - prev_end).total_seconds() >= 3600:
            free_blocks.append({"start": prev_end, "end": start})
        if end and (not prev_end or end > prev_end):
            prev_end = end
    if prev_end and prev_end < workday_end and (workday_end - prev_end).total_seconds() >= 3600:
        free_blocks.append({"start": prev_end, "end": workday_end})

first_event = events[0] if events else None
after_hours = [e for e in events if e["start"].hour >= 18 or e["start"].hour < 8]

# ── Build output ──────────────────────────────────────────────────────────────
lines = []

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

# Bee daily summary (yesterday's narrative from Bee)
daily_summary = extract_daily_summary(BEE_DAILY)
if daily_summary:
    lines.append("📖 YESTERDAY (Bee Summary)")
    truncated = daily_summary[:200]
    if len(daily_summary) > 200:
        truncated = truncated.rsplit(" ", 1)[0] + "..."
    lines.append(f"   {truncated}")
    lines.append("")

# Bee journals + todos
latest_journal = extract_latest_journal(BEE_JOURNALS)
open_bee_todos = extract_open_bee_todos(BEE_TODOS)

if latest_journal or open_bee_todos:
    lines.append("🗒️ BEE VOICE NOTES")
    if latest_journal:
        lines.append(f"   📌 {latest_journal}")
    if open_bee_todos:
        for t in open_bee_todos:
            lines.append(f"   ⏳ {t['text'][:60]}")
    lines.append("")

# Calendar
lines.append("📅 TODAY'S CALENDAR")
if not events:
    lines.append("   No events scheduled.")
else:
    if first_event:
        f = first_event
        if f["end"] is None:
            ftime = "ALL DAY"
        else:
            ftime = f["start"].strftime("%-I:%M %p")
        floc = f" 📍 {f['location']}" if f["location"] else ""
        lines.append(f"   First up: {ftime} — {f['summary']}{floc}")
    if meeting_count > 0:
        lines.append(f"   {meeting_count} meetings today ({meeting_hours:.1f}hrs total)")
    if after_hours:
        lines.append(f"   ⚠️ {len(after_hours)} event(s) outside 8am-6pm")
    else:
        lines.append("   ✅ No after-hours events")
    if free_blocks:
        fb_strs = [f"{b['start'].strftime('%-I:%M')}-{b['end'].strftime('%-I:%M%p')}" for b in free_blocks[:2]]
        lines.append(f"   Free: {', '.join(fb_strs)}")
lines.append("")

# Tasks (Google Tasks) — show incomplete only
lines.append("📋 TOP TASKS")
incomplete_tasks = [t for t in tasks if not t.get("completed")]
if not incomplete_tasks:
    lines.append("   All clear — no pending tasks.")
else:
    for t in incomplete_tasks[:5]:
        due_str = ""
        if t.get("due"):
            try:
                due_dt = dtparser.parse(t["due"])
                due_str = f" (due {due_dt.strftime('%b %d')})"
            except Exception:
                pass
        pri = "🔴" if t["priority"] == "high" else ("🟡" if t["priority"] == "medium" else "")
        lines.append(f"   📌 {pri}{t['title'][:50]}{due_str}")
lines.append("")

# Email
if EMAIL_IDS:
    count = len([x for x in EMAIL_IDS.split(",") if x.strip()])
    lines.append(f"📬 {count} emails to catch up on")
    lines.append("")

# Contextual tip
lines.append("💡 TODAY'S TIP")
if meeting_count >= 5:
    lines.append("   Heavy meeting day — block lunch and protect one focus block.")
elif meeting_count <= 1:
    lines.append("   Light day — ideal for deep work or tackling the hard stuff.")
elif free_blocks:
    lines.append("   Some free time between meetings — use it strategically.")
else:
    lines.append("   Stay on top of your inbox between meetings.")

lines.append("")
lines.append("Have a great " + DAY_NAME + "! 👋")

print("\n".join(lines))
