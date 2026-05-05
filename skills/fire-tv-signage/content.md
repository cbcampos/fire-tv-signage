---
description: Upload images, remove images, clear playlists, view current content on devices
priority: high
links:
  - SKILL
  - fire-tv-signage.devices
  - fire-tv-signage.manage
---

# fire-tv-signage.content

Manage display content (images) on paired Fire TV devices. The backend stores images locally and the Fire TV polls every 5 seconds for playlist updates.

## Upload Images

### Upload one or more images to a device
```bash
cd ~/.openclaw/workspace/fire-tv-signage/backend && npm run signage -- upload DEVICE_ID /path/to/image.jpg
```

Multiple images can be queued — they display in order, cycling continuously.

### Upload example
```bash
npm run signage -- upload device_abc123 /tmp/photo1.jpg /tmp/photo2.png
```

## Remove Images

### Remove a specific image from a device's playlist
```bash
npm run signage -- remove-image DEVICE_ID IMAGE_ID
```

### Clear all images from a device
```bash
npm run signage -- clear DEVICE_ID
```

## View Content

### Show device playlist and image list
```bash
npm run signage -- show DEVICE_ID
```

Or via API:
```bash
curl http://127.0.0.1:3002/api/admin/state
```

## Image Requirements
- Formats: JPEG, PNG (based on Fire TV Android receiver)
- Recommended: Full HD (1920x1080) or whatever the Fire TV resolution is
- Files are stored in `~/.openclaw/workspace/fire-tv-signage/backend/data/uploads/`

## How Display Works
- Receiver (Fire TV app) polls `GET /api/receiver/devices/{deviceId}/playlist` every 5 seconds
- When a new image is added, it appears on the TV on the next poll cycle
- Slides advance based on the `--delay` setting (default: whatever is set per device)

See also: [[fire-tv-signage.devices]], [[fire-tv-signage.manage]]
