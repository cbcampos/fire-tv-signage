---
name: fire-tv-signage MOC
description: Fire TV Signage system — push images and video to Fire TV displays from chat. No browser required.
version: 1.1.0
---

# Fire TV Signage — Map of Controls

**Preferred workflow:** Push from chat → receiver app on Fire TV. No browser, no manual steps.

---

## Start Here: Push Content

### `signage push <deviceId> <file>`
Push an image or video directly from chat. No browser needed.
- Images: PNG, JPG, WEBP, GIF
- Video: MP4, WebM, MKV, MOV, AVI (auto-restructured for streaming)
- Examples:
  - `signage push 60912977-a2d4-400b-b041-2f0612667051 /home/ccampos/pics/kids.jpg`
  - `signage push 60912977 /home/ccampos/videos/recital.mp4`

### `signage push --all <file>`
Push the same content to ALL paired displays simultaneously.

### `signage push <deviceId> --from-youtube "URL"`
Download YouTube video (720p max), restructure moov atom, push to device.
- Requires: `yt-dlp` + `ffmpeg`
- Audio tracks are kept; signage app outputs video-only (no app audio)

### `signage push <deviceId> --from-url "URL"`
Fetch remote image/video, push to device.

### `signage push <deviceId> --from-web "URL" --name "Label"`
Push a live WebView URL to Fire TV. The receiver renders the page directly. URL is also saved to the library for reuse.

### `signage push <deviceId> --from-library "tag or id"`
Push a saved library item to a device playlist.

---

## Content Library

Save images/videos once, tag them, reuse across devices and time.

```bash
signage library add /path/to/file.jpg --tag family
signage library add-web "https://example.com/dashboard" --name "Dashboard" --tag dashboard
signage library add-youtube "https://youtube.com/watch?v=..." --name "Video" --tag promo
signage library list
signage library search vacation
signage push <deviceId> --from-library "family-vacation"
signage library remove <libraryId>
```

Library items persist in `~/.openclaw/workspace/fire-tv-signage/backend/data/library/`.

---

## Playlist Management

### Reorder
```bash
# CLI
signage reorder <deviceId> --order=id1,id2,id3

# Admin UI: drag the grip handle (⠿) on each slide
```

### Per-Slide Delay
Override the global display delay for specific slides.
```bash
signage set-delay <deviceId> <imageId> --seconds 30   # 30s for this slide
signage set-delay <deviceId> <imageId> --clear        # back to global
signage reset-delays <deviceId>                        # reset ALL slides
```
Admin UI: enter delay per slide, click × to clear.

### Rename
```bash
signage rename <deviceId> <imageId> --name "Summer Schedule 2026"
```
Admin UI: click "Edit name" button on any slide.

### Clear
```bash
signage clear <deviceId>
```

---

## Device Management

```bash
signage devices                          # list all paired displays
signage show <deviceId>                   # full detail + playlist
signage pair <code> --name "Living Room" # pair a new Fire TV
signage set <deviceId> --name "Kitchen" --delay 15  # rename + set delay
signage delete-device <deviceId>          # remove display
```

---

## Backend Administration

```bash
signage health      # is the server running?
signage pending     # see waiting pairing requests
signage help        # full command reference
```

Admin UI: `http://192.168.2.90:3002`
- Device list, settings, playlist management
- Upload images and videos (drag-and-drop or click)
- Library management with tags
- Drag-and-drop reordering
- Per-slide delay controls

---

## YouTube Integration

```bash
# Download + push in one command
signage youtube-push "https://www.youtube.com/watch?v=..." <deviceId>

# Equivalent via push
signage push <deviceId> --from-youtube "https://www.youtube.com/watch?v=..."
```

**How it works:**
1. `yt-dlp` downloads at 720p max (best quality under 720p)
2. `ffmpeg -movflags +faststart` restructures moov atom to file start
3. File uploaded to backend `/uploads/`
4. Added to device playlist
5. Fire TV receiver fetches and plays

**Caveats:**
- YouTube videos with music: audio plays on the TV but signage app has no audio output
- Best for: ambient video, background footage, visual content without audio dependency
- Subtitles/captions are dropped during download

---

## Video Troubleshooting

### "Video won't play" / black screen
**Most common cause:** `moov` atom at end of file instead of front.

```bash
# Check moov position
ffprobe -v quiet -show_format /path/to/video.mp4 | grep -i moov

# Fix: restructure
ffmpeg -y -i input.mp4 -c copy -movflags +faststart output.mp4
```

The backend auto-restructures uploads via the CLI. For manual uploads via admin UI, the backend also auto-fixes.

### "Video starts but freezes/seeks poorly"
HTTP Range request support needed. Backend at port 3002 supports this.

### "Firmware shows mute icon but no video"
Normal. The mute icon = video is playing, no audio output from the signage app.

---

## System Overview

```
Chat (Discord/Signal/etc.)
    │
    ▼
signage CLI ──────────────────────────────────────► Backend :3002
    │  push, library, youtube, devices                 │
    │                                                  │ stores uploads
    ▼                                                  ▼
Fire TV Receiver App ◄── polls every 5s ───► /uploads/ (local files)
    │
    ▼
Display (images FIT_CENTER, videos VideoView)
```

**Known working:** Living Room TV (`8e8032d5-b1b6-4733-8ea5-dc56633f36b2`)

**Backend:** `http://192.168.2.90:3002`
**Fire TV:** `192.168.2.250:5555` (ADB)
**Backend location:** `~/.openclaw/workspace/fire-tv-signage/backend/`

---

## Skill Files

| File | Purpose |
|------|---------|
| [[SKILL]] | Start here — quick reference |
| [[manage]] | Backend start/stop/health |
| [[devices]] | Pair, list, rename, remove |
| [[content]] | Upload, reorder, delay, clear |
| [[push]] | Push from file, URL, library, YouTube |
| [[library]] | Content library management |
| [[youtube]] | YouTube download + push details |
| [[video]] | Video playback troubleshooting |