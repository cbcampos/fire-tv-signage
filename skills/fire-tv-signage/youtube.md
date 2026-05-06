---
description: YouTube video support — stream directly or download and push
priority: high
links:
  - SKILL
  - fire-tv-signage.push
  - fire-tv-signage.video
---

# fire-tv-signage.youtube — YouTube Video Support

Two ways to play YouTube videos on Fire TV displays:

## Option A: Direct Streaming (Recommended)

YouTube videos stream directly from YouTube's servers — **no download, no server storage, instant playback**. The app calls the backend's `/api/admin/youtube/stream` endpoint which uses `yt-dlp` to extract a direct stream URL. ExoPlayer plays it in real-time.

**How it works:**
1. Add YouTube URL to device playlist → `POST /api/admin/devices/:id/youtube`
2. App polls playlist, sees `type: "youtube"` item
3. App calls `GET /api/admin/youtube/stream?url=<youtubeUrl>` to get direct stream URL
4. Backend runs `yt-dlp -J --no-download` to extract the URL
5. App plays stream URL via ExoPlayer — YouTube delivers the video

**Backend endpoint:**
```
GET /api/admin/youtube/stream?url=<youtubeUrl>
Response: { streamUrl, title, duration, expiresAt }
```

Stream URLs expire after several hours. The app re-fetches a fresh URL each time the item comes up in the playlist.

**Requirements:**
- `yt-dlp` installed on the server (`pip install yt-dlp` or `brew install yt-dlp`)
- No ffmpeg needed for streaming mode
- Media3 ExoPlayer HLS module in the Android app (`media3-exoplayer-hls`)

**CLI:**
```bash
# Add YouTube video to device playlist (streaming mode)
signage youtube-push DEVICE_ID "https://youtube.com/watch?v=..."

# Remove YouTube video from playlist
signage youtube-remove DEVICE_ID VIDEO_ID
```

**API:**
```bash
# Add
curl -X POST "http://localhost:3002/api/admin/devices/DEVICE_ID/youtube" \
  -H "Content-Type: application/json" \
  -d '{"youtubeUrl":"https://www.youtube.com/watch?v=...", "name":"Video Title"}'

# Remove
curl -X DELETE "http://localhost:3002/api/admin/devices/DEVICE_ID/youtube/VIDEO_ID"
```

## Option B: Download and Push

Download the video, process it for Fire TV compatibility, and push like a local video file. Uses disk storage but works offline and doesn't depend on YouTube streaming.

```bash
# Download and push directly to device
signage youtube-push DEVICE_ID "URL" --download

# Save to library first
signage youtube-push DEVICE_ID "URL" --save-library "my-video" --download
```

Downloaded videos are automatically:
1. Converted to MP4 (H.264 + AAC) if needed
2. Restructured with `moov` atom at front (`ffmpeg -movflags +faststart`)
3. Validated for H.264 video codec

**Requirements for download mode:**
- `yt-dlp`
- `ffmpeg`
- `python3`

## Which Mode to Use?

| | Streaming (A) | Download (B) |
|--|--|--|
| Instant playback | ✅ | ❌ (must download first) |
| No server storage | ✅ | ❌ |
| Works offline | ❌ | ✅ |
| Audio output | ⚠️ HDMI muted | ⚠️ HDMI muted |
| Best for | Quick adds, one-off videos | Offline displays, repeated play |

**Note on audio:** HDMI audio output from the signage app itself is muted by Amazon on Fire TV (app audio is blocked over HDMI for non-Prime content). Videos play silently on the TV display. Audio works through the TV's built-in apps only.

## Troubleshooting

**Streaming fails:**
- Verify `yt-dlp` works: `yt-dlp --version`
- Test: `curl "http://localhost:3002/api/admin/youtube/stream?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ"`
- Stream URLs expire — they refresh each time the item comes up in playlist

**Video won't start:**
- For downloaded videos: check `moov` atom position with `ffprobe`
- For streaming: check network/firewall allowing `googlevideo.com`

**rick roll won't play:**
- yt-dlp may fail on age-restricted or premium content
- Try a different public video first to validate the setup

## See Also
- [[fire-tv-signage.push]] — Push workflow (all content types)
- [[fire-tv-signage.video]] — Video file requirements and troubleshooting
- [[fire-tv-signage.library]] — Save YouTube downloads to library for redeployment