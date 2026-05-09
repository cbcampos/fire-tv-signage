# OpenClaw Agent Guide

This is the operator playbook for an OpenClaw agent working on Fire TV Signage.

Use this as the first-stop guide for how the system works, what to do on common requests, and how to deploy safely without breaking live displays.

## 1) System Overview

- Backend/API/UI: `backend/server.mjs` + `backend/public/*`
- Receiver app (Fire TV APK): `receiver-android/*`
- CLI helpers: `backend/cli.mjs`
- Wyze Bridge (working): `ghcr.io/idisposable/docker-wyze-bridge:latest` in host mode
- Runtime backend host: `192.168.2.90`
- Backend base URL: `http://192.168.2.90:3002`
- Fire TV ADB target: `192.168.2.250:5555`
- Wyze bridge API/UI: `http://192.168.2.90:1984` / `http://192.168.2.90:5080`

Data flow:
1. Admin UI or CLI writes playlist/library/device state to backend.
2. Receiver polls `/api/receiver/devices/:id/playlist` every 5s.
3. Receiver switches media based on returned items (`image`, `video`, `youtube`).

## 2) Agent Priorities

When helping the user, prioritize in this order:
1. Keep currently live display stable.
2. Verify with runtime evidence (API state, logcat, device process checks).
3. Make smallest safe change first.
4. Deploy incrementally and re-verify.

## 3) Safe Operating Rules

- Prefer non-destructive operations.
- Do not delete devices/playlists/library items unless the user explicitly asks.
- For YouTube issues, always validate stream extraction before blaming receiver playback.
- For volume control on this Fire OS build, do not use long ADB keyevent loops.
- After receiver APK changes, rebuild + reinstall before validating behavior.

## 4) Fast Triage Commands

Run these first when behavior is unclear:

```bash
# Backend state snapshot
curl -s http://127.0.0.1:3002/api/admin/state

# Receiver playlist payload (replace device/token)
curl -s "http://127.0.0.1:3002/api/receiver/devices/<deviceId>/playlist?token=<token>"

# Receiver process
adb -s 192.168.2.250:5555 shell pidof com.signage.receiver

# Recent crash logs
adb -s 192.168.2.250:5555 logcat -d -b crash -t 120
```

## 5) Common Tasks

### A) Add/Push YouTube

1. Add URL to library or playlist.
2. Validate backend extraction:

```bash
curl -s "http://127.0.0.1:3002/api/admin/youtube/stream?url=<encoded-url>"
```

3. If extraction fails, fix backend/runtime `yt-dlp` path/config first.
4. If extraction succeeds but TV fails, inspect receiver logs for ExoPlayer/runtime errors.

### B) Playlist change should interrupt current playback

Expected behavior: when live playlist changes, receiver should stop current item and switch quickly.

Validation pattern:
1. Push playlist A live.
2. Wait until it starts.
3. Push playlist B live.
4. Confirm transition in `SignageReceiver` logs.

### C) Rebuild + install APK

```bash
cd receiver-android
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
./gradlew assembleDebug
adb -s 192.168.2.250:5555 install -r app/build/outputs/apk/debug/app-debug.apk
adb -s 192.168.2.250:5555 shell am start -n com.signage.receiver/.MainActivity
```

### D) Backend deploy (server/UI)

- UI-only changes: sync files in `backend/public/*`.
- API/CLI changes: sync changed files and restart backend process.
- Always verify:

```bash
curl -s http://127.0.0.1:3002/api/health
curl -s http://192.168.2.90:3002/api/health
```

### E) Wyze single-camera live stream (working path)

Use the maintained fork image only:

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

Quick validation:

```bash
curl -s http://127.0.0.1:5080/api/cameras
ffprobe -v error -rtsp_transport tcp -show_entries stream=codec_name,width,height \
  -of default=noprint_wrappers=1 "rtsp://127.0.0.1:8554/baby_cam"
```

Switch a signage display to a single camera stream:

```bash
node backend/cli.mjs --url "http://192.168.2.90:3002" \
  push <deviceId> --from-wyze "baby_cam" --wyze-bridge "http://192.168.2.90:1984"
```

## 6) Volume Control (Fire OS Reality)

On this device/OS, direct setters are unreliable or unavailable (`media volume`, `cmd audio`).

Use controlled steps:

```bash
adb -s 192.168.2.250:5555 shell dumpsys audio | sed -n '/STREAM_MUSIC/,/STREAM_ALARM/p' | sed -n '1,20p'
adb -s 192.168.2.250:5555 shell input keyevent 24  # up one
adb -s 192.168.2.250:5555 shell input keyevent 25  # down one
```

Rule: 3-5 key presses max, then re-check; repeat. Never fire long unattended loops.

## 7) Mobile Admin UI + iPhone Web App

- Admin UI is mobile-responsive in `backend/public/app.css`.
- Installable on iPhone home screen via:
  - `backend/public/manifest.webmanifest`
  - `backend/public/icon-180.png` (apple touch icon)
  - metadata in `backend/public/index.html`

User path: Safari -> Share -> Add to Home Screen.

## 8) Known Pitfalls

- Receiver crash with missing HLS classes => ensure `media3-exoplayer-hls` is in app deps.
- YouTube stream extraction may require JS challenge support in `yt-dlp`.
- ADB "device offline" issues are common; restart server/connection on host.
- Fire TV blocks manual broadcast simulation of `BOOT_COMPLETED`; validate auto-launch with real reboot.
- If single-camera Wyze stream shows timeouts, verify bridge is running in host mode and use the fork image above.
- If Invoice Ninja is unreachable, confirm invoice-ninja-nginx-1 is publishing 8088:80 and not 8888:80.

## 9) Completion Checklist

Before declaring done:
1. Confirm expected runtime behavior (not just code diff).
2. Re-check backend state aligns with user intent.
3. Confirm receiver app process is running if APK was touched.
4. Summarize exactly what changed and what user should verify on-screen.

## Runtime Port Update
- Invoice Ninja nginx is now on http://192.168.2.90:8088
- Reason: free up 8888 to avoid conflict with camera/bridge workflows
- Validate with: docker ps | grep invoice-ninja-nginx-1
