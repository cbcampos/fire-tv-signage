#!/usr/bin/env python3
"""Regression test for todoist-dedupe-check.py Path 2b.

The 2026-06-10 21:27 CT bee-conv-action-items-capture cron created a
duplicate "diapers" Todoist task because the 2-token gate in Path 2 of
is_match() blocked the match between bare "diapers" (existing) and
"Buy diapers at Costco (May down to 4)" (new). Score was 100, but
intersection was just {diaper}, not >= 2.

Path 2b (added 2026-06-10 21:55) catches the case where:
- score >= DEDUP_THRESHOLD (80)
- EITHER the existing OR the new task has exactly 1 contentful token
- That single token is fully contained in the other side
- The larger side has <= 3 contentful tokens

This test verifies:
  1. The bug is fixed: bare-noun + elaboration matches in BOTH directions
  2. The bound holds: too-large new task (multiple intents) does NOT match
  3. False-positive cases (car-wash, trampoline) still do NOT match
  4. True duplicates (ketchup, milk, Franklin toenail) still match

These are pure unit tests on is_match() — no Todoist API calls, so the
suite runs in milliseconds.
"""
from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

SCRIPT = Path("/Users/ccampos/.openclaw/workspace/scripts/todoist-dedupe-check.py")


def main() -> int:
    spec = importlib.util.spec_from_file_location("todoist_dedupe_check", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(mod)
    is_match = mod.is_match

    cases = [
        # (existing, new, should_match, comment)
        # === THE BUG ===
        ("diapers", "Buy diapers at Costco", True,
         "bug repro: bare existing vs elaboration new"),
        ("Buy diapers at Costco", "diapers", True,
         "symmetric: elaboration existing vs bare new"),
        ("diapers", "diapers (May down to 4)", True,
         "bug repro: parenthetical noise stripped, bare in both sides"),
        ("diapers (May down to 4)", "diapers", True,
         "symmetric: parenthetical on new side"),
        # === Other bare-noun shopping cases ===
        ("ketchup", "Buy ketchup from Walmart", True,
         "ketchup bare + Buy elaboration"),
        ("ice cream", "Get ice cream", True,
         "ice cream 2-token existing, 2-token new (subset via Path 1)"),
        ("milk", "Buy almond milk", True,
         "milk bare + Buy almond milk elaboration"),
        ("gatorade", "get gatorade", True,
         "gatorade bare + get elaboration"),
        # === Too-large new task (must NOT match — multiple intents) ===
        ("diapers", "Buy Costco membership and then go pick up some diapers in size 4", False,
         "larger side has 5 contentful tokens, exceeds bound"),
        # === School / IEP edge case ===
        ("Email the school", "Email the school about May IEP", True,
         "same action (email), same target (school), more context (iep) — match"),
        # === False-positive regressions (must still NOT match) ===
        ("Call car wash", "Call the ENT", False,
         "verified false-positive case 2026-06-06 — different intents"),
        ("Build a small bike ramp with Franklin", "Jump on the trampoline with Franklin", False,
         "verified false-positive case 2026-06-06 — different intents"),
        # === True duplicates (must still match) ===
        ("Buy ketchup from Walmart", "Buy ketchup from Walmart", True,
         "exact match"),
        ("Buy milk", "Buy almond milk", True,
         "subset match"),
        ("Cut Franklin toenail", "Cut Franklin toenail (noted during shoe-putting)", True,
         "subset with parenthetical noise on new side"),
    ]

    passed = 0
    failed = 0
    for existing, new, should_match, comment in cases:
        # Test both directions: (existing, new) and (new, existing).
        # Path 2b is symmetric, so both should give the same answer.
        for direction in ("forward", "reverse"):
            if direction == "forward":
                got = is_match(existing, new)
                pair = (existing, new)
            else:
                got = is_match(new, existing)
                pair = (new, existing)
            ok = got == should_match
            mark = "PASS" if ok else "FAIL"
            if ok:
                passed += 1
            else:
                failed += 1
            print(f"[{mark}] {direction}: is_match({pair[0]!r}, {pair[1]!r}) -> {got} (expected {should_match}) [{comment}]")

    total = passed + failed
    print(f"\n{passed}/{total} assertions passed ({failed} failed)")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
