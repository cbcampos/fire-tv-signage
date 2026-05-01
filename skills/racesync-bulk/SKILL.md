---
name: racesync-bulk
description: Bulk add complete, detailed running races to RaceSync calendar via POST /api/events/bulk
version: 2.1.0
---

# RaceSync Bulk Add (v2.1)

Add multiple fully-detailed running races to the RaceSync calendar with one API call.

## Quick Start

```
@Dobby add these races to RaceSync:
- BTC Peavine Falls Run, July 4 2026, Pelham AL, 10K/5K, BTC club event
- BTC Vulcan Run, Nov 7 2026, Homewood AL, 10K/5K
```

Dobby will: gather full event details → generate AI banner → POST to bulk API → confirm.

## Git Workflow

**Branch:** `migrate/upstash-redis` — all commits go HERE, never main.

**Push after every meaningful change:**
```bash
cd ~/.openclaw/workspace/projects/racesync
git add .
git commit -m "description"
git push origin migrate/upstash-redis
```

Render deploys from `migrate/upstash-redis` branch. Pushing to this branch triggers a redeploy.

## API Endpoint

**URL:** `https://racesync-bq2i.onrender.com/api/events/bulk`
**Auth:** `X-Api-Key: 6b72d58e830ef3347faafdc6513021755acae08e0a6500b0cf41333dd2f3af87`
(Chris's key — stored in `~/.openclaw/.secrets/RACESYNC.env`)

**Headers:** `Content-Type: application/json`

---

## Complete Event Fields

Every race added must include ALL of the following:

### Required
| Field | Example | Notes |
|-------|---------|-------|
| `id` | `wineglass-half-marathon-2026` | URL-safe slug, unique, include year |
| `name` | `Wineglass Half Marathon` | Full official name |
| `date` | `2026-10-04` | YYYY-MM-DD format |
| `location.city` | `Corning` | |
| `location.state` | `NY` | 2-letter abbreviation |
| `distances` | `["5K", "Half Marathon", "Marathon"]` | Array, 1 or more — **REQUIRED** |

### Terrain & Surface
| Field | Values | Notes |
|-------|--------|-------|
| `terrain` | `Road` \| `Trail` \| `Track` \| `Mixed` | Required |
| `surface` | `Paved` \| `Natural` \| `Mixed` \| `Track` \| `Indoor` | Add for completeness |
| `elevation` | `Flat` \| `Hilly` \| `Mountainous` | Schema enum — not numeric |

### Description & Media
| Field | Notes |
|-------|-------|
| `description` | 1-3 sentences. Include what makes the race special, scenic highlights, atmosphere |
| `bannerUrl` | **Required for visibility.** AI-generate one if no official image. Use tmpfiles.org `dl/` URL. Upload: `curl -F "file=@image.png" https://tmpfiles.org/api/v1/upload` → convert result URL from `tmpfiles.org/xxx` to `tmpfiles.org/dl/xxx` |

### Event Logistics
| Field | Example |
|-------|---------|
| `startTime` | `7:00 AM` or `6:30 AM CDT (runners), 7:00 AM CDT (walkers)` |
| `averageTemp` | Numeric °F: `75` |
| `AidStationNotes` | "10 water stations, Gatorade at stations 2, 5, 8. Medical tent at finish." |

### Registration & Links
| Field | Example |
|-------|---------|
| `registrationUrl` | `https://runsignup.com/Race/AL/Pelham/PeavineFallsRun` |
| `websiteUrl` | Official race website if different from registration |
| `charity` | `true` \| `false` — does race benefit a charity? |

### Club Affiliation (BTC races only)
| Field | Value |
|-------|-------|
| `sponsorClubIds` | `["club-1765901948658"]` — only for BTC club races |
| `runClubIds` | `["club-1765901948658"]` — only for BTC club races |
| `sponsors` | `[{"name": "BTC", "logoUrl": ""}]` |

### Numeric Fields
| Field | Type | Example |
|-------|------|---------|
| `elevation` | **Number** (ft gain, NOT enum when submitting to bulk API — bulk API converts) | `350` |
| `price` | **Number** | `0` for free races |
| `participantCount` | Number | `0` for new events |

---

## BTC Club ID
`club-1765901948658` — This is the BTC (Birmingham Trail Club) club ID. Use in `sponsorClubIds` and `runClubIds` for any BTC club events.

---

## Distances — REQUIRED Field

**Every race MUST have distances.** The `distances` array is required for:
- Displaying distance tags on EventCard and EventHeader
- Filtering by distance in FiltersSheet
- Color-coding the EventCard vertical bar and date number

When creating events via bulk API, always include `distances` as an array:
```json
"distances": ["5K", "10K", "Half Marathon"]
```

Acceptable values: `5K`, `10K`, `15K`, `8K`, `Half Marathon`, `Marathon`, `Ultra`, `1 Mile Fun Run`, or custom distances like `"50K"`.

---

## Banner Image Requirements

**Every event needs a banner.** If no official image exists:
1. Generate with MiniMax image AI: `image_generate` with prompt describing the race scenery + runners + event vibe
2. Upload: `curl -F "file=@generated.png\" https://tmpfiles.org/api/v1/upload`
3. Take returned URL, replace `tmpfiles.org/` with `tmpfiles.org/dl/` for direct download
4. Include `dl/` URL as `bannerUrl`

**Banner size:** Aim for 16:9 aspect ratio. Max ~600KB per image.

**Wikimedia Fallback:** EventHeader.tsx has automatic Wikimedia fallback based on terrain (Trail → Oak Mountain lake; Road → Birmingham skyline). If `bannerUrl` is missing/empty, the component falls back to these. Always provide a bannerUrl anyway.

---

## Full Payload Example

```json
{
  "events": [
    {
      "id": "peavine-falls-run-2026",
      "name": "BTC Peavine Falls Run",
      "date": "2026-07-04",
      "location": { "city": "Pelham", "state": "AL" },
      "distances": ["10K", "5K"],
      "terrain": "Trail",
      "surface": "Natural",
      "elevation": 350,
      "description": "BTC's July 4th tradition! Join us for a trail run through Peavine Falls with stunning views and a classic BTC celebration at the finish.",
      "startTime": "7:00 AM CDT (runners), 6:30 AM CDT (walkers)",
      "averageTemp": 82,
      "AidStationNotes": "Water and aid stations along the course. Full details on RaceSignUp.",
      "registrationUrl": "https://runsignup.com/Race/AL/Pelham/PeavineFallsRun",
      "bannerUrl": "http://tmpfiles.org/dl/35940989/image-1---6872be13-b5ff-4503-bc38-b2d117a091ee.png",
      "charity": false,
      "price": 0,
      "participantCount": 0,
      "participants": [],
      "sponsorClubIds": ["club-1765901948658"],
      "runClubIds": ["club-1765901948658"],
      "sponsors": [{"name": "BTC", "logoUrl": ""}]
    }
  ]
}
```

---

## Common Mistakes to Avoid

1. **Missing `distances` field** — Every event needs it. No exceptions.
2. **Missing `surface` field** — bulk.js didn't map it until fix `bec45ed`. Always include it.
3. **Elevation as string** — bulk.js converts to Number. Pass numeric feet.
4. **BTC-only events** — Only Peavine Falls Run and Vulcan Run are BTC races. Peachtree Road Race and Christina Chambers Twilight 5K are NOT BTC-affiliated (no club IDs).
5. **`sponsorClubIds`/`runClubIds` = empty array `[]`** for non-BTC races, or omit the fields entirely. Do NOT add BTC club ID to non-BTC races.
6. **UpsertEvent uses `@upstash/redis` SDK** — never raw `fetch` for KV operations in bulk.js. The raw fetch SADD calls were broken (returned 404), silently failing to add event IDs to the `events:ids` set.

---

## Testing

After adding events:
1. `GET /api/events/:id` — verify all fields saved correctly, including distances
2. `GET /api/events` — confirm event appears in calendar list (note: list endpoint strips `bannerUrl` and `aiDescription` for performance — banners only show on detail page)
3. Hard refresh RaceSync page — confirm banner renders on detail page
4. On detail page, confirm distance tags appear below the title

If event missing from list but present via detail endpoint → `events:ids` set SADD failed. Check bulk.js uses `upsertEvent()` not raw `fetch`.
