#!/usr/bin/env python3
"""
amp_api_sync.py — Extract Apple Podcasts episode data via amp-api Bearer JWT.

Source pattern: projects/trinity-fellowship/amp-api-trinity-inventory.json
Trinity extraction date: 2026-06-28
Apple Podcasts show ID: 1770057349 (Trinity Fellowship of Alabama)

Usage:
    python3 amp_api_sync.py <show_id> [--out <output.json>] [--bearer-file <path>]

The Bearer JWT is extracted from the Apple Podcasts Mac app's Cache.db:
    sqlite3 "$HOME/Library/Containers/com.apple.podcasts/Data/Library/Caches/com.apple.podcasts/Cache.db" \
        "SELECT blob.request_object FROM cfurl_cache_response AS request \
         JOIN cfurl_cache_blob_data AS blob ON request.entry_ID = blob.entry_ID \
         WHERE request.request_key LIKE '%amp-api%' AND blob.request_object IS NOT NULL;" \
        | strings | grep -oE "Bearer eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+" | head -1

Or, search the response blob directly for the JWT pattern.
"""
import urllib.request
import urllib.parse
import json
import sys
import os
from datetime import datetime

DEFAULT_BEARER_FILE = os.path.expanduser(
    "~/.openclaw/workspace/projects/trinity-fellowship/amp-api-bearer.txt"
)
DEFAULT_STOREFRONT = "143441-1,42 t:podcasts1"


def extract_bearer(bearer_file: str) -> str:
    """Read Bearer JWT from a file. First line is the token."""
    with open(bearer_file) as f:
        bearer = f.read().split("\n")[0].strip()
    if not bearer.startswith("eyJ"):
        raise ValueError(f"Bearer file doesn't start with JWT: {bearer_file}")
    return bearer


def extract_storefront(bearer_file: str) -> str:
    """Read storefront from second line of bearer file, if present."""
    try:
        with open(bearer_file) as f:
            lines = f.read().split("\n")
            if len(lines) > 1:
                return lines[1].strip() or DEFAULT_STOREFRONT
    except Exception:
        pass
    return DEFAULT_STOREFRONT


def fetch_sync(show_id: str, bearer: str, storefront: str) -> dict:
    """Hit the undocumented amp-api sync endpoint with the parameters that work."""
    params = {
        "extend[podcast-episodes]": "fullDescription,firstAvailableDates",
        "extend[transcripts]": "snippet",
        "include[podcast-episodes]": "transcripts",
        "l": "en-US",
        "syncToken": "",
        "with": "cleanSync,transcripts,entitlements",
    }
    qs = urllib.parse.urlencode(params)
    url = f"https://amp-api.podcasts.apple.com/v1/sync/us/podcasts/{show_id}/episodes?{qs}"
    req = urllib.request.Request(url, headers={
        "Authorization": f"Bearer {bearer}",
        "X-Apple-Store-Front": storefront,
        "X-Apple-Client-Application": "com.apple.podcasts",
        "Origin": "https://podcasts.apple.com",
        "Referer": "https://podcasts.apple.com/",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
    })
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read())


def parse_response(data: dict) -> list:
    """Parse amp-api sync response into a flat list of episode dicts."""
    episodes = []
    for d in data.get("data", []):
        a = d.get("attributes", {})
        t = d.get("relationships", {}).get("transcripts", {}).get("data", [])
        snippet = t[0]["attributes"].get("snippet", "") if t else ""
        ttml_token = t[0]["attributes"].get("ttmlToken", "") if t else ""
        episodes.append({
            "apple_episode_id": d.get("id"),
            "apple_ep_url": a.get("url"),
            "title": a.get("name"),
            "description_short": a.get("description", {}).get("standard", ""),
            "description_full": a.get("fullDescription", ""),
            "duration_ms": a.get("durationInMilliseconds"),
            "release_datetime": a.get("releaseDateTime"),
            "asset_url": a.get("assetUrl", ""),
            "website_url": a.get("websiteUrl", ""),
            "guid": a.get("guid"),
            "transcript_snippet": snippet,
            "has_transcript_snippet": bool(snippet),
            "ttml_token": ttml_token,
            "artwork_url": a.get("artwork", {}).get("600"),
        })
    return episodes


def main():
    import argparse
    p = argparse.ArgumentParser(description="Fetch Apple Podcasts episode data via amp-api.")
    p.add_argument("show_id", help="Apple Podcasts show ID (from /podcast/.../id<SHOW_ID>)")
    p.add_argument("--out", default=None, help="Output JSON file path")
    p.add_argument("--bearer-file", default=DEFAULT_BEARER_FILE, help="Path to Bearer JWT file")
    args = p.parse_args()

    if not os.path.exists(args.bearer_file):
        print(f"❌ Bearer file not found: {args.bearer_file}")
        print(f"   Extract it first from Apple Podcasts' Cache.db")
        sys.exit(1)

    print(f"Reading Bearer JWT from {args.bearer_file}...")
    bearer = extract_bearer(args.bearer_file)
    storefront = extract_storefront(args.bearer_file)

    print(f"Fetching amp-api sync data for show {args.show_id}...")
    data = fetch_sync(args.show_id, bearer, storefront)

    episodes = parse_response(data)
    output = {
        "meta": {
            "source": "amp-api sync",
            "show_id": args.show_id,
            "fetched_at": datetime.utcnow().isoformat() + "Z",
            "total_episodes": len(episodes),
            "with_transcript_snippet": sum(1 for e in episodes if e["has_transcript_snippet"]),
        },
        "episodes": episodes,
    }

    if args.out:
        with open(args.out, "w") as f:
            json.dump(output, f, indent=2)
        print(f"✅ Saved {len(episodes)} episodes to {args.out}")
        print(f"   With transcript snippet: {output['meta']['with_transcript_snippet']}")
    else:
        print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()