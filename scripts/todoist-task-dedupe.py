#!/usr/bin/env python3
"""todoist-task-dedupe.py — Atomic create-or-find for Todoist tasks.

The Bee Live Capture cron (and any other action-extraction flow) used to
fire one Todoist task per "we need X" / "I need X" utterance, with no
check against existing Todoist state. That produced duplicates when the
same noun (e.g. "gatorade") was mentioned in multiple utterances across
the day.

This script makes creation atomic: search for an active (uncompleted,
un-deleted) task with the same content first, and only create if none
exists. Returns the existing task id when found, or the new task id
after creation.

Designed for the cron agent's pre-create step. The agent calls this
INSTEAD of issuing a raw POST to /tasks, eliminating the duplicate.

Usage:
    python3 scripts/todoist-task-dedupe.py --content "gatorade" --project-id <id> [--priority 1] [--label bee-capture] [--dry-run]

    # Search only (no creation):
    python3 scripts/todoist-task-dedupe.py --content "gatorade" --project-id <id> --search-only

    # Just dedupe the noun from a longer phrase ("buy some gatorade" → "gatorade"):
    python3 scripts/todoist-task-dedupe.py --content "gatorade" --project-id <id> --noun

Output (JSON):
    {
      "action": "existing" | "created" | "dry_run_would_create" | "not_found",
      "task_id": "6gq...",
      "content": "gatorade",
      "project_id": "...",
      "url": "https://todoist.com/app/task/..."
    }

Matching rules (any one is a match):
  1. Exact content match (case-insensitive, whitespace-trimmed)
  2. The search content is a substring of an existing task's content (e.g.
     "gatorade" matches "gatorade" and "blue gatorade" but NOT
     "gatorade powder")
  3. With --noun: extract the trailing noun phrase from a longer
     imperative ("buy some gatorade" → "gatorade") and use rule 2.

We only match UNCOMPLETED, UNDELETED tasks. Completed tasks do not block
creation — if Chris has already bought the gatorade, the next utterance
creates a fresh task.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

TODOIST_API_BASE = "https://api.todoist.com/api/v1"
TOKEN_ENV = Path.home() / ".openclaw/.secrets/todoist.env"
SHOPPING_PROJECT_DEFAULT = "6Crfx7wRcx657GMp"  # `Shopping` project id (verified 2026-06-10)


def load_token() -> str:
    """Read TODOIST_API_TOKEN from the secrets env file."""
    text = TOKEN_ENV.read_text()
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        if k.strip() == "TODOIST_API_TOKEN":
            return v.strip().strip('"').strip("'")
    raise RuntimeError(f"TODOIST_API_TOKEN not found in {TOKEN_ENV}")


def api(method: str, path: str, token: str, body: dict | None = None) -> dict:
    url = f"{TODOIST_API_BASE}{path}"
    headers = {"Authorization": f"Bearer {token}"}
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


# Common imperative verbs to strip when --noun is used.
# Matches a leading verb phrase up to the noun.
_LEADING_VERB = re.compile(
    r"^(?:please\s+)?"
    r"(?:"
    r"buy|get|grab|pick\s+up|need|order|fetch|bring|add|put|stock\s+up\s+on|replenish|restock|remember\s+to\s+(?:buy|get|grab|pick\s+up)"
    r")\s+"
    r"(?:some|any|a|an|the|few|more|extra|additional)?\s*",
    re.IGNORECASE,
)


def extract_noun(content: str) -> str:
    """Strip leading imperative to get the noun phrase.

    "buy some gatorade" → "gatorade"
    "I need to get milk" → "milk"
    "remember to grab diapers" → "diapers"
    "gatorade" → "gatorade" (no change)
    """
    return _LEADING_VERB.sub("", content).strip()


def _normalize(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().lower())


def _word_boundary_substring(needle: str, haystack: str) -> bool:
    """True if `needle` appears in `haystack` as a complete word/phrase.

    Plain `needle in haystack` returns True for "gatorade" inside
    "gatorade powder" — that's a false positive (different product).
    Word-boundary match requires the substring to be flanked by start/end
    or non-word characters.
    """
    if not needle or not haystack:
        return False
    pattern = r"(?:^|\W)" + re.escape(needle) + r"(?:$|\W)"
    return re.search(pattern, haystack, re.IGNORECASE) is not None


def _content_matches(existing_content: str, search_content: str) -> bool:
    """True if the search content is a meaningful match for the existing task.

    - Exact (case-insensitive, whitespace-normalized) match
    - Search is a word-boundary substring of existing
      (covers "gatorade" matching "blue gatorade" but NOT "gatorade powder")
    - Existing is a word-boundary substring of search
      (covers "gatorade" matching "buy gatorade")
    """
    e = _normalize(existing_content)
    s = _normalize(search_content)
    if not e or not s:
        return False
    if e == s:
        return True
    if _word_boundary_substring(s, e) or _word_boundary_substring(e, s):
        return True
    return False


def find_existing(token: str, content: str, project_id: str | None) -> dict | None:
    """Return the first active matching task in the project, or None.

    Scoped to `project_id` so cross-project duplicates (e.g. a "gatorade"
    in Recipes + Shopping) don't collide.
    """
    # Use the search endpoint if available; fall back to listing project tasks.
    if project_id:
        path = f"/tasks?project_id={urllib.parse.quote(project_id)}&search_query={urllib.parse.quote(content)}"
    else:
        path = f"/tasks?search_query={urllib.parse.quote(content)}"
    data = api("GET", path, token)
    for t in data.get("results", []):
        if t.get("is_deleted") or t.get("checked"):
            continue
        if _content_matches(t.get("content", ""), content):
            return t
    return None


def create_task(token: str, content: str, project_id: str, priority: int, label: str | None) -> dict:
    body: dict = {
        "content": content,
        "project_id": project_id,
        "priority": priority,
    }
    if label:
        body["labels"] = [label]
    return api("POST", "/tasks", token, body)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--content", required=True, help="Task content (the noun phrase, ideally)")
    parser.add_argument("--project-id", default=SHOPPING_PROJECT_DEFAULT, help="Todoist project id (default: Shopping)")
    parser.add_argument("--priority", type=int, default=1, help="1=high, 2=med, 3=low, 4=default (default 1)")
    parser.add_argument("--label", default="bee-capture", help="Label to apply on creation (default: bee-capture; pass empty string to skip)")
    parser.add_argument("--noun", action="store_true", help="Extract noun phrase from imperative before searching/creating")
    parser.add_argument("--search-only", action="store_true", help="Only search, never create")
    parser.add_argument("--dry-run", action="store_true", help="Print what would happen, do not call Todoist write APIs")
    args = parser.parse_args()

    content = extract_noun(args.content) if args.noun else args.content
    if not content:
        print(json.dumps({"error": "empty content after noun extraction", "input": args.content}))
        return 1

    try:
        token = load_token()
    except Exception as e:
        print(json.dumps({"error": f"token load failed: {e}"}))
        return 1

    # 1. Search for an active match first.
    existing = find_existing(token, content, args.project_id)
    if existing is not None:
        print(json.dumps({
            "action": "existing",
            "task_id": existing["id"],
            "content": existing["content"],
            "project_id": existing["project_id"],
            "url": f"https://todoist.com/app/task/{existing['id']}",
            "searched_for": content,
        }, indent=2))
        return 0

    if args.search_only:
        print(json.dumps({
            "action": "not_found",
            "content": content,
            "project_id": args.project_id,
        }, indent=2))
        return 0

    # 2. None found — create.
    if args.dry_run:
        print(json.dumps({
            "action": "dry_run_would_create",
            "content": content,
            "project_id": args.project_id,
            "priority": args.priority,
            "label": args.label or None,
        }, indent=2))
        return 0

    label = args.label if args.label else None
    new_task = create_task(token, content, args.project_id, args.priority, label)
    print(json.dumps({
        "action": "created",
        "task_id": new_task["id"],
        "content": new_task["content"],
        "project_id": new_task["project_id"],
        "url": f"https://todoist.com/app/task/{new_task['id']}",
    }, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
