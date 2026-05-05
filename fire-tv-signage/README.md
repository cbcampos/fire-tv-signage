# Fire TV Signage

A self-hosted digital signage system for Amazon Fire TV devices. Push images and videos to one or many Fire TV receivers from a web admin panel. Designed for home use — living room displays, family schedules, kitchen signage.

---

## What it does

- **Push content** (images + videos) to Fire TV receivers from a browser admin panel
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
     +--- WebSocket poll every 5s -------+
```

**Components:**
- **Backend** — Node.js web server (port 3002) serving the admin UI + a REST API for receiver pairing, content management, and playlist delivery
- **Receiver APK** — Android app installed on Fire TV; polls the backend every 5 seconds for playlist changes and displays content full-screen
- **Admin UI** — single-page web app served by the backend at `http://<server>:3002`

---

## Quick Start

### 1. Deploy the backend

```bash
cd fire-tv-signage/backend
npm install
node server.mjs
```

The server runs on **port 3002** by default. Access the admin UI at `http://<your-server-ip>:3002`.

To run on a different port:
```bash
PORT=8080 node server.mjs
```

To persist data in a custom directory:
```bash
SIGNAGE_DATA_DIR=/path/to/data node server.mjs
```

To run as a systemd service, use the provided `signage-backend.service` file.

### 2. Build and install the Android app

Requires Android SDK and JDK 17+:

```bash
cd receiver-android
# If your server is not at the default, update the URL:
# Edit app/build.gradle.kts and change signageServerUrl

./gradlew assembleDebug
```

The APK will be at `receiver-android/app/build/outputs/apk/debug/app-debug.apk`.

Install via ADB:
```bash
adb install -r app-debug.apk
```

Or side-load directly onto your Fire TV.

### 3. Pair a receiver

1. Open the app on the Fire TV — it will show a 6-character pairing code
2. In the admin UI, find the pending pairing code and click **Use**
3. Click **Pair** to register the device
4. Upload images or videos and they will appear on the TV within seconds

---

## Admin UI Reference

**Pairing a new display:**
- The app generates a new 6-character code on first launch
- Codes are pending until paired via the admin UI
- Multiple receivers can be paired to one backend

**Display settings:**
- **Display name** — custom label (e.g., "Kitchen Display")
- **Location** — optional location string (e.g., "Kitchen", "Living Room")
- **Slide delay** — seconds between advancing to the next slide

**Uploading:**
- Drag & drop or click to select multiple images/videos
- Videos are automatically detected by MIME type
- Upload order = display order

**Renaming slides:**
- Click "Edit name" on any slide to rename it inline
- The custom name persists and is stored on the backend

**Deleting:**
- Click "Remove" to delete a slide from the playlist
- Does not delete the source file from disk

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/admin/state` | List all paired devices and pending pairings |
| `POST` | `/api/admin/pair` | Pair a pending receiver (body: `{code, label?}`) |
| `PATCH` | `/api/admin/devices/:id` | Update device label, location, or delay (`{label?, location?, delaySeconds?}`) |
| `DELETE` | `/api/admin/devices/:id` | Remove a device |
| `POST` | `/api/admin/devices/:id/images` | Upload image/video to device (body: `{name, dataUrl}`) |
| `PATCH` | `/api/admin/devices/:id/images/:imageId` | Rename a slide (`{name}`) |
| `DELETE` | `/api/admin/devices/:id/images/:imageId` | Remove a slide |
| `GET` | `/api/receiver/devices/:id/playlist?token=X` | Receiver endpoint: returns playlist for a device |

---

## Receiver App Controls

- **Menu button** — open the status panel (network status, pair status, boot-on-startup, device info)
- **D-pad up/down** — scroll through the menu
- **Back button** — close the menu

---

## Image & Video Behavior

- **Images** — displayed using `FIT_CENTER` scale type; non-16:9 images get black letterboxing (not cropped)
- **Videos** — detected by `.mp4`/`.webm`/`.mkv`/`.mov`/`.avi` URL extension; played via Android `VideoView`; audio supported
- **Offline** — images are cached to the app's internal storage; if the TV loses network, the last-displayed images continue to rotate from cache
- **Cache** — survives app restarts but is cleared on uninstall

---

## File Structure

```
fire-tv-signage/
├── backend/
│   ├── server.mjs          # Node.js backend server
│   ├── package.json
│   ├── public/
│   │   ├── index.html      # Admin UI
│   │   ├── admin.js        # Admin UI logic
│   │   └── app.css         # Admin UI styles
│   ├── data/
│   │   ├── db.json         # Device registry + playlist data
│   │   └── uploads/        # Uploaded image/video files
│   ├── signage-backend.service  # systemd unit
│   └── deploy/
│       └── README.md       # Deployment notes
├── receiver-android/
│   ├── app/
│   │   └── src/main/
│   │       ├── java/com/signage/receiver/
│   │       │   ├── MainActivity.java   # Receiver app logic
│   │       │   └── BootReceiver.java   # Auto-launch on boot
│   │       ├── AndroidManifest.xml
│   │       └── res/                    # Icons, strings, styles
│   ├── build.gradle.kts
│   └── gradlew
├── app-debug.apk           # Pre-built receiver APK
└── README.md
```

---

## Requirements

- **Backend:** Node.js 18+ (no other dependencies)
- **Fire TV:** Fire OS 5+ (Fire TV Stick, Fire TV Cube, etc.)
- **Android SDK:** API 21+ target, JDK 17+ for building
- **Network:** Fire TV and backend server must be on the same LAN

---

## Status Indicators

| Status | Meaning |
|--------|---------|
| 🟢 **Online** | Seen within the last 20 seconds |
| 🟡 **Stale** | Seen 20s–2min ago |
| 🔴 **Offline** | Not seen in over 2 minutes |