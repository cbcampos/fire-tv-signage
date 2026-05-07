# Fire TV Signage (OpenClaw Skill)

This skill documents how an OpenClaw agent should operate this repo safely and consistently.

Primary playbook:
- `OPENCLAW_AGENT_GUIDE.md` (start here for end-to-end operational instructions)

## Scope

- Backend/API: `backend/server.mjs`
- Admin UI: `backend/public/*`
- CLI: `backend/cli.mjs`
- Receiver app: `receiver-android/*`

## Environment Assumptions

- Primary control host: `192.168.2.90` (OpenClaw machine)
- Backend URL: `http://192.168.2.90:3002`
- Fire TV receiver is paired and polling `/api/receiver/devices/:id/playlist`
- Runtime data lives under backend `data/` directory on host

## Operational Rules

1. Use OpenClaw host as the source of truth for deploy/runtime checks.
2. For frontend-only changes (`backend/public/*`), sync files first, then hard-refresh UI.
3. For API/CLI changes (`server.mjs`, `cli.mjs`), restart backend after sync.
4. Verify health after restart:
   - `curl http://127.0.0.1:3002/api/health`
   - `curl http://192.168.2.90:3002/api/health`
5. Prefer non-destructive cleanup; do not delete devices/playlists unless requested.

## Key Workflows

### 1) Device + Live Control

- Set direct list live:
  - `node cli.mjs live <deviceId> --direct`
- Set named playlist live:
  - `node cli.mjs live <deviceId> --playlist <playlistId>`
- Push one-off override:
  - `node cli.mjs override <deviceId> /path/to/file.png`
- Push existing playlist item as override:
  - `node cli.mjs override-existing <deviceId> --playlist <playlistId> --item <itemId>`
- Push library item as override:
  - `node cli.mjs override-library <deviceId> <libraryItemId>`
- Unified push-item-live command:
  - `node cli.mjs live-item <deviceId> --library <libraryItemId>`
  - `node cli.mjs live-item <deviceId> --playlist <playlistId> --item <itemId>`
- Clear override:
  - `node cli.mjs override-clear <deviceId>`

### 2) Playlist Management

- List playlists:
  - `node cli.mjs playlists list`
- Create:
  - `node cli.mjs playlists create "Morning Playlist"`
- Rename:
  - `node cli.mjs playlists rename <playlistId> --name "Evening Playlist"`
- Delete:
  - `node cli.mjs playlists delete <playlistId>`
- Show items:
  - `node cli.mjs playlists show <playlistId>`
- Add file item:
  - `node cli.mjs playlist-item-add <playlistId> /path/to/image.jpg`
- Add from library:
  - `node cli.mjs playlist-item-add-library <playlistId> <libraryItemId>`
- Copy item from playlist/device:
  - `node cli.mjs playlist-item-copy <targetPlaylistId> --item <itemId> --source-playlist <playlistId>`
  - `node cli.mjs playlist-item-copy <targetPlaylistId> --item <itemId> --source-device <deviceId>`
- Remove playlist item:
  - `node cli.mjs playlist-item-remove <playlistId> <itemId>`

### 3) Library Workflow

- Add library item:
  - `node cli.mjs library add /path/to/file.png --tag menu`
- Add YouTube URL to library:
  - `node cli.mjs library add-youtube "https://youtube.com/watch?v=..." --name "Lobby Stream"`
- Add web URL to library:
  - `node cli.mjs library add-web "https://example.com/dashboard" --name "Ops Dashboard"`
- List/search/remove:
  - `node cli.mjs library list`
  - `node cli.mjs library search menu`
  - `node cli.mjs library remove <libraryItemId>`
- Push from library to direct device playlist:
  - `node cli.mjs push <deviceId> --from-library <libraryItemId>`

Notes:
- Library item types now include `image`, `video`, `youtube`, and `web`.
- For YouTube/Web library items, `push --from-library` sets a live override on the device (instead of uploading a file).

## Deploy Pattern (OpenClaw)

1. Copy changed files to OpenClaw workspace.
2. Restart backend process (`node server.mjs`) on host.
3. Verify `/api/health`.
4. Validate target UX/API behavior from browser + CLI.

## Validation Checklist

- API healthy on port `3002`
- Admin UI loads and preserves form input during polling refresh
- Playlist copy works (playlist->playlist and direct->playlist)
- Library upload and add-to-playlist works
- Live preview matches effective live source (override > active playlist > direct list)

## Fire TV Volume Runbook (ADB)

Use this only when asked to control TV volume remotely.

1. Read current music volume:
   - `adb -s <tv-ip>:5555 shell dumpsys audio | sed -n '/STREAM_MUSIC/,/STREAM_ALARM/p' | sed -n '1,20p'`
2. Apply short, controlled keyevents only:
   - Volume up: `adb -s <tv-ip>:5555 shell input keyevent 24`
   - Volume down: `adb -s <tv-ip>:5555 shell input keyevent 25`
3. Use small batches (3-5 presses max), then re-read `STREAM_MUSIC`.
4. Add a small delay between presses for consistency (`sleep 0.25`).
5. Do **not** run long loops (these can drift/overshoot and become hard to stop cleanly).

Notes:
- On this Fire OS build, `media volume` and `cmd audio` direct setters are not implemented.
- Treat the `STREAM_MUSIC` speaker value as source of truth for confirmation.
