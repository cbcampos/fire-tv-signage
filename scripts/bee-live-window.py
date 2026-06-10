#!/usr/bin/env python3
"""
bee-live-window.py — Pull the last N minutes of Bee live activity for the heartbeat.

Wraps `bee now --json`, identifies conversations that are CAPTURING (still
active) or completed within the window, and emits a compact summary the
heartbeat agent can act on.

CRITICAL: Tracks per-conversation "acted through utterance N" so a LIVE
conversation that falls in every 20-min run window is NOT re-processed
unless new utterances have appeared. This is what was wrong with the
ketchup duplicate: the same LIVE conversation was being acted on every
cron run.

Usage:
    python3 scripts/bee-live-window.py [--minutes 30] [--json] [--quiet]
    python3 scripts/bee-live-window.py --mark-acted <conv_id> --through-utterances <N>
    python3 scripts/bee-live-window.py --reset-acted

Output (text, default):
    A short block per conversation with id, state, started/ended, summary, and
    recent utterances. Includes an `acted_through: N | untracked` line so the
    agent knows whether this is fresh content or a re-pull of already-processed
    utterances.

Output (--json): raw structured data with `acted_through_utterances` and
`new_utterances` fields per conversation.
"""
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

STATE_DIR = Path.home() / ".openclaw/workspace/state"
STATE_FILE = STATE_DIR / "bee-live-acted.json"

# Audit trail: every cron run writes one record to a daily JSONL file.
# This gives us a local, queryable history of what the cron saw and what
# it did — independent of Discord's message store.
AUDIT_ROOT = Path.home() / ".openclaw/workspace/cron/bee-live-capture"


def audit_path_for_now() -> Path:
    day = now_local().strftime("%Y-%m-%d")
    return AUDIT_ROOT / day / "runs.jsonl"


def write_audit_record(record: dict) -> None:
    p = audit_path_for_now()
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, sort_keys=True) + "\n")

# Each block in the per-conversation output begins with a line that the
# agent can use to know which conversation to mark as acted-on.
# Format: "Conversation <id> — state=..."


def now_local() -> datetime:
    return datetime.now().astimezone()


def now_local() -> datetime:
    return datetime.now().astimezone()


def millis_to_local(ms: int | None) -> datetime | None:
    if ms is None:
        return None
    try:
        return datetime.fromtimestamp(ms / 1000, tz=now_local().tzinfo)
    except (ValueError, TypeError, OSError):
        return None


def format_age(then: datetime | None) -> str:
    if then is None:
        return "unknown"
    delta = now_local() - then
    secs = int(delta.total_seconds())
    if secs < 0:
        return "in the future?"
    if secs < 60:
        return f"{secs}s ago"
    if secs < 3600:
        return f"{secs // 60}m ago"
    if secs < 86400:
        return f"{secs // 3600}h ago"
    return f"{secs // 86400}d ago"


def call_bee_now() -> list[dict]:
    proc = subprocess.run(
        ["bee", "now", "--json"],
        capture_output=True,
        text=True,
        timeout=20,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"bee now failed: {proc.stderr.strip()}")
    raw = proc.stdout.strip()
    if not raw:
        return []
    data = json.loads(raw)
    if isinstance(data, dict):
        return data.get("conversations") or []
    if isinstance(data, list):
        return data
    return []


def _latest_utterance_ms(conv: dict) -> int | None:
    """Return the most recent spoken_at (ms) across all utterances, or None."""
    latest = None
    for tg in conv.get("transcriptions") or []:
        for u in tg.get("utterances") or []:
            sa = u.get("spoken_at")
            if isinstance(sa, (int, float)) and (latest is None or sa > latest):
                latest = sa
    return latest


def in_window(conv: dict, minutes: int) -> bool:
    """A conversation is in-window if any of:
    - it's CAPTURING AND has had utterance activity in the last `2 * minutes` minutes
      (freshness check, not just state — a stale CAPTURING conv that's been
      Bee-finalized-but-not-yet-marked can sit for an hour; we exclude it)
    - it's CAPTURING AND started within the last `2 * minutes` minutes
      (covers the case where a fresh conv has 0 utterances yet)
    - its end_time is within the last `minutes` minutes (recently completed)
    - its start_time is within the last `minutes` minutes (in-progress)
    """
    state = (conv.get("state") or "").upper()
    now = now_local()
    freshness_window = minutes * 60 * 2  # 2x the time window for CAPTURING grace

    if state == "CAPTURING":
        # Stale-CAPTURING guard: a conv that's been CAPTURING for >2x the
        # window with no recent utterance activity is not "in the last N min" —
        # it's a held-over session Bee hasn't finalized yet (the 2026-06-05 12:31
        # cron run that surfaced a 1.5-hour-old work call is the bug this fixes).
        latest_utt = _latest_utterance_ms(conv)
        if latest_utt is not None:
            age_secs = (now - millis_to_local(latest_utt)).total_seconds()
            if age_secs <= freshness_window:
                return True
        # No utterances yet — fall back to start_time.
        start = millis_to_local(conv.get("start_time"))
        if start is not None:
            return (now - start).total_seconds() <= freshness_window
        return False
    # Defensive: any "active-sounding" state name should pass the time check.
    if state in ("RECORDING", "LIVE", "ACTIVE", "IN_PROGRESS", "OPEN"):
        return True
    end = millis_to_local(conv.get("end_time"))
    if end is not None:
        return (now - end).total_seconds() <= minutes * 60
    start = millis_to_local(conv.get("start_time"))
    if start is not None:
        return (now - start).total_seconds() <= minutes * 60
    return False


def summarize(conv: dict, acted_through: int | None = None) -> str:
    conv_id = conv.get("id") or conv.get("conversation_id") or "?"
    state = (conv.get("state") or "UNKNOWN").upper()
    start_dt = millis_to_local(conv.get("start_time"))
    end_dt = millis_to_local(conv.get("end_time"))
    short = conv.get("short_summary") or ""
    full = conv.get("summary") or ""
    is_live = state == "CAPTURING"

    transcriptions = conv.get("transcriptions") or []
    utterances = []
    for t in transcriptions:
        for u in (t.get("utterances") or []):
            utterances.append(u)
    utterances.sort(key=lambda u: (u.get("start") is None, u.get("start") or 0))

    total_utts = len(utterances)
    new_count = max(0, total_utts - (acted_through or 0)) if acted_through is not None else total_utts
    acted_status = (
        f"acted_through_utterances: {acted_through} (new since last action: {new_count})"
        if acted_through is not None
        else "acted_through_utterances: untracked (treat as fresh)"
    )

    # Slice to show only NEW utterances when we've already acted on some.
    # Always cap at 25 for readability.
    if acted_through is not None and acted_through > 0:
        recent_pool = utterances[acted_through:]
        recent = recent_pool[-25:] if len(recent_pool) > 25 else recent_pool
    else:
        recent = utterances[-25:] if total_utts > 25 else utterances
    utt_lines = []
    for u in recent:
        speaker = u.get("speaker") or "Unknown"
        text = (u.get("text") or "").strip()
        if not text:
            continue
        utt_lines.append(f"  - {speaker}: {text}")

    time_line = f"started {start_dt.strftime('%Y-%m-%d %H:%M') if start_dt else '?'} ({format_age(start_dt)})"
    if end_dt:
        time_line += f", ended {end_dt.strftime('%H:%M')} ({format_age(end_dt)})"

    block = [f"Conversation {conv_id} — state={state}, {time_line}"]
    block.append(acted_status)
    if is_live:
        # Make it obvious this is a live feed, not stale data.
        block.append("🔴 LIVE CAPTURE — Bee is still recording. Summary not yet generated.")
    if full:
        block.append(f"Summary:\n{full}")
        if short and short != full:
            block.append(f"Short: {short}")
    elif short:
        block.append(f"Summary: {short}")
    else:
        if is_live:
            block.append("Summary: (not yet — Bee generates this when the conversation ends)")
        else:
            block.append("Summary: (no summary)")
    if utt_lines:
        block.append(f"Recent utterances ({len(recent)} of {len(utterances)} total):")
        block.extend(utt_lines)
    elif is_live:
        block.append("Recent utterances: (none yet — conversation just started)")
    return "\n".join(block)


def _load_state() -> dict:
    if not STATE_FILE.exists():
        return {"conversations": {}}
    try:
        return json.loads(STATE_FILE.read_text())
    except (json.JSONDecodeError, OSError):
        return {"conversations": {}}


def _save_state(state: dict) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, indent=2, sort_keys=True))
    tmp.replace(STATE_FILE)


def _conv_id(conv: dict) -> str:
    return str(conv.get("id") or conv.get("conversation_id") or "?")


def _total_utterances(conv: dict) -> int:
    total = 0
    for t in conv.get("transcriptions") or []:
        total += len(t.get("utterances") or [])
    return total


# Action-phrase patterns the cron's second pass scans for. Order matters:
# the FIRST match per utterance wins, so more specific patterns come first.
# These are the phrases that have caught Chris off-guard when missed.
# Bias 2026-06-05 14:21 CT: cast a wider net. The cost of a missed task is high;
# the cost of a false positive is one tap to delete. When in doubt, capture.
ACTION_PATTERNS: list[tuple[str, str]] = [
    # === First-person self-reminders (default-actionable, high signal) ===
    (r"\bI\s+(?:need|have|got|gotta|should|want|wish|hope)\s+to\b", "I need/have/got/gotta/should/want to"),
    (r"\bI'?m\s+(?:going|gonna|planning|about)\s+to\b", "I'm going to / gonna"),
    (r"\bI'?ll\s+(?:have\s+to|need\s+to|try\s+to|get|grab|pick\s+up|call|send|email|text|message|schedule|book)\b", "I'll X"),
    (r"\bI\s+should\b", "I should"),
    (r"\bI\s+want\s+to\b", "I want to"),
    (r"\bI\s+have\s+to\b", "I have to"),
    (r"\bI\s+got\s+to\b", "I got to"),
    (r"\bI\s+need\s+(?!\s*to\s)\w+", "I need [noun]"),  # added 2026-06-09 21:55 — "I need milk" without "to"
    (r"\bgotta\b", "gotta"),
    (r"\bgot\s+to\b", "got to"),
    (r"\bhave\s+to\b", "have to"),
    (r"\bneed\s+to\b", "need to"),
    (r"\bremind\s+me\s+to\b", "remind me to"),
    (r"\bremember\s+to\b", "remember to"),
    (r"\bdon.?t\s+forget\b", "don't forget"),
    # === First-person shared / family tasks ===
    (r"\bwe\s+need\s+to\b", "we need to"),
    (r"\bwe\s+need\s+(?!\s*to\s)\w+", "we need [noun]"),  # added 2026-06-09 21:55 — "we need milk/ice cream" without "to"
    (r"\bwe\s+have\s+to\b", "we have to"),
    (r"\bwe\s+should\b", "we should"),
    (r"\blet'?s\s+(?!you|me|him|her|them|us|see|go|play|try|put|get|do\s+you|do\s+we|do\s+it|just)\w+", "let's X (not phatic)"),
    # === Explicit scheduling / booking ===
    (r"\bschedule\b", "schedule"),
    (r"\breschedule\b", "reschedule"),
    (r"\bcancel\s+(?:the|my|a|an|\w+\s+(?:meeting|appointment|call|reservation|order))", "cancel X"),
    (r"\bbook\b", "book"),
    (r"\bset\s+(?:up|a|an|the)\s+(?:meeting|appointment|call|reminder|recurring)\b", "set up a/an X"),
    (r"\badd\s+to\s+(?:calendar|todoist|list|order)\b", "add to [calendar/todoist/list/order]"),
    # === Shopping / errand / pickup ===
    (r"\bbuy\b\s+\w+", "buy X"),
    (r"\bget\s+\w+\s+from\b", "get X from [store]"),
    (r"\bget\s+\w+\s+at\b", "get X at [place]"),
    (r"\bneed\s+(?:\w+\s+){0,3}from\s+", "need X from [store]"),
    (r"\bpick\s+up\b", "pick up"),
    (r"\bout\s+of\b", "out of"),
    (r"\bWalmart\b|\bTarget\b|\bCostco\b|\bPublix\b|\bWhole\s+Foods\b|\bAmazon\b", "[store] mention"),
    (r"\bnext\s+order\b", "next order"),
    # === Communication tasks (these need more context — see triaging) ===
    (r"\btell\s+\w+\s+to\b", "tell X to Y"),
    (r"\btext\s+\w+", "text X"),
    (r"\bemail\s+\w+", "email X"),
    (r"\bmessage\s+\w+", "message X"),
    (r"\bDM\s+", "DM X"),
    (r"\bcall\s+(?:the|my|a|an|dr\.|doctor|dentist|Amanda|Franklin|Mae|Mom|Dad|Bank|insurance|pharmacy)", "call X (named/known)"),
    (r"\bsend\s+\w+\s+(?:to|the|an|a)\b", "send X to"),
    # === Action verbs (more context needed — handle in triaging) ===
    (r"\blet\s+\w+\s+know\b", "let X know"),
    (r"\bfollow\s+up\b", "follow up"),
    (r"\bcircle\s+back\b", "circle back"),
    (r"\bcheck\s+(?:on|in|with)\b", "check on/in/with"),
    (r"\btake\s+\w+\s+to\b", "take X to"),
    (r"\bpost\b|\bpublish\b|\bship\b", "post/publish/ship"),
]


# Default Todoist project for the Bee Live pre-check. The same value the
# todoist-task-dedupe.py helper uses as its default. Keep these in sync.
TODOIST_SHOPPING_PROJECT = "6Crfx7wRcx657GMp"
TODOIST_TOKEN_ENV = Path.home() / ".openclaw/.secrets/todoist.env"


def _load_todoist_token() -> str | None:
    """Read TODOIST_API_TOKEN from the secrets env file. None if unavailable."""
    try:
        text = TODOIST_TOKEN_ENV.read_text()
    except OSError:
        return None
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        if k.strip() == "TODOIST_API_TOKEN":
            return v.strip().strip('"').strip("'")
    return None


# Reuse the noun extractor + content matcher from the dedupe helper so the
# pre-check matches the same semantics the helper enforces at create time.
# Importing the helper as a module (filename has hyphens) via importlib.
def _import_dedupe_helpers() -> tuple | None:
    """Return (extract_noun, _content_matches) or None on import failure."""
    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location(
            "todoist_task_dedupe",
            Path(__file__).parent / "todoist-task-dedupe.py",
        )
        if not spec or not spec.loader:
            return None
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)  # type: ignore[union-attr]
        return mod.extract_noun, mod._content_matches
    except Exception:
        return None


def _todoist_search(token: str, content: str, project_id: str) -> list[dict]:
    """Return active tasks in `project_id` whose content matches `content`.
    Uses the Todoist v1 search endpoint with project_id + search_query.
    """
    import urllib.parse
    import urllib.request
    path = (
        f"/tasks?project_id={urllib.parse.quote(project_id)}"
        f"&search_query={urllib.parse.quote(content)}"
    )
    url = f"https://api.todoist.com/api/v1{path}"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return [t for t in data.get("results", []) if not t.get("is_deleted") and not t.get("checked")]


def check_todoist_duplicate(
    text: str,
    project_id: str = TODOIST_SHOPPING_PROJECT,
) -> dict | None:
    """Pre-check whether an active Todoist task already matches this utterance.

    Returns {"task_id": "...", "content": "...", "url": "..."} if a match is
    found, or None if no match (or Todoist is unreachable / helper unavailable).

    Used by scan_for_action_phrases() to tag actionable hits so the cron
    agent logs them as `todoist_existing` instead of creating a duplicate.
    The 2026-06-10 16:16 lemonade × 2 incident: cron created the same
    noun twice because the dedupe check was a HEARTBEAT.md rule the agent
    could skip, not a script-level enforcement. This moves the check into
    the script so the agent can only see "duplicate" or "fresh".
    """
    helpers = _import_dedupe_helpers()
    if helpers is None:
        return None
    extract_noun, content_matches = helpers

    token = _load_todoist_token()
    if not token:
        return None

    noun = extract_noun(text)
    if not noun:
        return None

    try:
        candidates = _todoist_search(token, noun, project_id)
    except Exception:
        # Network / auth failure: don't block the agent, just don't tag.
        return None

    for t in candidates:
        if content_matches(t.get("content", ""), noun):
            return {
                "task_id": t["id"],
                "content": t.get("content", ""),
                "url": f"https://todoist.com/app/task/{t['id']}",
            }
    return None


def scan_for_action_phrases(
    conv: dict,
    acted_through: int | None = None,
    todoist_precheck: bool = True,
) -> list[dict]:
    """Walk the raw utterances and flag anything that looks like an action item.
    Returns a list of {utterance_index, speaker, text, pattern_label,
    existing_task_id?, existing_task_url?, existing_task_content?} so the
    cron agent can review them quickly without re-parsing the whole transcript.

    When `todoist_precheck` is True (the default), each hit is also looked up
    in Todoist. If a matching active task is found, the hit gets the
    `existing_task_*` fields populated — the agent should log it as
    `todoist_existing` (no create) instead of `todoist_shopping` (would
    duplicate). This is the script-level enforcement added 2026-06-10
    after the cron skipped the HEARTBEAT.md dedupe rule and created a
    second lemonade task 32 minutes after the first.
    """
    utterances = []
    for t in conv.get("transcriptions") or []:
        for u in t.get("utterances") or []:
            utterances.append(u)
    utterances.sort(key=lambda u: (u.get("start") is None, u.get("start") or 0))

    # Only scan NEW utterances (post-acted-through)
    if acted_through:
        scan_pool = utterances[acted_through:]
    else:
        scan_pool = utterances

    hits = []
    import re
    for idx, u in enumerate(scan_pool):
        text = (u.get("text") or "").strip()
        if not text:
            continue
        for pat, label in ACTION_PATTERNS:
            if re.search(pat, text, re.IGNORECASE):
                global_idx = (acted_through or 0) + idx
                hit = {
                    "utterance_index": global_idx,
                    "speaker": u.get("speaker") or "Unknown",
                    "text": text,
                    "pattern": label,
                }
                if todoist_precheck:
                    dup = check_todoist_duplicate(text)
                    if dup is not None:
                        hit["existing_task_id"] = dup["task_id"]
                        hit["existing_task_url"] = dup["url"]
                        hit["existing_task_content"] = dup["content"]
                hits.append(hit)
                break  # first match wins
    return hits


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--minutes", type=int, default=30, help="Window size in minutes (default 30)")
    parser.add_argument("--json", action="store_true", help="Emit raw JSON instead of formatted text")
    parser.add_argument("--quiet", action="store_true", help="Suppress 'no recent activity' message")
    parser.add_argument("--mark-acted", metavar="CONV_ID", help="Record that this conv has been acted on through N utterances")
    parser.add_argument("--through-utterances", type=int, default=0, help="When --mark-acted: how many utterances were covered by the action")
    parser.add_argument("--reset-acted", action="store_true", help="Clear the acted-state file (debug / rerun)")
    parser.add_argument(
        "--audit-summary",
        metavar="TEXT",
        help="Free-form description of what the cron decided (used for the audit trail only)",
    )
    parser.add_argument(
        "--audit-actions",
        metavar="JSON",
        help="JSON array of actions taken, e.g. '[{\"type\":\"todoist\",\"task\":\"Buy ketchup\",\"id\":\"abc\"}]'",
    )
    parser.add_argument(
        "--audit-discord-message-id",
        metavar="ID",
        help="Discord message id of the ping (if any) — recorded for cross-reference",
    )
    parser.add_argument(
        "--no-todoist-precheck",
        action="store_true",
        help="Skip the Todoist duplicate-precheck in scan_for_action_phrases (debug only)",
    )
    args = parser.parse_args()

    if args.reset_acted:
        if STATE_FILE.exists():
            STATE_FILE.unlink()
        print(f"Cleared {STATE_FILE}")
        return 0

    if args.mark_acted:
        state = _load_state()
        state.setdefault("conversations", {})[args.mark_acted] = {
            "acted_through_utterances": args.through_utterances,
            "acted_at": now_local().isoformat(),
        }
        _save_state(state)
        # Write audit record for this action
        audit_record = {
            "ts": now_local().isoformat(),
            "kind": "act",
            "conv_id": args.mark_acted,
            "acted_through_utterances": args.through_utterances,
        }
        if args.audit_summary:
            audit_record["summary"] = args.audit_summary
        if args.audit_actions:
            try:
                audit_record["actions"] = json.loads(args.audit_actions)
            except json.JSONDecodeError:
                audit_record["actions_parse_error"] = args.audit_actions
        if args.audit_discord_message_id:
            audit_record["discord_message_id"] = args.audit_discord_message_id
        write_audit_record(audit_record)
        print(f"Marked {args.mark_acted} acted through utterance {args.through_utterances}")
        return 0

    try:
        conversations = call_bee_now()
    except Exception as e:
        print(f"bee-live-window error: {e}", file=sys.stderr)
        return 1

    state = _load_state()
    acted = state.get("conversations", {})

    # Auto-prune: drop tracked convs that are no longer in any window.
    # BUGFIX 2026-06-10: previously this pruned ANY conv that fell out of the
    # 30-min window, including still-CAPTURING ones. That meant a conv could
    # be marked acted-through at 08:53 (utterance 520), fall out of window at
    # 09:08, get pruned, and then the 09:36 cron run would re-scan from
    # utterance 1 and re-fire on utterance 508 (gatorade). The 2026-06-10
    # gatorade × 3 incident.
    #
    # New rule: only prune convs that are both (a) NOT in the current window
    # AND (b) either in COMPLETED state for >24h OR have no acted_at timestamp
    # at all. Live / still-CAPTURING convs keep their state until they close,
    # so a 9-hour Bee session doesn't lose its acted-tracking mid-stream.
    in_window_convs = [c for c in conversations if in_window(c, args.minutes)]
    in_window_ids = {_conv_id(c) for c in in_window_convs}

    # Build a conv-by-state lookup for pruning decisions.
    conv_by_id = {_conv_id(c): c for c in conversations}

    def _is_prunable(cid: str) -> bool:
        if cid in in_window_ids:
            return False
        entry = acted.get(cid)
        if not entry:
            # No acted_at — orphan entry, safe to drop.
            return True
        acted_at_str = entry.get("acted_at")
        if not acted_at_str:
            return True
        try:
            acted_at = datetime.fromisoformat(acted_at_str)
        except (ValueError, TypeError):
            return True
        # If the timestamp is naive (older files pre-tz-aware), assume local.
        if acted_at.tzinfo is None:
            acted_at = acted_at.replace(tzinfo=now_local().tzinfo)
        age_hours = (now_local() - acted_at).total_seconds() / 3600.0
        # Live / still-CAPTURING convs that fell out of the time window: keep
        # their state. They might come back in a few minutes.
        conv = conv_by_id.get(cid)
        if conv is not None:
            state = (conv.get("state") or "").upper()
            if state in ("LIVE", "CAPTURING", "PROCESSING", "IN_PROGRESS"):
                return False
        # Conv is closed (COMPLETED) or unknown: only prune if old enough.
        return age_hours > 24.0

    stale = [cid for cid in acted.keys() if _is_prunable(cid)]
    if stale:
        for cid in stale:
            del acted[cid]
        _save_state(state)

    if args.json:
        # Annotate each conv with acted metadata.
        out = []
        for c in in_window_convs:
            cid = _conv_id(c)
            entry = acted.get(cid, {})
            total = _total_utterances(c)
            acted_through = entry.get("acted_through_utterances", 0) if entry else 0
            new_count = max(0, total - acted_through)
            out.append({
                **c,
                "_acted_through_utterances": acted_through,
                "_new_utterances_since_action": new_count,
                "_acted_at": entry.get("acted_at") if entry else None,
            })
        print(json.dumps(out, indent=2))
        return 0

    if not in_window_convs:
        if not args.quiet:
            print(f"No active Bee conversations in the last {args.minutes} minutes.")
        # Audit the empty run too — we want to know how many silent runs happened.
        write_audit_record({
            "ts": now_local().isoformat(),
            "kind": "empty",
            "minutes_window": args.minutes,
        })
        return 0

    blocks = []
    audit_convs = []
    for c in in_window_convs:
        cid = _conv_id(c)
        entry = acted.get(cid)
        acted_through = entry.get("acted_through_utterances") if entry else None
        block_text = summarize(c, acted_through=acted_through)
        # Pre-scan the raw transcript for action-item phrases. This is the
        # PRIMARY signal for the cron — Bee's summary is corroboration, not
        # the source of truth. Caught phrases are listed at the top of the
        # block for quick review.
        hits = scan_for_action_phrases(
            c,
            acted_through=acted_through,
            todoist_precheck=not args.no_todoist_precheck,
        )
        if hits:
            hit_lines = []
            dup_count = 0
            for h in hits:
                line = f"  - utt #{h['utterance_index']} [{h['pattern']}] {h['speaker']}: {h['text']}"
                if h.get("existing_task_id"):
                    dup_count += 1
                    line += (
                        f"\n    🔁 DUPLICATE: existing Todoist task '{h.get('existing_task_content')}'"
                        f" id={h['existing_task_id']} url={h.get('existing_task_url')}"
                        f" — log as todoist_existing, do NOT create"
                    )
                hit_lines.append(line)
            header = f"⚠️ ACTION-PHRASE SCAN ({len(hits)} hit{'s' if len(hits) != 1 else ''}"
            if dup_count:
                header += f", {dup_count} already in Todoist"
            header += "):"
            action_block = header + "\n" + "\n".join(hit_lines)
            block_text = action_block + "\n\n" + block_text
        blocks.append(block_text)
        total = _total_utterances(c)
        new_count = max(0, total - (acted_through or 0)) if acted_through is not None else total
        conv_record = {
            "conv_id": cid,
            "state": c.get("state"),
            "start_time": c.get("start_time"),
            "end_time": c.get("end_time"),
            "total_utterances": total,
            "new_since_last_action": new_count,
            "tracked": entry is not None,
            "action_phrase_hits": len(hits),
        }
        if acted_through is not None:
            conv_record["acted_through_utterances"] = acted_through
        audit_convs.append(conv_record)
    print("\n\n".join(blocks))
    # Audit what was seen (independent of whether the agent acts)
    write_audit_record({
        "ts": now_local().isoformat(),
        "kind": "saw",
        "minutes_window": args.minutes,
        "conversations": audit_convs,
    })
    return 0


if __name__ == "__main__":
    sys.exit(main())
