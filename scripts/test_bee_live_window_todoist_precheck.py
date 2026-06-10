#!/usr/bin/env python3
"""Regression test for Todoist pre-check in bee-live-window.py.

The 2026-06-10 16:16 lemonade × 2 incident: cron created the same noun
twice because the Todoist dedupe check lived in HEARTBEAT.md as a rule
the agent could skip, not as script-level enforcement. This test
verifies the script itself now tags the hit with `existing_task_id`
when a matching active Todoist task exists.

Tests:
  1. Pre-check returns None for unknown nouns (no false positives)
  2. Pre-check finds an exact match in active tasks
  3. Pre-check finds a word-boundary substring match in a longer phrase
  4. Pre-check returns None for closed / completed tasks
     (closed shopping items can re-appear next week)
  5. scan_for_action_phrases tags the hit with existing_task_* when a
     match exists, and leaves them off when none exists
  6. --no-todoist-precheck flag suppresses the lookup (debug-only)
"""
from __future__ import annotations

import importlib.util
import json
import subprocess
import sys
import urllib.parse
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
SCRIPT = SCRIPT_DIR / "bee-live-window.py"
TODOIST_API_BASE = "https://api.todoist.com/api/v1"
SHOPPING_PROJECT = "6Crfx7wRcx657GMp"
TOKEN_ENV = Path.home() / ".openclaw/.secrets/todoist.env"


def _load_module():
    spec = importlib.util.spec_from_file_location("bee_live_window_under_test", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


def _load_token() -> str:
    text = TOKEN_ENV.read_text()
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("TODOIST_API_TOKEN="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise RuntimeError("TODOIST_API_TOKEN not found")


def _api(method: str, path: str, token: str, body: dict | None = None) -> dict:
    url = f"{TODOIST_API_BASE}{path}"
    headers = {"Authorization": f"Bearer {token}"}
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _create_task(token: str, content: str) -> str:
    body = {"content": content, "project_id": SHOPPING_PROJECT, "priority": 1, "labels": ["bee-capture"]}
    return _api("POST", "/tasks", token, body)["id"]


def _close_task(token: str, task_id: str) -> None:
    req = urllib.request.Request(
        f"{TODOIST_API_BASE}/tasks/{task_id}/close", method="POST",
        headers={"Authorization": f"Bearer {token}"},
    )
    urllib.request.urlopen(req, timeout=30).read()


def main() -> int:
    failures = 0
    mod = _load_module()
    token = _load_token()

    # 1. Unknown noun returns None.
    r = mod.check_todoist_duplicate("completely-unknown-noun-aaa-2026-06-10")
    if r is not None:
        print(f"[FAIL] test 1: expected None for unknown noun, got {r}")
        failures += 1
    else:
        print("[PASS] test 1: unknown noun returns None")

    # 2. Exact match — create a unique marker, then look it up.
    marker = f"precheck-marker-test-2026-06-10-{int(__import__('time').time())}"
    task_id = _create_task(token, marker)
    try:
        r = mod.check_todoist_duplicate(f"I need to get {marker}")
        if r is None or r.get("task_id") != task_id:
            print(f"[FAIL] test 2: expected task_id={task_id}, got {r}")
            failures += 1
        else:
            print(f"[PASS] test 2: exact match found ({marker} → {r['task_id']})")

        # 3. Word-boundary substring in a longer phrase.
        r2 = mod.check_todoist_duplicate(f"can you remember to grab {marker} from the store")
        if r2 is None or r2.get("task_id") != task_id:
            print(f"[FAIL] test 3: expected task_id={task_id} in long phrase, got {r2}")
            failures += 1
        else:
            print("[PASS] test 3: word-boundary match in long phrase")

        # 4. Closed task should NOT match.
        _close_task(token, task_id)
        r3 = mod.check_todoist_duplicate(f"please buy {marker}")
        if r3 is not None:
            print(f"[FAIL] test 4: closed task should not match, got {r3}")
            failures += 1
        else:
            print("[PASS] test 4: closed task does not block creation")
        task_id = None  # already closed
    finally:
        if task_id is not None:
            _close_task(token, task_id)

    # 5. scan_for_action_phrases tags existing tasks.
    marker2 = f"precheck-scan-test-2026-06-10-{int(__import__('time').time())}"
    task_id2 = _create_task(token, marker2)
    try:
        conv = {
            "transcriptions": [
                {
                    "utterances": [
                        {"start": 1000, "text": f"I think we need some {marker2} today.", "speaker": "Chris"},
                    ]
                }
            ]
        }
        hits = mod.scan_for_action_phrases(conv, todoist_precheck=True)
        if not hits:
            print("[FAIL] test 5a: scan returned no hits")
            failures += 1
        else:
            hit = hits[0]
            if hit.get("existing_task_id") != task_id2:
                print(f"[FAIL] test 5b: hit not tagged with existing_task_id, got {hit}")
                failures += 1
            else:
                print(f"[PASS] test 5: scan tag applied (hit.existing_task_id={task_id2})")

        # 5c. --no-todoist-precheck suppresses the lookup.
        hits_off = mod.scan_for_action_phrases(conv, todoist_precheck=False)
        if hits_off and hits_off[0].get("existing_task_id"):
            print(f"[FAIL] test 5c: precheck off but hit was tagged: {hits_off[0]}")
            failures += 1
        else:
            print("[PASS] test 5c: precheck off leaves hit untagged")
    finally:
        _close_task(token, task_id2)

    # 6. CLI smoke: --no-todoist-precheck is accepted.
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), "--minutes", "30", "--no-todoist-precheck", "--quiet"],
        capture_output=True, text=True, timeout=60,
    )
    if proc.returncode not in (0, 1):  # 1 = "no active convs" is fine
        print(f"[FAIL] test 6: CLI with --no-todoist-precheck rc={proc.returncode}: {proc.stderr}")
        failures += 1
    else:
        print(f"[PASS] test 6: --no-todoist-precheck accepted (rc={proc.returncode})")

    if failures:
        print(f"\n{failures} test(s) failed")
        return 1
    print("\nAll precheck tests pass")
    return 0


if __name__ == "__main__":
    sys.exit(main())
