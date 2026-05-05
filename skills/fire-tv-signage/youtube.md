---
description: Download and push YouTube videos to Fire TV displays
priority: high
links:
  - SKILL
  - fire-tv-signage.push
  - fire-tv-signage.video
---

# fire-tv-signage.youtube — YouTube Video Support

YouTube videos are downloaded, processed (faststart + moov repositioning), and pushed to displays just like locally-sourced video files.

## Requirements
- `yt-dlp` or `youtube-dl` installed on the server
- `ffmpeg` for video restructuring
- `python3` for server-side processing

## Download and Push
```bash
# Download YouTube video and push directly to a device
signage youtube-push DEVICE_ID "https://youtube.com/watch?v=..."

# Download to library first, then push
signage youtube-push DEVICE_ID "URL" --save-library "my-video"
signage push DEVICE_ID --from-library "my-video"
```

## Supported Formats
Downloaded video is converted to MP4 (H.264 + AAC) for maximum Fire TV compatibility.

## Auto-Restructure
All downloaded videos are automatically:
1. Converted to MP4 if needed
2. Restructured with `moov` atom at front (`ffmpeg -movflags +faststart`)
3. Validated for H.264 video codec

## Quality Selection
By default, downloads prefer 720p for Fire TV display optimization:
- `best[height<=720]` — best quality 720p or below
- Override with `--quality` flag if needed

## Status Feedback
```
Dobby: Downloading YouTube video (Imogen Heap - The Happy Song)...
Dobby: Processing for Fire TV playback...
Dobby: ✓ Pushed to Living Room TV. Playing in ~10s.
```

## Notes
- **Audio:** YouTube audio tracks are included in the MP4 but HDMI audio output from the signage app itself is muted (Amazon Fire TV blocks app audio output over HDMI for non-prime video content). The video will play silently.
- **Duration:** Longer videos cycle through the playlist normally; use per-slide delay for long-form content.
- **Thumbnails:** YouTube thumbnails are not auto-generated for the admin UI playlist view — videos show a dark placeholder with a play icon.

## See Also
- [[fire-tv-signage.push]] — Push workflow
- [[fire-tv-signage.video]] — Video file requirements and troubleshooting
- [[fire-tv-signage.library]] — Save YouTube downloads to library for redeployment