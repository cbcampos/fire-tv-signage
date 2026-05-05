---
description: Video file requirements, playback issues, and troubleshooting
priority: medium
links:
  - SKILL
  - fire-tv-signage.youtube
  - fire-tv-signage.push
---

# fire-tv-signage.video — Video Playback on Fire TV

## Requirements for Playback

### Codec & Container
- **Container:** MP4 (preferred), WebM, MKV, MOV, AVI
- **Video codec:** H.264 (AVC) — Fire TV hardware decoder
- **Audio codec:** AAC — included but HDMI audio output is muted for app content

### Critical: `moov` Atom Position
The `moov` atom (metadata) **must be at the front** of the file. Videos downloaded from YouTube typically have the `moov` atom at the end, which causes the Fire TV to download the entire file before playback can start.

**Check position:**
```bash
ffprobe -v quiet -print_format json -show_format FILE.mp4 | grep moov
```

**Fix (restructure to front):**
```bash
ffmpeg -i FILE.mp4 -c copy -movflags +faststart OUTPUT.mp4
```

The backend automatically restructures uploaded videos via ffmpeg before adding to the playlist.

### File Size
- No hard limit, but 500MB+ files may cause buffering on slower connections
- Recommended: keep videos under 100MB for smoother playback
- The 2.6-min Imogen Heap test video (~16MB) played cleanly over WiFi

## Troubleshooting

### "Couldn't open" / FileNotFoundException
**Cause:** Server returning 404 or wrong MIME type.
**Fix:** Check uploads directory path, ensure file exists, verify server `serveFile` function.

### Video plays but shows black screen
**Cause:** Dark scene in video (not a playback error).
**Check:** Look for decode/render log entries in `logcat` — hardware codec activity means video is playing.

### Video skips or won't start
**Cause:** `moov` atom at end of file.
**Fix:**
```bash
ffmpeg -i video.mp4 -c copy -movflags +faststart video-fixed.mp4
```

### Audio plays but no video
**Check:** Video codec is H.264; non-H.264 codecs may not decode on Fire TV.

### HTTP Range errors in logcat
**Cause:** Server not serving Range requests.
**Fix:** Ensure `serveFile` in `server.mjs` handles `Range` header and returns `206 Partial Content`.

## Admin UI: Video Thumbnails
Videos in the playlist show a dark gradient placeholder with a ▶ play icon (not a frame preview). This is expected — VideoView doesn't provide thumbnail access. The video filename is shown below the icon.

## Per-Slide Delay with Videos
- Set per-slide delay override to control how long video displays before advancing
- Video auto-advances on `OnCompletionListener` regardless of delay setting
- Set `delaySeconds: null` on video slides to use global delay

## See Also
- [[fire-tv-signage.youtube]] — YouTube downloads are auto-processed for Fire TV
- [[fire-tv-signage.push]] — Push video to displays