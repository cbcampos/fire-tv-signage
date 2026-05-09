# Fire TV Signage

A self-hosted digital signage system for Amazon Fire TV devices. Push images and videos to one or many Fire TV receivers from a browser admin panel. Designed for home use — living room displays, family schedules, kitchen signage.

---

## What it does

- **Push content** (images + videos + YouTube) to Fire TV receivers from a browser admin panel
- **YouTube streaming** — play YouTube videos directly without downloading; the app streams from YouTube in real-time via a backend proxy
- **Wyze single-camera streams** — switch the receiver to a single live Wyze camera via Wyze Bridge + go2rtc
- **Auto-play playlists** — content cycles automatically at a configurable interval
- **Video support** — MP4, WEBM, MKV, MOV, AVI play full-screen with audio
- **Offline caching** — receivers cache images locally and keep displaying if the network drops
- **Wake lock** — Fire TV won't sleep while the app is running
- **Boot-to-display** — app auto-launches when the Fire TV powers on
- **Custom names & locations** — label each display and set a location (e.g., "Kitchen", "Living Room")
- **Custom slide names** — rename individual slides from the admin UI

---

## Architecture

```
Browser (Admin UI)              Fire TV (Receiver App)
     |                                   |
     |--- HTTP ---> Backend :3002 -------|
     |         server.mjs               |
     |                                   |
     |  admin/   devices/  uploads/      |
     +--- polls every 5s ----------------+
```

**Components:**
- **Backend** — Node.js web server (port 3002) serving the admin UI + a REST API for receiver pairing, content management, YouTube stream proxy, and playlist delivery
- **Receiver APK** — Android app installed on Fire TV; polls the backend every 5 seconds for playlist changes and displays content full-screen
- **Admin UI** — single-page web app served by the backend at `http://<server>:3002`

### YouTube Streaming How It Works

1. You add a YouTube URL to a device's playlist via the admin UI
2. When it's time to play, the Android app calls `GET /api/admin/youtube/stream?url=<youtubeUrl>`
3. The backend uses `yt-dlp` to extract the direct video stream URL (no download)
4. The backend returns `{ streamUrl, title, duration, expiresAt }`
5. The app plays the stream URL directly via ExoPlayer — YouTube handles the video delivery

This means **no server-side storage for videos**, instant playback for any YouTube video, and stream URLs that are valid for several hours.

---

## Hardware

- **Fire TV device** — Amazon Fire TV Stick 4K or Fire TV Cube connected to a display
- **Backend server** — any machine running Node.js (this machine: `192.168.2.90:3002`)
- **Android SDK** for building the APK (or use the pre-built APK in `receiver-android/app/build/outputs/apk/debug/`)

---

## Quick Start

### 1. Deploy the backend

```bash
cd fire-tv-signage/backend
npm install
# Install yt-dlp for YouTube support (optional)
# npm install -g yt-dlp  # or: brew install yt-dlp

node server.mjs
```

The server runs on **port 3002** by default. Access the admin UI at `http://<your-server-ip>:3002`.

### 2. Set environment variables (optional)

```bash
PORT=3002                    # server port (default: 3002)
HOST=0.0.0.0                # bind address (default: 0.0.0.0)
SIGNAGE_DATA_DIR=./data     # where device data and uploads are stored
SIGNAGE_UPLOAD_DIR=./data/uploads  # uploaded files directory
PUBLIC_BASE_URL=https://... # if behind a reverse proxy
```

### 3. Install the receiver app on Fire TV

1. Enable Developer Options on the Fire TV (Settings → My Fire TV → Developer Options → ADB Debugging = ON)
2. Find the Fire TV's IP address (Settings → My Fire TV → About → Network)
3. Connect from this machine:
   ```bash
   adb connect <fire-tv-ip>:5555
   ```
4. Install the APK:
   ```bash
   adb install -r receiver-android/app/build/outputs/apk/debug/app-debug.apk
   ```

### 4. Pair the device

1. Open the app on the Fire TV — it will show a 6-character pairing code
2. Go to `http://<server-ip>:3002` on a browser
3. Enter the pairing code to link the device to the admin panel

### 5. Add content

- **Images**: Upload PNG, JPG, WEBP, or GIF via the admin UI
- **Videos**: Upload MP4, WEBM, MKV, MOV, or AVI files
- **YouTube**: Click "Add YouTube" and paste a YouTube video URL (e.g. `https://www.youtube.com/watch?v=...`)

Assign content to devices from the admin panel. The app will auto-cycle through the playlist at the configured interval (default: 10 seconds per slide).

---

## Project Structure

```
fire-tv-signage/
├── backend/
│   ├── server.mjs          # Node.js backend server (REST API + admin UI)
│   ├── public/
│   │   ├── index.html      # Admin single-page app
│   │   ├── app.css
│   │   └── admin.js         # Admin UI JavaScript
│   └── data/
│       ├── db.json          # Device and content database
│       └── uploads/         # Uploaded image/video files
│
└── receiver-android/
    ├── app/
    │   └── src/main/java/com/signage/receiver/
    │       ├── MainActivity.java    # Receiver app (ExoPlayer, playlist polling)
    │       └── VideoCacheProvider.java  # ContentProvider for local video caching
    ├── build.gradle.kts     # Android dependencies (Media3 ExoPlayer + HLS)
    └── gradle.properties    # AndroidX enabled, backend URL configured
```

## OpenClaw Skill

For OpenClaw agent operations (deploy, verification, CLI workflows), use:

- `SKILL.md`
- `OPENCLAW_AGENT_GUIDE.md`

---

## Wyze Camera Integration (Working Setup)

Single-camera Wyze streaming is working with a maintained forked bridge image in host mode.

- **Working image:** `ghcr.io/idisposable/docker-wyze-bridge:latest`
- **Keep this version only** (the old `mrlt8/wyze-bridge` path is retired for this deployment)
- **Why this works:** host networking avoids the UDP discovery issues that caused `IOTC_ER_TIMEOUT` for this environment

### Runtime ports on OpenClaw host

- Bridge Web/API: `http://192.168.2.90:5080`
- go2rtc UI/API: `http://192.168.2.90:1984`
- RTSP output: `rtsp://192.168.2.90:8554/<camera_name>`

### Recommended launch

```bash
docker run -d \
  --name wyze-bridge-alt \
  --restart unless-stopped \
  --network host \
  --env-file ~/.openclaw/.secrets/wyze.env \
  -e BRIDGE_PORT=5080 \
  -v ~/.openclaw/wyze-bridge-alt:/config \
  ghcr.io/idisposable/docker-wyze-bridge:latest
```

### CLI camera switching commands

```bash
# List available Wyze cameras from bridge
node backend/cli.mjs wyze-cams --bridge-url "http://192.168.2.90:5080"

# Push single camera live to a signage device
node backend/cli.mjs --url "http://192.168.2.90:3002" \
  push <deviceId> --from-wyze "baby_cam" --wyze-bridge "http://192.168.2.90:1984"
```

This uses a live web override to:
`http://<bridge>/stream.html?src=<camera_name>&mode=hls,mse,webrtc`

---

## Backend API Reference

### Device Management

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/state` | Full admin state: devices, pending pairings, library |
| `POST` | `/api/admin/pair` | Approve a pending pairing code |
| `PATCH` | `/api/admin/devices/:id` | Update device label, location, or delaySeconds |

### Content Upload

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/admin/devices/:id/images` | Upload image (base64 dataUrl) to device playlist |
| `POST` | `/api/admin/devices/:id/youtube` | Add YouTube video URL to device playlist |
| `DELETE` | `/api/admin/devices/:id/images/:imgId` | Remove image from playlist |
| `DELETE` | `/api/admin/devices/:id/youtube/:vidId` | Remove YouTube video from playlist |

### Receiver App API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/receiver/pairing/:code` | Request pairing with a 6-char code |
| `GET` | `/api/receiver/devices/:id/playlist?token=X` | Get device's playlist (images + YouTube items) |

### YouTube Streaming

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/youtube/stream?url=<youtubeUrl>` | Extract direct stream URL from YouTube |

Response:
```json
{
  "streamUrl": "https://rr1---...googlevideo.com/videoplayback?...",
  "title": "Video Title",
  "duration": 213,
  "expiresAt": "2026-05-06T08:47:51.000Z"
}
```

Stream URLs expire after several hours. The app re-fetches from the backend each time a YouTube item comes up in the playlist.

---

## Playlist Item Types

The `/playlist` endpoint returns an `items` array. Each item has a `type`:

```json
{ "id": "...", "name": "Morning Joke", "type": "image", "url": "/uploads/abc.png" }
{ "id": "...", "name": "Summer Camp", "type": "video", "url": "/uploads/video.mp4" }
{ "id": "...", "name": "Rick Roll", "type": "youtube", "youtubeUrl": "https://www.youtube.com/watch?v=..." }
```

The Android app handles each type differently:
- `image` — downloaded and displayed with Glide
- `video` — downloaded to local cache, played with ExoPlayer from file:// URI
- `youtube` — backend fetches stream URL, ExoPlayer plays the direct URL

---

## Building the Android APK

Requirements: JDK 17+, Android SDK (API 34), `signageServerUrl` set in `gradle.properties`.

```bash
cd receiver-android

# Set your backend URL
echo "signageServerUrl=http://192.168.2.90:3002" > gradle.properties

# Build
JAVA_HOME=/path/to/jdk-17 ./gradlew assembleDebug --no-daemon

# Install
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

---

## Features Built So Far

- [x] Image upload and display (PNG, JPG, WEBP, GIF)
- [x] Video upload and playback (MP4, WEBM, MKV, MOV, AVI)
- [x] YouTube video streaming (paste a URL, it plays directly)
- [x] Device pairing via 6-char code
- [x] Multi-device support (multiple Fire TVs, different playlists)
- [x] Configurable slide duration per device
- [x] Offline image caching
- [x] Wake lock (screen stays on)
- [x] "Quit App" menu option
- [x] Backend API for all management operations

---

## What's Next (Roadmap)

- [ ] Weather widget (OpenWeatherMap integration)
- [ ] Scrolling ticker/marquee bar
- [ ] Content scheduling by time-of-day
- [ ] Google Slides / web page embeds via WebView
- [ ] RSS / news feed support

---

## Troubleshooting

**Device shows "playlist empty":**
- Check the backend is running: `curl http://localhost:3002/api/health`
- Verify the device is paired: `curl http://localhost:3002/api/admin/state`
- Check the device has content assigned in its playlist
- Confirm the app is configured with the correct backend URL

**Videos show black screen on Fire TV:**
- This is a known screencap limitation on Amlogic hardware — the actual TV display shows the video correctly, but `adb exec-out screencap` can't capture hardware-composited frames
- Try the TextureView rendering path if the issue persists on actual display

**YouTube videos won't play:**
- Verify `yt-dlp` is installed: `yt-dlp --version`
- Test the stream endpoint: `curl "http://localhost:3002/api/admin/youtube/stream?url=https://www.youtube.com/watch?v=dQw4w9WgXcQ"`
- Stream URLs expire — they refresh each time the item comes up in the playlist
- Fire TV builds may require JS challenge support in yt-dlp; this backend uses `--js-runtimes node --remote-components ejs:github`

**Fire TV volume control (ADB):**
- Some Fire OS builds do not implement direct volume setters (`media volume`, `cmd audio`), so use keyevents only
- Never run long keyevent loops; use short batches (3-5 key presses), then verify with `dumpsys audio`
- Read current level:
  - `adb shell dumpsys audio | sed -n '/STREAM_MUSIC/,/STREAM_ALARM/p' | sed -n '1,20p'`
- Volume down one step:
  - `adb shell input keyevent 25`
- Volume up one step:
  - `adb shell input keyevent 24`
- Stable operator pattern:
  1. Send a small batch (e.g., 4 presses) with short delay (`sleep 0.25`)
  2. Re-check `STREAM_MUSIC` speaker value
  3. Repeat until target level is reached

**App won't pair:**
- Make sure the pairing code shown on TV is entered within 60 seconds
- Check the Fire TV can reach the backend: `adb shell ping <server-ip>`
