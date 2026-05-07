---
description: Push content from chat directly to a Fire TV display
priority: high
links:
  - SKILL
  - fire-tv-signage.devices
  - fire-tv-signage.library
---

# fire-tv-signage.push — Push from Chat

**This is the preferred workflow.** When Chris asks Dobby to share something to the Fire TV, use this path instead of opening a browser.

## How It Works
1. Chris drops an image, video, or URL in chat
2. Dobby uploads to the backend and adds it to the device playlist
3. Fire TV picks it up on next poll cycle (~5 seconds)

## Push an Image
```bash
# From a file path
signage push DEVICE_ID /path/to/image.jpg

# From a URL
signage push DEVICE_ID --from-url "https://example.com/image.jpg"
```

## Push a Video
```bash
signage push DEVICE_ID /path/to/video.mp4
```

## Push from Library
```bash
signage push DEVICE_ID --from-library "franklin-summer"
```

## Push a Live Web Page (WebView)
```bash
signage push DEVICE_ID --from-web "https://example.com/dashboard" --name "Dashboard"
```
Pushes a URL directly to the Fire TV receiver, which renders it in WebView. The page is also saved to the library so it can be pushed again via `--from-library`.

## Push YouTube Video
```bash
signage push DEVICE_ID --from-youtube "https://youtube.com/watch?v=..."
```

## Push to All Devices
```bash
# Push same content to every paired device
signage push --all /path/to/image.jpg
signage push --all --from-library "announcement"
```

## Clear Before Push (optional)
```bash
# Replace playlist entirely with new content
signage push DEVICE_ID /path/to/new-content.jpg --clear
```

## Finding Device ID
```bash
signage devices
```
Output shows all devices with their ID, name, and current image count. The ID is the UUID in the first column.

## Auto-Device Detection
If there's only one device paired, `--device` can be omitted:
```bash
signage push --all /path/to/image.jpg  # pushes to only device
```

## Status Feedback
- Push confirms: "Added to playlist. Appears on [DeviceName] in ~5s."
- If upload fails: "Upload failed: [reason]"
- If device not found: "Device not found. Run `signage devices` to see paired devices."

## Examples
```
Chris: show this on the living room tv
Dobby: [uploads franklin-schedule.png to backend]
Dobby: ✓ Added to Living Room TV playlist. Shows in ~5s.
```

```
Chris: push this video to all tvs
Dobby: [uploads promo.mp4 to backend, adds to all 3 devices]
Dobby: ✓ Pushed to all 3 displays. Playing in ~5s each.
```

## See Also
- [[fire-tv-signage.library]] — Content library for quick redeployment
- [[fire-tv-signage.youtube]] — YouTube video integration
- [[fire-tv-signage.devices]] — Device listing and management