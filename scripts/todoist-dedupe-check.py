#!/usr/bin/env python3
"""
todoist-dedupe-check.py — Before creating a Todoist task, check for an
existing active task that matches the same intent.

Used by both the Bee Live Capture heartbeat (Lane 0 cron job) and the
Bee CLI Todos Capture cron (21:23 CT) to prevent duplicate Todoist tasks
like "Buy ketchup from Walmart" being created three times in a row.

Usage:
    python3 todoist-dedupe-check.py "Buy ketchup from Walmart" --project shopping [--json] [--quiet]
    python3 todoist-dedupe-check.py "Call John about resume" --project todo
    python3 todoist-dedupe-check.py --content "..." --nouns "ketchup"  # legacy form

Exit codes:
    0  — match found (a duplicate exists, do NOT create)
    1  — no match (safe to create)
    2  — error (network, missing token, etc.)

The script loads the Todoist token from ~/.openclaw/.secrets/todoist.env
(TODOIST_API_TOKEN), pages through ALL active tasks (Todoist `?filter=`
is unreliable for content search; we scan the full list), and uses
`fuzz.token_set_ratio` from rapidfuzz to score each candidate task.

A match is when the highest-scoring existing task is at or above the
DEDUP_THRESHOLD (default 80) AND the matching is "supported" by enough
contentful-token overlap (a guard against subset false-positives like
"Email the school" matching "Email the school about May's IEP" purely
on token containment).

Why rapidfuzz token_set_ratio:
- The previous in-house token-overlap heuristic (1 shared noun = match)
  produced false positives in 7/16 candidates during the 2026-06-06
  21:23 CT run — "Call car wash" matched "Call the ENT", "Build a
  small bike ramp with Franklin" matched "Jump on the trampoline with
  Franklin", etc. All on shared weak-signal tokens (call, franklin, may).
- rapidfuzz token_set_ratio is robust to subset/superset (so "Buy milk"
  matches "milk"), but scores the "shared weak signal" cases at 33-65
  (well below threshold 80). Verified against 20+ test cases 2026-06-06.

Fallback: if rapidfuzz is not importable, the script uses an in-house
set-containment heuristic (subset-in-either-direction OR ≥2 contentful
tokens overlap) so it still works in minimal-Python environments.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Set
from urllib import error, request

TODOIST_BASE = "https://api.todoist.com/api/v1"
ENV_PATH = Path.home() / ".openclaw" / ".secrets" / "todoist.env"

# Threshold for rapidfuzz.token_set_ratio. 80 was verified 2026-06-06 to
# cleanly separate the false-positive Franklin/trampoline cases (33-65)
# from true duplicates (always 90+, mostly 100).
DEDUP_THRESHOLD = 80

# Words that are weak signals for matching. If both new and existing
# tasks share ONLY these words (and no contentful items), don't match.
# In practice this is rarely hit because rapidfuzz score handles it, but
# the in-house fallback uses this list.
WEAK_SIGNAL_WORDS = {
    # Family / personal names — almost every task mentions one of these
    "chris", "amanda", "claire", "franklin", "may", "mae", "cindy",
    "grandmother", "mom", "dad", "mama", "papa", "wife", "husband",
    # Common high-frequency verbs that appear in many unrelated tasks
    "call", "email", "text", "message", "contact", "reach",
    "send", "write", "mail",
    "remind", "remember", "follow", "update", "check",
    "schedule", "plan", "book", "set",
    # Common adjectives / qualifiers
    "small", "big", "new", "old", "good", "bad",
    # Time references
    "today", "tomorrow", "tonight", "later", "soon", "monday", "tuesday",
    "wednesday", "thursday", "friday", "saturday", "sunday",
}


def load_token() -> str:
    if not ENV_PATH.exists():
        print(f"missing token file: {ENV_PATH}", file=sys.stderr)
        sys.exit(2)
    for line in ENV_PATH.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    token = os.environ.get("TODOIST_API_TOKEN")
    if not token:
        print("TODOIST_API_TOKEN not set", file=sys.stderr)
        sys.exit(2)
    return token


def list_active_tasks(token: str) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    cursor: Optional[str] = None
    while True:
        url = f"{TODOIST_BASE}/tasks"
        if cursor:
            url += f"?cursor={cursor}"
        req = request.Request(url, headers={"Authorization": f"Bearer {token}"})
        try:
            with request.urlopen(req, timeout=15) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
        except error.HTTPError as e:
            print(f"http error {e.code}: {e.read().decode('utf-8', 'replace')}", file=sys.stderr)
            sys.exit(2)
        except error.URLError as e:
            print(f"url error: {e}", file=sys.stderr)
            sys.exit(2)
        results = payload.get("results", []) if isinstance(payload, dict) else payload
        out.extend(results)
        cursor = payload.get("next_cursor") if isinstance(payload, dict) else None
        if not cursor:
            break
    return out


def normalize(s: str) -> Set[str]:
    """Lowercase, strip punctuation, split into word tokens."""
    s = s.lower()
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    return {w for w in s.split() if len(w) > 1}


def strip_paren(s: str) -> str:
    """Strip parenthetical `(...)` and bracketed `[...]` clauses. These
    are usually metadata/context (e.g. "(noted during shoe-putting)",
    "(screw embedded, pressure monitor alerted)") and inflate the fuzzy
    score with low-signal words. Verified 2026-06-06: stripping
    parentheticals from "Cut Franklin's toenail (noted during
    shoe-putting)" lifts the dedup score from 71 to 95 against the
    existing "Cut Franklin toenail" — turning a missed dupe into a
    clean catch."""
    s = re.sub(r"\([^)]*\)", " ", s)
    s = re.sub(r"\[[^\]]*\]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def stem(t: str) -> str:
    """Very basic English suffix-stripping. Drops -ed / -ing / -es / -s
    when at least 3 chars remain. Good enough to collapse "patch" /
    "patched" / "wash" / "washing" for matching. Verified 2026-06-06:
    stemming the "Get tire patched at Firestone" / "Tire patch at
    Firestone" pair turns a missed subset match (overlap 2 of {tire,
    firestone}) into a clean catch (overlap 3 of {tire, firestone,
    patch})."""
    for suf in ("ed", "ing", "es", "s"):
        if t.endswith(suf) and len(t) > len(suf) + 2:
            return t[: -len(suf)]
    return t


STOPWORDS = {
    "a", "an", "the", "to", "for", "of", "on", "in", "at", "by", "with",
    "from", "and", "or", "but", "if", "so", "as", "is", "are", "was", "were",
    "be", "been", "being", "do", "does", "did", "have", "has", "had",
    "you", "we", "they", "he", "she", "it", "this", "that", "these", "those",
    "my", "your", "our", "their", "his", "her", "its", "me", "us", "them",
    "about", "into", "out", "up", "down", "off", "over", "under", "again",
    "some", "any", "all", "no", "not", "only", "just", "also", "too", "very",
    # Pronoun "I" dropped from stopwords — it gets normalized away (1 char)
    # but explicit stopword is harmless
    "i",
}


def contentful_tokens(text: str) -> Set[str]:
    """Tokens that carry semantic content: not stopwords, not weak-signal
    verbs/names. Used for the in-house fallback matching only."""
    toks = normalize(text)
    return {t for t in toks if t not in STOPWORDS and t not in WEAK_SIGNAL_WORDS and len(t) > 2}


def contentful_tokens_stemmed(text: str) -> Set[str]:
    """Contentful tokens with basic suffix-stemming applied. Used for the
    primary dedup match path. Catches "Get tire patched at Firestone"
    vs "Tire patch at Firestone" (where 'patch' and 'patched' are
    semantically the same verb)."""
    return {stem(t) for t in contentful_tokens(text)}


def in_house_match(new_content: str, existing_content: str) -> bool:
    """Fallback matcher if rapidfuzz is unavailable. Subset in either
    direction OR ≥2 contentful tokens in common. Excludes WEAK_SIGNAL_WORDS
    from the comparison so "Call car wash" doesn't match "Call the ENT"
    purely on the shared verb "call"."""
    new_c = contentful_tokens_stemmed(new_content)
    existing_c = contentful_tokens_stemmed(existing_content)
    if not new_c or not existing_c:
        return False
    # STRICT subset in either direction = match (handles "Buy milk" vs
    # "Buy almond milk"). Strict means equal sets fall through to the
    # score-based path — equal sets like {car, wash} on "Call car wash"
    # vs "Wash the car" are semantically different intents (call the
    # car wash service vs wash the car yourself) and should not match
    # purely on equal contentful tokens.
    if new_c < existing_c and len(new_c) >= 2:
        return True
    if existing_c < new_c and len(existing_c) >= 2:
        return True
    # Otherwise need ≥2 contentful tokens in common
    return len(new_c & existing_c) >= 2


def fuzzy_score(new_content: str, existing_content: str) -> Optional[float]:
    """Return rapidfuzz token_set_ratio, or None if rapidfuzz is unavailable."""
    try:
        from rapidfuzz import fuzz  # type: ignore
    except ImportError:
        return None
    return float(fuzz.token_set_ratio(new_content, existing_content))


def is_match(new_content: str, existing_content: str) -> bool:
    """Return True if new and existing describe the same intent.

    Three-path dedup, verified 2026-06-06 against the 21:30 CT
    bee-conv-action-items-capture batch:

    Path 1 — STRICT subset: if the smaller side's contentful tokens
    (after stripping parentheticals and basic stemming) are a strict
    subset of the larger side, it's a match. Smaller side must have
    2+ contentful tokens (1 is too generic — blocks the
    "Email the school" / "Email the school about May's IEP" case
    where {school} ⊂ {school, iep} but {school} alone is too generic).
    STRICT (not loose) subset blocks the "Call car wash" / "Wash the
    car" case where both contentful sets are equal ({car, wash}) but
    the verbs differ. Catches: "Cut Franklin's toenail (noted during
    shoe-putting)" vs "Cut Franklin toenail", "Make cupcakes or muffins
    for new neighbors" vs "Make muffins for neighbors", "Buy milk" vs
    "Buy almond milk".

    Path 2 — High fuzzy + contentful overlap: score ≥ DEDUP_THRESHOLD
    (80) AND ≥2 contentful tokens in common. Catches the within-batch
    case "Charge bubble machine batteries before leaving" vs "bubble
    machine batteries" (when both exist in Todoist after the agent
    creates the first task and a within-batch re-scan picks it up).

    Path 3 — Mid fuzzy + strong topic overlap: score ≥ 40 AND ≥3
    contentful tokens in common. Catches "Consider migrating the
    running group to GroupMe" vs "Decide on and implement group chat
    platform (WhatsApp vs GroupMe)" (score 49, but {group, groupme,
    platform} — 3 contentful tokens in common — is a strong topic
    signal). Threshold 40 is a safety floor — at 30 or below, the
    wording is too different to call it the same intent.

    Parentheticals are stripped from both sides before scoring/overlap.
    Tokens are stemmed (basic -ed/-ing/-es/-s) before contentful
    comparison. Fallback path (no rapidfuzz): in_house_match.
    """
    new_s = strip_paren(new_content)
    ex_s = strip_paren(existing_content)
    new_c = contentful_tokens_stemmed(new_s)
    ex_c = contentful_tokens_stemmed(ex_s)
    if not new_c or not ex_c:
        return False

    score = fuzzy_score(new_s, ex_s)
    if score is None:
        return in_house_match(new_s, ex_s)

    # Path 1: STRICT subset match (smaller side must have ≥2 contentful
    # tokens; strict so equal sets fall through to score/overlap path).
    if new_c < ex_c and len(new_c) >= 2:
        return True
    if ex_c < new_c and len(ex_c) >= 2:
        return True

    # Path 2: High score + ≥2 contentful tokens in common
    if score >= DEDUP_THRESHOLD and len(new_c & ex_c) >= 2:
        return True

    # Path 2b: Single-token side fully contained in the other side,
    # AND the larger side's contentful size is small (≤ 3 tokens).
    # Catches bare-noun shopping list items where the existing task is
    # just the noun ("diapers", "ketchup", "ice cream") and the new
    # task elaborates with shopping context ("Buy diapers at Costco",
    # "Get ketchup from Walmart", "diapers (May down to 4)"). The
    # 2-token gate in Path 2 blocks these (single contentful token in
    # the existing never satisfies `>= 2`).
    #
    # Added 2026-06-10 21:55: the 21:27 CT daily-conv-action-items
    # cron created a duplicate "diapers" task because the 2-token gate
    # blocked the match between bare "diapers" (existing) and "Buy
    # diapers at Costco (May down to 4)" (new). Score was 100, but
    # intersection was just {diaper}.
    #
    # Symmetric: covers both (a) "diapers" existing vs "Buy diapers
    # at Costco" new, and (b) "Buy diapers at Costco" existing vs
    # "diapers" new.
    #
    # Bounds: larger side's contentful size ≤ 3 prevents matching the
    # "Buy Costco membership and then go pick up some diapers in size
    # 4" shape, where the larger side has multiple distinct intents.
    if score >= DEDUP_THRESHOLD:
        larger = new_c if len(new_c) >= len(ex_c) else ex_c
        smaller = ex_c if len(new_c) >= len(ex_c) else new_c
        if len(smaller) == 1 and smaller.issubset(larger) and len(larger) <= 3:
            return True

    # Path 3: Mid score + ≥3 contentful tokens in common (strong topic
    # overlap even when wording differs)
    if score >= 40 and len(new_c & ex_c) >= 3:
        return True

    return False


def find_match(
    new_content: str,
    tasks: List[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    """Return the best-matching existing task, or None."""
    best: Optional[Dict[str, Any]] = None
    best_score = 0.0
    for t in tasks:
        existing = (t.get("content") or "").strip()
        if not existing:
            continue
        if not is_match(new_content, existing):
            continue
        score = fuzzy_score(new_content, existing)
        if score is None:
            # In-house fallback: any match scores 1.0 (we already filtered)
            score = 1.0
        if score > best_score:
            best = t
            best_score = score
    return best


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("content_pos", nargs="?", help="The new task content (positional)")
    p.add_argument("--content", help="The new task content (flag form, legacy)")
    p.add_argument(
        "--nouns",
        default="",
        help="(Deprecated, ignored.) Noun extraction is no longer needed — rapidfuzz handles matching.",
    )
    p.add_argument(
        "--project",
        choices=["shopping", "todo"],
        help="Project intent hint (informational; not used for matching)",
    )
    p.add_argument("--json", action="store_true", help="Emit JSON output")
    p.add_argument("--quiet", action="store_true", help="Suppress human-readable output")
    args = p.parse_args()

    content = args.content or args.content_pos
    if not content:
        p.error("provide content as positional arg or --content")
    args.content = content

    token = load_token()
    tasks = list_active_tasks(token)
    match = find_match(content, tasks)

    if match:
        due = match.get("due") or {}
        result = {
            "duplicate": True,
            "matched_task": {
                "id": match["id"],
                "content": match["content"],
                "priority": match.get("priority"),
                "project_id": match.get("project_id"),
                "due_date": due.get("date"),
                "url": f"https://todoist.com/showTask?id={match['id']}",
            },
            "active_task_count": len(tasks),
        }
        if args.json or not args.quiet:
            print(json.dumps(result, indent=2, sort_keys=True))
        return 0
    else:
        result = {
            "duplicate": False,
            "active_task_count": len(tasks),
        }
        if args.json and not args.quiet:
            print(json.dumps(result, indent=2, sort_keys=True))
        elif not args.quiet:
            print(f"no duplicate found (scanned {len(tasks)} active tasks)")
        return 1


if __name__ == "__main__":
    sys.exit(main())
