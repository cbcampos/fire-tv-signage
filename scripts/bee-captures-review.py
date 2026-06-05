#!/usr/bin/env python3
"""Bee Captures Review — query Todoist for tasks with `bee-capture` label,
emit a Discord-friendly summary so Chris can review in one place.

Reads Todoist API for tasks created in the last N hours with the `bee-capture` label.
Outputs structured text for Discord posting.
"""
from __future__ import annotations
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

TODOIST_TOKEN_PATH = Path.home() / ".openclaw/.secrets/todoist.env"
CENTRAL = timezone(timedelta(hours=-5))  # America/Chicago (no DST in this season; adjust if needed)


def load_token() -> str:
    if not TODOIST_TOKEN_PATH.exists():
        sys.exit(f"ERROR: token file not found at {TODOIST_TOKEN_PATH}")
    for line in TODOIST_TOKEN_PATH.read_text().splitlines():
        if line.startswith("TODOIST_API_TOKEN="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    sys.exit("ERROR: TODOIST_API_TOKEN not in env file")


def get_todoist_tasks_with_label(label: str, hours: int) -> list[dict]:
    """Fetch all open tasks with the given label, then filter to those created in the last N hours."""
    import urllib.request
    token = load_token()
    req = urllib.request.Request(
        "https://api.todoist.com/api/v1/tasks?label=bee-capture",
        headers={"Authorization": f"Bearer {token}"}
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.loads(r.read().decode())
    tasks = data.get("results", data if isinstance(data, list) else [])
    cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
    out = []
    for t in tasks:
        added = t.get("added_at") or ""
        # added_at is e.g. "2026-06-05T17:20:27.002417Z"
        try:
            added_dt = datetime.fromisoformat(added.replace("Z", "+00:00"))
        except ValueError:
            continue
        if added_dt >= cutoff:
            out.append(t)
    return out


def fmt_added(added_at: str) -> str:
    try:
        dt = datetime.fromisoformat(added_at.replace("Z", "+00:00")).astimezone(CENTRAL)
        return dt.strftime("%-I:%M %p")
    except Exception:
        return "?"


def main() -> int:
    import argparse
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--hours", type=int, default=24, help="Window in hours (default 24)")
    p.add_argument("--json", action="store_true", help="Emit raw JSON instead of formatted text")
    p.add_argument("--dry-run", action="store_true", help="Don't error on connection issues")
    args = p.parse_args()

    try:
        tasks = get_todoist_tasks_with_label("bee-capture", args.hours)
    except Exception as e:
        print(f"ERROR fetching tasks: {e}", file=sys.stderr)
        if args.dry_run:
            return 0
        return 1

    if args.json:
        print(json.dumps(tasks, indent=2, sort_keys=True))
        return 0

    # Format as Discord-friendly blocks
    print(f"# 🐝 Bee Captures — Last {args.hours}h")
    print()
    if not tasks:
        print("_No Bee-captured tasks in this window._")
        return 0
    print(f"**{len(tasks)} task(s) captured from Bee live audio:**")
    print()
    for t in sorted(tasks, key=lambda x: x.get("added_at", "")):
        content = t.get("content", "(no content)")
        tid = t.get("id", "?")
        added = fmt_added(t.get("added_at", ""))
        priority = t.get("priority", 1)
        due = t.get("due") or {}
        due_str = due.get("date", "no due date") if isinstance(due, dict) else "no due date"
        project_id = t.get("project_id", "?")
        # Direct task URL — Todoist web app uses /app/task/<id>
        url = f"https://todoist.com/app/task/{tid}"
        # API priority values are inverted vs UI: API 4 = UI P1 (urgent), API 1 = UI P4 (no priority)
        priority_label = {1: "P4", 2: "P3", 3: "P2", 4: "P1"}.get(priority, "P?")
        completed = t.get("checked", False) or t.get("completed_at")
        status = " ✓ completed" if completed else ""
        print(f"- **[{added}] {content}** (`{tid}`) — {priority_label}, due {due_str}{status} — <{url}>")
    print()
    print(f"_Tasks are labeled `bee-capture`. To bulk-delete false positives: Todoist → filter by label → multi-select → delete. If a task is missing, refresh the Todoist app — newly created tasks can take ~5-10 min to sync to mobile/web._")


if __name__ == "__main__":
    sys.exit(main() or 0)
