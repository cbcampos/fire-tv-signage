#!/usr/bin/env python3
"""
bee-cron-fallback-watchdog.py
Detects the silent-fallback failure mode in the Bee Live Capture cron and re-triggers it.

Failure mode (observed 2026-06-05 14:37 + 15:07 CT):
  1. M2.7 (minimax-portal) returns 200 OK with `content: []` and 0 usage.
  2. Gateway's empty-content handler falls back to gpt-5.5.
  3. Fallback runs cold (no prompt context) — emits 9 tokens, exits.
  4. User sees no Discord ping; cron appears to have run but did nothing.

Signature in the runs log:
  - jobId: 666809fb-8df6-4f7d-b45b-0226450ae443
  - model: "gpt-5.5"
  - provider: "openai"
  - usage.input_tokens < 5000  (the empty-fallback threshold)
  - deliveryStatus: "not-delivered"  (the cron returned HEARTBEAT_OK with no findings)
  - summary: starts with "HEARTBEAT_OK"
  - runId does NOT start with "manual:"  (i.e. this was a scheduled run)

Action when detected:
  - Re-trigger the cron via `openclaw cron run <id>` (runMode=force)
  - Log a record to cron/bee-live-capture-watchdog/YYYY-MM-DD/runs.jsonl
  - Skip if we already retried this runId (avoid infinite loops)
  - Alert Chris if 3+ consecutive retries have all also failed
"""

from __future__ import annotations
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

CRON_JOB_ID = "666809fb-8df6-4f7d-b45b-0226450ae443"
JOB_NAME = "Bee Live Capture Heartbeat"
EMPTY_FALLBACK_INPUT_TOKEN_THRESHOLD = 5000
MAX_CONSECUTIVE_RETRIES = 3
LOG_DIR = Path.home() / ".openclaw/workspace/cron/bee-live-capture-watchdog"
STATE_FILE = Path.home() / ".openclaw/workspace/state/bee-cron-watchdog.json"


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def today_local() -> str:
    return datetime.now().astimezone().strftime("%Y-%m-%d")


def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except (OSError, json.JSONDecodeError):
            pass
    return {"retried_run_ids": [], "consecutive_failed_retries": 0}


def save_state(state: dict) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    # Prune retried_run_ids to last 100
    state["retried_run_ids"] = state["retried_run_ids"][-100:]
    STATE_FILE.write_text(json.dumps(state, indent=2))


def get_recent_runs(limit: int = 6) -> list[dict]:
    """Pull the last N runs of the cron job as JSON."""
    try:
        result = subprocess.run(
            ["openclaw", "cron", "runs", "--id", CRON_JOB_ID, "--limit", str(limit)],
            capture_output=True, text=True, timeout=20,
        )
        if result.returncode != 0:
            return []
        # Output is JSON
        data = json.loads(result.stdout)
        # Shape may be {"entries": [...]} or [...]
        if isinstance(data, dict) and "entries" in data:
            return data["entries"]
        if isinstance(data, list):
            return data
        return []
    except (subprocess.TimeoutExpired, json.JSONDecodeError, OSError):
        return []


def is_empty_fallback_scheduled_run(entry: dict) -> bool:
    """True if this is a scheduled run that hit the empty-fallback bug."""
    if entry.get("model") != "gpt-5.5":
        return False
    if entry.get("provider") != "openai":
        return False
    run_id = entry.get("runId", "")
    if run_id.startswith("manual:"):
        return False  # manual runs are not the bug
    # deliveryStatus "not-delivered" + summary "HEARTBEAT_OK" + tiny input = empty fallback
    if entry.get("deliveryStatus") != "not-delivered":
        return False
    summary = (entry.get("summary") or "").strip()
    if not summary.startswith("HEARTBEAT_OK"):
        return False
    usage = entry.get("usage") or {}
    in_tok = usage.get("input_tokens", 999999)
    if in_tok >= EMPTY_FALLBACK_INPUT_TOKEN_THRESHOLD:
        return False
    return True


def log_event(event: dict) -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_path = LOG_DIR / today_local() / "runs.jsonl"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with log_path.open("a") as f:
        f.write(json.dumps(event) + "\n")


def re_trigger_cron() -> tuple[bool, str]:
    """Re-trigger the cron job. Returns (ok, message)."""
    try:
        result = subprocess.run(
            ["openclaw", "cron", "run", CRON_JOB_ID],
            capture_output=True, text=True, timeout=60,
        )
        return result.returncode == 0, (result.stdout or result.stderr or "").strip()[:500]
    except subprocess.TimeoutExpired:
        return False, "openclaw cron run timed out"
    except OSError as e:
        return False, f"openclaw cron run failed: {e}"


def main() -> int:
    runs = get_recent_runs(limit=6)
    if not runs:
        log_event({"ts": now_iso(), "kind": "no_runs", "detail": "could not fetch runs log"})
        return 0

    state = load_state()
    retried_ids = set(state.get("retried_run_ids", []))
    consecutive_failed = state.get("consecutive_failed_retries", 0)

    # Find the most recent empty-fallback scheduled run that we haven't retried yet
    target = None
    for entry in runs:
        run_id = entry.get("runId") or entry.get("sessionId", "")
        if not run_id or run_id in retried_ids:
            continue
        if is_empty_fallback_scheduled_run(entry):
            target = entry
            break

    if target is None:
        # Nothing to retry. Reset consecutive failure counter.
        if consecutive_failed > 0:
            state["consecutive_failed_retries"] = 0
            save_state(state)
            log_event({"ts": now_iso(), "kind": "healthy", "detail": "no empty-fallback runs in last 6; reset counter"})
        return 0

    run_id = target.get("runId") or target.get("sessionId", "")
    run_at = target.get("runAtMs")
    when = datetime.fromtimestamp(run_at / 1000, tz=timezone.utc).isoformat(timespec="seconds") if run_at else "?"
    in_tok = (target.get("usage") or {}).get("input_tokens", "?")

    log_event({
        "ts": now_iso(),
        "kind": "detected",
        "run_id": run_id,
        "run_at_utc": when,
        "input_tokens": in_tok,
        "model": target.get("model"),
        "provider": target.get("provider"),
        "summary": target.get("summary", "")[:200],
    })

    ok, msg = re_trigger_cron()
    log_event({
        "ts": now_iso(),
        "kind": "retried",
        "run_id": run_id,
        "ok": ok,
        "message": msg,
    })

    if ok:
        state["retried_run_ids"].append(run_id)
        state["consecutive_failed_retries"] = 0
        save_state(state)
        print(f"Re-triggered cron for empty-fallback run {run_id} ({when})")
        return 0

    # Retry didn't go through cleanly
    state["retried_run_ids"].append(run_id)
    state["consecutive_failed_retries"] = consecutive_failed + 1
    save_state(state)

    if state["consecutive_failed_retries"] >= MAX_CONSECUTIVE_RETRIES:
        # Persistent failure — alert Chris
        log_event({
            "ts": now_iso(),
            "kind": "alert",
            "level": "critical",
            "consecutive_failed_retries": state["consecutive_failed_retries"],
            "message": f"Watchdog: {state['consecutive_failed_retries']} consecutive empty-fallback runs all failed to re-trigger cleanly. M2.7 provider may be down. Check minimax-portal status.",
        })
        print(f"CRITICAL: {state['consecutive_failed_retries']} consecutive retry failures. Check MiniMax status.", file=sys.stderr)
        return 2

    return 0


if __name__ == "__main__":
    sys.exit(main())
