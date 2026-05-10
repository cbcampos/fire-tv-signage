#!/usr/bin/env python3
"""Simple API server for dashboard data — calendar (today + week) + weather."""
import http.server
import json
import subprocess
from datetime import datetime, timezone, timedelta

PORT = 8891

CT = timezone(timedelta(hours=-5))

def get_events(days=7):
    """Fetch events from family + work calendars for the next N days."""
    calendars = [
        ("FAMILY", "fg5muo04j8joetgfjdtgjtccvo@group.calendar.google.com"),
        ("PERSONAL", "chris.campos@gmail.com"),
    ]
    now = datetime.now(CT)
    end = now + timedelta(days=days)
    events = []
    for name, cal_id in calendars:
        params = {
            "calendarId": cal_id,
            "timeMin": now.isoformat(),
            "timeMax": end.isoformat(),
            "maxResults": 20,
            "singleEvents": True,
            "orderBy": "startTime"
        }
        result = subprocess.run(
            ["gws", "calendar", "events", "list", "--params", json.dumps(params)],
            capture_output=True, text=True
        )
        if result.returncode != 0:
            continue
        data = json.loads(result.stdout)
        for event in data.get("items", []):
            start = event.get("start", {})
            dt_val = start.get("dateTime", "")
            if dt_val:
                dt = datetime.fromisoformat(dt_val.replace("Z", "+00:00")).astimezone(CT)
                date_str = dt.strftime("%m/%d")
                time_str = dt.strftime("%-I:%M %p")
                day_str = dt.strftime("%a")
            else:
                date_str = start.get("date", "")[:10]
                time_str = "All day"
                day_str = ""
            events.append({
                "time": time_str,
                "summary": event.get("summary", "No title"),
                "calendar": name,
                "dateStr": date_str,
                "dayStr": day_str,
            })
    return events

def get_today_events():
    """Today only — for the main calendar card."""
    now = datetime.now(CT)
    today_ct = now.date()
    midnight_ct = datetime.combine(today_ct, datetime.max.time()).replace(tzinfo=CT)
    return get_events_range(now, midnight_ct)

def get_events_range(start_dt, end_dt):
    events = []
    calendars = [
        ("FAMILY", "fg5muo04j8joetgfjdtgjtccvo@group.calendar.google.com"),
        ("PERSONAL", "chris.campos@gmail.com"),
    ]
    for name, cal_id in calendars:
        params = {
            "calendarId": cal_id,
            "timeMin": start_dt.isoformat(),
            "timeMax": end_dt.isoformat(),
            "maxResults": 20,
            "singleEvents": True,
            "orderBy": "startTime"
        }
        result = subprocess.run(
            ["gws", "calendar", "events", "list", "--params", json.dumps(params)],
            capture_output=True, text=True
        )
        if result.returncode != 0:
            continue
        data = json.loads(result.stdout)
        for event in data.get("items", []):
            start = event.get("start", {})
            dt_val = start.get("dateTime", "")
            if dt_val:
                dt = datetime.fromisoformat(dt_val.replace("Z", "+00:00")).astimezone(CT).replace(tzinfo=None)
                time_str = dt.strftime("%-I:%M %p")
            else:
                time_str = "All day"
            events.append({
                "time": time_str,
                "summary": event.get("summary", "No title"),
                "calendar": name
            })
    return events

def get_weather():
    try:
        result = subprocess.run(
            ["curl", "-s", "wttr.in/Fultondale?format=j1"],
            capture_output=True, text=True, timeout=5
        )
        if result.returncode != 0:
            return None
        data = json.loads(result.stdout)
        current = data.get("current_condition", [{}])[0]
        return {
            "temp": current.get("temp_F", "?"),
            "condition": current.get("weatherDesc", [{}])[0].get("value", "Unknown"),
            "humidity": current.get("humidity", "?"),
            "wind": current.get("windspeedMiles", "?"),
            "windDir": current.get("winddir16Point", "?"),
            "feelsLike": current.get("FeelsLikeF", "?"),
            "uv": current.get("uvIndex", "?"),
        }
    except Exception:
        return None

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/data":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()

            now = datetime.now(CT)
            today_start = now
            today_end = datetime.combine(now.date(), datetime.max.time()).replace(tzinfo=CT)
            week_end = now + timedelta(days=7)

            today_events = get_events_range(today_start, today_end)
            week_events = get_events(7)

            data = {
                "today": today_events,
                "week": week_events,
                "weather": get_weather(),
                "generated": now.isoformat()
            }
            self.wfile.write(json.dumps(data).encode())
            return
        elif self.path == "/refresh":
            # Run refresh script and return result
            import os
            result = subprocess.run(
                ["bash", os.path.expanduser("~/.openclaw/workspace/scripts/refresh-family-calendar.sh")],
                capture_output=True, text=True, timeout=60
            )
            resp = {
                "ok": result.returncode == 0,
                "output": (result.stdout + result.stderr)[:500],
                "timestamp": datetime.now(CT).isoformat()
            }
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps(resp).encode())
            return
        self.send_response(404)
        self.end_headers()

    def log_message(self, format, *args):
        pass

server = http.server.HTTPServer(("0.0.0.0", PORT), Handler)
print(f"Dashboard data server running on port {PORT}")
server.serve_forever()