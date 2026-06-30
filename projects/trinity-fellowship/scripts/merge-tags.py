#!/usr/bin/env python3
"""Merge Trinity Fellowship tagging batches + pilot into sermon-tags.json.

Reads:
  - tagging-pilot-results.json
  - tagging-batch-02-results.json .. tagging-batch-10-results.json
  - sermon-inventory-2026-06-28.json  (for apple_ep_url, pub_date, transistor_id)
  - apple-id-mapping.json if present (best-effort extra metadata)

Writes:
  - sermon-tags.json (project root)
"""
from __future__ import annotations

import glob
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def normalize_title(s: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", "", s.lower())).strip()


def token_overlap(a: str, b: str) -> float:
    ta = set(a.split())
    tb = set(b.split())
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / max(len(ta), len(tb))


def load_tagged_entries() -> list[dict]:
    """Load every tagged batch in chronological order (pilot, 02..10)."""
    files = [str(ROOT / "tagging-pilot-results.json")]
    files.extend(sorted(glob.glob(str(ROOT / "tagging-batch-*-results.json"))))
    entries: list[dict] = []
    seen_keys: set[tuple[str, str]] = set()
    for f in files:
        if not os.path.exists(f):
            print(f"  skip missing {f}", file=sys.stderr)
            continue
        try:
            data = json.load(open(f))
        except json.JSONDecodeError as e:
            print(f"  skip corrupt {f}: {e}", file=sys.stderr)
            continue
        if not isinstance(data, list):
            print(f"  skip non-list {f}", file=sys.stderr)
            continue
        added = 0
        for e in data:
            # Production schema only — pilot may carry extra fields; drop them
            norm = normalize_title(e.get("title", ""))
            key = (e.get("date", ""), norm)
            if key in seen_keys:
                continue  # dedupe across batches
            seen_keys.add(key)
            entries.append(e)
            added += 1
        print(f"  loaded {added:3d} from {os.path.basename(f)}")
    return entries


def load_inventory() -> list[dict]:
    inv_path = ROOT / "sermon-inventory-2026-06-28.json"
    inv = json.load(open(inv_path))
    return inv["episodes"]


def load_apple_mapping() -> dict:
    """Best-effort: load apple-id-mapping.json if it has per-title Apple URLs."""
    candidates = ["apple-id-mapping.json", "transistor-feed-export.json"]
    for c in candidates:
        p = ROOT / c
        if p.exists():
            try:
                d = json.load(open(p))
                if isinstance(d, dict):
                    return d
            except Exception:
                pass
    return {}


def build_merged(entries: list[dict], episodes: list[dict]) -> list[dict]:
    # Index inventory by normalized title for fast lookup
    inv_by_norm: dict[str, dict] = {}
    inv_order: list[dict] = []
    for ep in episodes:
        norm = normalize_title(ep.get("title", ""))
        inv_by_norm[norm] = ep
        inv_order.append((norm, ep))

    merged: list[dict] = []
    matched_inv_norms: set[str] = set()

    for entry in entries:
        title = entry.get("title", "")
        norm = normalize_title(title)

        # Try exact normalized match first
        ep = inv_by_norm.get(norm)
        match_kind = "exact"

        # Fuzzy fallback: token overlap ≥ 0.7
        if ep is None:
            best_score = 0.0
            best_ep = None
            best_norm = ""
            for n, candidate in inv_order:
                if n in matched_inv_norms:
                    continue
                score = token_overlap(norm, n)
                if score > best_score:
                    best_score = score
                    best_ep = candidate
                    best_norm = n
            if best_score >= 0.7:
                ep = best_ep
                norm = best_norm
                match_kind = f"fuzzy:{best_score:.2f}"

        apple_url = ep.get("audio_url") if ep else None  # amp inventory often has apple_ep_url here
        pub_date = ep.get("published_at") if ep else None
        transistor_id = ep.get("id") if ep else None

        # Try to enrich apple_url from apple-id-mapping if available (later)
        record = {
            "date": entry.get("date"),
            "title": title,
            "primary_passage": entry.get("primary_passage"),
            "book": entry.get("book"),
            "series": entry.get("series"),
            "seasonal": entry.get("seasonal"),
            "topics": list(entry.get("topics", [])),
            "confidence_notes": entry.get("confidence_notes"),
            "apple_url": apple_url,
            "pub_date": pub_date,
            "transistor_id": transistor_id,
        }
        # Optional metadata
        if ep:
            record["inventory_match"] = match_kind
            matched_inv_norms.add(norm)
        else:
            record["inventory_match"] = "none"
        merged.append(record)

    return merged, matched_inv_norms


def main() -> int:
    print("Loading tagged entries…")
    entries = load_tagged_entries()
    print(f"  total tagged (deduped): {len(entries)}")

    print("Loading inventory…")
    episodes = load_inventory()
    print(f"  inventory episodes: {len(episodes)}")

    print("Merging…")
    merged, matched = build_merged(entries, episodes)
    print(f"  merged records: {len(merged)}")
    print(f"  inventory episodes matched: {len(matched)} / {len(episodes)}")

    # Sort by date
    merged.sort(key=lambda r: r.get("date") or "")

    out_path = ROOT / "sermon-tags.json"
    json.dump(merged, open(out_path, "w"), indent=2, ensure_ascii=False)
    print(f"Wrote {out_path}")

    # Coverage report
    unmatched = [
        ep["title"] for norm, ep in
        [(normalize_title(e["title"]), e) for e in episodes]
        if norm not in matched
    ]
    if unmatched:
        print("\nUnmatched inventory titles:")
        for t in unmatched:
            print(f"  - {t}")

    unmatched_tagged = [r["title"] for r in merged if r["inventory_match"] == "none"]
    if unmatched_tagged:
        print("\nTagged titles with no inventory match:")
        for t in unmatched_tagged:
            print(f"  - {t}")

    return 0


if __name__ == "__main__":
    sys.exit(main())