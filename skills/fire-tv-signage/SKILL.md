---
name: fire-tv-signage
description: Manage Fire TV Signage — push content, control displays, YouTube integration, content library. Preferred: push-from-chat over browser.
version: 1.1.0
openclaw:
  skillKey: fire-tv-signage
requirements:
  os: [linux]
  binaries: [node, ffmpeg, yt-dlp]
  permissions: [adb, file-write]
---

# Fire TV Signage Skill

Push images and videos to Fire TV displays directly from chat. No browser needed.

## Architecture
- **Backend** runs on `http://192.168.2.90:3002` (port 3002)
- **Fire TV receiver** polls every 5s, displays images and videos
- **Content library** stores reusable assets with tags
- **Preferred path:** CLI push from chat → receiver app (not browser)

## Quick Start — Push From Chat
```
signage push <deviceId> <file or URL>
signage push --all <file>          # push to ALL paired devices
signage push <deviceId> --from-library "tag"
signage push <deviceId> --from-youtube "https://youtube.com/watch?v=..."
```

## Skill Graph
- [[MOC]] — Full system overview, architecture, quick start
- [[manage]] — Start, stop, restart, health check
- [[devices]] — List, pair, rename, remove displays
- [[content]] — Upload, reorder, per-slide delay, clear playlist
- [[push]] — Push from file, URL, library, or YouTube ← **start here**
- [[library]] — Save, tag, search, manage reusable content
- [[youtube]] — YouTube video download and push workflow
- [[video]] — Video troubleshooting (moov atom, Range requests)

## Backend Commands (CLI)
```bash
# Health check
signage health

# List devices
signage devices

# Push image or video
signage push <deviceId> /path/to/file.jpg
signage push <deviceId> /path/to/video.mp4

# Push to all devices at once
signage push --all /path/to/announcement.png

# Push from content library
signage push <deviceId> --from-library "franklin-schedule"

# Push a YouTube video
signage push <deviceId> --from-youtube "https://youtube.com/watch?v=..."

# Upload from URL
signage push <deviceId> --from-url "https://example.com/image.png"

# Clear playlist
signage clear <deviceId>

# Reorder slides (drag handle in admin UI also works)
signage reorder <deviceId> --order=id1,id2,id3

# Per-slide delay (seconds, or --clear to reset to global)
signage set-delay <deviceId> <imageId> --seconds 30
signage set-delay <deviceId> <imageId> --clear

# Reset all slides to global delay
signage reset-delays <deviceId>

# Rename a slide
signage rename <deviceId> <imageId> --name "New Title"

# Library management
signage library list
signage library add /path/to/file.jpg --tag family
signage library search vacation
signage library remove <libraryId>

# YouTube download + push
signage youtube-push "https://youtube.com/watch?v=..." <deviceId>

# Show device details
signage show <deviceId>
```

## Push From Chat — Step by Step

**1. Image (from file on machine):**
```
signage push 60912977-a2d4-400b-b041-2f0612667051 /home/ccampos/pics/kids.jpg
```

**2. Video:**
```
signage push 60912977-a2d4-400b-b041-2f0612667051 /home/ccampos/videos/recital.mp4
```

**3. YouTube URL:**
```
signage push 60912977-a2d4-400b-b041-2f0612667051 --from-youtube "https://www.youtube.com/watch?v=..."
```
Downloads at 720p max, restructures moov atom for streaming, uploads to backend, adds to playlist.

**4. From content library:**
```
signage push 60912977-a2d4-400b-b041-2f0612667051 --from-library "franklin-schedule"
```

**5. To ALL displays at once:**
```
signage push --all /home/ccampos/announcement.png
```

**6. From URL:**
```
signage push <deviceId> --from-url "https://example.com/image.png"
```

## Content Library

Save once, reuse forever. Tag assets for easy retrieval.

```bash
# Add to library (auto-saves when using --save-library with push)
signage library add /path/to/photo.jpg --tag family

# List all library items
signage library list

# Search by name or tag
signage library search franklin

# Push from library to any device
signage push <deviceId> --from-library "family-vacation"
```

Library items are stored in `~/.openclaw/workspace/fire-tv-signage/backend/data/library/` and tracked in `db.json`.

## Admin UI
Browser-based management: `http://192.168.2.90:3002`
- Drag-and-drop slide reordering
- Per-slide delay override
- Slide rename
- Upload images and videos
- Device settings (name, location, global delay)
- Library management with tags

## Device Info
- **Living Room TV ID:** `60912977-a2d4-400b-b041-2f0612667051`
- **Fire TV IP:** `192.168.2.250:5555` (ADB)
- **Backend URL:** `http://192.168.2.90:3002`
- **Backend PID:** 888025 (working)

## Backend Location
`~/.openclaw/workspace/fire-tv-signage/backend/`

## Troubleshooting
- **Video won't play:** `ffprobe` checks moov atom position. Must be at front (`ffmpeg -movflags +faststart`).
- **Black screen on video:** TV is playing it — firmware mute icon means video is running, no audio output from app.
- **Push fails:** Check device ID, file path, backend reachability.
- **Pairing fails:** Ensure backend running, check pairing code from Fire TV receiver app.
- **Admin UI broken:** Check browser console for DOM errors; usually a save/rename operation left malformed HTML.