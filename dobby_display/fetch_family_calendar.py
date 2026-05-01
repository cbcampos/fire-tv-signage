#!/usr/bin/env python3
"""
Family Calendar Fetcher
Fetches today's + tomorrow's events from the family Google calendar
and pushes them to the Dobby Display in family-calendar mode.
"""
import os
import sys
os.environ["PATH"] = os.environ.get("PATH", "") + ":/home/ccampos/bin:/usr/local/bin"

import json
import subprocess
import requests
from datetime import datetime, timedelta, timezone

FAMILY_CAL = "fg5muo04j8joetgfjdtgjtccvo@group.calendar.google.com"
CT = timezone(timedelta(hours=-5))
DISPLAY_URL = os.environ.get("DOBBY_DISPLAY_URL", "http://100.76.87.63:5000")

EVENT_COLORS = {
    "school":    "#5a9367",
    "family":    "#d97706",
    "appointment": "#2b6cb0",
    "party":     "#db5a42",
    "default":   "#667eea",
}

def get_events(cal_id, days=2):
    """Fetch events for next N days from a calendar using gws."""
    now = datetime.now(CT)
    timeMin = now.isoformat()
    timeMax = (now + timedelta(days=days)).isoformat()
    params = {
        "calendarId": cal_id,
        "timeMin": timeMin,
        "timeMax": timeMax,
        "maxResults": 50,
        "singleEvents": True,
        "orderBy": "startTime"
    }
    try:
        result = subprocess.run(
            ["gws", "calendar", "events", "list", "--params", json.dumps(params), "--format", "json"],
            capture_output=True, text=True, timeout=30
        )
        if not result.stdout.strip():
            return []
        data = json.loads(result.stdout)
        events = data.get("items", [])
        return events
    except Exception as e:
        print(f"Calendar fetch error: {e}")
        return []

def parse_time(dt_str):
    """Parse ISO datetime string and return CT datetime."""
    if not dt_str:
        return None
    try:
        dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
        return dt.astimezone(CT)
    except:
        return None

def is_all_day_event(event):
    """Check if event is an all-day event (Google: 'date' field OR midnight-to-midnight >= 23h)."""
    start_dt = event.get("start", {}).get("dateTime", "")
    end_dt   = event.get("end", {}).get("dateTime", "")
    # True all-day: Google uses 'date' not 'dateTime'
    if event.get("start", {}).get("date"):
        return True
    # Midnight-to-midnight events (>=23h) are all-day
    if start_dt and end_dt:
        try:
            s = datetime.fromisoformat(start_dt.replace("Z", "+00:00")).astimezone(CT)
            e = datetime.fromisoformat(end_dt.replace("Z", "+00:00")).astimezone(CT)
            if s.hour == 0 and s.minute == 0:
                duration = (e - s).total_seconds()
                if duration >= 82800:
                    return True
        except:
            pass
    return False

def classify_event(summary):
    """Classify event type by keyword matching."""
    s = summary.lower()
    if any(k in s for k in ["school", "franklin", "mae", "homework", "pickup", "dropoff", "bus", "fultondale", "smitherman"]):
        return "school"
    if any(k in s for k in ["doctor", "dentist", "therapy", "appointment", "medical", "checkup", "vet"]):
        return "appointment"
    if any(k in s for k in ["party", "birthday", "playdate", "friend", "invite", "celebration"]):
        return "party"
    if any(k in s for k in ["family", "dinner", "outing", "trip", "weekend", "holiday"]):
        return "family"
    return "default"

def format_event(event, is_all_day=False):
    """Format a single event into a display-friendly dict."""
    start = parse_time(event.get("start", {}).get("dateTime", ""))
    end   = parse_time(event.get("end", {}).get("dateTime", ""))
    summary = event.get("summary", "Busy")
    location = event.get("location", "")
    cal_type = classify_event(summary)
    color = EVENT_COLORS.get(cal_type, EVENT_COLORS["default"])

    if is_all_day:
        time_range = "All Day"
    elif start:
        time_str = start.strftime("%-I:%M %p")
        if end:
            end_str = end.strftime("%-I:%M %p")
            time_range = f"{time_str} – {end_str}"
        else:
            time_range = time_str
    else:
        time_range = "All Day"

    return {
        "summary": summary,
        "time": time_range,
        "time_start": start,
        "location": location,
        "color": color,
        "type": cal_type,
        "is_all_day": is_all_day,
    }

def build_content(events_today, events_tomorrow):
    """Build the display content from events."""
    now = datetime.now(CT)
    current_event = None
    next_event = None

    # Strip time_start for JSON serialization
    def strip_time(events):
        return [{k: v for k, v in e.items() if k != 'time_start'} for e in events]

    today_formatted   = strip_time(events_today)
    tomorrow_formatted = strip_time(events_tomorrow)

    # Determine current/next from non-all-day events
    today_timed = [e for e in events_today if e.get("time_start") and not e.get("is_all_day")]
    today_timed_sorted = sorted(today_timed, key=lambda x: x["time_start"])

    for e in today_timed_sorted:
        if e["time_start"] <= now:
            current_event = e
        elif not next_event:
            next_event = e

    return {
        "today_date": now.strftime("%A, %B %d"),
        "today_events": today_formatted,
        "tomorrow_date": (now + timedelta(days=1)).strftime("%A, %B %d"),
        "tomorrow_events": tomorrow_formatted,
        "current_event": {k: v for k, v in current_event.items() if k != 'time_start'} if current_event else None,
        "next_event": {k: v for k, v in next_event.items() if k != 'time_start'} if next_event else None,
        "count": len(events_today),
        "now_time": now.isoformat(),
    }

def push_to_display(content):
    """Push content to Dobby Display via API."""
    try:
        resp = requests.post(
            f"{DISPLAY_URL}/api/update",
            json={"mode": "family-calendar", "title": "Family Calendar", "content": content},
            timeout=10
        )
        print(f"Display push: {resp.status_code}")
    except Exception as e:
        print(f"Display push failed: {e}")

def main():
    force = "--force-push" in sys.argv

    print("Fetching family calendar...")
    events = get_events(FAMILY_CAL, days=2)
    print(f"Got {len(events)} events")

    now = datetime.now(CT)
    today = now.date()
    tomorrow = today + timedelta(days=1)

    events_today    = []
    events_tomorrow = []

    for event in events:
        all_day = is_all_day_event(event)
        start_dt = event.get("start", {}).get("dateTime", "")
        start_parsed = parse_time(start_dt)

        # All-day events — use 'date' field if available
        if all_day:
            date_str = event.get("start", {}).get("date", "")
            if date_str:
                try:
                    ad_date = datetime.fromisoformat(date_str).date()
                    fe = format_event(event, is_all_day=True)
                    fe["time"] = "All Day"
                    if ad_date == today:
                        events_today.append(fe)
                    elif ad_date == tomorrow:
                        events_tomorrow.append(fe)
                except:
                    pass
            elif start_parsed:
                fe = format_event(event, is_all_day=True)
                fe["time"] = "All Day"
                ed = start_parsed.date()
                if ed == today:
                    events_today.append(fe)
                elif ed == tomorrow:
                    events_tomorrow.append(fe)
            continue

        # Timed events
        if not start_parsed:
            continue

        ed = start_parsed.date()
        fe = format_event(event)
        if ed == today:
            events_today.append(fe)
        elif ed == tomorrow:
            events_tomorrow.append(fe)

    # Sort by time
    events_today.sort(key=lambda x: x.get("time_start") or datetime.max)
    events_tomorrow.sort(key=lambda x: x.get("time_start") or datetime.max)

    print(f"Today: {len(events_today)} events")
    print(f"Tomorrow: {len(events_tomorrow)} events")
    for e in events_today:
        print(f"  TODAY: {e['time']} — {e['summary']}")
    for e in events_tomorrow:
        print(f"  TOMORROW: {e['time']} — {e['summary']}")

    content = build_content(events_today, events_tomorrow)

    if force:
        push_to_display(content)
        print("Pushed to display")
    else:
        print(json.dumps(content, indent=2, default=str))

if __name__ == "__main__":
    main()