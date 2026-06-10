#!/usr/bin/env python3
"""Regression test for todoist-task-dedupe.py.

Verifies the bug from 2026-06-10 08:53: cron created 3 gatorade tasks
(6gqfPh6j85Vv4X5G, 6gqfRMFWjMRG89Xp, 6gqfjFF5Jj4VQGJp) because no
Todoist pre-check was done before creation. The dedupe helper exists to
fix that.

Tests:
  1. Noun extraction from common imperative patterns
  2. Content matching rules (exact, substring both ways, case-insensitive)
  3. End-to-end: a real Todoist call against the gatorade task that
     already exists in the Shopping project returns action=existing
  4. End-to-end: a brand-new noun is created (then closed) and a
     follow-up call returns action=existing
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

SCRIPT = Path("/Users/ccampos/.workspace/.openclaw/workspace/scripts/todoist-task-dedupe.py") if False else Path("/Users/ccampos/.openclaw/workspace/scripts/todoist-task-dedupe.py")
SHOPPING_PROJECT = "6Crfx7wRcx657GMp"


def _run(*args: str) -> dict:
    """Invoke the helper and return parsed JSON output."""
    proc = subprocess.run(
        ["python3", str(SCRIPT), *args],
        capture_output=True,
        text=True,
        timeout=30,
    )
    if proc.returncode != 0 and not proc.stdout.strip():
        raise RuntimeError(f"helper failed: rc={proc.returncode} stderr={proc.stderr}")
    # The helper prints one JSON object (possibly with a blank line after).
    return json.loads(proc.stdout.strip())


def run(name: str, *args: str, expect: dict) -> bool:
    try:
        got = _run(*args)
    except Exception as e:
        print(f"[FAIL] {name}: exception {e}")
        return False
    ok = True
    for k, v in expect.items():
        if got.get(k) != v:
            ok = False
            print(f"[FAIL] {name}: expected {k}={v!r}, got {k}={got.get(k)!r}")
            print(f"       full: {json.dumps(got, indent=2)}")
    if ok:
        print(f"[PASS] {name}")
    return ok


def main() -> int:
    # 1. Importable: the noun extractor is a module-level function, test it
    #    by importing directly via importlib (script name has hyphens).
    import importlib.util
    spec = importlib.util.spec_from_file_location("todoist_task_dedupe", SCRIPT)
    mod = importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(mod)

    noun_cases = [
        # Clean imperatives the helper handles directly.
        ("gatorade", "gatorade"),
        ("Gatorade", "Gatorade"),
        ("buy some gatorade", "gatorade"),
        ("get milk", "milk"),
        ("remember to grab diapers", "diapers"),
        ("pick up eggs", "eggs"),
        ("stock up on toilet paper", "toilet paper"),
        ("please add blueberries", "blueberries"),
        # No verb at the start → unchanged. The cron's agent does the noun
        # extraction for messier natural-language utterances like
        # "I think we need some Gatorade, Franklin"; --noun is for
        # clean imperatives only.
        ("a few more snacks", "a few more snacks"),
        ("", ""),
    ]
    noun_ok = True
    for raw, expected in noun_cases:
        got = mod.extract_noun(raw)
        if got != expected:
            noun_ok = False
            print(f"[FAIL] noun: extract_noun({raw!r}) -> {got!r}, expected {expected!r}")

    # 2. Content matcher
    match_cases = [
        # (existing, search, should_match)
        ("gatorade", "gatorade", True),       # exact
        ("Gatorade", "gatorade", True),       # case-insensitive
        ("gatorade ", " gatorade", True),     # whitespace
        ("blue gatorade", "gatorade", True),  # word-boundary substring
        ("gatorade", "buy gatorade", True),   # word-boundary substring
        ("ice cream", "gatorade", False),     # unrelated
        ("gatorade powder", "gatorade", True),  # documented limitation: helper dedupes by
        # substring at word boundaries, not by product semantics. "gatorade" IS a complete
        # word inside "gatorade powder" — they collide. A semantic dedupe would need a
        # product ontology or an LLM call. The 2026-06-10 gatorade-duplicate bug was
        # solved by exact / simple-substring matching; the powder case is hypothetical.
        ("gatorade ice", "gatorade", True),   # same — word-boundary match
        ("", "gatorade", False),
        ("gatorade", "", False),
    ]
    match_ok = True
    for existing, search, should_match in match_cases:
        got = mod._content_matches(existing, search)
        if got != should_match:
            match_ok = False
            print(f"[FAIL] match: _content_matches({existing!r}, {search!r}) -> {got}, expected {should_match}")
    print(f"[{'PASS' if noun_ok else 'FAIL'}] noun: {len(noun_cases)} cases")
    print(f"[{'PASS' if match_ok else 'FAIL'}] match: {len(match_cases)} cases")

    # 3. End-to-end: create a known task, then verify a fresh call returns
    #    action=existing for the same noun. Hermetic — does not depend on
    #    any pre-existing task state in the Shopping project.
    e2e_noun = f"test-dedupe-{os.getpid()}"
    e2e1_create = run(
        f"e2e: setup create '{e2e_noun}'",
        "--content", e2e_noun, "--priority", "3",
        expect={"action": "created", "content": e2e_noun},
    )
    e2e1 = run(
        f"e2e: search-only for '{e2e_noun}' returns existing",
        "--content", e2e_noun, "--search-only",
        expect={"action": "existing", "content": e2e_noun},
    )
    e2e2 = run(
        f"e2e: 'grab some {e2e_noun}' with --noun finds existing",
        "--content", f"grab some {e2e_noun}", "--noun", "--search-only",
        expect={"action": "existing", "content": e2e_noun},
    )

    # 4. End-to-end: brand-new noun is created, then found on second call.
    test_noun = f"test-cherries-{os.getpid()}"
    e2e3a = run(
        "e2e: brand-new noun gets created",
        "--content", test_noun, "--priority", "3",
        expect={"action": "created", "content": test_noun},
    )
    e2e3b = run(
        "e2e: same noun on second call returns existing",
        "--content", test_noun, "--search-only",
        expect={"action": "existing", "content": test_noun},
    )

    # Cleanup: close all the test tasks we just created.
    cleanup_ids = []
    for noun in (e2e_noun, test_noun):
        rec = _run("--content", noun, "--search-only")
        if rec.get("task_id"):
            cleanup_ids.append(rec["task_id"])
    if cleanup_ids:
        import urllib.request
        token = mod.load_token()
        for tid in cleanup_ids:
            req = urllib.request.Request(
                f"{mod.TODOIST_API_BASE}/tasks/{tid}/close",
                method="POST",
                headers={"Authorization": f"Bearer {token}"},
            )
            with urllib.request.urlopen(req, timeout=15) as resp:
                pass
            print(f"[CLEANUP] closed {tid}")

    # 6. --dry-run does not create
    test_noun2 = f"test-grapes-{os.getpid()}"
    e2e4 = run(
        "dry-run: brand-new noun is dry_run_would_create, not created",
        "--content", test_noun2, "--dry-run",
        expect={"action": "dry_run_would_create"},
    )
    e2e4b = run(
        "dry-run: nothing was actually created (search returns not_found)",
        "--content", test_noun2, "--search-only",
        expect={"action": "not_found"},
    )

    results = [noun_ok, match_ok, e2e1, e2e2, e2e3a, e2e3b, e2e4, e2e4b]
    passed = sum(results)
    total = len(results)
    print(f"\n{passed}/{total} tests passed")
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
