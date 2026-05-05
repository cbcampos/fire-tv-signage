---
description: Content library — save, tag, and redeploy media to any display
priority: high
links:
  - SKILL
  - fire-tv-signage.push
  - fire-tv-signage.devices
---

# fire-tv-signage.library — Content Library

Store frequently-used images and videos in a library for one-command redeployment.

## Library Storage
`~/.openclaw/workspace/fire-tv-signage/backend/data/library/`
- Files stored with unique IDs
- Metadata tracked in `db.json` as `library[]`

## Save to Library
```bash
# Save an image or video
signage library add /path/to/image.jpg --tag "franklin-summer"
signage library add /path/to/video.mp4 --tag "promo-video"

# Tag multiple
signage library add /path/to/schedule.png --tag "schedule" --tag "franklin" --tag "2026"
```

## List Library
```bash
signage library list
```
Shows: ID, filename, tags, type (image/video), file size.

## Search Library
```bash
signage library search "franklin"
signage library search "schedule"
```

## Deploy from Library
```bash
# Push to specific device
signage push DEVICE_ID --from-library "franklin-summer"

# Push to all devices
signage push --all --from-library "announcement"
```

## Remove from Library
```bash
signage library remove LIBRARY_ID
```

## Library Metadata (db.json)
```json
{
  "library": [
    {
      "id": "abc123",
      "name": "franklin-summer-2026.png",
      "tags": ["franklin", "summer", "schedule"],
      "type": "image",
      "path": "/uploads/library/abc123.png",
      "size": 1234567,
      "addedAt": "2026-05-05T15:30:00Z"
    }
  ]
}
```

## Workflow: Save Once, Push Everywhere
1. Upload content once: `signage push DEVICE_ID /path_to_file --save-library "tagname"`
2. Redeploy to any device: `signage push ANY_DEVICE_ID --from-library "tagname"`
3. Push to all devices at once: `signage push --all --from-library "tagname"`

## Use Cases
- Weekly schedule images (same "franklin-schedule" image each week)
- Announcement banners (push to all devices for group-wide alerts)
- Event posters (save once, deploy to multiple rooms)
- Company logos / branding assets

## See Also
- [[fire-tv-signage.push]] — Push from library to displays
- [[fire-tv-signage.youtube]] — YouTube videos in the library
- [[fire-tv-signage.devices]] — Device listing