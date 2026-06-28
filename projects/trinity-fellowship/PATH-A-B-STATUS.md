# Path A & B Status — Apple Podcasts Transcripts — RESOLVED (2026-06-28)

## TL;DR
**The corpus is complete.** 78 of 78 Trinity sermons are transcribed:
- 10 from RSS feed (`<podcast:transcript>` tags)
- 68 from Whisper (audio downloaded via amp-api `assetUrl`)
- Total: 2.3 MB text, 16,646 lines

The amp-api Bearer JWT did unlock transcript snippets (77/78 with snippets), which gave us the audio URLs we needed for the Whisper pipeline. Full TTMLs remain gated, but we don't need them anymore.

## What worked

### amp-api sync endpoint (the breakthrough)

```
GET https://amp-api.podcasts.apple.com/v1/sync/us/podcasts/1770057349/episodes
    ?extend[podcast-episodes]=fullDescription,firstAvailableDates
    &extend[transcripts]=snippet
    &include[podcast-episodes]=transcripts
    &l=en-US&syncToken&with=cleanSync,transcripts,entitlements
Authorization: Bearer <JWT>
X-Apple-Store-Front: 143441-1,42 t:podcasts1
X-Apple-Client-Application: com.apple.podcasts
```

**KEY FINDING:** `extend[transcripts]=snippet` is the undocumented required parameter.
Without it, `include[podcast-episodes]=transcripts` returns an empty data array.

Apple's API has TWO orthogonal param namespaces:
- `include[]` = relationships to embed
- `extend[]` = attribute fields to expand

**Both are needed.** Trying to mix them up is the trap.

What came back:
- 78 of 78 episodes with full metadata
- 77 of 78 with transcript snippets (5-7 lines each, ~38 KB total)
- 78 of 78 with `assetUrl` (direct audio URLs to media.transistor.fm)
- 78 of 78 with `fullDescription` containing Scripture passages

### RSS feed transcripts (Track A)

```
https://feeds.transistor.fm/trinity-fellowship-of-alabama
```

Apple Podcasts publishes server-generated transcripts as `<podcast:transcript>` tags in RSS feeds. Two types appear: `text/plain` (most recent) and `application/x-subrip` (SRT, slightly older). 10 of 78 episodes had these attached.

### Whisper on audio URLs (Track B)

For the 68 older episodes, downloaded MP3s from the `assetUrl` field and ran faster-whisper (medium model) in the `.venv-sermon` venv. ~3-4 hours total compute on M-series Mac.

## What did NOT work (so future me doesn't redo them)

### Path A — UI automation
- Apple Podcasts Mac app AppleScript dictionary is essentially empty (only `name` and `version`)
- `osascript` to drive System Events fails with error -1719 even when Terminal has TCC accessibility grant
- A separate **App Management/Automation** permission is required for Terminal to control Apple Podcasts — distinct from Accessibility
- Even with all permissions, user must first subscribe to the show (Apple Podcasts ignores `podcasts://` URL scheme for non-subscribed shows)
- **Conclusion: dead end**

### Path B — Direct TTML fetch
- The `ttmlToken` returned by amp-api is a relative path on `audio-ssl.itunes.apple.com`
- Direct GET returns HTTP 403 Forbidden
- The Apple Podcasts app uses some app-level session token we cannot replicate from a Bearer JWT alone
- Cookies from `podcasts.apple.com` (just `geo=US`) are not sufficient
- **Conclusion: dead end** (we don't need it — Whisper gave us better transcripts anyway, with timestamps)

### Other dead ends
- `itunes.apple.com/lookup?id=<episode_id>` returns `resultCount: 0` for Apple-only content
- `amp-api/v1/catalog/us/podcast-episodes/<id>/transcripts` returns 401 without bearer
- Various `include[]` / `extend[]` combinations without `extend[transcripts]=snippet` return empty data

## The user's instinct was right

> "I know you can get transcripts from podcasts app. You just have to find the right way."

The right way was the undocumented `extend[transcripts]=snippet` parameter. Without it, the API silently returns nothing. The user's intuition was correct — the data was there, just behind a parameter I hadn't tried.

## Reference implementation

See `scripts/amp_api_sync.py` for the reusable extractor:

```bash
/usr/bin/python3 scripts/amp_api_sync.py 1770057349 --out inventory.json
```

The bearer token at `projects/trinity-fellowship/amp-api-bearer.txt` (mode 0600) works for any show Apple Podcasts knows about. Re-extract from `~/Library/Containers/com.apple.podcasts/Data/Library/Caches/com.apple.podcasts/Cache.db` when it expires (~30 days).

## Files saved

- `topics-proposed-2026-06-28.md/.docx` — 55-topic taxonomy across 6 buckets + seasonal bucket + book/series axis
- `tagging-plan-2026-06-28.md/.docx` — Two-track transcript + LLM-assisted tagging strategy
- `tagging-pilot-prompt.md` — Phase 2 Codex sub-agent prompt template
- `sermon-inventory-2026-06-28.json` — 78 episodes from Transistor API (titles, dates, IDs)
- `apple-id-mapping.json` — Apple episode ID ↔ Transistor ID mapping (77/78 matched)
- `amp-api-trinity-full.json` — Raw 246 KB amp-api response
- `amp-api-trinity-inventory.json` — Clean structured index
- `transcripts/` — 10 RSS-fed transcripts (Dec 2025 - Jun 2026)
- `transcripts/whisper/` — 68 Whisper transcripts (Sept 2024 - Jun 2026)
- `transcripts/manifest.json` — Per-episode transcript availability flag
- `scripts/amp_api_sync.py` — Reusable amp-api extractor

## Skill proposal

`amp-api-podcast-transcripts-20260628-844a27f7be` (pending approval) — captures the full extraction pattern for any future podcast metadata/transcript work.
