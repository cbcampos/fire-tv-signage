#!/usr/bin/env python3
"""Check all calendars from now until midnight today (local CT)."""
import subprocess
import json
import sys
from datetime import datetime, timezone, timedelta

CT = timezone(timedelta(hours=-5))

calendars = [
    ("FAMILY", "fg5muo04j8joetgfjdtgjtccvo@group.calendar.google.com"),
    ("PERSONAL", "chris.campos@gmail.com"),
    ("WORK", "fhlfinoatou6fk56foeu1e820uld5n76@import.calendar.google.com"),
]


def extract_error_message(stderr: str) -> str:
    text = (stderr or "").strip()
    if not text:
        return "unknown gws error"
    if "invalid_grant" in text or "expired or revoked" in text:
        return "gws auth expired or revoked"
    return text.splitlines()[-1]


now = datetime.now(CT)
today_ct = now.date()
midnight_ct = datetime.combine(today_ct, datetime.max.time()).replace(tzinfo=CT)

had_error = False

for name, cal_id in calendars:
    params = {
        "calendarId": cal_id,
        "timeMin": now.isoformat(),
        "timeMax": midnight_ct.isoformat(),
        "maxResults": 10,
        "singleEvents": True,
        "orderBy": "startTime"
    }

    result = subprocess.run(
        ["gws", "calendar", "events", "list", "--params", json.dumps(params)],
        capture_output=True, text=True
    )

    if result.returncode != 0:
        had_error = True
        print(f"{name}: ERROR - {extract_error_message(result.stderr)}")
        continue

    data = json.loads(result.stdout)
    items = data.get("items", [])

    if not items:
        print(f"{name}: No events")
        continue

    print(f"📅 {name}:")
    for event in items:
        start = event.get("start", {})
        summary = event.get("summary", "No title")
        dt_val = start.get("dateTime", "")
        if dt_val:
            dt = datetime.fromisoformat(dt_val.replace("Z", "+00:00"))
            dt_ct = dt.astimezone(CT).replace(tzinfo=None)
            time_str = dt_ct.strftime("%-I:%M %p")
            if name == "WORK":
                time_str += " CT"
        else:
            time_str = "All day"
        print(f"  {time_str}: {summary}")
    print("")

if had_error:
    sys.exit(1)
