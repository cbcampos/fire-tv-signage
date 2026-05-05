---
description: Upload, reorder, set per-slide delay, and clear content on paired devices
priority: high
links:
  - SKILL
  - fire-tv-signage.push
  - fire-tv-signage.devices
  - fire-tv-signage.video
---

# fire-tv-signage.content — Manage Device Content

## View Playlist
```bash
signage show DEVICE_ID
```
Shows: image list with names, types (IMAGE/VIDEO), delay overrides, display order.

## Upload Images or Videos
```bash
# Image
signage push DEVICE_ID /path/to/image.jpg

# Video (auto-restructured for Fire TV)
signage push DEVICE_ID /path/to/video.mp4

# Multiple at once
signage push DEVICE_ID /path/img1.jpg /path/img2.png /path/video.mp4
```

## Reorder Playlist
**Admin UI (easiest):** Drag the ⠿ handle to reorder. Changes save immediately via `POST /api/admin/devices/{id}/images/reorder`.

**CLI:**
```bash
signage reorder DEVICE_ID IMAGE_ID_1 IMAGE_ID_2 IMAGE_ID_3 ...
```

## Per-Slide Delay Override
By default, all slides use the global device delay. Override per-slide:

**Admin UI:**
1. Click the delay number on any slide
2. Type new value (2–3600 seconds)
3. Press Enter — saves immediately
4. Click × to revert to global delay

**CLI:**
```bash
signage set-delay DEVICE_ID IMAGE_ID --seconds 30
signage set-delay DEVICE_ID IMAGE_ID --clear  # revert to global
```

**API:**
```bash
curl -X PATCH http://127.0.0.1:3002/api/admin/devices/DEVICE_ID/images/IMAGE_ID \
  -H "Content-Type: application/json" \
  -d '{"delaySeconds": 30}'
```

## Reset All Delays to Global
**Admin UI:** Click "Reset all to global delay" button at bottom of playlist.
**CLI:** `signage reset-delays DEVICE_ID`

## Rename a Slide
**Admin UI:** Click "Edit name" on any slide → type new name → "Save".
**CLI:** `signage rename DEVICE_ID IMAGE_ID --name "New Name"`

## Clear Playlist
```bash
signage clear DEVICE_ID
```
Removes all images/videos from device playlist. Does not delete files from uploads directory.

## Remove Single Item
```bash
signage remove DEVICE_ID IMAGE_ID
```

## Push to Multiple Devices
```bash
# All paired devices
signage push --all /path/to/image.jpg

# Specific devices
signage push DEVICE1_ID /path/to/image.jpg
signage push DEVICE2_ID /path/to/image.jpg
```

## Image vs Video Detection
Backend detects by MIME type during upload:
- `image/*` → stored as image, `isVideo: false`
- `video/*` → stored as video, `isVideo: true`

Receiver app detects by URL extension (`.mp4`, `.mkv`, `.mov`, `.webm`, `.avi`, `.3gp`).

## Storage
Uploaded files stored at:
`~/.openclaw/workspace/fire-tv-signage/backend/data/uploads/`
File paths tracked in `db.json` per device.

## See Also
- [[fire-tv-signage.push]] — Push workflow
- [[fire-tv-signage.devices]] — Device listing
- [[fire-tv-signage.video]] — Video file requirements
- [[fire-tv-signage.library]] — Library for quick redeployment